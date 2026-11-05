import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { makeGradePass } from './grade.js';
import { LocalSession } from './net.js';
import { CREWS, GRID, PITCH, BLOCK, CAPTURE_TIME, UPGRADE_COST, blockCenter, player, blockAt, insideBuilding, stars, clock, signal, nearestCar, districtOf, DISTRICTS, guardsOf } from './state.js';
import { buildCity } from './city.js';
import { loadCars, makeCar, updateCar, Smoke, setCarQuality, carNight } from './vehicles.js';
import { loadPeople, makeCharacter, animate, lookFor, ready as modelReady, charNight } from './chars.js';
import * as sfx from './audio.js';
import { createCine } from './cine.js';
import { DOWN_TIME, MISSIONS, debugDown, openingScuffle } from './state.js';
import { Particles, Flashes, Skids } from './fx.js';

let isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const VERSION = 'v0.10';
// ?q=potato: very low quality for slow devices (also chosen automatically on sustained low FPS)
const params = new URLSearchParams(location.search);
const POTATO = params.get('q') === 'potato' || (!params.has('q') && localStorage.getItem('se-q') === 'potato');
const LOW = (isTouch || POTATO || params.has('low') || params.get('q') === 'low') && !params.has('high') && params.get('q') !== 'high';
document.getElementById('ver').textContent = VERSION + (POTATO ? ' potato' : LOW ? ' low' : ' high');
if (isTouch) document.body.classList.add('touch');
// a touchscreen can appear after load (device emulation, convertibles): switch the touch layout on at the first touch
addEventListener('touchstart', () => { if (!isTouch) { isTouch = true; document.body.classList.add('touch'); } }, { capture: true, passive: true });
// no long press menus, callouts or text selection over the game
addEventListener('contextmenu', (e) => { if (!e.target.closest || !e.target.closest('input,textarea')) e.preventDefault(); });
const LOD_DIST = LOW ? 34 : 60, CAR_DIST = LOW ? 90 : 170, DRIVER_DIST = LOW ? 30 : 50;
const BASE = import.meta.env.BASE_URL;

const session = new LocalSession({ traffic: POTATO ? 5 : LOW ? 8 : 12, peds: POTATO ? 6 : LOW ? 10 : 18 });
const S = () => session.state;

// ---------- renderer, sky and light ----------
const renderer = new THREE.WebGLRenderer({ antialias: !LOW, powerPreference: 'high-performance' });
const PR_MAX = () => Math.min(devicePixelRatio, POTATO ? 0.75 : LOW ? 1.25 : 1.75);
let pixelRatio = PR_MAX();
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = !LOW;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 450);
const sky = new Sky(); sky.scale.setScalar(1000);
const su = sky.material.uniforms;
su.turbidity.value = 9; su.rayleigh.value = 2.6; su.mieCoefficient.value = 0.008; su.mieDirectionalG.value = 0.88;
scene.add(sky);
// twilight glow (v0.8.1): warm sunset band toward the sun plus a city light haze, so dusk never reads as a black sky
const glowU = { uSun: { value: new THREE.Vector3(1, 0, 0) }, uDusk: { value: 0 }, uNight: { value: 0 } };
const skyGlow = new THREE.Mesh(new THREE.SphereGeometry(420, 32, 16), new THREE.ShaderMaterial({
  uniforms: glowU, side: THREE.BackSide, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending, fog: false,
  vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w * 0.9999; }',
  fragmentShader: `uniform vec3 uSun; uniform float uDusk, uNight; varying vec3 vD;
    void main(){ vec3 d = normalize(vD); float up = max(d.y, 0.0);
      vec2 sh = normalize(uSun.xz + 1e-4); float toward = max(dot(normalize(d.xz + 1e-4), sh), 0.0);
      float band = exp(-up * 5.0);
      vec3 sunset = mix(vec3(0.55, 0.32, 0.42), vec3(1.0, 0.5, 0.18), pow(toward, 2.0)) * band * (0.55 + 0.6 * pow(toward, 3.0));
      vec3 zen = vec3(0.16, 0.18, 0.36) * (1.0 - band * 0.5);
      vec3 haze = vec3(0.30, 0.24, 0.30) * exp(-up * 3.0);
      gl_FragColor = vec4(uDusk * (sunset + zen) + uNight * haze, 1.0); }`,
}));
skyGlow.renderOrder = -1; skyGlow.frustumCulled = false; scene.add(skyGlow);
const sunDir = new THREE.Vector3();
// Reflections follow the day: the sky is re-baked into the environment map
// whenever the sun has moved far enough.
const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene(), sky2 = new Sky(); sky2.scale.setScalar(1000); envScene.add(sky2);
Object.assign(sky2.material.uniforms, { turbidity: { value: 10 }, rayleigh: { value: 2.6 }, mieCoefficient: { value: 0.01 }, mieDirectionalG: { value: 0.88 } });
let envRT = null; const envSun = new THREE.Vector3(9, 9, 9);
function rebuildEnv() {
  if (envSun.distanceTo(sunDir) < (LOW ? 0.16 : 0.08)) return;
  envSun.copy(sunDir); sky2.material.uniforms.sunPosition.value.copy(sunDir);
  const rt = pmrem.fromScene(envScene, 0.04); scene.environment = rt.texture; if (envRT) envRT.dispose(); envRT = rt;
}
scene.fog = new THREE.Fog(0xb87a52, 45, LOW ? 180 : 270);
const hemi = new THREE.HemisphereLight(0xc8a080, 0x4a3226, 0.9);
const sun = new THREE.DirectionalLight(0xffa060, 2.2);
if (!LOW) { sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 260 }); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03; }
scene.add(hemi, sun, sun.target);

// post: tone map, then a warm LUT grade, light film grain and vignette
const FX = !params.has('nofx') && !POTATO;
let composer = null, grade = null;
if (FX) {
  const rt = new THREE.WebGLRenderTarget(innerWidth * pixelRatio, innerHeight * pixelRatio, { type: THREE.HalfFloatType, samples: LOW ? 0 : 4 });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera)); composer.addPass(new OutputPass());
  grade = makeGradePass(ShaderPass); composer.addPass(grade);
  grade.uniforms.uGrain.value = localStorage.getItem('se-grain') === '0' ? 0 : 1;
}
export function setGrain(on) { localStorage.setItem('se-grain', on ? '1' : '0'); if (grade) grade.uniforms.uGrain.value = on ? 1 : 0; }
const city = buildCity(scene, LOW, S().blocks, BASE);
setCarQuality(LOW, POTATO);
{ const p = player(S()); city.buildAllNear(p.x, p.z); }

// day and night
// warm smoggy haze: peach by day, burnt orange at sunset, plum blue at night
const fogDay = new THREE.Color(0xb48a66), fogDusk = new THREE.Color(0x8a7088), fogNight = new THREE.Color(0x2e2c40);
const sunDay = new THREE.Color(0xfff0dd), sunDusk = new THREE.Color(0xffb27a);
let night = 0, lastNightSet = -1;
function updateDay() {
  const h = clock(S());
  const ang = ((h - 6) / 24) * Math.PI * 2; // 6:00 sunrise, 18:00 sunset
  const elev = Math.sin(ang);
  sunDir.set(Math.cos(ang) * 0.8, elev, 0.45).normalize();
  su.sunPosition.value.copy(sunDir);
  const day = THREE.MathUtils.smoothstep(elev, -0.08, 0.25);
  const dusk = 1 - Math.abs(THREE.MathUtils.clamp(elev / 0.25, -1, 1));
  night = 1 - THREE.MathUtils.smoothstep(elev, -0.12, 0.05);
  const dark = Math.max(night, Math.min(1, (1 - day) * 1.15)); // bridges dusk so twilight is never darker than night
  // night (v0.8): blue purple moonlight plus a strong sky fill so nothing goes black
  sun.intensity = 2.0 * day + 0.75 * night; sun.color.copy(sunDay).lerp(sunDusk, dusk * 0.9);
  if (elev < 0) { sun.color.setHex(0x8c96e0); }
  hemi.intensity = 0.3 + 0.45 * day + (LOW ? 1.5 : 1.35) * dark; hemi.color.setHex(night > 0.5 ? 0x8088d0 : dusk > 0.5 ? 0x8c90b8 : 0xc8a888);
  hemi.groundColor.setHex(night > 0.5 ? 0x5a4434 : dusk > 0.4 ? 0x3a4258 : 0x4a3226); // cool bounce in shadows at dusk
  scene.environmentIntensity = 0.1 + 0.3 * day + 0.2 * night;
  scene.fog.color.copy(fogDay).lerp(fogDusk, dusk * 0.8).lerp(fogNight, night);
  scene.fog.near = 45 - 15 * night;
  const baseExp = 0.62 + 0.3 * dusk + (LOW ? 0.62 : 0.74) * dark, bump = (composer ? 0 : 0.26) * (dark + 0.5 * dusk);
  renderer.toneMappingExposure = baseExp + bump;
  // characters: without a post pass keep most of the scene bump off them (it greyed skin and crew colors), smaller rim gain, mild saturation restore at dusk and night only
  carNight(Math.min(1, dark));
  charNight(Math.min(1.35, dark * 1.3 + 0.15 * dusk), // v0.10.x: small dusk and night lift, albedo scaled so crew colors keep saturation
     composer ? 1.15 : 1.45, composer ? 1 : (baseExp + bump * 0.75) / (baseExp + bump), composer ? 0 : 0.22 * Math.min(1, dark + 0.5 * dusk));
  if (Math.abs(night - lastNightSet) > 0.03) {
    lastNightSet = night;
    for (const [m, base] of city.emissive) m.emissiveIntensity = base * (0.15 + 0.85 * Math.max(night, dusk * 0.6));
    for (const o of city.nightOnly) o.visible = night > 0.3 || dusk > 0.6;
  }
  sky.visible = true;
  skyGlow.position.copy(camera.position); glowU.uSun.value.copy(sunDir); glowU.uDusk.value = Math.max(dusk, (1 - day) * (1 - night)); glowU.uNight.value = night * 0.6;
  rebuildEnv();
  if (grade) { grade.uniforms.uNight.value = night; grade.uniforms.uDusk.value = dusk; }
  return h;
}

