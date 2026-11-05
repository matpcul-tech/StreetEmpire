// Rigged people from the Street Empire pack (public/models/se-pack, built by
// tools/build-se-pack.mjs from Quaternius CC0 Universal Base Characters bodies,
// hair and Universal Animation Library clips, slimmed and decimated). Real face,
// eyes, brows and hair meshes; outfits and grit are still painted in the shader
// from bind pose coordinates (meters, T pose, +z forward) over the body.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

let tmpl = null;
const clips = {};

export async function loadPeople(base, onFirst, potato = false) {
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  const g = await loader.loadAsync(`${base}models/se-pack/${potato ? 'people_lod' : 'people'}.glb`);
  // bone scales set in code (female build) must survive the clips, so drop
  // scale tracks and every translation track except the hips
  for (const c of g.animations) { c.tracks = c.tracks.filter((t) => !t.name.endsWith('.scale') && (!t.name.endsWith('.position') || t.name.startsWith('pelvis.'))); clips[c.name] = c; }
  if (!clips.Punch_Enter && clips.Punch_Jab) { clips.Punch_Enter = clips.Punch_Jab.clone(); clips.Punch_Enter.name = 'Punch_Enter'; } // guard pose: the jab ends with hands up
  tmpl = g.scene;
  try { const a = await loader.loadAsync(`${base}models/se-pack/accessories.glb`); a.scene.traverse((o) => { if (o.isMesh) packAcc[o.name] = o.geometry; }); } catch (e) { console.warn('accessories.glb', e); }
  tmpl.traverse((o) => { if (o.isSkinnedMesh) PARTMAT[o.name] = o.material; });
  bakeBind(tmpl);
  onFirst && onFirst();
}
// The GLB is quantized, so raw positions are not in meters. Skin each vertex
// once in the rest pose and store that (meters, feet at 0) plus the rest normal
// as attributes the paint shader reads.
function bakeBind(scene) {
  scene.updateMatrixWorld(true);
  const meshes = []; scene.traverse((o) => o.isSkinnedMesh && meshes.push(o));
  const v = new THREE.Vector3(), nv = new THREE.Vector3(), m = new THREE.Matrix4(), t = new THREE.Matrix4(), n3 = new THREE.Matrix3();
  const out = [];
  const sexOf = (o) => o.name.startsWith('f_') ? 'f' : 'm';
  const range = { m: [1e9, -1e9], f: [1e9, -1e9] };
  for (const o of meshes) {
    const isBody = /_body$/.test(o.name); if (!isBody) continue; const R = range[sexOf(o)];
    o.skeleton.pose(); o.updateMatrixWorld(true); o.skeleton.update();
    const G = o.geometry, P = G.attributes.position, N = G.attributes.normal, J = G.attributes.skinIndex, W = G.attributes.skinWeight;
    const bp = new Float32Array(P.count * 3), bn = new Float32Array(P.count * 3);
    for (let i = 0; i < P.count; i++) {
      o.getVertexPosition(i, v); v.applyMatrix4(o.matrixWorld); bp.set([v.x, v.y, v.z], i * 3); R[0] = Math.min(R[0], v.y); R[1] = Math.max(R[1], v.y);
      m.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
      for (let k = 0; k < 4; k++) { const w = W.getComponent(i, k); if (!w) continue; const b = J.getComponent(i, k); t.multiplyMatrices(o.skeleton.bones[b].matrixWorld, o.skeleton.boneInverses[b]); for (let q = 0; q < 16; q++) m.elements[q] += t.elements[q] * w; }
      n3.setFromMatrix4(t.multiplyMatrices(m, o.bindMatrix)).invert().transpose();
      nv.fromBufferAttribute(N, i).applyMatrix3(n3).normalize(); bn.set([nv.x, nv.y, nv.z], i * 3);
    }
    out.push([G, bp, bn, sexOf(o)]);
  }
  fit = {};
  for (const sx of ['m', 'f']) { const [lo, hi] = range[sx]; fit[sx] = { k: 1 / (hi - lo), lo, n: 1.829 / (hi - lo) }; }
  for (const [G, bp, bn, sx] of out) { const { n: k, lo } = fit[sx]; for (let i = 0; i < bp.length; i += 3) { bp[i] *= k; bp[i + 1] = (bp[i + 1] - lo) * k; bp[i + 2] *= k; } G.setAttribute('bpos', new THREE.BufferAttribute(bp, 3)); G.setAttribute('bnrm', new THREE.BufferAttribute(bn, 3)); }
  // measure the male skull and neck (normalized meters) so caps, bandanas and chains fit the real head
  const mb = out.find((o) => o[3] === 'm'); if (mb) { const bp = mb[1]; let top = 0, zs = 0, zn = 0, hw = 0, nw = 0, nz = 0, nn = 0;
    for (let i = 0; i < bp.length; i += 3) { const x = bp[i], y = bp[i + 1], z = bp[i + 2]; top = Math.max(top, y); if (y > 1.72) { zs += z; zn++; } if (y > 1.7 && y < 1.76) hw = Math.max(hw, Math.abs(x)); if (y > 1.5 && y < 1.55 && Math.abs(x) < 0.09) { nw = Math.max(nw, Math.abs(x)); nz += z; nn++; } }
    Object.assign(SKULL, { top, z: zs / Math.max(1, zn), r: hw * 1.04, neckY: 1.525, neckR: nw * 1.08, neckZ: nz / Math.max(1, nn) }); ACC.r = SKULL.r; ACC.neckR = SKULL.neckR; }
}
export const ready = () => !!tmpl;

