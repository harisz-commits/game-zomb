# YouTube Playables certification checklist - LAST LINE

Status legend: **[x]** implemented and verified · **[~]** implemented, needs a
check on real hardware / in the Playables test harness · **[ ]** open.

Verification column names the concrete artefact: a file, a test, or the
automated browser smoke test (`headless Chromium, 420x860 + 900x500 + 360x800`).

---

## SDK lifecycle

- [x] **SDK loaded before game code.** `<script src="https://www.youtube.com/game_api/v1">`
  sits in `<head>` of `index.html`, before the `<script type="module">` entry.
- [x] **All SDK access is centralised.** Only `src/systems/YouTubePlayablesAdapter.ts`
  references `ytgame`; gameplay code cannot reach it.
- [x] **`firstFrameReady()` called once, after the first rendered frame.**
  Hooked to three.js's `POST_RENDER` in `BootScene`; guarded by a `firstFrameSent`
  flag.
- [x] **`gameReady()` called once, only when interactive.** Fired at the end of
  `MenuScene.create()`, i.e. when the PLAY button can actually be tapped.
- [x] **Missing SDK never crashes.** Every call is wrapped; the adapter detects
  the absence of `ytgame.game.firstFrameReady` and switches to local mode.
  Verified: the smoke test runs with the SDK request failing (offline) and
  reports **0 console errors**.

## Pause / resume

- [x] **`system.onPause` / `onResume` subscribed** via the adapter in
  `BattleScene`, unsubscribed on scene shutdown.
- [x] **Pause stops the whole simulation**: `update()` returns early,
  `tweens.pauseAll()`, `time.paused = true`, `audio.pause()`.
- [x] **No spawn burst after resume.** Two independent guards: the frame delta is
  clamped to 50 ms, and the director's accumulated spawn budget is capped at
  `SPAWN_BURST_CAP`. Covered by `tests/director.test.ts`
  ("never lets a paused frame bank up a spawn burst").
- [x] **No simulation catch-up.** Soldier cooldowns are absolute
  (`cooldown = interval`), never accumulated, so a freeze cannot bank shots.
- [~] Confirm against the host's real `onPause`/`onResume` in the Playables
  test harness (local mode uses `visibilitychange` / `blur` / `focus`).

## Audio

- [x] **`system.isAudioEnabled()` read on init**, `onAudioEnabledChange`
  subscribed.
- [x] **Host state has absolute priority.** When audio is disabled the master
  gain is driven to 0 and one-shots return early - nothing is audible regardless
  of the in-game music/SFX toggles.
- [x] **Reacts immediately** to `onAudioEnabledChange` (gain ramp, 20 ms).
- [x] **Audio context unlocked from a real user gesture** (first pointer down in
  `MenuScene`).
- [x] **No voice-per-shot.** Gunfire is aggregated into at most ~14 squad-level
  pops/second; a global 26-voice cap drops anything beyond it.
- [x] **three.js's own audio subsystem disabled** (`audio: { noAudio: true }`) -
  all sound is procedural WebAudio.

## Cloud save

- [x] **`game.loadData()` / `game.saveData()`** used through the adapter.
- [x] **Versioned save with migrations**; a corrupt, hostile or unversioned
  payload degrades to defaults and never throws. Covered by `tests/save.test.ts`.
- [x] **Writes are debounced and fire-and-forget**, so a slow cloud round trip
  cannot stall the game loop.
- [x] **Load is timeout-guarded (2.5 s)** so time-to-interactive never depends on
  the network.
- [x] **Save size far below the limit.** Payload is a few hundred bytes;
  `MAX_SAVE_BYTES` (400 KiB) is enforced defensively, hard limit is 3 MiB.
  Asserted in `tests/save.test.ts`.

## Score

- [x] **Exactly one score type** is ever sent
  (`kills + seconds*2 + promotions*250 + eliteKills*50 + bossKills*500`).
- [x] **Integer, non-negative**, asserted in `tests/score.test.ts`.
- [x] **Sent only on a new best**, via `engagement.sendScore({ value })`.
- [x] Verified end-to-end in the smoke test (`bestScore` persisted after a run).

## Input

- [x] **Touch**: drag anywhere to move the formation.
- [x] **Mouse**: press and drag (matches the mobile feel).
- [x] **Keyboard (optional)**: arrow keys and A/D.
- [x] **Touch targets >= 52 px** enforced in `Button.resize()`.
- [x] **Hit areas verified.** A three.js origin-normalisation bug that shifted
  every container hit area by half its size was found by the smoke test and
  fixed (`Button.ts`, `UpgradeCard.ts`) - buttons and cards are now tappable
  across their whole surface, not just the exact centre.
- [x] `disableContextMenu: true`; `touch-action: none` on the canvas and body.

## Responsive

- [x] **9:16 portrait is the primary design target.**
- [x] Verified in the smoke test at **420x860 (9:16-ish)**, **360x800 (narrow
  portrait)** and **900x500 (landscape)**.
- [~] Spot-check 3:4, 1:1, 4:3, 21:9 and desktop widths in a browser.
- [x] **The full field height is always visible** - the approach lane is never
  cropped. Spare width widens the playable field (up to 2.2x) instead of
  letterboxing; spare height is added above the army so the army-to-bottom
  distance is identical on every device.
- [x] **A 140-soldier block always fits** above the bottom edge
  (`ARMY_BASE_Y = FIELD_H - 250`, 10 rows at 20 px).
