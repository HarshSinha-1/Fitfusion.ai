/**
 * controllers/activity.controller.ts
 *
 * HTTP layer for the fitness activity feature.
 * Follows the same pattern as nutrition.controller.ts.
 *
 * Two actor types:
 *   Student — logs their own workouts, views their own history
 *   Admin/Trainer — logs workouts FOR a student, views any student's history
 */

import { Request, Response } from 'express';
import { activityService } from '../services/activity.service';
import { HTTP } from '../configs/constants';

interface AuthRequest extends Request {
  user: { id: string; email: string };
}

function firstQueryValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}

export const activityController = {

  // ── POST /api/v1/activity/log ──────────────────────────────────────────
  /**
   * Student self-logs a workout.
   * user_id is taken from JWT — students can only log for themselves.
   */
  async logActivity(req: Request, res: Response): Promise<Response> {
    try {
      const userId = (req as AuthRequest).user.id;
      const log    = await activityService.logActivity(userId, req.body, userId);

      return res.status(HTTP.CREATED).json({
        success: true,
        message: 'Activity logged successfully.',
        data:    log,
      });
    } catch (err: any) {
      console.error('[activityController.logActivity]', err);
      return res.status(HTTP.INTERNAL).json({
        success: false,
        message: 'Failed to log activity.',
      });
    }
  },

  // ── POST /api/v1/activity/admin/log ────────────────────────────────────
  /**
   * Admin/Trainer logs a workout FOR a specific student.
   * Body must include target_user_id.
   * logged_by is set to the admin's JWT user ID for audit trail.
   */
  async adminLogActivity(req: Request, res: Response): Promise<Response> {
    try {
      const adminId      = (req as AuthRequest).user.id;
      const { target_user_id, ...activityData } = req.body;

      const log = await activityService.logActivity(
        target_user_id,
        activityData,
        adminId,
      );

      return res.status(HTTP.CREATED).json({
        success: true,
        message: `Activity logged for user ${target_user_id} by trainer.`,
        data:    log,
      });
    } catch (err: any) {
      console.error('[activityController.adminLogActivity]', err);
      return res.status(HTTP.INTERNAL).json({
        success: false,
        message: 'Failed to log activity for user.',
      });
    }
  },

  // ── GET /api/v1/activity/daily-summary ─────────────────────────────────
  /**
   * Student views their activity summary for a given day.
   * Query: ?date=2026-03-05  (defaults to today)
   */
  async getDailySummary(req: Request, res: Response): Promise<Response> {
    try {
      const userId = (req as AuthRequest).user.id;
      const date   = firstQueryValue(req.query.date);
      const summary = await activityService.getDailySummary(userId, date);

      return res.status(HTTP.OK).json({
        success: true,
        data:    summary,
      });
    } catch (err: any) {
      console.error('[activityController.getDailySummary]', err);
      return res.status(HTTP.INTERNAL).json({
        success: false,
        message: 'Failed to fetch daily summary.',
      });
    }
  },

  // ── GET /api/v1/activity/history ───────────────────────────────────────
  /**
   * Student views their multi-day activity history.
   * Query: ?days=30  (1-90, default 30)
   */
  async getActivityHistory(req: Request, res: Response): Promise<Response> {
    try {
      const userId = (req as AuthRequest).user.id;
      const daysQuery = firstQueryValue(req.query.days);
      const days   = daysQuery ? parseInt(daysQuery, 10) : 30;
      const history = await activityService.getActivityHistory(userId, days);

      return res.status(HTTP.OK).json({
        success: true,
        data:    history,
      });
    } catch (err: any) {
      console.error('[activityController.getActivityHistory]', err);
      return res.status(HTTP.INTERNAL).json({
        success: false,
        message: 'Failed to fetch activity history.',
      });
    }
  },

  // ── GET /api/v1/activity/admin/user/:userId ────────────────────────────
  /**
   * Admin/Trainer views any student's activity history.
   * Param: :userId  Query: ?days=30
   */
  async adminGetUserActivity(
  req: Request<{ userId: string }>,
  res: Response
): Promise<Response> {
  try {
    const targetUserId = req.params.userId;

    const daysQuery = firstQueryValue(req.query.days);
    const days = daysQuery ? parseInt(daysQuery, 10) : 30;

    const history = await activityService.getActivityForUser(targetUserId, days);

    return res.status(HTTP.OK).json({
      success: true,
      data: history,
    });

  } catch (err: any) {
    console.error('[activityController.adminGetUserActivity]', err);

    return res.status(HTTP.INTERNAL).json({
      success: false,
      message: 'Failed to fetch user activity.',
    });
  }
}
};
