# Build kit: realistic cars, buildings and characters

The build kit swaps the built-in cars, buildings and people for downloaded models, slot by slot. Anything not installed keeps the built-in look, and a model that fails to load falls back too, so a bad upload never breaks the game.

- Viewer: https://matpcul-tech.github.io/StreetEmpire/kit.html (preview every installed model the way the game sees it: front arrow, space in game, triangles, draw calls, spinning wheels, credit)
- Manifest: `public/models/kit/kit.json`
- Runtime: `src/kit.js` (used by `src/vehicles.js` and `src/city.js`)
- Importer: `tools/kit-import.mjs`
- Phone upload: `kit-inbox/` plus `.github/workflows/kit.yml`
- Characters: `src/retarget.js` plays the game's clips on any humanoid rig (see Characters below)

## Slots

| Kind | Slots | In game |
| --- | --- | --- |
| car | sedan, muscle, suv, van, taxi, police, lowrider, pickup | scaled to 4.4 m long (set `len`), sits on the road, wheels spin and steer, paint changes per car, police get the light bar, headlight beams and brake glow are added |
| building | house, store, apt, tower, shed | fitted into the 13 m corner lot, turned to face a street, the hustle sign is added; a slot can hold variants (`house`, `house-2`, `house-3`) and the city mixes them |

Which buildings each district uses: Eastside is store, house and apt. Downtown is tower and apt. Harbor is shed.

## Add a model from your phone

1. Download the model as `.glb`, or as a glTF `.zip` (Sketchfab: Download 3D Model, then glTF). FBX, OBJ and BLEND need converting to glTF first.
2. Rename it to its slot: `sedan.glb`, `police.zip`, `house-2.glb`.
3. In the GitHub app or site open `kit-inbox/cars` or `kit-inbox/buildings`, then Add file, Upload files, Commit to main. GitHub's upload limit is 25 MB per file.
4. The Build kit import workflow shrinks it for phones, installs it, commits, and redeploys. Its summary page lists triangles, file size, wheels found and any warnings. A file it cannot use stays in the inbox and the run shows FAILED with the reason.
5. Check it at kit.html, then in the game.

### Settings in the file name

Add them before the extension, each starting with `@`:

| Tag | Meaning | Example |
| --- | --- | --- |
| `@yaw180` | turn the model (degrees) when it faces the wrong way. Cars guess the front from their lamps when this is left out | `van@yaw180.glb` |
| `@len4.9` | car length in meters (default 4.4) | `suv@len4.9.zip` |
| `@fp11` | building footprint in meters (default 13, the full lot) | `store@fp11.glb` |
| `@nopaint` | car keeps its own color on every copy | `taxi@nopaint.glb` |
| `@keep` | finished model: skip simplifying and merging, so parts, wheel rig and pivots stay exactly as built (textures and file are still compressed) | `sedan@keep.glb` |
| `@tex2048` | keep textures up to 2048 px instead of 1024 for a hero car (four times the phone video memory per texture) | `sedan@keep@tex2048.glb` |

### Credit

For CC BY models, upload a text file with the same name next to it (`sedan.txt` for `sedan.glb`) holding the title, author, link and license. It is stored in kit.json and written into CREDITS.md automatically.

## What the importer does

`node tools/kit-import.mjs add car sedan path/to/file.zip` (or `npm run kit -- add ...`) runs the same steps the workflow runs:

1. Reads `.glb`, `.gltf` or a `.zip` (Draco compressed files too).
2. Cars: guesses the front from tail and head lamp parts.
3. Simplifies when over budget: 40k triangles for a car, 60k for a building.
4. Merges parts by material to cut draw calls, keeping each wheel separate:
   - A wheel rig the modeler built (a node per wheel named wheel, tire or rim, origin on the axle) is kept exactly: same nodes, same pivots. Its origin has to sit on the wheel; an origin left at the car center is not trusted.
   - Otherwise wheel parts (tire, rim, nuts, brake disc), found by node, mesh or material name, are gathered into one node per corner with its pivot at the middle of the parts.
   - Either way the wheel nodes are tagged, and the game spins and steers them around exactly that pivot. The steering wheel is left in the body.
   - A model that is one solid piece (a raw Meshy export) has no wheels to find: it still drives, but the wheels do not spin. Split the wheels into separate parts first.
