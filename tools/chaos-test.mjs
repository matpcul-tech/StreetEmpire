// Fire, explosions, stunt jumps and near misses in the state layer, no browser. Run: node tools/chaos-test.mjs
import * as G from '../src/state.js';

const DT = 1 / 30, fails = [];
const check = (name, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) fails.push(name); };
const world = () => {
  const s = G.createState(5, { traffic: 0, peds: 0 }); s.policeT = 1e9; s.opening = { done: true, beat: 'done', ids: [] };
  const p = G.player(s); s.ents = s.ents.filter((e) => e.kind === 'player'); s.cars = s.cars.filter((c) => c.type !== 'bike');
  p.x = G.lineCoord(5); p.z = G.lineCoord(5) + 20; p.ry = 0; return { s, p };
};
const seen = [], drain = (s) => { seen.push(...s.fx); s.fx.length = 0; }, got = (type) => seen.filter((f) => f.type === type);
const run = (s, sec) => { for (let i = 0; i < sec / DT; i++) { G.step(s, DT); drain(s); } };
const car = (s, x, z, ry = 0, type = 'sedan') => { const c = s.cars.find((o) => o.type === type && !o.ai && !o.used); c.used = true; c.x = x; c.z = z; c.ry = ry; c.v = 0; c.hp = c.max; return c; };
const mount = (s, p, c) => { p.x = c.x - 1.5; p.z = c.z; G.applyAction(s, p.id, { type: 'car' }); if (p.car !== c.id) throw new Error('not in the car'); };

