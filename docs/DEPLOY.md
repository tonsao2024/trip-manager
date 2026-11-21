# Deploy Guide

## Firebase feature and plan requirements

The static app's visible sign-in screen uses Firebase Google Authentication, Firestore, and GitHub
Pages on Spark. The codebase also has callable-backed compatibility paths for member security:

- username + PIN login, PIN setup/cleanup, and the server-only username index;
- exact email-profile lookup for adding an existing account;
- the legacy invite-code lookup fallback (new/updated trips maintain a minimal preview document).

These callables require Cloud Functions on **Blaze** and may incur charges. If the project stays on
Spark, use the visible Google sign-in and Firestore join-request flow; legacy PIN login, add-by-email
search, and the callable invite fallback are unavailable. Do not restore client reads/writes of
`memberSecrets`, `userSecrets`, `publicMemberLogins`, or `loginAccounts` as a workaround.

## GitHub Pages

1. Push the repository to GitHub.
2. In **Settings → Pages → Build and deployment**, select **GitHub Actions** (not “Deploy from a branch”).
3. Add the Actions secret `FCM_VAPID_KEY` if Web Push is needed (Firebase Console → Project settings →
   Cloud Messaging → Web Push certificates → *Key pair*).
4. Push to `main` or run **Actions → Deploy GitHub Pages → Run workflow**. The site URL is
   `https://<user>.github.io/<repo>/`.
5. On first visit, enter the public Firebase web config if the configuration screen appears.

There is no application build step. The Pages workflow stages browser assets only; it does **not**
deploy Firestore rules or Cloud Functions. For background Web Push, configure the separate
[GitHub Actions sender](PUSH-ACTIONS.md). The VAPID key is public client configuration; never put a
service-account key in the browser.

## Google sign-in from chat apps

Opening the site from Messenger, LINE, Instagram, Facebook or TikTok runs it inside that app's
embedded webview. Google refuses OAuth in embedded webviews, and Firebase keeps the pending
redirect sign-in in `sessionStorage`, which these webviews drop or partition between
`<user>.github.io` and `<project>.firebaseapp.com`. The user then lands on the auth handler's page:

> Unable to process request due to missing initial state…

The app never starts a redirect there (`src/js/utils/browserEnv.js`). The login screen detects the
webview or unusable storage, says the page has to be opened in a real browser, and offers
**Open in Chrome** (an `intent://` link that targets Chrome with a browser fallback) or the
⋯ → *Open in Safari* steps. Two things keep that situation rare:

- Sign-in stays popup-first, and the popup opens **inside the user gesture**: “remember this
  device” persistence is applied when the login screen renders, never between the tap and
  `window.open()` (`prepareAuthPersistence` in `src/js/auth/accountAuth.js`).
- Serve the site from the same site as `authDomain`. On `<projectId>.web.app` or
  `<projectId>.firebaseapp.com`, `firebase.js` uses that host as `authDomain`, so
  `/__/auth/handler` is same-site and the redirect flow survives storage partitioning. GitHub Pages
  (`<user>.github.io` + `<project>.firebaseapp.com`) is cross-site: the popup still works, the
  redirect cannot.

When a user reports the error, ask them to open the link in Chrome/Safari rather than in the chat
app; no Firebase console change is needed.

## Firestore rules and indexes

Install/use Firebase CLI, then deploy rules and indexes to the intended project:

```bash
npm install -g firebase-tools@13
firebase login
firebase deploy --project trip-manager-93b22 --only firestore:rules,firestore:indexes
```

`firebase.json` points to `firestore.rules`, `firestore.indexes.json`, and the `functions/` source.
The GitHub Actions workflow **Deploy Firestore rules & indexes (Spark)** still deploys only rules and
indexes; it never deploys Functions or Storage. Web and rules deployment are separate operations.

The current rules keep `publicProfiles` owner-readable/non-listable, make `memberSecrets`,
`userSecrets`, `publicMemberLogins`, and `loginAccounts` server-only, and replace invite-code trip
listing with a non-listable `publicTripInvites/{code}` preview containing only `tripId`, name, and dates. Publish the
matching rules before relying on the new browser code.

## Cloud Functions (Blaze only)

Enable Blaze and set up billing before deploying Functions. The functions use Node 20 in
`asia-southeast1`. Install the locked server dependencies and deploy the callable endpoints used by
the current client:

```bash
npm --prefix functions ci
firebase deploy --project trip-manager-93b22 --only \
  functions:healthCheck,functions:findMemberProfileByEmail,functions:lookupTripByInviteCode,\
functions:setMemberPin,functions:publishMemberLoginLookup,functions:clearMemberPin,\
functions:loginWithUsernamePin,functions:verifySensitiveActionPin
```

The explicit list avoids deploying unrelated scheduled/trigger functions in `functions/src/index.js`.
If those other functions are intentionally needed, review their triggers and billing impact before
using `--only functions` to deploy every export.

