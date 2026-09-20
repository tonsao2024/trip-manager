// Boots the app inside the mobile-layout check page.
//
// It is the browser twin of tests/smoke/run.mjs: the same Firestore/auth stubs
// are seeded with a small trip and the real app is imported, so the phone check
// renders the *real* screens with the *real* CSS instead of a mock-up.
//
// Exposed to the check script:
//   window.__mobile.ready        → the app has rendered something
//   window.__mobile.goto(hash)   → navigate and wait for the page to settle
// The lucide icon font is a CDN script the sandbox cannot reach; this stand-in
// swaps every <i data-lucide="…"> for a plain square glyph so the screenshots
// show real buttons with real sizes (the app's own logic is untouched).
window.lucide = {
  icons: new Proxy({}, { has: () => true, get: () => true }),
  createIcons() {
    for (const i of document.querySelectorAll('i[data-lucide]')) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '2');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('data-lucide', i.getAttribute('data-lucide'));
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', '4'); rect.setAttribute('y', '4');
      rect.setAttribute('width', '16'); rect.setAttribute('height', '16');
      rect.setAttribute('rx', '4');
      svg.appendChild(rect);
      if (i.getAttribute('class')) svg.setAttribute('class', i.getAttribute('class'));
      i.replaceWith(svg);
    }
  }
};

import * as fsdb from '/tests/smoke/stubs/firebase-firestore.mjs';
import * as authStub from '/tests/smoke/stubs/firebase-auth.mjs';

const now = { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 };
const start = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
const end = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
const day2 = new Date(Date.now() + 11 * 86400000).toISOString().slice(0, 10);

const TRIP = {
  name: 'ทริปฟูจิ 2027', description: 'ครอบครัว', country: 'Japan', city: 'Kawaguchiko',
  startDate: start, endDate: end, baseCurrency: 'JPY', exchangeRateToTHB: 0.24,
  budgetTotal: 30000000, memberUids: ['u1', 'u2', 'u3'],
  createdBy: 'u1', inviteCode: 'FUJI23', status: 'active', createdAt: now
};

fsdb.__seed('trips/t1', TRIP);
fsdb.__seed('users/u1', { displayName: 'สมชาย', email: 'admin@test.com', role: 'super_admin' });
fsdb.__seed('trips/t1/members/u1', { displayName: 'สมชาย วัฒนากุล', username: 'admin', role: 'trip_admin', color: '#8bb89a', status: 'active', permissions: { canEditItinerary: true, canEditExpense: true, canManageMembers: true }, createdAt: now });
fsdb.__seed('trips/t1/members/u2', { displayName: 'นุ่น', username: 'nun', role: 'member', color: '#e0a17a', status: 'active', permissions: { canEditItinerary: true, canEditExpense: true }, createdAt: now });
fsdb.__seed('trips/t1/members/u3', { displayName: 'คุณแม่', username: 'mom', role: 'member', color: '#a0a0b5', status: 'active', permissions: { canEditItinerary: true, canEditExpense: true }, createdAt: now });

// A deliberately long name/email: phone layouts must truncate these, never
// let them widen the page (the user reported names cut off on a phone).
fsdb.__seed('trips/t1/members/u4', {
  displayName: 'พระมหาสมชาย วัฒนากุลย์ ศรีสุวรรณภูมิ (คุณลุงผู้ใจดีมาก)',
  email: 'somchai.wattanakul.srisuwarnphum@example.com',
  username: 'uncle', role: 'member', color: '#8aa8b5', status: 'active',
  permissions: { canEditItinerary: true, canEditExpense: true }, createdAt: now
});
TRIP.memberUids.push('u4');

