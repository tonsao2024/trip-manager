// Demo stand-in for jsPDF — see html2canvas.js.
export class jsPDF {
  constructor() {}
  addImage() {} addPage() {} text() {} setFontSize() {}
  save() { throw new Error('การส่งออก PDF ใช้ได้ในแอปจริงเท่านั้น (โหมดตัวอย่างไม่ต่อเน็ต)'); }
}
export default { jsPDF };