The PIN callable accepts the existing PBKDF2-SHA256 member-secret format (100,000 iterations,
16-byte hex salt) and bcrypt records from older server-managed accounts. New PINs are hashed on the
server. No client-side PIN hash or public username index is required.

### Migrate legacy PIN fields before publishing Rules

Older releases could leave PIN hashes or step-up metadata on readable `users/{uid}` or
`trips/{tripId}/members/{memberId}` documents. The current Rules deny reads of profiles that still
contain those fields, and deny client writes of PIN material. Run this Admin SDK migration **before
publishing the new Rules**, whether the project uses Spark or Blaze. It moves those fields into the
server-only `userSecrets/{uid}` / `memberSecrets/{tripId}_{memberId}` records and removes them from the
profile documents. Existing PBKDF2-SHA256 hashes are preserved; hashes already in a private record
remain authoritative. On Blaze, deploy the compatibility callables before the browser release; the
migration itself does not require Cloud Functions.

Authenticate with Application Default Credentials that can read/write Firestore:
`gcloud auth application-default login`, or set `GOOGLE_APPLICATION_CREDENTIALS` to a service-account
file kept outside the repository.

```bash
npm --prefix functions ci
GOOGLE_CLOUD_PROJECT=trip-manager-93b22 npm --prefix functions run migrate:legacy-pins
```

The script prints counts only, never PIN material. Resolve any migration error before publishing the
new Rules; do not commit credentials.

### Backfill existing invite previews

Run this Admin SDK backfill **before publishing the new Rules**, especially on Spark where there is
no callable fallback. It normalizes existing invite codes, detects collisions before writing, enables
legacy trips whose `inviteEnabled` field was missing, writes minimal previews before removing stale
ones, and keeps each trip-code update paired atomically with its preview. The script uses the same
Application Default Credentials described above.

```bash
GOOGLE_CLOUD_PROJECT=trip-manager-93b22 npm --prefix functions run migrate:trip-invites
```

Review any reported invite-code collision and resolve it before rerunning. Never commit credentials.
New and updated trips maintain their preview documents through the client; the callable repairs a
missing legacy preview when a signed-in user submits its invite code.

### Controlled rollout

**Blaze:**
1. Deploy the selected callable Functions.
2. Run the legacy PIN-field migration and invite-preview backfill with the Admin SDK.
3. Publish the current Firestore Rules and indexes.
4. Publish the current browser bundle through GitHub Pages and ask members to refresh.

**Spark:**
1. Run the Admin SDK legacy PIN-field migration (if legacy fields exist) and invite-preview backfill.
2. Publish the current Firestore Rules and indexes.
3. Publish the current browser bundle through GitHub Pages and ask members to refresh.

The PIN and directory Rules are intentionally incompatible with older clients that directly read or
write credential/index documents. Keep the release window short and ask users to reload after the
browser bundle is live. Do not deploy production changes from this guide as part of a code review.

## Notifications and Spark

The in-app notification feed and the delayed Web Push sender remain Firestore + GitHub Actions flows;
they do not depend on Cloud Functions. Push is best-effort and normally runs every 30 minutes. See
[PUSH-ACTIONS.md](PUSH-ACTIONS.md) for the VAPID key, sender secret, and enable flag.

## Verify locally

```bash
npm test
npm run test:smoke
npm --prefix functions ci
npm --prefix functions test
npm --prefix functions run lint
```

Firestore Rules tests use the real Firestore emulator and do not need Firebase credentials:

```bash
# Requires Java and Firebase CLI; CLI launches the emulator and sets FIRESTORE_EMULATOR_HOST.
npx firebase-tools@13 emulators:exec \
  --project demo-trip-manager-rules --only firestore "npm run test:rules"
```

The Rules suite checks trip isolation, invite previews and trip-list denial, owner-only profiles, and
denies client access to PIN/login records. A direct `npm run test:rules` without the emulator fails
with a setup message instead of silently passing.

## Create the first super admin

1. Create/sign in the account in Firebase Authentication.
2. In Firestore, create `users/{uid}` for that Auth UID with `role: "super_admin"` and the basic
   profile fields. Do not add PIN hashes or step-up fields; server Functions own those credentials.

## Checklist

- [ ] Firestore rules and indexes are published to the correct project
- [ ] Google provider is enabled for the current sign-in screen and the deployed web domain is authorized
- [ ] For username/PIN, email lookup, or legacy invite fallback: Blaze is enabled and required
      callables are deployed in `asia-southeast1`
- [ ] Existing invite previews are backfilled; collisions were resolved
- [ ] GitHub Pages uses **GitHub Actions** as its source
- [ ] If Web Push is enabled, the VAPID key and GitHub Actions sender are configured separately
- [ ] Users have refreshed the site after the Rules/client migration
