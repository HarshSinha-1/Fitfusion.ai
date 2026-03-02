/**
 * services/auth.service.ts
 *
 * TWO-STEP REGISTRATION:
 *   initiateRegistration()  → saves name + email + hashed password, sends OTP
 *   verifyOtpAndActivate()  → verifies OTP, activates account, returns tokens
 *
 * POST-LOGIN PROFILE COMPLETION:
 *   completeProfile()       → student fills in age, hostel, branch, etc.
 *                             after they're already logged in
 */

import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import pool from '../configs/db';
import { sendOtpEmail } from '../utils/mailer';
import { AppError } from '../utils/AppError';

// ── Config ────────────────────────────────────────────────────────────────────
const JWT_ACCESS_SECRET  = process.env.JWT_ACCESS_SECRET!;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;
const ACCESS_TOKEN_TTL   = process.env.ACCESS_TOKEN_TTL  || '15m';
const REFRESH_TOKEN_TTL  = process.env.REFRESH_TOKEN_TTL || '7d';
const OTP_EXPIRY_MINUTES = parseInt(process.env.OTP_EXPIRY_MINUTES || '10', 10);
const BCRYPT_ROUNDS      = parseInt(process.env.BCRYPT_ROUNDS      || '12', 10);

// ── Types ─────────────────────────────────────────────────────────────────────

/** Step 1 — only the 3 fields needed to create an account */
export interface RegisterPayload {
  name:     string;
  email:    string;
  password: string;
}

/** Step 3 — profile details filled in after first login */
export interface CompleteProfilePayload {
  age:                 number;
  gender:              'male' | 'female' | 'other' | 'prefer_not_to_say';
  height_cm:           number;
  weight_kg:           number;
  fitness_level:       number;
  hostel:              string;
  academic_year:       number;
  branch:              string;
  dietary_preferences: string[];
  medical_history?:    string;
}

interface TokenPair {
  access_token:   string;
  refresh_token:  string;
  expires_in:     number;
  user:           SafeUser;
}

interface SafeUser {
  id:                   string;
  email:                string;
  name:                 string;
  is_verified:          boolean;
  profile_completed:    boolean;
  age:                  number | null;
  gender:               string | null;
  height_cm:            number | null;
  weight_kg:            number | null;
  fitness_level:        number | null;
  hostel:               string | null;
  academic_year:        number | null;
  branch:               string | null;
  dietary_preferences:  string[];
  created_at:           Date;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function generateOtp(): string {
  return String(crypto.randomInt(100000, 999999));
}

async function hashOtp(otp: string): Promise<string> {
  return bcrypt.hash(otp, 10);
}

function sanitizeUser(row: any): SafeUser {
  const {
    password_hash, otp_hash, otp_expires_at, refresh_token_hash,
    ...safe
  } = row;
  return safe as SafeUser;
}

function signToken(payload: object, secret: string, expiresIn: string): string {
  return jwt.sign(payload, secret, { expiresIn } as SignOptions);
}

function ttlToSeconds(ttl: string): number {
  const match = ttl.match(/^(\d+)([smhd])$/);
  if (!match) return 900;
  const n = parseInt(match[1], 10);
  const unit: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return n * (unit[match[2]] || 1);
}

// ── Service ───────────────────────────────────────────────────────────────────
export const authService = {

  // ── STEP 1: REGISTER ────────────────────────────────────────────────────────
  /**
   * Creates a minimal unverified account with just name + email + password.
   * Sends a 6-digit OTP to the email address.
   * Profile details (age, hostel, etc.) are NOT collected here.
   */
  async initiateRegistration(payload: RegisterPayload) {
    const { name, email, password } = payload;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Check if email already exists
      const existing = await client.query(
        'SELECT id, is_verified FROM users WHERE email = $1',
        [email.toLowerCase()]
      );

      if (existing.rows.length > 0) {
        if (existing.rows[0].is_verified) {
          throw new AppError('EMAIL_EXISTS', 'An account with this email already exists.');
        }
        // Unverified account exists → delete and re-register (resend flow)
        await client.query('DELETE FROM users WHERE email = $1', [email.toLowerCase()]);
      }

      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      const otp          = generateOtp();
      const otpHash      = await hashOtp(otp);
      const otpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

      // Insert with only the essential fields — all profile columns default to NULL
      await client.query(
        `INSERT INTO users
           (email, password_hash, name,
            otp_hash, otp_expires_at,
            is_verified, profile_completed)
         VALUES ($1, $2, $3, $4, $5, false, false)`,
        [email.toLowerCase(), passwordHash, name, otpHash, otpExpiresAt]
      );

      await client.query('COMMIT');

      // Send OTP email after transaction commits
      await sendOtpEmail(email, name, otp, OTP_EXPIRY_MINUTES);

      return { email: email.toLowerCase(), otpExpiresAt };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  // ── STEP 2: VERIFY OTP ───────────────────────────────────────────────────────
  /**
   * Verifies the 6-digit OTP.
   * Activates the account (is_verified = true).
   * Returns JWT tokens — student is now logged in.
   * profile_completed will be false — frontend should redirect to profile setup.
   */
  async verifyOtpAndActivate(email: string, otp: string): Promise<TokenPair> {
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (!rows.length) {
      throw new AppError('USER_NOT_FOUND', 'No pending registration found for this email.');
    }

    const user = rows[0];

    if (!user.otp_hash || !user.otp_expires_at) {
      throw new AppError('OTP_INVALID', 'No OTP has been issued for this account.');
    }

    if (new Date() > new Date(user.otp_expires_at)) {
      throw new AppError('OTP_EXPIRED', 'OTP has expired. Please request a new one.');
    }

    const otpValid = await bcrypt.compare(otp, user.otp_hash);
    if (!otpValid) {
      throw new AppError('OTP_INVALID', 'Invalid OTP. Please try again.');
    }

    // Activate account, clear OTP fields
    const { rows: updated } = await pool.query(
      `UPDATE users
       SET is_verified = true, otp_hash = NULL, otp_expires_at = NULL
       WHERE id = $1
       RETURNING *`,
      [user.id]
    );

    return this._issueTokenPair(updated[0]);
  },

  // ── STEP 3: COMPLETE PROFILE ─────────────────────────────────────────────────
  /**
   * Called AFTER the student has verified OTP and is logged in.
   * Saves all the profile details (age, hostel, branch, etc.)
   * Sets profile_completed = true.
   * Returns the updated user object.
   */
  async completeProfile(userId: string, payload: CompleteProfilePayload): Promise<SafeUser> {
    const {
      age, gender, height_cm, weight_kg,
      fitness_level, hostel, academic_year, branch,
      dietary_preferences, medical_history,
    } = payload;

    const clampedFitness = Math.min(Math.max(fitness_level, 1), 9);

    const { rows } = await pool.query(
      `UPDATE users
       SET
         age                  = $1,
         gender               = $2,
         height_cm            = $3,
         weight_kg            = $4,
         fitness_level        = $5,
         hostel               = $6,
         academic_year        = $7,
         branch               = $8,
         dietary_preferences  = $9,
         medical_history      = $10,
         profile_completed    = true
       WHERE id = $11
       RETURNING *`,
      [
        age, gender, height_cm, weight_kg,
        clampedFitness, hostel, academic_year, branch,
        JSON.stringify(dietary_preferences),
        medical_history || null,
        userId,
      ]
    );

    if (!rows.length) {
      throw new AppError('USER_NOT_FOUND', 'User not found.');
    }

    return sanitizeUser(rows[0]);
  },

  // ── RESEND OTP ───────────────────────────────────────────────────────────────
  async resendOtp(email: string) {
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE email = $1 AND is_verified = false',
      [email.toLowerCase()]
    );

    if (!rows.length) {
      throw new AppError('USER_NOT_FOUND', 'No pending registration found for this email.');
    }

    const user      = rows[0];
    const otp       = generateOtp();
    const otpHash   = await hashOtp(otp);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    await pool.query(
      'UPDATE users SET otp_hash = $1, otp_expires_at = $2 WHERE id = $3',
      [otpHash, expiresAt, user.id]
    );

    await sendOtpEmail(email, user.name, otp, OTP_EXPIRY_MINUTES);
    return { otpExpiresAt: expiresAt };
  },

  // ── LOGIN ────────────────────────────────────────────────────────────────────
  async login(email: string, password: string): Promise<TokenPair> {
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (!rows.length) {
      throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password.');
    }

    const user = rows[0];

    if (!user.is_verified) {
      throw new AppError('NOT_VERIFIED', 'Please verify your email before logging in.');
    }

    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password.');
    }

    return this._issueTokenPair(user);
  },

