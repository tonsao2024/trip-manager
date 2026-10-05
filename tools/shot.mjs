// Dev-only helper: screenshot a route of the app running on a local server.
//   node tools/shot.mjs <url> <out.png> [width] [height] [waitMs]
// Uses the sandbox Chromium (puppeteer-core + @sparticuz/chromium) so the
// design can be eyeballed without a real device.
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

const [, , url = 'http://127.0.0.1:8099/', out = '/tmp/shot.png', w = '430', h = '932', waitMs = '2600'] = process.argv;

const executablePath = await chromium.executablePath();
const browser = await puppeteer.launch({
  executablePath,
  args: [...chromium.args, '--no-sandbox', '--disable-dev-shm-usage'],
  env: { ...process.env, LD_LIBRARY_PATH: ['/tmp/chlibs', '/tmp', process.env.LD_LIBRARY_PATH].filter(Boolean).join(':') },
  headless: 'shell'
});
const page = await browser.newPage();
await page.setViewport({ width: Number(w), height: Number(h), deviceScaleFactor: 1 });
page.on('console', m => { if (m.type() === 'error') console.log('[console error]', m.text().slice(0, 300)); });
page.on('pageerror', e => console.log('[page error]', String(e).slice(0, 300)));
await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise(r => setTimeout(r, Number(waitMs)));
await page.screenshot({ path: out, fullPage: false });
console.log('saved', out);
await browser.close();
