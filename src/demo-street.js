// Street Empire visual demo. Loaded only from boot.js when ?demo=street.
// Does not run city, mission or character gameplay code, and does not fetch
// any file under public/demo unless this module is imported.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { makeGradePass } from './grade.js';
import { loadStreetTextures, buildStreet } from './demo/street.js';
import { loadCrew } from './demo/character.js';

const params = new URLSearchParams(location.search);
let isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const POTATO = params.get('q') === 'potato' || (!params.has('q') && localStorage.getItem('se-q') === 'potato');
const LOW = (isTouch || POTATO || params.has('low') || params.get('q') === 'low') && !params.has('high') && params.get('q') !== 'high';
const BASE = import.meta.env.BASE_URL;
const startNight = params.get('t') === 'night' ? 1 : 0;

for (const id of ['hud', 'radar', 'intro', 'pause', 'touch', 'lcol', 'prompt', 'rstack', 'objArrow', 'bPause', 'end', 'dtag']) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

const ui = document.createElement('div');
ui.id = 'demoUI';
ui.innerHTML = `
  <style>
    #demoUI{position:fixed;inset:0;pointer-events:none;font-family:Arial,Helvetica,sans-serif;color:#f0e6d4}
    #demoUI .top{position:absolute;left:16px;top:14px;max-width:min(520px,86vw);text-shadow:0 1px 4px #000}
    #demoUI h1{margin:0 0 4px;font-size:18px;letter-spacing:.08em}
    #demoUI p{margin:0 0 6px;font-size:13px;line-height:1.35;color:#d8d0c4}
    #demoUI .btns{pointer-events:auto;display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
    #demoUI button{background:#1c1814;color:#f0e6d4;border:1px solid #6a5a44;padding:6px 10px;font-size:12px;letter-spacing:.06em;cursor:pointer}
    #demoUI button.on{background:#3a4a30;border-color:#8aaa6a}
    #demoUI .stats{position:absolute;right:14px;bottom:12px;font:12px/1.4 ui-monospace,monospace;text-align:right;text-shadow:0 1px 3px #000}
  </style>
  <div class="top">
    <h1>STREET EMPIRE  STREET DEMO</h1>
    <p>One rebuilt block and one crew member. This is a look test, not the live game. Drag to look, scroll to zoom, F follows. D day, N night.</p>
    <div class="btns">
      <button type="button" id="dDay">DAY</button>
      <button type="button" id="dNight">NIGHT</button>
      <button type="button" id="dFollow" class="on">FOLLOW</button>
    </div>
  </div>
  <div class="stats" id="dStats"></div>
`;
document.body.appendChild(ui);

const renderer = new THREE.WebGLRenderer({ antialias: !LOW, powerPreference: 'high-performance' });
const PR_MAX = Math.min(devicePixelRatio, POTATO ? 0.75 : LOW ? 1.25 : 1.75);
renderer.setPixelRatio(PR_MAX);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = !LOW;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.88;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.2, 280);
const sky = new Sky(); sky.scale.setScalar(1200); scene.add(sky);
const su = sky.material.uniforms;
su.turbidity.value = 6; su.rayleigh.value = 2.2; su.mieCoefficient.value = 0.006; su.mieDirectionalG.value = 0.8;

const sunDir = new THREE.Vector3();
const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene();
const sky2 = new Sky(); sky2.scale.setScalar(1200); envScene.add(sky2);
Object.assign(sky2.material.uniforms, { turbidity: { value: 6 }, rayleigh: { value: 2.2 }, mieCoefficient: { value: 0.007 }, mieDirectionalG: { value: 0.8 } });
let envRT = null;
function rebuildEnv() {
  sky2.material.uniforms.sunPosition.value.copy(sunDir);
  const rt = pmrem.fromScene(envScene, 0.04);
  scene.environment = rt.texture;
  if (envRT) envRT.dispose();
  envRT = rt;
}

