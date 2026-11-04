// Pooled particles in one draw call: hit sparks, dust, crash sparks, shell
// casings. Plus muzzle flash sprites and skid marks (instanced decals).
import * as THREE from 'three';

export class Particles {
  constructor(scene, n) {
    this.n = n; this.i = 0;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ toneMapped: false }), n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.frustumCulled = false;
    this.mesh.setColorAt(0, new THREE.Color()); scene.add(this.mesh);
    this.p = Array.from({ length: n }, () => ({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, g: 0, s: 0.05, col: new THREE.Color(), bounce: 0, stretch: 0 }));
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.v = new THREE.Vector3(); this.sc = new THREE.Vector3(); this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let k = 0; k < n; k++) this.mesh.setMatrixAt(k, this.zero);
  }
  emit(x, y, z, vx, vy, vz, { life = 0.4, g = 9, s = 0.06, color = 0xffd070, bounce = 0, stretch = 0 } = {}) {
    const q = this.p[this.i = (this.i + 1) % this.n];
    Object.assign(q, { life, max: life, x, y, z, vx, vy, vz, g, s, bounce, stretch }); q.col.setHex(color);
  }
  burst(x, y, z, count, speed, opts = {}, dir = null) {
    for (let k = 0; k < count; k++) {
      let vx = (Math.random() - 0.5) * 2, vy = Math.random() * 1.2, vz = (Math.random() - 0.5) * 2;
      if (dir) { vx = dir[0] + vx * 0.6; vz = dir[1] + vz * 0.6; }
      const sp = speed * (0.5 + Math.random() * 0.7);
      this.emit(x, y, z, vx * sp, vy * sp * (opts.up ?? 1), vz * sp, { ...opts, life: (opts.life ?? 0.4) * (0.6 + Math.random() * 0.6) });
    }
  }
  update(dt) {
    let any = false;
    for (let k = 0; k < this.n; k++) {
      const q = this.p[k];
      if (q.life <= 0) continue;
      q.life -= dt;
      if (q.life <= 0) { this.mesh.setMatrixAt(k, this.zero); any = true; continue; }
      q.vy -= q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (q.y < 0.05) { q.y = 0.05; if (q.bounce) { q.vy = -q.vy * q.bounce; q.vx *= 0.6; q.vz *= 0.6; } else { q.vx *= 0.5; q.vz *= 0.5; q.vy = 0; } }
      const k2 = q.life / q.max, s = q.s * (q.stretch ? 1 : 0.4 + 0.6 * k2);
      this.v.set(q.x, q.y, q.z);
      if (q.stretch) { const sp = Math.hypot(q.vx, q.vy, q.vz) || 1; this.q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(q.vx / sp, q.vy / sp, q.vz / sp)); this.sc.set(s, s, s + sp * 0.025 * q.stretch); }
      else { this.q.identity(); this.sc.setScalar(s); }
      this.mesh.setMatrixAt(k, this.m.compose(this.v, this.q, this.sc));
      this.mesh.setColorAt(k, q.col); any = true;
    }
    if (any) { this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true; }
  }
}

export class Flashes {
  constructor(scene, n = 6) {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,250,220,1)'); gr.addColorStop(0.3, 'rgba(255,200,90,.9)'); gr.addColorStop(1, 'rgba(255,120,20,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    this.p = []; this.i = 0;
    for (let k = 0; k < n; k++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); s.visible = false; scene.add(s); this.p.push({ s, t: 0 }); }
  }
  flash(x, y, z, size) { const q = this.p[this.i = (this.i + 1) % this.p.length]; q.s.position.set(x, y, z); q.s.scale.setScalar(size); q.s.material.rotation = Math.random() * 6; q.s.visible = true; q.t = 0.06; }
  update(dt) { for (const q of this.p) if (q.t > 0) { q.t -= dt; if (q.t <= 0) q.s.visible = false; } }
}

export class Skids {
  constructor(scene, n = 400) {
    const geo = new THREE.PlaneGeometry(0.32, 1); geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0x0a0806, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), n);
    this.mesh.frustumCulled = false; this.n = n; this.i = 0; scene.add(this.mesh);
    const z = new THREE.Matrix4().makeScale(0, 0, 0); for (let k = 0; k < n; k++) this.mesh.setMatrixAt(k, z);
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.up = new THREE.Vector3(0, 1, 0); this.last = new Map();
  }
  // one mark segment from the previous point of this wheel to the new one
  mark(key, x, z) {
    const prev = this.last.get(key); this.last.set(key, { x, z, t: performance.now() });
    if (!prev || performance.now() - prev.t > 200) return;
    const dx = x - prev.x, dz = z - prev.z, l = Math.hypot(dx, dz); if (l < 0.05 || l > 3) return;
    this.q.setFromAxisAngle(this.up, Math.atan2(dx, dz));
    this.mesh.setMatrixAt(this.i = (this.i + 1) % this.n, this.m.compose(new THREE.Vector3((x + prev.x) / 2, 0.04, (z + prev.z) / 2), this.q, new THREE.Vector3(1, 1, l)));
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  lift(key) { this.last.delete(key); }
}
