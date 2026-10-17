// Wave tables (one per level) + spawn schedule. Pure data/logic, edit freely.
import { LEVEL } from '../level.js';
import { lanePaths } from '../scene.js';
// Group: { type, count, lane: index into the level's lanes | 'alt' (round-robin over all lanes), at: first spawn (s from wave start), every: gap (s), hp?: extra hp multiplier }
const CASTLE_WAVES = [
  { name: 'Smoke on the Road', groups: [
    { type: 'raider', count: 6, lane: 0, at: 0, every: 1.6 }] },
  { name: 'Across the River', groups: [
    { type: 'raider', count: 5, lane: 0, at: 0, every: 1.5 },
    { type: 'raider', count: 5, lane: 1, at: 4, every: 1.5 }] },
  { name: 'The Hunt Is Loosed', groups: [
    { type: 'hound', count: 6, lane: 1, at: 0, every: .8 },
    { type: 'raider', count: 8, lane: 0, at: 3, every: 1.2 }] },
  { name: 'Iron and Oath', groups: [
    { type: 'manatarms', count: 5, lane: 0, at: 0, every: 2 },
    { type: 'raider', count: 8, lane: 'alt', at: 2, every: 1 }] },
  { name: 'Pincer at Dawn', groups: [
    { type: 'hound', count: 8, lane: 0, at: 0, every: .7 },
    { type: 'manatarms', count: 6, lane: 1, at: 3, every: 1.8 },
    { type: 'raider', count: 8, lane: 'alt', at: 10, every: .9 }] },
  { name: 'The Brute Squad', groups: [
    { type: 'brute', count: 3, lane: 0, at: 0, every: 4 },
    { type: 'raider', count: 10, lane: 1, at: 2, every: .9 },
    { type: 'outrider', count: 2, lane: 1, at: 14, every: 1.6 }] },
  { name: 'Rams at the Gate', groups: [
    { type: 'ram', count: 2, lane: 1, at: 0, every: 8 },
    { type: 'manatarms', count: 8, lane: 'alt', at: 3, every: 1.4 },
    { type: 'raider', count: 10, lane: 0, at: 8, every: .8 }] },
  { name: 'Howling Night', groups: [
    { type: 'hound', count: 18, lane: 'alt', at: 0, every: .45 },
    { type: 'brute', count: 3, lane: 1, at: 6, every: 3 }] },
  { name: 'The Warlord\'s Champion', boss: true, groups: [
    { type: 'manatarms', count: 8, lane: 0, at: 0, every: 1.2 },
    { type: 'warlord', count: 1, lane: 0, at: 9, every: 1, hp: .55 },
    { type: 'raider', count: 12, lane: 1, at: 2, every: .8 }] },
  { name: 'Shieldwall', groups: [
    { type: 'manatarms', count: 11, lane: 'alt', at: 0, every: .9 },
    { type: 'shaman', count: 2, lane: 'alt', at: 5, every: 4 },
    { type: 'brute', count: 4, lane: 'alt', at: 8, every: 2.5 }] },
  { name: 'Battering Storm', groups: [
    { type: 'ram', count: 4, lane: 'alt', at: 0, every: 5 },
    { type: 'hound', count: 12, lane: 0, at: 4, every: .5 },
    { type: 'manatarms', count: 10, lane: 1, at: 6, every: 1.1 }] },
  { name: 'Blood on the Bridge', groups: [
    { type: 'brute', count: 6, lane: 1, at: 0, every: 2.2 },
    { type: 'shaman', count: 2, lane: 1, at: 4, every: 5 },
    { type: 'outrider', count: 5, lane: 0, at: 10, every: 1.2 },
    { type: 'raider', count: 8, lane: 1, at: 3, every: .55 },
    { type: 'hound', count: 10, lane: 0, at: 6, every: .5 }] },
  { name: 'The Long Column', groups: [
    { type: 'manatarms', count: 16, lane: 0, at: 0, every: .8 },
    { type: 'ram', count: 3, lane: 0, at: 10, every: 4 },
    { type: 'brute', count: 6, lane: 1, at: 4, every: 2 },
    { type: 'raider', count: 14, lane: 1, at: 16, every: .5 }] },
  { name: 'Every Banner Raised', groups: [
    { type: 'hound', count: 10, lane: 'alt', at: 0, every: .35 },
    { type: 'outrider', count: 8, lane: 'alt', at: 4, every: .9 },
    { type: 'shaman', count: 3, lane: 'alt', at: 9, every: 3 },
    { type: 'brute', count: 8, lane: 'alt', at: 6, every: 1.6 },
    { type: 'ram', count: 4, lane: 'alt', at: 12, every: 3 },
    { type: 'manatarms', count: 12, lane: 'alt', at: 16, every: .7 }] },
  { name: 'The Warlord Comes', boss: true, groups: [
    { type: 'manatarms', count: 12, lane: 'alt', at: 0, every: .8 },
    { type: 'brute', count: 6, lane: 'alt', at: 5, every: 1.8 },
    { type: 'ram', count: 4, lane: 'alt', at: 10, every: 2.5 },
    { type: 'warlord', count: 1, lane: 0, at: 18, every: 1 },
    { type: 'hound', count: 16, lane: 'alt', at: 20, every: .4 }] },
];

