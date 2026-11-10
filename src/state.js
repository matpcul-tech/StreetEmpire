// Pure game state and simulation. No rendering code lives here.
// Everything in `state` is plain JSON so it can be serialized, sent over a
// network, or run on an authoritative server later. Player intent only enters
// through applyAction() and movePlayer(), keyed by player entity id.

export const BLOCK = 40;       // block footprint
export const STREET = 18;      // street width
export const PITCH = BLOCK + STREET;
export const GRID = 9;         // 9 x 9 blocks, about 520 m across
export const ZONE_R = 7;       // capture zone radius at block center
export const CAPTURE_TIME = 6; // seconds to hold a zone
export const RECRUIT_COST = 100;
export const UPGRADE_COST = 80;  // bats and extra health for one block's guards
export const UPGRADE_HP = 40;
export const RAID_GATHER = 10;   // seconds a rival crew waits before hitting your block
export const LANE = 3;         // lane offset from street centerline
export const DAY_SECONDS = 480; // one full day and night
export const SIGNAL_CYCLE = 20;

// one hustle name per block (81), so a message that names a block means one place
const HUSTLES = ['Corner Store Deals', 'Car Wash', 'Sneaker Resale', 'Bootleg DVDs', 'Barbershop Bets', 'Chop Shop', 'Pawn Counter', 'Food Truck', 'Card Games',
  'Phone Repair', 'Laundromat', 'Tire Shop', 'Pool Hall', 'Record Store', 'Check Cashing', 'Taco Stand', 'Scrap Yard', 'Gym', 'Arcade', 'Night Club', 'Liquor Store', 'Dice Games', 'Bodega', 'Wing Spot', 'Tattoo Parlor',
  'Swap Meet', 'Hubcap Stand', 'Smoke Shop', 'Nail Salon', 'Donut Shop', 'Flower Stall', 'Fight Gym', 'Burger Window', 'Stereo Shop', 'Thrift Store', 'Bail Bonds', 'Juice Bar', 'Tow Yard', 'Body Shop', 'Fish Market',
  'Print Shop', 'Dry Cleaner', 'Used Tires', 'Bike Shop', 'Mattress Outlet', 'Parking Lot', 'Billiards Back Room', 'Karaoke Bar', 'Noodle Cart', 'Ticket Resale', 'Furniture Rental', 'Storage Units', 'Rim Shop', 'Corner Bar', 'Lotto Counter',
  'Paint Shop', 'Video Rental', 'Jewelry Counter', 'Coin Laundry', 'Fruit Stand', 'Loading Dock', 'Cold Storage', 'Bait Shop', 'Boat Yard', 'Freight Office', 'Net Loft', 'Fuel Dock', 'Crab Shack', 'Customs Shed', 'Ice House',
  'Salvage Yard', 'Welding Shop', 'Truck Stop', 'Pier Cafe', 'Rope Works', 'Container Lot', 'Union Hall', 'Dockside Bar', 'Ship Chandler', 'Canning Line', 'Dry Dock'];
// Districts run in diagonal bands from the player's corner to the water: Eastside (houses), Midtown (apartments
// and shops), Downtown (towers), Harbor (warehouses). Midtown was added with the 9 x 9 map and keeps index 3 so
// the three original districts keep theirs.
export const DISTRICTS = ['Eastside', 'Downtown', 'Harbor', 'Midtown'];
export function districtOf(b) { const e = (b.gx + b.gz) / (2 * (GRID - 1)); return e <= 0.25 ? 0 : e <= 0.44 ? 3 : e <= 0.69 ? 1 : 2; }

export const CREWS = {
  neutral: { name: 'Locals', color: 0x9a9a9a, css: '#aaa', model: 'Casual_Female', shirt: 0x6b6458, pants: 0x3a3a40 },
  // crew colors stay clear of the San Andreas gang colors (green, purple, yellow, teal)
  player: { name: 'You', color: 0xff8a1a, css: '#ff8a1a', model: 'Casual_Male', shirt: 0xd9741c, pants: 0x2a3550 },
  reds: { name: 'Red Kings', color: 0xdd3333, css: '#e33', model: 'Casual2_Male', shirt: 0xa82222, pants: 0x1a1a1a },
  blues: { name: 'Blue Hand', color: 0x3377ee, css: '#48f', model: 'Casual3_Male', shirt: 0x2850a8, pants: 0x3a4a66 },
  golds: { name: 'Gold Line', color: 0xb8925a, css: '#b8925a', model: 'Casual2_Male', shirt: 0x9a7438, pants: 0x3a3028 },
  police: { name: 'Police', color: 0x2244aa, css: '#24a', model: 'BlueSoldier_Male', shirt: 0x1a2a55, pants: 0x14182a },
  civ: { name: 'Citizens', color: 0xcccccc, css: '#ccc', model: 'Casual_Female', shirt: 0x777777, pants: 0x333333 },
};
export const CAR_TYPES = {
  sedan: { max: 28, acc: 16, hp: 100 }, muscle: { max: 36, acc: 21, hp: 100 }, suv: { max: 26, acc: 15, hp: 140 },
  van: { max: 22, acc: 12, hp: 160 }, taxi: { max: 28, acc: 16, hp: 100 }, police: { max: 34, acc: 20, hp: 150 },
  lowrider: { max: 26, acc: 15, hp: 110 }, pickup: { max: 27, acc: 15, hp: 135 },
  bike: { max: 39, acc: 25, hp: 90 }, // sport bike: quickest thing on the street, and the easiest to wreck
};
// kb: knockback speed on hit. Ranged weapons spend ammo (pistol) or shells (shotgun).
// The five weapons stay as they are. Timing, arc and stun are what separate them:
// fists are a fast jab then cross, knuckles stun, the bat is a slow wide cleave,
// the pistol is one precise hit, the shotgun is a short cone.
export const WEAPONS = {
  fists: { range: 2.7, dmg: 18, cd: 0.34, swing: 0.26, kb: 3.6 },
  knuckles: { range: 2.8, dmg: 30, cd: 0.46, swing: 0.3, kb: 8 },
  bat: { range: 3.4, dmg: 34, cd: 0.74, swing: 0.5, kb: 11 },
  pistol: { range: 28, dmg: 26, cd: 0.38, swing: 0.22, kb: 5 },
  shotgun: { range: 12, dmg: 22, cd: 0.95, swing: 0.32, kb: 13 },
};
export const AIM_ASSIST = 1.35; // a client lock-on target is honored out to this multiple of weapon range
// Optional street calls. One at a time, a session cap, and a cooldown so they
// never become a second police system. Kinds rotate in this order.
export const CALLS = {
  first: 36, cd: 46, offer: 14, fight: 28, cap: 5, maxNpc: 3, minDist: 14, strikeCap: 2,
  kinds: ['incursion', 'ambush', 'deal'],
};
const TELL_SEC = { rush: 0.36, flank: 0.46, retreat: 0.52 };
const APPROACH = { rush: 5.3, flank: 4.3, retreat: 3.7 };

const OFF = (GRID - 1) / 2;
export function blockCenter(b) { return { x: (b.gx - OFF) * PITCH, z: (b.gz - OFF) * PITCH }; }
export const lineCoord = (i) => (i - GRID / 2) * PITCH; // street centerlines, i = 0..GRID
const HALF = (GRID * PITCH) / 2 + 6;
const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]];
const R = (s) => { s.rng = (s.rng * 1664525 + 1013904223) % 4294967296; return s.rng / 4294967296; };

export function createState(seed = 1, cfg = {}) {
  const s = { t: 0, nextId: 1, seed, rng: seed % 4294967296, cfg: { traffic: cfg.traffic ?? 10, peds: cfg.peds ?? 14 }, blocks: [], crews: {}, ents: [], cars: [], pickups: [], events: [], fx: [], over: null, mission: null, missionIdx: 0, calls: { cd: CALLS.first, n: 0, active: null, grace: 0, ready: false, capped: false } };
  // you start with one corner block; each rival crew holds a 2 x 2 corner of its own
  const L = GRID - 1, starts = { '0,0': 'player' };
  for (const [crew, cx, cz] of [['reds', L, 0], ['blues', 0, L], ['golds', L, L]]) for (const ox of [0, 1]) for (const oz of [0, 1]) starts[Math.abs(cx - ox) + ',' + Math.abs(cz - oz)] = crew;
  for (let gz = 0; gz < GRID; gz++) for (let gx = 0; gx < GRID; gx++) {
    const id = gz * GRID + gx;
    s.blocks.push({ id, gx, gz, owner: starts[gx + ',' + gz] || 'neutral', hustle: HUSTLES[id % HUSTLES.length], rate: 3 + ((id * 7) % 4), capBy: null, capT: 0, stash: 0 });
  }
  for (const k of ['neutral', 'player', 'reds', 'blues', 'golds']) s.crews[k] = { id: k, cash: k === 'player' ? 150 : 140, rep: 0, aiT: 10 + R(s) * 10, alive: true };
  for (const b of s.blocks) {
    const n = b.owner === 'player' ? 1 : b.owner === 'neutral' ? 1 + (b.id % 2) : 3;
    for (let i = 0; i < n; i++) spawnUnit(s, b.owner, 'defender', b.id);
  }
  const c = blockCenter(s.blocks[0]);
  s.ents.push(newEnt(s, { kind: 'player', crew: 'player', x: c.x + BLOCK / 2 + 3, z: c.z, hp: 100, weapon: 'fists', ammo: 0, hasBat: false, hasKnux: false, shells: 0, block: false, dodgeT: 0, dodgeCd: 0, heat: 0, calmT: 0, busted: 0 }));
  ensureContacts(s); s.jobsV = 2;
  // parked cars along the curbs, one or two per block
  const types = ['sedan', 'muscle', 'suv', 'lowrider', 'van', 'taxi', 'sedan', 'pickup', 'lowrider'];
  s.blocks.forEach((b, i) => {
    const bc = blockCenter(b);
    s.cars.push(makeCar(s, bc.x + PITCH / 2 - 5.6, bc.z - 10 + (i % 3) * 6, 0, types[i % types.length], false));
    if (i % 2 === 0) s.cars.push(makeCar(s, bc.x - 8 + (i % 4) * 3, bc.z - PITCH / 2 + 5.6, Math.PI / 2, types[(i + 2) % types.length], false));
  });
  addBikes(s);
  // pickups in alleys
  [[1, 0, 'bat'], [1, 1, 'pistol'], [2, 2, 'knuckles'], [3, 3, 'shotgun'], [3, 1, 'bat'], [1, 3, 'pistol'], [3, 0, 'knuckles'], [2, 4, 'shotgun'],
    [5, 1, 'bat'], [1, 5, 'pistol'], [5, 4, 'knuckles'], [4, 6, 'shotgun'], [6, 2, 'pistol'], [2, 7, 'bat'], [6, 6, 'shotgun'], [7, 4, 'knuckles'], [4, 8, 'pistol'], [8, 5, 'bat']].forEach(([gx, gz, type], k) => {
    const bc = blockCenter(s.blocks[gz * GRID + gx]); s.pickups.push({ id: 'pk' + k, type, x: bc.x + (k % 2 ? 10 : -10), z: bc.z, respawnT: 0 });
  });
  for (let i = 0; i < s.cfg.traffic; i++) spawnTraffic(s, true);
  for (let i = 0; i < s.cfg.peds; i++) spawnPed(s, null);
  return s;
}
// Parked sport bikes: one by the starting corner, the rest spread over the city. They take no ids and
// no random numbers, so adding them leaves everything else in a new game exactly as it was.
const BIKE_BLOCKS = [0, 6, 20, 34, 40, 52, 64, 78];
function addBikes(s) {
  if (s.cars.some((c) => c.type === 'bike')) return;
  const T = CAR_TYPES.bike;
  BIKE_BLOCKS.forEach((bi, k) => {
    const b = s.blocks[bi % s.blocks.length]; if (!b) return;
    const bc = blockCenter(b);
    s.cars.push({ id: 'bike' + k, type: 'bike', x: bc.x + PITCH / 2 - 5.6, z: bc.z + 9.5 + (k % 2) * 1.5, ry: 0, v: 0, steer: 0, driver: null, ai: false, hp: T.hp, max: T.hp, wrecked: false, siren: false, cruise: 0, paint: k });
  });
}
function newEnt(s, o) { return { id: s.nextId++, ry: 0, max: o.hp ?? 60, hp: 60, cd: 0, hitT: 0, combo: 0, kx: 0, kz: 0, stun: 0, swing: 0, moving: 0, jumpT: 0, car: null, windup: 0, tell: '', ...o }; }
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
    const ty = ['sedan', 'sedan', 'suv', 'van', 'taxi', 'muscle', 'lowrider', 'pickup'][Math.floor(R(s) * 8)];
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

