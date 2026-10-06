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

/* ------------------------------------------------------------------ *
 * Offline / denied-write queue
 *
 * “เพิ่มไอเดีย” must never lose what somebody typed. When Firestore answers
 * permission-denied (the project still runs older rules than the app code),
 * the idea is kept on the device and shown on the board with a “รอซิงก์”
 * badge until the rules are published — see src/js/ideas/index.js.
 * ------------------------------------------------------------------ */

export const LOCAL_IDEA_PREFIX = 'local-';

export function isLocalIdeaId(id = '') {
  return String(id).startsWith(LOCAL_IDEA_PREFIX);
}

/** A normalised idea record that only lives on this device. */
export function pendingIdeaRecord(data = {}, { uid = null, now = Date.now(), seq = 0 } = {}) {
  const author = uid || 'unknown';
  const payload = {
    title: String(data.title || '').trim(),
    note: String(data.note || '').trim(),
    url: String(data.url || '').trim(),
    address: String(data.address || '').trim(),
    category: data.category || 'sightseeing',
    coordinates: data.coordinates || null,
    imageUrl: data.imageUrl || '',
    estimatedCostMinor: Number(data.estimatedCostMinor) || 0,
    currency: data.currency || 'THB',
    status: 'idea',
    plannedItemId: null,
    plannedDate: null,
    votes: data.votes || (author !== 'unknown' ? { [author]: true } : {})
  };
  return {
    id: `${LOCAL_IDEA_PREFIX}${now.toString(36)}${seq ? `-${seq}` : ''}`,
    ...payload,
    createdBy: author,
    updatedBy: author,
    pendingSync: true,
    queuedAt: now,
    createdAt: { seconds: Math.floor(now / 1000) }
  };
}

/** Remote ideas + queued ones (queued first so they are impossible to miss). */
export function mergeIdeas(remote = [], pending = []) {
  const seen = new Set(remote.map(i => i.id));
  const queued = pending.filter(i => i && !seen.has(i.id));
  return [...queued, ...remote];
}

/** How many queued ideas are still waiting (banner on the ideas board). */
export function pendingIdeaCount(pending = []) {
  return pending.filter(Boolean).length;
}

