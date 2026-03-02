import { Pool } from 'pg';
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

export async function connectDB(): Promise<void> {
  const client = await pool.connect();
  try {
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
