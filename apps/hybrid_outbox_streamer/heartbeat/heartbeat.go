package heartbeat

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"hybrid_outbox_streamer/kafka"
)

// Event is the operational heartbeat JSON payload.
type Event struct {
	EventType string    `json:"event_type"`
	Source    string    `json:"source"`
	Timestamp time.Time `json:"timestamp"`
}

// Runner sends periodic heartbeat events to keep cloud Kafka clusters alive.
type Runner struct {
	producer    kafka.Producer
	interval    time.Duration
	retryDelays []time.Duration
}

// NewRunner initializes a new Heartbeat Runner.
func NewRunner(producer kafka.Producer, interval time.Duration, retryDelays []time.Duration) *Runner {
	if len(retryDelays) == 0 {
		retryDelays = []time.Duration{
			1 * time.Minute,
			5 * time.Minute,
			15 * time.Minute,
		}
	}
	return &Runner{
		producer:    producer,
		interval:    interval,
		retryDelays: retryDelays,
	}
}

// SendOnce sends a single operational heartbeat message.
func (r *Runner) SendOnce(ctx context.Context) error {
	event := Event{
		EventType: "system.heartbeat",
		Source:    "jam-note-outbox-streamer",
		Timestamp: time.Now().UTC(),
	}

	data, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("marshaling heartbeat: %w", err)
	}

	key := []byte("system.heartbeat")
	return r.producer.Produce(ctx, key, data)
}

// SendWithStartupRetry attempts to send the startup heartbeat, retrying with backoff if needed.
func (r *Runner) SendWithStartupRetry(ctx context.Context) error {
	err := r.SendOnce(ctx)
	if err == nil {
		log.Printf("[heartbeat] startup heartbeat successfully published")
		return nil
	}

	log.Printf("[heartbeat] initial startup heartbeat failed: %v, starting retries", err)

	for i, delay := range r.retryDelays {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(delay):
		}

		err = r.SendOnce(ctx)
		if err == nil {
			log.Printf("[heartbeat] startup heartbeat retry %d/%d succeeded", i+1, len(r.retryDelays))
			return nil
		}
		log.Printf("[heartbeat] startup heartbeat retry %d/%d failed: %v", i+1, len(r.retryDelays), err)
	}

	return fmt.Errorf("all startup heartbeat retries failed: %w", err)
}

// Start manages the full lifecycle of heartbeats (startup + periodic).
func (r *Runner) Start(ctx context.Context) {
	if err := r.SendWithStartupRetry(ctx); err != nil {
		log.Printf("[heartbeat] warning: startup heartbeat could not be published: %v. Periodic loop will continue", err)
	}

	ticker := time.NewTicker(r.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := r.SendOnce(ctx); err != nil {
				log.Printf("[heartbeat] periodic heartbeat failed: %v", err)
			} else {
				log.Printf("[heartbeat] periodic heartbeat successfully published")
			}
		}
	}
}
