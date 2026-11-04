import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { LocalSession } from './net.js';
import { CREWS, GRID, PITCH, BLOCK, CAPTURE_TIME, blockCenter, player, blockAt, insideBuilding, stars, clock, signal, nearestCar, districtOf, DISTRICTS } from './state.js';
import { buildCity } from './city.js';
import { loadCars, makeCar, updateCar, Smoke } from './vehicles.js';
import { loadPeople, makeCharacter, animate, lookFor, ready as modelReady } from './chars.js';
import * as sfx from './audio.js';

const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const params = new URLSearchParams(location.search);
const LOW = (isTouch || params.has('low')) && !params.has('high');
if (isTouch) document.body.classList.add('touch');
const LOD_DIST = LOW ? 34 : 60, CAR_DIST = LOW ? 90 : 170, DRIVER_DIST = LOW ? 30 : 50;
const BASE = import.meta.env.BASE_URL;

const session = new LocalSession({ traffic: LOW ? 8 : 12, peds: LOW ? 10 : 18 });
const S = () => session.state;

// ---------- renderer, sky and light ----------
const renderer = new THREE.WebGLRenderer({ antialias: !LOW, powerPreference: 'high-performance' });
let pixelRatio = Math.min(devicePixelRatio, LOW ? 1.25 : 1.75);
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
const sunDir = new THREE.Vector3();
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene(); const sky2 = new Sky(); sky2.scale.setScalar(1000);
  sky2.material.uniforms.sunPosition.value.setFromSphericalCoords(1, THREE.MathUtils.degToRad(84), 4);
  envScene.add(sky2);
  scene.environment = pmrem.fromScene(envScene, 0.04).texture;
}
scene.fog = new THREE.Fog(0x6a4a52, 50, LOW ? 160 : 240);
const hemi = new THREE.HemisphereLight(0x8c7ab0, 0x3a2a22, 0.9);
const sun = new THREE.DirectionalLight(0xffa060, 2.2);
if (!LOW) { sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 260 }); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03; }
scene.add(hemi, sun, sun.target);

const city = buildCity(scene, LOW, S().blocks);
{ const p = player(S()); city.buildAllNear(p.x, p.z); }

// day and night
const fogDay = new THREE.Color(0x9fb0c0), fogDusk = new THREE.Color(0x6a4a52), fogNight = new THREE.Color(0x0c0e18);
const sunDay = new THREE.Color(0xfff0dd), sunDusk = new THREE.Color(0xffa060);
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
  sun.intensity = 2.6 * day + 0.25 * night; sun.color.copy(sunDay).lerp(sunDusk, dusk * 0.9);
  if (elev < 0) { sun.color.setHex(0x8090c0); }
  hemi.intensity = 0.35 + 0.75 * day; hemi.color.setHex(night > 0.5 ? 0x405080 : 0x8c7ab0);
  scene.environmentIntensity = 0.12 + 0.5 * day;
  scene.fog.color.copy(fogDay).lerp(fogDusk, dusk * 0.8).lerp(fogNight, night);
  renderer.toneMappingExposure = 0.75 + 0.25 * night;
  if (Math.abs(night - lastNightSet) > 0.03) {
    lastNightSet = night;
    for (const [m, base] of city.emissive) m.emissiveIntensity = base * (0.15 + 0.85 * Math.max(night, dusk * 0.6));
    for (const o of city.nightOnly) o.visible = night > 0.3 || dusk > 0.6;
  }
  sky.visible = true;
  return h;
}

// ---------- cars ----------
const carViz = new Map();
let carsReady = false;
const smoke = new Smoke(scene, LOW ? 30 : 70);
let playerCarLight = null;
if (!LOW) { playerCarLight = new THREE.SpotLight(0xfff0d0, 60, 45, 0.5, 0.6, 1.5); scene.add(playerCarLight, playerCarLight.target); playerCarLight.visible = false; }

