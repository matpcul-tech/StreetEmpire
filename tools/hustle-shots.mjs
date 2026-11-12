// Block scene and dice review shots: node tools/hustle-shots.mjs <url> <dir>
// The dice game on your first block (wide, close, panel open, a point on), then a card table and a boombox block.
import { chromium, devices } from 'playwright';
const [url, dir] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
for (const [name, opts] of [['desktop', { viewport: { width: 1280, height: 720 } }], ['phone', { ...devices['iPhone 13 landscape'] }]].filter(([n]) => !process.env.ONLY || process.env.ONLY === n)) {
  const page = await (await browser.newContext(opts)).newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name} console: ${m.text()}`); });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => !document.getElementById('start').disabled, null, { timeout: 150000 });
  await page.evaluate(() => document.getElementById('start').click()); // a software renderer can be too slow for a timed click
  await page.waitForFunction(() => window.__dbg && window.__dbg.carViz.size > 0 && window.__dbg.charViz.size > 0, null, { timeout: 400000 });
  const shot = async (tag, setup, arg) => { await page.evaluate(setup, arg); await page.waitForTimeout(4000); await page.screenshot({ path: `${dir}/hustle-${name}-${tag}.png`, timeout: 180000 }); };
  // stand at a block's scene with its people in place: the simulation is run ahead off screen, then held at midday
  const goTo = async (kind, own) => page.evaluate(async ({ kind, own }) => {
    const g = window.__game, s = g.state, p = s.ents.find((e) => e.kind === 'player');
    const K = ['dice', 'cards', 'stoop'], b = s.blocks.filter((b) => K[b.id % 3] === kind && (own ? b.owner === 'player' : b.owner !== 'player' && b.owner !== 'neutral')).sort((a, c) => a.id - c.id)[0];
    const c = window.__dbg.blockCenter(b), q = { x: c.x - 9 + (b.id % 4) * 6, z: c.z + 21 }; // sceneSpot in state.js
    s.opening = { done: true, beat: 'done', ids: [] }; s.policeT = 1e9; s.crews.player.cash = 600;
    if (own) for (let i = 0; i < 3; i++) g.send({ type: 'recruit' });
    clearInterval(window.__hold);
    const pin = () => { s.t = 424; p.hp = p.max; p.heat = 0; p.x = q.x + (own ? 0.3 : 30); p.z = q.z + (own ? 1.9 : 30); p.ry = Math.PI; };
    for (let i = 0; i < 1500; i++) { pin(); g.tick(1 / 30); }
    window.__hold = setInterval(pin, 16); window.__q = q;
    return { block: b.id, hustle: b.hustle, owner: b.owner, hang: s.ents.filter((e) => e.pose === 'hang' && e.target === b.id).length };
  }, { kind, own });
  const cam = (dx, dy, dz, ly = 0.9) => page.evaluate(([dx, dy, dz, ly]) => { const q = window.__q; window.__camOv = { x: q.x + dx, y: dy, z: q.z + dz, lx: q.x, ly, lz: q.z - 0.2 }; }, [dx, dy, dz, ly]);
  console.log(name, 'dice', JSON.stringify(await goTo('dice', true)));
  await cam(3.5, 2.6, 7.5); await shot('dice-wide', () => {});
  await cam(1.6, 1.5, 3.4, 0.6); await shot('dice-close', () => {});
  await page.evaluate(() => { window.__camOv = null; });
  await page.keyboard.press('e'); // the context key: opens the dice panel when you stand at the game
  await shot('dice-panel', () => {});
  // put money down until a point is on, so the panel shows the second half of a game
  const point = await page.evaluate(async () => { const g = window.__game, p = g.state.ents.find((e) => e.kind === 'player'); for (let i = 0; i < 40 && !p.dice; i++) { g.state.crews.player.cash = 600; g.state.blocks[0].pot = 70; document.querySelector('#diceBets button').click(); await new Promise((r) => setTimeout(r, 30)); } return p.dice; });
  await shot('dice-point', () => {});
  console.log(name, 'point', JSON.stringify(point), 'label', await page.evaluate(() => [document.getElementById('bCtx').textContent, document.getElementById('diceMsg').textContent, document.getElementById('dicePoint').textContent]));
  await page.evaluate(() => document.getElementById('diceClose').click());
  for (const kind of ['cards', 'stoop']) { console.log(name, kind, JSON.stringify(await goTo(kind, false))); await cam(3.0, 2.2, 6.0); await shot(kind, () => {}); }
  console.log(name, 'perf', JSON.stringify(await page.evaluate(() => window.__perf())));
}
await browser.close();
if (errors.length) { console.log('ERRORS\n' + errors.join('\n')); process.exitCode = 1; }
