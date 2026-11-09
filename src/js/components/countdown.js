// Countdown card (v35) — a calm, static “days to departure” card.
//
// v2–v34 drew an animated runner heading for Mt. Fuji with clouds, stars, dust
// and a looping bob. The calm pass (docs/UNSLOP-AUDIT-2026-11-08.md, moment 1)
// keeps the idea — the trip as a journey toward the mountain — but draws it the
// way a rail ticket would: one big number, one line of context, a thin track
// with a dot, and a flat silhouette of the mountain. Nothing moves; the number
// is refreshed once a minute.

const DAY_MS = 86400000;

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value) ? null : value;
  if (typeof value === 'object' && typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  // Trip dates are date-only values. Parse them in local calendar time instead
  // of UTC midnight (new Date('YYYY-MM-DD')), which shifts the day in UTC+ zones.
  const dateOnly = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const d = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value);
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

  // Planning window: from when the trip was created (fallback 180 days before
  // start), clamped so the dot is never stuck at either end of the track.
  const rawWindow = created ? (start.getTime() - created.getTime()) : (180 * DAY_MS);
  const windowMs = Math.min(Math.max(rawWindow, 21 * DAY_MS), 400 * DAY_MS);
  let progress = 1 - (absMs / windowMs);
  if (totalMs <= 0) progress = 1;
  progress = Math.min(1, Math.max(0, progress));

  return { days, hours, minutes, seconds, totalMs, progress, phase, startDate: start, endDate: end };
}

/** One plain sentence — no exclamation marks, no emoji. */
export function countdownHeadline(c, lang = 'th') {
  if (!c.startDate) return lang === 'th' ? 'ยังไม่กำหนดวันเดินทาง' : 'No date yet';
  if (c.phase === 'during') {
    const endDiff = c.endDate ? Math.ceil((c.endDate.getTime() - Date.now()) / DAY_MS) : 0;
    if (endDiff > 0) return lang === 'th' ? `กำลังเดินทาง · เหลือ ${endDiff} วัน` : `On the trip · ${endDiff} days left`;
    return lang === 'th' ? 'กำลังเดินทาง' : 'On the trip';
  }
  if (c.phase === 'after') {
    const ago = Math.max(1, Math.floor((Date.now() - c.startDate.getTime()) / DAY_MS));
    return lang === 'th' ? `เดินทางไปแล้ว ${ago} วัน` : `${ago} days ago`;
  }
  if (c.days === 0) return lang === 'th' ? `อีก ${c.hours} ชั่วโมง` : `${c.hours} hours to go`;
  return lang === 'th' ? `อีก ${c.days} วัน` : `${c.days} days to go`;
}

/* ---------------- presentation ---------------- */

