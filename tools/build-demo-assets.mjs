// Builds demo-only models under public/demo/street/models.
// These files are fetched only when the page is opened with ?demo=street.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, prune, dedup, resample, meshopt, unpartition, simplifyPrimitive } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import fs from 'node:fs';

const KEEP = ['Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop'];
const SRC_MH = process.argv[2] || '/tmp/se-demo-dl/human-base-rigged.glb';
const SRC_UAL = process.argv[3] || 'public/models/se-pack/people.glb';
const OUT_CREW = 'public/demo/street/models/crew.glb';
const OUT_UAL = 'public/demo/street/models/ual-loco.glb';

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
});

function countTris(doc) {
  let n = 0;
  for (const m of doc.getRoot().listMeshes()) {
    for (const p of m.listPrimitives()) {
      const idx = p.getIndices();
      n += idx ? idx.getCount() / 3 : p.getAttribute('POSITION').getCount() / 3;
    }
  }
  return Math.round(n);
}

const mh = await io.read(SRC_MH);
for (const node of mh.getRoot().listNodes()) {
  if (node.getName() === 'Root') node.setName('root');
  if (node.getName() === 'head') node.setName('Head');
  if (node.getName().includes('anatomical') || node.getName().includes('Avery')) node.setName('crew_body');
}
for (const mesh of mh.getRoot().listMeshes()) {
  mesh.setName('crew_body');
  for (const p of mesh.listPrimitives()) {
    simplifyPrimitive(p, { simplifier: MeshoptSimplifier, ratio: 0.13, error: 0.015, lockBorder: false });
  }
}
await mh.transform(weld(), unpartition(), prune(), dedup(), resample(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(OUT_CREW, mh);
console.log('crew', OUT_CREW, 'tris', countTris(mh), 'bytes', fs.statSync(OUT_CREW).size);

const ual = await io.read(SRC_UAL);
const root = ual.getRoot();
for (const a of root.listAnimations()) {
  if (!KEEP.includes(a.getName())) a.dispose();
}
const keep = new Set();
for (const a of root.listAnimations()) {
  for (const ch of a.listChannels()) {
    let n = ch.getTargetNode();
    while (n) { keep.add(n); n = n.getParentNode(); }
  }
}
for (const node of [...root.listNodes()]) {
  if (node.getMesh()) { const mesh = node.getMesh(); node.setMesh(null); mesh.dispose(); }
}
for (const skin of [...root.listSkins()]) skin.dispose();
for (const node of [...root.listNodes()]) {
  if (keep.has(node)) continue;
  node.getParentNode()?.removeChild(node);
  for (const s of root.listScenes()) s.removeChild(node);
}
for (const node of [...root.listNodes()]) {
  if (!keep.has(node)) node.dispose();
}
const scene = root.listScenes()[0];
for (const t of [...keep].filter((n) => !n.getParentNode())) {
  if (!scene.listChildren().includes(t)) scene.addChild(t);
}
await ual.transform(unpartition(), prune(), dedup(), resample(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(OUT_UAL, ual);
const names = ual.getRoot().listNodes().map((n) => n.getName());
const pelvises = names.filter((n) => n === 'pelvis');
console.log('ual', OUT_UAL, 'anims', ual.getRoot().listAnimations().map((a) => a.getName()), 'nodes', names.length, 'pelvis', pelvises.length, 'skins', ual.getRoot().listSkins().length, 'bytes', fs.statSync(OUT_UAL).size);
if (pelvises.length !== 1) console.warn('expected exactly one pelvis');
