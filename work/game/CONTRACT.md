# Castle Defense — module contract

A tower-defense game with three levels (see Levels and worlds). **The castle, terrain, river, bridge, village, trees and lighting of Dawnhold must keep their current look.** Game content must match that look: same warm morning light, same stone materials (`materials.stone/trim/base` from scene.js), grounded, detailed, believable medieval — not toy-like, not neon.

Quality bar: AAA. A harsh visual critic will review screenshots of your work and send it back until it is genuinely impressive.

## Files and ownership

| File | Owner | Purpose |
|---|---|---|
| `work/scene.js` | orchestrator | Environment. Only touch if absolutely required, keep diffs tiny, and say so in your report. |
| `work/game/core.js` | orchestrator | `state`, `bus`, `lanes`, `gatePoint`. Do not change. |
| `work/game/main.js` | orchestrator | Calls `init()` on all modules, then each frame `ui.update(dt, realDt)`, `enemies.update(dt)`, `towers.update(dt)`, `fx.update(dt, realDt)`, `audio.update(dt, realDt)`. `dt` is game time (0 when paused, ×speed). |
| `work/game/enemies.js` | enemies agent | Enemy types, models, animation, movement, health bars, death. |
| `work/game/towers.js` | towers agent | Build pads, tower types, models, upgrades, targeting, projectiles + damage. |
| `work/game/fx.js` | fx agent | Particles, explosions, impacts, floating numbers, screen shake, castle damage visuals. Event-driven only. |
| `work/game/audio.js` | audio agent | All sound, procedural WebAudio (no files; must work offline). Event-driven only. |
| `work/game/ui.js` (+ `work/game/waves.js`) | ui agent | HUD (DOM overlay), title/victory/defeat screens, input + selection, build/upgrade menus, wave flow, camera framing. |

You may add helper files named `work/game/<yourmodule>-*.js`. Never edit another owner's file; if you need something from another module, code against this contract and mention the need in your report.

## Levels and worlds

`work/level.js` picks the level for this page load (`?level=` or `sessionStorage['cd-level']`, default `castle`); switching reloads the page. `scene.js` is the engine (renderer, post-processing, materials, building helpers, render loop) and builds one world: `work/worlds/castle.js` (Dawnhold, the river keep), `work/worlds/frostmere.js` (Frostmere, the winter pass) or `work/worlds/saltreach.js` (Saltreach, the sunset coast, three lanes). Shared fortress pieces live in `work/worlds/fort-kit.js`. A world returns `{ height, BASE, gateCenter, sun, terrain, water, treeLocations, bridgeDeck, lanePaths, laneNames, padSpots, view, titleView, fortPoints, mist, fx: { chimneys, fires, smoke, ambient }, moving, animate(time) }`. Game modules must read world facts from these exports, never hard-code coordinates.

## scene.js exports

`THREE, scene, camera, controls, renderer, composer, sun, terrain, water (null on Frostmere), materials, stoneMaps, height(x,z), noise, fbm, BASE (fortress courtyard y), gateCenter, treeLocations, clearTrees(x,z,r), frameHooks, box, cylinder, beam, tiledCone, pitchedRoof, facade, mesh, worldUV, unitBox, initialPosition, bridgeDeck (never matches on Frostmere), lanePaths, laneNames, padSpots, titleView, fortPoints, world`.

- `renderer.shadowMap.autoUpdate` is **false** after the first frame (static shadow map; the scene is huge). Set `renderer.shadowMap.needsUpdate = true` after placing static things (e.g. a tower). Moving things should use cheap blob/contact shadows, not the shadow map.
- `controls.update()` runs **after** frame hooks each frame. Never permanently offset the camera for shake; use `camera.setViewOffset` or similar and restore.
- Helpers `box/cylinder/...` add meshes to `scene` (or a given parent) with shadows on. Prefer building a Group, then merging geometries per material for draw-call efficiency.
- World scale: 1 unit ≈ 1 metre. Castle curtain walls ≈ 10 m tall. A human ≈ 1.8 units.

## core.js

```js
state = { phase: 'title'|'build'|'wave'|'won'|'lost', gold, lives, maxLives, wave, totalWaves, speed, paused, time, enemies: [], towers: [], selected }
bus.on(name, fn); bus.emit(name, data)
lanes = paths from the selected world; lane names and counts vary by level
lane.length; lane.pointAt(d, target?) → Vector3 on the ground (d = metres from spawn); lane.directionAt(d, target?) → unit horizontal Vector3
gatePoint: Vector3 at the castle gate
```

## enemies.js

```js
export const ENEMY_TYPES  // { [id]: { name, hp, speed (m/s), bounty (gold), damage (lives), armor (0..1 fraction of 'pierce' damage blocked), radius, height, boss?: bool } }
export function spawnEnemy(typeId, laneIndex, { hpScale = 1 } = {}) → enemy
export function damageEnemy(enemy, amount, { type = 'pierce' | 'blast' | 'magic' | 'fire', slow = null /* {factor, duration} */ } = {}) → true if this killed it
export function enemiesInRadius(pos, radius) → enemy[]
```
Enemy object: `{ id, typeId, hp, maxHp, alive, lane, dist, pos /*Vector3 feet*/, velocity /*Vector3 m/s*/, radius, height, bounty, slowFactor }`. Aim point = `pos.y + height * .6`.
Only living enemies are in `state.enemies`. On death: `state.gold += bounty`, emit `'enemy:death' {enemy, pos}`. On reaching the gate (`dist >= lane.length`): `state.lives -= damage`, emit `'enemy:leak' {enemy}`. On hit: emit `'enemy:hit' {enemy, amount, damageType, pos}`. On spawn: `'enemy:spawn' {enemy}`.
Must hold 60 fps with 80 live enemies (use instancing / merged geometry; skinned-look via procedural limb animation).

