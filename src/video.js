// Story clips (v0.16): two short filmed beats that bookend a run. Unc's welcome plays before the opening on a
// new game, and the rooftop plays when the city is yours, before the end card. Each plays once, full screen over
// the game, and a tap or any key skips it. Everything else stays in the engine (src/cine.js, src/moments.js).
// The files load only when asked for; a clip that cannot load or play is skipped, never a stall.
// Filmed briefs (v0.17): a job whose sit-down has been filmed plays its clip in place of the engine briefing, with
// the spoken lines as timed subtitles. BRIEF_CLIPS maps a job's index in MISSIONS to its file and subtitle cues
// (seconds into the clip). A job with no entry, or a clip that cannot play, keeps the engine briefing.
export const BRIEF_CLIPS = {
  0: { name: 'brief-01', subs: [
    { t: 0.4, end: 5.2, who: 'Unc', text: "Somebody snatched your bag on my block. That's disrespect to both of us." },
    { t: 6.7, end: 10.0, who: 'Unc', text: 'He dropped it up the street running from a Red Kings car.' },
    { t: 10.5, end: 13.9, who: 'Unc', text: 'Go get it back. Then we talk real work.' },
  ] },
  // the player's replies in 02 and 03 are voice only, mixed into the clip's own sound in the pause
  1: { name: 'brief-02', subs: [
    { t: 0.4, end: 3.7, who: 'Unc', text: 'Three corners on the Eastside are sitting on my envelopes.' },
    { t: 4.05, end: 5.8, who: 'Unc', text: 'That money is already mine.' },
    { t: 6.15, end: 7.6, who: 'You', text: 'And if they are short?' },
    { t: 7.95, end: 10.5, who: 'Unc', text: 'They will not be short. Not today.' },
    { t: 10.85, end: 12.9, who: 'Unc', text: 'Three envelopes, three corners.' },
    { t: 13.25, end: 15.5, who: 'Unc', text: 'Bring them back before the clock runs out.' },
  ] },
  2: { name: 'brief-03', subs: [
    { t: 0.4, end: 4.95, who: 'Unc', text: 'My guy at the chop shop is short one muscle car, and he needs it now.' },
    { t: 5.05, end: 6.05, who: 'You', text: 'Any color?' },
    { t: 6.12, end: 8.6, who: 'Unc', text: 'Fast is the only color that matters.' },
    { t: 9.0, end: 12.6, who: 'Unc', text: 'Find a muscle car and drop it at the chop shop on the marker.' },
  ] },
  3: { name: 'brief-04', subs: [
    { t: 0.4, end: 2.95, who: 'Unc', text: 'This block is ours because we hold it.' },
    { t: 3.3, end: 5.45, who: 'Unc', text: 'That is the only reason it stays ours.' },
    { t: 5.9, end: 8.7, who: 'Unc', text: 'Time to grow. Take the block on the marker.' },
  ] },
  18: { name: 'brief-19', subs: [
    { t: 0.4, end: 3.8, who: 'Unc', text: 'One block. That is what we started with. Now look at the map.' },
    { t: 4.3, end: 6.6, who: 'Unc', text: 'Take the rival block on the marker.' },
    { t: 6.95, end: 8.9, who: 'Unc', text: 'This is the one that counts.' },
  ] },
};
const SKIP_AFTER = 0.5; // seconds before a tap counts as a skip, so the START tap itself cannot skip the clip
const GIVE_UP = 7; // seconds to wait for the first frame before moving on

export function createVideo({ base, duck }) {
  let box = null, vid = null, hint = null, sub = null, active = false, finish = null, loaded = '', failed = false;
  function build() {
    if (box) return;
    box = document.createElement('div'); box.id = 'vclip';
    vid = document.createElement('video'); vid.playsInline = true; vid.setAttribute('playsinline', ''); vid.preload = 'auto'; vid.disablePictureInPicture = true;
    hint = document.createElement('div'); hint.className = 'vskip';
    sub = document.createElement('div'); sub.className = 'vsub';
    box.append(vid, sub, hint); document.body.appendChild(box);
  }
  // point the player at a clip and start loading it; a clip already loaded is left alone
  function load(name) {
    build(); if (loaded === name) return;
    loaded = name; vid.textContent = '';
    for (const [ext, type] of [['webm', 'video/webm'], ['mp4', 'video/mp4']]) { const s = document.createElement('source'); s.src = `${base}cinematics/${name}.${ext}`; s.type = type; if (ext === 'mp4') s.onerror = () => { loaded = ''; if (finish) finish(false, true); }; vid.appendChild(s); }
    vid.load();
  }
  function play(name, { touch = false, subs = null } = {}) {
    return new Promise((resolve) => {
      if (active) return resolve(false);
      build(); active = true; failed = false;
      const t0 = performance.now(); let done = false, giveUp = 0, raf = 0, cue = -2;
      // subtitles follow the clip's own clock, so a stall or a slow start cannot put them out of step
      const tick = () => {
        if (done) return; raf = requestAnimationFrame(tick);
        const t = vid.currentTime; let i = -1; for (let k = 0; k < subs.length; k++) if (t >= subs[k].t && t < subs[k].end) i = k;
        if (i === cue) return; cue = i; sub.textContent = '';
        if (i >= 0) { const b = document.createElement('b'); b.textContent = subs[i].who; sub.append(b, subs[i].text); }
        sub.classList.toggle('show', i >= 0);
      };
      const end = (played, fail = false) => {
        if (done) return; done = true; clearTimeout(giveUp); cancelAnimationFrame(raf); failed = fail;
        sub.classList.remove('show');
        removeEventListener('keydown', onKey, true); box.removeEventListener('pointerdown', onTap);
        vid.onended = vid.onerror = vid.onplaying = null;
        box.classList.remove('on');
        setTimeout(() => { try { vid.pause(); vid.textContent = ''; vid.load(); } catch (e) { /* already gone */ } loaded = ''; box.classList.remove('show'); active = false; finish = null; if (duck) duck(false); resolve(played); }, 260);
      };
      finish = end;
      const canSkip = () => performance.now() - t0 > SKIP_AFTER * 1000;
      const onKey = (e) => { e.stopPropagation(); e.preventDefault(); if (canSkip()) end(false); };
      const onTap = (e) => { e.stopPropagation(); if (canSkip()) end(false); };
      hint.textContent = touch ? 'TAP TO SKIP' : 'ANY KEY TO SKIP';
      load(name); vid.muted = false; vid.onended = () => end(true); vid.onerror = () => end(false, true);
      vid.onplaying = () => { clearTimeout(giveUp); box.classList.add('on'); if (subs && subs.length && !raf) tick(); };
      box.classList.add('show'); if (duck) duck(true);
      addEventListener('keydown', onKey, true); box.addEventListener('pointerdown', onTap);
      giveUp = setTimeout(() => end(false, true), GIVE_UP * 1000);
      // sound needs a recent tap on some phones: if the browser refuses, play it silent rather than not at all
      const go = () => vid.play();
      Promise.resolve().then(go).catch(() => { vid.muted = true; return go(); }).catch(() => end(false, true));
    });
  }
  return { play, warm: load, get active() { return active; }, get failed() { return failed; }, skip() { if (finish) finish(false); } };
}
