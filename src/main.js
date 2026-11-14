import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { makeGradePass } from './grade.js';
import { LocalSession } from './net.js';
import { CREWS, GRID, PITCH, BLOCK, CAPTURE_TIME, UPGRADE_COST, BUILD_COST, BUILD_BOOST, blockCenter, player, blockAt, insideBuilding, stars, clock, signal, nearestCar, districtOf, DISTRICTS, guardsOf } from './state.js';
import { buildCity } from './city.js';
import { loadKit } from './kit.js';
import { loadCars, makeCar, updateCar, Smoke, setCarQuality, carNight } from './vehicles.js';
import { loadPeople, makeCharacter, animate, lookFor, ready as modelReady, charNight } from './chars.js';
import * as sfx from './audio.js';
import { createCine } from './cine.js';
import { CLEAR_TIME, DOWN_TIME, MISSIONS, debugDown, openingScuffle, contactFor, missionText } from './state.js';
import { canonical } from './retarget.js';
import { createRadio } from './radio.js';
import { routeTo, RAMPS, RACES, GARAGES, STASHES, sideText, progress } from './state.js';
import { SHOPS, HOUSES, SHOP_ITEMS, shopSpot, houseSpot, shopAt, houseAt, ownsHouse } from './state.js';
import { DICE, diceAt, potCap, sceneSpot } from './state.js';
import { createHustle } from './hustle.js';
import { Particles, Flashes, Skids } from './fx.js';
import { createStream, streamWanted } from './stream.js';
import { createWeather } from './weather.js';
import { createMoments } from './moments.js';
import { createClips } from './clips.js';
import { createVideo, BRIEF_CLIPS, BUST_CLIPS } from './video.js';
import '@fontsource/anton/400.css';
import '@fontsource/oswald/500.css';
import '@fontsource/oswald/600.css';

let isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const VERSION = 'v0.19';
// ?q=potato: very low quality for slow devices (also chosen automatically on sustained low FPS)
const params = new URLSearchParams(location.search);
const POTATO = params.get('q') === 'potato' || (!params.has('q') && localStorage.getItem('se-q') === 'potato');
const LOW = (isTouch || POTATO || params.has('low') || params.get('q') === 'low') && !params.has('high') && params.get('q') !== 'high';
// Phones run the low tier's lighter city and crowds. "Full" adds sun shadows, glow on lights and a longer view on top;
// "lite" is the plain low look. A phone that cannot hold its frame rate on full steps down by itself and remembers.
// ?gfx=full or ?gfx=lite picks one, ?pin stops every automatic quality change (review shots).
const PIN = params.has('pin');
const gfxAsk = params.get('gfx') || localStorage.getItem('se-gfx');
let FULL = LOW && !POTATO && (gfxAsk ? gfxAsk === 'full' : !(navigator.deviceMemory && navigator.deviceMemory < 4));
const SHADOWS = !LOW || FULL;
document.getElementById('ver').textContent = VERSION + (POTATO ? ' potato' : FULL ? ' low+' : LOW ? ' low' : ' high');
if (isTouch) document.body.classList.add('touch');
// a touchscreen can appear after load (device emulation, convertibles): switch the touch layout on at the first touch
addEventListener('touchstart', () => { if (!isTouch) { isTouch = true; document.body.classList.add('touch'); } }, { capture: true, passive: true });
// no long press menus, callouts or text selection over the game
addEventListener('contextmenu', (e) => { if (!e.target.closest || !e.target.closest('input,textarea')) e.preventDefault(); });
let LOD_DIST = !LOW ? 60 : FULL ? 46 : 34, CAR_DIST = !LOW ? 170 : FULL ? 105 : 90; const DRIVER_DIST = LOW ? 30 : 50;
const BASE = import.meta.env.BASE_URL;

// ---------- save game ----------
// The whole sim state is plain JSON, so a save is the state itself in localStorage.
// It is written every few seconds, on pause and when the tab is hidden or closed.
// A save from a different map size, or of a finished game, is ignored.
const SAVE_KEY = 'se-save-v1';
function readSave() {
  try {
    const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'), s = d && d.v === 1 && d.state;
    if (!s || s.over || !Array.isArray(s.blocks) || s.blocks.length !== GRID * GRID || !Array.isArray(s.ents) || !s.ents.some((e) => e.kind === 'player')) return null;
    return s;
  } catch (e) { return null; }
}
function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* storage off: nothing to clear */ } }
const savedState = params.has('new') ? null : readSave();
const session = new LocalSession({ traffic: POTATO ? 5 : LOW ? 10 : 16, peds: POTATO ? 6 : LOW ? 13 : 26 }, savedState); // v0.15: far traffic and people run an ambient step, so there is room for more of them
const S = () => session.state;
let saveT = 0;
function writeSave() {
  const s = session.state;
  if (!started || s.over) return;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, at: Date.now(), state: { ...s, events: [], fx: [] } })); } catch (e) { /* storage full or off: play on without saving */ }
}
addEventListener('pagehide', writeSave);

// ---------- renderer, sky and light ----------
const renderer = new THREE.WebGLRenderer({ antialias: !LOW, powerPreference: 'high-performance' });
// Low (phones): up to 2x, starting at 1.5. The scaler below steps it down if the frame rate drops and back up when it holds.
const PR_MAX = () => Math.min(devicePixelRatio, POTATO ? 0.75 : LOW ? 2 : 2);
let pixelRatio = Math.min(PR_MAX(), LOW && !POTATO ? 1.5 : 9);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = SHADOWS;
renderer.shadowMap.type = FULL ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 450);
const sky = new Sky(); sky.scale.setScalar(1000);
const su = sky.material.uniforms;
// v0.13: a tighter sun (less mie, more forward scatter), so the frame near the sun no longer washes out to cream and the flare carries the glow
su.turbidity.value = 9; su.rayleigh.value = 2.6; su.mieCoefficient.value = 0.004; su.mieDirectionalG.value = 0.95;
// daytime sky gain: the Sky shader's midday output is far past white even after tone mapping, which washed the
// whole frame out to cream. The gain pulls the day sky back to a hazy blue; dusk and night are left as they were.
su.uGain = { value: 1 };
sky.material.fragmentShader = sky.material.fragmentShader.replace('void main() {', 'uniform float uGain;\nvoid main() {').replace('gl_FragColor = vec4( texColor, 1.0 );', 'gl_FragColor = vec4( texColor * uGain, 1.0 ); { float halo = smoothstep( 0.9, 0.996, cosTheta ) * ( 1.0 - smoothstep( 0.9992, 0.99995, cosTheta ) ); gl_FragColor.rgb = mix( gl_FragColor.rgb, min( gl_FragColor.rgb, vec3( 1.25 ) ), halo ); }');
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
scene.fog = new THREE.Fog(0xb87a52, 45, !LOW ? 270 : FULL ? 245 : 215);
let fogFar = scene.fog.far; // the dry view distance; rain pulls it in (weather.js)
const hemi = new THREE.HemisphereLight(0xc8a080, 0x4a3226, 0.9);
const sun = new THREE.DirectionalLight(0xffa060, 2.2);
const SH_R = FULL ? 36 : 45, SH_MAP = FULL ? 1536 : 2048; // half width of the shadowed square around the view, and its map size
if (SHADOWS) { sun.castShadow = true; sun.shadow.mapSize.set(SH_MAP, SH_MAP); Object.assign(sun.shadow.camera, { left: -SH_R, right: SH_R, top: SH_R, bottom: -SH_R, near: 1, far: 260 }); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03; }
scene.add(hemi, sun, sun.target);

// post: tone map, then a warm LUT grade, optional soft film grain and vignette
const FX = !params.has('nofx') && !POTATO;
let composer = null, grade = null, bloom = null;
if (FX) {
  const rt = new THREE.WebGLRenderTarget(innerWidth * pixelRatio, innerHeight * pixelRatio, { type: THREE.HalfFloatType, samples: LOW && !FULL ? 2 : 4 }); // 2x multisampling on Low smooths the stair-step edges
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  // glow: only light sources and hot highlights pass the threshold, so signs, lamps, headlights and the low sun bleed a little
  if (SHADOWS) {
    bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.4, 0.5, 0.9);
    // One pixel that is infinite or not a number (the sun disc and hot glints overflow the half float buffer on phone GPUs)
    // gets blurred across the whole frame and the screen goes black. Such pixels are dropped and the rest capped before the blur.
    const hp = bloom.materialHighPassFilter, read = 'vec4 texel = texture2D( tDiffuse, vUv );';
    if (hp.fragmentShader.includes(read)) { hp.fragmentShader = hp.fragmentShader.replace(read, read + ' if ( any( isnan( texel ) ) || any( isinf( texel ) ) ) texel = vec4( 0.0 ); texel = clamp( texel, vec4( 0.0 ), vec4( 8.0 ) );'); hp.needsUpdate = true; composer.addPass(bloom); }
    else bloom = null; // the pass changed shape: run without glow rather than risk the black screen
  }
  composer.addPass(new OutputPass());
  grade = makeGradePass(ShaderPass); composer.addPass(grade);
  // Low and potato: grain off. Med and High: off by default, opt in with se-grain=1
  grade.uniforms.uGrain.value = (LOW || POTATO) ? 0 : (localStorage.getItem('se-grain') === '1' ? 1 : 0);
  // the lens (v0.13): phones render under native size, so they get more sharpening; the color split stays faint everywhere
  grade.uniforms.uSharp.value = params.has('nosharp') ? 0 : LOW ? 0.42 : 0.26; grade.uniforms.uSplit.value = LOW ? 0.22 : 0.32;
}
// the sharpen and the speed blur step in texels, so the pass has to know the frame size whenever it changes
function setGradeRes() { if (grade) grade.uniforms.uRes.value.set(1 / Math.max(1, innerWidth * pixelRatio), 1 / Math.max(1, innerHeight * pixelRatio)); }
setGradeRes();
export function setGrain(on) {
  if (LOW || POTATO) on = false;
  localStorage.setItem('se-grain', on ? '1' : '0');
  if (grade) grade.uniforms.uGrain.value = on ? 1 : 0;
}
const city = buildCity(scene, LOW, S().blocks, BASE, SHADOWS);
setCarQuality(LOW, POTATO);
{ const p = player(S()); city.buildAllNear(p.x, p.z); }

