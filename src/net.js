// Network seam. v0.1 runs a LocalSession: the simulation lives in this tab.
// A future OnlineSession can implement the same interface: send actions to an
// authoritative host (WebSocket or WebRTC), and receive state snapshots.
import { createState, step, applyAction, movePlayer, player } from './state.js';

export class LocalSession {
  constructor() { this.state = createState(Date.now()); this.localPlayerId = player(this.state).id; }
  send(action) { applyAction(this.state, this.localPlayerId, action); }
  input(mx, mz, sprint, dt) { movePlayer(this.state, player(this.state), mx, mz, sprint, dt); }
  tick(dt) { step(this.state, dt); }
  drainEvents() { const e = this.state.events; this.state.events = []; return e; }
}
