// Vehicle contact and dead-car cleanup in the state layer, no browser. Run: node tools/collision-test.mjs
// A vehicle touches things with its own body (a box as long and wide as the model), not a circle around it.
import * as G from '../src/state.js';

const DT = 1 / 30, fails = [];
const check = (name, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) fails.push(name); };
const world = (cfg = {}) => { const s = G.createState(1, { traffic: 0, peds: 0, ...cfg }); s.policeT = 1e9; s.opening = { done: true, beat: 'done', ids: [] }; return { s, p: G.player(s) }; };
// the player in a parked car of this type, on an empty stretch of street heading +z, everything else moved away
function inCar(type, cfg) {
  const w = world(cfg), { s, p } = w, c = s.cars.find((k) => (k.type === type || k.model === type) && !k.ai && !k.driver);
  p.x = c.x - 1.2; p.z = c.z; G.applyAction(s, p.id, { type: 'car' });
  for (const o of s.cars) if (o !== c) o.x += 2000;
  c.x = G.PITCH / 2; c.z = -100; c.ry = c.mh = 0; c.v = 0; c.steer = 0;
  return { ...w, c };
}
const park = (s, type, x, z, ry) => { const o = s.cars.find((k) => k.type === type && !k.driver && k.x > 1000); o.x = x; o.z = z; o.ry = ry; o.v = 0; return o; };
// hold a straight line at a set speed for n frames
function cruise(s, p, c, v, n) { for (let i = 0; i < n; i++) { c.v = v; c.steer = 0; G.movePlayer(s, p, 0, 0.2, false, DT); G.step(s, DT); } }
// the east face of a long building with open ground beside it: { x, z } at the middle of the wall
function wallOf(s) {
  const all = G.allBuildings();
  for (const k of all) { if (k.d < 12) continue; const x = k.x + k.w / 2;
    if ([-7, -3.5, 0, 3.5, 7].every((dz) => !G.insideBuilding(x + 0.3, k.z + dz * k.d / 14, 0) && !G.insideBuilding(x + 3, k.z + dz, 2.6) && !G.insideBuilding(x + 9, k.z + dz, 2.6))) return { x, z: k.z, d: k.d }; }
  throw new Error('no open wall found');
}

