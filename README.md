# LAST LINE

A casual **army-growth horde-survival** game built for **YouTube Playables**.

You hold a bridge. Your squad stays at the bottom while the world scrolls
toward you, and the bridge is split into **two lanes**:

- **Left - the supply lane.** Frozen crates drift down with their HP printed on
  them. Shoot one open before it slides past and you take what is inside:
  soldiers, damage, fire rate.
- **Right - the combat lane.** The horde, plus red penalty barriers that cost
  you soldiers if they reach the line.

Your soldiers fire **straight ahead**, so they can only be pointed at one lane
at a time. That is the whole game: *break the crate, or hold the horde?* Spend
too long farming supply and the horde is on top of you; never leave the horde
and every crate drifts past unopened.

On top of that sits the growth loop: every kill feeds a reinforcement meter, and
when the army reaches **140 soldiers** the battle freezes, you draft **one of
three upgrade cards**, and the whole army is **promoted** to the next tier -
140 SOLDIERS become ~70 VETERANS with double the power each. Repeat forever.

> **Working title.** The name lives in `src/config/GameConfig.ts` (`GAME_TITLE`)
> and is used by every screen and the document title. Change it in one place.

---

## Quick start

```bash
npm install      # install dependencies
npm run dev      # http://localhost:5173
npm run test     # unit tests (vitest)
npm run typecheck# tsc --noEmit
npm run build    # typecheck + production build into dist/
npm run preview  # serve the production build
npm run size     # bundle size report against the Playables budget
```

Useful URL flags (development builds only):

| Flag | Effect |
| --- | --- |
| `?debug=true` | FPS/entity/DPS overlay plus debug hotkeys |
| `?seed=12345` | Deterministic run (seeded RNG) for balancing and repro |

Debug hotkeys: `P` force promotion, `B` spawn boss, `Z` +20 zombies,
`R` +10 soldiers, `K` kill all zombies, `G` wipe the army (game-over path).

---

## Tech stack

three.js · TypeScript · Vite · npm. One WebGL renderer, one
`requestAnimationFrame` loop, and DOM for everything that is text - there is no
engine underneath. No React wrapper, no server, no backend, no database, no
external APIs, and **no CDN dependencies in the production bundle** other than
the official YouTube Playables SDK, which the platform requires.

All geometry is built at runtime out of boxes and all audio is synthesised with
the Web Audio API, so the bundle ships **zero asset files**.

---

## Architecture

```
src/
  main.ts                     Bootstrap + global error reporting
  game/                       App shell (canvas, loop, screens) and BattleRun
  render3d/                   Stage, models, instanced actors, bridge, view
  config/
    GameConfig.ts             Technical/presentation config, entity limits, palette
    BalanceConfig.ts          EVERY gameplay number (no magic numbers elsewhere)
  core/
    EventBus.ts               Typed pub/sub - systems never call each other directly
    BattleContext.ts          Dependency container + per-run RuntimeState
    Viewport.ts               Virtual field -> any screen size, plus the
                              perspective projection every system draws through
    Services.ts               Process-wide SaveSystem instance, run seeds
  scenes/
    BootScene.ts              Texture generation, SDK init, save load
    MenuScene.ts              Title, mode select, gameReady()
    BattleScene.ts            Orchestrator only - no game logic
    GameOverScene.ts          Run summary
  systems/
    ArmySystem.ts             Formation, movement, HP, deaths, reinforcements
    LaneObjectSystem.ts       Supply crates + penalty barriers: the lane decision
    CombatSystem.ts           Hitscan resolution, crits, pierce, explosions, specials
    EnemyDirector.ts          Difficulty curve, phases, endless modifiers
    EnemySpawnSystem.ts       Enemy pool, movement, attacks, bosses, targeting index
    SupplyDropSystem.ts       Catchable supply crates
    PromotionSystem.ts        Tier ladder + promotion math
    UpgradeSystem.ts          Draft, rarity, pity, modifier aggregation
    DoctrineSystem.ts         Family counters -> doctrine levels
    ScoreSystem.ts            The single score
    SaveSystem.ts             Versioned save + migrations
    InputSystem.ts            Touch / mouse / keyboard -> one target X
    AudioSystem.ts            Procedural WebAudio, aggregated gunfire
    QualityManager.ts         Adaptive visual quality (never gameplay)
    YouTubePlayablesAdapter.ts  The ONLY file that touches `ytgame`
  entities/                   Soldier, Zombie (plain data + a sprite)
  data/                       soldierTiers, enemyDefinitions, upgradeDefinitions,
                              doctrineDefinitions, waveDefinitions
  render/                     TextureFactory (placeholder art), Background
                              (baked perspective bridge + scrolling detail)
  ui/                         BattleHUD, PromotionModal, UpgradeCard, Button,
                              GameOverPanel, DebugOverlay
  utils/                      SeededRandom, ObjectPool, MathUtils
  types/                      game.ts, youtube-playables.d.ts
tests/                        Vitest unit tests
```

