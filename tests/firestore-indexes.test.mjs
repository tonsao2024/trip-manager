import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const config = JSON.parse(readFileSync(new URL('../firestore.indexes.json', import.meta.url), 'utf8'));

test('Firestore composite index fields use supported Firebase CLI modes', () => {
  for (const index of config.indexes) {
    assert.ok(['COLLECTION', 'COLLECTION_GROUP'].includes(index.queryScope),
      `${index.collectionGroup}: invalid queryScope ${index.queryScope}`);
    assert.ok(Array.isArray(index.fields) && index.fields.length >= 2,
      `${index.collectionGroup}: composite indexes must have at least 2 fields (single-field COLLECTION indexes are automatic and rejected by Firestore deploy)`);
    for (const field of index.fields) {
      const label = `${index.collectionGroup}.${field.fieldPath}`;
      assert.notEqual(field.fieldPath, '__name__',
        `${label}: do not declare __name__ explicitly (firebase-tools strips __name__ when comparing live indexes)`);
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

test('Firestore fieldOverrides use queryScope (not scope) and keep COLLECTION scopes', () => {
  for (const override of config.fieldOverrides || []) {
    const label = `${override.collectionGroup}.${override.fieldPath}`;
    assert.ok(Array.isArray(override.indexes) && override.indexes.length > 0, `${label} must declare indexes`);
    for (const entry of override.indexes) {
      assert.equal('scope' in entry, false, `${label}: use "queryScope" instead of "scope"`);
      assert.ok(['COLLECTION', 'COLLECTION_GROUP'].includes(entry.queryScope),
        `${label}: invalid queryScope ${entry.queryScope}`);
      const modes = ['order', 'arrayConfig'].filter(key => key in entry);
      assert.equal(modes.length, 1, `${label} fieldOverride entry must have order or arrayConfig`);
    }
  }
  for (const fieldPath of ['uid', 'authUid']) {
    const override = (config.fieldOverrides || []).find(o => o.collectionGroup === 'members' && o.fieldPath === fieldPath);
    assert.ok(override, `members.${fieldPath} collection-group override must exist`);
    assert.ok(override.indexes.some(i => i.queryScope === 'COLLECTION_GROUP' && i.order === 'ASCENDING'),
      `members.${fieldPath} must enable COLLECTION_GROUP ASCENDING`);
    assert.ok(override.indexes.some(i => i.queryScope === 'COLLECTION' && i.order === 'ASCENDING'),
      `members.${fieldPath} must keep COLLECTION ASCENDING`);
  }
});

test('memberUids composite index is an array-contains index', () => {
  const index = config.indexes.find(index => index.collectionGroup === 'trips'
    && index.fields.some(field => field.fieldPath === 'memberUids')
    && index.fields.some(field => field.fieldPath === 'createdAt'));
  assert.ok(index, 'trip membership and createdAt index must exist');
  assert.equal(index.fields.find(field => field.fieldPath === 'memberUids').arrayConfig, 'CONTAINS');
});
