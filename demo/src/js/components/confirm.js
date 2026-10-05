// Promise-based confirm / prompt dialogs (themed bottom sheet, no window.confirm)
import { showBottomSheet } from './modal.js';

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
    const sheet = showBottomSheet(`
      <div class="space-y-4">
        <div class="flex items-start gap-3">
          <div class="row-icon" style="width:42px;height:42px;border-radius:14px;background:${danger ? 'var(--danger-bg)' : 'var(--primary-light)'};color:${danger ? 'var(--danger)' : 'var(--primary-strong)'};">
            <i data-lucide="${icon}" class="w-5 h-5"></i>
          </div>
          <div class="min-w-0 flex-1">
            <h3 class="font-bold text-base leading-tight" style="font-family: var(--font-display);">${title}</h3>
            ${message ? `<p class="text-sm text-[var(--text-secondary)] mt-1 leading-relaxed">${message}</p>` : ''}
          </div>
        </div>
        ${detail ? `<div class="p-3 rounded-xl text-xs leading-relaxed" style="background: var(--bg-secondary); border:1px solid var(--border); color: var(--text-secondary);">${detail}</div>` : ''}
        <div class="flex gap-2">
          <button id="confirm-cancel" class="btn btn-secondary flex-1">${cancelText}</button>
          <button id="confirm-ok" class="btn ${danger ? 'btn-danger' : 'btn-primary'} flex-1">${confirmText}</button>
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
    const sheet = showBottomSheet(`
      <div class="space-y-4">
        <div class="flex items-center gap-3">
          <div class="row-icon" style="width:40px;height:40px;border-radius:14px;background:var(--gradient-primary);color:#fff;"><i data-lucide="${icon}" class="w-5 h-5"></i></div>
          <h3 class="font-bold text-base" style="font-family: var(--font-display);">${title}</h3>
        </div>
        <div class="input-group">
          ${label ? `<label class="input-label">${label}</label>` : ''}
          ${multiline
            ? `<textarea id="prompt-input" class="input" style="min-height:100px;" placeholder="${placeholder}">${value}</textarea>`
            : `<input id="prompt-input" class="input" value="${value}" placeholder="${placeholder}" autocomplete="off">`}
        </div>
        <div class="flex gap-2">
          <button id="prompt-cancel" class="btn btn-secondary flex-1">ยกเลิก</button>
          <button id="prompt-ok" class="btn btn-primary flex-1">${confirmText}</button>
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
