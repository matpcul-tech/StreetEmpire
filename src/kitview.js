// Build kit viewer (kit.html): previews every installed kit model exactly as
// the game prepares it (same loader, scale, yaw and wheel pivots), with the
// front arrow, the space it gets in game and its phone cost.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadKit, kitInfo, CAR_SLOTS, BUILDING_SLOTS, CHAR_SLOTS, cloneKitCar, placeKitBuilding } from './kit.js';
import { loadPeople, makeCharacter, prepKit } from './chars.js';
import { applyGrip, gripAmount } from './grip.js';

const BASE = import.meta.env.BASE_URL;
const $ = (id) => document.getElementById(id);
const view = $('view');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
view.prepend(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x050b16);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const sun = new THREE.DirectionalLight(0xfff0dd, 2.2); sun.position.set(6, 10, 8); scene.add(sun, new THREE.HemisphereLight(0x9ab4d8, 0x2a2018, 0.6));
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400);
const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.autoRotate = true; controls.autoRotateSpeed = 1.2;
const grid = new THREE.GridHelper(40, 40, 0x1c2c48, 0x12203a); scene.add(grid);
const holder = new THREE.Group(); scene.add(holder);
let current = null, wheels = [], mixer = null, shown = null;
// characters play the game's own clips, retargeted, so the preview is what the game shows
const ANIMS = [['Idle', 'Idle_Loop'], ['Walk', 'Walk_Loop'], ['Run', 'Sprint_Loop'], ['Punch', 'Punch_Cross'], ['Bat', 'Sword_Attack'], ['Pistol', 'Pistol_Idle_Loop'], ['Drive', 'Driving_Loop'], ['Talk', 'Idle_Talking_Loop'], ['Hit', 'Hit_Head'], ['KO', 'Death01']];
const peopleLoad = loadPeople(BASE, null).catch((e) => console.warn('people', e));

function resize() { const w = view.clientWidth, h = view.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

// the space a model gets: a 4.4 m car lane footprint or the 13 m building lot, plus a gold front arrow on +z
function guides(kind, len) {
  const g = new THREE.Group();
  const w = kind === 'car' ? 2.0 : kind === 'character' ? 0.8 : 13, d = kind === 'car' ? len : kind === 'character' ? 0.8 : 13;
  const pts = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2], [-w / 2, -d / 2]].map(([x, z]) => new THREE.Vector3(x, 0.02, z));
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x00d4b8 })));
  const a = kind === 'car' ? 0.6 : kind === 'character' ? 0.15 : 2.2, arrow = new THREE.Shape(); arrow.moveTo(0, a * 1.4); arrow.lineTo(a, 0); arrow.lineTo(a * 0.35, 0); arrow.lineTo(a * 0.35, -a); arrow.lineTo(-a * 0.35, -a); arrow.lineTo(-a * 0.35, 0); arrow.lineTo(-a, 0);
  const am = new THREE.Mesh(new THREE.ShapeGeometry(arrow), new THREE.MeshBasicMaterial({ color: 0xd4a843, side: THREE.DoubleSide }));
  am.rotation.x = Math.PI / 2; am.position.set(0, 0.03, d / 2 + a * 1.4); g.add(am);
  return g;
}

function stat(label, value) { return `<div class="stat"><b>${value}</b><span>${label}</span></div>`; }

async function show(kind, slot, entry) {
  holder.clear(); wheels = []; mixer = null; shown = null; $('anims').classList.remove('show');
  if (kind === 'character') return showCharacter(slot, entry);
  document.querySelectorAll('.slot').forEach((b) => b.classList.toggle('on', b.dataset.key === kind + slot + (entry?.spec.file || '')));
  $('hint').style.display = 'none';
  const obj = kind === 'car' ? cloneKitCar(entry, 0x6a2420) : { model: placeKitBuilding(entry), wheels: [] };
  holder.add(obj.model, guides(kind, entry.spec.length || 4.4)); wheels = obj.wheels; current = { kind };
  const box = new THREE.Box3().setFromObject(obj.model), size = box.getSize(new THREE.Vector3());
  let tris = 0, meshes = 0; const mats = new Set();
  obj.model.traverse((o) => { if (!o.isMesh) return; meshes++; [].concat(o.material).forEach((m) => mats.add(m)); const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; });
  const r = Math.max(size.x, size.y, size.z);
  camera.position.set(r * 1.1, r * 0.7, r * 1.5); controls.target.set(0, size.y * 0.4, 0); controls.update();
  let bytes = '';
  try { const h = await fetch(`${BASE}models/kit/${entry.spec.file}`, { method: 'HEAD' }); const n = +h.headers.get('content-length'); if (n) bytes = (n / 1e6).toFixed(2) + ' MB'; } catch (e) { /* size unknown */ }
  $('stats').innerHTML = stat('triangles', Math.round(tris).toLocaleString()) + stat('draw calls', meshes) + stat('size in game', `${size.x.toFixed(1)} x ${size.y.toFixed(1)} x ${size.z.toFixed(1)} m`) + stat('file', bytes || 'n/a') + stat('yaw', (entry.spec.yaw || 0) + '°') + (kind === 'car' ? stat('spinning wheels', wheels.length) : '');
  const notes = [];
  if (kind === 'car' && !wheels.length) notes.push(['bad', 'No separate wheels found: the car drives but the wheels do not spin. Name wheel parts wheel, tire or rim.']);
  if (kind === 'car' && !entry.paint.length) notes.push(['', 'No paint material found: every copy keeps the model color. Name the body material paint or body to get colors.']);
  if (tris > 45000) notes.push(['bad', 'Heavy for phones. Re-import, or pick a lighter model.']);
  if (meshes > 40) notes.push(['bad', `${meshes} draw calls per copy. Under 25 keeps phones smooth.`]);
  if (entry.spec.credit) notes.push(['', 'Credit: ' + entry.spec.credit]); else notes.push(['', 'No credit recorded. CC BY models need one: upload a .txt with the same name.']);
  $('notes').innerHTML = notes.map(([c, t]) => `<li class="${c}">${t}</li>`).join('');
}

