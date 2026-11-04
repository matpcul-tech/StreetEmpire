// Pure game state and simulation. No rendering code lives here.
// Everything in `state` is plain JSON so it can be serialized, sent over a
// network, or run on an authoritative server later.

export const BLOCK = 40;       // block footprint
export const STREET = 14;      // street width
export const PITCH = BLOCK + STREET;
export const GRID = 3;
export const ZONE_R = 7;       // capture zone radius at block center
export const CAPTURE_TIME = 6; // seconds to hold a zone
export const RECRUIT_COST = 100;

const HUSTLES = ['Corner Store Deals', 'Car Wash', 'Sneaker Resale', 'Bootleg DVDs', 'Barbershop Bets', 'Chop Shop', 'Pawn Counter', 'Food Truck', 'Card Games'];

export const CREWS = {
  neutral: { name: 'Locals', color: 0x888888, css: '#888' },
  player: { name: 'You', color: 0x33cc66, css: '#3c6' },
  reds: { name: 'Red Kings', color: 0xdd3333, css: '#d33' },
  blues: { name: 'Blue Hand', color: 0x3377ee, css: '#37e' },
  golds: { name: 'Gold Line', color: 0xe0b020, css: '#eb2' },
};

export function blockCenter(b) { return { x: (b.gx - 1) * PITCH, z: (b.gz - 1) * PITCH }; }

export function createState(seed = 1) {
  const s = { t: 0, nextId: 1, seed, blocks: [], crews: {}, ents: [], events: [], over: null };
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
  s.ents.push({ id: s.nextId++, kind: 'player', crew: 'player', x: c.x + BLOCK / 2 + 3, z: c.z, ry: 0, hp: 100, max: 100, cd: 0, hitT: 0, car: null });
  s.cars = [];
  const carSpots = [[PITCH / 2, -10], [-PITCH / 2, 20], [10, PITCH / 2], [-20, -PITCH / 2], [PITCH * 1.5, 0]];
  carSpots.forEach(([x, z], i) => s.cars.push({ id: 'car' + i, x, z, ry: i % 2 ? 0 : Math.PI / 2, v: 0, driver: null, color: [0x8a1c1c, 0x1c3a6a, 0x2a2a2a, 0x6a6a20, 0xdddddd][i] }));
  return s;
}

export function spawnUnit(s, crew, role, blockId, x, z) {
  const b = s.blocks[blockId];
  const c = blockCenter(b);
  const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 6;
  const e = { id: s.nextId++, kind: 'npc', crew, role, home: blockId, target: blockId, x: x ?? c.x + Math.cos(a) * r, z: z ?? c.z + Math.sin(a) * r, ry: 0, hp: 60, max: 60, cd: 0, hitT: 0 };
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
    p.cd = 0.45; p.swing = 0.25;
    let best = null, bd = 2.6 ** 2;
    for (const e of s.ents) if (e !== p && hostile(e, p) && e.hp > 0) {
      const d = dist2(e, p); if (d < bd) { bd = d; best = e; }
    }
    if (best) damage(s, best, 22, p);
  } else if (a.type === 'recruit') {
    const cr = s.crews[p.crew];
    const n = s.ents.filter((e) => e.crew === p.crew && e.role === 'follower' && e.hp > 0).length;
    if (cr.cash >= RECRUIT_COST && n < 8) {
      cr.cash -= RECRUIT_COST;
      const u = spawnUnit(s, p.crew, 'follower', 0, p.x + 2, p.z + 2); u.leader = p.id;
      log(s, 'New recruit joined your crew.');
    } else log(s, n >= 8 ? 'Crew is full (8 max).' : 'Need $' + RECRUIT_COST + ' to recruit.');
  } else if (a.type === 'car') {
    if (p.car) { const c = s.cars.find((c) => c.id === p.car); c.driver = null; c.v = 0; p.car = null; p.x = c.x + Math.cos(c.ry) * 2.5; p.z = c.z - Math.sin(c.ry) * 2.5; }
    else {
      const c = s.cars.find((c) => !c.driver && dist2(c, p) < 16);
      if (c) { c.driver = p.id; p.car = c.id; } else log(s, 'No car close enough.');
    }
  }
}

function damage(s, e, amt, src) {
  e.hp -= amt; e.hitT = 0.2;
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
  p.x = c.x + BLOCK / 2 + 3; p.z = c.z; p.hp = p.max;
}

