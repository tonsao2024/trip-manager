// Countdown v2 — animated "runner heading to Fuji" scene.
// The closer the trip start date gets, the closer the runner gets to Mount Fuji.
// Pure CSS animations (transform/opacity only) + a tiny tick to update numbers.

const DAY_MS = 86400000;

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value) ? null : value;
  if (typeof value === 'object' && typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  const d = new Date(value);
  return isNaN(d) ? null : d;
}

/**
 * Pure calculation — exported for unit tests.
 * @returns {{days:number,hours:number,minutes:number,seconds:number,totalMs:number,
 *            progress:number,phase:'before'|'during'|'after',startDate:Date|null,endDate:Date|null}}
 */
export function computeCountdown({ startDate, endDate, createdAt, now = new Date() } = {}) {
  const start = toDate(startDate);
  const end = toDate(endDate);
  const created = toDate(createdAt);
  if (!start) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0, progress: 0, phase: 'before', startDate: null, endDate: end };
  }
  const totalMs = start.getTime() - now.getTime();
  const absMs = Math.max(0, totalMs);
  const days = Math.floor(absMs / DAY_MS);
  const hours = Math.floor((absMs % DAY_MS) / 3600000);
  const minutes = Math.floor((absMs % 3600000) / 60000);
  const seconds = Math.floor((absMs % 60000) / 1000);

  let phase = 'before';
  if (totalMs <= 0) phase = (end && now.getTime() > end.getTime() + DAY_MS) ? 'after' : 'during';

  // Planning window: from when the trip was created (fallback 180 days before start),
  // clamped so the animation always looks alive.
  const rawWindow = created ? (start.getTime() - created.getTime()) : (180 * DAY_MS);
  const windowMs = Math.min(Math.max(rawWindow, 21 * DAY_MS), 400 * DAY_MS);
  let progress = 1 - (absMs / windowMs);
  if (totalMs <= 0) progress = 1;
  progress = Math.min(1, Math.max(0, progress));

  return { days, hours, minutes, seconds, totalMs, progress, phase, startDate: start, endDate: end };
}

export function countdownHeadline(c, lang = 'th') {
  if (!c.startDate) return lang === 'th' ? 'ยังไม่กำหนดวันเดินทาง' : 'No date yet';
  if (c.phase === 'during') {
    const endDiff = c.endDate ? Math.ceil((c.endDate.getTime() - Date.now()) / DAY_MS) : 0;
    if (endDiff > 0) return lang === 'th' ? `กำลังเดินทาง • เหลือ ${endDiff} วัน` : `On the trip • ${endDiff} days left`;
    return lang === 'th' ? 'กำลังเดินทาง 🎒' : 'On the trip 🎒';
  }
  if (c.phase === 'after') {
    const ago = Math.max(1, Math.floor((Date.now() - c.startDate.getTime()) / DAY_MS));
    return lang === 'th' ? `เดินทางไปแล้ว ${ago} วัน` : `${ago} days ago`;
  }
  if (c.days === 0) return lang === 'th' ? `อีก ${c.hours} ชั่วโมง!` : `${c.hours} hours to go!`;
  return lang === 'th' ? `อีก ${c.days} วัน` : `${c.days} days to go`;
}

function paceLabel(c, lang = 'th') {
  if (c.phase !== 'before') return lang === 'th' ? 'ถึงจุดหมายแล้ว!' : 'Arrived!';
  if (c.days <= 1) return lang === 'th' ? '🏁 ใกล้ถึงฟูจิแล้ว!' : '🏁 Almost there!';
  if (c.days <= 7) return lang === 'th' ? 'เร่งความเร็วเต็มที่!' : 'Full speed ahead!';
  if (c.days <= 30) return lang === 'th' ? 'วิ่งขึ้นเนินแล้ว' : 'Climbing the hill';
  if (c.days <= 90) return lang === 'th' ? 'ออกสตาร์ทแล้ว' : 'On the road';
  return lang === 'th' ? 'เตรียมตัวออกเดินทาง' : 'Getting ready';
}

/** Inline SVG of the runner — limbs animate with CSS. */
function runnerSvg() {
  return `
  <svg class="runner-svg" viewBox="0 0 64 88" aria-hidden="true">
    <g class="runner-bob">
      <ellipse class="runner-shadow" cx="30" cy="85" rx="17" ry="3.4"/>
      <g class="runner-leg runner-leg-back">
        <line x1="30" y1="56" x2="24" y2="72" stroke-width="6"/>
        <line x1="24" y1="72" x2="16" y2="82" stroke-width="5.5"/>
      </g>
      <g class="runner-leg runner-leg-front">
        <line x1="30" y1="56" x2="38" y2="70" stroke-width="6"/>
        <line x1="38" y1="70" x2="46" y2="80" stroke-width="5.5"/>
      </g>
      <rect class="runner-body" x="24" y="30" width="14" height="27" rx="7"/>
      <rect class="runner-pack" x="18" y="32" width="9" height="16" rx="4"/>
      <g class="runner-arm runner-arm-back">
        <line x1="31" y1="37" x2="21" y2="47" stroke-width="5"/>
      </g>
      <g class="runner-arm runner-arm-front">
        <line x1="32" y1="36" x2="45" y2="44" stroke-width="5"/>
      </g>
      <circle class="runner-head" cx="32" cy="21" r="8.6"/>
      <path class="runner-cap" d="M22.5 18.5 a9.6 9.6 0 0 1 19 0 z"/>
      <line class="runner-cap-brim" x1="31" y1="14" x2="44" y2="15.4" stroke-width="3"/>
    </g>
  </svg>`;
}

