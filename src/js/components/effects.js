import { confettiColors } from '../utils/brand.js';
// Effect helpers (v35 — quiet by default).
//
// The calm pass (docs/UNSLOP-AUDIT-2026-11-08.md, pass 9) removed the decorative
// motion: content no longer waits for a scroll reveal, numbers no longer count up
// and saving a form no longer throws confetti. The exported names stay so every
// caller keeps working — they now just show the final state immediately.
//
// The one celebration left is the settlement stamp (see renderSettlement in
// app.js). `confetti({ milestone: true })` still works for a genuine milestone.

export function prefersReducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

/* ---------------- Reveal (no-op) ----------------
 * Cards used to start at opacity 0 and fade in on scroll, which blanked print,
 * screenshots and anything below the fold (audit B9). Content is always visible
 * now; the function only marks elements so old selectors keep matching. */
export function initReveal(root = document, selector = '.reveal') {
  try { root.querySelectorAll?.(selector).forEach(el => el.classList.add('is-visible')); } catch {}
}

export function stopReveal() {}

/* ---------------- Numbers: the final value, at once ---------------- */
export function countUp(el, to, { formatter = (v) => String(Math.round(v)) } = {}) {
  if (!el) return;
  el.textContent = formatter(to || 0);
}

/* ---------------- Confetti — milestones only ---------------- */

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

/**
 * A short burst — ONLY when `milestone: true` is passed. Routine saves used to
 * call this 15 times across the app; celebrating everything celebrates nothing.
 */
export function confetti({ x = window.innerWidth / 2, y = 90, count = 26, spread = 260, milestone = false } = {}) {
  if (!milestone || prefersReducedMotion()) return;
  const layer = confettiLayer();
  const frag = document.createDocumentFragment();
  const palette = confettiColors();
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    const size = 6 + Math.random() * 6;
    piece.style.width = `${size}px`;
    piece.style.height = `${size * (Math.random() > 0.5 ? 1 : 0.5)}px`;
    piece.style.background = palette[i % palette.length];
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

/** Kept for callers; a no-op unless `{ milestone: true }` is passed. */
export function celebrateFrom(el, opts = {}) {
  if (!opts.milestone) return;
  const rect = el?.getBoundingClientRect?.();
  confetti({
    x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
    y: rect ? rect.top + rect.height / 2 : 120,
    ...opts
  });
}

/* ---------------- Misc ---------------- */
export function pulse() {}

/** Lists no longer stagger in; kept so callers need no change. */
export function restagger() {}

export function bumpElement() {}
