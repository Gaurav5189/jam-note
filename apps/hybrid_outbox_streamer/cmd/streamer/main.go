package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"hybrid_outbox_streamer/changestream"
	"hybrid_outbox_streamer/config"
	"hybrid_outbox_streamer/heartbeat"
	"hybrid_outbox_streamer/kafka"
	"hybrid_outbox_streamer/outbox"
	"hybrid_outbox_streamer/reconcile"
)

func main() {
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "replay":
			handleReplay()
			return
		case "reset-token":
			handleResetToken()
			return
		case "help", "-h", "--help":
			printUsage()
			return
		}
	}

	runDaemon()
}

func printUsage() {
	fmt.Println("Jam Note Hybrid Outbox Streamer")
	fmt.Println("Usage:")
	fmt.Println("  streamer              Run the outbox streamer daemon")
	fmt.Println("  streamer replay       Reset failed outbox events back to pending")
	fmt.Println("  streamer reset-token  Reset the saved Change Stream resume token")
}

func handleReplay() {
	cfg, err := config.LoadFromEnv()
	if err != nil {
		log.Fatalf("failed loading config: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	store, err := outbox.NewMongoStore(ctx, cfg.MongoURI, cfg.DatabaseName)
	if err != nil {
		log.Fatalf("connecting to mongodb: %v", err)
	}
	defer store.Close(context.Background())

	count, err := store.ReplayFailed(ctx)
	if err != nil {
		log.Fatalf("replaying failed outbox events: %v", err)
	}
	fmt.Printf("Successfully reset %d failed outbox events back to pending.\n", count)
}

func handleResetToken() {
	cfg, err := config.LoadFromEnv()
	if err != nil {
		log.Fatalf("failed loading config: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	store, err := outbox.NewMongoStore(ctx, cfg.MongoURI, cfg.DatabaseName)
	if err != nil {
		log.Fatalf("connecting to mongodb: %v", err)
	}
	defer store.Close(context.Background())

	if err := store.ResetResumeToken(ctx); err != nil {
		log.Fatalf("resetting resume token: %v", err)
	}
	fmt.Println("Successfully reset Change Stream resume token in streamer_state.")
}

func runDaemon() {
	log.Println("[main] Starting Jam Note Hybrid Outbox Streamer daemon...")

	cfg, err := config.LoadFromEnv()
	if err != nil {
		log.Fatalf("[main] config load error: %v", err)
	}
	if err := cfg.Validate(); err != nil {
		log.Fatalf("[main] config validation error: %v", err)
	}

	rootCtx, rootCancel := context.WithCancel(context.Background())
	defer rootCancel()

	// 1. Initialize MongoDB Outbox Store
	store, err := outbox.NewMongoStore(rootCtx, cfg.MongoURI, cfg.DatabaseName)
	if err != nil {
		log.Fatalf("[main] connecting to MongoDB at %s: %v", cfg.MongoURI, err)
	}
	defer store.Close(context.Background())
	log.Printf("[main] connected to MongoDB (database: %s)", cfg.DatabaseName)

	// 2. Initialize Kafka Producer
	producer, err := kafka.NewFranzProducer(cfg)
	if err != nil {
		log.Fatalf("[main] connecting to Kafka brokers %v: %v", cfg.KafkaBrokers, err)
	}
	defer producer.Close()
	log.Printf("[main] connected to Kafka (topic: %s)", cfg.KafkaTopic)

	// 3. Initialize Publisher & Worker Pool
	publisher := outbox.NewPublisher(store, producer, cfg.LeaseDuration, cfg.MaxPublishRetries)
	numWorkers := 4
	workerPool := outbox.NewWorkerPool(publisher, numWorkers, int(cfg.BatchLimit*2))

	// 4. Initialize Change Stream Watcher (fast-path)
	watcher := changestream.NewWatcher(store.OutboxCollection(), store, workerPool.Enqueue)
	go watcher.Start(rootCtx)
	log.Println("[main] change stream watcher active (fast-path)")

	// 5. Initialize Reconciliation Poller (catch-up & lease recovery)
	poller := reconcile.NewPoller(store, cfg.LeaseDuration, cfg.ReconcileInterval, cfg.BatchLimit, workerPool.Enqueue)
	go poller.Start(rootCtx)
	log.Printf("[main] reconciliation poller active (interval: %v)", cfg.ReconcileInterval)

	// 6. Initialize Operational Heartbeat Runner
	hbRunner := heartbeat.NewRunner(producer, cfg.HeartbeatInterval, cfg.HeartbeatRetryDelays)
	go hbRunner.Start(rootCtx)
	log.Printf("[main] heartbeat runner active (interval: %v)", cfg.HeartbeatInterval)

	// 7. Wait for termination signals (SIGINT, SIGTERM)
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	sig := <-sigChan
	log.Printf("[main] received signal: %v. Initiating graceful drain (timeout: %v)...", sig, cfg.DrainTimeout)

	// Cancel watchers and pollers
	rootCancel()

	// Drain remaining work in worker pool
	workerPool.Stop(cfg.DrainTimeout)

	log.Println("[main] shutdown complete.")
}
