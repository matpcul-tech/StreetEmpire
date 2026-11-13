// All sounds are synthesized with WebAudio at runtime. No audio files ship.
let ctx = null, master, engineOsc, engineOsc2, engineGain, engineFilter, noiseBuf;

function makeNoise() {
  const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = i % 2 ? w : last * 3.5; }
  return b;
}
function noiseSrc(loop) { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = !!loop; return s; }

// the shared context and output, for modules that make their own sound (the radio)
export const audio = () => (ctx ? { ctx, master } : null);

export function initAudio() {
  if (ctx) { ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
  noiseBuf = makeNoise();
  // city background: low rumble plus occasional distant horns
  const amb = noiseSrc(true), lp = ctx.createBiquadFilter(), g = ctx.createGain();
  lp.type = 'lowpass'; lp.frequency.value = 320; g.gain.value = 0.07;
  amb.connect(lp).connect(g).connect(master); amb.start();
  const horn = () => {
    const t = ctx.currentTime, o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), hg = ctx.createGain();
    o1.type = o2.type = 'square'; o1.frequency.value = 330 + Math.random() * 80; o2.frequency.value = o1.frequency.value * 1.26;
    f.type = 'lowpass'; f.frequency.value = 700; hg.gain.setValueAtTime(0, t); hg.gain.linearRampToValueAtTime(0.018, t + 0.03); hg.gain.setValueAtTime(0.018, t + 0.35); hg.gain.linearRampToValueAtTime(0, t + 0.45);
    o1.connect(f); o2.connect(f); f.connect(hg).connect(master); o1.start(t); o2.start(t); o1.stop(t + 0.5); o2.stop(t + 0.5);
    setTimeout(horn, 9000 + Math.random() * 25000);
  };
  setTimeout(horn, 6000);
  // engine
  engineOsc = ctx.createOscillator(); engineOsc2 = ctx.createOscillator(); engineFilter = ctx.createBiquadFilter(); engineGain = ctx.createGain();
  engineOsc.type = 'sawtooth'; engineOsc2.type = 'square'; engineFilter.type = 'lowpass'; engineFilter.frequency.value = 500; engineGain.gain.value = 0;
  engineOsc.connect(engineFilter); engineOsc2.connect(engineFilter); engineFilter.connect(engineGain).connect(master);
  engineOsc.start(); engineOsc2.start();
}

export function setEngine(on, speed) {
  if (!ctx) return;
  // four gears: the note climbs through each one and drops back at the shift
  const v = Math.abs(speed), gear = Math.min(3, Math.floor(v / 9)), rev = (v - gear * 9) / (gear === 3 ? 18 : 9);
  const t = ctx.currentTime, f = 40 + gear * 12 + Math.min(1.2, rev) * 52;
  engineGain.gain.setTargetAtTime(on ? 0.09 : 0, t, 0.15);
  engineOsc.frequency.setTargetAtTime(f, t, 0.1); engineOsc2.frequency.setTargetAtTime(f * 0.5, t, 0.1);
  engineFilter.frequency.setTargetAtTime(300 + Math.abs(speed) * 40, t, 0.1);
}

