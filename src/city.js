// City: painted photo-based textures for walls, ground and storefronts, small
// canvas textures for signs and details. Repeated props use InstancedMesh.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BLOCK, PITCH, GRID, ZONE_R, blockCenter, buildingsFor, districtOf } from './state.js';

let rnd = mulberry(7);
// Painted, photo-based textures (public/tex, WebP, 512 or 1024 px). The loader
// returns textures at once and fills them in when the image arrives.
const loader = new THREE.TextureLoader();
const texCache = new Map();
let TEXBASE = './';
function painted(name, rx = 1, ry = 1, srgb = true) {
  let base = texCache.get(name);
  if (!base) { base = loader.load(`${TEXBASE}tex/${name}.webp`); base.wrapS = base.wrapT = THREE.RepeatWrapping; base.anisotropy = 4; if (srgb) base.colorSpace = THREE.SRGBColorSpace; texCache.set(name, base); }
  if (rx === 1 && ry === 1) return base;
  const t = base.clone(); t.repeat.set(rx, ry); return t;
}
function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, rx = 1, ry = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function grain(g, w, h, amt, n = 4000) { for (let i = 0; i < n; i++) { const v = rnd() < 0.5 ? 0 : 255; g.fillStyle = `rgba(${v},${v},${v},${amt * rnd()})`; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2); } }

