package reconcile

import (
	"context"
	"log"
	"time"

	"hybrid_outbox_streamer/outbox"
)

// Poller periodically scans the outbox collection for overdue or expired events.
type Poller struct {
	store         outbox.Store
	leaseDuration time.Duration
	interval      time.Duration
	batchLimit    int64
	sink          func(outbox.Candidate) bool
}

// NewPoller constructs a new reconciliation Poller.
func NewPoller(
	store outbox.Store,
	leaseDuration time.Duration,
	interval time.Duration,
	batchLimit int64,
	sink func(outbox.Candidate) bool,
) *Poller {
	return &Poller{
		store:         store,
		leaseDuration: leaseDuration,
		interval:      interval,
		batchLimit:    batchLimit,
		sink:          sink,
	}
}

// RunOnce executes a single reconciliation scan and dispatches candidates.
func (p *Poller) RunOnce(ctx context.Context) (int, error) {
	candidates, err := p.store.GetReconcileCandidates(ctx, p.leaseDuration, p.batchLimit)
	if err != nil {
		return 0, err
	}

	count := 0
	for _, rec := range candidates {
		cand := outbox.Candidate{
			EventID: rec.EventID,
		}
		if p.sink(cand) {
			count++
		}
	}
	return count, nil
}

// Start runs an immediate reconciliation pass, then continues at the configured interval.
func (p *Poller) Start(ctx context.Context) {
	// Immediate pass at startup to catch any unhandled events from downtime
	if count, err := p.RunOnce(ctx); err != nil {
		log.Printf("[reconcile] initial reconciliation pass failed: %v", err)
	} else if count > 0 {
		log.Printf("[reconcile] initial reconciliation enqueued %d candidates", count)
	}

	ticker := time.NewTicker(p.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			count, err := p.RunOnce(ctx)
			if err != nil {
				log.Printf("[reconcile] reconciliation pass failed: %v", err)
				continue
			}
			if count > 0 {
				log.Printf("[reconcile] reconciliation enqueued %d candidates", count)
			}
		}
	}
}
