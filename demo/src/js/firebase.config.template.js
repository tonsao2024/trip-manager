// Firebase Config Template
// 1. ไปที่ https://console.firebase.google.com/ สร้างโปรเจกต์
// 2. Project Settings > Your apps > Web app > Copy config
// 3. แทนค่าด้านล่าง หรือเก็บใน localStorage key 'fuji_firebase_config' เป็น JSON string
// 4. อย่า commit config จริงลง Git - ใช้ localStorage สำหรับ GitHub Pages

export const firebaseConfigTemplate = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef"
};

// สำหรับ GitHub Pages: เปิด Console แล้วรัน:
// localStorage.setItem('fuji_firebase_config', JSON.stringify({...}))
// แล้ว reload
