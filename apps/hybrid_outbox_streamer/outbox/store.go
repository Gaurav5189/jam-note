package outbox

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// Store defines database operations required by the outbox streamer.
type Store interface {
	// Claim atomically claims an event for publishing using FindOneAndUpdate.
	// Matches status = "pending" OR (status = "publishing" AND claimed_at <= now - leaseDuration).
	// Returns nil, nil if the document was already claimed or does not match.
	Claim(ctx context.Context, eventID string, leaseDuration time.Duration) (*OutboxRecord, error)

	// MarkPublished updates status to "published", sets published_at, and clears claimed_at.
	MarkPublished(ctx context.Context, eventID string, publishedAt time.Time) error

	// MarkFailed marks the record as failed with the given reason and clears claimed_at.
	MarkFailed(ctx context.Context, eventID string, failedAt time.Time, reason string) error

	// GetReconcileCandidates finds pending/due or expired publishing records.
	GetReconcileCandidates(ctx context.Context, leaseDuration time.Duration, limit int64) ([]*OutboxRecord, error)

	// ReplayFailed resets all failed records back to pending with attempts=0.
	ReplayFailed(ctx context.Context) (int64, error)

	// GetResumeToken loads the Change Stream resume token from streamer_state.
	GetResumeToken(ctx context.Context) (bson.Raw, error)

	// SaveResumeToken saves the Change Stream resume token in streamer_state.
	SaveResumeToken(ctx context.Context, token bson.Raw) error

	// ResetResumeToken clears the resume token in streamer_state.
	ResetResumeToken(ctx context.Context) error

	// Close cleanly closes store connections.
	Close(ctx context.Context) error
}