// ---------- cars ----------
const carViz = new Map();
let carsReady = false;
const smoke = new Smoke(scene, LOW ? 30 : 70);
let playerCarLight = null;
const headPool = (() => {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128; const g = cv.getContext('2d');
  const gr = g.createLinearGradient(0, 128, 0, 0); gr.addColorStop(0, 'rgba(255,240,200,0.85)'); gr.addColorStop(1, 'rgba(255,240,200,0)'); g.fillStyle = gr;
  g.beginPath(); g.moveTo(22, 128); g.lineTo(42, 128); g.lineTo(64, 0); g.lineTo(0, 0); g.fill();
  const geo = new THREE.PlaneGeometry(13, 22); geo.rotateX(-Math.PI / 2); geo.rotateY(Math.PI); geo.translate(0, 0.05, 13);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: LOW ? 0.75 : 0.45 }));
  m.visible = false; return m;
})();
const lampLights = [];
let frameN = 0;
if (!LOW) for (let i = 0; i < 6; i++) { const L = new THREE.PointLight(0xff9440, 0, 22, 1.4); lampLights.push(L); scene.add(L); }
if (!LOW) { playerCarLight = new THREE.SpotLight(0xfff0d0, 260, 70, 0.62, 0.55, 1.3); scene.add(playerCarLight, playerCarLight.target); playerCarLight.visible = false; }

// ---------- characters ----------
const charViz = new Map();
const cine = createCine({ camera, scene, sfx, charViz, blocked: (x, z, y) => insideBuilding(x, z, 0.4, y) });
let prevCar = null, pendingBig = null, pendingBrief = null, pendingJack = null, wasDown = false;
let peopleReady = false;
const MAXIMP = 120;
const impostor = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.32, 1.1, 2, 6).translate(0, 0.9, 0), new THREE.MeshStandardMaterial({ roughness: 0.8 }), MAXIMP);
impostor.instanceMatrix.setUsage(THREE.DynamicDrawUsage); impostor.count = 0; impostor.frustumCulled = false; scene.add(impostor);
const tmpM = new THREE.Matrix4(), tmpC = new THREE.Color();

// pickups, mission beacon and bullet tracers
const pickupViz = new Map();
// v0.5 feel: particles, muzzle flashes, skid marks, lock-on ring, mission package
const parts = new Particles(scene, LOW ? 140 : 260), flashes = new Flashes(scene), skids = new Skids(scene, LOW ? 220 : 420);
const lockRing = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff4030, transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false }));
lockRing.visible = false; scene.add(lockRing);
const pkgMesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.6), new THREE.MeshStandardMaterial({ color: 0x8a6238, emissive: 0xffaa33, emissiveIntensity: 0.6, roughness: 0.8 }));
pkgMesh.visible = false; scene.add(pkgMesh);
let lockId = null, slowT = 0, camKick = 0, fovKick = 0;
const knuxGeo = new THREE.TorusGeometry(0.16, 0.05, 6, 12), shotGeo = new THREE.BoxGeometry(0.1, 0.14, 0.9);
const batGeo = new THREE.CylinderGeometry(0.06, 0.1, 1.0, 8), gunGeo = new THREE.BoxGeometry(0.12, 0.25, 0.45);
const pickMat = new THREE.MeshStandardMaterial({ color: 0xffe08a, emissive: 0x806020, roughness: 0.4 });
const glowGeo = new THREE.RingGeometry(0.6, 0.9, 24); glowGeo.rotateX(-Math.PI / 2);
const glowMat = new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.6, toneMapped: false, side: THREE.DoubleSide });
for (const k of S().pickups) {
  const g = new THREE.Group(); const m = new THREE.Mesh(k.type === 'bat' ? batGeo : k.type === 'knuckles' ? knuxGeo : k.type === 'shotgun' ? shotGeo : gunGeo, pickMat); m.position.y = 1; m.rotation.z = k.type === 'bat' ? 0.6 : 0;
  const r = new THREE.Mesh(glowGeo, glowMat); r.position.y = 0.3; g.add(m, r); g.position.set(k.x, 0, k.z); scene.add(g); pickupViz.set(k.id, g);
}
const beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 40, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffcc33, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
beacon.position.y = 20; beacon.visible = false; scene.add(beacon);
const tracers = [];
const tracerMat = new THREE.LineBasicMaterial({ color: 0xfff0a0, transparent: true, toneMapped: false });
for (let i = 0; i < 10; i++) { const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]); const l = new THREE.Line(g, tracerMat.clone()); l.visible = false; l.frustumCulled = false; scene.add(l); tracers.push({ l, t: 0 }); }
let tracerI = 0;
function tracer(x, z, tx, tz) { const t = tracers[tracerI = (tracerI + 1) % tracers.length]; const p = t.l.geometry.attributes.position; p.setXYZ(0, x, 1.4, z); p.setXYZ(1, tx, 1.2, tz); p.needsUpdate = true; t.l.visible = true; t.t = 0.08; }

