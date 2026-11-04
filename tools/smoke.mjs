// Headless smoke test: node tools/smoke.mjs <url>
// Env: SHOTDIR, SHOTPREFIX for screenshot output.
import { chromium, devices } from 'playwright';
const url = process.argv[2];
const dir = process.env.SHOTDIR || '/tmp', pre = process.env.SHOTPREFIX || 'shot';
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
for (const [name, opts] of [['desktop', { viewport: { width: 1280, height: 720 } }], ['phone', devices['iPhone 13']]]) {
  const page = await (await browser.newContext(opts)).newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => !document.getElementById('start').disabled, null, { timeout: 150000 });
  if (name === 'phone') await page.tap('#start'); else await page.click('#start');
  await page.waitForTimeout(1500);
  if (name === 'desktop') { await page.keyboard.down('KeyD'); await page.waitForTimeout(800); await page.keyboard.up('KeyD'); await page.keyboard.press('KeyF'); }
  else { await page.tap('#bAttack'); await page.tap('#bRecruit'); }
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${dir}/${pre}-${name}.png` });
  // teleport next to a car, drive it a bit
  await page.evaluate(() => { const s = window.__game.state, p = s.ents.find((e) => e.kind === 'player'), c = s.cars[0]; p.x = c.x + 2; p.z = c.z; window.__game.send({ type: 'car' }); });
  if (name === 'desktop') { await page.keyboard.down('KeyW'); await page.waitForTimeout(2500); await page.keyboard.up('KeyW'); }
  else await page.waitForTimeout(1500);
  await page.screenshot({ path: `${dir}/${pre}-${name}-car.png` });
  // v0.5: shotgun fight with lock-on, then a handbrake drift
  await page.evaluate(() => { const g = window.__game, s = g.state, p = s.ents.find((e) => e.kind === 'player'); if (p.car) g.send({ type: 'car' }); p.shells = 10; p.weapon = 'shotgun'; p.hasKnux = true;
    const reds = s.ents.filter((e) => e.kind === 'npc' && e.crew !== 'player' && e.hp > 0).slice(0, 3); reds.forEach((e, i) => { e.x = p.x + Math.sin(p.ry) * 5 + (i - 1) * 1.2; e.z = p.z + Math.cos(p.ry) * 5; }); });
  await page.waitForTimeout(600);
  for (let i = 0; i < 2; i++) { if (name === 'phone') await page.tap('#bAttack'); else await page.keyboard.press('KeyF'); await page.waitForTimeout(1000); }
  if (name === 'phone') await page.tap('#bAttack'); else await page.keyboard.press('KeyF');
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${dir}/${pre}-${name}-fight.png` });
  await page.evaluate(() => { const s = window.__game.state, p = s.ents.find((e) => e.kind === 'player'), c = s.cars.find((c) => !c.driver && !c.wrecked); p.x = c.x + 2; p.z = c.z; window.__game.send({ type: 'car' }); });
  if (name === 'desktop') { await page.keyboard.down('KeyW'); await page.waitForTimeout(2200); await page.keyboard.down('KeyD'); await page.keyboard.down('Space'); await page.waitForTimeout(900); }
  else { await page.waitForTimeout(300); await page.evaluate(() => { const s = window.__game.state, c = s.cars.find((c) => c.id === s.ents.find((e) => e.kind === 'player').car); c.v = 22; }); await page.locator('#bRight').dispatchEvent('pointerdown'); await page.locator('#bDrift').dispatchEvent('pointerdown'); await page.waitForTimeout(900); }
  const drift = await page.evaluate(() => { const s = window.__game.state, c = s.cars.find((c) => c.id === s.ents.find((e) => e.kind === 'player').car); return c ? { slip: +(c.slip || 0).toFixed(2), skid: c.skid, v: +c.v.toFixed(1) } : null; });
  await page.screenshot({ path: `${dir}/${pre}-${name}-drift.png` });
  if (name === 'desktop') { for (const k of ['KeyW', 'KeyD', 'Space']) await page.keyboard.up(k); } else { await page.locator('#bRight').dispatchEvent('pointerup'); await page.locator('#bDrift').dispatchEvent('pointerup'); }
  console.log(name, 'drift', JSON.stringify(drift));
  // mission marker: start Package Run and look at the arrow
  await page.evaluate(() => { const g = window.__game, s = g.state, p = s.ents.find((e) => e.kind === 'player'); if (p.car) g.send({ type: 'car' }); const u = s.ents.find((e) => e.kind === 'giver'); p.x = u.x + 1; p.z = u.z + 1; s.mission = null; s.missionIdx = 0; g.send({ type: 'talk' }); });
  await page.waitForTimeout(1500);
  const arrow = await page.evaluate(() => ({ shown: getComputedStyle(document.getElementById('objArrow')).display, dist: document.getElementById('objDist').innerText, mission: window.__game.state.mission && window.__game.state.mission.title }));
  console.log(name, 'mission arrow', JSON.stringify(arrow));
  await page.screenshot({ path: `${dir}/${pre}-${name}-mission.png` });
  // wanted level and night
  await page.evaluate(() => { const s = window.__game.state, p = s.ents.find((e) => e.kind === 'player'); p.heat = 45; s.t = 95; });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${dir}/${pre}-${name}-night-wanted.png` });
  const info = await page.evaluate(() => { const s = window.__game.state; const p = s.ents.find((e) => e.kind === 'player'); const c = s.cars.find((c) => c.id === p.car); return { cops: s.ents.filter((e) => e.kind === 'cop').length, stars: document.querySelectorAll('#stars i.on').length, clock: document.getElementById('clock').innerText, t: s.t.toFixed(1), inCar: !!p.car, carV: c ? c.v.toFixed(1) : null, hud: document.getElementById('cash').innerText, touch: document.body.classList.contains('touch'), perf: window.__perf(), mm: (() => { const d = document.getElementById('radar').getContext('2d').getImageData(0, 0, 200, 200).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; })() }; });
  console.log(name, JSON.stringify(info), 'errors:', errs);
}
await browser.close();
