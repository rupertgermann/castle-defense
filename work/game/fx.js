// FX: particles, decals, debris, coins, floating text, screen shake, castle damage, ambient life. Event-driven only.
// Particles and decals render in their own pass inserted after GTAO (so AO never darkens them and bloom still sees hot cores);
// they depth-test and soft-fade against GTAO's scene depth texture in the shader.
import { THREE, scene, camera, controls, renderer, composer, height, bridgeDeck, BASE, world } from '../scene.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import { state, bus, lanes, gatePoint } from './core.js';
import * as enemiesMod from './enemies.js';
import { makeAtlas, FR } from './fx-atlas.js';

const R = Math.random, rr = a => typeof a === 'number' ? a : a[0] + R() * (a[1] - a[0]);
const col = (hex, k = 1) => { const c = new THREE.Color(hex); return [c.r * k, c.g * k, c.b * k]; };
const WIND = [1.1, 0, .45];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const groundAt = (x, z) => {
  const b = bridgeDeck, h = height(x, z);
  return x > b.x0 && x < b.x1 && Math.abs(z - b.z) < b.halfWidth ? Math.max(h, b.y) : h;
};

// ───────────────────────────── presets ─────────────────────────────
// spread: 0 sphere, 1 upper hemisphere, 2 horizontal ring, 3 cone around dir, 4 implode (start on shell, fly inward)
const P = o => { const p = { n: 1, life: 1, size: 1, grow: 1, speed: 0, spread: 0, cone: .5, up: 0, off: 0, c0: [1, 1, 1], cvar: .12, alpha: 1, fin: .05, fout: 1, add: 0, frame: [0, 1], grav: 0, drag: 0, wind: 0, stretch: 0, spin: [-1, 1], lit: 0, anim: 0, amb: 0, ...o }; p.c1 ||= p.c0; return p; };
const S = FR.SMOKE, SM3 = [FR.SMOKE, 3];
const PR = {
  // cannon explosion
  flash: P({ life: [.1, .13], size: [7, 8], grow: 1.4, c0: col('#fff1d0', 7), c1: col('#ffb060', 2), add: 1, fin: .01, fout: 1.5 }),
  hotCore: P({ n: 3, life: [.12, .2], size: [1.3, 1.8], grow: 1.8, speed: [1, 4], spread: 0, c0: col('#fff4dc', 5), c1: col('#ffa040', 2.5), add: 1, frame: SM3, drag: 4, fin: .01, spin: [-2, 2] }),
  fireball: P({ n: 20, life: [.4, .8], size: [1.3, 2], grow: [1.8, 2.3], speed: [4, 10], spread: 0, up: [1, 3], off: 1, c0: col('#ffa845', 3), c1: col('#6a1a04', .3), cvar: .25, alpha: .85, add: .85, frame: SM3, drag: 5, grav: -3, fin: .02, fout: 1.1, spin: [-2, 2] }),
  sparks: P({ n: 36, life: [.4, 1.1], size: [.16, .28], speed: [10, 26], spread: 1, up: [2, 6], c0: col('#ffe0a0', 8), c1: col('#ff6a20', 2), add: 1, frame: [FR.EMBER, 1], grav: 16, drag: 1.3, stretch: .07, fout: .7 }),
  bigSmoke: P({ n: 18, life: [3, 5], size: [1.6, 2.6], grow: [2.4, 3.2], speed: [3, 8], spread: 1, up: [1.5, 3.5], off: 1.5, c0: col('#3a332c'), c1: col('#a39c90'), cvar: .18, alpha: .78, fin: .06, fout: 1.2, frame: SM3, drag: 2, grav: -1.4, wind: 1, lit: 1, spin: [-.5, .5] }),
  groundDust: P({ n: 18, life: [1.4, 2.4], size: [1.3, 1.9], grow: [2.6, 3.4], speed: [8, 14], spread: 2, up: [.4, 1.2], c0: col('#b09a78'), c1: col('#d4c8ae'), alpha: .75, fin: .04, fout: 1.5, frame: [FR.DUST, 1], drag: 3.2, wind: .6, lit: 1, spin: [-.4, .4] }),
  clods: P({ n: 20, life: [.9, 1.4], size: [.18, .38], speed: [7, 15], spread: 3, cone: .7, c0: col('#3d3226'), c1: col('#4a3f33'), alpha: 1, fin: .01, fout: .3, frame: [FR.CHUNK, 1], grav: 20, drag: .5, spin: [-8, 8] }),
  column: P({ life: [5, 7.5], size: [1.8, 2.6], grow: [2.6, 3.6], speed: [.3, .9], spread: 1, up: [3, 4.5], off: .9, c0: col('#433d36'), c1: col('#aaa498'), cvar: .12, alpha: .55, fin: .08, fout: 1.2, frame: SM3, drag: .9, wind: 1.3, lit: 1, spin: [-.3, .3] }),
  // small impacts
  puff: P({ n: 5, life: [.6, 1.1], size: [.3, .45], grow: [2.2, 3], speed: [.8, 2.2], spread: 1, up: [.5, 1.2], c0: col('#b09a7a'), c1: col('#cfc3aa'), alpha: .55, frame: [FR.DUST, 1], drag: 3, wind: .5, lit: 1, fout: 1.5 }),
  splinter: P({ n: 5, life: [.4, .7], size: [.22, .34], speed: [3, 6], spread: 3, cone: .8, c0: col('#7a5d3c'), c1: col('#5a4430'), frame: [FR.SPLINTER, 1], grav: 14, drag: .6, spin: [-14, 14], fout: .4 }),
  spark: P({ n: 9, life: [.12, .3], size: [.06, .11], speed: [8, 18], spread: 3, cone: .9, c0: col('#fff4d8', 8), c1: col('#ffa050', 3), add: 1, grav: 9, drag: 2, stretch: .045 }),
  sparkFlash: P({ life: .07, size: [.9, 1.2], c0: col('#fff2d8', 5), add: 1, fin: .01, fout: 2 }),
  kick: P({ n: 9, life: [.5, .8], size: [.1, .2], speed: [4, 8], spread: 3, cone: .45, c0: col('#4a3c2c'), frame: [FR.CHUNK, 1], grav: 18, drag: .4, spin: [-8, 8], fout: .3 }),
  // arcane
  arcCore: P({ life: [.22, .3], size: [3.2, 3.8], grow: 1.6, c0: col('#f1e2ff', 6), c1: col('#8c5ee8', 1.5), add: 1, fin: .02, fout: 1.4 }),
  arcGlow: P({ life: [1.2, 1.6], size: [3.5, 4.2], grow: .8, c0: col('#9a78e0', .9), c1: col('#4f78c8', .3), add: 1, alpha: .5, fin: .1, fout: 1.2 }),
  sparkle: P({ n: 22, life: [.6, 1.3], size: [.25, .45], grow: .3, speed: [3, 8], spread: 0, c0: col('#e6f6ff', 4), c1: col('#b690ff', 1.6), add: 1, drag: 3.2, grav: -.6, frame: [FR.STAR, 1], spin: [-3, 3] }),
  shard: P({ n: 10, life: [.5, .8], size: [.3, .55], speed: [5, 10], spread: 1, up: [1, 3], c0: col('#e4f6ff', 1.8), c1: col('#9fc7ef', 1), add: .5, frame: [FR.SHARD, 1], grav: 12, drag: 1, spin: [-9, 9], fout: .6 }),
  motes: P({ n: 10, life: [1.2, 2.2], size: [.1, .18], speed: [.3, 1], spread: 0, up: [.8, 1.8], off: 1.2, c0: col('#d2eaff', 3), c1: col('#a07cff', 1), add: 1, drag: 1, frame: [FR.EMBER, 1], fin: .2 }),
  // muzzles
  muzzle: P({ life: .08, size: [2.6, 3.2], grow: 1.3, c0: col('#ffe6b0', 7), c1: col('#ff9040', 3), add: 1, fin: .01, fout: 1.5 }),
  muzzleFlame: P({ n: 7, life: [.12, .22], size: [.5, .8], grow: [1.8, 2.4], speed: [8, 16], spread: 3, cone: .22, c0: col('#ffd89a', 5), c1: col('#e05a18', 1), add: .9, frame: SM3, drag: 7 }),
  muzzleSmoke: P({ n: 8, life: [1.4, 2.6], size: [.6, .9], grow: [2.8, 3.8], speed: [2, 6], spread: 3, cone: .35, c0: col('#a8a298'), c1: col('#cbc6bb'), alpha: .55, fin: .05, fout: 1.5, frame: SM3, drag: 2.8, grav: -.4, wind: 1, lit: 1, spin: [-.6, .6] }),
  twang: P({ n: 7, life: [.6, 1], size: [.3, .5], grow: [2, 2.6], speed: [1.2, 2.4], spread: 2, c0: col('#b8a585'), c1: col('#d2c6ae'), alpha: .4, frame: [FR.DUST, 1], drag: 3, wind: .5, lit: 1 }),
  charge: P({ life: .3, size: [2.2, 2.6], grow: .4, c0: col('#e8d8ff', 4), c1: col('#9068ff', 1.5), add: 1, fin: .3, fout: 1 }),
  chargeIn: P({ n: 12, life: [.25, .35], size: [.12, .2], speed: [3.5, 4.5], spread: 4, off: 1.3, c0: col('#d8f0ff', 3), c1: col('#c0a0ff', 4), add: 1, frame: [FR.EMBER, 1], fin: .2, fout: .5 }),
  arrowDust: P({ n: 2, life: [.4, .6], size: [.18, .25], grow: 2, speed: [.4, .8], spread: 3, cone: .5, c0: col('#c8b99c'), alpha: .3, frame: [FR.DUST, 1], drag: 2, lit: 1 }),
  // hits, deaths
  ping: P({ n: 7, life: [.1, .22], size: [.05, .09], speed: [6, 13], spread: 0, c0: col('#ffffff', 8), c1: col('#ffc27a', 3), add: 1, grav: 8, drag: 2.5, stretch: .04 }),
  pingStar: P({ life: .12, size: [.9, 1.1], grow: .6, c0: col('#fff8e8', 5), add: 1, frame: [FR.STAR, 1], fin: .01, spin: [-3, 3] }),
  hitDust: P({ n: 3, life: [.35, .55], size: [.2, .3], grow: 2, speed: [1, 2.5], spread: 0, c0: col('#b8a88c'), alpha: .45, frame: [FR.DUST, 1], drag: 3, lit: 1 }),
  deathDust: P({ n: 11, life: [1.1, 2], size: [.6, .9], grow: [2.4, 3.2], speed: [1.5, 3.5], spread: 2, up: [.4, 1.2], off: .4, c0: col('#9c8a6e'), c1: col('#c9bda4'), alpha: .6, frame: [FR.DUST, 1], drag: 2.6, wind: .5, lit: 1, fout: 1.5 }),
  coinGlint: P({ life: .28, size: [.7, 1], grow: .3, c0: col('#fff0b8', 5), add: 1, frame: [FR.STAR, 1], fin: .15, spin: [-4, 4] }),
  // build / sell
  buildRing: P({ n: 26, life: [1.1, 1.8], size: [1.2, 1.8], grow: [2.2, 3], speed: [5, 9], spread: 2, off: 1.5, c0: col('#9c876a'), c1: col('#c4b69a'), alpha: .6, frame: [FR.DUST, 1], drag: 3.6, wind: .4, lit: 1 }),
  rise: P({ n: 26, life: [1, 1.8], size: [.2, .4], grow: .2, speed: [.3, 1], spread: 2, off: 2.8, up: [2.5, 6], c0: col('#fff0c0', 4), c1: col('#ffbe60', 1.5), add: 1, frame: [FR.STAR, 1], drag: .8, spin: [-2, 2] }),
  upFlash: P({ life: .5, size: [6, 7], grow: 1.3, c0: col('#ffe2a0', 2.2), c1: col('#ffb050', .3), add: 1, fin: .1, fout: 1.5 }),
  collapse: P({ n: 20, life: [1.6, 2.6], size: [1.2, 1.8], grow: [2, 2.8], speed: [2, 5], spread: 1, off: 2.2, up: [-.5, 1.5], c0: col('#948266'), c1: col('#c3b69c'), alpha: .7, frame: [FR.DUST, 1], drag: 2, wind: .6, lit: 1, fout: 1.4 }),
  // gate breach
  redFlash: P({ life: [.2, .25], size: [9, 10], grow: 1.4, c0: col('#ff7048', 4), c1: col('#a01808', 1), add: 1, fin: .02, fout: 1.3 }),
  // fire
  flame: P({ life: [.5, .9], size: [2.2, 3.1], grow: [.3, .5], speed: [.2, .6], spread: 0, up: [2.2, 3.6], off: 1.1, c0: col('#ffa24a', 2.4), c1: col('#b82a06', .9), cvar: .2, add: .95, frame: [FR.FLAME, 1], grav: -2.5, drag: 1.5, wind: .5, fin: .15, spin: [-.15, .15], upright: 1 }),
  fireGlow: P({ life: [.5, .8], size: [4.5, 6], grow: .8, off: .5, up: [.5, 1], c0: col('#ff8a3a', 1.2), c1: col('#c83a10', .6), alpha: .45, add: 1, fin: .3, fout: 1 }),
  flameCore: P({ life: [.3, .5], size: [1.4, 1.9], grow: .5, speed: .2, up: [1, 2], off: .4, c0: col('#ffd48a', 2.6), c1: col('#ff7020', 1.4), alpha: .8, add: 1, frame: SM3, drag: 1, fin: .2, spin: [-1, 1] }),
  ember: P({ life: [1.2, 2.4], size: [.07, .12], speed: [.5, 1.5], spread: 0, up: [2, 5], off: .8, c0: col('#ffc070', 7), c1: col('#ff4a10', 2), add: 1, frame: [FR.EMBER, 1], drag: .9, wind: 1.6, stretch: .03, fout: .8 }),
  plume: P({ life: [6, 9], size: [1.2, 1.7], grow: [3.6, 4.8], speed: [.3, .8], spread: 1, up: [2.8, 4], off: .8, c0: col('#2e2925'), c1: col('#9a948b'), cvar: .15, alpha: .36, fin: .05, fout: 1.2, frame: SM3, drag: .7, wind: 1.6, grav: -.15, lit: 1, spin: [-.25, .25] }),
  // ambient
  chimney: P({ life: [7, 10], size: [.35, .5], grow: [7, 10], speed: [.05, .2], spread: 1, up: [1.5, 2.1], off: .15, c0: col('#aaa69e'), c1: col('#d4d2cb'), cvar: .06, alpha: .2, fin: .22, fout: 1.3, frame: SM3, drag: .35, wind: 1, lit: 1, spin: [-.2, .2], amb: 1 }),
  snow: P({ life: [7, 11], size: [.09, .16], speed: [.05, .3], spread: 0, c0: col('#f4f8ff', 1.6), alpha: .85, fin: .15, fout: .6, add: .6, frame: [FR.EMBER, 1], grav: .35, drag: .5, wind: .9, amb: 1 }),
  pollen: P({ life: [6, 10], size: [.1, .17], speed: [.05, .25], spread: 0, c0: col('#fff2c8', 2.4), alpha: .7, fin: .3, fout: 1, add: 1, frame: [FR.EMBER, 1], drag: .4, wind: .25, amb: 1 }),
  crow: P({ life: [5, 7], size: [1.9, 2.4], c0: col('#1a1816'), cvar: .1, alpha: .95, fin: .04, fout: .35, frame: [FR.BIRD, 1], anim: 1, drag: .15, grav: -.5 }),
  // fireworks
  rocketTrail: P({ life: [.4, .7], size: [.3, .45], speed: [.3, 1.2], c0: col('#ffe0a8', 5), c1: col('#ff7a30', 1), add: 1, frame: [FR.EMBER, 1], grav: 3, drag: 2 }),
  fwSpark: P({ n: 110, life: [1.6, 2.6], size: [1.5, 2.1], grow: .6, speed: [24, 32], spread: 0, c0: col('#ffffff', 6), add: 1, frame: [FR.EMBER, 1], grav: 4, drag: 1.4, stretch: .1, fout: .6 }),
  fwGlow: P({ life: [.9, 1.1], size: [26, 30], grow: 1.3, c0: col('#ffffff', .5), add: 1, alpha: .8, fin: .03, fout: 2 }),
  fwCrackle: P({ n: 30, life: [.3, .7], size: [1, 1.6], grow: .3, speed: [3, 12], spread: 0, c0: col('#fff4e0', 5), add: 1, frame: [FR.STAR, 1], drag: 2, spin: [-5, 5] }),
  fwFlash: P({ life: .25, size: [22, 26], grow: 1.3, c0: col('#fff0d8', 1.6), add: 1, fin: .02, fout: 1.5 }),
  fwSmoke: P({ n: 6, life: [3, 5], size: [2, 3], grow: [2, 3], speed: [1, 3], spread: 0, c0: col('#b8b0a4'), c1: col('#d0ccc4'), alpha: .18, frame: SM3, drag: 1.2, wind: 1.2, lit: 1 }),
};
const FW_COLORS = [col('#ffc860', 6), col('#fff0d8', 6), col('#ff8a70', 5), col('#9fe8c4', 5), col('#c8a8ff', 5), col('#ffb040', 6)];
const EMBER_END = col('#ff5a18', .8);

