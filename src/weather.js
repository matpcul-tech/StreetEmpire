// Weather (v0.13): rain that rolls in over the city now and then.
// The schedule comes from the simulation clock and seed, so a continued save gets the same weather it left
// and the sim itself does not change (grip, tests and multiplayer rules stay as they are). Rain is streaks
// around the camera in one draw call, wet streets (asphalt, sidewalks and lots go dark and glossy, so lamps,
// headlights and the low sun glint off them), a closer grey haze, a dimmer sun, splashes near the player and
// rain noise. ?rain forces it on, ?noweather and ?pin (review shots) keep it dry.
import * as THREE from 'three';

const PERIOD = 240; // seconds per weather slot
const RAIN_ODDS = 0.2; // share of slots that rain
const RAMP = 12; // seconds for rain to build or clear
const DRY_FIRST = 2; // the first two slots are dry, so the tutorial and the opening stay clean

function slotHash(slot, seed) { let h = (slot * 374761393 + (seed | 0) * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
// 0..1 how hard it rains at sim time t
export function rainAt(t, seed) {
  const slot = Math.floor(t / PERIOD);
  if (slot < DRY_FIRST || slotHash(slot, seed) >= RAIN_ODDS) return 0;
  const u = t - slot * PERIOD;
  return Math.min(1, u / RAMP, (PERIOD - u) / RAMP);
}

export function createWeather({ scene, camera, LOW, POTATO, mats, parts, sfx, force, off }) {
  const N = POTATO ? 0 : LOW ? 360 : 800;
  const geo = new THREE.BoxGeometry(0.028, 0.7, 0.028);
  const mat = new THREE.MeshBasicMaterial({ color: 0xd8dce8, transparent: true, opacity: 0, depthWrite: false, fog: true });
  const streaks = N ? new THREE.InstancedMesh(geo, mat, N) : null;
  const BOX = { w: 36, h: 22, d: 36 };
  const pts = [];
  if (streaks) {
    streaks.instanceMatrix.setUsage(THREE.DynamicDrawUsage); streaks.frustumCulled = false; streaks.renderOrder = 2; streaks.count = 0; scene.add(streaks);
    for (let i = 0; i < N; i++) pts.push({ x: (Math.random() - 0.5) * BOX.w, y: Math.random() * BOX.h, z: (Math.random() - 0.5) * BOX.d, s: 0.8 + Math.random() * 0.5 });
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.08), pos = new THREE.Vector3(), sc = new THREE.Vector3();
  // dry values of the wet materials, to lerp from
  const dry = mats.map((m) => ({ m, rough: m.roughness, color: m.color.clone() }));
  let rain = 0, wet = 0, splashT = 0, announced = false;
  const api = {
    get rain() { return rain; }, get wet() { return wet; },
    // called once a frame after the day light is set; returns rain 0..1 for the feed and the grade
    update(s, p, rdt, night) {
      const want = off ? 0 : force ? 1 : rainAt(s.t || 0, s.seed || 0);
      rain += (want - rain) * Math.min(1, rdt * 0.5);
      // the street stays wet for a while after the rain stops
      wet = Math.max(rain, wet - rdt / 70);
      const started = rain > 0.2 && !announced; if (rain < 0.05) announced = false; if (started) announced = true;
      for (const d of dry) { d.m.roughness = d.rough * (1 - 0.62 * wet); d.m.color.copy(d.color).multiplyScalar(1 - 0.38 * wet); }
      if (streaks) {
        const n = Math.round(N * rain); streaks.count = n; mat.opacity = 0.3 + 0.12 * night;
        if (n) {
          const cx = camera.position.x, cz = camera.position.z, fall = rdt * 15;
          for (let i = 0; i < n; i++) {
            const r = pts[i]; r.y -= fall * r.s; r.x += rdt * 1.6; if (r.y < 0) { r.y += BOX.h; r.x = (Math.random() - 0.5) * BOX.w; r.z = (Math.random() - 0.5) * BOX.d; }
            if (r.x > BOX.w / 2) r.x -= BOX.w;
            pos.set(cx + r.x, r.y, cz + r.z); sc.set(1, r.s, 1);
            streaks.setMatrixAt(i, m4.compose(pos, q, sc));
          }
          streaks.instanceMatrix.needsUpdate = true;
        }
      }
      // splashes: small grey hops on the ground around the player
      if (rain > 0.1 && parts && (splashT -= rdt) <= 0) {
        splashT = LOW ? 0.09 : 0.045;
        const a = Math.random() * 6.283, r = 1 + Math.random() * (LOW ? 7 : 10);
        parts.burst(p.x + Math.sin(a) * r, 0.08, p.z + Math.cos(a) * r, 2, 0.9, { color: 0xc8ccd6, life: 0.22, g: 7, s: 0.035, up: 1.6 });
      }
      if (sfx && sfx.setRain) sfx.setRain(rain);
      return { rain, wet, started };
    },
  };
  return api;
}
