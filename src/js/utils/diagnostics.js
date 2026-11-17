/**
 * System diagnostics.
 *
 * Legacy member-PIN login has three moving parts that live outside the app:
 *   1. Cloud Functions (`loginWithUsernamePin`) deployed in asia-southeast1
 *   2. Firestore Rules that keep credential and username-index documents server-only
 *   3. Members that actually have a username + PIN
 *
 * When one of them is missing Firebase only says `functions/internal: internal`,
 * which tells nobody anything. These helpers turn that into a Thai/English
 * explanation plus the exact command that fixes it.
 *
 * The Firebase imports are lazy (`loadDeps`) so the pure helpers can be unit
 * tested in Node without network access.
 */

import { validateVapidKey } from './notifications.js';

export const DIAG = { ok: 'ok', warn: 'warn', fail: 'fail' };

export const FIX = {
  deployFunctions: 'firebase deploy --only functions:healthCheck,functions:findMemberProfileByEmail,functions:lookupTripByInviteCode,functions:setMemberPin,functions:publishMemberLoginLookup,functions:clearMemberPin,functions:loginWithUsernamePin,functions:verifySensitiveActionPin (Blaze required; see docs/DEPLOY.md)',
  runInvoker: 'Review the callable invoker policy and function logs with your Firebase administrator; do not grant allUsers without confirming the intended access. See docs/DEPLOY.md.',
  deployRules: 'firebase deploy --only firestore:rules   (หรือเปิด Firebase Console > Firestore Database > Rules วางไฟล์ firestore.rules แล้วกด Publish)',
  deployWorkflow: 'push ขึ้น main (หรือ Actions > “Deploy Firestore rules & indexes (Spark)” > Run workflow) หลังตั้ง secret ชื่อ FIREBASE_SERVICE_ACCOUNT หรือ FIREBASE_TOKEN หนึ่งครั้ง',
  setVapid: 'ตั้ง GitHub Actions secret ชื่อ FCM_VAPID_KEY = “Key pair” (Firebase Console → Project settings → Cloud Messaging → Web Push certificates) แล้ว deploy ใหม่',
  setMemberPin: 'แชร์รหัสเชิญ (หน้าตั้งค่า) ให้สมาชิกกดขอเข้าร่วม แล้วอนุมัติที่หน้าสมาชิก — หรือเพิ่ม/แก้ไขสมาชิกแล้วตั้งชื่อผู้ใช้ + PIN'
};

const isTh = (lang) => String(lang || 'th').startsWith('th');
const pick = (lang, th, en) => (isTh(lang) ? th : en);