## towers.js

```js
export const TOWER_TYPES  // { [id]: { name, description, damageType, levels: [{ cost, damage, range, rate /*shots per s*/, splash?, slow? }, ×3] } }
export const pads          // [{ id, pos: Vector3, tower: null|tower }]
export function buildTower(pad, typeId) → tower|null  // deducts gold, emits 'tower:build' {tower}
export function upgradeCost(tower) → number|null        // null at max level
export function upgradeTower(tower) → bool              // emits 'tower:upgrade' {tower}
export function sellValue(tower) → number
export function sellTower(tower)                        // refunds, emits 'tower:sell' {tower, pos}
export function pick(raycaster) → { kind: 'pad', pad } | { kind: 'tower', tower } | null
export function setHighlight(selection /* same shape as pick() */, previewTypeId?)  // range ring, hover/selected glow, ghost preview
```
Tower object: `{ id, typeId, level /*0..2*/, pad, pos, range, target, kills, spent }`, stored in `state.towers`.
Towers own projectile flight and call `damageEnemy`. Emit `'tower:fire' {tower, from: Vector3, target, projectile}` and `'projectile:impact' {pos, projectile, radius, target}`. Projectile ids: `'arrow' | 'cannonball' | 'arcane' | 'bolt' | 'firepot'` (towers agent may add more; document them in your report).
`'firepot'` (Pitch Cauldron) impacts carry `duration`: the pool burns for that long and towers deal `'fire'` damage (ignores armour) to foes inside, in 0.25 s ticks. FX draws the flames, towers draw the ground glow.

## fx.js / audio.js

Pure listeners on the events above plus `'wave:start' {wave}`, `'wave:clear' {wave}`, `'game:won'`, `'game:lost'`, `'ui:click'`, `'ui:error'`. Audio also exports `unlock()` (called by ui on first user gesture) and `setMuted(bool)`. FX may expose `shake(strength)` and `floatText(pos, text, color)`.

## ui.js

Owns `state.phase`, wave spawning (via `spawnEnemy`), `state.selected`, pointer input (raycast → `towers.pick`), all DOM. Emits `'wave:start'`, `'wave:clear'`, `'game:won'`, `'game:lost'`, `'ui:click'`, `'ui:error'`. Game over when `state.lives <= 0`.
No `alert/confirm/prompt`. No external fonts or assets (single offline HTML) — use system fonts, CSS and inline SVG.

## Debug hooks (required, used by critics)

Each module exports `debug` with helpers, reachable as `__game.<module>.debug` in the page:
- enemies: `debug.spawnMany(typeId, lane, count)`
- towers: `debug.buildAll()` (a mix of tower types/levels on most pads)
- fx: `debug.demo()` (fires a representative burst of every effect around the visible area)
- audio: `debug.report()` (offline sound and mix measurements)
- ui: `debug.start()` (skip title → build phase), `debug.skipToWave(n)`, `debug.give(gold)`

## Build and preview

Run commands from the repository root. Install dependencies with `npm ci --prefix work`.

```bash
node work/preview.mjs
node work/build.mjs [name] [--watch]
node work/build-test.mjs
node work/perf-scheduler-test.mjs
```

The preview builds `outputs/castle-defense.html`, watches imported game sources, and serves the file at `http://127.0.0.1:32947/` and `/castle-defense.html`. Both routes accept level query parameters. Reload the browser after a successful build. Restart the process after editing the build or preview script.

The standalone builder defaults to the name `castle-defense`. A custom name produces `outputs/<name>.html`. `--watch` keeps the builder running without an HTTP server. esbuild starts at `work/game/main.js`; only files in its dependency graph are watched. Unrelated scripts and documentation do not trigger rebuilds. Successful builds replace the HTML through a temporary file and rename. Failed rebuilds leave the last successful HTML available and recover when the source is fixed. An initial build failure exits.

The browser runs the bundled HTML without loading files from `work/`. Three.js, styles, and shaders are embedded, and game assets are generated in code. The HTML embeds the project MIT license and the installed Three.js MIT license. Restart a watcher after changing license text. Generated HTML is not an editing source.

## Visual verification

```bash
node work/build.mjs dev-review
node work/shot.mjs dev-review work/shots/dev-review/title.png --size 1600x900 --wait 3000
```

`shot.mjs` also accepts `--eval "<js>"` to prepare a scene before capture. It reports frame statistics and console errors or warnings. Inspect the screenshots and exercise the changed gameplay path. Browser tools import the local Playwright development dependency. Install Chromium with `npm exec --prefix work -- playwright install chromium`. `node work/gallery.mjs` captures the README gallery and records the build hash and live scene state.

The [README](../../README.md#verify-changes) lists gameplay, audio, UX, and performance commands and their options. `work/verify.mjs` targets the absent castle-only HTML and is not a game acceptance check.
