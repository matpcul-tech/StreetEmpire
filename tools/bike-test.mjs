// Motorcycle rules in the state layer, no browser. Run: node tools/bike-test.mjs
import * as G from '../src/state.js';

const DT = 1 / 30, fails = [];
const isBike = (c) => c.type === 'bike', isCruiser = (c) => c.model === 'cruiser';
const check = (name, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) fails.push(name); };
const world = () => { const s = G.createState(1, { traffic: 0, peds: 0 }); s.policeT = 1e9; s.opening = { done: true, beat: 'done', ids: [] }; return { s, p: G.player(s) }; };
// the east face of the first building found walking west from a street: { x, z } of the wall, open street to its east
function wallOf(s) {
  for (const b of s.blocks) { const bc = G.blockCenter(b);
    for (const dz of [0, -8, 8, -14, 14]) { if (G.insideBuilding(bc.x + G.PITCH / 2, bc.z + dz, 2)) continue;
      for (let x = bc.x + G.PITCH / 2; x > bc.x; x -= 0.05) if (G.insideBuilding(x, bc.z + dz, 0)) { if (!G.insideBuilding(x + 3, bc.z + dz - 2, 1.7) && !G.insideBuilding(x + 3, bc.z + dz + 2, 1.7)) return { x, z: bc.z + dz }; break; } } }
  throw new Error('no building wall found');
}
const ride = (s, p, mx, mz, n, brake = false) => { for (let i = 0; i < n; i++) { G.movePlayer(s, p, mx, mz, brake, DT); G.step(s, DT); } };

