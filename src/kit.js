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
// Car slots: sedan, muscle, suv, van, taxi, police, lowrider, pickup.
// Building slots: house, store, apt, tower, shed (a slot can hold variants).
// Character slots: player, unc, crew, reds, blues, golds, locals, cop, ped
// ("characters": { "player": [ { "file": "characters/player.glb", "yaw": 0, "height": 1.8, "gender": "m" } ] }).
// Characters are rigged models; src/retarget.js plays the game's clips on them.
// gender "m" or "f" is optional. A missing file is left out of kit.json and that person keeps the painted body.
// The full list to generate is public/models/kit/character-roster.json. Only installed files are loaded.
// Models face +z (the glTF convention); yaw (degrees) turns one that does not.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export const CAR_SLOTS = ['sedan', 'muscle', 'suv', 'van', 'taxi', 'police', 'lowrider', 'pickup'];
// real-world lengths in meters per slot, used when kit.json gives none
export const CAR_LENGTH = {'sedan': 4.9, 'muscle': 4.8, 'suv': 4.8, 'van': 5.1, 'taxi': 4.9, 'police': 5.2, 'lowrider': 5.4, 'pickup': 5.2};
export const BUILDING_SLOTS = ['house', 'store', 'apt', 'tower', 'shed'];
// who wears each character slot: player, Unc, your crew, the three rival crews, the Locals crew, police, people on the street
export const CHAR_SLOTS = ['player', 'unc', 'crew', 'reds', 'blues', 'golds', 'locals', 'cop', 'ped'];
const WHEEL = /^(?!.*steer)(?=.*(?:^|[^a-z])(wheel|tire|tyre|rim))/i; // road wheels, not the steering wheel; "rim" must start a word so Trim and Primer do not count
const PAINTABLE = /paint|body|carpaint|exterior|shell/i;

const kit = { cars: {}, buildings: {}, characters: {} };
let done = false;
export const kitReady = () => done;
export const kitCar = (type) => kit.cars[type] || null;
export function kitBuilding(kind, seed) { const v = kit.buildings[kind]; return v && v.length ? v[seed % v.length] : null; }
export const kitInfo = () => kit;
// Pick one installed variant. When a slot has gendered files, men and women stay in their own pool.
// Untagged files (the orange player) are used when nothing is tagged, and as the fallback when the
// requested gender has no file yet. An empty pool means the painted body.
export function pickCharacter(list, seed = 0, gender = null) {
  if (!list || !list.length) return null;
  let v = list;
  if (gender) {
    const tagged = list.filter((t) => t.spec && t.spec.gender);
    if (tagged.length) {
      const hit = tagged.filter((t) => t.spec.gender === gender);
      v = hit.length ? hit : list.filter((t) => !t.spec.gender);
    }
  }
  if (!v.length) return null;
  return v[Math.abs(seed | 0) % v.length];
}
export function kitCharacter(slot, seed = 0, gender = null) { return pickCharacter(kit.characters[slot], seed, gender); }

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
  for (const [slot, list] of Object.entries(manifest.characters || {})) {
    if (!CHAR_SLOTS.includes(slot)) continue;
    const got = [], specs = [].concat(list).filter((x) => x && x.file);
    specs.forEach((spec, i) => jobs.push(loader.loadAsync(`${base}models/kit/${spec.file}`).then((g) => { got[i] = prepCharacter(g.scene, spec, low); }).catch((e) => console.warn('kit character', slot, e))));
    kit.characters[slot] = got; // variants keep the manifest order; empty entries are dropped below
  }
  await Promise.all(jobs);
  for (const slot in kit.characters) kit.characters[slot] = kit.characters[slot].filter(Boolean);
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
  const box = new THREE.Box3().setFromObject(root, true), size = box.getSize(new THREE.Vector3());
  const k = (spec.length || CAR_LENGTH[slot] || 4.8) / Math.max(size.z, 1e-6);
  inner.scale.setScalar(k); inner.position.set(-(box.min.x + box.max.x) / 2 * k, -box.min.y * k, -(box.min.z + box.max.z) / 2 * k);
  root.updateMatrixWorld(true);
  // wheels, first choice: wheel nodes the importer tagged (extras.kitWheel, read by GLTFLoader into userData).
  // Their origin is the axle the modeler or importer set, so the pivot goes exactly there and nothing shifts.
  const rigs = []; scene.traverse((o) => { if (o.userData && o.userData.kitWheel) rigs.push(o); });
  if (rigs.length >= 2) {
    for (const w of rigs) {
      const pivot = new THREE.Group(); pivot.name = 'wheel'; pivot.rotation.order = 'YXZ';
      w.getWorldPosition(pivot.position); root.worldToLocal(pivot.position); root.add(pivot); pivot.updateMatrixWorld(true);
      pivot.attach(w); // the wheel keeps its authored transform inside the pivot; the pivot only adds spin and steer
    }
    const paint = collectPaint(scene, spec);
    shadows(root, !low, false); if (low) cheapen(root);
    return { root, paint, atlas: !paint.length, key: paint.length || spec.paint === false ? null : paintKey(scene), hasWheels: true, slot, spec };
  }
  // fallback for untagged models: meshes named like a wheel and much smaller than the body
  const found = [];
  scene.traverse((o) => { if (o.isMesh && WHEEL.test([o.name, o.parent ? o.parent.name : '', ...[].concat(o.material).map((m) => m.name || '')].join(' '))) found.push(o); });
  const bodyH = new THREE.Box3().setFromObject(root, true).getSize(new THREE.Vector3()).y;
  const pivots = [];
  for (const m of found) {
    const wb = new THREE.Box3().setFromObject(m, true), c = wb.getCenter(new THREE.Vector3()), ws = wb.getSize(new THREE.Vector3());
    if (ws.y > bodyH * 0.7 || ws.x > 1.2 || ws.z > 1.4) continue; // one mesh holding all four wheels: leave it static
    // parts of one wheel (tire, rim, nuts) share a pivot
    let pivot = pivots.find((p) => p.position.distanceTo(c) < 0.35);
    if (!pivot) { pivot = new THREE.Group(); pivot.name = 'wheel'; pivot.rotation.order = 'YXZ'; pivot.position.copy(c); root.add(pivot); pivot.updateMatrixWorld(true); pivots.push(pivot); }
    pivot.attach(m); // keeps the world transform, so the wheel now turns around its own center
  }
  const paint = collectPaint(scene, spec);
  shadows(root, !low, false); if (low) cheapen(root);
  const nWheels = root.children.filter((c) => c.name === 'wheel').length;
  return { root, paint, atlas: !paint.length, key: paint.length || spec.paint === false ? null : paintKey(scene), hasWheels: nWheels > 0, slot, spec };
}

