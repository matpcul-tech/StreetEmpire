// Retargeting: plays the game's 18 animation clips (Quaternius Universal
// Animation Library, rig in public/models/se-pack/people.glb) on a character
// rigged with a different skeleton: Meshy's auto rig, Mixamo, Unreal or Unity
// style names, T pose or A pose.
//
// How it works, once per installed character:
// 1. Bones are matched by name (left and right, arm, leg, finger parts) and the
//    spine by its chain from the hips to the neck, whatever the bones are called.
// 2. Both rigs are put in their rest pose. Each limb bone of the new rig gets an
//    alignment that turns it from its own rest direction to the game rig's rest
//    direction, so an A pose character is lifted into the game's T pose first.
// 3. Every clip is sampled at 30 fps on the game rig. For each frame and bone the
//    world rotation change from rest is copied onto the new rig's aligned rest
//    rotation and turned back into a local rotation. The hips move by the same
//    amount, scaled by the ratio of hip heights.
// The result is a set of ordinary clips with the same names, so the rest of the
// game drives a kit character exactly like a built-in one.
import * as THREE from 'three';

const FPS = 30;
const LIMB_CHILD = {
  clavicle: 'upperarm', upperarm: 'lowerarm', lowerarm: 'hand', hand: 'middle_01',
  thigh: 'calf', calf: 'foot', foot: 'ball',
};
const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'];

// Bone name to the game rig's name (pelvis, spine, neck_01, Head, upperarm_l, index_02_r, ...).
// Returns 'spine' for any spine or chest bone (matched by chain order later) and null for
// end, leaf, twist, roll and helper bones.
export function canonical(raw) {
  let s = String(raw).replace(/^.*[:|]/, '').replace(/^mixamorig/i, '').replace(/^(bip0?1|def|org|cc_base|rig)[_\s.-]+/i, '');
  const low = s.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
  if (/(^|[_.\s-])(end|leaf|nub|top|tip|twist|roll|ik|target|pole|null|helper|socket|weapon|prop)([_.\s\d-]|$)/.test(low) || /head_?top|_end$|end$/.test(low)) return null;
  let side = null;
  if (/(^|[_.\s-])left([_.\s-]|$)|^left|left$/.test(low) || /(^|[_.\s-])l($|[_.\s-]|\d)/.test(low) || /\.l$/.test(low)) side = 'l';
  else if (/(^|[_.\s-])right([_.\s-]|$)|^right|right$/.test(low) || /(^|[_.\s-])r($|[_.\s-]|\d)/.test(low) || /\.r$/.test(low)) side = 'r';
  const k = low.replace(/left|right/g, '').replace(/(^|[_.\s-])[lr](?=$|[_.\s-]|\d)/g, '$1').replace(/[^a-z0-9]/g, '');
  const f = /(thumb|index|middle|ring|pinky|little|pinkie)\D*0?([1-3])$/.exec(k);
  if (f) { if (!side) return null; const name = f[1] === 'little' || f[1] === 'pinkie' ? 'pinky' : f[1]; return `${name}_0${f[2]}_${side}`; }
  if (/^(hips|pelvis|hip)$/.test(k)) return 'pelvis';
  if (/^(spine|chest|upperchest|torso|abdomen|waist)\d*$/.test(k)) return 'spine';
  if (/^neck\d*$/.test(k)) return 'neck_01';
  if (/^head$/.test(k)) return 'Head';
  if (!side) return null;
  const part =
    /^(clavicle|shoulder|collar)\d*$/.test(k) ? 'clavicle' :
    /^(forearm|lowerarm|elbow|armlower)\d*$/.test(k) ? 'lowerarm' :
    /^(upperarm|arm|armupper)\d*$/.test(k) ? 'upperarm' :
    /^(hand|wrist)\d*$/.test(k) ? 'hand' :
    /^(thigh|upleg|upperleg|legupper)\d*$/.test(k) ? 'thigh' :
    /^(calf|leg|lowerleg|shin|knee|leglower)\d*$/.test(k) ? 'calf' :
    /^(foot|ankle)\d*$/.test(k) ? 'foot' :
    /^(toe|toes|toebase|ball)\d*$/.test(k) ? 'ball' : null;
  return part ? `${part}_${side}` : null;
}