fsdb.__seed('trips/t1/itineraryItems/i1', {
  title: 'ทะเลสาบคาวากุจิ', date: start, startAt: new Date(`${start}T09:00:00+09:00`),
  durationMinutes: 120, order: 0, category: 'sightseeing', status: 'planned',
  address: 'Kawaguchiko, Yamanashi', coordinates: '35.5171,138.7519',
  estimateAmount: 2500, estimateCurrency: 'JPY', estimateCategory: 'ticket', estimatePayerId: 'u1',
  notes: 'จองเรือก่อน 1 วัน', createdAt: now
});
fsdb.__seed('trips/t1/itineraryItems/i2', {
  title: 'วัดโอชิโนะฮัคไก', date: start, startAt: new Date(`${start}T13:00:00+09:00`),
  durationMinutes: 90, order: 1, category: 'temple', status: 'planned',
  coordinates: '35.5016,138.7552', estimateAmount: 1000, estimateCurrency: 'JPY', createdAt: now
});
fsdb.__seed('trips/t1/itineraryItems/i3', {
  title: 'ชมพระอาทิตย์ขึ้นที่ทะเลสาบ', date: day2, startAt: new Date(`${day2}T05:30:00+09:00`),
  durationMinutes: 60, order: 0, category: 'sightseeing', status: 'planned',
  coordinates: '35.5100,138.7600', createdAt: now
});

const exp = (id, data) => fsdb.__seed(`trips/t1/expenses/${id}`, {
  currency: 'JPY', baseCurrency: 'THB', thbRate: 0.24, status: 'active', source: 'manual',
  discountMinor: 0, serviceMinor: 0, taxMinor: 0, cardFeeMinor: 0, createdAt: now, ...data
});
exp('e1', {
  title: 'โรงแรมฟูจิวิว', date: start, category: 'stay', subtotalMinor: 32000, netTotalMinor: 32000,
  thbMinor: 7680, isEstimated: false, estimatedMinor: 0, actualMinor: 32000, paymentMethod: 'card',
  cardName: 'KBank Visa ••4321', payerId: 'u1', createdByName: 'สมชาย วัฒนากุล',
  allocations: [{ memberId: 'u1', amountMinor: 16000 }, { memberId: 'u2', amountMinor: 16000 }]
});
exp('e2', {
  title: 'ค่าตั๋วรถบัส', date: start, category: 'transport', subtotalMinor: 4400, netTotalMinor: 4400,
  thbMinor: 1056, isEstimated: false, actualMinor: 4400, paymentMethod: 'cash',
  payerId: 'u2', updatedByName: 'นุ่น', updatedAt: now,
  allocations: [{ memberId: 'u1', amountMinor: 2200 }, { memberId: 'u2', amountMinor: 2200 }]
});
exp('e3', {
  title: 'มื้อค่ำยากินิกุ', date: day2, category: 'food', subtotalMinor: 8600, netTotalMinor: 8600,
  thbMinor: 2064, isEstimated: true, estimatedMinor: 8600, actualMinor: 0, paymentMethod: 'cash',
  payerId: 'u3',
  allocations: [{ memberId: 'u1', amountMinor: 2867 }, { memberId: 'u2', amountMinor: 2867 }, { memberId: 'u3', amountMinor: 2866 }]
});

fsdb.__seed('trips/t1/comments/c1', {
  expenseId: 'e1', text: 'ราคานี้รวมอาหารเช้าหรือยัง?', uid: 'u2', name: 'นุ่น', createdAt: now
});
fsdb.__seed('trips/t1/activity/a1', {
  type: 'expense.create', targetId: 'e1', title: 'โรงแรมฟูจิวิว', detail: '¥32,000 • ' + start,
  uid: 'u1', name: 'สมชาย วัฒนากุล', at: now
});

await import('/tests/browser/out/app/app.js');

