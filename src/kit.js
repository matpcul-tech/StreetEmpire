// Build kit: drop-in realistic models that replace the built-in cars and
// buildings slot by slot. public/models/kit/kit.json lists what is installed
// (written by tools/kit-import.mjs). A missing kit.json, a missing slot or a
// file that fails to load all fall back to the built-in assets, so the game
// never breaks because of a bad model.
//
// kit.json:
// {
//   "cars": { "sedan": { "file": "cars/sedan.glb", "yaw": 0, "length": 4.4, "paint": true } },
//   "buildings": { "house": [ { "file": "buildings/house.glb", "yaw": 0 } ] }
// }
// Car slots: sedan, muscle, suv, van, taxi, police, lowrider.
// Building slots: house, store, apt, tower, shed (a slot can hold variants).
// Models face +z (the glTF convention); yaw (degrees) turns one that does not.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export const CAR_SLOTS = ['sedan', 'muscle', 'suv', 'van', 'taxi', 'police', 'lowrider'];
export const BUILDING_SLOTS = ['house', 'store', 'apt', 'tower', 'shed'];
const WHEEL = /^(?!.*steer)(?=.*(wheel|tire|tyre|rim))/i; // road wheels, not the steering wheel
const PAINTABLE = /paint|body|carpaint|exterior|shell/i;

const kit = { cars: {}, buildings: {} };
let done = false;
export const kitReady = () => done;
export const kitCar = (type) => kit.cars[type] || null;
export function kitBuilding(kind, seed) { const v = kit.buildings[kind]; return v && v.length ? v[seed % v.length] : null; }
export const kitInfo = () => kit;

// Loads every kit model. Resolves even when nothing is installed.
export async function loadKit(base, { low = false } = {}) {
  let manifest = null;
  try { const r = await fetch(`${base}models/kit/kit.json`, { cache: 'no-cache' }); if (r.ok) manifest = await r.json(); } catch (e) { /* no kit installed */ }
  if (!manifest) { done = true; return kit; }
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  const jobs = [];
  for (const [slot, spec] of Object.entries(manifest.cars || {})) {
    if (!CAR_SLOTS.includes(slot) || !spec || !spec.file) continue;
    jobs.push(loader.loadAsync(`${base}models/kit/${spec.file}`).then((g) => { kit.cars[slot] = prepCar(g.scene, spec, slot, low); }).catch((e) => console.warn('kit car', slot, e)));
  }
  for (const [slot, list] of Object.entries(manifest.buildings || {})) {
    if (!BUILDING_SLOTS.includes(slot)) continue;
    kit.buildings[slot] = [];
    for (const spec of [].concat(list)) {
      if (!spec || !spec.file) continue;
      jobs.push(loader.loadAsync(`${base}models/kit/${spec.file}`).then((g) => { kit.buildings[slot].push(prepBuilding(g.scene, spec, low)); }).catch((e) => console.warn('kit building', slot, e)));
    }
  }
  await Promise.all(jobs);
  done = true;
  return kit;
}

function shadows(root, cast, receive) { root.traverse((o) => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = receive; } }); }
// low and potato: no transmission or clearcoat passes, they cost a full extra render on phones
function cheapen(root) {
  root.traverse((o) => { if (!o.isMesh) return; for (const m of [].concat(o.material)) { if (m.transmission) { m.transmission = 0; m.transparent = true; m.opacity = Math.min(m.opacity, 0.6); } if (m.clearcoat) m.clearcoat = 0; } });
}

// A car template: the model turned to +z, scaled to the slot length, sitting on
// the ground, with each wheel moved under its own pivot at the wheel center so
// it can spin and steer. Paint materials are marked so each car gets its color.
function prepCar(scene, spec, slot, low) {
  const root = new THREE.Group(); root.name = 'kit-car';
  const inner = new THREE.Group(); inner.rotation.y = THREE.MathUtils.degToRad(spec.yaw || 0); inner.add(scene); root.add(inner);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3());
  const k = (spec.length || 4.4) / Math.max(size.z, 1e-6);
  inner.scale.setScalar(k); inner.position.set(-(box.min.x + box.max.x) / 2 * k, -box.min.y * k, -(box.min.z + box.max.z) / 2 * k);
  root.updateMatrixWorld(true);
  // wheels: meshes named like a wheel and much smaller than the body
  const found = [];
  scene.traverse((o) => { if (o.isMesh && WHEEL.test(o.name + ' ' + (o.parent ? o.parent.name : ''))) found.push(o); });
  const bodyH = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).y;
  const pivots = [];
  for (const m of found) {
    const wb = new THREE.Box3().setFromObject(m), c = wb.getCenter(new THREE.Vector3()), ws = wb.getSize(new THREE.Vector3());
    if (ws.y > bodyH * 0.7 || ws.x > 1.2 || ws.z > 1.4) continue; // one mesh holding all four wheels: leave it static
    // parts of one wheel (tire, rim, nuts) share a pivot
    let pivot = pivots.find((p) => p.position.distanceTo(c) < 0.35);
    if (!pivot) { pivot = new THREE.Group(); pivot.name = 'wheel'; pivot.rotation.order = 'YXZ'; pivot.position.copy(c); root.add(pivot); pivot.updateMatrixWorld(true); pivots.push(pivot); }
    pivot.attach(m); // keeps the world transform, so the wheel now turns around its own center
  }
  const paint = [];
  scene.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) if (spec.paint !== false && PAINTABLE.test(m.name || '') && !paint.includes(m)) paint.push(m); });
  shadows(root, !low, false); if (low) cheapen(root);
  const nWheels = root.children.filter((c) => c.name === 'wheel').length;
  return { root, paint, hasWheels: nWheels > 0, slot, spec };
}

// A building template: turned to +z, footprint fitted into the 13 m lot,
// standing on the ground. Height follows the model (uniform scale).
function prepBuilding(scene, spec, low) {
  const root = new THREE.Group(); root.name = 'kit-building';
  const inner = new THREE.Group(); inner.rotation.y = THREE.MathUtils.degToRad(spec.yaw || 0); inner.add(scene); root.add(inner);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3());
  const fit = spec.footprint || 13, k = (spec.scale || 1) * fit / Math.max(size.x, size.z, 1e-6);
  inner.scale.setScalar(k); inner.position.set(-(box.min.x + box.max.x) / 2 * k, -box.min.y * k, -(box.min.z + box.max.z) / 2 * k);
  shadows(root, !low, !low); if (low) cheapen(root);
  return { root, height: size.y * k, spec };
}

// A placed car: a clone of the template, with paint tinted per car (materials
// are cloned once per color and shared). Returns the model group and its wheels.
const tinted = new Map();
export function cloneKitCar(T, paintHex) {
  const model = T.root.clone(true);
  if (paintHex != null && T.paint.length) model.traverse((o) => {
    if (!o.isMesh) return;
    const swap = (m) => { if (!T.paint.includes(m)) return m; const key = m.uuid + paintHex; let t = tinted.get(key); if (!t) { t = m.clone(); t.color = new THREE.Color(paintHex); t.map = m.map; tinted.set(key, t); } return t; };
    o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
  });
  const wheels = []; for (const c of model.children) if (c.name === 'wheel') wheels.push({ node: c, front: c.position.z > 0 });
  return { model, wheels };
}

export function placeKitBuilding(T) { return T.root.clone(true); }
