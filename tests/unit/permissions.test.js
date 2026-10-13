// Unit tests — the permission model (v30 audit).
//
// `withCapabilities()` is the single place that turns a role + the admin's three
// switches into the questions the UI asks; `firestore.rules` mirrors the same
// answers (see docs/PERMISSIONS.md). These tests pin the design down.
import {
  withCapabilities, isAdminRole
} from '../../src/js/utils/capabilities.js';

function assert(cond, msg) { if (!cond) throw new Error(msg); }
const eq = (a, b, msg) => assert(a === b, `${msg}: ${a} !== ${b}`);

const member = (permissions = {}, role = 'member') => withCapabilities({ uid: 'u2', role, permissions });
const admin = (role = 'trip_admin') => withCapabilities({
  uid: 'u1', role, isTripAdmin: true, isAdmin: true, isSuperAdmin: role === 'super_admin', permissions: {}
});

/* ------------------------------------------------------------------ roles */

export function testAdminRoleDetection() {
  assert(isAdminRole('trip_admin'), 'trip_admin is an admin');
  assert(isAdminRole('super_admin'), 'super_admin is an admin');
  assert(!isAdminRole('member'), 'member is not an admin');
  assert(!isAdminRole('viewer'), 'viewer is not an admin');
  assert(!isAdminRole(null), 'missing role is not an admin');
}

/* ---------------------------------------------------- the three switches */

export function testMemberSwitchesFollowTheAdminSettings() {
  const normal = member({ canEditItinerary: true, canEditExpense: true, canManageMembers: false });
  assert(normal.canEditItinerary && normal.canEditExpense, 'a normal member edits the plan and the money');
  assert(!normal.canManageMembers, '…but does not manage members');
  assert(!normal.readOnly, 'and is not read-only');

  const noMoney = member({ canEditItinerary: true, canEditExpense: false, canManageMembers: false });
  assert(!noMoney.canEditExpense && noMoney.canEditItinerary, '“แก้ไขค่าใช้จ่าย” off hides money, keeps the plan');
  assert(!noMoney.readOnly, 'still not read-only (the plan is editable)');

  const coAdmin = member({ canEditItinerary: false, canEditExpense: false, canManageMembers: true });
  assert(coAdmin.canManageMembers, '“จัดการสมาชิก” alone makes a co-admin for people');
  assert(!coAdmin.canEditExpense && !coAdmin.canEditItinerary, '…without money or plan rights');
  assert(coAdmin.readOnly, 'for content it is still read-only');

  const planner = member({ canEditItinerary: false, canEditExpense: true, canManageMembers: false });
  assert(planner.canEditExpense && !planner.canEditItinerary, 'the two content switches are independent');
}

export function testMissingSwitchesKeepTheOldBehaviour() {
  // Member documents written before v30 carry no `permissions` map at all; the
  // rules (permissionOn) and the client must both treat that as “allowed”.
  const legacy = withCapabilities({ uid: 'u9', role: 'member', permissions: {} });
  assert(legacy.canEditItinerary && legacy.canEditExpense, 'no switches at all → both edits allowed (back-compat)');
  assert(!legacy.canManageMembers, 'but never member management');

  const noFlags = withCapabilities({ uid: 'u9', role: 'member' });
  assert(noFlags.canEditItinerary && noFlags.canEditExpense && !noFlags.canManageMembers,
    'a missing permissions object behaves the same');

  const partial = member({ canEditExpense: false });
  assert(!partial.canEditExpense && partial.canEditItinerary, 'a partial map only affects the keys it sets');
}

/* ----------------------------------------------------------------- viewer */

export function testViewerIsReadOnlyEverywhere() {
  const viewer = member({ canEditItinerary: true, canEditExpense: true, canManageMembers: true }, 'viewer');
  assert(!viewer.canEditItinerary && !viewer.canEditExpense, 'viewer: no plan, no money — even with switches “on”');
  assert(!viewer.canManageMembers, 'viewer: cannot manage members');
  assert(viewer.isViewer && viewer.readOnly, 'viewer is flagged read-only for the UI');
  assert(!viewer.can('settings') && !viewer.can('members') && !viewer.can('expense') && !viewer.can('itinerary'),
    'viewer: every capability question answers no');
}

/* ------------------------------------------------------------ capabilities */

export function testCapabilityQuestionsAndAdminOverride() {
  const normal = member({ canEditItinerary: true, canEditExpense: true });
  assert(normal.can('itinerary') && normal.can('plan'), 'can(“itinerary”/“plan”)');
  assert(normal.can('expense') && normal.can('expenses') && normal.can('money'), 'can(“expense”) aliases');
  assert(!normal.can('members') && !normal.can('settings'), 'members/settings need rights a member has not got');
  assert(!normal.can('something-else'), 'unknown questions answer no');

  const boss = admin();
  assert(boss.isAdmin && boss.isTripAdmin, 'trip_admin flag');
  assert(boss.canEditItinerary && boss.canEditExpense && boss.canManageMembers, 'an admin may do everything');
  assert(boss.can('settings'), 'an admin may change settings');
  assert(!boss.isViewer && !boss.readOnly, 'an admin is never read-only');

  const superAdmin = admin('super_admin');
  assert(superAdmin.isAdmin && superAdmin.isSuperAdmin, 'super_admin counts as an admin');

  // An admin with explicit false switches still wins: the switches are a
  // member-management tool, an admin can always undo them.
  const adminFalse = withCapabilities({ role: 'trip_admin', isTripAdmin: true, isAdmin: true,
    permissions: { canEditItinerary: false, canEditExpense: false } });
  assert(adminFalse.canEditItinerary && adminFalse.canEditExpense, 'an admin is not blocked by a member switch');
}
