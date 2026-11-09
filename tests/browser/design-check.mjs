// Design check (optional dev tool) — the unslop audit as a repeatable test.
//
// docs/UNSLOP-AUDIT-2026-11-08.md sets the rules the UI follows. This script
// renders every screen of the real app (43 routes) in a real Chromium, at
// desktop 1440 and phone 390, in light and dark mode, with the real fonts
// (IBM Plex Sans Thai + Mono), and measures every visible element:
//
//   contrast   text below WCAG AA (4.5:1, or 3:1 for large text)
//   mono600    IBM Plex Mono at weight ≥600 (the rules cap Mono at 500)
//   thaiclip   a clipped Thai line with line-height <1.4 (cuts ที่ ปู่ ฎ)
//   year       a Christian-era year on screen (Thai screens use พ.ศ.)
//   latin      English-only copy on the Thai UI
//   target<24  a control smaller than 24px (WCAG 2.5.8)
//   noname / titleonly / nolabel   controls without an accessible name
//
// Any finding outside the allowlist below fails the run. Two findings are
// reported as warnings only: target<32 (phone comfort size) and nested boxes.
//
// Run it with:
//   npm ci
//   npm run test:browser:design
//   DESIGN_ROUTES=settlement,explore DESIGN_MODES=dark DESIGN_SIZES=390x844 npm run test:browser:design
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { outRoot } from './mobile-build.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const PORT = Number(process.env.DESIGN_PORT || 8099);
const workDir = path.join(outRoot, 'design');
const MODES = (process.env.DESIGN_MODES || 'light,dark').split(',').filter(Boolean);
const SIZES = (process.env.DESIGN_SIZES || '1440x900,390x844').split(',').filter(Boolean);

const ROUTES = {
  settlement: ['#/trip/t1/settlement'],
  itinerary: ['#/trip/t1/itinerary'],
  ideas: ['#/trip/t1/ideas'],
  dashboard: ['#/trip/t1/dashboard'],
  expenses: ['#/trip/t1/expenses'],
  trips: ['#/trips'],
  members: ['#/trip/t1/members'],
  bookings: ['#/trip/t1/bookings'],
  prep: ['#/trip/t1/prep'],
  more: ['#/trip/t1/more'],
  settings: ['#/trip/t1/settings'],
  'expense-add': ['#/trip/t1/expenses/add'],
  calendar: ['#/trip/t1/calendar'],
  explore: ['#/trip/t1/explore'],
  documents: ['#/trip/t1/documents'],
  export: ['#/trip/t1/export'],
  'set-appearance': ['#/trip/t1/settings', ['[data-settings-tab="appearance"]']],
  'set-notify': ['#/trip/t1/settings', ['[data-settings-tab="notify"]']],
  'set-system': ['#/trip/t1/settings', ['[data-settings-tab="system"]']],
  'set-advanced': ['#/trip/t1/settings', ['[data-settings-tab="advanced"]']],
  'debt-map': ['#/trip/t1/settlement', ['#settle-views [data-view="debt-map"]']],
  'settle-receipts': ['#/trip/t1/settlement', ['#settle-views [data-view="receipts"]']],
  'add-place': ['#/trip/t1/itinerary?action=add'],
  'member-form': ['#/trip/t1/members', ['#add-member-btn']],
  'expense-popup': ['#/trip/t1/expenses', ['.expense-card']],
  'appearance-sheet': ['#/trip/t1/dashboard', ['#user-avatar-btn', '#appearance-btn']],
  'account-sheet': ['#/trip/t1/dashboard', ['#user-avatar-btn']],
  toasts: ['#/trip/t1/dashboard', [], 'toasts'],
  'notify-panel': ['#/trip/t1/dashboard', ['#notify-bell']],
  'dash-menu': ['#/trip/t1/dashboard', ['#dash-more-btn']],
  'dash-widgets': ['#/trip/t1/dashboard', ['#dash-widgets-btn']],
  activity: ['#/trip/t1/expenses', ['#activity-btn']],
  'trip-form': ['#/trips', ['#create-trip-btn']],
  'idea-form': ['#/trip/t1/ideas', ['#idea-add-btn']],
  'idea-compare': ['#/trip/t1/ideas', ['[data-act="compare"]']],
  'booking-form': ['#/trip/t1/bookings', ['#booking-add-btn']],
  'doc-form': ['#/trip/t1/documents', ['#add-doc-btn']],
  'cat-manager': ['#/trip/t1/settings', ['[data-settings-tab="system"]', '#settings-manage-cats']],
  'card-manager': ['#/trip/t1/settings', ['[data-settings-tab="system"]', '#settings-manage-cards']],
  'itin-export': ['#/trip/t1/itinerary', ['#itin-export-btn']],
  import: ['#/trip/t1/import'],
  'prep-template': ['#/trip/t1/prep', ['#prep-template-btn']],
  'member-sheet': ['#/trip/t1/members', ['[data-member-id], .member-row']]
};
const wanted = process.env.DESIGN_ROUTES ? process.env.DESIGN_ROUTES.split(',') : Object.keys(ROUTES);

