// Focused bust repro. Runs the real state layer with no browser.
// A bust must end the chase: stars empty, sirens off, officers leaving or gone.
// Run: node tools/bust-test.mjs
import * as G from '../src/state.js';

const DT = 1 / 30;
const fails = [];
function check(name, ok) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name);
  if (!ok) fails.push(name);
}
function frames(s, p, n) {
  for (let i = 0; i < n; i++) { G.movePlayer(s, p, 0, 0, false, DT); G.step(s, DT); }
}
function cops(s) { return s.ents.filter((e) => e.kind === 'cop' && e.hp > 0); }
function sirenOn(s) { return s.cars.some((c) => c.siren); }
function world() {
  const s = G.createState(1, { traffic: 0, peds: 0 });
  const p = G.player(s);
  s.policeT = 1e9; // this file places its own units
  return { s, p };
}
function officer(s, o) {
  const e = { id: s.nextId++, kind: 'cop', crew: 'police', hp: 80, max: 80, ry: 0, cd: 0, hitT: 0, combo: 0, kx: 0, kz: 0, stun: 0, swing: 0, moving: 0, jumpT: 0, dodgeT: 0, dodgeCd: 0, car: null, weapon: 'fists', look: 0, ...o };
  s.ents.push(e);
  return e;
}
function cruiser(s, o) {
  const c = { id: 'c' + s.nextId++, type: 'police', x: 0, z: 0, ry: 0, v: 0, steer: 0, driver: null, ai: false, hp: 150, max: 150, wrecked: false, siren: true, cops: true, cruise: 0, paint: 0, ...o };
  s.cars.push(c);
  return c;
}
function untilUp(s, p, cap = 90) {
  for (let i = 0; i < cap; i++) {
    G.step(s, DT);
    if (p.hp > 0 && !(p.downT > 0)) return true;
  }
  return false;
}

// 1. Officers on foot beside you, wrecked cruiser still wailing. Stars empty after the bust.
{
  const { s, p } = world();
  p.heat = 30;
  p.ammo = 8; p.weapon = 'pistol';
  const foot = officer(s, { x: p.x + 2.2, z: p.z + 0.4 });
  const wreck = cruiser(s, { x: p.x - 16, z: p.z + 2, ry: Math.PI / 2, wrecked: true, hp: 0, siren: true });
  const x0 = foot.x, z0 = foot.z;
  frames(s, p, 30);
  check('wanted chase still closes on the player', Math.hypot(foot.x - p.x, foot.z - p.z) < Math.hypot(x0 - p.x, z0 - p.z) - 0.4);
  check('siren still belongs to the chase while stars are up', wreck.siren === true && G.stars(p) > 0);
  const cash = s.crews.player.cash;
  G.debugDown(s);
  check('bust logs bail', s.crews.player.cash < cash && s.events.some((e) => e.text.startsWith('Bail:')));
  frames(s, p, 12);
  check('siren keeps running through the bust beat', wreck.siren === true && p.downT > 0);
  const up = untilUp(s, p);
  check('bust respawn finishes', up && p.hp === p.max && G.stars(p) === 0 && p.weapon === 'fists' && p.ammo === 0);
  check('wreck siren stops when stars are empty', !sirenOn(s));
  const snap = cops(s).map((e) => ({ id: e.id, x: e.x, z: e.z }));
  frames(s, p, 120);
  const frozen = cops(s).filter((e) => {
    const w = snap.find((q) => q.id === e.id);
    return w && Math.hypot(e.x - w.x, e.z - w.z) < 0.45;
  });
  check('officers are not frozen after the bust', frozen.length === 0 && G.stars(p) === 0);
  check('sirens stay off after the bust', !sirenOn(s));
}

// 2. Cruiser still has its crew when the bust resolves. They must go quiet and actually leave.
{
  const { s, p } = world();
  p.heat = 30;
  const car = cruiser(s, { x: p.x + 6, z: p.z + 80, ry: Math.atan2(-6, -80), v: 0, siren: true }); // up the street from the player, facing them
  officer(s, { x: car.x, z: car.z, car: car.id, look: 0 });
  officer(s, { x: car.x, z: car.z, car: car.id, look: 1 });
  frames(s, p, 8);
  check('crew stays with the cruiser during the chase', cops(s).filter((e) => e.car === car.id).length === 2 && car.siren === true && !car.wrecked);
  G.debugDown(s);
  const up = untilUp(s, p);
  const riding = cops(s).filter((e) => e.car === car.id).length;
  check('occupied cruiser siren stops as soon as the bust resolves', up && G.stars(p) === 0 && !sirenOn(s) && riding === 2);
  frames(s, p, 300);
  const still = s.cars.some((c) => c.id === car.id);
  const frozen = cops(s).filter((e) => (e.moving || 0) < 0.05 && !e.car && Math.hypot(e.x - p.x, e.z - p.z) < 70);
  check('cruiser crew does not stay stuck after the bust', !sirenOn(s) && frozen.length === 0 && (!still || Math.hypot(car.x - p.x, car.z - p.z) > 80));
}

// 3. Losing the stars without a bust (heat falls off) releases the same chase state.
{
  const { s, p } = world();
  p.heat = 24;
  const car = cruiser(s, { x: p.x + 10, z: p.z + 6, ry: Math.PI, siren: true });
  const a = officer(s, { x: car.x, z: car.z, car: car.id, look: 0 });
  const b = officer(s, { x: car.x, z: car.z, car: car.id, look: 1 });
  frames(s, p, 10);
  check('siren is on while the cruiser has a chase', car.siren === true);
  p.heat = 0;
  frames(s, p, 3);
  check('siren stops when stars drop', G.stars(p) === 0 && !sirenOn(s) && a.hp > 0 && b.hp > 0);
}

// 4. Real wanted response, then a bust, on a street that also has traffic.
{
  const s = G.createState(4, { traffic: 6, peds: 6 });
  const p = G.player(s);
  p.heat = 55;
  let saw = false;
  for (let i = 0; i < 8 / DT; i++) {
    p.hp = p.max;
    G.step(s, DT);
    if (s.cars.some((c) => c.cops && c.siren) && cops(s).length > 0) saw = true;
  }
  check('wanted response brings a cruiser and a siren', saw && G.stars(p) >= 3);
  if (p.hp > 0) G.debugDown(s);
  const up = untilUp(s, p, 120);
  check('live bust still respawns you', up && G.stars(p) === 0 && p.hp === p.max);
  check('live bust cuts every siren', !sirenOn(s));
  const snap = cops(s).map((e) => ({ id: e.id, x: e.x, z: e.z }));
  for (let i = 0; i < 12 / DT; i++) G.step(s, DT);
  const frozen = cops(s).filter((e) => {
    const w = snap.find((q) => q.id === e.id);
    return w && Math.hypot(e.x - w.x, e.z - w.z) < 0.45;
  });
  check('live bust does not leave officers stuck', frozen.length === 0 && !sirenOn(s) && G.stars(p) === 0 && p.hp === p.max);
}

if (fails.length) {
  console.log('BUST TEST FAILED: ' + fails.join('; '));
  process.exit(1);
}
console.log('BUST TEST PASSED');
