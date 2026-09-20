/**
 * System diagnostics.
 *
 * Member login has three moving parts that live outside the app:
 *   1. Cloud Functions (`loginWithUsernamePin`) deployed in asia-southeast1
 *   2. Firestore rules that allow the username lookup (`publicMemberLogins`)
 *   3. Members that actually have a username + PIN
 *
 * When one of them is missing Firebase only says `functions/internal: internal`,
 * which tells nobody anything. These helpers turn that into a Thai/English
 * explanation plus the exact command that fixes it.
 *
 * The Firebase imports are lazy (`loadDeps`) so the pure helpers can be unit
 * tested in Node without network access.
 */

export const DIAG = { ok: 'ok', warn: 'warn', fail: 'fail' };

export const FIX = {
  deployFunctions: 'firebase deploy --only functions   (โปรเจกต์ต้องอยู่แผน Blaze ก่อน)',
  runInvoker: 'gcloud run services add-iam-policy-binding loginwithusernamepin --region=asia-southeast1 --member=allUsers --role=roles/run.invoker',
  deployRules: 'firebase deploy --only firestore:rules   (หรือวาง firestore.rules ใน Firebase Console > Firestore > Rules > Publish)',
  setMemberPin: 'แชร์รหัสเชิญ (หน้าตั้งค่า) ให้สมาชิกกดขอเข้าร่วม แล้วอนุมัติที่หน้าสมาชิก — หรือเพิ่ม/แก้ไขสมาชิกแล้วตั้งชื่อผู้ใช้ + PIN'
};

const isTh = (lang) => String(lang || 'th').startsWith('th');
const pick = (lang, th, en) => (isTh(lang) ? th : en);

