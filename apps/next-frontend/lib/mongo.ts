import { MongoClient, type Db } from "mongodb";

/**
 * Cached MongoDB client for the BetterAuth layer.
 *
 * FastAPI (motor) remains the owner of the application collections. This
 * client exists only so BetterAuth can read/write its own auth collections
 * (`user`, `session`, `account`, `verification`, `jwks`) and the `profiles`
 * collection it seeds on signup.
 *
 * The client is cached on `globalThis` in development so Next.js's module
 * reloading does not open a new connection pool on every edit. In
 * production the module is evaluated once per process, and the cache keeps
 * a single pool per warm instance.
 */

const globalForMongo = globalThis as unknown as {
  _jamMongoClient?: MongoClient;
};

const MONGODB_URL =
  process.env.MONGODB_URL ?? process.env.DATABASE_URL ?? "mongodb://127.0.0.1:27017";

const DATABASE_NAME = process.env.DATABASE_NAME ?? "jam_note";

function createClient(): MongoClient {
  return new MongoClient(MONGODB_URL, {
    // Match the FastAPI client's tolerance for slow Atlas handshakes.
    serverSelectionTimeoutMS: 15_000,
    // Keep the pool small: the Next.js layer only serves auth traffic.
    maxPoolSize: 10,
  });
}

export const mongoClient: MongoClient =
  globalForMongo._jamMongoClient ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForMongo._jamMongoClient = mongoClient;
}

export const db: Db = mongoClient.db(DATABASE_NAME);
