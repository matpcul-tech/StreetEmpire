// One detailed 120 m street block for the ?demo=street preview.
// Built in code from CC0 PBR textures plus original trim, decals and props.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const LEN = 120;
const ROAD_W = 8.4;
const WALK_W = 3.6;
const CURB_H = 0.13;

function loadTex(loader, url, srgb) {
  return new Promise((resolve, reject) => {
    loader.load(url, (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.anisotropy = 4;
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      resolve(t);
    }, undefined, reject);
  });
}

function tiled(tex, rx, ry) {
  if (!tex) return null;
  const t = tex.clone();
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  return t;
}

function paintAO(geo, fn) {
  geo.computeBoundingBox();
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let ao = 0.42 + 0.58 * THREE.MathUtils.smoothstep(y, 0.0, 3.2);
    // corners of a box read darker where two faces meet
    if (fn) ao *= fn(x, y, z, ao);
    ao = THREE.MathUtils.clamp(ao, 0.28, 1);
    col[i * 3] = ao; col[i * 3 + 1] = ao; col[i * 3 + 2] = ao;
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return geo;
}

function box(w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

function cyl(rt, rb, h, x, y, z, seg = 8) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  g.translate(x, y, z);
  return g;
}

function merge(list) {
  const ready = list.filter(Boolean);
  if (!ready.length) return null;
  return mergeGeometries(ready, false);
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function canvasTex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function signTex(text, bg, fg) {
  const [c, g] = canvas(512, 128);
  g.fillStyle = bg; g.fillRect(0, 0, 512, 128);
  g.strokeStyle = fg; g.lineWidth = 8; g.strokeRect(10, 10, 492, 108);
  g.fillStyle = fg;
  g.font = 'bold 52px Arial Black, Impact, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = 52;
  while (g.measureText(text).width > 460 && size > 18) {
    size -= 2; g.font = `bold ${size}px Arial Black, Impact, sans-serif`;
  }
  g.fillText(text, 256, 68);
  const t = canvasTex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

function awningTex(a, b) {
  const [c, g] = canvas(256, 64);
  for (let i = 0; i < 12; i++) {
    g.fillStyle = i % 2 ? a : b;
    g.fillRect((i / 12) * 256, 0, 256 / 12 + 1, 64);
  }
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, 50, 256, 14);
  const t = canvasTex(c); t.repeat.set(2, 1); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

function graffitiTex(seed) {
  const [c, g] = canvas(512, 320);
  g.clearRect(0, 0, 512, 320);
  const rnd = mulberry(seed);
  const pal = ['#6a5a3a', '#3a4a38', '#7a4034', '#c4b08a', '#2a2a28'];
  for (let i = 0; i < 5; i++) {
    g.strokeStyle = pal[i % pal.length];
    g.lineWidth = 10 + rnd() * 14;
    g.beginPath();
    g.moveTo(40 + rnd() * 80, 60 + rnd() * 180);
    g.bezierCurveTo(140 + rnd() * 80, 20 + rnd() * 80, 240 + rnd() * 80, 200 + rnd() * 80, 400 + rnd() * 80, 80 + rnd() * 160);
    g.stroke();
  }
  g.fillStyle = pal[1];
  g.font = 'bold 92px Arial Black, sans-serif';
  g.fillText(['EAST', 'SE', 'BLOCK'][seed % 3], 80 + rnd() * 40, 190);
  const t = canvasTex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

function posterTex(title, sub, bg, fg) {
  const [c, g] = canvas(256, 360);
  g.fillStyle = bg; g.fillRect(0, 0, 256, 360);
  g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(0, 0, 256, 18);
  g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(12, 12, 232, 336);
  g.fillStyle = fg;
  g.font = 'bold 36px Arial Black, sans-serif';
  g.textAlign = 'center';
  g.fillText(title, 128, 150);
  g.font = '20px Arial, sans-serif';
  g.fillText(sub, 128, 200);
  g.fillStyle = 'rgba(0,0,0,0.12)';
  for (let i = 0; i < 40; i++) g.fillRect(Math.random() * 256, Math.random() * 360, 8, 3);
  const t = canvasTex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

function stainTex() {
  const [c, g] = canvas(256, 256);
  const grd = g.createRadialGradient(128, 140, 10, 128, 140, 120);
  grd.addColorStop(0, 'rgba(40,28,18,0.55)');
  grd.addColorStop(1, 'rgba(40,28,18,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  const t = canvasTex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

function crackTex() {
  const [c, g] = canvas(256, 256);
  g.strokeStyle = 'rgba(20,16,12,0.8)';
  g.lineWidth = 3;
  g.beginPath(); g.moveTo(20, 40);
  g.lineTo(70, 80); g.lineTo(90, 70); g.lineTo(140, 150); g.lineTo(200, 170); g.lineTo(240, 230);
  g.stroke();
  g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(90, 70); g.lineTo(120, 40); g.lineTo(150, 55); g.stroke();
  g.beginPath(); g.moveTo(140, 150); g.lineTo(170, 200); g.stroke();
  const t = canvasTex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pbr(maps, rx, ry, extra = {}) {
  return new THREE.MeshStandardMaterial({
    map: tiled(maps.c, rx, ry),
    normalMap: maps.n ? tiled(maps.n, rx, ry) : null,
    roughnessMap: maps.r ? tiled(maps.r, rx, ry) : null,
    roughness: extra.roughness ?? 0.86,
    metalness: extra.metalness ?? 0.04,
    color: extra.color ?? 0xffffff,
    vertexColors: extra.vertexColors !== false,
    envMapIntensity: extra.envMapIntensity ?? 0.45,
    ...extra.rest,
  });
}

export async function loadStreetTextures(base, potato) {
  const loader = new THREE.TextureLoader();
  const sets = ['asphalt', 'sidewalk', 'brick', 'stucco', 'metal', 'concrete'];
  const out = {};
  await Promise.all(sets.map(async (name) => {
    const c = await loadTex(loader, `${base}demo/street/tex/${name}_c.webp`, true);
    const r = await loadTex(loader, `${base}demo/street/tex/${name}_r.webp`, false);
    const n = potato ? null : await loadTex(loader, `${base}demo/street/tex/${name}_n.webp`, false);
    out[name] = { c, n, r };
  }));
  return out;
}

function addMesh(scene, geo, mat, cast, receive) {
  if (!geo) return null;
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = !!cast;
  m.receiveShadow = !!receive;
  scene.add(m);
  return m;
}

function makeBuilding(b, mats, buckets, decals) {
  const side = b.side;
  const facadeZ = side * 8.05;
  const zc = side * (8.05 + b.d / 2);
  const front = facadeZ;
  const inset = side;
  const w = b.w, d = b.d, h = b.h;
  const x = b.x;
  const floorH = 3.15;
  const shopH = 3.55;

  const wallFn = (px, py, pz) => {
    let k = 1;
    const edgeX = Math.min(Math.abs(px - (x - w / 2)), Math.abs(px - (x + w / 2)));
    if (edgeX < 0.35) k *= 0.72;
    const nearFront = Math.abs(pz - front);
    if (nearFront < 0.2 && py < 0.6) k *= 0.75;
    if (py < 0.35) k *= 0.8;
    return k;
  };

  // water table
  buckets.concrete.push(paintAO(box(w + 0.16, 0.42, d + 0.16, x, 0.21, zc), wallFn));
  // ground volume
  const groundMat = b.ground;
  buckets[groundMat].push(paintAO(box(w, Math.min(shopH, h), d, x, Math.min(shopH, h) / 2, zc), wallFn));
  if (h > shopH + 0.2) {
    const uh = h - shopH;
    buckets[b.upper].push(paintAO(box(w - 0.12, uh, d - 0.12, x, shopH + uh / 2, zc), wallFn));
  }
  // parapet
  const py = h + 0.28;
  buckets.concrete.push(paintAO(box(w + 0.3, 0.55, 0.22, x, py, zc + d / 2), wallFn));
  buckets.concrete.push(paintAO(box(w + 0.3, 0.55, 0.22, x, py, zc - d / 2), wallFn));
  buckets.concrete.push(paintAO(box(0.22, 0.55, d + 0.3, x - w / 2, py, zc), wallFn));
  buckets.concrete.push(paintAO(box(0.22, 0.55, d + 0.3, x + w / 2, py, zc), wallFn));
  buckets.concrete.push(paintAO(box(w, 0.18, d, x, h + 0.05, zc), wallFn));

  // storefront recess, glass and door
  const sw = Math.min(w - 1.6, b.shopW || w * 0.72);
  const sx = x + (b.shopOff || 0);
  const out = -side;
  buckets.trim.push(paintAO(box(sw + 0.25, shopH - 0.35, 0.12, sx, (shopH - 0.2) / 2, front + out * 0.06), wallFn));
  const glass = box(sw * 0.42, 2.3, 0.05, sx - sw * 0.22, 1.55, front + out * 0.09);
  paintAO(glass, () => 1);
  buckets.glass.push(glass);
  const door = box(1.1, 2.4, 0.05, sx + sw * 0.28, 1.25, front + out * 0.09);
  paintAO(door, () => 0.85);
  buckets.glass.push(door);
  buckets.trim.push(paintAO(box(1.22, 2.52, 0.08, sx + sw * 0.28, 1.3, front + out * 0.07), wallFn));
  if (b.rollup) {
    buckets.metal.push(paintAO(box(sw * 0.7, 2.8, 0.1, sx, 1.55, front + out * 0.08), wallFn));
  }

  // awning
  const aw = sw * 0.95, az = front - side * 1.25;
  const awn = box(aw, 0.08, 1.5, sx, 3.25, az);
  paintAO(awn, () => 0.9);
  buckets.awning.push(awn);
  buckets.metal.push(paintAO(cyl(0.03, 0.03, 1.3, sx - aw * 0.4, 2.55, front - side * 0.7, 6), wallFn));
  buckets.metal.push(paintAO(cyl(0.03, 0.03, 1.3, sx + aw * 0.4, 2.55, front - side * 0.7, 6), wallFn));

  // sign
  const sign = box(Math.min(sw, 8.5), 0.9, 0.12, sx, 3.85, front - side * 0.18);
  paintAO(sign, () => 1);
  buckets.signs.push({ geo: sign, text: b.shop, bg: b.signBg, fg: b.signFg });

  // upper windows
  const rows = Math.max(1, Math.floor((h - shopH - 0.6) / floorH));
  const cols = Math.max(3, Math.round(w / 3.4));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const wx = x - w / 2 + 1.5 + c * ((w - 3) / Math.max(1, cols - 1));
      const wy = shopH + 0.85 + r * floorH;
      const wz = front + out * 0.05;
      buckets.trim.push(paintAO(box(1.25, 1.5, 0.1, wx, wy, wz), wallFn));
      const gl = box(1.05, 1.28, 0.04, wx, wy, front + out * 0.08);
      paintAO(gl, () => 1);
      buckets.glass.push(gl);
      if (b.lit && (r + c) % 3 !== 1) {
        const em = box(1.0, 1.22, 0.02, wx, wy, front + out * 0.075);
        paintAO(em, () => 1);
        buckets.emit.push(em);
      }
      if (b.bars && r === 0) {
        for (let k = -2; k <= 2; k++) {
          buckets.metal.push(paintAO(box(0.04, 1.3, 0.04, wx + k * 0.18, wy, front + out * 0.11), wallFn));
        }
        buckets.metal.push(paintAO(box(1.0, 0.04, 0.04, wx, wy, front + out * 0.11), wallFn));
      }
      if (b.ac && (c + r) % 4 === 0) {
        buckets.metal.push(paintAO(box(0.85, 0.5, 0.55, wx, wy - 0.95, front + out * 0.42), wallFn));
      }
    }
  }

  // roof AC and vents
  buckets.metal.push(paintAO(box(1.8, 1.1, 1.4, x - w * 0.22, h + 0.7, zc + side * 1.2), wallFn));
  buckets.metal.push(paintAO(cyl(0.35, 0.35, 0.8, x + w * 0.18, h + 0.55, zc, 10), wallFn));

  if (b.fire) {
    const fx = x + w * 0.28;
    for (let i = 1; i <= rows; i++) {
      const y = shopH + i * floorH - 0.4;
      buckets.metal.push(paintAO(box(2.3, 0.08, 1.15, fx, y, front - side * 0.85), wallFn));
      buckets.metal.push(paintAO(box(2.3, 0.06, 0.05, fx, y + 0.95, front - side * 1.35), wallFn));
      buckets.metal.push(paintAO(box(0.06, 0.95, 0.05, fx - 1.1, y + 0.5, front - side * 1.35), wallFn));
      buckets.metal.push(paintAO(box(0.06, 0.95, 0.05, fx + 1.1, y + 0.5, front - side * 1.35), wallFn));
      buckets.metal.push(paintAO(box(0.06, 0.95, 1.15, fx - 1.12, y + 0.5, front - side * 0.85), wallFn));
      buckets.metal.push(paintAO(box(0.06, 0.95, 1.15, fx + 1.12, y + 0.5, front - side * 0.85), wallFn));
      if (i < rows) {
        const sy = y + floorH * 0.5;
        buckets.metal.push(paintAO(box(0.7, 0.08, 1.4, fx - 1.6, sy, front - side * 0.85), wallFn));
      }
    }
    buckets.metal.push(paintAO(box(0.08, shopH + 0.4, 0.08, fx - 1.1, (shopH + 0.4) / 2, front - side * 1.2), wallFn));
    buckets.metal.push(paintAO(box(0.08, shopH + 0.4, 0.08, fx + 1.1, (shopH + 0.4) / 2, front - side * 1.2), wallFn));
  }

  if (b.graffiti) {
    decals.push({
      kind: 'graf', seed: b.graffiti,
      w: 5.2, h: 3.1,
      x: x - w * 0.32, y: 2.2, z: front - side * 0.04,
      ry: side > 0 ? 0 : Math.PI,
    });
  }
  if (b.posters) {
    for (let i = 0; i < 3; i++) {
      decals.push({
        kind: 'poster', i,
        w: 0.9, h: 1.25,
        x: x - w * 0.18 + i * 1.05, y: 1.7, z: front - side * 0.05,
        ry: side > 0 ? 0 : Math.PI,
      });
    }
  }
}

export function buildStreet(scene, maps, LOW) {
  const shadows = !LOW;
  const brick = pbr(maps.brick, 2.4, 1.8, { roughness: 0.9 });
  const stucco = pbr(maps.stucco, 2.2, 1.6, { roughness: 0.92, color: 0xb29a7c });
  const metal = pbr(maps.metal, 1.4, 1.4, { roughness: 0.45, metalness: 0.72, color: 0x9a9690 });
  const concrete = pbr(maps.concrete, 2.0, 2.0, { roughness: 0.94, color: 0x8e877c });
  const sidewalk = pbr(maps.sidewalk, LEN / 3.2, WALK_W / 1.4, { roughness: 0.92 });
  const road = new THREE.MeshPhysicalMaterial({
    map: tiled(maps.asphalt.c, LEN / 4.5, ROAD_W / 2.2),
    normalMap: maps.asphalt.n ? tiled(maps.asphalt.n, LEN / 4.5, ROAD_W / 2.2) : null,
    roughnessMap: maps.asphalt.r ? tiled(maps.asphalt.r, LEN / 4.5, ROAD_W / 2.2) : null,
    roughness: 0.88,
    metalness: 0.08,
    color: 0x9a9692,
    vertexColors: true,
    envMapIntensity: 0.35,
    clearcoat: 0.0,
    clearcoatRoughness: 0.35,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x1a2228, roughness: 0.18, metalness: 0.15, transparent: true, opacity: 0.55,
    transmission: 0.0, envMapIntensity: 1.1, vertexColors: true,
  });
  const trim = new THREE.MeshStandardMaterial({ color: 0x3a342e, roughness: 0.8, metalness: 0.08, vertexColors: true });
  const emit = new THREE.MeshStandardMaterial({ color: 0xffd8a0, emissive: 0xffc278, emissiveIntensity: 0.15, roughness: 0.6, vertexColors: true });
  const awningMat = new THREE.MeshStandardMaterial({ map: awningTex('#6a4030', '#c4b090'), roughness: 0.85, vertexColors: true });
  const stripe = new THREE.MeshStandardMaterial({ color: 0xc8c0a8, roughness: 0.7 });
  const dumpMat = new THREE.MeshStandardMaterial({ color: 0x2f5a38, roughness: 0.55, metalness: 0.25, vertexColors: true });
  const bagMat = new THREE.MeshStandardMaterial({ color: 0x2a2a28, roughness: 0.92, vertexColors: true });
  const hydrantMat = new THREE.MeshStandardMaterial({ color: 0x8a2a22, roughness: 0.45, metalness: 0.2, vertexColors: true });
  const fenceMat = new THREE.MeshStandardMaterial({ color: 0x8a8e88, roughness: 0.45, metalness: 0.55, wireframe: false });

  const buckets = { brick: [], stucco: [], metal: [], concrete: [], glass: [], trim: [], emit: [], awning: [], signs: [] };
  const decals = [];

  const buildings = [
    { x: -40, w: 32, d: 11, h: 7.4, side: 1, ground: 'brick', upper: 'brick', shop: 'EASTSIDE LIQUOR', signBg: '#1a1410', signFg: '#d8b060', bars: true, ac: true, lit: true, graffiti: 3 },
    { x: -1, w: 34, d: 13, h: 13.6, side: 1, ground: 'stucco', upper: 'stucco', shop: 'ROOM TO LET', signBg: '#2a2824', signFg: '#d0c8b0', fire: true, ac: true, lit: true, posters: true },
    { x: 38, w: 36, d: 10.5, h: 8.6, side: 1, ground: 'brick', upper: 'stucco', shop: 'VALLE MARKET', signBg: '#203028', signFg: '#e0d4a8', ac: true, lit: true, posters: true },
    { x: -41, w: 30, d: 12, h: 11.4, side: -1, ground: 'stucco', upper: 'stucco', shop: 'CASA BARBER', signBg: '#2a2018', signFg: '#e8d2b0', fire: true, bars: true, ac: true, lit: true, graffiti: 7 },
    { x: -3, w: 34, d: 11, h: 6.8, side: -1, ground: 'brick', upper: 'metal', shop: 'HARBOR AUTO', signBg: '#1c1c1e', signFg: '#d0d0c4', rollup: true, ac: true, lit: true },
    { x: 37, w: 38, d: 12.5, h: 12.5, side: -1, ground: 'brick', upper: 'stucco', shop: 'NIGHT OWL', signBg: '#1a2430', signFg: '#d8c070', bars: true, ac: true, lit: true, posters: true },
  ];
  for (const b of buildings) makeBuilding(b, { brick, stucco, metal }, buckets, decals);

  // ground: road, sidewalks, curbs
  const roadGeo = new THREE.PlaneGeometry(LEN, ROAD_W, 40, 8);
  roadGeo.rotateX(-Math.PI / 2);
  paintAO(roadGeo, (x, y, z) => {
    let k = 1;
    if (Math.abs(z) > ROAD_W / 2 - 0.8) k *= 0.72;
    if (Math.abs(Math.abs(x) - 20) < 2) k *= 0.85;
    return k * 0.95;
  });
  const roadMesh = addMesh(scene, roadGeo, road, false, shadows);

  const walkGeoN = paintAO(box(LEN, 0.16, WALK_W, 0, 0.08, ROAD_W / 2 + WALK_W / 2), (x, y, z) => (Math.abs(z - (ROAD_W / 2 + 0.15)) < 0.35 ? 0.7 : 1));
  const walkGeoS = paintAO(box(LEN, 0.16, WALK_W, 0, 0.08, -(ROAD_W / 2 + WALK_W / 2)), (x, y, z) => (Math.abs(z + (ROAD_W / 2 + 0.15)) < 0.35 ? 0.7 : 1));
  addMesh(scene, walkGeoN, sidewalk, false, shadows);
  addMesh(scene, walkGeoS, sidewalk, false, shadows);
  addMesh(scene, paintAO(box(LEN, CURB_H, 0.2, 0, CURB_H / 2, ROAD_W / 2), () => 0.7), concrete, false, shadows);
  addMesh(scene, paintAO(box(LEN, CURB_H, 0.2, 0, CURB_H / 2, -ROAD_W / 2), () => 0.7), concrete, false, shadows);

  // lane dashes and sidewalk cracks as stains
  const dashes = [];
  for (let x = -LEN / 2 + 3; x < LEN / 2 - 3; x += 5.5) {
    dashes.push(box(2.4, 0.01, 0.14, x, 0.015, 0));
  }
  addMesh(scene, merge(dashes), stripe, false, false);

  const matMap = { brick, stucco, metal, concrete };
  addMesh(scene, merge(buckets.brick), brick, shadows, shadows);
  addMesh(scene, merge(buckets.stucco), stucco, shadows, shadows);
  addMesh(scene, merge(buckets.metal), metal, shadows, shadows);
  addMesh(scene, merge(buckets.concrete), concrete, shadows, shadows);
  addMesh(scene, merge(buckets.glass), glass, false, false);
  addMesh(scene, merge(buckets.trim), trim, shadows, false);
  const emitMesh = addMesh(scene, merge(buckets.emit), emit, false, false);
  addMesh(scene, merge(buckets.awning), awningMat, shadows, false);

  for (const s of buckets.signs) {
    const mat = new THREE.MeshStandardMaterial({
      map: signTex(s.text, s.bg, s.fg), roughness: 0.55, metalness: 0.1, emissive: 0x22180c, emissiveIntensity: 0.2,
    });
    addMesh(scene, s.geo, mat, false, false);
  }

  // original decals
  const grafA = graffitiTex(3), grafB = graffitiTex(7);
  const posters = [
    posterTex('FRIDAY LIVE', 'EASTSIDE YARD', '#3a2a22', '#d8c8a0'),
    posterTex('LOST DOG', 'ASK AT THE MARKET', '#d8c8a8', '#2a2018'),
    posterTex('NIGHT MARKET', 'HARBOR BLOCK', '#243040', '#e0d4b0'),
  ];
  const stain = stainTex();
  const crack = crackTex();
  const decalMats = [];
  for (const d of decals) {
    let mat;
    if (d.kind === 'graf') mat = new THREE.MeshStandardMaterial({ map: d.seed === 3 ? grafA : grafB, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 });
    else mat = new THREE.MeshStandardMaterial({ map: posters[d.i % posters.length], transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(d.w, d.h), mat);
    m.position.set(d.x, d.y, d.z);
    m.rotation.y = d.ry;
    scene.add(m);
    decalMats.push(m);
  }
  // road stains and cracks
  for (const [tx, tz, sx, sz, kind] of [[-18, 1.4, 3.2, 2.2, stain], [12, -1.1, 4.0, 2.4, stain], [28, 0.6, 2.4, 3.6, crack], [-32, -0.8, 2.8, 2.0, crack], [4, 2.0, 2.2, 1.6, stain]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), new THREE.MeshStandardMaterial({ map: kind, transparent: true, depthWrite: false, roughness: 1 }));
    m.rotation.x = -Math.PI / 2; m.position.set(tx, 0.02, tz); scene.add(m);
  }

  // props: dumpsters, fences, poles with wires, hydrants, trash, crates, cans
  const dump = [], bags = [], hydr = [], poles = [], crates = [], fence = [], cans = [];
  const dumpSpots = [[-23, 6.6, 0.4], [17, 6.5, -0.2], [-22, -6.6, 1.2], [16.5, -6.5, 0.1]];
  for (const [x, z, ry] of dumpSpots) {
    dump.push(paintAO(box(1.9, 1.35, 1.15, x, 0.78, z), (a, y) => y < 0.4 ? 0.65 : 1));
    dump.push(paintAO(box(1.95, 0.1, 1.2, x, 1.5, z), () => 0.8));
  }
  const bagSpots = [[-24.5, 6.2], [-22.2, 7.3], [18.2, 6.1], [15.6, 7.2], [-23.4, -7.1], [17.8, -6.2], [40, 6.4], [-48, -6.5]];
  for (const [x, z] of bagSpots) {
    const g = new THREE.IcosahedronGeometry(0.38 + (Math.abs(x) % 5) * 0.02, 0);
    g.translate(x, 0.42, z);
    paintAO(g, () => 0.85);
    bags.push(g);
  }
  for (const [x, z] of [[-30, 5.5], [8, 5.45], [44, 5.5], [-12, -5.5], [26, -5.45]]) {
    hydr.push(paintAO(cyl(0.16, 0.2, 0.7, x, 0.45, z, 8), () => 0.9));
    hydr.push(paintAO(cyl(0.12, 0.12, 0.18, x, 0.85, z, 8), () => 1));
    hydr.push(paintAO(box(0.42, 0.1, 0.1, x, 0.62, z), () => 1));
  }
  const poleX = [-50, -18, 14, 48];
  const poleTops = [];
  for (const x of poleX) {
    for (const z of [6.9, -6.9]) {
      poles.push(paintAO(cyl(0.13, 0.16, 8.6, x, 4.3, z, 7), () => 0.85));
      poles.push(paintAO(box(0.15, 0.15, 1.8, x, 8.15, z + (z > 0 ? -0.7 : 0.7)), () => 1));
      poleTops.push(new THREE.Vector3(x, 8.35, z));
    }
  }
  // crates
  for (const [x, z] of [[-4, 6.4], [22, -6.5], [51, 6.3]]) {
    crates.push(paintAO(box(0.85, 0.7, 0.7, x, 0.48, z), () => 0.9));
    crates.push(paintAO(box(0.7, 0.55, 0.55, x + 0.15, 1.05, z), () => 0.9));
  }
  // trash cans
  for (const [x, z] of [[-36, 5.6], [2, 5.55], [33, -5.55]]) {
    cans.push(paintAO(cyl(0.22, 0.24, 0.75, x, 0.5, z, 8), () => 0.85));
  }
  // alley fences
  for (const [x, z, w] of [[-22.5, 10.5, 6], [17.5, 10.2, 5.5], [-23, -10.4, 6], [16.8, -10.3, 5.5]]) {
    const g = new THREE.PlaneGeometry(w, 1.8, 8, 2);
    // punch a chain look by keeping the plane and using a canvas alpha
    g.translate(x, 0.95, z);
    fence.push(g);
  }
  const [fc, fg] = canvas(64, 64);
  fg.clearRect(0, 0, 64, 64);
  fg.strokeStyle = '#b0b4ae'; fg.lineWidth = 2;
  for (let i = -64; i < 128; i += 10) {
    fg.beginPath(); fg.moveTo(i, 0); fg.lineTo(i + 64, 64); fg.stroke();
    fg.beginPath(); fg.moveTo(i + 64, 0); fg.lineTo(i, 64); fg.stroke();
  }
  const fenceTex = canvasTex(fc, false);
  fenceTex.wrapS = fenceTex.wrapT = THREE.RepeatWrapping; fenceTex.repeat.set(6, 2);
  fenceMat.map = fenceTex; fenceMat.transparent = true; fenceMat.alphaTest = 0.25; fenceMat.side = THREE.DoubleSide;

  addMesh(scene, merge(dump), dumpMat, shadows, shadows);
  addMesh(scene, merge(bags), bagMat, shadows, false);
  addMesh(scene, merge(hydr), hydrantMat, shadows, false);
  addMesh(scene, merge(poles), new THREE.MeshStandardMaterial({ color: 0x4a4034, roughness: 0.9, vertexColors: true }), shadows, false);
  addMesh(scene, merge(crates), new THREE.MeshStandardMaterial({ color: 0x6a5438, roughness: 0.9, vertexColors: true }), shadows, false);
  addMesh(scene, merge(cans), metal, shadows, false);
  addMesh(scene, merge(fence.map((g) => { paintAO(g, () => 1); return g; })), fenceMat, false, false);

  // wires between poles on each side
  const wireGeos = [];
  for (const z of [6.9, -6.9]) {
    const pts = poleX.map((x) => new THREE.Vector3(x, 8.2, z));
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const mid = a.clone().lerp(b, 0.5); mid.y -= 1.1;
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      const tube = new THREE.TubeGeometry(curve, 10, 0.025, 4, false);
      paintAO(tube, () => 0.8);
      wireGeos.push(tube);
    }
  }
  addMesh(scene, merge(wireGeos), new THREE.MeshStandardMaterial({ color: 0x1a1816, roughness: 0.7 }), false, false);

  // streetlights
  const lampMats = [];
  const lampPositions = [];
  const lightHeads = [];
  for (const [x, z, face] of [[-46, 5.7, 1], [-10, 5.7, 1], [22, 5.7, 1], [50, 5.7, 1], [-34, -5.7, -1], [6, -5.7, -1], [38, -5.7, -1]]) {
    const pole = paintAO(cyl(0.09, 0.12, 5.6, x, 2.8, z, 7), () => 0.85);
    const arm = paintAO(box(0.1, 0.1, 1.6, x, 5.55, z - face * 0.7), () => 1);
    const head = paintAO(box(0.35, 0.16, 0.5, x, 5.45, z - face * 1.35), () => 1);
    lightHeads.push(pole, arm);
    const bulb = box(0.28, 0.08, 0.36, x, 5.36, z - face * 1.35);
    paintAO(bulb, () => 1);
    lampMats.push(bulb);
    lampPositions.push(new THREE.Vector3(x, 5.3, z - face * 1.35));
  }
  addMesh(scene, merge(lightHeads), new THREE.MeshStandardMaterial({ color: 0x3a3a38, roughness: 0.55, metalness: 0.4, vertexColors: true }), shadows, false);
  const lampEmit = new THREE.MeshStandardMaterial({ color: 0xffe1a8, emissive: 0xffc878, emissiveIntensity: 0.2, roughness: 0.4 });
  addMesh(scene, merge(lampMats), lampEmit, false, false);

  // night puddles
  const puddles = [];
  for (const [x, z, sx, sz] of [[-14, 0.8, 3.8, 1.5], [9, -1.3, 4.6, 1.7], [31, 0.4, 3.2, 1.3], [-36, -0.6, 2.8, 1.2], [48, 1.1, 3.4, 1.4]]) {
    const g = new THREE.CircleGeometry(1, 20);
    g.rotateX(-Math.PI / 2);
    g.scale(sx / 2, 1, sz / 2);
    g.translate(x, 0.018, z);
    puddles.push(g);
  }
  const puddleMat = new THREE.MeshPhysicalMaterial({
    color: 0x2a2c30, roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.0,
    clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.6,
  });
  const puddleMesh = addMesh(scene, merge(puddles), puddleMat, false, false);

  // prop count note: 4 dumpsters, 8 bags, 5 hydrants, 8 poles, 3 crate stacks,
  // 3 cans, 4 fence runs, 7 streetlights, wires, 1 parked car (added by caller)

  return {
    road, roadMesh, emit, lampEmit, puddleMat, puddleMesh, glass,
    lampPositions,
    nightOnly: [puddleMesh],
    buildings,
    length: LEN,
  };
}

export { LEN, ROAD_W, WALK_W };
