// Unit tests — trip sub-groups (กลุ่มย่อย): naming, membership and the per-group
// budget report used on the members page.
import {
  normalizeGroup, sortGroups, nextGroupName, groupMembers, groupIdsOfMember,
  memberGroupBadges, groupBudget, groupBudgetReport
} from '../../src/js/utils/groups.js';

function assert(cond, msg) { if (!cond) throw new Error(msg); }
const eq = (a, b, msg) => assert(a === b, `${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`);

const MEMBERS = [
  { id: 'u1', displayName: 'สมชาย' },
  { id: 'u2', displayName: 'นุ่น' },
  { id: 'u3', displayName: 'เคน' },
  { id: 'u4', displayName: 'มิ้น' }
];

const GROUPS = [
  { id: 'g1', name: 'กลุ่ม A', memberIds: ['u1', 'u2'], order: 0 },
  { id: 'g2', name: 'กลุ่ม B', memberIds: ['u3'], order: 1 }
];

const EXPENSES = [
  // u1 fronts a 1,000 hotel that u1 + u2 share (group A only)
  { id: 'e1', netTotalMinor: 100000, payerId: 'u1', allocations: [{ memberId: 'u1', amountMinor: 50000 }, { memberId: 'u2', amountMinor: 50000 }] },
  // u3 fronts a 600 dinner shared by everyone
  { id: 'e2', netTotalMinor: 60000, payerId: 'u3', allocations: MEMBERS.map(m => ({ memberId: m.id, amountMinor: 15000 })) },
  // voided rows never count
  { id: 'e3', status: 'voided', netTotalMinor: 999999, payerId: 'u1', allocations: [{ memberId: 'u1', amountMinor: 999999 }] },
  // nobody hosts this one yet → its money stays out of the *paid* column, but the
  // share is still a planned cost for the people who will split it
  { id: 'e4', payerPending: true, netTotalMinor: 20000, allocations: [{ memberId: 'u2', amountMinor: 20000 }] }
];

export function testGroupNormalizeAndNaming() {
  const g = normalizeGroup({ name: '  กลุ่ม A  ', memberIds: ['u1', 'u1', 'u2', null] }, 0);
  eq(g.name, 'กลุ่ม A', 'name is trimmed');
  eq(g.memberIds.join(','), 'u1,u2', 'member ids are unique + cleaned');
  assert(g.color && g.icon, 'colour + icon get defaults');
  eq(groupIdsOfMember(GROUPS, 'u3').join(','), 'g2', 'member → groups lookup');
  eq(groupMembers(GROUPS[0], MEMBERS).length, 2, 'unknown members are dropped');
  eq(nextGroupName([{ name: 'กลุ่ม A' }, { name: 'กลุ่ม B' }]), 'กลุ่ม C', 'next free group letter');
  const sorted = sortGroups([{ name: 'B', order: 2 }, { name: 'A', order: 1 }]);
  eq(sorted[0].name, 'A', 'groups are sorted by order');
  eq(memberGroupBadges(GROUPS, 'u2')[0].name, 'กลุ่ม A', 'member badges carry the group name');
}

export function testGroupBudget() {
  const a = groupBudget(GROUPS[0], EXPENSES, MEMBERS);
  eq(a.memberCount, 2, 'group A has 2 people');
  eq(a.paidMinor, 100000, 'group A paid the 1,000 hotel');
  eq(a.shareMinor, 50000 + 50000 + 15000 + 15000 + 20000, 'shares include everyone in the group (payer-pending rows still count as a planned share)');
  eq(a.netMinor, a.paidMinor - a.shareMinor, 'net = paid − share');
  eq(a.perPersonMinor, Math.round(a.shareMinor / 2), 'per-person average uses the group size');
  eq(a.itemCount, 3, 'voided rows never count (payer-pending does — it is a planned cost)');

  const b = groupBudget(GROUPS[1], EXPENSES, MEMBERS);
  eq(b.memberCount, 1, 'group B has a single member');
  eq(b.paidMinor, 60000, 'group B paid the dinner');
  eq(b.perPersonMinor, b.shareMinor, 'one person → average equals the share');
}

export function testGroupBudgetReport() {
  const report = groupBudgetReport(GROUPS, EXPENSES, MEMBERS);
  eq(report.groups.length, 2, 'one row per group');
  eq(report.trip.memberCount, 4, 'trip head-count');
  eq(report.trip.paidMinor, 160000, 'trip paid total');
  eq(report.trip.shareMinor, 180000, 'trip share total (incl. the hosted-by-nobody row)');
  eq(report.trip.perPersonMinor, 45000, 'trip average per person');
  const a = report.groups.find(g => g.id === 'g1');
  eq(Math.round(a.shareMinor / report.trip.shareMinor * 100), 83, 'group A share of the trip (~83%)');
  assert(report.compare.find(c => c.id === 'g1').deltaMinor > 0, 'group A is above the trip average');
  eq(report.ungrouped.map(m => m.id).join(','), 'u4', 'members outside every group are listed');
}

export function testEmptyInputs() {
  const report = groupBudgetReport([], [], []);
  eq(report.groups.length, 0, 'no groups → no rows');
  eq(report.trip.perPersonMinor, 0, 'no members → 0 per person');
  eq(groupBudget({ name: 'x', memberIds: [] }, EXPENSES, MEMBERS).perPersonMinor, 0, 'empty group → 0 per person');
}