const SKINS = [0x8d5a3b, 0x5a3825, 0xc49272, 0x3e2a1e, 0xa8714d, 0xe0b090];
const HAIR = [0x111111, 0x2a1a10, 0x4a3020, 0x111111, 0x6a5040];
const TOPS = [0x555555, 0x7a2a2a, 0x2a4a7a, 0xb0a080, 0x2a5a3a, 0x6a3a6a, 0xd0d0d0, 0x8a6a2a, 0x222222, 0xc06a30, 0x4a7a8a];
const PANTS = [0x2a3a5a, 0x1a1a1a, 0x4a4030, 0x3a3a40, 0x5a6a80, 0x6a5a40];
const SHOES = [0xe8e8e0, 0x1a1a1a, 0xe8e8e0, 0x8a5a30, 0xb03030, 0xe8e8e0];

// styles: top 0 tee, 1 hoodie, 2 jersey, 3 police uniform, 4 suit, 5 tank, 6 jacket
// pants 0 jeans, 1 slacks; hair 0 short, 1 long, 2 bald
function look(o) { return { model: 'ual', female: false, top: 0, trim: 0xffffff, pants: 0, legs: 0x2a3a5a, shoes: 0xe8e8e0, hair: 0, hairC: 0x111111, grit: 0.5, num: -1, beard: 0, acc: {}, ...o }; }

export function lookFor(e, CREWS) {
  const v = e.look ?? (e.id * 7);
  const skin = SKINS[v % SKINS.length], hairC = HAIR[(v >> 1) % HAIR.length];
  if (e.kind === 'player') return look({ skin: 0x7a4a30, top: 1, topC: 0x2f8f4a, trim: 0x1e6a34, legs: 0x2a3a5a, hairC: 0x111111, beard: 1, acc: { cap: 0x1e6a34, back: true, neck: 0x2f8f4a } });
  if (e.kind === 'giver') return look({ skin: 0x5a3825, top: 4, topC: 0x2a2a30, trim: 0x8a1a1a, pants: 1, legs: 0x2a2a30, shoes: 0x111111, hairC: 0x8a8a8a, hair: 0, beard: 2, grit: 0.15, acc: { hat: 0x1a1a1e } });
  if (e.kind === 'cop') return look({ skin, top: 3, topC: 0x2c4a7a, trim: 0xe0c050, pants: 1, legs: 0x1a2438, shoes: 0x101018, hairC, grit: 0.12, acc: { police: 0xffffff } }); // white so peaked cap vertex colors (navy + gold badge) show
  if (e.kind === 'ped') {
    const female = v % 3 === 1;
    const top = [0, 6, 0, 1, 5, 4, 0][(v >> 2) % 7];
    return look({ skin, female, top, topC: TOPS[(v >> 2) % TOPS.length], trim: TOPS[(v >> 5) % TOPS.length], pants: top === 4 ? 1 : (v >> 3) % 3 === 2 ? 1 : 0, legs: PANTS[(v >> 3) % PANTS.length], shoes: SHOES[(v >> 4) % SHOES.length],
      hair: female ? 1 : (v >> 6) % 5 === 0 ? 2 : 0, hairC, beard: female ? 0 : (v >> 2) % 3 === 0 ? 1 : 0, grit: 0.3, acc: !female && v % 4 === 1 ? { cap: TOPS[(v >> 4) % TOPS.length] } : {} });
  }
  const c = CREWS[e.crew];
  const female = e.crew === 'neutral' ? v % 2 === 1 : v % 5 === 3;
  const base = { skin, female, topC: c.shirt, legs: c.pants, hair: female ? 1 : (v >> 3) % 4 === 0 ? 2 : 0, hairC, beard: female ? 0 : (v >> 2) % 2, grit: 0.7 };
  if (e.crew === 'reds') return look({ ...base, top: v % 2 ? 2 : 5, trim: 0xf0f0f0, num: v % 100, legs: 0x1a1a1a, shoes: 0xe8e8e0, acc: female ? {} : { rag: c.shirt } });
  if (e.crew === 'blues') return look({ ...base, top: v % 2 ? 1 : 2, trim: 0xe8e8f0, num: v % 100, legs: 0x3a4a66, shoes: 0x1a1a1a, acc: { neck: c.shirt, ...(female ? {} : { cap: 0x1a1a1a }) } });
  if (e.crew === 'golds') return look({ ...base, top: v % 2 ? 2 : 6, trim: 0x1a1a1a, num: v % 100, legs: 0x4a3a28, shoes: 0xc89a18, acc: female ? {} : { cap: c.shirt } });
  return look({ ...base, top: [0, 1, 6][v % 3], legs: PANTS[v % PANTS.length], grit: 0.4, acc: !female && v % 3 === 0 ? { cap: 0x3a3a3a } : {} });
}

