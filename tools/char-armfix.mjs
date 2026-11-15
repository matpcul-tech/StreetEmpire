// Armpit wing repair for kit characters: node tools/char-armfix.mjs [--dry] <file.glb> [more.glb ...]
//
// AI-rigged characters often come with the side of the shirt, the chest and the back weighted to the arm
// bones, so a raised arm drags the torso out into a wing ("arms attached to the shirt"). This takes the arm
// bones' weight off every vertex that is not part of the arm and gives it to the bones that vertex already
// follows (or the nearest spine bone). Only skin weights change: mesh, UVs, textures and skeleton are untouched.
//
// What counts as the arm is measured from the model itself, in its own units:
//  - the arm line runs shoulder joint, elbow, wrist, and on past the wrist for the hand
//  - the sleeve radius is how far the vertices that fully follow the arm sit from that line
//  - a vertex further than that from the line is torso: its arm weight fades to nothing over 0.8 radius
//  - a vertex on the body side of the line whose surface faces outward (the flank under the arm) is torso too
//
// These models are sculpted with the arms down, so the forearm and hand are often fused to the hip or the
// hem of the jacket. Once the hem stops following the arm, a triangle that joins the two would stretch into a
// spike whenever the arm moves. Those triangles (one corner on the forearm or hand, another on the torso) are
// removed. That leaves a small opening on the inside of the forearm where the two were stuck together.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { canonical } from '../src/retarget.js';

