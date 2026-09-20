// Page scenes — a small animated illustration for every menu, in the same spirit as
// the "runner heading to Mt. Fuji" countdown: pure SVG + CSS transform animations,
// no images, no JS timers, ~0 CPU when off-screen (browsers pause off-screen animations).
//
// Usage: renderPageScene('itinerary', { lang, title, subtitle, actions })

const gradId = (kind) => `ps-grad-${kind}`;

function fujiBackdrop(kind, opts = {}) {
  const { scale = 1, y = 0, opacity = 1 } = opts;
  return `
  <g class="ps-fuji" style="opacity:${opacity}; transform: translateY(${y}px) scale(${scale}); transform-origin: 160px 78px;">
    <path d="M62 78 C 104 75, 128 68, 152 20 C 176 68, 200 75, 246 78 Z" fill="url(#${gradId(kind)})"/>
    <path d="M134 38 C 140 27, 146 22, 152 20 C 158 22, 164 27, 170 38 L 164 35 L 158 41 L 152 35 L 146 41 L 140 35 Z" fill="rgba(255,255,255,0.9)"/>
  </g>`;
}

function ground(kind) {
  return `<path class="ps-ground" d="M8 79 H 300" stroke-linecap="round"/>`;
}

function sun() {
  return `<circle class="ps-sun-slow" cx="238" cy="24" r="11"/>`;
}