/** Cloud Functions error → human explanation + fix. */
export function classifyFunctionError(err, lang = 'th') {
  const code = String(err?.code || '').replace(/^functions\//, '');
  const msg = String(err?.message || '').trim();
  const lower = msg.toLowerCase();

  // The JS SDK may report `internal` when the endpoint is missing, in another
  // region, blocked by invoker policy, or has an unhandled server error.
  if (code === 'internal') {
    const raw = msg && lower !== 'internal' && !lower.includes('<!doctype') ? ` — ${msg}` : '';
    return {
      key: 'not-deployed',
      status: DIAG.fail,
      th: `เรียก Cloud Functions ไม่ได้ (ตอบกลับว่า "internal") — มักเกิดจากยังไม่ได้ deploy ฟังก์ชัน หรือ deploy คนละ region${raw}`,
      en: `Cloud Functions did not answer (returned "internal") — usually the function is not deployed yet or lives in another region${raw}`,
      fixTh: FIX.deployFunctions,
      fixEn: FIX.deployFunctions,
      extraTh: `ถ้า deploy แล้วแต่ยังเรียกไม่ได้ ให้ตรวจ log และนโยบาย invoker กับผู้ดูแล Firebase — อย่าเปิด allUsers โดยไม่ยืนยันนโยบายที่ตั้งใจไว้: ${FIX.runInvoker}`,
      extraEn: `If it is deployed and still fails, review logs and the intended invoker policy with your Firebase administrator; do not grant allUsers blindly: ${FIX.runInvoker}`
    };
  }
  if (code === 'unavailable' || /network|failed to fetch|cors/i.test(lower)) {
    return {
      key: 'unreachable',
      status: DIAG.fail,
      th: 'เชื่อมต่อ Cloud Functions ไม่ได้ (เครือข่าย/CORS)',
      en: 'Cannot reach Cloud Functions (network/CORS)',
      fixTh: 'ลองใหม่อีกครั้ง / ตรวจอินเทอร์เน็ต แล้วตรวจว่า deploy ฟังก์ชันไว้ที่ asia-southeast1',
      fixEn: 'Retry, check the network, and confirm the function is deployed to asia-southeast1'
    };
  }
  if (code === 'permission-denied' || code === 'unauthenticated') {
    return {
      key: 'permission',
      status: DIAG.warn,
      th: 'ฟังก์ชันปฏิเสธคำขอ — ตรวจสถานะการเข้าสู่ระบบ, PIN และสิทธิ์ของผู้เรียก',
      en: 'The callable rejected the request — check sign-in, PIN, and caller permissions',
      fixTh: `เข้าสู่ระบบ/ตรวจ PIN อีกครั้ง แล้วตรวจ log และนโยบาย invoker ที่ตั้งใจไว้: ${FIX.runInvoker}`,
      fixEn: `Sign in or re-check the PIN, then review function logs and the intended invoker policy: ${FIX.runInvoker}`
    };
  }
  if (code === 'not-found') {
    return {
      key: 'missing',
      status: DIAG.fail,
      th: `ฟังก์ชันที่เรียกไม่ถูก deploy (${msg || 'not found'})`,
      en: `The called function is not deployed (${msg || 'not found'})`,
      fixTh: FIX.deployFunctions,
      fixEn: FIX.deployFunctions
    };
  }
  return {
    key: 'error',
    status: DIAG.warn,
    th: `ฟังก์ชันตอบกลับข้อผิดพลาด: ${msg || code || 'unknown'}`,
    en: `The function returned an error: ${msg || code || 'unknown'}`,
    fixTh: 'ดู log ที่ Firebase Console > Functions > Logs',
    fixEn: 'Check Firebase Console > Functions > Logs'
  };
}

/** Firestore error → human explanation + fix. */
export function classifyFirestoreError(err, what = 'ข้อมูล', lang = 'th') {
  const code = String(err?.code || '').replace(/^firestore\//, '');
  const msg = String(err?.message || '');
  if (code === 'permission-denied') {
    return {
      status: DIAG.fail,
      text: pick(lang,
        `อ่าน${what}ไม่ได้ — Firestore Rules ยังไม่อนุญาต (permission-denied)`,
        `Cannot read ${what} — Firestore rules deny it (permission-denied)`),
      fix: pick(lang, FIX.deployRules, 'firebase deploy --only firestore:rules')
    };
  }
  if (code === 'unavailable' || code === 'deadline-exceeded' || /offline|timeout/i.test(msg)) {
    return {
      status: DIAG.warn,
      text: pick(lang, `เชื่อมต่อ Firestore ไม่ได้ชั่วคราว (${code || msg})`, `Firestore temporarily unreachable (${code || msg})`),
      fix: pick(lang, 'ตรวจอินเทอร์เน็ตแล้วลองใหม่', 'Check the connection and retry')
    };
  }
  return {
    status: DIAG.warn,
    text: pick(lang, `อ่าน${what}ผิดพลาด: ${msg || code}`, `Reading ${what} failed: ${msg || code}`),
    fix: null
  };
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => {
      const e = new Error(`timeout ${label}`);
      e.code = 'diagnostics/timeout';
      reject(e);
    }, ms))
  ]);
}

async function loadDeps() {
  const fb = await import('../firebase.js');
  const fs = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
  const memberAuth = await import('../auth/memberAuth.js');
  const push = await import('../notifications/push.js');
  const notifications = await import('../notifications/index.js');
  return {
    isFirebaseConfigured: fb.isFirebaseConfigured,
    isStorageAvailable: fb.isStorageAvailable,
    auth: fb.auth,
    db: fb.db,
    pushActions: true,
    functions: fb.functions,
    httpsCallable: fb.httpsCallable,
    getMemberSession: memberAuth.getMemberSession,
    // 🔔 the bell + Web Push: which layer is dead (rules / auth / write rights)
    probeNotifications: notifications.probeNotifications,
    vapidKey: (() => {
      try { return window.__FCM_VAPID_KEY__ || fb.resolvedFirebaseConfig?.fcmVapidKey || ''; }
      catch { return fb.resolvedFirebaseConfig?.fcmVapidKey || ''; }
    })(),
    pushEnabled: push.pushEnabled,
    pushToken: push.currentPushToken,
    pushPermission: push.notificationPermission,
    ...fs
  };
}

