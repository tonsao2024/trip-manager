import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { LIMITS, SkipNote } from './sender.mjs';

export function firestoreStore(db) {
  const queue = () => db.collectionGroup('notifications').where('pushDelivery.state', '==', 'pending');
  const itemOf = snap => ({ path: snap.ref.path, data: snap.data(), version: snap.updateTime });
  async function claim(item, delivery) {
    return db.runTransaction(async tx => {
      const ref = db.doc(item.path);
      const current = await tx.get(ref);
      if (!current.exists || current.get('pushDelivery.state') !== 'pending'
          || !current.updateTime.isEqual(item.version)) return false;
      tx.update(ref, { pushDelivery: { ...delivery, updatedAt: FieldValue.serverTimestamp() } });
      return true;
    });
  }
  return {
    async pending(since, now, max) {
      const result = await queue().where('createdAt', '>=', Timestamp.fromMillis(since))
        .where('createdAt', '<=', Timestamp.fromMillis(now)).orderBy('createdAt', 'asc').limit(max).get();
      return result.docs.map(itemOf);
    },
    async expire(before, max) {
      const result = await queue().where('createdAt', '<', Timestamp.fromMillis(before)).orderBy('createdAt', 'asc').limit(max).get();
      let count = 0;
      for (const snap of result.docs) {
        if (await claim(itemOf(snap), { state: 'expired', reason: 'older-than-24-hours' })) count++;
      }
      return count;
    },
    async trip(id) { const doc = await db.doc(`trips/${id}`).get(); return doc.exists ? doc.data() : null; },
    async members(id) {
      const result = await db.collection(`trips/${id}/members`).limit(LIMITS.members + 1).get();
      if (result.size > LIMITS.members) throw new SkipNote('member-limit');
      return result.docs.map(d => ({ id: d.id, data: d.data() }));
    },
    async prefs(uid) { const d = await db.doc(`users/${uid}/pushPrefs/current`).get(); return d.exists ? d.data() : null; },
    async tokens(uid) {
      const result = await db.collection(`users/${uid}/pushTokens`).limit(LIMITS.devices + 1).get();
      if (result.size > LIMITS.devices) throw new SkipNote('device-limit');
      return result.docs.map(d => ({ path: d.ref.path, data: d.data() }));
    },
    claim,
    async finish(path, data) {
      await db.runTransaction(async tx => {
        const ref = db.doc(path);
        const current = await tx.get(ref);
        // Do not overwrite a receipt/new queue entry changed by another admin.
        if (!current.exists || current.get('pushDelivery.state') !== 'claimed'
            || current.get('pushDelivery.runId') !== data.runId) throw new Error('Delivery claim changed');
        tx.update(ref, { pushDelivery: { ...data, updatedAt: FieldValue.serverTimestamp() } });
      });
    },
    async removeToken(path) { await db.doc(path).delete(); }
  };
}
