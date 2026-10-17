// Enemies: the invading host. Types, procedural rigged models (instanced per bone), movement along lanes,
// crowd spreading, hit/slow/death reactions, billboard health bars and blob contact shadows.
import { THREE, scene, camera, controls, renderer, height, bridgeDeck } from '../scene.js';
import { state, bus, lanes } from './core.js';
import { buildModels } from './enemies-models.js';

export const ENEMY_TYPES = {
  raider: { name: 'Raider', hp: 60, speed: 3.2, bounty: 6, damage: 1, armor: 0, radius: .55, height: 2.4 },
  hound: { name: 'War Hound', hp: 40, speed: 6, bounty: 7, damage: 1, armor: 0, radius: .6, height: 1.55 },
  manatarms: { name: 'Man-at-Arms', hp: 180, speed: 2.4, bounty: 12, damage: 1, armor: .5, radius: .6, height: 2.5 },
  brute: { name: 'Ogre Brute', hp: 600, speed: 1.8, bounty: 30, damage: 2, armor: .15, radius: 1.2, height: 3.7 },
  ram: { name: 'Battering Ram', hp: 1200, speed: 1.3, bounty: 45, damage: 5, armor: .4, radius: 2.1, height: 3.5 },
  warlord: { name: 'Warlord', hp: 4000, speed: 1.2, bounty: 200, damage: 10, armor: .35, radius: 1.3, height: 4.3, boss: true },
  // Every few seconds the shaman mends the wounded around it (not itself). Kill it first.
  shaman: { name: 'War Shaman', tip: 'Mends the wounded around it. Kill it first.', hp: 200, speed: 2.4, bounty: 22, damage: 1, armor: 0, radius: .6, height: 2.9, heal: { every: 3.2, radius: 8, frac: .12, boss: 120 } },
  outrider: { name: 'Outrider', tip: 'Armoured lancers that ride twice as fast as men on foot.', hp: 200, speed: 4.8, bounty: 26, damage: 1, armor: .35, radius: 1.0, height: 3.6 },
};
// Models are authored at true scale (man ≈ 1.85 m) and drawn 1.3× for readability from the aerial camera.
const SCALE = 1.3;
// Internal per-type data: stride (m per gait cycle), lateral spread, shadow footprint, size variation.
const KIND = {
  raider: { w: .45, l: .45, stride: 1.7, lat: 1.5, shadow: [.75, .75], vary: .05 },
  hound: { w: .4, l: .9, stride: 2.6, lat: 1.4, shadow: [.6, 1.25], vary: .06 },
  manatarms: { w: .5, l: .5, stride: 1.5, lat: 1.5, shadow: [.8, .8], vary: .04 },
  brute: { w: .9, l: .8, stride: 2.5, lat: 1.0, shadow: [1.5, 1.4], vary: .05 },
  ram: { w: 1.45, l: 3.3, stride: 1.2, lat: .2, shadow: [2.6, 5.6], vary: 0 },
  warlord: { w: .9, l: .8, stride: 2.3, lat: .5, shadow: [1.7, 1.7], vary: 0 },
  shaman: { w: .5, l: .5, stride: 1.5, lat: 1.2, shadow: [.8, .8], vary: .04 },
  outrider: { w: .7, l: 1.5, stride: 3.4, lat: 1.0, shadow: [1.0, 2.4], vary: .03 },
};

let models, material, bars, shadows, nextId = 1;
const ghosts = []; // dying / leaking enemies still animating
const PI = Math.PI, TAU = PI * 2;
const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _s = new THREE.Vector3();
const _root = new THREE.Matrix4(), _m = new THREE.Matrix4(), _e = new THREE.Euler(), _X = new THREE.Vector3(1, 0, 0), _Y = new THREE.Vector3(0, 1, 0), _Z = new THREE.Vector3(0, 0, 1);
const world = Array.from({ length: 16 }, () => new THREE.Matrix4());

// ---------------------------------------------------------------- rendering setup
function makeMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, envMapIntensity: 1.2 });
  m.onBeforeCompile = s => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 mr;\nattribute vec3 fx;\nvarying vec3 vMR;\nvarying vec3 vFx;\nvarying vec3 vOP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMR = mr; vFx = fx; vOP = position;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vMR; varying vec3 vFx; varying vec3 vOP;
