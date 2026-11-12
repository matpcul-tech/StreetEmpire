// Block scenes and street dice in the state layer, no browser. Run: node tools/hustle-test.mjs
import * as G from '../src/state.js';

const DT = 1 / 30, fails = [];
const check = (name, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) fails.push(name); };
const world = (seed = 1) => { const s = G.createState(seed, { traffic: 0, peds: 0 }); s.policeT = 1e9; s.opening = { done: true, beat: 'done', ids: [] }; return { s, p: G.player(s) }; };
const run = (s, sec) => { for (let i = 0; i < sec / DT; i++) G.step(s, DT); };
const hang = (s, b) => s.ents.filter((e) => e.pose === 'hang' && e.target === b.id && e.hp > 0);
const stand = (s, p, b, dx = 0, dz = 1.6) => { const q = G.sceneSpot(b); p.x = q.x + dx; p.z = q.z + dz; };
const cash = (s) => s.crews.player.cash;

{ // the scenes
  const { s, p } = world(), home = s.blocks.find((b) => b.owner === 'player');
  check('your first block runs a dice game', G.sceneOf(home) === 'dice');
  check('all three kinds of scene are on the map', G.SCENES.every((k) => s.blocks.some((b) => G.sceneOf(b) === k)));
  check('no scene spot is inside a building, on any block', s.blocks.every((b) => { const q = G.sceneSpot(b); return !G.insideBuilding(q.x, q.z, 0.6); }));
  const tight = s.blocks.filter((b) => { const q = G.sceneSpot(b); return G.SCENE_SLOTS[G.sceneOf(b)].some(([dx, dz]) => G.insideBuilding(q.x + dx, q.z + dz, 0.55)); });
  check(`every standing spot at every scene has room for a person (${tight.length} blocks too tight)`, tight.length === 0);
  check('every scene is on its own block\'s south sidewalk', s.blocks.every((b) => { const q = G.sceneSpot(b), c = G.blockCenter(b); return Math.abs(q.x - c.x) <= 16 && Math.abs(q.z - (c.z + G.BLOCK / 2 + 1)) < 0.01; }));
  p.x += 60; // out of the way
  while (G.guardsOf(s, home).length < 4) { s.crews.player.cash += 100; G.applyAction(s, p.id, { type: 'recruit' }); if (s.crews.player.cash > 5000) break; }
  run(s, 40);
  const at = hang(s, home), q = G.sceneSpot(home);
  check(`the block's people gather at the game (${at.length} of ${G.guardsOf(s, home).length} guards)`, at.length >= 1 && at.length <= 3);
  check('they stand around it, not on top of each other', at.every((e) => Math.hypot(e.x - q.x, e.z - q.z) < 1.8) && at.every((e) => at.every((o) => o === e || Math.hypot(o.x - e.x, o.z - e.z) > 0.8)));
  check('and face it', at.every((e) => { const want = Math.atan2(q.x - e.x, q.z - e.z); return Math.abs(Math.atan2(Math.sin(want - e.ry), Math.cos(want - e.ry))) < 0.3; }));
  check('somebody always stays on the beat', G.guardsOf(s, home).length < 2 || G.guardsOf(s, home).some((e) => e.pose !== 'hang'));
  const rival = s.blocks.find((b) => b.owner !== 'player' && b.owner !== 'neutral');
  const far = world(); const fp = far.p; const rb = far.s.blocks.find((b) => b.id === rival.id); run(far.s, 40);
  check('rival blocks have their scene too', hang(far.s, rb).length >= 1);
  // nobody is left walking into a wall beside the scene: everyone posted there has arrived and stands still
  let stuck = 0; for (const b of far.s.blocks) { const q = G.sceneSpot(b); for (const e of far.s.ents) if (e.kind === 'npc' && e.target === b.id && e.hp > 0 && e.role === 'defender' && e.pose !== 'hang' && e.moving > 0 && Math.hypot(e.x - q.x, e.z - q.z) < 4) stuck++; }
  check(`after 40 s nobody is still shuffling toward a spot they cannot reach (${stuck})`, stuck === 0);
}
{ // getting in a game
  const { s, p } = world(), home = s.blocks.find((b) => b.owner === 'player');
  p.x += 60; run(s, 40);
  stand(s, p, home, 0, 12); check('no game from across the street', !G.diceAt(s, p));
  stand(s, p, home); check('standing at the game, you can get in', G.diceAt(s, p) === home);
  const other = s.blocks.find((b) => b.owner !== 'player' && G.sceneOf(b) === 'dice'); stand(s, p, other);
  check('not on a block you do not hold', !G.diceAt(s, p));
  stand(s, p, home);
  s.crews.player.cash = 3; const c0 = cash(s); G.applyAction(s, p.id, { type: 'dice', bet: 5 });
  check('no bet without the money', cash(s) === c0 && !p.dice);
  s.crews.player.cash = 500; G.applyAction(s, p.id, { type: 'dice', bet: 7 });
  check('only the posted bets', cash(s) === 500 && !p.dice);
  home.pot = 8; G.applyAction(s, p.id, { type: 'dice', bet: 10 });
  check('no bet the pot cannot cover', cash(s) === 500 && !p.dice);
}
{ // the rules, over many games
  const { s, p } = world(7), home = s.blocks.find((b) => b.owner === 'player');
  p.x += 60; run(s, 40); stand(s, p, home);
  let wins = 0, losses = 0, games = 0, bad = 0, maxRolls = 0, naturals = 0, craps = 0, points = 0;
  for (let k = 0; k < 4000; k++) {
    s.crews.player.cash = 1000; home.pot = G.potCap(home); s.fx.length = 0;
    const pot0 = home.pot; G.applyAction(s, p.id, { type: 'dice', bet: 10 });
    let first = s.fx.find((f) => f.type === 'dice'), last = first, n = 1;
    if (!first) { bad++; continue; }
    if (first.result === 'win' && !(first.sum === 7 || first.sum === 11)) bad++;
    if (first.result === 'lose' && ![2, 3, 12].includes(first.sum)) bad++;
    if (first.result === 'point' && [2, 3, 7, 11, 12].includes(first.sum)) bad++;
    if (first.result === 'win') naturals++; else if (first.result === 'lose') craps++; else points++;
    while (p.dice && n < 200) { s.fx.length = 0; G.applyAction(s, p.id, { type: 'dice' }); last = s.fx.find((f) => f.type === 'dice'); n++;
      if (last.result === 'win' && last.sum !== first.sum) bad++;
      if (last.result === 'lose' && last.sum !== 7) bad++;
      if (last.result === 'roll' && (last.sum === 7 || last.sum === first.sum)) bad++; }
    maxRolls = Math.max(maxRolls, n); games++;
    if (last.result === 'win') { wins++; if (cash(s) !== 1010 || Math.abs(home.pot - (pot0 - 10)) > 1e-6) bad++; }
    else { losses++; if (cash(s) !== 990 || Math.abs(home.pot - (pot0 + 10)) > 1e-6) bad++; }
  }
  const rate = wins / games;
  check(`every roll follows the rules and pays right (${games} games, longest ${maxRolls} rolls)`, bad === 0 && games === 4000);
  check(`first roll: 7 or 11 wins ${(naturals / games * 100).toFixed(1)}%, 2, 3 or 12 loses ${(craps / games * 100).toFixed(1)}% (22.2 and 11.1 expected)`, Math.abs(naturals / games - 0.2222) < 0.025 && Math.abs(craps / games - 0.1111) < 0.02);
  check(`the shooter wins ${(rate * 100).toFixed(1)}% (49.3 expected): a fair game, a hair to the corner`, Math.abs(rate - 0.4929) < 0.03);
}
{ // the pot, and walking off
  const { s, p } = world(3), home = s.blocks.find((b) => b.owner === 'player');
  p.x += 60; run(s, 40); stand(s, p, home);
  const cap = G.potCap(home); home.pot = cap - 30; run(s, 30); stand(s, p, home);
  check(`the pot refills slowly, up to its cap ($${cap})`, home.pot > cap - 21 && home.pot <= cap);
  home.built = true; check('a built-up block has a bigger game', G.potCap(home) === cap * 2); home.built = false;
  // find a game that goes to a point, then walk away from it
  let got = false;
  for (let k = 0; k < 200 && !got; k++) { s.crews.player.cash = 500; home.pot = cap; G.applyAction(s, p.id, { type: 'dice', bet: 25 }); if (p.dice) got = true; }
  const c1 = cash(s), pot1 = home.pot; p.x += 30; s.fx.length = 0; G.step(s, DT);
  check('walking off with a point on forfeits the bet to the pot', got && !p.dice && cash(s) < c1 + 1 && home.pot >= pot1 + 25 - 0.01 && s.fx.some((f) => f.type === 'dice' && f.result === 'forfeit'));
  const saved = JSON.parse(JSON.stringify(s)); check('a game in progress survives a save', G.migrate(saved).blocks[home.id].pot === s.blocks[home.id].pot);
}
console.log(fails.length ? `\n${fails.length} FAILED` : '\nHUSTLE TESTS PASSED');
process.exit(fails.length ? 1 : 0);
