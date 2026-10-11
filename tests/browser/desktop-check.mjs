// Desktop-layout check (optional dev tool, twin of mobile-check.mjs).
//
// Owners review the app on computers too, so this renders the real app in a
// real Chromium at laptop/desktop widths and measures the three contracts
// agreed on 11 Oct 2026:
//  1) the countdown scene fills its dashboard card (no dead band under it),
//  2) every debt-map line uses the RECEIVER's colour,
//  3) the top menu shows all 8 items at once — no overlap, no hidden scroll.
//
// Run it with:
//   npm install --no-save jsdom puppeteer-core @sparticuz/chromium tailwindcss@3 dayjs xlsx@0.18.5
//   node tests/browser/mobile-build.mjs
//   node tests/browser/desktop-check.mjs
// Screenshots land in tests/browser/out/desktop/ (gitignored).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const here = import.meta.dirname;                 // tests/browser
const root = path.resolve(here, '../..');         // repo root
const outRoot = path.join(here, 'out');
const PORT = Number(process.env.DESKTOP_PORT || 8099);
const shotDir = path.join(outRoot, 'desktop');
fs.mkdirSync(shotDir, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml'
};

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

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** index.html with the CDN bits replaced by local copies (same as mobile-check). */
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
  fs.mkdirSync(outRoot, { recursive: true });
  fs.writeFileSync(path.join(outRoot, 'mobile.html'), html);
}

async function main() {
  const chromium = (await import('@sparticuz/chromium')).default;
  const puppeteer = (await import('puppeteer-core')).default;
  const browser = await puppeteer.launch({
    args: [...chromium.args, '--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
    executablePath: await chromium.executablePath(),
    headless: true,
    env: { ...process.env, LD_LIBRARY_PATH: ['/tmp/al2023/lib', process.env.LD_LIBRARY_PATH || ''].filter(Boolean).join(':') }
  });
  buildPage();
  const server = await serve();
  const widths = [1024, 1280, 1440];
  const report = {};

  for (const width of widths) {
    const page = await browser.newPage();
    await page.setViewport({ width, height: 950, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
    await page.evaluateOnNewDocument(() => { try { localStorage.setItem('fuji_theme', 'dark'); } catch {} });
    page.on('pageerror', e => console.log(`   [page error] ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') console.log(`   [console.error] ${m.text().slice(0, 160)}`); });
    page.on('requestfailed', r => console.log('   [req failed]', r.url().replace(`http://127.0.0.1:${PORT}`, ''), r.failure()?.errorText));
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__mobile?.ready, { timeout: 30000 });

    // ---- dashboard: countdown fill + nav geometry ----
    await page.evaluate(() => window.__mobile.goto('#/trip/t1/dashboard'));
    await sleep(1500);
    // Simulate a tall neighbour card (like the real weather widget) so the
    // grid stretch — and our fill fix — is actually exercised.
    await page.evaluate(() => { document.getElementById('dash-weather-card').style.minHeight = '430px'; });
    await sleep(400);
    report[width] = await page.evaluate(() => {
      const nav = document.getElementById('desktop-nav');
      const navRect = nav.getBoundingClientRect();
      const items = [...nav.querySelectorAll('.menu-item')].map(a => {
        const r = a.getBoundingClientRect();
        const short = getComputedStyle(a.querySelector('.menu-item-label-short')).display !== 'none';
        return { label: (short ? a.querySelector('.menu-item-label-short') : a.querySelector('.menu-item-label')).textContent, left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top) };
      });
      let overlap = false;
      for (let i = 1; i < items.length; i++) {
        if (items[i].top === items[i - 1].top && items[i].left < items[i - 1].right - 1) overlap = true;
      }
      const card = document.querySelector('[data-dashboard-widget="countdown"] > .card').getBoundingClientRect();
      const scene = document.querySelector('[data-dashboard-widget="countdown"] .countdown-scene').getBoundingClientRect();
      return {
        headerH: Math.round(document.getElementById('app-header').getBoundingClientRect().height),
        menu: items.map(i => i.label),
        menuCount: items.length,
        menuOverlap: overlap,
        menuScrolls: nav.scrollWidth > nav.clientWidth + 1,
        menuAllInside: items.every(i => i.left >= navRect.left - 1 && i.right <= navRect.right + 1),
        countdownCardH: Math.round(card.height),
        countdownSceneH: Math.round(scene.height),
        deadBand: Math.round(card.bottom - scene.bottom),
        docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    });
    await page.screenshot({ path: path.join(shotDir, `dash-${width}.png`), clip: { x: 0, y: 0, width, height: 760 } });

    // ---- settlement → debt map: edge colour must equal receiver node colour ----
    await page.evaluate(() => window.__mobile.goto('#/trip/t1/settlement'));
    await sleep(900);
    await page.evaluate(() => window.__mobile.tap('#settle-views [data-view="debt-map"]'));
    await sleep(900);
    report[width].debtMap = await page.evaluate(() => {
      const svg = document.querySelector('.debt-map-svg');
      if (!svg) return { missing: true };
      const nodeFill = new Map();
      svg.querySelectorAll('.debt-map-node').forEach(n => {
        const circles = n.querySelectorAll('circle');
        nodeFill.set(n.dataset.member, circles[1]?.getAttribute('fill'));
      });
      const bad = [];
      const edges = [...svg.querySelectorAll('.debt-map-edge')].map(e => {
        const [from, to] = (e.dataset.edge || '').split('→');
        const stroke = e.querySelector('path').getAttribute('stroke');
        if (stroke !== nodeFill.get(to)) bad.push({ edge: e.dataset.edge, stroke, receiver: nodeFill.get(to) });
        return { edge: e.dataset.edge, stroke };
      });
      const card = document.querySelector('.debt-map-card');
      return { edges, bad, legend: document.querySelector('.debt-legend-item--unique')?.textContent.trim() };
    });
    await page.screenshot({ path: path.join(shotDir, `debtmap-${width}.png`), fullPage: false });
    await page.close();
  }

  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  server.close();
}
main();
