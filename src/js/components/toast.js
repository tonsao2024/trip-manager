// Toast v3 — clean SVG icons, theme-aware colors
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

const ICONS = {
  success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><circle cx="12" cy="12" r="10" opacity=".25" fill="currentColor" stroke="none"/><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
  warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  loading: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" width="20" height="20" class="animate-spin-slow" style="animation: spinFast .9s linear infinite;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`,
  info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`
};

const ICON_COLORS = {
  success: 'var(--success)',
  error: 'var(--danger)',
  warning: 'var(--warning)',
  loading: 'var(--primary)',
  info: 'var(--info)'
};

function createToast({ type = 'success', title, message, duration = 4000, retryFn }) {
  const c = ensureContainer();
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;

  el.innerHTML = `
    <div class="toast-icon" style="color:${ICON_COLORS[type] || ICON_COLORS.success};flex-shrink:0;display:grid;place-items:center;width:34px;height:34px;border-radius:12px;background:color-mix(in srgb, ${ICON_COLORS[type] || ICON_COLORS.success} 14%, transparent);">
      ${ICONS[type] || ICONS.success}
    </div>
    <div style="flex:1;min-width:0;">
      ${title ? `<div style="font-weight:700;font-size:13px;margin-bottom:1px;color:var(--text);">${escapeHtml(title)}</div>` : ''}
      <div style="font-size:13px;color:var(--text-secondary);line-height:1.45;word-break:break-word;">${escapeHtml(message || '')}</div>
      ${retryFn ? `<button class="btn btn-sm btn-secondary" style="margin-top:8px;min-height:30px;" data-retry>ลองอีกครั้ง</button>` : ''}
    </div>
    <button class="toast-close" aria-label="Close">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="15" height="15"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  `;

  const closeBtn = el.querySelector('.toast-close');
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
  info(msg, title = 'แจ้งเตือน') { return createToast({ type: 'info', title, message: msg }); }
};