// ---- painted clothing shader ----
const PAINT = /* glsl */`
uniform vec3 uSkin, uTop, uTrim, uLegs, uShoes, uHairC;
uniform vec4 uStyle; // top, pants, hair, beard
uniform vec2 uMisc;  // grit, number
varying vec3 vB; varying vec3 vBN;
float h31(vec3 p){ p = fract(p*0.3183099+0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vn(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y),f.z); }
float box(vec2 p, vec2 a, vec2 b){ return step(a.x,p.x)*step(p.x,b.x)*step(a.y,p.y)*step(p.y,b.y); }
// seven segment digit in a 1x2 cell
float seg7(int d, vec2 p){
  int m = d==0?119: d==1?36: d==2?93: d==3?109: d==4?46: d==5?107: d==6?123: d==7?37: d==8?127: 111;
  float t=0.22, o=0.0;
  if((m&1)>0)  o=max(o,box(p,vec2(0.0,1.78),vec2(1.0,2.0)));
  if((m&2)>0)  o=max(o,box(p,vec2(0.0,1.0),vec2(t,2.0)));
  if((m&4)>0)  o=max(o,box(p,vec2(1.0-t,1.0),vec2(1.0,2.0)));
  if((m&8)>0)  o=max(o,box(p,vec2(0.0,0.89),vec2(1.0,1.11)));
  if((m&16)>0) o=max(o,box(p,vec2(0.0,0.0),vec2(t,1.0)));
  if((m&32)>0) o=max(o,box(p,vec2(1.0-t,0.0),vec2(1.0,1.0)));
  if((m&64)>0) o=max(o,box(p,vec2(0.0,0.0),vec2(1.0,0.22)));
  return o;
}
uniform float uTexSkin;
vec3 paint(vec3 texC){
  vec3 p = vB; float ax = abs(p.x), y = p.y;
  vec3 sk = uSkin * clamp(dot(texC, vec3(0.299, 0.587, 0.114)) / uTexSkin, 0.55, 1.4); // skin keeps the model's face and body detail, tinted to this character
  int top = int(uStyle.x+0.5), pants = int(uStyle.y+0.5), hair = int(uStyle.z+0.5);
  bool front = vBN.z > 0.25, back = vBN.z < -0.35;
  float n1 = vn(p*60.0), n2 = vn(p*9.0);
  vec3 c = sk; float cloth = 0.0;
  float sleeve = top==5 ? 0.17 : (top==0||top==2) ? 0.34 : 0.735;
  if (y > 1.3 && ax > 0.185) {
    // arms: sleeves then skin, hands past 0.735
    if (ax < sleeve) { c = uTop; cloth = 1.0;
      if (top==2 && ax > sleeve-0.025) c = uTrim;
      if ((top==1||top==3||top==6) && ax > 0.70) c *= 0.75;
      if (top==4 && ax > 0.715) { c = vec3(0.92); }
      if (top==3 && ax > 0.22 && ax < 0.33 && y > 1.42 && y < 1.52) { float pb = step(0.012, min(min(ax-0.22, 0.33-ax), min(y-1.42, 1.52-y))); c = mix(uTrim * 0.35, mix(c, uTrim, 0.85), pb); }
    }
  } else if (y > 1.565) {
    // head: skin, hair, painted face
    float hz = p.z - 0.006;
    bool hairOn = false && hair==0 ? (y > 1.775 - 0.02*smoothstep(0.0,0.1,-hz) || (hz < -0.045 && y > 1.63) || (ax > 0.078 && y > 1.71 && hz < 0.03))
                : hair==1 ? (y > 1.765 || (hz < -0.02 && y > 1.56) || (ax > 0.07 && y > 1.6 && hz < 0.045))
                : false;
    if (hairOn) { c = uHairC * (0.8 + 0.4*n1); cloth = 0.5; }
    if (false) { // the real model has eyes, brows and lips: no painted face
      vec2 e = vec2(ax - 0.034, (y - 1.708) * 1.5);
      float ed = length(e);
      if (ed < 0.0135) c = vec3(0.93,0.91,0.88);
      if (length(vec2(ax-0.034, y-1.708)) < 0.0075) c = vec3(0.12,0.08,0.05);
      if (length(vec2(ax-0.034, y-1.708)) < 0.003) c = vec3(0.02);
      if (y > 1.725 && y < 1.734 && ax > 0.016 && ax < 0.054 - (y-1.725)*1.2) c = uHairC*0.8;
      if (y > 1.66 && y < 1.70 && ax < 0.013) c *= 0.9 + 0.1*smoothstep(0.0,0.013,ax)*0.0 + (ax > 0.008 ? -0.08 : 0.06);
      if (y > 1.642 && y < 1.654 && ax < 0.024 - abs(y-1.648)*1.5) c = mix(uSkin, vec3(0.45,0.18,0.16), 0.55);
      if (y > 1.6475 && y < 1.6495 && ax < 0.022) c *= 0.5;
      int beard = int(uStyle.w+0.5);
      bool jaw = y < 1.635 || (ax > 0.03 && y < 1.67) || (y > 1.654 && y < 1.662 && ax < 0.028);
      if (beard > 0 && jaw && !(y > 1.642 && y < 1.654 && ax < 0.024)) c = mix(c, uHairC, beard==2 ? 0.8 : 0.3 + 0.15*n1);
      if (beard==2 && y < 1.672 && y > 1.655 && ax < 0.03) c = mix(c, uHairC, 0.85);
    }
    if (!hairOn && y < 1.655 && !front && ax > 0.05) c *= 0.92;
    // hoodie hood bunched behind the neck
    if (top==1 && y < 1.64 && hz < -0.02) { c = uTop*0.9; cloth = 1.0; }
  } else if (y > 1.49) {
    // neck, collars
    if (top==1 && (p.z < 0.0 || y < 1.515)) { c = uTop*0.9; cloth = 1.0; }
    if ((top==3||top==4||top==6) && y < 1.53) { c = top==3 ? uTop : top==4 ? vec3(0.92) : uTop; cloth = 1.0; }
    if (top==2 && y < 1.505) { c = uTrim; cloth = 1.0; }
  } else if (y > 0.985) {
    // torso
    c = uTop; cloth = 1.0;
    if (top==5 && y > 1.38 && (abs(ax - 0.06) > 0.022 && (y > 1.43 || ax > 0.08))) { c = sk; cloth = 0.0; }
    if (top==0 && front && y > 1.47 && ax < 0.06 - (1.49-y)*0.0) c = sk;
    if (top==1) {
      if (front && y > 1.04 && y < 1.15 && ax < 0.09) c = uTop*0.82;
      if (front && y > 1.38 && y < 1.48 && abs(ax-0.032) < 0.004) c = vec3(0.9);
      if (y < 1.02) c = uTop*0.75;
    }
    if (top==2) {
      if (ax > 0.13) c = uTrim;
      int d = int(uMisc.y+0.5);
      if (d >= 0) {
        vec2 q = back ? vec2(-p.x, y) : vec2(p.x, y);
        float hgt = back ? 0.2 : 0.09, y0 = back ? 1.13 : 1.3, w = hgt*0.5, gap = w*0.35;
        vec2 l = vec2((q.x + w + gap*0.5)/w, (q.y - y0)/(hgt*0.5));
        vec2 r = vec2((q.x - gap*0.5)/w, (q.y - y0)/(hgt*0.5));
        float s = (d >= 10 ? seg7(d/10, l) : 0.0) + seg7(d - (d/10)*10, d >= 10 ? r : vec2((q.x + w*0.5)/w, (q.y-y0)/(hgt*0.5)));
        if ((back || (front && p.x < 0.0)) && s > 0.5) c = uTrim;
      }
      if (y > 1.47 && front && ax < 0.06) c = uTrim;
    }
    if (top==3) {
      // lighter shirt panel so navy reads at night (front and a softer upper back yoke)
      if (front && y > 1.05 && y < 1.48 && ax < 0.14) c = mix(c, c * vec3(1.25, 1.2, 1.15) + vec3(0.04, 0.05, 0.08), 0.55);
      if (!front && y > 1.28 && y < 1.48 && ax < 0.14) c = mix(c, c * vec3(1.15, 1.12, 1.1) + vec3(0.03, 0.04, 0.06), 0.4);
      // collar: slightly lighter band under the neck
      if (y > 1.46 && y < 1.505 && ax < 0.1) c = mix(c, vec3(0.22, 0.32, 0.48), 0.65);
      // chest badge shield (left chest)
      {
        vec2 b = vec2(p.x - 0.055, (y - 1.38) * 1.35);
        float sh = step(length(max(abs(b) - vec2(0.012, 0.01), 0.0)) + min(max(abs(b.x)-0.012, abs(b.y)-0.01), 0.0), 0.006)
                 * step(b.y, 0.022) * step(-0.02, b.y);
        float tip = step(abs(b.x) + max(0.0, -b.y - 0.008) * 0.9, 0.018) * step(b.y, -0.004) * step(-0.028, b.y);
        if (front && (sh + tip) > 0.5) c = uTrim;
        if (front && (sh + tip) > 0.5 && length(b) < 0.006) c = mix(uTrim, vec3(0.95, 0.9, 0.55), 0.5);
      }
      // nameplate bar under the badge
      if (front && p.x > 0.02 && p.x < 0.09 && y > 1.318 && y < 1.335) c = mix(c, vec3(0.85, 0.82, 0.75), 0.9);
      // button placket
      if (front && ax < 0.007 && y > 1.05 && y < 1.48) c *= 0.72;
      if (front && ax < 0.01 && y > 1.05 && y < 1.48 && mod(floor(y * 28.0), 2.0) < 1.0 && ax < 0.005) c = mix(c, uTrim * 0.7, 0.55);
      // pocket flaps
      if (front && ax > 0.045 && ax < 0.105 && y > 1.28 && y < 1.305) c *= 0.7;
      // duty belt: thick dark band with gold buckle and a radio block
      if (y > 0.98 && y < 1.055) {
        c = vec3(0.07, 0.07, 0.09);
        if (front && ax < 0.028) c = mix(c, uTrim, 0.92);
        if (front && p.x > 0.08 && p.x < 0.13) c = vec3(0.04); // radio / holster block
        if (!front && ax > 0.06 && ax < 0.12) c = vec3(0.05); // rear gear
      }
    }
    if (top==4) {
      float v = (y - 1.25) * 0.24;
      if (front && y > 1.25 && ax < v) { c = vec3(0.92); if (ax < 0.012 && y < 1.47) c = uTrim; }
      if (front && abs(ax - v) < 0.005 && y > 1.25) c *= 0.6;
      if (front && ax < 0.004 && y < 1.2) c *= 0.6;
    }
    if (top==6) {
      if (front && ax < 0.006) c = vec3(0.6);
      if (y < 1.03) c *= 0.7;
      if (y > 1.45 && front && ax < 0.07) c = uTrim;
    }
  } else if (y > 0.115) {
    // pants with a belt
    c = uLegs; cloth = 1.0;
    if (y > 0.955) c = pants==1 ? vec3(0.06) : vec3(0.15,0.1,0.07);
    else if (pants==0) {
      c *= 0.82 + 0.3*vn(vec3(p.x*400.0+p.y*400.0, p.y*40.0, p.z*400.0));
      c *= 1.0 + 0.25*smoothstep(0.08, 0.0, abs(y-0.52)) * (front ? 1.0 : 0.3);
      if (y < 0.15) c *= 0.75;
      if (abs(ax - 0.165) < 0.004 && y < 0.95) c = mix(c, vec3(0.75,0.6,0.35), 0.5);
      if (y > 0.87 && back && abs(ax-0.07) < 0.04 && y < 0.93) c *= 0.85;
    } else {
      if (front && abs(ax-0.095) < 0.003) c *= 0.75;
      // police slacks: faint cool side stripe so legs separate from the shirt at night
      if (int(uStyle.x+0.5)==3 && abs(ax - 0.155) < 0.008 && y < 0.95 && y > 0.2) c = mix(c, vec3(0.18, 0.24, 0.38), 0.55);
    }
  } else {
    // sneakers or dress shoes
    c = uShoes; cloth = 0.6;
    if (y < 0.03) c = dot(uShoes, vec3(0.33)) > 0.5 ? vec3(0.85,0.84,0.8) : vec3(0.05);
    if (dot(uShoes, vec3(0.33)) > 0.4 && y > 0.04 && y < 0.07 && !front) c = mix(c, uTop, 0.8);
    if (front && p.z > 0.05 && y > 0.05 && abs(ax - 0.093) < 0.012 && fract(p.z*120.0) < 0.5) c = vec3(0.9);
  }
  // grit: grime, dust at the hems and fabric noise
  float g = uMisc.x;
  c *= 1.0 - cloth * g * (0.25*smoothstep(0.45,0.85,n2) + 0.08*n1);
  c = mix(c, vec3(0.42,0.35,0.27), cloth * g * 0.35 * smoothstep(0.45, 0.0, y) * n2);
  c *= 0.97 + 0.06*n1*(1.0-cloth);
  return c;
}
`;