float eh(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float en(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(mix(eh(i), eh(i + vec3(1, 0, 0)), f.x), mix(eh(i + vec3(0, 1, 0)), eh(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(eh(i + vec3(0, 0, 1)), eh(i + vec3(1, 0, 1)), f.x), mix(eh(i + vec3(0, 1, 1)), eh(i + vec3(1, 1, 1)), f.x), f.y), f.z); }`)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vFx.z > .001 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715)))) < vFx.z) discard;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float grain = en(vOP * 11.) * .55 + en(vOP * 43.) * .45;
        diffuseColor.rgb *= mix(.8 + .34 * grain, 1., vMR.z);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(.72, .86, 1.04) + vec3(.05, .075, .1), vFx.y);`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp(mix(vMR.x + (grain - .5) * .22, .35, vFx.y * .5), .05, 1.);')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vMR.y;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vMR.z * 5.0 + vec3(1., .5, .38) * vFx.x * .9 + vec3(.012, .025, .045) * vFx.y;');
  };
  m.customProgramCacheKey = () => 'enemy-host';
  return m;
}
function setupModel(m) {
  m.meshes = m.parts.map(p => {
    const cap = m.cap * p.perEnemy;
    const mesh = new THREE.InstancedMesh(p.geometry, material, cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3).setUsage(THREE.DynamicDrawUsage);
    const fx = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    p.geometry.setAttribute('fx', fx);
    mesh.fx = fx; mesh.cap = cap; mesh.count = 0; mesh.frustumCulled = false; mesh.receiveShadow = true; mesh.castShadow = false;
    mesh.name = 'enemy-' + m.name;
    scene.add(mesh);
    return mesh;
  });
  m.pose = new Float32Array(m.bones.length * 7);
}
// Reset the pose buffer (rx, ry, rz, tx, ty, tz, scale per bone).
function resetPose(m) { const p = m.pose; p.fill(0); for (let i = 6; i < p.length; i += 7) p[i] = 1; return p; }
const R = (m, bone, x = 0, y = 0, z = 0) => { const o = m.b[bone] * 7; m.pose[o] = x; m.pose[o + 1] = y; m.pose[o + 2] = z; };
const T = (m, bone, x = 0, y = 0, z = 0) => { const o = m.b[bone] * 7; m.pose[o + 3] = x; m.pose[o + 4] = y; m.pose[o + 5] = z; };
const SC = (m, bone, s) => { m.pose[m.b[bone] * 7 + 6] = s; };

// Write one posed instance of model m under root matrix.
function emit(m, root, flash, frost, fade, tint) {
  const p = m.pose;
  for (let i = 0; i < m.bones.length; i++) {
    const bone = m.bones[i], o = i * 7;
    _e.set(p[o], p[o + 1], p[o + 2]); _m.makeRotationFromEuler(_e);
    if (p[o + 6] !== 1) _m.scale(_s.setScalar(p[o + 6]));
    _m.setPosition(bone.off.x + p[o + 3], bone.off.y + p[o + 4], bone.off.z + p[o + 5]);
    world[i].multiplyMatrices(bone.pi < 0 ? root : world[bone.pi], _m);
    if (bone.part < 0) continue;
    const mesh = m.meshes[bone.part];
    if (mesh.count >= mesh.cap) continue;
    const k = mesh.count++;
    world[i].toArray(mesh.instanceMatrix.array, k * 16);
    mesh.fx.array[k * 3] = flash; mesh.fx.array[k * 3 + 1] = frost; mesh.fx.array[k * 3 + 2] = fade;
    mesh.instanceColor.array[k * 3] = tint.r; mesh.instanceColor.array[k * 3 + 1] = tint.g; mesh.instanceColor.array[k * 3 + 2] = tint.b;
  }
}

