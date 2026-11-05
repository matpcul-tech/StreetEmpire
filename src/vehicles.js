// Cars from Kenney's Car Kit (CC0): sedan, sports (muscle), SUV, van, taxi and
// police. Wheels are separate nodes so they spin and steer. Lights, beams,
// sirens and damage smoke are added in code.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// lowrider: Street Empire pack kitbash (tools/build-se-cars.mjs)
const FILES = { sedan: 'sedan', muscle: 'sedanSports', suv: 'suv', van: 'van', taxi: 'taxi', police: 'police', lowrider: '../se-pack/cars/lowrider' };
const templates = {};
// quality: low and potato skip reflective glass and use cheaper decals; no extra lights or shadows anywhere
const Q = { low: false, potato: false };
export function setCarQuality(low, potato) { Q.low = low; Q.potato = potato; }
// night factor shared by every car material (lamp glow), set once per frame from main
const CARU = { uNight: { value: 0 } };
export function carNight(n) { CARU.uNight.value = n; }
const PAINT = [0x6a2420, 0x2a3a5a, 0x1e1e20, 0x6a6238, 0xc8c2b4, 0x3a4a34, 0x6a6a6e, 0x5a3a4a, 0x8a6a4a];

export async function loadCars(base) {
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  await Promise.all(Object.entries(FILES).map(async ([k, f]) => {
    const g = await loader.loadAsync(`${base}models/cars/${f}.glb`);
    const box = new THREE.Box3().setFromObject(g.scene);
    templates[k] = { scene: g.scene, scale: 4.4 / (box.max.z - box.min.z), minY: box.min.y };
  }));
}

let shared = null;
function glowTex(rgb) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(0.25, `rgba(${rgb},.45)`); gr.addColorStop(1, `rgba(${rgb},0)`); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}
function parts() {
  if (shared) return shared;
  const beam = new THREE.ConeGeometry(2.2, 10, 12, 1, true); beam.translate(0, -5, 0); beam.rotateX(-Math.PI / 2);
  const bc = document.createElement('canvas'); bc.width = 4; bc.height = 64; const g = bc.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, 'rgba(255,240,200,0.9)'); gr.addColorStop(1, 'rgba(255,240,200,0)'); g.fillStyle = gr; g.fillRect(0, 0, 4, 64);
  const beams = mergeGeometries([beam.clone().rotateX(0.06).translate(-0.62, 0.72, 2.3), beam.clone().rotateX(0.06).translate(0.62, 0.72, 2.3)]);
  shared = {
    beam, beams, beamMat: new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(bc), transparent: true, opacity: 0.05, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    lamp: new THREE.BoxGeometry(0.4, 0.14, 0.05),
    head: new THREE.MeshBasicMaterial({ color: 0xfff4d0, toneMapped: false }),
    tail: new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false }),
    tailDim: new THREE.MeshBasicMaterial({ color: 0x8a1010, toneMapped: false }),
    tailBrake: new THREE.MeshBasicMaterial({ color: 0xff3a3a, toneMapped: false }),
    flare: new THREE.SpriteMaterial({ map: glowTex('255,240,210'), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    flareR: new THREE.SpriteMaterial({ map: glowTex('255,40,30'), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    sirenR: new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false }),
    sirenB: new THREE.MeshBasicMaterial({ color: 0x2050ff, toneMapped: false }),
    sirenGeo: new THREE.BoxGeometry(0.35, 0.14, 0.25),
    burnt: new THREE.MeshStandardMaterial({ color: 0x151313, roughness: 1 }),
    lampMat: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  };
  return shared;
}

