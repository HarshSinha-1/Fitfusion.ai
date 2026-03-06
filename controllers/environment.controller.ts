/**
 * controllers/environment.controller.ts
 *
 * HTTP layer for environmental quality.
 *
 * Student endpoints: view weather, AQI, crowd, trends, advisory
 * Admin endpoints: log crowd density, override weather
 */

import { Request, Response } from 'express';
import { environmentService } from '../services/environment.service';
import { HTTP } from '../configs/constants';

interface AuthRequest extends Request {
  user: { id: string; email: string };
}

export const environmentController = {

  // ── GET /api/v1/environment/current ────────────────────────────────────
  async getCurrentConditions(_req: Request, res: Response): Promise<Response> {
    try {
      const result = await environmentService.fetchAndStoreCurrent();
      if (!result) {
        return res.status(HTTP.OK).json({
          success: true,
          message: 'Weather APIs not configured. Add OPENWEATHER_API_KEY and WAQI_API_KEY to .env',
          data: null,
        });
      }
      return res.status(HTTP.OK).json({ success: true, data: result });
    } catch (err: any) {
      console.error('[env.getCurrentConditions]', err);
      return res.status(HTTP.INTERNAL).json({ success: false, message: 'Failed to fetch conditions.' });
    }
  },

  // ── GET /api/v1/environment/campus ─────────────────────────────────────
  async getCampusOverview(_req: Request, res: Response): Promise<Response> {
    try {
      const data = await environmentService.getCampusOverview();
      return res.status(HTTP.OK).json({ success: true, data });
    } catch (err: any) {
      console.error('[env.getCampusOverview]', err);
      return res.status(HTTP.INTERNAL).json({ success: false, message: 'Failed to fetch overview.' });
    }
  },

  // ── GET /api/v1/environment/fitness-advisory?zone=gym ──────────────────
  async getFitnessAdvisory(req: Request, res: Response): Promise<Response> {
    try {
      const overview = await environmentService.getCampusOverview();
      return res.status(HTTP.OK).json({
        success: true,
        data: overview.fitness_advisory,
      });
    } catch (err: any) {
      console.error('[env.getFitnessAdvisory]', err);
      return res.status(HTTP.INTERNAL).json({ success: false, message: 'Failed to generate advisory.' });
    }
  },

  // ── GET /api/v1/environment/crowd/today ────────────────────────────────
  async getTodayCrowd(_req: Request, res: Response): Promise<Response> {
    try {
      const data = await environmentService.getTodayCrowd();
      return res.status(HTTP.OK).json({ success: true, data });
    } catch (err: any) {
      console.error('[env.getTodayCrowd]', err);
      return res.status(HTTP.INTERNAL).json({ success: false, message: 'Failed to fetch crowd data.' });
    }
  },

  // ── GET /api/v1/environment/trends?days=7 ──────────────────────────────
  async getAllTrends(req: Request, res: Response): Promise<Response> {
    try {
      const days = req.query.days ? parseInt(req.query.days as string, 10) : 7;
      const data = await environmentService.getAllTrends(days);
      return res.status(HTTP.OK).json({ success: true, data });
    } catch (err: any) {
      console.error('[env.getAllTrends]', err);
      return res.status(HTTP.INTERNAL).json({ success: false, message: 'Failed to fetch trends.' });
    }
  },

  // ── GET /api/v1/environment/trends/aqi?days=7 ─────────────────────────
  async getAqiTrend(req: Request, res: Response): Promise<Response> {
    try {
      const days = req.query.days ? parseInt(req.query.days as string, 10) : 7;
      const data = await environmentService.getAqiTrend(days);
      return res.status(HTTP.OK).json({ success: true, data });
    } catch (err: any) {
      console.error('[env.getAqiTrend]', err);
      return res.status(HTTP.INTERNAL).json({ success: false, message: 'Failed to fetch AQI trend.' });
    }
  },

  // ── GET /api/v1/environment/trends/weather?days=7 ──────────────────────
  async getWeatherTrend(req: Request, res: Response): Promise<Response> {
    try {
      const days = req.query.days ? parseInt(req.query.days as string, 10) : 7;
      const data = await environmentService.getWeatherTrend(days);
      return res.status(HTTP.OK).json({ success: true, data });
    } catch (err: any) {
      console.error('[env.getWeatherTrend]', err);
      return res.status(HTTP.INTERNAL).json({ success: false, message: 'Failed to fetch weather trend.' });
    }
  },

  // ── GET /api/v1/environment/trends/crowd?zone=gym&days=7 ───────────────
  async getCrowdTrend(req: Request, res: Response): Promise<Response> {
    try {
      const zone = req.query.zone as string | undefined;
      const days = req.query.days ? parseInt(req.query.days as string, 10) : 7;
      const data = await environmentService.getCrowdTrend(zone, days);
      return res.status(HTTP.OK).json({ success: true, data });
    } catch (err: any) {
      console.error('[env.getCrowdTrend]', err);
      return res.status(HTTP.INTERNAL).json({ success: false, message: 'Failed to fetch crowd trend.' });
    }
  },

  // ── POST /api/v1/environment/admin/crowd ───────────────────────────────
  async adminLogCrowd(req: Request, res: Response): Promise<Response> {
    try {
      const adminId = (req as AuthRequest).user.id;
      const log = await environmentService.logCrowdDensity(adminId, req.body);
      return res.status(HTTP.CREATED).json({
        success: true,
        message: `Crowd density logged for ${req.body.zone} (${req.body.time_slot}).`,
        data: log,
      });
    } catch (err: any) {
      console.error('[env.adminLogCrowd]', err);
      return res.status(HTTP.INTERNAL).json({ success: false, message: 'Failed to log crowd data.' });
    }
  },

  // ── POST /api/v1/environment/admin/log ─────────────────────────────────
  async adminLog(req: Request, res: Response): Promise<Response> {
    try {
      const adminId = (req as AuthRequest).user.id;
      const log = await environmentService.logAdminEnvironment(adminId, req.body);
      return res.status(HTTP.CREATED).json({
        success: true,
        message: 'Environment data logged.',
        data: log,
      });
    } catch (err: any) {
      console.error('[env.adminLog]', err);
      return res.status(HTTP.INTERNAL).json({ success: false, message: 'Failed to log environment.' });
    }
  },
};