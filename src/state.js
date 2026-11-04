// Pure game state and simulation. No rendering code lives here.
// Everything in `state` is plain JSON so it can be serialized, sent over a
// network, or run on an authoritative server later.

export const BLOCK = 40;       // block footprint
export const STREET = 18;      // street width
export const PITCH = BLOCK + STREET;
export const GRID = 3;
export const ZONE_R = 7;       // capture zone radius at block center
export const CAPTURE_TIME = 6; // seconds to hold a zone
export const RECRUIT_COST = 100;
export const LANE = 3;       // lane offset from street centerline

const HUSTLES = ['Corner Store Deals', 'Car Wash', 'Sneaker Resale', 'Bootleg DVDs', 'Barbershop Bets', 'Chop Shop', 'Pawn Counter', 'Food Truck', 'Card Games'];

export const CREWS = {
  neutral: { name: 'Locals', color: 0x888888, css: '#999', shirt: 0x6b6458, pants: 0x3a3a40 },
  player: { name: 'You', color: 0x33cc66, css: '#3c6', shirt: 0x2f8f4a, pants: 0x23262e },
  reds: { name: 'Red Kings', color: 0xdd3333, css: '#d33', shirt: 0xa82222, pants: 0x1a1a1a },
  blues: { name: 'Blue Hand', color: 0x3377ee, css: '#37e', shirt: 0x2850a8, pants: 0x3a4a66 },
  golds: { name: 'Gold Line', color: 0xe0b020, css: '#eb2', shirt: 0xc89a18, pants: 0x4a3a28 },
};

export function blockCenter(b) { return { x: (b.gx - 1) * PITCH, z: (b.gz - 1) * PITCH }; }
const lineCoord = (i) => (i - GRID / 2) * PITCH; // street centerlines, i = 0..GRID

export function createState(seed = 1) {
  const s = { t: 0, nextId: 1, seed, blocks: [], crews: {}, ents: [], events: [], fx: [], over: null };
  const starts = { '0,0': 'player', '2,0': 'reds', '0,2': 'blues', '2,2': 'golds' };
  for (let gz = 0; gz < GRID; gz++) for (let gx = 0; gx < GRID; gx++) {
    const id = gz * GRID + gx;
    s.blocks.push({ id, gx, gz, owner: starts[gx + ',' + gz] || 'neutral', hustle: HUSTLES[id], rate: 3 + ((id * 7) % 4), capBy: null, capT: 0 });
  }
  for (const k of Object.keys(CREWS)) s.crews[k] = { id: k, cash: k === 'player' ? 150 : 120, rep: 0, aiT: 10 + Math.random() * 10, alive: true };
  for (const b of s.blocks) {
    const n = b.owner === 'player' ? 1 : b.owner === 'neutral' ? 2 : 3;
    for (let i = 0; i < n; i++) spawnUnit(s, b.owner, 'defender', b.id);
  }
  const c = blockCenter(s.blocks[0]);
  s.ents.push({ id: s.nextId++, kind: 'player', crew: 'player', x: c.x + BLOCK / 2 + 3, z: c.z, ry: 0, hp: 100, max: 100, cd: 0, hitT: 0, car: null, combo: 0, kx: 0, kz: 0 });
  s.cars = [];
  const colors = [0x8a1c1c, 0x1c3a6a, 0x2a2a2a, 0x6a6a20, 0xdddddd, 0x3a5a3a, 0x7a7a80, 0x101418];
  // parked cars along curbs
  const parked = [[PITCH / 2 + 5.6, -12, 0], [-PITCH / 2 - 5.6, 20, Math.PI], [12, PITCH / 2 + 5.6, Math.PI / 2], [-20, -PITCH / 2 - 5.6, -Math.PI / 2], [PITCH * 1.5 - 5.6, 6, 0], [-PITCH / 2 + 5.6, -20, 0]];
  parked.forEach(([x, z, ry], i) => s.cars.push(makeCar('car' + i, x, z, ry, colors[i % colors.length], false)));
  // traffic
  const tr = [[1, 0, 0], [2, 1, 1], [0, 2, 2], [3, 1, 3], [1, 3, 1]];
  tr.forEach(([i, j, d], k) => {
    const dir = DIRS[d]; const ry = Math.atan2(dir[0], dir[1]);
    const off = (i === GRID || j === GRID ? -10 : 10);
    const x = d % 2 === 0 ? lineCoord(i) : lineCoord(i) + off, z = d % 2 === 0 ? lineCoord(j) + off : lineCoord(j);
    const car = makeCar('tr' + k, x, z, ry, colors[(k + 3) % colors.length], true); laneSnap(car); s.cars.push(car);
  });
  return s;
}
const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]];
function makeCar(id, x, z, ry, color, ai) { return { id, x, z, ry, v: 0, steer: 0, driver: null, color, ai, cruise: ai ? 8 + Math.random() * 3 : 0 }; }

