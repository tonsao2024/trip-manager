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

/** Map the daily forecast to a small set of decorative sky states. */
export function countdownWeatherState(day) {
  if (!day || day.missing) return 'default';
  if (day.tone === 'sun') return 'sun';
  if (day.tone === 'cloud') return day.icon === 'cloud-sun' ? 'partly-cloudy' : 'cloud';
  return ['rain', 'snow', 'storm'].includes(day.tone) ? day.tone : 'default';
}

/** Apply only a confirmed forecast for today. A missing forecast clears old city data. */
export function setCountdownWeather(scene, day, city, lang = 'th', today = '') {
  if (!scene) return;
  const state = day && day.date === today ? countdownWeatherState(day) : 'default';
  scene.dataset.weather = state;
  const label = scene.querySelector('[data-cd-weather-label]');
  if (!label) return;
  const description = lang === 'th' ? day?.labelTh : day?.labelEn;
  label.textContent = state !== 'default' && city && description
    ? `${lang === 'th' ? 'พยากรณ์วันนี้' : "Today's forecast"} · ${city} · ${description}` : '';
  label.hidden = !label.textContent;
}

/** A flat silhouette of the mountain — one tint of the accent, a paper-white cap
 *  and the switchback trail that climbs its flank. Rendered as a full-bleed
 *  backdrop behind the card's content (aria-hidden). */
function journeyArtwork({ hasDate } = {}) {
  return `<div class="cdc-journey${hasDate ? '' : ' is-empty'}" aria-hidden="true">
    <div class="cdc-horizon"></div>
    <svg class="cdc-precip cdc-rain" viewBox="0 0 400 210" preserveAspectRatio="none" focusable="false"><path d="M35 18l-9 21 M105 35l-9 21 M175 12l-9 21 M245 30l-9 21 M320 13l-9 21 M390 28l-9 21 M65 105l-9 21 M140 122l-9 21 M220 100l-9 21 M295 118l-9 21 M365 105l-9 21 M54 55l-9 21 M145 75l-9 21 M210 63l-9 21 M280 70l-9 21 M350 62l-9 21 M24 155l-9 21 M110 170l-9 21 M185 153l-9 21 M260 166l-9 21 M335 155l-9 21 M398 176l-9 21"/></svg>
    <svg class="cdc-precip cdc-snow" viewBox="0 0 400 210" preserveAspectRatio="none" focusable="false"><g><circle cx="35" cy="18" r="3"/><circle cx="105" cy="35" r="3"/><circle cx="175" cy="12" r="3"/><circle cx="245" cy="30" r="3"/><circle cx="320" cy="13" r="3"/><circle cx="390" cy="28" r="3"/><circle cx="65" cy="105" r="3"/><circle cx="140" cy="122" r="3"/><circle cx="220" cy="100" r="3"/><circle cx="295" cy="118" r="3"/><circle cx="365" cy="105" r="3"/><circle cx="55" cy="60" r="2"/><circle cx="145" cy="75" r="2"/><circle cx="210" cy="63" r="2.5"/><circle cx="280" cy="70" r="2"/><circle cx="350" cy="62" r="2.5"/><circle cx="24" cy="155" r="2"/><circle cx="110" cy="170" r="3"/><circle cx="185" cy="153" r="2"/><circle cx="260" cy="166" r="3"/><circle cx="335" cy="155" r="2"/><circle cx="398" cy="176" r="3"/></g></svg>
    <div class="cdc-weather-sheen"></div>
    <svg class="cdc-storm-wind" viewBox="0 0 320 150" preserveAspectRatio="none" focusable="false"><path d="M125 22h104q18 0 18-12t-17-8 M176 54h104q19 0 19-12t-18-8 M110 103h104q18 0 18 11t-17 10 M240 130h60"/></svg>
    <svg class="cdc-lightning" viewBox="0 0 42 72" focusable="false"><path d="M24 2 5 39h14l-3 31 22-42H23Z" fill="#ffe5a1" stroke="#d69c46" stroke-width="2" stroke-linejoin="round"/></svg>
    <svg class="cdc-sun" viewBox="0 0 64 64" focusable="false"><g fill="none" stroke="#f2a93b" stroke-width="3" stroke-linecap="round"><path d="M32 3v6M32 55v6M3 32h6M55 32h6M11.5 11.5l4.2 4.2M48.3 48.3l4.2 4.2M52.5 11.5l-4.2 4.2M15.7 48.3l-4.2 4.2"/></g><circle cx="32" cy="32" r="19" fill="#ffce64"/></svg>
    <svg class="cdc-moon" viewBox="0 0 64 64" focusable="false"><path d="M47 49A24 24 0 0 1 24 7a23 23 0 1 0 23 42Z" fill="#f8df9d"/><circle cx="46" cy="13" r="2" fill="#f8df9d"/><circle cx="55" cy="24" r="1.5" fill="#f8df9d"/></svg>
    <svg class="cdc-cloud cdc-cloud--back" viewBox="0 0 54 24" focusable="false"><path d="M8 20a7 7 0 0 1-1-14 10 10 0 0 1 19-1 8 8 0 0 1 12 7 6 6 0 0 1-1 12H8Z" fill="var(--cdc-cloud)"/></svg>
    <svg class="cdc-cloud cdc-cloud--front" viewBox="0 0 54 24" focusable="false"><path d="M8 20a7 7 0 0 1-1-14 10 10 0 0 1 19-1 8 8 0 0 1 12 7 6 6 0 0 1-1 12H8Z" fill="var(--cdc-cloud)"/></svg>
    <svg class="cdc-cloud cdc-cloud--extra" viewBox="0 0 54 24" focusable="false"><path d="M8 20a7 7 0 0 1-1-14 10 10 0 0 1 19-1 8 8 0 0 1 12 7 6 6 0 0 1-1 12H8Z" fill="var(--cdc-cloud)"/></svg>
    <svg class="cdc-fuji" viewBox="0 0 180 100" focusable="false">
      <path d="M2 98 C 42 91, 67 58, 90 9 C 113 58, 138 91, 178 98 Z" fill="var(--cdc-mountain)"/>
      <path class="cdc-route" d="M150 96 L130 86 L136 78 L122 68 L114 58 L106 51" fill="none"/>
      <path d="M72 45 C 79 30, 84 17, 90 9 C 96 17, 101 30, 108 45 L 100 41 L 95 48 L 90 42 L 85 48 L 80 41 Z" fill="var(--cdc-snow)"/>
      <path d="M0 98 Q90 88 180 98V100H0Z" fill="var(--cdc-foothill)"/>
    </svg>
    ${hasDate ? `<svg class="cdc-fireworks" viewBox="0 0 110 90" focusable="false">
      <g class="cdc-firework cdc-firework--one"><path d="M22 42V28M22 56V70M8 49H0M36 49H44M12 39 6 33M32 59 38 65M32 39 38 33M12 59 6 65"/><circle cx="22" cy="49" r="3"/></g>
      <g class="cdc-firework cdc-firework--two"><path d="M72 25V14M72 36V47M61 30H50M83 30H94M64 22 58 16M80 38 86 44M80 22 86 16M64 38 58 44"/><circle cx="72" cy="30" r="2.5"/></g>
      <g class="cdc-firework cdc-firework--three"><path d="M48 68V58M48 78V88M38 73H28M58 73H68M41 66 36 61M55 80 60 85M55 66 60 61M41 80 36 85"/><circle cx="48" cy="73" r="2"/></g>
    </svg>` : ''}
  </div>`;
}

