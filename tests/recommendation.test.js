import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendOutfits } from '../src/domain/recommendation.js';

const garments = [
  { id: 'top-white', category: 'top', primaryColor: '白色', status: 'available', warmth: 1, formality: 'smart-casual', styles: ['minimal'], seasons: [] },
  { id: 'top-knit', category: 'top', primaryColor: '米色', status: 'available', warmth: 3, formality: 'casual', styles: ['comfort'], seasons: ['autumn', 'winter'] },
  { id: 'shirt-laundry', category: 'top', primaryColor: '蓝色', status: 'laundry', warmth: 1, formality: 'business', styles: [], seasons: [] },
  { id: 'pants-jeans', category: 'bottom', primaryColor: '蓝色', status: 'available', warmth: 2, formality: 'casual', styles: ['street'], seasons: [] },
  { id: 'pants-black', category: 'bottom', primaryColor: '黑色', status: 'available', warmth: 3, formality: 'business', styles: ['minimal'], seasons: [] },
  { id: 'coat-warm', category: 'outer', primaryColor: '驼色', status: 'available', warmth: 5, formality: 'smart-casual', styles: ['classic'], functional: ['windproof'], seasons: ['autumn', 'winter'] },
  { id: 'coat-rain', category: 'outer', primaryColor: '黑色', status: 'available', warmth: 4, formality: 'business', styles: ['minimal'], functional: ['waterproof'], seasons: [] },
  { id: 'shoes-loafer', category: 'shoes', primaryColor: '黑色', status: 'available', warmth: 2, formality: 'business', styles: ['classic'], functional: [], seasons: [] },
  { id: 'shoes-boots', category: 'shoes', primaryColor: '棕色', status: 'available', warmth: 4, formality: 'smart-casual', styles: ['classic'], functional: ['waterproof'], seasons: ['autumn', 'winter'] }
];

function fixtureRequest(overrides = {}) {
  const apparentTemperature = overrides.apparentTemperature ?? 18;
  return {
    garments: overrides.garments || garments,
    profile: {
      preferredStyles: ['minimal', 'classic'],
      avoidedColors: [],
      temperatureSensitivity: 'neutral'
    },
    weather: {
      current: {
        apparentTemperature,
        precipitation: overrides.precipitation ?? 0
      },
      daily: {
        precipitationProbability: overrides.precipitationProbability ?? 10
      }
    },
    constraints: {
      occasion: 'client',
      formality: 'business',
      forbiddenIds: overrides.forbiddenIds || [],
      forbiddenCategories: [],
      forbiddenColors: []
    },
    history: [],
    limit: overrides.limit || 3
  };
}

test('never recommends laundry, forbidden, or cold-weather-inappropriate garments', () => {
  const result = recommendOutfits(
    fixtureRequest({ apparentTemperature: 4, forbiddenIds: ['pants-jeans'] })
  );
  const ids = result.outfits.flatMap(outfit => outfit.garmentIds);

  assert.equal(ids.includes('shirt-laundry'), false);
  assert.equal(ids.includes('pants-jeans'), false);
  assert.equal(ids.includes('coat-warm'), true);
  assert.equal(result.outfits.every(outfit => outfit.garmentIds.some(id => id.startsWith('coat-'))), true);
});

test('returns a wardrobe gap instead of inventing missing shoes', () => {
  const garmentsWithoutShoes = garments.filter(garment => garment.category !== 'shoes');
  const result = recommendOutfits(fixtureRequest({ garments: garmentsWithoutShoes }));

  assert.equal(result.outfits.length, 0);
  assert.deepEqual(result.gaps, [{ category: 'shoes', reason: '没有可穿的鞋' }]);
});

test('top results differ by at least one garment', () => {
  const result = recommendOutfits(fixtureRequest({ limit: 3 }));
  const signatures = result.outfits.map(outfit => [...outfit.garmentIds].sort().join('|'));

  assert.equal(new Set(signatures).size, result.outfits.length);
  assert.equal(result.outfits.length, 3);
});

test('rainy recommendations only use weather-compatible outerwear and shoes', () => {
  const result = recommendOutfits(
    fixtureRequest({ apparentTemperature: 8, precipitationProbability: 80 })
  );

  assert.equal(result.outfits.length > 0, true);
  for (const outfit of result.outfits) {
    assert.equal(outfit.garmentIds.includes('coat-rain'), true);
    assert.equal(outfit.garmentIds.includes('shoes-boots'), true);
  }
});
