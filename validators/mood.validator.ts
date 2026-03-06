/**
 * validators/mood.validator.ts
 *
 * Defines the shape and rules for every request body/query
 * in the mood & wellness feature.
 * Uses Zod — same library used for auth and nutrition validation.
 */

import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// 1. LOG MOOD
//    POST /api/v1/mood/log
// ─────────────────────────────────────────────────────────────────────────────
export const logMoodSchema = z.object({
  mood_score: z
    .number()
    .int('mood_score must be a whole number.')
    .min(1, 'mood_score must be at least 1.')
    .max(10, 'mood_score must be at most 10.'),

  mood_tags: z
    .array(
      z.string().min(1).max(50).trim()
    )
    .max(10, 'Maximum 10 mood tags.')
    .default([]),

  journal_entry: z
    .string()
    .max(5000, 'Journal entry must be under 5000 characters.')
    .trim()
    .optional(),

  circle_id: z
    .string()
    .uuid('circle_id must be a valid UUID.')
    .optional(),
});

// ───────��─────────────────────────────────────────────────────────────────────
// 2. MOOD HISTORY (query params)
//    GET /api/v1/mood/history?days=30
// ─────────────────────────────────────────────────────────────────────────────
export const moodHistoryQuerySchema = z.object({
  days: z
    .string()
    .regex(/^\d+$/, 'days must be a number.')
    .transform(Number)
    .refine((n) => n >= 1 && n <= 90, 'days must be between 1 and 90.')
    .optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Exported TypeScript types
// ─────────────────────────────────────────────────────────────────────────────
export type LogMoodInput         = z.infer<typeof logMoodSchema>;
export type MoodHistoryQueryInput = z.infer<typeof moodHistoryQuerySchema>;