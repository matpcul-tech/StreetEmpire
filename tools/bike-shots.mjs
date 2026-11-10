// Motorcycle art and ride review: node tools/bike-shots.mjs <url> <dir>
// Shoots the parked bike, the rider seated (side and three quarter), a lean in a turn, and night lamps.
import { chromium } from 'playwright';
const [url, dir] = process.argv.slice(2);
const b = await chromium.launch({ ...(process.env.CHROME && { executablePath: process.env.CHROME }), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); p.setDefaultTimeout(180000);
const errors = []; p.on('pageerror', (e) => errors.push(String(e))); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
await p.waitForFunction(() => !document.getElementById('start').disabled, null, { timeout: 150000 });
await p.evaluate(() => document.getElementById('start').click()); await p.waitForTimeout(2500); // a real click can time out on software GL
const setup = (t) => p.evaluate((t) => {
  const g = window.__game, s = g.state, pl = s.ents.find((e) => e.kind === 'player');
  s.opening = { done: true, beat: 'done', ids: [] };
  for (const e of s.ents) if (e.kind === 'npc' || e.kind === 'ped' || e.kind === 'cop') { e.x += 400; }
  const bike = s.cars.filter((c) => c.type === 'cruiser').sort((a, b) => Math.hypot(a.x - pl.x, a.z - pl.z) - Math.hypot(b.x - pl.x, b.z - pl.z))[0];
  window.__bike = bike; window.__t = t;
  clearInterval(window.__hold); window.__hold = setInterval(() => { s.t = window.__t; pl.heat = 0; }, 16);
  return bike ? { n: s.cars.filter((c) => c.type === 'cruiser').length, d: Math.hypot(bike.x - pl.x, bike.z - pl.z) } : null;
}, t);
const cam = (side, back, up, ly = 0.8) => p.evaluate(({ side, back, up, ly }) => {
  clearInterval(window.__camHold);
  window.__camHold = setInterval(() => { const c = window.__bike, sn = Math.sin(c.ry), cs = Math.cos(c.ry); window.__camOv = { x: c.x + cs * side - sn * back, y: up, z: c.z - sn * side - cs * back, lx: c.x, ly, lz: c.z }; }, 8);
}, { side, back, up, ly });
console.log('bikes', JSON.stringify(await setup(424)));
await cam(-3.4, 0.3, 1.2); await p.waitForTimeout(1500); await p.screenshot({ path: `${dir}/bike-1-parked.png` });
// walk up and get on
await p.evaluate(() => { const s = window.__game.state, pl = s.ents.find((e) => e.kind === 'player'), c = window.__bike; pl.x = c.x - Math.cos(c.ry) * 1.2; pl.z = c.z + Math.sin(c.ry) * 1.2; window.__game.send({ type: 'car' }); });
await p.waitForTimeout(1200);
console.log('riding', await p.evaluate(() => window.__game.state.ents.find((e) => e.kind === 'player').car));
await cam(-3.2, 0.2, 1.3, 0.95); await p.waitForTimeout(800); await p.screenshot({ path: `${dir}/bike-2-rider-side.png` });
await cam(-2.2, -2.6, 1.5, 0.95); await p.waitForTimeout(800); await p.screenshot({ path: `${dir}/bike-3-rider-front.png` });
await cam(1.6, 3.2, 1.7, 0.95); await p.waitForTimeout(800); await p.screenshot({ path: `${dir}/bike-4-rider-rear.png` });
// ride: gas, then gas and right
await p.evaluate(() => { clearInterval(window.__camHold); window.__camOv = null; });
await p.keyboard.down('KeyW'); await p.waitForTimeout(1600);
await p.screenshot({ path: `${dir}/bike-5-chase-cam.png` });
await p.keyboard.down('KeyD'); await p.waitForTimeout(450);
await cam(0.4, -5.5, 1.3, 0.9); await p.waitForTimeout(250); await p.screenshot({ path: `${dir}/bike-6-lean.png` });
console.log('speed', await p.evaluate(() => [window.__bike.v, window.__bike.steer, window.__bike.hp]));
await p.keyboard.up('KeyD'); await p.keyboard.up('KeyW'); await p.keyboard.down('KeyS'); await p.waitForTimeout(1800); await p.keyboard.up('KeyS');
await p.evaluate(() => { window.__t = 95; }); await cam(-2.6, -3.4, 1.5, 0.9); await p.waitForTimeout(2500); await p.screenshot({ path: `${dir}/bike-7-night.png` });
await p.evaluate(() => window.__game.send({ type: 'car' })); await p.waitForTimeout(1200);
console.log('off', await p.evaluate(() => window.__game.state.ents.find((e) => e.kind === 'player').car));
await p.evaluate(() => { window.__t = 424; }); await cam(-3.4, 0.3, 1.2); await p.waitForTimeout(1500); await p.screenshot({ path: `${dir}/bike-8-off.png` });
console.log('errors', errors.length ? errors.slice(0, 8).join('\n') : 'none');
await b.close();
