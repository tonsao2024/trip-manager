import { escapeHtml } from '../utils/sanitize.js';

let container = null;

function ensureContainer() {
  if (container) return container;
  container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  return container;
}

function createToast({ type = 'success', title, message, duration = 4000, retryFn }) {
  const c = ensureContainer();
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : '⏳';
  const fujiIcon = type === 'loading' ? `<div class="fuji-mascot loading" style="width:28px;height:28px;"><svg viewBox="0 0 100 60" width="28" height="28"><path d="M10 60 L50 5 L90 60 Z" fill="url(#fujiGrad)"/><defs><linearGradient id="fujiGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#60a5fa"/><stop offset="100%" stop-color="#ec4899"/></linearGradient></defs></svg><div class="fuji-loading-snow" style="margin-top:4px;"></div></div>` : '';

  el.innerHTML = `
    <div style="font-size:20px;flex-shrink:0;">${type === 'loading' ? fujiIcon : icon}</div>
    <div style="flex:1;min-width:0;">
      ${title ? `<div style="font-weight:700;font-size:14px;margin-bottom:2px;">${escapeHtml(title)}</div>` : ''}
      <div style="font-size:13px;color:var(--text-secondary);line-height:1.4;">${escapeHtml(message || '')}</div>
      ${retryFn ? `<button class="btn btn-sm btn-secondary" style="margin-top:8px;" data-retry>Retry</button>` : ''}
    </div>
    <button style="background:none;border:none;cursor:pointer;color:var(--text-tertiary);font-size:18px;line-height:1;" aria-label="Close">×</button>
  `;

  const closeBtn = el.querySelector('button[aria-label="Close"]');
  const close = () => {
    el.style.animation = 'toastSlideOut 0.25s ease forwards';
    setTimeout(() => el.remove(), 220);
  };
  closeBtn.onclick = close;
  const retryBtn = el.querySelector('[data-retry]');
  if (retryBtn) retryBtn.onclick = () => { retryFn(); close(); };

  c.appendChild(el);
  if (type !== 'loading' && duration > 0) {
    setTimeout(close, duration);
  }
  return { close, element: el };
}

export const toast = {
  success(msg, title = 'สำเร็จ') { return createToast({ type: 'success', title, message: msg }); },
  error(msg, title = 'เกิดข้อผิดพลาด', retryFn) { return createToast({ type: 'error', title, message: msg, duration: 6000, retryFn }); },
  warning(msg, title = 'คำเตือน') { return createToast({ type: 'warning', title, message: msg, duration: 5000 }); },
  loading(msg, title = 'กำลังโหลด') { return createToast({ type: 'loading', title, message: msg, duration: 0 }); },
  info(msg, title = 'แจ้งเตือน') { return createToast({ type: 'success', title, message: msg }); }
};
