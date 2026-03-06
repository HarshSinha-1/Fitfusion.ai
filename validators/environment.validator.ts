/**
 * validators/environment.validator.ts
 *
 * Zod schemas for the environmental quality feature.
 *
 * DESIGN DECISIONS:
 *   - NO noise tracking (unreliable without calibrated hardware)
 *   - Crowd density is ADMIN-ONLY with fixed time slots
 *   - Weather + AQI comes from APIs (no manual student entry)
 */

import { z } from 'zod';

// ── Valid campus zones ────────────────────────────────────────────────────────
export const CAMPUS_ZONES = [
  'main_gate', 'library', 'sports_complex', 'gym',
  'hostel_block_a', 'hostel_block_b', 'hostel_block_c', 'hostel_block_d',
  'mess_hall', 'canteen', 'academic_block', 'lab_block',
  'ground', 'parking', 'garden', 'auditorium',
] as const;

// ── Weather conditions ────────────────────────────────────────────────────────
const WEATHER_CONDITIONS = [
  'sunny', 'cloudy', 'partly_cloudy', 'rainy',
  'foggy', 'stormy', 'hazy', 'windy', 'clear',
] as const;

// ── AQI categories (US EPA standard) ──────────────────────────────────────────
const AQI_CATEGORIES = [
  'good', 'moderate', 'unhealthy_sensitive',
  'unhealthy', 'very_unhealthy', 'hazardous',
] as const;

// ── Time slots for crowd density ──────────────────────────────────────────────
const TIME_SLOTS = ['morning', 'afternoon', 'night'] as const;

// ────────────���────────────────────────────────────────────────────────────────
// 1. ADMIN: LOG CROWD DENSITY
//    POST /api/v1/environment/admin/crowd
//
//    Admin logs headcount at a zone for a specific time slot.
//    e.g. "Gym has 45% crowd density this morning"
// ─────────────────────────────────────────────────────────────────────────────
export const adminCrowdSchema = z.object({
  zone: z.enum(CAMPUS_ZONES, {
    message: `zone must be one of: ${CAMPUS_ZONES.join(', ')}`,
  }),

  time_slot: z.enum(TIME_SLOTS, {
    message: `time_slot must be one of: ${TIME_SLOTS.join(', ')}`,
  }),

  // 0 (empty) to 100 (at full capacity)
  crowd_density: z
    .number()
    .int('crowd_density must be a whole number.')
    .min(0, 'crowd_density must be 0 or above.')
    .max(100, 'crowd_density must be 100 or below.'),

  // Actual headcount (optional — for records)
  headcount: z
    .number()
    .int()
    .min(0)
    .max(10000)
    .optional(),

  notes: z.string().max(300).trim().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. ADMIN: FULL ENVIRONMENT LOG (manual weather/AQI override)
//    POST /api/v1/environment/admin/log
// ─────────────────────────────────────────────────────────────────────────────
export const adminEnvironmentLogSchema = z.object({
  zone: z.enum(CAMPUS_ZONES, {
    message: `zone must be one of: ${CAMPUS_ZONES.join(', ')}`,
  }),

  aqi: z.number().int().min(0).max(500).optional(),
  aqi_category: z.enum(AQI_CATEGORIES).optional(),

  temperature_c: z.number().min(-50).max(60).optional(),
  humidity_pct: z.number().int().min(0).max(100).optional(),
  rainfall_mm: z.number().min(0).max(500).optional(),
  weather_condition: z.enum(WEATHER_CONDITIONS).optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. HISTORY QUERY PARAMS
//    GET /api/v1/environment/history?days=7
// ─────────────────────────────────────────────────────────────────────────────
export const environmentHistoryQuerySchema = z.object({
  days: z
    .string()
    .regex(/^\d+$/, 'days must be a number.')
    .transform(Number)
    .refine((n) => n >= 1 && n <= 30, 'days must be between 1 and 30.')
    .optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. CROWD HISTORY QUERY
//    GET /api/v1/environment/crowd/history?zone=gym&days=7
// ─────────────────────────────────────────────────────────────────────────────
export const crowdHistoryQuerySchema = z.object({
  zone: z.string().max(100).optional(),
  days: z
    .string()
    .regex(/^\d+$/, 'days must be a number.')
    .transform(Number)
    .refine((n) => n >= 1 && n <= 30, 'days must be between 1 and 30.')
    .optional(),
});

// ── Exported types ────────────────────────────────────────────────────────────
export type AdminCrowdInput          = z.infer<typeof adminCrowdSchema>;
export type AdminEnvironmentLogInput = z.infer<typeof adminEnvironmentLogSchema>;