export function showBottomSheet(htmlContent, { onClose } = {}) {
  const backdrop = document.createElement('div');
  backdrop.className = 'bottom-sheet-backdrop animate-fadeIn';
  const sheet = document.createElement('div');
  sheet.className = 'bottom-sheet';
  sheet.innerHTML = `<div class="bottom-sheet-handle"></div><div class="bottom-sheet-content">${htmlContent}</div>`;

  const close = () => {
    backdrop.remove();
    sheet.remove();
    document.body.style.overflow = '';
    if (onClose) onClose();
  };
  backdrop.onclick = close;
  document.body.appendChild(backdrop);
  document.body.appendChild(sheet);
  document.body.style.overflow = 'hidden';

  // Close on escape
  const esc = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); } };
  document.addEventListener('keydown', esc);

  return { close, sheet, backdrop };
}

export function showModal(htmlContent, { closable = true } = {}) {
  const backdrop = document.createElement('div');
  backdrop.className = 'bottom-sheet-backdrop animate-fadeIn';
  backdrop.style.display = 'grid';
  backdrop.style.placeItems = 'center';
  backdrop.style.padding = '20px';

  const modal = document.createElement('div');
  modal.className = 'card animate-fadeIn';
  modal.style.maxWidth = '480px';
  modal.style.width = '100%';
  modal.style.maxHeight = '90vh';
  modal.style.overflow = 'auto';
  modal.style.padding = '24px';
  modal.innerHTML = htmlContent;

  const close = () => {
    backdrop.remove();
    document.body.style.overflow = '';
  };
  if (closable) backdrop.onclick = (e) => { if (e.target === backdrop) close(); };

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
  document.body.style.overflow = 'hidden';
  return { close, modal, backdrop };
}
