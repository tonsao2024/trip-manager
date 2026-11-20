// Access diagnostics use the current Firebase session. Never sign in as the
// target member or use a test write against real itinerary/expense data.
import { auth, db, serverTimestamp } from '../firebase.js';
import {
  arrayUnion, collection, doc, getDocFromServer, getDocsFromServer, limit, query, runTransaction
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { isAdminRole, withCapabilities } from '../utils/capabilities.js';
import { isClosedMemberStatus } from '../utils/membershipRepair.js';
import { isPermissionError } from '../utils/rulesHelper.js';

export function isAccountMember(member) {
  return member?.authType === 'account' || Boolean(member?.authUid);
}

function connectionState(trip, member, memberId) {
  if (!member) return 'missing';
  if (!isAccountMember(member)) return 'not-account';
  if (isClosedMemberStatus(member.status)) return 'closed';
  // Rules resolve role and permissions from members/{auth.uid}. Do not add a
  // legacy alias that would grant access without that permission document.
  if ((member.authUid || member.uid) !== memberId || (member.uid && member.uid !== memberId)) return 'mismatch';
  return Array.isArray(trip.memberUids) && trip.memberUids.includes(memberId) ? 'linked' : 'unlisted';
}

function configuredPermissions(trip, member, uid, siteAdmin = false) {
  if (!member && !siteAdmin && trip.createdBy !== uid) return null;
  if (isClosedMemberStatus(member?.status)) return null;
  const role = siteAdmin ? 'super_admin' : trip.createdBy === uid ? 'trip_admin' : member?.role || 'member';
  return withCapabilities({ role, isAdmin: isAdminRole(role), permissions: member?.permissions });
}

export async function inspectMemberAccess(tripId, memberId) {
  const tripRef = doc(db, 'trips', tripId);
  const [trip, member] = await Promise.all([
    getDocFromServer(tripRef), getDocFromServer(doc(db, 'trips', tripId, 'members', memberId))
  ]);
  if (!trip.exists()) throw new Error('Trip not found');
  const state = connectionState(trip.data(), member.data(), memberId);
  return {
    state,
    permissions: ['linked', 'unlisted'].includes(state) ? configuredPermissions(trip.data(), member.data(), memberId) : null
  };
}

/** Restore exactly one already-approved uid, without changing the member row. */
export async function reconnectMemberAccess(tripId, memberId) {
  const tripRef = doc(db, 'trips', tripId);
  const memberRef = doc(db, 'trips', tripId, 'members', memberId);
  return runTransaction(db, async (tx) => {
    const [trip, member] = await Promise.all([tx.get(tripRef), tx.get(memberRef)]);
    if (!trip.exists()) throw new Error('Trip not found');
    const state = connectionState(trip.data(), member.data(), memberId);
    if (state !== 'unlisted') return state;
    tx.update(tripRef, { memberUids: arrayUnion(memberId), updatedAt: serverTimestamp() });
    return 'restored';
  });
}

async function probe(read) {
  try { return { state: 'ok', value: await read() }; }
  catch (e) { return { state: isPermissionError(e) ? 'denied' : 'error' }; }
}

/** Read from the server as the actual signed-in user; write flags are estimates. */
export async function testMyMemberAccess(tripId) {
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error('Sign in required');
  const tripRef = doc(db, 'trips', tripId);
  const readSet = (name) => probe(() => getDocsFromServer(query(collection(db, 'trips', tripId, name), limit(1))));
  const [trip, member, profile, itinerary, expenses, requests] = await Promise.all([
    probe(() => getDocFromServer(tripRef)),
    probe(() => getDocFromServer(doc(db, 'trips', tripId, 'members', uid))),
    probe(() => getDocFromServer(doc(db, 'users', uid))),
    readSet('itineraryItems'), readSet('expenses'), readSet('joinRequests')
  ]);
  if (auth.currentUser?.uid !== uid) throw new Error('Account changed during the test');
  const tripData = trip.value?.data();
  const memberData = member.value?.data();
  return {
    trip: trip.state === 'ok' && !tripData ? 'missing' : trip.state,
    itinerary: itinerary.state,
    expenses: expenses.state,
    requests: requests.state,
    listed: tripData ? (Array.isArray(tripData.memberUids) && tripData.memberUids.includes(uid)) : null,
    permissions: tripData ? configuredPermissions(tripData, memberData, uid, profile.value?.data()?.role === 'super_admin') : null
  };
}
