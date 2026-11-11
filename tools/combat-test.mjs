// Combat feel and street-call lifecycle. Real state, no browser.
// Run: node tools/combat-test.mjs
import * as G from '../src/state.js';

const DT = 1 / 30;
const fails = [];
function check(name, ok) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name);
  if (!ok) fails.push(name);
}
function step(s, p, n = 1) {
  for (let i = 0; i < n; i++) { G.movePlayer(s, p, 0, 0, false, DT); G.step(s, DT); }
}
function fresh() {
  const s = G.createState(1, { traffic: 0, peds: 0 });
  const p = G.player(s);
  s.t = 40;
  s.opening = { done: true };
  s.calls.ready = true;
  s.calls.cd = 0;
  s.calls.grace = 0;
  p.hp = p.max = 500;
  p.heat = 0;
  return { s, p };
}
function silence(s) {
  for (const e of s.ents) if (e.kind === 'npc') e.hp = 0;
}
function untilOffer(s, p, limit = 6) {
  let t = 0;
  while (t < limit && !(s.calls.active && s.calls.active.phase === 'offer')) {
    s.calls.ready = true; s.calls.grace = 0; s.calls.cd = 0; s.t = Math.max(s.t, 40);
    if (s.opening) s.opening.done = true;
    step(s, p, 1); t += DT;
  }
  return s.calls.active;
}
function streetEnts(s, id) {
  return s.ents.filter((e) => e.streetId === id && e.hp > 0);
}

check('weapon list stays the five carried weapons', JSON.stringify(Object.keys(G.WEAPONS)) === JSON.stringify(['fists', 'knuckles', 'bat', 'pistol', 'shotgun']));
check('fists recover faster than the bat', G.WEAPONS.fists.cd < G.WEAPONS.bat.cd - 0.2 && G.WEAPONS.bat.kb > G.WEAPONS.fists.kb + 4);

// Weapon identity: fists hit one, knuckles stun, bat cleaves, pistol is precise, shotgun spreads.
{
  const { s, p } = fresh();
  silence(s);
  p.ry = 0; p.x += 2;
  const a = G.spawnUnit(s, 'reds', 'brawler', 0, p.x, p.z + 2.1);
  const b = G.spawnUnit(s, 'reds', 'brawler', 0, p.x + 0.7, p.z + 2.2);
  a.hp = b.hp = 80;
  p.weapon = 'fists'; p.cd = 0; p.combo = 0;
  G.applyAction(s, p.id, { type: 'attack', target: a.id });
  check('fists connect as a heavy cross and leave the second man standing', a.hp < 80 && b.hp === 80 && s.fx.some((f) => f.type === 'hit' && f.tag === 'CROSS' && f.amt >= 20));
  p.cd = 0; p.weapon = 'knuckles'; p.hasKnux = true;
  G.applyAction(s, p.id, { type: 'attack', target: a.id });
  check('knuckles keep a long stun', a.stun >= 0.9 && s.fx.some((f) => f.tag === 'KNUCK'));
  a.hp = b.hp = 80; a.stun = 0;
  p.cd = 0; p.weapon = 'bat'; p.hasBat = true;
  G.applyAction(s, p.id, { type: 'attack', target: a.id });
  const batHits = s.fx.filter((f) => f.type === 'hit' && f.tag === 'BAT');
  check('bat cleaves a second target for less', batHits.length === 2 && a.hp < 80 && b.hp < 80 && a.hp !== b.hp);
  const side = G.spawnUnit(s, 'reds', 'brawler', 0, p.x + 8, p.z + 6);
  side.hp = 80; a.hp = 80;
  p.cd = 0; p.ammo = 6; p.weapon = 'pistol';
  s.fx.length = 0;
  G.applyAction(s, p.id, { type: 'attack', target: a.id });
  check('pistol hits one man in the lane', a.hp < 80 && side.hp === 80 && s.fx.filter((f) => f.type === 'hit').length === 1);
  a.hp = 80; b.hp = 80; b.x = p.x + 1.1; b.z = p.z + 6; a.z = p.z + 6; a.x = p.x - 1.1;
  p.cd = 0; p.shells = 4; p.weapon = 'shotgun';
  s.fx.length = 0;
  G.applyAction(s, p.id, { type: 'attack', target: a.id });
  check('shotgun spreads across two men in the cone', a.hp < 80 && b.hp < 80 && s.fx.filter((f) => f.type === 'hit').length >= 2);
}

