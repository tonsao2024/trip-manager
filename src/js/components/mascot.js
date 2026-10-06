// ─────────────────────────────────────────────────────────────────────────────
// “น้องฟูจิ” — the fluffy, wiggling Mt. Fuji mascot for the dashboard (v18).
//
// Pure SVG + CSS (no images, no timers while off-screen), so it follows the
// active colour theme through the CSS variables and never hurts the export
// pipeline. Tapping the mascot makes it wiggle and say something encouraging —
// the line is chosen from the trip state (budget, countdown, unsettled bills).
//
//   renderFujiBuddy({ mood: 'happy', size: 128 })   → HTML string
//   mountFujiBuddy(container, { lang, stats })      → wires the tap behaviour
// ─────────────────────────────────────────────────────────────────────────────

const MOODS = {
  happy:   { eyes: 'happy',   mouth: 'smile',  blush: 0.85, hat: 'sun',  label: 'ร่าเริง' },
  cheer:   { eyes: 'star',    mouth: 'open',   blush: 1,    hat: 'flag', label: 'เชียร์' },
  chill:   { eyes: 'calm',    mouth: 'small',  blush: 0.5,  hat: 'cloud',label: 'ชิลล์' },
  sleepy:  { eyes: 'sleepy',  mouth: 'yawn',   blush: 0.35, hat: 'moon', label: 'ง่วง' },
  worry:   { eyes: 'worry',   mouth: 'wavy',   blush: 0.25, hat: 'sweat',label: 'ห่วง' },
  wallet:  { eyes: 'coin',    mouth: 'flat',   blush: 0.2,  hat: 'coin', label: 'เรื่องเงิน' }
};

let uid = 0;

function eyesFor(kind, gid) {
  switch (kind) {
    case 'happy':
      return `<path class="fuji-buddy-eye" d="M56 78 q7 -9 14 0" /><path class="fuji-buddy-eye" d="M92 78 q7 -9 14 0" />`;
    case 'calm':
      return `<path class="fuji-buddy-eye" d="M56 79 h14" /><path class="fuji-buddy-eye" d="M92 79 h14" />`;
    case 'sleepy':
      return `<path class="fuji-buddy-eye" d="M55 80 q7 6 15 0" /><path class="fuji-buddy-eye" d="M91 80 q7 6 15 0" />`;
    case 'worry':
      return `<g class="fuji-buddy-eye"><circle cx="63" cy="78" r="5.4"/><circle cx="64.6" cy="76.4" r="1.7" fill="#fff"/></g>
              <g class="fuji-buddy-eye"><circle cx="99" cy="78" r="5.4"/><circle cx="100.6" cy="76.4" r="1.7" fill="#fff"/></g>`;
    case 'coin':
      return `<circle class="fuji-buddy-eye" cx="63" cy="78" r="6.4" fill="var(--brand-yellow)" stroke="var(--brand-ink-raw)" stroke-width="1.6"/>
              <text x="63" y="82" text-anchor="middle" font-size="8" font-weight="800" fill="var(--brand-ink-raw)">฿</text>
              <circle class="fuji-buddy-eye" cx="99" cy="78" r="6.4" fill="var(--brand-yellow)" stroke="var(--brand-ink-raw)" stroke-width="1.6"/>
              <text x="99" y="82" text-anchor="middle" font-size="8" font-weight="800" fill="var(--brand-ink-raw)">฿</text>`;
    case 'star':
      return `<g class="fuji-buddy-eye fuji-buddy-star"><path d="M63 70 l2.6 5.4 5.9.8 -4.3 4.1 1.1 5.9 -5.3-2.9 -5.3 2.9 1.1-5.9 -4.3-4.1 5.9-.8z"/></g>
              <g class="fuji-buddy-eye fuji-buddy-star"><path d="M99 70 l2.6 5.4 5.9.8 -4.3 4.1 1.1 5.9 -5.3-2.9 -5.3 2.9 1.1-5.9 -4.3-4.1 5.9-.8z"/></g>`;
    default:
      return `<g class="fuji-buddy-eye"><ellipse cx="63" cy="78" rx="5.6" ry="6.6"/><circle class="fuji-buddy-spark" cx="65" cy="75.6" r="1.9" fill="#fff"/></g>
              <g class="fuji-buddy-eye"><ellipse cx="99" cy="78" rx="5.6" ry="6.6"/><circle class="fuji-buddy-spark" cx="101" cy="75.6" r="1.9" fill="#fff"/></g>`;
  }
}