// ───────────────────────────── particle system ─────────────────────────────
const MAX = 9000;
const px = new Float32Array(MAX), py = new Float32Array(MAX), pz = new Float32Array(MAX), vx = new Float32Array(MAX), vy = new Float32Array(MAX), vz = new Float32Array(MAX);
const age = new Float32Array(MAX), life = new Float32Array(MAX), s0 = new Float32Array(MAX), s1 = new Float32Array(MAX), rot = new Float32Array(MAX), rv = new Float32Array(MAX);
const c0 = new Float32Array(MAX * 3), c1 = new Float32Array(MAX * 3), frm = new Float32Array(MAX), pre = new Array(MAX);
let count = 0;
const ARR = [px, py, pz, vx, vy, vz, age, life, s0, s1, rot, rv, frm];
// Two instanced sets, so alpha-blended particles (smoke, dust) always draw beneath additive ones (fire, sparks).
const sets = [];

function burst(pr, x, y, z, sc = 1, n = pr.n, dx = 0, dy = 1, dz = 0, col0 = null, col1 = null) {
  for (let k = 0; k < n && count < MAX; k++) {
    const i = count++;
    let u = R() * 2 - 1, a = R() * 6.2832, s = Math.sqrt(1 - u * u), ux = s * Math.cos(a), uy = u, uz = s * Math.sin(a);
    const sp = rr(pr.speed) * sc, off = pr.off * sc * Math.cbrt(R());
    switch (pr.spread) {
      case 1: uy = Math.abs(uy); break;
      case 2: uy = (R() - .5) * .15; { const l = Math.hypot(ux, uz) || 1; ux /= l; uz /= l; } break;
      case 3: { ux = dx + ux * pr.cone; uy = dy + uy * pr.cone; uz = dz + uz * pr.cone; const l = Math.hypot(ux, uy, uz) || 1; ux /= l; uy /= l; uz /= l; } break;
    }
    if (pr.spread === 4) { px[i] = x + ux * off; py[i] = y + uy * off; pz[i] = z + uz * off; vx[i] = -ux * sp; vy[i] = -uy * sp; vz[i] = -uz * sp; }
    else { px[i] = x + ux * off; py[i] = y + uy * off; pz[i] = z + uz * off; vx[i] = ux * sp; vy[i] = uy * sp + rr(pr.up) * sc; vz[i] = uz * sp; }
    age[i] = 0; life[i] = rr(pr.life); s0[i] = rr(pr.size) * sc; s1[i] = s0[i] * rr(pr.grow);
    rot[i] = pr.upright ? (R() - .5) * .35 : R() * 6.2832; rv[i] = rr(pr.spin); frm[i] = pr.frame[0] + Math.floor(R() * pr.frame[1]);
    const v = 1 + (R() * 2 - 1) * pr.cvar, A = col0 || pr.c0, B = col1 || col0 || pr.c1;
    for (let j = 0; j < 3; j++) { c0[i * 3 + j] = A[j] * v; c1[i * 3 + j] = B[j] * v; }
    pre[i] = pr;
  }
}
function killParticle(i) {
  const j = --count;
  if (i === j) return;
  for (const a of ARR) a[i] = a[j];
  for (let k = 0; k < 3; k++) { c0[i * 3 + k] = c0[j * 3 + k]; c1[i * 3 + k] = c1[j * 3 + k]; }
  pre[i] = pre[j];
}
function updateParticles(dt, realDt) {
  for (const s of sets) s.n = 0;
  for (let i = 0; i < count; i++) {
    const pr = pre[i], h = pr.amb ? realDt : dt;
    age[i] += h;
    if (age[i] >= life[i]) { killParticle(i); i--; continue; }
    if (h > 0) {
      const e = Math.exp(-pr.drag * h), wx = WIND[0] * pr.wind, wz = WIND[2] * pr.wind;
      vx[i] = wx + (vx[i] - wx) * e; vy[i] = vy[i] * e - pr.grav * h; vz[i] = wz + (vz[i] - wz) * e;
      px[i] += vx[i] * h; py[i] += vy[i] * h; pz[i] += vz[i] * h;
      if (!pr.anim) rot[i] += rv[i] * h;
    }
    const t = age[i] / life[i], ti = 1 - t;
    const size = s0[i] + (s1[i] - s0[i]) * (1 - ti * ti * ti);
    const alpha = pr.alpha * Math.min(1, t / pr.fin) * Math.pow(ti, pr.fout);
    const set = sets[pr.add >= .5 ? 1 : 0], k4 = set.n++ * 4, A = set.A, B = set.B, Cc = set.C, D = set.D;
    A[k4] = px[i]; A[k4 + 1] = py[i]; A[k4 + 2] = pz[i]; A[k4 + 3] = size;
    B[k4] = vx[i]; B[k4 + 1] = vy[i]; B[k4 + 2] = vz[i]; B[k4 + 3] = pr.anim ? 0 : rot[i];
    const k3 = i * 3;
    Cc[k4] = c0[k3] + (c1[k3] - c0[k3]) * t; Cc[k4 + 1] = c0[k3 + 1] + (c1[k3 + 1] - c0[k3 + 1]) * t; Cc[k4 + 2] = c0[k3 + 2] + (c1[k3 + 2] - c0[k3 + 2]) * t; Cc[k4 + 3] = alpha;
    D[k4] = pr.anim ? frm[i] + ((age[i] * 7 + rv[i] * 5 + 10) | 0) % 2 : frm[i]; D[k4 + 1] = pr.add; D[k4 + 2] = pr.stretch; D[k4 + 3] = pr.lit;
  }
  for (const s of sets) {
    for (const a of s.attrs) { a.clearUpdateRanges(); a.addUpdateRange(0, s.n * 4); a.needsUpdate = true; }
    s.geo.instanceCount = s.n;
  }
}

