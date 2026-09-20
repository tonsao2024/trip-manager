// Export helpers — PNG / PDF / clipboard text.
// html2canvas cannot parse modern color functions (color-mix, oklch, …), so every
// export first swaps them for rgb()/rgba() equivalents via sanitizeColorsForExport().
import { sanitizeColorsForExport } from '../utils/colors.js';

function downloadCanvas(canvas, filename) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function loadHtml2Canvas() {
  const mod = await import('https://esm.sh/html2canvas@1.4.1');
  return mod.default || mod;
}

function isOpaque(color) {
  if (!color || color === 'transparent') return false;
  const m = String(color).match(/rgba?\(([^)]+)\)/i);
  if (!m) return true;
  const parts = m[1].split(/[,\s/]+/).filter(Boolean);
  if (parts.length < 4) return true;
  const alpha = parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
  return !(alpha < 0.999);
}

/**
 * Render an element to a PNG file download.
 * @param {string} elementId
 * @param {string} filename
 * @param {{scale?:number, backgroundColor?:string|null}} [options]
 */
export async function exportToPng(elementId, filename = 'export.png', options = {}) {
  const el = document.getElementById(elementId);
  if (!el) throw new Error('ไม่พบเนื้อหาที่จะบันทึกเป็นรูป (element หายไป)');

  let html2canvas;
  try {
    html2canvas = await loadHtml2Canvas();
  } catch (e) {
    throw new Error('โหลดตัวสร้างรูปไม่สำเร็จ (ตรวจสอบอินเทอร์เน็ต): ' + (e?.message || e));
  }

  const restore = sanitizeColorsForExport(el);
  try {
    const bodyBg = getComputedStyle(document.body).backgroundColor;
    const canvas = await html2canvas(el, {
      scale: options.scale || 2,
      useCORS: true,
      allowTaint: false,
      logging: false,
      backgroundColor: options.backgroundColor !== undefined
        ? options.backgroundColor
        : (isOpaque(bodyBg) ? bodyBg : null),
      windowWidth: Math.max(el.scrollWidth, el.clientWidth, 320),
      scrollX: 0,
      scrollY: -window.scrollY
    });
    downloadCanvas(canvas, filename);
    return canvas;
  } catch (e) {
    const message = String(e?.message || e);
    if (/unsupported color function/i.test(message)) {
      throw new Error('ส่งออกรูปไม่สำเร็จ: เบราว์เซอร์ยังไม่รองรับเฉดสีบางแบบ — ลองอัปเดตเบราว์เซอร์ หรือใช้ปุ่ม "พิมพ์ / PDF" แทน');
    }
    throw new Error('ส่งออกรูปไม่สำเร็จ: ' + message);
  } finally {
    restore();
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

  const restore = sanitizeColorsForExport(el);
  try {
    const canvas = await html2canvasMod(el, {
      backgroundColor: '#ffffff', scale: 2, useCORS: true, logging: false,
      windowWidth: Math.max(el.scrollWidth, el.clientWidth, 320)
    });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({ orientation, unit: 'px', format: [canvas.width, canvas.height] });
    pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
    pdf.save(filename);
  } finally {
    restore();
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
