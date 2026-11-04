// Pure game state and simulation. No rendering code lives here.
// Everything in `state` is plain JSON so it can be serialized, sent over a
// network, or run on an authoritative server later. Player intent only enters
// through applyAction() and movePlayer(), keyed by player entity id.

export const BLOCK = 40;       // block footprint
export const STREET = 18;      // street width
export const PITCH = BLOCK + STREET;
export const GRID = 5;         // 5 x 5 blocks
export const ZONE_R = 7;       // capture zone radius at block center
export const CAPTURE_TIME = 6; // seconds to hold a zone
export const RECRUIT_COST = 100;
export const LANE = 3;         // lane offset from street centerline
export const DAY_SECONDS = 480; // one full day and night
export const SIGNAL_CYCLE = 20;

const HUSTLES = ['Corner Store Deals', 'Car Wash', 'Sneaker Resale', 'Bootleg DVDs', 'Barbershop Bets', 'Chop Shop', 'Pawn Counter', 'Food Truck', 'Card Games',
  'Phone Repair', 'Laundromat', 'Tire Shop', 'Pool Hall', 'Record Store', 'Check Cashing', 'Taco Stand', 'Scrap Yard', 'Gym', 'Arcade', 'Night Club', 'Liquor Store', 'Dice Games', 'Bodega', 'Wing Spot', 'Tattoo Parlor'];
export const DISTRICTS = ['Eastside', 'Downtown', 'Harbor'];
export function districtOf(b) { const d = b.gx + b.gz; return d <= 2 ? 0 : d <= 5 ? 1 : 2; }

export const CREWS = {
  neutral: { name: 'Locals', color: 0x9a9a9a, css: '#aaa', model: 'Casual_Female', shirt: 0x6b6458, pants: 0x3a3a40 },
  player: { name: 'You', color: 0x33cc66, css: '#3c6', model: 'Casual_Male', shirt: 0x2f8f4a, pants: 0x2a3550 },
  reds: { name: 'Red Kings', color: 0xdd3333, css: '#e33', model: 'Casual2_Male', shirt: 0xa82222, pants: 0x1a1a1a },
  blues: { name: 'Blue Hand', color: 0x3377ee, css: '#48f', model: 'Casual3_Male', shirt: 0x2850a8, pants: 0x3a4a66 },
  golds: { name: 'Gold Line', color: 0xe0b020, css: '#eb2', model: 'Casual2_Male', shirt: 0xc89a18, pants: 0x4a3a28 },
  police: { name: 'Police', color: 0x2244aa, css: '#24a', model: 'BlueSoldier_Male', shirt: 0x1a2a55, pants: 0x14182a },
  civ: { name: 'Citizens', color: 0xcccccc, css: '#ccc', model: 'Casual_Female', shirt: 0x777777, pants: 0x333333 },
};
export const CAR_TYPES = {
  sedan: { max: 28, acc: 16, hp: 100 }, muscle: { max: 36, acc: 21, hp: 100 }, suv: { max: 26, acc: 15, hp: 140 },
  van: { max: 22, acc: 12, hp: 160 }, taxi: { max: 28, acc: 16, hp: 100 }, police: { max: 34, acc: 20, hp: 150 },
  lowrider: { max: 26, acc: 15, hp: 110 },
};
// kb: knockback speed on hit. Ranged weapons spend ammo (pistol) or shells (shotgun).
export const WEAPONS = {
  fists: { range: 2.8, dmg: 20, cd: 0.42, swing: 0.32, kb: 4 }, knuckles: { range: 2.9, dmg: 30, cd: 0.5, swing: 0.3, kb: 8 },
  bat: { range: 3.3, dmg: 34, cd: 0.7, swing: 0.5, kb: 9 }, pistol: { range: 28, dmg: 26, cd: 0.35, swing: 0.25, kb: 5 },
  shotgun: { range: 13, dmg: 24, cd: 0.95, swing: 0.3, kb: 12 },
};
export const AIM_ASSIST = 1.35; // a client lock-on target is honored out to this multiple of weapon range

const OFF = (GRID - 1) / 2;
export function blockCenter(b) { return { x: (b.gx - OFF) * PITCH, z: (b.gz - OFF) * PITCH }; }
export const lineCoord = (i) => (i - GRID / 2) * PITCH; // street centerlines, i = 0..GRID
const HALF = (GRID * PITCH) / 2 + 6;
const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]];
const R = (s) => { s.rng = (s.rng * 1664525 + 1013904223) % 4294967296; return s.rng / 4294967296; };

export function createState(seed = 1, cfg = {}) {
  const s = { t: 0, nextId: 1, seed, rng: seed % 4294967296, cfg: { traffic: cfg.traffic ?? 10, peds: cfg.peds ?? 14 }, blocks: [], crews: {}, ents: [], cars: [], pickups: [], events: [], fx: [], over: null, mission: null, missionIdx: 0 };
  const starts = { '0,0': 'player', '4,0': 'reds', '4,1': 'reds', '0,4': 'blues', '1,4': 'blues', '4,4': 'golds', '3,4': 'golds' };
  for (let gz = 0; gz < GRID; gz++) for (let gx = 0; gx < GRID; gx++) {
    const id = gz * GRID + gx;
    s.blocks.push({ id, gx, gz, owner: starts[gx + ',' + gz] || 'neutral', hustle: HUSTLES[id % HUSTLES.length], rate: 3 + ((id * 7) % 4), capBy: null, capT: 0 });
  }
  for (const k of ['neutral', 'player', 'reds', 'blues', 'golds']) s.crews[k] = { id: k, cash: k === 'player' ? 150 : 140, rep: 0, aiT: 10 + R(s) * 10, alive: true };
  for (const b of s.blocks) {
    const n = b.owner === 'player' ? 1 : b.owner === 'neutral' ? 1 + (b.id % 2) : 3;
    for (let i = 0; i < n; i++) spawnUnit(s, b.owner, 'defender', b.id);
  }
  const c = blockCenter(s.blocks[0]);
  s.ents.push(newEnt(s, { kind: 'player', crew: 'player', x: c.x + BLOCK / 2 + 3, z: c.z, hp: 100, weapon: 'fists', ammo: 0, hasBat: false, hasKnux: false, shells: 0, block: false, dodgeT: 0, dodgeCd: 0, heat: 0, calmT: 0, busted: 0 }));
  s.ents.push(newEnt(s, { kind: 'giver', crew: 'player', name: 'Unc', x: c.x + 6, z: c.z + 6, ry: Math.PI, hp: 999 }));
  // parked cars along the curbs, one or two per block
  const types = ['sedan', 'muscle', 'suv', 'lowrider', 'van', 'taxi', 'sedan', 'lowrider'];
  s.blocks.forEach((b, i) => {
    const bc = blockCenter(b);
    s.cars.push(makeCar(s, bc.x + PITCH / 2 - 5.6, bc.z - 10 + (i % 3) * 6, 0, types[i % types.length], false));
    if (i % 2 === 0) s.cars.push(makeCar(s, bc.x - 8 + (i % 4) * 3, bc.z - PITCH / 2 + 5.6, Math.PI / 2, types[(i + 2) % types.length], false));
  });
  // pickups in alleys
  [[1, 'bat'], [6, 'pistol'], [12, 'knuckles'], [18, 'shotgun'], [8, 'bat'], [16, 'pistol'], [3, 'knuckles'], [22, 'shotgun']].forEach(([bi, type], k) => {
    const bc = blockCenter(s.blocks[bi]); s.pickups.push({ id: 'pk' + k, type, x: bc.x + (k % 2 ? 10 : -10), z: bc.z, respawnT: 0 });
  });
  for (let i = 0; i < s.cfg.traffic; i++) spawnTraffic(s, true);
  for (let i = 0; i < s.cfg.peds; i++) spawnPed(s, null);
  return s;
}
function newEnt(s, o) { return { id: s.nextId++, ry: 0, max: o.hp ?? 60, hp: 60, cd: 0, hitT: 0, combo: 0, kx: 0, kz: 0, stun: 0, swing: 0, moving: 0, jumpT: 0, car: null, ...o }; }
function makeCar(s, x, z, ry, type, ai) {
  const T = CAR_TYPES[type];
  return { id: 'c' + s.nextId++, type, x, z, ry, v: 0, steer: 0, driver: null, ai, hp: T.hp, max: T.hp, wrecked: false, siren: false, cruise: ai ? 8 + R(s) * 3 : 0, paint: Math.floor(R(s) * 8) };
}
function spawnTraffic(s, anywhere) {
  const p = player(s);
  for (let tries = 0; tries < 20; tries++) {
    const i = Math.floor(R(s) * (GRID + 1)), j = Math.floor(R(s) * GRID), d = Math.floor(R(s) * 4);
    const along = lineCoord(j) + PITCH / 2;
    const x = d % 2 === 0 ? lineCoord(i) : along, z = d % 2 === 0 ? along : lineCoord(i);
    if (p && !anywhere) { const dd = Math.hypot(x - p.x, z - p.z); if (dd < 70 || dd > 160) continue; }
    const ty = ['sedan', 'sedan', 'suv', 'van', 'taxi', 'muscle', 'lowrider'][Math.floor(R(s) * 7)];
    const car = makeCar(s, x, z, Math.atan2(DIRS[d][0], DIRS[d][1]), ty, true); laneSnap(car); s.cars.push(car);
    return car;
  }
  return null;
}
function spawnPed(s, near) {
  let b = s.blocks[Math.floor(R(s) * s.blocks.length)];
  if (near) {
    const opts = s.blocks.filter((o) => { const c = blockCenter(o), d = Math.hypot(c.x - near.x, c.z - near.z); return d > 45 && d < 110; });
    if (opts.length) b = opts[Math.floor(R(s) * opts.length)];
  }
  const e = newEnt(s, { kind: 'ped', crew: 'civ', hp: 30, block: b.id, pt: R(s) * 4, dir: R(s) < 0.5 ? 1 : -1, speed: 1.2 + R(s) * 0.5, flee: 0, look: Math.floor(R(s) * 100) });
  const q = perimeter(e.pt, blockCenter(b), BLOCK / 2 + 1); e.x = q.x; e.z = q.z;
  s.ents.push(e); return e;
}
export function perimeter(t, c, r) {
  const tt = ((t % 4) + 4) % 4, k = Math.floor(tt), f = tt - k;
  const pts = [[-r, -r], [r, -r], [r, r], [-r, r], [-r, -r]];
  return { x: c.x + pts[k][0] + (pts[k + 1][0] - pts[k][0]) * f, z: c.z + pts[k][1] + (pts[k + 1][1] - pts[k][1]) * f };
}