// ───────────────────────────── decals (deferred, projected onto the depth buffer) ─────────────────────────────
const DMAX = 64;
const dPos = new Float32Array(DMAX * 4), dAge = new Float32Array(DMAX), dLife = new Float32Array(DMAX), dKind = new Uint8Array(DMAX), dAlpha = new Float32Array(DMAX), dAng = new Float32Array(DMAX), dCol = new Float32Array(DMAX * 4), dHeat = new Float32Array(DMAX);
let dCount = 0, dGeo, dA, dB, dC;
// kind 0 stain (scorch/frost), 1 expanding ring
function decal(kind, x, y, z, r, lifeS, alpha, color, add = 0, heat = 0) {
  let i = dCount < DMAX ? dCount++ : 0;
  if (dCount >= DMAX && i === 0) { let best = 0; for (let k = 1; k < DMAX; k++) if (dAge[k] / dLife[k] > dAge[best] / dLife[best]) best = k; i = best; }
  dPos[i * 4] = x; dPos[i * 4 + 1] = y; dPos[i * 4 + 2] = z; dPos[i * 4 + 3] = r;
  dAge[i] = 0; dLife[i] = lifeS; dKind[i] = kind; dAlpha[i] = alpha; dAng[i] = R() * 6.28; dHeat[i] = heat;
  dCol[i * 4] = color[0]; dCol[i * 4 + 1] = color[1]; dCol[i * 4 + 2] = color[2]; dCol[i * 4 + 3] = add;
}
function updateDecals(dt) {
  const A = dA.array, B = dB.array, Cc = dC.array;
  for (let i = 0; i < dCount; i++) {
    dAge[i] += dt;
    if (dAge[i] >= dLife[i]) {
      const j = --dCount;
      if (i !== j) {
        for (let k = 0; k < 4; k++) { dPos[i * 4 + k] = dPos[j * 4 + k]; dCol[i * 4 + k] = dCol[j * 4 + k]; }
        dAge[i] = dAge[j]; dLife[i] = dLife[j]; dKind[i] = dKind[j]; dAlpha[i] = dAlpha[j]; dAng[i] = dAng[j]; dHeat[i] = dHeat[j];
      }
      i--; continue;
    }
    const t = dAge[i] / dLife[i];
    for (let k = 0; k < 4; k++) { A[i * 4 + k] = dPos[i * 4 + k]; Cc[i * 4 + k] = dCol[i * 4 + k]; }
    B[i * 4] = dAng[i]; B[i * 4 + 2] = dKind[i];
    if (dKind[i] === 0) { B[i * 4 + 1] = dAlpha[i] * Math.min(1, dAge[i] * 12) * (1 - Math.max(0, (t - .55) / .45) ** 2); B[i * 4 + 3] = dHeat[i] * Math.max(0, 1 - dAge[i] / 1.4) ** 2; }
    else { B[i * 4 + 1] = dAlpha[i] * (1 - t) ** 1.6; B[i * 4 + 3] = 1 - (1 - t) ** 3; }
  }
  for (const a of [dA, dB, dC]) { a.clearUpdateRanges(); a.addUpdateRange(0, dCount * 4); a.needsUpdate = true; }
  dGeo.instanceCount = dCount;
}

