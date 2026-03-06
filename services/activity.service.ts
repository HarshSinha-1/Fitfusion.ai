/**
 * services/activity.service.ts
 *
 * All business logic for fitness activity tracking.
 * The controller calls these methods — this file talks to the database.
 *
 * Responsibilities:
 *  1. logActivity()          → save a workout to activity_logs (student or admin)
 *  2. getDailySummary()      → all activities for a given day + totals
 *  3. getActivityHistory()   → multi-day history for trend charts
 *  4. getYesterdayActivity() → used by mood-fitness pipeline to adapt workouts
 *  5. getActivityForUser()   → admin: fetch any student's history
 */

import pool from '../configs/db';

// ─────────────────────────────────────────────────────────────────────────────
// CALORIE ESTIMATION
// MET values × weight × duration. Used when calories_burned is not provided.
// ─────────────────────────────────────────────────────────────────────────────
const MET_VALUES: Record<string, Record<string, number>> = {
  running:      { low: 6.0, moderate: 8.3, high: 11.0 },
  gym:          { low: 3.5, moderate: 5.0, high: 8.0 },
  yoga:         { low: 2.5, moderate: 3.5, high: 5.0 },
  cycling:      { low: 4.0, moderate: 6.8, high: 10.0 },
  swimming:     { low: 5.0, moderate: 7.0, high: 10.0 },
  sports:       { low: 4.0, moderate: 6.0, high: 8.0 },
  HIIT:         { low: 6.0, moderate: 8.0, high: 12.0 },
  walking:      { low: 2.5, moderate: 3.5, high: 5.0 },
  stretching:   { low: 2.0, moderate: 2.5, high: 3.0 },
  meditation:   { low: 1.5, moderate: 1.5, high: 1.5 },
  dancing:      { low: 3.5, moderate: 5.5, high: 7.5 },
  martial_arts: { low: 5.0, moderate: 7.0, high: 10.0 },
  other:        { low: 3.0, moderate: 5.0, high: 7.0 },
};

function estimateCalories(
  activityType: string,
  intensity: string,
  durationMinutes: number,
  weightKg: number,
): number {
  const mets = MET_VALUES[activityType] || MET_VALUES.other;
  const met  = mets[intensity] || mets.moderate;
  // Calories = MET × weight(kg) × duration(hours)
  return Math.round(met * weightKg * (durationMinutes / 60));
}

