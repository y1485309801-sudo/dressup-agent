import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAgentPayload, escapeHtml, mapOutfitsToCards } from '../public/js/agent.js';
import { tagSourceForState } from '../public/js/wardrobe.js';

test('Agent payload sends metadata for available garments without local images', () => {
  const payload = buildAgentPayload({
    message: '今天上班',
    profile: { city: '上海' },
    garments: [
      { id: 'top-1', category: 'top', status: 'available', imgSrc: 'data:secret', primaryColor: '白色' },
      { id: 'top-2', category: 'top', status: 'laundry', imgSrc: 'data:secret2', primaryColor: '黑色' }
    ],
    history: [],
    session: null
  });

  assert.equal(payload.garments.length, 1);
  assert.equal(payload.garments[0].id, 'top-1');
  assert.equal('imgSrc' in payload.garments[0], false);
});

test('visual cards reject unknown and unavailable garment ids', () => {
  const garments = [
    { id: 'top-1', status: 'available', imgSrc: 'data:x' },
    { id: 'pants-1', status: 'laundry', imgSrc: 'data:y' }
  ];
  const cards = mapOutfitsToCards([
    { id: 'ok', garmentIds: ['top-1'] },
    { id: 'unknown', garmentIds: ['invented'] },
    { id: 'laundry', garmentIds: ['pants-1'] }
  ], garments);

  assert.deepEqual(cards.map(card => card.id), ['ok']);
});


test('editable garment labels are escaped before card HTML rendering', () => {
  assert.equal(escapeHtml('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
});

test('manual garment review is stored with a manual tag source', () => {
  assert.equal(tagSourceForState('manual'), 'manual');
  assert.equal(tagSourceForState('review'), 'ai');
});