// ───────────────────────────── debris + coins (lit meshes in the main scene) ─────────────────────────────
const BMAX = 360, CMAX = 180;
const dummy = new THREE.Object3D(), tmpColor = new THREE.Color();
const bP = new Float32Array(BMAX * 3), bV = new Float32Array(BMAX * 3), bR = new Float32Array(BMAX * 3), bW = new Float32Array(BMAX * 3), bS = new Float32Array(BMAX * 3), bC = new Float32Array(BMAX * 3), bAge = new Float32Array(BMAX), bLife = new Float32Array(BMAX), bSmoke = new Float32Array(BMAX);
let bCount = 0, debrisMesh;
const DEBRIS = { stone: col('#8f8a78'), dirt: col('#5a4a38'), wood: col('#6a4e32'), char: col('#2a2522') };
function debris(x, y, z, n, speed, colors, sizeA, sizeB, smoke = 0, flat = false) {
  for (let k = 0; k < n && bCount < BMAX; k++) {
    const i = bCount++, a = R() * 6.2832, up = .45 + R() * .75, sp = speed * (.45 + R() * .7);
    bP[i * 3] = x + Math.cos(a) * .3; bP[i * 3 + 1] = y + .2; bP[i * 3 + 2] = z + Math.sin(a) * .3;
    bV[i * 3] = Math.cos(a) * sp * (1 - up * .5); bV[i * 3 + 1] = sp * up * 1.3; bV[i * 3 + 2] = Math.sin(a) * sp * (1 - up * .5);
    for (let j = 0; j < 3; j++) { bR[i * 3 + j] = R() * 6.28; bW[i * 3 + j] = (R() * 2 - 1) * 12; }
    const s = sizeA + R() * (sizeB - sizeA), c = colors[(R() * colors.length) | 0], v = .8 + R() * .4;
    bS[i * 3] = s * (flat ? 2.6 : 1 + R() * .5); bS[i * 3 + 1] = s * (flat ? .35 : .6 + R() * .4); bS[i * 3 + 2] = s * (flat ? .5 : .8 + R() * .4);
    bC[i * 3] = c[0] * v; bC[i * 3 + 1] = c[1] * v; bC[i * 3 + 2] = c[2] * v;
    bAge[i] = 0; bLife[i] = 2.6 + R() * 1.6; bSmoke[i] = k < smoke ? 1 : 0;
  }
}
function updateDebris(dt) {
  for (let i = 0; i < bCount; i++) {
    bAge[i] += dt;
    if (bAge[i] >= bLife[i]) {
      const j = --bCount;
      if (i !== j) { for (const a of [bP, bV, bR, bW, bS, bC]) for (let k = 0; k < 3; k++) a[i * 3 + k] = a[j * 3 + k]; bAge[i] = bAge[j]; bLife[i] = bLife[j]; bSmoke[i] = bSmoke[j]; }
      i--; continue;
    }
    const k = i * 3;
    bV[k + 1] -= 17 * dt;
    bP[k] += bV[k] * dt; bP[k + 1] += bV[k + 1] * dt; bP[k + 2] += bV[k + 2] * dt;
    for (let j = 0; j < 3; j++) bR[k + j] += bW[k + j] * dt;
    const g = groundAt(bP[k], bP[k + 2]) + bS[k + 1] * .4;
    if (bP[k + 1] < g) {
      bP[k + 1] = g;
      if (bV[k + 1] < -2.5) { bV[k + 1] *= -.32; bV[k] *= .55; bV[k + 2] *= .55; for (let j = 0; j < 3; j++) bW[k + j] *= .5; }
      else { bV[k] = bV[k + 1] = bV[k + 2] = 0; for (let j = 0; j < 3; j++) bW[k + j] = 0; }
      bSmoke[i] = 0;
    }
    if (bSmoke[i] && dt > 0 && R() < dt * 40) burst(PR.puff, bP[k], bP[k + 1], bP[k + 2], .7, 1);
    const shrink = Math.min(1, (bLife[i] - bAge[i]) / .6);
    dummy.position.set(bP[k], bP[k + 1] - (1 - shrink) * .3, bP[k + 2]); dummy.rotation.set(bR[k], bR[k + 1], bR[k + 2]); dummy.scale.set(bS[k] * shrink, bS[k + 1] * shrink, bS[k + 2] * shrink);
    dummy.updateMatrix(); debrisMesh.setMatrixAt(i, dummy.matrix); debrisMesh.setColorAt(i, tmpColor.setRGB(bC[k], bC[k + 1], bC[k + 2]));
  }
  debrisMesh.count = bCount; debrisMesh.instanceMatrix.needsUpdate = true; if (debrisMesh.instanceColor) debrisMesh.instanceColor.needsUpdate = true;
}
const cP = new Float32Array(CMAX * 3), cV = new Float32Array(CMAX * 3), cA = new Float32Array(CMAX), cW = new Float32Array(CMAX), cAge = new Float32Array(CMAX), cLife = new Float32Array(CMAX), cB = new Uint8Array(CMAX);
let cCount = 0, coinMesh;
function coins(x, y, z, n) {
  for (let k = 0; k < n && cCount < CMAX; k++) {
    const i = cCount++, a = k / n * 6.2832 + R() * .8, sp = 1.2 + R() * 1.8;
    cP[i * 3] = x; cP[i * 3 + 1] = y + .8; cP[i * 3 + 2] = z;
    cV[i * 3] = Math.cos(a) * sp; cV[i * 3 + 1] = 6 + R() * 3; cV[i * 3 + 2] = Math.sin(a) * sp;
    cA[i] = R() * 6.28; cW[i] = (R() < .5 ? -1 : 1) * (10 + R() * 8); cAge[i] = 0; cLife[i] = 1.25 + R() * .45; cB[i] = 0;
  }
}
function updateCoins(dt) {
  for (let i = 0; i < cCount; i++) {
    const k = i * 3;
    cAge[i] += dt;
    if (cAge[i] >= cLife[i]) {
      burst(PR.coinGlint, cP[k], cP[k + 1] + .2, cP[k + 2], 1, 1);
      const j = --cCount;
      if (i !== j) { for (const a of [cP, cV]) for (let q = 0; q < 3; q++) a[k + q] = a[j * 3 + q]; cA[i] = cA[j]; cW[i] = cW[j]; cAge[i] = cAge[j]; cLife[i] = cLife[j]; cB[i] = cB[j]; }
      i--; continue;
    }
    cV[k + 1] -= 18 * dt;
    cP[k] += cV[k] * dt; cP[k + 1] += cV[k + 1] * dt; cP[k + 2] += cV[k + 2] * dt; cA[i] += cW[i] * dt;
    const g = groundAt(cP[k], cP[k + 2]) + .3;
    if (cP[k + 1] < g && cV[k + 1] < 0) { cP[k + 1] = g; cV[k + 1] = cB[i]++ ? 0 : -cV[k + 1] * .38; cV[k] *= .5; cV[k + 2] *= .5; }
    const t = cAge[i] / cLife[i], s = Math.min(1, cAge[i] * 9) * (t > .75 ? 1 - (t - .75) / .25 : 1);
    dummy.position.set(cP[k], cP[k + 1], cP[k + 2]); dummy.rotation.set(.35, cA[i], 0); dummy.scale.setScalar(Math.max(.001, s));
    dummy.updateMatrix(); coinMesh.setMatrixAt(i, dummy.matrix);
  }
  coinMesh.count = cCount; coinMesh.instanceMatrix.needsUpdate = true;
}

// ───────────────────────────── emitters ─────────────────────────────
// Continuous spawners. Transient ones come from a pool; persistent ones (chimneys, castle fires, pollen) live forever.
const EPOOL = Array.from({ length: 128 }, () => ({ on: false }));
const persistent = [];
const E = (pr, x, y, z, rate, dur = 0, sc = 1, extra = null) => ({ on: true, pr, x, y, z, rate, dur, sc, t: 0, acc: 0, vx: 0, vy: 0, vz: 0, grav: 0, end: null, color: null, jitter: 0, ...extra });
function emitter(pr, x, y, z, rate, dur, sc = 1, extra = null) {
  return Object.assign(EPOOL.find(e => !e.on) || EPOOL[0], E(pr, x, y, z, rate, dur, sc, extra));
}
function runEmitter(e, dt, k = 1) {
  e.t += dt;
  if (e.vx || e.vy || e.vz) { e.vy -= e.grav * dt; e.x += e.vx * dt; e.y += e.vy * dt; e.z += e.vz * dt; }
  const fade = e.dur ? Math.max(0, Math.min(1, (1 - e.t / e.dur) / (e.hold || 1))) : 1;   // hold: fade only over that last fraction
  e.acc += e.rate * k * fade * dt;
  while (e.acc >= 1) { e.acc--; burst(e.pr, e.x + (R() - .5) * e.jitter, e.y, e.z + (R() - .5) * e.jitter, e.sc, 1, 0, 1, 0, e.color, e.color ? EMBER_END : null); }
  if (e.dur && e.t >= e.dur) { e.on = false; if (e.end === 'firework') fireworkBurst(e.x, e.y, e.z); }
}

