// Tower rules in Node on a straight test road: economy, targeting, impacts, fire pools. Run: node work/towers-test.mjs
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createTowerRules, TOWER_TYPES } from './game/towers-rules.js';

// The road runs along +x from spawn (x = 0) to the gate (x = length); build sites stand 10 m off it.
function world({ gold = 1e4, length = 100 } = {}) {
  const listeners = {}, events = [], hits = [];
  const bus = { on: (n, fn) => (listeners[n] ||= []).push(fn), emit: (n, d) => { events.push([n, d]); for (const fn of listeners[n] || []) fn(d); } };
  const state = { gold, towers: [], enemies: [] };
  const siege = { spend: c => state.gold >= c && ((state.gold -= c), true), earn: n => { state.gold += n; } };
  const lane = { length, pointAt: (d, out = new Vector3()) => out.set(Math.min(Math.max(d, 0), length), 0, 0) };
  const host = {
    foes: () => state.enemies,
    damage(e, n, opts) { hits.push({ e, n, opts }); if ((e.hp -= n) > 0) return false; e.alive = false; state.enemies.splice(state.enemies.indexOf(e), 1); return true; },
    inRadius: (pos, r) => state.enemies.filter(e => Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) <= r + e.radius),
    distAfter: (e, T) => e.dist + e.speed * T,
  };
  const rules = createTowerRules({ state, bus, siege, host, lanes: [lane], muzzle: (t, out) => out.copy(t.pos).setY(t.pos.y + 8), groundY: () => 0 });
  const g = { state, bus, events, hits, rules, t: 0,
    // a build site at (x, 10), facing the road point `face` (or away from it)
    pad: (x = 50, face = x, away = false) => ({ pos: new Vector3(x, 0, 10), tower: null, yaw: Math.atan2(face - x, -10) + (away ? Math.PI : 0) }),
    // a standing foe at road distance `dist`, drawn at `at` (defaults to its road point)
    foe(dist, { speed = 0, hp = 1e6, at } = {}) { const e = { typeId: 'raider', lane: 0, dist, speed, hp, alive: true, radius: .5, height: 2, pos: at || new Vector3(dist, 0, 0), velocity: new Vector3(speed, 0, 0) }; state.enemies.push(e); return e; },
    run(seconds, until = () => false, dt = 1 / 16) { for (const end = g.t + seconds; g.t < end - 1e-9 && !until(); g.t += dt) rules.update(dt); return g.t; },
    seen: name => events.filter(e => e[0] === name).map(e => e[1]),
  };
  return g;
}
const close = (a, b, eps = 1e-9) => assert(Math.abs(a - b) < eps, `${a} != ${b}`);

// ---- economy ----
{
  const g = world({ gold: 69 }), pad = g.pad();
  assert.equal(g.rules.build(pad, 'archer'), null, 'too little gold is refused');
  assert.deepEqual([g.state.gold, g.state.towers.length, pad.tower, g.seen('tower:build').length], [69, 0, null, 0]);
  g.state.gold = 70;
  const t = g.rules.build(pad, 'archer');
  assert.deepEqual([g.state.gold, g.state.towers, pad.tower, g.seen('tower:build')], [0, [t], t, [{ tower: t }]]);
}
//      type        upgrades  spent  refund (70%, floored)
for (const [type, ups, spent, refund] of [
  ['archer',   0, 70,  49],
  ['mage',     1, 235, 164],
  ['cannon',   2, 505, 353],
]) {
  const g = world(), pad = g.pad(), t = g.rules.build(pad, type);
  for (let i = 0; i < ups; i++) assert.equal(g.rules.upgrade(t), true);
  assert.deepEqual([t.level, t.spent, t.range, g.seen('tower:upgrade').length], [ups, spent, TOWER_TYPES[type].levels[ups].range, ups]);
  assert.equal(g.rules.sellValue(t), refund);
  const gold = g.state.gold; g.rules.sell(t);
  assert.deepEqual([g.state.gold, g.state.towers.length, pad.tower, t.sold], [gold + refund, 0, null, true]);
  assert.deepEqual(g.seen('tower:sell'), [{ tower: t, pos: t.pos }]);
}
{
  const g = world(), t = g.rules.build(g.pad(), 'ballista');
  assert.equal(g.rules.upgradeCost(t), 190);
  g.rules.upgrade(t); g.rules.upgrade(t);
  assert.equal(g.rules.upgradeCost(t), null, 'null at max level');
  assert.equal(g.rules.upgrade(t), false);
}

