package indexer

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
)

// EventHandler processes inbound Kafka events and synchronizes OpenSearch.
type EventHandler struct {
	mongoReader  NoteReader
	searchClient SearchClient
}

// NewEventHandler creates an EventHandler with MongoDB and OpenSearch dependencies.
func NewEventHandler(mongoReader NoteReader, searchClient SearchClient) *EventHandler {
	return &EventHandler{
		mongoReader:  mongoReader,
		searchClient: searchClient,
	}
}

// HandleEvent processes a single Kafka message payload according to the Phase 8 specification.
func (h *EventHandler) HandleEvent(ctx context.Context, value []byte) error {
	var env EventEnvelope
	if err := json.Unmarshal(value, &env); err != nil {
		log.Printf("[handler] invalid event JSON: %v, skipping malformed payload", err)
		return nil
	}

	// 1. Skip system operational heartbeats
	if env.EventType == "system.heartbeat" {
		log.Printf("[handler] skipped system.heartbeat event")
		return nil
	}

	noteID := env.GetNoteID()
	if noteID == "" {
		log.Printf("[handler] event %s has empty note_id / aggregate_id, skipping", env.EventID)
		return nil
	}

	switch env.EventType {
	case "note.deleted":
		if err := h.searchClient.DeleteByNoteID(ctx, noteID); err != nil {
			return fmt.Errorf("deleting note %s from search: %w", noteID, err)
		}
		log.Printf("[handler] processed note.deleted for note %s", noteID)
		return nil

	case "note.changed":
		note, err := h.mongoReader.GetNote(ctx, noteID)
		if err != nil {
			return fmt.Errorf("querying mongo for note %s: %w", noteID, err)
		}

		// If note is missing or soft-deleted, purge any index records
		if note == nil || note.DeletedAt != nil {
			if err := h.searchClient.DeleteByNoteID(ctx, noteID); err != nil {
				return fmt.Errorf("deleting missing/soft-deleted note %s from search: %w", noteID, err)
			}
			log.Printf("[handler] purged missing/soft-deleted note %s from search", noteID)
			return nil
		}

		// Active note: Delete existing blocks to prevent orphaned blocks on edits/deletions,
		// then bulk index all text-bearing blocks.
		if err := h.searchClient.DeleteByNoteID(ctx, noteID); err != nil {
			return fmt.Errorf("purging existing blocks for note %s before re-index: %w", noteID, err)
		}

		var docs []NoteDoc
		for idx, block := range note.Blocks {
			if !IsTextBearing(block.Type) {
				continue
			}

			text := ""
			if block.Properties.Text != nil {
				text = *block.Properties.Text
			}

			docs = append(docs, NoteDoc{
				UserID:     StringFromID(note.UserID),
				NoteID:     noteID,
				BlockID:    block.ID,
				NoteTitle:  note.Title,
				BlockOrder: idx,
				Text:       text,
				UpdatedAt:  note.UpdatedAt,
			})
		}

		if len(docs) > 0 {
			if err := h.searchClient.BulkIndexBlocks(ctx, docs); err != nil {
				return fmt.Errorf("bulk indexing %d blocks for note %s: %w", len(docs), noteID, err)
			}
		}

		log.Printf("[handler] successfully indexed note %s (%d text-bearing blocks)", noteID, len(docs))
		return nil

	default:
		// Reserved or future event types (e.g. note.published) are no-ops
		log.Printf("[handler] ignored event type %q (id: %s)", env.EventType, env.EventID)
		return nil
	}
}
