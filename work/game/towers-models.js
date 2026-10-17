// Tower, pad, scaffold and projectile geometry. Built with the castle's own helpers and materials, then baked
// (merged per material) once per tower type/level; tower instances clone the baked templates (shared geometry).
import { THREE, materials, stoneMaps, box, cylinder, beam, tiledCone, pitchedRoof, worldUV, mesh, world } from '../scene.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const M = materials;
export const mats = {
  bronze: new THREE.MeshStandardMaterial({ color: '#8a6a3e', metalness: .8, roughness: .45 }),
  plank: new THREE.MeshStandardMaterial({ color: '#6e5c43', roughness: .95 }),
  cloth: new THREE.MeshStandardMaterial({ color: '#7a2f22', roughness: 1 }),
  clothBlue: new THREE.MeshStandardMaterial({ color: '#2f3f6e', roughness: 1 }),
  gold: new THREE.MeshStandardMaterial({ color: '#b48a3e', metalness: .8, roughness: .4 }),
  rope: new THREE.MeshStandardMaterial({ color: '#5d4c36', roughness: 1 }),
  tunic: new THREE.MeshStandardMaterial({ color: '#56643a', roughness: 1 }),
  hood: new THREE.MeshStandardMaterial({ color: '#3d4a2c', roughness: 1 }),
  leather: new THREE.MeshStandardMaterial({ color: '#4a3524', roughness: .9 }),
  skin: new THREE.MeshStandardMaterial({ color: '#c69474', roughness: .8 }),
  string: new THREE.MeshStandardMaterial({ color: '#d8ccaa', roughness: 1 }),
  runeGlass: new THREE.MeshStandardMaterial({ color: '#39466a', roughness: .3, emissive: '#6d8fe0', emissiveIntensity: .55 }),
  clay: new THREE.MeshStandardMaterial({ color: '#8d5f3e', roughness: .9 }),
  coal: new THREE.MeshStandardMaterial({ color: '#2a160c', roughness: 1, emissive: '#ff4a10', emissiveIntensity: 1.5 }),
  pitch: new THREE.MeshStandardMaterial({ color: '#140e09', roughness: .25, emissive: '#ff6a1c', emissiveIntensity: .55 }),
  rock: new THREE.MeshStandardMaterial({ color: '#8e877a', roughness: 1 }),
  crystal: new THREE.MeshStandardMaterial({ color: '#bcd3ff', roughness: .18, metalness: .05, emissive: '#6f98ff', emissiveIntensity: 1.1, flatShading: true }),
};

// Shared vertex-coloured materials: the castle materials that differ only by colour collapse into three
// draw calls per baked group (masonry, plain, metal) instead of a dozen.
export const shared = {
  masonry: new THREE.MeshStandardMaterial({ ...stoneMaps, vertexColors: true, roughness: .92, bumpScale: .15 }),
  plain: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95 }),
  metal: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: .72, roughness: .5 }),
};
// Winter worlds dust the built towers with snow too.
if (world.snowify) for (const m of [...Object.values(shared), mats.plank, mats.clay]) world.snowify(m);
const convert = new Map([
  ...[M.stone, M.trim, M.base].map(m => [m, shared.masonry]),
  ...[M.timber, M.dark, mats.plank, mats.clay, mats.rock, mats.cloth, mats.clothBlue, mats.rope, mats.tunic, mats.hood, mats.leather, mats.skin, mats.string].map(m => [m, shared.plain]),
  ...[M.iron, mats.bronze, mats.gold].map(m => [m, shared.metal]),
]);
// Merge every mesh in `group` per (shared) material into a few meshes. Returns a new Group.
export function bake(group, shadow = true) {
  group.updateMatrixWorld(true);
  const buckets = new Map();
  group.traverse(o => {
    if (!o.isMesh) return;
    const material = convert.get(o.material) || o.material;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    if (material !== o.material) {
      const n = g.attributes.position.count, c = o.material.color, col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    }
    const key = material.uuid + Object.keys(g.attributes).sort().join(',');
    if (!buckets.has(key)) buckets.set(key, { material, geos: [] });
    g.applyMatrix4(o.matrixWorld); buckets.get(key).geos.push(g);
  });
  const out = new THREE.Group();
  for (const b of buckets.values()) {
    const m = new THREE.Mesh(mergeGeometries(b.geos), b.material);
    m.castShadow = shadow; m.receiveShadow = true; out.add(m);
    for (const g of b.geos) g.dispose();
  }
  return out;
}
// Flat shape visible from both sides without a DoubleSide material.
function twoSided(shape) {
  const g = new THREE.ShapeGeometry(shape), back = g.clone(), idx = back.index.array, n = back.attributes.normal;
  for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  for (let i = 0; i < n.count; i++) n.setZ(i, -n.getZ(i));
  return mergeGeometries([g, back]);
}

// ---- small building vocabulary (all coordinates local to the group g) ----
const B = (g, w, h, d, x, y, z, mat = M.stone, ry = 0) => { const m = box(w, h, d, x, y, z, mat, g); m.rotation.y = ry; return m; };
const C = (g, rt, rb, h, x, y, z, mat = M.stone, seg = 32) => cylinder(rt, rb, h, x, y, z, mat, seg, g);
function ringWall(g, rOut, rIn, h, y, mat = M.stone, seg = 32) {
  const s = new THREE.Shape(); s.absarc(0, 0, rOut, 0, Math.PI * 2, false);
  const hole = new THREE.Path(); hole.absarc(0, 0, rIn, 0, Math.PI * 2, true); s.holes.push(hole);
  const m = mesh(worldUV(new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: seg })), mat, g);
  m.rotation.x = -Math.PI / 2; m.position.y = y; return m;
}
function merlons(g, n, r, y, w, h, d, mat = M.trim, phase = 0) {
  for (let i = 0; i < n; i++) { const a = (i + phase) * Math.PI * 2 / n; B(g, w, h, d, Math.sin(a) * r, y, Math.cos(a) * r, mat, a); }
}
function corbels(g, n, r, y, mat = M.trim, s = 1) {
  for (let i = 0; i < n; i++) { const a = (i + .5) * Math.PI * 2 / n; B(g, .38 * s, .8 * s, .55 * s, Math.sin(a) * r, y, Math.cos(a) * r, mat, a); }
}
function quoins(g, hw, y0, y1) {
  let j = 0;
  for (let y = y0; y < y1 - .3; y += .5, j++) for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const a = (j + (sx * sz > 0 ? 0 : 1)) % 2 ? .95 : .6, b = a > .8 ? .6 : .95;
    B(g, a, .46, b, sx * (hw - a / 2 + .05), y + .25, sz * (hw - b / 2 + .05), M.trim);
  }
}
// Arrow slit / window on the four faces of a square shaft (or round shaft of radius hw).
function slits(g, hw, y, h = 1.2, w = .2, faces = [0, 1, 2, 3], mat = M.dark) {
  for (const f of faces) {
    const a = f * Math.PI / 2, x = Math.sin(a) * (hw + .02), z = Math.cos(a) * (hw + .02);
    B(g, w, h, .06, x, y, z, mat, a);
    B(g, w + .5, .16, .3, Math.sin(a) * (hw + .08), y - h / 2 - .08, Math.cos(a) * (hw + .08), M.trim, a);
    B(g, w + .34, .2, .22, Math.sin(a) * (hw + .06), y + h / 2 + .1, Math.cos(a) * (hw + .06), M.trim, a);
  }
}
function door(g, z, w = 1.05, h = 1.9, y0 = .8) {
  B(g, w, h, .08, 0, y0 + h / 2, z, M.dark);
  for (let x = -w / 2 + .14; x < w / 2; x += .23) B(g, .19, h - .1, .06, x, y0 + h / 2 - .05, z - .04 * Math.sign(z), M.timber);
  B(g, w + .5, .3, .35, 0, y0 + h + .15, z, M.trim);
  for (const s of [-1, 1]) B(g, .28, h, .3, s * (w / 2 + .14), y0 + h / 2, z, M.trim);
}
function banner(g, x, y, z, w, h, ry, mat = mats.cloth) {
  const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, -h); s.lineTo(0, -h + w * .45); s.lineTo(-w / 2, -h); s.closePath();
  const p = new THREE.Group(); p.position.set(x, y, z); p.rotation.y = ry; g.add(p);
  mesh(twoSided(s), mat, p).position.z = .03;
  const trimS = new THREE.Shape(); trimS.moveTo(-w / 2 + .08, -.12); trimS.lineTo(w / 2 - .08, -.12); trimS.lineTo(w / 2 - .08, -.2); trimS.lineTo(-w / 2 + .08, -.2);
  mesh(new THREE.ShapeGeometry(trimS), mats.gold, p).position.z = .04;
  // heraldic charge: a simple gold lozenge
  const d = new THREE.Shape(), cy = -h * .45, r = w * .2; d.moveTo(0, cy + r * 1.3); d.lineTo(r, cy); d.lineTo(0, cy - r * 1.3); d.lineTo(-r, cy); d.closePath();
  mesh(new THREE.ShapeGeometry(d), mats.gold, p).position.z = .045;
  C(p, .045, .045, w + .3, 0, 0, 0, M.timber, 6).rotation.z = Math.PI / 2;
}
function pennant(g, x, y, z, len = 2.8, mat = mats.cloth) {
  C(g, .05, .07, len, x, y + len / 2, z, M.iron, 6);
  C(g, .1, .1, .12, x, y + len + .04, z, mats.gold, 8);
  const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(1.7, -.28); s.lineTo(0, -.62); s.closePath();
  const f = mesh(twoSided(s), mat, g); f.position.set(x + .04, y + len - .1, z); f.rotation.y = -.5;
}

