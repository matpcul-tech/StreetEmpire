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
  ['installed', n((f) => f.status === 'installed'), 16],
  ['remainingNames', n((f) => f.status !== 'installed'), 8],
  ['inProgress', n((f) => f.status === 'in_progress'), 0],
  ['paidDistinctStillToCommission', n((f) => f.generation === 'paid_distinct' && f.status === 'needed'), 4],
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
const reds2 = files.find((f) => f.file === 'characters/reds-m-2.glb');
if (!reds2 || reds2.status !== 'installed' || reds2.gender !== 'm' || reds2.jersey !== 27) fail.push('reds-m-2 must be installed as a man with jersey 27');
if (reds2.joints !== 66 || reds2.fingerBones !== 40 || reds2.jointIndexDiffFromPlayer !== 12 || reds2.jointIndexDiffFromBlue !== 28) fail.push('reds-m-2 rig record');
if (reds2.measuredHeightM !== 1.76 || reds2.fittedHeightM !== 1.76) fail.push('reds-m-2 height record');
const redsF = files.find((f) => f.file === 'characters/reds-f-1.glb');
if (!redsF || redsF.status !== 'installed' || redsF.gender !== 'f' || redsF.jersey !== 8) fail.push('reds-f-1 must be installed as a woman with jersey 08');
if (redsF.joints !== 40 || redsF.fingerBones !== 8 || redsF.helperBones !== 6) fail.push('reds-f-1 rig record');
if (redsF.measuredHeightM !== 1.7 || redsF.fittedHeightM !== 1.7) fail.push('reds-f-1 height record');
const blues = files.find((f) => f.file === 'characters/blues-m-1.glb');
if (!blues || blues.status !== 'installed' || blues.gender !== 'm') fail.push('blues-m-1 must be installed as a man');
if (blues.joints !== 66 || blues.fingerBones !== 40 || blues.jointIndexDiffFromPlayer !== 16) fail.push('blues-m-1 rig record');
if (blues.measuredHeightM !== 1.7 || blues.fittedHeightM !== 1.84) fail.push('blues-m-1 height record');
const blues2 = files.find((f) => f.file === 'characters/blues-m-2.glb');
if (!blues2 || blues2.status !== 'installed' || blues2.gender !== 'm') fail.push('blues-m-2 must be installed as a man');
if (blues2.joints !== 37 || blues2.fingerBones !== 4 || blues2.helperBones !== 7) fail.push('blues-m-2 rig record');
if (blues2.measuredHeightM !== 1.78 || blues2.fittedHeightM !== 1.78) fail.push('blues-m-2 height record');
const bluesF = files.find((f) => f.file === 'characters/blues-f-1.glb');
if (!bluesF || bluesF.status !== 'installed' || bluesF.gender !== 'f') fail.push('blues-f-1 must be installed as a woman');
if (bluesF.joints !== 66 || bluesF.fingerBones !== 40 || bluesF.jointIndexDiffFromPlayer !== 0) fail.push('blues-f-1 rig record');
if (bluesF.measuredHeightM !== 1.7 || bluesF.fittedHeightM !== 1.7) fail.push('blues-f-1 height record');
const golds = files.find((f) => f.file === 'characters/golds-m-1.glb');
if (!golds || golds.status !== 'installed' || golds.gender !== 'm') fail.push('golds-m-1 must be installed as a man');
if (golds.joints !== 66 || golds.fingerBones !== 40 || golds.jointIndexDiffFromPlayer !== 16 || golds.jointIndexDiffFromBlue !== 32) fail.push('golds-m-1 rig record');
if (golds.measuredHeightM !== 1.9 || golds.fittedHeightM !== 1.9) fail.push('golds-m-1 height record');
const golds2 = files.find((f) => f.file === 'characters/golds-m-2.glb');
if (!golds2 || golds2.status !== 'installed' || golds2.gender !== 'm') fail.push('golds-m-2 must be installed as a man');
if (golds2.joints !== 66 || golds2.fingerBones !== 40 || golds2.jointIndexDiffFromPlayer !== 0) fail.push('golds-m-2 rig record');
if (golds2.measuredHeightM !== 1.86 || golds2.fittedHeightM !== 1.86) fail.push('golds-m-2 height record');
const goldsf = files.find((f) => f.file === 'characters/golds-f-1.glb');
if (!goldsf || goldsf.status !== 'installed' || goldsf.gender !== 'f') fail.push('golds-f-1 must be installed as a woman');
if (goldsf.joints !== 66 || goldsf.fingerBones !== 40 || goldsf.jointIndexDiffFromPlayer !== 0) fail.push('golds-f-1 rig record');
if (goldsf.measuredHeightM !== 1.78 || goldsf.fittedHeightM !== 1.78) fail.push('golds-f-1 height record');
const localsM = files.find((f) => f.file === 'characters/locals-m-1.glb');
if (!localsM || localsM.status !== 'installed' || localsM.gender !== 'm') fail.push('locals-m-1 must be installed as a man');
if (localsM.joints !== 66 || localsM.fingerBones !== 40 || localsM.jointIndexDiffFromPlayer !== 0) fail.push('locals-m-1 rig record');
if (localsM.measuredHeightM !== 1.78 || localsM.fittedHeightM !== 1.78) fail.push('locals-m-1 height record');
const pedM = files.find((f) => f.file === 'characters/ped-m-1.glb');
if (!pedM || pedM.status !== 'installed' || pedM.generation !== 'alias' || pedM.reuseOf !== 'characters/locals-m-1.glb' || pedM.countsAsDistinctBuild) fail.push('ped-m-1 must alias locals-m-1');
for (const name of ['characters/ped-m-2.glb', 'characters/ped-f-1.glb', 'characters/ped-f-2.glb', 'characters/locals-m-2.glb', 'characters/locals-f-1.glb', 'characters/locals-f-2.glb']) {
  const row = files.find((f) => f.file === name);
  if (!row || row.status === 'installed') fail.push(name + ' must stay absent');
}
const unc = files.find((f) => f.file === 'characters/unc.glb');
if (!unc || unc.status !== 'installed' || unc.gender !== 'm') fail.push('unc must be installed as a man');
if (unc.joints !== 66 || unc.fingerBones !== 40 || unc.jointIndexDiffFromPlayer !== 0 || unc.jointIndexDiffFromBlue !== 16) fail.push('unc rig record');
if (unc.measuredHeightM !== 1.76 || unc.fittedHeightM !== 1.76) fail.push('unc height record');
const crew = files.find((f) => f.file === 'characters/crew-m-1.glb');
if (!crew || crew.status !== 'installed' || crew.gender !== 'm') fail.push('crew-m-1 must be installed as a man');
if (crew.joints !== 66 || crew.fingerBones !== 40 || crew.jointIndexDiffFromPlayer !== 0 || crew.jointIndexDiffFromBlue !== 16) fail.push('crew-m-1 rig record');
if (crew.measuredHeightM !== 1.8 || crew.fittedHeightM !== 1.8) fail.push('crew-m-1 height record');
const crew2 = files.find((f) => f.file === 'characters/crew-m-2.glb');
if (!crew2 || crew2.status !== 'installed' || crew2.gender !== 'm') fail.push('crew-m-2 must be installed as a man');
if (crew2.joints !== 66 || crew2.fingerBones !== 40 || crew2.jointIndexDiffFromPlayer !== 16 || crew2.jointIndexDiffFromBlue !== 32) fail.push('crew-m-2 rig record');
if (crew2.measuredHeightM !== 1.74 || crew2.fittedHeightM !== 1.74) fail.push('crew-m-2 height record');
const crewF = files.find((f) => f.file === 'characters/crew-f-1.glb');
if (!crewF || crewF.status !== 'installed' || crewF.gender !== 'f') fail.push('crew-f-1 must be installed as a woman');
if (crewF.joints !== 86 || crewF.helperBones !== 20 || crewF.fingerBones !== 40) fail.push('crew-f-1 rig record');
if (crewF.measuredHeightM !== 1.68 || crewF.fittedHeightM !== 1.68) fail.push('crew-f-1 height record');
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
