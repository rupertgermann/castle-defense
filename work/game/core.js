// Shared game state, event bus, and enemy lanes. Every game module imports from here; nothing here imports game modules.
import { THREE, height, bridgeDeck, gateCenter, lanePaths, laneNames } from '../scene.js';

export const state = {
  phase: 'title',      // 'title' | 'build' | 'wave' | 'won' | 'lost'
  gold: 250,
  lives: 20,
  maxLives: 20,
  wave: 0,             // number of the current/last started wave (1-based)
  totalWaves: 15,
  speed: 1,            // 1 | 2 | 3 game-time multiplier
  paused: false,
  time: 0,             // game time in seconds (scaled by speed, stops when paused)
  enemies: [],         // live enemy objects, owned by enemies.js
  towers: [],          // built tower objects, owned by towers.js
  selected: null,      // { kind: 'pad', pad } | { kind: 'tower', tower } | null, owned by ui.js
};

const listeners = new Map();
export const bus = {
  on(name, fn) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(fn); },
  emit(name, data) { for (const fn of listeners.get(name) || []) fn(data); },
};

// Lanes: dense polylines from the world (spawn → gate), resampled with walk heights.
function walkHeight(x, z) {
  const b = bridgeDeck;
  if (x > b.x0 - 1 && x < b.x1 + 1 && Math.abs(z - b.z) < b.halfWidth + 1) return Math.max(height(x, z) + .1, b.y);
  return height(x, z) + .1;
}
function makeLane(name, raw) {
  const pts = [];
  for (const p of raw) if (!pts.length || pts[pts.length - 1].distanceToSquared(p) > .01) pts.push(new THREE.Vector3(p.x, 0, p.z));
  const cumulative = [0];
  for (let i = 1; i < pts.length; i++) cumulative.push(cumulative[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const length = cumulative[cumulative.length - 1];
  // Pre-resample every 0.5 units with heights, so lookups are O(1).
  const step = .5, samples = [];
  for (let d = 0, i = 0; d <= length + step; d += step) {
    const dd = Math.min(d, length);
    while (i < pts.length - 2 && cumulative[i + 1] < dd) i++;
    const t = (dd - cumulative[i]) / Math.max(1e-6, cumulative[i + 1] - cumulative[i]);
    const p = pts[i].clone().lerp(pts[i + 1], t); p.y = walkHeight(p.x, p.z); samples.push(p);
  }
  // Smooth heights so walkers glide over bridge ramps instead of stepping.
  for (let pass = 0; pass < 6; pass++) for (let i = 1; i < samples.length - 1; i++) samples[i].y = Math.max(walkHeight(samples[i].x, samples[i].z) - .05, (samples[i - 1].y + samples[i].y * 2 + samples[i + 1].y) / 4);
  return {
    name, length,
    // Position at distance d from spawn (clamped). Writes into target if given.
    pointAt(d, target = new THREE.Vector3()) {
      const f = clampD(d, length) / step, i = Math.min(samples.length - 2, Math.floor(f));
      return target.copy(samples[i]).lerp(samples[i + 1], f - i);
    },
    // Horizontal unit direction of travel at distance d.
    directionAt(d, target = new THREE.Vector3()) {
      const i = Math.min(samples.length - 2, Math.floor(clampD(d, length) / step));
      const j = Math.min(samples.length - 1, i + 4), k = Math.max(0, i - 4);
      return target.copy(samples[j]).sub(samples[k]).setY(0).normalize();
    },
  };
}
const clampD = (d, length) => Math.max(0, Math.min(length, d));

export const lanes = lanePaths.map((points, i) => makeLane(laneNames[i], points));

// Enemies that reach this point have breached the gate.
export const gatePoint = new THREE.Vector3(gateCenter.x, gateCenter.y, gateCenter.z);
