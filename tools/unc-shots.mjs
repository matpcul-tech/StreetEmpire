// Unc close-ups: idle, fist, pistol, seated drive, knockdown, and the street.
//   node tools/unc-shots.mjs
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
const url = process.argv[2] || 'http://127.0.0.1:5174';
const dir = process.argv[3] || '/opt/cursor/artifacts';
fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const notes = { errors: [] };
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
page.on('pageerror', (e) => notes.errors.push(e.message));
await page.goto(`${url}/tools/pose-board.html?slot=unc`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => window.__board && window.__board.slot === 'unc' && window.__board.info.map, null, { timeout: 120000 });
notes.board = await page.evaluate(() => {
  const g = window.__board.neu;
  window.__board.show('Pistol_Idle_Loop', 0.4, 'arm', 'pistol');
  const chain = []; let o = g.userData.gun; while (o) { chain.push(o.name || o.type); o = o.parent; }
  return { ...window.__board.info, grip: g.userData.grip && g.userData.grip.kind, gun: chain.slice(0, 5), clips: window.__board.clips.length };
});
const shots = [
  ['Idle_Loop', 0.5, 'both', null, 'comparison-unc-idle'],
  ['Idle_Loop', 0.5, 'neu', null, 'unc-body'],
  ['Punch_Cross', 0.42, 'arm', null, 'unc-punch'],
  ['Pistol_Idle_Loop', 0.4, 'arm', 'pistol', 'unc-arm-pistol'],
  ['Driving_Loop', 0.5, 'seat', null, 'unc-drive'],
  ['Death01', 2.05, 'both', null, 'unc-death'],
  ['Hit_Head', 0.2, 'neu', null, 'unc-hit'],
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
notes.street = await phone.evaluate(() => {
  const e = window.__game.state.ents.find((e) => e.kind === 'giver');
  const g = e && window.__dbg.charViz.get(e.id);
  if (!g || !g.userData.kit) return { kit: false };
  let mesh = null; g.traverse((o) => { if (o.isSkinnedMesh) mesh = o; });
  const m = [].concat(mesh.material)[0];
  return { kit: true, grip: g.userData.grip && g.userData.grip.kind, map: !!(m.map && m.map.image), bones: mesh.skeleton.bones.length, name: e.name };
});
await phone.evaluate(() => {
  const e = window.__game.state.ents.find((e) => e.kind === 'giver');
  const g = window.__dbg.charViz.get(e.id);
  const x = g.position.x, z = g.position.z;
  window.__camOv = { x: x + 1.8, y: 1.35, z: z + 2.2, lx: x, ly: 0.95, lz: z };
});
await phone.waitForTimeout(400);
await phone.screenshot({ path: `${dir}/unc-street.png` });
await browser.close();
fs.writeFileSync(`${dir}/unc-shot-notes.json`, JSON.stringify(notes, null, 2));
console.log(JSON.stringify(notes, null, 2));
if (notes.errors.length || !notes.street.kit || !notes.street.map) process.exitCode = 1;
