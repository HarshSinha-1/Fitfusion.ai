/**
 * controllers/nutrition.controller.ts
 *
 * WHAT THIS FILE DOES:
 * Sits between the route (HTTP layer) and the service (business logic).
 * Each method:
 *   1. Reads validated data from req.body / req.query
 *   2. Calls the right nutritionService method
 *   3. Sends back a clean JSON response
 *   4. Handles errors with correct HTTP status codes
 *
 * It does NOT contain any SQL or business logic — that all lives in
 * services/nutrition.service.ts
 */

import { Request, Response } from 'express';
import nutritionService from '../services/nutrition.service';

// Extend Express Request to include the user object set by auth middleware
interface AuthRequest extends Request {
  user: { id: string; email: string };
}

export const nutritionController = {

  // ── POST /api/v1/nutrition/log-meal ────────────────────────────────────────
  /**
   * Log a meal.
   * Body is already validated by logMealSchema before this runs.
   * Returns the saved log record with auto-calculated nutrition totals.
   */
  async logMeal(req: Request, res: Response): Promise<Response> {
    try {
      const userId = (req as AuthRequest).user.id;
      const log    = await nutritionService.logMeal(userId, req.body);

      return res.status(201).json({
        success: true,
        message: 'Meal logged successfully.',
        data:    log,
      });
    } catch (err: any) {
      console.error('[nutritionController.logMeal]', err);
      return res.status(500).json({ success: false, message: 'Failed to log meal.' });
    }
  },

  // ── GET /api/v1/nutrition/daily-summary ────────────────────────────────────
  /**
   * Get the full nutrition breakdown for a given date (defaults to today).
   * Query param: ?date=YYYY-MM-DD
   *
   * Returns:
   *   - All meals logged that day
   *   - Aggregated totals (calories, protein, carbs, fats, fiber)
   *   - RDI progress bars
   *   - Which meal slots are still missing
   *   - A personalised daily tip
   */
  async getDailySummary(req: Request, res: Response): Promise<Response> {
    try {
      const userId = (req as AuthRequest).user.id;
      const date   = req.query.date as string | undefined;
      const summary = await nutritionService.getDailySummary(userId, date);

      return res.status(200).json({
        success: true,
        data:    summary,
      });
    } catch (err: any) {
      console.error('[nutritionController.getDailySummary]', err);
      return res.status(500).json({ success: false, message: 'Failed to fetch daily summary.' });
    }
  },

  // ── GET /api/v1/nutrition/trends ───────────────────────────────────────────
  /**
   * Get daily nutrition aggregates for the past N days.
   * Query param: ?days=30  (7-90, default 30)
   *
   * Returns:
   *   - Day-by-day array (gaps filled with zeros for chart continuity)
   *   - Period averages
   *   - Weekly bucket breakdown (4 weeks)
   */
  async getNutritionTrends(req: Request, res: Response): Promise<Response> {
    try {
      const userId = (req as AuthRequest).user.id;
      const days   = req.query.days ? parseInt(req.query.days as string, 10) : 30;
      const trends = await nutritionService.getNutritionTrends(userId, days);

      return res.status(200).json({
        success: true,
        data:    trends,
      });
    } catch (err: any) {
      console.error('[nutritionController.getNutritionTrends]', err);
      return res.status(500).json({ success: false, message: 'Failed to fetch trends.' });
    }
  },

  // ── POST /api/v1/nutrition/generate-meal-plan ──────────────────────────────
  /**
   * Generate a personalised meal plan.
   * Body: { goal, dietary_restrictions[], days }
   *
   * Returns a day-by-day plan with breakfast/lunch/snacks/dinner
   * tailored to the user's dietary preferences and fitness goal.
   */
  async generateMealPlan(req: Request, res: Response): Promise<Response> {
    try {
      const userId = (req as AuthRequest).user.id;
      const plan   = await nutritionService.generateMealPlan(userId, req.body);

      return res.status(200).json({
        success: true,
        message: 'Meal plan generated.',
        data:    plan,
      });
    } catch (err: any) {
      console.error('[nutritionController.generateMealPlan]', err);
      return res.status(500).json({ success: false, message: 'Failed to generate meal plan.' });
    }
  },

  // ── GET /api/v1/nutrition/recommendations ──────────────────────────────────
  /**
   * Returns 2-4 personalised actionable tips based on the last 7 days
   * of nutrition data. e.g. "Your protein is low — add dal to your meals."
   */
  async getRecommendations(req: Request, res: Response): Promise<Response> {
    try {
      const userId = (req as AuthRequest).user.id;
      const result = await nutritionService.getRecommendations(userId);

      return res.status(200).json({
        success: true,
        data:    result,
      });
    } catch (err: any) {
      console.error('[nutritionController.getRecommendations]', err);
      return res.status(500).json({ success: false, message: 'Failed to fetch recommendations.' });
    }
  },

  // ── GET /api/v1/nutrition/search ───────────────────────────────────────────
  /**
   * Autocomplete food search used when logging a meal.
   * Query param: ?q=rice
   * Returns matching items from the campus food database.
   */
  async searchFoods(req: Request, res: Response): Promise<Response> {
    try {
      const query   = (req.query.q as string) || '';
      const results = nutritionService.searchFoods(query);

      return res.status(200).json({
        success: true,
        data:    results,
        count:   results.length,
      });
    } catch (err: any) {
      console.error('[nutritionController.searchFoods]', err);
      return res.status(500).json({ success: false, message: 'Search failed.' });
    }
  },
};