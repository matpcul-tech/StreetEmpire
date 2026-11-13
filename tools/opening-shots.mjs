// Opening cinematic review shots on a phone: node tools/opening-shots.mjs <url> <dir>   (WIDE=1 for landscape)
// Starts a new game, then holds each of the opening's five shots at its start and its end and takes a frame of each.
import { chromium, devices } from 'playwright';
const [url, dir] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
const page = await (await browser.newContext(process.env.WIDE ? { ...devices['Pixel 7 landscape'] } : { ...devices['Pixel 7'] })).newPage();
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => !document.getElementById('start').disabled && window.__dbg && window.__dbg.charViz.size > 0 && window.__cine, null, { timeout: 400000, polling: 1000 });
await page.evaluate(() => document.getElementById('start').click());
await page.waitForFunction(() => document.body.classList.contains('cine-bars'), null, { timeout: 400000, polling: 500 });
for (const [n, k] of [[0, 0.1], [0, 0.9], [1, 0.1], [1, 0.9], [2, 0.1], [2, 0.9], [3, 0.1], [3, 0.9], [4, 0.1], [4, 0.45], [4, 0.8]]) {
  await page.evaluate(([n, k]) => { clearInterval(window.__hold); window.__hold = setInterval(() => window.__cine.openShot(n, k), 30); window.__cine.openShot(n, k); }, [n, k]);
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${dir}/open-${process.env.WIDE ? 'wide' : 'tall'}-${n}-${String(k).replace('.', '')}.png`, timeout: 180000 });
}
await browser.close();
if (errors.length) { console.log('ERRORS\n' + errors.join('\n')); process.exitCode = 1; }
