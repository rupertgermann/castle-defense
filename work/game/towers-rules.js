// Tower rules: build, upgrade and sell, targeting, turning, leading, projectile flight, impacts and fire pools.
// Imports nothing that loads the scene, so it runs in Node (`node work/towers-test.mjs`); towers.js is the view.
import { Vector3 } from 'three';

// turn: radians per second the weapon swings toward its target.
export const TOWER_TYPES = {
  archer: {
    name: 'Archer Tower', damageType: 'pierce', projectile: 'arrow', turn: 7,
    description: 'Timber-crowned watchtower. Fast, reliable arrows against single targets.',
    levels: [
      { cost: 70, damage: 14, range: 17, rate: 1.2 },
      { cost: 95, damage: 20, range: 19, rate: 1.6 },
      { cost: 135, damage: 26, range: 21, rate: 2.2 },
    ],
  },
  cannon: {
    name: 'Bombard Tower', damageType: 'blast', projectile: 'cannonball', turn: 2.2,
    description: 'Stout stone drum with a bronze cannon. Slow, heavy shots that blast groups.',
    levels: [
      { cost: 120, damage: 34, range: 16, rate: .5, splash: 3.2 },
      { cost: 165, damage: 55, range: 17.5, rate: .55, splash: 3.8 },
      { cost: 220, damage: 85, range: 19, rate: .6, splash: 4.5 },
    ],
  },
  mage: {
    name: 'Arcane Spire', damageType: 'magic', projectile: 'arcane', turn: 99,
    description: 'A focusing crystal hurls seeking arcane bolts that ignore armour and slow the foe.',
    levels: [
      { cost: 100, damage: 12, range: 16, rate: 1.0, slow: { factor: .6, duration: 1.6 } },
      { cost: 135, damage: 19, range: 18, rate: 1.15, slow: { factor: .5, duration: 2.0 } },
      { cost: 185, damage: 28, range: 20, rate: 1.3, slow: { factor: .4, duration: 2.4 } },
    ],
  },
  ballista: {
    name: 'Ballista', damageType: 'pierce', projectile: 'bolt', turn: 3,
    description: 'Siege bolt thrower. Long range, massive single-target damage that punches through armour.',
    levels: [
      { cost: 150, damage: 80, range: 24, rate: .42, armorPierce: .6 },
      { cost: 190, damage: 125, range: 27, rate: .48, armorPierce: .7 },
      { cost: 260, damage: 190, range: 30, rate: .55, armorPierce: .8 },
    ],
  },
  // Area denial: pots shatter into burning pitch that hurts everything walking through it. Fire ignores armour;
  // overlapping pools don't stack (each foe burns from the hottest pool it stands in).
  cauldron: {
    name: 'Pitch Cauldron', damageType: 'fire', projectile: 'firepot', turn: 2.4,
    description: 'A mangonel lobs pots of burning pitch. They leave pools of fire on the road that scorch every foe that crosses.',
    levels: [
      { cost: 110, damage: 10, range: 15, rate: .38, burn: { dps: 16, radius: 3, duration: 4 } },
      { cost: 150, damage: 16, range: 16.5, rate: .42, burn: { dps: 25, radius: 3.5, duration: 4.5 } },
      { cost: 210, damage: 24, range: 18, rate: .46, burn: { dps: 38, radius: 4.2, duration: 5 } },
    ],
  },
  // Long-range siege: the biggest splash in the game, but the arm can't drop a stone at the foot of its own bastion.
  trebuchet: {
    name: 'Trebuchet', damageType: 'blast', projectile: 'boulder', turn: 1.1,
    description: 'A counterweight engine that hurls boulders across the field, crushing whole ranks. It cannot strike foes close to its own walls.',
    levels: [
      { cost: 170, damage: 70, range: 34, minRange: 11, rate: .25, splash: 4.6 },
      { cost: 215, damage: 115, range: 37, minRange: 11, rate: .28, splash: 5.3 },
      { cost: 290, damage: 175, range: 40, minRange: 11, rate: .31, splash: 6.2 },
    ],
  },
};

