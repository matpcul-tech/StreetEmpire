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
const after = (title) => G.MISSIONS.findIndex((m) => m.title === title) + 1;

// Opening beats on a fresh street, then Bag Back, with the gifted follower on the clock.
{
  const s2 = G.createState(Number(process.argv[2] || 7), { traffic: 8, peds: 0 });
  const p2 = G.player(s2), DT2 = 1 / 30;
  const cars0 = new Set(s2.cars.map((c) => c.id));
  let t2 = 0;
  const step2 = (mx = 0, mz = 0) => { G.movePlayer(s2, p2, mx, mz, true, DT2); G.step(s2, DT2); t2 += DT2; p2.hp = p2.max; p2.heat = 0; };
  const mug = G.openingScuffle(s2);
  check('opening starts with a mugger going for the bag', !!(mug && mug.mugger && mug.scuffler && mug.weapon === 'fists'));
  while (t2 < 45 && !(s2.opening && s2.opening.done)) {
    const foe = s2.ents.filter((e) => e.hp > 0 && !e.car && (e.scuffler || (e.scout && e.bail))).sort((a, b) => Math.hypot(a.x - p2.x, a.z - p2.z) - Math.hypot(b.x - p2.x, b.z - p2.z))[0];
    if (foe && Math.hypot(foe.x - p2.x, foe.z - p2.z) < 2.4) G.applyAction(s2, p2.id, { type: 'attack', target: foe.id });
    if (foe && Math.hypot(foe.x - p2.x, foe.z - p2.z) >= 2.4) { const dx = foe.x - p2.x, dz = foe.z - p2.z, l = Math.hypot(dx, dz) || 1; step2(dx / l, dz / l); }
    else step2();
  }
  const o = s2.opening;
  check('mugger grabbed at the bag', !!o.grabbed);
  check('friends joined and one has a bat', !!(o.friends && o.bat && o.ids.length >= 3));
  check('scout drive-by used an existing traffic car', !!(o.scoutExisting && cars0.has(o.scoutCar) && o.near < 12 && o.passed));
  check('opening resolved', !!o.done);
  for (const e of s2.ents) if (e.opening && e.hp > 0) e.hp = 0;
  const g2 = s2.ents.find((e) => e.kind === 'giver');
  while (t2 < 70 && !s2.mission) {
    if (Math.hypot(g2.x - p2.x, g2.z - p2.z) < 3.2) { G.applyAction(s2, p2.id, { type: 'talk' }); break; }
    const wp = G.navPoint(p2, g2), dx = wp.x - p2.x, dz = wp.z - p2.z, l = Math.hypot(dx, dz) || 1; step2(dx / l, dz / l);
  }
  check('Bag Back is the hook before Package Run', s2.mission && s2.mission.kind === 'hook' && s2.mission.title === 'Bag Back' && G.MISSIONS[0].title === 'Bag Back' && G.MISSIONS[1].title === 'Package Run');
  const drop = s2.mission && { ...s2.mission.target };
  check('bag drop is outside buildings', !!drop && !G.insideBuilding(drop.x, drop.z, 0.6));
  if (drop) {
    while (t2 < 80 && s2.mission && s2.mission.stage === 0) {
      const wp = G.navPoint(p2, drop), dx = wp.x - p2.x, dz = wp.z - p2.z, l = Math.hypot(dx, dz) || 1;
      if (Math.hypot(drop.x - p2.x, drop.z - p2.z) < 3.5) step2(); else step2(dx / l, dz / l);
    }
    while (t2 < 90 && s2.mission) {
      const wp = G.navPoint(p2, g2), dx = wp.x - p2.x, dz = wp.z - p2.z, l = Math.hypot(dx, dz) || 1;
      if (Math.hypot(g2.x - p2.x, g2.z - p2.z) < 3.5) step2(); else step2(dx / l, dz / l);
    }
  }
  const gifted = s2.ents.filter((e) => e.role === 'follower' && e.leader === p2.id && e.hp > 0);
  const nearGift = gifted.filter((e) => Math.hypot(e.x - p2.x, e.z - p2.z) < 14);
  check(`Unc gifted a follower via the squad (${gifted.length}, ${nearGift.length} within 14 m, t=${t2.toFixed(0)}s)`, gifted.length === 1 && nearGift.length === 1 && s2.missionIdx === 1 && t2 < 60);
}