// ---------- input ----------
const keys = {};
let yaw = Math.PI, pitch = 0.3, lookIdle = 0;
let attackBuf = 0, attackQueued = false, sprintTouch = false, started = false;
const drive = { left: false, right: false, gas: false, brake: false, drift: false };
function context() {
  const s = S(), p = player(s);
  if (p.car) return 'EXIT';
  const g = s.ents.find((e) => e.kind === 'giver');
  if (g && (g.x - p.x) ** 2 + (g.z - p.z) ** 2 < 16 && !s.mission) return 'TALK';
  if (nearestCar(s, p, 5)) return 'CAR';
  const b = blockAt(s, p.x, p.z);
  if (b && b.owner === p.crew && !b.upgraded) return 'UPGRADE';
  return null;
}
function doContext() {
  const c = context(); if (c === 'TALK') { session.send({ type: 'talk' }); sfx.chime(true); return; } if (c === 'UPGRADE') { session.send({ type: 'upgrade' }); return; } if (c) { session.send({ type: 'car' }); return; }
  // nothing in reach: say why and where to go instead of silently ignoring the key
  const s = S(), p = player(s), g = s.ents.find((e) => e.kind === 'giver');
  if (g && s.mission) { const d = Math.hypot(g.x - p.x, g.z - p.z); showMsg(d < 4 ? `Finish ${s.mission.title} first.` : 'Nothing here. Follow the marker.'); }
  else if (g) { const d = Math.round(Math.hypot(g.x - p.x, g.z - p.z)); showMsg(`Unc is ${d} m away. Follow the UNC arrow.`); }
}
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (!started) return;
  if (e.code === 'KeyF') attackQueued = true;
  if (e.code === 'KeyE' || e.code === 'Enter') doContext();
  if (e.code === 'KeyR') session.send({ type: 'recruit' });
  if (e.code === 'KeyT') session.send({ type: 'squad' });
  if (e.code === 'KeyU') session.send({ type: 'upgrade' });
  if (e.code === 'KeyQ') session.send({ type: 'weapon' });
  if (e.code === 'Space') { e.preventDefault(); session.send({ type: 'jump' }); }
  if (e.code === 'KeyH') sfx.honk();
  if (e.code === 'KeyC') doDodge();
  if (e.code === 'KeyV' && !e.repeat) session.send({ type: 'block', on: true });
  if (e.code === 'KeyG') { const on = !(grade && grade.uniforms.uGrain.value); setGrain(on); showMsg('Film grain ' + (on ? 'on' : 'off')); }
});
addEventListener('keyup', (e) => { keys[e.code] = false; if (e.code === 'KeyV') session.send({ type: 'block', on: false }); });
renderer.domElement.addEventListener('mousedown', () => {
  if (!started || isTouch) return;
  if (document.pointerLockElement !== renderer.domElement) renderer.domElement.requestPointerLock();
  else attackQueued = true;
});
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  yaw -= e.movementX * 0.0026; pitch = Math.max(-0.1, Math.min(1.1, pitch + e.movementY * 0.002)); lookIdle = 0;
});
const stick = document.getElementById('stick'), knob = document.getElementById('knob');
let stickId = null, stickV = { x: 0, y: 0 }, lookId = null, lookLast = null, stickOrigin = null;
function stickUpdate(t) {
  const m = 65;
  let dx = t.clientX - stickOrigin.x, dy = t.clientY - stickOrigin.y; const d = Math.hypot(dx, dy);
  if (d > m) { dx *= m / d; dy *= m / d; }
  stickV = { x: dx / m, y: dy / m };
  knob.style.transform = `translate(${dx}px,${dy}px)`;
}
addEventListener('touchstart', (e) => {
  // a touch can vanish without touchend (alerts, cutscenes, OS gestures): drop stale ids
  const live = new Set([...e.touches].map((t) => t.identifier));
  for (const t of e.changedTouches) live.delete(t.identifier);
  if (stickId !== null && !live.has(stickId)) endTouch({ changedTouches: [{ identifier: stickId }] });
  if (lookId !== null && !live.has(lookId)) lookId = null;
  for (const t of e.changedTouches) {
    if (t.target.closest('button') || t.target.closest('.panel')) continue;
    if (t.clientX < innerWidth * 0.45 && stickId === null && !player(S()).car) {
      stickId = t.identifier; stickOrigin = { x: t.clientX, y: t.clientY };
      stick.style.left = t.clientX - 65 + 'px'; stick.style.top = t.clientY - 65 + 'px'; stick.style.bottom = 'auto'; stick.classList.add('active');
      stickUpdate(t);
    } else if (lookId === null) { lookId = t.identifier; lookLast = { x: t.clientX, y: t.clientY }; }
  }
}, { passive: true });
addEventListener('touchmove', (e) => {
  for (const t of e.changedTouches) {
    if (t.identifier === stickId) stickUpdate(t);
    if (t.identifier === lookId) {
      yaw -= (t.clientX - lookLast.x) * 0.0065; pitch = Math.max(-0.1, Math.min(1.1, pitch + (t.clientY - lookLast.y) * 0.004));
      lookLast = { x: t.clientX, y: t.clientY }; lookIdle = 0;
    }
  }
}, { passive: true });
const endTouch = (e) => { for (const t of e.changedTouches) { if (t.identifier === stickId) { stickId = null; stickV = { x: 0, y: 0 }; knob.style.transform = ''; stick.classList.remove('active'); stick.style.left = ''; stick.style.top = ''; stick.style.bottom = ''; } if (t.identifier === lookId) lookId = null; } };
addEventListener('touchend', endTouch); addEventListener('touchcancel', endTouch);
const btn = (id, fn) => document.getElementById(id).addEventListener('pointerdown', (e) => { e.preventDefault(); fn(); });
const hold = (id, key) => { const el = document.getElementById(id); el.addEventListener('pointerdown', (e) => { e.preventDefault(); drive[key] = true; el.classList.add('on'); }); for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, () => { drive[key] = false; el.classList.remove('on'); }); };
btn('bAttack', () => (attackQueued = true));
btn('bJump', () => session.send({ type: 'jump' }));
btn('bSprint', () => { sprintTouch = !sprintTouch; document.getElementById('bSprint').classList.toggle('on', sprintTouch); });
btn('bCtx', doContext);
btn('bWeapon', () => session.send({ type: 'weapon' }));
btn('bRecruit', () => session.send({ type: 'recruit' }));
btn('bSquad', () => session.send({ type: 'squad' }));
hold('bLeft', 'left'); hold('bRight', 'right'); hold('bGas', 'gas'); hold('bBrake', 'brake'); hold('bDrift', 'drift');
btn('bDodge', () => doDodge());
{ const el = document.getElementById('bBlock'); el.addEventListener('pointerdown', (e) => { e.preventDefault(); session.send({ type: 'block', on: true }); el.classList.add('on'); }); for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, () => { session.send({ type: 'block', on: false }); el.classList.remove('on'); }); }
// dodge goes where the stick points, or backward when the stick is idle
function doDodge() {
  let f = -stickV.y, r = stickV.x; if (keys.KeyW) f += 1; if (keys.KeyS) f -= 1; if (keys.KeyD) r += 1; if (keys.KeyA) r -= 1;
  if (Math.hypot(f, r) < 0.2) { session.send({ type: 'dodge' }); return; }
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
  session.send({ type: 'dodge', dx: fx * f + rx * r, dz: fz * f + rz * r });
}
// lock-on: the best hostile in front of the camera within weapon reach
function pickLock() {
  const s = S(), p = player(s); if (p.car) return null;
  const range = p.weapon === 'pistol' ? 26 : p.weapon === 'shotgun' ? 13 : 7;
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  let best = null, bs = -1e9;
  for (const e of s.ents) {
    if (e.hp <= 0 || e.car || !((e.kind === 'npc' && e.crew !== p.crew) || (e.kind === 'cop' && p.heat > 0))) continue;
    const dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz); if (d > range) continue;
    const dot = (dx * fx + dz * fz) / (d || 1); if (dot < (isTouch ? 0.2 : 0.45) && d > 2.5) continue;
    const sc = dot * 3 - d * 0.25 + (e.id === lockId ? 1.5 : 0);
    if (sc > bs) { bs = sc; best = e; }
  }
  return best;
}

// ---------- HUD ----------
const $ = (id) => document.getElementById(id);
const radar = $('radar').getContext('2d');
let msgT = 0, bigT = 0, dtagT = 0, lastHere = null;
let incT = 0, starWant = 0, starShown = 0, starHold = 0;
function pop(t, cls = '') { const el = document.createElement('div'); el.className = 'pop ' + cls; el.textContent = t; $('pops').appendChild(el); setTimeout(() => el.remove(), 2600); }
function showMsg(t) { $('msg').textContent = t; msgT = 5; }
function showBig(t, red) { const b = $('big'); b.textContent = t; b.classList.add('show'); b.classList.toggle('red', !!red); bigT = isTouch ? 1.6 : 2.2; }
function drawRadar(now) {
  const s = S(), p = player(s), W = 280, Rm = 80, sc = (W / 2) / Rm;
  const ctx = radar; ctx.save();
  ctx.clearRect(0, 0, W, W);
  ctx.beginPath(); ctx.arc(W / 2, W / 2, W / 2, 0, 7); ctx.clip();
  ctx.fillStyle = '#2a332b'; ctx.fillRect(0, 0, W, W);
  ctx.translate(W / 2, W / 2); ctx.rotate(yaw - Math.PI); ctx.scale(sc, sc); ctx.translate(-p.x, -p.z);
  // roads
  ctx.fillStyle = '#7a7a7a';
  const ext = GRID * PITCH / 2;
  for (let i = 0; i <= GRID; i++) { const L = (i - GRID / 2) * PITCH; ctx.fillRect(L - 7, -ext - 7, 14, ext * 2 + 14); ctx.fillRect(-ext - 7, L - 7, ext * 2 + 14, 14); }
  // center lines so streets read as streets
  ctx.strokeStyle = 'rgba(255,210,80,.55)'; ctx.lineWidth = 0.8; ctx.setLineDash([4, 4]); ctx.beginPath();
  for (let i = 0; i <= GRID; i++) { const L = (i - GRID / 2) * PITCH; ctx.moveTo(L, -ext); ctx.lineTo(L, ext); ctx.moveTo(-ext, L); ctx.lineTo(ext, L); }
  ctx.stroke(); ctx.setLineDash([]);
  // turf
  for (const b of s.blocks) {
    const c = blockCenter(b);
    if (Math.abs(c.x - p.x) > 140 || Math.abs(c.z - p.z) > 140) continue;
    ctx.globalAlpha = b.owner === 'neutral' ? 0.35 : 0.6; ctx.fillStyle = CREWS[b.owner].css;
    ctx.fillRect(c.x - BLOCK / 2, c.z - BLOCK / 2, BLOCK, BLOCK);
    ctx.globalAlpha = 0.9; ctx.strokeStyle = b.owner === 'player' ? '#7f7' : 'rgba(0,0,0,.6)'; ctx.lineWidth = 1.2 / sc * 2; ctx.strokeRect(c.x - BLOCK / 2, c.z - BLOCK / 2, BLOCK, BLOCK);
    // the capture ring in the middle of each block
    ctx.beginPath(); ctx.arc(c.x, c.z, 5, 0, 7); ctx.strokeStyle = CREWS[b.owner].css; ctx.lineWidth = 1.5; ctx.stroke();
    if (b.owner === 'player') { const n = guardsOf(s, b).length; ctx.save(); ctx.translate(c.x, c.z); ctx.rotate(Math.PI - yaw); ctx.scale(1 / sc, 1 / sc); ctx.font = 'bold 15px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText(n + '', 0, 0); ctx.fillStyle = n ? '#bfb' : '#f88'; ctx.fillText(n + '', 0, 0); ctx.restore(); }
    if (b.raid && b.owner === 'player' && Math.floor(now / 180) % 2) { ctx.globalAlpha = 0.95; ctx.strokeStyle = '#f44'; ctx.lineWidth = 4; ctx.strokeRect(c.x - BLOCK / 2, c.z - BLOCK / 2, BLOCK, BLOCK); }
    if (b.capBy && Math.floor(now / 250) % 2) { ctx.globalAlpha = 0.9; ctx.fillStyle = CREWS[b.capBy].css; ctx.fillRect(c.x - BLOCK / 2, c.z - BLOCK / 2, BLOCK, BLOCK); }
  }
  ctx.globalAlpha = 1;
  const dot = (x, z, col, r = 3.5) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, z, r / sc, 0, 7); ctx.fill(); };
  for (const e of s.ents) {
    if (e.hp <= 0 || Math.abs(e.x - p.x) > 110 || Math.abs(e.z - p.z) > 110) continue;
    if (e.kind === 'npc') dot(e.x, e.z, CREWS[e.crew].css, 3);
    else if (e.kind === 'cop' && !e.car) dot(e.x, e.z, Math.floor(now / 200) % 2 ? '#f22' : '#26f', 3.5);
  }
  for (const c of s.cars) if (c.cops && Math.abs(c.x - p.x) < 110 && Math.abs(c.z - p.z) < 110) dot(c.x, c.z, Math.floor(now / 200) % 2 ? '#26f' : '#f22', 4.5);
  for (const k of s.pickups) if (k.respawnT <= 0) dot(k.x, k.z, '#6cf', 3);
  const g = s.ents.find((e) => e.kind === 'giver');
  if (g && !s.mission) { dot(g.x, g.z, '#000', 9); dot(g.x, g.z, '#fc3', 7.5); }
  const gt = !s.mission && started ? guideTarget(s, p) : null;
  if (gt && gt.label === 'RING') { ctx.beginPath(); ctx.arc(gt.x, gt.z, 9 + Math.sin(now / 200) * 2, 0, 7); ctx.strokeStyle = '#fc3'; ctx.lineWidth = 2.5; ctx.stroke(); }
  ctx.restore();
  // mission target arrow at the edge if off radar
  const tgt = s.mission && missionTarget(s);
  const alertT = !tgt && started ? alertTarget(s) : null;
  if (tgt) {
    const dx = tgt.x - p.x, dz = tgt.z - p.z, a = Math.atan2(dz, dx) + (yaw - Math.PI);
    const d = Math.hypot(dx, dz) * sc, r = Math.min(d, W / 2 - 14);
    ctx.fillStyle = '#fc3'; ctx.beginPath(); ctx.arc(W / 2 + Math.cos(a) * r, W / 2 + Math.sin(a) * r, 10, 0, 7); ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.stroke();
  } else if (alertT) {
    const dx = alertT.x - p.x, dz = alertT.z - p.z, a = Math.atan2(dz, dx) + (yaw - Math.PI);
    const d = Math.hypot(dx, dz) * sc, r = Math.min(d, W / 2 - 14);
    ctx.fillStyle = alertT.label === 'LOST' ? '#f66' : '#f44'; ctx.beginPath(); ctx.arc(W / 2 + Math.cos(a) * r, W / 2 + Math.sin(a) * r, 10, 0, 7); ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.stroke();
  }
  if (g && !s.mission && s.missionIdx < MISSIONS.length) {
    const dx = g.x - p.x, dz = g.z - p.z, a = Math.atan2(dz, dx) + (yaw - Math.PI), r = Math.min(Math.hypot(dx, dz) * sc, W / 2 - 14);
    ctx.fillStyle = '#fc3'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.font = 'bold 22px Impact'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.strokeText('U', W / 2 + Math.cos(a) * r, W / 2 + Math.sin(a) * r); ctx.fillText('U', W / 2 + Math.cos(a) * r, W / 2 + Math.sin(a) * r);
  }
  // player arrow
  ctx.save(); ctx.translate(W / 2, W / 2); ctx.rotate(-(p.ry - yaw)); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000';
  ctx.beginPath(); ctx.moveTo(0, 13); ctx.lineTo(9, -8); ctx.lineTo(-9, -8); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.font = 'bold 20px Arial'; ctx.textAlign = 'center';
  const na = yaw - Math.PI - Math.PI / 2; ctx.strokeText('N', W / 2 + Math.cos(na) * 120, W / 2 + Math.sin(na) * 120 + 7); ctx.fillText('N', W / 2 + Math.cos(na) * 120, W / 2 + Math.sin(na) * 120 + 7);
}
// lost block, or a raid that is still gathering: the arrow and radar use this
function alertTarget(s) {
  const w = s.waypoint;
  if (w) { const b = s.blocks[w.block]; if (b && b.owner !== 'player') return w; }
  let best = null;
  for (const b of s.blocks) if (b.owner === 'player' && b.raid && b.raid.eta > 0 && (!best || b.raid.eta < best.raid.eta)) best = b;
  if (!best) return null;
  const c = blockCenter(best);
  return { x: c.x, z: c.z, label: 'RAID' };
}
function missionTarget(s) {
  const m = s.mission; if (!m) return null;
  if (m.target) return m.target;
  if (m.kind === 'chop' && m.stage === 0) { const p = player(s); let best = null, bd = 1e12; for (const c of s.cars) if (c.type === 'muscle' && !c.wrecked) { const d = (c.x - p.x) ** 2 + (c.z - p.z) ** 2; if (d < bd) { bd = d; best = c; } } return best; }
  if (m.kind === 'beat') { const p = player(s); let best = null, bd = 1e12; for (const e of s.ents) if (e.crew === m.crew && e.hp > 0) { const d = (e.x - p.x) ** 2 + (e.z - p.z) ** 2; if (d < bd) { bd = d; best = e; } } return best; }
  return null;
}

