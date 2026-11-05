// Street Empire pack, original accessories (no third party assets):
//   node tools/build-se-acc.mjs  ->  public/models/se-pack/accessories.glb
// Modeled in code with three.js primitives, bent and merged, then written as a
// plain GLB. Sizes fit the pack head (skull radius and neck radius in meters,
// measured from people.glb). Geometry is in head space: +y up, +z forward,
// origin at the cap line. Vertex colors carry shading (bands, seams, knots);
// the game multiplies them by the crew color.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Document, NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
const R = 0.094, NR = 0.092;
const shade = (g, k) => { g = g.index ? g.toNonIndexed() : g; for (const a of Object.keys(g.attributes)) if (a !== 'position' && a !== 'normal') g.deleteAttribute(a); const n = g.attributes.position.count; g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(k), 3)); return g; };
const merge = (...gs) => mergeGeometries(gs);
// snapback cap: six panel dome with seams, curved brim, button
function cap() {
  const dome = new THREE.SphereGeometry(R * 1.03, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2); dome.scale(1, 0.88, 1.1);
  const seams = []; for (let i = 0; i < 6; i++) { const s = new THREE.TorusGeometry(R * 1.035, 0.0018, 3, 16, Math.PI / 2); s.rotateY(i * Math.PI / 3); s.rotateX(0); s.scale(1, 0.88, 1.1); const t = s.clone(); t.rotateZ(0); seams.push(shade(t.rotateX(Math.PI / 2).rotateX(-Math.PI / 2), 0.7)); }
  const brim = new THREE.CylinderGeometry(R * 0.95, R * 0.95, 0.007, 16, 1, false, -Math.PI / 2, Math.PI); brim.scale(1, 1, 1.25); brim.translate(0, 0.004, R * 0.55);
  const P = brim.attributes.position; for (let i = 0; i < P.count; i++) { const x = P.getX(i); P.setY(i, P.getY(i) - 0.9 * x * x); } // curved brim
  const band = new THREE.CylinderGeometry(R * 1.04, R * 1.04, 0.014, 18, 1, true); band.scale(1, 1, 1.1); band.translate(0, 0.006, 0);
  const btn = new THREE.SphereGeometry(0.009, 6, 3); btn.translate(0, R * 0.9, 0);
  return merge(shade(dome, 1), shade(brim, 0.85), shade(band, 0.75), shade(btn, 0.8));
}
// bandana do-rag tied at the back with two tails
function rag() {
  const s = new THREE.SphereGeometry(R * 1.05, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.56); s.scale(1, 0.92, 1.12);
  const knot = new THREE.SphereGeometry(0.022, 8, 5); knot.scale(1.2, 0.8, 0.8); knot.translate(0, -0.012, -R * 1.12);
  const t1 = new THREE.ConeGeometry(0.02, 0.12, 4); t1.rotateX(Math.PI / 2 + 0.9); t1.translate(0.012, -0.05, -R * 1.18);
  const t2 = t1.clone(); t2.translate(-0.024, 0.005, 0.005); t2.rotateZ(0.08);
  // printed paisley dots: darker flecks on the cloth
  const dots = []; for (let i = 0; i < 14; i++) { const d = new THREE.CircleGeometry(0.006, 5); const a = (i / 14) * Math.PI * 2, e = 0.35 + (i % 3) * 0.25; d.translate(0, 0, R * 1.07); d.rotateX(-e); d.rotateY(a); d.scale(1, 0.92, 1.12); dots.push(shade(d, 1.6)); }
  return merge(shade(s, 1), shade(knot, 0.8), shade(t1, 0.9), shade(t2, 0.85), ...dots);
}
// police peaked cap: crown, dark band, glossy visor, badge
function police() {
  const crown = new THREE.CylinderGeometry(R * 1.18, R * 0.98, 0.07, 18); crown.translate(0, 0.035, 0);
  const top = new THREE.CylinderGeometry(R * 1.2, R * 1.18, 0.01, 18); top.translate(0, 0.072, 0);
  const band = new THREE.CylinderGeometry(R * 1.0, R * 1.0, 0.024, 18, 1, true); band.translate(0, 0.012, 0);
  const visor = new THREE.CylinderGeometry(R * 0.85, R * 0.85, 0.006, 16, 1, false, -Math.PI / 2, Math.PI); visor.scale(1, 1, 0.85); visor.translate(0, -0.002, R * 0.6); visor.rotateX(0.12);
  return merge(shade(crown, 1), shade(top, 1.05), shade(band, 0.35), shade(visor, 0.2));
}
// Unc's short brim fedora with a pinched crown and band
function hat() {
  const c = new THREE.CylinderGeometry(R * 0.85, R * 1.02, 0.1, 18, 3); c.translate(0, 0.05, 0);
  const P = c.attributes.position; for (let i = 0; i < P.count; i++) if (P.getY(i) > 0.09) P.setY(i, P.getY(i) - 0.015 * Math.max(0, 1 - Math.abs(P.getX(i)) / (R * 0.5))); // center dent
  const b = new THREE.CylinderGeometry(R * 1.6, R * 1.6, 0.007, 20); const Q = b.attributes.position; for (let i = 0; i < Q.count; i++) { const r = Math.hypot(Q.getX(i), Q.getZ(i)); Q.setY(i, Q.getY(i) + (r > R * 1.2 ? 0.012 * Math.abs(Q.getX(i)) / (R * 1.6) : 0)); }
  const band = new THREE.CylinderGeometry(R * 1.0, R * 1.03, 0.02, 18, 1, true); band.translate(0, 0.014, 0);
  return merge(shade(c, 1), shade(b, 0.95), shade(band, 0.3));
}
// neck bandana: a folded cone around the neck with a triangle hanging in front
function neck() {
  const n = new THREE.CylinderGeometry(NR, NR * 1.4, 0.065, 14, 1, true);
  const tri = new THREE.ConeGeometry(0.05, 0.11, 3); tri.rotateX(Math.PI); tri.scale(1.3, 1, 0.35); tri.translate(0, -0.06, NR * 1.2);
  const knot = new THREE.SphereGeometry(0.014, 6, 4); knot.translate(0, -0.005, NR * 1.25);
  return merge(shade(n, 1), shade(tri, 0.92), shade(knot, 0.75));
}
const parts = { cap: cap(), doRag: rag(), police: police(), hat: hat(), neck: neck() };
const doc = new Document(); const buf = doc.createBuffer(); const scene = doc.createScene('accessories');
const mat = doc.createMaterial('se_accessory').setRoughnessFactor(0.85).setMetallicFactor(0);
for (const [name, g] of Object.entries(parts)) {
  const prim = doc.createPrimitive().setMaterial(mat);
  for (const [a, sem] of [['position', 'POSITION'], ['normal', 'NORMAL'], ['color', 'COLOR_0']]) prim.setAttribute(sem, doc.createAccessor().setType('VEC3').setArray(new Float32Array(g.attributes[a].array)).setBuffer(buf));
  scene.addChild(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim)));
  console.log(name, g.attributes.position.count / 3, 'tris');
}
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
await doc.transform(weld()); // plain float GLB: tiny, and no quantization transform on the nodes
await io.write('public/models/se-pack/accessories.glb', doc);
