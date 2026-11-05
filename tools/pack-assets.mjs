// Packs the CC0 source assets used by the game. Sources:
// cars: Kenney Car Kit (CC0) in /tmp/cars
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, resample, quantize, meshopt, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
// people now come from tools/build-se-pack.mjs (Street Empire pack)
for (const n of ['sedan', 'sedanSports', 'suv', 'van', 'police', 'taxi']) {
  const doc = await io.read(`/tmp/cars/${n}.glb`);
  await doc.transform(prune(), dedup(), weld(), quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(`public/models/cars/${n}.glb`, doc);
}
