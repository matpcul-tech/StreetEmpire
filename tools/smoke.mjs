import { chromium, devices } from 'playwright';
const url = process.argv[2];
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
for (const [name, opts] of [['desktop', { viewport: { width: 1280, height: 720 } }], ['phone', devices['iPhone 13']]]) {
  const page = await (await browser.newContext(opts)).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => m.type()==='error' && errs.push(m.text()));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.click('#start');
  if (name==='desktop') { await page.keyboard.down('KeyW'); await page.waitForTimeout(1500); await page.keyboard.up('KeyW'); await page.keyboard.press('KeyF'); }
  else { await page.tap('#bAttack'); await page.tap('#bRecruit'); }
  await page.waitForTimeout(2500);
  const info = await page.evaluate(() => { const mmPix = Array.from(document.getElementById('minimap').getContext('2d').getImageData(20,20,1,1).data).join('/'); const s = window.__game.state; const p = s.ents.find(e=>e.kind==='player'); return { t: s.t.toFixed(1), px: p.x.toFixed(1), pz: p.z.toFixed(1), hud: document.getElementById('stats').innerText, mmPix, touch: document.body.classList.contains('touch') }; });
  await page.screenshot({ path: `/tmp/shot-${name}.png` });
  console.log(name, JSON.stringify(info), 'errors:', errs);
}
await browser.close();
