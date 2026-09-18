# Hybrid Outbox Streamer Implementation Plan v3

## 1. Decision

Use a Go outbox streamer deployed as a persistent AlwaysData service. FastAPI Cloud remains the user-facing API. MongoDB Atlas is authoritative. Aiven Kafka is an asynchronous event stream, not a source of truth.

```text
FastAPI Cloud
    -> MongoDB Atlas transaction
       - note mutation
       - event_outbox insert

AlwaysData Go daemon
    -> MongoDB Change Stream candidates
    -> reconciliation candidates
    -> atomic publisher claim
    -> Aiven Kafka

Kafka consumers
    -> OpenSearch
    -> future analytics, notifications, publishing services
```

The Change Stream is only a low-latency optimization. The outbox collection and reconciliation loop are the durable delivery contract.

## 2. Infrastructure

- AlwaysData: persistent service, `Idle time = 0`, 256 MB RAM, 0.25 vCPU.
- MongoDB Atlas M0: replica set, transactions and Change Streams enabled.
- Aiven Kafka: configured authentication must match the service connection details, either mTLS or TLS plus SASL/SCRAM.
- Kafka topic: `jam-note.note-events.v1`.
- Kafka key: `aggregate_id`, preserving ordering for one note.

Aiven free-service inactivity is handled with an operational `system.heartbeat` event immediately at startup and every six hours. Startup and periodic heartbeat sends use retry backoff. Domain consumers ignore heartbeat events.

## 3. Canonical Outbox Document

```json
{
  "_id": "ObjectId",
  "event_id": "UUID",
  "event_type": "note.changed",
  "schema_version": 1,
  "aggregate_type": "note",
  "aggregate_id": "ObjectId",
  "user_id": "ObjectId",
  "payload": {
    "changed_fields": ["blocks"],
    "updated_at": "ISODate"
  },
  "status": "pending",
  "attempts": 0,
  "available_at": "ISODate",
  "claimed_at": null,
  "published_at": null,
  "failed_at": null,
  "error_reason": null,
  "created_at": "ISODate"
}
```

Valid status transitions:

```text
pending -> publishing -> published
                    -> failed
publishing with expired lease -> publishing
failed with explicit replay -> pending
```

Outbox-control fields are not published to Kafka. Kafka receives a clean event envelope:

```json
{
  "event_id": "UUID",
  "event_type": "note.changed",
  "schema_version": 1,
  "aggregate_type": "note",
  "aggregate_id": "ObjectId",
  "user_id": "ObjectId",
  "payload": {},
  "created_at": "ISODate"
}
```

The initial event type is exactly `note.changed`. All services use snake_case field names.

## 4. MongoDB Setup

Use Atlas or a replica set because the note mutation and outbox insert require a transaction.

```javascript
db.event_outbox.createIndex(
  { "event_id": 1 },
  { unique: true }
);

db.event_outbox.createIndex(
  { "status": 1, "available_at": 1, "claimed_at": 1 }
);

db.event_outbox.createIndex(
  { "published_at": 1 },
  {
    expireAfterSeconds: 604800,
    partialFilterExpression: { "status": "published" }
  }
);

db.streamer_state.updateOne(
  { "_id": "main_streamer" },
  { "$setOnInsert": { "resume_token": null, "updated_at": new Date() } },
  { upsert: true }
);
```

Never TTL-delete pending, publishing, or failed events.

## 5. FastAPI Write Contract

Every note create, update, delete, and publish operation must apply the owner filter and write the business mutation plus outbox event in one transaction.

```python
async with await db.client.start_session() as session:
    async with session.start_transaction():
        result = await db.notes.update_one(
            {"_id": note_id, "user_id": user_id},
            {"$set": changes},
            session=session,
        )
        if result.matched_count != 1:
            raise NoteNotFound()

        await db.event_outbox.insert_one(
            {
                "event_id": str(uuid.uuid4()),
                "event_type": "note.changed",
                "schema_version": 1,
                "aggregate_type": "note",
                "aggregate_id": note_id,
                "user_id": user_id,
                "payload": {
                    "changed_fields": list(changes),
                    "updated_at": datetime.now(timezone.utc),
                },
                "status": "pending",
                "attempts": 0,
                "available_at": datetime.now(timezone.utc),
                "claimed_at": None,
                "published_at": None,
                "created_at": datetime.now(timezone.utc),
            },
            session=session,
        )
```

The transaction is not optional in production. Local mocks may run Kafka-disabled tests, but production outbox mode requires Atlas or a replica set.