### Design rules the code follows

- **BattleScene is not a god class.** It builds systems, forwards a fixed update
  order, and reacts to a handful of high-level events. Gameplay logic lives in
  `src/systems`, tuning lives in `src/config` and `src/data`.
- **Systems are decoupled through the event bus** (`ENEMY_KILLED`,
  `SOLDIER_DIED`, `PROMOTION_READY`, `DOCTRINE_UNLOCKED`, `BOSS_SPAWNED`, ...).
- **Every system is renderer-free.** They own positions, HP and timers; the
  view reads those once a frame. That is why the move from sprites to 3D
  touched no gameplay code, and why the unit tests run in plain node.
- **Nothing allocates per frame.** Transient entities come from `ObjectPool`.

---

## The YouTube Playables adapter

`src/systems/YouTubePlayablesAdapter.ts` is the single point of contact with the
SDK. No gameplay code may reference `ytgame` directly.

It wraps `game.firstFrameReady`, `game.gameReady`, `game.loadData`,
`game.saveData`, `engagement.sendScore`, `system.isAudioEnabled`,
`system.onAudioEnabledChange`, `system.onPause`, `system.onResume`,
`system.getLanguage`, `health.logError` and `health.logWarning`.

Outside a Playables host (local dev, unit tests, plain web hosting) it degrades
gracefully and nothing crashes:

| Capability | Local fallback |
| --- | --- |
| Cloud save | `localStorage` under `lastline.save.v1` |
| Score | logged to the console in dev |
| Pause / resume | page `visibilitychange` + `blur`/`focus` |
| Audio state | treated as enabled |
| Language | `navigator.language` |
| Health logging | `console.error` / `console.warn` |

Lifecycle: `firstFrameReady()` fires once the first frame is scheduled;
`gameReady()` fires when `MenuScene` is up and interactive.

---

## Promotion system

`PromotionSystem` owns the tier ladder and preserves total combat power:

```
effectivePower = soldierCount * oldTierPower
newSoldierCount = ceil(effectivePower / newTierPower)
```

`ceil` guarantees a surplus is never lost: **145 SOLDIERS -> 73 VETERANS**.

| Tier | Power |
| --- | --- |
| SOLDIER | 1 |
| VETERAN | 2 |
| ELITE | 4 |
| COMMANDO | 8 |
| SPECIAL FORCES | 16 |
| BLACK OPS | 32 |
| BLACK OPS ★1, ★2, ... | 64, 128, ... (generated on demand) |

A soldier's damage and HP are `BASE_* × tierPower`, which is what makes "one
veteran ≈ two rookies" literally true - the promotion halves the head count and
doubles per-unit power, so army DPS is unchanged and the drafted card is the
actual gain (plus a smaller, harder-to-hit formation).

