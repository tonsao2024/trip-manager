/**
 * Dev-only: “ก่อน → หลัง” screenshots for the mobile UX rounds.
 *
 *   v22 (7 Oct 2026)
 *   1. แผนการเดินทางบนมือถือ — การ์ดแต่ละสถานที่เคยตกขอบจอด้านขวา
 *      (before is reproduced by disabling the fix through an injected override).
 *   2. หน้า ค่าใช้จ่าย — กดแก้ไขแล้วเป็นป๊อปอัป ไม่เด้งเปลี่ยนหน้า
 *   3. หน้า เพิ่มค่าใช้จ่าย — ปุ่มบันทึกลอยตามการเลื่อนหน้าจอ
 *
 *   v23 (7 Oct 2026)
 *   4. แผนการเดินทาง — มุมมองกระทัดรัด: การ์ดเหลือเฉพาะข้อมูลที่สำคัญ
 *      (ลำดับ เวลา ชื่อ หมวด สถานะ ค่าใช้จ่าย ปุ่มนำทาง) → จอเดียวเห็นสถานที่
 *      มากขึ้นกว่าสองเท่า
 *
 * It renders the REAL app in the REAL browser (same stubs/build as
 * tests/browser/mobile-check.mjs) at iPhone 16 Pro size, so the pictures show the
 * shipped CSS and the shipped code, not a mock.
 *
 *   node tools/preview/ux-shots.mjs         # writes docs/preview/{before,after}/*.png
 *
 * Output is committed (docs/), the build itself lands in the gitignored
 * tests/browser/out/.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { appDir, outRoot } from '../../tests/browser/mobile-build.mjs';

const here = import.meta.dirname;
const root = path.resolve(here, '../..');
const beforeDir = path.join(root, 'docs', 'preview', 'before');
const afterDir = path.join(root, 'docs', 'preview', 'after');
const PORT = Number(process.env.V22_PORT || 8099);
// iPhone 16 Pro — the screen the owner reported (“ไอโฟน 16 โปร”).
const DEVICE = { width: 402, height: 874 };

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2'
};

/** The real page, with the CDN bits swapped for the sandbox-friendly copies. */
function buildPage() {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
    .replace(/<script src="https:\/\/cdn\.tailwindcss\.com"><\/script>/, '')
    .replace(/<script>\s*tailwind\.config[\s\S]*?<\/script>/, '')
    .replace(/<link href="https:\/\/fonts\.googleapis\.com[^>]*>/, '')
    .replace(/<script src="https:\/\/cdn\.jsdelivr\.net[^>]*><\/script>/, '')
    .replace(/<script type="importmap">[\s\S]*?<\/script>/, '')
    .replace(/<script type="module" src="\.\/src\/js\/app\.js\?v=\d+"><\/script>/,
      '<script type="module" src="/tests/browser/mobile-driver.js"></script>')
    .replace(/\.\/src\/css\//g, '/src/css/')
    .replace('</head>', '<link rel="stylesheet" href="/tests/browser/out/tailwind.css"></head>');
  fs.writeFileSync(path.join(outRoot, 'v22.html'), html);
  return html;
}

function serve() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent((req.url || '/').split('?')[0]);
      const file = url === '/' ? path.join(outRoot, 'v22.html') : path.join(root, url);
      if (!file.startsWith(root)) { res.writeHead(403).end('no'); return; }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404).end('missing'); return; }
        res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.on('error', reject);
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

buildPage();

const chromium = (await import('@sparticuz/chromium')).default;
const puppeteer = (await import('puppeteer-core')).default;
const thaiFontDir = path.join(root, 'node_modules', '@fontsource', 'noto-sans-thai', 'files');
const thaiCss = [400, 600, 700, 800].map(w => {
  const file = path.join(thaiFontDir, `noto-sans-thai-thai-${w}-normal.woff2`);
  if (!fs.existsSync(file)) return '';
  return `@font-face{font-family:'Noto Sans Thai Check';font-style:normal;font-weight:${w};src:url(data:font/woff2;base64,${fs.readFileSync(file).toString('base64')}) format('woff2');}`;
}).join('');

fs.mkdirSync(beforeDir, { recursive: true });
fs.mkdirSync(afterDir, { recursive: true });

const browser = await puppeteer.launch({
  args: [...chromium.args, '--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
  executablePath: await chromium.executablePath(),
  headless: true,
  env: { ...process.env, LD_LIBRARY_PATH: ['/tmp/al2023/lib', process.env.LD_LIBRARY_PATH || ''].filter(Boolean).join(':') }
});
const server = await serve();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function shot({ name, dir = afterDir, hash, prepare = null, inject = '', caret = null, fullPage = false }) {
  const page = await browser.newPage();
  await page.setViewport({ ...DEVICE, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  if (thaiCss) await page.addStyleTag({ content: `${thaiCss}*, *::before, *::after { font-family: 'Noto Sans Thai Check', system-ui, sans-serif !important; }` });
  await page.waitForFunction(() => window.__mobile?.ready, { timeout: 30000 });
  await page.evaluate((h) => window.__mobile.goto(h), hash);
  if (inject) await page.addStyleTag({ content: inject });
  if (prepare) await page.evaluate(prepare);
  await sleep(700);
  if (caret) {   // park the sticky bar where the shot can show it clearly
    await page.evaluate((sel) => { const el = document.querySelector(sel); el?.scrollIntoView({ block: 'center' }); }, caret);
    await sleep(500);
  }
  const file = path.join(dir, name);
  await page.screenshot({ path: file, fullPage });
  // How wide the widest panel of the page is (the number that says “ตกขอบหรือยัง”):
  // `document.scrollWidth` stays at the viewport width because body clips its overflow.
  const stats = await page.evaluate(() => {
    const all = [
      ...document.querySelectorAll('#itin-layout > *'),
      ...document.querySelectorAll('#itinerary-list, .itin-card, #itin-datebar, #notes-card, #expense-form, .expense-form .form-submit-row')
    ].filter(el => el.getBoundingClientRect().width > 0 && !el.closest('.export-sheet-wrap'));
    const widest = all.reduce((max, el) => Math.max(max, el.getBoundingClientRect().width), 0);
    return { vw: window.innerWidth, doc: document.documentElement.scrollWidth, widest: Math.round(widest) };
  });
  console.log(`  ${path.relative(root, file)}  (viewport ${stats.vw}px, widest panel ${stats.widest}px)`);
  await page.close();
  return stats;
}

/** Disables the v22 phone fix so the old, overflowing layout can be photographed. */
const OLD_PHONE_LAYOUT = `
@media (max-width: 1023px) {
  #itin-layout.itin-layout { align-items: start !important; }
  #itin-layout.itin-layout > * { width: max-content !important; max-width: none !important; }
}`;

console.log('\n— ก่อน → หลัง / เปรียบเทียบมุมมอง (iPhone 16 Pro 402×874) —');

// 1) แผนการเดินทาง — before (the fix turned off) vs after.
const planPrepare = () => window.__mobile.tap('#date-chips [data-date]');
const planShot = { hash: '#/trip/t1/itinerary', prepare: planPrepare, caret: '#itinerary-list' };
const before = await shot({ ...planShot, name: 'v22-itinerary-overflow.png', dir: beforeDir, inject: OLD_PHONE_LAYOUT });
const after = await shot({ ...planShot, name: 'v22-itinerary-phone.png' });
if (before.widest > DEVICE.width + 1 && after.widest <= DEVICE.width + 1) {
  console.log(`  ✓ fix confirmed: the plan's panels are ${before.widest}px wide before and ${after.widest}px after (screen ${DEVICE.width}px)`);
} else {
  console.log(`  ⚠ unexpected: widest panel before=${before.widest}px after=${after.widest}px`);
}

// 2) ค่าใช้จ่าย — กดแก้ไข = ป๊อปอัป (no route change).
await shot({
  name: 'v22-expense-popup.png',
  hash: '#/trip/t1/expenses',
  prepare: () => window.__mobile.tap('.expense-card')
});

// 3) เพิ่มค่าใช้จ่าย — ปุ่มบันทึกลอยอยู่เหนือแถบเมนูล่าง.
await shot({
  name: 'v22-expense-sticky-save.png',
  hash: '#/trip/t1/expenses/add',
  caret: '#ex-payer-tiles'
});

// 4) แผนการเดินทาง — มุมมองกระทัดรัด เทียบกับมุมมองปกติ.
//    Both shots come from the real app; the density preference is per device and
//    survives a page load, so each shot sets it explicitly (and the pair always
//    shows a real comparison).
const openPlan = async () => {
  const page = await browser.newPage();
  await page.setViewport({ ...DEVICE, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  if (thaiCss) await page.addStyleTag({ content: `${thaiCss}*, *::before, *::after { font-family: 'Noto Sans Thai Check', system-ui, sans-serif !important; }` });
  await page.waitForFunction(() => window.__mobile?.ready, { timeout: 30000 });
  await page.evaluate(() => window.__mobile.goto('#/trip/t1/itinerary'));
  await page.evaluate(() => window.__mobile.tap('#date-chips [data-date]'));
  await sleep(600);
  return page;
};
/** One place card's height with the plan in the requested density. */
const cardHeight = async (compact) => {
  const page = await openPlan();
  const h = await page.evaluate((wantCompact) => {
    if (document.getElementById('itin-layout')?.classList.contains('itin-compact') !== wantCompact) {
      document.getElementById('itin-density-btn')?.click();
    }
    const card = document.querySelector('.itin-card');
    return Math.round(card?.getBoundingClientRect().height || 0);
  }, compact);
  await page.close();
  return h;
};

{
  // Comfortable view (whatever this browser profile remembered is reset first).
  const page = await openPlan();
  await page.evaluate(() => {
    if (document.getElementById('itin-layout')?.classList.contains('itin-compact')) document.getElementById('itin-density-btn')?.click();
  });
  await page.evaluate(() => document.querySelector('#itinerary-list')?.scrollIntoView({ block: 'start' }));
  await sleep(500);
  await page.screenshot({ path: path.join(afterDir, 'v23-itinerary-comfortable.png') });
  console.log('  docs/preview/after/v23-itinerary-comfortable.png');
  await page.close();
}
const comfortableCard = await cardHeight(false);
const compactCard = await cardHeight(true);
{
  const page = await openPlan();
  await page.evaluate(() => {
    if (!document.getElementById('itin-layout')?.classList.contains('itin-compact')) document.getElementById('itin-density-btn')?.click();
  });
  await page.evaluate(() => document.querySelector('#itinerary-list')?.scrollIntoView({ block: 'start' }));
  await sleep(500);
  await page.screenshot({ path: path.join(afterDir, 'v23-itinerary-compact.png') });
  console.log('  docs/preview/after/v23-itinerary-compact.png');
  await page.close();
}
if (compactCard && comfortableCard && compactCard < comfortableCard) {
  console.log(`  ✓ มุมมองกระทัดรัด: การ์ดหนึ่งสถานที่ ${comfortableCard}px → ${compactCard}px (จอเดียวเห็นได้มากขึ้น ${(comfortableCard / compactCard).toFixed(1)}×)`);
} else {
  console.log(`  ⚠ unexpected card heights: comfortable=${comfortableCard}px compact=${compactCard}px`);
}

await browser.close();
server.close();
console.log('\n✅ screenshots written — docs/preview/{before,after}/\n');
void execFileSync; void appDir;
