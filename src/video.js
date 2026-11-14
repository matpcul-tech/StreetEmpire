// Story clips (v0.16): two short filmed beats that bookend a run. Unc's welcome plays before the opening on a
// new game, and the rooftop plays when the city is yours, before the end card. Each plays once, full screen over
// the game, and a tap or any key skips it. Everything else stays in the engine (src/cine.js, src/moments.js).
// The files load only when asked for; a clip that cannot load or play is skipped, never a stall.
const SKIP_AFTER = 0.5; // seconds before a tap counts as a skip, so the START tap itself cannot skip the clip
const GIVE_UP = 7; // seconds to wait for the first frame before moving on

export function createVideo({ base, duck }) {
  let box = null, vid = null, hint = null, active = false, finish = null, loaded = '';
  function build() {
    if (box) return;
    box = document.createElement('div'); box.id = 'vclip';
    vid = document.createElement('video'); vid.playsInline = true; vid.setAttribute('playsinline', ''); vid.preload = 'auto'; vid.disablePictureInPicture = true;
    hint = document.createElement('div'); hint.className = 'vskip';
    box.append(vid, hint); document.body.appendChild(box);
  }
  // point the player at a clip and start loading it; a clip already loaded is left alone
  function load(name) {
    build(); if (loaded === name) return;
    loaded = name; vid.textContent = '';
    for (const [ext, type] of [['webm', 'video/webm'], ['mp4', 'video/mp4']]) { const s = document.createElement('source'); s.src = `${base}cinematics/${name}.${ext}`; s.type = type; if (ext === 'mp4') s.onerror = () => { loaded = ''; if (finish) finish(false); }; vid.appendChild(s); }
    vid.load();
  }
  function play(name, { touch = false } = {}) {
    return new Promise((resolve) => {
      if (active) return resolve(false);
      build(); active = true;
      const t0 = performance.now(); let done = false, giveUp = 0;
      const end = (played) => {
        if (done) return; done = true; clearTimeout(giveUp);
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
      load(name); vid.muted = false; vid.onended = () => end(true); vid.onerror = () => end(false);
      vid.onplaying = () => { clearTimeout(giveUp); box.classList.add('on'); };
      box.classList.add('show'); if (duck) duck(true);
      addEventListener('keydown', onKey, true); box.addEventListener('pointerdown', onTap);
      giveUp = setTimeout(() => end(false), GIVE_UP * 1000);
      // sound needs a recent tap on some phones: if the browser refuses, play it silent rather than not at all
      const go = () => vid.play();
      Promise.resolve().then(go).catch(() => { vid.muted = true; return go(); }).catch(() => end(false));
    });
  }
  return { play, warm: load, get active() { return active; }, skip() { if (finish) finish(false); } };
}
