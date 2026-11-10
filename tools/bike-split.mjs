// Splits a one-piece motorcycle (a raw Meshy export) into a body and two wheels
// so the wheels can spin in game. AI-made bikes come as one mesh, but that mesh
// is built from many separate shells (tire, rim, each spoke, hub, brake disc,
// fender, frame ...). This tool finds the two tires, fits a circle to each to
// get the axle, and moves every shell that belongs to a wheel under its own
// node with the origin on the axle. Nothing is remodeled: every triangle keeps
// its position, normal and UV.
//
//   node tools/bike-split.mjs in.glb out.glb [--front -x|+x|-z|+z] [--drop-floaters]
//
// The output faces +z (the glTF and build kit convention) and has three nodes:
// body, wheel_front and wheel_rear. Import it as a finished model:
//   node tools/kit-import.mjs add car cruiser out.glb --keep --no-paint --yaw 0
//
// What turns with a wheel: the tire, and every shell inside the tire that is
// centered on the axle (rim, hub, brake disc) or runs from the hub outward (a
// spoke). What stays on the bike: anything that reaches outside the tire (fork,
// fender, swingarm) and off-center lumps beside the wheel (brake calipers).
// --drop-floaters also removes tiny shells that float clear of everything else
// (AI debris). Check the list it prints: bar end caps can look like debris.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';

const args = process.argv.slice(2), pos = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--front');
const [inFile, outFile] = pos;
if (!inFile || !outFile) { console.error('usage: bike-split.mjs in.glb out.glb [--front -x|+x|-z|+z] [--drop-floaters]'); process.exit(1); }
const FRONT = args.includes('--front') ? args[args.indexOf('--front') + 1] : '-x';
const DROP_FLOATERS = args.includes('--drop-floaters');

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inFile);
const root = doc.getRoot();
const meshes = root.listMeshes();
if (meshes.length !== 1 || meshes[0].listPrimitives().length !== 1) throw new Error('expected a one-piece model (one mesh, one primitive); this file is already in parts');
const prim = meshes[0].listPrimitives()[0];
const srcNode = root.listNodes().find((n) => n.getMesh() === meshes[0]);
const semantics = prim.listSemantics();
const src = Object.fromEntries(semantics.map((s) => [s, prim.getAttribute(s)]));
const N = src.POSITION.getCount();
const I = prim.getIndices() ? prim.getIndices().getArray() : Uint32Array.from({ length: N }, (_, i) => i);

// positions and normals turned so the front faces +z (x is across, z is along)
const turn = { '-x': (x, y, z) => [z, y, -x], '+x': (x, y, z) => [-z, y, x], '+z': (x, y, z) => [x, y, z], '-z': (x, y, z) => [-x, y, -z] }[FRONT];
if (!turn) throw new Error('--front must be -x, +x, -z or +z');
const wm = srcNode ? srcNode.getWorldMatrix() : null;
const P = new Float32Array(N * 3), NRM = src.NORMAL ? new Float32Array(N * 3) : null;
for (let i = 0; i < N; i++) {
  let [x, y, z] = src.POSITION.getElement(i, []);
  if (wm) [x, y, z] = [wm[0] * x + wm[4] * y + wm[8] * z + wm[12], wm[1] * x + wm[5] * y + wm[9] * z + wm[13], wm[2] * x + wm[6] * y + wm[10] * z + wm[14]];
  P.set(turn(x, y, z), i * 3);
  if (NRM) { let [a, b, c] = src.NORMAL.getElement(i, []); if (wm) [a, b, c] = [wm[0] * a + wm[4] * b + wm[8] * c, wm[1] * a + wm[5] * b + wm[9] * c, wm[2] * a + wm[6] * b + wm[10] * c]; const l = Math.hypot(a, b, c) || 1; NRM.set(turn(a / l, b / l, c / l), i * 3); }
}

