/** Dev-only firebase/functions stand-in — callables report `internal` so the
 *  app falls back to its local (offline) auth path, exactly like the real
 *  deployment does today. */
function fnError(name) { const err = new Error(`internal: ${name} is not available`); err.code = 'functions/internal'; return err; }
export function getFunctions() { return { __functions: true }; }
export function httpsCallable(_fns, name) {
  return async () => { throw fnError(name); };
}
export default { getFunctions, httpsCallable };
