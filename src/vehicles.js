// Cars from Kenney's Car Kit (CC0): sedan, sports (muscle), SUV, van, taxi and
// police. Wheels are separate nodes so they spin and steer. Lights, beams,
// sirens and damage smoke are added in code.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const FILES = { sedan: 'sedan', muscle: 'sedanSports', suv: 'suv', van: 'van', taxi: 'taxi', police: 'police' };
const templates = {};
const PAINT = [0x7a1414, 0x14306a, 0x1c1c1e, 0x6a6a20, 0xd8d8d8, 0x2a4a2a, 0x6a6a72, 0x5a2a6a];

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
  shared = {
    beam, beamMat: new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(bc), transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    lamp: new THREE.BoxGeometry(0.4, 0.14, 0.05),
    head: new THREE.MeshBasicMaterial({ color: 0xfff4d0, toneMapped: false }),
    tail: new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false }),
    sirenR: new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false }),
    sirenB: new THREE.MeshBasicMaterial({ color: 0x2050ff, toneMapped: false }),
    sirenGeo: new THREE.BoxGeometry(0.35, 0.14, 0.25),
    burnt: new THREE.MeshStandardMaterial({ color: 0x151313, roughness: 1 }),
  };
  return shared;
}

export function makeCar(c) {
  const P = parts(), T = templates[c.type] || templates.sedan;
  const g = new THREE.Group();
  const model = T.scene.clone(true);
  model.scale.setScalar(T.scale); model.position.y = -T.minY * T.scale; model.rotation.y = Math.PI; // kit faces -z
  const wheels = [], paintMats = [];
  model.traverse((o) => {
    if (o.isMesh) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      o.material = mats.map((m) => {
        if (/paint/i.test(m.name) && c.type !== 'police' && c.type !== 'taxi') { const n = m.clone(); n.color.setHex(PAINT[c.paint % PAINT.length]); n.metalness = 0.5; n.roughness = 0.35; paintMats.push(n); return n; }
        if (/paint|_default/i.test(m.name)) { const n = m.clone(); n.metalness = 0.4; n.roughness = 0.4; paintMats.push(n); return n; }
        if (/window/i.test(m.name)) { const n = m.clone(); n.color.setHex(0x101820); n.metalness = 0.9; n.roughness = 0.1; return n; }
        return m;
      });
      if (o.material.length === 1) o.material = o.material[0];
    }
    if (/^wheel_/.test(o.name)) wheels.push({ node: o, front: /front/.test(o.name) });
  });
  g.add(model);
  for (const x of [-0.62, 0.62]) {
    const h = new THREE.Mesh(P.lamp, P.head); h.position.set(x, 0.75, 2.2); g.add(h);
    const t = new THREE.Mesh(P.lamp, P.tail); t.position.set(x, 0.8, -2.2); g.add(t);
    const b = new THREE.Mesh(P.beam, P.beamMat); b.position.set(x, 0.72, 2.3); b.rotation.x = 0.06; g.add(b); b.userData.beam = true;
  }
  let siren = null;
  if (c.type === 'police') {
    siren = [new THREE.Mesh(P.sirenGeo, P.sirenR), new THREE.Mesh(P.sirenGeo, P.sirenB)];
    siren[0].position.set(-0.25, 1.75, -0.1); siren[1].position.set(0.25, 1.75, -0.1); g.add(...siren);
  }
  g.userData = { wheels, spinA: 0, paintMats, siren, model, burnt: false };
  return g;
}

export function updateCar(g, c, dt, night, now) {
  const u = g.userData;
  u.spinA += (c.v * dt) / 0.37;
  for (const w of u.wheels) { w.node.rotation.x = -u.spinA; if (w.front) w.node.rotation.y = c.steer; }
  let d = c.ry - g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
  g.rotation.y += Math.abs(d) > 0.01 ? d * Math.min(1, dt * (c.ai ? 6 : 30)) : d;
  g.position.x += (c.x - g.position.x) * Math.min(1, dt * (c.ai ? 8 : 40));
  g.position.z += (c.z - g.position.z) * Math.min(1, dt * (c.ai ? 8 : 40));
  u.model.rotation.z = -c.steer * Math.min(1, Math.abs(c.v) / 20) * 0.12;
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