{ // passing a parked car
  const pass = (gap) => { const { s, p, c } = inCar('sedan'), F = G.footprint(c), o = park(s, 'sedan', 0, -85, 0), Fo = G.footprint(o);
    o.x = c.x + F.hw + Fo.hw + gap; const hp = c.hp, ox = o.x; cruise(s, p, c, 12, 75);
    return { touched: c.hp < hp || Math.abs(o.x - ox) > 0.01, passed: c.z > o.z + 5 }; };
  const near = pass(0.25), over = pass(-0.3);
  check('passing a parked car with a hand of space between the doors does not touch it', !near.touched && near.passed);
  check('passing with the bodies overlapping does', over.touched);
}
{ // nose to tail
  const { s, p, c } = inCar('sedan'), F = G.footprint(c), o = park(s, 'sedan', c.x, c.z + 12, 0), Fo = G.footprint(o);
  cruise(s, p, c, 2, 60);
  const gap = (o.z - c.z) - F.hl - Fo.hl; // one frame in the test: the touching car is shoved along, so check it at first contact
  const { s: s2, p: p2, c: c2 } = inCar('sedan'), o2 = park(s2, 'sedan', c2.x, c2.z + 12, 0); let first = null;
  for (let i = 0; i < 200 && first == null; i++) { const before = o2.z; c2.v = 2; G.movePlayer(s2, p2, 0, 0.2, false, DT); G.step(s2, DT); if (o2.z !== before) first = before - (c2.z - 2 * DT) - F.hl - Fo.hl; }
  check(`driving up behind a car, you touch it when the bumpers meet (${first == null ? 'never' : first.toFixed(2) + ' m'} apart at contact)`, first != null && first > -0.15 && first < 0.15);
  check('and the bodies never end up inside each other', gap > -0.05);
}
{ // walls
  const { s, p, c } = inCar('sedan'), F = G.footprint(c), w = wallOf(s);
  c.x = w.x + F.hw + 0.25; c.z = w.z - 3; const hp = c.hp; cruise(s, p, c, 10, 18);
  check('driving along a wall with a hand of space does not scrape it', c.hp === hp && Math.abs(c.x - (w.x + F.hw + 0.25)) < 0.01 && c.z > w.z + 2);
  const sc = inCar('sedan'); sc.c.x = w.x + F.hw - 0.2; sc.c.z = w.z - 3; cruise(sc.s, sc.p, sc.c, 10, 6);
  check('driving with the door in the wall does scrape it, and pushes the car back out', sc.c.x >= w.x + F.hw - 0.01);
  const n = inCar('sedan'); n.c.x = w.x + 8; n.c.z = w.z; n.c.ry = n.c.mh = -Math.PI / 2; n.c.hp = n.c.max = 1e6;
  for (let i = 0; i < 120; i++) { n.c.v = 3; n.c.steer = 0; n.c.ry = n.c.mh = -Math.PI / 2; G.movePlayer(n.s, n.p, 0, 0.2, false, DT); G.step(n.s, DT); }
  const nose = n.c.x - F.hl - w.x;
  check(`nose into a wall stops with the bumper on it (${nose.toFixed(2)} m off)`, Math.abs(nose) < 0.12);
  const b = inCar('dirtbike'), Fb = G.footprint(b.c); b.c.x = w.x + Fb.hw + 0.25; b.c.z = w.z - 3; const bhp = b.c.hp; cruise(b.s, b.p, b.c, 10, 18);
  check('a bike rides the same gap along the wall, and it is narrower than a car', b.c.hp === bhp && Fb.hw < F.hw / 2);
}
{ // people
  const run = (side) => { const { s, p, c } = inCar('sedan', { peds: 6 }), F = G.footprint(c), e = s.ents.find((k) => k.kind === 'ped');
    for (const k of s.ents) if (k !== e && k !== p) { k.x += 3000; }
    const hp = e.hp; for (let i = 0; i < 40; i++) { e.x = c.x + side(F); e.z = -88; e.kx = e.kz = 0; c.v = 12; c.steer = 0; G.movePlayer(s, p, 0, 0.2, false, DT); G.step(s, DT); if (e.hp < hp) return true; }
    return false; };
  check('someone standing a step off your door is not run over', !run((F) => F.hw + 0.9));
  check('someone in front of the bumper is', run(() => 0.3));
}
{ // dead cars leave the street
  const { s, p, c } = inCar('sedan'); const id = c.id; c.hp = 1; c.max = 100;
  const w = wallOf(s); c.x = w.x + 8; c.z = w.z;
  for (let i = 0; i < 90 && !c.wrecked; i++) { c.v = 20; c.ry = c.mh = -Math.PI / 2; G.movePlayer(s, p, 0, 1, false, DT); G.step(s, DT); }
  check('a car driven into a wall with no health left is a wreck', c.wrecked);
  let sank = false; const lim = (G.WRECK_CLEAR + G.CLEAR_TIME + G.BURN_TIME + 6) / DT;
  for (let i = 0; i < lim && s.cars.some((k) => k.id === id); i++) { p.x = c.x + 6; p.z = c.z; p.hp = p.max; G.step(s, DT); if (c.clear != null) sank = true; }
  check('the wreck is cleared off the street with you standing next to it', !s.cars.some((k) => k.id === id) && sank);
  check(`it stays long enough to burn out first (${G.WRECK_CLEAR} s)`, G.WRECK_CLEAR >= 12);
  const far = world(), fc = far.s.cars.find((k) => k.type === 'sedan' && !k.ai); fc.wrecked = true; fc.hp = 0; fc.wreckT = G.WRECK_CLEAR + 1; fc.x = far.p.x + 300; G.step(far.s, DT); G.step(far.s, DT);
  check('a wreck nobody can see is gone at once', !far.s.cars.some((k) => k.id === fc.id));
}
console.log(fails.length ? `\n${fails.length} FAILED` : '\nCOLLISION TESTS PASSED');
process.exit(fails.length ? 1 : 0);
