// Unit tests — ideas board (votes, sorting, add-to-plan payload).
import {
  IDEA_STATUSES, ideaStatusDef, voteInfo, hasVoted, toggleVoteMap, voteCount,
  sortIdeas, voterNames, ideaToItineraryPayload, ideasBudget, trendingIdeas
} from '../../src/js/utils/ideas.js';

function assert(cond, msg) { if (!cond) throw new Error(msg); }

export function testVoteHelpers() {
  const idea = { votes: { u1: true, u2: false, u3: true } };
  const info = voteInfo(idea);
  assert(info.count === 2, 'only truthy votes count');
  assert(info.voters.join(',') === 'u1,u3', 'voter ids listed');
  assert(hasVoted(idea, 'u1') === true && hasVoted(idea, 'u2') === false, 'hasVoted reads the map');
  assert(hasVoted(idea, '') === false, 'anonymous never counts as a voter');
  assert(voteCount({ votes: ['a', 'b'] }) === 2, 'legacy array shape still works');

  const toggled = toggleVoteMap(idea.votes, 'u1');
  assert(!toggled.u1 && toggled.u3, 'toggling removes an existing vote');
  const added = toggleVoteMap(idea.votes, 'u4');
  assert(added.u4 === true, 'toggling adds a new vote');
  assert(idea.votes.u1 === true, 'the original map is not mutated');
  assert(Object.keys(toggleVoteMap(idea.votes, '')).length === 3, 'empty member id is a no-op');
}

export function testSortIdeas() {
  const list = [
    { id: 'a', title: 'Beta', votes: { u1: true }, status: 'idea', createdAt: { seconds: 10 } },
    { id: 'b', title: 'Alpha', votes: { u1: true, u2: true }, status: 'idea', createdAt: { seconds: 30 } },
    { id: 'c', title: 'Charlie', votes: { u1: true, u2: true, u3: true }, status: 'planned', createdAt: { seconds: 20 } }
  ];
  const byVotes = sortIdeas(list, 'votes').map(i => i.id);
  assert(byVotes[0] === 'b', 'most voted open idea first');
  assert(byVotes[2] === 'c', 'planned ideas sink to the bottom');
  assert(sortIdeas(list, 'newest')[0].id === 'b', 'newest first uses createdAt');
  assert(sortIdeas(list, 'alpha', { lang: 'en' })[0].title === 'Alpha', 'alpha sort is locale aware');
}

export function testIdeaStatusAndVoters() {
  assert(ideaStatusDef('planned').id === 'planned', 'known status resolves');
  assert(ideaStatusDef('nope').id === IDEA_STATUSES[0].id, 'unknown status falls back to idea');
  const names = voterNames({ votes: { u1: true, u9: true } }, [{ id: 'u1', displayName: 'มิ้น' }]);
  assert(names.length === 1 && names[0] === 'มิ้น', 'unknown members are skipped in the name list');
}

export function testIdeaToItinerary() {
  const payload = ideaToItineraryPayload(
    { title: 'ทะเลสาบคาวากุจิ', note: 'วิวฟูจิ', address: 'Kawaguchiko', estimatedCostMinor: 150000, currency: 'JPY', category: 'sightseeing' },
    { date: '2026-03-28', startAt: '09:00', order: 2 }
  );
  assert(payload.title === 'ทะเลสาบคาวากุจิ', 'title copied');
  assert(payload.date === '2026-03-28' && payload.startAt === '09:00' && payload.order === 2, 'slot applied');
  assert(payload.category === 'sightseeing', 'category falls back to the idea');
  assert(payload.estimatedCostMinor === 150000 && payload.currency === 'JPY', 'estimate money kept');
}

export function testIdeasBudgetAndTrending() {
  const list = [
    { id: 'a', votes: { u1: true }, status: 'idea', estimatedCostMinor: 10000, createdAt: { seconds: 1 } },
    { id: 'b', votes: { u1: true, u2: true }, status: 'idea', estimatedCostMinor: 25000, createdAt: { seconds: 2 } },
    { id: 'c', votes: { u1: true }, status: 'planned', estimatedCostMinor: 900000, createdAt: { seconds: 3 } }
  ];
  assert(ideasBudget(list, { status: 'idea' }) === 35000, 'budget only counts the unplanned ideas');
  const top = trendingIdeas(list, 2);
  assert(top.length === 2 && top[0].id === 'b', 'trending returns the most voted open ideas');
}

export function testIdeas() {
  testVoteHelpers();
  testSortIdeas();
  testIdeaStatusAndVoters();
  testIdeaToItinerary();
  testIdeasBudgetAndTrending();
  console.log('All ideas board tests passed');
}
