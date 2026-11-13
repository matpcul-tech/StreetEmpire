// Weight check (v0.15): node tools/weight-shots.mjs <url> <dir>
// A pedestrian hit by your car goes up and over (shot mid-air), a crew member dropped by a punch hops and
// leans, and heat: a crew fight with no officer in sight adds none, the same fight with one watching does.
import { chromium } from 'playwright';
import fs from 'node:fs';
const [url, dir] = process.argv.slice(2); fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
let failed = false; const fail = (m) => { console.log('FAIL', m); failed = true; };
await page.goto(url + '?nointro&new&pin', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => !document.getElementById('start').disabled, null, { timeout: 150000 });
await page.click('#start'); await page.waitForTimeout(2500);
const frames = (n) => page.evaluate((n) => new Promise((res) => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
// 1. heat: punch out a rival with no officer within sight, then with one standing by
const heat = await page.evaluate(() => {
  const s = window.__game.state, p = s.ents.find((e) => e.kind === 'player'), g = window.__game;
  for (const e of s.ents) if (e.kind === 'cop') e.remove = true;
  for (const c of s.cars) if (c.cops) c.remove = true;
  const foe = s.ents.find((e) => e.kind === 'npc' && e.crew !== 'player' && e.hp > 0);
  const place = () => { foe.x = p.x + Math.sin(p.ry) * 1.2; foe.z = p.z + Math.cos(p.ry) * 1.2; foe.hp = 1; foe.stun = 0; };
  p.heat = 0; p.cd = 0; place(); g.send({ type: 'attack', target: foe.id }); g.tick(0.05); const quiet = p.heat;
  foe.hp = 1; p.cd = 0; p.heat = 0; g.tick(1);
  s.ents.push({ id: 99901, kind: 'cop', crew: 'cops', hp: 100, x: p.x + 8, z: p.z, ry: 0, weapon: 'fists', moving: 0 });
  place(); g.send({ type: 'attack', target: foe.id }); g.tick(0.05); const seen = p.heat;
  s.ents = s.ents.filter((e) => e.id !== 99901);
  return { quiet, seen };
});
console.log('heat', JSON.stringify(heat));
if (heat.quiet !== 0) fail('a crew fight with no officer in sight added heat');
if (!(heat.seen > 0)) fail('a crew fight in front of an officer added no heat');
// 2. a punch knockout, shot a few frames in (the streak from the heat test is cleared first so the director stays out of the shot)
await page.evaluate(() => { const s = window.__game.state, p = s.ents.find((e) => e.kind === 'player'), g = window.__game; p.heat = 0; s.koStreak = 0; s.koT = -99; window.__dbg.moments.end(); const foe = s.ents.find((e) => e.kind === 'npc' && e.crew !== 'player' && e.hp > 0); foe.x = p.x + Math.sin(p.ry) * 1.3; foe.z = p.z + Math.cos(p.ry) * 1.3; foe.hp = 1; foe.stun = 0; p.cd = 0; g.send({ type: 'attack', target: foe.id }); });
await frames(4);
await page.screenshot({ path: `${dir}/punch-ko.png` });
// 3. a pedestrian hit by your car at speed: the body in the air
await page.evaluate(() => { const s = window.__game.state, p = s.ents.find((e) => e.kind === 'player'), g = window.__game; const c = s.cars.find((c) => !c.driver && !c.wrecked && c.type !== 'bike'); p.x = c.x + 2; p.z = c.z; g.send({ type: 'car' }); window.__c = c.id; });
await page.waitForTimeout(1500);
await page.evaluate(() => { const s = window.__game.state, c = s.cars.find((c) => c.id === window.__c), ped = s.ents.find((e) => e.kind === 'ped' && e.hp > 0); ped.x = c.x + Math.sin(c.ry) * 5; ped.z = c.z + Math.cos(c.ry) * 5; ped.hp = 30; c.v = 24; window.__ped = ped.id; s.koStreak = 0; s.koT = -99; window.__dbg.moments.end();
  // a side view of the impact spot, so the flight reads
  const hx = ped.x, hz = ped.z, sx = Math.cos(c.ry), sz = -Math.sin(c.ry); window.__camOv = { x: hx + sx * 7 + Math.sin(c.ry) * 2, y: 1.6, z: hz + sz * 7 + Math.cos(c.ry) * 2, lx: hx + Math.sin(c.ry) * 2, ly: 1.2, lz: hz + Math.cos(c.ry) * 2 }; });
await page.waitForFunction(() => { const s = window.__game.state; const e = s.ents.find((e) => e.id === window.__ped); return e && e.hp <= 0; }, null, { timeout: 30000 }).catch(() => fail('the car never knocked the pedestrian down'));
await frames(5);
const air = await page.evaluate(() => { const g = window.__dbg.charViz.get(window.__ped); return g ? { y: +g.position.y.toFixed(2), rx: +g.rotation.x.toFixed(2), tumble: !!g.userData.tumble } : null; });
console.log('hit by car', JSON.stringify(air));
await page.screenshot({ path: `${dir}/car-hit.png` });
await page.evaluate(() => { window.__camOv = null; });
if (!air || !(air.y > 0.5)) fail('the pedestrian did not go into the air');
if (errs.length) fail('errors ' + JSON.stringify(errs));
console.log(failed ? 'WEIGHT CHECK FAILED' : 'WEIGHT CHECK PASSED');
process.exitCode = failed ? 1 : 0;
await browser.close();
