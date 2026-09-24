package consumer

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/sasl/scram"
	"search-indexer/config"
	"search-indexer/indexer"
)

// Committer defines the offset commit interface for Franz-go or mocks.
type Committer interface {
	CommitRecords(ctx context.Context, rs ...*kgo.Record) error
}

// Consumer consumes note events from Kafka and drives the search indexing engine.
type Consumer struct {
	client    *kgo.Client
	handler   *indexer.EventHandler
	cfg       *config.Config
	committer Committer
}

// NewConsumer initializes a Franz-go Kafka consumer client with TLS/SASL and manual commit.
func NewConsumer(cfg *config.Config, handler *indexer.EventHandler) (*Consumer, error) {
	opts := []kgo.Opt{
		kgo.SeedBrokers(cfg.KafkaBrokers...),
		kgo.ConsumerGroup(cfg.KafkaGroupID),
		kgo.ConsumeTopics(cfg.KafkaTopic),
		kgo.DisableAutoCommit(),
		kgo.BlockRebalanceOnPoll(),
	}

	// Configure TLS
	var tlsConfig *tls.Config
	if cfg.KafkaCACert != "" {
		certPool := x509.NewCertPool()
		var certBytes []byte
		var err error

		if strings.Contains(cfg.KafkaCACert, "-----BEGIN CERTIFICATE-----") {
			certBytes = []byte(cfg.KafkaCACert)
		} else {
			certBytes, err = os.ReadFile(cfg.KafkaCACert)
			if err != nil {
				for _, alt := range []string{
					filepath.Join("..", cfg.KafkaCACert),
					filepath.Join("../..", cfg.KafkaCACert),
				} {
					if b, readErr := os.ReadFile(alt); readErr == nil {
						certBytes = b
						err = nil
						break
					}
				}
				if err != nil {
					return nil, fmt.Errorf("reading Kafka CA certificate file: %w", err)
				}
			}
		}

		if !certPool.AppendCertsFromPEM(certBytes) {
			return nil, fmt.Errorf("failed to parse Kafka CA certificate PEM")
		}

		tlsConfig = &tls.Config{
			RootCAs: certPool,
		}
	} else if cfg.KafkaUser != "" {
		tlsConfig = &tls.Config{
			MinVersion: tls.VersionTLS12,
		}
	}

	if tlsConfig != nil {
		opts = append(opts, kgo.DialTLSConfig(tlsConfig))
	}

	// Configure SASL SCRAM-SHA-512
	if cfg.KafkaUser != "" && cfg.KafkaPassword != "" {
		auth := scram.Auth{
			User: cfg.KafkaUser,
			Pass: cfg.KafkaPassword,
		}
		opts = append(opts, kgo.SASL(auth.AsSha512Mechanism()))
	}

	client, err := kgo.NewClient(opts...)
	if err != nil {
		return nil, fmt.Errorf("creating franz-go consumer client: %w", err)
	}

	return &Consumer{
		client:    client,
		handler:   handler,
		cfg:       cfg,
		committer: client,
	}, nil
}

// NewConsumerWithCommitter creates a consumer wrapping a custom committer (useful for unit tests).
func NewConsumerWithCommitter(cfg *config.Config, handler *indexer.EventHandler, committer Committer) *Consumer {
	return &Consumer{
		handler:   handler,
		cfg:       cfg,
		committer: committer,
	}
}

// ProcessRecord processes a single record with backoff retry and manual offset commit.
func (c *Consumer) ProcessRecord(ctx context.Context, record *kgo.Record) error {
	backoff := c.cfg.RetryInitialInterval
	if backoff <= 0 {
		backoff = 500 * time.Millisecond
	}
	maxBackoff := c.cfg.RetryMaxInterval
	if maxBackoff <= 0 {
		maxBackoff = 30 * time.Second
	}

	for {
		err := c.handler.HandleEvent(ctx, record.Value)
		if err == nil {
			// Successful indexing confirmation -> commit Kafka offset
			commitCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			if c.committer != nil {
				if commitErr := c.committer.CommitRecords(commitCtx, record); commitErr != nil {
					log.Printf("[consumer] warning: error committing offset for record (p:%d, o:%d): %v",
						record.Partition, record.Offset, commitErr)
				}
			}
			return nil
		}

		if ctx.Err() != nil {
			return ctx.Err()
		}

		log.Printf("[consumer] retryable failure on record (p:%d, o:%d): %v. Backoff %v...",
			record.Partition, record.Offset, err, backoff)

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(backoff):
		}

		backoff *= 2
		if backoff > maxBackoff {
			backoff = maxBackoff
		}
	}
}

// Run begins the polling and consumption loop until ctx is canceled.
func (c *Consumer) Run(ctx context.Context) error {
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		fetches := c.client.PollFetches(ctx)
		if err := fetches.Err(); err != nil {
			if ctx.Err() != nil || errors.Is(err, context.Canceled) {
				return ctx.Err()
			}
			log.Printf("[consumer] poll fetch error: %v", err)
			continue
		}

		iter := fetches.RecordIter()
		for !iter.Done() {
			record := iter.Next()
			if err := c.ProcessRecord(ctx, record); err != nil {
				if ctx.Err() != nil {
					return ctx.Err()
				}
				log.Printf("[consumer] error processing record: %v", err)
			}
		}
	}
}

// Close closes the Franz-go client.
func (c *Consumer) Close() {
	if c.client != nil {
		c.client.Close()
	}
}