function drawConcrete(g, w, h, base) {
  g.fillStyle = base; g.fillRect(0, 0, w, h); grain(g, w, h, 0.12, 9000);
  g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 2;
  for (let y = 0; y <= h; y += h / 6) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(20,15,10,${0.08 + rnd() * 0.1})`; const x = rnd() * w; g.fillRect(x, rnd() * h, 4 + rnd() * 10, 40 + rnd() * 120); }
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

function fenceTexture() {
  const [c, g] = canvas(64, 64);
  g.strokeStyle = 'rgba(170,170,170,1)'; g.lineWidth = 2;
  for (let i = -64; i < 128; i += 12) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.stroke(); g.beginPath(); g.moveTo(i + 64, 0); g.lineTo(i, 64); g.stroke(); }
  return tex(c, 4, 1);
}


// The city is built in sections (one per block) on demand as the player moves,
// and sections far away are hidden. Textures and materials are shared.
export function buildCity(scene, LOW, blocks, base = './') {
  TEXBASE = base;
  rnd = mulberry(7);
  const S = LOW ? 256 : 512;
  const out = { blockViz: [], emissive: [], nightOnly: [], signals: null, neon: [], lamps: [] };
  const SIZE = GRID * PITCH + 80;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), v3 = new THREE.Vector3(), v3b = new THREE.Vector3();

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), new THREE.MeshStandardMaterial({ map: painted('asphalt', SIZE / 14, SIZE / 14), roughness: 0.82 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = !LOW; scene.add(ground);
  // harbor water beyond the far edge
  const water = new THREE.Mesh(new THREE.PlaneGeometry(SIZE * 3, 200), new THREE.MeshStandardMaterial({ color: 0x0c1a22, roughness: 0.15, metalness: 0.6 }));
  const water2 = new THREE.Mesh(new THREE.PlaneGeometry(200, SIZE * 3), new THREE.MeshStandardMaterial({ color: 0x0c1a22, roughness: 0.15, metalness: 0.6 }));
  water.rotation.x = -Math.PI / 2; water.position.set(0, -0.3, SIZE / 2 + 100); scene.add(water);
  water2.rotation.x = -Math.PI / 2; water2.position.set(SIZE / 2 + 100, -0.31, 0); scene.add(water2);

  const sidewalkMat = new THREE.MeshStandardMaterial({ map: painted('sidewalk', (BLOCK + 4) / 6, (BLOCK + 4) / 6), roughness: 0.9 });
  const [lc, lg] = canvas(S / 2, S / 2); drawConcrete(lg, S / 2, S / 2, '#4a4642');
  const lotMat = new THREE.MeshStandardMaterial({ map: tex(lc, 4, 4), roughness: 0.95 });
  // dry yard grass for the Eastside
  const [yc, yg] = canvas(128, 128); yg.fillStyle = '#5a5a34'; yg.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 2200; i++) { const c = ['#6a6a3a', '#4a4a2a', '#7a6a42', '#3e4628', '#8a7a52'][Math.floor(rnd() * 5)]; yg.fillStyle = c; yg.fillRect(rnd() * 128, rnd() * 128, 1, 2 + rnd() * 3); }
  const yardMat = new THREE.MeshStandardMaterial({ map: tex(yc, 6, 6), roughness: 1 });
  const courtMat = new THREE.MeshStandardMaterial({ map: painted('court'), roughness: 0.8 });

  // road markings (global, instanced)
  const dashGeo = new THREE.PlaneGeometry(0.25, 2.4); dashGeo.rotateX(-Math.PI / 2);
  const dashes = [], cross = [], stops = [];
  for (let i = 0; i <= GRID; i++) {
    const L = (i - GRID / 2) * PITCH;
    for (let t = -GRID * PITCH / 2 + 2; t < GRID * PITCH / 2; t += 5) {
      const nearI = Math.abs(((t + PITCH * GRID / 2) % PITCH + PITCH) % PITCH); if (nearI < 10 || nearI > PITCH - 10) continue;
      dashes.push([L, t, 0], [t, L, Math.PI / 2]);
    }
    for (let j = 0; j <= GRID; j++) {
      const M = (j - GRID / 2) * PITCH;
      for (const [ox, oz, r] of [[0, 8.3, Math.PI / 2], [0, -8.3, Math.PI / 2], [8.3, 0, 0], [-8.3, 0, 0]]) for (let k = -6; k <= 6; k += 1.4) cross.push([L + ox + (r ? k : 0), M + oz + (r ? 0 : k), r]);
    }
  }
  const instAll = (geo, mat, list, y) => { const im = new THREE.InstancedMesh(geo, mat, list.length); list.forEach(([x, z, r], i) => im.setMatrixAt(i, m4.compose(v3.set(x, y, z), q.setFromAxisAngle(up, r), one))); scene.add(im); return im; };
  instAll(dashGeo, new THREE.MeshBasicMaterial({ color: 0xb59a3a }), dashes, 0.02);
  const cwGeo = new THREE.PlaneGeometry(0.7, 3.6); cwGeo.rotateX(-Math.PI / 2);
  instAll(cwGeo, new THREE.MeshBasicMaterial({ color: 0x9a9a92 }), cross, 0.02);

  // traffic signals on every intersection: one head per approach
  const sigZ = [], sigX = [], poles = [];
  for (let i = 0; i <= GRID; i++) for (let j = 0; j <= GRID; j++) {
    const x = (i - GRID / 2) * PITCH, z = (j - GRID / 2) * PITCH;
    poles.push([x + 8.6, z + 8.6, 0], [x - 8.6, z - 8.6, 0]);
    sigZ.push([x + 8.6, z + 8.6, 0], [x - 8.6, z - 8.6, Math.PI]);
    sigX.push([x + 8.6, z + 8.6, Math.PI / 2], [x - 8.6, z - 8.6, -Math.PI / 2]);
  }
  const sp = new THREE.CylinderGeometry(0.08, 0.1, 4.2, 6); sp.translate(0, 2.1, 0);
  instAll(sp, new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.5, roughness: 0.6 }), poles, 0);
  const head = new THREE.BoxGeometry(0.35, 0.9, 0.3); head.translate(0, 3.8, -0.25);
  const lampG = new THREE.BoxGeometry(0.22, 0.22, 0.05); lampG.translate(0, 3.8, -0.42);
  const zMat = new THREE.MeshBasicMaterial({ color: 0x20ff40, toneMapped: false }), xMat = new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false });
  const housing = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
  instAll(head, housing, sigZ, 0); instAll(head, housing, sigX, 0);
  instAll(lampG, zMat, sigZ, 0); instAll(lampG, xMat, sigX, 0);
  out.signals = { zMat, xMat };

  // ---- shared materials for painted buildings ----
  const matCache = new Map();
  const wallMat = (name, rx, ry, emis = null, eBase = 0.8, rough = 0.88) => {
    const key = `${name}:${rx.toFixed(2)}:${ry.toFixed(2)}:${emis}`;
    if (matCache.has(key)) return matCache.get(key);
    const m = new THREE.MeshStandardMaterial({ map: painted(name, rx, ry), roughness: rough });
    if (emis) { m.emissiveMap = painted(emis, rx, ry); m.emissive = new THREE.Color(0xffffff); m.emissiveIntensity = eBase; out.emissive.push([m, eBase]); }
    matCache.set(key, m); return m;
  };
  const [rc, rg] = canvas(S / 4, S / 4); drawConcrete(rg, S / 4, S / 4, '#3a3836');
  const roofMat = new THREE.MeshStandardMaterial({ map: tex(rc, 3, 3), roughness: 0.95 });
  const shingleMat = new THREE.MeshStandardMaterial({ color: 0x4a3a32, roughness: 0.95, flatShading: true });
  const neon = ['#ff3355', '#33ddff', '#ffcc33', '#66ff66', '#ff66ff', '#ff8833'];
  const fenceMat = new THREE.MeshStandardMaterial({ map: fenceTexture(), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.5 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x8a8d90, roughness: 0.5, metalness: 0.6 });
  const parMat = new THREE.MeshStandardMaterial({ color: 0x2c2a28, roughness: 0.9 });
  const muralMat = new THREE.MeshStandardMaterial({ map: painted('graffiti'), roughness: 0.9 });
  const gateMat = new THREE.MeshStandardMaterial({ map: painted('gate'), roughness: 0.7, metalness: 0.2 });
  const porchMat = new THREE.MeshStandardMaterial({ color: 0x6a5a48, roughness: 0.9 });

  // palm: tapered trunk plus a crown of drooping alpha fronds in one geometry
  const frondTex = (() => {
    const [c, g] = canvas(64, 256); g.clearRect(0, 0, 64, 256);
    g.strokeStyle = '#4a4a26'; g.lineWidth = 3; g.beginPath(); g.moveTo(32, 256); g.lineTo(32, 0); g.stroke();
    for (let y = 8; y < 250; y += 5) { const L = 28 * Math.sin((y / 256) * Math.PI) + 3; g.strokeStyle = ['#56602e', '#46532a', '#6a6a36'][y % 3]; g.lineWidth = 3; g.beginPath(); g.moveTo(32, y); g.lineTo(32 - L, y - 12); g.moveTo(32, y); g.lineTo(32 + L, y - 12); g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const crownParts = [];
  for (let i = 0; i < 9; i++) {
    const f = new THREE.PlaneGeometry(1.3, 4.4, 1, 3); f.translate(0, 2.2, 0);
    const pos = f.attributes.position; for (let k = 0; k < pos.count; k++) { const y = pos.getY(k); pos.setZ(k, -0.05 * y * y); }
    f.rotateX(-1.05 - (i % 3) * 0.18); f.rotateY((i / 9) * Math.PI * 2 + (i % 2) * 0.2); crownParts.push(f);
  }
  const G = {
    ac: new THREE.BoxGeometry(2, 1, 1.4), tower: new THREE.CylinderGeometry(1.4, 1.4, 2.6, 10).translate(0, 3, 0),
    dumpster: new THREE.BoxGeometry(1.8, 1.5, 3), bag: new THREE.IcosahedronGeometry(0.45, 0), hydrant: new THREE.CylinderGeometry(0.2, 0.25, 0.9, 6),
    trunk: new THREE.CylinderGeometry(0.15, 0.22, 3, 5).translate(0, 1.5, 0), crown: new THREE.IcosahedronGeometry(1.8, 1).translate(0, 4.2, 0),
    palmTrunk: new THREE.CylinderGeometry(0.15, 0.3, 9, 6, 3).translate(0, 4.5, 0), palmCrown: mergeGeometries(crownParts).translate(0, 8.9, 0),
    pole: mergeGeometries([new THREE.CylinderGeometry(0.12, 0.17, 9, 5).translate(0, 4.5, 0), new THREE.BoxGeometry(2.4, 0.14, 0.14).translate(0, 8.3, 0), new THREE.CylinderGeometry(0.3, 0.3, 0.8, 6).translate(0.35, 7.5, 0)]),
    hoop: mergeGeometries([new THREE.CylinderGeometry(0.08, 0.08, 3.4, 5).translate(0, 1.7, 0), new THREE.CylinderGeometry(0.9, 0.9, 1.1, 4, 1, false).scale(1, 1, 0.06).rotateY(Math.PI / 4).translate(0, 3.5, 0.35)]),
  };
  const M = {
    tower: new THREE.MeshStandardMaterial({ color: 0x5a3a26, roughness: 0.9 }), dumpster: new THREE.MeshStandardMaterial({ color: 0x23502e, roughness: 0.6, metalness: 0.4 }),
    bag: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 }), hydrant: new THREE.MeshStandardMaterial({ color: 0xa82020, roughness: 0.5 }),
    trunk: new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 1 }), crown: new THREE.MeshStandardMaterial({ color: 0x3a4424, roughness: 0.9, flatShading: true }),
    palmTrunk: new THREE.MeshStandardMaterial({ color: 0x7a6650, roughness: 1 }),
    palmCrown: new THREE.MeshStandardMaterial({ map: frondTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 }),
    pole: new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 1 }), hoop: new THREE.MeshStandardMaterial({ color: 0xc8c8c0, roughness: 0.6, metalness: 0.3 }),
  };
  const wireMat = new THREE.LineBasicMaterial({ color: 0x141210 });
  const courtBlock = blocks.find((b) => districtOf(b) === 0 && b.gx === 1 && b.gz === 0);

  // face order on a box: +x, -x, +y, -y, +z, -z
  const faceX = (sx) => (sx > 0 ? 0 : 1), faceZ = (sz) => (sz > 0 ? 4 : 5);
  function buildBlock(b) {
    const grp = new THREE.Group();
    const add = (o) => { grp.add(o); return o; };
    const c = blockCenter(b), dist = districtOf(b);
    const props = { ac: [], tower: [], dumpster: [], tree: [], palm: [], bag: [], hydrant: [], pole: [], hoop: [] };
    const sw = add(new THREE.Mesh(new THREE.BoxGeometry(BLOCK + 4, 0.22, BLOCK + 4), sidewalkMat)); sw.position.set(c.x, 0.11, c.z); sw.receiveShadow = !LOW;
    const lot = add(new THREE.Mesh(new THREE.BoxGeometry(BLOCK - 2, 0.24, BLOCK - 2), dist === 0 ? yardMat : lotMat)); lot.position.set(c.x, 0.12, c.z); lot.receiveShadow = !LOW;
    if (b === courtBlock) {
      const ct = add(new THREE.Mesh(new THREE.PlaneGeometry(13, 13), courtMat)); ct.rotation.x = -Math.PI / 2; ct.position.set(c.x, 0.25, c.z);
      props.hoop.push([c.x, 0, c.z - 6.4, 0], [c.x, 0, c.z + 6.4, Math.PI]);
    }
    buildingsFor(b).forEach((k, bi) => {
      const mats = new Array(6);
      const side = (rx, ry) => { const a = k.kind === 'store' ? 'cinder' : k.kind === 'house' ? 'stucco' : k.kind === 'shed' ? 'metal' : 'brick'; return wallMat(a, rx, ry); };
      let upperY = 0, upperH = k.h;
      if (k.kind === 'house') {
        mats.fill(side(13 / 4, k.h / 4)); mats[faceX(k.sx)] = mats[faceZ(k.sz)] = wallMat('house', 1, 1, 'house_e', 0.5);
        const roof = add(new THREE.Mesh(new THREE.ConeGeometry(k.w * 0.74, 2.4, 4, 1), shingleMat)); roof.rotation.y = Math.PI / 4; roof.position.set(k.x, k.h + 1.2, k.z); roof.castShadow = !LOW;
        // porch roof and posts on the street sides
        for (const [dx, dz] of [[k.sx, 0], [0, k.sz]]) {
          if ((b.id + bi) % 2 && dz) continue;
          const pr = add(new THREE.Mesh(new THREE.BoxGeometry(dx ? 1.6 : k.w * 0.5, 0.16, dz ? 1.6 : k.w * 0.5), porchMat));
          pr.position.set(k.x + dx * (k.w / 2 + 0.8) - dz * k.w * 0.2, 3.2, k.z + dz * (k.d / 2 + 0.8) - dx * k.w * 0.2);
        }
      } else if (k.kind === 'store') {
        mats.fill(side(13 / 4, k.h / 4)); const front = (b.id % 2 ? 'liquor' : 'market');
        mats[faceX(k.sx)] = mats[faceZ(k.sz)] = wallMat(front, 1, 1, front + '_e', 0.7);
      } else if (k.kind === 'apt') {
        mats.fill(wallMat('apartment', k.w / 9, k.h / 9, 'apartment_e', 0.8));
      } else if (k.kind === 'shed') {
        mats.fill(side(k.w / 6, k.h / 6));
      } else {
        upperY = 4.2; upperH = k.h - 4.2;
        mats.fill(wallMat('tower', k.w / 9, upperH / 9, 'tower_e', 0.9, 0.6));
        const gm = new Array(6).fill(wallMat('cinder', 13 / 4, 4.2 / 4));
        gm[faceX(k.sx)] = gm[faceZ(k.sz)] = (b.id + bi) % 2 ? wallMat('market', 1, 1, 'market_e', 0.6) : gateMat;
        gm[2] = roofMat; gm[3] = roofMat;
        const gf = add(new THREE.Mesh(new THREE.BoxGeometry(k.w, 4.2, k.d), gm)); gf.position.set(k.x, 2.1, k.z); gf.receiveShadow = !LOW;
      }
      mats[2] = roofMat; mats[3] = roofMat;
      const body = add(new THREE.Mesh(new THREE.BoxGeometry(k.w, upperH, k.d), mats));
      body.position.set(k.x, upperY + upperH / 2, k.z); body.castShadow = body.receiveShadow = !LOW;
      if (k.kind !== 'house') { const par = add(new THREE.Mesh(new THREE.BoxGeometry(k.w + 0.4, 0.6, k.d + 0.4), parMat)); par.position.set(k.x, k.h + 0.3, k.z); }
      if (k.kind === 'shed') { // roll-up door on the street side
        const d = add(new THREE.Mesh(new THREE.PlaneGeometry(6, 4.5), gateMat)); d.position.set(k.x + k.sx * (k.w / 2 + 0.05), 2.4, k.z); d.rotation.y = k.sx * Math.PI / 2;
      }
      if (bi === 0) { // hustle sign, a neon box on the roof edge
        const sm = new THREE.MeshBasicMaterial({ map: signTexture(b.hustle, neon[b.id % neon.length], S), toneMapped: false });
        const y = k.kind === 'tower' ? 5.4 : k.h + 1.3;
        const sign = add(new THREE.Mesh(new THREE.PlaneGeometry(7, 1.75), sm)); sign.position.set(k.x + k.sx * (k.w / 2 + 0.08), y, k.z); sign.rotation.y = k.sx * Math.PI / 2;
        out.neon.push([k.x + k.sx * (k.w / 2 + 3.5), k.z, neon[b.id % neon.length]]); // colored spill on the sidewalk below
      }
      // graffiti mural on an alley wall
      if (rnd() < (dist === 1 ? 0.35 : 0.6)) {
        const gp = add(new THREE.Mesh(new THREE.PlaneGeometry(7, 3.5), muralMat));
        if (rnd() < 0.5) { gp.position.set(k.x - k.sx * (k.w / 2 + 0.05), 1.9, k.z); gp.rotation.y = -k.sx * Math.PI / 2; }
        else { gp.position.set(k.x, 1.9, k.z - k.sz * (k.d / 2 + 0.05)); gp.rotation.y = k.sz > 0 ? Math.PI : 0; }
      }
      if (k.kind !== 'house') for (let i = 0; i < 2; i++) props.ac.push([k.x + (rnd() - 0.5) * (k.w - 4), k.h + 1.1, k.z + (rnd() - 0.5) * (k.d - 4), rnd() * 3]);
      if (k.kind === 'apt' && rnd() < 0.5) props.tower.push([k.x + (rnd() - 0.5) * 4, k.h + 0.6, k.z + (rnd() - 0.5) * 4, 0]);
    });
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ex = c.x + dx * (BLOCK / 2 - 3), ez = c.z + dz * (BLOCK / 2 - 3);
      if (rnd() < 0.7) props.dumpster.push([ex + dz * 6.2, 0.95, ez + dx * 6.2, dx ? Math.PI / 2 : 0]);
      for (let i = 0; i < 3; i++) props.bag.push([ex + dz * (5 + rnd()) + (rnd() - 0.5), 0.5, ez + dx * (5 + rnd()) + (rnd() - 0.5), rnd() * 3]);
      if (rnd() < (dist === 0 ? 0.9 : 0.5)) { const f = add(new THREE.Mesh(new THREE.PlaneGeometry(3.5, 2.4), fenceMat)); f.position.set(ex - dz * 6.4, 1.4, ez - dx * 6.4); f.rotation.y = dx ? 0 : Math.PI / 2; }
    }
    // street trees: palms on the Eastside and Harbor, leafy trees downtown
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const t of [-12, 12]) {
      if (rnd() < 0.35) continue;
      const item = [c.x + dx * (BLOCK / 2 + 1.2) + dz * t, 0, c.z + dz * (BLOCK / 2 + 1.2) + dx * t, rnd() * 3];
      (dist === 1 ? props.tree : props.palm).push(item);
    }
    // telephone poles and sagging wires on the Eastside
    if (dist === 0) {
      const pts = [];
      for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        const line = [];
        for (const t of [-19, -6, 6, 19]) { const x = c.x + dx * (BLOCK / 2 + 1.5) + dz * t, z = c.z + dz * (BLOCK / 2 + 1.5) + dx * t; line.push([x, z]); props.pole.push([x, 0, z, dx ? Math.PI / 2 : 0]); }
        for (let i = 0; i < line.length - 1; i++) for (const off of [-1, 0, 1]) {
          const [x0, z0] = line[i], [x1, z1] = line[i + 1], ox = dx * off, oz = dz * off; const N = 5;
          for (let s2 = 0; s2 < N; s2++) {
            const a0 = s2 / N, a1 = (s2 + 1) / N, sag = (a) => 8.3 - 0.9 * 4 * a * (1 - a);
            pts.push(x0 + (x1 - x0) * a0 + ox, sag(a0), z0 + (z1 - z0) * a0 + oz, x0 + (x1 - x0) * a1 + ox, sag(a1), z0 + (z1 - z0) * a1 + oz);
          }
        }
      }
      const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      add(new THREE.LineSegments(wg, wireMat));
    }
    props.hydrant.push([c.x + BLOCK / 2 + 1.4, 0.45, c.z + 4, 0]);
    const inst = (geo, mat, list, shadow, scaleVar) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach(([x, y, z, r], i) => { const sc = scaleVar ? 0.8 + ((i * 37) % 10) / 20 : 1; im.setMatrixAt(i, m4.compose(v3.set(x, y, z), q.setFromAxisAngle(up, r), one.clone().setScalar(sc))); });
      im.castShadow = shadow && !LOW; im.receiveShadow = !LOW; grp.add(im);
    };
    inst(G.ac, metal, props.ac, true); inst(G.tower, M.tower, props.tower, true); inst(G.dumpster, M.dumpster, props.dumpster, true);
    inst(G.bag, M.bag, props.bag, false); inst(G.hydrant, M.hydrant, props.hydrant, false);
    inst(G.trunk, M.trunk, props.tree, true); inst(G.crown, M.crown, props.tree, true);
    inst(G.palmTrunk, M.palmTrunk, props.palm, true, true); inst(G.palmCrown, M.palmCrown, props.palm, true, true);
    inst(G.pole, M.pole, props.pole, false); inst(G.hoop, M.hoop, props.hoop, true);
    scene.add(grp);
    return grp;
  }

  // Harbor docks past the city edge: stacked shipping containers and two cranes
  {
    const [cc, cg] = canvas(64, 64); cg.fillStyle = '#bbb'; cg.fillRect(0, 0, 64, 64);
    for (let x = 0; x < 64; x += 4) { cg.fillStyle = x % 8 ? '#999' : '#ddd'; cg.fillRect(x, 0, 2, 64); }
    for (let i = 0; i < 40; i++) { cg.fillStyle = `rgba(90,50,20,${rnd() * 0.3})`; cg.fillRect(rnd() * 64, rnd() * 64, 2, 4 + rnd() * 10); }
    const ctex = tex(cc, 3, 1);
    const cont = new THREE.BoxGeometry(2.5, 2.6, 6.1); cont.translate(0, 1.3, 0);
    const cols = [0x8a3a22, 0x2a5a7a, 0x6a6a30, 0x2a6a4a, 0x9a7a2a, 0x5a5a62, 0x7a2a2a];
    const list = [];
    const E = GRID * PITCH / 2;
    for (let x = 4; x < E + 30; x += 3.1) for (let st = 0; st < 1 + ((x * 7) | 0) % 3; st++) if (((x * 13) | 0) % 5) list.push([x, st * 2.62, E + 18 + ((x * 3) | 0) % 6, 0]);
    for (let z = 4; z < E + 10; z += 3.1) for (let st = 0; st < 1 + ((z * 5) | 0) % 3; st++) if (((z * 11) | 0) % 5) list.push([E + 18 + ((z * 3) | 0) % 6, st * 2.62, z, Math.PI / 2]);
    const im = new THREE.InstancedMesh(cont, new THREE.MeshStandardMaterial({ map: ctex, roughness: 0.7, metalness: 0.3 }), list.length);
    const col = new THREE.Color();
    list.forEach(([x, y, z, r], i) => { im.setMatrixAt(i, m4.compose(v3.set(x, y, z), q.setFromAxisAngle(up, r + Math.PI / 2), one)); im.setColorAt(i, col.setHex(cols[(i * 5) % cols.length])); });
    scene.add(im);
    const craneMat = new THREE.MeshStandardMaterial({ color: 0xb8582a, roughness: 0.6, metalness: 0.4 });
    for (const [x, z] of [[E * 0.4, E + 32], [E + 32, E * 0.5]]) {
      const parts = [];
      for (const [lx, lz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) parts.push(new THREE.BoxGeometry(0.8, 26, 0.8).translate(lx, 13, lz));
      parts.push(new THREE.BoxGeometry(10, 2, 10).translate(0, 26, 0), new THREE.BoxGeometry(1.6, 1.6, 44).translate(0, 27.5, -8));
      const cr = new THREE.Mesh(mergeGeometries(parts), craneMat); cr.position.set(x, 0, z); cr.rotation.y = x > z ? Math.PI / 2 : 0; scene.add(cr);
    }
  }

  // lamps (global, instanced) with a warm pool of light that shows at night
  const lamps = [];
  for (let i = 0; i <= GRID; i++) for (let j = 0; j <= GRID; j++) {
    const x = (i - GRID / 2) * PITCH, z = (j - GRID / 2) * PITCH;
    for (const [sx, sz] of [[1, -1], [-1, 1]]) lamps.push([x + sx * 8.1, z + sz * 8.1, Math.atan2(-sx, -sz)]);
  }
  const pole = new THREE.CylinderGeometry(0.1, 0.14, 7, 6); pole.translate(0, 3.5, 0);
  instAll(pole, new THREE.MeshStandardMaterial({ color: 0x1d1f20, roughness: 0.6, metalness: 0.5 }), lamps, 0);
  const arm = new THREE.BoxGeometry(0.1, 0.1, 2.2); arm.translate(0, 6.9, 1.1);
  instAll(arm, new THREE.MeshStandardMaterial({ color: 0x1d1f20 }), lamps, 0);
  const lh = new THREE.BoxGeometry(0.5, 0.15, 0.8); lh.translate(0, 6.8, 2.1);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false });
  instAll(lh, lampMat, lamps, 0);
  const poolTex = (() => { const [c, g] = canvas(64, 64); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,150,60,.95)'); gr.addColorStop(0.45, 'rgba(255,130,50,.45)'); gr.addColorStop(1, 'rgba(255,120,40,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return tex(c); })();
  const poolGeo = new THREE.PlaneGeometry(13, 13); poolGeo.rotateX(-Math.PI / 2);
  const pools = new THREE.InstancedMesh(poolGeo, new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), lamps.length);
  lamps.forEach(([x, z, r], i) => pools.setMatrixAt(i, m4.compose(v3.set(x + Math.sin(r) * 2.1, 0.26, z + Math.cos(r) * 2.1), q.identity(), one)));
  scene.add(pools);
  out.nightOnly.push(pools); out.lampMat = lampMat;
  out.lamps = lamps.map(([x, z, r]) => [x + Math.sin(r) * 2.1, z + Math.cos(r) * 2.1]);
  // neon and lit window spill: tinted additive pools on the ground, no lights needed
  const wTex = (() => { const [c, g] = canvas(64, 64); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return tex(c); })();
  const spill = new THREE.InstancedMesh(poolGeo, new THREE.MeshBasicMaterial({ map: wTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), Math.max(1, out.neon.length));
  out.neon.forEach(([x, z, col], i) => { spill.setMatrixAt(i, m4.compose(v3.set(x, 0.27, z), q.identity(), v3b.set(0.8, 1, 0.8))); spill.setColorAt(i, new THREE.Color(col).multiplyScalar(0.55)); });
  spill.count = out.neon.length; scene.add(spill); out.nightOnly.push(spill);

  // territory markers per block
  for (const b of blocks) {
    const c = blockCenter(b);
    const ring = new THREE.Mesh(new THREE.RingGeometry(ZONE_R - 0.35, ZONE_R, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, side: THREE.DoubleSide, toneMapped: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(c.x, 0.27, c.z); scene.add(ring);
    const prog = new THREE.Mesh(new THREE.CircleGeometry(ZONE_R - 0.4, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, toneMapped: false }));
    prog.rotation.x = -Math.PI / 2; prog.position.set(c.x, 0.28, c.z); scene.add(prog);
    const fp = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 6), metal); fp.position.set(c.x, 3, c.z); scene.add(fp);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.3), new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.8, emissive: 0xffffff, emissiveIntensity: 0.25 }));
    flag.position.set(c.x + 1.1, 5.3, c.z); scene.add(flag);
    out.blockViz.push({ ring, prog, flag });
  }

  // section streaming
  const built = new Map();
  const R = LOW ? PITCH * 2.2 : PITCH * 3.2;
  let pending = [];
  out.update = (px, pz) => {
    for (const b of blocks) {
      const c = blockCenter(b), d = Math.hypot(c.x - px, c.z - pz);
      const g = built.get(b.id);
      if (g) g.visible = d < R + PITCH * 0.5;
      else if (d < R && !pending.includes(b)) pending.push(b);
    }
    // build at most one section per frame to avoid hitches
    if (pending.length) { pending.sort((a, b2) => { const ca = blockCenter(a), cb = blockCenter(b2); return Math.hypot(ca.x - px, ca.z - pz) - Math.hypot(cb.x - px, cb.z - pz); }); const b = pending.shift(); built.set(b.id, buildBlock(b)); }
    return built.size;
  };
  out.buildAllNear = (px, pz) => { for (let i = 0; i < 40; i++) out.update(px, pz); };
  return out;
}