// Opening: a mugger goes for the bag, his friends pile in (one with a bat),
// then a Red Kings scout commandeers a traffic car for a short drive-by.
// A brawler chases foes anywhere but never counts toward block captures.
// The client calls this once a few seconds after spawn. step() plays the rest.
export function openingScuffle(s) {
  const p = player(s); if (!p || s.scuffle) return null; s.scuffle = true;
  const home = s.blocks.find((b) => b.owner === 'neutral' && Math.hypot(blockCenter(b).x - p.x, blockCenter(b).z - p.z) < PITCH * 1.6) || s.blocks.find((b) => b.owner === 'neutral');
  if (!home) return null;
  // stand him in plain sight on the street ahead of the spawn point
  let x = p.x, z = p.z - 9;
  for (const [dx, dz] of [[0, -9], [0, 9], [-9, 0], [9, 0], [0, -6]]) if (!insideBuilding(p.x + dx, p.z + dz, 0.8)) { x = p.x + dx; z = p.z + dz; break; }
  const e = spawnUnit(s, 'neutral', 'brawler', home.id, x, z);
  e.hp = e.max = 48; e.weapon = 'fists'; e.style = 'rush'; e.scuffler = true; e.mugger = true; e.opening = true;
  const pool = s.cars.filter((c) => c.ai && !c.wrecked && !c.driver && !c.cops).map((c) => c.id);
  s.opening = { beat: 'mug', t: 0, grabbed: false, friends: false, ids: [e.id], scoutId: null, scoutCar: null, scoutExisting: false, pool, near: 999, passed: false, done: false };
  log(s, 'A mugger is going for your bag.');
  return e;
}
function placeNear(x, z, spots) {
  for (const [dx, dz] of spots) if (!insideBuilding(x + dx, z + dz, 0.7)) return { x: x + dx, z: z + dz };
  return { x, z };
}
// Point an existing traffic car down the lane that will pass the player.
function aimScoutCar(c, p) {
  const vx = nearestLine(p.x), vz = nearestLine(p.z);
  const alongX = Math.abs(p.x - vx) <= Math.abs(p.z - vz);
  // ride an existing lane when it already passes close, otherwise slide to a gap that misses the player
  if (alongX) {
    c.ry = Math.PI; c.x = vx; c.z = p.z + 26; laneSnap(c);
    const gap = Math.abs(c.x - p.x);
    if (gap < 7 || gap > 12) c.x = p.x + (c.x >= p.x ? 8 : -8);
  } else {
    c.ry = -Math.PI / 2; c.x = p.x + 26; c.z = vz; laneSnap(c);
    const gap = Math.abs(c.z - p.z);
    if (gap < 7 || gap > 12) c.z = p.z + (c.z >= p.z ? 8 : -8);
  }
  c.v = 14; c.cruise = 18; c.ai = true; c.scout = true; c.scoutT = 0; c.scoutNear = 999; c.scoutDone = false; c.driver = null;
}
function startScout(s, o) {
  if (o.scoutCar || o.beat === 'scout' || o.beat === 'chase' || o.done) return;
  const p = player(s);
  let car = null;
  for (const id of o.pool) {
    const c = s.cars.find((c) => c.id === id && c.ai && !c.wrecked && !c.driver && !c.cops);
    if (c) { car = c; break; }
  }
  if (!car) car = s.cars.find((c) => c.ai && !c.wrecked && !c.driver && !c.cops);
  o.scoutExisting = !!(car && o.pool.includes(car.id));
  if (!car) { car = spawnTraffic(s, true); o.scoutExisting = false; }
  if (!car) { o.done = true; o.beat = 'done'; log(s, 'The street goes quiet. Unc wants a word.'); return; }
  aimScoutCar(car, p);
  const home = s.blocks.find((b) => b.owner === 'reds') || s.blocks[0];
  const scout = spawnUnit(s, 'reds', 'brawler', home.id, car.x, car.z);
  scout.hp = scout.max = 44; scout.weapon = 'fists'; scout.scout = true; scout.car = car.id; scout.opening = true;
  o.scoutId = scout.id; o.scoutCar = car.id; o.beat = 'scout';
  log(s, 'A Red Kings scout cuts through traffic.');
}
function openingStep(s, dt) {
  const o = s.opening; if (!o || o.done) return;
  const p = player(s); if (!p) return;
  o.t += dt;
  const mug = s.ents.find((e) => e.id === o.ids[0]);
  const living = () => o.ids.filter((id) => s.ents.some((e) => e.id === id && e.hp > 0));
  if (o.beat === 'mug' || o.beat === 'friends') {
    if (!o.grabbed && mug && mug.hp > 0 && dist2(mug, p) < 2.3 * 2.3) {
      o.grabbed = true;
      const d = Math.sqrt(dist2(mug, p)) || 1;
      p.kx = (p.x - mug.x) / d * 3.2; p.kz = (p.z - mug.z) / d * 3.2;
      log(s, 'He grabs at your bag. Shove him off.');
    }
    if (!o.grabbed && mug && mug.hp <= 0) o.grabbed = true;
    const hurt = mug && mug.hp < mug.max;
    if (!o.friends && (hurt || o.grabbed || o.t > 3.2)) {
      o.friends = true; o.beat = 'friends';
      const homeId = mug ? mug.home : (s.blocks.find((b) => b.owner === 'neutral') || s.blocks[0]).id;
      const ax = mug && mug.hp > 0 ? mug.x : p.x, az = mug && mug.hp > 0 ? mug.z : p.z;
      const spots = [[3.2, 1.5], [-3.4, 1.2], [2.4, -2.6], [-2.2, -2.4], [4.2, 0], [-4.2, 0.4]];
      const a = placeNear(ax, az, spots), b = placeNear(ax, az, spots.slice(1));
      const f1 = spawnUnit(s, 'neutral', 'brawler', homeId, a.x, a.z);
      f1.hp = f1.max = 50; f1.weapon = 'fists'; f1.scuffler = true; f1.opening = true;
      const f2 = spawnUnit(s, 'neutral', 'brawler', homeId, b.x, b.z);
      f2.hp = f2.max = 56; f2.weapon = 'bat'; f2.scuffler = true; f2.opening = true;
      o.ids.push(f1.id, f2.id); o.bat = true;
      log(s, 'His friends jump in. One of them has a bat.');
    }
    if (o.friends && (living().length === 0 || o.t > 22)) startScout(s, o);
  } else if (o.beat === 'scout') {
    const car = s.cars.find((c) => c.id === o.scoutCar);
    const scout = s.ents.find((e) => e.id === o.scoutId);
    if (car) o.near = Math.min(o.near, car.scoutNear ?? 999);
    const passed = !!(car && car.scoutDone);
    if (passed || !car || (car && car.scoutT > 8)) {
      if (scout && scout.hp > 0 && scout.car) {
        const cr = car || scout;
        scout.car = null; scout.bail = true; scout.chaseUntil = s.t + 5;
        scout.x = cr.x + Math.cos(cr.ry || 0) * 2.6; scout.z = cr.z - Math.sin(cr.ry || 0) * 2.6;
        if (car) { car.scout = false; laneSnap(car); }
        log(s, 'The scout bails out and comes at you.');
      }
      o.passed = true; o.beat = 'chase';
    }
  } else if (o.beat === 'chase') {
    const scout = s.ents.find((e) => e.id === o.scoutId);
    if (!scout || scout.hp <= 0 || s.t >= (scout.chaseUntil || 0)) {
      if (scout && scout.hp > 0) scout.remove = true;
      o.done = true; o.beat = 'done';
      log(s, 'The street goes quiet. Unc wants a word.');
    }
  }
}
const SQUAD_MAX = 2, CREW_MAX = 24, GUARDS_PER_BLOCK = 3;
const RIVALS = new Set(['reds', 'blues', 'golds']);
export const squadOf = (s, p) => s.ents.filter((e) => e.crew === p.crew && e.role === 'follower' && e.leader === p.id && e.hp > 0);
export const guardsOf = (s, b) => s.ents.filter((e) => e.kind === 'npc' && e.crew === b.owner && e.role === 'defender' && e.target === b.id && e.hp > 0);
// Hustle cash piles up on the block. More guards on post, more of the rate.
// 0 guards: 0.4x. 3 guards: 1.0x. 1 guard (a fresh block): 0.6x.
export function stashRate(s, b) { return b.rate * (0.4 + 0.2 * guardsOf(s, b).length); }
function armGuard(e, b) {
  if (!b || b.upgraded !== 'bat' || e.upgraded) return;
  e.weapon = 'bat'; e.max += UPGRADE_HP; e.hp += UPGRADE_HP; e.upgraded = true;
}
function makeGuard(e, b) { e.role = 'defender'; e.guard = true; e.target = b.id; e.home = b.id; e.leader = null; e.slot = undefined; e.post = undefined; armGuard(e, b); }
function pocketStash(s, b, crew, announce) {
  const raw = b.stash || 0; if (raw <= 0) return 0;
  b.stash = 0; s.crews[crew].cash += raw;
  const shown = Math.floor(raw);
  if (announce && shown >= 1) {
    s.fx.push({ type: 'stash', block: b.id, amt: shown, hustle: b.hustle, crew });
    log(s, `Collected $${shown} from ${b.hustle}.`);
  }
  return raw;
}
function weakestHeld(s, crew) { let best = null, bn = 1e9; for (const b of s.blocks) if (b.owner === crew) { const n = guardsOf(s, b).length; if (n < bn) { bn = n; best = b; } } return best || s.blocks[0]; }
export function spawnUnit(s, crew, role, blockId, x, z) {
  const c = blockCenter(s.blocks[blockId]);
  const a = R(s) * Math.PI * 2, r = 3 + R(s) * 6;
  const e = newEnt(s, { kind: 'npc', crew, role, home: blockId, target: blockId, x: x ?? c.x + Math.cos(a) * r, z: z ?? c.z + Math.sin(a) * r, hp: 60, weapon: role === 'attacker' && R(s) < 0.3 ? 'bat' : 'fists', look: Math.floor(R(s) * 100), style: ['rush', 'flank', 'retreat'][s.nextId % 3] });
  s.ents.push(e);
  if (role === 'defender') armGuard(e, s.blocks[blockId]);
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
// A street call that is still an offer is not a fight yet. Once accepted, those
// actors only chase the player and the squad, so block guards do not pile on.
function hostile(a, b) {
  if (!a || !b || a === b) return false;
  if (a.streetHold) return false;
  if (b.streetHold && a.kind !== 'player') return false;
  if (a.street) return b.kind === 'player' || (b.kind === 'npc' && b.role === 'follower' && b.crew === 'player');
  if (b.street) return a.kind === 'player' || (a.kind === 'npc' && a.role === 'follower' && a.crew === 'player');
  if (a.kind === 'cop') return b.kind === 'player' && b.heat > 0;
  if (b.kind === 'giver') return false;
  if (a.kind === 'player') return b.crew !== a.crew && b.kind !== 'giver';
  if (a.kind === 'npc') return COMBAT.has(b.kind) && b.crew !== a.crew;
  return false;
}
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
// Spatial buckets, rebuilt once per step: who is alive in each 30 m cell. A fighter looking for a foe
// (at most 30 m away) or for neighbors to step clear of reads its own cell and the eight around it,
// so the search no longer grows with the square of the city's population.
const CELL = 30;
function bucketEnts(s) {
  const g = new Map();
  for (const o of s.ents) { if (!(o.hp > 0)) continue; const k = (Math.floor(o.x / CELL) + 512) * 1024 + Math.floor(o.z / CELL) + 512; const a = g.get(k); if (a) a.push(o); else g.set(k, [o]); }
  return g;
}
function nearbyEnts(g, x, z, out) {
  out.length = 0; const cx = Math.floor(x / CELL) + 512, cz = Math.floor(z / CELL) + 512;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const a = g.get((cx + i) * 1024 + cz + j); if (a) for (const o of a) out.push(o); }
  return out;
}
const nbFoe = [], nbSep = [];
function log(s, text) { s.events.push({ t: s.t, text }); }
function addHeat(s, p, n) { if (!p || p.kind !== 'player') return; p.heat = Math.min(100, p.heat + n); p.calmT = 0; }

