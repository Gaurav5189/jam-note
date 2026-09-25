package config_test

import (
	"os"
	"path/filepath"
	"testing"

	"hybrid_outbox_streamer/config"
)

func TestLoadDotEnv(t *testing.T) {
	tempDir := t.TempDir()
	envPath := filepath.Join(tempDir, ".env")
	content := []byte("TEST_KEY_CUSTOM=custom_value\n# comment\nMONGODB_URL=mongodb://test-cluster:27017\n")
	if err := os.WriteFile(envPath, content, 0644); err != nil {
		t.Fatalf("failed to write test .env: %v", err)
	}

	config.LoadDotEnv(envPath)

	if val := os.Getenv("TEST_KEY_CUSTOM"); val != "custom_value" {
		t.Errorf("expected TEST_KEY_CUSTOM to be 'custom_value', got %q", val)
	}
	if val := os.Getenv("MONGODB_URL"); val != "mongodb://test-cluster:27017" {
		t.Errorf("expected MONGODB_URL to be 'mongodb://test-cluster:27017', got %q", val)
	}
}
