// Title screen review shots on a phone in portrait: node tools/title-shots.mjs <url> <dir> [weapon]
// The four title camera shots, with the given weapon in the save (pistol by default; the title puts it away). WIDE=1 for landscape.
import { chromium, devices } from 'playwright';
const [url, dir, weapon = 'pistol'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
const page = await (await browser.newContext(process.env.WIDE ? { ...devices['Pixel 7 landscape'] } : { ...devices['Pixel 7'] })).newPage();
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => !document.getElementById('start').disabled && window.__dbg && window.__dbg.charViz.size > 0 && window.__cine, null, { timeout: 400000, polling: 1000 });
await page.evaluate((w) => { const s = window.__game.state, p = s.ents.find((e) => e.kind === 'player'); p.weapon = w; p.weapons = [...new Set([...(p.weapons || []), w])]; }, weapon);
for (const [n, k] of [[0, 0.2], [0, 0.8], [1, 0.5], [2, 0.5], [3, 0.4]]) {
  await page.evaluate(([n, k]) => { clearInterval(window.__hold); window.__hold = setInterval(() => window.__cine.titleShot(n, k), 50); window.__cine.titleShot(n, k); }, [n, k]);
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${dir}/title-${process.env.WIDE ? 'wide' : 'tall'}-${n}-${String(k).replace('.', '')}.png`, timeout: 180000 });
}
console.log(JSON.stringify(await page.evaluate(() => ({ perf: window.__perf(), ver: (document.getElementById('ver') || {}).textContent }))));
await browser.close();
if (errors.length) { console.log('ERRORS\n' + errors.join('\n')); process.exitCode = 1; }