// v0.10 hook: a Local walks up and starts a scuffle a few seconds after spawn.
// A brawler chases foes anywhere but never counts toward block captures.
export function openingScuffle(s) {
  const p = player(s); if (s.scuffle) return null; s.scuffle = true;
  const home = s.blocks.find((b) => b.owner === 'neutral' && Math.hypot(blockCenter(b).x - p.x, blockCenter(b).z - p.z) < PITCH * 1.6) || s.blocks.find((b) => b.owner === 'neutral');
  if (!home) return null;
  // stand him in plain sight on the street ahead of the spawn point
  let x = p.x, z = p.z - 9;
  for (const [dx, dz] of [[0, -9], [0, 9], [-9, 0], [9, 0], [0, -6]]) if (!insideBuilding(p.x + dx, p.z + dz, 0.8)) { x = p.x + dx; z = p.z + dz; break; }
  const e = spawnUnit(s, 'neutral', 'brawler', home.id, x, z); e.hp = 40; e.weapon = 'fists'; e.scuffler = true;
  log(s, 'A Local is stepping to you. Show him whose block this is.');
  return e;
}
export function spawnUnit(s, crew, role, blockId, x, z) {
  const c = blockCenter(s.blocks[blockId]);
  const a = R(s) * Math.PI * 2, r = 3 + R(s) * 6;
  const e = newEnt(s, { kind: 'npc', crew, role, home: blockId, target: blockId, x: x ?? c.x + Math.cos(a) * r, z: z ?? c.z + Math.sin(a) * r, hp: 60, weapon: role === 'attacker' && R(s) < 0.3 ? 'bat' : 'fists', look: Math.floor(R(s) * 100) });
  s.ents.push(e);
  return e;
}

export const player = (s) => s.ents.find((e) => e.kind === 'player');
export const stars = (p) => (!p || p.heat < 10 ? 0 : Math.min(5, 1 + Math.floor((p.heat - 10) / 20)));
export const clock = (s) => (17.8 + (s.t * 24) / DAY_SECONDS) % 24;
// Traffic light: which axis has green. Returns 'z', 'x' or null (all red / yellow).
export function signal(s) { const ph = s.t % SIGNAL_CYCLE; return ph < 8 ? 'z' : ph < 10 ? 'yz' : ph < 18 ? 'x' : 'yx'; }
export function blockAt(s, x, z) {
  const gx = Math.round(x / PITCH + OFF), gz = Math.round(z / PITCH + OFF);
  if (gx < 0 || gz < 0 || gx >= GRID || gz >= GRID) return null;
  return s.blocks[gz * GRID + gx];
}
function neighbors(s, b) { return s.blocks.filter((o) => Math.abs(o.gx - b.gx) + Math.abs(o.gz - b.gz) === 1); }
const COMBAT = new Set(['player', 'npc']);
// Can a attack b? Crew members fight other crews. Cops only fight wanted players.
function hostile(a, b) {
  if (a.kind === 'cop') return b.kind === 'player' && b.heat > 0;
  if (b.kind === 'giver') return false;
  if (a.kind === 'player') return b.crew !== a.crew && b.kind !== 'giver';
  if (a.kind === 'npc') return COMBAT.has(b.kind) && b.crew !== a.crew;
  return false;
}
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
function log(s, text) { s.events.push({ t: s.t, text }); }
function addHeat(s, p, n) { if (!p || p.kind !== 'player') return; p.heat = Math.min(100, p.heat + n); p.calmT = 0; }

// ---------- actions ----------
export function applyAction(s, playerId, a) {
  const p = s.ents.find((e) => e.id === playerId);
  if (!p || p.hp <= 0) return;
  if (a.type === 'attack' && p.cd <= 0 && !p.car && !p.block && p.dodgeT <= 0) attack(s, p, a.target);
  else if (a.type === 'block') p.block = !!a.on && !p.car;
  else if (a.type === 'dodge' && !p.car && p.dodgeCd <= 0) {
    let dx = a.dx ?? -Math.sin(p.ry), dz = a.dz ?? -Math.cos(p.ry); const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    p.dodgeT = 0.42; p.dodgeCd = 0.85; p.kx = dx * 15; p.kz = dz * 15; p.block = false;
    s.fx.push({ type: 'dodge', x: p.x, z: p.z, to: p.id });
  }
  else if (a.type === 'jump' && !p.car && p.jumpT <= 0) p.jumpT = 0.8;
  else if (a.type === 'weapon') {
    const list = ['fists', ...(p.hasKnux ? ['knuckles'] : []), ...(p.hasBat ? ['bat'] : []), ...(p.ammo > 0 ? ['pistol'] : []), ...(p.shells > 0 ? ['shotgun'] : [])];
    p.weapon = list[(list.indexOf(p.weapon) + 1) % list.length];
  } else if (a.type === 'recruit') {
    const cr = s.crews[p.crew];
    const n = s.ents.filter((e) => e.crew === p.crew && e.role === 'follower' && e.hp > 0).length;
    if (cr.cash >= RECRUIT_COST && n < 8) {
      cr.cash -= RECRUIT_COST;
      const u = spawnUnit(s, p.crew, 'follower', 0, p.x + 2, p.z + 2); u.leader = p.id;
      log(s, 'New recruit joined your crew.');
    } else log(s, n >= 8 ? 'Crew is full (8 max).' : 'Need $' + RECRUIT_COST + ' to recruit.');
  } else if (a.type === 'car') {
    if (p.car) exitCar(s, p);
    else {
      const c = nearestCar(s, p, 5);
      if (c) {
        if (c.ai) {
          log(s, 'You jacked a ride.'); addHeat(s, p, 6);
          const d = newEnt(s, { kind: 'ped', crew: 'civ', hp: 30, block: (blockAt(s, c.x, c.z) || s.blocks[0]).id, pt: 0, dir: 1, speed: 1.4, flee: 8, look: Math.floor(R(s) * 100), x: c.x - Math.cos(c.ry) * 2.2, z: c.z + Math.sin(c.ry) * 2.2, fromX: p.x, fromZ: p.z });
          s.ents.push(d); s.fx.push({ type: 'jack', car: c.id, ped: d.id });
        }
        if (c.type === 'police') addHeat(s, p, 25);
        c.driver = p.id; c.ai = false; p.car = c.id;
        missionCheck(s, p);
      } else log(s, 'No car close enough.');
    }
  } else if (a.type === 'talk') {
    const g = s.ents.find((e) => e.kind === 'giver');
    if (g && dist2(g, p) < 16) startMission(s, p);
  }
}
export function nearestCar(s, p, r) {
  let c = null, bd = r * r;
  for (const k of s.cars) if (!k.driver && !k.wrecked && !k.cops) { const d = dist2(k, p); if (d < bd) { bd = d; c = k; } }
  return c;
}
function exitCar(s, p) {
  const c = s.cars.find((c) => c.id === p.car); c.driver = null; p.car = null;
  p.x = c.x - Math.cos(c.ry) * 2.4; p.z = c.z + Math.sin(c.ry) * 2.4;
}

