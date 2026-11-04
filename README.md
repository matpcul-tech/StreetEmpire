# Street Empire (v0.1 prototype)

A third-person browser game about building a street empire one block at a time. Think "World of Warcraft for the streets": every block is territory, every block runs a hustle, and rival crews are always expanding.

Play it: https://matpcul-tech.github.io/StreetEmpire/

## How to play

- You start as a youngster with one block in the corner of the neighborhood.
- Beat a block's defenders, then stand in the ring at its center for a few seconds to take it.
- Each block runs one hustle that pays its owner cash every second.
- Spend cash on recruits who follow you and fight.
- Three AI crews (Red Kings, Blue Hand, Gold Line) earn, recruit, push into neighboring blocks, and attack each other and you.
- Win by owning all 9 blocks. Lose if your last block falls.

### Controls

| Action | Desktop | Phone |
| --- | --- | --- |
| Move | WASD or arrows | Left stick |
| Look | Mouse (click to lock) | Drag right side |
| Sprint | Shift | RUN toggle |
| Punch | Click or F | PUNCH |
| Enter or exit car | E | CAR |
| Recruit ($100) | R | RECRUIT |

In a car, forward and back are throttle and left and right steer. Hitting rivals at speed knocks them down.

Phones get low settings automatically (no shadows, no dynamic street lights, pixel ratio 1). Add `?low` to the URL to force low settings on desktop.

## Code layout

- `src/state.js`: pure, serializable game state and simulation (blocks, crews, economy, AI, combat, cars). No rendering code.
- `src/net.js`: session seam. `LocalSession` runs the sim in the tab. An online session can implement the same `send(action)`, `input(...)`, `tick(dt)` interface and talk to an authoritative host.
- `src/main.js`: Three.js rendering, camera, input (keyboard, mouse, touch) and HUD. It only reads state and sends actions.
- `tools/smoke.mjs`: headless Playwright smoke test for desktop and phone.

## Develop

```
npm install
npm run dev
npm run build
```

Pushes to `main` deploy to GitHub Pages through `.github/workflows/pages.yml`.
