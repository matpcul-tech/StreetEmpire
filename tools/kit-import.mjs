// Street Empire build kit importer. Turns any downloaded model (.glb, .gltf
// or a .zip from Sketchfab and similar sites) into a phone-ready kit asset and
// records it in public/models/kit/kit.json, which the game reads at load.
//
//   node tools/kit-import.mjs add car sedan ~/Downloads/old-sedan.zip [--yaw 180] [--length 4.6] [--no-paint]
//   node tools/kit-import.mjs add building house ~/Downloads/bungalow.glb [--yaw 90] [--footprint 12]
//   node tools/kit-import.mjs inbox          process everything in kit-inbox/ (used by the GitHub workflow)
//   node tools/kit-import.mjs list
//   node tools/kit-import.mjs remove car sedan
//   node tools/kit-import.mjs remove building house [variant file name]
//
// Steps: dedup, prune, weld, textures to WebP at 1024 px or less, simplify
// when over the triangle budget, quantize and meshopt. Node names survive so
// wheels named wheel, tire, tyre or rim still spin in game.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/core';
import { dedup, prune, weld, quantize, meshopt, resample, textureCompress, simplify, unpartition, flatten, join } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import draco3d from 'draco3dgltf';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const KIT = path.join(ROOT, 'public/models/kit');
const MANIFEST = path.join(KIT, 'kit.json');
const INBOX = path.join(ROOT, 'kit-inbox');
export const CAR_SLOTS = ['sedan', 'muscle', 'suv', 'van', 'taxi', 'police', 'lowrider'];
export const BUILDING_SLOTS = ['house', 'store', 'apt', 'tower', 'shed'];
// phone budgets: triangles per model and texture size
const BUDGET = { car: { tris: 40000, tex: 1024 }, building: { tris: 60000, tex: 1024 } };
const WHEEL = /^(?!.*steer)(?=.*(?:^|[^a-z])(wheel|tire|tyre|rim))/i; // road wheels, not the steering wheel; "rim" must start a word so Trim and Primer do not count

await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
// let edges collapse across UV and normal seams (store-bought models are split at every seam) and drop tiny detached bits
const PERMISSIVE = Object.assign(Object.create(MeshoptSimplifier), { simplify: (i, p, s, t, e, f = []) => MeshoptSimplifier.simplify(i, p, s, t, e, [...f, 'Permissive', 'Prune']) });
// Draco is read (many downloads use it) but written back as meshopt, which three.js decodes faster on phones
const { MeshoptDecoder } = await import('meshoptimizer'); await MeshoptDecoder.ready;
import { Logger } from '@gltf-transform/core';
const io = new NodeIO().setLogger(new Logger(Logger.Verbosity.WARN)).registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder, 'draco3d.decoder': await draco3d.createDecoderModule() });

const readManifest = () => (fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : { cars: {}, buildings: {} });
const writeManifest = (m) => { fs.mkdirSync(KIT, { recursive: true }); fs.writeFileSync(MANIFEST, JSON.stringify(m, null, 2) + '\n'); writeCredits(m); };
// CREDITS.md keeps a generated Build kit section, so CC BY models are always credited in the repo
function writeCredits(m) {
  const f = path.join(ROOT, 'CREDITS.md'); if (!fs.existsSync(f)) return;
  const START = '<!-- kit-credits:start -->', END = '<!-- kit-credits:end -->';
  const rows = [];
  for (const [slot, e] of Object.entries(m.cars || {})) rows.push(`| car: ${slot} | ${e.credit || 'no credit given (add a .txt next to the upload)'} |`);
  for (const [slot, list] of Object.entries(m.buildings || {})) for (const e of [].concat(list)) rows.push(`| building: ${slot} (${path.basename(e.file, '.glb')}) | ${e.credit || 'no credit given (add a .txt next to the upload)'} |`);
  const block = `${START}\n## Build kit models\n\nInstalled through tools/kit-import.mjs (generated from public/models/kit/kit.json).\n\n${rows.length ? '| Slot | Credit and license |\n|---|---|\n' + rows.join('\n') : 'None installed.'}\n${END}`;
  let text = fs.readFileSync(f, 'utf8');
  text = text.includes(START) ? text.replace(new RegExp(START + '[\\s\\S]*?' + END), block) : text.trimEnd() + '\n\n' + block + '\n';
  fs.writeFileSync(f, text);
}

