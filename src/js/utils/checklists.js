// Checklist helpers — packing / to-do templates and the pure logic behind the
// “เตรียมตัว” page (progress, sorting, template merging). No Firestore here so
// tests can run in plain Node; the CRUD lives in src/js/prep/index.js.

/* ------------------------------------------------------------------ *
 * Templates — one tap to build a list for the kind of trip you're on.
 * ------------------------------------------------------------------ */
export const CHECKLIST_TEMPLATES = [
  {
    id: 'packing-tropical', kind: 'packing', icon: 'luggage', color: '#1d4ed8',
    th: 'ของใช้เขตร้อน / ทะเล', en: 'Tropical / beach',
    items: [
      'ครีมกันแดด SPF50+', 'แว่นกันแดด', 'หมวกปีกกว้าง', 'ชุดว่ายน้ำ 2 ชุด',
      'ผ้าเช็ดตัวไมโครไฟเบอร์', 'รองเท้าแตะ', 'เสื้อยืดบาง 4 ตัว', 'กางเกงขาสั้น 2 ตัว',
      'ยาทากันยุง', 'ถุงกันน้ำสำหรับมือถือ', 'เจลล้างมือ', 'เสื้อกันแดด'
    ]
  },
  {
    id: 'packing-cold', kind: 'packing', icon: 'snowflake', color: '#2563eb',
    th: 'อากาศหนาว / ญี่ปุ่นหน้าหนาว', en: 'Cold weather',
    items: [
      'เสื้อโค้ทกันหนาว', 'เสื้อกันลม', 'ฮีทเทค 2 ชุด', 'ถุงมือ + หมวกไหมพรม',
      'ถุงเท้าหนา 2 คู่', 'ครีมบำรุงผิว / ลิปบาล์ม', 'รองเท้าบูทกันน้ำ', 'ผ้าพันคอ',
      'กระเป๋าเป้ใบเล็ก', 'ซองกันความร้อน (heat pack)'
    ]
  },
  {
    id: 'packing-city', kind: 'packing', icon: 'building-2', color: '#0ea5e9',
    th: 'เที่ยวเมือง / ถ่ายรูป', en: 'City break',
    items: [
      'เสื้อผ้าใส่ถ่ายรูป 3 ชุด', 'รองเท้าที่เดินสบาย', 'พาวเวอร์แบงก์ 10,000 mAh',
      'สายชาร์จ + หัวแปลงปลั๊ก', 'กระเป๋าสะพายเล็กกันขโมย', 'ร่มพับ',
      'ยาสามัญประจำตัว', 'บัตรเดินทาง / บัตรเครดิต', 'หูฟัง', 'แว่นตา'
    ]
  },
  {
    id: 'packing-camp', kind: 'packing', icon: 'tent', color: '#16a34a',
    th: 'แคมป์ปิ้ง / ดอย', en: 'Camping / mountains',
    items: [
      'เต็นท์ + เสื่อปู', 'ถุงนอน', 'ไฟฉายคาดหัว', 'เสื้อกันหนาวกลางคืน',
      'รองเท้าปีนเขา', 'ยาแก้ปวด / พลาสเตอร์', 'อาหารแห้ง + น้ำ',
      'ถุงขยะ (Leave no trace)', 'มีดพกอเนกประสงค์', 'ยากันแมลง'
    ]
  },
  {
    id: 'todo-before', kind: 'todo', icon: 'list-checks', color: '#ffc81e',
    th: 'งานก่อนออกเดินทาง', en: 'Before you go',
    items: [
      'ตรวจพาสปอร์ต (เหลืออายุ > 6 เดือน)', 'ทำวีซ่า / e-visa', 'จองตั๋วเครื่องบิน',
      'จองที่พัก', 'ซื้อประกันเดินทาง', 'แจ้งธนาคารก่อนใช้บัตรต่างประเทศ',
      'โหลดออฟไลน์แผนที่ + แปลภาษา', 'แลกเงิน / เปิด Roaming',
      'แจ้งที่ทำงานล่วงหน้า', 'ฝากกุญแจบ้าน / แจ้งเพื่อนบ้าน', 'ชั่งน้ำหนักกระเป๋า',
      'เช็คอินออนไลน์ 24 ชม.ก่อนบิน'
    ]
  },
  {
    id: 'todo-documents', kind: 'todo', icon: 'folder-check', color: '#7c3aed',
    th: 'เอกสารและเงิน', en: 'Documents & money',
    items: [
      'พาสปอร์ต + สำเนา', 'ตั๋วเครื่องบิน (ปริ้นต์)', 'ใบจองโรงแรม',
      'ประกันเดินทาง', 'บัตรประชาชน', 'ใบขับขี่สากล', 'บัตรเครดิต 2 ใบ',
      'เงินสดสกุลท้องถิ่น', 'รูปถ่ายติดวีซ่า 2 ใบ'
    ]
  },
  {
    id: 'todo-safety', kind: 'todo', icon: 'heart-pulse', color: '#f43f5e',
    th: 'สุขภาพและความปลอดภัย', en: 'Health & safety',
    items: [
      'ยาประจำตัว + ใบสั่งยา', 'ยาท้องเสีย / แก้คลื่นไส้', 'ยาลดไข้',
      'หน้ากากอนามัย', 'แอลกอฮอล์เจล', 'เบอร์ฉุกเฉินของประเทศนั้น',
      'เบอร์สถานทูตไทย', 'สำเนากรมธรรม์ประกัน', 'บันทึกการแพ้ยา'
    ]
  }
];

