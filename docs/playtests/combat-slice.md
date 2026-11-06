# Combat and street-call slice

Headless and scripted checks for the first playable slice: melee tells, dodge timing, and optional corner calls. Driving, crew help, and progression were not changed.

## Gates

| Gate | Result |
| --- | --- |
| `npx vite build` | passed |
| `node tools/combat-test.mjs` | `COMBAT TESTS PASSED` |
| `node tools/bust-test.mjs` | `BUST TEST PASSED` |
| `npm run test:missions` (seed 7) | `ALL MISSIONS PASSED` at 225s. Rival crowd max was 2 within 6 m. |
| `node tools/smoke.mjs` on the preview build | `errors: []` on desktop and phone. Bag Back arrow shown at 18 m. |
| `node tools/playtest.mjs` | every step `ok: true` on desktop and phone, page errors empty |
| `node tools/slice-play.mjs` at 390x844, 360x740, and 844x390 | all three `OK` |

Playtest combat: desktop target health 60 to 44, phone 60 to 18. Driving reached 18.6 and 18.4. Recruits did not press the player. Take-block flipped. Bag Back arrow shown. Max rivals within 6 m was 2 on both layouts.

Slice play, potato quality, touch layout: the incursion offer stayed at least 14 m out and did not swing. STEP IN and WALK OFF sat inside the screen and clear of HIT and DODGE. Stepping in started the fight. Two HIT taps dropped a posted fighter from 80 to 38 (cross, then jab).

## Not verified

Software rendering on this machine reported phone frame times in the hundreds of milliseconds (`frameMs` about 573 in smoke, with 194 draw calls against 669 on desktop). That is the headless GPU, not a handset. A physical phone was not available, so potato smoothness on a real device was not measured. Desktop smoke's short drift sample read speed 0.2; the scripted playtest still reached driving speed 18.6, and the phone smoke drift read 21.2.
