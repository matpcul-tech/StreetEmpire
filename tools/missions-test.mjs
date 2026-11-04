// Headless playthrough of every mission with a simple bot that walks,
// fights and drives through the real state layer (no browser).
// Run: node tools/missions-test.mjs
// Test-only help: the bot's hp and heat are reset so cops and damage cannot
// end the run; everything else (paths, combat, driving, capture) is real.
import * as G from '../src/state.js';
const s = G.createState(Number(process.argv[2] || 7), { traffic: 8, peds: 8 });
const p = G.player(s), DT = 1 / 30;
s.crews.player.cash = 400;
let t = 0, fails = [], followerHits = 0, maxChasers = 0;
const ang = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const followers = () => s.ents.filter((e) => e.role === 'follower' && e.hp > 0);
function tick(mx = 0, mz = 0, sprint = true) {
  G.movePlayer(s, p, mx, mz, sprint, DT); G.step(s, DT); t += DT;
  p.hp = p.max; p.heat = 0;
  for (const f of s.fx) if (f.type === 'hit' && f.to === p.id && followers().some((e) => e.id === f.by)) followerHits++;
  const ch = s.ents.filter((e) => e.kind === 'npc' && e.role !== 'follower' && e.hp > 0 && e.crew !== 'player' && G.navPoint && Math.hypot(e.x - p.x, e.z - p.z) < 6).length;
  maxChasers = Math.max(maxChasers, ch);
  s.fx.length = 0; s.events.length = 0;
}
function walkTo(goal, r = 2.5, limit = 120) {
  const end = t + limit;
  while (t < end) {
    if (Math.hypot(goal.x - p.x, goal.z - p.z) < r) return true;
    const wp = G.navPoint(p, goal); const dx = wp.x - p.x, dz = wp.z - p.z, l = Math.hypot(dx, dz) || 1;
    // swing at anything hostile that blocks the way
    const foe = s.ents.find((e) => e.kind === 'npc' && e.crew !== 'player' && e.hp > 0 && Math.hypot(e.x - p.x, e.z - p.z) < 2.2);
    if (foe) G.applyAction(s, p.id, { type: 'attack', target: foe.id });
    tick(dx / l, dz / l);
  }
  return false;
}
function driveTo(goal, r = 5, limit = 120) {
  const end = t + limit;
  while (t < end) {
    const c = s.cars.find((c) => c.id === p.car); if (!c) return false;
    if (Math.hypot(goal.x - p.x, goal.z - p.z) < r) return true;
    const wp = G.navPoint(p, goal); const want = Math.atan2(wp.x - c.x, wp.z - c.z);
    const d = ang(want, c.ry), steer = Math.max(-1, Math.min(1, -d * 2.5));
    const thr = Math.abs(d) > 0.8 ? (c.v > 4 ? -0.3 : 0.4) : c.v > 14 ? 0 : 0.8;
    if (c.v < 0.5 && (c.stuckT = (c.stuckT || 0) + DT) > 2) { for (let i = 0; i < 30; i++) tick(steer, -1, false); c.stuckT = 0; continue; }
    tick(steer, thr, false);
  }
  return false;
}
const giver = () => s.ents.find((e) => e.kind === 'giver');
function talk() { walkTo(giver(), 3.2); G.applyAction(s, p.id, { type: 'talk' }); return s.mission; }
function check(name, ok) { console.log((ok ? 'PASS ' : 'FAIL ') + name + `  (t=${t.toFixed(0)}s)`); if (!ok) fails.push(name); }

// recruits first: they should tag along and never hurt you
for (let i = 0; i < 3; i++) G.applyAction(s, p.id, { type: 'recruit' });
check('recruited 3', followers().length === 3);

// 1. Package Run
let m = talk(); check('Package Run started', m && m.kind === 'fetch');
const pkg = { ...m.target };
const reachable = !G.insideBuilding(pkg.x, pkg.z, 0.6);
check('package spot is outside buildings', reachable);
walkTo(pkg, 3.5, 100);
check('package picked up', s.mission && s.mission.stage === 1);
walkTo(giver(), 3.5, 100);
check('Package Run passed', s.missionIdx === 1);
for (let i = 0; i < 150; i++) tick(); // a few seconds standing with Unc
console.log('followers', s.ents.filter((e) => e.role === 'follower').map((e) => [e.hp, Math.hypot(e.x - p.x, e.z - p.z).toFixed(0)]));
const near = followers().filter((e) => Math.hypot(e.x - p.x, e.z - p.z) < 14).length;
check(`recruits kept up (${near}/3 within 14 m)`, near >= 2);

// 2. Send a Message: knock out 3 Red Kings
m = talk(); check('Send a Message started', m && m.kind === 'beat');
{ const end = t + 240; while (s.mission && t < end) {
  const red = s.ents.filter((e) => e.crew === 'reds' && e.kind === 'npc' && e.hp > 0).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
  if (!red) { tick(); continue; }
  if (Math.hypot(red.x - p.x, red.z - p.z) > 2.2) { const wp = G.navPoint(p, red), dx = wp.x - p.x, dz = wp.z - p.z, l = Math.hypot(dx, dz) || 1; tick(dx / l, dz / l); }
  else { G.applyAction(s, p.id, { type: 'attack', target: red.id }); tick(); }
} }
check('Send a Message passed', s.missionIdx === 2);

// 3. Chop Job: steal a muscle car and drive it to the marker
m = talk(); check('Chop Job started', m && m.kind === 'chop');
{ let car = s.cars.filter((c) => c.type === 'muscle' && !c.wrecked && !c.driver).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
  walkTo(car, 3, 120); G.applyAction(s, p.id, { type: 'car' });
  for (let i = 0; i < 5; i++) tick(0, 0, false);
  check('in a muscle car, marker set', !!p.car && s.mission && s.mission.stage === 1);
  if (s.mission && s.mission.target) driveTo(s.mission.target, 5.5, 180);
  for (let i = 0; i < 10; i++) tick(0, -1, false); }
check('Chop Job passed', s.missionIdx === 3);
if (p.car) G.applyAction(s, p.id, { type: 'car' });

// 4. Take Over: clear the block and hold the ring
m = talk(); check('Take Over started', m && m.kind === 'take');
{ const b = s.blocks[m.block], c = G.blockCenter(b); walkTo(c, 4, 120);
  const end = t + 240; while (s.mission && t < end) {
    const foe = s.ents.filter((e) => e.kind === 'npc' && e.crew === b.owner && e.hp > 0 && Math.hypot(e.x - c.x, e.z - c.z) < 30).sort((a, x) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(x.x - p.x, x.z - p.z))[0];
    if (foe && b.owner !== 'player') { if (Math.hypot(foe.x - p.x, foe.z - p.z) > 2.2) { const wp = G.navPoint(p, foe), dx = wp.x - p.x, dz = wp.z - p.z, l = Math.hypot(dx, dz) || 1; tick(dx / l, dz / l); } else { G.applyAction(s, p.id, { type: 'attack', target: foe.id }); tick(); } }
    else if (Math.hypot(c.x - p.x, c.z - p.z) > 2) { const dx = c.x - p.x, dz = c.z - p.z, l = Math.hypot(dx, dz); tick(dx / l, dz / l); }
    else tick();
  } }
check('Take Over passed', s.missionIdx === 4);
check('recruits never hit you', followerHits === 0);
check(`rival crowd stays small (max ${maxChasers} rivals within 6 m)`, maxChasers <= 4);
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL MISSIONS PASSED', `game time ${t.toFixed(0)}s`);
process.exit(fails.length ? 1 : 0);
