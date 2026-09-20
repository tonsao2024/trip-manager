// Trip-defined expense groups: the registry must feed labels/icons/colours and
// survive the fuzzy normalisation used by imports.
import {
  setCustomCategories, getCustomCategories, getAllExpenseCategories, getCategoryDef,
  isCustomCategory, normalizeCategory, categoryLabel, categoryIcon, categoryColor,
  EXPENSE_CATEGORIES
} from '../../src/js/utils/categories.js';

function assert(cond, msg) { if (!cond) throw new Error(msg); }
const eq = (a, b, msg) => assert(a === b, `${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`);

export function testCustomCategories() {
  console.log('Testing expense group registry...');

  try {
    eq(getCustomCategories().length, 0, 'registry starts empty');
    eq(getAllExpenseCategories().length, EXPENSE_CATEGORIES.length, 'built-ins only at first');
    eq(categoryLabel('food', 'th'), 'อาหาร', 'built-in label still works');

    setCustomCategories([
      { id: 'custom-massage-1', th: 'นวด/สปา', en: 'Massage / Spa', icon: 'heart-pulse', color: '#e0a17a' },
      { id: 'custom-sim-2', th: 'ซิม/WiFi', en: 'SIM / WiFi', icon: 'phone', color: '#6ea8fe' }
    ]);

    eq(getAllExpenseCategories().length, EXPENSE_CATEGORIES.length + 2, 'custom groups appended');
    eq(categoryLabel('custom-massage-1', 'th'), 'นวด/สปา', 'custom Thai label');
    eq(categoryLabel('custom-massage-1', 'en'), 'Massage / Spa', 'custom English label');
    eq(categoryIcon('custom-massage-1'), 'heart-pulse', 'custom icon');
    eq(categoryColor('custom-sim-2'), '#6ea8fe', 'custom colour');
    assert(isCustomCategory('custom-massage-1'), 'recognised as a trip group');
    assert(!isCustomCategory('food'), 'built-in is not a trip group');
    assert(getCategoryDef('custom-sim-2') !== null, 'definition lookup');
    eq(getCategoryDef('nope'), null, 'unknown id → null');

    // typing the label (in either language) must resolve to the group
    eq(normalizeCategory('นวด/สปา'), 'custom-massage-1', 'Thai label resolves');
    eq(normalizeCategory('massage / spa'), 'custom-massage-1', 'English label resolves');
    eq(normalizeCategory('custom-sim-2'), 'custom-sim-2', 'id passes straight through');
    // built-ins keep working, unknown text still falls back
    eq(normalizeCategory('Shinkansen'), 'transport', 'built-in synonyms unaffected');
    eq(normalizeCategory('Entrance fee'), 'ticket', 'fuzzy built-in match unaffected');
    eq(normalizeCategory('something unknown'), 'general', 'fallback stays general');

    // junk entries are ignored instead of breaking every list
    setCustomCategories([null, {}, { id: 'x' }, { id: 'ok', th: 'โอเค' }, { id: 'y', en: 'Y' }]);
    eq(getAllExpenseCategories().length, EXPENSE_CATEGORIES.length + 2, 'malformed entries dropped');
    eq(categoryLabel('ok', 'th'), 'โอเค', 'Thai-only group works');
    eq(categoryLabel('y', 'th'), 'Y', 'English-only group falls back for Thai');

    eq(setCustomCategories(null).length, 0, 'null resets the registry');
    eq(getAllExpenseCategories().length, EXPENSE_CATEGORIES.length, 'registry back to built-ins');
    console.log('All expense group tests passed');
  } finally {
    setCustomCategories([]);   // never leak state into other suites
  }
}
