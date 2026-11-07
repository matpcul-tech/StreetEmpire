// Street Empire build kit model check. Finds flaws in downloaded or AI-made car models:
// open holes, window openings with no glass, and proportions against the real vehicle.
//   node tools/kit-check.mjs car-file.glb [more.glb]      (slot is read from the file name)
// tools/kit-glaze.mjs fills the window openings this finds.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import draco3d from 'draco3dgltf';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'draco3d.decoder': await draco3d.createDecoderModule() });
// real-world size per slot (m): length, width with mirrors about 0.2 m less, height
export const REF = { sedan: [4.9, 1.8, 1.4], muscle: [4.8, 1.72, 1.3], suv: [4.8, 1.95, 1.8], van: [5.1, 2.0, 2.0], taxi: [4.9, 1.8, 1.4], police: [5.2, 1.98, 1.47], lowrider: [5.4, 2.0, 1.38], pickup: [5.2, 1.95, 1.75] };
export const slotOf = (f) => Object.keys(REF).find((s) => f.split('/').pop().toLowerCase().startsWith(s)) || Object.keys(REF).find((s) => f.toLowerCase().includes(s)) || 'sedan';
export async function holes(file) {
  const d = await io.read(file);
  const verts = [], key = new Map(), edges = new Map();
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  const vid = (p) => { const k = p.map((v) => Math.round(v * 2e4)).join(','); let i = key.get(k); if (i === undefined) { i = verts.length; verts.push(p); key.set(k, i); } return i; };
  for (const n of d.getRoot().listNodes()) {
    const mesh = n.getMesh(); if (!mesh) continue; const M = n.getWorldMatrix();
    const tf = (v) => [M[0] * v[0] + M[4] * v[1] + M[8] * v[2] + M[12], M[1] * v[0] + M[5] * v[1] + M[9] * v[2] + M[13], M[2] * v[0] + M[6] * v[1] + M[10] * v[2] + M[14]];
    for (const p of mesh.listPrimitives()) {
      const P = p.getAttribute('POSITION'), I = p.getIndices(), ids = [];
      for (let i = 0; i < I.getCount(); i++) { const a = tf(P.getElement(I.getScalar(i), [])); ids.push(vid(a)); for (let j = 0; j < 3; j++) { mn[j] = Math.min(mn[j], a[j]); mx[j] = Math.max(mx[j], a[j]); } }
      for (let i = 0; i < ids.length; i += 3) for (const [a, b] of [[ids[i], ids[i + 1]], [ids[i + 1], ids[i + 2]], [ids[i + 2], ids[i]]]) { if (a === b) continue; const k = a < b ? a + '_' + b : b + '_' + a; const e = edges.get(k); if (e) e.n++; else edges.set(k, { a, b, n: 1 }); }
    }
  }
  // chain single-use edges into loops
  const adj = new Map(); for (const e of edges.values()) if (e.n === 1) { (adj.get(e.a) || adj.set(e.a, []).get(e.a)).push(e.b); (adj.get(e.b) || adj.set(e.b, []).get(e.b)).push(e.a); }
  const seen = new Set(), loops = [];
  for (const start of adj.keys()) {
    if (seen.has(start)) continue; const loop = []; let cur = start, prev = -1;
    while (cur !== undefined && !seen.has(cur)) { seen.add(cur); loop.push(cur); const nx = (adj.get(cur) || []).find((v) => v !== prev && !seen.has(v)); prev = cur; cur = nx; }
    if (loop.length >= 4) loops.push(loop);
  }
  const size = mx.map((v, j) => v - mn[j]);
  const out = loops.map((l) => { const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (const i of l) for (let j = 0; j < 3; j++) { lo[j] = Math.min(lo[j], verts[i][j]); hi[j] = Math.max(hi[j], verts[i][j]); } const ext = hi.map((v, j) => (v - lo[j]) / size[2]); return { loop: l, lo, hi, ext, span: Math.max(...ext) }; }).sort((a, b) => b.span - a.span);
  return { verts, loops: out, mn, mx, size, boundaryEdges: [...edges.values()].filter((e) => e.n === 1).length, tris: [...edges.values()].length };
}
export async function windowHoles(file, slot) {
  const r = await holes(file), k = (REF[slot] || REF.sedan)[0] / r.size[2]; // meters per model unit
  const out = [];
  for (const h of r.loops) {
    const ext = h.hi.map((v, j) => (v - h.lo[j]) * k), cy = ((h.lo[1] + h.hi[1]) / 2 - r.mn[1]) / r.size[1];
    if (cy < 0.5 || ext[1] < 0.12) continue;                 // high on the body, at least 12 cm tall
    const side = ext[0] < 0.3 && ext[2] > 0.25;               // side glass: thin across, long along
    const endGlass = ext[0] > 0.9 && ext[2] < 1.2;            // windshield / rear glass: wide across
    if (!side && !endGlass) continue;
    const cz = ((h.lo[2] + h.hi[2]) / 2 - r.mn[2]) / r.size[2], cx = ((h.lo[0] + h.hi[0]) / 2 - r.mn[0]) / r.size[0];
    out.push({ ...h, kind: side ? (cx > 0.5 ? 'left side' : 'right side') : (cz > 0.5 ? 'windshield' : 'rear glass'), ext, cz });
  }
  return { r, out };
}
async function allTris(file) {
  const d = await io.read(file), T = [];
  for (const n of d.getRoot().listNodes()) { const mesh = n.getMesh(); if (!mesh) continue; const M = n.getWorldMatrix();
    const tf = (v) => [M[0] * v[0] + M[4] * v[1] + M[8] * v[2] + M[12], M[1] * v[0] + M[5] * v[1] + M[9] * v[2] + M[13], M[2] * v[0] + M[6] * v[1] + M[10] * v[2] + M[14]];
    for (const p of mesh.listPrimitives()) { const P = p.getAttribute('POSITION'), I = p.getIndices(); for (let i = 0; i < I.getCount(); i += 3) T.push([0, 1, 2].map((j) => tf(P.getElement(I.getScalar(i + j), [])))); } }
  return T;
}
// ray-triangle (Moller-Trumbore), returns t or null
function hit(o, d, t) { const e1 = [0, 1, 2].map((j) => t[1][j] - t[0][j]), e2 = [0, 1, 2].map((j) => t[2][j] - t[0][j]); const p = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]]; const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2]; if (Math.abs(det) < 1e-12) return null; const s = [0, 1, 2].map((j) => o[j] - t[0][j]); const u = (s[0] * p[0] + s[1] * p[1] + s[2] * p[2]) / det; if (u < 0 || u > 1) return null; const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]]; const v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) / det; if (v < 0 || u + v > 1) return null; return (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) / det; }
export async function openWindows(file, slot) {
  const { r, out } = await windowHoles(file, slot); const T = await allTris(file); const res = [];
  for (const w of out) {
    const axis = w.kind.includes('side') ? 0 : 2; // look across the opening
    const lo = w.lo, hi = w.hi, c = lo.map((v, j) => (v + hi[j]) / 2);
    // sample a grid of points inside the opening's box face; a point is covered if a surface sits within the opening's depth (+3 cm)
    const pad = 0.03 / ((REF[slot] || REF.sedan)[0] / r.size[2]); let covered = 0, n = 0;
    const a1 = axis === 0 ? 2 : 0;
    for (let i = 1; i < 6; i++) for (let k = 1; k < 4; k++) {
      const o = [...c]; o[a1] = lo[a1] + (hi[a1] - lo[a1]) * i / 6; o[1] = lo[1] + (hi[1] - lo[1]) * k / 4; o[axis] = lo[axis] - 1; const d = [0, 0, 0]; d[axis] = 1;
      n++; for (const t of T) { const h = hit(o, d, t); if (h != null && o[axis] + h > lo[axis] - pad && o[axis] + h < hi[axis] + pad) { covered++; break; } }
    }
    res.push({ ...w, coverage: covered / n });
  }
  return { r, res };
}

