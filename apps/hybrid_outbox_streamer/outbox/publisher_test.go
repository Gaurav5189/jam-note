package outbox_test

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"hybrid_outbox_streamer/outbox"
)

// MockStore implements outbox.Store in-memory for testing.
type MockStore struct {
	mu          sync.Mutex
	records     map[string]*outbox.OutboxRecord
	resumeToken bson.Raw
	claims      int
	publishes   int
	failures    int
	failMarkPub bool
}

func NewMockStore() *MockStore {
	return &MockStore{
		records: make(map[string]*outbox.OutboxRecord),
	}
}

func (m *MockStore) AddRecord(rec *outbox.OutboxRecord) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.records[rec.EventID] = rec
}

func (m *MockStore) Claim(ctx context.Context, eventID string, leaseDuration time.Duration) (*outbox.OutboxRecord, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.claims++

	rec, ok := m.records[eventID]
	if !ok {
		return nil, nil
	}

	now := time.Now().UTC()
	isPending := rec.Status == outbox.StatusPending
	isExpired := rec.Status == outbox.StatusPublishing && rec.ClaimedAt != nil && rec.ClaimedAt.Before(now.Add(-leaseDuration))

	if !isPending && !isExpired {
		return nil, nil // Already claimed or published
	}

	rec.Status = outbox.StatusPublishing
	rec.ClaimedAt = &now
	rec.Attempts++
	return rec, nil
}

func (m *MockStore) MarkPublished(ctx context.Context, eventID string, publishedAt time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.failMarkPub {
		return errors.New("simulated crash before mark published")
	}
	rec, ok := m.records[eventID]
	if !ok {
		return errors.New("not found")
	}
	rec.Status = outbox.StatusPublished
	rec.PublishedAt = &publishedAt
	rec.ClaimedAt = nil
	m.publishes++
	return nil
}

func (m *MockStore) MarkFailed(ctx context.Context, eventID string, failedAt time.Time, reason string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	rec, ok := m.records[eventID]
	if !ok {
		return errors.New("not found")
	}
	rec.Status = outbox.StatusFailed
	rec.FailedAt = &failedAt
	rec.ErrorReason = &reason
	rec.ClaimedAt = nil
	m.failures++
	return nil
}

func (m *MockStore) GetReconcileCandidates(ctx context.Context, leaseDuration time.Duration, limit int64) ([]*outbox.OutboxRecord, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	now := time.Now().UTC()
	var res []*outbox.OutboxRecord
	for _, rec := range m.records {
		if rec.Status == outbox.StatusPending && !rec.AvailableAt.After(now) {
			res = append(res, rec)
		} else if rec.Status == outbox.StatusPublishing && rec.ClaimedAt != nil && rec.ClaimedAt.Before(now.Add(-leaseDuration)) {
			res = append(res, rec)
		}
		if int64(len(res)) >= limit {
			break
		}
	}
	return res, nil
}

func (m *MockStore) ReplayFailed(ctx context.Context) (int64, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	now := time.Now().UTC()
	var count int64
	for _, rec := range m.records {
		if rec.Status == outbox.StatusFailed {
			rec.Status = outbox.StatusPending
			rec.Attempts = 0
			rec.AvailableAt = now
			rec.FailedAt = nil
			rec.ErrorReason = nil
			count++
		}
	}
	return count, nil
}

func (m *MockStore) GetResumeToken(ctx context.Context) (bson.Raw, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.resumeToken, nil
}

func (m *MockStore) SaveResumeToken(ctx context.Context, token bson.Raw) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.resumeToken = token
	return nil
}

func (m *MockStore) ResetResumeToken(ctx context.Context) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.resumeToken = nil
	return nil
}

func (m *MockStore) Close(ctx context.Context) error {
	return nil
}

// MockProducer records published Kafka messages.
type MockProducer struct {
	mu           sync.Mutex
	messages     []PublishedMessage
	failAttempts int
	produceErr   error
}

type PublishedMessage struct {
	Key   string
	Value []byte
}

