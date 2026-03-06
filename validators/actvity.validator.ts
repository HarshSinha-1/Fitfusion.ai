/**
 * validators/activity.validator.ts
 *
 * Zod schemas for the fitness activity feature.
 * Validates request bodies/queries for:
 *   1. Log activity (student self-logs)
 *   2. Admin log activity (trainer logs for a student)
 *   3. Activity history query
 *   4. Daily activity summary query
 */

import { z } from 'zod';

// ── Valid activity types ──────────────────────────────────────────────────────
const ACTIVITY_TYPES = [
  'running', 'gym', 'yoga', 'cycling', 'swimming',
  'sports', 'HIIT', 'walking', 'stretching', 'meditation',
  'dancing', 'martial_arts', 'other',
] as const;

// ── Valid intensity levels ────────────────────────────────────────────────────
const INTENSITIES = ['low', 'moderate', 'high'] as const;

// ── Valid locations ───────────────────────────────────────────────────────────
const LOCATIONS = ['gym', 'ground', 'hostel_room', 'outdoor', 'sports_complex', 'other'] as const;

// ────────────────────────────────────────────────────────────────────────────���
// 1. LOG ACTIVITY (student self-log)
//    POST /api/v1/activity/log
// ─────────────────────────────────────────────────────────────────────────────
export const logActivitySchema = z.object({
  activity_type: z.enum(ACTIVITY_TYPES, {
    message: `activity_type must be one of: ${ACTIVITY_TYPES.join(', ')}`,
  }),

  duration_minutes: z
    .number()
    .int('Duration must be a whole number.')
    .min(1, 'Duration must be at least 1 minute.')
    .max(480, 'Duration cannot exceed 8 hours (480 minutes).'),

  intensity: z.enum(INTENSITIES, {
    message: `intensity must be one of: ${INTENSITIES.join(', ')}`,
  }).default('moderate'),

  // Strength training details (optional — only for gym/weights)
  sets: z.number().int().min(1).max(50).optional(),
  reps: z.number().int().min(1).max(100).optional(),
  weight_kg: z.number().min(0).max(500).optional(),

  calories_burned: z.number().min(0).max(5000).optional(),
  location: z.enum(LOCATIONS).optional(),
  zone: z.string().max(50).trim().optional(),
  notes: z.string().max(500).trim().optional(),

  // Optional: allow logging for a past date/time
  logged_at: z.string().datetime({ message: 'logged_at must be a valid ISO datetime.' }).optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. ADMIN LOG ACTIVITY (trainer logs for a student)
//    POST /api/v1/activity/admin/log
// ─────────────────────────────────────────────────────────────────────────────
export const adminLogActivitySchema = logActivitySchema.extend({
  target_user_id: z.string().uuid('target_user_id must be a valid UUID.'),
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. ACTIVITY HISTORY (query params)
//    GET /api/v1/activity/history?days=30
// ─────────────────────────────────────────────────────────────────────────────
export const activityHistoryQuerySchema = z.object({
  days: z
    .string()
    .regex(/^\d+$/, 'days must be a number.')
    .transform(Number)
    .refine((n) => n >= 1 && n <= 90, 'days must be between 1 and 90.')
    .optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. DAILY SUMMARY (query params)
//    GET /api/v1/activity/daily-summary?date=2026-03-05
// ─────────────────────────────────────────────────────────────────────────────
export const activityDailySummaryQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format.')
    .optional(),
});

// ── Exported TypeScript types ─────────────────────────────────────────────────
export type LogActivityInput          = z.infer<typeof logActivitySchema>;
export type AdminLogActivityInput     = z.infer<typeof adminLogActivitySchema>;
export type ActivityHistoryQueryInput = z.infer<typeof activityHistoryQuerySchema>;