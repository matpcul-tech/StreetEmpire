// Street Empire asset pack builder: node tools/build-se-pack.mjs <UBC dir> <UAL1_Standard.glb>
// Bases (CC0, Quaternius): Universal Base Characters [Standard] bodies, hair and
// brows, and Universal Animation Library 1 clips. All share one 65 joint rig, so
// the builder points every skin at one skeleton, slims the bodies toward the
// v0.2 street proportions, decimates to the phone budget, drops normal and
// roughness maps, shrinks textures to webp and writes meshopt compressed GLBs:
//   public/models/se-pack/people.glb      (medium and high, body about 4k tris)
//   public/models/se-pack/people_lod.glb  (low and potato, body about 2k tris)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { mergeDocuments, weld, prune, dedup, resample, textureCompress, meshopt, unpartition, simplifyPrimitive, joinPrimitives } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import path from 'node:path';
const [UBC, UAL] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const BODY = path.join(UBC, 'Base Characters/Godot - UE'), HAIR = path.join(UBC, 'Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)');
const PARTS = [['male', BODY + '/Superhero_Male_FullBody.gltf'], ['female', BODY + '/Superhero_Female_FullBody.gltf'],
  ['hair_short', HAIR + '/Hair_SimpleParted.gltf'], ['hair_buzz', HAIR + '/Hair_Buzzed.gltf'], ['hair_long', HAIR + '/Hair_Long.gltf'], ['hair_buns', HAIR + '/Hair_Buns.gltf'],
  ['beard', HAIR + '/Hair_Beard.gltf']];
const CLIPS = ['Idle_Loop', 'Idle_Talking_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Punch_Jab', 'Punch_Cross', 'Sword_Attack', 'Pistol_Idle_Loop', 'Pistol_Shoot', 'Death01', 'Hit_Chest', 'Hit_Head', 'Roll', 'Jump_Start', 'Jump_Loop', 'Driving_Loop', 'Sitting_Idle_Loop'];
// lateral slimming per joint group (1 = untouched): narrower chest, waist and limbs
const SLIM = [[/^(spine_0[123]|pelvis)$/, 0.86, 0.92], [/^clavicle/, 0.9, 0.92], [/^(upperarm|lowerarm)/, 0.82, 0.82], [/^(thigh|calf)/, 0.86, 0.88], [/^neck/, 0.9, 0.9]];

