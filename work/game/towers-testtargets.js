// TEST ONLY: dummy walkers mimicking the enemy contract shape, for developing towers before enemies.js exists.
// Not imported by towers.js. To use, temporarily make enemies.js `export * from './towers-testtargets.js'`.
import { THREE, scene } from '../scene.js';
import { state, bus, lanes } from './core.js';

const geo = new THREE.CapsuleGeometry(.45, 1.0, 4, 8).translate(0, .95, 0);
const mat = new THREE.MeshStandardMaterial({ color: '#8a3a2a', roughness: .8 });
let id = 1;
export const ENEMY_TYPES = { dummy: { name: 'Dummy', hp: 400, speed: 4, bounty: 5, damage: 1, armor: .3, radius: .6, height: 1.9 } };
export function spawnDummy(laneIndex = 0, count = 1, { gap = 3, start = 0, speed = 4, hp = 400 } = {}) {
  for (let i = 0; i < count; i++) {
    const e = { id: id++, typeId: 'dummy', hp, maxHp: hp, alive: true, lane: laneIndex, dist: start + i * gap, pos: new THREE.Vector3(), velocity: new THREE.Vector3(), radius: .6, height: 1.9, bounty: 5, slowFactor: 1, speed, slowT: 0, armor: .3 };
    e.mesh = new THREE.Mesh(geo, mat); scene.add(e.mesh);
    lanes[laneIndex].pointAt(e.dist, e.pos); state.enemies.push(e);
  }
}
export function damageEnemy(e, amount, { type = 'pierce', slow = null } = {}) {
  if (!e.alive) return false;
  if (type === 'pierce') amount *= 1 - e.armor;
  if (slow) { e.slowFactor = slow.factor; e.slowT = slow.duration; }
  e.hp -= amount; bus.emit('enemy:hit', { enemy: e, amount, damageType: type, pos: e.pos.clone() });
  if (e.hp <= 0) { e.alive = false; e.mesh.removeFromParent(); state.enemies.splice(state.enemies.indexOf(e), 1); bus.emit('enemy:death', { enemy: e, pos: e.pos.clone() }); return true; }
  return false;
}
export function enemiesInRadius(pos, r) { return state.enemies.filter(e => e.alive && e.pos.distanceTo(pos) <= r + e.radius); }
export function init() {}
const prev = new THREE.Vector3();
export function update(dt) {
  for (const e of [...state.enemies]) {
    if ((e.slowT -= dt) <= 0) e.slowFactor = 1;
    const L = lanes[e.lane]; e.dist += e.speed * e.slowFactor * dt;
    if (e.dist >= L.length) e.dist = 0;
    prev.copy(e.pos); L.pointAt(e.dist, e.pos);
    if (dt > 0) e.velocity.subVectors(e.pos, prev).divideScalar(dt);
    e.mesh.position.copy(e.pos);
  }
}
