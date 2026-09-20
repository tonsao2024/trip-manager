// Minimal firebase/app stand-in for the jsdom smoke test (no network).
export function initializeApp(config) { return { name: '[DEFAULT]', options: config || {} }; }
export function getApp() { return { name: '[DEFAULT]' }; }
export function deleteApp() { return Promise.resolve(); }
export default { initializeApp, getApp };
