// Static guards for firestore.rules — the checks that need no emulator.
//
// Why this file exists: the Firestore emulator cannot always be downloaded (CI
// and sandboxes block storage.googleapis.com), so the expensive-rules-query bug
// below shipped unnoticed twice. A query rule is answered once per returned
// document and Firestore allows only 10 document access calls (get / exists /
// getAfter) per query — exceeding it fails the WHOLE query with
// permission-denied, which the app shows as “cannot verify your membership”.
// A member who belongs to a few trips then “loses” all of them.
//
//	$ node --test tests/rules-lint.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rules = readFileSync(join(root, 'firestore.rules'), 'utf8');

/** Lines of the `match /trips/{tripId} { … }` block that owns the app's rules. */
function blockAt(lines, startPattern) {
  const start = lines.findIndex(line => startPattern.test(line));
  assert.ok(start >= 0, `${startPattern} is missing from firestore.rules`);
  const indent = lines[start].match(/^\s*/)[0];
  const end = lines.findIndex((line, i) => i > start && line === `${indent}}`);
  assert.ok(end > start, `the block opened by ${startPattern} is never closed`);
  return lines.slice(start, end + 1);
}

/** The `allow list: if (…);` statement of the trips collection rule. */
function tripsListRule(source) {
  const lines = source.split('\n');
  const block = blockAt(lines, /^    match \/trips\/\{tripId\} \{$/);
  const start = block.findIndex(line => /^\s*allow list:/.test(line));
  assert.ok(start >= 0, 'the main trips rule has no `allow list`');
  const end = block.findIndex((line, i) => i >= start && line.trimEnd().endsWith(';'));
  assert.ok(end >= 0, 'the `allow list` statement is not terminated');
  return block.slice(start, end + 1).join('\n');
}

// A document access call is a bare get()/exists()/getAfter()/existsAfter();
// `data.get('field')` is the Map accessor on a document, which is free.
const accessCall = /(^|[^.\w])(get|exists|getAfter|existsAfter)\s*\(/;

test('the trips list rule performs no document access calls (query budget)', () => {
  const rule = tripsListRule(rules);
  assert.equal(
    accessCall.test(rule), false,
    `the trips list rule must not call get()/exists(): one access per returned trip ` +
    `exhausts Firestore's 10-call query budget and denies the whole trip list.\n\n${rule}`
  );
});

test('the trips list rule still decides membership from the trip document itself', () => {
  const rule = tripsListRule(rules);
  assert.match(rule, /createdBy/, 'the creator must still be able to list their trip');
  assert.match(rule, /memberUids/, 'memberUids is the listing the app keeps in sync');
  assert.match(rule, /hasAny\(\[request\.auth\.uid\]\)/, 'membership must be checked against the caller’s uid');
  assert.match(rule, /isSuperAdmin/, 'a super admin must still be able to list every trip');
});

test('every other listing rule on that collection keeps the budget too', () => {
  // joinRequests is the only other list rule that is not `false`; it reads the
  // same single member document for every row, so caching keeps it at 1 call.
  const lines = rules.split('\n');
  const block = blockAt(lines, /^      match \/joinRequests\/\{uid\} \{$/);
  const statement = block.join('\n');
  assert.match(statement, /allow list: if isAuthenticated\(\) && canManageMembers\(tripId\)/);
  // It reads `members/{uid}` through canManageMembers — one document per query,
  // cached across the rows, so the budget does not grow with the result size.
  assert.equal(accessCall.test(statement), false);
});

test('both revoked spellings are still honoured for real member reads', () => {
  assert.match(rules, /function revokedMemberStatus\(data\)/);
  assert.match(rules, /data\.get\('status', 'active'\) in \['inactive', 'disabled'\]/);
  const uses = rules.match(/revokedMemberStatus\(/g) || [];
  // definition + isTripMember + memberMayRestoreOwnListing + the member-document
  // update rule (the trips *list* rule deliberately no longer reads a document).
  assert.ok(uses.length >= 4, `revokedMemberStatus must be used by the member checks (found ${uses.length})`);
  // The strict check must stay on get + every subcollection read.
  assert.match(rules, /allow get: if isAuthenticated\(\) && isTripMember\(tripId\)/);
  assert.match(rules, /function isTripMember\(tripId\)[\s\S]*?exists\(memberPath\) && !revokedMemberStatus\(get\(memberPath\)\.data\)/);
});

test('firestore.rules is structurally balanced', () => {
  let depth = 0;
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;
  for (let i = 0; i < rules.length; i++) {
    const c = rules[i];
    const next = rules[i + 1];
    if (inLineComment) { if (c === '\n') inLineComment = false; continue; }
    if (inBlockComment) { if (c === '*' && next === '/') { inBlockComment = false; i++; } continue; }
    if (inString) { if (c === '\\') { i++; continue; } if (c === "'") inString = false; continue; }
    if (c === '/' && next === '/') { inLineComment = true; i++; continue; }
    if (c === '/' && next === '*') { inBlockComment = true; i++; continue; }
    if (c === "'") { inString = true; continue; }
    if (c === '{') depth++;
    if (c === '}') depth--;
    assert.ok(depth >= 0, `unbalanced closing brace at offset ${i}`);
  }
  assert.equal(depth, 0, 'every { must be closed');
  assert.equal(inString, false, 'an apostrophe is left open (a string literal spans lines)');
});
