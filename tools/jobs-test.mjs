// Headless run of the whole job chain, in order, through the real state layer (no browser).
// Run: node tools/jobs-test.mjs
// The bot does not walk or drive: it places the player where each step of a job needs them and lets the
// sim decide. That checks every job type's start, objective, pass and fail rules, and that the chain hands
// off between the four contacts. Walking, fighting and driving are covered by tools/missions-test.mjs.
import * as G from '../src/state.js';

let fails = 0;
const check = (name, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) fails++; };
const DT = 1 / 30;
function world(title) {
  const s = G.createState(11, { traffic: 6, peds: 0 }), p = G.player(s);
  // quiet streets: nobody fights, so only the job under test moves the state
  for (const k of ['reds', 'blues', 'golds']) s.crews[k].aiT = 1e9;
  if (s.calls) s.calls.cd = 1e9;
  if (title) s.missionIdx = G.MISSIONS.findIndex((m) => m.title === title);
  return { s, p };
}
const tick = (s, p, n = 1, keep = true) => { for (let i = 0; i < n; i++) { G.movePlayer(s, p, 0, 0, false, DT); G.step(s, DT); if (keep && !(p.downT > 0)) { p.hp = p.max; } } s.fx.length = 0; };
const put = (s, p, at, dx = 1.5, dz = 0) => { if (p.car) { const c = s.cars.find((c) => c.id === p.car); c.x = at.x + dx; c.z = at.z + dz; c.v = 0; } p.x = at.x + dx; p.z = at.z + dz; };
const talk = (s, p) => { const g = G.contactFor(s); put(s, p, g); G.applyAction(s, p.id, { type: 'talk' }); return s.mission; };
const said = (s, re) => s.events.some((e) => re.test(e.text));
// stand the player beside a free car and get in
function board(s, p, car) { if (p.car) G.applyAction(s, p.id, { type: 'car' }); car.v = 0; if (car.ai) car.cruise = 0; p.x = car.x + 2; p.z = car.z; G.applyAction(s, p.id, { type: 'car' }); return p.car === car.id; }
const anyCar = (s, p, type) => s.cars.filter((c) => !c.driver && !c.wrecked && !c.ai && (!type || c.type === type)).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];

