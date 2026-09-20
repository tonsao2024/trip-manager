/**
 * Trip invite codes.
 *
 * A trip admin shares a 6-character code; a signed-in member types it in the app
 * and asks to join. The admin then approves the request from the Members page —
 * this is how membership works on the free (Spark) plan, where Cloud Functions
 * are not available to create accounts for other people.
 *
 * Pure helpers so they can be unit tested in Node.
 */

// No 0/O/1/I/L to keep the code readable when typed from a chat message.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const INVITE_CODE_LENGTH = 6;

export function generateInviteCode(length = INVITE_CODE_LENGTH) {
  let out = '';
  const cryptoObj = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
  if (cryptoObj?.getRandomValues) {
    const bytes = new Uint8Array(length);
    cryptoObj.getRandomValues(bytes);
    for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  } else {
    for (let i = 0; i < length; i++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

/** Users type `fuji-abc123` or `abc 123` — normalise before looking up. */
export function normalizeInviteCode(input) {
  return String(input || '')
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, INVITE_CODE_LENGTH);
}

export function isValidInviteCode(input) {
  return normalizeInviteCode(input).length === INVITE_CODE_LENGTH;
}

/** Pretty form for display: `ABC-123`. */
export function formatInviteCode(code) {
  const c = normalizeInviteCode(code);
  return c.length === INVITE_CODE_LENGTH ? `${c.slice(0, 3)}-${c.slice(3)}` : c;
}
