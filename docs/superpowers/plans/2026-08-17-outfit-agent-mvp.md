# Outfit Recommendation Agent MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-user outfit recommendation Agent that combines a saved city, live weather, editable AI garment tags, the user's available wardrobe, and conversational refinements to return two or three visual outfit cards made only from owned garments.

**Architecture:** Convert the current prototype into one Node.js ESM application that serves a modular vanilla-JavaScript frontend and JSON APIs from the same origin. Keep profile, wardrobe, sessions, feedback, and calendar data local-first in the browser; keep weather, AI-provider calls, recommendation rules, and final garment-ID validation on the server. Use deterministic hard filters and scoring before any language-model explanation so the model cannot invent garments.

**Tech Stack:** Node.js 18+, Express 4, native `fetch`, vanilla HTML/CSS/ES modules, browser `localStorage`, Node's built-in test runner, Supertest for HTTP tests, an OpenAI-compatible multimodal/chat endpoint configured only through environment variables, and a configurable weather provider with Open-Meteo-compatible defaults.

## Global Constraints

- Recommend only garment IDs supplied by the user's wardrobe and whose status is `available`.
- Return at most three outfits; return fewer with an explicit wardrobe-gap message when necessary.
- Keep Jimeng virtual try-on opt-in; never generate a try-on image during normal recommendation.
- Keep all API credentials server-side; never commit `.env`, real AK/SK values, images, or base64 data.
- Maintain a manual garment-tagging fallback when the AI provider is unavailable.
- Maintain a manual weather fallback when weather lookup and valid cache both fail.
- First release remains single-user and local-first; do not add accounts, cloud sync, community, products, affiliate links, or purchasing.
- Use ESM consistently and keep every new file focused on one responsibility.

## Target File Structure

```text
package.json                     Node scripts and dependency declarations
server.js                        Process entrypoint only
src/app.js                       Express application composition
src/config.js                    Environment parsing and defaults
src/domain/recommendation.js     Hard filters, outfit combinations, scoring, diversity
src/domain/validation.js         Garment, profile, request, and result validation
src/routes/agent.js              Recommend/refine HTTP endpoints
src/routes/garments.js           Garment image analysis endpoint
src/routes/weather.js            Weather HTTP endpoint
src/services/ai-client.js        OpenAI-compatible JSON client
src/services/garment-analyzer.js Image-to-tag orchestration and schema checks
src/services/intent-parser.js    Text-to-constraint parsing with heuristic fallback
src/services/outfit-agent.js     Weather + wardrobe + recommendation orchestration
src/services/weather.js          Geocoding, forecast normalization, and cache
src/middleware/rate-limit.js     In-memory request throttling
public/index.html                Existing UI plus Agent/Profile pages
public/styles/app.css            Existing styles and shell/navigation styles
public/styles/agent.css          Agent, onboarding, weather, and outfit-card styles
public/js/main.js                Application bootstrap and tab navigation
public/js/api.js                 Same-origin API client
public/js/store.js               Namespaced localStorage access and migration
public/js/profile.js             Onboarding and profile settings
public/js/wardrobe.js            Existing wardrobe UI plus editable AI tags
public/js/agent.js               Conversation state, prompts, cards, refinements
public/js/calendar.js            Existing calendar and recommendation integration
public/js/try-on.js              Existing Jimeng opt-in flow
tests/app.test.js                Health, static serving, CORS, and body-limit tests
tests/validation.test.js         Input and output contract tests
tests/weather.test.js            Weather normalization/cache/fallback tests
tests/garment-analyzer.test.js   AI tag parsing and failure tests
tests/recommendation.test.js     Filter, combination, scoring, diversity tests
tests/agent.test.js              Recommend/refine and hallucination rejection tests
tests/store.test.js              Legacy local data migration tests
```

---

### Task 1: Secure Single-Service Application Foundation

