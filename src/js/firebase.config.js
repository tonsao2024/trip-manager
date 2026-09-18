// Firebase Config - Hardcoded for GitHub Pages
// วิธีใช้งาน: แทนค่าด้านล่างด้วย config จริงจาก Firebase Console
// แล้ว commit ขึ้น GitHub - ทุกเครื่องจะ login ได้เลย ไม่ต้องกรอกซ้ำ
// 
// 1. ไป https://console.firebase.google.com/
// 2. Project Settings > General > Your apps > Web app > Config
// 3. Copy แล้ววางด้านล่าง
// 4. git add src/js/firebase.config.js && git commit && git push
//
// ถ้าไม่ใส่ config ตรงนี้ ระบบจะลองอ่านจาก localStorage (วิธีเก่า) หรือแสดงหน้า config

// วางใน src/js/firebase.config.js แล้ว push
export const firebaseConfig = {
  "apiKey": "AIzaSyDiJeIRBoE0QBxH8COoCAWQsPS3sH-ljvE\"",
  "authDomain": "rip-manager-93b22.firebaseapp.com",
  "projectId": "trip-manager-93b22",
  "storageBucket": "trip-manager-93b22.firebasestorage.app",
  "messagingSenderId": "022352508207",
  "appId": "1:1022352508207:web:76e1cd0748c30343074dda"
};
export const isConfigHardcoded = true;
