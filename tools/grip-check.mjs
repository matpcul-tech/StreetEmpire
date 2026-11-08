// The orange player's named finger bones, and the Red Kings hand mesh, both
// close on the weapon grip. Helper bones are not treated as fingers.
// Run: node tools/grip-check.mjs
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { retarget, mapBones, restPose } from '../src/retarget.js';
import { measureGrip, applyGrip } from '../src/grip.js';
import { GRIP } from '../src/chars.js';
import { pickCharacter } from '../src/kit.js';

globalThis.self = globalThis;
const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
const load = (file) => new Promise((res, rej) => {
  const buf = fs.readFileSync(file);
  loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', res, rej);
});
const fail = (m) => { console.error('FAIL', m); process.exitCode = 1; };

const people = await load('public/models/se-pack/people.glb');
const clips = {};
for (const c of people.animations) {
  c.tracks = c.tracks.filter((t) => !t.name.endsWith('.scale') && (!t.name.endsWith('.position') || t.name.startsWith('pelvis.')));
  clips[c.name] = c;
}

async function prep(file) {
  const gltf = await load(file);
  const tgt = new THREE.Group(); tgt.add(gltf.scene);
  const src = skeletonClone(people.scene); src.scale.setScalar(1); src.position.set(0, 0, 0);
  const r = retarget(src, Object.values(clips), tgt);
  const box = new THREE.Box3().setFromObject(tgt, true);
  const k = 1.8 / Math.max(1e-6, box.max.y - box.min.y);
  const hs = r.hand.bone.getWorldScale(new THREE.Vector3()).x;
  const scale = 1 / (hs * k);
  const frame = (h) => h && { bone: h.bone, quat: h.quat, scale };
  const grip = measureGrip(tgt, { r: frame(r.hand), l: frame(r.handL) }, GRIP);
  return { tgt, r, grip, k };
}

function middleTip(root) {
  const mesh = []; root.traverse((o) => { if (o.isSkinnedMesh) mesh.push(o); });
  const map = mapBones(mesh.sort((a, b) => b.geometry.attributes.position.count - a.geometry.attributes.position.count)[0].skeleton);
  const hand = map.get('hand_r'), tip = map.get('middle_03_r');
  if (!hand || !tip) return null;
  const child = tip.children.find((c) => c.isBone) || tip;
  return { hand: hand.getWorldPosition(new THREE.Vector3()), tip: child.getWorldPosition(new THREE.Vector3()) };
}

const orange = await prep('public/models/kit/characters/player.glb');
console.log('orange', orange.grip && orange.grip.kind, JSON.stringify(orange.grip && orange.grip.report));
if (!orange.grip || orange.grip.kind !== 'bones') fail('orange should curl its own finger bones');
else if ((orange.grip.report.r.fingers || 0) < 4) fail('orange right hand did not find a curl for the fingers');
else {
  restPose(orange.tgt, orange.tgt.getObjectByProperty('isSkinnedMesh', true) || (() => { let m = null; orange.tgt.traverse((o) => { if (o.isSkinnedMesh) m = o; }); return m; })());
  orange.tgt.updateMatrixWorld(true);
  const open = middleTip(orange.tgt);
  applyGrip(orange.tgt, orange.grip, 1);
  orange.tgt.updateMatrixWorld(true);
  const shut = middleTip(orange.tgt);
  const openD = open.tip.distanceTo(open.hand), shutD = shut.tip.distanceTo(shut.hand);
  console.log('orange middle tip to wrist', { open: +openD.toFixed(3), shut: +shutD.toFixed(3) });
  if (shutD > openD - 0.012) fail('orange fist does not bring the middle finger toward the wrist');
  const names = new Set(orange.grip.bones.map((b) => b.name));
  if ([...names].some((n) => /^Bone_/.test(n))) fail('orange grip used a generic bone');
}

