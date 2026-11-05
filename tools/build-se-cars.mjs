// Street Empire pack, cars: node tools/build-se-cars.mjs -> public/models/se-pack/cars/lowrider.glb
// Kitbash of the Kenney Car Kit sedan (CC0) with original parts modeled here:
// wide chrome bumpers with overriders, a chrome side spear, a continental kit
// (spare wheel in a chrome ring behind the trunk), fender skirts over the rear
// wheels and wire wheel discs (36 crossed spokes and a knock off spinner) on
// every wheel. Body is dropped toward the ground in the game (slammed stance).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize, meshopt, prune, getBounds } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import fs from 'node:fs';
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read('public/models/cars/sedan.glb');
await doc.transform(dequantize());
const root = doc.getRoot(), buf = root.listBuffers()[0];
const body = root.listNodes().find((n) => n.getName() === 'body');
const chrome = doc.createMaterial('chrome').setBaseColorFactor([0.85, 0.85, 0.85, 1]).setMetallicFactor(1).setRoughnessFactor(0.15);
const skirtMat = root.listMaterials().find((m) => /paint/i.test(m.getName()));
const tireMat = root.listMaterials().find((m) => /carTire/i.test(m.getName()));
const add = (node, name, g, mat) => { g = g.index ? g.toNonIndexed() : g; const prim = doc.createPrimitive().setMaterial(mat);
  prim.setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(g.attributes.position.array)).setBuffer(buf));
  prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(g.attributes.normal.array)).setBuffer(buf));
  const n = doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim)); node.addChild(n); return n; };
// body bounds in body local space
const bb = (() => { const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (const p of body.getMesh().listPrimitives()) { const P = p.getAttribute('POSITION'), v = []; for (let i = 0; i < P.getCount(); i++) { P.getElement(i, v); for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], v[k]); hi[k] = Math.max(hi[k], v[k]); } } } return { lo, hi, sz: hi.map((h, k) => h - lo[k]) }; })();
console.log('body bounds', JSON.stringify(bb), 'body T', body.getTranslation(), body.getScale(), 'wheel', JSON.stringify(root.listNodes().filter(n => /^wheel_/.test(n.getName())).map(n => [n.getName(), n.getTranslation(), n.getScale(), n.getParentNode().getName()])));
const [W, H, L] = bb.sz, cx = (bb.lo[0] + bb.hi[0]) / 2, y0 = bb.lo[1];
// kit faces -z: front is lo z, rear is hi z
const bump = (z) => { const b = new THREE.CapsuleGeometry(H * 0.045, W * 0.9, 4, 10); b.rotateZ(Math.PI / 2); b.translate(cx, y0 + H * 0.2, z);
  const o1 = new THREE.CapsuleGeometry(H * 0.03, H * 0.08, 3, 8); o1.translate(cx - W * 0.25, y0 + H * 0.24, z); const o2 = o1.clone().translate(W * 0.5, 0, 0);
  return mergeGeometries([b, o1, o2].map((g) => g.toNonIndexed())); };
