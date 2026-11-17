import { pbkdf2 as pbkdf2Callback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import bcrypt from 'bcryptjs';

const pbkdf2 = promisify(pbkdf2Callback);

/**
 * Verify a server-managed member PIN without exposing credential material.
 * New records use bcrypt; existing client-written records use PBKDF2-SHA256
 * with a 16-byte random hex salt, 100,000 iterations, and a 32-byte digest.
 */
export async function verifyStoredMemberPin(pin, record) {
  const pinHash = String(record?.pinHash || '');
  if (!pinHash) return false;

  if (/^\$2[aby]\$/.test(pinHash)) {
    try {
      return await bcrypt.compare(String(pin), pinHash);
    } catch {
      return false;
    }
  }

  if (record?.pinAlgo && record.pinAlgo !== 'pbkdf2-sha256') return false;
  const saltHex = String(record?.pinSalt || '');
  const iterations = Number(record?.pinIterations ?? 100000);
  if (!/^[0-9a-f]{64}$/i.test(pinHash)
      || !/^[0-9a-f]{32}$/i.test(saltHex)
      || !Number.isInteger(iterations) || iterations < 10000 || iterations > 1000000) return false;

  try {
    const computed = await pbkdf2(String(pin), Buffer.from(saltHex, 'hex'), iterations, 32, 'sha256');
    const expected = Buffer.from(pinHash, 'hex');
    return computed.length === expected.length && timingSafeEqual(computed, expected);
  } catch {
    return false;
  }
}
