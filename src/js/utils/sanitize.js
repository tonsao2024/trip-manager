export function escapeHtml(str) {
  if (str == null) return '';
  if (typeof str !== 'string') str = String(str);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function sanitizeText(input, maxLen = 500) {
  if (!input) return '';
  let s = String(input).trim().slice(0, maxLen);
  return escapeHtml(s);
}

/**
 * Validate a URL before placing it into href/src attributes.
 * Blocks dangerous protocols such as javascript:, data:, vbscript:, file:.
 */
export function sanitizeUrl(url, { allowRelative = false } = {}) {
  if (typeof url !== 'string') return '';
  const cleaned = url.replace(/[\u0000-\u001F\u007F]+/g, '').trim();
  if (!cleaned) return '';
  if (allowRelative && (cleaned.startsWith('/') || cleaned.startsWith('./') || cleaned.startsWith('#'))) {
    if (cleaned.startsWith('//')) return '';
    return cleaned;
  }
  if (/^https?:\/\//i.test(cleaned)) {
    return cleaned;
  }
  return '';
}

/**
 * Neutralize spreadsheet formula prefixes (=, +, -, @, Tab, CR) in exported string cells
 * to prevent CSV / Excel formula injection when opened in spreadsheet software.
 */
export function sanitizeFormulaCell(value) {
  if (typeof value !== 'string' || !value) return value;
  if (/^[=+\-@\t\r]/.test(value)) {
    return `'${value}`;
  }
  return value;
}

export function safeInnerHTML(el, html) {
  // Only use when html is from trusted template, not user input
  // For user content, use textContent
  el.innerHTML = html;
}

export function setText(el, text) {
  if (el) el.textContent = text ?? '';
}
