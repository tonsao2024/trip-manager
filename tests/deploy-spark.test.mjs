import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const config = JSON.parse(read('firebase.json'));
const workflow = read('.github/workflows/deploy-firebase.yml');

test('default Firebase config only deploys Spark-compatible services', () => {
  assert.deepEqual(Object.keys(config).sort(), ['firestore', 'hosting']);
  assert.ok(config.firestore.rules);
  assert.ok(config.firestore.indexes);
  assert.ok(!config.hosting.rewrites.some(rule => rule.function || rule.run));
  assert.ok(config.hosting.ignore.includes('functions'));
  assert.ok(config.hosting.ignore.includes('tools'));
});

test('Firebase Hosting includes the static app source', () => {
  assert.equal(config.hosting.public, '.');
  assert.ok(!config.hosting.ignore.includes('src'));
  assert.ok(existsSync(new URL('../src/js/firebase.js', import.meta.url)));
});

test('CI deploy explicitly limits targets to Firestore rules and indexes', () => {
  const commands = workflow.split('\n').filter(line => /^\s*firebase deploy\b/.test(line));
  assert.equal(commands.length, 1);
  assert.match(commands[0], /--only firestore:rules,firestore:indexes\s/);
  assert.doesNotMatch(commands[0], /functions|storage|hosting/);
  assert.doesNotMatch(workflow, /working-directory: functions|Cloud Functions Admin/);
  assert.match(workflow, /DEPLOY_OUTCOME: \$\{\{ steps\.deploy\.outcome \}\}/);
});


test('Pages uploads only browser assets and never needs a sender credential/URL', () => {
  const pages = read('.github/workflows/deploy-pages.yml');
  assert.match(pages, /path: \$\{\{ runner\.temp \}\}\/trip-site/);
  assert.doesNotMatch(pages, /FIREBASE_PUSH_SERVICE_ACCOUNT|PUSH_WORKER_URL|GOOGLE_PRIVATE_KEY/);
  assert.doesNotMatch(read('index.html'), /push-worker\.config/);
});

test('Actions sender is explicitly opt-in, scheduled, secret-only and non-overlapping', () => {
  const sender = read('.github/workflows/send-push.yml');
  assert.match(sender, /cron: '7,37 \* \* \* \*'/);
  assert.match(sender, /if: vars\.PUSH_ACTIONS_ENABLED == 'true'/);
  assert.match(sender, /cancel-in-progress: false/);
  assert.match(sender, /FIREBASE_PUSH_SERVICE_ACCOUNT: \$\{\{ secrets\.FIREBASE_PUSH_SERVICE_ACCOUNT \}\}/);
  assert.doesNotMatch(sender, /firebase deploy|CLOUDFLARE|workers\/push/);
});

test('queue has a collection-group index and clients cannot forge delivery receipts', () => {
  const indexes = JSON.parse(read('firestore.indexes.json'));
  assert.ok(indexes.indexes.some(i => i.collectionGroup === 'notifications' && i.queryScope === 'COLLECTION_GROUP'
    && i.fields.some(f => f.fieldPath === 'pushDelivery.state') && i.fields.some(f => f.fieldPath === 'createdAt')));
  const rules = read('firestore.rules');
  assert.match(rules, /pushDelivery\.keys\(\)\.hasOnly\(\['state'\]\)/);
  assert.match(rules, /pushDelivery\.state == 'pending'/);
  assert.match(rules, /createdAt == request\.time/);
  assert.match(rules, /affectedKeys\(\)\.hasOnly\(\['readBy'\]\)/);
});
