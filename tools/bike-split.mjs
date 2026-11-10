// Splits the wheels out of a one-piece motorcycle model so they can spin in game.
// AI generators (Meshy and similar) return a bike as one mesh made of many loose shells.
// This finds the two tire shells (big, round and thin), adds the shells that ride with
// them (hub, spokes, sprocket), and writes a GLB with three parts:
//   body, wheel_front and wheel_rear, each wheel under a node placed on its axle.
// The importer then keeps that rig as built:
//
//   node tools/bike-split.mjs ~/Downloads/dirt-bike.glb /tmp/dirt-bike-split.glb
//   node tools/kit-import.mjs add car dirtbike /tmp/dirt-bike-split.glb --keep --yaw 90 --no-paint
//
// Expects the usual generator layout: Y up, the bike's length along X, one mesh with one material.
// Geometry is not changed, only regrouped. Use --front +x when the bike faces +X (default: -x).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import fs from 'node:fs';

const args = process.argv.slice(2), fi = args.indexOf('--front');
const frontSign = fi >= 0 && /^\+?x$/i.test(args[fi + 1] || '') ? 1 : -1;
const [src, out] = args.filter((a, i) => !a.startsWith('--') && (fi < 0 || i !== fi + 1));
if (!src || !out) { console.error('usage: bike-split.mjs <in.glb> <out.glb> [--front -x|+x]'); process.exit(1); }

// some exporters pad the GLB header with a zero byte; browsers and this reader reject that, so it is patched on read
function readGlb(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32LE(0) === 0x46546c67) { const n = b.readUInt32LE(12); for (let i = 20 + n - 1; i >= 20 && b[i] === 0; i--) b[i] = 0x20; }
  return new Uint8Array(b);
}

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.readBinary(readGlb(src));
const root = doc.getRoot(), meshes = root.listMeshes();
if (meshes.length !== 1 || meshes[0].listPrimitives().length !== 1) throw new Error('expected one mesh with one primitive (a one-piece generated model)');
const srcNode = root.listNodes().find((n) => n.getMesh());
const prim = meshes[0].listPrimitives()[0], POS = prim.getAttribute('POSITION'), IDX = prim.getIndices();
const nV = POS.getCount(), P = POS.getArray(), I = IDX ? IDX.getArray() : Uint32Array.from({ length: nV }, (_, i) => i), nT = I.length / 3;

// shells: vertices at the same position count as one, triangles that share a vertex are one shell
const key = new Map(), weld = new Uint32Array(nV);
for (let i = 0; i < nV; i++) { const k = `${Math.round(P[i * 3] * 1e5)},${Math.round(P[i * 3 + 1] * 1e5)},${Math.round(P[i * 3 + 2] * 1e5)}`; let w = key.get(k); if (w === undefined) { w = key.size; key.set(k, w); } weld[i] = w; }
const par = Uint32Array.from({ length: key.size }, (_, i) => i);
const find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
for (let t = 0; t < nT; t++) { const a = find(weld[I[t * 3]]); for (const j of [1, 2]) { const b = find(weld[I[t * 3 + j]]); if (b !== a) par[b] = a; } }
const shells = new Map();
for (let t = 0; t < nT; t++) {
  const id = find(weld[I[t * 3]]); let s = shells.get(id);
  if (!s) shells.set(id, s = { tris: [], min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] });
  s.tris.push(t);
  for (const j of [0, 1, 2]) for (const a of [0, 1, 2]) { const v = P[I[t * 3 + j] * 3 + a]; if (v < s.min[a]) s.min[a] = v; if (v > s.max[a]) s.max[a] = v; }
}
const all = { min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] };
for (const s of shells.values()) for (const a of [0, 1, 2]) { all.min[a] = Math.min(all.min[a], s.min[a]); all.max[a] = Math.max(all.max[a], s.max[a]); }
const L = all.max[0] - all.min[0];