// ---------- feel ----------
let hitStop = 0, shake = 0;
// ---------- v0.10 pause menu ----------
let paused = false;
function setPaused(on) {
  if (!started || S().over) return; paused = on; $('pause').classList.toggle('hidden', !on);
  if (on && document.pointerLockElement) document.exitPointerLock();
}
addEventListener('keydown', (e) => { if ((e.code === 'Escape' || e.code === 'KeyP') && started && !cine.active) setPaused(!paused); });
document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && started && !paused && !isTouch && !cine.active) setPaused(true); });
$('bPause').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); setPaused(true); });
$('pResume').onclick = () => setPaused(false);
$('pRestart').onclick = () => location.reload();
for (const b of document.querySelectorAll('#pause [data-q]')) b.onclick = () => { localStorage.setItem('se-q', b.dataset.q); const u = new URL(location.href); u.searchParams.set('q', b.dataset.q); location.href = u.toString(); };
document.addEventListener('visibilitychange', () => { if (document.hidden && started) setPaused(true); });
function handleFx(list) {
  const s = S(), p = player(s);
  const byId = (id) => s.ents.find((e) => e.id === id);
  for (const f of list) {
    const d = f.x !== undefined ? Math.hypot(f.x - p.x, f.z - p.z) : 0, vol = Math.max(0, 1 - d / 45);
    if (f.type === 'hit') {
      const mine = f.by === p.id || f.to === p.id, src = byId(f.by), w = src ? src.weapon : 'fists';
      if (vol > 0) { sfx.impact(src && (w === 'pistol' || w === 'shotgun') && d > 3 ? 'bullet' : w, vol); if (f.ko) sfx.knockout(vol); }
      // sparks and dust, no blood: spray away from the attacker
      if (d < 60) {
        const dir = [f.dx * 4 || 0, f.dz * 4 || 0];
        parts.burst(f.x, 1.25, f.z, f.heavy ? 10 : 6, 4, { color: 0xffd27a, life: 0.25, g: 6, s: 0.07, stretch: 1 }, dir);
        parts.burst(f.x, 0.25, f.z, f.ko ? 12 : 5, 2, { color: 0x9a8064, life: 0.7, g: 1.5, s: 0.22, up: 0.4 });
      }
      if (mine) {
        hitStop = Math.max(hitStop, f.ko ? 0.09 : f.heavy ? 0.075 : 0.045);
        shake = Math.max(shake, f.to === p.id ? 0.5 : f.heavy ? 0.38 : 0.22); camKick = Math.max(camKick, f.heavy ? 0.5 : 0.25);
        if (f.ko && f.by === p.id) { slowT = 0.6; fovKick = 6; showMsg('KNOCKOUT'); }
        if (isTouch && navigator.vibrate) navigator.vibrate(f.ko ? [40, 30, 70] : f.to === p.id ? 60 : f.heavy ? 45 : 25);
      }
    } else if (f.type === 'block') {
      if (vol > 0) sfx.block(vol);
      parts.burst(f.x, 1.3, f.z, 8, 3, { color: 0xbfd8ff, life: 0.2, g: 4, s: 0.06, stretch: 1 });
      if (f.to === p.id || f.by === p.id) { shake = Math.max(shake, 0.15); hitStop = Math.max(hitStop, 0.03); }
    } else if (f.type === 'evade' || f.type === 'dodge') { if (f.to === p.id) sfx.whoosh(); parts.burst(f.x, 0.2, f.z, 5, 1.5, { color: 0x9a8064, life: 0.5, g: 1, s: 0.2, up: 0.3 }); }
    else if (f.type === 'whiff') { /* swing sound already played */ }
    else if (f.type === 'shot') {
      const sg = f.gun === 'shotgun', ry = f.ry ?? Math.atan2(f.tx - f.x, f.tz - f.z), mx = f.x + Math.sin(ry) * 0.8, mz = f.z + Math.cos(ry) * 0.8;
      if (sg) for (let k = -1; k <= 1; k++) tracer(f.x, f.z, f.x + Math.sin(ry + k * 0.12) * 13, f.z + Math.cos(ry + k * 0.12) * 13); else tracer(f.x, f.z, f.tx, f.tz);
      flashes.flash(mx, 1.35, mz, sg ? 1.6 : 0.9);
      parts.burst(mx, 1.35, mz, sg ? 8 : 4, sg ? 7 : 4, { color: 0xffc860, life: 0.12, g: 0, s: 0.05, stretch: 1 }, [Math.sin(ry) * 3, Math.cos(ry) * 3]);
      // ejected casing to the right of the shooter
      parts.emit(f.x + Math.cos(ry) * 0.3, 1.3, f.z - Math.sin(ry) * 0.3, Math.cos(ry) * 2.5, 2.5, -Math.sin(ry) * 2.5, { color: sg ? 0xb02020 : 0xd8a840, life: 1.6, g: 12, s: sg ? 0.09 : 0.05, bounce: 0.35 });
      if (vol > 0) { if (sg) sfx.shotgun(vol); else sfx.gunshot(vol); sfx.shell(vol * 0.6); }
      if (f.by === p.id) { shake = Math.max(shake, sg ? 0.4 : 0.16); camKick = Math.max(camKick, sg ? 1 : 0.45); fovKick = sg ? 4 : 1.5; if (isTouch && navigator.vibrate) navigator.vibrate(sg ? 50 : 20); }
    }
    else if (f.type === 'crash' || f.type === 'scrape') {
      const n = f.n || 8, big = f.type === 'crash';
      if (vol > 0) { if (big) sfx.crash(vol); else sfx.scrape(vol); }
      parts.burst(f.x, 0.6, f.z, big ? Math.min(24, 6 + n) : 6, big ? 6 : 4, { color: 0xffc070, life: 0.35, g: 9, s: 0.05, stretch: 1, bounce: 0.3 });
      if (big) parts.burst(f.x, 0.3, f.z, 6, 2, { color: 0x8a8070, life: 0.8, g: 1, s: 0.3, up: 0.4 });
      if (f.by === p.id) { shake = Math.max(shake, big ? Math.min(0.9, 0.25 + n * 0.03) : 0.12); if (big && isTouch && navigator.vibrate) navigator.vibrate(80); const g = carViz.get(p.car); if (g) g.userData.bounce = (g.userData.bounce || 0) + (big ? 0.25 : 0.06); }
    }
    else if (f.type === 'wreck') { sfx.crash(vol); for (let i = 0; i < 8; i++) smoke.emit(f.x, 1.5, f.z, true, true); parts.burst(f.x, 1, f.z, 20, 7, { color: 0xffa040, life: 0.6, g: 9, s: 0.07, stretch: 1, bounce: 0.3 }); }
    else if (f.type === 'guards') { pop(`${f.n} guard${f.n > 1 ? 's' : ''} hold the block`); }
    else if (f.type === 'capture') { sfx.sting(); if (f.crew === 'player') { const b = s.blocks.find((b) => b.id === f.block); if (b && !cine.active) { cine.swing(blockCenter(b)); pendingBig = 'BLOCK CLAIMED'; } } }
    else if (f.type === 'stash' && (!f.stolen || f.crew === 'player')) pop(`+$${f.amt} ${f.hustle}`);
    else if (f.type === 'upgrade') pop(`${f.n} guard${f.n > 1 ? 's' : ''} armed`);
    else if (f.type === 'raid' && f.eta > 0) sfx.chime(false);
    else if (f.type === 'lost') { showBig('BLOCK LOST', true); sfx.chime(false); }
    else if (f.type === 'jack') pendingJack = f.ped;
    else if (f.type === 'pickup') sfx.chime(true);
    else if (f.type === 'gift') pop('A recruit is with you.');
    else if (f.type === 'wasted') { showBig('WASTED', true); cine.down(false); }
    else if (f.type === 'busted') { showBig('BUSTED', true); cine.down(true); }
    else if (f.type === 'mission') { if (f.state === 'pass') { cine.passed(f.title, f.reward, f.rep); pop(`+$${f.reward} mission: ${f.title}`); sfx.chime(true); } else if (f.state === 'fail') { showBig('MISSION FAILED', true); sfx.chime(false); } else { const pg = charViz.get(p.id), gv = s.ents.find((e) => e.kind === 'giver'), ug = gv && charViz.get(gv.id); if (!p.car) { pendingBrief = { idx: f.idx ?? 0, title: f.title, wait: 1.5 }; } else showBig(f.title.toUpperCase()); } }
  }
}

