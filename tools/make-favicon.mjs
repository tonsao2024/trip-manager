/**
 * Dev-only: render the app icon (public/favicon.svg) to PNGs without any
 * external dependency — no rsvg / ImageMagick required, just Node.
 *
 *   node tools/make-favicon.mjs
 *
 * Writes public/favicon-32.png, favicon-192.png, favicon-512.png and
 * apple-touch-icon.png (180). The artwork mirrors the SVG exactly: a rounded
 * card with the brand gradient, a white Fuji triangle with a sky-blue snow cap
 * and a sun.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '../public');

const SKY = [0x1f, 0x6b, 0xfb];
const MID = [0x4d, 0x8d, 0xff];
const AMBER = [0xff, 0xb0, 0x2e];

const lerp = (a, b, t) => a + (b - a) * t;
function gradientColor(t) {
  const clamped = Math.min(1, Math.max(0, t));
  if (clamped < 0.55) {
    const k = clamped / 0.55;
    return [lerp(SKY[0], MID[0], k), lerp(SKY[1], MID[1], k), lerp(SKY[2], MID[2], k)];
  }
  const k = (clamped - 0.55) / 0.45;
  return [lerp(MID[0], AMBER[0], k), lerp(MID[1], AMBER[1], k), lerp(MID[2], AMBER[2], k)];
}

/** Even-odd triangle test (works for any winding). */
function inTri(x, y, a, b, c) {
  const d1 = (x - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (y - b[1]);
  const d2 = (x - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (y - c[1]);
  const d3 = (x - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (y - a[1]);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

/** Rounded-rect coverage with 1px anti-aliased edge. */
function roundedAlpha(x, y, size, radius) {
  const r = radius;
  const cx = Math.max(r, Math.min(size - r, x));
  const cy = Math.max(r, Math.min(size - r, y));
  const d = Math.hypot(x - cx, y - cy);
  if (d <= r - 0.5) return 1;
  if (d >= r + 0.5) return 0;
  return (r + 0.5 - d);
}

function inRect(x, y, x0, y0, x1, y1) {
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

function render(size) {
  const S = size;
  const px = (v) => (v / 64) * S;                 // design grid = the SVG viewBox
  const radius = px(16);
  const peak = [px(32), px(15)];
  const left = [px(6), px(52)];
  const right = [px(58), px(52)];
  const capOuter = [peak, [px(22.5), px(38)], [px(41.5), px(38)]];
  const capHole = [[px(32), px(31)], [px(26.5), px(38)], [px(37.5), px(38)]];
  const sunC = [px(46), px(18.5)];
  const sunR = px(7.5);
  const buf = Buffer.alloc(S * S * 4);

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const fx = x + 0.5, fy = y + 0.5;
      const a = roundedAlpha(fx, fy, S, radius);
      if (a <= 0) continue;
      let [r, g, b] = gradientColor(((fx / S) + (fy / S)) / 2);

      const inMountain = inTri(fx, fy, peak, left, right);
      if (inMountain) {
        r = 255; g = 255; b = 255;
        // snow cap: the blue gradient showing through a triangle with a hole
        if (inTri(fx, fy, ...capOuter) && !inTri(fx, fy, ...capHole)) {
          r = lerp(255, SKY[0], 0.5); g = lerp(255, SKY[1], 0.5); b = lerp(255, SKY[2], 0.5);
        }
      }
      // ground bar
      if (inRect(fx, fy, px(7), px(54), px(57), px(58))) { r = 255; g = 255; b = 255; }
      // sun
      if (!inMountain && Math.hypot(fx - sunC[0], fy - sunC[1]) <= sunR) {
        r = lerp(r, 255, 0.93); g = lerp(g, 255, 0.93); b = lerp(b, 255, 0.93);
      }

      const i = (y * S + x) * 4;
      buf[i] = Math.round(r); buf[i + 1] = Math.round(g); buf[i + 2] = Math.round(b);
      buf[i + 3] = Math.round(a * 255);
    }
  }
  return buf;
}

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256).map((_, n) => {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      return c;
    });
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function toPng(size) {
  const raw = render(size);
  const stride = size * 4;
  const withFilter = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    withFilter[y * (stride + 1)] = 0; // filter type 0 (none)
    raw.copy(withFilter, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(withFilter, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const targets = [
  ['favicon-32.png', 32],
  ['favicon-192.png', 192],
  ['favicon-512.png', 512],
  ['apple-touch-icon.png', 180]
];
fs.mkdirSync(outDir, { recursive: true });
for (const [file, size] of targets) {
  fs.writeFileSync(path.join(outDir, file), toPng(size));
  console.log(`✓ public/${file} (${size}×${size})`);
}