// Tell, then damage. A dodge that is up when the tell lands takes no health.
{
  const { s, p } = fresh();
  silence(s);
  p.ry = 0;
  const e = G.spawnUnit(s, 'reds', 'brawler', 0, p.x, p.z + 1.5);
  e.style = 'rush'; e.weapon = 'fists'; e.cd = 0; e.hp = e.max = 80;
  let told = false, hitBeforeTell = false, guard = 0;
  while (guard < 90 && e.windup <= 0) {
    step(s, p, 1); guard++;
    if (s.fx.some((f) => f.type === 'hit' && f.to === p.id)) hitBeforeTell = true;
  }
  check('rush shows a tell before the hit', e.windup > 0 && !hitBeforeTell && s.fx.some((f) => f.type === 'tell' && f.by === e.id));
  told = s.fx.some((f) => f.type === 'tell');
  const hp = p.hp;
  G.applyAction(s, p.id, { type: 'dodge', dx: 1, dz: 0 });
  let swung = false;
  for (let i = 0; i < 40 && e.hp > 0; i++) {
    step(s, p, 1);
    if (s.fx.some((f) => (f.type === 'hit' || f.type === 'evade' || f.type === 'whiff') && f.by === e.id)) { swung = true; break; }
  }
  check('dodge covers the tell and the player keeps that health', told && swung && p.hp === hp && p.hp > 0);
}

// Dodge buffer: a tap during cooldown comes out once the roll is legal.
{
  const { s, p } = fresh();
  p.dodgeCd = 0.12; p.dodgeT = 0;
  G.applyAction(s, p.id, { type: 'dodge', dx: 0, dz: 1 });
  check('early dodge is buffered, not dropped', p.dodgeBuf > 0 && p.dodgeT === 0);
  step(s, p, 8);
  check('buffered dodge fires when the cooldown ends', p.dodgeT > 0 || s.fx.some((f) => f.type === 'dodge' && f.to === p.id));
}

// Flank steps off the line. Retreat opens distance when hurt. Two strikers at most.
{
  const { s, p } = fresh();
  silence(s);
  const flank = G.spawnUnit(s, 'reds', 'brawler', 0, p.x + 6, p.z);
  flank.style = 'flank'; flank.weapon = 'fists'; flank.cd = 0; flank.hp = flank.max = 80;
  const z0 = flank.z;
  step(s, p, 30);
  check('flanker steps off the straight line before settling', Math.abs(flank.z - z0) > 0.45 || flank.flanked === true);

  const back = G.spawnUnit(s, 'blues', 'brawler', 0, p.x + 3.2, p.z);
  back.style = 'retreat'; back.weapon = 'fists'; back.hp = 12; back.max = 60; back.cd = 0;
  const d0 = Math.hypot(back.x - p.x, back.z - p.z);
  step(s, p, 36);
  const d1 = Math.hypot(back.x - p.x, back.z - p.z);
  check('hurt retreater opens distance', d1 > d0 + 0.8);

  silence(s);
  const pack = [];
  for (let i = 0; i < 5; i++) {
    const ang = (i / 5) * Math.PI * 2;
    const e = G.spawnUnit(s, 'golds', 'brawler', 0, p.x + Math.cos(ang) * 2, p.z + Math.sin(ang) * 2);
    e.style = 'rush'; e.weapon = 'fists'; e.cd = 0; e.hp = e.max = 80;
    pack.push(e);
  }
  let maxWind = 0, lateClose = 0;
  for (let i = 0; i < 50; i++) {
    step(s, p, 1);
    maxWind = Math.max(maxWind, pack.filter((e) => e.hp > 0 && e.windup > 0).length);
    if (i > 30) lateClose = Math.max(lateClose, pack.filter((e) => e.hp > 0 && Math.hypot(e.x - p.x, e.z - p.z) < 3.3).length);
  }
  check('at most two of five can be in a swing', maxWind <= G.CALLS.strikeCap && maxWind >= 1);
  check('the others are held out of the pile', lateClose <= G.CALLS.strikeCap);
}

