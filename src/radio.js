// Car radio. Plays while you are in a car; RADIO (or M) steps through the stations and off.
//
// Two kinds of station:
// - Track stations come from public/radio/stations.json: a name and a list of audio files that are
//   streamed one after another (never downloaded up front). This is where the game's own music goes,
//   see docs/radio.md.
// - Built-in stations are made in code with WebAudio, like every other sound in the game: a drum
//   machine, a bass line and a chord stab, written here as patterns. They are original, weigh nothing
//   to download, and mean the radio works before any track is added.
//
// The station you pick is remembered on the device.

// 16 steps to a bar. x = hit, - = rest. Bass and stab are scale degrees (0 = root), '.' = rest.
const BUILT_IN = [
  { name: 'Eastside Low', bpm: 88, swing: 0.16, root: 43, scale: [0, 3, 5, 7, 10],
    kick: ['x--x--x---x--x--', 'x--x--x--x-x----'], snare: ['----x-------x---', '----x-------x-x-'], hat: ['x-x-x-x-x-x-x-x-', 'x-xxx-x-x-x-x-xx'],
    bass: ['0..0..3...0..5..', '0..0..3...7..5..', '3..3..5...3..0..', '0..0..3...0.4.5.'], stab: ['....0.......3...', '....0.......5...'], stabVol: 0.5, bassType: 'sine' },
  { name: 'Downtown Pulse', bpm: 118, swing: 0, root: 45, scale: [0, 2, 3, 5, 7, 8, 10],
    kick: ['x---x---x---x---', 'x---x---x---x-x-'], snare: ['----x-------x---'], hat: ['--x---x---x---x-', '--x---x---x-x-x-'],
    bass: ['0.0..0.0.0..0.3.', '0.0..0.0.0..0.5.', '5.5..5.5.5..5.4.', '3.3..3.3.3..3.2.'], stab: ['x..x..x.....x...'.replace(/x/g, '0'), '2..2..2.....4...'], stabVol: 0.7, bassType: 'sawtooth' },
  { name: 'Harbor Static', bpm: 74, swing: 0.22, root: 38, scale: [0, 2, 3, 7, 8],
    kick: ['x-----x-x-------', 'x-----x---x-----'], snare: ['--------x-------', '--------x-----x-'], hat: ['x---x---x---x---', 'x---x-x-x---x---'],
    bass: ['0.......3...0...', '0.......3...4...', '2.......0...3...', '0.......3...0.1.'], stab: ['0...............', '....3...........', '2...............', '........4.......'], stabVol: 0.9, bassType: 'triangle' },
];
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

// What the radio says between songs, shown as a line on screen: the DJ, and ads for businesses that do not exist.
// {station} is the station's name. The game can also hand in news about what the player just did (news()).
const DJ = [
  'You are locked in to {station}. Do not touch that dial.',
  'Shout out to everybody stuck on the Loop right now.',
  'Traffic report: it is bad, and it is somebody else\'s fault.',
  'If you can hear sirens, turn it up.',
  'Weather for the Eastside: warm. Heat for some of you: warmer.',
  'Police say stay out of Downtown tonight. So now you know where the party is.',
  'This one goes out to the corner store that never closes.',
  'Text the station. We will not read it, but text it.',
  '{station}. Louder than your neighbor, quieter than his car.',
  'Harbor side, Midtown, Eastside, Downtown. We see you. All of you.',
];
const ADS = [
  'Pawn Counter. Your stuff, our prices.',
  'Loop Mutual Insurance. We cover everything except what happens.',
  'Harbor Fresh Seafood. Caught this week. Probably.',
  'Midtown Garage. No questions is our warranty.',
  'Dice Games on Second. The house always thanks you.',
  'Eastside Laundromat. We clean anything. Clothes too.',
  'A message from City Hall: the orange ramps are not for stunts.',
  'Flower Stall. Say sorry before she finds out.',
  'Dockside Locker. If it fell off a boat, it is in aisle three.',
  'Tired of traffic? So is everyone. Honk less. Paid for by people who honk.',
];

