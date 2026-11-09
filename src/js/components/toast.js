// Toast v4 — quiet line icons; colour only for errors (v35 round 4)
import { escapeHtml } from '../utils/sanitize.js';

let container = null;

function ensureContainer() {
  if (container && document.body.contains(container)) return container;
  container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  return container;
}

// v35 round 4: one icon language with the rest of the app — 18px line icons
// (stroke 1.5, no tinted tile). Only an error is coloured; every other kind
// is quiet ink, so a toast never competes with the screen's one accent.
const svg = (body, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true"${extra}>${body}</svg>`;
const ICONS = {
  success: svg('<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>'),
  error: svg('<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>'),
  warning: svg('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
  loading: svg('<path d="M21 12a9 9 0 1 1-6.219-8.56"/>', ' class="toast-spin"'),
  info: svg('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>')
};

function createToast({ type = 'success', title, message, duration = 4000, retryFn, retryLabel = 'ลองอีกครั้ง' }) {
  const c = ensureContainer();
  const el = document.createElement('div');
  const kind = ICONS[type] ? type : 'success';
  el.className = `toast toast-${kind}`;
  el.setAttribute('role', kind === 'error' ? 'alert' : 'status');

  el.innerHTML = `
    <span class="toast-icon">${ICONS[kind]}</span>
    <div class="toast-body">
      ${title ? `<div class="toast-title">${escapeHtml(title)}</div>` : ''}
      <div class="toast-msg">${escapeHtml(message || '')}</div>
      ${retryFn ? `<button class="btn btn-sm btn-secondary toast-retry" data-retry>${escapeHtml(retryLabel)}</button>` : ''}
    </div>
    <button class="toast-close" aria-label="Close">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" width="16" height="16" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  `;

  const closeBtn = el.querySelector('.toast-close');
  const close = () => {
    el.style.animation = 'toastSlideOut 0.2s var(--ease) forwards';
    setTimeout(() => el.remove(), 200);
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
  error(msg, title = 'เกิดข้อผิดพลาด', retryFn, retryLabel = 'ลองอีกครั้ง') { return createToast({ type: 'error', title, message: msg, duration: 6000, retryFn, retryLabel }); },
  warning(msg, title = 'คำเตือน') { return createToast({ type: 'warning', title, message: msg, duration: 5000 }); },
  loading(msg, title = 'กำลังโหลด') { return createToast({ type: 'loading', title, message: msg, duration: 0 }); },
  info(msg, title = 'แจ้งเตือน') { return createToast({ type: 'info', title, message: msg }); }
};
