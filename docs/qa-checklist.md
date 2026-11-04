# Release QA checklist

Every release runs this process before it is called ready. Nothing ships on a
red gate. Record the results in `docs/playtests/vX.Y.md`.

## 1. Automated gates

| Gate | Command | Pass rule |
| --- | --- | --- |
| Build | `npx vite build` | no errors |
| Mission tests | `npm run test:missions <seed>` for seeds 1, 2, 7, 42 | `ALL MISSIONS PASSED` on every seed |
| Smoke test (live) | `SHOTDIR=... SHOTPREFIX=... node tools/smoke.mjs <url>` | `errors: []` on desktop and phone, mission arrow shown |
| Visual QA (live) | `node tools/visual-qa.mjs <url> <dir>` | prints `VISUAL QA PASS` (exit code 0) |
| No dashes | `rg -n "\u2014\|\u2013" src docs README.md tools index.html` | no matches |

Visual QA captures day, dusk and night shots (on foot, character close up,
driving, mission) on desktop and phone. It fails the release when a night shot
has mean luma under 38 (30 for the staged character close up) or 10th percentile luma under 6, or when any character
near the player has mean luma under 40 or contrast (luma standard deviation)
under 14 inside its screen box, which means it reads as a silhouette. Results go
to `report.json` in the output folder.

## 2. Structured playthrough (desktop and phone layout)

Run `node tools/playtest.mjs <url> <dir> > <dir>/notes.json` on the live build.
It drives real input (keys on desktop, touch on the phone layout) and records a
screenshot and a measured note per step:

1. Movement: the stick or WASD moves the player.
2. Combat: hits land and drain a rival's health.
3. Driving: enter a car and reach speed.
4. Recruits: hire two, they follow in formation and never press into you.
5. Taking a block: clear the Locals, stand in the ring, the block flips.
6. Package Run: the mission starts and the objective arrow shows.
7. Rival crews: at most 3 rivals close on you at once.

Then look at every screenshot yourself.

## 3. Visual review (by eye)

- Day and night character visibility, close ups, street readability.
- Driving at night: road ahead and shoulders visible.
- Cars: wear, livery, glass, lights.
- Character proportions: slim, near real figure, women not lanky, driver seated at the right height.

## 4. Regression checklist

Mark each item PASS or FAIL in the playtest report, with the evidence.

- [ ] Night readability: no silhouettes, streets visible, lamps and neon light the ground (visual QA plus eye check).
- [ ] Package findable: Package Run arrow shown, package drop marked (playtest step 6, smoke test).
- [ ] Recruits do not chase or hit the player (mission test "recruits never hit you", playtest step 4).
- [ ] Rival crowds stay small: max 3 rivals within 6 m (mission test, playtest step 7).
- [ ] All 4 missions pass on every seed.
- [ ] Character proportions look right (close up review).
- [ ] Car wear and lights read (car shots day and night).
- [ ] Phones smooth: phone frameMs from the smoke test not worse than the last release by more than 20 percent.
- [ ] No em dashes or en dashes anywhere.

## 5. Report

Write `docs/playtests/vX.Y.md`: notes on feel, readability and atmosphere, a
PASS or FAIL for each checklist item, the gate outputs and the screenshot paths.
