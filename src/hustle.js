// What a block's crew is doing, drawn: the props for each block's scene on its south sidewalk.
// A dice game (chalk ring, two dice, a few bills), a card table with crates to sit on, or a boombox
// on a crate with a cooler. The people standing around them come from the simulation (state.js,
// sceneSpot and sceneOf); this file only builds and removes the props near the player and rolls the dice.
import * as THREE from 'three';
import { sceneSpot, sceneOf } from './state.js';

const Y = 0.22; // top of the sidewalk
const NEAR = 95, FAR = 115; // build inside NEAR, drop outside FAR

export function createHustle(scene, LOW) {
  const lam = (color) => new THREE.MeshLambertMaterial({ color });
  const M = {
    chalk: new THREE.MeshBasicMaterial({ color: 0xe9e4d6, transparent: true, opacity: 0.78, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    die: new THREE.MeshLambertMaterial({ color: 0xffffff, map: pipTexture() }),
    bill: lam(0x5fa364), card2: lam(0xb08a5a), felt: lam(0x2f5a3c), leg: lam(0x26262a), card: lam(0xf1ede2), chipR: lam(0xb8322a), chipB: lam(0x2b4f9a),
    crateB: lam(0x2b5fa8), crateR: lam(0xa83a2b), crateG: lam(0x55585c), box: lam(0x1e1e22), speaker: lam(0x8d9096), trim: lam(0xc9c2b0), cooler: lam(0x2f6fb0), lid: lam(0xe8e8e4),
  };
  const G = {
    ring: new THREE.RingGeometry(0.84, 0.93, 32).rotateX(-Math.PI / 2), board: new THREE.BoxGeometry(1.1, 0.3, 0.03),
    die: new THREE.BoxGeometry(0.13, 0.13, 0.13), bill: new THREE.BoxGeometry(0.2, 0.008, 0.09),
    top: new THREE.BoxGeometry(0.95, 0.04, 0.95), leg: new THREE.BoxGeometry(0.04, 0.72, 0.04), card: new THREE.BoxGeometry(0.065, 0.004, 0.09), chip: new THREE.CylinderGeometry(0.022, 0.022, 0.012, 10),
    crate: new THREE.BoxGeometry(0.38, 0.3, 0.38), box: new THREE.BoxGeometry(0.62, 0.3, 0.16), speaker: new THREE.CylinderGeometry(0.1, 0.1, 0.02, 16).rotateX(Math.PI / 2), handle: new THREE.BoxGeometry(0.4, 0.025, 0.03),
    cooler: new THREE.BoxGeometry(0.5, 0.3, 0.32), lid: new THREE.BoxGeometry(0.52, 0.05, 0.34),
  };
  const put = (g, geo, mat, x, y, z, ry = 0, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = shadow && !LOW; m.receiveShadow = !LOW; g.add(m); return m; };
  // every block's props are placed from its id, so a block always looks the same
  const rnd = (id, k) => { const v = Math.sin(id * 127.1 + k * 311.7) * 43758.5453; return v - Math.floor(v); };

  const build = {
    dice(g, id) {
      put(g, G.ring, M.chalk, 0, 0.012, 0, 0, false);
      g.userData.dice = [0, 1].map((k) => { const d = put(g, G.die, M.die, -0.12 + k * 0.26, 0.065, -0.3 - k * 0.12, rnd(id, k) * 6); d.userData.rest = d.position.clone(); return d; });
      for (let k = 0; k < 7; k++) put(g, G.bill, M.bill, -0.45 + rnd(id, 10 + k) * 0.9, 0.006 + k * 0.004, 0.25 + rnd(id, 20 + k) * 0.4, rnd(id, 30 + k) * 3, false); // the pot, on the street side
      put(g, G.board, M.card2, 0, 0.15, -0.72, 0.05); // a flattened box stood up as the backstop the dice are thrown against
      put(g, G.crate, M.crateG, 1.05, 0.15, -0.95, 0.3); // somebody's seat, off to the side
    },
    cards(g, id) {
      put(g, G.top, M.felt, 0, 0.74, 0);
      for (const [x, z] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]]) put(g, G.leg, M.leg, x, 0.36, z);
      for (let k = 0; k < 6; k++) put(g, G.card, M.card, -0.2 + rnd(id, k) * 0.4, 0.764 + k * 0.001, -0.15 + rnd(id, 10 + k) * 0.3, rnd(id, 20 + k) * 6, false);
      for (let k = 0; k < 7; k++) put(g, G.chip, k % 2 ? M.chipR : M.chipB, 0.22 + rnd(id, 30 + k) * 0.14, 0.767 + (k % 3) * 0.012, 0.2 + rnd(id, 40 + k) * 0.14, 0, false);
      put(g, G.crate, M.crateB, -0.2, 0.15, 0.95, 0.2); put(g, G.crate, M.crateR, 1.0, 0.15, 0.7, -0.4);
    },
    stoop(g) {
      put(g, G.crate, M.crateR, 0, 0.15, -0.55, 0.15);
      const box = new THREE.Group(); box.position.set(0, 0.45, -0.55); box.rotation.y = 0.15; g.add(box);
      put(box, G.box, M.box, 0, 0, 0);
      g.userData.speakers = [-0.19, 0.19].map((x) => put(box, G.speaker, M.speaker, x, 0, 0.085, 0, false));
      put(box, G.handle, M.trim, 0, 0.19, 0, 0, false);
      put(g, G.cooler, M.cooler, 1.05, 0.15, 0.25, -0.5); put(g, G.lid, M.lid, 1.05, 0.325, 0.25, -0.5, false);
    },
  };

  const live = new Map(); // block id to its group
  let scanAt = -1e9;
  function update(s, p, now, dt) {
    if (now - scanAt > 400) { scanAt = now; // by the clock, not by frames: a slow phone still gets its props within half a second
      for (const b of s.blocks) {
        const q = sceneSpot(b), d2 = (q.x - p.x) ** 2 + (q.z - p.z) ** 2, have = live.get(b.id);
        if (!have && d2 < NEAR * NEAR) { const g = new THREE.Group(); g.position.set(q.x, Y, q.z); g.userData.kind = sceneOf(b); build[sceneOf(b)](g, b.id); scene.add(g); live.set(b.id, g); }
        else if (have && d2 > FAR * FAR) { scene.remove(have); live.delete(b.id); }
      }
    }
    for (const g of live.values()) {
      const u = g.userData;
      if (u.speakers) { const k = 1 + 0.07 * Math.max(0, Math.sin(now / 130)); for (const sp of u.speakers) sp.scale.set(k, k, 1); } // the cones thump
      if (u.rollT > 0) {
        // the throw: both dice come in from the street side in a low arc, tumbling, and settle where they lie
        u.rollT = Math.max(0, u.rollT - dt); const k = 1 - u.rollT / 0.75, e = 1 - (1 - k) * (1 - k);
        u.dice.forEach((d, i) => {
          const r = d.userData.rest;
          d.position.set(r.x * e + (0.25 - i * 0.5) * (1 - e), 0.065 + Math.abs(Math.sin(k * Math.PI * 2.5)) * 0.22 * (1 - k), r.z * e + 1.25 * (1 - e));
          d.rotation.set((1 - k) * (9 + i * 3), d.userData.yaw + (1 - k) * 7, (1 - k) * (6 - i * 2));
        });
      }
    }
  }
  // a roll at this block's game: the dice land a little differently every time
  function roll(blockId) {
    const g = live.get(blockId); if (!g || !g.userData.dice) return;
    g.userData.rollT = 0.75;
    g.userData.dice.forEach((d, i) => { d.userData.rest.set(-0.35 + Math.random() * 0.7, 0.065, -0.55 + Math.random() * 0.4); if (i && d.userData.rest.distanceTo(g.userData.dice[0].userData.rest) < 0.16) d.userData.rest.x += 0.2; d.userData.yaw = Math.random() * 6; });
  }
  return { update, roll, count: () => live.size };
}

// one face for all six sides: five pips, which reads as "a die" at any distance the game shows it from
function pipTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  x.fillStyle = '#f4f1e8'; x.fillRect(0, 0, 64, 64); x.fillStyle = '#16161a';
  for (const [px, py] of [[16, 16], [48, 16], [32, 32], [16, 48], [48, 48]]) { x.beginPath(); x.arc(px, py, 6, 0, Math.PI * 2); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
