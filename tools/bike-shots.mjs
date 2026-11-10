// Bike review shots: node tools/bike-shots.mjs <url> <dir>
// Parked, mounted and leaning in a turn, by day and at night, on desktop and on a phone.
import { chromium, devices } from 'playwright';
const [url, dir] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
for (const [name, opts] of [['desktop', { viewport: { width: 1280, height: 720 } }], ['phone', devices['iPhone 13']]].filter(([n]) => !process.env.ONLY || process.env.ONLY === n)) {
  const page = await (await browser.newContext(opts)).newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' || /kit car/.test(m.text())) errors.push(`${name} console: ${m.text()}`); });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => !document.getElementById('start').disabled, null, { timeout: 150000 });
  await page.evaluate(() => document.getElementById('start').click()); // a software renderer can be too slow for a timed click
  await page.waitForFunction(() => window.__dbg && window.__dbg.carViz.size > 0 && window.__dbg.charViz.size > 0, null, { timeout: 400000 }); // the world is drawn
  await page.waitForTimeout(2500);
  // frames can take a second each on a software renderer, so every shot waits for its own condition instead of a fixed time
  const shot = async (tag, setup, ready) => { await page.evaluate(setup); if (ready) await page.waitForFunction(ready, null, { timeout: 240000, polling: 500 }); await page.waitForTimeout(2500); await page.screenshot({ path: `${dir}/bike-${name}-${tag}.png`, timeout: 180000 }); };
  const rider = () => { const g = window.__dbg.carViz.get(window.__bike); return !!(g && g.userData.driver); };
  // parked, from the side
  await shot('parked', () => {
    const s = window.__game.state, pl = s.ents.find((e) => e.kind === 'player'), b = s.cars.find((c) => c.type === 'dirtbike');
    window.__bike = b.id; s.t = 424;
    clearInterval(window.__hold); window.__hold = setInterval(() => { s.t = 424; pl.x = b.x - 2.2; pl.z = b.z - 0.6; pl.ry = 1.2; pl.heat = 0; }, 16);
    window.__camOv = { x: b.x - 3.4, y: 1.5, z: b.z + 1.6, lx: b.x, ly: 0.75, lz: b.z };
  });
  // get on, sit still: side, rear three quarter
  await shot('mounted', () => {
    const g = window.__game, s = g.state, b = s.cars.find((c) => c.id === window.__bike);
    clearInterval(window.__hold); g.send({ type: 'car' });
    window.__hold = setInterval(() => { s.t = 424; b.v = 0; window.__camOv = { x: b.x - 3.2, y: 1.3, z: b.z + 0.2, lx: b.x, ly: 0.95, lz: b.z }; }, 16);
  }, rider);
  await shot('mounted-rear', () => {
    const s = window.__game.state, b = s.cars.find((c) => c.id === window.__bike);
    clearInterval(window.__hold); window.__hold = setInterval(() => { s.t = 424; b.v = 0; window.__camOv = { x: b.x + 1.6, y: 1.9, z: b.z - 3.2, lx: b.x, ly: 0.95, lz: b.z }; }, 16);
  });
  // held in a turn at speed, seen from the front: bike and rider lean together
  await shot('lean', () => {
    const g = window.__game, s = g.state, b = s.cars.find((c) => c.id === window.__bike), x0 = b.x, z0 = b.z;
    clearInterval(window.__hold);
    window.__hold = setInterval(() => { s.t = 424; b.x = x0; b.z = z0; b.ry = 0; b.mh = 0; b.v = 15; g.input(1, 0.3, false, 0.016); b.x = x0; b.z = z0; b.ry = 0; b.mh = 0; window.__camOv = { x: x0 + 0.3, y: 1.2, z: z0 + 4.4, lx: x0, ly: 0.9, lz: z0 }; }, 4);
  }, () => Math.abs(window.__dbg.carViz.get(window.__bike).userData.model.rotation.z) > 0.15);
  // the game's own chase camera, by day and at night
  await shot('riding', () => {
    const g = window.__game, s = g.state;
    clearInterval(window.__hold); window.__camOv = null;
    window.__hold = setInterval(() => { s.t = 424; g.input(0, 1, false, 0.016); }, 16);
  }, () => window.__game.state.cars.find((c) => c.id === window.__bike).v > 12);
  await shot('night', () => {
    const g = window.__game, s = g.state, b = s.cars.find((c) => c.id === window.__bike);
    clearInterval(window.__hold);
    window.__hold = setInterval(() => { s.t = 95; b.v = Math.min(b.v, 6); g.input(0, 0.3, false, 0.016); }, 16);
  });
  // get off again
  await shot('off', () => { const g = window.__game; clearInterval(window.__hold); window.__hold = setInterval(() => { g.state.t = 424; }, 16); g.state.cars.find((c) => c.id === window.__bike).v = 0; g.send({ type: 'car' }); },
    () => !window.__game.state.ents.find((e) => e.kind === 'player').car && !window.__dbg.carViz.get(window.__bike).userData.driver);
  console.log(name, JSON.stringify(await page.evaluate(() => ({ perf: window.__perf(), bike: (({ x, z, v, hp, type }) => ({ x, z, v, hp, type }))(window.__game.state.cars.find((c) => c.id === window.__bike)), inCar: window.__game.state.ents.find((e) => e.kind === 'player').car }))));
}
await browser.close();
if (errors.length) { console.log('ERRORS\n' + errors.join('\n')); process.exitCode = 1; }
