// Clips (v0.14): the game records itself into a rolling buffer, and a moment (or a tap on CLIP, or K) cuts the
// last stretch of play out as a video file: the frame as rendered, card and all, with the game's sound.
// Two recorders run a segment apart, so there is always one with between one and two segments of history.
// A cut stops the older one after the moment has played out, keeps its file, and the pair rolls on. The
// clips stay in memory (the last eight) and the pause menu saves or shares them. Nothing leaves the device.
const SEG = 12; // seconds between recorder rotations: a clip holds 12 to 24 s before the cut, plus the aftermath
const KEEP = 8;

export function createClips({ canvas, audioStream, isTouch, onClip }) {
  const MR = window.MediaRecorder;
  const mime = MR && ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4;codecs=avc1,mp4a', 'video/mp4'].find((m) => MR.isTypeSupported(m));
  const supported = !!(MR && mime && canvas.captureStream);
  const ext = mime && mime.includes('mp4') ? 'mp4' : 'webm';
  let stream = null, old = null, young = null, on = false, rotT = 0, pending = null, cutting = false;
  const clips = [];
  function getStream() {
    if (stream) return stream;
    stream = canvas.captureStream(30);
    const a = audioStream && audioStream(); if (a) for (const t of a.getAudioTracks()) stream.addTrack(t);
    return stream;
  }
  function rec() {
    const r = new MR(getStream(), { mimeType: mime, videoBitsPerSecond: isTouch ? 3500000 : 6000000, audioBitsPerSecond: 96000 });
    const chunks = []; r.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    r.start(1000); return { r, chunks, at: performance.now() };
  }
  const stop = (h) => new Promise((res) => { if (!h || h.r.state === 'inactive') return res(null); h.r.onstop = () => res(new Blob(h.chunks, { type: mime })); try { h.r.stop(); } catch (e) { res(null); } });
  function setOn(v) {
    v = !!v && supported; if (v === on) return;
    on = v;
    if (on) { old = rec(); young = null; rotT = SEG / 2; }
    else { const a = old, b = young; old = young = null; stop(a); stop(b); }
    try { localStorage.setItem('se-clips', on ? '1' : '0'); } catch (e) { /* storage off */ }
  }
  async function cut(title) {
    if (!on || cutting) return;
    cutting = true;
    const h = old && old.r.state !== 'inactive' ? old : young; if (h === old) old = null; else young = null;
    const blob = await stop(h);
    if (blob && blob.size > 50000) {
      const dur = Math.round((performance.now() - h.at) / 1000);
      const clip = { title, blob, dur, at: new Date(), url: URL.createObjectURL(blob), name: `street-empire-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Date.now().toString(36)}.${ext}` };
      clips.unshift(clip); while (clips.length > KEEP) URL.revokeObjectURL(clips.pop().url);
      if (onClip) onClip(clip);
    }
    if (!old) { old = young || rec(); young = null; rotT = SEG / 2; }
    cutting = false;
  }
  const api = {
    get supported() { return supported; }, get on() { return on; }, get list() { return clips; }, get armed() { return !!pending; },
    setOn,
    // a moment asks for a clip that ends `after` seconds from now, so the aftermath is in it. A later, bigger ask extends it.
    mark(title, after = 3) { if (!on) return; if (!pending || after > pending.left) pending = { title, left: after }; else pending.title = title; },
    cut(title = 'Clip') { if (!on) return; pending = null; cut(title); },
    update(rdt) {
      if (!on) return;
      if (pending) { pending.left -= rdt; if (pending.left <= 0) { const t = pending.title; pending = null; cut(t); } return; } // no rotation while a cut is due: the old recorder holds the lead-up
      if ((rotT -= rdt) <= 0) { rotT = SEG; if (old && young) { stop(old); old = young; young = rec(); } else if (!young) young = rec(); }
    },
    save(clip) { const a = document.createElement('a'); a.href = clip.url; a.download = clip.name; document.body.appendChild(a); a.click(); a.remove(); },
    async share(clip) {
      const file = new File([clip.blob], clip.name, { type: clip.blob.type });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: 'Street Empire: ' + clip.title }); return true; } catch (e) { return false; } }
      api.save(clip); return true;
    },
  };
  return api;
}
