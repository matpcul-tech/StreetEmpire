# Street Empire roadmap

This is the next-slice list after the combat and street-call slice. It is grounded in the sim that already ships in `src/state.js` and the client in `src/main.js`. None of it is built yet.

## Done in this slice

- Melee tells, dodge timing, and three approach styles live in `engage` (`src/state.js`). Fists, knuckles, bat, pistol, and shotgun stay the only weapons (`WEAPONS`).
- Optional corner calls live in `callsStep`: incursion, ambush, deal. One at a time, a cooldown, and a session cap (`CALLS`). They do not run during a mission, the opening, or a bust.

## Next: rewarding driving

Already in the sim: `driveCar` (speed-sensitive steering, handbrake drift, `slip` and `skid`), carjack heat, crash damage, traffic in `trafficStep`, the Chop Job mission, squad members boarding the car you drive, and police cruisers in `policeStep`. The phone already has GAS, BRAKE, and DRIFT.

Built: courier runs for bikes (`courierStep`, `courierRun`, `COURIER`). A block you hold has a package at the curb; ride it to a marker for pay by distance plus a speed bonus that dents eat. A built-up block's packages pay 1.5 times as much, and every fifth run in a row pays a streak bonus. Cars keep the taxi fares.

Still open: the slice to build: a short drive that pays off on the block you already hold. One hustle hop or a marked loop that uses the existing chop-shop drop pattern (`missionCheck` / `m.target`), with crash damage you can read and a payout into the block stash. Do not add cars. Do not replace `driveCar`.

## Next: helpful crew

Already in the sim: recruits at `RECRUIT_COST`, a squad of `SQUAD_MAX` in formation, `guardsOf` on a held block, the bat upgrade (`armGuard`), followers who only swing at foes next to you, and rival raids with `RAID_GATHER`.

Street calls do not pull those guards in on purpose. The slice to build: when you step into a call, one nearby guard or the squad can move to you and take a striker slot under the same `CALLS.strikeCap`, then walk back to the post. Formation and the "recruits never hit you" rule stay.

## Next: worthwhile progression

Already in the sim: `stashRate` (more guards, more income), rep on a capture and on a knockout, five missions in `MISSIONS`, guard upgrades, and a win when rival blocks are gone and you hold enough turf.

Built (first step): the `build` action. Standing on your block, $200 (`BUILD_COST`) builds up its hustle once and doubles what it earns (`BUILD_BOOST` in `stashRate`). Rivals pick built-up blocks first in `aiThink`, the raid warning names them, and a block that falls loses the work. BUILD shows on the context button after the guards are armed; B on a keyboard.

Still open: the slice to build: one reason to keep a single block after the missions. Spend rep or stash on that block's hustle (the names already exist) so the rate climbs once, and so a raid warning (`aiThink`) threatens something you improved. No skill tree and no second currency.
