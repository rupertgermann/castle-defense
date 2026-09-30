// Towers: build pads, four tower types with three levels, targeting, projectiles and damage.
import { THREE, scene, camera, renderer, composer, height, clearTrees, bridgeDeck } from '../scene.js';
import { state, bus, lanes } from './core.js';
import { damageEnemy, enemiesInRadius, ENEMY_TYPES } from './enemies.js';
import { instantiate, ghost, scaffold, padGeometry, runeTexture, projectileGeometries, poseArcher, poseBallista, glowTexture, renderArchers, liveArchers } from './towers-models.js';

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
};

// Tactical spots along both lanes (validated: off the road, out of the river, clear of cottages).
const PAD_SPOTS = [
  [22, 132], [3, 118], [24, 106], [3, 88], [21, 64], [-3, 71],          // village road, south lane
  [12, 44], [-15, 52], [-21, 38],                                        // fork and gate approach
  [28, 36], [-25, 48],                                                    // castle hill
  [36, 44], [37, 65],                                                     // gate road, east
  [50, 42], [50, 63], [111, 41], [109, 65],                               // both bridgeheads
  [139, 62],                                                              // east road bend
];
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
  let range = null, color = '#ffd38a';
  if (selection.kind === 'tower') {
    const t = selection.tower; range = t.range;
    if (previewTypeId && upgradeCost(t) != null) { range = TOWER_TYPES[t.typeId].levels[t.level + 1].range; showGhost(t.typeId, t.level + 1, pad); color = '#bfe0ff'; }
  } else if (previewTypeId && TOWER_TYPES[previewTypeId]) {
    range = TOWER_TYPES[previewTypeId].levels[0].range; showGhost(previewTypeId, 0, pad); color = '#bfe0ff';
  }
  if (range) showRange(pad.pos, range, color);
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
    uniforms: { color: { value: new THREE.Color('#ffd38a') }, time: { value: 0 }, opacity: { value: 1 } },
    vertexShader: 'attribute float rr; attribute float aa; varying float vR; varying float vA; void main(){ vR=rr; vA=aa; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform vec3 color; uniform float time, opacity; varying float vR; varying float vA;
      void main(){
        float edge = smoothstep(.955,.982,vR) * (1. - smoothstep(.992,1.,vR));
        float ticks = step(.55, fract(vA * 40. / 6.2831853 - time * .15)) * smoothstep(.925,.935,vR) * (1. - smoothstep(.95,.958,vR));
        float fill = .03 + .06 * smoothstep(.4, .97, vR);
        gl_FragColor = vec4(color * (1. + edge * .6), (edge * .9 + ticks * .5 + fill) * opacity);
      }`,
  });
  const m = new THREE.Mesh(new THREE.BufferGeometry(), mat); m.visible = false; m.renderOrder = 3; m.frustumCulled = false; scene.add(m);
  return m;
}
function showRange(center, range, color) {
  const key = center.x + ',' + center.z + ',' + range;
  rangeRing.material.uniforms.color.value.set(color);
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
function inRange(tower, e) { return e.alive && Math.hypot(e.pos.x - tower.pos.x, e.pos.z - tower.pos.z) <= tower.range; }
function acquire(tower) {
  let best = null, bestR = Infinity;
  for (const e of state.enemies) if (inRange(tower, e)) { const r = remaining(e); if (r < bestR) { bestR = r; best = e; } }
  return best;
}
// Predict where the target's aim point will be when a projectile of flight-time f(dist) arrives.
function lead(from, e, flightTime, out) {
  aimPoint(e, out);
  let T = flightTime(from.distanceTo(out));
  for (let k = 0; k < 2; k++) { aimPoint(e, out); if (e.velocity) out.addScaledVector(e.velocity, T); T = flightTime(from.distanceTo(out)); }
  return T;
}
const FLIGHT = {
  arrow: d => .22 + d / 42, cannonball: d => .5 + d / 26, bolt: d => .05 + d / 85, arcane: d => d / 20,
};
const GRAV = { arrow: 22, cannonball: 20, bolt: 4 };
const TURN = { archer: 7, cannon: 2.2, ballista: 3, mage: 99 };

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
    const T = lead(fromTmp, e, FLIGHT[type.projectile], aimTmp);
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
    arcane: new THREE.InstancedMesh(geo.orb, orbMat, 1200),
  };
  for (const p of Object.values(pools)) { p.count = 0; p.frustumCulled = false; p.castShadow = false; p.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(p); }
  pools.arcane.setColorAt(0, new THREE.Color());
  return { pools, list: [], dummy, color: new THREE.Color() };
}
function fire(tower, target) {
  const _ = tower._, type = TOWER_TYPES[tower.typeId], s = stat(tower), kind = type.projectile;
  const from = muzzleWorld(tower, new THREE.Vector3());
  const to = new THREE.Vector3(), T = lead(from, target, FLIGHT[kind], to);
  const p = { kind, tower, target, from, to, T, t: 0, pos: from.clone(), prev: from.clone(), vel: new THREE.Vector3(), damage: s.damage, splash: s.splash || 0, slow: s.slow || null, armorPierce: s.armorPierce || 0, trail: [] };
  if (kind === 'cannonball') to.y -= (target.height || 1.6) * .6;
  if (kind === 'arcane') { p.vel.subVectors(to, from).normalize().multiplyScalar(9).y += 7; p.T = 3.5; p.wob = Math.random() * 6; }
  else ballisticVelocity(from, to, T, GRAV[kind], p.vel);
  p.v0 = p.vel.clone();
  projectiles.list.push(p);
  if (m(tower).archers) { _.shooter++; }
  if (kind === 'cannonball') _.recoil = 1;
  if (kind === 'arcane') _.flare = 1;
  bus.emit('tower:fire', { tower, from: from.clone(), target, projectile: kind });
}
const m = t => t._.model;
const impactTmp = new THREE.Vector3();
function updateProjectiles(dt) {
  const L = projectiles.list;
  for (let i = L.length - 1; i >= 0; i--) {
    const p = L[i]; p.t += dt; p.prev.copy(p.pos);
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
      if (p.kind !== 'cannonball' && p.target && p.target.alive) { aimPoint(p.target, tmp); tmp.sub(p.to); p.pos.addScaledVector(tmp, (t / p.T) ** 2); }
      if (p.t >= p.T) done = true;
    }
    p.vel.subVectors(p.pos, p.prev);
    if (p.kind === 'arcane') { p.trail.unshift(p.pos.clone()); if (p.trail.length > 14) p.trail.pop(); }
    if (done) { impact(p); L.splice(i, 1); }
  }
  // render pools
  const { pools, dummy, color } = projectiles;
  const counts = { arrow: 0, bolt: 0, cannonball: 0, arcane: 0 };
  for (const p of L) {
    const pool = pools[p.kind];
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
    dummy.updateMatrix(); pool.setMatrixAt(counts[p.kind]++, dummy.matrix);
  }
  for (const k in pools) { pools[k].count = counts[k]; pools[k].instanceMatrix.needsUpdate = true; if (pools[k].instanceColor) pools[k].instanceColor.needsUpdate = true; }
}
const _zAxis = new THREE.Vector3(0, 0, 1);
function impact(p) {
  const tower = p.tower, pos = p.pos.clone();
  let radius = .6;
  const hit = (e, amount, opts) => { if (damageEnemy(e, amount, opts) && !tower._.dead) tower.kills++; };
  if (p.kind === 'cannonball') {
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

// ---------------- frame ----------------
let glowTime = 0;
export function update(dt) {
  glowTime += dt || 0;
  for (const t of state.towers) updateTower(t, dt);
  for (let i = sinking.length - 1; i >= 0; i--) { const t = sinking[i]; if (t._.anim) animate(t, dt); else sinking.splice(i, 1); }
  updateProjectiles(dt);
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
      const t = buildTower(pad, types[i % 4], { instant: !animate, free: true });
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
};
