import { expensePayments } from '../utils/payments.js';
import { formatCurrency, toThbMinor } from '../utils/currency.js';
// Export helpers — PNG / PDF / clipboard text.
//
// html2canvas 1.4.x cannot parse modern colour syntax: Chromium serialises every
// `color-mix()` / `oklch()` value as `color(srgb …)`, and the parser then throws
//   "Attempting to parse an unsupported color function \"color\""
// which is exactly the error users kept seeing. The fix has three layers:
//
//   1. buildPlainClone()  — render a deep clone whose computed styles are written
//      inline with plain rgb()/rgba() colours. html2canvas reads values WE
//      produced, so no stylesheet (or custom property) can leak a modern colour.
//   2. sanitizeColorsForExport() + a plain background colour, used for the
//      fallback path that captures the live element.
//   3. hardPlainPalette() — last-resort flat repaint if a device still objects.
import {
  sanitizeColorsForExport, hardPlainPalette, resolveSafeBackgroundColor,
  buildPlainClone, findModernColors, injectPlainPseudoSheet
} from '../utils/colors.js';

function downloadCanvas(canvas, filename) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

let html2canvasPromise = null;
/** Imported once — a second tap on "PNG" must not wait for the module again. */
function loadHtml2Canvas() {
  if (!html2canvasPromise) {
    html2canvasPromise = import('https://esm.sh/html2canvas@1.4.1')
      .then(mod => mod.default || mod)
      .catch((e) => { html2canvasPromise = null; throw e; });
  }
  return html2canvasPromise;
}

/** Swap the element into the monochrome "receipt" look for the capture. */
function applyFlatMode(el) {
  el.classList.add('export-flat');
  return () => el.classList.remove('export-flat');
}

const nextFrame = () => new Promise((resolve) => {
  if (typeof requestAnimationFrame !== 'function') return setTimeout(resolve, 16);
  requestAnimationFrame(() => requestAnimationFrame(resolve));
});

/** Wait (briefly) for web fonts so Thai text is not captured with a fallback face. */
async function fontsReady() {
  try {
    if (document.fonts?.ready) await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 800))]);
  } catch { /* ignore */ }
}

function baseOptions(el, options = {}) {
  return {
    scale: options.scale || 2,
    useCORS: true,
    allowTaint: false,
    logging: false,
    // NEVER hand html2canvas a computed colour string: Chromium serialises
    // color-mix() as `color(srgb …)` and html2canvas throws on it.
    backgroundColor: resolveSafeBackgroundColor(document.body),
    windowWidth: Math.max(el.scrollWidth || 0, el.clientWidth || 0, 320) + 24,
    windowHeight: Math.max(el.scrollHeight || 0, el.clientHeight || 0, 200) + 24,
    scrollX: 0,
    scrollY: 0
  };
}

function resolveTarget(elementId, options = {}) {
  let el = typeof elementId === 'string' ? document.getElementById(elementId) : elementId;
  if (!el && options.fallbackSelector) el = document.querySelector(options.fallbackSelector);
  return el;
}

/**
 * Run the layered pipeline on one element and return the canvas.
 * Order: plain clone → sanitised live element → flat palette on the live element.
 */
