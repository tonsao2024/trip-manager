/**
 * Document ownership (เจ้าของเอกสาร) — pure helpers for the “เอกสารสำคัญ” page.
 *
 * A trip can easily hold several documents with the same title (four
 * “พาสปอร์ต”, three “ตั๋วเครื่องบิน”). The owner field is what tells them apart,
 * so the page stores a *list* of member ids on every document:
 *
 *   trips/{tripId}/documents/{docId}.ownerIds = ['u1', 'u3']
 *
 * - one id   → the document belongs to that member (a personal passport)
 * - many ids → the document is shared by those members (one hotel voucher)
 * - no id    → an unassigned document (older documents, or “ยังไม่ระบุ”)
 *
 * Nothing here touches Firestore: the page reads the members it already has and
 * asks these functions what to render, which keeps the behaviour testable
 * (tests/unit/doc-owners.test.js).
 */

/** Filter value for “every owner”. */
export const OWNER_ALL = 'all';
/** Filter value for “documents of the signed-in member”. */
export const OWNER_MINE = 'mine';
/** Filter value for documents that have no owner yet. */
export const OWNER_NONE = '__none';

/** Trim, de-duplicate and drop empty member ids. */
export function normalizeOwnerIds(ids = []) {
  if (!Array.isArray(ids)) return [];
  const out = [];
  for (const raw of ids) {
    const id = String(raw ?? '').trim();
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * Owner ids of a stored document.
 * `ownerId` (singular) is accepted for documents written by another device or
 * by a future import, so nothing silently loses its owner.
 */
export function docOwnerIds(doc = {}) {
  const list = normalizeOwnerIds(doc?.ownerIds);
  if (list.length) return list;
  const single = String(doc?.ownerId ?? '').trim();
  return single ? [single] : [];
}

/** True when the document is explicitly shared by more than one member. */
export function isSharedDoc(doc = {}) {
  return docOwnerIds(doc).length > 1;
}

/** True when nobody has been assigned yet. */
export function isUnownedDoc(doc = {}) {
  return docOwnerIds(doc).length === 0;
}

/** Owner ids of the signed-in account (a member may be linked by id, uid or authUid). */
export function myMemberIds(members = [], currentUserId = '') {
  const uid = String(currentUserId || '').trim();
  if (!uid) return [];
  return (members || [])
    .filter((m) => m && (String(m.id || '') === uid || String(m.uid || '') === uid || String(m.authUid || '') === uid))
    .map((m) => String(m.id));
}

/**
 * Does `doc` belong to the given filter?
 * @param {object} doc
 * @param {string} filter OWNER_ALL | OWNER_MINE | OWNER_NONE | a member id
 * @param {string[]} mine member ids of the signed-in account (for OWNER_MINE)
 */
export function docMatchesOwner(doc = {}, filter = OWNER_ALL, mine = []) {
  const owners = docOwnerIds(doc);
  if (!filter || filter === OWNER_ALL) return true;
  if (filter === OWNER_NONE) return owners.length === 0;
  if (filter === OWNER_MINE) {
    if (!mine.length) return false;
    return owners.some((id) => mine.includes(id));
  }
  return owners.includes(String(filter));
}

/** Filter a document list by owner (keeps the incoming order). */
export function filterDocsByOwner(docs = [], filter = OWNER_ALL, mine = []) {
  return (docs || []).filter((doc) => docMatchesOwner(doc, filter, mine));
}

/**
 * The owner chips, in member order: “ทุกคน”, “ของฉัน” (when the signed-in
 * member exists), then every member who owns something — a member with no
 * documents stays out of the row so the filter never shows dead entries —
 * and finally “ไม่ระบุเจ้าของ” when an unowned document exists.
 *
 * Each row carries what the chip needs to draw itself: name + colour + photo
 * and how many documents it would show.
 *
 * @returns {{id:string, kind:'all'|'mine'|'member'|'none', name:string,
 *            member:object|null, count:number}[]}
 */
export function docOwnerFilters(members = [], docs = [], { mine = [], lang = 'th' } = {}) {
  const rows = [];
  const list = docs || [];
  rows.push({ id: OWNER_ALL, kind: 'all', name: lang === 'th' ? 'ทุกคน' : 'Everyone', member: null, count: list.length });

  if (mine.length) {
    const me = (members || []).find((m) => mine.includes(String(m.id)));
    rows.push({
      id: OWNER_MINE,
      kind: 'mine',
      name: lang === 'th' ? 'ของฉัน' : 'Mine',
      member: me || null,
      count: list.filter((d) => docMatchesOwner(d, OWNER_MINE, mine)).length
    });
  }

  for (const member of members || []) {
    const id = String(member?.id || '');
    if (!id) continue;
    const count = list.filter((d) => docOwnerIds(d).includes(id)).length;
    if (!count) continue;
    rows.push({ id, kind: 'member', name: member.displayName || id, member, count });
  }

  const unowned = list.filter(isUnownedDoc).length;
  if (unowned) rows.push({ id: OWNER_NONE, kind: 'none', name: lang === 'th' ? 'ไม่ระบุเจ้าของ' : 'Unassigned', member: null, count: unowned });

  return rows;
}

/** “ใช้ร่วมกัน 2 คน” / “Shared by 2 people”. */
export function sharedLabel(count, lang = 'th') {
  const n = Number(count) || 0;
  return lang === 'th' ? `ใช้ร่วมกัน ${n} คน` : `Shared by ${n}`;
}

/**
 * A short, human line for a document's owners:
 * “สมชาย”, “สมชาย + นุ่น”, “สมชาย และอีก 3 คน”.
 */
export function ownersSummary(doc = {}, members = [], lang = 'th') {
  const owners = docOwnerIds(doc);
  if (!owners.length) return lang === 'th' ? 'ยังไม่ระบุเจ้าของ' : 'No owner yet';
  const nameOf = (id) => (members || []).find((m) => String(m.id) === id)?.displayName || id;
  if (owners.length === 1) return nameOf(owners[0]);
  if (owners.length === 2) return `${nameOf(owners[0])} + ${nameOf(owners[1])}`;
  const rest = owners.length - 1;
  return lang === 'th'
    ? `${nameOf(owners[0])} และอีก ${rest} คน`
    : `${nameOf(owners[0])} and ${rest} more`;
}
