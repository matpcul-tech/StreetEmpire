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
  if (mode === 'block') g.send({ type: 'block', on: true });
  window.__hold = setInterval(() => { crew.forEach((e, i) => { e.x = pl.x + 1.3 + i * 1.3; e.z = pl.z; e.ry = 0; e.stun = 99; e.moving = 0; }); }, 16);
  window.__camOv = { x: pl.x + 1.9, y: 1.35, z: pl.z + 6, lx: pl.x + 1.9, ly: 0.95, lz: pl.z };
}, mode);
await p.waitForTimeout(2500);
console.log(await p.evaluate(() => [window.__game.state.t, document.getElementById('clock').innerText]));
await p.screenshot({ path: out }); await b.close();