// Findings that are correct as they are. Every entry says why.
const ALLOW = [
  // the footer separators are decorative and aria-hidden
  [/^contrast \S+ span\.app-footer-dot/, 'decorative separator (aria-hidden)'],
  // only the ฿ sign is in the Thai block; a money figure has no Thai marks to clip
  [/^thaiclip \S+ \S*\.money-primary/, 'money figure (no Thai marks)'],
  // avatar initials sit in a box far taller than the line
  [/^thaiclip \S+ \S*\.avatar\b/, 'avatar initial'],
  // the sample trip is called “ทริปฟูจิ 2027” — user content, not a date
  [/^year .*«[^»]*ทริปฟูจิ 2027/, 'user content (the trip name)'],
  // brand, product and place names stay in their own language
  [/^latin .*«(?:Trip Manager|by TonSkywalker|Excel|Open-Meteo|Tokyo Station|Shinjuku|Kyoto|Kawaguchiko|Yamanashi|Fuji|Google Maps)/, 'proper noun'],
  [/^latin \S*\.place-chip/, 'place name from the guide']
];
const WARN = /^(?:target<32|nested) /;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

// The mobile driver without its lucide stub, so the real icon subset renders.
fs.mkdirSync(workDir, { recursive: true });
const driver = fs.readFileSync(path.join(root, 'tests/browser/mobile-driver.js'), 'utf8')
  .replace(/window\.lucide = \{[\s\S]*?\n\};\n/, '');
