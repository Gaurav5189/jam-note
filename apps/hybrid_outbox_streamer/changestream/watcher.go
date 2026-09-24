package changestream

import (
	"context"
	"errors"
	"log"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"hybrid_outbox_streamer/outbox"
)

// ChangeEvent represents the document structure emitted by the Change Stream.
type ChangeEvent struct {
	OperationType string               `bson:"operationType"`
	FullDocument  *outbox.OutboxRecord `bson:"fullDocument"`
	DocumentKey   bson.M               `bson:"documentKey"`
}

// Watcher monitors the event_outbox collection for real-time inserts.
type Watcher struct {
	coll          *mongo.Collection
	store         outbox.Store
	candidateSink func(outbox.Candidate) bool
}

// NewWatcher initializes a Watcher instance.
func NewWatcher(coll *mongo.Collection, store outbox.Store, sink func(outbox.Candidate) bool) *Watcher {
	return &Watcher{
		coll:          coll,
		store:         store,
		candidateSink: sink,
	}
}

// Start begins listening to the Change Stream until context is canceled.
func (w *Watcher) Start(ctx context.Context) {
	pipeline := mongo.Pipeline{
		bson.D{{Key: "$match", Value: bson.D{
			{Key: "operationType", Value: "insert"},
		}}},
	}

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		// 1. Fetch saved resume token from streamer_state
		var resumeToken bson.Raw
		if token, err := w.store.GetResumeToken(ctx); err == nil {
			resumeToken = token
		}

		csOpts := options.ChangeStream()
		if len(resumeToken) > 0 {
			csOpts.SetResumeAfter(resumeToken)
		}

		cs, err := w.coll.Watch(ctx, pipeline, csOpts)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			log.Printf("[changestream] error opening change stream: %v", err)
			if IsError286(err) {
				log.Printf("[changestream] error 286 (resume token expired / invalidated). Clearing stored token and falling back to reconciliation scan")
				_ = w.store.ResetResumeToken(ctx)
			}
			select {
			case <-ctx.Done():
				return
			case <-time.After(2 * time.Second):
				continue
			}
		}

		w.consumeStream(ctx, cs)
	}
}

func (w *Watcher) consumeStream(ctx context.Context, cs *mongo.ChangeStream) {
	defer cs.Close(ctx)

	for cs.Next(ctx) {
		var event ChangeEvent
		if err := cs.Decode(&event); err != nil {
			log.Printf("[changestream] decode error: %v", err)
			continue
		}

		if event.FullDocument != nil && event.FullDocument.EventID != "" {
			cand := outbox.Candidate{
				EventID:     event.FullDocument.EventID,
				ResumeToken: cs.ResumeToken(),
			}
			w.candidateSink(cand)
		}
	}

	if err := cs.Err(); err != nil {
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			return
		}
		log.Printf("[changestream] stream loop exited with error: %v", err)
		if IsError286(err) {
			log.Printf("[changestream] error 286 encountered in stream loop. Resetting resume token.")
			_ = w.store.ResetResumeToken(ctx)
		}
	}
}

// IsError286 checks if the MongoDB error represents ChangeStreamFatalError (Error 286).
func IsError286(err error) bool {
	if err == nil {
		return false
	}
	var cmdErr mongo.CommandError
	if errors.As(err, &cmdErr) {
		if cmdErr.HasErrorCode(286) || cmdErr.Code == 286 {
			return true
		}
	}
	msg := err.Error()
	return strings.Contains(msg, "286") || strings.Contains(msg, "ChangeStreamFatalError")
}
