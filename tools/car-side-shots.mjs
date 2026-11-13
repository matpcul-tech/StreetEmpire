// Driver side check: node tools/car-side-shots.mjs <url> <outPrefix>
// A traffic car with its driver seen from behind and from the front, then the player getting into a parked
// car, held at the open door and seen from the front. Traffic keeps right, so the driver belongs on the left.
import { chromium } from 'playwright';
const [url, out] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto(url + '?nointro&new&pin', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => !document.getElementById('start').disabled, null, { timeout: 150000 });
await page.click('#start'); await page.waitForTimeout(2500);
const type = await page.evaluate(() => { const s = window.__game.state, p = s.ents.find((e) => e.kind === 'player'); const c = s.cars.find((c) => c.ai && !c.wrecked && c.type !== 'bike'); if (!c) return 'no ai car'; p.x = c.x - Math.sin(c.ry) * 6; p.z = c.z - Math.cos(c.ry) * 6; window.__c = c.id; window.__hold = setInterval(() => { c.v = 0; c.x = p.x + Math.sin(c.ry) * 6; c.z = p.z + Math.cos(c.ry) * 6; s.t = 400; }, 30); window.__camOv = { x: c.x - Math.sin(c.ry) * 7, y: 2.2, z: c.z - Math.cos(c.ry) * 7, lx: c.x, ly: 1.0, lz: c.z }; return c.type; });
console.log('traffic car', type);
await page.waitForTimeout(3000);
await page.screenshot({ path: `${out}-traffic-behind.png` });
await page.evaluate(() => { const s = window.__game.state, c = s.cars.find((c) => c.id === window.__c); window.__camOv = { x: c.x + Math.sin(c.ry) * 7, y: 1.6, z: c.z + Math.cos(c.ry) * 7, lx: c.x, ly: 1.0, lz: c.z }; });
await page.waitForTimeout(2000);
await page.screenshot({ path: `${out}-traffic-front.png` });
// the player walks up to a parked car and gets in: hold the moment at the open door, seen from the front
await page.evaluate(() => { clearInterval(window.__hold); const s = window.__game.state, p = s.ents.find((e) => e.kind === 'player'); const c = s.cars.find((c) => !c.driver && !c.ai && !c.wrecked && c.type !== 'bike'); p.x = c.x - Math.sin(c.ry) * 4; p.z = c.z - Math.cos(c.ry) * 4; window.__c = c.id; window.__camOv = { x: c.x + Math.sin(c.ry) * 7, y: 1.8, z: c.z + Math.cos(c.ry) * 7, lx: c.x, ly: 1.0, lz: c.z }; window.__game.send({ type: 'car' }); });
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}-enter-front.png` });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}-seated-front.png` });
await browser.close();