function mouthFor(kind) {
  switch (kind) {
    case 'open': return `<ellipse cx="81" cy="94" rx="7.5" ry="6.4" fill="var(--brand-ink-raw)" opacity=".85"/><ellipse cx="81" cy="97" rx="4" ry="2.6" fill="#ff8fa3" opacity=".9"/>`;
    case 'yawn': return `<ellipse cx="81" cy="93" rx="5.6" ry="6.6" fill="var(--brand-ink-raw)" opacity=".7"/>`;
    case 'wavy': return `<path d="M70 93 q5.5 5 11 0 q5.5 -5 11 0" fill="none" stroke="var(--brand-ink-raw)" stroke-width="3" stroke-linecap="round"/>`;
    case 'flat': return `<path d="M71 93 h20" stroke="var(--brand-ink-raw)" stroke-width="3" stroke-linecap="round"/>`;
    case 'small': return `<path d="M75 92 q6 5 12 0" fill="none" stroke="var(--brand-ink-raw)" stroke-width="3" stroke-linecap="round"/>`;
    default: return `<path d="M70 90 q11 12 22 0" fill="none" stroke="var(--brand-ink-raw)" stroke-width="3.2" stroke-linecap="round"/>`;
  }
}

function hatFor(kind) {
  switch (kind) {
    case 'flag': return `<g class="fuji-buddy-hat"><path d="M81 22 v-16" stroke="var(--brand-ink-raw)" stroke-width="2.4" stroke-linecap="round"/><path d="M82 7 l16 5 -16 5z" fill="var(--brand-yellow)" stroke="var(--brand-ink-raw)" stroke-width="1.2"/></g>`;
    case 'moon': return `<g class="fuji-buddy-hat"><path d="M96 8 a11 11 0 1 0 6 18 a9 9 0 1 1 -6 -18z" fill="var(--brand-yellow)" opacity=".95"/></g>`;
    case 'coin': return `<g class="fuji-buddy-hat"><circle cx="81" cy="12" r="9" fill="var(--brand-yellow)" stroke="var(--brand-ink-raw)" stroke-width="1.6"/><text x="81" y="16" text-anchor="middle" font-size="10" font-weight="900" fill="var(--brand-ink-raw)">฿</text></g>`;
    case 'cloud': return `<g class="fuji-buddy-hat" opacity=".95"><ellipse cx="76" cy="14" rx="12" ry="7" fill="#fff"/><ellipse cx="88" cy="15" rx="9" ry="6" fill="#fff"/></g>`;
    case 'sweat': return `<g class="fuji-buddy-hat"><path d="M108 26 q6 9 0 13 q-6 -4 0 -13z" fill="var(--info)" opacity=".85"/></g>`;
    default: return ''; // 'sun' → the sun sits behind the mountain anyway
  }
}

/**
 * @param {{mood?: string, size?: number, id?: string, tagline?: string}} opts
 * @returns {string} HTML
 */