// objective arrow pinned to the screen edge, with distance, when the marker is off screen
const radarEl = document.getElementById('radar'), arrowEl = document.getElementById('objArrow'), arrowTxt = document.getElementById('objDist'), projV = new THREE.Vector3();
// keep the arrow chip (triangle plus the distance label) off the radar, the HUD and the thumb controls
function arrowClear(ax, ay, ex, W, H) {
  const box = (id) => {
    const el = document.getElementById(id); if (!el) return null;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return null;
    const r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2 ? r : null;
  };
  const rr = radarEl.getBoundingClientRect();
  const halfW = Math.max(40, arrowEl.offsetWidth / 2 + 6);
  const halfH = Math.max(28, arrowEl.offsetHeight / 2 + 6);
  const hud = box('hud'), btns = box('btns'), stick = box('stick'), steer = box('steer');
  const hits = (r) => r && ax + halfW > r.left && ax - halfW < r.right && ay + halfH > r.top && ay - halfH < r.bottom;
  if (hits(btns)) {
    const above = btns.top - halfH - 8;
    if (!hud || above - halfH > hud.bottom + 4) ay = above;
    else if (ex >= 0) ax = Math.min(ax, btns.left - halfW - 8);
    else ax = Math.max(ax, btns.right + halfW + 8);
  }
  if (hits(hud)) ax = Math.min(ax, hud.left - halfW - 8);
  if (hits(stick)) ax = Math.max(ax, stick.right + halfW + 8);
  if (hits(steer)) ax = Math.max(ax, steer.right + halfW + 8);
  if (ax - halfW < rr.right + 6 && ay - halfH < rr.bottom + 6) {
    if (rr.bottom + halfH + 10 < H - 90) ay = rr.bottom + halfH + 10;
    else ax = rr.right + halfW + 8;
  }
  ax = Math.max(halfW + 2, Math.min(W - halfW - 2, ax));
  ay = Math.max(halfH + 2, Math.min(H - halfH - 2, ay));
  return [ax, ay];
}
function objArrow(tgt, p) {
  if (!tgt || !started) { arrowEl.style.display = 'none'; return; }
  const dist = Math.hypot(tgt.x - p.x, tgt.z - p.z);
  projV.set(tgt.x, 2, tgt.z).project(camera);
  const behind = projV.z > 1;
  let x = projV.x, y = projV.y; if (behind) { x = -x; y = -y; }
  const on = !behind && Math.abs(x) < 0.85 && Math.abs(y) < 0.8;
  arrowEl.style.display = 'block';
  arrowTxt.textContent = (tgt.label ? tgt.label + ' ' : '') + Math.round(dist) + ' m';
  const W = innerWidth, H = innerHeight;
  if (on) { arrowEl.classList.add('on'); const [ax, ay] = arrowClear((x + 1) / 2 * W, (1 - y) / 2 * H - 40, x, W, H); arrowEl.style.left = ax + 'px'; arrowEl.style.top = ay + 'px'; arrowEl.style.setProperty('--rot', '180deg'); return; }
  arrowEl.classList.remove('on');
  const a = Math.atan2(y, x), m = Math.max(Math.abs(Math.cos(a)) / 0.86, Math.abs(Math.sin(a)) / 0.74);
  const ex = Math.cos(a) / m, ey = Math.sin(a) / m;
  const [ax, ay] = arrowClear((ex + 1) / 2 * W, (1 - ey) / 2 * H, ex, W, H);
  arrowEl.style.left = ax + 'px'; arrowEl.style.top = ay + 'px';
  arrowEl.style.setProperty('--rot', (90 - a * 180 / Math.PI) + 'deg');
}

// ---------- camera ----------
const camPos = new THREE.Vector3(), tmp = new THREE.Vector3(), look = new THREE.Vector3();

// ---------- loop ----------
let slowFor = 0, potatoOffered = false;
let last = performance.now(), radarT = 0, frameAvg = 16, resT = 0, camInit = false;
const startBtn = $('start');
let loaded = false, wantStart = false;
startBtn.textContent = 'LOADING... TAP TO START WHEN READY';
THREE.DefaultLoadingManager.onProgress = (url, done, total) => { $('loadbar').style.width = Math.round((done / total) * 100) + '%'; };
const grainBox = $('grain'); grainBox.checked = localStorage.getItem('se-grain') !== '0'; grainBox.onchange = () => setGrain(grainBox.checked);
Promise.all([
  loadPeople(BASE, () => { peopleReady = true; }, POTATO).catch((e) => console.error(e)),
  loadCars(BASE).then(() => { carsReady = true; }).catch((e) => console.error(e)),
]).finally(() => { peopleReady = true; loaded = true; startBtn.disabled = false; startBtn.textContent = 'HIT THE STREETS'; if (wantStart) startGame(); $('loadbar').style.width = '100%'; document.body.classList.add('loaded'); });
startBtn.onclick = () => { sfx.initAudio(); if (!loaded) { wantStart = true; startBtn.textContent = 'STARTING AS SOON AS IT LOADS...'; return; } startGame(); };
function startGame() {
  if (started) return;
  $('intro').classList.add('hidden'); $('bPause').classList.add('show'); started = true; last = performance.now(); sfx.initAudio();
  showMsg('Welcome to the Eastside.');
  scuffleT = 2.5; onb.step = onb.done ? -1 : 0; renderOnb();
}
// ---------- v0.10 onboarding: opening scuffle, 3 steps, waypoint to the next thing to do ----------
let scuffleT = -1, scufflerId = null, onbMission = false;
const onb = { step: -1, done: localStorage.getItem('se-onb') === '3' };
const ONB = () => isTouch ? ['Stop the muggers: HIT', 'Talk to Unc: TALK', 'Take a block: clear it, stand in the ring'] : ['Stop the muggers: F or click', 'Talk to Unc: E', 'Take a block: clear it, stand in the ring'];
function renderOnb() {
  const el = $('onb'); if (onb.step < 0 || onb.step > 2 || (S().mission && onb.step === 2)) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  el.innerHTML = `<i>${onb.step + 1}/3</i> ${ONB()[onb.step]}`;
}
function onbAdvance(to) { if (onb.step >= 0 && to > onb.step) { onb.step = to; if (to > 2) { localStorage.setItem('se-onb', '3'); showMsg('Tutorial done. Build your empire.'); } renderOnb(); sfx.chime(true); } }
// next place to go when no mission is running: the scuffle, then Unc, then the nearest block ring to take
function guideTarget(s, p) {
  if (onb.step === 0) {
    let best = null, bd = 1e12;
    for (const e of s.ents) if (e.scuffler && e.hp > 0) { const d = (e.x - p.x) ** 2 + (e.z - p.z) ** 2; if (d < bd) { bd = d; best = e; } }
    if (best) return { x: best.x, z: best.z, label: 'LOCAL' };
  }
  const g = s.ents.find((e) => e.kind === 'giver');
  if (onb.step <= 1 && g && s.missionIdx < MISSIONS.length && !s.mission) return { x: g.x, z: g.z, label: 'UNC' };
  if (onb.step === 2) {
    let best = null, bd = 1e12;
    for (const b of s.blocks) if (b.owner !== 'player') { const c = blockCenter(b); const d = (c.x - p.x) ** 2 + (c.z - p.z) ** 2; if (d < bd) { bd = d; best = c; } }
    if (best) return { x: best.x, z: best.z, label: 'RING' };
  }
  return null;
}

