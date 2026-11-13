// v0.13 review shots: node tools/v013-shots.mjs <url> <dir>
// desktop and phone: day on foot (flare), driving fast (speed blur, banking), rain, night rain, stream HUD with feed lines
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
const [url, dir] = process.argv.slice(2); fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const sets = [['desktop', { viewport: { width: 1280, height: 720 } }], ['phone', { ...devices['iPhone 13 landscape'] }], ['portrait', { ...devices['iPhone 13'] }]];
for (const [name, opts] of sets) {
  for (const [tag, q] of name === 'portrait' ? [['dry', '?nointro&stream&pin&new']] : [['dry', '?nointro&stream&pin&new'], ['rain', '?nointro&stream&rain&new']]) {
    const page = await (await browser.newContext(opts)).newPage();
    const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
    await page.goto(url + q, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => !document.getElementById('start').disabled, null, { timeout: 150000 });
    if (name === 'phone') await page.tap('#start'); else await page.click('#start');
    await page.waitForTimeout(2500);
    // golden hour on foot, looking toward the sun
    await page.evaluate(() => { const s = window.__game.state; s.t = 424 - 80; });
    await page.waitForTimeout(2500);
    await page.evaluate(() => { const s = window.__game.state, p = s.ents.find((e) => e.kind === 'player'); window.__dbg.stream.push('Red Kings took Corner Store from Blue Hand', 'reds'); window.__dbg.stream.push('You took Laundromat from Gold Line', 'player', true); window.__dbg.stream.push('3 knockouts in a row', 'player'); });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${dir}/${name}-${tag}-foot.png` });
    // golden hour, camera turned into the low sun: the flare
    await page.evaluate(() => { const s = window.__game.state, p = s.ents.find((e) => e.kind === 'player'); s.t = 474; const h = 17.5, ang = ((h - 6) / 24) * Math.PI * 2, d = [Math.cos(ang) * 0.8, Math.sin(ang), 0.45], l = Math.hypot(...d); window.__camOv = { x: p.x - d[0] / l * 4, y: 1.6, z: p.z - d[2] / l * 4, lx: p.x + d[0] / l * 30, ly: 1.6 + d[1] / l * 30, lz: p.z + d[2] / l * 30 }; });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${dir}/${name}-${tag}-sun.png` });
    await page.evaluate(() => { window.__camOv = null; });
    // in a car, fast, turning
    await page.evaluate(() => { const s = window.__game.state, p = s.ents.find((e) => e.kind === 'player'), c = s.cars.find((c) => !c.driver && !c.wrecked && c.type !== 'bike'); p.x = c.x + 2; p.z = c.z; window.__game.send({ type: 'car' }); });
    await page.waitForTimeout(1800);
    // the entry moment takes a second; then full speed into a right turn (headless frames are slow, so the speed is set, not driven to)
    await page.waitForTimeout(1500);
    const fast = () => page.evaluate(() => { const s = window.__game.state, c = s.cars.find((c) => c.id === s.ents.find((e) => e.kind === 'player').car); if (c) c.v = 30; });
    if (name === 'desktop') { await page.keyboard.down('KeyW'); await page.keyboard.down('KeyD'); } else { await page.locator('#bGas').dispatchEvent('pointerdown'); await page.locator('#bRight').dispatchEvent('pointerdown'); }
    for (let i = 0; i < 6; i++) { await fast(); await page.waitForTimeout(250); }
    await page.screenshot({ path: `${dir}/${name}-${tag}-drive.png` });
    if (name === 'desktop') { await page.keyboard.up('KeyW'); await page.keyboard.up('KeyD'); } else { await page.locator('#bGas').dispatchEvent('pointerup'); await page.locator('#bRight').dispatchEvent('pointerup'); }
    // night
    await page.evaluate(() => { window.__game.state.t = 95; });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${dir}/${name}-${tag}-night.png` });
    const perf = await page.evaluate(() => window.__perf());
    console.log(name, tag, 'errors', JSON.stringify(errs), 'perf', JSON.stringify(perf));
    await page.context().close();
  }
}
await browser.close();