export function createRadio({ audio, base = './', onTune = () => {}, onAir = () => {} }) {
  let stations = BUILT_IN.map((s) => ({ ...s, kind: 'synth' }));
  let idx = -1, on = false, bus = null, timer = null, step = 0, nextT = 0, el = null, track = 0, noise = null;
  let airN = Math.floor(Math.random() * 50), airClock = 0, nextAir = 18, inDrop = false; const queue = [];
  try { const v = localStorage.getItem('se-radio'); idx = v == null ? 0 : +v; } catch (e) { idx = 0; }
  // stations.json is optional: without it only the built-in stations exist
  fetch(`${base}radio/stations.json`, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).then((j) => {
    const extra = ((j && j.stations) || []).filter((s) => s && s.name && Array.isArray(s.tracks) && s.tracks.length).map((s) => ({ name: s.name, tracks: s.tracks, drops: Array.isArray(s.drops) ? s.drops.filter((d) => d && d.file) : [], kind: 'tracks' }));
    if (extra.length) { stations = [...extra, ...stations]; if (idx >= 0) idx += extra.length; if (!localStorage.getItem('se-radio')) idx = 0; }
  }).catch(() => { /* no station file */ });

  function makeBus(ctx, master) {
    {
      // a car speaker: no deep sub, no air, quieter than the street sounds
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 55;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 9000;
      const g = ctx.createGain(); g.gain.value = 0;
      hp.connect(lp).connect(g).connect(master);
      const nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      noise = nb; return { ctx, in: hp, gain: g };
    }
  }
  function ensureBus() { const a = audio(); if (!a) return null; if (!bus) bus = makeBus(a.ctx, a.master); return bus; }
  // ---- drum machine voices ----
  function kick(t, v) { const { ctx } = bus, o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.28); o.connect(g).connect(bus.in); o.start(t); o.stop(t + 0.3); }
  function hit(t, v, freq, q, len, type = 'bandpass') { const { ctx } = bus, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noise; f.type = type; f.frequency.value = freq; f.Q.value = q; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + len); s.connect(f).connect(g).connect(bus.in); s.start(t, Math.random() * 0.5, len + 0.02); }
  function note(t, midi, len, v, type, cutoff) { const { ctx } = bus, o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(); o.type = type; o.frequency.value = hz(midi); f.type = 'lowpass'; f.frequency.setValueAtTime(cutoff, t); f.frequency.exponentialRampToValueAtTime(Math.max(120, cutoff * 0.35), t + len); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.012); g.gain.exponentialRampToValueAtTime(0.001, t + len); o.connect(f).connect(g).connect(bus.in); o.start(t); o.stop(t + len + 0.03); }
  const degree = (S, ch) => { const d = parseInt(ch, 16); return S.root + S.scale[d % S.scale.length] + 12 * Math.floor(d / S.scale.length); };
  // Notes are queued a little ahead of the clock, so a slow frame does not make the beat stumble.
  function schedule(until) {
    const S = stations[idx]; if (!S || S.kind !== 'synth' || !bus) return;
    const { ctx } = bus, sixteenth = 60 / S.bpm / 4;
    if (nextT < ctx.currentTime) nextT = ctx.currentTime + 0.05;
    const end = typeof until === 'number' ? until : ctx.currentTime + 0.45;
    while (nextT < end) {
      const bar = Math.floor(step / 16), i = step % 16, t = nextT + (i % 2 ? sixteenth * S.swing : 0);
      const pick = (arr) => arr[bar % arr.length];
      // every eighth bar the drums sit out for a bar, so it breathes like a record and not a loop
      const drop = bar % 8 === 7;
      if (!drop && pick(S.kick)[i] === 'x') kick(t, 0.9);
      if (!drop && pick(S.snare)[i] === 'x') { hit(t, 0.5, 1800, 0.8, 0.16); hit(t, 0.25, 320, 1.5, 0.1); }
      if (pick(S.hat)[i] === 'x') hit(t, drop ? 0.06 : 0.11, 6500, 0.7, 0.045, 'highpass');
      const b = pick(S.bass)[i]; if (b !== '.') note(t, degree(S, b), sixteenth * 2.6, 0.5, S.bassType, 520);
      const c = pick(S.stab)[i]; if (c !== '.') for (const up of [12, 15, 19]) note(t, degree(S, c) + up, sixteenth * 3.2, 0.07 * S.stabVol, 'sawtooth', 1800);
      step++; nextT += sixteenth;
    }
  }
  function stopAll() {
    if (timer) { clearInterval(timer); timer = null; }
    if (el) { el.pause(); }
    if (bus) bus.gain.gain.setTargetAtTime(0, bus.ctx.currentTime, 0.08);
  }
  // When a song ends and the next starts, onTune names the new one on screen (see the 'ended' handler).
  function playTrack() {
    const S = stations[idx]; if (!S || S.kind !== 'tracks') return;
    // after a song, a recorded drop (a DJ line or an ad) if the station has any, then the next song
    if (!el) { el = new Audio(); el.preload = 'none'; el.volume = 0.55; el.addEventListener('ended', () => {
      const S2 = stations[idx], drops = (S2 && S2.drops) || [];
      if (!inDrop && drops.length) { inDrop = true; const D = drops[(track + airN++) % drops.length], src = `${base}radio/${D.file}`; el.dataset.src = src; el.src = src; el.play().catch(() => {}); if (D.text) onAir(S2.name, D.text); return; }
      inDrop = false; track++; playTrack(); onTune(label()); }); el.addEventListener('error', () => { if (on && stations[idx] && stations[idx].kind === 'tracks' && stations[idx].tracks.length > 1) { track++; playTrack(); } }); }
    const T = S.tracks[track % S.tracks.length], src = `${base}radio/${T.file}`;
    if (el.dataset.src !== src) { el.dataset.src = src; el.src = src; }
    el.play().catch(() => { /* the browser wants a tap first: the next tap on RADIO starts it */ });
  }
  function start() {
    stopAll();
    const S = stations[idx]; if (!on || !S) return;
    if (S.kind === 'tracks') { playTrack(); return; }
    if (!ensureBus()) return;
    bus.gain.gain.setTargetAtTime(0.5, bus.ctx.currentTime, 0.15);
    nextT = 0; timer = setInterval(schedule, 60); schedule();
  }
  // one line on the air: news the game handed in first, then the DJ and the ads in turn
  function air() {
    const S = stations[idx]; if (!on || !S) return;
    let text = queue.shift();
    if (!text) { const pool = airN % 2 ? ADS : DJ; text = pool[(airN * 7 + idx * 3) % pool.length]; }
    airN++; onAir(S.name, text.replace('{station}', S.name));
  }
  setInterval(() => { if (!on || idx < 0) return; if (++airClock >= nextAir) { nextAir = airClock + 42 + (airN % 4) * 6; air(); } }, 1000);
  const label = () => (idx < 0 || !stations[idx] ? 'Radio off' : stations[idx].name + (stations[idx].kind === 'tracks' ? `: ${stations[idx].tracks[track % stations[idx].tracks.length].title || ''}` : ''));
  return {
    // in a car and not paused: the radio plays
    setOn(v) { v = !!v; if (v === on) return; on = v; if (on) { if (idx >= stations.length) idx = 0; start(); if (idx >= 0) onTune(label()); } else stopAll(); },
    next() {
      idx = idx + 1 >= stations.length ? -1 : idx + 1; track = 0; step = 0;
      try { localStorage.setItem('se-radio', String(idx)); } catch (e) { /* storage off */ }
      start(); onTune(label());
    },
    get label() { return label(); },
    // something happened in the city that the newsreader would mention; said at the next break, soon
    news(text) { if (queue.length < 3 && !queue.includes(text)) queue.push(text); if (on && idx >= 0) nextAir = Math.min(nextAir, airClock + 6); },
    air,
    // for tests: render a built-in station offline and report how loud it is and where its energy sits
    async probe(name, sec = 6) {
      const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext, sr = 44100, oc = new AC(1, sr * sec, sr);
      const keep = { bus, noise, idx, step, nextT };
      bus = makeBus(oc, oc.destination); bus.gain.gain.value = 0.5; idx = stations.findIndex((s) => s.name === name); step = 0; nextT = 0;
      schedule(sec - 0.3);
      bus = keep.bus; noise = keep.noise; idx = keep.idx; step = keep.step; nextT = keep.nextT;
      const d = (await oc.startRendering()).getChannelData(0);
      let sum = 0, peak = 0, onsets = 0, env = 0, was = false; for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); sum += v * v; if (v > peak) peak = v; env = Math.max(v, env * 0.9995); const hot = env > 0.25; if (hot && !was) onsets++; was = hot; }
      return { rms: +Math.sqrt(sum / d.length).toFixed(3), peak: +peak.toFixed(2), onsets, clipped: peak > 1 };
    },
    // for tests: what is sounding right now
    get state() { return { on, station: idx, queued: queue.length, synth: !!timer, step, track: el && !el.paused ? { time: el.currentTime, src: el.dataset.src } : null }; },
    get stations() { return stations.map((s) => s.name); },
  };
}