const matCache = new Map();
// night readability: a cool rim (fresnel) plus a warm fill, shared by every outfit
const NIGHT = { uRim: { value: 0 }, uRimK: { value: 1 }, uExpC: { value: 1 }, uSat: { value: 0 } };
// k > 1 when there is no post grade (potato, or the low fps fallback) so night clothing still reads
export function charNight(n, k = 1, expC = 1, sat = 0) { NIGHT.uRim.value = n; NIGHT.uRimK.value = k; NIGHT.uExpC.value = expC; NIGHT.uSat.value = sat; }
const col = (h) => new THREE.Color(h);
function clothMat(L, merged = false) {
  const key = [merged, L.female, L.skin, L.top, L.topC, L.trim, L.pants, L.legs, L.shoes, L.hair, L.hairC, L.beard, L.grit, L.num].join(',');
  if (matCache.has(key)) return matCache.get(key);
  const u = { uSkin: { value: col(L.skin) }, uTop: { value: col(L.topC) }, uTrim: { value: col(L.trim) }, uLegs: { value: col(L.legs) }, uShoes: { value: col(L.shoes) }, uHairC: { value: col(L.hairC) },
    uStyle: { value: new THREE.Vector4(L.top, L.pants, L.hair, L.beard) }, uMisc: { value: new THREE.Vector2(L.grit, L.num) } };
  const m = new THREE.MeshStandardMaterial({ roughness: 0.86, metalness: 0, envMapIntensity: 0.45, map: PARTMAT[L.female ? 'f_body' : 'm_body']?.map || null });
  u.uTexSkin = { value: 0.25 };
  if (merged) { m.side = THREE.DoubleSide; Object.assign(u, { uEyeMap: { value: PARTMAT[L.female ? 'f_eyes' : 'm_eyes']?.map }, uHair1: { value: PARTMAT.hair_short?.map }, uHair2: { value: PARTMAT.hair_long?.map }, uHairTint: { value: col(L.hairC).multiplyScalar(2.0) } }); }
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u, NIGHT);
    sh.fragmentShader = sh.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + 0.08 * sin(vB.x * 61.0 + vB.y * 47.0) * sin(vB.z * 53.0 - vB.y * 29.0), 0.6, 1.0); // fabric and skin break up, less plastic');
    sh.vertexShader = (merged ? 'attribute float aPart; varying float vPart;\n' : '') + 'attribute vec3 bpos; attribute vec3 bnrm; varying vec3 vB; varying vec3 vBN;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvB = bpos; vBN = bnrm;' + (merged ? ' vPart = aPart;' : ''));
    // merged parts: eyes and hair sample their own maps (hair tinted like the old hair material) and skip the outfit paint
    const partColor = merged ? 'if (vPart > 0.5) { if (vPart < 1.5) diffuseColor.rgb = texture2D(uEyeMap, vMapUv).rgb; else diffuseColor.rgb = (vPart < 2.5 ? texture2D(uHair1, vMapUv).rgb : texture2D(uHair2, vMapUv).rgb) * uHairTint; } else diffuseColor.rgb = paint(diffuseColor.rgb);' : 'diffuseColor.rgb = paint(diffuseColor.rgb);';
    if (merged) sh.fragmentShader = 'varying float vPart;\nuniform sampler2D uEyeMap, uHair1, uHair2;\nuniform vec3 uHairTint;\n' + sh.fragmentShader;
    sh.fragmentShader = 'uniform float uRim;\nuniform float uRimK;\nuniform float uExpC;\nuniform float uSat;\n' + PAINT + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + partColor)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nfloat fr = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.2);\nvec3 alb = diffuseColor.rgb; float am = max(max(alb.r, alb.g), max(alb.b, 0.04));\nvec3 rimC = mix(vec3(0.4, 0.5, 0.9), alb / am * 0.75, 0.55); // rim tinted by the character own color, not flat blue\ntotalEmissiveRadiance += uRim * uRimK * (rimC * fr * 0.28 + alb * vec3(0.42, 0.38, 0.34)); // slightly stronger cool rim so navy uniforms still read at night')
      .replace('#include <tonemapping_fragment>', '// no post pass: undo the scene night exposure bump on characters and restore saturation lost to tone mapping\ngl_FragColor.rgb *= uExpC;\n{ float cl = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722)); gl_FragColor.rgb = max(mix(vec3(cl), gl_FragColor.rgb, 1.0 + uSat), 0.0); }\n#include <tonemapping_fragment>');
  };
  m.customProgramCacheKey = () => merged ? 'ualcloth-merged' : 'ualcloth';
  matCache.set(key, m); return m;
}

