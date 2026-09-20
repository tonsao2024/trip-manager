// The "Missing or insufficient permissions" guidance: the app must recognise the
// error (it arrives in several shapes) and always be able to produce instructions.
import {
  isPermissionError, joinPermissionHelp, adminHelpMessage, consoleRulesUrl, fetchRulesText
} from '../../src/js/utils/rulesHelper.js';

function assert(cond, msg) { if (!cond) throw new Error(msg); }
const eq = (a, b, msg) => assert(a === b, `${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`);

export async function testRulesHelper() {
  console.log('Testing permission-error helpers...');

  const denied = Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
  assert(isPermissionError(denied), 'firebase code detected');
  assert(isPermissionError(new Error('Missing or insufficient permissions.')), 'english text detected');
  assert(isPermissionError({ cause: { code: 'permission-denied' } }), 'wrapped cause detected');
  assert(!isPermissionError(new Error('network error')), 'other errors are not treated as permission problems');
  assert(!isPermissionError(null), 'null is safe');

  const th = joinPermissionHelp('th', { projectId: 'trip-manager-93b22', action: 'join' });
  assert(/Publish/.test(th.steps.join(' ')), 'steps mention Publish');
  assert(th.missing.includes('publicProfiles'), 'names publicProfiles');
  assert(th.missing.some(x => x.includes('joinRequests')), 'names joinRequests');
  assert(th.consoleUrl.includes('trip-manager-93b22'), 'console url carries the project id');
  assert(/คัดลอก/.test(th.title + th.message) === false, 'title stays short and factual');

  const en = joinPermissionHelp('en', { action: 'approve' });
  assert(/approval/.test(en.message), 'approve wording for admins');
  assert(/Publish/.test(en.steps.join(' ')), 'english steps too');

  eq(consoleRulesUrl(null), 'https://console.firebase.google.com/', 'no project → generic console');

  const msg = adminHelpMessage({ email: 'friend@example.com' }, { name: 'ทริปฟูจิ 2027' }, 'th');
  assert(msg.includes('friend@example.com'), 'admin message carries the member email');
  assert(msg.includes('ทริปฟูจิ 2027'), 'admin message carries the trip name');
  assert(/joinRequests/.test(msg), 'admin message says what to publish');

  // fetchRulesText must never throw, whatever the environment answers.
  const result = await fetchRulesText({ timeoutMs: 50 });
  assert(result === null || /rules_version/.test(result), 'fetch returns rules text or null');
  console.log('All permission helper tests passed');
}
