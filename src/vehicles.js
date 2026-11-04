// Cars from Kenney's Car Kit (CC0): sedan, sports (muscle), SUV, van, taxi and
// police. Wheels are separate nodes so they spin and steer. Lights, beams,
// sirens and damage smoke are added in code.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// lowrider reuses the sedan body, lowered, with candy paint and chrome trim
const FILES = { sedan: 'sedan', muscle: 'sedanSports', suv: 'suv', van: 'van', taxi: 'taxi', police: 'police' };
const templates = {};
const PAINT = [0x6a2420, 0x2a3a5a, 0x1e1e20, 0x6a6238, 0xc8c2b4, 0x3a4a34, 0x6a6a6e, 0x5a3a4a, 0x8a6a4a];

export async function loadCars(base) {
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  await Promise.all(Object.entries(FILES).map(async ([k, f]) => {
    const g = await loader.loadAsync(`${base}models/cars/${f}.glb`);
    const box = new THREE.Box3().setFromObject(g.scene);
    templates[k] = { scene: g.scene, scale: 4.4 / (box.max.z - box.min.z), minY: box.min.y };
  }));
}

let shared = null;
function parts() {
  if (shared) return shared;
  const beam = new THREE.ConeGeometry(2.2, 10, 12, 1, true); beam.translate(0, -5, 0); beam.rotateX(-Math.PI / 2);
  const bc = document.createElement('canvas'); bc.width = 4; bc.height = 64; const g = bc.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, 'rgba(255,240,200,0.9)'); gr.addColorStop(1, 'rgba(255,240,200,0)'); g.fillStyle = gr; g.fillRect(0, 0, 4, 64);
  const beams = mergeGeometries([beam.clone().rotateX(0.06).translate(-0.62, 0.72, 2.3), beam.clone().rotateX(0.06).translate(0.62, 0.72, 2.3)]);
  shared = {
    beam, beams, beamMat: new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(bc), transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    lamp: new THREE.BoxGeometry(0.4, 0.14, 0.05),
    head: new THREE.MeshBasicMaterial({ color: 0xfff4d0, toneMapped: false }),
    tail: new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false }),
    sirenR: new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false }),
    sirenB: new THREE.MeshBasicMaterial({ color: 0x2050ff, toneMapped: false }),
    sirenGeo: new THREE.BoxGeometry(0.35, 0.14, 0.25),
    burnt: new THREE.MeshStandardMaterial({ color: 0x151313, roughness: 1 }),
    lampMat: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  };
  return shared;
}

