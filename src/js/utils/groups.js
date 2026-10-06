/**
 * Trip sub-groups (กลุ่มย่อย) — pure helpers.
 *
 * A long trip often splits into gangs: some friends fly home early, some join
 * for the second week only. A group is just a named list of member ids:
 *
 *   trips/{tripId}/memberGroups/{groupId} { name, color, icon, memberIds[], order }
 *
 * Groups may overlap on purpose (a member can be in “กลุ่ม A” and “สายกิน”), so
 * the per-group numbers below are computed per group and never “split” the trip
 * total between groups. Everything here is Firestore-free so it can be unit
 * tested; the CRUD lives in src/js/members/groups.js.
 */

export const GROUP_COLORS = ['#0f5ef5', '#00b88a', '#ff7a2e', '#7c3ff0', '#f03570', '#0aa2c0', '#f5820b', '#10a85e'];

export const GROUP_ICONS = ['users', 'plane', 'map-pin', 'sun', 'moon', 'home', 'star', 'backpack'];

/** Normalise a Firestore doc / form payload into the shape the UI expects. */
export function normalizeGroup(raw = {}, index = 0) {
  const memberIds = Array.isArray(raw.memberIds) ? raw.memberIds.filter(Boolean).map(String) : [];
  return {
    id: raw.id || '',
    name: String(raw.name || '').trim(),
    color: raw.color || GROUP_COLORS[index % GROUP_COLORS.length],
    icon: raw.icon || 'users',
    memberIds: [...new Set(memberIds)],
    order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : index,
    note: String(raw.note || '').trim()
  };
}

/** Sort groups by their manual order, then by name. */
export function sortGroups(groups = []) {
  return [...groups]
    .map((g, i) => normalizeGroup(g, i))
    .sort((a, b) => (a.order - b.order) || a.name.localeCompare(b.name, 'th'));
}

export function groupIdsOfMember(groups = [], memberId = '') {
  return sortGroups(groups).filter(g => g.memberIds.includes(memberId)).map(g => g.id);
}

export function groupsOfMember(groups = [], memberId = '') {
  return sortGroups(groups).filter(g => g.memberIds.includes(memberId));
}

/** Members of a group that really exist on the trip (drops deleted members). */
export function groupMembers(group = {}, members = []) {
  const ids = new Set(normalizeGroup(group).memberIds);
  return members.filter(m => ids.has(m.id));
}

/** \"กลุ่ม A\", \"กลุ่ม B\", … — the next free default name. */
export function nextGroupName(groups = []) {
  const used = new Set(sortGroups(groups).map(g => g.name.trim().toLowerCase()));
  for (let i = 0; i < 26; i++) {
    const name = `กลุ่ม ${String.fromCharCode(65 + i)}`;
    if (!used.has(name.toLowerCase())) return name;
  }
  return `กลุ่ม ${sortGroups(groups).length + 1}`;
}

/** Expenses that are part of the money flow (voided + payer-pending are out). */
function liveExpenses(expenses = []) {
  return expenses.filter(e => e && e.status !== 'voided');
}

/** Payments of one expense (supports the legacy single-payer shape). */
function paymentsOf(expense = {}) {
  if (Array.isArray(expense.payments) && expense.payments.length) {
    return expense.payments.map(p => ({ memberId: p.memberId, amountMinor: Number(p.amountMinor) || 0 }));
  }
  if (expense.payerPending) return [];
  if (!expense.payerId) return [];
  return [{ memberId: expense.payerId, amountMinor: Number(expense.netTotalMinor) || 0 }];
}

/**
 * Budget report of ONE group.
 *   paidMinor     — money the group's members fronted for everybody
 *   shareMinor    — what the group's members consumed (their allocations)
 *   netMinor      — paid − share (positive = the group is owed money back)
 *   perPersonMinor — share ÷ people: “เฉลี่ยต่อคนของกลุ่ม”
 *   itemCount     — distinct expenses the group touched
 */
