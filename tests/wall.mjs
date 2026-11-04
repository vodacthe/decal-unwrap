// Reproduce the "outer wall band" case: paint the side wall around the panel
// perimeter, unwrap, and lay it out on A4.  node tests/wall.mjs <file.stl> [paper]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const code = ['src/geometry.js', 'src/flatten.js', 'src/layout.js'].map((p) => readFileSync(join(root, p), 'utf8')).join('\n');
const { Geo, Flat, Layout } = new Function(code + '\nreturn { Geo, Flat, Layout };')();

const buf = readFileSync(process.argv[2]);
const paper = process.argv[3] || 'A4';
const n = buf.readUInt32LE(80);
const tris = new Float32Array(n * 9);
for (let i = 0; i < n; i++) for (let k = 0; k < 9; k++) tris[9 * i + k] = buf.readFloatLE(84 + 50 * i + 12 + 4 * k);
const m = Geo.buildModel(tris, { upAxis: 'z' });

// seed: a big face on the top outer wall (normal pointing +y, horizontal)
let seed = -1, best = -1;
for (let f = 0; f < m.nF; f++) {
  if (m.fN[3 * f + 1] < 0.9 || Math.abs(m.fN[3 * f + 2]) > 0.3) continue;
  const s = m.fA[f] * m.fQ[f] + m.fC[3 * f + 1] * 1e-3;
  if (m.fC[3 * f + 1] > m.bbox.size[1] * 0.9 && s > best) { best = s; seed = f; }
}
// flood across smooth edges, staying on near-vertical faces (the wall)
const fg = new Uint8Array(m.nF), seen = new Uint8Array(m.nF);
const cosT = Math.cos((30 * Math.PI) / 180);
const q = [seed]; seen[seed] = 1;
while (q.length) {
  const f = q.pop();
  if (Math.abs(m.fN[3 * f + 2]) > Number(process.env.NZ || 0.5)) continue;
  fg[f] = 1;
  for (let k = 0; k < 3; k++) {
    const g = m.faceAdj[3 * f + k];
    if (g < 0 || seen[g]) continue;
    const d = m.fN[3 * f] * m.fN[3 * g] + m.fN[3 * f + 1] * m.fN[3 * g + 1] + m.fN[3 * f + 2] * m.fN[3 * g + 2];
    if (d < cosT && m.fQ[g] >= 0.1) continue;
    seen[g] = 1; q.push(g);
  }
}
let A = 0, cnt = 0; for (let f = 0; f < m.nF; f++) if (fg[f]) { A += m.fA[f]; cnt++; }
console.log(`painted wall: ${cnt} faces, ${A.toFixed(0)} mm² (seed ${seed})`);
const res = await Flat.generate(m, fg, { quality: 'standard', autoSeam: true, islands: process.env.ISLANDS !== '0', viewMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }, () => {}, () => false);
for (const p of res.pieces) console.log(`piece #${p.id}: ${p.stats.nFaces} faces, seams ${p.stats.seams}, max ${(p.stats.maxDistortion * 100).toFixed(2)}%, folds ${p.folds.length}`);
console.log('warnings:', res.warnings);
for (const splitLong of [false, true]) {
  const L = Layout.build(res.pieces, {
    paper, orientation: 'auto', margin: 10, gap: 4, overlap: 10, rotateMode: 'optimize', mirror: true, offset: 0, lineWidth: 0.25,
    fill: false, folds: true, foldAngle: 30, labels: true, clean: true, calibration: true, heatmap: false, fileName: 'x', groupColors: [], splitLong,
  });
  console.log(`splitLong=${splitLong}: ${L.pages.length} page(s) ${L.orientation}; pieces ${L.pieceInfo.map((i) => `#${i.id} ${i.w.toFixed(0)}x${i.h.toFixed(0)}${i.tiled ? ' tiled ' + i.tiles : ''}`).join(', ')}`);
}
export { m, fg, res, Layout };