fs.writeFileSync(path.join(workDir, 'driver.js'), driver);
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  .replace(/<link[^>]*fonts\.googleapis\.com[^>]*>/g, '')
  .replace(/<link[^>]*fonts\.gstatic\.com[^>]*>/g, '')
  .replace(/<noscript>[\s\S]*?<\/noscript>/g, '')
  .replace(/<script type="importmap">[\s\S]*?<\/script>/, '')
  .replace(/<script type="module" src="\.\/src\/js\/app\.js\?v=\d+"><\/script>/, '<script type="module" src="/tests/browser/out/design/driver.js"></script>')
  .replace(/\.\/src\//g, '/src/');
if (!html.includes('/tests/browser/out/design/driver.js')) throw new Error('design-check: could not swap the app entry for the driver (index.html changed?)');
fs.writeFileSync(path.join(workDir, 'page.html'), html);

// The real fonts as data URLs: the devDependencies first, then a local copy.
function fontCss() {
  const out = [];
  const sources = [
    ['IBM Plex Sans Thai', 'ibm-plex-sans-thai', ['thai', 'latin'], [400, 500, 600]],
    ['IBM Plex Mono', 'ibm-plex-mono', ['latin'], [400, 500, 600]]
  ];
  for (const [family, pkg, subsets, weights] of sources) {
    const dir = [
      path.join(root, 'node_modules/@fontsource', pkg, 'files'),
      `/tmp/fonts/fontsource-${pkg}-5.3.0/package/files`
    ].find((d) => fs.existsSync(d));
    if (!dir) { console.warn(`⚠️  ${family} not installed — run npm ci; text metrics will use a fallback face`); continue; }
    for (const s of subsets) for (const w of weights) {
      const f = path.join(dir, `${pkg}-${s}-${w}-normal.woff2`);
      if (fs.existsSync(f)) out.push(`@font-face{font-family:'${family}';font-weight:${w};font-style:normal;src:url(data:font/woff2;base64,${fs.readFileSync(f).toString('base64')}) format('woff2');}`);
    }
  }
  return out.join('\n');
}

/** Runs in the page: one line per finding. */
function audit() {
  const out = [];
  const sel = (el) => {
    const cls = typeof el.className === 'string' ? el.className : (el.className?.baseVal || '');
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (cls.trim() ? '.' + cls.trim().split(/\s+/).slice(0, 3).join('.') : '');
  };
  const ownText = (el) => [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').replace(/\s+/g, ' ').trim();
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') return false;
    for (let p = el; p && p.nodeType === 1; p = p.parentElement) if (parseFloat(getComputedStyle(p).opacity) === 0) return false;
    return true;
  };
  const parse = (s) => {
    s = String(s);
    let m = s.match(/rgba?\(([^)]+)\)/);
    if (m) { const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; }
    m = s.match(/color\(srgb ([-\d.e]+) ([-\d.e]+) ([-\d.e]+)(?: \/ ([\d.]+))?\)/);
    if (m) return [m[1] * 255, m[2] * 255, m[3] * 255, m[4] === undefined ? 1 : +m[4]];
    return null;
  };
  const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const blend = (top, under) => { const a = top[3]; return [top[0] * a + under[0] * (1 - a), top[1] * a + under[1] * (1 - a), top[2] * a + under[2] * (1 - a), 1]; };
  const bgOf = (el) => {
    const stack = [];
    for (let p = el; p && p.nodeType === 1; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.backgroundImage && cs.backgroundImage !== 'none' && !/gradient/.test(cs.backgroundImage)) return null; // text over an image: skip
      const c = parse(cs.backgroundColor);
      if (c && c[3] > 0) { stack.push(c); if (c[3] >= 0.99) break; }
    }
    let base = document.documentElement.dataset.theme === 'dark' ? [17, 17, 19, 1] : [255, 255, 255, 1];
    for (let i = stack.length - 1; i >= 0; i--) base = blend(stack[i], base);
    return base;
  };
  const opacityOf = (el) => { let o = 1; for (let p = el; p && p.nodeType === 1; p = p.parentElement) o *= parseFloat(getComputedStyle(p).opacity); return o; };
  const THAI = /[\u0E00-\u0E7F]/;
  for (const el of document.querySelectorAll('body *')) {
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'OPTION'].includes(el.tagName)) continue;
    if (el instanceof SVGElement) continue;
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    const t = ownText(el);
    const r = el.getBoundingClientRect();
    if (t) {
      const fs = parseFloat(cs.fontSize), fw = parseInt(cs.fontWeight, 10);
      const disabled = el.closest('[disabled], [aria-disabled="true"], .is-disabled, .cal-cell.is-muted, .is-outside, .leaflet-control-attribution');
      const fg = parse(cs.color);
      const bg = bgOf(el);
      if (fg && bg && !disabled) {
        const op = opacityOf(el);
        const f2 = blend([fg[0], fg[1], fg[2], fg[3] * op], bg);
        const L1 = lum(f2), L2 = lum(bg);
        const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
        const large = fs >= 24 || (fs >= 18.66 && fw >= 600);
        if (ratio < (large ? 3 : 4.5)) out.push(`contrast ${ratio.toFixed(2)} ${sel(el)} ${fs}px ${cs.color}${op < 1 ? ' op=' + op.toFixed(2) : ''} on rgb(${bg.slice(0, 3).map(Math.round).join(',')}) «${t.slice(0, 28)}»`);
      }
      if (/Plex Mono|monospace/i.test(cs.fontFamily.split(',')[0]) && fw >= 600) out.push(`mono600 ${sel(el)} ${fw} «${t.slice(0, 24)}»`);
      if (THAI.test(t) && fs > 0) {
        const lh = cs.lineHeight === 'normal' ? 1.5 : parseFloat(cs.lineHeight) / fs;
        const clips = cs.overflow === 'hidden' || cs.overflowY === 'hidden' || cs.textOverflow === 'ellipsis' || cs.webkitLineClamp !== 'none';
        if (clips && lh < 1.4) out.push(`thaiclip lh=${lh.toFixed(2)} ${sel(el)} «${t.slice(0, 24)}»`);
      }
      if (/\b(19|20)\d\d\b/.test(t) && !/build|©/.test(t)) out.push(`year ${sel(el)} «${t.slice(0, 50)}»`);
      if (/^[A-Za-z][A-Za-z0-9 .,'’/&():+-]{2,}$/.test(t) && /[a-z]{3,}/.test(t)) out.push(`latin ${sel(el)} «${t.slice(0, 40)}»`);
    }
    const tag = el.tagName;
    const interactive = tag === 'BUTTON' || (tag === 'A' && el.hasAttribute('href')) || el.getAttribute('role') === 'button' || tag === 'SELECT' || (tag === 'INPUT' && el.type !== 'hidden');
    if (interactive && !el.closest('.leaflet-container')) {
      const inline = tag === 'A' && el.closest('p, li') && cs.display === 'inline';
      // a checkbox / switch is tapped through its label too: measure the larger box
      let box = r;
      if (tag === 'INPUT' && /^(?:checkbox|radio)$/.test(el.type)) {
        for (const l of el.labels || []) { const lr = l.getBoundingClientRect(); if (Math.min(lr.width, lr.height) > Math.min(box.width, box.height)) box = lr; }
      }
      const m = Math.min(box.width, box.height);
      const label = (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 20);
      if (!inline && m < 24) out.push(`target<24 ${Math.round(box.width)}x${Math.round(box.height)} ${sel(el)} «${label}»`);
      else if (!inline && m < 32 && innerWidth < 768) out.push(`target<32 ${Math.round(box.width)}x${Math.round(box.height)} ${sel(el)} «${label}»`);
      const name = (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title') || el.textContent || el.value || el.getAttribute('alt') || '').trim();
      if ((tag === 'BUTTON' || tag === 'A' || el.getAttribute('role') === 'button') && !name) out.push(`noname ${sel(el)}`);
      if ((tag === 'BUTTON' || tag === 'A') && !el.getAttribute('aria-label') && !el.textContent.trim() && el.getAttribute('title')) out.push(`titleonly ${sel(el)} «${el.getAttribute('title').slice(0, 20)}»`);
      if ((tag === 'INPUT' || tag === 'SELECT') && !['checkbox', 'radio', 'submit', 'button', 'file', 'color', 'range'].includes(el.type)) {
        const lab = el.labels?.length || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title');
        if (!lab) out.push(`nolabel ${sel(el)} ph=«${(el.getAttribute('placeholder') || '').slice(0, 20)}»`);
      }
    }
    // nested containers: a bordered + filled + rounded box inside a .card
    if (cs.borderTopWidth !== '0px' && parseFloat(cs.borderTopLeftRadius) >= 8) {
      const bg = parse(cs.backgroundColor);
      if (bg && bg[3] > 0.5 && !el.classList.contains('card') && !/btn|chip|badge|input|avatar|icon|switch|toggle|segmented|kpi|tile|pill|swatch|cal-cell|toast|vote|receipt|rcpt|sheet|modal|menu|dropdown|thumb/.test(el.className) && !['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'A', 'LABEL'].includes(tag)) {
        const host = el.parentElement?.closest('.card');
        if (host && r.width > 160 && r.height > 40) out.push(`nested ${sel(el)} in ${sel(host)}`);
      }
    }
  }
  return out;
}

async function main() {
  const fonts = fontCss();
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    const file = url === '/' ? path.join(workDir, 'page.html') : path.join(root, url);
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404).end('missing'); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));

  const chromium = (await import('@sparticuz/chromium')).default;
  const puppeteer = (await import('puppeteer-core')).default;
  const browser = await puppeteer.launch({
    args: [...chromium.args, '--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
    executablePath: await chromium.executablePath(),
    headless: true,
    env: { ...process.env, LD_LIBRARY_PATH: ['/tmp/al2023/lib', process.env.LD_LIBRARY_PATH || ''].filter(Boolean).join(':') }
  });

  const failures = [];
  const warnings = new Map();
  const allowed = new Map();
  const pageErrors = [];
  for (const mode of MODES) {
    for (const size of SIZES) {
      const [w, h] = size.split('x').map(Number);
      const page = await browser.newPage();
      await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: w < 768, hasTouch: w < 768 });
      page.on('pageerror', (e) => { if (!/geocod|fetch|network/i.test(e.message)) pageErrors.push(`${mode} ${w}: ${e.message.slice(0, 160)}`); });
      await page.evaluateOnNewDocument((m) => { try { localStorage.setItem('fuji_theme', m); } catch { /* storage off */ } }, mode);
      await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
      if (fonts) await page.addStyleTag({ content: fonts });
      await page.waitForFunction(() => window.__mobile?.ready, { timeout: 30000 });
      await page.evaluate(() => document.fonts?.ready);
      const before = failures.length;
      for (const name of wanted) {
        const spec = ROUTES[name];
        if (!spec) { failures.push(`${mode} ${w} ${name}: unknown route`); continue; }
        const [hash, taps = [], special] = spec;
        await page.evaluate(() => { document.querySelectorAll('.sheet-backdrop, .bottom-sheet-backdrop, .bottom-sheet, .modal-backdrop, #toast-container .toast').forEach((n) => n.remove()); });
        await page.evaluate((x) => window.__mobile.goto(x), hash);
        for (const s of taps) await page.evaluate((x) => window.__mobile.tap(x), s);
        if (special === 'toasts') {
          await page.evaluate(async () => {
            const { toast } = await import('/tests/browser/out/app/components/toast.js');
            toast.success('บันทึกค่าใช้จ่ายแล้ว');
            toast.error('เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง', 'เกิดข้อผิดพลาด', () => {});
            toast.warning('ยังไม่ได้เลือกผู้จ่าย');
            toast.info('มีสมาชิกใหม่เข้าร่วมทริป');
            toast.loading('กำลังอัปโหลดรูป');
          });
        }
        await new Promise((r) => setTimeout(r, 900));
        const lines = [...new Set(await page.evaluate(audit))];
        for (const line of lines) {
          const allow = ALLOW.find(([re]) => re.test(line));
          if (allow) { allowed.set(allow[1], (allowed.get(allow[1]) || 0) + 1); continue; }
          const key = `${mode} ${w} ${name}: ${line}`;
          if (WARN.test(line)) warnings.set(line.replace(/ \d+x\d+ /, ' '), key);
          else failures.push(key);
        }
      }
      console.log(`${failures.length === before ? '✅' : '❌'} ${mode} ${w}px — ${wanted.length} screens${failures.length === before ? '' : `, ${failures.length - before} findings`}`);
      await page.close();
    }
  }
  await browser.close();
  server.close();

  if (warnings.size) {
    console.log(`\n⚠️  ${warnings.size} warnings (not failing):`);
    for (const key of warnings.values()) console.log('   ' + key);
  }
  if (allowed.size) console.log(`\nallowed by design: ${[...allowed].map(([why, n]) => `${why} ×${n}`).join(', ')}`);
  for (const e of pageErrors) failures.push(`page error ${e}`);
  if (failures.length) {
    console.log(`\n❌ design check found ${failures.length} problems:`);
    for (const f of failures) console.log('   ' + f);
  }
  console.log(`\n${failures.length ? '❌' : '✅'} design check ${failures.length ? 'failed' : 'passed'} — ${wanted.length} screens × ${SIZES.length} sizes × ${MODES.length} modes`);
  process.exit(failures.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
