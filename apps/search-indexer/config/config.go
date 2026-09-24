package config

import (
	"bufio"
	"bytes"
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config holds all configuration for the search indexer daemon.
type Config struct {
	// MongoDB configuration
	MongoURI     string
	DatabaseName string

	// Kafka configuration
	KafkaBrokers  []string
	KafkaTopic    string
	KafkaGroupID  string
	KafkaUser     string
	KafkaPassword string
	KafkaCACert   string // file path or PEM data

	// OpenSearch configuration
	OpenSearchURL      string
	OpenSearchUser     string
	OpenSearchPassword string
	OpenSearchIndex    string
	OpenSearchAlias    string

	// Processing & Fault Tolerance configuration
	DrainTimeout         time.Duration
	RetryInitialInterval time.Duration
	RetryMaxInterval     time.Duration
}

// LoadFromEnv loads configuration from environment variables with production defaults.
// It automatically attempts to load .env from the current or parent directories if present.
func LoadFromEnv() (*Config, error) {
	LoadDotEnv()

	mongoURI := getEnv("MONGODB_URL", getEnv("MONGODB_URI", "mongodb://localhost:27017"))
	dbName := getEnv("DATABASE_NAME", "jam_note")

	brokersStr := getEnv("KAFKA_BROKERS", "localhost:9092")
	brokers := strings.Split(brokersStr, ",")
	for i := range brokers {
		brokers[i] = strings.TrimSpace(brokers[i])
	}

	topic := getEnv("KAFKA_TOPIC", "jam-note.note-events.v1")
	groupID := getEnv("KAFKA_GROUP_ID", "jam-note-search-indexer")
	user := getEnv("KAFKA_USER", getEnv("KAFKA_USERNAME", ""))
	pass := getEnv("KAFKA_PASSWORD", "")
	caCert := getEnv("KAFKA_CA_CERT", "")

	rawOSURL := getEnv("OPENSEARCH_URL", getEnv("OPENSEARCH_URI", "http://localhost:9200"))
	osUser := getEnv("OPENSEARCH_USER", getEnv("OPENSEARCH_USERNAME", ""))
	osPass := getEnv("OPENSEARCH_PASSWORD", "")

	// If OpenSearch URL has embedded credentials and env didn't specify them, extract them
	if parsed, err := url.Parse(rawOSURL); err == nil && parsed.User != nil {
		if osUser == "" {
			osUser = parsed.User.Username()
		}
		if osPass == "" {
			if p, ok := parsed.User.Password(); ok {
				osPass = p
			}
		}
	}

	osIndex := getEnv("OPENSEARCH_INDEX", "notes-blocks-v1")
	osAlias := getEnv("OPENSEARCH_ALIAS", "notes-blocks")

	drainTimeout := getDurationEnv("DRAIN_TIMEOUT", 15*time.Second)
	retryInitial := getDurationEnv("RETRY_INITIAL_INTERVAL", 500*time.Millisecond)
	retryMax := getDurationEnv("RETRY_MAX_INTERVAL", 30*time.Second)

	cfg := &Config{
		MongoURI:             mongoURI,
		DatabaseName:         dbName,
		KafkaBrokers:         brokers,
		KafkaTopic:           topic,
		KafkaGroupID:         groupID,
		KafkaUser:            user,
		KafkaPassword:        pass,
		KafkaCACert:          caCert,
		OpenSearchURL:        rawOSURL,
		OpenSearchUser:       osUser,
		OpenSearchPassword:   osPass,
		OpenSearchIndex:      osIndex,
		OpenSearchAlias:      osAlias,
		DrainTimeout:         drainTimeout,
		RetryInitialInterval: retryInitial,
		RetryMaxInterval:     retryMax,
	}

	return cfg, nil
}

func getEnv(key, defaultVal string) string {
	if val, ok := os.LookupEnv(key); ok && val != "" {
		return val
	}
	return defaultVal
}

func getDurationEnv(key string, defaultVal time.Duration) time.Duration {
	if val, ok := os.LookupEnv(key); ok && val != "" {
		d, err := time.ParseDuration(val)
		if err == nil {
			return d
		}
	}
	return defaultVal
}

func getInt64Env(key string, defaultVal int64) int64 {
	if val, ok := os.LookupEnv(key); ok && val != "" {
		v, err := strconv.ParseInt(val, 10, 64)
		if err == nil {
			return v
		}
	}
	return defaultVal
}

// Validate checks essential configurations.
func (c *Config) Validate() error {
	if c.MongoURI == "" {
		return fmt.Errorf("MongoURI cannot be empty")
	}
	if len(c.KafkaBrokers) == 0 || c.KafkaBrokers[0] == "" {
		return fmt.Errorf("KafkaBrokers cannot be empty")
	}
	if c.KafkaTopic == "" {
		return fmt.Errorf("KafkaTopic cannot be empty")
	}
	if c.KafkaGroupID == "" {
		return fmt.Errorf("KafkaGroupID cannot be empty")
	}
	if c.OpenSearchURL == "" {
		return fmt.Errorf("OpenSearchURL cannot be empty")
	}
	if c.OpenSearchIndex == "" {
		return fmt.Errorf("OpenSearchIndex cannot be empty")
	}
	if c.OpenSearchAlias == "" {
		return fmt.Errorf("OpenSearchAlias cannot be empty")
	}
	return nil
}

// LoadDotEnv searches for a .env file in the current and parent directories,
// parsing KEY=VALUE pairs and setting them if not already present in the environment.
func LoadDotEnv(paths ...string) {
	if len(paths) == 0 {
		paths = []string{".env", "../.env", "../../.env"}
	}
	for _, path := range paths {
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		scanner := bufio.NewScanner(bytes.NewReader(data))
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			if strings.HasPrefix(line, "export ") {
				line = strings.TrimSpace(strings.TrimPrefix(line, "export "))
			}
			parts := strings.SplitN(line, "=", 2)
			if len(parts) != 2 {
				continue
			}
			key := strings.TrimSpace(parts[0])
			val := strings.TrimSpace(parts[1])

			// Strip optional inline comments if separated by whitespace
			if idx := strings.Index(val, " #"); idx != -1 {
				val = strings.TrimSpace(val[:idx])
			}

			// Strip surrounding single or double quotes
			if len(val) >= 2 {
				if (val[0] == '"' && val[len(val)-1] == '"') || (val[0] == '\'' && val[len(val)-1] == '\'') {
					val = val[1 : len(val)-1]
				}
			}

			// Only set if not already set in the current process environment
			if _, exists := os.LookupEnv(key); !exists {
				_ = os.Setenv(key, val)
			}
		}
		break
	}
}