// ---- archers: every archer in the world is drawn by four InstancedMeshes ----
const unitZ = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, .5);
let archerGeo;
function archerBodyGeometry() {
  if (archerGeo) return archerGeo;
  const s = new THREE.Group();
  for (const x of [-.11, .11]) B(s, .15, .78, .17, x, .39, 0, mats.leather);
  C(s, .2, .26, .7, 0, 1.12, 0, mats.tunic, 8);
  C(s, .27, .27, .09, 0, .82, 0, mats.leather, 8);
  B(s, .5, .16, .26, 0, 1.43, 0, mats.tunic);
  const head = mesh(new THREE.SphereGeometry(.12, 10, 8), mats.skin, s); head.position.set(0, 1.64, .02);
  C(s, .02, .17, .36, 0, 1.72, -.03, mats.hood, 8);
  C(s, .07, .07, .62, -.02, 1.3, -.2, mats.leather, 6).rotation.z = .35;
  for (const x of [-.06, 0, .05]) B(s, .06, .14, .02, x - .12, 1.66, -.22, mats.string, .3);
  beam([.22, 1.42, 0], [.03, 1.44, .56], .1, mats.tunic, s); // bow arm reaching forward
  const bow = mesh(new THREE.TorusGeometry(.56, .022, 5, 18, 1.9).rotateZ(-.95).rotateY(-Math.PI / 2), M.timber, s);
  bow.position.set(.03, 1.44, .08);
  return (archerGeo = bake(s, false).children[0].geometry);
}
export const liveArchers = new Set();
let archerMeshes;
const tipTop = new THREE.Vector3(.03, 1.44 + .56 * Math.sin(.95), .08 + .56 * Math.cos(.95)), tipBot = tipTop.clone().setY(1.44 - .56 * Math.sin(.95));
export function archerFigure() {
  const f = { root: new THREE.Object3D(), draw: 0, arm: new THREE.Matrix4(), s1: new THREE.Matrix4(), s2: new THREE.Matrix4(), arrow: new THREE.Matrix4() };
  liveArchers.add(f); poseArcher(f, 0);
  return f;
}
const _v = new THREE.Vector3(), _z = new THREE.Vector3(0, 0, 1), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
function segment(m, a, b, w) { _v.subVectors(b, a); const l = _v.length(); _q.setFromUnitVectors(_z, _v.divideScalar(l)); return m.compose(a, _q, _s.set(w, w, l)); }
const shoulder = new THREE.Vector3(-.2, 1.43, 0), hand = new THREE.Vector3(), handNock = new THREE.Vector3();
export function poseArcher(f, draw) {
  f.draw = draw;
  hand.set(.03, 1.46, tipTop.z - draw * .52);
  segment(f.arm, shoulder, hand, .1);
  segment(f.s1, tipTop, hand, .012); segment(f.s2, tipBot, hand, .012);
  f.arrow.compose(hand, _q.identity(), _s.set(.025, .025, draw > .15 ? .9 : 0));
}
const _m = new THREE.Matrix4();
export function renderArchers(scene) {
  if (!archerMeshes) {
    const mk = (g, mat, n) => { const m = new THREE.InstancedMesh(g, mat, n); m.frustumCulled = false; m.castShadow = false; m.receiveShadow = true; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); return m; };
    archerMeshes = [mk(archerBodyGeometry(), shared.plain, 96), mk(unitZ, mats.tunic, 96), mk(unitZ, mats.string, 192), mk(unitZ, mats.plank, 96)];
  }
  const [body, arm, str, arrow] = archerMeshes;
  let n = 0;
  for (const f of liveArchers) {
    if (n >= 96 || !f.root.parent || !f.root.parent.visible) continue;
    f.root.updateWorldMatrix(true, false);
    const w = f.root.matrixWorld;
    body.setMatrixAt(n, w); arm.setMatrixAt(n, _m.multiplyMatrices(w, f.arm)); arrow.setMatrixAt(n, _m.multiplyMatrices(w, f.arrow));
    str.setMatrixAt(n * 2, _m.multiplyMatrices(w, f.s1)); str.setMatrixAt(n * 2 + 1, _m.multiplyMatrices(w, f.s2));
    n++;
  }
  body.count = arm.count = arrow.count = n; str.count = n * 2;
  for (const m of archerMeshes) m.instanceMatrix.needsUpdate = true;
}

// ---- weapons ----
function cannon(scale, big) {
  const t = new THREE.Group();
  C(t, 1.3, 1.35, .16, 0, .08, 0, mats.plank, 20);
  for (const x of [-.44, .44]) {
    const cheek = B(t, .18, .62, 1.7, x, .52, -.1, M.timber); cheek.rotation.x = -.12;
    for (const z of [-.6, .5]) { const w = C(t, .3, .3, .14, x * 1.28, .3, z, M.timber, 12); w.rotation.z = Math.PI / 2; const r = C(t, .33, .33, .1, x * 1.3, .3, z, M.iron, 12); r.rotation.z = Math.PI / 2; }
  }
  C(t, .06, .06, 1.3, 0, .3, -.6, M.iron, 6).rotation.z = Math.PI / 2;
  C(t, .06, .06, 1.3, 0, .3, .5, M.iron, 6).rotation.z = Math.PI / 2;
  const turret = bake(t, false);
  const prof = big
    ? [[0, -1.1], [.14, -1.1], [.16, -1.02], [.1, -.96], [.42, -.9], [.46, -.7], [.44, -.2], [.47, -.15], [.47, -.05], [.42, 0], [.4, .9], [.44, .95], [.44, 1.05], [.38, 1.1], [.32, 1.1], [.3, .8], [0, .8]]
    : [[0, -1.0], [.1, -1.0], [.12, -.95], [.08, -.9], [.3, -.86], [.33, -.7], [.3, -.6], [.29, -.1], [.32, -.06], [.32, .05], [.27, .09], [.22, 1.2], [.26, 1.24], [.27, 1.36], [.21, 1.39], [.15, 1.36], [.15, .9], [0, .9]];
  const g = new THREE.LatheGeometry(prof.map(([r, z]) => new THREE.Vector2(r, z)), 24).rotateX(Math.PI / 2);
  const barrelG = new THREE.Group();
  mesh(g, mats.bronze, barrelG);
  C(barrelG, .08, .08, 1.02, 0, 0, -.05, M.iron, 8).rotation.z = Math.PI / 2;
  const muzzleZ = big ? 1.1 : 1.39;
  const bore = mesh(new THREE.CircleGeometry(big ? .3 : .14, 16), M.dark, barrelG); bore.position.z = muzzleZ - .02;
  const barrel = bake(barrelG, false);
  const pitch = new THREE.Group(); pitch.position.set(0, .82, -.05); pitch.add(barrel); pitch.name = 'pitch';
  const muzzle = new THREE.Object3D(); muzzle.position.z = muzzleZ; muzzle.name = 'muzzle'; barrel.add(muzzle); barrel.name = 'barrel';
  turret.add(pitch); turret.scale.setScalar(scale);
  return turret;
}
function ballista(scale) {
  const t = new THREE.Group();
  C(t, 1.1, 1.15, .14, 0, .07, 0, mats.plank, 16);
  C(t, .22, .3, 1.0, 0, .55, 0, M.timber, 8);
  C(t, .26, .26, .12, 0, 1.0, 0, M.iron, 8);
  B(t, .34, .28, 3.5, 0, 1.18, .2, mats.plank);
  B(t, .1, .06, 3.2, 0, 1.34, .3, M.iron);
  B(t, 1.2, .72, .36, 0, 1.22, 1.45, mats.plank);
  for (const x of [-.42, .42]) { C(t, .17, .17, .95, x, 1.22, 1.45, mats.rope, 10); C(t, .21, .21, .08, x, 1.72, 1.45, M.iron, 10); C(t, .21, .21, .08, x, .72, 1.45, M.iron, 10); }
  for (const x of [-.25, .25]) beam([x * 2.4, .14, -.3], [x * .6, 1.05, .1], .14, M.timber, t);
  // winch
  C(t, .06, .06, .9, 0, 1.12, -1.35, M.iron, 6).rotation.z = Math.PI / 2;
  for (const x of [-.42, .42]) { const w = C(t, .26, .26, .08, x, 1.12, -1.35, M.timber, 10); w.rotation.z = Math.PI / 2; }
  const turret = bake(t, false);
  const mkArm = side => {
    const a = new THREE.Group(); a.position.set(side * .42, 1.22, 1.45);
    const ag = new THREE.Group(); B(ag, 1.35, .15, .15, side * .675, 0, 0, mats.plank); B(ag, .16, .16, .16, side * 1.33, 0, 0, M.iron);
    a.add(bake(ag, false)); turret.add(a); a.name = side < 0 ? 'armL' : 'armR'; return a;
  };
  mkArm(-1); mkArm(1);
  const boltG = new THREE.Group();
  C(boltG, .05, .05, 2.1, 0, 0, 0, M.timber, 6).rotation.x = Math.PI / 2;
  mesh(new THREE.ConeGeometry(.1, .38, 6).rotateX(Math.PI / 2), M.iron, boltG).position.z = 1.2;
  for (const r of [0, Math.PI / 2]) { const f = B(boltG, .02, .22, .4, 0, 0, -.85, mats.string); f.rotation.z = r; }
  const bolt = bake(boltG, false); bolt.name = 'bolt'; turret.add(bolt);
  for (const n of ['s1', 's2']) { const m = new THREE.Mesh(unitZ, mats.string); m.name = n; turret.add(m); }
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 1.4, 2.1); muzzle.name = 'muzzle'; turret.add(muzzle);
  turret.scale.setScalar(scale);
  return turret;
}
const armTip = new THREE.Vector3(), claw = new THREE.Vector3();
// draw 0 = released (string forward), 1 = spanned
export function poseBallista(turret, draw, loaded) {
  const p = turret.userData.parts || (turret.userData.parts = ['armL', 'armR', 'bolt', 's1', 's2'].map(n => turret.getObjectByName(n)));
  const [armL, armR, bolt, s1, s2] = p, ang = -.12 + draw * .55;
  armL.rotation.y = -ang; armR.rotation.y = ang;
  claw.set(0, 1.4, 1.45 - draw * 2.35);
  for (const [arm, s, side] of [[armL, s1, -1], [armR, s2, 1]]) {
    armTip.set(side * 1.33, 0, 0).applyAxisAngle(THREE.Object3D.DEFAULT_UP, side * ang).add(arm.position);
    segment(s.matrix, armTip, claw, .03); s.matrixAutoUpdate = false; s.matrixWorldNeedsUpdate = true;
  }
  bolt.visible = loaded; bolt.position.set(0, 1.42, claw.z + 1.05);
}

