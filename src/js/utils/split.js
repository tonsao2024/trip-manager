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
    if (!Number.isSafeInteger(a.amountMinor) || a.amountMinor < 0) return { valid: false, error: 'Invalid allocation amount' };
  }
  const sum = allocations.reduce((s, a) => s + a.amountMinor, 0);
  if (sum !== totalMinor) return { valid: false, error: `Sum ${sum} != total ${totalMinor}` };
  return { valid: true };
}

/** Exact minor-unit custom split. Empty inputs share the remainder, not errors.
 * Each adjustment is apportioned separately so the displayed breakdown adds up.
 */
export function splitCustom({ subtotalMinor, netTotalMinor, discountMinor = 0, serviceMinor = 0, taxMinor = 0, includesAdjustments = true, entries }) {
  const target = includesAdjustments ? netTotalMinor : subtotalMinor;
  const filled = entries.filter(e => e.amountMinor != null);
  const empty = entries.filter(e => e.amountMinor == null);
  const enteredMinor = filled.reduce((n, e) => n + e.amountMinor, 0);
  const differenceMinor = target - enteredMinor;
  const valid = entries.length > 0 && filled.every(e => Number.isSafeInteger(e.amountMinor) && e.amountMinor >= 0)
    && differenceMinor >= 0 && (empty.length > 0 || differenceMinor === 0);
  const auto = new Map(splitEqual(Math.max(0, differenceMinor), empty.map(e => e.memberId)).map(e => [e.memberId, e.amountMinor]));
  const bases = entries.map(e => ({ memberId: e.memberId, amountMinor: e.amountMinor ?? auto.get(e.memberId) ?? 0 }));
  const sum = bases.reduce((n, e) => n + e.amountMinor, 0);
  // Largest remainder: deterministic, non-negative, and exact to the last cent.
  const distribute = total => {
    if (!sum) return bases.map(() => 0);
    const raw = bases.map(e => total * e.amountMinor / sum);
    const values = raw.map(Math.floor);
    const order = raw.map((n, i) => ({ i, fraction: n - values[i] })).sort((a, b) => b.fraction - a.fraction || a.i - b.i);
    for (let n = 0, left = total - values.reduce((a, b) => a + b, 0); n < left; n++) values[order[n % order.length].i]++;
    return values;
  };
  const discounts = distribute(discountMinor), services = distribute(serviceMinor), taxes = distribute(taxMinor);
  const rows = bases.map((e, i) => ({ memberId: e.memberId, subtotalMinor: e.amountMinor,
    discountMinor: includesAdjustments ? 0 : discounts[i],
    serviceMinor: includesAdjustments ? 0 : services[i],
    taxMinor: includesAdjustments ? 0 : taxes[i],
    amountMinor: includesAdjustments ? e.amountMinor : e.amountMinor - discounts[i] + services[i] + taxes[i]
  }));
  return { valid: valid && rows.every(e => e.amountMinor >= 0) && rows.reduce((n, e) => n + e.amountMinor, 0) === netTotalMinor,
    enteredMinor, differenceMinor, unfilledCount: empty.length, rows };
}
