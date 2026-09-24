package outbox

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

const (
	StatusPending    = "pending"
	StatusPublishing = "publishing"
	StatusPublished  = "published"
	StatusFailed     = "failed"
)

// OutboxRecord represents the canonical document stored in MongoDB event_outbox.
type OutboxRecord struct {
	ID            bson.ObjectID `bson:"_id,omitempty" json:"_id,omitempty"`
	EventID       string        `bson:"event_id" json:"event_id"`
	EventType     string        `bson:"event_type" json:"event_type"`
	SchemaVersion int           `bson:"schema_version" json:"schema_version"`
	AggregateType string        `bson:"aggregate_type" json:"aggregate_type"`
	AggregateID   string        `bson:"aggregate_id" json:"aggregate_id"`
	UserID        string        `bson:"user_id" json:"user_id"`
	Payload       bson.M        `bson:"payload" json:"payload"`

	// Control fields (internal to outbox streamer; NEVER published to Kafka):
	Status      string     `bson:"status" json:"status"`
	Attempts    int        `bson:"attempts" json:"attempts"`
	AvailableAt time.Time  `bson:"available_at" json:"available_at"`
	ClaimedAt   *time.Time `bson:"claimed_at,omitempty" json:"claimed_at,omitempty"`
	PublishedAt *time.Time `bson:"published_at,omitempty" json:"published_at,omitempty"`
	FailedAt    *time.Time `bson:"failed_at,omitempty" json:"failed_at,omitempty"`
	ErrorReason *string    `bson:"error_reason,omitempty" json:"error_reason,omitempty"`
	CreatedAt   time.Time  `bson:"created_at" json:"created_at"`
}

// CleanEnvelope is the exact JSON structure published to Kafka.
// Outbox control fields (Status, Attempts, AvailableAt, ClaimedAt, PublishedAt, FailedAt, ErrorReason)
// are intentionally omitted per the V3 specification.
type CleanEnvelope struct {
	EventID       string    `json:"event_id"`
	EventType     string    `json:"event_type"`
	SchemaVersion int       `json:"schema_version"`
	AggregateType string    `json:"aggregate_type"`
	AggregateID   string    `json:"aggregate_id"`
	UserID        string    `json:"user_id"`
	Payload       any       `json:"payload"`
	CreatedAt     time.Time `json:"created_at"`
}

// StreamerStateDoc represents the single document in streamer_state.
type StreamerStateDoc struct {
	ID          string     `bson:"_id"`
	ResumeToken bson.Raw   `bson:"resume_token,omitempty"`
	UpdatedAt   *time.Time `bson:"updated_at,omitempty"`
}
