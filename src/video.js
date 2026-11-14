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
  // Dee (05 to 09), Rook (10 to 14) and Sal (15 to 18); the reply in 10 is mixed into the clip like 02 and 03
  4: { name: 'brief-05', subs: [
    { t: 0.4, end: 1.9, who: 'Dee', text: 'Unc keeps talking about you.' },
    { t: 1.95, end: 5.7, who: 'Dee', text: 'A package just hit the Harbor side, and I do not trust anybody else with it.' },
    { t: 6.2, end: 9.35, who: 'Dee', text: 'Pick it up at the Harbor drop, then bring it straight back to me.' },
    { t: 9.45, end: 11.2, who: 'Dee', text: 'You got 150 seconds.' },
  ] },
  5: { name: 'brief-06', subs: [
    { t: 0.4, end: 2.48, who: 'Dee', text: 'That lowrider out front took me six weeks.' },
    { t: 2.5, end: 5.1, who: 'Dee', text: 'The buyer Downtown pays for paint, not dents.' },
    { t: 5.6, end: 8.95, who: 'Dee', text: 'Drive the lowrider to the marker Downtown. Keep it clean.' },
  ] },
  6: { name: 'brief-07', subs: [
    { t: 0.4, end: 3.1, who: 'Dee', text: 'Somebody is moving product through my streets and not paying.' },
    { t: 3.15, end: 5.85, who: 'Dee', text: 'Do not stop him. I just need to know where he goes.' },
    { t: 6.3, end: 8.75, who: 'Dee', text: 'Follow the marked car. Stay back, but do not lose it.' },
  ] },
  7: { name: 'brief-08', subs: [
    { t: 0.4, end: 2.75, who: 'Dee', text: 'You want the fast jobs, I need a clock on you.' },
    { t: 2.8, end: 4.9, who: 'Dee', text: 'One lap of the Loop. The whole ring.' },
    { t: 5.35, end: 8.75, who: 'Dee', text: 'Get a car, hit every marker around the Loop. 170 seconds.' },
  ] },
  8: { name: 'brief-09', subs: [
    { t: 0.4, end: 2.95, who: 'Dee', text: 'A customer just drove off in my car and did not pay.' },
    { t: 3.0, end: 5.3, who: 'Dee', text: 'I want it stopped, I do not care how.' },
    { t: 5.75, end: 9.1, who: 'Dee', text: 'Stop the marked car before it gets away. Ram it or take it at a light.' },
  ] },
  9: { name: 'brief-10', subs: [
    { t: 0.4, end: 2.85, who: 'Rook', text: 'The Red Kings been running their mouths about your people.' },
    { t: 2.95, end: 3.9, who: 'You', text: 'I heard.' },
    { t: 4.05, end: 6.3, who: 'Rook', text: 'Then end it. Knock out 3 Red Kings.' },
  ] },
  10: { name: 'brief-11', subs: [
    { t: 0.4, end: 2.7, who: 'Rook', text: 'Blue Hand thinks the Red Kings were a one off.' },
    { t: 2.95, end: 4.35, who: 'Rook', text: 'Show them it is policy.' },
    { t: 4.8, end: 6.45, who: 'Rook', text: 'Knock out 4 Blue Hand.' },
  ] },
  11: { name: 'brief-12', subs: [
    { t: 0.4, end: 2.5, who: 'Rook', text: 'They are coming for one of your blocks tonight.' },
    { t: 2.65, end: 4.95, who: 'Rook', text: 'Lose it and this city knows you can be pushed.' },
    { t: 5.25, end: 7.05, who: 'Rook', text: 'Get to your block on the marker and hold it.' },
  ] },
  12: { name: 'brief-13', subs: [
    { t: 0.4, end: 1.95, who: 'Rook', text: 'Somebody gave the police your name.' },
    { t: 2.05, end: 3.3, who: 'Rook', text: 'They are already looking.' },
    { t: 3.75, end: 5.4, who: 'Rook', text: 'You are wanted. Shake the police.' },
  ] },
  13: { name: 'brief-14', subs: [
    { t: 0.4, end: 2.4, who: 'Rook', text: 'The Red Kings lieutenant plans every raid.' },
    { t: 2.5, end: 4.55, who: 'Rook', text: 'Put him down and the raids get stupid.' },
    { t: 4.85, end: 7.2, who: 'Rook', text: 'Knock out the Red Kings lieutenant on the marker.' },
  ] },
  14: { name: 'brief-15', subs: [
    { t: 0.4, end: 2.1, who: 'Sal', text: 'Rook says you are useful.' },
    { t: 2.45, end: 4.6, who: 'Sal', text: 'Four crates are sitting on the docks,' },
    { t: 4.75, end: 7.3, who: 'Sal', text: 'and Gold Line does not know they are there yet.' },
    { t: 7.75, end: 10.9, who: 'Sal', text: 'Get all four crates, then back to me. 170 seconds.' },
  ] },
  15: { name: 'brief-16', subs: [
    { t: 0.4, end: 3.3, who: 'Sal', text: 'The van is loaded, and the police already know the plate.' },
    { t: 3.55, end: 4.85, who: 'Sal', text: 'Still has to get home.' },
    { t: 5.35, end: 8.25, who: 'Sal', text: 'Drive the van to your home block. They will be on you.' },
  ] },
  16: { name: 'brief-17', subs: [
    { t: 0.4, end: 4.0, who: 'Sal', text: 'Gold Line has a captain on these docks taxing every load.' },
    { t: 4.2, end: 5.55, who: 'Sal', text: 'I am done paying.' },
    { t: 6.05, end: 8.45, who: 'Sal', text: 'Knock out the Gold Line captain on the marker.' },
  ] },
  17: { name: 'brief-18', subs: [
    { t: 0.4, end: 1.4, who: 'Sal', text: 'You can fight.' },
    { t: 1.5, end: 4.95, who: 'Sal', text: 'Holding ground is different, and I want six blocks answering to you.' },
    { t: 5.35, end: 6.95, who: 'Sal', text: 'Hold six blocks at once.' },
  ] },
  18: { name: 'brief-19', subs: [
    { t: 0.4, end: 3.8, who: 'Unc', text: 'One block. That is what we started with. Now look at the map.' },
    { t: 4.3, end: 6.6, who: 'Unc', text: 'Take the rival block on the marker.' },
    { t: 6.95, end: 8.9, who: 'Unc', text: 'This is the one that counts.' },
  ] },
};
// Filmed busts (v0.19): one of these plays when the police take you in, ahead of the BUSTED screen.
export const BUST_CLIPS = [
  { name: 'bust-01', subs: [
    { t: 0.3, end: 2.3, who: 'Officer', text: 'Hands. Now. You are done tonight.' },
  ] },
  { name: 'bust-02', subs: [
    { t: 0.3, end: 2.8, who: 'Officer', text: 'On the ground. Do not make this worse.' },
  ] },
  { name: 'bust-03', subs: [
    { t: 0.4, end: 2.6, who: 'Officer', text: 'That is enough. You are coming with us.' },
  ] },
  { name: 'bust-04', subs: [
    { t: 0.3, end: 2.85, who: 'Officer', text: 'Turn around. Hands behind your back.' },
  ] },
];
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