**Files:**
- Modify: `package.json`
- Modify: `server.js`
- Create: `src/config.js`
- Create: `src/app.js`
- Create: `src/middleware/rate-limit.js`
- Move: `index.html` to `public/index.html`
- Test: `tests/app.test.js`

**Interfaces:**
- Consumes: `JIMENG_AK`, `JIMENG_SK`, `BASE_URL`, `PORT`, `AI_BASE_URL`, `AI_API_KEY`, `AI_VISION_MODEL`, `AI_CHAT_MODEL`, `WEATHER_API_BASE_URL`.
- Produces: `createApp({ config, services })`, `loadConfig(env)`, and an HTTP server serving `/`, `/health`, `/api/*`, and `/images/:id`.

- [ ] **Step 1: Write failing foundation tests**

```js
// tests/app.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';

test('GET /health reports configuration without exposing secrets', async () => {
  const app = createApp({ config: { jimengConfigured: false, aiConfigured: false }, services: {} });
  const response = await request(app).get('/health').expect(200);
  assert.deepEqual(response.body, { ok: true, jimengConfigured: false, aiConfigured: false });
  assert.equal(JSON.stringify(response.body).includes('secret'), false);
});

test('unknown origins do not receive permissive CORS', async () => {
  const app = createApp({ config: { allowedOrigins: ['http://localhost:3001'] }, services: {} });
  const response = await request(app).get('/health').set('Origin', 'https://example.invalid');
  assert.equal(response.headers['access-control-allow-origin'], undefined);
});
```

- [ ] **Step 2: Run the tests and verify the expected failure**

