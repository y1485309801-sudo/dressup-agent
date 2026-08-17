const CACHE_TTL_MS = 30 * 60 * 1000;

function weatherError(code, message, cause) {
  const error = new Error(message);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function conditionFromCode(code) {
  if (code === 0 || code === 1) return 'clear';
  if (code === 2 || code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95 && code <= 99) return 'storm';
  return 'unknown';
}

async function getJson(fetchFn, url) {
  const response = await fetchFn(url);
  if (!response?.ok) {
    throw weatherError('WEATHER_UNAVAILABLE', `Weather provider returned ${response?.status || 'an error'}`);
  }
  return response.json();
}

function dailyValue(daily, key) {
  const value = daily?.[key]?.[0];
  return Number.isFinite(value) ? value : null;
}

function normalizeForecast(payload, city, date, fetchedAt, expiresAt) {
  const current = payload?.current;
  const daily = payload?.daily;

  if (!current || !daily || daily.time?.[0] !== date) {
    throw weatherError('INVALID_WEATHER_RESPONSE', 'Weather response does not contain the requested date');
  }

  return {
    source: 'live',
    city,
    date,
    current: {
      temperature: Number.isFinite(current.temperature_2m) ? current.temperature_2m : null,
      apparentTemperature: Number.isFinite(current.apparent_temperature)
        ? current.apparent_temperature
        : null,
      precipitation: Number.isFinite(current.precipitation) ? current.precipitation : 0,
      windSpeed: Number.isFinite(current.wind_speed_10m) ? current.wind_speed_10m : null,
      condition: conditionFromCode(current.weather_code)
    },
    daily: {
      temperatureMax: dailyValue(daily, 'temperature_2m_max'),
      temperatureMin: dailyValue(daily, 'temperature_2m_min'),
      apparentTemperatureMax: dailyValue(daily, 'apparent_temperature_max'),
      apparentTemperatureMin: dailyValue(daily, 'apparent_temperature_min'),
      precipitationProbability: dailyValue(daily, 'precipitation_probability_max'),
      condition: conditionFromCode(daily.weather_code?.[0])
    },
    fetchedAt,
    expiresAt
  };
}

export function createWeatherService({
  fetchFn = globalThis.fetch,
  baseUrl = 'https://api.open-meteo.com',
  geocodingBaseUrl = 'https://geocoding-api.open-meteo.com',
  now = () => new Date()
} = {}) {
  if (typeof fetchFn !== 'function') {
    throw new TypeError('fetchFn is required');
  }

  const cache = new Map();

  return {
    async getWeather({ city, date }) {
      const normalizedCity = String(city || '').trim();
      const normalizedDate = String(date || '').trim();
      const key = `${normalizedCity.toLocaleLowerCase()}|${normalizedDate}`;
      const currentTime = now();
      const cached = cache.get(key);

      if (cached && currentTime.getTime() < new Date(cached.expiresAt).getTime()) {
        return { ...cached, source: 'cache' };
      }

      try {
        const geocodeUrl = new URL('/v1/search', geocodingBaseUrl);
        geocodeUrl.searchParams.set('name', normalizedCity);
        geocodeUrl.searchParams.set('count', '1');
        geocodeUrl.searchParams.set('language', 'zh');
        geocodeUrl.searchParams.set('format', 'json');

        const geocode = await getJson(fetchFn, geocodeUrl);
        const location = geocode?.results?.[0];
        if (!location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) {
          throw weatherError('CITY_NOT_FOUND', `City not found: ${normalizedCity}`);
        }

        const forecastUrl = new URL('/v1/forecast', baseUrl);
        forecastUrl.searchParams.set('latitude', String(location.latitude));
        forecastUrl.searchParams.set('longitude', String(location.longitude));
        forecastUrl.searchParams.set('current', [
          'temperature_2m',
          'apparent_temperature',
          'precipitation',
          'weather_code',
          'wind_speed_10m'
        ].join(','));
        forecastUrl.searchParams.set('daily', [
          'temperature_2m_max',
          'temperature_2m_min',
          'apparent_temperature_max',
          'apparent_temperature_min',
          'precipitation_probability_max',
          'weather_code'
        ].join(','));
        forecastUrl.searchParams.set('start_date', normalizedDate);
        forecastUrl.searchParams.set('end_date', normalizedDate);
        forecastUrl.searchParams.set('timezone', 'auto');

        const forecast = await getJson(fetchFn, forecastUrl);
        const fetchedAt = currentTime.toISOString();
        const expiresAt = new Date(currentTime.getTime() + CACHE_TTL_MS).toISOString();
        const normalized = normalizeForecast(
          forecast,
          normalizedCity,
          normalizedDate,
          fetchedAt,
          expiresAt
        );
        cache.set(key, normalized);
        return normalized;
      } catch (error) {
        if (error?.code === 'CITY_NOT_FOUND' || error?.code === 'INVALID_WEATHER_RESPONSE') {
          throw error;
        }
        if (error?.code === 'WEATHER_UNAVAILABLE') {
          throw error;
        }
        throw weatherError('WEATHER_UNAVAILABLE', 'Weather provider is unavailable', error);
      }
    }
  };
}
