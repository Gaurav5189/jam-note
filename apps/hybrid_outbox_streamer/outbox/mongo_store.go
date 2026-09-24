package outbox

import (
	"context"
	"errors"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// MongoStore implements Store on top of MongoDB Atlas.
type MongoStore struct {
	client     *mongo.Client
	db         *mongo.Database
	outboxColl *mongo.Collection
	stateColl  *mongo.Collection
}

// NewMongoStore connects to MongoDB and initializes collection references.
func NewMongoStore(ctx context.Context, uri, dbName string) (*MongoStore, error) {
	clientOpts := options.Client().ApplyURI(uri)
	client, err := mongo.Connect(clientOpts)
	if err != nil {
		return nil, err
	}

	// Ping database to verify connectivity.
	pingCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := client.Ping(pingCtx, nil); err != nil {
		_ = client.Disconnect(ctx)
		return nil, err
	}

	db := client.Database(dbName)
	return &MongoStore{
		client:     client,
		db:         db,
		outboxColl: db.Collection("event_outbox"),
		stateColl:  db.Collection("streamer_state"),
	}, nil
}

// NewMongoStoreWithClient wraps an existing client and database.
func NewMongoStoreWithClient(client *mongo.Client, db *mongo.Database) *MongoStore {
	return &MongoStore{
		client:     client,
		db:         db,
		outboxColl: db.Collection("event_outbox"),
		stateColl:  db.Collection("streamer_state"),
	}
}

// Database returns the underlying mongo Database.
func (m *MongoStore) Database() *mongo.Database {
	return m.db
}

// OutboxCollection returns the event_outbox collection.
func (m *MongoStore) OutboxCollection() *mongo.Collection {
	return m.outboxColl
}

// Claim atomically claims an event for publishing.
func (m *MongoStore) Claim(ctx context.Context, eventID string, leaseDuration time.Duration) (*OutboxRecord, error) {
	now := time.Now().UTC()
	expiredThreshold := now.Add(-leaseDuration)

	filter := bson.D{
		{Key: "event_id", Value: eventID},
		{Key: "$or", Value: bson.A{
			bson.D{{Key: "status", Value: StatusPending}},
			bson.D{
				{Key: "status", Value: StatusPublishing},
				{Key: "claimed_at", Value: bson.D{{Key: "$lte", Value: expiredThreshold}}},
			},
		}},
	}

	update := bson.D{
		{Key: "$set", Value: bson.D{
			{Key: "status", Value: StatusPublishing},
			{Key: "claimed_at", Value: now},
		}},
		{Key: "$inc", Value: bson.D{
			{Key: "attempts", Value: 1},
		}},
	}

	opts := options.FindOneAndUpdate().SetReturnDocument(options.After)
	res := m.outboxColl.FindOneAndUpdate(ctx, filter, update, opts)
	if err := res.Err(); err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, nil // Another worker claimed it or already complete
		}
		return nil, err
	}

	var rec OutboxRecord
	if err := res.Decode(&rec); err != nil {
		return nil, err
	}
	return &rec, nil
}

// MarkPublished sets status to "published" and records published_at.
func (m *MongoStore) MarkPublished(ctx context.Context, eventID string, publishedAt time.Time) error {
	filter := bson.D{{Key: "event_id", Value: eventID}}
	update := bson.D{
		{Key: "$set", Value: bson.D{
			{Key: "status", Value: StatusPublished},
			{Key: "published_at", Value: publishedAt},
		}},
		{Key: "$unset", Value: bson.D{
			{Key: "claimed_at", Value: ""},
		}},
	}
	_, err := m.outboxColl.UpdateOne(ctx, filter, update)
	return err
}

// MarkFailed sets status to "failed" with failed_at and error_reason.
func (m *MongoStore) MarkFailed(ctx context.Context, eventID string, failedAt time.Time, reason string) error {
	filter := bson.D{{Key: "event_id", Value: eventID}}
	update := bson.D{
		{Key: "$set", Value: bson.D{
			{Key: "status", Value: StatusFailed},
			{Key: "failed_at", Value: failedAt},
			{Key: "error_reason", Value: reason},
		}},
		{Key: "$unset", Value: bson.D{
			{Key: "claimed_at", Value: ""},
		}},
	}
	_, err := m.outboxColl.UpdateOne(ctx, filter, update)
	return err
}