async function build(out, bodyRatio, hairRatio, texSize) {
  const doc = await io.read(PARTS[0][1]);
  for (const [, f] of PARTS.slice(1)) mergeDocuments(doc, await io.read(f));
  mergeDocuments(doc, await io.read(UAL));
  const root = doc.getRoot(), skins = root.listSkins(), main = skins[0];
  const byName = new Map(main.listJoints().map((j) => [j.getName(), j]));
  // one skeleton: every other skin and every animation channel is pointed at the male joints
  for (const s of skins.slice(1)) { const js = s.listJoints(); for (const j of js) s.removeJoint(j); for (const j of js) s.addJoint(byName.get(j.getName()) || j); }
  for (const a of root.listAnimations()) {
    if (!CLIPS.includes(a.getName())) { a.dispose(); continue; }
    for (const ch of a.listChannels()) { const t = ch.getTargetNode(); const m = t && byName.get(t.getName()); if (!m || ch.getTargetPath() === 'scale' || (ch.getTargetPath() === 'translation' && t.getName() !== 'pelvis')) { ch.getSampler()?.dispose(); ch.dispose(); } else ch.setTargetNode(m); }
  }
  // name meshes by part, drop the UAL mannequin and every non main armature
  const scene = root.listScenes()[0];
  const meshNodes = root.listNodes().filter((n) => n.getMesh() && n.getSkin());
  const partOf = new Map();
  // the merged documents arrive in PARTS order; the male file has 3 meshes, the female 3, hairs 1 each, UAL 1
  const names = [['m_brows', 'm_eyes', 'm_body'], ['f_brows', 'f_eyes', 'f_body'], ['hair_short'], ['hair_buzz'], ['hair_long'], ['hair_buns'], ['beard'], ['mannequin']];
  let k = 0; names.forEach((ns, i) => ns.forEach((nm) => { const n = meshNodes[k++]; if (n) partOf.set(n, nm); }));
  for (const [n, nm] of partOf) { n.setName(nm); n.getMesh().setName(nm); if (nm === 'mannequin') { n.getMesh().dispose(); n.dispose(); } }
  // reparent every kept mesh node and the main armature into the first scene; remove other armature roots
  const mainRoot = (() => { let j = main.listJoints()[0]; while (j.getParentNode && j.getParentNode()) j = j.getParentNode(); return j; })();
  for (const s of root.listScenes()) for (const c of s.listChildren()) s.removeChild(c);
  scene.addChild(mainRoot); for (const [n, nm] of partOf) if (nm !== 'mannequin') { n.getParentNode()?.removeChild(n); scene.addChild(n); }
  for (const s of root.listScenes()) if (s !== scene) s.dispose();
  for (const s of root.listSkins()) if (s !== main) s.setSkeleton(byName.get('root') || null);
  // strip extras: extra uv sets, vertex colors, normal and roughness maps
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) for (const sem of p.listSemantics()) if (/^(TEXCOORD_[1-9]|COLOR_)/.test(sem)) p.setAttribute(sem, null);
  for (const mat of root.listMaterials()) { mat.setNormalTexture(null); mat.setMetallicRoughnessTexture(null); mat.setMetallicFactor(0); mat.setRoughnessFactor(0.8); }
  // slim the bodies: pull each vertex toward its main joint along x and z
  const ibmJointPos = (skin) => skin.listJoints().map((j, i) => { const m = skin.getInverseBindMatrices().getElement(i, []); return inv(m); });
  for (const [n, nm] of partOf) if (/_body$/.test(nm)) {
    const skin = n.getSkin(), jp = ibmJointPos(skin), jn = skin.listJoints().map((j) => j.getName());
    for (const p of n.getMesh().listPrimitives()) { const P = p.getAttribute('POSITION'), J = p.getAttribute('JOINTS_0'), W = p.getAttribute('WEIGHTS_0'); const v = [], jj = [], ww = [];
      for (let i = 0; i < P.getCount(); i++) { P.getElement(i, v); J.getElement(i, jj); W.getElement(i, ww); let sx = 0, sz = 0, cx = 0, cz = 0, tw = 0;
        for (let q = 0; q < 4; q++) { if (!ww[q]) continue; const name = jn[jj[q]], g = SLIM.find(([re]) => re.test(name)) || [0, 1, 1]; const o = jp[jj[q]];
          const limb = /arm|thigh|calf/.test(name); sx += ww[q] * g[1]; sz += ww[q] * g[2]; cx += ww[q] * (limb ? o[12] : 0); cz += ww[q] * (limb || /spine|pelvis|neck|clav/.test(name) ? o[14] : v[2]); tw += ww[q]; }
        if (!tw) continue; sx /= tw; sz /= tw; cx /= tw; cz /= tw;
        // limbs thin around their own axis (y for arms is along x, so arms thin in y and z)
        const nmj = jn[jj[ww.indexOf(Math.max(...ww))]];
        if (/arm/.test(nmj)) { const o = jp[jj[ww.indexOf(Math.max(...ww))]]; v[1] = o[13] + (v[1] - o[13]) * sx; v[2] = o[14] + (v[2] - o[14]) * sz; }
        else { v[0] = cx + (v[0] - cx) * sx; v[2] = cz + (v[2] - cz) * sz; }
        P.setElement(i, v); } } }
  await doc.transform(weld());
  // per part simplify: gltf-transform simplify is document wide, so run it per mesh by temporarily detaching
  for (const [n, nm] of partOf) { if (nm === 'mannequin') continue; const m = n.getMesh(); const r = /_body$/.test(nm) ? bodyRatio : /eyes|brows/.test(nm) ? hairRatio * 0.6 : /long|buns/.test(nm) ? hairRatio * 0.7 : hairRatio;
    for (const p of m.listPrimitives()) simplifyPrimitive(p, { simplifier: MeshoptSimplifier, ratio: r, error: 0.02, lockBorder: false }); }
  // bake one skinned mesh per look (sex x hair x beard): body plus eyes, brows, hair and beard joined into a
  // single primitive, so a character is one draw call. Part textures are baked into a per vertex _BAKE
  // attribute (rgb = texel color, a = part: 0 body, 1 eyes, 2 hair, brows and beard).
  await bakeAndJoin(doc, partOf, main);
  await doc.transform(unpartition(), prune(), dedup(), resample(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [texSize, texSize], quality: 80 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(out, doc);
  let tris = {}; for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) tris[m.getName()] = (tris[m.getName()] || 0) + p.getIndices().getCount() / 3;
  console.log(out, JSON.stringify(tris), 'anims', doc.getRoot().listAnimations().length);
}
const LOOKS = { m: [['short', 0], ['short', 1], ['buzz', 0], ['buzz', 1], ['none', 0], ['none', 1]], f: [['long', 0], ['buns', 0], ['buzz', 0], ['none', 0]] };
async function texels(tex) { const { data, info } = await sharp(Buffer.from(tex.getImage())).removeAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, w: info.width, h: info.height }; }
async function normalizePrim(p, part, doc) {
  const buf = doc.getRoot().listBuffers()[0], n = p.getAttribute('POSITION').getCount(), v = [];
  const conv = (sem, Arr, size) => { const a = p.getAttribute(sem); const out = new Arr(n * size); for (let i = 0; i < n; i++) { a.getElement(i, v); for (let k = 0; k < size; k++) out[i * size + k] = v[k] ?? 0; } p.setAttribute(sem, doc.createAccessor().setType(size === 2 ? 'VEC2' : size === 3 ? 'VEC3' : 'VEC4').setArray(out).setBuffer(buf)); };
  conv('POSITION', Float32Array, 3); conv('NORMAL', Float32Array, 3); conv('TEXCOORD_0', Float32Array, 2); conv('JOINTS_0', Uint16Array, 4); conv('WEIGHTS_0', Float32Array, 4);
  for (const sem of p.listSemantics()) if (!['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0'].includes(sem)) p.setAttribute(sem, null);
  const bake = new Float32Array(n * 4), uv = p.getAttribute('TEXCOORD_0'), tex = part ? p.getMaterial()?.getBaseColorTexture() : null, T = tex ? await texels(tex) : null;
  for (let i = 0; i < n; i++) { bake[i * 4 + 3] = part; if (!T) continue; uv.getElement(i, v); const x = Math.min(T.w - 1, Math.floor((((v[0] % 1) + 1) % 1) * T.w)), y = Math.min(T.h - 1, Math.floor((((v[1] % 1) + 1) % 1) * T.h)), o = (y * T.w + x) * 3;
    for (let k = 0; k < 3; k++) bake[i * 4 + k] = T.data[o + k] / 255; }
  p.setAttribute('_BAKE', doc.createAccessor().setType('VEC4').setArray(bake).setBuffer(buf));
  if (!p.getIndices()) { const idx = new Uint32Array(n).map((_, i) => i); p.setIndices(doc.createAccessor().setType('SCALAR').setArray(idx).setBuffer(buf)); }
  else { const I = p.getIndices(); p.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(I.getArray())).setBuffer(buf)); }
}
async function bakeAndJoin(doc, partOf, main) {
  const byPart = {}; for (const [n, nm] of partOf) if (nm !== 'mannequin') byPart[nm] = n;
  for (const [k, node] of Object.entries(byPart)) for (const p of node.getMesh().listPrimitives()) await normalizePrim(p, /_body$/.test(k) ? 0 : /eyes$/.test(k) ? 1 : 2, doc);
  const scene = doc.getRoot().listScenes()[0];
  for (const sx of ['m', 'f']) for (const [hair, beard] of LOOKS[sx]) {
    const parts = [sx + '_body', sx + '_eyes', sx + '_brows', hair === 'none' ? null : 'hair_' + hair, beard ? 'beard' : null].filter(Boolean);
    const prims = parts.flatMap((k) => byPart[k].getMesh().listPrimitives());
    const j = joinPrimitives(prims, { skipValidation: true }); j.setMaterial(sx === 'm' ? byPart.m_body.getMesh().listPrimitives()[0].getMaterial() : byPart.f_body.getMesh().listPrimitives()[0].getMaterial());
    const name = `${sx}_body_${hair}${beard ? '_beard' : ''}`;
    scene.addChild(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(j)).setSkin(main));
  }
  for (const n of Object.values(byPart)) { n.getMesh().dispose(); n.dispose(); }
}
function inv(m) { // 4x4 column major inverse (affine)
  const [a, b, c, , d, e, f, , g, h, i, , x, y, z] = m; const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
  const r = [A, -(b * i - c * h), b * f - c * e, 0, B, a * i - c * g, -(a * f - c * d), 0, C, -(a * h - b * g), a * e - b * d, 0].map((v) => v / det);
  r[12] = -(x * r[0] + y * r[4] + z * r[8]); r[13] = -(x * r[1] + y * r[5] + z * r[9]); r[14] = -(x * r[2] + y * r[6] + z * r[10]); r[15] = 1; return r;
}
await MeshoptSimplifier.ready; await MeshoptEncoder.ready;
await build('public/models/se-pack/people.glb', 0.3, 0.5, 512);
await build('public/models/se-pack/people_lod.glb', 0.17, 0.3, 256);
