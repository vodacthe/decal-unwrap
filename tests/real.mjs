// Run the app's bucket-fill + flatten on a real STL in Node.
//   node tests/real.mjs <file.stl> [angleDeg] [quality]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const code = ['src/geometry.js', 'src/flatten.js', 'src/layout.js'].map((p) => readFileSync(join(root, p), 'utf8')).join('\n');
const { Geo, Flat, Layout } = new Function(code + '\nreturn { Geo, Flat, Layout };')();

const file = process.argv[2];
const angle = Number(process.argv[3] || 30);
const quality = process.argv[4] || 'standard';
const buf = readFileSync(file);
const n = buf.readUInt32LE(80);
const tris = new Float32Array(n * 9);
for (let i = 0; i < n; i++) for (let k = 0; k < 9; k++) tris[9 * i + k] = buf.readFloatLE(84 + 50 * i + 12 + 4 * k);
let t0 = performance.now();
const m = Geo.buildModel(tris, { upAxis: 'z', name: file });
console.log(`model: ${m.nF} faces, ${m.size || m.bbox.size.map((x) => x.toFixed(1)).join(' x ')} mm, ${(performance.now() - t0).toFixed(0)} ms`);

// camera in front (+z), like the default "Trước" view
const eye = [0, m.bbox.size[1] / 2, m.bbox.max[2] + m.bbox.diag * 2.2];
let seed = -1, best = -1;
for (let f = 0; f < m.nF; f++) { const s = m.fN[3 * f + 2] * Math.sqrt(m.fA[f]) * m.fQ[f]; if (s > best && m.fC[3 * f + 2] > m.bbox.max[2] - m.bbox.size[2] * 0.6) { best = s; seed = f; } }
const fg = new Uint8Array(m.nF);
const cosT = Math.cos((angle * Math.PI) / 180);
const ref = new Float32Array(3 * m.nF);
const seen = new Uint8Array(m.nF);
const facing = (f) => { const dx = m.fC[3 * f] - eye[0], dy = m.fC[3 * f + 1] - eye[1], dz = m.fC[3 * f + 2] - eye[2]; return m.fN[3 * f] * dx + m.fN[3 * f + 1] * dy + m.fN[3 * f + 2] * dz < -0.26 * Math.hypot(dx, dy, dz); };
const q = [seed]; seen[seed] = 1; ref.set(m.fN.subarray(3 * seed, 3 * seed + 3), 3 * seed);
while (q.length) {
  const f = q.pop();
  if (f !== seed && !facing(f)) continue;
  fg[f] = 1;
  for (let k = 0; k < 3; k++) {
    const g = m.faceAdj[3 * f + k];
    if (g < 0 || seen[g]) continue;
    const d = ref[3 * f] * m.fN[3 * g] + ref[3 * f + 1] * m.fN[3 * g + 1] + ref[3 * f + 2] * m.fN[3 * g + 2];
    if (d < cosT) continue;
    seen[g] = 1;
    if (m.fQ[g] >= 0.1) ref.set(m.fN.subarray(3 * g, 3 * g + 3), 3 * g); else ref.set(ref.subarray(3 * f, 3 * f + 3), 3 * g);
    q.push(g);
  }
}
let pa = 0, pn = 0; for (let f = 0; f < m.nF; f++) if (fg[f]) { pa += m.fA[f]; pn++; }
console.log(`painted ${pn} faces, ${pa.toFixed(0)} mm² (seed ${seed})`);
const view = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
t0 = performance.now();
let last = '';
const res = await Flat.generate(m, fg, { quality, autoSeam: true, viewMatrix: view, init: process.env.INIT }, (t) => { last = t; }, () => false);
const ms = performance.now() - t0;
for (const p of res.pieces) {
  const s = p.stats;
  console.log(`piece #${p.id}: ${s.nFaces} faces, loops ${p.loops.length}, seams ${s.seams}, ${s.method}, mean ${(s.meanDistortion * 100).toFixed(2)}%, max ${(s.maxDistortion * 100).toFixed(1)}%, flipped ${s.flipped}, area ${s.area3D.toFixed(0)} -> ${s.area2D.toFixed(0)}`);
}
console.log(`flatten ${ms.toFixed(0)} ms; warnings:`, res.warnings);
const L = Layout.build(res.pieces, { paper: 'A4', orientation: 'auto', margin: 10, gap: 4, overlap: 10, rotateMode: 'view', mirror: false, offset: 0, lineWidth: 0.25, fill: false, folds: true, foldAngle: 30, labels: true, calibration: true, heatmap: false, fileName: 'x', groupColors: [] });
console.log('layout:', L.orientation, L.pages.length, 'pages', L.pieceInfo.map((i) => `#${i.id} ${i.w.toFixed(1)}x${i.h.toFixed(1)}${i.tiled ? ' tiled ' + i.tiles : ''}`).join(', '));
export { m, res, fg, Geo, Flat, Layout };
