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
  ['Unc: "There you are. Sit down a second, I got something easy."', 'Unc: "Package came in on the Harbor side. Nobody touches it but you."'],
  ['Unc: "You hear what the Red Kings been saying about us?"', 'You: "I heard."', 'Unc: "Then go make them stop saying it."'],
  ['Unc: "My guy at the chop shop is short one muscle car."', 'You: "Any color?"', 'Unc: "Fast is the only color that matters."'],
  ['Unc: "Look around. This block is ours because we hold it."', 'Unc: "Now we hold one more."'],
];

export function createCine({ camera, sfx, charViz, blocked, scene }) {
  const ray = new THREE.Raycaster();
  const ui = document.createElement('div'); ui.id = 'cine';
  ui.innerHTML = '<div class="bar top"></div><div class="bar bot"></div><div id="cineSub"><b id="cineWho"></b><span id="cineLine"></span></div><div id="cineSkip">Tap to skip</div>';
  document.body.appendChild(ui);
  const card = document.createElement('div'); card.id = 'passCard';
  card.innerHTML = '<div class="pc-k">MISSION PASSED</div><div class="pc-t" id="pcTitle"></div><div class="pc-r" id="pcReward"></div><div class="pc-s" id="pcRep"></div>';
  document.body.appendChild(card);
  const tint = document.createElement('div'); tint.id = 'downTint'; document.body.appendChild(tint);

  let cur = null; // { kind, t, dur, ... }
  let cardT = 0;
  const camFrom = new THREE.Vector3(), lookFrom = new THREE.Vector3(), lookTo = new THREE.Vector3(), tv = new THREE.Vector3(), tl = new THREE.Vector3();

  // a simple swinging driver door, built once per car from its bounds
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.5, metalness: 0.4 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x223040, roughness: 0.1, metalness: 0.6, transparent: true, opacity: 0.7 });
  function doorFor(g) {
    if (g.userData.door) return g.userData.door;
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
    get pausesSim() { return !!cur && (cur.kind === 'brief' || cur.kind === 'swing'); },
    get holdsInput() { return !!cur; },
    skip() { if (cur) cur.t = cur.dur; if (cardT > 0) cardT = Math.min(cardT, 0.3); },
    // car: dir 'in' or 'out'; jack adds the pull out beat
    car(dir, carG, playerG, jackId) {
      if (!carG || !playerG) return;
      if (cur) end();
      doorFor(carG);
      const jack = dir === 'in' && jackId != null;
      cur = { kind: 'car', dir, t: 0, dur: (dir === 'in' ? 1.15 : 0.95) + (jack ? 0.4 : 0), jack: jack ? 0.4 : 0, carG, playerG, jackId, start: playerG.position.clone(), startRy: playerG.rotation.y, camInit: false };
    },
    brief(idx, unc, playerG, intro) {
      if (cur) end();
      const lines = [...(BRIEFS[idx] || []), intro || ''];
      cur = { kind: 'brief', t: 0, lines, per: 2.1, dur: 2.1 * lines.length, unc, playerG, shot: -1 };
      document.body.classList.add('cine-on', 'cine-bars');
    },
    swing(center) { if (cur) end(); cur = { kind: 'swing', t: 0, dur: 1.7, center: new THREE.Vector3(center.x, 0, center.z), camInit: false }; document.body.classList.add('cine-on'); },
    down(busted) { card.classList.remove('show'); cardT = 0; tint.className = busted ? 'busted on' : 'wasted on'; },
    up() { tint.className = ''; },
    passed(title, reward, rep) { $('pcTitle').textContent = title; $('pcReward').textContent = '+$' + reward; $('pcRep').textContent = 'Respect +' + rep; card.classList.add('show'); cardT = 3.2; const b = $('big'); if (b) b.classList.remove('show'); },
    setLine(text) {
      if (!text) { $('cineSub').style.opacity = 0; return; }
      const m = /^(\w+): "(.*)"$/.exec(text);
      $('cineWho').textContent = m ? m[1] : ''; $('cineLine').textContent = m ? m[2] : text; $('cineSub').style.opacity = 1;
    },
    // per frame; returns true when it drove the camera this frame
    update(rdt) {
      if (cardT > 0 && (cardT -= rdt) <= 0) card.classList.remove('show');
      if (!cur) return false;
      cur.t += rdt;
      const c = cur, done = c.t >= c.dur;
      if (c.kind === 'car') carFrame(c, done);
      else if (c.kind === 'brief') briefFrame(c);
      else if (c.kind === 'swing') swingFrame(c);
      if (done) { end(); return false; }
      return true;
    },
    // after the normal camera ran: blend for car moves
    blendCamera() {
      if (!cur || cur.kind !== 'car') return;
      const c = cur;
      if (!c.camInit) { c.camInit = true; camFrom.copy(camera.position); camera.getWorldDirection(tv); lookFrom.copy(camera.position).addScaledVector(tv, 6); }
      const k = seg(c.t, c.jack * 0.6, c.dur);
      camera.getWorldDirection(tv); lookTo.copy(camera.position).addScaledVector(tv, 6);
      camera.position.lerpVectors(camFrom, camera.position, k);
      tl.lerpVectors(lookFrom, lookTo, k); camera.lookAt(tl);
    },
  };

  function end() {
    const c = cur; cur = null;
    if (c.kind === 'car') { const d = c.carG.userData.door; if (d) { d.visible = false; d.rotation.y = 0; } c.playerG.userData.cineHold = false; if (c.dir === 'in') c.playerG.visible = false; c.playerG.rotation.x = 0; if (c.jackG) c.jackG.userData.cineHold = false; }
    if (c.kind === 'brief') { c.unc && (c.unc.userData.cineTalk = false); c.playerG && (c.playerG.userData.cineHold = false); }
    document.body.classList.remove('cine-on', 'cine-bars'); api.setLine(null);
  }

  // car local point to world
  const local = (g, x, y, z, out) => out.set(x, y, z).applyMatrix4(g.matrixWorld);
  const P0 = new THREE.Vector3(), P1 = new THREE.Vector3(), P2 = new THREE.Vector3();
  function carFrame(c, done) {
    c.jackG = c.jackId != null ? charViz.get(c.jackId) : null;
    const g = c.carG, pg = c.playerG, door = g.userData.door, hw = g.userData.halfW || 0.9;
    g.updateMatrixWorld(true);
    pg.userData.cineHold = !done; pg.visible = true;
    const carRy = g.rotation.y;
    if (c.dir === 'in') {
      const t = c.t - c.jack; // the jack beat runs first
      local(g, -hw - 0.75, 0, 0.1, P1); // standing at the open door
      local(g, -0.42, 0.24 + 0.15, 0.15, P2); // in the seat
      if (c.jackG) { // pull the driver out: seat to the curb, staggering back
        const j = Math.max(0, Math.min(1, c.t / c.jack));
        c.jackG.userData.cineHold = c.t < c.jack + 0.5;
        if (c.t < c.jack + 0.5) { local(g, -0.42, 0.3, 0.15, P0); const to = local(g, -hw - 1.9, 0.24, -0.8, new THREE.Vector3()); c.jackG.position.lerpVectors(P0, to, ease(j)); c.jackG.rotation.y = carRy - Math.PI / 2; c.jackG.visible = true; c.jackG.userData.cineAnim = 'Hit_Chest'; }
        local(g, -0.42, 0.24 + 0.15, 0.15, P2);
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
        pg.position.lerpVectors(P1, P2, k); pg.position.y = P1.y + (P2.y - P1.y) * k + Math.sin(k * Math.PI) * 0.05 - Math.sin(k * Math.PI) * 0.25;
        pg.rotation.y = carRy + Math.PI / 2 * (1 - k);
        pg.rotation.x = Math.sin(k * Math.PI) * 0.35; // duck the head under the roof line
        pg.userData.cineAnim = k > 0.5 ? 'Driving_Loop' : 'Idle_Loop';
      }
    } else {
      local(g, -0.42, 0.24 + 0.15, 0.15, P0);
      local(g, -hw - 0.75, 0, 0.1, P1);
      local(g, -2.4, 0, 0, P2);
      if (door) { door.visible = true; door.rotation.y = 1.1 * (seg(c.t, 0, 0.25) - seg(c.t, 0.7, 0.95)); }
      if (c.t < 0.5) {
        const k = seg(c.t, 0.1, 0.5);
        pg.position.lerpVectors(P0, P1, k); pg.position.y = 0.39 - 0.15 * k;
        pg.rotation.y = carRy + Math.PI / 2 * k; pg.rotation.x = Math.sin(k * Math.PI) * 0.35;
        pg.userData.cineAnim = k < 0.4 ? 'Driving_Loop' : 'Idle_Loop';
      } else {
        const k = seg(c.t, 0.5, 0.9);
        pg.position.lerpVectors(P1, P2, k); pg.position.y = 0.24; pg.rotation.x = 0;
        pg.rotation.y = carRy - Math.PI / 2 * 0 + Math.PI / 2; pg.userData.cineAnim = k < 1 ? 'Walk_Loop' : 'Idle_Loop';
      }
    }
  }

  function briefFrame(c) {
    const shot = Math.min(c.lines.length - 1, Math.floor(c.t / c.per));
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
    if (shot !== c.shot) { c.shot = shot; api.setLine(c.lines[shot]); }
    const drift = (c.t % c.per) / c.per; // slow push in on every cut
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
    const [tx, tz] = c.tgt, q = c.cam, k = 1 - drift * 0.12;
    camera.position.set(tx + (q[0] - tx) * k, q[1], tz + (q[2] - tz) * k);
    camera.lookAt(tx, mode === 0 ? 1.35 : 1.52, tz);
    camera.fov = 45; camera.updateProjectionMatrix();
  }

  const from = new THREE.Vector3(), dir = new THREE.Vector3();
  const isChar = (o) => { for (const g of charViz.values()) if (g === o) return true; return false; };
  // true when nothing solid sits between the subject's head and the camera spot
  function clear(tx, tz, q) {
    if (blocked && blocked(q[0], q[2], q[1])) return false;
    from.set(tx, 1.5, tz); dir.set(q[0] - tx, q[1] - 1.5, q[2] - tz); const L = dir.length(); dir.normalize();
    ray.set(from, dir); ray.far = L + 0.3;
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
    const a = c.a0 + k * 1.6, r = 16 - 4 * Math.sin(k * Math.PI), h = 5 + 6 * Math.sin(k * Math.PI);
    camera.position.set(c.center.x + Math.sin(a) * r, h, c.center.z + Math.cos(a) * r);
    camera.lookAt(c.center.x, 2.5, c.center.z);
  }

  // any tap, click or key skips the current moment
  const skipEv = (e) => { if (!cur && cardT <= 0) return; if (e.target && e.target.closest && e.target.closest('#start')) return; api.skip(); };
  addEventListener('pointerdown', skipEv, true);
  addEventListener('keydown', (e) => { if (cur && (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape' || e.code === 'KeyE')) { api.skip(); e.stopImmediatePropagation(); } }, true);
  window.__cine = api;
  return api;
}
