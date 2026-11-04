// Car art review: node tools/carshots.mjs <url> <dir> <prefix>
// Lines up one car of each type and shoots them by day and night, desktop and phone.
import { chromium, devices } from 'playwright';
const [url, dir, pre] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [name, opts] of [['desktop', { viewport: { width: 1280, height: 720 } }], ['phone', devices['iPhone 13']]]) {
  const page = await (await browser.newContext(opts)).newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => !document.getElementById('start').disabled, null, { timeout: 150000 });
  if (name === 'phone') await page.tap('#start'); else await page.click('#start');
  await page.waitForTimeout(1500);
  for (const [tod, t] of [['warm', 95], ['night', 95], ['day', 424]]) {
    await page.evaluate(({ t, phone }) => {
      clearInterval(window.__hold);
      const s = window.__game.state, pl = s.ents.find((e) => e.kind === 'player');
      const types = ['sedan', 'muscle', 'suv', 'van', 'taxi', 'police', 'lowrider'], pick = [];
      for (const ty of types) { const c = s.cars.find((c) => c.type === ty && !c.wrecked && !pick.includes(c)); if (c) pick.push(c); }
      const n = phone ? 3 : pick.length, sp = 3.0;
      const cars = phone ? pick.slice(0, 3) : pick;
      const x0 = pl.x - ((n - 1) * sp) / 2, z0 = pl.z - 6;
      window.__hold = setInterval(() => { s.t = t; cars.forEach((c, i) => { c.x = x0 + i * sp; c.z = z0; c.ry = 0.5; c.v = 0; c.ai = true; c.driver = null; }); pl.x = x0; pl.z = z0 + 9; }, 16);
      window.__camOv = phone ? { x: x0 + sp, y: 3.2, z: z0 + 9, lx: x0 + sp, ly: 0.7, lz: z0 } : { x: x0 + ((n - 1) * sp) / 2, y: 4.5, z: z0 + 11, lx: x0 + ((n - 1) * sp) / 2, ly: 0.6, lz: z0 };
    }, { t, phone: name === 'phone' });
    await page.waitForTimeout(3000);
    if (tod !== 'warm') await page.screenshot({ path: `${dir}/${pre}-${name}-${tod}.png` });
  }
}
await browser.close();
