import assert from 'node:assert/strict';
import { pbkdf2Sync } from 'node:crypto';
import test from 'node:test';
import bcrypt from 'bcryptjs';
import { verifyStoredMemberPin } from '../src/memberPin.js';

const pin = '4826';
const salt = '00112233445566778899aabbccddeeff';
const legacy = {
  pinHash: pbkdf2Sync(pin, Buffer.from(salt, 'hex'), 100000, 32, 'sha256').toString('hex'),
  pinSalt: salt,
  pinIterations: 100000,
  pinAlgo: 'pbkdf2-sha256'
};

test('verifies the existing PBKDF2-SHA256 member secret format', async () => {
  assert.equal(await verifyStoredMemberPin(pin, legacy), true);
  assert.equal(await verifyStoredMemberPin('4827', legacy), false);
});

test('supports the historical default iteration count and rejects malformed legacy material', async () => {
  assert.equal(await verifyStoredMemberPin(pin, { ...legacy, pinIterations: undefined }), true);
  assert.equal(await verifyStoredMemberPin(pin, { ...legacy, pinSalt: 'not-a-salt' }), false);
  assert.equal(await verifyStoredMemberPin(pin, { ...legacy, pinHash: 'abcd' }), false);
  assert.equal(await verifyStoredMemberPin(pin, { ...legacy, pinIterations: 0 }), false);
  assert.equal(await verifyStoredMemberPin(pin, { ...legacy, pinIterations: 1 }), false);
  assert.equal(await verifyStoredMemberPin(pin, { ...legacy, pinAlgo: 'unknown' }), false);
});

test('verifies bcrypt credentials retained for pre-migration accounts', async () => {
  const pinHash = await bcrypt.hash(pin, 4);
  assert.equal(await verifyStoredMemberPin(pin, { pinHash, pinAlgo: 'bcrypt' }), true);
  assert.equal(await verifyStoredMemberPin('4827', { pinHash, pinAlgo: 'bcrypt' }), false);
});
