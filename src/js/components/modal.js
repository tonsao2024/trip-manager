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
    // Fade out to prevent transform distortion
    sheet.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
    sheet.style.opacity = '0';
    sheet.style.transform = 'translateX(-50%) translateY(20px) translateZ(0)';
    backdrop.style.transition = 'opacity 0.2s ease';
    backdrop.style.opacity = '0';
    setTimeout(() => {
      backdrop.remove();
      sheet.remove();
      unlockBodyScroll();
      if (onClose) onClose();
    }, 220);
  };
  
  backdrop.onclick = close;
  
  // Prevent background scroll
  lockBodyScroll();
  
  document.body.appendChild(backdrop);
  document.body.appendChild(sheet);

  // Close on escape
  const esc = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); } };
  document.addEventListener('keydown', esc);
  
  // Close handle click
  sheet.querySelector('.bottom-sheet-handle')?.addEventListener('click', close);

  return { close, sheet, backdrop };
}

export function showModal(htmlContent, { closable = true } = {}) {
  const backdrop = document.createElement('div');
  backdrop.className = 'bottom-sheet-backdrop animate-fadeIn';
  backdrop.style.display = 'grid';
  backdrop.style.placeItems = 'center';
  backdrop.style.padding = '16px';

  const modal = document.createElement('div');
  modal.className = 'card animate-fadeIn';
  modal.style.maxWidth = '480px';
  modal.style.width = '100%';
  modal.style.maxHeight = '85vh';
  modal.style.overflow = 'auto';
  modal.style.padding = '20px';
  modal.innerHTML = htmlContent;

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    backdrop.style.transition = 'opacity 0.2s ease';
    backdrop.style.opacity = '0';
    modal.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
    modal.style.opacity = '0';
    modal.style.transform = 'scale(0.96)';
    setTimeout(() => {
      backdrop.remove();
      unlockBodyScroll();
    }, 200);
  };
  if (closable) backdrop.onclick = (e) => { if (e.target === backdrop) close(); };

  lockBodyScroll();
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
  return { close, modal, backdrop };
}
