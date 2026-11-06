// Paper scan: a synthetic phone photo of an A4 sheet (tilted, uneven light, on
// a dark desk) with a drawn 100 × 60 mm rectangle outline and a Ø20 mm hole.
// The sheet must be found, straightened and measured at 1:1.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { Scan } = new Function(readFileSync(join(root, 'src/scan.js'), 'utf8') + '\nreturn { Scan };')();

let fails = 0;
const check = (name, cond, info = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); if (!cond) fails++; };

// drawing on the sheet, in mm (A4 portrait): pen 0.8 mm wide
const PEN = 0.8;
const RX = 55, RY = 80, RW = 100, RH = 60, CX = RX + RW / 2, CY = RY + RH / 2, CR = 10;
function inkAt(x, y) {
  // rectangle outline
  const dx = Math.max(RX - x, 0, x - (RX + RW)), dy = Math.max(RY - y, 0, y - (RY + RH));
  const outside = Math.hypot(dx, dy);
  const inside = Math.min(x - RX, RX + RW - x, y - RY, RY + RH - y);
  const dRect = outside > 0 ? outside : inside;
  if (Math.abs(dRect) <= PEN / 2) return true;
  // circle outline
  if (Math.abs(Math.hypot(x - CX, y - CY) - CR) <= PEN / 2) return true;
  // a filled triangle in the corner (for filled mode)
  if (x > 20 && x < 40 && y > 200 && y < 240 && (y - 200) > 2 * Math.abs(x - 30)) return true;
  return false;
}

// photo: 1600×1200, sheet corners in perspective
const PW = 1600, PH = 1200;
const corners = [[420, 140], [1180, 110], [1260, 1080], [360, 1120]];
const H = Scan.homography(corners, [[0, 0], [210, 0], [210, 297], [0, 297]]); // photo px -> sheet mm
const gray = new Float32Array(PW * PH);
for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
  const d = H[6] * x + H[7] * y + H[8];
  const u = (H[0] * x + H[1] * y + H[2]) / d, v = (H[3] * x + H[4] * y + H[5]) / d;
  const light = 0.75 + 0.25 * (x / PW); // uneven lighting
  let val;
  if (u < 0 || v < 0 || u > 210 || v > 297) val = 45; // desk
  else val = inkAt(u, v) ? 40 : 235;
  gray[y * PW + x] = val * light + ((x * 7 + y * 13) % 5) - 2;
}

const found = Scan.detectPaper(gray, PW, PH);
const err = Math.max(...found.map((p, i) => Math.hypot(p[0] - corners[i][0], p[1] - corners[i][1])));
check('sheet corners found', err < 6, `max error ${err.toFixed(1)} px`);
check('orientation guessed', Scan.guessOrientation(found) === 'portrait');

const res = Scan.extract(gray, PW, PH, found, [210, 297], { mode: 'outline', minArea: 20 });
const big = res.shapes.filter((s) => s.area > 1000);
check('one outlined shape', big.length === 1, `${res.shapes.length} shapes, areas ${res.shapes.map((s) => s.area.toFixed(0)).join(', ')}`);
const s = big[0];
const bb = (r) => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (let i = 0; i < r.length; i += 2) { x0 = Math.min(x0, r[i]); x1 = Math.max(x1, r[i]); y0 = Math.min(y0, r[i + 1]); y1 = Math.max(y1, r[i + 1]); } return [x0, y0, x1 - x0, y1 - y0]; };
if (s) {
  const [x0, y0, w, h] = bb(s.outer);
  // material includes the drawn line, so the raw outline is the line's outer edge
  check('size at 1:1 (outer edge of the pen line)', Math.abs(w - (RW + PEN)) < 1.2 && Math.abs(h - (RH + PEN)) < 1.2, `${w.toFixed(1)} × ${h.toFixed(1)} mm (expect ${RW + PEN} × ${RH + PEN})`);
  check('position on the sheet', Math.abs(x0 - (RX - PEN / 2)) < 1.2 && Math.abs(y0 - (RY - PEN / 2)) < 1.2, `${x0.toFixed(1)}, ${y0.toFixed(1)}`);
  check('drawn circle becomes a hole', s.holes.length === 1, `${s.holes.length} holes`);
  if (s.holes[0]) { const [, , hw] = bb(s.holes[0]); check('hole size', Math.abs(hw - (2 * CR - PEN)) < 1.2, `Ø ${hw.toFixed(1)} mm (expect ${2 * CR - PEN})`); }
}
check('pen width estimated', Math.abs(res.stroke - PEN) < 0.35, `${res.stroke.toFixed(2)} mm`);
const tri = res.shapes.find((q) => q.area > 100 && q.area < 1000);
check('small filled mark kept as its own shape', !!tri, tri ? `${tri.area.toFixed(0)} mm²` : '');

const filled = Scan.extract(gray, PW, PH, found, [210, 297], { mode: 'filled', minArea: 20 });
const tri2 = filled.shapes.find((q) => q.area > 550 && q.area < 650);
check('filled mode: the solid mark (600 mm²)', !!tri2, filled.shapes.map((q) => q.area.toFixed(0)).join(', '));

// a flatbed scan of the whole page: no desk around it
const sw = 420, sh = 594, scan = new Float32Array(sw * sh);
for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) scan[y * sw + x] = inkAt(x / 2, y / 2) ? 30 : 240;
const sc = Scan.detectPaper(scan, sw, sh);
check('full-page scan uses the image corners', sc[0][0] === 0 && sc[2][0] === sw - 1, JSON.stringify(sc));

const stl = Scan.toSTL(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]));
check('binary STL', stl.byteLength === 134 && new DataView(stl).getUint32(80, true) === 1);

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
if (fails) process.exit(1);
