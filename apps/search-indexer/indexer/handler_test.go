package indexer

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"testing"
	"time"
)

// MockSearchClient implements SearchClient for unit tests.
type MockSearchClient struct {
	mu           sync.Mutex
	ensureCalls  int
	deletedNotes []string
	bulkDocs     [][]NoteDoc

	ensureErr error
	deleteErr error
	bulkErr   error
}

func (m *MockSearchClient) EnsureIndex(ctx context.Context) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.ensureCalls++
	return m.ensureErr
}

func (m *MockSearchClient) DeleteByNoteID(ctx context.Context, noteID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.deletedNotes = append(m.deletedNotes, noteID)
	return m.deleteErr
}

func (m *MockSearchClient) BulkIndexBlocks(ctx context.Context, docs []NoteDoc) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.bulkDocs = append(m.bulkDocs, docs)
	return m.bulkErr
}

// MockNoteReader implements NoteReader for unit tests.
type MockNoteReader struct {
	mu       sync.Mutex
	notes    map[string]*MongoNote
	readErr  error
	getCalls []string
}

func (m *MockNoteReader) GetNote(ctx context.Context, noteID string) (*MongoNote, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.getCalls = append(m.getCalls, noteID)
	if m.readErr != nil {
		return nil, m.readErr
	}
	note, ok := m.notes[noteID]
	if !ok {
		return nil, nil // not found
	}
	return note, nil
}

func (m *MockNoteReader) Close(ctx context.Context) error {
	return nil
}

func ptrString(s string) *string {
	return &s
}

func TestHandleEvent_SkipHeartbeat(t *testing.T) {
	mockSearch := &MockSearchClient{}
	mockMongo := &MockNoteReader{}
	handler := NewEventHandler(mockMongo, mockSearch)

	hbEvent := map[string]any{
		"event_type": "system.heartbeat",
		"source":     "jam-note-outbox-streamer",
		"timestamp":  time.Now().UTC(),
	}
	data, err := json.Marshal(hbEvent)
	if err != nil {
		t.Fatalf("marshaling heartbeat: %v", err)
	}

	err = handler.HandleEvent(context.Background(), data)
	if err != nil {
		t.Fatalf("expected nil error on heartbeat, got %v", err)
	}

	if len(mockMongo.getCalls) != 0 {
		t.Errorf("expected 0 mongo calls for heartbeat, got %d", len(mockMongo.getCalls))
	}
	if len(mockSearch.deletedNotes) != 0 {
		t.Errorf("expected 0 delete calls for heartbeat, got %d", len(mockSearch.deletedNotes))
	}
	if len(mockSearch.bulkDocs) != 0 {
		t.Errorf("expected 0 bulk calls for heartbeat, got %d", len(mockSearch.bulkDocs))
	}
}

func TestHandleEvent_NoteDeleted(t *testing.T) {
	mockSearch := &MockSearchClient{}
	mockMongo := &MockNoteReader{}
	handler := NewEventHandler(mockMongo, mockSearch)

	event := EventEnvelope{
		EventID:       "evt-123",
		EventType:     "note.deleted",
		SchemaVersion: 1,
		AggregateType: "note",
		AggregateID:   "note-abc",
		UserID:        "user-xyz",
	}
	data, err := json.Marshal(event)
	if err != nil {
		t.Fatalf("marshaling event: %v", err)
	}

	err = handler.HandleEvent(context.Background(), data)
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}

	if len(mockSearch.deletedNotes) != 1 || mockSearch.deletedNotes[0] != "note-abc" {
		t.Fatalf("expected DeleteByNoteID('note-abc'), got %v", mockSearch.deletedNotes)
	}
	if len(mockSearch.bulkDocs) != 0 {
		t.Errorf("expected 0 bulk docs on delete, got %d", len(mockSearch.bulkDocs))
	}
	if len(mockMongo.getCalls) != 0 {
		t.Errorf("expected 0 mongo reads on delete, got %d", len(mockMongo.getCalls))
	}
}

