import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.GOOGLE_CLOUD_PROJECT
  || process.env.GCLOUD_PROJECT
  || process.env.FIREBASE_PROJECT_ID;
const appOptions = { credential: applicationDefault() };
if (projectId) appOptions.projectId = projectId;
initializeApp(appOptions);

const db = getFirestore();
const userPrivateFields = [
  'pinHash', 'pinSalt', 'pinIterations', 'pinAlgo',
  'lastStepUp', 'lastStepUpAction', 'stepUpExpiry'
];
const memberPinFields = ['pinHash', 'pinSalt', 'pinIterations', 'pinAlgo'];
const migrations = [];
let privateCredentialConflicts = 0;

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

async function queueMove({ sourceRef, sourceData, targetRef, fields, targetMetadata = {} }) {
  const fieldsToDelete = fields.filter((field) => hasOwn(sourceData, field));
  if (!fieldsToDelete.length) return;

  const targetSnap = await targetRef.get();
  const existing = targetSnap.exists ? targetSnap.data() : {};
  const targetData = {};
  const sourceHasHash = Boolean(sourceData.pinHash);
  const targetHasHash = Boolean(existing.pinHash);
  const credentialFields = ['pinHash', 'pinSalt', 'pinIterations', 'pinAlgo'];
  const credentialConflict = sourceHasHash && targetHasHash
    && credentialFields.some((field) => hasOwn(sourceData, field)
      && hasOwn(existing, field) && sourceData[field] !== existing[field]);

  // If a private PIN already exists, keep it authoritative. If the hash matches,
  // fill only missing tuple fields so a legacy PBKDF2 salt/iteration count is not
  // lost; conflicting metadata is reported rather than silently overwriting it.
  if (credentialConflict) privateCredentialConflicts++;
  if (sourceHasHash && !targetHasHash) {
    for (const field of credentialFields) {
      if (hasOwn(sourceData, field)) targetData[field] = sourceData[field];
    }
    Object.assign(targetData, targetMetadata);
  } else if (sourceHasHash && targetHasHash && !credentialConflict) {
    for (const field of credentialFields) {
      if (!hasOwn(existing, field) && hasOwn(sourceData, field)) targetData[field] = sourceData[field];
    }
    if (Object.keys(targetData).length) Object.assign(targetData, targetMetadata);
  }

  // Step-up timestamps are server metadata too; keep them private when moving
  // profile fields out of users/{uid}.
  for (const field of ['lastStepUp', 'lastStepUpAction', 'stepUpExpiry']) {
    if (hasOwn(sourceData, field) && !hasOwn(existing, field)) targetData[field] = sourceData[field];
  }
  if (Object.keys(targetData).length) targetData.updatedAt = FieldValue.serverTimestamp();

  migrations.push({ sourceRef, targetRef, targetData, fieldsToDelete });
}

const users = await db.collection('users').get();
for (const userDoc of users.docs) {
  await queueMove({
    sourceRef: userDoc.ref,
    sourceData: userDoc.data(),
    targetRef: db.doc(`userSecrets/${userDoc.id}`),
    fields: userPrivateFields
  });
}

const trips = await db.collection('trips').get();
for (const tripDoc of trips.docs) {
  const members = await tripDoc.ref.collection('members').get();
  for (const memberDoc of members.docs) {
    await queueMove({
      sourceRef: memberDoc.ref,
      sourceData: memberDoc.data(),
      targetRef: db.doc(`memberSecrets/${tripDoc.id}_${memberDoc.id}`),
      fields: memberPinFields,
      targetMetadata: {
        tripId: tripDoc.id,
        memberId: memberDoc.id,
        ...(memberDoc.data().username ? { username: memberDoc.data().username } : {})
      }
    });
  }
}

for (let i = 0; i < migrations.length; i += 200) {
  const batch = db.batch();
  for (const migration of migrations.slice(i, i + 200)) {
    if (Object.keys(migration.targetData).length) {
      batch.set(migration.targetRef, migration.targetData, { merge: true });
    }
    batch.update(migration.sourceRef, Object.fromEntries(
      migration.fieldsToDelete.map((field) => [field, FieldValue.delete()])
    ));
  }
  await batch.commit();
}

const userCount = migrations.filter((migration) => migration.sourceRef.parent.id === 'users').length;
const memberCount = migrations.length - userCount;
console.log(
  `Migrated private PIN/step-up fields for ${userCount} user profile(s) and ${memberCount} member profile(s) `
  + `in project ${projectId || '(Application Default project)'}. `
  + `${privateCredentialConflicts} existing private credential(s) took precedence.`
);
