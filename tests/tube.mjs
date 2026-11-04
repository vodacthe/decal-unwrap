// Sample tube fully painted: each flat end cap must come out as one whole disc.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const code = ['src/geometry.js', 'src/flatten.js'].map((p) => readFileSync(join(root, p), 'utf8')).join('\n');
const { Geo, Flat } = new Function(code + '\nreturn { Geo, Flat };')();

const m = Geo.buildModel(Geo.demoCylinder(), { upAxis: 'y' });
const fg = new Uint8Array(m.nF).fill(1);
const res = await Flat.generate(m, fg, { quality: 'standard', autoSeam: true, islands: true }, () => {}, () => false);
let fail = 0;
for (const p of res.pieces) {
  let up = 0, down = 0;
  for (const f of p.faceIds) { const ny = m.fN[3 * f + 1]; if (ny > 0.99) up++; else if (ny < -0.99) down++; }
  const kind = up === p.faceIds.length ? 'top cap' : down === p.faceIds.length ? 'bottom cap' : up || down ? 'MIXED' : 'wall';
  console.log(`#${p.id}: ${p.faceIds.length} faces, ${kind}, area ${p.stats.area3D.toFixed(0)} mm², max stretch ${(p.stats.maxDistortion * 100).toFixed(2)}%`);
  if (kind === 'MIXED') fail++;
}
let capsUp = 0, capsDown = 0, capFacesUp = 0, capFacesDown = 0;
for (let f = 0; f < m.nF; f++) { const ny = m.fN[3 * f + 1]; if (ny > 0.99) capFacesUp++; else if (ny < -0.99) capFacesDown++; }
for (const p of res.pieces) {
  const all = (pred) => p.faceIds.every((f) => pred(m.fN[3 * f + 1]));
  if (all((y) => y > 0.99) && p.faceIds.length === capFacesUp) capsUp++;
  if (all((y) => y < -0.99) && p.faceIds.length === capFacesDown) capsDown++;
}
const ok = !fail && capsUp === 1 && capsDown === 1;
console.log(ok ? 'PASS  both end caps are single whole discs' : `FAIL  whole top caps ${capsUp}, whole bottom caps ${capsDown}, mixed ${fail}`);
if (!ok) process.exit(1);
