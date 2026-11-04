import * as THREE from 'three';
import { LocalSession } from './net.js';
import { CREWS, GRID, PITCH, BLOCK, ZONE_R, CAPTURE_TIME, blockCenter, buildingsFor, player, blockAt } from './state.js';

const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const LOW = isTouch || new URLSearchParams(location.search).has('low');
if (isTouch) document.body.classList.add('touch');

const session = new LocalSession();
const S = () => session.state;

// ---------- renderer and scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: !LOW, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, LOW ? 1 : 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = !LOW;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const dusk = new THREE.Color(0x5a3a40);
scene.background = dusk;
scene.fog = new THREE.Fog(dusk, 40, LOW ? 120 : 170);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.5, 250);

scene.add(new THREE.HemisphereLight(0x9a88b0, 0x4a3a30, 2.2));
const sun = new THREE.DirectionalLight(0xff9a50, 2.4);
sun.position.set(-60, 40, -30);
if (!LOW) { sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90 }); }
scene.add(sun);

// ground and streets
const SIZE = GRID * PITCH + 30;
const ground = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), new THREE.MeshLambertMaterial({ color: 0x252427 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
// lane stripes
const stripeMat = new THREE.MeshBasicMaterial({ color: 0x8a7a40 });
for (let i = 0; i <= GRID; i++) {
  const p = (i - GRID / 2) * PITCH;
  for (const horiz of [0, 1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(horiz ? SIZE : 0.3, horiz ? 0.3 : SIZE), stripeMat);
    m.rotation.x = -Math.PI / 2; m.position.set(horiz ? 0 : p, 0.02, horiz ? p : 0); scene.add(m);
  }
}

// window texture shared by all buildings
function windowTex() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d');
  g.fillStyle = '#4a4040'; g.fillRect(0, 0, 64, 64);
  for (let y = 4; y < 64; y += 16) for (let x = 4; x < 64; x += 16) { g.fillStyle = Math.random() < 0.35 ? '#ffcf70' : '#1b1b22'; g.fillRect(x, y, 8, 9); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
const wtex = windowTex();
const sidewalkMat = new THREE.MeshLambertMaterial({ color: 0x55504c });
const lotMat = new THREE.MeshLambertMaterial({ color: 0x3a3632 });
const bMats = [0x6b4a3a, 0x5a5550, 0x7a6450, 0x4a4648].map((c) => { const m = new THREE.MeshLambertMaterial({ color: c, map: wtex }); return m; });
const blockViz = [];
for (const b of S().blocks) {
  const c = blockCenter(b);
  const sw = new THREE.Mesh(new THREE.BoxGeometry(BLOCK + 2, 0.25, BLOCK + 2), sidewalkMat); sw.position.set(c.x, 0.12, c.z); sw.receiveShadow = true; scene.add(sw);
  const lot = new THREE.Mesh(new THREE.BoxGeometry(BLOCK - 4, 0.27, BLOCK - 4), lotMat); lot.position.set(c.x, 0.13, c.z); lot.receiveShadow = true; scene.add(lot);
  for (const k of buildingsFor(b)) {
    const geo = new THREE.BoxGeometry(k.w, k.h, k.d);
    const mat = bMats[(b.id + Math.round(k.x + k.z)) & 3].clone(); mat.map = wtex.clone(); mat.map.repeat.set(k.w / 4, k.h / 4); mat.map.needsUpdate = true;
    const m = new THREE.Mesh(geo, mat); m.position.set(k.x, k.h / 2, k.z); m.castShadow = m.receiveShadow = !LOW; scene.add(m);
  }
  // zone ring and flag
  const ring = new THREE.Mesh(new THREE.RingGeometry(ZONE_R - 0.4, ZONE_R, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(c.x, 0.3, c.z); scene.add(ring);
  const prog = new THREE.Mesh(new THREE.CircleGeometry(ZONE_R - 0.5, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 }));
  prog.rotation.x = -Math.PI / 2; prog.position.set(c.x, 0.31, c.z); scene.add(prog);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 6), new THREE.MeshLambertMaterial({ color: 0x222222 })); pole.position.set(c.x, 3, c.z); scene.add(pole);
  const flag = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.3, 0.1), new THREE.MeshBasicMaterial({ color: 0xffffff })); flag.position.set(c.x + 1.1, 5.3, c.z); scene.add(flag);
  blockViz.push({ ring, prog, flag });
}
// street lights: emissive bulbs everywhere, real lights only on desktop
const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd28a });
const poleMat = new THREE.MeshLambertMaterial({ color: 0x1e1e1e });
for (let i = 0; i <= GRID; i++) for (let j = 0; j <= GRID; j++) {
  const x = (i - GRID / 2) * PITCH + 6, z = (j - GRID / 2) * PITCH + 6;
  const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6), poleMat); p.position.set(x, 3, z); scene.add(p);
  const bl = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), bulbMat); bl.position.set(x, 6, z); scene.add(bl);
  if (!LOW && (i + j) % 2 === 0) { const l = new THREE.PointLight(0xffb060, 30, 22, 1.6); l.position.set(x, 5.5, z); scene.add(l); }
}

