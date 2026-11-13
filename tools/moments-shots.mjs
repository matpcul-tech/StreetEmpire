// Moments and clips check (v0.14): node tools/moments-shots.mjs <url> <dir>
// Fires the big moments straight at the director on desktop and on a phone, shoots each mid-move with its card,
// cuts a clip and checks a file came out of the recorder. Prints MOMENTS CHECK PASSED or FAILED.
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
const [url, dir] = process.argv.slice(2); fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
let failed = false; const fail = (m) => { console.log('FAIL', m); failed = true; };
for (const [name, opts] of [['desktop', { viewport: { width: 1280, height: 720 } }], ['phone', { ...devices['iPhone 13 landscape'] }]]) {
  const page = await (await browser.newContext(opts)).newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await page.goto(url + '?nointro&new&pin&clips&stream', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => !document.getElementById('start').disabled, null, { timeout: 150000 });
  if (name === 'phone') await page.tap('#start'); else await page.click('#start');
  await page.waitForTimeout(3000);
  const info = await page.evaluate(() => ({ supported: window.__dbg.clips.supported, on: window.__dbg.clips.on, btn: getComputedStyle(document.getElementById('bClip')).display }));
  console.log(name, 'clips', JSON.stringify(info));
  if (!info.supported || !info.on) fail(`${name}: clips not recording`);
  if (name === 'phone' && info.btn === 'none') fail('phone: CLIP button hidden');
  // each moment: fire it, wait into the move, shoot
  const shots = [
    ['boom', () => { const s = window.__game.state, p = s.ents.find((e) => e.kind === 'player'); window.__dbg.moments.fx({ type: 'boom', x: p.x + 6, z: p.z + 4, car: 'none' }, s); }],
    ['streak', () => { const s = window.__game.state; window.__dbg.moments.fx({ type: 'streak', n: 5 }, s); }],
    ['heli', () => { const s = window.__game.state, p = s.ents.find((e) => e.kind === 'player'); s.heli = { x: p.x + 20, z: p.z + 10, on: true, fuel: 60 }; window.__dbg.moments.fx({ type: 'heli', state: 'in' }, s); }],
    ['stars', () => { const s = window.__game.state, p = s.ents.find((e) => e.kind === 'player'); s.heli = null; window.__dbg.moments.wanted(5, s, p); }],
    ['capture', () => { const s = window.__game.state; window.__dbg.moments.fx({ type: 'capture', crew: 'player', from: 'reds', hustle: 'Corner Store', block: 0 }, s); }],
  ];
  // headless frames are slow and the director runs on frame time, so each shot waits a number of frames, not seconds
  const frames = (n) => page.evaluate((n) => new Promise((res) => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
  for (const [kind, fn] of shots) {
    await page.evaluate(() => window.__dbg.moments.end());
    await page.evaluate(fn); await frames(12);
    const st = await page.evaluate(() => ({ active: window.__dbg.moments.active, scale: window.__dbg.moments.timeScale }));
    console.log(name, kind, JSON.stringify(st));
    await page.screenshot({ path: `${dir}/${name}-${kind}.png` });
  }
  // cut a clip and look at what came out
  await page.evaluate(() => window.__dbg.clips.cut('Check'));
  await page.waitForFunction(() => window.__dbg.clips.list.length > 0, null, { timeout: 15000 }).catch(() => {});
  const clip = await page.evaluate(() => { const c = window.__dbg.clips.list[0]; return c ? { title: c.title, size: c.blob.size, type: c.blob.type, dur: c.dur, name: c.name } : null; });
  console.log(name, 'clip', JSON.stringify(clip));
  if (!clip || clip.size < 50000) fail(`${name}: no clip file`);
  if (errs.length) fail(`${name}: errors ${JSON.stringify(errs)}`);
  await page.context().close();
}
console.log(failed ? 'MOMENTS CHECK FAILED' : 'MOMENTS CHECK PASSED');
process.exitCode = failed ? 1 : 0;
await browser.close();