// ---------- characters ----------
const charViz = new Map();
let peopleReady = false;
const MAXIMP = 120;
const impostor = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.32, 1.1, 2, 6).translate(0, 0.9, 0), new THREE.MeshStandardMaterial({ roughness: 0.8 }), MAXIMP);
impostor.instanceMatrix.setUsage(THREE.DynamicDrawUsage); impostor.count = 0; impostor.frustumCulled = false; scene.add(impostor);
const tmpM = new THREE.Matrix4(), tmpC = new THREE.Color();

// pickups, mission beacon and bullet tracers
const pickupViz = new Map();
const batGeo = new THREE.CylinderGeometry(0.06, 0.1, 1.0, 8), gunGeo = new THREE.BoxGeometry(0.12, 0.25, 0.45);
const pickMat = new THREE.MeshStandardMaterial({ color: 0xffe08a, emissive: 0x806020, roughness: 0.4 });
const glowGeo = new THREE.RingGeometry(0.6, 0.9, 24); glowGeo.rotateX(-Math.PI / 2);
const glowMat = new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.6, toneMapped: false, side: THREE.DoubleSide });
for (const k of S().pickups) {
  const g = new THREE.Group(); const m = new THREE.Mesh(k.type === 'bat' ? batGeo : gunGeo, pickMat); m.position.y = 1; m.rotation.z = k.type === 'bat' ? 0.6 : 0;
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
let attackQueued = false, sprintTouch = false, started = false;
const drive = { left: false, right: false, gas: false, brake: false };
function context() {
  const s = S(), p = player(s);
  if (p.car) return 'EXIT';
  const g = s.ents.find((e) => e.kind === 'giver');
  if (g && (g.x - p.x) ** 2 + (g.z - p.z) ** 2 < 16 && !s.mission) return 'TALK';
  if (nearestCar(s, p, 5)) return 'CAR';
  return null;
}
function doContext() { const c = context(); if (c === 'TALK') session.send({ type: 'talk' }); else if (c) session.send({ type: 'car' }); }
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (!started) return;
  if (e.code === 'KeyF') attackQueued = true;
  if (e.code === 'KeyE' || e.code === 'Enter') doContext();
  if (e.code === 'KeyR') session.send({ type: 'recruit' });
  if (e.code === 'KeyQ') session.send({ type: 'weapon' });
  if (e.code === 'Space') { e.preventDefault(); session.send({ type: 'jump' }); }
  if (e.code === 'KeyH') sfx.honk();
});
addEventListener('keyup', (e) => (keys[e.code] = false));
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
hold('bLeft', 'left'); hold('bRight', 'right'); hold('bGas', 'gas'); hold('bBrake', 'brake');

