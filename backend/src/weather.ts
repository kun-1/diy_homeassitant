export type WeatherSnapshot = {
  location: string;
  temperatureC: number;
  lowC: number | null;
  highC: number | null;
  weatherCode: number;
  label: string;
  fetchedAt: string;
};

type OpenMeteoResponse = {
  current?: { temperature_2m?: number; weather_code?: number };
  daily?: { temperature_2m_min?: number[]; temperature_2m_max?: number[] };
};

const LOCATION = '上海浦东';
const LATITUDE = 31.22;
const LONGITUDE = 121.54;
const CACHE_MS = 10 * 60 * 1000;
let cached: { value: WeatherSnapshot; expiresAt: number } | null = null;

const labels: Record<number, string> = {
  0: '晴', 1: '大部晴朗', 2: '局部多云', 3: '阴',
  45: '雾', 48: '雾凇', 51: '小毛毛雨', 53: '毛毛雨', 55: '大毛毛雨',
  61: '小雨', 63: '中雨', 65: '大雨', 71: '小雪', 73: '中雪', 75: '大雪',
  80: '阵雨', 81: '中阵雨', 82: '强阵雨', 95: '雷雨', 96: '雷雨伴冰雹', 99: '强雷雨伴冰雹',
};

export async function getWeather(): Promise<WeatherSnapshot | null> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({
    latitude: String(LATITUDE), longitude: String(LONGITUDE),
    current: 'temperature_2m,weather_code',
    daily: 'temperature_2m_min,temperature_2m_max',
    timezone: 'Asia/Shanghai',
  }).toString();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('weather upstream ' + response.status);
    const payload = await response.json() as OpenMeteoResponse;
    const temperatureC = payload.current?.temperature_2m;
    const weatherCode = payload.current?.weather_code;
    if (typeof temperatureC !== 'number' || typeof weatherCode !== 'number') throw new Error('weather payload incomplete');
    const value: WeatherSnapshot = {
      location: LOCATION,
      temperatureC: Math.round(temperatureC),
      lowC: typeof payload.daily?.temperature_2m_min?.[0] === 'number' ? Math.round(payload.daily.temperature_2m_min[0]) : null,
      highC: typeof payload.daily?.temperature_2m_max?.[0] === 'number' ? Math.round(payload.daily.temperature_2m_max[0]) : null,
      weatherCode,
      label: labels[weatherCode] ?? '天气变化中',
      fetchedAt: new Date().toISOString(),
    };
    cached = { value, expiresAt: now + CACHE_MS };
    return value;
  } catch {
    return cached?.value ?? null;
  }
}
