// Clothed, rigged people from Quaternius' Ultimate Animated Character Pack
// (CC0). All models share one rig, so one set of animation clips drives all.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const MODELS = ['Casual_Male', 'Casual2_Male', 'Casual3_Male', 'Casual_Female', 'Suit_Male', 'BlueSoldier_Male'];
const templates = {};
let clips = {};
const matCache = new Map();

export async function loadPeople(base, onFirst) {
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  const load = async (n) => {
    const g = await loader.loadAsync(`${base}models/people/${n}.glb`);
    const box = new THREE.Box3().setFromObject(g.scene);
    templates[n] = { scene: g.scene, scale: 1.75 / (box.max.y - box.min.y) };
    // Bone scales set in code (proportions) must not be overwritten by the
    // clips, so drop scale tracks and every translation track except the hips.
    if (g.animations.length) for (const c of g.animations) { c.tracks = c.tracks.filter((t) => !t.name.endsWith('.scale') && (!t.name.endsWith('.position') || t.name.startsWith('Hips.'))); clips[c.name] = c; }
  };
  await load('Casual_Male');
  onFirst && onFirst();
  await Promise.all(MODELS.slice(1).map(load));
}
export const ready = (n) => !!templates[n];

const SKINS = [0x8d5a3b, 0x5a3825, 0xc49272, 0x3e2a1e, 0xa8714d, 0xe0b090];
const HAIR = [0x111111, 0x2a1a10, 0x4a3020, 0x111111, 0x6a5040];
const SHIRTS = [0x555555, 0x7a2a2a, 0x2a4a7a, 0xb0a080, 0x2a5a3a, 0x6a3a6a, 0xd0d0d0, 0x8a6a2a, 0x222222];
const PANTS = [0x2a3550, 0x1a1a1a, 0x4a4030, 0x3a3a40, 0x5a5a60];

// Look: { model, colors: { MaterialName: hex } }
export function lookFor(e, CREWS) {
  const v = e.look ?? (e.id * 7);
  const skin = SKINS[v % SKINS.length], hair = HAIR[(v >> 1) % HAIR.length];
  if (e.kind === 'player') return { model: 'Casual_Male', colors: { Skin: 0x7a4a30, Shirt: 0x2f8f4a, Pants: 0x2a3550, Hair: 0x111111, Belt: 0x111111 }, acc: { cap: 0x1e6a34, back: true, neck: 0x2f8f4a } };
  if (e.kind === 'giver') return { model: 'Suit_Male', colors: { Skin: 0x5a3825, Shirt: 0xd8d0c0, Black: 0x2a2a30, Hair: 0x777777 } };
  if (e.kind === 'cop') return { model: 'BlueSoldier_Male', colors: { Skin: skin, Main: 0x1a2a55, Black: 0x111111, Grey: 0x2a2a3a, Helmet: 0x101830 } };
  if (e.kind === 'ped') {
    const m = ['Casual_Male', 'Casual2_Male', 'Casual3_Male', 'Casual_Female', 'Suit_Male'][v % 5];
    return { model: m, colors: { Skin: skin, Hair: hair, Shirt: SHIRTS[(v >> 2) % SHIRTS.length], Pants: PANTS[(v >> 3) % PANTS.length], Black: 0x222228 }, acc: v % 4 === 1 && m !== 'Suit_Male' ? { cap: SHIRTS[(v >> 4) % SHIRTS.length] } : {} };
  }
  const c = CREWS[e.crew];
  const model = e.crew === 'neutral' ? (v % 2 ? 'Casual_Female' : 'Casual3_Male') : c.model;
  // crew uniforms: a cap or a bandana in crew colors, worn a little differently per crew
  const acc = { reds: { rag: c.shirt }, blues: { neck: c.shirt, cap: 0x1a1a1a }, golds: { cap: c.shirt }, neutral: v % 3 ? {} : { cap: 0x3a3a3a } }[e.crew] || {};
  return { model, colors: { Skin: skin, Hair: hair, Shirt: c.shirt, Pants: c.pants }, acc };
}

function materialFor(base, col) {
  const key = base.name + ':' + base.uuid + ':' + (col ?? 'x');
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({ color: col ?? base.color, roughness: base.name === 'Face' ? 0.4 : 0.85, metalness: 0 });
  if (base.name === 'Skin' || base.name === 'Face') m.roughness = 0.6;
  matCache.set(key, m); return m;
}