const SCENES = {
  /* ---------------- Itinerary: a little hiker walking to Fuji ---------------- */
  itinerary: (kind) => `
    ${sun()}${fujiBackdrop(kind)}${ground()}
    <path class="ps-trail" d="M18 74 C 52 72, 60 58, 92 58 S 138 70, 168 68" />
    <g class="ps-hiker">
      <g class="ps-bob">
        <rect class="ps-pack" x="34" y="44" width="11" height="15" rx="4"/>
        <rect class="ps-body" x="39" y="42" width="12" height="20" rx="6"/>
        <circle class="ps-head" cx="45" cy="36" r="6.5"/>
        <path class="ps-cap" d="M38.5 34.5 a7 7 0 0 1 13 0 z"/>
        <g class="ps-legs">
          <line class="ps-leg ps-leg-a" x1="44" y1="61" x2="39" y2="72"/>
          <line class="ps-leg ps-leg-b" x1="46" y1="61" x2="53" y2="71"/>
        </g>
        <line class="ps-arm" x1="50" y1="48" x2="58" y2="55"/>
        <line class="ps-stick" x1="58" y1="55" x2="60" y2="73"/>
      </g>
    </g>
    <g class="ps-pin">
      <path d="M104 4 c 7 0 12 5 12 12 c 0 8 -12 22 -12 22 s -12 -14 -12 -22 c 0 -7 5 -12 12 -12 z"/>
      <circle cx="104" cy="16" r="4.2" fill="#fff"/>
    </g>`,

  /* ---------------- Expenses: wallet + tumbling coins ---------------- */
  expenses: (kind) => `
    ${fujiBackdrop(kind, { opacity: 0.25, y: 6 })}${ground()}
    <g class="ps-wallet ps-bob">
      <rect x="26" y="40" width="62" height="34" rx="10"/>
      <rect class="ps-wallet-flap" x="26" y="40" width="62" height="14" rx="7"/>
      <circle class="ps-wallet-btn" cx="78" cy="59" r="4"/>
      <path class="ps-receipt" d="M36 48 h 26" />
      <path class="ps-receipt ps-receipt-2" d="M36 55 h 20" />
    </g>
    <g class="ps-coins">
      <g class="ps-coin ps-coin-1"><circle cx="112" cy="30" r="8"/><text x="112" y="34">฿</text></g>
      <g class="ps-coin ps-coin-2"><circle cx="132" cy="30" r="6"/><text x="132" y="33">$</text></g>
      <g class="ps-coin ps-coin-3"><circle cx="152" cy="30" r="7"/><text x="152" y="34">¥</text></g>
    </g>
    <g class="ps-tag">
      <rect x="176" y="46" width="46" height="26" rx="8"/>
      <path d="M184 56 h 28 M184 63 h 18"/>
    </g>`,

  /* ---------------- Members: a friendly little group ---------------- */
  members: (kind) => `
    ${sun()}${fujiBackdrop(kind, { opacity: 0.3, y: 5, scale: 0.9 })}${ground()}
    <g class="ps-group">
      <g class="ps-person ps-person-1">
        <circle class="ps-p-head" cx="46" cy="34" r="9"/>
        <path class="ps-p-body" d="M33 74 a13 13 0 0 1 26 0 z"/>
        <line class="ps-p-arm ps-arm-a" x1="34" y1="60" x2="24" y2="52"/>
        <line class="ps-p-arm ps-arm-b" x1="58" y1="60" x2="68" y2="52"/>
      </g>
      <g class="ps-person ps-person-2">
        <circle class="ps-p-head" cx="92" cy="28" r="10"/>
        <path class="ps-p-body" d="M77 74 a15 15 0 0 1 30 0 z"/>
        <line class="ps-p-arm ps-arm-a" x1="78" y1="54" x2="66" y2="44"/>
        <line class="ps-p-arm ps-arm-b" x1="106" y1="54" x2="118" y2="44"/>
      </g>
      <g class="ps-person ps-person-3">
        <circle class="ps-p-head" cx="140" cy="36" r="8.5"/>
        <path class="ps-p-body" d="M128 74 a12 12 0 0 1 24 0 z"/>
        <line class="ps-p-arm ps-arm-a" x1="129" y1="62" x2="119" y2="55"/>
        <line class="ps-p-arm ps-arm-b" x1="151" y1="62" x2="161" y2="55"/>
      </g>
    </g>
    <g class="ps-heart"><path d="M172 30 c 0 -4 6 -6 8 -2 c 2 -4 8 -2 8 2 c 0 5 -8 10 -8 10 s -8 -5 -8 -10 z"/></g>
    <g class="ps-heart ps-heart-2"><path d="M196 44 c 0 -3 5 -5 6.5 -1.5 c 1.5 -3.5 6.5 -1.5 6.5 1.5 c 0 4 -6.5 8 -6.5 8 s -6.5 -4 -6.5 -8 z"/></g>`,

  /* ---------------- Documents: folder + flying papers ---------------- */
  documents: (kind) => `
    ${fujiBackdrop(kind, { opacity: 0.22, y: 6 })}${ground()}
    <g class="ps-paper ps-paper-1"><rect x="30" y="16" width="26" height="34" rx="4"/><path d="M36 26 h 14 M36 33 h 14 M36 40 h 9"/></g>
    <g class="ps-paper ps-paper-2"><rect x="58" y="10" width="24" height="32" rx="4"/><path d="M64 20 h 12 M64 27 h 12 M64 34 h 8"/></g>
    <g class="ps-folder ps-bob">
      <path class="ps-folder-back" d="M40 44 h 26 l 6 6 h 62 a 8 8 0 0 1 8 8 v 14 a 8 8 0 0 1 -8 8 h -94 a 8 8 0 0 1 -8 -8 v -20 a 8 8 0 0 1 8 -8 z"/>
      <path class="ps-folder-front" d="M32 58 h 106 a 8 8 0 0 1 8 8 l -4 14 a 8 8 0 0 1 -8 6 h -98 a 8 8 0 0 1 -8 -8 z"/>
      <circle class="ps-stamp" cx="150" cy="30" r="9"/>
      <path class="ps-stamp-check" d="M146 30 l 3 3 l 6 -6"/>
    </g>`,

  /* ---------------- Settlement: coin passing between two people ---------------- */
  settlement: (kind) => `
    ${fujiBackdrop(kind, { opacity: 0.2, y: 6 })}${ground()}
    <g class="ps-avatar ps-avatar-a"><circle cx="40" cy="40" r="14"/><circle class="ps-face" cx="35" cy="38" r="1.6"/><circle class="ps-face" cx="45" cy="38" r="1.6"/><path class="ps-smile" d="M35 45 q 5 4 10 0"/></g>
    <g class="ps-avatar ps-avatar-b"><circle cx="176" cy="40" r="14"/><circle class="ps-face" cx="171" cy="38" r="1.6"/><circle class="ps-face" cx="181" cy="38" r="1.6"/><path class="ps-smile" d="M171 45 q 5 4 10 0"/></g>
    <path class="ps-arrow" d="M62 40 h 30" />
    <path class="ps-arrow ps-arrow-2" d="M124 40 h 30" />
    <g class="ps-coin-fly"><circle cx="0" cy="0" r="9"/><text x="0" y="4">฿</text></g>
    <path class="ps-balance" d="M84 66 h 60"/>`,

  /* ---------------- Import / export: box in, sheet out ---------------- */
  import: (kind) => `
    ${fujiBackdrop(kind, { opacity: 0.2, y: 6 })}${ground()}
    <g class="ps-box ps-bob">
      <path class="ps-box-body" d="M52 46 h 68 l 6 30 h -80 z"/>
      <path class="ps-box-lid" d="M46 38 h 80 l -6 10 h -68 z"/>
      <path class="ps-box-line" d="M86 46 v 30"/>
    </g>
    <g class="ps-in-sheet"><rect x="78" y="6" width="24" height="30" rx="4"/><path d="M84 16 h 12 M84 23 h 12 M84 30 h 8"/></g>
    <g class="ps-out-sheet"><rect x="150" y="20" width="22" height="28" rx="4"/><path d="M156 30 h 10 M156 37 h 10"/></g>
    <path class="ps-in-arrow" d="M90 40 v 8" />
    <path class="ps-out-arrow" d="M161 20 v -10" />`,

  /* ---------------- Settings: turning gear + palette ---------------- */
  settings: (kind) => `
    ${fujiBackdrop(kind, { opacity: 0.18, y: 6 })}${ground()}
    <g class="ps-palette ps-bob">
      <path d="M92 26 a 30 26 0 1 0 0 52 a 9 9 0 0 0 9 -9 v -4 a 7 7 0 0 1 7 -7 h 6 a 20 20 0 0 0 8 -38 a 30 26 0 0 0 -30 6 z"/>
      <circle class="ps-dot" cx="78" cy="42" r="4"/>
      <circle class="ps-dot" cx="96" cy="36" r="4"/>
      <circle class="ps-dot" cx="114" cy="46" r="4"/>
      <circle class="ps-dot" cx="82" cy="62" r="4"/>
    </g>
    <g class="ps-gear"><path d="M196 30 l 6 4 l -2 7 l 6 5 l -4 6 l 7 2 l 1 7 l -7 2 l 0 7 l -7 2 l -3 6 l -6 -3 l -6 4 l -5 -5 l -7 1 l -2 -7 l -6 -3 l 3 -7 l -3 -6 l 6 -4 l 0 -8 l 7 -2 l 2 -7 l 7 2 z"/><circle class="ps-gear-hole" cx="192" cy="52" r="7"/></g>`,

  /* ---------------- Trip list: suitcase + plane ---------------- */
  trips: (kind) => `
    ${sun()}${fujiBackdrop(kind, { opacity: 0.35, y: 4, scale: 0.95 })}${ground()}
    <g class="ps-plane"><path d="M0 0 l 26 8 l -26 8 l 5 -8 z"/><path class="ps-plane-wing" d="M10 8 l 8 8 l 4 -8 z"/></g>
    <path class="ps-cloud" d="M28 26 q 6 -8 14 -2 q 6 -4 10 2 z"/>
    <g class="ps-suitcase ps-bob">
      <rect x="46" y="40" width="60" height="36" rx="8"/>
      <path class="ps-handle" d="M66 40 v -6 a 6 6 0 0 1 6 -6 h 8 a 6 6 0 0 1 6 6 v 6"/>
      <path class="ps-strap" d="M70 42 v 32"/>
      <circle class="ps-lock" cx="76" cy="58" r="3.4"/>
    </g>`,

  /* ---------------- Map / places ---------------- */
  map: (kind) => `
    ${sun()}${fujiBackdrop(kind, { opacity: 0.5, y: 2, scale: 0.9 })}${ground()}
    <path class="ps-route" d="M20 70 C 56 68, 70 50, 104 50 S 160 62, 196 44"/>
    <g class="ps-pin ps-pin-a"><path d="M56 22 c 7 0 12 5 12 12 c 0 8 -12 22 -12 22 s -12 -14 -12 -22 c 0 -7 5 -12 12 -12 z"/><circle cx="56" cy="34" r="4.2" fill="#fff"/></g>
    <g class="ps-pin ps-pin-b"><path d="M196 6 c 7 0 12 5 12 12 c 0 8 -12 22 -12 22 s -12 -14 -12 -22 c 0 -7 5 -12 12 -12 z"/><circle cx="196" cy="18" r="4.2" fill="#fff"/></g>`
};

/**
 * Header block with an animated illustration — drop-in replacement for a plain <h1> row.
 * @param {keyof SCENES} kind
 * @param {{lang?:string, title?:string, subtitle?:string, actions?:string, tone?:string}} opts
 */
export function renderPageScene(kind, { lang = 'th', title = '', subtitle = '', actions = '' } = {}) {
  const build = SCENES[kind] || SCENES.trips;
  return `
  <div class="page-scene ps-${kind}">
    <div class="ps-copy">
      <h1 class="page-title">${title}</h1>
      ${subtitle ? `<p class="ps-sub">${subtitle}</p>` : ''}
      ${actions ? `<div class="btn-row ps-actions">${actions}</div>` : ''}
    </div>
    <div class="ps-art" aria-hidden="true">
      <svg viewBox="0 0 232 84" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="${gradId(kind)}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--grad-1)"/>
            <stop offset="100%" stop-color="var(--grad-2)"/>
          </linearGradient>
        </defs>
        ${build(kind)}
      </svg>
    </div>
  </div>`;
}
