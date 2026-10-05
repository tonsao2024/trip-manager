// Animated mood faces (v13).
//
// Comparison spots on the dashboard (budget left, my balance, estimated vs
// actual, per-person budget) get a small animated face that shows the feeling
// of the numbers at a glance: great / good / meh / think / worry / sad / panic.
// Pure inline SVG + CSS animations — no dependency, no images.

const MOODS = {
  great: { color: '#16a34a', light: '#dcfce7', th: 'เยี่ยมเลย', en: 'Great' },
  good:  { color: '#65a30d', light: '#ecfccb', th: 'ไปได้ดี', en: 'Good' },
  meh:   { color: '#64748b', light: '#e2e8f0', th: 'เฉยๆ', en: 'Meh' },
  think: { color: '#7c3aed', light: '#ede9fe', th: 'ยังต้องคิด', en: 'Thinking' },
  worry: { color: '#d97706', light: '#fef3c7', th: 'เริ่มห่วง', en: 'Worrying' },
  sad:   { color: '#2563eb', light: '#dbeafe', th: 'แอบเศร้า', en: 'Sad' },
  panic: { color: '#dc2626', light: '#fee2e2', th: 'เกินแล้ว!', en: 'Panic' }
};

function eyes(kind) {
  if (kind === 'happy') {
    // ^ ^ closed happy eyes
    return `<g class="mood-eyes" stroke="#3f3f46" stroke-width="2" stroke-linecap="round" fill="none">
      <path d="M9.5 13.5 q2.2 -2.6 4.4 0"/><path d="M18.1 13.5 q2.2 -2.6 4.4 0"/></g>`;
  }
  if (kind === 'panic') {
    return `<g class="mood-eyes">
      <circle cx="11.7" cy="13" r="3.1" fill="#fff" stroke="#3f3f46" stroke-width="1.4"/>
      <circle cx="20.3" cy="13" r="3.1" fill="#fff" stroke="#3f3f46" stroke-width="1.4"/>
      <circle cx="11.7" cy="13.4" r="1.25" fill="#3f3f46"/><circle cx="20.3" cy="13.4" r="1.25" fill="#3f3f46"/></g>`;
  }
  if (kind === 'sad') {
    return `<g class="mood-eyes">
      <circle cx="11.7" cy="13" r="1.5" fill="#3f3f46"/><circle cx="20.3" cy="13" r="1.5" fill="#3f3f46"/>
      <path class="mood-tear" d="M11.2 16.2 q-1.4 2.3 0 3.1 q1.4 -0.8 0 -3.1z" fill="#60a5fa"/></g>`;
  }
  if (kind === 'think') {
    return `<g class="mood-eyes">
      <circle cx="11.7" cy="13" r="1.5" fill="#3f3f46"/><circle cx="20.3" cy="13" r="1.5" fill="#3f3f46"/>
      <path d="M9.4 9.6 q2.3 -1.4 4.6 -0.3" stroke="#3f3f46" stroke-width="1.5" stroke-linecap="round" fill="none"/>
      <path d="M18 9.2 q2.3 -1.7 4.6 -0.9" stroke="#3f3f46" stroke-width="1.5" stroke-linecap="round" fill="none"/></g>`;
  }
  if (kind === 'worry') {
    return `<g class="mood-eyes">
      <circle cx="11.7" cy="13" r="1.5" fill="#3f3f46"/><circle cx="20.3" cy="13" r="1.5" fill="#3f3f46"/>
      <path d="M9.4 9.8 l4.6 1.6" stroke="#3f3f46" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M22.6 9.8 l-4.6 1.6" stroke="#3f3f46" stroke-width="1.5" stroke-linecap="round"/>
      <path class="mood-sweat" d="M25.6 8.4 q-1.7 2.9 0 3.9 q1.7 -1 0 -3.9z" fill="#7dd3fc"/></g>`;
  }
  // plain dot eyes (good / meh)
  return `<g class="mood-eyes"><circle cx="11.7" cy="13" r="1.5" fill="#3f3f46"/><circle cx="20.3" cy="13" r="1.5" fill="#3f3f46"/></g>`;
}

function mouth(kind) {
  switch (kind) {
    case 'great': return `<path d="M10 18.4 q6 5.4 12 0" stroke="#3f3f46" stroke-width="2" stroke-linecap="round" fill="none"/>
      <circle cx="8.6" cy="17.6" r="1.7" fill="#fda4af" opacity=".7"/><circle cx="23.4" cy="17.6" r="1.7" fill="#fda4af" opacity=".7"/>`;
    case 'good':  return `<path d="M11.5 18.8 q4.5 3.4 9 0" stroke="#3f3f46" stroke-width="2" stroke-linecap="round" fill="none"/>`;
    case 'meh':   return `<path d="M12 19.6 h8" stroke="#3f3f46" stroke-width="2" stroke-linecap="round"/>`;
    case 'think': return `<circle cx="17.6" cy="19.6" r="1.7" fill="none" stroke="#3f3f46" stroke-width="1.8"/>`;
    case 'worry': return `<path d="M11.5 20.4 q2.2 -2 4.5 0 q2.3 2 4.5 0" stroke="#3f3f46" stroke-width="2" stroke-linecap="round" fill="none"/>`;
    case 'sad':   return `<path d="M11.5 21 q4.5 -3.6 9 0" stroke="#3f3f46" stroke-width="2" stroke-linecap="round" fill="none"/>`;
    case 'panic': return `<ellipse cx="16" cy="20" rx="3.1" ry="3.7" fill="#7f1d1d"/>`;
    default:      return '';
  }
}

const EYES_OF = { great: 'happy', good: 'plain', meh: 'plain', think: 'think', worry: 'worry', sad: 'sad', panic: 'panic' };

/**
 * Render one animated face.
 * @param {keyof MOODS} mood
 * @param {{size?:number, title?:string, lang?:string}} [opts]
 */
export function moodFaceHtml(mood, { size = 40, title = '', lang = 'th' } = {}) {
  const def = MOODS[mood] || MOODS.meh;
  const label = title || (lang === 'th' ? def.th : def.en);
  return `<span class="mood-face mood-${mood}" style="width:${size}px;height:${size}px;" role="img" aria-label="${label}" title="${label}">
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="14.4" fill="${def.light}" stroke="${def.color}" stroke-width="1.8"/>
      ${eyes(EYES_OF[mood] || 'plain')}
      ${mouth(mood)}
    </svg>
  </span>`;
}

/** Mood for "used X of budget Y". */
export function budgetMood(used, budget) {
  if (!(budget > 0)) return 'meh';
  const pct = used / budget;
  if (pct >= 1) return 'panic';
  if (pct >= 0.85) return 'worry';
  if (pct >= 0.6) return 'good';
  return 'great';
}

/** Mood for a settlement balance (positive = gets money back). */
export function balanceMood(net) {
  if (net > 0) return 'great';
  if (net < 0) return 'sad';
  return 'meh';
}

/** Mood for "how much of the plan is still only an estimate". */
export function estimateMood(estimatedMinor, totalMinor) {
  if (!(totalMinor > 0)) return 'meh';
  const pct = estimatedMinor / totalMinor;
  if (pct >= 0.5) return 'think';
  if (pct >= 0.2) return 'meh';
  return 'good';
}
