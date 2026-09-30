// Procedural sprite atlas for fx.js: 4x4 cells of 256px, drawn once at init. No image files.
import { THREE, fbm, noise } from '../scene.js';

export const FR = { GLOW: 0, SMOKE: 1 /* 1..3 */, FLAME: 4, STAR: 5, SHARD: 6, SPLINTER: 7, BIRD: 8 /* 8..9 */, DUST: 10, CHUNK: 11, EMBER: 12 };
const C = 256;

function cell(ctx, i, draw) {
  ctx.save(); ctx.translate((i % 4) * C, Math.floor(i / 4) * C);
  ctx.beginPath(); ctx.rect(0, 0, C, C); ctx.clip(); draw(ctx); ctx.restore();
}
// Per-pixel field → RGBA. f(u, v) with u, v in -1..1 returns [lum 0..1, alpha 0..1].
function field(ctx, i, f) {
  const img = ctx.createImageData(C, C), d = img.data;
  for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) {
    const [l, a] = f(x / C * 2 - 1, y / C * 2 - 1), k = (y * C + x) * 4;
    d[k] = d[k + 1] = d[k + 2] = Math.max(0, Math.min(255, l * 255)); d[k + 3] = Math.max(0, Math.min(255, a * 255));
  }
  ctx.putImageData(img, (i % 4) * C, Math.floor(i / 4) * C);
}
const sm = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

export function makeAtlas() {
  const cv = document.createElement('canvas'); cv.width = cv.height = C * 4;
  const ctx = cv.getContext('2d');
  // Soft glow: gaussian-ish, no visible edge.
  field(ctx, FR.GLOW, (u, v) => { const r = Math.hypot(u, v); return [1, Math.exp(-r * r * 7.5) * sm(1, .85, r)]; });
  // Smoke puffs: billowy fbm density with soft radial falloff, three seeds so repetition is not obvious.
  for (let s = 0; s < 3; s++) field(ctx, FR.SMOKE + s, (u, v) => {
    const r = Math.hypot(u, v), ox = s * 17.3, oy = s * 9.1;
    const warp = fbm(u * 2.2 + ox, v * 2.2 + oy);
    const n = fbm(u * 3.1 + warp * 1.6 + ox, v * 3.1 + warp * 1.6 + oy);
    const billow = 1 - Math.abs(fbm(u * 6 + ox + 3, v * 6 + oy) * 2 - 1);
    const edge = sm(.98, .25 + n * .35, r + (n - .5) * .45);
    const dens = Math.min(1, edge * (.55 + n * .7 + billow * .15));
    return [.72 + n * .28 + billow * .08 - Math.max(0, v) * .06, dens * dens * (3 - 2 * dens)];
  });
  // Flame tongue: teardrop pointing up with turbulent edge.
  field(ctx, FR.FLAME, (u, v) => {
    const yy = (v + 1) / 2, w = .55 * Math.pow(Math.max(0, yy), .6) * (1.15 - yy * .35);
    const n = fbm(u * 4 + 5, v * 3 + 2);
    const dx = Math.abs(u + (n - .5) * .35 * (1 - yy)) / Math.max(.02, w);
    const a = sm(1, .3, dx) * sm(.02, .35, yy) * sm(1, .8, yy);
    return [.75 + .25 * (1 - dx), a * (.6 + n * .5)];
  });
  // Star glint: tight core + four soft rays.
  field(ctx, FR.STAR, (u, v) => {
    const r = Math.hypot(u, v), core = Math.exp(-r * r * 60), glow = Math.exp(-r * r * 9) * .35;
    const ray = (Math.exp(-u * u * 900) * Math.exp(-Math.abs(v) * 3.2) + Math.exp(-v * v * 900) * Math.exp(-Math.abs(u) * 3.2)) * .8;
    return [1, Math.min(1, core + glow + ray) * sm(1, .8, r)];
  });
  // Ice shard: elongated diamond with a bright edge and slightly soft outline.
  field(ctx, FR.SHARD, (u, v) => {
    const d = Math.abs(u) / .28 + Math.abs(v) / .95;
    const a = sm(1.02, .88, d), edge = sm(.7, .98, d) * a;
    return [.75 + edge * .25 + (u > 0 ? .1 : 0), a * (.72 + edge * .28)];
  });
  // Wood splinter: thin irregular sliver.
  field(ctx, FR.SPLINTER, (u, v) => {
    const w = .1 * (1 - Math.abs(v)) + .02 + (noise(v * 9, 3) - .5) * .05;
    const a = sm(w + .03, w - .02, Math.abs(u + v * .08)) * sm(.95, .8, Math.abs(v));
    return [.8 + noise(u * 20, v * 40) * .2, a];
  });
  // Crow silhouettes, wings up and down.
  for (let f = 0; f < 2; f++) cell(ctx, FR.BIRD + f, c => {
    c.filter = 'blur(2px)'; c.fillStyle = '#fff'; c.translate(128, 128);
    const tip = f ? 44 : -46, mid = f ? 18 : -22;
    for (const s of [-1, 1]) {
      c.beginPath(); c.moveTo(0, 0);
      c.quadraticCurveTo(s * 40, mid - 8, s * 104, tip); c.quadraticCurveTo(s * 50, mid + 12, 0, 12); c.fill();
    }
    c.beginPath(); c.ellipse(0, 6, 13, 30, 0, 0, 7); c.fill();
    c.beginPath(); c.ellipse(0, -26, 9, 10, 0, 0, 7); c.fill();
  });
  // Dust: very diffuse, low-contrast puff.
  field(ctx, FR.DUST, (u, v) => {
    const r = Math.hypot(u, v), n = fbm(u * 2.5 + 40, v * 2.5 + 11);
    const a = sm(1, .1, r + (n - .5) * .5);
    return [.85 + n * .15, a * a * (.5 + n * .6)];
  });
  // Grit chunk: small irregular rock.
  field(ctx, FR.CHUNK, (u, v) => {
    const ang = Math.atan2(v, u), r = Math.hypot(u, v), rad = .5 + noise(Math.cos(ang) * 1.5 + 7, Math.sin(ang) * 1.5 + 3) * .35;
    return [.55 + (-u - v) * .25 + noise(u * 12, v * 12) * .2, sm(rad, rad - .12, r)];
  });
  // Ember: tiny hot dot with soft halo.
  field(ctx, FR.EMBER, (u, v) => { const r = Math.hypot(u, v); return [1, Math.min(1, Math.exp(-r * r * 16) * 1.1 + Math.exp(-r * r * 5) * .3) * sm(1, .8, r)]; });
  const tex = new THREE.CanvasTexture(cv);
  tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.anisotropy = 4;
  return tex;
}
