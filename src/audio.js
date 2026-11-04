// All sounds are synthesized with WebAudio at runtime. No audio files ship.
let ctx = null, master, engineOsc, engineOsc2, engineGain, engineFilter, noiseBuf;

function makeNoise() {
  const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = i % 2 ? w : last * 3.5; }
  return b;
}
function noiseSrc(loop) { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = !!loop; return s; }

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
  const t = ctx.currentTime, f = 38 + Math.abs(speed) * 4.2;
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
