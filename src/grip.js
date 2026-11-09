// Closes a hand around the weapon grip.
// A rig with named, weighted finger bones (the orange player and Blue Hand) gets
// a curl on those bones, on top of the clip. A rig with no finger bones keeps
// its skeleton and its skin weights exactly as imported. Helper bones are not
// rotated. A grip for that hand is a mesh move that is thrown away if it
// stretches a triangle.
import * as THREE from 'three';
import { mapBones, restPose } from './retarget.js';

const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'];
const POWER = { thumb: [0.9, 0.75, 0.45], other: [1.55, 1.75, 1.15] };
const AXES = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};

function bodyMesh(root) {
  let mesh = null;
  root.traverse((o) => { if (o.isSkinnedMesh && (!mesh || o.geometry.attributes.position.count > mesh.geometry.attributes.position.count)) mesh = o; });
  return mesh;
}

function gripLocal(frame, offset) {
  return new THREE.Vector3(offset.x, offset.y, offset.z).multiplyScalar(frame.scale).applyQuaternion(frame.quat);
}

function tipOf(bone) {
  const child = bone.children.find((c) => c.isBone);
  return child || bone;
}

// Which local axis, and which way, brings this finger's tip toward the grip point.
function measureFinger(root, bones, tip, target) {
  const saved = bones.map((b) => b.quaternion.clone());
  const dist = () => tipOf(tip).getWorldPosition(new THREE.Vector3()).distanceTo(target);
  root.updateMatrixWorld(true);
  const before = dist();
  let best = null;
  for (const [name, axis] of Object.entries(AXES)) {
    if (name === 'y') continue; // local Y runs along the finger; twisting it does not close the hand
    for (const sign of [1, -1]) {
      const q = new THREE.Quaternion().setFromAxisAngle(axis, sign * 0.7);
      bones.forEach((b) => b.quaternion.multiply(q));
      root.updateMatrixWorld(true);
      const after = dist();
      const gain = before - after;
      if (!best || gain > best.gain) best = { name, sign, gain, after };
      bones.forEach((b, i) => b.quaternion.copy(saved[i]));
    }
  }
  root.updateMatrixWorld(true);
  if (!best || best.gain < 0.004) return null;
  return { axis: nameOf(best.name), sign: best.sign, before, after: best.after };
}

function nameOf(axis) { return AXES[axis]; }

function fingerEntries(map, side, powers, chosen) {
  const out = [];
  FINGERS.forEach((f) => {
    const hit = chosen.get(f); if (!hit) return;
    const pow = f === 'thumb' ? powers.thumb : powers.other;
    [1, 2, 3].forEach((i, n) => {
      const b = map.get(`${f}_0${i}_${side}`); if (!b) return;
      // local Y runs along the finger. The skinned fingertip closes toward the weapon around local Z.
      const axis = f === 'thumb' ? hit.axis : AXES.z;
      out.push({ name: b.name, axis, sign: hit.sign, power: pow[n], side, rest: b.quaternion.clone() });
    });
  });
  return out;
}

function fingerVertIds(mesh, bone) {
  if (!mesh || !bone) return [];
  const hi = mesh.skeleton.bones.indexOf(bone);
  const si = mesh.geometry.attributes.skinIndex, sw = mesh.geometry.attributes.skinWeight;
  const ids = [];
  for (let i = 0; i < si.count && ids.length < 24; i++) {
    let w = 0;
    for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === hi) w += sw.getComponent(i, k);
    if (w > 0.55) ids.push(i);
  }
  return ids;
}

