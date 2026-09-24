package indexer

import (
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// Event envelope matching the canonical outbox schema and system heartbeats.
type EventEnvelope struct {
	EventID       string       `json:"event_id"`
	EventType     string       `json:"event_type"`
	SchemaVersion int          `json:"schema_version"`
	AggregateType string       `json:"aggregate_type"`
	AggregateID   string       `json:"aggregate_id"`
	NoteID        string       `json:"note_id"`
	UserID        string       `json:"user_id"`
	Payload       EventPayload `json:"payload"`
	CreatedAt     time.Time    `json:"created_at"`
}

// EventPayload contains optional payload metadata.
type EventPayload struct {
	ChangedFields []string  `json:"changed_fields"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// GetNoteID returns the effective note ID, preferring NoteID if present, else AggregateID.
func (e *EventEnvelope) GetNoteID() string {
	if e.NoteID != "" {
		return e.NoteID
	}
	return e.AggregateID
}

// MongoNote represents a note document as stored in MongoDB "notes" collection.
type MongoNote struct {
	ID        any        `bson:"_id"`
	UserID    any        `bson:"user_id"`
	Title     string     `bson:"title"`
	Blocks    []Block    `bson:"blocks"`
	DeletedAt *time.Time `bson:"deleted_at,omitempty"`
	UpdatedAt time.Time  `bson:"updated_at"`
}

// Block represents a single block inside a note.
type Block struct {
	ID         string          `bson:"id" json:"id"`
	Type       string          `bson:"type" json:"type"`
	Properties BlockProperties `bson:"properties" json:"properties"`
}

// BlockProperties contains block properties such as text.
type BlockProperties struct {
	Text *string `bson:"text,omitempty" json:"text,omitempty"`
}

// NoteDoc represents the OpenSearch document schema indexed in notes-blocks.
type NoteDoc struct {
	UserID     string    `json:"user_id"`
	NoteID     string    `json:"note_id"`
	BlockID    string    `json:"block_id"`
	NoteTitle  string    `json:"note_title"`
	BlockOrder int       `json:"block_order"`
	Text       string    `json:"text"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// DocID constructs the canonical deterministic OpenSearch document ID (note_id:block_id).
func DocID(noteID, blockID string) string {
	return fmt.Sprintf("%s:%s", noteID, blockID)
}

// StringFromID converts BSON ObjectID, string, or other ID representation to a string.
func StringFromID(v any) string {
	switch id := v.(type) {
	case bson.ObjectID:
		return id.Hex()
	case string:
		return id
	case fmt.Stringer:
		return id.String()
	default:
		if v == nil {
			return ""
		}
		return fmt.Sprintf("%v", v)
	}
}

// IsTextBearing returns true if the block type carries searchable text.
// Text-bearing blocks: text, header-1, header-2, header-3, todo, list-item, code.
// Structural/empty blocks (dividers, drawings, images) return false.
func IsTextBearing(blockType string) bool {
	switch blockType {
	case "text", "header-1", "header-2", "header-3", "todo", "list-item", "code":
		return true
	default:
		return false
	}
}
