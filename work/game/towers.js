// Towers view: build sites, tower models posed from the rules state, projectiles and fire-pool glows.
// The rules (economy, targeting, flight, impacts, fire pools) live in towers-rules.js.
import { THREE, scene, camera, renderer, composer, height, clearTrees, bridgeDeck, padSpots } from '../scene.js';
import { state, bus, lanes, siege } from './core.js';
import { damageEnemy, enemiesInRadius, distAfter } from './enemies.js';
import { instantiate, ghost, scaffold, padGeometry, runeTexture, projectileGeometries, poseArcher, poseBallista, glowTexture, renderArchers, liveArchers, MANGONEL, TREBUCHET } from './towers-models.js';
import { createTowerRules, TOWER_TYPES, upgradeCost, sellValue, stat, angleDiff } from './towers-rules.js';
export { TOWER_TYPES, upgradeCost, sellValue };

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
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

// View state per tower (model, build animation, shooter, recoil, flare, pitch, clock) and per projectile (trail, spin).
const view = new WeakMap(), viewOf = t => view.get(t);
const rules = createTowerRules({ state, bus, siege, lanes, groundY, muzzle: muzzleWorld,
  host: { foes: () => state.enemies, damage: damageEnemy, inRadius: enemiesInRadius, distAfter } });