const meleeFallback = (p) => (p.hasBat ? 'bat' : p.hasKnux ? 'knuckles' : 'fists');
function attack(s, p, targetId) {
  if (p.weapon === 'pistol' && p.ammo <= 0) p.weapon = meleeFallback(p);
  if (p.weapon === 'shotgun' && !(p.shells > 0)) p.weapon = meleeFallback(p);
  const w = WEAPONS[p.weapon] || WEAPONS.fists;
  p.cd = w.cd; p.swing = w.swing; p.combo = (p.combo + 1) % 2;
  // aim assist: a lock-on target from the client wins if it is valid and close enough
  if (targetId != null) {
    const t = s.ents.find((e) => e.id === targetId);
    if (t && t !== p && t.hp > 0 && !t.car && hostile(p, t) && dist2(t, p) < (w.range * AIM_ASSIST) ** 2) p.ry = Math.atan2(t.x - p.x, t.z - p.z);
  }
  const fx = Math.sin(p.ry), fz = Math.cos(p.ry);
  if (p.weapon === 'pistol' || p.weapon === 'shotgun') {
    const gun = p.weapon;
    if (gun === 'pistol') p.ammo--; else p.shells--;
    const hits = [];
    for (const e of s.ents) if (e !== p && e.hp > 0 && hostile(p, e) && !e.car) {
      const d = Math.sqrt(dist2(e, p)); if (d > w.range) continue;
      const dot = ((e.x - p.x) * fx + (e.z - p.z) * fz) / (d || 1);
      if (dot > (gun === 'shotgun' ? 0.8 : 0.9) && clearLine(p, e)) hits.push([dot - d * 0.01, e, d]);
    }
    hits.sort((a2, b2) => b2[0] - a2[0]);
    const best = hits[0] ? hits[0][1] : null;
    if (best && gun === 'pistol') p.ry = Math.atan2(best.x - p.x, best.z - p.z);
    const tx = best ? best.x : p.x + Math.sin(p.ry) * 22, tz = best ? best.z : p.z + Math.cos(p.ry) * 22;
    s.fx.push({ type: 'shot', x: p.x, z: p.z, tx, tz, by: p.id, gun, ry: p.ry });
    addHeat(s, p, gun === 'shotgun' ? 10 : 8); panic(s, p.x, p.z, 30);
    if (gun === 'pistol') { if (best) damage(s, best, w.dmg, p, true, w.kb); }
    else for (const [, e, d] of hits.slice(0, 3)) damage(s, e, Math.round(w.dmg * (1.6 - d / w.range)), p, true, w.kb * (1.3 - d / w.range));
    if (gun === 'pistol' && p.ammo <= 0) p.weapon = meleeFallback(p);
    if (gun === 'shotgun' && p.shells <= 0) p.weapon = meleeFallback(p);
    return;
  }
  let best = null, bs = -1e9;
  for (const e of s.ents) if (e !== p && e.hp > 0 && hostile(p, e) && !e.car) {
    const d = Math.sqrt(dist2(e, p)); if (d > w.range) continue;
    const dot = d > 0.01 ? ((e.x - p.x) * fx + (e.z - p.z) * fz) / d : 1;
    const sc = dot * 2 - d * 0.5 + (d < 1.4 ? 1 : 0) + (e.kind === 'ped' ? -1 : 0) + (e.id === targetId ? 3 : 0);
    if (dot > -0.2 && sc > bs) { bs = sc; best = e; }
  }
  // lunge: a locked target just out of reach (knockback, tap timing) still gets hit, same on touch and keyboard
  if (!best && targetId != null) {
    const t = s.ents.find((e) => e.id === targetId);
    if (t && t !== p && t.hp > 0 && !t.car && hostile(p, t)) {
      const d = Math.sqrt(dist2(t, p));
      if (d <= w.range * 1.6) { const k = Math.max(0, d - w.range * 0.75) / (d || 1); p.x += (t.x - p.x) * k; p.z += (t.z - p.z) * k; best = t; }
    }
  }
  if (best) {
    p.ry = Math.atan2(best.x - p.x, best.z - p.z);
    const fist = p.weapon === 'fists';
    damage(s, best, fist ? (p.combo ? 28 : 20) : w.dmg, p, !fist || p.combo === 1, fist && p.combo ? 6 : w.kb);
  } else s.fx.push({ type: 'whiff', x: p.x, z: p.z, by: p.id });
}

function panic(s, x, z, r) { for (const e of s.ents) if (e.kind === 'ped' && e.hp > 0 && (e.x - x) ** 2 + (e.z - z) ** 2 < r * r) { e.flee = 6 + R(s) * 4; e.fromX = x; e.fromZ = z; } }

function damage(s, e, amt, src, heavy, kb) {
  if (e.hp <= 0 || e.kind === 'giver') return;
  // dodge rolls have a short invulnerable window
  if (e.dodgeT > 0.12) { s.fx.push({ type: 'evade', x: e.x, z: e.z, to: e.id }); return; }
  // blocking soaks most of a melee hit from the front
  if (e.block && src && src.kind && dist2(e, src) < 16) {
    const d0 = Math.sqrt(dist2(e, src)) || 1, front = ((src.x - e.x) * Math.sin(e.ry) + (src.z - e.z) * Math.cos(e.ry)) / d0;
    if (front > 0.2) { amt = Math.ceil(amt * 0.2); e.hp -= amt; e.kx = (e.x - src.x) / d0 * 2; e.kz = (e.z - src.z) / d0 * 2; s.fx.push({ type: 'block', x: e.x, z: e.z, to: e.id, by: src.id }); if (e.hp <= 0) e.hp = 1; return; }
  }
  e.hp -= amt; e.hitT = heavy ? 0.45 : 0.3; e.stun = heavy ? 0.7 : 0.4;
  const ko = e.hp <= 0;
  let dx = 0, dz = 0;
  if (src) {
    const d = Math.sqrt(dist2(e, src)) || 1, k = (kb ?? (heavy ? 7 : 4)) * (ko ? 1.7 : 1);
    dx = (e.x - src.x) / d; dz = (e.z - src.z) / d;
    e.kx = dx * k; e.kz = dz * k;
  }
  s.fx.push({ type: 'hit', x: e.x, z: e.z, by: src ? src.id : 0, to: e.id, heavy: !!heavy, ko, dx, dz, amt });
  if (src && src.kind === 'player') {
    addHeat(s, src, e.kind === 'ped' ? 7 : e.kind === 'cop' ? 18 : 2);
    if (ko) addHeat(s, src, e.kind === 'ped' ? 8 : e.kind === 'cop' ? 15 : 4);
  }
  if (e.kind === 'ped') { e.flee = 8; e.fromX = src ? src.x : e.x; e.fromZ = src ? src.z : e.z; }
  panic(s, e.x, e.z, 14);
  if (e.kind === 'cop' && src && src.kind === 'player') s.ents.forEach((c) => { if (c.kind === 'cop') c.alert = 1; });
  if (ko) {
    e.hp = 0;
    if (src && s.crews[src.crew]) s.crews[src.crew].rep += e.kind === 'player' ? 10 : e.kind === 'npc' ? 2 : 0;
    if (e.kind === 'npc' && s.mission && s.mission.kind === 'beat' && e.crew === s.mission.crew && src && src.crew === 'player') { s.mission.count++; }
    if (e.kind === 'player') onPlayerDown(s, e);
  }
}