## 6. Go Streamer Behavior

### Fast path

1. Open the outbox Change Stream filtered to `insert` operations.
2. Load the DB-backed resume token using the same pipeline and options.
3. Convert each insert into an in-memory candidate with its Change Stream token.
4. Do not mark or claim the event in the Change Stream reader.
5. The publisher owns claiming and delivery.

### Reconciliation path

Every two minutes, enqueue candidates for:

```text
status = pending and available_at <= now
OR
status = publishing and claimed_at <= now - lease_duration
OR
status = failed and explicitly replayed/available for retry
```

The query must be indexed and bounded by a batch limit so a large backlog cannot exhaust memory.

### Publisher path

For every candidate, execute an atomic claim:

```text
_id = candidate.event_id
AND status = pending
OR status = publishing with expired claimed_at
```

Set:

```text
status = publishing
claimed_at = now
attempts = attempts + 1
```

If no document is returned, another publisher already owns it or it is complete. Ignore the candidate.

Then:

1. Serialize the clean Kafka envelope.
2. Publish with the aggregate ID as the Kafka key.
3. Retry transient failures up to the configured limit with context-aware backoff.
4. On success, conditionally mark the exact event `published`.
5. Persist the Change Stream resume token only after Kafka success and the status update.
6. On permanent failure, mark the event `failed` with `failed_at` and `error_reason`.

The publisher must never serialize internal status, lease, or error fields into Kafka.

## 7. Failure Scenarios

| Scenario | Required behavior |
| --- | --- |
| Fast path and poller see the same event | Publisher-side atomic claim allows only one owner. |
| Crash before Kafka publish | Expired `publishing` lease is reclaimed. |
| Kafka accepts message but response is lost | Event may publish again; consumers deduplicate by `event_id`. |
| Kafka outage | Retries stop at the limit; event becomes failed and remains replayable. |
| Change Stream Error 286 | Clear the resume token; reconciliation scans the outbox. |
| Process restart | Load DB resume token; reconciliation repairs any unfinished events. |
| MongoDB outage | Streamer reconnects with bounded backoff; events remain in MongoDB. |
| Heartbeat failure | Retry with backoff; continue normal operation and retry on the next interval. |
| Shutdown signal | Cancel workers, stop new claims, wait up to a bounded drain timeout, then close clients. |
| OpenSearch outage | Consumer retries without affecting MongoDB note writes. |

MongoDB remains the recovery source. Kafka retention is not relied upon for permanent recovery.

## 8. Heartbeat Contract

Heartbeat messages are operational and must not be indexed as note content:

```json
{
  "event_type": "system.heartbeat",
  "source": "jam-note-outbox-streamer",
  "timestamp": "ISODate"
}
```

Send one at startup, retry at approximately one minute, five minutes, and fifteen minutes if necessary, then send every six hours. Make the interval configurable.

## 9. OpenSearch Consumer Contract

Use a dedicated consumer group such as `jam-note-search-indexer`.

- Filter out `system.heartbeat`.
- Filter every query and indexed document by `user_id`.
- Use `event_id` for event deduplication.
- Use `aggregate_id:block_id` as the OpenSearch document ID.
- Retry indexing failures and commit Kafka offsets only after successful processing.
- Keep `scripts/reindex.py` as an idempotent recovery path.

## 10. Security

- Store MongoDB, Kafka, and certificate values only in AlwaysData/FastAPI secret configuration.
- Use a least-privilege MongoDB user with access to `notes`, `event_outbox`, and `streamer_state`.
- Use an Aiven Kafka service user restricted to the event topic and required producer operations.
- Never expose Kafka credentials or certificates to Next.js.
- Preserve `user_id` in every event and enforce tenant filtering in consumers.

## 11. Verification Gate

Before deployment:

```bash
go test ./...
go vet ./...
go build ./...
```

Required failure-injection tests:

- Duplicate Change Stream and reconciliation candidates.
- Crash after Kafka acknowledgement but before MongoDB status update.
- Expired publishing lease recovery.
- Kafka outage and bounded retry.
- Failed-event replay/reset.
- Error 286 and reconciliation catch-up.
- Heartbeat retry behavior.
- Graceful SIGTERM shutdown.
- Tenant isolation in FastAPI transaction and consumer indexing.

Deployment prerequisites:

- FastAPI writes the transactional outbox event for every relevant mutation.
- Aiven authentication mode is verified from the service connection details.
- AlwaysData service restart and outbound MongoDB/Kafka connectivity are tested.
- MongoDB indexes are created before the daemon starts.