async function renderToCanvas(el, options = {}) {
  const html2canvas = await loadHtml2Canvas();
  const warnings = [];
  let useFlat = options.flat !== false;
  const restoreFlat = useFlat ? applyFlatMode(el) : () => {};

  try {
    await fontsReady();
    await nextFrame();

    // --- attempt 1: the plain clone (bullet-proof against modern colours) ---
    const plain = buildPlainClone(el);
    if (plain) {
      // The clone is inline-styled, but ::before/::after still come from CSS.
      const sheet = injectPlainPseudoSheet();
      try {
        const leftovers = findModernColors(plain.node);
        if (!leftovers.length) {
          const canvas = await html2canvas(plain.node, baseOptions(plain.node, options));
          return canvas;
        }
        warnings.push(`clone still had ${leftovers.length} modern colour(s): ${leftovers.slice(0, 3).join(', ')}`);
      } catch (e) {
        warnings.push(`clone capture failed: ${e?.message || e}`);
      } finally {
        try { sheet?.remove?.(); } catch { /* ignore */ }
        plain.cleanup();
      }
    }

    // --- attempt 2: the live element, colours sanitised in place ---
    const restore = sanitizeColorsForExport(el);
    try {
      const canvas = await html2canvas(el, baseOptions(el, options));
      return canvas;
    } catch (e) {
      warnings.push(`sanitised capture failed: ${e?.message || e}`);
    } finally {
      restore();
    }

    // --- attempt 3: flat palette (no gradients, shadows or filters at all) ---
    const restoreHard = hardPlainPalette(el);
    try {
      return await html2canvas(el, baseOptions(el, options));
    } catch (e2) {
      warnings.push(`flat palette failed: ${e2?.message || e2}`);
      const err = new Error(`${warnings.join(' | ')}`);
      err.warnings = warnings;
      throw err;
    } finally {
      restoreHard();
    }
  } finally {
    restoreFlat();
  }
}

/**
 * Render an element to a PNG file download.
 * @param {string} elementId
 * @param {string} filename
 * @param {{scale?:number, flat?:boolean, fallbackSelector?:string}} [options]
 *   `flat` repaints the subtree in plain colours before the capture — the safest
 *   possible export (default on).
 */
export async function exportToPng(elementId, filename = 'export.png', options = {}) {
  const el = resolveTarget(elementId, options);
  if (!el) throw new Error('ไม่พบเนื้อหาที่จะบันทึกเป็นรูป (element หายไป)');
  let canvas;
  try {
    canvas = await renderToCanvas(el, options);
  } catch (e) {
    throw new Error(`ส่งออกรูปไม่สำเร็จ: ${e.message} — ลองใหม่ หรือใช้ปุ่ม "พิมพ์ / PDF" แทน`);
  }
  downloadCanvas(canvas, filename);
  return canvas;
}

/**
 * Same pipeline as exportToPng but returns the canvas instead of downloading —
 * used by the "share receipt" button and by the itinerary export (which embeds
 * the captured map).
 */
export async function exportToPngToCanvas(elementId, options = {}) {
  const el = resolveTarget(elementId, options);
  if (!el) throw new Error('ไม่พบเนื้อหาที่จะบันทึกเป็นรูป (element หายไป)');
  return renderToCanvas(el, options);
}

/** PNG data-URL of an element (used to embed the map inside another export). */
export async function elementToPngDataUrl(elementId, options = {}) {
  const el = resolveTarget(elementId, options);
  if (!el) return null;
  try {
    const canvas = await renderToCanvas(el, { flat: false, scale: options.scale || 2, ...options });
    return canvas?.toDataURL ? canvas.toDataURL('image/png') : null;
  } catch (e) {
    console.warn('elementToPngDataUrl failed', e?.message || e);
    return null;
  }
}