// ---- head and neck accessories, in head bone space (meters, +y up the bone) ----
export const ACC = { y: 0.165, z: 0.01, r: 0.106, neckY: 0.045, neckR: 0.068, fwd: 1 };
const hairMats = new Map();
function hairMat(base, c) { const k = (base?.uuid || '') + c; if (!hairMats.has(k)) { const m = base ? base.clone() : new THREE.MeshStandardMaterial(); m.color = new THREE.Color(c).multiplyScalar(2.0); m.roughness = 0.75; m.metalness = 0; hairMats.set(k, m); } return hairMats.get(k); }
let accGeo = null;
const accMats = new Map();
function accMat(c, rough = 0.85) { const k = c + ':' + rough; if (!accMats.has(k)) accMats.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: rough, vertexColors: true })); return accMats.get(k); }
function accessories() {
  if (accGeo) return accGeo;
  const r = ACC.r, f = ACC.fwd;
  const dome = new THREE.SphereGeometry(r, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2); dome.scale(1, 0.9, 1.08);
  const brim = new THREE.CylinderGeometry(r * 0.85, r * 0.85, 0.008, 14, 1, false, -Math.PI / 2, Math.PI); brim.scale(1, 1, 1.15); brim.translate(0, 0.004, f * r * 0.45); if (f < 0) brim.rotateY(Math.PI);
  const btn = new THREE.SphereGeometry(0.01, 6, 3); btn.translate(0, r * 0.9, 0);
  const cap = mergeGeometries([dome, brim, btn].map((g) => g.toNonIndexed()));
  const rag = new THREE.SphereGeometry(r * 1.02, 14, 7, 0, Math.PI * 2, 0, Math.PI * 0.55); rag.scale(1, 0.92, 1.1);
  const tail = new THREE.ConeGeometry(0.022, 0.13, 4); tail.rotateX(-Math.PI / 2 - 0.9 * f); tail.translate(0, -0.01, -f * r * 1.08);
  const doRag = mergeGeometries([rag.toNonIndexed(), tail.toNonIndexed()]);
  const neck = new THREE.CylinderGeometry(ACC.neckR, ACC.neckR * 1.45, 0.07, 12, 1, true);
  const knot = new THREE.ConeGeometry(0.035, 0.08, 4); knot.rotateX(Math.PI); knot.translate(0, -0.05, f * ACC.neckR * 1.25);
  const neckB = mergeGeometries([neck.toNonIndexed(), knot.toNonIndexed()]);
  // police peaked cap (navy + gold badge in vertex colors) and a short brim hat
  const crown = new THREE.CylinderGeometry(r * 1.12, r * 0.98, 0.07, 14); crown.translate(0, 0.035, 0);
  const band = new THREE.CylinderGeometry(r * 1.0, r * 1.0, 0.02, 14, 1, true); band.translate(0, 0.01, 0);
  const visor = new THREE.CylinderGeometry(r * 0.8, r * 0.8, 0.008, 14, 1, false, -Math.PI / 2, Math.PI); visor.scale(1, 1, 0.9); visor.translate(0, 0, f * r * 0.55); if (f < 0) visor.rotateY(Math.PI);
  const badge = new THREE.BoxGeometry(0.026, 0.03, 0.005); badge.translate(0, 0.028, f * r * 1.02);
  const policeParts = [crown, band, visor, badge].map((g) => g.toNonIndexed());
  const policeCols = [[0.10, 0.16, 0.30], [0.04, 0.05, 0.08], [0.05, 0.05, 0.06], [0.88, 0.72, 0.28]];
  for (let i = 0; i < policeParts.length; i++) { const n = policeParts[i].attributes.position.count, c = new Float32Array(n * 3); for (let j = 0; j < n; j++) { c[j * 3] = policeCols[i][0]; c[j * 3 + 1] = policeCols[i][1]; c[j * 3 + 2] = policeCols[i][2]; } policeParts[i].setAttribute('color', new THREE.BufferAttribute(c, 3)); }
  const police = mergeGeometries(policeParts);
  const hatC = new THREE.CylinderGeometry(r * 0.85, r * 1.0, 0.09, 14); hatC.translate(0, 0.045, 0);
  const hatB = new THREE.CylinderGeometry(r * 1.55, r * 1.55, 0.008, 16);
  const hat = mergeGeometries([hatC.toNonIndexed(), hatB.toNonIndexed()]);
  const pony = new THREE.SphereGeometry(0.04, 8, 6); pony.scale(0.8, 1.6, 0.8); pony.translate(0, 0.02, -f * 0.115);
  accGeo = { cap, doRag, neck: neckB, police, hat, pony, ...packAcc }; return accGeo;
}

