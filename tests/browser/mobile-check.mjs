// Phone-layout check (optional dev tool).
//
// Reports clamp their problems on real phones: "หน้าจอ iPhone Pro Max แสดงผลไม่
// สมบูรณ์" and "ชื่อ user แสดงไม่ครบ". This script renders the real app in a real
// Chromium at iPhone Pro Max size, on every route, and measures what actually
// happens: horizontal overflow, elements wider than the viewport, screen
// screenshots in tests/browser/out/mobile/.
//
// Run it with:
//   npm install --no-save jsdom puppeteer-core @sparticuz/chromium tailwindcss dayjs
//   node tests/browser/mobile-check.mjs           # all devices
//   node tests/browser/mobile-check.mjs 430x932   # one size
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { appDir, outRoot } from './mobile-build.mjs';

const here = import.meta.dirname;
const root = path.resolve(here, '../..');
const shotDir = path.join(outRoot, 'mobile');
const PORT = Number(process.env.MOBILE_PORT || 8098);

// iPhone 16 Pro Max is 440×956, 14 Pro Max 430×932, SE 375×667 — the small end
// of the range is where a layout usually breaks.
const DEVICES = [
  { id: 'iphone-16-pro-max', width: 440, height: 956, dsf: 3 },
  { id: 'iphone-14-pro-max', width: 430, height: 932, dsf: 3 },
  { id: 'iphone-se', width: 375, height: 667, dsf: 2 }
];

const ROUTES = [
  ['dashboard', '#/trip/t1/dashboard'],
  ['itinerary', '#/trip/t1/itinerary'],
  ['expenses', '#/trip/t1/expenses'],
  ['expenses-day', '#/trip/t1/expenses', '#expense-group-toggle [data-group="day"]'],
  ['expense-add', '#/trip/t1/expenses/add'],
  ['settlement', '#/trip/t1/settlement'],
  ['settlement-receipts', '#/trip/t1/settlement', '#settle-views [data-view="receipts"]'],
  ['members', '#/trip/t1/members', null, '#members-list'],
  ['member-form', '#/trip/t1/members', '#add-member-btn'],
  ['documents', '#/trip/t1/documents'],
  ['more', '#/trip/t1/more'],
  ['settings', '#/trip/t1/settings']
];

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml'
};

/** index.html with the CDN bits replaced by local copies. */
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
    // The CDN script injects its <style> at the end of <head> at runtime, so the
    // utilities come after the app stylesheet. Reproduce that order here.
    .replace('</head>', '<link rel="stylesheet" href="/tests/browser/out/tailwind.css"></head>');
  fs.mkdirSync(outRoot, { recursive: true });
  fs.writeFileSync(path.join(outRoot, 'mobile.html'), html);
  return html;
}

function serve() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent((req.url || '/').split('?')[0]);
      const file = url === '/' ? path.join(outRoot, 'mobile.html') : path.join(root, url);
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