Promotion flow (about a second, excluding the player's decision): slow-mo →
dim → `PROMOTION` title → three cards slide in → tap → picked card grows →
white flash → tier textures swap → formation visibly compresses → tier banner →
fight resumes.

---

## Upgrade system

Cards are pure data (`src/data/upgradeDefinitions.ts`). `UpgradeSystem` folds
owned cards and unlocked doctrines into one `ModifierState` that every combat
system reads - no upgrade is hard-wired into a scene.

`generateChoices(promotionIndex)` guarantees distinct cards and honours max
level, `prerequisites` (AND), `prerequisitesAny` (OR), `incompatibleWith`,
rarity weights per promotion band, and the pity system (**every 5th** promotion
offers at least one Epic, **every 10th** at least one Legendary). It draws from
a seeded RNG so runs are reproducible.

Six families - FIREPOWER, BALLISTICS, PRECISION, EXPLOSIVES, COMMAND, DEFENSE.
Collect **3 cards of one family** and its doctrine unlocks automatically;
**6 cards** upgrade it to level 2. No extra choice, just a banner.

Effects are modular (`damageMultiplier`, `critChanceAdd`, `pierceAdd`,
`explosionChanceAdd`, `executeThreshold`, ...). Anything that needs bespoke
behaviour declares a `specials: [...]` id which `CombatSystem` dispatches.

---

## Balancing

Everything is in `src/config/BalanceConfig.ts`: promotion threshold, starting
soldiers, base damage / fire rate / HP, reinforcement costs, zombie HP and speed
scaling, spawn rates, difficulty scaling, boss intervals, run duration, rarity
tables, and every special-effect constant.

`src/config/GameConfig.ts` holds the technical knobs: field size, entity limits,
quality presets and the palette.

Enemy roster and spawn costs: `src/data/enemyDefinitions.ts`.
Campaign timeline and endless modifiers: `src/data/waveDefinitions.ts`.

---

## How to extend

### Weapon ladder

`src/data/weaponTiers.ts` holds six weapons, from RIFLE to MINIGUN. A weapon
crate advances the ladder, and the point of it is that the upgrade is
**visible**: the gun in every soldier's hands is a different silhouette, the
crate that grants it shows the gun you are about to get as a neon glyph, the
tracers get fatter and hotter, and the HUD carries the weapon's name. The power
lives on the tier itself (damage and rate of fire multipliers folded into
`ModifierState`), so the two ladders - more soldiers, better guns - are
independent and both matter.

Soldier sprites are the cross product of soldier tier and weapon tier, so they
are generated lazily by `ensureSoldierTexture`: a run only ever shows a handful
of the combinations.

### Difficulty scaling

Two terms decide how hard the horde is, and the second one matters more:

```
hp     = (1 + t / 55) ^ 1.34  *  tierPower ^ 0.86
damage =                         tierPower ^ 0.86
```

A soldier's damage *and* HP are proportional to tier power, so without the
`tierPower` terms the horde stopped mattering the moment the promotion ladder
got going - an army that had promoted eight times hit 256x harder than the
enemies it was shooting, and a zombie that reached the line could no longer
kill anyone. The run played itself. The exponent is deliberately below 1, so a
promotion is still a real gain (`tierPower ^ 0.14` net, plus the army regrowing
to the threshold afterwards) - it just is not a free win.

Verified with scripted playthroughs: a run where the player never moves the
formation dies at ~26s, and a played run finishes the 5-minute campaign at
roughly 90-130 of 140 soldiers with the horde at its entity cap.

### Why it is 3D

The mobile ads this is chasing render as real 3D and still ship as playable
ads, and the reason is not that they have a bigger asset budget - it is that
they are **low-poly 3D with flat shading and one shadowed light**, built from
geometry simple enough to generate in code. A sprite renderer cannot produce
that look however carefully the sprites are drawn, because what sells it is
lighting on real geometry.

Moving to it made the game *smaller*:

| | before (Phaser 2D) | after (three.js 3D) |
|---|---|---|
| bundle, gzipped | 381 KB | **170 KB** |
| draw calls, full battlefield | ~300 sprites | **~50** |
| triangles | n/a | **~150k** |
| art asset bytes | 0 | **0** |

Zero asset bytes survives the move: every mesh is still built in code, now out
of boxes instead of pixels (`src/render3d/Models.ts`). A character is a list of
boxes merged into one geometry with the colour baked into the vertices, so
detail is free at runtime - 180 zombies are three draw calls, not 180, however
many boxes each of them is made of.

Characters are drawn by `ActorPool`: three `InstancedMesh`es per type - body,
left leg, right leg - which is the entire animation system. A crowd at this
camera distance needs a stride and a bob, not a skeleton.

The interface is DOM (`src/ui/`, `src/style.css`): sharper than canvas text at
any pixel ratio, no draw calls, and it never fights the scene for depth order.
Crate numbers and damage numbers are DOM too, positioned by projecting their
world point and sized by the projected scale, so they follow the same
perspective as the geometry they belong to.

### Camera

The camera is matched to the reference footage rather than eyeballed. Two
numbers were measured off that footage - the deck fills 0.875 of the width at
the firing line, and the firing line sits 0.73 of the way down the screen - and
two camera parameters control them: how far back it sits and how far up the
bridge it looks.

`Stage.fitCamera` solves for those two numerically on every resize rather than
deriving a closed form per aspect ratio, which means the framing is *checked*
on whatever device it lands on instead of assumed. Read back off the live
camera on a 420x860 viewport:

| | reference | game |
|---|---|---|
| deck width at the firing line | 0.875 of the screen | 0.874 |
| firing line, down the screen | 0.730 | 0.730 |
| soldier body height | 0.13 of the screen | 0.13 |
| central barrier, across the deck | 0.39 | 0.40 |

### Replace the models

Every model is a list of boxes in `src/render3d/Models.ts`, merged into one
geometry with `mergeBoxes`. To ship modelled artwork instead, load a glTF and
return its geometry from the same functions - `ActorPool` only wants a body
geometry and a leg geometry, and nothing else in the game knows or cares where
they came from.

### Add a new zombie

1. Add the kind to `EnemyKind` in `src/types/game.ts`.
2. Add an entry to `ENEMY_DEFINITIONS` and a spawn cost to `ENEMY_SPAWN_COST`
   in `src/data/enemyDefinitions.ts`.
3. Give it a look in `BattleView`'s `ZOMBIE_LOOKS` (or its own model in
   `Models.ts` if the body plan differs).
