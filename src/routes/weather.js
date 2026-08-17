import { Router } from 'express';

export function createWeatherRouter({ weather }) {
  const router = Router();

  router.post('/', async (req, res) => {
    const city = typeof req.body?.city === 'string' ? req.body.city.trim() : '';
    const date = typeof req.body?.date === 'string' ? req.body.date.trim() : '';

    if (!city || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'INVALID_WEATHER_REQUEST' });
    }

    try {
      return res.json(await weather.getWeather({ city, date }));
    } catch (error) {
      if (error?.code === 'CITY_NOT_FOUND') {
        return res.status(404).json({ error: error.code });
      }
      return res.status(503).json({
        error: error?.code || 'WEATHER_UNAVAILABLE'
      });
    }
  });

  return router;
}
