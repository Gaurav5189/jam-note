package kafka

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/sasl/scram"
	"hybrid_outbox_streamer/config"
)

// Producer is the interface for publishing records to Kafka.
type Producer interface {
	Produce(ctx context.Context, key, value []byte) error
	Close()
}

// FranzProducer implements Producer using franz-go (kgo).
type FranzProducer struct {
	client *kgo.Client
	topic  string
}

// NewFranzProducer initializes a new franz-go Kafka producer with SASL/TLS as configured.
func NewFranzProducer(cfg *config.Config) (*FranzProducer, error) {
	opts := []kgo.Opt{
		kgo.SeedBrokers(cfg.KafkaBrokers...),
		kgo.DefaultProduceTopic(cfg.KafkaTopic),
		kgo.RequiredAcks(kgo.AllISRAcks()),
	}

	// Configure TLS if CA certificate is provided or requested
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
				// Try parent directories in case command is run from a subfolder
				for _, alt := range []string{filepath.Join("..", cfg.KafkaCACert), filepath.Join("../..", cfg.KafkaCACert)} {
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
		// Aiven default with TLS
		tlsConfig = &tls.Config{
			MinVersion: tls.VersionTLS12,
		}
	}

	if tlsConfig != nil {
		opts = append(opts, kgo.DialTLSConfig(tlsConfig))
	}

	// Configure SASL SCRAM-SHA-512 authentication if username/password provided
	if cfg.KafkaUser != "" && cfg.KafkaPassword != "" {
		auth := scram.Auth{
			User: cfg.KafkaUser,
			Pass: cfg.KafkaPassword,
		}
		opts = append(opts, kgo.SASL(auth.AsSha512Mechanism()))
	}

	client, err := kgo.NewClient(opts...)
	if err != nil {
		return nil, fmt.Errorf("creating franz-go client: %w", err)
	}

	return &FranzProducer{
		client: client,
		topic:  cfg.KafkaTopic,
	}, nil
}

// NewFranzProducerWithClient creates a producer wrapping an existing kgo.Client.
func NewFranzProducerWithClient(client *kgo.Client, topic string) *FranzProducer {
	return &FranzProducer{
		client: client,
		topic:  topic,
	}
}

// Produce synchronously publishes a record with the given key and value to the default topic.
func (p *FranzProducer) Produce(ctx context.Context, key, value []byte) error {
	record := &kgo.Record{
		Topic: p.topic,
		Key:   key,
		Value: value,
	}
	results := p.client.ProduceSync(ctx, record)
	return results.FirstErr()
}

// Close flushes buffered records and closes the Kafka client.
func (p *FranzProducer) Close() {
	if p.client != nil {
		p.client.Close()
	}
}
