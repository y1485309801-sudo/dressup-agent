import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../public/js/store.js';

function fakeStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    snapshot() {
      return Object.fromEntries(values);
    }
  };
}

test('legacy garment migrates to an available v2 garment', () => {
  const storage = fakeStorage({
    dressup_clothes: JSON.stringify([
      { id: 'w1', category: 'top', colorName: '白色', imgSrc: 'data:x' }
    ])
  });

  const store = createStore(storage);
  const [garment] = store.getGarments();

  assert.equal(garment.status, 'available');
  assert.equal(garment.schemaVersion, 2);
  assert.equal(garment.primaryColor, '白色');
  assert.deepEqual(garment.seasons, []);
  assert.equal(storage.snapshot().dressup_clothes.includes('"w1"'), true);
  assert.equal(storage.snapshot().dressup_v2_migrated, 'true');
});

test('migration is idempotent once the v2 marker is written', () => {
  const storage = fakeStorage({
    dressup_clothes: JSON.stringify([{ id: 'w1', category: 'top', imgSrc: 'data:x' }])
  });
  const first = createStore(storage).getGarments();
  const second = createStore(storage).getGarments();

  assert.deepEqual(second, first);
});


test('profile requires a city and temperature sensitivity', () => {
  const store = createStore(fakeStorage());

  assert.throws(
    () => store.saveProfile({ city: '', temperatureSensitivity: 'normal' }),
    /city/
  );
  assert.doesNotThrow(() => store.saveProfile({
    city: '上海',
    temperatureSensitivity: 'normal',
    styles: [],
    likedColors: [],
    avoidedColors: [],
    forbidden: [],
    accessories: true
  }));
  assert.equal(store.getProfile().city, '上海');
});


test('recording worn updates garment recency and preserves a reversible event', () => {
  const store = createStore(fakeStorage());
  store.saveGarments([
    { id: 'top1', imgSrc: 'data:x', category: 'top', status: 'available', worn: 0 },
    { id: 'pants1', imgSrc: 'data:y', category: 'bottom', status: 'available', worn: 0 }
  ]);

  const event = store.recordFeedback({
    type: 'worn',
    outfitId: 'o1',
    garmentIds: ['top1', 'pants1']
  });

  assert.equal(store.getGarment('top1').worn, 1);
  assert.equal(store.getFeedback().at(-1).id, event.id);
  store.undoFeedback(event.id);
  assert.equal(store.getGarment('top1').worn, 0);
  assert.equal(store.getFeedback().at(-1).undoneAt != null, true);
});
