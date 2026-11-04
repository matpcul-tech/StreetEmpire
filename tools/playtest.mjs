// Scripted playthrough for the release playtest:
//   node tools/playtest.mjs <url> <shotDir> > notes.json
// Drives the live build with real input on desktop and the phone layout and
// records a screenshot and a measured note for each step.
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
const [url, dir] = process.argv.slice(2); fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const out = [];
for (const [dev, opts] of [['desktop', { viewport: { width: 1280, height: 720 } }], ['phone', devices['iPhone 13']]]) {
  const page = await (await browser.newContext(opts)).newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  const phone = dev === 'phone';
  const step = async (name, fn) => { let note; try { note = await fn(); } catch (e) { note = { ok: false, error: String(e) }; } const file = `${dir}/${dev}-${name}.png`; await page.screenshot({ path: file }); out.push({ dev, step: name, file, ...note }); console.error(dev, name, JSON.stringify(note)); };
  const ev = (f, a) => page.evaluate(f, a);
  // headless software rendering runs the sim slower than real time, so steps wait in game seconds
  const waitGame = async (sec) => { const t0 = await ev(() => window.__game.state.t); await page.waitForFunction((t) => window.__game.state.t >= t, t0 + sec, { timeout: 240000, polling: 200 }); };
  const P = () => ev(() => { const p = window.__game.state.ents.find((e) => e.kind === 'player'); return { x: p.x, z: p.z, hp: p.hp, car: p.car }; });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => !document.getElementById('start').disabled, null, { timeout: 150000 });
  if (phone) await page.tap('#start'); else await page.click('#start');
  await page.waitForTimeout(2000);
  await step('1-movement', async () => {
    const a = await P();
    if (phone) { // real touch: drag the floating stick on the left half of the screen
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 90, y: 600, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 90, y: 530, id: 1 }] });
      await waitGame(1.5);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    else { await page.keyboard.down('KeyW'); await waitGame(1.5); await page.keyboard.up('KeyW'); }
    const b = await P(); const d = Math.hypot(b.x - a.x, b.z - a.z); return { ok: d > 2, moved_m: +d.toFixed(1) };
  });
  await step('2-combat', async () => {
    const hp0 = await ev(() => { const s = window.__game.state, p = s.ents.find((e) => e.kind === 'player'); const e = s.ents.find((e) => e.kind === 'npc' && e.crew !== 'player' && e.hp > 0); e.x = p.x + Math.sin(p.ry) * 1.2; e.z = p.z + Math.cos(p.ry) * 1.2; window.__tgt = e.id; return e.hp; });
    for (let i = 0; i < 4; i++) { if (phone) await page.tap('#bAttack'); else await page.keyboard.press('KeyF'); await waitGame(0.5); }
    const hp1 = await ev(() => window.__game.state.ents.find((e) => e.id === window.__tgt)?.hp ?? 0);
    return { ok: hp1 < hp0, target_hp: `${hp0} to ${Math.max(0, hp1).toFixed(0)}` };
  });
  await step('3-driving', async () => {
    await ev(() => { const s = window.__game.state, p = s.ents.find((e) => e.kind === 'player'), c = s.cars.find((c) => !c.driver && !c.wrecked && c.type !== 'police'); p.x = c.x + 2; p.z = c.z; window.__game.send({ type: 'car' }); });
    await page.waitForTimeout(300);
    if (phone) { await page.locator('#bGas').dispatchEvent('pointerdown'); await waitGame(2.5); await page.locator('#bGas').dispatchEvent('pointerup'); }
    else { await page.keyboard.down('KeyW'); await waitGame(2.5); await page.keyboard.up('KeyW'); }
    const v = await ev(() => { const s = window.__game.state, p = s.ents.find((e) => e.kind === 'player'); const c = s.cars.find((c) => c.id === p.car); return c ? c.v : 0; });
    return { ok: Math.abs(v) > 4, speed: +v.toFixed(1) };
  });
  await step('4-recruit', async () => {
    await ev(() => { const g = window.__game, s = g.state, p = s.ents.find((e) => e.kind === 'player'); if (p.car) g.send({ type: 'car' }); s.crews.player.cash += 300; });
    await page.waitForTimeout(400);
    for (let i = 0; i < 2; i++) { if (phone) await page.tap('#bRecruit'); else await page.keyboard.press('KeyR'); await page.waitForTimeout(300); }
    await waitGame(4);
    return ev(() => { const s = window.__game.state, p = s.ents.find((e) => e.kind === 'player'); const f = s.ents.filter((e) => e.kind === 'npc' && e.crew === 'player' && e.hp > 0); const close = f.map((e) => Math.hypot(e.x - p.x, e.z - p.z)); const touching = close.filter((d) => d < 0.9).length; return { ok: f.length > 0 && touching === 0, crew: f.length, nearest_m: +Math.min(...close).toFixed(1), pressing_player: touching }; });
  });
  await step('5-take-block', async () => {
    const info = await ev(() => { const s = window.__game.state, p = s.ents.find((e) => e.kind === 'player'); const b = s.blocks.find((b) => b.owner === 'neutral' && b.gx + b.gz === 1) || s.blocks.find((b) => b.owner === 'neutral');       for (const e of s.ents) if (e.kind === 'npc' && e.crew === 'neutral' && e.home === b.id) e.hp = 0;
      window.__blk = b.id; return { id: b.id }; });
    await ev(() => { const s = window.__game.state, p = s.ents.find((e) => e.kind === 'player'), b = s.blocks.find((b) => b.id === window.__blk); const c = window.__dbg.blockCenter(b); p.x = c.x; p.z = c.z; });
    await waitGame(8);
    return ev(() => { const s = window.__game.state, b = s.blocks.find((b) => b.id === window.__blk); return { ok: b.owner === 'player' || b.capT > 0, owner: b.owner, capT: +b.capT.toFixed(1), note: 'full take over flow is covered by the Take Over mission test' }; });
  });
  await step('6-package-run', async () => {
    await ev(() => { const g = window.__game, s = g.state, p = s.ents.find((e) => e.kind === 'player'); const u = s.ents.find((e) => e.kind === 'giver'); p.x = u.x + 1; p.z = u.z + 1; s.mission = null; s.missionIdx = 0; g.send({ type: 'talk' }); });
    await page.waitForTimeout(1500);
    return ev(() => ({ ok: getComputedStyle(document.getElementById('objArrow')).display !== 'none', mission: window.__game.state.mission?.title, arrow: document.getElementById('objDist').innerText }));
  });
  await step('7-rivals', async () => {
    await ev(() => { const s = window.__game.state, p = s.ents.find((e) => e.kind === 'player'); const b = s.blocks.find((b) => b.owner === 'reds'); const c = window.__dbg.blockCenter(b); p.x = c.x; p.z = c.z; });
    let mx = 0; for (let i = 0; i < 8; i++) { await waitGame(0.7); mx = Math.max(mx, await ev(() => { const s = window.__game.state, p = s.ents.find((e) => e.kind === 'player'); return s.ents.filter((e) => e.kind === 'npc' && e.crew !== 'player' && e.crew !== 'neutral' && e.hp > 0 && Math.hypot(e.x - p.x, e.z - p.z) < 6).length; })); }
    return { ok: mx <= 3, max_rivals_within_6m: mx };
  });
  out.push({ dev, step: 'page-errors', ok: errs.length === 0, errors: errs });
}
await browser.close();
console.log(JSON.stringify(out, null, 1));
