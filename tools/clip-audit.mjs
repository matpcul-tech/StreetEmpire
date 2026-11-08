// Samples all 18 game clips on the installed orange player and on the old
// Quaternius body. Flags collapsed limb bones, a hip that does not track the
// source motion, a flipped wrist, and a mesh that blows up or shrinks away.
// Run: node tools/clip-audit.mjs
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { retarget, mapBones } from '../src/retarget.js';

globalThis.self = globalThis;
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const modelPath = path.resolve(root, process.argv[2] || 'public/models/kit/characters/player.glb');
const CLIPS = ['Idle_Loop', 'Idle_Talking_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Punch_Jab', 'Punch_Cross', 'Sword_Attack', 'Pistol_Idle_Loop', 'Pistol_Shoot', 'Death01', 'Hit_Chest', 'Hit_Head', 'Roll', 'Jump_Start', 'Jump_Loop', 'Driving_Loop', 'Sitting_Idle_Loop'];
const LOOPS = new Set(['Idle_Loop', 'Idle_Talking_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Pistol_Idle_Loop', 'Jump_Loop', 'Driving_Loop', 'Sitting_Idle_Loop']);
const LINKS = [['clavicle_r', 'upperarm_r'], ['upperarm_r', 'lowerarm_r'], ['lowerarm_r', 'hand_r'], ['hand_r', 'middle_01_r'], ['thigh_r', 'calf_r'], ['calf_r', 'foot_r'], ['clavicle_l', 'upperarm_l'], ['upperarm_l', 'lowerarm_l'], ['lowerarm_l', 'hand_l'], ['thigh_l', 'calf_l'], ['calf_l', 'foot_l']];
const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
const load = (file) => new Promise((res, rej) => { const buf = fs.readFileSync(file); loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', res, rej); });
const people = await load(path.join(root, 'public/models/se-pack/people.glb'));
const clips = {};
for (const c of people.animations) {
  c.tracks = c.tracks.filter((t) => !t.name.endsWith('.scale') && (!t.name.endsWith('.position') || t.name.startsWith('pelvis.')));
  clips[c.name] = c;
}
const player = await load(modelPath);
const tgt = new THREE.Group(); tgt.add(player.scene);
const ret = retarget(skeletonClone(people.scene), Object.values(clips), tgt);
const fail = [];
for (const n of CLIPS) if (!ret.clips[n]) fail.push('missing clip ' + n);
const extraPos = [];
for (const n of CLIPS) for (const t of ret.clips[n].tracks) if (t.name.endsWith('.position') && !/Hips|pelvis/.test(t.name)) extraPos.push(n + ' ' + t.name);
if (extraPos.length) fail.push('non-hip translation tracks: ' + extraPos.slice(0, 4).join(', '));

function rig(model) {
  let mesh = null; model.traverse((o) => { if (o.isSkinnedMesh) mesh = o; });
  const map = mapBones(mesh.skeleton);
  const p = (n) => map.get(n).getWorldPosition(new THREE.Vector3());
  return { mesh, map, p };
}
const model = skeletonClone(tgt);
const src = skeletonClone(people.scene);
const tm = new THREE.AnimationMixer(model);
const sm = new THREE.AnimationMixer(src);
const T = rig(model);
const srcMap = {}; src.traverse((o) => { if (o.isBone) srcMap[o.name] = o; });
const sp = (n) => srcMap[n].getWorldPosition(new THREE.Vector3());
const dist = (a, b) => a.distanceTo(b);
const ang = (a, b) => Math.acos(Math.min(1, Math.max(-1, a.dot(b)))) * 180 / Math.PI;

function sample(which, clip, mixer, t) {
  mixer.stopAllAction();
  const a = mixer.clipAction(clip); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.play(); mixer.setTime(Math.min(t, clip.duration * 0.98));
  which.updateMatrixWorld(true);
}
const report = [];
for (const name of CLIPS) {
  const clip = ret.clips[name];
  const dur = clip.duration;
  const restLen = {};
  sample(model, clip, tm, 0); sample(src, clips[name], sm, 0);
  for (const [a, b] of LINKS) if (T.map.get(a) && T.map.get(b)) restLen[a + b] = dist(T.p(a), T.p(b));
  const hip0 = T.p('pelvis').clone();
  const srcHip0 = sp('pelvis').clone();
  let maxLen = 0, maxDir = 0, worstBone = '', wristFlip = 0, hipEnd = 0, footMin = 99, footMax = -99, headMin = 99, headMax = -99, elbowMin = 180;
  const frames = 8;
  for (let i = 0; i < frames; i++) {
    const t = dur * i / (frames - 1);
    sample(model, clip, tm, t); sample(src, clips[name], sm, t);
    for (const [a, b] of LINKS) {
      if (!T.map.get(a) || !T.map.get(b)) continue;
      const L = dist(T.p(a), T.p(b));
      const err = Math.abs(L - restLen[a + b]) / Math.max(1e-4, restLen[a + b]);
      if (err > maxLen) maxLen = err;
    }
    for (const bone of ['upperarm_r', 'lowerarm_r', 'hand_r', 'thigh_r', 'calf_r']) {
      const child = { upperarm_r: 'lowerarm_r', lowerarm_r: 'hand_r', hand_r: 'middle_01_r', thigh_r: 'calf_r', calf_r: 'foot_r' }[bone];
      if (!T.map.get(bone) || !T.map.get(child) || !srcMap[bone] || !srcMap[child]) continue;
      const td = T.p(child).sub(T.p(bone)).normalize();
      const sd = sp(child).sub(sp(bone)).normalize();
      const d = ang(td, sd);
      if (d > maxDir) { maxDir = d; worstBone = bone; }
    }
    if (T.map.get('middle_01_r') && srcMap.middle_01_r) {
      const fore = T.p('hand_r').clone().sub(T.p('lowerarm_r')).normalize();
      const fing = T.p('middle_01_r').clone().sub(T.p('hand_r')).normalize();
      const sfore = sp('hand_r').clone().sub(sp('lowerarm_r')).normalize();
      const sfing = sp('middle_01_r').clone().sub(sp('hand_r')).normalize();
      if (sfore.dot(sfing) > 0.4 && fore.dot(fing) < 0) wristFlip++;
    }
    const foot = T.p('foot_r').y, head = T.p('Head').y;
    footMin = Math.min(footMin, foot); footMax = Math.max(footMax, foot);
    headMin = Math.min(headMin, head); headMax = Math.max(headMax, head);
    const ua = T.p('upperarm_r'), el = T.p('lowerarm_r'), hd = T.p('hand_r');
    const elbow = ang(ua.clone().sub(el).normalize(), hd.clone().sub(el).normalize());
    elbowMin = Math.min(elbowMin, elbow);
    if (i === frames - 1) {
      const hip1 = T.p('pelvis');
      const srcHip1 = sp('pelvis');
      hipEnd = hip1.distanceTo(hip0);
      const srcEnd = srcHip1.distanceTo(srcHip0);
      const rowHip = { target: +hipEnd.toFixed(3), source: +srcEnd.toFixed(3) };
      const span = headMax - footMin;
      report.push({ name, maxLen: +maxLen.toFixed(3), maxDir: +maxDir.toFixed(1), worstBone, foot: +((footMax - footMin).toFixed(3)), head: +((headMax - headMin).toFixed(3)), elbowMin: +elbowMin.toFixed(0), span: +span.toFixed(2), wristFlip, hip: rowHip });
      if (maxLen > 0.08) fail.push(`${name} limb length changed ${Math.round(maxLen * 100)}%`);
      if (maxDir > 35) fail.push(`${name} limb direction ${maxDir.toFixed(0)} deg off the old body`);
      if (wristFlip) fail.push(`${name} wrist flipped on ${wristFlip} frames`);
      if (span > 2.4 || span < 0.7) fail.push(`${name} bone span ${span.toFixed(2)} m`);
      if (!Number.isFinite(hipEnd)) fail.push(name + ' hip is not finite');
      if (LOOPS.has(name) && Math.abs(hipEnd - srcEnd * ret.hipK) > 0.2 && Math.abs(hipEnd - srcEnd) > 0.25) fail.push(`${name} hip drift target ${hipEnd.toFixed(2)} source ${srcEnd.toFixed(2)}`);
    }
  }
}
const mapped = [...ret.bones.keys()].filter((k) => k !== '_spine');
const out = { file: path.relative(root, modelPath), hipK: +ret.hipK.toFixed(3), joints: ret.bones.get('_spine') ? mapped.length + ret.bones.get('_spine').length : mapped.length, fingers: mapped.filter((k) => /^(index|middle|ring|pinky|thumb)_/.test(k)).length, missingRequired: ret.missing, clips: CLIPS.length, fail, report };
console.log(JSON.stringify(out, null, 2));
const dest = process.argv[3] || '/opt/cursor/artifacts/orange-player/clip-audit.json';
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(out, null, 2));
process.exitCode = fail.length ? 1 : 0;
