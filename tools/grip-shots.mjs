// Close-ups of the two installed characters' fists, plus the phone idle and the
// Red Kings crew member. Headless frames are not a phone pass.
//   node tools/grip-shots.mjs http://127.0.0.1:5173 /opt/cursor/artifacts
import { chromium, devices } from 'playwright';
import fs from 'node:fs';

const [url, dir] = process.argv.slice(2);
fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const notes = { errors: [] };

async function board(slot) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  page.on('pageerror', (e) => notes.errors.push(slot + ' ' + e.message));
  await page.goto(`${url}/tools/pose-board.html?slot=${slot}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction((s) => window.__board && window.__board.slot === s && window.__board.info && window.__board.info.map, slot, { timeout: 180000 });
  const info = await page.evaluate(() => window.__board.info);
  const shot = async (name, t, mode, weapon, file) => {
    await page.evaluate(([n, tt, m, w]) => window.__board.show(n, tt, m, w), [name, t, mode, weapon]);
    await page.waitForTimeout(80);
    await page.screenshot({ path: `${dir}/${file}.png` });
  };
  await page.close();
  return { info, shot, page: null };
}

{
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  page.on('pageerror', (e) => notes.errors.push('player ' + e.message));
  await page.goto(`${url}/tools/pose-board.html?slot=player`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.__board && window.__board.info.map, null, { timeout: 180000 });
  notes.player = await page.evaluate(() => window.__board.info);
  const shot = async (name, t, mode, weapon, file) => {
    await page.evaluate(([n, tt, m, w]) => window.__board.show(n, tt, m, w), [name, t, mode, weapon]);
    await page.waitForTimeout(80);
    await page.screenshot({ path: `${dir}/${file}.png` });
  };
  await shot('Punch_Cross', 0.42, 'both', null, 'comparison-punch');
  await shot('Punch_Cross', 0.42, 'arm', null, 'punch');
  await shot('Pistol_Idle_Loop', 0.4, 'arm', 'pistol', 'orange-arm-pistol');
  await shot('Pistol_Idle_Loop', 0.4, 'both', 'pistol', 'comparison-pistol');
  await shot('Sword_Attack', 0.55, 'arm', 'bat', 'orange-arm-bat');
  await shot('Sword_Attack', 0.55, 'both', 'bat', 'comparison-bat');
  await shot('Driving_Loop', 0.5, 'seat', null, 'drive');
  await shot('Driving_Loop', 0.5, 'both', null, 'comparison-drive');
  await shot('Idle_Loop', 0.5, 'both', null, 'comparison-idle');
  await page.close();
}

{
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  page.on('pageerror', (e) => notes.errors.push('reds ' + e.message));
  await page.goto(`${url}/tools/pose-board.html?slot=reds`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.__board && window.__board.slot === 'reds' && window.__board.info.map, null, { timeout: 180000 });
  notes.reds = await page.evaluate(() => {
    const g = window.__board.neu;
    let fingers = 0, generic = 0;
    g.traverse((o) => { if (/Index|Middle|Thumb|Ring|Pinky/.test(o.name)) fingers++; if (/^Bone_/.test(o.name)) generic++; });
    return { ...window.__board.info, fingers, generic, grip: g.userData.grip && g.userData.grip.kind };
  });
  const shot = async (name, t, mode, weapon, file) => {
    await page.evaluate(([n, tt, m, w]) => window.__board.show(n, tt, m, w), [name, t, mode, weapon]);
    await page.waitForTimeout(80);
    await page.screenshot({ path: `${dir}/${file}.png` });
  };
  await shot('Pistol_Idle_Loop', 0.4, 'arm', 'pistol', 'reds-arm-pistol');
  await shot('Sword_Attack', 0.55, 'arm', 'bat', 'reds-arm-bat');
  await shot('Punch_Cross', 0.42, 'arm', null, 'reds-arm-punch');
  await shot('Idle_Loop', 0.5, 'both', null, 'comparison-reds-idle');
  await shot('Driving_Loop', 0.5, 'seat', null, 'reds-drive');
  await page.close();
}

{
  const page = await (await browser.newContext({ ...devices['iPhone 13'] })).newPage();
  page.on('pageerror', (e) => notes.errors.push('phone ' + e.message));
  await page.goto(url + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => !document.getElementById('start').disabled, null, { timeout: 180000 });
  await page.tap('#start');
  await page.waitForFunction(() => {
    const p = window.__game.state.ents.find((e) => e.kind === 'player');
    const g = p && window.__dbg.charViz.get(p.id);
    return g && g.userData.kit && g.userData.cur === 'Idle_Loop';
  }, null, { timeout: 30000 });
  await page.evaluate(() => {
    const p = window.__game.state.ents.find((e) => e.kind === 'player');
    const g = window.__dbg.charViz.get(p.id);
    const x = g.position.x, z = g.position.z;
    window.__camOv = { x: x + 1.5, y: 1.35, z: z + 2.2, lx: x, ly: 1.0, lz: z };
  });
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${dir}/phone-idle.png` });
  await page.close();
}