// shells: triangles joined through shared positions (UV seams split vertices, so weld by position first)
const first = new Map(), rep = new Int32Array(N);
for (let i = 0; i < N; i++) { const k = `${Math.round(P[i * 3] * 1e5)},${Math.round(P[i * 3 + 1] * 1e5)},${Math.round(P[i * 3 + 2] * 1e5)}`; if (!first.has(k)) first.set(k, i); rep[i] = first.get(k); }
const par = Int32Array.from({ length: N }, (_, i) => i);
const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
for (let t = 0; t < I.length; t += 3) { const a = find(rep[I[t]]); par[find(rep[I[t + 1]])] = a; par[find(rep[I[t + 2]])] = a; }
const shells = new Map();
for (let t = 0; t < I.length; t += 3) {
  const r = find(rep[I[t]]); let s = shells.get(r);
  if (!s) shells.set(r, s = { tris: [], verts: new Set(), min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] });
  s.tris.push(t);
  for (const v of [I[t], I[t + 1], I[t + 2]]) { s.verts.add(v); for (let k = 0; k < 3; k++) { s.min[k] = Math.min(s.min[k], P[v * 3 + k]); s.max[k] = Math.max(s.max[k], P[v * 3 + k]); } }
}
const list = [...shells.values()];
const all = { min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] };
for (const s of list) for (let k = 0; k < 3; k++) { all.min[k] = Math.min(all.min[k], s.min[k]); all.max[k] = Math.max(all.max[k], s.max[k]); }
const L = all.max[2] - all.min[2], H = all.max[1] - all.min[1];

// tires: big shells that touch the ground, are about as tall as they are long, and are narrow
const tires = list.filter((s) => {
  const h = s.max[1] - s.min[1], l = s.max[2] - s.min[2], w = s.max[0] - s.min[0];
  return s.tris.length > 300 && s.min[1] - all.min[1] < H * 0.05 && h / l > 0.8 && h / l < 1.25 && w < l * 0.6 && l < L * 0.45;
}).sort((a, b) => b.tris.length - a.tris.length).slice(0, 2);
if (tires.length < 2) throw new Error('could not find two tires in this model; the wheels stay part of the body');

