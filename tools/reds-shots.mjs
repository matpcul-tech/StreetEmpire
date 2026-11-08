// Renders the installed Red Kings man against the painted Red Kings body, and checks
// that a reds crew member in the game uses that mesh. Headless frame time is not a device result.
//   node tools/reds-shots.mjs http://127.0.0.1:5173 /opt/cursor/artifacts/orange-player
import { chromium } from 'playwright';
import fs from 'node:fs';
const [url, dir] = process.argv.slice(2);
fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const notes = { errors: [] };
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
page.on('pageerror', (e) => notes.errors.push(String(e)));
await page.goto(url + '/tools/pose-board.html?slot=reds', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => window.__board && window.__board.slot === 'reds' && window.__board.info.map, null, { timeout: 180000 });
notes.board = await page.evaluate(() => {
  const g = window.__board.neu;
  let hand = null, fingers = 0; g.traverse((o) => { if (o.name === 'hand_r' || o.name === 'mixamorigRightHand') hand = o.name; if (/Index|Middle|Thumb|Ring|Pinky/.test(o.name)) fingers++; });
  return { ...window.__board.info, hand, fingers };
});
const shots = [
  ['Idle_Loop', 0.5, 'both', null, 'reds-idle'],
  ['Walk_Loop', 0.45, 'both', null, 'reds-walk'],
  ['Sprint_Loop', 0.22, 'both', null, 'reds-run'],
  ['Punch_Cross', 0.42, 'both', null, 'reds-punch'],
  ['Punch_Jab', 0.35, 'arm', null, 'reds-arm-jab'],
  ['Sword_Attack', 0.6, 'arm', 'bat', 'reds-arm-bat'],
  ['Pistol_Idle_Loop', 0.4, 'arm', 'pistol', 'reds-arm-pistol'],
  ['Death01', 2.05, 'both', null, 'reds-death'],
  ['Driving_Loop', 0.5, 'seat', null, 'reds-drive'],
  ['Hit_Chest', 0.16, 'both', null, 'reds-hit'],
];
for (const [name, t, mode, weapon, file] of shots) {
  await page.evaluate(([n, tt, m, w]) => window.__board.show(n, tt, m, w), [name, t, mode, weapon]);
  await page.waitForTimeout(60);
  await page.screenshot({ path: `${dir}/${file}.png` });
}
notes.weapon = await page.evaluate(() => {
  const g = window.__board.neu, u = g.userData;
  const chain = []; let o = u.gun; while (o) { chain.push(o.name); o = o.parent; }
  return { gun: u.gun.visible, bat: u.bat.visible, chain };
});
await page.close();

const game = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
game.on('pageerror', (e) => notes.errors.push(String(e)));
await game.goto(url + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await game.waitForFunction(() => !document.getElementById('start').disabled, null, { timeout: 180000 });
await game.click('#start');
await game.waitForFunction(() => window.__dbg && window.__dbg.charViz, null, { timeout: 30000 });
notes.crew = await game.evaluate(() => {
  const s = window.__game.state;
  let e = s.ents.find((e) => e.kind === 'npc' && e.crew === 'reds' && e.hp > 0);
  if (!e) return { found: false };
  e.look = 0; e.x = s.ents.find((p) => p.kind === 'player').x + 2; e.z = s.ents.find((p) => p.kind === 'player').z;
  return { found: true, id: e.id };
});
await game.waitForFunction(() => {
  const s = window.__game.state, e = s.ents.find((e) => e.crew === 'reds' && e.look === 0 && e.hp > 0);
  const g = e && window.__dbg.charViz.get(e.id);
  return g && g.userData.kit;
}, null, { timeout: 20000 });
notes.male = await game.evaluate(() => {
  const e = window.__game.state.ents.find((e) => e.crew === 'reds' && e.look === 0 && e.hp > 0);
  const g = window.__dbg.charViz.get(e.id);
  let mesh = null; g.traverse((o) => { if (o.isSkinnedMesh) mesh = o; });
  const m = [].concat(mesh.material)[0];
  return { model: g.userData.model, key: m.customProgramCacheKey(), map: !!(m.map && m.map.image), bones: mesh.skeleton.bones.length };
});
// height from bone span, independent of the raycaster placeholder
notes.span = await game.evaluate(() => {
  const e = window.__game.state.ents.find((e) => e.crew === 'reds' && e.look === 0 && e.hp > 0);
  const g = window.__dbg.charViz.get(e.id);
  const y = (re) => { let b = null; g.traverse((o) => { if (o.isBone && re.test(o.name)) b = o; }); b.updateMatrixWorld(true); return b.matrixWorld.elements[13]; };
  return { head: +y(/mixamorigHead$/).toFixed(3), foot: +y(/RightFoot|foot_r/).toFixed(3) };
});
await game.evaluate(() => {
  const e = window.__game.state.ents.find((e) => e.crew === 'reds' && e.look === 0 && e.hp > 0);
  const g = window.__dbg.charViz.get(e.id);
  const x = g.position.x, z = g.position.z;
  window.__camOv = { x: x + 2.2, y: 1.35, z: z + 2.4, lx: x, ly: 0.95, lz: z };
});
await game.waitForTimeout(300);
await game.screenshot({ path: `${dir}/reds-crew-idle.png` });
await game.evaluate(() => { const e = window.__game.state.ents.find((e) => e.crew === 'reds' && e.look === 0); e.moving = 1.4; e.hp = 80; });
await game.waitForTimeout(400);
await game.screenshot({ path: `${dir}/reds-crew-run.png` });
await game.evaluate(() => { const e = window.__game.state.ents.find((e) => e.crew === 'reds' && e.look === 0); e.moving = 0; e.weapon = 'bat'; e.swing = 0.45; });
await game.waitForTimeout(250);
notes.melee = await game.evaluate(() => { const e = window.__game.state.ents.find((e) => e.crew === 'reds' && e.look === 0); const g = window.__dbg.charViz.get(e.id); return { clip: g.userData.cur, bat: g.userData.bat.visible }; });
await game.screenshot({ path: `${dir}/reds-crew-bat.png` });
await game.evaluate(() => { const e = window.__game.state.ents.find((e) => e.crew === 'reds' && e.look === 0); e.swing = 0; e.weapon = 'fists'; e.hp = 0; });
await game.waitForTimeout(400);
notes.death = await game.evaluate(() => { const e = window.__game.state.ents.find((e) => e.crew === 'reds' && e.look === 0); const g = window.__dbg.charViz.get(e.id); return { clip: g.userData.cur, hp: e.hp }; });
await game.screenshot({ path: `${dir}/reds-crew-death.png` });
await game.evaluate(() => { window.__camOv = null; const e = window.__game.state.ents.find((e) => e.crew === 'reds' && e.hp <= 0 && e.look === 0); if (e) e.look = 3; });
await game.waitForFunction(() => {
  const e = window.__game.state.ents.find((e) => e.crew === 'reds' && e.look === 3);
  const g = e && window.__dbg.charViz.get(e.id);
  return g && !g.userData.kit;
}, null, { timeout: 10000 }).catch(() => null);
notes.female = await game.evaluate(() => {
  const e = window.__game.state.ents.find((e) => e.crew === 'reds' && e.look === 3);
  const g = e && window.__dbg.charViz.get(e.id);
  return g ? { kit: !!g.userData.kit, model: g.userData.model } : { missing: true };
});
await game.close();
await browser.close();
fs.writeFileSync(`${dir}/reds-notes.json`, JSON.stringify(notes, null, 2));
console.log(JSON.stringify(notes, null, 2));
if (notes.errors.length) process.exit(1);
