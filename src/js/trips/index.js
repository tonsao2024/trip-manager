import { db, storage, serverTimestamp } from '../firebase.js';
import { collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, query, where, orderBy, limit } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';
import { compressImage } from '../utils/helpers.js';

const TRIPS_CACHE_KEY = 'fuji_trips_cache';
const CACHE_TTL = 5 * 60 * 1000;

function getCachedTrips() {
  try {
    const cached = localStorage.getItem(TRIPS_CACHE_KEY);
    if (!cached) return null;
    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp > CACHE_TTL) return null;
    return data;
  } catch { return null; }
}

function setCachedTrips(trips) {
  try {
    localStorage.setItem(TRIPS_CACHE_KEY, JSON.stringify({ data: trips, timestamp: Date.now() }));
  } catch {}
}

function clearTripsCache() {
  try { localStorage.removeItem(TRIPS_CACHE_KEY); } catch {}
}

export async function listTrips(userId, isSuperAdmin = false) {
  if (!db) throw new Error('DB not ready - Firebase not configured');
  if (!userId) throw new Error('User not authenticated');
  
  const cached = getCachedTrips();
  
  try {
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout loading trips - check Firestore rules/indexes')), 8000)
    );
    
    let queryPromise;
    if (isSuperAdmin) {
      queryPromise = getDocs(query(collection(db, 'trips'), orderBy('createdAt', 'desc'), limit(30)));
    } else {
      queryPromise = getDocs(query(collection(db, 'trips'), where('memberUids', 'array-contains', userId), limit(30)));
    }
    
    const snap = await Promise.race([queryPromise, timeoutPromise]);
    const trips = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    setCachedTrips(trips);
    return trips;
  } catch (e) {
    console.warn('listTrips primary failed:', e.message, e.code);
    if (cached && cached.length) {
      console.log('Returning cached trips');
      return cached;
    }
    try {
      const fallback = await getDocs(query(collection(db, 'trips'), where('createdBy', '==', userId), limit(30)));
      const trips = fallback.docs.map(d => ({ id: d.id, ...d.data() }));
      setCachedTrips(trips);
      return trips;
    } catch (fallbackErr) {
      console.error('Fallback also failed:', fallbackErr);
    }
    // Friendly error for permission
    if (e.code === 'permission-denied' || e.message.includes('permission')) {
      throw new Error('❌ ไม่มีสิทธิ์อ่านทริป - ตรวจสอบ Firestore Rules\n' + e.message);
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

export async function uploadCoverImage(tripId, fileOrBlob, userId) {
  if (!storage) throw new Error('Storage not ready - check Firebase Config');
  if (!fileOrBlob) return '';
  
  try {
    let blobToUpload = fileOrBlob;
    // If it's a File, compress it. If it's already a Blob from cropper, use directly
    if (fileOrBlob instanceof File) {
      blobToUpload = await compressImage(fileOrBlob, 1280, 0.85);
    }
    const fileName = `cover_${Date.now()}.webp`;
    const ref = storageRef(storage, `trips/${tripId}/covers/${fileName}`);
    await uploadBytes(ref, blobToUpload);
    const url = await getDownloadURL(ref);
    return url;
  } catch (e) {
    console.error('Upload cover failed:', e);
    if (e.code === 'storage/unauthorized' || e.message.includes('permission')) {
      throw new Error('❌ ไม่มีสิทธิ์อัปโหลดรูป - ตรวจสอบ Storage Rules\n' + e.message);
    }
    throw new Error('Upload cover failed: ' + e.message);
  }
}

export async function createTrip(data, userId) {
  if (!db) throw new Error('DB not ready - Firebase not configured');
  if (!userId) throw new Error('User not authenticated - please login again');
  
  if (!data.name || !data.name.trim()) throw new Error('กรุณากรอกชื่อทริป');
  if (!data.startDate || !data.endDate) throw new Error('กรุณาเลือกวันเริ่มและสิ้นสุด');
  
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
    // Create trip doc first
    console.log('[createTrip] Creating trip doc...', payload.name);
    const ref = await addDoc(collection(db, 'trips'), payload);
    console.log('[createTrip] Trip created:', ref.id);
    
    // Add creator as trip admin member - with retry
    try {
      console.log('[createTrip] Creating member doc for', userId);
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
        updatedAt: serverTimestamp(),
        order: 0
      });
      console.log('[createTrip] Member created');
    } catch (memberErr) {
      console.error('[createTrip] Member creation failed:', memberErr);
      // Don't fail whole creation if member fails - user can still be added via rules memberUids check
      if (memberErr.code === 'permission-denied') {
        console.warn('Member creation permission denied - but trip exists, will rely on memberUids');
      } else {
        throw memberErr;
      }
    }
    
    // Upload cover if provided (can be File or cropped Blob)
    if (data.coverFile || data.coverBlob) {
      try {
        console.log('[createTrip] Uploading cover...');
        const fileToUpload = data.coverBlob || data.coverFile;
        const url = await uploadCoverImage(ref.id, fileToUpload, userId);
        console.log('[createTrip] Cover uploaded:', url);
        await updateTrip(ref.id, { coverImage: url });
      } catch (uploadErr) {
        console.warn('Cover upload failed, but trip created:', uploadErr);
        // Don't fail
      }
    }
    
    clearTripsCache();
    return ref.id;
  } catch (e) {
    console.error('createTrip error:', e, e.code);
    if (e.code === 'permission-denied' || e.message.includes('permission')) {
      throw new Error(`❌ ไม่มีสิทธิ์สร้างทริป - ตรวจสอบ Firestore Rules\n\nต้อง deploy rules ใหม่ที่แก้แล้ว:\n- trips allow create if authenticated\n- members allow create if uid == memberId\n\nError: ${e.message}\n\nวิธีแก้:\n1. ไป Firebase Console > Firestore > Rules\n2. วาง rules จากไฟล์ firestore.rules ใหม่\n3. กด Publish\n4. ลองใหม่`);
    }
    if (e.message.includes('Timeout')) {
      throw new Error(`⏳ Timeout สร้างทริป - ตรวจสอบ:\n1. Internet\n2. Firestore Rules (ต้อง allow create)\n3. ลองใหม่\n\n${e.message}`);
    }
    throw e;
  }
}

export async function updateTrip(tripId, updates) {
  if (!db) throw new Error('DB not ready');
  const ref = doc(db, 'trips', tripId);
  await updateDoc(ref, { ...updates, updatedAt: serverTimestamp() });
  clearTripsCache();
}