// Each car type and paint is merged once into a single vertex colored body
// mesh plus four wheel meshes, so a car costs a handful of draw calls. A
// shader adds chrome (per vertex metal flag) and road dirt low on the body.
const PAINT_LOW = [0x5a1a6a, 0x0a6a6a, 0xa8781a, 0x7a0a1a, 0x1a3a8a];
// Car paint (v0.8b): one shader, four wear variants. Per vertex flags mark
// chrome, glass and dirt; aP is the position inside the body box (0..1) so
// rust, scratches, sun bleach, primer spots, stripes and livery are painted in
// the shader without textures.
const carMats = new Map();
const CAR_GLSL = `
varying vec3 vP; varying float vMetal; varying float vDirt; varying vec3 vON;
uniform float uWear, uSeed, uKind; uniform vec3 uStripe;
float ch(vec3 p){ p = fract(p*0.3183099+0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float cn(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(ch(i),ch(i+vec3(1,0,0)),f.x),mix(ch(i+vec3(0,1,0)),ch(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(ch(i+vec3(0,0,1)),ch(i+vec3(1,0,1)),f.x),mix(ch(i+vec3(0,1,1)),ch(i+vec3(1,1,1)),f.x),f.y),f.z); }
`;
function bodyMaterial(wear = 0, kind = 0, stripe = 0xffffff) {
  const key = wear + ':' + kind + ':' + stripe;
  if (carMats.has(key)) return carMats.get(key);
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: kind === 5 ? 0.6 : 0.4, roughness: kind === 5 ? 0.2 : 0.38 });
  const U = { uWear: { value: [0.1, 0.4, 0.7, 1.0][wear] }, uSeed: { value: wear * 7.31 + kind * 1.7 }, uKind: { value: kind }, uStripe: { value: new THREE.Color(stripe) } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, CARU);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aMetal;\nattribute float aDirt;\nattribute vec3 aP;\nattribute float aLamp;\nvarying float vLamp;\n' + CAR_GLSL)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMetal = aMetal; vDirt = aDirt; vP = aP; vON = normal; vLamp = aLamp;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vLamp;\nuniform float uNight;\n' + CAR_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float paintable = step(vMetal, 0.05) * step(0.05, vP.y) * step(vP.x, 1.5) * step(vLamp, 0.5);
        vec3 c = diffuseColor.rgb; float w = uWear;
        // wheels (aP.x = 2, aP.yz = position across the wheel face, 1 at the tire edge)
        if (vP.x > 1.5) {
          float r = length(vP.yz), a = atan(vP.z, vP.y);
          if (vMetal < 0.5) { c = mix(c, vec3(0.2), step(0.66, r) * step(r, 0.78) * step(0.5, abs(vON.x))); // tire sidewall band
            c *= 0.85 + 0.3 * step(0.97, fract(a * 9.549)); } // tread blocks
          else if (uKind > 4.5) { c *= 0.9 + 0.1 * step(0.5, r); } // real wire spokes come from the lowrider GLB
          else { c *= mix(0.35, 1.0, max(step(r, 0.2), step(0.0, sin(a * 5.0)) * step(r, 0.55) + step(0.5, r))); } // five spoke rim
        }
        // lowrider: two tone body, candy lower, cream upper, gold pinstripe
        if (uKind > 4.5 && paintable > 0.0) {
          if (vP.y > 0.6) c = mix(c, uStripe, 0.85);
          if (abs(vP.y - 0.5) < 0.012 && abs(vON.x) > 0.5) c = vec3(0.85, 0.66, 0.22);
          c *= 0.9 + 0.25 * cn(vP * 140.0); } // metal flake
        // livery and markings: taxi checker band, police doors, muscle stripes, crew stickers
        if (uKind > 0.5 && uKind < 1.5 && abs(vP.y - 0.5) < 0.035 && paintable > 0.0) c = mod(floor(vP.z*40.0)+floor(vP.y*60.0), 2.0) < 1.0 ? vec3(0.05) : vec3(0.95);
        if (uKind > 1.5 && uKind < 2.5 && abs(vON.x) > 0.6 && paintable > 0.0) {
          // door panel: white field, navy stripe, gold shield badge, PD block letters (short, hard to mirror-garble)
          if (vP.y < 0.55 && vP.y > 0.28 && abs(vP.z - 0.5) < 0.2) {
            c = vec3(0.93, 0.93, 0.95);
            if (abs(vP.y - 0.42) < 0.016) c = vec3(0.12, 0.22, 0.45);
            // gold shield near the front of the door
            vec2 sh = vec2(vP.z - 0.40, (vP.y - 0.40) * 1.4);
            float badge = step(length(max(abs(sh) - vec2(0.025, 0.02), 0.0)), 0.012) * step(sh.y, 0.04);
            if (badge > 0.5) c = vec3(0.85, 0.68, 0.22);
            // P and D (two letters, drawn so both doors share the same car-forward order)
            float u = (vON.x > 0.0 ? (0.58 - vP.z) : (vP.z - 0.42)) / 0.14;
            float v = (vP.y - 0.33) / 0.07;
            if (u > 0.0 && u < 1.0 && v > 0.05 && v < 0.95 && abs(vP.y - 0.42) >= 0.016) {
              float cell = floor(u * 2.0), x = fract(u * 2.0);
              float ink = 0.0;
              if (cell < 0.5) ink = step(0.15,x)*step(x,0.35)*step(0.1,v)*step(v,0.9) + step(0.15,x)*step(x,0.8)*step(0.1,v)*step(v,0.28) + step(0.15,x)*step(x,0.8)*step(0.45,v)*step(v,0.62) + step(0.6,x)*step(x,0.8)*step(0.1,v)*step(v,0.62); // P
              else ink = step(0.15,x)*step(x,0.35)*step(0.1,v)*step(v,0.9) + step(0.15,x)*step(x,0.8)*step(0.1,v)*step(v,0.28) + step(0.15,x)*step(x,0.8)*step(0.72,v)*step(v,0.9) + step(0.6,x)*step(x,0.8)*step(0.1,v)*step(v,0.9); // D
              if (ink > 0.5) c = vec3(0.08, 0.14, 0.32);
            }
          }
          if (vP.y > 0.18 && vP.y < 0.22 && abs(vP.z) < 0.85) c = vec3(0.9);
        }
        if (uKind > 2.5 && uKind < 3.5 && abs(vP.x - 0.5) < 0.09 && abs(vP.x - 0.5) > 0.03 && vON.y > 0.3 && paintable > 0.0) c = uStripe;
        if (uKind > 3.5 && abs(vON.x) > 0.6 && vP.y > 0.25 && vP.y < 0.42 && paintable > 0.0) c = uStripe * 0.9;
        float st = cn(vec3(vP.z*9.0 + uSeed, vP.y*9.0, uSeed));
        if (paintable > 0.0 && abs(vON.x) > 0.6 && st > 0.93 - 0.02*w && vP.y > 0.3 && vP.y < 0.6) c = mix(c, uStripe, 0.85);
        // mismatched panel or primer spot on one door or fender
        float panel = step(abs(vP.z - fract(uSeed*0.37)*0.8 - 0.1), 0.1) * step(0.5, fract(uSeed*0.53 + w));
        if (paintable > 0.0 && abs(vON.x) > 0.5 && panel > 0.0 && w > 0.3) c = mix(c, mod(uSeed, 2.0) < 1.0 ? vec3(0.42, 0.42, 0.4) : c.gbr * 0.8, 0.9);
        // sun bleached, faded roof and hood
        c = mix(c, vec3(dot(c, vec3(0.33)))*1.15 + 0.06, paintable * w * 0.25 * smoothstep(0.4, 0.95, vON.y));
        // rust at the edges, wheel arches and low panels
        float rn = cn(vP*vec3(14.0, 18.0, 14.0) + uSeed);
        float rust = paintable * smoothstep(0.62 - 0.22*w, 0.8 - 0.2*w, rn) * (1.0 - smoothstep(0.2, 0.55, vP.y)) * w;
        c = mix(c, vec3(0.32, 0.14, 0.06) * (0.7 + 0.6*cn(vP*80.0)), rust);
        // scratches: thin bright horizontal scuffs
        float sc = step(0.985 - 0.01*w, cn(vec3(vP.z*3.0, vP.y*220.0, uSeed))) * step(0.7, cn(vP*7.0 + uSeed));
        c = mix(c, vec3(0.75), sc * paintable * w);
        // road grime: thick low, drips running up from the rockers, dust on top for worn cars
        float drip = smoothstep(0.55, 0.9, cn(vec3(vP.z*70.0, vP.y*4.0, uSeed))) * (1.0 - smoothstep(0.15, 0.6, vP.y));
        c = mix(c, vec3(0.16, 0.12, 0.09), min(1.0, vDirt * (0.5 + 0.45*w) * (0.6 + 0.6*cn(vP*30.0)) + drip * 0.35 * w * paintable));
        c = mix(c, vec3(0.55, 0.48, 0.38), paintable * w * 0.18 * smoothstep(0.5, 0.95, vON.y) * cn(vP*25.0 + 3.0));
        if (vLamp > 0.5) c = vLamp > 1.5 ? vec3(0.5, 0.04, 0.03) : vec3(0.95, 0.92, 0.8);
        diffuseColor.rgb = c;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        // dents: a little noisy normal wobble on worn cars
        float dn = cn(vP*vec3(10.0, 6.0, 10.0) + uSeed*3.0) - 0.5;
        normal = normalize(normal + vec3(dn, -dn*0.5, dn*0.7) * 0.35 * uWear * step(vMetal, 0.05));`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nif (vLamp > 0.5) totalEmissiveRadiance += (vLamp > 1.5 ? vec3(1.6, 0.08, 0.05) * (0.25 + 0.75 * uNight) : vec3(1.4, 1.3, 1.05) * (0.1 + 0.9 * uNight));')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 1.0, vMetal) * (1.0 - vDirt) * (1.0 - 0.6*uWear);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(mix(roughnessFactor + 0.35*uWear*(1.0 - vMetal), 0.08 + 0.25*uWear*cn(vP*20.0), vMetal), 0.95, vDirt);');
  };
  m.customProgramCacheKey = () => 'carpaint';
  carMats.set(key, m); return m;
}
let glassMat = null;
// dark tint: reflective standard glass on medium and high, a flat opaque tint on low and potato
function glass() { return glassMat ||= Q.low ? new THREE.MeshLambertMaterial({ color: 0x0e151c }) : new THREE.MeshStandardMaterial({ color: 0x0a1218, metalness: 0.9, roughness: 0.05, transparent: true, opacity: 0.8, depthWrite: false, envMapIntensity: 2.2 }); }
const geoCache = new Map();
function carGeometry(type, paint) {
  const key = type + ':' + paint;
  if (geoCache.has(key)) return geoCache.get(key);
  const T = templates[type] || templates.sedan;
  T.scene.updateMatrixWorld(true);
  const body = [], wheels = [], col = new THREE.Color();
  const pushGeo = (mesh, mat, matrix, group, start, count) => {
    let g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    if (group) { const n = new THREE.BufferGeometry(); for (const a of ['position', 'normal']) { const at = g.attributes[a]; n.setAttribute(a, new THREE.BufferAttribute(at.array.slice(start * at.itemSize, (start + count) * at.itemSize), at.itemSize, at.normalized)); } g = n; }
    else { for (const a of Object.keys(g.attributes)) if (a !== 'position' && a !== 'normal') g.deleteAttribute(a); }
    // meshopt quantized attributes are normalized ints: go to floats before transforming
    for (const a of ['position', 'normal']) { const at = g.attributes[a]; if (!at) continue; const f = new Float32Array(at.count * 3); for (let i = 0; i < at.count; i++) { f[i * 3] = at.getX(i); f[i * 3 + 1] = at.getY(i); f[i * 3 + 2] = at.getZ(i); } g.setAttribute(a, new THREE.BufferAttribute(f, 3)); }
    g.applyMatrix4(matrix);
    const n = mat.name || '';
    let metal = 0, lamp = 0;
    if (/lightFront/i.test(n)) lamp = 1; else if (/lightBack/i.test(n)) lamp = 2;
    if (/paint/i.test(n) && type !== 'police' && type !== 'taxi') col.setHex(type === 'lowrider' ? PAINT_LOW[paint % PAINT_LOW.length] : PAINT[paint % PAINT.length]);
    else if (/window/i.test(n)) { col.setHex(0x0c1218); metal = 2; }
    else if (/chrome/i.test(n)) { col.setHex(0xe4e4e4); metal = 1; }
    else if (/plastic/i.test(n) && type === 'lowrider') { col.setHex(0xd8d8d8); metal = 1; }
    else if (/carTire/i.test(n)) col.setHex(0x161616);
    else if (/wheelInside/i.test(n)) { col.setHex(paint % 3 === 0 ? 0xd8d8d8 : paint % 3 === 1 ? 0x2a2a2a : 0xa89058); metal = paint % 3 === 1 ? 0 : 1; }
    else if (/_default/i.test(n) && type === 'lowrider') col.setHex(PAINT_LOW[paint % PAINT_LOW.length]); // fenders in candy, chrome comes from the pack parts
    else col.copy(mat.color);
    const cnt = g.attributes.position.count, c = new Float32Array(cnt * 3), m = new Float32Array(cnt), d = new Float32Array(cnt);
    const lm = new Float32Array(cnt).fill(lamp);
    for (let i = 0; i < cnt; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; m[i] = metal; }
    g.setAttribute('aLamp', new THREE.BufferAttribute(lm, 1)); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.setAttribute('aMetal', new THREE.BufferAttribute(m, 1)); g.setAttribute('aDirt', new THREE.BufferAttribute(d, 1));
    return g;
  };
  const meshParts = (mesh, matrix, out) => {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (mats.length === 1) out.push(pushGeo(mesh, mats[0], matrix));
    else { const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry; for (const gr of mesh.geometry.groups) out.push(pushGeo({ geometry: g }, mats[gr.materialIndex], matrix, true, gr.start, gr.count)); }
  };
  const inv = new THREE.Matrix4(), rel = new THREE.Matrix4();
  T.scene.traverse((o) => {
    if (/^wheel_/.test(o.name)) {
      const parts = []; inv.copy(o.matrixWorld).invert();
      o.traverse((m) => { if (m.isMesh) meshParts(m, rel.multiplyMatrices(inv, m.matrixWorld), parts); });
      const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3(); o.matrixWorld.decompose(pos, quat, scl);
      const wg = mergeGeometries(parts); wg.scale(scl.x, scl.y, scl.z); wg.applyQuaternion(quat);
      wheels.push({ geo: wg, pos, front: /front/.test(o.name) });
      return;
    }
    if (o.isMesh) { let p = o.parent, inWheel = false; while (p) { if (/^wheel_/.test(p.name)) inWheel = true; p = p.parent; } if (!inWheel) meshParts(o, o.matrixWorld, body); }
  });
  const glassParts = body.filter((g) => g.attributes.aMetal.getX(0) === 2), solid = body.filter((g) => g.attributes.aMetal.getX(0) !== 2);
  // cheap shape extras merged into the body: bumpers, side mirrors (chrome on the lowrider)
  { const bx = new THREE.Box3(); for (const g of solid) { g.computeBoundingBox(); bx.union(g.boundingBox); } const sz = bx.getSize(new THREE.Vector3());
    const chrome = type === 'lowrider', bcol = new THREE.Color(chrome ? 0xdedede : type === 'police' ? 0x161618 : 0x2a2826);
    const add = (w, h, d, x, y, z, col, metal) => { const b = new THREE.BoxGeometry(w, h, d).toNonIndexed(); b.deleteAttribute('uv'); b.translate(x, y, z); const n = b.attributes.position.count;
      b.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).map((_, i) => [col.r, col.g, col.b][i % 3]), 3)); b.setAttribute('aMetal', new THREE.BufferAttribute(new Float32Array(n).fill(metal), 1));
      b.setAttribute('aDirt', new THREE.BufferAttribute(new Float32Array(n), 1)); b.setAttribute('aLamp', new THREE.BufferAttribute(new Float32Array(n), 1)); solid.push(b); };
    const by = bx.min.y + sz.y * 0.2, bw = sz.x * 0.94, bh = sz.y * 0.07, bd = sz.z * 0.035;
    if (!chrome) { add(bw, bh, bd, 0, by, bx.min.z + bd * 0.3, bcol, 0); add(bw, bh, bd, 0, by, bx.max.z - bd * 0.3, bcol, 0); } // the lowrider GLB has its own chrome bumpers
    const mc = chrome ? bcol : new THREE.Color(0x1c1c1c);
    for (const sx of [-1, 1]) add(sz.x * 0.06, sz.y * 0.045, sz.z * 0.025, sx * sz.x * 0.5, bx.min.y + sz.y * 0.52, bx.min.z + sz.z * (type === 'van' ? 0.2 : 0.36), mc, chrome ? 1 : 0); }
  const merged = mergeGeometries(solid);
  const glassGeo = glassParts.length ? mergeGeometries(glassParts) : null;
  // dirt: strongest near the rocker panels, broken up with a little noise
  merged.computeBoundingBox(); const bb = merged.boundingBox, P = merged.attributes.position, D = merged.attributes.aDirt, M = merged.attributes.aMetal;
  for (let i = 0; i < P.count; i++) {
    const y = (P.getY(i) - bb.min.y) / (bb.max.y - bb.min.y);
    const n = Math.sin(P.getX(i) * 9.1 + P.getZ(i) * 5.3) * 0.5 + 0.5;
    D.setX(i, Math.max(0, 1 - y / 0.42) * (0.35 + 0.5 * n) * (M.getX(i) > 0.5 ? 0.3 : 1) * (type === 'lowrider' ? 0.3 : 1));
  }
  // aP: position inside the body box, for the paint shader
  const ap = new Float32Array(P.count * 3), sz = new THREE.Vector3(); bb.getSize(sz);
  for (let i = 0; i < P.count; i++) { ap[i * 3] = (P.getX(i) - bb.min.x) / sz.x; ap[i * 3 + 1] = (P.getY(i) - bb.min.y) / sz.y; ap[i * 3 + 2] = (P.getZ(i) - bb.min.z) / sz.z; }
  merged.setAttribute('aP', new THREE.BufferAttribute(ap, 3));
  // wheels: aP.x = 2 marks a wheel, aP.yz = position across the wheel face (1 at the tire edge) for the rim and sidewall paint
  for (const w of wheels) { const W = w.geo.attributes.position, n = W.count; let R = 0; for (let i = 0; i < n; i++) R = Math.max(R, Math.hypot(W.getY(i), W.getZ(i)));
    const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = 2; a[i * 3 + 1] = W.getY(i) / R; a[i * 3 + 2] = W.getZ(i) / R; } w.geo.setAttribute('aP', new THREE.BufferAttribute(a, 3)); }
  const out = { body: merged, wheels, glass: glassGeo, decals: decalGeometry(type, paint, merged) };
  geoCache.set(key, out); return out;
}

export function makeCar(c) {
  const P = parts(), T = templates[c.type] || templates.sedan;
  const g = new THREE.Group();
  const model = new THREE.Group();
  model.scale.setScalar(T.scale); model.position.y = -T.minY * T.scale; model.rotation.y = Math.PI; // kit faces -z
  model.rotation.order = 'YXZ';
  const geo = carGeometry(c.type, c.paint);
  let h = 0; for (const ch of String(c.id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const wear = c.type === 'police' ? 0 : c.type === 'lowrider' ? h % 2 : h % 4;
  const kind = { taxi: 1, police: 2, muscle: 3, van: 4, lowrider: 5 }[c.type] || 0;
  const STRIPES = [0xd8d0c0, 0xa82222, 0x2850a8, 0xc89a18, 0x1a1a1a, 0xe0e0e0];
  const TWO = [0xe8dcc0, 0xf0f0f0, 0x1a1a1a]; // lowrider upper tone
  const mat = bodyMaterial(wear, kind, kind === 5 ? TWO[(h >> 3) % 3] : STRIPES[(h >> 3) % STRIPES.length]);
  const body = new THREE.Mesh(geo.body, mat); body.castShadow = true;
  if (c.type === 'lowrider') body.position.y = -0.17 / T.scale; // slammed stance, body tucked over the wheels
  model.add(body);
  const wheels = [];
  if (geo.glass) { const gl = new THREE.Mesh(geo.glass, glass()); gl.renderOrder = 2; body.add(gl); }
  if (geo.decals) body.add(new THREE.Mesh(geo.decals, decalAtlas()));
  for (const w of geo.wheels) { const m = new THREE.Mesh(w.geo, mat); m.position.copy(w.pos); model.add(m); wheels.push({ node: m, front: w.front }); }
  g.add(model);
  const lamps = new THREE.Group();
  for (const x of [-0.62, 0.62]) {
    const h = new THREE.Mesh(P.lamp, P.head); h.position.set(x, 0.75, 2.2); lamps.add(h);
    const t = new THREE.Mesh(P.lamp, P.tail); t.position.set(x, 0.8, -2.2); lamps.add(t);
  }
  const LG = lampGeos(lamps);
  g.add(new THREE.Mesh(LG.head, P.head));
  const tails = new THREE.Mesh(LG.tail, P.tailDim); g.add(tails);
  const flares = new THREE.Group();
  for (const x of [-0.62, 0.62]) { const f = new THREE.Sprite(P.flare); f.position.set(x, 0.75, 2.3); f.scale.setScalar(0.9); flares.add(f); const r = new THREE.Sprite(P.flareR); r.position.set(x, 0.8, -2.3); r.scale.setScalar(0.9); r.userData.tail = true; flares.add(r); }
  g.add(flares);
  const beams = new THREE.Mesh(P.beams, P.beamMat); beams.userData.beam = true; g.add(beams);
  let siren = null;
  if (c.type === 'police') {
    siren = [new THREE.Mesh(P.sirenGeo, P.sirenR), new THREE.Mesh(P.sirenGeo, P.sirenB)];
    siren[0].position.set(-0.25, 1.75, -0.1); siren[1].position.set(0.25, 1.75, -0.1); g.add(...siren);
  }
  g.userData = { wheels, spinA: 0, siren, model, body, burnt: false, baseY: model.position.y, tails, flares };
  g.userData.paintHex = c.type === 'police' ? 0x1c1c22 : c.type === 'taxi' ? 0xd8a818 : c.type === 'lowrider' ? PAINT_LOW[c.paint % PAINT_LOW.length] : PAINT[c.paint % PAINT.length];
  return g;
}
let lampGeo = null;
function lampGeos(grp) {
  if (!lampGeo) {
    grp.updateMatrixWorld(true); const hs = [], ts = [];
    for (const m of grp.children) (m.material === parts().head ? hs : ts).push(m.geometry.clone().applyMatrix4(m.matrixWorld));
    lampGeo = { head: mergeGeometries(hs), tail: mergeGeometries(ts) };
  }
  return lampGeo;
}

export function updateCar(g, c, dt, night, now) {
  const u = g.userData;
  u.spinA += (c.v * dt) / 0.37;
  for (const w of u.wheels) { w.node.rotation.x = -u.spinA; if (w.front) w.node.rotation.y = c.steer; }
  let d = c.ry - g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
  g.rotation.y += Math.abs(d) > 0.01 ? d * Math.min(1, dt * (c.ai ? 6 : 30)) : d;
  g.position.x += (c.x - g.position.x) * Math.min(1, dt * (c.ai ? 8 : 40));
  g.position.z += (c.z - g.position.z) * Math.min(1, dt * (c.ai ? 8 : 40));
  // suspension: springy pitch under throttle and brakes, body roll in turns and
  // slides, and a vertical bounce kicked by crashes (u.bounce)
  const acc = dt > 0 ? (c.v - (u.lastV ?? c.v)) / dt : 0; u.lastV = c.v;
  const tPitch = THREE.MathUtils.clamp(-acc * 0.0035, -0.07, 0.07), tRoll = -c.steer * Math.min(1, Math.abs(c.v) / 18) * 0.13 - (c.slip || 0) * Math.sign(c.steer || 0) * 0.05;
  u.pv = ((u.pv || 0) + ((tPitch - (u.pitch || 0)) * 90 - (u.pv || 0) * 9) * dt); u.pitch = (u.pitch || 0) + u.pv * dt;
  u.rv = ((u.rv || 0) + ((tRoll - (u.roll || 0)) * 80 - (u.rv || 0) * 8) * dt); u.roll = (u.roll || 0) + u.rv * dt;
  u.bounce = (u.bounce || 0) * Math.max(0, 1 - dt * 4); const by = Math.sin(now / 45) * (u.bounce || 0) * 0.3;
  u.model.rotation.x = u.pitch; u.model.rotation.z = u.roll; u.model.position.y = u.baseY + by;
  for (const ch of g.children) if (ch.userData.beam) ch.visible = night && !c.wrecked;
  // brake lights glow when slowing hard or stopped in traffic, flares at night
  const braking = !c.wrecked && (acc < -2.5 || (c.ai && Math.abs(c.v) < 0.5));
  u.tails.material = braking ? parts().tailBrake : night && !c.wrecked ? parts().tail : parts().tailDim;
  u.flares.visible = !c.wrecked && (night || braking);
  for (const f of u.flares.children) f.visible = f.userData.tail ? (braking || night) : night;
  for (const f of u.flares.children) if (f.userData.tail) f.scale.setScalar(braking ? 1.3 : 0.8);
  if (u.siren) { const on = c.siren && Math.floor(now / 180) % 2 === 0; u.siren[0].visible = !c.siren || on; u.siren[1].visible = !c.siren || !on; }
  if (c.wrecked && !u.burnt) { u.burnt = true; u.model.traverse((o) => { if (o.isMesh) o.material = parts().burnt; }); }
}

// Pooled smoke puffs for damaged cars.
export class Smoke {
  constructor(scene, n) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(cv);
    this.p = [];
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }));
      s.visible = false; scene.add(s); this.p.push({ s, life: 0 });
    }
    this.i = 0;
  }
  emit(x, y, z, dark, big) {
    const q = this.p[this.i = (this.i + 1) % this.p.length];
    q.life = 1; q.max = 1.6 + Math.random(); q.s.visible = true; q.s.position.set(x + (Math.random() - 0.5) * 0.6, y, z + (Math.random() - 0.5) * 0.6);
    q.s.material.color.setHex(dark ? 0x222222 : 0xaaaaaa); q.big = big ? 2 : 1; q.vy = 1 + Math.random();
  }
  update(dt) {
    for (const q of this.p) if (q.life > 0) {
      q.life -= dt / q.max; q.s.position.y += q.vy * dt; const k = 1 - q.life;
      q.s.scale.setScalar((0.6 + k * 2.4) * q.big); q.s.material.opacity = Math.max(0, q.life) * 0.5;
      if (q.life <= 0) q.s.visible = false;
    }
  }
}

// ---- decals: one 256 px canvas atlas (plates with made-up text, fake brand stickers, taxi roof ad) ----
// layout: plates 128x32 in the top half (2 x 4), stickers 128x64 below, the taxi ad at the bottom right
const PLATES = ['7KQ 219', 'BLV 404', 'SE 4821', 'LUX 77', '2RD 908', 'ZAP 315', 'HOODY 1', '9MX 662'];
let atlas = null;
function decalAtlas() {
  if (atlas) return atlas;
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const g = cv.getContext('2d');
  PLATES.forEach((t, i) => {
    const x = (i % 2) * 128, y = Math.floor(i / 2) * 32;
    g.fillStyle = '#e8e4d8'; g.fillRect(x + 2, y + 2, 124, 28); g.strokeStyle = '#2a3a6a'; g.lineWidth = 2; g.strokeRect(x + 3, y + 3, 122, 26);
    g.fillStyle = '#a82a2a'; g.font = 'bold 7px sans-serif'; g.textAlign = 'center'; g.fillText('COSTA VERDE', x + 64, y + 10);
    g.fillStyle = '#1a2450'; g.font = 'bold 17px monospace'; g.fillText(t, x + 64, y + 27);
  });
  const sticker = (x, y, bg, fg, a, b) => { g.fillStyle = bg; g.beginPath(); g.roundRect(x + 4, y + 8, 120, 48, 10); g.fill(); g.fillStyle = fg; g.textAlign = 'center'; g.font = 'bold 22px sans-serif'; g.fillText(a, x + 64, y + 34); g.font = 'bold 11px sans-serif'; g.fillText(b, x + 64, y + 49); };
  sticker(0, 128, '#d8a018', '#1a1a1a', 'MOJO', 'MOTOR OIL'); sticker(128, 128, '#1a1a1a', '#e84a2a', 'KRAKEN', 'TIRES AND RIMS'); sticker(0, 192, '#e8e4d8', '#2a5aa8', 'BLVD', 'KINGS CAR CLUB');
  g.fillStyle = '#1c1c1c'; g.fillRect(128, 192, 128, 64); g.fillStyle = '#f0c020'; g.textAlign = 'center'; g.font = 'bold 20px sans-serif'; g.fillText('SUNNY CAB', 192, 222); g.font = 'bold 12px sans-serif'; g.fillStyle = '#fff'; g.fillText('CALL 555 0199', 192, 242);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 1; tex.generateMipmaps = !Q.potato; if (Q.potato) tex.minFilter = THREE.LinearFilter;
  atlas = new THREE.MeshLambertMaterial({ map: tex, transparent: false, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  return atlas;
}
const UVR = { plate: (i) => [(i % 2) * 128, Math.floor(i / 2) * 32, 128, 32], sticker: (i) => [[0, 128], [128, 128], [0, 192]][i].concat([128, 64]), ad: () => [128, 192, 128, 64] };
function decalGeometry(type, paint, body) {
  const T = templates[type] || templates.sedan, k = 1 / T.scale;
  body.computeBoundingBox(); const bb = body.boundingBox, sz = bb.getSize(new THREE.Vector3());
  const mesh = new THREE.Mesh(body, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })), rc = new THREE.Raycaster();
  const pos = [], nrm = [], uv = [], up = new THREE.Vector3(0, 1, 0);
  const quad = (o, n, w, h, rect, side) => { // centre, normal, size in meters, atlas rect
    const t = side || new THREE.Vector3().crossVectors(up, n).normalize(), b = new THREE.Vector3().crossVectors(n, t).normalize();
    const [x, y, rw, rh] = rect, u0 = x / 256, u1 = (x + rw) / 256, v0 = 1 - (y + rh) / 256, v1 = 1 - y / 256;
    const P = (sx, sy) => o.clone().addScaledVector(t, sx * w * k / 2).addScaledVector(b, sy * h * k / 2).addScaledVector(n, 0.004 * k);
    const c = [[P(-1, -1), u0, v0], [P(1, -1), u1, v0], [P(1, 1), u1, v1], [P(-1, 1), u0, v1]];
    for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(...c[i][0].toArray()); nrm.push(...n.toArray()); uv.push(c[i][1], c[i][2]); }
  };
  const hitAt = (o, d) => { rc.set(o, d.normalize()); const h = rc.intersectObject(mesh)[0]; return h ? { p: h.point, n: d.clone().negate() } : null; };
  const pl = paint % PLATES.length;
  let h = hitAt(new THREE.Vector3(0, bb.min.y + sz.y * 0.32, bb.max.z + 2), new THREE.Vector3(0, 0, -1)); if (h) quad(h.p, h.n, 0.52, 0.13, UVR.plate(pl));
  h = hitAt(new THREE.Vector3(0, bb.min.y + sz.y * 0.24, bb.min.z - 2), new THREE.Vector3(0, 0, 1)); if (h) quad(h.p, h.n, 0.52, 0.13, UVR.plate((pl + 3) % PLATES.length));
  if (type !== 'police') { const st = type === 'lowrider' ? 2 : paint % 2;
    for (const sx of [-1, 1]) { h = hitAt(new THREE.Vector3(sx * (bb.max.x + 2), bb.min.y + sz.y * 0.42, bb.min.z + sz.z * 0.72), new THREE.Vector3(-sx, 0, 0)); if (h) quad(h.p, h.n, 0.4, 0.2, UVR.sticker(st)); } }
  if (type === 'taxi') { h = hitAt(new THREE.Vector3(0, bb.max.y + 2, bb.min.z + sz.z * 0.55), new THREE.Vector3(0, -1, 0));
    if (h) for (const sx of [-1, 1]) { const o = h.p.clone(); o.y += 0.16 * k; quad(o, new THREE.Vector3(sx, 0, 0), 0.9, 0.28, UVR.ad()); } }
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
