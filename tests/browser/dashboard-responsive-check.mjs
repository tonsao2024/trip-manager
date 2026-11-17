// Responsive dashboard regression: real app with Firebase/CDN stubs.
// Run npm run test:browser:build, then npm run test:browser:dashboard.
// Uses viewport geometry, not device-specific hardware or live weather data.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const here = import.meta.dirname;                 // tests/browser
const root = path.resolve(here, '../..');         // repo root
const outRoot = path.join(here, 'out');
const PORT = Number(process.env.DASHBOARD_PORT || 8100);
const shotDir = path.join(outRoot, 'dashboard');
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
        if (url === '/tests/browser/mobile-driver.js') data = Buffer.from(data.toString().replace("name: 'ทริปฟูจิ 2027',", "coverImage: '/public/favicon-512.png', name: 'ทริปฟูจิ 2027',"));
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
    .replace(/<link[^>]*href="https:\/\/fonts\.googleapis\.com[^>]*>/g, '')
    .replace(/<script src="https:\/\/cdn\.jsdelivr\.net[^>]*><\/script>/, '')
    .replace(/<script type="importmap">[\s\S]*?<\/script>/, '')
    .replace(/<script type="module" src="\.\/src\/js\/app\.js\?v=\d+[^\"]*"><\/script>/,
      '<script type="module" src="/tests/browser/mobile-driver.js"></script>')
    .replace(/\.\/src\/css\//g, '/src/css/')
    .replace('</head>', '<link rel="stylesheet" href="/tests/browser/out/tailwind.css"></head>');
  fs.mkdirSync(outRoot, { recursive: true });
  fs.writeFileSync(path.join(outRoot, 'mobile.html'), html);
}


async function inspect(page, width, state) {
  const result = await page.evaluate(() => {
    const board = document.querySelector('#dashboard-board');
    const nodes = [...board.querySelectorAll(':scope > [data-dashboard-widget]:not(.is-hidden), :scope > #dash-add-tile:not(.hidden)')];
    const rects = nodes.map(el => { const r = el.getBoundingClientRect(); return {name: el.dataset.dashboardWidget || 'add', left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height}; });
    const overlaps = [];
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      if (Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1) overlaps.push([a.name,b.name]);
    }
    const cover = document.querySelector('.dash-cover')?.getBoundingClientRect();
    const title = document.querySelector('.dash-head-main')?.getBoundingClientRect();
    return {overlaps, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      outside: rects.filter(r => r.left < -1 || r.right > innerWidth + 1 || r.width < 1 || r.height < 1).map(r=>r.name),
      count: rects.length, boardWidth: board.getBoundingClientRect().width, cover: cover && {width: cover.width,height:cover.height,bottom:cover.bottom}, titleTop:title?.top,
      columns: getComputedStyle(board).gridTemplateColumns, rects};
  });
  const failures = [];
  if (state === 'hidden-card' && !result.rects.some(r => r.name === 'add')) failures.push('add tile missing');
  if (result.overlaps.length) failures.push(`overlap ${JSON.stringify(result.overlaps)}`);
  if (result.overflow > 1) failures.push(`horizontal overflow ${result.overflow}px`);
  if (result.outside.length) failures.push(`outside/empty ${result.outside.join(',')}`);
  if (!result.cover || result.cover.width < result.boardWidth - 2 || result.cover.bottom > result.titleTop + 1) failures.push('cover not above title or too narrow');
  console.log(`${width}px ${state}: ${failures.length ? 'FAIL '+failures.join('; ') : 'PASS'} (${result.count} cards, grid ${result.columns}, overflow ${result.overflow}px)`);
  return {width,state,...result,failures};
}
async function main() {
  const chromium = (await import('@sparticuz/chromium')).default;
  const puppeteer = (await import('puppeteer-core')).default;
  const browser = await puppeteer.launch({ args:[...chromium.args, '--no-sandbox', '--disable-dev-shm-usage'], executablePath:await chromium.executablePath(), headless:true,
    env:{...process.env, LD_LIBRARY_PATH:['/tmp/al2023/lib',process.env.LD_LIBRARY_PATH || ''].filter(Boolean).join(':')} });
  buildPage(); const server = await serve(); const report = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({width:375,height:812});
    await page.goto(`http://127.0.0.1:${PORT}/`, {waitUntil:'load'});
    await page.waitForFunction(() => window.__mobile?.ready, {timeout:30000});
    await page.evaluate(() => window.__mobile.goto('#/trip/t1/dashboard'));
    await sleep(1800);
    for (const width of [320,360,375,390,414,480,600,760,761,767,768,820,1024,1280,1440,1920,2560]) {
      await page.setViewport({width,height:900}); await sleep(350);
      report.push(await inspect(page,width,'default'));
    }
    // Hide a card via the real picker, so the real add button and persistence path run.
    await page.click('#dash-more-btn'); await page.click('#dash-widgets-btn');
    await page.click('#dash-pick-list [data-pick="weather"]');
    await page.click('#dash-pick-done'); await sleep(500);
    for (const width of [320,375,760,761,768,1024,1440,1920]) {
      await page.setViewport({width,height:900}); await sleep(350);
      report.push(await inspect(page,width,'hidden-card'));
    }
    // Simulate an asynchronous weather/list card growing after first paint.
    await page.setViewport({width:1280,height:900});
    await page.evaluate(() => { document.querySelector('[data-dashboard-widget=\"category\"] > .card').style.minHeight = '650px'; });
    await sleep(500); report.push(await inspect(page,1280,'grown-card'));
    // Arrange mode uses normal flow rather than masonry.
    await page.click('#dash-more-btn'); await page.click('#dash-layout-edit-btn'); await sleep(300);
    for (const width of [375,760,761,768,1280]) {
      await page.setViewport({width,height:900}); await sleep(350);
      report.push(await inspect(page,width,'arrange'));
    }
    await page.click('#dash-layout-done'); await sleep(350);
    report.push(await inspect(page,1280,'after-arrange'));
    await page.click('#dash-add-tile'); await page.click('#dash-pick-list [data-pick=\"weather\"]');
    await page.click('#dash-pick-done'); await sleep(500);
    report.push(await inspect(page,1280,'restored-card'));
    fs.writeFileSync(path.join(shotDir,'report.json'), JSON.stringify(report,null,2));
    if (report.some(r=>r.failures.length)) process.exitCode=1;
  } finally { await browser.close(); server.close(); }
}
main().catch(e => { console.error(e); process.exitCode=1; });
