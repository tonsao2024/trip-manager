import { calculateNetBalances, minimizeTransactions, calculateSettlement } from '../../src/js/utils/settlement.js';

function assert(cond, msg) { if (!cond) throw new Error(msg); }

export function testSettlement() {
  console.log('Testing settlement...');

  const members = [{id:'a'},{id:'b'},{id:'c'}];
  const expenses = [
    { payerId:'a', netTotalMinor:300, allocations:[{memberId:'a', amountMinor:100},{memberId:'b', amountMinor:100},{memberId:'c', amountMinor:100}] },
    { payerId:'b', netTotalMinor:150, allocations:[{memberId:'a', amountMinor:50},{memberId:'b', amountMinor:50},{memberId:'c', amountMinor:50}] }
  ];

  const balances = calculateNetBalances(expenses, members);
  const aBal = balances.find(b=>b.memberId==='a').net;
  assert(aBal===150, `A should be +150, got ${aBal}`);
  console.log('✓ calculateNetBalances');

  const tx = minimizeTransactions(balances);
  assert(tx.length<=2, 'Should minimize to <=2 transactions');
  const sumTx = tx.reduce((s,t)=>s+t.amountMinor,0);
  const sumDebt = balances.filter(b=>b.net<0).reduce((s,b)=>s+(-b.net),0);
  assert(sumTx===sumDebt, 'Tx sum should equal debt');
  console.log('✓ minimizeTransactions');

  const full = calculateSettlement(expenses, members);
  assert(full.transactions.length>0, 'Should have transactions');
  console.log('✓ calculateSettlement');

  console.log('All settlement tests passed');
}
