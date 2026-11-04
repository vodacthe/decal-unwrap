import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const code = ['src/geometry.js', 'src/flatten.js', 'src/layout.js'].map((p) => readFileSync(join(root, p), 'utf8')).join('\n');
const { Geo, Flat, Layout } = new Function(code + '\nreturn { Geo, Flat, Layout };')();

let fails = 0;
const check = (name, cond, info = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); if (!cond) fails++; };

// rectangle piece w x h (mm) with optional square hole, as a minimal Piece
function rectPiece(id, w, h, hole = 0) {
  const pts = [[0, 0], [w, 0], [w, h], [0, h]];
  const uv = [], loops = [[0, 1, 2, 3]];
  for (const p of pts) uv.push(p[0], p[1]);
  if (hole) {
    const cx = w / 2, cy = h / 2, s = hole / 2;
    const hp = [[cx - s, cy - s], [cx - s, cy + s], [cx + s, cy + s], [cx + s, cy - s]]; // CW
    for (const p of hp) uv.push(p[0], p[1]);
    loops.push([4, 5, 6, 7]);
  }
  return {
    id, group: 1 + (id % 8), nV: uv.length / 2, uv: Float64Array.from(uv), loops: loops.map((l) => Uint32Array.from(l)),
    folds: [], F: new Uint32Array(0), faceDistortion: new Float32Array(0),
    stats: { area3D: w * h, area2D: w * h, meanDistortion: 0, maxDistortion: 0, flipped: 0, seams: 0, nFaces: 2 },
  };
}

const base = {
  paper: 'A4', orientation: 'portrait', margin: 10, gap: 4, overlap: 10, rotateMode: 'view', mirror: false, offset: 0,
  lineWidth: 0.25, fill: false, fillColor: '#ffd84d', folds: true, foldAngle: 30, labels: true, calibration: true,
  heatmap: false, fileName: 'test.stl', groupColors: ['#000', '#e5484d', '#3e8ef7', '#30a46c', '#f5a524', '#8e4ec6', '#12a594', '#e93d82', '#a1887f'],
};

function bboxOfPoly(prim) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of prim.rings) for (let i = 0; i < r.length; i += 2) { x0 = Math.min(x0, r[i]); x1 = Math.max(x1, r[i]); y0 = Math.min(y0, r[i + 1]); y1 = Math.max(y1, r[i + 1]); }
  return [x0, y0, x1, y1];
}

// 1. exact scale + inside content area + no overlap
{
  const pieces = [rectPiece(1, 100, 50, 20), rectPiece(2, 60, 60), rectPiece(3, 30, 30), rectPiece(4, 150, 40), rectPiece(5, 70, 90)];
  const L = Layout.build(pieces, base);
  let ok = true, overlap = false, scaleOK = true;
  const boxes = [];
  for (const p of L.pages) {
    const polys = p.prims.filter((q) => q.t === 'poly');
    for (const q of polys) {
      const b = bboxOfPoly(q);
      if (b[0] < 10 - 1e-6 || b[1] < 10 - 1e-6 || b[2] > 200 + 1e-6 || b[3] > 297 - 10 - 9 + 1e-6) ok = false;
      boxes.push([p.index, ...b]);
    }
  }
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (a[0] === b[0] && a[1] < b[3] - 1e-6 && b[1] < a[3] - 1e-6 && a[2] < b[4] - 1e-6 && b[2] < a[4] - 1e-6) overlap = true;
  }
  const first = L.pages.flatMap((p) => p.prims.filter((q) => q.t === 'poly')).map(bboxOfPoly).map((b) => [b[2] - b[0], b[3] - b[1]]);
  const want = [[100, 50], [60, 60], [30, 30], [150, 40], [70, 90]];
  for (const w of want) if (!first.some((s) => Math.abs(s[0] - w[0]) < 1e-6 && Math.abs(s[1] - w[1]) < 1e-6)) scaleOK = false;
  check('inside content area', ok);
  check('no overlap', !overlap);
  check('exact 1:1 sizes', scaleOK, first.map((s) => s.map((x) => x.toFixed(3)).join('x')).join(' '));
  const svg = Layout.toSVG(L, 0, { preview: true });
  check('svg mm header', svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 210 297"'));
  // orientation: CCW (math) outer ring must have negative shoelace area in y-down page space
  const poly = L.pages[0].prims.find((q) => q.t === 'poly');
  check('y-flip is not a mirror', Layout._internal.ringArea(poly.rings[0]) < 0 && poly.holes[0] === false);
}

