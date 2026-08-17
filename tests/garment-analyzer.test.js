import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createGarmentAnalyzer } from '../src/services/garment-analyzer.js';
import { createApp } from '../src/app.js';

function fakeAiClient(result) {
  return {
    async completeJson() {
      return result;
    }
  };
}

test('normalizes model garment JSON and flags low confidence', async () => {
  const analyzer = createGarmentAnalyzer({
    aiClient: fakeAiClient({
      category: 'outer',
      subtype: '风衣',
      primaryColor: '米色',
      secondaryColors: [],
      pattern: 'solid',
      material: 'cotton',
      thickness: 'medium',
      seasons: ['spring', 'autumn'],
      warmth: 3,
      formality: 'smart-casual',
      styles: ['minimal'],
      functional: ['windproof'],
      confidence: 0.62
    })
  });

  const result = await analyzer.analyze({
    imageDataUrl: 'data:image/jpeg;base64,AA=='
  });

  assert.equal(result.tags.category, 'outer');
  assert.equal(result.tags.subtype, '风衣');
  assert.equal(result.needsReview, true);
});

test('throws AI_NOT_CONFIGURED without sending the image', async () => {
  const analyzer = createGarmentAnalyzer({ aiClient: null });

  await assert.rejects(
    () => analyzer.analyze({ imageDataUrl: 'data:image/jpeg;base64,AA==' }),
    { code: 'AI_NOT_CONFIGURED' }
  );
});

test('rejects unknown enum values instead of persisting them', async () => {
  const analyzer = createGarmentAnalyzer({
    aiClient: fakeAiClient({
      category: 'spacesuit',
      subtype: '未知',
      primaryColor: '银色',
      thickness: 'medium',
      confidence: 0.9
    })
  });

  await assert.rejects(
    () => analyzer.analyze({ imageDataUrl: 'data:image/jpeg;base64,AA==' }),
    { code: 'INVALID_AI_RESPONSE' }
  );
});

test('garment analysis route maps missing AI configuration to manual fallback', async () => {
  const analyzer = createGarmentAnalyzer({ aiClient: null });
  const app = createApp({ config: {}, services: { garmentAnalyzer: analyzer } });

  const response = await request(app)
    .post('/api/garments/analyze')
    .send({ imageDataUrl: 'data:image/jpeg;base64,AA==' })
    .expect(503);

  assert.deepEqual(response.body, {
    error: 'AI_NOT_CONFIGURED',
    manualFallback: true
  });
});
