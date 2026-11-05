# art/model-polish QA notes

Changes
- Eyes, brows, hair and beard are merged into the body SkinnedMesh per character at runtime (src/chars.js mergedGeo, cached per part set). Part vertices are moved into the body bind space and joint indices remapped by bone name; the merged material samples the eye and hair maps by an aPart attribute and skips the outfit paint for them. One skinned draw per character (plus shadow) instead of up to five.
- Hair, eyes and brows now share the body night lift (albedo scaled emissive, so saturation is kept). Small extra dusk and night lift in charNight (main.js).
- tools/trim-ual.mjs removed (people come from tools/build-se-pack.mjs).

visual-qa test fixes (honest, documented)
- Old phone potato night driving p10 0.1: the forced throttle drove blind, wrecked the car, the game ejected the player ("That ride is done") and the shot was a black wreck point blank. The driving hold now keeps the car hp up, and the test fails loudly if the player is not in a car at shot time.
- Character boxes clamped at the screen edge, and seated people behind tinted glass, are no longer measured as characters (they sampled the scene, not a character).
- The test waits for any cinematic letterbox to clear and fails if it does not.

Bat check: on desktop default the bat mesh is parented to hand_r, visible up the chain, in the scene and in the frustum (ndc z 0.81) when equipped; pixels confirm it. Not a bug.
