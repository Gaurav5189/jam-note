package consumer

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/twmb/franz-go/pkg/kgo"
	"search-indexer/config"
	"search-indexer/indexer"
)

// MockCommitter tracks CommitRecords calls.
type MockCommitter struct {
	mu           sync.Mutex
	commitCalls  int
	committedRec []*kgo.Record
	commitErr    error
}

func (m *MockCommitter) CommitRecords(ctx context.Context, rs ...*kgo.Record) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.commitCalls++
	m.committedRec = append(m.committedRec, rs...)
	return m.commitErr
}

// MockSearchForConsumer tests search interactions.
type MockSearchForConsumer struct {
	mu      sync.Mutex
	failErr error
}

func (m *MockSearchForConsumer) EnsureIndex(ctx context.Context) error { return nil }
func (m *MockSearchForConsumer) DeleteByNoteID(ctx context.Context, noteID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.failErr
}
func (m *MockSearchForConsumer) BulkIndexBlocks(ctx context.Context, docs []indexer.NoteDoc) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.failErr
}

type MockMongoForConsumer struct {
	note *indexer.MongoNote
	err  error
}

func (m *MockMongoForConsumer) GetNote(ctx context.Context, noteID string) (*indexer.MongoNote, error) {
	return m.note, m.err
}
func (m *MockMongoForConsumer) Close(ctx context.Context) error { return nil }

func TestProcessRecord_OffsetCommitOnlyAfterSuccess(t *testing.T) {
	cfg := &config.Config{
		RetryInitialInterval: 5 * time.Millisecond,
		RetryMaxInterval:     20 * time.Millisecond,
	}

	mockSearch := &MockSearchForConsumer{}
	mockMongo := &MockMongoForConsumer{
		note: &indexer.MongoNote{
			ID:     "note-1",
			UserID: "user-1",
			Title:  "Success Test",
			Blocks: []indexer.Block{
				{ID: "b1", Type: "text"},
			},
		},
	}
	handler := indexer.NewEventHandler(mockMongo, mockSearch)
	committer := &MockCommitter{}

	c := NewConsumerWithCommitter(cfg, handler, committer)

	event := indexer.EventEnvelope{
		EventID:       "evt-ok",
		EventType:     "note.changed",
		AggregateType: "note",
		AggregateID:   "note-1",
	}
	data, _ := json.Marshal(event)

	record := &kgo.Record{
		Topic:     "jam-note.note-events.v1",
		Partition: 0,
		Offset:    101,
		Key:       []byte("note-1"),
		Value:     data,
	}

	err := c.ProcessRecord(context.Background(), record)
	if err != nil {
		t.Fatalf("expected nil error on success, got: %v", err)
	}

	// Verify offset commit was called exactly once for this record
	committer.mu.Lock()
	defer committer.mu.Unlock()
	if committer.commitCalls != 1 {
		t.Errorf("expected exactly 1 commit call, got %d", committer.commitCalls)
	}
	if len(committer.committedRec) != 1 || committer.committedRec[0].Offset != 101 {
		t.Errorf("expected offset 101 committed, got %v", committer.committedRec)
	}
}

func TestProcessRecord_NoCommitOnFailure(t *testing.T) {
	cfg := &config.Config{
		RetryInitialInterval: 10 * time.Millisecond,
		RetryMaxInterval:     20 * time.Millisecond,
	}

	// OpenSearch fails persistently
	mockSearch := &MockSearchForConsumer{failErr: errors.New("opensearch down")}
	mockMongo := &MockMongoForConsumer{}
	handler := indexer.NewEventHandler(mockMongo, mockSearch)
	committer := &MockCommitter{}

	c := NewConsumerWithCommitter(cfg, handler, committer)

	event := indexer.EventEnvelope{
		EventID:       "evt-fail",
		EventType:     "note.deleted",
		AggregateType: "note",
		AggregateID:   "note-1",
	}
	data, _ := json.Marshal(event)

	record := &kgo.Record{
		Topic:     "jam-note.note-events.v1",
		Partition: 0,
		Offset:    202,
		Key:       []byte("note-1"),
		Value:     data,
	}

	// Cancel context after 35ms to simulate SIGTERM during retry loop
	ctx, cancel := context.WithTimeout(context.Background(), 35*time.Millisecond)
	defer cancel()

	err := c.ProcessRecord(ctx, record)
	if !errors.Is(err, context.DeadlineExceeded) && !errors.Is(err, context.Canceled) {
		t.Fatalf("expected context error on timeout, got %v", err)
	}

	// Verify offset commit was NEVER called for the failing record
	committer.mu.Lock()
	defer committer.mu.Unlock()
	if committer.commitCalls != 0 {
		t.Errorf("expected 0 commit calls on failure, got %d", committer.commitCalls)
	}
}

