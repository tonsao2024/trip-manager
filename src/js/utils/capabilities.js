// Permission capabilities — pure logic, no Firebase and no DOM.
//
// Kept separate from `permissions.js` (which reads the member document) so the
// Node unit suite can test the model without a browser: `tests/unit/permissions.test.js`.
// `firestore.rules` mirrors these same rules — see docs/PERMISSIONS.md.

export function isAdminRole(role) {
  return role === 'trip_admin' || role === 'super_admin';
}

/**
 * Turn the role + the three switches the admin sets on the member form into the
 * questions the UI actually asks:
 *
 *   viewer            → read-only everywhere
 *   canEditItinerary  → plan, days, sticky notes
 *   canEditExpense    → expenses, cards, expense groups, transfers
 *   canManageMembers  → member list, join requests (co-admin for people — never a viewer)
 *
 * A switch that is *missing* keeps the historical behaviour (members may edit);
 * only an explicit `false` blocks, exactly like `permissionOn()` in the rules.
 */
export function withCapabilities(perms) {
  const p = perms || {};
  const permsObj = p.permissions || {};
  const isViewer = p.role === 'viewer';
  const flag = (name, fallback = true) => (name in permsObj ? permsObj[name] === true : fallback);
  const canEditItinerary = !isViewer && (p.isAdmin || flag('canEditItinerary', true));
  const canEditExpense = !isViewer && (p.isAdmin || flag('canEditExpense', true));
  const canManageMembers = !isViewer && (p.isAdmin || flag('canManageMembers', false));
  const caps = {
    canEditItinerary,
    canEditExpense,
    canManageMembers,
    isViewer,
    readOnly: !canEditItinerary && !canEditExpense,
    can(what) {
      if (what === 'itinerary' || what === 'plan') return canEditItinerary;
      if (what === 'expense' || what === 'expenses' || what === 'money') return canEditExpense;
      if (what === 'members') return canManageMembers;
      if (what === 'settings') return !!p.isAdmin;
      return false;
    }
  };
  return { ...p, ...caps };
}
