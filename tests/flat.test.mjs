import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const code = readFileSync(join(root, 'src/geometry.js'), 'utf8') + '\n' + readFileSync(join(root, 'src/flatten.js'), 'utf8');
const { Geo, Flat } = new Function(code + '\nreturn { Geo, Flat };')();

let fails = 0;
const check = (name, cond, info = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`);
  if (!cond) fails++;
};

function soupFromQuads(nx, ny, fn, keep = () => true, flipSome = false) {
  const out = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (!keep(i, j)) continue;
    const a = fn(i, j), b = fn(i + 1, j), c = fn(i + 1, j + 1), d = fn(i, j + 1);
    const t1 = [a, b, c], t2 = [a, c, d];
    if (flipSome && (i + j) % 2) { t1.reverse(); t2.reverse(); }
    out.push(...t1.flat(), ...t2.flat());
  }
  return Float32Array.from(out);
}

function bboxUV(p) {
  let best = null;
  for (let d = 0; d < 1800; d++) {
    const a = (d / 1800) * Math.PI, c = Math.cos(a), s = Math.sin(a);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < p.nV; i++) {
      const x = c * p.uv[2 * i] - s * p.uv[2 * i + 1], y = s * p.uv[2 * i] + c * p.uv[2 * i + 1];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const r = [x1 - x0, y1 - y0];
    if (!best || r[0] * r[1] < best[0] * best[1]) best = r;
  }
  return best;
}

const hasNaN = (p) => p.uv.some((x) => !Number.isFinite(x));
const paintAll = (m) => new Uint8Array(m.nF).fill(1);

async function run(name, soup, paint, opts = {}) {
  const m = Geo.buildModel(soup, { unitScale: 1, upAxis: 'y', name });
  const fg = paint(m);
  const t0 = performance.now();
  const res = await Flat.generate(m, fg, { quality: 'standard', autoSeam: true, viewMatrix: null, ...opts }, () => {}, () => false);
  const ms = performance.now() - t0;
  return { m, res, ms };
}

// 1. flat 100x60 plate (in xz plane, normal +y) with 2 rectangular holes
{
  const soup = soupFromQuads(100, 60, (i, j) => [i, 0, -j],
    (i, j) => !((i >= 20 && i < 35 && j >= 20 && j < 40) || (i >= 60 && i < 80 && j >= 10 && j < 25)));
  const { res, ms } = await run('plate', soup, paintAll);
  const p = res.pieces[0];
  check('plate: 1 piece', res.pieces.length === 1);
  check('plate: 3 loops', p.loops.length === 3, `${p.loops.length}`);
  check('plate: 0 seams', p.stats.seams === 0);
  check('plate: area ratio', Math.abs(p.stats.area2D / p.stats.area3D - 1) < 1e-3, (p.stats.area2D / p.stats.area3D).toFixed(5));
  check('plate: distortion', p.stats.maxDistortion < 0.005, (p.stats.maxDistortion * 100).toFixed(3) + '%');
  const [w, h] = bboxUV(p);
  check('plate: size', Math.abs(Math.max(w, h) - 100) < 0.2 && Math.abs(Math.min(w, h) - 60) < 0.2, `${w.toFixed(2)} x ${h.toFixed(2)} (${ms.toFixed(0)} ms)`);
}

// 2. cylinder side wall (demo cylinder r=35 h=90), paint faces with |ny| < 0.5
{
  const soup = Geo.demoCylinder();
  const { res, ms } = await run('cyl', soup, (m) => {
    const g = new Uint8Array(m.nF);
    for (let f = 0; f < m.nF; f++) if (Math.abs(m.fN[3 * f + 1]) < 0.5) g[f] = 1;
    return g;
  });
  const p = res.pieces[0];
  check('cylinder: 1 piece', res.pieces.length === 1);
  check('cylinder: 1 seam', p.stats.seams === 1, `${p.stats.seams}`);
  const [w, h] = bboxUV(p);
  const circ = 96 * 2 * 35 * Math.sin(Math.PI / 96);
  check('cylinder: size', Math.abs(Math.max(w, h) - circ) / circ < 0.015 && Math.abs(Math.min(w, h) - 90) < 1.5, `${w.toFixed(2)} x ${h.toFixed(2)} expect ${circ.toFixed(2)} x 90 (${ms.toFixed(0)} ms)`);
  check('cylinder: distortion', p.stats.maxDistortion < 0.01, (p.stats.maxDistortion * 100).toFixed(3) + '%');
  check('cylinder: no flips', p.stats.flipped === 0, `${p.stats.flipped}`);
}

// 3. hemisphere cap
{
  const R = 40;
  const soup = soupFromQuads(64, 24, (i, j) => {
    const a = (2 * Math.PI * i) / 64, b = (Math.PI / 2) * (1 - j / 24);
    return [R * Math.cos(b) * Math.sin(a), R * Math.sin(b), R * Math.cos(b) * Math.cos(a)];
  });
  const { res, ms } = await run('hemi', soup, paintAll);
  const p = res.pieces[0];
  check('hemisphere: done, no NaN', p && !hasNaN(p), `${ms.toFixed(0)} ms, seams ${p.stats.seams}`);
  check('hemisphere: no flips', p.stats.flipped === 0, `${p.stats.flipped}, max dist ${(p.stats.maxDistortion * 100).toFixed(1)}%`);
}

// 4. long sliver fan 200x20
{
  const pts = [];
  const tri = [];
  const n = 40;
  for (let i = 0; i <= n; i++) pts.push([(200 * i) / n, 0, 0]);
  for (let i = 0; i <= n; i++) pts.push([(200 * i) / n, 0, -20]);
  for (let i = 0; i < n; i++) { tri.push(0, i + 1 + n + 1, i + n + 1); }
  for (let i = 0; i < n; i++) tri.push(0, i + 1, i + 1 + n + 1);
  const soup = Float32Array.from(tri.flatMap((v) => pts[v]));
  const { res } = await run('fan', soup, paintAll);
  const p = res.pieces[0];
  check('sliver fan: no NaN', p && !hasNaN(p));
  const [w, h] = bboxUV(p);
  check('sliver fan: size', Math.abs(Math.max(w, h) - 200) < 0.5 && Math.abs(Math.min(w, h) - 20) < 0.5, `${w.toFixed(2)} x ${h.toFixed(2)}, dist ${(p.stats.maxDistortion * 100).toFixed(3)}%`);
}

// 5. mixed winding
{
  const soup = soupFromQuads(30, 20, (i, j) => [i, 0, -j], () => true, true);
  const { res } = await run('mixed', soup, paintAll);
  check('mixed winding: 1 piece', res.pieces.length === 1, `${res.pieces.length}`);
  check('mixed winding: 1 loop', res.pieces[0].loops.length === 1);
}

// 6. not mirrored: plate facing +z (xy plane), identity view => uv ~ (x,y) up to rotation (rotation-only, det>0)
{
  const soup = soupFromQuads(20, 10, (i, j) => [i * 3, j * 2, 0]); // normal +z
  const m = Geo.buildModel(soup, { upAxis: 'y' });
  const res = await Flat.generate(m, paintAll(m), { quality: 'standard', autoSeam: true, viewMatrix: [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1] }, () => {}, () => false);
  const p = res.pieces[0];
  // compare to P.xy via least squares: uv ~ R*(P - c), check residual small
  let cx = 0, cy = 0, ux = 0, uy = 0;
  for (let v = 0; v < p.nV; v++) { cx += p.P[3 * v]; cy += p.P[3 * v + 1]; ux += p.uv[2 * v]; uy += p.uv[2 * v + 1]; }
  cx /= p.nV; cy /= p.nV; ux /= p.nV; uy /= p.nV;
  let err = 0;
  for (let v = 0; v < p.nV; v++) err = Math.max(err, Math.hypot(p.uv[2 * v] - ux - (p.P[3 * v] - cx), p.uv[2 * v + 1] - uy - (p.P[3 * v + 1] - cy)));
  check('not mirrored + view aligned', err < 0.05, `max err ${err.toFixed(4)} mm`);
}

// 7. cube: top face group 1, one side group 2
{
  const s = 30;
  const q = (a, b, c, d) => [a, b, c, a, c, d];
  const V = [[0,0,0],[s,0,0],[s,s,0],[0,s,0],[0,0,s],[s,0,s],[s,s,s],[0,s,s]];
  const T = [...q(0,3,2,1), ...q(4,5,6,7), ...q(0,1,5,4), ...q(2,3,7,6), ...q(1,2,6,5), ...q(0,4,7,3)];
  const soup = Float32Array.from(T.flatMap((v) => V[v]));
  const m = Geo.buildModel(soup, { upAxis: 'y' });
  const fg = new Uint8Array(m.nF);
  for (let f = 0; f < m.nF; f++) { if (m.fN[3 * f + 1] > 0.9) fg[f] = 1; if (m.fN[3 * f] > 0.9) fg[f] = 2; }
  const res = await Flat.generate(m, fg, { quality: 'fast', autoSeam: true }, () => {}, () => false);
  check('cube: 2 pieces', res.pieces.length === 2, res.pieces.map((p) => bboxUV(p).map((x) => x.toFixed(1)).join('x')).join(', '));
}

// 8. perf: 40k-face curved strip (half cylinder r=60, 200 x 100 quads)
{
  const soup = soupFromQuads(200, 100, (i, j) => { const a = (Math.PI * i) / 200; return [60 * Math.cos(a), j * 1.2, 60 * Math.sin(a)]; });
  const { res, ms } = await run('perf', soup, paintAll);
  const p = res.pieces[0];
  const [w, h] = bboxUV(p);
  check('perf 40k faces', p && ms < 20000, `${p.stats.nFaces} faces, ${ms.toFixed(0)} ms, method ${p.stats.method}, size ${w.toFixed(1)} x ${h.toFixed(1)} (expect ${(Math.PI * 60).toFixed(1)} x 120), max ${(p.stats.maxDistortion * 100).toFixed(3)}%`);
}

// 9. user seam (Cut tool) from a hole to the outer edge opens a slit
{
  const soup = soupFromQuads(100, 60, (i, j) => [i, 0, -j], (i, j) => !(i >= 40 && i < 60 && j >= 20 && j < 40));
  const m = Geo.buildModel(soup, { upAxis: 'y' });
  const seams = new Uint8Array(m.nE);
  let marked = 0;
  for (let e = 0; e < m.nE; e++) {
    const a = 3 * m.edgeV[2 * e], b = 3 * m.edgeV[2 * e + 1];
    const onLine = Math.abs(m.pos[a]) < 1e-6 && Math.abs(m.pos[b]) < 1e-6;
    const zIn = (z) => z >= 10 - 1e-6 && z <= 30 + 1e-6;
    if (onLine && zIn(m.pos[a + 2]) && zIn(m.pos[b + 2])) { seams[e] = 1; marked++; }
  }
  const res = await Flat.generate(m, paintAll(m), { quality: 'standard', autoSeam: true, seams }, () => {}, () => false);
  const p = res.pieces[0];
  check('seam: marked 20 edges', marked === 20, `${marked}`);
  check('seam: 1 piece, hole joined to outline', res.pieces.length === 1 && p.loops.length === 1, `pieces ${res.pieces.length}, loops ${p.loops.length}`);
  check('seam: both slit sides reported as cuts', p.cuts.length === 40, `${p.cuts.length}`);
  check('seam: still flat', p.stats.maxDistortion < 0.005, (p.stats.maxDistortion * 100).toFixed(3) + '%');
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
