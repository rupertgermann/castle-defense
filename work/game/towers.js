// Towers: build pads, five tower types with three levels, targeting, projectiles and damage.
import { THREE, scene, camera, renderer, composer, height, clearTrees, bridgeDeck, padSpots } from '../scene.js';
import { state, bus, lanes } from './core.js';
import { damageEnemy, enemiesInRadius, ENEMY_TYPES } from './enemies.js';
import { instantiate, ghost, scaffold, padGeometry, runeTexture, projectileGeometries, poseArcher, poseBallista, glowTexture, renderArchers, liveArchers, MANGONEL, TREBUCHET } from './towers-models.js';

export const TOWER_TYPES = {
  archer: {
    name: 'Archer Tower', damageType: 'pierce', projectile: 'arrow',
    description: 'Timber-crowned watchtower. Fast, reliable arrows against single targets.',
    levels: [
      { cost: 70, damage: 14, range: 17, rate: 1.2 },
      { cost: 95, damage: 20, range: 19, rate: 1.6 },
      { cost: 135, damage: 26, range: 21, rate: 2.2 },
    ],
  },
  cannon: {
    name: 'Bombard Tower', damageType: 'blast', projectile: 'cannonball',
    description: 'Stout stone drum with a bronze cannon. Slow, heavy shots that blast groups.',
    levels: [
      { cost: 120, damage: 34, range: 16, rate: .5, splash: 3.2 },
      { cost: 165, damage: 55, range: 17.5, rate: .55, splash: 3.8 },
      { cost: 220, damage: 85, range: 19, rate: .6, splash: 4.5 },
    ],
  },
  mage: {
    name: 'Arcane Spire', damageType: 'magic', projectile: 'arcane',
    description: 'A focusing crystal hurls seeking arcane bolts that ignore armour and slow the foe.',
    levels: [
      { cost: 100, damage: 12, range: 16, rate: 1.0, slow: { factor: .6, duration: 1.6 } },
      { cost: 135, damage: 19, range: 18, rate: 1.15, slow: { factor: .5, duration: 2.0 } },
      { cost: 185, damage: 28, range: 20, rate: 1.3, slow: { factor: .4, duration: 2.4 } },
    ],
  },
  ballista: {
    name: 'Ballista', damageType: 'pierce', projectile: 'bolt',
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
    name: 'Pitch Cauldron', damageType: 'fire', projectile: 'firepot',
    description: 'A mangonel lobs pots of burning pitch. They leave pools of fire on the road that scorch every foe that crosses.',
    levels: [
      { cost: 110, damage: 10, range: 15, rate: .38, burn: { dps: 16, radius: 3, duration: 4 } },
      { cost: 150, damage: 16, range: 16.5, rate: .42, burn: { dps: 25, radius: 3.5, duration: 4.5 } },
      { cost: 210, damage: 24, range: 18, rate: .46, burn: { dps: 38, radius: 4.2, duration: 5 } },
    ],
  },
  // Long-range siege: the biggest splash in the game, but the arm can't drop a stone at the foot of its own bastion.
  trebuchet: {
    name: 'Trebuchet', damageType: 'blast', projectile: 'boulder',
    description: 'A counterweight engine that hurls boulders across the field, crushing whole ranks. It cannot strike foes close to its own walls.',
    levels: [
      { cost: 170, damage: 70, range: 34, minRange: 11, rate: .25, splash: 4.6 },
      { cost: 215, damage: 115, range: 37, minRange: 11, rate: .28, splash: 5.3 },
      { cost: 290, damage: 175, range: 40, minRange: 11, rate: .31, splash: 6.2 },
    ],
  },
};

const PAD_SPOTS = padSpots;
export const pads = [];

const groundY = (x, z) => {
  const b = bridgeDeck;
  if (x > b.x0 - 1 && x < b.x1 + 1 && Math.abs(z - b.z) < b.halfWidth + 1.2) return b.y;
  return Math.max(height(x, z), .85);
};
function nearestLanePoint(x, z) {
  let best = Infinity, out = null; const v = new THREE.Vector3();
  for (const lane of lanes) for (let d = 0; d <= lane.length; d += 1) { lane.pointAt(d, v); const k = Math.hypot(v.x - x, v.z - z); if (k < best) { best = k; out = v.clone(); } }
  return out;
}

let padRoot, hitMeshes = [], projectiles, rangeRing, ghostCache = {}, currentGhost = null, highlight = { sel: null, preview: null, key: '' };
let nextTowerId = 1;
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);

export function init() {
  const hitGeo = new THREE.CylinderGeometry(4, 4, 1, 12).translate(0, .5, 0);
  PAD_SPOTS.forEach(([x, z], i) => {
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k < 17; k++) { const r = k ? (k > 8 ? 4.2 : 2.4) : 0, a = k * Math.PI / 4; const h = height(x + Math.cos(a) * r, z + Math.sin(a) * r); lo = Math.min(lo, h); hi = Math.max(hi, h); }
    const lp = nearestLanePoint(x, z), yaw = Math.atan2(lp.x - x, lp.z - z);
    const s = Math.sin(yaw), c = Math.cos(yaw);
    const pad = { id: i, pos: new THREE.Vector3(x, hi + .25, z), tower: null, yaw, low: lo, ground: height(x - s * 4.4, z - c * 4.4) };
    clearTrees(x, z, 7.5);
    const hit = new THREE.Mesh(hitGeo); hit.position.copy(pad.pos); hit.scale.y = 1.4; hit.updateMatrixWorld(); hit.userData.pad = pad;
    hitMeshes.push(hit);
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 7.4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: runeTexture(), color: '#ffc978', transparent: true, opacity: .22, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    ring.position.copy(pad.pos).y += .03; ring.renderOrder = 2; scene.add(ring);
    pad._ = { hit, ring, glow: 0, glowTarget: .32 };
    pads.push(pad);
  });
  padRoot = padGeometry(pads); scene.add(padRoot);
  projectiles = makeProjectiles();
  rangeRing = makeRangeRing();
  renderer.shadowMap.needsUpdate = true;
  excludeOverlaysFromAO();
}

