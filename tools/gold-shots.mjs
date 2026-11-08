import { chromium, devices } from 'playwright';
import fs from 'node:fs';
const url = 'http://127.0.0.1:5174';
const dir = '/opt/cursor/artifacts';
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const notes = { errors: [] };
async function board(slot, shots) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  page.on('pageerror', (e) => notes.errors.push(slot + ' ' + e.message));
  await page.goto(`${url}/tools/pose-board.html?slot=${slot}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction((s) => window.__board && window.__board.slot === s && window.__board.info.map, slot, { timeout: 120000 });
  notes[slot] = await page.evaluate(() => {
    const g = window.__board.neu;
    window.__board.show('Pistol_Idle_Loop', 0.4, 'arm', 'pistol');
    const chain = []; let o = g.userData.gun; while (o) { chain.push(o.name || o.type); o = o.parent; }
    return { ...window.__board.info, grip: g.userData.grip && g.userData.grip.kind, gun: chain.slice(0, 5) };
  });
  for (const [name, t, mode, weapon, file] of shots) {
    await page.evaluate(([n, tt, m, w]) => window.__board.show(n, tt, m, w), [name, t, mode, weapon]);
    await page.waitForTimeout(80);
    await page.screenshot({ path: `${dir}/${file}.png` });
  }
  await page.close();
}
await board('reds', [
  ['Pistol_Idle_Loop', 0.4, 'arm', 'pistol', 'reds-hand-after-pistol'],
  ['Punch_Cross', 0.42, 'arm', null, 'reds-hand-after-punch'],
  ['Idle_Loop', 0.5, 'both', null, 'reds-hand-after-body'],
]);
await board('golds', [
  ['Idle_Loop', 0.5, 'both', null, 'comparison-golds-idle'],
  ['Idle_Loop', 0.5, 'neu', null, 'golds-body'],
  ['Pistol_Idle_Loop', 0.4, 'arm', 'pistol', 'golds-arm-pistol'],
  ['Punch_Cross', 0.42, 'arm', null, 'golds-punch'],
  ['Sword_Attack', 0.55, 'arm', 'bat', 'golds-arm-bat'],
]);
const phone = await (await browser.newContext({ ...devices['iPhone 13'] })).newPage();
phone.on('pageerror', (e) => notes.errors.push('phone ' + e.message));
await phone.goto(url + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await phone.waitForFunction(() => !document.getElementById('start').disabled, null, { timeout: 180000 });
await phone.tap('#start');
await phone.waitForFunction(() => window.__dbg && window.__dbg.charViz, null, { timeout: 30000 });
await phone.evaluate(() => {
  const s = window.__game.state;
  const e = s.ents.find((e) => e.kind === 'npc' && e.crew === 'golds' && e.hp > 0);
  const p = s.ents.find((e) => e.kind === 'player');
  e.look = 0; e.moving = 0; e.x = p.x + 1.4; e.z = p.z;
});
await phone.waitForFunction(() => {
  const e = window.__game.state.ents.find((e) => e.crew === 'golds' && e.look === 0 && e.hp > 0);
  const g = e && window.__dbg.charViz.get(e.id);
  return g && g.userData.kit;
}, null, { timeout: 20000 });
notes.goldPhone = await phone.evaluate(() => {
  const e = window.__game.state.ents.find((e) => e.crew === 'golds' && e.look === 0 && e.hp > 0);
  const g = window.__dbg.charViz.get(e.id);
  let mesh = null; g.traverse((o) => { if (o.isSkinnedMesh) mesh = o; });
  const m = [].concat(mesh.material)[0];
  const woman = window.__game.state.ents.find((x) => x.crew === 'golds' && x.hp > 0 && x.look % 5 === 3);
  return { grip: g.userData.grip && g.userData.grip.kind, map: !!(m.map && m.map.image), bones: mesh.skeleton.bones.length, womanWouldBeKit: false, womanPresent: !!woman };
});
await phone.evaluate(() => {
  const e = window.__game.state.ents.find((e) => e.crew === 'golds' && e.look === 0 && e.hp > 0);
  e.moving = 0;
  const g = window.__dbg.charViz.get(e.id);
  const x = g.position.x, z = g.position.z;
  window.__camOv = { x: x + 1.6, y: 1.45, z: z + 2.4, lx: x, ly: 1.05, lz: z };
});
await phone.waitForTimeout(400);
await phone.screenshot({ path: `${dir}/golds-phone.png` });
await browser.close();
fs.writeFileSync(`${dir}/gold-shot-notes.json`, JSON.stringify(notes, null, 2));
console.log(JSON.stringify(notes, null, 2));
if (notes.errors.length) process.exitCode = 1;
