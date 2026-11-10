// ---------------------------------------------------------------------------
// Project: save / open a whole job as one .decal file (JSON) — the 3D model,
// the painting (groups, blocked faces, cut lines), print settings, the camera
// and placed artwork. Pure functions, so they also run in Node for tests.
// ---------------------------------------------------------------------------
const Project = (() => {
  const APP = 'decal-unwrap';
  const VERSION = 1;

  // ---- binary helpers ------------------------------------------------------
  function bytesToB64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function b64ToBytes(b64) {
    const s = atob(b64);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  const f32ToB64 = (a) => bytesToB64(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
  function b64ToF32(b64) {
    const bytes = b64ToBytes(b64);
    if (bytes.length % 4) throw new Error('bad model data');
    return new Float32Array(bytes.buffer, 0, bytes.length / 4);
  }

  // Run-length code for per-face / per-edge byte arrays: [value, count, ...]
  function rle(arr) {
    const out = [];
    for (let i = 0; i < arr.length;) {
      const v = arr[i];
      let j = i + 1;
      while (j < arr.length && arr[j] === v) j++;
      out.push(v, j - i);
      i = j;
    }
    return { n: arr.length, r: out };
  }
  function unrle(o) {
    const a = new Uint8Array(o.n);
    let p = 0;
    for (let i = 0; i < o.r.length; i += 2) {
      const v = o.r[i], c = o.r[i + 1];
      if (p + c > o.n) throw new Error('bad paint data');
      a.fill(v, p, p + c);
      p += c;
    }
    if (p !== o.n) throw new Error('bad paint data');
    return a;
  }

  // FNV-1a over the raw triangle bytes: identifies "the same file" again
  function fingerprint(raw) {
    const b = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
    let h = 0x811c9dc5;
    for (let i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 0x01000193); }
    return `${raw.length}:${(h >>> 0).toString(16)}`;
  }

  // ---- encode / decode -----------------------------------------------------
  // job: { name, raw (Float32Array) | demo ('panel'|'cyl'), unitScale, upAxis,
  //        faceGroup, blocked, seams, settings, unwrap, view, artwork }
  function encode(job) {
    const out = {
      app: APP, version: VERSION, name: job.name || 'model',
      unitScale: job.unitScale || 1, upAxis: job.upAxis === 'z' ? 'z' : 'y',
      model: null, demo: job.demo || null, fingerprint: job.raw ? fingerprint(job.raw) : null,
      paint: {
        group: rle(job.faceGroup), blocked: rle(job.blocked), seams: rle(job.seams),
      },
      settings: job.settings || {}, unwrap: job.unwrap || {}, view: job.view || null, artwork: job.artwork || {},
      surface: job.surface || null,
    };
    if (job.raw && !job.demo) out.model = f32ToB64(job.raw);
    return JSON.stringify(out);
  }

  function decode(text) {
    let o;
    try { o = typeof text === 'string' ? JSON.parse(text) : text; } catch (e) { throw new Error('not a project file'); }
    if (!o || o.app !== APP) throw new Error('not a project file');
    if (o.version > VERSION) throw new Error('made by a newer version');
    const job = {
      name: o.name || 'model', unitScale: Number(o.unitScale) || 1, upAxis: o.upAxis === 'z' ? 'z' : 'y',
      demo: o.demo || null, raw: o.model ? b64ToF32(o.model) : null, fingerprint: o.fingerprint || null,
      faceGroup: unrle(o.paint.group), blocked: unrle(o.paint.blocked), seams: unrle(o.paint.seams),
      settings: o.settings || {}, unwrap: o.unwrap || {}, view: o.view || null, artwork: o.artwork || {},
      surface: o.surface || null,
    };
    if (job.raw && job.fingerprint && fingerprint(job.raw) !== job.fingerprint) throw new Error('model data is damaged');
    return job;
  }

  // Small painting-only record for autosave (keyed by the model fingerprint)
  const encodePaint = (job) => JSON.stringify({ g: rle(job.faceGroup), b: rle(job.blocked), s: rle(job.seams), t: job.time || 0 });
  function decodePaint(text) {
    const o = JSON.parse(text);
    return { faceGroup: unrle(o.g), blocked: unrle(o.b), seams: unrle(o.s), time: o.t || 0 };
  }

  return { encode, decode, encodePaint, decodePaint, fingerprint, _internal: { rle, unrle, f32ToB64, b64ToF32 } };
})();
