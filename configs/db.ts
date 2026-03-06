import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Load env from project root .env first, then nested app .env fallback.
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), 'Fitfusion.ai/.env') });

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Add it to your .env file.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,

  // Cloud Postgres providers like Neon require SSL.
  ssl: { rejectUnauthorized: false },

  max: 10,
  idleTimeoutMillis: 20000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[DB] Idle client error:', err.message);
});

async function runStartupMigrations(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS recommendations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category VARCHAR(20) NOT NULL
        CHECK (category IN ('nutrition','activity','mental_health','general')),
      title VARCHAR(200) NOT NULL,
      body TEXT NOT NULL,
      score NUMERIC(4,3) CHECK (score BETWEEN 0 AND 1),
      source VARCHAR(20) NOT NULL DEFAULT 'ml'
        CHECK (source IN ('ml','rule_based','admin')),
      is_read BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_recommendations_user_time
      ON recommendations (user_id, created_at DESC);
  `);

  // Keep schema in sync with mood service inserts.
  await client.query(`
    ALTER TABLE mood_logs
      ADD COLUMN IF NOT EXISTS sentiment_score NUMERIC(6,3),
      ADD COLUMN IF NOT EXISTS sentiment_label VARCHAR(30),
      ADD COLUMN IF NOT EXISTS primary_emotion VARCHAR(50),
      ADD COLUMN IF NOT EXISTS sentiment_data JSONB;
  `);
}

export async function connectDB(): Promise<void> {
  const client = await pool.connect();
  try {
    await runStartupMigrations(client);
    const { rows } = await client.query('SELECT NOW() AS now, current_database() AS db');
    console.log(`[DB] Connected to database: "${rows[0].db}" | time: ${rows[0].now}`);
  } finally {
    client.release();
  }
}

export async function disconnectDB(): Promise<void> {
  await pool.end();
  console.log('[DB] Pool closed');
}

export default pool;