// GTAO renders every mesh into its normal/depth buffer, so glows, rings and ghosts would cast dark AO boxes.
// Hide transparent, non-depth-writing objects during that pass (benefits every module's overlays).
function excludeOverlaysFromAO() {
  const ao = composer.passes.find(p => p._overrideVisibility);
  if (!ao || ao._overlayPatched) return;
  const original = ao._overrideVisibility.bind(ao);
  ao._overlayPatched = true;
  ao._overrideVisibility = function () {
    original();
    scene.traverseVisible(o => { const m = o.material; if (m && m.transparent && !m.depthWrite && o.visible) { o.visible = false; this._visibilityCache.push(o); } });
  };
}

// ---------------- API ----------------
const stat = t => TOWER_TYPES[t.typeId].levels[t.level];
export function buildTower(pad, typeId, { instant = false, free = false } = {}) {
  const type = TOWER_TYPES[typeId];
  if (!pad || pad.tower || !type) return null;
  const cost = type.levels[0].cost;
  if (!free) { if (state.gold < cost) return null; state.gold -= cost; }
  const tower = { id: nextTowerId++, typeId, level: 0, pad, pos: pad.pos.clone(), range: type.levels[0].range, target: null, kills: 0, spent: cost };
  tower._ = { cooldown: .4, yaw: pad.yaw, pitch: .3, shooter: 0, recoil: 0, flare: 0, draw: 1, anim: null, model: null, t: Math.random() * 10 };
  setModel(tower);
  pad.tower = tower; state.towers.push(tower);
  pad._.hit.scale.y = tower._.model.height;
  pad._.hit.updateMatrixWorld();
  if (instant) finishAnim(tower); else startAnim(tower, 'build', 1.9);
  bus.emit('tower:build', { tower });
  return tower;
}
export function upgradeCost(tower) {
  const lv = TOWER_TYPES[tower.typeId].levels[tower.level + 1];
  return lv ? lv.cost : null;
}
export function upgradeTower(tower, { instant = false, free = false } = {}) {
  const cost = upgradeCost(tower);
  if (cost == null || tower._.dead) return false;
  if (!free) { if (state.gold < cost) return false; state.gold -= cost; }
  tower.spent += cost;
  if (tower._.anim) finishAnim(tower);
  const old = tower._.model;
  tower.level++; tower.range = stat(tower).range;
  setModel(tower);
  tower.pad._.hit.scale.y = tower._.model.height; tower.pad._.hit.updateMatrixWorld();
  if (instant) { disposeModel(old); finishAnim(tower); } else startAnim(tower, 'upgrade', 1.5, old);
  bus.emit('tower:upgrade', { tower });
  return true;
}
export function sellValue(tower) { return Math.floor(tower.spent * .7); }
export function sellTower(tower) {
  if (tower._.dead) return;
  state.gold += sellValue(tower);
  tower._.dead = true; tower.target = null;
  const i = state.towers.indexOf(tower); if (i >= 0) state.towers.splice(i, 1);
  tower.pad.tower = null; tower.pad._.hit.scale.y = 1.4; tower.pad._.hit.updateMatrixWorld();
  if (tower._.anim) finishAnim(tower);
  startAnim(tower, 'sell', 1.2);
  sinking.push(tower);
  bus.emit('tower:sell', { tower, pos: tower.pos.clone() });
}
export function pick(raycaster) {
  const hit = raycaster.intersectObjects(hitMeshes, false)[0];
  if (!hit) return null;
  const pad = hit.object.userData.pad;
  return pad.tower ? { kind: 'tower', tower: pad.tower } : { kind: 'pad', pad };
}
export function setHighlight(selection, previewTypeId) {
  highlight.sel = selection || null; highlight.preview = previewTypeId || null;
  for (const p of pads) p._.glowTarget = .32;
  if (currentGhost) { currentGhost.root.visible = false; currentGhost = null; }
  rangeRing.visible = false;
  if (!selection) return;
  const pad = selection.kind === 'pad' ? selection.pad : selection.tower.pad;
  pad._.glowTarget = selection.kind === 'tower' ? .9 : .75;
  let lv = null, color = '#ffd38a';
  if (selection.kind === 'tower') {
    const t = selection.tower; lv = stat(t);
    if (previewTypeId && upgradeCost(t) != null) { lv = TOWER_TYPES[t.typeId].levels[t.level + 1]; showGhost(t.typeId, t.level + 1, pad); color = '#bfe0ff'; }
  } else if (previewTypeId && TOWER_TYPES[previewTypeId]) {
    lv = TOWER_TYPES[previewTypeId].levels[0]; showGhost(previewTypeId, 0, pad); color = '#bfe0ff';
  }
  if (lv) showRange(pad.pos, lv.range, color, lv.minRange);
}

