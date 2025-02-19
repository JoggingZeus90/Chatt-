import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../shared/schema";

// Get the connection string from environment variable
const connectionString = process.env.DATABASE_URL!;

// Create a new postgres client with migration options
const migrationClient = postgres(connectionString, { max: 1 });

// Create a drizzle client
const db = drizzle(migrationClient);

async function main() {
  try {
    console.log('Running schema push...');

    // Use the schema from shared/schema.ts
    // This will create all tables defined in the schema
    await db.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        is_online BOOLEAN NOT NULL DEFAULT false,
        last_seen TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        avatar_url TEXT,
        role TEXT NOT NULL DEFAULT 'user',
        suspended BOOLEAN NOT NULL DEFAULT false,
        suspended_at TIMESTAMP,
        suspended_reason TEXT,
        muted BOOLEAN NOT NULL DEFAULT false,
        muted_until TIMESTAMP,
        muted_reason TEXT,
        last_username_change TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS rooms (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        created_by_id INTEGER NOT NULL REFERENCES users(id),
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        is_public BOOLEAN NOT NULL DEFAULT true,
        invite_code TEXT UNIQUE
      );

      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        content TEXT,
        media_url TEXT,
        media_type TEXT,
        room_id INTEGER NOT NULL REFERENCES rooms(id),
        user_id INTEGER NOT NULL REFERENCES users(id),
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        edited_at TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS room_members (
        id SERIAL PRIMARY KEY,
        room_id INTEGER NOT NULL REFERENCES rooms(id),
        user_id INTEGER NOT NULL REFERENCES users(id),
        joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS unread_mentions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        message_id INTEGER NOT NULL REFERENCES messages(id),
        room_id INTEGER NOT NULL REFERENCES rooms(id),
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('Schema push completed successfully');
  } catch (error) {
    console.error('Error during schema push:', error);
  } finally {
    await migrationClient.end();
  }
}

main();