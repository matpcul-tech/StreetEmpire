// Phone shot of night driving right after a mission starts, to check the mission banner leaves the road clear:
//   node tools/drive-msg-shot.mjs <url> <out.png>
import { chromium, devices } from 'playwright';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const pg = await (await b.newContext(devices['iPhone 13'])).newPage();
await pg.goto(process.argv[2]); await pg.waitForFunction(() => !document.getElementById('start').disabled, null, { timeout: 150000 });
await pg.tap('#start'); await pg.waitForTimeout(2000);
await pg.evaluate(() => { const g = window.__game, s = g.state, p = s.ents.find((e) => e.kind === 'player'); const u = s.ents.find((e) => e.kind === 'giver'); p.x = u.x + 1; p.z = u.z + 1; s.mission = null; s.missionIdx = 0; g.send({ type: 'talk' }); s.t = 95; window.__skipCine = setInterval(() => window.__cine && window.__cine.active === 'brief' && window.__cine.skip(), 100); setTimeout(() => clearInterval(window.__skipCine), 6000);
  const c = s.cars.find((c) => !c.driver && !c.wrecked && c.type !== 'police'); p.x = c.x + 2; p.z = c.z; g.send({ type: 'car' }); setInterval(() => { s.t = 95; const c = s.cars.find((c) => c.id === p.car); if (c) c.v = Math.max(c.v, 12); }, 50); });
await pg.waitForTimeout(6000); await pg.screenshot({ path: process.argv[3] }); await b.close();
