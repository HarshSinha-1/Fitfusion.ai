-- =============================================================================
-- FITFUSION — Complete PostgreSQL Schema
-- Compatible with PostgreSQL 15+ and TimescaleDB
-- Run this once to initialise the entire database.
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";       -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";        -- trigram text search
CREATE EXTENSION IF NOT EXISTS "timescaledb" CASCADE;  -- time-series tables

-- =============================================================================
-- 1. USERS
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
  -- Identity
  id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  email                VARCHAR(255)  NOT NULL UNIQUE,
  password_hash        VARCHAR(255)  NOT NULL,

  -- Profile
  name                 VARCHAR(100)  NOT NULL,
  age                  SMALLINT      NOT NULL CHECK (age BETWEEN 16 AND 60),
  gender               VARCHAR(20)   NOT NULL
                         CHECK (gender IN ('male','female','other','prefer_not_to_say')),
  height_cm            NUMERIC(5,1)  NOT NULL CHECK (height_cm BETWEEN 100 AND 250),
  weight_kg            NUMERIC(5,1)  NOT NULL CHECK (weight_kg BETWEEN 30 AND 300),

  -- 1-3 Beginner | 4-6 Intermediate | 7-9 Advanced  (matches UI scroller)
  fitness_level        SMALLINT      NOT NULL DEFAULT 1
                         CHECK (fitness_level BETWEEN 1 AND 9),

  -- Campus
  hostel               VARCHAR(100)  NOT NULL,
  academic_year        SMALLINT      NOT NULL CHECK (academic_year BETWEEN 1 AND 6),
  branch               VARCHAR(100)  NOT NULL,

  -- Health preferences
  -- JSONB array e.g. ["vegetarian","gluten-free"]
  dietary_preferences  JSONB         NOT NULL DEFAULT '[]',
  medical_history      TEXT,                        -- optional

  -- Auth state
  is_verified          BOOLEAN       NOT NULL DEFAULT false,
  otp_hash             VARCHAR(255),                -- bcrypt-hashed OTP
  otp_expires_at       TIMESTAMPTZ,
  refresh_token_hash   VARCHAR(255),                -- bcrypt-hashed refresh token

  -- Timestamps
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email        ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_hostel       ON users (hostel);
CREATE INDEX IF NOT EXISTS idx_users_branch       ON users (branch);
CREATE INDEX IF NOT EXISTS idx_users_academic_yr  ON users (academic_year);
CREATE INDEX IF NOT EXISTS idx_users_fitness      ON users (fitness_level);

