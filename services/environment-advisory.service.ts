/**
 * services/environment-advisory.service.ts
 *
 * Generates fitness advisories based on environmental conditions.
 * Answers: "Should I exercise outdoors right now?"
 *
 * FACTORS CONSIDERED (noise EXCLUDED — unreliable without sensors):
 *   AQI > 100       → sensitive groups avoid outdoor exercise
 *   AQI > 150       → EVERYONE avoid vigorous outdoor exercise
 *   Temperature > 35°C → heat stress risk
 *   Temperature < 5°C  → hypothermia risk
 *   Humidity > 80%     → overheating risk (sweat can't evaporate)
 *   Rainfall > 0       → slippery surfaces
 *   Crowd > 75%        → zone too packed, suggest off-peak
 */

import { WeatherData, AirQualityData } from './weather-api.service';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
export type AdvisoryLevel = 'good' | 'caution' | 'warning' | 'danger';

export interface FitnessAdvisory {
  overall_level:     AdvisoryLevel;
  outdoor_ok:        boolean;
  advisories:        SingleAdvisory[];
  summary:           string;
  indoor_suggestion: string;
}

interface SingleAdvisory {
  factor:  string;
  level:   AdvisoryLevel;
  value:   number | string;
  message: string;
  action:  string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE ADVISORY GENERATOR
// ─────────────────────────────────────────────────────────────────────────────
export function generateFitnessAdvisory(
  weather:      WeatherData | null,
  airQuality:   AirQualityData | null,
  crowdDensity: number | null,
): FitnessAdvisory {
  const advisories: SingleAdvisory[] = [];

  // ── AQI ─────────────────────────────────────────────────────────────────
  if (airQuality) {
    const aqi = airQuality.aqi;
    if (aqi <= 50) {
      advisories.push({
        factor: 'air_quality', level: 'good', value: aqi,
        message: `AQI ${aqi} (Good) — excellent for outdoor exercise.`,
        action: 'All outdoor activities are safe.',
      });
    } else if (aqi <= 100) {
      advisories.push({
        factor: 'air_quality', level: 'caution', value: aqi,
        message: `AQI ${aqi} (Moderate) — acceptable for most people.`,
        action: 'If you have asthma, limit prolonged outdoor exertion.',
      });
    } else if (aqi <= 150) {
      advisories.push({
        factor: 'air_quality', level: 'warning', value: aqi,
        message: `AQI ${aqi} (Unhealthy for Sensitive Groups) — reduce outdoor intensity.`,
        action: 'Move workouts indoors. If outdoor, keep intensity low and under 30 min.',
      });
    } else if (aqi <= 200) {
      advisories.push({
        factor: 'air_quality', level: 'danger', value: aqi,
        message: `AQI ${aqi} (Unhealthy) — everyone should avoid vigorous outdoor exercise.`,
        action: 'INDOOR ONLY. No running/cycling/sports outdoors.',
      });
    } else {
      advisories.push({
        factor: 'air_quality', level: 'danger', value: aqi,
        message: `AQI ${aqi} (${aqi > 300 ? 'Hazardous' : 'Very Unhealthy'}) — avoid ALL outdoor activity.`,
        action: 'STAY INDOORS. Light indoor stretching only.',
      });
    }
  }

  // ── TEMPERATURE ─────────────────────────────────────────────────────────
  if (weather) {
    const temp = weather.temperature_c;
    if (temp >= 42) {
      advisories.push({
        factor: 'temperature', level: 'danger', value: `${temp}°C`,
        message: `Extreme heat: ${temp}°C — heatstroke risk is very high.`,
        action: 'NO outdoor exercise. Indoor AC activities only.',
      });
    } else if (temp >= 38) {
      advisories.push({
        factor: 'temperature', level: 'warning', value: `${temp}°C`,
        message: `Very hot: ${temp}°C (feels like ${weather.feels_like_c}°C).`,
        action: 'Exercise only during 6-8am or 6-8pm. Drink 250ml water every 15 min.',
      });
    } else if (temp >= 35) {
      advisories.push({
        factor: 'temperature', level: 'caution', value: `${temp}°C`,
        message: `Hot: ${temp}°C — increased dehydration risk.`,
        action: 'Prefer early morning or evening. Carry extra water.',
      });
    } else if (temp <= 5) {
      advisories.push({
        factor: 'temperature', level: 'warning', value: `${temp}°C`,
        message: `Cold: ${temp}°C — muscle stiffness and hypothermia risk.`,
        action: 'Warm up indoors first. Layer clothing. Sessions under 40 min.',
      });
    } else {
      advisories.push({
        factor: 'temperature', level: 'good', value: `${temp}°C`,
        message: `${temp}°C — comfortable for outdoor exercise.`,
        action: 'Great conditions!',
      });
    }

    // ── HUMIDITY ───────────────────────────────────────────────────────────
    if (weather.humidity_pct > 85) {
      advisories.push({
        factor: 'humidity', level: 'warning', value: `${weather.humidity_pct}%`,
        message: `Very high humidity: ${weather.humidity_pct}% — overheating risk.`,
        action: 'Reduce intensity. Frequent breaks. Light clothing.',
      });
    } else if (weather.humidity_pct > 70) {
      advisories.push({
        factor: 'humidity', level: 'caution', value: `${weather.humidity_pct}%`,
        message: `High humidity: ${weather.humidity_pct}% — exercise feels harder.`,
        action: 'Stay hydrated. Consider indoor alternatives.',
      });
    }

    // ── RAINFALL ──────────────────────────────────────────────────────────
    if (weather.rainfall_mm > 10) {
      advisories.push({
        factor: 'rain', level: 'warning', value: `${weather.rainfall_mm}mm`,
        message: `Heavy rain: ${weather.rainfall_mm}mm — slippery and poor visibility.`,
        action: 'All activities indoors.',
      });
    } else if (weather.rainfall_mm > 0) {
      advisories.push({
        factor: 'rain', level: 'caution', value: `${weather.rainfall_mm}mm`,
        message: `Light rain: ${weather.rainfall_mm}mm — ground may be wet.`,
        action: 'Walking OK with care. Running/sports → move indoors.',
      });
    }
  }

  // ── CROWD DENSITY ───────────────────────────────────────────────────────
  if (crowdDensity !== null && crowdDensity !== undefined) {
    if (crowdDensity > 85) {
      advisories.push({
        factor: 'crowd', level: 'warning', value: `${crowdDensity}%`,
        message: `Zone is packed (${crowdDensity}%) — limited equipment access.`,
        action: 'Try off-peak hours or an alternative zone.',
      });
    } else if (crowdDensity > 65) {
      advisories.push({
        factor: 'crowd', level: 'caution', value: `${crowdDensity}%`,
        message: `Zone is busy (${crowdDensity}%) — expect wait times.`,
        action: 'Early morning (6-7am) or late evening (9-10pm) is less crowded.',
      });
    }
  }

  // ── OVERALL ASSESSMENT ──────────────────────────────────────────────────
  const levels = advisories.map((a) => a.level);
  const overallLevel: AdvisoryLevel =
    levels.includes('danger')  ? 'danger' :
    levels.includes('warning') ? 'warning' :
    levels.includes('caution') ? 'caution' :
    'good';

  const outdoorOk = !levels.includes('danger') &&
    !(airQuality && airQuality.aqi > 150) &&
    !(weather && weather.temperature_c > 42) &&
    !(weather && weather.rainfall_mm > 10);

  const summary =
    overallLevel === 'good'    ? '✅ Great conditions for outdoor fitness!' :
    overallLevel === 'caution' ? '⚠️ Acceptable with precautions. See details below.' :
    overallLevel === 'warning' ? '🟠 Outdoor exercise not recommended. Try indoors.' :
    '🔴 Outdoor exercise is dangerous. Stay indoors.';

  return {
    overall_level:     overallLevel,
    outdoor_ok:        outdoorOk,
    advisories,
    summary,
    indoor_suggestion: outdoorOk
      ? 'Outdoor activities are fine today!'
      : 'Indoor alternatives: gym, yoga, stretching, badminton, TT, meditation.',
  };
}