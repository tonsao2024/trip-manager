/**
 * Dev-only: build a fully self-contained demo of the app — one folder that runs
 * completely offline (no Tailwind CDN, no Firebase, no internet at all).
 *
 *   node tools/preview/standalone.mjs [outDir]        # default: tools/preview/demo
 *
 * What it does
 *  1. copies the real app source (`src/`, `index.html`) into the output folder
 *  2. rewrites the CDN imports the sandbox cannot reach:
 *       firebase/*        → ./vendor/firebase/*.js   (in-memory store, demo data)
 *       esm.sh/dayjs      → ./vendor/dayjs/…         (the real npm package)
 *       esm.sh/xlsx       → ./vendor/xlsx.js
 *       esm.sh/leaflet    → ./vendor/leaflet.js      (tiny no-network stub)
 *       html2canvas/jspdf → local no-op stubs (PNG/PDF export reports “not in demo”)
 *  3. removes Tailwind + Lucide + Google-Fonts <script>/<link> tags and points
 *     at the pre-built `./vendor/tailwind.css` + local Lucide copy
 *  4. writes `./vendor/demo-seed.js`: the sample trip (Fuji autumn 2027) that the
 *     fake Firestore serves, so every page has real-looking content.
 *
 * The output is a *preview tool*: it is never shipped inside the app and is
 * excluded from git (tools/preview/*).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const outDir = path.resolve(process.argv[2] || path.join(root, 'demo'));
// Files are already absolute URLs ('/vendor/...'): keep them as-is so the demo
// works no matter which folder it is served from.
const vendor = path.join(outDir, 'vendor');

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(vendor, { recursive: true });

// The app's build identity is the single source of truth for the version + the
// “last updated” date shown in the demo banner.
const buildInfoSrc = fs.readFileSync(path.join(root, 'src/js/utils/buildInfo.js'), 'utf8');
const APP_UPDATED_ISO = (buildInfoSrc.match(/APP_UPDATED_ISO\s*=\s*'([^']+)'/) || [])[1] || '';
const APP_VERSION = (buildInfoSrc.match(/APP_VERSION\s*=\s*'([^']+)'/) || [])[1] || '';
const APP_PALETTE = (buildInfoSrc.match(/APP_PALETTE\s*=\s*'([^']+)'/) || [])[1] || '';
const [by, bm, bd] = APP_UPDATED_ISO.split('-').map(Number);
const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const UPDATED_TH = Number.isFinite(by) ? `${bd} ${TH_MONTHS[bm - 1]} ${by + 543}` : '';

// ---------------------------------------------------------------- 1. sources
fs.cpSync(path.join(root, 'src'), path.join(outDir, 'src'), { recursive: true });
fs.cpSync(path.join(root, 'public'), path.join(outDir, 'public'), { recursive: true });

const REL = 'src/js';
const repoint = (from, to) => ({ from, to });

// Rewrite every CDN specifier inside the copied source tree. Replacements are
// computed per file (relative path back to ./vendor) so the demo can be served
// from any sub-folder.
const CDN_TARGETS = [
  ['https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js', 'firebase/app.js'],
  ['https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js', 'firebase/auth.js'],
  ['https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js', 'firebase/firestore.js'],
  ['https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js', 'firebase/storage.js'],
  ['https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js', 'firebase/functions.js'],
  ['https://esm.sh/dayjs@1.11.13/plugin/utc', 'dayjs/plugin/utc.js'],
  ['https://esm.sh/dayjs@1.11.13/plugin/timezone', 'dayjs/plugin/timezone.js'],
  ['https://esm.sh/dayjs@1.11.13/plugin/relativeTime', 'dayjs/plugin/relativeTime.js'],
  ['https://esm.sh/dayjs@1.11.13/plugin/customParseFormat', 'dayjs/plugin/customParseFormat.js'],
  ['https://esm.sh/dayjs@1.11.13', 'dayjs/dayjs.min.js'],
  ['https://esm.sh/xlsx@0.18.5', 'xlsx.js'],
  ['https://esm.sh/leaflet@1.9.4', 'leaflet.js'],
  ['https://esm.sh/sortablejs@1.15.3', 'sortable.js'],
  ['https://esm.sh/html2canvas@1.4.1', 'html2canvas.js'],
  ['https://esm.sh/jspdf@2.5.2', 'jspdf.js']
];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

let rewritten = 0;
for (const file of walk(path.join(outDir, 'src'))) {
  const original = fs.readFileSync(file, 'utf8');
  let next = original;
  for (const [from, target] of CDN_TARGETS) {
    if (!next.includes(from)) continue;
    let rel = path.relative(path.dirname(file), path.join(vendor, target)).split(path.sep).join('/');
    if (!rel.startsWith('.')) rel = `./${rel}`;
    next = next.split(from).join(rel);
  }
  if (next !== original) { fs.writeFileSync(file, next); rewritten++; }
}
console.log(`[demo] rewrote CDN imports in ${rewritten} modules`);

// -------------------------------------------------------------- 2. vendors
const copy = (from, to) => {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
};
const nm = (p) => path.join(root, 'node_modules', p);
// firebase stand-ins
for (const name of ['app', 'auth', 'firestore', 'storage', 'functions']) {
  copy(path.join(here, 'firebase', `${name}.js`), path.join(vendor, 'firebase', `${name}.js`));
}
// dayjs — bundled once (see tools/preview/vendor-src/dayjs-entry.js) because the
// npm plugins are CommonJS and the demo must load real ES modules.
copy(path.join(here, 'vendor-src/dayjs-full.js'), path.join(vendor, 'dayjs/dayjs.min.js'));
for (const plugin of ['utc', 'timezone', 'relativeTime', 'customParseFormat']) {
  const out = path.join(vendor, 'dayjs/plugin', `${plugin}.js`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  // dayjs's customParseFormat plugin exports `customParse`; keep the names honest
  const symbol = plugin === 'customParseFormat' ? 'customParse' : plugin;
  fs.writeFileSync(out, `import { ${symbol} } from '../dayjs.min.js';\nexport default ${symbol};\n`);
}
console.log('[demo] dayjs bundled');

copy(nm('xlsx/xlsx.mjs'), path.join(vendor, 'xlsx.js'));
copy(nm('lucide/dist/umd/lucide.min.js'), path.join(vendor, 'lucide.min.js'));
copy(path.join(here, 'stubs/sortable.js'), path.join(vendor, 'sortable.js'));
copy(path.join(here, 'stubs/leaflet.js'), path.join(vendor, 'leaflet.js'));
copy(path.join(here, 'stubs/html2canvas.js'), path.join(vendor, 'html2canvas.js'));
copy(path.join(here, 'stubs/jspdf.js'), path.join(vendor, 'jspdf.js'));
console.log('[demo] vendor files written');

// --------------------------------------------------------------- 3. shell
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html
  .replace(/<script src="https:\/\/cdn\.tailwindcss\.com"><\/script>/, '<link rel="stylesheet" href="./vendor/tailwind.css">')
  .replace(/<script>\s*tailwind\.config[\s\S]*?<\/script>/, '')
  .replace(/<script src="https:\/\/cdn\.jsdelivr\.net[^"]*"><\/script>/, '<script src="./vendor/lucide.min.js"></script>')
  .replace(/<link rel="preconnect"[^>]*>\s*/g, '')
  .replace(/<link href="https:\/\/fonts\.googleapis\.com[^>]*>/,
    ['<link rel="stylesheet" href="./vendor/fonts/outfit.css">',
     '<link rel="stylesheet" href="./vendor/fonts/plus-jakarta-sans.css">',
     '<link rel="stylesheet" href="./vendor/fonts/noto-sans-thai.css">'].join('\n  '))
  .replace(/<title>[^<]*<\/title>/, '<title>Fuji Trip Planner — ตัวอย่างฟังก์ชันครบ (offline demo)</title>')
  .replace('<body class="min-h-screen', '<body data-demo="1" class="min-h-screen');