// day and night
// warm smoggy haze: peach by day, burnt orange at sunset, plum blue at night
const fogDay = new THREE.Color(0xb48a66), fogDusk = new THREE.Color(0x8a7088), fogNight = new THREE.Color(0x2e2c40);
const sunDay = new THREE.Color(0xfff0dd), sunDusk = new THREE.Color(0xffb27a);
let night = 0, lastNightSet = -1;
// Day light balance [sun, sky fill, sky reflection]. With sun shadows on, the sun carries the day and the fill drops,
// so a shadow is a real step darker than the lit street; without shadows the softer, flatter balance stays.
const LT = SHADOWS ? [1.15, 0.68, 0.6] : [1, 1, 1];
function flatLight() { LT[0] = LT[1] = LT[2] = 1; }
function updateDay() {
  const h = clock(S());
  const ang = ((h - 6) / 24) * Math.PI * 2; // 6:00 sunrise, 18:00 sunset
  const elev = Math.sin(ang);
  sunDir.set(Math.cos(ang) * 0.8, elev, 0.45).normalize();
  su.sunPosition.value.copy(sunDir);
  su.uGain.value = 1 - 0.7 * THREE.MathUtils.smoothstep(elev, 0.1, 0.5);
  const day = THREE.MathUtils.smoothstep(elev, -0.08, 0.25);
  const dusk = 1 - Math.abs(THREE.MathUtils.clamp(elev / 0.25, -1, 1));
  night = 1 - THREE.MathUtils.smoothstep(elev, -0.12, 0.05);
  const dark = Math.max(night, Math.min(1, (1 - day) * 1.15)); // bridges dusk so twilight is never darker than night
  // night (v0.8): blue purple moonlight plus a strong sky fill so nothing goes black
  sun.intensity = 2.0 * LT[0] * day + 0.75 * night; sun.color.copy(sunDay).lerp(sunDusk, dusk * 0.9);
  if (elev < 0) { sun.color.setHex(0x8c96e0); }
  hemi.intensity = 0.3 * (1 - day * (1 - LT[1])) + 0.85 * LT[1] * day + (LOW ? 1.5 : 1.35) * dark; hemi.color.setHex(night > 0.5 ? 0x9094c8 : dusk > 0.5 ? 0x9a94b4 : 0xc8a888);
  hemi.groundColor.setHex(night > 0.5 ? 0x9a6c44 : dusk > 0.4 ? 0x6a5a58 : 0x6e5c4c); // warm bounce off lit streets at night, so brick and dark walls do not drop to black // cool bounce in shadows at dusk
  // sky reflection is kept very low by day: the midday sky is so bright that a fuller reflection turned the road,
  // sidewalks and walls pale and flat; the hemisphere fill above stands in for it
  scene.environmentIntensity = (0.1 + 0.02 * day) * (1 - day * (1 - LT[2])) + 0.2 * night;
  scene.fog.color.copy(fogDay).lerp(fogDusk, dusk * 0.8).lerp(fogNight, night);
  scene.fog.near = 62 - 32 * night; // the haze starts farther out by day, so the near street reads clean
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
  // Glow is for lamps, signs and headlights after the sun is down. With the sun on the horizon the sky around it is far past
  // the threshold over half the screen, and the glow from that buried the whole street in white at sunrise and sunset.
  if (bloom && (FULL || !LOW)) { const g = night * (1 - THREE.MathUtils.smoothstep(elev, -0.09, -0.02)); bloom.strength = 0.7 * g; bloom.enabled = g > 0.04; }
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
// weather (v0.13): rain now and then, on the sim's clock, so a continued save gets the weather it left
const weather = createWeather({ scene, camera, LOW, POTATO, mats: city.wetMats, parts, sfx, force: params.has('rain'), off: PIN || params.has('noweather') });
const fogRain = new THREE.Color(0x7c7e86);
// ---------- sun flare (v0.13) ----------
// Sprites on the line from the sun to the middle of the frame: a warm glow and a thin horizontal streak at the sun,
// a few faint ghosts toward the center. Fades at the frame edge, with the sun under the horizon, in rain, and when
// a building stands between the camera and the sun (sampled along that line with the sim's own building test).
const flare = (() => {
  const tex = (draw) => { const cv = document.createElement('canvas'); cv.width = cv.height = 128; draw(cv.getContext('2d')); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; };
  const disc = tex((g) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,250,235,1)'); gr.addColorStop(0.22, 'rgba(255,225,180,.5)'); gr.addColorStop(1, 'rgba(255,190,120,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
  const soft = tex((g) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(0.6, 'rgba(255,255,255,.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
  const ring = tex((g) => { g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 7; g.beginPath(); g.arc(64, 64, 50, 0, 7); g.stroke(); const gr = g.createRadialGradient(64, 64, 36, 64, 64, 64); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.75, 'rgba(0,0,0,.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.globalCompositeOperation = 'destination-in'; g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
  const streak = tex((g) => { const gx = g.createLinearGradient(0, 0, 128, 0); gx.addColorStop(0, 'rgba(255,240,220,0)'); gx.addColorStop(0.5, 'rgba(255,248,235,1)'); gx.addColorStop(1, 'rgba(255,240,220,0)'); g.fillStyle = gx; g.fillRect(0, 0, 128, 128); const gy = g.createLinearGradient(0, 0, 0, 128); gy.addColorStop(0, 'rgba(0,0,0,0)'); gy.addColorStop(0.5, 'rgba(0,0,0,1)'); gy.addColorStop(1, 'rgba(0,0,0,0)'); g.globalCompositeOperation = 'destination-in'; g.fillStyle = gy; g.fillRect(0, 0, 128, 128); });
  const EL = [
    { t: disc, px: 560, f: 0, a: 0.5, col: 0xffe6c0 }, { t: streak, px: 1500, h: 0.045, f: 0, a: 0.32, col: 0xfff0dc },
    { t: soft, px: 110, f: 0.3, a: 0.16, col: 0xffb888 }, { t: ring, px: 170, f: 0.55, a: 0.1, col: 0x9ec8ff },
    { t: soft, px: 56, f: 0.82, a: 0.14, col: 0xff9cb8 }, { t: soft, px: 260, f: 1.3, a: 0.07, col: 0x90b4ff },
  ];
  const sprites = EL.map((e) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: e.t, color: e.col, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true, opacity: 0, toneMapped: false, fog: false })); sp.renderOrder = 999; sp.frustumCulled = false; sp.visible = false; scene.add(sp); return sp; });
  const v = new THREE.Vector3(), w = new THREE.Vector3(); let k = 0;
  const ss = (x, a, b) => THREE.MathUtils.smoothstep(x, a, b);
  return (elev, rain, rdt) => {
    v.copy(camera.position).addScaledVector(sunDir, 300).project(camera);
    const on = v.z < 1 && Math.abs(v.x) < 1.3 && Math.abs(v.y) < 1.3 && elev > -0.02;
    let want = 0;
    if (on) {
      const edge = 1 - ss(Math.max(Math.abs(v.x), Math.abs(v.y)), 0.8, 1.25), up = ss(elev, -0.02, 0.06), low = 1 - ss(elev, 0.08, 0.6);
      let occ = 0;
      for (const d of [1.2, 2.5, 5, 9, 15, 24, 38]) if (insideBuilding(camera.position.x + sunDir.x * d, camera.position.z + sunDir.z * d, 0.15, camera.position.y + sunDir.y * d)) { occ = 1; break; }
      want = edge * up * (0.35 + 0.65 * low) * (1 - occ) * (1 - 0.85 * rain);
    }
    k += (want - k) * Math.min(1, rdt * 7);
    const unit = 2 * 10 * Math.tan(camera.fov * Math.PI / 360) / innerHeight; // world size of one pixel, ten units out
    for (let i = 0; i < EL.length; i++) {
      const e = EL[i], sp = sprites[i]; sp.visible = k > 0.01; if (!sp.visible) continue;
      w.set(v.x * (1 - e.f), v.y * (1 - e.f), 0.5).unproject(camera).sub(camera.position).normalize();
      sp.position.copy(camera.position).addScaledVector(w, 10);
      sp.scale.set(e.px * unit, e.px * unit * (e.h || 1), 1); sp.material.opacity = e.a * k;
    }
  };
})();
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
const tellRings = [];
for (let i = 0; i < 8; i++) {
  const geo = new THREE.RingGeometry(0.62, 0.84, 20); geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff5530, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }));
  mesh.visible = false; mesh.frustumCulled = false; scene.add(mesh); tellRings.push(mesh);
}
// Low has no real shadows, so people and cars get a soft dark patch on the ground under them. Without it they float.
const blobs = LOW ? (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const cx = cv.getContext('2d'), gr = cx.createRadialGradient(32, 32, 4, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,.62)'); gr.addColorStop(0.55, 'rgba(0,0,0,.34)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); cx.fillStyle = gr; cx.fillRect(0, 0, 64, 64);
  const N = 72, geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const im = new THREE.InstancedMesh(geo, mat, N); im.frustumCulled = false; im.count = 0; im.renderOrder = 1; scene.add(im);
  const m = new THREE.Matrix4(), pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  return (px, pz, night) => {
    let n = 0; mat.opacity = 1 - 0.45 * night;
    for (const g of charViz.values()) { if (n >= N || !g.visible || (g.position.x - px) ** 2 + (g.position.z - pz) ** 2 > 60 * 60) continue; m.compose(pos.set(g.position.x, g.position.y + 0.03, g.position.z), q.identity(), sc.set(1.25, 1, 1.25)); im.setMatrixAt(n++, m); }
    for (const g of carViz.values()) { if (n >= N || (g.position.x - px) ** 2 + (g.position.z - pz) ** 2 > 90 * 90) continue; const k = 1 / (1 + g.position.y * 0.25), b = g.userData.bike; m.compose(pos.set(g.position.x, 0.05, g.position.z), q.setFromAxisAngle(up, g.rotation.y), sc.set((b ? 1.1 : 3) * k, 1, (b ? 2.6 : 5.6) * k)); im.setMatrixAt(n++, m); }
    im.count = n; im.instanceMatrix.needsUpdate = true;
  };
})() : null;
// Stunt ramps: an orange wedge in the middle of the street, low end facing the run-up.
{
  const sh = new THREE.Shape(); sh.moveTo(-3, 0); sh.lineTo(2.2, 0); sh.lineTo(2.2, 1.35); sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 3, bevelEnabled: false }); geo.translate(0, 0, -1.5); geo.rotateY(-Math.PI / 2); // length along +z, low end at -z
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const cx = cv.getContext('2d'); cx.fillStyle = '#e8891c'; cx.fillRect(0, 0, 64, 64); cx.fillStyle = '#1a1a1a'; for (let i = -64; i < 64; i += 32) { cx.beginPath(); cx.moveTo(i, 64); cx.lineTo(i + 16, 64); cx.lineTo(i + 80, 0); cx.lineTo(i + 64, 0); cx.fill(); }
  const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(0.6, 0.6); tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, metalness: 0.1 });
  for (const r of RAMPS) { const m = new THREE.Mesh(geo, mat); m.position.set(r.x, 0, r.z); m.rotation.y = r.ry; m.castShadow = true; m.receiveShadow = true; scene.add(m); }
}
const hitNums = [];
const hitProj = new THREE.Vector3();
function floatHit(x, z, text, color) {
  const el = document.createElement('div'); el.className = 'hitn'; el.textContent = text; el.style.color = color;
  document.body.appendChild(el); hitNums.push({ el, x, y: 1.55, z, t: 0.75 });
  while (hitNums.length > 8) { const old = hitNums.shift(); old.el.remove(); }
}
// What someone on the street says: a line over their head that follows them for a couple of seconds.
function floatSay(id, x, z, text, cls = '') {
  for (let i = hitNums.length - 1; i >= 0; i--) if (hitNums[i].id === id) { hitNums[i].el.remove(); hitNums.splice(i, 1); }
  const el = document.createElement('div'); el.className = 'hitn say ' + cls; el.textContent = text;
  document.body.appendChild(el); hitNums.push({ el, x, y: 2.05, z, t: 2.2, id, slow: true });
  while (hitNums.length > 8) { const old = hitNums.shift(); old.el.remove(); }
}
const tracers = [];
const tracerMat = new THREE.LineBasicMaterial({ color: 0xfff0a0, transparent: true, toneMapped: false });
for (let i = 0; i < 10; i++) { const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]); const l = new THREE.Line(g, tracerMat.clone()); l.visible = false; l.frustumCulled = false; scene.add(l); tracers.push({ l, t: 0 }); }
let tracerI = 0;
function tracer(x, z, tx, tz) { const t = tracers[tracerI = (tracerI + 1) % tracers.length]; const p = t.l.geometry.attributes.position; p.setXYZ(0, x, 1.4, z); p.setXYZ(1, tx, 1.2, tz); p.needsUpdate = true; t.l.visible = true; t.t = 0.08; }