func NewMockProducer() *MockProducer {
	return &MockProducer{}
}

func (p *MockProducer) Produce(ctx context.Context, key, value []byte) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.failAttempts > 0 {
		p.failAttempts--
		return p.produceErr
	}
	if p.produceErr != nil && p.failAttempts == -1 {
		return p.produceErr // permanent failure
	}
	p.messages = append(p.messages, PublishedMessage{
		Key:   string(key),
		Value: value,
	})
	return nil
}

func (p *MockProducer) Close() {}

func (p *MockProducer) Count() int {
	p.mu.Lock()
	defer p.mu.Unlock()
	return len(p.messages)
}

// TestDuplicateChangeStreamAndReconcileCandidates ensures that if both the Change Stream
// and the Reconciliation poller see the same event, only ONE worker claims and publishes it.
func TestDuplicateChangeStreamAndReconcileCandidates(t *testing.T) {
	store := NewMockStore()
	producer := NewMockProducer()
	pub := outbox.NewPublisher(store, producer, 30*time.Second, 3)

	eventID := "evt-123"
	aggregateID := "note-456"
	store.AddRecord(&outbox.OutboxRecord{
		EventID:       eventID,
		EventType:     "note.changed",
		SchemaVersion: 1,
		AggregateType: "note",
		AggregateID:   aggregateID,
		UserID:        "user-789",
		Payload:       bson.M{"changed_fields": []string{"title"}},
		Status:        outbox.StatusPending,
		AvailableAt:   time.Now().Add(-1 * time.Minute),
		CreatedAt:     time.Now().Add(-1 * time.Minute),
	})

	ctx := context.Background()

	// Dispatch candidate 1 (e.g. from Change Stream)
	err1 := pub.ProcessCandidate(ctx, outbox.Candidate{EventID: eventID})
	if err1 != nil {
		t.Fatalf("first process failed: %v", err1)
	}

	// Dispatch candidate 2 (e.g. from Reconcile poller)
	err2 := pub.ProcessCandidate(ctx, outbox.Candidate{EventID: eventID})
	if err2 != nil {
		t.Fatalf("second process failed: %v", err2)
	}

	// Producer must have received exactly 1 message
	if producer.Count() != 1 {
		t.Fatalf("expected exactly 1 kafka message, got %d", producer.Count())
	}

	// Verify the message key is aggregate_id
	msg := producer.messages[0]
	if msg.Key != aggregateID {
		t.Errorf("expected kafka key %q, got %q", aggregateID, msg.Key)
	}

	// Verify clean envelope has NO control fields
	var raw map[string]any
	if err := json.Unmarshal(msg.Value, &raw); err != nil {
		t.Fatalf("unmarshal error: %v", err)
	}

	controlFields := []string{"status", "attempts", "available_at", "claimed_at", "published_at", "failed_at", "error_reason"}
	for _, field := range controlFields {
		if _, exists := raw[field]; exists {
			t.Errorf("clean envelope leaked internal control field: %s", field)
		}
	}
}