const DRIVER_DROP = 0.55; // seat height minus the hips of the Driving_Loop pose
function sitOffset(type) { return type === 'van' ? 0.95 : type === 'suv' ? 0.8 : 0.55; }

function frame(now) {
  requestAnimationFrame(frame);
  renderer.info.reset();
  const rawMs = Math.max(0, now - last);
  let rdt = Math.max(0, Math.min(0.05, rawMs / 1000)); last = now;
  frameAvg = frameAvg * 0.95 + Math.min(1000, rawMs) * 0.05;
  // sustained very low FPS after start: offer potato quality once
  if (started && !POTATO && !paused && frameAvg > 70 && (slowFor += rdt) > 6 && !potatoOffered) { potatoOffered = true; showMsg('Running slow: try POTATO in Pause.'); pixelRatio = 0.5; renderer.setPixelRatio(pixelRatio); composer = null; }
  else if (frameAvg < 50) slowFor = 0;
  if ((resT += rdt) > 2) { resT = 0; const max = PR_MAX(); const target = frameAvg > 24 ? Math.max(POTATO ? 0.5 : 0.7, pixelRatio - 0.15) : frameAvg < 15 ? Math.min(max, pixelRatio + 0.1) : pixelRatio; if (Math.abs(target - pixelRatio) > 0.01) { pixelRatio = target; renderer.setPixelRatio(pixelRatio); if (composer) { composer.setPixelRatio(pixelRatio); } } }
  let dt = rdt;
  if (hitStop > 0) { hitStop -= rdt; dt = rdt * 0.05; } else if (slowT > 0) { slowT -= rdt; dt = rdt * (0.25 + 0.75 * Math.max(0, 1 - slowT / 0.6) ** 2); }
  const s = S(), p = player(s);
  if (p.downT > 0) dt *= 0.4; // down beat in slow motion
  if (paused) dt = 0;
  if (started && !s.over && !cine.pausesSim && !paused) {
    let f = 0, r = 0;
    if (keys.KeyW || keys.ArrowUp) f += 1; if (keys.KeyS || keys.ArrowDown) f -= 1;
    if (keys.KeyD || keys.ArrowRight) r += 1; if (keys.KeyA || keys.ArrowLeft) r -= 1;
    if (p.car) { if (drive.gas) f += 1; if (drive.brake) f -= 1; if (drive.left) r -= 1; if (drive.right) r += 1; }
    else { f -= stickV.y; r += stickV.x; }
    f = Math.max(-1, Math.min(1, f)); r = Math.max(-1, Math.min(1, r));
    const sprint = keys.ShiftLeft || keys.ShiftRight || sprintTouch;
    if (cine.holdsInput) { f = 0; r = 0; attackQueued = false; }
    if (p.car) session.input(r, f, drive.drift || keys.Space, dt);
    else {
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
      let mx = fx * f + rx * r, mz = fz * f + rz * r; const l = Math.hypot(mx, mz); if (l > 1) { mx /= l; mz /= l; }
      session.input(mx, mz, sprint, dt);
    }
    if (attackQueued) { if (!attackBuf) attackBuf = 0.4; const before = p.cd; session.send({ type: 'attack', target: lockId }); if (p.cd > before && p.weapon !== 'pistol' && p.weapon !== 'shotgun') sfx.whoosh(); attackBuf = p.cd > before ? 0 : Math.max(0, attackBuf - dt); attackQueued = attackBuf > 0; } // buffer taps made during cooldown
    session.tick(dt);
    for (const ev of session.drainEvents()) showMsg(ev.text);
    handleFx(session.drainFx());
    if (s.over) {
      $('end').classList.remove('hidden');
      $('endTitle').textContent = s.over === 'win' ? 'YOU RUN THIS CITY' : 'PUSHED OUT';
      $('endText').textContent = s.over === 'win' ? `The rival crews are gone. Rep ${Math.round(s.crews.player.rep)}. Time ${Math.round(s.t)}s.` : 'Your last block fell. The rivals own the city for now.';
    }
  }
  const hour = updateDay();
  const camX = camera.position.x, camZ = camera.position.z;
  // characters (people in cars are drawn as drivers instead)
  const seen = new Set(); let imp = 0;
  if (peopleReady) for (const e of s.ents) {
    if (e.car && !(e.kind === 'player' && (cine.active === 'car' || e.car !== prevCar))) continue;
    const d2 = (e.x - camX) ** 2 + (e.z - camZ) ** 2;
    const far = d2 > LOD_DIST * LOD_DIST && e.kind !== 'player';
    if (far) {
      if (d2 < 140 * 140 && imp < MAXIMP) { tmpM.makeTranslation(e.x, e.hp > 0 ? 0.24 : -0.6, e.z); impostor.setMatrixAt(imp, tmpM); impostor.setColorAt(imp, tmpC.setHex(e.kind === 'ped' ? 0x777777 : CREWS[e.crew].shirt)); imp++; }
      continue;
    }
    const look = lookFor(e, CREWS);
    if (!modelReady(look.model) && e.kind !== 'player') continue;
    seen.add(e.id);
    let g = charViz.get(e.id);
    if (!g || g.userData.model !== look.model) { if (g) scene.remove(g); g = makeCharacter(look, !LOW && e.kind === 'player'); g.userData.model = look.model; g.position.set(e.x, 0.24, e.z); scene.add(g); charViz.set(e.id, g); }
    const held = g.userData.cineHold;
    if (!held) g.position.x += (e.x - g.position.x) * Math.min(1, rdt * 25); if (!held) g.position.z += (e.z - g.position.z) * Math.min(1, rdt * 25);
    if (!held) g.position.y = 0.24 + (e.jumpT > 0 ? Math.sin((1 - e.jumpT / 0.8) * Math.PI) * 0.9 : 0);
    let dr = e.ry - g.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); if (!held && !g.userData.cineTalk) g.rotation.y += dr * Math.min(1, rdt * 18);
    animate(g, e, dt, false);
    // ragdoll style lean away from the hit, a forward or backward roll on dodge
    g.rotation.order = 'YXZ';
    const kl = Math.hypot(e.kx || 0, e.kz || 0), back = kl > 0.3 ? -((e.kx * Math.sin(e.ry) + e.kz * Math.cos(e.ry)) / kl) : 0;
    const lean = e.hp > 0 ? Math.min(0.55, kl * 0.06) * back : 0;
    if (!held) g.rotation.x += ((e.dodgeT > 0 ? 0 : -lean) - g.rotation.x) * Math.min(1, rdt * 14); // the dodge roll is the Roll clip
    if (e.kind === 'player' && e.moving > 0.05 && started && e.jumpT <= 0) {
      g.userData.stepT = (g.userData.stepT || 0) - dt * (e.moving > 1.3 ? 3.4 : 2.6);
      if (g.userData.stepT <= 0) { g.userData.stepT = 1; sfx.footstep(e.moving > 1.3 ? 1 : 0.7); }
    }
  }
  for (const [id, g] of charViz) if (!seen.has(id)) { scene.remove(g); charViz.delete(id); }
  impostor.count = imp; impostor.instanceMatrix.needsUpdate = true; if (impostor.instanceColor) impostor.instanceColor.needsUpdate = true;
  // cars, drivers, smoke and sirens
  let pcar = null, sirenVol = 0, skidVol = 0;
  const seenCars = new Set();
  if (carsReady) for (const c of s.cars) {
    const d2 = (c.x - camX) ** 2 + (c.z - camZ) ** 2;
    if (p.car === c.id) pcar = c;
    if (c.siren) sirenVol = Math.max(sirenVol, 1 - Math.sqrt(d2) / 120);
    if (d2 > CAR_DIST * CAR_DIST && p.car !== c.id) continue;
    seenCars.add(c.id);
    let g = carViz.get(c.id);
    if (!g) { g = makeCar(c); g.position.set(c.x, 0, c.z); g.rotation.y = c.ry; scene.add(g); carViz.set(c.id, g); }
    updateCar(g, c, rdt, night > 0.3, now);
    // tire smoke and skid marks from the rear wheels while sliding
    if (c.skid && !c.wrecked && d2 < 70 * 70) {
      const sn = Math.sin(c.ry), cs = Math.cos(c.ry);
      for (const side of [-1, 1]) {
        const wx = c.x - sn * 1.35 + cs * 0.75 * side, wz = c.z - cs * 1.35 - sn * 0.75 * side;
        skids.mark(c.id + side, wx, wz);
        if (Math.random() < (LOW ? 0.25 : 0.5)) smoke.emit(wx, 0.4, wz, false, false);
      }
      if (p.car === c.id) skidVol = Math.min(1, c.slip * 2 + 0.4);
    } else { skids.lift(c.id + -1); skids.lift(c.id + 1); }
    // visible driver
    const occupied = (c.ai && !c.wrecked) || (c.cops && s.ents.some((e) => e.car === c.id));
    for (const ch of g.children) if (ch.userData.beam) ch.visible = ch.visible && (occupied || p.car === c.id); // parked cars keep their lights off
    if (!(occupied || p.car === c.id)) { g.userData.flares.visible = false; g.userData.tails.material.color && (g.userData.tails.visible = true); }
    const wantDriver = peopleReady && occupied && d2 < DRIVER_DIST * DRIVER_DIST;
    const u = g.userData;
    if (wantDriver && !u.driver) {
      const look = c.cops ? lookFor({ kind: 'cop', look: 1 }, CREWS) : lookFor({ kind: 'ped', look: c.paint * 13 + c.id.length }, CREWS);
      if (modelReady(look.model)) { u.driver = makeCharacter(look, false); u.driver.position.set(-0.42, sitOffset(c.type) - DRIVER_DROP, 0.15); u.driver.rotation.y = 0; g.add(u.driver); }
    } else if (!wantDriver && u.driver) { g.remove(u.driver); u.driver = null; }
    if (u.driver) animate(u.driver, { hp: 1 }, rdt, true);
    // damage smoke
    if (c.hp < c.max * 0.5 && Math.random() < (c.wrecked ? 0.5 : c.hp < c.max * 0.25 ? 0.3 : 0.12) * (LOW ? 0.6 : 1)) smoke.emit(c.x + Math.sin(c.ry) * 1.8, 1.2, c.z + Math.cos(c.ry) * 1.8, c.wrecked || c.hp < c.max * 0.25, c.wrecked);
    if (c.honk > 1.2 && c.honk - (u.lastHonk || 0) > 2) { u.lastHonk = c.honk; sfx.honk(Math.max(0, 1 - Math.sqrt(d2) / 40)); }
  }
  for (const [id, g] of carViz) if (!seenCars.has(id)) { scene.remove(g); carViz.delete(id); }
  // car entry and exit moments
  if (p.car !== prevCar) {
    const pg = charViz.get(p.id);
    if (p.car && p.hp > 0) cine.car('in', carViz.get(p.car), pg, pendingJack);
    else if (!p.car && prevCar && p.hp > 0 && !(p.downT > 0) && !cine.pausesSim) { const cg = carViz.get(prevCar); if (cg && pg && Math.hypot(cg.position.x - p.x, cg.position.z - p.z) < 4) cine.car('out', cg, pg); }
    prevCar = p.car; pendingJack = null;
  }
  // Unc briefing: starts as soon as both characters are drawn
  if (pendingBrief) {
    const pg = charViz.get(p.id), gv = s.ents.find((e) => e.kind === 'giver'), ug = gv && charViz.get(gv.id);
    if (pg && ug && !cine.active) { cine.brief(pendingBrief.idx, ug, pg, (MISSIONS[pendingBrief.idx] || {}).intro); pendingBig = pendingBrief.title.toUpperCase(); pendingBrief = null; }
    else if ((pendingBrief.wait -= rdt) <= 0) { showBig(pendingBrief.title.toUpperCase()); pendingBrief = null; }
  }
  if (wasDown && !(p.downT > 0)) cine.up();
  wasDown = p.downT > 0;
  smoke.update(rdt);
  sfx.setEngine(!!pcar, pcar ? pcar.v : 0);
  sfx.setSiren(Math.max(0, sirenVol)); sfx.setSkid(skidVol);
  // headlight throw on the road: an additive ground decal on every platform
  if (pcar && night > 0.3 && carViz.get(pcar.id)) { const g = carViz.get(pcar.id); if (headPool.parent !== g) g.add(headPool); headPool.visible = true; } else headPool.visible = false;
  // sodium lamps: real point lights on the nearest lamps (desktop only)
  if (lampLights.length && night > 0.2 && (frameN++ % 20 === 0)) {
    const near = city.lamps.map((l) => [(l[0] - camX) ** 2 + (l[1] - camZ) ** 2, l]).sort((a, b) => a[0] - b[0]);
    lampLights.forEach((L, i) => { const l = near[i][1]; L.position.set(l[0], 6.4, l[1]); });
  }
  for (const L of lampLights) L.intensity = 55 * night;
  if (playerCarLight) {
    playerCarLight.visible = !!pcar && night > 0.3;
    if (pcar) { const g = carViz.get(pcar.id); playerCarLight.position.set(g.position.x + Math.sin(g.rotation.y) * 2.4, 1, g.position.z + Math.cos(g.rotation.y) * 2.4); playerCarLight.target.position.set(g.position.x + Math.sin(g.rotation.y) * 20, 0, g.position.z + Math.cos(g.rotation.y) * 20); }
  }
  // signals
  const sig = signal(s);
  city.signals.zMat.color.setHex(sig === 'z' ? 0x20ff40 : sig === 'yz' ? 0xffc020 : 0xff2020);
  city.signals.xMat.color.setHex(sig === 'x' ? 0x20ff40 : sig === 'yx' ? 0xffc020 : 0xff2020);
  // pickups
  for (const k of s.pickups) { const g = pickupViz.get(k.id); g.visible = k.respawnT <= 0; g.children[0].rotation.y = now / 500; g.children[0].position.y = 1 + Math.sin(now / 300) * 0.15; }
  for (const t of tracers) if (t.t > 0) { t.t -= rdt; if (t.t <= 0) t.l.visible = false; }
  // block markers
  s.blocks.forEach((b, i) => {
    const v = city.blockViz[i]; v.flag.material.color.setHex(CREWS[b.owner].color); v.flag.material.emissive.setHex(CREWS[b.owner].color); v.ring.material.color.setHex(CREWS[b.owner].color);
    v.flag.rotation.y = Math.sin(now / 600 + i) * 0.15;
    const raidPulse = b.owner === 'player' && b.raid && b.raid.eta > 0;
    if (raidPulse && Math.floor(now / 180) % 2) v.ring.material.color.setHex(0xff4422);
    const pulse = raidPulse ? 1.12 + Math.sin(now / 140) * 0.12 : 1;
    v.ring.scale.set(pulse, pulse, pulse);
    v.prog.visible = !!b.capBy; if (b.capBy) { v.prog.material.color.setHex(CREWS[b.capBy].color); const k = Math.max(0.01, b.capT / CAPTURE_TIME); v.prog.scale.set(k, k, 1); }
  });
  // onboarding progress and the opening scuffle
  if (started && scuffleT > 0 && (scuffleT -= rdt) <= 0) { const e = openingScuffle(s); if (e) { scufflerId = e.id; showMsg('A mugger is going for your bag.'); } }
  if (onb.step === 0 && scuffleT <= 0 && scufflerId == null) onbAdvance(1);
  if (onb.step === 0 && s.opening && s.opening.friends && !s.ents.some((e) => e.scuffler && e.hp > 0)) onbAdvance(1);
  if (onb.step === 1 && (s.mission || s.missionIdx > 0)) onbAdvance(2);
  if (onb.step === 2 && s.blocks.filter((b) => b.owner === 'player').length >= 2) onbAdvance(3);
  if (!!s.mission !== onbMission) { onbMission = !!s.mission; renderOnb(); }
  const tgt = missionTarget(s) || (started ? alertTarget(s) : null) || (started ? guideTarget(s, p) : null);
  beacon.visible = !!tgt && tgt.label !== 'LOCAL'; if (tgt) { beacon.position.set(tgt.x, 60, tgt.z); beacon.material.opacity = 0.28 + Math.sin(now / 250) * 0.1; }
  const isPkg = s.mission && (s.mission.kind === 'fetch' || s.mission.kind === 'hook') && s.mission.stage === 0;
  pkgMesh.visible = !!isPkg; if (isPkg) { pkgMesh.position.set(tgt.x, 0.9 + Math.sin(now / 300) * 0.15, tgt.z); pkgMesh.rotation.y = now / 600; }
  objArrow(tgt, p);
  const lk = started ? pickLock() : null; lockId = lk ? lk.id : null;
  lockRing.visible = !!lk; if (lk) { lockRing.position.set(lk.x, 0.3, lk.z); lockRing.rotation.y = now / 400; }
  parts.update(rdt); flashes.update(rdt);
  // camera
  const pv = pcar && carViz.get(pcar.id) ? carViz.get(pcar.id).position : (charViz.get(p.id)?.position ?? new THREE.Vector3(p.x, 0, p.z));
  lookIdle += rdt;
  if (pcar) { const head = pcar.ry * 0.6 + (pcar.mh ?? pcar.ry) * 0.4, target = head + Math.PI; let d = target - yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); if (lookIdle > 0.5) yaw += d * Math.min(1, rdt * (2.2 + Math.abs(pcar.v) * 0.08)); }
  const downK = p.downT > 0 ? 1 - p.downT / DOWN_TIME : 0;
  const dist = (pcar ? 8.8 + Math.abs(pcar.v) * 0.09 : 5.2) + downK * 2.5, h = (pcar ? 2.5 : 1.7) + downK * 3;
  let dd = dist;
  for (; dd > 1.5; dd -= 0.5) { const cx = pv.x + Math.sin(yaw) * Math.cos(pitch) * dd, cy = h + Math.sin(pitch) * dd, cz = pv.z + Math.cos(yaw) * Math.cos(pitch) * dd; if (!insideBuilding(cx, cz, 0.3, cy)) break; }
  tmp.set(pv.x + Math.sin(yaw) * Math.cos(pitch) * dd, Math.max(0.6, h + Math.sin(pitch) * dd), pv.z + Math.cos(yaw) * Math.cos(pitch) * dd);
  if (!camInit) { camPos.copy(tmp); camInit = true; }
  camPos.lerp(tmp, Math.min(1, rdt * 12));
  camera.position.copy(camPos);
  look.set(pv.x - Math.sin(yaw) * 1.2 + Math.cos(yaw) * (pcar ? 0 : 0.6), h, pv.z - Math.cos(yaw) * 1.2 - Math.sin(yaw) * (pcar ? 0 : 0.6));
  camera.lookAt(look);
  if (shake > 0) { shake = Math.max(0, shake - rdt * 2.2); camera.position.x += (Math.random() - 0.5) * shake * 0.5; camera.position.y += (Math.random() - 0.5) * shake * 0.5; camera.rotation.z += (Math.random() - 0.5) * shake * 0.05; }
  const cineCam = cine.update(rdt); if (cineCam) cine.blendCamera();
  if (!cine.active && pendingBig) { if (!document.getElementById('passCard').classList.contains('show')) showBig(pendingBig); pendingBig = null; }
  if (window.__camOv) { const o = window.__camOv; camera.position.set(o.x, o.y, o.z); camera.lookAt(o.lx, o.ly, o.lz); } // test hook for close-up shots
  if (camKick > 0) { camera.rotateX(camKick * 0.06); camKick = Math.max(0, camKick - rdt * 6); }
  fovKick = Math.max(0, fovKick - rdt * 20);
  const wantFov = 62 + (pcar ? Math.min(18, Math.abs(pcar.v) * 0.55) : 0) + fovKick;
  if (cine.active !== 'brief') { camera.fov += (wantFov - camera.fov) * Math.min(1, rdt * 4); camera.updateProjectionMatrix(); }
  if (!LOW) { sun.position.set(pv.x + sunDir.x * 100, Math.max(15, sunDir.y * 100), pv.z + sunDir.z * 100); sun.target.position.set(pv.x, 0, pv.z); }
  city.update(pv.x, pv.z);
  // HUD
  const cr = s.crews.player;
  $('cash').textContent = '$' + String(Math.floor(cr.cash)).padStart(8, '0');
  document.documentElement.style.setProperty('--hudb', Math.ceil($('hud').getBoundingClientRect().bottom) + 'px');
  // uncollected hustle cash, so the popup matches what is actually sitting on the blocks
  if (started && !paused) {
    incT += dt; if (incT >= 8) {
      incT = 0;
      const mine = s.blocks.filter((b) => b.owner === 'player' && (b.stash || 0) >= 1);
      const amt = mine.reduce((a, b) => a + b.stash, 0);
      if (amt >= 1) pop(`$${Math.floor(amt)} stashed on ${mine.length === 1 ? mine[0].hustle : mine.length + ' blocks'}`);
    }
  }
  $('rep').textContent = 'Rep ' + Math.floor(cr.rep);
  $('turf').textContent = `Turf ${s.blocks.filter((b) => b.owner === 'player').length}/${s.blocks.length}`;
  $('hpbar').style.width = (p.hp / p.max) * 100 + '%';
  $('clock').textContent = String(Math.floor(hour)).padStart(2, '0') + ':' + String(Math.floor((hour % 1) * 60)).padStart(2, '0');
  const wn = p.weapon.toUpperCase();
  $('wname').textContent = wn; const am = p.weapon === 'pistol' ? p.ammo : p.weapon === 'shotgun' ? p.shells : ''; $('ammo').textContent = am; $('bWeapon').textContent = wn + (am !== '' ? ' ' + am : '');
  // wanted stars: a new level must hold for 0.5 s before it shows (no flicker at a threshold);
  // with no heat the row is a faint outline, so dark empty stars never read as earned ones
  const stRaw = stars(p); if (stRaw !== starWant) { starWant = stRaw; starHold = 0.5; } else if (starHold > 0 && (starHold -= rdt) <= 0) starShown = starWant;
  if (stRaw > starShown && starShown === 0) starShown = stRaw; // going wanted shows at once
  const st = starShown, si = $('stars').children; for (let i = 0; i < 5; i++) si[i].classList.toggle('on', i < st);
  $('stars').classList.toggle('none', st === 0);
  $('stars').classList.toggle('flash', st > 0 && p.calmT < 3 && Math.floor(now / 400) % 2 === 0);
  document.body.classList.toggle('driving', !!p.car);
  const ctxName = context(); const cb = $('bCtx'); cb.classList.toggle('hidden', !ctxName); if (ctxName) cb.textContent = ctxName === 'UPGRADE' ? 'ARM' : ctxName;
  // desktop prompt for the E key, so walking up to Unc or a car says what E will do
  const pr = $('prompt'); const ptxt = ctxName === 'TALK' ? 'E  Talk to Unc' : ctxName === 'CAR' ? 'E  Get in' : ctxName === 'EXIT' ? 'E  Get out' : ctxName === 'UPGRADE' ? `E  Arm guards ($${UPGRADE_COST})` : '';
  if (pr.textContent !== ptxt) pr.textContent = ptxt; pr.classList.toggle('hidden', !ptxt || isTouch || !!cine.active);
  $('bAttack').textContent = p.weapon === 'pistol' || p.weapon === 'shotgun' ? 'SHOOT' : 'HIT';
  const here = blockAt(s, p.x, p.z);
  let raidB = null;
  for (const b of s.blocks) if (b.owner === 'player' && b.raid && b.raid.eta > 0 && (!raidB || b.raid.eta < raidB.raid.eta)) raidB = b;
  const capEl = $('capture');
  if (here && here.capBy) { capEl.textContent = `${CREWS[here.capBy].name} taking ${here.hustle}: ${Math.round((here.capT / CAPTURE_TIME) * 100)}%`; capEl.classList.remove('raid'); }
  else if (raidB) { capEl.textContent = `${CREWS[raidB.raid.crew].name} raid on ${raidB.hustle}: ${Math.ceil(raidB.raid.eta)}s`; capEl.classList.add('raid'); }
  else { capEl.textContent = ''; capEl.classList.remove('raid'); }
  const m = s.mission;
  $('mtitle').textContent = m ? m.title + ':' : '';
  $('mtext').textContent = !m ? '' : m.kind === 'hook' ? (m.stage ? 'Bring the bag back to Unc.' : 'Grab the bag at the yellow marker.') : m.kind === 'fetch' ? (m.stage ? 'Bring the package to Unc.' : 'Get the package at the yellow marker.') : m.kind === 'beat' ? `Knock out Red Kings (${m.count}/${m.need}).` : m.kind === 'chop' ? (m.stage ? 'Drive it to the chop shop marker.' : 'Steal a muscle car (marked).') : 'Take the marked block.';
  $('mtimer').textContent = m && m.timer > 0 ? Math.ceil(m.timer) + 's' : '';
  if (here !== lastHere) { lastHere = here; if (here) { const gn = here.owner === 'player' ? guardsOf(s, here).length : 0; const guardNote = here.owner === 'player' ? `, ${gn} guard${gn === 1 ? '' : 's'}${here.upgraded ? ', armed' : ''}${here.stash >= 1 ? `, $${Math.floor(here.stash)} stashed` : ''}` : ''; $('dtag').textContent = `${DISTRICTS[districtOf(here)]}: ${here.hustle}${guardNote}`; $('dtag').classList.add('show'); dtagT = 2.2; } }
  if (dtagT > 0 && (dtagT -= rdt) <= 0) $('dtag').classList.remove('show');
  if (msgT > 0 && (msgT -= rdt) <= 0) $('msg').textContent = '';
  if (bigT > 0 && (bigT -= rdt) <= 0) $('big').classList.remove('show');
  if ((radarT -= rdt) <= 0) { radarT = LOW ? 0.1 : 0.05; drawRadar(now); }
  if (composer) { grade.uniforms.uTime.value = now / 1000; composer.render(); } else renderer.render(scene, camera);
}
requestAnimationFrame(frame);
let sizeW = 0, sizeH = 0, sizeDpr = 0;
function fitCanvas() {
  if (innerWidth === sizeW && innerHeight === sizeH && devicePixelRatio === sizeDpr) return;
  sizeW = innerWidth; sizeH = innerHeight; sizeDpr = devicePixelRatio;
  pixelRatio = Math.min(pixelRatio, PR_MAX()); renderer.setPixelRatio(pixelRatio);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight);
  if (composer) { composer.setPixelRatio(pixelRatio); composer.setSize(innerWidth, innerHeight); }
}
addEventListener('resize', fitCanvas);
// device emulation and rotation do not always fire resize, so also check the size every half second
setInterval(fitCanvas, 500);
window.__game = session; window.__dbg = { scene, carViz, charViz, camera, blockCenter, Raycaster: THREE.Raycaster, down: () => debugDown(S()) };
renderer.info.autoReset = false;
window.__perf = () => ({ frameMs: frameAvg, pixelRatio, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, chars: charViz.size, cars: carViz.size });