// a .zip is unpacked and its first .glb or .gltf is used
function resolveSource(file) {
  if (!/\.zip$/i.test(file)) return file;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-'));
  execFileSync('unzip', ['-q', '-o', file, '-d', dir]);
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const all = walk(dir), pick = all.find((f) => /\.glb$/i.test(f)) || all.find((f) => /\.gltf$/i.test(f));
  if (!pick) throw new Error(`no .glb or .gltf inside ${path.basename(file)} (FBX and OBJ need converting first, see docs/build-kit.md)`);
  return pick;
}

function triCount(doc) {
  let t = 0;
  for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) {
    const idx = p.getIndices(), pos = p.getAttribute('POSITION'); if (!pos) continue;
    if (p.getMode() === 4) t += (idx ? idx.getCount() : pos.getCount()) / 3;
  }
  return Math.round(t);
}

// Fewer draw calls: everything is flattened and joined by material. For cars
// the wheel parts (tire, rim, nuts, brake disc) are first gathered under one
// node per corner (wheel_fl, wheel_fr, wheel_rl, wheel_rr) so each corner
// still spins on its own. Store-bought cars often have 50+ parts; this brings
// them down to about one draw call per material.
async function mergeForPhones(doc, kind) {
  const root = doc.getRoot();
  await doc.transform(flatten());
  const scene = root.getDefaultScene() || root.listScenes()[0];
  const meshNodes = root.listNodes().filter((n) => n.getMesh());
  // node, mesh and material names: many models only name their tires through the material (Tireside, Rim1)
  const label = (n) => [n.getName(), n.getMesh().getName(), ...n.getMesh().listPrimitives().map((p) => p.getMaterial()?.getName() || '')].join(' ');
  const keep = new Set();
  if (kind === 'car') {
    const all = getBounds(scene), cx = (all.min[0] + all.max[0]) / 2, cz = (all.min[2] + all.max[2]) / 2, H = all.max[1] - all.min[1], L = all.max[2] - all.min[2];
    const corners = {};
    for (const n of meshNodes) {
      if (!WHEEL.test(label(n))) continue;
      const b = getBounds(n), sy = b.max[1] - b.min[1], sz = b.max[2] - b.min[2];
      if (sy > H * 0.7 || sz > L * 0.4) continue; // one mesh with every wheel in it stays in the body
      const key = (b.min[0] + b.max[0]) / 2 > cx ? 'r' : 'l', fz = (b.min[2] + b.max[2]) / 2 > cz ? 'p' : 'n';
      (corners[fz + key] ||= []).push(n);
    }
    for (const [k, parts] of Object.entries(corners)) {
      const c = [0, 0, 0]; for (const n of parts) { const b = getBounds(n); for (let i = 0; i < 3; i++) c[i] += (b.min[i] + b.max[i]) / 2 / parts.length; }
      const corner = doc.createNode('wheel_' + k).setTranslation(c); scene.addChild(corner); keep.add(corner);
      for (const n of parts) { const t = n.getTranslation(); scene.removeChild(n); n.setTranslation([t[0] - c[0], t[1] - c[1], t[2] - c[2]]); corner.addChild(n); }
    }
  }
  for (const n of root.listNodes()) if (!keep.has(n)) { n.setName(''); if (n.getMesh()) n.getMesh().setName(''); }
  await doc.transform(join({ keepNamed: true }), prune());
}

