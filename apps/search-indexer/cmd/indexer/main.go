package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"search-indexer/config"
	"search-indexer/consumer"
	"search-indexer/indexer"
)

func main() {
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "help", "-h", "--help":
			printUsage()
			return
		}
	}

	runDaemon()
}

func printUsage() {
	fmt.Println("Jam Note Search Indexer")
	fmt.Println("Usage:")
	fmt.Println("  indexer    Run the search-indexer consumer daemon")
}

func runDaemon() {
	log.Println("[main] Starting Jam Note Search Indexer daemon...")

	cfg, err := config.LoadFromEnv()
	if err != nil {
		log.Fatalf("[main] config load error: %v", err)
	}
	if err := cfg.Validate(); err != nil {
		log.Fatalf("[main] config validation error: %v", err)
	}

	rootCtx, rootCancel := context.WithCancel(context.Background())
	defer rootCancel()

	// 1. Initialize MongoDB Reader
	mongoReader, err := indexer.NewMongoNoteReader(rootCtx, cfg.MongoURI, cfg.DatabaseName)
	if err != nil {
		log.Fatalf("[main] connecting to MongoDB at %s: %v", cfg.MongoURI, err)
	}
	defer mongoReader.Close(context.Background())
	log.Printf("[main] connected to MongoDB (database: %s)", cfg.DatabaseName)

	// 2. Initialize OpenSearch Client
	osClient, err := indexer.NewOSClient(cfg)
	if err != nil {
		log.Fatalf("[main] connecting to OpenSearch at %s: %v", cfg.OpenSearchURL, err)
	}

	// 3. Ensure OpenSearch index and alias exist on startup (retry with backoff if booting up)
	ensureIndexWithRetry(rootCtx, osClient, cfg.RetryInitialInterval, cfg.RetryMaxInterval)
	log.Printf("[main] OpenSearch index %s and alias %s verified", cfg.OpenSearchIndex, cfg.OpenSearchAlias)

	// 4. Initialize Event Handler
	eventHandler := indexer.NewEventHandler(mongoReader, osClient)

	// 5. Initialize Franz-go Kafka Consumer
	kafkaConsumer, err := consumer.NewConsumer(cfg, eventHandler)
	if err != nil {
		log.Fatalf("[main] connecting to Kafka brokers %v: %v", cfg.KafkaBrokers, err)
	}
	defer kafkaConsumer.Close()
	log.Printf("[main] connected to Kafka (topic: %s, group: %s)", cfg.KafkaTopic, cfg.KafkaGroupID)

	// 6. Start Consumer loop in a goroutine
	doneChan := make(chan error, 1)
	go func() {
		doneChan <- kafkaConsumer.Run(rootCtx)
	}()
	log.Println("[main] consumer loop active and listening for note events")

	// 7. Wait for termination signals (SIGINT, SIGTERM)
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	sig := <-sigChan
	log.Printf("[main] received signal: %v. Initiating graceful drain (timeout: %v)...", sig, cfg.DrainTimeout)

	// Cancel root context to notify consumer loop
	rootCancel()

	// Wait for consumer loop to drain or timeout
	select {
	case err := <-doneChan:
		if err != nil && err != context.Canceled {
			log.Printf("[main] consumer loop finished with: %v", err)
		}
	case <-time.After(cfg.DrainTimeout):
		log.Printf("[main] drain timeout (%v) reached, forcing shutdown", cfg.DrainTimeout)
	}

	log.Println("[main] shutdown complete.")
}

func ensureIndexWithRetry(ctx context.Context, client indexer.SearchClient, initialBackoff, maxBackoff time.Duration) {
	backoff := initialBackoff
	for {
		err := client.EnsureIndex(ctx)
		if err == nil {
			return
		}

		if ctx.Err() != nil {
			log.Fatalf("[main] context canceled while initializing OpenSearch index: %v", ctx.Err())
		}

		log.Printf("[main] waiting for OpenSearch to be reachable: %v. Retrying in %v...", err, backoff)
		select {
		case <-ctx.Done():
			log.Fatalf("[main] aborting index initialization: %v", ctx.Err())
		case <-time.After(backoff):
		}

		backoff *= 2
		if backoff > maxBackoff {
			backoff = maxBackoff
		}
	}
}
