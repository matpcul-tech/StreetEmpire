// Cinematic moments (v0.9): car entry and exit, Unc briefing cutscenes, the
// block claim camera swing, the down beat and the mission passed card.
// Everything here is presentation only: the state layer stays instant, so the
// sim, tests and multiplayer rules do not change. Any tap or key skips.
import * as THREE from 'three';

const $ = (id) => document.getElementById(id);
const ease = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const seg = (t, a, b) => ease((t - a) / (b - a));

// Unc briefings: original lines, two short beats before the mission intro line
export const BRIEFS = [
  ['Unc: "You still got your feet under you. Sit down."', 'Unc: "A mugger went for your bag, then his boys, then a Red Kings car."', 'You: "I saw the car."'],
  ['Unc: "There you are. Sit down a second, I got something easy."', 'Unc: "Package came in on the Harbor side. Nobody touches it but you."'],
  ['Unc: "You hear what the Red Kings been saying about us?"', 'You: "I heard."', 'Unc: "Then go make them stop saying it."'],
  ['Unc: "My guy at the chop shop is short one muscle car."', 'You: "Any color?"', 'Unc: "Fast is the only color that matters."'],
  ['Unc: "Look around. This block is ours because we hold it."', 'Unc: "Now we hold one more."'],
];

export function createCine({ camera, sfx, charViz, blocked, scene }) {
  const ray = new THREE.Raycaster();
  const ui = document.createElement('div'); ui.id = 'cine';
  ui.innerHTML = '<div class="bar top"></div><div class="bar bot"></div><div id="cineLoc"><b id="cineLocK"></b><span id="cineLocT"></span></div><div id="cineSub"><b id="cineWho"></b><span id="cineLine"></span></div><div id="cineSkip">Tap to skip</div>';
  document.body.appendChild(ui);
  const card = document.createElement('div'); card.id = 'passCard';
  card.innerHTML = '<div class="pc-k" id="pcKick">JOB DONE</div><div class="pc-t" id="pcTitle"></div><div class="pc-r" id="pcReward"></div><div class="pc-s" id="pcRep"></div>';
  (document.getElementById('rstack') || document.body).appendChild(card);
  const tint = document.createElement('div'); tint.id = 'downTint'; document.body.appendChild(tint);

  let cur = null; // { kind, t, dur, ... }
  let cardT = 0, typed = null;
  const camFrom = new THREE.Vector3(), lookFrom = new THREE.Vector3(), lookTo = new THREE.Vector3(), tv = new THREE.Vector3(), tl = new THREE.Vector3();

  // a simple swinging driver door, built once per car from its bounds
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.5, metalness: 0.4 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x223040, roughness: 0.1, metalness: 0.6, transparent: true, opacity: 0.7 });
  function doorFor(g) {
    if (g.userData.door) return g.userData.door;
    if (g.userData.bike) { g.userData.halfW = 0.1; return null; } // nothing to open: you walk up and swing a leg over
    const rot = g.rotation.y, pos = g.position.clone(); g.rotation.y = 0; g.position.set(0, 0, 0); g.updateMatrixWorld(true);
    const keep = []; for (const ch of g.children) if (ch.userData.beam || ch.isLight) { keep.push([ch, ch.visible]); ch.visible = false; }
    const b = new THREE.Box3(); g.traverse((o) => { if (o.isMesh && o.visible && !o.isSkinnedMesh) b.expandByObject(o); });
    for (const [ch, v] of keep) ch.visible = v;
    g.rotation.y = rot; g.position.copy(pos); g.updateMatrixWorld(true);
    const halfW = Math.max(0.7, Math.min(1.2, -b.min.x)), h = Math.max(1.1, b.max.y);
    const m = doorMat.clone(); m.color.setHex(g.userData.paintHex ?? 0x555555);
    const pivot = new THREE.Group(); pivot.position.set(-halfW + 0.02, 0, 0.6);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.05, h * 0.36, 0.95), m); panel.position.set(-0.02, h * 0.48, -0.48);
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.03, h * 0.24, 0.8), glassMat); win.position.set(-0.02, h * 0.78, -0.52);
    pivot.add(panel, win); pivot.visible = false; g.add(pivot);
    g.userData.door = pivot; g.userData.halfW = halfW;
    return pivot;
  }

  const api = {
    get info() { return cur ? { kind: cur.kind, t: +cur.t.toFixed(2), dur: +cur.dur.toFixed(2) } : null; },
    get active() { return cur ? cur.kind : null; },
    get pausesSim() { return !!cur && (cur.kind === 'brief' || cur.kind === 'swing' || cur.kind === 'open' || cur.kind === 'pass'); },
    get holdsInput() { return !!cur; },
    get ownsFov() { return !!cur && (cur.kind === 'brief' || cur.kind === 'open'); },
    // a lower third card: kicker, title, optional reward and note lines
    card({ k, t = '', r = '', s = '', red = false, dur = 3.2 }) {
      $('pcKick').textContent = k; $('pcTitle').textContent = t; $('pcReward').textContent = r; $('pcRep').textContent = s;
      $('pcReward').style.display = r ? '' : 'none'; $('pcRep').style.display = s ? '' : 'none';
      card.classList.toggle('red', red); card.classList.remove('show'); void card.offsetWidth; card.classList.add('show'); cardT = dur;
      const b = $('big'); if (b) b.classList.remove('show');
    },
    // opening flyover: Harbor, over Downtown, down onto the player on the Eastside, then hand the camera back
    opening(o) {
      if (cur) end();
      const V = (x, y, z) => new THREE.Vector3(x, y, z), F = o.far, C = o.center, H = o.home, P = o.player;
      const away = Math.atan2(H.x - C.x, H.z - C.z);
      const pts = [V(F.x + 22, 30, F.z + 26), V(F.x + (C.x - F.x) * 0.55 + 8, 40, F.z + (C.z - F.z) * 0.55 + 8), V(C.x + (H.x - C.x) * 0.5, 36, C.z + (H.z - C.z) * 0.5), V(P.x + Math.sin(away) * 18, 14, P.z + Math.cos(away) * 18), V(P.x + Math.sin(away) * 7, 3.2, P.z + Math.cos(away) * 7)];
      const looks = [V(F.x, 4, F.z), V(C.x, 8, C.z), V(H.x, 4, H.z), V(P.x, 1.6, P.z), V(P.x, 1.4, P.z)];
      cur = { kind: 'open', t: 0, dur: o.dur || 8.4, path: new THREE.CatmullRomCurve3(pts, false, 'centripetal'), look: new THREE.CatmullRomCurve3(looks, false, 'centripetal'), locs: o.locs || [], li: -1, onDone: o.onDone };
      document.body.classList.add('cine-on', 'cine-bars');
    },
    skip() { if (cur) cur.t = cur.dur; if (cardT > 0) cardT = Math.min(cardT, 0.3); },
    // car: dir 'in' or 'out'; jack adds the pull out beat
    car(dir, carG, playerG, jackId) {
      if (!carG || !playerG) return;
      if (cur) end();
      doorFor(carG);
      const jack = dir === 'in' && jackId != null;
      cur = { kind: 'car', dir, t: 0, dur: (dir === 'in' ? 1.15 : 0.95) + (jack ? 0.4 : 0), jack: jack ? 0.4 : 0, carG, playerG, jackId, start: playerG.position.clone(), startRy: playerG.rotation.y, camInit: false };
    },
    brief(idx, unc, playerG, intro, job, briefLines) {
      if (cur) end();
      const lines = [...(briefLines || BRIEFS[idx] || []), intro || ''].filter(Boolean);
      // each line holds long enough to read it: short lines 2 s, long ones up to 4.2 s
      const EST = 1.4, starts = [], durs = lines.map((l) => Math.max(2.0, Math.min(4.2, 1.3 + l.length * 0.04)));
      let at = EST; for (const d of durs) { starts.push(at); at += d; }
      cur = { kind: 'brief', t: 0, lines, starts, durs, est: EST, dur: at, unc, playerG, shot: -2, job };
      document.body.classList.add('cine-on', 'cine-bars');
    },
    swing(center, label) { if (cur) end(); cur = { kind: 'swing', t: 0, dur: 2.4, center: new THREE.Vector3(center.x, 0, center.z), camInit: false }; document.body.classList.add('cine-on'); api.card({ k: 'BLOCK TAKEN', t: label || '', dur: 3 }); },
    down(busted) { card.classList.remove('show'); cardT = 0; tint.className = busted ? 'busted on' : 'wasted on'; },
    up() { tint.className = ''; },
    passed(title, reward, rep, center) {
      api.card({ k: 'JOB DONE', t: title, r: '+$' + reward, s: 'Respect +' + rep, dur: 3.4 });
      if (center && !cur) { cur = { kind: 'pass', t: 0, dur: 2.2, center: new THREE.Vector3(center.x, 0, center.z), camInit: false }; document.body.classList.add('cine-on'); }
    },
    failed(title) { api.card({ k: 'JOB BLOWN', t: title, red: true, dur: 2.6 }); },
    setLine(text) {
      if (!text) { $('cineSub').style.opacity = 0; typed = null; return; }
      const m = /^(\w+): "(.*)"$/.exec(text);
      $('cineWho').textContent = m ? m[1] : ''; typed = { full: m ? m[2] : text, n: 0 }; $('cineLine').textContent = ''; $('cineSub').style.opacity = 1;
    },
    // title screen camera: three slow shots of the live block, dipping to black between them
    titleCam(rdt, o) { titleFrame(rdt, o); },
    titleShot(n, k = 0.5) { T.shot = n; T.t = T.dur * k; }, // test hook for screenshots
    // per frame; returns true when it drove the camera this frame
    update(rdt) {
      if (cardT > 0 && (cardT -= rdt) <= 0) card.classList.remove('show');
      if (typed && typed.n < typed.full.length) { typed.n = Math.min(typed.full.length, typed.n + rdt * 52); $('cineLine').textContent = typed.full.slice(0, Math.ceil(typed.n)); }
      if (!cur) return false;
      cur.t += rdt;
      const c = cur, done = c.t >= c.dur;
      if (c.kind === 'car') carFrame(c, done);
      else if (c.kind === 'brief') briefFrame(c);
      else if (c.kind === 'swing') swingFrame(c);
      else if (c.kind === 'open') openFrame(c);
      else if (c.kind === 'pass') passFrame(c);
      if (done) { end(); return false; }
      return true;
    },
    // after the normal camera ran: blend for car moves
    blendCamera() {
      if (!cur || cur.kind !== 'car') return;
      const c = cur;
      if (!c.camInit) {
        c.camInit = true; camFrom.copy(camera.position); camera.getWorldDirection(tv); lookFrom.copy(camera.position).addScaledVector(tv, 6);
        // getting in: cut to a low three quarter shot on the driver door, then ease back to the chase camera
        if (c.dir === 'in') {
          const g = c.carG, hw = g.userData.halfW || 0.9; g.updateMatrixWorld(true);
          const door = local(g, -hw - 0.7, 1.0, 0.1, new THREE.Vector3());
          for (const [x, y, z] of [[-hw - 3.0, 1.2, 2.6], [-hw - 3.0, 1.2, -2.4], [-hw - 4.2, 1.7, 0.4], [-hw - 1.6, 1.3, 4.2], [-hw * 0.5, 1.5, 5.6], [-hw - 1.6, 1.3, -4.4]]) {
            const q = local(g, x, y, z, new THREE.Vector3());
            if (clear(door.x, door.z, [q.x, q.y, q.z])) { camFrom.copy(q); lookFrom.copy(door); break; }
          }
        }
      }
      const k = seg(c.t, c.dir === 'in' ? c.dur * 0.58 : c.jack * 0.6, c.dur);
      camera.getWorldDirection(tv); lookTo.copy(camera.position).addScaledVector(tv, 6);
      camera.position.lerpVectors(camFrom, camera.position, k);
      tl.lerpVectors(lookFrom, lookTo, k); camera.lookAt(tl);
    },
  };

  function end() {
    const c = cur; cur = null;
    if (c.kind === 'car') { const d = c.carG.userData.door; if (d) { d.visible = false; d.rotation.y = 0; } c.playerG.userData.cineHold = false; if (c.dir === 'in') c.playerG.visible = false; c.playerG.rotation.x = 0; if (c.jackG) c.jackG.userData.cineHold = false; }
    if (c.kind === 'brief') { c.unc && (c.unc.userData.cineTalk = false); c.playerG && (c.playerG.userData.cineHold = false); if (c.job) api.card({ k: 'NEW JOB', t: c.job, dur: 2.6 }); }
    document.body.classList.remove('cine-on', 'cine-bars'); api.setLine(null);
    $('cineLoc').classList.remove('show');
    if (c.kind === 'open' && c.onDone) c.onDone();
  }

  // car local point to world
  const local = (g, x, y, z, out) => out.set(x, y, z).applyMatrix4(g.matrixWorld);
  const P0 = new THREE.Vector3(), P1 = new THREE.Vector3(), P2 = new THREE.Vector3();
  function carFrame(c, done) {
    c.jackG = c.jackId != null ? charViz.get(c.jackId) : null;
    const g = c.carG, pg = c.playerG, door = g.userData.door, hw = g.userData.halfW || 0.9;
    // where the driver ends up: the car seat, or a bike's saddle (set by the bike in vehicles.js)
    const bike = !!g.userData.bike, st = g.userData.seat, sx = bike ? st.x : -0.42, sy = bike ? st.y - 0.55 : 0.24 + 0.15, sz = bike ? st.z : 0.15, duck = bike ? 0 : 1;
    g.updateMatrixWorld(true);
    pg.userData.cineHold = !done; pg.visible = true;
    const carRy = g.rotation.y;
    if (c.dir === 'in') {
      const t = c.t - c.jack; // the jack beat runs first
      local(g, -hw - 0.75, 0, sz, P1); // standing at the open door
      local(g, sx, sy, sz, P2); // in the seat
      if (c.jackG) { // pull the driver out: seat to the curb, staggering back
        const j = Math.max(0, Math.min(1, c.t / c.jack));
        c.jackG.userData.cineHold = c.t < c.jack + 0.5;
        if (c.t < c.jack + 0.5) { local(g, -0.42, 0.3, 0.15, P0); const to = local(g, -hw - 1.9, 0.24, -0.8, new THREE.Vector3()); c.jackG.position.lerpVectors(P0, to, ease(j)); c.jackG.rotation.y = carRy - Math.PI / 2; c.jackG.visible = true; c.jackG.userData.cineAnim = 'Hit_Chest'; }
        local(g, sx, sy, sz, P2);
      }
      const walk = seg(c.t, 0, c.jack + 0.35);
      if (door) { door.visible = true; door.rotation.y = 1.1 * (seg(c.t, c.jack * 0.3, c.jack * 0.3 + 0.3) - seg(t, 0.85, 1.1)); }
      if (t < 0.4) {
        pg.position.lerpVectors(c.start, P1, walk); pg.position.y = 0.24;
        const dx = P1.x - c.start.x, dz = P1.z - c.start.z; if (dx * dx + dz * dz > 0.01 && walk < 0.95) pg.rotation.y = Math.atan2(dx, dz);
        else pg.rotation.y = carRy + Math.PI / 2;
        pg.userData.cineAnim = c.jack && c.t < c.jack ? 'Punch_Cross' : walk < 1 ? 'Walk_Loop' : 'Idle_Loop';
        pg.rotation.x = 0;
      } else {
        const k = seg(t, 0.4, 0.85); // duck in and sit
        pg.position.lerpVectors(P1, P2, k); pg.position.y = P1.y + (P2.y - P1.y) * k + Math.sin(k * Math.PI) * 0.05 - Math.sin(k * Math.PI) * 0.25 * duck;
        if (pg.userData.kit && !bike) pg.position.y -= 0.34 * k; // the realistic torso sits higher than the painted body; keep the head in the window
        pg.rotation.y = carRy + Math.PI / 2 * (1 - k);
        pg.rotation.x = Math.sin(k * Math.PI) * 0.35 * duck; // duck the head under the roof line
        pg.userData.cineAnim = k > 0.5 ? 'Driving_Loop' : 'Idle_Loop';
      }
    } else {
      local(g, sx, sy, sz, P0);
      local(g, -hw - 0.75, 0, sz, P1);
      local(g, -2.4, 0, 0, P2);
      if (door) { door.visible = true; door.rotation.y = 1.1 * (seg(c.t, 0, 0.25) - seg(c.t, 0.7, 0.95)); }
      if (c.t < 0.5) {
        const k = seg(c.t, 0.1, 0.5);
        pg.position.lerpVectors(P0, P1, k); pg.position.y = bike ? sy + (0.24 - sy) * k : 0.39 - 0.15 * k - (pg.userData.kit ? 0.34 * (1 - k) : 0);
        pg.rotation.y = carRy + Math.PI / 2 * k; pg.rotation.x = Math.sin(k * Math.PI) * 0.35 * duck;
        pg.userData.cineAnim = k < 0.4 ? 'Driving_Loop' : 'Idle_Loop';
      } else {
        const k = seg(c.t, 0.5, 0.9);
        pg.position.lerpVectors(P1, P2, k); pg.position.y = 0.24; pg.rotation.x = 0;
        pg.rotation.y = carRy - Math.PI / 2 * 0 + Math.PI / 2; pg.userData.cineAnim = k < 1 ? 'Walk_Loop' : 'Idle_Loop';
      }
    }
  }

  function briefFrame(c) {
    let shot = -1; for (let i = 0; i < c.starts.length; i++) if (c.t >= c.starts[i]) shot = i;
    const u = c.unc, pg = c.playerG; if (!u || !pg) return;
    u.userData.cineTalk = true; pg.userData.cineHold = true;
    // stand a fixed talking distance apart and face each other
    const ux = u.position.x, uz = u.position.z;
    if (c.toU == null) { c.toU = Math.atan2(ux - pg.position.x, uz - pg.position.z); c.side = pickSide(ux, uz, c.toU); }
    const toU = c.toU, fx = Math.sin(toU), fz = Math.cos(toU), rx = Math.cos(toU) * c.side, rz = -Math.sin(toU) * c.side;
    const px = ux - fx * 1.9, pz = uz - fz * 1.9; pg.position.set(px, 0.24, pz);
    pg.rotation.y = toU; u.rotation.y = toU + Math.PI;
    pg.userData.cineAnim = (c.lines[shot] || '').startsWith('You') ? 'Idle_Talking_Loop' : 'Idle_Loop';
    u.userData.cineAnim = (c.lines[shot] || '').startsWith('You') ? 'Idle_Loop' : 'Idle_Talking_Loop';
    if (shot !== c.shot) { c.shot = shot; api.setLine(shot >= 0 ? c.lines[shot] : null); }
    if (shot < 0) { // establishing two shot: wide from the open side, craning down as they square up
      const k = ease(c.t / c.est), mx = (ux + px) / 2, mz = (uz + pz) / 2;
      if (!c.estCam) { const cands = []; for (const r of [5.2, 4.2, 3.4]) for (const [ax, az] of [[rx, rz], [-rx, -rz], [rx * 0.8 - fx * 0.6, rz * 0.8 - fz * 0.6], [-rx * 0.8 - fx * 0.6, -rz * 0.8 - fz * 0.6], [rx * 0.8 + fx * 0.6, rz * 0.8 + fz * 0.6], [-rx * 0.8 + fx * 0.6, -rz * 0.8 + fz * 0.6]]) cands.push([mx + ax * r, mz + az * r]);
        const roomy = (q) => [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([a, b]) => !(blocked && blocked(q[0] + a * 1.3, q[1] + b * 1.3, 2.2)));
        const ok = (q) => roomy(q) && clear(ux, uz, [q[0], 2.6, q[1]]) && clear(px, pz, [q[0], 2.6, q[1]]) && clear(mx, mz, [q[0], 2.0, q[1]]);
        c.estCam = cands.find(ok); if (!c.estCam) { c.t = c.est; return; } } // no clean wide angle here: go straight to the dialogue
      const [ex, ez] = c.estCam, r = 1 - 0.18 * k;
      camera.position.set(mx + (ex - mx) * r, 3.1 - 0.9 * k, mz + (ez - mz) * r);
      camera.lookAt(mx, 1.3, mz); camera.fov = 42; camera.updateProjectionMatrix();
      return;
    }
    const drift = Math.min(1, (c.t - c.starts[shot]) / c.durs[shot]); // slow push in on every cut
    const line = c.lines[shot] || '', you = line.startsWith('You');
    const mode = you ? 2 : shot === 0 ? 0 : 1; // open over the shoulder, then cut to whoever talks
    if (c.camShot !== shot) { // choose a clear camera for this cut (walls and props block some angles)
      c.camShot = shot;
      const tx = mode === 2 ? px : ux, tz = mode === 2 ? pz : uz;
      const cands = mode === 0
        ? [[px - fx * 1.5 + rx * 0.7, 1.85, pz - fz * 1.5 + rz * 0.7], [px - fx * 1.5 - rx * 0.7, 1.85, pz - fz * 1.5 - rz * 0.7], [px + rx * 2.6, 1.9, pz + rz * 2.6], [px - rx * 2.6, 1.9, pz - rz * 2.6]]
        : mode === 1
          ? [[px + fx + rx * 1.35, 1.68, pz + fz + rz * 1.35], [px + fx - rx * 1.35, 1.68, pz + fz - rz * 1.35], [px - fx * 0.6 + rx * 0.6, 1.8, pz - fz * 0.6 + rz * 0.6], [px - fx * 0.6 - rx * 0.6, 1.8, pz - fz * 0.6 - rz * 0.6]]
          : [[ux - fx + rx * 1.35, 1.68, uz - fz + rz * 1.35], [ux - fx - rx * 1.35, 1.68, uz - fz - rz * 1.35], [ux + fx * 0.6 + rx * 0.6, 1.8, uz + fz * 0.6 + rz * 0.6], [ux + fx * 0.6 - rx * 0.6, 1.8, uz + fz * 0.6 - rz * 0.6]];
      c.cam = cands.find((q) => clear(tx, tz, q)) || cands[0]; c.tgt = [tx, tz];
    }
    const [tx, tz] = c.tgt, q = c.cam, k = 1 - ease(drift) * 0.14;
    const hx = Math.sin(c.t * 1.3) * 0.018, hy = Math.sin(c.t * 1.7 + 1) * 0.012; // a little handheld life
    camera.position.set(tx + (q[0] - tx) * k + hx, q[1] + hy, tz + (q[2] - tz) * k);
    camera.lookAt(tx, mode === 0 ? 1.35 : 1.52, tz);
    camera.fov = 45; camera.updateProjectionMatrix();
  }

  const from = new THREE.Vector3(), dir = new THREE.Vector3();
  const isChar = (o) => { for (const g of charViz.values()) if (g === o) return true; return false; };
  // true when nothing solid sits between the subject's head and the camera spot
  function clear(tx, tz, q) {
    if (blocked && blocked(q[0], q[2], q[1])) return false;
    from.set(tx, 1.5, tz); dir.set(q[0] - tx, q[1] - 1.5, q[2] - tz); const L = dir.length(); dir.normalize();
    ray.set(from, dir); ray.far = L + 0.3; ray.camera = camera;
    const hits = []; for (const ch of scene.children) { if (ch.isLight || ch.isCamera) continue; try { ray.intersectObject(ch, true, hits); } catch {} }
    return !hits.some((h) => { let o = h.object; if (!o.visible || o.isSkinnedMesh || o.isSprite || o.isPoints || o.isLine || (o.material && o.material.transparent) || h.distance < 0.35) return false; while (o) { if (isChar(o)) return false; o = o.parent; } return true; });
  }
  // put the cameras on the open side of the pair (away from walls)
  function pickSide(ux, uz, toU) {
    const fx = Math.sin(toU), fz = Math.cos(toU);
    const score = (sd) => { let n = 0; const rx = Math.cos(toU) * sd, rz = -Math.sin(toU) * sd; const px = ux - fx * 1.9, pz = uz - fz * 1.9;
      for (const [x, z] of [[px - fx * 1.5 + rx * 0.7, pz - fz * 1.5 + rz * 0.7], [px + fx + rx * 1.35, pz + fz + rz * 1.35], [ux - fx + rx * 1.35, uz - fz + rz * 1.35], [px + rx * 2, pz + rz * 2]]) if (blocked && blocked(x, z, 1.6)) n++; return n; };
    return score(1) <= score(-1) ? 1 : -1;
  }
  function swingFrame(c) {
    const k = ease(c.t / c.dur);
    if (!c.camInit) { c.camInit = true; c.a0 = Math.atan2(camera.position.x - c.center.x, camera.position.z - c.center.z); }
    // rise from street level into a crane over the block as it changes hands
    const a = c.a0 + k * 1.9, r = 17 - 5 * Math.sin(k * Math.PI), h = 3 + 13 * k + 3 * Math.sin(k * Math.PI);
    camera.position.set(c.center.x + Math.sin(a) * r, h, c.center.z + Math.cos(a) * r);
    camera.lookAt(c.center.x, 2.5 - 1.5 * k, c.center.z);
  }
  const gp = new THREE.Vector3(), gl = new THREE.Vector3(), cp = new THREE.Vector3(), cl = new THREE.Vector3();
  function openFrame(c) {
    // the main loop already placed the chase camera: that is where the flight lands
    gp.copy(camera.position); camera.getWorldDirection(tv); gl.copy(gp).addScaledVector(tv, 6);
    const k = Math.min(1, c.t / (c.dur * 0.84)), kk = k * k * (3 - 2 * k) * 0.35 + k * 0.65;
    c.path.getPoint(kk, cp); c.look.getPoint(kk, cl);
    const b = seg(c.t, c.dur * 0.8, c.dur);
    camera.position.lerpVectors(cp, gp, b); tl.lerpVectors(cl, gl, b); camera.lookAt(tl);
    camera.fov = 50 + 12 * b; camera.updateProjectionMatrix();
    let li = -1; for (let i = 0; i < c.locs.length; i++) if (c.t >= c.locs[i].at) li = i;
    if (li !== c.li) {
      c.li = li; const el = $('cineLoc'); el.classList.remove('show');
      if (li >= 0) { $('cineLocK').textContent = c.locs[li].k; $('cineLocT').textContent = c.locs[li].t; void el.offsetWidth; el.classList.add('show'); }
    }
    if (c.li >= 0 && c.t > (c.locs[c.li + 1]?.at ?? c.dur) - 0.35) $('cineLoc').classList.remove('show');
  }
  function passFrame(c) {
    // a slow low orbit on the player while the payoff card is up
    const k = ease(c.t / c.dur);
    if (!c.camInit) { c.camInit = true; c.a0 = Math.atan2(camera.position.x - c.center.x, camera.position.z - c.center.z); }
    const a = c.a0 + 0.35 + k * 0.9;
    let r = 4.6 - 1.0 * k; const h = 1.3 + 0.9 * k;
    while (r > 2 && blocked && blocked(c.center.x + Math.sin(a) * r, c.center.z + Math.cos(a) * r, h)) r -= 0.4;
    camera.position.set(c.center.x + Math.sin(a) * r, h, c.center.z + Math.cos(a) * r);
    camera.lookAt(c.center.x, 1.25, c.center.z);
  }

  // ---------- title screen camera ----------
  const T = { t: 0, shot: 0, init: -1, a0: 0, dur: 7.5 };
  const fade = () => document.getElementById('tiFade');
  function titleFrame(rdt, o) {
    T.t += rdt;
    if (T.t > T.dur) { T.t = 0; T.shot = (T.shot + 1) % 3; }
    const f = fade(); if (f) f.classList.toggle('on', T.t > T.dur - 0.45 || T.t < 0.15);
    const k = T.t / T.dur, P = o.player;
    if (T.init !== T.shot) { // pick a clear starting angle for this shot
      T.init = T.shot;
      const base = T.shot === 0 ? o.ry : T.shot === 1 ? (o.prop ? Math.atan2(o.prop.x - P.x, o.prop.z - P.z) + 0.5 : o.ry + 0.9) : Math.atan2(P.x - o.center.x, P.z - o.center.z);
      const R = T.shot === 0 ? 3.4 : T.shot === 1 ? 9 : 10, H = T.shot === 0 ? 1.2 : T.shot === 1 ? 2.4 : 4;
      const fx = T.shot === 1 && o.prop ? o.prop.x + (P.x - o.prop.x) * 0.3 : P.x, fz = T.shot === 1 && o.prop ? o.prop.z + (P.z - o.prop.z) * 0.3 : P.z;
      T.a0 = base; T.fx = fx; T.fz = fz;
      for (let i = 0; i < 16; i++) { const a = base + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.4; if (clear(fx, fz, [fx + Math.sin(a) * R, H, fz + Math.cos(a) * R])) { T.a0 = a; break; } }
    }
    if (T.shot === 0) { // hero: low and close, sliding around him with the skyline behind
      const a = T.a0 + 0.32 * k, r = 3.5 - 0.3 * k, h = 1.0 + 0.3 * k;
      camera.position.set(P.x + Math.sin(a) * r, h, P.z + Math.cos(a) * r); camera.lookAt(P.x, 1.5, P.z); camera.fov = 40;
    } else if (T.shot === 1) { // the street: the crew, the cruiser and its lights
      const a = T.a0 - 0.22 * k, r = 7.5 - 1.0 * k, h = 1.6 + 0.4 * k;
      camera.position.set(T.fx + Math.sin(a) * r, h, T.fz + Math.cos(a) * r); camera.lookAt(T.fx, 1.2, T.fz); camera.fov = 46;
    } else { // crane up off the corner and out over the city
      const a = T.a0 + 0.12 * k, r = 9 + 6 * k, h = 2.5 + 15 * k;
      camera.position.set(P.x + Math.sin(a) * r, h, P.z + Math.cos(a) * r);
      camera.lookAt(P.x + (o.center.x - P.x) * k * 0.6, 1.5 + 6 * k, P.z + (o.center.z - P.z) * k * 0.6); camera.fov = 52;
    }
    camera.updateProjectionMatrix();
  }

  // any tap, click or key skips the current moment
  const skipEv = (e) => { if (!cur && cardT <= 0) return; if (e.target && e.target.closest && e.target.closest('#start')) return; api.skip(); };
  addEventListener('pointerdown', skipEv, true);
  addEventListener('keydown', (e) => { if (cur && (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape' || e.code === 'KeyE')) { api.skip(); e.stopImmediatePropagation(); } }, true);
  window.__cine = api;
  return api;
}
