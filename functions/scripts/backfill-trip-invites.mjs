import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { isValidInviteCode, normalizeInviteCode } from '../../src/js/utils/invite.js';

const projectId = process.env.GOOGLE_CLOUD_PROJECT
  || process.env.GCLOUD_PROJECT
  || process.env.FIREBASE_PROJECT_ID;
const appOptions = { credential: applicationDefault() };
if (projectId) appOptions.projectId = projectId;
initializeApp(appOptions);

const db = getFirestore();
const trips = await db.collection('trips').get();
const invitePreviews = [];
const owners = new Map();

for (const tripDoc of trips.docs) {
  const trip = tripDoc.data();
  const code = normalizeInviteCode(trip.inviteCode);
  if (!isValidInviteCode(code) || trip.inviteEnabled === false) continue;
  const previous = owners.get(code);
  if (previous && previous !== tripDoc.id) {
    throw new Error(`Invite-code collision ${code}: trips ${previous} and ${tripDoc.id}`);
  }
  owners.set(code, tripDoc.id);
  invitePreviews.push({
    tripDoc,
    code,
    preview: {
      tripId: tripDoc.id,
      name: String(trip.name || ''),
      startDate: String(trip.startDate || ''),
      endDate: String(trip.endDate || '')
    }
  });
}

// Read stale candidates before writes, but keep current previews available until
// every enabled trip has been normalized and its replacement preview is written.
const existing = await db.collection('publicTripInvites').get();
const activeCodes = new Set(invitePreviews.map(({ code }) => code));

// Keep a trip's code normalization and preview write in the same batch. Chunk
// by trips (two writes each at most) so a boundary cannot split that pair.
for (let i = 0; i < invitePreviews.length; i += 200) {
  const batch = db.batch();
  for (const { tripDoc, code, preview } of invitePreviews.slice(i, i + 200)) {
    const trip = tripDoc.data();
    const originalCode = String(trip.inviteCode || '');
    if (originalCode !== code || trip.inviteEnabled !== true) {
      batch.update(tripDoc.ref, {
        inviteCode: code,
        inviteEnabled: true,
        updatedAt: FieldValue.serverTimestamp()
      });
    }
    batch.set(db.doc(`publicTripInvites/${code}`), preview);
  }
  await batch.commit();
}

// Remove disabled/deleted/stale code previews only after all active previews are live.
const staleDocs = existing.docs.filter((inviteDoc) => !activeCodes.has(inviteDoc.id));
for (let i = 0; i < staleDocs.length; i += 400) {
  const batch = db.batch();
  staleDocs.slice(i, i + 400).forEach((inviteDoc) => batch.delete(inviteDoc.ref));
  await batch.commit();
}

console.log(`Backfilled ${invitePreviews.length} safe invite previews in project ${projectId || '(Application Default project)'}.`);