// ---------------- models & animation ----------------
function setModel(tower) {
  const m = instantiate(tower.typeId, tower.level);
  m.root.position.copy(tower.pos); m.root.rotation.y = tower.pad.yaw;
  scene.add(m.root); tower._.model = m;
}
function disposeModel(m) { m.root.removeFromParent(); if (m.archers) for (const f of m.archers) liveArchers.delete(f); }
function startAnim(tower, kind, dur, old = null) {
  const m = tower._.model, sc = scaffold(m.hw, m.height * .8);
  sc.position.copy(tower.pos); sc.rotation.y = tower.pad.yaw; sc.scale.y = .001;
  if (kind !== 'sell') scene.add(sc);
  tower._.anim = { kind, t: 0, dur, old, sc };
}
function finishAnim(tower) {
  const a = tower._.anim;
  if (a) { a.sc.removeFromParent(); if (a.old) disposeModel(a.old); }
  tower._.anim = null;
  const r = tower._.model.root; r.position.copy(tower.pos); r.rotation.set(0, tower.pad.yaw, 0); r.scale.set(1, 1, 1);
  if (tower._.dead) disposeModel(tower._.model);
  renderer.shadowMap.needsUpdate = true;
}
const ease = t => 1 - Math.pow(1 - t, 3);
function animate(tower, dt) {
  const a = tower._.anim, m = tower._.model, root = m.root;
  a.t += dt; const u = Math.min(1, a.t / a.dur);
  if (a.kind === 'build' || a.kind === 'upgrade') {
    // scaffold pops up, tower rises through its foundation inside it, scaffold drops away
    const scUp = Math.min(1, a.t / .3), scDown = Math.max(0, (a.t - (a.dur - .35)) / .35);
    a.sc.scale.y = Math.max(.001, ease(scUp) * (1 - scDown));
    const rise = ease(Math.min(1, Math.max(0, (a.t - .2) / (a.dur - .55))));
    const sink = a.kind === 'upgrade' ? m.height * .55 : m.height;
    root.position.y = tower.pos.y - sink * (1 - rise);
    root.rotation.z = Math.sin(a.t * 31) * .004 * (1 - rise);
    if (a.old) { a.old.root.position.y = tower.pos.y - Math.min(1, a.t / .35) * a.old.height * .5; if (a.t > .35) a.old.root.visible = false; }
  } else {
    root.position.y = tower.pos.y - m.height * 1.05 * u * u;
    root.rotation.z = Math.sin(a.t * 27) * .02 * (1 - u) + u * .06;
  }
  if (u >= 1) finishAnim(tower);
}
const sinking = [];

