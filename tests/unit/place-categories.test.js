import {
  ideaCategoryId, placeCategoryLabel, placeCategoryColor, placeCategoryIcon, categoryLabel,
  setCustomCategories, PLACE_CATEGORY_COLORS
} from '../../src/js/utils/categories.js';
import { groupIdeasByCategory } from '../../src/js/utils/ideas.js';

function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${label}: expected ${b}, got ${a}`);
}

export function testIdeaCategoryKeepsPlaceIds() {
  eq(ideaCategoryId('sightseeing'), 'sightseeing', 'place id is kept (was folded into general)');
  eq(ideaCategoryId('ticket'), 'sightseeing', 'expense id maps to its place equivalent');
  eq(ideaCategoryId('fee'), 'general', 'fee maps to general');
  eq(ideaCategoryId('ท่องเที่ยว'), 'sightseeing', 'legacy Thai label is read');
  eq(ideaCategoryId(''), 'general', 'empty value → general');
  eq(ideaCategoryId('no-such-thing'), 'general', 'unknown value → general');
}

export function testPlaceLabelsColorsAndIcons() {
  eq(placeCategoryLabel('sightseeing', 'th'), 'ท่องเที่ยว', 'Thai label');
  eq(placeCategoryLabel('sightseeing', 'en'), 'Sightseeing', 'English label');
  eq(categoryLabel('sightseeing', 'en'), 'Sightseeing', 'categoryLabel resolves place-only ids');
  eq(placeCategoryIcon('sightseeing'), 'camera', 'icon comes from the place list');
  const ids = Object.keys(PLACE_CATEGORY_COLORS);
  eq(ids.length, 7, 'seven place categories');
  eq(new Set(ids.map(id => placeCategoryColor(id))).size, ids.length, 'every place category has its own pin color');
  eq(placeCategoryColor('unknown-id'), PLACE_CATEGORY_COLORS.general, 'unknown ids use the general color');
}

export function testGroupIdeasByCategory() {
  const ideas = [
    { id: 'a', category: 'food' },
    { id: 'b', category: 'sightseeing' },
    { id: 'c', category: 'food' },
    { id: 'd', category: 'ticket' },
    { id: 'e' }
  ];
  const groups = groupIdeasByCategory(ideas);
  eq(groups.map(g => g.id), ['sightseeing', 'food', 'general'], 'place order; empty groups dropped');
  eq(groups[0].ideas.map(i => i.id), ['b', 'd'], 'sightseeing keeps the list order');
  eq(groups[1].ideas.map(i => i.id), ['a', 'c'], 'food keeps the list order');
  eq(groupIdeasByCategory([]), [], 'no ideas → no groups');
}

export function testTripGroupsComeAfterPlaceCategories() {
  setCustomCategories([{ id: 'cafe', th: 'คาเฟ่', en: 'Cafe', icon: 'coffee', color: '#123456' }]);
  try {
    const groups = groupIdeasByCategory([{ id: 'x', category: 'cafe' }, { id: 'y', category: 'food' }]);
    eq(groups.map(g => g.id), ['food', 'cafe'], 'custom group follows the place categories');
    eq(placeCategoryLabel('cafe', 'th'), 'คาเฟ่', 'custom group label');
    eq(placeCategoryColor('cafe'), '#123456', 'custom group keeps its own color');
  } finally {
    setCustomCategories([]);
  }
}
