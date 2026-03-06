/**
 * services/environment.service.ts
 *
 * Business logic for environmental quality tracking.
 *
 * DATA ARCHITECTURE:
 *   environment_logs → weather + AQI (from APIs or admin override)
 *   crowd_logs       → headcount per zone per time_slot (admin only)
 *
 * NO noise tracking (removed — unreliable without calibrated hardware).
 *
 * TREND DATA FORMAT:
 *   All trend endpoints return data structured for direct chart rendering:
 *   - x-axis: date
 *   - y-axis: value (AQI, temperature, humidity, crowd %)
 *   - series: by factor (for multi-line charts)
 */

import pool from '../configs/db';
import { fetchAllEnvironmentData } from './weather-api.service';
import { generateFitnessAdvisory } from './environment-advisory.service';

export const environmentService = {

  // ═══════════════════════════════════════════════════════════════════════════
  // WEATHER + AQI (from external APIs)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Fetch live weather + AQI from APIs, store in environment_logs, return.
   * Called when student opens the Environment Details page.
   */
  async fetchAndStoreCurrent() {
    const { weather, airQuality } = await fetchAllEnvironmentData();

    if (!weather && !airQuality) return null;

    const { rows } = await pool.query(
      `INSERT INTO environment_logs
         (zone, aqi, aqi_category,
          temperature_c, humidity_pct, rainfall_mm, weather_condition,
          logged_at)
       VALUES ('campus', $1, $2, $3, $4, $5, $6, NOW())
       RETURNING *`,
      [
        airQuality?.aqi ?? null,
        airQuality?.aqi_category ?? null,
        weather?.temperature_c ?? null,
        weather?.humidity_pct ?? null,
        weather?.rainfall_mm ?? null,
        weather?.weather_condition ?? null,
      ],
    );

    return {
      log:         rows[0],
      weather,
      air_quality: airQuality,
    };
  },

  /**
   * Admin manually overrides weather/AQI for a zone.
   */
  async logAdminEnvironment(adminId: string, body: {
    zone: string; aqi?: number; aqi_category?: string;
    temperature_c?: number; humidity_pct?: number;
    rainfall_mm?: number; weather_condition?: string;
  }) {
    const { rows } = await pool.query(
      `INSERT INTO environment_logs
         (zone, aqi, aqi_category,
          temperature_c, humidity_pct, rainfall_mm, weather_condition,
          logged_by, logged_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       RETURNING *`,
      [
        body.zone,
        body.aqi ?? null, body.aqi_category ?? null,
        body.temperature_c ?? null, body.humidity_pct ?? null,
        body.rainfall_mm ?? null, body.weather_condition ?? null,
        adminId,
      ],
    );
    return rows[0];
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CROWD DENSITY (admin-only, 3 time slots per day)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Admin logs headcount at a zone for a time slot.
   * UPSERT: if an entry for this zone+slot+date already exists, update it.
   */
  async logCrowdDensity(adminId: string, body: {
    zone: string; time_slot: string; crowd_density: number;
    headcount?: number; notes?: string;
  }) {
    const { rows } = await pool.query(
      `INSERT INTO crowd_logs
         (zone, time_slot, crowd_density, headcount, notes, logged_by, log_date, logged_at)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE, NOW())
       ON CONFLICT (zone, time_slot, log_date)
       DO UPDATE SET
         crowd_density = EXCLUDED.crowd_density,
         headcount     = EXCLUDED.headcount,
         notes         = EXCLUDED.notes,
         logged_by     = EXCLUDED.logged_by,
         logged_at     = NOW()
       RETURNING *`,
      [
        body.zone, body.time_slot, body.crowd_density,
        body.headcount ?? null, body.notes ?? null,
        adminId,
      ],
    );
    return rows[0];
  },

  /**
   * Get today's crowd density for all zones.
   * Returns: { zone, morning, afternoon, night } per zone.
   * This is what students see on the Environment Details page.
   */
  async getTodayCrowd() {
    const { rows } = await pool.query(
      `SELECT
         zone,
         MAX(CASE WHEN time_slot = 'morning'   THEN crowd_density END) AS morning,
         MAX(CASE WHEN time_slot = 'afternoon'  THEN crowd_density END) AS afternoon,
         MAX(CASE WHEN time_slot = 'night'      THEN crowd_density END) AS night,
         MAX(CASE WHEN time_slot = 'morning'   THEN headcount END)     AS morning_headcount,
         MAX(CASE WHEN time_slot = 'afternoon'  THEN headcount END)     AS afternoon_headcount,
         MAX(CASE WHEN time_slot = 'night'      THEN headcount END)     AS night_headcount
       FROM crowd_logs
       WHERE log_date = CURRENT_DATE
       GROUP BY zone
       ORDER BY zone`,
    );

    return rows.map((r) => ({
      zone:      r.zone,
      morning:   r.morning   !== null ? { density: r.morning,   headcount: r.morning_headcount }   : null,
      afternoon: r.afternoon !== null ? { density: r.afternoon, headcount: r.afternoon_headcount } : null,
      night:     r.night     !== null ? { density: r.night,     headcount: r.night_headcount }     : null,
    }));
  },

  // ══════════════════��════════════════════════════════════════════════════════
  // TREND DATA (structured for frontend charts)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * AQI TREND — daily average AQI for the past N days.
   * Frontend: bar chart or line chart, color-coded by category.
   *
   * Returns:
   * [
   *   { date: "2026-03-01", avg_aqi: 85, category: "moderate" },
   *   { date: "2026-03-02", avg_aqi: 142, category: "unhealthy_sensitive" },
   *   ...
   * ]
   */
  async getAqiTrend(days: number = 7) {
    days = Math.min(days, 30);

    const { rows } = await pool.query(
      `SELECT
         DATE(logged_at AT TIME ZONE 'UTC')  AS date,
         AVG(aqi)::integer                   AS avg_aqi,
         MIN(aqi)::integer                   AS min_aqi,
         MAX(aqi)::integer                   AS max_aqi,
         COUNT(*)::integer                   AS reading_count
       FROM environment_logs
       WHERE zone = 'campus'
         AND aqi IS NOT NULL
         AND logged_at >= NOW() - ($1 || ' days')::interval
       GROUP BY DATE(logged_at AT TIME ZONE 'UTC')
       ORDER BY date ASC`,
      [days],
    );

    // Add category labels for chart coloring
    return rows.map((r) => ({
      ...r,
      category:
        r.avg_aqi <= 50  ? 'good' :
        r.avg_aqi <= 100 ? 'moderate' :
        r.avg_aqi <= 150 ? 'unhealthy_sensitive' :
        r.avg_aqi <= 200 ? 'unhealthy' :
        r.avg_aqi <= 300 ? 'very_unhealthy' :
        'hazardous',
    }));
  },

  /**
   * WEATHER TREND — daily temperature, humidity, rainfall.
   * Frontend: multi-line chart (temperature curve + humidity line + rainfall bars).
   *
   * Returns:
   * [
   *   { date: "2026-03-01", avg_temp: 28.5, min_temp: 22, max_temp: 35,
   *     avg_humidity: 65, total_rainfall: 0 },
   *   ...
   * ]
   */
  async getWeatherTrend(days: number = 7) {
    days = Math.min(days, 30);

    const { rows } = await pool.query(
      `SELECT
         DATE(logged_at AT TIME ZONE 'UTC')     AS date,
         AVG(temperature_c)::numeric(5,1)       AS avg_temp,
         MIN(temperature_c)::numeric(5,1)       AS min_temp,
         MAX(temperature_c)::numeric(5,1)       AS max_temp,
         AVG(humidity_pct)::integer              AS avg_humidity,
         SUM(rainfall_mm)::numeric(7,1)         AS total_rainfall,
         MODE() WITHIN GROUP (ORDER BY weather_condition) AS dominant_condition,
         COUNT(*)::integer                       AS reading_count
       FROM environment_logs
       WHERE zone = 'campus'
         AND temperature_c IS NOT NULL
         AND logged_at >= NOW() - ($1 || ' days')::interval
       GROUP BY DATE(logged_at AT TIME ZONE 'UTC')
       ORDER BY date ASC`,
      [days],
    );

    return rows;
  },

  /**
   * CROWD TREND — daily crowd density per zone, split by time slot.
   * Frontend: grouped bar chart (morning vs afternoon vs night) per day.
   *
   * Returns:
   * [
   *   { date: "2026-03-01", zone: "gym", morning: 40, afternoon: 75, night: 55 },
   *   { date: "2026-03-01", zone: "ground", morning: 20, afternoon: 60, night: 30 },
   *   ...
   * ]
   */
  async getCrowdTrend(zone?: string, days: number = 7) {
    days = Math.min(days, 30);

    let query = `
      SELECT
        log_date::text                                                AS date,
        zone,
        MAX(CASE WHEN time_slot = 'morning'   THEN crowd_density END) AS morning,
        MAX(CASE WHEN time_slot = 'afternoon'  THEN crowd_density END) AS afternoon,
        MAX(CASE WHEN time_slot = 'night'      THEN crowd_density END) AS night
      FROM crowd_logs
      WHERE log_date >= CURRENT_DATE - ($1 || ' days')::interval
    `;
    const params: any[] = [days];

    if (zone) {
      query += ` AND zone = $2`;
      params.push(zone);
    }

    query += `
      GROUP BY log_date, zone
      ORDER BY log_date ASC, zone
    `;

    const { rows } = await pool.query(query, params);
    return rows;
  },

  /**
   * COMBINED TRENDS — returns all 3 trend datasets in one call.
   * This is the main endpoint for the "Environment Details" page.
   * Frontend renders: AQI chart + Weather chart + Crowd chart.
   */
  async getAllTrends(days: number = 7) {
    const [aqiTrend, weatherTrend, crowdTrend] = await Promise.all([
      this.getAqiTrend(days),
      this.getWeatherTrend(days),
      this.getCrowdTrend(undefined, days),
    ]);

    return {
      period_days: days,
      aqi:     aqiTrend,
      weather: weatherTrend,
      crowd:   crowdTrend,
    };
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CAMPUS OVERVIEW (dashboard)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Full dashboard: latest weather + AQI + today's crowd + fitness advisory.
   */
  async getCampusOverview() {
    // Latest weather/AQI
    const { rows: weatherRows } = await pool.query(
      `SELECT aqi, aqi_category, temperature_c, humidity_pct,
              rainfall_mm, weather_condition, logged_at
       FROM environment_logs
       WHERE zone = 'campus' AND temperature_c IS NOT NULL
       ORDER BY logged_at DESC LIMIT 1`,
    );

    // Today's crowd
    const todayCrowd = await this.getTodayCrowd();

    const weather = weatherRows[0] || null;

    // Current time slot for advisory
    const hour = new Date().getHours();
    const currentSlot = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'night';

    // Get the busiest zone right now for advisory
    const currentCrowdMax = todayCrowd.reduce((max, z) => {
      const slotData = z[currentSlot as keyof typeof z] as { density: number } | null;
      const density = slotData?.density ?? 0;
      return density > max ? density : max;
    }, 0);

    // Generate fitness advisory
    const advisory = generateFitnessAdvisory(
      weather ? {
        temperature_c: parseFloat(weather.temperature_c) || 0,
        feels_like_c: parseFloat(weather.temperature_c) || 0,
        humidity_pct: weather.humidity_pct || 0,
        rainfall_mm: parseFloat(weather.rainfall_mm) || 0,
        weather_condition: weather.weather_condition || 'clear',
        wind_speed_mps: 0, description: '',
      } : null,
      weather?.aqi ? {
        aqi: weather.aqi, aqi_category: weather.aqi_category,
        pm25: null, pm10: null, dominant_pollutant: null,
      } : null,
      currentCrowdMax > 0 ? currentCrowdMax : null,
    );

    return {
      current_weather: weather ? {
        temperature_c:     parseFloat(weather.temperature_c),
        humidity_pct:      weather.humidity_pct,
        rainfall_mm:       parseFloat(weather.rainfall_mm),
        weather_condition: weather.weather_condition,
        aqi:               weather.aqi,
        aqi_category:      weather.aqi_category,
        last_updated:      weather.logged_at,
      } : null,
      current_time_slot: currentSlot,
      crowd_today:       todayCrowd,
      fitness_advisory:  advisory,
    };
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // FOR MOOD PIPELINE (internal use)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Used internally by mood.service.ts when generating workout recommendations.
   */
  async getLatestForFitnessPipeline() {
    const { rows } = await pool.query(
      `SELECT aqi, aqi_category, temperature_c, humidity_pct,
              rainfall_mm, weather_condition
       FROM environment_logs
       WHERE zone = 'campus' AND temperature_c IS NOT NULL
       ORDER BY logged_at DESC LIMIT 1`,
    );

    if (rows.length === 0) return null;

    const r = rows[0];
    return {
      aqi:               r.aqi,
      aqi_category:      r.aqi_category,
      temperature_c:     parseFloat(r.temperature_c) || null,
      humidity_pct:      r.humidity_pct,
      rainfall_mm:       parseFloat(r.rainfall_mm) || 0,
      weather_condition: r.weather_condition,
      outdoor_ok:        (r.aqi || 0) <= 150 &&
                         (parseFloat(r.temperature_c) || 25) < 42 &&
                         (parseFloat(r.rainfall_mm) || 0) < 10,
    };
  },
};