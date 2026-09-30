// Enemy modelling kit: rigged models built from merged, vertex-coloured procedural geometry.
// A Model is a list of bones (rest pivots in model space, feet at origin, facing +Z, right hand at -X).
// Each bone owns one merged geometry, drawn as one InstancedMesh per bone across all enemies.
import { THREE } from '../scene.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const _o = new THREE.Object3D();

// Surface presets: [roughness, metalness, emissive]
export const MAT = {
  cloth: [.95, 0, 0], leather: [.72, 0, 0], iron: [.5, .8, 0], steel: [.36, .88, 0], mail: [.62, .75, 0], gold: [.34, .92, 0],
  wood: [.86, 0, 0], skin: [.66, 0, 0], fur: [1, 0, 0], bone: [.55, 0, 0], hide: [.9, 0, 0], fire: [1, 0, 1], glow: [1, 0, .6], rope: [1, 0, 0],
};

export const C = {
  iron: '#4a4c50', darkIron: '#26272b', steel: '#8a8f96', mail: '#6a6d70', gold: '#a8843c',
  crimson: '#7c1719', crimsonDk: '#561113', black: '#1c1a1b', charcoal: '#2c2a2a',
  leather: '#5e3d25', leatherDk: '#382416', wood: '#6a4b31', woodDk: '#3f2c1e',
  skin: '#b88466', skinDk: '#8c5f47', bone: '#d8cba8', fur: '#37312d', furLt: '#5c5249',
  ogre: '#7f7a5a', ogreDk: '#5b5740', hide: '#5a4331', rope: '#8f7a54', fire: '#ff7a1c', ember: '#ff4a10', eye: '#ffb030',
};

// ---- primitives (all return fresh geometry) ----
export function xf(g, p = [0, 0, 0], r = [0, 0, 0], s = 1) {
  _o.position.fromArray(p || [0, 0, 0]); r = Array.isArray(r) ? r : [0, 0, 0]; _o.rotation.set(r[0], r[1], r[2]);
  if (!Array.isArray(s)) _o.scale.setScalar(s || 1); else _o.scale.fromArray(s);
  _o.updateMatrix(); g.applyMatrix4(_o.matrix); return g;
}
export const box = (w, h, d, b = .02, p, r, s) => xf(new RoundedBoxGeometry(w, h, d, 1, Math.min(b, w / 2.01, h / 2.01, d / 2.01)), p, r, s);
export const cyl = (rt, rb, h, seg = 10, p, r, s, open = false, t0 = 0, tl = Math.PI * 2) => xf(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open, t0, tl), p, r, s);
export const sph = (rad, p, s, r, ws = 10, hs = 7, t0 = 0, tl = Math.PI) => xf(new THREE.SphereGeometry(rad, ws, hs, 0, Math.PI * 2, t0, tl), p, r, s);
export const cone = (rad, h, seg = 8, p, r, s) => xf(new THREE.ConeGeometry(rad, h, seg), p, r, s);
export const tor = (rad, tube, p, r, s, rs = 6, ts = 14, arc = Math.PI * 2) => xf(new THREE.TorusGeometry(rad, tube, rs, ts, arc), p, r, s);
export const lathe = (pts, seg = 14, p, r, s) => xf(new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg), p, r, s);
// Tapered cylinder from point a (radius r1) to point b (radius r2).
export function limb(a, b, r1, r2, seg = 9, open = false) {
  const va = V(...a), d = V(...b).sub(va), len = d.length();
  const g = new THREE.CylinderGeometry(r2, r1, len, seg, 1, open);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
  return g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
}
// Extruded 2D outline (points in XY), centred on Z, lightly bevelled.
export function ext(points, depth, bev = .006, p, r, s) {
  const sh = new THREE.Shape();
  points.forEach(([x, y], i) => i ? sh.lineTo(x, y) : sh.moveTo(x, y));
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev, bevelSegments: 1, curveSegments: 4 });
  g.translate(0, 0, -depth / 2);
  return xf(g, p, r, s);
}
export function extShape(shape, depth, bev = .006, p, r, s) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev, bevelSegments: 1, curveSegments: 8 });
  g.translate(0, 0, -depth / 2);
  return xf(g, p, r, s);
}
// Sampled outline helpers
export function arcPts(cx, cy, rx, ry, a0, a1, n) { const out = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); } return out; }

