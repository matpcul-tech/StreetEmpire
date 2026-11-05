// v0.10.1: text layout audit (nothing over the player, the road ahead, the controls or the
// radar), block guards and the squad riding along. Includes 1280x720, 1280x800, phone
// portrait, device landscape, an explicit 844x390 landscape, and 360x740.
//   node tools/v0101-shots.mjs <url> <shotDir>
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
const [url, dir = '/workspace/screenshots'] = process.argv.slice(2); fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const out = []; const rec = (dev, name, r) => { out.push({ dev, name, ...r }); console.error(dev, name, JSON.stringify(r)); };
const land = { ...devices['iPhone 13 landscape'] };
for (const [dev, opts] of [['desktop', { viewport: { width: 1280, height: 720 } }], ['wide', { viewport: { width: 1280, height: 800 } }], ['portrait', devices['iPhone 13']], ['landscape', land], ['land844', { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }], ['small', { viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
  const ctx = await browser.newContext(opts); const page = await ctx.newPage();
  const touch = !!(opts.hasTouch || opts.isMobile);
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.evaluate(() => localStorage.removeItem('se-onb'));
  if (touch) await page.tap('#start'); else await page.click('#start');
  await page.waitForFunction(() => document.getElementById('intro').classList.contains('hidden'), null, { timeout: 180000 });
  const ev = (f, a) => page.evaluate(f, a);
  const gwait = async (sec) => { const t0 = await ev(() => window.__game.state.t); await page.waitForFunction((t) => window.__game.state.t > t, t0 + sec, { timeout: 300000, polling: 200 }); };
  // layout audit of every visible text element against the no go zones
  const audit = (moment) => ev((moment) => {
    const rect = (el) => { if (!el) return null; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return null; const r = el.getBoundingClientRect(); return r.width && r.height ? r : null; };
    const vis = (el) => { const r = rect(el); return r && el.textContent.trim() ? r : null; };
    const W = innerWidth, H = innerHeight;
    const zones = { player_and_road: { left: W * 0.36, right: W * 0.64, top: H * 0.38, bottom: H * 0.8 } };
    const rad = document.getElementById('radar').getBoundingClientRect(); zones.radar = rad;
    if (document.body.classList.contains('touch')) { for (const id of ['stick', 'steer', 'btns']) { const r = vis(document.getElementById(id)) || document.getElementById(id).getBoundingClientRect(); if (r.width) zones[id] = r; } }
    const ov = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const texts = ['mission', 'onb', 'capture', 'msg', 'prompt', 'pops', 'big', 'passCard', 'objArrow', 'sub', 'hp'];
    const hits = [], seen = {};
    for (const id of texts) { const r = vis(document.getElementById(id)); if (!r) continue; seen[id] = [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
      for (const [z, zr] of Object.entries(zones)) if (ov(r, zr) && !(id === 'objArrow' && z === 'player_and_road') && !(id === 'hp' && z === 'player_and_road') && !(id === 'sub' && z === 'player_and_road')) hits.push(id + ' over ' + z); }
    const squad = vis(document.getElementById('bSquad')), recruit = vis(document.getElementById('bRecruit'));
    const hpR = rect(document.getElementById('hp')), popR = vis(document.getElementById('pops'));
    if (seen.sub && squad && ov(vis(document.getElementById('sub')), squad)) hits.push('sub over bSquad');
    if (seen.sub && recruit && ov(vis(document.getElementById('sub')), recruit)) hits.push('sub over bRecruit');
    if (seen.objArrow && squad && ov(vis(document.getElementById('objArrow')), squad)) hits.push('objArrow over bSquad');
    if (popR && hpR && ov(popR, hpR)) hits.push('pops over hp');
    return { moment, seen, hits };
  }, moment);
  const check = async (moment) => { const a = await audit(moment); await page.screenshot({ path: `${dir}/v0.10.1-${dev}-${moment}.png` }); rec(dev, moment, { ok: a.hits.length === 0, hits: a.hits, text: a.seen }); };
  // 1. opening fight with onboarding and a cash popup
  await page.waitForFunction(() => window.__game.state.ents.some((x) => x.scuffler), null, { timeout: 120000, polling: 100 });
  // hustle cash now sits in the block stash, so a cash pop is not guaranteed while you stand on your only block
  await page.waitForFunction(() => document.querySelector('#pops .pop'), null, { timeout: 8000, polling: 200 }).catch(() => {});
  await check('opening-fight');
  // 2. near Unc
  await ev(() => { const s = window.__game.state; for (const e of s.ents) if (e.scuffler) e.hp = 0; });
  await gwait(1);
  await ev(() => { const s = window.__game.state, p = s.ents.find((e) => e.kind === 'player'), u = s.ents.find((e) => e.kind === 'giver'); p.x = u.x + 1.8; p.z = u.z + 1.2; });
  await gwait(1.5); await check('near-unc');
  // 3. mission line, squad of 2, squad gets in the car, driving
  if (!touch) await page.keyboard.press('KeyE'); else await page.tap('#bCtx');
  await page.waitForFunction(() => window.__cine.active === 'brief', null, { timeout: 60000 }).catch(() => {});
  await ev(() => window.__cine.skip()); await page.waitForFunction(() => !window.__cine.active, null, { timeout: 60000 });
  await ev(() => { window.__game.state.crews.player.cash += 400; window.__game.send({ type: 'recruit' }); window.__game.send({ type: 'recruit' }); });
  await gwait(2);
  const car = await ev(() => { const s = window.__game.state, p = s.ents.find((e) => e.kind === 'player'); const c = s.cars.filter((c) => !c.driver && !c.wrecked && !c.cops).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0]; p.x = c.x + Math.cos(c.ry) * 2.2; p.z = c.z - Math.sin(c.ry) * 2.2; for (const e of s.ents) if (e.role === 'follower') { e.x = c.x + Math.cos(c.ry) * 6; e.z = c.z - Math.sin(c.ry) * 6 + (e.slot || 0) * 1.5; } return c.id; });
  await gwait(0.3);
  if (!touch) await page.keyboard.press('KeyE'); else await page.tap('#bCtx');
  await gwait(0.5); await page.screenshot({ path: `${dir}/v0.10.1-${dev}-squad-boarding.png` });
  await ev(() => window.__cine.active && window.__cine.skip());
  await page.waitForFunction(() => { const s = window.__game.state, p = s.ents.find((e) => e.kind === 'player'); return p.car && s.ents.filter((e) => e.role === 'follower' && e.car === p.car).length === 2; }, null, { timeout: 120000, polling: 200 }).catch(() => {});
  const rode = await ev(() => { const s = window.__game.state, p = s.ents.find((e) => e.kind === 'player'); return { inCar: !!p.car, squad_in_car: s.ents.filter((e) => e.role === 'follower' && e.car && e.car === p.car).length }; });
  await page.screenshot({ path: `${dir}/v0.10.1-${dev}-squad-in-car.png` });
  rec(dev, 'squad-in-car', { ok: rode.inCar && rode.squad_in_car === 2, ...rode });
  if (!touch) await page.keyboard.down('KeyW'); else await page.dispatchEvent('#bGas', 'pointerdown');
  await gwait(2.5); await check('driving-mission');
  if (!touch) await page.keyboard.up('KeyW'); else await page.dispatchEvent('#bGas', 'pointerup');
  await gwait(1);
  if (!touch) await page.keyboard.press('KeyE'); else await page.tap('#bCtx');
  await gwait(1.5);
  const outc = await ev(() => { const s = window.__game.state, p = s.ents.find((e) => e.kind === 'player'); const f = s.ents.filter((e) => e.role === 'follower' && e.hp > 0); return { inCar: !!p.car, squad_out_near: f.filter((e) => !e.car && Math.hypot(e.x - p.x, e.z - p.z) < 8).length }; });
  rec(dev, 'squad-hops-out', { ok: !outc.inCar && outc.squad_out_near === 2, ...outc });
  // 4. take a neutral block: the squad stays to guard it, minimap shows the guard count
  const bid = await ev(() => { const s = window.__game.state, p = s.ents.find((e) => e.kind === 'player'); const b = s.blocks.filter((b) => b.owner === 'neutral').sort((a, x) => { const ca = window.__dbg.blockCenter(a), cx = window.__dbg.blockCenter(x); return Math.hypot(ca.x - p.x, ca.z - p.z) - Math.hypot(cx.x - p.x, cx.z - p.z); })[0]; for (const e of s.ents) if (e.kind === 'npc' && e.crew === 'neutral' && e.home === b.id) e.hp = 0; const c = window.__dbg.blockCenter(b); p.x = c.x; p.z = c.z; for (const e of s.ents) if (e.role === 'follower') { e.x = c.x + 2; e.z = c.z + 2; } return b.id; });
  await page.waitForFunction((id) => window.__game.state.blocks.find((b) => b.id === id).owner === 'player', bid, { timeout: 400000, polling: 300 }).catch(() => {});
  await ev(() => window.__cine.active && window.__cine.skip());
  await check('block-claimed');
  await gwait(12);
  const gd = await ev((id) => { const s = window.__game.state, b = s.blocks.find((b) => b.id === id), c = window.__dbg.blockCenter(b), p = s.ents.find((e) => e.kind === 'player'); const g = s.ents.filter((e) => e.kind === 'npc' && e.crew === 'player' && e.role === 'defender' && e.target === id && e.hp > 0); p.x = c.x + 24; p.z = c.z + 24; return { owner: b.owner, guards: g.length, following: s.ents.filter((e) => e.role === 'follower' && e.hp > 0).length, posts: g.map((e) => [Math.round(e.x - c.x), Math.round(e.z - c.z)]) }; }, bid);
  await gwait(1.5);
  await page.screenshot({ path: `${dir}/v0.10.1-${dev}-block-guards.png` });
  await page.locator('#radar').screenshot({ path: `${dir}/v0.10.1-${dev}-block-guards-minimap.png` });
  rec(dev, 'block-guards', { ok: gd.owner === 'player' && gd.guards >= 2 && gd.guards <= 3 && gd.following === 0, ...gd });
  // 5. wasted beat text
  await ev(() => window.__dbg.down()); await gwait(0.6); await check('wasted');
  rec(dev, 'page-errors', { ok: errs.length === 0, errors: errs.slice(0, 3) });
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify(out, null, 1)); console.error(out.every((r) => r.ok) ? 'V0101 PASS' : 'V0101 FAIL');
