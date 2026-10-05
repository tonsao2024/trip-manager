export function escapeHtml(str) {
  if (typeof str !== 'string') return '';
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

export function safeInnerHTML(el, html) {
  // Only use when html is from trusted template, not user input
  // For user content, use textContent
  el.innerHTML = html;
}

export function setText(el, text) {
  if (el) el.textContent = text ?? '';
}
