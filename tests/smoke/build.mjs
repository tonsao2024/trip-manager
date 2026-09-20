// Builds a Node-loadable copy of src/js for the smoke test.
// Only import specifiers are rewritten (CDN → npm package or stub); no app code changes.
import fs from 'node:fs';
import path from 'node:path';

const here = import.meta.dirname;
const root = path.resolve(here, '../..');
const srcDir = path.join(root, 'src', 'js');
const outDir = path.join(here, '.build', 'src', 'js');
const stubDir = path.join(here, 'stubs');

const FIREBASE = 'https://www.gstatic.com/firebasejs/10.12.2/';
const CDN_TO_STUB = {
  [`${FIREBASE}firebase-app.js`]: 'firebase-app.mjs',
  [`${FIREBASE}firebase-auth.js`]: 'firebase-auth.mjs',
  [`${FIREBASE}firebase-firestore.js`]: 'firebase-firestore.mjs',
  [`${FIREBASE}firebase-storage.js`]: 'firebase-storage.mjs',
  [`${FIREBASE}firebase-functions.js`]: 'firebase-functions.mjs',
  'https://esm.sh/leaflet@1.9.4': 'leaflet.mjs',
  'https://esm.sh/sortablejs@1.15.3': 'sortable.mjs',
  'https://esm.sh/html2canvas@1.4.1': 'html2canvas.mjs',
  'https://esm.sh/jspdf@2.5.2': 'jspdf.mjs'
};

// Real npm packages (installed in node_modules, gitignored) keep true behaviour.
const CDN_TO_PACKAGE = {
  'https://esm.sh/dayjs@1.11.13/plugin/utc': 'dayjs/plugin/utc.js',
  'https://esm.sh/dayjs@1.11.13/plugin/timezone': 'dayjs/plugin/timezone.js',
  'https://esm.sh/dayjs@1.11.13/plugin/relativeTime': 'dayjs/plugin/relativeTime.js',
  'https://esm.sh/dayjs@1.11.13/plugin/customParseFormat': 'dayjs/plugin/customParseFormat.js',
  'https://esm.sh/dayjs@1.11.13': 'dayjs',
  'https://esm.sh/xlsx@0.18.5': 'xlsx'
};

function rewrite(source, outFile) {
  const dir = path.dirname(outFile);
  return source.replace(/(['"])(https:\/\/[^'"]+)\1/g, (full, quote, url) => {
    // longest match first so plugin URLs win over the bare dayjs URL
    const candidates = [...Object.keys(CDN_TO_PACKAGE), ...Object.keys(CDN_TO_STUB)].sort((a, b) => b.length - a.length);
    const match = candidates.find(c => url === c || url.startsWith(c + '?') || url === c.replace(/\/$/, ''));
    if (!match) return full;
    if (CDN_TO_PACKAGE[match]) return `${quote}${CDN_TO_PACKAGE[match]}${quote}`;
    const stub = path.join(stubDir, CDN_TO_STUB[match]);
    let rel = path.relative(dir, stub).split(path.sep).join('/');
    if (!rel.startsWith('.')) rel = `./${rel}`;
    return `${quote}${rel}${quote}`;
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

let count = 0;
for (const file of walk(srcDir)) {
  const rel = path.relative(srcDir, file);
  const outFile = path.join(outDir, rel);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, rewrite(fs.readFileSync(file, 'utf8'), outFile));
  count++;
}
console.log(`[smoke] built ${count} modules → ${path.relative(root, outDir)}`);
export { outDir };