export function spawnUnit(s, crew, role, blockId, x, z) {
  const b = s.blocks[blockId];
  const c = blockCenter(b);
  const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 6;
  const e = { id: s.nextId++, kind: 'npc', crew, role, home: blockId, target: blockId, x: x ?? c.x + Math.cos(a) * r, z: z ?? c.z + Math.sin(a) * r, ry: 0, hp: 60, max: 60, cd: 0, hitT: 0, combo: 0, kx: 0, kz: 0, stun: 0 };
  s.ents.push(e);
  return e;
}

export const player = (s) => s.ents.find((e) => e.kind === 'player');
export function blockAt(s, x, z) {
  for (const b of s.blocks) { const c = blockCenter(b); if (Math.abs(x - c.x) < PITCH / 2 && Math.abs(z - c.z) < PITCH / 2) return b; }
  return null;
}
function neighbors(s, b) { return s.blocks.filter((o) => Math.abs(o.gx - b.gx) + Math.abs(o.gz - b.gz) === 1); }
const hostile = (a, b) => a.crew !== b.crew;
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
function log(s, text) { s.events.push({ t: s.t, text }); }

// Actions are the only way a player changes state. A network layer can
// forward these to a host instead of applying them locally.
export function applyAction(s, playerId, a) {
  const p = s.ents.find((e) => e.id === playerId);
  if (!p || p.hp <= 0) return;
  if (a.type === 'attack' && p.cd <= 0 && !p.car) {
    p.cd = 0.42; p.swing = 0.32; p.combo = (p.combo + 1) % 2;
    let best = null, bs = -1;
    const fx = Math.sin(p.ry), fz = Math.cos(p.ry);
    for (const e of s.ents) if (e !== p && hostile(e, p) && e.hp > 0) {
      const d = Math.sqrt(dist2(e, p)); if (d > 2.8) continue;
      const dot = d > 0.01 ? ((e.x - p.x) * fx + (e.z - p.z) * fz) / d : 1;
      const sc = dot * 2 - d * 0.5 + (d < 1.4 ? 1 : 0);
      if (dot > -0.2 && sc > bs) { bs = sc; best = e; }
    }
    if (best) { p.ry = Math.atan2(best.x - p.x, best.z - p.z); damage(s, best, p.combo ? 28 : 20, p, p.combo === 1); }
  } else if (a.type === 'recruit') {
    const cr = s.crews[p.crew];
    const n = s.ents.filter((e) => e.crew === p.crew && e.role === 'follower' && e.hp > 0).length;
    if (cr.cash >= RECRUIT_COST && n < 8) {
      cr.cash -= RECRUIT_COST;
      const u = spawnUnit(s, p.crew, 'follower', 0, p.x + 2, p.z + 2); u.leader = p.id;
      log(s, 'New recruit joined your crew.');
    } else log(s, n >= 8 ? 'Crew is full (8 max).' : 'Need $' + RECRUIT_COST + ' to recruit.');
  } else if (a.type === 'car') {
    if (p.car) { const c = s.cars.find((c) => c.id === p.car); c.driver = null; c.v = 0; p.car = null; p.x = c.x - Math.cos(c.ry) * 2.6; p.z = c.z + Math.sin(c.ry) * 2.6; }
    else {
      let c = null, bd = 25;
      for (const k of s.cars) if (!k.driver) { const d = dist2(k, p); if (d < bd) { bd = d; c = k; } }
      if (c) { if (c.ai) log(s, 'You jacked a ride.'); c.driver = p.id; c.ai = false; p.car = c.id; } else log(s, 'No car close enough.');
    }
  }
}

