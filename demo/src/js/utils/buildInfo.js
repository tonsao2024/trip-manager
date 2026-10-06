// Build information — the app name, version, palette name and the “last updated”
// date that is shown on the website (login screen, More page, Settings → About,
// the global footer and every exported PNG/PDF stamp).
//
// 👉 Update APP_UPDATED_ISO whenever the site changes, then re-run
//    `node tools/preview/standalone.mjs` so the offline demo picks it up too.
//    `tests/unit/buildInfo.test.js` checks that index.html carries the same values.

/** Product name shown in the header / browser tab / exports. */
export const APP_NAME = 'Trip Manager';
/** The small “by …” credit that sits next to the product name. */
export const APP_AUTHOR = 'TonSkywalker';
export const APP_NAME_BY = 'Trip Manager by TonSkywalker';
/** Full <title> of the page. */
export const APP_TITLE = 'Trip Manager by TonSkywalker — วางแผนทริป • แบ่งจ่าย • เคลียร์บิล';

export const APP_VERSION = '19';
export const APP_VERSION_LABEL = 'v19';
/** Name of the DEFAULT palette — a theme is chosen on top of it (utils/themes.js). */
export const APP_PALETTE = 'Sky light';
export const APP_UPDATED_ISO = '2026-10-06';

/** Copyright owner + the licence note asked for by the app owner. */
export const APP_COPYRIGHT_HOLDER = 'TonSkywalker';
export const APP_COPYRIGHT_SINCE = '2024';
export const COPYRIGHT_NOTE_TH = '© 2024–2026 TonSkywalker — สงวนลิขสิทธิ์ ห้ามนำไปเผยแพร่ ดัดแปลง หรือใช้งานในเชิงพาณิชย์ก่อนได้รับอนุญาตเป็นลายลักษณ์อักษร';
export const COPYRIGHT_NOTE_EN = '© 2024–2026 TonSkywalker. All rights reserved — no commercial distribution, remixing or resale without written permission.';

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

/** “v18 Sky light • อัปเดตล่าสุด 5 ต.ค. 2026” (palette name may be overridden). */
export function appBuildLabel(lang = 'th', paletteName = APP_PALETTE) {
  const palette = lang === 'th' ? `ชุดสี ${paletteName || APP_PALETTE}` : `${paletteName || APP_PALETTE} palette`;
  return `${APP_VERSION_LABEL} ${palette} • ${appUpdatedLabel(lang)}`;
}

/** “Trip Manager v18 • อัปเดตล่าสุด 5 ต.ค. 2569 • © TonSkywalker” — the footer line. */
export function appFooterLabel(lang = 'th', paletteName = APP_PALETTE) {
  const legal = lang === 'th' ? 'ห้ามนำไปเผยแพร่เชิงพาณิชย์โดยไม่ได้รับอนุญาต' : 'no commercial distribution without permission';
  return `${APP_NAME_BY} ${APP_VERSION_LABEL} • ${appUpdatedLabel(lang)} • ${paletteName ? `${lang === 'th' ? 'ชุดสี' : 'palette'} ${paletteName} • ` : ''}© ${APP_COPYRIGHT_HOLDER} — ${legal}`;
}

/** One short legal sentence (used in Settings → About and the demo banner). */
export function copyrightNote(lang = 'th') {
  return lang === 'th' ? COPYRIGHT_NOTE_TH : COPYRIGHT_NOTE_EN;
}

/** `<meta name="app-updated">` etc. — kept in sync with index.html by a unit test. */
export function appMeta() {
  return {
    version: APP_VERSION,
    versionLabel: APP_VERSION_LABEL,
    palette: APP_PALETTE,
    updated: APP_UPDATED_ISO,
    name: APP_NAME,
    nameBy: APP_NAME_BY,
    author: APP_AUTHOR
  };
}

export default appMeta;