function crystalCradle(g, y, r, h) {
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4, cx = Math.sin(a), cz = Math.cos(a);
    beam([cx * r * .8, y, cz * r * .8], [cx * r * 1.1, y + h * .55, cz * r * 1.1], .3, M.trim, g);
    beam([cx * r * 1.1, y + h * .55, cz * r * 1.1], [cx * r * .55, y + h, cz * r * .55], .24, M.trim, g);
    const tip = mesh(new THREE.ConeGeometry(.12, .5, 6), M.trim, g); tip.position.set(cx * r * .5, y + h + .2, cz * r * .5);
    B(g, .3, .16, .3, cx * r * 1.1, y + h * .55, cz * r * 1.1, mats.gold, a);
  }
}
function crystalGroup(size, shards, ring) {
  const g = new THREE.Group(); g.name = 'crystal';
  const mat = mats.crystal.clone();
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0).scale(.5 * size, 1.05 * size, .5 * size), mat); core.name = 'core'; g.add(core);
  const orbit = new THREE.Group(); orbit.name = 'orbit'; g.add(orbit);
  for (let i = 0; i < shards; i++) {
    const a = i * Math.PI * 2 / shards, s = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0).scale(.14 * size, .32 * size, .14 * size), mat);
    s.position.set(Math.cos(a) * size * 1.2, Math.sin(i * 2.1) * .3 * size, Math.sin(a) * size * 1.2); orbit.add(s);
  }
  if (ring) {
    const rm = new THREE.MeshBasicMaterial({ color: new THREE.Color(.55, .75, 1.6), transparent: true, opacity: .85, blending: THREE.AdditiveBlending, depthWrite: false });
    const t = new THREE.Mesh(new THREE.TorusGeometry(size * 1.55, .025, 4, 64), rm); t.rotation.x = Math.PI / 2.3; t.name = 'ring'; g.add(t);
  }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#7d9ef0', transparent: true, opacity: .3, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.setScalar(size * 4.2); glow.name = 'glow'; g.add(glow);
  g.traverse(o => { o.castShadow = false; });
  return g;
}
let glowTex;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, '#ffffffff'); gr.addColorStop(.25, '#ffffff66'); gr.addColorStop(1, '#ffffff00');
  x.fillStyle = gr; x.fillRect(0, 0, 128, 128); glowTex = new THREE.CanvasTexture(c); glowTex.colorSpace = THREE.SRGBColorSpace; return glowTex;
}

