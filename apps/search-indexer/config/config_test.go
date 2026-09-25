package config

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestLoadDotEnv(t *testing.T) {
	tmpDir := t.TempDir()
	envPath := filepath.Join(tmpDir, ".env")

	content := `
# Comment line
TEST_SEARCH_VAR1=hello_world
export TEST_SEARCH_VAR2="quoted value" # trailing comment
TEST_SEARCH_VAR3='single quoted'
`
	if err := os.WriteFile(envPath, []byte(content), 0644); err != nil {
		t.Fatalf("writing temp .env: %v", err)
	}

	// Ensure clean env
	os.Unsetenv("TEST_SEARCH_VAR1")
	os.Unsetenv("TEST_SEARCH_VAR2")
	os.Unsetenv("TEST_SEARCH_VAR3")

	LoadDotEnv(envPath)

	if val := os.Getenv("TEST_SEARCH_VAR1"); val != "hello_world" {
		t.Errorf("expected TEST_SEARCH_VAR1=hello_world, got %q", val)
	}
	if val := os.Getenv("TEST_SEARCH_VAR2"); val != "quoted value" {
		t.Errorf("expected TEST_SEARCH_VAR2='quoted value', got %q", val)
	}
	if val := os.Getenv("TEST_SEARCH_VAR3"); val != "single quoted" {
		t.Errorf("expected TEST_SEARCH_VAR3='single quoted', got %q", val)
	}
}

func TestConfigDefaultsAndValidation(t *testing.T) {
	// Isolate from any repo-level .env files
	tmpDir := t.TempDir()
	origDir, _ := os.Getwd()
	_ = os.Chdir(tmpDir)
	defer func() { _ = os.Chdir(origDir) }()

	// Clear relevant env vars
	os.Unsetenv("MONGODB_URL")
	os.Unsetenv("MONGODB_URI")
	os.Unsetenv("DATABASE_NAME")
	os.Unsetenv("KAFKA_BROKERS")
	os.Unsetenv("KAFKA_TOPIC")
	os.Unsetenv("KAFKA_GROUP_ID")
	os.Unsetenv("OPENSEARCH_URL")
	os.Unsetenv("OPENSEARCH_URI")
	os.Unsetenv("OPENSEARCH_INDEX")
	os.Unsetenv("OPENSEARCH_ALIAS")

	cfg, err := LoadFromEnv()
	if err != nil {
		t.Fatalf("LoadFromEnv failed: %v", err)
	}

	if cfg.DatabaseName != "jam_note" {
		t.Errorf("expected database name jam_note, got %s", cfg.DatabaseName)
	}
	if cfg.KafkaGroupID != "jam-note-search-indexer" {
		t.Errorf("expected group ID jam-note-search-indexer, got %s", cfg.KafkaGroupID)
	}
	if cfg.OpenSearchIndex != "notes-blocks-v1" {
		t.Errorf("expected index notes-blocks-v1, got %s", cfg.OpenSearchIndex)
	}
	if cfg.OpenSearchAlias != "notes-blocks" {
		t.Errorf("expected alias notes-blocks, got %s", cfg.OpenSearchAlias)
	}
	if cfg.DrainTimeout != 15*time.Second {
		t.Errorf("expected drain timeout 15s, got %v", cfg.DrainTimeout)
	}

	if err := cfg.Validate(); err != nil {
		t.Errorf("expected config to be valid by default, got: %v", err)
	}

	// Test invalid
	badCfg := *cfg
	badCfg.MongoURI = ""
	if err := badCfg.Validate(); err == nil {
		t.Errorf("expected error when MongoURI is empty")
	}

	badCfg2 := *cfg
	badCfg2.KafkaTopic = ""
	if err := badCfg2.Validate(); err == nil {
		t.Errorf("expected error when KafkaTopic is empty")
	}
}

func TestOpenSearchURLCredentialsExtraction(t *testing.T) {
	// Isolate from any repo-level .env files
	tmpDir := t.TempDir()
	origDir, _ := os.Getwd()
	_ = os.Chdir(tmpDir)
	defer func() { _ = os.Chdir(origDir) }()

	t.Setenv("OPENSEARCH_URL", "https://alice:secret123@opensearch.example.com:9200")
	os.Unsetenv("OPENSEARCH_USER")
	os.Unsetenv("OPENSEARCH_USERNAME")
	os.Unsetenv("OPENSEARCH_PASSWORD")

	cfg, err := LoadFromEnv()
	if err != nil {
		t.Fatalf("LoadFromEnv failed: %v", err)
	}

	if cfg.OpenSearchUser != "alice" {
		t.Errorf("expected user alice, got %s", cfg.OpenSearchUser)
	}
	if cfg.OpenSearchPassword != "secret123" {
		t.Errorf("expected password secret123, got %s", cfg.OpenSearchPassword)
	}
}
