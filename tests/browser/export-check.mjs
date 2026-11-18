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
    if (req.url().startsWith('https://esm.sh/jspdf@2.5.2')) {
      req.respond({ status: 200, contentType: 'text/javascript', body: `
        export function jsPDF(options) {
          const pdf = new window.jspdf.jsPDF(options);
          pdf.save = () => { window.__pdfPages = pdf.getNumberOfPages(); window.__pdfBytes = pdf.output('arraybuffer').byteLength; };
          return pdf;
        }` });
      return;
    }
    req.continue();
  });
  page.on('pageerror', (e) => console.log('   [page error]', e.message));

  await page.goto(`http://127.0.0.1:${PORT}/tests/browser/harness.html`, { waitUntil: 'load' });

  // Use the exact same self-hosted Google Sans Thai/Latin faces as production.
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

  await page.addScriptTag({ url: `http://127.0.0.1:${PORT}/node_modules/jspdf/dist/jspdf.umd.min.js` });
  const matrix = await page.evaluate(async () => {
    const { themeList, applyTheme, contrastRatio } = await import('/src/js/utils/themes.js');
    const { exportToPngToCanvas, exportToPdf, exportSvgToPng } = await import('/src/js/exports/index.js');
    const receipt = document.getElementById('receipt-u1');
    const title = receipt.querySelector('td');
    title.insertAdjacentHTML('afterbegin', '<div class="truncate">ค่าใช้จ่ายสำหรับการเดินทางและที่พักของสมาชิกชื่อยาวมากเป็นพิเศษ น้ำดื่ม มื้อเช้า ผู้ร่วมเดินทาง ABCDEFGHIJKLMNOPQRSTUVWXYZ</div>');
    // Long content exercises pagination rather than only a one-page sample.
    const tbody = receipt.querySelector('tbody');
    const sample = tbody.firstElementChild.outerHTML;
    tbody.insertAdjacentHTML('beforeend', sample.repeat(15));
    const original = { cls: receipt.getAttribute('class'), style: receipt.getAttribute('style') };
    const results = [];
    for (const mode of ['light', 'dark']) {
      document.documentElement.dataset.theme = mode;
      for (const theme of themeList()) {
        applyTheme(theme.id);
        receipt.classList.add('export-flat', 'export-capture');
        const rgbHex = value => {
          const rgb = value.match(/[\d.]+/g);
          return rgb && rgb.length >= 3 ? '#' + rgb.slice(0, 3).map(n => Math.round(Number(n)).toString(16).padStart(2, '0')).join('') : '#ffffff';
        };
        for (const el of receipt.querySelectorAll('b, .receipt-title, .rcpt-item-title, .rcpt-sum-note')) {
          const cs = getComputedStyle(el);
          if (contrastRatio(rgbHex(cs.color), '#ffffff') < 4.5) throw new Error(`low contrast ${theme.id}/${mode}: ${cs.color}`);
        }
        receipt.setAttribute('class', original.cls);
        const canvas = await exportToPngToCanvas(receipt, { scale: 1 });
        if (canvas.width < 600 || canvas.height < 1500) throw new Error(`clipped ${theme.id}/${mode}`);
        if (receipt.getAttribute('class') !== original.cls || receipt.getAttribute('style') !== original.style) throw new Error('capture did not restore source');
        if (document.querySelector('[data-export-clone]')) throw new Error('leaked export clone');
        results.push(`${theme.id}/${mode}`);
      }
    }
    await exportToPdf(receipt, 'matrix.pdf');
    if (!(window.__pdfPages >= 2 && window.__pdfBytes >= 1000)) throw new Error('PDF did not paginate');
    const holder = document.createElement('div');
    holder.innerHTML = `<svg class="debt-map-svg" viewBox="0 0 600 240" xmlns="http://www.w3.org/2000/svg"><rect width="600" height="240" fill="white"/><path d="M40 120 H560" stroke="#1a73e8"/><rect x="220" y="100" width="160" height="40" fill="white" stroke="#1a73e8"/><text x="300" y="125" text-anchor="middle" style="font-family:'Google Sans';font-size:18px;fill:#111827">฿1,234.00</text><text x="40" y="170" style="font-family:'Google Sans';font-size:18px;fill:#111827">ผู้จ่าย น้ำ</text></svg>`;
    document.body.append(holder);
    const svg = holder.querySelector('svg');
    const svgCanvas = await exportSvgToPng(svg, 'diagram.png', { background: '#fff' });
    if (svgCanvas.width !== 1200 || svgCanvas.height !== 480) throw new Error('SVG export used responsive size rather than viewBox');
    const htmlCanvas = await exportToPngToCanvas(holder, { scale: 1 });
    if (!htmlCanvas.width) throw new Error('embedded SVG capture failed');
    holder.remove();
    return { themes: results.length, pages: window.__pdfPages, pdfBytes: window.__pdfBytes };
  });
  console.log('  ✓ theme matrix / long Thai text / source restoration:', matrix);
  await page.emulateMediaType('print');
  await page.pdf({ path: path.join(outDir, 'native-print.pdf'), preferCSSPageSize: true, printBackground: true });
  console.log('  ✓ native print PDF generated');

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
