# Release QA checklist (v0.10.1 and later)

Builds on docs/qa-checklist.md and the notes in docs/playtests/ (v0.8 to v0.10).
Record results per item as PASS or FAIL with evidence in docs/playtests/vX.Y.md.
Screenshots go to docs/playtests/shots/vX.Y-qa/.

Caveat: every headless run uses SwiftShader software rendering in Chromium with
touch emulation. It is not a real phone. Frame times, safe areas, notches, real
finger sizes and browser chrome are not reproduced. At least one run on a real
phone (portrait and landscape) is required before a release is called ready.

## 0. Setup

- URL: live build plus `?q=potato` on every headless run (the box has no GPU).
- Harness: Playwright with `--use-angle=swiftshader --enable-unsafe-swiftshader`, as in tools/v010-shots.mjs.
- Hooks: `window.__game` (state, send), `window.__cine` (active, skip), `window.__dbg`, `window.__perf()`, `window.__camOv`.
- Time of day: set `window.__game.state.t` (DAY_SECONDS is 480; clock = 17.8 + t*24/480). Day t=424, dusk t=6, night t=95 (same as tools/visual-qa.mjs). Hold it with a setInterval while shooting.
- Viewport matrix (every item below runs on all rows unless it says otherwise):

| Name | Viewport | Touch |
| --- | --- | --- |
| phone-portrait | 390x844, deviceScaleFactor 3 | hasTouch, isMobile |
| phone-landscape | 844x390, deviceScaleFactor 3 | hasTouch, isMobile |
| small-portrait | 360x740 | hasTouch, isMobile |
| desktop | 1280x800 | no |

- Times: day, dusk, night for every visual item.
- Console: collect `pageerror` and `console` type `error` for every run. Pass rule for the whole release: zero page errors, zero console errors other than known asset 404s listed in the report.

## 1. Automated gates (unchanged)

| Gate | Command | Pass rule |
| --- | --- | --- |
| Build | `npx vite build` | no errors |
| Missions | `npm run test:missions <seed>` for 1, 2, 7, 42 | `ALL MISSIONS PASSED` on each seed |
| Smoke | `node tools/smoke.mjs <url>?q=potato` | `errors: []` desktop and phone |
| Visual QA | `node tools/visual-qa.mjs <url> <dir>` | `VISUAL QA PASS` |
| v0.10 checks | `node tools/v010-shots.mjs <url> <dir>` | `V010 PASS` |
| Cutscenes | `node tools/cine-shots.mjs` | every moment captured, no stuck letterbox |
| No dashes | `rg -n "\u2014\|\u2013" src docs README.md tools index.html` | no matches |

## 2. Text placement (Matthew's real phone complaint: text all in the middle)

Background: on v0.10, `#big` sits at top 32 percent and `#capture` at top 24
percent, both full width centered, so on a portrait phone they land over the
player and road. `#mission` (bottom 150px), `#msg` (bottom 118px) and `#prompt`
(bottom 120px) are centered horizontally and can stack over the HIT and stick
area on short screens. These are the first things to verify on v0.10.1.

### 2.1 Geometry check (headless, run on every viewport and every trigger)

Trigger each text source, then in `page.evaluate` collect the bounding rect of
every visible text element: `#big`, `#capture`, `#mission`, `#msg`, `#prompt`,
`#pops .pop`, `#onb`, `#objArrow`, `#cine` subtitle box, `#passCard`, `#end`.
Ignore elements with display none, opacity 0 or empty text.

Protected zones:
- Player zone: project the player position (and head, y+1.8) with `__dbg.camera`; box of 18 percent of viewport width by 22 percent of height around it.
- Road zone: the central band, x 30 to 70 percent, y 35 to 70 percent (where the road and player sit with the chase camera). On foot and driving.
- Touch controls: rects of `#stick`, `#btns button` that are visible, `#steer`, `#bPause`.
- Minimap: rect of `#radar`.
- Screen center: 20 percent by 20 percent box at the middle of the viewport.

Pass: no text rect intersects any protected zone by more than 4 px, and no text
rect intersects another text rect (no stacking). Toasts may sit in the top band
(top 20 percent) or a side column. Fail: any overlap; record element id,
viewport, time of day and screenshot.

Triggers to cover (each a separate screenshot):
- [ ] Toast `#msg`: press E (or tap context) far from anything ("Nothing to use here...").
- [ ] Cash pop `#pops`: wait for a hustle payout (+$15 ...). Several pops at once must not run into the minimap or buttons.
- [ ] Mission text `#mission` with timer: start each of the 4 missions.
- [ ] Prompt `#prompt`: stand 1.8 m from Unc and next to a parked car. On touch the prompt must be hidden or sit away from `#bCtx` (v0.10 phone already reports shown false; confirm).
- [ ] Big banner `#big`: mission title flash, BLOCK CLAIMED, WASTED, BUSTED.
- [ ] Capture text `#capture`: stand in a ring while a block flips.
- [ ] Onboarding `#onb`: all 3 steps; must not cover `#radar` (both top aligned) or `#bPause`.
- [ ] Objective arrow label `#objDist`: LOCAL, UNC, RING.
- [ ] Cutscene captions: every Unc briefing line (4 missions), mission passed card. Captions sit in the letterbox bar, not mid screen, and do not cover the speaker's face.
- [ ] Driving: all of the above that can fire while driving (msg, pops, mission timer) do not cover the road ahead.