// Caps, do-rags and neck bandanas, parented to the head and neck bones.
export const ACC = { y: 0.42, z: 0.02, r: 0.33, neckY: 0.02, neckR: 0.17 };
let accGeo = null;
const accMats = new Map();
function accMat(c) { if (!accMats.has(c)) accMats.set(c, new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 })); return accMats.get(c); }
function accessories() {
  if (accGeo) return accGeo;
  const r = ACC.r;
  const dome = new THREE.SphereGeometry(r, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2); dome.scale(1, 0.8, 1.08);
  const brim = new THREE.CylinderGeometry(r * 0.9, r * 0.9, 0.015, 12, 1, false, -Math.PI / 2, Math.PI); brim.scale(1, 1, 1.1); brim.translate(0, 0.0, r * 0.35);
  const cap = mergeGeometries([dome, brim]);
  const rag = new THREE.SphereGeometry(r * 1.03, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.55); rag.scale(1, 0.85, 1.1);
  const tail = new THREE.ConeGeometry(0.05, 0.16, 4); tail.rotateX(-Math.PI / 2 - 0.6); tail.translate(0, -0.02, -r * 1.05);
  const doRag = mergeGeometries([rag.toNonIndexed(), tail.toNonIndexed()]);
  const neck = new THREE.CylinderGeometry(ACC.neckR, ACC.neckR * 1.25, 0.12, 10, 1, true); neck.translate(0, 0, 0);
  accGeo = { cap, doRag, neck }; return accGeo;
}

// Proportions (v0.6): closer to the v0.2 look. Longer abdomen and legs and a
// smaller head, done with bone scales on the shared rig. The parent of a scaled
// spine bone is counter scaled so the arms and head do not inherit the stretch.
export const PROP = { abdomen: 1.3, thigh: 1.3, shin: 1.3, head: 0.56, arm: 1.2, height: 1.8 };
const BONE_SCALE = {
  Abdomen: [1, PROP.abdomen, 1], Torso: [1, 1 / PROP.abdomen, 1],
  'UpperLegL': [1, PROP.thigh, 1], 'UpperLegR': [1, PROP.thigh, 1],
  'LowerLegL': [1, PROP.shin / PROP.thigh, 1], 'LowerLegR': [1, PROP.shin / PROP.thigh, 1],
  Head: [PROP.head, PROP.head, PROP.head],
  UpperArmL: [1, PROP.arm, 1], UpperArmR: [1, PROP.arm, 1],
};
const fitCache = {};
// measure the posed, reproportioned mesh once per model: lift the feet to the
// ground and scale the whole figure to PROP.height
function fit(model, root, mixer, act) {
  if (fitCache[model]) return fitCache[model];
  act.Idle.play(); mixer.update(0); root.updateMatrixWorld(true);
  let lo = 1e9, hi = -1e9; const v = new THREE.Vector3();
  root.traverse((o) => { if (!o.isSkinnedMesh) return; const n = o.geometry.attributes.position.count; for (let i = 0; i < n; i += 5) { o.getVertexPosition(i, v); o.localToWorld(v); lo = Math.min(lo, v.y); hi = Math.max(hi, v.y); } });
  const k = PROP.height / (hi - lo);
  return (fitCache[model] = { k, lift: -lo * k });
}

// Guard pose for blocking: fixed local rotations for both arms, blended in
// over the current animation. Values sampled from the punch clip (see v0.6 notes).
export const GUARD = {};
function guardBones(root) { const b = {}; root.traverse((o) => { if (o.isBone && /^(UpperArm|LowerArm|Fist)[LR]$/.test(o.name)) b[o.name] = o; }); return b; }

// Simple weapons parented to the right fist bone.
let weaponGeo = null;
function weapons() {
  if (weaponGeo) return weaponGeo;
  const bat = new THREE.CylinderGeometry(0.035, 0.06, 0.85, 8); bat.translate(0, 0.38, 0);
  const pistol = new THREE.BoxGeometry(0.05, 0.12, 0.22); pistol.translate(0, 0.02, 0.06);
  weaponGeo = { bat, pistol, batMat: new THREE.MeshStandardMaterial({ color: 0x8a5a30, roughness: 0.6 }), gunMat: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.7 }) };
  return weaponGeo;
}

