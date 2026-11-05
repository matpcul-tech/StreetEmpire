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
      // line the cars up along a real street: anchor on a traffic car, spread along its heading, camera off to the side
      const A = window.__anchor ||= (() => { const a = s.cars.find((c) => c.type === 'taxi' && !c.wrecked) || s.cars[0]; return { x: a.x, z: a.z, ry: a.ry }; })();
      const fx = Math.sin(A.ry), fz = Math.cos(A.ry), rx = Math.cos(A.ry), rz = -Math.sin(A.ry), n = cars.length, sp = 6.5;
      window.__hold = setInterval(() => { s.t = t; cars.forEach((c, i) => { const k = (i - (n - 1) / 2) * sp; c.x = A.x + fx * k; c.z = A.z + fz * k; c.ry = A.ry + 0.7; c.v = 0; c.ai = false; c.driver = null; }); pl.x = A.x - rx * 9; pl.z = A.z - rz * 9; }, 16);
      const d = shot === 'lowrider' ? 0 : phone ? 15 : 17;
      window.__camOv = shot === 'lowrider' ? { x: A.x + fx * 3.0 + rx * 3.0, y: 1.4, z: A.z + fz * 3.0 + rz * 3.0, lx: A.x, ly: 0.55, lz: A.z } : { x: A.x + rx * d, y: phone ? 4 : 5, z: A.z + rz * d, lx: A.x, ly: 0.6, lz: A.z };
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