function functionUserMessage(err, lang) {
  const code = String(err?.code || '');
  const msg = String(err?.message || '');
  if (/internal/i.test(code + msg) && String(msg).trim().toLowerCase() === 'internal') {
    return pick(lang,
      'Cloud Function ไม่ตอบกลับ (internal) — อาจยังไม่ได้ deploy, อยู่คนละ region หรือเกิดข้อผิดพลาดฝั่งเซิร์ฟเวอร์',
      'Cloud Function did not answer (internal) — it may be undeployed, in another region, or failing server-side');
  }
  return msg || code;
}

/**
 * Probe the callable endpoint. `healthCheck` is the fast path, but a project
 * that has not deployed the newest functions still has `loginWithUsernamePin`,
 * so fall back to it before declaring the backend broken.
 */
async function probeFunctions(deps, { timeoutMs, lang }) {
  const call = (name, data) => withTimeout(
    deps.httpsCallable(deps.functions, name)(data), timeoutMs, `functions/${name}`
  );

  let firstError = null;
  try {
    const res = await call('healthCheck', {});
    if (res?.data?.ok !== false) {
      return { ok: true, via: 'healthCheck', detail: pick(lang, 'เรียก healthCheck สำเร็จ', 'healthCheck responded') };
    }
    firstError = new Error(res?.data?.error || 'healthCheck reported a problem');
  } catch (e) {
    firstError = e;
  }

  // Deployed but without healthCheck? A wrong username on the real login
  // function proves the endpoint works (it answers `not-found: User not found`).
  try {
    await call('loginWithUsernamePin', { username: '__diagnostic_probe__', pin: '0000', tripId: null });
    return { ok: true, via: 'login', detail: pick(lang, 'ฟังก์ชันล็อกอินตอบกลับปกติ', 'Login function responded') };
  } catch (e) {
    const code = String(e?.code || '').replace(/^functions\//, '');
    const msg = String(e?.message || '');
    const reachable = code === 'not-found' || code === 'unauthenticated' || code === 'resource-exhausted'
      || code === 'invalid-argument' || code === 'permission-denied'
      || /user not found|invalid pin|too many/i.test(msg);
    if (reachable) {
      return {
        ok: true,
        via: 'login',
        detail: pick(lang, 'ฟังก์ชันล็อกอินใช้งานได้ (ยังไม่มี healthCheck จนกว่าจะ deploy รอบใหม่)',
                       'Login function works (healthCheck appears after the next deploy)')
      };
    }
    return { ok: false, error: e || firstError, detail: functionUserMessage(e || firstError, lang) };
  }
}

/**
 * Run every check. `deps` can be injected for tests.
 * @returns {Promise<{ok:boolean, results:Array<{id,label,status,detail,fix}>}>}
 */
export async function runSystemDiagnostics({ tripId = null, lang = 'th', timeoutMs = 9000, deps = null, isTripAdmin = false } = {}) {
  const d = deps || await loadDeps();
  const results = [];
  const add = (id, label, status, detail, fix = null) => results.push({ id, label, status, detail, fix });

  // 1. Firebase config
  if (!d.isFirebaseConfigured) {
    add('config', pick(lang, 'Firebase Config', 'Firebase config'), DIAG.fail,
      pick(lang, 'ยังไม่ได้ตั้งค่า Firebase', 'Firebase is not configured'),
      pick(lang, 'ใส่ค่า config ใน firebase.config.js', 'Fill in firebase.config.js'));
  } else {
    add('config', pick(lang, 'Firebase Config', 'Firebase config'), DIAG.ok,
      pick(lang, 'ตั้งค่าแล้ว', 'Configured'));
  }

  // 2. Signed-in session
  let session = null;
  try { session = d.getMemberSession?.() || null; } catch {}
  const user = d.auth?.currentUser || null;
  if (user) {
    add('session', pick(lang, 'เซสชันผู้ใช้', 'User session'), DIAG.ok,
      pick(lang, `ล็อกอิน Firebase แล้ว (${user.email || user.uid})`, `Signed in to Firebase (${user.email || user.uid})`));
  } else if (session?.memberId) {
    add('session', pick(lang, 'เซสชันผู้ใช้', 'User session'), DIAG.warn,
      pick(lang, `พบเซสชันสมาชิกแบบเก่าของ "${session.username || session.memberId}" — แสดงได้เฉพาะข้อมูลแคช ไม่ได้เข้าสู่ระบบ Firebase`,
                `Legacy device-only session for "${session.username || session.memberId}" — cached data only; not signed in to Firebase`),
      pick(lang, 'เข้าสู่ระบบด้วย Google แล้วขอเข้าร่วมทริปอีกครั้งเพื่อซิงก์ข้อมูล', 'Sign in with Google and request to join the trip again to sync data'));
  } else {
    add('session', pick(lang, 'เซสชันผู้ใช้', 'User session'), DIAG.warn,
      pick(lang, 'ยังไม่ได้ล็อกอิน', 'Not signed in'));
  }

  // 3. Cloud Functions are optional on Spark, but when configured we verify the
  // callable path so Blaze users can distinguish an available API from a deploy issue.
  const optionalFunctionsNote = pick(lang,
    'ฟังก์ชันเป็นทางเลือกบน Spark; PIN/ค้นหาอีเมล/repair invite ต้องใช้ Blaze',
    'Functions are optional on Spark; PIN, email lookup, and invite repair require Blaze');
  if (!d.functions) {
    add('functions', 'Cloud Functions', DIAG.warn,
      `${pick(lang, 'ยังไม่ได้ตั้งค่า Firebase Functions', 'Firebase Functions is not initialised')} · ${optionalFunctionsNote}`,
      FIX.deployFunctions);
  } else {
    try {
      const probe = await probeFunctions(d, { timeoutMs, lang });
      if (probe.ok) {
        add('functions', 'Cloud Functions', DIAG.ok,
          `${pick(lang, 'พร้อมใช้งาน', 'Available')} · ${probe.detail}`);
      } else {
        const info = classifyFunctionError(probe.error, lang);
        const detail = isTh(lang) ? info.th : info.en;
        const extra = isTh(lang) ? info.extraTh : info.extraEn;
        add('functions', 'Cloud Functions', DIAG.warn,
          `${detail} · ${optionalFunctionsNote}`,
          `${isTh(lang) ? info.fixTh : info.fixEn}${extra ? `\n${extra}` : ''}`);
      }
    } catch (e) {
      add('functions', 'Cloud Functions', DIAG.warn,
        `${e.message} · ${optionalFunctionsNote}`, FIX.deployFunctions);
    }
  }

  // 4. Firestore: read the trip document (needs the rules deployed)
  if (!d.db || !tripId) {
    add('firestore', 'Firestore', DIAG.warn,
      pick(lang, 'ข้ามการทดสอบ (ไม่มี trip)', 'Skipped (no trip)'));
  } else {
    try {
      const snap = await withTimeout(d.getDoc(d.doc(d.db, 'trips', tripId)), timeoutMs, 'trips doc');
      add('firestore', 'Firestore', snap.exists() ? DIAG.ok : DIAG.warn,
        snap.exists()
          ? pick(lang, 'อ่านข้อมูลทริปได้ปกติ', 'Trip document readable')
          : pick(lang, 'ไม่พบเอกสารทริปนี้', 'Trip document not found'));
    } catch (e) {
      const info = classifyFirestoreError(e, pick(lang, 'ข้อมูลทริป', 'the trip'), lang);
      add('firestore', 'Firestore', info.status, info.text, info.fix);
    }
  }

  // 5. Rules: public directory profile is owner-readable; email search is a guarded callable.
  if (d.db) {
    // Owner-readability does not prove that the callable is deployed; the Functions probe above
    // checks endpoint availability and `findMemberProfileByEmail` enforces the manager boundary.
    if (d.auth?.currentUser?.uid) {
      try {
        await withTimeout(d.getDoc(d.doc(d.db, 'publicProfiles', d.auth.currentUser.uid)), timeoutMs, 'publicProfiles');
        add('rules-profiles', pick(lang, 'Rules โปรไฟล์บัญชี (publicProfiles)', 'Account profile rules'), DIAG.ok,
          pick(lang, 'อ่านโปรไฟล์ของบัญชีตัวเองได้; ค้นหาอีเมลใช้ callable ที่ตรวจสิทธิ์', 'Your own profile is readable; email search uses the guarded callable'));
      } catch (e) {
        const info = classifyFirestoreError(e, pick(lang, 'ไดเรกทอรีบัญชี', 'the account directory'), lang);
        add('rules-profiles', pick(lang, 'Rules โปรไฟล์บัญชี (publicProfiles)', 'Account profile rules'), info.status,
          pick(lang, 'ยังอ่านโปรไฟล์ของตัวเองไม่ได้ — การซิงก์โปรไฟล์อาจล้มเหลว',
                    'The owner profile is not readable — profile sync may fail'),
          FIX.deployRules);
      }
    }

    // 5b. Rules: invite-code lookup + join requests (members joining a trip)
    if (tripId) {
      try {
        await withTimeout(d.getDocs(d.query(d.collection(d.db, 'trips', tripId, 'joinRequests'), d.limit(1))), timeoutMs, 'joinRequests');
        add('rules-join', pick(lang, 'Rules สำหรับคำขอเข้าร่วมทริป', 'Join-request rules'), DIAG.ok,
          pick(lang, 'สมาชิกขอเข้าร่วมทริปได้ตามปกติ', 'Members can request to join'));
      } catch (e) {
        const info = classifyFirestoreError(e, pick(lang, 'คำขอเข้าร่วม', 'join requests'), lang);
        add('rules-join', pick(lang, 'Rules สำหรับคำขอเข้าร่วมทริป', 'Join-request rules'), info.status,
          pick(lang, 'สมาชิกจะเจอ "Missing or insufficient permissions" ตอนกรอกรหัสเชิญ',
                    'Members will hit "Missing or insufficient permissions" when entering the invite code'),
          FIX.deployRules);
      }
    }

    // 6. Rules: post-it notes collection
    if (tripId) {
      try {
        await withTimeout(d.getDocs(d.query(d.collection(d.db, 'trips', tripId, 'notes'), d.limit(1))), timeoutMs, 'notes');
        add('rules-notes', pick(lang, 'Firestore Rules สำหรับโพสต์อิท', 'Post-it notes rules'), DIAG.ok,
          pick(lang, 'อ่าน/เขียนโน้ตในแผนได้', 'Notes collection is allowed'));
      } catch (e) {
        const info = classifyFirestoreError(e, pick(lang, 'โน้ต', 'notes'), lang);
        add('rules-notes', pick(lang, 'Firestore Rules สำหรับโพสต์อิท', 'Post-it notes rules'), info.status, info.text, FIX.deployRules);
      }
    }

    // 6b. Rules: comments on expenses + the activity log ("ใครแก้ไขล่าสุด")
    if (tripId) {
      try {
        await withTimeout(d.getDocs(d.query(d.collection(d.db, 'trips', tripId, 'comments'), d.limit(1))), timeoutMs, 'comments');
        add('rules-comments', pick(lang, 'Rules สำหรับความเห็น/ทักท้วง', 'Comment rules'), DIAG.ok,
          pick(lang, 'ทักท้วงรายการค่าใช้จ่ายได้ และซิงก์ข้ามเครื่อง', 'Expense comments work and sync across devices'));
      } catch (e) {
        const info = classifyFirestoreError(e, pick(lang, 'ความเห็น', 'comments'), lang);
        add('rules-comments', pick(lang, 'Rules สำหรับความเห็น/ทักท้วง', 'Comment rules'), info.status,
          pick(lang, 'ความเห็นจะถูกเก็บไว้ในเครื่องนี้ก่อน — ยังไม่ซิงก์ข้ามเครื่อง', 'Comments stay on this device until the rules allow them'),
          FIX.deployRules);
      }
      try {
        await withTimeout(d.getDocs(d.query(d.collection(d.db, 'trips', tripId, 'activity'), d.limit(1))), timeoutMs, 'activity');
        add('rules-activity', pick(lang, 'Rules สำหรับประวัติการแก้ไข', 'Activity-log rules'), DIAG.ok,
          pick(lang, 'ประวัติ "ใครแก้ล่าสุด" ถูกบันทึกครบ', 'The \"who edited last\" history is recorded'));
      } catch (e) {
        const info = classifyFirestoreError(e, pick(lang, 'ประวัติการแก้ไข', 'the activity log'), lang);
        add('rules-activity', pick(lang, 'Rules สำหรับประวัติการแก้ไข', 'Activity-log rules'), info.status,
          pick(lang, 'ประวัติจะถูกเก็บในเครื่องนี้ก่อน — ยังไม่ซิงก์ข้ามเครื่อง', 'History stays on this device until the rules allow it'),
          FIX.deployRules);
      }
    }

    // 7. Security: credential and username-index collections must be server-only.
    if (!user?.uid) {
      add('security-pins', pick(lang, 'ความปลอดภัยของ PIN', 'PIN security'), DIAG.warn,
        pick(lang, 'ต้องเข้าสู่ระบบ Firebase ก่อนจึงจะตรวจสิทธิ์อ่านเอกสารลับได้',
                  'Sign in to Firebase to verify that private credential documents are unreadable'));
    } else {
      const privateDocs = [
        ['loginAccounts', '__diagnostic_probe__'],
        ['memberSecrets', '__diagnostic_probe__'],
        ['userSecrets', '__diagnostic_probe__'],
        ['publicMemberLogins', '__diagnostic_probe__']
      ];
      const checks = await Promise.allSettled(privateDocs.map(async ([collectionName, id]) => {
        await withTimeout(d.getDoc(d.doc(d.db, collectionName, id)), timeoutMs, collectionName);
        return collectionName;
      }));
      const readable = checks.filter((check) => check.status === 'fulfilled').map((check) => check.value);
      const unexpectedErrors = checks.filter((check) => check.status === 'rejected'
        && !String(check.reason?.code || '').includes('permission-denied'));
      if (readable.length) {
        add('security-pins', pick(lang, 'ความปลอดภัยของ PIN', 'PIN security'), DIAG.fail,
          pick(lang, `เอกสารลับอ่านได้จากเว็บ: ${readable.join(', ')} — ปิดการอ่านด้วย Firestore Rules`,
                    `Private records are browser-readable: ${readable.join(', ')} — deny reads in Firestore Rules`),
          FIX.deployRules);
      } else if (unexpectedErrors.length) {
        const error = unexpectedErrors[0].reason;
        add('security-pins', pick(lang, 'ความปลอดภัยของ PIN', 'PIN security'), DIAG.warn,
          pick(lang, `ตรวจสิทธิ์เอกสารลับไม่สำเร็จ: ${error?.message || error}`,
                    `Could not verify private-record rules: ${error?.message || error}`),
          FIX.deployRules);
      } else {
        add('security-pins', pick(lang, 'ความปลอดภัยของ PIN', 'PIN security'), DIAG.ok,
          pick(lang, 'PIN และดัชนีชื่อผู้ใช้อ่านจากเว็บไม่ได้ (ทำงานผ่าน callable เท่านั้น)',
                    'PINs and username indexes are not browser-readable (callable Functions only)'));
      }
    }

    // 8. Do the members actually have a username + PIN yet?
    if (tripId) {
      try {
        const snap = await withTimeout(d.getDocs(d.query(d.collection(d.db, 'trips', tripId, 'members'), d.limit(20))), timeoutMs, 'members');
        const ready = snap.docs.filter((x) => {
          const member = x.data() || {};
          return member.status === 'active' && member.loginReady !== false && Boolean(member.username);
        });
        add('member-pins', pick(lang, 'สมาชิกที่ตั้งชื่อผู้ใช้แล้ว', 'Members with username login configured'),
          ready.length ? DIAG.ok : DIAG.warn,
          ready.length
            ? pick(lang, `มีสมาชิกที่ยังใช้งานได้ ${ready.length} คนตั้งชื่อผู้ใช้ล็อกอินแล้ว`, `${ready.length} active member(s) have a username login configured`)
            : pick(lang, 'ยังไม่มีสมาชิกที่ตั้งชื่อผู้ใช้ล็อกอิน — เชิญด้วยรหัสเชิญ หรือให้ผู้ดูแลตั้งชื่อผู้ใช้ + PIN',
                            'No active member has a username login configured — invite them with the trip code, or ask an admin to set a username + PIN'),
          ready.length ? null : FIX.setMemberPin);
      } catch (e) {
        add('member-pins', pick(lang, 'สมาชิกที่ตั้งชื่อผู้ใช้แล้ว', 'Members with username login configured'), DIAG.warn,
          pick(lang, `อ่านรายชื่อสมาชิกไม่ได้: ${e.message}`, `Cannot read members: ${e.message}`),
          pick(lang, 'ตรวจสอบว่าเป็นสมาชิกของทริปนี้', 'Make sure you are a member of this trip'));
      }
    }
  }

  // 9. Storage availability (covers/uploads)
  add('storage', pick(lang, 'Firebase Storage', 'Firebase Storage'),
    d.isStorageAvailable === false ? DIAG.warn : DIAG.ok,
    d.isStorageAvailable === false
      ? pick(lang, 'ไม่พร้อมใช้งาน — รูปภาพจะถูกเก็บเป็นลิงก์แทน', 'Unavailable — images are stored as links instead')
      : pick(lang, 'พร้อมใช้งาน', 'Available'));

  // 10. 🔔 การแจ้งเตือน — the exact question the user report left open:
  //     “ไม่มีข้อความเลย” can come from the published rules, from the caller's
  //     auth context or from a write that the rules refuse. The probe below
  //     runs the SAME query the bell uses, so it names the broken layer.
  const memberSession = !d.auth?.currentUser && Boolean(d.getMemberSession?.());
  if (tripId && d.db && typeof d.probeNotifications === 'function') {
    try {
      const probe = await withTimeout(
        d.probeNotifications(tripId, { uid: user?.uid || '', canDelete: Boolean(isTripAdmin), lang }),
        timeoutMs, 'notifications'
      );

      if (probe.read.ok) {
        add('notify-read', pick(lang, 'อ่านรายการแจ้งเตือน (กระดิ่ง)', 'Notification feed (bell)'), DIAG.ok,
          pick(lang, 'อ่านรายการของทริปนี้ได้ — กระดิ่งจะแสดงข้อความ', 'This trip’s feed is readable — the bell will show messages'));
      } else {
        const info = classifyFirestoreError(probe.read, pick(lang, 'รายการแจ้งเตือน', 'the notification feed'), lang);
        add('notify-read', pick(lang, 'อ่านรายการแจ้งเตือน (กระดิ่ง)', 'Notification feed (bell)'), DIAG.fail,
          memberSession
            ? pick(lang, 'เซสชันสมาชิก (PIN) อ่านการแจ้งเตือนไม่ได้ เพราะไม่มีการล็อกอิน Firebase',
                'A PIN member session cannot read the feed — there is no Firebase sign-in')
            : info.text,
          memberSession
            ? pick(lang, 'ให้ผู้ดูแล deploy ฟังก์ชัน loginWithUsernamePin แล้วล็อกอินใหม่ หรือเข้าสู่ระบบด้วยบัญชี Google/อีเมล',
                'Ask the owner to deploy loginWithUsernamePin and sign in again, or sign in with Google/email')
            : info.fix);
      }

      if (probe.write) {
        add('notify-write', pick(lang, 'เขียนการแจ้งเตือน (ทดสอบ)', 'Writing a notification (test)'),
          probe.write.ok ? DIAG.ok : DIAG.fail,
          probe.write.ok
            ? (probe.cleaned
              ? pick(lang, 'เขียนแล้วลบรายการทดสอบได้ปกติ — แจ้งเตือนของคนอื่นจะถูกสร้างได้',
                  'The probe was written and removed — notifications for other members can be created')
              : pick(lang, 'เขียนได้ แต่ลบไม่ได้ (เฉพาะผู้ดูแลทริปลบได้)',
                  'Written, but removing it needs a trip admin'))
            : `${classifyFirestoreError(probe.write, pick(lang, 'การแจ้งเตือน', 'the notification'), lang).text}`,
          probe.write.ok ? null : FIX.deployRules);
      } else {
        add('notify-write', pick(lang, 'เขียนการแจ้งเตือน (ทดสอบ)', 'Writing a notification (test)'), DIAG.warn,
          pick(lang, 'ข้ามการทดสอบการเขียน — ทำได้เฉพาะผู้ดูแลทริป (ผู้ทดสอบต้องลบรายการทดสอบได้)',
            'Write probe skipped — only a trip admin can run it (the probe must be removable)'));
      }
    } catch (e) {
      add('notify-read', pick(lang, 'อ่านรายการแจ้งเตือน (กระดิ่ง)', 'Notification feed (bell)'), DIAG.warn,
        pick(lang, `ตรวจสอบไม่สำเร็จ: ${e.message}`, `Check failed: ${e.message}`));
    }
  } else if (tripId && d.db) {
    add('notify-read', pick(lang, 'อ่านรายการแจ้งเตือน (กระดิ่ง)', 'Notification feed (bell)'), DIAG.warn,
      pick(lang, 'ข้ามการทดสอบ (ไม่มีตัวตรวจการแจ้งเตือน)', 'Skipped (no notification probe available)'));
  }

  if (d.pushActions) {
    add('push-sender', 'GitHub Actions Push sender', DIAG.warn,
      pick(lang, 'เว็บตรวจ Secrets/สถานะ Actions ไม่ได้ — ผู้ดูแลต้องเปิด workflow Send FCM Push (Spark); ปกติทุก 30 นาทีและอาจล่าช้า',
        'The browser cannot inspect Actions secrets/status. Enable Send FCM Push (Spark); normally every 30 minutes, possibly delayed'),
      'Set FIREBASE_PUSH_SERVICE_ACCOUNT and PUSH_ACTIONS_ENABLED=true in GitHub Actions — docs/PUSH-ACTIONS.md');
  }

  // 11. Web Push readiness — this device + the deployed VAPID key.
  const vapid = validateVapidKey(d.vapidKey || '', lang);
  const permission = (() => { try { return d.pushPermission?.() || 'default'; } catch { return 'unknown'; } })();
  const pushOn = (() => { try { return Boolean(d.pushEnabled?.()); } catch { return false; } })();
  const token = (() => { try { return d.pushToken?.() || ''; } catch { return ''; } })();
  const pushDetail = [
    vapid.valid
      ? pick(lang, 'เว็บนี้มีคีย์ VAPID', 'This site serves a VAPID key')
      : vapid.reason,
    pick(lang, `สิทธิ์การแจ้งเตือน: ${permission}`, `Notification permission: ${permission}`),
    pushOn && token
      ? pick(lang, 'อุปกรณ์นี้ลงทะเบียน Push แล้ว', 'This device is registered for Push')
      : pick(lang, 'อุปกรณ์นี้ยังไม่เปิด Push', 'Push is not enabled on this device')
  ].join(' · ');
  add('notify-push', pick(lang, 'Web Push (FCM)', 'Web Push (FCM)'),
    vapid.valid ? DIAG.ok : DIAG.warn,
    pushDetail,
    vapid.valid ? null : pick(lang, FIX.setVapid,
      'Set the FCM_VAPID_KEY GitHub Actions secret (= “Key pair” from Firebase Console → Project settings → Cloud Messaging → Web Push certificates) and redeploy'));

  return { ok: !results.some(r => r.status === DIAG.fail), results };
}

/** Plain-text report the admin can copy and paste when asking for help. */
export function formatDiagnosticsReport({ tripId = null, results = [], lang = 'th', now = new Date() } = {}) {
  const icon = { ok: '✅', warn: '⚠️', fail: '❌' };
  const head = pick(lang,
    `ผลตรวจสอบระบบ Trip Manager — ${now.toISOString()}`,
    `Trip Manager system check — ${now.toISOString()}`);
  const lines = [head, `trip: ${tripId || '-'}`, `ua: ${typeof navigator !== 'undefined' ? navigator.userAgent : '-'}`];
  for (const r of results) {
    lines.push(`${icon[r.status] || '•'} ${r.label}: ${r.detail}${r.fix ? `\n   → ${String(r.fix).replace(/\n/g, '\n   → ')}` : ''}`);
  }
  return lines.join('\n');
}