func TestProcessRecord_CommitAfterTransientRetrySuccess(t *testing.T) {
	cfg := &config.Config{
		RetryInitialInterval: 5 * time.Millisecond,
		RetryMaxInterval:     20 * time.Millisecond,
	}

	var attempts atomic.Int32
	mockSearch := &MockSearchForConsumer{}
	mockMongo := &MockMongoForConsumer{}

	// Wrap SearchClient so first 2 attempts fail, 3rd succeeds
	retrySearch := &flakySearch{
		SearchClient: mockSearch,
		failCount:    2,
		attempts:     &attempts,
	}

	handler := indexer.NewEventHandler(mockMongo, retrySearch)
	committer := &MockCommitter{}

	c := NewConsumerWithCommitter(cfg, handler, committer)

	event := indexer.EventEnvelope{
		EventID:       "evt-flaky",
		EventType:     "note.deleted",
		AggregateType: "note",
		AggregateID:   "note-99",
	}
	data, _ := json.Marshal(event)

	record := &kgo.Record{
		Topic:     "jam-note.note-events.v1",
		Partition: 0,
		Offset:    303,
		Key:       []byte("note-99"),
		Value:     data,
	}

	err := c.ProcessRecord(context.Background(), record)
	if err != nil {
		t.Fatalf("expected eventual success, got %v", err)
	}

	if attempts.Load() < 3 {
		t.Errorf("expected at least 3 attempts, got %d", attempts.Load())
	}

	committer.mu.Lock()
	defer committer.mu.Unlock()
	if committer.commitCalls != 1 {
		t.Errorf("expected commit to be called once upon success, got %d", committer.commitCalls)
	}
	if committer.committedRec[0].Offset != 303 {
		t.Errorf("expected offset 303 committed, got %d", committer.committedRec[0].Offset)
	}
}

type flakySearch struct {
	indexer.SearchClient
	failCount int32
	attempts  *atomic.Int32
}

func (f *flakySearch) DeleteByNoteID(ctx context.Context, noteID string) error {
	att := f.attempts.Add(1)
	if att <= f.failCount {
		return errors.New("transient opensearch network hiccup")
	}
	return nil
}

func TestProcessRecord_GracefulSIGTERMDrain(t *testing.T) {
	cfg := &config.Config{
		RetryInitialInterval: 50 * time.Millisecond,
		RetryMaxInterval:     100 * time.Millisecond,
	}

	mockSearch := &MockSearchForConsumer{failErr: errors.New("persistent error")}
	mockMongo := &MockMongoForConsumer{}
	handler := indexer.NewEventHandler(mockMongo, mockSearch)
	committer := &MockCommitter{}

	c := NewConsumerWithCommitter(cfg, handler, committer)

	ctx, cancel := context.WithCancel(context.Background())

	record := &kgo.Record{
		Topic:     "jam-note.note-events.v1",
		Partition: 0,
		Offset:    404,
		Value:     []byte(`{"event_type":"note.deleted","aggregate_id":"note-x"}`),
	}

	done := make(chan error, 1)
	go func() {
		done <- c.ProcessRecord(ctx, record)
	}()

	// Simulate SIGTERM signal after 20ms
	time.Sleep(20 * time.Millisecond)
	cancel()

	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) {
			t.Errorf("expected context.Canceled on SIGTERM drain, got: %v", err)
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatalf("ProcessRecord did not drain gracefully within 500ms")
	}

	committer.mu.Lock()
	defer committer.mu.Unlock()
	if committer.commitCalls != 0 {
		t.Errorf("offset must NOT be committed on canceled drain, got %d calls", committer.commitCalls)
	}
}
