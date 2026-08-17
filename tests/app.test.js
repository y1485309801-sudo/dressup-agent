import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';

test('GET /health reports configuration without exposing secrets', async () => {
  const app = createApp({
    config: { jimengConfigured: false, aiConfigured: false },
    services: {}
  });
  const response = await request(app).get('/health').expect(200);

  assert.deepEqual(response.body, {
    ok: true,
    jimengConfigured: false,
    aiConfigured: false
  });
  assert.equal(JSON.stringify(response.body).includes('secret'), false);
});

test('unknown origins do not receive permissive CORS', async () => {
  const app = createApp({
    config: { allowedOrigins: ['http://localhost:3001'] },
    services: {}
  });
  const response = await request(app)
    .get('/health')
    .set('Origin', 'https://example.invalid');

  assert.equal(response.headers['access-control-allow-origin'], undefined);
});
