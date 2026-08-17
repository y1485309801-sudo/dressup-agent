import { Router } from 'express';

export function createGarmentRouter({ analyzer }) {
  const router = Router();

  router.post('/analyze', async (req, res) => {
    try {
      const result = await analyzer.analyze({
        imageDataUrl: req.body?.imageDataUrl,
        existingCategory: req.body?.existingCategory
      });
      return res.json(result);
    } catch (error) {
      if (error?.code === 'IMAGE_TOO_LARGE') {
        return res.status(413).json({ error: error.code });
      }
      if (error?.code === 'INVALID_IMAGE' || error?.code === 'INVALID_AI_RESPONSE') {
        return res.status(400).json({ error: error.code });
      }
      if (error?.code === 'AI_NOT_CONFIGURED' || error?.code === 'AI_UNAVAILABLE') {
        return res.status(503).json({ error: error.code, manualFallback: true });
      }
      return res.status(500).json({ error: 'GARMENT_ANALYSIS_FAILED' });
    }
  });

  return router;
}