// Street calls: not on spawn, not during opening, offer then choice, cooldown, cap.
{
  const quiet = G.createState(2, { traffic: 0, peds: 0 });
  const qp = G.player(quiet);
  quiet.calls.ready = true; quiet.calls.cd = 0; quiet.t = 1;
  step(quiet, qp, 20);
  check('no street call in the first seconds after spawn', !quiet.calls.active);

  const mid = G.createState(2, { traffic: 0, peds: 0 });
  const mp = G.player(mid);
  G.openingScuffle(mid);
  mid.calls.ready = true; mid.calls.cd = 0; mid.t = 40;
  step(mid, mp, 30);
  check('opening blocks street calls', !mid.calls.active && mid.opening && !mid.opening.done);
}

{
  const { s, p } = fresh();
  const offer = untilOffer(s, p);
  const crew = streetEnts(s, offer && offer.id);
  const near = crew.map((e) => Math.hypot(e.x - p.x, e.z - p.z));
  check('first call is an incursion offer with a capped crew', !!offer && offer.kind === 'incursion' && offer.phase === 'offer' && crew.length === 3 && crew.length <= G.CALLS.maxNpc);
  check('the crew is posted out of reach and does not attack yet', near.length === 3 && Math.min(...near) >= G.CALLS.minDist && crew.every((e) => e.streetHold && e.role === 'brawler'));
  const hp = p.hp;
  step(s, p, 45);
  check('an ignored offer does not swing', p.hp === hp && s.calls.active && s.calls.active.phase === 'offer');
  const here = G.blockAt(s, p.x, p.z);
  here.stash = 40;
  const styles = new Set(crew.map((e) => e.style));
  check('incursion uses rush, flank and retreat', styles.has('rush') && styles.has('flank') && styles.has('retreat'));
  G.applyAction(s, p.id, { type: 'street', choice: 'off' });
  check('walk off clears the crew and skims a held block', !s.calls.active && streetEnts(s, offer.id).length === 0 && here.stash < 40 && here.stash >= 20 && s.calls.cd > 10);
  const owner = here.owner;
  step(s, p, 30);
  check('cooldown holds and the block is not taken', !s.calls.active && here.owner === owner);
}

{
  const { s, p } = fresh();
  s.calls.n = 1;
  const offer = untilOffer(s, p);
  const crew = streetEnts(s, offer.id);
  const near = Math.min(...crew.map((e) => Math.hypot(e.x - p.x, e.z - p.z)));
  check('ambush is a choice at a distance, not a spawn hit', offer.kind === 'ambush' && offer.phase === 'offer' && crew.length === 2 && near >= G.CALLS.minDist);
  const hp = p.hp;
  step(s, p, 20);
  check('ambush waits until you face it', p.hp === hp && crew.every((e) => e.streetHold));
  G.applyAction(s, p.id, { type: 'street', choice: 'in' });
  check('step in starts the fight', s.calls.active && s.calls.active.phase === 'fight' && crew.every((e) => !e.streetHold));
}

