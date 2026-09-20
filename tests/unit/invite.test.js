// Invite codes: members type what the admin pasted from chat ("abc-123", " ABC 123 "),
// so normalisation has to be forgiving while the code stays strict.
import { generateInviteCode, normalizeInviteCode, isValidInviteCode, formatInviteCode, INVITE_CODE_LENGTH } from '../../src/js/utils/invite.js';

function assert(cond, msg) { if (!cond) throw new Error(msg); }
const eq = (a, b, msg) => assert(a === b, `${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`);

export function testInviteCodes() {
  console.log('Testing invite codes...');

  eq(INVITE_CODE_LENGTH, 6, 'six characters');

  // Ambiguous characters are never generated (typed from a phone screen).
  for (let i = 0; i < 200; i++) {
    const code = generateInviteCode();
    eq(code.length, 6, 'generated length');
    assert(/^[A-Z2-9]+$/.test(code), `alphabet ok: ${code}`);
    assert(!/[O0I1L]/.test(code), `no look-alike characters: ${code}`);
  }
  const codes = new Set(Array.from({ length: 50 }, () => generateInviteCode()));
  assert(codes.size > 45, 'codes are random (no repeats in 50 draws)');

  eq(normalizeInviteCode('abc-123'), 'ABC123', 'lower case + dash');
  eq(normalizeInviteCode(' fuji 23 '), 'FUJI23', 'spaces stripped');
  eq(normalizeInviteCode('AB!C@1#2'), 'ABC12', 'symbols stripped');
  eq(normalizeInviteCode('ABC1234567'), 'ABC123', 'truncated to 6');
  eq(normalizeInviteCode(''), '', 'empty stays empty');

  assert(isValidInviteCode('abc-123'), 'valid after normalising');
  assert(!isValidInviteCode('ABC'), 'too short is invalid');
  assert(!isValidInviteCode(''), 'empty is invalid');

  eq(formatInviteCode('abc123'), 'ABC-123', 'display form');
  eq(formatInviteCode('ABC'), 'ABC', 'short codes are not dashed');

  console.log('All invite code tests passed');
}
