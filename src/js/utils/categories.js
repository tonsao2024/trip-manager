// Shared category definitions for expenses + itinerary (single source of truth)

export const EXPENSE_CATEGORIES = [
  { id: 'food', th: 'อาหาร', en: 'Food', icon: 'utensils-crossed', color: '#ef8f4e' },
  { id: 'transport', th: 'เดินทาง', en: 'Transport', icon: 'train-front', color: '#2f6fe4' },
  { id: 'stay', th: 'ที่พัก/โรงแรม', en: 'Stay / Hotel', icon: 'bed-double', color: '#8a7ce8' },
  { id: 'ticket', th: 'ค่าเข้า/ตั๋ว', en: 'Ticket / Entrance', icon: 'ticket', color: '#639cb5' },
  { id: 'activity', th: 'กิจกรรม', en: 'Activity', icon: 'ferris-wheel', color: '#f0ae52' },
  { id: 'shopping', th: 'ช้อปปิ้ง/ของฝาก', en: 'Shopping', icon: 'shopping-bag', color: '#e25f7d' },
  { id: 'insurance', th: 'ประกัน/วีซ่า', en: 'Insurance / Visa', icon: 'shield-check', color: '#3f9d94' },
  { id: 'fee', th: 'ค่าธรรมเนียม', en: 'Fees', icon: 'receipt', color: '#7d8b9c' },
  { id: 'general', th: 'อื่นๆ', en: 'Others', icon: 'package', color: '#93a3b4' }
];

export const ITINERARY_CATEGORIES = [
  { id: 'sightseeing', th: 'ท่องเที่ยว', en: 'Sightseeing', icon: 'camera' },
  { id: 'food', th: 'อาหาร', en: 'Food', icon: 'utensils-crossed' },
  { id: 'transport', th: 'เดินทาง', en: 'Transport', icon: 'train-front' },
  { id: 'stay', th: 'ที่พัก', en: 'Stay', icon: 'bed-double' },
  { id: 'activity', th: 'กิจกรรม', en: 'Activity', icon: 'ferris-wheel' },
  { id: 'shopping', th: 'ช้อปปิ้ง', en: 'Shopping', icon: 'shopping-bag' },
  { id: 'general', th: 'ทั่วไป', en: 'General', icon: 'map-pin' }
];

// Aliases kept for the Excel layer (it refers to them as "DEFS")
export const EXPENSE_CATEGORY_DEFS = EXPENSE_CATEGORIES;
export const ITINERARY_CATEGORY_DEFS = ITINERARY_CATEGORIES;

export const CATEGORY_ICONS = Object.fromEntries(EXPENSE_CATEGORIES.map(c => [c.id, c.icon]));
export const CATEGORY_COLORS = Object.fromEntries(EXPENSE_CATEGORIES.map(c => [c.id, c.color]));

/* ------------------------------------------------------------------
   Trip-defined groups (Settings / expense form → "จัดการกลุ่มค่าใช้จ่าย")
   The registry is hydrated by src/js/categories/index.js from Firestore.
   ------------------------------------------------------------------ */
let CUSTOM_CATEGORIES = [];

/** Replace the trip's custom groups. Definitions: { id, th, en, icon, color, order } */
export function setCustomCategories(list) {
  CUSTOM_CATEGORIES = Array.isArray(list)
    ? list.filter(c => c && c.id && (c.th || c.en))
    : [];
  return CUSTOM_CATEGORIES;
}

export function getCustomCategories() { return CUSTOM_CATEGORIES.slice(); }

export function isCustomCategory(id) { return CUSTOM_CATEGORIES.some(c => c.id === id); }

/** Built-ins first, then the trip's own groups. */
export function getAllExpenseCategories() {
  return [...EXPENSE_CATEGORIES, ...CUSTOM_CATEGORIES];
}

export function getCategoryDef(id) {
  return EXPENSE_CATEGORIES.find(c => c.id === id) || CUSTOM_CATEGORIES.find(c => c.id === id) || null;
}

function normalizeKey(str) {
  return String(str ?? '').replace(/\u00a0/g, ' ').replace(/[\s_\-\/\.\(\)\[\]:]+/g, ' ').trim().toLowerCase();
}

const SYNONYMS = (() => {
  const map = new Map();
  EXPENSE_CATEGORIES.forEach(def => [def.id, def.th, def.en].forEach(k => map.set(normalizeKey(k), def.id)));
  const extra = {
    hotel: 'stay', ที่พัก: 'stay', โรงแรม: 'stay', resort: 'stay', ryokan: 'stay', hostel: 'stay', airbnb: 'stay',
    meal: 'food', drink: 'food', ร้านอาหาร: 'food', มื้ออาหาร: 'food', cafe: 'food', 'อาหารกลางวัน': 'food',
    coffee: 'food', ราเมง: 'food', ราเมน: 'food', ของหวาน: 'food', bar: 'food', izakaya: 'food',
    train: 'transport', bus: 'transport', flight: 'transport', taxi: 'transport', car: 'transport', jr: 'transport',
    shinkansen: 'transport', 'ค่าเดินทาง': 'transport', 'ตั๋วรถ': 'transport', fuel: 'transport', parking: 'transport',
    entrance: 'ticket', ค่าเข้า: 'ticket', museum: 'ticket', temple: 'ticket', shrine: 'ticket', 'ตั๋ว': 'ticket',
    tour: 'activity', กิจกรรม: 'activity', experience: 'activity', onsen: 'activity',
    souvenir: 'shopping', ของฝาก: 'shopping', ช้อปปิ้ง: 'shopping', gift: 'shopping',
    ประกัน: 'insurance', visa: 'insurance', วีซ่า: 'insurance', sim: 'insurance', wifi: 'insurance',
    ค่าธรรมเนียม: 'fee', 'service charge': 'fee', tip: 'fee', ทิป: 'fee', fee: 'fee',
    other: 'general', others: 'general', อื่นๆ: 'general', เบ็ดเตล็ด: 'general', misc: 'general'
  };
  Object.entries(extra).forEach(([k, v]) => map.set(normalizeKey(k), v));
  return map;
})();

