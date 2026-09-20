// Minimal firebase/storage stand-in.
export function getStorage() { return { __storage: true }; }
export function ref(_s, path) { return { path, fullPath: path }; }
export function uploadBytes() { return Promise.resolve({ ref: {} }); }
export function getDownloadURL() { return Promise.resolve('https://example.com/upload.png'); }
export function deleteObject() { return Promise.resolve(); }
export default { getStorage, ref, uploadBytes, getDownloadURL };