// ---- tower bodies. Each returns { g (static body group), turret (Object3D at turretY), extra } ----
function archerBody(level) {
  const g = new THREE.Group();
  if (level === 0) {
    B(g, 4.3, 1.1, 4.3, 0, .35, 0, M.base); B(g, 3.9, .2, 3.9, 0, .98, 0, M.trim);
    B(g, 3.5, 5.2, 3.5, 0, 3.5, 0); quoins(g, 1.75, 1.05, 6.1);
    slits(g, 1.75, 3.7, 1.2, .2, [0, 1, 3]); door(g, -1.78, .95, 1.7, 1.05);
    B(g, 3.8, .3, 3.8, 0, 6.15, 0, M.trim);
    for (const x of [-1.6, -.53, .53, 1.6]) { B(g, .22, .22, 4.9, x, 6.42, 0, M.timber); B(g, 4.9, .22, .22, 0, 6.42, x, M.timber); }
    for (const a of [0, 1, 2, 3]) { const s = Math.sin(a * Math.PI / 2), c = Math.cos(a * Math.PI / 2); for (const o of [-1, 1]) beam([s * 1.76 + c * o, 5.1, c * 1.76 - s * o], [s * 2.35 + c * o, 6.36, c * 2.35 - s * o], .16, M.timber, g); }
    platform(g, 4.8, 6.6, 1.05);
    return { g, turretY: 6.68, archers: [[0, 0]], height: 8 };
  }
  if (level === 1) {
    B(g, 4.4, 1.3, 4.4, 0, .4, 0, M.base); B(g, 4.0, .22, 4.0, 0, 1.1, 0, M.trim);
    B(g, 3.7, 7.0, 3.7, 0, 4.6, 0); quoins(g, 1.85, 1.2, 8.1);
    B(g, 3.9, .22, 3.9, 0, 4.5, 0, M.trim);
    slits(g, 1.85, 3.1, 1.1, .2, [0, 1, 3]); slits(g, 1.85, 6.3, 1.2, .22); door(g, -1.88, 1.0, 1.9, 1.2);
    for (let i = 0; i < 4; i++) for (const o of [-1.3, -.43, .43, 1.3]) { const a = i * Math.PI / 2; B(g, .36, .7, .5, Math.sin(a) * 1.95 + Math.cos(a) * o, 7.75, Math.cos(a) * 1.95 - Math.sin(a) * o, M.trim, a); }
    B(g, 4.1, .3, 4.1, 0, 8.15, 0, M.trim);
    platform(g, 5.0, 8.4, 1.0, true);
    for (const x of [-2.35, 2.35]) for (const z of [-2.35, 2.35]) B(g, .24, 3.0, .24, x, 9.9, z, M.timber);
    for (const s of [-1, 1]) { B(g, 4.95, .2, .2, 0, 11.3, s * 2.35, M.timber); B(g, .2, .2, 4.95, s * 2.35, 11.3, 0, M.timber); }
    for (const s of [-1, 1]) for (const t of [-1, 1]) { beam([s * 2.35, 10.4, t * 1.3], [s * 2.35, 11.25, t * 2.2], .12, M.timber, g); beam([t * 1.3, 10.4, s * 2.35], [t * 2.2, 11.25, s * 2.35], .12, M.timber, g); }
    pitchedRoof(5.8, 5.8, 2.5, 0, 11.4, 0, g);
    banner(g, 0, 7.3, 1.9, 1.15, 2.7, 0);
    return { g, turretY: 8.52, archers: [[-.85, .35], [.85, -.35]], height: 14 };
  }
  B(g, 4.6, 1.6, 4.6, 0, .55, 0, M.base); B(g, 4.3, .25, 4.3, 0, 1.4, 0, M.trim);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const b = B(g, 1.0, 3.2, 1.0, sx * 2.05, 1.5, sz * 2.05, M.base); b.rotation.y = Math.PI / 4; }
  B(g, 4.0, 9.4, 4.0, 0, 6.2, 0); quoins(g, 2.0, 1.5, 10.9);
  for (const y of [4.3, 7.6]) B(g, 4.2, .24, 4.2, 0, y, 0, M.trim);
  slits(g, 2.0, 2.9, 1.0, .2, [1, 3]); slits(g, 2.0, 6.0, 1.3, .22); slits(g, 2.0, 9.2, 1.5, .5, [0, 1, 2, 3], M.glass);
  door(g, -2.03, 1.1, 2.1, 1.45);
  for (let i = 0; i < 4; i++) for (const o of [-1.8, -.9, 0, .9, 1.8]) { const a = i * Math.PI / 2; B(g, .38, .8, .55, Math.sin(a) * 2.2 + Math.cos(a) * o, 10.75, Math.cos(a) * 2.2 - Math.sin(a) * o, M.trim, a); }
  B(g, 4.9, .3, 4.9, 0, 11.2, 0, M.trim);
  B(g, 4.6, .15, 4.6, 0, 11.35, 0, mats.plank);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2, s = Math.sin(a), c = Math.cos(a);
    B(g, 4.9, .75, .4, s * 2.25, 11.7, c * 2.25, M.stone, a);
    for (const o of [-2.0, 0, 2.0]) B(g, .95, .75, .5, s * 2.25 + c * o, 12.45, c * 2.25 - s * o, M.trim, a);
  }
  for (const x of [-2.0, 2.0]) for (const z of [-2.0, 2.0]) B(g, .3, 3.4, .3, x, 13.1, z, M.timber);
  for (const s of [-1, 1]) { B(g, 4.3, .22, .22, 0, 14.75, s * 2.0, M.timber); B(g, .22, .22, 4.3, s * 2.0, 14.75, 0, M.timber); }
  tiledCone(0, 14.85, 0, 3.55, 4.6, g);
  pennant(g, 0, 19.2, 0, 2.8);
  banner(g, 0, 10.2, 2.06, 1.3, 3.4, 0); banner(g, 2.06, 10.2, 0, 1.3, 3.4, Math.PI / 2); banner(g, -2.06, 10.2, 0, 1.3, 3.4, -Math.PI / 2);
  return { g, turretY: 11.43, archers: [[-1.05, .7], [1.05, .7], [0, -1.0]], height: 20 };
}
function platform(g, w, y, railH, parapet = false) {
  B(g, w, .16, w, 0, y, 0, mats.plank);
  const h = w / 2 - .1;
  for (const x of [-h, 0, h]) for (const z of [-h, 0, h]) if (x || z) B(g, .17, railH, .17, x, y + railH / 2, z, M.timber);
  for (const s of [-1, 1]) {
    B(g, w - .05, .12, .14, 0, y + railH, s * h, M.timber); B(g, .14, .12, w - .05, s * h, y + railH, 0, M.timber);
    if (parapet) { B(g, w - .1, railH * .6, .08, 0, y + railH * .35, s * (h + .03), mats.plank); B(g, .08, railH * .6, w - .1, s * (h + .03), y + railH * .35, 0, mats.plank); }
    else { B(g, w - .05, .1, .1, 0, y + railH * .5, s * h, M.timber); B(g, .1, .1, w - .05, s * h, y + railH * .5, 0, M.timber); }
  }
}
function cannonBody(level) {
  const g = new THREE.Group();
  const props = (r, y) => {
    for (const [a, k] of [[2.3, 0], [2.75, 1]]) { const x = Math.sin(a) * r, z = Math.cos(a) * r; C(g, .3, .3, .7, x, y + .35, z, mats.plank, 10); for (const yy of [.12, .58]) C(g, .32, .32, .06, x, y + yy, z, M.iron, 10); }
    const bx = Math.sin(3.6) * r, bz = Math.cos(3.6) * r, sg = new THREE.SphereGeometry(.16, 8, 6);
    for (const [dx, dy, dz] of [[0, 0, 0], [.33, 0, 0], [.16, 0, .29], [.16, .26, .1]]) { const m = mesh(sg, M.iron, g); m.position.set(bx + dx, y + .16 + dy, bz + dz); }
  };
  if (level === 0) {
    C(g, 3.1, 3.35, 1.2, 0, .4, 0, M.base);
    C(g, 2.85, 3.0, 3.2, 0, 2.6, 0);
    C(g, 3.05, 3.05, .3, 0, 4.1, 0, M.trim);
    slits(g, 2.9, 2.6, .5, .6, [0, 1, 3]); door(g, -2.95, 1.0, 1.7, .95);
    C(g, 2.8, 2.8, .2, 0, 4.25, 0, mats.plank, 24);
    // timber breastwork on the drum
    for (let i = 0; i < 14; i++) {
      const a = i * Math.PI * 2 / 14, b = a + Math.PI / 14, r = 2.78;
      B(g, 1.3, .55, .1, Math.sin(b) * r, 4.63, Math.cos(b) * r, mats.plank, b);
      B(g, .16, .95, .16, Math.sin(a) * 2.86, 4.7, Math.cos(a) * 2.86, M.timber, a);
    }
    for (let i = 0; i < 14; i++) { const b = (i + .5) * Math.PI * 2 / 14; B(g, 1.32, .1, .16, Math.sin(b) * 2.84, 4.94, Math.cos(b) * 2.84, M.timber, b); }
    return { g, turretY: 4.36, height: 7, cannon: [1.05, false] };
  }
  if (level === 1) {
    C(g, 3.3, 3.55, 1.4, 0, .45, 0, M.base);
    C(g, 3.05, 3.25, 4.6, 0, 3.3, 0);
    C(g, 3.28, 3.28, .25, 0, 3.2, 0, M.trim);
    slits(g, 3.1, 2.3, .55, .65, [0, 1, 3]); slits(g, 3.1, 4.4, 1.0, .2, [0, 1, 2, 3]); door(g, -3.2, 1.0, 1.9, 1.1);
    corbels(g, 18, 3.18, 5.65);
    C(g, 3.5, 3.5, .3, 0, 6.05, 0, M.trim);
    C(g, 3.0, 3.0, .2, 0, 6.05, 0, mats.plank, 24);
    ringWall(g, 3.45, 2.95, .8, 6.2);
    merlons(g, 10, 3.2, 7.4, 1.05, .8, .6);
    C(g, 1.45, 1.6, .5, 0, 6.4, 0, M.trim, 24);
    props(2.45, 6.15);
    banner(g, 0, 5.2, 3.24, 1.2, 2.8, 0);
    return { g, turretY: 6.66, height: 9, cannon: [1.25, false] };
  }
  C(g, 3.35, 3.8, 2.3, 0, .85, 0, M.base);
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + Math.PI / 6; const b = B(g, 1.0, 2.6, 1.1, Math.sin(a) * 3.45, 1.0, Math.cos(a) * 3.45, M.base, a); b.rotation.x = 0; }
  C(g, 3.5, 3.5, .3, 0, 2.05, 0, M.trim);
  C(g, 3.1, 3.3, 5.6, 0, 4.95, 0);
  C(g, 3.32, 3.32, .25, 0, 4.9, 0, M.trim);
  slits(g, 3.2, 3.4, .55, .7, [0, 1, 3]); slits(g, 3.1, 6.3, 1.1, .22); door(g, -3.62, 1.0, 1.45, .4);
  corbels(g, 20, 3.22, 7.55, M.trim, 1.1);
  C(g, 3.6, 3.6, .3, 0, 8.05, 0, M.trim);
  C(g, 3.1, 3.1, .2, 0, 8.05, 0, mats.plank, 24);
  ringWall(g, 3.55, 3.05, .9, 8.2);
  merlons(g, 12, 3.3, 9.5, 1.0, .85, .6, M.trim, .5);
  C(g, .85, .85, 2.9, 0, 9.55, -3.25, M.stone, 20);
  corbels(g, 6, .8, 7.8, M.trim, .7);
  C(g, .95, .95, .2, 0, 11.0, -3.25, M.trim, 20);
  tiledCone(0, 11.1, -3.25, 1.3, 2.6, g);
  B(g, .2, .7, .05, 0, 10.0, -2.38, M.dark);
  C(g, 1.55, 1.75, 1.0, 0, 8.65, 0, M.trim, 24);
  props(2.45, 8.15);
  pennant(g, 2.3, 8.6, -2.3, 3.0); pennant(g, -2.3, 8.6, -2.3, 3.0);
  banner(g, 0, 7.0, 3.32, 1.4, 3.4, 0);
  return { g, turretY: 9.16, height: 14, cannon: [1.4, true] };
}
function mageBody(level) {
  const g = new THREE.Group();
  const windows = (r, y, h, n = 4, off = 0) => { for (let i = 0; i < n; i++) { const a = (i + off) * Math.PI * 2 / n; B(g, .34, h, .06, Math.sin(a) * r, y, Math.cos(a) * r, mats.runeGlass, a); B(g, .6, .16, .3, Math.sin(a) * (r + .06), y - h / 2 - .08, Math.cos(a) * (r + .06), M.trim, a); } };
  if (level === 0) {
    C(g, 2.3, 2.6, 1.2, 0, .4, 0, M.base, 8);
    C(g, 1.35, 1.65, 7.2, 0, 4.6, 0, M.stone, 8);
    for (const [y, r] of [[1.1, 1.8], [4.6, 1.62], [8.1, 1.52]]) C(g, r, r, .26, 0, y, 0, M.trim, 8);
    windows(1.43, 6.2, 1.3, 4, .5); door(g, -1.6, .9, 1.7, 1.0);
    C(g, 1.75, 1.4, .6, 0, 8.45, 0, M.trim, 8);
    crystalCradle(g, 8.7, 1.25, 2.3);
    return { g, turretY: 10.0, height: 12, crystal: [1.0, 0, false] };
  }
  if (level === 1) {
    C(g, 2.4, 2.75, 1.3, 0, .45, 0, M.base, 8);
    C(g, 1.45, 1.75, 6.4, 0, 4.2, 0, M.stone, 8);
    for (const [y, r] of [[1.15, 1.9], [4.2, 1.72]]) C(g, r, r, .26, 0, y, 0, M.trim, 8);
    windows(1.53, 5.6, 1.2, 4, .5); door(g, -1.72, .95, 1.8, 1.05);
    corbels(g, 8, 1.5, 7.2, M.trim, .9);
    C(g, 2.35, 2.35, .3, 0, 7.6, 0, M.trim, 8);
    for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8; C(g, .07, .07, .6, Math.sin(a) * 2.2, 8.05, Math.cos(a) * 2.2, M.trim, 6); }
    C(g, 2.3, 2.3, .12, 0, 8.4, 0, M.trim, 8);
    C(g, 1.12, 1.3, 3.8, 0, 9.65, 0, M.stone, 8);
    windows(1.16, 9.8, 1.8, 4, 0);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4, x = Math.sin(a) * 2.1, z = Math.cos(a) * 2.1; C(g, .2, .22, .9, x, 8.2, z, M.trim, 8); tiledCone(x, 8.62, z, .38, 1.2, g); }
    C(g, 1.6, 1.25, .55, 0, 11.75, 0, M.trim, 8);
    crystalCradle(g, 12.0, 1.35, 2.6);
    return { g, turretY: 13.4, height: 16, crystal: [1.25, 2, false] };
  }
  C(g, 2.75, 3.05, 1.5, 0, .5, 0, M.base, 8);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4, x = Math.sin(a) * 2.35, z = Math.cos(a) * 2.35;
    C(g, .45, .55, 5.2, x, 3.6, z, M.stone, 8); C(g, .6, .6, .22, x, 6.2, z, M.trim, 8); tiledCone(x, 6.3, z, .75, 2.2, g);
    beam([x * .95, 5.4, z * .95], [x * .62, 7.4, z * .62], .32, M.trim, g);
  }
  C(g, 1.55, 1.9, 7.8, 0, 5.0, 0, M.stone, 8);
  for (const [y, r] of [[1.3, 2.05], [4.8, 1.85]]) C(g, r, r, .28, 0, y, 0, M.trim, 8);
  windows(1.63, 6.2, 1.5, 4, .5); windows(1.72, 3.0, .9, 4, .5); door(g, -1.9, 1.0, 1.9, 1.25);
  corbels(g, 8, 1.6, 8.6, M.trim, 1);
  C(g, 2.55, 2.55, .32, 0, 9.05, 0, M.trim, 8);
  for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8; C(g, .08, .08, .62, Math.sin(a) * 2.4, 9.5, Math.cos(a) * 2.4, M.trim, 6); }
  C(g, 2.5, 2.5, .13, 0, 9.85, 0, M.trim, 8);
  C(g, 1.2, 1.4, 4.4, 0, 11.35, 0, M.stone, 8);
  windows(1.25, 11.6, 2.4, 4, 0);
  C(g, 1.3, 1.3, .2, 0, 12.95, 0, M.trim, 8);
  C(g, 1.75, 1.35, .6, 0, 13.8, 0, M.trim, 8);
  crystalCradle(g, 14.05, 1.5, 3.0);
  banner(g, 0, 8.3, 1.72, 1.1, 3.2, 0, mats.clothBlue); banner(g, 1.72, 8.3, 0, 1.1, 3.2, Math.PI / 2, mats.clothBlue); banner(g, -1.72, 8.3, 0, 1.1, 3.2, -Math.PI / 2, mats.clothBlue);
  return { g, turretY: 16.35, height: 20, crystal: [1.6, 3, true] };
}
function ballistaBody(level) {
  const g = new THREE.Group();
  const parapet = (w, y, h, merl) => {
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2, s = Math.sin(a), c = Math.cos(a), half = w / 2 - .2;
      B(g, w, h, .4, s * half, y + h / 2, c * half, M.stone, a);
      for (const o of merl) B(g, .8, .55, .5, s * half + c * o, y + h + .27, c * half - s * o, M.trim, a);
    }
  };
  if (level === 0) {
    B(g, 4.3, 1.0, 4.3, 0, .3, 0, M.base); B(g, 4.0, .2, 4.0, 0, .9, 0, M.trim);
    B(g, 3.8, 2.7, 3.8, 0, 2.25, 0); quoins(g, 1.9, 1.0, 3.6);
    slits(g, 1.9, 2.3, 1.0, .2, [0, 1, 3]); door(g, -1.93, .95, 1.6, .95);
    B(g, 4.1, .25, 4.1, 0, 3.65, 0, M.trim); B(g, 3.7, .15, 3.7, 0, 3.8, 0, mats.plank);
    parapet(4.1, 3.75, .45, [-1.55, 1.55]);
    return { g, turretY: 3.88, height: 6, ballista: 1.15 };
  }
  if (level === 1) {
    B(g, 4.4, 1.2, 4.4, 0, .35, 0, M.base); B(g, 4.1, .22, 4.1, 0, 1.05, 0, M.trim);
    B(g, 3.9, 4.1, 3.9, 0, 3.1, 0); quoins(g, 1.95, 1.1, 5.1);
    B(g, 4.05, .2, 4.05, 0, 3.0, 0, M.trim);
    slits(g, 1.95, 2.1, .9, .2, [0, 1, 3]); slits(g, 1.95, 4.1, 1.1, .2); door(g, -1.98, 1.0, 1.7, 1.15);
    for (let i = 0; i < 4; i++) for (const o of [-1.4, -.47, .47, 1.4]) { const a = i * Math.PI / 2; B(g, .36, .6, .45, Math.sin(a) * 2.05 + Math.cos(a) * o, 5.05, Math.cos(a) * 2.05 - Math.sin(a) * o, M.trim, a); }
    B(g, 4.5, .25, 4.5, 0, 5.45, 0, M.trim); B(g, 4.1, .15, 4.1, 0, 5.6, 0, mats.plank);
    parapet(4.5, 5.55, .5, [-1.7, 0, 1.7]);
    // bolt rack
    for (const x of [-1.4, 1.4]) B(g, .12, .9, .12, x, 6.1, -1.75, M.timber);
    for (let i = 0; i < 4; i++) { const b = C(g, .05, .05, 2.6, 0, 6.05 + i * .12, -1.7 - i * .05, M.timber, 6); b.rotation.z = Math.PI / 2; }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { B(g, .55, 4.1, .55, sx * 1.98, 3.1, sz * 1.98, M.trim); pennant(g, sx * 2.05, 6.3, sz * 2.05, 2.4); }
    // bretèche (box machicolation) over the door
    for (const x of [-.55, .55]) B(g, .3, .7, .6, x, 4.15, -2.2, M.trim);
    B(g, 1.6, 1.0, .75, 0, 4.95, -2.35, M.stone); B(g, 1.7, .2, .85, 0, 5.5, -2.35, M.trim);
    B(g, .18, .5, .04, 0, 4.95, -2.73, M.dark);
    banner(g, 0, 4.7, 1.99, 1.1, 2.5, 0);
    return { g, turretY: 5.68, height: 9, ballista: 1.35 };
  }
  B(g, 4.6, 1.5, 4.6, 0, .5, 0, M.base); B(g, 4.3, .24, 4.3, 0, 1.3, 0, M.trim);
  B(g, 4.1, 6.0, 4.1, 0, 4.3, 0); quoins(g, 2.05, 1.4, 7.2);
  for (const y of [3.6, 7.3]) B(g, 4.3, .24, 4.3, 0, y, 0, M.trim);
  slits(g, 2.05, 2.5, 1.0, .2, [0, 1, 3]); slits(g, 2.05, 5.4, 1.4, .45, [0, 1, 2, 3], M.glass); door(g, -2.08, 1.1, 2.0, 1.4);
  for (let i = 0; i < 4; i++) for (const o of [-.9, 0, .9]) { const a = i * Math.PI / 2; B(g, .4, .7, .5, Math.sin(a) * 2.15 + Math.cos(a) * o, 7.15, Math.cos(a) * 2.15 - Math.sin(a) * o, M.trim, a); }
  B(g, 4.6, .15, 4.6, 0, 7.5, 0, mats.plank);
  parapet(4.7, 7.45, .55, [-.8, .8]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * 2.2, z = sz * 2.2;
    C(g, .78, .25, 1.1, x, 6.9, z, M.trim, 16); C(g, .78, .78, 1.9, x, 8.4, z, M.stone, 16);
    C(g, .9, .9, .18, x, 9.4, z, M.trim, 16); tiledCone(x, 9.48, z, 1.08, 2.1, g);
    B(g, .16, .6, .05, x + sx * .55, 8.4, z + sz * .55, M.dark, Math.atan2(sx, sz));
  }
  pennant(g, 2.2, 11.9, 2.2, 1.6); pennant(g, -2.2, 11.9, -2.2, 1.6);
  banner(g, 0, 6.8, 2.08, 1.3, 3.0, 0); banner(g, 2.08, 6.8, 0, 1.3, 3.0, Math.PI / 2); banner(g, -2.08, 6.8, 0, 1.3, 3.0, -Math.PI / 2);
  return { g, turretY: 7.58, height: 12, ballista: 1.5 };
}
// ---- pitch cauldron: a torsion mangonel beside a fire-heated cauldron of pitch ----
export const MANGONEL = { rest: -1.15, thrown: .38 };   // arm angle (rotation.x): cocked back / against the crossbar
function mangonel(scale) {
  const t = new THREE.Group();
  C(t, 1.25, 1.3, .16, 0, .08, 0, mats.plank, 18);
  for (const x of [-.58, .58]) {
    beam([x, .14, -.95], [x, 1.62, 0], .16, M.timber, t);         // rear leg up to the axle
    beam([x, .14, .95], [x, 3.25, .62], .16, M.timber, t);        // front post carries the stop beam
    beam([x, .14, -.95], [x, .14, .95], .18, M.timber, t);        // sill
    B(t, .22, .26, .22, x, 1.62, 0, M.iron);
  }
  B(t, 1.42, .2, .2, 0, 3.2, .62, M.timber);
  C(t, .17, .17, 1.0, 0, 3.2, .62, mats.rope, 10).rotation.z = Math.PI / 2;  // padded stop
  // torsion skein and its iron collars
  C(t, .3, .3, .92, 0, 1.62, 0, mats.rope, 12).rotation.z = Math.PI / 2;
  for (const x of [-.48, .48]) C(t, .34, .34, .08, x, 1.62, 0, M.iron, 12).rotation.z = Math.PI / 2;
  // winch at the back
  C(t, .06, .06, 1.2, 0, .55, -1.05, M.iron, 6).rotation.z = Math.PI / 2;
  for (const x of [-.5, .5]) { const w = C(t, .28, .28, .08, x, .55, -1.05, M.timber, 10); w.rotation.z = Math.PI / 2; }
  const turret = bake(t, false);
  const armG = new THREE.Group();
  B(armG, .2, 2.75, .2, 0, 1.08, 0, M.timber);
  for (const y of [.5, 1.3]) B(armG, .24, .08, .24, 0, y, 0, M.iron);
  C(armG, .34, .2, .2, 0, 2.48, 0, mats.plank, 12);              // cup
  const arm = new THREE.Group(); arm.position.set(0, 1.62, 0); arm.add(bake(armG, false)); arm.name = 'arm';
  const pot = mesh(new THREE.SphereGeometry(.25, 12, 8), mats.clay, arm); pot.position.y = 2.72; pot.name = 'pot'; pot.castShadow = false;
  arm.rotation.x = MANGONEL.rest; turret.add(arm);
  // release point: where the cup is as the arm swings through ~20° past vertical
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 1.62 + 2.6 * Math.cos(.35), 2.6 * Math.sin(.35)); muzzle.name = 'muzzle'; turret.add(muzzle);
  turret.scale.setScalar(scale);
  return turret;
}
function cauldron(g, x, y, z, s) {
  for (let i = 0; i < 9; i++) { const a = i * Math.PI * 2 / 9; B(g, .34 * s, .22 * s, .26 * s, x + Math.sin(a) * .78 * s, y + .11 * s, z + Math.cos(a) * .78 * s, M.trim, a); }
  C(g, .55 * s, .65 * s, .16 * s, x, y + .08 * s, z, mats.coal, 10);
  for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3 + .4; beam([x + Math.sin(a) * .62 * s, y, z + Math.cos(a) * .62 * s], [x + Math.sin(a) * .45 * s, y + .62 * s, z + Math.cos(a) * .45 * s], .09 * s, M.iron, g); }
  const prof = [[0, 0], [.32, .03], [.52, .16], [.62, .38], [.62, .6], [.68, .64], [.68, .72], [.6, .72]].map(([r, h]) => new THREE.Vector2(r * s, h * s));
  mesh(new THREE.LatheGeometry(prof, 20), M.iron, g).position.set(x, y + .5 * s, z);
  mesh(new THREE.CircleGeometry(.6 * s, 20).rotateX(-Math.PI / 2), mats.pitch, g).position.set(x, y + 1.15 * s, z);
  for (const side of [-1, 1]) C(g, .04 * s, .04 * s, .3 * s, x + side * .7 * s, y + 1.1 * s, z, M.iron, 6).rotation.z = Math.PI / 2;  // lugs
  return [x, y + 1.35 * s, z, s];
}
function potStack(g, x, y, z, n) {
  const sg = new THREE.SphereGeometry(.25, 10, 7);
  const spots = [[0, 0, 0], [.48, 0, .1], [.22, 0, .44], [-.24, 0, .36], [.24, .4, .2], [.6, 0, .55]];
  for (let i = 0; i < n; i++) { const [dx, dy, dz] = spots[i]; const m = mesh(sg, mats.clay, g); m.position.set(x + dx, y + .22 + dy, z + dz); m.scale.y = .9; }
}
function barrels(g, x, y, z, n) {
  for (let i = 0; i < n; i++) { const bx = x + i * .7; C(g, .3, .3, .75, bx, y + .37, z, mats.plank, 10); for (const yy of [.12, .62]) C(g, .32, .32, .06, bx, y + yy, z, M.iron, 10); C(g, .27, .27, .02, bx, y + .76, z, mats.pitch, 10); }
}
function cauldronBody(level) {
  const g = new THREE.Group(), seg = 12;
  const breastwork = (r, y, n) => {
    for (let i = 0; i < n; i++) {
      const a = i * Math.PI * 2 / n, b = a + Math.PI / n, w = 2 * r * Math.sin(Math.PI / n) + .05;
      B(g, w, .5, .1, Math.sin(b) * r, y + .3, Math.cos(b) * r, mats.plank, b);
      B(g, .16, .9, .16, Math.sin(a) * (r + .05), y + .45, Math.cos(a) * (r + .05), M.timber, a);
      B(g, w + .05, .1, .16, Math.sin(b) * (r + .03), y + .9, Math.cos(b) * (r + .03), M.timber, b);
    }
  };
  if (level === 0) {
    C(g, 2.95, 3.25, 1.1, 0, .35, 0, M.base, seg);
    C(g, 2.65, 2.85, 2.9, 0, 2.35, 0, M.stone, seg);
    C(g, 3.0, 3.0, .3, 0, 3.9, 0, M.trim, seg);
    C(g, 2.75, 2.75, .18, 0, 4.05, 0, mats.plank, seg);
    slits(g, 2.7, 2.4, .8, .2, [0, 1, 3]); door(g, -2.78, .95, 1.6, .9);
    breastwork(2.62, 4.1, 12);
    const c = cauldron(g, 1.55, 4.14, -1.35, .62);
    potStack(g, -1.55, 4.14, -1.45, 3);
    return { g, turretY: 4.14, height: 7.5, mangonel: .95, fire: c };
  }
  if (level === 1) {
    C(g, 3.1, 3.45, 1.3, 0, .4, 0, M.base, seg);
    C(g, 2.8, 3.05, 4.4, 0, 3.1, 0, M.stone, seg);
    C(g, 3.1, 3.1, .25, 0, 3.0, 0, M.trim, seg);
    slits(g, 2.88, 2.1, .8, .2, [0, 1, 3]); slits(g, 2.85, 4.2, .9, .2, [1, 2, 3]); door(g, -2.98, 1.0, 1.8, 1.05);
    corbels(g, 16, 2.95, 5.45);
    C(g, 3.25, 3.25, .3, 0, 5.85, 0, M.trim, seg);
    C(g, 2.85, 2.85, .2, 0, 5.95, 0, mats.plank, seg);
    ringWall(g, 3.2, 2.75, .65, 6.0, M.stone, seg);
    merlons(g, 9, 2.97, 7.0, .95, .7, .5, M.trim, .5);
    const c = cauldron(g, 1.6, 6.05, -1.45, .72);
    potStack(g, -1.65, 6.05, -1.4, 5); barrels(g, -.5, 6.05, -2.25, 2);
    banner(g, 0, 5.0, 3.03, 1.1, 2.6, 0);
    return { g, turretY: 6.05, height: 10, mangonel: 1.12, fire: c };
  }
  C(g, 3.3, 3.7, 2.0, 0, .75, 0, M.base, seg);
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + Math.PI / 6; B(g, .95, 2.4, 1.05, Math.sin(a) * 3.3, .95, Math.cos(a) * 3.3, M.base, a); }
  C(g, 3.4, 3.4, .28, 0, 1.85, 0, M.trim, seg);
  C(g, 3.0, 3.2, 5.4, 0, 4.6, 0, M.stone, seg);
  C(g, 3.25, 3.25, .25, 0, 4.4, 0, M.trim, seg);
  slits(g, 3.08, 3.1, .9, .2, [0, 1, 3]); slits(g, 3.02, 5.9, 1.0, .22, [0, 1, 2, 3]); door(g, -3.5, 1.0, 1.4, .3);
  corbels(g, 18, 3.1, 7.45, M.trim, 1.05);
  C(g, 3.5, 3.5, .3, 0, 7.9, 0, M.trim, seg);
  C(g, 3.05, 3.05, .2, 0, 8.0, 0, mats.plank, seg);
  ringWall(g, 3.45, 2.95, .8, 8.05, M.stone, seg);
  merlons(g, 11, 3.2, 9.25, .95, .8, .55, M.trim);
  // smoke-blackened stair turret at the back
  C(g, .9, .9, 3.0, 0, 9.45, -3.3, M.stone, 16); corbels(g, 6, .85, 7.7, M.trim, .7);
  C(g, 1.0, 1.0, .2, 0, 10.95, -3.3, M.trim, 16); tiledCone(0, 11.05, -3.3, 1.35, 2.4, g);
  const c = cauldron(g, 1.7, 8.1, -1.25, .85);
  potStack(g, -1.75, 8.1, -1.25, 6); barrels(g, -2.1, 8.1, .9, 1); barrels(g, 1.9, 8.1, 1.1, 1);
  pennant(g, 2.35, 8.6, -2.25, 2.8); pennant(g, -2.35, 8.6, -2.25, 2.8);
  banner(g, 0, 6.9, 3.22, 1.3, 3.2, 0); banner(g, 3.22, 6.9, 0, 1.3, 3.2, Math.PI / 2);
  return { g, turretY: 8.1, height: 13.5, mangonel: 1.3, fire: c };
}
// ---- trebuchet: a counterweight engine on a stone bastion. The arm pivots on the axle; the counterweight hangs
// from a hinge on the short end and is kept plumb each frame; the boulder rides in the sling at the long end. ----
export const TREBUCHET = { rest: -2.55, thrown: .6, pivot: 4.6, long: 5.2, short: 1.5 };
let boulderGeo;
export function boulderGeometry() {
  if (boulderGeo) return boulderGeo;
  boulderGeo = new THREE.IcosahedronGeometry(.55, 1); const p = boulderGeo.attributes.position;
  for (let i = 0; i < p.count; i++) { const f = .82 + .3 * Math.abs(Math.sin(p.getX(i) * 7.1 + p.getY(i) * 3.3) * Math.cos(p.getZ(i) * 5.7)); p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * .9, p.getZ(i) * f); }
  boulderGeo.computeVertexNormals(); return boulderGeo;
}
function trebuchet(scale) {
  const { pivot, long, short } = TREBUCHET, t = new THREE.Group();
  C(t, 2.7, 2.8, .18, 0, .09, 0, mats.plank, 20);                                   // turntable
  for (const x of [-1.0, 1.0]) {
    beam([x, .2, -2.4], [x, .2, 2.4], .3, mats.plank, t);                             // sills
    beam([x, .2, -2.2], [x, pivot, 0], .26, mats.plank, t);                            // A-frame legs up to the axle
    beam([x, .2, 2.2], [x, pivot, 0], .26, mats.plank, t);
    beam([x, 1.9, -1.4], [x, 1.9, 1.4], .2, mats.plank, t);                            // tie beam
    B(t, .36, .4, .4, x, pivot, 0, M.iron);                                          // axle bearing
    for (const z of [-2.2, 2.2]) B(t, .4, .12, .4, x, .38, z, M.iron);
  }
  for (const z of [-2.4, 2.4]) beam([-1.15, .2, z], [1.15, .2, z], .28, mats.plank, t);
  beam([-1.0, .2, -2.2], [1.0, 1.9, -1.4], .14, mats.plank, t); beam([1.0, .2, -2.2], [-1.0, 1.9, -1.4], .14, mats.plank, t);   // cross bracing
  C(t, .13, .13, 2.5, 0, pivot, 0, M.iron, 8).rotation.z = Math.PI / 2;             // axle
  // windlass at the back that hauls the arm down
  C(t, .1, .1, 1.7, 0, .75, -1.9, M.iron, 6).rotation.z = Math.PI / 2;
  for (const x of [-.7, .7]) { const w = C(t, .55, .55, .1, x, .75, -1.9, mats.plank, 12); w.rotation.z = Math.PI / 2; for (let k = 0; k < 4; k++) { const sp = B(t, .08, 1.3, .08, x, .75, -1.9, mats.plank); sp.rotation.x = k * Math.PI / 4; } }
  const turret = bake(t, false);
  // throwing arm: long end along +y from the axle, short end along -y
  const armG = new THREE.Group();
  B(armG, .3, long + short, .34, 0, (long - short) / 2, 0, mats.plank);
  for (const y of [-short + .2, -.4, .5, 1.8, 3.2]) B(armG, .36, .1, .4, 0, y, 0, M.iron);
  beam([0, long - .1, 0], [0, long + .5, .35], .07, mats.rope, armG);                 // sling cord
  C(armG, .34, .25, .18, 0, long + .55, .38, mats.leather, 10);                     // pouch
  const arm = new THREE.Group(); arm.position.set(0, pivot, 0); arm.add(bake(armG, false)); arm.name = 'tarm';
  const cw = new THREE.Group(); cw.position.set(0, -short, 0); cw.name = 'cw';
  const cwG = new THREE.Group();
  for (const x of [-.55, .55]) beam([x, 0, 0], [x * 1.25, -.75, 0], .1, M.iron, cwG);
  B(cwG, 1.45, 1.25, 1.35, 0, -1.35, 0, mats.plank);
  for (const y of [-.85, -1.85]) B(cwG, 1.5, .1, 1.4, 0, y, 0, M.iron);
  for (let k = 0; k < 7; k++) { const st = mesh(boulderGeometry(), mats.rock, cwG); st.position.set(-.4 + (k % 3) * .4, -.66, -.35 + Math.floor(k / 3) * .35); st.scale.setScalar(.36); }
  cw.add(bake(cwG, false)); arm.add(cw);
  const stone = mesh(boulderGeometry(), mats.rock, arm); stone.position.set(0, long + .62, .38); stone.scale.setScalar(.85); stone.name = 'stone'; stone.castShadow = false;
  arm.rotation.x = TREBUCHET.rest; cw.rotation.x = -TREBUCHET.rest; turret.add(arm);
  // release point: the sling end as the arm passes ~12° past vertical
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, pivot + (long + .6) * Math.cos(.2), (long + .6) * Math.sin(.2)); muzzle.name = 'muzzle'; turret.add(muzzle);
  turret.scale.setScalar(scale);
  return turret;
}
function boulderPile(g, x, y, z, n) {
  const spots = [[0, 0, 0], [.75, 0, .15], [.35, 0, .7], [-.4, 0, .55], [.35, .55, .3], [-.75, 0, -.1], [.9, 0, -.6]];
  for (let i = 0; i < n; i++) { const [dx, dy, dz] = spots[i]; const m = mesh(boulderGeometry(), mats.rock, g); m.position.set(x + dx, y + .4 + dy, z + dz); m.rotation.set(i, i * 2, 0); m.scale.setScalar(.72); }
}
function trebuchetBody(level) {
  const g = new THREE.Group(), seg = 14;
  const rear = (r, y, from, to, n) => { for (let i = 0; i <= n; i++) { const a = from + (to - from) * i / n; B(g, .9, .8, .6, Math.sin(a) * r, y + .4, Math.cos(a) * r, M.trim, a); } };
  if (level === 0) {
    C(g, 3.5, 3.85, 1.2, 0, .4, 0, M.base, seg);
    C(g, 3.3, 3.45, 1.1, 0, 1.2, 0, M.stone, seg);
    C(g, 3.5, 3.5, .2, 0, 1.75, 0, mats.plank, seg);
    boulderPile(g, -2.3, 1.85, -1.4, 4);
    for (const x of [-2.6, 2.6]) beam([x, 1.85, -1.8], [x, 3.3, -1.8], .16, M.timber, g);
    return { g, turretY: 1.85, height: 11, trebuchet: 1.0 };
  }
  if (level === 1) {
    C(g, 3.6, 4.0, 1.4, 0, .5, 0, M.base, seg);
    C(g, 3.35, 3.55, 2.2, 0, 2.1, 0, M.stone, seg);
    C(g, 3.65, 3.65, .26, 0, 3.0, 0, M.trim, seg);
    C(g, 3.4, 3.4, .2, 0, 3.15, 0, mats.plank, seg);
    slits(g, 3.4, 1.8, .7, .2, [1, 2, 3]); door(g, -3.5, .95, 1.6, .7);
    rear(3.35, 3.2, Math.PI * .62, Math.PI * 1.38, 6);
    boulderPile(g, -2.2, 3.25, -1.7, 6); barrels(g, 1.7, 3.25, -2.1, 1);
    banner(g, 0, 2.1, 3.58, 1.1, 2.0, 0);
    return { g, turretY: 3.25, height: 13.5, trebuchet: 1.08 };
  }
  C(g, 3.8, 4.25, 2.0, 0, .75, 0, M.base, seg);
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + Math.PI / 6; B(g, 1, 2.6, 1.1, Math.sin(a) * 3.8, 1.0, Math.cos(a) * 3.8, M.base, a); }
  C(g, 3.5, 3.7, 3.0, 0, 3.0, 0, M.stone, seg);
  C(g, 3.75, 3.75, .25, 0, 2.0, 0, M.trim, seg);
  corbels(g, 18, 3.55, 4.25, M.trim, 1.05);
  C(g, 3.95, 3.95, .3, 0, 4.6, 0, M.trim, seg);
  C(g, 3.6, 3.6, .2, 0, 4.7, 0, mats.plank, seg);
  slits(g, 3.55, 2.8, .9, .22, [1, 2, 3]); door(g, -4.0, 1.0, 1.4, .3);
  rear(3.65, 4.75, Math.PI * .55, Math.PI * 1.45, 8);
  boulderPile(g, -2.4, 4.8, -1.6, 7); barrels(g, 1.6, 4.8, -2.3, 2);
  pennant(g, 3.0, 5.2, -2.0, 2.8); pennant(g, -3.0, 5.2, -2.0, 2.8);
  banner(g, 0, 3.2, 3.75, 1.3, 2.6, 0); banner(g, 3.75, 3.2, 0, 1.3, 2.6, Math.PI / 2); banner(g, -3.75, 3.2, 0, 1.3, 2.6, -Math.PI / 2);
  return { g, turretY: 4.8, height: 16, trebuchet: 1.16 };
}
const bodies = { archer: archerBody, cannon: cannonBody, mage: mageBody, ballista: ballistaBody, cauldron: cauldronBody, trebuchet: trebuchetBody };