// demo banner, injected right after <body>
html = html.replace(/(<body[^>]*>)/, `$1
  <div class="demo-banner" id="demo-banner" hidden>
    <span class="demo-dot"></span>
    <b>เวอร์ชันตัวอย่าง</b>
    <span>ทริปฟูจิ 2027 • ใช้ได้ทุกฟังก์ชันแบบออฟไลน์</span>
    <span class="demo-stamp">v${APP_VERSION} ${APP_PALETTE} • อัปเดตล่าสุด ${UPDATED_TH} • build __DEMO_BUILD__</span>
    <button class="demo-btn" id="demo-banner-hide">ซ่อน</button>
  </div>
  <script>
    // The demo strip is added by the offline demo builder, so it wires itself.
    (function () {
      var bar = document.getElementById('demo-banner');
      try { if (localStorage.getItem('fuji_demo_banner') === 'hidden') return; } catch (e) {}
      bar.hidden = false;
      document.getElementById('demo-banner-hide').addEventListener('click', function () {
        bar.hidden = true;
        try { localStorage.setItem('fuji_demo_banner', 'hidden'); } catch (e) {}
      });
    })();
  </script>`);
html = html.replace('<script type="module" src="./src/js/app.js',
  '<script type="module" src="./vendor/demo-seed.js"></script>\n  <script type="module" src="./src/js/app.js');
let stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
try {
  const { execSync } = await import('node:child_process');
  const hash = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim();
  stamp = `${stamp} • ${hash}`;
} catch { /* not a git checkout */ }
html = html.replace('__DEMO_BUILD__', stamp);
fs.writeFileSync(path.join(outDir, 'index.html'), html);
console.log(`[demo] index.html written (build ${stamp})`);

// ------------------------------------------------------------ 4. demo seed
const seed = `// Generated by tools/preview/standalone.mjs — sample data for the offline demo.
import { __seed } from './firebase/firestore.js';

const now = { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 };
const iso = (offsetDays) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);

const TRIP = {
  name: 'ทริปฟูจิ 2027', description: 'ทริปครอบครัว ชมใบไม้แดงและวิวภูเขาฟูจิ',
  country: 'Japan', city: 'Fujikawaguchiko',
  startDate: iso(0), endDate: iso(4), baseCurrency: 'JPY', timezone: 'Asia/Tokyo',
  exchangeRateToTHB: 0.24, themeColor: '#2f6fe4', inviteCode: 'FUJI23', inviteEnabled: true,
  status: 'active', createdBy: 'demo-user', memberUids: ['demo-user', 'u2', 'u3'],
  budgetTotal: 500000, budgetPerPerson: 250000, createdAt: now, coverImage: ''
};
__seed('trips/demo-trip', TRIP);

__seed('trips/demo-trip/members/demo-user', { displayName: 'สมชาย', username: 'admin', role: 'trip_admin', color: '#2f6fe4', status: 'active', permissions: { canEditItinerary: true, canEditExpense: true, canManageMembers: true }, createdAt: now });
__seed('trips/demo-trip/members/u2', { displayName: 'นุ่น', username: 'nun', role: 'member', color: '#f0ae52', status: 'active', permissions: { canEditItinerary: true, canEditExpense: true }, createdAt: now });
__seed('trips/demo-trip/members/u3', { displayName: 'ข้าวหอม', username: 'khaohom', role: 'member', color: '#3f9d94', status: 'active', permissions: { canEditItinerary: true, canEditExpense: true }, createdAt: now });

const ITEMS = [
  ['i1', 'บินถึงโตเกียว (ฮาเนดะ)', 0, '09:15', 90, 'transport', 'ท่าอากาศยานฮาเนดะ', '35.5494,139.7798', 0, 'รับกระเป๋าแล้วนั่ง Keikyu เข้าเมือง'],
  ['i2', 'ขึ้นรถบัสไปคาวากุจิ', 0, '13:00', 120, 'transport', 'สถานีรถบัสชินจูกุ', '35.6896,139.7006', 2200, 'จองรอบ 13:00 ล่วงหน้าแล้ว'],
  ['i3', 'เช็คอินเรียวกัง', 0, '17:30', 45, 'stay', 'Fujikawaguchiko', '35.5025,138.7519', 32000, 'มีออนเซ็นส่วนตัว'],
  ['i4', 'ทะเลสาบคาวากุจิ', 1, '08:30', 150, 'sightseeing', 'Lake Kawaguchi', '35.5171,138.7519', 0, 'จุดถ่ายรูปวิวฟูจิยามเช้า'],
  ['i5', 'ราเมงฮาจิบัง', 1, '12:30', 60, 'food', 'Fujiyoshida', '35.4875,138.8077', 2500, 'ราเมงโชยุชื่อดัง'],
  ['i6', 'ชมใบไม้แดงที่โอชิโนะฮัคไค', 2, '10:00', 120, 'nature', 'Oshino Hakkai', '35.4605,138.8338', 800, 'น้ำใสทั้งแปดบ่อ'],
  ['i7', 'นั่งชิงช้าสวรรค์ + ดื่มชา', 3, '15:00', 90, 'activity', 'Fuji-Q Highland', '35.4872,138.7799', 1800, '']
];
for (const [id, title, day, time, dur, category, address, coordinates, cost, description] of ITEMS) {
  const date = iso(day);
  __seed('trips/demo-trip/itineraryItems/' + id, {
    title, date, startAt: new Date(date + 'T' + time + ':00+09:00'), durationMinutes: dur, travelToNextMinutes: 30,
    order: Number(id.slice(1)), category, status: 'planned', address, coordinates, description,
    estimateAmount: cost, estimateCurrency: 'JPY', estimateCategory: category === 'food' ? 'food' : 'ticket',
    estimatePayerId: 'demo-user', estimateShareWith: ['demo-user', 'u2', 'u3'], estimateAutoAdd: cost > 0, createdAt: now
  });
}

const EXPENSES = [
  ['e1', 'โรงแรมฟูจิวิว (2 คืน)', 0, 'stay', 32000, 'card', 'demo-user', 'จ่ายบัตรแล้ว รอเก็บใบเสร็จ'],
  ['e2', 'ค่าตั๋วรถบัสชินจูกุ–คาวากุจิ', 0, 'transport', 4400, 'cash', 'u2', ''],
  ['e3', 'มื้อเย็นอิซากายะ', 1, 'food', 8600, 'cash', 'u3', ''],
  ['e4', 'ค่าเข้าชม + ของที่ระลึก', 2, 'activity', 3200, 'card', 'demo-user', '']
];
for (const [id, title, day, category, amount, method, payer, note] of EXPENSES) {
  const share = Math.round(amount / 3);
  __seed('trips/demo-trip/expenses/' + id, {
    title, date: iso(day), category, currency: 'JPY', baseCurrency: 'JPY',
    subtotalMinor: amount, discountMinor: 0, serviceMinor: 0, taxMinor: 0, cardFeeMinor: 0, netTotalMinor: amount,
    thbRate: 0.24, thbMinor: Math.round(amount * 0.24), payerId: payer, status: 'active', isEstimated: false,
    actualMinor: amount, paymentMethod: method, note,
    allocations: [
      { memberId: 'demo-user', amountMinor: share },
      { memberId: 'u2', amountMinor: share },
      { memberId: 'u3', amountMinor: amount - 2 * share }
    ],
    createdAt: now
  });
}

__seed('trips/demo-trip/reservations/b1', {
  title: 'TG676 BKK → NRT', type: 'flight', date: iso(0), startTime: '08:15', endTime: '16:00',
  confirmation: 'XT4K9P', provider: 'Thai Airways', from: 'BKK', to: 'NRT',
  costMinor: 2450000, currency: 'THB', status: 'confirmed',
  address: 'Narita International Airport', notes: '✈ TG676', createdAt: now
});
__seed('trips/demo-trip/checklists/c1', {
  title: 'แพ็คกระเป๋า', templateId: 'packing-tropical', createdAt: now,
  items: [
    { id: 'c1a', text: 'พาสปอร์ต', done: true },
    { id: 'c1b', text: 'ปลั๊กแปลงไฟ', done: true },
    { id: 'c1c', text: 'พาวเวอร์แบงก์', done: false },
    { id: 'c1d', text: 'ยาแก้เมารถ', done: false }
  ]
});
__seed('trips/demo-trip/checklists/c2', {
  title: 'ก่อนออกเดินทาง', templateId: 'before-departure', createdAt: now,
  items: [
    { id: 'c2a', text: 'เช็คอินออนไลน์', done: true },
    { id: 'c2b', text: 'แลกเงินเยน', done: false },
    { id: 'c2c', text: 'ซื้อประกันเดินทาง', done: true }
  ]
});
__seed('trips/demo-trip/ideas/idea1', { title: 'ทะเลสาบคาวากุจิ', note: 'วิวฟูจิยามเช้า ไปก่อน 8 โมง', category: 'sightseeing', votes: ['u2', 'u3'], status: 'idea', createdAt: now });
__seed('trips/demo-trip/ideas/idea2', { title: 'ป่าไผ่อาราชิยามะ', note: 'ไปเช้า คนน้อย ถ่ายรูปสวย', category: 'nature', votes: ['u3'], status: 'idea', createdAt: now });
__seed('trips/demo-trip/ideas/idea3', { title: 'ตลาดปลาสึกิจิ', note: 'ของกินเยอะ ไปก่อน 9 โมง', category: 'food', votes: ['demo-user', 'u2', 'u3'], status: 'idea', createdAt: now });
__seed('trips/demo-trip/notes/n1', { title: 'รหัส WiFi เรียวกัง', body: 'fuji-2027 / 8888', color: 'amber', updatedAt: now });
__seed('trips/demo-trip/documents/d1', { title: 'พาสปอร์ตสมชาย', category: 'passport', date: iso(0), description: 'หมดอายุ 2030', fileUrl: '', imageUrl: '' });
__seed('trips/demo-trip/activity/a1', { type: 'itinerary', title: 'ทะเลสาบคาวากุจิ', detail: 'เพิ่มจากไกด์ Explore', user: 'สมชาย', createdAt: now });

console.log('[demo] seeded demo trip with', ITEMS.length, 'stops');
`;
fs.writeFileSync(path.join(vendor, 'demo-seed.js'), seed, 'utf8');