4. Give it spawn weight in one or more phases in `src/data/waveDefinitions.ts`.

No system code changes - movement, targeting, damage and death are generic.

### Add a new upgrade card

Append an `UpgradeDefinition` to `src/data/upgradeDefinitions.ts`. If the effect
is expressible with the existing `UpgradeEffects` fields you are done. For
bespoke behaviour, add an id to `SpecialId` in `src/types/game.ts`, put its
constants in `BalanceConfig`, and handle it in `CombatSystem` (timed effects in
`updateTimers`, on-hit effects in `hitEnemy`, on-kill effects in
`onEnemyKilled`).

### Add a new doctrine

Doctrines are keyed by family in `src/data/doctrineDefinitions.ts` - edit
`level1` / `level2` effects there. Adding a whole new *family* means extending
`UpgradeFamily` and `UPGRADE_FAMILIES` in `src/types/game.ts`, adding a colour
and icon in `GameConfig.ts`, and adding the doctrine entry.

---

## Modes

**Campaign** - a ~5 minute run: walkers, then runners, a horde, an elite
encounter at 1:30, a mini boss at 2:30, escalating pressure, and THE ABOMINATION
at 4:55. Kill it to win.

Verified end to end in headless browser playthroughs: promotions land at
roughly **1:22 / 1:50 / 2:34 / 3:33 / 4:52** (SOLDIER -> VETERAN -> ELITE ->
COMMANDO -> SPECIAL FORCES -> BLACK OPS), the final boss dies just after 5:00,
and the run ends in VICTORY with ~2,850 kills and a peak army of 140 for a
score around 15,000.

The intervals deliberately *grow* (82s, 28s, 44s, 59s, 79s): the first
promotion is slow because the squad is tiny, and after that each tier costs
more than the last. A standard run therefore lands around BLACK OPS, and the
prestige ladder (BLACK OPS *1, *2, ...) belongs to Endless.

**Endless** - unlocked after your first run. No end. Every 30-60s a stacking
modifier is rolled (+15% zombie HP, +10% speed, +20% spawn rate, more elites,
more armored, more runners), a boss returns every ~2:15, and promotions continue
into prestige tiers.

## Score

One score type only - the same value is reported to
`ytgame.engagement.sendScore` when it beats the stored best:

```
score = kills
      + floor(elapsedSeconds) * 2
      + promotions            * 250
      + eliteKills            * 50
      + bossKills             * 500
```

---

## Performance

- Soldiers have **no physics bodies**. Positions are formation slots eased with
  a frame-rate-independent damp.
- Characters are **instanced**: one `InstancedMesh` per body part per type, so
  a 180-strong horde is three draw calls. `InstancedMesh.count` tracks the live
  number, not the capacity - leaving it at capacity and hiding spare slots with
  a zero-scale matrix still submits their triangles, and that mistake alone
  cost half a million triangles a frame.
