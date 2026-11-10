// Fixes vertex normals that point into the model, in installed kit files:
//   node tools/kit-normals.mjs [--dry] [--all] public/models/kit/buildings/*.glb
// Some AI-made models (Meshy) ship with many normals flipped against their faces.
// The sun then lights those spots from behind, so walls show black holes and
// shredded stripes in the game (the corrugated shed had 21 percent of them).
// Only the flipped normals are replaced, with the average of the faces around
// that vertex, so the rest of the shading stays as built. --all recomputes every
// normal that way (needed when the bad ones are skewed, not just flipped, as on
// the corrugated shed); corners stay sharp because their vertices are split in the file.
// The file is rewritten with the importer's own compression; textures are untouched.
import { NodeIO, Logger } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, quantize, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().setLogger(new Logger(Logger.Verbosity.WARN)).registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

const args = process.argv.slice(2), dry = args.includes('--dry'), all = args.includes('--all');
for (const file of args.filter((a) => a.endsWith('.glb'))) {
  const doc = await io.read(file);
  let verts = 0, fixed = 0;
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
    const P = prim.getAttribute('POSITION'), N = prim.getAttribute('NORMAL'), I = prim.getIndices();
    if (!P || !N || prim.getMode() !== 4) continue;
    // area-weighted face normal sum at each vertex
    const acc = new Float64Array(P.getCount() * 3), a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0];
    const tris = (I ? I.getCount() : P.getCount()) / 3;
    for (let t = 0; t < tris; t++) {
      const ix = [0, 1, 2].map((k) => (I ? I.getScalar(t * 3 + k) : t * 3 + k));
      P.getElement(ix[0], a); P.getElement(ix[1], b); P.getElement(ix[2], c);
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
      for (const i of ix) { acc[i * 3] += fx; acc[i * 3 + 1] += fy; acc[i * 3 + 2] += fz; }
    }
    const out = new Float32Array(P.getCount() * 3), s = [0, 0, 0];
    for (let i = 0; i < P.getCount(); i++) {
      N.getElement(i, s);
      const fx = acc[i * 3], fy = acc[i * 3 + 1], fz = acc[i * 3 + 2], L = Math.hypot(fx, fy, fz);
      const flipped = L > 0 && s[0] * fx + s[1] * fy + s[2] * fz < 0;
      if (L > 0 && (flipped || all)) { out.set([fx / L, fy / L, fz / L], i * 3); if (flipped) fixed++; }
      else { const l = Math.hypot(...s) || 1; out.set([s[0] / l, s[1] / l, s[2] / l], i * 3); }
      verts++;
    }
    // a fresh float accessor; quantize() packs it again on write
    prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(out).setBuffer(N.getBuffer()));
  }
  if (!dry && (fixed || all)) { await doc.transform(prune(), quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' })); await io.write(file, doc); }
  console.log(`${file.split('/').pop()}: ${fixed} of ${verts} normals pointed into the model (${(100 * fixed / Math.max(verts, 1)).toFixed(1)}%)${dry ? '' : all ? ', all normals recomputed' : fixed ? ', fixed' : ', file unchanged'}`);
}