// -------------------------------------------------------- local font CSS
const fontCss = (family, file, weights) => weights
  .map(w => `@font-face { font-family: '${family}'; font-style: normal; font-weight: ${w}; font-display: swap; src: url('./${file}-${w}.woff2') format('woff2'); }`)
  .join('\n');
const fontsDir = path.join(vendor, 'fonts');
fs.mkdirSync(fontsDir, { recursive: true });
const FONTS = [
  ['Outfit', 'outfit', '@fontsource/outfit', [400, 600, 700, 800], 'latin'],
  ['Plus Jakarta Sans', 'plus-jakarta-sans', '@fontsource/plus-jakarta-sans', [400, 500, 600, 700, 800], 'latin'],
  ['Noto Sans Thai', 'noto-sans-thai', '@fontsource/noto-sans-thai', [400, 500, 600, 700], 'thai']
];
for (const [family, slug, pkg, weights, subset] of FONTS) {
  const css = [];
  for (const w of weights) {
    const src = path.join(root, 'node_modules', pkg, 'files', `${slug}-${subset}-${w}-normal.woff2`);
    if (!fs.existsSync(src)) { console.warn(`[demo] missing font file ${src}`); continue; }
    fs.copyFileSync(src, path.join(fontsDir, `${slug}-${w}.woff2`));
    css.push(`@font-face { font-family: '${family}'; font-style: normal; font-weight: ${w}; font-display: swap; src: url('./${slug}-${w}.woff2') format('woff2'); }`);
  }
  fs.writeFileSync(path.join(fontsDir, `${slug}.css`), css.join('\n') + '\n', 'utf8');
}
console.log('[demo] fonts written');

