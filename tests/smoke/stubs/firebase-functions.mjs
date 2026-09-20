// Minimal firebase/functions stand-in.
// Mirrors the real deployment reported by the user: the callable exists but fails
// with `functions/internal`, so the app must fall back to its local member auth.
const responses = {};

function fnError(name) {
  const err = new Error(`internal: ${name} is not available`);
  err.code = 'functions/internal';
  return err;
}

export function getFunctions() { return { __functions: true }; }
export function httpsCallable(_fns, name) {
  return async (data) => {
    if (name === 'createMemberAccount' || name === 'loginWithUsernamePin') throw fnError(name);
    if (responses[name]) return { data: responses[name] };
    return { data: { ok: true, echo: data } };
  };
}
export default { getFunctions, httpsCallable };