const reds = await prep('public/models/kit/characters/reds-m-1.glb');
console.log('reds', reds.grip && reds.grip.kind, JSON.stringify(reds.grip && reds.grip.report));
if (!reds.grip || reds.grip.kind !== 'mesh') fail('reds should curl the hand mesh, not invented finger bones');
else {
  if (!reds.grip.report.r || reds.grip.report.r.after > reds.grip.report.r.before - 0.012) fail('reds right fingertips did not reach the grip');
  let generic = 0;
  reds.tgt.traverse((o) => { if (o.isBone && /^Bone_/.test(o.name)) generic++; });
  if (generic !== 6) fail('reds helper bone count changed: ' + generic);
  const mesh = (() => { let m = null; reds.tgt.traverse((o) => { if (o.isSkinnedMesh && (!m || o.geometry.attributes.position.count > m.geometry.attributes.position.count)) m = o; }); return m; })();
  if (!mesh.morphTargetInfluences || mesh.morphTargetInfluences.length !== 1) fail('reds grip morph missing');
  const base = mesh.geometry.attributes.position, morph = mesh.geometry.morphAttributes.position[0];
  let moved = 0, max = 0;
  for (let i = 0; i < base.count; i++) {
    const d = Math.hypot(base.getX(i) - morph.getX(i), base.getY(i) - morph.getY(i), base.getZ(i) - morph.getZ(i));
    if (d > 0.002) moved++;
    if (d > max) max = d;
  }
  console.log('reds morph', { moved, max: +max.toFixed(3) });
if (moved < 80) fail('reds morph barely moves the hand');
if (max > 0.25) fail('reds morph throws vertices too far');
}

const CLIPS = ['Idle_Loop', 'Idle_Talking_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Punch_Jab', 'Punch_Cross', 'Sword_Attack', 'Pistol_Idle_Loop', 'Pistol_Shoot', 'Death01', 'Hit_Chest', 'Hit_Head', 'Roll', 'Jump_Start', 'Driving_Loop', 'Jump_Loop', 'Sitting_Idle_Loop'];
const blue = await prep('public/models/kit/characters/blues-m-1.glb');
console.log('blue', blue.grip && blue.grip.kind, JSON.stringify(blue.grip && blue.grip.report));
if (blue.r.missing.length) fail('blue missing bones ' + blue.r.missing.join(','));
for (const n of CLIPS) if (!blue.r.clips[n]) fail('blue missing clip ' + n);
if (!blue.grip || blue.grip.kind !== 'bones') fail('blue has named finger bones and should curl those, not a mesh rewrite');
else if ((blue.grip.report.r && blue.grip.report.r.fingers) < 4) fail('blue right hand did not find a finger curl');
else {
  const open = middleTip(blue.tgt);
  applyGrip(blue.tgt, blue.grip, 1);
  blue.tgt.updateMatrixWorld(true);
  const shut = middleTip(blue.tgt);
  const openD = open.tip.distanceTo(open.hand), shutD = shut.tip.distanceTo(shut.hand);
  console.log('blue middle tip to wrist', { open: +openD.toFixed(3), shut: +shutD.toFixed(3) });
  if (shutD > openD - 0.012) fail('blue fist does not bring the middle finger toward the wrist');
}
const { NodeIO } = await import('@gltf-transform/core');
const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
const { MeshoptDecoder: MD } = await import('meshoptimizer');
await MD.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MD });
const jointAt = async (file, bone) => (await io.read(file)).getRoot().listSkins()[0].listJoints().findIndex((j) => j.getName() === bone);
const thumb = 'mixamorig:RightHandThumb1';
const orangeThumb = await jointAt('public/models/kit/characters/player.glb', thumb);
const blueThumb = await jointAt('public/models/kit/characters/blues-m-1.glb', thumb);
console.log('thumb joint index in the file', { orange: orangeThumb, blue: blueThumb });
if (orangeThumb < 0 || blueThumb < 0 || orangeThumb === blueThumb) fail('blue and orange thumb joint indices should differ so retarget cannot use an index');
const men = pickCharacter([{ spec: { file: 'blues-m-1.glb', gender: 'm' } }, { spec: { file: 'blues-f-1.glb', gender: 'f' } }], 0, 'm');
const woman = pickCharacter([{ spec: { file: 'blues-m-1.glb', gender: 'm' } }], 0, 'f');
if (!men || men.spec.file !== 'blues-m-1.glb') fail('a Blue Hand man must load blues-m-1');
if (woman) fail('a Blue Hand woman must keep the painted body until blues-f-1 exists');
const box = new THREE.Box3().setFromObject(blue.tgt, true);
const measured = box.max.y - box.min.y;
console.log('blue measured height', +measured.toFixed(3));
if (measured < 1.6 || measured > 1.8) fail('blue file bounds are not the measured body');

if (!process.exitCode) console.log('grip check ok');