{
  const game = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  game.on('pageerror', (e) => notes.errors.push('crew ' + e.message));
  await game.goto(url + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await game.waitForFunction(() => !document.getElementById('start').disabled, null, { timeout: 180000 });
  await game.click('#start');
  await game.waitForFunction(() => window.__dbg && window.__dbg.charViz, null, { timeout: 30000 });
  await game.evaluate(() => {
    const s = window.__game.state;
    const e = s.ents.find((e) => e.kind === 'npc' && e.crew === 'reds' && e.hp > 0);
    const p = s.ents.find((e) => e.kind === 'player');
    e.look = 0; e.x = p.x + 1.6; e.z = p.z;
  });
  await game.waitForFunction(() => {
    const e = window.__game.state.ents.find((e) => e.crew === 'reds' && e.look === 0 && e.hp > 0);
    const g = e && window.__dbg.charViz.get(e.id);
    return g && g.userData.kit;
  }, null, { timeout: 20000 });
  await game.evaluate(() => {
    const e = window.__game.state.ents.find((e) => e.crew === 'reds' && e.look === 0 && e.hp > 0);
    const g = window.__dbg.charViz.get(e.id);
    const x = g.position.x, z = g.position.z;
    window.__camOv = { x: x + 1.6, y: 1.25, z: z + 2.3, lx: x, ly: 0.95, lz: z };
  });
  await game.waitForTimeout(300);
  notes.crew = await game.evaluate(() => {
    const e = window.__game.state.ents.find((e) => e.crew === 'reds' && e.look === 0 && e.hp > 0);
    const g = window.__dbg.charViz.get(e.id);
    let mesh = null; g.traverse((o) => { if (o.isSkinnedMesh) mesh = o; });
    const m = [].concat(mesh.material)[0];
    return { kit: !!g.userData.kit, grip: g.userData.grip && g.userData.grip.kind, map: !!(m.map && m.map.image), bones: mesh.skeleton.bones.length };
  });
  await game.screenshot({ path: `${dir}/reds-crew-idle.png` });
  await game.close();
}

{
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  page.on('pageerror', (e) => notes.errors.push('blues ' + e.message));
  await page.goto(`${url}/tools/pose-board.html?slot=blues`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.__board && window.__board.slot === 'blues' && window.__board.info.map, null, { timeout: 120000 });
  notes.blues = await page.evaluate(() => {
    const g = window.__board.neu;
    window.__board.show('Pistol_Idle_Loop', 0.4, 'arm', 'pistol');
    const chain = []; let o = g.userData.gun; while (o) { chain.push(o.name || o.type); o = o.parent; }
    let fingers = 0; g.traverse((x) => { if (/RightHandIndex1|RightHandMiddle1|RightHandThumb1/.test(x.name)) fingers++; });
    return { ...window.__board.info, grip: g.userData.grip && g.userData.grip.kind, fingers, gunChain: chain.slice(0, 6) };
  });
  const shot = async (name, t, mode, weapon, file) => {
    await page.evaluate(([n, tt, m, w]) => window.__board.show(n, tt, m, w), [name, t, mode, weapon]);
    await page.waitForTimeout(80);
    await page.screenshot({ path: `${dir}/${file}.png` });
  };
  await shot('Pistol_Idle_Loop', 0.4, 'arm', 'pistol', 'blues-arm-pistol');
  await shot('Sword_Attack', 0.55, 'arm', 'bat', 'blues-arm-bat');
  await shot('Punch_Cross', 0.42, 'arm', null, 'blues-punch');
  await shot('Idle_Loop', 0.5, 'both', null, 'comparison-blues-idle');
  await shot('Driving_Loop', 0.5, 'seat', null, 'blues-drive');
  await page.close();
}

{
  const phone = await (await browser.newContext({ ...devices['iPhone 13'] })).newPage();
  phone.on('pageerror', (e) => notes.errors.push('blues-phone ' + e.message));
  await phone.goto(url + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await phone.waitForFunction(() => !document.getElementById('start').disabled, null, { timeout: 180000 });
  await phone.tap('#start');
  await phone.waitForFunction(() => window.__dbg && window.__dbg.charViz, null, { timeout: 30000 });
  notes.bluesPhone = await phone.evaluate(() => {
    const s = window.__game.state;
    const e = s.ents.find((e) => e.kind === 'npc' && e.crew === 'blues' && e.hp > 0);
    const p = s.ents.find((e) => e.kind === 'player');
    e.look = 0; e.x = p.x + 1.5; e.z = p.z;
    const woman = s.ents.find((e) => e.kind === 'npc' && e.crew === 'blues' && e.hp > 0 && e !== window.__game.state.ents.find((x) => x.crew === 'blues' && x.look === 0));
    return { id: e.id };
  });
  await phone.waitForFunction(() => {
    const e = window.__game.state.ents.find((e) => e.crew === 'blues' && e.look === 0 && e.hp > 0);
    const g = e && window.__dbg.charViz.get(e.id);
    return g && g.userData.kit;
  }, null, { timeout: 20000 });
  notes.bluesMale = await phone.evaluate(() => {
    const e = window.__game.state.ents.find((e) => e.crew === 'blues' && e.look === 0 && e.hp > 0);
    const g = window.__dbg.charViz.get(e.id);
    let mesh = null; g.traverse((o) => { if (o.isSkinnedMesh) mesh = o; });
    const m = [].concat(mesh.material)[0];
    const y = (re) => { let b = null; g.traverse((o) => { if (o.isBone && re.test(o.name)) b = o; }); b.updateWorldMatrix(true, false); return b.matrixWorld.elements[13]; };
    const woman = window.__game.state.ents.find((x) => x.crew === 'blues' && x.hp > 0 && x.look % 5 === 3);
    if (woman) woman.x = e.x + 1.2;
    return { kit: true, grip: g.userData.grip && g.userData.grip.kind, map: !!(m.map && m.map.image), bones: mesh.skeleton.bones.length, head: +y(/mixamorigHead$/).toFixed(3), foot: +y(/RightFoot|foot_r/).toFixed(3), womanId: woman && woman.id };
  });
  await phone.evaluate(() => {
    const e = window.__game.state.ents.find((e) => e.crew === 'blues' && e.look === 0 && e.hp > 0);
    const g = window.__dbg.charViz.get(e.id);
    const x = g.position.x, z = g.position.z;
    window.__camOv = { x: x + 1.5, y: 1.3, z: z + 2.2, lx: x, ly: 0.95, lz: z };
  });
  await phone.waitForTimeout(300);
  await phone.screenshot({ path: `${dir}/blues-phone.png` });
  if (notes.bluesMale && notes.bluesMale.womanId) {
    await phone.waitForFunction((id) => {
      const g = window.__dbg.charViz.get(id);
      return g && !g.userData.kit;
    }, notes.bluesMale.womanId, { timeout: 10000 }).catch(() => null);
    notes.bluesWoman = await phone.evaluate((id) => {
      const g = window.__dbg.charViz.get(id);
      return { found: !!g, kit: !!(g && g.userData.kit) };
    }, notes.bluesMale.womanId);
  }
  await phone.evaluate(() => { window.__camOv = null; });
  await phone.close();
}

await browser.close();
fs.writeFileSync(`${dir}/grip-shot-notes.json`, JSON.stringify(notes, null, 2));
console.log(JSON.stringify(notes, null, 2));
if (notes.errors.length) process.exitCode = 1;