// Player movement intent: { mx, mz } in world space, sprint flag.
export function movePlayer(s, p, mx, mz, sprint, dt) {
  if (p.hp <= 0) return;
  if (p.car) {
    const c = s.cars.find((c) => c.id === p.car);
    // mx: steer, mz: throttle in car mode
    c.v += mz * 22 * dt; c.v *= 1 - 1.2 * dt; c.v = Math.max(-8, Math.min(26, c.v));
    if (Math.abs(c.v) > 0.5) c.ry -= mx * 1.8 * dt * Math.sign(c.v);
    c.x += Math.sin(c.ry) * c.v * dt; c.z += Math.cos(c.ry) * c.v * dt;
    clampWorld(c); collideBuildings(c, 1.6, () => { c.v *= -0.3; });
    p.x = c.x; p.z = c.z; p.ry = c.ry;
    if (Math.abs(c.v) > 6) for (const e of s.ents) if (e !== p && e.hp > 0 && dist2(e, c) < 4) {
      if (hostile(e, p)) damage(s, e, 30, p);
      const d = Math.sqrt(dist2(e, c)) || 1; e.x += (e.x - c.x) / d * 3; e.z += (e.z - c.z) / d * 3; c.v *= 0.6;
    }
    return;
  }
  const sp = sprint ? 9 : 5;
  const l = Math.hypot(mx, mz);
  if (l > 0.05) { p.x += mx * sp * dt; p.z += mz * sp * dt; p.ry = Math.atan2(mx, mz); p.moving = Math.min(l, 1) * (sprint ? 1.6 : 1); } else p.moving = 0;
  clampWorld(p); collideBuildings(p, 0.5);
}

const HALF = (GRID * PITCH) / 2 + 6;
function clampWorld(o) { o.x = Math.max(-HALF, Math.min(HALF, o.x)); o.z = Math.max(-HALF, Math.min(HALF, o.z)); }

// Buildings: each block has 4 corner buildings leaving a plus-shaped open lot.
export function buildingsFor(b) {
  const c = blockCenter(b), h = BLOCK / 2, w = 12, out = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const height = 6 + ((b.id * 13 + sx * 3 + sz * 5 + 20) % 4) * 3;
    out.push({ x: c.x + sx * (h - w / 2), z: c.z + sz * (h - w / 2), w, d: w, h: height });
  }
  return out;
}
let _bcache = null;
function allBuildings() { if (!_bcache) { _bcache = []; for (let i = 0; i < GRID * GRID; i++) _bcache.push(...buildingsFor({ id: i, gx: i % GRID, gz: Math.floor(i / GRID) })); } return _bcache; }
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

export function step(s, dt) {
  if (s.over) return;
  s.t += dt;
  // economy
  for (const b of s.blocks) if (s.crews[b.owner] && b.owner !== 'neutral') s.crews[b.owner].cash += b.rate * dt;
  // npc behaviour
  for (const e of s.ents) {
    if (e.cd > 0) e.cd -= dt; if (e.hitT > 0) e.hitT -= dt; if (e.swing > 0) e.swing -= dt;
    if (e.kind !== 'npc' || e.hp <= 0) continue;
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
    e.moving = 0;
    if (goal) {
      const dx = goal.x - e.x, dz = goal.z - e.z, d = Math.hypot(dx, dz);
      e.ry = Math.atan2(dx, dz);
      if (goal === foe && d < 1.9) {
        if (e.cd <= 0) { e.cd = 0.9 + Math.random() * 0.5; e.swing = 0.25; damage(s, foe, 8, e); }
      } else if (d > 0.5) {
        const sp = e.role === 'follower' && d > 8 ? 7 : 4;
        e.x += dx / d * sp * dt; e.z += dz / d * sp * dt; e.moving = 1;
        collideBuildings(e, 0.5);
      }
    }
  }
  // remove downed npcs after a short delay
  for (const e of s.ents) if (e.kind === 'npc' && e.hp <= 0) e.downT = (e.downT || 0) + dt;
  s.ents = s.ents.filter((e) => !(e.downT > 3));
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
  // reinforce weak home blocks
  for (const b of own) {
    const d = s.ents.filter((e) => e.crew === k && e.target === b.id && e.role === 'defender' && e.hp > 0).length;
    if (d < 2 && cr.cash >= 60 && units < cap) { cr.cash -= 60; units++; spawnUnit(s, k, 'defender', b.id); }
  }
  // expand: pick a neighboring block not owned, prefer weakly defended
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
export const serialize = (s) => JSON.stringify(s);
export const deserialize = (j) => JSON.parse(j);
