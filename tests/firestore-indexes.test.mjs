import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const config = JSON.parse(readFileSync(new URL('../firestore.indexes.json', import.meta.url), 'utf8'));

test('Firestore composite index fields use supported Firebase CLI modes', () => {
  for (const index of config.indexes) {
    for (const field of index.fields) {
      const label = `${index.collectionGroup}.${field.fieldPath}`;
      const modes = ['order', 'arrayConfig', 'vectorConfig'].filter(key => key in field);
      assert.equal(modes.length, 1, `${label} must have exactly one index mode`);
      if ('order' in field) {
        assert.ok(['ASCENDING', 'DESCENDING'].includes(field.order), `${label}: invalid order ${field.order}`);
      }
      if ('arrayConfig' in field) {
        assert.equal(field.arrayConfig, 'CONTAINS', `${label}: invalid arrayConfig`);
      }
    }
  }
});

test('memberUids composite index is an array-contains index', () => {
  const index = config.indexes.find(index => index.collectionGroup === 'trips'
    && index.fields.some(field => field.fieldPath === 'memberUids')
    && index.fields.some(field => field.fieldPath === 'createdAt'));
  assert.ok(index, 'trip membership and createdAt index must exist');
  assert.equal(index.fields.find(field => field.fieldPath === 'memberUids').arrayConfig, 'CONTAINS');
});
