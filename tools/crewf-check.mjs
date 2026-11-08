// crew-f-1 is an 86-joint rig. Name matching is not enough: helper bones sit
// between the thigh and the knee, and between the knee and the foot.
// Run: node tools/crewf-check.mjs
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { retarget, restPose } from '../src/retarget.js';
import { gripForFile } from '../src/grip.js';
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
const people = await load('public/models/se-pack/people.glb');
const clips = {};
for (const c of people.animations) {
  c.tracks = c.tracks.filter((t) => !t.name.endsWith('.scale') && (!t.name.endsWith('.position') || t.name.startsWith('pelvis.')));
  clips[c.name] = c;
}
const CLIPS = ['Idle_Loop', 'Idle_Talking_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Punch_Jab', 'Punch_Cross', 'Sword_Attack', 'Pistol_Idle_Loop', 'Pistol_Shoot', 'Death01', 'Hit_Chest', 'Hit_Head', 'Roll', 'Jump_Start', 'Jump_Loop', 'Driving_Loop', 'Sitting_Idle_Loop'];

const gltf = await load('public/models/kit/characters/crew-f-1.glb');
const tgt = new THREE.Group(); tgt.add(gltf.scene);
let mesh = null;
tgt.traverse((o) => { if (o.isSkinnedMesh && (!mesh || o.geometry.attributes.position.count > mesh.geometry.attributes.position.count)) mesh = o; });
const bones = mesh.skeleton.bones;
if (bones.length !== 86) fail('crew-f-1 joint count ' + bones.length);
const helpers = bones.filter((b) => /^Bone_/.test(b.name));
if (helpers.length !== 20) fail('crew-f-1 helper count ' + helpers.length);
const parentName = (b) => (b.parent && b.parent.name) || '';
const byEnd = (suffix) => bones.find((b) => b.name.endsWith(suffix));
const expectParent = [
  ['LeftLeg', 'Bone_004'],
  ['RightLeg', 'Bone_002'],
  ['LeftFoot', 'Bone_016'],
  ['RightFoot', 'Bone_012'],
];
for (const [bone, parent] of expectParent) {
  const b = byEnd(bone);
  if (!b || parentName(b) !== parent) fail(`${bone} parent is ${b && parentName(b)}, want ${parent}`);
}
const box = new THREE.Box3().setFromObject(tgt, true);
const h = box.max.y - box.min.y;
console.log('world', { h: +h.toFixed(3), feet: +box.min.y.toFixed(4) });
if (h < 1.66 || h > 1.7 || box.min.y > 0.02 || box.min.y < -0.02) fail('crew-f-1 world bounds are not 1.68 m with the feet at 0');

const src = skeletonClone(people.scene); src.scale.setScalar(1); src.position.set(0, 0, 0);
const r = retarget(src, Object.values(clips), tgt);
if (r.missing.length) fail('missing named bones ' + r.missing.join(','));
for (const n of CLIPS) {
  const clip = r.clips[n];
  if (!clip) { fail('missing clip ' + n); continue; }
  const extra = clip.tracks.filter((t) => /^Bone_/.test(t.name.split('.')[0]));
  if (extra.length) fail(n + ' animates a helper bone');
}
const segs = [['thigh_l', 'calf_l'], ['calf_l', 'foot_l'], ['thigh_r', 'calf_r'], ['calf_r', 'foot_r'], ['upperarm_r', 'lowerarm_r'], ['lowerarm_r', 'hand_r']];
const wp = (b) => b.getWorldPosition(new THREE.Vector3());
restPose(tgt, mesh); tgt.updateMatrixWorld(true);
const restLen = {};
for (const [a, b] of segs) restLen[a + b] = wp(r.bones.get(a)).distanceTo(wp(r.bones.get(b)));
const restQ = new Map(helpers.map((b) => [b, b.quaternion.clone()]));
const mixer = new THREE.AnimationMixer(tgt);
let worst = 0, worstHelper = 0;
for (const n of CLIPS) {
  mixer.stopAllAction();
  restPose(tgt, mesh);
  const act = mixer.clipAction(r.clips[n]); act.play();
  for (let i = 0; i < 6; i++) {
    mixer.setTime(r.clips[n].duration * i / 5);
    tgt.updateMatrixWorld(true);
    for (const [a, b] of segs) {
      const d = Math.abs(wp(r.bones.get(a)).distanceTo(wp(r.bones.get(b))) - restLen[a + b]);
      if (d > worst) worst = d;
    }
    for (const h of helpers) {
      const ang = h.quaternion.angleTo(restQ.get(h));
      if (ang > worstHelper) worstHelper = ang;
    }
  }
}
console.log('limb drift m', +worst.toFixed(5), 'helper deg', +(worstHelper * 180 / Math.PI).toFixed(3));
if (worst > 0.001) fail('a limb segment changed length');
if (worstHelper > 1 * Math.PI / 180) fail('a helper bone left its bind rotation');

const hs = r.hand.bone.getWorldScale(new THREE.Vector3()).x;
const scale = 1 / (hs * (1.68 / h));
const frame = (hand) => hand && { bone: hand.bone, quat: hand.quat, scale };
const measured = measureGrip(tgt, { r: frame(r.hand), l: frame(r.handL) }, GRIP);
const grip = gripForFile('characters/crew-f-1.glb', measured);
if (!grip || grip.kind !== 'unsolved') fail('crew-f-1 grip must stay unsolved');
if (gripForFile('characters/crew-m-1.glb', measured).kind === 'unsolved') fail('crew-m-1 must keep its curl');
const pool = [
  { spec: { file: 'characters/crew-m-1.glb', gender: 'm' } },
  { spec: { file: 'characters/crew-m-2.glb', gender: 'm' } },
  { spec: { file: 'characters/crew-f-1.glb', gender: 'f' } },
];
const men = [0, 1, 2, 4].map((s) => pickCharacter(pool, s, 'm').spec.file);
const woman = pickCharacter(pool, 3, 'f').spec.file;
console.log('men', men.join(','), 'woman', woman);
if (new Set(men).size !== 2 || men.includes('characters/crew-f-1.glb')) fail('crew men must stay on the two male files');
if (woman !== 'characters/crew-f-1.glb') fail('a crew woman must load crew-f-1');
if (!process.exitCode) console.log('crew-f-1 check ok');
