// Crew man 2, and both crew men standing together on the street.
//   node tools/crew2-shots.mjs
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
const url = process.argv[2] || 'http://127.0.0.1:5174';
const dir = process.argv[3] || '/opt/cursor/artifacts';
fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const notes = { errors: [] };
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
page.on('pageerror', (e) => notes.errors.push(e.message));
await page.goto(`${url}/tools/pose-board.html?slot=crew&seed=1`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => window.__board && window.__board.info && /crew-m-2/.test(window.__board.info.file || '') && window.__board.info.map, null, { timeout: 120000 });
notes.board = await page.evaluate(() => {
  const g = window.__board.neu;
  window.__board.show('Pistol_Idle_Loop', 0.4, 'arm', 'pistol');
  const chain = []; let o = g.userData.gun; while (o) { chain.push(o.name || o.type); o = o.parent; }
  return { ...window.__board.info, grip: g.userData.grip && g.userData.grip.kind, gun: chain.slice(0, 5), clips: window.__board.clips.length };
});
const shots = [
  ['Idle_Loop', 0.5, 'neu', null, 'crew2-body'],
  ['Punch_Cross', 0.42, 'arm', null, 'crew2-punch'],
  ['Pistol_Idle_Loop', 0.4, 'arm', 'pistol', 'crew2-arm-pistol'],
  ['Driving_Loop', 0.5, 'seat', null, 'crew2-drive'],
  ['Death01', 2.05, 'neu', null, 'crew2-death'],
  ['Hit_Head', 0.2, 'neu', null, 'crew2-hit'],
];
for (const [name, t, mode, weapon, file] of shots) {
  await page.evaluate(([n, tt, m, w]) => window.__board.show(n, tt, m, w), [name, t, mode, weapon]);
  await page.waitForTimeout(80);
  await page.screenshot({ path: `${dir}/${file}.png` });
}
await page.close();
const phone = await (await browser.newContext({ ...devices['iPhone 13'] })).newPage();
phone.on('pageerror', (e) => notes.errors.push('street ' + e.message));
await phone.goto(url + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await phone.waitForFunction(() => !document.getElementById('start').disabled, null, { timeout: 180000 });
await phone.tap('#start');
await phone.waitForFunction(() => window.__dbg && window.__dbg.charViz, null, { timeout: 30000 });
notes.placed = await phone.evaluate(() => {
  const s = window.__game.state;
  const p = s.ents.find((e) => e.kind === 'player');
  const men = s.ents.filter((e) => e.kind === 'npc' && e.crew === 'player' && e.hp > 0);
  if (men.length < 2) return { found: men.length };
  men[0].look = 0; men[0].moving = 0; men[0].x = p.x + 1.1; men[0].z = p.z;
  men[1].look = 1; men[1].moving = 0; men[1].x = p.x + 2.3; men[1].z = p.z;
  return { found: men.length, ids: [men[0].id, men[1].id] };
});
await phone.waitForFunction((ids) => {
  if (!ids || ids.length < 2) return false;
  return ids.every((id) => {
    const g = window.__dbg.charViz.get(id);
    return g && g.userData.kit && /crew-m-/.test(g.userData.model || '');
  });
}, notes.placed.ids, { timeout: 20000 });
notes.models = await phone.evaluate((ids) => ids.map((id) => {
  const e = window.__game.state.ents.find((x) => x.id === id);
  const g = window.__dbg.charViz.get(id);
  return { look: e.look, model: g.userData.model };
}), notes.placed.ids);
await phone.evaluate((ids) => {
  const g0 = window.__dbg.charViz.get(ids[0]);
  const g1 = window.__dbg.charViz.get(ids[1]);
  const x = (g0.position.x + g1.position.x) / 2, z = (g0.position.z + g1.position.z) / 2;
  window.__camOv = { x: x + 2.4, y: 1.4, z: z + 2.6, lx: x, ly: 0.95, lz: z };
}, notes.placed.ids);
await phone.waitForTimeout(500);
await phone.screenshot({ path: `${dir}/crew-both-street.png` });
await browser.close();
fs.writeFileSync(`${dir}/crew2-shot-notes.json`, JSON.stringify(notes, null, 2));
console.log(JSON.stringify(notes, null, 2));
const files = (notes.models || []).map((m) => m.model);
if (notes.errors.length || !/crew-m-2/.test(notes.board.file || '') || new Set(files).size < 2) process.exitCode = 1;