function damage(s, e, amt, src, heavy) {
  if (e.hp <= 0) return;
  e.hp -= amt; e.hitT = 0.3; e.stun = heavy ? 0.6 : 0.35;
  if (src) {
    const d = Math.sqrt(dist2(e, src)) || 1, k = heavy ? 7 : 4;
    e.kx = (e.x - src.x) / d * k; e.kz = (e.z - src.z) / d * k;
  }
  s.fx.push({ type: 'hit', x: e.x, z: e.z, by: src ? src.id : 0, to: e.id, heavy: !!heavy, ko: e.hp <= 0 });
  if (e.hp <= 0) {
    e.hp = 0;
    if (src && s.crews[src.crew]) s.crews[src.crew].rep += e.kind === 'player' ? 10 : 2;
    if (e.kind === 'player') onPlayerDown(s, e);
  }
}

function onPlayerDown(s, p) {
  const own = s.blocks.filter((b) => b.owner === p.crew);
  if (!own.length) return;
  const cr = s.crews[p.crew]; const lost = Math.floor(cr.cash * 0.3); cr.cash -= lost;
  log(s, 'You got knocked out and lost $' + lost + '. Back at your turf.');
  const c = blockCenter(own[0]);
  if (p.car) applyAction(s, p.id, { type: 'car' });
  p.x = c.x + BLOCK / 2 + 3; p.z = c.z; p.hp = p.max; p.kx = p.kz = 0;
}

// Simple bicycle-model car physics shared by players and traffic.
function driveCar(s, c, throttle, steerIn, dt, driverEnt) {
  c.steer += (steerIn * 0.55 - c.steer) * Math.min(1, dt * 6);
  const braking = throttle * c.v < 0;
  c.v += throttle * (braking ? 30 : c.v < 0 ? 10 : 16) * dt;
  c.v *= 1 - (Math.abs(throttle) < 0.05 ? 0.9 : 0.25) * dt;
  c.v = Math.max(-8, Math.min(28, c.v));
  c.ry -= (c.v / 2.7) * Math.tan(c.steer) * dt;
  c.x += Math.sin(c.ry) * c.v * dt; c.z += Math.cos(c.ry) * c.v * dt;
  clampWorld(c); collideBuildings(c, 1.6, () => { c.v *= -0.25; });
  for (const o of s.cars) if (o !== c && dist2(o, c) < 9) {
    const d = Math.sqrt(dist2(o, c)) || 1, push = (3 - d) / 2;
    c.x -= (o.x - c.x) / d * push; c.z -= (o.z - c.z) / d * push; o.x += (o.x - c.x) / d * push; o.z += (o.z - c.z) / d * push;
    if (Math.abs(c.v) > 4) s.fx.push({ type: 'crash', x: c.x, z: c.z, by: driverEnt ? driverEnt.id : 0 });
    c.v *= 0.5;
  }
  if (Math.abs(c.v) > 6) for (const e of s.ents) if (e !== driverEnt && e.hp > 0 && !e.car && dist2(e, c) < 5) {
    if (!driverEnt || hostile(e, driverEnt)) damage(s, e, 30, c, true);
    else { const d = Math.sqrt(dist2(e, c)) || 1; e.kx = (e.x - c.x) / d * 6; e.kz = (e.z - c.z) / d * 6; }
    c.v *= 0.6;
  }
}

// Player movement intent: { mx, mz } in world space, sprint flag.
// In a car, mx is steer and mz is throttle.
export function movePlayer(s, p, mx, mz, sprint, dt) {
  if (p.hp <= 0) return;
  if (p.car) {
    const c = s.cars.find((c) => c.id === p.car);
    driveCar(s, c, mz, mx, dt, p);
    p.x = c.x; p.z = c.z; p.ry = c.ry; p.moving = 0;
    return;
  }
  const sp = sprint ? 9 : 5;
  const l = Math.hypot(mx, mz);
  if (l > 0.05 && !(p.swing > 0.1)) {
    p.x += mx * sp * dt; p.z += mz * sp * dt;
    const want = Math.atan2(mx, mz); let d = want - p.ry; d = Math.atan2(Math.sin(d), Math.cos(d)); p.ry += d * Math.min(1, dt * 14);
    p.moving = Math.min(l, 1) * sp / 5;
  } else p.moving = 0;
  clampWorld(p); collideBuildings(p, 0.5);
}

