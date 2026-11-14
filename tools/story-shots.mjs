// Story clip check (v0.16): node tools/story-shots.mjs <url> <dir>   (WIDE=1 landscape phone, DESK=1 desktop)
// New game: Unc's welcome plays over a paused sim, then the opening runs. Again with a tap: the clip skips.
// Then the win is forced: the rooftop plays and the end card comes up after it.
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';
const [url, dir] = process.argv.slice(2); mkdirSync(dir, { recursive: true });
const tag = process.env.DESK ? 'desk' : process.env.WIDE ? 'wide' : 'tall';
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctxOpt = process.env.DESK ? { viewport: { width: 1280, height: 720 } } : process.env.WIDE ? { ...devices['Pixel 7 landscape'] } : { ...devices['Pixel 7'] };
const errors = [], out = {};
async function fresh() {
  const page = await (await browser.newContext(ctxOpt)).newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(url + (url.includes('?') ? '&' : '?') + 'new', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => !document.getElementById('start').disabled && window.__dbg && window.__dbg.charViz.size > 0, null, { timeout: 400000, polling: 1000 });
  return page;
}
const vstate = (page) => page.evaluate(() => { const b = document.getElementById('vclip'), v = b && b.querySelector('video'); return { box: !!b, on: !!b && b.classList.contains('on'), t: v ? v.currentTime : -1, src: v ? v.currentSrc.split('/').pop() : '', muted: v ? v.muted : null, active: window.__dbg.story.active, simT: window.__game.state ? window.__game.state.t : null }; });
// 1. new game, let it play through
{
  const page = await fresh();
  await page.evaluate(() => document.getElementById('start').click());
  await page.waitForFunction(() => { const b = document.getElementById('vclip'); return b && b.classList.contains('on') && b.querySelector('video').currentTime > 1.2; }, null, { timeout: 30000 });
  out.playing = await vstate(page); await page.screenshot({ path: `${dir}/${tag}-1-unc.png` });
  await page.waitForTimeout(1200); out.later = await vstate(page);
  await page.waitForFunction(() => !window.__dbg.story.active, null, { timeout: 30000 });
  await page.waitForTimeout(900);
  out.afterPlay = await page.evaluate(() => ({ cine: !!(window.__cine && window.__cine.active), shown: document.getElementById('vclip').classList.contains('show') }));
  await page.screenshot({ path: `${dir}/${tag}-2-opening.png` });
  await page.context().close();
}
// 2. new game, skip with a tap
{
  const page = await fresh();
  await page.evaluate(() => document.getElementById('start').click());
  await page.waitForFunction(() => { const b = document.getElementById('vclip'); return b && b.classList.contains('on') && b.querySelector('video').currentTime > 0.7; }, null, { timeout: 30000 });
  const t0 = Date.now(); await page.mouse.click(200, 300);
  await page.waitForFunction(() => !window.__dbg.story.active, null, { timeout: 5000 });
  out.skipMs = Date.now() - t0;
  // 3. force the win: every rival block goes to the player
  await page.waitForFunction(() => !(window.__cine && window.__cine.active), null, { timeout: 60000 }).catch(() => {});
  await page.keyboard.press('Space').catch(() => {});
  await page.waitForTimeout(1500);
  await page.evaluate(() => { for (const b of window.__game.state.blocks) b.owner = 'player'; });
  await page.waitForFunction(() => { const b = document.getElementById('vclip'); return window.__game.state.over === 'win' && b.classList.contains('on') && b.querySelector('video').currentTime > 0.8; }, null, { timeout: 60000 });
  out.win = await vstate(page); out.win.endHiddenDuring = await page.evaluate(() => document.getElementById('end').classList.contains('hidden'));
  await page.screenshot({ path: `${dir}/${tag}-3-victory.png` });
  await page.waitForFunction(() => !window.__dbg.story.active, null, { timeout: 30000 });
  await page.waitForTimeout(400);
  out.win.endShownAfter = await page.evaluate(() => !document.getElementById('end').classList.contains('hidden'));
  await page.screenshot({ path: `${dir}/${tag}-4-endcard.png` });
  await page.context().close();
}
await browser.close();
console.log(JSON.stringify({ tag, out, errors }, null, 1));
