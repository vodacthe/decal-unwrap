// ---------------------------------------------------------------------------
// Scan: turn a scan or photo of a sheet of paper with a drawing on it into
// outlines in millimetres. Finds the sheet, undoes the perspective, separates
// ink from paper under uneven light, and traces the drawn shapes.
// Pure functions on typed arrays, so they also run in Node for tests.
// ---------------------------------------------------------------------------
const Scan = (() => {
  const PAPERS = {
    A3: [297, 420], A4: [210, 297], A5: [148, 210], A6: [105, 148], B5: [176, 250],
    Letter: [215.9, 279.4], Legal: [215.9, 355.6],
  };

  function toGray(rgba, w, h) {
    const g = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) g[i] = 0.299 * rgba[4 * i] + 0.587 * rgba[4 * i + 1] + 0.114 * rgba[4 * i + 2];
    return g;
  }

  function otsu(gray) {
    const hist = new Float64Array(256);
    for (const v of gray) hist[Math.max(0, Math.min(255, v | 0))]++;
    let sum = 0, n = gray.length;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumB = 0, wB = 0, best = 0, th = 128;
    for (let t = 0; t < 256; t++) {
      wB += hist[t];
      if (!wB) continue;
      const wF = n - wB;
      if (!wF) break;
      sumB += t * hist[t];
      const mB = sumB / wB, mF = (sum - sumB) / wF, between = wB * wF * (mB - mF) ** 2;
      if (between > best) { best = between; th = t; }
    }
    return th;
  }

  // The sheet: the largest bright region. Its corners are the extreme points
  // along the two diagonals. Returns [TL, TR, BR, BL] in pixels, or the image
  // corners when no sheet stands out (a flatbed scan of the whole page).
  function detectPaper(gray, w, h) {
    const th = otsu(gray);
    const lab = new Int32Array(w * h).fill(-1);
    let best = -1, bestN = 0, id = 0;
    const stack = new Int32Array(w * h);
    for (let s = 0; s < w * h; s++) {
      if (lab[s] >= 0 || gray[s] <= th) continue;
      let top = 0, n = 0;
      stack[top++] = s; lab[s] = id;
      while (top) {
        const p = stack[--top]; n++;
        const x = p % w, y = (p / w) | 0;
        if (x > 0 && lab[p - 1] < 0 && gray[p - 1] > th) { lab[p - 1] = id; stack[top++] = p - 1; }
        if (x < w - 1 && lab[p + 1] < 0 && gray[p + 1] > th) { lab[p + 1] = id; stack[top++] = p + 1; }
        if (y > 0 && lab[p - w] < 0 && gray[p - w] > th) { lab[p - w] = id; stack[top++] = p - w; }
        if (y < h - 1 && lab[p + w] < 0 && gray[p + w] > th) { lab[p + w] = id; stack[top++] = p + w; }
      }
      if (n > bestN) { bestN = n; best = id; }
      id++;
    }
    const full = [[0, 0], [w - 1, 0], [w - 1, h - 1], [0, h - 1]];
    if (best < 0 || bestN < 0.15 * w * h) return full;
    let tl = null, tr = null, br = null, bl = null;
    let s1 = Infinity, s2 = -Infinity, s3 = -Infinity, s4 = Infinity;
    for (let p = 0; p < w * h; p++) {
      if (lab[p] !== best) continue;
      const x = p % w, y = (p / w) | 0;
      if (x + y < s1) { s1 = x + y; tl = [x, y]; }
      if (x + y > s2) { s2 = x + y; br = [x, y]; }
      if (x - y > s3) { s3 = x - y; tr = [x, y]; }
      if (x - y < s4) { s4 = x - y; bl = [x, y]; }
    }
    // a sheet covering almost the whole frame: use the frame
    const quadArea = Math.abs(polyArea([tl, tr, br, bl]));
    if (quadArea > 0.93 * w * h) return full;
    return [tl, tr, br, bl];
  }

  function polyArea(pts) {
    let s = 0;
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a[0] * b[1] - b[0] * a[1]; }
    return s / 2;
  }

  // 3×3 homography H with H·[u, v, 1] ∝ [x, y, 1] for 4 point pairs (from -> to)
  function homography(from, to) {
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const [u, v] = from[i], [x, y] = to[i];
      A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]); b.push(x);
      A.push([0, 0, 0, u, v, 1, -u * y, -v * y]); b.push(y);
    }
    // Gaussian elimination with partial pivoting
    for (let c = 0; c < 8; c++) {
      let piv = c;
      for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
      [A[c], A[piv]] = [A[piv], A[c]]; [b[c], b[piv]] = [b[piv], b[c]];
      if (Math.abs(A[c][c]) < 1e-12) throw new Error('degenerate corners');
      for (let r = 0; r < 8; r++) {
        if (r === c) continue;
        const f = A[r][c] / A[c][c];
        if (!f) continue;
        for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
        b[r] -= f * b[c];
      }
    }
    const hv = b.map((v, i) => v / A[i][i]);
    return [hv[0], hv[1], hv[2], hv[3], hv[4], hv[5], hv[6], hv[7], 1];
  }

  // Straighten the sheet: out[x, y] = photo at H(x, y), bilinear
  function warp(gray, w, h, corners, outW, outH) {
    const H = homography([[0, 0], [outW - 1, 0], [outW - 1, outH - 1], [0, outH - 1]], corners);
    const out = new Float32Array(outW * outH);
    for (let y = 0; y < outH; y++) {
      for (let x = 0; x < outW; x++) {
        const d = H[6] * x + H[7] * y + H[8];
        const sx = (H[0] * x + H[1] * y + H[2]) / d, sy = (H[3] * x + H[4] * y + H[5]) / d;
        const x0 = Math.floor(sx), y0 = Math.floor(sy);
        if (x0 < 0 || y0 < 0 || x0 >= w - 1 || y0 >= h - 1) { out[y * outW + x] = 255; continue; }
        const fx = sx - x0, fy = sy - y0, p = y0 * w + x0;
        out[y * outW + x] = (gray[p] * (1 - fx) + gray[p + 1] * fx) * (1 - fy) + (gray[p + w] * (1 - fx) + gray[p + w + 1] * fx) * fy;
      }
    }
    return out;
  }

  // Ink = noticeably darker than the paper around it, so shadows and uneven
  // light do not count. The paper brightness is a wide local average taken
  // with the ink itself replaced by plain paper, so the middle of a large
  // filled area is still seen as ink. A band along the sheet edge is ignored.
  // With inkLevel (filled drawings) the edge is put half-way between the local
  // paper and the ink, where a blurred or compressed edge really is.
  function inkMask(img, W, H, ppm, sensitivity, borderMm, inkLevel) {
    const bd = Math.round(borderMm * ppm);
    const inner = [];
    for (let y = bd; y < H - bd; y += 2) for (let x = bd; x < W - bd; x += 2) inner.push(img[y * W + x]);
    const th = otsu(inner);
    let ps = 0, pn = 0;
    for (const v of inner) if (v > th) { ps += v; pn++; }
    const paper = pn ? ps / pn : 255;
    const I = new Float64Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) {
      let row = 0;
      for (let x = 0; x < W; x++) { const v = img[y * W + x]; row += v > th ? v : paper; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row; }
    }
    const R = Math.max(6, Math.round(15 * ppm));
    const k = Math.max(0.05, Math.min(0.6, sensitivity));
    const m = new Uint8Array(W * H);
    for (let y = bd; y < H - bd; y++) {
      const y0 = Math.max(0, y - R), y1 = Math.min(H, y + R + 1);
      for (let x = bd; x < W - bd; x++) {
        const x0 = Math.max(0, x - R), x1 = Math.min(W, x + R + 1);
        const s = I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0];
        const mean = s / ((x1 - x0) * (y1 - y0));
        const cut = inkLevel === undefined ? mean * (1 - k) : Math.min(mean * 0.95, (mean + inkLevel) / 2);
        if (img[y * W + x] < cut) m[y * W + x] = 1;
      }
    }
    return m;
  }

  // Connected components: ink 8-connected, paper 4-connected.
  function components(mask, W, H) {
    const lab = new Int32Array(W * H).fill(-1);
    const kind = [], size = [];
    const stack = new Int32Array(W * H);
    let id = 0;
    for (let s = 0; s < W * H; s++) {
      if (lab[s] >= 0) continue;
      const v = mask[s];
      let top = 0, n = 0;
      stack[top++] = s; lab[s] = id;
      while (top) {
        const p = stack[--top]; n++;
        const x = p % W, y = (p / W) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          if (!v && dx && dy) continue; // paper: 4-connected
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const q = ny * W + nx;
          if (lab[q] < 0 && mask[q] === v) { lab[q] = id; stack[top++] = q; }
        }
      }
      kind.push(v); size.push(n); id++;
    }
    return { lab, kind, size, n: id };
  }

  // Outline drawings: a closed line encloses solid material, a closed line
  // inside that encloses a hole, and so on. Nesting depth from the outside:
  // paper 0 (outside), line 1, paper 2 (solid), line 3, paper 4 (hole) …
  // Material = depth 1, 2, 3 (mod 4). Filled drawings: material = ink.
  function materialMask(ink, W, H, mode) {
    if (mode === 'filled') return ink.slice();
    const { lab, kind, n } = components(ink, W, H);
    const adj = Array.from({ length: n }, () => new Set());
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const a = lab[y * W + x];
      if (x + 1 < W) { const b = lab[y * W + x + 1]; if (a !== b) { adj[a].add(b); adj[b].add(a); } }
      if (y + 1 < H) { const b = lab[(y + 1) * W + x]; if (a !== b) { adj[a].add(b); adj[b].add(a); } }
    }
    const depth = new Int32Array(n).fill(-1);
    const queue = [];
    // the paper touching the sheet border is the outside
    const seed = (p) => { const c = lab[p]; if (!kind[c] && depth[c] < 0) { depth[c] = 0; queue.push(c); } };
    for (let x = 0; x < W; x++) { seed(x); seed((H - 1) * W + x); }
    for (let y = 0; y < H; y++) { seed(y * W); seed(y * W + W - 1); }
    for (let qi = 0; qi < queue.length; qi++) {
      const c = queue[qi];
      for (const d of adj[c]) if (depth[d] < 0) { depth[d] = depth[c] + 1; queue.push(d); }
    }
    const solid = new Uint8Array(n);
    for (let c = 0; c < n; c++) { const m = depth[c] % 4; solid[c] = depth[c] >= 0 && m !== 0 ? 1 : 0; }
    const out = new Uint8Array(W * H);
    for (let p = 0; p < W * H; p++) out[p] = solid[lab[p]];
    return out;
  }

  // Marching squares on a 0/1 mask. Loops keep the material on the same side,
  // so outer outlines and holes come out with opposite signed areas.
  function traceContours(mask, W, H) {
    const at = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? mask[y * W + x] : 0);
    const KX = 2 * W + 6;
    const key = (x2, y2) => (y2 + 2) * KX + x2 + 2;
    const next = new Map(), pos = new Map();
    const T = (x, y) => [2 * x + 1, 2 * y], R = (x, y) => [2 * x + 2, 2 * y + 1], B = (x, y) => [2 * x + 1, 2 * y + 2], L = (x, y) => [2 * x, 2 * y + 1];
    const TABLE = {
      1: [[L, B, 'd']], 2: [[B, R, 'c']], 3: [[L, R, 'c']], 4: [[T, R, 'b']], 5: [[T, R, 'b'], [B, L, 'd']], 6: [[T, B, 'b']], 7: [[T, L, 'b']],
      8: [[L, T, 'a']], 9: [[T, B, 'a']], 10: [[L, T, 'a'], [R, B, 'c']], 11: [[T, R, 'a']], 12: [[L, R, 'a']], 13: [[R, B, 'a']], 14: [[L, B, 'a']],
    };
    for (let y = -1; y < H; y++) for (let x = -1; x < W; x++) {
      const a = at(x, y), b = at(x + 1, y), c = at(x + 1, y + 1), d = at(x, y + 1);
      const idx = a * 8 + b * 4 + c * 2 + d;
      const segs = TABLE[idx];
      if (!segs) continue;
      for (const [E1, E2, corner] of segs) {
        let p = E1(x, y), q = E2(x, y);
        // orient: the inside corner must be on the right of p -> q (y down)
        const cx = { a: 2 * x, b: 2 * x + 2, c: 2 * x + 2, d: 2 * x }[corner], cy = { a: 2 * y, b: 2 * y, c: 2 * y + 2, d: 2 * y + 2 }[corner];
        const cross = (q[0] - p[0]) * (cy - p[1]) - (q[1] - p[1]) * (cx - p[0]);
        if (cross < 0) [p, q] = [q, p];
        const kp = key(p[0], p[1]), kq = key(q[0], q[1]);
        next.set(kp, kq); pos.set(kp, p); pos.set(kq, q);
      }
    }
    const loops = [], seen = new Set();
    for (const start of next.keys()) {
      if (seen.has(start)) continue;
      const ring = [];
      let k = start, guard = 0;
      while (!seen.has(k) && guard++ < 1e7) {
        seen.add(k);
        const p = pos.get(k);
        ring.push(p[0] / 2, p[1] / 2);
        k = next.get(k);
        if (k === undefined) break;
      }
      if (ring.length >= 6) loops.push(ring);
    }
    return loops;
  }

  function ringArea(r) {
    let s = 0;
    const n = r.length / 2;
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; s += r[2 * i] * r[2 * j + 1] - r[2 * j] * r[2 * i + 1]; }
    return s / 2;
  }

  // Ramer–Douglas–Peucker on a closed ring
  function simplify(r, tol) {
    const n = r.length / 2;
    if (n < 8) return r.slice();
    const keep = new Uint8Array(n);
    let far = 0, fd = -1;
    for (let i = 1; i < n; i++) { const d = (r[2 * i] - r[0]) ** 2 + (r[2 * i + 1] - r[1]) ** 2; if (d > fd) { fd = d; far = i; } }
    keep[0] = keep[far] = 1;
    const stack = [[0, far], [far, n]], t2 = tol * tol;
    while (stack.length) {
      const [a, b] = stack.pop();
      if (b - a < 2) continue;
      const ax = r[2 * a], ay = r[2 * a + 1], bi = b % n, bx = r[2 * bi], by = r[2 * bi + 1];
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
      let mi = -1, md = -1;
      for (let i = a + 1; i < b; i++) {
        const px = r[2 * i] - ax, py = r[2 * i + 1] - ay;
        const d = L2 < 1e-12 ? px * px + py * py : (px * dy - py * dx) ** 2 / L2;
        if (d > md) { md = d; mi = i; }
      }
      if (md > t2) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
    }
    const out = [];
    for (let i = 0; i < n; i++) if (keep[i]) out.push(r[2 * i], r[2 * i + 1]);
    return out;
  }

  function insideRing(r, x, y) {
    let inside = false;
    const n = r.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = r[2 * i], yi = r[2 * i + 1], xj = r[2 * j], yj = r[2 * j + 1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  // Typical pen width (mm). Per ink stroke: area over half its outline length;
  // the length-weighted median, so a filled blob does not skew it.
  function strokeWidth(ink, W, H, ppm) {
    const { lab, kind, n } = components(ink, W, H);
    const area = new Float64Array(n), edges = new Float64Array(n);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const p = y * W + x;
      if (!ink[p]) continue;
      const c = lab[p];
      area[c]++;
      if (x + 1 >= W || !ink[p + 1]) edges[c]++;
      if (x === 0 || !ink[p - 1]) edges[c]++;
      if (y + 1 >= H || !ink[p + W]) edges[c]++;
      if (y === 0 || !ink[p - W]) edges[c]++;
    }
    const est = [];
    for (let c = 0; c < n; c++) if (kind[c] && edges[c] > 20) est.push([(2 * area[c]) / edges[c] / ppm, edges[c]]);
    if (!est.length) return 0;
    est.sort((a, b) => a[0] - b[0]);
    const half = est.reduce((s, e) => s + e[1], 0) / 2;
    let acc = 0;
    for (const [w, len] of est) { acc += len; if (acc >= half) return w; }
    return est[est.length - 1][0];
  }

  // Distance (px) from each pixel to the nearest pixel where mask == value
  // (two-pass 3-4 chamfer, close to Euclidean).
  function chamfer(mask, W, H, value) {
    const BIG = 1e9, d = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) d[i] = mask[i] === value ? 0 : BIG;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const p = y * W + x;
      let v = d[p];
      if (!v) continue;
      if (x > 0) v = Math.min(v, d[p - 1] + 3);
      if (y > 0) { v = Math.min(v, d[p - W] + 3); if (x > 0) v = Math.min(v, d[p - W - 1] + 4); if (x < W - 1) v = Math.min(v, d[p - W + 1] + 4); }
      d[p] = v;
    }
    for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
      const p = y * W + x;
      let v = d[p];
      if (!v) continue;
      if (x < W - 1) v = Math.min(v, d[p + 1] + 3);
      if (y < H - 1) { v = Math.min(v, d[p + W] + 3); if (x < W - 1) v = Math.min(v, d[p + W + 1] + 4); if (x > 0) v = Math.min(v, d[p + W - 1] + 4); }
      d[p] = v;
    }
    for (let i = 0; i < W * H; i++) d[i] /= 3;
    return d;
  }
  // Morphological opening with a disc of radius r px: removes parts thinner than 2r
  function openMask(mask, W, H, r) {
    const toPaper = chamfer(mask, W, H, 0);
    const core = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) core[i] = toPaper[i] > r ? 1 : 0;
    const toCore = chamfer(core, W, H, 1);
    const out = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) out[i] = mask[i] && toCore[i] <= r + 0.5 ? 1 : 0;
    return out;
  }

  // Gaussian smoothing of a closed outline (mm) along its length; sigma in mm
  function smoothRing(r, sigma) {
    const n = r.length / 2;
    let L = 0;
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; L += Math.hypot(r[2 * j] - r[2 * i], r[2 * j + 1] - r[2 * i + 1]); }
    if (L < 6 * sigma) return r.slice();
    const h = Math.min(0.1, sigma / 3), N = Math.max(16, Math.round(L / h)), step = L / N;
    const xs = new Float64Array(N), ys = new Float64Array(N);
    let i = 0, acc = 0, t = 0, k = 0;
    while (k < N) {
      const a = i % n, b = (i + 1) % n, l = Math.hypot(r[2 * b] - r[2 * a], r[2 * b + 1] - r[2 * a + 1]);
      if (t <= acc + l || i >= 2 * n) {
        const q = l > 0 ? Math.min(1, (t - acc) / l) : 0;
        xs[k] = r[2 * a] + (r[2 * b] - r[2 * a]) * q; ys[k] = r[2 * a + 1] + (r[2 * b + 1] - r[2 * a + 1]) * q;
        k++; t += step;
      } else { acc += l; i++; }
    }
    const s = sigma / step, R = Math.ceil(3 * s), w = [];
    for (let j = -R; j <= R; j++) w.push(Math.exp(-(j * j) / (2 * s * s)));
    const ws = w.reduce((p, q) => p + q, 0);
    const out = new Array(2 * N);
    for (let c = 0; c < N; c++) {
      let sx = 0, sy = 0;
      for (let j = -R; j <= R; j++) { const m = (((c + j) % N) + N) % N, wj = w[j + R]; sx += xs[m] * wj; sy += ys[m] * wj; }
      out[2 * c] = sx / ws; out[2 * c + 1] = sy / ws;
    }
    return out;
  }

  // Whole pipeline. gray: photo pixels (w×h); corners: sheet corners TL, TR, BR, BL;
  // paper: [width, height] mm of the sheet as seen (portrait or landscape).
  // Returns shapes in mm, y down from the sheet's top-left corner.
  function extract(gray, w, h, corners, paper, opts = {}) {
    const ppm = opts.ppm || 5;
    const W = Math.round(paper[0] * ppm), Hh = Math.round(paper[1] * ppm);
    const rect = warp(gray, w, h, corners, W, Hh);
    const sens = opts.sensitivity === undefined ? 0.22 : opts.sensitivity, border = opts.border === undefined ? 4 : opts.border;
    let ink = inkMask(rect, W, Hh, ppm, sens, border);
    // auto: pen lines are thin; anything wider than 2 mm is a filled drawing
    const width = strokeWidth(ink, W, Hh, ppm);
    const mode = opts.mode === 'filled' || opts.mode === 'outline' ? opts.mode : width > 2 ? 'filled' : 'outline';
    if (mode === 'filled') {
      // the ink's own darkness: median of pixels well inside the found ink
      const core = [];
      for (let y = 2; y < Hh - 2; y++) for (let x = 2; x < W - 2; x++) {
        const p = y * W + x;
        if (ink[p] && ink[p - 2] && ink[p + 2] && ink[p - 2 * W] && ink[p + 2 * W]) core.push(rect[p]);
      }
      if (core.length > 50) {
        core.sort((a, b) => a - b);
        ink = inkMask(rect, W, Hh, ppm, sens, border, core[core.length >> 1]);
      }
    }
    let mat = materialMask(ink, W, Hh, mode);
    // filled drawings: thin pencil lines or scratches touching a shape are not part of it
    const open = opts.open === undefined ? 0.6 : opts.open;
    // and small bites out of the edge (light reflections on a dark part) are filled
    const close = opts.close === undefined ? 0.6 : opts.close;
    if (mode === 'filled' && close > 0) {
      const inv = new Uint8Array(W * Hh);
      for (let i = 0; i < W * Hh; i++) inv[i] = mat[i] ? 0 : 1;
      const o = openMask(inv, W, Hh, close * ppm);
      for (let i = 0; i < W * Hh; i++) mat[i] = o[i] ? 0 : 1;
    }
    if (mode === 'filled' && open > 0) mat = openMask(mat, W, Hh, open * ppm);
    // pixel staircase and a ragged ink edge -> smooth outline
    const smooth = opts.smooth === undefined ? 0.8 : opts.smooth;
    const loops = traceContours(mat, W, Hh).map((r) => {
      const mm = r.map((v) => v / ppm);
      return smooth > 0 ? simplify(smoothRing(mm, smooth), 0.02) : simplify(mm, 0.7 / ppm);
    });
    const minArea = opts.minArea === undefined ? 20 : opts.minArea;
    // material on the right of each loop (y down): outer outlines run clockwise
    // on screen (positive area), holes the other way
    const outers = [], holes = [];
    for (const r of loops) {
      const a = ringArea(r);
      if (a > 0) { if (a >= minArea) outers.push({ outer: r, holes: [], area: a }); } else if (-a >= Math.max(1, minArea / 8)) holes.push({ r, a: -a });
    }
    for (const hl of holes) {
      let best = null;
      for (const o of outers) if (insideRing(o.outer, hl.r[0], hl.r[1]) && (!best || o.area < best.area)) best = o;
      if (best) best.holes.push(hl.r);
    }
    const stroke = mode === 'outline' ? width : 0;
    return { shapes: outers, rect, ink, material: mat, W, H: Hh, ppm, stroke, mode };
  }

  // The closest paper size for a quad, given its rough aspect ratio
  function guessOrientation(corners) {
    const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const wpx = (d(corners[0], corners[1]) + d(corners[3], corners[2])) / 2;
    const hpx = (d(corners[0], corners[3]) + d(corners[1], corners[2])) / 2;
    return wpx > hpx ? 'landscape' : 'portrait';
  }

  // Binary STL from a flat list of triangles (9 floats each, mm)
  function toSTL(tris, name = 'scan') {
    const n = tris.length / 9;
    const buf = new ArrayBuffer(84 + 50 * n), dv = new DataView(buf);
    const head = `Decal Unwrap ${name}`.slice(0, 79);
    for (let i = 0; i < head.length; i++) dv.setUint8(i, head.charCodeAt(i) & 127);
    dv.setUint32(80, n, true);
    for (let t = 0; t < n; t++) {
      const o = 84 + 50 * t, p = 9 * t;
      const ux = tris[p + 3] - tris[p], uy = tris[p + 4] - tris[p + 1], uz = tris[p + 5] - tris[p + 2];
      const vx = tris[p + 6] - tris[p], vy = tris[p + 7] - tris[p + 1], vz = tris[p + 8] - tris[p + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      dv.setFloat32(o, nx, true); dv.setFloat32(o + 4, ny, true); dv.setFloat32(o + 8, nz, true);
      for (let k = 0; k < 9; k++) dv.setFloat32(o + 12 + 4 * k, tris[p + k], true);
      dv.setUint16(o + 48, 0, true);
    }
    return buf;
  }

  return { PAPERS, toGray, otsu, detectPaper, homography, warp, inkMask, materialMask, traceContours, simplify, ringArea, extract, guessOrientation, toSTL };
})();