const HALF = (GRID * PITCH) / 2 + 6;
function clampWorld(o) { o.x = Math.max(-HALF, Math.min(HALF, o.x)); o.z = Math.max(-HALF, Math.min(HALF, o.z)); }

// Buildings: each block has 4 corner buildings leaving a plus-shaped open lot
// (the alleys and courtyard) through the middle.
export function buildingsFor(b) {
  const c = blockCenter(b), h = BLOCK / 2, w = 13, out = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const height = 8 + ((b.id * 13 + sx * 3 + sz * 5 + 20) % 4) * 3.5;
    out.push({ x: c.x + sx * (h - w / 2), z: c.z + sz * (h - w / 2), w, d: w, h: height, sx, sz });
  }
  return out;
}
let _bcache = null;
export function allBuildings() { if (!_bcache) { _bcache = []; for (let i = 0; i < GRID * GRID; i++) _bcache.push(...buildingsFor({ id: i, gx: i % GRID, gz: Math.floor(i / GRID) })); } return _bcache; }
function collideBuildings(o, r, onHit) {
  for (const k of allBuildings()) {
    const dx = o.x - k.x, dz = o.z - k.z, hx = k.w / 2 + r, hz = k.d / 2 + r;
    if (Math.abs(dx) < hx && Math.abs(dz) < hz) {
      const px = hx - Math.abs(dx), pz = hz - Math.abs(dz);
      if (px < pz) o.x += Math.sign(dx) * px; else o.z += Math.sign(dz) * pz;
      onHit && onHit();
    }
  }
}
function clearLine(a, b) {
  const d = Math.sqrt(dist2(a, b)), n = Math.ceil(d / 1.5);
  for (let i = 1; i < n; i++) {
    const x = a.x + (b.x - a.x) * i / n, z = a.z + (b.z - a.z) * i / n;
    for (const k of allBuildings()) if (Math.abs(x - k.x) < k.w / 2 + 0.6 && Math.abs(z - k.z) < k.d / 2 + 0.6) return false;
  }
  return true;
}

// ---------- street navigation graph ----------
// Nodes: intersections, street midpoints next to each block, block centers.
let NAV = null;
function nav() {
  if (NAV) return NAV;
  const nodes = [], edges = [], key = new Map();
  const add = (x, z) => { const k = Math.round(x) + ',' + Math.round(z); if (!key.has(k)) { key.set(k, nodes.length); nodes.push({ x, z }); edges.push([]); } return key.get(k); };
  const link = (a, b) => { const d = Math.sqrt(dist2(nodes[a], nodes[b])); edges[a].push([b, d]); edges[b].push([a, d]); };
  for (let i = 0; i <= GRID; i++) for (let j = 0; j <= GRID; j++) add(lineCoord(i), lineCoord(j));
  for (let gz = 0; gz < GRID; gz++) for (let gx = 0; gx < GRID; gx++) {
    const c = { x: (gx - 1) * PITCH, z: (gz - 1) * PITCH }, ci = add(c.x, c.z);
    for (const [dx, dz] of DIRS) {
      const m = add(c.x + dx * PITCH / 2, c.z + dz * PITCH / 2); link(ci, m);
      const ox = dz !== 0 ? PITCH / 2 : 0, oz = dx !== 0 ? PITCH / 2 : 0;
      link(m, add(nodes[m].x - ox, nodes[m].z - oz)); link(m, add(nodes[m].x + ox, nodes[m].z + oz));
    }
  }
  return (NAV = { nodes, edges });
}
function nearestNode(p) {
  const { nodes } = nav(); let best = 0, bd = Infinity;
  for (let i = 0; i < nodes.length; i++) { const d = dist2(nodes[i], p); if (d < bd && (d < 4 || clearLine(p, nodes[i]))) { bd = d; best = i; } }
  return best;
}
function findPath(a, b) {
  const { nodes, edges } = nav(), s = nearestNode(a), t = nearestNode(b);
  const dist = new Array(nodes.length).fill(Infinity), prev = new Array(nodes.length).fill(-1), done = new Set();
  dist[s] = 0;
  while (true) {
    let u = -1, ud = Infinity;
    for (let i = 0; i < nodes.length; i++) if (!done.has(i) && dist[i] < ud) { ud = dist[i]; u = i; }
    if (u < 0 || u === t) break;
    done.add(u);
    for (const [v, w] of edges[u]) if (ud + w < dist[v]) { dist[v] = ud + w; prev[v] = u; }
  }
  const path = []; for (let u = t; u >= 0; u = prev[u]) path.unshift({ x: nodes[u].x, z: nodes[u].z });
  path.push({ x: b.x, z: b.z });
  return path;
}
// Returns the next point an npc should walk to on its way to `goal`.
function steerPoint(e, goal) {
  if (dist2(e, goal) < 36 || clearLine(e, goal)) { e.path = null; return goal; }
  if (!e.path || e.pathT <= 0 || dist2(e.path[e.path.length - 1], goal) > 25) { e.path = findPath(e, goal); e.pathT = 2; }
  while (e.path.length > 1 && (dist2(e, e.path[0]) < 4 || (e.path.length > 1 && clearLine(e, e.path[1]) && dist2(e, e.path[0]) < 100))) e.path.shift();
  return e.path[0];
}

