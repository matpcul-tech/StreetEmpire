// Filmed brief check (v0.17): node tools/brief-shots.mjs <url> <dir>   (WIDE=1 landscape phone, DESK=1 desktop)
// Starts the Bag Back job on foot: Unc's filmed brief plays over a paused sim with its subtitles in step, the
// NEW JOB card follows it, a tap skips it, and with a clip that cannot load the engine briefing runs instead.
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';
const [url, dir] = process.argv.slice(2); mkdirSync(dir, { recursive: true });
const tag = process.env.DESK ? 'desk' : process.env.WIDE ? 'wide' : 'tall';
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctxOpt = process.env.DESK ? { viewport: { width: 1280, height: 720 } } : process.env.WIDE ? { ...devices['Pixel 7 landscape'] } : { ...devices['Pixel 7'] };
const errors = [], out = {};
async function fresh(block) {
  const page = await (await browser.newContext(ctxOpt)).newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  if (block) await page.route('**/cinematics/brief-01.*', (r) => r.abort());
  else page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(url + (url.includes('?') ? '&' : '?') + 'new&nointro', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => !document.getElementById('start').disabled && window.__dbg && window.__dbg.charViz.size > 0, null, { timeout: 400000, polling: 1000 });
  await page.evaluate(() => document.getElementById('start').click());
  await page.waitForTimeout(2500);
  return page;
}
const offer = (page) => page.evaluate(() => { window.__game.state.fx.push({ type: 'mission', state: 'start', title: 'Bag Back', idx: 0 }); });
const vstate = (page) => page.evaluate(() => { const b = document.getElementById('vclip'), v = b && b.querySelector('video'), s = b && b.querySelector('.vsub'); return { on: !!b && b.classList.contains('on'), t: v ? +v.currentTime.toFixed(2) : -1, src: v ? v.currentSrc.split('/').pop() : '', sub: s && s.classList.contains('show') ? s.textContent : '', active: window.__dbg.story.active, failed: window.__dbg.story.failed, simT: window.__game.state.t, card: document.getElementById('passCard') ? document.getElementById('passCard').textContent : '', bars: document.body.classList.contains('cine-bars') }; });
const at = (page, t) => page.waitForFunction((t) => { const v = document.querySelector('#vclip video'); return v && document.getElementById('vclip').classList.contains('on') && v.currentTime > t; }, t, { timeout: 40000 });
// 1. play it through: a subtitle per beat, none in the pause, the sim held, the card after
{
  const page = await fresh(); await offer(page);
  await at(page, 1.5); out.line1 = await vstate(page); await page.screenshot({ path: `${dir}/${tag}-1-line1.png` });
  await at(page, 5.7); out.pause = await vstate(page);
  await at(page, 8); out.line2 = await vstate(page); await page.screenshot({ path: `${dir}/${tag}-2-line2.png` });
  await at(page, 12); out.line3 = await vstate(page); await page.screenshot({ path: `${dir}/${tag}-3-line3.png` });
  await page.waitForFunction(() => !window.__dbg.story.active, null, { timeout: 30000 });
  await page.waitForTimeout(500); out.after = await vstate(page); await page.screenshot({ path: `${dir}/${tag}-4-card.png`, timeout: 90000 }).catch(() => {}); // software GL can be too slow to shoot the live game
  await page.close();
}
// 2. a tap skips it and the card still comes
{
  const page = await fresh(); await offer(page);
  await at(page, 1.0); await page.locator('#vclip').dispatchEvent('pointerdown');
  await page.waitForFunction(() => !window.__dbg.story.active, null, { timeout: 5000 });
  await page.waitForTimeout(500); out.skipped = await vstate(page);
  await page.close();
}
// 3. the clip cannot load: the engine briefing runs
{
  const page = await fresh(true); await offer(page);
  await page.waitForFunction(() => document.body.classList.contains('cine-bars'), null, { timeout: 30000 });
  out.fallback = await vstate(page); await page.screenshot({ path: `${dir}/${tag}-5-fallback.png`, timeout: 90000 }).catch(() => {});
  await page.close();
}
await browser.close();
const ok = out.line1.sub.startsWith('UncSomebody') && out.pause.sub === '' && out.line2.sub.includes('Red Kings car') && out.line3.sub.includes('real work')
  && out.line3.simT === out.line1.simT && /NEW JOB/i.test(out.after.card) && !out.after.failed && /NEW JOB/i.test(out.skipped.card) && out.fallback.failed && out.fallback.bars && !errors.length;
console.log(JSON.stringify({ ok, out, errors }, null, 1)); process.exit(ok ? 0 : 1);