// ---- the chain, in order, on one world ----
{
  const { s, p } = world();
  const names = G.MISSIONS.map((m) => m.title);
  check(`chain has 19 jobs across four contacts (${names.length})`, names.length === 19 && new Set(G.MISSIONS.map((m) => m.by)).size === 4);
  check('every contact stands outside buildings', G.CONTACTS.every((c) => { const g = s.ents.find((e) => e.kind === 'giver' && e.name === c.name); return g && !G.insideBuilding(g.x, g.z, 0.4); }));
  const contactSafe = G.CONTACTS.every((c) => { const g = s.ents.find((e) => e.kind === 'giver' && e.name === c.name); return !s.ents.some((e) => e.kind === 'npc' && e.crew !== 'player' && Math.hypot(e.x - g.x, e.z - g.z) < 14); });
  check('no guard stands within 14 m of a contact', contactSafe);
  const done = (title) => s.missionIdx === names.indexOf(title) + 1 && !s.mission;
  let m;

  // wrong contact: Dee has nothing while Unc holds the next job
  { const dee = s.ents.find((e) => e.name === 'Dee'); put(s, p, dee); G.applyAction(s, p.id, { type: 'talk' }); check('a contact without the next job sends you to the one who has it', !s.mission && said(s, /Dee: "Nothing for you right now. Unc/)); }

  m = talk(s, p); check('Bag Back starts', m && m.kind === 'hook');
  put(s, p, m.target, 0.5); tick(s, p, 2); put(s, p, G.contactFor(s)); tick(s, p, 2); check('Bag Back passes', done('Bag Back'));

  m = talk(s, p); check('Corner Collection starts with 3 pickups off rival turf', m && m.kind === 'collect' && m.points.length === 3 && m.points.every((q) => !G.insideBuilding(q.x, q.z, 0.4) && !['reds', 'blues', 'golds'].includes(G.blockAt(s, q.x, q.z)?.owner)));
  for (let i = 0; i < 3; i++) { put(s, p, s.mission.target, 0.5); tick(s, p, 2); }
  check('all pickups made, sent back to Unc', s.mission && s.mission.stage === 1 && G.missionText(s) === 'Bring it all back to Unc.');
  put(s, p, G.contactFor(s)); tick(s, p, 2); check('Corner Collection passes', done('Corner Collection'));

  m = talk(s, p); check('Chop Job starts and marks a muscle car', m && m.kind === 'chop'); tick(s, p, 2);
  check('chop marker sits on a muscle car', !!s.mission.target && s.cars.some((c) => c.type === 'muscle' && Math.hypot(c.x - s.mission.target.x, c.z - s.mission.target.z) < 1));
  check('muscle car boarded', board(s, p, anyCar(s, p, 'muscle')) && s.mission.stage === 1);
  put(s, p, s.mission.target, 0); tick(s, p, 2); check('Chop Job passes', done('Chop Job'));

  m = talk(s, p); check('Take Over marks a block that is not yours', m && m.kind === 'take' && s.blocks[m.block].owner !== 'player');
  s.blocks[m.block].owner = 'player'; tick(s, p, 2); check('Take Over passes', done('Take Over'));
  check('Unc hands you to Dee', said(s, /Go see Dee in Midtown/) && G.contactFor(s).name === 'Dee');

  m = talk(s, p); check('Package Run starts from Dee with a Harbor drop', m && m.kind === 'fetch' && G.districtOf(s.blocks[m.block]) === 2);
  put(s, p, m.target, 0.5); tick(s, p, 2); check('package sends you back to Dee', G.missionText(s) === 'Bring the package to Dee.');
  put(s, p, G.contactFor(s)); tick(s, p, 2); check('Package Run passes', done('Package Run'));

  m = talk(s, p); const low = s.cars.find((c) => c.id === m.carId);
  check('Clean Delivery parks a lowrider by Dee', m && m.kind === 'deliver' && low && low.type === 'lowrider' && Math.hypot(low.x - p.x, low.z - p.z) < 40);
  tick(s, p, 2); check('marker is on the lowrider first', Math.hypot(s.mission.target.x - low.x, s.mission.target.z - low.z) < 1);
  check('lowrider boarded, marker moves Downtown', board(s, p, low) && s.mission.stage === 1 && G.districtOf(s.blocks[s.mission.block]) === 1);
  put(s, p, s.mission.dest, 0); tick(s, p, 2); check('Clean Delivery passes', done('Clean Delivery'));

  m = talk(s, p); let mark = s.cars.find((c) => c.id === m.carId);
  check('Shadow marks a traffic car', m && m.kind === 'tail' && mark && mark.mark && mark.ai);
  { const own = anyCar(s, p); board(s, p, own); const keep = () => { const c = s.cars.find((c) => c.id === p.car); c.x = mark.x - Math.sin(mark.ry) * 25; c.z = mark.z - Math.cos(mark.ry) * 25; c.v = 0; p.x = c.x; p.z = c.z; };
    for (let i = 0; i < 36 * 30 && s.mission; i++) { keep(); tick(s, p); } }
  check('Shadow passes after 35 s at a distance', done('Shadow') && !mark.mark);

  m = talk(s, p); check('Loop Time lays 6 markers on the ring road', m && m.kind === 'race' && m.points.length === 6 && m.points.every((q) => Math.max(Math.abs(q.x), Math.abs(q.z)) > 250));
  { put(s, p, m.target, 0); if (p.car) G.applyAction(s, p.id, { type: 'car' }); p.x = m.target.x; p.z = m.target.z; tick(s, p, 2); check('a marker does not count on foot', s.mission.count === 0);
    board(s, p, anyCar(s, p)); for (let i = 0; i < 6 && s.mission; i++) { put(s, p, s.mission.target, 0); tick(s, p, 2); } }
  check('Loop Time passes', done('Loop Time'));

  m = talk(s, p); mark = s.cars.find((c) => c.id === m.carId);
  check('Repo marks a car that runs', m && m.kind === 'chase' && mark && mark.flee && mark.cruise > 12);
  mark.hp = mark.max * 0.39; tick(s, p, 2); check('Repo passes when the car is beaten up', done('Repo') && !mark.flee);
  check('Dee hands you to Rook', said(s, /Rook wants you Downtown/) && G.contactFor(s).name === 'Rook');

  for (const [title, crew, n] of [['Send a Message', 'reds', 3], ['Blue Notice', 'blues', 4]]) {
    m = talk(s, p); check(`${title} starts`, m && m.kind === 'beat' && m.crew === crew && m.need === n);
    if (p.car) G.applyAction(s, p.id, { type: 'car' });
    for (let k = 0; k < n; k++) { const e = s.ents.find((e) => e.kind === 'npc' && e.crew === crew && e.hp > 0); e.hp = 1; p.x = e.x + 1; p.z = e.z; p.cd = 0; p.ry = Math.atan2(e.x - p.x, e.z - p.z); G.applyAction(s, p.id, { type: 'attack', target: e.id }); tick(s, p, 20); }
    check(`${title} passes`, done(title));
  }

  p.heat = 0; m = talk(s, p);
  check('Hold the Line sends 4 Red Kings at your nearest block', m && m.kind === 'defend' && m.ids.length === 4 && s.blocks[m.block].owner === 'player' && s.blocks[m.block].raid);
  check('they gather first', s.ents.filter((e) => m.ids.includes(e.id)).every((e) => e.gather > 10 && e.role === 'attacker'));
  for (const e of s.ents) if (m.ids.includes(e.id)) e.hp = 0; tick(s, p, 2); check('Hold the Line passes', done('Hold the Line'));

  p.heat = 0; m = talk(s, p); check('Lose Them puts three stars on you', m && m.kind === 'escape' && G.stars(p) === 3);
  tick(s, p, 30); check('still wanted, still running', !!s.mission);
  p.heat = 0; tick(s, p, 100); check('Lose Them passes when the stars are gone', done('Lose Them'));

  for (const [title, crew] of [['The Lieutenant', 'reds']]) {
    m = talk(s, p); const boss = s.ents.find((e) => e.id === m.markId);
    check(`${title} puts a tough mark on his crew's block`, m && m.kind === 'hit' && boss && boss.crew === crew && boss.max === 170 && s.blocks[m.block].owner === crew);
    boss.hp = 0; tick(s, p, 2); check(`${title} passes`, done(title));
  }
  check('Rook hands you to Sal', said(s, /Sal runs the freight/) && G.contactFor(s).name === 'Sal');

  m = talk(s, p); check('Dock Pickup has 4 crates in the Harbor', m && m.kind === 'collect' && m.points.length === 4 && m.points.every((q) => G.districtOf(G.blockAt(s, q.x, q.z)) === 2));
  for (let i = 0; i < 4; i++) { put(s, p, s.mission.target, 0.5); tick(s, p, 2); }
  put(s, p, G.contactFor(s)); tick(s, p, 2); check('Dock Pickup passes', done('Dock Pickup'));

  p.heat = 0; m = talk(s, p); const van = s.cars.find((c) => c.id === m.carId);
  check('Hot Cargo parks a van by Sal', m && m.kind === 'deliver' && van && van.type === 'van');
  check('getting in brings the police', board(s, p, van) && G.stars(p) >= 2 && s.blocks[s.mission.block].owner === 'player');
  van.hp = van.max * 0.3; put(s, p, s.mission.dest, 0); tick(s, p, 2); check('Hot Cargo passes with a beaten up van', done('Hot Cargo'));

  p.heat = 0; m = talk(s, p); { const boss = s.ents.find((e) => e.id === m.markId); check('Gold Standard marks the Gold Line captain', m && boss && boss.crew === 'golds' && G.missionText(s) === 'Knock out the captain.'); boss.hp = 0; tick(s, p, 2); }
  check('Gold Standard passes', done('Gold Standard'));

  m = talk(s, p); check('Six Blocks starts', m && m.kind === 'own' && m.need === 6);
  tick(s, p, 2); check('not passed while you hold fewer', !!s.mission && s.mission.count < 6);
  { let n = s.blocks.filter((b) => b.owner === 'player').length; for (const b of s.blocks) if (n < 6 && b.owner === 'neutral') { b.owner = 'player'; n++; } }
  tick(s, p, 2); check('Six Blocks passes', done('Six Blocks'));
  check('Sal sends you home to Unc', said(s, /Unc has one more thing/) && G.contactFor(s).name === 'Unc');

  m = talk(s, p); check('Run the City marks a rival block', m && m.kind === 'take' && ['reds', 'blues', 'golds'].includes(s.blocks[m.block].owner));
  s.blocks[m.block].owner = 'player'; tick(s, p, 2); check('Run the City passes, chain complete', s.missionIdx === 19 && !s.mission);
  s.events.length = 0; talk(s, p); check('after the chain Unc has no more work', !s.mission && said(s, /No more work today/));
  check(`chain paid out (${Math.floor(s.crews.player.cash)})`, s.crews.player.cash > 12000);
}

// ---- fail rules ----
{ const { s, p } = world('Clean Delivery'); const m = talk(s, p), car = s.cars.find((c) => c.id === m.carId); board(s, p, car);
  car.hp = car.max * 0.69; tick(s, p, 2); check('Clean Delivery fails under 70 percent', !s.mission && s.missionIdx === G.MISSIONS.findIndex((x) => x.title === 'Clean Delivery') && said(s, /Too much damage/));
  check('a failed job can be taken again', !!talk(s, p)); }
{ const { s, p } = world('Hot Cargo'); const m = talk(s, p), car = s.cars.find((c) => c.id === m.carId); board(s, p, car); G.debugDown(s);
  check('Hot Cargo fails if you are locked up', !s.mission && said(s, /Locked up. Job failed/)); }
{ const { s, p } = world('Shadow'); const m = talk(s, p), mark = s.cars.find((c) => c.id === m.carId); mark.cruise = 0; mark.v = 0;
  p.x = mark.x + 3; p.z = mark.z; tick(s, p, 100); check('Shadow fails if you sit on his bumper', !s.mission && said(s, /Too close/) && !mark.mark); }
{ const { s, p } = world('Shadow'); const m = talk(s, p), mark = s.cars.find((c) => c.id === m.carId); mark.cruise = 0; mark.v = 0;
  p.x = mark.x + 30; p.z = mark.z; tick(s, p, 5); p.x = mark.x + 120; tick(s, p, 9 * 30); check('Shadow fails if you lose him', !s.mission && said(s, /You lost him/)); }
{ const { s, p } = world('Shadow'); const m = talk(s, p), mark = s.cars.find((c) => c.id === m.carId); mark.driver = null;
  check('Shadow fails if you take the car', board(s, p, mark) && !s.mission && said(s, /not take it/)); }
{ const { s, p } = world('Repo'); const m = talk(s, p), mark = s.cars.find((c) => c.id === m.carId);
  check('Repo passes if you take the car', board(s, p, mark) && !s.mission && s.missionIdx === G.MISSIONS.findIndex((x) => x.title === 'Repo') + 1); }
{ const { s, p } = world('Repo'); const m = talk(s, p), mark = s.cars.find((c) => c.id === m.carId); mark.cruise = 0; mark.v = 0;
  p.x = mark.x + 20; p.z = mark.z; tick(s, p, 5); p.x = mark.x + (mark.x > 0 ? -200 : 200); tick(s, p, 11 * 30); check('Repo fails if he gets away', !s.mission && said(s, /He got away/)); }
{ const { s, p } = world('Hold the Line'); const m = talk(s, p); s.blocks[m.block].owner = 'reds'; tick(s, p, 2); check('Hold the Line fails if the block falls', !s.mission && said(s, /fell. Job failed/)); }
{ const { s, p } = world('Lose Them'); talk(s, p); G.debugDown(s); check('Lose Them fails if you are locked up', !s.mission && said(s, /Locked up/)); }
{ const { s, p } = world('Loop Time'); const m = talk(s, p); s.mission.timer = 0.05; tick(s, p, 5); check('Loop Time fails on the clock', !s.mission && said(s, /Out of time/)); }
{ const { s, p } = world('Corner Collection'); talk(s, p); G.debugDown(s); tick(s, p, 90, false); check('getting knocked out does not end a pickup job, even after you are back up', !!s.mission && !(p.downT > 0) && p.hp === p.max); }

// ---- shops ----
{ const { s, p } = world(); const cr = s.crews.player; cr.cash = 1000;
  check('three shops and four safehouses, none inside a building', G.SHOPS.length === 3 && G.HOUSES.length === 4 && G.SHOPS.every((_, i) => !G.insideBuilding(G.shopSpot(i).x, G.shopSpot(i).z, 0.4)) && G.HOUSES.every((_, i) => !G.insideBuilding(G.houseSpot(i).x, G.houseSpot(i).z, 0.4)));
  G.applyAction(s, p.id, { type: 'buy', item: 'pistol' }); check('nothing is sold away from a shop', cr.cash === 1000 && p.ammo === 0);
  put(s, p, G.shopSpot(0), 1); check('standing at the counter counts as at the shop', G.shopAt(p) === 0);
  G.applyAction(s, p.id, { type: 'buy', item: 'pistol' }); check('pistol: 24 rounds for $150, drawn', cr.cash === 850 && p.ammo === 24 && p.weapon === 'pistol');
  G.applyAction(s, p.id, { type: 'buy', item: 'shotgun' }); check('shotgun: 10 shells for $220', cr.cash === 630 && p.shells === 10 && p.weapon === 'shotgun');
  G.applyAction(s, p.id, { type: 'buy', item: 'bat' }); G.applyAction(s, p.id, { type: 'buy', item: 'bat' }); check('a bat is sold once', cr.cash === 550 && p.hasBat);
  G.applyAction(s, p.id, { type: 'buy', item: 'knuckles' }); check('brass knuckles for $60', cr.cash === 490 && p.hasKnux);
  G.applyAction(s, p.id, { type: 'buy', item: 'patch' }); check('no charge for a patch up at full health', cr.cash === 490);
  p.hp = 20; G.applyAction(s, p.id, { type: 'buy', item: 'patch' }); check('patch up restores health for $40', cr.cash === 450 && p.hp === p.max);
  cr.cash = 30; G.applyAction(s, p.id, { type: 'buy', item: 'pistol' }); check('no sale without the cash', cr.cash === 30 && p.ammo === 24 && said(s, /Need \$150/));
  G.applyAction(s, p.id, { type: 'buy', item: 'rocket' }); check('unknown items are ignored', cr.cash === 30); }

// ---- safehouses ----
{ const { s, p } = world(); const cr = s.crews.player; cr.cash = 5000;
  G.applyAction(s, p.id, { type: 'house' }); check('no safehouse is sold away from its door', !s.houses || !s.houses.length);
  put(s, p, G.houseSpot(0), 1); cr.cash = 500; G.applyAction(s, p.id, { type: 'house' }); check('no sale without the cash', !G.ownsHouse(s, 0) && cr.cash === 500);
  cr.cash = 5000; G.applyAction(s, p.id, { type: 'house' }); const car = s.cars.find((c) => c.house === 0);
  check('Eastside walk-up bought for $800, with a sedan at the curb', G.ownsHouse(s, 0) && cr.cash === 4200 && car && car.type === 'sedan' && Math.hypot(car.x - p.x, car.z - p.z) < 14);
  G.applyAction(s, p.id, { type: 'house' }); check('a safehouse is sold once', cr.cash === 4200 && s.houses.length === 1);
  p.hp = 30; p.heat = 60; tick(s, p, 30 * 8, false); check('at home you heal and the heat drains', p.hp === p.max && p.heat === 0);
  put(s, p, G.houseSpot(2), 1); G.applyAction(s, p.id, { type: 'house' }); check('Downtown loft bought for $2800, with a muscle car', G.ownsHouse(s, 2) && cr.cash === 1400 && s.cars.some((c) => c.house === 2 && c.type === 'muscle'));
  // knocked out near the loft: back at the loft, not the home block
  p.heat = 0; G.debugDown(s); tick(s, p, 90, false); const q = G.houseSpot(2);
  check('you come back at your nearest safehouse', Math.hypot(p.x - q.x, p.z - q.z) < 1 && p.hp === p.max);
  // the house car is brought back once it is left across town
  car.z += 300; put(s, p, G.houseSpot(2), 1); tick(s, p, 30 * 22, false); const curb = G.houseSpot(0);
  check('a safehouse car left across town is brought back', Math.hypot(car.x - curb.x, car.z - curb.z) < 12);
  car.wrecked = true; car.remove = true; tick(s, p, 30 * 22, false); check('a wrecked one is replaced', s.cars.filter((c) => c.house === 0 && !c.wrecked).length === 1);
  const s2 = G.migrate(JSON.parse(JSON.stringify(s))); check('safehouses survive a save', G.ownsHouse(s2, 0) && G.ownsHouse(s2, 2) && !G.ownsHouse(s2, 1)); }

// ---- the marked car is never culled, and a save in the middle of a job still runs ----
{ const { s, p } = world('Shadow'); const m = talk(s, p), mark = s.cars.find((c) => c.id === m.carId);
  p.x = mark.x + (mark.x > 0 ? -400 : 400); tick(s, p, 30); check('a marked car far away is not removed with the traffic', s.cars.includes(mark));
  const s2 = G.migrate(JSON.parse(JSON.stringify(s))); let ok = true; try { for (let i = 0; i < 60; i++) G.step(s2, DT); } catch (e) { ok = false; console.log(e); }
  check('a save made mid job loads and steps', ok && s2.mission && s2.mission.kind === 'tail'); }
// ---- saves from before the chain ----
{ const { s } = world(); s.ents = s.ents.filter((e) => !(e.kind === 'giver' && e.name !== 'Unc')); delete s.jobsV; s.missionIdx = 3; s.mission = { kind: 'chop', idx: 3, title: 'Chop Job', stage: 0 };
  G.migrate(s); check('an old save gets the contacts and restarts after Bag Back', s.ents.filter((e) => e.kind === 'giver').length === 4 && s.missionIdx === 1 && !s.mission && s.jobsV === 2);
  G.migrate(s); check('migrating twice changes nothing', s.ents.filter((e) => e.kind === 'giver').length === 4 && s.missionIdx === 1); }

// ---- police escalation ----
{ const { s, p } = world(); const cops = () => s.ents.filter((e) => e.kind === 'cop' && e.hp > 0);
  p.heat = 50; for (let i = 0; i < 30 * 30; i++) { p.heat = 50; tick(s, p); } const at3 = cops().length;
  check(`three stars: up to 6 officers, two to a cruiser (${at3})`, at3 > 0 && at3 <= 6 && cops().every((e) => e.max === 80));
  for (let i = 0; i < 30 * 40; i++) { p.heat = 75; tick(s, p); }
  check(`four stars brings tactical units (${cops().length} officers, some at 120 hp)`, G.stars(p) === 4 && cops().length > at3 && cops().length <= 12 && cops().some((e) => e.max === 120) && said(s, /Tactical units/));
  check('no roadblock below five stars or on foot', !s.cars.some((c) => c.roadblock)); }
{ const { s, p } = world(); p.heat = 100; const car = anyCar(s, p); board(s, p, car);
  // on a long straight street, at speed
  car.x = 0; car.z = G.lineCoord(4); car.ry = Math.PI / 2; car.x = -200; car.mh = car.ry;
  for (let i = 0; i < 20 && !s.cars.some((c) => c.roadblock); i++) { p.heat = 100; car.v = 20; G.step(s, DT); p.hp = p.max; }
  const rb = s.cars.filter((c) => c.roadblock);
  check('five stars in a moving car puts a roadblock on the street ahead', G.stars(p) === 5 && rb.length === 2 && rb.every((c) => c.x > car.x + 50 && c.x < car.x + 160 && Math.abs(c.z - G.lineCoord(4)) < 4) && said(s, /Roadblocks ahead/));
  check('the roadblock is not in an intersection and has officers on foot', rb.every((c) => Math.abs(((c.x / G.PITCH + G.GRID / 2) % 1) - 0.5) < 0.05) && s.ents.filter((e) => e.kind === 'cop' && !e.car && Math.hypot(e.x - rb[0].x, e.z - rb[0].z) < 9).length >= 2);
  p.heat = 0; tick(s, p, 30 * 4); check('roadblocks clear when the stars are gone', !s.cars.some((c) => c.roadblock)); }
// ---- route line ----
{ const { s, p } = world(); const g = s.ents.find((e) => e.name === 'Sal'), r = G.routeTo(p, g); let len = 0; for (let i = 1; i < r.length; i++) len += Math.hypot(r[i].x - r[i - 1].x, r[i].z - r[i - 1].z);
  const crow = Math.hypot(g.x - p.x, g.z - p.z), onStreet = r.slice(0, -1).every((q) => !G.insideBuilding(q.x, q.z, 0.5));
  check(`the route to Sal follows the streets (${Math.round(len)} m against ${Math.round(crow)} m in a straight line)`, r.length > 6 && onStreet && len > crow && len < crow * 1.6 && Math.hypot(r[r.length - 1].x - g.x, r[r.length - 1].z - g.z) < 1); }

console.log(fails ? `\n${fails} FAILED` : '\nALL JOBS PASSED');
process.exit(fails ? 1 : 0);
