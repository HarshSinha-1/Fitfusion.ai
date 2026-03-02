/**
 * validators/nutrition.validator.ts
 *
 * WHAT THIS FILE DOES:
 * Defines the shape and rules for every request body in the nutrition feature.
 * Uses Zod — same library used for auth validation.
 * The validate.middleware.ts wraps these schemas and auto-returns 422 errors.
 */

import { z } from 'zod';

// ── Valid meal types ──────────────────────────────────────────────────────────
const MEAL_TYPES = ['breakfast', 'lunch', 'snacks', 'dinner', 'other'] as const;

// ── Valid food sources ────────────────────────────────────────────────────────
const FOOD_SOURCES = ['mess', 'canteen', 'room', 'outside', 'other'] as const;

// ── Valid goals ───────────────────────────────────────────────────────────────
const GOALS = ['balanced', 'weight_loss', 'muscle_gain'] as const;

// ─────────────────────────────────────────────────────────────────────────────
// 1. LOG MEAL
//    POST /api/v1/nutrition/log-meal
// ─────────────────────────────────────────────────────────────────────────────
// 1. LOG MEAL
export const logMealSchema = z.object({
  meal_type: z.enum(MEAL_TYPES, {
    message: `meal_type must be one of: ${MEAL_TYPES.join(', ')}`,
  }),

  items: z
    .array(
      z.object({
        name: z.string().min(1, 'Item name is required.').max(100).trim(),
        quantity: z.number().positive('Quantity must be a positive number.').default(1),
        unit: z.string().max(30).optional(),
        source: z.enum(FOOD_SOURCES).optional(),
      })
    )
    .min(1, 'At least one food item is required.'),

  location: z.string().max(100).trim().optional(),
  notes: z.string().max(500).trim().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. DAILY SUMMARY  (query params)
//    GET /api/v1/nutrition/daily-summary?date=YYYY-MM-DD
// ─────────────────────────────────────────────────────────────────────────────
export const dailySummaryQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format.')
    .optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. TRENDS  (query params)
//    GET /api/v1/nutrition/trends?days=30
// ─────────────────────────────────────────────────────────────────────────────
export const trendsQuerySchema = z.object({
  days: z
    .string()
    .regex(/^\d+$/, 'days must be a number.')
    .transform(Number)
    .refine((n) => n >= 7 && n <= 90, 'days must be between 7 and 90.')
    .optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. GENERATE MEAL PLAN
//    POST /api/v1/nutrition/generate-meal-plan
// ─────────────────────────────────────────────────────────────────────────────
// 4. GENERATE MEAL PLAN
export const generateMealPlanSchema = z.object({
  goal: z.enum(GOALS, {
    message: `goal must be one of: ${GOALS.join(', ')}`,
  }).default('balanced'),

  dietary_restrictions: z
    .array(z.string().max(50))
    .max(10)
    .default([]),

  days: z
    .number()
    .int('days must be a whole number.')
    .min(1, 'Minimum 1 day.')
    .max(30, 'Maximum 30 days.')
    .default(7),
});
// ─────────────────────────────────────────────────────────────────────────────
// 5. FOOD SEARCH  (query params)
//    GET /api/v1/nutrition/search?q=rice
// ─────────────────────────────────────────────────────────────────────────────
export const foodSearchQuerySchema = z.object({
  q: z.string().min(1, 'Search query is required.').max(50),
});

// ── Exported TypeScript types ─────────────────────────────────────────────────
export type LogMealInput          = z.infer<typeof logMealSchema>;
export type GenerateMealPlanInput = z.infer<typeof generateMealPlanSchema>;