// GetReconcileCandidates finds pending/due or expired publishing records.
func (m *MongoStore) GetReconcileCandidates(ctx context.Context, leaseDuration time.Duration, limit int64) ([]*OutboxRecord, error) {
	now := time.Now().UTC()
	expiredThreshold := now.Add(-leaseDuration)

	filter := bson.D{
		{Key: "$or", Value: bson.A{
			bson.D{
				{Key: "status", Value: StatusPending},
				{Key: "available_at", Value: bson.D{{Key: "$lte", Value: now}}},
			},
			bson.D{
				{Key: "status", Value: StatusPublishing},
				{Key: "claimed_at", Value: bson.D{{Key: "$lte", Value: expiredThreshold}}},
			},
		}},
	}

	findOpts := options.Find().
		SetSort(bson.D{{Key: "available_at", Value: 1}, {Key: "created_at", Value: 1}}).
		SetLimit(limit)

	cursor, err := m.outboxColl.Find(ctx, filter, findOpts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var candidates []*OutboxRecord
	for cursor.Next(ctx) {
		var rec OutboxRecord
		if err := cursor.Decode(&rec); err != nil {
			return nil, err
		}
		candidates = append(candidates, &rec)
	}
	if err := cursor.Err(); err != nil {
		return nil, err
	}
	return candidates, nil
}

// ReplayFailed resets all failed records back to pending with attempts=0.
func (m *MongoStore) ReplayFailed(ctx context.Context) (int64, error) {
	now := time.Now().UTC()
	filter := bson.D{{Key: "status", Value: StatusFailed}}
	update := bson.D{
		{Key: "$set", Value: bson.D{
			{Key: "status", Value: StatusPending},
			{Key: "attempts", Value: 0},
			{Key: "available_at", Value: now},
		}},
		{Key: "$unset", Value: bson.D{
			{Key: "claimed_at", Value: ""},
			{Key: "failed_at", Value: ""},
			{Key: "error_reason", Value: ""},
		}},
	}

	res, err := m.outboxColl.UpdateMany(ctx, filter, update)
	if err != nil {
		return 0, err
	}
	return res.ModifiedCount, nil
}

// GetResumeToken retrieves the resume token from streamer_state.
func (m *MongoStore) GetResumeToken(ctx context.Context) (bson.Raw, error) {
	filter := bson.D{{Key: "_id", Value: "main_streamer"}}
	res := m.stateColl.FindOne(ctx, filter)
	if err := res.Err(); err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, nil
		}
		return nil, err
	}

	var doc StreamerStateDoc
	if err := res.Decode(&doc); err != nil {
		return nil, err
	}
	return doc.ResumeToken, nil
}

// SaveResumeToken persists the Change Stream resume token in streamer_state.
func (m *MongoStore) SaveResumeToken(ctx context.Context, token bson.Raw) error {
	now := time.Now().UTC()
	filter := bson.D{{Key: "_id", Value: "main_streamer"}}
	update := bson.D{
		{Key: "$set", Value: bson.D{
			{Key: "resume_token", Value: token},
			{Key: "updated_at", Value: now},
		}},
	}
	opts := options.UpdateOne().SetUpsert(true)
	_, err := m.stateColl.UpdateOne(ctx, filter, update, opts)
	return err
}

// ResetResumeToken clears the resume token in streamer_state.
func (m *MongoStore) ResetResumeToken(ctx context.Context) error {
	now := time.Now().UTC()
	filter := bson.D{{Key: "_id", Value: "main_streamer"}}
	update := bson.D{
		{Key: "$set", Value: bson.D{
			{Key: "resume_token", Value: nil},
			{Key: "updated_at", Value: now},
		}},
	}
	opts := options.UpdateOne().SetUpsert(true)
	_, err := m.stateColl.UpdateOne(ctx, filter, update, opts)
	return err
}

// Close disconnects the MongoDB client.
func (m *MongoStore) Close(ctx context.Context) error {
	if m.client != nil {
		return m.client.Disconnect(ctx)
	}
	return nil
}
