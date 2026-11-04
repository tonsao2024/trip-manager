import { TRIP_PRIMARY_NAV, TRIP_SECONDARY_NAV, primaryNavItems, secondaryNavItems } from '../../src/js/navigation.js';

function assert(condition, message) { if (!condition) throw new Error(message); }

export function testPrimaryNavigationRegistry() {
  const th = primaryNavItems({ tripId: 'trip 1', lang: 'th', translate: key => `T:${key}` });
  const en = primaryNavItems({ tripId: 'x', lang: 'en', translate: key => `E:${key}` });
  assert(th.length === 8 && new Set(TRIP_PRIMARY_NAV.map(item => item.id)).size === 8, 'primary nav ids are unique and all eight items remain');
  assert(th[0].href === '#/trips' && th[1].href === '#/trip/trip%201/dashboard', 'trip ids are encoded and trips link is global');
  assert(th[1].label === 'T:dashboard' && en[1].shortLabel === 'Board', 'labels and short labels are localized');
  assert(th.every(item => item.icon && item.href), 'every nav item has a destination and icon');
  const secondary = secondaryNavItems({ tripId: 'trip 1', lang: 'th' });
  assert(secondary.length === TRIP_SECONDARY_NAV.length && secondary.every(item => item.href.startsWith('#/trip/trip%201/')), 'secondary menu destinations share the registry and encode trip ids');
  assert(new Set(TRIP_SECONDARY_NAV.map(item => item.id)).size === TRIP_SECONDARY_NAV.length, 'secondary nav ids are unique');
  console.log('✓ shared primary and secondary navigation registry');
}
