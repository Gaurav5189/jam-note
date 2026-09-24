package schema

import (
	_ "embed"
	"encoding/json"
	"fmt"
)

//go:embed notes_blocks_schema.json
var DefaultSchemaJSON []byte

const (
	DefaultIndexName = "notes-blocks-v1"
	DefaultAliasName = "notes-blocks"
)

// BuildIndexSchemaJSON returns the OpenSearch index configuration JSON
// with the specified alias name configured in the aliases block.
func BuildIndexSchemaJSON(aliasName string) ([]byte, error) {
	if aliasName == "" {
		aliasName = DefaultAliasName
	}

	var schema map[string]any
	if err := json.Unmarshal(DefaultSchemaJSON, &schema); err != nil {
		return nil, fmt.Errorf("parsing default schema json: %w", err)
	}

	aliases := map[string]any{
		aliasName: map[string]any{},
	}
	schema["aliases"] = aliases

	return json.Marshal(schema)
}