// TestCrashAfterKafkaAckBeforeMongoStatusUpdate tests that if a crash occurs after Kafka publish
// but before MongoDB update, the expired lease is eventually reclaimed.
func TestCrashAfterKafkaAckBeforeMongoStatusUpdate(t *testing.T) {
	store := NewMockStore()
	producer := NewMockProducer()
	leaseDuration := 50 * time.Millisecond
	pub := outbox.NewPublisher(store, producer, leaseDuration, 1)
	pub.SetRetryBaseDelay(1 * time.Millisecond)

	eventID := "evt-crash-1"
	store.AddRecord(&outbox.OutboxRecord{
		EventID:       eventID,
		EventType:     "note.changed",
		SchemaVersion: 1,
		AggregateType: "note",
		AggregateID:   "note-crash-1",
		UserID:        "user-1",
		Status:        outbox.StatusPending,
		AvailableAt:   time.Now().Add(-1 * time.Minute),
	})

	// Simulate crash during MarkPublished
	store.failMarkPub = true
	ctx := context.Background()

	err := pub.ProcessCandidate(ctx, outbox.Candidate{EventID: eventID})
	if err == nil {
		t.Fatal("expected error due to simulated store crash")
	}

	// Record is still StatusPublishing with a ClaimedAt timestamp
	rec := store.records[eventID]
	if rec.Status != outbox.StatusPublishing {
		t.Fatalf("expected status %s, got %s", outbox.StatusPublishing, rec.Status)
	}
	if rec.Attempts != 1 {
		t.Fatalf("expected attempts 1, got %d", rec.Attempts)
	}

	// Advance past lease duration
	time.Sleep(leaseDuration + 10*time.Millisecond)

	// Now fix the store
	store.failMarkPub = false

	// Reconcile or candidate processing retries the event
	err = pub.ProcessCandidate(ctx, outbox.Candidate{EventID: eventID})
	if err != nil {
		t.Fatalf("retry after lease expiration failed: %v", err)
	}

	if rec.Status != outbox.StatusPublished {
		t.Fatalf("expected status %s, got %s", outbox.StatusPublished, rec.Status)
	}
	if rec.Attempts != 2 {
		t.Fatalf("expected attempts 2 after reclaim, got %d", rec.Attempts)
	}
}

// TestKafkaOutageRetryAndPermanentFailure tests transient retry and failure marking.
func TestKafkaOutageRetryAndPermanentFailure(t *testing.T) {
	store := NewMockStore()
	producer := NewMockProducer()
	producer.produceErr = errors.New("kafka broker unavailable (connection refused)")
	producer.failAttempts = -1 // all fail

	pub := outbox.NewPublisher(store, producer, 30*time.Second, 2) // 2 retries (total 3 attempts)
	pub.SetRetryBaseDelay(2 * time.Millisecond)

	eventID := "evt-outage-1"
	store.AddRecord(&outbox.OutboxRecord{
		EventID:       eventID,
		EventType:     "note.changed",
		SchemaVersion: 1,
		AggregateType: "note",
		AggregateID:   "note-outage-1",
		UserID:        "user-1",
		Status:        outbox.StatusPending,
		AvailableAt:   time.Now().Add(-1 * time.Minute),
	})

	ctx := context.Background()
	err := pub.ProcessCandidate(ctx, outbox.Candidate{EventID: eventID})
	if err == nil {
		t.Fatal("expected error from kafka outage")
	}

	// Verify record was marked failed with error reason
	rec := store.records[eventID]
	if rec.Status != outbox.StatusFailed {
		t.Fatalf("expected status %s, got %s", outbox.StatusFailed, rec.Status)
	}
	if rec.FailedAt == nil {
		t.Fatal("expected FailedAt timestamp to be set")
	}
	if rec.ErrorReason == nil || *rec.ErrorReason == "" {
		t.Fatal("expected ErrorReason to be set")
	}
}

// TestFailedEventReplay verifies that failed events can be reset to pending.
func TestFailedEventReplay(t *testing.T) {
	store := NewMockStore()
	now := time.Now().UTC()
	errReason := "timeout"
	store.AddRecord(&outbox.OutboxRecord{
		EventID:     "failed-1",
		Status:      outbox.StatusFailed,
		Attempts:    3,
		FailedAt:    &now,
		ErrorReason: &errReason,
	})

	count, err := store.ReplayFailed(context.Background())
	if err != nil {
		t.Fatalf("ReplayFailed returned error: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected 1 record replayed, got %d", count)
	}

	rec := store.records["failed-1"]
	if rec.Status != outbox.StatusPending {
		t.Fatalf("expected status %s, got %s", outbox.StatusPending, rec.Status)
	}
	if rec.Attempts != 0 {
		t.Fatalf("expected attempts reset to 0, got %d", rec.Attempts)
	}
	if rec.FailedAt != nil || rec.ErrorReason != nil {
		t.Fatal("expected FailedAt and ErrorReason to be nil")
	}
}
