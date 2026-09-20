// Real-browser check for the PNG export pipeline (optional dev tool).
//
// The jsdom smoke test proves the wiring; this script proves the actual thing a
// user experiences: a real Chromium renders the app's real CSS (which is full of
// color-mix()/oklch(), i.e. `color(srgb …)` once computed) and html2canvas 1.4.1
// runs the app's real export pipeline on it. If the pipeline ever regresses, this
// throws the exact "Attempting to parse an unsupported color function" error.
//
// Run it with:
//   npm install --no-save jsdom dayjs xlsx puppeteer-core @sparticuz/chromium html2canvas
//   node tests/browser/export-check.mjs
//
// It needs a Chromium that `puppeteer-core` can launch (the @sparticuz build is
// used here because it comes from npm) and writes the exported PNGs to
// tests/browser/out/ so the result can be eyeballed.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const outDir = path.join(root, 'tests', 'browser', 'out');
const PORT = Number(process.env.HARNESS_PORT || 8099);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

const html2canvasDist = path.join(root, 'node_modules', 'html2canvas', 'dist', 'html2canvas.esm.js');

function serve(port = PORT) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent((req.url || '/').split('?')[0]);
      const file = path.join(root, url === '/' ? 'tests/browser/harness.html' : url);
      if (!file.startsWith(root)) { res.writeHead(403).end('no'); return; }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404).end('missing'); return; }
        res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

async function main() {
  if (!fs.existsSync(html2canvasDist)) {
    console.error('✗ html2canvas is not installed — run: npm install --no-save html2canvas');
    process.exit(1);
  }
  let chromium, puppeteer;
  try {
    chromium = (await import('@sparticuz/chromium')).default;
    puppeteer = (await import('puppeteer-core')).default;
  } catch {
    console.error('✗ puppeteer-core/@sparticuz/chromium missing — see the header of this file.');
    process.exit(1);
  }

  // The app imports html2canvas from esm.sh; the sandbox has no CDN access, so
  // that request is fulfilled from the npm package (same version, same code).
  const html2canvasSource = fs.readFileSync(html2canvasDist, 'utf8');

  const exe = await chromium.executablePath();
  const browser = await puppeteer.launch({
    args: [...chromium.args, '--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
    executablePath: exe,
    headless: true,
    env: { ...process.env, LD_LIBRARY_PATH: ['/tmp/al2023/lib', process.env.LD_LIBRARY_PATH || ''].filter(Boolean).join(':') }
  });

  const server = await serve();
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1000, deviceScaleFactor: 1 });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (req.url().startsWith('https://esm.sh/html2canvas@1.4.1')) {
      req.respond({ status: 200, contentType: 'text/javascript; charset=utf-8', body: html2canvasSource });
      return;
    }
    req.continue();
  });
  page.on('pageerror', (e) => console.log('   [page error]', e.message));

  await page.goto(`http://127.0.0.1:${PORT}/tests/browser/harness.html`, { waitUntil: 'load' });

  // Sandbox fonts are Latin-only; add a Thai face just for this check so the
  // rendered PNG can be eyeballed. (Real devices already have Thai fonts.)
  const thaiFontDir = path.join(root, 'node_modules', '@fontsource', 'noto-sans-thai', 'files');
  if (fs.existsSync(thaiFontDir)) {
    const face = (weight) => {
      const file = path.join(thaiFontDir, `noto-sans-thai-thai-${weight}-normal.woff2`);
      if (!fs.existsSync(file)) return '';
      const b64 = fs.readFileSync(file).toString('base64');
      return `@font-face{font-family:'Noto Sans Thai Check';font-style:normal;font-weight:${weight};src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
    };
    const css = [400, 600, 700, 800].map(face).join('').replace(/font-weight:(\d+)/g, 'font-weight:$1');
    await page.addStyleTag({ content: css + `*, *::before, *::after { font-family: 'Noto Sans Thai Check', system-ui, sans-serif !important; }` });
  }
  await page.waitForFunction(() => window.__harnessResult, { timeout: 60000 });
  const result = await page.evaluate(() => window.__harnessResult);

  console.log('\n— environment —');
  console.log('  computed color-mix →', result.modernBefore.probeComputed);
  console.log('  modern colours found in the receipt before export:', JSON.stringify(result.modernBefore.receipt));
  console.log('  modern colours found in the itinerary sheet before export:', JSON.stringify(result.modernBefore.sheet));
  console.log('\n— exports —');
  for (const s of result.steps) console.log('  ✓', s);
  for (const e of result.errors) console.log('  ✗', e);

  fs.mkdirSync(outDir, { recursive: true });
  for (const [kind, data] of Object.entries(result.dataUrls)) {
    const target = path.join(outDir, `${kind}.png`);
    fs.writeFileSync(target, Buffer.from(String(data.url).split(',')[1], 'base64'));
    console.log(`  → ${path.relative(root, target)} (${data.width}×${data.height})`);
  }

  await browser.close();
  server.close();

  const failed = result.errors.length > 0
    || !result.dataUrls.receipt
    || !result.dataUrls.itinerary
    || result.dataUrls.receipt.width < 400;
  console.log(`\n${failed ? '❌ real-browser export check FAILED' : '✅ real-browser export check passed'}`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
