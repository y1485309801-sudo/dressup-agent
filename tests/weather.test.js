import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createWeatherService } from '../src/services/weather.js';
import { createApp } from '../src/app.js';

const geocodeFixture = {
  results: [{ name: '上海', latitude: 31.2304, longitude: 121.4737 }]
};
const forecastFixture = {
  current: {
    temperature_2m: 32.1,
    apparent_temperature: 34.2,
    precipitation: 0,
    weather_code: 1,
    wind_speed_10m: 8.4
  },
  daily: {
    time: ['2026-08-17'],
    temperature_2m_max: [35],
    temperature_2m_min: [27],
    apparent_temperature_max: [37],
    apparent_temperature_min: [29],
    precipitation_probability_max: [20],
    weather_code: [1]
  }
};

function sequenceFetch(...fixtures) {
  const queue = [...fixtures];
  const fetchFn = async url => {
    fetchFn.calls.push(String(url));
    return {
      ok: true,
      status: 200,
      async json() {
        return queue.shift();
      }
    };
  };
  fetchFn.calls = [];
  return fetchFn;
}

test('normalizes current and daily weather and reuses a fresh cache entry', async () => {
  const fetchFn = sequenceFetch(geocodeFixture, forecastFixture);
  const service = createWeatherService({
    fetchFn,
    now: () => new Date('2026-08-17T02:00:00Z')
  });

  const first = await service.getWeather({ city: '上海', date: '2026-08-17' });
  const second = await service.getWeather({ city: '上海', date: '2026-08-17' });

  assert.equal(first.current.apparentTemperature, 34.2);
  assert.equal(first.daily.condition, 'clear');
  assert.equal(second.source, 'cache');
  assert.equal(fetchFn.calls.length, 2);
  assert.match(fetchFn.calls[0], /name=%E4%B8%8A%E6%B5%B7/);
  assert.match(fetchFn.calls[1], /start_date=2026-08-17/);
  assert.match(fetchFn.calls[1], /end_date=2026-08-17/);
});

test('returns WEATHER_UNAVAILABLE when remote data and cache are unavailable', async () => {
  const service = createWeatherService({
    fetchFn: async () => {
      throw new Error('offline');
    }
  });

  await assert.rejects(
    () => service.getWeather({ city: '上海', date: '2026-08-17' }),
    { code: 'WEATHER_UNAVAILABLE' }
  );
});

test('weather route validates input and returns normalized service data', async () => {
  const weather = {
    async getWeather(input) {
      return { source: 'live', city: input.city, date: input.date };
    }
  };
  const app = createApp({ config: {}, services: { weather } });

  await request(app).post('/api/weather').send({ city: '上海' }).expect(400);
  const response = await request(app)
    .post('/api/weather')
    .send({ city: '上海', date: '2026-08-17' })
    .expect(200);

  assert.deepEqual(response.body, {
    source: 'live',
    city: '上海',
    date: '2026-08-17'
  });
});