/** Cloud Functions error → human explanation + fix. */
export function classifyFunctionError(err, lang = 'th') {
  const code = String(err?.code || '').replace(/^functions\//, '');
  const msg = String(err?.message || '').trim();
  const lower = msg.toLowerCase();

  // The JS SDK reports `internal` / "internal" whenever the endpoint answered
  // with something that is not a callable payload (404 HTML page, Cloud Run
  // 403 HTML page, gateway error). Practically it means: not deployed, deployed
  // in another region, or Cloud Run blocks anonymous invocation.
  if (code === 'internal') {
    // `functions/internal` is what the SDK reports for a 404/403 HTML page (not
    // deployed, wrong region, Cloud Run IAM) and also for unhandled crashes —
    // either way the deploy/IAM checklist is the right first step.
    const raw = msg && lower !== 'internal' && !lower.includes('<!doctype') ? ` — ${msg}` : '';
    return {
      key: 'not-deployed',
      status: DIAG.fail,
      th: `เรียก Cloud Functions ไม่ได้ (ตอบกลับว่า "internal") — มักเกิดจากยังไม่ได้ deploy ฟังก์ชัน หรือ deploy คนละ region${raw}`,
      en: `Cloud Functions did not answer (returned "internal") — usually the function is not deployed yet or lives in another region${raw}`,
      fixTh: FIX.deployFunctions,
      fixEn: 'firebase deploy --only functions   (the project must be on the Blaze plan)',
      extraTh: `ถ้า deploy แล้วแต่ยังเรียกไม่ได้ ให้เปิดสิทธิ์ผู้เรียก Cloud Run (คำสั่งด้านล่าง): ${FIX.runInvoker}`,
      extraEn: `If it is deployed and still fails, allow anonymous invocation: ${FIX.runInvoker}`
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
      th: 'ฟังก์ชันตอบกลับว่าต้องมีสิทธิ์ (ผู้ใช้/PIN ไม่ถูกต้อง หรือ Cloud Run ไม่ได้เปิดให้ผู้ไม่ระบุตัวตนเรียก)',
      en: 'The function requires permission (wrong user/PIN, or Cloud Run blocks anonymous calls)',
      fixTh: `ตรวจชื่อผู้ใช้/PIN อีกครั้ง · ถ้าเป็นทุกคนให้เปิดสิทธิ์: ${FIX.runInvoker}`,
      fixEn: `Re-check the username/PIN · to allow everyone run: ${FIX.runInvoker}`
    };
  }
  if (code === 'not-found') {
    return {
      key: 'missing',
      status: DIAG.fail,
      th: `ฟังก์ชันที่เรียกไม่ถูก deploy (${msg || 'not found'})`,
      en: `The called function is not deployed (${msg || 'not found'})`,
      fixTh: FIX.deployFunctions,
      fixEn: 'firebase deploy --only functions'
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
  return {
    isFirebaseConfigured: fb.isFirebaseConfigured,
    isStorageAvailable: fb.isStorageAvailable,
    auth: fb.auth,
    db: fb.db,
    functions: fb.functions,
    httpsCallable: fb.httpsCallable,
    getMemberSession: memberAuth.getMemberSession,
    ...fs
  };
}

function functionUserMessage(err, lang) {
  const code = String(err?.code || '');
  const msg = String(err?.message || '');
  if (/internal/i.test(code + msg) && String(msg).trim().toLowerCase() === 'internal') {
    return pick(lang,
      'Cloud Function ไม่ตอบกลับ (internal) — ยังไม่ได้ deploy หรือ Cloud Run ไม่ได้เปิดให้ผู้ไม่ระบุตัวตนเรียก',
      'Cloud Function did not answer (internal) — not deployed, or Cloud Run blocks anonymous calls');
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
export async function runSystemDiagnostics({ tripId = null, lang = 'th', timeoutMs = 9000, deps = null } = {}) {
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
      pick(lang, `ล็อกอินด้วยบัญชี Google/อีเมล (${user.email || user.uid})`, `Signed in with Google/email (${user.email || user.uid})`));
  } else if (session?.memberId) {
    add('session', pick(lang, 'เซสชันผู้ใช้', 'User session'), DIAG.warn,
      pick(lang, `ล็อกอินเป็นสมาชิก "${session.username || session.memberId}" แบบไม่ใช้ Cloud Functions`,
                `Signed in as member "${session.username || session.memberId}" without Cloud Functions`),
      pick(lang, 'ถ้าต้องการซิงก์ข้อมูล ให้ deploy functions ตามข้อมูลด้านล่าง', 'Deploy the functions below for full sync'));
  } else {
    add('session', pick(lang, 'เซสชันผู้ใช้', 'User session'), DIAG.warn,
      pick(lang, 'ยังไม่ได้ล็อกอิน', 'Not signed in'));
  }

  // 3. Cloud Functions
  if (!d.functions) {
    add('functions', 'Cloud Functions', DIAG.fail,
      pick(lang, 'ยังไม่ได้ตั้งค่า Firebase Functions', 'Firebase Functions is not initialised'),
      FIX.deployFunctions);
  } else {
    try {
      const probe = await probeFunctions(d, { timeoutMs, lang });
      if (probe.ok) {
        add('functions', 'Cloud Functions', DIAG.ok,
          `${pick(lang, 'พร้อมใช้งาน', 'Available')} · ${probe.detail}`);
      } else {
        const info = classifyFunctionError(probe.error, lang);
        add('functions', 'Cloud Functions', info.status, info.th && isTh(lang) ? info.th : info.en,
          (isTh(lang) ? info.fixTh : info.fixEn) + (info.extraTh && isTh(lang) ? `\n${info.extraTh}` : ''));
      }
    } catch (e) {
      add('functions', 'Cloud Functions', DIAG.fail, e.message, FIX.deployFunctions);
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

  // 5. Rules: username → trip lookup used by the login page
  if (d.db) {
    try {
      await withTimeout(d.getDoc(d.doc(d.db, 'publicMemberLogins', '__diagnostic_probe__')), timeoutMs, 'publicMemberLogins');
      add('rules-login', pick(lang, 'Firestore Rules สำหรับล็อกอินสมาชิก', 'Member-login Firestore rules'), DIAG.ok,
        pick(lang, 'อ่านตารางชื่อผู้ใช้สำหรับล็อกอินได้ (publicMemberLogins)', 'Username lookup is readable (publicMemberLogins)'));
    } catch (e) {
      const info = classifyFirestoreError(e, pick(lang, 'ตารางชื่อผู้ใช้ (publicMemberLogins)', 'the username lookup (publicMemberLogins)'), lang);
      add('rules-login', pick(lang, 'Firestore Rules สำหรับล็อกอินสมาชิก', 'Member-login Firestore rules'),
        info.status,
        pick(lang, 'ยังอ่านตารางชื่อผู้ใช้ไม่ได้ — สมาชิกจะล็อกอินได้เฉพาะเครื่องที่เคยสร้างบัญชี',
                  'The username lookup is not readable — members can only sign in on the device that created them'),
        FIX.deployRules);
    }

    // 5b. Rules: public directory used by "add member by email"
    if (d.auth?.currentUser?.uid) {
      try {
        await withTimeout(d.getDoc(d.doc(d.db, 'publicProfiles', d.auth.currentUser.uid)), timeoutMs, 'publicProfiles');
        add('rules-profiles', pick(lang, 'Rules ไดเรกทอรีบัญชี (publicProfiles)', 'Account directory rules'), DIAG.ok,
          pick(lang, 'แอดมินค้นหาสมาชิกด้วยอีเมลได้', 'Admins can find members by email'));
      } catch (e) {
        const info = classifyFirestoreError(e, pick(lang, 'ไดเรกทอรีบัญชี', 'the account directory'), lang);
        add('rules-profiles', pick(lang, 'Rules ไดเรกทอรีบัญชี (publicProfiles)', 'Account directory rules'), info.status,
          pick(lang, 'ยังอ่านไดเรกทอรีบัญชีไม่ได้ — ปุ่ม "เพิ่มด้วยอีเมล" จะใช้ไม่ได้',
                    'The account directory is not readable — "Add by email" will not work'),
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

    // 7. Security: PIN hashes must never be client readable
    try {
      const snap = await withTimeout(d.getDoc(d.doc(d.db, 'loginAccounts', '__diagnostic_probe__')), timeoutMs, 'loginAccounts');
      // Reading `loginAccounts` must always fail — the PIN hashes live there.
      add('security-pins', pick(lang, 'ความปลอดภัยของ PIN', 'PIN security'), DIAG.warn,
        pick(lang, `⚠️ อ่านเอกสาร loginAccounts จากฝั่งเว็บได้ (${snap.exists() ? 'พบเอกสาร' : 'ไม่พบเอกสาร'}) ควรปิดด้วย rules`,
                   `⚠️ loginAccounts is client readable (${snap.exists() ? 'document found' : 'no document'}) — lock it down with rules`),
        FIX.deployRules);
    } catch (e) {
      const denied = String(e?.code || '').includes('permission-denied');
      add('security-pins', pick(lang, 'ความปลอดภัยของ PIN', 'PIN security'), denied ? DIAG.ok : DIAG.warn,
        denied
          ? pick(lang, 'PIN ถูกเก็บฝั่งเซิร์ฟเวอร์ (อ่านจากเว็บไม่ได้)', 'PIN hashes stay server-side (not client readable)')
          : pick(lang, `ตรวจสอบไม่สำเร็จ: ${e.message}`, `Check failed: ${e.message}`));
    }

    // 8. Do the members actually have a username + PIN yet?
    if (tripId) {
      try {
        const snap = await withTimeout(d.getDocs(d.query(d.collection(d.db, 'trips', tripId, 'members'), d.limit(20))), timeoutMs, 'members');
        const ready = snap.docs.filter(x => x.data()?.loginReady || x.data()?.pinHash || x.data()?.username);
        add('member-pins', pick(lang, 'สมาชิกที่ล็อกอินได้', 'Members who can sign in'),
          ready.length ? DIAG.ok : DIAG.warn,
          ready.length
            ? pick(lang, `มี ${ready.length} คนที่ล็อกอินได้`, `${ready.length} member(s) can sign in`)
            : pick(lang, 'ยังไม่มีสมาชิกที่ล็อกอินได้ — เชิญด้วยรหัสเชิญ หรือตั้งชื่อผู้ใช้ + PIN ให้สมาชิก',
                            'No member can sign in yet — invite them with the trip code, or set a username + PIN'),
          ready.length ? null : FIX.setMemberPin);
      } catch (e) {
        add('member-pins', pick(lang, 'สมาชิกที่ล็อกอินได้', 'Members who can sign in'), DIAG.warn,
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

  return { ok: !results.some(r => r.status === DIAG.fail), results };
}

/** Plain-text report the admin can copy and paste when asking for help. */
export function formatDiagnosticsReport({ tripId = null, results = [], lang = 'th', now = new Date() } = {}) {
  const icon = { ok: '✅', warn: '⚠️', fail: '❌' };
  const head = pick(lang,
    `ผลตรวจสอบระบบ Fuji Planner — ${now.toISOString()}`,
    `Fuji Planner system check — ${now.toISOString()}`);
  const lines = [head, `trip: ${tripId || '-'}`, `ua: ${typeof navigator !== 'undefined' ? navigator.userAgent : '-'}`];
  for (const r of results) {
    lines.push(`${icon[r.status] || '•'} ${r.label}: ${r.detail}${r.fix ? `\n   → ${String(r.fix).replace(/\n/g, '\n   → ')}` : ''}`);
  }
  return lines.join('\n');
}
