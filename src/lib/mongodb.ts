import { MongoClient, type Db } from "mongodb";

const uri = process.env.MONGODB_URI || "";

if (!uri) {
  console.warn("MONGODB_URI is not configured. MongoDB-backed link checks and cron features will be disabled.");
}

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

export async function getMongoClient(): Promise<MongoClient | null> {
  if (!uri) return null;

  if (cachedClient) return cachedClient;

  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
    maxPoolSize: 10,
    minPoolSize: 1,
  });

  await client.connect();
  cachedClient = client;
  return client;
}

export async function getMongoDb(): Promise<Db | null> {
  if (!uri) return null;

  if (cachedDb) return cachedDb;

  const client = await getMongoClient();
  if (!client) return null;

  const dbName = process.env.MONGODB_DB || "flixcasa";
  cachedDb = client.db(dbName);
  return cachedDb;
}

export async function closeMongoClient(): Promise<void> {
  if (cachedClient) {
    await cachedClient.close();
    cachedClient = null;
    cachedDb = null;
  }
}