// ---------- characters ----------
const bodyGeo = new THREE.BoxGeometry(0.8, 1.0, 0.45), headGeo = new THREE.SphereGeometry(0.28, 10, 8), legGeo = new THREE.BoxGeometry(0.3, 0.8, 0.3), armGeo = new THREE.BoxGeometry(0.22, 0.75, 0.22);
const skin = new THREE.MeshLambertMaterial({ color: 0x8a5a3c }), pants = new THREE.MeshLambertMaterial({ color: 0x1d1f2a });
const crewMat = {}; for (const k in CREWS) crewMat[k] = new THREE.MeshLambertMaterial({ color: CREWS[k].color });
const hitMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
function makeChar(crew, isPlayer) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(bodyGeo, crewMat[crew]); body.position.y = 1.3;
  const head = new THREE.Mesh(headGeo, skin); head.position.y = 2.05;
  const lL = new THREE.Mesh(legGeo, pants), lR = new THREE.Mesh(legGeo, pants);
  lL.geometry.translate; lL.position.set(-0.2, 0.4, 0); lR.position.set(0.2, 0.4, 0);
  const aL = new THREE.Mesh(armGeo, skin), aR = new THREE.Mesh(armGeo, skin);
  aL.position.set(-0.52, 1.35, 0); aR.position.set(0.52, 1.35, 0);
  g.add(body, head, lL, lR, aL, aR);
  if (isPlayer) { const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 10), crewMat.player); cap.position.y = 2.3; g.add(cap); }
  if (!LOW) g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  g.userData = { body, lL, lR, aL, aR, phase: Math.random() * 6 };
  scene.add(g); return g;
}
const charViz = new Map();

// ---------- cars ----------
const carViz = new Map();
const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 10); wheelGeo.rotateZ(Math.PI / 2);
const darkMat = new THREE.MeshLambertMaterial({ color: 0x111111 }), glassMat = new THREE.MeshLambertMaterial({ color: 0x223040 });
const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 }), tailMat = new THREE.MeshBasicMaterial({ color: 0xaa1010 });
for (const c of S().cars) {
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: c.color });
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.7, 4.2), paint); base.position.y = 0.75;
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2.1), glassMat); top.position.set(0, 1.4, -0.2);
  g.add(base, top);
  for (const [x, z] of [[-0.95, 1.3], [0.95, 1.3], [-0.95, -1.3], [0.95, -1.3]]) { const w = new THREE.Mesh(wheelGeo, darkMat); w.position.set(x, 0.4, z); g.add(w); }
  for (const x of [-0.6, 0.6]) { const h = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.05), headMat); h.position.set(x, 0.85, 2.11); g.add(h); const t = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.05), tailMat); t.position.set(x, 0.85, -2.11); g.add(t); }
  if (!LOW) g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  scene.add(g); carViz.set(c.id, g);
}

// ---------- input ----------
const keys = {};
let yaw = Math.PI, pitch = 0.45;
let attackQueued = false, sprintTouch = false;
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
  yaw -= e.movementX * 0.0028; pitch = Math.max(0.05, Math.min(1.1, pitch + e.movementY * 0.0022));
});

