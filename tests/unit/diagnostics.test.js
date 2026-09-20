// System diagnostics: turns opaque Firebase errors into an explanation plus the
// command that fixes it. If these strings regress, admins lose their only clue.
import {
  runSystemDiagnostics, classifyFunctionError, classifyFirestoreError,
  formatDiagnosticsReport, DIAG
} from '../../src/js/utils/diagnostics.js';

function assert(cond, msg) { if (!cond) throw new Error(msg); }
const eq = (a, b, msg) => assert(a === b, `${msg} (got ${a}, expected ${b})`);

const fnErr = (code, message) => Object.assign(new Error(message), { code });

export async function testDiagnosticsClassify() {
  console.log('Testing diagnostics classifiers...');

  // The failure the user reported: the SDK answers `internal` / "internal" when
  // the endpoint is missing (404 HTML) or Cloud Run blocks the call.
  const notDeployed = classifyFunctionError(fnErr('functions/internal', 'internal'), 'th');
  eq(notDeployed.status, DIAG.fail, 'internal → fail');
  assert(/deploy/i.test(notDeployed.fixTh), 'fix explains firebase deploy');
  assert(/Blaze/.test(notDeployed.fixTh), 'mentions the Blaze plan requirement');

  const offline = classifyFunctionError(fnErr('functions/unavailable', 'network error'), 'th');
  eq(offline.status, 'fail', 'unavailable → fail');
  assert(/asia-southeast1/.test(offline.fixTh), 'mentions the expected region');

  const wrongPin = classifyFunctionError(fnErr('functions/permission-denied', 'Invalid PIN'), 'th');
  eq(wrongPin.status, DIAG.warn, 'permission → warn, not a deploy problem');

  const missing = classifyFunctionError(fnErr('functions/not-found', 'not found'), 'th');
  assert(/deploy/i.test(missing.fixEn), 'not-found points at deploy');

  const denied = classifyFirestoreError(fnErr('firestore/permission-denied', 'Missing or insufficient permissions'), 'ข้อมูลทริป', 'th');
  eq(denied.status, 'fail', 'permission-denied → fail');
  assert(/Rules/.test(denied.fix), 'rules fix surfaced');
  const en = classifyFirestoreError(fnErr('firestore/permission-denied', 'denied'), 'trip', 'en');
  assert(/rules/i.test(en.fix), 'english fix too');
  console.log('✓ classifiers');
}

export async function testDiagnosticsRun() {
  console.log('Testing runSystemDiagnostics with injected deps...');

  // 1) Everything broken the way the user's project is (functions answer `internal`).
  const brokenDeps = {
    isFirebaseConfigured: true,
    isStorageAvailable: false,
    auth: { currentUser: null },
    functions: { __functions: true },
    httpsCallable: () => async () => { throw fnErr('functions/internal', 'internal'); },
    getMemberSession: () => ({ memberId: 'u2', username: 'nun', tripId: 't1' }),
    db: { __db: true },
    doc: (_db, ...p) => ({ path: p.join('/') }),
    getDoc: async (ref) => {
      if (ref.path.startsWith('publicMemberLogins')) throw fnErr('firestore/permission-denied', 'denied');
      if (ref.path.startsWith('loginAccounts')) throw fnErr('firestore/permission-denied', 'denied');
      return { exists: () => true, data: () => ({ name: 'ทริปฟูจิ' }) };
    },
    collection: (_db, ...p) => ({ path: p.join('/') }),
    query: (ref) => ref,
    limit: (n) => ({ n }),
    getDocs: async (ref) => ({ docs: ref.path.includes('members') ? [{ data: () => ({ username: 'nun', loginReady: true }) }] : [] })
  };
  const broken = await runSystemDiagnostics({ tripId: 't1', lang: 'th', deps: brokenDeps });
  eq(broken.ok, false, 'broken project → not ok');
  const byId = Object.fromEntries(broken.results.map(r => [r.id, r]));
  eq(byId.functions.status, 'fail', 'functions flagged');
  assert(/deploy/i.test(byId.functions.fix || ''), 'functions row carries the deploy command');
  eq(byId['rules-login'].status, 'fail', 'username-lookup rules flagged');
  assert(/firestore:rules/.test(byId['rules-login'].fix || ''), 'rules row carries the deploy command');
  eq(byId['security-pins'].status, 'ok', 'denied loginAccounts is good');
  eq(byId.session.status, 'warn', 'local member session warned about');
  eq(byId['member-pins'].status, 'ok', 'member with a username is detected');
  eq(byId.storage.status, 'warn', 'storage fallback warned');
  assert(broken.results.length >= 8, `all checks ran (${broken.results.length})`);

  // 2) Healthy project.
  const healthyDeps = {
    ...brokenDeps,
    isStorageAvailable: true,
    auth: { currentUser: { uid: 'u1', email: 'admin@example.com' } },
    httpsCallable: () => async (data) => ({ data: { ok: true, echo: data } }),
    getDoc: async (ref) => {
      if (ref.path.startsWith('loginAccounts')) throw fnErr('firestore/permission-denied', 'denied');
      if (ref.path.startsWith('publicMemberLogins')) return { exists: () => false, data: () => ({}) };
      return { exists: () => true, data: () => ({ name: 'ทริปฟูจิ' }) };
    },
    getDocs: async (ref) => ({ docs: ref.path.includes('members') ? [{ data: () => ({ loginReady: true }) }] : [] })
  };
  const healthy = await runSystemDiagnostics({ tripId: 't1', lang: 'th', deps: healthyDeps });
  eq(healthy.ok, true, 'healthy project → ok');
  assert(healthy.results.every(r => r.status !== 'fail'), 'no failures on the healthy path');
  assert(/พร้อมใช้งาน/.test(healthy.results.find(r => r.id === 'functions').detail), 'functions reported as available');

  // 3) Report text is copy-pasteable and includes fixes.
  const report = formatDiagnosticsReport({ tripId: 't1', lang: 'th', results: broken.results, now: new Date('2026-01-16T00:00:00Z') });
  assert(report.includes('trip: t1'), 'report carries the trip id');
  assert(report.includes('❌'), 'report marks failures');
  assert(report.includes('firebase deploy --only functions'), 'report carries the fix command');
  console.log('✓ diagnostics run');
}
