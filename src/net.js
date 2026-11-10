// Network seam. v0.3 runs a LocalSession: the simulation lives in this tab.
// A future OnlineSession can implement the same interface: send actions to an
// authoritative host (WebSocket or WebRTC), and receive state snapshots.
import { createState, step, applyAction, movePlayer, player, migrate } from './state.js';

export class LocalSession {
  // saved: a state from an earlier session (it is plain JSON). The device's own cfg wins over the saved one.
  constructor(cfg, saved = null) {
    this.state = saved ? Object.assign(migrate(saved), { cfg: { ...saved.cfg, ...cfg }, events: [], fx: [] }) : createState(Date.now() % 100000, cfg);
    this.localPlayerId = player(this.state).id;
  }
  send(action) { applyAction(this.state, this.localPlayerId, action); }
  input(mx, mz, sprint, dt) { movePlayer(this.state, player(this.state), mx, mz, sprint, dt); }
  tick(dt) { step(this.state, dt); }
  drainEvents() { const e = this.state.events; this.state.events = []; return e; }
  drainFx() { const f = this.state.fx; this.state.fx = []; return f; }
}
