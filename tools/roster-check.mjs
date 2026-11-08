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
  ['installed', n((f) => f.status === 'installed'), 2],
  ['remainingNames', n((f) => f.status !== 'installed'), 22],
  ['inProgress', n((f) => f.status === 'in_progress'), 0],
  ['paidDistinctStillToCommission', n((f) => f.generation === 'paid_distinct' && f.status === 'needed'), 17],
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
