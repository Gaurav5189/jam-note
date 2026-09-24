package indexer

import (
	"context"
	"errors"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// NoteReader provides read-only access to MongoDB note documents.
type NoteReader interface {
	GetNote(ctx context.Context, noteID string) (*MongoNote, error)
	Close(ctx context.Context) error
}

// MongoNoteReader implements NoteReader on top of MongoDB Atlas.
type MongoNoteReader struct {
	client *mongo.Client
	db     *mongo.Database
	notes  *mongo.Collection
}

// NewMongoNoteReader connects to MongoDB and initializes the notes collection.
func NewMongoNoteReader(ctx context.Context, uri, dbName string) (*MongoNoteReader, error) {
	clientOpts := options.Client().ApplyURI(uri)
	client, err := mongo.Connect(clientOpts)
	if err != nil {
		return nil, fmt.Errorf("connecting to mongodb: %w", err)
	}

	pingCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := client.Ping(pingCtx, nil); err != nil {
		_ = client.Disconnect(ctx)
		return nil, fmt.Errorf("pinging mongodb: %w", err)
	}

	db := client.Database(dbName)
	return &MongoNoteReader{
		client: client,
		db:     db,
		notes:  db.Collection("notes"),
	}, nil
}

// NewMongoNoteReaderWithClient wraps an existing client and database (useful for testing).
func NewMongoNoteReaderWithClient(client *mongo.Client, db *mongo.Database) *MongoNoteReader {
	return &MongoNoteReader{
		client: client,
		db:     db,
		notes:  db.Collection("notes"),
	}
}

// GetNote retrieves a note by ID. If not found, it returns (nil, nil).
func (r *MongoNoteReader) GetNote(ctx context.Context, noteID string) (*MongoNote, error) {
	var filter bson.M
	if objID, err := bson.ObjectIDFromHex(noteID); err == nil {
		filter = bson.M{
			"$or": []bson.M{
				{"_id": objID},
				{"_id": noteID},
			},
		}
	} else {
		filter = bson.M{"_id": noteID}
	}

	var note MongoNote
	err := r.notes.FindOne(ctx, filter).Decode(&note)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, nil
		}
		return nil, fmt.Errorf("finding note %s: %w", noteID, err)
	}

	return &note, nil
}

// Close disconnects the MongoDB client.
func (r *MongoNoteReader) Close(ctx context.Context) error {
	if r.client != nil {
		return r.client.Disconnect(ctx)
	}
	return nil
}