// Template: baked body + unbaked weapon template. instantiate() clones it for a tower.
const templates = new Map();
export function towerTemplate(type, level) {
  const key = type + level;
  if (templates.has(key)) return templates.get(key);
  const spec = bodies[type](level);
  const t = { body: bake(spec.g), spec };
  const bb = new THREE.Box3().setFromObject(t.body); spec.hw = Math.min(3.6, Math.max(-bb.min.x, bb.max.x, -bb.min.z, bb.max.z) - .3);
  templates.set(key, t); return t;
}
export function instantiate(type, level, isGhost = false) {
  const { body, spec } = towerTemplate(type, level);
  const root = new THREE.Group(); root.add(body.clone());
  const parts = { root, height: spec.height, turretY: spec.turretY, hw: spec.hw };
  if (spec.archers && !isGhost) parts.archers = spec.archers.map(([x, z]) => { const f = archerFigure(); f.root.position.set(x, spec.turretY, z); f.root.scale.setScalar(1.15); root.add(f.root); poseArcher(f, 0); return f; });
  if (spec.cannon) { const t = cannon(...spec.cannon); t.position.y = spec.turretY; root.add(t); parts.turret = t; parts.pitch = t.getObjectByName('pitch'); parts.barrel = t.getObjectByName('barrel'); parts.muzzle = t.getObjectByName('muzzle'); }
  if (spec.ballista) { const t = ballista(spec.ballista); t.position.y = spec.turretY; root.add(t); parts.turret = t; parts.muzzle = t.getObjectByName('muzzle'); poseBallista(t, 1, true); }
  if (spec.mangonel) { const t = mangonel(spec.mangonel); t.position.y = spec.turretY; root.add(t); parts.turret = t; parts.arm = t.getObjectByName('arm'); parts.pot = t.getObjectByName('pot'); parts.muzzle = t.getObjectByName('muzzle'); }
  if (spec.trebuchet) { const t = trebuchet(spec.trebuchet); t.position.y = spec.turretY; root.add(t); parts.turret = t; parts.tarm = t.getObjectByName('tarm'); parts.cw = t.getObjectByName('cw'); parts.stone = t.getObjectByName('stone'); parts.muzzle = t.getObjectByName('muzzle'); }
  if (spec.fire && !isGhost) {
    const [x, y, z, s] = spec.fire, glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ff7a2a', transparent: true, opacity: .5, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.position.set(x, y, z); glow.scale.setScalar(s * 3.4); glow.userData.size = s * 3.4; root.add(glow); parts.fire = glow;
  }
  if (spec.crystal) { const c = crystalGroup(...spec.crystal); c.position.y = spec.turretY; root.add(c); parts.crystal = c; parts.muzzle = c; parts.crystalSize = spec.crystal[0]; }
  return parts;
}
// Translucent single-material version for the build preview.
export const ghostMaterial = new THREE.MeshStandardMaterial({ color: '#e8f0ff', emissive: '#7fa6d8', emissiveIntensity: .35, transparent: true, opacity: .42, depthWrite: false, roughness: .6 });
export function ghost(type, level) {
  const p = instantiate(type, level, true);
  p.root.traverse(o => { if (o.isMesh || o.isSprite) { o.castShadow = false; if (o.isMesh) o.material = ghostMaterial; else o.visible = false; } });
  return p;
}