// 2. auto orientation picks fewer pages; optimize may rotate
{
  const pieces = [rectPiece(1, 260, 150)];
  const Lp = Layout.build(pieces, { ...base, orientation: 'portrait' });
  const La = Layout.build(pieces, { ...base, orientation: 'auto' });
  check('auto -> landscape for wide piece', La.orientation === 'landscape' && La.pages.length < Lp.pages.length, `portrait ${Lp.pages.length} pages, auto ${La.orientation} ${La.pages.length}`);
  const Lo = Layout.build([rectPiece(1, 185, 240)], { ...base, rotateMode: 'optimize', orientation: 'portrait' });
  check('optimize keeps fitting piece on 1 page', Lo.pages.length === 1, `rotated ${Lo.pieceInfo[0].rotated90}`);
}

// 3. tiling covers piece with overlap
{
  const L = Layout.build([rectPiece(1, 400, 150)], { ...base, orientation: 'portrait' });
  const info = L.pieceInfo[0];
  check('tiled', info.tiled && info.tiles >= 3, `${info.tiles} tiles on ${L.pages.length} pages`);
  // every tile's clip covers a region; union of tile regions (in piece coords) spans full width
  const tw = 190, ov = 10;
  const nx = Math.ceil((400 - ov) / (tw - ov));
  check('tile count x', nx * 1 === info.tiles || info.tiles % nx === 0, `nx ${nx}`);
}

// 4. mirror flips x only; offset with clipper absent warns
{
  const L = Layout.build([rectPiece(1, 100, 50, 20)], { ...base, mirror: true, offset: -0.5 });
  check('offset without clipper -> warning', L.warnings.some((w) => w.includes('Clipper')));
  const poly = L.pages[0].prims.find((q) => q.t === 'poly');
  const b = bboxOfPoly(poly);
  check('mirror keeps size', Math.abs(b[2] - b[0] - 100) < 1e-6 && Math.abs(b[3] - b[1] - 50) < 1e-6);
}

