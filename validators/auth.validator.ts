/**
 * validators/auth.validators.ts
 *
 * TWO-STEP REGISTRATION FLOW:
 *
 *  Step 1 — POST /auth/register
 *    Only: name, email, password
 *    → sends OTP to email
 *
 *  Step 2 — POST /auth/verify-otp
 *    Verifies OTP → activates account → returns tokens
 *
 *  Step 3 — POST /auth/complete-profile   (protected — needs access_token)
 *    All the profile fields: age, gender, height, hostel, etc.
 *    → student fills this in after logging in for the first time
 */

import { z } from 'zod';

// ── Dietary preference options ────────────────────────────────────────────────
const DIETARY_OPTIONS = [
  'vegetarian',
  'non-vegetarian',
  'vegan',
  'eggetarian',
  'jain',
  'gluten-free',
  'lactose-free',
  'halal',
  'other',
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 — REGISTER
// Only name + email + password required
// ─────────────────────────────────────────────────────────────────────────────
export const registerSchema = z.object({
  name: z
    .string()
    .min(2,   'Name must be at least 2 characters.')
    .max(100, 'Name must not exceed 100 characters.')
    .trim(),

  email: z
    .string()
    .email('Please enter a valid email address.')
    .toLowerCase(),

  password: z
    .string()
    .min(8,  'Password must be at least 8 characters.')
    .max(72, 'Password must not exceed 72 characters.')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password must contain at least one uppercase letter, one lowercase letter, and one number.'
    ),
});

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3 — COMPLETE PROFILE  (called after OTP verified + logged in)
// All the campus/health details the student fills in post-signup
// ─────────────────────────────────────────────────────────────────────────────
export const completeProfileSchema = z.object({
  age: z
    .number()
    .int('Age must be a whole number.')
    .min(16, 'Age must be at least 16.')
    .max(60, 'Age must not exceed 60.'),

  gender: z.enum(
    ['male', 'female', 'other', 'prefer_not_to_say'],
    { message: 'Please select a valid gender option.' }
  ),

  height_cm: z
    .number()
    .min(100, 'Height must be at least 100 cm.')
    .max(250, 'Height must not exceed 250 cm.'),

  weight_kg: z
    .number()
    .min(30,  'Weight must be at least 30 kg.')
    .max(300, 'Weight must not exceed 300 kg.'),

  /**
   * Fitness level scroller: 1-9
   *   1-3 → Beginner
   *   4-6 → Intermediate
   *   7-9 → Advanced
   */
  fitness_level: z
    .number()
    .int('Fitness level must be a whole number.')
    .min(1, 'Fitness level must be between 1 and 9.')
    .max(9, 'Fitness level must be between 1 and 9.'),

  hostel: z
    .string()
    .min(1,   'Hostel name is required.')
    .max(100, 'Hostel name must not exceed 100 characters.')
    .trim(),

  academic_year: z
    .number()
    .int('Academic year must be a whole number.')
    .min(1, 'Academic year must be between 1 and 6.')
    .max(6, 'Academic year must be between 1 and 6.'),

  branch: z
    .string()
    .min(1,   'Branch is required.')
    .max(100, 'Branch must not exceed 100 characters.')
    .trim(),

  dietary_preferences: z
    .array(z.enum(DIETARY_OPTIONS))
    .min(1, 'Please select at least one dietary preference.'),

  // Optional — student may leave this blank
  medical_history: z
    .string()
    .max(1000, 'Medical history must not exceed 1000 characters.')
    .trim()
    .optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// OTHER SCHEMAS  (unchanged)
// ─────────────────────────────────────────────────────────────────────────────
export const loginSchema = z.object({
  email:    z.string().email('Please enter a valid email address.').toLowerCase(),
  password: z.string().min(1, 'Password is required.'),
});

export const verifyOtpSchema = z.object({
  email: z.string().email('Please enter a valid email address.').toLowerCase(),
  otp:   z
    .string()
    .length(6, 'OTP must be exactly 6 digits.')
    .regex(/^\d{6}$/, 'OTP must contain only digits.'),
});

export const refreshSchema = z.object({
  refresh_token: z.string().min(1, 'Refresh token is required.'),
});

// ── Exported TypeScript types ─────────────────────────────────────────────────
export type RegisterInput        = z.infer<typeof registerSchema>;
export type CompleteProfileInput = z.infer<typeof completeProfileSchema>;
export type LoginInput           = z.infer<typeof loginSchema>;
export type VerifyOtpInput       = z.infer<typeof verifyOtpSchema>;
export type RefreshInput         = z.infer<typeof refreshSchema>;

// ── Fitness level label helper ────────────────────────────────────────────────
export function getFitnessLabel(level: number): string {
  if (level <= 3) return 'Beginner';
  if (level <= 6) return 'Intermediate';
  return 'Advanced';
}

export { DIETARY_OPTIONS };