add(body, 'chrome_bumper_front', bump(bb.lo[2] + L * 0.01), chrome);
add(body, 'chrome_bumper_rear', bump(bb.hi[2] - L * 0.01), chrome);
// side spears: a thin chrome strip along each flank
for (const s of [-1, 1]) { const sp = new THREE.BoxGeometry(W * 0.012, H * 0.018, L * 0.62); sp.translate(cx + s * W * 0.502, y0 + H * 0.42, (bb.lo[2] + bb.hi[2]) / 2 + L * 0.04); add(body, 'chrome_spear_' + (s < 0 ? 'l' : 'r'), sp, chrome); }
// continental kit: spare tire upright behind the trunk in a chrome ring
const wheelNode = root.listNodes().find((n) => /wheel_back/.test(n.getName()));
const wrWheel = (() => { let r = 0; for (const c of [wheelNode, ...wheelNode.listChildren()]) { const m = c.getMesh(); if (!m) continue; for (const p of m.listPrimitives()) { const P = p.getAttribute('POSITION'), v = []; for (let i = 0; i < P.getCount(); i++) { P.getElement(i, v); r = Math.max(r, Math.hypot(v[1], v[2])); } } } return r; })();
// wheel radius and position in body space (body and wheel nodes carry their own transforms)
const BT = body.getTranslation(), BS = body.getScale()[1], WS = Math.abs(wheelNode.getScale()[1]), wr = wrWheel * WS / BS;
const spare = new THREE.TorusGeometry(wr * 0.8, wr * 0.22, 8, 20); spare.translate(cx, y0 + H * 0.32, bb.hi[2] + wr * 0.25); add(body, 'continental_tire', spare, tireMat);
const ring = new THREE.TorusGeometry(wr * 1.0, wr * 0.05, 6, 24); ring.translate(cx, y0 + H * 0.32, bb.hi[2] + wr * 0.3); add(body, 'continental_ring', ring, chrome);
const hub = new THREE.CylinderGeometry(wr * 0.5, wr * 0.5, wr * 0.06, 16); hub.rotateX(Math.PI / 2); hub.translate(cx, y0 + H * 0.32, bb.hi[2] + wr * 0.32); add(body, 'continental_hub', hub, chrome);
// fender skirts over the rear wheel openings (body paint)
const rw0 = wheelNode.getTranslation(), rw = [0, (rw0[1] - BT[1]) / BS, (rw0[2] - BT[2]) / BS]; for (const s of [-1, 1]) { const sk = new THREE.CylinderGeometry(wr * 1.08, wr * 1.08, W * 0.01, 16, 1, false, 0, Math.PI); sk.rotateZ(Math.PI / 2); sk.rotateX(Math.PI / 2); sk.translate(cx + s * W * 0.5, rw[1] - 0.02, rw[2]);
  const P = sk.attributes.position; for (let i = 0; i < P.count; i++) if (P.getY(i) < rw[1] - wr * 0.25) P.setY(i, rw[1] - wr * 0.25); add(body, 'skirt_' + (s < 0 ? 'l' : 'r'), sk, skirtMat); }
// wire wheel discs: crossed spokes, dish rim and a two ear knock off on each wheel face
for (const w of root.listNodes().filter((n) => /^wheel_/.test(n.getName()))) {
  const side = w.getTranslation()[0] > cx ? 1 : -1, wr = wrWheel, x = side * wr * 0.32, parts = [];
  for (let i = 0; i < 36; i++) { const a = (i / 36) * Math.PI * 2, tw = (i % 2 ? 1 : -1) * 0.35; const s = new THREE.CylinderGeometry(wr * 0.01, wr * 0.01, wr * 0.52, 3, 1, true); s.translate(0, wr * 0.37, 0); s.rotateY(tw * 0.2); s.rotateX(a); s.translate(x + side * (i % 2) * wr * 0.03, 0, 0); parts.push(s.toNonIndexed()); }
  const dish = new THREE.TorusGeometry(wr * 0.64, wr * 0.05, 3, 16); dish.rotateY(Math.PI / 2); dish.translate(x, 0, 0); parts.push(dish.toNonIndexed());
  const ko = new THREE.CylinderGeometry(wr * 0.12, wr * 0.15, wr * 0.12, 8); ko.rotateZ(Math.PI / 2); ko.translate(x + side * wr * 0.05, 0, 0); parts.push(ko.toNonIndexed());
  const ears = new THREE.BoxGeometry(wr * 0.04, wr * 0.5, wr * 0.06); ears.translate(x + side * wr * 0.1, 0, 0); parts.push(ears.toNonIndexed());
  add(w, 'wire_disc', mergeGeometries(parts), chrome);
}
await doc.transform(prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
fs.mkdirSync('public/models/se-pack/cars', { recursive: true });
await io.write('public/models/se-pack/cars/lowrider.glb', doc);
let t = 0; for (const m of root.listMeshes()) for (const p of m.listPrimitives()) t += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
console.log('lowrider.glb tris', t, fs.statSync('public/models/se-pack/cars/lowrider.glb').size, 'bytes');
