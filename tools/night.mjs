// Night review shots: node tools/night.mjs <url> <dir> <prefix>
// Captures on foot, close up and driving at 22:35 for desktop and phone.
import { chromium, devices } from 'playwright';
const [url, dir, pre] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [name, opts] of [['desktop', { viewport: { width: 1280, height: 720 } }], ['phone', devices['iPhone 13']]]) {
  const page = await (await browser.newContext(opts)).newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => !document.getElementById('start').disabled, null, { timeout: 150000 });
  if (name === 'phone') await page.tap('#start'); else await page.click('#start');
  await page.waitForTimeout(1500);
  await page.evaluate(() => { window.__game.state.t = 95; });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${dir}/${pre}-${name}-foot.png` });
  await page.evaluate(() => {
    const s = window.__game.state, pl = s.ents.find((e) => e.kind === 'player'); pl.ry = 0;
    const crew = ['reds', 'blues', 'golds'].map((c) => s.ents.find((e) => e.kind === 'npc' && e.crew === c && e.hp > 0)).filter(Boolean);
    window.__hold = setInterval(() => { s.t = 95; crew.forEach((e, i) => { e.x = pl.x + 1.3 + i * 1.3; e.z = pl.z; e.ry = 0; e.stun = 99; e.moving = 0; }); }, 16);
    window.__camOv = { x: pl.x + 1.9, y: 1.35, z: pl.z + 6, lx: pl.x + 1.9, ly: 0.95, lz: pl.z };
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${dir}/${pre}-${name}-closeup.png` });
  await page.evaluate(() => { clearInterval(window.__hold); window.__camOv = null; const s = window.__game.state, p = s.ents.find((e) => e.kind === 'player'), c = s.cars.find((c) => !c.driver && !c.wrecked && c.type !== 'police'); p.x = c.x + 2; p.z = c.z; window.__game.send({ type: 'car' }); });
  await page.waitForTimeout(400);
  await page.evaluate(() => { window.__drv = setInterval(() => { const s = window.__game.state; s.t = 95; const c = s.cars.find((c) => c.id === s.ents.find((e) => e.kind === 'player').car); if (c) c.v = Math.max(c.v, 12); }, 50); });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${dir}/${pre}-${name}-driving.png` });
  console.log(name, JSON.stringify(await page.evaluate(() => ({ clock: document.getElementById('clock').innerText, perf: window.__perf() }))), 'errors:', errs);
}
await browser.close();
