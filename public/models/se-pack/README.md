# Street Empire asset pack

Built from CC0 bases plus original parts. Rebuild with the scripts below
(the CC0 source packs are downloaded by hand from the URLs in CREDITS.md and
are not committed).

| File | Built by | What | Budget |
|---|---|---|---|
| `people.glb` | `node tools/build-se-pack.mjs <UBC dir> <UAL1_Standard.glb>` | 10 baked looks (male: short, buzz or no hair, with or without beard; female: long, buns, buzz or none), each one skinned mesh with body, eyes, brows, hair and beard joined (one draw call per character; part texels baked into a `_BAKE` vertex attribute), 18 clips, one 65 joint rig; 512 px webp body texture, meshopt | 4.3k to 5.7k tris per look |
| `people_lod.glb` | same script | potato LOD: same looks at about half the triangles, 256 px webp | 2.5k to 3.4k tris per look |
| `accessories.glb` | `node tools/build-se-acc.mjs` | original six panel snapback, tied bandana with tails, police peaked cap, short brim fedora, neck bandana; vertex color shading tinted by crew color in game | 70 to 420 tris each |
| `cars/lowrider.glb` | `node tools/build-se-cars.mjs` | Kenney sedan kitbash with original chrome bumpers with overriders, side spears, continental kit, fender skirts and 36 spoke wire wheels with knock offs | about 4k tris |

In game (`src/chars.js`, `src/vehicles.js`): clothing (tees, hoodies,
jerseys with numbers, tanks, jackets, suits, police uniform, jeans, slacks,
sneakers) is painted in the character shader over the body using bind pose
coordinates; skin keeps the base texture detail and is tinted per character.
Cars get the grime shader (dirt gradient, drips, sun fade, rust, dents,
scratches), tinted glass, emissive lamps and a 256 px canvas decal atlas.
Low and potato: no extra lights or shadows, opaque glass, potato loads
`people_lod.glb`.
