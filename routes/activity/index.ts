/**
 * routes/activity/index.ts
 *
 * All fitness activity routes.
 * Every route requires a valid JWT (authenticate middleware).
 *
 * Base path: /api/v1/activity
 *
 * STUDENT ENDPOINTS:
 *   POST /log              → Student logs their own workout
 *   GET  /daily-summary    → Today's workout summary (?date=YYYY-MM-DD)
 *   GET  /history          → Multi-day trends (?days=30)
 *
 * ADMIN/TRAINER ENDPOINTS:
 *   POST /admin/log              → Trainer logs workout FOR a student
 *   GET  /admin/user/:userId     → Trainer views a student's history
 */

import { Router } from 'express';
import { authenticate }       from '../../middleware/auth.middleware';
import { validateBody }       from '../../middleware/validate.middleware';
import { activityController } from '../../controllers/activity.controller';
import {
  logActivitySchema,
  adminLogActivitySchema,
} from '../../validators/actvity.validator';

const router = Router();

// ALL activity routes require a valid JWT
router.use(authenticate);

// ─────────────────────────────────────────────────────────────────────────────
// STUDENT ROUTES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/activity/log
 *
 * Student logs their own workout.
 *
 * Body:
 * {
 *   "activity_type": "gym",
 *   "duration_minutes": 60,
 *   "intensity": "high",
 *   "sets": 4,
 *   "reps": 10,
 *   "weight_kg": 40,
 *   "location": "gym",
 *   "notes": "Chest and triceps day"
 * }
 *
 * calories_burned is auto-estimated if not provided.
 */
router.post(
  '/log',
  validateBody(logActivitySchema),
  activityController.logActivity,
);

/**
 * GET /api/v1/activity/daily-summary?date=2026-03-05
 *
 * All activities for a single day + aggregated totals.
 * Defaults to today if no date is provided.
 */
router.get('/daily-summary', activityController.getDailySummary);

/**
 * GET /api/v1/activity/history?days=30
 *
 * Daily activity aggregates for the past N days (1-90, default 30).
 * Used for trend charts on the frontend.
 */
router.get('/history', activityController.getActivityHistory);

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN / TRAINER ROUTES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/activity/admin/log
 *
 * Trainer logs a workout FOR a specific student.
 *
 * Body (same as student log + target_user_id):
 * {
 *   "target_user_id": "uuid-of-the-student",
 *   "activity_type": "running",
 *   "duration_minutes": 30,
 *   "intensity": "moderate",
 *   "notes": "Morning campus run supervised"
 * }
 */
router.post(
  '/admin/log',
  validateBody(adminLogActivitySchema),
  activityController.adminLogActivity,
);

/**
 * GET /api/v1/activity/admin/user/:userId?days=30
 *
 * Trainer views any student's activity history.
 * Used by the trainer dashboard.
 */
router.get('/admin/user/:userId', activityController.adminGetUserActivity);

export default router;