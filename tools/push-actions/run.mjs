import { appendFileSync } from 'node:fs';
import { initializeApp, cert, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { firestoreStore } from './firebase.mjs';
import { dispatch } from './sender.mjs';

// Dedicated Actions secret, never a browser token or a checked-in key file.
let app;
try {
  const raw = process.env.FIREBASE_PUSH_SERVICE_ACCOUNT;
  if (!raw) throw new Error('Missing FIREBASE_PUSH_SERVICE_ACCOUNT');
  const account = JSON.parse(raw);
  const projectId = process.env.FIREBASE_PROJECT_ID || 'trip-manager-93b22';
  if (account.project_id !== projectId || !account.client_email || !account.private_key) throw new Error('Service account must belong to FIREBASE_PROJECT_ID and contain an email/private key');
  app = initializeApp({ credential: cert(account), projectId });
  const stats = await dispatch({ store: firestoreStore(getFirestore(app)), messaging: getMessaging(app),
    appUrl: process.env.PUSH_APP_URL || 'https://tonsao2024.github.io/trip-manager/',
    runId: `${process.env.GITHUB_RUN_ID || 'manual'}-${process.env.GITHUB_RUN_ATTEMPT || '1'}` });
  // Aggregate counters only: no titles, names, FCM tokens, bearer tokens or keys.
  console.log(JSON.stringify(stats));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `### FCM Push sender\n\n| Result | Count |\n| --- | --- |\n${Object.entries(stats).map(([k, v]) => `| ${k} | ${v} |`).join('\n')}\n\nA green run does not prove OS-level delivery. Check the receiving device.\n`);
  if (stats.errors || stats.failed) process.exitCode = 1;
} catch (error) {
  // SDK messages can contain request metadata. Only expose an allowlisted code.
  const safeCode = String(error.code || '').replace(/[^a-zA-Z0-9_/-]/g, '').slice(0, 80);
  console.error(`Push run failed (${safeCode || 'configuration-or-service-error'}). Check the secret, IAM, FCM API and Firestore queue index; see docs/PUSH-ACTIONS.md.`);
  process.exitCode = 1;
} finally {
  if (app) await deleteApp(app);
}