function round1(n: number) { return +n.toFixed(1); }

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────────────────────────────────────────
export const activityService = {

  // ── 1. LOG ACTIVITY ─────────────────────────────────────────────────────
  /**
   * Save a workout to activity_logs.
   * Auto-estimates calories burned if not provided.
   *
   * @param userId   - who did the workout (student's UUID)
   * @param body     - validated request body
   * @param loggedBy - who is logging (same as userId for self-log, admin's id for trainer)
   */
  async logActivity(
    userId: string,
    body: {
      activity_type:    string;
      duration_minutes: number;
      intensity?:       string;
      sets?:            number;
      reps?:            number;
      weight_kg?:       number;
      calories_burned?: number;
      location?:        string;
      zone?:            string;
      notes?:           string;
      logged_at?:       string;
    },
    loggedBy: string,
  ) {
    const {
      activity_type, duration_minutes, intensity = 'moderate',
      sets, reps, weight_kg: exerciseWeight,
      calories_burned, location, zone, notes, logged_at,
    } = body;

    // Fetch user weight for calorie estimation
    const { rows: userRows } = await pool.query(
      'SELECT weight_kg FROM users WHERE id = $1',
      [userId],
    );
    const userWeight = parseFloat(userRows[0]?.weight_kg) || 65;

    // Auto-estimate calories if not provided
    const finalCalories = calories_burned ?? estimateCalories(
      activity_type, intensity, duration_minutes, userWeight,
    );

    const logTime = logged_at || new Date().toISOString();

    const { rows } = await pool.query(
      `INSERT INTO activity_logs
         (user_id, activity_type, duration_minutes, intensity,
          sets, reps, weight_kg, calories_burned,
          location, zone, notes, logged_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        userId, activity_type, duration_minutes, intensity,
        sets || null, reps || null, exerciseWeight || null,
        round1(finalCalories),
        location || null, zone || null, notes || null,
        logTime,
      ],
    );

    return {
      ...rows[0],
      calories_estimated: !calories_burned,
      logged_by:          loggedBy,
    };
  },

  // ── 2. DAILY SUMMARY ───────────────────────────────────────────────────
  /**
   * All activities for a given day + aggregated totals.
   * Defaults to today.
   */
  async getDailySummary(userId: string, date?: string) {
    const targetDate = date || new Date().toISOString().split('T')[0];

    const { rows: activities } = await pool.query(
      `SELECT id, activity_type, duration_minutes, intensity,
              sets, reps, weight_kg, calories_burned,
              location, zone, notes, logged_at
       FROM activity_logs
       WHERE user_id = $1 AND DATE(logged_at AT TIME ZONE 'UTC') = $2
       ORDER BY logged_at ASC`,
      [userId, targetDate],
    );

    const totals = {
      total_minutes:         activities.reduce((s, r) => s + (r.duration_minutes || 0), 0),
      total_calories_burned: round1(activities.reduce((s, r) => s + parseFloat(r.calories_burned || 0), 0)),
      activity_count:        activities.length,
      activity_types:        [...new Set(activities.map((a) => a.activity_type))],
      had_high_intensity:    activities.some((a) => a.intensity === 'high'),
    };

    return {
      date: targetDate,
      activities,
      totals,
    };
  },

  // ── 3. ACTIVITY HISTORY ─────────────────────────────────────────────────
  /**
   * Multi-day history for trend charts.
   * Returns daily aggregates for the past N days.
   */
  async getActivityHistory(userId: string, days: number = 30) {
    days = Math.min(days, 90);

    const { rows } = await pool.query(
      `SELECT
         DATE(logged_at AT TIME ZONE 'UTC')    AS date,
         SUM(duration_minutes)::integer        AS total_minutes,
         SUM(calories_burned)::numeric(10,1)   AS total_calories_burned,
         COUNT(*)::integer                     AS activity_count,
         ARRAY_AGG(DISTINCT activity_type)     AS activity_types,
         MAX(intensity)                        AS max_intensity
       FROM activity_logs
       WHERE user_id = $1
         AND logged_at >= NOW() - ($2 || ' days')::interval
       GROUP BY DATE(logged_at AT TIME ZONE 'UTC')
       ORDER BY date ASC`,
      [userId, days],
    );

    const activeDays = rows.length;
    const restDays   = days - activeDays;

    return {
      period_days:  days,
      active_days:  activeDays,
      rest_days:    restDays,
      data:         rows,
    };
  },

  // ── 4. YESTERDAY'S ACTIVITY ─────────────────────────────────────────────
  /**
   * Used by the mood-fitness pipeline.
   * Returns a summary of what the user did yesterday
   * so the workout recommender can adapt.
   *
   * Returns null if no activity was logged yesterday.
   */
  async getYesterdayActivity(userId: string) {
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];

    const { rows } = await pool.query(
      `SELECT
         SUM(duration_minutes)::integer       AS total_minutes,
         SUM(calories_burned)::numeric(10,1)  AS total_calories_burned,
         COUNT(*)::integer                    AS activity_count,
         ARRAY_AGG(DISTINCT activity_type)    AS activity_types,
         MAX(intensity)                       AS max_intensity
       FROM activity_logs
       WHERE user_id = $1
         AND DATE(logged_at AT TIME ZONE 'UTC') = $2`,
      [userId, dateStr],
    );

    const row = rows[0];

    // No activity yesterday
    if (!row || !row.activity_count || row.activity_count === 0) {
      return null;
    }

    return {
      date:                  dateStr,
      total_minutes:         row.total_minutes,
      total_calories_burned: parseFloat(row.total_calories_burned) || 0,
      activity_count:        row.activity_count,
      activity_types:        row.activity_types || [],
      max_intensity:         row.max_intensity || 'moderate',
      was_intense:           row.max_intensity === 'high',
      was_long:              row.total_minutes >= 60,
    };
  },

  // ── 5. GET ACTIVITY FOR USER (admin) ────────────────────────────────────
  /**
   * Admin/trainer endpoint: view any student's activity history.
   */
  async getActivityForUser(targetUserId: string, days: number = 30) {
    return this.getActivityHistory(targetUserId, days);
  },
};