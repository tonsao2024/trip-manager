// Countdown card — a traveller runs along the journey progress track.

const DAY_MS = 86400000;

function zoneOrLocal(timezone) {
  try { const zone = timezone || 'Asia/Bangkok'; new Intl.DateTimeFormat('en', { timeZone: zone }).format(); return zone; }
  catch { return 'Asia/Bangkok'; }
}

function dateParts(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  const get = name => Number(parts.find(p => p.type === name)?.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') };
}

// Convert a calendar date to midnight in the trip's IANA timezone, accounting
// for DST. Date-only values are not UTC timestamps.
function midnightInZone(year, month, day, timezone) {
  const wall = Date.UTC(year, month - 1, day);
  let instant = wall;
  for (let i = 0; i < 4; i++) {
    const p = dateParts(new Date(instant), timezone);
    const represented = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const next = instant + wall - represented;
    if (next === instant) break;
    instant = next;
  }
  return new Date(instant);
}

function toDate(value, timezone) {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value) ? null : value;
  if (typeof value === 'object' && typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  const dateOnly = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const d = dateOnly ? midnightInZone(Number(dateOnly[1]), Number(dateOnly[2]), Number(dateOnly[3]), timezone) : new Date(value);
  return isNaN(d) ? null : d;
}

function calendarNumber(date, timezone) {
  const p = dateParts(date, timezone);
  return Math.floor(Date.UTC(p.year, p.month - 1, p.day) / DAY_MS);
}

function nextMidnight(date, timezone) {
  const p = dateParts(date, timezone);
  const next = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  return midnightInZone(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), timezone);
}

/**
 * Pure calculation — exported for unit tests.
 * @returns {{days:number,hours:number,minutes:number,seconds:number,totalMs:number,
 *            progress:number,phase:'before'|'during'|'after',startDate:Date|null,endDate:Date|null,planningStartDate:Date|null}}
 */
export function computeCountdown({ startDate, endDate, createdAt, timezone, now = new Date() } = {}) {
  const zone = zoneOrLocal(timezone);
  // Accept a Firestore Timestamp / ISO string as “now” too, never crash the card.
  now = toDate(now, zone) || new Date();
  const start = toDate(startDate, zone);
  const end = toDate(endDate, zone);
  const created = toDate(createdAt, zone);
  if (!start) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0, progress: 0, phase: 'before', startDate: null, endDate: end, planningStartDate: null, timezone: zone, now };
  }
  const totalMs = start.getTime() - now.getTime();
  const absMs = Math.max(0, totalMs);
  // “อีก N วัน” counts calendar days in the trip's timezone. The sub-day figures
  // are taken from the calendar-day boundary, not from `absMs % 24h`, so the card
  // never shows “อีก 0 วัน 10 ชม.” at 10:00 the day before departure.
  const days = Math.max(0, calendarNumber(start, zone) - calendarNumber(now, zone));
  const untilNextMidnight = nextMidnight(now, zone).getTime() - now.getTime();
  const remainderMs = days > 0 ? untilNextMidnight : absMs;
  const hours = Math.floor((remainderMs % DAY_MS) / 3600000);
  const minutes = Math.floor((remainderMs % 3600000) / 60000);
  const seconds = Math.floor((remainderMs % 60000) / 1000);

  let phase = 'before';
  if (totalMs <= 0) phase = now.getTime() >= nextMidnight(end || start, zone).getTime() ? 'after' : 'during';

  // Use the actual creation date when it predates departure. Without a usable
  // creation date, make the fallback window explicit in the track labels.
  const planningStartDate = created && created.getTime() < start.getTime()
    ? created : new Date(start.getTime() - 180 * DAY_MS);
  const windowMs = start.getTime() - planningStartDate.getTime();
  const progress = totalMs <= 0 ? 1 : Math.min(1, Math.max(0, (now.getTime() - planningStartDate.getTime()) / windowMs));

  return { days, hours, minutes, seconds, totalMs, progress, phase, startDate: start, endDate: end, planningStartDate, timezone: zone, now };
}