5. Textures to WebP, 1024 px or less. Quantize and meshopt.
6. Buildings over 12k triangles also get a far version (`<name>.far.glb`): simplified at no more than half a percent of the model's size, with texture seams kept and 512 px textures. The game draws it instead of the full model past 38 m on phones (70 m on high), so only the buildings near the player cost full detail. `node tools/kit-import.mjs far` remakes them for every installed building.
7. Writes `public/models/kit/...`, updates kit.json and the credits.

Meshy buildings sometimes ship with normals pointing into the model, which shows in game as black holes and shredded stripes on the walls. `node tools/kit-normals.mjs --dry public/models/kit/buildings/*.glb` reports them; run it without `--dry` (add `--all` when the walls still look shredded) to fix the file, then `node tools/kit-import.mjs far` so the far version matches.

Other commands: `list`, `remove car sedan`, `remove building house house-2`, `inbox`.

## Checking a model for flaws

`node tools/kit-check.mjs model.glb` (slot read from the file name) reports:
- **Open windows**: window openings with no glass, so you can see through the car. AI-made models often leave the rear side windows open.
- **Size**: width and height against the real vehicle for that slot.

`node tools/kit-glaze.mjs in.glb out.glb` fills every open window it finds with glass, using a dark glass pixel the model already has, so the game's finish pass shades it like the other windows. Import `out.glb` as usual (`@keep`).

## Finished cars from Sovereign Asset

A car finished in Sovereign Asset arrives ready: one material, one texture, four wheels split off, and a window mask. Upload it as `<slot>@keep.glb` (`sedan@keep.glb`) so the importer leaves the parts and pivots alone.

What the file carries and what the game does with it:

| In the file | Meaning |
| --- | --- |
| Nodes `wheel_fl`, `wheel_fr`, `wheel_rl`, `wheel_rr` with `extras.kitWheel: true`, origin on the axle | The game spins and steers each one around that origin. A wheel node may hold its mesh directly; the importer moves the mesh to a child so compression cannot shift the origin. |
| One material with `extras.kitMask: true` | The car has a window mask. |
| That material's emissive texture, emissive factor `[0, 0, 0]` | The mask image, on the same UVs as the base texture. Red is glass, green is body paint, blue is chrome, black is everything else (tires, trim, lamps, underside). Emissive factor 0 means it shows as nothing in any other viewer. |

Without a mask the game sorts every pixel by its color: dark and gray is glass, the body's main hue is paint. That is a guess, so black trim and tires pick up the glass shine, a window with a reflection painted on comes out patchy, and paint creeps over the window edge when a car is repainted. With a mask none of that is guessed: glass, paint and chrome are exactly where the mask says (`finishMaterial` in `src/kit.js`), and the body color for repaints is read from the paint pixels only.

The importer keeps the mask lossless (lossy compression rings at every edge, which is the bleed the mask is there to stop) and resizes it with the other textures. Its summary line says `window mask kept lossless`. kit.html shows `window mask: yes` for the car. Do not name the material paint or body: a masked material is always repainted per pixel.

`npm run test:mask` builds a small masked car, runs it through the importer in a temp folder, and checks the mask comes out pixel for pixel the same and every wheel origin is still on its axle.

## Picking models that work

- Pick low poly or game ready models of 5k to 40k triangles. Film-quality cars of 300k triangles get cut down hard and can look melted.
- Fewer materials is better. Each material costs a draw call per copy on screen.
- Cars: separate wheel objects named wheel, tire or rim spin. A body material named paint or body gets per-car colors.
- No real brands, badges or plates, to match the style guide (docs/art-style.md). Generic 70s to 90s American cars fit the city best.
- Licenses: CC0 needs nothing. CC BY needs the credit file. Avoid NC (non commercial) if the game may ever earn money, and never use ripped game assets.

### Cars checked so far (Sketchfab, downloadable)