// 1. Bag Back on the mission bot too, so the free follower is in the squad before paid recruits
let m = talk(); check('Bag Back started', m && m.kind === 'hook' && m.title === 'Bag Back');
{ const drop = { ...m.target }; walkTo(drop, 3.5, 40); check('bag picked up', s.mission && s.mission.stage === 1); walkTo(giver(), 3.5, 40); }
check('Bag Back passed', s.missionIdx === after('Bag Back'));
{ const gift = followers(); const nearG = gift.filter((e) => Math.hypot(e.x - p.x, e.z - p.z) < 14).length; check(`free follower is in the squad (${nearG}/${gift.length})`, gift.length === 1 && nearG === 1); }

// recruits: one slot is already filled, so two stay with you and the rest guard
for (let i = 0; i < 3; i++) G.applyAction(s, p.id, { type: 'recruit' });
const guards = (b) => s.ents.filter((e) => e.kind === 'npc' && e.crew === 'player' && e.role === 'defender' && e.target === b.id && e.hp > 0);
check('recruited 3: squad of 2 follows, extras guard a held block', followers().length === 2 && s.blocks.some((b) => b.owner === 'player' && guards(b).some((e) => e.guard)));

// 2. Package Run
m = talk(); check('Package Run started', m && m.kind === 'fetch');
const pkg = { ...m.target };
const reachable = !G.insideBuilding(pkg.x, pkg.z, 0.6);
check('package spot is outside buildings', reachable);
walkTo(pkg, 3.5, 100);
check('package picked up', s.mission && s.mission.stage === 1);
walkTo(giver(), 3.5, 100);
check('Package Run passed', s.missionIdx === after('Package Run'));
for (let i = 0; i < 150; i++) tick(); // a few seconds standing with Unc
console.log('followers', s.ents.filter((e) => e.role === 'follower').map((e) => [e.hp, Math.hypot(e.x - p.x, e.z - p.z).toFixed(0)]));
const near = followers().filter((e) => Math.hypot(e.x - p.x, e.z - p.z) < 14).length;
check(`squad kept up (${near}/2 within 14 m)`, near >= 2);

// 2. Send a Message: knock out 3 Red Kings
m = talk(); check('Send a Message started', m && m.kind === 'beat');
{ const end = t + 240; while (s.mission && t < end) {
  const red = s.ents.filter((e) => e.crew === 'reds' && e.kind === 'npc' && e.hp > 0).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
  if (!red) { tick(); continue; }
  if (Math.hypot(red.x - p.x, red.z - p.z) > 2.2) { const wp = G.navPoint(p, red), dx = wp.x - p.x, dz = wp.z - p.z, l = Math.hypot(dx, dz) || 1; tick(dx / l, dz / l); }
  else { G.applyAction(s, p.id, { type: 'attack', target: red.id }); tick(); }
} }
check('Send a Message passed', s.missionIdx === after('Send a Message'));

// 3. Chop Job: steal a muscle car and drive it to the marker
// The Red Kings are a long walk away on the 9 x 9 map and the fight can cost a recruit: bring the squad back to
// two beside the player, so the checks below still test boarding and leaving the car, not the trek.
while (followers().length < 2 && s.crews.player.cash >= 0) { s.crews.player.cash += 100; G.applyAction(s, p.id, { type: 'recruit' }); }
for (const f of followers()) if (Math.hypot(f.x - p.x, f.z - p.z) > 8) { f.x = p.x + 1.5; f.z = p.z + 1.5; }
m = talk(); check('Chop Job started', m && m.kind === 'chop');
{ let car = s.cars.filter((c) => c.type === 'muscle' && !c.wrecked && !c.driver).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
  for (let k = 0; k < 3; k++) { walkTo(car, 1.8 - k * 0.5, 120); G.applyAction(s, p.id, { type: 'car' }); if (p.car === car.id) break; if (p.car) { G.applyAction(s, p.id, { type: 'car' }); tick(); } }
  let rode = 0; for (let i = 0; i < 60; i++) { tick(0, 0, false); rode = followers().filter((e) => e.car === p.car).length; if (rode === 2) break; }
  check(`squad got in the car (${rode}/2)`, rode === 2);
  check('in a muscle car, marker set', !!p.car && s.mission && s.mission.stage === 1);
  if (s.mission && s.mission.target) driveTo(s.mission.target, 5.5, 180);
  for (let i = 0; i < 10; i++) tick(0, -1, false); }
