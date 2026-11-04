// Procedural city: textures are drawn on canvases at load time, so no image
// files ship and nothing needs decoding. Repeated props use InstancedMesh.
import * as THREE from 'three';
import { BLOCK, PITCH, GRID, ZONE_R, blockCenter, buildingsFor } from './state.js';

let rnd = mulberry(7);
function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, rx = 1, ry = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function grain(g, w, h, amt, n = 4000) { for (let i = 0; i < n; i++) { const v = rnd() < 0.5 ? 0 : 255; g.fillStyle = `rgba(${v},${v},${v},${amt * rnd()})`; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2); } }

// Wall patterns
function drawBrick(g, w, h, base, mortar) {
  g.fillStyle = mortar; g.fillRect(0, 0, w, h);
  const bw = w / 16, bh = h / 48;
  for (let y = 0; y < 48; y++) for (let x = -1; x < 17; x++) {
    const c = new THREE.Color(base).offsetHSL((rnd() - 0.5) * 0.02, (rnd() - 0.5) * 0.1, (rnd() - 0.5) * 0.08);
    g.fillStyle = '#' + c.getHexString(); g.fillRect(x * bw + (y % 2) * bw / 2 + 1, y * bh + 1, bw - 2, bh - 2);
  }
  grain(g, w, h, 0.15);
}
function drawConcrete(g, w, h, base) {
  g.fillStyle = base; g.fillRect(0, 0, w, h); grain(g, w, h, 0.12, 9000);
  g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 2;
  for (let y = 0; y <= h; y += h / 6) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(20,15,10,${0.08 + rnd() * 0.1})`; const x = rnd() * w; g.fillRect(x, rnd() * h, 4 + rnd() * 10, 40 + rnd() * 120); }
}

// Facade: 4 windows wide by 6 floors tall. Returns color and emissive maps.
function facade(style, S) {
  const [c, g] = canvas(S, S * 1.5), [e, ge] = canvas(S, S * 1.5);
  const W = S, H = S * 1.5;
  if (style.kind === 'brick') drawBrick(g, W, H, style.base, style.mortar); else drawConcrete(g, W, H, style.base);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, W, H);
  const fw = W / 4, fh = H / 6;
  for (let fy = 0; fy < 6; fy++) for (let fx = 0; fx < 4; fx++) {
    const x = fx * fw + fw * 0.22, y = fy * fh + fh * 0.2, ww = fw * 0.56, wh = fh * 0.58;
    g.fillStyle = style.trim; g.fillRect(x - 3, y - 3, ww + 6, wh + 8);
    const lit = rnd() < 0.3;
    const gl = g.createLinearGradient(x, y, x + ww, y + wh);
    gl.addColorStop(0, lit ? '#f6c77a' : '#2a3442'); gl.addColorStop(1, lit ? '#b8783a' : '#10151d');
    g.fillStyle = gl; g.fillRect(x, y, ww, wh);
    g.fillStyle = style.trim; g.fillRect(x + ww / 2 - 1.5, y, 3, wh); g.fillRect(x, y + wh * 0.45, ww, 3);
    if (lit) { ge.fillStyle = rnd() < 0.3 ? '#9fb4ff' : '#ffb15a'; ge.fillRect(x, y, ww, wh); ge.fillStyle = '#000'; ge.fillRect(x + ww / 2 - 1.5, y, 3, wh); }
    else if (rnd() < 0.25) { g.fillStyle = 'rgba(80,60,40,.8)'; g.fillRect(x, y, ww, wh * (0.3 + rnd() * 0.5)); }
    if (rnd() < 0.12) { g.fillStyle = '#2b2b2b'; g.fillRect(x - 6, y + wh + 4, ww + 12, 4); for (let k = 0; k < 6; k++) g.fillRect(x - 6 + k * (ww + 12) / 5, y + wh - 10, 2, 16); }
  }
  // grime streaks
  for (let i = 0; i < 20; i++) { g.fillStyle = `rgba(0,0,0,${0.05 + rnd() * 0.08})`; g.fillRect(rnd() * W, rnd() * H, 2 + rnd() * 6, 30 + rnd() * 200); }
  return { map: tex(c), emissiveMap: tex(e) };
}

function storefront(S, awning) {
  const [c, g] = canvas(S, S / 4), [e, ge] = canvas(S, S / 4), W = S, H = S / 4;
  drawConcrete(g, W, H, '#3a3632'); ge.fillStyle = '#000'; ge.fillRect(0, 0, W, H);
  const n = 3;
  for (let i = 0; i < n; i++) {
    const x = (i + 0.08) * W / n, ww = W / n * 0.84;
    g.fillStyle = '#181a1c'; g.fillRect(x - 3, H * 0.18, ww + 6, H * 0.82);
    const lit = rnd() < 0.75;
    g.fillStyle = lit ? '#8a6238' : '#22282e'; g.fillRect(x, H * 0.22, ww, H * 0.74);
    if (lit) { ge.fillStyle = '#c8873e'; ge.fillRect(x, H * 0.22, ww, H * 0.74); }
    // shelves silhouettes
    g.fillStyle = 'rgba(30,20,10,.55)'; for (let k = 0; k < 3; k++) g.fillRect(x + 4, H * (0.45 + k * 0.17), ww - 8, 3);
    if (rnd() < 0.4) { g.fillStyle = '#555'; for (let k = 0; k < ww; k += 8) g.fillRect(x + k, H * 0.22, 2, H * 0.74); } // security bars
  }
  g.fillStyle = awning; g.fillRect(0, 0, W, H * 0.12);
  return { map: tex(c), emissiveMap: tex(e) };
}

function signTexture(text, color, S) {
  const [c, g] = canvas(S, S / 4);
  g.fillStyle = '#0b0b0d'; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = color; g.lineWidth = 6; g.strokeRect(6, 6, c.width - 12, c.height - 12);
  g.font = `bold ${Math.floor(c.height * 0.5)}px Impact, Arial Black, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = color; g.shadowBlur = 18; g.fillStyle = color;
  let size = Math.floor(c.height * 0.5); while (g.measureText(text.toUpperCase()).width > c.width - 40 && size > 10) { size -= 2; g.font = `bold ${size}px Impact, Arial Black, sans-serif`; }
  g.fillText(text.toUpperCase(), c.width / 2, c.height / 2 + 2);
  const t = tex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

function graffitiTexture(S) {
  const [c, g] = canvas(S, S / 2);
  const tags = ['KINGZ', 'EASTSIDE', 'NO SLEEP', 'BLOCK 9', 'DREAM', 'RISE', 'LOCAL', 'HUSTLE'];
  const cols = ['#e33', '#3ae', '#fc2', '#5e5', '#e5e', '#f80', '#fff'];
  const t = tags[Math.floor(rnd() * tags.length)];
  g.font = `bold ${S / 7}px Impact, Arial Black, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.save(); g.translate(S / 2, S / 4); g.rotate((rnd() - 0.5) * 0.25);
  g.lineWidth = S / 40; g.strokeStyle = '#111'; g.strokeText(t, 0, 0);
  g.fillStyle = cols[Math.floor(rnd() * cols.length)]; g.fillText(t, 0, 0);
  g.lineWidth = S / 120; g.strokeStyle = cols[Math.floor(rnd() * cols.length)]; g.strokeText(t, 0, 0);
  g.restore();
  for (let i = 0; i < 60; i++) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(rnd() * S, rnd() * S / 2, 1, 1 + rnd() * 3); }
  const tx = tex(c); tx.wrapS = tx.wrapT = THREE.ClampToEdgeWrapping; return tx;
}

function fenceTexture() {
  const [c, g] = canvas(64, 64);
  g.strokeStyle = 'rgba(170,170,170,1)'; g.lineWidth = 2;
  for (let i = -64; i < 128; i += 12) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.stroke(); g.beginPath(); g.moveTo(i + 64, 0); g.lineTo(i, 64); g.stroke(); }
  return tex(c, 4, 1);
}

export function buildCity(scene, LOW, blockNames) {
  rnd = mulberry(7);
  const S = LOW ? 256 : 512;
  const out = { blockViz: [], update() {} };
  const SIZE = GRID * PITCH + 60;

  // asphalt
  const [ac, ag] = canvas(S, S); ag.fillStyle = '#2b2a2c'; ag.fillRect(0, 0, S, S); grain(ag, S, S, 0.2, 14000);
  for (let i = 0; i < 6; i++) { ag.fillStyle = 'rgba(10,10,10,.25)'; ag.beginPath(); ag.ellipse(rnd() * S, rnd() * S, 20 + rnd() * 50, 10 + rnd() * 30, rnd() * 3, 0, 7); ag.fill(); }
  const asphalt = new THREE.MeshStandardMaterial({ map: tex(ac, SIZE / 16, SIZE / 16), roughness: 0.85, metalness: 0 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), asphalt);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = !LOW; scene.add(ground);

  // sidewalk
  const [sc, sg] = canvas(S / 2, S / 2); sg.fillStyle = '#77726b'; sg.fillRect(0, 0, S / 2, S / 2); grain(sg, S / 2, S / 2, 0.15, 3000);
  sg.strokeStyle = 'rgba(30,30,30,.5)'; sg.lineWidth = 2; for (let i = 0; i <= S / 2; i += S / 8) { sg.beginPath(); sg.moveTo(i, 0); sg.lineTo(i, S / 2); sg.moveTo(0, i); sg.lineTo(S / 2, i); sg.stroke(); }
  const sidewalkMat = new THREE.MeshStandardMaterial({ map: tex(sc, (BLOCK + 6) / 4, (BLOCK + 6) / 4), roughness: 0.9 });
  const [lc, lg] = canvas(S / 2, S / 2); drawConcrete(lg, S / 2, S / 2, '#4a4642');
  const lotMat = new THREE.MeshStandardMaterial({ map: tex(lc, 4, 4), roughness: 0.95 });

  // road markings (instanced)
  const dashGeo = new THREE.PlaneGeometry(0.25, 2.4); dashGeo.rotateX(-Math.PI / 2);
  const dashes = [], cross = [];
  for (let i = 0; i <= GRID; i++) {
    const L = (i - GRID / 2) * PITCH;
    for (let t = -SIZE / 2 + 2; t < SIZE / 2; t += 5) {
      const nearI = Math.abs(((t + PITCH * 1.5) % PITCH + PITCH) % PITCH) ; if (nearI < 9 || nearI > PITCH - 9) continue;
      dashes.push([L, t, 0], [t, L, Math.PI / 2]);
    }
    for (let j = 0; j <= GRID; j++) {
      const M = (j - GRID / 2) * PITCH;
      for (const [ox, oz, r] of [[0, 8.3, Math.PI / 2], [0, -8.3, Math.PI / 2], [8.3, 0, 0], [-8.3, 0, 0]]) for (let k = -6; k <= 6; k += 1.4) cross.push([L + ox + (r ? k : 0), M + oz + (r ? 0 : k), r]);
    }
  }
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xb59a3a });
  const dm = new THREE.InstancedMesh(dashGeo, lineMat, dashes.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  dashes.forEach(([x, z, r], i) => dm.setMatrixAt(i, m4.compose(new THREE.Vector3(x, 0.02, z), q.setFromAxisAngle(up, r), one)));
  scene.add(dm);
  const cwGeo = new THREE.PlaneGeometry(0.7, 3.6); cwGeo.rotateX(-Math.PI / 2);
  const cm = new THREE.InstancedMesh(cwGeo, new THREE.MeshBasicMaterial({ color: 0x9a9a92 }), cross.length);
  cross.forEach(([x, z, r], i) => cm.setMatrixAt(i, m4.compose(new THREE.Vector3(x, 0.02, z), q.setFromAxisAngle(up, r), one)));
  scene.add(cm);

  // facade materials
  const styles = [
    { kind: 'brick', base: '#7a3b2a', mortar: '#5a4a40', trim: '#2a2522' },
    { kind: 'brick', base: '#5e4636', mortar: '#4a4038', trim: '#d8d0c0' },
    { kind: 'concrete', base: '#6a6660', trim: '#2a2a2a' },
    { kind: 'brick', base: '#8a5a3a', mortar: '#6a5a4a', trim: '#1e2a22' },
    { kind: 'concrete', base: '#857a68', trim: '#3a2a20' },
  ];
  const facades = styles.map((st) => facade(st, S));
  const awnings = ['#7a1a1a', '#1a4a2a', '#1a2a5a', '#5a4a1a', '#333'];
  const fronts = awnings.map((a) => storefront(S, a));
  const [rc, rg] = canvas(S / 4, S / 4); drawConcrete(rg, S / 4, S / 4, '#3a3836');
  const roofMat = new THREE.MeshStandardMaterial({ map: tex(rc, 3, 3), roughness: 0.95 });
  const signWords = ['LIQUOR', 'PAWN', 'LAUNDRY', 'PIZZA', 'CHECKS CASHED', 'BARBER', 'DELI', 'PHONES', 'WINGS', 'TATTOO', 'MOTEL', 'GOLD BUY'];
  const neon = ['#ff3355', '#33ddff', '#ffcc33', '#66ff66', '#ff66ff', '#ff8833'];
  const fenceMat = new THREE.MeshStandardMaterial({ map: fenceTexture(), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.5 });

  const props = { ac: [], tower: [], dumpster: [], tree: [], lamp: [], bag: [], hydrant: [] };
  for (const b of blockNames) {
    const c = blockCenter(b);
    const sw = new THREE.Mesh(new THREE.BoxGeometry(BLOCK + 4, 0.22, BLOCK + 4), sidewalkMat); sw.position.set(c.x, 0.11, c.z); sw.receiveShadow = !LOW; scene.add(sw);
    const lot = new THREE.Mesh(new THREE.BoxGeometry(BLOCK - 2, 0.24, BLOCK - 2), lotMat); lot.position.set(c.x, 0.12, c.z); lot.receiveShadow = !LOW; scene.add(lot);
    buildingsFor(b).forEach((k, bi) => {
      const st = facades[(b.id * 3 + bi) % facades.length];
      const upperH = k.h - 4.2;
      const mk = (t, rx, ry) => { const m = t.clone(); m.repeat.set(rx, ry); m.needsUpdate = true; return m; };
      const wall = new THREE.MeshStandardMaterial({ map: mk(st.map, 1, upperH / 21), emissiveMap: mk(st.emissiveMap, 1, upperH / 21), emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.85 });
      const upper = new THREE.Mesh(new THREE.BoxGeometry(k.w, upperH, k.d), [wall, wall, roofMat, roofMat, wall, wall]);
      upper.position.set(k.x, 4.2 + upperH / 2, k.z); upper.castShadow = upper.receiveShadow = !LOW; scene.add(upper);
      const fr = fronts[(b.id + bi) % fronts.length];
      const shop = new THREE.MeshStandardMaterial({ map: fr.map, emissiveMap: fr.emissiveMap, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.35, metalness: 0.1 });
      const ground = new THREE.Mesh(new THREE.BoxGeometry(k.w, 4.2, k.d), shop); ground.position.set(k.x, 2.1, k.z); ground.receiveShadow = !LOW; scene.add(ground);
      // parapet
      const par = new THREE.Mesh(new THREE.BoxGeometry(k.w + 0.4, 0.6, k.d + 0.4), new THREE.MeshStandardMaterial({ color: 0x2c2a28, roughness: 0.9 })); par.position.set(k.x, k.h + 0.3, k.z); scene.add(par);
      const roofTop = new THREE.Mesh(new THREE.PlaneGeometry(k.w - 0.6, k.d - 0.6), roofMat); roofTop.rotation.x = -Math.PI / 2; roofTop.position.set(k.x, k.h + 0.61, k.z); scene.add(roofTop);
      // awnings on the two street-facing sides
      const awn = new THREE.MeshStandardMaterial({ color: awnings[(b.id + bi) % awnings.length], roughness: 0.8 });
      for (const [dx, dz] of [[k.sx, 0], [0, k.sz]]) {
        const a = new THREE.Mesh(new THREE.BoxGeometry(dx ? 1.6 : k.w * 0.9, 0.1, dz ? 1.6 : k.d * 0.9), awn);
        a.position.set(k.x + dx * (k.w / 2 + 0.75), 3.9, k.z + dz * (k.d / 2 + 0.75)); a.rotation.set(dz * 0.3, 0, -dx * 0.3); a.castShadow = !LOW; scene.add(a);
      }
      // sign facing the street on the x side
      const word = bi === 0 ? b.hustle : signWords[(b.id * 4 + bi) % signWords.length];
      const col = neon[(b.id + bi * 2) % neon.length];
      const sm = new THREE.MeshBasicMaterial({ map: signTexture(word, col, S), toneMapped: false });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.75), sm);
      sign.position.set(k.x + k.sx * (k.w / 2 + 0.06), 5.4, k.z); sign.rotation.y = k.sx * Math.PI / 2; scene.add(sign);
      const sign2 = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.75), sm);
      sign2.position.set(k.x, 5.4, k.z + k.sz * (k.d / 2 + 0.06)); sign2.rotation.y = k.sz > 0 ? 0 : Math.PI; scene.add(sign2);
      // graffiti on alley-facing walls
      if (rnd() < 0.8) {
        const gm = new THREE.MeshBasicMaterial({ map: graffitiTexture(S), transparent: true, depthWrite: false, color: 0xbbbbbb });
        const gp = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.5), gm);
        if (rnd() < 0.5) { gp.position.set(k.x - k.sx * (k.w / 2 + 0.05), 1.8, k.z + (rnd() - 0.5) * 4); gp.rotation.y = -k.sx * Math.PI / 2; }
        else { gp.position.set(k.x + (rnd() - 0.5) * 4, 1.8, k.z - k.sz * (k.d / 2 + 0.05)); gp.rotation.y = k.sz > 0 ? Math.PI : 0; }
        scene.add(gp);
      }
      // rooftop clutter
      for (let i = 0; i < 2; i++) props.ac.push([k.x + (rnd() - 0.5) * (k.w - 4), k.h + 1.1, k.z + (rnd() - 0.5) * (k.d - 4), rnd() * 3]);
      if (rnd() < 0.35) props.tower.push([k.x + (rnd() - 0.5) * 4, k.h + 0.6, k.z + (rnd() - 0.5) * 4, 0]);
    });
    // alley props: dumpsters, trash, fences by the alley mouths
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ex = c.x + dx * (BLOCK / 2 - 3), ez = c.z + dz * (BLOCK / 2 - 3);
      if (rnd() < 0.7) props.dumpster.push([ex + dz * 6.2, 0.95, ez + dx * 6.2, dx ? Math.PI / 2 : 0]);
      for (let i = 0; i < 3; i++) props.bag.push([ex + dz * (5 + rnd()) + (rnd() - 0.5), 0.5, ez + dx * (5 + rnd()) + (rnd() - 0.5), rnd() * 3]);
      if (rnd() < 0.6) {
        const f = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 2.4), fenceMat);
        f.position.set(ex - dz * 6.4, 1.4, ez - dx * 6.4); f.rotation.y = dx ? 0 : Math.PI / 2; scene.add(f);
      }
    }
    // sidewalk trees and hydrants
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const t of [-12, 12]) {
      if (rnd() < 0.35) continue;
      props.tree.push([c.x + dx * (BLOCK / 2 + 1.2) + dz * t, 0, c.z + dz * (BLOCK / 2 + 1.2) + dx * t, rnd() * 3]);
    }
    props.hydrant.push([c.x + BLOCK / 2 + 1.4, 0.45, c.z + 4, 0]);
  }
  // lamps on every intersection corner
  for (let i = 0; i <= GRID; i++) for (let j = 0; j <= GRID; j++) {
    const x = (i - GRID / 2) * PITCH, z = (j - GRID / 2) * PITCH;
    for (const [sx, sz] of [[1, 1], [-1, -1]]) props.lamp.push([x + sx * 8.1, 0, z + sz * 8.1, Math.atan2(-sx, -sz)]);
  }

  const inst = (geo, mat, list, shadow) => {
    if (!list.length) return null;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach(([x, y, z, r], i) => im.setMatrixAt(i, m4.compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(up, r), one)));
    im.castShadow = shadow && !LOW; im.receiveShadow = !LOW; scene.add(im); return im;
  };
  const metal = new THREE.MeshStandardMaterial({ color: 0x8a8d90, roughness: 0.5, metalness: 0.6 });
  inst(new THREE.BoxGeometry(2, 1, 1.4), metal, props.ac, true);
  const twGeo = new THREE.CylinderGeometry(1.4, 1.4, 2.6, 10); twGeo.translate(0, 3, 0);
  inst(twGeo, new THREE.MeshStandardMaterial({ color: 0x5a3a26, roughness: 0.9 }), props.tower, true);
  const legGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.8, 4); legGeo.translate(0, 0.9, 0);
  inst(legGeo, metal, props.tower, false);
  inst(new THREE.BoxGeometry(1.8, 1.5, 3), new THREE.MeshStandardMaterial({ color: 0x23502e, roughness: 0.6, metalness: 0.4 }), props.dumpster, true);
  inst(new THREE.IcosahedronGeometry(0.45, 0), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 }), props.bag, false);
  inst(new THREE.CylinderGeometry(0.2, 0.25, 0.9, 6), new THREE.MeshStandardMaterial({ color: 0xa82020, roughness: 0.5 }), props.hydrant, false);
  const trunk = new THREE.CylinderGeometry(0.15, 0.22, 3, 5); trunk.translate(0, 1.5, 0);
  inst(trunk, new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 1 }), props.tree, true);
  const crown = new THREE.IcosahedronGeometry(1.8, 1); crown.translate(0, 4.2, 0);
  inst(crown, new THREE.MeshStandardMaterial({ color: 0x24361c, roughness: 0.9, flatShading: true }), props.tree, true);
  const pole = new THREE.CylinderGeometry(0.1, 0.14, 7, 6); pole.translate(0, 3.5, 0);
  inst(pole, new THREE.MeshStandardMaterial({ color: 0x1d1f20, roughness: 0.6, metalness: 0.5 }), props.lamp, false);
  const arm = new THREE.BoxGeometry(0.1, 0.1, 2.2); arm.translate(0, 6.9, 1.1);
  inst(arm, new THREE.MeshStandardMaterial({ color: 0x1d1f20 }), props.lamp, false);
  const head = new THREE.BoxGeometry(0.5, 0.15, 0.8); head.translate(0, 6.8, 2.1);
  inst(head, new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false }), props.lamp, false);
  // warm pools of light under lamps (cheap fake on every device)
  const poolTex = (() => { const [c, g] = canvas(64, 64); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,190,110,.55)'); gr.addColorStop(1, 'rgba(255,190,110,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return tex(c); })();
  const poolGeo = new THREE.PlaneGeometry(9, 9); poolGeo.rotateX(-Math.PI / 2);
  const pools = new THREE.InstancedMesh(poolGeo, new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), props.lamp.length);
  props.lamp.forEach(([x, , z, r], i) => pools.setMatrixAt(i, m4.compose(new THREE.Vector3(x + Math.sin(r) * 2.1, 0.26, z + Math.cos(r) * 2.1), q.identity(), one)));
  scene.add(pools);
  if (!LOW) props.lamp.forEach(([x, , z, r], i) => { if (i % 3) return; const l = new THREE.PointLight(0xffb070, 40, 20, 1.8); l.position.set(x + Math.sin(r) * 2.1, 6.3, z + Math.cos(r) * 2.1); scene.add(l); });

  // territory markers per block: zone ring, capture fill and a flag
  for (const b of blockNames) {
    const c = blockCenter(b);
    const ring = new THREE.Mesh(new THREE.RingGeometry(ZONE_R - 0.35, ZONE_R, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, side: THREE.DoubleSide, toneMapped: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(c.x, 0.27, c.z); scene.add(ring);
    const prog = new THREE.Mesh(new THREE.CircleGeometry(ZONE_R - 0.4, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, toneMapped: false }));
    prog.rotation.x = -Math.PI / 2; prog.position.set(c.x, 0.28, c.z); scene.add(prog);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 6), metal); pole.position.set(c.x, 3, c.z); scene.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.3, 6, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.8, emissive: 0xffffff, emissiveIntensity: 0.25 }));
    flag.position.set(c.x + 1.1, 5.3, c.z); scene.add(flag);
    out.blockViz.push({ ring, prog, flag });
  }
  return out;
}
