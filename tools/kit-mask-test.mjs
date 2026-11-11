// Checks that a finished car from Sovereign Asset survives the importer the way the game needs it:
// - the window mask (material extras.kitMask, mask image in the emissive slot) comes out pixel for pixel
//   the same, lossless, with emissive factor 0, while the base texture is still compressed
// - every wheel node tagged extras.kitWheel keeps its origin on the axle, even when the node held its mesh
//   directly and the mesh is lopsided (quantize would otherwise move that origin)
// - a car without a mask imports exactly as before
// Runs in a temp folder (KIT_DIR), so the installed kit, kit.json and CREDITS.md are never touched.
//   node tools/kit-mask-test.mjs [--out file.glb]   (--out also keeps the built test car, for kit.html checks)
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/core';
import { MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const HERE = path.dirname(new URL(import.meta.url).pathname);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-mask-'));
let failed = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS  ' : 'FAIL  ') + msg); if (!cond) failed++; };

// ---- the test car: a body, four wheels, one material, one 256 px texture ----
// Texture layout (u across, v down): top half is body paint (red) with a window in it that has a bright
// blue sky reflection painted on, the kind the color guess does not read as glass. The bottom quarter is
// dark gray tire rubber, the kind the color guess wrongly reads as glass. The mask says what is what.
const N = 256, WIN = { x0: 64, y0: 24, x1: 192, y1: 88 };
const base = Buffer.alloc(N * N * 3), mask = Buffer.alloc(N * N * 3);
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  const o = (y * N + x) * 3, win = x >= WIN.x0 && x < WIN.x1 && y >= WIN.y0 && y < WIN.y1;
  let c = [150, 24, 20], m = [0, 255, 0]; // body paint
  if (win) { c = (x + y) % 40 < 14 ? [120, 170, 235] : [22, 24, 28]; m = [255, 0, 0]; } // glass with a painted reflection
  else if (y >= 192) { c = [26, 26, 27]; m = [0, 0, 0]; } // tire rubber
  else if (y >= 128) { c = [205, 208, 212]; m = [0, 0, 255]; } // chrome
  base.set(c, o); mask.set(m, o);
}
const png = (buf) => sharp(buf, { raw: { width: N, height: N, channels: 3 } }).png().toBuffer();
const AXLES = { wheel_fl: [-0.8, 0.33, 1.4], wheel_fr: [0.8, 0.33, 1.4], wheel_rl: [-0.8, 0.33, -1.3], wheel_rr: [0.8, 0.33, -1.3] };