function fujiSvg() {
  return `
  <svg class="fuji-scene-svg" viewBox="0 0 320 150" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <linearGradient id="cnt-fuji" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="color-mix(in srgb, var(--grad-1) 42%, #ffffff)"/>
        <stop offset="100%" stop-color="color-mix(in srgb, var(--grad-2) 60%, #ffffff)"/>
      </linearGradient>
      <linearGradient id="cnt-snow" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(255,255,255,0.98)"/>
        <stop offset="100%" stop-color="rgba(255,255,255,0.72)"/>
      </linearGradient>
    </defs>
    <path d="M8 142 C 70 138, 118 128, 160 44 C 202 128, 250 138, 312 142 Z" fill="url(#cnt-fuji)"/>
    <path d="M132 84 C 142 62, 150 52, 160 44 C 170 52, 178 62, 188 84 L 176 78 L 168 88 L 160 78 L 152 88 L 144 78 Z" fill="url(#cnt-snow)"/>
    <path d="M0 142 H320" stroke="color-mix(in srgb, var(--grad-1) 30%, var(--border))" stroke-width="2"/>
  </svg>`;
}

/**
 * Full scene markup. Call mountCountdown() to keep the numbers + runner in sync.
 */
export function renderCountdownScene({ startDate, endDate, createdAt, lang = 'th', compact = false } = {}) {
  const c = computeCountdown({ startDate, endDate, createdAt, now: new Date() });
  const pct = Math.round(c.progress * 100);
  const arrived = c.phase !== 'before';
  return `
  <div class="countdown-scene ${arrived ? 'is-arrived' : ''}" data-cd-root style="--cd-progress:${pct}%; --cd-runner:${(0.06 + c.progress * 0.6).toFixed(3)};">
    <div class="cd-sky">
      <span class="cd-sun"></span>
      <span class="cd-cloud cd-cloud-1"></span>
      <span class="cd-cloud cd-cloud-2"></span>
      <span class="cd-cloud cd-cloud-3"></span>
      <span class="cd-star cd-star-1"></span>
      <span class="cd-star cd-star-2"></span>
      <span class="cd-star cd-star-3"></span>
    </div>
    <div class="cd-ground"></div>
    <div class="cd-fuji">${fujiSvg()}<span class="cd-flag ${arrived ? 'show' : ''}"></span></div>
    <div class="cd-track">
      <span class="cd-dust cd-dust-1"></span>
      <span class="cd-dust cd-dust-2"></span>
      <div class="cd-runner">${runnerSvg()}</div>
    </div>
    <div class="cd-hud">
      <div class="cd-days" data-cd-days>--</div>
      <div class="cd-meta">
        <span class="cd-phase" data-cd-phase>${paceLabel(c, lang)}</span>
        <span class="cd-eta" data-cd-eta>${countdownHeadline(c, lang)}</span>
      </div>
    </div>
    ${compact ? '' : `
    <div class="cd-progress">
      <div class="cd-progress-fill" data-cd-bar style="width:${pct}%"></div>
      <span class="cd-progress-label" data-cd-pct>${pct}%</span>
    </div>`}
  </div>`;
}

/**
 * Mount (or refresh) the animated countdown inside #rootId.
 * Returns { update, destroy }.
 */
export function mountCountdown(rootId, { startDate, endDate, createdAt, lang = 'th', compact = false } = {}) {
  const root = document.getElementById(rootId);
  if (!root) return { update() {}, destroy() {} };
  root.innerHTML = renderCountdownScene({ startDate, endDate, createdAt, lang, compact });

  let timer = null;
  const update = () => {
    const el = document.getElementById(rootId);
    if (!el || !el.isConnected) { destroy(); return; }
    const scene = el.querySelector('[data-cd-root]');
    if (!scene) return;
    const c = computeCountdown({ startDate, endDate, createdAt, now: new Date() });
    scene.style.setProperty('--cd-progress', `${Math.round(c.progress * 100)}%`);
    scene.style.setProperty('--cd-runner', (0.06 + c.progress * 0.6).toFixed(3));
    scene.classList.toggle('is-arrived', c.phase !== 'before');
    scene.classList.toggle('is-close', c.phase === 'before' && c.days <= 30);
    const p = (sel, txt) => { const n = scene.querySelector(sel); if (n) n.textContent = txt; };
    p('[data-cd-phase]', paceLabel(c, lang));
    p('[data-cd-eta]', countdownHeadline(c, lang));
    p('[data-cd-days]', c.phase === 'before' ? String(c.days) : (c.phase === 'during' ? '🎒' : '✓'));
    const bar = scene.querySelector('[data-cd-bar]');
    if (bar) bar.style.width = `${Math.round(c.progress * 100)}%`;
    p('[data-cd-pct]', `${Math.round(c.progress * 100)}%`);
    const flag = scene.querySelector('.cd-flag');
    if (flag) flag.classList.toggle('show', c.phase !== 'before');
  };
  const destroy = () => { if (timer) { clearInterval(timer); timer = null; } };

  // Live big-number ("อีก N วัน") counter — refreshed every 30s is plenty and cheap.
  timer = setInterval(update, 30000);
  // Kick a frame later so entrance animations play after paint
  setTimeout(update, 400);
  return { update, destroy };
}
