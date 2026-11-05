// Captures the v0.9 cinematic moments on desktop and phone and checks each one
// actually ran: node tools/cine-shots.mjs <url> <shotDir> [prefix]
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
const [url, dir = '/workspace/screenshots', pre = 'v0.9'] = process.argv.slice(2); fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const out = [];
for (const [dev, opts] of [['desktop', { viewport: { width: 1280, height: 720 } }], ['phone', devices['iPhone 13']]]) {
  const page = await (await browser.newContext(opts)).newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  const ev = (f, a) => page.evaluate(f, a);
  const shot = async (name) => { const f = `${dir}/${pre}-${dev}-${name}.png`; await page.screenshot({ path: f }); return f; };
  const waitCine = (kind, ms = 120000) => page.waitForFunction((k) => window.__cine.active === k, kind, { timeout: ms, polling: 30 });
  const waitIdle = (ms = 240000) => page.waitForFunction(() => !window.__cine.active, null, { timeout: ms, polling: 50 });
  const rec = async (name, fn) => { let r; try { r = await fn(); } catch (e) { r = { ok: false, error: String(e).split('\n')[0] }; } out.push({ dev, name, ...r }); console.error(dev, name, JSON.stringify(r)); };
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => !document.getElementById('start').disabled, null, { timeout: 150000 });
  if (dev === 'phone') await page.tap('#start'); else await page.click('#start');
  await page.waitForTimeout(2500);
  const setT = (t) => ev((t) => { window.__game.state.t = t; }, t);
  await setT(424); // daytime for clear shots
  // 1. car entry mid animation, then exit
  await rec('car-entry', async () => {
    await ev(() => { const g = window.__game, s = g.state, p = s.ents.find((e) => e.kind === 'player'); const c = s.cars.filter((c) => !c.driver && !c.wrecked && !c.ai && c.type !== 'police').sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0]; p.x = c.x - Math.cos(c.ry) * 3.2 + Math.sin(c.ry) * 1.5; p.z = c.z + Math.sin(c.ry) * 3.2 + Math.cos(c.ry) * 1.5; });
    await page.waitForTimeout(800);
    const t0 = Date.now(); await ev(() => window.__game.send({ type: 'car' }));
    await waitCine('car'); const anim = await ev(() => window.__cine.info.dur); await page.waitForFunction(() => window.__cine.info && window.__cine.info.t > 0.62, null, { timeout: 60000, polling: 20 }); const f = await shot('car-entry-mid');
    await waitIdle(); const dur = anim;
    const inCar = await ev(() => !!window.__game.state.ents.find((e) => e.kind === 'player').car);
    return { ok: inCar, file: f, anim_s: dur };
  });
  await rec('car-exit', async () => {
    const t0 = Date.now(); await ev(() => window.__game.send({ type: 'car' }));
    await waitCine('car'); const anim = await ev(() => window.__cine.info.dur); await page.waitForFunction(() => window.__cine.info && window.__cine.info.t > 0.35, null, { timeout: 60000, polling: 20 }); const f = await shot('car-exit-mid'); await waitIdle();
    return { ok: true, file: f, anim_s: anim };
  });
  await rec('car-jack', async () => {
    await ev(() => { const g = window.__game, s = g.state, p = s.ents.find((e) => e.kind === 'player'); const c = s.cars.find((c) => c.ai && !c.wrecked && !c.cops && c.type !== 'police'); c.v = 0; p.x = c.x - Math.cos(c.ry) * 2.6; p.z = c.z + Math.sin(c.ry) * 2.6; window.__jc = c.id; });
    for (let k = 0; k < 15; k++) { await page.waitForTimeout(100); await ev(() => { const s = window.__game.state, c = s.cars.find((c) => c.id === window.__jc), p = s.ents.find((e) => e.kind === 'player'); c.v = 0; p.x = c.x - Math.cos(c.ry) * 2.6; p.z = c.z + Math.sin(c.ry) * 2.6; }); }
    await ev(() => { const s = window.__game.state, c = s.cars.find((c) => c.id === window.__jc), p = s.ents.find((e) => e.kind === 'player'); c.v = 0; p.x = c.x - Math.cos(c.ry) * 2.6; p.z = c.z + Math.sin(c.ry) * 2.6; window.__game.send({ type: 'car' }); });
    await waitCine('car'); const anim = await ev(() => window.__cine.info.dur); await page.waitForFunction(() => window.__cine.info && window.__cine.info.t > 0.25, null, { timeout: 60000, polling: 20 }); const f = await shot('car-jack'); await waitIdle();
    await ev(() => window.__game.send({ type: 'car' })); await waitIdle();
    return { ok: anim > 1.4, file: f, anim_s: anim };
  });
  await rec('skip-car', async () => {
    await ev(() => { const s = window.__game.state, p = s.ents.find((e) => e.kind === 'player'); const c = s.cars.find((c) => !c.driver && !c.wrecked && !c.ai && c.type !== 'police' && Math.hypot(c.x - p.x, c.z - p.z) < 60) || s.cars.find((c) => !c.driver && !c.wrecked && !c.ai); p.x = c.x - Math.cos(c.ry) * 2.6; p.z = c.z + Math.sin(c.ry) * 2.6; window.__game.send({ type: 'car' }); });
    await waitCine('car'); const t0 = Date.now();
    if (dev === 'phone') await page.touchscreen.tap(200, 300); else await page.mouse.click(640, 300);
    await waitIdle(5000); const d = (Date.now() - t0) / 1000;
    await ev(() => window.__game.send({ type: 'car' })); await page.evaluate(() => window.__cine.skip()); await waitIdle();
    return { ok: d < 1.5, skipped_after_s: +d.toFixed(2) }; // an unskipped entry takes about 12 s of wall time in headless software rendering
  });
  // 2. Unc briefing cutscenes, one per mission
  for (let i = 0; i < 5; i++) await rec('brief-' + (i + 1), async () => {
    await ev((i) => { const g = window.__game, s = g.state, p = s.ents.find((e) => e.kind === 'player'); if (p.car) g.send({ type: 'car' }); const u = s.ents.find((e) => e.kind === 'giver'); p.x = u.x + 1.6; p.z = u.z + 1.6; s.mission = null; s.missionIdx = i; }, i);
    await waitIdle(); await page.waitForTimeout(600);
    const t0 = Date.now(); const gt0 = await ev(() => window.__game.state.t); let anim = 0;
    await ev(() => window.__game.send({ type: 'talk' }));
    await waitCine('brief'); anim = await ev(() => window.__cine.info.dur);
    const lines = []; let f = null, last = '', bars = '0px';
    while (await ev(() => window.__cine.active === 'brief')) {
      const txt = await ev(() => document.getElementById('cineSub').innerText.replace(/\n/g, ' '));
      if (txt && txt !== last) { last = txt; lines.push(txt); await page.waitForTimeout(300); bars = await ev(() => getComputedStyle(document.querySelector('#cine .bar.top')).height); const fn = await shot(`unc-cutscene-${i + 1}-${lines.length}`); if (lines.length === 2) f = fn; }
      await page.waitForTimeout(100);
    }
    await waitIdle(); const gt1 = await ev(() => window.__game.state.t);
    const mission = await ev(() => window.__game.state.mission?.title);
    return { ok: !!mission && lines.length >= 2, mission, lines, letterbox: bars, anim_s: anim, sim_advanced_s: +(gt1 - gt0).toFixed(2), file: f };
  });
  // skip a briefing with a tap
  await rec('skip-brief', async () => {
    await ev(() => { const s = window.__game.state; s.mission = null; s.missionIdx = 0; window.__game.send({ type: 'talk' }); });
    await waitCine('brief'); await page.waitForTimeout(400); const t0 = Date.now();
    if (dev === 'phone') await page.touchscreen.tap(200, 300); else await page.mouse.click(640, 300);
    await waitIdle(5000); return { ok: (Date.now() - t0) < 800, skipped_after_s: +((Date.now() - t0) / 1000).toFixed(2) };
  });
  // 3. block claim swing
  await rec('block-claim', async () => {
    await ev(() => { const s = window.__game.state, p = s.ents.find((e) => e.kind === 'player'); s.mission = null; const b = s.blocks.find((b) => b.owner === 'neutral'); for (const e of s.ents) if (e.kind === 'npc' && e.home === b.id && e.crew !== 'player') e.hp = 0; const c = window.__dbg.blockCenter(b); p.x = c.x; p.z = c.z; b.capBy = 'player'; b.capT = 9.5; window.__blk = b.id; });
    await waitCine('swing', 240000); await page.waitForTimeout(700); const f = await shot('block-claim'); await waitIdle(); await page.waitForTimeout(300); const f2 = await shot('block-claim-after');
    return { ok: await ev(() => window.__game.state.blocks.find((b) => b.id === window.__blk).owner === 'player'), file: f, after: f2 };
  });
  // 4. mission passed card (finish Package Run by walking the package back)
  await rec('mission-passed', async () => {
    await ev(() => { const g = window.__game, s = g.state, p = s.ents.find((e) => e.kind === 'player'); const u = s.ents.find((e) => e.kind === 'giver'); p.x = u.x + 1.6; p.z = u.z + 1.6; s.mission = null; s.missionIdx = 0; });
    await page.waitForTimeout(2500); await ev(() => window.__game.send({ type: 'talk' }));
    await waitCine('brief'); await ev(() => window.__cine.skip()); await waitIdle();
    await ev(() => { const s = window.__game.state, p = s.ents.find((e) => e.kind === 'player'), m = s.mission; p.x = m.target.x; p.z = m.target.z; });
    await page.waitForFunction(() => window.__game.state.mission?.stage === 1, null, { timeout: 240000 });
    await ev(() => { const s = window.__game.state, p = s.ents.find((e) => e.kind === 'player'), m = s.mission; p.x = m.target.x + 1; p.z = m.target.z + 1; });
    await page.waitForFunction(() => document.getElementById('passCard').classList.contains('show'), null, { timeout: 240000 });
    await page.waitForTimeout(400); const f = await shot('mission-passed');
    return { ok: true, file: f, card: await ev(() => document.getElementById('passCard').innerText.replace(/\n/g, ' | ')) };
  });
  // 5. wasted beat in slow motion
  await rec('wasted', async () => {
    await ev(() => { const s = window.__game.state, p = s.ents.find((e) => e.kind === 'player'); p.heat = 0; s.t = 95; window.__dbg.down(); });
    await page.waitForTimeout(600); const f = await shot('wasted');
    const tint = await ev(() => document.getElementById('downTint').className);
    await page.waitForFunction(() => !(window.__game.state.ents.find((e) => e.kind === 'player').downT > 0), null, { timeout: 120000 });
    return { ok: tint.includes('on'), file: f, tint };
  });
  await rec('busted', async () => {
    await page.waitForTimeout(1500);
    await ev(() => { const s = window.__game.state, p = s.ents.find((e) => e.kind === 'player'); p.heat = 40; window.__dbg.down(); });
    await page.waitForTimeout(600); const f = await shot('busted');
    await page.waitForFunction(() => !(window.__game.state.ents.find((e) => e.kind === 'player').downT > 0), null, { timeout: 120000 });
    return { ok: true, file: f };
  });
  out.push({ dev, name: 'page-errors', ok: errs.length === 0, errors: errs });
  await page.context().close();
}
await browser.close();
console.log(JSON.stringify(out, null, 1));
console.error(out.every((r) => r.ok) ? 'CINE PASS' : 'CINE FAIL');