export function renderFujiBuddy({ mood = 'happy', size = 132, tagline = '', id = 'fuji-buddy' } = {}) {
  const def = MOODS[mood] || MOODS.happy;
  const gid = `fjb-${++uid}`;
  return `
  <div class="fuji-buddy mood-${mood}" id="${id}" role="img" tabindex="0"
       aria-label="${def.label}" title="${def.label}" style="width:${size}px;height:${ Math.round(size * 0.86) }px;">
    <svg viewBox="0 0 162 140" width="100%" height="100%" aria-hidden="true">
      <defs>
        <linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="var(--grad-1)"/>
          <stop offset="70%" stop-color="var(--grad-2)"/>
          <stop offset="100%" stop-color="color-mix(in srgb, var(--grad-2) 55%, #ffffff)"/>
        </linearGradient>
        <radialGradient id="${gid}-fur" cx="50%" cy="30%" r="70%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity=".55"/>
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
        </radialGradient>
      </defs>

      <g class="fuji-buddy-halo">
        <circle cx="128" cy="30" r="14" fill="var(--brand-yellow)" opacity=".92"/>
        <g class="fuji-buddy-rays" stroke="var(--brand-yellow)" stroke-width="3" stroke-linecap="round" opacity=".75">
          <path d="M128 8 v-6"/><path d="M146 14 l4 -4"/><path d="M152 32 h6"/><path d="M104 16 l-5 -4"/>
        </g>
      </g>

      <g class="fuji-buddy-body">
        <ellipse class="fuji-buddy-shadow" cx="81" cy="130" rx="46" ry="6"/>
        <!-- fluffy mountain -->
        <path class="fuji-buddy-mountain" d="M8 124 C 14 108 34 96 52 66 C 62 48 72 30 81 22 C 90 30 100 48 110 66 C 128 96 148 108 154 124 Z"
              fill="url(#${gid})"/>
        <path class="fuji-buddy-fur" d="M8 124 C 14 108 34 96 52 66 C 62 48 72 30 81 22 C 90 30 100 48 110 66 C 128 96 148 108 154 124 Z"
              fill="url(#${gid}-fur)"/>
        <!-- fluffy outline (scalloped) -->
        <path class="fuji-buddy-fluff" d="M8 124 q6 8 14 4 q7 8 15 3 q8 8 16 3 q8 8 16 3 q8 8 16 3 q8 8 16 3 q8 8 15 3 q8 8 15 -4 q8 4 14 -4" />
        <!-- snow cap -->
        <path class="fuji-buddy-snow" d="M54 62 C 63 46 72 30 81 23 C 90 30 99 46 108 62 C 100 60 96 66 90 63 C 84 60 78 66 72 63 C 66 60 60 66 54 62 Z" fill="#ffffff" opacity=".96"/>
        ${eyesFor(def.eyes, gid)}
        <ellipse class="fuji-buddy-blush" cx="48" cy="90" rx="9" ry="5.4" fill="#ff8fa3" opacity="${def.blush * 0.6}"/>
        <ellipse class="fuji-buddy-blush" cx="114" cy="90" rx="9" ry="5.4" fill="#ff8fa3" opacity="${def.blush * 0.6}"/>
        ${mouthFor(def.mouth)}
        <!-- little arms -->
        <g class="fuji-buddy-arm">
          <path d="M20 108 q-12 -3 -14 -14" stroke="var(--grad-1)" stroke-width="8" stroke-linecap="round" fill="none"/>
          <circle cx="6" cy="93" r="5.4" fill="var(--grad-2)"/>
        </g>
        <g class="fuji-buddy-arm fuji-buddy-arm--right">
          <path d="M142 108 q12 -3 14 -14" stroke="var(--grad-1)" stroke-width="8" stroke-linecap="round" fill="none"/>
          <circle cx="156" cy="93" r="5.4" fill="var(--grad-2)"/>
        </g>
        ${hatFor(def.hat)}
      </g>

      <g class="fuji-buddy-sparks" fill="var(--brand-yellow)">
        <path class="fuji-buddy-spark-a" d="M28 40 l1.8 3.6 3.9.6 -2.9 2.7 .8 3.9 -3.6-2 -3.6 2 .8-3.9 -2.9-2.7 3.9-.6z"/>
        <path class="fuji-buddy-spark-b" d="M134 62 l1.5 3 3.3.5 -2.4 2.3 .7 3.3 -3.1-1.7 -3.1 1.7 .7-3.3 -2.4-2.3 3.3-.5z"/>
        <path class="fuji-buddy-spark-c" d="M46 16 l1.2 2.4 2.6.4 -1.9 1.8 .5 2.6 -2.4-1.3 -2.4 1.3 .5-2.6 -1.9-1.8 2.6-.4z"/>
      </g>
      <g class="fuji-buddy-cloud" opacity=".85">
        <ellipse cx="40" cy="132" rx="16" ry="4.6" fill="#fff"/>
        <ellipse cx="52" cy="132" rx="11" ry="3.6" fill="#fff" opacity=".8"/>
      </g>
    </svg>
    ${tagline ? `<span class="fuji-buddy-speech">${tagline}</span>` : ''}
  </div>`;
}

/** Pick a mood from the dashboard numbers. */
export function fujiBuddyMood({ daysToStart = null, overBudget = false, unsettledMinor = 0, hasPlan = false, hour = new Date().getHours() } = {}) {
  if (overBudget) return 'worry';
  if (Number(unsettledMinor) > 0) return 'wallet';
  if (daysToStart != null && daysToStart >= 0 && daysToStart <= 3) return 'cheer';
  if (hour >= 22 || hour < 5) return 'sleepy';
  if (!hasPlan) return 'chill';
  return 'happy';
}

