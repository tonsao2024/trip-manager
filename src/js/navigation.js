// Single source for the primary trip navigation shared by desktop and mobile.
// Route handlers remain in app.js; this registry describes only discoverable nav.
export const TRIP_PRIMARY_NAV = Object.freeze([
  Object.freeze({ id: 'trips', labelKey: null, label: { th: 'ทริปทั้งหมด', en: 'All Trips' }, short: { th: 'ทริป', en: 'Trips' }, path: '/trips', icon: 'compass', exact: true }),
  Object.freeze({ id: 'dashboard', labelKey: 'dashboard', short: { th: 'แดชบอร์ด', en: 'Board' }, path: '/dashboard', icon: 'layout-dashboard' }),
  Object.freeze({ id: 'itinerary', labelKey: 'itinerary', short: { th: 'แผน', en: 'Plan' }, path: '/itinerary', icon: 'map-pinned' }),
  Object.freeze({ id: 'ideas', labelKey: 'ideas', short: { th: 'ไอเดีย', en: 'Ideas' }, path: '/ideas', icon: 'lightbulb' }),
  Object.freeze({ id: 'expenses', labelKey: 'expenses', short: { th: 'ค่าใช้จ่าย', en: 'Expenses' }, path: '/expenses', icon: 'wallet' }),
  Object.freeze({ id: 'settlement', labelKey: 'settlement', short: { th: 'เคลียร์บิล', en: 'Settle' }, path: '/settlement', icon: 'hand-coins' }),
  Object.freeze({ id: 'members', labelKey: 'members', short: { th: 'สมาชิก', en: 'Members' }, path: '/members', icon: 'users' }),
  Object.freeze({ id: 'documents', labelKey: null, label: { th: 'เอกสาร', en: 'Documents' }, short: { th: 'เอกสาร', en: 'Docs' }, path: '/documents', icon: 'folder' })
]);

export const TRIP_SECONDARY_NAV = Object.freeze([
  Object.freeze({ id: 'prep', group: 'planning', label: { th: 'เตรียมตัว', en: 'Prep' }, path: '/prep', icon: 'backpack' }),
  Object.freeze({ id: 'bookings', group: 'planning', label: { th: 'การจอง', en: 'Bookings' }, path: '/bookings', icon: 'ticket' }),
  Object.freeze({ id: 'calendar', group: 'planning', label: { th: 'ปฏิทินทริป', en: 'Trip calendar' }, path: '/calendar', icon: 'calendar-days' }),
  Object.freeze({ id: 'weather', group: 'planning', label: { th: 'พยากรณ์อากาศ', en: 'Weather forecast' }, path: '/weather', icon: 'cloud-sun' }),
  Object.freeze({ id: 'explore', group: 'planning', label: { th: 'ชวนไปที่นี่', en: 'Explore' }, path: '/explore', icon: 'compass' }),
  Object.freeze({ id: 'import', group: 'tools', label: { th: 'นำเข้า / ส่งออก', en: 'Import / Export' }, path: '/import', icon: 'package' }),
  Object.freeze({ id: 'settings', group: 'tools', label: { th: 'ตั้งค่า', en: 'Settings' }, path: '/settings', icon: 'settings' })
]);

export function secondaryNavItems({ tripId, lang = 'th' } = {}) {
  const base = `#/trip/${encodeURIComponent(String(tripId || ''))}`;
  return TRIP_SECONDARY_NAV.map(item => ({ ...item, label: item.label[lang === 'th' ? 'th' : 'en'], href: `${base}${item.path}` }));
}

export function primaryNavItems({ tripId, lang = 'th', translate = key => key } = {}) {
  const base = `#/trip/${encodeURIComponent(String(tripId || ''))}`;
  return TRIP_PRIMARY_NAV.map(item => {
    const label = item.labelKey ? translate(item.labelKey) : item.label[lang === 'th' ? 'th' : 'en'];
    return { ...item, label, shortLabel: item.short[lang === 'th' ? 'th' : 'en'], href: item.exact ? '#/trips' : `${base}${item.path}` };
  });
}