async function main() {
  const wanted = process.argv[2];
  const devices = wanted
    ? (() => { const [w, h] = wanted.split('x').map(Number); return [{ id: `custom-${w}x${h}`, width: w, height: h, dsf: 2 }]; })()
    : DEVICES;

  const chromium = (await import('@sparticuz/chromium')).default;
  const puppeteer = (await import('puppeteer-core')).default;

  const thaiFontDir = path.join(root, 'node_modules', '@fontsource', 'noto-sans-thai', 'files');
  const thaiCss = [400, 600, 700, 800].map(w => {
    const file = path.join(thaiFontDir, `noto-sans-thai-thai-${w}-normal.woff2`);
    if (!fs.existsSync(file)) return '';
    return `@font-face{font-family:'Noto Sans Thai Check';font-style:normal;font-weight:${w};src:url(data:font/woff2;base64,${fs.readFileSync(file).toString('base64')}) format('woff2');}`;
  }).join('');

  const browser = await puppeteer.launch({
    args: [...chromium.args, '--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
    executablePath: await chromium.executablePath(),
    headless: true,
    env: { ...process.env, LD_LIBRARY_PATH: ['/tmp/al2023/lib', process.env.LD_LIBRARY_PATH || ''].filter(Boolean).join(':') }
  });

  fs.mkdirSync(shotDir, { recursive: true });
  const server = await serve();
  const problems = [];

  for (const device of devices) {
    const page = await browser.newPage();
    await page.setViewport({ width: device.width, height: device.height, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await page.setRequestInterception(true);
    page.on('request', (req) => req.continue());
    page.on('pageerror', (e) => console.log(`   [page error] ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`   [console.${m.type()}]`, m.text().slice(0, 200)); });
    page.on('requestfailed', (r) => console.log('   [req failed]', r.url().replace('http://127.0.0.1:8098',''), r.failure()?.errorText));
    page.on('response', (r) => { if (r.status() >= 400) console.log('   [http', r.status() + ']', r.url().replace('http://127.0.0.1:8098','')); });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
    if (thaiCss) {
      await page.addStyleTag({ content: `${thaiCss}*, *::before, *::after { font-family: 'Noto Sans Thai Check', system-ui, sans-serif !important; }` });
    }
    await page.waitForFunction(() => window.__mobile?.ready, { timeout: 30000 });

    console.log(`\n— ${device.id} (${device.width}×${device.height}) —`);
    for (const [name, hash, tap, scrollTo] of ROUTES) {
      await page.evaluate((h) => window.__mobile.goto(h), hash);
      if (tap) await page.evaluate((sel) => window.__mobile.tap(sel), tap);
      if (scrollTo) {
        await page.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: 'start' }), scrollTo);
        await new Promise(r => setTimeout(r, 300));
      }
      const info = await page.evaluate(() => window.__mobile.overflow({ limit: 4 }));
      const audit = await page.evaluate(() => window.__mobile.audit());
      // On a phone the layout viewport must equal the visible width, otherwise the
      // browser zooms the page out and the right edge of every screen is cut off.
      const zoomed = info.layoutWidth > device.width + 1;
      const flag = zoomed || info.bad.length || audit.length ? '✗' : '✓';
      const detail = [...info.bad.map(b => `${b.sel}(+${b.over})`), ...audit].join(', ');
      console.log(`  ${flag} ${name.padEnd(12)} viewport=${info.layoutWidth}/${device.width}${detail ? ' ← ' + detail : ''}`);
      if (zoomed) problems.push(`${device.id}/${name}: the page is zoomed out (${info.layoutWidth} > ${device.width}) — content wider than the screen`);
      audit.forEach(a => problems.push(`${device.id}/${name}: ${a}`));
      const file = path.join(shotDir, `${device.id}-${name}.png`);
      await page.screenshot({ path: file, fullPage: false });
      // Close any sheet this step opened so the next screen starts clean.
      await page.evaluate(() => document.querySelector('.bottom-sheet-backdrop')?.click());
      await new Promise(r => setTimeout(r, 300));
    }
    await page.close();
  }

  // ---- desktop sanity: the name must come back when there is room for it ----
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
    if (thaiCss) {
      await page.addStyleTag({ content: `${thaiCss}*, *::before, *::after { font-family: 'Noto Sans Thai Check', system-ui, sans-serif !important; }` });
    }
    await page.waitForFunction(() => window.__mobile?.ready, { timeout: 30000 });
    await page.evaluate(() => window.__mobile.goto('#/trip/t1/dashboard'));
    const desk = await page.evaluate(() => {
      const el = document.getElementById('user-display-name');
      return {
        shown: !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0,
        text: (el?.textContent || '').trim(),
        layout: window.innerWidth, client: document.documentElement.clientWidth
      };
    });
    console.log(`\n— desktop 1280×900 —`);
    console.log(`  ${desk.shown ? '✓' : '✗'} header name visible again (${desk.text || 'empty'}) layout=${desk.layout}/${desk.client}`);
    if (!desk.shown) problems.push('desktop: the user name is hidden even on a wide screen');
    if (desk.layout > desk.client + 1) problems.push('desktop: the page is wider than the window');
    await page.screenshot({ path: path.join(shotDir, 'desktop-dashboard.png') });
    await page.close();
  }

  await browser.close();
  server.close();

  console.log(`\n${problems.length ? '❌' : '✅'} mobile layout check ${problems.length ? 'found problems' : 'passed'} — screenshots in tests/browser/out/mobile/`);
  problems.forEach(p => console.log(`  - ${p}`));
  process.exit(problems.length ? 1 : 0);
}

buildPage();
main().catch(e => { console.error(e); process.exit(2); });