/** One plain sentence — no exclamation marks, no emoji. */
export function countdownHeadline(c, lang = 'th') {
  if (!c.startDate) return lang === 'th' ? 'ยังไม่กำหนดวันเดินทาง' : 'No date yet';
  if (c.phase === 'during') {
    const endDiff = c.endDate ? calendarNumber(c.endDate, c.timezone) - calendarNumber(c.now, c.timezone) : 0;
    if (endDiff > 0) return lang === 'th' ? `กำลังเดินทาง · เหลือ ${endDiff} วัน` : `On the trip · ${endDiff} days left`;
    return lang === 'th' ? 'กำลังเดินทาง' : 'On the trip';
  }
  if (c.phase === 'after') {
    const ago = Math.max(1, calendarNumber(c.now, c.timezone) - calendarNumber(c.startDate, c.timezone));
    return lang === 'th' ? `เดินทางไปแล้ว ${ago} วัน` : `${ago} days ago`;
  }
  if (c.days === 0) return lang === 'th' ? `อีก ${c.hours} ชั่วโมง` : `${c.hours} hours to go`;
  return lang === 'th' ? `อีก ${c.days} วัน` : `${c.days} days to go`;
}

/* ---------------- presentation ---------------- */

function shortDate(d, lang, timezone) {
  if (!d) return '';
  try { return new Intl.DateTimeFormat(lang === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', timeZone: timezone }).format(d); } catch { return ''; }
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
    const dayNo = calendarNumber(c.now, c.timezone) - calendarNumber(c.startDate, c.timezone) + 1;
    const total = c.endDate ? calendarNumber(c.endDate, c.timezone) - calendarNumber(c.startDate, c.timezone) + 1 : 0;
    return {
      value: String(Math.max(1, dayNo)),
      unit: total ? (th ? `/ ${total} วัน` : `/ ${total} days`) : (th ? 'วัน' : 'days'),
      caption: th ? 'วันที่ของทริป' : 'day of the trip',
      text: false
    };
  }
  return { value: th ? 'จบทริปแล้ว' : 'Trip finished', unit: '', caption: countdownHeadline(c, lang), text: true };
}

function trackEnds(c, lang = 'th') {
  const th = lang === 'th';
  if (!c.startDate) return ['', ''];
  return [`${th ? 'เริ่มนับ' : 'Countdown from'} ${shortDate(c.planningStartDate, lang, c.timezone)}`,
    `${th ? 'ออกเดินทาง' : 'Departure'} ${shortDate(c.startDate, lang, c.timezone)}`];
}

/** A flat silhouette of the mountain — one tint of the accent, a paper-white cap. */
function fujiMark() {
  return `
  <svg class="cdc-fuji" viewBox="0 0 160 72" aria-hidden="true" focusable="false">
    <path d="M2 70 C 40 66, 62 52, 80 10 C 98 52, 120 66, 158 70 Z" fill="var(--cdc-mountain)"/>
    <path d="M66 31 C 71 22, 75 15, 80 10 C 85 15, 89 22, 94 31 L 88 28 L 84 33 L 80 28 L 76 33 L 72 28 Z" fill="var(--cdc-snow)"/>
  </svg>`;
}

/** Decorative traveller; the limbs animate independently while the marker follows progress. */
function runnerMark() {
  return `<span class="cdc-runner" data-cd-runner aria-hidden="true">
    <svg class="cdc-runner-svg" viewBox="0 0 48 56" focusable="false">
      <g class="cdc-runner-body">
        <path d="M20 20 L15 29 L9 27" class="cdc-runner-arm cdc-runner-arm--back"/>
        <path d="M23 35 L17 43 L10 44" class="cdc-runner-leg cdc-runner-leg--back"/>
        <path d="M24 20 Q18 22 19 31 L23 37 L31 34 L29 24 Q28 20 24 20Z" fill="var(--primary)"/>
        <path d="M19 23 Q14 22 14 27 L15 33 L20 33Z" fill="var(--brand-yellow-raw)"/>
        <circle cx="27" cy="13" r="7" fill="#f3bd91"/>
        <path d="M20 13 Q19 5 27 5 Q34 5 34 12 Q30 10 27 10 Q25 14 20 13Z" fill="#263449"/>
        <circle cx="30" cy="13" r=".8" fill="#263449"/>
        <path d="M27 35 L33 42 L39 41" class="cdc-runner-leg cdc-runner-leg--front"/>
        <path d="M27 23 L32 29 L37 26" class="cdc-runner-arm cdc-runner-arm--front"/>
      </g>
    </svg>
  </span>`;
}

/**
 * Card body markup. Call mountCountdown() to keep the number fresh.
 */
export function renderCountdownScene({ startDate, endDate, createdAt, timezone, lang = 'th', now = new Date() } = {}) {
  const c = computeCountdown({ startDate, endDate, createdAt, timezone, now });
  const p = c.progress;
  const pct = Math.round(p * 100);
  const f = figureFor(c, lang);
  const [left, right] = trackEnds(c, lang);
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
    <p class="cdc-track-label" data-cd-track-label>${c.phase === 'before' ? (lang === 'th' ? 'นับถอยหลังสู่วันเดินทาง' : 'Countdown to departure') : (lang === 'th' ? 'ถึงวันเดินทางแล้ว' : 'Departure reached')}</p>
    <div class="cdc-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"
      aria-label="${lang === 'th' ? 'ความคืบหน้าสู่วันเดินทาง' : 'Progress to departure'}">
      <span class="cdc-track-fill" data-cd-bar style="width:${pct}%"></span>
      ${runnerMark()}
    </div>
    <div class="cdc-ends"><span data-cd-left>${left}</span><span data-cd-right>${right}</span></div>` : ''}
  </div>`;
}

/**
 * Mount (or refresh) the countdown inside #rootId. Returns { update, destroy }.
 */
export function mountCountdown(rootId, { startDate, endDate, createdAt, timezone, lang = 'th' } = {}) {
  const root = document.getElementById(rootId);
  if (!root) return { update() {}, destroy() {} };
  root.innerHTML = renderCountdownScene({ startDate, endDate, createdAt, timezone, lang });

  let timer = null;
  const destroy = () => { if (timer) { clearInterval(timer); timer = null; } };
  const update = () => {
    const el = document.getElementById(rootId);
    if (!el || !el.isConnected) { destroy(); return; }
    const scene = el.querySelector('[data-cd-root]');
    if (!scene) return;
    const now = new Date();
    const c = computeCountdown({ startDate, endDate, createdAt, timezone, now });
    const p = c.progress;
    const pct = Math.round(p * 100);
    const f = figureFor(c, lang);
    scene.style.setProperty('--cd-progress', `${pct}%`);
    ['before', 'during', 'after'].forEach(ph => scene.classList.toggle(`is-${ph}`, c.phase === ph));
    const set = (sel, txt) => { const n = scene.querySelector(sel); if (n && n.textContent !== txt) n.textContent = txt; };
    set('[data-cd-days]', f.value);
    set('[data-cd-unit]', f.unit);
    set('[data-cd-eta]', f.caption);
    set('[data-cd-track-label]', c.phase === 'before' ? (lang === 'th' ? 'นับถอยหลังสู่วันเดินทาง' : 'Countdown to departure') : (lang === 'th' ? 'ถึงวันเดินทางแล้ว' : 'Departure reached'));
    const bar = scene.querySelector('[data-cd-bar]');
    if (bar) bar.style.width = `${pct}%`;
    const track = scene.querySelector('.cdc-track');
    if (track) {
      track.setAttribute('aria-valuenow', String(pct));
      track.setAttribute('aria-label', lang === 'th' ? 'ความคืบหน้าสู่วันเดินทาง' : 'Progress to departure');
      const [left, right] = trackEnds(c, lang);
      set('[data-cd-left]', left);
      set('[data-cd-right]', right);
    }
    scene.querySelector('.cdc-figure')?.classList.toggle('is-text', f.text);
  };

  // The figure is in days (hours on the last day) — once a minute is plenty.
  timer = setInterval(update, 60000);
  return { update, destroy };
}
