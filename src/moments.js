// Moments (v0.14): every big thing that happens gets a hook and a shot, so there is always a clip in it.
// A moment is a headline and a line under it, drawn as a card inside the frame (so it is in a recorded clip,
// which the DOM HUD is not), plus, for the ones that earn it, a short camera move (an orbit round a blast,
// a push in on a streak, a tilt up to the helicopter) and a beat of slow motion. The biggest ones also tell
// the clip recorder to cut the last stretch of play. Presentation only: the sim never sees any of this.
import * as THREE from 'three';
import { CREWS, DISTRICTS, districtOf, blockAt, insideBuilding } from './state.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k));
const crewName = (k) => (k === 'player' ? 'you' : CREWS[k] ? CREWS[k].name : 'the locals');

export function createMoments({ camera, scene, cine, S, player, clips, feed, pop }) {
  // ---- the card: a canvas texture on a sprite, held in the lower third of the frame ----
  const W = 1024, H = 320, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g2 = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, opacity: 0, toneMapped: false, fog: false }));
  sprite.renderOrder = 1000; sprite.frustumCulled = false; sprite.visible = false; scene.add(sprite);
  let fontsReady = false; if (document.fonts && document.fonts.load) Promise.all([document.fonts.load('150px Anton'), document.fonts.load('500 54px Oswald')]).then(() => { fontsReady = true; }).catch(() => {});
  function draw(head, sub, red) {
    g2.clearRect(0, 0, W, H);
    const band = g2.createLinearGradient(0, 0, W, 0); band.addColorStop(0, 'rgba(10,7,4,.86)'); band.addColorStop(0.75, 'rgba(10,7,4,.55)'); band.addColorStop(1, 'rgba(10,7,4,0)');
    g2.fillStyle = band; g2.fillRect(0, 40, W, 250);
    g2.fillStyle = red ? '#e0533e' : '#e8914a'; g2.fillRect(0, 40, 14, 250);
    g2.textBaseline = 'alphabetic'; g2.textAlign = 'left';
    g2.font = `${fontsReady ? '400 150px Anton' : 'bold 140px Impact'}, Impact, sans-serif`; g2.fillStyle = red ? '#ff8a76' : '#f3e6d0';
    g2.shadowColor = 'rgba(0,0,0,.7)'; g2.shadowBlur = 18; g2.shadowOffsetY = 6;
    let size = 150; while (g2.measureText(head).width > W - 60 && size > 70) { size -= 10; g2.font = `${fontsReady ? '400 ' + size + 'px Anton' : 'bold ' + size + 'px Impact'}, Impact, sans-serif`; }
    g2.fillText(head, 40, sub ? 190 : 230);
    if (sub) { g2.shadowBlur = 8; g2.shadowOffsetY = 2; let fs = 54; const f = () => `${fontsReady ? '500 ' + fs + 'px Oswald' : 'bold ' + Math.round(fs * 0.9) + 'px Arial'}, Arial, sans-serif`; g2.font = f(); while (g2.measureText(sub.toUpperCase()).width > W - 70 && fs > 30) { fs -= 3; g2.font = f(); } g2.fillStyle = red ? '#e0533e' : '#e8914a'; g2.fillText(sub.toUpperCase(), 44, 258); }
    g2.shadowBlur = 0; g2.shadowOffsetY = 0; tex.needsUpdate = true;
  }
  const cardV = new THREE.Vector3();
  let card = null; // { t, dur }
  function showCard(head, sub, red = false, dur = 2.8) { draw(head, sub, red); card = { t: 0, dur }; }
  function placeCard(rdt) {
    if (!card) { sprite.visible = false; return; }
    card.t += rdt; const k = card.t < 0.3 ? ease(card.t / 0.3) : card.t > card.dur - 0.4 ? Math.max(0, (card.dur - card.t) / 0.4) : 1;
    if (card.t >= card.dur) { card = null; sprite.visible = false; return; }
    camera.updateMatrixWorld(); // the shot may have just moved the camera: place the card against where it is now
    const unit = 2 * 10 * Math.tan(camera.fov * Math.PI / 360) / innerHeight; // world size of a pixel ten units out
    // half the frame wide, in the lower third; on a short screen it sits higher, clear of the thumb buttons
    const short = innerHeight < 500, wpx = Math.min(700, innerWidth * (short ? 0.46 : 0.52)), hpx = wpx * H / W, y = short ? -0.12 : -0.42;
    cardV.set(0, y, 0.5).unproject(camera).sub(camera.position).normalize();
    sprite.position.copy(camera.position).addScaledVector(cardV, 10);
    sprite.scale.set(wpx * unit, hpx * unit, 1); sprite.material.opacity = k; sprite.visible = true;
    sprite.center.set(0.5, 0.5);
  }

  // ---- the shot ----
  let cur = null; // { kind, prio, t, dur, cam, slow, slowUntil }
  const P = new THREE.Vector3(), L = new THREE.Vector3(), from = new THREE.Vector3(), lookFrom = new THREE.Vector3(), tv = new THREE.Vector3();
  const clearPos = (x, y, z, cx, cz) => { // pull a camera spot toward its subject until it is out of the buildings
    for (let k = 0; k < 6; k++) { if (!insideBuilding(x, z, 0.3, y)) break; x += (cx - x) * 0.3; z += (cz - z) * 0.3; }
    return [x, y, z];
  };
  function start(kind, prio, cam, slow, dur) {
    if (cine.active) return false;
    if (cur && cur.prio > prio) return false;
    from.copy(camera.position); camera.getWorldDirection(tv); lookFrom.copy(camera.position).addScaledVector(tv, 8);
    cur = { kind, prio, t: 0, dur, cam, slow: slow ? slow.k : 1, slowUntil: slow ? slow.t : 0 };
    return true;
  }
  const hood = (s, p) => { const b = blockAt(s, p.x, p.z); return b ? DISTRICTS[districtOf(b)] : 'the city'; };

  const api = {
    get active() { return cur ? cur.kind : null; },
    get ownsFov() { return false; },
    get cardShown() { return !!card; },
    get timeScale() { return cur && cur.t < cur.slowUntil ? cur.slow : 1; },
    showCard,
    end() { cur = null; card = null; sprite.visible = false; }, // test hook: drop the running shot and card
    // a wanted level climbing to three, four and five stars
    wanted(n, s, p) {
      if (n < 3) return;
      showCard(`${n} STARS`, n >= 5 ? 'the whole department is coming' : n === 4 ? 'tactical units out' : 'they are shooting now', true, 2.4);
      if (n >= 5) { start('stars', 2, { type: 'push', x: p.x, z: p.z, dist: 3.2 }, { k: 0.35, t: 0.7 }, 1.4); clips.mark('Five stars in ' + hood(s, p), 4); }
    },
    rain(s, p) { showCard('RAIN', `${hood(s, p)} goes slick`, false, 2.6); start('rain', 1, { type: 'tilt', x: p.x, y: 40, z: p.z, hold: 1.6 }, null, 1.6); },
    // the sim's fx, worded and shot
    fx(f, s) {
      const p = player(s);
      const d = f.x !== undefined ? Math.hypot(f.x - p.x, f.z - p.z) : 0;
      switch (f.type) {
        case 'boom': {
          if (d > 70) return;
          showCard(pick(['BOOM', 'UP IN FLAMES', 'THAT WAS A CAR']), `${hood(s, p)}. nobody is getting that deposit back`, true, 3);
          start('boom', 5, { type: 'orbit', x: f.x, y: 1.2, z: f.z, r: 9, h: 2.6, sweep: 1.3 }, { k: 0.3, t: 1.0 }, 2.0);
          clips.mark('Car went up in ' + hood(s, p), 3.5); return;
        }
        case 'streak': {
          showCard(`${f.n} IN A ROW`, pick(['nobody left standing', 'the whole corner is on the floor', 'and he is still swinging']), false, 2.6);
          start('streak', 4, { type: 'push', x: p.x, z: p.z, dist: 2.8 }, { k: 0.3, t: 0.9 }, 1.5);
          if (f.n >= 4) clips.mark(`${f.n} knockouts in a row`, 3); return;
        }
        case 'capture': {
          if (f.crew === 'player') { showCard(`${(f.hustle || 'THE BLOCK').toUpperCase()} IS YOURS`, `taken from ${crewName(f.from)}`, false, 3); clips.mark(`Took ${f.hustle || 'a block'}`, 3.5); }
          else if (f.from === 'player') { showCard(`${(f.hustle || 'A BLOCK').toUpperCase()} LOST`, `${crewName(f.crew)} took it off you`, true, 3); clips.mark(`Lost ${f.hustle || 'a block'}`, 2.5); }
          return;
        }
        case 'launch': { // the flight itself: a side shot that tracks the car in the air
          if (f.car !== p.car) return;
          start('air', 4, { type: 'track', car: f.car, side: 9, h: 2.2 }, null, 2.4); return;
        }
        case 'stunt': {
          showCard(`${Math.round(f.dist)} M`, pick(['airborne over ' + hood(s, p), 'that is not a road', 'the suspension would like a word']), false, 2.8);
          if (f.dist >= 18) clips.mark(`${Math.round(f.dist)} m stunt jump`, 2.5); return;
        }
        case 'race': {
          if (f.state === 'win') { const medal = f.medal === 'none' ? 'FINISHED' : f.medal.toUpperCase(); showCard(`${medal} ${f.time.toFixed(1)} S`, `${f.name}${f.record ? ', new best' : ''}`, false, 3); if (f.medal === 'gold' || f.record) clips.mark(`${f.name}: ${medal.toLowerCase()} ${f.time.toFixed(1)} s`, 2); }
          else if (f.state === 'go') showCard('GO', f.name, false, 1.6);
          return;
        }
        case 'heli': {
          if (f.state !== 'in') return;
          showCard('EYES IN THE SKY', 'four stars. the helicopter is up', true, 3);
          if (s.heli) start('heli', 3, { type: 'tilt', x: s.heli.x, y: 30, z: s.heli.z, hold: 1.8 }, null, 1.8);
          clips.mark('Helicopter inbound', 4); return;
        }
        case 'wasted': { showCard('KNOCKED OUT', pick(['the street wins this one', 'somebody call somebody', 'back at your turf']), true, 2.6); clips.mark('Knocked out', 2); return; }
        case 'busted': { showCard('LOCKED UP', pick(['bail is coming out of your pocket', 'the cops got their man']), true, 2.6); clips.mark('Locked up', 2); return; }
        case 'roadblock': { showCard('ROADBLOCK', 'five stars. the street ahead is closed', true, 2.2); return; }
        case 'nearmiss': { if (f.n >= 5 && f.n % 5 === 0) { showCard(`NEAR MISS x${f.n}`, 'threading traffic', false, 2); if (f.n >= 10) clips.mark(`${f.n} near misses`, 1.5); } return; }
        case 'found': { if (f.all) { showCard('EVERY STASH', `all ${f.of} found`, false, 3); clips.mark('Every stash found', 2); } return; }
        case 'street': { if (f.state === 'win') showCard('CALL ANSWERED', `+$${f.reward}`, false, 2.2); return; }
        case 'mission': { if (f.state === 'pass') clips.mark(`Job done: ${f.title}`, 4); else if (f.state === 'fail') showCard('JOB BLOWN', f.title, true, 2.6); return; }
        case 'jack': { const c = s.cars.find((c) => c.id === f.car); showCard('JACKED', `${c ? c.type : 'a car'} in ${hood(s, p)}`, false, 2.2); return; }
        case 'hit': { // a cop goes down while you are wanted
          if (f.ko && f.by === p.id) { const e = s.ents.find((x) => x.id === f.to); if (e && e.kind === 'cop' && p.heat > 0) { showCard('COP DOWN', 'that is going to cost you', true, 2.4); start('cop', 3, { type: 'push', x: f.x, z: f.z, dist: 3 }, { k: 0.3, t: 0.6 }, 1.2); } }
          return;
        }
        case 'house': { showCard('SAFEHOUSE', f.name, false, 2.4); return; }
        case 'courier': { if (f.state === 'drop' && f.streak) showCard('FIVE IN A ROW', `courier bonus +$${f.streak}`, false, 2.2); return; }
        case 'fare': { if (f.state === 'drop' && f.streak) showCard('FIVE IN A ROW', `fare bonus +$${f.streak}`, false, 2.2); return; }
        default: return;
      }
    },
    // after the normal camera and the cinematics: run the shot, place the card
    update(rdt, carViz) {
      if (cur && cine.active) cur = null; // a cinematic owns the camera
      if (cur) {
        cur.t += rdt; const k = Math.min(1, cur.t / cur.dur), c = cur.cam;
        if (cur.t >= cur.dur) cur = null;
        else if (c.type === 'orbit') {
          const a0 = Math.atan2(from.x - c.x, from.z - c.z), a = a0 + c.sweep * ease(k), r = c.r;
          const [x, y, z] = clearPos(c.x + Math.sin(a) * r, c.h, c.z + Math.cos(a) * r, c.x, c.z);
          P.set(x, y, z); const blend = Math.min(1, cur.t / 0.35) * (1 - Math.max(0, (cur.t - (cur.dur - 0.5)) / 0.5));
          camera.position.lerp(P, blend); L.set(c.x, c.y, c.z); camera.lookAt(L.lerp(lookFrom, 1 - blend));
        } else if (c.type === 'push') {
          const dx = from.x - c.x, dz = from.z - c.z, l = Math.hypot(dx, dz) || 1;
          const [x, y, z] = clearPos(c.x + dx / l * c.dist, 1.5, c.z + dz / l * c.dist, c.x, c.z);
          P.set(x, y, z); const blend = ease(Math.min(1, cur.t / 0.5)) * (1 - Math.max(0, (cur.t - (cur.dur - 0.4)) / 0.4));
          camera.position.lerp(P, blend); L.set(c.x, 1.45, c.z); camera.lookAt(L.lerp(lookFrom, 1 - blend));
        } else if (c.type === 'tilt') {
          const blend = ease(Math.min(1, cur.t / 0.6)) * (1 - Math.max(0, (cur.t - (cur.dur - 0.4)) / 0.4));
          L.set(c.x, c.y, c.z); camera.lookAt(L.lerp(lookFrom, 1 - blend));
        } else if (c.type === 'track') {
          const g = carViz && carViz.get(c.car);
          if (!g) cur = null;
          else {
            const fwdX = Math.sin(g.rotation.y), fwdZ = Math.cos(g.rotation.y), sideX = Math.cos(g.rotation.y), sideZ = -Math.sin(g.rotation.y);
            const sgn = ((from.x - g.position.x) * sideX + (from.z - g.position.z) * sideZ) >= 0 ? 1 : -1; // stay on the side the camera is already on
            const [x, y, z] = clearPos(g.position.x + sideX * sgn * c.side + fwdX * 1.5, c.h, g.position.z + sideZ * sgn * c.side + fwdZ * 1.5, g.position.x, g.position.z);
            P.set(x, y, z); const blend = ease(Math.min(1, cur.t / 0.4)) * (1 - Math.max(0, (cur.t - (cur.dur - 0.5)) / 0.5));
            camera.position.lerp(P, blend); L.copy(g.position); L.y += 0.8; camera.lookAt(L.lerp(lookFrom, 1 - blend));
          }
        }
      }
      placeCard(rdt);
    },
  };
  return api;
}
