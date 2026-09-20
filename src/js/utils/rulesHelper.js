/**
 * Help for the error that blocks joining a trip before the rules are published:
 * `Missing or insufficient permissions.`
 *
 * The app cannot deploy Firestore rules, but it can say exactly which collections
 * are missing, offer the project's real rules file to copy, and link straight to
 * the console page where it has to be pasted.
 */

const REPO_RULES_URL = 'https://github.com/tonsao2024/trip-manager/blob/main/firestore.rules';
const REPO_RULES_RAW = 'https://raw.githubusercontent.com/tonsao2024/trip-manager/main/firestore.rules';

export function consoleRulesUrl(projectId) {
  return projectId
    ? `https://console.firebase.google.com/project/${projectId}/firestore/rules`
    : 'https://console.firebase.google.com/';
}

export function consoleAuthUrl(projectId) {
  return projectId
    ? `https://console.firebase.google.com/project/${projectId}/authentication/providers`
    : 'https://console.firebase.google.com/';
}

export function isPermissionError(e) {
  const text = `${e?.code || ''} ${e?.message || ''} ${e?.cause?.code || ''} ${e?.cause?.message || ''}`;
  return /permission-denied|insufficient permissions|insufficient_permissions/i.test(text);
}

/**
 * The rules text to paste. The site serves the repository root
 * (`firestore.rules`) on GitHub Pages; Firebase Hosting ignores that file, so
 * fall back to GitHub raw. Returns `null` when neither can be read.
 */
export async function fetchRulesText({ timeoutMs = 6000 } = {}) {
  const urls = [`./firestore.rules`, REPO_RULES_RAW];
  for (const url of urls) {
    try {
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
      const res = await fetch(url, { cache: 'no-store', signal: ctrl?.signal });
      if (timer) clearTimeout(timer);
      if (!res.ok) continue;
      const text = await res.text();
      // Firebase Hosting rewrites unknown paths to index.html — ignore that.
      if (/^\s*rules_version/.test(text) && text.includes('match /databases')) return text;
    } catch {
      // try the next source
    }
  }
  return null;
}

/** Everything the UI needs to explain the fix. */
export function joinPermissionHelp(lang = 'th', { projectId = null, action = 'join' } = {}) {
  const th = String(lang).startsWith('th');
  const what = action === 'approve'
    ? (th ? 'บันทึกการอนุมัติสมาชิก' : 'saving the member approval')
    : (th ? 'บันทึกคำขอเข้าร่วมทริป' : 'saving the join request');
  return {
    title: th ? 'ยังไม่ได้ Publish Firestore Rules' : 'Firestore rules are not published yet',
    message: th
      ? `Firestore ไม่อนุญาตให้${what} เพราะกฎที่ใช้งานอยู่ในโปรเจกต์ยังไม่มีคอลเลกชัน joinRequests / publicProfiles / categories — แก้ได้ใน 1 นาที`
      : `Firestore denied ${what} because the published rules have no joinRequests / publicProfiles / categories collection yet — it takes a minute to fix.`,
    steps: th ? [
      'กดปุ่ม "เปิด Firebase Console" ด้านล่าง (ต้องเป็นบัญชีเจ้าของโปรเจกต์)',
      'ไปที่แท็บ Rules แล้วเลือก "แก้ไข" วางกฎทั้งหมดจากปุ่ม "คัดลอกกฎทั้งหมด" แทนของเดิม',
      'กด Publish แล้วกลับมาที่แอป กดปุ่มเดิมอีกครั้ง (ถ้ายังไม่ได้ให้รีเฟรชหน้าเว็บ)'
    ] : [
      'Tap "Open Firebase Console" below (the project owner account)',
      'Open the Rules tab, paste the text from "Copy all rules" over the existing rules',
      'Press Publish, come back and try again (reload the page if needed)'
    ],
    consoleUrl: consoleRulesUrl(projectId),
    repoUrl: REPO_RULES_URL,
    missing: ['publicProfiles', 'trips/{tripId}/joinRequests', 'users/{uid}/joinRequests', 'trips/{tripId}/categories', 'trips/{tripId}/comments', 'trips/{tripId}/activity']
  };
}

/** Short message the member can forward to the trip admin. */
export function adminHelpMessage(member, trip, lang = 'th') {
  const th = String(lang).startsWith('th');
  return th
    ? `สวัสดีครับ/ค่ะ 🙏 ฉันล็อกอินด้วยบัญชี ${member?.email || member?.displayName || ''} แล้วกรอกรหัสเชิญของทริป "${trip?.name || ''}" แต่ระบบขึ้น "Missing or insufficient permissions" ตอนส่งคำขอเข้าร่วม\nกรุณาเปิด Firebase Console > Firestore Database > Rules > วางไฟล์ firestore.rules ล่าสุด > กด Publish ให้ด้วยครับ (กฎต้องมีคอลเลกชัน joinRequests และ categories)`
    : `Hi! I signed in as ${member?.email || member?.displayName || ''} and entered the invite code for "${trip?.name || ''}", but got "Missing or insufficient permissions" when sending the join request.\nPlease open Firebase Console > Firestore Database > Rules, paste the latest firestore.rules and press Publish (the joinRequests and categories collections must be allowed).`;
}