// ───────────────────────────── lights, shake, text, overlay ─────────────────────────────
const flashes = [];
let fireLight;
function flash(pos, color, peak, dur, y = 2) {
  const f = flashes.reduce((a, b) => (a.light.intensity < b.light.intensity ? a : b));
  f.light.color.set(color); f.light.position.set(pos.x, pos.y + y, pos.z); f.peak = peak; f.t = 0; f.dur = dur;
}
let trauma = 0, shakeTime = 0, shaking = false;
// Overlapping events don't stack linearly: the strongest wins, extras add a little with diminishing returns.
export function shake(strength = .5) { if (!reducedMotion) trauma = trauma < strength ? strength : Math.min(1, trauma + strength * .2 * (1 - trauma)); }
function shakeAt(pos, strength) { shake(strength * Math.min(1.4, Math.max(.12, 110 / camera.position.distanceTo(pos)))); }
function updateShake(realDt) {
  shakeTime += realDt;
  trauma = Math.max(0, trauma - realDt * 1.5);
  const w = innerWidth, h = innerHeight;
  if (trauma > .002 && (state.phase === 'build' || state.phase === 'wave')) {
    const m = trauma * trauma * 26, t = shakeTime * 34;
    const ox = m * (Math.sin(t) * .6 + Math.sin(t * 2.31 + 1.3) * .4), oy = m * (Math.sin(t * 1.17 + 4.1) * .6 + Math.sin(t * 2.73 + .7) * .4);
    camera.setViewOffset(w, h, ox, oy, w, h);
  } else if (shaking) camera.clearViewOffset();
  shaking = trauma > .002 && (state.phase === 'build' || state.phase === 'wave');
}
const TMAX = 48, texts = [];
let textLayer, vignette, vignetteA = 0;
const proj = new THREE.Vector3();
export function floatText(pos, text, color = '#ffd35a') {
  const t = texts.find(t => !t.on) || texts.reduce((a, b) => (a.age > b.age ? a : b));
  t.on = true; t.age = 0; t.x = pos.x; t.y = pos.y; t.z = pos.z;
  t.el.textContent = text; t.el.style.color = color; t.el.style.display = 'block';
}
function updateTexts(realDt) {
  const w = innerWidth, h = innerHeight;
  for (const t of texts) {
    if (!t.on) continue;
    t.age += realDt;
    const life = 1.35, k = t.age / life;
    if (k >= 1) { t.on = false; t.el.style.display = 'none'; continue; }
    proj.set(t.x, t.y, t.z).project(camera);
    if (proj.z > 1) { t.el.style.opacity = 0; continue; }
    const rise = 58 * (1 - (1 - k) ** 3), pop = k < .12 ? .6 + k / .12 * .55 : Math.max(1, 1.15 - (k - .12) * 1.5);
    t.el.style.transform = `translate3d(${((proj.x + 1) * .5 * w).toFixed(1)}px,${((1 - proj.y) * .5 * h - rise).toFixed(1)}px,0) translate(-50%,-50%) scale(${pop.toFixed(3)})`;
    t.el.style.opacity = k < .65 ? 1 : 1 - (k - .65) / .35;
  }
  if (vignetteA > 0) { vignetteA = Math.max(0, vignetteA - realDt * 1.4); vignette.style.opacity = vignetteA.toFixed(3); }
}

// ───────────────────────────── castle damage ─────────────────────────────
// Fires near the gate. `stage` = minimum damage stage at which each one burns (1: <60% lives, 2: <30%, 3: lost).
const FIRES = world.fx.fires;
let forcedStage = null, damage = 0;
const castleFires = [];
function stageNow() {
  if (forcedStage !== null) return forcedStage;
  if (state.phase === 'lost' || state.lives <= 0) return 3;
  const f = state.lives / Math.max(1, state.maxLives);
  return f < .3 ? 2 : f < .6 ? 1 : 0;
}
function updateCastle(realDt) {
  const stage = stageNow();
  let lx = 0, ly = 0, lz = 0, sum = 0;
  for (const f of castleFires) {
    const target = stage >= f.stage ? 1 + (stage - f.stage) * .35 : 0;
    f.k += (target - f.k) * Math.min(1, realDt * (target > f.k ? .6 : 1.5));
    if (f.k < .01) continue;
    for (const e of f.emitters) runEmitter(e, realDt, f.k);
    lx += f.x * f.k; ly += f.y * f.k; lz += f.z * f.k; sum += f.k;
  }
  damage = sum;
  if (sum > .01) {
    fireLight.position.set(lx / sum, ly / sum + 2, lz / sum);
    fireLight.intensity = Math.min(3, sum) * 90 * (.8 + .2 * Math.sin(shakeTime * 13) * Math.sin(shakeTime * 7.3 + 1));
  } else fireLight.intensity = 0;
}

// ───────────────────────────── effects ─────────────────────────────
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
const SCORCH = col('#0e0b09'), FROST = col('#8ea6b8', .7), RING = col('#d8c8a6', .8), ARC_RING = col('#a890f0', 1.6), RED_RING = col('#ff8060', 2);

