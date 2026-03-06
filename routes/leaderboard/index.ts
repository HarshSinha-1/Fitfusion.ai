/**
 * routes/leaderboard/index.ts
 *
 * Base path: /api/v1/leaderboard
 *
 * STUDENT ENDPOINTS:
 *   GET  /hostel?period=weekly       → Hostel-wise rankings
 *   GET  /branch?period=weekly       → Branch-wise rankings
 *   GET  /year?period=weekly         → Academic year rankings
 *   GET  /my-ranking                 → "How does MY hostel/branch/year compare?"
 *
 * ADMIN ENDPOINTS:
 *   POST /admin/compute              → Trigger leaderboard recomputation
 *   GET  /admin/campus               → Campus-wide summary analytics
 */

import { Router } from 'express';
import { authenticate }            from '../../middleware/auth.middleware';
import { validateBody }            from '../../middleware/validate.middleware';
import { leaderboardController }   from '../../controllers/leaderboard.controller';
import { computeLeaderboardSchema } from '../../validators/leaderboard.validator';

const router = Router();

router.use(authenticate);

// ─────────────────────────────────────────────────────────────────────────────
// STUDENT ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/leaderboard/hostel?period=weekly
 *
 * Returns all hostels ranked by overall fitness score.
 * Each hostel shows: nutrition_score, fitness_score, wellness_score, overall_score
 * Only hostels with ≥ 5 verified members are shown (privacy).
 *
 * Response example:
 * {
 *   leaderboard: [
 *     { rank: 1, dimension: "Hostel A", overall_score: 78.5, ... },
 *     { rank: 2, dimension: "Hostel B", overall_score: 72.1, ... },
 *   ]
 * }
 */
router.get('/hostel', leaderboardController.getHostelLeaderboard);

/**
 * GET /api/v1/leaderboard/branch?period=weekly
 * Same format, ranked by branch (CSE, ECE, ME, etc.)
 */
router.get('/branch', leaderboardController.getBranchLeaderboard);

/**
 * GET /api/v1/leaderboard/year?period=weekly
 * Same format, ranked by academic year (1st year, 2nd year, etc.)
 */
router.get('/year', leaderboardController.getYearLeaderboard);

/**
 * GET /api/v1/leaderboard/my-ranking
 *
 * Personalized view: shows where the student's hostel, branch,
 * and year each rank. Includes top 3 and bottom 3 for context.
 *
 * Response example:
 * {
 *   hostel: { my_group: "Hostel C", my_rank: 3, total_groups: 8, ... },
 *   branch: { my_group: "CSE", my_rank: 1, total_groups: 12, ... },
 *   academic_year: { my_group: "2", my_rank: 2, total_groups: 4, ... }
 * }
 */
router.get('/my-ranking', leaderboardController.getMyRanking);

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/leaderboard/admin/compute
 *
 * Recomputes all leaderboard scores and stores in group_insights.
 * Body: { "period": "weekly" } or { "period": "monthly" }
 *
 * In production, this would run on a weekly cron job.
 * For the hackathon demo, admin triggers it manually.
 */
router.post(
  '/admin/compute',
  validateBody(computeLeaderboardSchema),
  leaderboardController.computeLeaderboard,
);

/**
 * GET /api/v1/leaderboard/admin/campus
 *
 * Campus-wide analytics: total users, engagement rates, avg mood, etc.
 * Used by the admin dashboard.
 */
router.get('/admin/campus', leaderboardController.getCampusSummary);

export default router;