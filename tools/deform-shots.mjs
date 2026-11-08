// Renders the orange player against the old painted body for every game clip,
// plus phone idle, run, punch, and drive, and a side view of the sit-down.
// Headless frame time is recorded and is not a device result.
//   node tools/deform-shots.mjs http://127.0.0.1:5173 /opt/cursor/artifacts/orange-player
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
const [url, dir] = process.argv.slice(2);
fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const notes = { shots: [], errors: [] };

const CLIPS = [
  ['Idle_Loop', 0.5, 'both', null],
  ['Idle_Talking_Loop', 0.8, 'both', null],
  ['Walk_Loop', 0.45, 'both', null],
  ['Jog_Fwd_Loop', 0.35, 'both', null],
  ['Sprint_Loop', 0.22, 'both', null],
  ['Punch_Jab', 0.35, 'both', null],
  ['Punch_Cross', 0.42, 'both', null],
  ['Sword_Attack', 0.6, 'both', 'bat'],
  ['Pistol_Idle_Loop', 0.4, 'both', 'pistol'],
  ['Pistol_Shoot', 0.22, 'both', 'pistol'],
  ['Death01', 2.05, 'both', null],
  ['Hit_Chest', 0.16, 'both', null],
  ['Hit_Head', 0.2, 'both', null],
  ['Roll', 0.5, 'both', null],
  ['Jump_Start', 0.4, 'both', null],
  ['Jump_Loop', 0.5, 'both', null],
  ['Driving_Loop', 0.5, 'seat', null],
  ['Sitting_Idle_Loop', 0.5, 'seat', null],
];
const ARMS = [['Punch_Cross', 0.42, null], ['Punch_Jab', 0.35, null], ['Pistol_Idle_Loop', 0.4, 'pistol'], ['Sword_Attack', 0.6, 'bat'], ['Driving_Loop', 0.5, null]];

{
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(url + '/tools/pose-board.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.__board && window.__board.clips.length === 18, null, { timeout: 180000 });
  for (const [name, t, mode, weapon] of CLIPS) {
    await page.evaluate(([n, tt, m, w]) => window.__board.show(n, tt, m, w), [name, t, mode, weapon]);
    await page.waitForTimeout(80);
    const file = `${dir}/clip-${name}.png`;
    await page.screenshot({ path: file });
    notes.shots.push(file);
  }
  for (const [name, t, weapon] of ARMS) {
    await page.evaluate(([n, tt, w]) => window.__board.show(n, tt, 'arm', w), [name, t, weapon]);
    await page.waitForTimeout(80);
    const file = `${dir}/arm-${name}.png`;
    await page.screenshot({ path: file });
    notes.shots.push(file);
  }
  notes.errors.push(...errs);
  await page.close();
}

{
  const page = await (await browser.newContext({ ...devices['iPhone 13'] })).newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
  const ev = (f, a) => page.evaluate(f, a);
  const waitGame = async (sec) => { const t0 = await ev(() => window.__game.state.t); await page.waitForFunction((t) => window.__game.state.t >= t, t0 + sec, { timeout: 180000, polling: 200 }); };
  await page.goto(url + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => !document.getElementById('start').disabled, null, { timeout: 180000 });
  await page.tap('#start');
  await page.waitForFunction(() => { const p = window.__game.state.ents.find((e) => e.kind === 'player'); const g = window.__dbg.charViz.get(p.id); return g && g.userData.kit && g.userData.cur === 'Idle_Loop'; }, null, { timeout: 30000 });
  await page.screenshot({ path: `${dir}/phone-idle.png` });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 70, y: 640, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 70, y: 520, id: 1 }] });
  await page.tap('#bSprint').catch(() => {});
  await waitGame(0.45);
  const run = await ev(() => { const p = window.__game.state.ents.find((e) => e.kind === 'player'); const g = window.__dbg.charViz.get(p.id); return { clip: g.userData.cur, moving: p.moving }; });
  await page.screenshot({ path: `${dir}/phone-run.png` });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await ev(() => { const s = window.__game.state, p = s.ents.find((e) => e.kind === 'player'); const e = s.ents.find((e) => e.kind === 'npc' && e.hp > 0 && e.crew !== 'player'); e.x = p.x + Math.sin(p.ry) * 1.3; e.z = p.z + Math.cos(p.ry) * 1.3; });
  await page.tap('#bAttack');
  await waitGame(0.2);
  const punch = await ev(() => { const p = window.__game.state.ents.find((e) => e.kind === 'player'); return window.__dbg.charViz.get(p.id).userData.cur; });
  await page.screenshot({ path: `${dir}/phone-punch.png` });
  await ev(() => { const s = window.__game.state, p = s.ents.find((e) => e.kind === 'player'); const c = s.cars.find((c) => !c.wrecked && c.type === 'sedan'); p.x = c.x + 1.6; p.z = c.z; window.__car = c.id; window.__game.send({ type: 'car' }); });
  await page.waitForFunction(() => { const p = window.__game.state.ents.find((e) => e.kind === 'player'); const g = window.__dbg.charViz.get(p.id); return g && g.userData.cineAnim === 'Driving_Loop'; }, null, { timeout: 30000 });
  await ev(() => {
    const p = window.__game.state.ents.find((e) => e.kind === 'player');
    const g = window.__dbg.charViz.get(p.id);
    const car = window.__dbg.carViz.get(window.__car);
    const x = g.position.x, y = g.position.y, z = g.position.z, ry = car.rotation.y;
    window.__camOv = { x: x + Math.cos(ry) * 3.4, y: y + 1.15, z: z - Math.sin(ry) * 3.4, lx: x, ly: y + 0.85, lz: z };
  });
  await page.waitForTimeout(250);
  const seat = await ev(() => { const p = window.__game.state.ents.find((e) => e.kind === 'player'); const g = window.__dbg.charViz.get(p.id); return { cine: g.userData.cineAnim, y: +g.position.y.toFixed(2), visible: g.visible }; });
  await page.screenshot({ path: `${dir}/phone-seat.png` });
  await ev(() => { window.__camOv = null; });
  await page.waitForFunction(() => !window.__cine.active, null, { timeout: 30000 });
  await page.locator('#bGas').dispatchEvent('pointerdown');
  await waitGame(1.1);
  const drive = await ev(() => { const s = window.__game.state, p = s.ents.find((e) => e.kind === 'player'); const c = s.cars.find((c) => c.id === p.car); return { speed: c ? +c.v.toFixed(2) : null, type: c && c.type }; });
  await page.screenshot({ path: `${dir}/phone-drive.png` });
  await page.locator('#bGas').dispatchEvent('pointerup');
  const perf = await ev(() => window.__perf());
  notes.phone = { run, punch, seat, drive, headlessFrameMs: perf && +perf.frameMs.toFixed(1), headlessNote: 'Software rendering frame time. Not a phone qualification and not a pass.' };
  notes.errors.push(...errs);
  notes.shots.push(`${dir}/phone-idle.png`, `${dir}/phone-run.png`, `${dir}/phone-punch.png`, `${dir}/phone-seat.png`, `${dir}/phone-drive.png`);
  await page.close();
}

await browser.close();
fs.writeFileSync(`${dir}/deform-notes.json`, JSON.stringify(notes, null, 2));
console.log(JSON.stringify(notes.phone, null, 2));
console.log('errors', notes.errors);
console.log('shots', notes.shots.length);
if (notes.errors.length) process.exit(1);
