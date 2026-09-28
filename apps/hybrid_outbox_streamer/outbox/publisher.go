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
	store              Store
	producer           kafka.Producer
	leaseDuration      time.Duration
	maxRetries         int
	maxPublishAttempts int
	retryBaseDelay     time.Duration
}

// NewPublisher constructs a new Publisher.
//
// maxRetries is the in-process produce retry count (fast backoff loop);
// maxPublishAttempts is the total claim budget — once a record has been
// claimed that many times without publishing, it is dead-lettered as
// failed. Below the budget, failed publishes are returned to pending with
// a scheduled available_at so reconciliation retries them.
func NewPublisher(store Store, producer kafka.Producer, leaseDuration time.Duration, maxRetries int, maxPublishAttempts int) *Publisher {
	return &Publisher{
		store:              store,
		producer:           producer,
		leaseDuration:      leaseDuration,
		maxRetries:         maxRetries,
		maxPublishAttempts: maxPublishAttempts,
		retryBaseDelay:     100 * time.Millisecond,
	}
}

// SetRetryBaseDelay configures retry backoff (useful for testing).
func (p *Publisher) SetRetryBaseDelay(d time.Duration) {
	p.retryBaseDelay = d
}

// scheduledRetryDelay computes the delay before a failed publish is
// re-offered to reconciliation: exponential from scheduledRetryBase,
// doubling per attempt and capped at scheduledRetryMax so a wedged broker
// cannot stall recovery indefinitely.
func scheduledRetryDelay(attempts int) time.Duration {
	d := scheduledRetryBase
	for i := 1; i < attempts; i++ {
		d *= 2
		if d >= scheduledRetryMax {
			return scheduledRetryMax
		}
	}
	return d
}

const (
	// scheduledRetryBase starts the backoff schedule for out-of-process
	// retries; the first scheduled retry waits this long after the
	// in-process produce retries (sub-second) have been exhausted.
	scheduledRetryBase = 30 * time.Second
	// scheduledRetryMax caps any single scheduled retry delay.
	scheduledRetryMax = 15 * time.Minute
)

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
		// Retryable: return the record to pending with a scheduled backoff so
		// the reconcile poller re-offers it once available_at is due. A short
		// broker blip must not dead-letter the event (ARCHITECTURE §6 rule 4:
		// reconciliation covers pending, expired publishing, and replayable
		// failed records).
		if rec.Attempts < p.maxPublishAttempts {
			delay := scheduledRetryDelay(rec.Attempts)
			availableAt := time.Now().UTC().Add(delay)
			retryErr := p.store.MarkRetry(ctx, rec.EventID, rec.ClaimedAt, availableAt, pubErr.Error())
			if retryErr != nil {
				// The store write failed; the record is still claimed by us
				// (status=publishing), so lease expiry re-offers it. Never
				// fall through to MarkFailed below — it filters only on
				// event_id, so it could dead-letter a record that still has
				// retry budget, or overwrite one another worker has
				// reclaimed or already published.
				log.Printf("[publisher] failed to mark event %s for retry: %v", rec.EventID, retryErr)
				return fmt.Errorf("scheduling retry for event %s: %w (publish error: %v)", rec.EventID, retryErr, pubErr)
			}
			return fmt.Errorf("publishing to kafka failed (attempt %d); scheduled retry in %v: %w",
				rec.Attempts, delay, pubErr)
		}

		// Permanent failure: retry budget exhausted. Mark failed in DB (dead letter store).
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
	mu        sync.RWMutex
	closed    bool
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
//
// The send happens under the read lock while `closed` is false, so it can
// never race Stop's close(wp.queue): a watcher/poller goroutine that is still
// draining its candidate list after root-context cancellation cannot panic
// by sending on the closed channel. If the queue is full the send blocks
// here — workers keep draining, so this always resolves.
func (wp *WorkerPool) Enqueue(cand Candidate) bool {
	wp.mu.RLock()
	defer wp.mu.RUnlock()
	if wp.closed {
		return false
	}
	select {
	case <-wp.ctx.Done():
		return false
	case wp.queue <- cand:
		return true
	}
}

// Stop initiates graceful worker shutdown and drains remaining queued items up to timeout.
func (wp *WorkerPool) Stop(timeout time.Duration) {
	// Close input channel to signal workers no more tasks will be enqueued.
	// The write lock guarantees no Enqueue is mid-send; the closed flag makes
	// Enqueue a safe no-op for goroutines that outlive the close.
	wp.mu.Lock()
	if wp.closed {
		// Already stopped — closing the channel again would panic.
		wp.mu.Unlock()
		return
	}
	wp.closed = true
	close(wp.queue)
	wp.mu.Unlock()

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
