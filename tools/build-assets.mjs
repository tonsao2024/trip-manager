/**
 * Production asset builder — replaces two heavy runtime CDNs with static files.
 *
 *   1. Tailwind: the live site used the Play CDN (cdn.tailwindcss.com), a ~400 kB
 *      JIT compiler that runs in the browser and re-scans the DOM on every
 *      mutation. That is explicitly "not for production". We compile the exact
 *      utilities the app uses into src/css/tailwind.css once, here, and ship the
 *      static file. No runtime compiler, no render-blocking CDN script.
 *
 *   2. Lucide: the live site loaded the FULL icon bundle (~550 kB, ~1500 icons)
 *      from jsDelivr even though the app uses ~200. We scan the source for every
 *      icon name actually referenced and emit a compatible `window.lucide`
 *      object (icons + createIcons) containing only those — src/js/vendor/lucide.js.
 *
 * Both outputs are committed because GitHub Pages serves the repo as-is (no
 * build step). Re-run this after changing classes/icons:
 *
 *   npm install --no-save tailwindcss@3.4.17 lucide@0.460.0
 *   node tools/build-assets.mjs
 *
 * Dev-only: needs the gitignored node_modules. The app itself gains no new
 * runtime dependency — it loses two.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const here = import.meta.dirname;
const root = path.resolve(here, '..');
const srcDir = path.join(root, 'src', 'js');

/* ------------------------------------------------------------------ *
 * 1. Tailwind — compile the utilities used by index.html + src/js.
 * ------------------------------------------------------------------ */
function buildTailwind() {
  const twBin = path.join(root, 'node_modules', '.bin', 'tailwindcss');
  if (!fs.existsSync(twBin)) {
    console.warn('[assets] tailwindcss not installed — skipping CSS (npm i --no-save tailwindcss@3.4.17)');
    return;
  }
  const tmpDir = path.join(root, 'tools', '.assets-tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  const inFile = path.join(tmpDir, 'tailwind.in.css');
  const cfgFile = path.join(tmpDir, 'tailwind.config.cjs');
  const outFile = path.join(srcDir, '..', 'css', 'tailwind.css');
  fs.writeFileSync(inFile, '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n');
  // Mirrors the config that used to live in index.html (dark mode + fonts).
  fs.writeFileSync(cfgFile, `module.exports = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: [
    ${JSON.stringify(path.join(root, 'index.html'))},
    ${JSON.stringify(path.join(srcDir, '**/*.js'))}
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['Outfit', 'Plus Jakarta Sans', 'Noto Sans Thai', 'sans-serif'],
        sans: ['Plus Jakarta Sans', 'Noto Sans Thai', 'sans-serif']
      }
    }
  }
};\n`);
  execFileSync(twBin, ['-c', cfgFile, '-i', inFile, '-o', outFile, '--minify'], { stdio: 'pipe' });
  fs.rmSync(tmpDir, { recursive: true, force: true });
  const kb = (fs.statSync(outFile).size / 1024).toFixed(1);
  console.log(`[assets] tailwind.css compiled (${kb} kB) → src/css/tailwind.css`);
}

/* ------------------------------------------------------------------ *
 * 2. Lucide — emit only the icons the source actually references.
 * ------------------------------------------------------------------ */
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'vendor') continue; // never scan our own output
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

const toPascal = (s) => s.replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase());