-- =============================================================================
-- 2. FOOD LOGS  (nutrition tracking)
-- =============================================================================
CREATE TABLE IF NOT EXISTS food_logs (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  meal_type        VARCHAR(20)   NOT NULL
                     CHECK (meal_type IN ('breakfast','lunch','snacks','dinner','other')),

  -- JSONB array of items:
  -- [{ name, quantity, unit, source, calories, protein, carbs, fats, fiber }]
  items            JSONB         NOT NULL DEFAULT '[]',

  -- Pre-computed totals (denormalised for fast reads)
  total_calories   NUMERIC(8,1)  NOT NULL DEFAULT 0,
  total_protein    NUMERIC(7,1)  NOT NULL DEFAULT 0,
  total_carbs      NUMERIC(7,1)  NOT NULL DEFAULT 0,
  total_fats       NUMERIC(7,1)  NOT NULL DEFAULT 0,
  total_fiber      NUMERIC(7,1)  NOT NULL DEFAULT 0,

  -- Context
  location         VARCHAR(100),   -- 'mess' | 'canteen' | 'room' | custom
  notes            TEXT,
  logged_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Convert to TimescaleDB hypertable for time-series performance
SELECT create_hypertable('food_logs', 'logged_at', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_food_logs_user_time
  ON food_logs (user_id, logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_food_logs_meal_type
  ON food_logs (meal_type);

-- =============================================================================
-- 3. ACTIVITY LOGS  (fitness tracking)
-- =============================================================================
CREATE TABLE IF NOT EXISTS activity_logs (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  activity_type    VARCHAR(50)   NOT NULL,   -- 'running','gym','yoga','cycling'…
  duration_minutes SMALLINT      NOT NULL CHECK (duration_minutes > 0),
  intensity        VARCHAR(10)   NOT NULL DEFAULT 'moderate'
                     CHECK (intensity IN ('low','moderate','high')),

  -- Strength training details (nullable for cardio)
  sets             SMALLINT,
  reps             SMALLINT,
  weight_kg        NUMERIC(5,1),

  calories_burned  NUMERIC(7,1),
  location         VARCHAR(100),  -- 'gym','ground','hostel_room','outdoor'
  zone             VARCHAR(50),   -- campus zone mapping
  notes            TEXT,
  logged_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

SELECT create_hypertable('activity_logs', 'logged_at', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user_time
  ON activity_logs (user_id, logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_type
  ON activity_logs (activity_type);

-- =============================================================================
-- 4. MOOD LOGS  (mental wellness)
-- =============================================================================
CREATE TABLE IF NOT EXISTS mood_logs (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- 1 (very bad) … 10 (excellent)
  mood_score       SMALLINT      NOT NULL CHECK (mood_score BETWEEN 1 AND 10),

  -- JSONB array of tags e.g. ["stressed","tired","motivated"]
  mood_tags        JSONB         NOT NULL DEFAULT '[]',

  -- Private journal entry — store AES-256 encrypted ciphertext
  journal_entry    TEXT,
  is_encrypted     BOOLEAN       NOT NULL DEFAULT false,

  -- Optional wellness circle link
  circle_id        UUID,          -- FK added after wellness_circles table

  logged_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

SELECT create_hypertable('mood_logs', 'logged_at', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_mood_logs_user_time
  ON mood_logs (user_id, logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_mood_logs_score
  ON mood_logs (mood_score);

-- =============================================================================
-- 5. ENVIRONMENT LOGS  (AQI, noise, crowd, weather)
-- =============================================================================
CREATE TABLE IF NOT EXISTS environment_logs (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Campus zone (e.g. 'main_gate','library','sports_complex','hostel_block_a')
  zone             VARCHAR(100)  NOT NULL,

  -- Air quality
  aqi              SMALLINT      CHECK (aqi BETWEEN 0 AND 500),
  aqi_category     VARCHAR(20)   -- 'good','moderate','unhealthy',…

  -- Noise & crowd
  noise_db         NUMERIC(5,1),
  crowd_density    SMALLINT      CHECK (crowd_density BETWEEN 0 AND 100),

  -- Weather
  temperature_c    NUMERIC(5,1),
  humidity_pct     SMALLINT      CHECK (humidity_pct BETWEEN 0 AND 100),
  rainfall_mm      NUMERIC(5,1)  DEFAULT 0,
  weather_condition VARCHAR(50), -- 'sunny','cloudy','rainy','foggy'

  -- Who logged it (optional — can be automated sensor data)
  logged_by        UUID          REFERENCES users(id) ON DELETE SET NULL,
  logged_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

SELECT create_hypertable('environment_logs', 'logged_at', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_env_logs_zone_time
  ON environment_logs (zone, logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_env_logs_aqi
  ON environment_logs (aqi);

-- =============================================================================
-- 6. WELLNESS CIRCLES  (community groups)
-- =============================================================================
CREATE TABLE IF NOT EXISTS wellness_circles (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name             VARCHAR(100)  NOT NULL,
  description      TEXT,
  category         VARCHAR(50)   NOT NULL,  -- 'meditation','running','yoga'…
  created_by       UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_active        BOOLEAN       NOT NULL DEFAULT true,
  max_members      SMALLINT      DEFAULT 30,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Membership junction table
CREATE TABLE IF NOT EXISTS circle_members (
  circle_id        UUID          NOT NULL REFERENCES wellness_circles(id) ON DELETE CASCADE,
  user_id          UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  role             VARCHAR(20)   NOT NULL DEFAULT 'member'
                     CHECK (role IN ('admin','member')),
  PRIMARY KEY (circle_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_circle_members_user
  ON circle_members (user_id);

-- Add deferred FK from mood_logs to wellness_circles
ALTER TABLE mood_logs
  ADD CONSTRAINT fk_mood_circle
  FOREIGN KEY (circle_id) REFERENCES wellness_circles(id) ON DELETE SET NULL;

-- =============================================================================
-- 7. RECOMMENDATIONS  (AI-generated suggestions)
-- =============================================================================
CREATE TABLE IF NOT EXISTS recommendations (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  category         VARCHAR(20)   NOT NULL
                     CHECK (category IN ('nutrition','activity','mental_health','general')),
  title            VARCHAR(200)  NOT NULL,
  body             TEXT          NOT NULL,

  -- 0.0 – 1.0 confidence score from ML model
  score            NUMERIC(4,3)  CHECK (score BETWEEN 0 AND 1),
  source           VARCHAR(20)   NOT NULL DEFAULT 'ml'
                     CHECK (source IN ('ml','rule_based','admin')),

  -- User feedback
  is_accepted      BOOLEAN,      -- NULL = not yet acted on
  feedback         TEXT,

  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  expires_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_recommendations_user
  ON recommendations (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recommendations_category
  ON recommendations (category);

-- =============================================================================
-- 8. GROUP INSIGHTS  (anonymised aggregated analytics)
-- =============================================================================
CREATE TABLE IF NOT EXISTS group_insights (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Aggregation dimensions
  insight_type     VARCHAR(30)   NOT NULL
                     CHECK (insight_type IN ('hostel','academic_year','branch','campus')),
  dimension_value  VARCHAR(100)  NOT NULL,  -- e.g. 'Hostel A', '2', 'CSE'
  period_type      VARCHAR(10)   NOT NULL
                     CHECK (period_type IN ('daily','weekly','monthly')),
  period_start     DATE          NOT NULL,
  period_end       DATE          NOT NULL,

  -- Aggregated metrics (stored as JSONB for flexibility)
  -- e.g. { avg_calories, avg_steps, avg_mood, participation_rate, ... }
  metrics          JSONB         NOT NULL DEFAULT '{}',

  -- Participant count (for statistical significance)
  participant_count SMALLINT     NOT NULL DEFAULT 0,

  computed_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_group_insights_unique
  ON group_insights (insight_type, dimension_value, period_type, period_start);

CREATE INDEX IF NOT EXISTS idx_group_insights_lookup
  ON group_insights (insight_type, dimension_value, period_start DESC);

-- =============================================================================
-- 9. REFRESH TOKEN BLACKLIST  (for immediate revocation on logout)
-- =============================================================================
CREATE TABLE IF NOT EXISTS token_blacklist (
  token_hash       VARCHAR(255)  PRIMARY KEY,  -- SHA-256 hex of the token
  user_id          UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blacklisted_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  expires_at       TIMESTAMPTZ   NOT NULL       -- auto-cleanup reference
);

CREATE INDEX IF NOT EXISTS idx_token_blacklist_expires
  ON token_blacklist (expires_at);

-- =============================================================================
-- TRIGGERS — auto-update updated_at on every relevant table
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_wellness_circles_updated_at
  BEFORE UPDATE ON wellness_circles
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- =============================================================================
-- VIEWS — commonly joined queries pre-built for the API layer
-- =============================================================================

-- Safe user view (no secrets)
CREATE OR REPLACE VIEW v_users_safe AS
SELECT
  id, email, name, age, gender,
  height_cm, weight_kg, fitness_level,
  hostel, academic_year, branch,
  dietary_preferences, medical_history,
  is_verified, created_at, updated_at
FROM users;

-- Daily nutrition summary per user
CREATE OR REPLACE VIEW v_daily_nutrition AS
SELECT
  user_id,
  DATE(logged_at AT TIME ZONE 'UTC')      AS log_date,
  SUM(total_calories)                      AS total_calories,
  SUM(total_protein)                       AS total_protein,
  SUM(total_carbs)                         AS total_carbs,
  SUM(total_fats)                          AS total_fats,
  SUM(total_fiber)                         AS total_fiber,
  COUNT(*)                                 AS meal_count
FROM food_logs
GROUP BY user_id, DATE(logged_at AT TIME ZONE 'UTC');

-- Daily activity summary per user
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

-- Weekly mood averages per user
CREATE OR REPLACE VIEW v_weekly_mood AS
SELECT
  user_id,
  DATE_TRUNC('week', logged_at)            AS week_start,
  AVG(mood_score)::NUMERIC(4,1)            AS avg_mood,
  MIN(mood_score)                          AS min_mood,
  MAX(mood_score)                          AS max_mood,
  COUNT(*)                                 AS log_count
FROM mood_logs
GROUP BY user_id, DATE_TRUNC('week', logged_at);