export function makeCharacter(look, shadow) {
  const T = templates[look.model] || templates.Casual_Male;
  const root = skeletonClone(T.scene);
  root.scale.setScalar(T.scale);
  let hand = null, head = null, neckB = null;
  root.traverse((o) => {
    if (o.isSkinnedMesh || o.isMesh) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const out = mats.map((m) => materialFor(m, look.colors[m.name]));
      o.material = Array.isArray(o.material) ? out : out[0];
      o.castShadow = !!shadow; o.frustumCulled = false;
    }
    if (o.isBone && BONE_SCALE[o.name]) o.scale.set(...BONE_SCALE[o.name]);
    if (o.isBone && o.name === 'FistR') hand = o;
    if (o.isBone && o.name === 'Head') head = o;
    if (o.isBone && o.name === 'Neck') neckB = o;
  });
  const W = weapons();
  const bat = new THREE.Mesh(W.bat, W.batMat), gun = new THREE.Mesh(W.pistol, W.gunMat);
  bat.visible = gun.visible = false;
  if (hand) { const s = 1 / T.scale; bat.scale.setScalar(s); gun.scale.setScalar(s); bat.rotation.x = Math.PI / 2; hand.add(bat, gun); }
  const A = look.acc || {}, AG = accessories(), si = 1 / T.scale;
  if (head && (A.cap || A.rag)) {
    const m = new THREE.Mesh(A.rag ? AG.doRag : AG.cap, accMat(A.rag || A.cap)); m.scale.setScalar(si); m.position.set(0, ACC.y * si, ACC.z * si);
    if (A.back) m.rotation.y = Math.PI; m.castShadow = !!shadow; head.add(m);
  }
  if (neckB && A.neck) { const m = new THREE.Mesh(AG.neck, accMat(A.neck)); m.scale.setScalar(si); m.position.y = ACC.neckY * si; neckB.add(m); }
  const g = new THREE.Group(); g.add(root);
  const mixer = new THREE.AnimationMixer(root);
  const act = {};
  for (const n in clips) act[n] = mixer.clipAction(clips[n]);
  for (const n of ['Punch', 'SwordSlash', 'Shoot_OneHanded', 'Death', 'RecieveHit', 'Jump', 'SitDown']) if (act[n]) { act[n].setLoop(THREE.LoopOnce, 1); act[n].clampWhenFinished = true; }
  // fit the reproportioned body: unit scale first, measure, then apply
  const base = root.scale.x; root.scale.setScalar(1);
  const f = fit(look.model, root, mixer, act);
  root.scale.setScalar(f.k); root.position.y = f.lift;
  for (const o of [...(hand ? hand.children : []), ...(head ? head.children : []), ...(neckB ? neckB.children : [])].filter((o) => o.isMesh)) o.scale.multiplyScalar(base / f.k);
  for (const o of head ? head.children : []) if (o.isMesh) o.position.multiplyScalar(base / f.k);
  if (neckB) for (const o of neckB.children) if (o.isMesh) o.position.multiplyScalar(base / f.k);
  act.Idle.play();
  g.userData = { mixer, act, cur: 'Idle', root, bat, gun, arms: guardBones(root) };
  return g;
}

export function animate(g, e, dt, sitting) {
  const u = g.userData;
  let want, speed = 1;
  if (sitting) want = 'SitDown';
  else if (e.block && e.hp > 0) want = 'Guard';
  else if (e.hp <= 0) want = 'Death';
  else if (e.swing > 0) { want = e.weapon === 'pistol' ? 'Shoot_OneHanded' : e.weapon === 'bat' ? 'SwordSlash' : 'Punch'; }
  else if (e.hitT > 0.05) want = 'RecieveHit';
  else if (e.jumpT > 0) want = 'Jump';
  else if (e.moving > 0.62) { want = 'Run'; speed = 0.8 + e.moving * 0.25; }
  else if (e.moving > 0.05) { want = 'Walk'; speed = Math.max(0.7, e.moving * 2.4); }
  else want = 'Idle';
  const swingStart = e.swing > 0 && (u.lastSwing ?? 0) <= 0;
  u.lastSwing = e.swing;
  if (want !== u.cur || swingStart) {
    const next = want === 'Guard' ? (u.act.Guard ||= u.mixer.clipAction(u.act.Punch.getClip().clone())) : u.act[want] || u.act.Idle, prev = u.cur === 'Guard' ? u.act.Guard : u.act[u.cur];
    next.reset(); next.enabled = true;
    if (want === 'Punch' || want === 'SwordSlash' || want === 'Shoot_OneHanded') next.timeScale = next.getClip().duration / Math.max(0.25, (e.swing || 0.3) + 0.15);
    else if (want === 'RecieveHit') next.timeScale = 1.6;
    else if (want === 'SitDown') { next.time = next.getClip().duration; next.timeScale = 1; }
    else if (want === 'Guard') { next.time = 0; next.timeScale = 0; } // boxing guard: first frame of the punch clip, fists up by the chin
    else next.timeScale = 1;
    next.play();
    if (prev && prev !== next) prev.crossFadeTo(next, 0.12, false);
    u.cur = want;
  }
  if (want === 'Run' || want === 'Walk') u.act[want].timeScale = speed;
  u.bat.visible = e.weapon === 'bat'; u.gun.visible = e.weapon === 'pistol';
  u.mixer.update(dt);
}
