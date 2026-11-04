// Packs the CC0 source assets used by the game. Sources:
// characters: Quaternius Ultimate Animated Character Pack (CC0) in /tmp/chars
// cars: Kenney Car Kit (CC0) in /tmp/cars
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, resample, quantize, meshopt, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const keep = new Set(['Death', 'Idle', 'Jump', 'Punch', 'RecieveHit', 'Run', 'Shoot_OneHanded', 'SwordSlash', 'Walk', 'Victory', 'SitDown']);
const people = ['Casual_Male', 'Casual2_Male', 'Casual3_Male', 'Casual_Female', 'Suit_Male', 'BlueSoldier_Male'];
for (const n of people) {
  const doc = await io.read(`/tmp/chars/${n}.gltf`);
  for (const a of [...doc.getRoot().listAnimations()]) if (n !== 'Casual_Male' || !keep.has(a.getName())) {

    for (const ch of [...a.listChannels()]) ch.dispose();
    a.dispose();
  }
  await doc.transform(resample(), prune(), dedup(), quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(`public/models/people/${n}.glb`, doc);
}
for (const n of ['sedan', 'sedanSports', 'suv', 'van', 'police', 'taxi']) {
  const doc = await io.read(`/tmp/cars/${n}.glb`);
  await doc.transform(prune(), dedup(), weld(), quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(`public/models/cars/${n}.glb`, doc);
}