// ---------- traffic ----------
function laneSnap(c) {
  const dx = Math.round(Math.sin(c.ry)), dz = Math.round(Math.cos(c.ry));
  if (dx === 0) c.x = nearestLine(c.x) - dz * LANE; else c.z = nearestLine(c.z) + dx * LANE;
}
const nearestLine = (v) => lineCoord(Math.max(0, Math.min(GRID, Math.round(v / PITCH + GRID / 2))));
function trafficStep(s, c, dt) {
  const dx = Math.round(Math.sin(c.ry)), dz = Math.round(Math.cos(c.ry));
  // obstacle ahead?
  let blocked = false;
  for (const o of [...s.cars, ...s.ents]) {
    if (o === c || o.hp === 0) continue;
    const rx = o.x - c.x, rz = o.z - c.z, ahead = rx * dx + rz * dz, side = Math.abs(rx * dz - rz * dx);
    if (ahead > 0 && ahead < 9 && side < 1.9) { blocked = true; break; }
  }
  c.waitT = blocked ? (c.waitT || 0) + dt : 0;
  if (c.waitT > 3) { blocked = false; if (c.waitT > 4.5) c.waitT = 0; }
  const target = blocked ? 0 : c.cruise;
  c.v += Math.sign(target - c.v) * Math.min(Math.abs(target - c.v), (blocked ? 20 : 6) * dt);
  c.x += dx * c.v * dt; c.z += dz * c.v * dt;
  c.steer *= 0.9;
  // reached an intersection: maybe turn
  const along = dx !== 0 ? c.x : c.z;
  const iCoord = nearestLine(along);
  const passed = (along - iCoord) * (dx || dz);
  if (c.lastI !== iCoord && passed > -LANE - 0.5 && passed < 0) {
    c.lastI = iCoord;
    const opts = [];
    for (let d = 0; d < 4; d++) {
      const [ndx, ndz] = DIRS[d];
      if (ndx === -dx && ndz === -dz) continue;
      const ix = dx !== 0 ? iCoord : nearestLine(c.x), iz = dx !== 0 ? nearestLine(c.z) : iCoord;
      const nx = ix + ndx * PITCH, nz = iz + ndz * PITCH;
      if (Math.abs(nx) > HALF || Math.abs(nz) > HALF) continue;
      opts.push({ d, ix, iz });
    }
    if (opts.length) {
      const straight = opts.find((o) => DIRS[o.d][0] === dx && DIRS[o.d][1] === dz);
      const o = straight && Math.random() < 0.5 ? straight : opts[Math.floor(Math.random() * opts.length)];
      const [ndx, ndz] = DIRS[o.d];
      if (ndx !== dx || ndz !== dz) {
        c.ry = Math.atan2(ndx, ndz);
        c.x = o.ix; c.z = o.iz; laneSnap(c);
        c.lastI = ndx !== 0 ? nearestLine(c.x) : nearestLine(c.z);
      }
    }
  }
  if (Math.abs(c.x) > HALF + 1 || Math.abs(c.z) > HALF + 1) { c.ry += Math.PI; c.x = Math.max(-HALF, Math.min(HALF, c.x)); c.z = Math.max(-HALF, Math.min(HALF, c.z)); laneSnap(c); }
  if (c.v > 4) for (const e of s.ents) if (e.hp > 0 && !e.car && dist2(e, c) < 4) { const d = Math.sqrt(dist2(e, c)) || 1; e.kx = (e.x - c.x) / d * 6; e.kz = (e.z - c.z) / d * 6; }
}

