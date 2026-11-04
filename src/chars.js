// Rigged humanoids from Quaternius' Universal Animation Library (CC0).
// One GLB is loaded and cloned; crew clothing is painted in the shader by
// height on the bind pose, so every crew shares one geometry and one rig.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

let template = null, clips = {}, bounds = null;
const matCache = new Map();

export async function loadCharacters(url) {
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(url);
  template = gltf.scene;
  for (const c of gltf.animations) clips[c.name] = c;
  template.traverse((o) => { if (o.isSkinnedMesh && o.material.name === 'M_Main') { o.geometry.computeBoundingBox(); bounds = o.geometry.boundingBox; } });
  // normalize height to about 1.8 m
  const box = new THREE.Box3().setFromObject(template); const h = box.max.y - box.min.y;
  template.userData.scale = 1.8 / h;
}

function clothMat(shirt, pants, cap, skin) {
  const k = [shirt, pants, cap, skin].join('_');
  if (matCache.has(k)) return matCache.get(k);
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0 });
  const u = { uShirt: { value: new THREE.Color(shirt) }, uPants: { value: new THREE.Color(pants) }, uCap: { value: new THREE.Color(cap) }, uSkin: { value: new THREE.Color(skin) }, uMin: { value: bounds.min.clone() }, uMax: { value: bounds.max.clone() } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vBind;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvBind = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vBind; uniform vec3 uShirt, uPants, uCap, uSkin, uMin, uMax;`).replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
vec3 n = (vBind - uMin) / (uMax - uMin);
float ax = abs(n.x - 0.5) * 2.0;
vec3 col = uPants;
if (n.y < 0.05) col = vec3(0.06);
else if (n.y > 0.47) col = uShirt;
if (n.y > 0.47 && ax > 0.55) col = uSkin;
if (n.y > 0.47 && ax > 0.24 && ax <= 0.55) col = uShirt * 0.92;
if (n.y > 0.83) col = uSkin;
if (n.y > 0.955) col = uCap;
vec4 diffuseColor = vec4( col, opacity );`);
  };
  m.customProgramCacheKey = () => 'cloth';
  matCache.set(k, m); return m;
}
const jointMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 });
const SKINS = [0x8d5a3b, 0x5a3825, 0xc49272, 0x3e2a1e, 0xa8714d];

export function makeCharacter(look) {
  const root = skeletonClone(template);
  const s = template.userData.scale; root.scale.setScalar(s);
  const skin = look.skin ?? SKINS[Math.floor(Math.random() * SKINS.length)];
  const mat = clothMat(look.shirt, look.pants, look.cap ?? look.shirt, skin);
  root.traverse((o) => {
    if (o.isSkinnedMesh) { o.material = o.material.name === 'M_Main' ? mat : jointMat; o.castShadow = !!look.shadow; o.frustumCulled = false; }
  });
  const g = new THREE.Group(); g.add(root);
  const mixer = new THREE.AnimationMixer(root);
  const act = {};
  for (const n in clips) act[n] = mixer.clipAction(clips[n]);
  for (const n of ['Punch_Jab', 'Punch_Cross', 'Death01', 'Hit_Chest']) { act[n].setLoop(THREE.LoopOnce, 1); act[n].clampWhenFinished = true; }
  act.Idle_Loop.play();
  g.userData = { mixer, act, cur: 'Idle_Loop', root };
  return g;
}

// Pick and blend an animation from simple entity state.
export function animate(g, e, dt, step) {
  const u = g.userData;
  let want;
  if (e.hp <= 0) want = 'Death01';
  else if (e.swing > 0) want = e.combo ? 'Punch_Cross' : 'Punch_Jab';
  else if (e.hitT > 0.05) want = 'Hit_Chest';
  else if (e.moving > 1.3) want = 'Sprint_Loop';
  else if (e.moving > 0.62) want = 'Jog_Fwd_Loop';
  else if (e.moving > 0.05) want = 'Walk_Loop';
  else want = 'Idle_Loop';
  const swingStart = e.swing > 0 && (u.lastSwing ?? 0) <= 0;
  u.lastSwing = e.swing;
  if (want !== u.cur || swingStart) {
    const next = u.act[want], prev = u.act[u.cur];
    next.reset(); next.enabled = true;
    if (want.startsWith('Punch')) next.timeScale = 2.4; else if (want === 'Hit_Chest') next.timeScale = 1.6; else next.timeScale = 1;
    next.play();
    if (prev !== next) prev.crossFadeTo(next, want === 'Death01' ? 0.12 : 0.15, false);
    u.cur = want;
  }
  if (want === 'Walk_Loop') u.act.Walk_Loop.timeScale = Math.max(0.6, e.moving * 1.5);
  if (step) u.mixer.update(dt);
}
