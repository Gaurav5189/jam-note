package heartbeat_test

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"testing"
	"time"

	"hybrid_outbox_streamer/heartbeat"
)

type MockProducer struct {
	mu           sync.Mutex
	messages     [][]byte
	failAttempts int
}

func (m *MockProducer) Produce(ctx context.Context, key, value []byte) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.failAttempts > 0 {
		m.failAttempts--
		return errors.New("kafka connection failure")
	}
	m.messages = append(m.messages, value)
	return nil
}

func (m *MockProducer) Close() {}

func (m *MockProducer) MessageCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.messages)
}

// TestHeartbeatPayloadFormat verifies the JSON structure conforms to V3 §8.
func TestHeartbeatPayloadFormat(t *testing.T) {
	prod := &MockProducer{}
	runner := heartbeat.NewRunner(prod, 1*time.Hour, nil)

	ctx := context.Background()
	if err := runner.SendOnce(ctx); err != nil {
		t.Fatalf("SendOnce failed: %v", err)
	}

	if prod.MessageCount() != 1 {
		t.Fatalf("expected 1 message, got %d", prod.MessageCount())
	}

	var hb heartbeat.Event
	if err := json.Unmarshal(prod.messages[0], &hb); err != nil {
		t.Fatalf("failed to unmarshal heartbeat: %v", err)
	}

	if hb.EventType != "system.heartbeat" {
		t.Errorf("expected event_type 'system.heartbeat', got %q", hb.EventType)
	}
	if hb.Source != "jam-note-outbox-streamer" {
		t.Errorf("expected source 'jam-note-outbox-streamer', got %q", hb.Source)
	}
	if hb.Timestamp.IsZero() {
		t.Error("expected non-zero timestamp")
	}
}

// TestHeartbeatStartupRetry verifies that startup heartbeat retries when the broker is temporarily unavailable.
func TestHeartbeatStartupRetry(t *testing.T) {
	prod := &MockProducer{
		failAttempts: 2, // Fails first 2 attempts, succeeds on 3rd
	}

	retryDelays := []time.Duration{
		2 * time.Millisecond,
		5 * time.Millisecond,
	}

	runner := heartbeat.NewRunner(prod, 1*time.Hour, retryDelays)

	ctx := context.Background()
	err := runner.SendWithStartupRetry(ctx)
	if err != nil {
		t.Fatalf("expected retry to succeed on 3rd attempt, got error: %v", err)
	}

	if prod.MessageCount() != 1 {
		t.Fatalf("expected 1 message published after retries, got %d", prod.MessageCount())
	}
}

// TestHeartbeatExhaustedRetries verifies that when all retries fail, an error is returned.
func TestHeartbeatExhaustedRetries(t *testing.T) {
	prod := &MockProducer{
		failAttempts: 10,
	}

	retryDelays := []time.Duration{
		1 * time.Millisecond,
		1 * time.Millisecond,
	}

	runner := heartbeat.NewRunner(prod, 1*time.Hour, retryDelays)

	ctx := context.Background()
	err := runner.SendWithStartupRetry(ctx)
	if err == nil {
		t.Fatal("expected error when all retries fail")
	}
}
