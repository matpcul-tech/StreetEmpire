import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { LocalSession } from './net.js';
import { CREWS, GRID, PITCH, BLOCK, CAPTURE_TIME, blockCenter, player, blockAt, allBuildings } from './state.js';
import { buildCity } from './city.js';
import { makeCar, updateCar } from './vehicles.js';
import { loadCharacters, makeCharacter, animate } from './chars.js';
import * as sfx from './audio.js';

const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const params = new URLSearchParams(location.search);
const LOW = (isTouch || params.has('low')) && !params.has('high');
if (isTouch) document.body.classList.add('touch');
const LOD_DIST = LOW ? 32 : 60;

const session = new LocalSession();
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
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 420);
const sky = new Sky(); sky.scale.setScalar(1000);
const su = sky.material.uniforms;
su.turbidity.value = 9; su.rayleigh.value = 2.6; su.mieCoefficient.value = 0.008; su.mieDirectionalG.value = 0.88;
const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(88), THREE.MathUtils.degToRad(235));
su.sunPosition.value.copy(sunDir);
scene.add(sky);
// environment map from the sky for PBR reflections (rendered once)
const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene(); const sky2 = new Sky(); sky2.scale.setScalar(1000); sky2.material.uniforms.sunPosition.value.copy(sunDir);
for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) sky2.material.uniforms[k].value = su[k].value;
envScene.add(sky2);
scene.environment = pmrem.fromScene(envScene, 0.04).texture;
scene.environmentIntensity = 0.55;
scene.fog = new THREE.Fog(0x6a4a52, 45, LOW ? 150 : 230);

scene.add(new THREE.HemisphereLight(0x8c7ab0, 0x3a2a22, 0.9));
const sun = new THREE.DirectionalLight(0xffa060, 2.2);
sun.position.copy(sunDir).multiplyScalar(80);
if (!LOW) { sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 220 }); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03; }
scene.add(sun, sun.target);

const city = buildCity(scene, LOW, S().blocks);

// ---------- cars ----------
const carViz = new Map();
let playerCarLight = null;
for (const c of S().cars) { const g = makeCar(c.color, LOW); g.position.set(c.x, 0, c.z); g.rotation.y = c.ry; scene.add(g); carViz.set(c.id, g); }
if (!LOW) { playerCarLight = new THREE.SpotLight(0xfff0d0, 60, 40, 0.5, 0.6, 1.5); scene.add(playerCarLight, playerCarLight.target); playerCarLight.visible = false; }

// ---------- characters ----------
const charViz = new Map();
let charsReady = false;
// far characters are drawn as cheap instanced capsules
const MAXIMP = 96;
const impostor = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.32, 1.1, 2, 6).translate(0, 0.9, 0), new THREE.MeshStandardMaterial({ roughness: 0.8 }), MAXIMP);
impostor.instanceMatrix.setUsage(THREE.DynamicDrawUsage); impostor.count = 0; impostor.frustumCulled = false; scene.add(impostor);
const tmpM = new THREE.Matrix4(), tmpC = new THREE.Color();

// pedestrians are cosmetic and client side only (not part of game state)
const peds = [];
const PED_COLORS = [[0x6a6a6a, 0x2a2a35], [0x8a6a4a, 0x303030], [0x40506a, 0x222222], [0xb0a090, 0x403830], [0x6a2a4a, 0x1a1a22], [0x2a2a2a, 0x5a5048]];
function spawnPeds() {
  const n = LOW ? 6 : 14;
  for (let i = 0; i < n; i++) {
    const b = S().blocks[i % S().blocks.length], c = blockCenter(b), r = BLOCK / 2 + 1;
    const col = PED_COLORS[i % PED_COLORS.length];
    const g = makeCharacter({ shirt: col[0], pants: col[1], cap: 0x222222, shadow: false }); scene.add(g);
    peds.push({ g, c, r, t: Math.random() * 4, dir: Math.random() < 0.5 ? 1 : -1, speed: 1.2 + Math.random() * 0.5, x: 0, z: 0, ry: 0, moving: 0.3, hp: 1, kx: 0, kz: 0, flee: 0 });
  }
}
function perimeter(t, c, r) { // t in [0,4) around a square
  const k = Math.floor(((t % 4) + 4) % 4), f = (((t % 4) + 4) % 4) - k;
  const pts = [[-r, -r], [r, -r], [r, r], [-r, r], [-r, -r]];
  return { x: c.x + pts[k][0] + (pts[k + 1][0] - pts[k][0]) * f, z: c.z + pts[k][1] + (pts[k + 1][1] - pts[k][1]) * f };
}

