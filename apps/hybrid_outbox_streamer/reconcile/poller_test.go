package reconcile_test

import (
	"context"
	"sync"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"hybrid_outbox_streamer/outbox"
	"hybrid_outbox_streamer/reconcile"
)

type MockReconcileStore struct {
	records []*outbox.OutboxRecord
}

func (m *MockReconcileStore) Claim(ctx context.Context, eventID string, leaseDuration time.Duration) (*outbox.OutboxRecord, error) {
	return nil, nil
}
func (m *MockReconcileStore) MarkPublished(ctx context.Context, eventID string, publishedAt time.Time) error {
	return nil
}
func (m *MockReconcileStore) MarkFailed(ctx context.Context, eventID string, failedAt time.Time, reason string) error {
	return nil
}
func (m *MockReconcileStore) GetReconcileCandidates(ctx context.Context, leaseDuration time.Duration, limit int64) ([]*outbox.OutboxRecord, error) {
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
func (m *MockReconcileStore) ReplayFailed(ctx context.Context) (int64, error)              { return 0, nil }
func (m *MockReconcileStore) GetResumeToken(ctx context.Context) (bson.Raw, error)        { return nil, nil }
func (m *MockReconcileStore) SaveResumeToken(ctx context.Context, token bson.Raw) error   { return nil }
func (m *MockReconcileStore) ResetResumeToken(ctx context.Context) error                  { return nil }
func (m *MockReconcileStore) Close(ctx context.Context) error                             { return nil }

// TestPollerCandidateSelection tests that the poller enqueues due pending events and expired leases.
func TestPollerCandidateSelection(t *testing.T) {
	now := time.Now().UTC()
	leaseDuration := 30 * time.Second

	expiredClaim := now.Add(-1 * time.Minute)
	activeClaim := now.Add(-5 * time.Second)

	store := &MockReconcileStore{
		records: []*outbox.OutboxRecord{
			{EventID: "pending-due", Status: outbox.StatusPending, AvailableAt: now.Add(-10 * time.Second)},
			{EventID: "pending-future", Status: outbox.StatusPending, AvailableAt: now.Add(10 * time.Minute)},
			{EventID: "publishing-expired", Status: outbox.StatusPublishing, ClaimedAt: &expiredClaim},
			{EventID: "publishing-active", Status: outbox.StatusPublishing, ClaimedAt: &activeClaim},
			{EventID: "published", Status: outbox.StatusPublished},
		},
	}

	var mu sync.Mutex
	var enqueued []string
	sink := func(c outbox.Candidate) bool {
		mu.Lock()
		defer mu.Unlock()
		enqueued = append(enqueued, c.EventID)
		return true
	}

	poller := reconcile.NewPoller(store, leaseDuration, 1*time.Minute, 100, sink)
	count, err := poller.RunOnce(context.Background())
	if err != nil {
		t.Fatalf("RunOnce failed: %v", err)
	}

	if count != 2 {
		t.Fatalf("expected 2 candidates enqueued, got %d", count)
	}

	mu.Lock()
	defer mu.Unlock()
	expected := map[string]bool{"pending-due": true, "publishing-expired": true}
	for _, id := range enqueued {
		if !expected[id] {
			t.Errorf("unexpected candidate enqueued: %s", id)
		}
	}
}