function onPlayerDown(s, p) {
  const own = s.blocks.filter((b) => b.owner === p.crew);
  if (!own.length) return;
  const busted = p.heat >= 10;
  const cr = s.crews[p.crew]; const lost = Math.floor(cr.cash * (busted ? 0.4 : 0.25)); cr.cash -= lost;
  log(s, busted ? `BUSTED. Bail cost you $${lost}.` : `WASTED. You lost $${lost}. Back at your turf.`);
  if (p.car) exitCar(s, p);
  s.fx.push({ type: busted ? 'busted' : 'wasted', x: p.x, z: p.z });
  // a short down beat (the client plays it in slow motion) before the respawn
  p.downT = DOWN_TIME; p.downBusted = busted;
}
export const DOWN_TIME = 1.1;
// test hook: knock the player down now (used by the cinematic capture script)
export function debugDown(s) { const p = player(s); if (p.hp <= 0) return; p.hp = 0; onPlayerDown(s, p); }
function respawnPlayer(s, p) {
  const own = s.blocks.filter((b) => b.owner === p.crew); if (!own.length) return;
  const busted = p.downBusted; p.downT = 0;
  const c = blockCenter(own[0]);
  p.x = c.x + BLOCK / 2 + 3; p.z = c.z; p.hp = p.max; p.kx = p.kz = 0; p.heat = 0;
  if (busted) { p.ammo = 0; p.shells = 0; p.weapon = meleeFallback(p); }
  for (const e of s.ents) if (e.kind === 'cop') e.leave = true;
  if (s.mission) failMission(s, 'You went down. Mission failed.');
}

// ---------- cars ----------
// Handling: steering lock shrinks with speed, the travel direction (mh) lags
// the nose by a grip rate, and the handbrake drops rear grip for drifts.
// c.slip and c.skid are read by the client for smoke and skid marks.
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
function driveCar(s, c, throttle, steerIn, dt, driverEnt, handbrake) {
  if (c.wrecked) { c.v *= 1 - 3 * dt; return; }
  const T = CAR_TYPES[c.type];
  if (c.mh == null || Math.abs(c.v) < 1) c.mh = c.ry;
  const sp = Math.abs(c.v) / T.max;
  const lock = 0.6 * (1 - Math.min(0.5, sp * 0.55)) * (handbrake ? 1.25 : 1);
  c.steer += (steerIn * lock - c.steer) * Math.min(1, dt * (Math.abs(steerIn) > 0.05 ? 7 : 10));
  const braking = throttle * c.v < 0;
  c.v += throttle * (braking ? 34 : c.v < 0 ? 10 : T.acc) * dt;
  c.v *= 1 - (handbrake ? 0.7 : Math.abs(throttle) < 0.05 ? 0.9 : 0.25) * dt;
  c.v = Math.max(-9, Math.min(T.max, c.v));
  c.ry -= (c.v / 2.7) * Math.tan(c.steer) * dt * (handbrake ? 1.6 : 1);
  const grip = handbrake ? 1.1 : 6.5 - sp * 2;
  c.mh += angDiff(c.ry, c.mh) * Math.min(1, dt * grip);
  c.slip = Math.abs(angDiff(c.ry, c.mh));
  c.skid = (c.slip > 0.14 && Math.abs(c.v) > 6) || (braking && Math.abs(c.v) > 9) || (throttle > 0.5 && c.v > 0 && c.v < 5 && sp < 0.15) ? 1 : 0;
  if (!handbrake && c.slip > 0.6) c.v *= 1 - 1.2 * dt; // spinning out scrubs speed
  c.x += Math.sin(c.mh) * c.v * dt; c.z += Math.cos(c.mh) * c.v * dt;
  clampWorld(c);
  c.scrapeT = Math.max(0, (c.scrapeT || 0) - dt);
  collideBuildings(c, 1.6, () => {
    const n = Math.abs(c.v);
    if (c.scrapeT <= 0 && n > 3) { c.scrapeT = 0.15; s.fx.push({ type: n > 10 ? 'crash' : 'scrape', x: c.x, z: c.z, by: driverEnt ? driverEnt.id : 0, n }); }
    carHurt(s, c, n * 1.6); c.v *= n > 10 ? -0.25 : 0.85; c.mh = c.ry;
  });
  for (const o of s.cars) if (o !== c && dist2(o, c) < 9) {
    const d = Math.sqrt(dist2(o, c)) || 1, push = (3 - d) / 2;
    c.x -= (o.x - c.x) / d * push; c.z -= (o.z - c.z) / d * push; o.x += (o.x - c.x) / d * push; o.z += (o.z - c.z) / d * push;
    if (Math.abs(c.v) > 4) { s.fx.push({ type: 'crash', x: (c.x + o.x) / 2, z: (c.z + o.z) / 2, by: driverEnt ? driverEnt.id : 0, n: Math.abs(c.v) }); carHurt(s, c, Math.abs(c.v)); carHurt(s, o, Math.abs(c.v)); if (driverEnt && driverEnt.kind === 'player') addHeat(s, driverEnt, o.type === 'police' ? 15 : 2); }
    c.v *= 0.5;
  }
  if (Math.abs(c.v) > 6) for (const e of s.ents) if (e !== driverEnt && e.hp > 0 && !e.car && e.kind !== 'giver' && dist2(e, c) < 5) {
    if (!driverEnt || driverEnt.kind === 'player' ? e.crew !== 'player' : hostile(driverEnt, e)) damage(s, e, 30, c, true, 10);
    else { const d = Math.sqrt(dist2(e, c)) || 1; e.kx = (e.x - c.x) / d * 6; e.kz = (e.z - c.z) / d * 6; }
    if (driverEnt && driverEnt.kind === 'player') addHeat(s, driverEnt, e.kind === 'ped' ? 10 : 3);
    c.v *= 0.6;
  }
}
function carHurt(s, c, n) {
  if (c.wrecked || n < 3) return;
  c.hp -= n;
  if (c.hp <= 0) {
    c.hp = 0; c.wrecked = true; c.v = 0; c.ai = false; s.fx.push({ type: 'wreck', x: c.x, z: c.z });
    const d = s.ents.find((e) => e.car === c.id);
    if (d && d.kind === 'player') { exitCar(s, d); log(s, 'That ride is done. Get out and find another.'); }
    for (const e of s.ents) if (e.car === c.id) { e.car = null; e.x = c.x + 2; e.z = c.z; }
  }
}

export function movePlayer(s, p, mx, mz, sprint, dt) {
  if (p.hp <= 0) return;
  if (p.car) {
    const c = s.cars.find((c) => c.id === p.car);
    driveCar(s, c, mz, mx, dt, p, sprint);
    p.x = c.x; p.z = c.z; p.ry = c.ry; p.moving = 0;
    return;
  }
  if (p.dodgeT > 0) { p.moving = 0; clampWorld(p); collideBuildings(p, 0.5); return; }
  const sp = p.block ? 2.2 : sprint ? 9 : 5;
  const l = Math.hypot(mx, mz);
  if (l > 0.05 && !(p.swing > 0.1)) {
    p.x += mx * sp * dt; p.z += mz * sp * dt;
    const want = Math.atan2(mx, mz); let d = want - p.ry; d = Math.atan2(Math.sin(d), Math.cos(d)); p.ry += d * Math.min(1, dt * 14);
    p.moving = Math.min(l, 1) * sp / 5;
  } else p.moving = 0;
  clampWorld(p); collideBuildings(p, 0.5);
  // pickups
  for (const k of s.pickups) if (k.respawnT <= 0 && dist2(k, p) < 2.5) {
    k.respawnT = 40;
    if (k.type === 'bat') { p.hasBat = true; p.weapon = 'bat'; log(s, 'Picked up a bat.'); }
    else if (k.type === 'knuckles') { p.hasKnux = true; p.weapon = 'knuckles'; log(s, 'Picked up brass knuckles.'); }
    else if (k.type === 'shotgun') { p.shells = (p.shells || 0) + 10; p.weapon = 'shotgun'; log(s, 'Picked up a shotgun (+10).'); }
    else { p.ammo += 24; p.weapon = 'pistol'; log(s, 'Picked up a pistol (+24).'); }
    s.fx.push({ type: 'pickup', x: k.x, z: k.z });
  }
}

