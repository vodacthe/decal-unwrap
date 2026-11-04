// Project file: encode -> decode round trip, demo projects, damaged data.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { Project } = new Function(readFileSync(join(root, 'src/project.js'), 'utf8') + '\nreturn { Project };')();

let fails = 0;
const check = (name, cond, info = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); if (!cond) fails++; };
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

const nF = 5000, nE = 7600;
const raw = new Float32Array(nF * 9).map((_, i) => Math.sin(i) * 50);
const faceGroup = new Uint8Array(nF).map((_, i) => (i % 97 < 30 ? 2 : i % 211 < 5 ? 7 : 0));
const blocked = new Uint8Array(nF).map((_, i) => (i > 4000 && i < 4100 ? 1 : 0));
const seams = new Uint8Array(nE).map((_, i) => (i % 500 === 0 ? 1 : 0));
const job = {
  name: 'part.stl', raw, unitScale: 25.4, upAxis: 'z', faceGroup, blocked, seams,
  settings: { paper: 'A3', mirror: false, bleed: 1.5 }, unwrap: { islands: true, tol: 2 }, view: { pos: [1, 2, 3], target: [0, 0, 0] },
  artwork: { 3: { img: 'data:image/png;base64,AAAA', x: 1, y: 2, s: 30, r: 45 } },
};
const text = Project.encode(job);
const back = Project.decode(text);
check('model round trip', same(back.raw, raw), `${(text.length / 1e3).toFixed(0)} kB`);
check('paint round trip', same(back.faceGroup, faceGroup) && same(back.blocked, blocked) && same(back.seams, seams));
check('settings, view, artwork kept', back.settings.paper === 'A3' && back.settings.bleed === 1.5 && back.view.pos[2] === 3 && back.artwork[3].r === 45);
check('units and up axis kept', back.unitScale === 25.4 && back.upAxis === 'z');

const demo = Project.decode(Project.encode({ ...job, raw: null, demo: 'cyl' }));
check('demo project has no model data', demo.raw === null && demo.demo === 'cyl');

const o = JSON.parse(text);
o.model = o.model.slice(0, 40) + (o.model[40] === 'A' ? 'B' : 'A') + o.model.slice(41);
let err = '';
try { Project.decode(JSON.stringify(o)); } catch (e) { err = e.message; }
check('damaged model data is rejected', /damaged/.test(err), err);
err = '';
try { Project.decode('{"app":"other"}'); } catch (e) { err = e.message; }
check('other JSON is rejected', /not a project/.test(err), err);

const p = Project.decodePaint(Project.encodePaint({ faceGroup, blocked, seams, time: 5 }));
check('autosave paint round trip', same(p.faceGroup, faceGroup) && same(p.seams, seams) && p.time === 5);
check('fingerprint changes with the model', Project.fingerprint(raw) !== Project.fingerprint(raw.map((v) => v + 1)));

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
if (fails) process.exit(1);