function measureBones(root, mesh, map, frames, offset) {
  const chosen = { r: new Map(), l: new Map() };
  const report = {};
  for (const side of ['r', 'l']) {
    const frame = frames[side]; if (!frame) continue;
    const target = gripLocal(frame, offset);
    frame.bone.localToWorld(target);
    for (const f of FINGERS) {
      const bones = [1, 2, 3].map((i) => map.get(`${f}_0${i}_${side}`)).filter(Boolean);
      const last = map.get(`${f}_03_${side}`);
      if (bones.length < 2 || !last) continue;
      const hit = measureFinger(root, bones, last, target);
      if (hit) chosen[side].set(f, hit);
    }
    const mid = chosen[side].get('middle');
    report[side] = mid ? { before: +mid.before.toFixed(4), probe: +mid.after.toFixed(4), fingers: chosen[side].size } : { fingers: 0 };
  }
  const bones = [...fingerEntries(map, 'r', POWER, chosen.r), ...fingerEntries(map, 'l', POWER, chosen.l)];
  const tipName = (side) => {
    const last = map.get(`middle_03_${side}`);
    const child = last && last.children.find((c) => c.isBone);
    return (child || last) && (child || last).name;
  };
  return bones.length ? { bones, tips: { r: tipName('r'), l: tipName('l') }, verts: { r: fingerVertIds(mesh, map.get('middle_03_r')), l: fingerVertIds(mesh, map.get('middle_03_l')) }, report } : null;
}

function variance(pts, key) {
  const m = pts.reduce((s, p) => s + p[key], 0) / pts.length;
  return pts.reduce((s, p) => s + (p[key] - m) ** 2, 0) / pts.length;
}

function handPoints(mesh, hand) {
  const si = mesh.geometry.attributes.skinIndex, sw = mesh.geometry.attributes.skinWeight;
  const bones = mesh.skeleton.bones, hi = bones.indexOf(hand);
  const inv = new THREE.Matrix4().copy(hand.matrixWorld).invert();
  const back = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
  const pts = [];
  for (let i = 0; i < si.count; i++) {
    let w = 0, best = 0, bw = 0;
    for (let k = 0; k < 4; k++) {
      const b = si.getComponent(i, k), wt = sw.getComponent(i, k);
      if (b === hi) w += wt;
      if (wt > bw) { bw = wt; best = b; }
    }
    if (w < 0.5 || best !== hi) continue;
    const local = new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, i);
    const meshLocal = local.clone();
    local.applyMatrix4(mesh.matrixWorld).applyMatrix4(inv);
    pts.push({ i, x: local.x, y: local.y, z: local.z, mesh: meshLocal });
  }
  return { pts, inv, back, hi };
}

function bendPoint(p, along, palm, knuckle, tip, hingeSide, angle, rigid) {
  const span = tip - knuckle;
  if (Math.abs(span) < 1e-4) return p;
  const a0 = p[along], s0 = p[palm];
  const t = (a0 - knuckle) / span;
  if (t <= 0.02) return p;
  const tc = Math.min(1, t);
  // rigid: one rotation for the whole fingertip, so triangles inside it do not shear
  const ang = rigid ? angle : angle * (0.35 * tc + 0.65 * tc * tc);
  const c = Math.cos(ang), s = Math.sin(ang);
  const dy = a0 - knuckle, ds = s0 - hingeSide;
  const out = { x: p.x, y: p.y, z: p.z, i: p.i };
  out[along] = knuckle + dy * c - ds * s;
  out[palm] = hingeSide + dy * s + ds * c;
  return out;
}

function centroid(pts) {
  const c = { x: 0, y: 0, z: 0 };
  for (const p of pts) { c.x += p.x; c.y += p.y; c.z += p.z; }
  const n = Math.max(1, pts.length);
  c.x /= n; c.y /= n; c.z /= n;
  return c;
}

function dist3(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }

