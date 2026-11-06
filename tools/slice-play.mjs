// Phone layouts for the combat and street-call slice.
// node tools/slice-play.mjs <url> <shotDir>
// Viewports: portrait 390x844, portrait 360x740, landscape 844x390.
import { chromium } from 'playwright';
import fs from 'node:fs';

const [url, dir] = process.argv.slice(2);
fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const views = [
  ['portrait-390x844', { width: 390, height: 844 }],
  ['portrait-360x740', { width: 360, height: 740 }],
  ['landscape-844x390', { width: 844, height: 390 }],
];
const out = [];
for (const [name, viewport] of views) {
  const page = await (await browser.newContext({ viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 1 })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.addInitScript(() => localStorage.setItem('se-onb', '3'));
  await page.goto(url + (url.includes('?') ? '&' : '?') + 'q=potato', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => !document.getElementById('start').disabled, null, { timeout: 150000 });
  await page.tap('#start');
  await page.waitForTimeout(1500);
  const boxes = await page.evaluate(() => {
    const r = (id) => {
      const el = document.getElementById(id); if (!el) return null;
      const b = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return { id, x: b.x, y: b.y, w: b.width, h: b.height, hide: cs.display === 'none' || cs.visibility === 'hidden' };
    };
    const inside = (b) => b && !b.hide && b.w > 8 && b.h > 8 && b.x >= -2 && b.y >= -2 && b.x + b.w <= innerWidth + 2 && b.y + b.h <= innerHeight + 2;
    const hit = (a, b) => a && b && !a.hide && !b.hide && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    const attack = r('bAttack'), dodge = r('bDodge'), stick = r('stick');
    return { w: innerWidth, h: innerHeight, attack, dodge, stick, attackIn: inside(attack), dodgeIn: inside(dodge) };
  });
  await page.evaluate(() => {
    const s = window.__game.state;
    s.t = 50; s.scuffle = true; s.opening = { done: true };
    s.calls.ready = true; s.calls.grace = 0; s.calls.cd = 0; s.calls.n = 0; s.mission = null;
    const p = s.ents.find((e) => e.kind === 'player');
    p.hp = p.max; p.heat = 0; p.car = null;
  });
  await page.waitForFunction(() => { const a = window.__game.state.calls.active; return a && a.phase === 'offer'; }, null, { timeout: 20000 });
  await page.waitForTimeout(400);
  const offer = await page.evaluate(() => {
    const r = (id) => {
      const el = document.getElementById(id); if (!el) return null;
      const b = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return { id, x: b.x, y: b.y, w: b.width, h: b.height, hide: cs.display === 'none' || cs.visibility === 'hidden', text: (el.textContent || '').trim() };
    };
    const inside = (b) => b && !b.hide && b.w > 8 && b.h > 8 && b.x >= -2 && b.y >= -2 && b.x + b.w <= innerWidth + 2 && b.y + b.h <= innerHeight + 2;
    const hit = (a, b) => a && b && !a.hide && !b.hide && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    const street = r('street'), inn = r('streetIn'), off = r('streetOff'), attack = r('bAttack'), dodge = r('bDodge');
    const s = window.__game.state, a = s.calls.active;
    const crew = s.ents.filter((e) => e.streetId === a.id && e.hp > 0);
    const p = s.ents.find((e) => e.kind === 'player');
    const near = Math.min(...crew.map((e) => Math.hypot(e.x - p.x, e.z - p.z)));
    return {
      kind: a.kind, phase: a.phase, held: crew.every((e) => e.streetHold), near: +near.toFixed(1), n: crew.length,
      streetIn: inside(street), buttonsIn: inside(inn) && inside(off),
      clearOfAttack: !hit(inn, attack) && !hit(off, attack) && !hit(inn, dodge) && !hit(off, dodge),
      text: inn && inn.text,
    };
  });
  await page.screenshot({ path: `${dir}/${name}-offer.png` });
  await page.tap('#streetIn');
  await page.waitForFunction(() => window.__game.state.calls.active && window.__game.state.calls.active.phase === 'fight', null, { timeout: 10000 });
  await page.waitForTimeout(700);
  const fight = await page.evaluate(() => {
    const s = window.__game.state, a = s.calls.active, p = s.ents.find((e) => e.kind === 'player');
    const crew = s.ents.filter((e) => a && e.streetId === a.id && e.hp > 0);
    return { phase: a && a.phase, winding: crew.filter((e) => e.windup > 0).length, close: crew.filter((e) => Math.hypot(e.x - p.x, e.z - p.z) < 3.4).length, n: crew.length };
  });
  await page.screenshot({ path: `${dir}/${name}-fight.png` });
  const hp0 = await page.evaluate(() => {
    const s = window.__game.state, p = s.ents.find((e) => e.kind === 'player');
    const e = s.ents.find((e) => e.street && e.hp > 0) || s.ents.find((e) => e.kind === 'npc' && e.crew !== 'player' && e.hp > 0);
    if (!e) return null;
    e.streetHold = false; e.x = p.x + Math.sin(p.ry) * 1.3; e.z = p.z + Math.cos(p.ry) * 1.3; e.hp = 80;
    window.__tgt = e.id; return e.hp;
  });
  if (hp0 != null) { await page.tap('#bAttack'); await page.waitForTimeout(500); await page.tap('#bAttack'); await page.waitForTimeout(400); }
  const hit = await page.evaluate(() => {
    const e = window.__game.state.ents.find((e) => e.id === window.__tgt);
    return e ? e.hp : null;
  });
  await page.screenshot({ path: `${dir}/${name}-hit.png` });
  const ok = boxes.attackIn && boxes.dodgeIn && offer.streetIn && offer.buttonsIn && offer.clearOfAttack && offer.held && offer.near >= 14 && offer.phase === 'offer' && fight.phase === 'fight' && hp0 != null && hit < hp0 && errs.length === 0;
  const note = { name, ok, errs, boxes, offer, fight, hit: { from: hp0, to: hit } };
  out.push(note);
  console.error(name, ok ? 'OK' : 'FAIL', JSON.stringify({ offer, fight, hit: note.hit, errs }));
  await page.close();
}
await browser.close();
fs.writeFileSync(`${dir}/notes.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
if (out.some((n) => !n.ok)) process.exit(1);
