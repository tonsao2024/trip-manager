// Brand mark + empty state (v35).
//
// v35 removed the “Fuji mascot” (a gradient mountain with a pulsing snow cap) from
// the loader, the login screen and the empty states — the owner asked for every
// mascot and mood face to go (docs/UNSLOP-AUDIT-2026-11-08.md). What stays is the
// product LOGO, drawn flat exactly like the header badge.

/**
 * The app logo: a rounded blue tile, white Mt. Fuji, the sun in the corner.
 * Uses the live theme colour (`--primary-raw`) like the header badge.
 * @param {number} size  edge length in px
 */
export function renderLogoMark(size = 48) {
  const inner = Math.round(size * 0.64);
  return `
  <span class="logo-badge logo-mark" style="width:${size}px;height:${size}px;" aria-hidden="true">
    <svg viewBox="0 0 100 100" width="${inner}" height="${inner}" aria-hidden="true">
      <circle cx="72" cy="28" r="15" fill="var(--brand-yellow-raw)"/>
      <path d="M4 82 L46 18 L88 82 Z" fill="#fff"/>
      <path d="M34 36 L46 18 L58 36 L52 41 L46 34 L40 41 Z" fill="color-mix(in srgb, var(--primary-raw) 32%, transparent)"/>
      <rect x="4" y="84" width="92" height="6" rx="3" fill="var(--brand-yellow-raw)"/>
    </svg>
  </span>`;
}

/**
 * Empty state: one quiet icon, one line of title, an optional sentence and ONE action.
 * @param {{icon?:string, title?:string, desc?:string, actionHtml?:string}} opts
 */
export function renderEmptyState({ icon = '', title = 'ไม่มีข้อมูล', desc = '', actionHtml = '' }) {
  return `
  <div class="empty-state">
    ${icon ? `<i data-lucide="${icon}" class="empty-state-ico" aria-hidden="true"></i>` : ''}
    <h3 class="empty-state-title">${title}</h3>
    ${desc ? `<p class="empty-state-desc">${desc}</p>` : ''}
    ${actionHtml ? `<div class="empty-state-action">${actionHtml}</div>` : ''}
  </div>`;
}