// Bend the hand vertices that already belong to the hand bone. The long axis of
// that cloud is the finger direction. The curl is the bend that lands the
// fingertips nearer the grip. No new bones.
function curlHand(mesh, hand, target) {
  const bag = handPoints(mesh, hand);
  if (bag.pts.length < 40) return null;
  const pts = bag.pts;
  const spread = [['x', variance(pts, 'x')], ['y', variance(pts, 'y')], ['z', variance(pts, 'z')]].sort((a, b) => b[1] - a[1]);
  const along = spread[0][0], palm = spread[2][0];
  const ordered = pts.map((p) => p[along]).sort((a, b) => a - b);
  const lo = ordered[0], hi = ordered[ordered.length - 1];
  const lowC = centroid(pts.filter((p) => p[along] <= ordered[Math.floor(ordered.length * 0.15)]));
  const highC = centroid(pts.filter((p) => p[along] >= ordered[Math.floor(ordered.length * 0.85)]));
  const tipsHigh = dist3(highC, target) >= dist3(lowC, target);
  const wristEnd = tipsHigh ? lo : hi, tip = tipsHigh ? hi : lo;
  const knuckle = wristEnd + (tip - wristEnd) * 0.34;
  if (Math.abs(tip - knuckle) < 0.02) return null;
  const near = pts.filter((p) => Math.abs(p[along] - knuckle) < Math.abs(tip - lo) * 0.08);
  const hingeAt = (near.length ? near : pts).reduce((s, p) => s + p[palm], 0) / (near.length || pts.length);
  const tipSet = new Set(pts.filter((p) => (tipsHigh ? p[along] >= ordered[Math.floor(ordered.length * 0.85)] : p[along] <= ordered[Math.floor(ordered.length * 0.15)])).map((p) => p.i));
  const before = dist3(tipsHigh ? highC : lowC, target);
  const index = mesh.geometry.index;
  const baseAttr = mesh.geometry.attributes.position;
  const scored = [];
  for (const rigid of [true, false]) for (const sign of [1, -1]) for (const scale of [0.35, 0.55, 0.75, 1]) {
    const angle = sign * (rigid ? 0.9 : 1.1) * scale;
    const movedPts = pts.map((p) => bendPoint(p, along, palm, knuckle, tip, hingeAt, angle, rigid));
    const c = centroid(movedPts.filter((p) => tipSet.has(p.i)));
    const after = dist3(c, target);
    const tTip = (c[along] - wristEnd) / (tip - wristEnd);
    if (tTip < 0.35 || tTip > 1.05) continue;
    if (before - after < 0.008) continue;
    const trial = new Float32Array(baseAttr.count * 3);
    for (let i = 0; i < baseAttr.count; i++) trial.set([baseAttr.getX(i), baseAttr.getY(i), baseAttr.getZ(i)], i * 3);
    const moved = new Set();
    const span = tip - knuckle;
    for (let n = 0; n < pts.length; n++) {
      const p = pts[n];
      const t = Math.abs(span) < 1e-4 ? 0 : (p[along] - knuckle) / span;
      if (t <= 0.02) continue;
      const q = movedPts[n];
      const meshPos = new THREE.Vector3(q.x, q.y, q.z).applyMatrix4(hand.matrixWorld).applyMatrix4(bag.back);
      trial.set([meshPos.x, meshPos.y, meshPos.z], p.i * 3);
      moved.add(p.i);
    }
    const stretch = edgeStretch(baseAttr, trial, index, moved);
    if (stretch.ratio > 1.35 || stretch.max > 0.02) continue;
    scored.push({ angle, after, stretch, trial, moved });
  }
  // the most closure whose triangles still meet. None means the hand stays as imported.
  scored.sort((a, b) => a.after - b.after);
  const best = scored[0];
  if (!best) return null;
  const writes = [];
  for (const i of best.moved) writes.push({ i, x: best.trial[i * 3], y: best.trial[i * 3 + 1], z: best.trial[i * 3 + 2] });
  return { before: +before.toFixed(4), after: +best.after.toFixed(4), angle: +best.angle.toFixed(3), moved: writes.length, stretch: +best.stretch.ratio.toFixed(3), along, palm, writes };
}

function edgeStretch(base, trial, index, moved) {
  if (!index) return { ratio: 1, max: 0 };
  let ratio = 1, max = 0;
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), D = new THREE.Vector3();
  for (let i = 0; i < index.count; i += 3) {
    const tri = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    if (!tri.some((v) => moved.has(v))) continue;
    for (let e = 0; e < 3; e++) {
      const u = tri[e], v = tri[(e + 1) % 3];
      A.set(base.getX(u), base.getY(u), base.getZ(u));
      B.set(base.getX(v), base.getY(v), base.getZ(v));
      C.set(trial[u * 3], trial[u * 3 + 1], trial[u * 3 + 2]);
      D.set(trial[v * 3], trial[v * 3 + 1], trial[v * 3 + 2]);
      const beforeLen = A.distanceTo(B);
      if (beforeLen < 1e-5) continue;
      const afterLen = C.distanceTo(D);
      if (afterLen / beforeLen > ratio) ratio = afterLen / beforeLen;
      if (afterLen > max) max = afterLen;
    }
  }
  return { ratio, max };
}


