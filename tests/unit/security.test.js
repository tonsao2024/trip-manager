import fs from 'node:fs';
import path from 'node:path';
import { escapeHtml, sanitizeUrl, sanitizeFormulaCell } from '../../src/js/utils/sanitize.js';
import { placeDetailsHtml } from '../../src/js/utils/placeDetails.js';
import { itineraryItemToRow, expenseToRow } from '../../src/js/utils/excel.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const rootDir = path.resolve(import.meta.dirname, '../..');

export function testEscapeHtmlAndSanitizeUrl() {
  assert(escapeHtml('<script>alert("xss")</script>') === '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;', 'escapes HTML tags and quotes');
  assert(escapeHtml(null) === '' && escapeHtml(undefined) === '', 'null/undefined return empty string');
  assert(escapeHtml(42) === '42', 'coerces non-string values safely');

  assert(sanitizeUrl('https://example.com/path?q=1') === 'https://example.com/path?q=1', 'allows https URLs');
  assert(sanitizeUrl('http://example.com/doc.pdf') === 'http://example.com/doc.pdf', 'allows http URLs');
  assert(sanitizeUrl('javascript:alert(1)') === '', 'blocks javascript: URLs');
  assert(sanitizeUrl('  JaVaScRiPt:alert(document.cookie)') === '', 'blocks mixed-case javascript: URLs');
  assert(sanitizeUrl('jav\tascript:alert(1)') === '', 'blocks control-char obfuscated javascript: URLs');
  assert(sanitizeUrl('data:text/html,<script>alert(1)</script>') === '', 'blocks data: URLs');
  assert(sanitizeUrl('vbscript:msgbox(1)') === '', 'blocks vbscript: URLs');
  assert(sanitizeUrl('//evil.example.com/payload') === '', 'blocks protocol-relative URLs');
}

export function testPlaceDetailsJavascriptUriBlocked() {
  const html = placeDetailsHtml({
    ok: true,
    mapsUrl: 'javascript:alert(1)',
    osm: {
      name: 'Test Place',
      website: 'javascript:alert(document.domain)',
      osmUrl: 'data:text/html,<script>alert(1)</script>'
    },
    wiki: {
      lang: 'th',
      url: 'javascript:alert(2)',
      extract: 'รายละเอียดสถานที่',
      thumbnail: 'javascript:alert(3)'
    }
  }, { lang: 'th' });

  assert(!html.includes('javascript:'), 'javascript: URIs are stripped from placeDetailsHtml');
  assert(!html.includes('data:text/html'), 'data: URIs are stripped from placeDetailsHtml');
}

export function testExcelFormulaInjectionBlocked() {
  assert(sanitizeFormulaCell('=HYPERLINK("http://evil.tld")') === '\'=HYPERLINK("http://evil.tld")', 'neutralizes = prefix');
  assert(sanitizeFormulaCell('+cmd|\' /C calc\'!A0') === '\'+cmd|\' /C calc\'!A0', 'neutralizes + prefix');
  assert(sanitizeFormulaCell('-2+3+cmd|\' /C calc\'!A0') === '\'-2+3+cmd|\' /C calc\'!A0', 'neutralizes - prefix');
  assert(sanitizeFormulaCell('@SUM(A1:A2)') === '\'@SUM(A1:A2)', 'neutralizes @ prefix');
  assert(sanitizeFormulaCell('Normal Place Name') === 'Normal Place Name', 'leaves normal text untouched');

  const itRow = itineraryItemToRow({
    date: '2026-10-07',
    title: '=cmd|\' /C calc\'!A0',
    address: '@SUM(1,2)',
    notes: '+1+1'
  }, []);
  assert(itRow.title.startsWith("'="), 'itinerary export neutralizes formula in title');
  assert(itRow.address.startsWith("'@"), 'itinerary export neutralizes formula in address');
  assert(itRow.notes.startsWith("'+"), 'itinerary export neutralizes formula in notes');

  const exRow = expenseToRow({
    date: '2026-10-07',
    title: '=HYPERLINK("http://evil.tld","Click")',
    description: '-cmd',
    currency: 'THB',
    subtotalMinor: 10000,
    netTotalMinor: 10000
  }, [], []);
  assert(exRow.title.startsWith("'="), 'expense export neutralizes formula in title');
  assert(exRow.description.startsWith("'-"), 'expense export neutralizes formula in description');
}

export function testFirestoreAndStorageRulesHardened() {
  const firestoreRules = fs.readFileSync(path.join(rootDir, 'firestore.rules'), 'utf8');
  assert(!/match \/trips\/\{tripId\}[\s\S]*?allow (?:read|get):[\s\S]*?\|\|\s*(?:request\.auth != null|isAuthenticated\(\))/.test(firestoreRules),
    'trips get rule does not allow arbitrary authenticated users');
  assert(!/allow update:[\s\S]*?request\.resource\.data\.memberUids\.hasAny\(\[request\.auth\.uid\]\)/.test(firestoreRules),
    'trips update rule does not allow self-joining via memberUids');
  assert(/match \/expenses\/\{expenseId\}[\s\S]*?if isTripMember\(tripId\)/.test(firestoreRules),
    'expenses subcollection requires isTripMember(tripId)');
  assert(/match \/itineraryItems\/\{itemId\}[\s\S]*?if isTripMember\(tripId\)/.test(firestoreRules),
    'itineraryItems subcollection requires isTripMember(tripId)');
  assert(/match \/memberSecrets\/\{secretId\}/.test(firestoreRules),
    'memberSecrets collection is defined with restricted rules');

  const storageRules = fs.readFileSync(path.join(rootDir, 'storage.rules'), 'utf8');
  assert(!storageRules.includes("contentType.matches('image/.*')"),
    'storage.rules restricts image MIME types (excludes image/svg+xml)');
  assert(/match \/trips\/\{tripId\}\/receipts\/\{fileId\}/.test(storageRules),
    'storage.rules covers /trips/{tripId}/receipts/{fileId}');
  assert(/match \/trips\/\{tripId\}\/settlements\/\{settlementId\}\/proofs\/\{fileId\}[\s\S]*?isSafeDocument\(\)/.test(storageRules),
    'settlement proofs validate contentType via isSafeDocument()');
}

export function testCloudFunctionsAuthorizationHardened() {
  const fnSource = fs.readFileSync(path.join(rootDir, 'functions/src/index.js'), 'utf8');
  assert(fnSource.includes('ALLOWED_MEMBER_ROLES'), 'createMemberAccount enforces role allowlist');
  assert(/validateExpenseAllocations[\s\S]*?isTripMember\(tripId,\s*uid\)/.test(fnSource),
    'validateExpenseAllocations verifies trip membership');
  assert(!/export const recalculateSettlement/.test(fnSource),
    'the unused recalculateSettlement callable is removed (the client computes settlement itself)');
  assert(/writeAuditLog[\s\S]*?isTripMember\(tripId,\s*uid\)/.test(fnSource),
    'writeAuditLog verifies trip membership');
}