async function buildLucide() {
  let lucide;
  try { lucide = require('lucide'); }
  catch {
    try { lucide = await import('lucide'); }
    catch { console.warn('[assets] lucide not installed — skipping icons (npm i --no-save lucide@0.460.0)'); return; }
  }
  const allIcons = lucide.icons || lucide.iconsAndAliases;
  if (!allIcons) { console.warn('[assets] lucide.icons missing — skipping'); return; }

  // Collect every kebab-case token in the app source + index.html, keep the ones
  // that are real lucide icons (or aliases). This covers icon('x'),
  // data-lucide="x", icon: 'x' and the ICON_ALIASES map alike.
  const files = [...walk(srcDir), path.join(root, 'index.html')];
  const used = new Set();
  const tokenRe = /[a-z][a-z0-9]*(?:-[a-z0-9]+)+/g;
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(tokenRe)) {
      const name = m[0];
      const pascal = toPascal(name);
      if (allIcons[pascal]) used.add(pascal);
    }
    // single-word icons (e.g. "map", "wallet", "users", "compass")
    for (const m of text.matchAll(/['"`]([a-z][a-z0-9]*)['"`]/g)) {
      const pascal = toPascal(m[1]);
      if (allIcons[pascal]) used.add(pascal);
    }
  }
  // Always keep a small safety net of icons resolved at runtime via aliases.
  ['LoaderCircle', 'ChartPie', 'ChartColumn', 'CircleCheck', 'Globe', 'RefreshCw',
    'Search', 'Lock', 'User', 'CircleHelp', 'Bed', 'CalendarDays', 'Train',
    'Sliders', 'List', 'Gift', 'Bell', 'Receipt', 'Folder', 'FileText', 'Code',
    'Coins', 'Pointer', 'MountainSnow', 'CalendarArrowDown', 'Download', 'Cloud',
    'FileCode', 'X'].forEach(n => { if (allIcons[n]) used.add(n); });

  const names = [...used].sort();
  const iconsObj = {};
  for (const n of names) iconsObj[n] = allIcons[n];

  // createIcons/replaceElement logic adapted from lucide (ISC license).
  const header = `/**
 * Lucide icon subset — generated by tools/build-assets.mjs (do not edit by hand).
 * Only the icons referenced by the app are included (${names.length} of ~1500).
 * Based on lucide v0.460.0 (ISC license, https://lucide.dev).
 */
`;
  const runtime = `
(function () {
  var ICONS = ${JSON.stringify(iconsObj)};
  var defaultAttributes = {
    xmlns: "http://www.w3.org/2000/svg", width: 24, height: 24, viewBox: "0 0 24 24",
    fill: "none", stroke: "currentColor", "stroke-width": 2,
    "stroke-linecap": "round", "stroke-linejoin": "round"
  };
  function createElement(tag, attrs, children) {
    var el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, String(attrs[k])); });
    (children || []).forEach(function (c) { el.appendChild(createElement(c[0], c[1], c[2])); });
    return el;
  }
  function toPascal(s) { return s.replace(/(^|-)(\\w)/g, function (_, __, c) { return c.toUpperCase(); }); }
  function attrsOf(el) {
    var a = {}; Array.prototype.forEach.call(el.attributes, function (at) { a[at.name] = at.value; }); return a;
  }
  function classNames(parts) {
    var seen = []; parts.forEach(function (p) {
      if (!p) return; var arr = typeof p === 'string' ? p.split(' ') : (p.class ? String(p.class).split(' ') : []);
      arr.forEach(function (c) { c = c.trim(); if (c && seen.indexOf(c) < 0) seen.push(c); });
    }); return seen.join(' ');
  }
  function replaceElement(el, nameAttr, extraAttrs) {
    var name = el.getAttribute(nameAttr); if (name == null) return;
    var node = ICONS[toPascal(name)]; if (!node) return;
    var elAttrs = attrsOf(el);
    var iconAttrs = Object.assign({}, node[1], { 'data-lucide': name }, extraAttrs || {}, elAttrs);
    var cls = classNames(['lucide', 'lucide-' + name, elAttrs, extraAttrs]);
    if (cls) iconAttrs.class = cls;
    var svg = createElement(node[0], iconAttrs, node[2]);
    if (el.parentNode) el.parentNode.replaceChild(svg, el);
  }
  function createIcons(opts) {
    opts = opts || {};
    var nameAttr = opts.nameAttr || 'data-lucide';
    var els = document.querySelectorAll('i[' + nameAttr + ']');
    Array.prototype.forEach.call(els, function (el) { replaceElement(el, nameAttr, opts.attrs); });
  }
  window.lucide = { icons: ICONS, createIcons: createIcons, createElement: createElement };
})();
`;
  // The icon nodes reference defaultAttributes by value already (lucide stores
  // the resolved object), so JSON.stringify gives a fully self-contained map.
  const outDir = path.join(srcDir, 'vendor');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'lucide.js');
  fs.writeFileSync(outFile, header + runtime);
  const kb = (fs.statSync(outFile).size / 1024).toFixed(1);
  console.log(`[assets] lucide.js subset (${names.length} icons, ${kb} kB) → src/js/vendor/lucide.js`);
}

buildTailwind();
await buildLucide();
console.log('[assets] done.');
