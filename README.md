# Street Empire (v0.2 prototype)

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

Phones get low settings automatically (no shadows, no dynamic street lights, pixel ratio up to 1.25, character LOD at 32 m). Add `?low` to the URL to force low settings on desktop.

## What is new in v0.2

- Rigged humanoids with idle, walk, jog, sprint, jab, cross, hit and knockdown animations. Crew clothing colors are painted in the shader so all characters share one small model.
- A denser city: brick and concrete facades with lit windows, storefronts, awnings, neon signs, graffiti, rooftops with AC units and water towers, alleys with dumpsters, trash and fences, sidewalk trees, hydrants and street lamps. PBR materials, a dusk sky with an environment map, fog and ACES tone mapping.
- Cars with spinning and steering wheels, body roll, headlights and beams, bicycle-model driving, AI traffic that follows the lanes and turns at intersections, and pedestrians walking the sidewalks. You can jack traffic cars.
- Punches hit harder: knockback, hit-stop, camera shake, a jab and cross combo and phone vibration.
- Rival crews route along the streets through a small navigation graph instead of walking into walls.
- Synthesized sound: footsteps, punches, swings, an engine that follows your speed, crashes, capture stings and a quiet city background with distant horns.
- Phone performance: low settings by default on touch devices, characters far away swap to instanced stand-ins (LOD), instanced props, adaptive resolution, and all textures are drawn on canvases at load so there are no image downloads to decode. Add `?high` to force high settings on a phone.

## Credits

- Character model and animations: Universal Animation Library by Quaternius, CC0 1.0 (`public/models/LICENSE-Quaternius-CC0.txt`). Trimmed to the needed clips and compressed with meshopt by `tools/trim-mannequin.mjs`.
- Everything else (city, cars, textures and sound) is generated in code.

## Code layout

- `src/state.js`: pure, serializable game state and simulation (blocks, crews, economy, AI, combat, cars). No rendering code.
- `src/net.js`: session seam. `LocalSession` runs the sim in the tab. An online session can implement the same `send(action)`, `input(...)`, `tick(dt)` interface and talk to an authoritative host.
- `src/main.js`: renderer, camera, input (keyboard, mouse, touch), HUD and game feel. It only reads state and sends actions.
- `src/city.js`, `src/vehicles.js`, `src/chars.js`, `src/audio.js`: city builder, car models, character loading and animation, and synthesized sound.
- `tools/smoke.mjs`: headless Playwright smoke test for desktop and phone.

## Develop

```
npm install
npm run dev
npm run build
```

Pushes to `main` deploy to GitHub Pages through `.github/workflows/pages.yml`.
