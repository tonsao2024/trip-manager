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

export async function testNotificationDiagnostics() {
  console.log('Testing the notification layer of the system check...');

  const base = {
    isFirebaseConfigured: true,
    isStorageAvailable: true,
    auth: { currentUser: { uid: 'u1', email: 'admin@example.com' } },
    functions: { __functions: true },
    httpsCallable: () => async () => ({ data: { ok: true } }),
    getMemberSession: () => null,
    db: { __db: true },
    doc: (_db, ...p) => ({ path: p.join('/') }),
    getDoc: async (ref) => (ref.path.startsWith('loginAccounts')
      ? Promise.reject(fnErr('firestore/permission-denied', 'denied'))
      : { exists: () => true, data: () => ({ name: 'ทริปฟูจิ' }) }),
    collection: (_db, ...p) => ({ path: p.join('/') }),
    query: (ref) => ref,
    limit: (n) => ({ n }),
    getDocs: async () => ({ docs: [] }),
    vapidKey: 'B' + 'A'.repeat(86)
  };

  // 1) Firestore denies the feed and the write probe → both rows fail loudly,
  //    each carrying the command that fixes the deploy.
  const deniedProbe = async () => ({
    read: { ok: false, code: 'firestore/permission-denied', message: 'Missing or insufficient permissions.' },
    write: { ok: false, code: 'firestore/permission-denied', message: 'Missing or insufficient permissions.' },
    cleaned: true
  });
  const denied = await runSystemDiagnostics({
    tripId: 't1', lang: 'th', isTripAdmin: true,
    deps: { ...base, probeNotifications: deniedProbe }
  });
  const rows = Object.fromEntries(denied.results.map(r => [r.id, r]));
  eq(rows['notify-read'].status, 'fail', 'a denied feed fails the system check');
  assert(/firestore:rules/.test(rows['notify-read'].fix || ''), '…with the publish command');
  eq(rows['notify-write'].status, 'fail', 'a denied write probe fails too');
  eq(rows['notify-push'].status, 'ok', 'a usable VAPID key is reported as ok');
  eq(denied.ok, false, 'the overall verdict is “problems found”');

  // 2) Healthy project → both rows pass, no failures anywhere.
  const healthy = await runSystemDiagnostics({
    tripId: 't1', lang: 'th', isTripAdmin: true,
    deps: {
      ...base,
      probeNotifications: async () => ({ read: { ok: true, code: '', message: '' }, write: { ok: true, code: '', message: '' }, cleaned: true })
    }
  });
  const healthyRows = Object.fromEntries(healthy.results.map(r => [r.id, r]));
  eq(healthyRows['notify-read'].status, 'ok', 'a readable feed passes');
  eq(healthyRows['notify-write'].status, 'ok', 'a removable probe document passes');
  assert(healthy.results.every(r => r.status !== 'fail'), 'no row fails on the healthy path');

  // 3) Members cannot delete their probe → the write check is skipped, not failed.
  let askedCanDelete = null;
  const member = await runSystemDiagnostics({
    tripId: 't1', lang: 'th', isTripAdmin: false,
    deps: {
      ...base,
      probeNotifications: async (_tripId, { canDelete } = {}) => {
        askedCanDelete = canDelete;
        return { read: { ok: true, code: '', message: '' }, write: null, cleaned: true };
      }
    }
  });
  const memberRows = Object.fromEntries(member.results.map(r => [r.id, r]));
  eq(askedCanDelete, false, 'the probe is told this caller may not delete');
  eq(memberRows['notify-write'].status, 'warn', 'a skipped write probe is a warning, not a failure');
  assert(member.results.every(r => r.status !== 'fail'), 'a member session stays “ok” when only the write probe is skipped');

  // 4) A local PIN session cannot reach Firestore at all → explained, not decoded.
  const pinDeps = {
    ...base,
    auth: { currentUser: null },
    getMemberSession: () => ({ memberId: 'u2', username: 'nun', tripId: 't1' }),
    getDoc: async () => { throw fnErr('firestore/permission-denied', 'denied'); },
    getDocs: async () => { throw fnErr('firestore/permission-denied', 'denied'); },
    probeNotifications: async () => ({
      read: { ok: false, code: 'firestore/permission-denied', message: 'Missing or insufficient permissions.' },
      write: null, cleaned: true
    })
  };
  const pin = await runSystemDiagnostics({ tripId: 't1', lang: 'th', isTripAdmin: false, deps: pinDeps });
  const pinRow = pin.results.find(r => r.id === 'notify-read');
  eq(pinRow.status, 'fail', 'the PIN session row fails');
  assert(/PIN|สมาชิก/.test(pinRow.detail), '…and says the PIN session is the reason');
  assert(/loginWithUsernamePin|Google/.test(pinRow.fix || ''), '…with both ways out');

  // 5) No VAPID key on the site → push is a warning (Web Push is optional, the
  //    in-app bell is not).
  const noVapid = await runSystemDiagnostics({
    tripId: 't1', lang: 'th',
    deps: { ...base, vapidKey: '', probeNotifications: async () => ({ read: { ok: true, code: '', message: '' }, write: null, cleaned: true }) }
  });
  const pushRow = noVapid.results.find(r => r.id === 'notify-push');
  eq(pushRow.status, 'warn', 'a missing VAPID key warns');
  assert(/FCM_VAPID_KEY/.test(pushRow.fix || ''), '…and names the secret to add');
  console.log('✓ notification diagnostics');
}
