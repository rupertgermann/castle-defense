# Castle Defense project notes

The game has three battlefields, 15 waves per battlefield, three difficulty settings, tower building and upgrades, procedural audio, and keyboard and touch controls. The playable artifact is `outputs/castle-defense.html`.

## Development workflow

The [README](../README.md) contains setup, controls, command options, and verification instructions. The [module contract](game/CONTRACT.md) defines shared state, world data, events, and game APIs.

- `node work/preview.mjs` builds the game, watches imported sources, and serves the HTML on loopback port 32947.
- `node work/build.mjs [name] [--watch]` produces a standalone offline HTML file, with an optional persistent watcher.
- `node work/build-test.mjs` checks building, preview routes, rebuilds, and recovery from source errors in a temporary fixture.
- `node work/perf-scheduler-test.mjs` checks the render scheduler.

## Acceptance

Gameplay changes require exercising the affected player interaction. Visual changes require active gameplay captures and visual inspection across the affected battlefields and viewport sizes. Performance measurements must identify the build and workload measured. Test results do not substitute for visual acceptance.

The preview requires a manual browser reload after rebuilding. Browser automation scripts depend on the local Codex Playwright runtime. `work/verify.mjs` references an absent castle-only artifact and does not verify the game.
