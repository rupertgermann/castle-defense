// Entry point: boots the castle scene, then wires the tower-defense systems into its frame loop.
import { frameHooks } from '../scene.js';
import { state, bus, lanes, siege } from './core.js';
import * as enemies from './enemies.js';
import * as towers from './towers.js';
import * as fx from './fx.js';
import * as audio from './audio.js';
import * as ui from './ui.js';

for (const m of [enemies, towers, fx, audio, ui]) m.init?.();

frameHooks.push((realDt, time) => {
  const dt = state.paused ? 0 : realDt * state.speed;
  state.time += dt;
  for (const s of siege.tick(dt)) enemies.spawnEnemy(s.type, s.lane, { hpScale: s.hpScale });
  ui.update?.(dt, realDt);       // HUD, input, camera
  enemies.update?.(dt);
  towers.update?.(dt);
  fx.update?.(dt, realDt);
  audio.update?.(dt, realDt);
});

// Test/debug handle. Modules may attach more under their own name.
import * as S from "../scene.js";
window.__scene = S;
window.__game = { state, bus, lanes, siege, enemies, towers, fx, audio, ui };
