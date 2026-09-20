// Micro-interaction helpers — reveal on scroll, animated numbers, confetti bursts.
// All effects respect prefers-reduced-motion.

export function prefersReducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

/* ---------------- Reveal on scroll ---------------- */
let revealObserver = null;

export function initReveal(root = document, selector = '.reveal, .card, .card-bento, .kpi-tile') {
  if (prefersReducedMotion()) return;
  if (!('IntersectionObserver' in window)) {
    root.querySelectorAll?.(selector).forEach(el => el.classList.add('is-visible'));
    return;
  }
  if (!revealObserver) {
    revealObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.04 });
  }
  root.querySelectorAll?.(selector).forEach(el => {
    if (el.dataset.revealed === '1') return;
    el.dataset.revealed = '1';
    el.classList.add('reveal');
    revealObserver.observe(el);
  });
}

export function stopReveal() {
  try { revealObserver?.disconnect(); } catch {}
  revealObserver = null;
}

/* ---------------- Animated numbers ---------------- */
export function countUp(el, to, { duration = 700, formatter = (v) => String(Math.round(v)) } = {}) {
  if (!el) return;
  if (prefersReducedMotion() || !to) { el.textContent = formatter(to || 0); return; }
  const from = 0;
  const start = performance.now();
  const step = (now) => {
    if (!el.isConnected) return;
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = formatter(from + (to - from) * eased);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ---------------- Confetti burst ---------------- */
const CONFETTI_COLORS = ['#8bb89a', '#f97316', '#8b5cf6', '#ec4899', '#06b6d4', '#fbbf24'];

function confettiLayer() {
  let layer = document.getElementById('confetti-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'confetti-layer';
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);
  }
  return layer;
}

export function confetti({ x = window.innerWidth / 2, y = 90, count = 26, spread = 260 } = {}) {
  if (prefersReducedMotion()) return;
  const layer = confettiLayer();
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    const size = 6 + Math.random() * 7;
    piece.style.width = `${size}px`;
    piece.style.height = `${size * (Math.random() > 0.5 ? 1 : 0.5)}px`;
    piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    piece.style.left = `${x}px`;
    piece.style.top = `${y}px`;
    piece.style.setProperty('--cx', `${(Math.random() - 0.5) * spread}px`);
    piece.style.setProperty('--cy', `${180 + Math.random() * 240}px`);
    piece.style.setProperty('--cr', `${(Math.random() - 0.5) * 900}deg`);
    piece.style.animationDelay = `${Math.random() * 90}ms`;
    frag.appendChild(piece);
    setTimeout(() => piece.remove(), 1500);
  }
  layer.appendChild(frag);
}

export function celebrateFrom(el, opts = {}) {
  const rect = el?.getBoundingClientRect?.();
  return confetti({
    x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
    y: rect ? rect.top + rect.height / 2 : 120,
    ...opts
  });
}

/* ---------------- Misc ---------------- */
export function pulse(el, className = 'pulse-once') {
  if (!el) return;
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
  setTimeout(() => el.classList.remove(className), 900);
}

/** Stagger a freshly rendered list so children animate in one after another. */
export function restagger(container) {
  if (!container) return;
  container.classList.remove('stagger');
  void container.offsetWidth;
  container.classList.add('stagger');
}

export function bumpElement(selectorOrEl) {
  const el = typeof selectorOrEl === 'string' ? document.querySelector(selectorOrEl) : selectorOrEl;
  pulse(el, 'bump');
}
