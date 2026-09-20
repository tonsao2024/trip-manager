export default async function html2canvas() {
  return { width: 800, height: 600, toDataURL: () => 'data:image/png;base64,iVBORw0KGgo=' };
}
