package config

import (
	"bufio"
	"bytes"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config holds all configuration for the hybrid outbox streamer.
type Config struct {
	// MongoDB configuration
	MongoURI     string
	DatabaseName string

	// Kafka configuration
	KafkaBrokers  []string
	KafkaTopic    string
	KafkaUser     string
	KafkaPassword string
	KafkaCACert   string // file path or PEM data

	// Outbox & Processing configuration
	LeaseDuration     time.Duration
	ReconcileInterval time.Duration
	BatchLimit        int64
	MaxPublishRetries int
	DrainTimeout      time.Duration

	// Heartbeat configuration
	HeartbeatInterval     time.Duration
	HeartbeatRetryDelays  []time.Duration
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
	user := getEnv("KAFKA_USER", getEnv("KAFKA_USERNAME", ""))
	pass := getEnv("KAFKA_PASSWORD", "")
	caCert := getEnv("KAFKA_CA_CERT", "")

	leaseDuration := getDurationEnv("LEASE_DURATION", 60*time.Second)
	reconcileInterval := getDurationEnv("RECONCILE_INTERVAL", 2*time.Minute)
	batchLimit := getInt64Env("BATCH_LIMIT", 100)
	maxPublishRetries := getIntEnv("MAX_PUBLISH_RETRIES", 3)
	drainTimeout := getDurationEnv("DRAIN_TIMEOUT", 15*time.Second)

	heartbeatInterval := getDurationEnv("HEARTBEAT_INTERVAL", 6*time.Hour)

	return &Config{
		MongoURI:              mongoURI,
		DatabaseName:          dbName,
		KafkaBrokers:          brokers,
		KafkaTopic:            topic,
		KafkaUser:             user,
		KafkaPassword:         pass,
		KafkaCACert:           caCert,
		LeaseDuration:         leaseDuration,
		ReconcileInterval:     reconcileInterval,
		BatchLimit:            batchLimit,
		MaxPublishRetries:     maxPublishRetries,
		DrainTimeout:          drainTimeout,
		HeartbeatInterval:     heartbeatInterval,
		HeartbeatRetryDelays: []time.Duration{
			1 * time.Minute,
			5 * time.Minute,
			15 * time.Minute,
		},
	}, nil
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

func getIntEnv(key string, defaultVal int) int {
	return int(getInt64Env(key, int64(defaultVal)))
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