function clampWorld(o) { o.x = Math.max(-HALF, Math.min(HALF, o.x)); o.z = Math.max(-HALF, Math.min(HALF, o.z)); }

// Buildings: each block has 4 corner buildings leaving a plus-shaped open lot
// (the alleys and courtyard) through the middle.
export function buildingsFor(b) {
  // kind drives the look: store, house, apt (Eastside), tower (Downtown), shed (Harbor)
  const c = blockCenter(b), h = BLOCK / 2, w = 13, out = [], d = districtOf(b);
  let i = 0;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const r = (b.id * 13 + sx * 3 + sz * 5 + 20) % 4;
    let kind, height;
    if (d === 0) { kind = i === 0 ? 'store' : i === 3 && b.id % 2 ? 'apt' : 'house'; height = kind === 'apt' ? 11 : kind === 'store' ? 6 : 6.5; }
    else if (d === 1) { kind = r === 0 ? 'apt' : 'tower'; height = kind === 'apt' ? 18 + r * 2 : 22 + r * 9; }
    else { kind = 'shed'; height = 9 + r * 1.2; }
    out.push({ x: c.x + sx * (h - w / 2), z: c.z + sz * (h - w / 2), w, d: w, h: height, sx, sz, kind });
    i++;
  }
  return out;
}
const _bb = [];
function blockBuildings(x, z) {
  const gx = Math.round(x / PITCH + OFF), gz = Math.round(z / PITCH + OFF);
  if (gx < 0 || gz < 0 || gx >= GRID || gz >= GRID) return [];
  const i = gz * GRID + gx;
  return _bb[i] || (_bb[i] = buildingsFor({ id: i, gx, gz }));
}
export function allBuildings() { const out = []; for (let i = 0; i < GRID * GRID; i++) out.push(...blockBuildings(blockCenter({ gx: i % GRID, gz: Math.floor(i / GRID) }).x, blockCenter({ gx: i % GRID, gz: Math.floor(i / GRID) }).z)); return out; }
export function insideBuilding(x, z, pad = 0, y = 0) {
  for (const k of blockBuildings(x, z)) if (y < k.h + 0.6 && Math.abs(x - k.x) < k.w / 2 + pad && Math.abs(z - k.z) < k.d / 2 + pad) return true;
  return false;
}
function collideBuildings(o, r, onHit) {
  for (const k of blockBuildings(o.x, o.z)) {
    const dx = o.x - k.x, dz = o.z - k.z, hx = k.w / 2 + r, hz = k.d / 2 + r;
    if (Math.abs(dx) < hx && Math.abs(dz) < hz) {
      const px = hx - Math.abs(dx), pz = hz - Math.abs(dz);
      if (px < pz) o.x += Math.sign(dx) * px; else o.z += Math.sign(dz) * pz;
      onHit && onHit();
    }
  }
}
function clearLine(a, b) {
  const d = Math.sqrt(dist2(a, b)), n = Math.ceil(d / 2);
  for (let i = 1; i < n; i++) if (insideBuilding(a.x + (b.x - a.x) * i / n, a.z + (b.z - a.z) * i / n, 0.6)) return false;
  return true;
}