// a box as indexed triangles with UVs that all land inside one texture region
function box(doc, buffer, min, max, uv) {
  const [x0, y0, z0] = min, [x1, y1, z1] = max;
  const P = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const quads = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5]];
  const pos = [], tex = [], idx = [];
  for (const q of quads) { const b = pos.length / 3; for (const i of q) { pos.push(...P[i]); } tex.push(uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[3]); idx.push(b, b + 1, b + 2, b, b + 2, b + 3); }
  return doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(pos)).setBuffer(buffer))
    .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(tex)).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(idx)).setBuffer(buffer));
}
async function buildCar(file, withMask) {
  const doc = new Document(), buffer = doc.createBuffer(), scene = doc.createScene('car');
  const mat = doc.createMaterial('car_atlas').setBaseColorTexture(doc.createTexture('albedo').setImage(new Uint8Array(await png(base))).setMimeType('image/png')).setRoughnessFactor(0.9).setMetallicFactor(0);
  if (withMask) mat.setEmissiveTexture(doc.createTexture('mask').setImage(new Uint8Array(await png(mask))).setMimeType('image/png')).setEmissiveFactor([1, 1, 1]).setExtras({ kitMask: true });
  const body = doc.createMesh('body').addPrimitive(box(doc, buffer, [-0.85, 0.3, -2.3], [0.85, 0.95, 2.3], [0.05, 0.4, 0.2, 0.45]).setMaterial(mat)) // lower body: paint
    .addPrimitive(box(doc, buffer, [-0.75, 0.95, -1.2], [0.75, 1.45, 0.9], [0.3, 0.12, 0.7, 0.32]).setMaterial(mat)) // cabin: the window
    .addPrimitive(box(doc, buffer, [-0.9, 0.35, 2.3], [0.9, 0.55, 2.42], [0.3, 0.55, 0.7, 0.7]).setMaterial(mat)); // bumper: chrome
  scene.addChild(doc.createNode('body').setMesh(body));
  for (const [name, axle] of Object.entries(AXLES)) {
    // lopsided on purpose: the hub sticks out one side, so the middle of the mesh is not the axle
    const out = axle[0] < 0 ? -1 : 1;
    const wheel = doc.createMesh(name).addPrimitive(box(doc, buffer, [-0.11, -0.33, -0.33], [0.11, 0.33, 0.33], [0.1, 0.8, 0.9, 0.95]).setMaterial(mat))
      .addPrimitive(box(doc, buffer, out > 0 ? [0.11, -0.1, -0.1] : [-0.31, -0.1, -0.1], out > 0 ? [0.31, 0.1, 0.1] : [-0.11, 0.1, 0.1], [0.1, 0.8, 0.9, 0.95]).setMaterial(mat));
    scene.addChild(doc.createNode(name).setMesh(wheel).setTranslation(axle).setExtras({ kitWheel: true })); // the node holds its mesh directly
  }
  await io.write(file, doc);
}
const run = (args, dir) => execFileSync('node', [path.join(HERE, 'kit-import.mjs'), ...args], { env: { ...process.env, KIT_DIR: dir }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const rgb = async (bytes) => { const { data, info } = await sharp(Buffer.from(bytes)).removeAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, info }; };

async function check(label, flags) {
  console.log(`\n${label}`);
  const dir = path.join(tmp, label.replace(/\W+/g, '-')); fs.mkdirSync(dir);
  const src = path.join(dir, 'in.glb'); await buildCar(src, true);
  const log = run(['add', 'car', 'sedan', src, ...flags], dir);
  const out = await io.read(path.join(dir, 'cars/sedan.glb')), root = out.getRoot();
  const mat = root.listMaterials()[0], mt = mat.getEmissiveTexture();
  ok(root.listMaterials().length === 1, 'still one material');
  ok(mat.getExtras()?.kitMask === true, 'material keeps the kitMask tag');
  ok(!!mt, 'mask image is still in the emissive slot');
  ok(mat.getEmissiveFactor().every((v) => v === 0), 'emissive factor is 0, so the mask never glows');
  if (mt) {
    const got = await rgb(mt.getImage());
    ok(mt.getMimeType() === 'image/webp', 'mask is stored as WebP');
    ok(got.info.width === N && got.info.height === N && Buffer.compare(got.data, mask) === 0, 'mask is pixel for pixel the same as the one that went in (lossless)');
  }
  const bt = mat.getBaseColorTexture(), bgot = await rgb(bt.getImage());
  ok(bt.getMimeType() === 'image/webp' && Buffer.compare(bgot.data, base) !== 0, 'base texture is still compressed as usual');
  ok(/window mask kept lossless/.test(log), 'import summary reports the mask');
  ok(!/no paint material found/.test(log), 'no "name it paint" advice for a masked car');
  return { out, root, log };
}

// 1. the way Sovereign Asset files arrive: @keep
{
  const { root } = await check('masked car, --keep', ['--keep']);
  const wheels = root.listNodes().filter((n) => n.getExtras()?.kitWheel);
  ok(wheels.length === 4, `four tagged wheel nodes (found ${wheels.length})`);
  for (const w of wheels) {
    const want = AXLES[w.getName()], t = w.getWorldTranslation(), d = Math.hypot(t[0] - want[0], t[1] - want[1], t[2] - want[2]);
    ok(!w.getMesh() && d < 1e-5, `${w.getName()} origin is on its axle (off by ${(d * 1000).toFixed(3)} mm)`);
    const b = getBounds(w), out = want[0] < 0 ? -1 : 1, wantMin = [want[0] + (out > 0 ? -0.11 : -0.31), 0, want[2] - 0.33], wantMax = [want[0] + (out > 0 ? 0.31 : 0.11), 0.66, want[2] + 0.33];
    const off = Math.max(...[0, 1, 2].map((i) => Math.max(Math.abs(b.min[i] - wantMin[i]), Math.abs(b.max[i] - wantMax[i]))));
    ok(off < 0.002, `${w.getName()} mesh did not move (off by ${(off * 1000).toFixed(2)} mm)`);
  }
}
// 2. the ordinary path (simplify and merge) must not lose the mask either
await check('masked car, no --keep', []);
// 3. a car with no mask is imported exactly as before
{
  console.log('\nunmasked car');
  const dir = path.join(tmp, 'plain'); fs.mkdirSync(dir);
  const src = path.join(dir, 'in.glb'); await buildCar(src, false);
  const log = run(['add', 'car', 'sedan', src, '--keep'], dir);
  const mat = (await io.read(path.join(dir, 'cars/sedan.glb'))).getRoot().listMaterials()[0];
  ok(!mat.getEmissiveTexture() && !mat.getExtras()?.kitMask, 'no mask appears on a car that had none');
  ok(!/window mask/.test(log) && /no paint material found/.test(log), 'import summary is the same as before');
}
// 4. a mask on the wrong material is refused with a reason
{
  console.log('\nbroken mask');
  const dir = path.join(tmp, 'broken'); fs.mkdirSync(dir);
  const doc = new Document(), buffer = doc.createBuffer(), scene = doc.createScene();
  const mat = doc.createMaterial('car_atlas').setBaseColorTexture(doc.createTexture('albedo').setImage(new Uint8Array(await png(base))).setMimeType('image/png')).setExtras({ kitMask: true });
  scene.addChild(doc.createNode('body').setMesh(doc.createMesh('body').addPrimitive(box(doc, buffer, [-1, 0, -2], [1, 1, 2], [0, 0, 1, 1]).setMaterial(mat))));
  const src = path.join(dir, 'in.glb'); await io.write(src, doc);
  let err = ''; try { run(['add', 'car', 'sedan', src, '--keep'], dir); } catch (e) { err = String(e.stderr || e.message); }
  ok(/tagged kitMask but has no mask image/.test(err), 'a kitMask tag with no mask image fails with the reason');
}

const keep = process.argv.indexOf('--out');
if (keep > 0) { const dst = process.argv[keep + 1]; await buildCar(dst, true); console.log(`\ntest car written to ${dst}`); }
fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed');
process.exit(failed ? 1 : 0);
