# Deploy Guide

## GitHub Pages

1. Push repo to GitHub.
2. Settings > Pages > Branch: main, Folder: / (root)
3. Wait for Pages to deploy. URL: https://<user>.github.io/<repo>/
4. First visit shows Firebase config screen if no config in localStorage.
5. Open browser console: `localStorage.setItem('fuji_firebase_config', JSON.stringify({apiKey:"...",authDomain:"...",projectId:"...",storageBucket:"...",messagingSenderId:"...",appId:"..."}))` then reload.

No build step. `index.html` + `src/` served directly.

## Firebase

```bash
npm install -g firebase-tools
firebase login
firebase use --add  # select project
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
firebase deploy --only storage
cd functions
npm install
firebase deploy --only functions
```

### Enable APIs
- Firestore, Auth, Storage, Functions, Secret Manager (for step-up secrets if used)

### Create Super Admin
1. Firebase Console > Auth > Add user email/pass
2. Firestore > users/{uid} doc:
```json
{
  "role": "super_admin",
  "displayName": "Super Admin",
  "email": "admin@example.com"
}
```

### Test Rules
```bash
firebase emulators:start --only firestore,auth,storage
# In another terminal
firebase emulators:exec --only firestore "npm run test:rules"
```

## Cloud Functions Env
If using secrets, set via:
```bash
firebase functions:secrets:set STEPUP_SECRET
```
But current implementation uses bcrypt without extra secret.

## Checklist
- [ ] Rules deployed
- [ ] Indexes deployed
- [ ] Functions deployed in asia-southeast1
- [ ] Super admin created
- [ ] GitHub Pages enabled
- [ ] Firebase config set in localStorage on Pages site
