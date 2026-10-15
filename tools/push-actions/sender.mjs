// Pure dispatch policy, injected Firestore/FCM adapters. No browser secrets,
// HTTP endpoint, Cloud Functions, Cloudflare or repository_dispatch needed.
export const LIMITS = { notes: 20, recipients: 30, devices: 5, members: 200, maxAgeMs: 24 * 60 * 60 * 1000 };
const FLAGS = { expense: 'expense', daily_summary: 'dailySummary', settlement: 'settlement', member: 'member', trip: 'member', test: null };
const validUid = uid => typeof uid === 'string' && uid.length > 0 && uid.length <= 128
  && !['.', '..'].includes(uid) && !/[/\x00-\x1f]/.test(uid);

export class SkipNote extends Error {}

export function memberIds(trip, members) {
  const ids = new Set([...(Array.isArray(trip.memberUids) ? trip.memberUids : []), trip.createdBy].filter(validUid));
  for (const { id, data } of members) if (data.status !== 'inactive') {
    if (validUid(id)) ids.add(id);
    if (validUid(data.uid)) ids.add(data.uid);
  }
  for (const { id, data } of members) if (data.status === 'inactive') { ids.delete(id); ids.delete(data.uid); }
  return ids;
}

export function timestampMs(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  return NaN; // Queue entries must contain a real Firestore timestamp, not a string supplied by a client.
}

export function recipientsFor(note, members, now) {
  if (!validUid(note.createdBy) || !members.has(note.createdBy)) throw new SkipNote('author-not-a-member');
  if (!Object.hasOwn(FLAGS, note.type) || typeof note.title !== 'string' || note.title.length > 200
      || (note.body != null && (typeof note.body !== 'string' || note.body.length > 600))) throw new SkipNote('invalid-notification');
  const created = timestampMs(note.createdAt);
  if (!Number.isFinite(created) || created > now + 30000 || now - created > LIMITS.maxAgeMs) throw new SkipNote('expired-or-invalid-timestamp');
  const requested = note.type === 'test' ? [note.createdBy]
    : Array.isArray(note.recipients) && note.recipients.length ? note.recipients : [...members];
  const recipients = [...new Set(requested)].filter(uid => members.has(uid) && (note.type === 'test' || uid !== note.createdBy));
  if (recipients.length > LIMITS.recipients) throw new SkipNote('recipient-limit');
  return recipients;
}

export function messageData(note, tripId, notificationId, appUrl) {
  const base = new URL(appUrl);
  const fallback = `#/trip/${encodeURIComponent(tripId)}/dashboard`;
  const link = typeof note.link === 'string' && note.link.length <= 512 && note.link.startsWith(`#/trip/${tripId}/`) ? note.link : fallback;
  base.hash = link.slice(1);
  return { title: note.title.slice(0, 120), body: (note.body || '').slice(0, 240), url: base.href,
    tag: `${tripId}:${notificationId}`, notificationId, type: note.type };
}

export async function prepare(store, item, appUrl, now) {
  const parts = item.path.split('/');
  if (parts.length !== 4 || parts[0] !== 'trips' || parts[2] !== 'notifications') throw new SkipNote('invalid-path');
  const [, tripId, , notificationId] = parts;
  const trip = await store.trip(tripId);
  if (!trip) throw new SkipNote('trip-not-found');
  const members = memberIds(trip, await store.members(tripId));
  const recipients = recipientsFor(item.data, members, now);
  const devices = [];
  for (const uid of recipients) {
    const prefs = await store.prefs(uid);
    if (!prefs || prefs.push !== true || prefs.enabled === false || (FLAGS[item.data.type] && prefs[FLAGS[item.data.type]] === false)) continue;
    for (const device of await store.tokens(uid)) {
      const t = device.data;
      if (typeof t.token !== 'string' || !t.token || t.enabled === false) continue;
      if (Array.isArray(t.tripIds) && t.tripIds.length && !t.tripIds.includes(tripId)) continue;
      devices.push({ token: t.token, path: device.path });
    }
  }
  return { devices: [...new Map(devices.map(d => [d.token, d])).values()],
    data: messageData(item.data, tripId, notificationId, appUrl) };
}

export async function dispatch({ store, messaging, appUrl, now = Date.now(), runId = 'local' }) {
  const app = new URL(appUrl);
  if (app.protocol !== 'https:' || app.username || app.password || app.search || app.hash) throw new Error('APP_URL must be a trusted HTTPS app URL, including its base path');
  const stats = { scanned: 0, completed: 0, skipped: 0, duplicate: 0, sent: 0, failed: 0, errors: 0 };
  // Old pending entries are never replayed after a long outage. Mark a bounded
  // batch expired separately so they cannot permanently clog the queue.
  stats.expired = await store.expire(now - LIMITS.maxAgeMs, LIMITS.notes);
  const pending = await store.pending(now - LIMITS.maxAgeMs, now, LIMITS.notes);
  for (const item of pending) {
    stats.scanned++;
    let prepared;
    try {
      prepared = await prepare(store, item, appUrl, now);
    } catch (error) {
      if (error instanceof SkipNote) {
        if (await store.claim(item, { state: 'skipped', reason: error.message, runId })) stats.skipped++;
        else stats.duplicate++;
      } else {
        // No external send has been attempted yet. Leave pending so a later
        // scheduled run can retry a transient Firestore/IAM/network error.
        stats.errors++;
      }
      continue;
    }
    // A Firestore transaction claims pending -> claimed BEFORE any send. The
    // receipt is durable across runner restarts, re-runs and concurrent jobs.
    if (!await store.claim(item, { state: 'claimed', runId })) { stats.duplicate++; continue; }
    let sent = 0, failed = 0;
    for (const device of prepared.devices) {
      try {
        await messaging.send({ token: device.token, data: prepared.data,
          webpush: { headers: { Urgency: 'high', TTL: '3600' } } });
        sent++;
      } catch (error) {
        failed++;
        // Only a definitively dead token is removed. Never delete tokens for
        // IAM failures, throttling, malformed payloads or ambiguous timeouts.
        if (error.code === 'messaging/registration-token-not-registered') {
          try { await store.removeToken(device.path); } catch { /* cleanup is best effort */ }
        }
      }
    }
    stats.sent += sent;
    stats.failed += failed;
    // Do NOT reset to pending after a send error: FCM might have accepted a
    // timed-out request. At-most-once attempts trade retries for fewer duplicates.
    try { await store.finish(item.path, { state: failed ? 'partial' : 'complete', sent, failed, runId }); }
    catch { stats.errors++; } // Remains claimed; another run must not replay it.
    stats.completed++;
  }
  return stats;
}
