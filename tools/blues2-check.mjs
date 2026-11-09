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
const withWoman = pool.concat([{ spec: { file: 'characters/blues-f-1.glb', gender: 'f' } }]);
const woman = pickCharacter(withWoman, 3, 'f');
if (!woman || woman.spec.file !== 'characters/blues-f-1.glb') fail('a Blue Hand woman must load blues-f-1');
if (pickCharacter(withWoman, 0, 'm').spec.file !== 'characters/blues-m-1.glb') fail('adding the woman changed the first man');
if (pickCharacter(withWoman, 1, 'm').spec.file !== 'characters/blues-m-2.glb') fail('adding the woman changed the second man');
if (gripForFile('characters/blues-f-1.glb', { kind: 'bones', bones: [{ name: 'mixamorigRightHandMiddle1', rest: null, side: 'r' }] }).kind !== 'unsolved') fail('blues-f-1 curl must not be kept');
const hs = r.hand.bone.getWorldScale(new THREE.Vector3()).x;
const scale = 1 / (hs * (1.78 / h));
const frame = (hand) => hand && { bone: hand.bone, quat: hand.quat, scale };
const morphTry = measureGrip(tgt, { r: frame(r.hand), l: frame(r.handL) }, GRIP);
if (morphTry && morphTry.kind === 'mesh') fail('the one-sided chain must not grow a hand-mesh bend');
const goldPool = [
  { spec: { file: 'characters/golds-m-1.glb', gender: 'm' } },
  { spec: { file: 'characters/golds-m-2.glb', gender: 'm' } },
];
const goldMen = [0, 1].map((s) => pickCharacter(goldPool, s, 'm').spec.file);
if (goldMen.join(',') !== 'characters/golds-m-1.glb,characters/golds-m-2.glb') fail('gold men must alternate the two real meshes');
const goldWithWoman = goldPool.concat([{ spec: { file: 'characters/golds-f-1.glb', gender: 'f' } }]);
const goldWoman = pickCharacter(goldWithWoman, 3, 'f');
if (!goldWoman || goldWoman.spec.file !== 'characters/golds-f-1.glb') fail('a Gold Line woman must load golds-f-1');
if (pickCharacter(goldWithWoman, 0, 'm').spec.file !== 'characters/golds-m-1.glb') fail('adding the woman changed the first Gold Line man');
if (pickCharacter(goldWithWoman, 1, 'm').spec.file !== 'characters/golds-m-2.glb') fail('adding the woman changed the second Gold Line man');
if (gripForFile('characters/golds-m-2.glb', { kind: 'bones', bones: [{ name: 'a', rest: null, side: 'r' }] }).kind !== 'unsolved') fail('golds-m-2 curl must not be kept');
if (gripForFile('characters/golds-f-1.glb', { kind: 'bones', bones: [{ name: 'a', rest: null, side: 'r' }] }).kind !== 'unsolved') fail('golds-f-1 curl must not be kept');
const localPool = [
  { spec: { file: 'characters/locals-m-1.glb', gender: 'm' } },
  { spec: { file: 'characters/locals-m-2.glb', gender: 'm' } },
  { spec: { file: 'characters/locals-f-1.glb', gender: 'f' } },
];
const localSeed = (look) => (look / 2) | 0;
if (pickCharacter(localPool, localSeed(0), 'm').spec.file !== 'characters/locals-m-1.glb') fail('Locals look 0 must be the first man');
if (pickCharacter(localPool, localSeed(2), 'm').spec.file !== 'characters/locals-m-2.glb') fail('Locals look 2 must be the second man');
if (pickCharacter(localPool, localSeed(1), 'f').spec.file !== 'characters/locals-f-1.glb') fail('Locals look 1 must be the first woman');
if (pickCharacter(localPool.concat([{ spec: { file: 'characters/locals-f-2.glb', gender: 'f' } }]), localSeed(3), 'f').spec.file !== 'characters/locals-f-2.glb') fail('Locals look 3 must be the second woman');
const pedWomen = localPool.filter((t) => t.spec.gender === 'f').concat([{ spec: { file: 'characters/locals-f-2.glb', gender: 'f' } }]);
const pedWithBoth = localPool.filter((t) => t.spec.gender === 'm').concat(pedWomen);
if (pickCharacter(pedWithBoth, 4, 'f').spec.file !== 'characters/locals-f-1.glb') fail('ped look 4 must reuse locals-f-1');
if (pickCharacter(pedWithBoth, 1, 'f').spec.file !== 'characters/locals-f-2.glb') fail('ped look 1 must reuse locals-f-2');
if (pickCharacter(pedWithBoth, 0, 'm').spec.file !== 'characters/locals-m-1.glb') fail('ped look 0 must reuse locals-m-1');
if (pickCharacter(pedWithBoth, 3, 'm').spec.file !== 'characters/locals-m-2.glb') fail('ped look 3 must reuse locals-m-2');
if (gripForFile('characters/locals-m-1.glb', { kind: 'bones', bones: [{ name: 'a', rest: null, side: 'r' }] }).kind !== 'unsolved') fail('locals-m-1 curl must not be kept');
if (gripForFile('characters/locals-m-2.glb', { kind: 'bones', bones: [{ name: 'a', rest: null, side: 'r' }] }).kind !== 'unsolved') fail('locals-m-2 curl must not be kept');
if (gripForFile('characters/locals-f-1.glb', { kind: 'bones', bones: [{ name: 'a', rest: null, side: 'r' }] }).kind !== 'unsolved') fail('locals-f-1 curl must not be kept');
if (gripForFile('characters/locals-f-2.glb', { kind: 'bones', bones: [{ name: 'a', rest: null, side: 'r' }] }).kind !== 'unsolved') fail('locals-f-2 curl must not be kept');
if (gripForFile('characters/cop-m-1.glb', { kind: 'bones', bones: [{ name: 'a', rest: null, side: 'r' }] }).kind !== 'unsolved') fail('cop-m-1 curl must not be kept');
if (gripForFile('characters/cop-m-2.glb', { kind: 'bones', bones: [{ name: 'a', rest: null, side: 'r' }] }).kind !== 'unsolved') fail('cop-m-2 curl must not be kept');
const copPool = [
  { spec: { file: 'characters/cop-m-1.glb', gender: 'm' } },
  { spec: { file: 'characters/cop-m-2.glb', gender: 'm' } },
];
if (pickCharacter(copPool, 0, 'm').spec.file !== 'characters/cop-m-1.glb') fail('cop look 0 must be cop-m-1');
if (pickCharacter(copPool, 1, 'm').spec.file !== 'characters/cop-m-2.glb') fail('cop look 1 must be cop-m-2');
const loc2 = await load('public/models/kit/characters/locals-m-2.glb');
const locRoot = new THREE.Group(); locRoot.add(loc2.scene);
let locMesh = null;
locRoot.traverse((o) => { if (o.isSkinnedMesh && (!locMesh || o.geometry.attributes.position.count > locMesh.geometry.attributes.position.count)) locMesh = o; });
const locBones = locMesh.skeleton.bones;
if (locBones.length !== 72) fail('locals-m-2 joints ' + locBones.length);
const locHelp = locBones.filter((b) => /^Bone_/.test(b.name));
if (locHelp.length !== 6) fail('locals-m-2 helpers ' + locHelp.length);
for (const b of locHelp) if (canonical(b.name) != null) fail(b.name + ' was mapped as anatomy');
const parentOf = (n) => { const b = locRoot.getObjectByName(n); return b && b.parent && b.parent.name; };
if (!/Head$/.test(parentOf('Bone_030') || '') || !/Head$/.test(parentOf('Bone_032') || '') || !/Head$/.test(parentOf('Bone_034') || '')) fail('head helper parents ' + [parentOf('Bone_030'), parentOf('Bone_032'), parentOf('Bone_034')].join(','));
if (parentOf('Bone_029') !== 'Bone_030' || parentOf('Bone_031') !== 'Bone_032' || parentOf('Bone_033') !== 'Bone_034') fail('helper chain');
const locRet = retarget(skeletonClone(people.scene), Object.values(clips), locRoot);
if (locRet.missing.length) fail('locals-m-2 missing ' + locRet.missing.join(','));
for (const n of CLIPS) {
  const clip = locRet.clips[n];
  if (!clip) { fail('locals-m-2 missing clip ' + n); continue; }
  if (clip.tracks.some((t) => /^Bone_/.test(t.name))) fail(n + ' animates a Locals helper');
}
const helpRest = new Map(locHelp.map((b) => [b.name, b.quaternion.clone()]));
const locMix = new THREE.AnimationMixer(locRoot);
let helpDrift = 0;
for (const n of ['Idle_Loop', 'Sprint_Loop', 'Pistol_Idle_Loop', 'Death01']) {
  locMix.stopAllAction();
  restPose(locRoot, locMesh);
  const act = locMix.clipAction(locRet.clips[n]); act.play();
  locMix.setTime(locRet.clips[n].duration * 0.5);
  locRoot.updateMatrixWorld(true);
  for (const b of locHelp) helpDrift = Math.max(helpDrift, b.quaternion.angleTo(helpRest.get(b.name)));
}
console.log('locals-m-2 helper drift deg', +(THREE.MathUtils.radToDeg(helpDrift)).toFixed(3));
if (helpDrift > 0.01) fail('locals-m-2 helpers left the bind');
const locF = await load('public/models/kit/characters/locals-f-1.glb');
const fRoot = new THREE.Group(); fRoot.add(locF.scene);
let fMesh = null;
fRoot.traverse((o) => { if (o.isSkinnedMesh && (!fMesh || o.geometry.attributes.position.count > fMesh.geometry.attributes.position.count)) fMesh = o; });
const fBones = fMesh.skeleton.bones;
if (fBones.length !== 74) fail('locals-f-1 joints ' + fBones.length);
const fHelp = fBones.filter((b) => /^Bone_/.test(b.name));
if (fHelp.length !== 8) fail('locals-f-1 helpers ' + fHelp.length);
for (const b of fHelp) if (canonical(b.name) != null) fail(b.name + ' was mapped as anatomy');
const fParent = (n) => { const b = fRoot.getObjectByName(n); return b && b.parent && b.parent.name; };
if (!/LeftForeArm$/.test(fParent('Bone_037') || '') || !/LeftForeArm$/.test(fParent('Bone_029') || '')) fail('left forearm helpers');
if (!/RightForeArm$/.test(fParent('Bone_033') || '') || !/RightForeArm$/.test(fParent('Bone_025') || '')) fail('right forearm helpers');
if (fParent('Bone_036') !== 'Bone_037' || fParent('Bone_028') !== 'Bone_029' || fParent('Bone_032') !== 'Bone_033' || fParent('Bone_024') !== 'Bone_025') fail('locals-f-1 helper chain');
const fRet = retarget(skeletonClone(people.scene), Object.values(clips), fRoot);
if (fRet.missing.length) fail('locals-f-1 missing ' + fRet.missing.join(','));
for (const n of CLIPS) {
  const clip = fRet.clips[n];
  if (!clip) { fail('locals-f-1 missing clip ' + n); continue; }
  if (clip.tracks.some((t) => /^Bone_/.test(t.name))) fail(n + ' animates a Locals woman helper');
}
const fRest = new Map(fHelp.map((b) => [b.name, b.quaternion.clone()]));
const fMix = new THREE.AnimationMixer(fRoot);
let fDrift = 0;
for (const n of ['Idle_Loop', 'Sprint_Loop', 'Pistol_Idle_Loop', 'Death01']) {
  fMix.stopAllAction();
  restPose(fRoot, fMesh);
  const act = fMix.clipAction(fRet.clips[n]); act.play();
  fMix.setTime(fRet.clips[n].duration * 0.5);
  fRoot.updateMatrixWorld(true);
  for (const b of fHelp) fDrift = Math.max(fDrift, b.quaternion.angleTo(fRest.get(b.name)));
}
console.log('locals-f-1 helper drift deg', +(THREE.MathUtils.radToDeg(fDrift)).toFixed(3));
if (fDrift > 0.01) fail('locals-f-1 helpers left the bind');
if (!process.exitCode) console.log('blues-m-2 check ok');