function explosion(p, radius = 3) {
  const s = Math.max(.6, Math.min(2.2, radius / 3)), g = groundAt(p.x, p.z), y = Math.max(p.y, g + .3);
  burst(PR.bigSmoke, p.x, y + .6 * s, p.z, s);
  burst(PR.fireball, p.x, y + 1.3 * s, p.z, s);
  burst(PR.hotCore, p.x, y + 1.2 * s, p.z, s);
  burst(PR.flash, p.x, y + 1.5 * s, p.z, s);
  burst(PR.sparks, p.x, y + .5, p.z, s);
  burst(PR.groundDust, p.x, g + .4, p.z, s);
  burst(PR.clods, p.x, y + .2, p.z, s);
  debris(p.x, y, p.z, 12, 11 * Math.sqrt(s), [DEBRIS.dirt, DEBRIS.stone, DEBRIS.char], .16 * s, .4 * s, 5);
  decal(1, p.x, g, p.z, 5.5 * s, .6, .6, RING, .25);
  decal(0, p.x, g, p.z, 2.8 * s, 14, .8, SCORCH, 0, 1);
  emitter(PR.column, p.x, y + 1.5 * s, p.z, 9, 3.5, s);
  flash(p, '#ffb46a', 700 * s, .4);
  shakeAt(p, .38 * s);
}
function arcane(p, radius = 2.5) {
  const s = Math.max(.7, Math.min(1.8, radius / 2.5)), g = groundAt(p.x, p.z), y = Math.max(p.y, g + .5);
  burst(PR.arcCore, p.x, y + 1.2, p.z, s); burst(PR.arcGlow, p.x, y + 1.2, p.z, s);
  burst(PR.sparkle, p.x, y, p.z, s); burst(PR.shard, p.x, y, p.z, s); burst(PR.motes, p.x, g + .3, p.z, s);
  decal(1, p.x, g, p.z, 3.8 * s, .55, .8, ARC_RING, .9);
  decal(0, p.x, g, p.z, 2 * s, 6, .5, FROST, .15, 0);
  flash(p, '#b08cff', 350 * s, .45);
}
// Pitch pot: a whoomph of flame, then a pool of fire that burns for `dur` seconds (towers own the damage).
function firepot(p, radius = 3, dur = 4) {
  const s = radius / 3, g = groundAt(p.x, p.z), j = radius * 1.5;
  burst(PR.flameCore, p.x, g + .7, p.z, s * 1.5); burst(PR.fireball, p.x, g + .9, p.z, s * .55, 10);
  burst(PR.sparks, p.x, g + .4, p.z, s * .6, 16); burst(PR.groundDust, p.x, g + .3, p.z, s * .5, 6);
  debris(p.x, g + .3, p.z, 6, 6, [DEBRIS.wood, DEBRIS.char], .1, .2, 0, true);
  decal(0, p.x, g, p.z, radius * 1.15, dur + 8, .85, SCORCH, 0, 1);
  const hold = { jitter: j, hold: .3 };
  emitter(PR.flame, p.x, g, p.z, 26 * s * s, dur, s * .75, hold);
  emitter(PR.flameCore, p.x, g + .2, p.z, 10 * s * s, dur, s * .8, { ...hold, jitter: j * .8 });
  emitter(PR.fireGlow, p.x, g + .3, p.z, 3 * s, dur, s, { ...hold, jitter: j * .6 });
  emitter(PR.ember, p.x, g + .5, p.z, 14 * s, dur, 1, hold);
  emitter(PR.plume, p.x, g + 2, p.z, 1.6, dur, s * .6, { ...hold, jitter: j * .5 });
  flash(p, '#ff8a3a', 450 * s, .45);
  shakeAt(p, .12 * s);
}
// Trebuchet stone: no fire, just earth and rock thrown up, a dust ring rolling out and a crater left behind.
function crush(p, radius = 4.6) {
  const s = Math.max(.9, Math.min(2.4, radius / 3.4)), g = groundAt(p.x, p.z);
  burst(PR.groundDust, p.x, g + .4, p.z, s * 1.5); burst(PR.groundDust, p.x, g + 1.2, p.z, s);
  burst(PR.bigSmoke, p.x, g + .8, p.z, s * .7);
  burst(PR.clods, p.x, g + .3, p.z, s * 1.4);
  debris(p.x, g + .4, p.z, 12, 11 * Math.sqrt(s), [DEBRIS.dirt, DEBRIS.stone, DEBRIS.stone], .07 * s, .17 * s, 5);
  decal(1, p.x, g, p.z, radius * 1.6, .9, .7, RING, .35);
  decal(0, p.x, g, p.z, radius * .75, 18, .85, SCORCH, 0, 1);
  shakeAt(p, .55 * s);
}
// Shaman's pulse: a green ring rolls out over the ground and motes rise from everyone it mended.
const HEAL = col('#7dffa8', 2.6), HEAL2 = col('#2fb86a', 1.2), HEAL_RING = col('#7dffa8', 1.8);
function healPulse({ pos, radius, targets }) {
  const g = groundAt(pos.x, pos.z);
  decal(1, pos.x, g, pos.z, 2.6, .55, .45, HEAL_RING, 1);   // a small ring at the priest; the motes show who was mended
  burst(PR.motes, pos.x, g + 1.8, pos.z, 1, 10, 0, 1, 0, HEAL, HEAL2);
  for (const e of targets || []) burst(PR.motes, e.pos.x, e.pos.y + (e.height || 1.8) * .5, e.pos.z, .8, 5, 0, 1, 0, HEAL, HEAL2);
}
function impact(p, id, radius, target, duration) {
  const g = groundAt(p.x, p.z);
  switch (id) {
    case 'cannonball': return explosion(p, radius || 3);
    case 'arcane': return arcane(p, radius || 2.5);
    case 'firepot': return firepot(p, radius || 3, duration || 4);
    case 'boulder': return crush(p, radius || 4.6);
    case 'arrow':
      burst(PR.puff, p.x, Math.max(p.y, g + .2), p.z, target ? .7 : 1);
      burst(PR.splinter, p.x, p.y, p.z, 1, target ? 3 : 5);
      return;
    case 'bolt':
      burst(PR.sparkFlash, p.x, p.y + .2, p.z); burst(PR.spark, p.x, p.y + .2, p.z, 1.2);
      burst(PR.kick, p.x, Math.max(p.y, g + .1), p.z); burst(PR.puff, p.x, Math.max(p.y, g + .2), p.z, 1.3);
      debris(p.x, Math.max(p.y, g), p.z, 3, 5, [DEBRIS.dirt, DEBRIS.wood], .08, .16, 0, true);
      return;
    default:
      burst(PR.puff, p.x, Math.max(p.y, g + .2), p.z, 1.2); burst(PR.spark, p.x, p.y + .2, p.z, .8, 5);
  }
}
function towerFire({ tower, from, target, projectile }) {
  const f = from || tower?.pos; if (!f) return;
  const tp = target?.pos;
  if (tp) v1.set(tp.x - f.x, tp.y + (target.height || 1.8) * .6 - f.y, tp.z - f.z).normalize(); else v1.set(0, .3, 1).normalize();
  switch (projectile) {
    case 'cannonball':
      burst(PR.muzzle, f.x + v1.x * .8, f.y + v1.y * .8, f.z + v1.z * .8, 1);
      burst(PR.muzzleFlame, f.x, f.y, f.z, 1, 7, v1.x, v1.y, v1.z);
      burst(PR.muzzleSmoke, f.x + v1.x, f.y + v1.y, f.z + v1.z, 1, 8, v1.x, v1.y, v1.z);
      burst(PR.spark, f.x, f.y, f.z, 1, 6, v1.x, v1.y, v1.z);
      flash(f, '#ffc27a', 150, .15, .5); shakeAt(f, .08); return;
    case 'bolt': burst(PR.twang, f.x, f.y - .3, f.z); burst(PR.arrowDust, f.x, f.y, f.z, 1, 3, v1.x, v1.y, v1.z); return;
    case 'arcane': burst(PR.charge, f.x, f.y, f.z); burst(PR.chargeIn, f.x, f.y, f.z); return;
    case 'firepot': burst(PR.flameCore, f.x, f.y, f.z, .6); burst(PR.ember, f.x, f.y, f.z, 1, 8); burst(PR.twang, f.x, f.y - 1.5, f.z); return;
    case 'boulder': { const b = tower?.pos || f; burst(PR.groundDust, b.x, b.y + .3, b.z, 1.2); shakeAt(b, .1); return; }   // the counterweight drops: the platform shudders
    default: burst(PR.arrowDust, f.x, f.y, f.z, 1, 2, v1.x, v1.y, v1.z);
  }
}
const armorOf = e => e.armor ?? enemiesMod.ENEMY_TYPES?.[e.typeId]?.armor ?? 0;
function enemyHit({ enemy, pos, damageType }) {
  const p = pos || v2.copy(enemy.pos).setY(enemy.pos.y + enemy.height * .6);
  if (damageType === 'magic') { burst(PR.sparkle, p.x, p.y, p.z, .35, 5); return; }
  if (damageType === 'fire') { burst(PR.ember, p.x, p.y, p.z, 1, 3); burst(PR.flameCore, p.x, p.y - .3, p.z, .35, 1); return; }
  if (armorOf(enemy) >= .3) { burst(PR.pingStar, p.x, p.y, p.z); burst(PR.ping, p.x, p.y, p.z); }
  else { burst(PR.hitDust, p.x, p.y, p.z); burst(PR.ping, p.x, p.y, p.z, .7, 3); }
}
function enemyDeath({ enemy, pos }) {
  const p = pos || enemy.pos, big = (enemy.height || 1.8) > 2.6 ? 1.8 : 1, g = groundAt(p.x, p.z);
  burst(PR.deathDust, p.x, g + .4, p.z, big);
  const n = Math.max(3, Math.min(12, Math.round((enemy.bounty || 5) / 3)));
  coins(p.x, Math.max(p.y, g), p.z, n);
  if (enemy.bounty) floatText(v2.set(p.x, Math.max(p.y, g) + (enemy.height || 1.8) + .6, p.z), `+${enemy.bounty}`);
}
function leak() {
  const p = v2.set(gatePoint.x + 1.5, gatePoint.y, gatePoint.z + 4.5), g = groundAt(p.x, p.z), y = Math.max(g, p.y);
  burst(PR.redFlash, p.x, y + 2.5, p.z);
  burst(PR.sparks, p.x, y + 1.5, p.z, .8, 20);
  burst(PR.collapse, p.x, y + .5, p.z, .8);
  burst(PR.bigSmoke, p.x, y + 1.5, p.z, .8, 6);
  debris(p.x, y + 1, p.z, 16, 10, [DEBRIS.stone, DEBRIS.stone, DEBRIS.wood], .25, .6, 3);
  decal(1, p.x, y, p.z, 7, .7, .9, RED_RING, .6);
  decal(0, p.x, y, p.z, 3, 40, .7, SCORCH, 0, .6);
  flash(p, '#ff5a3a', 700, .5);
  shakeAt(p, .75);
  vignetteA = Math.min(1, vignetteA + .75);
}
function built(tower, upgrade) {
  const p = tower.pos, g = groundAt(p.x, p.z);
  burst(PR.buildRing, p.x, g + .4, p.z, upgrade ? .8 : 1);
  burst(PR.rise, p.x, g + 1, p.z, 1, upgrade ? 40 : 24);
  if (upgrade) burst(PR.upFlash, p.x, g + 5, p.z);
  decal(1, p.x, g, p.z, 6, .8, .8, upgrade ? col('#ffd890', 2) : RING, upgrade ? .7 : .3);
  shakeAt(p, .08);
}
function sold(tower, pos) {
  const p = pos || tower.pos, g = groundAt(p.x, p.z);
  burst(PR.collapse, p.x, g + 2.5, p.z); burst(PR.buildRing, p.x, g + .3, p.z, .8, 14);
  debris(p.x, g + 3, p.z, 14, 4, [DEBRIS.stone, DEBRIS.wood], .2, .45);
  shakeAt(p, .12);
}
function crows(wave) {
  for (const lane of lanes) {
    lane.pointAt(0, v1); lane.directionAt(0, v2);
    for (const side of [-1, 1]) {
      const n = 7 + ((wave || 1) % 4);
      for (let k = 0; k < n; k++) {
        const x = v1.x - v2.z * side * (10 + R() * 12) + (R() - .5) * 8, z = v1.z + v2.x * side * (10 + R() * 12) + (R() - .5) * 8;
        burst(PR.crow, x, groundAt(x, z) + 7 + R() * 4, z, 1, 1);
        const i = count - 1, sp = 5 + R() * 3;
        vx[i] = -v2.z * side * sp + v2.x * 2 + (R() - .5) * 2; vz[i] = v2.x * side * sp + v2.z * 2 + (R() - .5) * 2; vy[i] = 2 + R() * 2;
      }
    }
  }
}
function fireworkBurst(x, y, z) {
  const a = FW_COLORS[(R() * FW_COLORS.length) | 0], b = R() < .4 ? FW_COLORS[(R() * FW_COLORS.length) | 0] : a;
  burst(PR.fwFlash, x, y, z, 1, 1, 0, 1, 0, a.map(v => v * .3));
  burst(PR.fwGlow, x, y, z, 1, 1, 0, 1, 0, a.map(v => v * .12));
  burst(PR.fwSpark, x, y, z, 1, 110, 0, 1, 0, a, a.map(v => v * .35)); burst(PR.fwSpark, x, y, z, .75, 60, 0, 1, 0, b, EMBER_END);
  burst(PR.fwCrackle, x, y, z, 1.2);
  burst(PR.fwSmoke, x, y, z);
  flash(v1.set(x, y, z), '#ffd8a0', 1800, .7, 0);
}
function fireworks(n = 16, spread = 5) {
  for (let k = 0; k < n; k++) setTimeout(() => {
    const x = -14 + R() * 32, z = -18 + R() * 32;
    emitter(PR.rocketTrail, x, BASE + 22, z, 70, 1.3 + R() * .4, 1, { vx: (R() - .5) * 4, vy: 24 + R() * 5, vz: (R() - .5) * 4, grav: 11, end: 'firework' });
  }, k / n * spread * 1000 + R() * 250);
}
function heavySmoke() {
  for (const [x, y, z] of world.fx.smoke) emitter(PR.plume, x, y, z, 9, 30, 1.6);
}