/** Accessories are grouped by forecast and remain decorative in both poses. */
function travellerOutfits(celebrating = false) {
  return `<g${celebrating ? ' transform="translate(-2 -1)"' : ''}>
    <g class="cdc-outfit cdc-outfit--sun">
      <path d="M19 10 Q20 3 27 3 Q33 3 35 10Z" fill="#f2a53b" stroke="#c77724" stroke-width=".7"/>
      <path d="M18 10 Q26 12 37 10" fill="none" stroke="#c77724" stroke-width="2" stroke-linecap="round"/>
      <path d="M26 12h4.3v2.5H26z M31 12h4v2.5h-4z" fill="#283b51" stroke="#283b51" stroke-width=".5"/>
    </g>
    <g class="cdc-outfit cdc-outfit--cloud">
      <path d="M23 21 Q18 22 19 31 L23 37 L31 34 L29 24 Q28 20 23 21Z" fill="#6f9eb1"/>
      <path d="M24 22l3 13" stroke="#d9eef0" stroke-width="1"/>
    </g>
    <g class="cdc-outfit cdc-outfit--rain">
      <path d="M20 12 Q18 3 27 3 Q36 3 35 13 L32 11 Q31 7 27 7 Q22 7 21 13Z" fill="#e8a923" stroke="#b87917" stroke-width=".8"/>
      <path d="M23 20 Q18 21 18 30 L21 38 L33 35 L30 23 Q28 20 23 20Z" fill="#f4be32" stroke="#bc861c" stroke-width=".7"/>
      <path d="M24 22l3 13" stroke="#fff0b3" stroke-width="1"/>
    </g>
    <g class="cdc-outfit cdc-outfit--storm">
      <path d="M20 12 Q18 3 27 3 Q36 3 35 13 L32 11 Q31 7 27 7 Q22 7 21 13Z" fill="#3c6482" stroke="#26465c" stroke-width=".8"/>
      <path d="M23 20 Q18 21 17 30 L20 39 L34 36 L30 23 Q28 20 23 20Z" fill="#426e8b" stroke="#294d63" stroke-width=".7"/>
      <path d="M24 22l3 13 M20 33l11-3" stroke="#b8d7dd" stroke-width="1"/>
    </g>
    <g class="cdc-outfit cdc-outfit--snow">
      <path d="M20 10 Q20 3 27 3 Q34 3 35 10Z" fill="#a74d62"/><path d="M19 10h16" stroke="#e9b4b6" stroke-width="2" stroke-linecap="round"/><circle cx="27" cy="3" r="2" fill="#f8dfd7"/>
      <path d="M22 20 Q17 21 18 31 L21 38 L33 35 L30 23 Q28 20 22 20Z" fill="#5c80a0" stroke="#3e607f" stroke-width=".7"/>
      <path d="M21 20 Q26 23 32 20 L32 23 Q27 25 21 23Z M26 23l-1 8 3 1 1-8Z" fill="#d96468"/>
    </g>
  </g>`;
}

