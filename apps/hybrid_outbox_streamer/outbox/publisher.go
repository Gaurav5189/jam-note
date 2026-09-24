package outbox

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"hybrid_outbox_streamer/kafka"
)

// Candidate represents an outbox event candidate to be claimed and published.
type Candidate struct {
	EventID     string
	ResumeToken bson.Raw // Non-nil if received via Change Stream
}

// Publisher coordinates atomic claiming, serialization, Kafka publishing, and MongoDB status updates.
type Publisher struct {
	store          Store
	producer       kafka.Producer
	leaseDuration  time.Duration
	maxRetries     int
	retryBaseDelay time.Duration
}

// NewPublisher constructs a new Publisher.
func NewPublisher(store Store, producer kafka.Producer, leaseDuration time.Duration, maxRetries int) *Publisher {
	return &Publisher{
		store:          store,
		producer:       producer,
		leaseDuration:  leaseDuration,
		maxRetries:     maxRetries,
		retryBaseDelay: 100 * time.Millisecond,
	}
}

// SetRetryBaseDelay configures retry backoff (useful for testing).
func (p *Publisher) SetRetryBaseDelay(d time.Duration) {
	p.retryBaseDelay = d
}

// ProcessCandidate executes the full atomic claim -> publish -> acknowledge flow for one candidate.
func (p *Publisher) ProcessCandidate(ctx context.Context, cand Candidate) error {
	// 1. Atomic claim via FindOneAndUpdate.
	rec, err := p.store.Claim(ctx, cand.EventID, p.leaseDuration)
	if err != nil {
		return fmt.Errorf("claiming event %s: %w", cand.EventID, err)
	}
	if rec == nil {
		// Event was already claimed by another publisher worker or already completed.
		// Duplicate delivery is completely safe and ignored.
		return nil
	}

	// 2. Build the clean Kafka envelope (no control fields!).
	clean := CleanEnvelope{
		EventID:       rec.EventID,
		EventType:     rec.EventType,
		SchemaVersion: rec.SchemaVersion,
		AggregateType: rec.AggregateType,
		AggregateID:   rec.AggregateID,
		UserID:        rec.UserID,
		Payload:       rec.Payload,
		CreatedAt:     rec.CreatedAt,
	}

	data, err := json.Marshal(clean)
	if err != nil {
		failErr := p.store.MarkFailed(ctx, rec.EventID, time.Now().UTC(), fmt.Sprintf("json serialization error: %v", err))
		if failErr != nil {
			log.Printf("[publisher] failed to mark event %s as failed: %v", rec.EventID, failErr)
		}
		return fmt.Errorf("serializing clean envelope: %w", err)
	}

	// 3. Publish to Kafka with key = aggregate_id and transient retry with backoff.
	key := []byte(rec.AggregateID)
	var pubErr error
	delay := p.retryBaseDelay

	for attempt := 0; attempt <= p.maxRetries; attempt++ {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(delay):
				delay *= 2
			}
		}

		pubErr = p.producer.Produce(ctx, key, data)
		if pubErr == nil {
			break
		}
		log.Printf("[publisher] produce attempt %d failed for event %s: %v", attempt+1, rec.EventID, pubErr)
	}

	// 4. Handle publish outcome.
	if pubErr != nil {
		// Permanent failure: retries exhausted. Mark failed in DB (dead letter store).
		markErr := p.store.MarkFailed(ctx, rec.EventID, time.Now().UTC(), pubErr.Error())
		if markErr != nil {
			log.Printf("[publisher] failed to mark event %s as failed in store: %v", rec.EventID, markErr)
		}
		return fmt.Errorf("publishing to kafka after %d retries: %w", p.maxRetries+1, pubErr)
	}

	// 5. Success: mark published in MongoDB.
	now := time.Now().UTC()
	if err := p.store.MarkPublished(ctx, rec.EventID, now); err != nil {
		log.Printf("[publisher] warning: kafka acked but store MarkPublished failed for %s: %v", rec.EventID, err)
		return fmt.Errorf("marking published in store: %w", err)
	}

	// 6. If this was a fast-path Change Stream event, advance and persist the resume token.
	if len(cand.ResumeToken) > 0 {
		if err := p.store.SaveResumeToken(ctx, cand.ResumeToken); err != nil {
			log.Printf("[publisher] warning: failed to save resume token for %s: %v", rec.EventID, err)
		}
	}

	return nil
}

// WorkerPool manages asynchronous processing of Candidates.
type WorkerPool struct {
	publisher *Publisher
	queue     chan Candidate
	wg        sync.WaitGroup
	ctx       context.Context
	cancel    context.CancelFunc
}

// NewWorkerPool initializes and starts workers reading from an internal channel.
func NewWorkerPool(publisher *Publisher, numWorkers int, bufferSize int) *WorkerPool {
	ctx, cancel := context.WithCancel(context.Background())
	wp := &WorkerPool{
		publisher: publisher,
		queue:     make(chan Candidate, bufferSize),
		ctx:       ctx,
		cancel:    cancel,
	}

	for i := 0; i < numWorkers; i++ {
		wp.wg.Add(1)
		go func(workerID int) {
			defer wp.wg.Done()
			for {
				select {
				case <-wp.ctx.Done():
					return
				case cand, ok := <-wp.queue:
					if !ok {
						return
					}
					if err := wp.publisher.ProcessCandidate(wp.ctx, cand); err != nil {
						log.Printf("[worker-%d] error processing candidate %s: %v", workerID, cand.EventID, err)
					}
				}
			}
		}(i)
	}

	return wp
}

// Enqueue sends a candidate to the worker queue, dropping or blocking safely if context canceled.
func (wp *WorkerPool) Enqueue(cand Candidate) bool {
	select {
	case <-wp.ctx.Done():
		return false
	case wp.queue <- cand:
		return true
	}
}

// Stop initiates graceful worker shutdown and drains remaining queued items up to timeout.
func (wp *WorkerPool) Stop(timeout time.Duration) {
	// Close input channel to signal workers no more tasks will be enqueued
	close(wp.queue)

	// Wait for workers to finish current & queued jobs or timeout
	done := make(chan struct{})
	go func() {
		wp.wg.Wait()
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(timeout):
		// Drain timeout exceeded, force cancel context
		wp.cancel()
		<-done
	}
}