/** A stable-enough id for a checklist row (no crypto dependency in tests). */
export function itemId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `ci_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Template items → checklist items (all unchecked, unassigned). */
export function itemsFromTemplate(templateItems = [], { assignee = null } = {}) {
  return templateItems
    .map(text => String(text || '').trim())
    .filter(Boolean)
    .map(text => ({ id: itemId(), text, done: false, assignee, qty: 1, note: '' }));
}

/** Progress of one list: { total, done, remaining, percent }. */
export function checklistProgress(list = {}) {
  const items = Array.isArray(list.items) ? list.items : [];
  const total = items.length;
  const done = items.filter(i => i?.done).length;
  const remaining = total - done;
  const percent = total ? Math.round((done / total) * 100) : 0;
  return { total, done, remaining, percent };
}

/** Overall progress across every list (dashboard widget). */
export function checklistsProgress(lists = []) {
  const items = lists.flatMap(l => (Array.isArray(l.items) ? l.items : []));
  const total = items.length;
  const done = items.filter(i => i?.done).length;
  return { total, done, remaining: total - done, percent: total ? Math.round((done / total) * 100) : 0, lists: lists.length };
}

/** Unchecked first, then by the order they were added. Never mutates input. */
export function sortChecklistItems(items = []) {
  return items
    .map((it, index) => ({ it, index }))
    .sort((a, b) => {
      const da = a.it?.done ? 1 : 0;
      const db = b.it?.done ? 1 : 0;
      if (da !== db) return da - db;
      return a.index - b.index;
    })
    .map(x => x.it);
}

/**
 * Add template texts to an existing list, skipping anything already there
 * (case/space-insensitive) — so “ใช้เทมเพลต” twice never duplicates.
 */
export function mergeTemplateItems(existing = [], templateItems = []) {
  const seen = new Set(existing.map(i => String(i?.text || '').trim().toLowerCase()).filter(Boolean));
  const added = [];
  for (const raw of templateItems) {
    const text = String(raw || '').trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    added.push({ id: itemId(), text, done: false, assignee: null, qty: 1, note: '' });
  }
  return [...existing, ...added];
}

/** Count per member for the "who brings what" summary. */
export function assigneeSummary(list = {}, members = []) {
  const items = Array.isArray(list.items) ? list.items : [];
  return members
    .map(m => ({
      id: m.id,
      name: m.displayName || m.name || '',
      color: m.color || 'var(--primary)',
      total: items.filter(i => i.assignee === m.id).length,
      done: items.filter(i => i.assignee === m.id && i.done).length
    }))
    .filter(row => row.total > 0);
}


/** Look up one template by id. */
export function templateById(id) {
  return CHECKLIST_TEMPLATES.find(t => t.id === id) || null;
}
