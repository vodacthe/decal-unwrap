// ---------------------------------------------------------------------------
// Geo: model loading, vertex welding, adjacency, display geometry, demo models.
// THREE / loaders are referenced only inside function bodies so the pure parts
// (buildModel, weld, refine, demos without THREE) can run in Node for tests.
// ---------------------------------------------------------------------------
const Geo = (() => {
  const BASE_COLOR = [215, 218, 224];

  const ERR = {
    en: {
      gltf: 'Could not read the GLTF file. A .gltf with separate .bin or texture files is not supported; export it as GLB.',
      glb: 'Could not read the GLB file.',
      format: '.{ext} files are not supported. Use STL, OBJ, 3MF, PLY or GLB.',
      empty: 'The file has no triangles (it may only contain points or lines).',
      invalid: 'The model has no valid triangles.',
    },
    vi: {
      gltf: 'Không đọc được file GLTF. File .gltf có .bin hoặc ảnh rời không được hỗ trợ; hãy xuất sang GLB.',
      glb: 'Không đọc được file GLB.',
      format: 'Chưa hỗ trợ file .{ext}. Hãy dùng STL, OBJ, 3MF, PLY hoặc GLB.',
      empty: 'File không chứa tam giác nào (có thể chỉ có điểm hoặc đường).',
      invalid: 'Mô hình không có tam giác hợp lệ.',
    },
  };
  const err = (lang, key, ext) => ((ERR[lang] && ERR[lang][key]) || ERR.en[key]).replace('{ext}', ext || '?');

  function extOf(name) {
    const i = name.lastIndexOf('.');
    return i < 0 ? '' : name.slice(i + 1).toLowerCase();
  }

  // Collect world-space triangles from any THREE object tree.
  function collectTriangles(object) {
    object.updateMatrixWorld(true);
    const chunks = [];
    let total = 0;
    const v = new THREE.Vector3();
    object.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      const g = o.geometry;
      const pos = g.getAttribute('position');
      if (!pos) return;
      const idx = g.index;
      const m = o.matrixWorld;
      const nTri = Math.floor((idx ? idx.count : pos.count) / 3);
      if (!nTri) return;
      const out = new Float32Array(nTri * 9);
      for (let t = 0; t < nTri; t++) {
        for (let k = 0; k < 3; k++) {
          const vi = idx ? idx.getX(3 * t + k) : 3 * t + k;
          v.fromBufferAttribute(pos, vi).applyMatrix4(m);
          const o9 = 9 * t + 3 * k;
          out[o9] = v.x; out[o9 + 1] = v.y; out[o9 + 2] = v.z;
        }
      }
      chunks.push(out);
      total += out.length;
    });
    const all = new Float32Array(total);
    let off = 0;
    for (const c of chunks) { all.set(c, off); off += c.length; }
    return all;
  }

  async function readFile(file, lang = 'en') {
    const ext = extOf(file.name);
    const buf = await file.arrayBuffer();
    let obj;
    if (ext === 'stl') obj = new THREE.Mesh(new STLLoader().parse(buf));
    else if (ext === 'ply') obj = new THREE.Mesh(new PLYLoader().parse(buf));
    else if (ext === 'obj') obj = new OBJLoader().parse(new TextDecoder().decode(buf));
    else if (ext === '3mf') obj = new ThreeMFLoader().parse(buf);
    else if (ext === 'glb' || ext === 'gltf') {
      obj = await new Promise((resolve, reject) => {
        new GLTFLoader().parse(buf, '', (g) => resolve(g.scene), () => reject(new Error(
          err(lang, ext === 'gltf' ? 'gltf' : 'glb'))));
      });
    } else {
      throw new Error(err(lang, 'format', ext));
    }
    const triangles = collectTriangles(obj);
    if (!triangles.length) throw new Error(err(lang, 'empty'));
    const defaultUp = (ext === 'glb' || ext === 'gltf' || ext === 'obj') ? 'y' : 'z';
    return { triangles, name: file.name, defaultUp };
  }

  function nextPow2(n) { let p = 1; while (p < n) p <<= 1; return p; }

  // Weld a triangle soup (9 numbers per triangle) into indexed form.
  // Faces with repeated vertex ids are dropped; zero-area faces with distinct
  // ids are kept so connectivity stays intact.
  function weld(raw, tol) {
    const nT = Math.floor(raw.length / 9);
    const nC = nT * 3;
    const inv = 1 / tol;
    const size = nextPow2(Math.max(16, nC * 2));
    const mask = size - 1;
    const table = new Int32Array(size).fill(-1);
    const q = new Int32Array(nC * 3);       // quantized coords per unique vertex
    const pos = new Float64Array(nC * 3);
    const corner = new Uint32Array(nC);
    let nV = 0;
    for (let c = 0; c < nC; c++) {
      const x = raw[3 * c], y = raw[3 * c + 1], z = raw[3 * c + 2];
      const qx = Math.round(x * inv), qy = Math.round(y * inv), qz = Math.round(z * inv);
      let h = (Math.imul(qx, 73856093) ^ Math.imul(qy, 19349663) ^ Math.imul(qz, 83492791)) & mask;
      let id = -1;
      for (;;) {
        const s = table[h];
        if (s < 0) break;
        if (q[3 * s] === qx && q[3 * s + 1] === qy && q[3 * s + 2] === qz) { id = s; break; }
        h = (h + 1) & mask;
      }
      if (id < 0) {
        id = nV++;
        table[h] = id;
        q[3 * id] = qx; q[3 * id + 1] = qy; q[3 * id + 2] = qz;
        pos[3 * id] = x; pos[3 * id + 1] = y; pos[3 * id + 2] = z;
      }
      corner[c] = id;
    }
    const tri = new Uint32Array(nC);
    let nF = 0;
    for (let t = 0; t < nT; t++) {
      const a = corner[3 * t], b = corner[3 * t + 1], c = corner[3 * t + 2];
      if (a === b || b === c || a === c) continue;
      tri[3 * nF] = a; tri[3 * nF + 1] = b; tri[3 * nF + 2] = c;
      nF++;
    }
    return { pos: pos.slice(0, nV * 3), tri: tri.slice(0, nF * 3), nV, nF };
  }

  // Unique undirected edges via open addressing on (min,max) vertex pairs.
  function buildEdges(tri, nV, nF) {
    const size = nextPow2(Math.max(16, nF * 3));
    const mask = size - 1;
    const table = new Int32Array(size).fill(-1);
    const ea = new Uint32Array(nF * 3), eb = new Uint32Array(nF * 3);
    const faceEdge = new Int32Array(nF * 3);
    let nE = 0;
    for (let f = 0; f < nF; f++) {
      for (let k = 0; k < 3; k++) {
        let a = tri[3 * f + k], b = tri[3 * f + (k + 1) % 3];
        if (a > b) { const t = a; a = b; b = t; }
        let h = (Math.imul(a, 0x9E3779B1) ^ Math.imul(b + 0x632BE5AB, 0x85EBCA77)) & mask;
        let id = -1;
        for (;;) {
          const s = table[h];
          if (s < 0) break;
          if (ea[s] === a && eb[s] === b) { id = s; break; }
          h = (h + 1) & mask;
        }
        if (id < 0) { id = nE++; table[h] = id; ea[id] = a; eb[id] = b; }
        faceEdge[3 * f + k] = id;
      }
    }
    const edgeV = new Uint32Array(nE * 2);
    for (let e = 0; e < nE; e++) { edgeV[2 * e] = ea[e]; edgeV[2 * e + 1] = eb[e]; }
    const edgeFaceStart = new Int32Array(nE + 1);
    for (let i = 0; i < nF * 3; i++) edgeFaceStart[faceEdge[i] + 1]++;
    for (let e = 0; e < nE; e++) edgeFaceStart[e + 1] += edgeFaceStart[e];
    const fill = edgeFaceStart.slice(0, nE);
    const edgeFaces = new Int32Array(nF * 3);
    for (let i = 0; i < nF * 3; i++) edgeFaces[fill[faceEdge[i]]++] = (i / 3) | 0;
    const faceAdj = new Int32Array(nF * 3).fill(-1);
    for (let i = 0; i < nF * 3; i++) {
      const e = faceEdge[i];
      const s = edgeFaceStart[e];
      if (edgeFaceStart[e + 1] - s !== 2) continue;
      const f = (i / 3) | 0;
      const g0 = edgeFaces[s], g1 = edgeFaces[s + 1];
      const other = g0 === f ? g1 : g0;
      if (other !== f) faceAdj[i] = other;
    }
    return { nE, faceEdge, edgeV, edgeFaceStart, edgeFaces, faceAdj };
  }

  function buildModel(triangles, opts = {}) {
    const unitScale = opts.unitScale || 1;
    const upAxis = opts.upAxis || 'z';
    const nT = Math.floor(triangles.length / 9);
    const raw = new Float64Array(nT * 9);
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < nT * 3; i++) {
      let x = triangles[3 * i] * unitScale, y = triangles[3 * i + 1] * unitScale, z = triangles[3 * i + 2] * unitScale;
      if (upAxis === 'z') { const t = y; y = z; z = -t; }
      raw[3 * i] = x; raw[3 * i + 1] = y; raw[3 * i + 2] = z;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    const diag0 = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) || 1;
    const w = weld(raw, Math.max(diag0 * 1e-6, 1e-7));
    const { pos, tri, nV, nF } = w;
    if (!nF) throw new Error(err(opts.lang, 'invalid'));
    // Recenter: x,z centred on 0, lowest point on y = 0.
    let bx0 = Infinity, by0 = Infinity, bz0 = Infinity, bx1 = -Infinity, by1 = -Infinity, bz1 = -Infinity;
    for (let v = 0; v < nV; v++) {
      const x = pos[3 * v], y = pos[3 * v + 1], z = pos[3 * v + 2];
      if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
      if (y < by0) by0 = y; if (y > by1) by1 = y;
      if (z < bz0) bz0 = z; if (z > bz1) bz1 = z;
    }
    const cx = (bx0 + bx1) / 2, cz = (bz0 + bz1) / 2;
    for (let v = 0; v < nV; v++) { pos[3 * v] -= cx; pos[3 * v + 1] -= by0; pos[3 * v + 2] -= cz; }
    const size = [bx1 - bx0, by1 - by0, bz1 - bz0];
    const bbox = {
      min: [-size[0] / 2, 0, -size[2] / 2], max: [size[0] / 2, size[1], size[2] / 2], size,
      diag: Math.hypot(size[0], size[1], size[2]) || 1,
    };
    const fN = new Float32Array(nF * 3), fA = new Float64Array(nF), fC = new Float32Array(nF * 3);
    const fQ = new Float32Array(nF); // shape quality 0..1 (1 = equilateral); slivers have unreliable normals
    for (let f = 0; f < nF; f++) {
      const a = 3 * tri[3 * f], b = 3 * tri[3 * f + 1], c = 3 * tri[3 * f + 2];
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
      const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz);
      fA[f] = len / 2;
      const wx = pos[c] - pos[b], wy = pos[c + 1] - pos[b + 1], wz = pos[c + 2] - pos[b + 2];
      const s2 = ux * ux + uy * uy + uz * uz + vx * vx + vy * vy + vz * vz + wx * wx + wy * wy + wz * wz;
      fQ[f] = s2 > 0 ? (2 * Math.sqrt(3) * len) / s2 : 0;
      if (len > 0) { fN[3 * f] = nx / len; fN[3 * f + 1] = ny / len; fN[3 * f + 2] = nz / len; }
      fC[3 * f] = (pos[a] + pos[b] + pos[c]) / 3;
      fC[3 * f + 1] = (pos[a + 1] + pos[b + 1] + pos[c + 1]) / 3;
      fC[3 * f + 2] = (pos[a + 2] + pos[b + 2] + pos[c + 2]) / 3;
    }
    const E = buildEdges(tri, nV, nF);
    return {
      name: opts.name || 'model', nV, nF, nE: E.nE, pos, tri, fN, fA, fC, fQ,
      faceEdge: E.faceEdge, edgeV: E.edgeV, edgeFaceStart: E.edgeFaceStart, edgeFaces: E.edgeFaces,
      faceAdj: E.faceAdj, bbox,
    };
  }

  function buildDisplayGeometry(model, smoothDeg = 30) {
    const { nF, nV, tri, pos, fN, fA } = model;
    const vn = new Float64Array(nV * 3);
    for (let f = 0; f < nF; f++) {
      const w = fA[f];
      for (let k = 0; k < 3; k++) {
        const v = 3 * tri[3 * f + k];
        vn[v] += fN[3 * f] * w; vn[v + 1] += fN[3 * f + 1] * w; vn[v + 2] += fN[3 * f + 2] * w;
      }
    }
    for (let v = 0; v < nV; v++) {
      const l = Math.hypot(vn[3 * v], vn[3 * v + 1], vn[3 * v + 2]);
      if (l > 0) { vn[3 * v] /= l; vn[3 * v + 1] /= l; vn[3 * v + 2] /= l; }
    }
    const cosT = Math.cos(smoothDeg * Math.PI / 180);
    const P = new Float32Array(nF * 9), N = new Float32Array(nF * 9), C = new Uint8Array(nF * 9);
    for (let f = 0; f < nF; f++) {
      const nx = fN[3 * f], ny = fN[3 * f + 1], nz = fN[3 * f + 2];
      const zeroN = nx === 0 && ny === 0 && nz === 0;
      for (let k = 0; k < 3; k++) {
        const v = 3 * tri[3 * f + k], o = 9 * f + 3 * k;
        P[o] = pos[v]; P[o + 1] = pos[v + 1]; P[o + 2] = pos[v + 2];
        const d = vn[v] * nx + vn[v + 1] * ny + vn[v + 2] * nz;
        if (zeroN || d >= cosT) { N[o] = vn[v]; N[o + 1] = vn[v + 1]; N[o + 2] = vn[v + 2]; }
        else { N[o] = nx; N[o + 1] = ny; N[o + 2] = nz; }
        C[o] = BASE_COLOR[0]; C[o + 1] = BASE_COLOR[1]; C[o + 2] = BASE_COLOR[2];
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    g.setAttribute('color', new THREE.BufferAttribute(C, 3, true));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }

  // Conforming refinement: split every edge longer than maxLen at its midpoint
  // (shared midpoints, so no T-junctions), repeat until all edges are short.
  function refine(pos, tri, maxLen, maxPasses = 14, flipCoplanar = false) {
    let P = Array.from(pos), T = Array.from(tri);
    const max2 = maxLen * maxLen;
    for (let pass = 0; pass < maxPasses; pass++) {
      const mid = new Map();
      const nV = P.length / 3;
      const len2 = (a, b) => {
        const dx = P[3 * a] - P[3 * b], dy = P[3 * a + 1] - P[3 * b + 1], dz = P[3 * a + 2] - P[3 * b + 2];
        return dx * dx + dy * dy + dz * dz;
      };
      const key = (a, b) => (a < b ? a * nV + b : b * nV + a);
      for (let i = 0; i < T.length; i += 3) {
        for (let k = 0; k < 3; k++) {
          const a = T[i + k], b = T[i + (k + 1) % 3];
          const kk = key(a, b);
          if (!mid.has(kk) && len2(a, b) > max2) {
            const m = P.length / 3;
            P.push((P[3 * a] + P[3 * b]) / 2, (P[3 * a + 1] + P[3 * b + 1]) / 2, (P[3 * a + 2] + P[3 * b + 2]) / 2);
            mid.set(kk, m);
          }
        }
      }
      if (!mid.size) break;
      const out = [];
      for (let i = 0; i < T.length; i += 3) {
        const v = [T[i], T[i + 1], T[i + 2]];
        const m = [0, 1, 2].map((k) => {
          const r = mid.get(key(v[k], v[(k + 1) % 3]));
          return r === undefined ? -1 : r;
        });
        const cnt = (m[0] >= 0) + (m[1] >= 0) + (m[2] >= 0);
        if (cnt === 0) { out.push(v[0], v[1], v[2]); continue; }
        if (cnt === 3) {
          out.push(v[0], m[0], m[2], m[0], v[1], m[1], m[2], m[1], v[2], m[0], m[1], m[2]);
          continue;
        }
        if (cnt === 1) {
          const r = m[0] >= 0 ? 0 : m[1] >= 0 ? 1 : 2;
          const a = v[r], b = v[(r + 1) % 3], c = v[(r + 2) % 3], mm = m[r];
          out.push(a, mm, c, mm, b, c);
          continue;
        }
        // two marked edges: rotate so the unmarked edge is (c, a)
        const r = m[2] < 0 ? 0 : m[0] < 0 ? 1 : 2;
        const a = v[r], b = v[(r + 1) % 3], c = v[(r + 2) % 3];
        const m0 = m[r], m1 = m[(r + 1) % 3];
        out.push(m0, b, m1);
        if (len2(a, m1) <= len2(m0, c)) out.push(a, m0, m1, a, m1, c);
        else out.push(a, m0, c, m0, m1, c);
      }
      T = out;
      if (flipCoplanar) delaunayFlips(P, T);
    }
    if (flipCoplanar) delaunayFlips(P, T);
    return { pos: P, tri: T };
  }

  // Lawson edge flips between coplanar triangle pairs (improves sliver-heavy
  // earcut caps). T is modified in place.
  function delaunayFlips(P, T, maxIter = 40) {
    const nV = P.length / 3;
    const nrm = (f) => {
      const a = 3 * T[3 * f], b = 3 * T[3 * f + 1], c = 3 * T[3 * f + 2];
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
      const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx;
      const l = Math.hypot(x, y, z) || 1;
      return [x / l, y / l, z / l, l];
    };
    const angle = (o, p, q) => {
      const ux = P[3 * p] - P[3 * o], uy = P[3 * p + 1] - P[3 * o + 1], uz = P[3 * p + 2] - P[3 * o + 2];
      const vx = P[3 * q] - P[3 * o], vy = P[3 * q + 1] - P[3 * o + 1], vz = P[3 * q + 2] - P[3 * o + 2];
      const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
      return Math.atan2(Math.hypot(cx, cy, cz), ux * vx + uy * vy + uz * vz);
    };
    for (let it = 0; it < maxIter; it++) {
      const edges = new Map();
      const nF = T.length / 3;
      for (let f = 0; f < nF; f++) {
        for (let k = 0; k < 3; k++) {
          const a = T[3 * f + k], b = T[3 * f + (k + 1) % 3];
          const key = a < b ? a * nV + b : b * nV + a;
          const e = edges.get(key);
          if (e) e.push(f, k); else edges.set(key, [f, k]);
        }
      }
      const touched = new Uint8Array(nF);
      let flips = 0;
      for (const e of edges.values()) {
        if (e.length !== 4) continue;
        const f = e[0], k = e[1], g = e[2], kg = e[3];
        if (touched[f] || touched[g]) continue;
        const a = T[3 * f + k], b = T[3 * f + (k + 1) % 3], c = T[3 * f + (k + 2) % 3];
        if (T[3 * g + kg] !== b) continue;            // inconsistent winding
        const d = T[3 * g + (kg + 2) % 3];
        if (c === d) continue;
        const nf = nrm(f), ng = nrm(g);
        if (nf[0] * ng[0] + nf[1] * ng[1] + nf[2] * ng[2] < 0.99999) continue;
        if (angle(c, a, b) + angle(d, b, a) <= Math.PI + 1e-9) continue;
        // new triangles (a,d,c) and (d,b,c) must keep the orientation
        const keep = T.slice(3 * f, 3 * f + 3), keepG = T.slice(3 * g, 3 * g + 3);
        T[3 * f] = a; T[3 * f + 1] = d; T[3 * f + 2] = c;
        T[3 * g] = d; T[3 * g + 1] = b; T[3 * g + 2] = c;
        const n1 = nrm(f), n2 = nrm(g);
        if (n1[0] * nf[0] + n1[1] * nf[1] + n1[2] * nf[2] < 0.5 || n2[0] * nf[0] + n2[1] * nf[1] + n2[2] * nf[2] < 0.5) {
          T[3 * f] = keep[0]; T[3 * f + 1] = keep[1]; T[3 * f + 2] = keep[2];
          T[3 * g] = keepG[0]; T[3 * g + 1] = keepG[1]; T[3 * g + 2] = keepG[2];
          continue;
        }
        touched[f] = touched[g] = 1;
        flips++;
      }
      if (!flips) break;
    }
  }

  function toSoup(P, T) {
    const out = new Float32Array(T.length * 3);
    for (let i = 0; i < T.length; i++) {
      out[3 * i] = P[3 * T[i]]; out[3 * i + 1] = P[3 * T[i] + 1]; out[3 * i + 2] = P[3 * T[i] + 2];
    }
    return out;
  }

  // Rounded polygon path into a THREE.Path/Shape.
  function roundedPoly(path, pts, radius) {
    const n = pts.length;
    const rr = Array.isArray(radius) ? radius : pts.map(() => radius);
    const corner = (i) => {
      const p = pts[i], a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
      const da = Math.hypot(a[0] - p[0], a[1] - p[1]), db = Math.hypot(b[0] - p[0], b[1] - p[1]);
      const r = Math.min(rr[i], da / 2, db / 2);
      return {
        p, s: [p[0] + (a[0] - p[0]) * r / da, p[1] + (a[1] - p[1]) * r / da],
        e: [p[0] + (b[0] - p[0]) * r / db, p[1] + (b[1] - p[1]) * r / db],
      };
    };
    const c0 = corner(0);
    path.moveTo(c0.e[0], c0.e[1]);
    for (let i = 1; i <= n; i++) {
      const c = corner(i % n);
      path.lineTo(c.s[0], c.s[1]);
      path.quadraticCurveTo(c.p[0], c.p[1], c.e[0], c.e[1]);
    }
    return path;
  }

  function roundRect(path, cx, cy, w, h, r) {
    return roundedPoly(path, [[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]], r);
  }

  function circle(cx, cy, r) {
    const p = new THREE.Path();
    p.absarc(cx, cy, r, 0, Math.PI * 2, false);
    return p;
  }

  // Curved dashboard-style panel with holes (mm, Y-up, front faces +z).
  function demoPanel() {
    const shape = new THREE.Shape();
    roundedPoly(shape, [
      [-122, 36], [-96, 52], [96, 52], [122, 36], [82, -4], [86, -60], [-86, -60], [-82, -4],
    ], [6, 10, 10, 6, 12, 8, 8, 12]);
    const holes = [];
    holes.push(roundRect(new THREE.Path(), 0, 2, 100, 50, 7));        // display window
    holes.push(roundRect(new THREE.Path(), 0, 40, 92, 10, 5));        // top slot
    for (const s of [-1, 1]) {
      holes.push(circle(60 * s, 40, 3.5));                           // screw holes
      holes.push(circle(104 * s, 30, 6));                            // wing holes
      holes.push(circle(90 * s, 16, 4.5));
    }
    for (const x of [-60, -21, 21, 60]) holes.push(circle(x, -40, 8)); // switch holes
    shape.holes = holes;
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: 4, bevelEnabled: true, bevelThickness: 0.8, bevelSize: 0.8, bevelSegments: 2, curveSegments: 20,
    });
    const soup = g.attributes.position.array;
    g.dispose();
    const w = weld(Float64Array.from(soup), 1e-5);
    const r = refine(w.pos, w.tri, 6, 14, true);
    const R = 260;
    const P = r.pos;
    for (let i = 0; i < P.length; i += 3) {
      const x = P[i], z = P[i + 2];
      const th = x / R;
      P[i] = (R + z) * Math.sin(th);
      P[i + 2] = (R + z) * Math.cos(th) - R;
    }
    return toSoup(P, r.tri);
  }

  // Closed solid cylinder r=35, h=90 (mm, Y-up, outward winding).
  function demoCylinder() {
    const R = 35, H = 90, ns = 96, nh = 30;
    const P = [], T = [];
    for (let j = 0; j <= nh; j++) {
      for (let i = 0; i < ns; i++) {
        const a = (2 * Math.PI * i) / ns;
        P.push(R * Math.sin(a), (H * j) / nh, R * Math.cos(a));
      }
    }
    const id = (i, j) => j * ns + (i % ns);
    for (let j = 0; j < nh; j++) {
      for (let i = 0; i < ns; i++) {
        T.push(id(i, j), id(i + 1, j), id(i + 1, j + 1));
        T.push(id(i, j), id(i + 1, j + 1), id(i, j + 1));
      }
    }
    const top = P.length / 3; P.push(0, H, 0);
    const bot = P.length / 3; P.push(0, 0, 0);
    for (let i = 0; i < ns; i++) {
      T.push(top, id(i, nh), id(i + 1, nh));
      T.push(bot, id(i + 1, 0), id(i, 0));
    }
    return toSoup(P, T);
  }

  return { BASE_COLOR, readFile, buildModel, buildDisplayGeometry, demoPanel, demoCylinder, weld, refine };
})();