// ---------- street navigation graph ----------
let NAV = null;
function nav() {
  if (NAV) return NAV;
  const nodes = [], edges = [], key = new Map();
  const add = (x, z) => { const k = Math.round(x) + ',' + Math.round(z); if (!key.has(k)) { key.set(k, nodes.length); nodes.push({ x, z }); edges.push([]); } return key.get(k); };
  const link = (a, b) => { const d = Math.sqrt(dist2(nodes[a], nodes[b])); edges[a].push([b, d]); edges[b].push([a, d]); };
  for (let i = 0; i <= GRID; i++) for (let j = 0; j <= GRID; j++) add(lineCoord(i), lineCoord(j));
  for (let gz = 0; gz < GRID; gz++) for (let gx = 0; gx < GRID; gx++) {
    const c = blockCenter({ gx, gz }), ci = add(c.x, c.z);
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
  for (let i = 0; i < nodes.length; i++) { const d = dist2(nodes[i], p); if (d < bd && d < 80 * 80 && (d < 4 || clearLine(p, nodes[i]))) { bd = d; best = i; } }
  return best;
}
function findPath(a, b) {
  const { nodes, edges } = nav(), s0 = nearestNode(a), t = nearestNode(b);
  const dist = new Float64Array(nodes.length).fill(Infinity), prev = new Int32Array(nodes.length).fill(-1), done = new Uint8Array(nodes.length);
  dist[s0] = 0;
  for (;;) {
    let u = -1, ud = Infinity;
    for (let i = 0; i < nodes.length; i++) if (!done[i] && dist[i] < ud) { ud = dist[i]; u = i; }
    if (u < 0 || u === t) break;
    done[u] = 1;
    for (const [v, w] of edges[u]) if (ud + w < dist[v]) { dist[v] = ud + w; prev[v] = u; }
  }
  const path = []; for (let u = t; u >= 0; u = prev[u]) path.unshift({ x: nodes[u].x, z: nodes[u].z });
  path.push({ x: b.x, z: b.z });
  return path;
}
function steerPoint(e, goal) {
  e.losT = (e.losT || 0) - 1;
  if (dist2(e, goal) < 36) { e.path = null; return goal; }
  if (e.losT <= 0) { e.losT = 15; e.los = dist2(e, goal) < 40 * 40 && clearLine(e, goal); } // long sight lines skim corners and ping-pong
  if (e.los) { e.path = null; return goal; }
  if (!e.path || e.pathT <= 0 || dist2(e.path[e.path.length - 1], goal) > 25) { e.path = findPath(e, goal); e.pathT = 2.5; while (e.path.length > 1 && dist2(e, e.path[1]) < dist2(e.path[0], e.path[1])) e.path.shift(); } // skip a start node we are already past
  while (e.path.length > 1 && dist2(e, e.path[0]) < 6) e.path.shift();
  return e.path[0];
}

// ---------- traffic ----------
function laneSnap(c) {
  const dx = Math.round(Math.sin(c.ry)), dz = Math.round(Math.cos(c.ry));
  if (dx === 0) c.x = nearestLine(c.x) - dz * LANE; else c.z = nearestLine(c.z) + dx * LANE;
}
const nearestLine = (v) => lineCoord(Math.max(0, Math.min(GRID, Math.round(v / PITCH + GRID / 2))));
function trafficStep(s, c, dt) {
  const dx = Math.round(Math.sin(c.ry)), dz = Math.round(Math.cos(c.ry)), sg = dx || dz;
  const along = dx !== 0 ? c.x : c.z;
  let blocked = false;
  // red light: stop before the next intersection
  const idx = along / PITCH + GRID / 2, nextI = sg > 0 ? Math.floor(idx + 1e-6) + 1 : Math.ceil(idx - 1e-6) - 1;
  const toStop = (lineCoord(nextI) - along) * sg;
  const sig = signal(s), axis = dx === 0 ? 'z' : 'x';
  if (sig !== axis && toStop > 9 && toStop < 15 && nextI >= 0 && nextI <= GRID) blocked = true;
  if (!blocked) for (const o of s.cars) {
    if (o === c) continue;
    const rx = o.x - c.x, rz = o.z - c.z, ahead = rx * dx + rz * dz, side = Math.abs(rx * dz - rz * dx);
    if (ahead > 0 && ahead < 9 && side < 1.9) { blocked = true; break; }
  }
  if (!blocked) for (const o of s.ents) {
    if (o.hp <= 0 || o.car) continue;
    const rx = o.x - c.x, rz = o.z - c.z, ahead = rx * dx + rz * dz, side = Math.abs(rx * dz - rz * dx);
    if (ahead > 0 && ahead < 8 && side < 1.9) { blocked = true; if (o.kind === 'player' && c.v < 1) c.honk = (c.honk || 0) + dt; break; }
  }
  c.waitT = blocked && toStop > 15 ? (c.waitT || 0) + dt : 0;
  if (c.waitT > 4) { blocked = false; if (c.waitT > 5.5) c.waitT = 0; }
  const target = blocked ? 0 : c.cruise;
  c.v += Math.sign(target - c.v) * Math.min(Math.abs(target - c.v), (blocked ? 22 : 6) * dt);
  c.x += dx * c.v * dt; c.z += dz * c.v * dt;
  c.steer *= 0.9;
  const iCoord = nearestLine(along);
  const passed = (along - iCoord) * sg;
  if (c.lastI !== iCoord && passed > -LANE - 0.5 && passed < 0) {
    c.lastI = iCoord;
    const opts = [];
    for (let d = 0; d < 4; d++) {
      const [ndx, ndz] = DIRS[d];
      if (ndx === -dx && ndz === -dz) continue;
      const ix = dx !== 0 ? iCoord : nearestLine(c.x), iz = dx !== 0 ? nearestLine(c.z) : iCoord;
      if (Math.abs(ix + ndx * PITCH) > HALF || Math.abs(iz + ndz * PITCH) > HALF) continue;
      opts.push({ d, ix, iz });
    }
    if (opts.length) {
      const straight = opts.find((o) => DIRS[o.d][0] === dx && DIRS[o.d][1] === dz);
      const o = straight && R(s) < 0.5 ? straight : opts[Math.floor(R(s) * opts.length)];
      const [ndx, ndz] = DIRS[o.d];
      if (ndx !== dx || ndz !== dz) { c.ry = Math.atan2(ndx, ndz); c.x = o.ix; c.z = o.iz; laneSnap(c); c.lastI = ndx !== 0 ? nearestLine(c.x) : nearestLine(c.z); }
    }
  }
  if (Math.abs(c.x) > HALF + 1 || Math.abs(c.z) > HALF + 1) { c.ry += Math.PI; c.x = Math.max(-HALF, Math.min(HALF, c.x)); c.z = Math.max(-HALF, Math.min(HALF, c.z)); laneSnap(c); }
  if (c.v > 4) for (const e of s.ents) if (e.hp > 0 && !e.car && dist2(e, c) < 4) { const d = Math.sqrt(dist2(e, c)) || 1; e.kx = (e.x - c.x) / d * 6; e.kz = (e.z - c.z) / d * 6; }
}

// ---------- police ----------
function policeStep(s, dt) {
  const p = player(s), st = stars(p);
  const cops = s.ents.filter((e) => e.kind === 'cop' && e.hp > 0);
  s.policeT = (s.policeT || 0) - dt;
  const want = Math.min(8, st * 2);
  if (st > 0 && cops.length < want && s.policeT <= 0) {
    s.policeT = 5;
    // spawn a cruiser on a street node 60 to 100 m away
    const { nodes } = nav();
    const opts = nodes.filter((n) => { const d = Math.hypot(n.x - p.x, n.z - p.z); return d > 60 && d < 110 && !insideBuilding(n.x, n.z, 1); });
    const n = opts[Math.floor(R(s) * opts.length)];
    if (n) {
      const car = makeCar(s, n.x, n.z, Math.atan2(p.x - n.x, p.z - n.z), 'police', false);
      car.cops = true; car.siren = true; s.cars.push(car);
      for (let i = 0; i < 2; i++) s.ents.push(newEnt(s, { kind: 'cop', crew: 'police', hp: 80, car: car.id, x: car.x, z: car.z, weapon: st >= 3 ? 'pistol' : 'fists', look: i }));
    }
  }
  // cruisers chase
  for (const c of s.cars) if (c.cops && !c.wrecked) {
    const crew = s.ents.filter((e) => e.kind === 'cop' && e.car === c.id);
    if (!crew.length) { c.siren = st > 0 && dist2(c, p) < 80 * 80; c.v *= 1 - 2 * dt; continue; }
    const leave = crew.some((e) => e.leave) || st === 0;
    const goal = leave ? { x: c.x + Math.sin(c.ry) * 50, z: c.z + Math.cos(c.ry) * 50 } : p;
    const wp = leave ? goal : steerPoint(c, goal);
    const dx = wp.x - c.x, dz = wp.z - c.z, want = Math.atan2(dx, dz);
    let diff = want - c.ry; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const d = Math.sqrt(dist2(c, p));
    c.stuckT = Math.abs(c.v) < 1 ? (c.stuckT || 0) + dt : 0;
    let thr = Math.abs(diff) < 1.3 ? 1 : 0.35;
    if (c.stuckT > 1.5) { thr = -1; diff = -diff; if (c.stuckT > 3) c.stuckT = 0; }
    if (!leave && d < 16 && !p.car) thr = c.v > 2 ? -1 : 0;
    if (!leave && p.car && d < 8) thr = 0.6;
    driveCar(s, c, thr, Math.max(-1, Math.min(1, -diff * 2)), dt, { id: -1, kind: 'cop', crew: 'police', heat: 0 });
    for (const e of crew) { e.x = c.x; e.z = c.z; }
    if (!leave && d < 16 && Math.abs(c.v) < 3 && !p.car) for (const e of crew) { e.car = null; e.x = c.x + (e.look ? 2 : -2) * Math.cos(c.ry); e.z = c.z - (e.look ? 2 : -2) * Math.sin(c.ry); }
    if (leave && dist2(c, p) > 90 * 90) { c.remove = true; for (const e of crew) e.remove = true; }
  }
  // officers on foot
  for (const e of s.ents) if (e.kind === 'cop' && !e.car && e.hp > 0) {
    if (e.stun > 0) continue;
    if (st === 0 || e.leave) {
      // walk back to the nearest cruiser and leave, or vanish when far
      e.moving = 0; if (dist2(e, p) > 70 * 70) e.remove = true;
      const c = s.cars.find((c) => c.cops && !c.wrecked && dist2(c, e) < 400);
      if (c && dist2(c, e) < 9) e.car = c.id; else if (c) moveToward(e, c, 4, dt);
      continue;
    }
    const target = p.car ? s.cars.find((c) => c.id === p.car) : p;
    const d = Math.sqrt(dist2(e, target));
    if (p.car && d < 3 && Math.abs(target.v) < 2) { exitCar(s, p); log(s, 'The cops dragged you out of the car.'); continue; }
    if (e.weapon === 'pistol' && d < 18 && d > 3 && !p.car) {
      e.ry = Math.atan2(p.x - e.x, p.z - e.z); e.moving = 0;
      if (e.cd <= 0 && clearLine(e, p)) { e.cd = 1.4 + R(s); e.swing = 0.25; s.fx.push({ type: 'shot', x: e.x, z: e.z, tx: p.x, tz: p.z, by: e.id }); if (R(s) < 0.6) damage(s, p, 7, e, false); }
      continue;
    }
    if (d < 1.9 && !p.car) {
      e.ry = Math.atan2(p.x - e.x, p.z - e.z); e.moving = 0;
      if (e.cd <= 0) { e.cd = 1.0 + R(s) * 0.4; e.swing = 0.32; e.combo = (e.combo + 1) % 2; damage(s, p, 9, e, false); }
    } else moveToward(e, target, 6, dt);
  }
}
function moveToward(e, goal, sp, dt) {
  const wp = steerPoint(e, goal);
  const dx = wp.x - e.x, dz = wp.z - e.z, dd = Math.hypot(dx, dz) || 1;
  e.x += dx / dd * sp * dt; e.z += dz / dd * sp * dt;
  const want = Math.atan2(dx, dz); let r = want - e.ry; r = Math.atan2(Math.sin(r), Math.cos(r)); e.ry += r * Math.min(1, dt * 10);
  e.moving = sp / 5; collideBuildings(e, 0.5);
}

// ---------- pedestrians ----------
function pedStep(s, e, dt, p) {
  if (e.hp <= 0) { e.downT = (e.downT || 0) + dt; if (e.downT > 5) { e.hp = 30; e.downT = 0; e.flee = 8; e.fromX = p.x; e.fromZ = p.z; } return; }
  if (e.stun > 0) { e.moving = 0; return; }
  if (e.flee > 0) {
    e.flee -= dt;
    const dx = e.x - e.fromX, dz = e.z - e.fromZ, d = Math.hypot(dx, dz) || 1;
    const goal = { x: e.x + dx / d * 10, z: e.z + dz / d * 10 };
    e.x += (goal.x - e.x) / 10 * 7 * dt; e.z += (goal.z - e.z) / 10 * 7 * dt;
    e.ry = Math.atan2(dx, dz); e.moving = 1.5; collideBuildings(e, 0.5); clampWorld(e);
    if (e.flee <= 0) { const b = blockAt(s, e.x, e.z) || s.blocks[e.block]; e.block = b.id; const c = blockCenter(b); e.pt = closestT(e, c); }
    return;
  }
  const c = blockCenter(s.blocks[e.block]), r = BLOCK / 2 + 1;
  const q = perimeter(e.pt, c, r);
  if (dist2(e, q) > 4) { moveToward(e, q, 2.5, dt); return; }
  e.pt += e.dir * e.speed * dt / (r * 2);
  const nq = perimeter(e.pt, c, r);
  e.ry = Math.atan2(nq.x - e.x, nq.z - e.z); e.x = nq.x; e.z = nq.z; e.moving = 0.32;
  // react to the player waving fists or a gun
  if (p.swing > 0 && dist2(e, p) < 36) { e.flee = 6; e.fromX = p.x; e.fromZ = p.z; }
}
function closestT(e, c) { let bt = 0, bd = Infinity; for (let t = 0; t < 4; t += 0.05) { const q = perimeter(t, c, BLOCK / 2 + 1), d = dist2(q, e); if (d < bd) { bd = d; bt = t; } } return bt; }

// ---------- missions ----------
// Missions: Unc hands them out in order. Each entry is data; the behavior for
// each kind lives in startMission (setup), missionCheck (car events) and
// missionStep (per tick win and fail checks). s.mission.target is the marker
// the client shows (beacon, radar icon and edge arrow).
export const MISSIONS = [
  { title: 'Package Run', intro: 'Unc: "Grab my package from the Harbor drop and bring it back. You got 120 seconds."', kind: 'fetch', time: 120, reward: 250, rep: 20 },
  { title: 'Send a Message', intro: 'Unc: "The Red Kings been testing us. Knock out 3 of them."', kind: 'beat', crew: 'reds', need: 3, reward: 300, rep: 30 },
  { title: 'Chop Job', intro: 'Unc: "Find a muscle car and drop it at the chop shop on the marker."', kind: 'chop', reward: 400, rep: 30 },
  { title: 'Take Over', intro: 'Unc: "Time to grow. Take the block on the marker."', kind: 'take', reward: 600, rep: 50 },
];
function startMission(s, p) {
  if (s.mission) { log(s, `Unc: "Finish ${s.mission.title} first."`); return; }
  if (s.missionIdx >= MISSIONS.length) { log(s, 'Unc: "No more work today. Keep the blocks tight."'); return; }
  const M = MISSIONS[s.missionIdx];
  const m = { idx: s.missionIdx, title: M.title, kind: M.kind, stage: 0, timer: M.time || 0, count: 0, need: M.need || 0, crew: M.crew, reward: M.reward, rep: M.rep, target: null };
  if (M.kind === 'fetch') {
    // the drop sits in the Harbor parking lane, outside any crew's guard area,
    // preferring a block that is not held by a rival crew
    const harbor = s.blocks.filter((b) => districtOf(b) === 2);
    const b = harbor.find((b) => b.owner === 'neutral' || b.owner === 'player') || harbor[0];
    const c = blockCenter(b); m.target = { x: c.x - BLOCK / 2 - 5, z: c.z + 6 }; m.block = b.id;
  }
  if (M.kind === 'chop') { m.target = null; }
  if (M.kind === 'take') {
    const mine = s.blocks.filter((b) => b.owner === 'player');
    const opts = []; for (const b of mine) for (const n of neighbors(s, b)) if (n.owner !== 'player') opts.push(n);
    const b = opts[0] || s.blocks.find((b) => b.owner !== 'player');
    m.block = b.id; const c = blockCenter(b); m.target = { x: c.x, z: c.z };
  }
  s.mission = m; log(s, M.intro); s.fx.push({ type: 'mission', state: 'start', title: M.title, idx: m.idx });
}
function missionCheck(s, p) {
  const m = s.mission; if (!m) return;
  if (m.kind === 'chop' && m.stage === 0 && p.car) {
    const c = s.cars.find((c) => c.id === p.car);
    if (c && c.type === 'muscle') { m.stage = 1; const b = s.blocks.find((b) => b.hustle === 'Chop Shop') || s.blocks[5]; const bc = blockCenter(b); m.target = { x: bc.x + PITCH / 2 - 4, z: bc.z + 12 }; log(s, 'Nice ride. Take it to the chop shop marker.'); }
  }
}
function missionStep(s, p, dt) {
  const m = s.mission; if (!m) return;
  if (m.timer > 0) { m.timer -= dt; if (m.timer <= 0) { failMission(s, 'Out of time. Mission failed.'); return; } }
  const near = (r) => m.target && (p.x - m.target.x) ** 2 + (p.z - m.target.z) ** 2 < r * r;
  if (m.kind === 'fetch') {
    if (m.stage === 0 && near(4)) { m.stage = 1; const g = s.ents.find((e) => e.kind === 'giver'); m.target = { x: g.x, z: g.z }; log(s, 'Got the package. Bring it back to Unc.'); }
    else if (m.stage === 1 && near(4)) passMission(s);
  } else if (m.kind === 'beat') { if (m.count >= m.need) passMission(s); }
  else if (m.kind === 'chop') {
    missionCheck(s, p);
    if (m.stage === 1 && near(6) && p.car) { const c = s.cars.find((c) => c.id === p.car); if (c.type === 'muscle') { exitCar(s, p); c.remove = true; passMission(s); } }
  } else if (m.kind === 'take') { if (s.blocks[m.block].owner === 'player') passMission(s); }
}
function passMission(s) {
  const m = s.mission; s.crews.player.cash += m.reward; s.crews.player.rep += m.rep;
  log(s, `MISSION PASSED: ${m.title}. +$${m.reward}`); s.fx.push({ type: 'mission', state: 'pass', title: m.title, reward: m.reward, rep: m.rep });
  s.mission = null; s.missionIdx++;
}
function failMission(s, why) { log(s, why); s.fx.push({ type: 'mission', state: 'fail', title: s.mission.title }); s.mission = null; }

// ---------- main step ----------
export function step(s, dt) {
  if (s.over) return;
  s.t += dt;
  const p = player(s);
  for (const b of s.blocks) if (s.crews[b.owner] && b.owner !== 'neutral') s.crews[b.owner].cash += b.rate * dt;
  for (const k of s.pickups) if (k.respawnT > 0) k.respawnT -= dt;
  // heat decays when nobody is chasing you
  p.calmT = (p.calmT || 0) + dt;
  const copNear = s.ents.some((e) => e.kind === 'cop' && e.hp > 0 && dist2(e, p) < 30 * 30);
  if (p.downT > 0) { p.downT -= dt; if (p.downT <= 0) respawnPlayer(s, p); }
  if (p.heat > 0 && p.calmT > 8 && !copNear) p.heat = Math.max(0, p.heat - 5 * dt);
  if (p.heat > 0 && p.calmT > 20) p.heat = Math.max(0, p.heat - 3 * dt);
  // cars
  for (const c of s.cars) {
    if (c.ai && !c.driver && !c.wrecked) trafficStep(s, c, dt);
    else if (!c.driver && !c.cops && c.v) { c.v *= 1 - 3 * dt; if (Math.abs(c.v) < 0.2) c.v = 0; c.x += Math.sin(c.ry) * c.v * dt; c.z += Math.cos(c.ry) * c.v * dt; }
    if (c.wrecked) { c.wreckT = (c.wreckT || 0) + dt; if (c.wreckT > 60 && dist2(c, p) > 100 * 100) c.remove = true; }
  }
  policeStep(s, dt);
  // keep traffic topped up near the player
  const traffic = s.cars.filter((c) => c.ai && !c.wrecked);
  for (const c of traffic) if (dist2(c, p) > 180 * 180) c.remove = true;
  if (traffic.length < s.cfg.traffic && R(s) < dt) spawnTraffic(s, false);
  // entities
  const chasers = new Map();
  for (const e of s.ents) {
    if (e.cd > 0) e.cd -= dt; if (e.hitT > 0) e.hitT -= dt; if (e.swing > 0) e.swing -= dt; if (e.stun > 0) e.stun -= dt; if (e.pathT > 0) e.pathT -= dt; if (e.jumpT > 0) e.jumpT -= dt; if (e.dodgeT > 0) e.dodgeT -= dt; if (e.dodgeCd > 0) e.dodgeCd -= dt;
    if (e.kx || e.kz) { e.x += e.kx * dt; e.z += e.kz * dt; e.kx *= 1 - 6 * dt; e.kz *= 1 - 6 * dt; if (Math.abs(e.kx) + Math.abs(e.kz) < 0.1) e.kx = e.kz = 0; collideBuildings(e, 0.5); clampWorld(e); }
    if (e.kind === 'ped') { pedStep(s, e, dt, p); if (dist2(e, p) > 130 * 130 && e.hp > 0) { e.remove = true; } continue; }
    if (e.kind !== 'npc' || e.hp <= 0) continue;
    e.moving = 0;
    if (e.stun > 0) continue;
    let foe = null, fd = 12 ** 2;
    for (const o of s.ents) if (o.hp > 0 && hostile(e, o) && !(o.kind === 'player' && o.car)) { const d = dist2(o, e); if (d < fd) { fd = d; foe = o; } }
    let goal, followSpeed = 0;
    if (e.role === 'follower') {
      // recruits walk in a loose formation behind you and only fight foes right next to you
      const l = s.ents.find((x) => x.id === e.leader);
      if (foe && !(l && dist2(foe, l) < 7 * 7)) foe = null;
      if (foe) goal = foe;
      else if (l) {
        const slot = (e.slot ??= s.ents.filter((x) => x.role === 'follower' && x.leader === e.leader).indexOf(e));
        const side = (slot % 2 ? 1 : -1) * (1.2 + Math.floor(slot / 2) * 0.9), back = 2.4 + Math.floor(slot / 2) * 1.3;
        const fx = Math.sin(l.ry), fz = Math.cos(l.ry);
        const spot = { x: l.x - fx * back + fz * side, z: l.z - fz * back - fx * side };
        const ds = Math.sqrt(dist2(spot, e));
        if (ds > 1.0) { goal = spot; followSpeed = ds > 12 ? 9.6 : ds > 4 ? 6 : 3.2; }
      }
      if (l && l.car && dist2(l, e) > 40 * 40) { e.x = l.x + 3; e.z = l.z + 3; } // catch up after a drive
    } else {
      // defenders guard their own block and at most three of them chase one foe
      const c = blockCenter(s.blocks[e.target]);
      if (foe && e.role !== 'attacker' && e.role !== 'brawler') {
        const inBlock = Math.abs(foe.x - c.x) < BLOCK / 2 + 2 && Math.abs(foe.z - c.z) < BLOCK / 2 + 2;
        const n = chasers.get(foe.id) || 0;
        if (!inBlock || n >= 3) foe = null; else chasers.set(foe.id, n + 1);
      }
      if (foe) goal = foe;
      else if (dist2(e, c) > 16) goal = c;
    }
    if (goal) {
      const d = Math.sqrt(dist2(goal, e));
      const reach = e.weapon === 'bat' ? 2.6 : 1.9;
      if (goal === foe && d < reach) {
        e.ry = Math.atan2(goal.x - e.x, goal.z - e.z);
        if (e.cd <= 0) { e.cd = (e.weapon === 'bat' ? 1.3 : 1.0) + R(s) * 0.6; e.swing = e.weapon === 'bat' ? 0.5 : 0.32; e.combo = (e.combo + 1) % 2; damage(s, foe, e.weapon === 'bat' ? 14 : 8, e, e.weapon === 'bat'); }
      } else if (d > 0.5) {
        const wp = steerPoint(e, goal);
        const dx = wp.x - e.x, dz = wp.z - e.z, dd = Math.hypot(dx, dz) || 1;
        const sp = followSpeed && goal !== foe ? followSpeed : 4;
        let sx = 0, sz = 0;
        for (const o of s.ents) if (o !== e && o.hp > 0 && o.kind === 'npc') { const q = dist2(o, e); if (q < 1 && q > 0) { sx += (e.x - o.x) / q; sz += (e.z - o.z) / q; } }
        e.x += (dx / dd * sp + sx * 0.6) * dt; e.z += (dz / dd * sp + sz * 0.6) * dt;
        const want = Math.atan2(dx, dz); let r = want - e.ry; r = Math.atan2(Math.sin(r), Math.cos(r)); e.ry += r * Math.min(1, dt * 10);
        e.moving = sp / 5;
        collideBuildings(e, 0.5);
      }
    }
  }
  for (const e of s.ents) if ((e.kind === 'npc' || e.kind === 'cop') && e.hp <= 0) e.downT = (e.downT || 0) + dt;
  s.ents = s.ents.filter((e) => !(e.downT > 6 && e.kind !== 'ped') && !e.remove);
  s.cars = s.cars.filter((c) => !c.remove || c.driver);
  const peds = s.ents.filter((e) => e.kind === 'ped').length;
  if (peds < s.cfg.peds && R(s) < dt * 2) spawnPed(s, p);
  // capture
  for (const b of s.blocks) {
    const c = blockCenter(b);
    if (Math.abs(c.x - p.x) > PITCH * 4 && b.capT === 0) { /* far blocks still capture, cheap check below */ }
    const inZone = {}; let defenders = 0;
    for (const e of s.ents) if (e.hp > 0 && COMBAT.has(e.kind) && !e.car) {
      const d = dist2(e, c);
      if (e.crew === b.owner && d < (PITCH / 2) ** 2) defenders++;
      if (e.crew !== b.owner && e.role !== 'brawler' && d < ZONE_R ** 2) inZone[e.crew] = (inZone[e.crew] || 0) + 1;
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
  for (const k of ['reds', 'blues', 'golds']) aiThink(s, k, dt);
  for (const b of s.blocks) if (b.owner === 'neutral' && R(s) < dt / 50 && s.ents.filter((e) => e.crew === 'neutral' && e.home === b.id && e.hp > 0).length < 2) spawnUnit(s, 'neutral', 'defender', b.id);
  missionStep(s, p, dt);
  const pt = s.blocks.filter((b) => b.owner === 'player').length;
  const rivals = s.blocks.filter((b) => ['reds', 'blues', 'golds'].includes(b.owner)).length;
  if (rivals === 0 && pt >= 10) s.over = 'win';
  else if (pt === 0) s.over = 'lose';
}

function aiThink(s, k, dt) {
  const cr = s.crews[k];
  const own = s.blocks.filter((b) => b.owner === k);
  cr.alive = own.length > 0;
  if (!cr.alive) return;
  cr.aiT -= dt;
  if (cr.aiT > 0) return;
  cr.aiT = 9 + R(s) * 6;
  const cap = Math.min(14, 4 + own.length * 2);
  let units = s.ents.filter((e) => e.crew === k && e.hp > 0).length;
  if (units >= cap) return;
  for (const b of own) {
    const d = s.ents.filter((e) => e.crew === k && e.target === b.id && e.role === 'defender' && e.hp > 0).length;
    if (d < 2 && cr.cash >= 60 && units < cap) { cr.cash -= 60; units++; spawnUnit(s, k, 'defender', b.id); }
  }
  if (cr.cash >= 150 && R(s) < 0.7) {
    const options = [];
    for (const b of own) for (const n of neighbors(s, b)) if (n.owner !== k) options.push({ from: b, to: n });
    if (!options.length) return;
    const score = (o) => s.ents.filter((e) => e.crew === o.to.owner && e.hp > 0 && dist2(e, blockCenter(o.to)) < (PITCH / 2) ** 2).length + (o.to.owner === 'player' ? -0.5 : 0) + R(s);
    options.sort((a, b) => score(a) - score(b));
    const o = options[0];
    const n = Math.min(4, cap - units, Math.floor(cr.cash / 50));
    if (n < 2) return;
    cr.cash -= n * 50;
    for (let i = 0; i < n; i++) { const u = spawnUnit(s, k, 'attacker', o.from.id); u.target = o.to.id; }
    log(s, `${CREWS[k].name} are moving on ${o.to.hustle}${o.to.owner === 'player' ? ' (yours!)' : ''}.`);
  }
}

export const serialize = (s) => JSON.stringify(s, (k, v) => (k === 'path' ? undefined : v));
export const deserialize = (j) => JSON.parse(j);
export { steerPoint as navPoint }; // used by the headless mission tests
