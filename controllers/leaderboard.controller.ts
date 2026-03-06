/**
 * controllers/leaderboard.controller.ts
 *
 * HTTP layer for the campus leaderboard & healthy competition feature.
 *
 * Student endpoints: view hostel/branch/year rankings, my position
 * Admin endpoints: trigger computation, campus-wide analytics
 */

import { Request, Response } from 'express';
import { leaderboardService } from '../services/leaderboard.service';
import { HTTP } from '../configs/constants';

interface AuthRequest extends Request {
  user: { id: string; email: string };
}

export const leaderboardController = {

  // ═══════════════════════════════════════════════════════════════════════════
  // STUDENT ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════

  // ── GET /api/v1/leaderboard/hostel?period=weekly ──��────────────────────
  async getHostelLeaderboard(req: Request, res: Response): Promise<Response> {
    try {
      const period = (req.query.period as string) === 'monthly' ? 'monthly' : 'weekly';
      const data   = await leaderboardService.getLeaderboard('hostel', period);

      return res.status(HTTP.OK).json({
        success: true,
        message: '🏆 Hostel leaderboard — healthy competition!',
        data,
      });
    } catch (err: any) {
      console.error('[leaderboard.hostel]', err);
      return res.status(HTTP.INTERNAL).json({ success: false, message: 'Failed to fetch leaderboard.' });
    }
  },

  // ── GET /api/v1/leaderboard/branch?period=weekly ───────────────────────
  async getBranchLeaderboard(req: Request, res: Response): Promise<Response> {
    try {
      const period = (req.query.period as string) === 'monthly' ? 'monthly' : 'weekly';
      const data   = await leaderboardService.getLeaderboard('branch', period);

      return res.status(HTTP.OK).json({
        success: true,
        message: '🏆 Branch leaderboard',
        data,
      });
    } catch (err: any) {
      console.error('[leaderboard.branch]', err);
      return res.status(HTTP.INTERNAL).json({ success: false, message: 'Failed to fetch leaderboard.' });
    }
  },

  // ── GET /api/v1/leaderboard/year?period=weekly ─────────────────────────
  async getYearLeaderboard(req: Request, res: Response): Promise<Response> {
    try {
      const period = (req.query.period as string) === 'monthly' ? 'monthly' : 'weekly';
      const data   = await leaderboardService.getLeaderboard('academic_year', period);

      return res.status(HTTP.OK).json({
        success: true,
        message: '🏆 Academic year leaderboard',
        data,
      });
    } catch (err: any) {
      console.error('[leaderboard.year]', err);
      return res.status(HTTP.INTERNAL).json({ success: false, message: 'Failed to fetch leaderboard.' });
    }
  },

  // ── GET /api/v1/leaderboard/my-ranking ─────────────────────────────────
  async getMyRanking(req: Request, res: Response): Promise<Response> {
    try {
      const userId = (req as AuthRequest).user.id;
      const data   = await leaderboardService.getMyGroupRanking(userId);

      return res.status(HTTP.OK).json({
        success: true,
        message: 'Here\'s how your groups compare across campus!',
        data,
      });
    } catch (err: any) {
      if (err.code === 'USER_NOT_FOUND') {
        return res.status(HTTP.NOT_FOUND).json({ success: false, message: err.message });
      }
      console.error('[leaderboard.myRanking]', err);
      return res.status(HTTP.INTERNAL).json({ success: false, message: 'Failed to fetch ranking.' });
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════

  // ── POST /api/v1/leaderboard/admin/compute ─────────────────────────────
  async computeLeaderboard(req: Request, res: Response): Promise<Response> {
    try {
      const period = (req.body.period as string) === 'monthly' ? 'monthly' : 'weekly';
      const result = await leaderboardService.computeAll(period);

      return res.status(HTTP.OK).json({
        success: true,
        message: `Leaderboard recomputed for ${period} period.`,
        data:    {
          period:          result.period,
          from:            result.from,
          to:              result.to,
          hostel_count:    result.hostels.length,
          branch_count:    result.branches.length,
          year_count:      result.years.length,
        },
      });
    } catch (err: any) {
      console.error('[leaderboard.compute]', err);
      return res.status(HTTP.INTERNAL).json({ success: false, message: 'Failed to compute leaderboard.' });
    }
  },

  // ── GET /api/v1/leaderboard/admin/campus ───────────────────────────────
  async getCampusSummary(_req: Request, res: Response): Promise<Response> {
    try {
      const data = await leaderboardService.getCampusSummary();

      return res.status(HTTP.OK).json({
        success: true,
        message: 'Campus-wide analytics summary.',
        data,
      });
    } catch (err: any) {
      console.error('[leaderboard.campusSummary]', err);
      return res.status(HTTP.INTERNAL).json({ success: false, message: 'Failed to fetch campus summary.' });
    }
  },
};