function makeBars() {
  const cap = 300, geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('bar', new THREE.BufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uScale: { value: 450 }, uPR: { value: 1 } },
    vertexShader: `attribute vec4 bar; uniform float uScale, uPR; varying vec4 vBar; varying float vPx;
      void main(){ vBar = bar; vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv;
        float boss = step(.5, bar.w);
        float px = mix(1.5, 4.0, boss) * projectionMatrix[1][1] * uScale / -mv.z;
        px = clamp(px, mix(24., 72., boss) * uPR, mix(64., 170., boss) * uPR);
        gl_PointSize = px; vPx = px; }`,
    fragmentShader: `uniform float uPR; varying vec4 vBar; varying float vPx;
      void main(){
        float boss = step(.5, vBar.w);
        float h = floor(mix(5., 8., boss) * uPR + .5), b = max(1., floor(uPR + .25));
        float y = (gl_PointCoord.y - .5) * vPx, x = gl_PointCoord.x * vPx;
        if (abs(y) > h * .5) discard;
        vec3 col; float a = vBar.z;
        if (abs(y) > h * .5 - b || x < b || x > vPx - b) { col = vec3(.012, .01, .008); }
        else {
          float f = (x - b) / (vPx - 2. * b), hp = vBar.x;
          vec3 fill = boss > .5 ? mix(vec3(.55, .02, .015), vec3(.95, .38, .04), .35 + .2 * hp)
            : (hp > .5 ? mix(vec3(.9, .62, .02), vec3(.18, .62, .06), (hp - .5) * 2.) : mix(vec3(.75, .06, .02), vec3(.9, .62, .02), hp * 2.));
          float t = (y + h * .5) / h;
          if (f <= hp) col = fill * (1.25 - .55 * t);
          else if (f <= vBar.y) col = vec3(1., .78, .5);
          else col = vec3(.07, .02, .018) * (1.2 - .4 * t);
          if (boss > .5 && abs(fract(f * 10.) - .5) > .48 && f > .02 && f < .98) col *= .45;
        }
        gl_FragColor = vec4(col, a);
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false; pts.renderOrder = 20; pts.cap = cap; pts.n = 0;
  scene.add(pts);
  return pts;
}
function makeShadows() {
  const cap = 300, geo = new THREE.PlaneGeometry(1, 1).rotateX(-PI / 2);
  const alpha = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('alpha', alpha);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    vertexShader: `attribute float alpha; varying float vA; varying vec2 vUv;
      void main(){ vUv = uv; vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.); }`,
    fragmentShader: `varying float vA; varying vec2 vUv;
      void main(){ float r = length(vUv - .5) * 2.; float a = smoothstep(1., .15, r); gl_FragColor = vec4(.03, .028, .02, a * a * vA * .62); }`,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.alpha = alpha; mesh.frustumCulled = false; mesh.renderOrder = 1; mesh.count = 0; mesh.cap = cap;
  scene.add(mesh);
  return mesh;
}

export function init() {
  material = makeMaterial();
  models = buildModels();
  for (const m of Object.values(models)) setupModel(m);
  bars = makeBars();
  shadows = makeShadows();
}

// ---------------------------------------------------------------- API
export function spawnEnemy(typeId, laneIndex, { hpScale = 1 } = {}) {
  const type = ENEMY_TYPES[typeId], kind = KIND[typeId], lane = lanes[laneIndex];
  if (!type || !lane) return null;
  const maxHp = Math.round(type.hp * hpScale);
  const r = Math.random;
  const e = {
    id: nextId++, typeId, hp: maxHp, maxHp, alive: true, lane: laneIndex, dist: 0,
    pos: new THREE.Vector3(), velocity: new THREE.Vector3(), radius: type.radius, height: type.height, bounty: type.bounty, slowFactor: 1,
    // internals
    lat: (r() * 2 - 1) * kind.lat, latHome: (r() * 2 - 1) * kind.lat, wander: r() * TAU, phase: r() * TAU, yaw: null,
    flash: 0, stagger: 0, slowUntil: 0, slowDur: 1, age: 0, trail: 1, barA: 0, scale: 1 + (r() * 2 - 1) * kind.vary,
    tint: new THREE.Color().setHSL(0, 0, 1).multiplyScalar(.93 + r() * .12), seed: r(), dieSide: r() < .5 ? -1 : 1, dieBack: r() < .65,
  };
  place(e, 0);
  state.enemies.push(e);
  bus.emit('enemy:spawn', { enemy: e });
  return e;
}

export function damageEnemy(enemy, amount, { type = 'pierce', slow = null } = {}) {
  if (!enemy || !enemy.alive) return false;
  const t = ENEMY_TYPES[enemy.typeId];
  const dealt = type === 'pierce' ? amount * (1 - t.armor) : amount;
  if (slow && slow.factor < 1) {
    const f = t.boss ? Math.max(slow.factor, .6) : slow.factor; // bosses resist slows
    if (state.time >= enemy.slowUntil || f <= enemy.slowFactor) enemy.slowFactor = f;
    enemy.slowUntil = Math.max(enemy.slowUntil, state.time + slow.duration);
    enemy.slowDur = slow.duration;
  }
  enemy.hp -= dealt;
  enemy.flash = 1;
  enemy.stagger = Math.min(1, enemy.stagger + Math.min(.8, dealt / enemy.maxHp * 6 + .25) * (t.boss || enemy.typeId === 'ram' ? .3 : 1));
  enemy.barA = Math.max(enemy.barA, .01);
  _v.copy(enemy.pos); _v.y += enemy.height * .6;
  bus.emit('enemy:hit', { enemy, amount: dealt, damageType: type, pos: _v.clone() });
  if (enemy.hp <= 0) { kill(enemy); return true; }
  return false;
}

export function enemiesInRadius(pos, radius) {
  const out = [];
  for (const e of state.enemies) {
    const r = radius + e.radius;
    if ((e.pos.x - pos.x) ** 2 + (e.pos.z - pos.z) ** 2 <= r * r) out.push(e);
  }
  return out;
}

function remove(e) { const i = state.enemies.indexOf(e); if (i >= 0) state.enemies.splice(i, 1); }
function kill(e) {
  e.hp = 0; e.alive = false; remove(e);
  state.gold += e.bounty;
  e.ghost = 'die'; e.gt = 0; e.hitPhase = e.phase; e.velocity.set(0, 0, 0);
  ghosts.push(e);
  bus.emit('enemy:death', { enemy: e, pos: e.pos.clone() });
}
function leak(e) {
  e.alive = false; remove(e);
  state.lives -= ENEMY_TYPES[e.typeId].damage;
  e.ghost = 'leak'; e.gt = 0;
  ghosts.push(e);
  bus.emit('enemy:leak', { enemy: e });
}

// A shaman's pulse mends every wounded ally in reach by a share of its maximum health (bosses: a flat 120).
function heal(e, h, dt) {
  e.cast = Math.max(0, (e.cast || 0) - dt * 1.4);
  e.healT = (e.healT ?? h.every * (.4 + Math.random() * .6)) - dt;
  if (e.healT > 0) return;
  const near = state.enemies.filter(o => o !== e && o.hp < o.maxHp && (o.pos.x - e.pos.x) ** 2 + (o.pos.z - e.pos.z) ** 2 <= h.radius * h.radius);
  if (!near.length) { e.healT = .4; return; }
  for (const o of near) o.hp = Math.min(o.maxHp, o.hp + (ENEMY_TYPES[o.typeId].boss ? h.boss : o.maxHp * h.frac));   // bosses: a flat trickle
  e.healT = h.every; e.cast = 1;
  bus.emit('enemy:heal', { enemy: e, pos: e.pos.clone(), radius: h.radius, targets: near });
}

// ---------------------------------------------------------------- movement
const _c = new THREE.Vector3();
function onBridge(x, z) { const b = bridgeDeck; return x > b.x0 - 1 && x < b.x1 + 1 && Math.abs(z - b.z) < b.halfWidth + 1; }
function place(e, dt) {
  const lane = lanes[e.lane];
  lane.pointAt(e.dist, _c); lane.directionAt(e.dist, _d);
  const lat = e.lat + Math.sin(e.wander + e.dist * .23) * .12;
  const x = _c.x - _d.z * lat, z = _c.z + _d.x * lat;
  let y = _c.y - .06;
  if (!onBridge(x, z) && !onBridge(_c.x, _c.z)) y += THREE.MathUtils.clamp(height(x, z) - height(_c.x, _c.z), -.5, .5);
  if (dt > 0) e.velocity.set(x - e.pos.x, y - e.pos.y, z - e.pos.z).divideScalar(dt);
  e.pos.set(x, y, z);
  if (e.typeId === 'ram' || e.typeId === 'hound' || e.typeId === 'outrider') {
    const half = e.typeId === 'ram' ? 2.6 : e.typeId === 'outrider' ? 1.4 : 1.1, y0 = lane.pointAt(e.dist - half, _v).y, y1 = lane.pointAt(e.dist + half, _v).y;
    let roll = 0;
    if (e.typeId === 'ram' && !onBridge(x, z)) roll = Math.atan2(height(x + _d.z * 1.4, z - _d.x * 1.4) - height(x - _d.z * 1.4, z + _d.x * 1.4), 2.8);
    const pitch = -Math.atan2(y1 - y0, half * 2), kk = e.yaw === null ? 1 : Math.min(1, dt * 6);
    e.pitch = (e.pitch || 0) + (pitch - (e.pitch || 0)) * kk; e.roll = (e.roll || 0) + (roll - (e.roll || 0)) * kk;
  }
  const yaw = Math.atan2(_d.x, _d.z);
  if (e.yaw === null) e.yaw = yaw;
  else { let dy = yaw - e.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); e.yaw += dy * Math.min(1, dt * 5); }
}
// Crowd spreading: units are ellipses (half-width w across the road, half-length l along it). Overlapping pairs
// push apart sideways; a unit squeezing past a wide one may step onto the verge; the one behind slows if still blocked.
function separate(dt) {
  const list = state.enemies;
  for (const e of list) { e.crowd = 1; e.squeeze = false; }
  for (let i = 0; i < list.length; i++) {
    const a = list[i], ka = KIND[a.typeId];
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j], kb = KIND[b.typeId];
      if (a.lane !== b.lane) continue;
      const needD = (ka.l + kb.l) * .9, dd = Math.abs(a.dist - b.dist);
      if (dd > needD) continue;
      const needL = (ka.w + kb.w) * .95, dl = a.lat - b.lat, gap = Math.abs(dl);
      if (gap >= needL) continue;
      const push = (needL - gap) * Math.min(1, dt * 4) * (1 - dd / needD * .5), s = dl === 0 ? (a.id < b.id ? 1 : -1) : Math.sign(dl);
      const wa = kb.w / (ka.w + kb.w);
      a.lat += s * push * wa; b.lat -= s * push * (1 - wa);
      if (ka.w > .8) b.squeeze = true; if (kb.w > .8) a.squeeze = true;
      if (gap < needL * .6) { const behind = a.dist < b.dist ? a : b; behind.crowd = Math.min(behind.crowd, .2 + .8 * dd / needD); }
    }
  }
  for (const e of list) {
    const k = KIND[e.typeId], lim = k.lat + (e.squeeze ? .6 : 0);
    if (!e.squeeze) e.lat += (e.latHome - e.lat) * Math.min(1, dt * .25);
    e.lat = THREE.MathUtils.clamp(e.lat, -lim, lim);
  }
}

export function update(dt) {
  if (!models) return;
  if (dt > 0) {
    for (const e of state.enemies.slice()) {
      const t = ENEMY_TYPES[e.typeId], k = KIND[e.typeId];
      e.age += dt;
      if (e.slowFactor < 1 && state.time >= e.slowUntil) e.slowFactor = 1;
      const pace = t.speed * e.slowFactor * (1 - e.stagger * .5) * (e.crowd ?? 1);
      if (!debug.hold) e.dist += pace * dt;
      e.phase += pace * dt / (k.stride * SCALE) * TAU;
      e.flash = Math.max(0, e.flash - dt * 6);
      e.stagger = Math.max(0, e.stagger - dt * 3);
      e.trail = e.trail > e.hp / e.maxHp ? Math.max(e.hp / e.maxHp, e.trail - dt * .45) : e.hp / e.maxHp;
      if (e.hp < e.maxHp || t.boss) e.barA = Math.min(1, e.barA + dt * 5);
      if (t.heal) heal(e, t.heal, dt);
      if (e.dist >= lanes[e.lane].length) { leak(e); continue; }
    }
    separate(dt);
    for (const e of state.enemies) place(e, dt);
    for (let i = ghosts.length - 1; i >= 0; i--) {
      const g = ghosts[i]; g.gt += dt;
      if (g.ghost === 'leak') { g.dist += ENEMY_TYPES[g.typeId].speed * dt; g.phase += ENEMY_TYPES[g.typeId].speed * dt / (KIND[g.typeId].stride * SCALE) * TAU; place(g, dt); }
      g.flash = Math.max(0, g.flash - dt * 4);
      if (g.gt > (g.ghost === 'leak' ? .7 : 4.2)) ghosts.splice(i, 1);
    }
  }
  render();
}

// ---------------------------------------------------------------- animation
function gait(m, ph, o) {
  const s = Math.sin(ph), c = Math.cos(ph);
  R(m, 'thighR', -o.A * s - (o.crouch || 0)); R(m, 'thighL', o.A * s - (o.crouch || 0));
  R(m, 'shinR', .06 + o.B * Math.max(0, c) + (o.crouch || 0) * 1.4); R(m, 'shinL', .06 + o.B * Math.max(0, -c) + (o.crouch || 0) * 1.4);
  T(m, 'hips', 0, o.bob * (Math.abs(c) - .6) * m.k - (o.crouch || 0) * .12 * m.k, 0);
  R(m, 'hips', 0, o.twist * s, (o.sway || 0) * c);
  R(m, 'torso', o.lean, -o.twist * s * 1.4, -(o.sway || 0) * c * .7);
  R(m, 'head', -o.lean * .7, o.twist * s * .6, 0);
  R(m, 'armR', o.S * s, 0, -.08); R(m, 'armL', -o.S * s, 0, .08);
  return s;
}
function hitLean(m, e) { if (e.stagger > 0) { const o = m.b.torso * 7; m.pose[o] -= e.stagger * .35; m.pose[m.b.head * 7] -= e.stagger * .25; } }
// Limp limbs while toppling.
function limp(m, u) {
  if (!m.b.armR) return;
  const o = m.b.armR * 7, l = m.b.armL * 7;
  m.pose[o] = m.pose[o] * (1 - u) - 1.2 * u; m.pose[o + 2] = m.pose[o + 2] * (1 - u) - .6 * u;
  m.pose[l] = m.pose[l] * (1 - u) - 1.0 * u; m.pose[l + 2] = m.pose[l + 2] * (1 - u) + .7 * u;
  for (const b of ['thighR', 'thighL', 'shinR', 'shinL']) if (m.b[b] !== undefined) m.pose[m.b[b] * 7] *= 1 - u;
}

const ANIM = {
  raider(m, e) {
    const s = gait(m, e.phase, { A: .62, B: 1.05, S: .4, bob: .07, lean: .12, twist: .12, sway: .03 });
    R(m, 'armR', -.18 + .3 * s, 0, -.12);
    R(m, 'armL', -.7 - .1 * s, 0, .18);
    const fo = m.b.flame * 7, arm = m.pose[m.b.armL * 7] + m.pose[m.b.torso * 7];
    m.pose[fo] = -arm * .9; m.pose[fo + 2] = -.18;
    SC(m, 'flame', .9 + .18 * Math.sin(state.time * 23 + e.seed * 40) + .1 * Math.sin(state.time * 37 + e.seed * 9));
    hitLean(m, e);
  },
  manatarms(m, e) {
    const s = gait(m, e.phase, { A: .5, B: .85, S: .12, bob: .05, lean: .06, twist: .07, sway: .025 });
    R(m, 'armR', -.12 + .12 * s, 0, -.05);
    R(m, 'armL', -.3 + .05 * s, -.1, .12);
    hitLean(m, e);
  },
  crew(m, e, ph) {
    gait(m, ph, { A: .5, B: .9, S: 0, bob: .05, lean: .55, twist: .06 });
    R(m, 'armR', -1.35, 0, .05); R(m, 'armL', -1.35, 0, -.05);
    R(m, 'head', -.6, 0, 0);
  },
  brute(m, e) {
    const s = gait(m, e.phase, { A: .42, B: .7, S: .28, bob: .1, lean: .22, twist: .1, sway: .07 });
    R(m, 'armR', -.12 + .12 * s, 0, -.1);
    R(m, 'armL', -.3 * s, 0, .14);
    hitLean(m, e);
  },
  warlord(m, e) {
    const s = gait(m, e.phase, { A: .46, B: .75, S: .22, bob: .06, lean: .08, twist: .08, sway: .03 });
    R(m, 'armR', -.08 + .08 * s, 0, -.06);
    R(m, 'armL', -.28 * s - .05, 0, .1);
    R(m, 'cape', .1 + .05 * Math.sin(e.phase * 2) + e.stagger * .1, 0, .04 * Math.sin(e.phase));
    R(m, 'banner', -.05 + .03 * Math.sin(e.phase * 2 + 1), 0, .05 * Math.sin(e.phase + .5));
    hitLean(m, e);
  },
  shaman(m, e) {
    const s = gait(m, e.phase, { A: .42, B: .7, S: .1, bob: .045, lean: .14, twist: .06, sway: .02 }), c = e.cast || 0, lift = Math.sin(Math.min(1, c) * PI);
    R(m, 'armR', -.15 + .1 * s - lift * 1.5, 0, -.1 - lift * .15);   // the staff goes up as the pulse goes out
    R(m, 'armL', -.35 + .1 * s - lift * .6, 0, .35 + lift * .4);
    R(m, 'head', -.1 - lift * .25, 0, 0);
    SC(m, 'totem', 1 + .12 * Math.sin(state.time * 4 + e.seed * 9) + lift * .7);
    hitLean(m, e);
  },
  outrider(m, e) {
    // a rocking canter: forelegs reach together, hind legs drive together, the body pitches between them
    const ph = e.phase, s = Math.sin(ph), c = Math.cos(ph);
    R(m, 'legFR', -.75 * s); R(m, 'legFL', -.75 * Math.sin(ph + .5));
    R(m, 'legBR', .7 * Math.sin(ph + 2.4)); R(m, 'legBL', .7 * Math.sin(ph + 2.9));
    R(m, 'body', .07 * c - e.stagger * .15, 0, 0); T(m, 'body', 0, .1 * Math.abs(Math.sin(ph + .6)), 0);
    R(m, 'neck', -.12 * c + e.stagger * .25, 0, 0);
    R(m, 'tail', -.2 + .15 * Math.sin(ph * 2), .12 * s, 0);
    R(m, 'rider', -.08 * c + .05, 0, 0); T(m, 'rider', 0, -.04 * Math.abs(Math.sin(ph + 1.4)), 0);
  },
  hound(m, e) {
    const ph = e.phase, s = Math.sin(ph);
    R(m, 'body', .1 * Math.sin(ph + .6) - e.stagger * .2, 0, 0);
    T(m, 'body', 0, .07 * Math.sin(ph * 2 + 1.2) * .5 + .05 * Math.sin(ph + 1), 0);
    R(m, 'legFR', -.85 * s); R(m, 'legFL', -.85 * Math.sin(ph + .55));
    R(m, 'legBR', -.8 * Math.sin(ph + PI)); R(m, 'legBL', -.8 * Math.sin(ph + PI + .5));
    R(m, 'head', -.1 * Math.sin(ph + .6) + e.stagger * .3, 0, 0);
    R(m, 'tail', -.25 + .18 * Math.sin(ph * 2), .15 * Math.sin(ph), 0);
  },
};

const CREW = [[-1.02, -2.72], [-.36, -2.78], [.36, -2.76], [1.02, -2.7]];
const _cr = new THREE.Matrix4(), _cm = new THREE.Matrix4();

// ---------------------------------------------------------------- per-frame render
function render() {
  for (const m of Object.values(models)) for (const mesh of m.meshes) mesh.count = 0;
  bars.n = 0; shadows.count = 0;
  for (const e of state.enemies) draw(e);
  for (const g of ghosts) draw(g);
  for (const m of Object.values(models)) for (const mesh of m.meshes) {
    mesh.instanceMatrix.needsUpdate = true; mesh.fx.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
  }
  shadows.instanceMatrix.needsUpdate = true; shadows.alpha.needsUpdate = true;
  const bg = bars.geometry;
  bg.attributes.position.needsUpdate = true; bg.attributes.bar.needsUpdate = true; bg.setDrawRange(0, bars.n);
  bars.material.uniforms.uPR.value = renderer.getPixelRatio();
  bars.material.uniforms.uScale.value = renderer.domElement.height / 2;
}

function draw(e) {
  const type = ENEMY_TYPES[e.typeId], kind = KIND[e.typeId];
  let fade = Math.max(0, 1 - e.age / .6), sink = 0, fall = 0, flash = e.flash, frost = e.slowFactor < 1 ? Math.min(.6, .3 + (1 - e.slowFactor) * .6) * Math.min(1, (e.slowUntil - state.time) * 2 + .2) : 0;
  let limpU = 0;
  if (e.ghost === 'leak') fade = Math.min(1, e.gt / .6);
  if (e.ghost === 'die') {
    const t = e.gt;
    fall = Math.min(1, t / .75); fall = fall * fall * (3 - 2 * fall) * (1 + .06 * Math.sin(Math.min(1, t / .75) * PI) * 0);
    limpU = Math.min(1, t / .5);
    if (t > .75) fall = 1 + Math.sin(Math.min(1, (t - .75) / .25) * PI) * .04;
    sink = Math.max(0, t - 2.3) / 1.9;
    fade = Math.max(0, (t - 2.8) / 1.4);
    frost *= Math.max(0, 1 - t);
  }
  if (e.ghost === 'die' && sink >= 1) return;
  const s = e.scale * SCALE;
  // root: position, yaw, death topple about the feet
  _q.setFromAxisAngle(_Y, e.yaw);
  if (e.pitch || e.roll) { _e.set(e.pitch || 0, 0, e.roll || 0); _q.multiply(_q2.setFromEuler(_e)); }
  if (fall > 0) {
    const big = e.typeId === 'ram';
    if (big) _q2.setFromAxisAngle(_Z, fall * .22 * e.dieSide);
    else if (e.typeId === 'hound' || e.typeId === 'outrider') _q2.setFromAxisAngle(_Z, fall * PI * .5 * e.dieSide);
    else if (e.typeId === 'warlord') _q2.setFromAxisAngle(_X, fall * PI * .47);
    else if (e.dieBack) _q2.setFromAxisAngle(_X, -fall * PI * .48);
    else _q2.setFromAxisAngle(_Z, fall * PI * .48 * e.dieSide);
    _q.multiply(_q2);
  }
  const lift = fall * (e.typeId === 'ram' ? 0 : e.typeId === 'hound' ? .25 : e.typeId === 'outrider' ? .55 : .075 * type.height);
  _v.set(e.pos.x, e.pos.y + lift - sink * type.height * .45, e.pos.z);
  _root.compose(_v, _q, _s.setScalar(s));

  const m = models[e.typeId === 'ram' ? 'ram' : e.typeId];
  resetPose(m);
  if (e.typeId === 'ram') {
    const ph = e.phase;
    T(m, 'frame', 0, .015 * Math.sin(ph * 2), 0); R(m, 'frame', .006 * Math.sin(ph * 2 + 1), 0, .012 * Math.sin(ph));
    T(m, 'log', 0, 0, .1 * Math.sin(ph * .5) - e.stagger * .15); R(m, 'log', .015 * Math.sin(ph * .5 + .4), 0, 0);
    const roll = e.dist / (.56 * SCALE);
    for (const w of ['wFR', 'wFL', 'wBR', 'wBL']) R(m, w, roll, 0, 0);
    emit(m, _root, flash, frost, fade, e.tint);
    const cm = models.crew;
    CREW.forEach(([x, z], i) => {
      resetPose(cm);
      ANIM.crew(cm, e, e.phase * 1.25 + i * 1.7);
      let cf = 0;
      if (e.ghost === 'die') { cf = Math.min(1, Math.max(0, (e.gt - i * .12) / .7)); cf = cf * cf * (3 - 2 * cf); limp(cm, cf); }
      _q2.setFromAxisAngle(_Z, cf * PI * .48 * (i < 2 ? -1 : 1));
      _cm.compose(_v.set(x, cf * .12, z + cf * -.3), _q2, _s.setScalar(1));
      _cr.multiplyMatrices(_root, _cm);
      emit(cm, _cr, flash, frost, fade, e.tint);
    });
  } else {
    ANIM[e.typeId](m, e);
    if (limpU > 0) limp(m, limpU);
    emit(m, _root, flash, frost, fade, e.tint);
  }
  // contact shadow
  if (shadows.count < shadows.cap) {
    const i = shadows.count++, sa = kind.shadow;
    const sx = sa[0] * s * (1 + fall * (e.typeId === 'ram' ? .1 : .9)), sz = sa[1] * s * (1 + fall * .3);
    _q.setFromAxisAngle(_Y, e.yaw);
    _root.compose(_v.set(e.pos.x, e.pos.y + .04, e.pos.z), _q, _s.set(sx * 1.25, 1, sz * 1.25));
    _root.toArray(shadows.instanceMatrix.array, i * 16);
    shadows.alpha.array[i] = (1 - Math.max(fade, sink)) * (e.typeId === 'ram' ? .95 : 1);
  }
  // health bar
  if (e.alive && e.barA > 0 && bars.n < bars.cap) {
    const i = bars.n++, pa = bars.geometry.attributes.position.array, ba = bars.geometry.attributes.bar.array;
    pa[i * 3] = e.pos.x; pa[i * 3 + 1] = e.pos.y + (type.boss ? 7.6 : type.height * e.scale + .4); pa[i * 3 + 2] = e.pos.z;
    ba[i * 4] = Math.max(0, e.hp / e.maxHp); ba[i * 4 + 1] = e.trail; ba[i * 4 + 2] = e.barA * (1 - fade); ba[i * 4 + 3] = type.boss ? 1 : 0;
  }
}

// ---------------------------------------------------------------- debug (window.__game.enemies.debug)
export const debug = {
  hold: false, // true: units animate in place without advancing (for close-up shots)
  // Spawn a marching block of `count` units, rows of three, just ahead of the lane start.
  spawnMany(typeId, lane = 0, count = 10, startDist = 2) {
    const out = [], t = ENEMY_TYPES[typeId], k = KIND[typeId];
    const perRow = k.lat > 1 ? 3 : 1, gap = t.radius * 2.6;
    for (let i = 0; i < count; i++) {
      const e = spawnEnemy(typeId, lane);
      if (!e) break;
      e.dist = startDist + Math.floor(i / perRow) * gap + Math.random() * .4;
      e.latHome = e.lat = perRow > 1 ? ((i % perRow) - 1) * k.lat * .75 + (Math.random() - .5) * .3 : e.lat;
      e.age = 1; place(e, 0); out.push(e);
    }
    return out;
  },
  // A mixed column of every type on a lane, starting at dist.
  army(lane = 0, dist = 10) {
    const order = ['hound', 'hound', 'hound', 'raider', 'raider', 'raider', 'raider', 'manatarms', 'manatarms', 'manatarms', 'brute', 'raider', 'raider', 'ram', 'manatarms', 'shaman', 'outrider', 'outrider', 'manatarms', 'warlord', 'brute', 'shaman', 'raider', 'raider'];
    let d = dist;
    for (const id of order) { const [e] = debug.spawnMany(id, lane, 1, d); d += ENEMY_TYPES[id].radius * 2.2 + .6; }
  },
  // One of each type side by side across the road at lane distance d (use with hold for a gallery).
  lineup(lane = 0, d = 60) {
    const ids = ['hound', 'raider', 'manatarms', 'brute', 'warlord', 'ram'], ds = [0, 2.2, 4.4, 7.2, 11, 17];
    return ids.map((id, i) => { const [e] = debug.spawnMany(id, lane, 1, d + ds[i]); e.lat = e.latHome = 0; place(e, 0); return e; });
  },
  simulate(seconds, step = 1 / 60) { for (let t = 0; t < seconds; t += step) { state.time += step; update(step); } },
  damageAll(frac = .5, type = 'magic') { for (const e of state.enemies.slice()) damageEnemy(e, e.maxHp * frac * (.5 + Math.random()), { type }); },
  killSome(n = 5) { for (const e of state.enemies.slice(0, n)) damageEnemy(e, 1e9, { type: 'magic' }); },
  slowAll(factor = .5, duration = 8) { for (const e of state.enemies) damageEnemy(e, 0.01, { type: 'magic', slow: { factor, duration } }); },
  clear() { state.enemies.length = 0; ghosts.length = 0; },
  // Point the camera at lane distance d from a given range (metres), height and side.
  look(lane = 0, d = 60, range = 9, up = 3.5, side = 1, ahead = .5) {
    const L = lanes[lane], p = L.pointAt(d), dir = L.directionAt(d);
    controls.minDistance = .5; controls.enableDamping = false;
    controls.target.set(p.x, p.y + 1.1, p.z);
    camera.position.set(p.x - dir.z * range * side + dir.x * range * ahead, p.y + up, p.z + dir.x * range * side + dir.z * range * ahead);
    controls.update();
  },
  // Close-up of one unit on the stone bridge. angle: 0 = from the front, PI/2 = from its left side.
  portrait(typeId, range = 4, up = 1.5, angle = .6, aimY = null, d = 78) {
    debug.hold = true;
    const [e] = debug.spawnMany(typeId, 1, 1, d); e.lat = e.latHome = 0; place(e, 0); debug.simulate(.4);
    const L = lanes[1], dir = L.directionAt(e.dist), a = Math.atan2(dir.x, dir.z) + angle;
    controls.minDistance = .5; controls.enableDamping = false;
    controls.target.set(e.pos.x, e.pos.y + (aimY ?? ENEMY_TYPES[typeId].height * .5), e.pos.z);
    camera.position.set(e.pos.x + Math.sin(a) * range, controls.target.y + up, e.pos.z + Math.cos(a) * range);
    controls.update();
    return e;
  },
  stats() { return { live: state.enemies.length, ghosts: ghosts.length, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, modelTris: Object.fromEntries(Object.entries(models).map(([k, m]) => [k, m.triangles])) }; },
};