// ---- weapons in the right hand (hand bone space, +y along the fingers) ----
export const GRIP = { x: 0, y: 0.07, z: 0.02 };
let weaponGeo = null;
function weapons() {
  if (weaponGeo) return weaponGeo;
  const bat = mergeGeometries([new THREE.CylinderGeometry(0.014, 0.032, 0.78, 8).translate(0, 0.33, 0), new THREE.CylinderGeometry(0.02, 0.02, 0.012, 8).translate(0, -0.06, 0)].map((g) => g.toNonIndexed()));
  bat.rotateX(Math.PI / 2); // handle across the palm
  const pistol = mergeGeometries([new THREE.BoxGeometry(0.03, 0.035, 0.17).translate(0, 0.03, 0.05), new THREE.BoxGeometry(0.028, 0.09, 0.035).translate(0, -0.01, 0)].map((g) => g.toNonIndexed()));
  pistol.rotateX(-Math.PI / 2);
  const shotgun = mergeGeometries([new THREE.CylinderGeometry(0.014, 0.014, 0.62, 6).rotateX(Math.PI / 2).translate(0, 0.035, 0.25), new THREE.BoxGeometry(0.04, 0.06, 0.32).translate(0, 0.0, -0.12), new THREE.BoxGeometry(0.035, 0.035, 0.14).translate(0, 0.0, 0.2)].map((g) => g.toNonIndexed()));
  shotgun.rotateX(-Math.PI / 2);
  const knux = new THREE.TorusGeometry(0.045, 0.009, 5, 12, Math.PI); knux.rotateY(Math.PI / 2);
  weaponGeo = { bat, pistol, shotgun, knux, batMat: new THREE.MeshStandardMaterial({ color: 0x8a5a30, roughness: 0.6 }), gunMat: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.7 }), goldMat: new THREE.MeshStandardMaterial({ color: 0xc8a040, roughness: 0.3, metalness: 0.9 }) };
  return weaponGeo;
}