// Fuzzy keywords ("Entrance fee", "Hotel booking (3 nights)") — longest hit wins.
const FUZZY_KEYWORDS = (() => {
  const list = [];
  SYNONYMS.forEach((catId, key) => {
    const isThai = /[\u0E00-\u0E7F]/.test(key);
    const minLen = isThai ? 3 : 4;
    if (key.length >= minLen) list.push({ key, catId });
  });
  list.sort((a, b) => b.key.length - a.key.length); // longest / most specific first
  return list;
})();

export function normalizeCategory(value) {
  if (!value) return 'general';
  // A custom group id (or its exact label) always wins over fuzzy matching.
  if (getCategoryDef(value)) return value;
  const customHit = CUSTOM_CATEGORIES.find(c =>
    normalizeKey(c.th) === normalizeKey(value) || normalizeKey(c.en) === normalizeKey(value));
  if (customHit) return customHit.id;
  const key = normalizeKey(value);
  if (!key) return 'general';
  const exact = SYNONYMS.get(key);
  if (exact) return exact;
  const hit = FUZZY_KEYWORDS.find(entry => key.includes(entry.key));
  return hit ? hit.catId : 'general';
}

export function categoryLabel(id, lang = 'th') {
  const def = getCategoryDef(id);
  if (!def) return id || 'general';
  return lang === 'th' ? (def.th || def.en) : (def.en || def.th);
}

export function categoryIcon(id) {
  return getCategoryDef(id)?.icon || CATEGORY_ICONS[id] || 'package';
}

export function categoryColor(id) {
  return getCategoryDef(id)?.color || CATEGORY_COLORS[id] || 'var(--primary)';
}

/* ------------------------------------------------------------------\n   v18: ONE category list for places and money.
   Before this, the plan had its own seven categories (ITINERARY_CATEGORIES) and
   the expense book had another list (EXPENSE_CATEGORIES + the trip's own groups),
   so the same lunch was “อาหาร” twice and a temple was “ท่องเที่ยว” for the map but
   “ค่าเข้า/ตั๋ว” for the money. The merged list below is what the pickers show:
   a place category carries the expense group it should bill into, and an expense
   group can always be read back as a place category.
   ------------------------------------------------------------------ */

/** Place category → expense group it should book its estimate under. */
export const PLACE_TO_EXPENSE = {
  sightseeing: 'ticket',
  food: 'food',
  transport: 'transport',
  stay: 'stay',
  activity: 'activity',
  shopping: 'shopping',
  general: 'general'
};

/** Expense group → place category (only the ones that do NOT exist as places). */
export const EXPENSE_TO_PLACE = {
  ticket: 'sightseeing',
  insurance: 'activity',
  fee: 'general'
};

export function expenseGroupForPlace(id) {
  const hit = PLACE_TO_EXPENSE[id];
  return hit && getCategoryDef(hit) ? hit : 'general';
}

export function placeCategoryForExpense(id) {
  const hit = EXPENSE_TO_PLACE[id];
  return hit || (ITINERARY_CATEGORIES.some(c => c.id === id) ? id : 'general');
}

/**
 * The merged picker list: every place category (with its expense group attached)
 * first, then the trip's own groups that have no place equivalent — so a custom
 * group such as “คาเฟ่” is selectable for a place too.
 * @returns {{id:string,th:string,en:string,icon:string,expenseId:string,isPlace:boolean}[]}
 */
export function categoryChoices(lang = 'th') {
  const out = ITINERARY_CATEGORIES.map(c => ({
    ...c,
    expenseId: expenseGroupForPlace(c.id),
    isPlace: true
  }));
  const seen = new Set(out.map(c => c.id));
  getAllExpenseCategories().forEach(c => {
    const asPlace = placeCategoryForExpense(c.id);
    // Built-in expense groups already represented by a place category are skipped.
    if (seen.has(c.id) || (EXPENSE_CATEGORIES.some(e => e.id === c.id) && asPlace)) return;
    seen.add(c.id);
    out.push({ id: c.id, th: c.th || c.en, en: c.en || c.th, icon: c.icon || 'tag', expenseId: c.id, isPlace: false });
  });
  return out;
}

/**
 * Expense group a merged choice bills into. A place category maps through
 * PLACE_TO_EXPENSE; a trip-defined group is its own expense group.
 */
export function expenseGroupForChoice(id) {
  const place = ITINERARY_CATEGORIES.find(c => c.id === id);
  return place ? expenseGroupForPlace(id) : (getCategoryDef(id) ? id : 'general');
}

/** Label of a merged choice, in the right language. */
export function categoryChoiceLabel(choice, lang = 'th') {
  if (!choice) return '';
  return lang === 'th' ? (choice.th || choice.en) : (choice.en || choice.th);
}

export function itineraryCategoryLabel(id, lang = 'th') {
  const def = ITINERARY_CATEGORIES.find(c => c.id === id);
  if (!def) return id || 'general';
  return lang === 'th' ? def.th : def.en;
}

export const ITINERARY_STATUSES = [
  { id: 'planned', th: 'วางแผน', en: 'Planned' },
  { id: 'current', th: 'กำลังทำ', en: 'In progress' },
  { id: 'completed', th: 'เสร็จแล้ว', en: 'Completed' },
  { id: 'skipped', th: 'ข้าม', en: 'Skipped' },
  { id: 'cancelled', th: 'ยกเลิก', en: 'Cancelled' }
];
