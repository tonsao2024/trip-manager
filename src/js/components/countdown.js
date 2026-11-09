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

/** A flat silhouette of the mountain — one tint of the accent, a paper-white cap.
 *  Rendered as a full-bleed backdrop behind the card's content (aria-hidden). */
function journeyArtwork({ hasDate } = {}) {
  return `<div class="cdc-journey${hasDate ? '' : ' is-empty'}" aria-hidden="true">
    <div class="cdc-horizon"></div>
    <svg class="cdc-cloud cdc-cloud--back" viewBox="0 0 54 24" focusable="false"><path d="M8 20a7 7 0 0 1-1-14 10 10 0 0 1 19-1 8 8 0 0 1 12 7 6 6 0 0 1-1 12H8Z" fill="var(--cdc-cloud)"/></svg>
    <svg class="cdc-cloud cdc-cloud--front" viewBox="0 0 54 24" focusable="false"><path d="M8 20a7 7 0 0 1-1-14 10 10 0 0 1 19-1 8 8 0 0 1 12 7 6 6 0 0 1-1 12H8Z" fill="var(--cdc-cloud)"/></svg>
    <svg class="cdc-fuji" viewBox="0 0 180 100" focusable="false">
      <path d="M2 98 C 42 90, 66 58, 90 8 C 114 58, 138 90, 178 98 Z" fill="var(--cdc-mountain)"/>
      <path d="M72 44 C 79 29, 84 17, 90 8 C 96 17, 101 29, 108 44 L 100 40 L 95 47 L 90 41 L 85 47 L 80 40 Z" fill="var(--cdc-snow)"/>
      <path d="M0 98 Q90 88 180 98V100H0Z" fill="var(--cdc-foothill)"/>
    </svg>
    <div class="cdc-path"></div>
    ${hasDate ? `<svg class="cdc-fireworks" viewBox="0 0 110 90" focusable="false">
      <g class="cdc-firework cdc-firework--one"><path d="M22 42V28M22 56V70M8 49H0M36 49H44M12 39 6 33M32 59 38 65M32 39 38 33M12 59 6 65"/><circle cx="22" cy="49" r="3"/></g>
      <g class="cdc-firework cdc-firework--two"><path d="M72 25V14M72 36V47M61 30H50M83 30H94M64 22 58 16M80 38 86 44M80 22 86 16M64 38 58 44"/><circle cx="72" cy="30" r="2.5"/></g>
      <g class="cdc-firework cdc-firework--three"><path d="M48 68V58M48 78V88M38 73H28M58 73H68M41 66 36 61M55 80 60 85M55 66 60 61M41 80 36 85"/><circle cx="48" cy="73" r="2"/></g>
    </svg>` : ''}
  </div>`;
}

/** Decorative traveller; the limbs animate independently while the marker follows progress. */
function runnerMark() {
  return `<span class="cdc-runner" data-cd-runner aria-hidden="true">
    <svg class="cdc-runner-svg" viewBox="0 0 48 56" focusable="false">
      <ellipse cx="24" cy="53" rx="12" ry="2.5" fill="rgba(38,52,73,.18)"/>
      <g class="cdc-runner-body">
        <path d="M20 20 L15 29 L9 27" class="cdc-runner-arm cdc-runner-arm--back"/>
        <path d="M23 35 L17 43 L10 44" class="cdc-runner-leg cdc-runner-leg--back"/>
        <path d="M24 20 Q18 22 19 31 L23 37 L31 34 L29 24 Q28 20 24 20Z" fill="var(--cdc-jacket)"/>
        <path d="M19 23 Q14 22 14 27 L15 33 L20 33Z" fill="var(--brand-yellow-raw)"/>
        <circle cx="27" cy="13" r="7" fill="#f3bd91"/>
        <path d="M20 13 Q19 5 27 5 Q34 5 34 12 Q30 10 27 10 Q25 14 20 13Z" fill="#263449"/>
        <circle cx="30" cy="13" r=".8" fill="#263449"/>
        <path d="M27 35 L33 42 L39 41" class="cdc-runner-leg cdc-runner-leg--front"/>
        <path d="M27 23 L32 29 L37 26" class="cdc-runner-arm cdc-runner-arm--front"/>
      </g>
    </svg>
    <svg class="cdc-celebrate-svg" viewBox="0 0 48 56" focusable="false">
      <ellipse cx="24" cy="53" rx="13" ry="2.5" fill="rgba(38,52,73,.18)"/>
      <path d="M21 35 18 49 14 51M28 35 31 49 35 51" fill="none" stroke="#263449" stroke-width="4.5" stroke-linecap="round"/>
      <path d="M20 19Q16 21 18 28L20 37 31 37 32 25Q32 19 27 19Z" fill="var(--cdc-jacket)"/>
      <path d="M20 23 12 14 8 8M30 23 37 14 40 8" fill="none" stroke="#f3bd91" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="25" cy="12" r="6.5" fill="#f3bd91"/>
      <path d="M19 12Q18 4 25 4 33 4 32 12 28 9 25 9 23 13 19 12Z" fill="#263449"/>
    </svg>
  </span>`;
}

/**
 * Card markup — the whole illustrated card: header row, figure, scenic backdrop,
 * progress track and the date ends. Header strings are trusted to be
 * pre-escaped by the caller. Call mountCountdown() to keep the number fresh.
 */
export function renderCountdownScene({ startDate, endDate, createdAt, timezone, lang = 'th', now = new Date(), header = null } = {}) {
  const c = computeCountdown({ startDate, endDate, createdAt, timezone, now });
  const p = c.progress;
  const pct = Math.round(p * 100);
  const f = figureFor(c, lang);
  const [left, right] = trackEnds(c, lang);
  return `
  <div class="countdown-scene cdc is-${c.phase}${c.startDate ? '' : ' is-empty'}" data-cd-root style="--cd-progress:${pct}%;">
    ${header ? `<div class="cdc-head">
      <div class="cdc-head-text min-w-0">
        <h3 class="cdc-title">${header.title}</h3>
        <p id="live-since" class="cdc-sub"><span data-live-label>${header.liveLabel || ''}</span></p>
      </div>
      <a class="cdc-edit" href="${header.editHref}" aria-label="${header.editAria}">${header.editLabel}</a>
    </div>` : ''}
    <div class="cdc-top">
      <div class="cdc-main">
        <div class="cdc-figure${f.text ? ' is-text' : ''}">
          <span class="cdc-days" data-cd-days>${f.value}</span>
          ${f.unit ? `<span class="cdc-unit" data-cd-unit>${f.unit}</span>` : '<span class="cdc-unit" data-cd-unit></span>'}
        </div>
        <p class="cdc-caption" data-cd-eta>${f.caption}</p>
      </div>
    </div>
    ${journeyArtwork({ hasDate: !!c.startDate })}
    <div class="cdc-spacer" aria-hidden="true"></div>
    ${c.startDate ? `<div class="cdc-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"
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
export function mountCountdown(rootId, { startDate, endDate, createdAt, timezone, lang = 'th', header = null } = {}) {
  const root = document.getElementById(rootId);
  if (!root) return { update() {}, destroy() {} };
  root.innerHTML = renderCountdownScene({ startDate, endDate, createdAt, timezone, lang, header });

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