// ---------- input ----------
const keys = {};
let yaw = Math.PI, pitch = 0.3, lookIdle = 0;
let attackBuf = 0, attackQueued = false, sprintTouch = false, started = false, streetReadySent = false;
function queueAttack() { attackQueued = true; attackBuf = 0.5; }
const drive = { left: false, right: false, gas: false, brake: false, drift: false };
function context() {
  const s = S(), p = player(s);
  if (p.car) return 'EXIT';
  if (!s.mission) for (const g of s.ents) if (g.kind === 'giver' && (g.x - p.x) ** 2 + (g.z - p.z) ** 2 < 16) return 'TALK';
  if (shopAt(p) >= 0) return 'SHOP';
  if (diceAt(s, p)) return 'DICE';
  { const h = houseAt(p); if (h >= 0 && !ownsHouse(s, h)) return 'BUY'; }
  if (nearestCar(s, p, 5)) return 'CAR';
  const b = blockAt(s, p.x, p.z);
  if (b && b.owner === p.crew && !b.upgraded && guardsOf(s, b).length) return 'UPGRADE';
  if (b && b.owner === p.crew && !b.built) return 'BUILD'; // after the guards are armed (or when there are none to arm)
  return null;
}
function doContext() {
  const c = context(); if (c === 'SHOP') { openShop(); return; } if (c === 'DICE') { openDice(); return; } if (c === 'BUY') { session.send({ type: 'house' }); return; }
  if (c === 'TALK') { session.send({ type: 'talk' }); sfx.chime(true); return; } if (c === 'UPGRADE') { session.send({ type: 'upgrade' }); return; } if (c === 'BUILD') { session.send({ type: 'build' }); return; } if (c) { session.send({ type: 'car' }); return; }
  // nothing in reach: say why and where to go instead of silently ignoring the key
  const s = S(), p = player(s), g = contactFor(s);
  if (g && s.mission) { const d = Math.hypot(g.x - p.x, g.z - p.z); showMsg(d < 4 ? `Finish ${s.mission.title} first.` : 'Nothing here. Follow the marker.'); }
  else if (g) { const d = Math.round(Math.hypot(g.x - p.x, g.z - p.z)); showMsg(`${g.name} is ${d} m away. Follow the ${g.name.toUpperCase()} arrow.`); }
}
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (!started) return;
  if (e.code === 'KeyF') queueAttack();
  if (e.code === 'KeyY') session.send({ type: 'street', choice: 'in' });
  if (e.code === 'KeyN') session.send({ type: 'street', choice: 'off' });
  if (e.code === 'KeyE' || e.code === 'Enter') doContext();
  if (e.code === 'KeyR') session.send({ type: 'recruit' });
  if (e.code === 'KeyT') session.send({ type: 'squad' });
  if (e.code === 'KeyU') session.send({ type: 'upgrade' });
  if (e.code === 'KeyB') session.send({ type: 'build' });
  if (e.code === 'KeyQ') session.send({ type: 'weapon' });
  if (e.code === 'KeyM' && player(S()).car) radio.next();
  if (e.code === 'Space') { e.preventDefault(); session.send({ type: 'jump' }); }
  if (e.code === 'KeyH') sfx.honk();
  if (e.code === 'KeyC') doDodge();
  if (e.code === 'KeyV' && !e.repeat) session.send({ type: 'block', on: true });
  if (e.code === 'KeyK') clips.cut('Clip');
  if (e.code === 'KeyG') { if (LOW || POTATO) { showMsg('Film grain off on Low'); return; } const on = !(grade && grade.uniforms.uGrain.value); setGrain(on); showMsg('Film grain ' + (on ? 'on' : 'off')); }
});
addEventListener('keyup', (e) => { keys[e.code] = false; if (e.code === 'KeyV') session.send({ type: 'block', on: false }); });
renderer.domElement.addEventListener('mousedown', () => {
  if (!started || isTouch) return;
  if (document.pointerLockElement !== renderer.domElement) renderer.domElement.requestPointerLock();
  else queueAttack();
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
    if (t.target.closest('button') || t.target.closest('.panel') || t.target.closest('#intro')) continue;
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
btn('bAttack', () => queueAttack()); btn('bFire', () => queueAttack());
btn('streetIn', () => session.send({ type: 'street', choice: 'in' }));
btn('streetOff', () => session.send({ type: 'street', choice: 'off' }));
btn('bJump', () => session.send({ type: 'jump' }));
btn('bSprint', () => { sprintTouch = !sprintTouch; document.getElementById('bSprint').classList.toggle('on', sprintTouch); });
btn('bCtx', doContext);
btn('bWeapon', () => session.send({ type: 'weapon' }));
btn('bRecruit', () => session.send({ type: 'recruit' }));
btn('bSquad', () => session.send({ type: 'squad' }));
btn('bRadio', () => { sfx.initAudio(); radio.next(); });
btn('bClip', () => clips.cut('Clip'));
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
// ---------- car radio ----------
const radio = createRadio({ audio: sfx.audio, base: BASE, onTune: (name) => pop('\u266B ' + name), onAir: (st, text) => { if (!cine.active) showMsg(`\u266B ${st}: ${text}`); } });
const hood = () => { const s = S(), p = player(s), b = blockAt(s, p.x, p.z); return b ? DISTRICTS[districtOf(b)] : 'the city'; };

// ---------- shops and safehouses ----------
// The shop is a small panel over the game: the street keeps running behind it, and it closes if you step away.
let shopOpen = -1;
function renderShop() {
  const s = S(), p = player(s), cash = Math.floor(s.crews.player.cash);
  $('shopName').textContent = SHOPS[shopOpen].name.toUpperCase(); $('shopCash').textContent = `Cash $${cash.toLocaleString('en-US')}`;
  const box = $('shopItems'); box.textContent = '';
  for (const [key, it] of Object.entries(SHOP_ITEMS)) {
    const have = (key === 'bat' && p.hasBat) || (key === 'knuckles' && p.hasKnux), full = (key === 'patch' && p.hp >= p.max) || (key === 'armor' && p.armor >= 60);
    const b = document.createElement('button'); b.type = 'button';
    const name = document.createElement('span'); name.textContent = it.name + (key === 'pistol' && p.ammo > 0 ? ` (have ${p.ammo})` : key === 'shotgun' && p.shells > 0 ? ` (have ${p.shells})` : '');
    const cost = document.createElement('b'); cost.textContent = have ? 'OWNED' : full ? (key === 'armor' ? 'FULL' : 'NOT HURT') : '$' + it.cost;
    b.append(name, cost); b.classList.toggle('no', have || full || cash < it.cost);
    b.onclick = () => { session.send({ type: 'buy', item: key }); handleFx(session.drainFx()); renderShop(); };
    box.appendChild(b);
  }
}
function openShop() { const i = shopAt(player(S())); if (i < 0) return; shopOpen = i; renderShop(); $('shop').classList.remove('hidden'); if (document.pointerLockElement) document.exitPointerLock(); }
function closeShop() { shopOpen = -1; $('shop').classList.add('hidden'); }
$('shopClose').onclick = closeShop;

// ---------- street dice ----------
// The panel sits low on the screen over the running game, like the shop, and closes when you step away.
// The rules and the money live in state.js (diceAction); this only shows them.
let diceOpen = -1, diceNote = '', diceCls = '';
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
function setDie(el, n, shake) {
  el.textContent = ''; for (let i = 0; i < 9; i++) { const b = document.createElement('b'); if ((PIPS[n] || []).includes(i)) b.className = 'on'; el.appendChild(b); }
  if (shake) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
}
function renderDice() {
  if (diceOpen < 0) return;
  const s = S(), p = player(s), b = s.blocks[diceOpen], cash = Math.floor(s.crews.player.cash), pot = Math.floor(b.pot ?? potCap(b)), live = p.dice && p.dice.block === b.id ? p.dice : null;
  $('diceName').textContent = b.hustle.toUpperCase() + ': DICE';
  $('diceInfo').textContent = `Pot $${pot}  ·  Cash $${cash.toLocaleString('en-US')}`;
  $('dicePoint').textContent = live && live.point ? `POINT ${live.point}  ·  $${live.bet} down` : '';
  const msg = $('diceMsg'); msg.textContent = diceNote || '7 or 11 wins. 2, 3 or 12 loses. Anything else is your point.'; msg.className = diceCls;
  const bets = $('diceBets'); bets.textContent = ''; bets.style.display = live ? 'none' : '';
  if (!live) for (const bet of DICE.bets) {
    const el = document.createElement('button'); el.type = 'button'; el.textContent = '$' + bet; el.classList.toggle('no', cash < bet || pot < bet);
    el.onclick = () => { session.send({ type: 'dice', bet }); handleFx(session.drainFx()); renderDice(); };
    bets.appendChild(el);
  }
  $('diceRoll').style.display = live ? '' : 'none';
}
function openDice() {
  const b = diceAt(S(), player(S())); if (!b) return;
  diceOpen = b.id; diceNote = ''; diceCls = ''; setDie($('dieA'), 0); setDie($('dieB'), 0); renderDice();
  // turn the camera so the game is in front of you: behind your shoulder on the street side, looking at the dice
  { const p = player(S()), q = sceneSpot(b); yaw = Math.atan2(p.x - q.x, p.z - q.z) + 0.5; pitch = 0.42; lookIdle = 0; }
  $('dice').classList.remove('hidden'); if (document.pointerLockElement) document.exitPointerLock();
}
function closeDice() { diceOpen = -1; $('dice').classList.add('hidden'); }
$('diceClose').onclick = closeDice;
$('diceRoll').onclick = () => { session.send({ type: 'dice' }); handleFx(session.drainFx()); renderDice(); };
// one roll of yours, from the simulation: faces, the line under them, the sound and the dice on the sidewalk
function diceFx(f) {
  hustle.roll(f.block);
  if (f.result === 'forfeit') { pop(`Walked off a live bet: -$${f.bet}`, 'bad'); closeDice(); return; }
  setDie($('dieA'), f.a, true); setDie($('dieB'), f.b, true); sfx.block(0.5);
  if (f.result === 'win') { diceNote = `${f.sum}. You win $${f.bet}.`; diceCls = 'win'; pop(`+$${f.bet} dice`); sfx.chime(true); }
  else if (f.result === 'lose') { diceNote = f.point ? `Seven out. You lose $${f.bet}.` : `${f.sum}. Craps. You lose $${f.bet}.`; diceCls = 'lose'; pop(`-$${f.bet} dice`, 'bad'); sfx.chime(false); }
  else if (f.result === 'point') { diceNote = `${f.sum}. That is your point. Roll it again before a 7.`; diceCls = ''; }
  else { diceNote = `${f.sum}. Still shooting for ${f.point}.`; diceCls = ''; }
}
const hustle = createHustle(scene, LOW, SHADOWS);
// markers: a ring on the pavement and a slow turning block over it. Green is a shop, blue a safehouse for sale, orange one you own.
const spotMarks = [];
{ const ringG = new THREE.RingGeometry(1.5, 1.9, 28), boxG = new THREE.BoxGeometry(0.55, 0.55, 0.55);
  const add = (kind, i, q) => {
    const mat = new THREE.MeshBasicMaterial({ color: kind === 'shop' ? 0x39d98a : kind === 'race' ? 0xffcc33 : kind === 'garage' ? 0xff5fa2 : 0x4aa3ff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, fog: false });
    const ring = new THREE.Mesh(ringG, mat); ring.rotation.x = -Math.PI / 2; ring.position.set(q.x, 0.27, q.z);
    const box = new THREE.Mesh(boxG, mat); box.position.set(q.x, 2.9, q.z); box.rotation.set(0.6, 0, 0.6);
    ring.visible = box.visible = false; scene.add(ring, box); spotMarks.push({ kind, i, q, ring, box, mat });
  };
  SHOPS.forEach((_, i) => add('shop', i, shopSpot(i))); HOUSES.forEach((_, i) => add('house', i, houseSpot(i)));
  RACES.forEach((r, i) => add('race', i, r.start)); GARAGES.forEach((g, i) => add('garage', i, g)); }
// Police helicopter: a dark body, a rotor disc, a light cone down to the player and a pool of light on the ground
const heliViz = (() => {
  const g = new THREE.Group(), dark = new THREE.MeshStandardMaterial({ color: 0x1b2330, roughness: 0.6, metalness: 0.3 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.9, 2.4, 4, 8), dark); body.rotation.x = Math.PI / 2;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 3.4), dark); tail.position.set(0, 0.2, -3.2);
  const rotor = new THREE.Mesh(new THREE.CircleGeometry(4.4, 18), new THREE.MeshBasicMaterial({ color: 0x15181c, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false })); rotor.rotation.x = -Math.PI / 2; rotor.position.y = 1.25;
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff6d8, toneMapped: false })); lamp.position.set(0, -0.8, 1);
  g.add(body, tail, rotor, lamp); g.visible = false; scene.add(g);
  const add = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, toneMapped: false };
  const beam = new THREE.Mesh(new THREE.ConeGeometry(4.5, 1, 18, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff0c0, opacity: 0.05, ...add })); beam.visible = false; scene.add(beam);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(4.5, 24), new THREE.MeshBasicMaterial({ color: 0xfff0c0, opacity: 0.16, ...add })); pool.rotation.x = -Math.PI / 2; pool.visible = false; scene.add(pool);
  const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
  return (s, p, dt) => {
    const h = s.heli; g.visible = !!h; beam.visible = pool.visible = !!h && !!h.on;
    if (!h) { sfx.setHeli(0); return; }
    const Y = 30, px = g.position.x, pz = g.position.z; g.position.set(h.x, Y, h.z); rotor.rotation.z += dt * 30;
    if (Math.hypot(h.x - px, h.z - pz) > 0.01) g.rotation.y = Math.atan2(h.x - px, h.z - pz);
    sfx.setHeli(Math.max(0, 1 - Math.hypot(h.x - p.x, h.z - p.z) / 150));
    if (!h.on) return;
    dir.set(h.x - p.x, Y - 1, h.z - p.z); const len = dir.length(); dir.normalize();
    beam.position.set((h.x + p.x) / 2, (Y + 1) / 2, (h.z + p.z) / 2); beam.quaternion.setFromUnitVectors(up, dir); beam.scale.set(1, len, 1);
    pool.position.set(p.x, 0.32, p.z);
  };
})();
// Hidden stashes: a small orange bag in an alley, seen only from close by
const stashMarks = (() => { const g = new THREE.BoxGeometry(0.7, 0.45, 0.4), m = new THREE.MeshStandardMaterial({ color: 0xff8a1a, emissive: 0xff6a00, emissiveIntensity: 0.9, roughness: 0.6 }); return STASHES.map((q) => { const b = new THREE.Mesh(g, m); b.position.set(q.x, 0.6, q.z); b.visible = false; scene.add(b); return b; }); })();
let lastSpot = '';
const route = { pts: null, at: 0, tx: 0, tz: 0 };
// The first time you come up to a new kind of marker, one line says what it is for.
const hinted = new Set();
function hintOnce(key, near, text) { if (hinted.has(key) || !near) return; hinted.add(key); if (!cine.active) showMsg(text); else hinted.delete(key); }
const within = (list, p, r) => list.some((q) => (q.x - p.x) ** 2 + (q.z - p.z) ** 2 < r * r);
function updateSpots(s, p, now) {
  heliViz(s, p, 1 / 60);
  hintOnce('ramp', within(RAMPS, p, 30), p.car ? 'Stunt ramp: hit it fast and straight.' : 'Stunt ramp: bring a car, hit it fast and straight.');
  hintOnce('race', within(RACES.map((r) => r.start), p, 22), 'Street race: stop a car on the yellow ring to start the clock.');
  hintOnce('garage', within(GARAGES, p, 22), 'Garage: pull in slowly. $150 fixes and resprays the car, and loses the police if none are close.');
  hintOnce('stash', within(STASHES.filter((_, k) => !(s.stashes || []).includes(k)), p, 14), 'A hidden stash. Twenty are tucked in alleys around the city.');
  hintOnce('fire', !!p.car && p.ammo > 0, isTouch ? 'FIRE shoots your pistol from the car.' : 'Click or F shoots your pistol from the car.');
  { const found = s.stashes || []; stashMarks.forEach((b, k) => { b.visible = !found.includes(k) && (b.position.x - p.x) ** 2 + (b.position.z - p.z) ** 2 < 70 * 70; if (b.visible) { b.rotation.y = now / 500; b.position.y = 0.6 + Math.sin(now / 350 + k) * 0.12; } }); }
  for (const m of spotMarks) {
    const near = (m.q.x - p.x) ** 2 + (m.q.z - p.z) ** 2 < 110 * 110;
    m.ring.visible = m.box.visible = near; if (!near) continue;
    if (m.kind === 'house') m.mat.color.setHex(ownsHouse(s, m.i) ? 0xff8a1a : 0x4aa3ff);
    m.box.rotation.y = now / 700; m.box.position.y = 2.9 + Math.sin(now / 400 + m.i) * 0.15;
  }
  // say what the place is once, as you step up to it
  const si = p.car ? -1 : shopAt(p), hi = p.car ? -1 : houseAt(p), key = si >= 0 ? 's' + si : hi >= 0 ? 'h' + hi + ownsHouse(s, hi) : '';
  if (key !== lastSpot) {
    lastSpot = key;
    if (si >= 0) showMsg(`${SHOPS[si].name}. ${isTouch ? 'Tap SHOP' : 'Press E'} to buy.`);
    else if (hi >= 0) showMsg(ownsHouse(s, hi) ? `Home: ${HOUSES[hi].name}. You heal here and the heat cools off.` : `${HOUSES[hi].name}: $${HOUSES[hi].price.toLocaleString('en-US')}. ${isTouch ? 'Tap BUY' : 'Press E'} to make it yours.`);
  }
  if (shopOpen >= 0 && si !== shopOpen) closeShop();
  // the blocks' scenes near you, and the dice panel while you stand at the game
  hustle.update(s, p, now, 1 / 60);
  { const db = diceAt(s, p); if (diceOpen >= 0) { if (!db || db.id !== diceOpen) closeDice(); else if (Math.floor(now / 500) !== diceTick) { diceTick = Math.floor(now / 500); renderDice(); } }
    hintOnce('dice', !!db, `Your corner runs a dice game. ${isTouch ? 'Tap DICE' : 'Press E'} to put money down.`); }
}
let diceTick = 0;

