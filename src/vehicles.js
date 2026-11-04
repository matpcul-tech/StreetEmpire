// Cars from Kenney's Car Kit (CC0): sedan, sports (muscle), SUV, van, taxi and
// police. Wheels are separate nodes so they spin and steer. Lights, beams,
// sirens and damage smoke are added in code.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// lowrider reuses the sedan body, lowered, with candy paint and chrome trim
const FILES = { sedan: 'sedan', muscle: 'sedanSports', suv: 'suv', van: 'van', taxi: 'taxi', police: 'police' };
const templates = {};
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
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.4, roughness: 0.38 });
  const U = { uWear: { value: [0.1, 0.4, 0.7, 1.0][wear] }, uSeed: { value: wear * 7.31 + kind * 1.7 }, uKind: { value: kind }, uStripe: { value: new THREE.Color(stripe) } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aMetal;\nattribute float aDirt;\nattribute vec3 aP;\n' + CAR_GLSL)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMetal = aMetal; vDirt = aDirt; vP = aP; vON = normal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + CAR_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float paintable = step(vMetal, 0.05) * step(0.05, vP.y);
        vec3 c = diffuseColor.rgb; float w = uWear;
        // livery and markings: taxi checker band, police doors, muscle stripes, crew stickers
        if (uKind > 0.5 && uKind < 1.5 && abs(vP.y - 0.5) < 0.035 && paintable > 0.0) c = mod(floor(vP.z*40.0)+floor(vP.y*60.0), 2.0) < 1.0 ? vec3(0.05) : vec3(0.95);
        if (uKind > 1.5 && uKind < 2.5 && abs(vON.x) > 0.6 && vP.y < 0.55 && vP.y > 0.25 && abs(vP.z - 0.5) < 0.18 && paintable > 0.0) c = vec3(0.92);
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
        c = mix(c, vec3(0.16, 0.12, 0.09), vDirt * (0.45 + 0.4*w) * (0.6 + 0.6*cn(vP*30.0)));
        diffuseColor.rgb = c;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        // dents: a little noisy normal wobble on worn cars
        float dn = cn(vP*vec3(10.0, 6.0, 10.0) + uSeed*3.0) - 0.5;
        normal = normalize(normal + vec3(dn, -dn*0.5, dn*0.7) * 0.35 * uWear * step(vMetal, 0.05));`)
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 1.0, vMetal) * (1.0 - vDirt) * (1.0 - 0.6*uWear);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(mix(roughnessFactor + 0.35*uWear*(1.0 - vMetal), 0.08 + 0.25*uWear*cn(vP*20.0), vMetal), 0.95, vDirt);');
  };
  m.customProgramCacheKey = () => 'carpaint';
  carMats.set(key, m); return m;
}
let glassMat = null;
function glass() { return glassMat ||= new THREE.MeshStandardMaterial({ color: 0x1a2630, metalness: 0.6, roughness: 0.08, transparent: true, opacity: 0.5, depthWrite: false, envMapIntensity: 1.5 }); }
const geoCache = new Map();
function carGeometry(type, paint) {
  const key = type + ':' + paint;
  if (geoCache.has(key)) return geoCache.get(key);
  const T = templates[type === 'lowrider' ? 'sedan' : type] || templates.sedan;
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
    let metal = 0;
    if (/paint/i.test(n) && type !== 'police' && type !== 'taxi') col.setHex(type === 'lowrider' ? PAINT_LOW[paint % PAINT_LOW.length] : PAINT[paint % PAINT.length]);
    else if (/window/i.test(n)) { col.setHex(0x0c1218); metal = 2; }
    else if (/plastic/i.test(n) && type === 'lowrider') { col.setHex(0xd8d8d8); metal = 1; }
    else if (/carTire/i.test(n)) col.setHex(0x161616);
    else if (/wheelInside/i.test(n)) { col.setHex(paint % 3 === 0 ? 0xd8d8d8 : paint % 3 === 1 ? 0x2a2a2a : 0xa89058); metal = paint % 3 === 1 ? 0 : 1; }
    else if (/_default/i.test(n) && type === 'lowrider') { col.setHex(0xe0e0e0); metal = 1; }
    else col.copy(mat.color);
    const cnt = g.attributes.position.count, c = new Float32Array(cnt * 3), m = new Float32Array(cnt), d = new Float32Array(cnt);
    for (let i = 0; i < cnt; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; m[i] = metal; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.setAttribute('aMetal', new THREE.BufferAttribute(m, 1)); g.setAttribute('aDirt', new THREE.BufferAttribute(d, 1));
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
  for (const w of wheels) { const n = w.geo.attributes.position.count; w.geo.setAttribute('aP', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); }
  const out = { body: merged, wheels, glass: glassGeo };
  geoCache.set(key, out); return out;
}

export function makeCar(c) {
  const P = parts(), T = templates[c.type === 'lowrider' ? 'sedan' : c.type] || templates.sedan;
  const g = new THREE.Group();
  const model = new THREE.Group();
  model.scale.setScalar(T.scale); model.position.y = -T.minY * T.scale; model.rotation.y = Math.PI; // kit faces -z
  model.rotation.order = 'YXZ';
  const geo = carGeometry(c.type, c.paint);
  let h = 0; for (const ch of String(c.id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const wear = c.type === 'police' ? 0 : c.type === 'lowrider' ? h % 2 : h % 4;
  const kind = { taxi: 1, police: 2, muscle: 3, van: 4 }[c.type] || 0;
  const STRIPES = [0xd8d0c0, 0xa82222, 0x2850a8, 0xc89a18, 0x1a1a1a, 0xe0e0e0];
  const mat = bodyMaterial(wear, kind, STRIPES[(h >> 3) % STRIPES.length]);
  const body = new THREE.Mesh(geo.body, mat); body.castShadow = true;
  if (c.type === 'lowrider') body.position.y = -0.1 / T.scale;
  model.add(body);
  const wheels = [];
  if (geo.glass) { const gl = new THREE.Mesh(geo.glass, glass()); gl.renderOrder = 2; body.add(gl); }
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
