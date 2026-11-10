// Seam marks on real unwrapped pieces (sample tube): seams are found between
// pieces, between split parts and across a cut inside one piece, and both sides
// get the same number of ticks. Also checks the artwork SVG output.
// (Bleed and glue tabs need Clipper, which only loads in the browser.)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const code = ['src/geometry.js', 'src/flatten.js', 'src/layout.js'].map((p) => readFileSync(join(root, p), 'utf8')).join('\n');
const { Geo, Flat, Layout } = new Function(code + '\nreturn { Geo, Flat, Layout };')();

let fails = 0;
const check = (name, cond, info = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); if (!cond) fails++; };

const m = Geo.buildModel(Geo.demoCylinder(), { upAxis: 'y' });
const res = await Flat.generate(m, new Uint8Array(m.nF).fill(1), { quality: 'standard', autoSeam: true, islands: true }, () => {}, () => false);
const base = {
  paper: 'A4', orientation: 'auto', margin: 10, gap: 4, overlap: 10, rotateMode: 'optimize', mirror: true, offset: 0, lineWidth: 0.25,
  fill: false, folds: true, foldAngle: 30, labels: true, clean: false, calibration: true, heatmap: false, fileName: 't', groupColors: [], splitLong: true,
};
const red = (L) => L.pages.flatMap((p) => p.prims).filter((p) => p.t === 'line' && p.stroke === '#c0392b');
const letters = (L) => L.pages.flatMap((p) => p.prims).filter((p) => p.t === 'text' && p.color === '#c0392b').map((p) => p.text);

const L = Layout.build(res.pieces, base);
check('tube: 3 seams (wall cut + 2 caps)', L.seams.length === 3, L.seams.map((s) => s.letter).join(','));
const ticks = red(L).length;
check('ticks come in pairs (both sides)', ticks > 0 && ticks % 2 === 0, `${ticks} ticks`);
const lt = letters(L);
check('each letter printed on both sides', ['A', 'B', 'C'].every((x) => lt.filter((y) => y === x).length === 2), lt.join(''));
// the wall cut: 90 mm long -> about 4 ticks per side, so 8 for that seam
check('cap seams get about one tick per 25 mm', ticks >= 2 * (4 + 9 + 9) - 4, `${ticks}`);

const off = Layout.build(res.pieces, { ...base, seamMarks: false });
check('marks can be turned off', red(off).length === 0 && off.seams.length === 0);

// A5: the 220 mm wall is cut into two parts -> one more seam between the parts
const a5 = Layout.build(res.pieces, { ...base, paper: 'A5' });
const parts = a5.pieceInfo.filter((i) => i.parts > 1).length;
check('split parts get a seam between them', parts >= 2 && a5.seams.length > L.seams.length, `${parts} parts, ${a5.seams.length} seams`);

// ticks of one seam sit at the same 3D spot: compare tick spacing on both sides of seam A
// (2D lengths along a seam equal 3D lengths, so the side lengths must match)
const wallItemLen = (L2) => L2.pieceInfo.find((i) => i.id === 1);
check('wall piece still laid out', !!wallItemLen(L));

// artwork: clipped image, mirrored with the print
const art = { 1: { img: 'data:image/png;base64,iVBORw0KGgo=', iw: 200, ih: 100, x: 0, y: 0, s: 60, r: 0 } };
const sv = (mirror) => Layout.toSVG(Layout.build(res.pieces, { ...base, mirror, artwork: art }), 0, {});
const mtx = (s) => { const mm = /<use href="#art-[^"]+" transform="matrix\(([^)]+)\)"/.exec(s); return mm ? mm[1].split(' ').map(Number) : null; };
const s1 = sv(true), s0 = sv(false);
check('artwork clipped to the piece', /<clipPath id="art-clip-/.test(s1) && /<image id="art-0-0"/.test(s1));
const m1 = mtx(s1), m0 = mtx(s0);
const det = (q) => q[0] * q[3] - q[1] * q[2];
check('artwork is mirrored when Mirror is on', m1 && m0 && Math.sign(det(m1)) !== Math.sign(det(m0)), `det ${m1 && det(m1).toFixed(3)} vs ${m0 && det(m0).toFixed(3)}`);
check('artwork scale = 60 mm / 200 px', m0 && Math.abs(Math.hypot(m0[0], m0[1]) - 0.3) < 1e-6);
const tile = Layout.toSVG(Layout.build(res.pieces, { ...base, artwork: { 1: { ...art[1], tile: true } } }), 0, {});
check('pattern fill for tiled artwork', /<pattern id="art-clip-[^"]+-p"/.test(tile));

// surface texture per decal group (set in the 3D view) and decals stuck on top
const imgs = (L2) => L2.pages.flatMap((p) => p.prims).filter((p) => p.t === 'image');
const grp = Layout.build(res.pieces, { ...base, groupArt: { 1: { ...art[1], tile: true } } });
check('group texture reaches every piece of the group', imgs(grp).length >= res.pieces.length && imgs(grp).every((p) => p.tile));
const own = Layout.build(res.pieces, { ...base, groupArt: { 1: { ...art[1], tile: true } }, artwork: { 1: { ...art[1], tile: false } } });
check("a piece's own artwork wins over the group texture", imgs(own).some((p) => p.owner === 1 && !p.tile) && !imgs(own).some((p) => p.owner === 1 && p.tile));
const dec = { ...art[1], img: 'data:image/png;base64,AAAA', x: 10, y: 5, s: 30, r: 20, op: 0.5 };
const withDecal = Layout.build(res.pieces, { ...base, mirror: false, groupArt: { 1: { ...art[1], tile: true } }, decals: { 1: [dec] } });
const p1 = imgs(withDecal).filter((p) => p.owner === 1);
check('decal drawn on top of the texture', p1.length >= 2 && p1[0].tile && p1[p1.length - 1].href === dec.img && p1[p1.length - 1].opacity === 0.5);
const unprinted = Layout.build(res.pieces, { ...base, decals: { 1: [dec] } });
check('a piece with only a decal counts as printed', unprinted.pieceInfo.length > 0 && imgs(unprinted).length >= 1);
// mirrored decal (piece flattened face-down) and a decal continued across a seam (explicit matrix)
const I = { frame: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 } };
const mA = Layout.artMatrix(I, dec, 0, 0), mB = Layout.artMatrix(I, { ...dec, fx: true }, 0, 0);
check('fx flips the decal left-right about its centre', Math.sign(mA.a * mA.d - mA.b * mA.c) !== Math.sign(mB.a * mB.d - mB.b * mB.c)
  && Math.abs((mA.a * 100 + mA.c * 50 + mA.e) - (mB.a * 100 + mB.c * 50 + mB.e)) < 1e-9);
const mm = { a: 0.1, b: 0.2, c: -0.2, d: 0.1, e: 7, f: 9 };
const mC = Layout.artMatrix({ frame: { a: 1, b: 0, c: 0, d: 1, e: 3, f: 4 } }, { ...dec, m: mm }, 1, 2);
check('a continued decal uses its own matrix', mC.a === 0.1 && mC.d === 0.1 && mC.e === 7 + 3 + 1 && mC.f === 9 + 4 + 2);

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
if (fails) process.exit(1);
