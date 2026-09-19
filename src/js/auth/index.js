import { auth, db, functions, isFirebaseConfigured, signInWithEmailAndPassword, signInWithCustomToken, signOut, setPersistence, browserLocalPersistence, browserSessionPersistence, httpsCallable, getAuthErrorMessage } from '../firebase.js';

export async function loginAdmin(email, password, remember = true) {
  if (!isFirebaseConfigured) throw new Error('Firebase not configured — กรุณาตั้งค่า Firebase Config ก่อน (ดูหน้า Config ที่ขึ้นอัตโนมัติ)');
  if (!auth) throw new Error('Auth not initialized - check Firebase Config');
  
  // Validate email
  if (!email || !email.includes('@')) throw new Error('กรุณากรอกอีเมลที่ถูกต้อง');
  if (!password || password.length < 6) throw new Error('รหัสผ่านต้องอย่างน้อย 6 ตัวอักษร');
  
  try {
    // Set persistence with timeout
    const persistencePromise = setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
    const timeoutPersistence = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout setting persistence')), 5000));
    await Promise.race([persistencePromise, timeoutPersistence]);
    
    // Login with timeout
    const loginPromise = signInWithEmailAndPassword(auth, email, password);
    const timeoutLogin = new Promise((_, reject) => setTimeout(() => reject(new Error('auth/network-request-failed - timeout 15s')), 15000));
    const cred = await Promise.race([loginPromise, timeoutLogin]);
    return cred.user;
  } catch (error) {
    console.error('loginAdmin error:', error);
    throw new Error(getAuthErrorMessage(error));
  }
}

export async function loginMember(username, pin, tripId, remember = true) {
  if (!isFirebaseConfigured) throw new Error('Firebase not configured');
  if (!auth || !functions) throw new Error('Auth/Functions not initialized');
  
  if (!username || username.trim().length < 2) throw new Error('กรุณากรอกชื่อผู้ใช้');
  if (!pin || pin.length < 4) throw new Error('PIN ต้องอย่างน้อย 4 ตัว');
  
  try {
    const fn = httpsCallable(functions, 'loginWithUsernamePin');
    const res = await fn({ username: username.trim(), pin, tripId: tripId || null });
    const { token } = res.data;
    if (!token) throw new Error('No token returned from function');
    
    await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
    const cred = await signInWithCustomToken(auth, token);
    return cred.user;
  } catch (error) {
    console.error('loginMember error:', error);
    // Handle function errors
    if (error.code === 'functions/not-found') {
      throw new Error('Cloud Function loginWithUsernamePin ไม่พบ - ต้อง deploy functions ก่อน');
    }
    if (error.message?.includes('PIN') || error.message?.includes('username')) {
      throw new Error(error.message);
    }
    throw new Error(getAuthErrorMessage(error));
  }
}

export async function logout() {
  // Always clear local session state, even if signOut() fails for any reason,
  // so the user is never stuck logged-in in the UI.
  let signOutError = null;
  try {
    if (auth) {
      await Promise.race([
        signOut(auth),
        new Promise((_, reject) => setTimeout(() => reject(new Error('signOut timeout')), 6000))
      ]);
    }
  } catch (e) {
    signOutError = e;
    console.warn('logout error (continuing with local cleanup)', e);
  }
  try {
    localStorage.removeItem('fuji_current_trip');
    localStorage.removeItem('fuji_stepup_until');
    localStorage.removeItem('fuji_trips_cache');
  } catch {}
  if (signOutError) throw signOutError;
}

export async function verifySensitiveAction(pin, action) {
  if (!isFirebaseConfigured) throw new Error('Firebase not configured');
  if (!functions) throw new Error('Functions not ready');
  const fn = httpsCallable(functions, 'verifySensitiveActionPin');
  const res = await fn({ pin, action });
  const { sessionExpiry } = res.data;
  localStorage.setItem('fuji_stepup_until', sessionExpiry);
  return true;
}

export function hasStepUpSession() {
  const until = localStorage.getItem('fuji_stepup_until');
  if (!until) return false;
  return new Date(until) > new Date();
}

export function getCurrentUser() {
  return auth?.currentUser || null;
}

export function requireAuth() {
  return new Promise((resolve, reject) => {
    if (!auth) return reject(new Error('Auth not init'));
    const unsub = auth.onAuthStateChanged(user => {
      unsub();
      if (user) resolve(user);
      else reject(new Error('Not authenticated'));
    });
  });
}

export function verifySensitiveActionPin(pin, action) {
  return verifySensitiveAction(pin, action);
}