bus.on('tower:fire', ({ tower, projectile: kind }) => {
  const _ = viewOf(tower); if (!_) return;   // fx's demo fires from towers that aren't built
  if (_.model.archers) _.shooter++;
  if (kind === 'cannonball') _.recoil = 1;
  if (kind === 'firepot' || kind === 'boulder') _.fired = true;
  if (kind === 'arcane') _.flare = 1;
});

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
const siteHeight = (pad, h) => { pad._.hit.scale.y = h; pad._.hit.updateMatrixWorld(); };
export function buildTower(pad, typeId, { instant = false, free = false } = {}) {
  const tower = rules.build(pad, typeId, { free });
  if (!tower) return null;
  view.set(tower, { pitch: .3, shooter: 0, recoil: 0, flare: 0, anim: null, model: null, t: Math.random() * 10 });
  setModel(tower); siteHeight(pad, viewOf(tower).model.height);
  if (instant) finishAnim(tower); else startAnim(tower, 'build', 1.9);
  return tower;
}
export function upgradeTower(tower, { instant = false, free = false } = {}) {
  if (!rules.upgrade(tower, { free })) return false;
  const _ = viewOf(tower);
  if (_.anim) finishAnim(tower);
  const old = _.model;
  setModel(tower); siteHeight(tower.pad, _.model.height);
  if (instant) { disposeModel(old); finishAnim(tower); } else startAnim(tower, 'upgrade', 1.5, old);
  return true;
}
export function sellTower(tower) {
  if (tower.sold) return;
  rules.sell(tower); siteHeight(tower.pad, 1.4);
  if (viewOf(tower).anim) finishAnim(tower);
  startAnim(tower, 'sell', 1.2);
  sinking.push(tower);
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
  scene.add(m.root); viewOf(tower).model = m;
}
function disposeModel(m) { m.root.removeFromParent(); if (m.archers) for (const f of m.archers) liveArchers.delete(f); }
function startAnim(tower, kind, dur, old = null) {
  const m = viewOf(tower).model, sc = scaffold(m.hw, m.height * .8);
  sc.position.copy(tower.pos); sc.rotation.y = tower.pad.yaw; sc.scale.y = .001;
  if (kind !== 'sell') scene.add(sc);
  viewOf(tower).anim = { kind, t: 0, dur, old, sc };
}
function finishAnim(tower) {
  const _ = viewOf(tower), a = _.anim;
  if (a) { a.sc.removeFromParent(); if (a.old) disposeModel(a.old); }
  _.anim = null;
  const r = _.model.root; r.position.copy(tower.pos); r.rotation.set(0, tower.pad.yaw, 0); r.scale.set(1, 1, 1);
  if (tower.sold) disposeModel(_.model);
  renderer.shadowMap.needsUpdate = true;
}
const ease = t => 1 - Math.pow(1 - t, 3);
function animate(tower, dt) {
  const a = viewOf(tower).anim, m = viewOf(tower).model, root = m.root;
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

// ---------------- posing from the rules state ----------------
function pose(tower, dt) {
  const _ = viewOf(tower), e = !_.anim && tower.target;
  if (e && tower.typeId === 'cannon') {   // the barrel lifts to the arc the next ball will fly
    const v = rules.arcVelocity(tower, e, tmp2);
    _.pitch += (Math.atan2(v.y, Math.hypot(v.x, v.z)) - _.pitch) * Math.min(1, dt * 6);
  }
  idle(tower, dt, !!e);
}
function muzzleWorld(tower, out) {
  const _ = viewOf(tower), m = _.model;
  if (m.archers) { const f = m.archers[_.shooter % m.archers.length]; return f.root.localToWorld(out.set(0, 1.46, .6)); }
  if (m.muzzle) { m.root.updateMatrixWorld(); return m.muzzle.getWorldPosition(out); }
  return out.copy(tower.pos).setY(tower.pos.y + m.height);
}

// Per-frame pose of the weapons (turret yaw, bow draw, recoil, crystal pulse, ballista span).
function idle(tower, dt, engaged) {
  const _ = viewOf(tower), m = _.model, local = tower.yaw - tower.pad.yaw;
  const period = 1 / stat(tower).rate, since = period - Math.max(0, tower.cooldown);   // seconds since the last shot
  if (m.archers) {
    const n = m.archers.length;
    m.archers.forEach((f, i) => {
      const k = (i - _.shooter % n + n) % n, until = tower.cooldown + k * period;
      const draw = engaged ? Math.max(0, Math.min(1, 1 - (until - .05) / Math.min(.75, n * period * .8))) : Math.max(0, (f.draw || 0) - dt * 3);
      f.draw = draw;
      const want = engaged ? local + (i - (n - 1) / 2) * .04 : local + Math.sin(_.t * .3 + i * 2) * .9;
      f.root.rotation.y += angleDiff(f.root.rotation.y, want) * Math.min(1, dt * (engaged ? 10 : 1.5));
      poseArcher(f, draw);
    });
  }
  if (m.turret) {
    // idle sway is only for show, but it moves the rules' yaw so the next turn starts from what the player sees
    if (!engaged) tower.yaw += angleDiff(tower.yaw, tower.pad.yaw + Math.sin(_.t * .2) * .6) * Math.min(1, dt * .5);
    m.turret.rotation.y = tower.yaw - tower.pad.yaw;
  }
  if (m.pitch) {
    if (!engaged) _.pitch += (.12 - _.pitch) * Math.min(1, dt * 2);
    m.pitch.rotation.x = -_.pitch;
    _.recoil = Math.max(0, _.recoil - dt * 1.6);
    m.barrel.position.z = -.45 * Math.sin(Math.min(1, _.recoil) * Math.PI * .5) ** 2 * (_.recoil > .75 ? (1 - _.recoil) * 4 : 1);
  }
  if (tower.typeId === 'ballista') {
    const draw = tower.cooldown <= 0 ? 1 : since < .12 ? 1 - since / .12 : Math.min(1, (since - .35) / Math.max(.3, period - .6));
    poseBallista(m.turret, Math.max(0, draw), tower.cooldown <= 0 || since > period * .6);
  }
  if (m.arm) {
    // snap forward against the stop beam, hang there a moment, then winch slowly back down; reload the cup near the end
    const { rest, thrown } = MANGONEL;
    const k = tower.cooldown <= 0 || !_.fired ? 0 : since < .14 ? 1 - (1 - since / .14) ** 2 : since < .45 ? 1 : Math.max(0, 1 - (since - .45) / Math.max(.3, period - .9));
    m.arm.rotation.x = rest + (thrown - rest) * k + (since < .45 && _.fired ? Math.sin(since * 40) * .04 * (1 - since / .45) : 0);
    m.pot.visible = !_.fired || k < .05;
  }
  if (m.tarm) {
    const { rest, thrown } = TREBUCHET;
    const k = tower.cooldown <= 0 || !_.fired ? 0 : since < .5 ? 1 - (1 - since / .5) ** 3 : since < 1.1 ? 1 : Math.max(0, 1 - (since - 1.1) / Math.max(.6, period - 1.6));
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
  return { pools, dummy, color: new THREE.Color() };
}
const drawn = new WeakMap(), _zAxis = new THREE.Vector3(0, 0, 1);
function drawProjectiles() {
  const { pools, dummy, color } = projectiles;
  const counts = { arrow: 0, bolt: 0, cannonball: 0, arcane: 0, firepot: 0, boulder: 0 };
  for (const p of rules.projectiles) {
    if (p.wait > 0) continue;
    const pool = pools[p.kind];
    let d = drawn.get(p);
    if (!d) drawn.set(p, d = { trail: [], spin: p.kind === 'boulder' && new THREE.Vector3(Math.random() - .5, Math.random() - .5, Math.random() - .5).normalize() });
    if (p.kind === 'arcane' || p.kind === 'firepot') { d.trail.unshift(p.pos.clone()); if (d.trail.length > (p.kind === 'arcane' ? 14 : 8)) d.trail.pop(); }
    if (p.kind === 'firepot') // burning wick: a short ember trail drawn with the additive orb pool
      for (let k = 0; k < d.trail.length && counts.arcane < 1200; k++) {
        const f = 1 - k / d.trail.length;
        dummy.position.copy(d.trail[k]); dummy.quaternion.copy(camera.quaternion); dummy.scale.setScalar(k ? .9 * f + .2 : 1.5);
        dummy.updateMatrix(); pools.arcane.setMatrixAt(counts.arcane, dummy.matrix);
        color.setRGB(2.2, .85, .25).multiplyScalar(k ? f * .6 : 1); pools.arcane.setColorAt(counts.arcane, color); counts.arcane++;
      }
    if (p.kind === 'arcane') {
      for (let k = 0; k < d.trail.length && counts.arcane < 1200; k++) {
        const f = 1 - k / d.trail.length;
        dummy.position.copy(d.trail[k]); dummy.quaternion.copy(camera.quaternion); dummy.scale.setScalar(k ? .75 * f + .15 : 1.25);
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
    if (p.kind === 'boulder') { dummy.quaternion.setFromAxisAngle(d.spin, p.t * 5); dummy.scale.setScalar(1); }
    dummy.updateMatrix(); pool.setMatrixAt(counts[p.kind]++, dummy.matrix);
  }
  for (const k in pools) {
    const pool = pools[k];
    pool.count = counts[k];
    if (!pool.count) continue;
    for (const a of [pool.instanceMatrix, pool.instanceColor]) {
      if (!a) continue;
      a.clearUpdateRanges(); a.addUpdateRange(0, pool.count * a.itemSize); a.needsUpdate = true;
    }
  }
}
// ---------------- fire pools ----------------
const glows = new Map();   // rules pool → its ground glow
let poolMat;
// The readable damage zone: a molten, flickering disc draped over the ground, alive exactly as long as the damage.
// Drawn at the pool radius; it reaches foes whose middle is half their own radius beyond that edge.
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
function drawPools() {
  for (const pool of rules.pools) if (!glows.has(pool)) glows.set(pool, poolMesh(pool.pos, pool.radius));
  for (const [pool, m] of glows) {
    if (!rules.pools.includes(pool)) { m.removeFromParent(); m.geometry.dispose(); m.material.dispose(); glows.delete(pool); continue; }
    m.material.uniforms.life.value = pool.t / pool.dur; m.material.uniforms.time.value = glowTime;
  }
}

// ---------------- frame ----------------
let glowTime = 0;
const busy = t => !!viewOf(t).anim;
export function update(dt) {
  glowTime += dt || 0;
  for (const t of state.towers) { const _ = viewOf(t); _.t += dt; if (_.anim) animate(t, dt); }
  rules.update(dt, busy);
  for (const t of state.towers) pose(t, dt);
  for (let i = sinking.length - 1; i >= 0; i--) { const t = sinking[i]; if (viewOf(t).anim) animate(t, dt); else sinking.splice(i, 1); }
  drawProjectiles();
  drawPools();
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
};
