// Regression check: real toast component + production CSS cascade, including a
// live mode change while notifications are visible. Run: npm run test:browser:toast-theme
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

const root = path.resolve(import.meta.dirname, '../..');
const index = await fs.readFile(path.join(root, 'index.html'), 'utf8');
// Preserve the exact production order, including Tailwind and the last skin.
const styles = [...index.matchAll(/<link rel="stylesheet" href="\.\/(src\/css\/[^\"]+)"/g)]
  .map(([, href]) => `<link rel="stylesheet" href="/${href}">`).join('\n');
assert(styles.includes('material.css') && styles.includes('flat.css'));
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html' }).end(`<!doctype html><html><head>${styles}<style>*,*::before,*::after{animation:none!important;transition:none!important}</style></head><body></body></html>`);
    return;
  }
  const file = path.resolve(root, `.${url.pathname}`);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try {
    const body = await fs.readFile(file);
    res.writeHead(200, { 'content-type': file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await puppeteer.launch({ args: [...chromium.args, '--no-sandbox'], executablePath: await chromium.executablePath(), headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 1200 });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.evaluate(async () => {
    const { toast } = await import('/src/js/components/toast.js');
    toast.success('บันทึกแล้ว');
    toast.error('เชื่อมต่อไม่ได้', 'ข้อผิดพลาด', () => {});
    toast.warning('คำเตือน');
    toast.info('แจ้งเตือน');
    toast.loading('กำลังโหลด');
  });
  // WCAG contrast for solid computed CSS colours, including color-mix().
  const measure = (selector, backgroundSelector) => {
    const el = document.querySelector(selector);
    const bg = document.querySelector(backgroundSelector);
    if (!el || !bg) throw new Error(`Missing ${selector} or ${backgroundSelector}`);
    const parse = s => {
      let m = s.match(/^rgba?\(([^)]+)\)$/);
      if (m) return m[1].split(/[\s,/]+/).filter(Boolean).slice(0, 3).map(Number);
      m = s.match(/^color\(srgb ([^ )]+) ([^ )]+) ([^ )]+)/);
      if (m) return m.slice(1, 4).map(x => Number(x) * 255);
      throw new Error(`Unsupported colour ${s}`);
    };
    const lum = c => c.map(x => { x /= 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }).reduce((v, x, i) => v + x * [0.2126, 0.7152, 0.0722][i], 0);
    const foreground = lum(parse(getComputedStyle(el).color));
    const background = lum(parse(getComputedStyle(bg).backgroundColor));
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  };
  for (const mode of ['light', 'dark', 'light']) {
    await page.evaluate(m => document.documentElement.dataset.theme = m, mode);
    for (const type of ['success', 'error', 'warning', 'info', 'loading']) {
      for (const [part, threshold] of [['.toast-title', 4.5], ['.toast-msg', 4.5], ['.toast-icon', 3], ['.toast-close', 3]]) {
        const ratio = await page.evaluate(measure, `.toast-${type} ${part}`, `.toast-${type}`);
        assert(ratio >= threshold, `${mode} ${type} ${part}: ${ratio.toFixed(2)} < ${threshold}`);
      }
    }
    const retry = await page.evaluate(measure, '.toast-retry', '.toast-retry');
    assert(retry >= 4.5, `${mode} retry button: ${retry.toFixed(2)}`);
    await page.hover('.toast-error .toast-close');
    const closeHover = await page.evaluate(measure, '.toast-error .toast-close', '.toast-error .toast-close');
    assert(closeHover >= 3, `${mode} hovered close: ${closeHover.toFixed(2)}`);
    await page.hover('.toast-retry');
    const retryHover = await page.evaluate(measure, '.toast-retry', '.toast-retry');
    assert(retryHover >= 4.5, `${mode} hovered retry: ${retryHover.toFixed(2)}`);
    console.log(`✅ ${mode}: toast text, icons and controls`);
  }
} finally {
  await browser?.close();
  server.close();
}