// Timber scaffold wrapped around a footprint of half-width hw, height h.
const scaffolds = new Map();
export function scaffold(hw, h) {
  const key = hw.toFixed(1) + h.toFixed(0);
  if (!scaffolds.has(key)) {
    const g = new THREE.Group(), r = hw + .45;
    for (const x of [-r, r]) for (const z of [-r, r]) B(g, .16, h, .16, x, h / 2, z, mats.plank);
    for (let y = 1.8; y < h; y += 2.2) for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2, s = Math.sin(a), c = Math.cos(a);
      B(g, 2 * r + .3, .12, .12, s * r, y, c * r, mats.plank, a);
      B(g, 2 * r, .06, .5, s * (r - .2), y + .08, c * (r - .2), mats.plank, a);
      const k = (Math.round(y / 2.2) + i) % 2 ? 1 : -1;
      beam([s * r + c * r * k, y - 2.1, c * r - s * r * k], [s * r - c * r * k, y, c * r + s * r * k], .09, mats.plank, g);
    }
    scaffolds.set(key, bake(g, false));
  }
  return scaffolds.get(key).clone();
}

// Worked stone foundation for a build pad; all pads baked into one group.
export function padGeometry(list) {
  const g = new THREE.Group(), R = 4.05, ap = R * Math.cos(Math.PI / 8), edge = 2 * R * Math.sin(Math.PI / 8);
  for (const p of list) {
    const { x, z } = p.pos, top = p.pos.y, low = p.low - .8, rot = p.yaw - Math.PI / 8;
    const f = C(g, R + .05, R + .3, top - low, x, (top + low) / 2 - .05, z, M.base, 8); f.rotation.y = rot;
    const paving = mesh(new THREE.CircleGeometry(R - .2, 8).rotateX(-Math.PI / 2), M.trim, g); paving.position.set(x, top, z); paving.rotation.y = rot;
    const uv = paving.geometry.attributes.uv, pp = paving.geometry.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pp.getX(i) / 3.5, pp.getZ(i) / 3.5);
    for (let i = 0; i < 8; i++) {
      const a = p.yaw + i * Math.PI / 4, v = a + Math.PI / 8;
      B(g, edge + .02, .3, .5, x + Math.sin(a) * (ap - .2), top + .1, z + Math.cos(a) * (ap - .2), M.trim, a);
      B(g, .62, .42, .62, x + Math.sin(v) * (R - .25), top + .16, z + Math.cos(v) * (R - .25), M.trim, v);
    }
    // steps down to the ground on the side facing the road
    const s = -Math.sin(p.yaw), c = -Math.cos(p.yaw), bottom = p.ground - .4;
    for (let k = 0; k < 3; k++) {
      const t = top - .08 - (k + 1) * .3, d = ap + .15 + k * .5;
      if (t < p.ground - .15) break;
      B(g, 2.3 - k * .2, t - bottom, .5, x + s * d, (t + bottom) / 2, z + c * d, M.trim, p.yaw);
    }
  }
  return bake(g);
}