// ---------- actions ----------
export function applyAction(s, playerId, a) {
  if (a && a.type === 'streetReady') { ensureCalls(s); s.calls.ready = true; return; }
  const p = s.ents.find((e) => e.id === playerId);
  if (!p || p.hp <= 0) return;
  if (a.type === 'attack' && p.cd <= 0 && !p.car && !p.block && p.dodgeT <= 0) attack(s, p, a.target);
  else if (a.type === 'block') p.block = !!a.on && !p.car;
  else if (a.type === 'dodge' && !p.car && !(p.downT > 0)) {
    const dx = a.dx ?? -Math.sin(p.ry), dz = a.dz ?? -Math.cos(p.ry);
    // a tap during the cooldown is kept until the roll is legal, so a mobile mash still comes out once
    if (p.dodgeCd > 0 || p.dodgeT > 0) { p.dodgeBuf = 0.22; p.dodgeDx = dx; p.dodgeDz = dz; }
    else startDodge(s, p, dx, dz);
  } else if (a.type === 'street') streetChoice(s, p, a.choice);
  else if (a.type === 'jump' && !p.car && p.jumpT <= 0) p.jumpT = 0.8;
  else if (a.type === 'weapon') {
    const list = ['fists', ...(p.hasKnux ? ['knuckles'] : []), ...(p.hasBat ? ['bat'] : []), ...(p.ammo > 0 ? ['pistol'] : []), ...(p.shells > 0 ? ['shotgun'] : [])];
    p.weapon = list[(list.indexOf(p.weapon) + 1) % list.length];
  } else if (a.type === 'recruit') {
    const cr = s.crews[p.crew];
    const n = s.ents.filter((e) => e.crew === p.crew && e.kind === 'npc' && (e.role === 'follower' || e.guard) && e.hp > 0).length;
    if (cr.cash >= RECRUIT_COST && n < CREW_MAX) {
      cr.cash -= RECRUIT_COST;
      if (squadOf(s, p).length < SQUAD_MAX) { const u = spawnUnit(s, p.crew, 'follower', 0, p.x + 2, p.z + 2); u.leader = p.id; log(s, 'Recruit joined your squad.'); }
      else { const b = weakestHeld(s, p.crew); const u = spawnUnit(s, p.crew, 'defender', b.id); u.guard = true; log(s, `Recruit sent to guard ${b.hustle}.`); }
    } else log(s, n >= CREW_MAX ? `Crew is full (${CREW_MAX} max).` : 'Need $' + RECRUIT_COST + ' to recruit.');
  } else if (a.type === 'squad') {
    // inside a held block: take one guard along (squad max 2), or send the squad to guard it
    const b = blockAt(s, p.x, p.z), sq = squadOf(s, p);
    if (!b || b.owner !== p.crew) log(s, 'Stand in one of your blocks to swap guards.');
    else {
      const gs = guardsOf(s, b);
      if (sq.length && (a.mode === 'send' || sq.length >= SQUAD_MAX || gs.length <= 1)) { for (const e of sq) makeGuard(e, b); log(s, `${sq.length} sent to guard ${b.hustle}.`); }
      else if (gs.length > 1) { const e = gs[0]; e.role = 'follower'; e.guard = false; e.leader = p.id; e.slot = undefined; log(s, `A guard from ${b.hustle} is with you.`); }
      else log(s, 'Need 2 guards here to take one.');
    }
  } else if (a.type === 'collect') {
    const b = a.block != null ? s.blocks[a.block] : blockAt(s, p.x, p.z);
    if (!b || b.owner !== p.crew) log(s, 'Nothing of yours to collect here.');
    else if (pocketStash(s, b, p.crew, true) < 1) log(s, `${b.hustle} stash is empty.`);
  } else if (a.type === 'upgrade') {
    const b = blockAt(s, p.x, p.z), cr = s.crews[p.crew];
    if (!b || b.owner !== p.crew) log(s, 'Stand in one of your blocks to upgrade guards.');
    else if (b.upgraded) log(s, `${b.hustle} guards are already upgraded.`);
    else if (cr.cash < UPGRADE_COST) log(s, `Need $${UPGRADE_COST} to arm the guards.`);
    else {
      const gs = guardsOf(s, b);
      if (!gs.length) log(s, 'No guards here to upgrade.');
      else {
        cr.cash -= UPGRADE_COST; b.upgraded = 'bat';
        for (const e of gs) armGuard(e, b);
        log(s, `Guards at ${b.hustle} got bats and more health. -$${UPGRADE_COST}`);
        s.fx.push({ type: 'upgrade', block: b.id, n: gs.length, weapon: 'bat' });
      }
    }
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
  } else if (a.type === 'buy') buy(s, p, a.item);
  else if (a.type === 'house') buyHouse(s, p);
  else if (a.type === 'talk') {
    let g = null, bd = 16; for (const e of s.ents) if (e.kind === 'giver') { const d = dist2(e, p); if (d < bd) { bd = d; g = e; } }
    if (!g) return;
    if (s.mission) log(s, `${g.name}: "Finish ${s.mission.title} first."`);
    else if (s.missionIdx >= MISSIONS.length) log(s, `${g.name}: "No more work today. Keep the blocks tight."`);
    else if (g !== contactFor(s)) log(s, `${g.name}: "Nothing for you right now. ${contactFor(s).name} is looking for you."`);
    else startMission(s, p);
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

function startDodge(s, p, dx, dz) {
  let x = dx || 0, z = dz || 0; const l = Math.hypot(x, z) || 1; x /= l; z /= l;
  p.dodgeT = 0.36; p.dodgeCd = 0.78; p.dodgeBuf = 0; p.kx = x * 16; p.kz = z * 16; p.block = false; p.swing = 0;
  s.fx.push({ type: 'dodge', x: p.x, z: p.z, to: p.id });
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
  const hits = [];
  for (const e of s.ents) if (e !== p && e.hp > 0 && hostile(p, e) && !e.car) {
    const d = Math.sqrt(dist2(e, p)); if (d > w.range) continue;
    const dot = d > 0.01 ? ((e.x - p.x) * fx + (e.z - p.z) * fz) / d : 1;
    const wide = p.weapon === 'bat' ? -0.15 : 0.05;
    if (dot <= wide) continue;
    const sc = dot * 2 - d * 0.5 + (d < 1.4 ? 1 : 0) + (e.kind === 'ped' ? -1 : 0) + (e.id === targetId ? 3 : 0);
    hits.push([sc, e, d]);
  }
  hits.sort((a2, b2) => b2[0] - a2[0]);
  let best = hits[0] ? hits[0][1] : null;
  // lunge: a locked target just out of reach (knockback, tap timing) still gets hit, same on touch and keyboard
  if (!best && targetId != null) {
    const t = s.ents.find((e) => e.id === targetId);
    if (t && t !== p && t.hp > 0 && !t.car && hostile(p, t)) {
      const d = Math.sqrt(dist2(t, p));
      if (d <= w.range * 1.6) { const k = Math.max(0, d - w.range * 0.75) / (d || 1); p.x += (t.x - p.x) * k; p.z += (t.z - p.z) * k; best = t; hits.unshift([99, t, d]); }
    }
  }
  if (best) {
    p.ry = Math.atan2(best.x - p.x, best.z - p.z);
    const fist = p.weapon === 'fists';
    const heavy = p.weapon === 'knuckles' || p.weapon === 'bat' || (fist && p.combo === 1);
    const kb = fist && p.combo === 0 ? 3.2 : w.kb;
    const stun = p.weapon === 'knuckles' ? 0.95 : fist && p.combo === 0 ? 0.26 : undefined;
    const list = p.weapon === 'bat' ? hits.slice(0, 2) : hits.slice(0, 1);
    if (!list.length) list.push([0, best, 0]);
    list.forEach(([, e], i) => damage(s, e, i === 0 ? (fist ? (p.combo ? 26 : 16) : w.dmg) : Math.round(w.dmg * 0.6), p, heavy, i === 0 ? kb : kb * 0.7, stun));
  } else s.fx.push({ type: 'whiff', x: p.x, z: p.z, by: p.id });
}

function panic(s, x, z, r) { for (const e of s.ents) if (e.kind === 'ped' && e.hp > 0 && (e.x - x) ** 2 + (e.z - z) ** 2 < r * r) { e.flee = 6 + R(s) * 4; e.fromX = x; e.fromZ = z; } }

function damage(s, e, amt, src, heavy, kb, stunO) {
  if (e.hp <= 0 || e.kind === 'giver') return;
  if (e.streetHold && src && src.kind === 'player') acceptCall(s, 'hit');
  // the whole roll is the invulnerable window, so a mobile dodge lines up with the tell
  if (e.dodging || e.dodgeT > 0) { s.fx.push({ type: 'evade', x: e.x, z: e.z, to: e.id, by: src ? src.id : 0 }); return; }
  // blocking soaks most of a melee hit from the front
  if (e.block === true && src && src.kind && dist2(e, src) < 16) { // peds' e.block is a block id, not the block button
    const d0 = Math.sqrt(dist2(e, src)) || 1, front = ((src.x - e.x) * Math.sin(e.ry) + (src.z - e.z) * Math.cos(e.ry)) / d0;
    if (front > 0.2) { amt = Math.ceil(amt * 0.2); e.hp -= amt; e.kx = (e.x - src.x) / d0 * 2; e.kz = (e.z - src.z) / d0 * 2; s.fx.push({ type: 'block', x: e.x, z: e.z, to: e.id, by: src.id }); if (e.hp <= 0) e.hp = 1; return; }
  }
  e.hp -= amt; e.hitT = heavy ? 0.45 : 0.3; e.stun = stunO != null ? stunO : (heavy ? 0.7 : 0.4); e.windup = 0; e.tell = '';
  const ko = e.hp <= 0;
  let dx = 0, dz = 0;
  if (src) {
    const d = Math.sqrt(dist2(e, src)) || 1, k = (kb ?? (heavy ? 7 : 4)) * (ko ? 1.7 : 1);
    dx = (e.x - src.x) / d; dz = (e.z - src.z) / d;
    e.kx = dx * k; e.kz = dz * k;
  }
  const tag = src && src.kind === 'player' ? (src.weapon === 'fists' ? (src.combo ? 'CROSS' : 'JAB') : src.weapon === 'knuckles' ? 'KNUCK' : src.weapon === 'bat' ? 'BAT' : src.weapon === 'shotgun' ? 'BUCK' : src.weapon === 'pistol' ? 'SHOT' : '') : (src && src.style ? src.style : '');
  s.fx.push({ type: 'hit', x: e.x, z: e.z, by: src ? src.id : 0, to: e.id, heavy: !!heavy, ko, dx, dz, amt, tag, wpn: src && src.weapon ? src.weapon : '' });
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
  log(s, busted ? `Bail: -$${lost}` : `Lost $${lost}. Back at your turf.`);
  if (p.car) exitCar(s, p);
  if (s.mission && DOWN_FAILS.has(s.mission.kind)) failMission(s, busted ? 'Locked up. Job failed.' : 'You went down. Job failed.');
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
  // back at your nearest safehouse; without one, at your first block
  const c = blockCenter(own[0]); let at = { x: c.x + BLOCK / 2 + 3, z: c.z }, bd = Infinity;
  for (const i of s.houses || []) { const q = houseSpot(i), d = dist2(q, p); if (d < bd) { bd = d; at = { x: q.x, z: q.z }; } }
  p.x = at.x; p.z = at.z; p.hp = p.max; p.kx = p.kz = 0; p.heat = 0; p.dodgeBuf = 0;
  if (busted) { p.ammo = 0; p.shells = 0; p.weapon = meleeFallback(p); }
  // the chase is over: officers leave, and no cruiser keeps a siren
  for (const e of s.ents) if (e.kind === 'cop') e.leave = true;
  for (const car of s.cars) if (car.siren) car.siren = false;
  // a bust is not an ambush window: the corner call ends and stays quiet for a bit
  endCall(s, 'bust');
  const calls = ensureCalls(s); calls.grace = 12; calls.cd = Math.max(calls.cd || 0, 12);
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
    c.hp = 0; c.wrecked = true; c.v = 0; c.ai = false; c.siren = false; s.fx.push({ type: 'wreck', x: c.x, z: c.z });
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
  // kind drives the look: store, house, apt (Eastside), mostly apt (Midtown), tower (Downtown), shed (Harbor)
  const c = blockCenter(b), h = BLOCK / 2, w = 13, out = [], d = districtOf(b);
  let i = 0;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const r = (b.id * 13 + sx * 3 + sz * 5 + 20) % 4;
    let kind, height;
    if (d === 0) { kind = i === 0 ? 'store' : i === 3 && b.id % 2 ? 'apt' : 'house'; height = kind === 'apt' ? 11 : kind === 'store' ? 6 : 6.5; }
    else if (d === 3) { kind = i === 0 ? 'store' : r === 0 ? 'house' : 'apt'; height = kind === 'apt' ? 11 + r : kind === 'store' ? 6 : 6.5; }
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
  if (c.scout) {
    const p = player(s);
    c.scoutT = (c.scoutT || 0) + dt;
    const target = 18;
    c.v += Math.sign(target - c.v) * Math.min(Math.abs(target - c.v), 14 * dt);
    c.x += Math.sin(c.ry) * c.v * dt; c.z += Math.cos(c.ry) * c.v * dt;
    const d = Math.hypot(c.x - p.x, c.z - p.z);
    c.scoutNear = Math.min(c.scoutNear || 999, d);
    if (d < 16 && (c.honk || 0) < 4) c.honk = 4;
    const ahead = (p.x - c.x) * Math.sin(c.ry) + (p.z - c.z) * Math.cos(c.ry);
    if ((c.scoutNear < 14 && ahead < -4) || c.scoutT > 8) c.scoutDone = true;
    return;
  }
  const dx = Math.round(Math.sin(c.ry)), dz = Math.round(Math.cos(c.ry)), sg = dx || dz;
  const along = dx !== 0 ? c.x : c.z;
  let blocked = false;
  // red light: stop before the next intersection
  const idx = along / PITCH + GRID / 2, nextI = sg > 0 ? Math.floor(idx + 1e-6) + 1 : Math.ceil(idx - 1e-6) - 1;
  const toStop = (lineCoord(nextI) - along) * sg;
  const sig = signal(s), axis = dx === 0 ? 'z' : 'x';
  // the Loop: the ring road around the city. Traffic on it runs faster and does not stop for the lights.
  const onLoop = Math.abs(Math.abs(nearestLine(dx !== 0 ? c.z : c.x)) - (GRID * PITCH) / 2) < 1;
  if (!onLoop && !c.flee && sig !== axis && toStop > 9 && toStop < 15 && nextI >= 0 && nextI <= GRID) blocked = true;
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
  const target = blocked ? 0 : c.cruise * (onLoop ? 1.6 : 1);
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
// Five stars, in a car, at speed: two cruisers are parked nose to tail across the street about 95 m ahead,
// with two officers on foot beside them. At most two roadblocks stand at once; ones left far behind are cleared.
function roadblockStep(s, p, st, dt) {
  for (const c of s.cars) if (c.roadblock && (st === 0 || dist2(c, p) > 170 * 170)) c.remove = true;
  s.blockT = Math.max(0, (s.blockT || 0) - dt);
  if (st < 5 || !p.car || s.blockT > 0) return;
  const car = s.cars.find((c) => c.id === p.car); if (!car || Math.abs(car.v) < 9) return;
  if (s.cars.filter((c) => c.roadblock && !c.remove).length >= 4) return;
  const sx = Math.sin(car.ry) * Math.sign(car.v), sz = Math.cos(car.ry) * Math.sign(car.v), alongX = Math.abs(sx) > Math.abs(sz);
  const E = (GRID * PITCH) / 2;
  // snapped to the street the car is on, in the middle of a block side (never in an intersection)
  const line = nearestLine(alongX ? car.z : car.x), ahead = (alongX ? car.x : car.z) + Math.sign(alongX ? sx : sz) * 95;
  const mid = lineCoord(Math.max(0, Math.min(GRID - 1, Math.floor(ahead / PITCH + GRID / 2)))) + PITCH / 2;
  if (Math.abs(mid) > E || Math.abs(mid - (alongX ? car.x : car.z)) < 50) return;
  s.blockT = 14;
  for (const off of [-2.7, 2.7]) {
    const x = alongX ? mid : line + off, z = alongX ? line + off : mid;
    const c = makeCar(s, x, z, alongX ? 0 : Math.PI / 2, 'police', false); c.cops = true; c.siren = true; c.roadblock = true; s.cars.push(c);
    s.ents.push(newEnt(s, { kind: 'cop', crew: 'police', hp: 120, x: x + (alongX ? -Math.sign(sx) * 3 : off), z: z + (alongX ? off : -Math.sign(sz) * 3), weapon: 'pistol', look: off > 0 ? 1 : 0, alert: 1 }));
  }
  s.fx.push({ type: 'roadblock', x: alongX ? mid : line, z: alongX ? line : mid });
}
function policeStep(s, dt) {
  const p = player(s), st = stars(p);
  const cops = s.ents.filter((e) => e.kind === 'cop' && e.hp > 0);
  s.policeT = (s.policeT || 0) - dt;
  // Escalation: four stars brings tactical units (more officers, three to a tougher cruiser, sent faster),
  // five stars adds roadblocks on the street ahead of a car on the run.
  const want = Math.min(12, st * 2 + (st >= 4 ? 2 : 0));
  if (st !== (s.starsSeen || 0)) {
    if (st > (s.starsSeen || 0) && st === 4) log(s, 'Tactical units are rolling.');
    if (st > (s.starsSeen || 0) && st === 5) log(s, 'Every unit is on you. Roadblocks ahead.');
    s.starsSeen = st;
  }
  roadblockStep(s, p, st, dt);
  if (st > 0 && cops.length < want && s.policeT <= 0) {
    s.policeT = st >= 4 ? 3.5 : 5;
    // spawn a cruiser on a street node 60 to 100 m away
    const { nodes } = nav();
    const opts = nodes.filter((n) => { const d = Math.hypot(n.x - p.x, n.z - p.z); return d > 60 && d < 110 && !insideBuilding(n.x, n.z, 1); });
    const n = opts[Math.floor(R(s) * opts.length)];
    if (n) {
      const car = makeCar(s, n.x, n.z, Math.atan2(p.x - n.x, p.z - n.z), 'police', false);
      car.cops = true; car.siren = true; s.cars.push(car);
      const tac = st >= 4; if (tac) car.hp = car.max = 220;
      for (let i = 0; i < (tac ? 3 : 2); i++) s.ents.push(newEnt(s, { kind: 'cop', crew: 'police', hp: tac ? 120 : 80, car: car.id, x: car.x, z: car.z, weapon: st >= 3 ? 'pistol' : 'fists', look: i }));
    }
  }
  // A siren belongs to an active chase. Empty stars, a bust, or a wreck ends it.
  if (st === 0) for (const c of s.cars) if (c.siren) c.siren = false;
  // cruisers chase
  for (const c of s.cars) if (c.cops && !c.wrecked) {
    const crew = s.ents.filter((e) => e.kind === 'cop' && e.car === c.id);
    if (!crew.length) {
      c.siren = st > 0 && dist2(c, p) < 80 * 80;
      c.v *= 1 - 2 * dt;
      if (st === 0) {
        c.leaveT = (c.leaveT || 0) + dt;
        const waiting = s.ents.some((e) => e.kind === 'cop' && e.hp > 0 && !e.car && !e.remove && dist2(e, c) < 45 * 45);
        if ((!waiting && c.leaveT > 2) || c.leaveT > 14 || dist2(c, p) > 80 * 80) c.remove = true;
      } else c.leaveT = 0;
      continue;
    }
    const leave = st === 0 || crew.some((e) => e.leave);
    c.siren = st > 0 && !leave;
    let goal = p;
    if (leave) {
      const ax = c.x - p.x, az = c.z - p.z, ad = Math.hypot(ax, az) || 1;
      goal = { x: c.x + (ax / ad) * 60, z: c.z + (az / ad) * 60 };
    }
    const wp = steerPoint(c, goal);
    const dx = wp.x - c.x, dz = wp.z - c.z, want = Math.atan2(dx, dz);
    let diff = want - c.ry; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const d = Math.sqrt(dist2(c, p));
    c.stuckT = Math.abs(c.v) < 1 ? (c.stuckT || 0) + dt : 0;
    let thr = Math.abs(diff) < 1.3 ? 1 : 0.35;
    if (!leave && c.stuckT > 1.5) { thr = -1; diff = -diff; if (c.stuckT > 3) c.stuckT = 0; }
    if (!leave && d < 16 && !p.car) thr = c.v > 2 ? -1 : 0;
    if (!leave && p.car && d < 8) thr = 0.6;
    driveCar(s, c, thr, Math.max(-1, Math.min(1, -diff * 2)), dt, { id: -1, kind: 'cop', crew: 'police', heat: 0 });
    for (const e of crew) { e.x = c.x; e.z = c.z; }
    if (!leave && d < 16 && Math.abs(c.v) < 3 && !p.car) for (const e of crew) { e.car = null; e.x = c.x + (e.look ? 2 : -2) * Math.cos(c.ry); e.z = c.z - (e.look ? 2 : -2) * Math.sin(c.ry); }
    if (leave) {
      c.leaveT = (c.leaveT || 0) + dt;
      c.leaveStill = Math.abs(c.v) < 1 ? (c.leaveStill || 0) + dt : 0;
      // far enough, or jammed, or the exit ran long: clear the unit instead of circling
      if (dist2(c, p) > 90 * 90 || c.leaveT > 8 || c.leaveStill > 2.5) {
        c.remove = true;
        for (const e of crew) e.remove = true;
      }
    } else { c.leaveT = 0; c.leaveStill = 0; }
  }
  for (const e of s.ents) if (e.kind === 'cop' && e.car && !s.cars.some((c) => c.id === e.car && !c.remove)) e.car = null;
  // officers on foot
  for (const e of s.ents) if (e.kind === 'cop' && !e.car && e.hp > 0 && !e.remove) {
    if (st === 0 || e.leave) {
      e.windup = 0; e.tell = '';
      // back to a live cruiser, or clear out. Never stand planted after the chase.
      if (dist2(e, p) > 70 * 70) { e.remove = true; continue; }
      const c = s.cars.find((c) => c.cops && !c.wrecked && !c.remove && dist2(c, e) < 45 * 45);
      if (c && dist2(c, e) < 9) { e.car = c.id; e.leaveT = 0; e.leaveStill = 0; e.leaveX = null; continue; }
      e.leaveT = (e.leaveT || 0) + dt;
      if (e.leaveX == null) { e.leaveX = e.x; e.leaveZ = e.z; }
      else {
        const moved = Math.hypot(e.x - e.leaveX, e.z - e.leaveZ);
        if (moved >= 0.6) { e.leaveX = e.x; e.leaveZ = e.z; e.leaveStill = 0; }
        else e.leaveStill = (e.leaveStill || 0) + dt;
      }
      if ((e.leaveStill || 0) > 1.6 || e.leaveT > (c ? 12 : 3)) { e.remove = true; continue; }
      if (c) moveToward(e, c, 4, dt);
      else {
        const ax = e.x - p.x, az = e.z - p.z, ad = Math.hypot(ax, az) || 1;
        moveToward(e, { x: e.x + (ax / ad) * 18, z: e.z + (az / ad) * 18 }, 4, dt);
      }
      continue;
    }
    if (e.stun > 0) { e.windup = 0; e.tell = ''; continue; }
    e.leaveT = 0; e.leaveStill = 0; e.leaveX = null;
    const target = p.car ? s.cars.find((c) => c.id === p.car) : p;
    const d = Math.sqrt(dist2(e, target));
    if (p.car && d < 3 && Math.abs(target.v) < 2) { exitCar(s, p); log(s, 'The cops dragged you out of the car.'); continue; }
    if (e.windup > 0) {
      e.windup -= dt; e.moving = 0.15; e.ry = Math.atan2(p.x - e.x, p.z - e.z);
      if (e.windup <= 0) {
        e.tell = '';
        if (!p.car && Math.hypot(e.x - p.x, e.z - p.z) < 2.25) damage(s, p, 9, e, false);
        else s.fx.push({ type: 'whiff', x: e.x, z: e.z, by: e.id, to: p.id });
      }
      continue;
    }
    if (e.weapon === 'pistol' && d < 18 && d > 3 && !p.car) {
      e.ry = Math.atan2(p.x - e.x, p.z - e.z); e.moving = 0;
      if (e.cd <= 0 && clearLine(e, p)) { e.cd = 1.4 + R(s); e.swing = 0.25; s.fx.push({ type: 'shot', x: e.x, z: e.z, tx: p.x, tz: p.z, by: e.id }); if (R(s) < 0.6) damage(s, p, 7, e, false); }
      continue;
    }
    if (d < 1.9 && !p.car) {
      e.ry = Math.atan2(p.x - e.x, p.z - e.z); e.moving = 0;
      if (e.cd <= 0) {
        e.windup = 0.32; e.swing = 0.4; e.cd = 1.15; e.tell = 'rush'; e.style = e.style || 'rush';
        s.fx.push({ type: 'tell', x: e.x, z: e.z, by: e.id, to: p.id, style: 'rush' });
      }
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
// ---------- shops and safehouses ----------
// Things to spend cash on. A shop is a counter on a street corner: stand at it and buy. A safehouse is bought
// once: you come back there instead of your first block when you go down, you heal and the heat drains while
// you stand at it with no police close, and a car of your own waits at its curb.
export const SHOP_ITEMS = {
  pistol: { name: 'Pistol, 24 rounds', cost: 150 },
  shotgun: { name: 'Shotgun, 10 shells', cost: 220 },
  bat: { name: 'Bat', cost: 80 },
  knuckles: { name: 'Brass knuckles', cost: 60 },
  patch: { name: 'Patch up (full health)', cost: 40 },
};
export const SHOPS = [{ name: 'Pawn Counter', gx: 1, gz: 1 }, { name: 'Back Room Supply', gx: 4, gz: 3 }, { name: 'Dockside Locker', gx: 6, gz: 6 }];
export const HOUSES = [
  { name: 'Eastside walk-up', gx: 1, gz: 0, price: 800, car: 'sedan' },
  { name: 'Midtown apartment', gx: 2, gz: 3, price: 1600, car: 'lowrider' },
  { name: 'Downtown loft', gx: 5, gz: 3, price: 2800, car: 'muscle' },
  { name: 'Harbor bunk room', gx: 5, gz: 7, price: 3600, car: 'suv' },
];
const SPOT_R2 = 4.5 * 4.5;
// shops stand on one street corner of their block, safehouse doors on another; contacts use a third
export const shopSpot = (i) => cornerSpot({ gx: SHOPS[i].gx, gz: SHOPS[i].gz }, 1, -1);
export const houseSpot = (i) => cornerSpot({ gx: HOUSES[i].gx, gz: HOUSES[i].gz }, -1, 1);
const houseCurb = (i) => { const q = houseSpot(i); return { x: q.x - 2.4, z: q.z - 7 }; };
export function shopAt(p) { for (let i = 0; i < SHOPS.length; i++) if (dist2(shopSpot(i), p) < SPOT_R2) return i; return -1; }
export function houseAt(p) { for (let i = 0; i < HOUSES.length; i++) if (dist2(houseSpot(i), p) < SPOT_R2) return i; return -1; }
export const ownsHouse = (s, i) => !!(s.houses && s.houses.includes(i));
function buy(s, p, item) {
  const it = SHOP_ITEMS[item], cr = s.crews[p.crew];
  if (!it || shopAt(p) < 0 || p.car) return;
  if (item === 'patch' && p.hp >= p.max) { log(s, 'You are not hurt.'); return; }
  if ((item === 'bat' && p.hasBat) || (item === 'knuckles' && p.hasKnux)) { log(s, 'You already carry that.'); return; }
  if (cr.cash < it.cost) { log(s, `Need $${it.cost} for that.`); s.fx.push({ type: 'broke' }); return; }
  cr.cash -= it.cost;
  if (item === 'pistol') { p.ammo += 24; p.weapon = 'pistol'; }
  else if (item === 'shotgun') { p.shells = (p.shells || 0) + 10; p.weapon = 'shotgun'; }
  else if (item === 'bat') { p.hasBat = true; p.weapon = 'bat'; }
  else if (item === 'knuckles') { p.hasKnux = true; p.weapon = 'knuckles'; }
  else if (item === 'patch') p.hp = p.max;
  log(s, `Bought: ${it.name}. -$${it.cost}`); s.fx.push({ type: 'bought', item, cost: it.cost });
}
function buyHouse(s, p) {
  const i = houseAt(p), cr = s.crews[p.crew]; if (i < 0 || p.car) return;
  const H = HOUSES[i]; s.houses = s.houses || [];
  if (s.houses.includes(i)) { log(s, `The ${H.name} is already yours.`); return; }
  if (cr.cash < H.price) { log(s, `The ${H.name} costs $${H.price}.`); s.fx.push({ type: 'broke' }); return; }
  cr.cash -= H.price; s.houses.push(i); cr.rep += 20;
  log(s, `The ${H.name} is yours. -$${H.price}`); s.fx.push({ type: 'house', i, name: H.name });
  houseCar(s, i);
}
// the car that belongs to a safehouse: parked at its curb, put back when it is gone
function houseCar(s, i, p) {
  const at = houseCurb(i), mine = s.cars.find((c) => c.house === i && !c.wrecked);
  if (mine) {
    // left somewhere across town: it is brought back and fixed up once you are well away from it
    if (p && !mine.driver && dist2(mine, at) > 40 * 40 && dist2(mine, p) > 70 * 70) { mine.x = at.x; mine.z = at.z; mine.ry = 0; mine.v = 0; mine.hp = mine.max; }
    return;
  }
  if (s.cars.some((c) => dist2(c, at) < 16)) return; // something is parked in the spot
  const car = makeCar(s, at.x, at.z, 0, HOUSES[i].car, false); car.house = i; car.paint = 2; s.cars.push(car);
}
function housesStep(s, p, dt) {
  if (!s.houses || !s.houses.length) return;
  s.houseT = (s.houseT || 0) + dt;
  if (s.houseT > 20) { s.houseT = 0; for (const i of s.houses) if (dist2(houseCurb(i), p) > 60 * 60) houseCar(s, i, p); }
  const i = houseAt(p);
  if (i < 0 || !s.houses.includes(i) || p.car || p.hp <= 0) return;
  // home: you heal, and with no officer close the heat drains fast
  if (p.hp < p.max) p.hp = Math.min(p.max, p.hp + 12 * dt);
  if (p.heat > 0 && !s.ents.some((e) => e.kind === 'cop' && e.hp > 0 && dist2(e, p) < 30 * 30)) p.heat = Math.max(0, p.heat - 14 * dt);
}

// ---------- jobs ----------
// Contacts hand out the jobs. Unc stands on the home block; the others wait on a street corner of their
// block, outside the reach of whoever guards it, so talking to one never starts a fight.
export const CONTACTS = [
  { name: 'Unc', gx: 0, gz: 0 },
  { name: 'Dee', gx: 3, gz: 2, slot: 'crew', female: true, look: 0 },
  { name: 'Rook', gx: 5, gz: 4, slot: 'locals', look: 1 },
  { name: 'Sal', gx: 6, gz: 7, slot: 'locals', look: 5 },
];
// One chain, in order. by: who gives it. brief: the lines of the sit-down before the intro line.
// kind: hook, collect, chop, take, fetch, deliver, tail, race, chase, beat, defend, escape, hit, own.
export const MISSIONS = [
  { title: 'Bag Back', by: 'Unc', kind: 'hook', time: 90, reward: 120, rep: 12, gift: 'follower',
    brief: ['Unc: "You still got your feet under you. Sit down."', 'Unc: "A mugger went for your bag, then his boys, then a Red Kings car."', 'You: "I saw the car."'],
    intro: 'Unc: "He dropped your bag up the street. Grab it and bring it back. Then we talk real work."' },
  { title: 'Corner Collection', by: 'Unc', kind: 'collect', need: 3, district: 0, time: 150, reward: 200, rep: 15,
    brief: ['Unc: "Three corners on the Eastside owe me an envelope."', 'You: "And if they are short?"', 'Unc: "They will not be short. Not today."'],
    intro: 'Unc: "Three envelopes, three corners. Back here before the clock runs out."' },
  { title: 'Chop Job', by: 'Unc', kind: 'chop', car: 'muscle', reward: 400, rep: 30,
    brief: ['Unc: "My guy at the chop shop is short one muscle car."', 'You: "Any color?"', 'Unc: "Fast is the only color that matters."'],
    intro: 'Unc: "Find a muscle car and drop it at the chop shop on the marker."' },
  { title: 'Take Over', by: 'Unc', kind: 'take', reward: 600, rep: 50,
    brief: ['Unc: "Look around. This block is ours because we hold it."', 'Unc: "Now we hold one more."'],
    intro: 'Unc: "Time to grow. Take the block on the marker."' },
  { title: 'Package Run', by: 'Dee', kind: 'fetch', time: 150, reward: 300, rep: 20,
    handoff: 'Unc: "Go see Dee in Midtown. She runs the garage, and she needs a driver."',
    brief: ['Dee: "So you are the one Unc keeps talking about."', 'Dee: "A package came in on the Harbor side. Nobody touches it but you."'],
    intro: 'Dee: "Harbor drop, then straight back to me. You got 150 seconds."' },
  { title: 'Clean Delivery', by: 'Dee', kind: 'deliver', car: 'lowrider', district: 1, minHp: 0.7, reward: 450, rep: 25,
    brief: ['Dee: "That lowrider out front took me six weeks."', 'Dee: "The buyer is Downtown. He pays for paint, not dents."'],
    intro: 'Dee: "Drive the lowrider to the marker Downtown. Keep it clean."' },
  { title: 'Shadow', by: 'Dee', kind: 'tail', need: 35, reward: 500, rep: 25,
    brief: ['Dee: "Somebody is moving product through my streets and not paying."', 'Dee: "Do not stop him. Just see where he goes."'],
    intro: 'Dee: "Follow the marked car. Stay back, but do not lose it."' },
  { title: 'Loop Time', by: 'Dee', kind: 'race', time: 170, reward: 550, rep: 30,
    brief: ['Dee: "You want the fast jobs, I need to know you are fast."', 'Dee: "One lap of the Loop. The whole ring."'],
    intro: 'Dee: "Get a car, hit every marker around the Loop. 170 seconds."' },
  { title: 'Repo', by: 'Dee', kind: 'chase', reward: 600, rep: 35,
    brief: ['Dee: "A customer just drove off without paying."', 'Dee: "Stop that car. Ram it or take it at a light, I do not care which."'],
    intro: 'Dee: "Stop the marked car before it gets away."' },
  { title: 'Send a Message', by: 'Rook', kind: 'beat', crew: 'reds', need: 3, reward: 500, rep: 30,
    handoff: 'Dee: "You drive fine. Rook wants you Downtown. That is the real work."',
    brief: ['Rook: "You hear what the Red Kings been saying about your people?"', 'You: "I heard."', 'Rook: "Then go make them stop saying it."'],
    intro: 'Rook: "Knock out 3 Red Kings."' },
  { title: 'Blue Notice', by: 'Rook', kind: 'beat', crew: 'blues', need: 4, reward: 550, rep: 30,
    brief: ['Rook: "Blue Hand thinks the Red Kings were a one off."', 'Rook: "Show them it is a policy."'],
    intro: 'Rook: "Knock out 4 Blue Hand."' },
  { title: 'Hold the Line', by: 'Rook', kind: 'defend', crew: 'reds', need: 4, reward: 700, rep: 40,
    brief: ['Rook: "They are coming for one of your blocks. Tonight."', 'Rook: "Lose it and everybody in this city knows you can be pushed."'],
    intro: 'Rook: "Get to your block on the marker and hold it."' },
  { title: 'Lose Them', by: 'Rook', kind: 'escape', heat: 55, reward: 600, rep: 35,
    brief: ['Rook: "Somebody gave the police your name."', 'Rook: "They are already looking. Disappear."'],
    intro: 'Rook: "You are wanted. Shake the police."' },
  { title: 'The Lieutenant', by: 'Rook', kind: 'hit', crew: 'reds', who: 'Red Kings lieutenant', reward: 900, rep: 60,
    brief: ['Rook: "The Red Kings have a lieutenant who plans every raid."', 'Rook: "Put him on the ground and the raids get stupid."'],
    intro: 'Rook: "Knock out the Red Kings lieutenant on the marker."' },
  { title: 'Dock Pickup', by: 'Sal', kind: 'collect', need: 4, district: 2, time: 170, reward: 700, rep: 35,
    handoff: 'Rook: "Sal runs the freight at the Harbor. Tell him I sent you."',
    brief: ['Sal: "Rook says you are useful. We will see."', 'Sal: "Four crates on the docks. Gold Line does not know they are there yet."'],
    intro: 'Sal: "Four crates, then back to me. 170 seconds."' },
  { title: 'Hot Cargo', by: 'Sal', kind: 'deliver', car: 'van', home: true, heat: 50, reward: 900, rep: 45,
    brief: ['Sal: "The van is loaded and the police know the plate."', 'Sal: "Get it to your side of town anyway."'],
    intro: 'Sal: "Drive the van to your home block. They will be on you."' },
  { title: 'Gold Standard', by: 'Sal', kind: 'hit', crew: 'golds', who: 'Gold Line captain', reward: 1000, rep: 70,
    brief: ['Sal: "Gold Line has a captain on these docks. He taxes every load."', 'Sal: "I am done paying."'],
    intro: 'Sal: "Knock out the Gold Line captain on the marker."' },
  { title: 'Six Blocks', by: 'Sal', kind: 'own', need: 6, reward: 1200, rep: 80,
    brief: ['Sal: "You fight well. Holding ground is different."', 'Sal: "Come back when six blocks answer to you."'],
    intro: 'Sal: "Hold six blocks at once."' },
  { title: 'Run the City', by: 'Unc', kind: 'take', rival: true, reward: 2000, rep: 150,
    handoff: 'Sal: "Go home. Unc has one more thing to say to you."',
    brief: ['Unc: "One block. That is what we had."', 'Unc: "Now look at the map. One more, and nobody tells you no."'],
    intro: 'Unc: "Take the rival block on the marker. This is the one that counts."' },
];
// jobs that end if you get knocked out or locked up
const DOWN_FAILS = new Set(['deliver', 'tail', 'race', 'chase', 'defend', 'escape']);
const curbSpot = (b) => { const c = blockCenter(b); return { x: c.x + PITCH / 2 - 5.6, z: c.z + 14 }; };
const cornerSpot = (b, sx = -1, sz = -1) => { const c = blockCenter(b); return { x: c.x + sx * (BLOCK / 2 + 1), z: c.z + sz * (BLOCK / 2 + 1) }; };
// every contact stands in the world; called for new games and for saves made before a contact existed
export function ensureContacts(s) {
  for (const C of CONTACTS) {
    if (s.ents.some((e) => e.kind === 'giver' && e.name === C.name)) continue;
    const b = s.blocks[C.gz * GRID + C.gx], c = blockCenter(b), at = C.name === 'Unc' ? { x: c.x + 6, z: c.z + 6 } : cornerSpot(b);
    s.ents.push(newEnt(s, { kind: 'giver', crew: 'player', name: C.name, x: at.x, z: at.z, ry: C.name === 'Unc' ? Math.PI : Math.PI * 1.25, hp: 999, ...(C.slot && { slot: C.slot, female: !!C.female, look: C.look }) }));
  }
}
const giverNamed = (s, name) => s.ents.find((e) => e.kind === 'giver' && e.name === name) || s.ents.find((e) => e.kind === 'giver');
// who has the next job (or the running one)
export function contactFor(s) {
  const idx = s.mission ? s.mission.idx : Math.min(s.missionIdx, MISSIONS.length - 1);
  return giverNamed(s, (MISSIONS[idx] || MISSIONS[0]).by);
}
// Saves from before the job chain: the old five jobs map onto the new list by name where they still exist.
export function migrate(s) {
  ensureContacts(s);
  if (s.jobsV !== 2) { s.jobsV = 2; s.mission = null; s.missionIdx = s.missionIdx > 0 ? 1 : 0; }
  addBikes(s); // saves from before the motorcycles get them parked
  return s;
}
const missionCar = (s, m) => (m.carId ? s.cars.find((c) => c.id === m.carId) : null);
function nearestBlocks(s, from, pred, n) {
  return s.blocks.filter(pred).map((b) => ({ b, d: dist2(blockCenter(b), from) })).sort((a, b) => a.d - b.d).slice(0, n).map((o) => o.b);
}
function startMission(s, p) {
  const M = MISSIONS[s.missionIdx], g = giverNamed(s, M.by);
  const m = { idx: s.missionIdx, title: M.title, kind: M.kind, stage: 0, timer: M.time || 0, count: 0, need: M.need || 0, crew: M.crew, reward: M.reward, rep: M.rep, gift: M.gift || null, target: null };
  const notRival = (b) => !RIVALS.has(b.owner);
  if (M.kind === 'hook') m.target = hookDrop(s, g);
  if (M.kind === 'fetch') {
    // the drop sits in the Harbor parking lane, outside any crew's guard area,
    // preferring a block that is not held by a rival crew
    const harbor = s.blocks.filter((b) => districtOf(b) === 2).sort((a, b) => dist2(blockCenter(a), g) - dist2(blockCenter(b), g));
    const b = harbor.find(notRival) || harbor[0];
    const c = blockCenter(b); m.target = { x: c.x - BLOCK / 2 - 5, z: c.z + 6 }; m.block = b.id;
  }
  if (M.kind === 'collect') {
    // one pickup on the street corner of each of the nearest blocks in the district, never on rival turf
    const gb = blockAt(s, g.x, g.z);
    let bs = nearestBlocks(s, g, (b) => districtOf(b) === M.district && notRival(b) && b !== gb, M.need);
    if (bs.length < M.need) bs = nearestBlocks(s, g, (b) => notRival(b) && b !== gb, M.need);
    m.points = bs.map((b) => cornerSpot(b, 1, 1)); m.need = m.points.length; m.target = m.points[0];
  }
  if (M.kind === 'take') {
    let b = null;
    if (M.rival) b = nearestBlocks(s, p, (b) => RIVALS.has(b.owner), 1)[0];
    if (!b) {
      const mine = s.blocks.filter((b) => b.owner === 'player');
      const opts = []; for (const o of mine) for (const n of neighbors(s, o)) if (n.owner !== 'player') opts.push(n);
      b = opts[0] || s.blocks.find((b) => b.owner !== 'player');
    }
    if (!b) { log(s, `${g.name}: "There is nothing left to take. It is all yours."`); s.missionIdx++; return; }
    m.block = b.id; const c = blockCenter(b); m.target = { x: c.x, z: c.z };
  }
  if (M.kind === 'deliver') {
    // parked at the curb a few steps from the contact's corner (no parked car is ever placed on that side)
    const car = makeCar(s, g.x - 2.4, g.z + 7, 0, M.car, false); s.cars.push(car);
    m.carId = car.id; m.carType = M.car; m.minHp = M.minHp || 0; m.heat = M.heat || 0;
    const home = s.blocks.find((b) => b.owner === 'player') || s.blocks[0];
    const to = M.home ? home : nearestBlocks(s, g, (b) => districtOf(b) === M.district && notRival(b), 3).pop() || home;
    m.dest = curbSpot(to); m.block = to.id;
  }
  if (M.kind === 'chop') m.carType = M.car || 'muscle';
  if (M.kind === 'tail' || M.kind === 'chase') {
    const car = spawnTraffic(s, false) || spawnTraffic(s, true);
    if (!car) { log(s, `${g.name}: "Streets are jammed. Come back in a minute."`); return; }
    car.mark = true; m.carId = car.id; m.lost = 0; m.spook = 0;
    if (M.kind === 'chase') { car.flee = true; car.cruise = 17; }
  }
  if (M.kind === 'race') {
    // one lap of the ring road: the nearest point on it, the four corners in order, and back to the start
    const E = (GRID * PITCH) / 2, c = blockCenter(blockAt(s, g.x, g.z) || s.blocks[0]);
    const start = Math.abs(c.x) > Math.abs(c.z) ? { x: Math.sign(c.x) * E, z: c.z + PITCH / 2 } : { x: c.x + PITCH / 2, z: Math.sign(c.z || -1) * E };
    const corners = [[-E, -E], [E, -E], [E, E], [-E, E]].map(([x, z]) => ({ x, z }));
    let k = 0, bd = Infinity; corners.forEach((q, i) => { const d = dist2(q, start); if (d < bd) { bd = d; k = i; } });
    m.points = [start, ...[0, 1, 2, 3].map((i) => corners[(k + i) % 4]), start]; m.need = m.points.length; m.target = m.points[0];
  }
  if (M.kind === 'defend') {
    const b = nearestBlocks(s, p, (b) => b.owner === 'player', 1)[0];
    if (!b) return;
    const from = neighbors(s, b).find((n) => n.owner !== 'player') || b, fc = blockCenter(from), bc = blockCenter(b);
    m.block = b.id; m.target = { x: bc.x, z: bc.z }; m.ids = [];
    for (let i = 0; i < M.need; i++) {
      // they gather on the far side of the next block and move in after a short count
      const u = spawnUnit(s, M.crew, 'attacker', from.id, fc.x + (fc.x - bc.x) * 0.2 + (i - 1.5) * 1.6, fc.z + (fc.z - bc.z) * 0.2 + (i % 2) * 1.6);
      u.target = b.id; u.gather = 14; m.ids.push(u.id);
    }
    b.raid = { crew: M.crew, eta: 14, from: from.id };
    s.fx.push({ type: 'raid', block: b.id, eta: 14, crew: M.crew });
  }
  if (M.kind === 'escape') { p.heat = Math.max(p.heat, M.heat); p.calmT = 0; }
  if (M.kind === 'hit') {
    // the mark stands with two guards on the nearest block his crew holds; with the crew wiped out, on a neutral one
    const b = nearestBlocks(s, p, (b) => b.owner === M.crew, 1)[0] || nearestBlocks(s, p, (b) => b.owner === 'neutral', 1)[0] || s.blocks[s.blocks.length - 1];
    const boss = spawnUnit(s, M.crew, 'defender', b.id); boss.hp = boss.max = 170; boss.weapon = 'bat'; boss.boss = true; boss.name = M.who;
    for (let i = 0; i < 2; i++) spawnUnit(s, M.crew, 'defender', b.id);
    m.markId = boss.id; m.who = M.who; m.short = M.who.split(' ').pop(); m.block = b.id; m.target = { x: boss.x, z: boss.z };
  }
  s.mission = m; log(s, M.intro); s.fx.push({ type: 'mission', state: 'start', title: M.title, idx: m.idx });
}
function hookDrop(s, g) {
  const spots = [[18, -6], [-16, 14], [22, 10], [8, -22], [20, 16], [-18, -10], [28, -2], [-8, 22]];
  for (const [dx, dz] of spots) {
    const x = g.x + dx, z = g.z + dz;
    if (Math.hypot(dx, dz) < 12 || insideBuilding(x, z, 0.8)) continue;
    return { x, z };
  }
  return { x: g.x + 18, z: g.z - 6 };
}
function grantFollower(s) {
  const p = player(s); if (!p) return null;
  if (squadOf(s, p).length >= SQUAD_MAX) {
    const b = weakestHeld(s, p.crew);
    const u = spawnUnit(s, p.crew, 'defender', b.id); u.guard = true;
    log(s, `Unc's guy went to guard ${b.hustle}.`);
    return u;
  }
  let x = p.x + 1.8, z = p.z + 1.2;
  if (insideBuilding(x, z, 0.5)) { x = p.x - 1.8; z = p.z - 1.2; }
  const u = spawnUnit(s, p.crew, 'follower', 0, x, z); u.leader = p.id;
  log(s, 'Unc: "This one rolls with you. No charge."');
  s.fx.push({ type: 'gift', id: u.id });
  return u;
}
// called when the player gets into a car
function missionCheck(s, p) {
  const m = s.mission; if (!m) return;
  const c = s.cars.find((c) => c.id === p.car); if (!c) return;
  if (m.kind === 'chop' && m.stage === 0 && c.type === m.carType) {
    m.stage = 1; const b = s.blocks.find((b) => b.hustle === 'Chop Shop') || s.blocks[5]; m.target = curbSpot(b); m.target.z -= 2;
    log(s, 'Nice ride. Take it to the chop shop marker.');
  }
  if (m.kind === 'deliver' && m.stage === 0 && c.id === m.carId) {
    m.stage = 1; m.target = m.dest;
    if (m.heat) { p.heat = Math.max(p.heat, m.heat); p.calmT = 0; log(s, 'The police have the plate. Drive.'); }
    else log(s, 'Take it to the marker. Easy on the paint.');
  }
  if (m.kind === 'tail' && c.id === m.carId) failMission(s, 'You were meant to follow it, not take it. Job failed.');
  if (m.kind === 'chase' && c.id === m.carId) { c.mark = false; c.flee = false; passMission(s); }
}
function missionStep(s, p, dt) {
  const m = s.mission; if (!m) return;
  if (m.timer > 0) { m.timer -= dt; if (m.timer <= 0) { failMission(s, 'Out of time. Job failed.'); return; } }
  const near = (r) => m.target && (p.x - m.target.x) ** 2 + (p.z - m.target.z) ** 2 < r * r;
  const g = giverNamed(s, (MISSIONS[m.idx] || MISSIONS[0]).by), car = missionCar(s, m);
  if (m.kind === 'hook' || m.kind === 'fetch') {
    if (m.stage === 0 && near(4)) { m.stage = 1; m.target = { x: g.x, z: g.z }; log(s, m.kind === 'hook' ? `Got the bag. Bring it back to ${g.name}.` : `Got the package. Bring it back to ${g.name}.`); }
    else if (m.stage === 1 && near(4)) passMission(s);
  } else if (m.kind === 'collect') {
    if (m.stage === 0 && near(4)) {
      m.count++;
      if (m.count >= m.need) { m.stage = 1; m.target = { x: g.x, z: g.z }; log(s, `That is all of them. Back to ${g.name}.`); }
      else { m.target = m.points[m.count]; log(s, `Got it. ${m.need - m.count} to go.`); }
    } else if (m.stage === 1 && near(4)) passMission(s);
  } else if (m.kind === 'beat') { if (m.count >= m.need) passMission(s); }
  else if (m.kind === 'chop') {
    if (m.stage === 0) { let best = null, bd = Infinity; for (const c of s.cars) if (c.type === m.carType && !c.wrecked && !c.cops) { const d = dist2(c, p); if (d < bd) { bd = d; best = c; } } m.target = best ? { x: best.x, z: best.z } : null; }
    else if (near(6) && p.car) { const c = s.cars.find((c) => c.id === p.car); if (c.type === m.carType) { exitCar(s, p); c.remove = true; passMission(s); } }
  } else if (m.kind === 'take') { if (s.blocks[m.block].owner === 'player') passMission(s); }
  else if (m.kind === 'deliver') {
    if (!car || car.wrecked) { failMission(s, 'The car is wrecked. Job failed.'); return; }
    if (m.minHp && car.hp < car.max * m.minHp) { failMission(s, 'Too much damage. The buyer walked. Job failed.'); return; }
    if (m.stage === 0 || p.car !== car.id) { m.stage = p.car === car.id ? 1 : m.stage; m.target = p.car === car.id ? m.dest : { x: car.x, z: car.z }; }
    else if (near(6)) { exitCar(s, p); car.remove = true; passMission(s); }
  } else if (m.kind === 'tail') {
    if (!car || car.wrecked) { failMission(s, 'The car is wrecked. Job failed.'); return; }
    m.target = { x: car.x, z: car.z };
    const d = Math.sqrt(dist2(car, p));
    if (m.stage === 0) { if (d < 50) { m.stage = 1; log(s, 'There it is. Stay back and keep it in sight.'); } }
    else {
      if (d > 9 && d < 60) m.count += dt;
      m.spook = d < 7 ? m.spook + dt : Math.max(0, m.spook - dt);
      m.lost = d > 85 ? m.lost + dt : 0;
      if (m.spook > 3) failMission(s, 'Too close. He made you. Job failed.');
      else if (m.lost > 8) failMission(s, 'You lost him. Job failed.');
      else if (m.count >= m.need) { car.mark = false; passMission(s); }
    }
  } else if (m.kind === 'chase') {
    if (!car) { failMission(s, 'He got away. Job failed.'); return; }
    m.target = { x: car.x, z: car.z };
    const d = Math.sqrt(dist2(car, p));
    if (d < 60) m.stage = 1;
    m.lost = m.stage === 1 && d > 150 ? m.lost + dt : 0;
    if (car.wrecked || car.hp <= car.max * 0.4) { car.mark = false; car.flee = false; car.ai = false; car.v = 0; passMission(s); }
    else if (m.lost > 10) { car.mark = false; car.flee = false; failMission(s, 'He got away. Job failed.'); }
  } else if (m.kind === 'race') {
    if (near(11) && p.car) {
      m.count++;
      if (m.count >= m.need) passMission(s);
      else { m.target = m.points[m.count]; s.fx.push({ type: 'checkpoint', n: m.count, of: m.need }); }
    }
  } else if (m.kind === 'defend') {
    const b = s.blocks[m.block];
    if (b.owner !== 'player') { failMission(s, `${b.hustle} fell. Job failed.`); return; }
    const up = s.ents.filter((e) => m.ids.includes(e.id) && e.hp > 0).length;
    m.count = m.need - up;
    if (up === 0) passMission(s);
  } else if (m.kind === 'escape') {
    m.count += dt;
    if (stars(p) === 0 && m.count > 3) passMission(s);
  } else if (m.kind === 'hit') {
    const e = s.ents.find((e) => e.id === m.markId);
    if (!e || e.hp <= 0) passMission(s);
    else m.target = { x: e.x, z: e.z };
  } else if (m.kind === 'own') {
    m.count = s.blocks.filter((b) => b.owner === 'player').length;
    if (m.count >= m.need) passMission(s);
  }
}
// the one line under the job title on the HUD
export function missionText(s) {
  const m = s.mission; if (!m) return '';
  const by = (MISSIONS[m.idx] || MISSIONS[0]).by, left = m.need - m.count;
  switch (m.kind) {
    case 'hook': return m.stage ? `Bring the bag back to ${by}.` : 'Grab the bag at the yellow marker.';
    case 'fetch': return m.stage ? `Bring the package to ${by}.` : 'Get the package at the yellow marker.';
    case 'collect': return m.stage ? `Bring it all back to ${by}.` : `Pickup at the marker (${m.count}/${m.need}).`;
    case 'beat': return `Knock out ${CREWS[m.crew].name} (${m.count}/${m.need}).`;
    case 'chop': return m.stage ? 'Drive it to the chop shop marker.' : `Steal a ${m.carType} car (marked).`;
    case 'take': return 'Take the marked block.';
    case 'deliver': { const c = missionCar(s, m), hp = c ? Math.round((100 * c.hp) / c.max) : 0; return !m.stage ? `Get in the ${m.carType}.` : m.minHp ? `To the marker. Car ${hp}%, min ${Math.round(m.minHp * 100)}%.` : 'Drive it to the marker.'; }
    case 'tail': return m.stage ? `Follow, not too close (${Math.floor(m.count)}/${m.need}s).` : 'Find the marked car.';
    case 'chase': return 'Ram or take the marked car.';
    case 'race': return `Drive to the marker (${m.count}/${m.need}).`;
    case 'defend': return `Hold the block. ${left} left.`;
    case 'escape': return 'Lose the police.';
    case 'hit': return `Knock out the ${m.short}.`; // short on purpose: the phone HUD has one line
    case 'own': return `Hold ${m.need} blocks (${m.count}/${m.need}).`;
    default: return '';
  }
}
function passMission(s) {
  const m = s.mission; s.crews.player.cash += m.reward; s.crews.player.rep += m.rep;
  log(s, `Job done: ${m.title}. +$${m.reward}`); s.fx.push({ type: 'mission', state: 'pass', title: m.title, reward: m.reward, rep: m.rep });
  s.mission = null; s.missionIdx++;
  if (m.gift === 'follower') grantFollower(s);
  const next = MISSIONS[s.missionIdx];
  if (next && next.handoff) log(s, next.handoff);
}
function failMission(s, why) {
  const m = s.mission, car = missionCar(s, m);
  if (car && (m.kind === 'tail' || m.kind === 'chase')) { car.mark = false; car.flee = false; if (car.ai) car.cruise = 9; }
  log(s, why); s.fx.push({ type: 'mission', state: 'fail', title: m.title }); s.mission = null;
}

// ---------- main step ----------
export function step(s, dt) {
  if (s.over) return;
  s.t += dt;
  const p = player(s);
  for (const b of s.blocks) if (s.crews[b.owner] && b.owner !== 'neutral') b.stash = (b.stash || 0) + stashRate(s, b) * dt;
  // walking onto your block pockets whatever the hustle has piled up
  const hereB = blockAt(s, p.x, p.z);
  const enteredB = !!hereB && hereB.id !== p.wasBlock;
  p.wasBlock = hereB ? hereB.id : -1;
  if (hereB && hereB.owner === p.crew && p.hp > 0 && !(p.downT > 0)) pocketStash(s, hereB, p.crew, enteredB);
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
  for (const c of traffic) if (dist2(c, p) > 180 * 180 && !c.mark) c.remove = true;
  if (traffic.length < s.cfg.traffic && R(s) < dt) spawnTraffic(s, false);
  // entities
  const chasers = new Map(), cells = bucketEnts(s);
  for (const e of s.ents) {
    if (e.cd > 0) e.cd -= dt; if (e.hitT > 0) e.hitT -= dt; if (e.swing > 0) e.swing -= dt; if (e.stun > 0) e.stun -= dt; if (e.pathT > 0) e.pathT -= dt; if (e.jumpT > 0) e.jumpT -= dt; if (e.dodgeCd > 0) e.dodgeCd -= dt;
    if (e.kind === 'player' && e.dodgeBuf > 0) { e.dodgeBuf -= dt; if (e.dodgeCd <= 0 && e.dodgeT <= 0 && e.hp > 0 && !e.car && !(e.downT > 0)) startDodge(s, e, e.dodgeDx, e.dodgeDz); }
    e.dodging = e.dodgeT > 0; if (e.dodgeT > 0) e.dodgeT = Math.max(0, e.dodgeT - dt);
    if (e.kx || e.kz) { e.x += e.kx * dt; e.z += e.kz * dt; e.kx *= 1 - 6 * dt; e.kz *= 1 - 6 * dt; if (Math.abs(e.kx) + Math.abs(e.kz) < 0.1) e.kx = e.kz = 0; collideBuildings(e, 0.5); clampWorld(e); }
    if (e.kind === 'ped') { pedStep(s, e, dt, p); if (dist2(e, p) > 130 * 130 && e.hp > 0) { e.remove = true; } continue; }
    if (e.kind !== 'npc' || e.hp <= 0) continue;
    // a scout rides the commandeered traffic car until the drive-by passes
    if (e.scout && e.car && !e.bail) {
      const car = s.cars.find((c) => c.id === e.car);
      if (car) { e.x = car.x; e.z = car.z; e.ry = car.ry; continue; }
    }
    e.moving = 0;
    if (e.stun > 0) { e.windup = 0; e.tell = ''; continue; }
    // an offer stands and faces you until you choose. It does not walk up and swing.
    if (e.streetHold) {
      e.moving = 0; e.windup = 0;
      const dx = p.x - e.x, dz = p.z - e.z;
      if (dx * dx + dz * dz > 0.04) e.ry = Math.atan2(dx, dz);
      continue;
    }
    // raid party holds on its own block until the gather timer runs out
    if (e.gather > 0) { e.gather = Math.max(0, e.gather - dt); continue; }
    let foe = null, fd = (e.guard ? 30 : e.scout ? 18 : 12) ** 2;
    for (const o of nearbyEnts(cells, e.x, e.z, nbFoe)) if (o.hp > 0 && hostile(e, o) && !o.car) { const d = dist2(o, e); if (d < fd) { fd = d; foe = o; } }
    let goal, followSpeed = 0;
    if (e.role === 'follower') {
      // recruits walk in a loose formation behind you and only fight foes right next to you
      const l = s.ents.find((x) => x.id === e.leader);
      // squad rides along: run to the car, hop in (1.2 s max), hop out beside it when you get out
      if (l && l.car && !e.car) {
        const car = s.cars.find((c) => c.id === l.car); e.board = (e.board || 0) + dt;
        if (car && (dist2(car, e) < 3.2 * 3.2 || e.board > 1.2) && s.ents.filter((x) => x.car === car.id).length < 4) { e.car = car.id; e.board = 0; continue; }
        if (car) { goal = car; followSpeed = 9.6; foe = null; }
      } else if (e.car) {
        const car = s.cars.find((c) => c.id === e.car);
        if (l && l.car === e.car && car) { e.x = car.x; e.z = car.z; continue; }
        const side = (e.slot ?? 0) % 2 ? 1 : -1, cr = car || e;
        e.x = cr.x + Math.cos(cr.ry || 0) * 2.2 * side; e.z = cr.z - Math.sin(cr.ry || 0) * 2.2 * side; e.car = null; e.board = 0;
        collideBuildings(e, 0.5);
      } else e.board = 0;
      if (foe && !(l && dist2(foe, l) < 7 * 7)) foe = null;
      if (foe) goal = foe;
      else if (l && !l.car) {
        const slot = (e.slot ??= s.ents.filter((x) => x.role === 'follower' && x.leader === e.leader).indexOf(e));
        const side = (slot % 2 ? 1 : -1) * (1.2 + Math.floor(slot / 2) * 0.9), back = 2.4 + Math.floor(slot / 2) * 1.3;
        const fx = Math.sin(l.ry), fz = Math.cos(l.ry);
        const spot = { x: l.x - fx * back + fz * side, z: l.z - fz * back - fx * side };
        const ds = Math.sqrt(dist2(spot, e));
        // keep up with a sprint (9 m/s), and snap back in if left far behind or stuck
        if (ds > 40) { e.x = spot.x; e.z = spot.z; collideBuildings(e, 0.5); }
        else if (ds > 1.0 && !goal) { goal = spot; followSpeed = ds > 8 ? 11 : ds > 3 ? 9.2 : 3.2; }
        e.stuckT = ds > 6 && e.lastDs !== undefined && ds >= e.lastDs - 0.01 ? (e.stuckT || 0) + dt : 0; e.lastDs = ds;
        if (e.stuckT > 2.5) { e.x = spot.x; e.z = spot.z; e.stuckT = 0; collideBuildings(e, 0.5); }
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
      else if (e.guard) {
        // posts spread around the block, slow patrol between two corners of its side
        e.post ??= (e.id * 2.39996) % (Math.PI * 2);
        e.patT = (e.patT || 0) + dt * 0.12;
        const a = e.post + Math.sin(e.patT) * 0.5, r = BLOCK / 2 + 1.2;
        const spot = { x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r };
        if (dist2(e, spot) > 2.2) { goal = spot; followSpeed = 1.6; }
      }
      else if (dist2(e, c) > 16) goal = c;
    }
    if (foe && goal === foe) engage(s, e, foe, dt);
    else if (goal) {
      const d = Math.sqrt(dist2(goal, e));
      if (d > 0.5) {
        const wp = steerPoint(e, goal);
        const dx = wp.x - e.x, dz = wp.z - e.z, dd = Math.hypot(dx, dz) || 1;
        const sp = followSpeed || 4;
        let sx = 0, sz = 0;
        for (const o of nearbyEnts(cells, e.x, e.z, nbSep)) if (o !== e && o.hp > 0 && o.kind === 'npc') { const q = dist2(o, e); if (q < 1 && q > 0) { sx += (e.x - o.x) / q; sz += (e.z - o.z) / q; } }
        e.x += (dx / dd * sp + sx * 0.6) * dt; e.z += (dz / dd * sp + sz * 0.6) * dt;
        const want = Math.atan2(dx, dz); let r = want - e.ry; r = Math.atan2(Math.sin(r), Math.cos(r)); e.ry += r * Math.min(1, dt * 10);
        e.moving = sp / 5;
        collideBuildings(e, 0.5);
      }
    }
  }
  openingStep(s, dt);
  for (const e of s.ents) if ((e.kind === 'npc' || e.kind === 'cop') && e.hp <= 0) e.downT = (e.downT || 0) + dt;
  s.ents = s.ents.filter((e) => !(e.downT > 6 && e.kind !== 'ped') && !e.remove);
  s.cars = s.cars.filter((c) => !c.remove || c.driver);
  const peds = s.ents.filter((e) => e.kind === 'ped').length;
  if (peds < s.cfg.peds && R(s) < dt * 2) spawnPed(s, p);
  // capture
  // Who stands on which block, in one pass over the fighters: a fighter can only be within half a block
  // pitch of its nearest block center, so each one counts for that block alone.
  const onBlock = new Map();
  for (const e of s.ents) if (e.hp > 0 && COMBAT.has(e.kind) && !e.car) {
    const b = blockAt(s, e.x, e.z); if (!b) continue;
    const d = dist2(e, blockCenter(b));
    let r = onBlock.get(b.id); if (!r) onBlock.set(b.id, r = { defenders: 0, inZone: {} });
    if (e.crew === b.owner && d < (PITCH / 2) ** 2) r.defenders++;
    if (e.crew !== b.owner && e.role !== 'brawler' && d < ZONE_R ** 2) r.inZone[e.crew] = (r.inZone[e.crew] || 0) + 1;
  }
  for (const b of s.blocks) {
    const here = onBlock.get(b.id), inZone = here ? here.inZone : {}, defenders = here ? here.defenders : 0;
    const claimers = Object.keys(inZone);
    if (defenders === 0 && claimers.length === 1) {
      const k = claimers[0];
      if (b.capBy !== k) { b.capBy = k; b.capT = 0; }
      b.capT += dt;
      if (b.capT >= CAPTURE_TIME) {
        const prev = b.owner; b.owner = k; b.capBy = null; b.capT = 0; b.raid = null; b.upgraded = null;
        s.crews[k].rep += 25;
        const loot = b.stash || 0;
        if (loot > 0 && s.crews[k]) {
          b.stash = 0; s.crews[k].cash += loot;
          const shown = Math.floor(loot);
          if (shown >= 1) {
            log(s, `${CREWS[k].name} took $${shown} stashed at ${b.hustle}.`);
            s.fx.push({ type: 'stash', block: b.id, amt: shown, hustle: b.hustle, crew: k, stolen: true });
          }
        }
        if (prev === 'player' && RIVALS.has(k)) {
          const bc = blockCenter(b);
          if (Math.hypot(p.x - bc.x, p.z - bc.z) > PITCH) {
            s.waypoint = { x: bc.x, z: bc.z, label: 'LOST', block: b.id };
            s.fx.push({ type: 'lost', block: b.id, x: bc.x, z: bc.z, crew: k, hustle: b.hustle });
            log(s, `${b.hustle} fell while you were away. Follow the marker back.`);
          }
        }
        const fresh = spawnUnit(s, k, 'defender', b.id);
        if (k === 'player') {
          // the squad stays behind to hold it (up to 3 guards), the rest keep following
          fresh.guard = true; let n = 1;
          for (const e of s.ents) if (n < GUARDS_PER_BLOCK && e.crew === 'player' && e.role === 'follower' && e.hp > 0) { makeGuard(e, b); n++; }
          s.fx.push({ type: 'guards', block: b.id, n });
          log(s, `${n} guard${n > 1 ? 's' : ''} now hold ${b.hustle}.`);
        }
        for (const e of s.ents) if (e.crew === k && e.role === 'attacker' && e.target === b.id) e.role = 'defender';
        const fromWhom = prev === 'player' ? 'you' : CREWS[prev].name;
        log(s, `${CREWS[k].name} took ${b.hustle} block from ${fromWhom}.`);
        s.fx.push({ type: 'capture', block: b.id, crew: k });
      }
    } else if (b.capT > 0) { b.capT = Math.max(0, b.capT - dt * 2); if (b.capT === 0) b.capBy = null; }
  }
  for (const k of ['reds', 'blues', 'golds']) aiThink(s, k, dt);
  for (const b of s.blocks) if (b.raid) {
    if (b.owner !== 'player') { b.raid = null; continue; }
    let eta = 0, alive = false;
    for (const e of s.ents) if (e.hp > 0 && e.crew === b.raid.crew && e.role === 'attacker' && e.target === b.id) {
      alive = true; if (e.gather > eta) eta = e.gather;
    }
    if (!alive || eta <= 0) {
      const crew = b.raid.crew; b.raid = null;
      if (alive) { s.fx.push({ type: 'raid', block: b.id, eta: 0, crew, state: 'go' }); log(s, `${CREWS[crew].name} are hitting ${b.hustle} now.`); }
    } else b.raid.eta = eta;
  }
  if (s.waypoint) {
    const wb = s.blocks[s.waypoint.block];
    const near = Math.hypot(p.x - s.waypoint.x, p.z - s.waypoint.z) < 18;
    if (!wb || wb.owner === 'player' || near) s.waypoint = null;
  }
  for (const b of s.blocks) if (b.owner === 'neutral' && R(s) < dt / 50 && s.ents.filter((e) => e.crew === 'neutral' && e.home === b.id && e.hp > 0).length < 2) spawnUnit(s, 'neutral', 'defender', b.id);
  missionStep(s, p, dt);
  housesStep(s, p, dt);
  callsStep(s, dt);
  const pt = s.blocks.filter((b) => b.owner === 'player').length;
  const rivals = s.blocks.filter((b) => ['reds', 'blues', 'golds'].includes(b.owner)).length;
  if (rivals === 0 && pt >= 10) s.over = 'win';
  else if (pt === 0) s.over = 'lose';
}

function npcReach(e) { return e.weapon === 'bat' ? 2.55 : 1.85; }
function isAggressor(s, e, foe) {
  const mates = [];
  for (const o of s.ents) if (o.kind === 'npc' && o.hp > 0 && !o.streetHold && (o === e || o.foeId === foe.id)) mates.push(o);
  mates.sort((a, b) => {
    const aw = a.windup > 0 ? 0 : 1, bw = b.windup > 0 ? 0 : 1;
    if (aw !== bw) return aw - bw;
    const ad = dist2(a, foe), bd = dist2(b, foe);
    if (Math.abs(ad - bd) > 0.25) return ad - bd;
    return a.id - b.id;
  });
  return mates.indexOf(e) > -1 && mates.indexOf(e) < CALLS.strikeCap;
}
function separateNpc(s, e, dt) {
  let sx = 0, sz = 0;
  for (const o of s.ents) if (o !== e && o.hp > 0 && (o.kind === 'npc' || o.kind === 'player' || o.kind === 'cop')) {
    const q = dist2(o, e); if (q < 1.1 && q > 0) { sx += (e.x - o.x) / q; sz += (e.z - o.z) / q; }
  }
  if (sx || sz) { e.x += sx * 0.7 * dt; e.z += sz * 0.7 * dt; }
}
// Rush closes, flank steps to the side, retreat backs off when hurt.
// Only strikeCap of them can be in a swing at once. The rest hold a ring.
function engage(s, e, foe, dt) {
  const style = e.style || 'rush';
  e.foeId = foe.id;
  if (e.brave > 0) e.brave -= dt;
  if (e.windup > 0) {
    e.windup -= dt; e.moving = 0.15;
    const dx = foe.x - e.x, dz = foe.z - e.z, dd = Math.hypot(dx, dz) || 1;
    e.ry = Math.atan2(dx, dz);
    const lunge = style === 'rush' ? 2.2 : 1.05;
    if (dd > npcReach(e) * 0.7) { e.x += (dx / dd) * lunge * dt; e.z += (dz / dd) * lunge * dt; collideBuildings(e, 0.5); }
    if (e.windup <= 0) {
      const told = e.tell; e.tell = '';
      const d = Math.hypot(foe.x - e.x, foe.z - e.z);
      if (foe.hp > 0 && d <= npcReach(e) + 0.45) damage(s, foe, e.weapon === 'bat' ? 14 : 8, e, e.weapon === 'bat');
      else s.fx.push({ type: 'whiff', x: e.x, z: e.z, by: e.id, to: foe.id, style: told });
      if (style === 'retreat') { e.backOff = 1.25; e.brave = 3.1; }
      e.flanked = false;
    }
    return;
  }
  if (e.backOff > 0) {
    e.backOff -= dt;
    const dx = e.x - foe.x, dz = e.z - foe.z, dd = Math.hypot(dx, dz) || 1;
    if (dd < 6.8) { e.x += (dx / dd) * 3.6 * dt; e.z += (dz / dd) * 3.6 * dt; e.ry = Math.atan2(-dx, -dz); e.moving = 0.85; collideBuildings(e, 0.5); }
    else e.moving = 0.2;
    return;
  }
  const d0 = Math.hypot(foe.x - e.x, foe.z - e.z);
  if (style === 'retreat' && e.hp < e.max * 0.45 && e.hp > 0 && (e.brave || 0) <= 0 && d0 < 5.5) {
    e.backOff = 1.35; e.brave = 3.2; return;
  }
  // Two may close. The rest stay on a ring for the whole beat, not only during a swing.
  if (!isAggressor(s, e, foe)) {
    const ang = Math.atan2(e.z - foe.z, e.x - foe.x);
    moveToward(e, { x: foe.x + Math.cos(ang) * 6.6, z: foe.z + Math.sin(ang) * 6.6 }, 3.6, dt);
    separateNpc(s, e, dt);
    return;
  }
  const reach = npcReach(e);
  let dest = foe;
  if (style === 'flank' && d0 > reach + 0.15 && !e.flanked) {
    const side = e.id % 2 ? 1 : -1;
    const px = -(foe.z - e.z), pz = (foe.x - e.x), pl = Math.hypot(px, pz) || 1;
    dest = { x: foe.x + (px / pl) * side * 2.6, z: foe.z + (pz / pl) * side * 2.6 };
    if (Math.hypot(dest.x - e.x, dest.z - e.z) < 1.25) e.flanked = true;
  }
  const dd = Math.hypot(dest.x - e.x, dest.z - e.z);
  if (dest === foe && d0 <= reach && e.cd <= 0) {
    const sec = (e.weapon === 'bat' ? 0.08 : 0) + (TELL_SEC[style] || 0.4);
    e.windup = sec; e.swing = sec + 0.06; e.cd = sec + (e.weapon === 'bat' ? 0.85 : 0.62); e.tell = style; e.moving = 0;
    s.fx.push({ type: 'tell', x: e.x, z: e.z, by: e.id, to: foe.id, style });
    return;
  }
  if (dd > 0.45) moveToward(e, dest, dest === foe ? (APPROACH[style] || 4) : 4.2, dt);
  separateNpc(s, e, dt);
}

// ---------- street calls ----------
// One optional corner event at a time: rival incursion, a posted ambush, or a
// broken deal. The player steps in or walks off. Nothing starts on the spawn
// beat, during the opening, a mission, a bust, or while the cops are already here.
function ensureCalls(s) {
  if (!s.calls) s.calls = { cd: CALLS.first, n: 0, active: null, grace: 0, ready: false, capped: false, seq: 0 };
  if (s.calls.seq == null) s.calls.seq = 0;
  return s.calls;
}
function callBlocked(s, p) {
  const c = s.calls;
  if (!c.ready || c.grace > 0) return true;
  if (s.t < 8) return true;
  if (s.mission) return true;
  if (s.opening && !s.opening.done) return true;
  if (!p || p.car || p.hp <= 0 || p.downT > 0) return true;
  if (stars(p) >= 4) return true;
  if (s.ents.some((e) => e.kind === 'cop' && e.hp > 0 && dist2(e, p) < 45 * 45)) return true;
  if (s.blocks.some((b) => b.owner === 'player' && b.raid && b.raid.eta > 0)) return true;
  const hot = s.ents.filter((e) => e.kind === 'npc' && e.hp > 0 && !e.street && e.crew !== p.crew && dist2(e, p) < 16 * 16).length;
  return hot >= 3;
}
function callSpot(s, p) {
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.75, 0.75], [-0.75, 0.75], [0.75, -0.75], [-0.75, -0.75]];
  const start = Math.floor(R(s) * dirs.length);
  for (let i = 0; i < dirs.length; i++) {
    const [dx, dz] = dirs[(start + i) % dirs.length];
    const l = Math.hypot(dx, dz) || 1;
    const dist = CALLS.minDist + 2 + R(s) * 8;
    const x = p.x + (dx / l) * dist, z = p.z + (dz / l) * dist;
    if (Math.abs(x) > HALF - 2 || Math.abs(z) > HALF - 2) continue;
    if (insideBuilding(x, z, 1.1)) continue;
    if (Math.hypot(x - p.x, z - p.z) < CALLS.minDist) continue;
    return { x, z };
  }
  return null;
}
function rivalCrew(s, p) {
  let best = null, bd = 1e9;
  for (const b of s.blocks) if (RIVALS.has(b.owner)) {
    const d = dist2(blockCenter(b), p);
    if (d < bd) { bd = d; best = b.owner; }
  }
  return best;
}
function placeCall(s, crew, homeId, x, z, o) {
  const e = spawnUnit(s, crew, 'brawler', homeId, x, z);
  e.street = true; e.streetHold = true; e.streetId = o.id; e.hp = e.max = o.hp || 54;
  if (o.weapon) e.weapon = o.weapon;
  if (o.style) e.style = o.style;
  e.opening = false;
  return e;
}
function endCall(s, why) {
  const c = ensureCalls(s), a = c.active;
  if (!a) return;
  for (const e of s.ents) if (e.streetId === a.id && !(why === 'win' && e.hp <= 0)) e.remove = true;
  s.ents = s.ents.filter((e) => !(e.remove && e.streetId === a.id));
  c.active = null;
  c.cd = why === 'bust' ? Math.max(c.cd, 12) : CALLS.cd;
  s.fx.push({ type: 'street', state: 'end', why, kind: a.kind });
}
function skimStash(s, p, frac) {
  const b = blockAt(s, p.x, p.z);
  if (!b || b.owner !== p.crew) return 0;
  const take = Math.floor((b.stash || 0) * frac);
  if (take < 1) return 0;
  b.stash -= take;
  return take;
}
function declineCall(s, why) {
  const c = s.calls, a = c && c.active, p = player(s);
  if (!a || a.phase !== 'offer') { endCall(s, why); return; }
  let note = a.leave;
  if (p && a.skim > 0) {
    const took = skimStash(s, p, a.skim);
    if (took > 0) note = a.skimNote.replace('$N', '$' + took);
  }
  log(s, note);
  s.fx.push({ type: 'street', state: 'off', kind: a.kind, why });
  endCall(s, why === 'timeout' ? 'timeout' : 'off');
}
function acceptCall(s, how) {
  const c = ensureCalls(s), a = c.active, p = player(s);
  if (!a || a.phase !== 'offer') return;
  a.phase = 'fight'; a.t = CALLS.fight;
  for (const e of s.ents) if (e.streetId === a.id) e.streetHold = false;
  if (a.heat && p) addHeat(s, p, a.heat);
  s.fx.push({ type: 'street', state: 'fight', kind: a.kind, how: how || 'choice' });
}
function streetChoice(s, p, choice) {
  const a = ensureCalls(s).active;
  if (!a || a.phase !== 'offer') return;
  if (choice === 'in') acceptCall(s, 'choice');
  else declineCall(s, 'off');
}
function offerCall(s, p) {
  const c = s.calls;
  const kind = CALLS.kinds[c.n % CALLS.kinds.length];
  const crew = kind === 'deal' ? (rivalCrew(s, p) || 'reds') : rivalCrew(s, p);
  if (!crew) { c.cd = 8; return; }
  const spot = callSpot(s, p);
  if (!spot) { c.cd = 3; return; }
  const home = blockAt(s, spot.x, spot.z) || blockAt(s, p.x, p.z) || s.blocks[0];
  const name = CREWS[crew].name;
  const a = { id: ++c.seq, kind, phase: 'offer', crew, x: spot.x, z: spot.z, t: CALLS.offer, block: home.id, reward: 70, rep: 6, skim: 0, heat: 0 };
  if (kind === 'incursion') {
    a.reward = 80; a.rep = 8; a.skim = 0.25;
    a.text = `${name} are pushing this corner. Step in, or let them shake it down.`;
    a.fightText = `${name} rush the corner. Drop them or leave.`;
    a.leave = `${name} rough up the corner and move on.`;
    a.skimNote = `${name} shook $N out of the corner and left.`;
    a.win = `You broke the ${name} push.`;
  } else if (kind === 'ambush') {
    a.reward = 60; a.rep = 6; a.skim = 0;
    a.text = `Two ${name} are posted up the block. Face them, or go around.`;
    a.fightText = `The ${name} lookouts come at you.`;
    a.leave = 'You went around. They pack it in.';
    a.skimNote = a.leave;
    a.win = 'The lookouts are down.';
  } else {
    a.reward = 100; a.rep = 4; a.skim = 0.12; a.heat = 6;
    a.text = 'A deal on the corner just broke. Break it up, or leave it.';
    a.fightText = 'Both sides turn on you.';
    a.leave = 'They settle it and scatter.';
    a.skimNote = 'They settle it and skim $N off the block.';
    a.win = 'You took the purse.';
  }
  c.n += 1; c.active = a;
  const specs = kind === 'incursion'
    ? [{ x: 0, z: 0, weapon: 'fists', style: 'rush', hp: 56 }, { x: 1.5, z: 0.8, weapon: 'bat', style: 'flank', hp: 60 }, { x: -1.5, z: 0.6, weapon: 'fists', style: 'retreat', hp: 50 }]
    : kind === 'ambush'
      ? [{ x: 0, z: 0, weapon: 'fists', style: 'rush', hp: 58 }, { x: 1.6, z: -0.4, weapon: 'bat', style: 'flank', hp: 60 }]
      : [{ x: 0, z: 0, weapon: 'fists', style: 'rush', hp: 52, crew }, { x: 1.5, z: 0.2, weapon: 'fists', style: 'retreat', hp: 48, crew: 'neutral' }];
  for (const sp of specs.slice(0, CALLS.maxNpc)) {
    const x = spot.x + sp.x, z = spot.z + sp.z;
    if (insideBuilding(x, z, 0.7)) { sp.x = 0; sp.z = 0; }
    placeCall(s, sp.crew || crew, home.id, spot.x + sp.x, spot.z + sp.z, { id: a.id, weapon: sp.weapon, style: sp.style, hp: sp.hp });
  }
  s.fx.push({ type: 'street', state: 'offer', kind, x: a.x, z: a.z, crew, text: a.text });
}
function callsStep(s, dt) {
  const c = ensureCalls(s), p = player(s);
  if (c.grace > 0) c.grace = Math.max(0, c.grace - dt);
  const a = c.active;
  if (a) {
    const live = () => s.ents.filter((e) => e.streetId === a.id && e.hp > 0);
    if (s.mission || !p || p.hp <= 0 || p.downT > 0) {
      if (s.mission) log(s, 'The corner call clears off. Finish the job with Unc.');
      endCall(s, p && (p.hp <= 0 || p.downT > 0) ? 'down' : 'mission');
      return;
    }
    const away = Math.hypot(p.x - a.x, p.z - a.z);
    if (a.phase === 'offer') {
      a.t -= dt;
      if (away > 34) { declineCall(s, 'off'); return; }
      if (a.t <= 0) { declineCall(s, 'timeout'); return; }
      return;
    }
    if (!live().length) {
      s.crews.player.cash += a.reward; s.crews.player.rep += a.rep;
      log(s, `${a.win} +$${a.reward}`);
      s.fx.push({ type: 'street', state: 'win', kind: a.kind, reward: a.reward, rep: a.rep });
      endCall(s, 'win');
      return;
    }
    a.t -= dt;
    if (a.t <= 0 || away > 42) {
      log(s, a.t <= 0 ? 'They scatter before you finish it.' : 'You left the corner. They scatter.');
      endCall(s, a.t <= 0 ? 'timeout' : 'leave');
    }
    return;
  }
  if (callBlocked(s, p)) return;
  if (c.n >= CALLS.cap) {
    if (!c.capped) { c.capped = true; log(s, 'The corner stays quiet.'); }
    return;
  }
  if (c.cd > 0) { c.cd -= dt; return; }
  offerCall(s, p);
}

function aiThink(s, k, dt) {
  const cr = s.crews[k];
  const own = s.blocks.filter((b) => b.owner === k);
  cr.alive = own.length > 0;
  if (!cr.alive) return;
  cr.aiT -= dt;
  if (cr.aiT > 0) return;
  cr.aiT = 9 + R(s) * 6;
  // rivals live on their blocks, so they bank the hustle stash into crew cash
  for (const b of own) if (b.stash > 0) { cr.cash += b.stash; b.stash = 0; }
  // room for three guards on every block plus a raid party; with the old cap a crew holding four blocks was
  // already full and never expanded
  const cap = Math.min(22, 6 + own.length * 4);
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
    const hittingPlayer = o.to.owner === 'player';
    let gather = 0;
    if (hittingPlayer) {
      if (!o.to.raid) {
        o.to.raid = { crew: k, eta: RAID_GATHER, from: o.from.id };
        s.fx.push({ type: 'raid', block: o.to.id, eta: RAID_GATHER, crew: k });
        log(s, `${CREWS[k].name} are gathering to hit ${o.to.hustle}. ${RAID_GATHER}s out.`);
      }
      gather = o.to.raid ? o.to.raid.eta : 0;
    }
    for (let i = 0; i < n; i++) { const u = spawnUnit(s, k, 'attacker', o.from.id); u.target = o.to.id; u.gather = gather; }
    if (!hittingPlayer) log(s, `${CREWS[k].name} are moving on ${o.to.hustle}.`);
  }
}

export const serialize = (s) => JSON.stringify(s, (k, v) => (k === 'path' ? undefined : v));
export const deserialize = (j) => JSON.parse(j);
export { steerPoint as navPoint }; // used by the headless mission tests
export { findPath as routeTo }; // street route between two points, for the radar's route line