// tires: round in the side view, thin across, a real share of the bike's length, standing on the ground
const tires = [...shells.values()].filter((s) => {
  const dx = s.max[0] - s.min[0], dy = s.max[1] - s.min[1], dz = s.max[2] - s.min[2];
  return dx > L * 0.2 && dx / dy > 0.85 && dx / dy < 1.18 && dz < dx * 0.4 && s.min[1] - all.min[1] < dx * 0.15;
}).sort((a, b) => b.tris.length - a.tris.length).slice(0, 2);
if (tires.length !== 2) throw new Error(`found ${tires.length} tire shells, need 2. The wheels may be fused to the frame in this model`);
const wheels = tires.map((t) => ({ c: [(t.min[0] + t.max[0]) / 2, (t.min[1] + t.max[1]) / 2, (t.min[2] + t.max[2]) / 2], R: (t.max[0] - t.min[0] + t.max[1] - t.min[1]) / 4, z0: t.min[2], z1: t.max[2], shells: [t] }));
for (const s of shells.values()) {
  if (tires.includes(s)) continue;
  const c = [(s.min[0] + s.max[0]) / 2, (s.min[1] + s.max[1]) / 2], dx = s.max[0] - s.min[0], dy = s.max[1] - s.min[1];
  for (const w of wheels) {
    const off = Math.hypot(c[0] - w.c[0], c[1] - w.c[1]), pad = (w.z1 - w.z0) * 0.1;
    // hub and sprocket: round, on the axle. Spokes: anything that sits wholly between the tire's sides.
    const onAxle = off < w.R * 0.12 && dx / dy > 0.8 && dx / dy < 1.25 && Math.max(dx, dy) < w.R * 1.6;
    const far = Math.max(...[[s.min[0], s.min[1]], [s.min[0], s.max[1]], [s.max[0], s.min[1]], [s.max[0], s.max[1]]].map(([x, y]) => Math.hypot(x - w.c[0], y - w.c[1])));
    const inside = far < w.R * 0.97 && s.min[2] > w.z0 - pad && s.max[2] < w.z1 + pad;
    if (onAxle || inside) { w.shells.push(s); break; }
  }
}
wheels.sort((a, b) => (a.c[0] - b.c[0]) * frontSign * -1); // front first
const owner = new Int8Array(nT).fill(-1);
wheels.forEach((w, k) => { for (const s of w.shells) for (const t of s.tris) owner[t] = k; });

// one new primitive per part: same material, same attributes, vertices copied as they are
const buffer = root.listBuffers()[0], material = prim.getMaterial();
function part(name, k, origin) {
  const remap = new Map(), idx = [];
  for (let t = 0; t < nT; t++) if (owner[t] === k) for (const j of [0, 1, 2]) { const v = I[t * 3 + j]; let n = remap.get(v); if (n === undefined) { n = remap.size; remap.set(v, n); } idx.push(n); }
  const p = doc.createPrimitive().setMaterial(material).setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(idx)).setBuffer(buffer));
  for (const sem of prim.listSemantics()) {
    const A = prim.getAttribute(sem), size = A.getElementSize(), from = A.getArray(), to = new from.constructor(remap.size * size);
    for (const [v, n] of remap) for (let a = 0; a < size; a++) to[n * size + a] = from[v * size + a] - (sem === 'POSITION' ? origin[a] : 0);
    p.setAttribute(sem, doc.createAccessor().setType(A.getType()).setNormalized(A.getNormalized()).setArray(to).setBuffer(buffer));
  }
  return { mesh: doc.createMesh(name).addPrimitive(p), tris: idx.length / 3 };
}
const scene = root.getDefaultScene() || root.listScenes()[0];
const holder = doc.createNode('bike').setMatrix(srcNode.getWorldMatrix()); scene.addChild(holder);
const body = part('body', -1, [0, 0, 0]); holder.addChild(doc.createNode('body').setMesh(body.mesh));
const report = [`body ${body.tris} triangles`];
wheels.forEach((w, k) => {
  const name = k === 0 ? 'wheel_front' : 'wheel_rear', m = part(name + '_mesh', k, w.c);
  // the group sits on the axle; the mesh inside it is centered on that point
  holder.addChild(doc.createNode(name).setTranslation(w.c).addChild(doc.createNode(name + '_spin').setMesh(m.mesh)));
  report.push(`${name} ${m.tris} triangles in ${w.shells.length} shells, radius ${w.R.toFixed(3)}, axle at ${w.c.map((v) => v.toFixed(3)).join(' ')}`);
});
srcNode.dispose(); meshes[0].dispose(); prim.dispose();
await io.write(out, doc);
console.log(`${shells.size} shells, ${nT} triangles\n${report.join('\n')}\nwheelbase ${Math.abs(wheels[0].c[0] - wheels[1].c[0]).toFixed(3)} (source units)\nwrote ${out}`);
