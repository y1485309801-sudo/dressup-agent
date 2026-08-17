import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createGarmentAnalyzer } from '../src/services/garment-analyzer.js';

const validImage = { imageDataUrl: 'data:image/jpeg;base64,AA==' };

test('rate limits repeated AI requests', async () => {
  const app = createApp({
    config: { rateLimit: { limit: 2, windowMs: 60_000 } },
    services: { garmentAnalyzer: createGarmentAnalyzer({ aiClient: null }) }
  });

  await request(app).post('/api/garments/analyze').send(validImage).expect(503);
  await request(app).post('/api/garments/analyze').send(validImage).expect(503);
  const response = await request(app).post('/api/garments/analyze').send(validImage).expect(429);

  assert.equal(response.body.error, 'RATE_LIMITED');
});

test('rejects oversized JSON before any AI call', async () => {
  const fakeAnalyzer = {
    calls: 0,
    async analyze() {
      this.calls += 1;
      return {};
    }
  };
  const app = createApp({ config: {}, services: { garmentAnalyzer: fakeAnalyzer } });

  await request(app)
    .post('/api/garments/analyze')
    .send({ imageDataUrl: 'x'.repeat(11 * 1024 * 1024) })
    .expect(413);

  assert.equal(fakeAnalyzer.calls, 0);
});
