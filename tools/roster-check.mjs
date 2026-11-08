// Confirms public/models/kit/character-roster.json totals match its file list.
// Run: node tools/roster-check.mjs
import fs from 'node:fs';
import path from 'node:path';
const file = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../public/models/kit/character-roster.json');
const roster = JSON.parse(fs.readFileSync(file, 'utf8'));
const fail = [];
const files = roster.files || [];
const n = (pred) => files.filter(pred).length;
const expect = [
  ['rosterFiles', files.length, 24],
  ['installed', n((f) => f.status === 'installed'), 6],
  ['remainingNames', n((f) => f.status !== 'installed'), 18],
  ['inProgress', n((f) => f.status === 'in_progress'), 0],
  ['paidDistinctStillToCommission', n((f) => f.generation === 'paid_distinct' && f.status === 'needed'), 13],
  ['noNewGeneration', n((f) => f.generation === 'alias' || f.generation === 'local_texture'), 5],
  ['distinctBuilds', n((f) => f.countsAsDistinctBuild), 19],
];
for (const [key, got, want] of expect) {
  if (roster.counts[key] !== got || got !== want) fail.push(`${key}: json ${roster.counts[key]}, list ${got}, want ${want}`);
}
const reds = files.find((f) => f.file === 'characters/reds-m-1.glb');
if (!reds || reds.jersey !== 12 || reds.status !== 'installed' || !/number 12/.test(reds.prompt)) fail.push('reds-m-1 must be installed with jersey 12');
if (reds.joints !== 32 || reds.fingerBones !== 0) fail.push('reds-m-1 joint count');
if (reds.measuredHeightM !== 1.7 || reds.fittedHeightM !== 1.82) fail.push('reds-m-1 height record');
const blues = files.find((f) => f.file === 'characters/blues-m-1.glb');
if (!blues || blues.status !== 'installed' || blues.gender !== 'm') fail.push('blues-m-1 must be installed as a man');
if (blues.joints !== 66 || blues.fingerBones !== 40 || blues.jointIndexDiffFromPlayer !== 16) fail.push('blues-m-1 rig record');
if (blues.measuredHeightM !== 1.7 || blues.fittedHeightM !== 1.84) fail.push('blues-m-1 height record');
const golds = files.find((f) => f.file === 'characters/golds-m-1.glb');
if (!golds || golds.status !== 'installed' || golds.gender !== 'm') fail.push('golds-m-1 must be installed as a man');
if (golds.joints !== 66 || golds.fingerBones !== 40 || golds.jointIndexDiffFromPlayer !== 16 || golds.jointIndexDiffFromBlue !== 32) fail.push('golds-m-1 rig record');
if (golds.measuredHeightM !== 1.9 || golds.fittedHeightM !== 1.9) fail.push('golds-m-1 height record');
const unc = files.find((f) => f.file === 'characters/unc.glb');
if (!unc || unc.status !== 'installed' || unc.gender !== 'm') fail.push('unc must be installed as a man');
if (unc.joints !== 66 || unc.fingerBones !== 40 || unc.jointIndexDiffFromPlayer !== 0 || unc.jointIndexDiffFromBlue !== 16) fail.push('unc rig record');
if (unc.measuredHeightM !== 1.76 || unc.fittedHeightM !== 1.76) fail.push('unc height record');
const crew = files.find((f) => f.file === 'characters/crew-m-1.glb');
if (!crew || crew.status !== 'installed' || crew.gender !== 'm') fail.push('crew-m-1 must be installed as a man');
if (crew.joints !== 66 || crew.fingerBones !== 40 || crew.jointIndexDiffFromPlayer !== 0 || crew.jointIndexDiffFromBlue !== 16) fail.push('crew-m-1 rig record');
if (crew.measuredHeightM !== 1.8 || crew.fittedHeightM !== 1.8) fail.push('crew-m-1 height record');
for (const slot of ['crew', 'reds', 'blues', 'golds']) {
  const rows = files.filter((f) => f.slot === slot && f.countsAsDistinctBuild);
  const women = rows.filter((f) => f.gender === 'f').length;
  if (rows.length < 3 || rows.length > 4) fail.push(`${slot} distinct builds ${rows.length}, want 3 or 4`);
  if (!women) fail.push(`${slot} has no woman`);
}
const locals = files.filter((f) => f.slot === 'locals' && f.countsAsDistinctBuild);
if (locals.length !== 4 || locals.filter((f) => f.gender === 'f').length !== 2) fail.push('locals want 4 builds, 2 women');
if (files.some((f) => f.gender === 'f' && f.generation === 'alias' && !String(f.reuseOf).includes('-f-'))) fail.push('a woman alias points at a male file');
if (files.some((f) => f.slot === 'cop' && f.gender === 'f')) fail.push('cop woman is not spawned by the game');
console.log(fail.length ? fail.join('\n') : `roster ok: ${roster.counts.rosterFiles} files, ${roster.counts.remainingNames} names left, ${roster.counts.paidDistinctStillToCommission} still to commission, ${roster.counts.inProgress} in progress`);
process.exitCode = fail.length ? 1 : 0;