scene.fog = new THREE.Fog(0x9a8a78, 28, LOW ? 140 : 190);
const hemi = new THREE.HemisphereLight(0xc8b49a, 0x3a322c, 0.7);
const sun = new THREE.DirectionalLight(0xfff0d8, 2.15);
if (!LOW) {
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 30, bottom: -20, near: 2, far: 120 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
}
scene.add(hemi, sun, sun.target);

const FX = !POTATO;
let composer = null, grade = null, bloom = null;
if (FX) {
  const rt = new THREE.WebGLRenderTarget(innerWidth * PR_MAX, innerHeight * PR_MAX, { type: THREE.HalfFloatType, samples: LOW ? 0 : 4 });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.18, 0.38, 0.86);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  grade = makeGradePass(ShaderPass);
  grade.uniforms.uGrain.value = 0;
  composer.addPass(grade);
}

const spots = [];
const glowSprites = [];
function makeGlow() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grd.addColorStop(0, 'rgba(255,220,150,0.95)');
  grd.addColorStop(0.35, 'rgba(255,170,80,0.35)');
  grd.addColorStop(1, 'rgba(255,140,40,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  return new THREE.SpriteMaterial({ map: tex, color: 0xffd090, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
}

let night = startNight;
let street = null;
let crew = null;
let follow = true;
const orbit = { theta: -Math.PI / 2 + 0.58, phi: 1.28, r: 5.6 };
let dragging = false, lx = 0, ly = 0;

const statsEl = document.getElementById('dStats');
const btnDay = document.getElementById('dDay');
const btnNight = document.getElementById('dNight');
const btnFollow = document.getElementById('dFollow');
function syncBtns() {
  btnDay.classList.toggle('on', night < 0.5);
  btnNight.classList.toggle('on', night >= 0.5);
  btnFollow.classList.toggle('on', follow);
}
btnDay.onclick = () => { night = 0; syncBtns(); applyTime(); };
btnNight.onclick = () => { night = 1; syncBtns(); applyTime(); };
btnFollow.onclick = () => { follow = !follow; syncBtns(); };
syncBtns();

addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'd') { night = 0; syncBtns(); applyTime(); }
  if (k === 'n') { night = 1; syncBtns(); applyTime(); }
  if (k === 'f') { follow = !follow; syncBtns(); }
});

function onPtrDown(e) {
  dragging = true; lx = e.clientX ?? e.touches?.[0]?.clientX ?? 0; ly = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
}
function onPtrMove(e) {
  if (!dragging) return;
  const x = e.clientX ?? e.touches?.[0]?.clientX ?? lx;
  const y = e.clientY ?? e.touches?.[0]?.clientY ?? ly;
  orbit.theta -= (x - lx) * 0.005;
  orbit.phi = THREE.MathUtils.clamp(orbit.phi + (y - ly) * 0.004, 0.55, 1.45);
  lx = x; ly = y;
  if (!e.touches) follow = false;
  syncBtns();
}
function onPtrUp() { dragging = false; }
renderer.domElement.addEventListener('pointerdown', onPtrDown);
addEventListener('pointermove', onPtrMove);
addEventListener('pointerup', onPtrUp);
renderer.domElement.addEventListener('touchstart', (e) => { onPtrDown(e); }, { passive: true });
addEventListener('touchmove', (e) => { onPtrMove(e); }, { passive: true });
addEventListener('touchend', onPtrUp);
renderer.domElement.addEventListener('wheel', (e) => {
  orbit.r = THREE.MathUtils.clamp(orbit.r + e.deltaY * 0.008, 2.4, 16);
}, { passive: true });

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  if (composer) composer.setSize(innerWidth, innerHeight);
});