// least squares circle through points [z, y]
function circle(pts) {
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0; const n = pts.length;
  for (const [x, y] of pts) { const z = x * x + y * y; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z; sz += z; }
  const A = [[sxx, sxy, sx, sxz], [sxy, syy, sy, syz], [sx, sy, n, sz]];
  for (let i = 0; i < 3; i++) { let p = i; for (let r = i + 1; r < 3; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r; [A[i], A[p]] = [A[p], A[i]]; for (let r = 0; r < 3; r++) if (r !== i) { const f = A[r][i] / A[i][i]; for (let k = i; k < 4; k++) A[r][k] -= f * A[i][k]; } }
  const cz = A[0][3] / A[0][0] / 2, cy = A[1][3] / A[1][1] / 2;
  return [cz, cy, Math.sqrt(A[2][3] / A[2][2] + cz * cz + cy * cy)];
}
// the axle: a circle fitted to the tire's outline (its outermost point in each direction)
function axle(s) {
  let cz = (s.min[2] + s.max[2]) / 2, cy = (s.min[1] + s.max[1]) / 2, r = 0;
  for (let it = 0; it < 6; it++) {
    const bins = new Array(48).fill(null);
    for (const v of s.verts) { const dz = P[v * 3 + 2] - cz, dy = P[v * 3 + 1] - cy, d = Math.hypot(dz, dy), b = Math.floor((Math.atan2(dy, dz) + Math.PI) / (2 * Math.PI) * 48) % 48; if (!bins[b] || d > bins[b][2]) bins[b] = [P[v * 3 + 2], P[v * 3 + 1], d]; }
    [cz, cy, r] = circle(bins.filter(Boolean));
  }
  return { z: cz, y: cy, r, x: (s.min[0] + s.max[0]) / 2, half: (s.max[0] - s.min[0]) / 2 };
}
const wheels = tires.map((t) => ({ tire: t, ...axle(t), shells: [] })).sort((a, b) => b.z - a.z); // front first
wheels[0].name = 'wheel_front'; wheels[1].name = 'wheel_rear';

// AI debris: tiny shells whose box touches no other shell
const touches = (a, b, m) => a.min[0] - m < b.max[0] && a.max[0] + m > b.min[0] && a.min[1] - m < b.max[1] && a.max[1] + m > b.min[1] && a.min[2] - m < b.max[2] && a.max[2] + m > b.min[2];
const dropped = [];
const body = [];
for (const s of list) {
  if (DROP_FLOATERS && s.tris.length < 40 && !list.some((o) => o !== s && touches(s, o, L * 0.004))) { dropped.push(s); continue; }
  let home = null;
  for (const w of wheels) {
    if (s === w.tire) { home = null; break; }
    let rmax = 0, rmin = 1e9, az = 0, ay = 0;
    for (const v of s.verts) { const d = Math.hypot(P[v * 3 + 2] - w.z, P[v * 3 + 1] - w.y); rmax = Math.max(rmax, d); rmin = Math.min(rmin, d); az += P[v * 3 + 2]; ay += P[v * 3 + 1]; }
    const off = Math.hypot(az / s.verts.size - w.z, ay / s.verts.size - w.y) / w.r; rmax /= w.r; rmin /= w.r;
    if (rmax > 0.9) continue; // reaches the tire tread or beyond: fork, fender, swingarm
    const inside = s.min[0] >= w.x - w.half * 1.05 && s.max[0] <= w.x + w.half * 1.05; // between the tire's sidewalls
    const centered = off <= 0.15; // rim, hub, brake disc, axle cap
    const spoke = inside && rmin <= 0.2 && rmax >= 0.5; // runs from the hub out to the rim
    const rimBit = inside && rmin >= 0.55; // nipples and rim strips
    if (centered || spoke || rimBit) { home = w; break; }
  }
  if (wheels.some((w) => w.tire === s)) continue;
  (home ? home.shells : body).push(s);
}

// write the parts: one mesh each, same material, vertices compacted
const material = prim.getMaterial(), buffer = root.listBuffers()[0];
const scene = root.getDefaultScene() || root.listScenes()[0];
function part(name, shellList, origin) {
  const map = new Map(), order = [], idx = [];
  for (const s of shellList) for (const t of s.tris) for (let k = 0; k < 3; k++) { const v = I[t + k]; let n = map.get(v); if (n == null) { n = order.length; map.set(v, n); order.push(v); } idx.push(n); }
  const p = doc.createPrimitive().setMaterial(material);
  for (const sem of semantics) {
    const a = src[sem], size = a.getElementSize();
    let arr;
    if (sem === 'POSITION') { arr = new Float32Array(order.length * 3); order.forEach((v, i) => { arr[i * 3] = P[v * 3] - origin[0]; arr[i * 3 + 1] = P[v * 3 + 1] - origin[1]; arr[i * 3 + 2] = P[v * 3 + 2] - origin[2]; }); }
    else if (sem === 'NORMAL') { arr = new Float32Array(order.length * 3); order.forEach((v, i) => { arr[i * 3] = NRM[v * 3]; arr[i * 3 + 1] = NRM[v * 3 + 1]; arr[i * 3 + 2] = NRM[v * 3 + 2]; }); }
    else { const sa = a.getArray(); arr = new sa.constructor(order.length * size); order.forEach((v, i) => { for (let k = 0; k < size; k++) arr[i * size + k] = sa[v * size + k]; }); }
    p.setAttribute(sem, doc.createAccessor().setType(a.getType()).setNormalized(a.getNormalized()).setArray(arr).setBuffer(buffer));
  }
  p.setIndices(doc.createAccessor().setType('SCALAR').setArray(order.length > 65535 ? Uint32Array.from(idx) : Uint16Array.from(idx)).setBuffer(buffer));
  const holder = doc.createNode(name).setTranslation(origin);
  holder.addChild(doc.createNode(name + '_mesh').setMesh(doc.createMesh(name).addPrimitive(p)));
  scene.addChild(holder);
  return idx.length / 3;
}
const counts = { body: part('body', body, [0, 0, 0]) };
for (const w of wheels) counts[w.name] = part(w.name, [w.tire, ...w.shells], [w.x, w.y, w.z]);
if (srcNode) srcNode.dispose();
meshes[0].dispose();
await doc.transform(prune());
await io.write(outFile, doc);

const f = (n) => n.toFixed(3);
console.log(`bike-split: ${list.length} shells, ${I.length / 3} triangles, length ${f(L)} (model units)`);
for (const w of wheels) console.log(`  ${w.name}: axle z ${f(w.z)} y ${f(w.y)}, radius ${f(w.r)} (${(w.r / L * 100).toFixed(1)}% of length), ${w.shells.length + 1} shells, ${counts[w.name]} triangles`);
console.log(`  body: ${body.length} shells, ${counts.body} triangles`);
console.log(`  wheelbase ${f(wheels[0].z - wheels[1].z)} (${((wheels[0].z - wheels[1].z) / L * 100).toFixed(0)}% of length)`);
if (dropped.length) console.log(`  dropped ${dropped.length} floating fragment(s), ${dropped.reduce((a, s) => a + s.tris.length, 0)} triangles: ${dropped.map((s) => `[${f((s.min[0] + s.max[0]) / 2)}, ${f((s.min[1] + s.max[1]) / 2)}, ${f((s.min[2] + s.max[2]) / 2)}]`).join(' ')}`);