authStub.__emitAuth({ uid: 'u1', email: 'admin@test.com', displayName: 'สมชาย วัฒนากุล', photoURL: null });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const api = {
  ready: false,
  async goto(hash) {
    window.location.hash = hash;
    window.dispatchEvent(new window.Event('hashchange'));
    // Wait until the route actually painted instead of assuming a delay.
    const want = hash.split('?')[0].split('/').pop();
    for (let i = 0; i < 100; i++) {
      const app = document.getElementById('app');
      const painted = app && app.textContent.trim().length > 40 && !app.querySelector('.skeleton');
      if (painted) break;
      await sleep(60);
    }
    await sleep(400);
    return document.getElementById('app')?.textContent?.slice(0, 60);
  },
  /** Click something (a chip, a button) and wait for the UI to settle. */
  async tap(selector) {
    const el = document.querySelector(selector);
    if (!el) return false;
    el.click();
    await sleep(600);
    return true;
  },
  /** Open a bottom sheet / modal by clicking its trigger. */
  async sheet(selector) {
    return this.tap(selector);
  },
  /**
   * Every element that sticks out of the viewport (the usual cause of an
   * \"incomplete\" screen on a phone: the page can be dragged sideways).
   */
  overflow({ limit = 6 } = {}) {
    const vw = window.innerWidth;
    const bad = [];
    // An element inside a clipped or fixed ancestor (the ambient blobs, the
    // off-screen export sheet) cannot widen the page — skip those.
    const clipped = (el) => {
      for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') return true;
        if (cs.position === 'fixed') return true;
      }
      return false;
    };
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const over = Math.round(r.right - vw);
      if (over > 1 && !clipped(el)) {
        bad.push({
          sel: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + (el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : ''),
          over, width: Math.round(r.width), text: (el.textContent || '').trim().slice(0, 28)
        });
      }
    }
    bad.sort((a, b) => b.over - a.over);
    return {
      vw,
      // On mobile the browser widens the layout viewport when content is too
      // wide, which zooms the whole page out. Comparing it with clientWidth is
      // the exact "the screen is cut off" signal.
      layoutWidth: window.innerWidth,
      clientWidth: document.documentElement.clientWidth,
      docWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      bad: bad.slice(0, limit)
    };
  },
  /**
   * Phone-specific expectations:
   *  - the header keeps only the avatar (a long name used to widen the page),
   *  - toolbars stay on one row so the content below is reachable,
   *  - every name/label that could be long is truncated instead of overflowing.
   */
  audit() {
    const problems = [];
    const cs = (el) => getComputedStyle(el);
    const visible = (el) => !!el && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;

    const nameEl = document.getElementById('user-display-name');
    const avatarEl = document.getElementById('user-avatar-btn');
    const nameShown = nameEl && cs(nameEl).display !== 'none' && visible(nameEl);
    if (nameShown) problems.push('header still shows the user name/email (long names widen the phone layout)');
    if (!visible(avatarEl)) problems.push('header avatar is missing');

    for (const row of document.querySelectorAll('.btn-row, .chip-row')) {
      if (cs(row).flexWrap !== 'nowrap') continue;
      if (row.scrollHeight > row.clientHeight + 8) {
        problems.push(`toolbar wraps into several rows: ${(row.textContent || '').trim().slice(0, 30)}`);
      }
    }

    // Anything the user reads that can be long must truncate or wrap, never
    // spill out of its box (long names/emails were being cut off).
    for (const el of document.querySelectorAll('body *')) {
      if (el.children.length) continue;                       // leaf text nodes only
      const text = (el.textContent || '').trim();
      if (text.length < 4 || !visible(el)) continue;
      const style = cs(el);
      if (style.whiteSpace === 'nowrap' || style.textOverflow === 'ellipsis') continue;  // deliberate …
      if (['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowX)) continue;      // clipped on purpose
      if (el.scrollWidth > el.clientWidth + 2) {
        problems.push(`text overflows its box: "${text.slice(0, 24)}" (+${el.scrollWidth - el.clientWidth}px)`);
      }
      if (problems.length > 8) break;
    }
    return problems.slice(0, 8);
  }
};
window.__mobile = api;
api.ready = true;
