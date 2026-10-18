// Siege rules in Node, against the real Dawnhold wave table. Run: node work/siege-test.mjs
import assert from 'node:assert/strict';
import { createSiege, DIFFICULTIES, STARTING_GOLD } from './game/siege.js';
import { WAVES_BY_LEVEL, schedule, clearBonus, BUILD_COUNTDOWN } from './game/waves.js';

const level = { waves: WAVES_BY_LEVEL.castle, laneCount: 2, hp: 1 };
function fresh(difficulty = 'knight') {
  const listeners = {}, events = [];
  const bus = { on: (n, fn) => (listeners[n] ||= []).push(fn), emit: (n, d) => { events.push([n, d]); for (const fn of listeners[n] || []) fn(d); } };
  const state = { phase: 'title', gold: 0, lives: 0, maxLives: 0, wave: 0, enemies: [] };
  const siege = createSiege({ state, bus });
  siege.start(difficulty, level);
  return { siege, state, bus, events, last: n => events.findLast(e => e[0] === n)?.[1] };
}
// Marches the current wave: every foe that spawns is pushed onto the field, then slain or leaked by `fate`.
function march(g, fate = () => 'slay') {
  for (let i = 0; i < 1e5 && g.state.phase === 'wave'; i++) {
    for (const s of g.siege.tick(.1)) g.state.enemies.push({ lane: s.lane, bounty: 5, hpScale: s.hpScale });
    while (g.state.enemies.length && g.state.phase === 'wave') {
      const e = g.state.enemies.pop();
      fate(e) === 'leak' ? g.siege.leaked(e, 1) : g.siege.slain(e);
    }
  }
}

// start: difficulty sets gold, keep strength, phase
for (const [k, d] of Object.entries(DIFFICULTIES)) {
  const { state } = fresh(k);
  assert.deepEqual([state.gold, state.lives, state.maxLives, state.phase, state.wave], [Math.round(STARTING_GOLD * d.gold), d.lives, d.lives, 'build', 0]);
}
assert.equal(fresh().siege.start('knight', level), false, 'start only from the title');

// horn: 10 s left on the countdown pays 15 gold
{
  const g = fresh(); g.siege.callWave(); march(g);
  assert.equal(g.siege.countdown, BUILD_COUNTDOWN);
  g.siege.tick(BUILD_COUNTDOWN - 10);
  const gold = g.state.gold;
  assert.equal(g.siege.callWave(), true);
  assert.equal(g.state.gold, gold + 15);
  assert.equal(g.last('wave:start').earlyBonus, 15);
}

// spawns: time-ordered, 'alt' lanes alternate, hp scaled by difficulty
{
  const g = fresh('lord'); g.siege.callWave();
  const due = g.siege.tick(1e6), sched = schedule(level, 1);
  assert.equal(due.length, sched.length);
  assert.deepEqual(due.map(s => s.type), sched.map(s => s.type));
  assert.deepEqual(due.map(s => s.hpScale), sched.map(s => s.hp * DIFFICULTIES.lord.hp));
  const alt = level.waves.flatMap(w => w.groups).find(gr => gr.lane === 'alt' && gr.count > 1);
  assert.ok(alt, 'table has an alt group');
  assert.ok(new Set(schedule(level, level.waves.findIndex(w => w.groups.includes(alt)) + 1).filter(s => s.type === alt.type).map(s => s.lane)).size > 1);
}

// clear: only when the schedule is drained and the field is empty; pays the bonus and starts the countdown
{
  const g = fresh(); g.siege.callWave();
  const due = g.siege.tick(1e6);
  assert.equal(g.state.phase, 'wave', 'foes just spawned are not on the field yet');
  g.state.enemies.push(...due.map(s => ({ lane: s.lane, bounty: 0 })));
  g.siege.tick(.1);
  assert.equal(g.state.phase, 'wave', 'foes still on the field');
  g.state.enemies.length = 0;
  const gold = g.state.gold;
  g.siege.tick(.1);
  assert.equal(g.state.phase, 'build');
  assert.equal(g.state.gold, gold + clearBonus(1));
  assert.equal(g.siege.countdown, BUILD_COUNTDOWN);
  // countdown running out calls the next wave
  g.siege.tick(BUILD_COUNTDOWN);
  assert.deepEqual([g.state.phase, g.state.wave], ['wave', 2]);
}

// a leak that empties the keep loses the siege, not clears the wave; later leaks cost nothing
{
  const g = fresh('lord');
  while (g.state.phase === 'build') { g.siege.callWave(); march(g, () => 'leak'); }
  assert.equal(g.state.phase, 'lost');
  assert.equal(g.state.lives, 0);
  assert.ok(!g.events.some(e => e[0] === 'wave:clear' && e[1].wave === g.state.wave), 'the fatal wave is not repelled');
  assert.equal(g.last('game:lost').stats.leaks.reduce((a, b) => a + b), DIFFICULTIES.lord.lives);
  assert.equal(g.siege.leaked({ lane: 0 }, 1), false);
  assert.equal(g.state.lives, 0);
}

// clearing the last wave wins; crowns by keep strength left; stats travel with the result
for (const [leaks, crowns] of [[0, 3], [4, 3], [5, 2], [11, 2], [12, 1]]) {
  const g = fresh(); let left = leaks;
  g.bus.emit('tower:build', {});
  while (g.state.phase === 'build') { g.siege.callWave(); march(g, () => left-- > 0 ? 'leak' : 'slay'); }
  assert.equal(g.state.phase, 'won', `won with ${leaks} leaks`);
  const { stats, crowns: got } = g.last('game:won');
  assert.equal(got, crowns, `${leaks} leaks → ${crowns} crowns`);
  assert.equal(stats.lives, 20 - leaks);
  assert.equal(stats.built, 1);
  assert.equal(stats.slain + leaks, level.waves.reduce((n, w, i) => n + schedule(level, i + 1).length, 0));
  assert.ok(stats.earned >= level.waves.reduce((n, w, i) => n + clearBonus(i + 1), 0) + stats.slain * 5);
}

// spend refuses when gold is short; earn refunds without counting as earned
{
  const g = fresh(), gold = g.state.gold;
  assert.equal(g.siege.spend(gold + 1), false);
  assert.equal(g.state.gold, gold);
  assert.equal(g.siege.spend(gold), true);
  assert.equal(g.state.gold, 0);
  g.siege.earn(70);
  assert.deepEqual([g.state.gold, g.siege.stats.earned], [70, 0]);
}

// skipTo starts wave n from any point of a siege
{
  const g = fresh(); g.siege.skipTo(7);
  assert.deepEqual([g.state.phase, g.state.wave], ['wave', 7]);
}

console.log('siege: all checks passed');
