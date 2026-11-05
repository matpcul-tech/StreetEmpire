// Car art review with quality levels: node tools/car-qa.mjs <url> <dir>
// env QUALS (default ",low,potato"), DEVS (default "desktop,phone").
// Per time of day: a lineup of every car type and a lowrider close-up.
// Also logs draw calls per frame and frames per second (swiftshader, relative only).
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
const [url, dir] = process.argv.slice(2); fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const perf = [];
const DEVS = (process.env.DEVS ?? 'desktop,phone').split(',');
for (const q of (process.env.QUALS ?? ',low,potato').split(',')) for (const [name, opts] of [['desktop', { viewport: { width: 1280, height: 720 } }], ['phone', devices['iPhone 13']]].filter(([d]) => DEVS.includes(d))) {
  const dev = name + (q ? '-' + q : '');
  const ctx = await browser.newContext(opts);
  await ctx.addInitScript(() => {
    window.__dc = 0; window.__frames = [];
    for (const P of [WebGL2RenderingContext.prototype, WebGLRenderingContext.prototype]) for (const f of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) { const o = P[f]; if (o) P[f] = function (...a) { window.__dc++; return o.apply(this, a); }; }
    const loop = (t) => { window.__frames.push([t, window.__dc]); window.__dc = 0; if (window.__frames.length > 400) window.__frames.shift(); requestAnimationFrame(loop); }; requestAnimationFrame(loop);
  });
  const page = await ctx.newPage();
  await page.goto(url + (q ? '?q=' + q : ''), { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => !document.getElementById('start').disabled, null, { timeout: 150000 });
  if (name === 'phone') await page.tap('#start'); else await page.click('#start');
  await page.waitForTimeout(1500);
  await page.evaluate(() => setInterval(() => window.__cine && window.__cine.active && window.__cine.skip(), 50));
  for (const [tod, t] of [['day', 424], ['dusk', 6], ['night', 95]]) for (const shot of ['lineup', 'lowrider']) {
    await page.evaluate(({ t, phone, shot }) => {
      clearInterval(window.__hold);
      const s = window.__game.state, pl = s.ents.find((e) => e.kind === 'player');
      const types = ['sedan', 'muscle', 'suv', 'van', 'taxi', 'police', 'lowrider'], pick = [];
      for (const ty of types) { const c = s.cars.find((c) => c.type === ty && !c.wrecked && !pick.includes(c)); if (c) pick.push(c); }
      const cars = shot === 'lowrider' ? pick.filter((c) => c.type === 'lowrider').slice(0, 1) : phone ? pick.slice(4, 7) : pick;
      const n = cars.length, sp = 3.0, x0 = pl.x - ((n - 1) * sp) / 2, z0 = pl.z - 6;
      window.__hold = setInterval(() => { s.t = t; cars.forEach((c, i) => { c.x = x0 + i * sp; c.z = z0; c.ry = 0.5; c.v = 0; c.ai = true; c.driver = null; c.hp = c.max || c.hp; }); pl.x = x0 - 6; pl.z = z0 + 4; }, 16);
      const cx = x0 + ((n - 1) * sp) / 2;
      window.__camOv = shot === 'lowrider' ? { x: x0 + 3.2, y: 1.6, z: z0 + 3.6, lx: x0, ly: 0.55, lz: z0 } : phone ? { x: cx, y: 3.2, z: z0 + 9, lx: cx, ly: 0.7, lz: z0 } : { x: cx, y: 4.5, z: z0 + 11, lx: cx, ly: 0.6, lz: z0 };
    }, { t, phone: name === 'phone', shot });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${dir}/${dev}-${tod}-${shot}.png` });
    const p = await page.evaluate(() => { const f = window.__frames.slice(-40); const fps = (f.length - 1) * 1000 / (f[f.length - 1][0] - f[0][0]); const dc = f.slice(1).map((x) => x[1]).sort((a, b) => a - b); return { fps: +fps.toFixed(1), drawCalls: dc[dc.length >> 1] }; });
    perf.push({ dev, tod, shot, ...p }); console.log(dev, tod, shot, JSON.stringify(p));
  }
  await page.evaluate(() => { clearInterval(window.__hold); window.__camOv = null; });
  await ctx.close();
}
fs.writeFileSync(`${dir}/perf.json`, JSON.stringify(perf, null, 1));
await browser.close();
