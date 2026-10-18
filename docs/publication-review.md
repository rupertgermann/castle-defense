# Public release review

Review date: 2026-10-18. Source baseline: `2eebd76`, with the release preparation changes in `feat/public-release-preparation`.

## Assessment

No credentials or private keys were detected in the inspected repository contents or reachable history. The repository can proceed toward public release once the release files are integrated into the default branch. The maintainer accepts the historical identity disclosure described below. Repository visibility remains private.

A clean scan is evidence within the stated scope, not a guarantee that every possible secret or third-party rights issue is absent.

## Scope and results

| Check | Evidence |
| --- | --- |
| Git source and history | Independent inspection of 53 reachable commits and 219 unique historical blobs across fetched refs. Credential patterns, private hosts, paths, URLs, and binary assets were checked. No detected credentials or private keys. |
| Secret scanner | Gitleaks 8.30.1, default rules, `git --log-opts=--all --redact`. It scanned 46 commit patches and reported no leaks. The manual blob inspection also covers content shared across commits. |
| Current dependencies | `npm audit --prefix work` reported zero known advisories for the installed lockfile. |
| Historical image | The removed castle-only JPEG is a game screenshot without EXIF or XMP metadata. |
| Application network behavior | Game source contains no telemetry or application HTTP requests. The gallery check rejects external HTTP requests for all three levels. |
| GitHub content | Existing PR descriptions, issue bodies, review data, and available comments were checked for credential patterns and local paths. No matching sensitive content was detected. No release assets or Actions artifacts were listed. |
| Public metadata | The About description and seven topics describe the game. No homepage is configured because no public hosted game URL is established. |

## Privacy decision

Git author metadata contains the maintainer's real name and email address. Historical revisions also contain absolute developer home paths. Making the repository public exposes that history, even though the current browser tools use portable imports.

The maintainer explicitly accepts publication of the historical email address and local paths on 2026-10-18. No history rewrite is performed. Removing files from the current tree alone would not remove their historical contents.

## Distribution and licenses

The repository includes a project MIT `LICENSE` and `THIRD_PARTY_NOTICES.md`. The standalone HTML includes the full project and Three.js MIT texts. The build test verifies their exact presence. Three.js is the bundled runtime dependency; esbuild and Playwright are development tools and are not embedded in the game.

The review found procedural game assets and generated gameplay screenshots, with no external asset downloads in the game. The MIT grant applies to project material; third-party notices remain in force. See the [MIT text](https://opensource.org/license/mit) and [Three.js r180 license](https://github.com/mrdoob/three.js/blob/r180/LICENSE).

## Verification and screenshots

`node work/build-test.mjs` checks single builds, embedded license texts, HTTP routes, rebuilds, failed-build preservation, and recovery. `node work/perf-scheduler-test.mjs` checks frame scheduling. The production HTML is rebuilt from the release source.

`node work/gallery.mjs` captures the title screen and two gameplay scenes in each battlefield. It uses normal starting gold and regular tower costs, waits for active tower targeting, and captures a running simulation. The combat scene uses a close in-engine camera; the tower-management scene uses the overview and a tower card. Captures are not composites or generated illustrations.

The [capture manifest](screenshots/manifest.json) records the exact HTML SHA-256, viewport, level, wave, live enemy count, and error/network observations. The README displays the nine JPEGs. Browser checks cover Chromium on macOS; they do not establish compatibility or performance on every browser and device. Full 15-wave playthroughs are outside this release-preparation check.

## Release work

| Ticket | Deliverable |
| --- | --- |
| [#3](https://github.com/rupertgermann/castle-defense/issues/3) | Repository and history audit |
| [#4](https://github.com/rupertgermann/castle-defense/issues/4) | MIT license and dependency notices |
| [#5](https://github.com/rupertgermann/castle-defense/issues/5) | Live three-level gallery and README |
| [#6](https://github.com/rupertgermann/castle-defense/issues/6) | GitHub About and release handoff |
| [#7](https://github.com/rupertgermann/castle-defense/issues/7) | Portable browser tooling |

Before switching visibility, integrate the release files into the default branch and confirm that its README images and license render on GitHub. The maintainer accepts the historical identity disclosure. No visibility change, merge, or history rewrite is part of this review.