// Faint rune ring shown on pads (brightens on hover/select).
let runeTex;
export function runeTexture() {
  if (runeTex) return runeTex;
  const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d');
  const band = x.createRadialGradient(256, 256, 170, 256, 256, 252);
  band.addColorStop(0, '#ffffff00'); band.addColorStop(.55, '#ffffff38'); band.addColorStop(1, '#ffffff00');
  x.fillStyle = band; x.fillRect(0, 0, 512, 512);
  x.translate(256, 256); x.strokeStyle = '#fff'; x.lineCap = 'round';
  x.lineWidth = 3; x.beginPath(); x.arc(0, 0, 236, 0, 7); x.stroke();
  x.lineWidth = 2; x.beginPath(); x.arc(0, 0, 196, 0, 7); x.stroke();
  let seed = 7; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  x.lineWidth = 4;
  for (let i = 0; i < 24; i++) {
    x.save(); x.rotate(i * Math.PI * 2 / 24); x.translate(0, -216);
    x.beginPath(); x.moveTo(0, -12); x.lineTo(0, 12);
    for (let k = 0; k < 2; k++) { const y0 = -10 + r() * 20, s = r() > .5 ? 1 : -1; x.moveTo(0, y0); x.lineTo(s * 8, y0 + (r() - .5) * 14); }
    x.stroke(); x.restore();
  }
  runeTex = new THREE.CanvasTexture(c); runeTex.colorSpace = THREE.SRGBColorSpace; return runeTex;
}

