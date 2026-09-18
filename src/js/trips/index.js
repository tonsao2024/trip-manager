import { db, serverTimestamp } from '../firebase.js';
import { collection, doc, getDoc, getDocs, addDoc, updateDoc, query, where, orderBy, limit } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { toast } from '../components/toast.js';

export async function listTrips(userId, isSuperAdmin = false) {
  if (!db) throw new Error('DB not ready');
  // For simplicity, list all trips if super admin, else where members contains uid
  // We use collection query with membership check via members subcollection would be complex, so we store memberUids array
  if (isSuperAdmin) {
    const snap = await getDocs(query(collection(db, 'trips'), orderBy('createdAt', 'desc')));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } else {
    const snap = await getDocs(query(collection(db, 'trips'), where('memberUids', 'array-contains', userId)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
}

export async function getTrip(tripId) {
  const ref = doc(db, 'trips', tripId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Trip not found');
  return { id: snap.id, ...snap.data() };
}

export async function createTrip(data, userId) {
  const payload = {
    name: data.name,
    description: data.description || '',
    country: data.country || '',
    city: data.city || '',
    startDate: data.startDate,
    endDate: data.endDate,
    timezone: data.timezone || 'Asia/Bangkok',
    baseCurrency: data.baseCurrency || 'THB',
    coverImage: data.coverImage || '',
    themeColor: data.themeColor || '#6366f1',
    status: 'draft',
    memberUids: [userId],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: userId
  };
  const ref = await addDoc(collection(db, 'trips'), payload);
  // Add creator as trip admin member
  await addDoc(collection(db, `trips/${ref.id}/members`), {
    uid: userId,
    displayName: data.creatorName || 'Admin',
    role: 'trip_admin',
    status: 'active',
    color: '#6366f1',
    permissions: { canEditItinerary: true, canEditExpense: true, canManageMembers: true },
    createdAt: serverTimestamp()
  });
  return ref.id;
}

export async function updateTrip(tripId, updates) {
  const ref = doc(db, 'trips', tripId);
  await updateDoc(ref, { ...updates, updatedAt: serverTimestamp() });
}
