/**
 * routes/environment/index.ts
 *
 * Base path: /api/v1/environment
 *
 * STUDENT ENDPOINTS (view-only):
 *   GET  /current                → Live weather + AQI from APIs
 *   GET  /campus                 → Full dashboard (weather + crowd + advisory)
 *   GET  /fitness-advisory       → "Can I exercise outdoors?"
 *   GET  /crowd/today            → Today's crowd density (all zones, 3 slots)
 *   GET  /trends                 → All trend charts in one call
 *   GET  /trends/aqi?days=7      → AQI trend (bar chart)
 *   GET  /trends/weather?days=7  → Temperature + humidity + rainfall curves
 *   GET  /trends/crowd?zone=gym&days=7 → Crowd density trend by zone
 *
 * ADMIN ENDPOINTS:
 *   POST /admin/crowd            → Log headcount at zone + time slot
 *   POST /admin/log              → Manual weather/AQI override
 */

import { Router } from 'express';
import { authenticate }            from '../../middleware/auth.middleware';
import { validateBody }            from '../../middleware/validate.middleware';
import { environmentController }   from '../../controllers/environment.controller';
import {
  adminCrowdSchema,
  adminEnvironmentLogSchema,
} from '../../validators/environment.validator';

const router = Router();

router.use(authenticate);

// ─────────────────────────────────────────────────────────────────────────────
// STUDENT ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

/** Live weather + AQI (fetches from APIs, stores, returns) */
router.get('/current', environmentController.getCurrentConditions);

/** Full campus dashboard: weather + AQI + crowd + fitness advisory */
router.get('/campus', environmentController.getCampusOverview);

/** Quick "can I exercise outdoors?" check */
router.get('/fitness-advisory', environmentController.getFitnessAdvisory);

/** Today's crowd density for all zones (morning/afternoon/night) */
router.get('/crowd/today', environmentController.getTodayCrowd);

// ── TREND CHARTS ──────────────────────────────────────────────────────────────

/** All trends in one call (AQI + weather + crowd) */
router.get('/trends', environmentController.getAllTrends);

/** AQI trend — daily avg AQI for past N days (bar/line chart) */
router.get('/trends/aqi', environmentController.getAqiTrend);

/** Weather trend — temp curve + humidity + rainfall (multi-line chart) */
router.get('/trends/weather', environmentController.getWeatherTrend);

/** Crowd trend — per zone, morning/afternoon/night (grouped bars) */
router.get('/trends/crowd', environmentController.getCrowdTrend);

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /admin/crowd
 * Log headcount at a zone for a time slot.
 * Body: { "zone": "gym", "time_slot": "morning", "crowd_density": 65, "headcount": 45 }
 * UPSERT: updates if entry for zone+slot+today already exists.
 */
router.post(
  '/admin/crowd',
  validateBody(adminCrowdSchema),
  environmentController.adminLogCrowd,
);

/** POST /admin/log — manual weather/AQI override */
router.post(
  '/admin/log',
  validateBody(adminEnvironmentLogSchema),
  environmentController.adminLog,
);

export default router;