- Combat is **hitscan**; only a fraction of shots draw a tracer.
- Enemies are pooled and indexed into per-frame **column buckets**, so a soldier
  finds a target without scanning the whole horde.
- Entity caps (`ENTITY_LIMITS`): 140 visible soldiers, ~150 zombies, 80 tracers,
  25 damage numbers, 150 particles.
- `QualityManager` watches smoothed FPS and steps HIGH → MEDIUM → LOW, reducing
  particles, tracer frequency, ground lighting, secondary animation and screen
  shake.
  **It never changes simulation values**, so difficulty is device-independent.
- Gunfire is aggregated into at most ~14 squad-level pops per second instead of
  one audio voice per shot.
- The background is one baked quad plus a few dozen small scrolling quads; unit
  shadows are part of the unit sprites. Measured in a software-rasterised
  browser at 150 zombies: 17.3 fps before the perspective rebuild, 24.4 after.

## Tests

```bash
npm run test
```

73 unit tests covering promotion math (including the 140→70 and 145→73 cases and
power preservation across the whole ladder), upgrade drafting (no duplicates,
max level, prerequisites, incompatibilities, rarity bands, pity), modifier
aggregation and doctrine unlocks, save migration from v0/corrupt payloads, score
computation, seeded RNG reproducibility, formation row distribution, and the
enemy director's scaling and caps.

## How the balance was derived

The tuning numbers are not guesses - they came from instrumented headless runs:

1. **A full campaign playthrough** in a real browser, sampling army size, tier,
   kills, on-screen enemies and FPS every ~10s and reporting every promotion.
2. **An isolated replay** of the spawn loop driven by the real `EnemyDirector`
   (it is renderer-free, so it runs as a plain test), printing authorised cost
   per second against enemies actually spawned per second.

That second harness is what exposed the spawn-budget bug: enemies/second jumped
from 2.5 to 21.8 at one phase boundary while the director was authorising ~4
cost units/second. The invariant it checks is now a permanent regression test
(`tests/director.test.ts`).

Two couplings are worth knowing before re-tuning:

- **Reinforcement cost vs. enemy supply.** Army growth is supply-limited, so
  `REINFORCEMENT_THRESHOLD_BASE` is effectively "kills per extra soldier". If
  you change spawn rates, change this in the same proportion or promotion
  pacing moves with it.
- **`REINFORCEMENT_TIER_EXPONENT` must stay above 1.** Army DPS scales linearly
  with tier power, so at exactly 1 the promotion interval is flat forever, and
  below 1 every tier arrives *faster* than the one before (the original 0.72
  cleared the whole ladder in 104s of a 300s run).
- **`BASE_RANGE` controls how the battlefield reads.** It sets how long enemies
  survive on screen, and therefore horde density, far more than spawn rate
  does.
- **`FIRING_COLUMN_HALF_WIDTH` is deliberately generous.** The decision the game
  is built on is *which lane* the formation points at, not pixel-perfect
  alignment inside a lane. A tight cone left a 10-soldier starting squad unable
  to kill anything at all.
- **Supply-crate HP is priced in seconds of army DPS**
  (`LANE_BLOCK_DPS_SECONDS`), not as a flat number. A flat value stops being a
  decision once the army scales; pricing it in attention keeps "is this crate
  worth the horde closing in?" a live question at every army size.

## Documented design decisions

Where the brief left details open, these calls were made:

- **COMMON cards were authored.** The rarity table makes COMMON the most common
  outcome but the brief only listed RARE+ cards, so 12 small stackable COMMON
  cards were written to fill the bucket.
- **Reinforcement cost scales with tier** (`base × tierPower^0.72`) so a
  promotion does not make the next 140 trivial.
- **Promotion fully heals the line.** It is the run's reward beat.
- **Supply drops must be caught** by standing under them, giving the player a
  reason to move when the horde is not threatening.
- **A promotion restores full HP but the army keeps its drafted build**; nothing
  is lost on promotion except the head count that becomes power.
- **Landscape widens the play field** instead of letterboxing (up to 2.2× the
  portrait width), and spare vertical space is added above the army so the
  distance from the army to the bottom edge is identical on every device.
- **Score is a single value**, per the Playables guidance on one score type.