function applyTime() {
  const day = 1 - night;
  sunDir.set(-0.42 * (day > 0.5 ? 1 : 0.35), 0.12 + 0.58 * day, 0.38).normalize();
  if (night > 0.5) sunDir.set(0.2, -0.06, 0.4).normalize();
  su.sunPosition.value.copy(sunDir);
  su.rayleigh.value = night > 0.5 ? 0.12 : 2.0;
  su.turbidity.value = night > 0.5 ? 1.8 : 4.5;
  su.mieCoefficient.value = night > 0.5 ? 0.004 : 0.006;
  sun.position.copy(sunDir).multiplyScalar(60);
  sun.target.position.set(0, 0, 0);
  sun.color.set(night > 0.5 ? 0x8a96c8 : 0xfff0d8);
  sun.intensity = 1.45 * day + 0.18 * night;
  hemi.intensity = 0.26 + 0.5 * day + (LOW ? 0.85 : 0.62) * night;
  hemi.color.set(night > 0.5 ? 0x6a7390 : 0xc8b49a);
  hemi.groundColor.set(night > 0.5 ? 0x2a241c : 0x4a3a30);
  scene.fog.color.set(night > 0.5 ? 0x16141c : 0x8a8072);
  scene.fog.near = night > 0.5 ? 12 : 22;
  scene.fog.far = night > 0.5 ? (LOW ? 85 : 115) : (LOW ? 140 : 175);
  renderer.toneMappingExposure = 0.72 + 0.08 * day + (LOW ? 0.34 : 0.22) * night;
  scene.environmentIntensity = 0.18 + 0.4 * day + 0.35 * night;
  if (grade) { grade.uniforms.uNight.value = night; grade.uniforms.uDusk.value = 0; }
  if (bloom) {
    bloom.strength = night > 0.5 ? (LOW ? 0.36 : 0.42) : 0.09;
    bloom.threshold = night > 0.5 ? 0.72 : 0.9;
  }
  if (street) {
    street.road.roughness = 0.88 - 0.62 * night;
    street.road.clearcoat = 0.55 * night;
    street.road.envMapIntensity = 0.35 + 1.35 * night;
    street.road.color.set(night > 0.5 ? 0x6a6868 : 0x9a9692);
    street.emit.emissiveIntensity = 0.12 + 2.4 * night;
    street.lampEmit.emissiveIntensity = 0.2 + 3.4 * night;
    street.puddleMat.opacity = 0.58 * night;
    street.glass.opacity = night > 0.5 ? 0.72 : 0.55;
    street.glass.envMapIntensity = 0.7 + 1.1 * night;
  }
  for (const s of spots) {
      if (s.isSpotLight) s.intensity = night > 0.5 && !LOW ? 20 : 0;
      else s.intensity = night > 0.5 ? (LOW ? 3.5 : 6) : 0;
    }
  for (const g of glowSprites) g.visible = night > 0.5;
  rebuildEnv();
}

const walk = { x: -20, z: 5.85, dir: 1, speed: 1.25, turn: 0 };

