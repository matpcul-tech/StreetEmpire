// The city reacting to the player, in the state layer, no browser. Run: node tools/city-test.mjs
import * as G from '../src/state.js';

const DT = 1 / 30, fails = [];
const check = (name, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) fails.push(name); };
// A quiet street: no crews near, no police clock, a crowd to pick tempers from. The player stands in the open road.
const world = (traffic = 0) => {
  const s = G.createState(3, { traffic, peds: 60 }); s.policeT = 1e9; s.opening = { done: true, beat: 'done', ids: [] };
  const p = G.player(s); s.ents = s.ents.filter((e) => e.kind === 'player' || e.kind === 'ped');
  p.x = G.lineCoord(4); p.z = G.lineCoord(4) + 20; p.ry = 0;
  return { s, p };
};
const run = (s, sec, each) => { for (let i = 0; i < sec / DT; i++) { G.step(s, DT); if (each) each(); } };
// one pedestrian of a given temper, put dx, dz from the player; everyone else is sent far away
const cast = (s, p, T, dx, dz) => {
  const e = s.ents.find((o) => o.kind === 'ped' && G.temper(o) === T); if (!e) throw new Error('no ' + T + ' in the crowd');
  for (const o of s.ents) if (o.kind === 'ped' && o !== e) { o.x = p.x + 100; o.z = p.z + 100; }
  e.x = p.x + dx; e.z = p.z + dz; e.block = (G.blockAt(s, e.x, e.z) || s.blocks[0]).id; e.pt = 0; return e;
};
const seen = (s, type) => s.fx.filter((f) => f.type === type);
const arm = (p) => { p.weapon = 'pistol'; p.ammo = 12; };
const punch = (s, p, e) => { p.ry = Math.atan2(e.x - p.x, e.z - p.z); p.cd = 0; G.applyAction(s, p.id, { type: 'attack', target: e.id }); };

