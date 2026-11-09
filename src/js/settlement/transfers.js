// “จ่ายแล้ว” transfer records. Kept apart from the settlement page's data loading
// so trips/index.js can delete guarded records without an import cycle through
// members → trips.
import { db, serverTimestamp } from '../firebase.js';
import { collection, doc, getDocFromServer, getDocsFromServer, runTransaction } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { expensesInThb } from '../utils/currency.js';
import { settleByBill } from '../utils/settlement.js';

// A versioned guard serializes payment and undo operations. The balance is read
// from the server after the guard; a changed guard aborts instead of retrying a
// calculation based on an old snapshot. Transactions require connectivity.
export async function recordTransfer(tripId, { fromId, toId, amountMinor, date = '', note = '' }, userId = null) {
  const amount = Math.round(Number(amountMinor));
  if (!fromId || !toId || fromId === toId) throw new Error('Choose two different people');
  if (!Number.isSafeInteger(amount) || !(amount > 0)) throw new Error('Amount must be more than zero');
  const guard = doc(db, `trips/${tripId}/settlements/_transferGuard`);
  const ref = doc(collection(db, `trips/${tripId}/transfers`));
  const before = await getDocFromServer(guard);
  const version = before.exists() ? before.data().version : 0;
  if (!Number.isSafeInteger(version) || version < 0) throw new Error('Invalid settlement version');
  let tripSnap, expenseSnap, transferSnap;
  try {
    [tripSnap, expenseSnap, transferSnap] = await Promise.all([
      getDocFromServer(doc(db, `trips/${tripId}`)),
      getDocsFromServer(collection(db, `trips/${tripId}/expenses`)),
      getDocsFromServer(collection(db, `trips/${tripId}/transfers`))
    ]);
  } catch (err) {
    // Offline, or the deployed rules do not allow server-only reads: refuse the
    // payment instead of checking it against the local cache.
    if (err?.code === 'unavailable' || /offline|network/i.test(err?.message || '')) {
      throw new Error('ต้องเชื่อมต่ออินเทอร์เน็ตเพื่อบันทึกการโอน / Stay online to record a transfer');
    }
    throw err;
  }
  if (!tripSnap.exists()) throw new Error('Trip not found');
  const expenses = expenseSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(e => e.status !== 'voided');
  const transfers = transferSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const remaining = settleByBill(expensesInThb(expenses, tripSnap.data()), transfers)
    .find(t => t.from === fromId && t.to === toId)?.amountMinor || 0;
  if (amount > remaining) throw new Error('ยอดค้างเปลี่ยนแล้ว กรุณาคำนวณใหม่ / Balance changed; please recalculate');
  await runTransaction(db, async tx => {
    const current = await tx.get(guard);
    if ((current.exists() ? current.data().version : 0) !== version)
      throw new Error('มีการเปลี่ยนแปลงการโอน กรุณาคำนวณใหม่ / Transfers changed; please recalculate');
    tx.set(ref, { fromId, toId, amountMinor: amount, currency: 'THB', date: String(date || '').slice(0, 10),
      note: String(note || '').trim().slice(0, 120), createdBy: userId || null, createdAt: serverTimestamp() });
    tx.set(guard, { version: version + 1, transferId: ref.id, operation: 'create' });
  });
  return ref.id;
}

export async function deleteTransfer(tripId, transferId) {
  const guard = doc(db, `trips/${tripId}/settlements/_transferGuard`);
  const ref = doc(db, `trips/${tripId}/transfers/${transferId}`);
  await runTransaction(db, async tx => {
    const [current, transfer] = await Promise.all([tx.get(guard), tx.get(ref)]);
    if (!transfer.exists()) throw new Error('Transfer already removed');
    const version = current.exists() ? current.data().version : 0;
    if (!Number.isSafeInteger(version) || version < 0) throw new Error('Invalid settlement version');
    tx.delete(ref);
    tx.set(guard, { version: version + 1, transferId, operation: 'delete' });
  });
}
