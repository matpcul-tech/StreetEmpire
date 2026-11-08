// blues-m-2 has 37 joints. Bone_036 hangs off the right hand, not the left
// hand as on reds-f-1. Only the right middle-finger chain is named.
// Run: node tools/blues2-check.mjs
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { retarget, restPose, canonical } from '../src/retarget.js';
import { gripForFile, applyGrip, measureGrip } from '../src/grip.js';
import { GRIP } from '../src/chars.js';
import { pickCharacter } from '../src/kit.js';

globalThis.self = globalThis;
const fail = (m) => { console.error('FAIL', m); process.exitCode = 1; };
const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
const load = (file) => new Promise((res, rej) => {
  const buf = fs.readFileSync(file);
  loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', res, rej);
});
const gltf = await load('public/models/kit/characters/blues-m-2.glb');
const tgt = new THREE.Group(); tgt.add(gltf.scene);
let mesh = null;
tgt.traverse((o) => { if (o.isSkinnedMesh && (!mesh || o.geometry.attributes.position.count > mesh.geometry.attributes.position.count)) mesh = o; });
const bones = mesh.skeleton.bones;
if (bones.length !== 37) fail('joint count ' + bones.length);
if (mesh.geometry.morphAttributes.position) fail('a grip morph was written onto the imported mesh');
const generic = bones.filter((b) => /^Bone_/.test(b.name));
if (generic.length !== 7) fail('helper count ' + generic.length);
for (const b of generic) if (canonical(b.name) != null) fail(b.name + ' was mapped by name');
const by = (suffix) => bones.find((b) => b.name === suffix || b.name.endsWith(suffix));
const expect = [
  ['Bone_023', 'LeftForeArm'],
  ['Bone_022', 'Bone_023'],
  ['Bone_021', 'Bone_022'],
  ['Bone_020', 'Bone_021'],
  ['Bone_019', 'Bone_020'],
  ['Bone_035', 'LeftHand'],
  ['Bone_036', 'RightHand'],
  ['LeftLeg', 'LeftUpLeg'],
  ['LeftFoot', 'LeftLeg'],
  ['RightFoot', 'RightLeg'],
];
for (const [bone, par] of expect) {
  const b = by(bone);
  const got = b && b.parent && b.parent.name;
  if (!b || !String(got).endsWith(par)) fail(`${bone} parent ${got}, want ${par}`);
}
const fingers = bones.filter((b) => /Hand(Index|Middle|Ring|Pinky|Thumb)/.test(b.name)).map((b) => b.name);
if (fingers.length !== 4 || fingers.some((n) => !/RightHandMiddle/.test(n))) fail('finger set is not the right middle chain: ' + fingers.join(','));
const box = new THREE.Box3().setFromObject(tgt, true);
const h = box.max.y - box.min.y;
console.log('world', { h: +h.toFixed(3), feet: +box.min.y.toFixed(4) });
if (h < 1.76 || h > 1.8 || Math.abs(box.min.y) > 0.02) fail('world bounds are not 1.78 m with the feet at 0');

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
restPose(tgt, mesh); tgt.updateMatrixWorld(true);
const map = r.bones;
const wp = (b) => b.getWorldPosition(new THREE.Vector3());
const restLen = wp(map.get('thigh_r')).distanceTo(wp(map.get('calf_r')));
const mixer = new THREE.AnimationMixer(tgt);
let worst = 0;
for (const n of ['Idle_Loop', 'Sprint_Loop', 'Driving_Loop', 'Death01', 'Hit_Head', 'Pistol_Idle_Loop']) {
  mixer.stopAllAction(); restPose(tgt, mesh);
  const act = mixer.clipAction(r.clips[n]); act.play(); mixer.setTime(r.clips[n].duration * 0.4);
  tgt.updateMatrixWorld(true);
  const d = Math.abs(wp(map.get('thigh_r')).distanceTo(wp(map.get('calf_r'))) - restLen);
  if (d > worst) worst = d;
}
console.log('shin drift m', +worst.toFixed(5));
if (worst > 0.001) fail('the right shin changed length');
if (mesh.geometry.morphAttributes.position) fail('retarget wrote a hand morph');

restPose(tgt, mesh);
const grip = gripForFile('characters/blues-m-2.glb', null, tgt);
if (!grip || grip.kind !== 'unsolved' || grip.bones.length !== 4) fail('blues-m-2 must hold the four right middle bones');
if (grip.bones.some((b) => !/RightHandMiddle/.test(b.name))) fail('grip held a bone outside the right middle chain');
mixer.stopAllAction(); restPose(tgt, mesh);
const act = mixer.clipAction(r.clips.Pistol_Idle_Loop); act.play(); mixer.setTime(0.4);
applyGrip(tgt, grip, 0.85);
for (const b of grip.bones) {
  const bone = tgt.getObjectByName(b.name);
  if (!bone || bone.quaternion.angleTo(b.rest) > 1e-3) fail('right middle finger left the imported rest: ' + b.name);
}
const pool = [
  { spec: { file: 'characters/blues-m-1.glb', gender: 'm' } },
  { spec: { file: 'characters/blues-m-2.glb', gender: 'm' } },
];
const men = [0, 1, 2].map((s) => pickCharacter(pool, s, 'm').spec.file);
console.log('men', men.join(','));
if (men[0] !== 'characters/blues-m-1.glb' || men[1] !== 'characters/blues-m-2.glb') fail('blue men must alternate the two real meshes');
if (pickCharacter(pool, 3, 'f')) fail('a Blue Hand woman must keep the painted body');
const hs = r.hand.bone.getWorldScale(new THREE.Vector3()).x;
const scale = 1 / (hs * (1.78 / h));
const frame = (hand) => hand && { bone: hand.bone, quat: hand.quat, scale };
const morphTry = measureGrip(tgt, { r: frame(r.hand), l: frame(r.handL) }, GRIP);
if (morphTry && morphTry.kind === 'mesh') fail('the one-sided chain must not grow a hand-mesh bend');
if (!process.exitCode) console.log('blues-m-2 check ok');
