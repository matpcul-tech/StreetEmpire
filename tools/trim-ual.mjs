// Trims Quaternius' Universal Animation Library (CC0, standard version) to
// the clips the game uses and compresses it with meshopt.
// Source: https://github.com/J-Ponzo/gltf-universal-animation-library (glTF/)
// Run: node tools/trim-ual.mjs /path/AnimationLibrary_Godot_Standard.gltf
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, resample, quantize, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
await MeshoptEncoder.ready;
const keep = new Set(['Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Punch_Jab', 'Punch_Cross', 'Punch_Enter', 'Sword_Attack', 'Pistol_Shoot', 'Pistol_Idle_Loop',
  'Death01', 'Hit_Chest', 'Hit_Head', 'Driving_Loop', 'Roll', 'Jump_Start', 'Jump_Loop', 'Sitting_Idle_Loop', 'Idle_Talking_Loop']);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(process.argv[2]);
for (const a of [...doc.getRoot().listAnimations()]) if (!keep.has(a.getName())) a.dispose();
await doc.transform(resample({ tolerance: 0.002 }), prune(), dedup(), quantize({ pattern: /^(NORMAL|TEXCOORD|JOINTS|WEIGHTS)/ }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write('public/models/ual.glb', doc);
