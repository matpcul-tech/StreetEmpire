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
if (reds.grip && reds.grip.kind !== 'mesh') fail('reds must not invent finger bones');
if (!reds.grip) console.log('reds hands left as imported: no curl kept its triangles');
else {
  if (!reds.grip.report.r || reds.grip.report.r.stretch > 1.35) fail('reds right hand still stretches a triangle');
  if (!reds.grip.report.l || reds.grip.report.l.stretch > 1.35) fail('reds left hand still stretches a triangle');
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

const gold = await prep('public/models/kit/characters/golds-m-1.glb');
console.log('gold', gold.grip && gold.grip.kind, JSON.stringify(gold.grip && gold.grip.report));
if (gold.r.missing.length) fail('gold missing bones ' + gold.r.missing.join(','));
for (const n of CLIPS) if (!gold.r.clips[n]) fail('gold missing clip ' + n);
if (!gold.grip || gold.grip.kind !== 'bones') fail('gold has named finger bones and should curl those');
else {
  const open = middleTip(gold.tgt);
  applyGrip(gold.tgt, gold.grip, 1);
  gold.tgt.updateMatrixWorld(true);
  const shut = middleTip(gold.tgt);
  const openD = open.tip.distanceTo(open.hand), shutD = shut.tip.distanceTo(shut.hand);
  console.log('gold middle tip to wrist', { open: +openD.toFixed(3), shut: +shutD.toFixed(3) });
  if (shutD > openD - 0.012) fail('gold fist does not bring the middle finger toward the wrist');
}
const namesOf = async (file) => (await io.read(file)).getRoot().listSkins()[0].listJoints().map((j) => j.getName());
const goldNames = await namesOf('public/models/kit/characters/golds-m-1.glb');
const orangeNames = await namesOf('public/models/kit/characters/player.glb');
const blueNames = await namesOf('public/models/kit/characters/blues-m-1.glb');
const nDiff = (a, b) => a.filter((n, i) => b[i] !== n).length;
const vsOrange = nDiff(goldNames, orangeNames), vsBlue = nDiff(goldNames, blueNames);
console.log('gold joint index diffs', { vsOrange, vsBlue });
if (vsOrange !== 16 || vsBlue !== 32) fail('gold joint order must differ by name position, not be copied');
if (!goldNames.every((n) => orangeNames.includes(n))) fail('gold joint names must match the orange set');
const goldMan = pickCharacter([{ spec: { file: 'golds-m-1.glb', gender: 'm' } }], 0, 'm');
const goldWoman = pickCharacter([{ spec: { file: 'golds-m-1.glb', gender: 'm' } }], 0, 'f');
if (!goldMan || goldMan.spec.file !== 'golds-m-1.glb') fail('a Gold Line man must load golds-m-1');
if (goldWoman) fail('a Gold Line woman must keep the painted body until golds-f-1 exists');
const goldBox = new THREE.Box3().setFromObject(gold.tgt, true);
const goldH = goldBox.max.y - goldBox.min.y;
console.log('gold measured height', +goldH.toFixed(3), 'feet', +goldBox.min.y.toFixed(3));
if (goldH < 1.85 || goldH > 1.95) fail('gold file bounds are not the measured 1.9 m body');
const hipDoc = await io.read('public/models/kit/characters/golds-m-1.glb');
const hipJoints = hipDoc.getRoot().listSkins()[0].listJoints();
const hipI = hipJoints.findIndex((j) => /hips/i.test(j.getName()));
const hipM = hipDoc.getRoot().listSkins()[0].getInverseBindMatrices().getElement(hipI, []);
const hipLen = Math.hypot(hipM[12], hipM[13], hipM[14]);
console.log('gold hip bind', +hipLen.toFixed(4));
if (hipLen < 0.5) fail('gold hip bind collapsed');

const unc = await prep('public/models/kit/characters/unc.glb');
console.log('unc', unc.grip && unc.grip.kind);
if (unc.r.missing.length) fail('unc missing bones ' + unc.r.missing.join(','));
for (const n of CLIPS) if (!unc.r.clips[n]) fail('unc missing clip ' + n);
if (!unc.grip || unc.grip.kind !== 'bones') fail('unc has named finger bones and should curl those');
else {
  const open = middleTip(unc.tgt);
  applyGrip(unc.tgt, unc.grip, 1);
  unc.tgt.updateMatrixWorld(true);
  const shut = middleTip(unc.tgt);
  const openD = open.tip.distanceTo(open.hand), shutD = shut.tip.distanceTo(shut.hand);
  console.log('unc middle tip to wrist', { open: +openD.toFixed(3), shut: +shutD.toFixed(3) });
  if (shutD > openD - 0.012) fail('unc fist does not bring the middle finger toward the wrist');
}
const uncNames = await namesOf('public/models/kit/characters/unc.glb');
const uncVsOrange = nDiff(uncNames, orangeNames), uncVsBlue = nDiff(uncNames, blueNames);
console.log('unc joint index diffs', { vsOrange: uncVsOrange, vsBlue: uncVsBlue });
if (uncVsOrange !== 0 || uncVsBlue !== 16) fail('unc joint order should match orange and differ from blue');
const uncBox = new THREE.Box3().setFromObject(unc.tgt, true);
const uncH = uncBox.max.y - uncBox.min.y;
console.log('unc measured height', +uncH.toFixed(3), 'feet', +uncBox.min.y.toFixed(3));
if (uncH < 1.72 || uncH > 1.8 || uncBox.min.y > 0.02) fail('unc world bounds are not the measured 1.76 m body with feet at 0');
const uncHip = await io.read('public/models/kit/characters/unc.glb');
const uncJoints = uncHip.getRoot().listSkins()[0].listJoints();
const uncI = uncJoints.findIndex((j) => /hips/i.test(j.getName()));
const uncM = uncHip.getRoot().listSkins()[0].getInverseBindMatrices().getElement(uncI, []);
const uncHipLen = Math.hypot(uncM[12], uncM[13], uncM[14]);
console.log('unc hip bind', +uncHipLen.toFixed(4));
if (uncHipLen < 0.5) fail('unc hip bind collapsed');
if (!reds.grip) console.log('reds grip still unused');

const crew = await prep('public/models/kit/characters/crew-m-1.glb');
console.log('crew', crew.grip && crew.grip.kind);
if (crew.r.missing.length) fail('crew missing bones ' + crew.r.missing.join(','));
for (const n of CLIPS) if (!crew.r.clips[n]) fail('crew missing clip ' + n);
if (!crew.grip || crew.grip.kind !== 'bones') fail('crew has named finger bones and should curl those');
else {
  const open = middleTip(crew.tgt);
  applyGrip(crew.tgt, crew.grip, 1);
  crew.tgt.updateMatrixWorld(true);
  const shut = middleTip(crew.tgt);
  const openD = open.tip.distanceTo(open.hand), shutD = shut.tip.distanceTo(shut.hand);
  console.log('crew middle tip to wrist', { open: +openD.toFixed(3), shut: +shutD.toFixed(3) });
  if (shutD > openD - 0.012) fail('crew fist does not bring the middle finger toward the wrist');
}
const crewNames = await namesOf('public/models/kit/characters/crew-m-1.glb');
const crewVsOrange = nDiff(crewNames, orangeNames), crewVsBlue = nDiff(crewNames, blueNames);
console.log('crew joint index diffs', { vsOrange: crewVsOrange, vsBlue: crewVsBlue });
if (crewVsOrange !== 0 || crewVsBlue !== 16) fail('crew joint order should match orange and differ from blue');
const crewMan = pickCharacter([{ spec: { file: 'crew-m-1.glb', gender: 'm' } }, { spec: { file: 'crew-f-1.glb', gender: 'f' } }], 0, 'm');
const crewWoman = pickCharacter([{ spec: { file: 'crew-m-1.glb', gender: 'm' } }], 0, 'f');
if (!crewMan || crewMan.spec.file !== 'crew-m-1.glb') fail('a crew man must load crew-m-1');
if (crewWoman) fail('a crew woman must keep the painted body until crew-f-1 exists');
const crewBox = new THREE.Box3().setFromObject(crew.tgt, true);
const crewH = crewBox.max.y - crewBox.min.y;
console.log('crew measured height', +crewH.toFixed(3), 'feet', +crewBox.min.y.toFixed(3));
if (crewH < 1.76 || crewH > 1.84 || crewBox.min.y > 0.02) fail('crew world bounds are not the measured 1.8 m body with feet at 0');
const crewHipDoc = await io.read('public/models/kit/characters/crew-m-1.glb');
const crewJoints = crewHipDoc.getRoot().listSkins()[0].listJoints();
const crewI = crewJoints.findIndex((j) => /hips/i.test(j.getName()));
const crewM = crewHipDoc.getRoot().listSkins()[0].getInverseBindMatrices().getElement(crewI, []);
const crewHip = Math.hypot(crewM[12], crewM[13], crewM[14]);
console.log('crew hip bind', +crewHip.toFixed(4));
if (crewHip < 0.5) fail('crew hip bind collapsed');

if (!process.exitCode) console.log('grip check ok');