// 5. end to end with flattened cylinder + DXF / cut SVG well-formed
{
  const m = Geo.buildModel(Geo.demoCylinder(), { upAxis: 'y' });
  const fg = new Uint8Array(m.nF);
  for (let f = 0; f < m.nF; f++) if (Math.abs(m.fN[3 * f + 1]) < 0.5) fg[f] = 1; else if (m.fN[3 * f + 1] > 0.5) fg[f] = 2;
  const res = await Flat.generate(m, fg, { quality: 'standard', autoSeam: true }, () => {}, () => false);
  const L = Layout.build(res.pieces, { ...base, orientation: 'auto', heatmap: true });
  check('cylinder layout', L.pages.length >= 1, `${res.pieces.length} pieces, ${L.pages.length} pages ${L.orientation}, info ${L.pieceInfo.map((i) => `#${i.id} ${i.w.toFixed(1)}x${i.h.toFixed(1)}${i.tiled ? ' tiled ' + i.tiles : ''}`).join(', ')}`);
  const dxf = Layout.toDXF(res.pieces, base);
  check('dxf structure', dxf.startsWith('0\nSECTION\n2\nHEADER') && dxf.trim().endsWith('0\nEOF') && (dxf.match(/POLYLINE/g) || []).length === (dxf.match(/SEQEND/g) || []).length);
  const cut = Layout.toCutSVG(res.pieces, base);
  check('cut svg', cut.includes('id="cut-lines"') && /width="[\d.]+mm"/.test(cut));
  // mock jsPDF and run toPDF
  const calls = [];
  globalThis.jspdf = { jsPDF: class { constructor(o) { calls.push(['new', o]); } addPage(...a) { calls.push(['addPage', ...a]); } lines(...a) { calls.push(['lines', a[1], a[2]]); } setDrawColor() {} setFillColor() {} setLineWidth() {} setLineDashPattern() {} rect() {} text(t) { calls.push(['text', t]); } setFont() {} setFontSize() {} setTextColor() {} output() { return 'BLOB'; } } };
  const out = await Layout.toPDF(L);
  const ctor = calls.find((c) => c[0] === 'new')[1];
  check('pdf page format', out === 'BLOB' && ctor.unit === 'mm' && ctor.format[0] === L.pageW && ctor.format[1] === L.pageH, JSON.stringify(ctor));
  check('pdf text ascii', calls.filter((c) => c[0] === 'text').every((c) => /^[\x00-\xFF]*$/.test(c[1])));
}

// 6. long wall band (side wall of an 8-corner prism) is cut at corners and nested on one sheet
{
  const outline = [[-120, -40], [-100, -60], [100, -60], [120, -40], [120, 40], [100, 60], [-100, 60], [-120, 40]];
  const H = 25, out = [];
  for (let s = 0; s < outline.length; s++) {
    const a = outline[s], b = outline[(s + 1) % outline.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), steps = Math.max(1, Math.round(len / 5));
    for (let i = 0; i < steps; i++) {
      const p = [a[0] + ((b[0] - a[0]) * i) / steps, a[1] + ((b[1] - a[1]) * i) / steps];
      const q = [a[0] + ((b[0] - a[0]) * (i + 1)) / steps, a[1] + ((b[1] - a[1]) * (i + 1)) / steps];
      const p0 = [p[0], 0, p[1]], q0 = [q[0], 0, q[1]], p1 = [p[0], H, p[1]], q1 = [q[0], H, q[1]];
      out.push(...p0, ...q0, ...q1, ...p0, ...q1, ...p1);
    }
  }
  const m = Geo.buildModel(Float32Array.from(out), { upAxis: 'y' });
  const res = await Flat.generate(m, new Uint8Array(m.nF).fill(1), { quality: 'fast', autoSeam: true }, () => {}, () => false);
  const strip = res.pieces[0];
  const perim = outline.reduce((s, a, i) => { const b = outline[(i + 1) % outline.length]; return s + Math.hypot(b[0] - a[0], b[1] - a[1]); }, 0);
  check('band unwraps to one strip', res.pieces.length === 1 && strip.stats.seams === 1, `${res.pieces.length} piece(s), seams ${strip.stats.seams}`);
  const Ltiled = Layout.build(res.pieces, { ...base, orientation: 'auto', rotateMode: 'optimize', splitLong: false });
  const L = Layout.build(res.pieces, { ...base, orientation: 'auto', rotateMode: 'optimize' });
  const parts = L.pieceInfo;
  check('without splitting it is tiled', Ltiled.pieceInfo[0].tiled && Ltiled.pages.length > 1, `${Ltiled.pages.length} pages`);
  check('split strip fits on one sheet', L.pages.length === 1 && parts.every((p) => !p.tiled), `${L.pages.length} page(s) ${L.orientation}, parts ${parts.map((p) => `#${p.id} ${p.w.toFixed(0)}x${p.h.toFixed(0)}`).join(' ')} (perimeter ${perim.toFixed(0)} mm)`);
  check('parts numbered #1.1…', parts.length >= 3 && parts.every((p, i) => p.id === `1.${i + 1}` && p.parentId === 1));
  // cuts land on corners: every part outline is made of whole wall faces (lengths are sums of wall segments)
  const segs = outline.map((a, i) => { const b = outline[(i + 1) % outline.length]; return Math.hypot(b[0] - a[0], b[1] - a[1]); });
  const longest = parts.map((p) => Math.max(p.w, p.h));
  const sums = new Set();
  for (let i = 0; i < segs.length; i++) { let s = 0; for (let j = 0; j < segs.length; j++) { s += segs[(i + j) % segs.length]; sums.add(Math.round(s)); } }
  // fewest parts possible (3 for 673 mm on A4), and at least one cut sits on a corner
  check('fewest parts', parts.length === 3, `${parts.length} parts`);
  check('a cut on a corner', longest.some((l) => [...sums].some((s) => Math.abs(s - l) < 6)), `part lengths ${longest.map((l) => l.toFixed(0)).join(', ')}`);
  const totalArea = parts.reduce((s, p) => s + p.w * p.h, 0);
  check('area preserved', Math.abs(totalArea - perim * H) / (perim * H) < 0.02, `${totalArea.toFixed(0)} vs ${(perim * H).toFixed(0)} mm²`);
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