// touch: left stick, right side drag to look, buttons
const stick = document.getElementById('stick'), knob = document.getElementById('knob');
let stickId = null, stickV = { x: 0, y: 0 }, lookId = null, lookLast = null;
function stickUpdate(t) {
  const r = stick.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  let dx = t.clientX - cx, dy = t.clientY - cy; const d = Math.hypot(dx, dy), m = r.width / 2;
  if (d > m) { dx *= m / d; dy *= m / d; }
  stickV = { x: dx / m, y: dy / m };
  knob.style.transform = `translate(${dx}px,${dy}px)`;
}
addEventListener('touchstart', (e) => {
  for (const t of e.changedTouches) {
    if (t.target.closest('button')) continue;
    if (t.clientX < innerWidth * 0.45 && stickId === null) { stickId = t.identifier; stickUpdate(t); }
    else if (lookId === null) { lookId = t.identifier; lookLast = { x: t.clientX, y: t.clientY }; }
  }
}, { passive: true });
addEventListener('touchmove', (e) => {
  for (const t of e.changedTouches) {
    if (t.identifier === stickId) stickUpdate(t);
    if (t.identifier === lookId) {
      yaw -= (t.clientX - lookLast.x) * 0.006; pitch = Math.max(0.05, Math.min(1.1, pitch + (t.clientY - lookLast.y) * 0.004));
      lookLast = { x: t.clientX, y: t.clientY };
    }
  }
}, { passive: true });
const endTouch = (e) => { for (const t of e.changedTouches) { if (t.identifier === stickId) { stickId = null; stickV = { x: 0, y: 0 }; knob.style.transform = ''; } if (t.identifier === lookId) lookId = null; } };
addEventListener('touchend', endTouch); addEventListener('touchcancel', endTouch);
const btn = (id, fn) => document.getElementById(id).addEventListener('pointerdown', (e) => { e.preventDefault(); fn(); });
btn('bAttack', () => (attackQueued = true));
btn('bSprint', () => { sprintTouch = !sprintTouch; document.getElementById('bSprint').style.background = sprintTouch ? 'rgba(200,140,40,.7)' : ''; });
btn('bCar', () => session.send({ type: 'car' }));
btn('bRecruit', () => session.send({ type: 'recruit' }));

// ---------- HUD ----------
const $ = (id) => document.getElementById(id);
const mm = $('minimap').getContext('2d');
let msgT = 0;
function showMsg(t) { $('msg').textContent = t; msgT = 5; }
function drawMinimap() {
  const s = S(), W = 160, half = (GRID * PITCH) / 2 + 8, sc = W / (half * 2);
  const tx = (x) => (x + half) * sc, tz = (z) => (z + half) * sc;
  mm.fillStyle = '#151515'; mm.fillRect(0, 0, W, W);
  for (const b of s.blocks) {
    const c = blockCenter(b); mm.fillStyle = CREWS[b.owner].css; mm.globalAlpha = 0.75;
    mm.fillRect(tx(c.x - BLOCK / 2), tz(c.z - BLOCK / 2), BLOCK * sc, BLOCK * sc);
    if (b.capBy) { mm.globalAlpha = 1; mm.fillStyle = CREWS[b.capBy].css; mm.fillRect(tx(c.x - BLOCK / 2), tz(c.z + BLOCK / 2) - 4, BLOCK * sc * (b.capT / CAPTURE_TIME), 4); }
  }
  mm.globalAlpha = 1;
  for (const e of s.ents) if (e.hp > 0 && e.kind === 'npc') { mm.fillStyle = CREWS[e.crew].css; mm.fillRect(tx(e.x) - 1.5, tz(e.z) - 1.5, 3, 3); }
  for (const c of s.cars) { mm.fillStyle = '#ccc'; mm.fillRect(tx(c.x) - 2, tz(c.z) - 2, 4, 4); }
  const p = player(s);
  mm.save(); mm.translate(tx(p.x), tz(p.z)); mm.rotate(-p.ry + Math.PI); mm.fillStyle = '#fff';
  mm.beginPath(); mm.moveTo(0, -6); mm.lineTo(4, 4); mm.lineTo(-4, 4); mm.fill(); mm.restore();
}

