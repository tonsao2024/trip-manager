/** Dev-only firebase/storage stand-in for the offline demo (no uploads). */
export function getStorage() { return { __storage: true }; }
export function ref(_s, path) { return { path, fullPath: path }; }
export function uploadBytes() { return Promise.resolve({ ref: {} }); }
export function getDownloadURL(reference) { return Promise.resolve(`https://picsum.photos/seed/${encodeURIComponent(String(reference?.path || 'fuji'))}/1200/800`); }
export function deleteObject() { return Promise.resolve(); }
export default { getStorage, ref, uploadBytes, getDownloadURL };
