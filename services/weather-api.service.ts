/**
 * services/weather-api.service.ts
 *
 * Fetches real-time weather and air quality data from free public APIs.
 *
 * APIs USED:
 *   1. OpenWeatherMap (free tier: 1000 calls/day, no credit card)
 *      → temperature, humidity, rainfall, weather condition, wind
 *      → Signup: https://openweathermap.org/api
 *
 *   2. WAQI / World Air Quality Index (free, instant token)
 *      → AQI, PM2.5, PM10, dominant pollutant
 *      → Signup: https://aqicn.org/data-platform/token/
 *
 * ENV VARS NEEDED in .env:
 *   OPENWEATHER_API_KEY=your_key_here
 *   WAQI_API_KEY=your_key_here
 *   CAMPUS_LAT=28.6139        (your campus latitude)
 *   CAMPUS_LON=77.2090        (your campus longitude)
 */

const OPENWEATHER_KEY = process.env.OPENWEATHER_API_KEY || '';
const WAQI_KEY        = process.env.WAQI_API_KEY || '';
const CAMPUS_LAT      = process.env.CAMPUS_LAT || '28.6139';
const CAMPUS_LON      = process.env.CAMPUS_LON || '77.2090';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
export interface WeatherData {
  temperature_c:     number;
  feels_like_c:      number;
  humidity_pct:      number;
  rainfall_mm:       number;
  weather_condition: string;
  wind_speed_mps:    number;
  description:       string;
}

export interface AirQualityData {
  aqi:                number;
  aqi_category:       string;
  pm25:               number | null;
  pm10:               number | null;
  dominant_pollutant: string | null;
}

interface OpenWeatherResponse {
  main?: {
    temp?: number;
    feels_like?: number;
    humidity?: number;
  };
  rain?: {
    '1h'?: number;
    '3h'?: number;
  };
  weather?: Array<{
    main?: string;
    description?: string;
  }>;
  wind?: {
    speed?: number;
  };
}

interface WaqiResponse {
  status?: string;
  data?: {
    aqi?: number;
    dominentpol?: string;
    iaqi?: {
      pm25?: { v?: number };
      pm10?: { v?: number };
    };
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function getAqiCategory(aqi: number): string {
  if (aqi <= 50)  return 'good';
  if (aqi <= 100) return 'moderate';
  if (aqi <= 150) return 'unhealthy_sensitive';
  if (aqi <= 200) return 'unhealthy';
  if (aqi <= 300) return 'very_unhealthy';
  return 'hazardous';
}

function mapWeatherCondition(owmMain: string): string {
  const map: Record<string, string> = {
    'Clear': 'sunny', 'Clouds': 'cloudy', 'Rain': 'rainy',
    'Drizzle': 'rainy', 'Thunderstorm': 'stormy', 'Snow': 'cloudy',
    'Mist': 'foggy', 'Fog': 'foggy', 'Haze': 'hazy',
    'Smoke': 'hazy', 'Dust': 'hazy', 'Sand': 'hazy',
    'Tornado': 'stormy', 'Squall': 'windy',
  };
  return map[owmMain] || 'clear';
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. FETCH WEATHER
// ─────────────────────────────────────────────────────────────────────────────
export async function fetchWeather(): Promise<WeatherData | null> {
  if (!OPENWEATHER_KEY) {
    console.warn('[weather-api] OPENWEATHER_API_KEY not set — skipping.');
    return null;
  }

  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${CAMPUS_LAT}&lon=${CAMPUS_LON}&appid=${OPENWEATHER_KEY}&units=metric`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = (await res.json()) as OpenWeatherResponse;
    if (!data.main) return null;

    return {
      temperature_c:     Math.round((data.main.temp ?? 0) * 10) / 10,
      feels_like_c:      Math.round((data.main.feels_like ?? 0) * 10) / 10,
      humidity_pct:      data.main.humidity ?? 0,
      rainfall_mm:       data.rain?.['1h'] || data.rain?.['3h'] || 0,
      weather_condition: mapWeatherCondition(data.weather?.[0]?.main || 'Clear'),
      wind_speed_mps:    data.wind?.speed || 0,
      description:       data.weather?.[0]?.description || '',
    };
  } catch (err) {
    console.error('[weather-api] Weather fetch failed:', err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. FETCH AQI
// ─────────────────────────────────────────────────────────────────────────────
export async function fetchAirQuality(): Promise<AirQualityData | null> {
  if (!WAQI_KEY) {
    console.warn('[weather-api] WAQI_API_KEY not set — skipping.');
    return null;
  }

  try {
    const url = `https://api.waqi.info/feed/geo:${CAMPUS_LAT};${CAMPUS_LON}/?token=${WAQI_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const json = (await res.json()) as WaqiResponse;
    if (json.status !== 'ok' || !json.data) return null;

    const aqi = json.data.aqi ?? 0;
    return {
      aqi,
      aqi_category:       getAqiCategory(aqi),
      pm25:               json.data.iaqi?.pm25?.v ?? null,
      pm10:               json.data.iaqi?.pm10?.v ?? null,
      dominant_pollutant: json.data.dominentpol || null,
    };
  } catch (err) {
    console.error('[weather-api] AQI fetch failed:', err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. FETCH ALL AT ONCE
// ─────────────────────────────────────────────────────────────────────────────
export async function fetchAllEnvironmentData() {
  const [weather, airQuality] = await Promise.all([
    fetchWeather(),
    fetchAirQuality(),
  ]);
  return { weather, airQuality };
}