{ // tempers
  const { s } = world(), n = {}; for (const e of s.ents) if (e.kind === 'ped') n[G.temper(e)] = (n[G.temper(e)] || 0) + 1;
  check(`a crowd has every temper (${JSON.stringify(n)})`, ['fighter', 'caller', 'gawker', 'freezer', 'runner'].every((k) => n[k] > 0) && n.runner > n.fighter);
}
{ // gunfire: runners run, freezers freeze
  const { s, p } = world(), e = cast(s, p, 'runner', 0, 12); arm(p);
  const d0 = Math.hypot(e.x - p.x, e.z - p.z); G.applyAction(s, p.id, { type: 'attack' });
  const said = seen(s, 'bark').some((f) => f.id === e.id);
  run(s, 2);
  check(`a runner bolts from a gunshot and shouts (${d0.toFixed(0)} m to ${Math.hypot(e.x - p.x, e.z - p.z).toFixed(0)} m)`, Math.hypot(e.x - p.x, e.z - p.z) > d0 + 6 && said);
}
{
  const { s, p } = world(), e = cast(s, p, 'freezer', 5, -4); arm(p);
  G.applyAction(s, p.id, { type: 'attack' });
  const x0 = e.x, z0 = e.z; run(s, 1.5);
  check('a freezer close to the shot stands with hands up', e.cower > 0 && Math.hypot(e.x - x0, e.z - z0) < 0.5);
  run(s, 3); check('then runs once the nerve comes back', Math.hypot(e.x - x0, e.z - z0) > 5);
}
{ // a witness phones it in
  const { s, p } = world(), e = cast(s, p, 'caller', 14, -6); arm(p);
  G.applyAction(s, p.id, { type: 'attack' }); const h0 = p.heat;
  check('a caller stops and gets on the phone', e.call > 0);
  run(s, 4);
  check(`the call adds heat (${h0} to ${p.heat.toFixed(0)})`, seen(s, 'called').length === 1 && p.heat > h0 + 5);
}
{
  const { s, p } = world(), e = cast(s, p, 'caller', 12, 0); arm(p);
  G.applyAction(s, p.id, { type: 'attack' }); s.fx.length = 0;
  p.weapon = 'fists'; p.x = e.x - 1; p.z = e.z; punch(s, p, e);
  run(s, 5);
  check('hitting the witness first stops the call', seen(s, 'called').length === 0 && !(e.call > 0));
}
{ // fist fights
  const { s, p } = world(), e = cast(s, p, 'fighter', 0, 1.2);
  punch(s, p, e); const hp0 = p.hp;
  check('a fighter who gets punched squares up', e.angry > 0 && e.hp > 0 && !(e.flee > 0));
  run(s, 4);
  check(`and hits back (player ${hp0} to ${p.hp})`, p.hp < hp0);
  arm(p); p.cd = 0; p.ry = Math.PI; G.applyAction(s, p.id, { type: 'attack' }); run(s, 0.3);
  check('a gun going off ends his fight', !(e.angry > 0) && e.flee > 0);
}
{
  const { s, p } = world(), v = cast(s, p, 'runner', 0, 1.2), g = s.ents.find((o) => o.kind === 'ped' && G.temper(o) === 'gawker');
  g.x = p.x + 11; g.z = p.z + 3; g.block = (G.blockAt(s, g.x, g.z) || s.blocks[0]).id;
  punch(s, p, v); const x0 = g.x, z0 = g.z; run(s, 2);
  check('a gawker stops to watch a fist fight', g.gawk > 0 && Math.hypot(g.x - x0, g.z - z0) < 0.5);
}
{ // cars and people
  const { s, p } = world(), car = s.cars.find((c) => c.type === 'sedan' && !c.ai);
  car.x = p.x + 2; car.z = p.z; car.ry = 0; G.applyAction(s, p.id, { type: 'car' });
  const e = cast(s, p, 'runner', 0, 60), ex = car.x + 0.6, ez = car.z + 60; let dived = false, hit = false;
  for (let i = 0; i < 6 / DT; i++) { if (!dived) { e.x = ex; e.z = ez; } G.movePlayer(s, p, 0, 1, false, DT); G.step(s, DT); if (seen(s, 'dive').length) dived = true; if (s.fx.some((f) => f.type === 'hit' && f.to === e.id)) hit = true; s.fx.length = 0; if (car.z > e.z + 8) break; }
  check('someone in the road dives out of the way of a fast car', dived);
}
{ // drivers
  const { s, p } = world(40); arm(p); run(s, 1);
  const near = s.cars.filter((c) => c.ai && c.type !== 'police'); let i = 0;
  for (const c of near) { c.x = p.x + 6 + (i % 5) * 4; c.z = p.z - 8 + Math.floor(i / 5) * 5; c.v = i % 2 ? 9 : 2; i++; }
  G.applyAction(s, p.id, { type: 'attack' });
  const bailed = seen(s, 'ditch').length, scared = near.filter((c) => c.scare > 0).length;
  check(`gunfire near traffic: ${scared} drivers floor it, ${bailed} leave the car and run`, scared > 0 && bailed > 0 && scared > bailed && near.filter((c) => !c.ai).every((c) => c.ditched && c.v === 0));
}
{
  const { s, p } = world(40); run(s, 1);
  const mine = s.cars.find((c) => c.type === 'sedan' && !c.ai); mine.x = p.x + 2; mine.z = p.z; mine.ry = 0; G.applyAction(s, p.id, { type: 'car' });
  const out = { rage: 0, scare: 0, honk: 0 };
  for (const o of s.cars.filter((c) => c.ai && c.type !== 'police').slice(0, 30)) {
    o.x = mine.x; o.z = mine.z + 2.6; o.v = 0; const h0 = o.honk || 0; mine.v = 12; mine.ry = 0; s.fx.length = 0; G.movePlayer(s, p, 0, 1, false, DT); G.step(s, DT);
    if (seen(s, 'ditch').some((f) => f.angry)) out.rage++; else if (o.scare > 0) out.scare++; else if ((o.honk || 0) > h0 + 3) out.honk++;
    o.x += 400; mine.hp = mine.max; // out of the way of the next one
  }
  check(`rear-ending traffic: ${out.rage} get out swinging, ${out.scare} take off, ${out.honk} lean on the horn`, out.rage > 0 && out.scare > 0 && out.honk > 0);
  // an angry driver, or one the pile-up above knocked down, back on his feet: the check is what he does next, not whether he survived the setup
  const angry = s.ents.find((e) => e.kind === 'ped' && e.angry > 0) || s.ents.find((e) => e.kind === 'ped' && e.hp <= 0); angry.hp = angry.max = 45; angry.downT = 0; angry.flee = 0; mine.v = 0; mine.hp = mine.max; mine.wrecked = false; p.car = mine.id; mine.driver = p.id; p.hp = 100; for (const o of s.ents) if (o.kind === 'ped' && o !== angry) o.angry = 0; angry.x = mine.x + 4; angry.z = mine.z; angry.angry = 14;
  const hp0 = mine.hp; for (let k = 0; k < 4 / DT; k++) { mine.v = 0; angry.angry = 14; G.movePlayer(s, p, 0, 0, true, DT); G.step(s, DT); }
  check(`the angry driver beats on your car (${hp0} to ${mine.hp})`, mine.hp < hp0);
}
{
  const { s, p } = world(40); run(s, 1); let back = 0, ran = 0;
  for (const c of s.cars.filter((o) => o.ai && o.type !== 'police').slice(0, 30)) {
    p.car = null; p.x = c.x + 1.5; p.z = c.z; s.fx.length = 0; G.applyAction(s, p.id, { type: 'car' });
    const j = seen(s, 'jack')[0]; if (!j) continue; const d = s.ents.find((e) => e.id === j.ped);
    if (d.angry > 0) back++; else if (d.flee > 0) ran++;
    c.driver = null; p.car = null; p.heat = 0;
  }
  check(`carjacking: ${ran} drivers run, ${back} come back for the car`, back > 0 && ran > back * 2);
}
{ // the street talks
  const { s, p } = world(), e = cast(s, p, 'runner', 0, 0);
  const b = G.blockAt(s, p.x + 30, p.z + 12) || s.blocks.find((o) => Math.hypot(G.blockCenter(o).x - p.x, G.blockCenter(o).z - p.z) < 60);
  b.owner = 'player'; e.block = b.id; const c = G.blockCenter(b), q = G.perimeter(0.5, c, G.BLOCK / 2 + 1); e.pt = 0.5; e.x = q.x; e.z = q.z; p.x = q.x; p.z = q.z - 3;
  run(s, 0.5, () => { p.x = e.x; p.z = e.z - 3; });
  check('people on a block you own greet you', (e.barkT || 0) > s.t);
}
{ // long soak: nothing breaks with all of it running together
  const { s, p } = world(20); arm(p); p.ammo = 999; let bad = 0;
  for (let i = 0; i < 90 / DT; i++) {
    if (i % 45 === 0) { p.cd = 0; G.applyAction(s, p.id, { type: 'attack' }); p.heat = 0; }
    G.movePlayer(s, p, Math.sin(i / 50), Math.cos(i / 70), false, DT); G.step(s, DT); s.fx.length = 0;
    for (const e of s.ents) if (!Number.isFinite(e.x) || !Number.isFinite(e.z)) bad++;
    for (const c of s.cars) if (!Number.isFinite(c.x) || !Number.isFinite(c.v)) bad++;
  }
  check(`90 s of gunfire in traffic: no broken positions, ${s.cars.filter((c) => c.ditched).length} abandoned cars left on the map`, bad === 0 && s.cars.filter((c) => c.ditched).length < 25);
}
console.log(fails.length ? `\n${fails.length} FAILED` : '\nCITY TESTS PASSED'); process.exit(fails.length ? 1 : 0);
