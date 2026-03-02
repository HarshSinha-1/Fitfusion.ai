/**
 * routes/auth/index.ts
 *
 * REGISTRATION FLOW:
 *
 *  1. POST /api/v1/auth/register          → name + email + password → sends OTP
 *  2. POST /api/v1/auth/verify-otp        → 6-digit OTP → returns tokens
 *                                           (next_step: "complete_profile")
 *  3. POST /api/v1/auth/complete-profile  → age, hostel, branch etc. → saves profile
 *                                           (requires Bearer token from step 2)
 */

import { Router }           from 'express';
import { authController }   from '../../controllers/auth.controller';
import { authenticate }     from '../../middleware/auth.middleware';
import { validateBody }     from '../../middleware/validate.middleware';
import {
  registerSchema,
  completeProfileSchema,
  loginSchema,
  verifyOtpSchema,
  refreshSchema,
} from '../../validators/auth.validator';

const router = Router();

// ── PUBLIC ROUTES ─────────────────────────────────────────────────────────────

// Step 1 — just name + email + password
router.post('/register',    validateBody(registerSchema),    authController.register);

// Step 2 — verify OTP → get tokens
router.post('/verify-otp',  validateBody(verifyOtpSchema),  authController.verifyOtp);

// Utility — get a fresh OTP if the previous expired
router.post('/resend-otp',                                   authController.resendOtp);

// Login
router.post('/login',       validateBody(loginSchema),       authController.login);

// Token refresh
router.post('/refresh',     validateBody(refreshSchema),     authController.refresh);

// ── PROTECTED ROUTES  (require Bearer token) ──────────────────────────────────

// Step 3 — fill in campus + health profile after email is verified
router.post(
  '/complete-profile',
  authenticate,
  validateBody(completeProfileSchema),
  authController.completeProfile,
);

// Logout
router.post('/logout', authenticate, authController.logout);

// Get current user profile
router.get('/me',      authenticate, authController.me);

export default router;