export async function importModel(kind, slot, file, opts = {}) {
  const slots = kind === 'car' ? CAR_SLOTS : BUILDING_SLOTS;
  if (!slots.includes(slot)) throw new Error(`unknown ${kind} slot "${slot}". Use one of: ${slots.join(', ')}`);
  const src = resolveSource(file);
  const doc = await io.read(src);
  const B = BUDGET[kind], before = triCount(doc), notes = [];
  for (const e of doc.getRoot().listExtensionsUsed()) if (e.extensionName === 'KHR_draco_mesh_compression') e.dispose();
  await doc.transform(dedup(), prune(), resample(), weld(), unpartition());
  // cars: guess which way the model faces from its lamps (tail or brake lights at the back)
  if (kind === 'car' && opts.yaw == null) {
    const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0], all = getBounds(scene), mid = (all.min[2] + all.max[2]) / 2;
    let back = 0, front = 0;
    for (const n of doc.getRoot().listNodes()) {
      const mesh = n.getMesh(); if (!mesh) continue;
      const label = [n.getName(), mesh.getName(), ...mesh.listPrimitives().map((p) => p.getMaterial()?.getName() || '')].join(' ');
      const z = (() => { const b = getBounds(n); return (b.min[2] + b.max[2]) / 2 - mid; })();
      if (/tail|rear|brake|red/i.test(label) && /light|lamp/i.test(label)) back += Math.sign(z);
      else if (/head|front/i.test(label) && /light|lamp/i.test(label)) front += Math.sign(z);
    }
    const facesMinusZ = back > 0 || (back === 0 && front < 0);
    opts.yaw = facesMinusZ ? 180 : 0;
    notes.push(back || front ? `front detected from the lamps: yaw ${opts.yaw}` : 'could not find lamps to tell the front; assumed it faces +z (yaw 0). Check it in kit.html');
  }
  if (before > B.tris) {
    // Textured models keep their UV seams locked: collapsing across a seam drags the texture
    // across the surface, which shows as patchy paint and sawtooth window edges. Only untextured
    // models (flat colors per material) may collapse across seams to reach the budget.
    const textured = doc.getRoot().listTextures().length > 0 && process.env.KIT_PERMISSIVE !== '1';
    const simplifier = textured ? MeshoptSimplifier : PERMISSIVE;
    // step the allowed error up until the model fits (1 to 8 percent of its size)
    for (const error of [0.01, 0.02, 0.04, 0.08]) {
      if (triCount(doc) <= B.tris * 1.15) break;
      await doc.transform(simplify({ simplifier, ratio: Math.max(0.05, B.tris / triCount(doc)), error }), prune());
    }
    notes.push(`simplified ${before} to ${triCount(doc)} triangles (budget ${B.tris}${textured ? ', texture seams kept' : ''})`);
    if (textured && triCount(doc) > B.tris * 1.5) notes.push(`still ${triCount(doc)} triangles after keeping the texture seams; this model is heavy for phones, a lower poly download will look and run better`);
  }
  await mergeForPhones(doc, kind);
  await doc.transform(
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [B.tex, B.tex], quality: 82 }),
    quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  const names = doc.getRoot().listNodes().map((n) => n.getName() + ' ' + (n.getMesh() ? n.getMesh().getName() : ''));
  const wheels = doc.getRoot().listNodes().filter((n) => /^wheel_/.test(n.getName())).length;
  if (kind === 'car' && !wheels) notes.push('no wheel nodes found (name them wheel, tire or rim to make them spin); the car still drives');
  const mats = doc.getRoot().listMaterials().map((m) => m.getName());
  if (kind === 'car' && opts.paint !== false && !mats.some((n) => /paint|body|carpaint|exterior|shell/i.test(n))) notes.push('no paint material found (name it paint or body to get per-car colors); the model keeps its own color');

  const variant = opts.name || slot;
  const rel = `${kind === 'car' ? 'cars' : 'buildings'}/${variant}.glb`;
  fs.mkdirSync(path.join(KIT, path.dirname(rel)), { recursive: true });
  await io.write(path.join(KIT, rel), doc);
  const bytes = fs.statSync(path.join(KIT, rel)).size;
  if (bytes > 4e6) notes.push(`file is ${(bytes / 1e6).toFixed(1)} MB; phones load faster under 3 MB`);

  const m = readManifest(); m.cars ||= {}; m.buildings ||= {};
  const credit = opts.credit || null;
  if (kind === 'car') {
    m.cars[slot] = { file: rel, yaw: opts.yaw || 0, length: opts.length || 4.4, paint: opts.paint !== false, ...(credit && { credit }) };
  } else {
    const list = (m.buildings[slot] = [].concat(m.buildings[slot] || []).filter((e) => e.file !== rel));
    list.push({ file: rel, yaw: opts.yaw || 0, ...(opts.footprint && { footprint: opts.footprint }), ...(credit && { credit }) });
  }
  writeManifest(m);
  return { slot, kind, file: rel, tris: triCount(doc), before, bytes, wheels, materials: mats.length, notes };
}