export function step(s, dt) {
  if (s.over) return;
  s.t += dt;
  // economy
  for (const b of s.blocks) if (s.crews[b.owner] && b.owner !== 'neutral') s.crews[b.owner].cash += b.rate * dt;
  for (const c of s.cars) if (c.ai && !c.driver) trafficStep(s, c, dt); else if (!c.driver && c.v) { c.v *= 1 - 3 * dt; if (Math.abs(c.v) < 0.2) c.v = 0; c.x += Math.sin(c.ry) * c.v * dt; c.z += Math.cos(c.ry) * c.v * dt; }
  // npc behaviour
  for (const e of s.ents) {
    if (e.cd > 0) e.cd -= dt; if (e.hitT > 0) e.hitT -= dt; if (e.swing > 0) e.swing -= dt; if (e.stun > 0) e.stun -= dt; if (e.pathT > 0) e.pathT -= dt;
    if (e.kx || e.kz) { e.x += e.kx * dt; e.z += e.kz * dt; e.kx *= 1 - 6 * dt; e.kz *= 1 - 6 * dt; if (Math.abs(e.kx) + Math.abs(e.kz) < 0.1) e.kx = e.kz = 0; collideBuildings(e, 0.5); clampWorld(e); }
    if (e.kind !== 'npc' || e.hp <= 0) continue;
    e.moving = 0;
    if (e.stun > 0) continue;
    let foe = null, fd = 12 ** 2;
    for (const o of s.ents) if (o.hp > 0 && hostile(o, e) && !(o.kind === 'player' && o.car)) { const d = dist2(o, e); if (d < fd) { fd = d; foe = o; } }
    let goal;
    if (e.role === 'follower') {
      const l = s.ents.find((x) => x.id === e.leader);
      goal = foe && dist2(foe, l || e) < 100 ? foe : l;
      if (goal === l && l && dist2(l, e) < 9) goal = null;
    } else {
      const c = blockCenter(s.blocks[e.target]);
      if (foe && (e.role === 'attacker' || dist2(foe, c) < (PITCH / 2) ** 2)) goal = foe;
      else if (dist2(e, c) > 16) goal = c;
    }
    if (goal) {
      const d = Math.sqrt(dist2(goal, e));
      if (goal === foe && d < 1.9) {
        e.ry = Math.atan2(goal.x - e.x, goal.z - e.z);
        if (e.cd <= 0) { e.cd = 1.0 + Math.random() * 0.6; e.swing = 0.32; e.combo = (e.combo + 1) % 2; damage(s, foe, 8, e, false); }
      } else if (d > 0.5) {
        const wp = steerPoint(e, goal);
        const dx = wp.x - e.x, dz = wp.z - e.z, dd = Math.hypot(dx, dz) || 1;
        const sp = e.role === 'follower' && d > 8 ? 7 : 4;
        // separation so crews do not stack on one spot
        let sx = 0, sz = 0;
        for (const o of s.ents) if (o !== e && o.hp > 0) { const q = dist2(o, e); if (q < 1 && q > 0) { sx += (e.x - o.x) / q; sz += (e.z - o.z) / q; } }
        e.x += (dx / dd * sp + sx * 0.6) * dt; e.z += (dz / dd * sp + sz * 0.6) * dt;
        const want = Math.atan2(dx, dz); let r = want - e.ry; r = Math.atan2(Math.sin(r), Math.cos(r)); e.ry += r * Math.min(1, dt * 10);
        e.moving = sp / 5;
        collideBuildings(e, 0.5);
      }
    }
  }
  // remove downed npcs after a short delay
  for (const e of s.ents) if (e.kind === 'npc' && e.hp <= 0) e.downT = (e.downT || 0) + dt;
  s.ents = s.ents.filter((e) => !(e.downT > 5));
  // capture
  for (const b of s.blocks) {
    const c = blockCenter(b);
    const inZone = {}; let defenders = 0;
    for (const e of s.ents) if (e.hp > 0) {
      if (e.crew === b.owner && dist2(e, c) < (PITCH / 2) ** 2) defenders++;
      if (e.crew !== b.owner && dist2(e, c) < ZONE_R ** 2) inZone[e.crew] = (inZone[e.crew] || 0) + 1;
    }
    const claimers = Object.keys(inZone);
    if (defenders === 0 && claimers.length === 1) {
      const k = claimers[0];
      if (b.capBy !== k) { b.capBy = k; b.capT = 0; }
      b.capT += dt;
      if (b.capT >= CAPTURE_TIME) {
        const prev = b.owner; b.owner = k; b.capBy = null; b.capT = 0;
        s.crews[k].rep += 25;
        spawnUnit(s, k, 'defender', b.id);
        for (const e of s.ents) if (e.crew === k && e.role === 'attacker' && e.target === b.id) e.role = 'defender';
        log(s, `${CREWS[k].name} took ${b.hustle} block from ${CREWS[prev].name}.`);
        s.fx.push({ type: 'capture', block: b.id, crew: k });
      }
    } else if (b.capT > 0) { b.capT = Math.max(0, b.capT - dt * 2); if (b.capT === 0) b.capBy = null; }
  }
  // AI crews
  for (const k of ['reds', 'blues', 'golds']) aiThink(s, k, dt);
  // neutral blocks slowly refill defenders
  for (const b of s.blocks) if (b.owner === 'neutral' && Math.random() < dt / 40 && s.ents.filter((e) => e.crew === 'neutral' && e.home === b.id && e.hp > 0).length < 2) spawnUnit(s, 'neutral', 'defender', b.id);
  // end conditions
  const pt = s.blocks.filter((b) => b.owner === 'player').length;
  if (pt === s.blocks.length) s.over = 'win';
  else if (pt === 0) s.over = 'lose';
}

