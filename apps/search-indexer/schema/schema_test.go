package schema

import (
	"encoding/json"
	"testing"
)

func TestIndexSchemaStructure(t *testing.T) {
	bytes, err := BuildIndexSchemaJSON("notes-blocks-test")
	if err != nil {
		t.Fatalf("BuildIndexSchemaJSON failed: %v", err)
	}

	var parsed map[string]any
	if err := json.Unmarshal(bytes, &parsed); err != nil {
		t.Fatalf("unmarshaling schema: %v", err)
	}

	// Verify settings
	settings, ok := parsed["settings"].(map[string]any)
	if !ok {
		t.Fatalf("missing settings block")
	}
	indexSettings, ok := settings["index"].(map[string]any)
	if !ok {
		t.Fatalf("missing index settings block")
	}
	if indexSettings["number_of_shards"] != float64(1) {
		t.Errorf("expected 1 shard, got %v", indexSettings["number_of_shards"])
	}
	if indexSettings["number_of_replicas"] != float64(1) {
		t.Errorf("expected 1 replica, got %v", indexSettings["number_of_replicas"])
	}

	// Verify analysis settings
	analysis, ok := settings["analysis"].(map[string]any)
	if !ok {
		t.Fatalf("missing analysis block")
	}
	analyzers, ok := analysis["analyzer"].(map[string]any)
	if !ok {
		t.Fatalf("missing analyzer block")
	}
	autocomplete, ok := analyzers["autocomplete"].(map[string]any)
	if !ok {
		t.Fatalf("missing autocomplete analyzer")
	}
	if autocomplete["tokenizer"] != "standard" {
		t.Errorf("expected standard tokenizer, got %v", autocomplete["tokenizer"])
	}

	filters, ok := analysis["filter"].(map[string]any)
	if !ok {
		t.Fatalf("missing filter block")
	}
	acFilter, ok := filters["autocomplete_filter"].(map[string]any)
	if !ok {
		t.Fatalf("missing autocomplete_filter")
	}
	if acFilter["type"] != "edge_ngram" {
		t.Errorf("expected edge_ngram type, got %v", acFilter["type"])
	}
	if acFilter["min_gram"] != float64(1) || acFilter["max_gram"] != float64(20) {
		t.Errorf("expected min_gram: 1, max_gram: 20, got %v, %v", acFilter["min_gram"], acFilter["max_gram"])
	}

	// Verify mappings
	mappings, ok := parsed["mappings"].(map[string]any)
	if !ok {
		t.Fatalf("missing mappings block")
	}
	props, ok := mappings["properties"].(map[string]any)
	if !ok {
		t.Fatalf("missing properties block")
	}

	expectedFields := map[string]string{
		"user_id":     "keyword",
		"note_id":     "keyword",
		"block_id":    "keyword",
		"note_title":  "text",
		"block_order": "integer",
		"text":        "text",
		"updated_at":  "date",
	}

	for field, expectedType := range expectedFields {
		fMap, ok := props[field].(map[string]any)
		if !ok {
			t.Errorf("missing field %s in properties", field)
			continue
		}
		if fMap["type"] != expectedType {
			t.Errorf("field %s: expected type %s, got %v", field, expectedType, fMap["type"])
		}
	}

	// Check note_title.fields.autocomplete
	titleProp := props["note_title"].(map[string]any)
	subFields, ok := titleProp["fields"].(map[string]any)
	if !ok {
		t.Fatalf("missing fields subfield in note_title")
	}
	acSubfield, ok := subFields["autocomplete"].(map[string]any)
	if !ok {
		t.Fatalf("missing autocomplete subfield in note_title.fields")
	}
	if acSubfield["type"] != "text" || acSubfield["analyzer"] != "autocomplete" {
		t.Errorf("expected text type and autocomplete analyzer for note_title.fields.autocomplete")
	}

	// Verify alias
	aliases, ok := parsed["aliases"].(map[string]any)
	if !ok {
		t.Fatalf("missing aliases block")
	}
	if _, ok := aliases["notes-blocks-test"]; !ok {
		t.Errorf("expected alias notes-blocks-test in aliases block")
	}
}
