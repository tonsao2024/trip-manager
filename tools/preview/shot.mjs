/**
 * Dev-only: wrap the jsdom snapshots in a real page (real CSS + locally built
 * Tailwind + local fonts + Lucide) and screenshot them with headless Chromium.
 *
 *   node tools/preview/shot.mjs            # every snapshot, mobile width
 *   node tools/preview/shot.mjs 1280       # desktop width
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

const here = import.meta.dirname;
const outDir = path.join(here, 'out');
const width = Number(process.argv[2] || 430);
const only = process.argv[3];
const height = width >= 1000 ? 900 : 932;

const STYLE = `
  <link rel="stylesheet" href="/node_modules/@fontsource/ibm-plex-sans-thai/400.css">
  <link rel="stylesheet" href="/node_modules/@fontsource/ibm-plex-sans-thai/500.css">
  <link rel="stylesheet" href="/node_modules/@fontsource/ibm-plex-sans-thai/600.css">
  <link rel="stylesheet" href="/node_modules/@fontsource/ibm-plex-mono/400.css">
  <link rel="stylesheet" href="/node_modules/@fontsource/ibm-plex-mono/500.css">
  <link rel="stylesheet" href="/tests/browser/out/tailwind.css">
  <link rel="stylesheet" href="/src/css/tokens.css">
  <link rel="stylesheet" href="/src/css/components.css">
  <link rel="stylesheet" href="/src/css/refresh.css">
  <link rel="stylesheet" href="/src/css/animations.css">
  <link rel="stylesheet" href="/src/css/flat.css">
  <link rel="stylesheet" href="/src/css/dimension.css">
  <style>
    body { padding-bottom: calc(var(--bottom-nav-h) + 28px + env(safe-area-inset-bottom)); background: var(--bg); }
    @media (min-width: 768px) { body { padding-bottom: 0; } .bottom-nav { display: none !important; } }
    .desktop-nav { display: none; }
    @media (min-width: 768px) { .desktop-nav { display: flex; } }
  </style>
`;

const files = fs.readdirSync(outDir).filter(f => f.endsWith('.html') && !f.endsWith('.full.html'));
const targets = only ? files.filter(f => f.startsWith(only)) : files;

for (const file of targets) {
  const body = fs.readFileSync(path.join(outDir, file), 'utf8');
  const html = `<!DOCTYPE html><html lang="th" data-theme="light"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">${STYLE}</head>
<body class="min-h-screen bg-[var(--bg)] text-[var(--text)]">
${body}
<script src="/node_modules/lucide/dist/umd/lucide.min.js"></script>
<script>try { lucide.createIcons(); } catch (e) { console.warn(e); }</script>
</body></html>`;
  fs.writeFileSync(path.join(outDir, file.replace(/\.html$/, '.full.html')), html, 'utf8');
}

const executablePath = await chromium.executablePath();
const browser = await puppeteer.launch({
  executablePath,
  args: [...chromium.args, '--no-sandbox', '--disable-dev-shm-usage'],
  env: { ...process.env, LD_LIBRARY_PATH: ['/tmp/chlibs/lib', '/tmp', process.env.LD_LIBRARY_PATH].filter(Boolean).join(':') },
  headless: 'shell'
});
const page = await browser.newPage();
await page.setViewport({ width, height, deviceScaleFactor: 1 });
await page.emulateMediaFeatures?.([{ name: 'prefers-color-scheme', value: 'light' }]);
page.on('pageerror', e => console.log('[page error]', String(e).slice(0, 200)));
const shotsDir = path.join(outDir, 'shots', String(width));
fs.mkdirSync(shotsDir, { recursive: true });

for (const file of targets) {
  const name = file.replace(/\.html$/, '');
  await page.goto(`http://127.0.0.1:8099/tools/preview/out/${name}.full.html`, { waitUntil: 'load', timeout: 40000 });
  await new Promise(r => setTimeout(r, 450));
  const full = Number(process.env.FULL_PAGE || 0) === 1;
  await page.screenshot({ path: path.join(shotsDir, `${name}.png`), fullPage: full });
  console.log('shot', path.relative(process.cwd(), path.join(shotsDir, `${name}.png`)));
}
await browser.close();