### 2.2 Eye check

- [ ] Look at every 2.1 screenshot at real size. Text readable at day, dusk and night (contrast against sky and lamps), no clipping at screen edges or behind the notch area (safe-area insets).
- [ ] Landscape phone: the shorter height still leaves the player and road clear with controls on both sides.

## 3. Crew behavior (new)

All via `window.__game.state` in the browser plus the state level test.
Followers: `role === 'follower'`. Guards: `role === 'defender'`, `crew === 'player'`, `guard` set, `target === block.id`.

- [ ] Guards stay on claimed blocks. Take a block (mission 4 or free roam), wait 10 s, then walk 60 m away and wait 30 s. Pass: 2 to 3 guards, every guard within 30 m of the block center on both axes at both samples, spread above 4 m. Headless: mission test "taken block garrisoned" plus a browser sample of guard positions. Screenshot of the block from above with `__camOv`.
- [ ] Guards defend. Spawn 2 rivals at the block (as missions-test). Pass: block still owned by player after 20 s, rivals damaged.
- [ ] Guards are not pulled away by the player. Pass: after the player leaves, `followers().length` stays 0 unless the player calls one with the squad action; send returns it (count back to 0).
- [ ] Squad enters cars. Recruit 2, enter a car (walk up and E or tap CAR). Pass: within 2 s both followers have `car === player.car` and are rendered seated (screenshot, no follower left standing or running behind). Repeat with a jacked car and a muscle car.
- [ ] Squad rides along. Drive 200 m with 2 followers inside. Pass: followers stay in the car the whole way, no teleporting through walls, hp unchanged.
- [ ] Squad exits with the player. Pass: within 1 s of exit both followers are out and within 8 m.
- [ ] Squad keeps pace on a run. Sprint (RUN held on touch, Shift on desktop) for 8 s in a straight line, then stop. Pass: every live follower within 10 m 2 s after stopping, and never more than 14 m behind during the run (sample every 0.5 s).
- [ ] Squad never hits the player and never blocks the player: 0 follower hits, the player is never stuck for more than 0.5 s by a follower body.
- [ ] Recruit cost and limits: +CREW $100 deducts cash; third recruit goes to guard a held block.

## 4. Core systems (each on all viewports, day dusk night, potato)

| System | Steps (headless) | Pass rule |
| --- | --- | --- |
| Movement | Stick drag (touch) or WASD for 3 s | player moves over 10 m, camera follows, no jitter in 3 consecutive shots |
| Combat | Teleport a rival in front, HIT or F x10 | rival hp drops to 0, hit fx shown, player hp bar updates |
| Block and dodge | Tap BLOCK and DODGE during an attack | damage reduced while blocking, dodge moves the player |
| Weapons | Cycle FISTS and pick up a bat | label updates, `#weapon` correct |
| Driving | Enter a car, GAS 4 s, steer, BRAKE, DRIFT | speed over 10, steering turns, brake stops, camera behind car |
| Car entry | Walk to empty car, E or CAR | cine 1.15 s, player seated, controls switch to drive set |
| Car jack | Walk to an occupied car, E | driver pulled to curb, total about 1.55 s, heat may rise |
| Car exit | E or CAR while stopped | 0.95 s, foot controls return |
| Package Run | Talk to Unc, follow arrow, pick up, return | passed card, +$250, Respect +20 |
| Send a Message | Knock out 3 Red Kings | mission passes |
| Chop Job | Steal a muscle car, drive to marker | mission passes, squad rides along |
| Take Over | Clear Locals, hold the ring | block flips, claim swing plays, guards spawn |
| Territory | Turf counter | `#turf` increments, minimap block recolors |
| Wanted | Hit a ped near a cop, or set `p.heat` 10, 30, 50 | stars match `stars(p)`, steady 0.5 s, cops chase, heat decays when calm, busted beat at capture |
| Wasted | Set `p.hp = 0` | red tint, 2.75 s real time, respawn with full hp |
| Cutscenes | All 4 briefings, claim, passed, wasted, busted, car moves | letterbox on and off, HUD restored, tap skips in under 0.3 s, sim advance under 0.1 s during briefings |
| Pause | Esc or P or II | sim advance 0, quality buttons work |
| Onboarding | Fresh start | Local scuffle within 8 s and 16 m, 3 steps advance |
| Minimap | Every run | visible, not covered, target pulses |
| Performance | `window.__perf()` on phone | frameMs not worse than last release by over 20 percent (headless only, relative) |

## 5. Night and dusk extras

- [ ] Streetlights on at dusk, not only at night (known weak spot in v0.10).
- [ ] Text readable on bright neon at night.
- [ ] Visual QA luma limits hold on potato quality as well as low and high.

## 6. Real phone (manual, required)

Portrait and landscape on at least one iPhone and one Android: confirm section 2
by eye, thumb reach of HIT and stick, no browser gesture conflicts (pull to
refresh, back swipe), audio starts after first tap, 10 minutes without a crash.
