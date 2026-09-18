export async function exportToPng(elementId, filename = 'export.png') {
  const [{ default: html2canvas }] = await Promise.all([
    import('https://esm.sh/html2canvas@1.4.1')
  ]);
  const el = document.getElementById(elementId);
  if (!el) throw new Error('Element not found');
  const canvas = await html2canvas(el, { backgroundColor: null, scale: 2, useCORS: true });
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

export async function exportToPdf(elementId, filename = 'export.pdf', orientation = 'portrait') {
  const [html2canvasMod, jspdfMod] = await Promise.all([
    import('https://esm.sh/html2canvas@1.4.1'),
    import('https://esm.sh/jspdf@2.5.2')
  ]);
  const html2canvas = html2canvasMod.default;
  const { jsPDF } = jspdfMod;
  const el = document.getElementById(elementId);
  if (!el) throw new Error('Element not found');
  const canvas = await html2canvas(el, { backgroundColor: '#ffffff', scale: 2, useCORS: true });
  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({ orientation, unit: 'px', format: [canvas.width, canvas.height] });
  pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
  pdf.save(filename);
}

export function copyExpenseAsLineText(expense, membersMap) {
  const payer = membersMap[expense.payerId] || { displayName: 'Unknown' };
  const total = (expense.netTotalMinor / 100).toFixed(2);
  const allocText = (expense.allocations || []).map(a => {
    const m = membersMap[a.memberId] || { displayName: a.memberId };
    return `${m.displayName}: ${(a.amountMinor/100).toFixed(2)}`;
  }).join(', ');
  const text = `💰 ${expense.title} - ${total} ${expense.currency}\nจ่ายโดย: ${payer.displayName}\nแบ่ง: ${allocText}\nวันที่: ${expense.date}`;
  return text;
}

export function copySettlementAsLineText(transactions, membersMap, currency = 'THB') {
  return transactions.map(t => {
    const from = membersMap[t.from]?.displayName || t.from;
    const to = membersMap[t.to]?.displayName || t.to;
    const amt = (t.amountMinor/100).toFixed(2);
    return `${from} → ${to}: ${amt} ${currency}`;
  }).join('\n');
}
