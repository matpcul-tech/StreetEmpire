// Proves the installed orange player keeps its textures and that the game clips
// move this arms-down Mixamo rig. Run: node tools/player-pose.mjs
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder as MD, MeshoptEncoder } from 'meshoptimizer';
import { retarget, mapBones } from '../src/retarget.js';

globalThis.self = globalThis;
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const playerPath = path.join(root, 'public/models/kit/characters/player.glb');
const peoplePath = path.join(root, 'public/models/se-pack/people.glb');
const fail = (m) => { console.error('FAIL', m); process.exitCode = 1; };

await MD.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MD, 'meshopt.encoder': MeshoptEncoder });
const srcDoc = await io.read(playerPath);
const mat = srcDoc.getRoot().listMaterials()[0];
const tex = (t) => t && t.getImage() && t.getSize();
const albedo = tex(mat.getBaseColorTexture()), normal = tex(mat.getNormalTexture()), mr = tex(mat.getMetallicRoughnessTexture());
if (!albedo || albedo[0] < 1024 || !normal || !mr) fail(`maps albedo ${albedo} normal ${normal} mr ${mr}`);
else console.log('maps', { albedo, normal, mr, metal: mat.getMetallicFactor(), rough: mat.getRoughnessFactor() });
let tris = 0;
for (const m of srcDoc.getRoot().listMeshes()) for (const p of m.listPrimitives()) tris += p.getIndices().getCount() / 3;
console.log('tris', tris, 'joints', srcDoc.getRoot().listSkins()[0].listJoints().length, 'animsInFile', srcDoc.getRoot().listAnimations().length);
if (tris > 15000) fail('over the 15000 triangle character budget');
if (srcDoc.getRoot().listAnimations().length) fail('file still has its own clips; the importer should drop them');

const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
const load = (file) => new Promise((res, rej) => { const buf = fs.readFileSync(file); loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', res, rej); });
const people = await load(peoplePath);
const clips = {};
for (const c of people.animations) {
  c.tracks = c.tracks.filter((t) => !t.name.endsWith('.scale') && (!t.name.endsWith('.position') || t.name.startsWith('pelvis.')));
  clips[c.name] = c;
}
const player = await load(playerPath);
const tgt = new THREE.Group(); tgt.add(player.scene);
let front = null, head = null;
player.scene.traverse((o) => { if (o.name === 'headfront') front = o; if (o.name === 'mixamorigHead') head = o; });
player.scene.updateMatrixWorld(true);
const fz = front.getWorldPosition(new THREE.Vector3()).z - head.getWorldPosition(new THREE.Vector3()).z;
console.log('face delta z (headfront minus head)', +fz.toFixed(3));
if (fz < 0.02) fail('face is not toward +z, set yaw 180');

const r = retarget(skeletonClone(people.scene), Object.values(clips), tgt);
if (r.missing.length) fail('missing bones ' + r.missing.join(','));
for (const n of ['Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Punch_Jab', 'Punch_Cross', 'Sword_Attack', 'Pistol_Idle_Loop', 'Pistol_Shoot', 'Death01', 'Driving_Loop', 'Hit_Chest', 'Hit_Head', 'Roll', 'Jump_Start', 'Idle_Talking_Loop']) if (!r.clips[n]) fail('missing clip ' + n);
const model = skeletonClone(tgt);
const mixer = new THREE.AnimationMixer(model);
function chain(name, t) {
  mixer.stopAllAction();
  const a = mixer.clipAction(r.clips[name]); a.play(); mixer.setTime(t); model.updateMatrixWorld(true);
  const sk = []; model.traverse((o) => { if (o.isSkinnedMesh) sk.push(o); });
  const map = mapBones(sk[0].skeleton);
  const p = (n) => map.get(n).getWorldPosition(new THREE.Vector3());
  const hip = p('pelvis'), knee = p('calf_r'), foot = p('foot_r'), sh = p('upperarm_r'), hand = p('hand_r');
  return { hipY: hip.y, kneeY: knee.y, footY: foot.y, handZ: hand.z - sh.z, thighZ: knee.z - hip.z };
}
const idle = chain('Idle_Loop', 0.4);
const walkA = chain('Walk_Loop', 0.15);
const walkB = chain('Walk_Loop', 0.7);
const sprint = chain('Sprint_Loop', 0.2);
const punch = chain('Punch_Jab', 0.4);
const drive = chain('Driving_Loop', 0.45);
const death = chain('Death01', 2.0);
const report = { idle, walkA, walkB, sprint, punch, drive, death, hand: r.hand && r.hand.bone.name, hipK: +r.hipK.toFixed(3) };
console.log(JSON.stringify(report, null, 2));
if (Math.abs(walkA.footY - walkB.footY) < 0.04) fail('walk does not move the feet');
if (sprint.footY < idle.footY + 0.05) fail('sprint does not lift a foot');
if (punch.handZ < idle.handZ + 0.08) fail('jab does not reach forward');
if (drive.thighZ < 0.2) fail('driving pose does not swing the thigh forward');
if (death.hipY > idle.hipY - 0.4) fail('death does not drop the hips');
if (!/RightHand/.test(r.hand.bone.name)) fail('weapon bone is not the right hand');
if (!process.exitCode) console.log('player pose ok');
