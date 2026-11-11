# Street Empire (v0.3 prototype)

A third-person browser game about building a street empire one block at a time. Think "World of Warcraft for the streets": every block is territory, every block runs a hustle, and rival crews are always expanding.

Play it: https://matpcul-tech.github.io/StreetEmpire/

## How to play

- You start as a youngster with one block in the corner of the neighborhood.
- Beat a block's defenders, then stand in the ring at its center for a few seconds to take it.
- Each block runs one hustle that pays its owner cash every second.
- Spend cash on recruits who follow you and fight.
- Three AI crews (Red Kings, Blue Hand, Gold Line) earn, recruit, push into neighboring blocks, and attack each other and you.
- Win by wiping out the three rival crews. Lose if your last block falls.

### Controls

| Action | Desktop | Phone |
| --- | --- | --- |
| Move | WASD or arrows | Floating left stick |
| Look | Mouse (click to lock) | Drag right side |
| Sprint | Shift | RUN toggle |
| Jump | Space | JUMP |
| Attack or shoot | Click or F | HIT or SHOOT |
| Switch weapon | Q | Weapon button |
| Car, talk to Unc | E | Context button |
| Recruit ($100) | R | +CREW |
| Drive | W and S gas and brake, A and D steer | GAS, BRAKE and arrow buttons |
| Radio (in a car) | M | RADIO |
| Shop, buy a safehouse | E | SHOP or BUY (context button) |

In a car, forward and back are throttle and left and right steer. Hitting rivals at speed knocks them down.

The game saves itself on this device every few seconds, when you pause and when you leave the page. The title screen then offers CONTINUE, with NEW GAME under it (two taps, it erases the save). RESTART in the pause menu also starts over.

Phones get low settings automatically (no shadows, no dynamic street lights, pixel ratio up to 1.25, character LOD at 32 m). Add `?low` to the URL to force low settings on desktop.

## What is new in v0.12

- **Cleaner look.** Yard grass is fine-grained (the old texture read as blotchy camouflage), the daytime haze starts farther out, colors are a little richer with deeper blacks, and on landscape phones the district tag sits under the radar so it no longer covers the message banner.

- **Sharper on phones.** Low quality (the phone default) now renders at up to twice the old resolution, smooths stair-step edges, and puts a soft shadow under people and cars. The resolution still steps down by itself if the frame rate drops.

- Poles, lamp posts and tree trunks dissolve when they are close to the camera, so one between you and the camera no longer blocks the view. The first time you reach a ramp, race, garage or stash, one line says what it is for, and How to Play covers the new things around town.

- **Fares.** Drive a car with no job on and someone on a nearby corner flags you down (`F` on the radar). Stop beside them, take them to the marker, stop. Pay is by distance, with a tip for speed that shrinks with every dent, and a bonus every fifth fare in a row.
- **Body armor** at the shops: $200, soaks 60 damage before your health goes.
- The RADIO button moved beside the pause button, clear of the message banner.

- **Drive-bys.** FIRE in a car (or click, or F) shoots the pistol from the driver's seat at the nearest rival or officer, or straight ahead at a car.
- **Police helicopter.** Four stars brings one overhead with a light on you. While it watches, heat does not cool. Outrun it, respray at a garage, or wait for it to break off and refuel.
- **Progress.** The pause screen shows percent complete across jobs, turf, ramps, stashes, races and safehouses.

- **Side activities.** Three street races (`R` on the radar): stop a car on the yellow ring and the clock runs, with gold, silver and bronze times. Three garages (`G`): pull in slowly with $150 for a fix and a respray, which also clears your heat unless an officer saw you go in. Twenty hidden stashes in the alleys, not on the radar; find them all for a bonus and more health. `npm run test:side` covers the rules.

- **The radio talks.** Between songs a DJ line, an ad for a made-up business, or news about what you just did shows on screen. Stations can also play recorded drops between songs (see `docs/radio.md`). Each contact now has something to say when a job comes back done or blown.

- **Fire and explosions.** A car beaten or shot down to a sixth of its health catches fire and blows a few seconds later. The blast hurts everything near it, other cars included, so a row of parked cars goes up one after another. Guns now hit cars.
- **Stunt ramps.** Eight orange ramps sit in the middle of streets around the city (a `^` on the radar). Hit one fast and straight and the car flies in slow motion. The first clean jump off each pays a bonus.
- **Near misses.** Pass moving traffic close and fast without touching it for a small payout that grows with a streak.
- Feel: slow motion on a hard crash, and the engine note now climbs through four gears. `npm run test:chaos` covers the rules.

