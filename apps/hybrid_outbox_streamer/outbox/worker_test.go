package outbox_test

import (
	"sync/atomic"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"hybrid_outbox_streamer/outbox"
)

// TestWorkerPoolGracefulDrain tests that Stop() drains all enqueued candidates before shutting down.
func TestWorkerPoolGracefulDrain(t *testing.T) {
	store := NewMockStore()
	producer := NewMockProducer()
	pub := outbox.NewPublisher(store, producer, 30*time.Second, 1)

	// Prepopulate 10 records
	totalEvents := 10
	for i := 0; i < totalEvents; i++ {
		eventID := bson.NewObjectID().Hex()
		store.AddRecord(&outbox.OutboxRecord{
			EventID:       eventID,
			EventType:     "note.changed",
			SchemaVersion: 1,
			AggregateType: "note",
			AggregateID:   "note-" + eventID,
			UserID:        "user-1",
			Status:        outbox.StatusPending,
			AvailableAt:   time.Now().Add(-1 * time.Minute),
		})
	}

	wp := outbox.NewWorkerPool(pub, 2, 20)

	var enqueuedCount int32
	for eventID := range store.records {
		if wp.Enqueue(outbox.Candidate{EventID: eventID}) {
			atomic.AddInt32(&enqueuedCount, 1)
		}
	}

	if int(enqueuedCount) != totalEvents {
		t.Fatalf("expected %d enqueued, got %d", totalEvents, enqueuedCount)
	}

	// Trigger graceful stop and wait for drain
	wp.Stop(5 * time.Second)

	// Verify all events were processed and published to mock producer
	if producer.Count() != totalEvents {
		t.Fatalf("expected %d messages published after drain, got %d", totalEvents, producer.Count())
	}
}
