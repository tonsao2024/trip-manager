// Export helpers — PNG / PDF / clipboard text.
//
// html2canvas 1.4.x does not understand modern color syntax (color-mix, oklch,
// and the `color(srgb …)` form Chromium computes them to), so every export:
//   1. swaps computed colors for rgb()/rgba() (sanitizeColorsForExport),
//   2. resolves the canvas background colour instead of passing a computed string,
//   3. retries with a flat palette (hardPlainPalette) if html2canvas still complains.
// Together those three steps remove the whole class of "ส่งออกรูปไม่สำเร็จ" errors.
import { sanitizeColorsForExport, hardPlainPalette, resolveSafeBackgroundColor } from '../utils/colors.js';

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

/**
 * Render an element to a PNG file download.
 * @param {string} elementId
 * @param {string} filename
 * @param {{scale?:number, backgroundColor?:string|null, flat?:boolean}} [options]
 *   `flat` (default true for receipts) repaints the subtree in plain colours so
 *   html2canvas has nothing modern to parse — the safest possible export.
 */
export async function exportToPng(elementId, filename = 'export.png', options = {}) {
  let el = document.getElementById(elementId);
  if (!el && options.fallbackSelector) el = document.querySelector(options.fallbackSelector);
  if (!el) throw new Error('ไม่พบเนื้อหาที่จะบันทึกเป็นรูป (element หายไป)');

  const restoreFlat = options.flat !== false ? applyFlatMode(el) : () => {};
  // Let the browser apply the flat styles before html2canvas reads them.
  await new Promise(r => requestAnimationFrame(() => r()));

  let html2canvas;
  try {
    html2canvas = await loadHtml2Canvas();
  } catch (e) {
    restoreFlat();
    throw new Error('โหลดตัวสร้างรูปไม่สำเร็จ (ตรวจสอบอินเทอร์เน็ต): ' + (e?.message || e));
  }

  const readOptions = () => ({
    scale: options.scale || 2,
    useCORS: true,
    allowTaint: false,
    logging: false,
    // NEVER hand html2canvas a computed color string: Chromium serialises
    // color-mix() as `color(srgb …)` and html2canvas throws on it.
    backgroundColor: resolveSafeBackgroundColor(document.body),
    windowWidth: Math.max(el.scrollWidth, el.clientWidth, 320),
    scrollX: 0,
    scrollY: -window.scrollY
  });

  const restore = sanitizeColorsForExport(el);
  try {
    const canvas = await html2canvas(el, readOptions());
    downloadCanvas(canvas, filename);
    return canvas;
  } catch (e) {
    const message = String(e?.message || e);
    if (!/unsupported color function|color function|parse color/i.test(message)) {
      throw new Error('ส่งออกรูปไม่สำเร็จ: ' + message);
    }
    // Retry once with the flat palette — this removes gradients, shadows and
    // filters entirely, so no colour syntax can survive to break the capture.
    const restoreHard = hardPlainPalette(el);
    try {
      const canvas = await html2canvas(el, readOptions());
      downloadCanvas(canvas, filename);
      return canvas;
    } catch (e2) {
      throw new Error('ส่งออกรูปไม่สำเร็จ: ' + (e2?.message || e2) + ' — ลองใหม่ หรือใช้ปุ่ม "พิมพ์ / PDF" แทน');
    } finally {
      restoreHard();
    }
  } finally {
    restore();
    restoreFlat();
  }
}

/**
 * Same pipeline as exportToPng but returns the canvas instead of downloading —
 * used by the "share receipt" button (Web Share API needs a blob).
 */
export async function exportToPngToCanvas(elementId) {
  const el = document.getElementById(elementId);
  if (!el) throw new Error('ไม่พบเนื้อหาที่จะบันทึกเป็นรูป (element หายไป)');
  const html2canvas = await loadHtml2Canvas();
  const restoreFlat = applyFlatMode(el);
  await new Promise(r => requestAnimationFrame(() => r()));
  const restore = sanitizeColorsForExport(el);
  try {
    return await html2canvas(el, {
      scale: 2, useCORS: true, allowTaint: false, logging: false,
      backgroundColor: resolveSafeBackgroundColor(document.body),
      windowWidth: Math.max(el.scrollWidth, el.clientWidth, 320)
    });
  } finally {
    restore();
    restoreFlat();
  }
}

export async function exportToPdf(elementId, filename = 'export.pdf', orientation = 'portrait') {
  const el = document.getElementById(elementId);
  if (!el) throw new Error('ไม่พบเนื้อหาที่จะบันทึกเป็น PDF (element หายไป)');

  const [html2canvasMod, jspdfMod] = await Promise.all([
    loadHtml2Canvas(),
    import('https://esm.sh/jspdf@2.5.2')
  ]);
  const { jsPDF } = jspdfMod;

  const restoreFlat = applyFlatMode(el);
  await new Promise(r => requestAnimationFrame(() => r()));
  const restore = sanitizeColorsForExport(el);
  try {
    const canvas = await html2canvasMod(el, {
      backgroundColor: resolveSafeBackgroundColor(document.body, window),
      scale: 2, useCORS: true, logging: false,
      windowWidth: Math.max(el.scrollWidth, el.clientWidth, 320)
    });
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
