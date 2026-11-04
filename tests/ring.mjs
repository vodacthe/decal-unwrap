// Real model: find the walls of the big display window (a ring of side faces)
// and unwrap them.  node tests/ring.mjs <file.stl> [ringIndex]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const code = ['src/geometry.js', 'src/flatten.js'].map((p) => readFileSync(join(root, p), 'utf8')).join('\n');
const { Geo, Flat } = new Function(code + '\nreturn { Geo, Flat };')();

const buf = readFileSync(process.argv[2]);
const n = buf.readUInt32LE(80);
const tris = new Float32Array(n * 9);
for (let i = 0; i < n; i++) for (let k = 0; k < 9; k++) tris[9 * i + k] = buf.readFloatLE(84 + 50 * i + 12 + 4 * k);
const m = Geo.buildModel(tris, { upAxis: 'z' });
// main panel direction = area-weighted dominant normal axis
const acc = [0, 0, 0];
for (let f = 0; f < m.nF; f++) for (let k = 0; k < 3; k++) acc[k] += Math.abs(m.fN[3 * f + k]) * m.fA[f];
const ax = acc.indexOf(Math.max(...acc));
const side = new Uint8Array(m.nF);
for (let f = 0; f < m.nF; f++) if (Math.abs(m.fN[3 * f + ax]) < Number(process.env.T || 0.85)) side[f] = 1;
const comp = new Int32Array(m.nF).fill(-1);
const comps = [];
for (let s = 0; s < m.nF; s++) {
  if (!side[s] || comp[s] >= 0) continue;
  const id = comps.length, q = [s], faces = [];
  comp[s] = id;
  let a = 0;
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  while (q.length) {
    const f = q.pop(); faces.push(f); a += m.fA[f];
    for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], m.fC[3 * f + k]); hi[k] = Math.max(hi[k], m.fC[3 * f + k]); }
    for (let k = 0; k < 3; k++) { const g = m.faceAdj[3 * f + k]; if (g >= 0 && side[g] && comp[g] < 0) { comp[g] = id; q.push(g); } }
  }
  comps.push({ id, a, faces, size: hi.map((h, k) => (h - lo[k]).toFixed(0)).join('x') });
}
comps.sort((p, q) => q.a - p.a);
console.log('panel axis', ax, '\n' + comps.slice(0, 8).map((c, i) => `[${i}] ${c.faces.length} faces, area ${c.a.toFixed(0)}, ${c.size}`).join('\n'));
const pick = comps[Number(process.argv[3] ?? 1)];
const fg = new Uint8Array(m.nF);
for (const f of pick.faces) fg[f] = 1;
const t0 = Date.now();
const res = await Flat.generate(m, fg, { quality: 'standard', autoSeam: true, islands: true }, () => {}, () => false);
for (const p of res.pieces) console.log(`piece #${p.id}: ${p.faceIds.length} faces, area ${p.stats.area3D.toFixed(0)}, seams ${p.stats.seams}, max ${(p.stats.maxDistortion * 100).toFixed(2)}%, mean ${(p.stats.meanDistortion * 100).toFixed(2)}%`);
console.log(`${Date.now() - t0} ms`, res.warnings);
