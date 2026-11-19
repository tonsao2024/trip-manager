/**
 * Admin-side one-tap membership sweep — "กวาดสถานะค้าง / เชื่อมต่อสมาชิกใหม่".
 *
 * The automatic repair on the Members page (reconcileTripMemberUids) only fixes
 * one direction of the drift and runs once, silently, when the page opens. This
 * module is the explicit, repeatable sweep the owner asked for: it reads fresh
 * server copies of the trip, member documents and join-request queue, then
 * fixes all of the stale states that make "admin sees a member / member sees no
 * trip / somebody is still waiting for approval / admin sees no request" happen
 * at the same time:
 *
 *   1. active member whose uid is missing from `memberUids` → add it
 *   2. uid of a member document explicitly marked inactive/disabled → remove it
 *      (never removes an unmatched uid: legacy PIN logins still need it)
 *   3. member document stuck with `status: 'pending'` → `status: 'active'`
 *   4. a join request from somebody who is ALREADY a member → `approved`
 *      tombstone (keeps history, removes it from the actionable queue, and tells
 *      the member-side syncMyJoinRequests to drop its stale mirror)
 *   5. a request with an unknown/empty status → `pending` so Approve appears
 *
 * It never deletes a member, never changes roles/permissions, and never
 * approves a request for somebody who is not a member yet. Everything is
 * idempotent: pressing the button twice changes nothing the second time.
 * See docs/MEMBERSHIP-REPAIR-2026-11-19.md.
 */
import { db, serverTimestamp } from '../firebase.js';
import {
  collection, doc, getDocFromServer, getDocsFromServer, setDoc, updateDoc, arrayRemove
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { reconcileTripMemberUids } from '../trips/index.js';
import {
  planMembershipRepair, isStuckMemberStatus, JOIN_APPROVED, JOIN_PENDING
} from '../utils/membershipRepair.js';
import { isPermissionError } from '../utils/rulesHelper.js';
import { cacheForget } from '../utils/datacache.js';

const errorInfo = (e) => ({
  message: e?.message || String(e),
  code: e?.code || null,
  permission: isPermissionError(e)
});

/** Fresh server reads only — a stale cache must never drive an access repair. */
export async function inspectTripMembership(tripId) {
  if (!db || !tripId) throw new Error('DB not ready');
  const tripRef = doc(db, 'trips', tripId);
  const tripSnap = await getDocFromServer(tripRef);
  if (!tripSnap.exists()) throw new Error('ไม่พบทริปที่ต้องการกวาดสถานะ');
  const memberSnap = await getDocsFromServer(collection(db, 'trips', tripId, 'members'));
  const members = memberSnap.docs.map(d => ({ ...d.data(), id: d.id }));

  // The queue lives under its own rules. If it is unreadable (rules not
  // published yet) the rest of the sweep must still be allowed to run.
  let requests = [];
  let requestsUnavailable = false;
  let requestWarning = null;
  try {
    const requestSnap = await getDocsFromServer(collection(db, 'trips', tripId, 'joinRequests'));
    requests = requestSnap.docs.map(d => ({ ...d.data(), id: d.id }));
  } catch (e) {
    requestsUnavailable = true;
    requestWarning = errorInfo(e);
  }
  return {
    trip: { id: tripId, ...tripSnap.data() },
    members,
    requests,
    requestsUnavailable,
    requestWarning
  };
}

export async function repairTripMembership(tripId) {
  const snapshot = await inspectTripMembership(tripId);
  const plan = planMembershipRepair(snapshot);
  const report = {
    added: [],
    pruned: [],
    activated: [],
    resolvedRequests: [],
    normalizedRequests: [],
    warnings: [],
    requestsUnavailable: snapshot.requestsUnavailable,
    permissionDenied: false,
    inspected: { members: snapshot.members.length, requests: snapshot.requests.length }
  };
  if (snapshot.requestWarning) report.warnings.push({ step: 'joinRequests', ...snapshot.requestWarning });

  const noteWarning = (step, e) => {
    const info = { step, ...errorInfo(e) };
    if (info.permission) report.permissionDenied = true;
    report.warnings.push(info);
  };

  // 1 + 2 — pair the membership array with the real member documents.
  // reconcileTripMemberUids re-reads every candidate inside a transaction, so
  // a concurrent removal/deactivation cannot be resurrected by this sweep.
  try {
    report.added = await reconcileTripMemberUids(tripId, snapshot.members) || [];
  } catch (e) {
    noteWarning('memberUids', e);
  }
  if (plan.stale.length) {
    try {
      await updateDoc(doc(db, 'trips', tripId), {
        memberUids: arrayRemove(...plan.stale),
        updatedAt: serverTimestamp()
      });
      report.pruned = plan.stale;
    } catch (e) {
      noteWarning('staleUids', e);
    }
  }

  // 3 — 'pending' is a REQUEST status, never a member status. A member document
  // in the admin's list is already a member; normalise it instead of leaving a
  // row that looks "รออนุมัติ" forever. Co-admins are intentionally blocked by
  // sameRoleAndPermissions(): report that clearly rather than failing the sweep.
  for (const member of snapshot.members) {
    if (!member?.id || !isStuckMemberStatus(member.status)) continue;
    try {
      await updateDoc(doc(db, 'trips', tripId, 'members', member.id), {
        status: 'active',
        statusRepairedFrom: member.status,
        updatedAt: serverTimestamp()
      });
      report.activated.push(member.id);
    } catch (e) {
      noteWarning(`member:${member.id}`, e);
    }
  }

  // 4 + 5 — make the queue describe reality. Both writes are updates of rows
  // that were just read from the server; `setDoc(merge)` keeps the profile data.
  if (!snapshot.requestsUnavailable) {
    for (const { uid } of plan.resolveRequests) {
      try {
        await setDoc(doc(db, 'trips', tripId, 'joinRequests', uid), {
          status: JOIN_APPROVED,
          resolvedBy: 'membership-repair',
          resolvedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }, { merge: true });
        report.resolvedRequests.push(uid);
      } catch (e) {
        noteWarning(`request:${uid}`, e);
      }
    }
    for (const { uid, status } of plan.normalizeRequests) {
      try {
        await setDoc(doc(db, 'trips', tripId, 'joinRequests', uid), {
          status: JOIN_PENDING,
          statusRepairedFrom: status || null,
          updatedAt: serverTimestamp()
        }, { merge: true });
        report.normalizedRequests.push(uid);
      } catch (e) {
        noteWarning(`request:${uid}`, e);
      }
    }
  }

  // The admin's on-screen lists are cached locally; force a fresh repaint.
  cacheForget(`joins:${tripId}`);
  cacheForget(`members:${tripId}`);
  return report;
}