// ---------------- highlight visuals ----------------
function showGhost(type, level, pad) {
  const key = type + level;
  const g = ghostCache[key] || (ghostCache[key] = ghost(type, level));
  if (!g.root.parent) scene.add(g.root);
  g.root.position.copy(pad.pos); g.root.rotation.y = pad.yaw; g.root.visible = true;
  currentGhost = g;
}
function makeRangeRing() {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6,
    uniforms: { color: { value: new THREE.Color('#ffd38a') }, time: { value: 0 }, opacity: { value: 1 }, inner: { value: 0 } },
    vertexShader: 'attribute float rr; attribute float aa; varying float vR; varying float vA; void main(){ vR=rr; vA=aa; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform vec3 color; uniform float time, opacity, inner; varying float vR; varying float vA;
      void main(){
        float edge = smoothstep(.955,.982,vR) * (1. - smoothstep(.992,1.,vR));
        float ticks = step(.55, fract(vA * 40. / 6.2831853 - time * .15)) * smoothstep(.925,.935,vR) * (1. - smoothstep(.95,.958,vR));
        float fill = .03 + .06 * smoothstep(.4, .97, vR);
        vec3 c = color * (1. + edge * .6); float a = edge * .9 + ticks * .5 + fill;
        if (inner > 0.) {   // dead zone: a dashed red rim and a faint red wash the engine can't reach
          float rim = smoothstep(inner - .025, inner - .008, vR) * (1. - smoothstep(inner - .008, inner, vR)) * step(.5, fract(vA * 24. / 6.2831853));
          float dead = 1. - smoothstep(inner - .01, inner, vR);
          c = mix(c, vec3(1., .35, .25), max(rim, dead)); a = mix(a, .1, dead) + rim * .8;
        }
        gl_FragColor = vec4(c, a * opacity);
      }`,
  });
  const m = new THREE.Mesh(new THREE.BufferGeometry(), mat); m.visible = false; m.renderOrder = 3; m.frustumCulled = false; scene.add(m);
  return m;
}
function showRange(center, range, color, minRange = 0) {
  const key = center.x + ',' + center.z + ',' + range;
  rangeRing.material.uniforms.color.value.set(color);
  rangeRing.material.uniforms.inner.value = minRange / range;
  rangeRing.visible = true;
  if (rangeRing.userData.key === key) return;
  rangeRing.userData.key = key;
  const A = 160, R = 18, pos = [], rr = [], aa = [], idx = [];
  for (let j = 0; j <= R; j++) {
    const f = j < R - 4 ? j / (R - 4) * .9 : .9 + (j - (R - 4)) / 4 * .1;
    for (let i = 0; i <= A; i++) {
      const a = i / A * Math.PI * 2, x = center.x + Math.cos(a) * range * f, z = center.z + Math.sin(a) * range * f;
      pos.push(x, groundY(x, z) + .35, z); rr.push(f); aa.push(a);
    }
  }
  for (let j = 0; j < R; j++) for (let i = 0; i < A; i++) { const a = j * (A + 1) + i, b = a + A + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  const g = rangeRing.geometry; g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('rr', new THREE.Float32BufferAttribute(rr, 1)); g.setAttribute('aa', new THREE.Float32BufferAttribute(aa, 1)); g.setIndex(idx);
}

// ---------------- targeting ----------------
const laneOf = e => typeof e.lane === 'number' ? lanes[e.lane] : e.lane;
const remaining = e => { const l = laneOf(e); return (l ? l.length : 0) - (e.dist || 0); };
const aimPoint = (e, out) => out.copy(e.pos).setY(e.pos.y + (e.height || 1.6) * .6);
// Lobbed shots (bombard, pitch, trebuchet) predict along the road itself, so curves and the gate don't throw them off.
const ROAD_AIM = { cannonball: true, firepot: true, boulder: true };
const RELEASE = { boulder: .3 };   // seconds between firing and the projectile leaving (the trebuchet's arm swing)
function onRoad(e, T, out) {
  const l = laneOf(e), t = ENEMY_TYPES[e.typeId];
  if (!l || !t) { aimPoint(e, out); return e.velocity ? out.addScaledVector(e.velocity, T) : out; }
  l.pointAt(Math.min(l.length, e.dist + t.speed * (e.slowFactor || 1) * T), out);
  return out.setY(out.y + (e.height || 1.6) * .6);
}
function inRange(tower, e) {
  const d = Math.hypot(e.pos.x - tower.pos.x, e.pos.z - tower.pos.z), s = stat(tower);
  if (!e.alive || d > tower.range || d < (s.minRange || 0)) return false;
  if (!s.minRange) return true;
  // engines with a dead zone only commit to a target whose landing point is still outside it, and short of the gate
  const kind = TOWER_TYPES[tower.typeId].projectile, T = FLIGHT[kind](d) + (RELEASE[kind] || 0), l = laneOf(e), t = ENEMY_TYPES[e.typeId];
  if (l && t && e.dist + t.speed * T > l.length - 2) return false;
  onRoad(e, T, tmp3); const dl = Math.hypot(tmp3.x - tower.pos.x, tmp3.z - tower.pos.z);
  return dl >= s.minRange && dl <= tower.range + 2;
}
function acquire(tower) {
  let best = null, bestR = Infinity;
  for (const e of state.enemies) if (inRange(tower, e)) { const r = remaining(e); if (r < bestR) { bestR = r; best = e; } }
  return best;
}
// Predict where the target's aim point will be when a projectile of flight-time f(dist) arrives.
function lead(from, e, kind, out) {
  const flightTime = FLIGHT[kind], delay = RELEASE[kind] || 0;
  aimPoint(e, out);
  let T = flightTime(from.distanceTo(out));
  for (let k = 0; k < 2; k++) {
    if (ROAD_AIM[kind]) onRoad(e, T + delay, out); else { aimPoint(e, out); if (e.velocity) out.addScaledVector(e.velocity, T); }
    T = flightTime(from.distanceTo(out));
  }
  return T;
}
const tmp3 = new THREE.Vector3();
const FLIGHT = {
  arrow: d => .22 + d / 42, cannonball: d => .5 + d / 26, bolt: d => .05 + d / 85, arcane: d => d / 20, firepot: d => .8 + d / 22, boulder: d => 1.5 + d / 24,
};
const GRAV = { arrow: 22, cannonball: 20, bolt: 4, firepot: 22, boulder: 20 };
const TURN = { archer: 7, cannon: 2.2, ballista: 3, mage: 99, cauldron: 2.4, trebuchet: 1.1 };

function angleDiff(a, b) { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; }
const aimTmp = new THREE.Vector3(), fromTmp = new THREE.Vector3();

function updateTower(tower, dt) {
  const _ = tower._, m = _.model, s = stat(tower), type = TOWER_TYPES[tower.typeId];
  _.t += dt;
  if (_.anim) { animate(tower, dt); if (_.anim) { idle(tower, dt, false); return; } }
  if (!tower.target || !inRange(tower, tower.target)) tower.target = acquire(tower);
  const e = tower.target;
  _.cooldown -= dt;
  let aligned = true;
  if (e) {
    muzzleWorld(tower, fromTmp);
    const T = lead(fromTmp, e, type.projectile, aimTmp);
    const want = Math.atan2(aimTmp.x - tower.pos.x, aimTmp.z - tower.pos.z);
    const d = angleDiff(_.yaw, want), step = TURN[tower.typeId] * dt;
    _.yaw += Math.max(-step, Math.min(step, d));
    aligned = Math.abs(angleDiff(_.yaw, want)) < .12;
    if (tower.typeId === 'cannon') { const v = ballisticVelocity(fromTmp, aimTmp.setY(aimTmp.y - (e.height || 1.6) * .6), T, GRAV.cannonball, tmp2); _.pitch += (Math.atan2(v.y, Math.hypot(v.x, v.z)) - _.pitch) * Math.min(1, dt * 6); }
  }
  if (e && aligned && _.cooldown <= 0) { fire(tower, e); _.cooldown = 1 / s.rate; }
  if (_.cooldown < 0 && !e) _.cooldown = Math.max(_.cooldown, -.2);
  idle(tower, dt, !!e);
}
function muzzleWorld(tower, out) {
  const m = tower._.model;
  if (m.archers) { const f = m.archers[tower._.shooter % m.archers.length]; return f.root.localToWorld(out.set(0, 1.46, .6)); }
  if (m.muzzle) { m.root.updateMatrixWorld(); return m.muzzle.getWorldPosition(out); }
  return out.copy(tower.pos).setY(tower.pos.y + m.height);
}

// Per-frame pose of the weapons (turret yaw, bow draw, recoil, crystal pulse, ballista span).
function idle(tower, dt, engaged) {
  const _ = tower._, m = _.model, s = stat(tower), local = _.yaw - tower.pad.yaw;
  if (m.archers) {
    const n = m.archers.length, period = 1 / s.rate;
    m.archers.forEach((f, i) => {
      const k = (i - _.shooter % n + n) % n, until = _.cooldown + k * period;
      const draw = engaged ? Math.max(0, Math.min(1, 1 - (until - .05) / Math.min(.75, n * period * .8))) : Math.max(0, (f.draw || 0) - dt * 3);
      f.draw = draw;
      const want = engaged ? local + (i - (n - 1) / 2) * .04 : local + Math.sin(_.t * .3 + i * 2) * .9;
      f.root.rotation.y += angleDiff(f.root.rotation.y, want) * Math.min(1, dt * (engaged ? 10 : 1.5));
      poseArcher(f, draw);
    });
  }
  if (m.turret) {
    if (!engaged) _.yaw += angleDiff(_.yaw, tower.pad.yaw + Math.sin(_.t * .2) * .6) * Math.min(1, dt * .5);
    m.turret.rotation.y = _.yaw - tower.pad.yaw;
  }
  if (m.pitch) {
    if (!engaged) _.pitch += (.12 - _.pitch) * Math.min(1, dt * 2);
    m.pitch.rotation.x = -_.pitch;
    _.recoil = Math.max(0, _.recoil - dt * 1.6);
    m.barrel.position.z = -.45 * Math.sin(Math.min(1, _.recoil) * Math.PI * .5) ** 2 * (_.recoil > .75 ? (1 - _.recoil) * 4 : 1);
  }
  if (tower.typeId === 'ballista') {
    const period = 1 / s.rate, sinceFire = period - Math.max(0, _.cooldown);
    const draw = _.cooldown <= 0 ? 1 : sinceFire < .12 ? 1 - sinceFire / .12 : Math.min(1, (sinceFire - .35) / Math.max(.3, period - .6));
    poseBallista(m.turret, Math.max(0, draw), _.cooldown <= 0 || sinceFire > period * .6);
  }
  if (m.arm) {
    // snap forward against the stop beam, hang there a moment, then winch slowly back down; reload the cup near the end
    const period = 1 / s.rate, since = period - Math.max(0, _.cooldown), { rest, thrown } = MANGONEL;
    const k = _.cooldown <= 0 || !_.fired ? 0 : since < .14 ? 1 - (1 - since / .14) ** 2 : since < .45 ? 1 : Math.max(0, 1 - (since - .45) / Math.max(.3, period - .9));
    m.arm.rotation.x = rest + (thrown - rest) * k + (since < .45 && _.fired ? Math.sin(since * 40) * .04 * (1 - since / .45) : 0);
    m.pot.visible = !_.fired || k < .05;
  }
  if (m.tarm) {
    const period = 1 / s.rate, since = period - Math.max(0, _.cooldown), { rest, thrown } = TREBUCHET;
    const k = _.cooldown <= 0 || !_.fired ? 0 : since < .5 ? 1 - (1 - since / .5) ** 3 : since < 1.1 ? 1 : Math.max(0, 1 - (since - 1.1) / Math.max(.6, period - 1.6));
    const sway = since > .5 && since < 1.6 && _.fired ? Math.sin((since - .5) * 9) * .06 * (1 - (since - .5) / 1.1) : 0;
    m.tarm.rotation.x = rest + (thrown - rest) * k + sway;
    m.cw.rotation.x = -m.tarm.rotation.x + Math.sin(since * 7) * .25 * Math.max(0, 1 - since / 1.4) * (_.fired ? 1 : 0);   // the weight swings on its hinge
    m.stone.visible = !_.fired || k < .02;
  }
  if (m.fire) {
    const f = .8 + .12 * Math.sin(_.t * 9.1) + .08 * Math.sin(_.t * 23.7 + 1) + .1 * Math.sin(_.t * 3.3);
    m.fire.material.opacity = .42 * f; m.fire.scale.setScalar(m.fire.userData.size * (.9 + .15 * f));
  }
  if (m.crystal) {
    _.flare = Math.max(0, _.flare - dt * 2.2);
    const c = m.crystal, core = c.getObjectByName('core'), orbit = c.getObjectByName('orbit'), ring = c.getObjectByName('ring'), glow = c.getObjectByName('glow');
    c.position.y = m.turretY + Math.sin(_.t * 1.6) * .18;
    core.rotation.y += dt * (.6 + _.flare * 6);
    orbit.rotation.y -= dt * (1.1 + _.flare * 4);
    if (ring) { ring.rotation.z += dt * .8; ring.rotation.x = Math.PI / 2.3 + Math.sin(_.t * .7) * .15; }
    const pulse = .5 + .5 * Math.sin(_.t * 2.4);
    core.material.emissiveIntensity = 1.0 + pulse * .45 + _.flare * 5;
    glow.material.opacity = .16 + pulse * .08 + _.flare * .5;
    glow.scale.setScalar(m.crystalSize * (3 + _.flare * 3));
  }
}

// ---------------- projectiles ----------------
function ballisticVelocity(from, to, T, g, out) {
  return out.subVectors(to, from).divideScalar(T).setY((to.y - from.y + .5 * g * T * T) / T);
}
function makeProjectiles() {
  const geo = projectileGeometries(), dummy = new THREE.Object3D();
  const orbMat = new THREE.MeshBasicMaterial({ map: glowTexture(), color: '#fff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const pools = {
    arrow: new THREE.InstancedMesh(geo.arrow, new THREE.MeshStandardMaterial({ color: '#b9a57e', roughness: .8 }), 400),
    bolt: new THREE.InstancedMesh(geo.bolt, new THREE.MeshStandardMaterial({ color: '#5a4630', roughness: .7, metalness: .2 }), 80),
    cannonball: new THREE.InstancedMesh(geo.ball, new THREE.MeshStandardMaterial({ color: '#2a2b28', metalness: .5, roughness: .5 }), 120),
    boulder: new THREE.InstancedMesh(geo.boulder, new THREE.MeshStandardMaterial({ color: '#8e877a', roughness: 1 }), 40),
    firepot: new THREE.InstancedMesh(geo.pot, new THREE.MeshStandardMaterial({ color: '#7d5236', roughness: .9, emissive: '#ff5a18', emissiveIntensity: .35 }), 60),
    arcane: new THREE.InstancedMesh(geo.orb, orbMat, 1200),
  };
  for (const p of Object.values(pools)) { p.count = 0; p.frustumCulled = false; p.castShadow = false; p.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(p); }
  pools.arcane.setColorAt(0, new THREE.Color());
  return { pools, list: [], dummy, color: new THREE.Color() };
}
function fire(tower, target) {
  const _ = tower._, type = TOWER_TYPES[tower.typeId], s = stat(tower), kind = type.projectile;
  const from = muzzleWorld(tower, new THREE.Vector3());
  const to = new THREE.Vector3(), T = lead(from, target, kind, to);
  const p = { kind, tower, target, from, to, T, t: 0, pos: from.clone(), prev: from.clone(), vel: new THREE.Vector3(), damage: s.damage, splash: s.splash || 0, slow: s.slow || null, armorPierce: s.armorPierce || 0, burn: s.burn || null, trail: [] };
  if (kind === 'cannonball' || kind === 'firepot' || kind === 'boulder') to.y -= (target.height || 1.6) * .6;
  if (kind === 'arcane') { p.vel.subVectors(to, from).normalize().multiplyScalar(9).y += 7; p.T = 3.5; p.wob = Math.random() * 6; }
  else ballisticVelocity(from, to, T, GRAV[kind], p.vel);
  p.v0 = p.vel.clone();
  projectiles.list.push(p);
  if (m(tower).archers) { _.shooter++; }
  if (kind === 'cannonball') _.recoil = 1;
  if (kind === 'firepot' || kind === 'boulder') _.fired = true;
  if (kind === 'boulder') p.wait = .3;   // leaves the sling as the arm reaches its release point
  if (kind === 'boulder') p.spin = new THREE.Vector3(Math.random() - .5, Math.random() - .5, Math.random() - .5).normalize();
  if (kind === 'arcane') _.flare = 1;
  bus.emit('tower:fire', { tower, from: from.clone(), target, projectile: kind });
}
const m = t => t._.model;
function updateProjectiles(dt) {
  const L = projectiles.list;
  for (let i = L.length - 1; i >= 0; i--) {
    const p = L[i];
    if (p.wait > 0) { p.wait -= dt; continue; }
    p.t += dt; p.prev.copy(p.pos);
    let done = false;
    if (p.kind === 'arcane') {
      const alive = p.target && p.target.alive;
      if (alive) aimPoint(p.target, p.to);
      tmp.subVectors(p.to, p.pos); const d = tmp.length();
      const speed = 17 + p.t * 16;
      tmp.divideScalar(Math.max(d, 1e-3)).multiplyScalar(speed);
      p.vel.lerp(tmp, 1 - Math.exp(-dt * (4 + p.t * 8)));
      p.pos.addScaledVector(p.vel, dt);
      p.pos.y += Math.sin(p.t * 14 + p.wob) * dt * 1.2;
      if (d < .5 + (alive ? p.target.radius || .5 : 0) * .6 || p.t > p.T || (!alive && d < .6)) done = true;
    } else {
      const g = GRAV[p.kind], t = Math.min(p.t, p.T);
      p.pos.copy(p.from).addScaledVector(p.v0, t); p.pos.y -= .5 * g * t * t;
      // arrows and bolts steer onto the live target so leading errors never read as misses
      if (p.kind !== 'cannonball' && p.kind !== 'boulder' && p.target && p.target.alive) { aimPoint(p.target, tmp); tmp.sub(p.to); p.pos.addScaledVector(tmp, (t / p.T) ** 2); }
      if (p.t >= p.T) done = true;
    }
    p.vel.subVectors(p.pos, p.prev);
    if (p.kind === 'arcane' || p.kind === 'firepot') { p.trail.unshift(p.pos.clone()); if (p.trail.length > (p.kind === 'arcane' ? 14 : 8)) p.trail.pop(); }
    if (done) { impact(p); L.splice(i, 1); }
  }
  // render pools
  const { pools, dummy, color } = projectiles;
  const counts = { arrow: 0, bolt: 0, cannonball: 0, arcane: 0, firepot: 0, boulder: 0 };
  for (const p of L) {
    if (p.wait > 0) continue;
    const pool = pools[p.kind];
    if (p.kind === 'firepot') // burning wick: a short ember trail drawn with the additive orb pool
      for (let k = 0; k < p.trail.length && counts.arcane < 1200; k++) {
        const f = 1 - k / p.trail.length;
        dummy.position.copy(p.trail[k]); dummy.quaternion.copy(camera.quaternion); dummy.scale.setScalar(k ? .9 * f + .2 : 1.5);
        dummy.updateMatrix(); pools.arcane.setMatrixAt(counts.arcane, dummy.matrix);
        color.setRGB(2.2, .85, .25).multiplyScalar(k ? f * .6 : 1); pools.arcane.setColorAt(counts.arcane, color); counts.arcane++;
      }
    if (p.kind === 'arcane') {
      for (let k = 0; k < p.trail.length && counts.arcane < 1200; k++) {
        const f = 1 - k / p.trail.length;
        dummy.position.copy(p.trail[k]); dummy.quaternion.copy(camera.quaternion); dummy.scale.setScalar(k ? .75 * f + .15 : 1.25);
        dummy.updateMatrix(); pool.setMatrixAt(counts.arcane, dummy.matrix);
        if (k) color.setRGB(.25, .42, 1.5).multiplyScalar(f * .75); else color.setRGB(.75, .95, 2.2); pool.setColorAt(counts.arcane, color); counts.arcane++;
      }
      continue;
    }
    if (counts[p.kind] >= pool.instanceMatrix.count) continue;
    dummy.position.copy(p.pos);
    if (p.vel.lengthSq() > 1e-8) dummy.quaternion.setFromUnitVectors(_zAxis, tmp.copy(p.vel).normalize()); else dummy.quaternion.identity();
    dummy.scale.setScalar(p.kind === 'arrow' ? 1.6 : p.kind === 'cannonball' ? 1.15 : 1.1);
    if (p.kind === 'firepot') dummy.quaternion.setFromAxisAngle(_zAxis, p.t * 9);
    if (p.kind === 'boulder') { dummy.quaternion.setFromAxisAngle(p.spin, p.t * 5); dummy.scale.setScalar(1); }
    dummy.updateMatrix(); pool.setMatrixAt(counts[p.kind]++, dummy.matrix);
  }
  for (const k in pools) { pools[k].count = counts[k]; pools[k].instanceMatrix.needsUpdate = true; if (pools[k].instanceColor) pools[k].instanceColor.needsUpdate = true; }
}
const _zAxis = new THREE.Vector3(0, 0, 1);
function impact(p) {
  const tower = p.tower, pos = p.pos.clone();
  let radius = .6;
  const hit = (e, amount, opts) => { if (damageEnemy(e, amount, opts) && !tower._.dead) tower.kills++; };
  if (p.kind === 'firepot') {
    const b = p.burn; radius = b.radius;
    pos.y = groundY(pos.x, pos.z);
    for (const e of enemiesInRadius(pos, b.radius)) hit(e, p.damage, { type: 'fire' });
    burning.push({ pos, radius: b.radius, dps: b.dps, t: 0, dur: b.duration, tower, mesh: poolMesh(pos, b.radius) });
    bus.emit('projectile:impact', { pos, projectile: p.kind, radius, target: p.target, duration: b.duration });
    return;
  }
  if (p.kind === 'cannonball' || p.kind === 'boulder') {
    radius = p.splash;
    pos.y = Math.max(pos.y, groundY(pos.x, pos.z));
    for (const e of enemiesInRadius(pos, p.splash)) {
      const d = Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) / p.splash;
      hit(e, p.damage * (1 - .5 * Math.min(1, d)), { type: 'blast' });
    }
  } else if (p.target && p.target.alive) {
    if (p.kind === 'arcane') hit(p.target, p.damage, { type: 'magic', slow: p.slow });
    else {
      // Ballista armour piercing: pre-scale so that after the enemy's own armour reduction only (1 - armorPierce) of the armour applies.
      let amount = p.damage;
      const armor = Math.min(.95, p.target.armor ?? ENEMY_TYPES?.[p.target.typeId]?.armor ?? 0);
      if (p.armorPierce && armor > 0) amount *= (1 - armor * (1 - p.armorPierce)) / (1 - armor);
      hit(p.target, amount, { type: 'pierce' });
    }
  } else if (p.kind !== 'arcane') pos.y = Math.max(groundY(pos.x, pos.z), pos.y - 0);
  bus.emit('projectile:impact', { pos, projectile: p.kind, radius, target: p.target });
}

// ---------------- burning pitch ----------------
// Damage ticks four times a second; each foe takes the hottest pool it stands in.
const burning = [], BURN_TICK = .25;
let burnClock = 0, poolMat;
// The readable damage zone: a molten, flickering disc draped over the ground, exactly radius-sized, alive exactly as long as the damage.
function poolMesh(pos, r) {
  poolMat ||= new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    uniforms: { life: { value: 0 }, time: { value: 0 }, seed: { value: 0 } },
    vertexShader: 'varying vec2 vP; void main(){ vP = uv * 2. - 1.; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `uniform float life, time, seed; varying vec2 vP;
      float n(vec2 p){ return sin(p.x * 3.1 + seed) * sin(p.y * 2.7 - seed * .7) * .5 + sin(p.x * 7.3 - p.y * 5.1 + time * 1.7) * .25 + sin(length(p) * 9. - time * 2.6 + seed) * .25; }
      void main(){
        float r = length(vP), k = n(vP * 2.), edge = 1. - smoothstep(.62 + .16 * k, 1., r);
        float fade = smoothstep(0., .05, life) * (1. - smoothstep(.72, 1., life));
        float flick = .78 + .22 * sin(time * 11. + r * 6. + seed) * sin(time * 7.3 + k * 4.);
        vec3 c = mix(vec3(1.2, .18, .02), vec3(2.0, .62, .1), smoothstep(-.2, .8, k)) * flick;
        gl_FragColor = vec4(c, edge * fade * (.45 + .4 * k)); }`,
  });
  const g = new THREE.PlaneGeometry(2 * r, 2 * r, 10, 10).rotateX(-Math.PI / 2), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, groundY(pos.x + p.getX(i), pos.z + p.getZ(i)) - pos.y + .12);
  const m = new THREE.Mesh(g, poolMat.clone()); m.position.copy(pos); m.renderOrder = 2; m.frustumCulled = false;
  m.material.uniforms.seed.value = Math.random() * 6.28; scene.add(m);
  return m;
}
function updateBurning(dt) {
  for (let i = burning.length - 1; i >= 0; i--) {
    const b = burning[i], u = b.mesh.material.uniforms;
    b.t += dt; u.life.value = b.t / b.dur; u.time.value = glowTime;
    if (b.t >= b.dur) { b.mesh.removeFromParent(); b.mesh.geometry.dispose(); b.mesh.material.dispose(); burning.splice(i, 1); }
  }
  if (!burning.length || (burnClock += dt) < BURN_TICK) return;
  burnClock -= BURN_TICK;
  for (const e of state.enemies.slice()) {
    let best = null;
    for (const b of burning) if ((!best || b.dps > best.dps) && Math.hypot(e.pos.x - b.pos.x, e.pos.z - b.pos.z) <= b.radius + (e.radius || .5) * .5) best = b;
    if (best && damageEnemy(e, best.dps * BURN_TICK, { type: 'fire' }) && !best.tower._.dead) best.tower.kills++;
  }
}

// ---------------- frame ----------------
let glowTime = 0;
export function update(dt) {
  glowTime += dt || 0;
  for (const t of state.towers) updateTower(t, dt);
  for (let i = sinking.length - 1; i >= 0; i--) { const t = sinking[i]; if (t._.anim) animate(t, dt); else sinking.splice(i, 1); }
  updateProjectiles(dt);
  updateBurning(dt);
  renderArchers(scene);
  // pad rune rings ease toward their target glow; selected pulse gently
  const real = performance.now() * .001;
  for (const p of pads) {
    const r = p._;
    r.glow += (r.glowTarget - r.glow) * .15;
    const occupied = !!p.tower;
    const lit = r.glowTarget > .5;
    r.ring.material.opacity = Math.min(1, r.glow) * (occupied && !lit ? 0 : 1);
    r.ring.material.color.setRGB(1, .72, .38).multiplyScalar(lit ? 1.6 + .5 * Math.sin(real * 4) + r.glow : 1);
    r.ring.rotation.y = real * .05 + p.id;
  }
  if (rangeRing.visible) rangeRing.material.uniforms.time.value = real;
}

// ---------------- debug ----------------
export const debug = {
  // A mix of every type and level on most pads, built instantly and free.
  buildAll({ animate = false } = {}) {
    const types = Object.keys(TOWER_TYPES);
    pads.forEach((pad, i) => {
      if (pad.tower || i % 6 === 5) return;
      const t = buildTower(pad, types[i % types.length], { instant: !animate, free: true });
      for (let l = 0; l < (i >> 2) % 3; l++) upgradeTower(t, { instant: !animate, free: true });
    });
    return state.towers.length;
  },
  build(padId, typeId, level = 0) {
    const pad = pads[padId]; if (pad.tower) sellTower(pad.tower);
    const t = buildTower(pad, typeId, { instant: true, free: true });
    for (let l = 0; l < level; l++) upgradeTower(t, { instant: true, free: true });
    for (const s of sinking) if (s._.anim) finishAnim(s);
    sinking.length = 0;
    return t;
  },
  projectiles: () => projectiles.list.length,
  burning: () => burning.length,
  // A damage-free pool of burning pitch at pos (visual check without waiting for a tower to fire).
  burnAt: (pos, radius = 3, dur = 4) => { const p = pos.clone(); p.y = groundY(p.x, p.z); burning.push({ pos: p, radius, dps: 0, t: 0, dur, tower: { _: { dead: true } }, mesh: poolMesh(p, radius) }); },
};