{ // shoot a car until it burns, then it blows
  seen.length = 0; const { s, p } = world(), c = car(s, p.x, p.z + 12), near = car(s, p.x + 4, p.z + 14), far = car(s, p.x + 30, p.z + 12);
  const ped = G.spawnUnit(s, 'reds', 'defender', s.blocks[0].id, c.x - 3, c.z + 1); ped.stun = 99;
  p.weapon = 'pistol'; p.ammo = 99; let shots = 0;
  ped.x += 200; // out of the line of fire while shooting
  while (!(c.burn > 0) && shots < 40) { p.cd = 0; p.ry = 0; G.applyAction(s, p.id, { type: 'attack' }); drain(s); shots++; }
  ped.x -= 200;
  check(`pistol rounds set a parked car on fire (${shots} shots)`, c.burn > 0 && shots > 4 && got('fire').length === 1);
  const h0 = p.heat, hp0 = ped.hp, n0 = near.hp, f0 = far.hp; p.x -= 30; run(s, G.BURN_TIME + 0.5);
  check('it explodes a few seconds later', c.exploded && c.wrecked && got('boom').length >= 1);
  check(`the blast hurts someone standing by it (${hp0} to ${ped.hp})`, ped.hp < hp0 - 20);
  check(`and the car next to it (${n0} to ${near.hp.toFixed(0)}), not the one down the street`, near.hp < n0 - 20 && far.hp === f0);
  check('blowing up a car you shot brings heat', p.heat > h0);
}
{ // chain reaction
  seen.length = 0; const { s } = world(), a = car(s, 0, 30), b = car(s, 4, 30), c = car(s, 8, 30);
  a.hp = 5; b.hp = 20; c.hp = 20; G.step(s, DT); a.burn = 0.1; run(s, 12);
  check(`three cars parked close go up one after another (${got('boom').length} blasts)`, a.exploded && b.exploded && c.exploded && got('boom').length === 3);
}
{ // the driver of a burning car is warned and thrown out
  seen.length = 0; const { s, p } = world(), c = car(s, p.x + 2, p.z); mount(s, p, c);
  c.hp = c.max * 0.3; c.x = G.lineCoord(5); c.z = G.lineCoord(5) + 20; c.ry = 0; c.v = 0;
  const wall = car(s, c.x, c.z + 2.5); for (let i = 0; i < 40 && !(c.burn > 0); i++) { c.v = 20; wall.x = c.x; wall.z = c.z + 2.5; wall.hp = wall.max; G.movePlayer(s, p, 0, 1, false, DT); G.step(s, DT); drain(s); }
  check('a car beaten nearly flat catches fire', c.burn > 0);
  const hp0 = p.hp; for (let i = 0; i < 6 / DT; i++) { G.movePlayer(s, p, 0, 0, true, DT); G.step(s, DT); drain(s); }
  check(`staying in it is a bad idea (player ${hp0} to ${p.hp}, out of the car: ${!p.car})`, !p.car && p.hp < hp0 - 30);
}
{ // stunt ramps
  seen.length = 0; const { s, p } = world(), r = G.RAMPS[4], c = car(s, p.x + 2, p.z, 0, 'muscle'); mount(s, p, c);
  check(`${G.RAMPS.length} ramps, none inside a building`, G.RAMPS.length === 8 && G.RAMPS.every((q) => !G.insideBuilding(q.x, q.z, 1.5)));
  const fx = Math.sin(r.ry), fz = Math.cos(r.ry), cash0 = s.crews.player.cash;
  const go = (speed, gas = 1) => { c.x = r.x - fx * 12; c.z = r.z - fz * 12; c.ry = c.mh = r.ry; c.v = speed; c.y = 0; c.hp = c.max; let peak = 0, air = 0; for (let i = 0; i < 4 / DT; i++) { G.movePlayer(s, p, 0, gas, false, DT); G.step(s, DT); drain(s); peak = Math.max(peak, c.y || 0); if (c.y > 0) { air += DT; if (air > 0.2 && air < 0.25) G.applyAction(s, p.id, { type: 'car' }); } } return { peak, air }; };
  const slow = go(8, 0); check('rolling over a ramp slowly does nothing', slow.air === 0 && got('launch').length === 0);
  const j = go(30), st = got('stunt')[0];
  check(`hit fast, the car flies (${j.peak.toFixed(1)} m up, ${j.air.toFixed(2)} s in the air)`, j.peak > 1.5 && j.air > 0.6 && got('land').length === 1);
  check('you cannot step out in mid air', p.car === c.id);
  check(`the first clean jump pays a bonus (${st && Math.round(st.dist)} m, +$${st && st.pay})`, !!st && st.first && st.pay > 150 && s.crews.player.cash === cash0 + st.pay && s.jumps.length === 1);
  seen.length = 0; go(30); const st2 = got('stunt')[0];
  check(`the same ramp again pays by distance only (+$${st2 && st2.pay})`, !!st2 && !st2.first && st2.pay < 100 && s.jumps.length === 1);
  seen.length = 0; c.x = r.x + fx * 12; c.z = r.z + fz * 12; c.ry = c.mh = r.ry + Math.PI; c.v = 30; for (let i = 0; i < 30; i++) { G.movePlayer(s, p, 0, 1, false, DT); G.step(s, DT); drain(s); }
  check('the wrong way over a ramp does not launch', got('launch').length === 0);
}
{ // near misses
  seen.length = 0; const { s, p } = world(), c = car(s, p.x + 2, p.z); mount(s, p, c);
  const pass = (side) => { const o = s.cars.find((q) => !q.driver && q !== c && !q.used2); o.used2 = true; o.ai = true; o.cruise = 0; const X = G.lineCoord(5); c.x = X; c.z = G.lineCoord(5) + 10; c.ry = c.mh = 0; c.v = 24; c.hp = c.max; o.ry = 0; o.x = X + side; o.z = c.z + 14; for (let i = 0; i < 1.4 / DT; i++) { o.v = 5; o.x = X + side; s.t += DT; G.movePlayer(s, p, 0, 1, false, DT); drain(s); } o.x = 500; };
  s.t += 5; const cash0 = s.crews.player.cash; pass(3.6);
  check('passing traffic close and fast is a near miss', got('nearmiss').length === 1 && s.crews.player.cash > cash0);
  pass(-3.6); check(`a second one right after builds a streak (x${(got('nearmiss')[1] || {}).n})`, got('nearmiss').length === 2 && got('nearmiss')[1].n === 2 && got('nearmiss')[1].pay > got('nearmiss')[0].pay);
  seen.length = 0; pass(1.5); check('hitting the car is not a near miss', got('nearmiss').length === 0 && got('crash').length > 0);
  seen.length = 0; pass(9); check('passing wide is not one either', got('nearmiss').length === 0);
}
console.log(fails.length ? `\n${fails.length} FAILED` : '\nCHAOS TESTS PASSED'); process.exit(fails.length ? 1 : 0);