export async function check(file) {
  const slot = slotOf(file), r = await holes(file), ref = REF[slot], k = ref[0] / r.size[2];
  const { res } = await openWindows(file, slot);
  return { slot, width: r.size[0] * k, height: r.size[1] * k, ref, open: res.filter((w) => w.coverage < 0.5), tris: Math.round(r.tris / 1.5) };
}
if (import.meta.url === 'file://' + process.argv[1]) for (const f of process.argv.slice(2)) {
  const c = await check(f), pct = (a, b) => ((a / b - 1) * 100).toFixed(0) + '%';
  console.log(`${f.split('/').pop()} (${c.slot}): about ${c.tris.toLocaleString()} triangles`);
  console.log(`  size: width ${c.width.toFixed(2)} m with mirrors (real ~${c.ref[1]}, ${pct(c.width, c.ref[1])}), height ${c.height.toFixed(2)} m (real ~${c.ref[2]}, ${pct(c.height, c.ref[2])})`);
  console.log(c.open.length ? c.open.map((w) => `  OPEN WINDOW: ${w.kind}, ${w.ext[2].toFixed(2)} m long, ${w.ext[1].toFixed(2)} m tall, ${w.cz > 0.5 ? 'front' : 'rear'} half. Fill with tools/kit-glaze.mjs`).join('\n') : '  windows: all glazed');
}