// Merge part meshes into the body geometry. Each part vertex is moved into the body's
// bind space (X = (Bbody_b)^-1 * Bpart_b, checked equal for every bone) and joint
// indices are remapped by bone name. aPart: 0 body, 1 eyes, 2 hair map 1, 3 hair map 2.
const mergedCache = new Map();
const partId = (o) => /eyes$/.test(o.name) ? 1 : PARTMAT[o.name]?.map === PARTMAT.hair_long?.map ? 3 : 2;
function mergedGeo(body, others) {
  const key = [body.name, ...others.map((o) => o.name)].join('+');
  if (mergedCache.has(key)) return mergedCache.get(key);
  const bsk = body.skeleton, bIdx = new Map(bsk.bones.map((b, i) => [b.name, i]));
  const rest = (m, i) => m.skeleton.boneInverses[i].clone().multiply(m.bindMatrix);
  const geos = [];
  const plain = (g, part, X, remap) => {
    const n = g.attributes.position.count, P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2), J = new Uint16Array(n * 4), W = new Float32Array(n * 4);
    const v = new THREE.Vector3(), nm = new THREE.Matrix3().getNormalMatrix(X);
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(g.attributes.position, i).applyMatrix4(X); P.set([v.x, v.y, v.z], i * 3);
      v.fromBufferAttribute(g.attributes.normal, i).applyMatrix3(nm).normalize(); N.set([v.x, v.y, v.z], i * 3);
      U[i * 2] = g.attributes.uv.getX(i); U[i * 2 + 1] = g.attributes.uv.getY(i);
      for (let k = 0; k < 4; k++) { J[i * 4 + k] = remap[g.attributes.skinIndex.getComponent(i, k)]; W[i * 4 + k] = g.attributes.skinWeight.getComponent(i, k); }
    }
    const o = new THREE.BufferGeometry();
    o.setAttribute('position', new THREE.BufferAttribute(P, 3)); o.setAttribute('normal', new THREE.BufferAttribute(N, 3)); o.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    o.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(J, 4)); o.setAttribute('skinWeight', new THREE.BufferAttribute(W, 4));
    o.setAttribute('bpos', part ? new THREE.BufferAttribute(new Float32Array(n * 3), 3) : g.attributes.bpos.clone()); o.setAttribute('bnrm', part ? new THREE.BufferAttribute(new Float32Array(n * 3), 3) : g.attributes.bnrm.clone());
    o.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(n).fill(part), 1));
    o.setIndex(g.index ? Array.from(g.index.array) : [...Array(n).keys()]);
    return o;
  };
  geos.push(plain(body.geometry, 0, new THREE.Matrix4(), bsk.bones.map((_, i) => i)));
  for (const o of others) {
    const remap = o.skeleton.bones.map((b) => bIdx.get(b.name));
    const used = new Set(); const SI = o.geometry.attributes.skinIndex, SW = o.geometry.attributes.skinWeight;
    for (let i = 0; i < SI.count; i++) for (let k = 0; k < 4; k++) if (SW.getComponent(i, k) > 0) used.add(SI.getComponent(i, k));
    const b0 = [...used][0], X = rest(body, remap[b0]).invert().multiply(rest(o, b0));
    for (const b of used) { const Y = rest(body, remap[b]).invert().multiply(rest(o, b)); if (!Y.elements.every((e, i) => Math.abs(e - X.elements[i]) < 1e-3)) console.warn('merge: bind mismatch', o.name, b); }
    geos.push(plain(o.geometry, partId(o), X, remap));
  }
  const m = mergeGeometries(geos); m.computeBoundingSphere(); mergedCache.set(key, m); return m;
}

const HEIGHT = { m: 1.8, f: 1.68 };
const packAcc = {}; // original accessory meshes from se-pack/accessories.glb
const PARTMAT = {}; // pack materials by mesh name (body skin maps, eyes, hair)
const SKULL = { top: 1.829, z: 0, r: 0.106, neckY: 1.525, neckR: 0.068, neckZ: 0 };
let fit = null;
const once = new Set(['Punch_Jab', 'Punch_Cross', 'Punch_Enter', 'Sword_Attack', 'Pistol_Shoot', 'Death01', 'Hit_Chest', 'Hit_Head', 'Roll', 'Jump_Start']);

