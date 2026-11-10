// ---------------------------------------------------------------------------
// Layout: orients pieces, applies offset, packs them on pages at 1:1 (mm),
// tiles oversize pieces, renders SVG / PDF / cut-SVG / DXF and prints.
// Page space: mm, origin top-left, y down.
// ---------------------------------------------------------------------------
const Layout = (() => {
  const PAPERS = {
    A2: [420, 594], A3: [297, 420], A4: [210, 297], A5: [148, 210], A6: [105, 148],
    B5: [176, 250], Letter: [215.9, 279.4], Legal: [215.9, 355.6], Tabloid: [279.4, 431.8],
  };
  const FOOTER = 9;
  const LABEL_H = 5;
  const r3 = (n) => Math.round(n * 1000) / 1000;

  // printed and warning text (settings.lang: 'en' default, 'vi')
  const TXT = {
    en: {
      clipper: 'The offset library (Clipper) did not load, so the cut line offset was skipped.',
      vanished: 'Piece #{id} vanished: the inward offset is larger than the piece.',
      label: '#{id} · Group {g} · {w} × {h} mm',
      ruler: '← must measure exactly 50 mm at 100% scale',
      portrait: 'portrait', landscape: 'landscape',
      tile: 'Piece #{id} · sheet {k}/{n} (row {r}, col {c}) · {w} × {h} mm',
      overlap: 'overlap', overlapZone: 'overlap zone',
      tiled: 'Piece #{id} ({w} × {h} mm) is larger than the paper, so it is tiled over {n} sheets ({ov} mm overlap).',
      footShort: 'Page {i}/{n} · Print at 100%, Fit to page off',
      foot: 'Page {i}/{n} · {file} · {paper} {orient} · Print at 100% (Actual size), Fit to page off',
      page: 'Page {i}/{n}',
      noPdf: 'The PDF library (jsPDF) did not load. Check your internet connection and try again.',
    },
    vi: {
      clipper: 'Thư viện bù đường cắt (Clipper) chưa tải được nên bỏ qua bù đường cắt.',
      vanished: 'Mảnh #{id} biến mất vì độ co vào lớn hơn cả mảnh.',
      label: '#{id} · Nhóm {g} · {w} × {h} mm',
      ruler: '← phải đo đúng 50 mm khi in 100%',
      portrait: 'dọc', landscape: 'ngang',
      tile: 'Mảnh #{id} · tờ {k}/{n} (hàng {r}, cột {c}) · {w} × {h} mm',
      overlap: 'dán chồng', overlapZone: 'vùng dán chồng',
      tiled: 'Mảnh #{id} ({w} × {h} mm) lớn hơn khổ giấy nên được chia thành {n} tờ để ghép (chồng mép {ov} mm).',
      footShort: 'Trang {i}/{n} · In 100%, tắt Fit to page',
      foot: 'Trang {i}/{n} · {file} · {paper} {orient} · In 100% (Actual size), tắt Fit to page',
      page: 'Trang {i}/{n}',
      noPdf: 'Thư viện PDF (jsPDF) chưa tải được. Kiểm tra kết nối mạng rồi thử lại.',
    },
  };
  function txt(settings, key, vars) {
    const lang = settings && settings.lang;
    let s = (TXT[lang] && TXT[lang][key]) || TXT.en[key] || key;
    if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : ''));
    return s;
  }

  function ascii(s) {
    return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
      .replace(/←/g, '<-').replace(/→/g, '->').replace(/[^\x00-\xFF]/g, '');
  }

  function ringArea(r) {
    let s = 0;
    const n = r.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      s += r[2 * i] * r[2 * j + 1] - r[2 * j] * r[2 * i + 1];
    }
    return s / 2;
  }

  function reverseRing(r) {
    const out = new Array(r.length);
    const n = r.length / 2;
    for (let i = 0; i < n; i++) { out[2 * i] = r[2 * (n - 1 - i)]; out[2 * i + 1] = r[2 * (n - 1 - i) + 1]; }
    return out;
  }

  // Ramer–Douglas–Peucker on a closed ring (flat array).
  function simplifyRing(r, tol) {
    const n = r.length / 2;
    if (n <= 8) return r.slice();
    // split at the two most distant points
    let far = 0, best = -1;
    for (let i = 1; i < n; i++) {
      const d = (r[2 * i] - r[0]) ** 2 + (r[2 * i + 1] - r[1]) ** 2;
      if (d > best) { best = d; far = i; }
    }
    const keep = new Uint8Array(n);
    keep[0] = 1; keep[far] = 1;
    const t2 = tol * tol;
    const stack = [[0, far], [far, n]];
    while (stack.length) {
      const [a, b] = stack.pop();
      if (b - a < 2) continue;
      const ax = r[2 * a], ay = r[2 * a + 1];
      const bi = b % n, bx = r[2 * bi], by = r[2 * bi + 1];
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
      let mi = -1, md = -1;
      for (let i = a + 1; i < b; i++) {
        const px = r[2 * i] - ax, py = r[2 * i + 1] - ay;
        let d;
        if (L2 < 1e-18) d = px * px + py * py;
        else { const c = px * dy - py * dx; d = (c * c) / L2; }
        if (d > md) { md = d; mi = i; }
      }
      if (md > t2) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
    }
    const out = [];
    for (let i = 0; i < n; i++) if (keep[i]) out.push(r[2 * i], r[2 * i + 1]);
    return out.length >= 6 ? out : r.slice();
  }

  function convexHull(pts) {
    const P = [];
    for (let i = 0; i < pts.length; i += 2) P.push([pts[i], pts[i + 1]]);
    P.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (P.length < 3) return P;
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [], upper = [];
    for (const p of P) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
    for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
    upper.pop(); lower.pop();
    return lower.concat(upper);
  }

  // Angle that makes the minimum-area bounding rectangle axis aligned.
  function minRectAngle(pts) {
    const H = convexHull(pts);
    if (H.length < 3) return 0;
    let bestA = 0, best = Infinity;
    for (let i = 0; i < H.length; i++) {
      const a = H[i], b = H[(i + 1) % H.length];
      const th = -Math.atan2(b[1] - a[1], b[0] - a[0]);
      const c = Math.cos(th), s = Math.sin(th);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of H) {
        const x = c * p[0] - s * p[1], y = s * p[0] + c * p[1];
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      const area = (x1 - x0) * (y1 - y0);
      if (area < best - 1e-9) { best = area; bestA = th; }
    }
    return bestA;
  }

  function clipperLib() {
    if (typeof window !== 'undefined' && window.ClipperLib) return window.ClipperLib;
    if (typeof globalThis !== 'undefined' && globalThis.ClipperLib) return globalThis.ClipperLib;
    return null;
  }

  // rings in math coords (outer positive, holes negative)
  function offsetRings(rings, delta) {
    const C = clipperLib();
    if (!C) return null;
    const S = 1000;
    const paths = rings.map((r) => {
      const p = [];
      for (let i = 0; i < r.length; i += 2) p.push({ X: Math.round(r[i] * S), Y: Math.round(r[i + 1] * S) });
      return p;
    });
    const co = new C.ClipperOffset(2, 0.01 * S);
    co.AddPaths(paths, C.JoinType.jtRound, C.EndType.etClosedPolygon);
    const sol = new C.Paths();
    co.Execute(sol, delta * S);
    return sol.map((p) => {
      const out = [];
      for (const q of p) out.push(q.X / S, q.Y / S);
      return out;
    }).filter((r) => r.length >= 6);
  }

  function heatColor(d) {
    const g = [0x3b, 0xb2, 0x73], y = [0xf2, 0xc9, 0x4c], r = [0xe5, 0x48, 0x4d];
    let a, b, t;
    if (d <= 0.02) { a = g; b = y; t = Math.max(0, d) / 0.02; }
    else { a = y; b = r; t = Math.min(1, (d - 0.02) / 0.03); }
    const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }

  function chainFolds(folds, minAngle) {
    const edges = folds.filter((f) => f.angle >= minAngle);
    if (!edges.length) return [];
    const adj = new Map();
    edges.forEach((e, i) => {
      if (!adj.has(e.a)) adj.set(e.a, []);
      if (!adj.has(e.b)) adj.set(e.b, []);
      adj.get(e.a).push(i); adj.get(e.b).push(i);
    });
    const used = new Uint8Array(edges.length);
    const chains = [];
    const walk = (start) => {
      const chain = [start];
      let v = start;
      for (;;) {
        const list = adj.get(v);
        let next = -1;
        for (const i of list) if (!used[i]) { next = i; break; }
        if (next < 0) break;
        used[next] = 1;
        v = edges[next].a === v ? edges[next].b : edges[next].a;
        chain.push(v);
        if (adj.get(v).length !== 2) break;
      }
      return chain;
    };
    for (const [v, list] of adj) if (list.length !== 2) while (list.some((i) => !used[i])) chains.push(walk(v));
    for (let i = 0; i < edges.length; i++) if (!used[i]) chains.push(walk(edges[i].a));
    return chains.filter((c) => c.length >= 2);
  }

  // Prepare one piece: oriented, mirrored, simplified, offset, in y-down piece space.
  function preparePiece(piece, settings, warnings) {
    const { uv } = piece;
    const allPts = [];
    for (const L of piece.loops) for (const v of L) allPts.push(uv[2 * v], uv[2 * v + 1]);
    let th = 0;
    if (settings.rotateMode === 'optimize' && allPts.length >= 6) th = minRectAngle(allPts);
    else if (allPts.length >= 6) {
      // keep the view orientation, but straighten a slight tilt (< 12°) to the bounding rectangle
      const a = minRectAngle(allPts);
      const q = Math.PI / 2;
      const snap = a - Math.round(a / q) * q;
      if (Math.abs(snap) < (12 * Math.PI) / 180) th = snap;
    }
    let c = Math.cos(th), s = Math.sin(th);
    if (settings.rotateMode === 'optimize') {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let i = 0; i < allPts.length; i += 2) {
        const x = c * allPts[i] - s * allPts[i + 1], y = s * allPts[i] + c * allPts[i + 1];
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      if (y1 - y0 > x1 - x0) { th += Math.PI / 2; c = Math.cos(th); s = Math.sin(th); }
    }
    const mx = settings.mirror ? -1 : 1;
    const T = (u, v) => [mx * (c * u - s * v), s * u + c * v];
    let rings = piece.loops.map((L) => {
      const r = [];
      for (const v of L) { const p = T(uv[2 * v], uv[2 * v + 1]); r.push(p[0], p[1]); }
      return r;
    }).filter((r) => r.length >= 6);
    // normalise orientation: outer (largest |area|) positive, others negative
    let oi = 0;
    const areas = rings.map(ringArea);
    for (let i = 1; i < rings.length; i++) if (Math.abs(areas[i]) > Math.abs(areas[oi])) oi = i;
    rings = rings.map((r, i) => {
      const a = areas[i];
      if ((i === oi && a < 0) || (i !== oi && a > 0)) return reverseRing(r);
      return r;
    });
    rings = rings.map((r) => simplifyRing(r, 0.02));
    // morphological opening: shrink then grow by 0.25 mm removes hair-thin spikes
    // left by one-triangle-wide strips, without changing the real outline
    if (settings.clean !== false) {
      const shrunk = offsetRings(rings, -0.25);
      const opened = shrunk && shrunk.length ? offsetRings(shrunk, 0.25) : null;
      if (opened && opened.length) rings = opened.map((r) => simplifyRing(r, 0.02));
    }
    const off = Number(settings.offset) || 0;
    if (Math.abs(off) >= 0.01) {
      const res = offsetRings(rings, off);
      if (res === null) warnings.add(txt(settings, 'clipper'));
      else if (!res.length) { warnings.add(txt(settings, 'vanished', { id: piece.id })); rings = []; }
      else rings = res;
    }
    // user seams: chained into polylines, always drawn as cut lines
    const cuts = chainFolds((piece.cuts || []).map((c) => ({ a: c.a, b: c.b, angle: 180 })), 0).map((ch) => {
      const r = [];
      for (const v of ch) { const p = T(uv[2 * v], uv[2 * v + 1]); r.push(p[0], p[1]); }
      return r;
    });
    const folds = settings.folds ? chainFolds(piece.folds || [], settings.foldAngle).map((ch) => {
      const r = [];
      for (const v of ch) { const p = T(uv[2 * v], uv[2 * v + 1]); r.push(p[0], p[1]); }
      return r;
    }) : [];
    let heat = null;
    if (settings.heatmap && piece.F && piece.faceDistortion) {
      const nF = piece.F.length / 3;
      const tris = new Float32Array(nF * 6), colors = new Array(nF);
      for (let f = 0; f < nF; f++) {
        for (let k = 0; k < 3; k++) {
          const v = piece.F[3 * f + k];
          const p = T(uv[2 * v], uv[2 * v + 1]);
          tris[6 * f + 2 * k] = p[0]; tris[6 * f + 2 * k + 1] = p[1];
        }
        colors[f] = heatColor(piece.faceDistortion[f]);
      }
      heat = { tris, colors };
    }
    // bbox in math coords, then flip to y-down
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const grow = (r) => { for (let i = 0; i < r.length; i += 2) { if (r[i] < x0) x0 = r[i]; if (r[i] > x1) x1 = r[i]; if (r[i + 1] < y0) y0 = r[i + 1]; if (r[i + 1] > y1) y1 = r[i + 1]; } };
    rings.forEach(grow);
    if (!rings.length) return null;
    folds.forEach(grow);
    cuts.forEach(grow);
    const toDown = (r) => { const o = new Array(r.length); for (let i = 0; i < r.length; i += 2) { o[i] = r[i] - x0; o[i + 1] = y1 - r[i + 1]; } return o; };
    const holes = rings.map((r) => ringArea(r) < 0);
    const out = {
      id: piece.id, group: piece.group, w: x1 - x0, h: y1 - y0,
      parentId: piece.parentId !== undefined ? piece.parentId : piece.id, part: piece.part || 0, parts: piece.parts || 0,
      rings: rings.map(toDown), holes, folds: folds.map(toDown), cuts: cuts.map(toDown), heat: null, rotated90: false,
      stats: piece.stats,
      // piece UV (mm) -> item space: X = a·u + c·v + e, Y = b·u + d·v + f
      frame: { a: mx * c, b: -s, c: -mx * s, d: -c, e: -x0, f: y1 },
      src: piece, marks: [], markText: [], tabFolds: [], bleed: null,
    };
    if (heat) {
      const t = heat.tris;
      for (let i = 0; i < t.length; i += 2) { t[i] -= x0; t[i + 1] = y1 - t[i + 1]; }
      out.heat = heat;
    }
    return out;
  }

  // rotate 90 deg clockwise (visually) in y-down space: (x,y) -> (h - y, x)
  function rotate90(it) {
    const h = it.h;
    const rot = (r) => { const o = new Array(r.length); for (let i = 0; i < r.length; i += 2) { o[i] = h - r[i + 1]; o[i + 1] = r[i]; } return o; };
    const fr = it.frame;
    const out = {
      ...it, w: it.h, h: it.w, rings: it.rings.map(rot), folds: it.folds.map(rot), cuts: it.cuts.map(rot), rotated90: !it.rotated90,
      marks: (it.marks || []).map(rot), tabFolds: (it.tabFolds || []).map(rot), bleed: it.bleed ? it.bleed.map(rot) : null,
      markText: (it.markText || []).map((p) => ({ ...p, x: h - p.y, y: p.x })),
      frame: fr ? { a: -fr.b, b: fr.a, c: -fr.d, d: fr.c, e: h - fr.f, f: fr.e } : null,
    };
    if (it.heat) {
      const t = it.heat.tris, n = new Float32Array(t.length);
      for (let i = 0; i < t.length; i += 2) { n[i] = h - t[i + 1]; n[i + 1] = t[i]; }
      out.heat = { tris: n, colors: it.heat.colors };
    }
    return out;
  }

  // ---- Seams between pieces: alignment marks, glue tabs, bleed -----------------
  const mapUV = (fr, u, v) => [fr.a * u + fr.c * v + fr.e, fr.b * u + fr.d * v + fr.f];
  // rings whose orientation differs from the largest ring are holes
  function holesOf(rings) {
    let oi = 0;
    for (let i = 1; i < rings.length; i++) if (Math.abs(ringArea(rings[i])) > Math.abs(ringArea(rings[oi]))) oi = i;
    const s = Math.sign(ringArea(rings[oi]));
    return rings.map((r) => Math.sign(ringArea(r)) !== s);
  }
  // 2D affine maps in SVG order {a, b, c, d, e, f}: x' = a·x + c·y + e, y' = b·x + d·y + f
  const mulM = (A, B) => ({
    a: A.a * B.a + A.c * B.b, b: A.b * B.a + A.d * B.b, c: A.a * B.c + A.c * B.d, d: A.b * B.c + A.d * B.d,
    e: A.a * B.e + A.c * B.f + A.e, f: A.b * B.e + A.d * B.f + A.f,
  });
  // Artwork placement lives in piece-UV space (mm, v up): centre (x, y), width s mm,
  // rotation r degrees. Image pixels (y down) -> UV -> item -> page.
  function artMatrix(it, art, ox, oy) {
    const k = (Number(art.s) || 50) / (art.iw || 1), r = ((Number(art.r) || 0) * Math.PI) / 180;
    const cs = Math.cos(r), sn = Math.sin(r), hw = (art.iw || 1) / 2, hh = (art.ih || 1) / 2;
    // a decal continued across a seam carries its own full matrix (m)
    if (art.m) { const mm = mulM(it.frame, art.m); return { ...mm, e: mm.e + ox, f: mm.f + oy }; }
    const toUV = {
      a: k * cs, b: k * sn, c: k * sn, d: -k * cs,
      e: (Number(art.x) || 0) - k * (hw * cs + hh * sn), f: (Number(art.y) || 0) - k * (hw * sn - hh * cs),
    };
    // fx: the image is flipped left-right (a decal on a piece unwrapped mirror-wise)
    const m = mulM(it.frame, art.fx ? mulM(toUV, { a: -1, b: 0, c: 0, d: 1, e: art.iw || 1, f: 0 }) : toUV);
    return { ...m, e: m.e + ox, f: m.f + oy };
  }
  // the base artwork of an item: its own (placed in 2D) or its decal group's surface texture
  const artFor = (settings, it) => (settings.artwork && settings.artwork[it.parentId]) || (settings.groupArt && settings.groupArt[it.group]) || null;
  const decalsFor = (settings, it) => (settings.decals && settings.decals[it.parentId]) || [];

  // even-odd point in polygon over all rings
  function insideRings(rings, x, y) {
    let inside = false;
    for (const r of rings) {
      const n = r.length / 2;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = r[2 * i], yi = r[2 * i + 1], xj = r[2 * j], yj = r[2 * j + 1];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
    }
    return inside;
  }

  function unionRings(rings) {
    const C = clipperLib();
    if (!C) return null;
    const S = 1000;
    const paths = rings.map((r) => {
      const p = [];
      for (let i = 0; i < r.length; i += 2) p.push({ X: Math.round(r[i] * S), Y: Math.round(r[i + 1] * S) });
      return p;
    });
    const c = new C.Clipper();
    c.AddPaths(paths, C.PolyType.ptSubject, true);
    const sol = new C.Paths();
    c.Execute(C.ClipType.ctUnion, sol, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
    return sol.map((p) => { const o = []; for (const q of p) o.push(q.X / S, q.Y / S); return o; }).filter((r) => r.length >= 6);
  }

  const seamLetter = (i) => { let s = ''; i += 1; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = (i - m - 1) / 26; } return s; };

  // Boundary edges that two pieces (or two parts, or both sides of a cut in one
  // piece) share in 3D are seams. They are found by the 3D position of their
  // end points, chained into runs per piece, and runs that share edges form one
  // seam (letter A, B, …).
  function findSeams(items) {
    const posKey = (P, v) => `${Math.round(P[3 * v] * 1e4)},${Math.round(P[3 * v + 1] * 1e4)},${Math.round(P[3 * v + 2] * 1e4)}`;
    const edgeMap = new Map();
    const loopInfo = items.map((it, k) => {
      const src = it.src;
      if (!src || !src.P || !src.loops) return [];
      return src.loops.map((L, l) => {
        const pk = Array.from(L, (v) => posKey(src.P, v));
        const keys = pk.map((a, i) => { const b = pk[(i + 1) % pk.length]; return a < b ? `${a}|${b}` : `${b}|${a}`; });
        keys.forEach((key, i) => { if (!edgeMap.has(key)) edgeMap.set(key, []); edgeMap.get(key).push({ k, l, i }); });
        return { L, pk, keys };
      });
    });
    const runs = [];
    loopInfo.forEach((loops, k) => loops.forEach((info, l) => {
      const n = info.keys.length;
      const partner = info.keys.map((key, i) => {
        const list = edgeMap.get(key);
        if (list.length < 2) return -1;
        const o = list.find((e) => !(e.k === k && e.l === l && e.i === i));
        return o ? o.k : -1;
      });
      if (!partner.some((p) => p >= 0)) return;
      // start where a run begins, so runs never wrap around index 0
      let start = 0;
      while (start < n && partner[start] >= 0 && partner[(start - 1 + n) % n] === partner[start]) start++;
      const closed = start >= n;
      if (closed) start = 0;
      let i = 0;
      while (i < n) {
        const j0 = (start + i) % n;
        if (partner[j0] < 0) { i++; continue; }
        const edges = [j0];
        i++;
        while (i < n && partner[(start + i) % n] === partner[j0]) { edges.push((start + i) % n); i++; }
        runs.push({ k, l, edges, closed: closed && edges.length === n, info });
      }
    }));
    // runs sharing an edge key belong to one seam
    const parent = runs.map((_, i) => i);
    const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    const owner = new Map();
    runs.forEach((r, ri) => {
      for (const e of r.edges) {
        const key = r.info.keys[e];
        if (owner.has(key)) { const a = find(owner.get(key)), b = find(ri); if (a !== b) parent[a] = b; } else owner.set(key, ri);
      }
    });
    const groups = new Map();
    runs.forEach((r, ri) => { const g = find(ri); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(r); });
    const order = (r) => { const it = items[r.k]; return [Number(it.parentId) || 0, it.part || 0, r.l, r.edges[0]]; };
    const cmp = (a, b) => { const x = order(a), y = order(b); for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
    const seams = [...groups.values()].filter((g) => g.length >= 2).map((g) => g.sort(cmp));
    seams.sort((a, b) => cmp(a[0], b[0]));
    return seams.map((g, i) => ({ letter: seamLetter(i), runs: g }));
  }

  // points of a run in item space plus 3D length per edge
  function runGeometry(it, run) {
    const src = it.src, { uv, P } = src, L = run.info.L, n = L.length;
    const pts = [], len3 = [];
    const at = (v) => mapUV(it.frame, uv[2 * v], uv[2 * v + 1]);
    pts.push(at(L[run.edges[0]]));
    for (const e of run.edges) {
      const a = L[e], b = L[(e + 1) % n];
      pts.push(at(b));
      len3.push(Math.hypot(P[3 * a] - P[3 * b], P[3 * a + 1] - P[3 * b + 1], P[3 * a + 2] - P[3 * b + 2]));
    }
    return { pts, len3 };
  }

  // unit normal at edge i of a polyline pointing into the piece
  function inwardNormal(it, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    let nx = -dy / l, ny = dx / l;
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    if (!insideRings(it.rings, mx + nx * 0.3, my + ny * 0.3) && insideRings(it.rings, mx - nx * 0.3, my - ny * 0.3)) { nx = -nx; ny = -ny; }
    return [nx, ny];
  }

  // Ticks at the same 3D spots on both sides of each seam, plus its letter.
  // On printed pieces (fill or artwork) ticks and letters point outward, into
  // the waste around the cut line, so nothing is left on the decal itself.
  function addSeamMarks(items, seams) {
    for (const seam of seams) {
      const [r1, ...others] = seam.runs;
      const g1 = runGeometry(items[r1.k], r1);
      const total = g1.len3.reduce((s, x) => s + x, 0);
      if (total < 1) continue;
      const nT = Math.max(1, Math.round(total / 25));
      const mid = Math.floor(nT / 2);
      for (let t = 0; t < nT; t++) {
        const s = (total * (t + 0.5)) / nT;
        let e = 0, acc = 0;
        while (e < g1.len3.length - 1 && acc + g1.len3[e] < s) { acc += g1.len3[e]; e++; }
        const par = g1.len3[e] > 0 ? (s - acc) / g1.len3[e] : 0.5;
        const key = r1.info.keys[r1.edges[e]];
        const startKey = r1.info.pk[r1.edges[e]];
        for (const run of [r1, ...others]) {
          const it = items[run.k];
          const idx = run.edges.findIndex((x) => run.info.keys[x] === key);
          if (idx < 0) continue;
          const g = run === r1 ? g1 : (run.geo || (run.geo = runGeometry(it, run)));
          const q = run.info.pk[run.edges[idx]] === startKey ? par : 1 - par;
          const a = g.pts[idx], b = g.pts[idx + 1];
          const x = a[0] + (b[0] - a[0]) * q, y = a[1] + (b[1] - a[1]) * q;
          let [nx, ny] = inwardNormal(it, a, b);
          if (it.printed) { nx = -nx; ny = -ny; }
          const tick = it.printed ? 1.8 : 2.5, at = it.printed ? 3.2 : 4.6, size = it.printed ? 2.2 : 2.6;
          it.marks.push([x, y, x + nx * tick, y + ny * tick]);
          if (t === mid) it.markText.push({ x: x + nx * at, y: y + ny * at + size * 0.35, t: seam.letter, size });
        }
      }
    }
  }

  // resample a polyline (array of [x,y]) between arc lengths s0..s1
  function subPolyline(pts, s0, s1) {
    const out = [];
    let acc = 0;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const lerp = (s) => { const q = l > 0 ? (s - acc) / l : 0; return [a[0] + (b[0] - a[0]) * q, a[1] + (b[1] - a[1]) * q]; };
      if (acc + l >= s0 && acc <= s1) {
        if (!out.length) out.push(lerp(Math.max(s0, acc)));
        if (acc + l <= s1) out.push(b); else { out.push(lerp(s1)); break; }
      }
      acc += l;
    }
    return out;
  }

  // Trapezoid flaps along one side of each seam, about 16 mm long each, so they
  // also follow curved edges. The flaps join the cut outline; the seam itself
  // becomes a dashed fold line.
  function addGlueTabs(items, seams, width, warnSet, settings) {
    const w = Math.max(1, Math.min(15, Number(width) || 5));
    const flapsBy = new Map();
    for (const seam of seams) {
      const run = seam.runs[0];
      const it = items[run.k];
      const { pts } = runGeometry(it, run);
      let total = 0;
      for (let i = 0; i + 1 < pts.length; i++) total += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
      if (total < 2 * w) continue;
      const nSeg = Math.max(1, Math.round(total / 16));
      const segL = total / nSeg, taper = Math.min(0.7 * w, segL / 3);
      const list = flapsBy.get(it) || [];
      for (let k = 0; k < nSeg; k++) {
        const base = subPolyline(pts, k * segL + 0.4, (k + 1) * segL - 0.4);
        if (base.length < 2) continue;
        // offset each base point outward along the averaged edge normal
        const top = base.map((p, i) => {
          const a = base[Math.max(0, i - 1)], b = base[Math.min(base.length - 1, i + 1)];
          const [nx, ny] = inwardNormal(it, a, b);
          return [p[0] - nx * w, p[1] - ny * w];
        });
        let tl = 0;
        for (let i = 0; i + 1 < top.length; i++) tl += Math.hypot(top[i + 1][0] - top[i][0], top[i + 1][1] - top[i][1]);
        if (tl < 2 * taper + 0.5) continue;
        const topT = subPolyline(top, taper, tl - taper);
        const ring = [];
        for (const p of base) ring.push(p[0], p[1]);
        for (let i = topT.length - 1; i >= 0; i--) ring.push(topT[i][0], topT[i][1]);
        list.push(ring);
      }
      flapsBy.set(it, list);
      it.tabFolds.push(pts.flatMap((p) => p));
    }
    for (const [it, flaps] of flapsBy) {
      if (!flaps.length) continue;
      // flaps take the outline's orientation so the union adds them
      const outerIdx = it.rings.reduce((bi, r, i, all) => (Math.abs(ringArea(r)) > Math.abs(ringArea(all[bi])) ? i : bi), 0);
      const sign = Math.sign(ringArea(it.rings[outerIdx])) || 1;
      const oriented = flaps.map((r) => (Math.sign(ringArea(r)) === sign ? r : reverseRing(r)));
      const res = unionRings([...it.rings, ...oriented]);
      if (!res) { warnSet.add(txt(settings, 'clipper')); continue; }
      const outer = res.reduce((bi, r, i, all) => (Math.abs(ringArea(r)) > Math.abs(ringArea(all[bi])) ? i : bi), 0);
      const os = Math.sign(ringArea(res[outer]));
      it.rings = res;
      it.holes = res.map((r) => Math.sign(ringArea(r)) !== os);
      // flaps can stick out past the old bounding box: shift everything back to x, y >= 0
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const r of res) for (let i = 0; i < r.length; i += 2) { x0 = Math.min(x0, r[i]); x1 = Math.max(x1, r[i]); y0 = Math.min(y0, r[i + 1]); y1 = Math.max(y1, r[i + 1]); }
      if (x0 !== 0 || y0 !== 0) shiftItem(it, -x0, -y0);
      it.w = x1 - x0; it.h = y1 - y0;
    }
  }

  function shiftItem(it, dx, dy) {
    const sh = (r) => tr(r, dx, dy);
    it.rings = it.rings.map(sh); it.folds = it.folds.map(sh); it.cuts = it.cuts.map(sh);
    it.marks = it.marks.map(sh); it.tabFolds = it.tabFolds.map(sh);
    if (it.bleed) it.bleed = it.bleed.map(sh);
    it.markText = it.markText.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }));
    if (it.heat) { const t = it.heat.tris; for (let i = 0; i < t.length; i += 2) { t[i] += dx; t[i + 1] += dy; } }
    if (it.frame) it.frame = { ...it.frame, e: it.frame.e + dx, f: it.frame.f + dy };
  }

  // Marks, bleed and tabs for all items of one layout; returns the seams found
  function decorate(items, settings, warnSet) {
    // printed pieces carry colour or artwork: their number and marks go outside
    for (const it of items) {
      const art = artFor(settings, it);
      it.printed = !!settings.fill || !!(art && art.img) || decalsFor(settings, it).length > 0;
      it.outLabel = settings.labels !== false && it.printed;
    }
    const needSeams = settings.seamMarks !== false || settings.tabs;
    const seams = needSeams ? findSeams(items) : [];
    if (settings.seamMarks !== false) addSeamMarks(items, seams);
    const bleed = Math.max(0, Math.min(5, Number(settings.bleed) || 0));
    if (bleed > 0) {
      for (const it of items) {
        const b = offsetRings(it.rings, bleed);
        if (b === null) { warnSet.add(txt(settings, 'clipper')); break; }
        it.bleed = b.length ? b : null;
      }
    }
    if (settings.tabs) addGlueTabs(items, seams, settings.tabWidth, warnSet, settings);
    // the bleed may also stick out past the outline's box
    if (bleed > 0) {
      for (const it of items) {
        if (!it.bleed) continue;
        let x0 = 0, y0 = 0, x1 = it.w, y1 = it.h;
        for (const r of it.bleed) for (let i = 0; i < r.length; i += 2) { x0 = Math.min(x0, r[i]); x1 = Math.max(x1, r[i]); y0 = Math.min(y0, r[i + 1]); y1 = Math.max(y1, r[i + 1]); }
        if (x0 < 0 || y0 < 0) shiftItem(it, -x0, -y0);
        it.w = x1 - x0; it.h = y1 - y0;
      }
    }
    return seams;
  }

  // Shelf packing (first-fit decreasing height). Returns pages of placements.
  function pack(items, aw, ah, gap, labelH) {
    const order = items.slice().sort((a, b) => (b.h + labelH) - (a.h + labelH) || b.w - a.w);
    const pages = [];
    for (const it of order) {
      const H = it.h + labelH;
      let placed = false;
      for (const pg of pages) {
        for (const sh of pg.shelves) {
          if (H <= sh.h + 1e-9 && sh.x + it.w <= aw + 1e-9) {
            pg.items.push({ it, x: sh.x, y: sh.y });
            sh.x += it.w + gap;
            placed = true; break;
          }
        }
        if (placed) break;
        if (pg.nextY + H <= ah + 1e-9) {
          pg.shelves.push({ y: pg.nextY, h: H, x: it.w + gap });
          pg.items.push({ it, x: 0, y: pg.nextY });
          pg.nextY += H + gap;
          placed = true; break;
        }
      }
      if (!placed) {
        pages.push({ shelves: [{ y: 0, h: H, x: it.w + gap }], items: [{ it, x: 0, y: 0 }], nextY: H + gap });
      }
    }
    return pages;
  }

  function clipRingRect(r, x0, y0, x1, y1) {
    let pts = [];
    for (let i = 0; i < r.length; i += 2) pts.push([r[i], r[i + 1]]);
    const edges = [
      [(p) => p[0] >= x0, (a, b) => { const t = (x0 - a[0]) / (b[0] - a[0]); return [x0, a[1] + t * (b[1] - a[1])]; }],
      [(p) => p[0] <= x1, (a, b) => { const t = (x1 - a[0]) / (b[0] - a[0]); return [x1, a[1] + t * (b[1] - a[1])]; }],
      [(p) => p[1] >= y0, (a, b) => { const t = (y0 - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), y0]; }],
      [(p) => p[1] <= y1, (a, b) => { const t = (y1 - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), y1]; }],
    ];
    for (const [inside, cut] of edges) {
      if (!pts.length) break;
      const out = [];
      for (let i = 0; i < pts.length; i++) {
        const cur = pts[i], prev = pts[(i + pts.length - 1) % pts.length];
        const ci = inside(cur), pi = inside(prev);
        if (ci) { if (!pi) out.push(cut(prev, cur)); out.push(cur); }
        else if (pi) out.push(cut(prev, cur));
      }
      pts = out;
    }
    return pts.length >= 3 ? pts.flat() : null;
  }

  // Liang–Barsky clip of a polyline (flat) to a rect; returns list of polylines.
  function clipPolylineRect(pl, closed, x0, y0, x1, y1) {
    const pts = pl.slice();
    if (closed) pts.push(pl[0], pl[1]);
    const out = [];
    let cur = null;
    for (let i = 0; i + 3 < pts.length; i += 2) {
      let ax = pts[i], ay = pts[i + 1], bx = pts[i + 2], by = pts[i + 3];
      const dx = bx - ax, dy = by - ay;
      let t0 = 0, t1 = 1, ok = true;
      for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dy, ay - y0], [dy, y1 - ay]]) {
        if (Math.abs(p) < 1e-15) { if (q < 0) { ok = false; break; } continue; }
        const t = q / p;
        if (p < 0) { if (t > t1) { ok = false; break; } if (t > t0) t0 = t; }
        else { if (t < t0) { ok = false; break; } if (t < t1) t1 = t; }
      }
      if (!ok) { cur = null; continue; }
      const sx = ax + t0 * dx, sy = ay + t0 * dy, ex = ax + t1 * dx, ey = ay + t1 * dy;
      if (cur && t0 === 0) cur.push(ex, ey);
      else { cur = [sx, sy, ex, ey]; out.push(cur); }
      if (t1 < 1) cur = null;
    }
    return out.filter((p) => p.length >= 4);
  }

  const tr = (r, dx, dy) => { const o = new Array(r.length); for (let i = 0; i < r.length; i += 2) { o[i] = r[i] + dx; o[i + 1] = r[i + 1] + dy; } return o; };

  function pieceLabel(it, settings) {
    return txt(settings, 'label', { id: it.id, g: it.group, w: it.w.toFixed(1), h: it.h.toFixed(1) });
  }

  function addLabel(prims, it, x, y, settings, text) {
    const col = (settings.groupColors && settings.groupColors[it.group]) || '#888888';
    prims.push({ t: 'rect', x, y: y + 0.8, w: 3, h: 3, fill: col, stroke: null, width: 0, dash: null });
    prims.push({ t: 'text', x: x + 4, y: y + 3.5, text: text || pieceLabel(it, settings), size: 2.8, anchor: 'start', color: '#333333', bold: false });
  }

  function piecePrims(prims, it, ox, oy, settings) {
    // colour (and artwork) reach the bleed outline; the cut line stays the true outline
    const paintRings = it.bleed || it.rings;
    const paintHoles = it.bleed ? holesOf(it.bleed) : it.holes;
    if (settings.fill) prims.push({ t: 'poly', rings: paintRings.map((r) => tr(r, ox, oy)), holes: paintHoles.slice(), fill: settings.fillColor, stroke: null, width: 0, dash: null });
    const art = artFor(settings, it);
    // the base image or pattern, then decals stuck on in the 3D view, on top
    for (const a of [art, ...decalsFor(settings, it)]) {
      if (!a || !a.img || !it.frame) continue;
      prims.push({ t: 'image', clip: paintRings.map((r) => tr(r, ox, oy)), href: a.img, iw: a.iw, ih: a.ih, matrix: artMatrix(it, a, ox, oy), opacity: a.op === undefined ? 1 : a.op, tile: !!a.tile, owner: it.parentId });
    }
    prims.push({ t: 'poly', rings: it.rings.map((r) => tr(r, ox, oy)), holes: it.holes.slice(), fill: null, stroke: '#111111', width: settings.lineWidth, dash: null, owner: it.parentId, item: it.id });
    for (const f of it.folds) prims.push({ t: 'line', pts: tr(f, ox, oy), stroke: '#6b7280', width: 0.15, dash: [1.6, 1.2] });
    for (const f of it.tabFolds || []) prims.push({ t: 'line', pts: tr(f, ox, oy), stroke: '#6b7280', width: 0.2, dash: [2, 1.2] });
    for (const c of it.cuts) prims.push({ t: 'line', pts: tr(c, ox, oy), stroke: '#111111', width: settings.lineWidth, dash: null });
    for (const mk of it.marks || []) prims.push({ t: 'line', pts: tr(mk, ox, oy), stroke: '#c0392b', width: 0.3, dash: null });
    for (const p of it.markText || []) prims.push({ t: 'text', x: p.x + ox, y: p.y + oy, text: p.t, size: p.size || 2.6, anchor: 'middle', color: '#c0392b', bold: true });
  }

  // Printed pieces get their number in a strip above the piece (outside the cut
  // line). The strip is added per nesting variant, so the text always reads level.
  const BAND = 4.5, BAND_TEXT = 2.6;
  function withLabelBand(it) {
    if (!it.outLabel || it.labelRect) return it;
    const sh = (r) => tr(r, 0, BAND);
    const fr = it.frame;
    const textW = 0.62 * BAND_TEXT * (String(it.id).length + 1) + 1;
    return {
      ...it, h: it.h + BAND, rings: it.rings.map(sh), folds: it.folds.map(sh), cuts: it.cuts.map(sh),
      marks: (it.marks || []).map(sh), tabFolds: (it.tabFolds || []).map(sh), bleed: it.bleed ? it.bleed.map(sh) : null,
      markText: (it.markText || []).map((p) => ({ ...p, y: p.y + BAND })),
      heat: it.heat ? { tris: Float32Array.from(it.heat.tris, (v, i) => (i % 2 ? v + BAND : v)), colors: it.heat.colors } : null,
      frame: fr ? { ...fr, f: fr.f + BAND } : null,
      labelRect: [0, 0, Math.min(it.w, textW), BAND - 0.6],
    };
  }

  function footerPrims(prims, W, H, m, settings, text) {
    const x0 = m, ft = H - m - FOOTER;
    if (settings.calibration) {
      const yb = ft + 6;
      prims.push({ t: 'line', pts: [x0, yb, x0 + 50, yb], stroke: '#111111', width: 0.2, dash: null });
      for (let i = 0; i <= 50; i++) {
        const major = i % 10 === 0;
        if (!major && i > 10) continue;
        const hgt = major ? 3 : (i === 5 ? 2.2 : 1.4);
        prims.push({ t: 'line', pts: [x0 + i, yb, x0 + i, yb - hgt], stroke: '#111111', width: major ? 0.2 : 0.12, dash: null });
        if (major) prims.push({ t: 'text', x: x0 + i, y: yb + 2.4, text: String(i), size: 1.8, anchor: 'middle', color: '#333333', bold: false });
      }
      prims.push({ t: 'text', x: x0 + 53, y: yb - 0.2, text: txt(settings, 'ruler'), size: 2.2, anchor: 'start', color: '#333333', bold: false });
    }
    prims.push({ t: 'text', x: W - m, y: ft + 2.2, text, size: 2.2, anchor: 'end', color: '#555555', bold: false });
  }

  function paperDims(settings) {
    let [pw, ph] = settings.paper === 'custom'
      ? [Math.max(50, Number(settings.customW) || 210), Math.max(50, Number(settings.customH) || 297)]
      : (PAPERS[settings.paper] || PAPERS.A4);
    if (pw > ph) [pw, ph] = [ph, pw];
    return [pw, ph];
  }

  // ---- Split pieces that do not fit the paper -----------------------------------
  // A piece longer than the printable area is cut across into parts that fit
  // (cuts prefer corners/creases, then the narrowest spot) so everything can be
  // nested on the same sheet instead of tiling one strip over several sheets.

  // usable content areas [w, h] for the allowed page orientations
  function contentAreas(settings) {
    const [pw, ph] = paperDims(settings);
    const m = Math.max(0, Number(settings.margin) || 0);
    const por = [pw - 2 * m, ph - 2 * m - FOOTER], lan = [ph - 2 * m, pw - 2 * m - FOOTER];
    if (settings.orientation === 'portrait') return [por];
    if (settings.orientation === 'landscape') return [lan];
    return [por, lan];
  }

  // boundary loops of a face subset of a piece (local vertex ids), outer first
  function subsetLoops(uv, F) {
    const nF = F.length / 3;
    let maxV = 0;
    for (let i = 0; i < F.length; i++) if (F[i] > maxV) maxV = F[i];
    const N = maxV + 1;
    const cnt = new Map();
    for (let c = 0; c < F.length; c++) {
      const a = F[c], b = F[3 * ((c / 3) | 0) + ((c % 3) + 1) % 3];
      const key = a < b ? a * N + b : b * N + a;
      cnt.set(key, (cnt.get(key) || 0) + 1);
    }
    const out = new Map();
    for (let c = 0; c < F.length; c++) {
      const a = F[c], b = F[3 * ((c / 3) | 0) + ((c % 3) + 1) % 3];
      if (cnt.get(a < b ? a * N + b : b * N + a) !== 1) continue;
      if (!out.has(a)) out.set(a, []);
      out.get(a).push(b);
    }
    const loops = [];
    const usedEdge = new Set();
    for (const [start, list] of out) {
      for (const first of list) {
        if (usedEdge.has(start * N + first)) continue;
        const loop = [start];
        let a = start, b = first, guard = 0;
        while (guard++ < F.length + 5) {
          usedEdge.add(a * N + b);
          if (b === start) break;
          loop.push(b);
          const nexts = out.get(b) || [];
          const nb = nexts.find((x) => !usedEdge.has(b * N + x));
          if (nb === undefined) break;
          a = b; b = nb;
        }
        if (loop.length >= 3) loops.push(loop);
      }
    }
    if (!loops.length || !nF) return [];
    const area = (L) => { let s = 0; for (let i = 0; i < L.length; i++) { const p = 2 * L[i], q = 2 * L[(i + 1) % L.length]; s += uv[p] * uv[q + 1] - uv[q] * uv[p + 1]; } return s / 2; };
    const areas = loops.map(area);
    let oi = 0;
    for (let i = 1; i < loops.length; i++) if (Math.abs(areas[i]) > Math.abs(areas[oi])) oi = i;
    const outer = areas[oi] < 0 ? loops[oi].slice().reverse() : loops[oi];
    const res = [Uint32Array.from(outer)];
    loops.forEach((L, i) => {
      if (i === oi) return;
      const a = Math.abs(areas[i]);
      let per = 0;
      for (let k = 0; k < L.length; k++) { const p = 2 * L[k], q = 2 * L[(k + 1) % L.length]; per += Math.hypot(uv[p] - uv[q], uv[p + 1] - uv[q + 1]); }
      if (a < 0.3 || (per > 0 && (2 * a) / per < 0.15)) return; // slits and specks
      res.push(Uint32Array.from(areas[i] > 0 ? L.slice().reverse() : L));
    });
    return res;
  }

  // cut a face subset across direction (ax, ay) into parts no longer than lim; returns face lists
  function cutAcross(piece, faces, ax, ay, lim, fitsFn) {
    const { uv, F, P } = piece;
    const n = faces.length;
    const t = new Float64Array(n);
    let t0 = Infinity, t1 = -Infinity;
    for (let i = 0; i < n; i++) {
      const f = faces[i], a = 2 * F[3 * f], b = 2 * F[3 * f + 1], c = 2 * F[3 * f + 2];
      t[i] = ((uv[a] + uv[b] + uv[c]) * ax + (uv[a + 1] + uv[b + 1] + uv[c + 1]) * ay) / 3;
      if (t[i] < t0) t0 = t[i];
      if (t[i] > t1) t1 = t[i];
    }
    // interior edges of the subset: faces on both sides, uv length, crease angle (3D)
    const normal = (f) => {
      if (!P) return [0, 0, 1];
      const a = 3 * F[3 * f], b = 3 * F[3 * f + 1], c = 3 * F[3 * f + 2];
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
      const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx, l = Math.hypot(x, y, z) || 1;
      return [x / l, y / l, z / l];
    };
    const nrm = Array.from(faces, normal);
    let maxV = 0;
    for (const f of faces) for (let q = 0; q < 3; q++) if (F[3 * f + q] > maxV) maxV = F[3 * f + q];
    const N = maxV + 1, seen = new Map(), edges = [];
    const area = new Float64Array(n), cx = new Float64Array(n), cy = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const f = faces[i], a2 = 2 * F[3 * f], b2 = 2 * F[3 * f + 1], c2 = 2 * F[3 * f + 2];
      area[i] = Math.abs((uv[b2] - uv[a2]) * (uv[c2 + 1] - uv[a2 + 1]) - (uv[b2 + 1] - uv[a2 + 1]) * (uv[c2] - uv[a2])) / 2;
      cx[i] = (uv[a2] + uv[b2] + uv[c2]) / 3; cy[i] = (uv[a2 + 1] + uv[b2 + 1] + uv[c2 + 1]) / 3;
    }
    for (let i = 0; i < n; i++) {
      const f = faces[i];
      for (let q = 0; q < 3; q++) {
        const a = F[3 * f + q], b = F[3 * f + (q + 1) % 3];
        const key = a < b ? a * N + b : b * N + a;
        const j = seen.get(key);
        if (j === undefined) { seen.set(key, i); continue; }
        const d = nrm[i][0] * nrm[j][0] + nrm[i][1] * nrm[j][1] + nrm[i][2] * nrm[j][2];
        edges.push({ i, j, len: Math.hypot(uv[2 * a] - uv[2 * b], uv[2 * a + 1] - uv[2 * b + 1]), ang: (Math.acos(Math.max(-1, Math.min(1, d))) * 180) / Math.PI });
      }
    }
    // Thin, winding pieces (strips, rings) are measured along the surface:
    // distance from one end, so each cut crosses the strip exactly once.
    let totalArea = 0;
    for (let i = 0; i < n; i++) totalArea += area[i];
    const ext = subsetExtent(piece, faces, true);
    if (totalArea < 0.3 * ext.L * ext.S && edges.length) {
      const adj = Array.from({ length: n }, () => []);
      for (const e of edges) {
        const w = Math.hypot(cx[e.i] - cx[e.j], cy[e.i] - cy[e.j]);
        adj[e.i].push(e.j, w); adj[e.j].push(e.i, w);
      }
      let start = 0;
      for (let i = 1; i < n; i++) if (t[i] < t[start]) start = i;
      const dist = new Float64Array(n).fill(Infinity);
      dist[start] = 0;
      const heap = [[0, start]];
      while (heap.length) {
        let bi = 0;
        for (let h = 1; h < heap.length; h++) if (heap[h][0] < heap[bi][0]) bi = h;
        const [d, i] = heap[bi];
        heap[bi] = heap[heap.length - 1]; heap.pop();
        if (d > dist[i]) continue;
        const L = adj[i];
        for (let q = 0; q < L.length; q += 2) {
          const j = L[q], nd = d + L[q + 1];
          if (nd < dist[j]) { dist[j] = nd; heap.push([nd, j]); }
        }
      }
      let dmax = 0;
      for (let i = 0; i < n; i++) if (isFinite(dist[i]) && dist[i] > dmax) dmax = dist[i];
      if (dmax > 0) {
        for (let i = 0; i < n; i++) t[i] = isFinite(dist[i]) ? dist[i] : dmax;
        t0 = 0; t1 = dmax;
      }
    }
    // Choose cut positions by dynamic programming: first the fewest parts that
    // each fit (≤ maxSeg long), then the cheapest cuts — short cross-sections,
    // and much cheaper on corners/creases (≥ 20°) where a seam hides well.
    const samples = Math.min(600, Math.max(60, Math.ceil((t1 - t0) / 1.5)));
    const cand = [];
    for (let q = 1; q < samples; q++) {
      const c = t0 + ((t1 - t0) * q) / samples;
      let len = 0, ang = 0;
      for (const e of edges) if ((t[e.i] < c) !== (t[e.j] < c)) { len += e.len; if (e.ang > ang) ang = e.ang; }
      if (len > 0) cand.push({ c, len, ang });
    }
    const cost = cand.map((x) => x.len * (x.ang >= 20 ? 0.3 : 1));

    function solve(maxSeg) {
      const cuts = [];
      if (t1 - t0 > maxSeg && cand.length) {
        const C = cand.length, minPart = 0.1 * maxSeg;
        const nCut = new Array(C).fill(Infinity), sum = new Array(C).fill(Infinity), prev = new Array(C).fill(-1);
        const better = (k1, s1, k2, s2) => k1 < k2 || (k1 === k2 && s1 < s2);
        for (let i = 0; i < C; i++) {
          const ci = cand[i].c;
          if (ci - t0 <= maxSeg && ci - t0 >= minPart) { nCut[i] = 1; sum[i] = cost[i]; prev[i] = -1; }
          for (let j = 0; j < i; j++) {
            const d = ci - cand[j].c;
            if (d > maxSeg || d < minPart || !isFinite(nCut[j])) continue;
            if (better(nCut[j] + 1, sum[j] + cost[i], nCut[i], sum[i])) { nCut[i] = nCut[j] + 1; sum[i] = sum[j] + cost[i]; prev[i] = j; }
          }
        }
        let last = -1;
        for (let i = 0; i < C; i++) {
          if (!isFinite(nCut[i]) || t1 - cand[i].c > maxSeg || t1 - cand[i].c < minPart) continue;
          if (last < 0 || better(nCut[i], sum[i], nCut[last], sum[last])) last = i;
        }
        for (let i = last; i >= 0; i = prev[i]) cuts.unshift(cand[i].c);
      }
      // parts = connected components inside each slab
      const slab = new Int32Array(n);
      for (let i = 0; i < n; i++) { let k = 0; while (k < cuts.length && t[i] >= cuts[k]) k++; slab[i] = k; }
      const par = Array.from({ length: n }, (_, i) => i);
      const find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
      for (const e of edges) if (slab[e.i] === slab[e.j]) { const ra = find(e.i), rb = find(e.j); if (ra !== rb) par[ra] = rb; }
      // fold crumbs (small leftover bits at the cuts) into the neighbour they share
      // most edge with, as long as that neighbour still fits the paper
      for (let pass = 0; pass < 3; pass++) {
        const pa = new Map(), shared = new Map(), members = new Map();
        for (let i = 0; i < n; i++) {
          const r = find(i); pa.set(r, (pa.get(r) || 0) + area[i]);
          if (!members.has(r)) members.set(r, []); members.get(r).push(faces[i]);
        }
        for (const e of edges) {
          const ra = find(e.i), rb = find(e.j);
          if (ra === rb) continue;
          const ka = shared.get(ra) || new Map(); ka.set(rb, (ka.get(rb) || 0) + e.len); shared.set(ra, ka);
          const kb = shared.get(rb) || new Map(); kb.set(ra, (kb.get(ra) || 0) + e.len); shared.set(rb, kb);
        }
        let merged = false;
        for (const [r, ar] of pa) {
          if (find(r) !== r) continue;
          const small = ar < 0.04 * totalArea || ar < 30;
          if (!small || !shared.has(r)) continue;
          const nbs = [...shared.get(r)].map(([o, l]) => [find(o), l]).filter(([o]) => o !== r).sort((x, y) => y[1] - x[1]);
          for (const [o] of nbs) {
            if (ar >= 30 && fitsFn && !fitsFn(members.get(r).concat(members.get(o) || []))) continue;
            par[r] = o; merged = true;
            if (members.has(o)) members.set(o, members.get(o).concat(members.get(r)));
            break;
          }
        }
        if (!merged) break;
      }
      const groups = new Map();
      for (let i = 0; i < n; i++) { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(faces[i]); }
      return [...groups.values()];
    }

    // Cuts follow triangle edges, so a part can overrun its range a little:
    // if any part ends up too big, shrink the allowed length and solve again.
    let maxSeg = lim * 0.97, groups = solve(maxSeg);
    for (let attempt = 0; attempt < 8 && fitsFn && !groups.every((g) => fitsFn(g)); attempt++) {
      maxSeg *= 0.93;
      groups = solve(maxSeg);
    }
    return groups;
  }

  // measure a face subset: long/short size and the long direction
  function subsetExtent(piece, faces, rotate) {
    const { uv, F } = piece;
    const used = new Set();
    for (const f of faces) for (let q = 0; q < 3; q++) used.add(F[3 * f + q]);
    const pts = [];
    for (const v of used) pts.push(uv[2 * v], uv[2 * v + 1]);
    let th = 0;
    if (rotate) th = minRectAngle(pts);
    const c = Math.cos(th), s = Math.sin(th);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < pts.length; i += 2) {
      const x = c * pts[i] - s * pts[i + 1], y = s * pts[i] + c * pts[i + 1];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const w = x1 - x0, h = y1 - y0;
    // directions of the measured x / y axes back in uv space
    const ex = [c, -s], ey = [s, c];
    return w >= h ? { L: w, S: h, dirL: ex, dirS: ey } : { L: h, S: w, dirL: ey, dirS: ex };
  }

  function splitToFit(piece, settings) {
    const nF = piece.F ? piece.F.length / 3 : 0;
    if (!nF || !piece.uv) return [piece];
    const rotate = settings.rotateMode === 'optimize';
    const areas = contentAreas(settings);
    const fits = (e) => areas.some(([a, b]) => e.L <= Math.max(a, b) + 1e-6 && e.S <= Math.min(a, b) + 1e-6);
    const parts = [];
    const stack = [{ faces: Array.from({ length: nF }, (_, i) => i), depth: 0 }];
    while (stack.length) {
      const cur = stack.pop();
      const e = subsetExtent(piece, cur.faces, rotate);
      if (fits(e) || cur.depth >= 5 || cur.faces.length < 2) { parts.push(cur.faces); continue; }
      // split along the long side if it is too long for any page, else along the short side
      const longMax = Math.max(...areas.filter(([a, b]) => e.S <= Math.min(a, b) + 1e-6).map(([a, b]) => Math.max(a, b)), 0);
      let dir, len, lim;
      if (longMax > 0) { dir = e.dirL; len = e.L; lim = longMax; }
      else { dir = e.dirS; len = e.S; lim = Math.max(...areas.map(([a, b]) => Math.min(a, b))); }
      const groups = cutAcross(piece, cur.faces, dir[0], dir[1], lim, (fs) => fits(subsetExtent(piece, fs, rotate)));
      if (groups.length < 2) { parts.push(cur.faces); continue; }
      for (const g of groups) stack.push({ faces: g, depth: cur.depth + 1 });
    }
    if (parts.length < 2) return [piece];
    // consolidate: merge neighbouring parts (smallest first) whenever the union still fits
    {
      let maxV = 0;
      for (let i = 0; i < piece.F.length; i++) if (piece.F[i] > maxV) maxV = piece.F[i];
      const N = maxV + 1;
      const owner = new Int32Array(nF);
      let merged = true;
      while (merged && parts.length > 1) {
        merged = false;
        parts.forEach((p, idx) => { for (const f of p) owner[f] = idx; });
        const edgeFace = new Map(), shared = parts.map(() => new Map());
        parts.forEach((p) => {
          for (const f of p) {
            for (let q = 0; q < 3; q++) {
              const a = piece.F[3 * f + q], b = piece.F[3 * f + (q + 1) % 3];
              const key = a < b ? a * N + b : b * N + a;
              const g = edgeFace.get(key);
              if (g === undefined) { edgeFace.set(key, f); continue; }
              const pa = owner[f], pb = owner[g];
              if (pa === pb) continue;
              const l = Math.hypot(piece.uv[2 * a] - piece.uv[2 * b], piece.uv[2 * a + 1] - piece.uv[2 * b + 1]);
              shared[pa].set(pb, (shared[pa].get(pb) || 0) + l);
              shared[pb].set(pa, (shared[pb].get(pa) || 0) + l);
            }
          }
        });
        const order = parts.map((p, i) => i).sort((x, y) => parts[x].length - parts[y].length);
        for (const i of order) {
          const nbs = [...shared[i]].sort((x, y) => y[1] - x[1]);
          for (const [j] of nbs) {
            const union = parts[i].concat(parts[j]);
            if (!fits(subsetExtent(piece, union, rotate))) continue;
            parts[j] = union;
            parts.splice(i, 1);
            merged = true;
            break;
          }
          if (merged) break;
        }
      }
    }
    // order parts along the piece so their numbers follow the strip
    const mainDir = subsetExtent(piece, Array.from({ length: nF }, (_, i) => i), rotate).dirL;
    const key = (faces) => {
      let s = 0;
      for (const f of faces) { const a = 2 * piece.F[3 * f]; s += piece.uv[a] * mainDir[0] + piece.uv[a + 1] * mainDir[1]; }
      return s / faces.length;
    };
    parts.sort((a, b) => key(a) - key(b));
    return parts.map((faces, idx) => {
      const F = new Uint32Array(faces.length * 3);
      const D = new Float32Array(faces.length);
      faces.forEach((f, i) => { F[3 * i] = piece.F[3 * f]; F[3 * i + 1] = piece.F[3 * f + 1]; F[3 * i + 2] = piece.F[3 * f + 2]; D[i] = piece.faceDistortion ? piece.faceDistortion[f] : 0; });
      const ekeys = new Map();
      let maxV = 0;
      for (let i = 0; i < F.length; i++) if (F[i] > maxV) maxV = F[i];
      const N = maxV + 1;
      for (let c = 0; c < F.length; c++) {
        const a = F[c], b = F[3 * ((c / 3) | 0) + ((c % 3) + 1) % 3];
        const kk = a < b ? a * N + b : b * N + a;
        ekeys.set(kk, (ekeys.get(kk) || 0) + 1);
      }
      const has = (a, b) => (a < N && b < N ? ekeys.get(a < b ? a * N + b : b * N + a) || 0 : 0);
      // a piece joined from separate meshes: the part's outline is the union of its meshes
      let loops = subsetLoops(piece.uv, F), extra = null;
      if (piece.merged && loops.length > 1 && typeof Flat !== 'undefined' && Flat.flatOutline) {
        const o = Flat.flatOutline(piece.uv, piece.P, F, loops);
        if (o) { loops = o.loops; extra = { uv: o.uv, P: o.P, nV: o.uv.length / 2 }; }
      }
      return {
        ...piece, ...extra,
        id: `${piece.id}.${idx + 1}`, parentId: piece.id, part: idx + 1, parts: parts.length,
        F, faceDistortion: D, loops,
        folds: (piece.folds || []).filter((e) => has(e.a, e.b) === 2),
        cuts: (piece.cuts || []).filter((e) => has(e.a, e.b) > 0),
      };
    });
  }

  // ---- True-shape nesting ------------------------------------------------------
  // Pieces are rasterised on a NEST_CELL grid (dilated by half the gap) and placed
  // top-left first-fit, so small pieces drop into holes and concave bays of big
  // ones, the way a UV packer fills space.
  const NEST_CELL = 1.5;

  function rasterize(it, cell, dil) {
    const W = Math.ceil(it.w / cell) + 2 * dil + 1, H = Math.ceil(it.h / cell) + 2 * dil + 1;
    const fill = new Uint8Array(W * H);
    for (let j = 0; j < H; j++) {
      const yc = (j - dil + 0.5) * cell;
      const xs = [];
      for (const r of it.rings) {
        const n = r.length / 2;
        for (let k = 0; k < n; k++) {
          const k2 = (k + 1) % n;
          const y1 = r[2 * k + 1], y2 = r[2 * k2 + 1];
          if ((y1 <= yc) !== (y2 <= yc)) xs.push(r[2 * k] + ((yc - y1) * (r[2 * k2] - r[2 * k])) / (y2 - y1));
        }
      }
      xs.sort((a, b) => a - b);
      for (let q = 0; q + 1 < xs.length; q += 2) {
        const i0 = Math.max(0, Math.ceil(xs[q] / cell + dil - 0.5)), i1 = Math.min(W - 1, Math.floor(xs[q + 1] / cell + dil - 0.5));
        for (let i = i0; i <= i1; i++) fill[j * W + i] = 1;
      }
    }
    // outline cells, so parts thinner than a cell still occupy space
    for (const r of it.rings) {
      const n = r.length / 2;
      for (let k = 0; k < n; k++) {
        const k2 = (k + 1) % n;
        const x1 = r[2 * k], y1 = r[2 * k + 1], x2 = r[2 * k2], y2 = r[2 * k2 + 1];
        const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / (cell * 0.5)));
        for (let s = 0; s <= steps; s++) {
          const i = Math.floor((x1 + ((x2 - x1) * s) / steps) / cell + dil), j = Math.floor((y1 + ((y2 - y1) * s) / steps) / cell + dil);
          if (i >= 0 && i < W && j >= 0 && j < H) fill[j * W + i] = 1;
        }
      }
    }
    // the number strip of a printed piece takes room too
    if (it.labelRect) {
      const [rx0, ry0, rx1, ry1] = it.labelRect;
      for (let j = Math.max(0, Math.floor(ry0 / cell + dil)); j <= Math.min(H - 1, Math.floor(ry1 / cell + dil)); j++) {
        for (let i = Math.max(0, Math.floor(rx0 / cell + dil)); i <= Math.min(W - 1, Math.floor(rx1 / cell + dil)); i++) fill[j * W + i] = 1;
      }
    }
    // label spot: the cell farthest from the outline (chamfer distance transform)
    const dist = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) dist[i] = fill[i] ? 1e9 : 0;
    const D2 = Math.SQRT2;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const p = j * W + i;
      if (!dist[p]) continue;
      let d = dist[p];
      if (i > 0) d = Math.min(d, dist[p - 1] + 1); else d = Math.min(d, 1);
      if (j > 0) { d = Math.min(d, dist[p - W] + 1); if (i > 0) d = Math.min(d, dist[p - W - 1] + D2); if (i < W - 1) d = Math.min(d, dist[p - W + 1] + D2); } else d = Math.min(d, 1);
      dist[p] = d;
    }
    let bestP = -1, bestD = 0;
    for (let j = H - 1; j >= 0; j--) for (let i = W - 1; i >= 0; i--) {
      const p = j * W + i;
      if (!dist[p]) continue;
      let d = dist[p];
      if (i < W - 1) d = Math.min(d, dist[p + 1] + 1); else d = Math.min(d, 1);
      if (j < H - 1) { d = Math.min(d, dist[p + W] + 1); if (i < W - 1) d = Math.min(d, dist[p + W + 1] + D2); if (i > 0) d = Math.min(d, dist[p + W - 1] + D2); } else d = Math.min(d, 1);
      dist[p] = d;
      if (d > bestD) { bestD = d; bestP = p; }
    }
    const label = bestP >= 0 ? { x: ((bestP % W) - dil + 0.5) * cell, y: (((bestP / W) | 0) - dil + 0.5) * cell, r: (bestD - 0.5) * cell } : null;
    // dilate by `dil` cells (square), horizontally then vertically
    let occ = fill;
    if (dil > 0) {
      const tmp = new Uint8Array(W * H), out = new Uint8Array(W * H);
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        let v = 0;
        for (let k = Math.max(0, i - dil); k <= Math.min(W - 1, i + dil) && !v; k++) v = fill[j * W + k];
        tmp[j * W + i] = v;
      }
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        let v = 0;
        for (let k = Math.max(0, j - dil); k <= Math.min(H - 1, j + dil) && !v; k++) v = tmp[k * W + i];
        out[j * W + i] = v;
      }
      occ = out;
    }
    // occupied cells, boundary cells first (they collide earliest)
    const edge = [], inner = [];
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      if (!occ[j * W + i]) continue;
      const b = i === 0 || j === 0 || i === W - 1 || j === H - 1 || !occ[j * W + i - 1] || !occ[j * W + i + 1] || !occ[(j - 1) * W + i] || !occ[(j + 1) * W + i];
      (b ? edge : inner).push(i, j);
    }
    return { W, H, cells: Int32Array.from(edge.concat(inner)), label };
  }

  function nest(items, aw, ah, gap, allowRot) {
    const cell = NEST_CELL;
    const dil = Math.max(0, Math.ceil(gap / 2 / cell));
    const PW = Math.max(1, Math.floor(aw / cell)), PH = Math.max(1, Math.floor(ah / cell));
    const shapeArea = (it) => Math.abs(it.rings.reduce((s, r) => s + ringArea(r), 0));
    const order = items.slice().sort((a, b) => shapeArea(b) - shapeArea(a));
    const pages = [];
    const findSpot = (occ, cands) => {
      let best = null;
      for (const c of cands) {
        const { W, H } = c.r;
        if (W > PW || H > PH) continue;
        const offs = c.offs || (c.offs = (() => { const o = new Int32Array(c.r.cells.length / 2); for (let k = 0; k < o.length; k++) o[k] = c.r.cells[2 * k + 1] * PW + c.r.cells[2 * k]; return o; })());
        for (let y = 0; y + H <= PH; y++) {
          if (best && y > best.y) break;
          let found = -1;
          for (let x = 0; x + W <= PW; x++) {
            const base = y * PW + x;
            let ok = true;
            for (let k = 0; k < offs.length; k++) if (occ[base + offs[k]]) { ok = false; break; }
            if (ok) { found = x; break; }
          }
          if (found >= 0) { if (!best || y < best.y || (y === best.y && found < best.x)) best = { x: found, y, c }; break; }
        }
      }
      return best;
    };
    const stamp = (occ, spot) => {
      const offs = spot.c.offs, base = spot.y * PW + spot.x;
      for (let k = 0; k < offs.length; k++) occ[base + offs[k]] = 1;
    };
    for (const it0 of order) {
      const variants = [it0];
      if (allowRot) { const r1 = rotate90(it0), r2 = rotate90(r1); variants.push(r1, r2, rotate90(r2)); }
      const cands = variants.map(withLabelBand).map((it) => ({ it, r: rasterize(it, cell, dil) }));
      let spot = null, page = null;
      for (const pg of pages) { spot = findSpot(pg.occ, cands); if (spot) { page = pg; break; } }
      if (!spot) {
        page = { occ: new Uint8Array(PW * PH), items: [] };
        pages.push(page);
        spot = findSpot(page.occ, cands) || { x: 0, y: 0, c: cands[0] };
      }
      if (spot.c.offs) stamp(page.occ, spot);
      page.items.push({ it: spot.c.it, x: (spot.x + dil) * cell, y: (spot.y + dil) * cell, label: spot.c.r.label });
    }
    return pages;
  }

  function layoutFor(items, settings, W, H, warnSet) {
    const m = Math.max(0, Number(settings.margin) || 0);
    const bleed = Math.max(0, Math.min(5, Number(settings.bleed) || 0));
    // the bleed of two neighbours must not overlap the other's cut line, and
    // outward seam marks need room between pieces
    const marksOut = settings.seamMarks !== false && items.some((i) => i.printed && i.marks && i.marks.length);
    const gap = Math.max(0, Number(settings.gap) || 0, bleed > 0 ? 2 * bleed + 1 : 0, marksOut ? 5.5 : 0);
    const labelH = 0; // labels sit inside each piece
    const aw = W - 2 * m, ah = H - 2 * m - FOOTER;
    const allowRot = settings.rotateMode === 'optimize';
    const normal = [], oversize = [];
    for (let it of items) {
      const fits = (x) => { const b = withLabelBand(x); return b.w <= aw + 1e-9 && b.h <= ah + 1e-9; };
      if (fits(it)) { normal.push(it); continue; }
      if (allowRot) { const r = rotate90(it); if (fits(r)) { normal.push(r); continue; } }
      oversize.push(it);
    }
    const packed = nest(normal, aw, ah, gap, allowRot).map((pg) => ({ items: pg.items }));
    const pages = packed.map((pg) => ({ kind: 'pack', pg }));
    for (const it of oversize) {
      const th = ah - LABEL_H, tw = aw;
      let ov = Math.max(0, Number(settings.overlap) || 0);
      if (ov > Math.min(tw, th) / 3) ov = Math.min(tw, th) / 3;
      const nx = it.w <= tw ? 1 : Math.ceil((it.w - ov) / (tw - ov));
      const ny = it.h <= th ? 1 : Math.ceil((it.h - ov) / (th - ov));
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) pages.push({ kind: 'tile', it, i, j, nx, ny, tw, th, ov });
    }
    return { pages, m, aw, ah, labelH, oversize, normalCount: normal.length };
  }

  function build(pieces, settings) {
    const warnSet = new Set();
    const items = [];
    const expanded = [];
    for (const p of pieces || []) expanded.push(...(settings.splitLong === false ? [p] : splitToFit(p, settings)));
    for (const p of expanded) {
      const it = preparePiece(p, settings, warnSet);
      if (it) items.push(it);
    }
    const seams = decorate(items, settings, warnSet);
    // seam letters at their middle in 3D, for tags in the 3D view
    const seams3D = seams.map((s) => {
      const run = s.runs[0], it = items[run.k], { P } = it.src, L = run.info.L;
      const v = L[run.edges[Math.floor(run.edges.length / 2)]];
      return { letter: s.letter, pos: [P[3 * v], P[3 * v + 1], P[3 * v + 2]] };
    });
    const [pw, ph] = paperDims(settings);
    let choice;
    if (settings.orientation === 'landscape') choice = { W: ph, H: pw, o: 'landscape' };
    else if (settings.orientation === 'portrait') choice = { W: pw, H: ph, o: 'portrait' };
    else {
      const a = layoutFor(items, settings, pw, ph, warnSet), b = layoutFor(items, settings, ph, pw, warnSet);
      choice = b.pages.length < a.pages.length ? { W: ph, H: pw, o: 'landscape' } : { W: pw, H: ph, o: 'portrait' };
    }
    const { W, H, o } = choice;
    const L = layoutFor(items, settings, W, H, warnSet);
    const { m, labelH } = L;
    const paperName = settings.paper === 'custom' ? `${r3(W)}×${r3(H)} mm` : settings.paper;
    const orientName = txt(settings, o === 'landscape' ? 'landscape' : 'portrait');
    const N = L.pages.length;
    const info = new Map();
    for (const it of items) info.set(it.id, { id: it.id, parentId: it.parentId, part: it.part, parts: it.parts, group: it.group, w: it.w, h: it.h, rotated90: false, tiled: false, tiles: 0, pages: [] });
    const pages = L.pages.map((P, idx) => {
      const prims = [];
      let heat = null;
      const clip = { x: m, y: m, w: W - 2 * m, h: H - 2 * m - FOOTER };
      if (P.kind === 'pack') {
        const tris = [], colors = [];
        for (const pl of P.pg.items) {
          const it = pl.it;
          const ox = m + pl.x, oy = m + pl.y + labelH;
          piecePrims(prims, it, ox, oy, settings);
          if (settings.labels && it.labelRect) {
            prims.push({ t: 'text', x: ox + it.labelRect[0] + 0.3, y: oy + it.labelRect[3] - 0.9, text: `#${it.id}`, size: BAND_TEXT, anchor: 'start', color: '#6b7280', bold: true });
          } else if (settings.labels && pl.label && pl.label.r >= 0.8) {
            const size = Math.max(1.6, Math.min(3.2, pl.label.r * 1.1));
            prims.push({ t: 'text', x: ox + pl.label.x, y: oy + pl.label.y + size * 0.35, text: `#${it.id}`, size, anchor: 'middle', color: '#8a9099', bold: true });
          }
          if (it.heat) {
            const t = it.heat.tris;
            for (let i = 0; i < t.length; i += 2) tris.push(t[i] + ox, t[i + 1] + oy);
            colors.push(...it.heat.colors);
          }
          const inf = info.get(it.id);
          inf.pages.push(idx); inf.rotated90 = it.rotated90; inf.w = it.w; inf.h = it.h - (it.labelRect ? BAND : 0); inf.frame = it.frame;
        }
        if (tris.length) heat = { tris: Float32Array.from(tris), colors };
      } else {
        const { it, i, j, nx, ny, tw, th, ov } = P;
        const rx = i * (tw - ov), ry = j * (th - ov);
        const cx0 = m, cy0 = m + LABEL_H;
        const ox = cx0 - rx, oy = cy0 - ry;
        const X0 = cx0, Y0 = cy0, X1 = cx0 + tw, Y1 = cy0 + th;
        clip.x = X0; clip.y = Y0; clip.w = tw; clip.h = th;
        const tileNo = j * nx + i + 1;
        addLabel(prims, it, m, m, settings, txt(settings, 'tile', { id: it.id, k: tileNo, n: nx * ny, r: j + 1, c: i + 1, w: it.w.toFixed(1), h: it.h.toFixed(1) }));
        const rings = [], holes = [];
        it.rings.forEach((r, k) => {
          const c = clipRingRect(tr(r, ox, oy), X0, Y0, X1, Y1);
          if (c) { rings.push(c); holes.push(it.holes[k]); }
        });
        if (settings.fill && rings.length) prims.push({ t: 'poly', rings, holes, fill: settings.fillColor, stroke: null, width: 0, dash: null });
        for (const r of it.rings) {
          for (const pl of clipPolylineRect(tr(r, ox, oy), true, X0, Y0, X1, Y1)) prims.push({ t: 'line', pts: pl, stroke: '#111111', width: settings.lineWidth, dash: null });
        }
        for (const f of it.folds) {
          for (const pl of clipPolylineRect(tr(f, ox, oy), false, X0, Y0, X1, Y1)) prims.push({ t: 'line', pts: pl, stroke: '#6b7280', width: 0.15, dash: [1.6, 1.2] });
        }
        for (const c of it.cuts) {
          for (const pl of clipPolylineRect(tr(c, ox, oy), false, X0, Y0, X1, Y1)) prims.push({ t: 'line', pts: pl, stroke: '#111111', width: settings.lineWidth, dash: null });
        }
        for (const f of it.tabFolds || []) {
          for (const pl of clipPolylineRect(tr(f, ox, oy), false, X0, Y0, X1, Y1)) prims.push({ t: 'line', pts: pl, stroke: '#6b7280', width: 0.2, dash: [2, 1.2] });
        }
        for (const mk of it.marks || []) {
          for (const pl of clipPolylineRect(tr(mk, ox, oy), false, X0, Y0, X1, Y1)) prims.push({ t: 'line', pts: pl, stroke: '#c0392b', width: 0.3, dash: null });
        }
        for (const p of it.markText || []) {
          const x = p.x + ox, y = p.y + oy;
          if (x > X0 + 2 && x < X1 - 2 && y > Y0 + 3 && y < Y1 - 1) prims.push({ t: 'text', x, y, text: p.t, size: 2.6, anchor: 'middle', color: '#c0392b', bold: true });
        }
        prims.push({ t: 'rect', x: X0, y: Y0, w: tw, h: th, fill: null, stroke: '#9aa3ad', width: 0.15, dash: null });
        if (i < nx - 1) {
          prims.push({ t: 'line', pts: [X1 - ov, Y0, X1 - ov, Y1], stroke: '#888888', width: 0.2, dash: [2, 1.5] });
          prims.push({ t: 'text', x: X1 - ov / 2, y: Y0 + 4, text: txt(settings, 'overlap'), size: 2, anchor: 'middle', color: '#666666', bold: false });
        }
        if (j < ny - 1) {
          prims.push({ t: 'line', pts: [X0, Y1 - ov, X1, Y1 - ov], stroke: '#888888', width: 0.2, dash: [2, 1.5] });
          prims.push({ t: 'text', x: X0 + 12, y: Y1 - ov / 2 + 1, text: txt(settings, 'overlapZone'), size: 2, anchor: 'middle', color: '#666666', bold: false });
        }
        if (it.heat) {
          const t = it.heat.tris, n = new Float32Array(t.length);
          for (let q = 0; q < t.length; q += 2) { n[q] = t[q] + ox; n[q + 1] = t[q + 1] + oy; }
          heat = { tris: n, colors: it.heat.colors };
        }
        const inf = info.get(it.id);
        inf.tiled = true; inf.tiles = nx * ny; inf.pages.push(idx); inf.frame = it.frame;
        if (i === 0 && j === 0) warnSet.add(txt(settings, 'tiled', { id: it.id, w: it.w.toFixed(0), h: it.h.toFixed(0), n: nx * ny, ov: r3(ov) }));
      }
      const short = W - 2 * m < 150;
      const text = short
        ? txt(settings, 'footShort', { i: idx + 1, n: N })
        : txt(settings, 'foot', { i: idx + 1, n: N, file: settings.fileName || '', paper: paperName, orient: orientName });
      footerPrims(prims, W, H, m, settings, text);
      return { index: idx, label: txt(settings, 'page', { i: idx + 1, n: N }), clip, prims, heat };
    });
    return {
      pageW: W, pageH: H, orientation: o, pages, pieceInfo: [...info.values()].sort((a, b) => a.parentId - b.parentId || a.part - b.part),
      warnings: [...warnSet], settings: { ...settings }, seams: seams3D,
    };
  }

  // ---- SVG -------------------------------------------------------------------
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function ringsPath(rings) {
    let d = '';
    for (const r of rings) {
      for (let i = 0; i < r.length; i += 2) d += (i ? 'L' : 'M') + r3(r[i]) + ' ' + r3(r[i + 1]);
      d += 'Z';
    }
    return d;
  }

  function polyPts(p) {
    let s = '';
    for (let i = 0; i < p.length; i += 2) s += (i ? ' ' : '') + r3(p[i]) + ',' + r3(p[i + 1]);
    return s;
  }

  const dashAttr = (d) => (d ? ` stroke-dasharray="${d.join(' ')}"` : '');

  function toSVG(layout, index, opts = {}) {
    const page = layout.pages[index];
    const W = r3(layout.pageW), H = r3(layout.pageH);
    const out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}" font-family="Be Vietnam Pro, Arial, sans-serif">`];
    out.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`);
    // ids get a prefix so a second copy of the page (print) does not point at the preview's
    const pfx = opts.idPrefix || '';
    // each artwork image is embedded once per page and reused
    const imgIds = new Map();
    // a page painted beforehand (print): fills and artwork come from one image
    if (opts.background) out.push(`<image href="${opts.background}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none"/>`);
    for (const p of page.prims) {
      if (opts.background) break;
      if (p.t !== 'image' || imgIds.has(p.href)) continue;
      const id = `${pfx}art-${index}-${imgIds.size}`;
      imgIds.set(p.href, id);
      out.push(`<defs><image id="${id}" href="${esc(p.href)}" width="${p.iw}" height="${p.ih}" preserveAspectRatio="none"/></defs>`);
    }
    let clipN = 0;
    const mat = (m) => `matrix(${[m.a, m.b, m.c, m.d, m.e, m.f].map((x) => +x.toFixed(6)).join(' ')})`;
    for (const p of opts.background ? [] : page.prims) {
      if (p.t === 'poly' && p.fill && p.rings.length) out.push(`<path d="${ringsPath(p.rings)}" fill="${p.fill}" fill-rule="evenodd" stroke="none"/>`);
      else if (p.t === 'image' && p.clip.length) {
        const cid = `${pfx}art-clip-${index}-${clipN++}`;
        const op = p.opacity < 1 ? ` opacity="${p.opacity}"` : '';
        const owner = p.owner !== undefined ? ` data-art="${esc(p.owner)}"` : '';
        out.push(`<defs><clipPath id="${cid}"><path d="${ringsPath(p.clip)}" clip-rule="evenodd"/></clipPath></defs>`);
        if (p.tile) {
          out.push(`<defs><pattern id="${cid}-p" patternUnits="userSpaceOnUse" width="${p.iw}" height="${p.ih}" patternTransform="${mat(p.matrix)}"><use href="#${imgIds.get(p.href)}"/></pattern></defs>`);
          out.push(`<path d="${ringsPath(p.clip)}" fill="url(#${cid}-p)" fill-rule="evenodd"${op}${owner}/>`);
        } else {
          out.push(`<g clip-path="url(#${cid})"${op}${owner}><use href="#${imgIds.get(p.href)}" transform="${mat(p.matrix)}"/></g>`);
        }
      }
    }
    if (opts.preview && page.heat) {
      const id = `${pfx}clip-heat-${index}`;
      const c = page.clip;
      out.push(`<defs><clipPath id="${id}"><rect x="${r3(c.x)}" y="${r3(c.y)}" width="${r3(c.w)}" height="${r3(c.h)}"/></clipPath></defs><g clip-path="url(#${id})">`);
      const t = page.heat.tris;
      for (let f = 0; f < t.length / 6; f++) {
        const col = page.heat.colors[f];
        out.push(`<polygon points="${r3(t[6 * f])},${r3(t[6 * f + 1])} ${r3(t[6 * f + 2])},${r3(t[6 * f + 3])} ${r3(t[6 * f + 4])},${r3(t[6 * f + 5])}" fill="${col}" stroke="${col}" stroke-width="0.05"/>`);
      }
      out.push('</g>');
    }
    for (const p of page.prims) {
      if (p.t === 'poly') {
        const own = p.owner !== undefined ? ` data-piece="${esc(p.owner)}" data-item="${esc(p.item)}" fill-rule="evenodd"` : '';
        if (p.stroke && p.rings.length) out.push(`<path d="${ringsPath(p.rings)}" fill="none" stroke="${p.stroke}" stroke-width="${p.width}" stroke-linejoin="round"${dashAttr(p.dash)}${own}/>`);
      } else if (p.t === 'line') {
        out.push(`<polyline points="${polyPts(p.pts)}" fill="none" stroke="${p.stroke}" stroke-width="${p.width}" stroke-linejoin="round" stroke-linecap="round"${dashAttr(p.dash)}/>`);
      } else if (p.t === 'rect') {
        out.push(`<rect x="${r3(p.x)}" y="${r3(p.y)}" width="${r3(p.w)}" height="${r3(p.h)}" fill="${p.fill || 'none'}" stroke="${p.stroke || 'none'}" stroke-width="${p.width || 0}"${dashAttr(p.dash)}/>`);
      } else if (p.t === 'text') {
        out.push(`<text x="${r3(p.x)}" y="${r3(p.y)}" font-size="${p.size}" text-anchor="${p.anchor}" fill="${p.color}"${p.bold ? ' font-weight="600"' : ''}>${esc(p.text)}</text>`);
      }
    }
    out.push('</svg>');
    return out.join('');
  }

  // ---- PDF -------------------------------------------------------------------
  function loadImg(href) {
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('image'));
      im.src = href;
    });
  }
  function path2D(rings) {
    const p = new Path2D();
    for (const r of rings) {
      p.moveTo(r[0], r[1]);
      for (let i = 2; i < r.length; i += 2) p.lineTo(r[i], r[i + 1]);
      p.closePath();
    }
    return p;
  }
  // Pages with artwork: fills and images are painted on a canvas (≈300 dpi,
  // capped at 40 Mpx) that becomes the page background; lines stay vector.
  async function rasterLayer(page, W, H) {
    const dpi = Math.min(300, Math.sqrt(40e6 / (W * H)) * 25.4);
    const k = dpi / 25.4;
    const cv = document.createElement('canvas');
    cv.width = Math.round(W * k); cv.height = Math.round(H * k);
    const g = cv.getContext('2d');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, cv.width, cv.height);
    g.scale(k, k);
    const imgs = new Map();
    for (const p of page.prims) if (p.t === 'image' && !imgs.has(p.href)) imgs.set(p.href, await loadImg(p.href));
    for (const p of page.prims) {
      if (p.t === 'poly' && p.fill) { g.fillStyle = p.fill; g.fill(path2D(p.rings), 'evenodd'); }
      else if (p.t === 'image') {
        const m = p.matrix, img = imgs.get(p.href);
        g.save();
        g.clip(path2D(p.clip), 'evenodd');
        g.globalAlpha = p.opacity;
        if (p.tile) {
          const pat = g.createPattern(img, 'repeat');
          // the pattern is drawn at the image's natural size; scale it to the stored size first
          pat.setTransform(new DOMMatrix([m.a * p.iw / img.naturalWidth, m.b * p.iw / img.naturalWidth, m.c * p.ih / img.naturalHeight, m.d * p.ih / img.naturalHeight, m.e, m.f]));
          g.fillStyle = pat;
          g.fill(path2D(p.clip), 'evenodd');
        } else {
          g.transform(m.a, m.b, m.c, m.d, m.e, m.f);
          g.drawImage(img, 0, 0, p.iw, p.ih);
        }
        g.restore();
      }
    }
    return cv.toDataURL('image/jpeg', 0.92);
  }

  async function toPDF(layout) {
    const JS = (typeof window !== 'undefined' && window.jspdf && window.jspdf.jsPDF) || (globalThis.jspdf && globalThis.jspdf.jsPDF);
    if (!JS) throw new Error(txt(layout.settings, 'noPdf'));
    const W = layout.pageW, H = layout.pageH;
    const orient = W > H ? 'landscape' : 'portrait';
    const doc = new JS({ unit: 'mm', format: [W, H], orientation: orient, compress: true });
    const drawRing = (r, style) => {
      if (r.length < 4) return;
      const d = [];
      for (let i = 2; i < r.length; i += 2) d.push([r[i] - r[i - 2], r[i + 1] - r[i - 1]]);
      doc.lines(d, r[0], r[1], [1, 1], style, true);
    };
    const drawLine = (p) => {
      if (p.length < 4) return;
      const d = [];
      for (let i = 2; i < p.length; i += 2) d.push([p[i] - p[i - 2], p[i + 1] - p[i - 1]]);
      doc.lines(d, p[0], p[1], [1, 1], 'S', false);
    };
    const setDash = (d) => doc.setLineDashPattern(d || [], 0);
    const rasters = [];
    for (const page of layout.pages) rasters.push(page.prims.some((p) => p.t === 'image') ? await rasterLayer(page, W, H) : null);
    layout.pages.forEach((page, idx) => {
      if (idx > 0) doc.addPage([W, H], orient);
      if (rasters[idx]) doc.addImage(rasters[idx], 'JPEG', 0, 0, W, H);
      for (const p of page.prims) {
        if (p.t === 'poly' && p.fill && !rasters[idx]) {
          p.rings.forEach((r, k) => {
            doc.setFillColor(p.holes[k] ? '#ffffff' : p.fill);
            drawRing(r, 'F');
          });
        }
      }
      for (const p of page.prims) {
        if (p.t === 'poly') {
          if (!p.stroke) continue;
          doc.setDrawColor(p.stroke); doc.setLineWidth(p.width); setDash(p.dash);
          for (const r of p.rings) drawRing(r, 'S');
        } else if (p.t === 'line') {
          doc.setDrawColor(p.stroke); doc.setLineWidth(p.width); setDash(p.dash);
          drawLine(p.pts);
        } else if (p.t === 'rect') {
          setDash(p.dash);
          let style = '';
          if (p.fill) { doc.setFillColor(p.fill); style += 'F'; }
          if (p.stroke) { doc.setDrawColor(p.stroke); doc.setLineWidth(p.width || 0.1); style += 'D'; }
          if (style) doc.rect(p.x, p.y, p.w, p.h, style === 'D' ? 'S' : style);
        } else if (p.t === 'text') {
          doc.setFont('helvetica', p.bold ? 'bold' : 'normal');
          doc.setFontSize(p.size / 0.3528);
          doc.setTextColor(p.color);
          doc.text(ascii(p.text), p.x, p.y, { align: p.anchor === 'middle' ? 'center' : p.anchor === 'end' ? 'right' : 'left', baseline: 'alphabetic' });
        }
      }
      setDash(null);
    });
    return doc.output('blob');
  }

  // ---- Cutter outputs (one sheet, no pages) ------------------------------------
  function sheetLayout(pieces, settings) {
    const warnSet = new Set();
    const items = [];
    for (const p of pieces || []) { const it = preparePiece(p, { ...settings, heatmap: false }, warnSet); if (it) items.push(it); }
    // cutting machines need the outline only, glue tabs included
    if (settings.tabs) decorate(items, { ...settings, seamMarks: false, bleed: 0 }, warnSet);
    const [pw] = paperDims(settings);
    const m = Math.max(0, Number(settings.margin) || 0);
    const gap = Math.max(2, Number(settings.gap) || 0);
    const aw = Math.max(pw - 2 * m, ...items.map((i) => i.w));
    const pages = pack(items, aw, Infinity, gap, LABEL_H);
    const pl = pages.length ? pages[0].items : [];
    let Hs = 0;
    for (const p of pl) Hs = Math.max(Hs, p.y + p.it.h + LABEL_H);
    return { placements: pl, W: aw + 10, H: Hs + 10, off: 5 };
  }

  function toCutSVG(pieces, settings) {
    const S = sheetLayout(pieces, settings);
    const W = r3(S.W), H = r3(S.H);
    const cut = [], fold = [], lab = [];
    for (const { it, x, y } of S.placements) {
      const ox = S.off + x, oy = S.off + y + LABEL_H;
      cut.push(`<path d="${ringsPath(it.rings.map((r) => tr(r, ox, oy)))}" fill-rule="evenodd"/>`);
      for (const f of it.folds) fold.push(`<polyline points="${polyPts(tr(f, ox, oy))}"/>`);
      for (const c of it.cuts) cut.push(`<polyline points="${polyPts(tr(c, ox, oy))}"/>`);
      lab.push(`<text x="${r3(ox)}" y="${r3(S.off + y + 3.5)}" font-size="2.8">#${it.id}</text>`);
    }
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">\n`
      + `<g id="cut-lines" fill="none" stroke="#000000" stroke-width="0.1" stroke-linejoin="round">${cut.join('')}</g>\n`
      + `<g id="fold-lines" fill="none" stroke="#2563eb" stroke-width="0.1" stroke-dasharray="1.6 1.2">${fold.join('')}</g>\n`
      + `<g id="labels" fill="#888888" font-family="Arial, sans-serif">${lab.join('')}</g>\n</svg>\n`;
  }

  function toDXF(pieces, settings) {
    const S = sheetLayout(pieces, settings);
    const o = [];
    const g = (code, val) => o.push(String(code), String(val));
    g(0, 'SECTION'); g(2, 'HEADER');
    g(9, '$ACADVER'); g(1, 'AC1009');
    g(9, '$INSUNITS'); g(70, 4);
    g(9, '$MEASUREMENT'); g(70, 1);
    g(0, 'ENDSEC');
    g(0, 'SECTION'); g(2, 'ENTITIES');
    const poly = (pts, closed, layer) => {
      g(0, 'POLYLINE'); g(8, layer); g(66, 1); g(10, '0.0'); g(20, '0.0'); g(30, '0.0'); g(70, closed ? 1 : 0);
      for (let i = 0; i < pts.length; i += 2) {
        g(0, 'VERTEX'); g(8, layer); g(10, r3(pts[i]).toFixed(3)); g(20, r3(S.H - pts[i + 1]).toFixed(3)); g(30, '0.0');
      }
      g(0, 'SEQEND'); g(8, layer);
    };
    for (const { it, x, y } of S.placements) {
      const ox = S.off + x, oy = S.off + y + LABEL_H;
      for (const r of it.rings) poly(tr(r, ox, oy), true, 'CUT');
      for (const f of it.folds) poly(tr(f, ox, oy), false, 'FOLD');
      for (const c of it.cuts) poly(tr(c, ox, oy), false, 'CUT');
    }
    g(0, 'ENDSEC'); g(0, 'EOF');
    return o.join('\n') + '\n';
  }

  // ---- Print -------------------------------------------------------------------
  async function printPages(layout) {
    const W0 = layout.pageW, H0 = layout.pageH, bgs = [];
    for (const page of layout.pages) bgs.push(page.prims.some((p) => p.t === 'image') ? await rasterLayer(page, W0, H0) : null);
    const old = document.getElementById('print-root'); if (old) old.remove();
    const oldS = document.getElementById('print-style'); if (oldS) oldS.remove();
    const W = r3(layout.pageW), H = r3(layout.pageH);
    const root = document.createElement('div');
    root.id = 'print-root';
    root.innerHTML = layout.pages.map((_, i) => `<div class="print-page" style="width:${W}mm;height:${H}mm">${toSVG(layout, i, { preview: false, idPrefix: 'print-', background: bgs[i] })}</div>`).join('');
    document.body.appendChild(root);
    const st = document.createElement('style');
    st.id = 'print-style';
    st.textContent = `@page { size: ${W}mm ${H}mm; margin: 0 }
@media print {
  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; height: auto !important; overflow: visible !important; }
  :root { padding: 0 !important; }
  body > *:not(#print-root) { display: none !important; }
  #print-root { display: block !important; }
  .print-page { break-after: page; page-break-after: always; overflow: hidden; position: relative; margin: 0; padding: 0; }
  .print-page:last-child { break-after: auto; page-break-after: auto; }
  .print-page svg { display: block; width: ${W}mm; height: ${H}mm; }
}
@media screen { #print-root { display: none; } }`;
    document.head.appendChild(st);
    const cleanup = () => { root.remove(); st.remove(); window.removeEventListener('afterprint', cleanup); };
    window.addEventListener('afterprint', cleanup);
    // wait until every artwork image is decoded, or the print can come out without it
    const hrefs = bgs.filter(Boolean);
    const ready = hrefs.map((h) => new Promise((res) => {
      const im = new Image();
      im.onload = im.onerror = () => res();
      im.src = h;
      if (im.decode) im.decode().then(res, res);
    }));
    const timeout = new Promise((res) => setTimeout(res, 4000));
    Promise.race([Promise.all(ready), timeout]).then(() => setTimeout(() => window.print(), 120));
  }

  return { PAPERS, ascii, build, toSVG, toPDF, toCutSVG, toDXF, printPages, artMatrix, _internal: { splitToFit, cutAcross, subsetExtent, preparePiece, pack, clipRingRect, clipPolylineRect, ringArea, simplifyRing } };
})();
