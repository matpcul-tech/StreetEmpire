// Dirt bike checks on the real state layer, no browser.
// Run: node tools/bike-test.mjs
import * as G from '../src/state.js';

const DT = 1 / 30, fails = [];
function check(name, ok) { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) fails.push(name); }
function world() { const s = G.createState(1, { traffic: 0, peds: 0 }); s.policeT = 1e9; return { s, p: G.player(s) }; }
// drive for n frames with the stick at (steer, throttle); returns the vehicle
function drive(s, p, n, steer, throttle) { for (let i = 0; i < n; i++) { G.movePlayer(s, p, steer, throttle, false, DT); G.step(s, DT); } return s.cars.find((c) => c.id === p.car); }
function mount(s, p, type) {
  const c = s.cars.find((k) => k.type === type && !k.ai);
  // an open stretch of street, pointing down it
  c.x = G.PITCH / 2; c.z = -100; c.ry = 0; c.mh = 0; c.v = 0; p.x = c.x - 1.5; p.z = c.z;
  for (const o of s.cars) if (o !== c && Math.hypot(o.x - c.x, o.z - c.z) < 60) { o.x += 400; }
  G.applyAction(s, p.id, { type: 'car' });
  return c;
}

{ // parked bikes exist, and they are placed without disturbing the rest of a new game
  const { s } = world(), bikes = s.cars.filter((c) => c.type === 'dirtbike');
  check(`a new game parks dirt bikes (${bikes.length})`, bikes.length >= 8 && bikes.length <= 14);
  check('no bike is parked on top of a car', bikes.every((b) => s.cars.every((c) => c === b || Math.hypot(c.x - b.x, c.z - b.z) > 3)));
  const home = G.blockCenter(s.blocks[0]);
  check('one is within a short walk of the start', bikes.some((b) => Math.hypot(b.x - home.x, b.z - home.z) < 40));
  check('bikes are never traffic', bikes.every((b) => !b.ai));
}
{ // riding
  const { s, p } = world(), b = mount(s, p, 'dirtbike');
  check('E next to a bike puts you on it', p.car === b.id && b.driver === p.id);
  drive(s, p, 45, 0, 1); const v15 = b.v, z15 = b.z;
  check(`it pulls away (${v15.toFixed(1)} m/s after 1.5 s)`, v15 > 12 && z15 > -100 + 8);
  drive(s, p, 240, 0, 1);
  check(`it tops out at its limit (${b.v.toFixed(1)})`, Math.abs(b.v - G.CAR_TYPES.dirtbike.max) < 1.5);
  const { s: s2, p: p2 } = world(), car = mount(s2, p2, 'sedan'); drive(s2, p2, 45, 0, 1);
  check(`it is quicker off the line than a sedan (${v15.toFixed(1)} against ${car.v.toFixed(1)})`, v15 > car.v + 2);
}
{ // steering: tighter than a car at the same speed
  const turn = (type) => { const { s, p } = world(), c = mount(s, p, type); for (let i = 0; i < 20; i++) { c.v = 8; G.movePlayer(s, p, 1, 0.3, false, DT); G.step(s, DT); } return Math.abs(c.ry); };
  const bike = turn('dirtbike'), sedan = turn('sedan');
  check(`it turns tighter than a sedan (${bike.toFixed(2)} rad against ${sedan.toFixed(2)})`, bike > sedan * 1.2);
}
{ // getting off, and a wreck
  const { s, p } = world(), b = mount(s, p, 'dirtbike');
  drive(s, p, 30, 0, 1); b.v = 0; G.applyAction(s, p.id, { type: 'car' });
  check('E again gets you off, standing beside it', !p.car && !b.driver && Math.hypot(p.x - b.x, p.z - b.z) < 3.5);
  G.applyAction(s, p.id, { type: 'car' });
  check('you can get back on', p.car === b.id);
  check('it is fragile next to a car', b.max < G.CAR_TYPES.sedan.hp);
  // straight at the nearest building at speed, already beaten up
  b.hp = 1; b.x = G.blockCenter(s.blocks[40]).x; b.z = G.blockCenter(s.blocks[40]).z - G.PITCH / 2; b.ry = 0; b.mh = 0;
  for (let i = 0; i < 150 && !b.wrecked; i++) { b.v = Math.max(b.v, 20); G.movePlayer(s, p, 0, 1, false, DT); G.step(s, DT); }
  check('a wrecked bike throws you clear and stays wrecked', b.wrecked && !p.car && p.hp > 0);
}
{ // an old save gets bikes once, and only once
  const { s } = world(), n = s.cars.length;
  const old = JSON.parse(JSON.stringify(s)); old.cars = old.cars.filter((c) => c.type !== 'dirtbike'); delete old.bikesV;
  const m = G.migrate(old), added = m.cars.filter((c) => c.type === 'dirtbike').length;
  check(`a save from before the bikes gets them on load (${added})`, added > 0 && m.cars.length === n);
  const again = G.migrate(JSON.parse(JSON.stringify(m)));
  check('loading again adds no more', again.cars.length === n);
  check('new bike ids do not clash', new Set(m.cars.map((c) => c.id)).size === m.cars.length);
}
console.log(fails.length ? `\nBIKE TEST FAILED: ${fails.join('; ')}` : '\nBIKE TEST PASSED');
process.exitCode = fails.length ? 1 : 0;