export function removeModel(kind, slot, variant) {
  const m = readManifest();
  const drop = (rel) => { const f = path.join(KIT, rel); if (fs.existsSync(f)) fs.rmSync(f); };
  if (kind === 'car' && m.cars?.[slot]) { drop(m.cars[slot].file); delete m.cars[slot]; }
  if (kind === 'building' && m.buildings?.[slot]) {
    const keep = [];
    for (const e of [].concat(m.buildings[slot])) { if (!variant || path.basename(e.file, '.glb') === variant) drop(e.file); else keep.push(e); }
    if (keep.length) m.buildings[slot] = keep; else delete m.buildings[slot];
  }
  writeManifest(m);
}

// kit-inbox/cars/<slot>.glb|.zip and kit-inbox/buildings/<slot>[-variant].glb|.zip
// optional settings in the file name: sedan@yaw180.glb, house-2@yaw90@fp12.zip
function parseInboxName(base) {
  const [stem, ...tags] = base.replace(/\.(glb|gltf|zip)$/i, '').split('@');
  const opts = {};
  for (const t of tags) {
    let r;
    if ((r = /^yaw(-?\d+(\.\d+)?)$/i.exec(t))) opts.yaw = +r[1];
    else if ((r = /^len(\d+(\.\d+)?)$/i.exec(t))) opts.length = +r[1];
    else if ((r = /^fp(\d+(\.\d+)?)$/i.exec(t))) opts.footprint = +r[1];
    else if (/^nopaint$/i.test(t)) opts.paint = false;
  }
  return { stem: stem.toLowerCase(), opts };
}

async function processInbox() {
  const results = [];
  for (const [dir, kind, slots] of [['cars', 'car', CAR_SLOTS], ['buildings', 'building', BUILDING_SLOTS]]) {
    const d = path.join(INBOX, dir); if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) {
      if (!/\.(glb|gltf|zip)$/i.test(f)) continue;
      const { stem, opts } = parseInboxName(f);
      const slot = slots.find((s) => stem === s || stem.startsWith(s + '-'));
      try {
        if (!slot) throw new Error(`"${f}" does not start with a ${kind} slot name (${slots.join(', ')})`);
        const creditFile = path.join(d, f.replace(/\.(glb|gltf|zip)$/i, '.txt'));
        if (fs.existsSync(creditFile)) opts.credit = fs.readFileSync(creditFile, 'utf8').trim();
        const r = await importModel(kind, slot, path.join(d, f), { ...opts, name: stem });
        results.push({ ok: true, src: f, ...r });
        fs.rmSync(path.join(d, f)); if (fs.existsSync(creditFile)) fs.rmSync(creditFile);
      } catch (e) { results.push({ ok: false, src: f, error: e.message }); }
    }
  }
  return results;
}

function report(results) {
  const lines = ['## Build kit import', ''];
  for (const r of results) {
    if (!r.ok) { lines.push(`- FAILED ${r.src}: ${r.error}`); continue; }
    lines.push(`- ${r.src} to ${r.kind} slot **${r.slot}** (${r.file}): ${r.tris.toLocaleString()} triangles, ${(r.bytes / 1e6).toFixed(2)} MB, ${r.wheels} wheel parts, ${r.materials} materials`);
    for (const n of r.notes) lines.push(`  - ${n}`);
  }
  if (!results.length) lines.push('- nothing to import');
  const text = lines.join('\n');
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + '\n');
  return text;
}

const [cmd, ...rest] = process.argv.slice(2);
const flags = {}; const pos = [];
for (let i = 0; i < rest.length; i++) {
  const a = rest[i];
  if (a === '--no-paint') flags.paint = false;
  else if (a.startsWith('--')) flags[a.slice(2)] = isNaN(+rest[i + 1]) ? rest[i + 1] : +rest[i + 1], i++;
  else pos.push(a);
}
if (cmd === 'add') {
  const [kind, slot, file] = pos;
  if (!kind || !slot || !file) { console.error('usage: kit-import.mjs add <car|building> <slot> <file>'); process.exit(1); }
  report([{ ok: true, src: path.basename(file), ...(await importModel(kind, slot, file, flags)) }]);
} else if (cmd === 'inbox') {
  const r = report(await processInbox());
  if (r.includes('FAILED')) process.exitCode = 1;
} else if (cmd === 'list') {
  console.log(JSON.stringify(readManifest(), null, 2));
} else if (cmd === 'remove') {
  const [kind, slot, variant] = pos; removeModel(kind, slot, variant); console.log(`removed ${kind} ${slot}${variant ? ' ' + variant : ''}`);
} else {
  console.log('usage: kit-import.mjs add|inbox|list|remove (see the top of this file)');
}
