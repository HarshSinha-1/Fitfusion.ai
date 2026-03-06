/**
 * controllers/mood.controller.ts
 *
 * HTTP layer for the mood & wellness feature.
 * Follows the same pattern as auth.controller.ts and nutrition.controller.ts:
 *   1. Reads validated data from req.body / req.query
 *   2. Calls the right moodService method
 *   3. Sends back a clean JSON response
 *   4. Handles errors with correct HTTP status codes
 */

import { Request, Response } from 'express';
import { moodService } from '../services/mood.service';
import { HTTP } from '../configs/constants';

// Extend Express Request to include the user object set by auth middleware
interface AuthRequest extends Request {
  user: { id: string; email: string };
}

export const moodController = {

  // ── POST /api/v1/mood/log ──────────────────────────────────────────────
  /**
   * Log a mood entry + run the full sentiment → meal/workout pipeline.
   *
   * Body (validated by logMoodSchema):
   * {
   *   "mood_score": 4,
   *   "mood_tags": ["stressed", "tired"],
   *   "journal_entry": "Had a rough day, exam pressure is killing me...",
   *   "circle_id": "optional-uuid"
   * }
   *
   * Returns:
   *   - Saved mood log
   *   - Sentiment analysis results
   *   - Classified mood state
   *   - Mood-aware meal plan
   *   - Mood-aware workout plan
   */
  async logMood(req: Request, res: Response): Promise<Response> {
    try {
      const userId = (req as AuthRequest).user.id;
      const result = await moodService.logMoodAndAnalyze(userId, req.body);

      return res.status(HTTP.CREATED).json({
        success: true,
        message: 'Mood logged and analyzed successfully.',
        data:    result,
      });
    } catch (err: any) {
      console.error('[moodController.logMood]', err);
      return res.status(HTTP.INTERNAL).json({
        success: false,
        message: 'Failed to log mood.',
      });
    }
  },

  // ── GET /api/v1/mood/history ───────────────────────────────────────────
  /**
   * Get mood history for trend charts.
   * Query param: ?days=30  (1-90, default 30)
   *
   * Returns:
   *   - Array of mood logs with sentiment data
   *   - Period info + total count
   */
  async getMoodHistory(req: Request, res: Response): Promise<Response> {
    try {
      const userId = (req as AuthRequest).user.id;
      const days   = req.query.days ? parseInt(req.query.days as string, 10) : 30;
      const history = await moodService.getMoodHistory(userId, days);

      return res.status(HTTP.OK).json({
        success: true,
        data:    history,
      });
    } catch (err: any) {
      console.error('[moodController.getMoodHistory]', err);
      return res.status(HTTP.INTERNAL).json({
        success: false,
        message: 'Failed to fetch mood history.',
      });
    }
  },

  // ── GET /api/v1/mood/recommendations ───────────────────────────────────
  /**
   * Get the latest mood-driven meal + workout recommendations.
   *
   * Returns the most recent (non-expired) recommendations generated
   * by the sentiment analysis pipeline.
   */
  async getRecommendations(req: Request, res: Response): Promise<Response> {
    try {
      const userId = (req as AuthRequest).user.id;
      const recs   = await moodService.getLatestMoodRecommendations(userId);

      return res.status(HTTP.OK).json({
        success: true,
        data:    recs,
      });
    } catch (err: any) {
      console.error('[moodController.getRecommendations]', err);
      return res.status(HTTP.INTERNAL).json({
        success: false,
        message: 'Failed to fetch recommendations.',
      });
    }
  },
};