// Frostmere: lane 0 = the switchback road up the valley, lane 1 = across the frozen lake. Harder than the river keep:
// rams and hounds come early, and the lake lane is short and flat.
const FROST_WAVES = [
  { name: 'Shapes in the Snow', groups: [
    { type: 'raider', count: 8, lane: 0, at: 0, every: 1.3 }] },
  { name: 'Over the Ice', groups: [
    { type: 'hound', count: 6, lane: 1, at: 0, every: 1 },
    { type: 'raider', count: 6, lane: 0, at: 3, every: 1.3 }] },
  { name: 'Wolves of the Pass', groups: [
    { type: 'hound', count: 12, lane: 'alt', at: 0, every: .6 },
    { type: 'raider', count: 6, lane: 1, at: 6, every: 1 }] },
  { name: 'Mailed in Frost', groups: [
    { type: 'manatarms', count: 6, lane: 0, at: 0, every: 1.6 },
    { type: 'raider', count: 10, lane: 'alt', at: 2, every: .9 }] },
  { name: 'The First Ram', groups: [
    { type: 'ram', count: 1, lane: 0, at: 0, every: 1 },
    { type: 'manatarms', count: 6, lane: 1, at: 3, every: 1.5 },
    { type: 'hound', count: 8, lane: 0, at: 8, every: .6 }] },
  { name: 'Brutes on the Ice', groups: [
    { type: 'brute', count: 4, lane: 1, at: 0, every: 3 },
    { type: 'raider', count: 12, lane: 0, at: 2, every: .8 }] },
  { name: 'Whiteout', groups: [
    { type: 'hound', count: 20, lane: 'alt', at: 0, every: .4 },
    { type: 'manatarms', count: 8, lane: 'alt', at: 6, every: 1.2 }] },
  { name: 'Hammer and Ram', groups: [
    { type: 'ram', count: 3, lane: 'alt', at: 0, every: 5 },
    { type: 'brute', count: 4, lane: 0, at: 4, every: 2.5 },
    { type: 'raider', count: 12, lane: 1, at: 6, every: .7 }] },
  { name: 'The Ice-Jarl', boss: true, groups: [
    { type: 'manatarms', count: 10, lane: 1, at: 0, every: 1 },
    { type: 'warlord', count: 1, lane: 1, at: 8, every: 1, hp: .6 },
    { type: 'hound', count: 12, lane: 0, at: 2, every: .5 }] },
  { name: 'Frozen Shieldwall', groups: [
    { type: 'manatarms', count: 13, lane: 'alt', at: 0, every: .8 },
    { type: 'shaman', count: 2, lane: 'alt', at: 4, every: 4 },
    { type: 'brute', count: 5, lane: 'alt', at: 8, every: 2.2 }] },
  { name: 'Avalanche', groups: [
    { type: 'hound', count: 24, lane: 'alt', at: 0, every: .3 },
    { type: 'raider', count: 16, lane: 'alt', at: 5, every: .45 }] },
  { name: 'Rams Across the Lake', groups: [
    { type: 'ram', count: 5, lane: 1, at: 0, every: 3.5 },
    { type: 'outrider', count: 6, lane: 0, at: 6, every: 1.1 },
    { type: 'brute', count: 6, lane: 0, at: 3, every: 2 },
    { type: 'manatarms', count: 5, lane: 'alt', at: 8, every: 1 }] },
  { name: 'The Long Winter', groups: [
    { type: 'manatarms', count: 18, lane: 0, at: 0, every: .7 },
    { type: 'brute', count: 8, lane: 1, at: 4, every: 1.7 },
    { type: 'ram', count: 3, lane: 'alt', at: 12, every: 4 },
    { type: 'hound', count: 14, lane: 1, at: 16, every: .4 }] },
  { name: 'Every Horn in the North', groups: [
    { type: 'hound', count: 14, lane: 'alt', at: 0, every: .3 },
    { type: 'shaman', count: 3, lane: 'alt', at: 8, every: 3 },
    { type: 'brute', count: 10, lane: 'alt', at: 6, every: 1.4 },
    { type: 'ram', count: 5, lane: 'alt', at: 12, every: 2.6 },
    { type: 'manatarms', count: 14, lane: 'alt', at: 16, every: .6 }] },
  { name: 'The Winter King', boss: true, groups: [
    { type: 'manatarms', count: 14, lane: 'alt', at: 0, every: .7 },
    { type: 'brute', count: 8, lane: 'alt', at: 5, every: 1.6 },
    { type: 'ram', count: 5, lane: 'alt', at: 10, every: 2.2 },
    { type: 'warlord', count: 1, lane: 1, at: 16, every: 1, hp: 1.1 },
    { type: 'warlord', count: 1, lane: 0, at: 22, every: 1, hp: .8 },
    { type: 'hound', count: 18, lane: 'alt', at: 20, every: .35 }] },
];
// Saltreach: lane 0 = the beach landing (short: the longships are close), 1 = the cliff road (long), 2 = the causeway.
// Three roads split the defence; the gate road below the walls is the one place they all meet.
const SALT_WAVES = [
  { name: 'Sails on the Horizon', groups: [
    { type: 'raider', count: 8, lane: 0, at: 0, every: 1.4 }] },
  { name: 'The Cliff Road', groups: [
    { type: 'raider', count: 6, lane: 1, at: 0, every: 1.2 },
    { type: 'hound', count: 6, lane: 0, at: 5, every: .9 }] },
  { name: 'Across the Causeway', groups: [
    { type: 'manatarms', count: 5, lane: 2, at: 0, every: 2 },
    { type: 'raider', count: 9, lane: 'alt', at: 3, every: 1 }] },
  { name: 'Three Roads', groups: [
    { type: 'hound', count: 12, lane: 'alt', at: 0, every: .6 },
    { type: 'manatarms', count: 6, lane: 'alt', at: 6, every: 1.6 }] },
  { name: 'Riders on the Cliff Road', groups: [
    { type: 'outrider', count: 3, lane: 1, at: 0, every: 2.2 },
    { type: 'raider', count: 10, lane: 'alt', at: 3, every: .8 }] },
  { name: 'The Bone-Priests', groups: [
    { type: 'brute', count: 3, lane: 2, at: 0, every: 3 },
    { type: 'shaman', count: 2, lane: 2, at: 3, every: 4 },
    { type: 'raider', count: 12, lane: 'alt', at: 2, every: .8 }] },
  { name: 'Rams Up the Cliff', groups: [
    { type: 'ram', count: 2, lane: 1, at: 0, every: 7 },
    { type: 'hound', count: 10, lane: 0, at: 4, every: .5 },
    { type: 'manatarms', count: 8, lane: 2, at: 8, every: 1.2 }] },
  { name: 'Iron on the Sand', groups: [
    { type: 'manatarms', count: 10, lane: 0, at: 0, every: .9 },
    { type: 'shaman', count: 1, lane: 0, at: 5, every: 1 },
    { type: 'outrider', count: 3, lane: 1, at: 2, every: 1.4 },
    { type: 'ram', count: 1, lane: 2, at: 6, every: 1 }] },
  { name: 'The Sea-King\'s Champion', boss: true, groups: [
    { type: 'manatarms', count: 9, lane: 'alt', at: 0, every: 1 },
    { type: 'warlord', count: 1, lane: 2, at: 8, every: 1, hp: .55 },
    { type: 'hound', count: 12, lane: 'alt', at: 3, every: .5 }] },
  { name: 'Shields on the Shore', groups: [
    { type: 'manatarms', count: 18, lane: 'alt', at: 0, every: .7 },
    { type: 'shaman', count: 3, lane: 'alt', at: 3, every: 3 },
    { type: 'brute', count: 5, lane: 'alt', at: 8, every: 2.2 }] },
  { name: 'Battering Surf', groups: [
    { type: 'ram', count: 6, lane: 'alt', at: 0, every: 3.2 },
    { type: 'outrider', count: 9, lane: 'alt', at: 6, every: .8 },
    { type: 'hound', count: 16, lane: 'alt', at: 4, every: .4 }] },
  { name: 'Blood in the Shallows', groups: [
    { type: 'brute', count: 8, lane: 'alt', at: 0, every: 1.8 },
    { type: 'raider', count: 20, lane: 'alt', at: 3, every: .4 },
    { type: 'manatarms', count: 10, lane: 2, at: 10, every: .9 }] },
  { name: 'The Long Night Falls', groups: [
    { type: 'manatarms', count: 18, lane: 'alt', at: 0, every: .6 },
    { type: 'shaman', count: 3, lane: 'alt', at: 4, every: 3 },
    { type: 'ram', count: 4, lane: 'alt', at: 10, every: 3 },
    { type: 'hound', count: 18, lane: 'alt', at: 14, every: .35 }] },
  { name: 'Every Sail Raised', groups: [
    { type: 'hound', count: 24, lane: 'alt', at: 0, every: .3 },
    { type: 'outrider', count: 12, lane: 'alt', at: 3, every: .7 },
    { type: 'shaman', count: 3, lane: 'alt', at: 10, every: 3 },
    { type: 'brute', count: 10, lane: 'alt', at: 6, every: 1.4 },
    { type: 'ram', count: 5, lane: 'alt', at: 12, every: 2.4 },
    { type: 'manatarms', count: 15, lane: 'alt', at: 16, every: .6 }] },
  { name: 'The Sea-King Comes', boss: true, groups: [
    { type: 'manatarms', count: 15, lane: 'alt', at: 0, every: .6 },
    { type: 'shaman', count: 4, lane: 'alt', at: 6, every: 3 },
    { type: 'outrider', count: 9, lane: 'alt', at: 12, every: .8 },
    { type: 'brute', count: 9, lane: 'alt', at: 5, every: 1.5 },
    { type: 'ram', count: 6, lane: 'alt', at: 10, every: 2 },
    { type: 'warlord', count: 1, lane: 0, at: 16, every: 1, hp: 1 },
    { type: 'warlord', count: 1, lane: 1, at: 22, every: 1, hp: .7 },
    { type: 'hound', count: 21, lane: 'alt', at: 20, every: .33 }] },
];
export const WAVES = { frostmere: FROST_WAVES, saltreach: SALT_WAVES }[LEVEL] || CASTLE_WAVES;
// Frostmere's lanes are long, so its hosts are hardier to keep it the harder siege.
const LEVEL_HP = LEVEL === 'frostmere' ? 1.35 : 1;

// Wave-wide hp multiplier (1-based wave number).
export const hpScale = n => 1 + .1 * (n - 1) + .006 * (n - 1) ** 2;
// Gold for clearing wave n, and per second left on the countdown when calling early.
export const clearBonus = n => 20 + n * 6;
export const EARLY_GOLD_PER_SEC = 1.5;
export const BUILD_COUNTDOWN = 25;

// Flattened, time-sorted spawn list for wave n: [{ t, type, lane, hp }].
export function schedule(n) {
  const out = [];
  for (const g of WAVES[n - 1].groups) for (let i = 0; i < g.count; i++)
    out.push({ t: g.at + i * g.every, type: g.type, lane: g.lane === 'alt' ? i % lanePaths.length : g.lane, hp: hpScale(n) * LEVEL_HP * (g.hp || 1) });
  return out.sort((a, b) => a.t - b.t);
}

// Composition for the preview: [{ type, count, lanes: Set }] in first-appearance order.
export function composition(n) {
  const map = new Map();
  for (const s of schedule(n)) {
    const c = map.get(s.type) || map.set(s.type, { type: s.type, count: 0, lanes: new Set() }).get(s.type);
    c.count++; c.lanes.add(s.lane);
  }
  return [...map.values()];
}