/**
 * Rasterise one live inline `<svg>` to a PNG download.
 *
 * v44 — the debt map is a drawing, not a page: capturing it with html2canvas
 * would re-lay-out the card around it. Instead the SVG is cloned, every computed
 * colour/font is written onto the clone (the drawing uses `var(--…)` and CSS
 * classes, which mean nothing once the markup leaves the document), the avatar
 * `<image href>`s are turned into data URLs so the canvas stays untainted, and
 * the result is drawn onto a 2× canvas.
 *
 * @param {SVGSVGElement} svgEl
 * @param {string} filename
 * @param {{scale?:number, background?:string}} [options]
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function exportSvgToPng(svgEl, filename = 'diagram.png', { scale = 2, background = '' } = {}) {
  if (!svgEl || svgEl.tagName?.toLowerCase() !== 'svg') throw new Error('ไม่พบแผนภาพที่จะบันทึกเป็นรูป (SVG หายไป)');
  const viewBox = svgEl.viewBox?.baseVal;
  const rect = svgEl.getBoundingClientRect();
  const width = Math.round((viewBox?.width || rect.width) || 0);
  const height = Math.round((viewBox?.height || rect.height) || 0);
  if (!width || !height) throw new Error('แผนภาพยังไม่มีขนาด — รอสักครู่แล้วลองใหม่');

  const clone = svgEl.cloneNode(true);

  /* 1. Freeze the computed look onto the clone. */
  const sourceNodes = [svgEl, ...svgEl.querySelectorAll('*')];
  const cloneNodes = [clone, ...clone.querySelectorAll('*')];
  const properties = [
    'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity',
    'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'opacity',
    'font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing',
    'text-anchor', 'dominant-baseline', 'paint-order', 'visibility', 'display'
  ];
  sourceNodes.forEach((node, i) => {
    const target = cloneNodes[i];
    if (!target?.style) return;
    const computed = window.getComputedStyle(node);
    for (const property of properties) {
      const value = computed.getPropertyValue(property);
      if (value) target.style.setProperty(property, value);
    }
  });

  /* 2. Inline the avatar photos (same-origin or CORS) so the canvas is untainted. */
  const sourceImages = [...svgEl.querySelectorAll('image')];
  const cloneImages = [...clone.querySelectorAll('image')];
  await Promise.all(cloneImages.map(async (image, i) => {
    const href = sourceImages[i]?.getAttribute('href') || sourceImages[i]?.getAttribute('xlink:href') || '';
    const dataUrl = await hrefToDataUrl(href);
    if (dataUrl) {
      image.setAttribute('href', dataUrl);
      image.removeAttribute('xlink:href');
    } else {
      // Better a cut-out than a broken/tainted export: the coloured avatar circle
      // is still underneath, so the person keeps their identity on the drawing.
      image.remove();
    }
  }));

  /* 2b. Carry the fonts with the drawing. A standalone SVG is rendered without
     the page's webfonts, so a device with no Thai system font (and every headless
     renderer) turns every label into ▯▯▯. The .woff2 files are same-origin, so the
     faces the labels actually need are embedded as data URLs. */
  await embedSvgFonts(svgEl, clone);

  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));

  /* 3. Draw the serialised drawing onto a canvas and download it. */
  const markup = new XMLSerializer().serializeToString(clone);
  const blobUrl = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    image.decoding = 'sync';
    await new Promise((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('วาดแผนภาพเป็นรูปไม่สำเร็จ — ลองใหม่'));
      image.src = blobUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('เบราว์เซอร์นี้สร้างรูปไม่ได้');
    if (background && background !== 'rgba(0, 0, 0, 0)' && background !== 'transparent') {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    downloadCanvas(canvas, filename);
    return canvas;
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

/**
 * Embed the @font-face subsets a drawing needs, as data URLs, inside the clone.
 * Only faces whose `unicode-range` covers a character that actually appears in
 * the drawing are inlined, so a Thai diagram carries the Thai + latin + symbol
 * subsets and nothing else.
 */
async function embedSvgFonts(sourceSvg, cloneSvg) {
  const textNodes = [...sourceSvg.querySelectorAll('text')];
  if (!textNodes.length) return;
  const codepoints = new Set();
  for (const node of textNodes) for (const char of node.textContent || '') codepoints.add(char.codePointAt(0));
  const families = new Set();
  const stacks = new Map();
  for (const node of textNodes) {
    const stack = window.getComputedStyle(node).fontFamily || '';
    stacks.set(node, stack);
    for (const family of stack.split(',')) families.add(family.trim().replace(/^["']|["']$/g, '').toLowerCase());
  }

  const faces = [];
  for (const sheet of [...document.styleSheets]) {
    let rules;
    try { rules = sheet.cssRules; } catch { continue; }   // cross-origin sheet
    for (const rule of rules || []) {
      if (!/^@font-face/i.test(rule.cssText || '')) continue;
      const css = rule.cssText;
      const family = (/font-family:\s*([^;]+);/i.exec(css)?.[1] || '').trim().replace(/^["']|["']$/g, '').toLowerCase();
      if (!family || !families.has(family)) continue;
      const range = /unicode-range:\s*([^;}]+)/i.exec(css)?.[1]?.trim();
      if (range && !unicodeRangeMatches(range, codepoints)) continue;
      const href = /url\(\s*['"]?([^'")]+)['"]?\s*\)/i.exec(/src:\s*([^;}]+)/i.exec(css)?.[1] || '')?.[1];
      if (!href) continue;
      const dataUrl = await hrefToDataUrl(new URL(href, sheet.href || location.href).href);
      if (!dataUrl) continue;
      const weight = /font-weight:\s*([^;}]+)/i.exec(css)?.[1]?.trim() || '400';
      const style = /font-style:\s*([^;}]+)/i.exec(css)?.[1]?.trim() || 'normal';
      faces.push(`@font-face{font-family:'${family}';font-style:${style};font-weight:${weight};src:url(${dataUrl}) format('woff2');${range ? `unicode-range:${range};` : ''}}`);
    }
  }
  if (!faces.length) return;
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = faces.join('\n');
  cloneSvg.insertBefore(style, cloneSvg.firstChild);
}

/** Does an @font-face `unicode-range` value cover any of `codepoints`? */
function unicodeRangeMatches(range, codepoints) {
  const parts = String(range).split(',').map(part => part.trim()).filter(Boolean);
  if (!parts.length) return true;
  for (const part of parts) {
    const match = /^u\+([0-9a-f?]+)(?:-([0-9a-f]+))?$/i.exec(part);
    if (!match) continue;
    const start = match[1].includes('?')
      ? parseInt(match[1].replace(/\?/g, '0'), 16)
      : parseInt(match[1], 16);
    const end = match[1].includes('?')
      ? parseInt(match[1].replace(/\?/g, 'F'), 16)
      : (match[2] ? parseInt(match[2], 16) : start);
    for (const code of codepoints) if (code >= start && code <= end) return true;
  }
  return false;
}

/** Same-origin / CORS image → data URL (null when it cannot be read). */
async function hrefToDataUrl(href) {
  if (!href) return null;
  if (href.startsWith('data:')) return href;
  try {
    const response = await fetch(href, { mode: 'cors', credentials: 'omit' });
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function exportToPdf(elementId, filename = 'export.pdf', orientation = 'portrait') {
  const el = resolveTarget(elementId);
  if (!el) throw new Error('ไม่พบเนื้อหาที่จะบันทึกเป็น PDF (element หายไป)');

  const [html2canvas, jspdfMod] = await Promise.all([
    loadHtml2Canvas(),
    import('https://esm.sh/jspdf@2.5.2')
  ]);
  const { jsPDF } = jspdfMod;

  const restoreFlat = applyFlatMode(el);
  await nextFrame();
  const restore = sanitizeColorsForExport(el);
  try {
    const canvas = await html2canvas(el, baseOptions(el));
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({ orientation, unit: 'px', format: [canvas.width, canvas.height] });
    pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
    pdf.save(filename);
  } finally {
    restore();
    restoreFlat();
  }
}

export function copyExpenseAsLineText(expense, membersMap) {
  const payer = { displayName: expensePayments(expense).map(p => `${membersMap[p.memberId]?.displayName || p.memberId}: ${formatCurrency(p.amountMinor, expense.currency)}`).join(', ') };
  const baht = toThbMinor(expense.netTotalMinor, expense.currency, expense.thbRate);
  const total = (expense.currency !== 'THB' && baht != null ? `${formatCurrency(baht, 'THB')} (≈ ${formatCurrency(expense.netTotalMinor, expense.currency)})` : formatCurrency(expense.netTotalMinor, expense.currency));
  const allocText = (expense.allocations || []).map(a => {
    const m = membersMap[a.memberId] || { displayName: a.memberId };
    return `${m.displayName}: ${formatCurrency(a.amountMinor, expense.currency)}`;
  }).join(', ');
  const text = `💰 ${expense.title} - ${total}\nจ่ายโดย: ${payer.displayName}\nแบ่ง: ${allocText}\nวันที่: ${expense.date}`;
  return text;
}

export function copySettlementAsLineText(transactions, membersMap, currency = 'THB') {
  return transactions.map(t => {
    const from = membersMap[t.from]?.displayName || t.from;
    const to = membersMap[t.to]?.displayName || t.to;
    const amt = formatCurrency(t.amountMinor, currency);
    return `${from} → ${to}: ${amt}`;
  }).join('\n');
}
