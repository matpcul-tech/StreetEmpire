// End to end check of the installed orange player: textures, walk, run, fight,
// car entry and drive. Headless frames are not a phone. Run against the dev server:
//   node tools/player-shot.mjs http://127.0.0.1:5173 /opt/cursor/artifacts/orange-player
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
const [url, dir] = process.argv.slice(2);
if (!url || !dir) { console.error('usage: node tools/player-shot.mjs <url> <dir>'); process.exit(1); }
fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const out = [];
const fail = [];

async function shot(page, name) {
  const file = `${dir}/${name}.png`;
  await page.screenshot({ path: file });
  return file;
}

async function game(dev, opts) {
  const page = await (await browser.newContext(opts)).newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  const ev = (f, a) => page.evaluate(f, a);
  const waitGame = async (sec) => { const t0 = await ev(() => window.__game.state.t); await page.waitForFunction((t) => window.__game.state.t >= t, t0 + sec, { timeout: 180000, polling: 200 }); };
  await page.goto(url + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => !document.getElementById('start').disabled, null, { timeout: 180000 });
  if (dev === 'phone') await page.tap('#start'); else await page.click('#start');
  await page.waitForFunction(() => {
    const p = window.__game && window.__game.state.ents.find((e) => e.kind === 'player');
    const g = p && window.__dbg.charViz.get(p.id);
    return g && g.userData.kit;
  }, null, { timeout: 30000 });
  const info = await ev(() => {
    const p = window.__game.state.ents.find((e) => e.kind === 'player');
    const g = window.__dbg.charViz.get(p.id);
    let mesh = null; g.traverse((o) => { if (o.isSkinnedMesh) mesh = o; });
    const m = [].concat(mesh.material)[0];
    const names = []; g.traverse((o) => { if (o.name === 'hand_r' || o.name === 'Head' || o.name === 'neck_01' || o.name === 'pelvis') names.push(o.name); });
    return { kit: !!g.userData.kit, clip: g.userData.cur, map: !!(m.map && m.map.image), normal: !!m.normalMap, rough: !!m.roughnessMap, key: m.customProgramCacheKey ? m.customProgramCacheKey() : '', names, tris: (mesh.geometry.index ? mesh.geometry.index.count : mesh.geometry.attributes.position.count) / 3 };
  });
  await shot(page, `${dev}-idle`);
  const footY = () => ev(() => {
    const p = window.__game.state.ents.find((e) => e.kind === 'player');
    const g = window.__dbg.charViz.get(p.id);
    let mesh = null; g.traverse((o) => { if (o.isSkinnedMesh) mesh = o; });
    mesh.skeleton.update();
    const bone = mesh.skeleton.bones.find((b) => /RightFoot|foot_r/.test(b.name));
    bone.updateMatrixWorld(true);
    return { clip: g.userData.cur, y: bone.matrixWorld.elements[13] };
  });
  if (dev === 'phone') {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 90, y: 600, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 90, y: 520, id: 1 }] });
    await page.waitForTimeout(700);
    const a = await footY();
    await page.waitForTimeout(500);
    const b = await footY();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await shot(page, `${dev}-walk`);
    out.push({ dev, step: 'walk', a, b, moved: Math.abs(b.y - a.y) });
  } else {
    await page.keyboard.down('KeyW');
    await waitGame(0.35);
    const a = await footY();
    await waitGame(0.45);
    const b = await footY();
    await shot(page, `${dev}-walk`);
    await page.keyboard.down('ShiftLeft');
    await waitGame(0.4);
    const sprint = await ev(() => { const p = window.__game.state.ents.find((e) => e.kind === 'player'); const g = window.__dbg.charViz.get(p.id); return { clip: g.userData.cur, moving: p.moving }; });
    await shot(page, `${dev}-run`);
    await page.keyboard.up('ShiftLeft'); await page.keyboard.up('KeyW');
    out.push({ dev, step: 'walk', a, b, footDelta: Math.abs(b.y - a.y), sprint });
  }
  // fight: put a rival in front and swing
  await ev(() => {
    const s = window.__game.state, p = s.ents.find((e) => e.kind === 'player');
    const e = s.ents.find((e) => e.kind === 'npc' && e.hp > 0 && e.crew !== 'player');
    e.x = p.x + Math.sin(p.ry) * 1.3; e.z = p.z + Math.cos(p.ry) * 1.3; window.__tgt = e.id; window.__hp0 = e.hp;
  });
  if (dev === 'phone') await page.tap('#bAttack'); else await page.keyboard.press('KeyF');
  await waitGame(0.25);
  const fight = await ev(() => { const p = window.__game.state.ents.find((e) => e.kind === 'player'); const g = window.__dbg.charViz.get(p.id); const t = window.__game.state.ents.find((e) => e.id === window.__tgt); return { clip: g.userData.cur, hp0: window.__hp0, hp1: t.hp }; });
  await shot(page, `${dev}-fight`);
  out.push({ dev, step: 'fight', fight });
  // pistol in the retargeted hand, then put it away so the car test is on foot
  await ev(() => { const p = window.__game.state.ents.find((e) => e.kind === 'player'); p.weapon = 'pistol'; p.ammo = 8; p.swing = 0; });
  await waitGame(0.3);
  const gun = await ev(() => { const p = window.__game.state.ents.find((e) => e.kind === 'player'); const g = window.__dbg.charViz.get(p.id); return { clip: g.userData.cur, gun: g.userData.gun.visible, parent: g.userData.gun.parent && g.userData.gun.parent.parent && g.userData.gun.parent.parent.name }; });
  await shot(page, `${dev}-pistol`);
  await ev(() => { const p = window.__game.state.ents.find((e) => e.kind === 'player'); p.weapon = 'fists'; });
  out.push({ dev, step: 'pistol', gun });
  // car entry: screenshot while the driving clip is on, then drive
  await ev(() => { const s = window.__game.state, p = s.ents.find((e) => e.kind === 'player'); const c = s.cars.find((c) => !c.wrecked && c.type !== 'police'); p.x = c.x + 1.6; p.z = c.z; window.__game.send({ type: 'car' }); });
  await page.waitForFunction(() => { const p = window.__game.state.ents.find((e) => e.kind === 'player'); const g = window.__dbg.charViz.get(p.id); return g && (g.userData.cur === 'Driving_Loop' || g.userData.cineAnim === 'Driving_Loop'); }, null, { timeout: 20000 }).catch(() => null);
  const entry = await ev(() => { const p = window.__game.state.ents.find((e) => e.kind === 'player'); const g = window.__dbg.charViz.get(p.id); return { car: p.car, clip: g && g.userData.cur, cine: g && g.userData.cineAnim, cineOn: window.__cine.active }; });
  await shot(page, `${dev}-entry`);
  await page.waitForFunction(() => !window.__cine.active, null, { timeout: 20000 }).catch(() => null);
  if (dev === 'phone') { await page.locator('#bGas').dispatchEvent('pointerdown'); await waitGame(1.2); await page.locator('#bGas').dispatchEvent('pointerup'); }
  else { await page.keyboard.down('KeyW'); await waitGame(1.2); await page.keyboard.up('KeyW'); }
  const drive = await ev(() => { const s = window.__game.state, p = s.ents.find((e) => e.kind === 'player'); const c = s.cars.find((c) => c.id === p.car); return { car: p.car, type: c && c.type, speed: c ? +c.v.toFixed(2) : null }; });
  await shot(page, `${dev}-drive`);
  const perf = await ev(() => window.__perf());
  await shot(page, `${dev}-perf`);
  out.push({ dev, step: 'drive', info, entry, drive, perf, errors: errs });
  if (!info.kit) fail.push(dev + ' player is not the kit mesh');
  if (!info.map) fail.push(dev + ' albedo missing');
  if (info.key !== 'kitchar') fail.push(dev + ' material is ' + info.key + ' (paint shader would hide the texture)');
  if (dev === 'desktop' && !info.normal) fail.push('desktop dropped the normal map');
  if (dev === 'phone' && info.normal) fail.push('phone kept the normal map');
  if (info.tris < 14000) fail.push(dev + ' triangle count ' + info.tris);
  for (const n of ['hand_r', 'Head', 'neck_01', 'pelvis']) if (!info.names.includes(n)) fail.push(dev + ' missing attachment ' + n);
  const walk = out.filter((x) => x.dev === dev && x.step === 'walk')[0];
  if (dev === 'desktop' && !(walk.footDelta > 0.02)) fail.push('walk foot did not move ' + walk.footDelta);
  if (dev === 'desktop' && walk.sprint.clip !== 'Sprint_Loop') fail.push('run clip ' + walk.sprint.clip);
  if (!(fight.clip || '').startsWith('Punch')) fail.push(dev + ' fight clip ' + fight.clip);
  if (!gun.gun) fail.push(dev + ' pistol not parented visible');
  if (!entry.car) fail.push(dev + ' did not enter a car');
  if (entry.clip !== 'Driving_Loop' && entry.cine !== 'Driving_Loop') fail.push(dev + ' entry clip ' + entry.clip + ' ' + entry.cine);
  if (!(drive.speed > 2)) fail.push(dev + ' drive speed ' + drive.speed);
  if (errs.length) fail.push(dev + ' page errors ' + errs.join(' | '));
  await page.close();
}

