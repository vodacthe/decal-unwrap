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

// auto mode on the line drawing picks "outline"
check('auto mode: pen lines -> outline', Scan.extract(gray, PW, PH, found, [210, 297], { minArea: 20 }).mode === 'outline');

// A full-page scan of two big filled shapes (red marker, like a real test sheet):
// two halves 20 × 59.55 mm with a 1.5 mm gap. Auto must pick "filled" and keep the size.
const fw = 1050, fh = 1485, fsc = new Float32Array(fw * fh); // 5 px/mm
const inHalf = (x, y) => y > 120 && y < 120 + 59.55 && ((x > 40 && x < 60) || (x > 61.5 && x < 81.5));
for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) fsc[y * fw + x] = (inHalf(x / 5, y / 5) ? 62 : 238) * (0.85 + 0.15 * (y / fh));
const fc = Scan.detectPaper(fsc, fw, fh);
const fr = Scan.extract(fsc, fw, fh, fc, [210, 297], { minArea: 20 });
check('auto mode: big filled areas -> filled', fr.mode === 'filled', fr.mode);
check('both filled halves found', fr.shapes.length === 2, `${fr.shapes.length} shapes`);
const fb = fr.shapes.map((q) => bb(q.outer));
check('filled height kept at 1:1 (59.55 mm)', fb.length === 2 && fb.every(([, , , hh]) => Math.abs(hh - 59.55) < 0.6), fb.map((q) => `${q[2].toFixed(2)} × ${q[3].toFixed(2)}`).join(', '));
check('filled shapes are solid (no holes)', fr.shapes.every((q) => q.holes.length === 0));

// the same sheet scanned soft: edges blurred over ~2 mm (low resolution and
// compression) plus a faint grey smear under the shape, as on a real scan
const blurred = Float32Array.from(fsc, (v, i) => {
  const x = (i % fw) / 5, y = ((i / fw) | 0) / 5;
  return x > 38 && x < 84 && y > 180 && y < 188 ? Math.min(v, 215) : v; // smear just below
});
for (let pass = 0; pass < 3; pass++) {
  const R = 3, tmp = new Float32Array(blurred.length);
  for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) { let s = 0, n = 0; for (let k = -R; k <= R; k++) { const xx = x + k; if (xx >= 0 && xx < fw) { s += blurred[y * fw + xx]; n++; } } tmp[y * fw + x] = s / n; }
  for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) { let s = 0, n = 0; for (let k = -R; k <= R; k++) { const yy = y + k; if (yy >= 0 && yy < fh) { s += tmp[yy * fw + x]; n++; } } blurred[y * fw + x] = s / n; }
}
const br = Scan.extract(blurred, fw, fh, fc, [210, 297], { minArea: 20 });
const bbs = br.shapes.map((q) => bb(q.outer));
check('soft scan: height still 59.55 ± 0.4 mm', bbs.length === 2 && bbs.every(([, , , hh]) => Math.abs(hh - 59.55) < 0.4), bbs.map((q) => `${q[2].toFixed(2)} × ${q[3].toFixed(2)}`).join(', '));
check('soft scan: width 20 ± 0.4 mm', bbs.length === 2 && bbs.every(([, , ww]) => Math.abs(ww - 20) < 0.4));

// a filled disc (r = 25 mm) with a ragged edge (±0.3 mm ripple) and a 0.4 mm
// pencil line running into it: the line goes, the edge comes out smooth
const dsc = new Float32Array(fw * fh);
for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
  const u = x / 5 - 100, v = y / 5 - 150, a = Math.atan2(v, u);
  const rr = 25 + 0.3 * Math.sin(a * 91) + 0.2 * Math.sin(a * 151 + 1); // ripples 1-2 mm long, like a marker edge
  const pencil = Math.abs(v + 10) < 0.2 && u < 0 && u > -60;
  dsc[y * fw + x] = Math.hypot(u, v) < rr ? 60 : pencil ? 150 : 238;
}
const dr = Scan.extract(dsc, fw, fh, Scan.detectPaper(dsc, fw, fh), [210, 297], { minArea: 20 });
const disc = dr.shapes[0];
const [dx0, , dw, dh] = disc ? bb(disc.outer) : [0, 0, 0, 0];
check('pencil line touching a filled shape is dropped', dr.shapes.length === 1 && dx0 > 74, `${dr.shapes.length} shapes, left edge ${dx0.toFixed(1)} mm`);
const radii = [];
if (disc) for (let i = 0; i < disc.outer.length; i += 2) radii.push(Math.hypot(disc.outer[i] - 100, disc.outer[i + 1] - 150));
const rMean = radii.reduce((s, v) => s + v, 0) / (radii.length || 1);
const rms = Math.sqrt(radii.reduce((s, v) => s + (v - rMean) ** 2, 0) / (radii.length || 1));
check('ragged edge smoothed (rms wobble < 0.06 mm; the ripple was 0.25)', disc && rms < 0.06, `${rms.toFixed(3)} mm`);
check('disc size kept (Ø 50 ± 0.3 mm)', disc && Math.abs(2 * rMean - 50) < 0.3, `Ø ${(2 * rMean).toFixed(2)} mm`);

// light reflections on a dark part bite thin notches (1 mm wide, 3 mm deep) into its edge
const nsc = new Float32Array(fw * fh);
for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
  const u = x / 5, v = y / 5;
  const inRect = u > 60 && u < 140 && v > 80 && v < 200;
  const bite = u > 60 && u < 63 && [100, 130, 160].some((c) => Math.abs(v - c) < 0.5);
  nsc[y * fw + x] = inRect && !bite ? 50 : inRect ? 170 : 238;
}
const nr = Scan.extract(nsc, fw, fh, Scan.detectPaper(nsc, fw, fh), [210, 297], { minArea: 20 });
const minLeft = nr.shapes[0] ? Math.max(...nr.shapes[0].outer.filter((_, i) => i % 2 === 0 && nr.shapes[0].outer[i + 1] > 90 && nr.shapes[0].outer[i + 1] < 170 && nr.shapes[0].outer[i] < 100)) : 0;
check('thin bites in the edge are filled', nr.shapes.length === 1 && minLeft < 61, `${nr.shapes.length} shapes, deepest left edge ${minLeft.toFixed(2)} mm`);

const stl = Scan.toSTL(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]));
check('binary STL', stl.byteLength === 134 && new DataView(stl).getUint32(80, true) === 1);

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
if (fails) process.exit(1);
