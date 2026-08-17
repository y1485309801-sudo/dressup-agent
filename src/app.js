import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRateLimiter } from './middleware/rate-limit.js';
import { createAgentRouter } from './routes/agent.js';
import { createGarmentRouter } from './routes/garments.js';
import { createWeatherRouter } from './routes/weather.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const publicDirectory = path.resolve(currentDirectory, '../public');

function applyCors(allowedOrigins = []) {
  const allowed = new Set(allowedOrigins);
  return function corsAllowlist(req, res, next) {
    const origin = req.get('Origin');
    if (origin && allowed.has(origin)) {
      res.set('Access-Control-Allow-Origin', origin);
      res.vary('Origin');
    }
    next();
  };
}

export function createApp({ config = {}, services = {} } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(applyCors(config.allowedOrigins));
  app.use(express.json({ limit: '10mb' }));

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      jimengConfigured: Boolean(config.jimengConfigured),
      aiConfigured: Boolean(config.aiConfigured)
    });
  });

  app.get('/images/:id', async (req, res, next) => {
    try {
      const image = await services.imageStore?.get(req.params.id);
      if (!image) return res.status(404).json({ error: 'IMAGE_NOT_FOUND' });
      res.type(image.contentType || 'image/jpeg');
      return res.send(image.body);
    } catch (error) {
      return next(error);
    }
  });

  if (services.weather) app.use('/api/weather', createWeatherRouter({ weather: services.weather }));
  const aiRateLimiter = createRateLimiter(config.rateLimit);
  if (services.garmentAnalyzer) {
    app.use('/api/garments/analyze', aiRateLimiter);
    app.use('/api/garments', createGarmentRouter({ analyzer: services.garmentAnalyzer }));
  }
  if (services.agent) {
    app.use('/api/agent', aiRateLimiter);
    app.use('/api/agent', createAgentRouter({ agent: services.agent }));
  }

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API_ROUTE_NOT_FOUND' });
  });

  app.use(express.static(publicDirectory));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(publicDirectory, 'index.html'));
  });

  app.use((error, _req, res, _next) => {
    const status = error.type === 'entity.too.large' ? 413 : 500;
    const code = status === 413 ? 'PAYLOAD_TOO_LARGE' : 'INTERNAL_ERROR';
    res.status(status).json({ error: code });
  });

  return app;
}