// the main skinned mesh (most vertices): the body, not the brows or eyes
const firstSkinned = (root) => { let m = null; root.traverse((o) => { if (o.isSkinnedMesh && (!m || o.geometry.attributes.position.count > m.geometry.attributes.position.count)) m = o; }); return m; };
const depth = (o) => { let d = 0; for (let p = o.parent; p; p = p.parent) d++; return d; };

// Canonical name -> bone, for one skeleton. Spine bones are numbered along the chain from the hips.
export function mapBones(skeleton) {
  const map = new Map(), spine = [];
  for (const b of skeleton.bones) {
    const c = canonical(b.name); if (!c) continue;
    if (c === 'spine') { spine.push(b); continue; }
    if (!map.has(c) || depth(b) < depth(map.get(c))) map.set(c, b); // twin names: keep the one nearest the root
  }
  spine.sort((a, b) => depth(a) - depth(b));
  map.set('_spine', spine);
  return map;
}

// Which game spine bone drives each spine bone of the new rig (by position along the chain).
function spinePairs(src, tgt) {
  const S = src.get('_spine'), T = tgt.get('_spine'), out = [];
  if (!S.length) return out;
  T.forEach((b, i) => { const j = T.length === 1 ? Math.min(1, S.length - 1) : Math.round(i * (S.length - 1) / (T.length - 1)); out.push([S[j], b]); });
  return out;
}

// Rest (bind) pose from the inverse bind matrices. three's Skeleton.pose() assumes the root bone's
// parent is at the origin, which breaks Mixamo style files (bones under a node scaled 0.01).
// pre: the transform placed above the file's scene since it was loaded (the kit's yaw turn).
export function restPose(root, mesh, pre = new THREE.Matrix4()) {
  root.updateMatrixWorld(true);
  const sk = mesh.skeleton, idx = new Map(sk.bones.map((b, i) => [b, i])), M = new THREE.Matrix4(), I = new THREE.Matrix4();
  for (const b of [...sk.bones].sort((a, c) => depth(a) - depth(c))) {
    M.copy(sk.boneInverses[idx.get(b)]).invert().premultiply(pre);
    I.copy(b.parent ? b.parent.matrixWorld : new THREE.Matrix4()).invert();
    b.matrix.multiplyMatrices(I, M); b.matrix.decompose(b.position, b.quaternion, b.scale);
    b.updateMatrixWorld(true);
  }
  root.updateMatrixWorld(true);
}

// Missing parts the game needs, by name. Empty means the rig can play every clip.
export function checkRig(skeleton) {
  const m = mapBones(skeleton), need = ['pelvis', 'neck_01', 'Head', 'upperarm_l', 'lowerarm_l', 'hand_l', 'upperarm_r', 'lowerarm_r', 'hand_r', 'thigh_l', 'calf_l', 'foot_l', 'thigh_r', 'calf_r', 'foot_r'];
  const missing = need.filter((n) => !m.has(n));
  if (!m.get('_spine').length) missing.push('spine');
  return missing;
}

/**
 * Retarget clips from the game rig to another rig.
 * @param {THREE.Object3D} srcRoot  a clone of the game's people template (at the origin, unscaled)
 * @param {THREE.AnimationClip[]} clips  the game's clips (already filtered to rotations plus pelvis position)
 * @param {THREE.Object3D} tgtRoot  the new character (at the origin; any yaw already applied above its scene)
 * @returns {{ clips: Object<string, THREE.AnimationClip>, hand: {bone, quat}, bones: Map, missing: string[] }}
 */