// ---- model ----
export class Model {
  // bones: [name, parentName|null, [x,y,z] rest pivot (unscaled), shareWithBone?]
  constructor(name, bones, { k = 1, cap = 100 } = {}) {
    this.name = name; this.k = k; this.cap = cap; this.b = {};
    this.bones = bones.map(([n, p, pv, share], i) => { this.b[n] = i; return { n, p, pv: V(...pv).multiplyScalar(k), share, geos: [] }; });
    for (const bone of this.bones) bone.pi = bone.p ? this.b[bone.p] : -1;
  }
  add(bone, geo, color, mat = 'cloth', { mirror = false } = {}) {
    const list = Array.isArray(geo) ? geo : [geo];
    for (let g of list) {
      g = g.index ? g.toNonIndexed() : g;
      for (const key of Object.keys(g.attributes)) if (key !== 'position' && key !== 'normal') g.deleteAttribute(key);
      g.clearGroups();
      if (this.k !== 1) g.scale(this.k, this.k, this.k);
      const n = g.attributes.position.count, col = new THREE.Color(color), mr = MAT[mat];
      const ca = new Float32Array(n * 3), ma = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { ca.set([col.r, col.g, col.b], i * 3); ma.set(mr, i * 3); }
      g.setAttribute('color', new THREE.BufferAttribute(ca, 3)); g.setAttribute('mr', new THREE.BufferAttribute(ma, 3));
      this.bones[this.b[bone]].geos.push(g);
      if (mirror) { // copy mirrored across X onto the partner bone ('L' <-> 'R')
        const m = g.clone(); m.scale(-1, 1, 1);
        const p = m.attributes.position.array, nn = m.attributes.normal.array;
        for (let i = 0; i < p.length; i += 9) for (let j = 0; j < 3; j++) { const a = i + j, b = i + 6 + j; [p[a], p[b]] = [p[b], p[a]]; [nn[a], nn[b]] = [nn[b], nn[a]]; }
        const other = bone.endsWith('R') ? bone.slice(0, -1) + 'L' : bone.endsWith('L') ? bone.slice(0, -1) + 'R' : bone;
        this.bones[this.b[other]].geos.push(m);
      }
    }
    return this;
  }
  // Merge per-bone geometry relative to its pivot; compute bone offsets.
  finish() {
    this.parts = []; // unique geometries: { geometry, perEnemy }
    for (const bone of this.bones) {
      bone.off = bone.pi < 0 ? bone.pv.clone() : bone.pv.clone().sub(this.bones[bone.pi].pv);
      if (bone.share) continue;
      if (!bone.geos.length) { bone.part = -1; continue; }
      const g = mergeGeometries(bone.geos); g.translate(-bone.pv.x, -bone.pv.y, -bone.pv.z);
      g.computeBoundingSphere(); bone.geos = null;
      bone.part = this.parts.push({ geometry: g, perEnemy: 1 }) - 1;
    }
    for (const bone of this.bones) if (bone.share) { bone.part = this.bones[this.b[bone.share]].part; this.parts[bone.part].perEnemy++; }
    this.triangles = this.parts.reduce((s, p) => s + p.geometry.attributes.position.count / 3, 0);
    return this;
  }
}

// Standard humanoid skeleton, unscaled (≈1.85 m tall at k = 1).
export function humanBones(extra = [], sh = .24, hw = .1) {
  return [
    ['hips', null, [0, .98, 0]],
    ['torso', 'hips', [0, 1.06, 0]],
    ['head', 'torso', [0, 1.56, 0]],
    ['armR', 'torso', [-sh, 1.44, 0]],
    ['armL', 'torso', [sh, 1.44, 0]],
    ['thighR', 'hips', [-hw, .94, 0]],
    ['thighL', 'hips', [hw, .94, 0]],
    ['shinR', 'thighR', [-hw, .5, 0]],
    ['shinL', 'thighL', [hw, .5, 0]],
    ...extra,
  ];
}