function pop(t, cls = '') { const el = document.createElement('div'); el.className = 'pop ' + cls; el.textContent = t; $('pops').appendChild(el); setTimeout(() => el.remove(), 2600); }
// stream layer (v0.13): event feed, turf bar, run stats, stream mode
const stream = createStream({ isTouch, S, player, pop }); stream.setOn(streamWanted(params), false);
// clips (v0.14): a rolling recording of the frame, cut by the big moments or by K and the CLIP button
const clips = createClips({ canvas: renderer.domElement, audioStream: sfx.stream, isTouch, onClip: (c) => { stream.push(`Clip saved: ${c.title}`, 'player'); pop('CLIP SAVED'); renderClips(); } });
// story clips (v0.16): Unc's welcome before the opening and the rooftop at the win, each once and skippable; the game's sound drops under them
let lastBust = -1;
const story = createVideo({ base: BASE, duck: (on) => { const a = sfx.audio(); if (a) a.master.gain.setTargetAtTime(on ? 0.0001 : 0.8, a.ctx.currentTime, 0.08); } });
// moments (v0.14): a hook and a shot for everything that happens, drawn into the frame so the clip has it
const moments = createMoments({ camera, scene, cine, S, player, clips, pop });
function renderClips() {
  const box = $('clipList'); if (!box) return; box.textContent = '';
  const btn = $('clipsBtn'); if (btn) btn.textContent = clips.supported ? 'CLIPS: ' + (clips.on ? 'ON' : 'OFF') : 'CLIPS: NOT ON THIS BROWSER';
  for (const c of clips.list) {
    const row = document.createElement('div'); row.className = 'clip';
    const t = document.createElement('span'); t.textContent = `${c.title} (${c.dur} s)`;
    const save = document.createElement('button'); save.type = 'button'; save.textContent = 'SAVE'; save.onclick = () => clips.save(c);
    row.append(t, save);
    if (navigator.canShare) { const sh = document.createElement('button'); sh.type = 'button'; sh.textContent = 'SHARE'; sh.onclick = () => clips.share(c); row.appendChild(sh); }
    box.appendChild(row);
  }
}
$('clipsBtn').onclick = () => { clips.setOn(!clips.on); renderClips(); };
$('clipNow').onclick = () => { clips.cut('Clip'); };
$('endCopy').onclick = () => stream.copySummary(S(), $('endCopy'));
function showMsg(t) { $('msg').textContent = t; msgT = 5; }
function showBig(t, red) { const b = $('big'); b.textContent = t; b.classList.add('show'); b.classList.toggle('red', !!red); bigT = isTouch ? 1.6 : 2.2; }
// Portrait left column: mission and capture stay. Toast yields first, then the tutorial line, if the stack would enter the road band.
function layoutNotices() {
  const msg = $('msg'), onbEl = $('onb');
  msg.classList.remove('hud-yield'); onbEl.classList.remove('hud-yield');
  if (!(innerWidth <= 700 && innerHeight > innerWidth)) return;
  const col = $('lcol'), limit = innerHeight * 0.37;
  const shown = (el) => !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none' && el.textContent.trim();
  const overflow = () => col.getBoundingClientRect().bottom > limit;
  if (overflow() && shown(msg)) msg.classList.add('hud-yield');
  if (overflow() && shown(onbEl)) onbEl.classList.add('hud-yield');
}
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
    ctx.globalAlpha = 0.9; ctx.strokeStyle = b.owner === 'player' ? '#ffc078' : 'rgba(0,0,0,.6)'; ctx.lineWidth = 1.2 / sc * 2; ctx.strokeRect(c.x - BLOCK / 2, c.z - BLOCK / 2, BLOCK, BLOCK);
    // the capture ring in the middle of each block
    ctx.beginPath(); ctx.arc(c.x, c.z, 5, 0, 7); ctx.strokeStyle = CREWS[b.owner].css; ctx.lineWidth = 1.5; ctx.stroke();
    if (b.owner === 'player') { const n = guardsOf(s, b).length; ctx.save(); ctx.translate(c.x, c.z); ctx.rotate(Math.PI - yaw); ctx.scale(1 / sc, 1 / sc); ctx.font = 'bold 15px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText(n + '', 0, 0); ctx.fillStyle = n ? '#bfb' : '#f88'; ctx.fillText(n + '', 0, 0); ctx.restore(); }
    if (b.raid && b.owner === 'player' && Math.floor(now / 180) % 2) { ctx.globalAlpha = 0.95; ctx.strokeStyle = '#f44'; ctx.lineWidth = 4; ctx.strokeRect(c.x - BLOCK / 2, c.z - BLOCK / 2, BLOCK, BLOCK); }
    if (b.capBy && Math.floor(now / 250) % 2) { ctx.globalAlpha = 0.9; ctx.fillStyle = CREWS[b.capBy].css; ctx.fillRect(c.x - BLOCK / 2, c.z - BLOCK / 2, BLOCK, BLOCK); }
  }
  ctx.globalAlpha = 1;
  const dot = (x, z, col, r = 3.5) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, z, r / sc, 0, 7); ctx.fill(); };
  // route line: the way along the streets to the job marker, or to the contact with the next job when idle.
  // Worked out again about once a second, and only drawn when the place is more than a block away.
  { const to = started ? (missionTarget(s) || (!s.mission && s.missionIdx < MISSIONS.length ? contactFor(s) : null)) : null;
    if (!to || (to.x - p.x) ** 2 + (to.z - p.z) ** 2 < 70 * 70) route.pts = null;
    else if (!route.pts || now - route.at > 900 || (to.x - route.tx) ** 2 + (to.z - route.tz) ** 2 > 100) { route.at = now; route.tx = to.x; route.tz = to.z; route.pts = routeTo(p, to); }
    if (route.pts && route.pts.length > 1) {
      ctx.beginPath(); ctx.moveTo(p.x, p.z); for (const q of route.pts) ctx.lineTo(q.x, q.z);
      ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 7 / sc; ctx.stroke(); ctx.strokeStyle = '#ffcc33'; ctx.lineWidth = 4 / sc; ctx.stroke();
    } }
  // shops ($) and safehouses (H) on the radar, upright whatever way the map is turned
  const tag = (q, ch, col) => { if (Math.abs(q.x - p.x) > 130 || Math.abs(q.z - p.z) > 130) return; dot(q.x, q.z, '#000', 8); dot(q.x, q.z, col, 6.5); ctx.save(); ctx.translate(q.x, q.z); ctx.rotate(Math.PI - yaw); ctx.scale(1 / sc, 1 / sc); ctx.font = 'bold 11px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#000'; ctx.fillText(ch, 0, 0.5); ctx.restore(); };
  SHOPS.forEach((_, i) => tag(shopSpot(i), '$', '#39d98a')); HOUSES.forEach((_, i) => tag(houseSpot(i), 'H', ownsHouse(s, i) ? '#ff8a1a' : '#4aa3ff')); if (s.heli) tag(s.heli, '+', '#7ad7ff'); if (s.hail && p.car) { const h = s.ents.find((e) => e.id === s.hail); if (h) tag(h, 'F', '#ffe14a'); } if (s.pkg && p.car) tag(s.pkg, 'P', '#ff8a1a'); RACES.forEach((r) => tag(r.start, 'R', '#ffcc33')); GARAGES.forEach((g) => tag(g, 'G', '#ff5fa2')); RAMPS.forEach((r, i) => tag(r, '^', (s.jumps || []).includes(i) ? '#8a8a8a' : '#ffcc33'));
  for (const e of s.ents) {
    if (e.hp <= 0 || Math.abs(e.x - p.x) > 110 || Math.abs(e.z - p.z) > 110) continue;
    if (e.kind === 'npc') dot(e.x, e.z, CREWS[e.crew].css, 3);
    else if (e.kind === 'cop' && !e.car) dot(e.x, e.z, Math.floor(now / 200) % 2 ? '#f22' : '#26f', 3.5);
  }
  for (const c of s.cars) if (c.cops && Math.abs(c.x - p.x) < 110 && Math.abs(c.z - p.z) < 110) dot(c.x, c.z, Math.floor(now / 200) % 2 ? '#26f' : '#f22', 4.5);
  for (const k of s.pickups) if (k.respawnT <= 0) dot(k.x, k.z, '#6cf', 3);
  const g = contactFor(s);
  if (g && !s.mission) { dot(g.x, g.z, '#000', 9); dot(g.x, g.z, '#fc3', 7.5); }
  const gt = !s.mission && started ? guideTarget(s, p) : null;
  if (gt && gt.label === 'RING') { ctx.beginPath(); ctx.arc(gt.x, gt.z, 9 + Math.sin(now / 200) * 2, 0, 7); ctx.strokeStyle = '#fc3'; ctx.lineWidth = 2.5; ctx.stroke(); }
  const call = s.calls && s.calls.active;
  if (call && !s.mission) { ctx.beginPath(); ctx.arc(call.x, call.z, 4 + Math.sin(now / 160) * 1.2, 0, 7); ctx.strokeStyle = '#e8914a'; ctx.lineWidth = 2; ctx.stroke(); dot(call.x, call.z, '#e8914a', 4); }
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
    ctx.fillStyle = '#fc3'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.font = 'bold 22px Impact'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.strokeText(g.name[0], W / 2 + Math.cos(a) * r, W / 2 + Math.sin(a) * r); ctx.fillText(g.name[0], W / 2 + Math.cos(a) * r, W / 2 + Math.sin(a) * r);
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
function streetTarget(s) {
  const a = s.calls && s.calls.active;
  if (!a || s.mission || a.phase !== 'offer') return null;
  return { x: a.x, z: a.z, label: 'CALL' };
}
function missionTarget(s) {
  const m = s.mission; if (!m) return s.side ? s.side.target : s.pkg && player(s).car ? s.pkg : null; // a waiting package gets the marker while you ride
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
  if (!on) goFullscreen();
  if (on) { const g = progress(S()); $('prog').innerHTML = `<b>${g.pct}% complete</b>` + g.parts.map(([n, a, b]) => `<span>${n} ${a}/${b}</span>`).join(''); stream.renderStats($('runstats'), S()); renderClips(); }
  if (on) writeSave();
  if (on && document.pointerLockElement) document.exitPointerLock();
}
addEventListener('keydown', (e) => { if ((e.code === 'Escape' || e.code === 'KeyP') && started && !cine.active && !story.active) setPaused(!paused); });
document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && started && !paused && !isTouch && !cine.active && !story.active) setPaused(true); });
$('bPause').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); setPaused(true); });
$('pResume').onclick = () => setPaused(false);
$('pRestart').onclick = () => { started = false; clearSave(); location.reload(); };
for (const b of document.querySelectorAll('#pause [data-q]')) b.onclick = () => { writeSave(); localStorage.setItem('se-q', b.dataset.q); const u = new URL(location.href); u.searchParams.set('q', b.dataset.q); location.href = u.toString(); };
document.addEventListener('visibilitychange', () => { if (document.hidden && started) { setPaused(true); writeSave(); } });
function handleFx(list) {
  const s = S(), p = player(s);
  const byId = (id) => s.ents.find((e) => e.id === id);
  for (const f of list) {
    const d = f.x !== undefined ? Math.hypot(f.x - p.x, f.z - p.z) : 0, vol = Math.max(0, 1 - d / 45);
    stream.fx(f, s); moments.fx(f, s);
    if (f.type === 'streak') { sfx.chime(true); fovKick = Math.max(fovKick, 3); }
    else if (f.type === 'hit') {
      const mine = f.by === p.id || f.to === p.id, src = byId(f.by), w = src ? src.weapon : 'fists';
      if (vol > 0) { sfx.impact(src && (w === 'pistol' || w === 'shotgun') && d > 3 ? 'bullet' : w, vol); if (f.ko) sfx.knockout(vol); }
      // sparks and dust, no blood: spray away from the attacker
      const dir = [f.dx * 4 || 0, f.dz * 4 || 0];
      if (d < 60) {
        parts.burst(f.x, 1.25, f.z, f.heavy ? 10 : 6, 4, { color: 0xffd27a, life: 0.25, g: 6, s: 0.07, stretch: 1 }, dir);
        parts.burst(f.x, 0.25, f.z, f.ko ? 12 : 5, 2, { color: 0x9a8064, life: 0.7, g: 1.5, s: 0.22, up: 0.4 });
      }
      const tagCol = { JAB: '#f4f4f4', CROSS: '#ffd27a', KNUCK: '#d5e8ff', BAT: '#ffb060', SHOT: '#ffe9a0', BUCK: '#ff9966', rush: '#ff7755', flank: '#7ad7ff', retreat: '#ffe14a' };
      if (f.amt && d < 40) floatHit(f.x, f.z, (f.tag ? f.tag + ' ' : '') + f.amt, f.to === p.id ? '#ff7777' : (tagCol[f.tag] || '#fff1c4'));
      // a knockout tumbles (v0.15): hit by a car the body goes up and over, a punch or a bat drops it with a hop and a lean.
      // Presentation on the drawn body only; the sim's knockback carries it along the ground.
      if (f.ko && f.to !== p.id) { const g = charViz.get(f.to); if (g) { const byCar = typeof f.by === 'string'; const dir = Math.sign((f.dx || 0) * Math.sin(g.rotation.y) + (f.dz || 0) * Math.cos(g.rotation.y)) || -1; g.userData.tumble = byCar ? { t: 0, dur: 1.1, h: 1.5, turns: 1, lean: 0, dir } : { t: 0, dur: 0.6, h: 0.25, turns: 0, lean: 0.4, dir }; } }
      if (f.tag === 'KNUCK' && d < 60) parts.burst(f.x, 1.2, f.z, 8, 3.5, { color: 0xd5e8ff, life: 0.22, g: 5, s: 0.06, stretch: 1 }, dir);
      if (f.tag === 'BAT' && d < 60) parts.burst(f.x, 0.35, f.z, 10, 3, { color: 0xc4a070, life: 0.45, g: 2, s: 0.2, up: 0.3 });
      if (mine) {
        const punch = f.tag === 'KNUCK' || f.tag === 'BAT' || f.tag === 'CROSS';
        hitStop = Math.max(hitStop, f.ko ? 0.09 : f.tag === 'KNUCK' ? 0.085 : punch ? 0.07 : f.heavy ? 0.06 : 0.04);
        shake = Math.max(shake, f.to === p.id ? 0.5 : f.tag === 'BAT' ? 0.46 : f.heavy ? 0.38 : 0.22); camKick = Math.max(camKick, f.heavy ? 0.5 : 0.25);
        if (f.ko && f.by === p.id) { slowT = 0.6; fovKick = 6; showMsg('KNOCKOUT'); }
        if (isTouch && navigator.vibrate) navigator.vibrate(f.ko ? [40, 30, 70] : f.to === p.id ? 60 : f.heavy ? 45 : 25);
      }
    } else if (f.type === 'block') {
      if (vol > 0) sfx.block(vol);
      parts.burst(f.x, 1.3, f.z, 8, 3, { color: 0xbfd8ff, life: 0.2, g: 4, s: 0.06, stretch: 1 });
      if (f.to === p.id || f.by === p.id) { shake = Math.max(shake, 0.15); hitStop = Math.max(hitStop, 0.03); }
    } else if (f.type === 'evade' || f.type === 'dodge') { if (f.to === p.id) sfx.whoosh(); parts.burst(f.x, 0.2, f.z, 5, 1.5, { color: 0x9a8064, life: 0.5, g: 1, s: 0.2, up: 0.3 }); }
    else if (f.type === 'whiff') { /* swing sound already played */ }
    else if (f.type === 'tell' && d < 30) parts.burst(f.x, 0.15, f.z, 4, 1.2, { color: f.style === 'flank' ? 0x7ad7ff : f.style === 'retreat' ? 0xffe14a : 0xff5530, life: 0.35, g: 1, s: 0.12, up: 0.2 });
    else if (f.type === 'street' && f.state === 'win') pop(`+$${f.reward}`);
    else if (f.type === 'backup') pop(`A guard from ${f.hustle} is coming to back you up`);
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
      if (f.by === p.id) { if (big && n > 20) { slowT = 0.4; fovKick = 5; } shake = Math.max(shake, big ? Math.min(0.9, 0.25 + n * 0.03) : 0.12); if (big && isTouch && navigator.vibrate) navigator.vibrate(80); const g = carViz.get(p.car); if (g) { const u = g.userData; u.bounce = (u.bounce || 0) + (big ? 0.3 : 0.06); u.rv = (u.rv || 0) + (big ? 2.4 : 0.6) * (Math.random() < 0.5 ? -1 : 1); u.pv = (u.pv || 0) + (big ? 2.8 : 0.8); } }
      // every car in the crash rocks on its springs, not only yours
      if (big && d < 70) for (const [id, cg] of carViz) if (id !== p.car && (cg.position.x - f.x) ** 2 + (cg.position.z - f.z) ** 2 < 30) { const u = cg.userData; u.bounce = (u.bounce || 0) + 0.2; u.pv = (u.pv || 0) + 1.6; u.rv = (u.rv || 0) + 1.2 * (Math.random() < 0.5 ? -1 : 1); }
    }
    else if (f.type === 'cleared') { for (let i = 0; i < 6; i++) smoke.emit(f.x + (Math.random() - 0.5) * 2, 0.6, f.z + (Math.random() - 0.5) * 2, false, false); }
    else if (f.type === 'wreck') { sfx.crash(vol); for (let i = 0; i < 8; i++) smoke.emit(f.x, 1.5, f.z, true, true); parts.burst(f.x, 1, f.z, 20, 7, { color: 0xffa040, life: 0.6, g: 9, s: 0.07, stretch: 1, bounce: 0.3 }); }
    else if (f.type === 'guards') { pop(`${f.n} guard${f.n > 1 ? 's' : ''} hold the block`); }
    else if (f.type === 'capture') { sfx.sting(); if (f.crew === 'player') { radio.news(`News: a corner in ${hood()} is under new management. Orange is in.`); const b = s.blocks.find((b) => b.id === f.block); if (b && !cine.active) cine.swing(blockCenter(b), b.hustle); } }
    else if (f.type === 'stash' && (!f.stolen || f.crew === 'player')) pop(`+$${f.amt} ${f.hustle}`);
    else if (f.type === 'upgrade') pop(`${f.n} guard${f.n > 1 ? 's' : ''} armed`);
    else if (f.type === 'dice') { if (f.by === p.id) diceFx(f); else hustle.roll(f.block); }
    else if (f.type === 'built') { pop(`${f.hustle} built up: ${BUILD_BOOST}x income`); sfx.chime(true); }
    else if (f.type === 'raid' && f.eta > 0) sfx.chime(false);
    else if (f.type === 'lost') { radio.news('Word is the orange crew just lost a corner. Rough night.'); sfx.chime(false); }
    else if (f.type === 'jack') pendingJack = f.ped;
    else if (f.type === 'courier') { if (f.state === 'offer') pop(`${f.hustle} has a package to run (P on the radar)`); else if (f.state === 'pick') { showBig('PACKAGE LOADED'); sfx.chime(true); } else if (f.state === 'drop') { showBig(`DELIVERED +$${f.pay}`); if (f.streak) pop('Five in a row: +$150'); sfx.chime(true); } else { showBig('PACKAGE LOST', true); sfx.chime(false); } }
    else if (f.type === 'fare') { if (f.state === 'hail') pop('Someone nearby needs a ride (F on the radar)'); else if (f.state === 'pick') { showBig('FARE ON BOARD'); sfx.chime(true); } else if (f.state === 'drop') { showBig(`FARE PAID +$${f.pay}`); if (f.streak) pop('Five in a row: +$100'); sfx.chime(true); } else { showBig('FARE LOST', true); sfx.chime(false); } }
    else if (f.type === 'heli') { if (f.state === 'in') { radio.news('Police have a helicopter up tonight. Wave if you see it.'); } else if (f.fuel) pop('The helicopter is refueling: 30 s'); }
    else if (f.type === 'found') { pop(`+$${f.pay} stash ${f.n} of ${f.of}`); sfx.chime(true); parts.burst(f.x, 0.8, f.z, 14, 3, { color: 0xffb040, life: 0.6, g: 3, s: 0.08, up: 1.2 }); }
    else if (f.type === 'garage') { if (f.ok) { pop(`-$150 ${GARAGES[f.k].name}`); showBig(f.seen ? 'RESPRAYED' : 'RESPRAYED: HEAT GONE'); sfx.chime(true); const g = carViz.get(f.car); if (g) { scene.remove(g); carViz.delete(f.car); } } else { pop(`${GARAGES[f.k].name}: $150`, 'bad'); sfx.chime(false); } }
    else if (f.type === 'race') { if (f.state === 'go') { sfx.sting(); } else if (f.state === 'win') { pop(`+$${f.pay}${f.record ? ' new best' : ''}`); sfx.chime(true); } else { showBig('RACE OVER', true); sfx.chime(false); } }
    else if (f.type === 'boom') {
      if (d < 60) radio.news(`News: a car just went up in ${hood()}. Police would like a word with a man in orange.`);
      sfx.boom(Math.max(0.15, 1 - d / 120));
      if (d < 140) {
        flashes.flash(f.x, 1.6, f.z, 14); flashes.flash(f.x + 1, 2.6, f.z - 1, 9);
        parts.burst(f.x, 1.2, f.z, LOW ? 26 : 50, 13, { color: 0xffa030, life: 0.9, g: 10, s: 0.11, stretch: 1, bounce: 0.3, up: 1.4 });
        parts.burst(f.x, 0.8, f.z, LOW ? 10 : 20, 7, { color: 0x2a2622, life: 1.4, g: 6, s: 0.22, bounce: 0.2, up: 1.6 });
        for (let i = 0; i < (LOW ? 8 : 16); i++) smoke.emit(f.x + (Math.random() - 0.5) * 3, 1 + Math.random() * 2, f.z + (Math.random() - 0.5) * 3, true, true);
      }
      const g = carViz.get(f.car); if (g && !g.userData.charred) { g.userData.charred = true; g.userData.bounce = 1.2; g.traverse((o) => { if (o.isMesh && o.material && o.material.color) { o.material = o.material.clone(); o.material.color.multiplyScalar(0.16); if (o.material.emissive) o.material.emissive.setScalar(0); } }); }
      if (d < 60) { shake = Math.max(shake, 1.1 - d / 60); camKick = Math.max(camKick, 0.8); if (d < 30) { slowT = 0.6; fovKick = 7; } if (isTouch && navigator.vibrate) navigator.vibrate([90, 40, 140]); }
    }
    else if (f.type === 'fire') { if (d < 60) parts.burst(f.x, 1.2, f.z, 12, 4, { color: 0xff7a20, life: 0.5, g: 2, s: 0.1, up: 1.5 }); if (p.car === f.car) showBig('ON FIRE: GET OUT', true); }
    else if (f.type === 'launch') { slowT = 0.5; fovKick = 6; sfx.whoosh(); }
    else if (f.type === 'land') { if (f.by === p.id) { shake = Math.max(shake, Math.min(0.9, 0.2 + f.n * 0.06)); const g = carViz.get(f.car); if (g) g.userData.bounce = (g.userData.bounce || 0) + 0.5; if (isTouch && navigator.vibrate) navigator.vibrate(70); } if (vol > 0) sfx.impact('bat', vol); parts.burst(f.x, 0.2, f.z, 14, 4, { color: 0x9a8a78, life: 0.7, g: 1.5, s: 0.25, up: 0.4 }); }
    else if (f.type === 'stunt') { radio.news(`A caller in ${hood()} says a car just flew over her street. We believe her.`); pop(`+$${f.pay}${f.first ? ` ramp ${f.done} of ${f.of}` : ''}`); sfx.chime(true); }
    else if (f.type === 'nearmiss') { pop(`NEAR MISS${f.n > 1 ? ' x' + f.n : ''} +$${f.pay}`); sfx.whoosh(); fovKick = Math.max(fovKick, 3); }
    else if (f.type === 'bark') { if (d < 26 && !cine.active) floatSay(f.id, f.x, f.z, f.text, f.set === 'call' ? 'call' : f.set === 'fight' || f.set === 'rage' || f.set === 'jacked' ? 'mad' : ''); }
    else if (f.type === 'called') { radio.news(`Police are answering a call in ${hood()}. If that is you, we never spoke.`); pop('A witness called it in', 'bad'); sfx.chime(false); floatSay(f.id, f.x, f.z, 'They are on the way.', 'call'); }
    else if (f.type === 'dive') { if (d < 30) parts.burst(f.x, 0.2, f.z, 5, 1.5, { color: 0x9a8064, life: 0.5, g: 1, s: 0.2, up: 0.3 }); }
    else if (f.type === 'ditch') { if (vol > 0) sfx.block(vol * 0.6); }
    else if (f.type === 'pickup') sfx.chime(true);
    else if (f.type === 'bought') { pop(`-$${f.cost} ${SHOP_ITEMS[f.item].name}`); sfx.chime(true); }
    else if (f.type === 'house') { pop(f.name); sfx.chime(true); }
    else if (f.type === 'broke') sfx.chime(false);
    else if (f.type === 'roadblock') { sfx.chime(false); }
    else if (f.type === 'checkpoint') { pop(`Marker ${f.n} of ${f.of}`); sfx.chime(true); }
    else if (f.type === 'gift') pop('A recruit is with you.');
    else if (f.type === 'wasted') { cine.down(false); }
    else if (f.type === 'busted') {
      // a filmed officer takes you in, never the same one twice running, then the BUSTED screen as before
      if (params.has('novideo') || story.active) cine.down(true);
      else { let n = Math.floor(Math.random() * (BUST_CLIPS.length - 1)); if (n >= lastBust) n++; lastBust = n; const b = BUST_CLIPS[n]; story.play(b.name, { touch: isTouch, subs: b.subs }).then(() => cine.down(true)); }
    }
    else if (f.type === 'mission') { if (f.state === 'pass') { const pg = charViz.get(p.id); cine.passed(f.title, f.reward, f.rep, p.car || !pg ? null : pg.position); pop(`+$${f.reward} job: ${f.title}`); sfx.chime(true); } else if (f.state === 'fail') { cine.failed(f.title); sfx.chime(false); } else { const pg = charViz.get(p.id), gv = s.ents.find((e) => e.kind === 'giver'), ug = gv && charViz.get(gv.id); if (!p.car) { pendingBrief = { idx: f.idx ?? 0, title: f.title, wait: 1.5 }; } else showBig(f.title.toUpperCase()); } }
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
let slowFor = 0, potatoOffered = false, fullT = 0, heavyFor = 0;
let steerIn = 0, bank = 0, speedU = 0; // chase camera banking into turns, and the speed blur, both eased
let starsPrev = 0;
const shF = new THREE.Vector3(), shX = new THREE.Vector3(), shY = new THREE.Vector3(), shZ = new THREE.Vector3(), shC = new THREE.Vector3(), shUp = new THREE.Vector3(0, 1, 0);
// full graphics on a phone that cannot carry them: shadows and glow go off, the view pulls back in, and the choice is kept
function dropFull() {
  FULL = false; sun.castShadow = false; flatLight(); if (bloom) bloom.enabled = false;
  LOD_DIST = 34; CAR_DIST = 90; fogFar = 215;
  try { localStorage.setItem('se-gfx', 'lite'); } catch (e) { /* storage off: it steps down again next time */ }
  document.getElementById('ver').textContent = VERSION + ' low'; setGfxBtn();
  showMsg('Shadows off to keep it smooth.');
}
const gfxBtn = $('gfxBtn');
function setGfxBtn() { if (gfxBtn) gfxBtn.textContent = FULL ? 'ON' : 'OFF'; }
if (gfxBtn) { if (!LOW || POTATO) gfxBtn.parentElement.style.display = 'none'; setGfxBtn(); gfxBtn.onclick = () => { writeSave(); localStorage.setItem('se-gfx', FULL ? 'lite' : 'full'); const u = new URL(location.href); u.searchParams.delete('gfx'); location.href = u.toString(); }; }
let last = performance.now(), radarT = 0, frameAvg = 16, resT = 0, camInit = false;
const startBtn = $('start');
// with a save on this device the title offers CONTINUE, and NEW GAME under it (two taps, it erases the save)
const START_LABEL = savedState ? 'CONTINUE' : 'HIT THE STREETS';
if (savedState) {
  const nb = $('newBtn'); nb.classList.remove('hidden'); let armed = false;
  nb.onclick = () => { if (!armed) { armed = true; nb.textContent = 'TAP AGAIN TO ERASE YOUR SAVE'; setTimeout(() => { armed = false; nb.textContent = 'NEW GAME'; }, 4000); return; } clearSave(); location.reload(); };
}
let loaded = false, wantStart = false;
startBtn.textContent = 'LOADING... TAP TO START WHEN READY';
THREE.DefaultLoadingManager.onProgress = (url, done, total) => { $('loadbar').style.width = Math.round((done / total) * 100) + '%'; };
const grainBox = $('grain'); grainBox.checked = !(LOW || POTATO) && localStorage.getItem('se-grain') === '1'; grainBox.disabled = !!(LOW || POTATO); grainBox.onchange = () => setGrain(grainBox.checked);
Promise.all([
  loadPeople(BASE, () => { peopleReady = true; }, POTATO).catch((e) => console.error(e)),
  // build kit first, so the first cars and city sections already use its models
  Promise.all([loadKit(BASE, { low: LOW, shadow: SHADOWS, farAt: FULL ? 52 : 0 }).then(() => { const p = player(S()); city.buildAllNear(p.x, p.z); }).catch((e) => console.error(e)), loadCars(BASE)]).then(() => { carsReady = true; }).catch((e) => console.error(e)),
]).finally(() => { peopleReady = true; loaded = true; startBtn.disabled = false; startBtn.textContent = START_LABEL; if (wantStart) startGame(); $('loadbar').style.width = '100%'; document.body.classList.add('loaded'); });
// On a phone the browser's address bar and the system buttons take a strip of the screen. Going fullscreen has to
// happen inside a tap, so it is asked for on START and again whenever the game is resumed (the back gesture leaves
// fullscreen). Browsers without it (iPhone Safari) ignore this; installing to the home screen is fullscreen there.
function goFullscreen() {
  if (!document.body.classList.contains('touch') || document.fullscreenElement || document.webkitFullscreenElement) return;
  const el = document.documentElement, ask = el.requestFullscreen || el.webkitRequestFullscreen;
  try { const r = ask && ask.call(el, { navigationUI: 'hide' }); if (r && r.catch) r.catch(() => {}); } catch { /* not allowed here: play on in the tab */ }
}
startBtn.onclick = () => { goFullscreen(); sfx.initAudio(); if (!loaded) { wantStart = true; startBtn.textContent = 'STARTING AS SOON AS IT LOADS...'; return; } startGame(); };
function startGame() {
  if (started) return;
  sfx.initAudio();
  // dip to black, drop the title, then fly in over the city (skippable; ?nointro skips it for tests)
  $('intro').classList.add('leaving'); $('tiFade').classList.add('on');
  setTimeout(() => {
    $('intro').classList.add('hidden'); $('tiFade').classList.remove('on'); clearTitleProps();
    { const g0 = charViz.get(player(S()).id); if (g0) { g0.userData.cineHold = false; g0.userData.cineAnim = null; g0.userData.cineHolster = false; } }
    document.body.classList.remove('pre'); $('bPause').classList.add('show'); started = true; last = performance.now();
    // clips record from here: on when asked for, or kept on from last time, or whenever stream mode is on
    { let want = null; try { want = localStorage.getItem('se-clips'); } catch (e) { /* storage off */ } clips.setOn(params.has('clips') || (want != null ? want === '1' : stream.on)); }
    scuffleT = savedState ? 0 : 2.5; onb.step = onb.done || savedState ? -1 : 0; renderOnb();
    const s = S(), p = player(s), pg = charViz.get(p.id), home = blockCenter(s.blocks[0]), far = blockCenter(s.blocks[s.blocks.length - 1]);
    const welcome = () => showMsg('Welcome to the Eastside.');
    if (savedState) { showMsg('Back on your streets.'); return; } // a continued game drops straight in
    if (params.has('nointro') || !pg) { welcome(); return; }
    city.buildAll(); // the flyover crosses the whole city: build it behind the fade so no lot is empty
    // one block on the city's diagonal for each place the opening cuts to
    const diag = (g) => blockCenter(s.blocks.find((b) => b.gx === g && b.gz === g) || s.blocks[0]);
    const opening = () => cine.opening({ home, center: { x: 0, z: 0 }, player: pg.position.clone(), onDone: welcome, pitch: PITCH,
      spots: { harbor: far, downtown: diag(Math.floor(GRID / 2)), midtown: diag(Math.round((GRID - 1) * 0.35)) },
      locs: [{ at: 0.2, k: DISTRICTS[2].toUpperCase(), t: 'Gold Line runs the docks' }, { at: 2.0, k: DISTRICTS[1].toUpperCase(), t: 'Red Kings. Blue Hand. Nobody shares.' }, { at: 3.9, k: DISTRICTS[3].toUpperCase(), t: 'Nobody holds it. Yet.' }, { at: 5.3, k: DISTRICTS[0].toUpperCase(), t: 'One block. Yours.' }] });
    // Unc's welcome plays first on a new game (?novideo skips it), then the flyover
    if (params.has('novideo')) opening(); else story.play('unc-intro', { touch: isTouch }).then(opening);
  }, 480);
}
if (!savedState && !params.has('nointro') && !params.has('novideo')) story.warm('unc-intro'); // a new player's first clip loads behind the title
$('howBtn').onclick = () => $('how').classList.remove('hidden');
$('howClose').onclick = () => $('how').classList.add('hidden');
// ---------- v0.11 title: staged props on the live block (not part of the sim) ----------
const titleProps = [];
let titleCop = null, titleCopCar = null, titleSiren = null;
function buildTitleProps() {
  if (titleProps.length || !carsReady || !peopleReady) return;
  const s = S(), p = player(s);
  // a parked cruiser up the curb from the player, and an officer standing at its door
  let spot = null;
  for (const dz of [-9, 9, -12, 12, -6, 6]) for (const dx of [2.5, -2.5, 4, -4]) {
    const x = p.x + dx, z = p.z + dz;
    if (!spot && [-2.6, 0, 2.6].every((o) => !insideBuilding(x, z + o, 1.1)) && !s.cars.some((c) => Math.hypot(c.x - x, c.z - z) < 5.5)) spot = { x, z };
  }
  if (!spot) return;
  const fake = { id: 'title-cruiser', type: 'police', paint: 0, x: spot.x, z: spot.z, ry: 0, v: 0, steer: 0, siren: true, ai: true };
  titleCopCar = makeCar(fake); titleCopCar.position.set(spot.x, 0, spot.z); titleCopCar.rotation.y = 0; titleCopCar.userData.fake = fake; scene.add(titleCopCar); titleProps.push(titleCopCar);
  const ce = { id: 9001, kind: 'cop', crew: 'cops', hp: 100, moving: 0, weapon: 'fists' };
  const look = lookFor(ce, CREWS);
  if (modelReady(look.model) || look.kitT) {
    titleCop = makeCharacter(look, SHADOWS); const side = spot.x > p.x ? -1.6 : 1.6;
    titleCop.position.set(spot.x + side, 0.24, spot.z + 0.6); titleCop.rotation.y = Math.atan2(p.x - titleCop.position.x, p.z - titleCop.position.z);
    titleCop.userData.cineHold = true; titleCop.userData.cineAnim = 'Idle_Loop'; titleCop.userData.fakeEnt = ce; scene.add(titleCop); titleProps.push(titleCop);
  }
  if (!LOW) { titleSiren = new THREE.PointLight(0xff2020, 0, 16, 1.6); titleSiren.position.set(spot.x, 2.2, spot.z); scene.add(titleSiren); titleProps.push(titleSiren); }
}
function updateTitleProps(rdt, now) {
  if (titleCopCar) updateCar(titleCopCar, titleCopCar.userData.fake, rdt, night > 0.3, now);
  if (titleCop) animate(titleCop, titleCop.userData.fakeEnt, rdt, false);
  if (titleSiren) { const on = Math.floor(now / 180) % 2 === 0; titleSiren.color.setHex(on ? 0xff2020 : 0x2050ff); titleSiren.intensity = 14; }
}
function clearTitleProps() { for (const o of titleProps) scene.remove(o); titleProps.length = 0; titleCop = titleCopCar = titleSiren = null; }
// ---------- v0.10 onboarding: opening scuffle, 3 steps, waypoint to the next thing to do ----------
let scuffleT = -1, scufflerId = null, onbMission = false;
const onb = { step: -1, done: localStorage.getItem('se-onb') === '3' };
const ONB = () => isTouch ? ['Stop the muggers: HIT', 'Talk to Unc: TALK', 'Take a block: clear it, stand in the ring'] : ['Stop the muggers: F or click', 'Talk to Unc: E', 'Take a block: clear it, stand in the ring'];
function renderOnb() {
  const el = $('onb');
  if (onb.step < 0 || onb.step > 2 || (S().mission && onb.step === 2)) { el.classList.add('hidden'); el.textContent = ''; return; }
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
  const g = contactFor(s);
  // the tutorial points at Unc; after it, the arrow points at whoever has the next job
  if ((onb.step <= 1 || onb.step < 0) && g && s.missionIdx < MISSIONS.length && !s.mission) return { x: g.x, z: g.z, label: g.name.toUpperCase() };
  if (onb.step === 2) {
    let best = null, bd = 1e12;
    for (const b of s.blocks) if (b.owner !== 'player') { const c = blockCenter(b); const d = (c.x - p.x) ** 2 + (c.z - p.z) ** 2; if (d < bd) { bd = d; best = c; } }
    if (best) return { x: best.x, z: best.z, label: 'RING' };
  }
  return null;
}

const DRIVER_DROP = 0.55; // seat height minus the hips of the Driving_Loop pose
function sitOffset(type) { return type === 'van' ? 0.95 : type === 'suv' || type === 'pickup' ? 0.8 : 0.55; }
// a seated driver's head tops out about 1.64 m above his seat position (measured, caps included);
// kit cars seat him from their own roof so his head stays inside, built-in cars keep the per-type seat
const DRIVER_HEAD = 1.72;
// A rider sits on the bike in the driving pose, tipped forward onto the bars. That pose keeps the legs
// for a car seat, so the thighs and calves are folded onto the pegs here, turned in world space so it
// works on any rig (bones are found by the same names the retargeter uses).
const BIKE_SEAT = { y: 0.76 - DRIVER_DROP, z: -0.6, lean: 0.42, thigh: -0.95, calf: 1.35, spread: 0.22 };
const _bq = new THREE.Quaternion(), _bp = new THREE.Quaternion(), _bw = new THREE.Quaternion(), _bx = new THREE.Vector3(), _bz = new THREE.Vector3();
function turnWorld(bone, axis, angle) {
  bone.parent.updateWorldMatrix(true, false); bone.parent.getWorldQuaternion(_bp); _bw.copy(_bp).multiply(bone.quaternion);
  bone.quaternion.copy(_bp.invert()).multiply(_bq.setFromAxisAngle(axis, angle).multiply(_bw));
}
// Arms: when the bike lists its grips (kit.json "grips"), each hand is put on its grip with a two-bone reach:
// bend the elbow to the right length, then swing the whole arm onto the target. gripL and gripR are world positions.
const _rs = new THREE.Vector3(), _re = new THREE.Vector3(), _rh = new THREE.Vector3(), _ra = new THREE.Vector3(), _rb = new THREE.Vector3(), _rx = new THREE.Vector3(), _rq = new THREE.Quaternion(), _rw = new THREE.Quaternion();
function turnWorldQ(bone, q) { bone.parent.getWorldQuaternion(_bp); bone.getWorldQuaternion(_rw); bone.quaternion.copy(_bp.invert()).multiply(q).multiply(_rw); bone.updateWorldMatrix(false, true); }
function bikeReach(rider, f, gripL, gripR) {
  rider.updateWorldMatrix(true, true);
  for (const [side, T] of [['l', gripL], ['r', gripR]]) {
    const up = f['upperarm_' + side], lo = f['lowerarm_' + side], hand = f['hand_' + side]; if (!up || !lo || !hand) continue;
    up.getWorldPosition(_rs); lo.getWorldPosition(_re); hand.getWorldPosition(_rh);
    const a = _rs.distanceTo(_re), b = _re.distanceTo(_rh), d = Math.max(Math.abs(a - b) + 1e-3, Math.min((a + b) * 0.995, _rs.distanceTo(T)));
    _ra.subVectors(_rs, _re).normalize(); _rb.subVectors(_rh, _re).normalize();
    const now = Math.acos(THREE.MathUtils.clamp(_ra.dot(_rb), -1, 1)), want = Math.acos(THREE.MathUtils.clamp((a * a + b * b - d * d) / (2 * a * b), -1, 1));
    _rx.crossVectors(_ra, _rb); if (_rx.lengthSq() < 1e-8) _rx.set(side === 'l' ? -1 : 1, 0, 0); _rx.normalize();
    turnWorldQ(lo, _rq.setFromAxisAngle(_rx, want - now));
    hand.getWorldPosition(_rh);
    turnWorldQ(up, _rq.setFromUnitVectors(_ra.subVectors(_rh, _rs).normalize(), _rb.subVectors(T, _rs).normalize()));
  }
}
const bikeGripL = new THREE.Vector3(), bikeGripR = new THREE.Vector3();
const BIKE_BONES = ['thigh_l', 'thigh_r', 'calf_l', 'calf_r', 'upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r'];
function bikePose(rider, S = BIKE_SEAT, bike = null) {
  const u = rider.userData;
  if (u.bikeLegs === undefined) {
    const f = {}; rider.traverse((o) => { if (o.isBone) { const n = canonical(o.name); if (n && !f[n]) f[n] = o; } });
    u.bikeLegs = f.thigh_l && f.thigh_r && f.calf_l && f.calf_r ? f : null;
  }
  const f = u.bikeLegs; if (!f) return;
  // The animation mixer only rewrites a bone when the clip's value for it changes, and the seated clip holds
  // the legs still. Without this the turns below would stack on top of last frame's and the legs would spin.
  // So each posed bone goes back to the clip's own pose first (a bone the mixer did rewrite is taken as the new base).
  for (const n of BIKE_BONES) { const b = f[n]; if (!b) continue; const d = b.userData;
    if (d.posed && b.quaternion.equals(d.posed)) b.quaternion.copy(d.base); else (d.base ||= new THREE.Quaternion()).copy(b.quaternion); }
  rider.updateWorldMatrix(true, false); rider.getWorldQuaternion(_bw);
  _bx.set(1, 0, 0).applyQuaternion(_bw); _bz.set(0, 0, 1).applyQuaternion(_bw);
  for (const [side, sg] of [['l', 1], ['r', -1]]) {
    turnWorld(f['thigh_' + side], _bx, S.thigh); turnWorld(f['thigh_' + side], _bz, S.spread * sg);
    turnWorld(f['calf_' + side], _bx, S.calf);
  }
  if (bike && bike.grips) bikeReach(rider, f, bikeGripL.copy(bike.grips[0]).applyMatrix4(bike.model.matrixWorld), bikeGripR.copy(bike.grips[1]).applyMatrix4(bike.model.matrixWorld));
  for (const n of BIKE_BONES) { const b = f[n]; if (b) (b.userData.posed ||= new THREE.Quaternion()).copy(b.quaternion); }
}
function seatY(c, u) { const y = sitOffset(c.type) - DRIVER_DROP; return u.kit && u.roof ? Math.min(y, u.roof - DRIVER_HEAD) : y; }

function frame(now) {
  requestAnimationFrame(frame);
  if (story.active) { last = now; return; } // a story clip covers the screen: nothing is drawn or simulated under it, so the phone can spend itself on the video
  renderer.info.reset();
  const rawMs = Math.max(0, now - last);
  let rdt = Math.max(0, Math.min(0.05, rawMs / 1000)); last = now;
  frameAvg = frameAvg * 0.95 + Math.min(1000, rawMs) * 0.05;
  // sustained very low FPS after start: offer potato quality once
  if (started && !POTATO && !PIN && !paused && frameAvg > 70 && (slowFor += rdt) > 6 && !potatoOffered) { potatoOffered = true; showMsg('Running slow: try POTATO in Pause.'); pixelRatio = 0.5; renderer.setPixelRatio(pixelRatio); composer = null; }
  else if (frameAvg < 50) slowFor = 0;
  // phones on full graphics: under about 38 fps for five seconds running (after the first few seconds of loading hitches), step down
  if (FULL && !PIN && gfxAsk !== 'full' && started && !paused && (fullT += rdt) > 8) { if (frameAvg > 26) { if ((heavyFor += rdt) > 5) dropFull(); } else if (frameAvg < 21) heavyFor = 0; }
  if ((resT += rdt) > 2) { resT = 0; const max = PR_MAX(); const target = PIN ? pixelRatio : frameAvg > 24 ? Math.max(POTATO ? 0.5 : 0.8, pixelRatio - 0.15) : frameAvg < 15 ? Math.min(max, pixelRatio + 0.1) : pixelRatio; if (Math.abs(target - pixelRatio) > 0.01) { pixelRatio = target; renderer.setPixelRatio(pixelRatio); if (composer) { composer.setPixelRatio(pixelRatio); } setGradeRes(); } }
  let dt = rdt;
  if (hitStop > 0) { hitStop -= rdt; dt = rdt * 0.05; } else if (slowT > 0) { slowT -= rdt; dt = rdt * (0.25 + 0.75 * Math.max(0, 1 - slowT / 0.6) ** 2); }
  const s = S(), p = player(s);
  if (p.downT > 0) dt *= 0.4; // down beat in slow motion
  if (moments.timeScale < 1) dt = rdt * moments.timeScale; // a moment's own beat of slow motion
  if (paused) dt = 0;
  if (started && !paused && (saveT += rdt) > 8) { saveT = 0; writeSave(); }
  if (started && !s.over && !cine.pausesSim && !paused && !story.active) {
    let f = 0, r = 0;
    if (keys.KeyW || keys.ArrowUp) f += 1; if (keys.KeyS || keys.ArrowDown) f -= 1;
    if (keys.KeyD || keys.ArrowRight) r += 1; if (keys.KeyA || keys.ArrowLeft) r -= 1;
    if (p.car) { if (drive.gas) f += 1; if (drive.brake) f -= 1; if (drive.left) r -= 1; if (drive.right) r += 1; }
    else { f -= stickV.y; r += stickV.x; }
    f = Math.max(-1, Math.min(1, f)); r = Math.max(-1, Math.min(1, r));
    const sprint = keys.ShiftLeft || keys.ShiftRight || sprintTouch;
    if (cine.holdsInput) { f = 0; r = 0; attackQueued = false; }
    steerIn = p.car ? r : 0;
    if (p.car) session.input(r, f, drive.drift || keys.Space, dt);
    else {
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
      let mx = fx * f + rx * r, mz = fz * f + rz * r; const l = Math.hypot(mx, mz); if (l > 1) { mx /= l; mz /= l; }
      session.input(mx, mz, sprint, dt);
    }
    if (attackQueued) { if (attackBuf <= 0) attackBuf = 0.5; const before = p.cd; session.send({ type: 'attack', target: lockId }); if (p.cd > before && p.weapon !== 'pistol' && p.weapon !== 'shotgun') sfx.whoosh(); attackBuf = p.cd > before ? 0 : Math.max(0, attackBuf - dt); attackQueued = attackBuf > 0; } // one buffered tap comes out when the swing is legal
    session.tick(dt);
    for (const ev of session.drainEvents()) showMsg(ev.text);
    handleFx(session.drainFx());
    if (s.over) {
      clearSave(); // a finished game is not resumed
      // the rooftop plays before the end card when the city is yours
      { const showEnd = () => $('end').classList.remove('hidden'); if (s.over === 'win' && !params.has('novideo')) story.play('victory', { touch: isTouch }).then(showEnd); else showEnd(); }
      $('endTitle').textContent = s.over === 'win' ? 'YOU RUN THIS CITY' : 'PUSHED OUT';
      $('endText').textContent = s.over === 'win' ? `The rival crews are gone. Rep ${Math.round(s.crews.player.rep)}. Time ${Math.round(s.t)}s.` : 'Your last block fell. The rivals own the city for now.';
      stream.renderStats($('endStats'), s);
    }
  }
  const hour = updateDay();
  // rain: dimmer sun, a closer grey haze, a hazier sky, wet streets (the materials are set inside update)
  { const wx = weather.update(s, p, rdt, night), rn = wx.rain;
    sun.intensity *= 1 - 0.55 * rn; hemi.intensity *= 1 + 0.2 * rn; scene.fog.far = fogFar * (1 - 0.32 * rn); scene.fog.color.lerp(fogRain, rn * 0.7); su.turbidity.value = 9 + 12 * rn;
    if (grade) grade.uniforms.uWet.value = wx.wet;
    if (wx.started && started) { stream.push('Rain moving in over the city', 'neutral'); moments.rain(s, p); radio.news('Rain over the city tonight. Slow down out there, or do not.'); }
    flare(sunDir.y, rn, rdt); }
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
    if (!g || g.userData.model !== look.model) { if (g) scene.remove(g); g = makeCharacter(look, SHADOWS && e.kind === 'player'); g.userData.model = look.model; g.position.set(e.x, 0.24, e.z); scene.add(g); charViz.set(e.id, g); }
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
    { const tb = g.userData.tumble;
      if (tb && !held) { tb.t += rdt; const k = Math.min(1, tb.t / tb.dur);
        if (k >= 1) { g.userData.tumble = null; g.rotation.x = 0; g.rotation.z = 0; }
        else { const sm = k * k * (3 - 2 * k), arc = Math.sin(k * Math.PI); g.position.y += tb.h * arc; g.rotation.x = tb.dir * (tb.turns * Math.PI * 2 * sm + tb.lean * arc); g.rotation.z = tb.turns ? 0 : tb.dir * tb.lean * 0.6 * arc; } } }
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
    // a dead car being cleared sinks into the street and is gone (state.js clearCar)
    if (c.clear != null) { const k = 1 - Math.max(0, c.clear) / CLEAR_TIME; g.position.y -= k * k * 2.2; g.userData.flares.visible = false; }
    // tire smoke and skid marks from the rear wheels while sliding
    if (c.skid && !c.wrecked && d2 < 70 * 70) {
      const sn = Math.sin(c.ry), cs = Math.cos(c.ry);
      for (const side of c.type === 'bike' ? [0] : [-1, 1]) {
        const back = c.type === 'bike' ? 0.7 : 1.35, wx = c.x - sn * back + cs * 0.75 * side, wz = c.z - cs * back - sn * 0.75 * side;
        skids.mark(c.id + side, wx, wz);
        if (Math.random() < (LOW ? 0.25 : 0.5)) smoke.emit(wx, 0.4, wz, false, false);
      }
      if (p.car === c.id) skidVol = Math.min(1, c.slip * 2 + 0.4);
    } else { skids.lift(c.id + -1); skids.lift(c.id + 1); skids.lift(c.id + 0); }
    // visible driver
    const occupied = (c.ai && !c.wrecked) || (c.cops && s.ents.some((e) => e.car === c.id));
    for (const ch of g.children) if (ch.userData.beam) ch.visible = ch.visible && (occupied || p.car === c.id); // parked cars keep their lights off
    if (!(occupied || p.car === c.id)) { g.userData.flares.visible = false; g.userData.tails.material.color && (g.userData.tails.visible = true); }
    const u = g.userData;
    // on a bike the rider is out in the open, so the player is drawn riding too (after the mount moment ends)
    const riding = u.bike && p.car === c.id && cine.active !== 'car' && p.hp > 0;
    const wantDriver = peopleReady && (riding || (occupied && d2 < DRIVER_DIST * DRIVER_DIST));
    if (wantDriver && !u.driver) {
      const look = riding ? lookFor(p, CREWS) : c.cops ? lookFor({ kind: 'cop', look: 1 }, CREWS) : lookFor({ kind: 'ped', look: c.paint * 13 + c.id.length }, CREWS);
      if (modelReady(look.model)) {
        u.driver = makeCharacter(look, false);
        if (u.bike) { const S = (u.seatPose ||= { ...BIKE_SEAT, ...(u.rider || {}) }); u.driver.position.set(0, S.y, S.z); u.driver.rotation.set(S.lean, 0, 0); u.model.add(u.driver); } // on the model, so he leans with the bike
        else { u.driver.position.set(0.42, seatY(c, u), 0.15); u.driver.rotation.y = 0; g.add(u.driver); } // left seat: traffic keeps right (local +x is the car's left)
      }
    } else if (!wantDriver && u.driver) { u.driver.removeFromParent(); u.driver = null; }
    if (u.driver) { animate(u.driver, { hp: 1 }, rdt, true); if (u.bike) bikePose(u.driver, u.seatPose, u); }
    // a burning car: flames from the hood until it goes up, and for a few seconds on the wreck after
    if (u.charred && c.wreckT < 9) u.afterT = 1; else u.afterT = 0;
    if ((c.burn > 0 || u.afterT) && d2 < 90 * 90) { const hx = c.x + Math.sin(c.ry) * 1.5, hz = c.z + Math.cos(c.ry) * 1.5; parts.burst(hx, 1.1 + (c.y || 0), hz, LOW ? 1 : 2, 1.6, { color: Math.random() < 0.5 ? 0xff8a1a : 0xffd040, life: 0.45, g: -3, s: 0.16, up: 2 }); if (Math.random() < 0.3) smoke.emit(hx, 1.6, hz, true, true); }
    // damage smoke
    if (c.hp < c.max * 0.5 && Math.random() < (c.wrecked ? 0.5 : c.hp < c.max * 0.25 ? 0.3 : 0.12) * (LOW ? 0.6 : 1)) smoke.emit(c.x + Math.sin(c.ry) * 1.8, 1.2, c.z + Math.cos(c.ry) * 1.8, c.wrecked || c.hp < c.max * 0.25, c.wrecked);
    if (c.honk > 1.2 && c.honk - (u.lastHonk || 0) > 2) { u.lastHonk = c.honk; sfx.honk(Math.max(0, 1 - Math.sqrt(d2) / 40)); }
  }
  for (const [id, g] of carViz) if (!seenCars.has(id)) { scene.remove(g); carViz.delete(id); }
  if (blobs) blobs(p.x, p.z, night);
  // car entry and exit moments
  if (p.car !== prevCar) {
    const pg = charViz.get(p.id);
    if (p.car && p.hp > 0) cine.car('in', carViz.get(p.car), pg, pendingJack);
    else if (!p.car && prevCar && p.hp > 0 && !(p.downT > 0) && !cine.pausesSim) { const cg = carViz.get(prevCar); if (cg && pg && Math.hypot(cg.position.x - p.x, cg.position.z - p.z) < 4) cine.car('out', cg, pg); }
    prevCar = p.car; pendingJack = null;
  }
  // Unc briefing: starts as soon as both characters are drawn
  if (pendingBrief) {
    const pg = charViz.get(p.id), gv = contactFor(s), ug = gv && charViz.get(gv.id), M = MISSIONS[pendingBrief.idx] || {};
    const film = !params.has('novideo') && !pendingBrief.noFilm && BRIEF_CLIPS[pendingBrief.idx];
    // a filmed brief plays in place of the engine one; if the clip cannot play, the engine briefing runs instead
    if (film && !cine.active && !story.active) { const pb = pendingBrief; pendingBrief = null; story.play(film.name, { touch: isTouch, subs: film.subs }).then(() => { if (story.failed) pendingBrief = { ...pb, noFilm: true, wait: 1.5 }; else cine.card({ k: 'NEW JOB', t: pb.title, dur: 2.6 }); }); }
    else if (pg && ug && !cine.active) { cine.brief(pendingBrief.idx, ug, pg, M.intro, pendingBrief.title, M.brief); pendingBrief = null; }
    else if ((pendingBrief.wait -= rdt) <= 0) { showBig(pendingBrief.title.toUpperCase()); pendingBrief = null; }
  }
  if (wasDown && !(p.downT > 0)) cine.up();
  if (started) updateSpots(s, p, now);
  wasDown = p.downT > 0;
  smoke.update(rdt);
  sfx.setEngine(!!pcar, pcar ? pcar.v : 0);
  radio.setOn(started && !!pcar && !paused && !s.over && !pcar.wrecked && !(p.downT > 0));
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
  if (started && !cine.pausesSim && !story.active && scuffleT > 0 && (scuffleT -= rdt) <= 0) { const e = openingScuffle(s); if (e) { scufflerId = e.id; showMsg('A mugger is going for your bag.'); } }
  // Unc stands a short walk from spawn, so Bag Back can start while the mugger group is still up.
  // Advance past the fight and the talk step together, or "1/3 Stop the muggers" stays on screen.
  if ((onb.step === 0 || onb.step === 1) && (s.mission || s.missionIdx > 0)) onbAdvance(2);
  else if (onb.step === 0 && scuffleT <= 0 && scufflerId == null) onbAdvance(1);
  else if (onb.step === 0 && s.opening && s.opening.friends && !s.ents.some((e) => e.scuffler && e.hp > 0)) onbAdvance(1);
  if (onb.step === 2 && s.blocks.filter((b) => b.owner === 'player').length >= 2) onbAdvance(3);
  if (!!s.mission !== onbMission) { onbMission = !!s.mission; renderOnb(); }
  const tgt = missionTarget(s) || (started ? alertTarget(s) : null) || (started ? guideTarget(s, p) : null) || (started ? streetTarget(s) : null);
  if (started && !streetReadySent && (onb.step < 0 || onb.step > 2)) { streetReadySent = true; session.send({ type: 'streetReady' }); }
  beacon.visible = !!tgt && tgt.label !== 'LOCAL'; if (tgt) { beacon.position.set(tgt.x, 60, tgt.z); beacon.material.opacity = 0.28 + Math.sin(now / 250) * 0.1; }
  const isPkg = s.mission && (s.mission.kind === 'fetch' || s.mission.kind === 'hook' || s.mission.kind === 'collect') && s.mission.stage === 0 && tgt;
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
  const onBike = !!pcar && pcar.type === 'bike'; // a bike is a third the size of a car, so the chase camera sits closer and lower
  const dist = (pcar ? (onBike ? 6.0 : 8.8) + Math.abs(pcar.v) * 0.09 : 5.2) + downK * 2.5, h = (pcar ? (onBike ? 2.0 : 2.5) : 1.7) + downK * 3;
  let dd = dist;
  for (; dd > 1.5; dd -= 0.5) { const cx = pv.x + Math.sin(yaw) * Math.cos(pitch) * dd, cy = h + Math.sin(pitch) * dd, cz = pv.z + Math.cos(yaw) * Math.cos(pitch) * dd; if (!insideBuilding(cx, cz, 0.3, cy)) break; }
  tmp.set(pv.x + Math.sin(yaw) * Math.cos(pitch) * dd, Math.max(0.6, h + Math.sin(pitch) * dd), pv.z + Math.cos(yaw) * Math.cos(pitch) * dd);
  if (!camInit) { camPos.copy(tmp); camInit = true; }
  camPos.lerp(tmp, Math.min(1, rdt * 12));
  camera.position.copy(camPos);
  look.set(pv.x - Math.sin(yaw) * 1.2 + Math.cos(yaw) * (pcar ? 0 : 0.6), h, pv.z - Math.cos(yaw) * 1.2 - Math.sin(yaw) * (pcar ? 0 : 0.6));
  camera.lookAt(look);
  // the chase camera banks a little into a turn and with a slide, and the frame streaks at speed
  { const v = pcar ? Math.abs(pcar.v) : 0, bankT = pcar && !cine.active ? -steerIn * Math.min(1, v / 12) * 0.05 - Math.sign(steerIn || 1) * (pcar.slip || 0) * 0.02 : 0;
    bank += (bankT - bank) * Math.min(1, rdt * 5); camera.rotation.z += bank;
    const spT = pcar && !cine.active && !paused ? Math.max(0, Math.min(1, (v - 16) / 20)) : 0; speedU += (spT - speedU) * Math.min(1, rdt * 4); if (grade) grade.uniforms.uSpeed.value = speedU; }
  if (shake > 0) { shake = Math.max(0, shake - rdt * 2.2); camera.position.x += (Math.random() - 0.5) * shake * 0.5; camera.position.y += (Math.random() - 0.5) * shake * 0.5; camera.rotation.z += (Math.random() - 0.5) * shake * 0.05; }
  const cineCam = cine.update(rdt); if (cineCam) cine.blendCamera();
  moments.update(rdt, carViz); clips.update(rdt);
  $('bClip').classList.toggle('show', started && clips.on && isTouch);
  // the title is staged: he stands easy with nothing in his hands, whatever the save has him carrying
  if (!started && loaded) { buildTitleProps(); updateTitleProps(rdt, now); const pg = charViz.get(p.id); if (pg) { pg.userData.cineHold = true; pg.userData.cineAnim = 'Idle_Loop'; pg.userData.cineHolster = true; } if (pg) cine.titleCam(rdt, { player: pg.position, ry: pg.rotation.y, prop: titleCopCar ? titleCopCar.position : null, center: { x: 0, z: 0 } }); }
  if (!cine.active && pendingBig) { if (!document.getElementById('passCard').classList.contains('show')) showBig(pendingBig); pendingBig = null; }
  if (window.__camOv) { const o = window.__camOv; camera.position.set(o.x, o.y, o.z); camera.lookAt(o.lx, o.ly, o.lz); } // test hook for close-up shots
  if (camKick > 0) { camera.rotateX(camKick * 0.06); camKick = Math.max(0, camKick - rdt * 6); }
  fovKick = Math.max(0, fovKick - rdt * 20);
  const wantFov = 62 + (pcar ? Math.min(18, Math.abs(pcar.v) * 0.55) : 0) + fovKick;
  if (started && !cine.ownsFov) { camera.fov += (wantFov - camera.fov) * Math.min(1, rdt * 4); camera.updateProjectionMatrix(); }
  if (sun.castShadow) {
    // the shadowed square sits a little ahead of the camera and moves in whole shadow texels, so shadow edges do not crawl as you move
    camera.getWorldDirection(shF); shF.y = 0; shF.normalize();
    shZ.set(sunDir.x * 100, Math.max(15, sunDir.y * 100), sunDir.z * 100); const far = shZ.length(); shZ.divideScalar(far);
    shX.crossVectors(shUp, shZ).normalize(); shY.crossVectors(shZ, shX);
    shC.set(pv.x + shF.x * SH_R * 0.4, 0, pv.z + shF.z * SH_R * 0.4);
    const tx = (2 * SH_R) / SH_MAP, a = Math.round(shC.dot(shX) / tx) * tx, b = Math.round(shC.dot(shY) / tx) * tx, c = shC.dot(shZ);
    shC.set(0, 0, 0).addScaledVector(shX, a).addScaledVector(shY, b).addScaledVector(shZ, c);
    sun.target.position.copy(shC); sun.position.copy(shC).addScaledVector(shZ, far);
  }
  // sections show around the player, or around the camera while the opening flyover is far from them
  if (cine.active === 'open') city.update(camera.position.x, camera.position.z); else city.update(pv.x, pv.z);
  // HUD
  const cr = s.crews.player;
  $('cash').textContent = '$' + Math.floor(cr.cash).toLocaleString('en-US');
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
  $('turf').textContent = `Turf ${s.blocks.filter((b) => b.owner === 'player').length}/${s.blocks.length}` + (p.armor > 0 ? `  Armor ${Math.ceil(p.armor)}` : '');
  $('hpbar').style.width = (p.hp / p.max) * 100 + '%';
  $('clock').textContent = String(Math.floor(hour)).padStart(2, '0') + ':' + String(Math.floor((hour % 1) * 60)).padStart(2, '0');
  const wn = p.weapon.toUpperCase();
  $('wname').textContent = wn; const am = p.weapon === 'pistol' ? p.ammo : p.weapon === 'shotgun' ? p.shells : ''; $('ammo').textContent = am; $('bWeapon').textContent = wn + (am !== '' ? ' ' + am : '');
  // wanted stars: a new level must hold for 0.5 s before it shows (no flicker at a threshold);
  // with no heat the row is a faint outline, so dark empty stars never read as earned ones
  const stRaw = stars(p); if (stRaw !== starWant) { starWant = stRaw; starHold = 0.5; } else if (starHold > 0 && (starHold -= rdt) <= 0) starShown = starWant;
  if (stRaw > starShown && starShown === 0) starShown = stRaw; // going wanted shows at once
  const st = starShown, si = $('stars').querySelectorAll('i'); for (let i = 0; i < 5; i++) si[i].classList.toggle('on', i < st);
  if (started) { stream.wanted(st); if (st > starsPrev) moments.wanted(st, s, p); } starsPrev = st;
  $('stars').classList.toggle('none', st === 0);
  $('stars').classList.toggle('flash', st > 0 && p.calmT < 3 && Math.floor(now / 400) % 2 === 0);
  document.body.classList.toggle('driving', !!p.car);
  const ctxName = context(); const ctxBike = ctxName === 'EXIT' ? !!s.cars.find((c) => c.id === p.car && c.type === 'bike') : ctxName === 'CAR' && (nearestCar(s, p, 5) || {}).type === 'bike';
  const cb = $('bCtx'); cb.classList.toggle('hidden', !ctxName); if (ctxName) cb.textContent = ctxName === 'UPGRADE' ? 'ARM' : ctxName;
  // desktop prompt for the E key, so walking up to Unc or a car says what E will do
  const pr = $('prompt'); const ptxt = ctxName === 'TALK' ? 'E  Talk to Unc' : ctxName === 'CAR' ? (ctxBike ? 'E  Get on' : 'E  Get in') : ctxName === 'EXIT' ? (ctxBike ? 'E  Get off' : 'E  Get out') : ctxName === 'DICE' ? 'E  Shoot dice' : ctxName === 'UPGRADE' ? `E  Arm guards ($${UPGRADE_COST})` : ctxName === 'BUILD' ? `E  Build up the hustle ($${BUILD_COST}, ${BUILD_BOOST}x income)` : '';
  if (pr.textContent !== ptxt) pr.textContent = ptxt; pr.classList.toggle('hidden', !ptxt || isTouch || !!cine.active || moments.cardShown);
  $('bAttack').textContent = p.weapon === 'pistol' || p.weapon === 'shotgun' ? 'SHOOT' : 'HIT';
  $('bFire').textContent = p.ammo > 0 ? 'FIRE ' + p.ammo : 'NO AMMO';
  const here = blockAt(s, p.x, p.z);
  let raidB = null;
  for (const b of s.blocks) if (b.owner === 'player' && b.raid && b.raid.eta > 0 && (!raidB || b.raid.eta < raidB.raid.eta)) raidB = b;
  const capEl = $('capture');
  if (here && here.capBy) { capEl.textContent = `${CREWS[here.capBy].name} taking ${here.hustle}: ${Math.round((here.capT / CAPTURE_TIME) * 100)}%`; capEl.classList.remove('raid'); }
  else if (raidB) { capEl.textContent = `${CREWS[raidB.raid.crew].name} raid on ${raidB.hustle}: ${Math.ceil(raidB.raid.eta)}s`; capEl.classList.add('raid'); }
  else { capEl.textContent = ''; capEl.classList.remove('raid'); }
  const m = s.mission;
  $('mtitle').textContent = m ? m.title + ':' : s.side ? (s.side.kind === 'fare' ? 'Fare:' : s.side.kind === 'courier' ? 'Courier:' : 'Race:') : '';
  $('mtext').textContent = missionText(s) || sideText(s);
  $('mtimer').textContent = m && m.timer > 0 ? Math.ceil(m.timer) + 's' : '';
  if (started && here !== lastHere) { lastHere = here; if (here) { const gn = here.owner === 'player' ? guardsOf(s, here).length : 0; const guardNote = here.owner === 'player' ? `, ${gn} guard${gn === 1 ? '' : 's'}${here.upgraded ? ', armed' : ''}${here.built ? ', built up' : ''}${here.stash >= 1 ? `, $${Math.floor(here.stash)} stashed` : ''}` : ''; $('dtag').textContent = `${DISTRICTS[districtOf(here)]}: ${here.hustle}${guardNote}`; $('dtag').classList.add('show'); dtagT = 2.2; } }
  if (dtagT > 0 && (dtagT -= rdt) <= 0) $('dtag').classList.remove('show');
  let ri = 0;
  const callMark = s.calls && s.calls.active;
  for (const e of s.ents) {
    if (!(e.windup > 0) || e.hp <= 0 || ri >= tellRings.length) continue;
    const ring = tellRings[ri++];
    ring.visible = true; ring.position.set(e.x, 0.08, e.z);
    ring.material.color.setHex(e.tell === 'flank' ? 0x44ddff : e.tell === 'retreat' ? 0xffe14a : 0xff5530);
    ring.material.opacity = 0.55 + 0.35 * Math.min(1, (e.windup || 0) / 0.36);
    ring.scale.setScalar(0.85 + (1 - Math.min(1, (e.windup || 0) / 0.5)) * 0.5);
  }
  if (callMark && callMark.phase === 'offer' && ri < tellRings.length) {
    const ring = tellRings[ri++];
    ring.visible = true; ring.position.set(callMark.x, 0.08, callMark.z);
    ring.material.color.setHex(0xe8914a); ring.material.opacity = 0.75;
    ring.scale.setScalar(2.1 + Math.sin(now / 180) * 0.12);
  }
  for (; ri < tellRings.length; ri++) tellRings[ri].visible = false;
  for (let i = hitNums.length - 1; i >= 0; i--) {
    const h = hitNums[i]; h.t -= rdt; h.y += rdt * (h.slow ? 0.12 : 0.9);
    if (h.id) { const g = charViz.get(h.id); if (g) { h.x = g.position.x; h.z = g.position.z; } }
    if (h.t <= 0) { h.el.remove(); hitNums.splice(i, 1); continue; }
    hitProj.set(h.x, h.y, h.z).project(camera);
    if (hitProj.z > 1) { h.el.style.opacity = '0'; continue; }
    h.el.style.opacity = String(Math.max(0, Math.min(1, h.t * 2)));
    h.el.style.left = (hitProj.x * 0.5 + 0.5) * innerWidth + 'px';
    h.el.style.top = (-hitProj.y * 0.5 + 0.5) * innerHeight + 'px';
  }
  const callEl = $('street');
  if (!callMark || !started || cine.active) callEl.classList.add('hidden');
  else {
    callEl.classList.remove('hidden');
    const text = callMark.phase === 'offer' ? callMark.text : callMark.fightText;
    if ($('streetText').textContent !== text) $('streetText').textContent = text;
    $('streetBtns').style.display = callMark.phase === 'offer' ? 'flex' : 'none';
  }
  if (msgT > 0 && (msgT -= rdt) <= 0) $('msg').textContent = '';
  if (bigT > 0 && (bigT -= rdt) <= 0) $('big').classList.remove('show');
  stream.tick(s, rdt);
  layoutNotices();
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
  setGradeRes();
}
addEventListener('resize', fitCanvas);
// device emulation and rotation do not always fire resize, so also check the size every half second
setInterval(fitCanvas, 500);
window.__game = session; window.__dbg = { RAMPS, RACES, GARAGES, STASHES, radio, audio: sfx.audio, MISSIONS, contactFor, scene, carViz, charViz, camera, blockCenter, sceneSpot, Raycaster: THREE.Raycaster, down: () => debugDown(S()), weather, stream, moments, clips, story };
renderer.info.autoReset = false;
window.__perf = () => ({ frameMs: frameAvg, pixelRatio, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, chars: charViz.size, cars: carViz.size });