// flight(d): seconds in the air over d metres. gravity: m/s² (the homing arcane bolt has none).
// roadAim: lobbed shots (bombard, pitch, trebuchet) predict along the road itself, so curves and the gate don't throw them off.
// release: seconds between firing and the projectile leaving (the trebuchet's arm swing).
const PROJECTILES = {
  arrow:      { flight: d => .22 + d / 42, gravity: 22, roadAim: false, release: 0 },
  cannonball: { flight: d => .5 + d / 26,  gravity: 20, roadAim: true,  release: 0 },
  bolt:       { flight: d => .05 + d / 85, gravity: 4,  roadAim: false, release: 0 },
  arcane:     { flight: d => d / 20,       gravity: 0,  roadAim: false, release: 0 },
  firepot:    { flight: d => .8 + d / 22,  gravity: 22, roadAim: true,  release: 0 },
  boulder:    { flight: d => 1.5 + d / 24, gravity: 20, roadAim: true,  release: .3 },
};
const BURN_TICK = .25;

export const angleDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
export const ballisticVelocity = (from, to, T, g, out) => out.subVectors(to, from).divideScalar(T).setY((to.y - from.y + .5 * g * T * T) / T);
export const aimHeight = e => (e.height || 1.6) * .6;   // a foe is aimed at 60% of its height
export const aimPoint = (e, out) => out.copy(e.pos).setY(e.pos.y + aimHeight(e));
const flatDist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const stat = tower => TOWER_TYPES[tower.typeId].levels[tower.level];
export const upgradeCost = tower => TOWER_TYPES[tower.typeId].levels[tower.level + 1]?.cost ?? null;
export const sellValue = tower => Math.floor(tower.spent * .7);

