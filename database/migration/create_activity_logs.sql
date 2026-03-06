-- =============================================================================
-- MIGRATION: Create activity_logs table + related indexes
-- =============================================================================
-- Run this ONCE against your database.
-- Handles the case where schema.sql didn't fully execute.
--
-- IMPORTANT: Your screenshot shows "relation activity_logs does not exist"
-- This script creates it from scratch.
-- =============================================================================

-- ── Required extension ────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- gen_random_uuid()

-- =============================================================================
-- 1. CREATE THE activity_logs TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS activity_logs (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- What they did
  activity_type    VARCHAR(50)   NOT NULL,   -- 'running','gym','yoga','cycling'…
  duration_minutes SMALLINT      NOT NULL CHECK (duration_minutes > 0),
  intensity        VARCHAR(10)   NOT NULL DEFAULT 'moderate'
                     CHECK (intensity IN ('low','moderate','high')),

  -- Strength training details (nullable for cardio)
  sets             SMALLINT,
  reps             SMALLINT,
  weight_kg        NUMERIC(5,1),

  -- Metrics
  calories_burned  NUMERIC(7,1),

  -- Context
  location         VARCHAR(100),  -- 'gym','ground','hostel_room','outdoor'
  zone             VARCHAR(50),   -- campus zone mapping
  notes            TEXT,

  -- When
  logged_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 2. TRY TO CONVERT TO TIMESCALEDB HYPERTABLE
-- =============================================================================
-- TimescaleDB might not be installed in your database.
-- If it fails, the table still works fine as a regular PostgreSQL table.
-- The only difference is slightly slower time-range queries at very large scale.
-- =============================================================================
DO $$
BEGIN
  -- Check if TimescaleDB is available
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'timescaledb'
  ) THEN
    PERFORM create_hypertable('activity_logs', 'logged_at', if_not_exists => TRUE);
    RAISE NOTICE 'TimescaleDB hypertable created for activity_logs.';
  ELSE
    RAISE NOTICE 'TimescaleDB not installed — activity_logs created as regular table (works fine).';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Hypertable conversion skipped: %. Table still works.', SQLERRM;
END;
$$;

-- =============================================================================
-- 3. CREATE INDEXES
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_time
  ON activity_logs (user_id, logged_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_logs_type
  ON activity_logs (activity_type);

-- Extra index for the mood-fitness pipeline (yesterday's activity lookup)
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_date
  ON activity_logs (user_id, (DATE(logged_at AT TIME ZONE 'UTC')));

-- =============================================================================
-- 4. RECREATE THE DAILY ACTIVITY VIEW
-- =============================================================================
-- This view is used by the dashboard. Defined in schema.sql but may not
-- exist if schema.sql didn't fully run.
-- =============================================================================
CREATE OR REPLACE VIEW v_daily_activity AS
SELECT
  user_id,
  DATE(logged_at AT TIME ZONE 'UTC')      AS log_date,
  SUM(duration_minutes)                    AS total_minutes,
  SUM(calories_burned)                     AS total_calories_burned,
  COUNT(*)                                 AS activity_count,
  ARRAY_AGG(DISTINCT activity_type)        AS activity_types
FROM activity_logs
GROUP BY user_id, DATE(logged_at AT TIME ZONE 'UTC');

-- =============================================================================
-- 5. VERIFY
-- =============================================================================
-- After running this, execute:
--   SELECT * FROM activity_logs LIMIT 1;
-- It should return 0 rows (empty table) with NO error.
-- =============================================================================