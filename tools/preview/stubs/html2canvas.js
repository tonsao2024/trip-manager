// Demo stand-in for html2canvas: the offline demo has no real renderer, so an
// export attempt explains itself instead of producing a blank file.
export const __demoUnavailable = 'html2canvas';
export default function html2canvas() {
  return Promise.reject(new Error('การส่งออกรูปภาพใช้ได้ในแอปจริงเท่านั้น (โหมดตัวอย่างไม่ต่อเน็ต)'));
}
