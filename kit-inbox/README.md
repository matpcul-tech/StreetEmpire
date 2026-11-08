# Build kit inbox

Upload a model here from your phone and the Build kit import workflow installs it in the game.

- Cars go in `cars/`, named after their slot: sedan, muscle, suv, van, taxi, police, lowrider, pickup (`sedan.glb`, `police.zip`).
- Buildings go in `buildings/`: house, store, apt, tower, shed. Variants: `house-2.glb`, `house-3.zip`.
- Characters go in `characters/`, rigged (Meshy: Rigging, Humanoid). Names and heights are in `public/models/kit/character-roster.json`. Example: `reds-m-1@h1.82.glb`. `-m-` and `-f-` pick the men's or women's pool. A missing file keeps the painted body.
- Wrong way round? Add `@yaw180` before the extension (`van@yaw180.glb`). More settings in docs/build-kit.md.
- CC BY model? Upload `sedan.txt` next to `sedan.glb` with the title, author, link and license.

Preview: https://matpcul-tech.github.io/StreetEmpire/kit.html