func TestHandleEvent_NoteChanged_IdempotencyAndBlockFilter(t *testing.T) {
	mockSearch := &MockSearchClient{}
	mockMongo := &MockNoteReader{
		notes: make(map[string]*MongoNote),
	}
	handler := NewEventHandler(mockMongo, mockSearch)

	now := time.Now().UTC()
	noteID := "note-456"
	userID := "user-789"

	// Note contains 5 blocks:
	// 1: text (text-bearing)
	// 2: header-1 (text-bearing)
	// 3: divider (structural/empty - MUST SKIP)
	// 4: drawing (structural/empty - MUST SKIP)
	// 5: code (text-bearing)
	mockMongo.notes[noteID] = &MongoNote{
		ID:     noteID,
		UserID: userID,
		Title:  "Test Architecture Note",
		Blocks: []Block{
			{ID: "b1", Type: "text", Properties: BlockProperties{Text: ptrString("Initial paragraph")}},
			{ID: "b2", Type: "header-1", Properties: BlockProperties{Text: ptrString("Section One")}},
			{ID: "b3", Type: "divider", Properties: BlockProperties{}},
			{ID: "b4", Type: "drawing", Properties: BlockProperties{}},
			{ID: "b5", Type: "code", Properties: BlockProperties{Text: ptrString("fmt.Println(42)")}},
		},
		UpdatedAt: now,
	}

	event := EventEnvelope{
		EventID:       "evt-200",
		EventType:     "note.changed",
		SchemaVersion: 1,
		AggregateType: "note",
		AggregateID:   noteID,
		UserID:        userID,
	}
	data, _ := json.Marshal(event)

	// 1. First execution
	if err := handler.HandleEvent(context.Background(), data); err != nil {
		t.Fatalf("first HandleEvent failed: %v", err)
	}

	if len(mockSearch.deletedNotes) != 1 || mockSearch.deletedNotes[0] != noteID {
		t.Errorf("expected DeleteByNoteID for %s before indexing, got %v", noteID, mockSearch.deletedNotes)
	}
	if len(mockSearch.bulkDocs) != 1 {
		t.Fatalf("expected 1 bulk batch, got %d", len(mockSearch.bulkDocs))
	}

	docs := mockSearch.bulkDocs[0]
	if len(docs) != 3 {
		t.Fatalf("expected 3 text-bearing blocks (skipped divider and drawing), got %d", len(docs))
	}

	// Verify document ID convention: note_id:block_id
	expectedDocs := []struct {
		blockID string
		order   int
		text    string
	}{
		{"b1", 0, "Initial paragraph"},
		{"b2", 1, "Section One"},
		{"b5", 4, "fmt.Println(42)"},
	}

	for i, exp := range expectedDocs {
		doc := docs[i]
		expectedDocID := DocID(noteID, exp.blockID)
		if doc.BlockID != exp.blockID {
			t.Errorf("doc %d: expected block_id %s, got %s", i, exp.blockID, doc.BlockID)
		}
		if DocID(doc.NoteID, doc.BlockID) != expectedDocID {
			t.Errorf("doc %d: expected docID %s, got %s", i, expectedDocID, DocID(doc.NoteID, doc.BlockID))
		}
		if doc.BlockOrder != exp.order {
			t.Errorf("doc %d: expected block_order %d, got %d", i, exp.order, doc.BlockOrder)
		}
		if doc.Text != exp.text {
			t.Errorf("doc %d: expected text %q, got %q", i, exp.text, doc.Text)
		}
		if doc.NoteTitle != "Test Architecture Note" {
			t.Errorf("doc %d: expected title %q, got %q", i, "Test Architecture Note", doc.NoteTitle)
		}
		if doc.UserID != userID {
			t.Errorf("doc %d: expected user_id %s, got %s", i, userID, doc.UserID)
		}
	}

	// 2. Second execution (duplicate event delivery for structural idempotency test)
	if err := handler.HandleEvent(context.Background(), data); err != nil {
		t.Fatalf("second HandleEvent failed: %v", err)
	}

	if len(mockSearch.deletedNotes) != 2 {
		t.Errorf("expected 2 total DeleteByNoteID calls, got %d", len(mockSearch.deletedNotes))
	}
	if len(mockSearch.bulkDocs) != 2 {
		t.Fatalf("expected 2 total bulk batches, got %d", len(mockSearch.bulkDocs))
	}

	secondDocs := mockSearch.bulkDocs[1]
	if len(secondDocs) != 3 {
		t.Fatalf("expected 3 docs in second batch, got %d", len(secondDocs))
	}

	// Confirm exact document ID overwrite match
	for i := range secondDocs {
		firstID := DocID(docs[i].NoteID, docs[i].BlockID)
		secondID := DocID(secondDocs[i].NoteID, secondDocs[i].BlockID)
		if firstID != secondID {
			t.Errorf("idempotency failure: doc %d ID %s != %s", i, firstID, secondID)
		}
	}
}

