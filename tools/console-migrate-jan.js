// Console helper — paste while logged in as a trip admin on the itinerary page.
//
// It writes the Jan 2026 Japan plan to Firestore:
//   • 15 Jan  BKK → SGN     20:50–22:40
//   • 16 Jan  SGN → Tokyo   00:25–07:45 (arrival)
//   • every sightseeing day starts at 07:00, following stops re-chained
//   • 22 Jan  check-in The OneFive Tokyo Kameido 21:00
//   • visit order is never changed
//
// The same routine lives behind Settings → Advanced → “จัดเวลาให้ต่อเนื่อง”,
// which is easier than the console. This file is only a shortcut.
//
// Usage:
//   1) open #/trip/<tripId>/itinerary and log in as trip_admin
//   2) DevTools → Console → paste this whole file → Enter
//   3) reload the plan

(async () => {
  const hash = location.hash || '';
  const m = hash.match(/\/trip\/([^\/\?]+)/);
  const tripId = m ? m[1] : null;
  if (!tripId) { console.error('Cannot find tripId in the URL hash', hash); return; }

  try {
    // Resolve against the page so it also works on a GitHub Pages sub-path.
    const moduleUrl = new URL('src/js/itinerary/migrateJan.js', document.baseURI).href;
    const { repairJanItinerary } = await import(moduleUrl);
    const report = await repairJanItinerary(tripId, { timezone: 'Asia/Tokyo' });
    console.log('[migrate] done', report);
    console.log(`[migrate] updated ${report.updated} items, created ${report.created}, ${report.days} days`);
  } catch (err) {
    console.error('[migrate] failed', err);
  }
})();