check('Chop Job passed', s.missionIdx === after('Chop Job'));
if (p.car) G.applyAction(s, p.id, { type: 'car' });
for (let i = 0; i < 5; i++) tick();
{ const out = followers().filter((e) => !e.car && Math.hypot(e.x - p.x, e.z - p.z) < 8).length; check(`squad hopped out with you (${out}/2)`, out === 2); }
// sprint: the squad keeps up
{ const t0 = t; while (t < t0 + 8) tick(1, 0, true); for (let i = 0; i < 60; i++) tick(); const near = followers().filter((e) => Math.hypot(e.x - p.x, e.z - p.z) < 10).length; check(`squad kept up with a sprint (${near}/${followers().length} alive within 10 m)`, near >= 1 && near === followers().length); }

// 4. Take Over: clear the block and hold the ring
m = talk(); check('Take Over started', m && m.kind === 'take');
{ const b = s.blocks[m.block], c = G.blockCenter(b); walkTo(c, 4, 120);
  const end = t + 240; while (s.mission && t < end) {
    const foe = s.ents.filter((e) => e.kind === 'npc' && e.crew === b.owner && e.hp > 0 && Math.hypot(e.x - c.x, e.z - c.z) < 30).sort((a, x) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(x.x - p.x, x.z - p.z))[0];
    if (foe && b.owner !== 'player') { if (Math.hypot(foe.x - p.x, foe.z - p.z) > 2.2) { const wp = G.navPoint(p, foe), dx = wp.x - p.x, dz = wp.z - p.z, l = Math.hypot(dx, dz) || 1; tick(dx / l, dz / l); } else { G.applyAction(s, p.id, { type: 'attack', target: foe.id }); tick(); } }
    else if (Math.hypot(c.x - p.x, c.z - p.z) > 2) { const dx = c.x - p.x, dz = c.z - p.z, l = Math.hypot(dx, dz); tick(dx / l, dz / l); }
    else tick();
  } }
check('Take Over passed', s.missionIdx === after('Take Over'));
{ const b = s.blocks[m.block]; for (let i = 0; i < 300; i++) tick();
  const g = guards(b); const c = G.blockCenter(b); const spread = g.length > 1 ? Math.max(...g.map((x) => Math.hypot(x.x - g[0].x, x.z - g[0].z))) : 0;
  check(`taken block garrisoned (${g.length} guards, spread ${spread.toFixed(0)} m)`, g.length >= 2 && g.length <= 3 && spread > 4 && g.every((x) => Math.abs(x.x - c.x) < 30 && Math.abs(x.z - c.z) < 30));
  check('squad stayed to guard, nobody follows by default', followers().length === 0);
  // call one guard along, then send it back
  G.applyAction(s, p.id, { type: 'squad' }); check('called a guard to follow', followers().length === 1);
  G.applyAction(s, p.id, { type: 'squad', mode: 'send' }); check('sent it back to guard', followers().length === 0);
  // a rival attack meets the guards
  const r = []; for (let i = 0; i < 2; i++) r.push(G.spawnUnit(s, 'reds', 'attacker', b.id, c.x + 6 + i, c.z + 6));
  for (let i = 0; i < 600; i++) tick();
  check(`guards held the block against a rival attack (owner ${b.owner})`, b.owner === 'player' && r.some((e) => e.hp < 60)); }
