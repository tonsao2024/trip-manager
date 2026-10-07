// Promise-based confirm / prompt dialogs (themed bottom sheet, no window.confirm)
import { showBottomSheet } from './modal.js';
import { escapeHtml } from '../utils/sanitize.js';

export function confirmAction({
  title = 'ยืนยันการทำรายการ',
  message = '',
  detail = '',
  confirmText = 'ยืนยัน',
  cancelText = 'ยกเลิก',
  danger = false,
  icon = 'alert-triangle'
} = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const safeIcon = escapeHtml(icon);
    const safeTitle = escapeHtml(title);
    const safeMessage = message ? escapeHtml(message) : '';
    const safeDetail = detail ? escapeHtml(detail) : '';
    const safeCancel = escapeHtml(cancelText);
    const safeConfirm = escapeHtml(confirmText);
    const sheet = showBottomSheet(`
      <div class="space-y-4">
        <div class="flex items-start gap-3">
          <div class="row-icon" style="width:42px;height:42px;border-radius:14px;background:${danger ? 'var(--danger-bg)' : 'var(--primary-light)'};color:${danger ? 'var(--danger)' : 'var(--primary-strong)'};">
            <i data-lucide="${safeIcon}" class="w-5 h-5"></i>
          </div>
          <div class="min-w-0 flex-1">
            <h3 id="confirm-title" class="font-bold text-base leading-tight" style="font-family: var(--font-display);">${safeTitle}</h3>
            ${safeMessage ? `<p class="text-sm text-[var(--text-secondary)] mt-1 leading-relaxed">${safeMessage}</p>` : ''}
          </div>
        </div>
        ${safeDetail ? `<div class="p-3 rounded-xl text-xs leading-relaxed" style="background: var(--bg-secondary); border:1px solid var(--border); color: var(--text-secondary);">${safeDetail}</div>` : ''}
        <div class="flex gap-2">
          <button id="confirm-cancel" class="btn btn-secondary flex-1">${safeCancel}</button>
          <button id="confirm-ok" class="btn ${danger ? 'btn-danger' : 'btn-primary'} flex-1">${safeConfirm}</button>
        </div>
      </div>
    `, { onClose: () => { if (!settled) { settled = true; resolve(false); } } });

    const finish = (value) => {
      if (settled) return;
      settled = true;
      sheet.close();
      resolve(value);
    };
    document.getElementById('confirm-ok')?.addEventListener('click', () => finish(true));
    document.getElementById('confirm-cancel')?.addEventListener('click', () => finish(false));
  });
}

export function promptAction({
  title = 'กรอกข้อมูล',
  label = '',
  placeholder = '',
  value = '',
  multiline = false,
  confirmText = 'บันทึก',
  icon = 'pencil'
} = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const safeIcon = escapeHtml(icon);
    const safeTitle = escapeHtml(title);
    const safeLabel = label ? escapeHtml(label) : '';
    const safePlaceholder = escapeHtml(placeholder);
    const safeValue = escapeHtml(value);
    const safeConfirm = escapeHtml(confirmText);
    const sheet = showBottomSheet(`
      <div class="space-y-4">
        <div class="flex items-center gap-3">
          <div class="row-icon" style="width:40px;height:40px;border-radius:14px;background:var(--gradient-primary);color:#fff;"><i data-lucide="${safeIcon}" class="w-5 h-5"></i></div>
          <h3 class="font-bold text-base" style="font-family: var(--font-display);">${safeTitle}</h3>
        </div>
        <div class="input-group">
          ${safeLabel ? `<label class="input-label">${safeLabel}</label>` : ''}
          ${multiline
            ? `<textarea id="prompt-input" class="input" style="min-height:100px;" placeholder="${safePlaceholder}">${safeValue}</textarea>`
            : `<input id="prompt-input" class="input" value="${safeValue}" placeholder="${safePlaceholder}" autocomplete="off">`}
        </div>
        <div class="flex gap-2">
          <button id="prompt-cancel" class="btn btn-secondary flex-1">ยกเลิก</button>
          <button id="prompt-ok" class="btn btn-primary flex-1">${safeConfirm}</button>
        </div>
      </div>
    `, { onClose: () => { if (!settled) { settled = true; resolve(null); } } });

    const input = document.getElementById('prompt-input');
    setTimeout(() => input?.focus(), 220);

    const finish = (val) => {
      if (settled) return;
      settled = true;
      sheet.close();
      resolve(val);
    };
    document.getElementById('prompt-ok')?.addEventListener('click', () => finish(document.getElementById('prompt-input')?.value ?? ''));
    document.getElementById('prompt-cancel')?.addEventListener('click', () => finish(null));
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !multiline) { e.preventDefault(); finish(input.value); }
    });
  });
}