// Each car type and paint is merged once into a single vertex colored body
// mesh plus four wheel meshes, so a car costs a handful of draw calls. A
// shader adds chrome (per vertex metal flag) and road dirt low on the body.
const PAINT_LOW = [0x5a1a6a, 0x0a6a6a, 0xa8781a, 0x7a0a1a, 0x1a3a8a];
let carMat = null;
function bodyMaterial() {
  if (carMat) return carMat;
  carMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.35, roughness: 0.42 });
  carMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aMetal;\nattribute float aDirt;\nvarying float vMetal;\nvarying float vDirt;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMetal = aMetal; vDirt = aDirt;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vMetal;\nvarying float vDirt;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.12, 0.09), vDirt * 0.75);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 1.0, vMetal) * (1.0 - vDirt);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(mix(roughnessFactor, 0.1, vMetal), 0.95, vDirt);');
  };
  return carMat;
}
const geoCache = new Map();
function carGeometry(type, paint) {
  const key = type + ':' + paint;
  if (geoCache.has(key)) return geoCache.get(key);
  const T = templates[type === 'lowrider' ? 'sedan' : type] || templates.sedan;
  T.scene.updateMatrixWorld(true);
  const body = [], wheels = [], col = new THREE.Color();
  const pushGeo = (mesh, mat, matrix, group, start, count) => {
    let g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    if (group) { const n = new THREE.BufferGeometry(); for (const a of ['position', 'normal']) { const at = g.attributes[a]; n.setAttribute(a, new THREE.BufferAttribute(at.array.slice(start * at.itemSize, (start + count) * at.itemSize), at.itemSize, at.normalized)); } g = n; }
    else { for (const a of Object.keys(g.attributes)) if (a !== 'position' && a !== 'normal') g.deleteAttribute(a); }
    // meshopt quantized attributes are normalized ints: go to floats before transforming
    for (const a of ['position', 'normal']) { const at = g.attributes[a]; if (!at) continue; const f = new Float32Array(at.count * 3); for (let i = 0; i < at.count; i++) { f[i * 3] = at.getX(i); f[i * 3 + 1] = at.getY(i); f[i * 3 + 2] = at.getZ(i); } g.setAttribute(a, new THREE.BufferAttribute(f, 3)); }
    g.applyMatrix4(matrix);
    const n = mat.name || '';
    let metal = 0;
    if (/paint/i.test(n) && type !== 'police' && type !== 'taxi') col.setHex(type === 'lowrider' ? PAINT_LOW[paint % PAINT_LOW.length] : PAINT[paint % PAINT.length]);
    else if (/window/i.test(n)) { col.setHex(0x0c1218); metal = 0.8; }
    else if (/plastic/i.test(n) && type === 'lowrider') { col.setHex(0xd8d8d8); metal = 1; }
    else if (/wheelInside|carTire/i.test(n)) col.setHex(0x161616);
    else if (/_default/i.test(n) && type === 'lowrider') { col.setHex(0xe0e0e0); metal = 1; }
    else col.copy(mat.color);
    const cnt = g.attributes.position.count, c = new Float32Array(cnt * 3), m = new Float32Array(cnt), d = new Float32Array(cnt);
    for (let i = 0; i < cnt; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; m[i] = metal; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.setAttribute('aMetal', new THREE.BufferAttribute(m, 1)); g.setAttribute('aDirt', new THREE.BufferAttribute(d, 1));
    return g;
  };
  const meshParts = (mesh, matrix, out) => {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (mats.length === 1) out.push(pushGeo(mesh, mats[0], matrix));
    else { const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry; for (const gr of mesh.geometry.groups) out.push(pushGeo({ geometry: g }, mats[gr.materialIndex], matrix, true, gr.start, gr.count)); }
  };
  const inv = new THREE.Matrix4(), rel = new THREE.Matrix4();
  T.scene.traverse((o) => {
    if (/^wheel_/.test(o.name)) {
      const parts = []; inv.copy(o.matrixWorld).invert();
      o.traverse((m) => { if (m.isMesh) meshParts(m, rel.multiplyMatrices(inv, m.matrixWorld), parts); });
      const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3(); o.matrixWorld.decompose(pos, quat, scl);
      const wg = mergeGeometries(parts); wg.scale(scl.x, scl.y, scl.z); wg.applyQuaternion(quat);
      wheels.push({ geo: wg, pos, front: /front/.test(o.name) });
      return;
    }
    if (o.isMesh) { let p = o.parent, inWheel = false; while (p) { if (/^wheel_/.test(p.name)) inWheel = true; p = p.parent; } if (!inWheel) meshParts(o, o.matrixWorld, body); }
  });
  const merged = mergeGeometries(body);
  // dirt: strongest near the rocker panels, broken up with a little noise
  merged.computeBoundingBox(); const bb = merged.boundingBox, P = merged.attributes.position, D = merged.attributes.aDirt, M = merged.attributes.aMetal;
  for (let i = 0; i < P.count; i++) {
    const y = (P.getY(i) - bb.min.y) / (bb.max.y - bb.min.y);
    const n = Math.sin(P.getX(i) * 9.1 + P.getZ(i) * 5.3) * 0.5 + 0.5;
    D.setX(i, Math.max(0, 1 - y / 0.42) * (0.35 + 0.5 * n) * (M.getX(i) > 0.5 ? 0.3 : 1) * (type === 'lowrider' ? 0.3 : 1));
  }
  const out = { body: merged, wheels };
  geoCache.set(key, out); return out;
}

export function makeCar(c) {
  const P = parts(), T = templates[c.type === 'lowrider' ? 'sedan' : c.type] || templates.sedan;
  const g = new THREE.Group();
  const model = new THREE.Group();
  model.scale.setScalar(T.scale); model.position.y = -T.minY * T.scale; model.rotation.y = Math.PI; // kit faces -z
  model.rotation.order = 'YXZ';
  const geo = carGeometry(c.type, c.paint);
  const body = new THREE.Mesh(geo.body, bodyMaterial()); body.castShadow = true;
  if (c.type === 'lowrider') body.position.y = -0.1 / T.scale;
  model.add(body);
  const wheels = [];
  for (const w of geo.wheels) { const m = new THREE.Mesh(w.geo, bodyMaterial()); m.position.copy(w.pos); model.add(m); wheels.push({ node: m, front: w.front }); }
  g.add(model);
  const lamps = new THREE.Group();
  for (const x of [-0.62, 0.62]) {
    const h = new THREE.Mesh(P.lamp, P.head); h.position.set(x, 0.75, 2.2); lamps.add(h);
    const t = new THREE.Mesh(P.lamp, P.tail); t.position.set(x, 0.8, -2.2); lamps.add(t);
  }
  g.add(mergedLamps(lamps));
  const beams = new THREE.Mesh(P.beams, P.beamMat); beams.userData.beam = true; g.add(beams);
  let siren = null;
  if (c.type === 'police') {
    siren = [new THREE.Mesh(P.sirenGeo, P.sirenR), new THREE.Mesh(P.sirenGeo, P.sirenB)];
    siren[0].position.set(-0.25, 1.75, -0.1); siren[1].position.set(0.25, 1.75, -0.1); g.add(...siren);
  }
  g.userData = { wheels, spinA: 0, siren, model, body, burnt: false, baseY: model.position.y };
  return g;
}
let lampGeo = null;
function mergedLamps(grp) {
  if (!lampGeo) {
    const parts = []; grp.updateMatrixWorld(true);
    for (const m of grp.children) { const g = m.geometry.clone().applyMatrix4(m.matrixWorld); const col = m.material.color, n = g.attributes.position.count, c = new Float32Array(n * 3); for (let i = 0; i < n; i++) col.toArray(c, i * 3); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); parts.push(g); }
    lampGeo = mergeGeometries(parts);
  }
  return new THREE.Mesh(lampGeo, parts().lampMat);
}