await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const args = process.argv.slice(2), DRY = args.includes('--dry'), files = args.filter((a) => !a.startsWith('--'));
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len = (a) => Math.hypot(a[0], a[1], a[2]);
// where a joint sits in the mesh's own bind space: the translation of the inverse of its inverse bind matrix
function bindPos(m) {
  const [a, b, c, , d, e, f, , g, h, i, , x, y, z] = m, det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  const r = [(e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det, (f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det, (d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det];
  return [-(r[0] * x + r[3] * y + r[6] * z), -(r[1] * x + r[4] * y + r[7] * z), -(r[2] * x + r[5] * y + r[8] * z)];
}
// distance from p to the arm line; also which stretch it is nearest (0 upper arm, 1 forearm, 2 hand) and the nearest point
function toLine(p, pts) {
  let best = null;
  for (let s = 0; s < pts.length - 1; s++) {
    const a = pts[s], ab = sub(pts[s + 1], a), t = Math.min(1, Math.max(0, dot(sub(p, a), ab) / dot(ab, ab))), q = [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t], d = len(sub(p, q));
    if (!best || d < best.d) best = { d, seg: s, q };
  }
  return best;
}

export async function armFix(file, dry = false) {
  const doc = await io.read(file), root = doc.getRoot(), note = [];
  let changed = 0, moved = 0, total = 0, removed = 0;
  for (const skin of root.listSkins()) {
    const joints = skin.listJoints(), ibm = skin.getInverseBindMatrices(), e = [];
    const pos = joints.map((j, k) => { ibm.getElement(k, e); return bindPos(e); });
    const canon = joints.map((j) => canonical(j.getName()));
    const index = new Map(joints.map((j, k) => [j, k]));
    const arms = [];
    for (const side of ['l', 'r']) {
      const up = canon.indexOf(`upperarm_${side}`), lo = canon.indexOf(`lowerarm_${side}`), ha = canon.indexOf(`hand_${side}`);
      if (up < 0 || lo < 0 || ha < 0) { note.push(`no ${side} arm chain`); continue; }
      const set = new Set(); joints[up].traverse((n) => { if (index.has(n)) set.add(index.get(n)); });
      const fore = sub(pos[ha], pos[lo]); // the hand runs on past the wrist for about half a forearm
      arms.push({ side, set, pts: [pos[up], pos[lo], pos[ha], [pos[ha][0] + fore[0] * 0.6, pos[ha][1] + fore[1] * 0.6, pos[ha][2] + fore[2] * 0.6]], sign: Math.sign(pos[up][0] - pos[canon.indexOf('pelvis') >= 0 ? canon.indexOf('pelvis') : 0][0]) || (side === 'l' ? 1 : -1) });
    }
    const spine = canon.map((c, k) => (c === 'spine' || c === 'pelvis' ? k : -1)).filter((k) => k >= 0);
    const meshes = new Set(); for (const n of root.listNodes()) if (n.getSkin() === skin && n.getMesh()) meshes.add(n.getMesh());
    for (const mesh of meshes) for (const prim of mesh.listPrimitives()) {
      const P = prim.getAttribute('POSITION'), N = prim.getAttribute('NORMAL'), J = prim.getAttribute('JOINTS_0'), W = prim.getAttribute('WEIGHTS_0');
      if (!P || !J || !W) continue;
      const n = P.getCount(), p = [], nr = [0, 0, 0], j = [], w = [];
      // sleeve radius per stretch: the 85th percentile distance of vertices that fully follow the arm
      for (const arm of arms) {
        const ds = [[], [], []];
        for (let i = 0; i < n; i++) { J.getElement(i, j); W.getElement(i, w); let aw = 0, sum = 0; for (let k = 0; k < 4; k++) { sum += w[k]; if (arm.set.has(j[k])) aw += w[k]; } if (sum <= 0 || aw / sum < 0.95) continue; P.getElement(i, p); const t = toLine(p, arm.pts); ds[t.seg].push(t.d); }
        const pct = (a) => (a.length ? a.sort((x, y) => x - y)[Math.floor(a.length * 0.85)] : 0);
        const up = pct(ds[0]) || pct(ds[1]), fo = pct(ds[1]) || up;
        arm.R = [up, fo, Math.max(fo, pct(ds[2])) * 3]; // hands and whatever they hold are left alone
        if (!up) note.push(`no vertices fully on the ${arm.side} arm`);
      }
      const share = arms.map(() => new Float32Array(n)), low = arms.map(() => new Uint8Array(n)); // each vertex's final arm share, and whether it sits on the forearm or hand
      for (let i = 0; i < n; i++) {
        J.getElement(i, j); W.getElement(i, w);
        const sum = w[0] + w[1] + w[2] + w[3]; if (sum <= 0) continue;
        let touched = false;
        for (const arm of arms) {
          if (!arm.R[0]) continue;
          let aw = 0; for (let k = 0; k < 4; k++) if (arm.set.has(j[k])) aw += w[k];
          if (aw / sum < 0.004) continue;
          total++;
          P.getElement(i, p); const t = toLine(p, arm.pts), R = arm.R[t.seg], ai = arms.indexOf(arm);
          share[ai][i] = aw / sum; low[ai][i] = t.seg >= 1 ? 1 : 0;
          let keep = 1 - smooth(1.15 * R, 1.95 * R, t.d);
          if (N && t.seg < 2) { // the flank under the arm: on the body side of the line and facing outward
            N.getElement(i, nr); const med = arm.sign * (t.q[0] - p[0]) / R, out = arm.sign * nr[0] / (len(nr) || 1);
            keep *= 1 - smooth(0.25, 0.6, med) * smooth(0.15, 0.5, out);
          }
          share[ai][i] *= keep;
          if (keep > 0.995) continue;
          // take the arm's share down and hand it to what else the vertex follows, or the nearest spine bone
          let other = 0; for (let k = 0; k < 4; k++) if (!arm.set.has(j[k])) other += w[k];
          const cut = aw * (1 - keep);
          for (let k = 0; k < 4; k++) if (arm.set.has(j[k])) w[k] *= keep;
          if (other > sum * 0.02) { for (let k = 0; k < 4; k++) if (!arm.set.has(j[k])) w[k] += cut * (w[k] / other); }
          else if (spine.length) {
            let sp = spine[0]; for (const s of spine) if (Math.abs(pos[s][1] - p[1]) < Math.abs(pos[sp][1] - p[1])) sp = s;
            let slot = j.indexOf(sp);
            if (slot < 0) { slot = 0; for (let k = 1; k < 4; k++) if (w[k] < w[slot]) slot = k; if (arm.set.has(j[slot])) { /* its leftover goes with the slot */ } j[slot] = sp; w[slot] = 0; }
            w[slot] += cut;
          }
          moved += cut / sum; touched = true;
        }
        if (!touched) continue;
        changed++;
        const s2 = w[0] + w[1] + w[2] + w[3]; for (let k = 0; k < 4; k++) w[k] = (w[k] / s2) * sum;
        if (!dry) { J.setElement(i, j); W.setElement(i, w); }
      }
      // triangles that join the forearm or hand straight to the torso
      const ia = prim.getIndices();
      if (ia) {
        const idx = ia.getArray(), keepIdx = [];
        for (let t = 0; t < idx.length; t += 3) {
          const v = [idx[t], idx[t + 1], idx[t + 2]]; let drop = false;
          for (let a = 0; a < arms.length && !drop; a++) { const s = v.map((i) => share[a][i]); drop = Math.min(...s) < 0.2 && v.some((i, k) => s[k] > 0.7 && low[a][i]); }
          if (drop) removed++; else keepIdx.push(v[0], v[1], v[2]);
        }
        if (!dry && keepIdx.length !== idx.length) prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(new (idx.constructor)(keepIdx)));
      }
    }
  }
  if (!dry && changed) await io.write(file, doc);
  return { file, changed, total, moved: +moved.toFixed(1), cut: removed, note };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!files.length) { console.log('usage: node tools/char-armfix.mjs [--dry] <file.glb> ...'); process.exit(1); }
  for (const f of files) { const r = await armFix(f, DRY); console.log(`${r.file.split('/').pop()}: ${r.changed} of ${r.total} arm-weighted vertices changed, ${r.moved} vertices' worth of weight moved off the arms, ${r.cut} stuck triangles removed${r.note.length ? ' (' + r.note.join('; ') + ')' : ''}${DRY ? ' [dry run]' : ''}`); }
}
