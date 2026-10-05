// Ideas-board helpers — the pure half of “สถานที่ที่อยากไป” (statuses, votes,
// sorting, “add to plan” payload). Kept Firestore-free for unit tests; the CRUD
// lives in src/js/ideas/index.js and re-exports everything below.

export const IDEA_STATUSES = [
  { id: 'idea', th: 'อยากไป', en: 'Idea', icon: 'lightbulb' },
  { id: 'planned', th: 'อยู่ในแผน', en: 'In the plan', icon: 'calendar-check' }
];

export function ideaStatusDef(id) {
  return IDEA_STATUSES.find(s => s.id === id) || IDEA_STATUSES[0];
}

/** Vote count + voter ids (accepts both the map and a legacy array shape). */
export function voteInfo(idea = {}) {
  const v = idea.votes;
  const voters = Array.isArray(v) ? v.filter(Boolean) : Object.keys(v || {}).filter(k => v[k]);
  return { count: voters.length, voters };
}

export function hasVoted(idea = {}, memberId = '') {
  if (!memberId) return false;
  return voteInfo(idea).voters.includes(memberId);
}

/** Pure toggle — returns a new votes map (never mutates). */
export function toggleVoteMap(votes = {}, memberId = '') {
  const next = { ...(votes || {}) };
  if (!memberId) return next;
  if (next[memberId]) delete next[memberId];
  else next[memberId] = true;
  return next;
}

export function voteCount(idea = {}) {
  return voteInfo(idea).count;
}

/**
 * Sort for the board:
 *  - 'votes'  (default): most voted first, planned ideas after open ones
 *  - 'newest': newest first
 *  - 'alpha':  A → Z (Thai-aware)
 */
export function sortIdeas(ideas = [], mode = 'votes', { lang = 'th' } = {}) {
  const list = [...ideas];
  const createdSeconds = (i) => i?.createdAt?.seconds ?? (Number(i?.createdAt) || 0);
  if (mode === 'newest') return list.sort((a, b) => createdSeconds(b) - createdSeconds(a));
  if (mode === 'alpha') {
    const collator = new Intl.Collator(lang === 'th' ? 'th' : 'en', { numeric: true, sensitivity: 'base' });
    return list.sort((a, b) => collator.compare(a?.title || '', b?.title || ''));
  }
  return list.sort((a, b) => {
    const pa = a?.status === 'planned' ? 1 : 0;
    const pb = b?.status === 'planned' ? 1 : 0;
    if (pa !== pb) return pa - pb;
    const diff = voteCount(b) - voteCount(a);
    if (diff) return diff;
    return createdSeconds(b) - createdSeconds(a);
  });
}

/** Who voted (names) — used by the “กดแล้ว N คน” tooltip. */
export function voterNames(idea = {}, members = []) {
  const { voters } = voteInfo(idea);
  return voters
    .map(id => members.find(m => m.id === id)?.displayName || '')
    .filter(Boolean);
}

/**
 * Build the itinerary payload for “เพิ่มเข้าแผน”.
 * Keeps the idea's note/address/cost so the day plan is complete in one tap.
 */
export function ideaToItineraryPayload(idea = {}, { date = '', startAt = '', category = null, order = 999 } = {}) {
  return {
    title: String(idea.title || '').trim(),
    description: String(idea.note || '').trim(),
    date,
    startAt: startAt || '',
    order,
    category: category || idea.category || 'sightseeing',
    address: idea.address || '',
    url: idea.url || '',
    coordinates: idea.coordinates || null,
    estimatedCostMinor: Number(idea.estimatedCostMinor) || 0,
    currency: idea.currency || 'THB',
    status: 'planned',
    imageUrl: idea.imageUrl || ''
  };
}

/** Estimated spend of the shortlist — shown next to the board title. */
export function ideasBudget(ideas = [], { status = null } = {}) {
  return ideas
    .filter(i => (status ? i.status === status : true))
    .reduce((sum, i) => sum + (Number(i.estimatedCostMinor) || 0), 0);
}

/** Top ideas that are not in the plan yet (dashboard “กำลังฮิต” widget). */
export function trendingIdeas(ideas = [], limit = 3) {
  return sortIdeas(ideas.filter(i => i.status !== 'planned'), 'votes').slice(0, limit);
}