function collectPaint(scene, spec) {
  const paint = [];
  scene.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) if (spec.paint !== false && PAINTABLE.test(m.name || '') && !paint.includes(m)) paint.push(m); });
  return paint;
}

// A building template: turned to +z, footprint fitted into the 13 m lot,
// standing on the ground. Height follows the model (uniform scale).
function prepBuilding(scene, spec, low) {
  const root = new THREE.Group(); root.name = 'kit-building';
  const inner = new THREE.Group(); inner.rotation.y = THREE.MathUtils.degToRad(spec.yaw || 0); inner.add(scene); root.add(inner);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root, true), size = box.getSize(new THREE.Vector3());
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
  else if (T.atlas) model.traverse((o) => {
    // single-texture (atlas) models: per-pixel finish, plus the car's paint when it has a body hue
    if (!o.isMesh) return;
    const swap = (m) => (m.map ? finishMaterial(m, T.key, T.key ? paintHex : null) : m);
    o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
  });
  const wheels = []; for (const c of model.children) if (c.name === 'wheel') wheels.push({ node: c, front: c.position.z > 0 });
  return { model, wheels };
}

// Repaint for models whose paint is baked into one texture (AI-made cars, atlases): the body's
// dominant hue is found once per model, and each car's material repaints only pixels near that
// hue, keeping their shading. Glass, tires, chrome and lamps (other hues or grays) are untouched.
// White, gray or black bodies have no hue to key on, so those models keep their own color.
function paintKey(scene) {
  let map = null; scene.traverse((o) => { if (!map && o.isMesh) for (const m of [].concat(o.material)) if (m.map && m.map.image) { map = m.map; break; } });
  if (!map || typeof document === 'undefined') return null;
  const N = 128, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  try { ctx.drawImage(map.image, 0, 0, N, N); } catch (e) { return null; }
  const px = ctx.getImageData(0, 0, N, N).data, bins = new Array(36).fill(0), sum = [];
  let lit = 0, sat = 0; const c = new THREE.Color(), hsl = {};
  const hsv = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0; if (d > 1e-6) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [((h / 6) + 1) % 1, mx > 0 ? d / mx : 0, mx]; };
  for (let i = 0; i < px.length; i += 4) {
    const [h, s, v] = hsv(px[i] / 255, px[i + 1] / 255, px[i + 2] / 255);
    if (v < 0.12) continue; lit++;
    if (s < 0.25) continue; sat++;
    const k = Math.floor(h * 36) % 36; bins[k]++; (sum[k] ||= []).push([px[i], px[i + 1], px[i + 2]]);
  }
  if (!lit || sat / lit < 0.05) return null;
  let best = 0; for (let k = 0; k < 36; k++) if (bins[k] + bins[(k + 1) % 36] + bins[(k + 35) % 36] > bins[best] + bins[(best + 1) % 36] + bins[(best + 35) % 36]) best = k;
  const pick = [].concat(sum[best] || [], sum[(best + 1) % 36] || [], sum[(best + 35) % 36] || []);
  const avg = pick.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]).map((v) => v / pick.length / 255);
  c.setRGB(avg[0], avg[1], avg[2], THREE.SRGBColorSpace); // shader works in linear color
  return hsv(c.r, c.g, c.b);
}
// Finish pass for atlas models (AI-made cars bake everything into one texture with one flat,
// rough finish, which reads as clay). Each pixel is sorted by its own color:
// - body: near the body hue -> glossy paint (and repainted to the car's color when one is given)
// - glass: dark, unsaturated -> darker, near-mirror, reflects the sky
// - chrome: bright, unsaturated, only on colored-body cars -> polished metal
//   (a white or silver body would otherwise turn to mirror, so keyless models skip chrome)
// Everything else keeps the model's own roughness and metalness.
const finished = new Map();
function hsvOfColor(col) { const r = col.r, g = col.g, b = col.b, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0; if (d > 1e-6) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [((h / 6) + 1) % 1, mx > 0 ? d / mx : 0, mx]; }
function finishMaterial(m, key, paintHex) {
  const id = m.uuid + ':' + (key ? 'k' : 'n') + ':' + (paintHex == null ? '-' : paintHex); let t = finished.get(id); if (t) return t;
  const uKey = { value: new THREE.Vector3(...(key || [0, 0, 1])) };
  const uPaint = { value: new THREE.Vector3(...(paintHex == null ? (key || [0, 0, 1]) : hsvOfColor(new THREE.Color(paintHex)))) };
  const uMode = { value: new THREE.Vector2(key ? 1 : 0, paintHex == null ? 0 : 1) }; // x: has body hue (paint gloss + chrome), y: repaint
  t = m.clone(); t.envMapIntensity = 1.0;
  t.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uKey, uPaint, uMode });
    sh.fragmentShader = 'uniform vec3 uKey;\nuniform vec3 uPaint;\nuniform vec2 uMode;\n' +
      'vec3 kRgb2Hsv(vec3 c){vec4 K=vec4(0.,-1./3.,2./3.,-1.);vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g));vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r));float d=q.x-min(q.w,q.y);float e=1e-10;return vec3(abs(q.z+(q.w-q.y)/(6.*d+e)),d/(q.x+e),q.x);}\n' +
      'vec3 kHsv2Rgb(vec3 c){vec4 K=vec4(1.,2./3.,1./3.,3.);vec3 p=abs(fract(c.xxx+K.xyz)*6.-K.www);return c.z*mix(K.xxx,clamp(p-K.xxx,0.,1.),c.y);}\n' +
      sh.fragmentShader
        .replace('#include <map_fragment>', `#include <map_fragment>
          vec3 kHv = kRgb2Hsv(diffuseColor.rgb);
          float kDh = abs(kHv.x - uKey.x); kDh = min(kDh, 1.0 - kDh);
          float kBody = uMode.x * (1.0 - smoothstep(0.035, 0.065, kDh)) * smoothstep(0.10, 0.22, kHv.y);
          float kGlass = (1.0 - smoothstep(0.25, 0.4, kHv.y)) * smoothstep(0.006, 0.014, kHv.z) * (1.0 - smoothstep(0.07, 0.11, kHv.z));
          float kChrome = uMode.x * (1.0 - smoothstep(0.10, 0.18, kHv.y)) * smoothstep(0.30, 0.45, kHv.z);
          if (uMode.y > 0.5) {
            vec3 kNh = vec3(uPaint.x, clamp(kHv.y * uPaint.y / max(uKey.y, 1e-3), 0.0, 1.0), clamp(kHv.z * uPaint.z / max(uKey.z, 1e-3), 0.0, 1.0));
            diffuseColor.rgb = mix(diffuseColor.rgb, kHsv2Rgb(kNh), kBody);
          }
          diffuseColor.rgb *= 1.0 - 0.45 * kGlass;`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, 0.32, kBody * 0.9);
          roughnessFactor = mix(roughnessFactor, 0.06, kGlass);
          roughnessFactor = mix(roughnessFactor, 0.18, kChrome);`)
        .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
          metalnessFactor = mix(metalnessFactor, 0.0, max(kBody, kGlass));
          metalnessFactor = mix(metalnessFactor, 1.0, kChrome);`);
  };
  t.customProgramCacheKey = () => 'kit-finish';
  finished.set(id, t); return t;
}

export function placeKitBuilding(T) { return T.root.clone(true); }

// A character template: the file's scene under a yaw turn. Scaling, the feet on the ground and
// the retargeted clips are done in src/chars.js, which has the game rig to retarget from.
function prepCharacter(scene, spec, low) {
  let skinned = 0; scene.traverse((o) => { if (o.isSkinnedMesh) skinned++; });
  if (!skinned) { console.warn('kit character has no skeleton, skipped:', spec.file); return null; }
  const root = new THREE.Group(); root.name = 'kit-character'; root.rotation.y = THREE.MathUtils.degToRad(spec.yaw || 0); root.add(scene);
  root.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; if (low) for (const m of [].concat(o.material)) { m.normalMap = null; m.needsUpdate = true; } } });
  return { root, spec };
}
