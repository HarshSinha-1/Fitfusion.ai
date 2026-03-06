/**
 * services/mood.service.ts
 *
 * Orchestrates the full Mood → Sentiment → Meal & Workout pipeline.
 *
 * UPDATED: Now queries yesterday's activity_logs before generating
 * workout recommendations. This closes the feedback loop:
 *
 *   yesterday's workout → today's mood → adapted meal + workout plan
 */

import pool from '../configs/db';
import {
  analyzeSentiment,
  classifyMoodState,
  SentimentResult,
  MoodState,
} from './sentiment.service';
import { getMoodAwareMealPlan }  from './mood-nutrition.service';
import { getMoodAwareWorkout }   from './mood-fitness.service';
import { activityService }       from './activity.service';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
interface LogMoodInput {
  mood_score:     number;
  mood_tags:      string[];
  journal_entry?: string;
  circle_id?:     string;
}

const EMPTY_SENTIMENT: SentimentResult = {
  score: 0, label: 'neutral', raw_comparative: 0,
  emotions: [], primary_emotion: 'neutral', confidence: 0,
  positive_words: [], negative_words: [],
};

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────────────────────────────────────────
export const moodService = {

  async logMoodAndAnalyze(userId: string, input: LogMoodInput) {
    const { mood_score, mood_tags, journal_entry, circle_id } = input;

    // ── 1. Run sentiment analysis ──────────────────────────────────
    let sentiment: SentimentResult = EMPTY_SENTIMENT;
    if (journal_entry && journal_entry.trim().length > 0) {
      sentiment = analyzeSentiment(journal_entry);
    }

    // ── 2. Save mood log to DB ─────────────────────────────────────
    const { rows } = await pool.query(
      `INSERT INTO mood_logs
         (user_id, mood_score, mood_tags, journal_entry, is_encrypted,
          circle_id, sentiment_score, sentiment_label, primary_emotion,
          sentiment_data, logged_at)
       VALUES ($1, $2, $3, $4, false, $5, $6, $7, $8, $9, NOW())
       RETURNING *`,
      [
        userId, mood_score, JSON.stringify(mood_tags),
        journal_entry || null, circle_id || null,
        sentiment.score, sentiment.label, sentiment.primary_emotion,
        JSON.stringify(sentiment),
      ],
    );
    const moodLog = rows[0];

    // ── 3. Classify mood state ─────────────────────────────────────
    const moodState: MoodState = classifyMoodState(sentiment, mood_score, mood_tags);

    // ── 4. Fetch user profile ──────────────────────────────────────
    const { rows: userRows } = await pool.query(
      `SELECT fitness_level, dietary_preferences, weight_kg
       FROM users WHERE id = $1`,
      [userId],
    );
    const profile   = userRows[0] || {};
    const dietPrefs: string[] = Array.isArray(profile.dietary_preferences)
      ? profile.dietary_preferences
      : JSON.parse(profile.dietary_preferences || '[]');
    const isVeg = dietPrefs.some((p: string) =>
      ['vegetarian', 'vegan', 'jain'].includes(p),
    );

    // ── 5. Fetch yesterday's activity (THE KEY CONNECTION) ─────────
    const yesterdayActivity = await activityService.getYesterdayActivity(userId);

    // ── 6. Generate mood-aware recommendations ─────────────────────
    const mealPlan    = getMoodAwareMealPlan(moodState, 1, isVeg);
    const workoutPlan = getMoodAwareWorkout(
      moodState,
      profile.fitness_level || 4,
      yesterdayActivity,  // ← passes yesterday's data to the workout recommender
    );

    // ── 7. Store recommendations in DB ─────────────────────────────
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO recommendations
           (user_id, category, title, body, score, source, created_at, expires_at)
         VALUES ($1, 'nutrition', $2, $3, $4, 'ml', NOW(), NOW() + INTERVAL '24 hours')`,
        [
          userId,
          `Mood-Aware Meal Plan (${moodState})`,
          JSON.stringify(mealPlan),
          sentiment.confidence || 0.5,
        ],
      );

      await client.query(
        `INSERT INTO recommendations
           (user_id, category, title, body, score, source, created_at, expires_at)
         VALUES ($1, 'activity', $2, $3, $4, 'ml', NOW(), NOW() + INTERVAL '24 hours')`,
        [
          userId,
          `Mood-Aware Workout Plan (${moodState})`,
          JSON.stringify(workoutPlan),
          sentiment.confidence || 0.5,
        ],
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // ── 8. Return full response ────────────────────────────────────
    return {
      mood_log:           moodLog,
      sentiment_analysis: sentiment,
      mood_state:         moodState,
      yesterday_activity: yesterdayActivity,
      recommendations: {
        meals:   mealPlan,
        workout: workoutPlan,
      },
    };
  },

  async getMoodHistory(userId: string, days: number = 30) {
    const { rows } = await pool.query(
      `SELECT id, mood_score, mood_tags, journal_entry,
              sentiment_score, sentiment_label, primary_emotion,
              circle_id, logged_at
       FROM mood_logs
       WHERE user_id = $1
         AND logged_at >= NOW() - INTERVAL '1 day' * $2
       ORDER BY logged_at DESC`,
      [userId, days],
    );
    return { period_days: days, total_logs: rows.length, logs: rows };
  },

  async getLatestMoodRecommendations(userId: string) {
    const { rows } = await pool.query(
      `SELECT id, category, title, body, score, source, created_at, expires_at
       FROM recommendations
       WHERE user_id = $1
         AND source = 'ml'
         AND category IN ('nutrition', 'activity')
         AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY created_at DESC
       LIMIT 4`,
      [userId],
    );
    return rows.map((row) => ({
      ...row,
      body: typeof row.body === 'string' ? JSON.parse(row.body) : row.body,
    }));
  },
};