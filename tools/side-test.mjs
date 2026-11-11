// Street races, garages and hidden stashes in the state layer, no browser. Run: node tools/side-test.mjs
import * as G from '../src/state.js';

const DT = 1 / 30, fails = [];
const check = (name, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) fails.push(name); };
const world = () => {
  const s = G.createState(7, { traffic: 0, peds: 0 }); s.policeT = 1e9; s.opening = { done: true, beat: 'done', ids: [] };
  const p = G.player(s); s.ents = s.ents.filter((e) => e.kind === 'player'); return { s, p };
};
const seen = [], drain = (s) => { seen.push(...s.fx); s.fx.length = 0; }, got = (type) => seen.filter((f) => f.type === type);
const tick = (s, p, n = 1) => { for (let i = 0; i < n; i++) { G.movePlayer(s, p, 0, 0, true, DT); G.step(s, DT); drain(s); } };
const mount = (s, p) => { const c = s.cars.find((o) => o.type === 'sedan' && !o.ai); p.x = c.x - 1.5; p.z = c.z; G.applyAction(s, p.id, { type: 'car' }); if (p.car !== c.id) throw new Error('not in the car'); return c; };
const put = (c, q) => { c.x = q.x; c.z = q.z; c.v = 0; };

{ // layout
  check('races, garages and stashes all sit on open ground', G.RACES.every((r) => !G.insideBuilding(r.start.x, r.start.z, 2) && r.points.length >= 4) && G.GARAGES.every((g) => !G.insideBuilding(g.x, g.z, 1.5)) && G.STASHES.length === 20 && G.STASHES.every((q) => !G.insideBuilding(q.x, q.z, 0.6)));
  const spots = [...G.RACES.map((r) => r.start), ...G.GARAGES, ...G.RAMPS];
  check('no two markers share a spot', spots.every((a, i) => spots.every((b, j) => i === j || Math.hypot(a.x - b.x, a.z - b.z) > 12)));
}
{ // stashes
  seen.length = 0; const { s, p } = world(), cash0 = s.crews.player.cash, max0 = p.max;
  p.x = G.STASHES[0].x; p.z = G.STASHES[0].z; tick(s, p, 2);
  check('walking onto a stash picks it up and pays', s.stashes.length === 1 && s.crews.player.cash === cash0 + G.STASH_PAY && got('found').length === 1);
  tick(s, p, 5); check('once only', s.stashes.length === 1 && s.crews.player.cash === cash0 + G.STASH_PAY);
  for (let k = 1; k < G.STASHES.length; k++) { p.x = G.STASHES[k].x; p.z = G.STASHES[k].z; tick(s, p, 2); }
  check(`all twenty: a bonus and more health (${max0} to ${p.max})`, s.stashes.length === 20 && p.max === max0 + 25 && p.hp === p.max && s.crews.player.cash === cash0 + 20 * G.STASH_PAY + G.STASH_ALL && got('found').at(-1).all);
  const c = mount(s, p); seen.length = 0; const w = world(), c2 = mount(w.s, w.p); put(c2, G.STASHES[3]); tick(w.s, w.p, 3);
  check('not from inside a car', !(w.s.stashes || []).length);
}
{ // garage
  seen.length = 0; const { s, p } = world(), c = mount(s, p), g = G.GARAGES[0];
  s.crews.player.cash = 500; c.hp = 20; p.heat = 60; const paint0 = c.paint; put(c, g); tick(s, p, 2);
  check('a garage fixes the car, resprays it and clears the heat for $150', c.hp === c.max && c.paint !== paint0 && p.heat === 0 && s.crews.player.cash === 350 && got('garage')[0].ok);
  tick(s, p, 30); check('one charge per visit', s.crews.player.cash === 350);
  put(c, { x: g.x + 40, z: g.z }); tick(s, p, 2); put(c, g); s.crews.player.cash = 100; c.hp = 30; seen.length = 0; tick(s, p, 2);
  check('no money, no service', c.hp === 30 && s.crews.player.cash === 100 && got('garage')[0].ok === false);
  put(c, { x: g.x + 40, z: g.z }); tick(s, p, 2); s.crews.player.cash = 500; p.heat = 60;
  const cop = G.spawnUnit(s, 'reds', 'defender', s.blocks[0].id, g.x + 8, g.z); cop.kind = 'cop'; cop.stun = 99; put(c, g); seen.length = 0; G.step(s, DT); drain(s);
  check('with an officer watching, the car is fixed but the heat stays', got('garage')[0].ok && got('garage')[0].seen && p.heat > 0 && c.hp === c.max);
  const w = world(), c2 = mount(w.s, w.p); w.s.crews.player.cash = 500; c2.hp = 20; c2.x = g.x; c2.z = g.z - 30; c2.ry = c2.mh = 0; c2.v = 20; for (let i = 0; i < 60; i++) { c2.v = 20; G.movePlayer(w.s, w.p, 0, 1, false, DT); G.step(w.s, DT); }
  check('driving past at speed does not charge you', w.s.crews.player.cash === 500);
}
{ // races
  seen.length = 0; const { s, p } = world(), c = mount(s, p), R = G.RACES[0], cash0 = s.crews.player.cash;
  put(c, R.start); tick(s, p, 2);
  check('stopping on the start ring starts the race', s.side && s.side.kind === 'race' && got('race')[0].state === 'go' && G.sideText(s).includes(R.name));
  for (const q of R.points) { tick(s, p, 30); put(c, q); tick(s, p, 2); }
  const win = got('race').find((f) => f.state === 'win');
  check(`every checkpoint in order finishes it (${win && win.time.toFixed(1)} s, ${win && win.medal})`, !s.side && !!win && win.medal === 'gold' && win.record && s.crews.player.cash === cash0 + G.RACE_PAY.gold && s.best[0] > 0);
  check(`medal times scale with the route (${G.RACES.map((r) => `${r.gold}/${r.silver}/${r.bronze}`).join(', ')})`, G.RACES.every((r) => r.gold < r.silver && r.silver < r.bronze && r.gold > 15));
  put(c, { x: R.start.x + 30, z: R.start.z }); tick(s, p, 2); put(c, R.start); tick(s, p, 2); seen.length = 0;
  for (const q of R.points) { tick(s, p, Math.round((R.silver + 3) / R.points.length / DT)); put(c, q); tick(s, p, 2); }
  const w2 = got('race').find((f) => f.state === 'win');
  check(`a slower run takes a lower medal and keeps the best time (${w2 && w2.medal})`, !!w2 && w2.medal === 'bronze' && !w2.record);
  put(c, { x: R.start.x + 30, z: R.start.z }); tick(s, p, 2); put(c, R.start); tick(s, p, 2); seen.length = 0;
  G.applyAction(s, p.id, { type: 'car' }); for (let i = 0; i < 7 / DT; i++) { G.movePlayer(s, p, 0, 0, false, DT); G.step(s, DT); drain(s); }
  check('getting out and staying out ends the race', !s.side && got('race').some((f) => f.state === 'off'));
  const w = world(), c3 = mount(w.s, w.p); c3.x = R.start.x; c3.z = R.start.z - 25; c3.ry = c3.mh = 0; for (let i = 0; i < 60; i++) { c3.v = 20; G.movePlayer(w.s, w.p, 0, 1, false, DT); G.step(w.s, DT); }
  check('driving through the ring at speed does not start one', !w.s.side);
}
{ // shooting from the car
  seen.length = 0; const { s, p } = world(), c = mount(s, p); put(c, { x: G.lineCoord(5), z: G.lineCoord(5) + 20 }); c.ry = 0; tick(s, p, 2);
  const foe = G.spawnUnit(s, 'reds', 'defender', s.blocks[0].id, c.x - 9, c.z - 4); foe.stun = 99; const hp0 = foe.hp;
  p.ammo = 0; p.cd = 0; G.applyAction(s, p.id, { type: 'attack' }); drain(s);
  check('no rounds, no shot', got('shot').length === 0 && foe.hp === hp0);
  p.ammo = 6; p.cd = 0; G.applyAction(s, p.id, { type: 'attack' }); drain(s);
  check(`a drive-by hits a rival beside and behind the car (${hp0} to ${foe.hp}), spends a round and brings heat`, foe.hp < hp0 && p.ammo === 5 && p.heat > 0 && got('shot').length === 1 && p.car === c.id);
  G.applyAction(s, p.id, { type: 'attack' }); check('it has a fire rate', p.ammo === 5);
  foe.x += 300; const o = s.cars.find((q) => q !== c && !q.driver && q.type !== 'bike'); o.x = c.x; o.z = c.z + 10; o.hp = o.max; const oh = o.hp; p.cd = 0; G.applyAction(s, p.id, { type: 'attack' }); drain(s);
  check('with nobody to shoot, the round goes ahead and hits a car', o.hp < oh);
  const ped = { n: 0 }; const w = world(), c2 = mount(w.s, w.p); const civ = G.spawnUnit(w.s, 'reds', 'defender', w.s.blocks[0].id, c2.x + 6, c2.z); civ.kind = 'ped'; civ.crew = 'civ'; civ.look = 1; civ.block = 0; civ.pt = 0; const ch = civ.hp; w.p.ammo = 5; w.p.cd = 0; G.applyAction(w.s, w.p.id, { type: 'attack' });
  check('it does not pick bystanders as targets', civ.hp === ch);
}
{ // fares
  seen.length = 0; const { s, p } = world(), c = mount(s, p); put(c, { x: G.lineCoord(4), z: G.lineCoord(4) + 20 }); tick(s, p, 3);
  const h = s.ents.find((e) => e.id === s.hail);
  check(`in a car with no job, someone flags you down (${h && Math.hypot(h.x - c.x, h.z - c.z).toFixed(0)} m away)`, !!h && h.hail && !G.insideBuilding(h.x, h.z, 0.4) && got('fare')[0].state === 'hail');
  const hx = h.x, hz = h.z; tick(s, p, 60); check('they wait where they are', Math.hypot(h.x - hx, h.z - hz) < 0.1);
  const cash0 = s.crews.player.cash; put(c, { x: h.x + 3, z: h.z + 3 }); tick(s, p, 2);
  check(`stopping beside them takes the fare (${s.side && Math.round(s.side.dist)} m, tip until ${s.side && s.side.par} s)`, s.side && s.side.kind === 'fare' && !s.ents.some((e) => e.id === h.id) && s.side.dist > 100 && !G.insideBuilding(s.side.target.x, s.side.target.z, 0.4));
  const tg = s.side.target; tick(s, p, 30 * 5); put(c, { x: tg.x + 3, z: tg.z + 3 }); tick(s, p, 2);
  const d = got('fare').find((f) => f.state === 'drop');
  check(`dropping them off pays, with a tip for speed (+$${d && d.pay}, tip $${d && d.tip})`, !s.side && !!d && d.tip > 0 && d.pay > 80 && s.crews.player.cash === cash0 + d.pay);
  // a slow, dented run: no tip
  s.fareCd = 0; tick(s, p, 3); const h2 = s.ents.find((e) => e.id === s.hail); put(c, { x: h2.x + 3, z: h2.z + 3 }); tick(s, p, 2); const side = s.side; c.hp -= 30; side.t = side.par + 5; put(c, { x: side.target.x + 3, z: side.target.z + 3 }); seen.length = 0; tick(s, p, 2);
  const d2 = got('fare').find((f) => f.state === 'drop'); check(`late and dented: base pay only (+$${d2 && d2.pay})`, !!d2 && d2.tip === 0);
  s.fareCd = 0; tick(s, p, 3); const h3 = s.ents.find((e) => e.id === s.hail); put(c, { x: h3.x + 3, z: h3.z + 3 }); tick(s, p, 2); seen.length = 0;
  G.applyAction(s, p.id, { type: 'car' }); for (let i = 0; i < 9 / DT; i++) { G.movePlayer(s, p, 0, 0, false, DT); G.step(s, DT); drain(s); }
  check('leaving the car loses the fare', !s.side && got('fare').some((f) => f.state === 'lost'));
  const w = world(), c2 = mount(w.s, w.p); w.p.heat = 60; put(c2, { x: G.lineCoord(4), z: G.lineCoord(4) + 20 }); w.s.policeT = 1e9; for (let i = 0; i < 5; i++) { w.p.heat = 60; G.movePlayer(w.s, w.p, 0, 0, true, DT); G.step(w.s, DT); }
  check('nobody flags down a wanted driver', !w.s.hail);
}
{ // body armor
  const { s, p } = world(); s.crews.player.cash = 500; const q = G.shopSpot(0); p.x = q.x; p.z = q.z; G.applyAction(s, p.id, { type: 'buy', item: 'armor' });
  check('a shop sells body armor', p.armor === G.ARMOR_MAX && s.crews.player.cash === 300);
  const foe = G.spawnUnit(s, 'reds', 'defender', s.blocks[0].id, p.x + 1, p.z); const hp0 = p.hp; p.x += 300; const c = s.cars.find((o) => !o.ai && o.type !== 'bike'); c.x = p.x; c.z = p.z + 3; c.hp = 1; c.burn = 0.05; tick(s, p, 6);
  check(`armor takes the damage before health does (health ${hp0} to ${p.hp}, armor ${G.ARMOR_MAX} to ${p.armor})`, p.armor < G.ARMOR_MAX && p.hp > hp0 - 30);
}
{ // progress
  const { s, p } = world(), a = G.progress(s);
  p.x = G.STASHES[5].x; p.z = G.STASHES[5].z; tick(s, p, 2); s.jumps = [0, 1]; s.best = { 0: 10 }; const b = G.progress(s);
  check(`progress adds up (${a.pct}% to ${b.pct}%: ${b.parts.map(([n, x, of]) => `${n} ${x}/${of}`).join(', ')})`, b.pct > a.pct && b.pct < 100 && b.parts.length === 6 && b.parts.every(([, x, of]) => x >= 0 && x <= of));
}
{ // saves
  const { s, p } = world(); p.x = G.STASHES[2].x; p.z = G.STASHES[2].z; tick(s, p, 2);
  const s2 = G.migrate(JSON.parse(JSON.stringify(s))); G.step(s2, DT);
  check('found stashes survive a save and load', s2.stashes.length === 1);
}
console.log(fails.length ? `\n${fails.length} FAILED` : '\nSIDE TESTS PASSED'); process.exit(fails.length ? 1 : 0);