- **The city reacts.** Every pedestrian has a temper. Most run from trouble; some freeze with their hands up, some stop to watch a fist fight, some swing back, and some phone it in (knock them off the phone before the call goes through or your heat jumps). People dive out of the way of a fast car and have something to say as you walk past. Drivers floor it through the lights when a gun goes off, or leave the car and run. Rear-end someone and they may get out swinging, take off, or lean on the horn. One driver in five comes back for a jacked car. `npm run test:city` covers it.

- A 19 job chain across four contacts: Unc (Eastside), Dee (Midtown), Rook (Downtown) and Sal (Harbor). Job types: fetch, pickups, car theft, block takeover, clean delivery, tailing, a lap of the Loop, a car chase, crew fights, block defense, losing the police, and marked targets.
- Courier runs: on a bike with no job on, one of your blocks has a package at the curb (P on the radar). Load it, ride it to the marker, and get paid by distance with a bonus for speed. Built-up blocks pay half again as much.
- Build up a block: $200 doubles what its hustle earns. Rivals come for built-up blocks first, and a block that falls loses the work.
- Three motorcycles to ride: a sport bike (fastest), a cruiser (slower, tougher) and a dirt bike (quickest off the line). One of each is parked by the starting corner.
- A route line on the radar: the way along the streets to the job marker, or to the contact with the next job.
- Police escalation: four stars brings tactical units (more officers, three to a tougher cruiser), five stars puts roadblocks on the street ahead of your car.
- Car radio: RADIO on a phone or M on a keyboard steps through the stations. King Rando Radio plays the game's own tracks and comes first on the dial; three more stations are made in code. Tracks go in `public/radio/` (see docs/radio.md). The radio plays on bikes too.
- Shops (green markers, $ on the radar): pistol, shotgun, bat, brass knuckles and a patch up, for cash.
- Safehouses (blue markers, H on the radar): four to buy, one per district. You come back at your nearest one when you go down, you heal and the heat cools while you stand at it, and a car of your own waits at the curb.
- A 9 by 9 block city (81 blocks, about 520 m across) in four districts: Eastside, Midtown, Downtown and the Harbor. Each rival crew starts with a 2 by 2 corner.
- The Loop: traffic on the ring road around the city runs faster and does not stop for lights.
- Save game: CONTINUE on the title screen.
- Daytime lighting: dark asphalt, blue sky, real contrast.
- The simulation is cheaper per step on the big map than it was on the small one (spatial buckets for the fighters' foe search, one pass for block capture).

## What is new in v0.3

- People on Quaternius' Universal Animation Library mannequin, with painted outfits and faces: crews wear their own colors, police wear uniforms, Unc wears a suit, and pedestrians vary.
- Two motorcycles: the sport bike and a black cruiser, parked side by side at the starting corner and around the city. Your crew follows on foot when you ride.
- Kenney Car Kit vehicles: sedan, muscle car, SUV, van, taxi and police cruiser, with visible drivers, damage smoke and wrecks.
- Traffic lights at every intersection. Traffic stops on red and for people in the road.
- Wanted level (five stars): fighting, carjacking, hitting people with cars and shooting raise heat. Police cruisers chase you, officers get out and fight, and at three stars they shoot. Lose them and the heat fades. Get knocked out while wanted and you are BUSTED.
- Day and night cycle (one day every 8 minutes) with lit windows, street lamps and headlights at night.
- A 5 by 5 block city across Eastside, Downtown (taller towers) and the Harbor, built in sections as you move.
- Pedestrians walk the sidewalks, flee from fights and gunfire, and can be knocked down (they get back up).
- Weapon pickups: a bat and a pistol (non-gory: targets just fall down).
- Rotating radar with turf colors, crews, cops, pickups and mission markers.
- Unc gives five short missions: Bag Back, Package Run, Send a Message, Chop Job and Take Over.
- Mobile controls: floating stick, context button (CAR, TALK, EXIT), HIT or SHOOT, JUMP, RUN, weapon switch, and GAS, BRAKE and steering buttons when driving.

## What was new in v0.2

- Rigged humanoids with idle, walk, jog, sprint, jab, cross, hit and knockdown animations. Crew clothing colors are painted in the shader so all characters share one small model.
- A denser city: brick and concrete facades with lit windows, storefronts, awnings, neon signs, graffiti, rooftops with AC units and water towers, alleys with dumpsters, trash and fences, sidewalk trees, hydrants and street lamps. PBR materials, a dusk sky with an environment map, fog and ACES tone mapping.
- Cars with spinning and steering wheels, body roll, headlights and beams, bicycle-model driving, AI traffic that follows the lanes and turns at intersections, and pedestrians walking the sidewalks. You can jack traffic cars.
- Punches hit harder: knockback, hit-stop, camera shake, a jab and cross combo and phone vibration.
- Rival crews route along the streets through a small navigation graph instead of walking into walls.
- Synthesized sound: footsteps, punches, swings, an engine that follows your speed, crashes, capture stings and a quiet city background with distant horns.
- Phone performance: low settings by default on touch devices, characters far away swap to instanced stand-ins (LOD), instanced props, adaptive resolution, and all textures are drawn on canvases at load so there are no image downloads to decode. Add `?high` to force high settings on a phone.

## Credits

- People: Street Empire pack (`public/models/se-pack/`) built from Quaternius Universal Base Characters and Universal Animation Library, CC0 1.0. Full list in CREDITS.md.
- Cars: Car Kit by Kenney, CC0 1.0 (`public/models/cars/LICENSE-Kenney-CC0.txt`), plus the pack lowrider kitbash.
- Both are trimmed and compressed with meshopt by `tools/pack-assets.mjs`.
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

## v0.4 art direction

- Style guide: docs/art-style.md (golden hour haze, deep brown shadows, washed out palette).
- Original painted textures in public/tex (WebP, 512 or 1024 px), made by tools/process-art.py from generated art. No real brands.
- Eastside houses with porches, liquor store and corner market, basketball court, palms, telephone poles and wires, chain-link. Downtown towers and apartments. Harbor sheds, container docks and cranes.
- Crew caps, do-rags and neck bandanas. Cars merged into one body mesh plus wheels with chrome and dirt shading, new lowrider.
- Day-following sky reflections, warm haze fog, LUT grade, vignette, film grain (toggle on the title screen or G). `?nofx` turns post off.
- Title screen, key art, loading bar, app icon, manifest, og and twitter preview.

## v0.5 combat, driving and mission fixes

- Combat: knockback lean and knockout launch, hit sparks and dust, camera kick, hit stop, slow motion on your knockouts, layered impact sounds. Brass knuckles and a shotgun join fists, bat and pistol; guns get muzzle flash, recoil and shell casings. Lock-on aim assist (red ring), dodge roll with a short invulnerable window (C or DODGE), hold block (V or BLOCK).
- Driving: speed-sensitive steering, handbrake drift (Space or DRIFT), tire smoke, skid marks, suspension pitch and roll, crash bounce, sparks from crashes and scrapes, chase camera with speed-based field of view.
- Missions: recruits walk in formation and only fight next to you; at most three defenders of a block chase one target and only inside their block; fixed a pathfinding ping-pong that froze walkers; the Package Run drop sits in a Harbor parking lane with a tall pulsing beacon, a floating package, a radar dot and an on-screen arrow with distance.

### How missions work

- Data: `MISSIONS` in `src/state.js` is an ordered list of `{ title, intro, kind, reward, rep, time?, need?, crew?, gift? }`. Unc hands them out in order (`s.missionIdx`).
- Kinds: `hook` (short local fetch, and `gift: 'follower'` spawns a free squad member on the win), `fetch` (walk to a drop, bring it back), `beat` (knock out `need` members of `crew`), `chop` (steal a muscle car and deliver it), `take` (capture a marked block).
- Code: `startMission` sets up `s.mission` and its `target` marker, `missionCheck` handles car events, `missionStep` runs each tick for win and fail (timer). `passMission` and `failMission` pay out and emit `mission` fx. The client (`src/main.js` `missionTarget`) turns the target into the beacon, radar dot and edge arrow.
- Add one: append an entry to `MISSIONS`; for a new `kind`, add its setup in `startMission` and its win check in `missionStep`, then add a section to `tools/missions-test.mjs`.
- Test: `npm run test:missions` (optionally a seed) plays the opening beats and all five missions headless with a bot.

## v0.6 character proportions

- Closer to the v0.2 look: longer abdomen (x1.3), thighs and shins (x1.3), upper arms (x1.2) and a smaller head (x0.56), done with bone scales on the shared Quaternius rig (`PROP` and `BONE_SCALE` in `src/chars.js`). Each model is measured once in pose, lifted to the ground and scaled to 1.8 m.
- Clips keep only the hips translation and no scale tracks, so the proportions survive every animation.
- Caps and bandanas ride the head bone and shrink with it. Bone names lose their dots on load (`FistR`), which also fixes the bat and pistol never showing in hand before.
- Block uses a real boxing guard (first frame of the punch clip, held).
- Daytime exposure and haze toned down so midday no longer washes out.
- `tools/closeup.mjs <url> <out.png> [block]` takes a close-up of four characters.

## v0.7 characters on the Universal Animation Library

- Everyone now uses the slim, near real Quaternius Universal Animation Library mannequin from v0.2 (`public/models/ual.glb`, one 1.8 MB file instead of six character models).
- Outfits are painted in a shader from the rest pose (meters, baked once at load in `bakeBind`): tees, hoodies with pocket and drawstrings, numbered jerseys with side stripes, tank tops, zip jackets, police uniforms with badge and belt, and a suit with shirt and tie for Unc. Jeans get denim twill, knee fade and seams; sneakers get soles, laces and a color accent. Grit adds grime and dust at the hems.
- Faces: painted eyes with whites and irises, brows, nose shading, lips and optional stubble or a beard, plus short, long or shaved hair.
- Caps, do-rags, neck bandanas, a police peaked cap, Unc's hat and a ponytail sit on the head and neck bones.
- Women are 1.68 m with narrower shoulders, so they read as a different build instead of a stretched one.
- Animations from the library: idle, walk, jog, sprint, jab and cross combos, a melee swing for the bat, pistol shooting (also the shotgun), a dodge roll, the boxing guard (end of the punch enter clip), hits, death, jump and a seated driving pose. The bat, pistol, shotgun and knuckles are parented to the right hand bone.
- Distance stand ins (capsules) on phones are unchanged.

## v0.8 night lighting

- Blue purple moonlight and a much stronger sky fill at night, a lighter blue brown haze, a night exposure and a grade that lifts the shadows, so nothing goes pure black. Phones get a little more fill and exposure.
- Sodium street lamps: warm orange pools on the ground on every platform, plus six real point lights on the nearest lamps on desktop.
- Neon signs spill their color onto the sidewalk below as cheap additive pools.
- Characters get a cool rim light and a warm fill at night, so they read against dark streets.
- Headlights: a stronger spotlight on desktop and a headlight throw decal on the road on every platform. Parked cars keep their lights off.

## v0.8b car art

- One paint shader with four wear levels per car: rust at the low panels and arches, scratches, dents, sun bleached roof and hood, primer spots and mismatched panels, and dirt.
- Taxi checker band, police door panels, muscle car stripes, van side stripes and crew stickers. Rims vary between chrome, black and gold.
- Tinted see-through glass that shows the drivers.
- Glowing taillights, brake lights that flare when braking or stopped, and headlight flares at night.

## v0.11 street surfaces and lamp halos

- Road, sidewalks and stucco walls get CC0 ambientCG normal and roughness maps (`public/tex/pbr`, 512 px) under the warm painted color maps, so they catch light like real asphalt, concrete and plaster without leaving the West Coast palette. Taken from the art/street-demo look test, which used them at 1K.
- Every street lamp gets a soft sodium halo at night, drawn as one point cloud (one draw call for the whole city).

## Build kit (realistic models)

Swap the built-in cars and buildings for downloaded realistic models, slot by slot, from a phone: upload a `.glb` or glTF `.zip` named after its slot (`sedan.glb`, `house-2.zip`) into `kit-inbox/cars` or `kit-inbox/buildings`. A workflow shrinks it for phones (triangle budget, merged draw calls, WebP textures, meshopt), installs it and redeploys. Preview everything at `kit.html`. Full guide, file name settings and a checked model list: `docs/build-kit.md`.

## Release QA

See `docs/qa-checklist.md`. Tools: `tools/visual-qa.mjs` (brightness and silhouette gate), `tools/playtest.mjs` (scripted playthrough), `tools/night.mjs` and `tools/carshots.mjs` (review shots).
