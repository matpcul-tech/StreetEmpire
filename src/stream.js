// Stream layer (v0.13): what a viewer needs to follow a run at a glance.
// - A feed of the moments that matter (any crew taking a block, a lost block, a knockout streak, a wanted jump,
//   a stunt, a race, a job) in the crew's color, on the left strip. The simulation already emits these as fx;
//   this only words them.
// - A turf bar under the HUD: the city's 81 blocks by crew, so the war is readable without the radar.
// - Run stats for the pause screen and the end card, with a summary that copies as plain text for a title or chat.
// - Stream mode: bigger HUD type, a safe margin all round so a webcam or overlay never covers the cash or the radar,
//   the feed on phones too, and a run clock. Kept on the device; ?stream turns it on for one visit.
import { CREWS, MISSIONS, STASHES } from './state.js';

const KEY = 'se-stream';
export function streamWanted(params) {
  if (params.has('stream')) return params.get('stream') !== '0';
  try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; }
}

export function createStream({ isTouch, S, player, pop }) {
  const $ = (id) => document.getElementById(id);
  const feedEl = $('feed'), barEl = $('turfbar'), clockEl = $('runclock');
  let on = false;
  const lines = [];
  const CREW_KEYS = ['player', 'reds', 'blues', 'golds', 'neutral'];
  const crewName = (k) => (k === 'player' ? 'You' : CREWS[k] ? CREWS[k].name : 'Locals');

  // ---- feed ----
  function push(text, crew = '', big = false) {
    if (!feedEl) return;
    const el = document.createElement('div'); el.className = 'fl' + (big ? ' big' : '');
    el.style.borderLeftColor = crew && CREWS[crew] ? CREWS[crew].css : 'rgba(255,255,255,.5)';
    el.textContent = text; feedEl.appendChild(el);
    lines.push({ el, t: big ? 9 : 7 });
    while (lines.length > (on ? 5 : 4)) { const old = lines.shift(); old.el.remove(); }
  }
  // the fx the sim emits, worded for a viewer. Returns true when it used the fx.
  function fx(f, s) {
    const p = player(s);
    switch (f.type) {
      case 'capture': push(`${crewName(f.crew)} took ${f.hustle || 'a block'} from ${crewName(f.from)}`, f.crew, f.crew === 'player' || f.from === 'player'); return true;
      case 'raid': if (f.eta > 0 && f.crew) push(`${crewName(f.crew)} are gathering to raid your turf`, f.crew); return true;
      case 'streak': push(`${f.n} knockouts in a row`, 'player', f.n >= 5); return true;
      case 'stunt': push(`Stunt jump: ${Math.round(f.dist)} m${f.first ? ', first time' : ''}`, 'player', f.first); return true;
      case 'race': if (f.state === 'win') push(`${f.name}: ${f.medal === 'none' ? 'finished' : f.medal} in ${f.time.toFixed(1)} s${f.record ? ', new best' : ''}`, 'player', f.medal === 'gold'); return true;
      case 'heli': if (f.state === 'in') push('Police helicopter overhead', 'blues', true); return true;
      case 'mission': push(f.state === 'pass' ? `Job done: ${f.title} (+$${f.reward})` : f.state === 'fail' ? `Job blown: ${f.title}` : `Job on: ${f.title}`, 'player', f.state === 'pass'); return true;
      case 'found': if (f.all) push('Every hidden stash found', 'player', true); else push(`Stash ${f.n} of ${f.of} found`, 'player'); return true;
      case 'wasted': push('Knocked out', 'reds', true); return true;
      case 'busted': push('Locked up', 'blues', true); return true;
      case 'house': push(`Safehouse bought: ${f.name}`, 'player'); return true;
      case 'built': push(`${f.hustle} built up`, 'player'); return true;
      case 'street': if (f.state === 'win') push(`Street call won: +$${f.reward}`, 'player'); return true;
      case 'boom': { const d = Math.hypot(f.x - p.x, f.z - p.z); if (d < 40) push('A car just blew up', 'reds'); return true; }
      case 'fare': if (f.state === 'drop') push(`Fare paid: +$${f.pay}`, 'player'); return true;
      case 'courier': if (f.state === 'drop') push(`Package delivered: +$${f.pay}`, 'player'); return true;
      default: return false;
    }
  }
  let lastStars = 0;
  function wanted(n) { if (n > lastStars) push(n >= 4 ? `Wanted: ${n} stars. Tactical units out.` : `Wanted: ${n} star${n > 1 ? 's' : ''}`, 'blues', n >= 3); lastStars = n; }

  // ---- turf bar ----
  const segs = {};
  if (barEl) for (const k of CREW_KEYS) { const d = document.createElement('i'); d.style.background = CREWS[k].css; d.title = crewName(k); barEl.appendChild(d); segs[k] = d; }
  let barT = 0;
  function bar(s, rdt) {
    if (!barEl) return;
    if ((barT -= rdt) > 0) return; barT = 0.5;
    const n = s.blocks.length, count = {}; for (const k of CREW_KEYS) count[k] = 0;
    for (const b of s.blocks) count[b.owner] = (count[b.owner] || 0) + 1;
    for (const k of CREW_KEYS) { const c = count[k]; segs[k].style.flexGrow = c; segs[k].textContent = c >= 4 ? c : ''; segs[k].style.display = c ? '' : 'none'; }
  }

  // ---- run stats ----
  const fmt = (n) => Math.floor(n).toLocaleString('en-US');
  const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  function stats(s) {
    const st = s.stats || {};
    return [
      ['Time', mmss(s.t || 0)], ['Turf', `${s.blocks.filter((b) => b.owner === 'player').length}/${s.blocks.length}`],
      ['Earned', '$' + fmt(st.earned || 0)], ['Knockouts', st.ko || 0], ['Best streak', st.bestStreak || 0],
      ['Blocks taken', st.taken || 0], ['Blocks lost', st.lost || 0], ['Jobs', `${Math.min(s.missionIdx || 0, MISSIONS.length)}/${MISSIONS.length}`],
      ['Stunts', st.stunts || 0], ['Races', st.races || 0], ['Fares', s.fares || 0], ['Runs', s.runs || 0],
      ['Stashes', `${(s.stashes || []).length}/${STASHES.length}`], ['Knocked out', st.wasted || 0], ['Locked up', st.busted || 0],
    ];
  }
  function summaryText(s) {
    const st = stats(s), head = s.over === 'win' ? 'Street Empire: I run this city.' : s.over === 'lose' ? 'Street Empire: pushed out.' : 'Street Empire run so far.';
    return head + ' ' + st.map(([k, v]) => `${k} ${v}`).join(', ') + '.';
  }
  function renderStats(el, s) {
    if (!el) return; el.textContent = '';
    for (const [k, v] of stats(s)) { const d = document.createElement('span'); d.innerHTML = `<i></i><b></b>`; d.firstChild.textContent = k; d.lastChild.textContent = v; el.appendChild(d); }
  }
  async function copySummary(s, btn) {
    const text = summaryText(s);
    try { await navigator.clipboard.writeText(text); if (btn) btn.textContent = 'COPIED'; }
    catch (e) { if (pop) pop(text); if (btn) btn.textContent = 'COPY FAILED'; }
    if (btn) setTimeout(() => { btn.textContent = 'COPY SUMMARY'; }, 1800);
  }

  // ---- stream mode ----
  function setOn(v, remember = true) {
    on = !!v;
    document.documentElement.classList.toggle('stream', on); document.body.classList.toggle('stream', on);
    if (remember) try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { /* storage off */ }
    for (const el of document.querySelectorAll('[data-stream]')) { if (el.type === 'checkbox') el.checked = on; else el.textContent = 'STREAM MODE: ' + (on ? 'ON' : 'OFF'); }
  }
  for (const el of document.querySelectorAll('[data-stream]')) {
    if (el.type === 'checkbox') el.onchange = () => setOn(el.checked);
    else el.onclick = () => setOn(!on);
  }

  function tick(s, rdt) {
    for (let i = lines.length - 1; i >= 0; i--) {
      const L = lines[i]; L.t -= rdt;
      if (L.t <= 0) { L.el.remove(); lines.splice(i, 1); continue; }
      if (L.t < 1) L.el.style.opacity = String(Math.max(0, L.t));
    }
    bar(s, rdt);
    if (clockEl && on) clockEl.textContent = mmss(s.t || 0);
  }
  return { push, fx, wanted, tick, stats, renderStats, summaryText, copySummary, setOn, get on() { return on; } };
}