function updateCrew(dt) {
  if (!crew) return;
  if (walk.turn > 0) {
    walk.turn -= dt;
    crew.play('Idle_Loop', 0.22);
    crew.group.rotation.y += dt * Math.PI;
    if (walk.turn <= 0) {
      walk.dir *= -1;
      crew.group.rotation.y = walk.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
  } else {
    crew.play('Walk_Loop', 0.2);
    walk.x += walk.dir * walk.speed * dt;
    if (walk.x > 48) { walk.x = 48; walk.turn = 1.1; }
    if (walk.x < -48) { walk.x = -48; walk.turn = 1.1; }
    crew.group.rotation.y = walk.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  }
  crew.group.position.x = walk.x;
  crew.group.position.z = walk.z;
  crew.update(dt);
}

function updateCamera() {
  if (window.__demo && window.__demo.camLock) return;
  const target = crew ? crew.group.position : new THREE.Vector3();
  const look = target.clone(); look.y += 1.25;
  if (follow && crew && walk.turn <= 0) {
    const want = walk.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    orbit.theta = THREE.MathUtils.damp(orbit.theta, want, 4, 0.016);
  }
  const ox = Math.sin(orbit.theta) * Math.sin(orbit.phi) * orbit.r;
  const oy = Math.cos(orbit.phi) * orbit.r + 0.35;
  const oz = Math.cos(orbit.theta) * Math.sin(orbit.phi) * orbit.r;
  camera.position.set(look.x + ox, look.y + oy - 0.4, look.z + oz);
  camera.lookAt(look);
}

async function loadCar(x, z, ry) {
  try {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const g = await loader.loadAsync(`${BASE}models/cars/sedan.glb`);
    g.scene.traverse((o) => {
      if (!o.isMesh) return;
      const old = o.material;
      const color = old.color ? old.color.clone() : new THREE.Color(0x3a3a42);
      color.offsetHSL(0, -0.12, -0.06);
      o.material = new THREE.MeshPhysicalMaterial({
        color, map: old.map || null, roughness: 0.38, metalness: 0.25,
        clearcoat: 0.65, clearcoatRoughness: 0.22, envMapIntensity: 0.9,
      });
      o.castShadow = !LOW; o.receiveShadow = !LOW;
    });
    g.scene.position.set(x, 0, z);
    g.scene.rotation.y = ry;
    g.scene.scale.setScalar(1.05);
    scene.add(g.scene);
  } catch (err) {
    console.warn('parked car skipped', err);
  }
}

const info = { draws: 0, tris: 0, fps: 0 };
let frames = 0, fpsT = 0, fps = 0;
const clock = new THREE.Clock();

function measure() {
  let draws = 0, tris = 0;
  scene.traverseVisible((o) => {
    if (!o.isMesh && !o.isSkinnedMesh && !o.isSprite) return;
    const geos = o.geometry ? [o.geometry] : [];
    for (const geo of geos) {
      const idx = geo.index;
      const prims = idx ? idx.count / 3 : (geo.attributes.position ? geo.attributes.position.count / 3 : 0);
      const n = o.count || 1;
      tris += prims * n;
      draws += 1;
    }
  });
  info.draws = draws; info.tris = Math.round(tris);
}

function loop() {
  const dt = Math.min(0.05, clock.getDelta());
  updateCrew(dt);
  updateCamera();
  if (grade) grade.uniforms.uTime.value += dt;
  if (composer) composer.render();
  else renderer.render(scene, camera);
  frames++; fpsT += dt;
  if (fpsT >= 0.5) { fps = frames / fpsT; frames = 0; fpsT = 0; }
  if (statsEl) {
    statsEl.textContent = `${LOW ? (POTATO ? 'POTATO' : 'LOW') : 'HIGH'}  ${night > 0.5 ? 'NIGHT' : 'DAY'}\n${fps.toFixed(0)} fps  ${info.draws} draws  ${(info.tris / 1000).toFixed(1)}k tris`;
  }
  requestAnimationFrame(loop);
}

window.__demo = {
  scene, camera, renderer, get night() { return night; }, setNight(v) { night = v ? 1 : 0; syncBtns(); applyTime(); },
  get fps() { return fps; }, get info() { return info; }, get crew() { return crew; }, get walk() { return walk; }, camLock: false,
};

(async function start() {
  try {
    const maps = await loadStreetTextures(BASE, POTATO);
    street = buildStreet(scene, maps, LOW);
    const glowMat = makeGlow();
    for (const p of street.lampPositions) {
      if (!LOW) {
        const spot = new THREE.SpotLight(0xffc078, 0, 20, 0.95, 0.7, 1.05);
        spot.position.copy(p);
        spot.target.position.set(p.x, 0, p.z);
        scene.add(spot, spot.target);
        spots.push(spot);
        const fill = new THREE.PointLight(0xffb060, 0, 12, 1.4);
        fill.position.copy(p);
        scene.add(fill);
        spots.push(fill);
      }
      const spr = new THREE.Sprite(glowMat);
      spr.position.copy(p); spr.scale.set(2.4, 2.4, 1); spr.visible = false;
      scene.add(spr); glowSprites.push(spr);
    }
    await loadCar(14.5, -2.35, Math.PI * 0.08);
    try {
      crew = await loadCrew(BASE);
      crew.group.position.set(walk.x, 0, walk.z);
      crew.group.rotation.y = Math.PI / 2;
      scene.add(crew.group);
    } catch (err) {
      console.error('character failed', err);
      statsEl.textContent = 'Character failed: ' + err.message;
    }
    applyTime();
    measure();
    loop();
  } catch (err) {
    console.error(err);
    statsEl.textContent = 'Demo failed: ' + err.message;
  }
})();
