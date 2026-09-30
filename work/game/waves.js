// Wave table + spawn schedule. Pure data/logic (no imports), edit freely.
// Group: { type, count, lane: 0 (south) | 1 (east) | 'alt' (alternate), at: first spawn (s from wave start), every: gap (s), hp?: extra hp multiplier }
export const WAVES = [
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
    { type: 'hound', count: 6, lane: 0, at: 12, every: .6 }] },
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
    { type: 'manatarms', count: 14, lane: 'alt', at: 0, every: .9 },
    { type: 'brute', count: 4, lane: 'alt', at: 8, every: 2.5 }] },
  { name: 'Battering Storm', groups: [
    { type: 'ram', count: 4, lane: 'alt', at: 0, every: 5 },
    { type: 'hound', count: 12, lane: 0, at: 4, every: .5 },
    { type: 'manatarms', count: 10, lane: 1, at: 6, every: 1.1 }] },
  { name: 'Blood on the Bridge', groups: [
    { type: 'brute', count: 6, lane: 1, at: 0, every: 2.2 },
    { type: 'raider', count: 16, lane: 1, at: 3, every: .55 },
    { type: 'hound', count: 10, lane: 0, at: 6, every: .5 }] },
  { name: 'The Long Column', groups: [
    { type: 'manatarms', count: 16, lane: 0, at: 0, every: .8 },
    { type: 'ram', count: 3, lane: 0, at: 10, every: 4 },
    { type: 'brute', count: 6, lane: 1, at: 4, every: 2 },
    { type: 'raider', count: 14, lane: 1, at: 16, every: .5 }] },
  { name: 'Every Banner Raised', groups: [
    { type: 'hound', count: 20, lane: 'alt', at: 0, every: .35 },
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
    out.push({ t: g.at + i * g.every, type: g.type, lane: g.lane === 'alt' ? i % 2 : g.lane, hp: hpScale(n) * (g.hp || 1) });
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