/** Decorative traveller; the limbs animate independently while the marker follows progress. */
function runnerMark() {
  return `<span class="cdc-runner" data-cd-runner aria-hidden="true">
    <svg class="cdc-runner-svg" viewBox="0 0 48 56" focusable="false">
      <ellipse cx="24" cy="47" rx="10" ry="2.2" fill="rgba(38,52,73,.16)"/>
      <g class="cdc-runner-body">
        <path d="M20 20 L15 29 L9 27" class="cdc-runner-arm cdc-runner-arm--back"/>
        <path d="M23 35 L17 43 L10 44" class="cdc-runner-leg cdc-runner-leg--back"/>
        <path d="M24 20 Q18 22 19 31 L23 37 L31 34 L29 24 Q28 20 24 20Z" fill="var(--cdc-jacket)"/>
        <path d="M19 23 Q14 22 14 27 L15 33 L20 33Z" fill="var(--brand-yellow-raw)"/>
        <circle cx="27" cy="13" r="7" fill="#f3bd91"/>
        <path d="M20 13 Q19 5 27 5 Q34 5 34 12 Q30 10 27 10 Q25 14 20 13Z" fill="#263449"/>
        <circle cx="30" cy="13" r=".8" fill="#263449"/>
        ${travellerOutfits()}
        <path d="M27 35 L33 42 L39 41" class="cdc-runner-leg cdc-runner-leg--front"/>
        <path d="M27 23 L32 29 L37 26" class="cdc-runner-arm cdc-runner-arm--front"/>
        <g class="cdc-umbrella"><path d="M35 0 L37 26" fill="none" stroke="#344a5d" stroke-width="1.4" stroke-linecap="round"/><path d="M18 4 Q20 -7 34 -8 Q47 -8 49 4 Q45 1 41 4 Q37 1 33 4 Q29 1 25 4 Q21 1 18 4Z" fill="#ed6f77" stroke="#b44e60" stroke-width="1"/><path d="M34 -8 Q27 -4 25 4 M34 -8 Q39 -4 41 4" fill="none" stroke="#ffd6ce" stroke-width=".8"/></g>
      </g>
    </svg>
    <svg class="cdc-celebrate-svg" viewBox="0 0 48 56" focusable="false">
      <ellipse cx="24" cy="47" rx="11" ry="2.2" fill="rgba(38,52,73,.16)"/>
      <path d="M21 35 18 49 14 51M28 35 31 49 35 51" fill="none" stroke="#263449" stroke-width="4.5" stroke-linecap="round"/>
      <path d="M20 19Q16 21 18 28L20 37 31 37 32 25Q32 19 27 19Z" fill="var(--cdc-jacket)"/>
      <path d="M20 23 12 14 8 8M30 23 37 14 40 8" fill="none" stroke="#f3bd91" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="25" cy="12" r="6.5" fill="#f3bd91"/>
      <path d="M19 12Q18 4 25 4 33 4 32 12 28 9 25 9 23 13 19 12Z" fill="#263449"/>
      ${travellerOutfits(true)}
      <g class="cdc-umbrella"><path d="M37 -12 L40 8" fill="none" stroke="#344a5d" stroke-width="1.4" stroke-linecap="round"/><path d="M20 -9 Q22 -20 36 -21 Q49 -21 51 -9 Q47 -12 43 -9 Q39 -12 35 -9 Q31 -12 27 -9 Q23 -12 20 -9Z" fill="#ed6f77" stroke="#b44e60" stroke-width="1"/><path d="M36 -21 Q29 -17 27 -9 M36 -21 Q41 -17 43 -9" fill="none" stroke="#ffd6ce" stroke-width=".8"/></g>
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
        <div class="cdc-figure${f.text ? ' is-text' : ''}${!f.text && f.value.length > 3 ? ' is-long' : ''}">
          <span class="cdc-days" data-cd-days>${f.value}</span>
          ${f.unit ? `<span class="cdc-unit" data-cd-unit>${f.unit}</span>` : '<span class="cdc-unit" data-cd-unit></span>'}
        </div>
        <p class="cdc-caption" data-cd-eta>${f.caption}</p>
        <p class="cdc-weather-label" data-cd-weather-label hidden></p>
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
    scene.querySelector('.cdc-figure')?.classList.toggle('is-long', !f.text && f.value.length > 3);
  };

  // The figure is in days (hours on the last day) — once a minute is plenty.
  timer = setInterval(update, 60000);
  return { update, destroy };
}