function measureMesh(root, frames, offset) {
  // Skin weights stay as imported. A candidate that stretches a triangle is dropped,
  // which is what keeps the Red Kings fingertips from shattering.
  const mesh = bodyMesh(root);
  restPose(root, mesh);
  root.updateMatrixWorld(true);
  const report = {};
  const hits = [];
  for (const side of ['r', 'l']) {
    const frame = frames[side]; if (!frame) continue;
    const target = gripLocal(frame, offset);
    const hit = curlHand(mesh, frame.bone, target);
    if (!hit) { report[side] = null; continue; }
    report[side] = { before: hit.before, after: hit.after, angle: hit.angle, moved: hit.moved, stretch: hit.stretch, along: hit.along, palm: hit.palm };
    hits.push(hit);
  }
  if (!hits.length) return null;
  const pos = mesh.geometry.attributes.position;
  const curled = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) curled.set([pos.getX(i), pos.getY(i), pos.getZ(i)], i * 3);
  for (const hit of hits) for (const w of hit.writes) curled.set([w.x, w.y, w.z], w.i * 3);
  const attr = new THREE.Float32BufferAttribute(curled, 3);
  attr.name = 'grip';
  mesh.geometry.morphAttributes.position = [attr];
  mesh.geometry.morphTargetsRelative = false;
  mesh.updateMorphTargets();
  if (mesh.morphTargetInfluences) mesh.morphTargetInfluences[0] = 0;
  return { morph: true, report };
}

const _q = new THREE.Quaternion();
const _tip = new THREE.Vector3();
const _goal = new THREE.Vector3();
const _sum = new THREE.Vector3();

function skinnedMesh(root) {
  let mesh = null;
  root.traverse((o) => { if (o.isSkinnedMesh && (!mesh || o.geometry.attributes.position.count > mesh.geometry.attributes.position.count)) mesh = o; });
  return mesh;
}

function meshGap(mesh, ids, goal) {
  if (!mesh || !ids || !ids.length) return null;
  mesh.skeleton.update();
  _sum.set(0, 0, 0);
  for (const i of ids) { mesh.getVertexPosition(i, _tip); _sum.add(_tip); }
  _sum.multiplyScalar(1 / ids.length);
  mesh.localToWorld(_sum);
  return _sum.distanceTo(goal);
}

const _fist = new THREE.Quaternion();

// The clip leaves these fingers open. A grip replaces that local pose with the
// rest pose plus the measured curl, so the fist stays on the hand while the arm
// follows the clip.
function applyBones(root, list, amount, flip) {
  for (const g of list) {
    const b = root.getObjectByName(g.name); if (!b || !g.rest) continue;
    _q.setFromAxisAngle(g.axis, (flip ? -1 : 1) * g.sign * g.power);
    _fist.copy(g.rest).multiply(_q);
    b.quaternion.slerp(_fist, Math.min(1, amount));
  }
}

// Drop a measured curl and keep only the imported finger rest. Used when that
// curl shears the mesh. Other files keep the curl measureGrip returned.
export function holdImportedHand(grip) {
  const bones = (grip && grip.bones || []).map((b) => ({ name: b.name, rest: b.rest, side: b.side }));
  return { kind: 'unsolved', bones };
}

// Capture the current local rotation of matching bones and hold it. Call this
// from the bind pose. Used when a partial finger chain must not be curled.
export function holdMatchingBones(root, re) {
  const bones = [];
  if (root) root.traverse((o) => {
    if (!o.isBone || !re.test(o.name)) return;
    bones.push({ name: o.name, rest: o.quaternion.clone(), side: /Left/.test(o.name) ? 'l' : 'r' });
  });
  return { kind: 'unsolved', bones };
}