// ---- targeting ----
const targetOf = (type, foes, opts = {}) => {
  const g = world(opts), t = g.rules.build(g.pad(), type), es = foes.map(([d, o]) => g.foe(d, o));
  g.run(1 / 16);
  return es.indexOf(t.target);
};
//      tower        foes [road distance, options]                              picks
for (const [type, foes, want, opts] of [
  ['archer',    [[45], [55], [70]],                                              1],    // least road left in range; 70 is 22 m off
  ['trebuchet', [[50], [70]],                                                    1],    // 50 stands in the dead zone (10 m)
  ['trebuchet', [[50]],                                                          -1],
  ['trebuchet', [[66, { speed: 4 }]],                                            0, { length: 80 }],
  ['trebuchet', [[66, { speed: 5 }]],                                            -1, { length: 80 }],   // reaches the gate before the stone lands
]) assert.equal(targetOf(type, foes, opts), want, `${type} ${JSON.stringify(foes)}`);
// turn speed: a bombard facing away needs (π − .12) / 2.2 s to come round; facing the foe it fires when its .4 s cooldown is up
for (const [away, from, to] of [[false, .4, .45], [true, 1.36, 1.45]]) {
  const g = world(); g.rules.build(g.pad(50, 55, away), 'cannon'); g.foe(55);
  const t = g.run(3, () => g.seen('tower:fire').length);
  assert(t >= from && t <= to, `first shot at ${t}`);
}

// ---- impacts ----
const landed = (g, kind) => g.seen('projectile:impact').some(d => d.projectile === kind);
// splash: the bombard lands on the leading foe; a foe 3.2 m back (the splash edge) takes half
{
  const g = world(), t = g.rules.build(g.pad(), 'cannon'), lead = g.foe(55), edge = g.foe(51.8);
  g.run(3, () => landed(g, 'cannonball'));
  assert.equal(t.target, lead);
  assert.deepEqual(g.hits.map(h => [h.e, +h.n.toFixed(9)]), [[lead, 34], [edge, 17]]);
}
// every tower sends its own damageType; the Arcane Spire passes its slow on, the Ballista its armour pierce
for (const [type, id] of Object.entries(TOWER_TYPES)) {
  const g = world(); g.rules.build(g.pad(), type); g.foe(55);   // 11.2 m off: outside the Trebuchet's dead zone, inside every range
  g.run(6, () => g.hits.length);
  const { type: sent, slow, armorPierce } = g.hits[0].opts, L = id.levels[0];
  assert.deepEqual([sent, slow, armorPierce], [id.damageType, L.slow || null, L.armorPierce || 0], type);
}
// kill credit: a sold tower earns none for the shot it left in the air
for (const sold of [false, true]) {
  const g = world(), t = g.rules.build(g.pad(), 'cannon'), e = g.foe(55, { hp: 1 });
  g.run(1, () => g.seen('tower:fire').length);
  if (sold) g.rules.sell(t);
  g.run(3, () => !e.alive);
  assert.deepEqual([e.alive, t.kills], [false, sold ? 0 : 1]);
}

// ---- fire pools ----
// A level-1 pot (radius 3) lands on a foe; its reach is 3 + .5·.5 = 3.25 m for the first splash and every tick.
{
  const g = world(), t = g.rules.build(g.pad(), 'cauldron'), target = g.foe(55);
  const near = g.foe(0, { at: new Vector3(55, 0, 3.24) }), far = g.foe(0, { at: new Vector3(55, 0, -3.26) });
  g.run(4, () => landed(g, 'firepot'));
  g.rules.sell(t);   // no second pot
  assert.deepEqual(g.hits.map(h => [h.e, h.n, h.opts.type]), [[target, 10, 'fire'], [near, 10, 'fire']]);
  assert.equal(g.rules.pools.length, 1);
  g.hits.length = 0; g.run(1);
  assert.deepEqual(g.hits.map(h => [h.e, h.n]), Array(4).fill([[target, 4], [near, 4]]).flat(), '0.25 s ticks of 16 dps');
  g.run(3);
  assert.equal(g.rules.pools.length, 0, 'the pool burns out after 4 s');
  g.hits.length = 0; g.run(1);
  assert.deepEqual(g.hits, []);
}
// overlapping pools don't add up: a foe in a 16 dps and a 38 dps pool burns at 38 dps
{
  const g = world(), a = g.rules.build(g.pad(45, 55), 'cauldron'), b = g.rules.build(g.pad(65, 55), 'cauldron'), e = g.foe(55);
  g.rules.upgrade(b); g.rules.upgrade(b);
  g.run(4, () => g.rules.pools.length === 2);
  g.rules.sell(a); g.rules.sell(b);
  g.hits.length = 0; g.run(1);
  assert.deepEqual(g.hits.map(h => h.n), [9.5, 9.5, 9.5, 9.5]);
}

console.log('tower rules ok');
