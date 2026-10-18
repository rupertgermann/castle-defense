// The siege: phase, waves, build countdown, horn, gold, keep strength, win/lose, crowns.
// The only writer of state.phase / wave / gold / lives / maxLives. Imports nothing that loads the scene, so it runs in Node.
import { schedule, clearBonus, EARLY_GOLD_PER_SEC, BUILD_COUNTDOWN } from './waves.js';

export const STARTING_GOLD = 250;
export const DIFFICULTIES = {
  squire: { name: 'Squire', icon: 'shield', desc: 'A forgiving siege for new commanders.', lives: 30, gold: 1.25, hp: .8 },
  knight: { name: 'Knight', icon: 'swords', desc: 'The siege as the chroniclers tell it.', lives: 20, gold: 1, hp: 1 },
  lord: { name: 'Lord', icon: 'crown', desc: 'Few walls. Fewer coins. Fearsome foes.', lives: 10, gold: .85, hp: 1.3 },
};

// Crowns for a won siege, by keep strength left.
export const crownsFor = (lives, maxLives) => lives >= maxLives * .8 ? 3 : lives >= maxLives * .45 ? 2 : 1;

// state: the shared game state (reads state.enemies for live foes). bus: { on, emit }.
// Emits 'wave:start' {wave, earlyBonus}, 'wave:clear' {wave, bonus}, 'game:won' {stats, crowns}, 'game:lost' {stats}.
export function createSiege({ state, bus }) {
  let diff = DIFFICULTIES.knight, level = null, countdown = null, sched = [], si = 0, waveT = 0, stats = null;
  const playing = () => state.phase === 'build' || state.phase === 'wave';
  bus.on('tower:build', () => { if (stats) stats.built++; });

  function earn(n, counted) { state.gold += n; if (counted) stats.earned += n; }

  function clear() {
    const n = state.wave, bonus = clearBonus(n);
    earn(bonus, true);
    bus.emit('wave:clear', { wave: n, bonus });
    if (n >= level.waves.length) return end(true);
    state.phase = 'build'; countdown = BUILD_COUNTDOWN;
  }

  function end(won) {
    if (!playing()) return;
    state.phase = won ? 'won' : 'lost';
    const result = { ...stats, leaks: [...stats.leaks], lives: state.lives };
    bus.emit(won ? 'game:won' : 'game:lost', won ? { stats: result, crowns: crownsFor(state.lives, state.maxLives) } : { stats: result });
  }

  function callWave() {
    if (state.phase !== 'build' || state.wave >= level.waves.length) return false;
    const earlyBonus = countdown ? Math.round(countdown * EARLY_GOLD_PER_SEC) : 0;
    if (earlyBonus) earn(earlyBonus, true);
    state.wave++; state.phase = 'wave'; countdown = null;
    sched = schedule(level, state.wave); si = 0; waveT = 0;
    bus.emit('wave:start', { wave: state.wave, earlyBonus });
    return true;
  }

  return {
    // level: { waves, laneCount, hp } (see waves.js).
    start(difficulty, lvl) {
      if (state.phase !== 'title') return false;
      diff = DIFFICULTIES[difficulty]; level = lvl;
      state.gold = Math.round(STARTING_GOLD * diff.gold); state.lives = state.maxLives = diff.lives; state.wave = 0; state.phase = 'build';
      countdown = null; sched = []; si = 0;
      stats = { slain: 0, earned: 0, built: 0, leaks: Array(lvl.laneCount).fill(0) };
      return true;
    },
    callWave,
    // Advances game time; returns the foes due to march now: [{ type, lane, hpScale }].
    tick(dt) {
      const due = [];
      if (state.phase === 'wave') {
        waveT += dt;
        while (si < sched.length && sched[si].t <= waveT) { const s = sched[si++]; due.push({ type: s.type, lane: s.lane, hpScale: s.hp * diff.hp }); }
        if (!due.length && si >= sched.length && state.enemies.length === 0) clear();   // foes just returned are not on the field yet
      } else if (state.phase === 'build' && countdown != null && (countdown -= dt) <= 0) callWave();
      return due;
    },
    slain(enemy) {
      earn(enemy.bounty, !!stats);
      if (stats) stats.slain++;
    },
    // Returns true if the leak cost keep strength (only while a wave marches; stragglers after a fall just walk in).
    leaked(enemy, damage) {
      if (state.phase !== 'wave') return false;
      state.lives = Math.max(0, state.lives - damage);
      stats.leaks[enemy.lane]++;
      if (state.lives <= 0) end(false);
      return true;
    },
    spend(cost) { if (state.gold < cost) return false; state.gold -= cost; return true; },
    earn: n => earn(n, false),
    skipTo(n) { if (!playing()) return; state.phase = 'build'; state.wave = Math.min(Math.max(n, 1), level.waves.length) - 1; countdown = null; callWave(); },
    end,
    get countdown() { return countdown; },
    get pending() { return sched.slice(si); },   // foes still to march this wave
    get waveSize() { return sched.length; },
    get stats() { return stats; },
  };
}
