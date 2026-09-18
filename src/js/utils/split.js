/**
 * Bill splitting algorithms - critical logic, unit tested
 */

export function splitEqual(totalMinor, memberIds) {
  if (!memberIds?.length) return [];
  const count = memberIds.length;
  const base = Math.floor(totalMinor / count);
  let remainder = totalMinor - base * count;
  // Distribute remainder 1 minor unit to first N members (deterministic)
  return memberIds.map((id, idx) => ({
    memberId: id,
    amountMinor: base + (idx < remainder ? 1 : 0)
  }));
}

export function splitUnequal(totalMinor, allocations) {
  // allocations: [{ memberId, amountMinor, locked }]
  const sum = allocations.reduce((s, a) => s + (a.amountMinor || 0), 0);
  if (sum !== totalMinor) throw new Error(`Allocation sum ${sum} != total ${totalMinor}`);
  return allocations;
}

export function splitPercentage(totalMinor, percents) {
  // percents: [{ memberId, percent }]
  const sumPct = percents.reduce((s, p) => s + p.percent, 0);
  if (Math.abs(sumPct - 100) > 0.01) throw new Error('Percent sum must be 100');
  let allocated = 0;
  const result = percents.map((p, idx) => {
    if (idx === percents.length - 1) {
      return { memberId: p.memberId, amountMinor: totalMinor - allocated };
    }
    const amt = Math.round(totalMinor * (p.percent / 100));
    allocated += amt;
    return { memberId: p.memberId, amountMinor: amt };
  });
  // Adjust rounding to match total
  const diff = totalMinor - result.reduce((s, r) => s + r.amountMinor, 0);
  if (diff !== 0) result[result.length - 1].amountMinor += diff;
  return result;
}

export function splitShares(totalMinor, shares) {
  // shares: [{ memberId, shares: number }]
  const totalShares = shares.reduce((s, x) => s + x.shares, 0);
  if (totalShares <= 0) throw new Error('Total shares must be >0');
  let allocated = 0;
  const result = shares.map((x, idx) => {
    if (idx === shares.length - 1) {
      return { memberId: x.memberId, amountMinor: totalMinor - allocated };
    }
    const amt = Math.round(totalMinor * (x.shares / totalShares));
    allocated += amt;
    return { memberId: x.memberId, amountMinor: amt };
  });
  const diff = totalMinor - result.reduce((s, r) => s + r.amountMinor, 0);
  if (diff !== 0) result[result.length - 1].amountMinor += diff;
  return result;
}

export function splitItemized(lineItems, adjustments = { serviceMinor: 0, discountMinor: 0, taxMinor: 0 }) {
  // lineItems: [{ name, quantity, unitPriceMinor, memberIds, splitMethod }]
  // For each line, allocate to members
  const memberTotals = new Map();
  for (const line of lineItems) {
    const lineTotal = line.quantity * line.unitPriceMinor;
    const splits = splitEqual(lineTotal, line.memberIds);
    for (const s of splits) {
      memberTotals.set(s.memberId, (memberTotals.get(s.memberId) || 0) + s.amountMinor);
    }
  }
  // Distribute adjustments proportionally
  const grand = Array.from(memberTotals.values()).reduce((a,b)=>a+b,0);
  if (grand === 0) return [];
  const { serviceMinor, discountMinor, taxMinor } = adjustments;
  const totalAdj = serviceMinor + taxMinor - discountMinor;
  if (totalAdj !== 0) {
    for (const [mid, amt] of memberTotals.entries()) {
      const adj = Math.round(totalAdj * (amt / grand));
      memberTotals.set(mid, amt + adj);
    }
    // Fix rounding
    const newGrand = Array.from(memberTotals.values()).reduce((a,b)=>a+b,0);
    const expected = grand + totalAdj;
    const diff = expected - newGrand;
    if (diff !== 0) {
      const firstKey = memberTotals.keys().next().value;
      memberTotals.set(firstKey, memberTotals.get(firstKey) + diff);
    }
  }
  return Array.from(memberTotals.entries()).map(([memberId, amountMinor]) => ({ memberId, amountMinor }));
}

export function validateAllocations(totalMinor, allocations) {
  if (!allocations?.length) return { valid: false, error: 'No allocations' };
  for (const a of allocations) {
    if (a.amountMinor < 0) return { valid: false, error: 'Negative allocation' };
  }
  const sum = allocations.reduce((s, a) => s + a.amountMinor, 0);
  if (sum !== totalMinor) return { valid: false, error: `Sum ${sum} != total ${totalMinor}` };
  return { valid: true };
}