export function retarget(srcRoot, clips, tgtRoot) {
  const sMesh = firstSkinned(srcRoot), tMesh = firstSkinned(tgtRoot);
  if (!sMesh || !tMesh) throw new Error('retarget: both models need a skinned mesh');
  const sMap = mapBones(sMesh.skeleton), tMap = mapBones(tMesh.skeleton);
  const missing = checkRig(tMesh.skeleton);

  // pairs [source bone, target bone] for everything that matched
  const pairs = [];
  for (const [c, tb] of tMap) { if (c === '_spine') continue; const sb = sMap.get(c); if (sb) pairs.push([sb, tb, c]); }
  for (const [sb, tb] of spinePairs(sMap, tMap)) pairs.push([sb, tb, 'spine']);
  const srcOf = new Map(pairs.map(([s, t, c]) => [t, { s, c }]));

  // rest pose of both rigs, in world space (the target's yaw turn is on tgtRoot itself)
  srcRoot.updateMatrixWorld(true); tgtRoot.updateMatrixWorld(true);
  const tPre = tgtRoot.matrixWorld.clone();
  restPose(srcRoot, sMesh); restPose(tgtRoot, tMesh, tPre);
  const sPoseQ = new Map(sMesh.skeleton.bones.map((b) => [b, b.quaternion.clone()])), sPoseP = new Map(sMesh.skeleton.bones.map((b) => [b, b.position.clone()]));
  const wq = (o) => o.getWorldQuaternion(new THREE.Quaternion()), wp = (o) => o.getWorldPosition(new THREE.Vector3());
  const tBones = [...tMesh.skeleton.bones].sort((a, b) => depth(a) - depth(b));
  const sRestQ = new Map(), tRestQ = new Map(), tRestLocal = new Map();
  for (const [s] of pairs) sRestQ.set(s, wq(s));
  for (const b of tBones) { tRestQ.set(b, wq(b)); tRestLocal.set(b, b.quaternion.clone()); }

  // limb alignment: turn each target limb bone from its rest direction to the game rig's
  const align = new Map();
  const dirTo = (map, a, bName) => { const b = map.get(bName); return b ? wp(b).sub(wp(a)).normalize() : null; };
  for (const [s, t, c] of pairs) {
    const m = /^(clavicle|upperarm|lowerarm|hand|thigh|calf|foot)_([lr])$/.exec(c), f = /^(\w+)_0([12])_([lr])$/.exec(c);
    let childName = null;
    if (m) childName = `${LIMB_CHILD[m[1]]}_${m[2]}`.replace('middle_01_l', 'middle_01_l');
    else if (f && FINGERS.includes(f[1])) childName = `${f[1]}_0${+f[2] + 1}_${f[3]}`;
    const ds = childName && dirTo(sMap, s, childName), dt = childName && dirTo(tMap, t, childName);
    if (ds && dt && ds.lengthSq() > 0.5 && dt.lengthSq() > 0.5) align.set(t, new THREE.Quaternion().setFromUnitVectors(dt, ds));
  }
  // bones with no child to aim at (hands without fingers, last finger joints, toes) turn with their parent part
  const inherit = (t) => { for (let p = t.parent; p; p = p.parent) if (align.has(p)) return align.get(p); return null; };
  for (const [, t, c] of pairs) if (!align.has(t) && !/^(pelvis|spine|neck_01|Head)$/.test(c)) { const a = inherit(t); if (a) align.set(t, a); }

  // hips: same movement, scaled to this character's leg length
  const sHip = sMap.get('pelvis'), tHip = tMap.get('pelvis');
  // leg length from the bones (hips to ankles), not the mesh: quantized meshes are not in meters
  const ankleY = (map) => Math.min(...['foot_l', 'foot_r'].map((n) => map.get(n)).filter(Boolean).map((b) => wp(b).y));
  const sHip0 = sHip && wp(sHip), tHip0 = tHip && wp(tHip);
  const hipK = sHip && tHip ? (tHip0.y - ankleY(tMap)) / Math.max(1e-6, sHip0.y - ankleY(sMap)) : 1;
  const tHipParentInv = tHip && tHip.parent ? tHip.parent.matrixWorld.clone().invert() : new THREE.Matrix4();

  const outClips = {};
  const mixer = new THREE.AnimationMixer(srcRoot);
  const D = new THREE.Quaternion(), W = new THREE.Quaternion(), L = new THREE.Quaternion(), P = new THREE.Vector3();
  for (const clip of clips) {
    const n = Math.max(2, Math.round(clip.duration * FPS) + 1), times = new Float32Array(n);
    for (let i = 0; i < n; i++) times[i] = Math.min(clip.duration, i / FPS);
    const animated = tBones.filter((b) => srcOf.has(b));
    const qv = new Map(animated.map((b) => [b, new Float32Array(n * 4)])), pv = tHip ? new Float32Array(n * 3) : null;
    // rest pose once per clip, before binding: the mixer only writes values that change, so a
    // per-frame reset would leave held bones (a seated driver's legs) at rest after the first frame
    for (const b of sMesh.skeleton.bones) { b.quaternion.copy(sPoseQ.get(b)); b.position.copy(sPoseP.get(b)); }
    const action = mixer.clipAction(clip); action.play();
    for (let i = 0; i < n; i++) {
      mixer.setTime(times[i]);
      srcRoot.updateMatrixWorld(true);
      const world = new Map();
      for (const b of tBones) {
        const pw = b.parent && world.has(b.parent) ? world.get(b.parent) : b.parent ? b.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
        const m = srcOf.get(b);
        if (m) {
          D.multiplyQuaternions(wq(m.s), sRestQ.get(m.s).clone().invert());
          W.copy(tRestQ.get(b)); const a = align.get(b); if (a) W.premultiply(a); W.premultiply(D);
          L.copy(pw).invert().multiply(W);
        } else { L.copy(tRestLocal.get(b)); W.copy(pw).multiply(L); }
        world.set(b, W.clone());
        const arr = qv.get(b);
        if (arr) {
          if (i > 0 && arr[i * 4 - 4] * L.x + arr[i * 4 - 3] * L.y + arr[i * 4 - 2] * L.z + arr[i * 4 - 1] * L.w < 0) L.set(-L.x, -L.y, -L.z, -L.w); // no sign flips between frames
          arr.set([L.x, L.y, L.z, L.w], i * 4);
        }
      }
      if (pv) { P.copy(wp(sHip)).sub(sHip0).multiplyScalar(hipK).add(tHip0).applyMatrix4(tHipParentInv); pv.set([P.x, P.y, P.z], i * 3); }
    }
    action.stop(); mixer.uncacheAction(clip);
    const tracks = [];
    for (const [b, arr] of qv) tracks.push(new THREE.QuaternionKeyframeTrack(`${b.name}.quaternion`, times, arr));
    if (pv && clip.tracks.some((t) => t.name.endsWith('.position'))) tracks.push(new THREE.VectorKeyframeTrack(`${tHip.name}.position`, times, pv));
    outClips[clip.name] = new THREE.AnimationClip(clip.name, clip.duration, tracks);
  }
  restPose(srcRoot, sMesh); restPose(tgtRoot, tMesh, tPre);

  // weapons are placed in the game rig's right hand frame; this rotation gives the same frame on the new hand
  const sHand = sMap.get('hand_r'), tHand = tMap.get('hand_r');
  let hand = null;
  if (sHand && tHand) {
    const a = align.get(tHand) || new THREE.Quaternion();
    hand = { bone: tHand, quat: a.clone().multiply(tRestQ.get(tHand)).invert().multiply(sRestQ.get(sHand)) };
  }
  return { clips: outClips, hand, bones: tMap, missing, hipK };
}