| Model | Author | License | Triangles | Fits slot |
| --- | --- | --- | --- | --- |
| [Kiri '86 low poly model](https://sketchfab.com/3d-models/kiri-86-low-poly-model-5c17c582ef9549798f694b660feea42a) | Daniel Zhabotinsky | CC BY 4.0 | 20.3k | sedan, taxi |
| [Doutrive '78 low poly model](https://sketchfab.com/3d-models/doutrive-78-low-poly-model-30700a84311c4bea9ef722f0773ce92a) | Daniel Zhabotinsky | CC BY 4.0 | 24.6k | suv (70s pickup) |
| [LowPoly old Car](https://sketchfab.com/3d-models/lowpoly-old-car-dcdbebf75afb418f911b2b0e13a9d393) | pbwmograph | CC BY 4.0 | 8.7k | sedan, lowrider base |

The same author's Riverside '88 (a late 80s American sedan) is also worth checking for sedan or police. Confirm the license on each page before uploading, licenses can change.

### Finding more

On Sketchfab, search for the vehicle or building, then filter Downloadable, License (CC0 or CC Attribution) and Face count (up to 50k). Good search words: "low poly", "game ready", "PBR", plus an era or type ("80s sedan", "corner store", "stucco house", "warehouse").

## Motorcycles

The city has parked sport bikes you can ride: get on with the same button as a car, the rider is visible, the bike leans into turns, the bars and front wheel turn, and both wheels spin. They are listed under `bikes` in kit.json:

```json
"bikes": { "sportbike": { "file": "bikes/sportbike.glb", "yaw": 0, "length": 2.1 } }
```

There are three models: `sportbike`, `cruiser` and `dirtbike`. A parked bike carries its model, which picks the file here and its numbers in `BIKE_MODELS` (src/state.js): the sport bike is fastest, the cruiser is slower and tougher, the dirt bike is slowest and quickest off the line. Optional keys per model:

- `"seat": { "y": 0.7, "z": -0.3, "lean": 0.1 }`: where the rider sits (height in meters, how far behind the middle, how far he leans forward). Without it the sport bike's seat is used.
- `"axle": "z"`: for a file built sideways (long axis on x, turned here with `"yaw": 90`), the axis its wheel nodes spin on.
- `"paint": false`: keep the model's own colors.

The cruiser and the dirt bike have no steer node: their forks are one piece with the frame, so the front wheel spins but does not turn with the bars.

Bikes do not go through kit-inbox yet. A raw Meshy bike is one fused mesh, so it is rigged first and the finished file is committed to `public/models/kit/bikes/`. The file needs:

| Node | Tag in extras | What it is |
| --- | --- | --- |
| `wheel_rear` | `kitWheel: true` | rear tire, rim and disc, origin on the axle |
| `steer` | `kitSteer: true`, `kitSteerAxis: [x, y, z]` | origin on the steering head; holds the fork, fender, calipers, bars and levers, and the front wheel under it. The game turns it around the axis (the fork's rake) |
| `wheel_front` | `kitWheel: true` | child of `steer`, origin on the axle |
| `body` | none | everything else |

Same rules as cars otherwise: faces +z, tires on y=0, one material, 1024 px WebP textures, quantized and meshopt compressed. The sport bike is 30,862 triangles in 4 draw calls. Paint is changed per bike the same way single-texture cars are repainted (the body's main hue is swapped, chrome, tires and lamps stay).

If the bike file is missing or fails to load, the game draws a plain block bike instead, so it never breaks.

### A second bike: the cruiser

A parked bike picks its model with `model` on the car (`model: 'cruiser'`; none means the sport bike). Both models share the bike type, stats and rules. The cruiser's kit.json entry carries what differs from the sport bike, all in meters in the model's space (x across, y up, z forward):

| Key | Meaning |
| --- | --- |
| `head`, `tail` | `[y, z]` of the headlamp and tail lamp glow |
| `rider` | overrides for `BIKE_SEAT`: `y`, `z` (where the rider sits), `lean` (0.04 is upright), `thigh`, `calf`, `spread` |
| `grips` | `[x, y, z]` of the left grip; the right one is mirrored. When set, the rider's hands are put on the grips |
| `paint` | `false` keeps the model's own color on every copy |

The cruiser has no `steer` node: its fork and front fender are one piece with the frame, so the bars do not turn and the lean carries the turn. `tools/bike-split.mjs` made its two wheel nodes from the one-piece Meshy file without remodeling anything (it finds the tires, fits the axles, and moves each tire with its rim, spokes, hub and brake disc under its own node):

```
node tools/bike-split.mjs raw.glb split.glb      # add --front +x (or +z, -z) when the bike does not face -x
```

The split file is then compressed like any kit model (textures to 1024 px WebP, quantize, meshopt) with its wheel nodes tagged `kitWheel`, and committed as `public/models/kit/bikes/cruiser.glb`.

`npm run test:bike` checks the riding rules for both models. `node tools/bike-shots.mjs <url> <dir>` shoots the cruiser parked, ridden, leaning and at night.

In the game: `makeBike` in `src/vehicles.js`, `prepBike` and `cloneKitBike` in `src/kit.js`, the rider pose in `src/main.js` (`BIKE_SEAT`, `bikePose`), stats and parked spots in `src/state.js` (`CAR_TYPES.bike`, `addBikes`).

## Characters

A rigged character in a slot replaces the painted people for whoever wears that slot. The game's own 18 animation clips (idle, walk, jog, sprint, punches, bat, pistol, driving, hits, roll, jump, knockout, talking) are retargeted onto the character's skeleton when the game loads, so the art team never has to animate anything.

| Slot | Who wears it |
| --- | --- |
| player | you |
| unc | Unc, the man in the suit |
| crew | your crew members and followers |
| reds, blues, golds | Red Kings, Blue Hand and Gold Line members |
| locals | the Locals crew |
| cop | police on foot and in cars |
| ped | people on the street and drivers |

A slot can hold variants (`reds.glb`, `reds-2.glb`, `reds-3.glb`); the game mixes them across the crew. Potato quality keeps the light painted people.

### From Meshy

1. Generate with the A-pose or T-pose option on.
2. Remesh: Fixed, Custom 12000, Triangle.
3. AI Texture the remeshed model.
4. Rigging: Humanoid. Any skeleton template works (Mixamo is the default).
5. Download the rigged GLB (no animations needed, the game brings its own; any in the file are dropped).
6. Rename it to the slot (`player.glb`, `reds-2.glb`) and upload it to `kit-inbox/characters`.

Mixamo, Unreal, Unity, Blender Rigify and 3ds Max Biped style rigs work too: bones are matched by name (left and right arm, forearm, hand, fingers, thigh, calf, foot, toes, neck, head) and the spine by its chain from the hips. A pose and T pose are both fine; each limb is lined up with the game rig's rest pose before the clips are copied.

### Settings in the file name

| Tag | Meaning | Example |
| --- | --- | --- |
| `@yaw180` | the model faces away from the gold arrow in kit.html | `cop@yaw180.glb` |
| `@h1.9` | height in meters (default 1.8; a boss can stand taller) | `reds@h1.92.glb` |

### What the importer does

`node tools/kit-import.mjs add character player path/to/rigged.glb [--yaw 180] [--height 1.9]`

1. Refuses a model with no skeleton, or one missing bones the game animates, with the reason.
2. Drops animations in the file.
3. Simplifies to 15k triangles (texture seams kept). A crew can put ten of these on screen at once.
4. Textures to WebP, 1024 px or less. Quantize and meshopt. Parts and skeleton stay as rigged.
5. Writes `public/models/kit/characters/...` and updates kit.json and the credits.

In game (`src/chars.js`, `src/retarget.js`): weapons go in the right hand in the same grip as the painted people, and the night rim light is added to the character's materials. A model the retargeter cannot use keeps the painted body for that slot, and the browser console says why.

Check it in kit.html: Characters, pick the slot, then tap Idle, Walk, Run, Punch, Bat, Pistol, Drive, Talk, Hit and KO.

`node tools/retarget-test.mjs` checks the bone name matching against Meshy, Mixamo, Unreal, Rigify and Biped names.
