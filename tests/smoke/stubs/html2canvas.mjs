// html2canvas stub for the smoke test — behaves like 1.4.1 where it matters:
// it REFUSES modern color functions exactly like the real parser does
// ("Attempted to parse an unsupported color function 'color'"), so the app's
// color sanitising is really exercised instead of being assumed.
//
// Controls:
//   __h2cState.failNext = n   → the next n calls throw a color error
//   __h2cState.calls / lastOptions / lastElement   → introspection for assertions

export const __h2cState = {
  calls: 0,
  failNext: 0,
  lastOptions: null,
  lastElement: null,
  failedWith: []
};

const MODERN = /color-mix\(|oklch\(|\blab\(|\blch\(|\bcolor\(|light-dark\(/i;

function assertPlain(win, el, options) {
  if (options?.backgroundColor && MODERN.test(String(options.backgroundColor))) {
    const err = new Error(`Attempted to parse an unsupported color function "color" (backgroundColor: ${options.backgroundColor})`);
    __h2cState.failedWith.push(options.backgroundColor);
    throw err;
  }
  // Any inline style left in the captured subtree (or its ancestors) must be plain.
  const nodes = [el, ...(el.querySelectorAll?.('*') || [])];
  for (const node of nodes) {
    const style = node.getAttribute?.('style') || '';
    if (MODERN.test(style)) {
      const err = new Error(`Attempted to parse an unsupported color function "color" (inline: ${style.slice(0, 80)})`);
      __h2cState.failedWith.push(style.slice(0, 80));
      throw err;
    }
  }
  // The injected sanitizer sheet must exist while the capture runs.
  const sheet = win?.document?.querySelector?.('style[data-export-sanitizer]');
  if (!sheet) {
    const err = new Error('capture without the color sanitizer sheet');
    __h2cState.failedWith.push('no sanitizer sheet');
    throw err;
  }
}

export default async function html2canvas(el, options = {}) {
  __h2cState.calls += 1;
  __h2cState.lastOptions = options;
  __h2cState.lastElement = el;
  if (__h2cState.failNext > 0) {
    __h2cState.failNext -= 1;
    const err = new Error('Attempting to parse an unsupported color function "color"');
    __h2cState.failedWith.push('forced');
    throw err;
  }
  assertPlain(globalThis.window, el, options);
  return {
    width: 800,
    height: 600,
    toDataURL: () => 'data:image/png;base64,iVBORw0KGgo='
  };
}