{
  const { s, p } = fresh();
  s.calls.n = 2;
  const cash = s.crews.player.cash;
  const offer = untilOffer(s, p);
  check('deal is the third call and starts under a star of heat', offer.kind === 'deal' && streetEnts(s, offer.id).length === 2);
  G.applyAction(s, p.id, { type: 'street', choice: 'in' });
  check('breaking up the deal adds heat but not a wanted star from nothing', p.heat === 6 && G.stars(p) === 0);
  for (const e of s.ents) if (e.streetId === offer.id) e.hp = 0;
  const here = G.blockAt(s, p.x, p.z);
  step(s, p, 2);
  check('winning the deal pays and does not skim the block', s.crews.player.cash >= cash + offer.reward && !s.calls.active && !s.events.some((e) => /skim|shook/.test(e.text)) && here.owner === 'player');
}

{
  const { s, p } = fresh();
  const offer = untilOffer(s, p);
  const cash = s.crews.player.cash;
  const here = G.blockAt(s, p.x, p.z);
  here.stash = 50;
  G.applyAction(s, p.id, { type: 'street', choice: 'in' });
  for (const e of s.ents) if (e.streetId === offer.id) e.hp = 0;
  step(s, p, 2);
  check('winning an incursion pays and does not skim', s.crews.player.cash >= cash + 80 && !s.calls.active && !s.events.some((e) => /shook|skim/.test(e.text)));
}

{
  const { s, p } = fresh();
  s.mission = { title: 'Package Run', kind: 'fetch', stage: 0, timer: 90, count: 0, need: 0, reward: 1, rep: 1, target: { x: p.x + 30, z: p.z } };
  s.calls.cd = 0;
  step(s, p, 90);
  check('a mission blocks new street calls', !s.calls.active && s.mission && s.mission.title === 'Package Run');
  s.mission = null;
  const offer = untilOffer(s, p);
  s.mission = { title: 'Package Run', kind: 'fetch', stage: 0, timer: 90, count: 0, need: 0, reward: 1, rep: 1, target: { x: p.x, z: p.z } };
  step(s, p, 2);
  check('starting a mission clears a live call without failing the mission', !s.calls.active && streetEnts(s, offer.id).length === 0 && s.mission && s.mission.kind === 'fetch');
}

{
  const { s, p } = fresh();
  const offer = untilOffer(s, p);
  G.applyAction(s, p.id, { type: 'street', choice: 'in' });
  p.heat = 30;
  const car = { id: 'siren-test', type: 'police', x: p.x - 20, z: p.z, ry: 0, v: 0, steer: 0, driver: null, ai: false, hp: 150, max: 150, wrecked: true, siren: true, cops: true, cruise: 0, paint: 0 };
  s.cars.push(car);
  G.debugDown(s);
  let up = false;
  for (let i = 0; i < 90; i++) { G.step(s, DT); if (p.hp > 0 && !(p.downT > 0)) { up = true; break; } }
  check('bust respawn clears the call, the star, and the siren', up && G.stars(p) === 0 && !car.siren && !s.ents.some((e) => e.streetId === offer.id && e.hp > 0) && s.calls.grace > 0);
  s.calls.cd = 0; s.calls.ready = true; s.t = 80;
  step(s, p, 20);
  check('bust grace blocks the next call', !s.calls.active && s.calls.grace > 0);
}

{
  const { s, p } = fresh();
  s.calls.n = G.CALLS.cap; s.calls.cd = 0; s.calls.capped = false;
  step(s, p, 5);
  check('session cap stops new calls', !s.calls.active && s.calls.capped && s.events.some((e) => e.text === 'The corner stays quiet.'));
  const n = s.events.filter((e) => e.text === 'The corner stays quiet.').length;
  step(s, p, 10);
  check('the quiet line is once', s.events.filter((e) => e.text === 'The corner stays quiet.').length === n);
}

