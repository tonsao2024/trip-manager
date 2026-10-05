// Fuji Mascot v3 — theme-aware SVG (uses current theme gradient), no emoji
let uid = 0;

export function renderFujiMascot(state = 'normal', size = 120) {
  const gid = `fg-${++uid}`;
  const snowAnimation = state === 'loading'
    ? `<rect x="35" y="6" width="30" height="6" rx="3" fill="white" opacity="0.92"><animate attributeName="width" values="0;30;0" dur="1.5s" repeatCount="indefinite"/></rect>`
    : '';
  const bounceClass = state === 'success' ? 'animate-bounce-short' : state === 'loading' ? 'animate-pulse-soft' : '';
  return `
  <div class="fuji-mascot ${state} ${bounceClass}" style="width:${size}px;height:${size * 0.7}px;display:inline-block;">
    <svg viewBox="0 0 100 70" width="${size}" height="${size * 0.7}" role="img" aria-label="Fuji">
      <defs>
        <linearGradient id="${gid}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:var(--grad-1)"/>
          <stop offset="100%" style="stop-color:var(--grad-2)"/>
        </linearGradient>
      </defs>
      <path d="M5 65 L50 2 L95 65 Z" fill="url(#${gid})" stroke="rgba(0,0,0,0.06)" stroke-width="0.5"/>
      <path d="M38 22 L50 2 L62 22 L56 26 L50 20 L44 26 Z" fill="white" opacity="0.95"/>
      ${snowAnimation}
      <ellipse cx="50" cy="68" rx="40" ry="3" fill="black" opacity="0.08"/>
    </svg>
  </div>`;
}

export function renderEmptyState({ icon = '', title = 'ไม่มีข้อมูล', desc = '', actionHtml = '' }) {
  const visual = icon
    ? `<div class="empty-icon-badge"><i data-lucide="${icon}" style="width:44px;height:44px;"></i></div>`
    : `<div class="empty-state-icon">${renderFujiMascot('normal', 100)}</div>`;
  return `
  <div class="empty-state">
    ${visual}
    <h3 style="font-weight:700;font-size:18px;color:var(--text);margin-bottom:8px;">${title}</h3>
    ${desc ? `<p style="font-size:14px;max-width:320px;margin:0 auto 16px;color:var(--text-secondary);">${desc}</p>` : ''}
    ${actionHtml}
  </div>`;
}