// ---------- HUD ----------
const $ = (id) => document.getElementById(id);
const radar = $('radar').getContext('2d');
let msgT = 0, bigT = 0;
function showMsg(t) { $('msg').textContent = t; msgT = 5; }
function showBig(t, red) { const b = $('big'); b.textContent = t; b.classList.add('show'); b.classList.toggle('red', !!red); bigT = 3; }
function drawRadar(now) {
  const s = S(), p = player(s), W = 200, Rm = 95, sc = (W / 2) / Rm;
  const ctx = radar; ctx.save();
  ctx.clearRect(0, 0, W, W);
  ctx.beginPath(); ctx.arc(W / 2, W / 2, W / 2, 0, 7); ctx.clip();
  ctx.fillStyle = '#3a4a3a'; ctx.fillRect(0, 0, W, W);
  ctx.translate(W / 2, W / 2); ctx.rotate(yaw - Math.PI); ctx.scale(sc, sc); ctx.translate(-p.x, -p.z);
  // roads
  ctx.fillStyle = '#7a7a7a';
  const ext = GRID * PITCH / 2;
  for (let i = 0; i <= GRID; i++) { const L = (i - GRID / 2) * PITCH; ctx.fillRect(L - 7, -ext - 7, 14, ext * 2 + 14); ctx.fillRect(-ext - 7, L - 7, ext * 2 + 14, 14); }
  // turf
  for (const b of s.blocks) {
    const c = blockCenter(b);
    if (Math.abs(c.x - p.x) > 140 || Math.abs(c.z - p.z) > 140) continue;
    ctx.globalAlpha = b.owner === 'neutral' ? 0.35 : 0.6; ctx.fillStyle = CREWS[b.owner].css;
    ctx.fillRect(c.x - BLOCK / 2, c.z - BLOCK / 2, BLOCK, BLOCK);
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
  if (g && !s.mission) { dot(g.x, g.z, '#fc3', 6); }
  ctx.restore();
  // mission target arrow at the edge if off radar
  const tgt = s.mission && missionTarget(s);
  if (tgt) {
    const dx = tgt.x - p.x, dz = tgt.z - p.z, a = Math.atan2(dz, dx) + (yaw - Math.PI);
    const d = Math.hypot(dx, dz) * sc, r = Math.min(d, W / 2 - 8);
    ctx.fillStyle = '#fc3'; ctx.beginPath(); ctx.arc(W / 2 + Math.cos(a) * r, W / 2 + Math.sin(a) * r, 7, 0, 7); ctx.fill(); ctx.strokeStyle = '#000'; ctx.stroke();
  }
  if (g && !s.mission && s.missionIdx < 4) {
    const dx = g.x - p.x, dz = g.z - p.z, a = Math.atan2(dz, dx) + (yaw - Math.PI), r = Math.min(Math.hypot(dx, dz) * sc, W / 2 - 8);
    ctx.fillStyle = '#fc3'; ctx.font = 'bold 16px Impact'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('M', W / 2 + Math.cos(a) * r, W / 2 + Math.sin(a) * r);
  }
  // player arrow
  ctx.save(); ctx.translate(W / 2, W / 2); ctx.rotate(-(p.ry - yaw)); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000';
  ctx.beginPath(); ctx.moveTo(0, 9); ctx.lineTo(6, -6); ctx.lineTo(-6, -6); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 14px Arial'; ctx.textAlign = 'center';
  const na = yaw - Math.PI - Math.PI / 2; ctx.fillText('N', W / 2 + Math.cos(na) * 88, W / 2 + Math.sin(na) * 88 + 5);
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
function handleFx(list) {
  const p = player(S());
  for (const f of list) {
    const d = f.x !== undefined ? Math.hypot(f.x - p.x, f.z - p.z) : 0, vol = Math.max(0, 1 - d / 45);
    if (f.type === 'hit') {
      const mine = f.by === p.id || f.to === p.id;
      if (vol > 0) sfx.punch(f.heavy, vol);
      if (mine) {
        hitStop = Math.max(hitStop, f.heavy || f.ko ? 0.11 : 0.06);
        shake = Math.max(shake, f.to === p.id ? 0.45 : f.heavy ? 0.35 : 0.2);
        if (isTouch && navigator.vibrate) navigator.vibrate(f.to === p.id ? 60 : f.heavy ? 45 : 25);
      }
    } else if (f.type === 'shot') { tracer(f.x, f.z, f.tx, f.tz); if (vol > 0) sfx.gunshot(vol); if (f.by === p.id) shake = Math.max(shake, 0.15); }
    else if (f.type === 'crash') { if (vol > 0) sfx.crash(vol); if (f.by === p.id) { shake = Math.max(shake, 0.5); if (isTouch && navigator.vibrate) navigator.vibrate(80); } }
    else if (f.type === 'wreck') { sfx.crash(vol); for (let i = 0; i < 8; i++) smoke.emit(f.x, 1.5, f.z, true, true); }
    else if (f.type === 'capture') sfx.sting();
    else if (f.type === 'pickup') sfx.chime(true);
    else if (f.type === 'wasted') showBig('WASTED', true);
    else if (f.type === 'busted') showBig('BUSTED', true);
    else if (f.type === 'mission') { if (f.state === 'pass') { showBig('MISSION PASSED'); sfx.chime(true); } else if (f.state === 'fail') { showBig('MISSION FAILED', true); sfx.chime(false); } else showBig(f.title.toUpperCase()); }
  }
}

// ---------- camera ----------
const camPos = new THREE.Vector3(), tmp = new THREE.Vector3(), look = new THREE.Vector3();

// ---------- loop ----------
let last = performance.now(), radarT = 0, frameAvg = 16, resT = 0, camInit = false;
const startBtn = $('start');
startBtn.disabled = true; startBtn.textContent = 'LOADING...';
Promise.all([
  loadPeople(BASE, () => { peopleReady = true; }).catch((e) => console.error(e)),
  loadCars(BASE).then(() => { carsReady = true; }).catch((e) => console.error(e)),
]).finally(() => { peopleReady = true; startBtn.disabled = false; startBtn.textContent = 'HIT THE STREETS'; });
startBtn.onclick = () => {
  $('intro').classList.add('hidden'); started = true; last = performance.now(); sfx.initAudio();
  showMsg('Talk to Unc for work, or take the block next door: knock out the Locals and stand in the ring.');
};

function sitOffset(type) { return type === 'van' ? 0.95 : type === 'suv' ? 0.8 : 0.55; }

function frame(now) {
  requestAnimationFrame(frame);
  let rdt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
  frameAvg = frameAvg * 0.95 + rdt * 1000 * 0.05;
  if ((resT += rdt) > 2) { resT = 0; const max = Math.min(devicePixelRatio, LOW ? 1.25 : 1.75); const target = frameAvg > 24 ? Math.max(0.7, pixelRatio - 0.15) : frameAvg < 15 ? Math.min(max, pixelRatio + 0.1) : pixelRatio; if (Math.abs(target - pixelRatio) > 0.01) { pixelRatio = target; renderer.setPixelRatio(pixelRatio); } }
  let dt = rdt;
  if (hitStop > 0) { hitStop -= rdt; dt = rdt * 0.05; }
  const s = S(), p = player(s);
  if (started && !s.over) {
    let f = 0, r = 0;
    if (keys.KeyW || keys.ArrowUp) f += 1; if (keys.KeyS || keys.ArrowDown) f -= 1;
    if (keys.KeyD || keys.ArrowRight) r += 1; if (keys.KeyA || keys.ArrowLeft) r -= 1;
    if (p.car) { if (drive.gas) f += 1; if (drive.brake) f -= 1; if (drive.left) r -= 1; if (drive.right) r += 1; if (keys.Space) f = -1; }
    else { f -= stickV.y; r += stickV.x; }
    f = Math.max(-1, Math.min(1, f)); r = Math.max(-1, Math.min(1, r));
    const sprint = keys.ShiftLeft || keys.ShiftRight || sprintTouch;
    if (p.car) session.input(r, f, sprint, dt);
    else {
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
      let mx = fx * f + rx * r, mz = fz * f + rz * r; const l = Math.hypot(mx, mz); if (l > 1) { mx /= l; mz /= l; }
      session.input(mx, mz, sprint, dt);
    }
    if (attackQueued) { const before = p.cd; session.send({ type: 'attack' }); if (p.cd > before && p.weapon !== 'pistol') sfx.whoosh(); attackQueued = false; }
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
    if (e.car) continue;
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
    g.position.x += (e.x - g.position.x) * Math.min(1, rdt * 25); g.position.z += (e.z - g.position.z) * Math.min(1, rdt * 25);
    g.position.y = 0.24 + (e.jumpT > 0 ? Math.sin((1 - e.jumpT / 0.8) * Math.PI) * 0.9 : 0);
    let dr = e.ry - g.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); g.rotation.y += dr * Math.min(1, rdt * 18);
    animate(g, e, dt, false);
    if (e.kind === 'player' && e.moving > 0.05 && started && e.jumpT <= 0) {
      g.userData.stepT = (g.userData.stepT || 0) - dt * (e.moving > 1.3 ? 3.4 : 2.6);
      if (g.userData.stepT <= 0) { g.userData.stepT = 1; sfx.footstep(e.moving > 1.3 ? 1 : 0.7); }
    }
  }
  for (const [id, g] of charViz) if (!seen.has(id)) { scene.remove(g); charViz.delete(id); }
  impostor.count = imp; impostor.instanceMatrix.needsUpdate = true; if (impostor.instanceColor) impostor.instanceColor.needsUpdate = true;
  // cars, drivers, smoke and sirens
  let pcar = null, sirenVol = 0;
  const seenCars = new Set();
  if (carsReady) for (const c of s.cars) {
    const d2 = (c.x - camX) ** 2 + (c.z - camZ) ** 2;
    if (p.car === c.id) pcar = c;
    if (c.siren) sirenVol = Math.max(sirenVol, 1 - Math.sqrt(d2) / 120);
    if (d2 > CAR_DIST * CAR_DIST && p.car !== c.id) continue;
    seenCars.add(c.id);
    let g = carViz.get(c.id);
    if (!g) { g = makeCar(c); g.position.set(c.x, 0, c.z); g.rotation.y = c.ry; scene.add(g); carViz.set(c.id, g); }
    updateCar(g, c, rdt, night > 0.3 || hour > 17.5 || hour < 6.5, now);
    // visible driver
    const occupied = (c.ai && !c.wrecked) || (c.cops && s.ents.some((e) => e.car === c.id));
    const wantDriver = peopleReady && occupied && d2 < DRIVER_DIST * DRIVER_DIST;
    const u = g.userData;
    if (wantDriver && !u.driver) {
      const look = c.cops ? lookFor({ kind: 'cop', look: 1 }, CREWS) : lookFor({ kind: 'ped', look: c.paint * 13 + c.id.length }, CREWS);
      if (modelReady(look.model)) { u.driver = makeCharacter(look, false); u.driver.position.set(-0.42, sitOffset(c.type) - 0.55, 0.15); u.driver.rotation.y = 0; g.add(u.driver); }
    } else if (!wantDriver && u.driver) { g.remove(u.driver); u.driver = null; }
    if (u.driver) animate(u.driver, { hp: 1 }, rdt, true);
    // damage smoke
    if (c.hp < c.max * 0.5 && Math.random() < (c.wrecked ? 0.5 : c.hp < c.max * 0.25 ? 0.3 : 0.12) * (LOW ? 0.6 : 1)) smoke.emit(c.x + Math.sin(c.ry) * 1.8, 1.2, c.z + Math.cos(c.ry) * 1.8, c.wrecked || c.hp < c.max * 0.25, c.wrecked);
    if (c.honk > 1.2 && c.honk - (u.lastHonk || 0) > 2) { u.lastHonk = c.honk; sfx.honk(Math.max(0, 1 - Math.sqrt(d2) / 40)); }
  }
  for (const [id, g] of carViz) if (!seenCars.has(id)) { scene.remove(g); carViz.delete(id); }
  smoke.update(rdt);
  sfx.setEngine(!!pcar, pcar ? pcar.v : 0);
  sfx.setSiren(Math.max(0, sirenVol));
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
    v.prog.visible = !!b.capBy; if (b.capBy) { v.prog.material.color.setHex(CREWS[b.capBy].color); const k = Math.max(0.01, b.capT / CAPTURE_TIME); v.prog.scale.set(k, k, 1); }
  });
  const tgt = missionTarget(s);
  beacon.visible = !!tgt; if (tgt) beacon.position.set(tgt.x, 20, tgt.z);
  // camera
  const pv = pcar && carViz.get(pcar.id) ? carViz.get(pcar.id).position : (charViz.get(p.id)?.position ?? new THREE.Vector3(p.x, 0, p.z));
  lookIdle += rdt;
  if (pcar) { const target = pcar.ry + Math.PI; let d = target - yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); if (lookIdle > 0.8) yaw += d * Math.min(1, rdt * 2.4); }
  const dist = pcar ? 9.5 + Math.abs(pcar.v) * 0.1 : 5.2, h = pcar ? 2.6 : 1.7;
  let dd = dist;
  for (; dd > 1.5; dd -= 0.5) { const cx = pv.x + Math.sin(yaw) * Math.cos(pitch) * dd, cy = h + Math.sin(pitch) * dd, cz = pv.z + Math.cos(yaw) * Math.cos(pitch) * dd; if (!insideBuilding(cx, cz, 0.3, cy)) break; }
  tmp.set(pv.x + Math.sin(yaw) * Math.cos(pitch) * dd, Math.max(0.6, h + Math.sin(pitch) * dd), pv.z + Math.cos(yaw) * Math.cos(pitch) * dd);
  if (!camInit) { camPos.copy(tmp); camInit = true; }
  camPos.lerp(tmp, Math.min(1, rdt * 12));
  camera.position.copy(camPos);
  look.set(pv.x - Math.sin(yaw) * 1.2 + Math.cos(yaw) * (pcar ? 0 : 0.6), h, pv.z - Math.cos(yaw) * 1.2 - Math.sin(yaw) * (pcar ? 0 : 0.6));
  camera.lookAt(look);
  if (shake > 0) { shake = Math.max(0, shake - rdt * 2.2); camera.position.x += (Math.random() - 0.5) * shake * 0.5; camera.position.y += (Math.random() - 0.5) * shake * 0.5; camera.rotation.z += (Math.random() - 0.5) * shake * 0.05; }
  camera.fov = 62 + (pcar ? Math.min(12, Math.abs(pcar.v) * 0.4) : 0); camera.updateProjectionMatrix();
  if (!LOW) { sun.position.set(pv.x + sunDir.x * 100, Math.max(15, sunDir.y * 100), pv.z + sunDir.z * 100); sun.target.position.set(pv.x, 0, pv.z); }
  city.update(pv.x, pv.z);
  // HUD
  const cr = s.crews.player;
  $('cash').textContent = '$' + String(Math.floor(cr.cash)).padStart(8, '0');
  $('rep').textContent = 'Rep ' + Math.floor(cr.rep);
  $('turf').textContent = `Turf ${s.blocks.filter((b) => b.owner === 'player').length}/${s.blocks.length}`;
  $('hpbar').style.width = (p.hp / p.max) * 100 + '%';
  $('clock').textContent = String(Math.floor(hour)).padStart(2, '0') + ':' + String(Math.floor((hour % 1) * 60)).padStart(2, '0');
  const wn = p.weapon === 'pistol' ? 'PISTOL' : p.weapon === 'bat' ? 'BAT' : 'FISTS';
  $('wname').textContent = wn; $('ammo').textContent = p.weapon === 'pistol' ? p.ammo : ''; $('bWeapon').textContent = wn + (p.weapon === 'pistol' ? ' ' + p.ammo : '');
  const st = stars(p); const si = $('stars').children; for (let i = 0; i < 5; i++) si[i].classList.toggle('on', i < st);
  $('stars').classList.toggle('flash', st > 0 && Math.floor(now / 300) % 2 === 0);
  document.body.classList.toggle('driving', !!p.car);
  const ctxName = context(); const cb = $('bCtx'); cb.classList.toggle('hidden', !ctxName); if (ctxName) cb.textContent = ctxName;
  $('bAttack').textContent = p.weapon === 'pistol' ? 'SHOOT' : 'HIT';
  const here = blockAt(s, p.x, p.z);
  $('capture').textContent = here && here.capBy ? `${CREWS[here.capBy].name} taking ${here.hustle}: ${Math.round((here.capT / CAPTURE_TIME) * 100)}%` : '';
  const m = s.mission;
  $('mtitle').textContent = m ? m.title + ':' : '';
  $('mtext').textContent = !m ? '' : m.kind === 'fetch' ? (m.stage ? 'Bring the package to Unc.' : 'Get the package at the yellow marker.') : m.kind === 'beat' ? `Knock out Red Kings (${m.count}/${m.need}).` : m.kind === 'chop' ? (m.stage ? 'Drive it to the chop shop marker.' : 'Steal a muscle car (marked).') : 'Take the marked block.';
  $('mtimer').textContent = m && m.timer > 0 ? Math.ceil(m.timer) + 's' : '';
  if (msgT > 0 && (msgT -= rdt) <= 0) $('msg').textContent = here ? `${DISTRICTS[districtOf(here)]}: ${here.hustle} ($${here.rate}/s), ${CREWS[here.owner].name}` : '';
  if (bigT > 0 && (bigT -= rdt) <= 0) $('big').classList.remove('show');
  if ((radarT -= rdt) <= 0) { radarT = LOW ? 0.1 : 0.05; drawRadar(now); }
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
window.__game = session;
window.__perf = () => ({ frameMs: frameAvg, pixelRatio, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, chars: charViz.size, cars: carViz.size });