{
  const { s, p } = fresh();
  const dumped = JSON.parse(G.serialize(s));
  delete dumped.calls;
  if (dumped.ents[0]) delete dumped.ents[0].dodgeBuf;
  const s2 = G.deserialize(JSON.stringify(dumped));
  let threw = false;
  try { G.step(s2, DT); } catch (e) { threw = true; }
  check('a save without call fields still steps', !threw && G.player(s2).hp > 0);
}

{ // crew that shows up: a guard backs you up on a street call, then goes home
  const guardsNear = (s, b) => G.guardsOf(s, b);
  const setup = (extraGuards) => {
    const { s, p } = fresh(); const home = s.blocks.find((b) => b.owner === 'player');
    for (const e of s.ents) if (e.kind === 'npc' && e.crew !== 'player') e.hp = 0;
    for (let i = 0; i < extraGuards; i++) { const u = G.spawnUnit(s, 'player', 'defender', home.id); u.guard = true; }
    const offer = untilOffer(s, p); return { s, p, home, offer };
  };
  {
    const { s, p, home, offer } = setup(1);
    const before = guardsNear(s, home).length;
    check('no guard moves while the call is only an offer', before >= 2 && !s.ents.some((e) => e.backup));
    s.fx.length = 0; G.applyAction(s, p.id, { type: 'street', choice: 'in' });
    const g = s.ents.find((e) => e.backup);
    check('stepping in sends one guard to back you up', !!g && s.ents.filter((e) => e.backup).length === 1 && s.fx.some((f) => f.type === 'backup') && g.backup === offer.id);
    g.hp = g.max = 500; // the player stands still in this test, so the guard takes all three alone
    const d0 = Math.hypot(g.x - offer.x, g.z - offer.z);
    const foes = () => streetEnts(s, offer.id), hp0 = foes().reduce((a, e) => a + e.hp, 0);
    step(s, p, Math.round(6 / DT));
    const near = Math.min(...foes().map((e) => Math.hypot(e.x - g.x, e.z - g.z)));
    check(`the guard runs to the fight (${d0.toFixed(0)} m away at the start, ${near.toFixed(1)} m from a foe after 6 s)`, g.hp > 0 ? near < 4 : true);
    step(s, p, Math.round(8 / DT));
    check('and hurts the crew you are fighting', foes().reduce((a, e) => a + e.hp, 0) < hp0);
    check('the guard still counts as that block\'s guard', guardsNear(s, home).includes(g) || g.hp <= 0);
    for (const e of foes()) e.hp = 0; step(s, p, 3);
    check('the call is won and the guard is released', !s.calls.active && !g.backup);
    const c = G.blockCenter(home); step(s, p, Math.round(25 / DT));
    check(`the guard walks back to the block (${Math.hypot(g.x - c.x, g.z - c.z).toFixed(0)} m from its center)`, g.hp <= 0 || Math.hypot(g.x - c.x, g.z - c.z) < G.BLOCK / 2 + 6);
  }
  {
    // a lone guard on a far block stays put: helping must never leave a block empty
    const { s, p, home } = setup(0);
    const far = s.blocks.find((b) => b.owner !== 'player' && Math.hypot(G.blockCenter(b).x - p.x, G.blockCenter(b).z - p.z) > 60 && Math.hypot(G.blockCenter(b).x - p.x, G.blockCenter(b).z - p.z) < 75);
    let kept = 0; for (const e of s.ents) if (e.kind === 'npc' && e.crew === 'player' && e.role === 'defender' && e.hp > 0) { if (kept++) { e.hp = 0; continue; } e.target = e.home = far.id; const c = G.blockCenter(far); e.x = c.x; e.z = c.z; }
    far.owner = 'player';
    G.applyAction(s, p.id, { type: 'street', choice: 'in' });
    check('a block\'s only guard does not leave it for a call somewhere else', !s.ents.some((e) => e.backup) && G.guardsOf(s, far).length === 1);
  }
}
if (fails.length) { console.log('FAILED ' + fails.length); process.exit(1); }
console.log('COMBAT TESTS PASSED');
