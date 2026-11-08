// Side by side old painted body and the orange kit player, one game clip at a time.
// Served by the dev server: /tools/pose-board.html
import * as THREE from 'three';
import { loadPeople, makeCharacter, prepKit } from '../src/chars.js';
import { applyGrip, gripAmount } from '../src/grip.js';
import { loadKit, kitCharacter } from '../src/kit.js';

const CLIPS = ['Idle_Loop', 'Idle_Talking_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Punch_Jab', 'Punch_Cross', 'Sword_Attack', 'Pistol_Idle_Loop', 'Pistol_Shoot', 'Death01', 'Hit_Chest', 'Hit_Head', 'Roll', 'Jump_Start', 'Jump_Loop', 'Driving_Loop', 'Sitting_Idle_Loop'];
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x050b16);
scene.add(new THREE.HemisphereLight(0xc8d0e0, 0x2a2018, 1.1));
const sun = new THREE.DirectionalLight(0xfff0dd, 2.4); sun.position.set(3, 6, 4); scene.add(sun);
const grid = new THREE.GridHelper(8, 16, 0x1c2c48, 0x12203a); scene.add(grid);
const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.05, 40);
const PAINTED = {
  player: { model: 'ual', female: false, top: 1, topC: 0xd9741c, trim: 0x8a4410, legs: 0x2a3a5a, shoes: 0xe8e8e0, hair: 0, hairC: 0x111111, grit: 0.2, num: -1, beard: 1, skin: 0x7a4a30, pants: 0, acc: { cap: 0x1a1a1e, back: true, neck: 0xd9741c } },
  unc: { model: 'ual', female: false, top: 4, topC: 0x2a2a30, trim: 0x8a1a1a, pants: 1, legs: 0x2a2a30, shoes: 0x111111, hair: 0, hairC: 0x8a8a8a, grit: 0.08, num: -1, beard: 2, skin: 0x5a3825, acc: { hat: 0x1a1a1e } },
  reds: { model: 'ual', female: false, top: 2, topC: 0xa82222, trim: 0xf0f0f0, pants: 0, legs: 0x1a1a1a, shoes: 0xe8e8e0, hair: 0, hairC: 0x111111, grit: 0.35, num: 12, beard: 1, skin: 0x8d5a3b, acc: { rag: 0xa82222 } },
  blues: { model: 'ual', female: false, top: 1, topC: 0x2850a8, trim: 0xe8e8f0, pants: 0, legs: 0x3a4a66, shoes: 0x1a1a1a, hair: 0, hairC: 0x111111, grit: 0.35, num: -1, beard: 1, skin: 0x8d5a3b, acc: { cap: 0x1a1a1a, neck: 0x2850a8 } },
  golds: { model: 'ual', female: false, top: 6, topC: 0x8a5a2a, trim: 0x1a1a1a, pants: 0, legs: 0x3a3028, shoes: 0x9a7438, hair: 0, hairC: 0x111111, grit: 0.3, num: -1, beard: 0, skin: 0x8d5a3b, acc: { cap: 0x8a5a2a } },
};
const slot = new URLSearchParams(location.search).get('slot') || 'player';

await Promise.all([loadPeople(import.meta.env.BASE_URL), loadKit(import.meta.env.BASE_URL)]);
const kit = kitCharacter(slot, 0, 'm');
if (!prepKit(kit)) throw new Error(slot + ' did not retarget');
const neu = makeCharacter({ kitT: kit }, false);
const old = makeCharacter(PAINTED[slot] || PAINTED.player, false);
old.position.x = -1.15; neu.position.x = 1.15;
scene.add(old, neu);
const label = document.createElement('div');
label.style.cssText = 'position:fixed;left:12px;top:12px;color:#e8e4dd;font:16px sans-serif';
document.body.appendChild(label);

function pose(g, name, t, weapon) {
  const u = g.userData;
  for (const a of Object.values(u.act)) a.stop();
  const act = u.act[name];
  act.setLoop(THREE.LoopOnce, 1); act.clampWhenFinished = true; act.play();
  u.mixer.setTime(Math.min(t, act.getClip().duration * 0.98));
  if (u.grip) applyGrip(g, u.grip, gripAmount(name, weapon));
  u.gun.visible = weapon === 'pistol'; u.bat.visible = weapon === 'bat'; u.shotgun.visible = false; u.knux.visible = false;
}
function frameBoth(name, t, weapon) { pose(old, name, t, weapon); pose(neu, name, t, weapon); label.textContent = name + '  ' + t.toFixed(2) + 's    left: painted ' + slot + '    right: kit ' + slot; }

const view = {
  both() { camera.position.set(0, 1.15, 4.4); camera.lookAt(0, 0.9, 0); },
  neu() { camera.position.set(1.15, 1.15, 3.6); camera.lookAt(1.15, 0.95, 0); },
  arm() {
    neu.updateMatrixWorld(true);
    let hand = null; neu.traverse((o) => { if (o.name === 'mixamorigRightHand' || o.name === 'hand_r') hand = o; });
    const p = new THREE.Vector3(); hand.getWorldPosition(p);
    camera.position.set(p.x + 0.55, p.y + 0.15, p.z + 0.85); camera.lookAt(p);
  },
  seat() { camera.position.set(2.4, 0.85, 2.2); camera.lookAt(1.15, 0.7, 0); },
};
view.both();
let spin = null, last = performance.now();
function render() {
  const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (spin) {
    old.userData.mixer.update(dt); neu.userData.mixer.update(dt);
    if (neu.userData.grip) applyGrip(neu, neu.userData.grip, gripAmount(spin[0], spin[1]));
  }
  renderer.render(scene, camera); requestAnimationFrame(render);
}
render();
const box = new THREE.Box3().setFromObject(neu);
let body = null; neu.traverse((o) => { if (o.isSkinnedMesh) body = o; });
const mat = body && [].concat(body.material)[0];
window.__board = {
  slot, clips: CLIPS,
  info: { height: +box.getSize(new THREE.Vector3()).y.toFixed(3), bones: body ? body.skeleton.bones.length : 0, map: !!(mat && mat.map), normal: !!(mat && mat.normalMap), rough: !!(mat && mat.roughnessMap), key: mat && mat.customProgramCacheKey ? mat.customProgramCacheKey() : '' },
  neu,
  show(name, t = 0.4, mode = 'both', weapon = null) { spin = null; frameBoth(name, t, weapon); view[mode](); renderer.render(scene, camera); },
  play(name, weapon = null) {
    spin = [name, weapon];
    for (const g of [old, neu]) { const u = g.userData; for (const a of Object.values(u.act)) a.stop(); const act = u.act[name]; act.reset(); act.setLoop(THREE.LoopRepeat, Infinity); act.play(); u.gun.visible = weapon === 'pistol'; u.bat.visible = weapon === 'bat'; }
    label.textContent = name + ' playing    left: old painted body    right: orange player';
  },
};
window.__board.show('Idle_Loop', 0.4);