// ------------------------------------------------------------- Tailwind
// Compiled from: the rendered snapshots, the demo shell, and a synthetic file
// that lists every class the app toggles at runtime (hidden, md:flex, …), so
// Tailwind's CDN-only classes exist offline too.
const { execFileSync } = await import('node:child_process');
const runtimeClasses = [...fs.readFileSync(path.join(root, 'src', 'js', 'app.js'), 'utf8')
  .matchAll(/classList\.(?:add|toggle|remove)\(([^)]*)\)/g)]
  .flatMap(m => [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]))
  .filter(c => /[:\[\]\/]/.test(c) || ['hidden', 'flex', 'grid', 'block', 'inline-block', 'sr-only'].includes(c));
fs.writeFileSync(path.join(outDir, 'runtime-classes.html'),
  runtimeClasses.map(c => `<span class="${c}"></span>`).join('\n') + '\n', 'utf8');
execFileSync('npx', ['tailwindcss',
  '-c', path.join(here, 'tailwind.config.cjs'),
  '-i', path.join(here, 'tailwind.in.css'),
  '-o', path.join(vendor, 'tailwind.css'),
  '--content', [path.join(here, 'out', '*.html'), path.join(outDir, 'index.html'), path.join(outDir, 'runtime-classes.html')].join(',')
], { stdio: 'inherit', cwd: root });
// Tailwind is loaded before the app CSS, so the few utilities the app toggles on
// top of component styles need to win explicitly.
fs.appendFileSync(path.join(vendor, 'tailwind.css'),
  '\n/* demo: keep runtime toggles authoritative over component styles */\n.hidden { display: none !important; }\n');
