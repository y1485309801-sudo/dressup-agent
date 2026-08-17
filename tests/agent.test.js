import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createOutfitAgent } from '../src/services/outfit-agent.js';
import { createApp } from '../src/app.js';

const garments = [
  { id: 'top-1', category: 'top', status: 'available' },
  { id: 'pants-1', category: 'bottom', status: 'available' },
  { id: 'coat-1', category: 'outer', status: 'available' },
  { id: 'shoes-1', category: 'shoes', status: 'available' }
];

function createFakes({ aiResult } = {}) {
  const weather = {
    lastCall: null,
    async getWeather(input) {
      this.lastCall = input;
      return {
        source: 'live',
        city: input.city,
        date: input.date,
        current: { apparentTemperature: 12, precipitation: 0 },
        daily: { precipitationProbability: 10 }
      };
    }
  };
  return {
    weather,
    now: () => new Date('2026-08-17T02:00:00Z'),
    recommendOutfits() {
      return {
        outfits: [{
          id: 'outfit-1',
          garmentIds: ['top-1', 'pants-1', 'coat-1', 'shoes-1'],
          variant: 'safe',
          reasons: ['适合天气']
        }],
        gaps: []
      };
    },
    aiClient: aiResult ? {
      async completeJson() {
        return aiResult;
      }
    } : null
  };
}

function requestFixture(overrides = {}) {
  return {
    message: '今天上班',
    profile: { city: '上海', temperatureSensitivity: 'neutral' },
    garments,
    history: [],
    ...overrides
  };
}

test('recommend uses destination city from the message before the home city', async () => {
  const fakes = createFakes();
  const agent = createOutfitAgent(fakes);
  const result = await agent.recommend(requestFixture({
    message: '明天去杭州见客户',
    profile: { city: '上海', temperatureSensitivity: 'neutral' }
  }));

  assert.equal(fakes.weather.lastCall.city, '杭州');
  assert.equal(fakes.weather.lastCall.date, '2026-08-18');
  assert.equal(result.session.constraints.formality, 'formal');
});

test('refine locks the coat and excludes the rejected trousers', async () => {
  const agent = createOutfitAgent(createFakes());
  const result = await agent.refine(requestFixture({
    message: '保留这件外套，不要这条裤子',
    session: {
      city: '上海',
      date: '2026-08-17',
      constraints: { lockedIds: [], forbiddenIds: [] },
      selectedOutfit: {
        garmentIds: ['top-1', 'pants-1', 'coat-1', 'shoes-1']
      }
    }
  }));

  assert.equal(result.session.constraints.lockedIds.includes('coat-1'), true);
  assert.equal(result.session.constraints.forbiddenIds.includes('pants-1'), true);
});

test('drops an explanation result containing a non-candidate garment id', async () => {
  const agent = createOutfitAgent(createFakes({
    aiResult: { garmentIds: ['invented'], reply: '穿 invented' }
  }));
  const result = await agent.recommend(requestFixture());

  assert.equal(result.outfits.some(outfit => outfit.garmentIds.includes('invented')), false);
  assert.equal(result.reply.includes('invented'), false);
});

test('Agent HTTP routes expose recommend and refine methods', async () => {
  const agent = {
    async recommend() {
      return { session: {}, outfits: [], gaps: [], reply: 'ok', needsClarification: false };
    },
    async refine() {
      return { session: {}, outfits: [], gaps: [], reply: 'changed', needsClarification: false };
    }
  };
  const app = createApp({ config: {}, services: { agent } });

  await request(app).post('/api/agent/recommend').send(requestFixture()).expect(200);
  const response = await request(app)
    .post('/api/agent/refine')
    .send(requestFixture({ session: { constraints: {} } }))
    .expect(200);

  assert.equal(response.body.reply, 'changed');
});
