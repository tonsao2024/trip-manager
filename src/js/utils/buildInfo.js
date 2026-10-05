// Build information — version, palette name and the “last updated” date that is
// shown on the website.
//
// 👉 Update APP_UPDATED_ISO whenever the site changes, then re-run
//    `node tools/preview/standalone.mjs` so the offline demo picks it up too.
//    `tests/unit/buildInfo.test.js` checks that index.html carries the same date.

export const APP_VERSION = '17';
export const APP_VERSION_LABEL = 'v17';
export const APP_PALETTE = 'Sky light';
export const APP_UPDATED_ISO = '2026-10-05';

const TH_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const EN_MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Parsed date of the last update (local midnight — no timezone surprises). */
export function appUpdatedDate() {
  const [y, m, d] = String(APP_UPDATED_ISO).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** “5 ต.ค. 2026” / “5 Oct 2026”. */
export function appUpdatedShort(lang = 'th') {
  const d = appUpdatedDate();
  const months = lang === 'th' ? TH_MONTHS_SHORT : EN_MONTHS_SHORT;
  const year = lang === 'th' ? d.getFullYear() + 543 : d.getFullYear();
  return `${d.getDate()} ${months[d.getMonth()]} ${year}`;
}

/** “อัปเดตล่าสุด 5 ต.ค. 2026” / “Updated 5 Oct 2026”. */
export function appUpdatedLabel(lang = 'th') {
  return lang === 'th' ? `อัปเดตล่าสุด ${appUpdatedShort('th')}` : `Updated ${appUpdatedShort('en')}`;
}

/** “v17 Sky light • อัปเดตล่าสุด 5 ต.ค. 2026”. */
export function appBuildLabel(lang = 'th') {
  const palette = lang === 'th' ? `ชุดสี ${APP_PALETTE}` : `${APP_PALETTE} palette`;
  return `${APP_VERSION_LABEL} ${palette} • ${appUpdatedLabel(lang)}`;
}

/** `<meta name="app-updated">` value — kept in sync with index.html by a unit test. */
export function appMeta() {
  return {
    version: APP_VERSION,
    versionLabel: APP_VERSION_LABEL,
    palette: APP_PALETTE,
    updated: APP_UPDATED_ISO
  };
}
