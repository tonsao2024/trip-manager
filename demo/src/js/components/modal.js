// Modal / Bottom sheet v3 — stable positioning (no transform conflicts at any resolution)

function lockBodyScroll() {
  const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;
  document.body.style.overflow = 'hidden';
  if (scrollBarWidth > 0) {
    document.body.style.paddingRight = `${scrollBarWidth}px`;
  }
}

function unlockBodyScroll() {
  document.body.style.overflow = '';
  document.body.style.paddingRight = '';
}

export function showBottomSheet(htmlContent, { onClose } = {}) {
  const backdrop = document.createElement('div');
  backdrop.className = 'bottom-sheet-backdrop animate-fadeIn';
  const sheet = document.createElement('div');
  sheet.className = 'bottom-sheet';
  sheet.innerHTML = `<div class="bottom-sheet-handle"></div><div class="bottom-sheet-content">${htmlContent}</div>`;

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    // Animate with the standalone `translate`/`scale` properties so the
    // CSS positioning transform (desktop centering) is never disturbed.
    sheet.style.transition = 'opacity 0.22s ease, translate 0.22s ease, scale 0.22s ease';
    sheet.style.opacity = '0';
    sheet.style.translate = '0 28px';
    sheet.style.scale = '0.98';
    backdrop.style.transition = 'opacity 0.22s ease';
    backdrop.style.opacity = '0';
    setTimeout(() => {
      backdrop.remove();
      sheet.remove();
      unlockBodyScroll();
      if (onClose) onClose();
    }, 230);
  };

  backdrop.onclick = close;

  lockBodyScroll();

  document.body.appendChild(backdrop);
  document.body.appendChild(sheet);

  // Close on escape
  const esc = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); } };
  document.addEventListener('keydown', esc);

  // Close handle click
  sheet.querySelector('.bottom-sheet-handle')?.addEventListener('click', close);

  // Render any lucide icons inside the sheet
  if (window.lucide) { try { lucide.createIcons(); } catch {} }

  return { close, sheet, backdrop };
}

export function showModal(htmlContent, { closable = true, onClose } = {}) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop animate-fadeIn';

  const modal = document.createElement('div');
  modal.className = 'modal-card animate-popIn';
  modal.innerHTML = htmlContent;

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    backdrop.style.transition = 'opacity 0.2s ease';
    backdrop.style.opacity = '0';
    modal.style.transition = 'opacity 0.2s ease, translate 0.2s ease, scale 0.2s ease';
    modal.style.opacity = '0';
    modal.style.translate = '0 14px';
    modal.style.scale = '0.96';
    setTimeout(() => {
      backdrop.remove();
      unlockBodyScroll();
      if (onClose) onClose();
    }, 210);
  };
  if (closable) backdrop.onclick = (e) => { if (e.target === backdrop) close(); };

  const esc = (e) => { if (e.key === 'Escape' && closable) { close(); document.removeEventListener('keydown', esc); } };
  document.addEventListener('keydown', esc);

  lockBodyScroll();
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
  if (window.lucide) { try { lucide.createIcons(); } catch {} }
  return { close, modal, backdrop };
}
