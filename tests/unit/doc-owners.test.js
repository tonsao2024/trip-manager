// Unit tests — document ownership (เจ้าของเอกสาร) on the Documents page.
// Owner ids decide what the filter shows and how a card labels itself, so the
// rules are pinned here instead of in the DOM.
import {
  OWNER_ALL, OWNER_MINE, OWNER_NONE, normalizeOwnerIds, docOwnerIds, isSharedDoc,
  isUnownedDoc, myMemberIds, docMatchesOwner, filterDocsByOwner, docOwnerFilters,
  sharedLabel, ownersSummary
} from '../../src/js/utils/docOwners.js';

function assert(cond, msg) { if (!cond) throw new Error(msg); }
const eq = (a, b, msg) => assert(a === b, `${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`);

const MEMBERS = [
  { id: 'u1', displayName: 'สมชาย' },
  { id: 'u2', displayName: 'นุ่น' },
  { id: 'u3', displayName: 'เคน', uid: 'u3' },
  { id: 'u4', displayName: 'มิ้น' }
];

const DOCS = [
  { id: 'd1', title: 'พาสปอร์ตสมชาย', ownerIds: ['u1'] },
  { id: 'd2', title: 'พาสปอร์ตของทุกคน', ownerIds: ['u1', 'u2', 'u3'] },
  { id: 'd3', title: 'ตั๋วเครื่องบิน', ownerIds: ['u2'] },
  { id: 'd4', title: 'เอกสารเก่า' }
];

export function testOwnerIdsNormalize() {
  eq(JSON.stringify(normalizeOwnerIds(['u1', ' u1 ', '', null, 'u2', undefined])), '["u1","u2"]', 'ids are trimmed and unique');
  eq(JSON.stringify(normalizeOwnerIds('u1')), '[]', 'a non-array yields nothing');
  eq(JSON.stringify(docOwnerIds({ ownerIds: ['u1'] })), '["u1"]', 'ownerIds is the primary field');
  eq(JSON.stringify(docOwnerIds({ ownerId: 'u2' })), '["u2"]', 'legacy ownerId is still read');
  eq(JSON.stringify(docOwnerIds({ ownerIds: [], ownerId: 'u2' })), '["u2"]', 'an empty list falls back to ownerId');
  eq(JSON.stringify(docOwnerIds({ ownerIds: ['u1', 'u2'], ownerId: 'u3' })), '["u1","u2"]', 'ownerIds wins over ownerId');
}

export function testSharedAndUnowned() {
  assert(isSharedDoc({ ownerIds: ['u1', 'u2'] }), 'two owners = shared');
  assert(!isSharedDoc({ ownerIds: ['u1'] }), 'one owner is not shared');
  assert(isUnownedDoc({}), 'no owner = unassigned');
  assert(!isUnownedDoc({ ownerIds: ['u1'] }), 'an owned document is assigned');
}

export function testMatchesOwner() {
  const mine = ['u2'];
  assert(docMatchesOwner(DOCS[0], OWNER_ALL, mine), 'everyone matches all');
  assert(docMatchesOwner(DOCS[1], 'u3', mine), 'member id matches inside a shared list');
  assert(!docMatchesOwner(DOCS[0], 'u2', mine), 'another member does not match');
  assert(docMatchesOwner(DOCS[1], OWNER_MINE, mine), 'mine matches a shared document');
  assert(!docMatchesOwner(DOCS[0], OWNER_MINE, mine), 'mine does not match somebody else’s document');
  assert(!docMatchesOwner(DOCS[0], OWNER_MINE, []), 'mine with no member never matches');
  assert(docMatchesOwner(DOCS[3], OWNER_NONE, mine), 'unassigned matches the none filter');
  assert(!docMatchesOwner(DOCS[0], OWNER_NONE, mine), 'an owned document is not unassigned');
  eq(filterDocsByOwner(DOCS, 'u2', mine).map(d => d.id).join(','), 'd2,d3', 'filter keeps order and every document of that member');
}

export function testMyMemberIds() {
  eq(myMemberIds(MEMBERS, 'u2').join(','), 'u2', 'member id link');
  eq(myMemberIds(MEMBERS, 'u3').join(','), 'u3', 'uid link');
  eq(myMemberIds([{ id: 'm1', authUid: 'u9' }], 'u9').join(','), 'm1', 'authUid link');
  eq(myMemberIds(MEMBERS, '').length, 0, 'signed out = nothing');
  eq(myMemberIds(MEMBERS, 'nobody').length, 0, 'unknown account = nothing');
}

export function testFiltersRow() {
  const mine = ['u1'];
  const rows = docOwnerFilters(MEMBERS, DOCS, { mine, lang: 'th' });
  const ids = rows.map(r => r.id);
  eq(ids.join(','), `all,mine,u1,u2,u3,__none`, 'all → mine → owners with documents → unassigned');
  assert(!ids.includes('u4'), 'a member with no documents has no chip');
  eq(rows[0].count, 4, '“ทุกคน” counts every document');
  eq(rows[1].count, 2, '“ของฉัน” counts the documents of u1');
  eq(rows.find(r => r.id === 'u3').count, 1, 'a member chip counts their documents');
  eq(rows.find(r => r.id === OWNER_NONE).count, 1, 'the unassigned chip counts unowned documents');
  eq(rows.find(r => r.id === 'u1').name, 'สมชาย', 'the chip carries the member name');
  eq(rows.find(r => r.id === 'u1').member.id, 'u1', 'the chip carries the member (for the avatar)');

  const en = docOwnerFilters(MEMBERS, DOCS, { mine: [], lang: 'en' });
  eq(en[0].name, 'Everyone', 'English label');
  assert(!en.some(r => r.id === OWNER_MINE), 'no “Mine” chip when the account is not a trip member');

  const clean = docOwnerFilters(MEMBERS, DOCS.slice(0, 3), { mine: [], lang: 'th' });
  assert(!clean.some(r => r.id === OWNER_NONE), 'no unassigned chip when every document has an owner');
}

export function testLabels() {
  eq(sharedLabel(3, 'th'), 'ใช้ร่วมกัน 3 คน', 'Thai shared label');
  eq(sharedLabel(2, 'en'), 'Shared by 2', 'English shared label');
  eq(ownersSummary({ ownerIds: ['u1'] }, MEMBERS, 'th'), 'สมชาย', 'one owner');
  eq(ownersSummary({ ownerIds: ['u1', 'u2'] }, MEMBERS, 'th'), 'สมชาย + นุ่น', 'two owners');
  eq(ownersSummary({ ownerIds: ['u1', 'u2', 'u3'] }, MEMBERS, 'th'), 'สมชาย และอีก 2 คน', 'three owners');
  eq(ownersSummary({}, MEMBERS, 'th'), 'ยังไม่ระบุเจ้าของ', 'no owner');
  eq(ownersSummary({ ownerIds: ['ghost'] }, MEMBERS, 'th'), 'ghost', 'an unknown id falls back to the id');
}
