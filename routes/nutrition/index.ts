/**
 * routes/nutrition/index.ts
 *
 * WHAT THIS FILE DOES:
 * Defines all HTTP endpoints for the nutrition feature and wires them to:
 *   - authenticate middleware  (JWT check — all nutrition routes are private)
 *   - validateBody middleware  (Zod schema check for POST bodies)
 *   - nutritionController      (the actual handler)
 *
 * All routes are prefixed with /api/v1/nutrition (set in server.ts).
 *
 * Import path logic (this file is at routes/nutrition/index.ts):
 *   ../../controllers/  →  Fitfusion.ai/controllers/
 *   ../../middleware/    →  Fitfusion.ai/middleware/
 *   ../../validators/   →  Fitfusion.ai/validators/
 */

import { Router }                  from 'express';
import { nutritionController }     from '../../controllers/nutrition.controller';
import { authenticate }            from '../../middleware/auth.middleware';
import { validateBody }            from '../../middleware/validate.middleware';
import {
  logMealSchema,
  generateMealPlanSchema,
} from '../../validators/nutrition.validator';

const router = Router();

// ALL nutrition routes require a valid JWT — apply authenticate globally here
router.use(authenticate);

// ─────────────────────────────────────────────────────────────────────────────
// MEAL LOGGING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/nutrition/log-meal
 *
 * Log what a student ate. Automatically calculates calories + macros.
 *
 * Body:
 * {
 *   "meal_type": "lunch",
 *   "items": [
 *     { "name": "rice",   "quantity": 1.5, "source": "mess" },
 *     { "name": "dal",    "quantity": 1   },
 *     { "name": "paneer", "quantity": 0.5 }
 *   ],
 *   "location": "Mess Hall A",
 *   "notes": "Felt heavy after"
 * }
 *
 * Response: saved food_log record + per-item nutrition + totals
 */
router.post(
  '/log-meal',
  validateBody(logMealSchema),
  nutritionController.logMeal,
);

// ─────────────────────────────────────────────────────────────────────────────
// DAILY SUMMARY  — used by the main dashboard card
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/nutrition/daily-summary
 * GET /api/v1/nutrition/daily-summary?date=2025-03-15
 *
 * Returns today's (or given date's) full breakdown:
 *   - All meals logged
 *   - Total calories / protein / carbs / fats / fiber
 *   - RDI progress (consumed vs recommended)
 *   - Which meal slots are still missing (breakfast ✗, lunch ✓ …)
 *   - One smart tip
 */
router.get('/daily-summary', nutritionController.getDailySummary);

// ─────────────────────────────────────────────────────────────────────────────
// TRENDS  — used by the weekly/monthly charts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/nutrition/trends
 * GET /api/v1/nutrition/trends?days=7
 * GET /api/v1/nutrition/trends?days=90
 *
 * Returns day-by-day nutrition aggregates for the past N days (default 30).
 * Gaps are zero-filled so charts don't break.
 * Also includes period averages + 4-week bucket summary.
 */
router.get('/trends', nutritionController.getNutritionTrends);

// ─────────────────────────────────────────────────────────────────────────────
// MEAL PLAN GENERATION  — AI/rule-based personalised plan
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/nutrition/generate-meal-plan
 *
 * Generates a personalised N-day meal plan based on:
 *   - User's stored dietary preferences
 *   - Requested goal (balanced / weight_loss / muscle_gain)
 *   - Any extra dietary restrictions passed in the body
 *
 * Body:
 * {
 *   "goal": "muscle_gain",
 *   "dietary_restrictions": ["vegetarian"],
 *   "days": 7
 * }
 */
router.post(
  '/generate-meal-plan',
  validateBody(generateMealPlanSchema),
  nutritionController.generateMealPlan,
);

// ─────────────────────────────────────────────────────────────────────────────
// PERSONALISED RECOMMENDATIONS  — "Increase protein post-workout" type tips
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/nutrition/recommendations
 *
 * Analyses last 7 days of logs and returns 2-4 actionable tips.
 * Examples:
 *   "Your protein average is 35g — target is 90g. Add dal/eggs."
 *   "You logged meals only 3 days this week. Consistency matters."
 */
router.get('/recommendations', nutritionController.getRecommendations);

// ─────────────────────────────────────────────────────────────────────────────
// FOOD SEARCH  — autocomplete for the meal logging UI
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/nutrition/search?q=rice
 *
 * Returns matching food items from the campus food database.
 * Used by the frontend dropdown when a student types a food name.
 * No body — just query param q.
 */
router.get('/search', nutritionController.searchFoods);

export default router;