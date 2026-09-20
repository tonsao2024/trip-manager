/**
 * Node test runner — mirrors tests/runner.html so the pure logic suites can run
 * without a browser (node tests/node-runner.mjs).
 */
import fs from 'node:fs';
import path from 'node:path';

// --- minimal browser shims used by the pure modules under test ---
globalThis.window = globalThis.window || globalThis;
globalThis.localStorage = globalThis.localStorage || {
  _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; }
};
try { Object.defineProperty(globalThis, 'navigator', { value: { language: 'th-TH', userAgent: 'node' }, configurable: true, writable: true }); } catch {}
globalThis.location = globalThis.location || { hash: '', href: 'http://localhost/' };
if (!globalThis.matchMedia) globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

const dir = path.join(import.meta.dirname, 'unit');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.js')).sort();
let pass = 0, fail = 0;
const skipped = [];
const failed = [];
for (const file of files) {
  let mod;
  try {
    mod = await import(path.join(dir, file));
  } catch (e) {
    if (String(e.code).includes('ESM_URL_SCHEME') || /https:/.test(e.message)) {
      skipped.push(file);
      console.log(`  ⏭  ${file}: skipped (imports CDN deps — run tests/runner.html in a browser)`);
      continue;
    }
    throw e;
  }
  for (const [name, fn] of Object.entries(mod)) {
    if (typeof fn !== 'function' || !name.startsWith('test')) continue;
    try {
      await fn();
      pass++;
      console.log(`  ✅ ${file} → ${name}`);
    } catch (e) {
      fail++;
      failed.push({ file, name, error: e });
      console.log(`  ❌ ${file} → ${name}: ${e.message}`);
    }
  }
}
console.log(`\n${pass} passed, ${fail} failed${skipped.length ? `, ${skipped.length} skipped (${skipped.join(', ')})` : ''}`);
if (fail) {
  for (const f of failed) console.error(`\n[${f.file} :: ${f.name}]\n${f.error.stack}`);
  process.exit(1);
}
