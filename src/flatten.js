// ---------------------------------------------------------------------------
// Flat: turns painted face groups into flat pieces (mm, 1:1).
// Pipeline per group: orientation repair -> components -> local mesh (corner
// union-find) -> auto seams -> init (projection or LSCM) -> ARAP -> stats.
// Pure JS (no THREE, no DOM) so it runs in Node for tests.
// ---------------------------------------------------------------------------
const Flat = (() => {
  const PI = Math.PI;

  // progress and warning text (opts.lang: 'en' default, 'vi')
  const MSG = {
    en: {
      analysing: 'Analysing painted areas…', progress: 'Area {a}/{n} · piece {p} · {s}', building: 'building mesh',
      factorizing: 'factorizing', done: 'Done',
      specks: 'Skipped {n} specks smaller than 1 mm².',
      nothing: 'Nothing is painted yet (or the painted area is too small).',
      stretched: '{n} piece(s) still stretch more than 3% (strongly double-curved areas). Turn on the stretch map to see where; lowering the max stretch per piece splits them further.',
      folded: '{n} small triangle(s) folded over while flattening, usually on fillets or hole walls. If an outline looks messy, erase those edges from the selection.',
      closed: '{n} closed surface(s): turn on automatic seams or split them into several groups.',
      torus: '{n} ring-shaped surface(s) may overlap after flattening; split them into several groups.',
      slivers: 'Left out {n} hair-thin strip(s) (under 0.6 mm wide, usually bits of fillets).',
      merged: 'Joined {n} flat piece(s) that lie on the same plane as a neighbour (the model is made of separate meshes there).',
      huge: '{n} piece(s) have more than 150,000 triangles; flattening is slow.',
    },
    vi: {
      analysing: 'Đang phân tích vùng đã tô…', progress: 'Vùng {a}/{n} · mảnh {p} · {s}', building: 'dựng lưới',
      factorizing: 'phân tích ma trận', done: 'Xong',
      specks: 'Bỏ qua {n} mảnh vụn nhỏ hơn 1 mm².',
      nothing: 'Chưa có bề mặt nào được tô (hoặc vùng tô quá nhỏ).',
      stretched: '{n} mảnh vẫn méo hơn 3% (vùng cong kép mạnh). Bật bản đồ độ méo để xem chỗ nào; giảm "Độ méo tối đa mỗi mảnh" để tách nhỏ thêm.',
      folded: '{n} tam giác nhỏ bị gấp khi trải phẳng (thường ở mép bo hoặc thành lỗ). Nếu đường cắt bị rối, hãy tẩy bớt các mép đó khỏi vùng tô.',
      closed: '{n} bề mặt khép kín: hãy bật tự cắt đường nối hoặc chia thành nhiều nhóm.',
      torus: '{n} bề mặt dạng vòng có thể chồng lấn sau khi trải phẳng; hãy chia thành nhiều nhóm.',
      slivers: 'Đã bỏ {n} dải quá mảnh (hẹp dưới 0,6 mm, thường là phần mép bo).',
      merged: 'Đã gộp {n} mảnh phẳng nằm cùng mặt phẳng với mảnh bên cạnh (chỗ đó mô hình gồm nhiều lưới rời nhau).',
      huge: '{n} mảnh có hơn 150.000 tam giác; trải phẳng sẽ chậm.',
    },
  };
  function msg(lang, key, vars) {
    let s = (MSG[lang] && MSG[lang][key]) || MSG.en[key] || key;
    if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : ''));
    return s;
  }
  const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

  // MessageChannel yields are not clamped like setTimeout in busy/background tabs.
  const yieldNow = (() => {
    if (typeof window === 'undefined' || typeof MessageChannel === 'undefined') return () => new Promise((r) => setTimeout(r, 0));
    const ch = new MessageChannel();
    const q = [];
    ch.port1.onmessage = () => { const r = q.shift(); if (r) r(); };
    return () => new Promise((r) => { q.push(r); ch.port2.postMessage(0); });
  })();

  function makeTicker(isCancelled) {
    let last = now();
    let frames = 0;
    return async function tick(force) {
      if (force || now() - last > 30) {
        // every few yields use a real timer so the page can repaint progress
        if (++frames % 4 === 0) await new Promise((r) => setTimeout(r, 0));
        else await yieldNow();
        last = now();
        if (isCancelled && isCancelled()) throw new Error('cancelled');
      }
    };
  }

  function ufMake(n) { const p = new Int32Array(n); for (let i = 0; i < n; i++) p[i] = i; return p; }
  function ufFind(p, x) { while (p[x] !== x) { p[x] = p[p[x]]; x = p[x]; } return x; }
  function ufUnion(p, a, b) { a = ufFind(p, a); b = ufFind(p, b); if (a !== b) { if (a < b) p[b] = a; else p[a] = b; } }

  // ---- Orientation + interior edges for a face set -------------------------
  function prepare(model, faces, faceLocal, cutFlag) {
    const n = faces.length;
    const { tri, faceEdge, edgeFaceStart, edgeFaces, fA } = model;
    for (let i = 0; i < n; i++) faceLocal[faces[i]] = i;
    const pf = new Int32Array(3 * n).fill(-1), pk = new Int8Array(3 * n), same = new Uint8Array(3 * n);
    for (let i = 0; i < n; i++) {
      const f = faces[i];
      for (let k = 0; k < 3; k++) {
        const e = faceEdge[3 * f + k];
        let cnt = 0, other = -1;
        for (let s = edgeFaceStart[e]; s < edgeFaceStart[e + 1]; s++) {
          const g = edgeFaces[s];
          if (faceLocal[g] >= 0) { cnt++; if (g !== f) other = g; }
        }
        if (cnt !== 2 || other < 0) continue;
        let kk = 0;
        while (kk < 3 && faceEdge[3 * other + kk] !== e) kk++;
        if (kk === 3) continue;
        pf[3 * i + k] = faceLocal[other];
        pk[3 * i + k] = kk;
        same[3 * i + k] = tri[3 * f + k] === tri[3 * other + kk] ? 1 : 0;
      }
    }
    // BFS orientation propagation; keep the majority (by area) original winding.
    const flip = new Int8Array(n).fill(-1);
    const conflict = new Uint8Array(3 * n);
    const queue = new Int32Array(n);
    for (let s0 = 0; s0 < n; s0++) {
      if (flip[s0] >= 0) continue;
      let qh = 0, qt = 0;
      flip[s0] = 0; queue[qt++] = s0;
      let aFlip = 0, aAll = 0;
      while (qh < qt) {
        const i = queue[qh++];
        const ar = fA[faces[i]];
        aAll += ar; if (flip[i]) aFlip += ar;
        for (let k = 0; k < 3; k++) {
          const j = pf[3 * i + k];
          if (j < 0) continue;
          const need = flip[i] ^ same[3 * i + k];
          if (flip[j] < 0) { flip[j] = need; queue[qt++] = j; }
          else if (flip[j] !== need) { conflict[3 * i + k] = 1; conflict[3 * j + pk[3 * i + k]] = 1; }
        }
      }
      if (aFlip > aAll / 2) for (let q = 0; q < qt; q++) flip[queue[q]] ^= 1;
    }
    const lf = new Uint32Array(3 * n), le = new Int32Array(3 * n);
    for (let i = 0; i < n; i++) {
      const f = faces[i];
      const t0 = tri[3 * f], t1 = tri[3 * f + 1], t2 = tri[3 * f + 2];
      const e0 = faceEdge[3 * f], e1 = faceEdge[3 * f + 1], e2 = faceEdge[3 * f + 2];
      if (!flip[i]) { lf[3 * i] = t0; lf[3 * i + 1] = t1; lf[3 * i + 2] = t2; le[3 * i] = e0; le[3 * i + 1] = e1; le[3 * i + 2] = e2; }
      else { lf[3 * i] = t0; lf[3 * i + 1] = t2; lf[3 * i + 2] = t1; le[3 * i] = e2; le[3 * i + 1] = e1; le[3 * i + 2] = e0; }
    }
    const ip = new Int32Array(3 * n).fill(-1), ik = new Int8Array(3 * n);
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 3; k++) {
        const ko = flip[i] ? 2 - k : k;
        const j = pf[3 * i + ko];
        const e = le[3 * i + k];
        if (j < 0 || conflict[3 * i + ko] || cutFlag[e]) continue;
        let kk = 0;
        while (kk < 3 && le[3 * j + kk] !== e) kk++;
        if (kk === 3) continue;
        if (lf[3 * i + k] === lf[3 * j + (kk + 1) % 3]) { ip[3 * i + k] = j; ik[3 * i + k] = kk; }
      }
    }
    for (let i = 0; i < n; i++) faceLocal[faces[i]] = -1;
    return { n, faces, lf, le, ip, ik };
  }

  function components(prep) {
    const { n, faces, ip } = prep;
    const p = ufMake(n);
    for (let c = 0; c < 3 * n; c++) if (ip[c] >= 0) ufUnion(p, (c / 3) | 0, ip[c]);
    const map = new Map();
    for (let i = 0; i < n; i++) {
      const r = ufFind(p, i);
      let arr = map.get(r);
      if (!arr) { arr = []; map.set(r, arr); }
      arr.push(faces[i]);
    }
    return [...map.values()].map((a) => Int32Array.from(a));
  }

  // ---- Local mesh of one component ------------------------------------------
  function buildMesh(model, prep) {
    const { n, faces, lf, le, ip, ik } = prep;
    const pos = model.pos;
    const uf = ufMake(3 * n);
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 3; k++) {
        const j = ip[3 * i + k];
        if (j < i) continue;
        const kk = ik[3 * i + k];
        ufUnion(uf, 3 * i + k, 3 * j + (kk + 1) % 3);
        ufUnion(uf, 3 * i + (k + 1) % 3, 3 * j + kk);
      }
    }
    const rootId = new Int32Array(3 * n).fill(-1);
    const F = new Uint32Array(3 * n);
    let nV = 0;
    for (let c = 0; c < 3 * n; c++) {
      const r = ufFind(uf, c);
      if (rootId[r] < 0) rootId[r] = nV++;
      F[c] = rootId[r];
    }
    const P = new Float64Array(3 * nV), gv = new Uint32Array(nV);
    for (let c = 0; c < 3 * n; c++) {
      const v = F[c], g = lf[c];
      gv[v] = g;
      P[3 * v] = pos[3 * g]; P[3 * v + 1] = pos[3 * g + 1]; P[3 * v + 2] = pos[3 * g + 2];
    }
    // corner angles
    const angleSum = new Float64Array(nV);
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 3; k++) {
        const a = 3 * F[3 * i + k], b = 3 * F[3 * i + (k + 1) % 3], c = 3 * F[3 * i + (k + 2) % 3];
        const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
        const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
        const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
        angleSum[F[3 * i + k]] += Math.atan2(Math.hypot(cx, cy, cz), ux * vx + uy * vy + uz * vz);
      }
    }
    // boundary half-edges: corner c from F[c] to F[next(c)]
    const nextC = (c) => 3 * ((c / 3) | 0) + ((c % 3) + 1) % 3;
    const bHead = new Int32Array(nV).fill(-1), bNext = new Int32Array(3 * n).fill(-1);
    let nB = 0;
    for (let c = 0; c < 3 * n; c++) {
      if (ip[c] >= 0) continue;
      nB++;
      const a = F[c];
      bNext[c] = bHead[a]; bHead[a] = c;
    }
    const used = new Uint8Array(3 * n);
    const loops = [];
    for (let c0 = 0; c0 < 3 * n; c0++) {
      if (ip[c0] >= 0 || used[c0]) continue;
      const loop = [];
      let c = c0, guard = 0;
      while (c >= 0 && !used[c] && guard++ < 3 * n + 5) {
        used[c] = 1;
        loop.push(F[c]);
        const b = F[nextC(c)];
        let nc = bHead[b];
        while (nc >= 0 && used[nc]) nc = bNext[nc];
        c = nc;
      }
      if (loop.length >= 2) loops.push(Int32Array.from(loop));
    }
    const tau = loops.map((L) => { let s = 0; for (const v of L) s += PI - angleSum[v]; return s; });
    const nE = (3 * n + nB) / 2;
    const chi = nV - nE + n;
    const genus = Math.round((2 - chi - loops.length) / 2);
    // graph for Dijkstra
    const deg = new Int32Array(nV + 1);
    for (let c = 0; c < 3 * n; c++) { deg[F[c] + 1]++; deg[F[nextC(c)] + 1]++; }
    for (let v = 0; v < nV; v++) deg[v + 1] += deg[v];
    const adjTo = new Int32Array(6 * n), adjE = new Int32Array(6 * n), adjW = new Float64Array(6 * n);
    const fillp = deg.slice(0, nV);
    for (let c = 0; c < 3 * n; c++) {
      const a = F[c], b = F[nextC(c)];
      const w = Math.hypot(P[3 * a] - P[3 * b], P[3 * a + 1] - P[3 * b + 1], P[3 * a + 2] - P[3 * b + 2]);
      let q = fillp[a]++; adjTo[q] = b; adjE[q] = le[c]; adjW[q] = w;
      q = fillp[b]++; adjTo[q] = a; adjE[q] = le[c]; adjW[q] = w;
    }
    return { n, faces, F, P, nV, gv, ip, ik, le, loops, tau, chi, genus, graph: { ptr: deg, to: adjTo, e: adjE, w: adjW } };
  }

  function dijkstra(mesh, sources, targetMask) {
    const { nV } = mesh;
    const { ptr, to, e: ed, w } = mesh.graph;
    const dist = new Float64Array(nV).fill(Infinity);
    const prevV = new Int32Array(nV).fill(-1), prevE = new Int32Array(nV).fill(-1);
    let hv = new Int32Array(64), hd = new Float64Array(64), hn = 0;
    const push = (v, d) => {
      if (hn === hv.length) { const a = new Int32Array(hn * 2); a.set(hv); hv = a; const b = new Float64Array(hn * 2); b.set(hd); hd = b; }
      let i = hn++;
      while (i > 0) { const p = (i - 1) >> 1; if (hd[p] <= d) break; hv[i] = hv[p]; hd[i] = hd[p]; i = p; }
      hv[i] = v; hd[i] = d;
    };
    const pop = () => {
      const v = hv[0];
      hn--;
      if (hn > 0) {
        const lv = hv[hn], ld = hd[hn];
        let i = 0;
        for (;;) {
          let c = 2 * i + 1;
          if (c >= hn) break;
          if (c + 1 < hn && hd[c + 1] < hd[c]) c++;
          if (hd[c] >= ld) break;
          hv[i] = hv[c]; hd[i] = hd[c]; i = c;
        }
        hv[i] = lv; hd[i] = ld;
      }
      return v;
    };
    for (const s of sources) { dist[s] = 0; push(s, 0); }
    let reached = -1;
    while (hn > 0) {
      const d = hd[0];
      const v = pop();
      if (d > dist[v]) continue;
      if (targetMask && targetMask[v]) { reached = v; break; }
      for (let q = ptr[v]; q < ptr[v + 1]; q++) {
        const t = to[q], nd = d + w[q];
        if (nd < dist[t]) { dist[t] = nd; prevV[t] = v; prevE[t] = ed[q]; push(t, nd); }
      }
    }
    return { dist, prevV, prevE, reached };
  }

  function pathEdges(res, from) {
    const out = [];
    let v = from, guard = 0;
    while (v >= 0 && res.prevV[v] >= 0 && guard++ < 1e7) { out.push(res.prevE[v]); v = res.prevV[v]; }
    return out;
  }

  // Returns the number of seam paths marked in cutFlag. `force` also cuts inner
  // loops that turn like a plain hole (used when the uncut piece will not lie flat).
  function planSeams(mesh, cutFlag, force = false) {
    const { nV, loops, tau } = mesh;
    if (nV < 4) return 0;
    if (loops.length === 0) {
      const d0 = dijkstra(mesh, [0], null);
      let a = 0; for (let v = 0; v < nV; v++) if (isFinite(d0.dist[v]) && d0.dist[v] > d0.dist[a]) a = v;
      const d1 = dijkstra(mesh, [a], null);
      let b = a; for (let v = 0; v < nV; v++) if (isFinite(d1.dist[v]) && d1.dist[v] > d1.dist[b]) b = v;
      const edges = pathEdges(d1, b);
      for (const e of edges) cutFlag[e] = 1;
      return edges.length ? 1 : 0;
    }
    const P = mesh.P;
    const loopLen = loops.map((L) => {
      let s = 0;
      for (let i = 0; i < L.length; i++) {
        const a = 3 * L[i], b = 3 * L[(i + 1) % L.length];
        s += Math.hypot(P[a] - P[b], P[a + 1] - P[b + 1], P[a + 2] - P[b + 2]);
      }
      return s;
    });
    let outer = 0;
    for (let i = 1; i < loops.length; i++) if (tau[i] > tau[outer] || (tau[i] === tau[outer] && loopLen[i] > loopLen[outer])) outer = i;
    const inS = new Uint8Array(nV);
    for (const v of loops[outer]) inS[v] = 1;
    let cuts = 0;
    for (let i = 0; i < loops.length; i++) {
      // A rim of a sleeve/cup: almost no turning (the surface wraps around it)
      // and comparable in length to the outer boundary. Small holes whose
      // walls or fillets were painted are left alone.
      if (i === outer || (!force && tau[i] <= -PI) || loopLen[i] < 0.3 * loopLen[outer]) continue;
      const res = dijkstra(mesh, loops[i], inS);
      if (res.reached < 0) continue;
      const edges = pathEdges(res, res.reached);
      for (const e of edges) cutFlag[e] = 1;
      for (const v of loops[i]) inS[v] = 1;
      let v = res.reached; while (v >= 0) { inS[v] = 1; v = res.prevV[v]; }
      if (edges.length) cuts++;
    }
    return cuts;
  }

  // ---- Linear algebra --------------------------------------------------------
  function buildAdjacency(nV, F) {
    const nbr = new Array(nV);
    for (let v = 0; v < nV; v++) nbr[v] = [v];
    for (let c = 0; c < F.length; c += 3) {
      for (let k = 0; k < 3; k++) {
        const a = F[c + k], b = F[c + (k + 1) % 3];
        nbr[a].push(b); nbr[b].push(a);
      }
    }
    const rowPtr = new Int32Array(nV + 1);
    const rows = new Array(nV);
    for (let v = 0; v < nV; v++) {
      const r = nbr[v].sort((x, y) => x - y);
      const u = [];
      for (let i = 0; i < r.length; i++) if (i === 0 || r[i] !== r[i - 1]) u.push(r[i]);
      rows[v] = u;
      rowPtr[v + 1] = rowPtr[v] + u.length;
    }
    const col = new Int32Array(rowPtr[nV]);
    for (let v = 0; v < nV; v++) col.set(rows[v], rowPtr[v]);
    // positions of (corner k, corner l) entries per face
    const nF = F.length / 3;
    const fIdx = new Int32Array(nF * 9);
    for (let f = 0; f < nF; f++) {
      for (let k = 0; k < 3; k++) {
        const i = F[3 * f + k];
        for (let l = 0; l < 3; l++) {
          const j = F[3 * f + l];
          let p = rowPtr[i];
          while (p < rowPtr[i + 1] && col[p] !== j) p++;
          fIdx[9 * f + 3 * k + l] = p;
        }
      }
    }
    return { rowPtr, col, fIdx };
  }

  async function pcg(matvec, diagInv, b, x, fixed, maxIt, tol, ws, tick) {
    const N = x.length;
    const { r, z, p, Ap } = ws;
    matvec(x, Ap);
    let bn = 0, rn = 0;
    for (let i = 0; i < N; i++) {
      if (fixed && fixed[i]) { r[i] = 0; continue; }
      r[i] = b[i] - Ap[i];
      bn += b[i] * b[i];
      rn += r[i] * r[i];
    }
    const ref = Math.max(Math.sqrt(bn), Math.sqrt(rn), 1e-300);
    if (Math.sqrt(rn) <= tol * ref) return 0;
    let rz = 0;
    for (let i = 0; i < N; i++) { z[i] = r[i] * diagInv[i]; p[i] = z[i]; rz += r[i] * z[i]; }
    let it = 0;
    for (; it < maxIt; it++) {
      matvec(p, Ap);
      let pAp = 0;
      for (let i = 0; i < N; i++) { if (fixed && fixed[i]) Ap[i] = 0; pAp += p[i] * Ap[i]; }
      if (!(pAp > 0)) break;
      const alpha = rz / pAp;
      let r2 = 0;
      for (let i = 0; i < N; i++) { x[i] += alpha * p[i]; r[i] -= alpha * Ap[i]; r2 += r[i] * r[i]; }
      if (Math.sqrt(r2) <= tol * ref) { it++; break; }
      let rzN = 0;
      for (let i = 0; i < N; i++) { z[i] = r[i] * diagInv[i]; rzN += r[i] * z[i]; }
      const beta = rzN / rz;
      rz = rzN;
      for (let i = 0; i < N; i++) p[i] = z[i] + beta * p[i];
      if ((it & 31) === 31) await tick();
    }
    return it;
  }

  function workspace(N) {
    return { r: new Float64Array(N), z: new Float64Array(N), p: new Float64Array(N), Ap: new Float64Array(N) };
  }

  // ---- Direct solver: RCM ordering + envelope (skyline) Cholesky ----------------
  // A is a scalar symmetric CSR matrix (rowPtr, col, val) over N unknowns; rows
  // with fixed[i] are eliminated (their current x values act as boundary data).
  // Returns null when the envelope would be too large or A is not SPD.
  async function directSolver(N, rowPtr, col, val, fixed, tick, maxProfile = 2.5e7) {
    const f2o = [], o2f = new Int32Array(N).fill(-1);
    for (let i = 0; i < N; i++) if (!fixed || !fixed[i]) { o2f[i] = f2o.length; f2o.push(i); }
    const n = f2o.length;
    if (!n) return null;
    // free-graph degrees
    const deg = new Int32Array(n);
    for (let a = 0; a < n; a++) {
      const i = f2o[a];
      for (let p = rowPtr[i]; p < rowPtr[i + 1]; p++) if (o2f[col[p]] >= 0 && col[p] !== i) deg[a]++;
    }
    const nbrs = (a, out) => {
      out.length = 0;
      const i = f2o[a];
      for (let p = rowPtr[i]; p < rowPtr[i + 1]; p++) { const b = o2f[col[p]]; if (b >= 0 && b !== a) out.push(b); }
      return out;
    };
    // Reverse Cuthill–McKee
    const order = new Int32Array(n), seen = new Uint8Array(n), lvl = new Int32Array(n);
    const tmp = [];
    let pos = 0;
    const bfsLast = (s) => {
      // returns the last node reached by BFS from s (pseudo-peripheral search)
      const q = [s]; const mark = new Map([[s, 1]]);
      let h = 0, last = s;
      while (h < q.length) {
        const v = q[h++]; last = v;
        for (const w of nbrs(v, tmp)) if (!seen[w] && !mark.has(w)) { mark.set(w, 1); q.push(w); }
      }
      return last;
    };
    for (let s0 = 0; s0 < n; s0++) {
      if (seen[s0]) continue;
      let s = s0;
      for (let r = 0; r < 2; r++) s = bfsLast(s);
      const start = pos;
      order[pos++] = s; seen[s] = 1;
      let h = start;
      while (h < pos) {
        const v = order[h++];
        const list = nbrs(v, tmp).filter((w) => !seen[w]).sort((x, y) => deg[x] - deg[y]);
        for (const w of list) { if (!seen[w]) { seen[w] = 1; order[pos++] = w; } }
      }
      await tick();
    }
    const perm = new Int32Array(n), iperm = new Int32Array(n);
    for (let k = 0; k < n; k++) { perm[k] = order[n - 1 - k]; }
    for (let k = 0; k < n; k++) iperm[perm[k]] = k;
    // envelope
    const first = new Int32Array(n);
    for (let k = 0; k < n; k++) first[k] = k;
    for (let a = 0; a < n; a++) {
      const k = iperm[a];
      for (const b of nbrs(a, tmp)) { const kb = iperm[b]; if (kb < first[k]) first[k] = kb; }
    }
    const start = new Float64Array(n + 1);
    for (let k = 0; k < n; k++) start[k + 1] = start[k] + (k - first[k] + 1);
    const total = start[n];
    if (total > maxProfile) return null;
    const L = new Float64Array(total);
    for (let a = 0; a < n; a++) {
      const i = f2o[a], k = iperm[a];
      for (let p = rowPtr[i]; p < rowPtr[i + 1]; p++) {
        const b = o2f[col[p]];
        if (b < 0) continue;
        const kb = iperm[b];
        if (kb <= k) L[start[k] + kb - first[k]] += val[p];
      }
    }
    // factor (row-oriented envelope Cholesky)
    let t0 = now();
    for (let i = 0; i < n; i++) {
      const fi = first[i], si = start[i] - fi;
      for (let j = fi; j < i; j++) {
        const fj = first[j], sj = start[j] - fj;
        let s = L[si + j];
        for (let k = fi > fj ? fi : fj; k < j; k++) s -= L[si + k] * L[sj + k];
        L[si + j] = s / L[sj + j];
      }
      let d = L[si + i];
      for (let k = fi; k < i; k++) d -= L[si + k] * L[si + k];
      if (!(d > 0)) return null;
      L[si + i] = Math.sqrt(d);
      if (now() - t0 > 30) { await tick(); t0 = now(); }
    }
    const y = new Float64Array(n);
    return {
      profile: total,
      // solve A x = b for the free unknowns; fixed x entries are kept
      solve(b, x) {
        for (let a = 0; a < n; a++) {
          const i = f2o[a];
          let s = b[i];
          for (let p = rowPtr[i]; p < rowPtr[i + 1]; p++) if (o2f[col[p]] < 0) s -= val[p] * x[col[p]];
          y[iperm[a]] = s;
        }
        for (let i = 0; i < n; i++) {
          const fi = first[i], si = start[i] - fi;
          let s = y[i];
          for (let k = fi; k < i; k++) s -= L[si + k] * y[k];
          y[i] = s / L[si + i];
        }
        for (let i = n - 1; i >= 0; i--) {
          const fi = first[i], si = start[i] - fi;
          const xi = y[i] / L[si + i];
          y[i] = xi;
          for (let k = fi; k < i; k++) y[k] -= L[si + k] * xi;
        }
        for (let a = 0; a < n; a++) x[f2o[a]] = y[iperm[a]];
      },
    };
  }

  // 3x3 symmetric eigen decomposition (Jacobi). Returns {values, vectors(columns)}.
  function eigSym3(A) {
    const a = [[A[0], A[1], A[2]], [A[1], A[3], A[4]], [A[2], A[4], A[5]]];
    const V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (let sweep = 0; sweep < 50; sweep++) {
      let off = Math.abs(a[0][1]) + Math.abs(a[0][2]) + Math.abs(a[1][2]);
      if (off < 1e-14) break;
      for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
        if (Math.abs(a[p][q]) < 1e-300) continue;
        const th = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < 3; k++) {
          const akp = a[k][p], akq = a[k][q];
          a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < 3; k++) {
          const apk = a[p][k], aqk = a[q][k];
          a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < 3; k++) {
          const vkp = V[k][p], vkq = V[k][q];
          V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq;
        }
      }
    }
    return { values: [a[0][0], a[1][1], a[2][2]], vectors: [0, 1, 2].map((i) => [V[0][i], V[1][i], V[2][i]]) };
  }

  // ---- Flattening ------------------------------------------------------------
  function localFrames(P, F) {
    const nF = F.length / 3;
    const X = new Float64Array(nF * 6), A = new Float64Array(nF), Q = new Float64Array(nF), N = new Float64Array(nF * 3);
    for (let f = 0; f < nF; f++) {
      const a = 3 * F[3 * f], b = 3 * F[3 * f + 1], c = 3 * F[3 * f + 2];
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
      const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
      const cr = Math.hypot(cx, cy, cz);
      const lab = Math.max(Math.hypot(ux, uy, uz), 1e-12);
      X[6 * f + 2] = lab;
      X[6 * f + 4] = (ux * vx + uy * vy + uz * vz) / lab;
      X[6 * f + 5] = cr / lab;
      A[f] = cr / 2;
      const wx = P[c] - P[b], wy = P[c + 1] - P[b + 1], wz = P[c + 2] - P[b + 2];
      const s2 = lab * lab + (wx * wx + wy * wy + wz * wz) + (vx * vx + vy * vy + vz * vz);
      Q[f] = s2 > 0 ? (4 * Math.sqrt(3) * A[f]) / s2 : 0;
      if (cr > 0) { N[3 * f] = cx / cr; N[3 * f + 1] = cy / cr; N[3 * f + 2] = cz / cr; }
    }
    return { X, A, Q, N };
  }

  function signedArea2(uv, F, f) {
    const a = 2 * F[3 * f], b = 2 * F[3 * f + 1], c = 2 * F[3 * f + 2];
    return ((uv[b] - uv[a]) * (uv[c + 1] - uv[a + 1]) - (uv[b + 1] - uv[a + 1]) * (uv[c] - uv[a])) / 2;
  }

  function projectInit(P, F, fr) {
    const nV = P.length / 3, nF = F.length / 3;
    let nx = 0, ny = 0, nz = 0, sumA = 0;
    for (let f = 0; f < nF; f++) {
      nx += fr.N[3 * f] * fr.A[f]; ny += fr.N[3 * f + 1] * fr.A[f]; nz += fr.N[3 * f + 2] * fr.A[f];
      sumA += fr.A[f];
    }
    let cx = 0, cy = 0, cz = 0;
    for (let v = 0; v < nV; v++) { cx += P[3 * v]; cy += P[3 * v + 1]; cz += P[3 * v + 2]; }
    cx /= nV; cy /= nV; cz /= nV;
    const C = [0, 0, 0, 0, 0, 0];
    for (let v = 0; v < nV; v++) {
      const x = P[3 * v] - cx, y = P[3 * v + 1] - cy, z = P[3 * v + 2] - cz;
      C[0] += x * x; C[1] += x * y; C[2] += x * z; C[3] += y * y; C[4] += y * z; C[5] += z * z;
    }
    const eig = eigSym3(C);
    const order = [0, 1, 2].sort((i, j) => eig.values[i] - eig.values[j]);
    let n = [nx, ny, nz];
    const nl = Math.hypot(nx, ny, nz);
    if (nl < 0.3 * sumA) {
      const s = eig.vectors[order[0]];
      const sg = (s[0] * nx + s[1] * ny + s[2] * nz) < 0 ? -1 : 1;
      n = [s[0] * sg, s[1] * sg, s[2] * sg];
    } else n = [nx / nl, ny / nl, nz / nl];
    let e1 = eig.vectors[order[2]];
    const d = e1[0] * n[0] + e1[1] * n[1] + e1[2] * n[2];
    e1 = [e1[0] - d * n[0], e1[1] - d * n[1], e1[2] - d * n[2]];
    let l1 = Math.hypot(e1[0], e1[1], e1[2]);
    if (l1 < 1e-9) {
      e1 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
      const d2 = e1[0] * n[0] + e1[1] * n[1] + e1[2] * n[2];
      e1 = [e1[0] - d2 * n[0], e1[1] - d2 * n[1], e1[2] - d2 * n[2]];
      l1 = Math.hypot(e1[0], e1[1], e1[2]);
    }
    e1 = [e1[0] / l1, e1[1] / l1, e1[2] / l1];
    const e2 = [n[1] * e1[2] - n[2] * e1[1], n[2] * e1[0] - n[0] * e1[2], n[0] * e1[1] - n[1] * e1[0]];
    const uv = new Float64Array(2 * nV);
    for (let v = 0; v < nV; v++) {
      const x = P[3 * v] - cx, y = P[3 * v + 1] - cy, z = P[3 * v + 2] - cz;
      uv[2 * v] = x * e1[0] + y * e1[1] + z * e1[2];
      uv[2 * v + 1] = x * e2[0] + y * e2[1] + z * e2[2];
    }
    let flipA = 0, area2 = 0;
    for (let f = 0; f < nF; f++) {
      const s = signedArea2(uv, F, f);
      area2 += s;
      if (s < 0) flipA += fr.A[f];
    }
    return { uv, flipFrac: sumA > 0 ? flipA / sumA : 0, areaRatio: sumA > 0 ? area2 / sumA : 1 };
  }

  async function lscm(P, F, fr, init, tick, report) {
    const nV = P.length / 3, nF = F.length / 3;
    const adj = buildAdjacency(nV, F);
    const nnz = adj.col.length;
    const val = new Float64Array(4 * nnz);
    const { X, A, Q } = fr;
    const g = new Float64Array(6);
    for (let f = 0; f < nF; f++) {
      if (!(A[f] > 1e-12)) continue;
      const W = A[f] * Math.min(1, Q[f] / 0.1);
      if (!(W > 0)) continue;
      const x1 = X[6 * f + 2], x2 = X[6 * f + 4], y2 = X[6 * f + 5];
      const inv = 1 / (2 * A[f]);
      g[0] = -y2 * inv; g[1] = (x2 - x1) * inv;
      g[2] = y2 * inv; g[3] = -x2 * inv;
      g[4] = 0; g[5] = x1 * inv;
      for (let k = 0; k < 3; k++) {
        const ak = g[2 * k], bk = g[2 * k + 1];
        for (let l = 0; l < 3; l++) {
          const al = g[2 * l], bl = g[2 * l + 1];
          const s = W * (ak * al + bk * bl), t = W * (bk * al - ak * bl);
          const p = 4 * adj.fIdx[9 * f + 3 * k + l];
          val[p] += s; val[p + 1] += t; val[p + 2] -= t; val[p + 3] += s;
        }
      }
    }
    const { rowPtr, col } = adj;
    const matvec = (x, y) => {
      for (let i = 0; i < nV; i++) {
        let s0 = 0, s1 = 0;
        for (let p = rowPtr[i]; p < rowPtr[i + 1]; p++) {
          const j = col[p], xj0 = x[2 * j], xj1 = x[2 * j + 1], q = 4 * p;
          s0 += val[q] * xj0 + val[q + 1] * xj1;
          s1 += val[q + 2] * xj0 + val[q + 3] * xj1;
        }
        y[2 * i] = s0; y[2 * i + 1] = s1;
      }
    };
    const diagInv = new Float64Array(2 * nV);
    for (let i = 0; i < nV; i++) {
      let p = rowPtr[i]; while (col[p] !== i) p++;
      diagInv[2 * i] = val[4 * p] > 0 ? 1 / val[4 * p] : 1;
      diagInv[2 * i + 1] = val[4 * p + 3] > 0 ? 1 / val[4 * p + 3] : 1;
    }
    // pins: farthest from centroid, then farthest from that
    let cx = 0, cy = 0, cz = 0;
    for (let v = 0; v < nV; v++) { cx += P[3 * v]; cy += P[3 * v + 1]; cz += P[3 * v + 2]; }
    cx /= nV; cy /= nV; cz /= nV;
    let p1 = 0, best = -1;
    for (let v = 0; v < nV; v++) {
      const d = (P[3 * v] - cx) ** 2 + (P[3 * v + 1] - cy) ** 2 + (P[3 * v + 2] - cz) ** 2;
      if (d > best) { best = d; p1 = v; }
    }
    let p2 = p1; best = -1;
    for (let v = 0; v < nV; v++) {
      const d = (P[3 * v] - P[3 * p1]) ** 2 + (P[3 * v + 1] - P[3 * p1 + 1]) ** 2 + (P[3 * v + 2] - P[3 * p1 + 2]) ** 2;
      if (d > best) { best = d; p2 = v; }
    }
    const dist = Math.sqrt(best);
    // warm start: similarity map of the projection taking p1 -> (0,0), p2 -> (dist,0)
    const x = new Float64Array(2 * nV);
    const ax = init[2 * p1], ay = init[2 * p1 + 1];
    const bx = init[2 * p2] - ax, by = init[2 * p2 + 1] - ay;
    const bl2 = bx * bx + by * by;
    if (bl2 > 1e-18) {
      const c = (dist * bx) / bl2, s = (-dist * by) / bl2;
      for (let v = 0; v < nV; v++) {
        const ux = init[2 * v] - ax, uy = init[2 * v + 1] - ay;
        x[2 * v] = c * ux - s * uy; x[2 * v + 1] = s * ux + c * uy;
      }
    } else x.set(init);
    x[2 * p1] = 0; x[2 * p1 + 1] = 0; x[2 * p2] = dist; x[2 * p2 + 1] = 0;
    const fixed = new Uint8Array(2 * nV);
    fixed[2 * p1] = fixed[2 * p1 + 1] = fixed[2 * p2] = fixed[2 * p2 + 1] = 1;
    const zero = new Float64Array(2 * nV);
    report('LSCM');
    // scalar dof-level CSR for the direct solver (tiny diagonal shift keeps it SPD)
    let avgD = 0;
    for (let i = 0; i < 2 * nV; i++) avgD += 1 / diagInv[i];
    const eps = (avgD / (2 * nV)) * 1e-10;
    const rp2 = new Int32Array(2 * nV + 1);
    for (let i = 0; i < nV; i++) { const c = 2 * (rowPtr[i + 1] - rowPtr[i]); rp2[2 * i + 1] = rp2[2 * i] + c; rp2[2 * i + 2] = rp2[2 * i + 1] + c; }
    const c2 = new Int32Array(rp2[2 * nV]), v2 = new Float64Array(rp2[2 * nV]);
    for (let i = 0; i < nV; i++) {
      let q0 = rp2[2 * i], q1 = rp2[2 * i + 1];
      for (let p = rowPtr[i]; p < rowPtr[i + 1]; p++) {
        const j = col[p], b = 4 * p;
        c2[q0] = 2 * j; v2[q0++] = val[b] + (j === i ? eps : 0);
        c2[q0] = 2 * j + 1; v2[q0++] = val[b + 1];
        c2[q1] = 2 * j; v2[q1++] = val[b + 2];
        c2[q1] = 2 * j + 1; v2[q1++] = val[b + 3] + (j === i ? eps : 0);
      }
    }
    const direct = await directSolver(2 * nV, rp2, c2, v2, fixed, tick);
    if (direct) direct.solve(zero, x);
    else await pcg(matvec, diagInv, zero, x, fixed, 6000, 1e-8, workspace(2 * nV), tick);
    return x;
  }

  function normalizeOrientationAndScale(uv, F, A3) {
    const nF = F.length / 3, nV = uv.length / 2;
    let a2 = 0;
    for (let f = 0; f < nF; f++) a2 += signedArea2(uv, F, f);
    if (a2 < 0) { for (let v = 0; v < nV; v++) uv[2 * v + 1] = -uv[2 * v + 1]; a2 = -a2; }
    if (a2 > 0 && A3 > 0) {
      const s = Math.sqrt(A3 / a2);
      for (let i = 0; i < uv.length; i++) uv[i] *= s;
    }
  }

  async function arap(P, F, fr, uv, iters, tick, report) {
    const nV = P.length / 3, nF = F.length / 3;
    const { X } = fr;
    const W = new Float64Array(3 * nF);
    for (let f = 0; f < nF; f++) {
      for (let k = 0; k < 3; k++) {
        const i = (k + 1) % 3, j = (k + 2) % 3;
        const ux = X[6 * f + 2 * i] - X[6 * f + 2 * k], uy = X[6 * f + 2 * i + 1] - X[6 * f + 2 * k + 1];
        const vx = X[6 * f + 2 * j] - X[6 * f + 2 * k], vy = X[6 * f + 2 * j + 1] - X[6 * f + 2 * k + 1];
        const cr = Math.abs(ux * vy - uy * vx), dt = ux * vx + uy * vy;
        let cot = cr > 1e-300 ? dt / cr : (dt > 0 ? 1e9 : -1e9);
        if (!isFinite(cot)) cot = dt > 0 ? 50 : 0.01;
        W[3 * f + k] = Math.min(50, Math.max(0.01, cot));
      }
    }
    const adj = buildAdjacency(nV, F);
    const { rowPtr, col, fIdx } = adj;
    const L = new Float64Array(col.length);
    for (let f = 0; f < nF; f++) {
      for (let k = 0; k < 3; k++) {
        const w = W[3 * f + k];
        const i = (k + 1) % 3, j = (k + 2) % 3;
        L[fIdx[9 * f + 3 * i + i]] += w; L[fIdx[9 * f + 3 * j + j]] += w;
        L[fIdx[9 * f + 3 * i + j]] -= w; L[fIdx[9 * f + 3 * j + i]] -= w;
      }
    }
    const matvec = (x, y) => {
      for (let i = 0; i < nV; i++) {
        let s = 0;
        for (let p = rowPtr[i]; p < rowPtr[i + 1]; p++) s += L[p] * x[col[p]];
        y[i] = s;
      }
    };
    const diagInv = new Float64Array(nV);
    for (let i = 0; i < nV; i++) {
      let p = rowPtr[i]; while (col[p] !== i) p++;
      diagInv[i] = L[p] > 0 ? 1 / L[p] : 1;
    }
    const fixed = new Uint8Array(nV); fixed[0] = 1;
    const u = new Float64Array(nV), v = new Float64Array(nV), bu = new Float64Array(nV), bv = new Float64Array(nV);
    for (let i = 0; i < nV; i++) { u[i] = uv[2 * i]; v[i] = uv[2 * i + 1]; }
    const ws = workspace(nV);
    report(-1, iters);
    const direct = await directSolver(nV, rowPtr, col, L, fixed, tick);
    let Eprev = Infinity;
    for (let it = 0; it < iters; it++) {
      bu.fill(0); bv.fill(0);
      let E = 0;
      for (let f = 0; f < nF; f++) {
        let s00 = 0, s01 = 0, s10 = 0, s11 = 0;
        for (let k = 0; k < 3; k++) {
          const i = (k + 1) % 3, j = (k + 2) % 3;
          const vi = F[3 * f + i], vj = F[3 * f + j], w = W[3 * f + k];
          const dux = u[vi] - u[vj], duy = v[vi] - v[vj];
          const dxx = X[6 * f + 2 * i] - X[6 * f + 2 * j], dxy = X[6 * f + 2 * i + 1] - X[6 * f + 2 * j + 1];
          s00 += w * dux * dxx; s01 += w * dux * dxy; s10 += w * duy * dxx; s11 += w * duy * dxy;
        }
        const th = Math.atan2(s10 - s01, s00 + s11);
        const c = Math.cos(th), s = Math.sin(th);
        for (let k = 0; k < 3; k++) {
          const i = (k + 1) % 3, j = (k + 2) % 3;
          const vi = F[3 * f + i], vj = F[3 * f + j], w = W[3 * f + k];
          const dxx = X[6 * f + 2 * i] - X[6 * f + 2 * j], dxy = X[6 * f + 2 * i + 1] - X[6 * f + 2 * j + 1];
          const rx = c * dxx - s * dxy, ry = s * dxx + c * dxy;
          const ex = u[vi] - u[vj] - rx, ey = v[vi] - v[vj] - ry;
          E += w * (ex * ex + ey * ey);
          bu[vi] += w * rx; bv[vi] += w * ry; bu[vj] -= w * rx; bv[vj] -= w * ry;
        }
      }
      report(it, iters);
      if (it >= 5 && Eprev - E <= 1e-6 * Eprev) break;
      if (E < 1e-18) break;
      Eprev = E;
      if (direct) { direct.solve(bu, u); direct.solve(bv, v); }
      else {
        await pcg(matvec, diagInv, bu, u, fixed, 400, 1e-7, ws, tick);
        await pcg(matvec, diagInv, bv, v, fixed, 400, 1e-7, ws, tick);
      }
      await tick();
    }
    for (let i = 0; i < nV; i++) { uv[2 * i] = u[i]; uv[2 * i + 1] = v[i]; }
  }

  function distortion(uv, F, fr) {
    const nF = F.length / 3;
    const D = new Float32Array(nF);
    let flipped = 0, sumA = 0, sumD = 0, maxD = 0, maxAll = 0, area2 = 0;
    const { X, A, Q } = fr;
    for (let f = 0; f < nF; f++) {
      const x1 = X[6 * f + 2], x2 = X[6 * f + 4], y2 = X[6 * f + 5];
      const det0 = x1 * y2;
      const a0 = 2 * F[3 * f], a1 = 2 * F[3 * f + 1], a2 = 2 * F[3 * f + 2];
      const f1x = uv[a1] - uv[a0], f1y = uv[a1 + 1] - uv[a0 + 1];
      const f2x = uv[a2] - uv[a0], f2y = uv[a2 + 1] - uv[a0 + 1];
      const sa = (f1x * f2y - f1y * f2x) / 2;
      area2 += sa;
      if (sa < 0 && A[f] > 1e-9) flipped++;
      if (!(det0 > 1e-12)) { D[f] = 0; continue; }
      const a = (f1x * y2) / det0, b = (-f1x * x2 + f2x * x1) / det0;
      const c = (f1y * y2) / det0, d = (-f1y * x2 + f2y * x1) / det0;
      const E = (a + d) / 2, Fq = (a - d) / 2, G = (c + b) / 2, H = (c - b) / 2;
      const Qs = Math.hypot(E, H), Rs = Math.hypot(Fq, G);
      const s1 = Qs + Rs, s2 = Math.abs(Qs - Rs);
      const dist = Math.max(s1 - 1, 1 - s2);
      D[f] = isFinite(dist) ? dist : 0;
      sumA += A[f]; sumD += A[f] * D[f];
      if (Q[f] >= 0.05 && D[f] > maxD) maxD = D[f];
      if (D[f] > maxAll) maxAll = D[f];
    }
    // "max" shown to the user = 99th percentile by area (a few tiny fillet
    // triangles should not dominate); the true peak is kept separately.
    const idx = Array.from({ length: nF }, (_, i) => i).filter((i) => A[i] > 0).sort((a, b) => D[b] - D[a]);
    let acc = 0, p99 = 0;
    for (const i of idx) { acc += A[i]; p99 = D[i]; if (acc >= 0.01 * sumA) break; }
    return { D, flipped, mean: sumA > 0 ? sumD / sumA : 0, max: p99, peak: maxD > 0 ? maxD : maxAll, area2 };
  }

  function loopArea(uv, L) {
    let s = 0;
    for (let i = 0; i < L.length; i++) {
      const a = 2 * L[i], b = 2 * L[(i + 1) % L.length];
      s += uv[a] * uv[b + 1] - uv[b] * uv[a + 1];
    }
    return s / 2;
  }

  function alignToView(uv, P, m) {
    const nV = uv.length / 2;
    let ucx = 0, ucy = 0, qcx = 0, qcy = 0;
    const qx = new Float64Array(nV), qy = new Float64Array(nV);
    for (let v = 0; v < nV; v++) {
      const x = P[3 * v], y = P[3 * v + 1], z = P[3 * v + 2];
      qx[v] = m[0] * x + m[4] * y + m[8] * z + m[12];
      qy[v] = m[1] * x + m[5] * y + m[9] * z + m[13];
      ucx += uv[2 * v]; ucy += uv[2 * v + 1]; qcx += qx[v]; qcy += qy[v];
    }
    ucx /= nV; ucy /= nV; qcx /= nV; qcy /= nV;
    let sc = 0, ss = 0;
    for (let v = 0; v < nV; v++) {
      const ux = uv[2 * v] - ucx, uy = uv[2 * v + 1] - ucy, px = qx[v] - qcx, py = qy[v] - qcy;
      sc += ux * px + uy * py;
      ss += ux * py - uy * px;
    }
    const th = Math.atan2(ss, sc), c = Math.cos(th), s = Math.sin(th);
    for (let v = 0; v < nV; v++) {
      const ux = uv[2 * v] - ucx, uy = uv[2 * v + 1] - ucy;
      uv[2 * v] = c * ux - s * uy;
      uv[2 * v + 1] = s * ux + c * uy;
    }
  }

  const fullIters = (q) => (q === 'fast' ? 15 : q === 'high' ? 200 : 60);

  // Initial layout + `iters` ARAP iterations. Planar charts are exact after
  // projection and skip ARAP entirely.
  async function flattenMesh(mesh, opts, tick, report, iters) {
    const { P, F } = mesh;
    const fr = localFrames(P, F);
    let A3 = 0;
    for (let f = 0; f < fr.A.length; f++) A3 += fr.A[f];
    const proj = projectInit(P, F, fr);
    let uv;
    let method;
    if (proj.flipFrac === 0 && proj.areaRatio > 0.99995) {
      uv = proj.uv;
      normalizeOrientationAndScale(uv, F, A3);
      return { uv, fr, A3, method: 'planar' };
    }
    if (opts.init !== 'lscm' && (opts.init === 'projection' || (proj.flipFrac < 0.01 && proj.areaRatio > 0.85))) { uv = proj.uv; method = 'projection'; }
    else { uv = await lscm(P, F, fr, proj.uv, tick, (t) => report(t)); method = 'lscm'; }
    normalizeOrientationAndScale(uv, F, A3);
    await arap(P, F, fr, uv, iters, tick, (i, n) => report(i < 0 ? msg(opts.lang, 'factorizing') : `ARAP ${i + 1}/${n}`));
    return { uv, fr, A3, method };
  }

  // Split a too-distorted chart in two by face direction (2-means on normals),
  // then fix connectivity: each cluster's connected parts become charts and
  // parts smaller than minArea are merged into the neighbour they share the
  // most edges with. Returns [] when no useful split exists.
  function splitChart(mesh, fr, minArea) {
    const n = mesh.n, N = fr.N, A = fr.A, Q = fr.Q, ip = mesh.ip;
    let mx = 0, my = 0, mz = 0;
    for (let i = 0; i < n; i++) { mx += N[3 * i] * A[i]; my += N[3 * i + 1] * A[i]; mz += N[3 * i + 2] * A[i]; }
    const ml = Math.hypot(mx, my, mz) || 1;
    mx /= ml; my /= ml; mz /= ml;
    const farthest = (cx, cy, cz) => {
      let s = -1, best = 2;
      for (let i = 0; i < n; i++) {
        if (Q[i] < 0.1 || A[i] <= 0) continue;
        const d = N[3 * i] * cx + N[3 * i + 1] * cy + N[3 * i + 2] * cz;
        if (d < best) { best = d; s = i; }
      }
      return s;
    };
    const s1 = farthest(mx, my, mz);
    if (s1 < 0) return [];
    const c = [[N[3 * s1], N[3 * s1 + 1], N[3 * s1 + 2]], [0, 0, 0]];
    const s2 = farthest(c[0][0], c[0][1], c[0][2]);
    if (s2 < 0) return [];
    c[1] = [N[3 * s2], N[3 * s2 + 1], N[3 * s2 + 2]];
    if (c[0][0] * c[1][0] + c[0][1] * c[1][1] + c[0][2] * c[1][2] > Math.cos((3 * PI) / 180)) return [];
    // Flat patches (faces within 1° of the patch's first face) are labelled as
    // one: a disc whose normal is equally far from both centres would otherwise
    // be split by rounding noise (e.g. a tube's end cap cut into two halves).
    const PN = Float64Array.from(N);
    {
      const seen = new Uint8Array(n), cosFlat = Math.cos(PI / 180), members = [];
      for (let s = 0; s < n; s++) {
        if (seen[s] || Q[s] < 0.1) continue;
        const sx = N[3 * s], sy = N[3 * s + 1], sz = N[3 * s + 2];
        members.length = 0;
        seen[s] = 1; members.push(s);
        let ax = 0, ay = 0, az = 0;
        for (let h = 0; h < members.length; h++) {
          const i = members[h];
          ax += N[3 * i] * A[i]; ay += N[3 * i + 1] * A[i]; az += N[3 * i + 2] * A[i];
          for (let k = 0; k < 3; k++) {
            const j = ip[3 * i + k];
            if (j < 0 || seen[j] || Q[j] < 0.1) continue;
            if (N[3 * j] * sx + N[3 * j + 1] * sy + N[3 * j + 2] * sz < cosFlat) continue;
            seen[j] = 1; members.push(j);
          }
        }
        if (members.length < 2) continue;
        const al = Math.hypot(ax, ay, az) || 1;
        for (const i of members) { PN[3 * i] = ax / al; PN[3 * i + 1] = ay / al; PN[3 * i + 2] = az / al; }
      }
    }
    const label = new Uint8Array(n);
    for (let it = 0; it < 12; it++) {
      const acc = [[0, 0, 0], [0, 0, 0]];
      for (let i = 0; i < n; i++) {
        const d0 = PN[3 * i] * c[0][0] + PN[3 * i + 1] * c[0][1] + PN[3 * i + 2] * c[0][2];
        const d1 = PN[3 * i] * c[1][0] + PN[3 * i + 1] * c[1][1] + PN[3 * i + 2] * c[1][2];
        const l = d0 >= d1 ? 0 : 1;
        label[i] = l;
        if (Q[i] >= 0.1) { acc[l][0] += N[3 * i] * A[i]; acc[l][1] += N[3 * i + 1] * A[i]; acc[l][2] += N[3 * i + 2] * A[i]; }
      }
      for (let l = 0; l < 2; l++) {
        const len = Math.hypot(acc[l][0], acc[l][1], acc[l][2]);
        if (len > 0) c[l] = [acc[l][0] / len, acc[l][1] / len, acc[l][2] / len];
      }
    }
    return groupParts(mesh, fr, minArea, (i, j) => label[i] === label[j]);
  }

  // Split a closed shape along its sharp edges (dihedral ≥ 30°), so a tube
  // comes apart into its end caps and one wall instead of normal clusters.
  function splitBySharp(mesh, fr, minArea) {
    const N = fr.N, Q = fr.Q, cosSharp = Math.cos((30 * PI) / 180);
    return groupParts(mesh, fr, minArea, (i, j) => Q[i] < 0.1 || Q[j] < 0.1
      || N[3 * i] * N[3 * j] + N[3 * i + 1] * N[3 * j + 1] + N[3 * i + 2] * N[3 * j + 2] >= cosSharp);
  }

  // Connected parts of faces linked by `joins(i, j)`; parts that are too small
  // or too thin are merged into the neighbour they share the most edge with.
  function groupParts(mesh, fr, minArea, joins) {
    const n = mesh.n, A = fr.A, ip = mesh.ip;
    const comp = new Int32Array(n).fill(-1);
    const area = [];
    const queue = new Int32Array(n);
    for (let s = 0; s < n; s++) {
      if (comp[s] >= 0) continue;
      const id = area.length;
      let qh = 0, qt = 0, a = 0;
      comp[s] = id; queue[qt++] = s;
      while (qh < qt) {
        const i = queue[qh++];
        a += A[i];
        for (let k = 0; k < 3; k++) {
          const j = ip[3 * i + k];
          if (j >= 0 && comp[j] < 0 && joins(i, j)) { comp[j] = id; queue[qt++] = j; }
        }
      }
      area.push(a);
    }
    const C = area.length;
    if (C < 2) return [];
    // shared boundary length between parts, and each part's perimeter
    const P = mesh.P, F = mesh.F;
    const elen = (i, k) => {
      const a = 3 * F[3 * i + k], b = 3 * F[3 * i + (k + 1) % 3];
      return Math.hypot(P[a] - P[b], P[a + 1] - P[b + 1], P[a + 2] - P[b + 2]);
    };
    const adj = Array.from({ length: C }, () => new Map());
    const perim = new Float64Array(C);
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 3; k++) {
        const j = ip[3 * i + k];
        if (j >= 0 && comp[j] === comp[i]) continue;
        const L = elen(i, k);
        perim[comp[i]] += L;
        if (j < 0) continue;
        const m = adj[comp[i]];
        m.set(comp[j], (m.get(comp[j]) || 0) + L);
      }
    }
    // merge parts that are too small or too thin (mean width = 2·area / perimeter)
    const par = ufMake(C);
    const rootArea = area.slice(), rootPerim = Array.from(perim);
    const tooSmall = (r) => rootArea[r] < minArea || (2 * rootArea[r]) / Math.max(1e-9, rootPerim[r]) < 2.0;
    const order = Array.from({ length: C }, (_, i) => i).sort((a, b) => area[a] - area[b]);
    for (const s of order) {
      const rs = ufFind(par, s);
      if (!tooSmall(rs)) continue;
      const score = new Map();
      for (const [nb, len] of adj[s]) {
        const r = ufFind(par, nb);
        if (r !== rs) score.set(r, (score.get(r) || 0) + len);
      }
      let bestR = -1, bestL = -1;
      for (const [r, len] of score) if (len > bestL) { bestL = len; bestR = r; }
      if (bestR < 0) continue;
      const a = rootArea[rs] + rootArea[bestR];
      const p = rootPerim[rs] + rootPerim[bestR] - 2 * bestL;
      ufUnion(par, rs, bestR);
      const nr = ufFind(par, rs);
      rootArea[nr] = a; rootPerim[nr] = Math.max(p, 0);
    }
    const groups = new Map();
    for (let i = 0; i < n; i++) {
      const r = ufFind(par, comp[i]);
      let g = groups.get(r);
      if (!g) { g = { faces: [], area: 0 }; groups.set(r, g); }
      g.faces.push(mesh.faces[i]);
      g.area += A[i];
    }
    if (groups.size < 2) return [];
    return [...groups.values()].map((g) => ({ faces: Int32Array.from(g.faces), area: g.area }));
  }

  // Outline loops: outer first (CCW), holes CW. Slits and specks left by a few
  // unpainted triangles are dropped (they are not real holes).
  function orderLoops(uv, rawLoops) {
    const loops = rawLoops.map((L) => Uint32Array.from(L));
    if (!loops.length) return loops;
    const areas = loops.map((L) => loopArea(uv, L));
    let oi = 0;
    for (let i = 1; i < loops.length; i++) if (Math.abs(areas[i]) > Math.abs(areas[oi])) oi = i;
    const outer = loops[oi];
    if (areas[oi] < 0) outer.reverse();
    const holes = [];
    loops.forEach((L, i) => {
      if (i === oi) return;
      const a = Math.abs(areas[i]);
      let per = 0;
      for (let k = 0; k < L.length; k++) {
        const p = 2 * L[k], q = 2 * L[(k + 1) % L.length];
        per += Math.hypot(uv[p] - uv[q], uv[p + 1] - uv[q + 1]);
      }
      if (a < 0.3 || (per > 0 && (2 * a) / per < 0.15)) return;
      if (areas[i] > 0) L.reverse();
      holes.push(L);
    });
    return [outer, ...holes];
  }

  // ---- merging flat pieces --------------------------------------------------
  // A flat face built from several separate meshes (a model exported as bodies
  // that overlap or only touch, without welded edges) flattens as one piece per
  // mesh. Pieces of one decal group that lie on the same plane and touch or
  // overlap are joined: their triangles are kept as they are (the 3D view still
  // maps every face) and the cut outline is the 2D union of their outlines.
  const clipLib = () => (typeof globalThis !== 'undefined' && globalThis.ClipperLib) || (typeof window !== 'undefined' && window.ClipperLib) || null;
  const CLIP_S = 1000; // Clipper works in integers: 1 unit = 0.001 mm

  // Union of index rings over 2D points `uv` (outer rings positive, holes
  // negative). Gaps narrower than 2*eps are closed. Returns a list of shapes
  // [{ outer: [[x, y]...], holes: [...] }] or null without Clipper.
  function unionRings(uv, rings, eps = 0.05) {
    const C = clipLib();
    if (!C || !rings.length) return null;
    const S = CLIP_S;
    const paths = rings.map((L) => Array.from(L, (v) => ({ X: Math.round(uv[2 * v] * S), Y: Math.round(uv[2 * v + 1] * S) })));
    const c = new C.Clipper();
    c.AddPaths(paths, C.PolyType.ptSubject, true);
    let sol = new C.Paths();
    c.Execute(C.ClipType.ctUnion, sol, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
    const off = (src, d) => {
      const co = new C.ClipperOffset(3, 0.25 * S * 0.01);
      co.AddPaths(src, C.JoinType.jtMiter, C.EndType.etClosedPolygon);
      return co;
    };
    let grown = new C.Paths();
    off(sol, 0).Execute(grown, eps * S);
    const tree = new C.PolyTree();
    off(grown, 0).Execute(tree, -eps * S);
    const shapes = [];
    const pts = (p) => p.map((q) => [q.X / S, q.Y / S]);
    const walk = (node) => {
      for (const o of node.Childs()) {
        const holes = [];
        for (const h of o.Childs()) { holes.push(pts(h.Contour())); walk(h); }
        shapes.push({ outer: pts(o.Contour()), holes });
      }
    };
    walk(tree);
    return shapes;
  }

  const ringArea = (R) => { let s = 0; for (let i = 0; i < R.length; i++) { const p = R[i], q = R[(i + 1) % R.length]; s += p[0] * q[1] - q[0] * p[1]; } return s / 2; };

  // Turn a union shape into index loops: points that sit on an original ring
  // vertex reuse it, the others are new vertices (uv, 3D from toP).
  // Returns { uv, P, loops } with the new vertices appended, or null.
  function shapeToLoops(shape, uv, P, ringVerts, toP) {
    const cell = 0.2, grid = new Map(), key = (x, y) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
    for (const v of ringVerts) {
      const k = key(uv[2 * v], uv[2 * v + 1]);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(v);
    }
    const nearest = (x, y) => {
      let best = -1, bd = 0.004 * 0.004;
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        for (const v of grid.get(`${cx + i},${cy + j}`) || []) {
          const d = (uv[2 * v] - x) ** 2 + (uv[2 * v + 1] - y) ** 2;
          if (d < bd) { bd = d; best = v; }
        }
      }
      return best;
    };
    const nv0 = uv.length / 2, exU = [], exP = [];
    const toIdx = (R) => {
      const L = [];
      for (const [x, y] of R) {
        let v = nearest(x, y);
        if (v < 0) { v = nv0 + exU.length / 2; exU.push(x, y); exP.push(...toP(x, y)); }
        if (L[L.length - 1] !== v && L[0] !== v) L.push(v);
      }
      return L;
    };
    if (ringArea(shape.outer) < 0) shape.outer.reverse();
    const outer = toIdx(shape.outer);
    if (outer.length < 3) return null;
    const holes = [];
    for (const h of shape.holes) {
      const a = Math.abs(ringArea(h));
      if (a < 0.3) continue;
      if (ringArea(h) > 0) h.reverse();
      const L = toIdx(h);
      if (L.length >= 3) holes.push(L);
    }
    const U = new Float64Array(uv.length + exU.length); U.set(uv); U.set(exU, uv.length);
    const Pn = new Float64Array(P.length + exP.length); Pn.set(P); Pn.set(exP, P.length);
    return { uv: U, P: Pn, loops: [Uint32Array.from(outer), ...holes.map((L) => Uint32Array.from(L))] };
  }

  // uv -> 3D map of a flat piece, taken from its largest triangle
  function flatMap(uv, P, F) {
    let best = -1, ba = 0;
    for (let i = 0; i < F.length / 3; i++) {
      const a = F[3 * i], b = F[3 * i + 1], c = F[3 * i + 2];
      const ar = Math.abs((uv[2 * b] - uv[2 * a]) * (uv[2 * c + 1] - uv[2 * a + 1]) - (uv[2 * c] - uv[2 * a]) * (uv[2 * b + 1] - uv[2 * a + 1]));
      if (ar > ba) { ba = ar; best = i; }
    }
    if (best < 0) return null;
    const a = F[3 * best], b = F[3 * best + 1], c = F[3 * best + 2];
    const ux = uv[2 * a], uy = uv[2 * a + 1];
    const b1 = uv[2 * b] - ux, b2 = uv[2 * b + 1] - uy, c1 = uv[2 * c] - ux, c2 = uv[2 * c + 1] - uy, det = b1 * c2 - b2 * c1;
    const A = [P[3 * a], P[3 * a + 1], P[3 * a + 2]];
    const E1 = [0, 1, 2].map((k) => P[3 * b + k] - A[k]), E2 = [0, 1, 2].map((k) => P[3 * c + k] - A[k]);
    return (x, y) => {
      const qx = x - ux, qy = y - uy, s = (qx * c2 - qy * c1) / det, t = (b1 * qy - b2 * qx) / det;
      return [A[0] + s * E1[0] + t * E2[0], A[1] + s * E1[1] + t * E2[1], A[2] + s * E1[2] + t * E2[2]];
    };
  }

  // The outline of a flat piece made of separate meshes: union of the boundary
  // loops of its triangles. Used for split-to-fit parts of a merged piece.
  function flatOutline(uv, P, F, rings) {
    const shapes = unionRings(uv, rings);
    if (!shapes || !shapes.length) return null;
    shapes.sort((a, b) => Math.abs(ringArea(b.outer)) - Math.abs(ringArea(a.outer)));
    const toP = flatMap(uv, P, F);
    if (!toP) return null;
    const rv = new Set();
    for (const L of rings) for (const v of L) rv.add(v);
    return shapeToLoops(shapes[0], uv, P, rv, toP);
  }

  // plane of a piece: area-weighted normal, offset, and whether it is flat
  function planeOf(p) {
    const { P, F } = p;
    const n = [0, 0, 0];
    for (let i = 0; i < F.length / 3; i++) {
      const a = 3 * F[3 * i], b = 3 * F[3 * i + 1], c = 3 * F[3 * i + 2];
      const u = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], w = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
      n[0] += u[1] * w[2] - u[2] * w[1]; n[1] += u[2] * w[0] - u[0] * w[2]; n[2] += u[0] * w[1] - u[1] * w[0];
    }
    const l = Math.hypot(n[0], n[1], n[2]);
    if (!l) return null;
    n[0] /= l; n[1] /= l; n[2] /= l;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < F.length; i++) {
      const v = 3 * F[i], d = n[0] * P[v] + n[1] * P[v + 1] + n[2] * P[v + 2];
      if (d < lo) lo = d; if (d > hi) hi = d;
    }
    if (hi - lo > 0.15 || !(p.stats.maxDistortion < 0.003)) return null;
    return { n, d: (lo + hi) / 2 };
  }

  function mergeFlat(pieces) {
    if (pieces.length < 2 || !clipLib()) return { pieces, merged: 0 };
    const pl = pieces.map(planeOf);
    // clusters of pieces on one plane (same group, same facing side)
    const par = pieces.map((_, i) => i), find = (i) => (par[i] === i ? i : (par[i] = find(par[i])));
    for (let i = 0; i < pieces.length; i++) {
      for (let j = i + 1; j < pieces.length; j++) {
        const a = pl[i], b = pl[j];
        if (!a || !b || pieces[i].group !== pieces[j].group) continue;
        if (a.n[0] * b.n[0] + a.n[1] * b.n[1] + a.n[2] * b.n[2] < Math.cos(Math.PI / 180)) continue;
        if (Math.abs(a.d - b.d) > 0.2) continue;
        par[find(j)] = find(i);
      }
    }
    const clusters = new Map();
    pieces.forEach((_, i) => { const r = find(i); if (!clusters.has(r)) clusters.set(r, []); clusters.get(r).push(i); });
    const out = [];
    let merged = 0;
    for (const members of clusters.values()) {
      if (members.length < 2) { out.push(pieces[members[0]]); continue; }
      // everything in the uv frame of the largest member
      members.sort((x, y) => pieces[y].stats.area3D - pieces[x].stats.area3D);
      const ref = pieces[members[0]];
      const toP = flatMap(ref.uv, ref.P, ref.F);
      if (!toP) { members.forEach((i) => out.push(pieces[i])); continue; }
      // 3D -> ref uv: invert toP on the plane (rigid, so least squares on 3 points is exact)
      const O = toP(0, 0), X = toP(1, 0), Y = toP(0, 1);
      const ex = [X[0] - O[0], X[1] - O[1], X[2] - O[2]], ey = [Y[0] - O[0], Y[1] - O[1], Y[2] - O[2]];
      const gxx = ex[0] * ex[0] + ex[1] * ex[1] + ex[2] * ex[2], gyy = ey[0] * ey[0] + ey[1] * ey[1] + ey[2] * ey[2], gxy = ex[0] * ey[0] + ex[1] * ey[1] + ex[2] * ey[2];
      const gd = gxx * gyy - gxy * gxy;
      const toUV = (x, y, z) => {
        const q = [x - O[0], y - O[1], z - O[2]];
        const px = q[0] * ex[0] + q[1] * ex[1] + q[2] * ex[2], py = q[0] * ey[0] + q[1] * ey[1] + q[2] * ey[2];
        return [(px * gyy - py * gxy) / gd, (py * gxx - px * gxy) / gd];
      };
      // every member in ref uv, with its own vertex offset
      const all = members.map((i) => pieces[i]);
      let nV = 0;
      const base = all.map((p) => { const b = nV; nV += p.uv.length / 2; return b; });
      const uv = new Float64Array(2 * nV), P = new Float64Array(3 * nV);
      all.forEach((p, k) => {
        const n = p.uv.length / 2;
        for (let v = 0; v < n; v++) {
          const w = base[k] + v;
          P[3 * w] = p.P[3 * v]; P[3 * w + 1] = p.P[3 * v + 1]; P[3 * w + 2] = p.P[3 * v + 2];
          const [u, t] = toUV(p.P[3 * v], p.P[3 * v + 1], p.P[3 * v + 2]);
          uv[2 * w] = u; uv[2 * w + 1] = t;
        }
      });
      const memberRings = all.map((p, k) => p.loops.map((L) => Array.from(L, (v) => v + base[k])));
      const shapes = unionRings(uv, memberRings.flat());
      if (!shapes || !shapes.length) { all.forEach((p) => out.push(p)); continue; }
      // which members fall in which union shape (by the middle of their largest triangle)
      const C = clipLib();
      const inShape = (s, x, y) => C.Clipper.PointInPolygon({ X: Math.round(x * CLIP_S), Y: Math.round(y * CLIP_S) }, s.outer.map(([a, b]) => ({ X: Math.round(a * CLIP_S), Y: Math.round(b * CLIP_S) }))) !== 0;
      const owner = all.map((p, k) => {
        let best = 0, ba = -1;
        for (let i = 0; i < p.F.length / 3; i++) {
          const [a, b, c] = [0, 1, 2].map((q) => p.F[3 * i + q] + base[k]);
          const ar = Math.abs((uv[2 * b] - uv[2 * a]) * (uv[2 * c + 1] - uv[2 * a + 1]) - (uv[2 * c] - uv[2 * a]) * (uv[2 * b + 1] - uv[2 * a + 1]));
          if (ar > ba) { ba = ar; best = i; }
        }
        const vs = [0, 1, 2].map((q) => p.F[3 * best + q] + base[k]);
        const x = (uv[2 * vs[0]] + uv[2 * vs[1]] + uv[2 * vs[2]]) / 3, y = (uv[2 * vs[0] + 1] + uv[2 * vs[1] + 1] + uv[2 * vs[2] + 1]) / 3;
        return shapes.findIndex((s) => inShape(s, x, y));
      });
      const done = new Set();
      shapes.forEach((s, si) => {
        const ks = all.map((_, k) => k).filter((k) => owner[k] === si);
        if (!ks.length) return;
        if (ks.length === 1) { out.push(all[ks[0]]); done.add(ks[0]); return; }
        // pack only the vertices of these members
        const ps = ks.map((k) => all[k]);
        let m = 0;
        const off = ps.map((p) => { const b = m; m += p.uv.length / 2; return b; });
        const U = new Float64Array(2 * m), Q = new Float64Array(3 * m);
        ks.forEach((k, j) => {
          const n = all[k].uv.length / 2;
          U.set(uv.subarray(2 * base[k], 2 * (base[k] + n)), 2 * off[j]);
          Q.set(P.subarray(3 * base[k], 3 * (base[k] + n)), 3 * off[j]);
        });
        const rv = new Set();
        ks.forEach((k, j) => { for (const L of all[k].loops) for (const v of L) rv.add(v + off[j]); });
        const res = shapeToLoops(s, U, Q, rv, toP);
        if (!res) { ks.forEach((k) => { out.push(all[k]); done.add(k); }); return; }
        const nF = ps.reduce((t, p) => t + p.F.length / 3, 0);
        const F = new Uint32Array(3 * nF), faceIds = new Int32Array(nF), D = new Float32Array(nF);
        const folds = [], cuts = [];
        let fo = 0;
        ps.forEach((p, j) => {
          const n = p.F.length / 3;
          for (let i = 0; i < 3 * n; i++) F[3 * fo + i] = p.F[i] + off[j];
          faceIds.set(p.faceIds, fo);
          if (p.faceDistortion) D.set(p.faceDistortion, fo);
          for (const e of p.folds || []) folds.push({ ...e, a: e.a + off[j], b: e.b + off[j] });
          for (const e of p.cuts || []) cuts.push({ ...e, a: e.a + off[j], b: e.b + off[j] });
          fo += n;
        });
        let area = Math.abs(ringArea(s.outer));
        for (const h of s.holes) area -= Math.abs(ringArea(h));
        const st = ps.map((p) => p.stats);
        out.push({
          group: ref.group, faceIds, nV: res.uv.length / 2, uv: res.uv, P: res.P, F, loops: res.loops, folds, cuts, faceDistortion: D,
          merged: ps.length,
          stats: {
            area3D: area, area2D: area,
            meanDistortion: st.reduce((t, x) => t + x.meanDistortion * x.area3D, 0) / (st.reduce((t, x) => t + x.area3D, 0) || 1),
            maxDistortion: Math.max(...st.map((x) => x.maxDistortion)), peakDistortion: Math.max(...st.map((x) => x.peakDistortion || 0)),
            flipped: st.reduce((t, x) => t + (x.flipped || 0), 0), seams: st.reduce((t, x) => t + (x.seams || 0), 0),
            nFaces: nF, method: 'planar',
          },
        });
        merged += ps.length - 1;
        ks.forEach((k) => done.add(k));
      });
      all.forEach((p, k) => { if (!done.has(k)) out.push(p); });
    }
    return { pieces: out, merged };
  }

  // opts.islands (default true): split each painted area into pieces whose
  // stretch stays under opts.islandTolerance (default 1.5%), like a UV unwrap.
  async function generate(model, faceGroup, opts = {}, onProgress = () => {}, isCancelled = () => false) {
    const tick = makeTicker(isCancelled);
    const warnings = [];
    const faceLocal = new Int32Array(model.nF).fill(-1);
    const cutFlag = new Uint8Array(model.nE);
    // user-marked seams (Cut tool) are cut before anything else
    const userSeams = opts.seams && opts.seams.length === model.nE ? opts.seams : null;
    if (userSeams) for (let e = 0; e < model.nE; e++) if (userSeams[e]) cutFlag[e] = 1;
    const comps = [];
    let tiny = 0;
    onProgress(msg(opts.lang, 'analysing'), 0);
    for (let g = 1; g <= 8; g++) {
      const list = [];
      for (let f = 0; f < model.nF; f++) if (faceGroup[f] === g) list.push(f);
      if (!list.length) continue;
      const prep = prepare(model, Int32Array.from(list), faceLocal, cutFlag);
      const cs = components(prep).map((faces) => {
        let a = 0; for (const f of faces) a += model.fA[f];
        return { group: g, faces, area: a };
      }).filter((c) => { if (c.area < 1) { tiny++; return false; } return true; });
      cs.sort((a, b) => b.area - a.area);
      comps.push(...cs);
      await tick();
    }
    if (tiny) warnings.push(msg(opts.lang, 'specks', { n: tiny }));
    if (!comps.length) {
      warnings.push(msg(opts.lang, 'nothing'));
      return { pieces: [], warnings };
    }
    const tol = opts.islands === false ? Infinity : (opts.islandTolerance || 0.015);
    const full = fullIters(opts.quality);
    const out = [];
    let stretched = 0, folded = 0, closed = 0, torus = 0, huge = 0, slivers = 0;
    const total = comps.length;
    // A split is only worth it if the parts really flatten better. Stretch that
    // sits in a few small spots (rounded corners, fillets) stays whatever way
    // the chart is cut, and splitting would only chop a clean strip into
    // uneven pieces. Parts that are not plain discs cannot be judged here and
    // are trusted to be split further later.
    async function splitHelps(parts, parentMax) {
      let worst = 0;
      for (const p of parts) {
        const pm = buildMesh(model, prepare(model, p.faces, faceLocal, cutFlag));
        if (pm.nV < 3) continue;
        if (pm.loops.length !== 1 || pm.genus > 0) return true;
        const r = await flattenMesh(pm, opts, tick, () => {}, Math.min(25, full));
        worst = Math.max(worst, distortion(r.uv, pm.F, r.fr).max);
      }
      return worst < parentMax * 0.7;
    }
    for (let ci = 0; ci < total; ci++) {
      const comp = comps[ci];
      const minArea = Math.max(20, comp.area * 0.003);
      let doneArea = 0;
      const stack = [{ faces: comp.faces, depth: 0, area: comp.area }];
      while (stack.length) {
        const ch = stack.pop();
        const report = (text) => onProgress(
          msg(opts.lang, 'progress', { a: ci + 1, n: total, p: out.length + 1, s: text }),
          (ci + Math.min(1, doneArea / comp.area)) / total,
        );
        report(msg(opts.lang, 'building'));
        let prep = prepare(model, ch.faces, faceLocal, cutFlag);
        let mesh = buildMesh(model, prep);
        let seams = 0;
        const canSplit = tol < Infinity && ch.depth < 10 && ch.area >= 2 * minArea;
        // A closed shape is opened by splitting it by face direction first (when
        // pieces are allowed), so auto seams never run across a flat end cap.
        if (canSplit && opts.autoSeam !== false && mesh.loops.length === 0) {
          const fr0 = localFrames(mesh.P, mesh.F);
          let parts = splitBySharp(mesh, fr0, minArea);
          if (parts.length < 2) parts = splitChart(mesh, fr0, minArea);
          if (parts.length >= 2) {
            for (const p of parts) stack.push({ faces: p.faces, depth: ch.depth + 1, area: p.area });
            await tick();
            continue;
          }
        }
        if (opts.autoSeam !== false) {
          for (let pass = 0; pass < 3; pass++) {
            const c = planSeams(mesh, cutFlag);
            if (!c) break;
            seams += c;
            prep = prepare(model, ch.faces, faceLocal, cutFlag);
            mesh = buildMesh(model, prep);
            await tick();
          }
        }
        if (mesh.nV < 3) { doneArea += ch.area; continue; }
        const probe = canSplit ? Math.min(25, full) : full;
        let res = await flattenMesh(mesh, opts, tick, report, probe);
        let dist = distortion(res.uv, mesh.F, res.fr);
        // A ring whose inner edge turns like a plain hole (a sloped frame round a
        // window, a shallow cone) can still not lie flat without a cut: try one
        // seam from each larger inner loop to the outer edge and keep it if the
        // piece really flattens better.
        if (opts.autoSeam !== false && dist.max > Math.min(tol, 0.015) && mesh.loops.length >= 2) {
          const before = cutFlag.slice();
          const c = planSeams(mesh, cutFlag, true);
          let kept = false;
          if (c) {
            const prep2 = prepare(model, ch.faces, faceLocal, cutFlag);
            const mesh2 = buildMesh(model, prep2);
            if (mesh2.nV >= 3) {
              const res2 = await flattenMesh(mesh2, opts, tick, report, probe);
              const dist2 = distortion(res2.uv, mesh2.F, res2.fr);
              if (dist2.max < dist.max * 0.7) { prep = prep2; mesh = mesh2; res = res2; dist = dist2; seams += c; kept = true; }
            }
          }
          if (!kept) cutFlag.set(before);
        }
        if (canSplit && dist.max > tol) {
          const parts = splitChart(mesh, res.fr, minArea);
          if (parts.length >= 2 && await splitHelps(parts, dist.max)) {
            for (const p of parts) stack.push({ faces: p.faces, depth: ch.depth + 1, area: p.area });
            await tick();
            continue;
          }
        }
        if (res.method !== 'planar' && probe < full) {
          await arap(mesh.P, mesh.F, res.fr, res.uv, full - probe, tick, (i, n) => report(i < 0 ? msg(opts.lang, 'factorizing') : `ARAP ${probe + i + 1}/${full}`));
          dist = distortion(res.uv, mesh.F, res.fr);
        }
        if (opts.viewMatrix && opts.viewMatrix.length === 16) alignToView(res.uv, mesh.P, opts.viewMatrix);
        // fold lines (dihedral between oriented faces across interior edges)
        // user seams inside the piece: both sides of each slit, drawn as cut lines
        const cuts = [];
        if (userSeams) {
          for (let c = 0; c < 3 * mesh.n; c++) {
            if (mesh.ip[c] >= 0 || !userSeams[mesh.le[c]]) continue;
            cuts.push({ a: mesh.F[c], b: mesh.F[3 * ((c / 3) | 0) + ((c % 3) + 1) % 3] });
          }
        }
        const folds = [];
        const N = res.fr.N, Q = res.fr.Q;
        for (let i = 0; i < mesh.n; i++) {
          for (let k = 0; k < 3; k++) {
            const j = mesh.ip[3 * i + k];
            if (j <= i) continue;
            if (Q[i] < 0.1 || Q[j] < 0.1) continue; // sliver normals are noise
            const d = N[3 * i] * N[3 * j] + N[3 * i + 1] * N[3 * j + 1] + N[3 * i + 2] * N[3 * j + 2];
            const ang = Math.acos(Math.max(-1, Math.min(1, d))) * 180 / PI;
            if (ang >= 5) folds.push({ a: mesh.F[3 * i + k], b: mesh.F[3 * i + (k + 1) % 3], angle: ang });
          }
        }
        // a piece narrower than ~0.6 mm on average cannot be cut out: drop it
        const outline = orderLoops(res.uv, mesh.loops);
        let per = 0;
        for (const L of outline) for (let k = 0; k < L.length; k++) {
          const p = 2 * L[k], q = 2 * L[(k + 1) % L.length];
          per += Math.hypot(res.uv[p] - res.uv[q], res.uv[p + 1] - res.uv[q + 1]);
        }
        if (res.A3 < 2 || (per > 0 && (2 * res.A3) / per < 0.6)) { slivers++; doneArea += ch.area; continue; }
        if (dist.max > 0.03) stretched++;
        if (dist.flipped > 0) folded += dist.flipped;
        if (mesh.loops.length === 0) closed++;
        if (mesh.genus > 0) torus++;
        if (mesh.n > 150000) huge++;
        out.push({
          group: comp.group, faceIds: Int32Array.from(mesh.faces), nV: mesh.nV, uv: res.uv, P: mesh.P, F: mesh.F,
          loops: outline, folds, cuts, faceDistortion: dist.D,
          stats: {
            area3D: res.A3, area2D: Math.abs(dist.area2), meanDistortion: dist.mean, maxDistortion: dist.max, peakDistortion: dist.peak,
            flipped: dist.flipped, seams, nFaces: mesh.n, method: res.method,
          },
        });
        doneArea += ch.area;
        await tick();
      }
    }
    // join flat pieces that lie on one plane and touch (separate meshes)
    let joined = 0;
    if (opts.mergeFlat !== false) { const r = mergeFlat(out); if (r.merged) { out.length = 0; out.push(...r.pieces); joined = r.merged; } }
    // number pieces by group, then by size
    out.sort((a, b) => a.group - b.group || b.stats.area3D - a.stats.area3D);
    out.forEach((p, i) => { p.id = i + 1; });
    if (stretched) warnings.push(msg(opts.lang, 'stretched', { n: stretched }));
    if (folded) warnings.push(msg(opts.lang, 'folded', { n: folded }));
    if (closed) warnings.push(msg(opts.lang, 'closed', { n: closed }));
    if (torus) warnings.push(msg(opts.lang, 'torus', { n: torus }));
    if (slivers) warnings.push(msg(opts.lang, 'slivers', { n: slivers }));
    if (joined) warnings.push(msg(opts.lang, 'merged', { n: joined }));
    if (huge) warnings.push(msg(opts.lang, 'huge', { n: huge }));
    onProgress(msg(opts.lang, 'done'), 1);
    return { pieces: out, warnings };
  }

  return { generate, flatOutline, _internal: { mergeFlat, unionRings, prepare, components, buildMesh, planSeams, splitChart, localFrames, lscm, arap, distortion } };
})();
