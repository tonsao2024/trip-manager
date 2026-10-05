/**
 * Dev-only ESM loader for `tests/node-runner.mjs`.
 *
 * The app loads dayjs / xlsx from CDN URLs (esm.sh). Node cannot fetch them, so
 * every test file that (directly or indirectly) imports `src/js/utils/date.js`
 * was skipped. This hook maps those CDN specifiers to the locally installed
 * copies instead, so the pure suites (scheduling, …) can run offline.
 *
 * It never touches the browser or production code — only test-time resolution.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, '..');
const local = (pkg) => pathToFileURL(require.resolve(pkg)).href;

const DAYJS = local('dayjs/dayjs.min.js');
const XLSX = local('xlsx/xlsx.mjs');

/** CDN specifier → local file. */
const MAP = {
  'https://esm.sh/dayjs@1.11.13': DAYJS,
  'https://esm.sh/dayjs@1.11.13/plugin/utc': local('dayjs/plugin/utc.js'),
  'https://esm.sh/dayjs@1.11.13/plugin/timezone': local('dayjs/plugin/timezone.js'),
  'https://esm.sh/dayjs@1.11.13/plugin/relativeTime': local('dayjs/plugin/relativeTime.js'),
  'https://esm.sh/dayjs@1.11.13/plugin/customParseFormat': local('dayjs/plugin/customParseFormat.js'),
  'https://esm.sh/dayjs@1.11.13/plugin/advancedFormat': local('dayjs/plugin/advancedFormat.js'),
  'https://esm.sh/xlsx@0.18.5': XLSX
};

export function resolve(specifier, context, next) {
  const bare = specifier.split('?')[0].replace(/\/$/, '');
  if (MAP[bare]) return next(MAP[bare], context);
  if (MAP[specifier]) return next(MAP[specifier], context);
  // Relative CDN paths inside the plugins ("./plugin.js" style) are not needed.
  if (/^https:\/\/esm\.sh\//.test(bare)) {
    return { shortCircuit: true, url: pathToFileURL(path.join(ROOT, 'tests', 'unit', '.missing.mjs')).href };
  }
  return next(specifier, context);
}