async function showCharacter(slot, entry) {
  document.querySelectorAll('.slot').forEach((b) => b.classList.toggle('on', b.dataset.key === 'character' + slot + entry.spec.file));
  $('hint').style.display = 'none';
  if (innerWidth < 860) view.scrollIntoView({ behavior: 'smooth', block: 'start' }); // phones: the preview sits above the lists
  await peopleLoad;
  const P = prepKit(entry), notes = [];
  if (!P) { $('stats').innerHTML = ''; $('notes').innerHTML = `<li class="bad">This model cannot play the game animations (see the browser console). The game keeps the painted body for ${slot}.</li>`; return; }
  const g = makeCharacter({ kitT: entry }, false), u = g.userData; mixer = u.mixer; shown = g;
  holder.add(g, guides('character', 1));
  const box = new THREE.Box3().setFromObject(g, true), size = box.getSize(new THREE.Vector3());
  camera.position.set(1.6, 1.4, 3.4); controls.target.set(0, 0.95, 0); controls.update();
  const bar = $('anims'); bar.innerHTML = ''; bar.classList.add('show');
  for (const [label, clip] of ANIMS) {
    if (!u.act[clip]) continue;
    const b = document.createElement('button'); b.textContent = label;
    b.onclick = () => { bar.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); for (const a of Object.values(u.act)) a.stop(); u.boardClip = clip; u.boardWeapon = clip === 'Sword_Attack' ? 'bat' : clip.startsWith('Pistol') ? 'pistol' : null; u.bat.visible = u.boardWeapon === 'bat'; u.gun.visible = u.boardWeapon === 'pistol'; const a = u.act[clip]; a.reset(); a.setLoop(THREE.LoopRepeat, Infinity); a.clampWhenFinished = false; a.play(); };
    bar.append(b);
  }
  bar.querySelector('button')?.click();
  let tris = 0, bones = 0; g.traverse((o) => { if (o.isSkinnedMesh) { const gg = o.geometry; tris += (gg.index ? gg.index.count : gg.attributes.position.count) / 3; } if (o.isBone) bones++; });
  let bytes = '';
  try { const h = await fetch(`${BASE}models/kit/${entry.spec.file}`, { method: 'HEAD' }); const n = +h.headers.get('content-length'); if (n) bytes = (n / 1e6).toFixed(2) + ' MB'; } catch (e) { /* size unknown */ }
  $('stats').innerHTML = stat('triangles', Math.round(tris).toLocaleString()) + stat('height in game', size.y.toFixed(2) + ' m') + stat('bones', bones) + stat('file', bytes || 'n/a') + stat('yaw', (entry.spec.yaw || 0) + '°');
  if (P.missing.length) notes.push(['bad', 'Bones not found, these parts stay still: ' + P.missing.join(', ')]);
  if (tris > 15000) notes.push(['bad', 'Over 15k triangles: heavy when a whole crew is on screen.']);
  notes.push(['', 'Facing away from the gold arrow? Upload again with @yaw180.']);
  if (entry.spec.credit) notes.push(['', 'Credit: ' + entry.spec.credit]);
  $('notes').innerHTML = notes.map(([c, t]) => `<li class="${c}">${t}</li>`).join('');
}

function list() {
  const K = kitInfo();
  const fill = (el, kind, slots) => {
    el.innerHTML = '';
    for (const slot of slots) {
      const entries = kind === 'car' ? (K.cars[slot] ? [K.cars[slot]] : []) : kind === 'character' ? K.characters[slot] || [] : K.buildings[slot] || [];
      if (!entries.length) { const b = document.createElement('div'); b.className = 'slot empty'; b.innerHTML = `<span>${slot} <small>built-in</small></span><span class="tag">EMPTY</span>`; el.append(b); continue; }
      for (const e of entries) {
        const b = document.createElement('button'); b.className = 'slot'; b.dataset.key = kind + slot + e.spec.file;
        b.innerHTML = `<span>${slot} <small>${e.spec.file.split('/').pop()}</small></span><span class="tag">INSTALLED</span>`;
        b.onclick = () => show(kind, slot, e); el.append(b);
      }
    }
  };
  fill($('cars'), 'car', CAR_SLOTS); fill($('buildings'), 'building', BUILDING_SLOTS); fill($('characters'), 'character', CHAR_SLOTS);
  const first = document.querySelector('button.slot'); if (first) first.click();
}

loadKit(BASE).then(list);
let last = performance.now(), spin = 0;
renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; spin += dt * 4;
  for (const w of wheels) w.node.rotation.x = spin;
  if (mixer) mixer.update(dt);
  if (shown && shown.userData.grip) applyGrip(shown.userData.root, shown.userData.grip, gripAmount(shown.userData.boardClip, shown.userData.boardWeapon));
  controls.update(); renderer.render(scene, camera);
});
