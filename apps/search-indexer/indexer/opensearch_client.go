package indexer

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"github.com/opensearch-project/opensearch-go/v4"
	"github.com/opensearch-project/opensearch-go/v4/opensearchapi"
	"search-indexer/config"
	"search-indexer/schema"
)

// SearchClient defines the search engine interface for indexing and pruning note blocks.
type SearchClient interface {
	EnsureIndex(ctx context.Context) error
	DeleteByNoteID(ctx context.Context, noteID string) error
	BulkIndexBlocks(ctx context.Context, docs []NoteDoc) error
}

// OSClient implements SearchClient using opensearch-go/v4.
type OSClient struct {
	client    *opensearchapi.Client
	indexName string
	aliasName string
}

// NewOSClient initializes an OpenSearch client from configuration.
func NewOSClient(cfg *config.Config) (*OSClient, error) {
	parsedURL, err := url.Parse(cfg.OpenSearchURL)
	if err != nil {
		return nil, fmt.Errorf("parsing OpenSearch URL: %w", err)
	}

	user := cfg.OpenSearchUser
	pass := cfg.OpenSearchPassword
	if user == "" && parsedURL.User != nil {
		user = parsedURL.User.Username()
		pass, _ = parsedURL.User.Password()
	}

	cleanURL := fmt.Sprintf("%s://%s", parsedURL.Scheme, parsedURL.Host)
	if parsedURL.Path != "" && parsedURL.Path != "/" {
		cleanURL += parsedURL.Path
	}

	var tlsConfig *tls.Config
	if parsedURL.Scheme == "https" {
		tlsConfig = &tls.Config{
			MinVersion: tls.VersionTLS12,
		}
	}

	tp := http.DefaultTransport.(*http.Transport).Clone()
	if tlsConfig != nil {
		tp.TLSClientConfig = tlsConfig
	}

	osCfg := opensearch.Config{
		Addresses: []string{cleanURL},
		Username:  user,
		Password:  pass,
		Transport: tp,
	}

	apiClient, err := opensearchapi.NewClient(opensearchapi.Config{Client: osCfg})
	if err != nil {
		return nil, fmt.Errorf("creating opensearch client: %w", err)
	}

	return &OSClient{
		client:    apiClient,
		indexName: cfg.OpenSearchIndex,
		aliasName: cfg.OpenSearchAlias,
	}, nil
}

// NewOSClientWithAPIClient allows injecting an existing opensearchapi.Client (e.g. for testing).
func NewOSClientWithAPIClient(client *opensearchapi.Client, indexName, aliasName string) *OSClient {
	return &OSClient{
		client:    client,
		indexName: indexName,
		aliasName: aliasName,
	}
}

// EnsureIndex verifies the index and alias exist on startup, creating them if absent.
func (c *OSClient) EnsureIndex(ctx context.Context) error {
	// 1. Check if the physical index exists
	existsResp, err := c.client.Indices.Exists(ctx, opensearchapi.IndicesExistsReq{
		Indices: []string{c.indexName},
	})
	if existsResp != nil && existsResp.StatusCode == http.StatusNotFound {
		// Index does not exist -> Create index with settings, mappings, and alias
		schemaBytes, err := schema.BuildIndexSchemaJSON(c.aliasName)
		if err != nil {
			return fmt.Errorf("building index schema: %w", err)
		}

		createResp, err := c.client.Indices.Create(ctx, opensearchapi.IndicesCreateReq{
			Index: c.indexName,
			Body:  bytes.NewReader(schemaBytes),
		})
		if err != nil {
			return fmt.Errorf("creating index %s: %w", c.indexName, err)
		}
		if createResp == nil || !createResp.Acknowledged {
			return fmt.Errorf("creating index %s: not acknowledged", c.indexName)
		}
		return nil
	} else if err != nil {
		return fmt.Errorf("checking index %s existence: %w", c.indexName, err)
	}

	// 2. Index exists. Check if alias exists on the index
	aliasResp, err := c.client.Indices.Alias.Exists(ctx, opensearchapi.AliasExistsReq{
		Indices: []string{c.indexName},
		Alias:   []string{c.aliasName},
	})
	if aliasResp != nil && aliasResp.StatusCode == http.StatusNotFound {
		// Alias does not exist -> create it
		putResp, err := c.client.Indices.Alias.Put(ctx, opensearchapi.AliasPutReq{
			Indices: []string{c.indexName},
			Alias:   c.aliasName,
		})
		if err != nil {
			return fmt.Errorf("adding alias %s to index %s: %w", c.aliasName, c.indexName, err)
		}
		if putResp == nil || !putResp.Acknowledged {
			return fmt.Errorf("adding alias %s to index %s: not acknowledged", c.aliasName, c.indexName)
		}
		return nil
	} else if err != nil {
		return fmt.Errorf("checking alias %s existence: %w", c.aliasName, err)
	}

	return nil
}

// DeleteByNoteID removes all blocks for the given note_id using DeleteByQuery.
func (c *OSClient) DeleteByNoteID(ctx context.Context, noteID string) error {
	query := fmt.Sprintf(`{"query":{"term":{"note_id":%q}}}`, noteID)

	resp, err := c.client.Document.DeleteByQuery(ctx, opensearchapi.DocumentDeleteByQueryReq{
		Indices: []string{c.aliasName},
		Body:    strings.NewReader(query),
	})
	if err != nil {
		return fmt.Errorf("delete by note_id %s: %w", noteID, err)
	}
	if resp != nil && len(resp.Failures) > 0 {
		return fmt.Errorf("delete by note_id %s encountered failures: %+v", noteID, resp.Failures)
	}

	return nil
}

// BulkIndexBlocks indexes the provided blocks into the alias target using bulk NDJSON.
func (c *OSClient) BulkIndexBlocks(ctx context.Context, docs []NoteDoc) error {
	if len(docs) == 0 {
		return nil
	}

	var buf bytes.Buffer
	for _, doc := range docs {
		docID := DocID(doc.NoteID, doc.BlockID)
		actionLine := fmt.Sprintf(`{"index":{"_index":%q,"_id":%q}}`+"\n", c.aliasName, docID)
		buf.WriteString(actionLine)

		docBytes, err := json.Marshal(doc)
		if err != nil {
			return fmt.Errorf("marshaling note block doc %s: %w", docID, err)
		}
		buf.Write(docBytes)
		buf.WriteByte('\n')
	}

	resp, err := c.client.Bulk(ctx, opensearchapi.BulkReq{
		Index: c.aliasName,
		Body:  &buf,
	})
	if err != nil {
		return fmt.Errorf("bulk indexing %d blocks: %w", len(docs), err)
	}
	if resp != nil && resp.Errors {
		if failures := resp.BulkItemFailures(); failures != nil {
			return fmt.Errorf("bulk indexing failed items: %w", failures)
		}
		return fmt.Errorf("bulk indexing had errors for %d blocks", len(docs))
	}

	return nil
}
