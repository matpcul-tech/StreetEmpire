// Stream layer check (v0.13): node tools/stream-check.mjs <url>
// Loads the game with no stream mode, toggles it on from the pause menu, checks the class and the
// feed, turf bar and run clock, then ends the game and checks the end card's stats and summary.
import { chromium } from 'playwright';
const url = process.argv[2];
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await page.goto(url + '?nointro&new&pin', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => !document.getElementById('start').disabled, null, { timeout: 150000 });
await page.click('#start'); await page.waitForTimeout(2000);
const fail = (m) => { console.log('FAIL', m); process.exitCode = 1; };
const r = await page.evaluate(() => {
  const out = {};
  out.offAtStart = !document.body.classList.contains('stream');
  const btn = document.querySelector('#pause [data-stream]'); btn.click();
  out.onAfterClick = document.body.classList.contains('stream') && document.documentElement.classList.contains('stream') && localStorage.getItem('se-stream') === '1';
  out.boxChecked = document.querySelector('#how [data-stream]').checked;
  const s = window.__game.state;
  out.turfSegs = document.querySelectorAll('#turfbar i').length;
  window.__dbg.stream.fx({ type: 'capture', crew: 'reds', from: 'blues', hustle: 'Corner Store' }, s);
  window.__dbg.stream.fx({ type: 'streak', n: 4 }, s);
  out.feedLines = document.querySelectorAll('#feed .fl').length;
  out.feedText = document.querySelector('#feed .fl').textContent;
  out.summary = window.__dbg.stream.summaryText(s);
  s.stats.ko = 7; s.stats.taken = 2; for (const b of s.blocks) if (b.owner === 'player') b.owner = 'neutral'; // the sim ends the game on its next step
  return out;
});
await page.waitForFunction(() => window.__game.state.over, null, { timeout: 60000 }); // headless frames are slow: wait for the sim to end the game
await page.waitForTimeout(1200);
const end = await page.evaluate(() => { const ko = [...document.querySelectorAll('#endStats span')].find((e) => e.textContent.startsWith('Knockouts')); return { over: window.__game.state.over, shown: !document.getElementById('end').classList.contains('hidden'), stats: document.querySelectorAll('#endStats span').length, ko: ko ? ko.textContent : '', clock: document.getElementById('runclock').textContent, endHtml: document.getElementById('end').innerHTML.slice(0, 300) }; });
console.log(JSON.stringify({ ...r, ...end }, null, 1));
if (!r.offAtStart || !r.onAfterClick || !r.boxChecked) fail('stream mode toggle');
if (r.turfSegs !== 5 || r.feedLines !== 2 || !r.feedText.includes('Red Kings took Corner Store from Blue Hand')) fail('feed or turf bar');
if (!end.shown || end.stats < 10 || !end.ko.endsWith('7') || !/^\d+:\d\d$/.test(end.clock)) fail('end card');
if (errs.length) fail('errors ' + JSON.stringify(errs));
console.log(process.exitCode ? 'STREAM CHECK FAILED' : 'STREAM CHECK PASSED');
await browser.close();