// ---- projectile geometry ----
export function projectileGeometries() {
  const arrow = mergeGeometries([
    new THREE.CylinderGeometry(.025, .025, 1.0, 4).rotateX(Math.PI / 2),
    new THREE.ConeGeometry(.06, .18, 4).rotateX(Math.PI / 2).translate(0, 0, .55),
    new THREE.BoxGeometry(.01, .12, .22).translate(0, 0, -.4), new THREE.BoxGeometry(.12, .01, .22).translate(0, 0, -.4),
  ].map(g => g.toNonIndexed()));
  const bolt = mergeGeometries([
    new THREE.CylinderGeometry(.06, .06, 2.2, 6).rotateX(Math.PI / 2),
    new THREE.ConeGeometry(.12, .42, 6).rotateX(Math.PI / 2).translate(0, 0, 1.3),
    new THREE.BoxGeometry(.02, .26, .45).translate(0, 0, -.9), new THREE.BoxGeometry(.26, .02, .45).translate(0, 0, -.9),
  ].map(g => g.toNonIndexed()));
  const pot = mergeGeometries([new THREE.SphereGeometry(.28, 10, 7).scale(1, .9, 1), new THREE.CylinderGeometry(.1, .14, .16, 8).translate(0, .28, 0)].map(g => g.toNonIndexed()).map(g => { g.deleteAttribute('uv'); return g; }));
  return { arrow, bolt, ball: new THREE.SphereGeometry(.3, 12, 8), orb: new THREE.PlaneGeometry(1, 1), pot, boulder: boulderGeometry() };
}
