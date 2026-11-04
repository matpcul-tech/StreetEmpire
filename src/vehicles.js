// Procedural car models: extruded body profile, glass cabin, spinning and
// steering wheels, emissive head and tail lights with a soft beam.
import * as THREE from 'three';

let shared = null;
function sharedParts() {
  if (shared) return shared;
  const body = new THREE.Shape();
  [[-2.25, 0.38], [2.25, 0.38], [2.32, 0.72], [2.15, 0.98], [0.95, 1.05], [-1.95, 1.05], [-2.3, 0.9]].forEach(([x, y], i) => (i ? body.lineTo(x, y) : body.moveTo(x, y)));
  const bodyGeo = new THREE.ExtrudeGeometry(body, { depth: 1.84, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2, curveSegments: 2 });
  bodyGeo.translate(0, 0, -0.92); bodyGeo.rotateY(-Math.PI / 2);
  const cab = new THREE.Shape();
  [[0.9, 1.04], [0.25, 1.55], [-1.25, 1.57], [-1.9, 1.04]].forEach(([x, y], i) => (i ? cab.lineTo(x, y) : cab.moveTo(x, y)));
  const cabGeo = new THREE.ExtrudeGeometry(cab, { depth: 1.6, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 1 });
  cabGeo.translate(0, 0, -0.8); cabGeo.rotateY(-Math.PI / 2);
  const tire = new THREE.CylinderGeometry(0.37, 0.37, 0.28, 14); tire.rotateZ(Math.PI / 2);
  const rim = new THREE.CylinderGeometry(0.22, 0.22, 0.3, 8); rim.rotateZ(Math.PI / 2);
  const beam = new THREE.ConeGeometry(2.2, 9, 12, 1, true); beam.translate(0, -4.5, 0); beam.rotateX(-Math.PI / 2);
  const bc = document.createElement('canvas'); bc.width = 4; bc.height = 64; const g = bc.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, 'rgba(255,240,200,0.9)'); gr.addColorStop(1, 'rgba(255,240,200,0)'); g.fillStyle = gr; g.fillRect(0, 0, 4, 64);
  const beamTex = new THREE.CanvasTexture(bc);
  shared = {
    bodyGeo, cabGeo, tire, rim, beam,
    glass: new THREE.MeshStandardMaterial({ color: 0x0c1218, roughness: 0.1, metalness: 0.9 }),
    tireMat: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 }),
    rimMat: new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.3, metalness: 0.9 }),
    head: new THREE.MeshBasicMaterial({ color: 0xfff4d0, toneMapped: false }),
    tail: new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false }),
    beamMat: new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    lightGeo: new THREE.BoxGeometry(0.42, 0.16, 0.06),
    bumper: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.7 }),
  };
  return shared;
}

export function makeCar(color, LOW) {
  const P = sharedParts();
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.65 });
  const body = new THREE.Mesh(P.bodyGeo, paint), cab = new THREE.Mesh(P.cabGeo, P.glass);
  body.castShadow = !LOW; g.add(body, cab);
  for (const z of [2.33, -2.33]) { const bm = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.22, 0.12), P.bumper); bm.position.set(0, 0.5, z); g.add(bm); }
  const wheels = [];
  for (const [x, z] of [[-0.88, 1.38], [0.88, 1.38], [-0.88, -1.42], [0.88, -1.42]]) {
    const pivot = new THREE.Group(); pivot.position.set(x, 0.37, z);
    const spin = new THREE.Group(); spin.add(new THREE.Mesh(P.tire, P.tireMat), new THREE.Mesh(P.rim, P.rimMat));
    pivot.add(spin); g.add(pivot); wheels.push({ pivot, spin, front: z > 0 });
  }
  for (const x of [-0.65, 0.65]) {
    const h = new THREE.Mesh(P.lightGeo, P.head); h.position.set(x, 0.78, 2.34); g.add(h);
    const t = new THREE.Mesh(P.lightGeo, P.tail); t.position.set(x, 0.8, -2.34); g.add(t);
    const bm = new THREE.Mesh(P.beam, P.beamMat); bm.position.set(x, 0.75, 2.4); bm.rotation.x = 0.06; g.add(bm);
  }
  g.userData = { wheels, spinA: 0 };
  return g;
}

export function updateCar(g, c, dt) {
  const u = g.userData;
  u.spinA += (c.v * dt) / 0.37;
  for (const w of u.wheels) { w.spin.rotation.x = u.spinA; if (w.front) w.pivot.rotation.y = -c.steer; }
  // smooth visual heading for traffic turns
  let d = c.ry - g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
  g.rotation.y += Math.abs(d) > 0.01 ? d * Math.min(1, dt * (c.ai ? 6 : 30)) : d;
  g.position.x += (c.x - g.position.x) * Math.min(1, dt * (c.ai ? 8 : 40));
  g.position.z += (c.z - g.position.z) * Math.min(1, dt * (c.ai ? 8 : 40));
  // slight body roll when steering
  g.children[0].rotation.z = -c.steer * Math.min(1, Math.abs(c.v) / 20) * 0.15;
}
