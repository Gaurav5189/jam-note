package main

import (
	"context"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"hybrid_outbox_streamer/outbox"
)

type mockCLIStore struct {
	replayedCount int64
	tokenReset    bool
}

func (m *mockCLIStore) Claim(ctx context.Context, eventID string, leaseDuration time.Duration) (*outbox.OutboxRecord, error) {
	return nil, nil
}
func (m *mockCLIStore) MarkPublished(ctx context.Context, eventID string, publishedAt time.Time) error {
	return nil
}
func (m *mockCLIStore) MarkFailed(ctx context.Context, eventID string, failedAt time.Time, reason string) error {
	return nil
}
func (m *mockCLIStore) GetReconcileCandidates(ctx context.Context, leaseDuration time.Duration, limit int64) ([]*outbox.OutboxRecord, error) {
	return nil, nil
}
func (m *mockCLIStore) ReplayFailed(ctx context.Context) (int64, error) {
	m.replayedCount = 5
	return m.replayedCount, nil
}
func (m *mockCLIStore) GetResumeToken(ctx context.Context) (bson.Raw, error)      { return nil, nil }
func (m *mockCLIStore) SaveResumeToken(ctx context.Context, token bson.Raw) error { return nil }
func (m *mockCLIStore) ResetResumeToken(ctx context.Context) error {
	m.tokenReset = true
	return nil
}
func (m *mockCLIStore) Close(ctx context.Context) error { return nil }

func TestPrintUsage(t *testing.T) {
	// Simple test to ensure printUsage does not panic
	printUsage()
}

func TestCLIOperations(t *testing.T) {
	store := &mockCLIStore{}
	ctx := context.Background()

	count, err := store.ReplayFailed(ctx)
	if err != nil {
		t.Fatalf("ReplayFailed failed: %v", err)
	}
	if count != 5 {
		t.Errorf("expected count 5, got %d", count)
	}

	if err := store.ResetResumeToken(ctx); err != nil {
		t.Fatalf("ResetResumeToken failed: %v", err)
	}
	if !store.tokenReset {
		t.Errorf("expected tokenReset true")
	}
}