function shortThai(d) {
  if (!d) return '';
  try { return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short' }).format(d); } catch { return ''; }
}

/** Day-of-trip progress while travelling (0–1), so the dot keeps moving on the trip. */
function tripProgress(c, now = new Date()) {
  if (c.phase !== 'during' || !c.startDate) return 1;
  const end = c.endDate ? c.endDate.getTime() + DAY_MS : c.startDate.getTime() + DAY_MS;
  const span = Math.max(DAY_MS, end - c.startDate.getTime());
  return Math.min(1, Math.max(0, (now.getTime() - c.startDate.getTime()) / span));
}

/** The figure, its unit and the caption under it, for the current phase. */
function figureFor(c, lang = 'th') {
  const th = lang === 'th';
  if (!c.startDate) return { value: '—', unit: '', caption: th ? 'ยังไม่กำหนดวันเดินทาง' : 'No travel date yet', text: false };
  if (c.phase === 'before') {
    if (c.days === 0) return { value: String(c.hours), unit: th ? 'ชม.' : 'h', caption: th ? 'ก่อนออกเดินทาง' : 'until departure', text: false };
    return { value: String(c.days), unit: th ? 'วัน' : c.days === 1 ? 'day' : 'days', caption: th ? 'ก่อนออกเดินทาง' : 'until departure', text: false };
  }
  if (c.phase === 'during') {
    const dayNo = Math.floor((Date.now() - c.startDate.getTime()) / DAY_MS) + 1;
    const total = c.endDate ? Math.round((c.endDate.getTime() - c.startDate.getTime()) / DAY_MS) + 1 : 0;
    return {
      value: String(Math.max(1, dayNo)),
      unit: total ? (th ? `/ ${total} วัน` : `/ ${total} days`) : (th ? 'วัน' : 'days'),
      caption: th ? 'วันที่ของทริป' : 'day of the trip',
      text: false
    };
  }
  return { value: th ? 'จบทริปแล้ว' : 'Trip finished', unit: '', caption: countdownHeadline(c, lang), text: true };
}

function trackEnds(c, createdAt, lang = 'th') {
  const th = lang === 'th';
  if (!c.startDate) return ['', ''];
  if (c.phase === 'during' || c.phase === 'after') {
    return [`${th ? 'เริ่ม' : 'Start'} ${shortThai(c.startDate)}`, `${th ? 'กลับ' : 'Back'} ${shortThai(c.endDate || c.startDate)}`];
  }
  const created = toDate(createdAt);
  return [created ? `${th ? 'เริ่มวางแผน' : 'Planning since'} ${shortThai(created)}` : (th ? 'วันนี้' : 'Today'),
    `${th ? 'ออกเดินทาง' : 'Departure'} ${shortThai(c.startDate)}`];
}

/** A flat silhouette of the mountain — one tint of the accent, a paper-white cap. */
function fujiMark() {
  return `
  <svg class="cdc-fuji" viewBox="0 0 160 72" aria-hidden="true" focusable="false">
    <path d="M2 70 C 40 66, 62 52, 80 10 C 98 52, 120 66, 158 70 Z" fill="var(--cdc-mountain)"/>
    <path d="M66 31 C 71 22, 75 15, 80 10 C 85 15, 89 22, 94 31 L 88 28 L 84 33 L 80 28 L 76 33 L 72 28 Z" fill="var(--cdc-snow)"/>
  </svg>`;
}

/**
 * Card body markup. Call mountCountdown() to keep the number fresh.
 */
export function renderCountdownScene({ startDate, endDate, createdAt, lang = 'th' } = {}) {
  const now = new Date();
  const c = computeCountdown({ startDate, endDate, createdAt, now });
  const p = c.phase === 'during' ? tripProgress(c, now) : c.progress;
  const pct = Math.round(p * 100);
  const f = figureFor(c, lang);
  const [left, right] = trackEnds(c, createdAt, lang);
  return `
  <div class="countdown-scene cdc is-${c.phase}${c.startDate ? '' : ' is-empty'}" data-cd-root style="--cd-progress:${pct}%;">
    <div class="cdc-top">
      <div class="cdc-main">
        <div class="cdc-figure${f.text ? ' is-text' : ''}">
          <span class="cdc-days" data-cd-days>${f.value}</span>
          ${f.unit ? `<span class="cdc-unit" data-cd-unit>${f.unit}</span>` : '<span class="cdc-unit" data-cd-unit></span>'}
        </div>
        <p class="cdc-caption" data-cd-eta>${f.caption}</p>
      </div>
      ${fujiMark()}
    </div>
    ${c.startDate ? `
    <div class="cdc-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"
      aria-label="${lang === 'th' ? 'ความคืบหน้าสู่วันเดินทาง' : 'Progress to departure'}">
      <span class="cdc-track-fill" data-cd-bar style="width:${pct}%"></span>
      <span class="cdc-track-dot" data-cd-dot style="left:${pct}%"></span>
    </div>
    <div class="cdc-ends"><span data-cd-left>${left}</span><span data-cd-right>${right}</span></div>` : ''}
  </div>`;
}

/**
 * Mount (or refresh) the countdown inside #rootId. Returns { update, destroy }.
 */
export function mountCountdown(rootId, { startDate, endDate, createdAt, lang = 'th' } = {}) {
  const root = document.getElementById(rootId);
  if (!root) return { update() {}, destroy() {} };
  root.innerHTML = renderCountdownScene({ startDate, endDate, createdAt, lang });

  let timer = null;
  const destroy = () => { if (timer) { clearInterval(timer); timer = null; } };
  const update = () => {
    const el = document.getElementById(rootId);
    if (!el || !el.isConnected) { destroy(); return; }
    const scene = el.querySelector('[data-cd-root]');
    if (!scene) return;
    const now = new Date();
    const c = computeCountdown({ startDate, endDate, createdAt, now });
    const p = c.phase === 'during' ? tripProgress(c, now) : c.progress;
    const pct = Math.round(p * 100);
    const f = figureFor(c, lang);
    scene.style.setProperty('--cd-progress', `${pct}%`);
    ['before', 'during', 'after'].forEach(ph => scene.classList.toggle(`is-${ph}`, c.phase === ph));
    const set = (sel, txt) => { const n = scene.querySelector(sel); if (n && n.textContent !== txt) n.textContent = txt; };
    set('[data-cd-days]', f.value);
    set('[data-cd-unit]', f.unit);
    set('[data-cd-eta]', f.caption);
    const bar = scene.querySelector('[data-cd-bar]');
    if (bar) bar.style.width = `${pct}%`;
    const dot = scene.querySelector('[data-cd-dot]');
    if (dot) dot.style.left = `${pct}%`;
    scene.querySelector('.cdc-track')?.setAttribute('aria-valuenow', String(pct));
  };

  // The figure is in days (hours on the last day) — once a minute is plenty.
  timer = setInterval(update, 60000);
  return { update, destroy };
}
