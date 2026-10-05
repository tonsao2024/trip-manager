// Unit tests — prep checklists (templates, progress, merging). No Firestore.
import {
  CHECKLIST_TEMPLATES, itemsFromTemplate, checklistProgress, checklistsProgress,
  sortChecklistItems, mergeTemplateItems, assigneeSummary
} from '../../src/js/utils/checklists.js';

function assert(cond, msg) { if (!cond) throw new Error(msg); }

export function testChecklistTemplates() {
  assert(CHECKLIST_TEMPLATES.length >= 6, 'should ship several ready templates');
  const ids = CHECKLIST_TEMPLATES.map(t => t.id);
  assert(new Set(ids).size === ids.length, 'template ids must be unique');
  for (const tpl of CHECKLIST_TEMPLATES) {
    assert(typeof tpl.th === 'string' && tpl.th.length > 0, `template ${tpl.id} needs a Thai name`);
    assert(typeof tpl.en === 'string' && tpl.en.length > 0, `template ${tpl.id} needs an English name`);
    assert(['packing', 'todo'].includes(tpl.kind), `template ${tpl.id} kind must be packing|todo`);
    assert(Array.isArray(tpl.items) && tpl.items.length >= 5, `template ${tpl.id} needs items`);
  }
}

export function testItemsFromTemplate() {
  const items = itemsFromTemplate(['  ครีมกันแดด ', '', 'หมวก']);
  assert(items.length === 2, 'blank entries must be skipped');
  assert(items[0].text === 'ครีมกันแดด', 'text should be trimmed');
  assert(items.every(i => i.done === false && i.assignee === null), 'new items start unchecked');
  const again = itemsFromTemplate(['ซ้ำ']);
  assert(items[0].id !== again[0].id, 'ids must differ per item');
}

export function testChecklistProgress() {
  const p = checklistProgress({ items: [{ done: true }, { done: false }, { done: true }, {}] });
  assert(p.total === 4 && p.done === 2 && p.remaining === 2, 'counts done/total/remaining');
  assert(p.percent === 50, 'percent should round to 50');
  assert(checklistProgress({}).percent === 0, 'empty list = 0%');
  const all = checklistsProgress([{ items: [{ done: true }] }, { items: [{ done: false }, { done: false }] }]);
  assert(all.total === 3 && all.done === 1 && all.lists === 2, 'overall progress across lists');
}

export function testSortChecklistItems() {
  const items = [{ id: 'a', done: true }, { id: 'b', done: false }, { id: 'c', done: false }, { id: 'd', done: true }];
  const sorted = sortChecklistItems(items);
  assert(sorted.map(i => i.id).join('') === 'bcad', 'unchecked first, original order kept, input untouched');
  assert(items[0].id === 'a', 'input must not be mutated');
}

export function testMergeTemplateItems() {
  const existing = [{ id: '1', text: 'ครีมกันแดด', done: false }];
  const merged = mergeTemplateItems(existing, ['ครีมกันแดด', 'CREAM กันแดด', 'หมวก']);
  // case-insensitive skip of the same text, one new entry added
  assert(merged.length === 3, `expected 3 items, got ${merged.length}`);
  assert(merged[0] === existing[0], 'existing item object kept');
  assert(merged[2].text === 'หมวก' && merged[2].done === false, 'new template item appended unchecked');
}

export function testAssigneeSummary() {
  const list = { items: [{ assignee: 'u1', done: true }, { assignee: 'u1' }, { assignee: 'u2' }, { assignee: null }] };
  const members = [{ id: 'u1', displayName: 'มิ้น' }, { id: 'u2', displayName: 'โจ' }, { id: 'u3', displayName: 'นัท' }];
  const summary = assigneeSummary(list, members);
  assert(summary.length === 2, 'only members with assigned items are listed');
  assert(summary[0].total === 2 && summary[0].done === 1, 'per-member counters');
  assert(summary[1].id === 'u2' && summary[1].total === 1, 'second member counted');
}

export function testPrep() {
  testChecklistTemplates();
  testItemsFromTemplate();
  testChecklistProgress();
  testSortChecklistItems();
  testMergeTemplateItems();
  testAssigneeSummary();
  console.log('All prep checklist tests passed');
}
