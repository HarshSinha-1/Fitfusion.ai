/**
 * controllers/auth.controller.ts
 */

import { Request, Response } from 'express';
import { authService } from '../services/auth.service';
import { HTTP } from '../configs/constants';

export const authController = {

  // ── POST /auth/register ────────────────────────────────────────────────────
  // Now only takes: name, email, password
  async register(req: Request, res: Response): Promise<Response> {
    try {
      const result = await authService.initiateRegistration(req.body);
      return res.status(HTTP.CREATED).json({
        success: true,
        message: `OTP sent to ${result.email}. Please verify to activate your account.`,
        data:    { email: result.email, otp_expires_at: result.otpExpiresAt },
      });
    } catch (err: any) {
      if (err.code === 'EMAIL_EXISTS') {
        return res.status(HTTP.CONFLICT).json({ success: false, message: err.message });
      }
      console.error('[register]', err);
      return res.status(HTTP.INTERNAL).json({ success: false, message: 'Registration failed.' });
    }
  },

  // ── POST /auth/verify-otp ──────────────────────────────────────────────────
  // On success — returns tokens + user object
  // user.profile_completed will be false → frontend should redirect to /setup-profile
  async verifyOtp(req: Request, res: Response): Promise<Response> {
    try {
      const { email, otp } = req.body;
      const tokens = await authService.verifyOtpAndActivate(email, otp);
      return res.status(HTTP.OK).json({
        success: true,
        message: 'Account verified. Welcome to FitFusion!',
        data:    tokens,
        // Frontend hint: redirect to profile setup if profile_completed is false
        next_step: tokens.user.profile_completed ? 'dashboard' : 'complete_profile',
      });
    } catch (err: any) {
      const status =
        err.code === 'OTP_EXPIRED'    ? HTTP.GONE        :
        err.code === 'OTP_INVALID'    ? HTTP.BAD_REQUEST  :
        err.code === 'USER_NOT_FOUND' ? HTTP.NOT_FOUND    :
        HTTP.INTERNAL;
      return res.status(status).json({ success: false, message: err.message });
    }
  },

  // ── POST /auth/resend-otp ──────────────────────────────────────────────────
  async resendOtp(req: Request, res: Response): Promise<Response> {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(HTTP.BAD_REQUEST).json({ success: false, message: 'Email is required.' });
      }
      const result = await authService.resendOtp(email);
      return res.status(HTTP.OK).json({
        success: true,
        message: `OTP resent to ${email}.`,
        data:    { otp_expires_at: result.otpExpiresAt },
      });
    } catch (err: any) {
      const status = err.code === 'USER_NOT_FOUND' ? HTTP.NOT_FOUND : HTTP.INTERNAL;
      return res.status(status).json({ success: false, message: err.message });
    }
  },

  // ── POST /auth/login ───────────────────────────────────────────────────────
  async login(req: Request, res: Response): Promise<Response> {
    try {
      const { email, password } = req.body;
      const tokens = await authService.login(email, password);
      return res.status(HTTP.OK).json({
        success: true,
        message: 'Login successful.',
        data:    tokens,
        next_step: tokens.user.profile_completed ? 'dashboard' : 'complete_profile',
      });
    } catch (err: any) {
      const status =
        err.code === 'INVALID_CREDENTIALS' ? HTTP.UNAUTHORIZED :
        err.code === 'NOT_VERIFIED'         ? HTTP.FORBIDDEN    :
        HTTP.INTERNAL;
      return res.status(status).json({ success: false, message: err.message });
    }
  },

  // ── POST /auth/complete-profile ────────────────────────────────────────────
  // NEW — called after OTP verification with the student's campus details
  // Requires: Authorization: Bearer <access_token>
  async completeProfile(req: Request, res: Response): Promise<Response> {
    try {
      const userId = (req as any).user.id;
      const user   = await authService.completeProfile(userId, req.body);
      return res.status(HTTP.OK).json({
        success:  true,
        message:  'Profile completed successfully. You are all set!',
        data:     user,
      });
    } catch (err: any) {
      if (err.code === 'USER_NOT_FOUND') {
        return res.status(HTTP.NOT_FOUND).json({ success: false, message: err.message });
      }
      console.error('[completeProfile]', err);
      return res.status(HTTP.INTERNAL).json({ success: false, message: 'Failed to save profile.' });
    }
  },

  // ── POST /auth/refresh ─────────────────────────────────────────────────────
  async refresh(req: Request, res: Response): Promise<Response> {
    try {
      const { refresh_token } = req.body;
      const tokens = await authService.refreshTokens(refresh_token);
      return res.status(HTTP.OK).json({ success: true, data: tokens });
    } catch (err: any) {
      return res.status(HTTP.UNAUTHORIZED).json({ success: false, message: err.message });
    }
  },

  // ── POST /auth/logout ──────────────────────────────────────────────────────
  async logout(req: Request, res: Response): Promise<Response> {
    try {
      await authService.logout((req as any).user.id);
      return res.status(HTTP.OK).json({ success: true, message: 'Logged out successfully.' });
    } catch (err) {
      console.error('[logout]', err);
      return res.status(HTTP.INTERNAL).json({ success: false, message: 'Logout failed.' });
    }
  },

  // ── GET /auth/me ───────────────────────────────────────────────────────────
  async me(req: Request, res: Response): Promise<Response> {
    try {
      const user = await authService.getUserProfile((req as any).user.id);
      return res.status(HTTP.OK).json({ success: true, data: user });
    } catch (err) {
      console.error('[me]', err);
      return res.status(HTTP.INTERNAL).json({ success: false, message: 'Could not fetch profile.' });
    }
  },
};