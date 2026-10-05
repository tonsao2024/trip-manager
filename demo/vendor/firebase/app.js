/** Dev-only firebase/app stand-in for the offline demo (ES module). */
export function initializeApp(config) { return { name: '[DEFAULT]', options: config || {} }; }
export function getApp() { return { name: '[DEFAULT]' }; }
export function deleteApp() { return Promise.resolve(); }
export default { initializeApp, getApp };
