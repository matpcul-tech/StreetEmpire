// Close-up character shots for art review: node tools/closeup.mjs <url> <out.png> [block]
import { chromium } from 'playwright';
const [url, out, mode] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 }); await p.waitForFunction(() => !document.getElementById('start').disabled, null, { timeout: 150000 });
await p.click('#start'); await p.waitForTimeout(2000);
await p.evaluate((mode) => {
  const g = window.__game, s = g.state, pl = s.ents.find((e) => e.kind === 'player');
  s.t = 424; pl.ry = 0;
  const crew = ['reds', 'blues', 'golds'].map((c) => s.ents.find((e) => e.kind === 'npc' && e.crew === c && e.hp > 0)).filter(Boolean);
  crew.forEach((e, i) => { e.x = pl.x + 1.3 + i * 1.3; e.z = pl.z; e.ry = 0; e.stun = 99; e.home = null; });
  if (mode === 'drive') {
    const c = s.cars.filter((c) => c.ai && !c.wrecked).sort((a, b) => Math.hypot(a.x - pl.x, a.z - pl.z) - Math.hypot(b.x - pl.x, b.z - pl.z))[0];
    window.__hold2 = setInterval(() => { const sn = Math.sin(c.ry), cs = Math.cos(c.ry); window.__camOv = { x: c.x + cs * 3.2 + sn * 1.2, y: 2.3, z: c.z - sn * 3.2 + cs * 1.2, lx: c.x, ly: 1.0, lz: c.z + cs * 0.3 }; }, 16);
    return;
  }
  if (mode === 'swing') window.__swing = 1;
  if (mode === 'weapons' || mode === 'swing') { ['bat', 'pistol', 'shotgun'].forEach((w, i) => crew[i] && (crew[i].weapon = w)); pl.weapon = 'knuckles'; }
  if (mode === 'cast') {
    const pick = [s.ents.find((e) => e.kind === 'cop'), s.ents.find((e) => e.kind === 'giver'), ...s.ents.filter((e) => e.kind === 'ped').slice(0, 3), ...s.ents.filter((e) => e.crew === 'neutral' && e.kind === 'npc').slice(0, 2)].filter(Boolean);
    if (!pick.some((e) => e.kind === 'cop')) { const c = s.ents.filter((e) => e.kind === 'ped')[5]; if (c) { c.kind = 'cop'; pick.unshift(c); } }
    crew.length = 0; crew.push(...pick);
  }
  if (mode === 'block') g.send({ type: 'block', on: true });
  window.__hold = setInterval(() => { crew.forEach((e, i) => { e.x = pl.x + 1.3 + i * 1.3; e.z = pl.z; e.ry = 0; e.stun = 99; e.moving = 0; if (window.__swing) e.swing = 0.2; }); }, 16);
  if (mode === 'face' || mode === 'side') { const sd = mode === 'side'; window.__camOv = { x: pl.x + (sd ? 0.9 : 0.15), y: 1.68, z: pl.z + (sd ? 0.3 : 0.9), lx: pl.x, ly: 1.62, lz: pl.z }; return; }
  if (mode === 'weapons' || mode === 'swing') { window.__camOv = { x: pl.x + 2.2, y: 1.3, z: pl.z + 3.6, lx: pl.x + 2.2, ly: 1.0, lz: pl.z }; return; }
  if (mode === 'cast') { window.__camOv = { x: pl.x + 5, y: 1.35, z: pl.z + 9, lx: pl.x + 5, ly: 0.95, lz: pl.z }; return; }
  window.__camOv = { x: pl.x + 1.9, y: 1.35, z: pl.z + 6, lx: pl.x + 1.9, ly: 0.95, lz: pl.z };
}, mode);
await p.waitForTimeout(2500);
console.log(await p.evaluate(() => [window.__game.state.t, document.getElementById('clock').innerText]));
await p.screenshot({ path: out }); await b.close();