// state: shared game state (state.towers). bus: { on, emit }. siege: spend/earn.
// host: { foes(), damage(e, n, opts) → killed, inRadius(pos, r), distAfter(e, T) → road distance after T s }.
// lanes: [{ length, pointAt(d, out) }]. muzzle(tower, out): where shots leave. groundY(x, z).
export function createTowerRules({ state, bus, siege, host, lanes, muzzle, groundY }) {
  let nextId = 1;
  function build(pad, typeId, { free = false } = {}) {
    const type = TOWER_TYPES[typeId];
    if (!pad || pad.tower || !type) return null;
    const cost = type.levels[0].cost;
    if (!free && !siege.spend(cost)) return null;
    const tower = { id: nextId++, typeId, level: 0, pad, pos: pad.pos.clone(), range: type.levels[0].range, target: null, kills: 0, spent: cost, cooldown: .4, yaw: pad.yaw, sold: false };
    pad.tower = tower; state.towers.push(tower);
    bus.emit('tower:build', { tower });
    return tower;
  }
  function upgrade(tower, { free = false } = {}) {
    const cost = upgradeCost(tower);
    if (cost == null || tower.sold || (!free && !siege.spend(cost))) return false;
    tower.spent += cost; tower.level++; tower.range = TOWER_TYPES[tower.typeId].levels[tower.level].range;
    bus.emit('tower:upgrade', { tower });
    return true;
  }
  function sell(tower) {
    if (tower.sold) return;
    siege.earn(sellValue(tower));
    tower.sold = true; tower.target = null; tower.pad.tower = null;
    const i = state.towers.indexOf(tower); if (i >= 0) state.towers.splice(i, 1);
    bus.emit('tower:sell', { tower, pos: tower.pos.clone() });
  }

  // ---- targeting ----
  const tmp = new Vector3(), aim = new Vector3(), from = new Vector3();
  const remaining = e => (lanes[e.lane]?.length || 0) - (e.dist || 0);
  function onRoad(e, T, out) {
    const l = lanes[e.lane];
    if (!l) { aimPoint(e, out); return e.velocity ? out.addScaledVector(e.velocity, T) : out; }
    l.pointAt(Math.min(l.length, host.distAfter(e, T)), out);
    return out.setY(out.y + aimHeight(e));
  }
  function inRange(tower, e) {
    const d = flatDist(e.pos, tower.pos), s = stat(tower);
    if (!e.alive || d > tower.range || d < (s.minRange || 0)) return false;
    if (!s.minRange) return true;
    // engines with a dead zone only commit to a target whose landing point is still outside it, and short of the gate
    const { flight, release } = PROJECTILES[TOWER_TYPES[tower.typeId].projectile], T = flight(d) + release, l = lanes[e.lane];
    if (l && host.distAfter(e, T) > l.length - 2) return false;
    const landDist = flatDist(onRoad(e, T, tmp), tower.pos);
    return landDist >= s.minRange && landDist <= tower.range + 2;
  }
  function acquire(tower) {
    let best = null, bestR = Infinity;
    for (const e of host.foes()) if (inRange(tower, e)) { const r = remaining(e); if (r < bestR) { bestR = r; best = e; } }
    return best;
  }
  // Predict where the target's aim point will be when a projectile of flight time f(dist) arrives; returns that time.
  function lead(from, e, kind, out) {
    const { flight, release, roadAim } = PROJECTILES[kind];
    aimPoint(e, out);
    let T = flight(from.distanceTo(out));
    for (let k = 0; k < 2; k++) {
      if (roadAim) onRoad(e, T + release, out); else { aimPoint(e, out); if (e.velocity) out.addScaledVector(e.velocity, T); }
      T = flight(from.distanceTo(out));
    }
    return T;
  }
  // Where the next shot leaves (from) and lands (to); returns its flight time. Lobbed shots land on the road, not at chest height.
  function aimShot(tower, e, from, to) {
    const kind = TOWER_TYPES[tower.typeId].projectile, T = lead(muzzle(tower, from), e, kind, to);
    if (PROJECTILES[kind].roadAim) to.y -= aimHeight(e);
    return T;
  }
  // The velocity a ballistic shot at e would leave with now (towers.js lifts the bombard barrel to it).
  const arcFrom = new Vector3(), arcTo = new Vector3();
  function arcVelocity(tower, e, out) {
    const T = aimShot(tower, e, arcFrom, arcTo);
    return ballisticVelocity(arcFrom, arcTo, T, PROJECTILES[TOWER_TYPES[tower.typeId].projectile].gravity, out);
  }
  function aimTower(tower, dt) {
    if (!tower.target || !inRange(tower, tower.target)) tower.target = acquire(tower);
    const e = tower.target;
    tower.cooldown -= dt;
    let aligned = true;
    if (e) {
      lead(muzzle(tower, from), e, TOWER_TYPES[tower.typeId].projectile, aim);
      const want = Math.atan2(aim.x - tower.pos.x, aim.z - tower.pos.z), step = TOWER_TYPES[tower.typeId].turn * dt;
      tower.yaw += Math.max(-step, Math.min(step, angleDiff(tower.yaw, want)));
      aligned = Math.abs(angleDiff(tower.yaw, want)) < .12;
    }
    if (e && aligned && tower.cooldown <= 0) { fire(tower, e); tower.cooldown = 1 / stat(tower).rate; }
    if (tower.cooldown < 0 && !e) tower.cooldown = Math.max(tower.cooldown, -.2);
  }

  // ---- projectiles ----
  const projectiles = [];
  function fire(tower, target) {
    const type = TOWER_TYPES[tower.typeId], kind = type.projectile, from = new Vector3(), to = new Vector3(), T = aimShot(tower, target, from, to);
    // stats: the level's stats when fired (damage, splash?, slow?, armorPierce?, burn?)
    const p = { kind, damageType: type.damageType, stats: stat(tower), tower, target, from, to, T, t: 0, pos: from.clone(), prev: from.clone(), vel: new Vector3(), wait: PROJECTILES[kind].release };
    if (kind === 'arcane') { p.vel.subVectors(to, from).normalize().multiplyScalar(9).y += 7; p.T = 3.5; p.wob = Math.random() * 6; }
    else ballisticVelocity(from, to, T, PROJECTILES[kind].gravity, p.vel);
    p.v0 = p.vel.clone();
    projectiles.push(p);
    bus.emit('tower:fire', { tower, from: from.clone(), target, projectile: kind });
  }
  function fly(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      if (p.wait > 0) { p.wait -= dt; continue; }
      p.t += dt; p.prev.copy(p.pos);
      let done = false;
      if (p.kind === 'arcane') {   // homing: speeds up and bends harder the longer it flies
        const alive = p.target && p.target.alive;
        if (alive) aimPoint(p.target, p.to);
        tmp.subVectors(p.to, p.pos); const d = tmp.length();
        tmp.divideScalar(Math.max(d, 1e-3)).multiplyScalar(17 + p.t * 16);
        p.vel.lerp(tmp, 1 - Math.exp(-dt * (4 + p.t * 8)));
        p.pos.addScaledVector(p.vel, dt);
        p.pos.y += Math.sin(p.t * 14 + p.wob) * dt * 1.2;
        if (d < .5 + (alive ? p.target.radius || .5 : 0) * .6 || p.t > p.T || (!alive && d < .6)) done = true;
      } else {
        const g = PROJECTILES[p.kind].gravity, t = Math.min(p.t, p.T);
        p.pos.copy(p.from).addScaledVector(p.v0, t); p.pos.y -= .5 * g * t * t;
        // arrows and bolts steer onto the live target so leading errors never read as misses
        if ((p.kind === 'arrow' || p.kind === 'bolt') && p.target && p.target.alive) { aimPoint(p.target, tmp); tmp.sub(p.to); p.pos.addScaledVector(tmp, (t / p.T) ** 2); }
        if (p.t >= p.T) done = true;
      }
      p.vel.subVectors(p.pos, p.prev);
      if (done) { impact(p); projectiles.splice(i, 1); }
    }
  }

  // ---- impacts and fire pools ----
  // A fire pool reaches a foe whose centre is within radius + half its own radius, for the first splash and every tick alike.
  const pools = [];
  let burnClock = 0;
  const inPool = (e, pos, r) => flatDist(e.pos, pos) <= r + (e.radius || .5) * .5;
  function impact(p) {
    const tower = p.tower, pos = p.pos.clone(), { damage, splash, slow = null, armorPierce = 0, burn } = p.stats;
    const opts = { type: p.damageType, armorPierce, slow };
    const hit = (e, n) => { if (host.damage(e, n, opts) && !tower.sold) tower.kills++; };
    let radius = .6;
    if (burn) {
      radius = burn.radius;
      pos.y = groundY(pos.x, pos.z);
      for (const e of host.foes().filter(e => inPool(e, pos, burn.radius))) hit(e, damage);
      pools.push({ pos, radius: burn.radius, dps: burn.dps, t: 0, dur: burn.duration, tower });
      bus.emit('projectile:impact', { pos, projectile: p.kind, radius, target: p.target, duration: burn.duration });
      return;
    }
    if (splash) {   // full damage at the centre, half at the edge
      radius = splash;
      pos.y = Math.max(pos.y, groundY(pos.x, pos.z));
      for (const e of host.inRadius(pos, splash)) hit(e, damage * (1 - .5 * Math.min(1, flatDist(e.pos, pos) / splash)));
    } else if (p.target && p.target.alive) hit(p.target, damage);
    else if (p.kind !== 'arcane') pos.y = Math.max(groundY(pos.x, pos.z), pos.y);
    bus.emit('projectile:impact', { pos, projectile: p.kind, radius, target: p.target });
  }
  // Damage ticks four times a second; each foe burns from the hottest pool it stands in.
  function burn(dt) {
    for (let i = pools.length - 1; i >= 0; i--) if ((pools[i].t += dt) >= pools[i].dur) pools.splice(i, 1);
    if (!pools.length || (burnClock += dt) < BURN_TICK) return;
    burnClock -= BURN_TICK;
    for (const e of host.foes().slice()) {
      let best = null;
      for (const pool of pools) if ((!best || pool.dps > best.dps) && inPool(e, pool.pos, pool.radius)) best = pool;
      if (best && host.damage(e, best.dps * BURN_TICK, { type: 'fire' }) && !best.tower.sold) best.tower.kills++;
    }
  }

  return {
    build, upgrade, sell, lead, arcVelocity, projectiles, pools,
    // busy(tower): true while the view still raises or rebuilds it (no aiming, no cooldown).
    update(dt, busy = () => false) {
      for (const t of state.towers) if (!busy(t)) aimTower(t, dt);
      fly(dt); burn(dt);
    },
  };
}