Run: `npm test -- tests/app.test.js`  
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/app.js`.

- [ ] **Step 3: Convert the package to ESM and implement the application shell**

```json
{
  "name": "dressup-agent",
  "version": "2.0.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=18.0.0" },
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js",
    "test": "node --test"
  },
  "dependencies": { "express": "^4.21.2" },
  "devDependencies": { "supertest": "^7.1.1" }
}
```

```js
// src/config.js
export function loadConfig(env = process.env) {
  return {
    port: Number(env.PORT || 3001),
    baseUrl: env.BASE_URL || '',
    allowedOrigins: (env.ALLOWED_ORIGINS || 'http://localhost:3001').split(',').map(v => v.trim()),
    jimengAk: env.JIMENG_AK || '',
    jimengSk: env.JIMENG_SK || '',
    jimengConfigured: Boolean(env.JIMENG_AK && env.JIMENG_SK),
    aiBaseUrl: (env.AI_BASE_URL || '').replace(/\/$/, ''),
    aiApiKey: env.AI_API_KEY || '',
    aiVisionModel: env.AI_VISION_MODEL || '',
    aiChatModel: env.AI_CHAT_MODEL || '',
    aiConfigured: Boolean(env.AI_BASE_URL && env.AI_API_KEY && env.AI_CHAT_MODEL),
    weatherBaseUrl: (env.WEATHER_API_BASE_URL || 'https://api.open-meteo.com').replace(/\/$/, '')
  };
}
```

Implement `createApp` with a 10 MB JSON limit, same-origin static serving from `public`, an origin allowlist, JSON 404 responses for `/api/*`, and no secret-bearing logs. Move the current HTML unchanged first; later tasks extract its inline CSS and JavaScript.

- [ ] **Step 4: Run foundation tests**

Run: `npm test -- tests/app.test.js`  
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit the independently running foundation**

```bash
git add package.json server.js src public/index.html tests/app.test.js
git commit -m "refactor: create secure single-service app foundation"
```

### Task 2: Local Data Contracts and Legacy Migration

**Files:**
- Create: `src/domain/validation.js`
- Create: `public/js/store.js`
- Test: `tests/validation.test.js`
- Test: `tests/store.test.js`

**Interfaces:**
- Consumes: legacy `dressup_clothes`, `dressup_calendar`, and `dressup_inspo` JSON.
- Produces: `validateProfile(value)`, `validateGarment(value)`, `validateRecommendationRequest(value)`, `validateRecommendationResult(value, allowedIds)`, `createStore(storage)`, and schema version `2`.

- [ ] **Step 1: Write failing schema and migration tests**

```js
test('legacy garment migrates to an available v2 garment', () => {
  const storage = fakeStorage({ dressup_clothes: JSON.stringify([{ id: 'w1', category: 'top', colorName: '白色', imgSrc: 'data:x' }]) });
  const store = createStore(storage);
  const [garment] = store.getGarments();
  assert.equal(garment.status, 'available');
  assert.equal(garment.schemaVersion, 2);
  assert.deepEqual(garment.seasons, []);
});

test('recommendation result rejects a garment outside the allowed set', () => {
  assert.throws(() => validateRecommendationResult({ outfits: [{ garmentIds: ['owned', 'invented'] }] }, new Set(['owned'])), /invented/);
});
```

- [ ] **Step 2: Run tests and confirm missing-module failures**

Run: `npm test -- tests/validation.test.js tests/store.test.js`  
Expected: FAIL for missing validation and store modules.

- [ ] **Step 3: Implement exact v2 contracts and idempotent migration**

Define garment fields `id`, `imgSrc`, `category`, `subtype`, `primaryColor`, `secondaryColors`, `pattern`, `material`, `thickness`, `seasons`, `warmth`, `formality`, `styles`, `functional`, `tagConfidence`, `tagSource`, `status`, `fav`, `worn`, `lastWornAt`, `addedAt`, and `schemaVersion`. Accept only `available|laundry|stored|disabled` status values. Namespace new keys under `dressup_v2_*`, preserve legacy keys, and set `dressup_v2_migrated=true` only after every write succeeds.

- [ ] **Step 4: Run migration and contract tests**

Run: `npm test -- tests/validation.test.js tests/store.test.js`  
Expected: PASS.

- [ ] **Step 5: Commit data contracts**

```bash
git add src/domain/validation.js public/js/store.js tests/validation.test.js tests/store.test.js
git commit -m "feat: add local data contracts and legacy migration"
```

### Task 3: Weather Service with Cache and Manual Fallback Contract

**Files:**
- Create: `src/services/weather.js`
- Create: `src/routes/weather.js`
- Modify: `src/app.js`
- Test: `tests/weather.test.js`

**Interfaces:**
- Consumes: `{ city, date }` and injected `fetchFn`.
- Produces: `createWeatherService({ fetchFn, baseUrl, geocodingBaseUrl, now })` with `getWeather({ city, date })`, plus `POST /api/weather` returning `{ source, city, date, current, daily, fetchedAt, expiresAt }`.

- [ ] **Step 1: Write failing normalization and cache tests**

```js
test('normalizes current and daily weather and reuses a fresh cache entry', async () => {
  const fetchFn = sequenceFetch(geocodeFixture, forecastFixture);
  const service = createWeatherService({ fetchFn, now: () => new Date('2026-08-17T02:00:00Z') });
  const first = await service.getWeather({ city: '上海', date: '2026-08-17' });
  const second = await service.getWeather({ city: '上海', date: '2026-08-17' });
  assert.equal(first.current.apparentTemperature, 34.2);
  assert.equal(second.source, 'cache');
  assert.equal(fetchFn.calls.length, 2);
});

test('returns WEATHER_UNAVAILABLE when remote data and cache are unavailable', async () => {
  const service = createWeatherService({ fetchFn: async () => { throw new Error('offline'); } });
  await assert.rejects(() => service.getWeather({ city: '上海', date: '2026-08-17' }), { code: 'WEATHER_UNAVAILABLE' });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm test -- tests/weather.test.js`  
Expected: FAIL because `createWeatherService` does not exist.

- [ ] **Step 3: Implement geocoding, forecast normalization, and a 30-minute in-memory cache**

Use an encoded city query, exact date bounds, timezone `auto`, and normalize weather codes into `clear|cloudy|rain|snow|storm|fog|unknown`. Throw errors with codes `CITY_NOT_FOUND`, `WEATHER_UNAVAILABLE`, or `INVALID_WEATHER_RESPONSE`. Route validation must reject missing city/date with HTTP 400 and external failures with HTTP 503.

- [ ] **Step 4: Run weather and app tests**

Run: `npm test -- tests/weather.test.js tests/app.test.js`  
Expected: PASS.

- [ ] **Step 5: Commit weather service**

```bash
git add src/services/weather.js src/routes/weather.js src/app.js tests/weather.test.js
git commit -m "feat: add cached weather lookup"
```

### Task 4: AI Provider and Editable Garment Analysis

**Files:**
- Create: `src/services/ai-client.js`
- Create: `src/services/garment-analyzer.js`
- Create: `src/routes/garments.js`
- Modify: `src/app.js`
- Test: `tests/garment-analyzer.test.js`

**Interfaces:**
- Consumes: `{ imageDataUrl, existingCategory }` and configured OpenAI-compatible base URL/key/model.
- Produces: `createAiClient(config, fetchFn)`, `analyzeGarment(input)`, and `POST /api/garments/analyze` returning `{ tags, confidence, needsReview }`.

- [ ] **Step 1: Write failing structured-output tests**

```js
test('normalizes model garment JSON and flags low confidence', async () => {
  const analyzer = createGarmentAnalyzer({ aiClient: fakeAiClient({ category: 'outer', subtype: '风衣', primaryColor: '米色', thickness: 'medium', confidence: 0.62 }) });
  const result = await analyzer.analyze({ imageDataUrl: 'data:image/jpeg;base64,AA==' });
  assert.equal(result.tags.category, 'outer');
  assert.equal(result.needsReview, true);
});

test('throws AI_NOT_CONFIGURED without sending the image', async () => {
  const analyzer = createGarmentAnalyzer({ aiClient: null });
  await assert.rejects(() => analyzer.analyze({ imageDataUrl: 'data:image/jpeg;base64,AA==' }), { code: 'AI_NOT_CONFIGURED' });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- tests/garment-analyzer.test.js`  
Expected: FAIL for missing analyzer module.

- [ ] **Step 3: Implement provider call, strict JSON parsing, and tag allowlists**

Send a system instruction that requests one JSON object and explicitly forbids person/body judgments. Cap request image data at 8 MB. Reject unknown enum values instead of persisting them. Set `needsReview` when overall confidence is below `0.75` or any required field is missing. Map missing configuration to HTTP 503 so the frontend can open the manual editor.

- [ ] **Step 4: Run garment and app tests**

Run: `npm test -- tests/garment-analyzer.test.js tests/app.test.js`  
Expected: PASS.

- [ ] **Step 5: Commit garment analysis**

```bash
git add src/services/ai-client.js src/services/garment-analyzer.js src/routes/garments.js src/app.js tests/garment-analyzer.test.js
git commit -m "feat: add editable AI garment analysis"
```

### Task 5: Deterministic Recommendation Engine

**Files:**
- Create: `src/domain/recommendation.js`
- Test: `tests/recommendation.test.js`

**Interfaces:**
- Consumes: `recommendOutfits({ garments, profile, weather, constraints, history, limit })`.
- Produces: `{ outfits, gaps }`; every outfit contains `id`, `garmentIds`, `score`, `variant`, `reasons`, `temperatureRange`, and `occasion`.

- [ ] **Step 1: Write failing hard-filter, diversity, and shortage tests**

```js
test('never recommends laundry, forbidden, or cold-weather-inappropriate garments', () => {
  const result = recommendOutfits(fixtureRequest({ apparentTemperature: 4, forbiddenIds: ['pants-jeans'] }));
  const ids = result.outfits.flatMap(outfit => outfit.garmentIds);
  assert.equal(ids.includes('shirt-laundry'), false);
  assert.equal(ids.includes('pants-jeans'), false);
  assert.equal(ids.includes('coat-warm'), true);
});

test('returns a wardrobe gap instead of inventing missing shoes', () => {
  const result = recommendOutfits(fixtureRequest({ garments: garmentsWithoutShoes }));
  assert.equal(result.outfits.length, 0);
  assert.deepEqual(result.gaps, [{ category: 'shoes', reason: '没有可穿的鞋' }]);
});

test('top results differ by at least one garment', () => {
  const result = recommendOutfits(fixtureRequest({ limit: 3 }));
  assert.equal(new Set(result.outfits.map(o => o.garmentIds.sort().join('|'))).size, result.outfits.length);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- tests/recommendation.test.js`  
Expected: FAIL for missing recommendation module.

- [ ] **Step 3: Implement hard constraints, bounded combinations, weighted scoring, and variant assignment**

Hard-filter non-`available` garments, user-forbidden categories/colors/IDs, season conflicts, insufficient warmth, and rain conflicts. Generate at most 500 combinations. Score weather 30, occasion 25, preference 20, color 15, and recency 10. Select diversified results and label them `safe`, `comfort`, and `style`; never use score to override a hard constraint.

- [ ] **Step 4: Run recommendation tests**

Run: `npm test -- tests/recommendation.test.js`  
Expected: PASS.

- [ ] **Step 5: Commit recommendation engine**

```bash
git add src/domain/recommendation.js tests/recommendation.test.js
git commit -m "feat: add deterministic outfit recommendation engine"
```

### Task 6: Agent Intent, Recommend, and Refine APIs

**Files:**
- Create: `src/services/intent-parser.js`
- Create: `src/services/outfit-agent.js`
- Create: `src/routes/agent.js`
- Modify: `src/app.js`
- Test: `tests/agent.test.js`

**Interfaces:**
- Consumes: `{ message, profile, garments, history, session }` for recommend and `{ message, profile, garments, history, session }` for refine.
- Produces: `POST /api/agent/recommend` and `POST /api/agent/refine` responses `{ session, weather, outfits, gaps, reply, needsClarification }`.

- [ ] **Step 1: Write failing orchestration and hallucination tests**

```js
test('recommend uses destination city from the message before the home city', async () => {
  const agent = createOutfitAgent(fakes);
  const result = await agent.recommend(requestFixture({ message: '明天去杭州见客户', profile: { city: '上海' } }));
  assert.equal(fakes.weather.lastCall.city, '杭州');
  assert.equal(result.session.constraints.formality, 'formal');
});

test('refine locks the coat and excludes the rejected trousers', async () => {
  const result = await agent.refine(refineFixture('保留这件外套，不要这条裤子'));
  assert.equal(result.session.constraints.lockedIds.includes('coat-1'), true);
  assert.equal(result.session.constraints.forbiddenIds.includes('pants-1'), true);
});

test('drops an explanation result containing a non-candidate garment id', async () => {
  const result = await agent.recommend(requestFixture({ aiExplanation: { garmentIds: ['invented'] } }));
  assert.equal(result.outfits.some(o => o.garmentIds.includes('invented')), false);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- tests/agent.test.js`  
Expected: FAIL for missing Agent modules.

- [ ] **Step 3: Implement heuristic-first intent parsing and optional AI explanation**

Parse Chinese date/city/occasion/indoor-outdoor/walking/formality/warmth/locked/excluded phrases deterministically. Use the chat model only to fill ambiguous structured fields or rewrite explanations. Ask one clarification only when city/date/weather or a dress-code constraint would materially change all candidates. Store session constraints as plain JSON and validate every result against candidate IDs before returning.

- [ ] **Step 4: Run Agent, recommendation, weather, and validation tests**

Run: `npm test -- tests/agent.test.js tests/recommendation.test.js tests/weather.test.js tests/validation.test.js`  
Expected: PASS.

- [ ] **Step 5: Commit Agent APIs**

```bash
git add src/services/intent-parser.js src/services/outfit-agent.js src/routes/agent.js src/app.js tests/agent.test.js
git commit -m "feat: add outfit Agent recommend and refine APIs"
```

### Task 7: Modular Frontend Shell, Onboarding, Profile, and Weather Header

**Files:**
- Modify: `public/index.html`
- Create: `public/styles/app.css`
- Create: `public/styles/agent.css`
- Create: `public/js/main.js`
- Create: `public/js/api.js`
- Create: `public/js/profile.js`
- Modify: `public/js/store.js`

**Interfaces:**
- Consumes: store profile functions and `api.weather({ city, date })`.
- Produces: five-tab shell; onboarding modal; editable Profile page; weather header states `loading|ready|cached|manual|error`.

- [ ] **Step 1: Extract current inline assets without changing behavior**

Move inline CSS into `public/styles/app.css`, current calendar code into `public/js/calendar.js`, wardrobe code into `public/js/wardrobe.js`, and Jimeng code into `public/js/try-on.js`. Replace the hard-coded proxy URL with same-origin `/api` calls. Load modules with `<script type="module" src="/js/main.js"></script>`.

- [ ] **Step 2: Run the server and verify the existing three functional pages still load**

Run: `npm start`  
Expected: `/` returns the existing app; wardrobe upload, calendar navigation, and the opt-in try-on entry render without console errors.

- [ ] **Step 3: Add failing profile-store tests**

```js
test('profile requires a city and temperature sensitivity', () => {
  assert.throws(() => store.saveProfile({ city: '', temperatureSensitivity: 'normal' }), /city/);
  assert.doesNotThrow(() => store.saveProfile({ city: '上海', temperatureSensitivity: 'normal', styles: [], likedColors: [], avoidedColors: [], forbidden: [], accessories: true }));
});
```

- [ ] **Step 4: Implement five-tab navigation and onboarding/profile views**

Make `推荐` the default tab, followed by `衣橱`, `换装`, `日历`, and `我的`. On first launch, block recommendation behind city and temperature-sensitivity setup. Save profile through `store.saveProfile`. Render weather timestamps and expose a manual-weather form only after `WEATHER_UNAVAILABLE`.

- [ ] **Step 5: Run tests and manually verify onboarding persistence**

Run: `npm test -- tests/store.test.js`  
Expected: PASS. Reloading `/` after saving a profile skips onboarding and restores the chosen city.

- [ ] **Step 6: Commit the modular shell**

```bash
git add public tests/store.test.js
git commit -m "feat: add Agent shell onboarding and profile"
```

### Task 8: Wardrobe AI Tags and Availability Editing

**Files:**
- Modify: `public/js/wardrobe.js`
- Modify: `public/index.html`
- Modify: `public/styles/app.css`
- Modify: `public/js/api.js`
- Modify: `public/js/store.js`

**Interfaces:**
- Consumes: `api.analyzeGarment(imageDataUrl, existingCategory)` and v2 garment schema.
- Produces: editable tag review sheet and status controls; saves only validated v2 garments.

- [ ] **Step 1: Add UI states before calling the API**

Define `idle`, `compressing`, `analyzing`, `review`, `manual`, and `saving` states. Disable duplicate submissions while analyzing. Compress garment images to a maximum edge of 1024 px and reject files above 15 MB before encoding.

- [ ] **Step 2: Implement analysis and manual fallback**

After image selection, call `/api/garments/analyze`. Populate every editable field from returned tags and highlight confidence below `0.75`. For HTTP 503 `AI_NOT_CONFIGURED` or any timeout, open the same editor with blank optional fields and the user's current category/color selections.

- [ ] **Step 3: Add availability controls to card and detail views**

Allow `可穿`, `清洗中`, `已收纳`, and `停用`. Visually dim non-available garments and remove them from Agent payloads without deleting them from local storage.

- [ ] **Step 4: Verify upload paths manually**

Run: `npm start`.  
Expected: successful AI tags are editable; low-confidence tags are marked; provider failure still allows manual save; a laundry item does not appear in recommendation request payloads.

- [ ] **Step 5: Commit wardrobe enhancements**

```bash
git add public/js/wardrobe.js public/js/api.js public/js/store.js public/index.html public/styles/app.css
git commit -m "feat: add editable garment tags and availability"
```

### Task 9: Agent Conversation and Visual Outfit Cards

**Files:**
- Create: `public/js/agent.js`
- Modify: `public/index.html`
- Modify: `public/styles/agent.css`
- Modify: `public/js/api.js`
- Modify: `public/js/store.js`

**Interfaces:**
- Consumes: recommend/refine API responses and garment lookup by ID.
- Produces: persistent conversation sessions, quick prompts, clarification state, two or three visual cards, gaps, and refinement controls.

- [ ] **Step 1: Implement request assembly that sends metadata, not wardrobe images**

Build payloads from profile, current message, recent outfit history, current session, and available garments with `imgSrc` removed. Keep the actual image only in local garment lookup for card rendering.

- [ ] **Step 2: Implement conversation and error states**

Render user messages, Agent replies, one-question clarification, loading, retry, offline, and insufficient-wardrobe states. Preserve unsent text and the last successful session when a request fails.

- [ ] **Step 3: Implement diversified visual cards**

Map every returned ID through the local garment lookup; if any ID is missing, reject the card and display a retry message. Label variants `最稳妥`, `更舒适`, and `更有风格`. Render buttons `穿这套`, `换一套`, `收藏`, `加入日历`, `AI 试穿`, and `不喜欢`.

- [ ] **Step 4: Implement natural-language refine shortcuts**

Make `换一套`, `正式一点`, `休闲一点`, `暖和一点`, and `凉快一点` call `/api/agent/refine`. Tapping a garment exposes `保留这件` and `不要这件`, adding the ID to the refine message and current session.

- [ ] **Step 5: Manually verify core conversations**

Run: `npm start`.  
Expected: “明天去杭州见客户” uses 杭州 weather; “保留外套，不要这条裤子” preserves/excludes the correct IDs; no card contains an unknown or unavailable garment.

- [ ] **Step 6: Commit Agent UI**

```bash
git add public/js/agent.js public/js/api.js public/js/store.js public/index.html public/styles/agent.css
git commit -m "feat: add conversational outfit recommendation UI"
```

### Task 10: Feedback, Calendar, and Opt-In Try-On Integration

**Files:**
- Modify: `public/js/agent.js`
- Modify: `public/js/calendar.js`
- Modify: `public/js/try-on.js`
- Modify: `public/js/store.js`
- Modify: `public/index.html`
- Modify: `public/styles/agent.css`

**Interfaces:**
- Consumes: selected outfit cards and local garment records.
- Produces: reversible feedback events, real/planned outfit history, wear-count updates, and a preselected try-on flow.

- [ ] **Step 1: Add feedback event storage and tests**

```js
test('recording worn updates garment recency and preserves a reversible event', () => {
  const event = store.recordFeedback({ type: 'worn', outfitId: 'o1', garmentIds: ['top1', 'pants1'] });
  assert.equal(store.getGarment('top1').worn, 1);
  assert.equal(store.getFeedback().at(-1).id, event.id);
  store.undoFeedback(event.id);
  assert.equal(store.getGarment('top1').worn, 0);
});
```

- [ ] **Step 2: Implement card actions and explicit negative reasons**

Support `liked`, `disliked`, `worn`, `tooCold`, `tooHot`, `tooFormal`, `tooCasual`, `color`, and `garment` feedback. Save source session/outfit IDs and make the latest event undoable from a toast.

- [ ] **Step 3: Integrate real and planned outfits with the calendar**

`穿这套` saves today's real outfit and increments wear metrics. `加入日历` saves a planned outfit without changing wear metrics. When opening a planned outfit on its date, compare its saved weather snapshot with current weather and show `天气变化，建议重新推荐` when apparent temperature differs by at least 6°C or precipitation changes from dry to wet.

- [ ] **Step 4: Preselect recommendation garments in the existing try-on flow**

`AI 试穿` navigates to 换装, selects supported recommended garments, and asks for a person image if absent. It must not call Jimeng until the user explicitly presses the existing 换装 confirmation button.

- [ ] **Step 5: Run store tests and manually verify integrations**

Run: `npm test -- tests/store.test.js`  
Expected: PASS. Manual checks confirm wear counts, undo, calendar plan warnings, and no automatic try-on generation.

- [ ] **Step 6: Commit integrations**

```bash
git add public/js/agent.js public/js/calendar.js public/js/try-on.js public/js/store.js public/index.html public/styles/agent.css tests/store.test.js
git commit -m "feat: connect recommendations to feedback calendar and try-on"
```

### Task 11: Security Regression, Full Verification, and Documentation

**Files:**
- Modify: `src/app.js`
- Modify: `src/middleware/rate-limit.js`
- Modify: `README.md`
- Modify: `.env.example`
- Create: `tests/security.test.js`

**Interfaces:**
- Consumes: all completed routes and frontend flows.
- Produces: verified MVP release candidate and operator documentation.

- [ ] **Step 1: Write security regression tests**

```js
test('rate limits repeated AI requests', async () => {
  const app = createTestApp({ limit: 2, windowMs: 60_000 });
  await request(app).post('/api/garments/analyze').send(validImage).expect(503);
  await request(app).post('/api/garments/analyze').send(validImage).expect(503);
  await request(app).post('/api/garments/analyze').send(validImage).expect(429);
});

test('rejects oversized JSON before any AI call', async () => {
  const app = createTestApp();
  await request(app).post('/api/garments/analyze').send({ imageDataUrl: 'x'.repeat(11 * 1024 * 1024) }).expect(413);
  assert.equal(fakeAiClient.calls.length, 0);
});
```

- [ ] **Step 2: Run the full automated suite**

Run: `npm test`  
Expected: all tests PASS with zero skipped tests and zero unhandled rejections.

- [ ] **Step 3: Scan tracked files for credential patterns**

Run: `rg -n --glob '!*.example' --glob '!.env' '(AK|SK|API_KEY).{0,20}[=:].{0,4}[A-Za-z0-9_/-]{8,}'`  
Expected: no output.

- [ ] **Step 4: Run syntax and startup checks**

Run: `node --check server.js`  
Run: `node --check src/app.js`  
Run: `npm start`  
Expected: server starts on the configured port, `/health` returns 200, and `/` serves the Agent UI.

- [ ] **Step 5: Complete the acceptance walkthrough**

Verify in order: onboarding city, automatic weather, AI tag success, manual tag fallback, available-only filtering, three differentiated cards, refine conversation, gap messaging, feedback undo, calendar save, weather-change warning, and explicit-only try-on. Record any failed item as a defect and fix it before release.

- [ ] **Step 6: Document setup and deployment**

README must include Node version, install/start/test commands, every environment variable, weather behavior, AI-provider contract, Jimeng setup, local-data limitations, secret-rotation warning, and the exact first-phase non-goals.

- [ ] **Step 7: Commit the verified release candidate**

```bash
git add src tests README.md .env.example
git commit -m "test: verify outfit Agent MVP"
```

## Final Release Gate

Run these commands from a clean checkout:

```bash
npm install
npm test
node --check server.js
node --check src/app.js
git status --short
```

Expected: installation succeeds, all tests pass, both syntax checks exit 0, and `git status --short` is empty. Then perform the acceptance walkthrough against the same commit before pushing or deploying.