// ───────────────────────────── ambient ─────────────────────────────
function ambientSetup() {
  const chimneys = world.fx.chimneys;
  for (const [x, y, z, rate] of chimneys) persistent.push(E(PR.chimney, x, y, z, rate, 0, 1, { jitter: .2 }));
  // Pollen follows the camera target so the air near the action always has a little life.
  const snowing = world.fx.ambient === 'snow';
  persistent.push(E(snowing ? PR.snow : PR.pollen, 0, 0, 0, snowing ? 70 : 22, 0, 1, { pollen: true, high: snowing ? 22 : 10 }));
  // Pre-warm so chimneys are already smoking on the first frame.
  for (let k = 0; k < 90; k++) { for (const e of persistent) if (!e.pollen) runEmitter(e, .1); updateParticles(.1, .1); }
}
function pollenStep(e, realDt) {
  const t = controls.target, spread = Math.min(70, camera.position.distanceTo(t) * .35);
  e.acc += e.rate * realDt;
  while (e.acc >= 1) {
    e.acc--;
    const x = t.x + (R() - .5) * spread * 2, z = t.z + (R() - .5) * spread * 2;
    burst(e.pr, x, groundAt(x, z) + 1 + R() * e.high, z, 1, 1);
  }
}

// ───────────────────────────── shaders / init ─────────────────────────────
const CELL = 'vec2 cellUV(float f, vec2 uv){ return vec2((mod(f,4.)+uv.x)*.25, 1.-(floor(f/4.)+1.-uv.y)*.25); }';
let uniforms;
export function init() {
  const map = makeAtlas();
  const ao = composer.passes.find(p => p.normalRenderTarget && p.depthTexture);
  uniforms = { uMap: { value: map }, uDepth: { value: ao?.depthTexture }, uRes: { value: new THREE.Vector2(1, 1) }, uNear: { value: camera.near }, uFar: { value: camera.far }, uInvProj: { value: camera.projectionMatrixInverse }, uCamWorld: { value: camera.matrixWorld } };
  const fxScene = new THREE.Scene();

  // Particles: one instanced quad, premultiplied blend so additive and alpha particles share a draw call.
  const blend = { transparent: true, depthTest: false, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor };
  const pMat = new THREE.ShaderMaterial({ uniforms, ...blend,
    vertexShader: `attribute vec4 iA, iB, iC, iD; varying vec2 vUv, vQ, vM; varying vec4 vCol; varying float vZ, vSoft;
      void main(){ vec4 mv = viewMatrix * vec4(iA.xyz, 1.); float size = iA.w; vec2 q = position.xy, off;
        if (iD.z > 0.) { vec3 vv = (viewMatrix * vec4(iB.xyz, 0.)).xyz; float sp = length(vv.xy); vec2 d = sp > 1e-4 ? vv.xy / sp : vec2(0., 1.);
          off = d * q.y * (size + sp * iD.z) + vec2(-d.y, d.x) * q.x * size; }
        else { float c = cos(iB.w), s = sin(iB.w); off = vec2(c * q.x - s * q.y, s * q.x + c * q.y) * size; }
        mv.xy += off; gl_Position = projectionMatrix * mv;
        vUv = vec2((mod(iD.x, 4.) + q.x + .5) * .25, 1. - (floor(iD.x / 4.) + .5 - q.y) * .25);
        vQ = q; vCol = iC; vM = iD.yw; vZ = -mv.z; vSoft = max(.35, size * .5); }`,
    fragmentShader: `#include <packing>
      uniform sampler2D uMap, uDepth; uniform vec2 uRes; uniform float uNear, uFar; varying vec2 vUv, vQ, vM; varying vec4 vCol; varying float vZ, vSoft;
      void main(){ vec4 t = texture2D(uMap, vUv); float a = t.a * vCol.a;
        float sz = -perspectiveDepthToViewZ(texture2D(uDepth, gl_FragCoord.xy / uRes).x, uNear, uFar);
        a *= clamp((sz - vZ) / vSoft, 0., 1.) * clamp((vZ - 3.) / 8., 0., 1.);
        if (a < .002) discard;
        vec3 c = vCol.rgb * mix(t.rgb, t.rgb * t.rgb * t.rgb, step(.5, vM.x));
        c *= mix(1., mix(.58, 1.18, smoothstep(-.45, .5, vQ.y - vQ.x * .35)), vM.y);
        gl_FragColor = vec4(c * a, a * (1. - vM.x)); }`,
  });
  for (let k = 0; k < 2; k++) {
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-.5, -.5, 0, .5, -.5, 0, .5, .5, 0, -.5, .5, 0], 3)); geo.setIndex([0, 1, 2, 0, 2, 3]);
    const attrs = ['iA', 'iB', 'iC', 'iD'].map(name => { const a = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage); geo.setAttribute(name, a); return a; });
    geo.instanceCount = 0;
    sets.push({ geo, attrs, A: attrs[0].array, B: attrs[1].array, C: attrs[2].array, D: attrs[3].array, n: 0 });
    const m = new THREE.Mesh(geo, pMat); m.frustumCulled = false; m.renderOrder = 2 + k; fxScene.add(m);
  }

  // Deferred decals: a box per decal; the fragment shader reconstructs the scene position from depth and projects down.
  dGeo = new THREE.InstancedBufferGeometry().copy(new THREE.BoxGeometry(2, 1.2, 2));
  const da = () => new THREE.InstancedBufferAttribute(new Float32Array(DMAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
  dGeo.setAttribute('dA', dA = da()); dGeo.setAttribute('dB', dB = da()); dGeo.setAttribute('dC', dC = da()); dGeo.instanceCount = 0;
  const dMat = new THREE.ShaderMaterial({ uniforms, ...blend, side: THREE.BackSide,
    vertexShader: `attribute vec4 dA, dB, dC; varying vec4 vA, vB, vC; void main(){ vA = dA; vB = dB; vC = dC; gl_Position = projectionMatrix * viewMatrix * vec4(dA.xyz + position * dA.w, 1.); }`,
    fragmentShader: `uniform sampler2D uMap, uDepth; uniform vec2 uRes; uniform mat4 uInvProj, uCamWorld; varying vec4 vA, vB, vC; ${CELL}
      void main(){ vec2 suv = gl_FragCoord.xy / uRes; float d = texture2D(uDepth, suv).x;
        vec4 v = uInvProj * vec4(suv * 2. - 1., d * 2. - 1., 1.); v /= v.w; vec3 w = (uCamWorld * v).xyz;
        vec3 n = normalize(cross(dFdx(w), dFdy(w)));
        vec3 l = w - vA.xyz; float r = vA.w;
        if (d >= 1. || abs(l.y) > r * .6) discard;
        float c = cos(vB.x), s = sin(vB.x); vec2 p = vec2(c * l.x - s * l.z, s * l.x + c * l.z) / r; float rr = length(p);
        if (rr > 1.) discard;
        float up = smoothstep(.3, .7, abs(n.y)), a; vec3 col = vC.rgb, em = vec3(0.);
        float m = texture2D(uMap, cellUV(1., p * .5 + .5)).a, m2 = texture2D(uMap, cellUV(2., p.yx * .32 + .5)).r;
        if (vB.z < .5) {
          float edge = smoothstep(1., .3, rr + (m2 - .85) * 1.6 + (m - .5) * .25);
          a = vB.y * edge * (.6 + .4 * smoothstep(.75, .95, m2));
          col *= mix(1., 3., smoothstep(.35, 1., rr));
          em = vec3(3.2, .95, .22) * vB.w * pow(m * m2, 5.) * 5. * smoothstep(.6, 0., rr);
        } else {
          float bx = (rr - vB.w) / (.05 + .14 * vB.w), band = exp(-bx * bx) * smoothstep(0., .5, rr) * smoothstep(1., .9, rr);
          a = vB.y * band * (.35 + .65 * smoothstep(.72, 1., texture2D(uMap, cellUV(3., p * .45 + .5)).r));
        }
        a *= up;
        gl_FragColor = vec4(col * a + em * up, a * (1. - vC.a)); }`,
  });
  const dm = new THREE.Mesh(dGeo, dMat); dm.frustumCulled = false; dm.renderOrder = 1; fxScene.add(dm);

  class FxPass extends Pass {
    constructor() { super(); this.needsSwap = false; }
    render(r, write, read) {
      renderer.getDrawingBufferSize(uniforms.uRes.value);
      const ac = r.autoClear; r.autoClear = false;
      r.setRenderTarget(this.renderToScreen ? null : read); r.render(fxScene, camera);
      r.autoClear = ac;
    }
  }
  composer.insertPass(new FxPass(), composer.passes.indexOf(ao) + 1);

  // Debris and coins: real lit geometry in the main scene (they get AO and shade like the world).
  const rock = new THREE.IcosahedronGeometry(1, 0), pos = rock.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) * (.8 + .4 * Math.abs(Math.sin(i * 7.1))), pos.getY(i) * (.7 + .5 * Math.abs(Math.sin(i * 3.3))), pos.getZ(i));
  rock.computeVertexNormals();
  debrisMesh = new THREE.InstancedMesh(rock, new THREE.MeshStandardMaterial({ color: '#fff', roughness: .95, flatShading: true }), BMAX);
  debrisMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); debrisMesh.setColorAt(0, tmpColor.set('#fff'));
  debrisMesh.count = 0; debrisMesh.frustumCulled = false; debrisMesh.receiveShadow = true; scene.add(debrisMesh);
  const coinGeo = new THREE.CylinderGeometry(.3, .3, .07, 20); coinGeo.rotateX(Math.PI / 2);
  coinMesh = new THREE.InstancedMesh(coinGeo, new THREE.MeshStandardMaterial({ color: '#f0c050', metalness: .75, roughness: .28, emissive: '#6a4410', emissiveIntensity: .7 }), CMAX);
  coinMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); coinMesh.count = 0; coinMesh.frustumCulled = false; scene.add(coinMesh);

  for (let i = 0; i < 2; i++) { const light = new THREE.PointLight('#ffb46a', 0, 28, 2); scene.add(light); flashes.push({ light, t: 1, dur: 1, peak: 0 }); }
  fireLight = new THREE.PointLight('#ff8a3a', 0, 30, 2); scene.add(fireLight);

  // DOM overlay for floating numbers + breach vignette.
  textLayer = document.createElement('div');
  textLayer.style.cssText = 'position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:6;contain:strict';
  document.body.appendChild(textLayer);
  for (let i = 0; i < TMAX; i++) {
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;left:0;top:0;display:none;will-change:transform,opacity;font:800 21px/1 ui-rounded,"SF Pro Rounded",system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.02em;white-space:nowrap;' +
      'text-shadow:0 0 1px #2a1804,1px 1px 0 #2a1804,-1px -1px 0 #2a1804,1px -1px 0 #2a1804,-1px 1px 0 #2a1804,0 2px 0 #2a1804,0 3px 6px rgba(20,10,0,.45)';
    textLayer.appendChild(el); texts.push({ el, on: false, age: 0, x: 0, y: 0, z: 0 });
  }
  vignette = document.createElement('div');
  vignette.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:5;opacity:0;background:radial-gradient(ellipse at center,rgba(120,10,0,0) 50%,rgba(120,14,4,.28) 80%,rgba(90,6,0,.55) 100%)';
  document.body.appendChild(vignette);

  castleFires.push(...FIRES.map(([x, y, z, stage], i) => ({
    x, y, z, stage, k: 0,
    emitters: [
      E(PR.flame, x, y, z, 24, 0, 1, { jitter: 1.1 }),
      E(PR.flameCore, x, y, z, 7, 0, 1, { jitter: .3 }),
      E(PR.ember, x, y + 1, z, 5),
      E(PR.fireGlow, x, y, z, 5),
      E(PR.plume, x, y + 2.5, z, 9, 0, 1 + (i % 3) * .15, { jitter: 1 }),
    ],
  })));
  ambientSetup();

  bus.on('projectile:impact', d => impact(d.pos, d.projectile, d.radius, d.target, d.duration));
  bus.on('tower:fire', towerFire);
  bus.on('enemy:hit', enemyHit);
  bus.on('enemy:death', enemyDeath);
  bus.on('enemy:leak', leak);
  bus.on('enemy:heal', healPulse);
  bus.on('tower:build', d => built(d.tower, false));
  bus.on('tower:upgrade', d => built(d.tower, true));
  bus.on('tower:sell', d => sold(d.tower, d.pos));
  bus.on('wave:start', d => { if (d?.wave === 1) { forcedStage = null; dCount = 0; for (const e of EPOOL) e.on = false; } crows(d?.wave); });
  bus.on('game:won', () => fireworks(22, 8));
  bus.on('game:lost', () => { heavySmoke(); shake(.6); });
}