check('recruits never hit you', followerHits === 0);
check(`rival crowd stays small (max ${maxChasers} rivals within 6 m)`, maxChasers <= 4);

// Territory pass: stash, guard upgrade, raid warning, raid loss. Fresh states so the mission bot is left alone.
{
  const s2 = G.createState(5, { traffic: 0, peds: 0 });
  const p2 = G.player(s2), home = s2.blocks[0], DT2 = 1 / 30;
  const g0 = G.guardsOf(s2, home).length;
  check('stash rate uses guards (1 guard is 0.6x)', Math.abs(G.stashRate(s2, home) - home.rate * (0.4 + 0.2 * g0)) < 1e-6 && g0 === 1);
  while (G.guardsOf(s2, home).length < 3) G.spawnUnit(s2, 'player', 'defender', home.id);
  check('stash rate rises with 3 guards (1.0x)', Math.abs(G.stashRate(s2, home) - home.rate * (0.4 + 0.2 * 3)) < 1e-6);
  // put the extras down so the accrue check stays on the starting garrison
  for (const e of G.guardsOf(s2, home).slice(1)) e.hp = 0;
  const far = G.blockCenter(s2.blocks[s2.blocks.length - 1]);
  p2.x = far.x; p2.z = far.z; p2.hp = p2.max = 100000;
  const cash0 = s2.crews.player.cash;
  let expect = 0;
  for (let i = 0; i < 90; i++) { expect += G.stashRate(s2, home) * DT2; G.step(s2, DT2); p2.hp = p2.max; }
  check(`stash accrues while away (~$${expect.toFixed(1)}, saw $${home.stash.toFixed(1)})`, Math.abs(home.stash - expect) < 0.05 && home.stash >= 1);
  check('away stash does not pay the player', s2.crews.player.cash === cash0);
  const piled = home.stash;
  p2.x = G.blockCenter(home).x; p2.z = G.blockCenter(home).z;
  G.applyAction(s2, p2.id, { type: 'collect' });
  check('collect action pockets the stash', s2.crews.player.cash >= cash0 + Math.floor(piled) && home.stash < 1 && s2.fx.some((f) => f.type === 'stash' && f.block === home.id && !f.stolen));
  home.stash = 25; p2.wasBlock = -1;
  const cash1 = s2.crews.player.cash;
  const rate = G.stashRate(s2, home);
  G.step(s2, 0.5); p2.hp = p2.max;
  check('walking onto the block pockets the stash', Math.abs((s2.crews.player.cash - cash1) - (25 + rate * 0.5)) < 0.05 && home.stash < 0.01);
  s2.crews.player.cash = 10;
  G.applyAction(s2, p2.id, { type: 'upgrade' });
  check('upgrade refused when short on cash', s2.crews.player.cash === 10 && !home.upgraded);
  s2.crews.player.cash = 100;
  const guard = G.guardsOf(s2, home)[0];
  const hp0 = guard.hp, max0 = guard.max;
  G.applyAction(s2, p2.id, { type: 'upgrade' });
  check('upgrade buys bats and health for $80', home.upgraded === 'bat' && s2.crews.player.cash === 20 && guard.weapon === 'bat' && guard.hp === hp0 + G.UPGRADE_HP && guard.max === max0 + G.UPGRADE_HP);
  const neu = G.spawnUnit(s2, 'player', 'defender', home.id);
  check('new guards on an armed block spawn with the upgrade', neu.weapon === 'bat' && neu.hp >= 60 + G.UPGRADE_HP);
  G.applyAction(s2, p2.id, { type: 'upgrade' });
  check('upgrade is once per block', s2.crews.player.cash === 20);
}
{
  const s3 = G.createState(9, { traffic: 0, peds: 0 });
  // a neutral block right next to the Red Kings' corner (they hold the two columns at the far end of row 0)
  const target = s3.blocks[G.GRID - 3];
  target.owner = 'player';
  for (const e of s3.ents) if (e.kind === 'npc' && e.home === target.id) e.hp = 0;
  for (const k of ['blues', 'golds']) s3.crews[k].aiT = 999;
  s3.crews.reds.cash = 800;
  let raid = null;
  for (let i = 0; i < 30 && !raid; i++) { s3.crews.reds.aiT = 0; s3.crews.reds.cash = Math.max(s3.crews.reds.cash, 800); G.step(s3, 0.05); raid = s3.fx.find((f) => f.type === 'raid' && f.eta > 0); }
  check('raid warning fx names the block and eta', !!raid && raid.block === target.id && raid.crew === 'reds' && raid.eta >= 9 && s3.events.some((e) => /gathering to hit/.test(e.text)));
  const atk = () => s3.ents.filter((e) => e.crew === 'reds' && e.role === 'attacker' && e.target === target.id && e.hp > 0);
  const party = atk();
  const spots = party.map((e) => ({ x: e.x, z: e.z, g: e.gather }));
  check('raid party gathers before the fight', party.length >= 2 && party.every((e) => e.gather > 8) && target.raid && target.raid.eta > 8);
  for (const k of ['reds', 'blues', 'golds']) s3.crews[k].aiT = 999;
  for (let i = 0; i < 60; i++) G.step(s3, 1 / 30);
  const held = atk();
  check('raid party holds still during the gather', held.length === party.length && held.every((e, i) => Math.hypot(e.x - spots[i].x, e.z - spots[i].z) < 0.5) && target.owner === 'player' && target.raid && target.raid.eta < 9 && target.raid.eta > 6);
  for (let i = 0; i < 400 && atk().some((e) => e.gather > 0); i++) G.step(s3, 1 / 30);
  check('gather ends with a go warning', s3.fx.some((f) => f.type === 'raid' && f.block === target.id && f.state === 'go') && atk().every((e) => e.gather <= 0));
  const before = atk().map((e) => ({ x: e.x, z: e.z }));
  for (let i = 0; i < 90; i++) G.step(s3, 1 / 30);
  const moved = atk().filter((e, i) => before[i] && Math.hypot(e.x - before[i].x, e.z - before[i].z) > 1);
  check('raid party moves in after the gather', moved.length >= 1 && target.owner === 'player');
}
{
  const s4 = G.createState(4, { traffic: 0, peds: 0 });
  const p4 = G.player(s4), b = s4.blocks[0], c = G.blockCenter(b), DT4 = 1 / 30;
  const away = G.blockCenter(s4.blocks[s4.blocks.length - 1]);
  p4.x = away.x; p4.z = away.z; p4.hp = p4.max = 100000;
  for (const e of G.guardsOf(s4, b)) e.hp = 0;
  b.stash = 80;
  for (let i = 0; i < 2; i++) G.spawnUnit(s4, 'reds', 'attacker', b.id, c.x, c.z);
  for (const k of ['reds', 'blues', 'golds']) s4.crews[k].aiT = 999;
  const reds0 = s4.crews.reds.cash;
  for (let i = 0; i < Math.ceil((G.CAPTURE_TIME + 0.5) / DT4); i++) { G.step(s4, DT4); p4.hp = p4.max; }
  const stolen = s4.fx.find((f) => f.type === 'stash' && f.stolen && f.block === b.id);
  check(`raid capture flips the block and steals the stash (owner ${b.owner})`, b.owner === 'reds' && stolen && stolen.amt >= 80 && stolen.crew === 'reds' && (b.stash || 0) < 1 && s4.crews.reds.cash >= reds0 + 80);
  check('away loss sets a return waypoint', s4.waypoint && s4.waypoint.block === b.id && s4.waypoint.label === 'LOST' && s4.fx.some((f) => f.type === 'lost' && f.block === b.id));
  check('loss log says from you', s4.events.some((e) => e.text.includes('from you.')) && !s4.events.some((e) => e.text.includes('from You')));
}

console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL MISSIONS PASSED', `game time ${t.toFixed(0)}s`);
process.exit(fails.length ? 1 : 0);
