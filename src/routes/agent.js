import { Router } from 'express';

export function createAgentRouter({ agent }) {
  const router = Router();

  async function handle(method, req, res) {
    if (typeof req.body?.message !== 'string' || !Array.isArray(req.body?.garments)) {
      return res.status(400).json({ error: 'INVALID_AGENT_REQUEST' });
    }
    try {
      return res.json(await agent[method](req.body));
    } catch (error) {
      if (error?.code === 'WEATHER_UNAVAILABLE' || error?.code === 'INVALID_WEATHER_RESPONSE') {
        return res.status(503).json({ error: error.code, manualWeatherFallback: true });
      }
      return res.status(500).json({ error: 'AGENT_FAILED' });
    }
  }

  router.post('/recommend', (req, res) => handle('recommend', req, res));
  router.post('/refine', (req, res) => handle('refine', req, res));
  return router;
}