{ // the world
  const { s, p } = world(), bikes = s.cars.filter(isBike);
  check(`bikes are parked around the city (${bikes.length}, ${bikes.filter(isCruiser).length} of them cruisers)`, bikes.length >= 30 && bikes.filter(isCruiser).length >= 8 && ['sportbike', 'cruiser', 'dirtbike'].every((m) => bikes.some((c) => c.model === m)));
  check('a sport bike and a cruiser both stand by the start', [true, false].every((cr) => bikes.some((c) => isCruiser(c) === cr && Math.hypot(c.x - p.x, c.z - p.z) < 25)));
  check('no bike is parked inside a building or on another car', bikes.every((c) => !G.insideBuilding(c.x, c.z, 0.5) && !s.cars.some((o) => o !== c && Math.hypot(o.x - c.x, o.z - c.z) < 1.4)));
}
{ // getting on, riding, getting off
  const { s, p } = world(), bike = s.cars.filter((c) => isCruiser(c) && c.ry === 0).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
  p.x = bike.x - 1.2; p.z = bike.z;
  G.applyAction(s, p.id, { type: 'car' });
  check('the car button mounts a bike', p.car === bike.id && bike.driver === p.id);
  check('no heat for taking a parked bike', !p.heat);
  bike.hp = bike.max = 1e6; // this block checks the controls; where the ride ends up depends on what it clips, and a wreck would end it early
  const x0 = bike.x, z0 = bike.z; ride(s, p, 0, 1, 45);
  check(`it pulls away hard (${bike.v.toFixed(1)} m/s after 1.5 s)`, bike.v > 18 && Math.hypot(bike.x - x0, bike.z - z0) > 10);
  const sedan = { v: 0 }; { const w = world(), c = w.s.cars.find((c) => c.type === 'sedan'); w.p.x = c.x - 2; w.p.z = c.z; G.applyAction(w.s, w.p.id, { type: 'car' }); ride(w.s, w.p, 0, 1, 45); sedan.v = c.v; }
  check(`quicker than a sedan over the same 1.5 s (${sedan.v.toFixed(1)} m/s)`, bike.v > sedan.v);
  const bv = bike.v; ride(s, p, 0, -1, 12); check('the brake bites', bike.v < bv - 8);
  const ry0 = bike.ry; ride(s, p, 1, 0.5, 40);
  check('it steers', Math.abs(bike.ry - ry0) > 0.2);
  ride(s, p, 0, -1, 90);
  G.applyAction(s, p.id, { type: 'car' });
  check('the car button gets you off, right beside it', !p.car && bike.driver == null && Math.hypot(p.x - bike.x, p.z - bike.z) < 1.6);
}
{ // the dirt bike: the tightest turner, the slowest on a straight, and narrow against walls
  // the same held turn at the same speed on an open street, for each vehicle
  const turn = (pick) => { const { s, p } = world(), c = s.cars.filter(pick).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    p.x = c.x - 1.2; p.z = c.z; G.applyAction(s, p.id, { type: 'car' });
    c.x = G.PITCH / 2; c.z = -100; c.ry = 0; c.mh = 0; for (const o of s.cars) if (o !== c && Math.hypot(o.x - c.x, o.z - c.z) < 60) o.x += 400;
    for (let i = 0; i < 20; i++) { c.v = 8; G.movePlayer(s, p, 1, 0.3, false, DT); G.step(s, DT); } return { ry: Math.abs(c.ry), s, p, c }; };
  const model = (m) => (c) => isBike(c) && c.model === m && !c.driver;
  const dirt = turn(model('dirtbike')), sport = turn(model('sportbike')), cruiser = turn(model('cruiser')), sedan = turn((c) => c.type === 'sedan' && !c.ai);
  check(`the dirt bike turns tighter than the other two bikes (${dirt.ry.toFixed(2)} rad against ${sport.ry.toFixed(2)} and ${cruiser.ry.toFixed(2)})`, dirt.ry > sport.ry * 1.2 && dirt.ry > cruiser.ry * 1.2);
  check(`the sport bike and cruiser still turn like they did (${sedan.ry.toFixed(2)} rad for a sedan)`, Math.abs(sport.ry - sedan.ry) < 0.12 && Math.abs(cruiser.ry - sedan.ry) < 0.12);
  { const { s, p, c } = dirt; c.ry = 0; c.mh = 0; c.steer = 0; c.x = G.PITCH / 2; c.z = -100; ride(s, p, 0, 1, 300);
    check(`and tops out at its own limit (${c.v.toFixed(1)})`, Math.abs(c.v - G.BIKE_MODELS.dirtbike.max) < 1.5 && G.BIKE_MODELS.dirtbike.max < G.BIKE_MODELS.cruiser.max); }
  // driven slowly at a building, a bike stops closer to the wall than a car does
  const wall = wallOf;
  const hug = (pick) => { const { s, p } = world(), c = s.cars.filter(pick)[0]; p.x = c.x - 1.2; p.z = c.z; G.applyAction(s, p.id, { type: 'car' });
    const w = wall(s); c.x = w.x + 6; c.z = w.z; c.ry = -Math.PI / 2; c.mh = c.ry; c.hp = c.max = 1e6;
    for (const o of s.cars) if (o !== c && Math.hypot(o.x - c.x, o.z - c.z) < 40) o.x += 400;
    for (let i = 0; i < 90; i++) { c.v = 3; c.steer = 0; c.ry = c.mh = -Math.PI / 2; G.movePlayer(s, p, 0, 0.3, false, DT); G.step(s, DT); } return { gap: c.x - w.x, s, p, c }; };
  const hb = hug(model('dirtbike')), hc = hug((c) => c.type === 'sedan' && !c.ai);
  check(`a bike gets closer to a wall than a car (${hb.gap.toFixed(2)} m against ${hc.gap.toFixed(2)} m)`, hb.gap < hc.gap - 0.4 && hb.gap > 0.5);
  // nose to the wall, then turned along it: getting off must put you on the street side, never in the building
  { const { s, p, c } = hb; c.v = 0; c.ry = c.mh = Math.PI; G.applyAction(s, p.id, { type: 'car' });
    check('getting off a bike parked against a wall puts you on the open side', !p.car && !G.insideBuilding(p.x, p.z, 0.4) && Math.hypot(p.x - c.x, p.z - c.z) < 1.6); }
}
{ // a wrecked bike
  const { s, p } = world(), bike = s.cars.filter((c) => isBike(c) && c.model === 'dirtbike')[0];
  p.x = bike.x - 1.2; p.z = bike.z; G.applyAction(s, p.id, { type: 'car' });
  const w = wallOf(s); bike.x = w.x + 8; bike.z = w.z; bike.hp = 1;
  for (const o of s.cars) if (o !== bike && Math.hypot(o.x - bike.x, o.z - bike.z) < 40) o.x += 400;
  for (let i = 0; i < 90 && !bike.wrecked; i++) { bike.v = 20; bike.ry = bike.mh = -Math.PI / 2; G.movePlayer(s, p, 0, 1, false, DT); G.step(s, DT); }
  check('riding it into a wall wrecks it and puts you on your feet, alive', bike.wrecked && !p.car && p.hp > 0);
}
{ // the squad does not pile on
  const { s, p } = world(), bike = s.cars.find(isBike);
  p.x = bike.x - 1.2; p.z = bike.z;
  const f = G.spawnUnit(s, 'player', 'follower', s.blocks[0].id, p.x - 1, p.z); f.leader = p.id; f.role = 'follower';
  G.applyAction(s, p.id, { type: 'car' }); ride(s, p, 0, 0, 90);
  check('a follower stays off the bike', !f.car);
}
{ // old saves
  const { s } = world(); s.cars = s.cars.filter((c) => !String(c.id).startsWith('bikeH')); for (const c of s.cars) if (isBike(c)) delete c.model; delete s.bikesV; // a save made after the sport bike, before the cruiser
  const m = G.migrate(JSON.parse(JSON.stringify(s)));
  check('a save from before the cruiser gets them on load', m.cars.some(isCruiser));
  const n = m.cars.length; G.migrate(m);
  check('and only once', m.cars.length === n);
}
{ // bikes all over the city, and saves from when there were ten get the rest
  const { s } = world(), bikes = s.cars.filter(isBike), half = G.GRID * G.PITCH / 4;
  const quad = (c) => (c.x > 0 ? 1 : 0) + (c.z > 0 ? 2 : 0);
  check('every quarter of the city has at least five bikes', [0, 1, 2, 3].every((q) => bikes.filter((c) => quad(c) === q).length >= 5));
  check('each quarter has all three models', [0, 1, 2, 3].every((q) => ['sportbike', 'cruiser', 'dirtbike'].every((m) => bikes.some((c) => quad(c) === q && c.model === m))));
  const old = world().s; old.cars = old.cars.filter((c) => !String(c.id).startsWith('bikeC')); old.bikesV = 2;
  const m = G.migrate(JSON.parse(JSON.stringify(old)));
  check(`a save with ten bikes gets the rest on load (${m.cars.filter(isBike).length})`, m.cars.filter(isBike).length === bikes.length);
  const n = m.cars.length; G.migrate(m); check('and only once', m.cars.length === n);
}
console.log(fails.length ? `\n${fails.length} FAILED` : '\nBIKE TESTS PASSED');
process.exit(fails.length ? 1 : 0);
