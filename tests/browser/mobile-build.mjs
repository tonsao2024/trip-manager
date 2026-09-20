// Builds a browser-loadable copy of the app for the phone-layout check.
//
// The real app loads Firebase / Leaflet / Tailwind from CDNs, which the sandbox
// cannot reach, so this rewrites the import specifiers to the same stubs the
// jsdom smoke test uses and compiles the Tailwind utilities from the real
// sources. Nothing in src/ is modified — only the copy under out/app/.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const here = import.meta.dirname;
const root = path.resolve(here, '../..');
const srcDir = path.join(root, 'src', 'js');
const outRoot = path.join(here, 'out');
const appDir = path.join(outRoot, 'app');
const vendorDir = path.join(outRoot, 'vendor');

const FIREBASE = 'https://www.gstatic.com/firebasejs/10.12.2/';
const STUB = (name) => `/tests/smoke/stubs/${name}`;

/** CDN URL → what the browser copy should import instead. */
const REWRITE = {
  [`${FIREBASE}firebase-app.js`]: STUB('firebase-app.mjs'),
  [`${FIREBASE}firebase-auth.js`]: STUB('firebase-auth.mjs'),
  [`${FIREBASE}firebase-firestore.js`]: STUB('firebase-firestore.mjs'),
  [`${FIREBASE}firebase-storage.js`]: STUB('firebase-storage.mjs'),
  [`${FIREBASE}firebase-functions.js`]: STUB('firebase-functions.mjs'),
  'https://esm.sh/leaflet@1.9.4': STUB('leaflet.mjs'),
  'https://esm.sh/sortablejs@1.15.3': STUB('sortable.mjs'),
  'https://esm.sh/html2canvas@1.4.1': STUB('html2canvas.mjs'),
  'https://esm.sh/jspdf@2.5.2': STUB('jspdf.mjs'),
  'https://esm.sh/dayjs@1.11.13/plugin/utc': '/tests/browser/out/vendor/dayjs/plugin/utc/index.js',
  'https://esm.sh/dayjs@1.11.13/plugin/timezone': '/tests/browser/out/vendor/dayjs/plugin/timezone/index.js',
  'https://esm.sh/dayjs@1.11.13/plugin/relativeTime': '/tests/browser/out/vendor/dayjs/plugin/relativeTime/index.js',
  'https://esm.sh/dayjs@1.11.13/plugin/customParseFormat': '/tests/browser/out/vendor/dayjs/plugin/customParseFormat/index.js',
  'https://esm.sh/dayjs@1.11.13': '/tests/browser/out/vendor/dayjs/index.js',
  'https://esm.sh/xlsx@0.18.5': '/tests/browser/out/vendor/xlsx.js'
};

function rewrite(source) {
  return source.replace(/(['"])(https:\/\/[^'"]+)\1/g, (full, quote, url) => {
    const keys = Object.keys(REWRITE).sort((a, b) => b.length - a.length);
    const match = keys.find(k => url === k || url.startsWith(`${k}?`) || url === k.replace(/\/$/, ''));
    return match ? `${quote}${REWRITE[match]}${quote}` : full;
  });
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

fs.rmSync(appDir, { recursive: true, force: true });
fs.mkdirSync(appDir, { recursive: true });
fs.mkdirSync(vendorDir, { recursive: true });

let count = 0;
for (const file of walk(srcDir)) {
  const rel = path.relative(srcDir, file);
  const outFile = path.join(appDir, rel);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, rewrite(fs.readFileSync(file, 'utf8')));
  count++;
}

// dayjs (ESM build) — only the bare import is left after the rewrite above.
const dayjsSrc = path.join(root, 'node_modules', 'dayjs', 'esm');
const dayjsOut = path.join(vendorDir, 'dayjs');
if (fs.existsSync(dayjsSrc)) {
  fs.cpSync(dayjsSrc, dayjsOut, { recursive: true });
  // Node resolves extensionless imports ("./constant"); a browser does not, so
  // every relative specifier inside the vendored copy is made explicit.
  const fix = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { fix(full); continue; }
      if (!entry.name.endsWith('.js')) continue;
      const src = fs.readFileSync(full, 'utf8');
      const patched = src.replace(/(from|import)\s*(['"])(\.\.?\/[^'"]+)\2/g, (full2, kw, quote, spec) => {
        if (/\.(js|json|mjs)$/.test(spec)) return full2;
        const target = path.resolve(path.dirname(full), spec);
        if (fs.existsSync(`${target}.js`)) return `${kw} ${quote}${spec}.js${quote}`;
        if (fs.existsSync(path.join(target, 'index.js'))) return `${kw} ${quote}${spec}/index.js${quote}`;
        return full2;
      });
      if (patched !== src) fs.writeFileSync(full, patched);
    }
  };
  fix(dayjsOut);
} else {
  console.warn('[mobile] dayjs/esm missing — run npm i dayjs');
}
// SheetJS is only touched from the admin import/export screens; a stub is enough.
fs.writeFileSync(path.join(vendorDir, 'xlsx.js'), 'export const read = () => ({});\nexport const utils = {};\nexport const writeFile = () => {};\nexport default { read, utils, writeFile };\n');
// The Firebase config module is gitignored; make sure the copy has one.
fs.writeFileSync(path.join(appDir, 'firebase.config.js'), [
  'export const firebaseConfig = {',
  "  apiKey: 'AIzaMobileCheckKey', authDomain: 'mobile-check.firebaseapp.com', projectId: 'mobile-check',",
  "  storageBucket: 'mobile-check.appspot.com', messagingSenderId: '1234567890', appId: '1:1234567890:web:check'",
  '};',
  'export const isConfigHardcoded = true;',
  'export default firebaseConfig;',
  ''
].join('\n'));

// Tailwind utilities, compiled from the real class names used by the app.
const twIn = path.join(outRoot, 'tailwind.in.css');
const twOut = path.join(outRoot, 'tailwind.css');
fs.writeFileSync(twIn, "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n");
const twConfig = path.join(outRoot, 'tailwind.config.cjs');
fs.writeFileSync(twConfig, `module.exports = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: [${JSON.stringify(path.join(root, 'index.html'))}, ${JSON.stringify(path.join(srcDir, '**/*.js'))}],
  corePlugins: { preflight: false }
};\n`);
try {
  execFileSync(path.join(root, 'node_modules', '.bin', 'tailwindcss'), [
    '-c', twConfig, '-i', twIn, '-o', twOut, '--minify'
  ], { stdio: 'pipe' });
} catch (e) {
  console.warn('[mobile] tailwind build failed:', e.message);
}

console.log(`[mobile] built ${count} modules → ${path.relative(root, appDir)}, tailwind ${(fs.statSync(twOut).size / 1024).toFixed(0)} kB`);
export { appDir, outRoot };
