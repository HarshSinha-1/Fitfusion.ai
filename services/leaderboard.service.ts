/**
 * services/leaderboard.service.ts
 *
 * Campus Leaderboard — Healthy Competition Engine
 *
 * Computes anonymized, aggregated scores per hostel, branch, and academic year.
 * Stores results in the group_insights table.
 *
 * PRIVACY RULES:
 *   - No individual user data is ever exposed
 *   - Groups with < 5 members are excluded (too identifiable)
 *   - Only averages and percentages are shown
 *
 * SCORING MODEL:
 *   Nutrition Score  (0-100): meal consistency + protein adequacy + calorie adherence
 *   Fitness Score    (0-100): activity minutes + participation rate + variety
 *   Wellness Score   (0-100): avg mood + mood log frequency + journal rate
 *   Overall Score    (0-100): weighted(nutrition:35%, fitness:40%, wellness:25%)
 */

import pool from '../configs/db';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const MIN_GROUP_SIZE      = 5;   // groups with fewer members are hidden
const NUTRITION_WEIGHT    = 0.35;
const FITNESS_WEIGHT      = 0.40;
const WELLNESS_WEIGHT     = 0.25;

// Target benchmarks (what "100%" looks like for scoring)
const TARGET_MEALS_PER_WEEK     = 21;   // 3 meals × 7 days
const TARGET_PROTEIN_G_PER_DAY  = 60;   // minimum healthy protein
const TARGET_ACTIVITY_MIN_WEEK  = 150;  // WHO recommendation
const TARGET_MOOD_LOGS_PER_WEEK = 5;    // 5 of 7 days is "engaged"

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(n * 10) / 10));
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
interface GroupScore {
  dimension:         string;     // hostel name, branch, or year
  participant_count: number;
  nutrition_score:   number;
  fitness_score:     number;
  wellness_score:    number;
  overall_score:     number;
  metrics:           Record<string, any>;
  rank?:             number;
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────────────────────────────────────────
export const leaderboardService = {

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPUTE SCORES (admin triggers this, or runs on a schedule)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Recomputes all leaderboard scores for the given period.
   * Stores results in group_insights.
   *
   * @param periodType  - 'weekly' or 'monthly'
   */
  async computeAll(periodType: 'weekly' | 'monthly' = 'weekly') {
    const daysBack  = periodType === 'weekly' ? 7 : 30;
    const now       = new Date();
    const start     = new Date(now);
    start.setUTCDate(start.getUTCDate() - daysBack);

    const periodStart = start.toISOString().split('T')[0];
    const periodEnd   = now.toISOString().split('T')[0];

    // Compute for all three dimensions
    const [hostelScores, branchScores, yearScores] = await Promise.all([
      this.computeByDimension('hostel', daysBack),
      this.computeByDimension('branch', daysBack),
      this.computeByDimension('academic_year', daysBack),
    ]);

    // Store in group_insights (UPSERT)
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const scores of [hostelScores, branchScores, yearScores]) {
        for (const score of scores) {
          const insightType =
            hostelScores.includes(score)  ? 'hostel' :
            branchScores.includes(score)  ? 'branch' :
            'academic_year';

          await client.query(
            `INSERT INTO group_insights
               (insight_type, dimension_value, period_type,
                period_start, period_end, metrics, participant_count, computed_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
             ON CONFLICT (insight_type, dimension_value, period_type, period_start)
             DO UPDATE SET
               metrics           = EXCLUDED.metrics,
               participant_count = EXCLUDED.participant_count,
               computed_at       = NOW()`,
            [
              insightType,
              score.dimension,
              periodType,
              periodStart,
              periodEnd,
              JSON.stringify({
                nutrition_score: score.nutrition_score,
                fitness_score:   score.fitness_score,
                wellness_score:  score.wellness_score,
                overall_score:   score.overall_score,
                ...score.metrics,
              }),
              score.participant_count,
            ],
          );
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return {
      period:  periodType,
      from:    periodStart,
      to:      periodEnd,
      hostels: hostelScores,
      branches: branchScores,
      years:   yearScores,
    };
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPUTE BY DIMENSION (hostel / branch / academic_year)
  // ═══════════════════════════════════════════════════════════════════════════

  async computeByDimension(
    dimension: 'hostel' | 'branch' | 'academic_year',
    daysBack: number = 7,
  ): Promise<GroupScore[]> {

    // ── Step 1: Get member counts per group ──────────────────────────────
    const { rows: groups } = await pool.query(
      `SELECT ${dimension} AS dim, COUNT(*)::integer AS member_count
       FROM users
       WHERE is_verified = true
       GROUP BY ${dimension}
       HAVING COUNT(*) >= $1
       ORDER BY ${dimension}`,
      [MIN_GROUP_SIZE],
    );

    if (groups.length === 0) return [];

    const scores: GroupScore[] = [];

    for (const group of groups) {
      const dimValue    = String(group.dim);
      const memberCount = group.member_count;

      // ── NUTRITION SCORE ────────────────────────────────────────────────
      const { rows: nutritionRows } = await pool.query(
        `SELECT
           COUNT(DISTINCT DATE(fl.logged_at))::float
             / GREATEST($3::float, 1)                     AS meal_day_ratio,
           COUNT(*)::float / GREATEST($4::float, 1)       AS meals_per_target,
           COALESCE(AVG(fl.total_protein), 0)::float      AS avg_protein,
           COALESCE(AVG(fl.total_calories), 0)::float     AS avg_calories,
           COUNT(DISTINCT fl.user_id)::integer             AS active_loggers
         FROM food_logs fl
         JOIN users u ON fl.user_id = u.id
         WHERE u.${dimension} = $1
           AND fl.logged_at >= NOW() - ($2 || ' days')::interval`,
        [dimValue, daysBack, daysBack, memberCount * TARGET_MEALS_PER_WEEK / 7 * daysBack / 7],
      );

      const n = nutritionRows[0] || {};
      const mealConsistency   = clamp(Math.min((n.meal_day_ratio || 0) * 100, 100));
      const proteinAdequacy   = clamp(Math.min(((n.avg_protein || 0) / TARGET_PROTEIN_G_PER_DAY) * 100, 100));
      const loggerParticipation = clamp(((n.active_loggers || 0) / memberCount) * 100);
      const nutritionScore    = clamp(
        mealConsistency * 0.40 + proteinAdequacy * 0.30 + loggerParticipation * 0.30
      );

      // ── FITNESS SCORE ──────────────────────────────────────────────────
      const { rows: fitnessRows } = await pool.query(
        `SELECT
           COALESCE(AVG(sub.total_min), 0)::float         AS avg_mins_per_user,
           COALESCE(AVG(sub.activity_types), 0)::float    AS avg_variety,
           COUNT(DISTINCT sub.user_id)::integer            AS active_users
         FROM (
           SELECT
             al.user_id,
             SUM(al.duration_minutes)::float              AS total_min,
             COUNT(DISTINCT al.activity_type)::float       AS activity_types
           FROM activity_logs al
           JOIN users u ON al.user_id = u.id
           WHERE u.${dimension} = $1
             AND al.logged_at >= NOW() - ($2 || ' days')::interval
           GROUP BY al.user_id
         ) sub`,
        [dimValue, daysBack],
      );

      const f = fitnessRows[0] || {};
      const weeklyTarget = TARGET_ACTIVITY_MIN_WEEK * (daysBack / 7);
      const activityMinScore   = clamp(Math.min(((f.avg_mins_per_user || 0) / weeklyTarget) * 100, 100));
      const participationRate  = clamp(((f.active_users || 0) / memberCount) * 100);
      const varietyScore       = clamp(Math.min(((f.avg_variety || 0) / 3) * 100, 100)); // 3+ types = 100%
      const fitnessScore       = clamp(
        activityMinScore * 0.40 + participationRate * 0.35 + varietyScore * 0.25
      );

      // ── WELLNESS SCORE ─────────────────────────────────────────────────
      const { rows: wellnessRows } = await pool.query(
        `SELECT
           COALESCE(AVG(ml.mood_score), 5)::float         AS avg_mood,
           COUNT(*)::float / GREATEST($3::float, 1)       AS log_frequency,
           COUNT(CASE WHEN ml.journal_entry IS NOT NULL
                      AND ml.journal_entry != '' THEN 1 END)::float
             / GREATEST(COUNT(*)::float, 1)               AS journal_rate,
           COUNT(DISTINCT ml.user_id)::integer             AS mood_loggers
         FROM mood_logs ml
         JOIN users u ON ml.user_id = u.id
         WHERE u.${dimension} = $1
           AND ml.logged_at >= NOW() - ($2 || ' days')::interval`,
        [dimValue, daysBack, memberCount * TARGET_MOOD_LOGS_PER_WEEK / 7 * daysBack / 7],
      );

      const w = wellnessRows[0] || {};
      const moodAvgNorm     = clamp(((w.avg_mood || 5) / 10) * 100);
      const moodFrequency   = clamp(Math.min((w.log_frequency || 0) * 100, 100));
      const journalRate     = clamp((w.journal_rate || 0) * 100);
      const wellnessScore   = clamp(
        moodAvgNorm * 0.40 + moodFrequency * 0.35 + journalRate * 0.25
      );

      // ── OVERALL SCORE ──────────────────────────────────────────────────
      const overallScore = clamp(
        nutritionScore * NUTRITION_WEIGHT +
        fitnessScore   * FITNESS_WEIGHT +
        wellnessScore  * WELLNESS_WEIGHT
      );

      scores.push({
        dimension:         dimValue,
        participant_count: memberCount,
        nutrition_score:   nutritionScore,
        fitness_score:     fitnessScore,
        wellness_score:    wellnessScore,
        overall_score:     overallScore,
        metrics: {
          nutrition: {
            meal_consistency:     mealConsistency,
            protein_adequacy:     proteinAdequacy,
            logger_participation: loggerParticipation,
            avg_daily_protein:    Math.round((n.avg_protein || 0) * 10) / 10,
            avg_daily_calories:   Math.round((n.avg_calories || 0) * 10) / 10,
          },
          fitness: {
            avg_minutes_per_user: Math.round(f.avg_mins_per_user || 0),
            participation_rate:   participationRate,
            avg_activity_variety: Math.round((f.avg_variety || 0) * 10) / 10,
            active_users:         f.active_users || 0,
          },
          wellness: {
            avg_mood_score:      Math.round((w.avg_mood || 5) * 10) / 10,
            mood_log_frequency:  moodFrequency,
            journal_rate:        journalRate,
            mood_loggers:        w.mood_loggers || 0,
          },
        },
      });
    }

    // Rank by overall score (descending)
    scores.sort((a, b) => b.overall_score - a.overall_score);
    scores.forEach((s, i) => { s.rank = i + 1; });

    return scores;
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // READ ENDPOINTS (students + admin)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get the leaderboard by dimension (hostel / branch / academic_year).
   * First tries pre-computed data from group_insights.
   * Falls back to live computation if no cached data exists.
   */
  async getLeaderboard(
    insightType: 'hostel' | 'branch' | 'academic_year',
    periodType:  'weekly' | 'monthly' = 'weekly',
  ) {
    // Try cached data first
    const { rows } = await pool.query(
      `SELECT dimension_value, metrics, participant_count, computed_at
       FROM group_insights
       WHERE insight_type = $1
         AND period_type  = $2
         AND period_start = (
           SELECT MAX(period_start) FROM group_insights
           WHERE insight_type = $1 AND period_type = $2
         )
       ORDER BY (metrics->>'overall_score')::numeric DESC`,
      [insightType, periodType],
    );

    if (rows.length > 0) {
      return {
        source:      'cached',
        insight_type: insightType,
        period_type:  periodType,
        computed_at:  rows[0].computed_at,
        leaderboard: rows.map((r, i) => ({
          rank:              i + 1,
          dimension:         r.dimension_value,
          participant_count: r.participant_count,
          nutrition_score:   r.metrics.nutrition_score,
          fitness_score:     r.metrics.fitness_score,
          wellness_score:    r.metrics.wellness_score,
          overall_score:     r.metrics.overall_score,
          breakdown:         {
            nutrition: r.metrics.nutrition,
            fitness:   r.metrics.fitness,
            wellness:  r.metrics.wellness,
          },
        })),
      };
    }

    // No cached data — compute live
    const daysBack = periodType === 'weekly' ? 7 : 30;
    const scores   = await this.computeByDimension(
      insightType === 'hostel'        ? 'hostel' :
      insightType === 'branch'        ? 'branch' :
      'academic_year',
      daysBack,
    );

    return {
      source:       'live',
      insight_type: insightType,
      period_type:  periodType,
      computed_at:  new Date().toISOString(),
      leaderboard:  scores.map((s) => ({
        rank:              s.rank,
        dimension:         s.dimension,
        participant_count: s.participant_count,
        nutrition_score:   s.nutrition_score,
        fitness_score:     s.fitness_score,
        wellness_score:    s.wellness_score,
        overall_score:     s.overall_score,
        breakdown:         s.metrics,
      })),
    };
  },

  /**
   * "How does MY hostel/branch/year compare?"
   * Returns the user's group ranking + their group's scores + top 3 + bottom 3.
   */
  async getMyGroupRanking(userId: string) {
    // Get user's campus metadata
    const { rows: userRows } = await pool.query(
      `SELECT hostel, branch, academic_year FROM users WHERE id = $1`,
      [userId],
    );

    if (userRows.length === 0) {
      throw Object.assign(new Error('User not found.'), { code: 'USER_NOT_FOUND' });
    }

    const { hostel, branch, academic_year } = userRows[0];

    // Get all three leaderboards
    const [hostelBoard, branchBoard, yearBoard] = await Promise.all([
      this.getLeaderboard('hostel', 'weekly'),
      this.getLeaderboard('branch', 'weekly'),
      this.getLeaderboard('academic_year', 'weekly'),
    ]);

    // Find user's position in each
    const findMyRank = (board: any, myValue: string) => {
      const list = board.leaderboard || [];
      const myEntry = list.find((e: any) => String(e.dimension) === String(myValue));
      const totalGroups = list.length;
      return {
        my_group:     myValue,
        my_rank:      myEntry?.rank ?? null,
        total_groups: totalGroups,
        my_scores:    myEntry ? {
          nutrition_score: myEntry.nutrition_score,
          fitness_score:   myEntry.fitness_score,
          wellness_score:  myEntry.wellness_score,
          overall_score:   myEntry.overall_score,
        } : null,
        top_3:   list.slice(0, 3).map((e: any) => ({
          rank: e.rank, dimension: e.dimension, overall_score: e.overall_score,
        })),
        bottom_3: list.slice(-3).reverse().map((e: any) => ({
          rank: e.rank, dimension: e.dimension, overall_score: e.overall_score,
        })),
      };
    };

    return {
      hostel:        findMyRank(hostelBoard, hostel),
      branch:        findMyRank(branchBoard, branch),
      academic_year: findMyRank(yearBoard, String(academic_year)),
    };
  },

  /**
   * Campus-wide summary for admin dashboard.
   * Overall campus health metrics.
   */
  async getCampusSummary() {
    const { rows } = await pool.query(
      `SELECT
         COUNT(DISTINCT u.id)::integer                    AS total_users,
         COUNT(DISTINCT u.hostel)::integer                AS total_hostels,
         COUNT(DISTINCT u.branch)::integer                AS total_branches,
         AVG(u.fitness_level)::numeric(3,1)               AS avg_fitness_level,

         -- Nutrition engagement (last 7 days)
         (SELECT COUNT(DISTINCT fl.user_id)
          FROM food_logs fl
          WHERE fl.logged_at >= NOW() - INTERVAL '7 days')::integer
                                                          AS nutrition_active_users,

         -- Fitness engagement (last 7 days)
         (SELECT COUNT(DISTINCT al.user_id)
          FROM activity_logs al
          WHERE al.logged_at >= NOW() - INTERVAL '7 days')::integer
                                                          AS fitness_active_users,

         -- Wellness engagement (last 7 days)
         (SELECT COUNT(DISTINCT ml.user_id)
          FROM mood_logs ml
          WHERE ml.logged_at >= NOW() - INTERVAL '7 days')::integer
                                                          AS wellness_active_users,

         -- Average mood campus-wide (last 7 days)
         (SELECT AVG(ml.mood_score)::numeric(3,1)
          FROM mood_logs ml
          WHERE ml.logged_at >= NOW() - INTERVAL '7 days')
                                                          AS campus_avg_mood

       FROM users u
       WHERE u.is_verified = true`,
    );

    const summary = rows[0] || {};

    return {
      total_users:           summary.total_users || 0,
      total_hostels:         summary.total_hostels || 0,
      total_branches:        summary.total_branches || 0,
      avg_fitness_level:     parseFloat(summary.avg_fitness_level) || 0,
      engagement_7_days: {
        nutrition: summary.nutrition_active_users || 0,
        fitness:   summary.fitness_active_users || 0,
        wellness:  summary.wellness_active_users || 0,
      },
      campus_avg_mood:       parseFloat(summary.campus_avg_mood) || 0,
      participation_rate:    summary.total_users > 0
        ? Math.round(
            ((summary.fitness_active_users || 0) / summary.total_users) * 100
          )
        : 0,
    };
  },
};