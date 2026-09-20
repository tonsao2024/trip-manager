// Minimal firebase/functions stand-in — callables resolve successfully.
const responses = {
  createMemberAccount: { uid: 'new-member-uid', pinSet: true },
  loginWithUsernamePin: { token: 'fake-token' }
};
export function getFunctions() { return { __functions: true }; }
export function httpsCallable(_fns, name) {
  return async (data) => ({ data: responses[name] ?? { ok: true, echo: data } });
}
export default { getFunctions, httpsCallable };
