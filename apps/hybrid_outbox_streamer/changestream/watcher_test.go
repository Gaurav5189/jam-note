package changestream_test

import (
	"context"
	"errors"
	"testing"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"hybrid_outbox_streamer/changestream"
	"hybrid_outbox_streamer/outbox"
)

type MockStore struct {
	tokenCleared bool
}

func (m *MockStore) Claim(ctx context.Context, eventID string, d outbox.OutboxRecord) (*outbox.OutboxRecord, error) {
	return nil, nil
}
func (m *MockStore) MarkPublished(ctx context.Context, eventID string, t any) error { return nil }
func (m *MockStore) MarkFailed(ctx context.Context, eventID string, t any, r string) error {
	return nil
}
func (m *MockStore) GetReconcileCandidates(ctx context.Context, d any, l int64) ([]*outbox.OutboxRecord, error) {
	return nil, nil
}
func (m *MockStore) ReplayFailed(ctx context.Context) (int64, error) { return 0, nil }
func (m *MockStore) GetResumeToken(ctx context.Context) (bson.Raw, error) {
	return bson.Raw{0x01}, nil
}
func (m *MockStore) SaveResumeToken(ctx context.Context, token bson.Raw) error { return nil }
func (m *MockStore) ResetResumeToken(ctx context.Context) error {
	m.tokenCleared = true
	return nil
}
func (m *MockStore) Close(ctx context.Context) error { return nil }

// TestError286Detection tests Error 286 identification.
func TestError286Detection(t *testing.T) {
	cmdErr286 := mongo.CommandError{
		Code:    286,
		Message: "ChangeStreamFatalError: resume token was not found",
	}

	if !changestream.IsError286(cmdErr286) {
		t.Errorf("expected CommandError 286 to be recognized as Error 286")
	}

	wrappedErr := errors.New("command failed: (286) ChangeStreamFatalError")
	if !changestream.IsError286(wrappedErr) {
		t.Errorf("expected string error containing 286 to be recognized as Error 286")
	}

	otherErr := mongo.CommandError{
		Code:    123,
		Message: "Some other error",
	}
	if changestream.IsError286(otherErr) {
		t.Errorf("did not expect error 123 to be recognized as Error 286")
	}
}
