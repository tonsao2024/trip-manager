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
  const payer = membersMap[expense.payerId] || { displayName: 'Unknown' };
  const total = (expense.netTotalMinor / 100).toFixed(2);
  const allocText = (expense.allocations || []).map(a => {
    const m = membersMap[a.memberId] || { displayName: a.memberId };
    return `${m.displayName}: ${(a.amountMinor / 100).toFixed(2)}`;
  }).join(', ');
  const text = `💰 ${expense.title} - ${total} ${expense.currency}\nจ่ายโดย: ${payer.displayName}\nแบ่ง: ${allocText}\nวันที่: ${expense.date}`;
  return text;
}

export function copySettlementAsLineText(transactions, membersMap, currency = 'THB') {
  return transactions.map(t => {
    const from = membersMap[t.from]?.displayName || t.from;
    const to = membersMap[t.to]?.displayName || t.to;
    const amt = (t.amountMinor / 100).toFixed(2);
    return `${from} → ${to}: ${amt} ${currency}`;
  }).join('\n');
}