export function update(dt, realDt = dt) {
  for (const e of EPOOL) if (e.on) runEmitter(e, dt);
  for (const e of persistent) e.pollen ? pollenStep(e, realDt) : runEmitter(e, realDt);
  updateCastle(realDt);
  updateParticles(dt, realDt);
  updateDecals(dt);
  updateDebris(dt);
  updateCoins(dt);
  for (const f of flashes) { f.t += realDt; f.light.intensity = f.t < f.dur ? f.peak * (1 - f.t / f.dur) ** 2.2 : 0; }
  updateTexts(realDt);
  updateShake(realDt);
  uniforms.uNear.value = camera.near; uniforms.uFar.value = camera.far;
}

// ───────────────────────────── debug ─────────────────────────────
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const fakeEnemy = (p, o = {}) => ({ id: -1, typeId: 'fake', hp: 0, maxHp: 10, alive: false, lane: 0, dist: 0, pos: p, velocity: V(0, 0, 0), radius: .5, height: 1.8, bounty: 8, slowFactor: 1, ...o });
const fakeTower = (p, typeId) => ({ id: -1, typeId, level: 1, pad: null, pos: p, range: 20, target: null, kills: 0, spent: 0 });
export const debug = {
  get particles() { return count; },
  sets, PR, sample: i => [px[i], py[i], pz[i], age[i], life[i], s0[i], pre[i] === PR.fwSpark],
  atlas: () => uniforms.uMap.value.image.toDataURL(),
  get stats() { return { particles: count, decals: dCount, debris: bCount, coins: cCount, damage }; },
  damage(stage = null) { forcedStage = stage; },
  fireworks: () => fireworks(12, 4),
  burst: (name, x, y, z, sc = 1, n) => burst(PR[name], x, y, z, sc, n),
  fireworkBurst: (x = 4, y = 50, z = 4) => fireworkBurst(x, y, z),
  lost: () => { forcedStage = 3; heavySmoke(); },
  explosion: (x, z, r = 3) => explosion(V(x, groundAt(x, z), z), r),
  demo() {
    const L0 = lanes[0], L1 = lanes[1], at = (L, d) => L.pointAt(L.length - d, V(0, 0, 0));
    const emit = (name, data, ms = 0) => setTimeout(() => bus.emit(name, data), ms);
    // Explosions along both lanes near the castle, staggered.
    [[L0, 45, 0], [L1, 70, 120], [L0, 80, 260], [L1, 40, 700], [L1, 110, 1100]].forEach(([L, d, ms]) => emit('projectile:impact', { pos: at(L, d), projectile: 'cannonball', radius: 3 }, ms));
    [[L1, 55, 60], [L0, 62, 400]].forEach(([L, d, ms]) => emit('projectile:impact', { pos: at(L, d).setY(at(L, d).y + 1), projectile: 'arcane', radius: 2.5 }, ms));
    for (let k = 0; k < 8; k++) emit('projectile:impact', { pos: at(L0, 25 + k * 3), projectile: 'arrow' }, k * 90);
    for (let k = 0; k < 4; k++) emit('projectile:impact', { pos: at(L1, 85 + k * 5), projectile: 'bolt' }, 50 + k * 150);
    emit('projectile:impact', { pos: at(L0, 95), projectile: 'mystery' }, 200);
    // Towers firing: fake towers beside the lanes, aiming at points on the lane.
    const side = (L, d, o) => { const p = at(L, d), dir = L.directionAt(L.length - d, V(0, 0, 0)); p.x += -dir.z * o; p.z += dir.x * o; p.y = groundAt(p.x, p.z) + 7; return p; };
    [['cannonball', L0, 50], ['bolt', L1, 60], ['arcane', L1, 90], ['arrow', L0, 30]].forEach(([proj, L, d], k) => {
      const from = side(L, d, 9), tgt = fakeEnemy(at(L, d + 6));
      emit('tower:fire', { tower: fakeTower(from, proj), from, target: tgt, projectile: proj }, 80 + k * 140);
    });
    // Hits and deaths.
    for (let k = 0; k < 6; k++) { const p = at(L0, 20 + k * 6); emit('enemy:hit', { enemy: fakeEnemy(p, { armor: k % 2 ? .5 : 0 }), amount: 5, damageType: 'pierce', pos: V(p.x, p.y + 1.1, p.z) }, 150 + k * 120); }
    for (let k = 0; k < 4; k++) { const p = at(L1, 30 + k * 12); emit('enemy:death', { enemy: fakeEnemy(p, { bounty: [6, 12, 25, 40][k], height: k === 3 ? 3.2 : 1.8 }), pos: p }, 300 + k * 200); }
    // Build / upgrade / sell next to the south lane, the gate breach, crows, and castle fires.
    emit('tower:build', { tower: fakeTower(side(L0, 70, 10).setY(0), 'cannon') }, 500);
    emit('tower:upgrade', { tower: fakeTower(side(L1, 75, -10).setY(0), 'mage') }, 650);
    emit('tower:sell', { tower: fakeTower(side(L0, 100, -10).setY(0), 'archer') }, 800);
    emit('enemy:leak', { enemy: fakeEnemy(gatePoint.clone()) }, 900);
    emit('wave:start', { wave: 3 }, 0);
    forcedStage = 2; clearTimeout(this._t); this._t = setTimeout(() => { forcedStage = null; }, 15000);
  },
};