  // ── REFRESH TOKENS ───────────────────────────────────────────────────────────
  async refreshTokens(refreshToken: string): Promise<TokenPair> {
    let payload: any;
    try {
      payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    } catch {
      throw new AppError('TOKEN_INVALID', 'Invalid or expired refresh token.');
    }

    const { rows } = await pool.query(
      'SELECT * FROM users WHERE id = $1 AND is_verified = true',
      [payload.sub]
    );

    if (!rows.length) {
      throw new AppError('TOKEN_INVALID', 'User no longer exists.');
    }

    if (!rows[0].refresh_token_hash) {
      throw new AppError('TOKEN_INVALID', 'Refresh token has been revoked.');
    }

    const tokenValid = await bcrypt.compare(refreshToken, rows[0].refresh_token_hash);
    if (!tokenValid) {
      throw new AppError('TOKEN_INVALID', 'Refresh token mismatch. Possible token reuse.');
    }

    return this._issueTokenPair(rows[0]);
  },

  // ── LOGOUT ───────────────────────────────────────────────────────────────────
  async logout(userId: string): Promise<void> {
    await pool.query(
      'UPDATE users SET refresh_token_hash = NULL WHERE id = $1',
      [userId]
    );
  },

  // ── GET PROFILE ──────────────────────────────────────────────────────────────
  async getUserProfile(userId: string): Promise<SafeUser> {
    const { rows } = await pool.query(
      `SELECT id, email, name, age, gender, height_cm, weight_kg,
              fitness_level, hostel, academic_year, branch,
              dietary_preferences, medical_history,
              is_verified, profile_completed, created_at
       FROM users WHERE id = $1`,
      [userId]
    );

    if (!rows.length) {
      throw new AppError('USER_NOT_FOUND', 'User not found.');
    }

    return rows[0] as SafeUser;
  },

  // ── PRIVATE: ISSUE TOKEN PAIR ─────────────────────────────────────────────────
  async _issueTokenPair(user: any): Promise<TokenPair> {
    const accessToken      = signToken({ sub: user.id, email: user.email }, JWT_ACCESS_SECRET,  ACCESS_TOKEN_TTL);
    const refreshToken     = signToken({ sub: user.id },                    JWT_REFRESH_SECRET, REFRESH_TOKEN_TTL);
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);

    await pool.query(
      'UPDATE users SET refresh_token_hash = $1 WHERE id = $2',
      [refreshTokenHash, user.id]
    );

    return {
      access_token:  accessToken,
      refresh_token: refreshToken,
      expires_in:    ttlToSeconds(ACCESS_TOKEN_TTL),
      user:          sanitizeUser(user),
    };
  },
};