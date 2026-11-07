// Street Empire build kit: fill window openings that have no glass (AI-made models often leave
// the rear side windows open, so you can see through the car). Each open loop is triangulated
// flat in its own plane, both faces, with UVs on a dark glass pixel the model already uses, so the
// game's finish pass shades it like the rest of the glass.
//   node tools/kit-glaze.mjs in.glb out.glb [slot]    then import out.glb as usual (@keep)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';
import { ShapeUtils, Vector2 } from 'three';
import { openWindows, slotOf } from './kit-check.mjs';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'draco3d.decoder': await draco3d.createDecoderModule() });
const [src, dst, slotArg] = process.argv.slice(2); const slot = slotArg || slotOf(src);
const { r, res } = await openWindows(src, slot);
const open = res.filter((w) => w.coverage < 0.5);
if (!open.length) { console.log('no open windows; nothing to fill'); process.exit(0); }
const d = await io.read(src), root = d.getRoot(), mat = root.listMaterials()[0];
// a glass texel: the darkest unsaturated pixel cluster used by existing high side triangles
const tex = mat.getBaseColorTexture(); const { data, info } = await sharp(Buffer.from(tex.getImage())).raw().toBuffer({ resolveWithObject: true });
let best = null;
for (const n of root.listNodes()) { const mesh = n.getMesh(); if (!mesh) continue;
  for (const p of mesh.listPrimitives()) { const P = p.getAttribute('POSITION'), U = p.getAttribute('TEXCOORD_0'), I = p.getIndices(); if (!U) continue;
    for (let i = 0; i < I.getCount(); i += 3) { const ids = [0, 1, 2].map((j) => I.getScalar(i + j)); const ps = ids.map((k) => P.getElement(k, [])); const cy = (ps[0][1] + ps[1][1] + ps[2][1]) / 3; if ((cy - r.mn[1]) / r.size[1] < 0.65) continue;
      const uv = [0, 1].map((j) => ids.reduce((a, k) => a + U.getElement(k, [])[j], 0) / 3); const x = Math.min(info.width - 1, Math.max(0, Math.floor(uv[0] * info.width))), y = Math.min(info.height - 1, Math.max(0, Math.floor(uv[1] * info.height)));
      const o = (y * info.width + x) * info.channels, rr = data[o], g = data[o + 1], b = data[o + 2], mx = Math.max(rr, g, b), sat = mx ? (mx - Math.min(rr, g, b)) / mx : 0;
      if (sat < 0.2 && mx > 12 && mx < 60 && (!best || Math.abs(mx - 34) < Math.abs(best.v - 34))) best = { uv, v: mx }; } } }
console.log('glass texel', best && best.uv.map((v) => v.toFixed(3)).join(','), 'value', best && best.v);
const buf = root.listBuffers()[0], scene = root.getDefaultScene() || root.listScenes()[0];
for (const w of open) {
  const axis = w.kind.includes('side') ? 0 : 2, a1 = axis === 0 ? 2 : 0;
  const pts = w.loop.map((i) => r.verts[i]);
  const flat = pts.map((p) => new Vector2(p[a1], p[1]));
  if (ShapeUtils.isClockWise(flat)) { flat.reverse(); pts.reverse(); }
  const faces = ShapeUtils.triangulateShape(flat, []);
  const out = w.kind.includes('left') ? 1 : w.kind.includes('right') ? -1 : 0;
  const pos = [], nrm = [], uv = [], idx = [];
  for (const p of pts) { pos.push(...p); const nn = [0, 0, 0]; nn[axis] = out || 1; nrm.push(...nn); uv.push(...best.uv); }
  const nPts = pts.length; for (const p of pts) { pos.push(...p); const nn = [0, 0, 0]; nn[axis] = -(out || 1); nrm.push(...nn); uv.push(...best.uv); }
  // winding: front faces point outward along +axis*out
  for (const f of faces) { const [a, b, c] = f; const tri = [a, b, c]; const e1 = [0, 1, 2].map((j) => pts[b][j] - pts[a][j]), e2 = [0, 1, 2].map((j) => pts[c][j] - pts[a][j]); const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]; const faceOut = Math.sign(n[axis]) === (out || 1); const fwd = faceOut ? tri : [a, c, b]; idx.push(...fwd, ...[fwd[0], fwd[2], fwd[1]].map((k) => k + nPts)); }
  const prim = d.createPrimitive().setMaterial(mat)
    .setAttribute('POSITION', d.createAccessor().setType('VEC3').setArray(new Float32Array(pos)).setBuffer(buf))
    .setAttribute('NORMAL', d.createAccessor().setType('VEC3').setArray(new Float32Array(nrm)).setBuffer(buf))
    .setAttribute('TEXCOORD_0', d.createAccessor().setType('VEC2').setArray(new Float32Array(uv)).setBuffer(buf))
    .setIndices(d.createAccessor().setType('SCALAR').setArray(new Uint32Array(idx)).setBuffer(buf));
  scene.addChild(d.createNode('glass_fill').setMesh(d.createMesh('glass_fill').addPrimitive(prim)));
  console.log(`filled ${w.kind} ${w.ext.map((v) => v.toFixed(2)).join('x')} m with ${faces.length * 2} triangles`);
}
await io.write(dst, d);