export function groupBudget(group = {}, expenses = [], members = []) {
  const normalized = normalizeGroup(group);
  const people = groupMembers(normalized, members);
  const ids = new Set(people.map(m => m.id));
  let paidMinor = 0;
  let shareMinor = 0;
  let estimatedMinor = 0;
  const touched = new Set();
  for (const exp of liveExpenses(expenses)) {
    for (const p of paymentsOf(exp)) {
      if (ids.has(p.memberId)) { paidMinor += p.amountMinor; touched.add(exp.id); }
    }
    for (const a of exp.allocations || []) {
      if (!ids.has(String(a.memberId))) continue;
      const amount = Number(a.amountMinor) || 0;
      shareMinor += amount;
      if (exp.isEstimated) estimatedMinor += amount;
      touched.add(exp.id);
    }
  }
  const memberCount = people.length;
  return {
    id: normalized.id,
    name: normalized.name,
    color: normalized.color,
    icon: normalized.icon,
    note: normalized.note,
    memberIds: people.map(m => m.id),
    members: people,
    memberCount,
    paidMinor,
    shareMinor,
    estimatedMinor,
    actualMinor: shareMinor - estimatedMinor,
    netMinor: paidMinor - shareMinor,
    perPersonMinor: memberCount ? Math.round(shareMinor / memberCount) : 0,
    itemCount: touched.size
  };
}

/** Budget report for every group plus the whole trip (the comparison base). */
export function groupBudgetReport(groups = [], expenses = [], members = []) {
  const list = sortGroups(groups).map(g => groupBudget(g, expenses, members));
  const rows = liveExpenses(expenses);
  let tripPaidMinor = 0;
  let tripShareMinor = 0;
  for (const exp of rows) {
    for (const p of paymentsOf(exp)) tripPaidMinor += p.amountMinor;
    for (const a of exp.allocations || []) tripShareMinor += Number(a.amountMinor) || 0;
  }
  const pax = members.length;
  const trip = {
    paidMinor: tripPaidMinor,
    shareMinor: tripShareMinor,
    perPersonMinor: pax ? Math.round(tripShareMinor / pax) : 0,
    memberCount: pax
  };
  const inSomeGroup = new Set(list.flatMap(g => g.memberIds));
  const ungrouped = members.filter(m => !inSomeGroup.has(m.id));
  return {
    groups: list,
    trip,
    ungrouped,
    // How each group's per-person average compares with the trip average.
    compare: list.map(g => ({
      id: g.id,
      deltaMinor: g.perPersonMinor - trip.perPersonMinor,
      share: trip.shareMinor > 0 ? g.shareMinor / trip.shareMinor : 0
    }))
  };
}

/** Small “you are in these groups” list used by member cards. */
/**
 * The teams picked for ONE plan item (“แต่ละสถานที่มีกลุ่มไหนไปบ้าง”).
 * An empty pick means “everyone goes” — that is the state of every place that was
 * created before the picker existed, and it is what the plan card shows as “ทุกทีม”.
 */
export function itemGroupIds(item = {}) {
  return Array.isArray(item.groupIds) ? item.groupIds.filter(Boolean).map(String) : [];
}

/** Does this team go to that plan item? No pick at all = the whole trip goes. */
export function groupAttendsItem(groupId, item = {}) {
  const ids = itemGroupIds(item);
  if (!groupId) return false;
  return !ids.length || ids.includes(String(groupId));
}

/** The plan items a team goes to (used for the per-team place counts). */
export function placesForGroup(groupId, items = []) {
  if (!groupId) return [];
  return (items || []).filter(it => groupAttendsItem(groupId, it));
}

export function memberGroupBadges(groups = [], memberId = '') {
  return groupsOfMember(groups, memberId).map(g => ({ id: g.id, name: g.name, color: g.color, icon: g.icon }));
}