function aiThink(s, k, dt) {
  const cr = s.crews[k];
  const own = s.blocks.filter((b) => b.owner === k);
  cr.alive = own.length > 0;
  if (!cr.alive) return;
  cr.aiT -= dt;
  if (cr.aiT > 0) return;
  cr.aiT = 8 + Math.random() * 6;
  const cap = Math.min(16, 4 + own.length * 3);
  let units = s.ents.filter((e) => e.crew === k && e.hp > 0).length;
  if (units >= cap) return;
  for (const b of own) {
    const d = s.ents.filter((e) => e.crew === k && e.target === b.id && e.role === 'defender' && e.hp > 0).length;
    if (d < 2 && cr.cash >= 60 && units < cap) { cr.cash -= 60; units++; spawnUnit(s, k, 'defender', b.id); }
  }
  if (cr.cash >= 150 && Math.random() < 0.7) {
    const options = [];
    for (const b of own) for (const n of neighbors(s, b)) if (n.owner !== k) options.push({ from: b, to: n });
    if (!options.length) return;
    const score = (o) => s.ents.filter((e) => e.crew === o.to.owner && e.hp > 0 && dist2(e, blockCenter(o.to)) < (PITCH / 2) ** 2).length + (o.to.owner === 'player' ? -0.5 : 0) + Math.random();
    options.sort((a, b) => score(a) - score(b));
    const o = options[0];
    const n = Math.min(4, cap - units, Math.floor(cr.cash / 50));
    if (n < 2) return;
    cr.cash -= n * 50;
    for (let i = 0; i < n; i++) { const u = spawnUnit(s, k, 'attacker', o.from.id); u.target = o.to.id; }
    log(s, `${CREWS[k].name} are moving on ${o.to.hustle} block${o.to.owner === 'player' ? ' (yours!)' : ''}.`);
  }
}

// Snapshot helpers for a future network layer.
export const serialize = (s) => JSON.stringify(s, (k, v) => (k === 'path' ? undefined : v));
export const deserialize = (j) => JSON.parse(j);
