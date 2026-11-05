// Visual QA gate, run before every release:
//   node tools/visual-qa.mjs <url> [outDir]
// Captures day, dusk and night shots (on foot, close up, driving, mission) on
// desktop and phone, measures brightness and character contrast, writes
// report.json in outDir and exits 1 when a night shot is too dark or a
// character reads as a silhouette.
import { chromium, devices } from 'playwright';
import sharp from 'sharp';
import fs from 'node:fs';
const url = process.argv[2], dir = process.argv[3] || '/workspace/screenshots/qa';
fs.mkdirSync(dir, { recursive: true });
// thresholds (luma 0..255)
const LIMIT = { nightMean: 38, nightP10: 6, charMean: 40, charContrast: 14 };
const TIMES = { day: 424, dusk: 6, night: 95 };
const lum = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
async function stats(file, rect) {
  const img = sharp(file); const { width, height } = await img.metadata();
  const region = rect ? { left: Math.max(0, Math.round(rect.x)), top: Math.max(0, Math.round(rect.y)), width: Math.max(2, Math.min(width - Math.round(rect.x), Math.round(rect.w))), height: Math.max(2, Math.min(height - Math.round(rect.y), Math.round(rect.h))) } : null;
  const { data, info } = await (region ? img.extract(region) : img).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const L = []; let sat = 0; for (let i = 0; i < data.length; i += 3 * 4) { L.push(lum(data, i)); const mx = Math.max(data[i], data[i + 1], data[i + 2]), mn = Math.min(data[i], data[i + 1], data[i + 2]); sat += mx ? (mx - mn) / mx : 0; }
  L.sort((a, b) => a - b); const mean = L.reduce((a, b) => a + b, 0) / L.length;
  const sd = Math.sqrt(L.reduce((a, b) => a + (b - mean) ** 2, 0) / L.length);
  return { mean: +mean.toFixed(1), p10: +L[Math.floor(L.length * 0.1)].toFixed(1), min: +L[0].toFixed(1), sd: +sd.toFixed(1), sat: +(sat / L.length).toFixed(3), rect: region, w: info.width, h: info.height };
}
// The pass picks the quality. An existing q= is replaced, and a second ? (from
// appending "?q=" onto a url that already has a query) cannot leave a poisoned value.
function withQuality(raw, q) {
  const u = new URL(String(raw), 'http://localhost');
  if (q) u.searchParams.set('q', q);
  else u.searchParams.delete('q');
  return u.href;
}
const qCheck = new URL(withQuality('http://127.0.0.1:9/?q=potato?q=low', 'potato'));
if (qCheck.searchParams.getAll('q').join(',') !== 'potato') throw new Error('visual-qa failed to replace q');
const qClear = new URL(withQuality('http://127.0.0.1:9/?q=potato', ''));
if (qClear.searchParams.has('q')) throw new Error('visual-qa failed to clear q for the default pass');
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const results = []; let fail = [];
for (const q of (process.env.QUALS ?? ',low,potato').split(',')) for (const [dev0, opts] of [['desktop', { viewport: { width: 1280, height: 720 } }], ['phone', devices['iPhone 13']]].filter(([d]) => (process.env.DEVS ?? 'desktop,phone').split(',').includes(d))) {
  const dev = dev0 + (q ? '-' + q : ''); // every quality level: high (phone default low), low, potato
  const page = await (await browser.newContext(opts)).newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(withQuality(url, q), { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => !document.getElementById('start').disabled, null, { timeout: 150000 });
  if (dev0 === 'phone') await page.tap('#start'); else await page.click('#start');
  await page.waitForTimeout(1500);
  // QA measures gameplay framing: cinematic moments are skipped as they start (tools/cine-shots.mjs covers them)
  await page.evaluate(() => setInterval(() => window.__cine && window.__cine.active && window.__cine.skip(), 50));
  for (const [tod, t] of Object.entries(TIMES)) {
    const shot = async (kind, setup) => {
      await page.evaluate(setup, t); await page.waitForTimeout(2500);
      const file = `${dir}/${dev}-${tod}-${kind}.png`;
      // character rectangles on screen (player and nearby crew)
      const rects = await page.evaluate(() => {
        const D = window.__dbg, cam = D.camera, out = []; const s = window.__game.state;
        const pl = s.ents.find((e) => e.kind === 'player');
        for (const [id, g] of D.charViz) {
          const e = s.ents.find((x) => x.id === id); if (!e || Math.hypot(e.x - pl.x, e.z - pl.z) > 8) continue;
          const pts = [[0, 0.1, 0], [0, 1.7, 0]].map(([x, y, z]) => { const v = g.position.clone(); v.y += y; v.project(cam); return v; });
          if (pts.some((v) => v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1)) continue;
          const W = innerWidth, H = innerHeight, y0 = (1 - pts[1].y) / 2 * H, y1 = (1 - pts[0].y) / 2 * H, h = y1 - y0, cx = (pts[0].x + 1) / 2 * W;
          if (h < 40) continue;
          // skip characters hidden behind a wall: a ray from the camera to the chest must reach this character first
          const chest = g.position.clone(); chest.y += 1.1; const dir = chest.clone().sub(cam.position); const len = dir.length();
          const rc = new D.Raycaster(cam.position, dir.normalize(), 0.1, len);
          const hits = []; for (const ch of D.scene.children) { if (ch.isLight || ch.isCamera) continue; try { rc.intersectObject(ch, true, hits); } catch {} } hits.sort((a, b) => a.distance - b.distance);
          const hit = hits.find((h) => h.object.visible && !h.object.isSprite && !h.object.isPoints && h.object.material && !h.object.material.transparent);
          if (hit) { let o = hit.object, mine = false; while (o) { if (o === g) { mine = true; break; } o = o.parent; } if (!mine && hit.distance < len - 0.6) continue; }
          out.push({ id, x: cx - h * 0.16, y: y0, w: h * 0.32, h });
        }
        return out.slice(0, 4);
      });
      await page.screenshot({ path: file });
      const scale = await page.evaluate(() => devicePixelRatio);
      const whole = await stats(file);
      const chars = [];
      for (const r of rects) chars.push(await stats(file, { x: r.x * scale, y: r.y * scale, w: r.w * scale, h: r.h * scale }));
      const rec = { dev, tod, kind, file, whole, chars };
      if (tod !== 'day') {
        { const lim = LIMIT.nightMean; if (whole.mean < lim) fail.push(`${dev} ${tod} ${kind}: mean ${whole.mean} < ${lim}`); }
        if (whole.p10 < LIMIT.nightP10) fail.push(`${dev} ${tod} ${kind}: p10 ${whole.p10} < ${LIMIT.nightP10}`);
        for (const c of chars) if (c.mean < LIMIT.charMean || c.sd < LIMIT.charContrast) fail.push(`${dev} ${tod} ${kind}: character silhouette (mean ${c.mean}, contrast ${c.sd})`);
      }
      results.push(rec); console.log(dev, tod, kind, JSON.stringify(whole), 'chars', chars.map((c) => `${c.mean}/${c.sd}`).join(' '));
    };
    await shot('foot', (t) => { const g = window.__game, s = g.state; window.__camOv = null; clearInterval(window.__hold); clearInterval(window.__drv); const p = s.ents.find((e) => e.kind === 'player'); if (p.car) g.send({ type: 'car' }); s.t = t; });
    await shot('closeup', (t) => {
      const s = window.__game.state, pl = s.ents.find((e) => e.kind === 'player'); pl.ry = 0;
      const crew = ['reds', 'blues', 'golds'].map((c) => s.ents.find((e) => e.kind === 'npc' && e.crew === c && e.hp > 0)).filter(Boolean);
      window.__hold = setInterval(() => { s.t = t; crew.forEach((e, i) => { e.x = pl.x + 1.3 + i * 1.3; e.z = pl.z; e.ry = 0; e.stun = 99; e.moving = 0; }); }, 16);
      window.__camOv = { x: pl.x + 1.9, y: 1.35, z: pl.z + 6, lx: pl.x + 1.9, ly: 0.95, lz: pl.z };
    });
    await shot('driving', (t) => {
      clearInterval(window.__hold); window.__camOv = null; const g = window.__game, s = g.state, p = s.ents.find((e) => e.kind === 'player');
      const c = s.cars.find((c) => !c.driver && !c.wrecked && c.type !== 'police'); p.x = c.x + 2; p.z = c.z; g.send({ type: 'car' });
      window.__drv = setInterval(() => { s.t = t; const c = s.cars.find((c) => c.id === p.car); if (c) c.v = Math.max(c.v, 12); }, 50);
    });
    await shot('mission', (t) => {
      clearInterval(window.__drv); const g = window.__game, s = g.state, p = s.ents.find((e) => e.kind === 'player'); if (p.car) g.send({ type: 'car' });
      const u = s.ents.find((e) => e.kind === 'giver'); p.x = u.x + 1; p.z = u.z + 1; s.mission = null; s.missionIdx = 0; g.send({ type: 'talk' }); s.t = t; // briefings are covered by tools/cine-shots.mjs
    });
  }
  if (errs.length) fail.push(`${dev}: page errors ${errs.join('; ')}`);
}
await browser.close();
fs.writeFileSync(`${dir}/report.json`, JSON.stringify({ url, limits: LIMIT, results, fail }, null, 1));
console.log(fail.length ? 'VISUAL QA FAIL\n' + fail.join('\n') : 'VISUAL QA PASS');
process.exit(fail.length ? 1 : 0);