// ---------- loop ----------
let started = false, last = performance.now(), mmT = 0;
$('start').onclick = () => { $('intro').classList.add('hidden'); started = true; last = performance.now(); showMsg('Take the block next door. Beat the Locals, then stand in the ring.'); };
const camPos = new THREE.Vector3(), tmp = new THREE.Vector3();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const s = S(), p = player(s);
  if (started && !s.over) {
    // movement intent relative to camera
    let f = 0, r = 0;
    if (keys.KeyW || keys.ArrowUp) f += 1; if (keys.KeyS || keys.ArrowDown) f -= 1;
    if (keys.KeyD || keys.ArrowRight) r += 1; if (keys.KeyA || keys.ArrowLeft) r -= 1;
    f -= stickV.y; r += stickV.x;
    const sprint = keys.ShiftLeft || keys.ShiftRight || sprintTouch;
    if (p.car) session.input(r, f, sprint, dt);
    else {
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
      let mx = fx * f + rx * r, mz = fz * f + rz * r; const l = Math.hypot(mx, mz); if (l > 1) { mx /= l; mz /= l; }
      session.input(mx, mz, sprint, dt);
    }
    if (attackQueued) { session.send({ type: 'attack' }); attackQueued = false; }
    session.tick(dt);
    for (const ev of session.drainEvents()) showMsg(ev.text);
    if (s.over) {
      $('end').classList.remove('hidden');
      $('endTitle').textContent = s.over === 'win' ? 'YOU RUN THESE STREETS' : 'PUSHED OUT';
      $('endText').textContent = s.over === 'win' ? `All 9 blocks are yours. Rep ${Math.round(s.crews.player.rep)}. Time ${Math.round(s.t)}s.` : 'Your last block fell. The rivals own the neighborhood for now.';
    }
  }
  // sync characters
  const seen = new Set();
  for (const e of s.ents) {
    let g = charViz.get(e.id); if (!g) { g = makeChar(e.crew, e.kind === 'player'); charViz.set(e.id, g); }
    seen.add(e.id);
    g.visible = !(e.kind === 'player' && e.car);
    g.position.set(e.x, 0.25, e.z); g.rotation.y = e.ry;
    const u = g.userData;
    if (e.hp <= 0) { g.rotation.x = -Math.PI / 2; g.position.y = 0.45; continue; }
    g.rotation.x = 0;
    u.phase += dt * 10 * (e.moving || 0);
    const sw = Math.sin(u.phase) * 0.7 * Math.min(1, e.moving || 0);
    u.lL.rotation.x = sw; u.lR.rotation.x = -sw; u.aL.rotation.x = -sw * 0.8;
    u.aR.rotation.x = e.swing > 0 ? -1.5 : sw * 0.8;
    u.body.material = e.hitT > 0 ? hitMat : crewMat[e.crew];
  }
  for (const [id, g] of charViz) if (!seen.has(id)) { scene.remove(g); charViz.delete(id); }
  for (const c of s.cars) { const g = carViz.get(c.id); g.position.set(c.x, 0, c.z); g.rotation.y = c.ry; }
  // block markers
  s.blocks.forEach((b, i) => {
    const v = blockViz[i]; v.flag.material.color.setHex(CREWS[b.owner].color); v.ring.material.color.setHex(CREWS[b.owner].color);
    v.prog.visible = !!b.capBy; if (b.capBy) { v.prog.material.color.setHex(CREWS[b.capBy].color); const k = Math.max(0.01, b.capT / CAPTURE_TIME); v.prog.scale.set(k, k, 1); }
  });
  // camera
  if (p.car) { const target = p.ry + Math.PI; let d = target - yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); yaw += d * Math.min(1, dt * 2.5); }
  const dist = p.car ? 11 : 7.5;
  tmp.set(p.x + Math.sin(yaw) * Math.cos(pitch) * dist, 1.8 + Math.sin(pitch) * dist, p.z + Math.cos(yaw) * Math.cos(pitch) * dist);
  camPos.lerp(tmp, Math.min(1, dt * 10)); if (camPos.lengthSq() === 0) camPos.copy(tmp);
  camera.position.copy(camPos); camera.lookAt(p.x, 1.8, p.z);
  // HUD
  const cr = s.crews.player;
  $('cash').textContent = '$' + Math.floor(cr.cash); $('rep').textContent = 'Rep ' + Math.floor(cr.rep);
  $('turf').textContent = `Turf ${s.blocks.filter((b) => b.owner === 'player').length}/${s.blocks.length}`;
  $('hpbar').style.width = (p.hp / p.max) * 100 + '%';
  const here = blockAt(s, p.x, p.z);
  $('capture').textContent = here && here.capBy ? `${CREWS[here.capBy].name} taking ${here.hustle}: ${Math.round((here.capT / CAPTURE_TIME) * 100)}%` : '';
  if (msgT > 0 && (msgT -= dt) <= 0) $('msg').textContent = here ? `${here.hustle} ($${here.rate}/s) owned by ${CREWS[here.owner].name}` : '';
  if ((mmT -= dt) <= 0) { mmT = LOW ? 0.25 : 0.1; drawMinimap(); }
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
window.__game = session; // handy for debugging and headless checks