export function footstep(vol = 1) {
  if (!ctx) return;
  const t = ctx.currentTime, n = noiseSrc(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  f.type = 'bandpass'; f.frequency.value = 700 + Math.random() * 500; f.Q.value = 1.2;
  g.gain.setValueAtTime(0.16 * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
  n.connect(f).connect(g).connect(master); n.start(t, Math.random()); n.stop(t + 0.08);
}

export function punch(heavy, vol = 1) {
  if (!ctx) return;
  const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(heavy ? 150 : 190, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.14);
  g.gain.setValueAtTime(0.55 * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  o.connect(g).connect(master); o.start(t); o.stop(t + 0.2);
  const n = noiseSrc(), f = ctx.createBiquadFilter(), ng = ctx.createGain();
  f.type = 'lowpass'; f.frequency.value = 2200; ng.gain.setValueAtTime(0.35 * vol, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  n.connect(f).connect(ng).connect(master); n.start(t, Math.random()); n.stop(t + 0.06);
}

export function whoosh() {
  if (!ctx) return;
  const t = ctx.currentTime, n = noiseSrc(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  f.type = 'bandpass'; f.Q.value = 2; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(1600, t + 0.15);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.08, t + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  n.connect(f).connect(g).connect(master); n.start(t, Math.random()); n.stop(t + 0.2);
}

export function crash(vol = 1) {
  if (!ctx) return;
  const t = ctx.currentTime, n = noiseSrc(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  f.type = 'lowpass'; f.frequency.value = 1200; g.gain.setValueAtTime(0.5 * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
  n.connect(f).connect(g).connect(master); n.start(t, Math.random()); n.stop(t + 0.45);
}

export function sting() {
  if (!ctx) return;
  const t = ctx.currentTime;
  [220, 277, 330].forEach((fr, i) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle'; o.frequency.value = fr; g.gain.setValueAtTime(0, t + i * 0.08); g.gain.linearRampToValueAtTime(0.08, t + i * 0.08 + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.6); o.connect(g).connect(master); o.start(t + i * 0.08); o.stop(t + i * 0.08 + 0.7); });
}

export function gunshot(vol = 1) {
  if (!ctx) return;
  const t = ctx.currentTime, n = noiseSrc(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  f.type = 'lowpass'; f.frequency.setValueAtTime(5000, t); f.frequency.exponentialRampToValueAtTime(300, t + 0.2);
  g.gain.setValueAtTime(0.7 * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
  n.connect(f).connect(g).connect(master); n.start(t, Math.random()); n.stop(t + 0.3);
  const o = ctx.createOscillator(), og = ctx.createGain(); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.1);
  og.gain.setValueAtTime(0.5 * vol, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.12); o.connect(og).connect(master); o.start(t); o.stop(t + 0.15);
}

let sirenOsc = null, sirenGain = null;
export function setSiren(vol) {
  if (!ctx) return;
  if (!sirenOsc) {
    sirenOsc = ctx.createOscillator(); sirenOsc.type = 'triangle'; sirenGain = ctx.createGain(); sirenGain.gain.value = 0;
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.9; lg.gain.value = 220; sirenOsc.frequency.value = 760;
    lfo.connect(lg).connect(sirenOsc.frequency); lfo.start(); sirenOsc.connect(sirenGain).connect(master); sirenOsc.start();
  }
  sirenGain.gain.setTargetAtTime(0.05 * vol, ctx.currentTime, 0.2);
}

export function honk(vol = 1) {
  if (!ctx) return;
  const t = ctx.currentTime, o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  o1.type = o2.type = 'square'; o1.frequency.value = 400; o2.frequency.value = 500; f.type = 'lowpass'; f.frequency.value = 1200;
  g.gain.setValueAtTime(0.06 * vol, t); g.gain.setValueAtTime(0.06 * vol, t + 0.3); g.gain.linearRampToValueAtTime(0, t + 0.35);
  o1.connect(f); o2.connect(f); f.connect(g).connect(master); o1.start(t); o2.start(t); o1.stop(t + 0.4); o2.stop(t + 0.4);
}

export function chime(good) {
  if (!ctx) return;
  const t = ctx.currentTime, notes = good ? [392, 494, 587, 784] : [330, 262, 196];
  notes.forEach((fr, i) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle'; o.frequency.value = fr; g.gain.setValueAtTime(0, t + i * 0.12); g.gain.linearRampToValueAtTime(0.1, t + i * 0.12 + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.5); o.connect(g).connect(master); o.start(t + i * 0.12); o.stop(t + i * 0.12 + 0.6); });
}

// ---- v0.5 combat and driving sounds ----
function burst(t, { freq = 1000, q = 1, type = 'bandpass', vol = 0.3, len = 0.1 }) {
  const n = noiseSrc(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
  n.connect(f).connect(g).connect(master); n.start(t, Math.random()); n.stop(t + len + 0.02);
}
function thump(t, f0, f1, vol, len) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + len);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
  o.connect(g).connect(master); o.start(t); o.stop(t + len + 0.02);
}
// layered impact: body thump, slap and a crack for heavy hits and knockouts
export function impact(kind, vol = 1) {
  if (!ctx) return; const t = ctx.currentTime;
  if (kind === 'bat') { thump(t, 120, 40, 0.6 * vol, 0.22); burst(t, { freq: 900, q: 3, vol: 0.4 * vol, len: 0.09 }); burst(t, { freq: 3200, q: 6, vol: 0.18 * vol, len: 0.05 }); }
  else if (kind === 'knuckles') { thump(t, 170, 50, 0.6 * vol, 0.16); burst(t, { freq: 2600, q: 8, vol: 0.2 * vol, len: 0.06 }); burst(t, { freq: 500, q: 1, vol: 0.3 * vol, len: 0.06 }); }
  else if (kind === 'bullet') { thump(t, 140, 60, 0.35 * vol, 0.1); burst(t, { freq: 1500, q: 1, vol: 0.25 * vol, len: 0.05 }); }
  else { thump(t, 190, 45, 0.5 * vol, 0.15); burst(t, { freq: 1800, q: 0.8, type: 'lowpass', vol: 0.32 * vol, len: 0.05 }); }
}
export function knockout(vol = 1) { if (!ctx) return; const t = ctx.currentTime; thump(t, 90, 30, 0.8 * vol, 0.45); burst(t + 0.05, { freq: 300, q: 0.7, type: 'lowpass', vol: 0.35 * vol, len: 0.3 }); }
export function block(vol = 1) { if (!ctx) return; const t = ctx.currentTime; thump(t, 260, 120, 0.3 * vol, 0.08); burst(t, { freq: 2400, q: 10, vol: 0.25 * vol, len: 0.12 }); }
export function shotgun(vol = 1) { if (!ctx) return; const t = ctx.currentTime; thump(t, 110, 35, 0.9 * vol, 0.35); burst(t, { freq: 900, q: 0.6, type: 'lowpass', vol: 0.8 * vol, len: 0.3 }); burst(t, { freq: 4000, q: 1, vol: 0.3 * vol, len: 0.08 }); burst(t + 0.35, { freq: 2200, q: 8, vol: 0.12, len: 0.05 }); burst(t + 0.48, { freq: 1800, q: 8, vol: 0.12, len: 0.05 }); }
export function shell(vol = 0.5) { if (!ctx) return; const t = ctx.currentTime + 0.25; burst(t, { freq: 5200, q: 20, vol: 0.08 * vol, len: 0.08 }); burst(t + 0.09, { freq: 4800, q: 20, vol: 0.05 * vol, len: 0.06 }); }
export function scrape(vol = 1) { if (!ctx) return; const t = ctx.currentTime; burst(t, { freq: 3000, q: 2, vol: 0.25 * vol, len: 0.25 }); }
let skidGain = null;
export function setSkid(v) {
  if (!ctx) return;
  if (!skidGain) { const n = noiseSrc(true), f = ctx.createBiquadFilter(); skidGain = ctx.createGain(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 4; skidGain.gain.value = 0; n.connect(f).connect(skidGain).connect(master); n.start(); }
  skidGain.gain.setTargetAtTime(0.16 * v, ctx.currentTime, 0.05);
}

export function boom(vol = 1) { if (!ctx) return; const t = ctx.currentTime; thump(t, 75, 22, 1.1 * vol, 0.9); burst(t, { freq: 420, q: 0.5, type: 'lowpass', vol: 1 * vol, len: 0.9 }); burst(t, { freq: 2600, q: 0.8, vol: 0.4 * vol, len: 0.14 }); burst(t + 0.25, { freq: 180, q: 0.6, type: 'lowpass', vol: 0.5 * vol, len: 1.2 }); }

// Rain: broadband noise with the low end rolled off, a slow wobble so it does not sit still. Started on first use.
let rainGain = null;
// everything the game plays, as a media stream for the clip recorder (master is tapped, the speakers keep playing)
let dest = null;
export function stream() { if (!ctx) return null; if (!dest) { dest = ctx.createMediaStreamDestination(); master.connect(dest); } return dest.stream; }

export function setRain(v) {
  if (!ctx) return;
  if (!rainGain) {
    if (v <= 0.01) return;
    const n = noiseSrc(true), hp = ctx.createBiquadFilter(), lp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 900; lp.type = 'lowpass'; lp.frequency.value = 6500;
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.23; lg.gain.value = 500; lfo.connect(lg).connect(lp.frequency); lfo.start();
    rainGain = ctx.createGain(); rainGain.gain.value = 0; n.connect(hp).connect(lp).connect(rainGain).connect(master); n.start();
  }
  rainGain.gain.setTargetAtTime(0.11 * v, ctx.currentTime, 0.6);
}

// Police helicopter: low noise chopped at blade rate. One looping source, started on first use.
let heliGain = null;
export function setHeli(vol) {
  if (!ctx) return;
  if (!heliGain) {
    if (vol <= 0) return;
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const n = ctx.createBufferSource(); n.buffer = buf; n.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260;
    const chop = ctx.createGain(); chop.gain.value = 0.5; const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.type = 'sawtooth'; lfo.frequency.value = 11; lg.gain.value = 0.5; lfo.connect(lg).connect(chop.gain); lfo.start();
    heliGain = ctx.createGain(); heliGain.gain.value = 0; n.connect(f).connect(chop).connect(heliGain).connect(master); n.start();
  }
  heliGain.gain.setTargetAtTime(0.5 * vol, ctx.currentTime, 0.3);
}