// ---------- input ----------
const keys = {};
let yaw = Math.PI, pitch = 0.32;
let attackQueued = false, sprintTouch = false, started = false;
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (!started) return;
  if (e.code === 'KeyF') attackQueued = true;
  if (e.code === 'KeyE') session.send({ type: 'car' });
  if (e.code === 'KeyR') session.send({ type: 'recruit' });
});
addEventListener('keyup', (e) => (keys[e.code] = false));
renderer.domElement.addEventListener('mousedown', () => {
  if (!started || isTouch) return;
  if (document.pointerLockElement !== renderer.domElement) renderer.domElement.requestPointerLock();
  else attackQueued = true;
});
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  yaw -= e.movementX * 0.0026; pitch = Math.max(-0.1, Math.min(1.1, pitch + e.movementY * 0.002));
});
const stick = document.getElementById('stick'), knob = document.getElementById('knob');
let stickId = null, stickV = { x: 0, y: 0 }, lookId = null, lookLast = null, stickOrigin = null;
function stickUpdate(t) {
  const r = stick.getBoundingClientRect(), m = r.width / 2;
  let dx = t.clientX - stickOrigin.x, dy = t.clientY - stickOrigin.y; const d = Math.hypot(dx, dy);
  if (d > m) { dx *= m / d; dy *= m / d; }
  stickV = { x: dx / m, y: dy / m };
  knob.style.transform = `translate(${dx}px,${dy}px)`;
}
addEventListener('touchstart', (e) => {
  for (const t of e.changedTouches) {
    if (t.target.closest('button') || t.target.closest('.panel')) continue;
    if (t.clientX < innerWidth * 0.45 && stickId === null) {
      // floating stick: it appears where the thumb lands
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
btn('bAttack', () => (attackQueued = true));
btn('bSprint', () => { sprintTouch = !sprintTouch; document.getElementById('bSprint').classList.toggle('on', sprintTouch); });
btn('bCar', () => session.send({ type: 'car' }));
btn('bRecruit', () => session.send({ type: 'recruit' }));
let lookIdle = 0;

// ---------- HUD ----------
const $ = (id) => document.getElementById(id);
const mm = $('minimap').getContext('2d');
let msgT = 0;
function showMsg(t) { $('msg').textContent = t; msgT = 5; }
function drawMinimap() {
  const s = S(), W = 160, half = (GRID * PITCH) / 2 + 8, sc = W / (half * 2);
  const tx = (x) => (x + half) * sc, tz = (z) => (z + half) * sc;
  mm.fillStyle = '#1a1a1c'; mm.fillRect(0, 0, W, W);
  for (const b of s.blocks) {
    const c = blockCenter(b); mm.fillStyle = CREWS[b.owner].css; mm.globalAlpha = 0.7;
    mm.fillRect(tx(c.x - BLOCK / 2), tz(c.z - BLOCK / 2), BLOCK * sc, BLOCK * sc);
    if (b.capBy) { mm.globalAlpha = 1; mm.fillStyle = CREWS[b.capBy].css; mm.fillRect(tx(c.x - BLOCK / 2), tz(c.z + BLOCK / 2) - 4, BLOCK * sc * (b.capT / CAPTURE_TIME), 4); }
  }
  mm.globalAlpha = 1;
  for (const e of s.ents) if (e.hp > 0 && e.kind === 'npc') { mm.fillStyle = CREWS[e.crew].css; mm.fillRect(tx(e.x) - 1.5, tz(e.z) - 1.5, 3, 3); }
  for (const c of s.cars) { mm.fillStyle = c.ai ? '#777' : '#ddd'; mm.fillRect(tx(c.x) - 2, tz(c.z) - 2, 4, 4); }
  const p = player(s);
  mm.save(); mm.translate(tx(p.x), tz(p.z)); mm.rotate(-p.ry + Math.PI); mm.fillStyle = '#fff';
  mm.beginPath(); mm.moveTo(0, -6); mm.lineTo(4, 4); mm.lineTo(-4, 4); mm.fill(); mm.restore();
}

// ---------- feel: hit-stop, shake, vibration ----------
let hitStop = 0, shake = 0;
function handleFx(list) {
  const p = player(S());
  for (const f of list) {
    const d = Math.hypot(f.x - p.x, f.z - p.z), vol = Math.max(0, 1 - d / 40);
    if (f.type === 'hit') {
      const mine = f.by === p.id || f.to === p.id;
      if (vol > 0) sfx.punch(f.heavy, vol);
      if (mine) {
        hitStop = Math.max(hitStop, f.heavy || f.ko ? 0.11 : 0.06);
        shake = Math.max(shake, f.to === p.id ? 0.45 : f.heavy ? 0.35 : 0.2);
        if (isTouch && navigator.vibrate) navigator.vibrate(f.to === p.id ? 60 : f.heavy ? 45 : 25);
      }
    } else if (f.type === 'crash') {
      if (vol > 0) sfx.crash(vol);
      if (f.by === p.id) { shake = Math.max(shake, 0.5); if (isTouch && navigator.vibrate) navigator.vibrate(80); }
    } else if (f.type === 'capture') sfx.sting();
  }
}

// ---------- camera ----------
const camPos = new THREE.Vector3(), tmp = new THREE.Vector3(), look = new THREE.Vector3();
function cameraBlocked(x, y, z) {
  for (const k of allBuildings()) if (y < k.h + 0.6 && Math.abs(x - k.x) < k.w / 2 + 0.3 && Math.abs(z - k.z) < k.d / 2 + 0.3) return true;
  return false;
}

// ---------- loop ----------
let last = performance.now(), mmT = 0, stepT = 0, frameAvg = 16, resT = 0, camInit = false;
const startBtn = $('start');
startBtn.disabled = true; startBtn.textContent = 'LOADING...';
loadCharacters(import.meta.env.BASE_URL + 'models/mannequin.glb').then(() => {
  charsReady = true; spawnPeds(); startBtn.disabled = false; startBtn.textContent = 'HIT THE STREETS';
}).catch((err) => { console.error(err); startBtn.disabled = false; startBtn.textContent = 'HIT THE STREETS'; });
startBtn.onclick = () => {
  $('intro').classList.add('hidden'); started = true; last = performance.now(); sfx.initAudio();
  showMsg('Take the block next door. Knock out the Locals, then stand in the ring.');
};

function lookFor(e) {
  const c = CREWS[e.crew];
  return { shirt: c.shirt, pants: c.pants, cap: e.kind === 'player' ? 0x111111 : c.color, shadow: !LOW };
}

function frame(now) {
  requestAnimationFrame(frame);
  let rdt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
  frameAvg = frameAvg * 0.95 + rdt * 1000 * 0.05;
  // adaptive resolution on weak devices
  if ((resT += rdt) > 2) { resT = 0; const target = frameAvg > 24 ? Math.max(0.75, pixelRatio - 0.15) : frameAvg < 15 ? Math.min(Math.min(devicePixelRatio, LOW ? 1.25 : 1.75), pixelRatio + 0.1) : pixelRatio; if (Math.abs(target - pixelRatio) > 0.01) { pixelRatio = target; renderer.setPixelRatio(pixelRatio); } }
  let dt = rdt;
  if (hitStop > 0) { hitStop -= rdt; dt = rdt * 0.05; }
  const s = S(), p = player(s);
  if (started && !s.over) {
    let f = 0, r = 0;
    if (keys.KeyW || keys.ArrowUp) f += 1; if (keys.KeyS || keys.ArrowDown) f -= 1;
    if (keys.KeyD || keys.ArrowRight) r += 1; if (keys.KeyA || keys.ArrowLeft) r -= 1;
    f -= stickV.y; r += stickV.x;
    const sprint = keys.ShiftLeft || keys.ShiftRight || sprintTouch || Math.hypot(stickV.x, stickV.y) > 0.98 && isTouch && false;
    if (p.car) session.input(r, f, sprint, dt);
    else {
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
      let mx = fx * f + rx * r, mz = fz * f + rz * r; const l = Math.hypot(mx, mz); if (l > 1) { mx /= l; mz /= l; }
      session.input(mx, mz, sprint, dt);
    }
    if (attackQueued) { const before = p.cd; session.send({ type: 'attack' }); if (p.cd > before) sfx.whoosh(); attackQueued = false; }
    session.tick(dt);
    for (const ev of session.drainEvents()) showMsg(ev.text);
    handleFx(session.drainFx());
    if (s.over) {
      $('end').classList.remove('hidden');
      $('endTitle').textContent = s.over === 'win' ? 'YOU RUN THESE STREETS' : 'PUSHED OUT';
      $('endText').textContent = s.over === 'win' ? `All 9 blocks are yours. Rep ${Math.round(s.crews.player.rep)}. Time ${Math.round(s.t)}s.` : 'Your last block fell. The rivals own the neighborhood for now.';
    }
  }
  // characters
  const seen = new Set(); let imp = 0;
  if (charsReady) for (const e of s.ents) {
    seen.add(e.id);
    let g = charViz.get(e.id);
    if (!g) { g = makeCharacter(lookFor(e)); g.position.set(e.x, 0.24, e.z); scene.add(g); charViz.set(e.id, g); }
    const inCar = e.kind === 'player' && e.car;
    const d2 = (e.x - camera.position.x) ** 2 + (e.z - camera.position.z) ** 2;
    const far = d2 > LOD_DIST * LOD_DIST && e.kind !== 'player';
    g.visible = !inCar && !far;
    if (far && !inCar && e.hp > 0 && imp < MAXIMP) {
      tmpM.makeTranslation(e.x, 0.24, e.z); impostor.setMatrixAt(imp, tmpM); impostor.setColorAt(imp, tmpC.setHex(CREWS[e.crew].shirt)); imp++;
    }
    if (!g.visible) continue;
    g.position.x += (e.x - g.position.x) * Math.min(1, rdt * 25); g.position.z += (e.z - g.position.z) * Math.min(1, rdt * 25);
    g.position.y = 0.24;
    let dr = e.ry - g.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); g.rotation.y += dr * Math.min(1, rdt * 18);
    animate(g, e, dt, true);
    if (e.kind === 'player' && e.moving > 0.05 && started) {
      g.userData.stepT = (g.userData.stepT || 0) - dt * (e.moving > 1.3 ? 3.4 : 2.6);
      if (g.userData.stepT <= 0) { g.userData.stepT = 1; sfx.footstep(e.moving > 1.3 ? 1 : 0.7); }
    }
  }
  for (const [id, g] of charViz) if (!seen.has(id)) { scene.remove(g); charViz.delete(id); }
  // pedestrians
  for (const pd of peds) {
    const dx0 = pd.x - p.x, dz0 = pd.z - p.z, near = dx0 * dx0 + dz0 * dz0;
    const car = p.car ? s.cars.find((c) => c.id === p.car) : null;
    if (car && Math.abs(car.v) > 5 && near < 30) { const d = Math.sqrt(near) || 1; pd.kx = dx0 / d * 7; pd.kz = dz0 / d * 7; pd.flee = 3; }
    if (pd.flee > 0) pd.flee -= dt;
    pd.t += pd.dir * pd.speed * (pd.flee > 0 ? 3 : 1) * dt / (pd.r * 2);
    const q = perimeter(pd.t, pd.c, pd.r), nq = perimeter(pd.t + pd.dir * 0.01, pd.c, pd.r);
    pd.kx *= 1 - 5 * dt; pd.kz *= 1 - 5 * dt; pd.ox = (pd.ox || 0) + pd.kx * dt; pd.oz = (pd.oz || 0) + pd.kz * dt; pd.ox *= 1 - dt; pd.oz *= 1 - dt;
    pd.x = q.x + pd.ox; pd.z = q.z + pd.oz; pd.ry = Math.atan2(nq.x - q.x, nq.z - q.z); pd.moving = pd.flee > 0 ? 1.5 : 0.3;
    const d2 = (pd.x - camera.position.x) ** 2 + (pd.z - camera.position.z) ** 2;
    pd.g.visible = d2 < LOD_DIST * LOD_DIST;
    if (!pd.g.visible) continue;
    pd.g.position.set(pd.x, 0.24, pd.z); pd.g.rotation.y = pd.ry; animate(pd.g, pd, dt, true);
  }
  impostor.count = imp; impostor.instanceMatrix.needsUpdate = true; if (impostor.instanceColor) impostor.instanceColor.needsUpdate = true;
  // cars
  let pcar = null;
  for (const c of s.cars) { const g = carViz.get(c.id); updateCar(g, c, rdt); if (p.car === c.id) pcar = c; }
  sfx.setEngine(!!pcar, pcar ? pcar.v : 0);
  if (playerCarLight) {
    playerCarLight.visible = !!pcar;
    if (pcar) { const g = carViz.get(pcar.id); playerCarLight.position.set(g.position.x + Math.sin(g.rotation.y) * 2.4, 1, g.position.z + Math.cos(g.rotation.y) * 2.4); playerCarLight.target.position.set(g.position.x + Math.sin(g.rotation.y) * 20, 0, g.position.z + Math.cos(g.rotation.y) * 20); }
  }
  // block markers
  s.blocks.forEach((b, i) => {
    const v = city.blockViz[i]; v.flag.material.color.setHex(CREWS[b.owner].color); v.flag.material.emissive.setHex(CREWS[b.owner].color); v.ring.material.color.setHex(CREWS[b.owner].color);
    v.flag.rotation.y = Math.sin(now / 600 + i) * 0.15;
    v.prog.visible = !!b.capBy; if (b.capBy) { v.prog.material.color.setHex(CREWS[b.capBy].color); const k = Math.max(0.01, b.capT / CAPTURE_TIME); v.prog.scale.set(k, k, 1); }
  });
  // camera: follow, auto align behind car, avoid walls, shake
  const pv = p.car ? carViz.get(p.car).position : (charViz.get(p.id)?.position ?? new THREE.Vector3(p.x, 0, p.z));
  if (pcar) { lookIdle += rdt; const target = pcar.ry + Math.PI; let d = target - yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); if (lookIdle > 0.8 || isTouch && lookId === null) yaw += d * Math.min(1, rdt * 2.2); }
  const dist = pcar ? 10 + Math.abs(pcar.v) * 0.12 : 5.2;
  const h = pcar ? 2.4 : 1.7;
  let dd = dist;
  for (; dd > 1.5; dd -= 0.5) { const cx = pv.x + Math.sin(yaw) * Math.cos(pitch) * dd, cy = h + Math.sin(pitch) * dd, cz = pv.z + Math.cos(yaw) * Math.cos(pitch) * dd; if (!cameraBlocked(cx, cy, cz)) break; }
  tmp.set(pv.x + Math.sin(yaw) * Math.cos(pitch) * dd, Math.max(0.6, h + Math.sin(pitch) * dd), pv.z + Math.cos(yaw) * Math.cos(pitch) * dd);
  if (!camInit) { camPos.copy(tmp); camInit = true; }
  camPos.lerp(tmp, Math.min(1, rdt * 12));
  camera.position.copy(camPos);
  look.set(pv.x - Math.sin(yaw) * 1.2 + Math.cos(yaw) * (pcar ? 0 : 0.6), h, pv.z - Math.cos(yaw) * 1.2 - Math.sin(yaw) * (pcar ? 0 : 0.6));
  camera.lookAt(look);
  if (shake > 0) { shake = Math.max(0, shake - rdt * 2.2); camera.position.x += (Math.random() - 0.5) * shake * 0.5; camera.position.y += (Math.random() - 0.5) * shake * 0.5; camera.rotation.z += (Math.random() - 0.5) * shake * 0.05; }
  camera.fov = 62 + (pcar ? Math.min(12, Math.abs(pcar.v) * 0.4) : 0); camera.updateProjectionMatrix();
  // shadows follow the player
  if (!LOW) { sun.position.set(pv.x + sunDir.x * 80, sunDir.y * 80 + 20, pv.z + sunDir.z * 80); sun.target.position.set(pv.x, 0, pv.z); }
  // HUD
  const cr = s.crews.player;
  $('cash').textContent = '$' + Math.floor(cr.cash); $('rep').textContent = 'Rep ' + Math.floor(cr.rep);
  $('turf').textContent = `Turf ${s.blocks.filter((b) => b.owner === 'player').length}/${s.blocks.length}`;
  $('hpbar').style.width = (p.hp / p.max) * 100 + '%';
  document.body.classList.toggle('driving', !!p.car);
  const here = blockAt(s, p.x, p.z);
  $('capture').textContent = here && here.capBy ? `${CREWS[here.capBy].name} taking ${here.hustle}: ${Math.round((here.capT / CAPTURE_TIME) * 100)}%` : '';
  if (msgT > 0 && (msgT -= rdt) <= 0) $('msg').textContent = here ? `${here.hustle} ($${here.rate}/s) owned by ${CREWS[here.owner].name}` : '';
  if ((mmT -= rdt) <= 0) { mmT = LOW ? 0.25 : 0.1; drawMinimap(); }
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
window.__game = session; // handy for debugging and headless checks
window.__perf = () => ({ frameMs: frameAvg, pixelRatio, calls: renderer.info.render.calls, tris: renderer.info.render.triangles });
