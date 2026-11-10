// Motorcycle rules in the state layer, no browser. Run: node tools/bike-test.mjs
import * as G from '../src/state.js';

const DT = 1 / 30, fails = [];
const check = (name, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) fails.push(name); };
const world = () => { const s = G.createState(1, { traffic: 0, peds: 0 }); s.policeT = 1e9; s.opening = { done: true, beat: 'done', ids: [] }; return { s, p: G.player(s) }; };
const ride = (s, p, mx, mz, n, brake = false) => { for (let i = 0; i < n; i++) { G.movePlayer(s, p, mx, mz, brake, DT); G.step(s, DT); } };

{ // the world
  const { s, p } = world(), bikes = s.cars.filter(G.isBike);
  check(`bikes are parked around the city (${bikes.length})`, bikes.length >= 10);
  check('one is a short walk from the start', bikes.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < 25));
  check('no bike is parked inside a building or on another car', bikes.every((c) => !G.insideBuilding(c.x, c.z, 0.5) && !s.cars.some((o) => o !== c && Math.hypot(o.x - c.x, o.z - c.z) < 3)));
}
{ // getting on, riding, getting off
  const { s, p } = world(), bike = s.cars.filter(G.isBike).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
  p.x = bike.x - 1.2; p.z = bike.z;
  G.applyAction(s, p.id, { type: 'car' });
  check('the car button mounts a bike', p.car === bike.id && bike.driver === p.id);
  check('no heat for taking a parked bike', !p.heat);
  const z0 = bike.z; ride(s, p, 0, 1, 45);
  check(`it pulls away hard (${bike.v.toFixed(1)} m/s after 1.5 s)`, bike.v > 18 && Math.abs(bike.z - z0) > 10);
  const sedan = { v: 0 }; { const w = world(), c = w.s.cars.find((c) => c.type === 'sedan'); w.p.x = c.x - 2; w.p.z = c.z; G.applyAction(w.s, w.p.id, { type: 'car' }); ride(w.s, w.p, 0, 1, 45); sedan.v = c.v; }
  check(`quicker than a sedan over the same 1.5 s (${sedan.v.toFixed(1)} m/s)`, bike.v > sedan.v);
  const bv = bike.v; ride(s, p, 0, -1, 12); check('the brake bites', bike.v < bv - 8);
  const ry0 = bike.ry; ride(s, p, 1, 0.3, 20);
  check('it steers', Math.abs(bike.ry - ry0) > 0.2);
  ride(s, p, 0, -1, 90);
  G.applyAction(s, p.id, { type: 'car' });
  check('the car button gets you off, right beside it', !p.car && bike.driver == null && Math.hypot(p.x - bike.x, p.z - bike.z) < 1.6);
}
{ // the squad does not pile on
  const { s, p } = world(), bike = s.cars.find(G.isBike);
  p.x = bike.x - 1.2; p.z = bike.z;
  const f = G.spawnUnit(s, 'player', 'follower', s.blocks[0].id, p.x - 1, p.z); f.leader = p.id; f.role = 'follower';
  G.applyAction(s, p.id, { type: 'car' }); ride(s, p, 0, 0, 90);
  check('a follower stays off the bike', !f.car);
}
{ // old saves
  const { s } = world(); s.cars = s.cars.filter((c) => !G.isBike(c)); delete s.bikesV;
  const m = G.migrate(JSON.parse(JSON.stringify(s)));
  check('a save from before bikes gets them on load', m.cars.some(G.isBike) && m.bikesV === 1);
  const n = m.cars.length; G.migrate(m);
  check('and only once', m.cars.length === n);
}
console.log(fails.length ? `\n${fails.length} FAILED` : '\nBIKE TESTS PASSED');
process.exit(fails.length ? 1 : 0);