await game('desktop', { viewport: { width: 1280, height: 720 } });
await game('phone', { ...devices['iPhone 13'] });

// kit viewer: front of the textured mesh on the game clips
{
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(url + '/kit.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForSelector('#characters button.slot', { timeout: 180000 });
  await page.locator('#characters button.slot', { hasText: 'player.glb' }).click();
  await page.waitForSelector('#anims.show button', { timeout: 60000 });
  for (const label of ['Idle', 'Walk', 'Run', 'Punch', 'Drive']) {
    await page.locator('#anims button', { hasText: label }).click();
    await page.waitForTimeout(500);
    await shot(page, `kit-${label.toLowerCase()}`);
  }
  const stats = await page.locator('#stats').innerText();
  out.push({ step: 'kit', stats, errors: errs });
  if (errs.length) fail.push('kit page errors ' + errs.join(' | '));
  if (!/14,747|14747/.test(stats)) fail.push('kit viewer triangles: ' + stats.replace(/\n/g, ' '));
  await page.close();
}

await browser.close();
fs.writeFileSync(`${dir}/notes.json`, JSON.stringify({ fail, out }, null, 2));
console.log(JSON.stringify({ fail, steps: out.map((x) => ({ dev: x.dev, step: x.step, ...x })) }, null, 2));
if (fail.length) process.exit(1);