// These meshes tear, or they only have a middle-finger chain, when a curl is
// applied. Everyone else keeps the measured curl. reds-m-1 has no finger bones,
// so it never reaches this list. The six Bone_* on reds-f-1 are not fingers.
export function gripForFile(file, measured, root) {
  const name = String(file || '');
  if (name.endsWith('reds-f-1.glb')) return holdMatchingBones(root, /HandMiddle/);
  if (name.endsWith('blues-m-2.glb')) return holdMatchingBones(root, /RightHandMiddle/);
  if (name.endsWith('crew-m-2.glb') || name.endsWith('crew-f-1.glb') || name.endsWith('reds-m-2.glb') || name.endsWith('blues-f-1.glb') || name.endsWith('golds-m-2.glb') || name.endsWith('golds-f-1.glb') || name.endsWith('locals-m-1.glb') || name.endsWith('locals-m-2.glb') || name.endsWith('locals-f-1.glb')) return holdImportedHand(measured);
  return measured;
}

export function measureGrip(root, frames, offset) {
  const mesh = bodyMesh(root);
  if (!mesh || !frames) return null;
  restPose(root, mesh);
  root.updateMatrixWorld(true);
  const map = mapBones(mesh.skeleton);
  if (map.get('middle_01_r') && map.get('middle_01_l')) {
    const bones = measureBones(root, mesh, map, frames, offset);
    return bones && { ...bones, kind: 'bones' };
  }
  const morph = measureMesh(root, frames, offset);
  return morph && { ...morph, kind: 'mesh' };
}

export function applyGrip(root, grip, amount) {
  if (!grip) return;
  // This hand's curl split the skinned triangles. Leave every finger at the
  // imported rest pose. The arm clip still plays. A fist is not solved.
  if (grip.kind === 'unsolved') {
    for (const g of grip.bones || []) {
      const b = root.getObjectByName(g.name); if (!b || !g.rest) continue;
      b.quaternion.copy(g.rest);
    }
    return;
  }
  if (grip.bones && amount) {
    for (const side of ['r', 'l']) {
      const list = grip.bones.filter((g) => g.side === side);
      const tip = grip.tips && grip.tips[side] && root.getObjectByName(grip.tips[side]);
      if (!list.length) continue;
      if (!tip) { applyBones(root, list, amount, false); continue; }
      const knuckle = root.getObjectByName(list[0].name);
      const wrist = knuckle && knuckle.parent;
      if (!wrist) { applyBones(root, list, amount, false); continue; }
      wrist.getWorldPosition(_goal);
      const mesh = skinnedMesh(root);
      const ids = grip.verts && grip.verts[side];
      const saved = list.map((g) => { const b = root.getObjectByName(g.name); return b ? b.quaternion.clone() : null; });
      const restore = () => list.forEach((g, i) => { const b = saved[i] && root.getObjectByName(g.name); if (b) b.quaternion.copy(saved[i]); });
      const gap = () => {
        root.updateMatrixWorld(true);
        const skinned = meshGap(mesh, ids, _goal);
        if (skinned != null) return skinned;
        tip.getWorldPosition(_tip);
        return _tip.distanceTo(_goal);
      };
      const before = gap();
      applyBones(root, list, amount, false);
      let after = gap();
      if (after > before - 0.004) {
        restore();
        applyBones(root, list, amount, true);
        after = gap();
        if (after > before - 0.004) restore();
      }
    }
    root.updateMatrixWorld(true);
  }
  if (grip.morph) {
    const inf = amount || 0;
    root.traverse((o) => { if (o.isSkinnedMesh && o.morphTargetInfluences && o.morphTargetInfluences.length) o.morphTargetInfluences[0] = inf; });
  }
}

export function gripAmount(clip, weapon) {
  if (!clip) return 0;
  if (clip.startsWith('Punch') || clip === 'Sword_Attack') return 1;
  if (clip.startsWith('Pistol')) return 0.85;
  if (weapon === 'pistol' || weapon === 'shotgun' || weapon === 'bat' || weapon === 'knuckles') return 0.85;
  if (clip === 'Driving_Loop' || clip === 'Sitting_Idle_Loop') return 0.55;
  return 0;
}
