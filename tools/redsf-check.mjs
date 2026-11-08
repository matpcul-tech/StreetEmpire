// reds-f-1 has 40 joints. Six Bone_* helpers are not the crew woman's helpers.
// Only the middle-finger chains exist. They stay at the imported rest.
// Run: node tools/redsf-check.mjs
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { retarget, restPose, canonical } from '../src/retarget.js';
import { gripForFile, applyGrip } from '../src/grip.js';
import { measureGrip } from '../src/grip.js';
import { GRIP } from '../src/chars.js';
import { pickCharacter } from '../src/kit.js';

globalThis.self = globalThis;
const fail = (m) => { console.error('FAIL', m); process.exitCode = 1; };
const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
const load = (file) => new Promise((res, rej) => {
  const buf = fs.readFileSync(file);
  loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', res, rej);
});
const gltf = await load('public/models/kit/characters/reds-f-1.glb');
const tgt = new THREE.Group(); tgt.add(gltf.scene);
let mesh = null;
tgt.traverse((o) => { if (o.isSkinnedMesh && (!mesh || o.geometry.attributes.position.count > mesh.geometry.attributes.position.count)) mesh = o; });
const bones = mesh.skeleton.bones;
if (bones.length !== 40) fail('joint count ' + bones.length);
const generic = bones.filter((b) => /^Bone_/.test(b.name));
if (generic.length !== 6) fail('helper count ' + generic.length);
for (const b of generic) if (canonical(b.name) != null) fail(b.name + ' was mapped by name');
const parent = (suffix) => bones.find((b) => b.name.endsWith(suffix));
const expect = [
  ['Bone_036', 'LeftHand'],
  ['Bone_037', 'RightHand'],
  ['Bone_009', 'LeftToeBase'],
  ['Bone_008', 'Bone_009'],
  ['Bone_016', 'RightToeBase'],
  ['Bone_015', 'Bone_016'],
  ['LeftLeg', 'LeftUpLeg'],
  ['LeftFoot', 'LeftLeg'],
  ['RightLeg', 'RightUpLeg'],
  ['RightFoot', 'RightLeg'],
];
for (const [bone, par] of expect) {
  const b = parent(bone);
  const got = b && b.parent && b.parent.name;
  if (!b || !got.endsWith(par)) fail(`${bone} parent ${got}, want ${par}`);
}
const fingers = bones.filter((b) => /Hand(Index|Middle|Ring|Pinky|Thumb)/.test(b.name)).map((b) => b.name);
if (fingers.length !== 8 || fingers.some((n) => !/Middle/.test(n))) fail('finger set is not middle-only: ' + fingers.join(','));
const box = new THREE.Box3().setFromObject(tgt, true);
const h = box.max.y - box.min.y;
console.log('world', { h: +h.toFixed(3), feet: +box.min.y.toFixed(4) });
if (h < 1.68 || h > 1.72 || Math.abs(box.min.y) > 0.02) fail('world bounds are not 1.70 m with the feet at 0');

const people = await load('public/models/se-pack/people.glb');
const clips = {};
for (const c of people.animations) {
  c.tracks = c.tracks.filter((t) => !t.name.endsWith('.scale') && (!t.name.endsWith('.position') || t.name.startsWith('pelvis.')));
  clips[c.name] = c;
}
const CLIPS = ['Idle_Loop', 'Idle_Talking_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Punch_Jab', 'Punch_Cross', 'Sword_Attack', 'Pistol_Idle_Loop', 'Pistol_Shoot', 'Death01', 'Hit_Chest', 'Hit_Head', 'Roll', 'Jump_Start', 'Jump_Loop', 'Driving_Loop', 'Sitting_Idle_Loop'];
const src = skeletonClone(people.scene); src.scale.setScalar(1); src.position.set(0, 0, 0);
const r = retarget(src, Object.values(clips), tgt);
if (r.missing.length) fail('missing ' + r.missing.join(','));
for (const n of CLIPS) {
  const clip = r.clips[n];
  if (!clip) { fail('missing clip ' + n); continue; }
  if (clip.tracks.some((t) => /^Bone_/.test(t.name))) fail(n + ' animates a generic bone');
}
const map = r.bones;
const segs = [['thigh_l', 'calf_l'], ['calf_l', 'foot_l'], ['upperarm_r', 'lowerarm_r'], ['lowerarm_r', 'hand_r']];
restPose(tgt, mesh); tgt.updateMatrixWorld(true);
const wp = (b) => b.getWorldPosition(new THREE.Vector3());
const restLen = {};
for (const [a, b] of segs) restLen[a + b] = wp(map.get(a)).distanceTo(wp(map.get(b)));
const mixer = new THREE.AnimationMixer(tgt);
let worst = 0;
for (const n of ['Idle_Loop', 'Sprint_Loop', 'Driving_Loop', 'Death01', 'Pistol_Idle_Loop']) {
  mixer.stopAllAction(); restPose(tgt, mesh);
  const act = mixer.clipAction(r.clips[n]); act.play(); mixer.setTime(r.clips[n].duration * 0.4);
  tgt.updateMatrixWorld(true);
  for (const [a, b] of segs) {
    const d = Math.abs(wp(map.get(a)).distanceTo(wp(map.get(b))) - restLen[a + b]);
    if (d > worst) worst = d;
  }
}
console.log('limb drift m', +worst.toFixed(5));
if (worst > 0.001) fail('a limb segment changed length');

restPose(tgt, mesh);
const hs = r.hand.bone.getWorldScale(new THREE.Vector3()).x;
const scale = 1 / (hs * (1.7 / h));
const frame = (hand) => hand && { bone: hand.bone, quat: hand.quat, scale };
const measured = measureGrip(tgt, { r: frame(r.hand), l: frame(r.handL) }, GRIP);
const grip = gripForFile('characters/reds-f-1.glb', measured, tgt);
if (!grip || grip.kind !== 'unsolved' || grip.bones.length < 8) fail('reds-f-1 must hold every middle-finger bone, not curl it');
if (grip.bones.some((b) => /Index|Thumb|Ring|Pinky|Bone_/.test(b.name))) fail('grip held a bone that is not a middle finger');
mixer.stopAllAction(); restPose(tgt, mesh);
const act = mixer.clipAction(r.clips.Pistol_Idle_Loop); act.play(); mixer.setTime(0.4);
applyGrip(tgt, grip, 0.85);
for (const b of grip.bones) {
  const bone = tgt.getObjectByName(b.name);
  if (!bone || bone.quaternion.angleTo(b.rest) > 1e-3) fail('middle finger left the imported rest: ' + b.name);
}
const pool = [
  { spec: { file: 'characters/reds-m-1.glb', gender: 'm' } },
  { spec: { file: 'characters/reds-m-2.glb', gender: 'm' } },
  { spec: { file: 'characters/reds-f-1.glb', gender: 'f' } },
];
const men = [0, 1].map((s) => pickCharacter(pool, s, 'm').spec.file);
const woman = pickCharacter(pool, 3, 'f').spec.file;
console.log('men', men.join(','), 'woman', woman);
if (men.join(',') !== 'characters/reds-m-1.glb,characters/reds-m-2.glb') fail('reds men changed');
if (woman !== 'characters/reds-f-1.glb') fail('a Red Kings woman must load reds-f-1');
if (!process.exitCode) console.log('reds-f-1 check ok');