const LINES_TH = {
  happy: ['วันนี้ก็เที่ยวสนุกได้นะ!', 'จัดกระเป๋าหรือยัง? ฟูจิเป็นกำลังใจให้', 'แผนสวยมาก ไปเที่ยวกันเถอะ'],
  cheer: ['อีกแป๊บเดียวได้ไปเที่ยวแล้ว!', 'นับวันรอเลย ฟูจิตื่นเต้นมาก', 'จองตั๋วหรือยัง เร็วเข้า!'],
  chill: ['ค่อย ๆ วางแผนก็ได้ ไม่ต้องรีบ', 'วันนี้ชิลล์ ๆ นะ', 'พักก่อน แล้วค่อยดูค่าใช้จ่ายต่อ'],
  sleepy: ['ดึกแล้ว นอนก่อนนะ', 'ตาจะปิดแล้ว… แผนบันทึกไว้แล้วนะ', 'พรุ่งนี้ค่อยวางแผนต่อนะ'],
  worry: ['งบจะเกินแล้วนะ! ลดลงนิดไหม', 'รายจ่ายมากกว่างบแล้ว ระวังด้วย', 'เช็คค่าใช้จ่ายอีกทีนะ'],
  wallet: ['มีคนยังไม่ได้เคลียร์บิลนะ', 'แบ่งจ่ายครบแล้วค่อยไปเที่ยวกัน', 'กดเคลียร์บิลเลย เดี๋ยวฟูจิช่วยดู']
};
const LINES_EN = {
  happy: ['Ready for a great day!', 'Pack your bag — Fuji is cheering for you', 'Nice plan! Let’s go'],
  cheer: ['Only a few days to go!', 'Fuji can barely wait', 'Did you book the tickets yet?'],
  chill: ['No rush — plan one step at a time', 'Chill day today', 'Rest, then finish the budget'],
  sleepy: ['It’s late — get some sleep', 'My eyes are closing… (your plan is saved)', 'Continue tomorrow, okay?'],
  worry: ['The budget is almost gone!', 'Spending is over budget — careful', 'Let’s review the expenses once more'],
  wallet: ['Someone still has a bill to settle', 'Split the bill, then we travel', 'Tap Clear bill — Fuji will watch the numbers']
};

/** A short line for the mascot (used with a toast + the speech bubble). */
export function fujiBuddyLine(mood = 'happy', lang = 'th') {
  const pool = (lang === 'th' ? LINES_TH : LINES_EN)[mood] || LINES_TH.happy;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Make the mascot alive: idle wiggle is pure CSS; tapping wiggles it harder,
 * pops a speech bubble and (optionally) a toast.
 * @returns {() => void} disposer
 */
export function mountFujiBuddy(container, { lang = 'th', mood = 'happy', onToast = null } = {}) {
  const el = typeof container === 'string' ? document.getElementById(container) : container;
  if (!el) return () => {};
  const buddy = el.classList.contains('fuji-buddy') ? el : el.querySelector('.fuji-buddy');
  if (!buddy) return () => {};
  let bubble = null, timer = null;

  const say = () => {
    const text = fujiBuddyLine(buddy.dataset.mood || mood, lang);
    if (bubble) bubble.remove();
    bubble = document.createElement('span');
    bubble.className = 'fuji-buddy-speech is-pop';
    bubble.textContent = text;
    buddy.appendChild(bubble);
    buddy.classList.remove('is-tapped');
    // restart the CSS wiggle
    void buddy.offsetWidth;
    buddy.classList.add('is-tapped');
    clearTimeout(timer);
    timer = setTimeout(() => { bubble?.classList.remove('is-pop'); bubble?.classList.add('is-fade'); }, 2600);
    timer = setTimeout(() => { bubble?.remove(); bubble = null; buddy.classList.remove('is-tapped'); }, 3600);
    if (onToast) onToast(text);
  };

  const onClick = (e) => { if (e.target.closest('a,button')) return; say(); };
  const onKey = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); say(); } };
  buddy.addEventListener('click', onClick);
  buddy.addEventListener('keydown', onKey);
  return () => {
    buddy.removeEventListener('click', onClick);
    buddy.removeEventListener('keydown', onKey);
    clearTimeout(timer);
    bubble?.remove();
  };
}

/** Optional inline styles (the demo/dev preview can inject them; the app ships them in animations.css). */
export function fujiBuddyStyles() {
  return '';
}

export default renderFujiBuddy;