export function makeCharacter(L, shadow) {
  const root = skeletonClone(tmpl);
  const mat = clothMat(L);
  let hand = null, head = null, neckB = null, hips = null;
  const sx = L.female ? 'f_' : 'm_', A0 = L.acc || {}, covered = A0.cap || A0.rag || A0.police || A0.hat;
  // hair: real meshes; short under caps and hats so nothing pokes through
  const hairPart = L.hair === 2 ? null : L.female ? (covered ? 'hair_buzz' : (L.hairStyle ?? 0) % 2 ? 'hair_buns' : 'hair_long') : covered ? 'hair_buzz' : 'hair_short';
  const want = new Set([sx + 'body', sx + 'eyes', sx + 'brows', hairPart, L.beard > 0 && !L.female ? 'beard' : null]);
  const drop = [];
  root.traverse((o) => {
    if (o.isSkinnedMesh && !want.has(o.name)) { drop.push(o); return; }
    if (o.isMesh) { o.material = /_body$/.test(o.name) ? mat : /eyes$/.test(o.name) ? PARTMAT[o.name] : hairMat(PARTMAT[o.name], L.hairC); o.castShadow = !!shadow; o.frustumCulled = false; }
    if (o.isBone) {
      if (o.name === 'hand_r') hand = o; else if (o.name === 'Head') head = o; else if (o.name === 'neck_01') neckB = o; else if (o.name === 'pelvis') hips = o;
    }
  });
  for (const o of drop) o.removeFromParent();
  // one draw call per character: eyes, brows, hair and beard are merged into the body SkinnedMesh (shared skeleton)
  { const parts = []; root.traverse((o) => o.isSkinnedMesh && parts.push(o)); const body = parts.find((o) => /_body$/.test(o.name));
    const others = parts.filter((o) => o !== body);
    if (body && others.length) { body.geometry = mergedGeo(body, others); body.material = clothMat(L, true); for (const o of others) o.removeFromParent(); } }
  const F = fit[L.female ? 'f' : 'm'], sc = F.k * (L.female ? HEIGHT.f : HEIGHT.m);
  // accessories are placed in bind pose world space (normalized meters), then parented to the bone
  root.updateMatrixWorld(true);
  const kk = fit.m.n, toT = (x, y, z) => new THREE.Vector3(x / kk, y / kk + fit.m.lo, z / kk), q = new THREE.Quaternion(), ws = new THREE.Vector3();
  let bodyM = null; root.traverse((o) => { if (o.isSkinnedMesh && /_body$/.test(o.name)) bodyM = o; });
  const put = (bone, geo, c, y, z = 0, rough) => { if (!geo.attributes.color) geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3).fill(1), 3)); const m = new THREE.Mesh(geo, accMat(c, rough));
    // bone frame at bind, straight from the skin (independent of the current pose)
    const sk = bodyM.skeleton, bi = sk.bones.indexOf(bone), Bw = bodyM.bindMatrix.clone().multiply(sk.boneInverses[bi].clone().invert()), p = new THREE.Vector3();
    Bw.decompose(p, q, ws); m.position.copy(toT(0, y, z).applyMatrix4(Bw.clone().invert())); m.quaternion.copy(q.invert()); m.scale.setScalar(1 / (kk * ws.x)); m.castShadow = !!shadow; bone.add(m); return m; };
  root.scale.setScalar(sc); root.position.y = -F.lo * sc;
  const W = weapons();
  const bat = new THREE.Mesh(W.bat, W.batMat), gun = new THREE.Mesh(W.pistol, W.gunMat), shotgun = new THREE.Mesh(W.shotgun, W.gunMat), knux = new THREE.Mesh(W.knux, W.goldMat);
  for (const w of [bat, gun, shotgun, knux]) { w.visible = false; w.position.set(GRIP.x, GRIP.y, GRIP.z); hand && hand.add(w); }
  knux.position.set(0, 0.075, 0.03);
  const A = L.acc || {}, AG = accessories();
  if (head) {
    const HY = SKULL.top - 0.065, HZ = SKULL.z;
    if (A.cap) { const m = put(head, AG.cap, A.cap, HY, HZ); if (A.back) m.rotateY(Math.PI); }
    else if (A.rag) put(head, AG.doRag, A.rag, HY - 0.008, HZ);
    else if (A.police) put(head, AG.police, A.police, HY + 0.01, HZ, 0.55); // peaked cap carries the gold badge in vertex colors (one draw call)
    else if (A.hat) put(head, AG.hat, A.hat, HY + 0.03, HZ);
  }
  if (neckB && A.neck) put(neckB, AG.neck, A.neck, SKULL.neckY, SKULL.neckZ);
  const g = new THREE.Group(); g.add(root);
  const mixer = new THREE.AnimationMixer(root);
  const act = {};
  for (const n in clips) { act[n] = mixer.clipAction(clips[n]); if (once.has(n)) { act[n].setLoop(THREE.LoopOnce, 1); act[n].clampWhenFinished = true; } }
  act.Idle_Loop.play();
  g.userData = { mixer, act, cur: 'Idle_Loop', root, bat, gun, shotgun, knux, hips, punchN: 0 };
  return g;
}

export function animate(g, e, dt, sitting) {
  const u = g.userData;
  let want, speed = 1;
  if ((u.cineHold || u.cineTalk) && u.cineAnim && u.act[u.cineAnim]) want = u.cineAnim;
  else if (sitting) want = 'Driving_Loop';
  else if (e.downT > 0 && e.downBusted) want = 'Punch_Enter'; // hands up, held still
  else if (e.hp <= 0) want = 'Death01';
  else if (e.dodgeT > 0) want = 'Roll';
  else if (e.block) want = 'Punch_Enter';
  else if (e.swing > 0) { const w = e.weapon; want = w === 'pistol' || w === 'shotgun' ? 'Pistol_Shoot' : w === 'bat' ? 'Sword_Attack' : (u.punchN % 2 ? 'Punch_Cross' : 'Punch_Jab'); }
  else if (e.hitT > 0.05) want = e.hitT > 0.2 ? 'Hit_Head' : 'Hit_Chest';
  else if (e.jumpT > 0) want = 'Jump_Start';
  else if (e.moving > 0.62) { want = e.moving > 0.9 ? 'Sprint_Loop' : 'Jog_Fwd_Loop'; speed = 0.85 + e.moving * 0.2; }
  else if (e.moving > 0.05) { want = 'Walk_Loop'; speed = Math.max(0.7, e.moving * 2.4); }
  else want = e.weapon === 'pistol' || e.weapon === 'shotgun' ? 'Pistol_Idle_Loop' : 'Idle_Loop';
  const swingStart = e.swing > 0 && (u.lastSwing ?? 0) <= 0;
  if (swingStart) { u.punchN++; if (want.startsWith('Punch_')) want = u.punchN % 2 ? 'Punch_Cross' : 'Punch_Jab'; }
  u.lastSwing = e.swing;
  if (want !== u.cur || swingStart) {
    const next = u.act[want] || u.act.Idle_Loop, prev = u.act[u.cur];
    next.reset(); next.enabled = true;
    const d = next.getClip().duration;
    if (want.startsWith('Punch_') || want === 'Sword_Attack' || want === 'Pistol_Shoot') next.timeScale = d / Math.max(0.25, (e.swing || 0.3) + 0.15);
    else if (want.startsWith('Hit_')) next.timeScale = 1.6;
    else if (want === 'Roll') next.timeScale = d / 0.45;
    else if (want === 'Punch_Enter') { next.time = d * 0.98; next.timeScale = 0; } // boxing guard: hands up by the chin
    else next.timeScale = 1;
    next.play();
    if (prev && prev !== next) prev.crossFadeTo(next, want === 'Punch_Enter' ? 0.1 : 0.14, false);
    u.cur = want;
  }
  if (want === 'Jog_Fwd_Loop' || want === 'Sprint_Loop' || want === 'Walk_Loop') u.act[want].timeScale = speed;
  u.bat.visible = e.weapon === 'bat'; u.gun.visible = e.weapon === 'pistol'; u.shotgun.visible = e.weapon === 'shotgun'; u.knux.visible = e.weapon === 'knuckles';
  u.mixer.update(dt);
}
