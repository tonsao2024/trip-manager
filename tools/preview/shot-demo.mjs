import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
const url = process.argv[2];
const out = process.argv[3];
const w = Number(process.argv[4] || 430);
const h = Number(process.argv[5] || 932);
const waitMs = Number(process.argv[6] || 3500);
const browser = await puppeteer.launch({
  executablePath: await chromium.executablePath(),
  args: [...chromium.args, '--no-sandbox', '--disable-dev-shm-usage'],
  env: { ...process.env, LD_LIBRARY_PATH: ['/tmp/chlibs/lib', '/tmp', process.env.LD_LIBRARY_PATH].filter(Boolean).join(':') },
  headless: 'shell'
});
const page = await browser.newPage();
await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
const logs = [];
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`.slice(0, 220)));
page.on('pageerror', e => logs.push(`[pageerror] ${String(e).slice(0, 220)}`));
page.on('requestfailed', r => logs.push(`[reqfail] ${r.url().slice(0, 120)} ${r.failure()?.errorText}`));
await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 }).catch(e => logs.push('[goto] ' + e.message));
await new Promise(r => setTimeout(r, waitMs));
await page.screenshot({ path: out });
console.log(logs.slice(0, 25).join('\n'));
await browser.close();
