import { db, storage, serverTimestamp } from '../firebase.js';
import { collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, query, where, orderBy, limit } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';
import { compressImage } from '../utils/helpers.js';

export async function listTrips(userId, isSuperAdmin = false) {
  if (!db) throw new Error('DB not ready - Firebase not configured');
  if (!userId) throw new Error('User not authenticated');
  
  try {
    // Add timeout to prevent hanging
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout loading trips - check Firestore rules/indexes')), 10000)
    );
    
    let queryPromise;
    if (isSuperAdmin) {
      queryPromise = getDocs(query(collection(db, 'trips'), orderBy('createdAt', 'desc'), limit(50)));
    } else {
      // Try memberUids query, fallback to getting all and filtering client-side if index missing
      try {
        queryPromise = getDocs(query(collection(db, 'trips'), where('memberUids', 'array-contains', userId), orderBy('createdAt', 'desc'), limit(50)));
      } catch (e) {
        console.warn('MemberUids query failed, trying without order:', e);
        queryPromise = getDocs(query(collection(db, 'trips'), where('memberUids', 'array-contains', userId), limit(50)));
      }
    }
    
    const snap = await Promise.race([queryPromise, timeoutPromise]);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error('listTrips error:', e);
    // If array-contains fails (no index), try to get trips where createdBy == userId as fallback
    if (e.message.includes('index') || e.code === 'failed-precondition') {
      try {
        const fallback = await getDocs(query(collection(db, 'trips'), where('createdBy', '==', userId), limit(50)));
        return fallback.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (fallbackErr) {
        console.error('Fallback also failed:', fallbackErr);
      }
    }
    throw e;
  }
}

export async function getTrip(tripId) {
  if (!db) throw new Error('DB not ready');
  const ref = doc(db, 'trips', tripId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Trip not found');
  return { id: snap.id, ...snap.data() };
}

export async function uploadCoverImage(tripId, file, userId) {
  if (!storage) throw new Error('Storage not ready');
  if (!file) return '';
  
  try {
    // Compress image
    const compressed = await compressImage(file, 1024, 0.8);
    const fileName = `cover_${Date.now()}.webp`;
    const ref = storageRef(storage, `trips/${tripId}/covers/${fileName}`);
    await uploadBytes(ref, compressed);
    const url = await getDownloadURL(ref);
    return url;
  } catch (e) {
    console.error('Upload cover failed:', e);
    throw new Error('Upload cover failed: ' + e.message);
  }
}

export async function createTrip(data, userId) {
  if (!db) throw new Error('DB not ready - Firebase not configured');
  if (!userId) throw new Error('User not authenticated - please login again');
  
  // Validate
  if (!data.name || !data.name.trim()) throw new Error('Trip name required');
  if (!data.startDate || !data.endDate) throw new Error('Start and end date required');
  
  const payload = {
    name: data.name.trim(),
    description: data.description || '',
    country: data.country || '',
    city: data.city || '',
    startDate: data.startDate,
    endDate: data.endDate,
    timezone: data.timezone || 'Asia/Bangkok',
    baseCurrency: data.baseCurrency || 'THB',
    coverImage: data.coverImage || '',
    themeColor: data.themeColor || '#8bb89a',
    status: 'draft',
    memberUids: [userId],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: userId
  };
  
  try {
    // Add timeout
    const timeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout creating trip - check network/Firestore rules')), 15000)
    );
    
    const createPromise = (async () => {
      const ref = await addDoc(collection(db, 'trips'), payload);
      
      // Add creator as trip admin member - use setDoc with uid as id for easier lookup
      const memberRef = doc(db, `trips/${ref.id}/members`, userId);
      await setDoc(memberRef, {
        uid: userId,
        displayName: data.creatorName || 'Admin',
        role: 'trip_admin',
        status: 'active',
        color: payload.themeColor,
        avatar: '🌸',
        permissions: { canEditItinerary: true, canEditExpense: true, canManageMembers: true },
        createdAt: serverTimestamp(),
        order: 0
      });
      
      return ref.id;
    })();
    
    const tripId = await Promise.race([createPromise, timeout]);
    
    // If cover file provided, upload it now
    if (data.coverFile) {
      try {
        const url = await uploadCoverImage(tripId, data.coverFile, userId);
        await updateTrip(tripId, { coverImage: url });
      } catch (uploadErr) {
        console.warn('Cover upload failed, but trip created:', uploadErr);
        // Don't fail whole creation if upload fails
      }
    }
    
    return tripId;
  } catch (e) {
    console.error('createTrip error:', e);
    throw e;
  }
}

export async function updateTrip(tripId, updates) {
  if (!db) throw new Error('DB not ready');
  const ref = doc(db, 'trips', tripId);
  await updateDoc(ref, { ...updates, updatedAt: serverTimestamp() });
}