export function updateCar(g, c, dt, night, now) {
  const u = g.userData;
  u.spinA += (c.v * dt) / 0.37;
  for (const w of u.wheels) { w.node.rotation.x = -u.spinA; if (w.front) w.node.rotation.y = c.steer; }
  let d = c.ry - g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
  g.rotation.y += Math.abs(d) > 0.01 ? d * Math.min(1, dt * (c.ai ? 6 : 30)) : d;
  g.position.x += (c.x - g.position.x) * Math.min(1, dt * (c.ai ? 8 : 40));
  g.position.z += (c.z - g.position.z) * Math.min(1, dt * (c.ai ? 8 : 40));
  // suspension: springy pitch under throttle and brakes, body roll in turns and
  // slides, and a vertical bounce kicked by crashes (u.bounce)
  const acc = dt > 0 ? (c.v - (u.lastV ?? c.v)) / dt : 0; u.lastV = c.v;
  const tPitch = THREE.MathUtils.clamp(-acc * 0.0035, -0.07, 0.07), tRoll = -c.steer * Math.min(1, Math.abs(c.v) / 18) * 0.13 - (c.slip || 0) * Math.sign(c.steer || 0) * 0.05;
  u.pv = ((u.pv || 0) + ((tPitch - (u.pitch || 0)) * 90 - (u.pv || 0) * 9) * dt); u.pitch = (u.pitch || 0) + u.pv * dt;
  u.rv = ((u.rv || 0) + ((tRoll - (u.roll || 0)) * 80 - (u.rv || 0) * 8) * dt); u.roll = (u.roll || 0) + u.rv * dt;
  u.bounce = (u.bounce || 0) * Math.max(0, 1 - dt * 4); const by = Math.sin(now / 45) * (u.bounce || 0) * 0.3;
  u.model.rotation.x = u.pitch; u.model.rotation.z = u.roll; u.model.position.y = u.baseY + by;
  for (const ch of g.children) if (ch.userData.beam) ch.visible = night && !c.wrecked;
  if (u.siren) { const on = c.siren && Math.floor(now / 180) % 2 === 0; u.siren[0].visible = !c.siren || on; u.siren[1].visible = !c.siren || !on; }
  if (c.wrecked && !u.burnt) { u.burnt = true; u.model.traverse((o) => { if (o.isMesh) o.material = parts().burnt; }); }
}

// Pooled smoke puffs for damaged cars.
export class Smoke {
  constructor(scene, n) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(cv);
    this.p = [];
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }));
      s.visible = false; scene.add(s); this.p.push({ s, life: 0 });
    }
    this.i = 0;
  }
  emit(x, y, z, dark, big) {
    const q = this.p[this.i = (this.i + 1) % this.p.length];
    q.life = 1; q.max = 1.6 + Math.random(); q.s.visible = true; q.s.position.set(x + (Math.random() - 0.5) * 0.6, y, z + (Math.random() - 0.5) * 0.6);
    q.s.material.color.setHex(dark ? 0x222222 : 0xaaaaaa); q.big = big ? 2 : 1; q.vy = 1 + Math.random();
  }
  update(dt) {
    for (const q of this.p) if (q.life > 0) {
      q.life -= dt / q.max; q.s.position.y += q.vy * dt; const k = 1 - q.life;
      q.s.scale.setScalar((0.6 + k * 2.4) * q.big); q.s.material.opacity = Math.max(0, q.life) * 0.5;
      if (q.life <= 0) q.s.visible = false;
    }
  }
}
