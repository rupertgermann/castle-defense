// Damage resolution as one table: armour × damage type × armorPierce, run headless (`node work/damage-test.mjs`).
// enemies.js reaches the renderer only through scene.js / core.js / enemies-models.js, so those are stubbed with plain modules.
import assert from 'node:assert/strict';
import { register } from 'node:module';

const stub = { 'scene.js': `export * as THREE from '${import.meta.resolve('three')}'; export const scene = {}, camera = {}, renderer = {}, height = () => 0, bridgeDeck = () => null, world = {};`,
  'core.js': 'export const state = { time: 0, enemies: [] }, bus = { emit() {} }, lanes = [];', 'enemies-models.js': 'export const buildModels = () => ({});' };
register('data:text/javascript,' + encodeURIComponent(`const stub = ${JSON.stringify(stub)};
export const resolve = (spec, ctx, next) => { const k = Object.keys(stub).find(k => spec.endsWith('/' + k));
  return k ? { url: 'data:text/javascript,' + encodeURIComponent(stub[k]), shortCircuit: true } : next(spec, ctx); };`));
const THREE = await import('three');
const { damageEnemy, ENEMY_TYPES } = await import('./game/enemies.js');

const foe = armor => ({ typeId: 'raider', hp: 1e6, maxHp: 1e6, alive: true, armor, pos: new THREE.Vector3(), height: 2, stagger: 0, barA: 0, slowUntil: 0 });
const dealt = (armor, amount, opts) => { const e = foe(armor); damageEnemy(e, amount, opts); return 1e6 - e.hp; };
const close = (a, b) => assert(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
//            armor  amount  options                              dealt
for (const [a, n, o, want] of [
  [0,   100, { type: 'pierce' },                    100],
  [.5,  100, { type: 'pierce' },                    50],
  [.5,  100, { type: 'pierce', armorPierce: .6 },   80],
  [.35, 190, { type: 'pierce', armorPierce: .8 },   190 * (1 - .35 * .2)],
  [.5,  100, { type: 'blast' },                     100],
  [.5,  100, { type: 'magic' },                     100],
  [.5,  100, { type: 'fire', armorPierce: .6 },     100],
]) close(dealt(a, n, o), want);
// Ballista parity with the old pre-scaled bolt: amount·(1 − a(1 − p))/(1 − a), then the foe's own (1 − a).
for (const a of Object.values(ENEMY_TYPES).map(t => t.armor)) for (const p of [.6, .7, .8])
  close(dealt(a, 100, { type: 'pierce', armorPierce: p }), a > 0 ? 100 * (1 - a * (1 - p)) / (1 - a) * (1 - a) : 100);
console.log('damage table ok');
