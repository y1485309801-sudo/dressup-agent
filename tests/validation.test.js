import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateGarment,
  validateProfile,
  validateRecommendationRequest,
  validateRecommendationResult
} from '../src/domain/validation.js';

test('recommendation result rejects a garment outside the allowed set', () => {
  assert.throws(
    () => validateRecommendationResult(
      { outfits: [{ garmentIds: ['owned', 'invented'] }] },
      new Set(['owned'])
    ),
    /invented/
  );
});

test('garment status must be a supported wardrobe state', () => {
  assert.throws(
    () => validateGarment({ id: 'g1', imgSrc: 'data:image/jpeg;base64,x', category: 'top', status: 'missing' }),
    /status/
  );
});

test('profile and recommendation request normalize required user input', () => {
  assert.deepEqual(
    validateProfile({ city: ' 上海 ', temperatureSensitivity: 'cold' }),
    { city: '上海', temperatureSensitivity: 'cold' }
  );
  assert.equal(
    validateRecommendationRequest({ message: '今天见客户', city: ' 上海 ', garments: [] }).city,
    '上海'
  );
});
