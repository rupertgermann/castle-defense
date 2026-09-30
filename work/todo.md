# Castle scene

Started 2026-09-30 at 15:44:54 Europe/Berlin, 13:44:54 UTC.

- [x] `how` over the affected subsystem. Empty directory, no integration constraints.
- [x] `architect` for parallel design exploration. Single self-contained scene; direct design under the user's instruction to match ceremony to the task. A bundled Three.js scene preserves actual geometry and offline interaction. A raster panorama cannot satisfy rotation around a model.
- [x] Write the throughput checkpoint as four todo items.
  - Blocking first steps. Establish local library bundling and a browser verification route.
  - Independent workstreams. n/a: one scene and one author avoid mismatched coordinates and materials.
  - Shared mutable state. One author owns the scene source and final HTML.
  - Smallest safe decomposition. One author builds geometry, then materials and light, then verifies orbit, zoom, and mobile framing.
- [x] Delegate code-writing to a subagent. skip: user's single-pass ceremony instruction; one coherent visual artifact owned here.
- [x] Verify on the matching surface.
- [x] Rebase into small, ordered commits. skip: standalone file deliverable, no commit requested.
- [x] If the design is contested, `interrogate` before shipping. skip: no contested design.
- [x] Run Opening a PR. skip: no repository or PR requested.

Scene data shape: deterministic world height function, fortress boundary points, architectural groups, and shared instanced geometry batches. Native OrbitControls owns camera interaction. Everything bundles into one offline HTML file with no visible text.

Acceptance: detailed aerial medieval castle and grounds in warm morning light; real orbit and zoom; no visible words; one HTML with all dependencies embedded; measured start and finish times. Visual inspection plus a browser interaction check must pass.

Finished 2026-09-30 at 16:13:02 Europe/Berlin, 14:13:02 UTC. Elapsed 28 minutes 8 seconds.

Verified in the actual in-app browser through the user-approved, single-file loopback preview. Mouse orbit and wheel zoom, keyboard orbit and zoom, double-click reset, desktop and 390 x 844 portrait layout, zero visible body text, and zero browser error logs passed. First offline build also passed automated camera, reset, no-network, and no-visible-text assertions. The final bundle has one embedded script and no external asset tags.
