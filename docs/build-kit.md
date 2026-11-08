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
6. Writes `public/models/kit/...`, updates kit.json and the credits.

Other commands: `list`, `remove car sedan`, `remove building house house-2`, `inbox`.

## Checking a model for flaws

`node tools/kit-check.mjs model.glb` (slot read from the file name) reports:
- **Open windows**: window openings with no glass, so you can see through the car. AI-made models often leave the rear side windows open.
- **Size**: width and height against the real vehicle for that slot.

`node tools/kit-glaze.mjs in.glb out.glb` fills every open window it finds with glass, using a dark glass pixel the model already has, so the game's finish pass shades it like the other windows. Import `out.glb` as usual (`@keep`).

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
