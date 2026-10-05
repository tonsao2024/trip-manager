# demo/ - offline demo (generated)

**Do not edit by hand.** Everything in this folder is produced by

    node tools/preview/standalone.mjs

It is a self-contained copy of the app with the CDNs replaced by local
stand-ins, so the whole feature set can be tried without an internet
connection, a Firebase project or a login:

- vendor/firebase/*.js - in-memory Firestore/Auth stand-ins, seeded with the
  sample trip "ทริปฟูจิ 2027" (7 stops, 4 expenses, bookings, checklists, ideas)
- vendor/tailwind.css - Tailwind compiled ahead of time (the app normally
  loads the Tailwind CDN)
- vendor/dayjs, vendor/xlsx.js, vendor/lucide.min.js, vendor/fonts/ - local
  copies of the runtime libraries and the three fonts
- vendor/leaflet.js - a stylised map stand-in (pins + route line, no tiles)

It deploys with the rest of the repo (GitHub Pages / Firebase Hosting serve
demo/ as-is). PNG/PDF export and file uploads are intentionally disabled in
the demo - they need the real browser libraries.

Updated: 5 ต.ค. 2569 (2026-10-05) • v17 Sky light

Build: 2026-10-05 16:51 • 438c44d
