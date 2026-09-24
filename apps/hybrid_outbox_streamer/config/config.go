package config

import (
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
func LoadFromEnv() (*Config, error) {
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