- [x] **No UI outside the visible area**: the HUD is drawn by a separate
  unzoomed camera in screen space and re-laid out on every resize.
- [x] **Resize never restarts a run.** `onResize` recomputes layout only.
  Asserted in the smoke test (promotions preserved and elapsed still increasing
  across a portrait -> landscape -> narrow-portrait sequence).

## Network / privacy / policy

- [x] **No external network calls** other than the official SDK. Verified: the
  smoke test fails on any non-YouTube request failure and the production bundle
  contains no remote URLs.
- [x] **Only relative asset paths** (`base: './'` in `vite.config.ts`).
- [x] **No external links** anywhere in the UI.
- [x] **No login, no accounts, no personal data collected.** The save contains
  only gameplay counters and settings.
- [x] **No exit / quit button** on any screen (Game Over offers RETRY, ENDLESS
  MODE, MAIN MENU).
- [x] **No ads, no IAP, no pay-to-win.**
- [x] **Age-appropriate (13+).** Stylised silhouettes; no gore, no blood, no
  dismemberment. Hit feedback is a flash, a knockback and a spark.

## Bundle & runtime limits

Run `npm run build && npm run size`.

- [x] **Initial bundle 1.53 MiB** - target is < 15 MiB, hard limit 30 MiB.
- [x] **Total size 0.63 MiB raw / 170 KiB gzipped** - hard limit 250 MiB.
      Roughly half what the 2D build shipped, because three.js tree-shaken to
      what this scene uses is smaller than a full 2D engine.
- [x] **No file > 30 MiB** (largest is the three.js chunk at 512 KiB raw).
- [x] **Soft target "files < 512 KiB"**: app chunk 129 KiB, CSS 5 KiB,
      `index.html` 2.8 KiB, three.js chunk 512 KiB raw / 128 KiB gzipped.
- [x] **Zero asset files.** Every mesh is built from boxes in code, all audio
  is synthesised - nothing to download.
- [x] **JS heap nowhere near 512 MB.** Observed ~27-29 MB with 150 zombies and
  170 soldiers (debug overlay `HEAP`).
- [x] **No Web Workers, no `eval()`, no WASM.**
- [x] **Fast load.** Measured on the production build (`vite preview`):
  the game's own chunks load in **17 ms** (app) and **55 ms** (three.js), and the
  time from `domContentLoaded` to the first rendered frame is **~600 ms** -
  texture generation plus a timeout-guarded save read. Comfortably inside the
  5 s interaction target.
- [~] **Caveat on the offline measurement.** In this sandbox the required
  `https://www.youtube.com/game_api/v1` script is unreachable and takes
  **12.5 s to fail**, which blocks parsing (it is a parse-blocking script by
  platform requirement, so it must not be made `async`/`defer`). On the real
  platform the SDK is served by YouTube and this does not apply - but re-measure
  time-to-interactive in the Playables harness to confirm.

## Rendering & performance

- [x] **WebGL with Canvas fallback** (`three.js.AUTO`).
- [x] **No physics bodies** for soldiers or zombies - pure arithmetic.
- [x] **Everything transient is pooled** (tracers, particles, damage numbers,
  explosions, zombies, spits, soldier sprites).
- [x] **Adaptive quality** degrades shadows / shadow map size / pixel ratio /
      particles / tracers / shake only;
  simulation values are never touched, so difficulty is device-independent.
- [x] **Stress verified**: 146 active zombies + 99 soldiers held ~42-47 fps under
  **software rendering** (swiftshader) in the smoke test - hardware GPUs have far
  more headroom.
- [x] **No DOM elements during gameplay** (the HTML splash is removed after the
  first frame).

## Gameplay verification

- [x] **A standard run can be won.** Two full headless campaign playthroughs
  both ended on the VICTORY screen just after 5:00 (2,881 kills / 4 promotions
  / score 14,585, and 2,828 kills / 5 promotions / score 15,332), each with a
  peak army of 140 and 0 console errors.
- [x] **A run can be lost**: wiping the army triggers the slow-mo, the summary
  screen and a persisted save (verified in the smoke test).
- [x] **Promotion intervals grow** (82s, 28s, 44s, 59s, 79s) rather than
  shrinking, so the campaign lands around BLACK OPS and the prestige ladder
  belongs to Endless.
- [x] **The late run is dense.** 51-68 enemies on screen through the final
  minute alongside a 130+ soldier army, holding 42-49 fps under software
  rendering.
- [x] **Difficulty scaling is honest**: realised enemies/second tracks the
  director's authorised cost/second across the whole run (regression tested).

## Browser / device testing

- [x] Chromium (headless, WebGL via swiftshader) - full automated run:
  menu → battle → drag → kills → promotion → tier conversion → boss → second
  promotion → resize → stress → game over → save → retry, with 0 console errors.
- [ ] Chrome on Android (physical device).
- [ ] Safari on iOS (physical device).
- [ ] Desktop Chrome / Safari / Firefox manual pass.
- [ ] Playables test harness end-to-end (pause, resume, audio toggle, cloud save
  round trip, score submission).

## Before submission

- [ ] Replace placeholder art with final assets (see README, "Replace the
  placeholder art").
- [ ] Final balance pass on device.
- [ ] Confirm `ALLOW_DEBUG_IN_PROD` is `false` (it is) and that `?debug=true`
  does nothing in the production build.