func TestHandleEvent_SoftDeletedNoteExclusion(t *testing.T) {
	mockSearch := &MockSearchClient{}
	mockMongo := &MockNoteReader{
		notes: make(map[string]*MongoNote),
	}
	handler := NewEventHandler(mockMongo, mockSearch)

	deletedTime := time.Now().UTC()
	noteID := "note-trashed"

	mockMongo.notes[noteID] = &MongoNote{
		ID:        noteID,
		UserID:    "user-111",
		Title:     "Trashed Note",
		DeletedAt: &deletedTime,
		Blocks: []Block{
			{ID: "b1", Type: "text", Properties: BlockProperties{Text: ptrString("Should not be indexed")}},
		},
	}

	event := EventEnvelope{
		EventID:       "evt-trash",
		EventType:     "note.changed",
		AggregateType: "note",
		AggregateID:   noteID,
	}
	data, _ := json.Marshal(event)

	if err := handler.HandleEvent(context.Background(), data); err != nil {
		t.Fatalf("HandleEvent failed: %v", err)
	}

	// Should delete any existing indexed blocks from search
	if len(mockSearch.deletedNotes) != 1 || mockSearch.deletedNotes[0] != noteID {
		t.Errorf("expected DeleteByNoteID for %s, got %v", noteID, mockSearch.deletedNotes)
	}
	// Should NOT index any blocks
	if len(mockSearch.bulkDocs) != 0 {
		t.Errorf("expected 0 bulk indexing calls for soft-deleted note, got %d", len(mockSearch.bulkDocs))
	}
}

func TestHandleEvent_MissingNoteExclusion(t *testing.T) {
	mockSearch := &MockSearchClient{}
	mockMongo := &MockNoteReader{
		notes: make(map[string]*MongoNote),
	}
	handler := NewEventHandler(mockMongo, mockSearch)

	noteID := "note-missing"

	event := EventEnvelope{
		EventID:       "evt-missing",
		EventType:     "note.changed",
		AggregateType: "note",
		AggregateID:   noteID,
	}
	data, _ := json.Marshal(event)

	if err := handler.HandleEvent(context.Background(), data); err != nil {
		t.Fatalf("HandleEvent failed: %v", err)
	}

	// Should run delete by query to clean up any orphaned docs
	if len(mockSearch.deletedNotes) != 1 || mockSearch.deletedNotes[0] != noteID {
		t.Errorf("expected DeleteByNoteID for missing note %s, got %v", noteID, mockSearch.deletedNotes)
	}
	if len(mockSearch.bulkDocs) != 0 {
		t.Errorf("expected 0 bulk indexing calls for missing note, got %d", len(mockSearch.bulkDocs))
	}
}

func TestHandleEvent_ErrorPropagation(t *testing.T) {
	ctx := context.Background()

	t.Run("Mongo error propagates", func(t *testing.T) {
		mockSearch := &MockSearchClient{}
		mockMongo := &MockNoteReader{readErr: errors.New("mongo connection refused")}
		handler := NewEventHandler(mockMongo, mockSearch)

		event := EventEnvelope{EventType: "note.changed", AggregateID: "note-1"}
		data, _ := json.Marshal(event)

		err := handler.HandleEvent(ctx, data)
		if err == nil {
			t.Fatalf("expected error from mongo failure, got nil")
		}
	})

	t.Run("DeleteByQuery error propagates", func(t *testing.T) {
		mockSearch := &MockSearchClient{deleteErr: errors.New("opensearch timeout")}
		mockMongo := &MockNoteReader{}
		handler := NewEventHandler(mockMongo, mockSearch)

		event := EventEnvelope{EventType: "note.deleted", AggregateID: "note-1"}
		data, _ := json.Marshal(event)

		err := handler.HandleEvent(ctx, data)
		if err == nil {
			t.Fatalf("expected error from delete failure, got nil")
		}
	})

	t.Run("BulkIndex error propagates", func(t *testing.T) {
		mockSearch := &MockSearchClient{bulkErr: errors.New("opensearch bulk rejected")}
		mockMongo := &MockNoteReader{
			notes: map[string]*MongoNote{
				"note-1": {
					ID:     "note-1",
					UserID: "user-1",
					Title:  "Title",
					Blocks: []Block{{ID: "b1", Type: "text", Properties: BlockProperties{Text: ptrString("t")}}},
				},
			},
		}
		handler := NewEventHandler(mockMongo, mockSearch)

		event := EventEnvelope{EventType: "note.changed", AggregateID: "note-1"}
		data, _ := json.Marshal(event)

		err := handler.HandleEvent(ctx, data)
		if err == nil {
			t.Fatalf("expected error from bulk failure, got nil")
		}
	})
}
