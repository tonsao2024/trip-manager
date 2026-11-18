import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from '@firebase/rules-unit-testing';
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch
} from 'firebase/firestore';

const projectId = 'demo-trip-manager-rules';
const tripId = 'trip-a';
const adminUid = 'admin-a';
const memberUid = 'member-a';
const coadminUid = 'coadmin-a';
const viewerUid = 'viewer-a';
const limitedUid = 'limited-a';
const visitorUid = 'visitor-a';
const inactiveUid = 'inactive-a';
const legacySecretUid = 'legacy-secret-a';
const legacyPinMemberUid = 'legacy-pin-member';
const inviteCode = 'ABC123';
const rulesPath = path.resolve(import.meta.dirname, '../../firestore.rules');
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
let testEnv;

if (!emulatorHost) {
  throw new Error('Firestore emulator is not running. Use: firebase emulators:exec --project demo-trip-manager-rules --only firestore "npm run test:rules"');
}

describe('Firestore security rules', () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId,
      firestore: { rules: fs.readFileSync(rulesPath, 'utf8') }
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await Promise.all([
        setDoc(doc(db, 'users', adminUid), { uid: adminUid, role: 'member' }),
        setDoc(doc(db, 'users', memberUid), { uid: memberUid, role: 'member' }),
        setDoc(doc(db, 'users', coadminUid), { uid: coadminUid, role: 'member' }),
        setDoc(doc(db, 'users', viewerUid), { uid: viewerUid, role: 'member' }),
        setDoc(doc(db, 'users', limitedUid), { uid: limitedUid, role: 'member' }),
        setDoc(doc(db, 'users', inactiveUid), { uid: inactiveUid, role: 'member' }),
        setDoc(doc(db, 'users', 'root-a'), { uid: 'root-a', role: 'super_admin' }),
        setDoc(doc(db, 'users', legacySecretUid), {
          uid: legacySecretUid,
          role: 'member',
          displayName: 'Legacy Secret',
          email: 'legacy-secret@example.com',
          photoURL: null,
          updatedAt: new Date(),
          pinHash: 'legacy-user-pin-hash',
          pinSalt: '00112233445566778899aabbccddeeff'
        }),
        setDoc(doc(db, 'trips', tripId), {
          createdBy: adminUid,
          memberUids: [adminUid, memberUid, coadminUid, viewerUid, limitedUid, inactiveUid],
          name: 'Fuji trip',
          startDate: '2027-04-01',
          endDate: '2027-04-07',
          inviteCode,
          inviteEnabled: true
        }),
        setDoc(doc(db, 'trips', tripId, 'members', adminUid), {
          uid: adminUid,
          role: 'trip_admin',
          status: 'active',
          permissions: { canManageMembers: true }
        }),
        setDoc(doc(db, 'trips', tripId, 'members', memberUid), {
          uid: memberUid,
          role: 'member',
          status: 'active',
          permissions: { canManageMembers: false }
        }),
        setDoc(doc(db, 'trips', tripId, 'members', coadminUid), {
          uid: coadminUid,
          role: 'member',
          status: 'active',
          permissions: { canManageMembers: true }
        }),
        setDoc(doc(db, 'trips', tripId, 'members', viewerUid), {
          uid: viewerUid,
          role: 'viewer',
          status: 'active',
          permissions: { canEditItinerary: false, canEditExpense: false, canManageMembers: false }
        }),
        setDoc(doc(db, 'trips', tripId, 'members', limitedUid), {
          uid: limitedUid,
          role: 'member',
          status: 'active',
          permissions: { canEditItinerary: false, canEditExpense: false, canManageMembers: false }
        }),
        setDoc(doc(db, 'trips', tripId, 'members', inactiveUid), {
          uid: inactiveUid,
          role: 'member',
          status: 'inactive',
          permissions: { canManageMembers: false }
        }),
        setDoc(doc(db, 'trips', tripId, 'members', legacyPinMemberUid), {
          uid: legacyPinMemberUid,
          displayName: 'Legacy PIN member',
          username: 'legacy.pin',
          role: 'member',
          status: 'active',
          loginReady: true,
          pinHash: 'legacy-member-pin-hash',
          pinSalt: '00112233445566778899aabbccddeeff'
        }),
        setDoc(doc(db, 'publicTripInvites', inviteCode), {
          tripId,
          name: 'Fuji trip',
          startDate: '2027-04-01',
          endDate: '2027-04-07'
        }),
        setDoc(doc(db, 'publicProfiles', adminUid), {
          uid: adminUid,
          displayName: 'Trip Admin',
          email: 'admin@example.com',
          photoURL: null,
          updatedAt: new Date()
        }),
        setDoc(doc(db, 'publicProfiles', memberUid), {
          uid: memberUid,
          displayName: 'Trip Member',
          email: 'member@example.com',
          photoURL: null,
          updatedAt: new Date()
        }),
        setDoc(doc(db, 'memberSecrets', `${tripId}_${memberUid}`), {
          tripId,
          memberId: memberUid,
          pinHash: 'private-hash'
        }),
        setDoc(doc(db, 'userSecrets', legacySecretUid), {
          pinHash: 'legacy-user-pin-hash',
          pinSalt: '00112233445566778899aabbccddeeff'
        }),
        setDoc(doc(db, 'loginAccounts', 'member.login'), {
          tripId,
          memberUid,
          pinHash: 'private-hash'
        }),
        setDoc(doc(db, 'publicMemberLogins', 'member.login'), {
          tripId,
          memberId: memberUid
        })
      ]);
    });
  });

  after(async () => {
    await testEnv?.cleanup();
  });

  const dbFor = (uid, claims = {}) => testEnv.authenticatedContext(uid, claims).firestore();

  it('keeps member PIN hashes and username indexes server-only', async () => {
    const db = dbFor(visitorUid);
    for (const ref of [
      doc(db, 'memberSecrets', `${tripId}_${memberUid}`),
      doc(db, 'userSecrets', legacySecretUid),
      doc(db, 'loginAccounts', 'member.login'),
      doc(db, 'publicMemberLogins', 'member.login')
    ]) {
      await assertFails(getDoc(ref));
      await assertFails(setDoc(ref, { pinHash: 'attacker-write' }));
      await assertFails(deleteDoc(ref));
    }
    await assertFails(getDocs(collection(db, 'memberSecrets')));
    await assertFails(getDocs(collection(db, 'userSecrets')));
    await assertFails(getDocs(collection(db, 'loginAccounts')));
    await assertFails(getDocs(collection(db, 'publicMemberLogins')));

    await assertSucceeds(getDoc(doc(dbFor(memberUid), 'users', memberUid)));
    await assertFails(getDoc(doc(dbFor(legacySecretUid), 'users', legacySecretUid)));
    await assertFails(getDoc(doc(dbFor(adminUid), 'trips', tripId, 'members', legacyPinMemberUid)));
    await assertFails(updateDoc(doc(dbFor(adminUid), 'trips', tripId, 'members', memberUid), {
      pinHash: 'client-write'
    }));
    await assertFails(setDoc(doc(dbFor(adminUid), 'trips', tripId, 'members', 'new-pin-member'), {
      uid: 'new-pin-member',
      displayName: 'New member',
      role: 'member',
      status: 'active',
      pinHash: 'client-write'
    }));
  });

  it('allows a known invite preview but never exposes or lists trips by invite code', async () => {
    const db = dbFor(visitorUid);
    const preview = await assertSucceeds(getDoc(doc(db, 'publicTripInvites', inviteCode)));
    assert.deepEqual(Object.keys(preview.data()).sort(), ['endDate', 'name', 'startDate', 'tripId']);
    assert.equal(preview.data().tripId, tripId);

    await assertFails(getDoc(doc(db, 'trips', tripId)));
    await assertFails(getDocs(query(
      collection(db, 'trips'),
      where('inviteCode', '==', inviteCode),
      limit(1)
    )));
    await assertFails(getDocs(collection(db, 'publicTripInvites')));
    await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'publicTripInvites', inviteCode)));

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'trips', tripId), { inviteEnabled: false });
    });
    await assertFails(getDoc(doc(db, 'publicTripInvites', inviteCode)));
  });

  it('lets a trip admin atomically maintain only a matching minimal invite preview', async () => {
    const db = dbFor(adminUid);
    const batch = writeBatch(db);
    batch.update(doc(db, 'trips', tripId), {
      name: 'Fuji trip updated',
      startDate: '2027-04-02',
      endDate: '2027-04-08'
    });
    batch.set(doc(db, 'publicTripInvites', inviteCode), {
      tripId,
      name: 'Fuji trip updated',
      startDate: '2027-04-02',
      endDate: '2027-04-08'
    });
    await assertSucceeds(batch.commit());

    await assertFails(setDoc(doc(db, 'publicTripInvites', inviteCode), {
      tripId,
      name: 'Unrelated private title',
      startDate: '2027-04-02',
      endDate: '2027-04-08',
      ownerEmail: 'secret@example.com'
    }));

    const rotate = writeBatch(db);
    rotate.update(doc(db, 'trips', tripId), { inviteCode: 'DEF234' });
    rotate.set(doc(db, 'publicTripInvites', 'DEF234'), {
      tripId,
      name: 'Fuji trip updated',
      startDate: '2027-04-02',
      endDate: '2027-04-08'
    });
    rotate.delete(doc(db, 'publicTripInvites', inviteCode));
    await assertSucceeds(rotate.commit());

    const memberDb = dbFor(memberUid);
    await assertFails(updateDoc(doc(memberDb, 'publicTripInvites', 'DEF234'), { name: 'Forged preview' }));
    await assertFails(setDoc(doc(memberDb, 'publicTripInvites', 'XYZ789'), {
      tripId,
      name: 'Fuji trip updated',
      startDate: '2027-04-02',
      endDate: '2027-04-08'
    }));
  });

  it('makes public profiles owner-readable, non-listable, and schema constrained', async () => {
    const ownerDb = dbFor(adminUid, { email: 'admin@example.com' });
    const visitorDb = dbFor(visitorUid, { email: 'visitor@example.com' });
    await assertSucceeds(getDoc(doc(ownerDb, 'publicProfiles', adminUid)));
    await assertFails(getDoc(doc(visitorDb, 'publicProfiles', adminUid)));
    await assertFails(getDocs(collection(visitorDb, 'publicProfiles')));

    await assertSucceeds(setDoc(doc(ownerDb, 'publicProfiles', adminUid), {
      uid: adminUid,
      displayName: 'Admin Updated',
      email: 'admin@example.com',
      photoURL: null,
      updatedAt: serverTimestamp()
    }, { merge: true }));
    await assertFails(setDoc(doc(ownerDb, 'publicProfiles', adminUid), {
      uid: adminUid,
      displayName: 'Admin Updated',
      email: 'admin@example.com',
      photoURL: null,
      pinHash: 'not-public',
      updatedAt: serverTimestamp()
    }, { merge: true }));
  });

  it('prevents a user from granting their own super-admin role or writing PIN material', async () => {
    const uid = 'new-user';
    const db = dbFor(uid, { email: 'new-user@example.com' });
    const profile = {
      uid,
      displayName: 'New User',
      email: 'new-user@example.com',
      photoURL: null,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      role: 'member'
    };
    await assertSucceeds(setDoc(doc(db, 'users', uid), profile));
    await assertFails(updateDoc(doc(db, 'users', uid), {
      role: 'super_admin',
      updatedAt: serverTimestamp()
    }));
    await assertFails(updateDoc(doc(db, 'users', uid), {
      pinHash: 'not-allowed',
      updatedAt: serverTimestamp()
    }));

    const superAdminDb = dbFor('root-a');
    await assertFails(updateDoc(doc(superAdminDb, 'users', adminUid), {
      pinHash: 'not-allowed',
      updatedAt: serverTimestamp()
    }));
    await assertFails(updateDoc(doc(superAdminDb, 'users', adminUid), {
      stepUpExpiry: 'not-allowed',
      updatedAt: serverTimestamp()
    }));
  });

  it('shares the dashboard with all trip members but only admins and managers can change it', async () => {
    const tripRef = (uid) => doc(dbFor(uid), 'trips', tripId);
    const layout = ['kpis', 'teams', 'estimate', 'category'];
    await assertSucceeds(updateDoc(tripRef(adminUid), {
      dashboardLayout: layout,
      updatedAt: serverTimestamp()
    }));
    await assertSucceeds(updateDoc(tripRef(coadminUid), {
      dashboardLayout: [...layout].reverse(),
      dashboardHidden: ['weather'],
      updatedAt: serverTimestamp()
    }));
    await assertFails(updateDoc(tripRef(coadminUid), {
      dashboardLayout: [], name: 'Not a dashboard field', updatedAt: serverTimestamp()
    }));

    for (const uid of [memberUid, limitedUid, viewerUid]) {
      const snapshot = await assertSucceeds(getDoc(tripRef(uid)));
      assert.deepEqual(snapshot.data().dashboardLayout, [...layout].reverse());
      assert.deepEqual(snapshot.data().dashboardHidden, ['weather']);
    }
    for (const uid of [memberUid, limitedUid, viewerUid, inactiveUid, visitorUid]) {
      await assertFails(updateDoc(tripRef(uid), { dashboardLayout: [], updatedAt: serverTimestamp() }));
      await assertFails(updateDoc(tripRef(uid), { dashboardHidden: [], updatedAt: serverTimestamp() }));
    }
  });

  it('shares cover framing while restricting delegated writes', async () => {
    const ref = uid => doc(dbFor(uid), 'trips', tripId);
    await assertSucceeds(updateDoc(ref(coadminUid), { coverPosition: { x: 20, y: 80 }, updatedAt: serverTimestamp() }));
    const snapshot = await assertSucceeds(getDoc(ref(memberUid)));
    assert.deepEqual(snapshot.data().coverPosition, { x: 20, y: 80 });
    await assertFails(updateDoc(ref(memberUid), { coverPosition: { x: 50, y: 50 } }));
    await assertFails(updateDoc(ref(coadminUid), { coverPosition: { x: 101, y: 50 } }));
    await assertFails(updateDoc(ref(coadminUid), { coverPosition: { x: 10, y: 50, extra: true } }));
    await assertFails(updateDoc(ref(coadminUid), { coverPosition: { x: 10, y: 50 }, name: 'other' }));
  });

  // v45 (owner: “ภาพหน้าปก ให้สามารถเลือกคริปภาพที่ดึงมาแสดงได้ด้วยสิ”): the crop
  // also stores how close it is (zoom 1–3). The rule must accept a clamped zoom,
  // reject one that would letterbox or blow past the frame, and still accept an
  // older x/y-only write so a client that has not updated keeps working.
  it('accepts a clamped cover zoom and rejects one outside the frame', async () => {
    const ref = uid => doc(dbFor(uid), 'trips', tripId);
    await assertSucceeds(updateDoc(ref(coadminUid), { coverPosition: { x: 40, y: 60, zoom: 2.2 }, updatedAt: serverTimestamp() }));
    const snapshot = await assertSucceeds(getDoc(ref(memberUid)));
    assert.deepEqual(snapshot.data().coverPosition, { x: 40, y: 60, zoom: 2.2 });
    // A legacy x/y-only write is still valid (zoom is optional).
    await assertSucceeds(updateDoc(ref(coadminUid), { coverPosition: { x: 50, y: 50 }, updatedAt: serverTimestamp() }));
    // zoom < 1 would letterbox the cover; zoom > 3 is past what the app writes.
    await assertFails(updateDoc(ref(coadminUid), { coverPosition: { x: 50, y: 50, zoom: 0.5 } }));
    await assertFails(updateDoc(ref(coadminUid), { coverPosition: { x: 50, y: 50, zoom: 4 } }));
    await assertFails(updateDoc(ref(coadminUid), { coverPosition: { x: 50, y: 50, zoom: 'big' } }));
    // A non-manager still cannot write the crop, zoom or not.
    await assertFails(updateDoc(ref(memberUid), { coverPosition: { x: 50, y: 50, zoom: 2 } }));
  });

  it('limits non-admin trip-document writes to their specific capabilities', async () => {
    const memberDb = dbFor(memberUid);
    const tripRef = doc(memberDb, 'trips', tripId);

    await assertSucceeds(updateDoc(tripRef, {
      defaultMapLayer: 'terrain',
      updatedAt: serverTimestamp()
    }));
    await assertSucceeds(updateDoc(tripRef, {
      cards: [{ id: 'card-a', name: 'Trip Visa' }],
      updatedAt: serverTimestamp()
    }));

    await assertFails(updateDoc(tripRef, { name: 'Member changed the trip', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(tripRef, { budgetTotal: 1, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(tripRef, { inviteCode: 'XYZ987', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(tripRef, { createdBy: memberUid, updatedAt: serverTimestamp() }));

    const limitedDb = dbFor(limitedUid);
    await assertFails(updateDoc(doc(limitedDb, 'trips', tripId), {
      defaultMapLayer: 'satellite', updatedAt: serverTimestamp()
    }));
    await assertFails(updateDoc(doc(limitedDb, 'trips', tripId), {
      cards: [], updatedAt: serverTimestamp()
    }));

    const viewerDb = dbFor(viewerUid);
    await assertFails(updateDoc(doc(viewerDb, 'trips', tripId), {
      cards: [], updatedAt: serverTimestamp()
    }));

    const adminDb = dbFor(adminUid);
    await assertSucceeds(updateDoc(doc(adminDb, 'trips', tripId), {
      name: 'Admin changed the trip', budgetTotal: 1000, updatedAt: serverTimestamp()
    }));
    await assertFails(updateDoc(doc(adminDb, 'trips', tripId), {
      createdBy: memberUid, updatedAt: serverTimestamp()
    }));
  });

  it('denies inactive members even when an old memberUids entry is still present', async () => {
    const db = dbFor(inactiveUid);
    await assertFails(getDoc(doc(db, 'trips', tripId)));
    await assertFails(getDoc(doc(db, 'trips', tripId, 'members', memberUid)));
    await assertFails(getDocs(query(
      collection(db, 'trips'),
      where('memberUids', 'array-contains', inactiveUid)
    )));
  });

  it('limits co-admin membership changes and prevents role/permission escalation', async () => {
    const db = dbFor(coadminUid);
    const tripRef = doc(db, 'trips', tripId);
    const elevatedRoleRef = doc(db, 'trips', tripId, 'members', 'coadmin-promote');
    await assertFails(setDoc(elevatedRoleRef, {
      uid: 'coadmin-promote', role: 'trip_admin', status: 'active', permissions: {}
    }));
    await assertFails(setDoc(doc(db, 'trips', tripId, 'members', 'coadmin-delegate'), {
      uid: 'coadmin-delegate', role: 'member', status: 'active',
      permissions: { canManageMembers: true }
    }));

    const newUid = 'coadmin-added-member';
    const memberRef = doc(db, 'trips', tripId, 'members', newUid);
    const add = writeBatch(db);
    add.set(memberRef, {
      uid: newUid, role: 'member', status: 'active',
      permissions: { canEditItinerary: true, canEditExpense: true, canManageMembers: false }
    });
    add.update(tripRef, { memberUids: arrayUnion(newUid), updatedAt: serverTimestamp() });
    await assertSucceeds(add.commit());

    await assertFails(updateDoc(memberRef, { status: 'inactive' }));
    await assertFails(deleteDoc(memberRef));
    await assertFails(updateDoc(tripRef, {
      memberUids: arrayUnion('unpaired-member'), inviteCode: 'ZZZ999'
    }));

    const remove = writeBatch(db);
    remove.delete(memberRef);
    remove.update(tripRef, { memberUids: arrayRemove(newUid), updatedAt: serverTimestamp() });
    await assertSucceeds(remove.commit());
  });

  it('lets users create their own join request and limits queue reads/approval to managers', async () => {
    const memberDb = dbFor(memberUid);
    const outsiderDb = dbFor(visitorUid);
    const adminDb = dbFor(adminUid);
    const requestRef = doc(memberDb, 'trips', tripId, 'joinRequests', memberUid);
    await assertSucceeds(setDoc(requestRef, { uid: memberUid, status: 'pending' }));
    await assertFails(getDocs(collection(memberDb, 'trips', tripId, 'joinRequests')));
    await assertFails(updateDoc(doc(outsiderDb, 'trips', tripId, 'joinRequests', memberUid), { status: 'approved' }));
    await assertSucceeds(updateDoc(doc(adminDb, 'trips', tripId, 'joinRequests', memberUid), { status: 'approved' }));
  });
});