fs.rmSync(path.join(outDir, 'runtime-classes.html'), { force: true });

// ------------------------------------------------------------- readme
const rel = path.relative(root, outDir).split(path.sep).join('/') || '.';
const readme = [
  `# ${path.basename(outDir)}/ - offline demo (generated)`,
  '',
  '**Do not edit by hand.** Everything in this folder is produced by',
  '',
  '    node tools/preview/standalone.mjs' + (rel === 'demo' ? '' : ' ' + rel),
  '',
  'It is a self-contained copy of the app with the CDNs replaced by local',
  'stand-ins, so the whole feature set can be tried without an internet',
  'connection, a Firebase project or a login:',
  '',
  '- vendor/firebase/*.js - in-memory Firestore/Auth stand-ins, seeded with the',
  '  sample trip "ทริปฟูจิ 2027" (7 stops, 4 expenses, bookings, checklists, ideas)',
  '- vendor/tailwind.css - Tailwind compiled ahead of time (the app normally',
  '  loads the Tailwind CDN)',
  '- vendor/dayjs, vendor/xlsx.js, vendor/lucide.min.js, vendor/fonts/ - local',
  '  copies of the runtime libraries and the three fonts',
  '- vendor/leaflet.js - a stylised map stand-in (pins + route line, no tiles)',
  '',
  'It deploys with the rest of the repo (GitHub Pages / Firebase Hosting serve',
  `${rel}/ as-is). PNG/PDF export and file uploads are intentionally disabled in`,
  'the demo - they need the real browser libraries.',
  '',
  `Updated: ${UPDATED_TH} (${APP_UPDATED_ISO}) • v${APP_VERSION} ${APP_PALETTE}`, ``, `Build: ${stamp}`,
  ''
].join('\n');
fs.writeFileSync(path.join(outDir, 'README.md'), readme, 'utf8');

console.log(`\n[demo] ready: ${rel} (build ${stamp})`);
console.log(`       serve the repo and open /${rel}/index.html`);
