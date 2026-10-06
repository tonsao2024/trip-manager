// ─────────────────────────────────────────────────────────────────────────────
// Card deck helpers (v18) — the pure half of the Tinder-style receipt swipe
// deck on the Clear-bill page. Everything here is Firestore/DOM free so it can
// be unit tested (`tests/unit/deck.test.js`).
//
// The deck shows ONE receipt at a time. Dragging it past a threshold "throws"
// it and moves to the next/previous person; the avatar strip jumps anywhere.
// ─────────────────────────────────────────────────────────────────────────────

/** Sort the deck: my own receipt first, then biggest balance owed, then name. */
export function deckOrder(statements = [], { myId = null, lang = 'th' } = {}) {
  const list = [...(statements || [])];
  const abs = (n) => Math.abs(Number(n) || 0);
  const collator = new Intl.Collator(lang === 'th' ? 'th' : 'en', { numeric: true, sensitivity: 'base' });
  return list.sort((a, b) => {
    if (myId) {
      const am = a?.memberId === myId ? 0 : 1;
      const bm = b?.memberId === myId ? 0 : 1;
      if (am !== bm) return am - bm;
    }
    const diff = abs(b?.netMinor) - abs(a?.netMinor);
    if (diff) return diff;
    return collator.compare(a?.displayName || '', b?.displayName || '');
  });
}

/** Move by `delta` inside the deck, wrapping around. Returns the new index. */
export function deckStep(index, delta, length) {
  const n = Number(length) || 0;
  if (!n) return -1;
  const i = Number(index);
  const base = Number.isFinite(i) ? Math.trunc(i) : 0;
  return ((base + (Number(delta) || 0)) % n + n) % n;
}

/** The member shown at `index` (safe for empty / out-of-range decks). */
export function deckAt(list = [], index = 0) {
  if (!Array.isArray(list) || !list.length) return null;
  const i = deckStep(index, 0, list.length);
  return list[i] || null;
}

/**
 * Decide what a drag means.
 * @param {{dx:number, dy:number, width?:number, threshold?:number}} drag
 * @returns {'next'|'prev'|'open'|'none'}
 */
export function swipeIntent({ dx = 0, dy = 0, width = 360, threshold = 0.28 } = {}) {
  const x = Number(dx) || 0;
  const y = Number(dy) || 0;
  const edge = Math.max(60, (Number(width) || 360) * (Number(threshold) || 0.28));
  if (Math.abs(x) >= edge && Math.abs(x) > Math.abs(y) * 1.1) return x < 0 ? 'next' : 'prev';
  if (Math.abs(x) < 12 && Math.abs(y) < 12) return 'open';   // a tap
  return 'none';
}

/** How far the card may rotate while dragging (deg, capped). */
export function swipeTilt(dx, width = 360, max = 9) {
  const w = Math.max(120, Number(width) || 360);
  const k = Math.max(-1, Math.min(1, (Number(dx) || 0) / w));
  return +(k * max).toFixed(2);
}

/** Opacity of the card behind the one being dragged (0…1). */
export function swipePeek(progress) {
  const p = Math.max(0, Math.min(1, Math.abs(Number(progress) || 0)));
  return +(1 - p * 0.45).toFixed(3);
}

/** Colour of the “ส่ง/เก็บ” hint that fades in while dragging. */
export function swipeHint(dx, { next = 'คนถัดไป', prev = 'คนก่อนหน้า' } = {}) {
  const x = Number(dx) || 0;
  if (x > 24) return { label: prev, tone: 'prev' };
  if (x < -24) return { label: next, tone: 'next' };
  return null;
}

/**
 * The compact face of a receipt card (the deck only shows the essentials;
 * the full receipt opens when the card is tapped).
 */
export function deckSummary(statement, { money = (n) => String(n ?? ''), lang = 'th', flagged = null } = {}) {
  const net = Number(statement?.netMinor) || 0;
  const items = statement?.items || [];
  const positive = net >= 0;
  const paid = Number(statement?.paidMinor) || 0;
  const owed = Number(statement?.owedMinor) || 0;
  const top = [...items]
    .sort((a, b) => (Math.abs(b?.amountMinor) || 0) - (Math.abs(a?.amountMinor) || 0))
    .slice(0, 3)
    .map(i => ({
      title: i.title || (lang === 'th' ? 'ไม่มีชื่อ' : 'Untitled'),
      amount: money(i.amountMinor),
      role: i.role === 'paid' ? 'paid' : 'share',
      date: i.date || '',
      estimated: Boolean(i.estimated)
    }));
  return {
    memberId: statement?.memberId || '',
    name: statement?.displayName || '',
    color: statement?.color || '',
    photoURL: statement?.photoURL || '',
    initials: (statement?.displayName || '?').trim().charAt(0).toUpperCase(),
    netMinor: net,
    paidMinor: paid,
    owedMinor: owed,
    positive,
    settled: positive && (statement?.items || []).filter(i => i.role === 'share').length === 0,
    headline: money(Math.abs(net)),
    paidLabel: money(paid),
    owedLabel: money(owed),
    itemCount: items.length,
    paidCount: Number(statement?.paidCount) || 0,
    shareCount: Number(statement?.shareCount) || 0,
    // The flag count is not stored on the statement — the page computes it from the
    // trip comments, so an override is accepted (`flagged`) and the shapes the
    // builders do carry (flaggedCount / flaggedIds / flagged) are read as a fallback.
    flagged: Number.isFinite(Number(flagged)) && flagged !== null
      ? Number(flagged) || 0
      : (Number(statement?.flaggedCount)
        || (Array.isArray(statement?.flaggedIds) ? statement.flaggedIds.length : 0)
        || (Array.isArray(statement?.flagged) ? statement.flagged.length : 0)
        || Number(statement?.flagged) || 0),
    top
  };
}

/** Progress dots / "2 ของ 5" label. */
export function deckPositionLabel(index, length, lang = 'th') {
  const n = Number(length) || 0;
  if (!n) return '';
  const i = Math.min(Math.max((Number(index) || 0) + 1, 1), n);
  return lang === 'th' ? `${i} ของ ${n}` : `${i} of ${n}`;
}

export default { deckOrder, deckStep, deckAt, swipeIntent, swipeTilt, swipePeek, swipeHint, deckSummary, deckPositionLabel };
