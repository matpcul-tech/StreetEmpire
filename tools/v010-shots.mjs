// v0.10 checks: title layouts, first 30 seconds (scuffle, onboarding, waypoint), E feedback,
// pause, touch controls and long press, resize, potato flag, cash popup, stars.
//   node tools/v010-shots.mjs <url> <shotDir>
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
const [url, dir = '/workspace/screenshots'] = process.argv.slice(2); fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const out = []; const rec = (dev, name, r) => { out.push({ dev, name, ...r }); console.error(dev, name, JSON.stringify(r)); };
const shot = (page, n) => page.screenshot({ path: `${dir}/v0.10-${n}.png` });
for (const [dev, opts] of [['desktop', { viewport: { width: 1280, height: 720 } }], ['phone', devices['iPhone 13']], ['narrow', { viewport: { width: 400, height: 860 } }]]) {
  const ctx = await browser.newContext(opts); const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(400);
  // click during LOADING must not be lost
  const early = await page.evaluate(() => document.getElementById('start').textContent);
  if (dev === 'phone') await page.tap('#start'); else await page.click('#start');
  await shot(page, `${dev}-title-loading`);
  await page.waitForFunction(() => document.getElementById('intro').classList.contains('hidden'), null, { timeout: 180000 });
  rec(dev, 'early-click-starts', { ok: true, label_while_loading: early, version: await page.evaluate(() => document.getElementById('ver').textContent) });
  if (dev === 'narrow') { // title overlap check on a fresh load
    const p2 = await ctx.newPage(); await p2.goto(url, { waitUntil: 'domcontentloaded' }); await p2.waitForTimeout(1500); await shot(p2, 'narrow-title');
    const ov = await p2.evaluate(() => { const c = document.querySelector('#intro .card').getBoundingClientRect(); return { cardTop: Math.round(c.top), artBottom: Math.round(innerWidth * 1152 / 864), h: innerHeight }; });
    rec(dev, 'title-layout', { ok: ov.cardTop >= ov.artBottom - 140, ...ov }); await p2.close();
    await page.close(); await ctx.close(); continue;
  }
  const ev = (f, a) => page.evaluate(f, a);
  await page.waitForTimeout(800); await shot(page, `${dev}-first-seconds`);
  // the scuffle Local arrives within a few seconds and is near
  const sc = await page.waitForFunction(() => { const s = window.__game.state, p = s.ents.find((e) => e.kind === 'player'); const e = s.ents.find((x) => x.scuffler); return e ? { d: +Math.hypot(e.x - p.x, e.z - p.z).toFixed(1), t: +s.t.toFixed(1) } : null; }, null, { timeout: 120000, polling: 100 }).then((h) => h.jsonValue());
  await page.waitForTimeout(1500); await shot(page, `${dev}-scuffle`);
  const onb = await ev(() => document.getElementById('onb').innerText.replace(/\n/g, ' | '));
  const arrow = await ev(() => document.getElementById('objDist').innerText);
  rec(dev, 'scuffle-hook', { ok: sc.d < 16 && sc.t < 8, local_dist_m: sc.d, game_t: sc.t, onboarding: onb, arrow });
  // knock him out with real input
  for (let i = 0; i < 30; i++) {
    const alive = await ev(() => { const s = window.__game.state, p = s.ents.find((e) => e.kind === 'player'), e = s.ents.find((x) => x.scuffler && x.hp > 0); if (!e) return false; if (Math.hypot(e.x - p.x, e.z - p.z) > 2) { e.x = p.x + Math.sin(p.ry) * 1.3; e.z = p.z + Math.cos(p.ry) * 1.3; } p.hp = p.max; return true; });
    if (!alive) break; if (dev === 'phone') await page.tap('#bAttack'); else await page.keyboard.press('KeyF'); await page.waitForTimeout(450);
  }
  await page.waitForTimeout(800);
  const onb2 = await ev(() => document.getElementById('onb').innerText.replace(/\n/g, ' | ')), arrow2 = await ev(() => document.getElementById('objDist').innerText);
  await shot(page, `${dev}-onboarding-step2`);
  rec(dev, 'onboarding-advances', { ok: /UNC/.test(arrow2), onboarding: onb2, arrow: arrow2 });
  // E far from anything gives feedback
  if (dev === 'desktop') { await page.keyboard.press('KeyE'); await page.waitForTimeout(400); rec(dev, 'e-feedback-far', { ok: true, msg: await ev(() => document.getElementById('msg').innerText) }); }
  // walk up to Unc: prompt shows, E starts the briefing
  await ev(() => { const s = window.__game.state, p = s.ents.find((e) => e.kind === 'player'), u = s.ents.find((e) => e.kind === 'giver'); p.x = u.x + 1.8; p.z = u.z + 1.2; });
  await page.waitForTimeout(2500); await shot(page, `${dev}-near-unc`);
  const prompt = await ev(() => ({ text: document.getElementById('prompt').innerText, shown: !document.getElementById('prompt').classList.contains('hidden'), ctx: document.getElementById('bCtx').innerText }));
  if (dev === 'phone') await page.tap('#bCtx'); else await page.keyboard.press('KeyE');
  const brief = await page.waitForFunction(() => window.__cine.active === 'brief', null, { timeout: 60000 }).then(() => true, () => false);
  rec(dev, 'unc-prompt-and-talk', { ok: brief, prompt });
  await ev(() => window.__cine.skip()); await page.waitForFunction(() => !window.__cine.active, null, { timeout: 60000 });
  // cash popup with source
  const popT = await page.waitForFunction(() => document.querySelector('#pops .pop')?.innerText, null, { timeout: 120000, polling: 100 }).then((h) => h.jsonValue(), () => '');
  await shot(page, `${dev}-cash-popup`); rec(dev, 'cash-popup', { ok: !!popT, text: popT });
  // stars stay steady with no fighting
  const seen = new Set(); for (let i = 0; i < 20; i++) { seen.add(await ev(() => document.querySelectorAll('#stars i.on').length)); await page.waitForTimeout(150); }
  rec(dev, 'stars-steady', { ok: seen.size === 1, values: [...seen] });
  // pause
  if (dev === 'phone') await page.tap('#bPause'); else await page.keyboard.press('KeyP');
  await page.waitForTimeout(400); const t0 = await ev(() => window.__game.state.t); await page.waitForTimeout(1200); const t1 = await ev(() => window.__game.state.t);
  await shot(page, `${dev}-pause`);
  rec(dev, 'pause', { ok: !(await ev(() => document.getElementById('pause').classList.contains('hidden'))) && t1 === t0, sim_advanced: +(t1 - t0).toFixed(2) });
  await page.click('#pResume'); await page.waitForTimeout(300);
  // minimap
  await page.locator('#radar').screenshot({ path: `${dir}/v0.10-${dev}-minimap.png` });
  if (dev === 'phone') {
    const tc = await ev(() => ({ touchClass: document.body.classList.contains('touch'), stick: getComputedStyle(document.getElementById('touch')).display }));
    await ev(() => { const s = window.__game.state, p = s.ents.find((e) => e.kind === 'player'), u = s.ents.find((e) => e.kind === 'giver'); p.x = u.x + 8; p.z = u.z + 8; s.ents.forEach((e) => { if (e.hostile) e.hp = 0; }); }); await page.waitForTimeout(800);
    const a = await ev(() => { const p = window.__game.state.ents.find((e) => e.kind === 'player'); return { x: p.x, z: p.z }; });
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 90, y: 600, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 90, y: 530, id: 1 }] });
    const hit = await ev(() => { const e = document.elementFromPoint(90, 600); return e.id || e.className || e.tagName; }); const gt0 = await ev(() => window.__game.state.t);
    await page.waitForTimeout(6000); const knobT = await ev(() => document.getElementById('knob').style.transform + ' ' + document.getElementById('stick').className); await shot(page, 'phone-thumb-drag'); const gdt = await ev((g) => window.__game.state.t - g, gt0);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const b = await ev(() => { const p = window.__game.state.ents.find((e) => e.kind === 'player'); return { x: p.x, z: p.z }; });
    const cm = await ev(() => { const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); document.querySelector('canvas').dispatchEvent(e); return e.defaultPrevented; });
    const css = await ev(() => { const c = getComputedStyle(document.querySelector('canvas')); return { userSelect: c.userSelect, callout: c.webkitTouchCallout || 'n/a' }; });
    rec(dev, 'touch-controls', { ok: tc.touchClass && tc.stick !== 'none' && Math.hypot(b.x - a.x, b.z - a.z) > 1.5 && cm, ...tc, hit, knobT, game_dt: +gdt.toFixed(1), moved_m: +Math.hypot(b.x - a.x, b.z - a.z).toFixed(1), contextmenu_blocked: cm, ...css });
    // resize phone to desktop: the canvas must fill without reload
    await page.setViewportSize({ width: 1280, height: 720 }); await page.waitForTimeout(1500);
    const fit = await ev(() => { const c = document.querySelector('canvas').getBoundingClientRect(); return { w: Math.round(c.width), h: Math.round(c.height), iw: innerWidth, ih: innerHeight }; });
    await shot(page, 'phone-resized-to-desktop'); rec(dev, 'resize-fills', { ok: fit.w === fit.iw && fit.h === fit.ih, ...fit });
  }
  rec(dev, 'page-errors', { ok: errs.length === 0, errors: errs.slice(0, 3) });
  await ctx.close();
}
// potato flag
{ const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } }); const page = await ctx.newPage(); await page.goto(url + '?q=potato'); await page.waitForTimeout(1500);
  rec('desktop', 'potato-flag', { ok: /potato/.test(await page.evaluate(() => document.getElementById('ver').textContent)), ver: await page.evaluate(() => document.getElementById('ver').textContent) });
  await page.click('#start'); await page.waitForFunction(() => document.getElementById('intro').classList.contains('hidden'), null, { timeout: 180000 }); await page.waitForTimeout(3000); await shot(page, 'desktop-potato'); await ctx.close(); }
await browser.close();
console.log(JSON.stringify(out, null, 1)); console.error(out.every((r) => r.ok) ? 'V010 PASS' : 'V010 FAIL');
