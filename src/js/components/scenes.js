// Page header (v35).
//
// Until v34 every page opened with a “scene”: a tinted ticket card with a left
// stripe and a looping illustration (hiker, coins, hearts…). The calm pass
// (docs/UNSLOP-AUDIT-2026-11-08.md, L3 / V2) replaced it with a plain page
// title — the menu already says where you are, and the content starts higher.
//
// The function keeps its v5 name and signature so every page call stays the same:
//   renderPageScene('itinerary', { lang, title, subtitle, actions, back })

/**
 * Pages that are NOT one of the primary destinations get an in-page “ย้อนกลับ”
 * control (v34). Before this, the only way out of Settings / Members / Import /
 * Prep / Bookings / Calendar was the browser's back button — the audit flagged it
 * as the most common dead end on a phone. The handler lives in app.js
 * (`[data-ps-back]`), so the component stays markup-only.
 */
const BACK_PAGES = new Set(['members', 'documents', 'import', 'prep', 'ideas', 'bookings', 'calendar', 'explore', 'settings']);

/** Titles used to arrive with a decorative icon in front — the title is text only now. */
function plainTitle(title) {
  return String(title || '')
    .replace(/<i\b[^>]*data-lucide[^>]*>\s*<\/i>/g, '')
    .replace(/<svg\b[\s\S]*?<\/svg>/g, '')
    .replace(/^\s+/, '');
}

/**
 * Plain page header: back link (secondary pages) · title · one-line subtitle ·
 * actions on the right.
 * @param {string} kind  page key (kept for styling hooks: `.page-head--${kind}`)
 * @param {{lang?:string, title?:string, subtitle?:string, actions?:string, back?:boolean}} opts
 */
export function renderPageScene(kind, { lang = 'th', title = '', subtitle = '', actions = '', back = null } = {}) {
  const showBack = back === null || back === undefined ? BACK_PAGES.has(kind) : !!back;
  const backLabel = lang === 'th' ? 'ย้อนกลับ' : 'Back';
  return `
  <header class="page-head page-head--${kind}">
    <div class="page-head-main">
      ${showBack ? `<button type="button" class="ps-back" data-ps-back aria-label="${backLabel}">
        <i data-lucide="arrow-left" class="w-4 h-4"></i><span>${backLabel}</span>
      </button>` : ''}
      <h1 class="page-title">${plainTitle(title)}</h1>
      ${subtitle ? `<p class="page-sub">${subtitle}</p>` : ''}
    </div>
    ${actions ? `<div class="btn-row page-actions">${actions}</div>` : ''}
  </header>`;
}
