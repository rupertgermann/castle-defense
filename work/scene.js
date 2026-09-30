import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { Water } from 'three/addons/objects/Water.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = .88;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
renderer.domElement.setAttribute('aria-label', 'Interactive aerial view of a medieval castle. Drag to rotate, scroll or pinch to zoom. Arrow keys rotate, plus and minus zoom.');
renderer.domElement.setAttribute('role', 'img');
renderer.domElement.tabIndex = 0;

const camera = new THREE.PerspectiveCamera(39, innerWidth / innerHeight, .7, 1300);
const initialPosition = new THREE.Vector3(-94, 88, 137);
camera.position.copy(initialPosition);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(7, 17, 7);
controls.enableDamping = true;
controls.dampingFactor = .075;
controls.minDistance = 44;
controls.maxDistance = 285;
controls.maxPolarAngle = Math.PI * .455;
controls.minPolarAngle = .12;
controls.enablePan = false;
controls.zoomSpeed = .65;
controls.rotateSpeed = .52;
controls.update();

let seed = 24321;
const rand = () => { seed = Math.imul(1664525, seed) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
const between = (a, b) => a + rand() * (b - a);
const clamp = THREE.MathUtils.clamp;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const hash = (x, y) => { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); };
function noise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix, iy), hash(ix + 1, iy), sx), THREE.MathUtils.lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), sx), sy);
}
function fbm(x, y) { return noise(x, y) * .56 + noise(x * 2.04, y * 2.04) * .27 + noise(x * 4.13, y * 4.13) * .12 + noise(x * 8.17, y * 8.17) * .05; }
const riverX = z => 65 + 15 * Math.sin(z * .018) + 9 * Math.sin(z * .035 + 1);
const riverWidth = z => 15 + 3 * Math.sin(z * .023);
const roadX = z => z < 36 ? 2 : 2 + 12 * Math.sin((z - 36) * .023);
function height(x, z) {
  const r = Math.sqrt((x / 1.05) ** 2 + z * z);
  const distantRidge = smooth(185, 360, r) * (25 + 48 * fbm(x * .012 + 11, z * .012 + 40)) * smooth(20, 95, Math.abs(x - riverX(z)));
  const h = 2 + fbm(x * .017 + 30, z * .017 + 15) * 9 + 2 * noise(x * .07, z * .07) + distantRidge;
  const hill = THREE.MathUtils.lerp(h, 14, 1 - smooth(32, 60, r));
  const d = Math.abs(x - riverX(z));
  return THREE.MathUtils.lerp(-2.2 + noise(x * .08, z * .08), hill, smooth(riverWidth(z) - 3, riverWidth(z) + 8, d));
}

function canvasTexture(size, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function masonryMaps() {
  const stone = document.createElement('canvas'), bump = document.createElement('canvas');
  stone.width = stone.height = bump.width = bump.height = 1024;
  const c = stone.getContext('2d'), b = bump.getContext('2d');
  c.fillStyle = '#827b68'; c.fillRect(0, 0, 1024, 1024);
  b.fillStyle = '#505050'; b.fillRect(0, 0, 1024, 1024);
  for (let row = 0; row < 14; row++) {
    const y = row * 1024 / 14, rh = 1024 / 14;
    let x = row % 2 ? -90 : -8;
    while (x < 1024) {
      const w = between(87, 181), g = between(2.5, 4.5), tone = between(-17, 17);
      c.fillStyle = `rgb(${165 + tone},${158 + tone},${139 + tone})`;
      c.beginPath(); c.roundRect(x + g, y + g, w - g * 2, rh - g * 2, between(3, 8)); c.fill();
      const gradient = c.createLinearGradient(x, y, x + w, y + rh);
      gradient.addColorStop(0, '#fff5cf20'); gradient.addColorStop(.5, '#82745800'); gradient.addColorStop(1, '#34342632');
      c.fillStyle = gradient; c.fill();
      b.fillStyle = `rgb(${185 + tone},${185 + tone},${185 + tone})`;
      b.beginPath(); b.roundRect(x + g + 2, y + g + 2, w - g * 2 - 4, rh - g * 2 - 4, 5); b.fill();
      for (let k = 0; k < 7; k++) {
        c.fillStyle = rand() > .5 ? '#edf0cc11' : '#393c2310';
        c.beginPath(); c.ellipse(x + rand() * w, y + rand() * rh, between(3, 20), between(1, 8), rand() * 3, 0, 6.283); c.fill();
      }
      x += w;
    }
  }
  const pixels = c.getImageData(0, 0, 1024, 1024), bp = b.getImageData(0, 0, 1024, 1024);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const grain = between(-10, 10);
    for (let j = 0; j < 3; j++) { pixels.data[i + j] += grain; bp.data[i + j] += grain * 1.7; }
  }
  c.putImageData(pixels, 0, 0); b.putImageData(bp, 0, 0);
  const map = new THREE.CanvasTexture(stone), bumpMap = new THREE.CanvasTexture(bump);
  for (const t of [map, bumpMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
  map.colorSpace = THREE.SRGBColorSpace;
  return { map, bumpMap };
}
const stoneMaps = masonryMaps();
const materials = {
  stone: new THREE.MeshStandardMaterial({ ...stoneMaps, roughness: .91, bumpScale: .16, color: '#d4cfbd' }),
  base: new THREE.MeshStandardMaterial({ ...stoneMaps, roughness: 1, bumpScale: .2, color: '#92957c' }),
  trim: new THREE.MeshStandardMaterial({ ...stoneMaps, roughness: .88, bumpScale: .1, color: '#e0d9c0' }),
  roof: new THREE.MeshStandardMaterial({ color: '#616d70', roughness: .79, metalness: .13, vertexColors: true }),
  timber: new THREE.MeshStandardMaterial({ color: '#40392c', roughness: .94 }),
  plaster: new THREE.MeshStandardMaterial({ color: '#c6b991', roughness: 1 }),
  iron: new THREE.MeshStandardMaterial({ color: '#292c27', metalness: .6, roughness: .7 }),
  dark: new THREE.MeshStandardMaterial({ color: '#181b18', roughness: 1 }),
  glass: new THREE.MeshStandardMaterial({ color: '#534c2d', roughness: .3, metalness: .12, emissive: '#8a5725', emissiveIntensity: .1 }),
};
const unitBox = new RoundedBoxGeometry(1, 1, 1, 1, .055);
const temp = new THREE.Object3D(), batches = new Map();
export function instance(geometry, material, x, y, z, sx = 1, sy = 1, sz = 1, ry = 0, color = null, rx = 0, rz = 0) {
  const key = geometry.uuid + material.uuid;
  if (!batches.has(key)) batches.set(key, { geometry, material, transforms: [], colors: [] });
  const batch = batches.get(key);
  temp.position.set(x, y, z); temp.rotation.set(rx, ry, rz); temp.scale.set(sx, sy, sz); temp.updateMatrix();
  batch.transforms.push(temp.matrix.clone()); batch.colors.push(color);
  return { batch, index: batch.transforms.length - 1 };
}
function finishInstances() {
  for (const b of batches.values()) {
    const m = new THREE.InstancedMesh(b.geometry, b.material, b.transforms.length);
    b.transforms.forEach((t, i) => { m.setMatrixAt(i, t); if (b.colors[i]) m.setColorAt(i, b.colors[i]); });
    m.castShadow = m.receiveShadow = true; m.computeBoundingSphere(); scene.add(m); b.mesh = m;
  }
}
function worldUV(g, scale = 6) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  if (!uv) return g;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (ay > ax && ay > az) uv.setXY(i, p.getX(i) / scale, p.getZ(i) / scale);
    else if (ax > az) uv.setXY(i, p.getZ(i) / scale, p.getY(i) / scale);
    else uv.setXY(i, p.getX(i) / scale, p.getY(i) / scale);
  }
  return g;
}
function mesh(g, m, parent = scene) {
  const o = new THREE.Mesh(g, m); o.castShadow = o.receiveShadow = true; parent.add(o); return o;
}
function box(w, h, d, x, y, z, mat = materials.stone, parent = scene) {
  const m = mesh(worldUV(new THREE.BoxGeometry(w, h, d)), mat, parent); m.position.set(x, y, z); return m;
}
function cylinder(rt, rb, h, x, y, z, mat = materials.stone, segments = 48, parent = scene) {
  const g = new THREE.CylinderGeometry(rt, rb, h, segments);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.PI * (rt + rb) / 6, uv.getY(i) * h / 6);
  const o = mesh(g, mat, parent); o.position.set(x, y, z); return o;
}
function beam(a, b, width, mat = materials.timber, parent = scene) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), delta = vb.clone().sub(va);
  const o = box(width, delta.length(), width, 0, 0, 0, mat, parent);
  o.position.copy(va.add(vb).multiplyScalar(.5)); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()); return o;
}

const terrainGeometry = new THREE.PlaneGeometry(900, 900, 420, 420);
terrainGeometry.rotateX(-Math.PI / 2);
const terrainPosition = terrainGeometry.attributes.position, terrainColors = [];
const grassLow = new THREE.Color('#354f34'), grassHigh = new THREE.Color('#798951'), dirt = new THREE.Color('#9c8763'), rockColor = new THREE.Color('#77786a');
for (let i = 0; i < terrainPosition.count; i++) {
  const x = terrainPosition.getX(i), z = terrainPosition.getZ(i), y = height(x, z);
  terrainPosition.setY(i, y);
  const c = grassLow.clone().lerp(grassHigh, fbm(x * .044, z * .044));
  const path = (1 - smooth(2.2, 4.6, Math.abs(x - roadX(z)))) * smooth(25, 39, z);
  c.lerp(dirt, path * .92);
  c.lerp(rockColor, (1 - smooth(2, 6, Math.abs(y - 1.3))) * .65);
  const r = Math.hypot(x, z);
  c.multiplyScalar(.90 + .18 * noise(x * .9, z * .9));
  if (r < 35) c.lerp(dirt, .45);
  terrainColors.push(c.r, c.g, c.b);
}
terrainGeometry.setAttribute('color', new THREE.Float32BufferAttribute(terrainColors, 3));
terrainGeometry.computeVertexNormals();
const groundBump = canvasTexture(256, (c, s) => {
  const a = c.createImageData(s, s);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const i = (y * s + x) * 4, v = 100 + rand() * 70 + noise(x * .16, y * .16) * 70;
    a.data[i] = a.data[i + 1] = a.data[i + 2] = v; a.data[i + 3] = 255;
  }
  c.putImageData(a, 0, 0);
}, false);
groundBump.repeat.set(220, 220);
const terrain = mesh(terrainGeometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, bumpMap: groundBump, bumpScale: .25 }));
terrain.castShadow = false;

scene.fog = new THREE.FogExp2('#c8c8b9', .00135);
const sky = mesh(new THREE.SphereGeometry(950, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false,
  uniforms: { sunDirection: { value: new THREE.Vector3(-.65, .26, -.48).normalize() } },
  vertexShader: 'varying vec3 vDirection; void main(){vDirection=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: `varying vec3 vDirection; uniform vec3 sunDirection;
    void main(){vec3 d=normalize(vDirection); float h=max(d.y,0.); vec3 col=mix(vec3(.78,.76,.64),vec3(.32,.48,.57),pow(h,.42)); float a=max(dot(d,sunDirection),0.); col+=vec3(.42,.24,.07)*pow(a,9.)+vec3(1.8,1.35,.7)*pow(a,1800.); gl_FragColor=vec4(col,1.);}`
}));
sky.castShadow = sky.receiveShadow = false;
const hemi = new THREE.HemisphereLight('#c5d7e1', '#53553c', 1.25); scene.add(hemi);
const sun = new THREE.DirectionalLight('#ffdaa1', 3.6);
sun.position.set(-105, 55, -78); sun.target.position.set(0, 8, 0);
sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -95, right: 95, top: 110, bottom: -85, near: 1, far: 320 });
sun.shadow.bias = -.00018; sun.shadow.normalBias = .065; sun.shadow.radius = 3;
scene.add(sun, sun.target);
const bounce = new THREE.DirectionalLight('#9cbacb', .35); bounce.position.set(65, 40, 80); scene.add(bounce);

const envScene = new THREE.Scene();
envScene.add(new THREE.Mesh(sky.geometry, sky.material));
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(envScene, .04, .1, 1200).texture;
scene.environmentIntensity = .28; pmrem.dispose();

// All architectural openings use holes in the wall mesh, with their reveals exposed.
function archPath(path, x, y, w, h) {
  const r = w / 2, shoulder = y + h - r;
  path.moveTo(x - r, y); path.lineTo(x + r, y); path.lineTo(x + r, shoulder);
  path.absarc(x, shoulder, r, 0, Math.PI, false); path.lineTo(x - r, y);
  return path;
}
function facade(w, h, thick, openings, parent, mat = materials.stone) {
  const shape = new THREE.Shape(); shape.moveTo(-w / 2, 0); shape.lineTo(-w / 2, h); shape.lineTo(w / 2, h); shape.lineTo(w / 2, 0);
  const entrance = openings.find(o => o.open && o.y <= 0);
  if (entrance) {
    const r = entrance.w / 2, shoulder = entrance.y + entrance.h - r;
    shape.lineTo(entrance.x + r, 0); shape.lineTo(entrance.x + r, shoulder);
    shape.absarc(entrance.x, shoulder, r, 0, Math.PI, false); shape.lineTo(entrance.x - r, 0);
  }
  shape.closePath();
  for (const o of openings) if (o !== entrance) shape.holes.push(archPath(new THREE.Path(), o.x, o.y, o.w, o.h));
  const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 12 });
  g.translate(0, 0, -thick);
  const wall = mesh(worldUV(g), mat, parent);
  for (const o of openings) {
    if (!o.open) {
      const back = mesh(new THREE.ShapeGeometry(archPath(new THREE.Shape(), o.x, o.y, o.w, o.h)), o.glass ? materials.glass : materials.dark, parent);
      back.position.z = -thick + .035;
    }
    const radius = o.w / 2 + .22, cy = o.y + o.h - o.w / 2;
    for (let a = 0; a < 9; a++) {
      const angle = (a + .5) * Math.PI / 9;
      const k = box(.35, Math.PI * radius / 9 * .91, .24, o.x + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, .025, materials.trim, parent);
      k.rotation.z = angle;
    }
    for (const s of [-1, 1]) for (let y = o.y + .25; y < cy; y += .5) box(.31, .46, .24, o.x + s * (o.w / 2 + .19), y, .025, materials.trim, parent);
    if (o.y > .2) box(o.w + .85, .18, .65, o.x, o.y - .1, .06, materials.trim, parent);
    if (o.glass) {
      box(.085, o.h - .18, .09, o.x, o.y + o.h * .5, -.06, materials.iron, parent);
      box(o.w, .08, .09, o.x, o.y + o.h * .48, -.06, materials.iron, parent);
    }
  }
  return wall;
}
function tiledCone(x, y, z, radius, h, parent = scene) {
  const p = [], colors = [], baseColor = new THREE.Color();
  const rows = Math.ceil(h / .32);
  for (let j = 0; j < rows; j++) {
    const t0 = j / rows, t1 = (j + 1) / rows;
    const r0 = radius * (1 - t0), r1 = Math.max(.025, radius * (1 - t1));
    const count = Math.max(6, Math.round(2 * Math.PI * r0 / .48));
    for (let k = 0; k < count; k++) {
      const a = (k + j % 2 * .5) * Math.PI * 2 / count, b = a + Math.PI * 2 / count * .985;
      const rt = r1 + .035, rb = r0 + .08;
      const y0 = y + t0 * h, y1 = y + t1 * h;
      const A = [x + Math.cos(a) * rb, y0, z + Math.sin(a) * rb], B = [x + Math.cos(b) * rb, y0, z + Math.sin(b) * rb];
      const C = [x + Math.cos(b) * rt, y1, z + Math.sin(b) * rt], D = [x + Math.cos(a) * rt, y1, z + Math.sin(a) * rt];
      p.push(...A, ...C, ...B, ...A, ...D, ...C);
      const light = between(.54, 1.0); baseColor.setRGB(light * .9, light * .97, light);
      for (let v = 0; v < 6; v++) colors.push(baseColor.r, baseColor.g, baseColor.b);
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); g.computeVertexNormals();
  mesh(g, materials.roof, parent);
  cylinder(.075, .11, .8, x, y + h + .27, z, materials.iron, 8, parent);
}
function pitchedRoof(w, d, h, x, y, z, parent = scene) {
  const p = [], colors = [];
  for (const side of [-1, 1]) {
    const rows = Math.ceil(Math.hypot(w / 2, h) / .43), columns = Math.ceil(d / .57);
    for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) {
      const t0 = j / rows, t1 = (j + 1) / rows;
      const xx0 = side * (w / 2 * (1 - t0) + .055), xx1 = side * (w / 2 * (1 - t1) + .022);
      const z0 = -d / 2 + i * d / columns, z1 = z0 + d / columns * .985;
      const A = [x + xx0, y + h * t0, z + z0], B = [x + xx0, y + h * t0, z + z1];
      const C = [x + xx1, y + h * t1, z + z1], D = [x + xx1, y + h * t1, z + z0];
      if (side > 0) p.push(...A, ...C, ...B, ...A, ...D, ...C); else p.push(...A, ...B, ...C, ...A, ...C, ...D);
      const v = between(.56, 1.0);
      for (let k = 0; k < 6; k++) colors.push(v * .88, v * .96, v);
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); g.computeVertexNormals(); mesh(g, materials.roof, parent);
  box(.25, .22, d + .08, x, y + h + .04, z, materials.iron, parent);
  for (const side of [-1, 1]) {
    beam([x - w / 2, y, z + side * d / 2], [x, y + h, z + side * d / 2], .2, materials.timber, parent);
    beam([x + w / 2, y, z + side * d / 2], [x, y + h, z + side * d / 2], .2, materials.timber, parent);
    const shape = new THREE.Shape(); shape.moveTo(-w / 2, 0); shape.lineTo(w / 2, 0); shape.lineTo(0, h); shape.closePath();
    const gable = mesh(worldUV(new THREE.ExtrudeGeometry(shape, { depth: .35, bevelEnabled: false })), materials.stone, parent);
    gable.position.set(x, y - .04, z + side * (d / 2 - .6));
  }
}

const BASE = 14;
const enclosure = [[-26, -21], [-3, -29], [23, -23], [31, -1], [22, 25], [4, 31], [-22, 24], [-32, 3]];
const courtyard = new THREE.Shape(); enclosure.forEach(([x, z], i) => i ? courtyard.lineTo(x, -z) : courtyard.moveTo(x, -z)); courtyard.closePath();
const court = mesh(new THREE.ShapeGeometry(courtyard), new THREE.MeshStandardMaterial({ ...stoneMaps, color: '#aaa38c', roughness: 1, bumpScale: .08 }));
court.rotation.x = -Math.PI / 2; court.position.y = BASE + .025; court.castShadow = false;
const uv = court.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 8, uv.getY(i) / 8);

function curtain(a, b, gate = false) {
  const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz), angle = -Math.atan2(dz, dx);
  const group = new THREE.Group(); group.position.set((a[0] + b[0]) / 2, BASE, (a[1] + b[1]) / 2); group.rotation.y = angle; scene.add(group);
  if (gate) facade(len, 8.7, 2.3, [{ x: 0, y: -.1, w: 4.2, h: 5.5, open: true }], group);
  else box(len, 8.7, 2.3, 0, 4.35, -.5, materials.stone, group);
  box(len, .4, 2.8, 0, 8.5, -.5, materials.trim, group);
  box(len, 1.05, .72, 0, 9.05, .65, materials.stone, group);
  const count = Math.round(len / 2.1);
  for (let i = 0; i <= count; i++) box(1.03, 1.15, .92, -len / 2 + i * len / count, 10.1, .65, materials.trim, group);
  for (let i = 1; i < count; i += 2) box(.19, 1.65, .035, -len / 2 + i * len / count, 5.9, .673, materials.dark, group);
  for (let i = 2; i < len; i += 4.3) {
    box(.48, .75, .6, i - len / 2, 7.8, .9, materials.trim, group);
    if (!gate || Math.abs(i - len / 2) > 3) box(1.25, 4, 2.8, i - len / 2, 1.6, -.2, materials.base, group);
  }
}
for (let i = 0; i < enclosure.length; i++) curtain(enclosure[i], enclosure[(i + 1) % enclosure.length], i === 5);

function tower(x, z, radius, h, roof = true) {
  const y = BASE;
  cylinder(radius + .3, radius + 1, 3.0, x, y + .85, z, materials.base);
  cylinder(radius, radius + .2, h, x, y + h / 2, z);
  cylinder(radius + .15, radius + .15, .3, x, y + h - 3.5, z, materials.trim);
  cylinder(radius + .45, radius + .12, .8, x, y + h - .5, z, materials.trim);
  for (let i = 0; i < 14; i++) {
    const a = i * Math.PI * 2 / 14;
    const corbel = box(.4, 1, .55, x + Math.cos(a) * (radius + .04), y + h - 1.3, z + Math.sin(a) * (radius + .04), materials.trim); corbel.rotation.y = -a;
  }
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI * 2 / 8;
    const window = new THREE.Group(); window.position.set(x + Math.sin(a) * (radius + .025), y, z + Math.cos(a) * (radius + .025)); window.rotation.y = a; scene.add(window);
    box(.28, 1.8, .025, 0, h * .62, 0, materials.dark, window);
    box(.6, .19, .25, 0, h * .62 - .93, .03, materials.trim, window);
    if (roof) { box(.63, 1.45, .025, 0, h - 2.2, .02, materials.dark, window); box(.11, 1.45, .11, 0, h - 2.2, .09, materials.trim, window); }
  }
  if (roof) tiledCone(x, y + h + .02, z, radius + .95, radius * 1.65);
  else {
    cylinder(radius - .1, radius - .1, .1, x, y + h - .35, z, materials.dark);
    const shape = new THREE.Shape(); shape.absarc(0, 0, radius + .38, 0, Math.PI * 2, false); const hole = new THREE.Path(); hole.absarc(0, 0, radius - .42, 0, Math.PI * 2, true); shape.holes.push(hole);
    const ring = mesh(worldUV(new THREE.ExtrudeGeometry(shape, { depth: 1.05, bevelEnabled: false })), materials.stone); ring.rotation.x = -Math.PI / 2; ring.position.set(x, y + h - .1, z);
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI * 2 / 12;
      const merlon = box(1.12, 1.25, .95, x + Math.sin(a) * radius, y + h + 1.38, z + Math.cos(a) * radius, materials.trim); merlon.rotation.y = a;
    }
  }
}
enclosure.forEach(([x, z], i) => tower(x, z, i === 0 ? 4.5 : 3.35, [14, 12, 13, 11.5, 13, 12.5, 12, 12][i], [0, 1, 2, 4].includes(i)));

function keep(x, z) {
  const group = new THREE.Group(); group.position.set(x, BASE, z); scene.add(group);
  const width = 14, depth = 15, high = 21;
  box(width + 1.1, 2, depth + 1.1, 0, .65, 0, materials.base, group);
  for (let side = 0; side < 4; side++) {
    const front = new THREE.Group(); front.rotation.y = side * Math.PI / 2;
    front.position.set(Math.sin(side * Math.PI / 2) * (side % 2 ? width / 2 : depth / 2), 0, Math.cos(side * Math.PI / 2) * (side % 2 ? width / 2 : depth / 2)); group.add(front);
    const w = side % 2 ? depth : width, openings = [];
    for (const yy of [7, 13.1, 17.5]) for (const xx of [-3.4, 0, 3.4]) openings.push({ x: xx, y: yy, w: yy === 7 ? .55 : 1.05, h: yy === 7 ? 1.6 : 2.1, glass: yy > 7 });
    if (side === 0) openings.push({ x: 0, y: .1, w: 2.1, h: 3.8 });
    facade(w, high, 1.2, openings, front);
    for (const xx of [-w / 2 + .7, w / 2 - .7]) {
      box(1.4, high - .8, 1.05, xx, (high - .8) / 2, .13, materials.trim, front);
      for (let j = 0; j < 31; j++) box(j % 2 ? 1.5 : 1.15, .32, 1.15, xx, j * .64 + .32, .16, materials.trim, front);
    }
    for (const yy of [5.4, 11.6, 16.6, high]) box(w + .3, .22, .45, 0, yy, .05, materials.trim, front);
  }
  pitchedRoof(width + 1.8, depth + 1.8, 7.2, 0, high + .15, 0, group);
  for (const xx of [-6.9, 6.9]) for (const zz of [-7.4, 7.4]) {
    cylinder(1.75, 2.05, 3, xx, 16.7, zz, materials.trim, 32, group);
    cylinder(1.85, 1.75, 8.3, xx, 21.9, zz, materials.stone, 32, group);
    cylinder(2.05, 1.85, .5, xx, 26.1, zz, materials.trim, 32, group);
    tiledCone(xx, 26.35, zz, 2.5, 5.6, group);
    for (const rot of [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2]) {
      const slit = box(.25, 1.3, .04, xx + Math.sin(rot) * 1.86, 24.8, zz + Math.cos(rot) * 1.86, materials.dark, group); slit.rotation.y = rot;
    }
  }
  box(1.35, 4.5, 1.5, 2.4, high + 6, -3.5, materials.stone, group);
  box(1.7, .32, 1.85, 2.4, high + 8.1, -3.5, materials.trim, group);
  return group;
}
keep(-10, -6);

function hall(x, z, w, d, h) {
  const group = new THREE.Group(); group.position.set(x, BASE, z); scene.add(group);
  for (const side of [-1, 1]) {
    const long = new THREE.Group(); long.rotation.y = side * Math.PI / 2; long.position.x = side * w / 2; group.add(long);
    const openings = [];
    for (let zz = -d / 2 + 3; zz < d / 2 - 1; zz += 3.5) openings.push({ x: zz, y: h * .52, w: 1.15, h: 2.8, glass: true });
    facade(d, h, .8, openings, long);
    for (let zz = -d / 2 + .6; zz < d / 2; zz += 4) {
      box(.95, h - 1, 1.2, zz, (h - 1) / 2, .28, materials.trim, long);
      box(1.25, 1.1, 1.5, zz, .55, .3, materials.base, long);
    }
  }
  for (const side of [-1, 1]) {
    const end = new THREE.Group(); end.position.z = side * d / 2; end.rotation.y = side < 0 ? Math.PI : 0; group.add(end);
    facade(w, h, .8, [{ x: 0, y: side > 0 ? .05 : 3.6, w: side > 0 ? 2.1 : 1.8, h: side > 0 ? 4.2 : 3.8, glass: side < 0 }], end);
  }
  pitchedRoof(w + 1.4, d + 1.4, 5.8, 0, h, 0, group);
  for (const zz of [-d * .25, d * .25]) {
    box(1.3, 6.1, 1.3, 1.9, h + 4.1, zz, materials.stone, group);
    box(1.65, .28, 1.65, 1.9, h + 7.1, zz, materials.trim, group);
    for (const xx of [-.32, .32]) cylinder(.22, .28, .75, 1.9 + xx, h + 7.5, zz, materials.base, 10, group);
  }
  return group;
}
hall(12, -10, 10.5, 21, 10.8);
const chapel = hall(-13, 17, 7.5, 10, 7.5);
chapel.rotation.y = Math.PI / 2;
cylinder(1.45, 1.6, 5, -18, BASE + 11.5, 17, materials.stone, 16);
tiledCone(-18, BASE + 14, 17, 2, 6);
beam([-18, 33.5, 17], [-18, 35.5, 17], .1, materials.iron);
beam([-18.55, 34.9, 17], [-17.45, 34.9, 17], .1, materials.iron);

const gateCenter = new THREE.Vector3(-9, BASE, 27.5);
tower(-14.5, 29.2, 2.15, 11, true);
tower(-3.5, 32.1, 2.15, 11, true);
const gatehouse = new THREE.Group(); gatehouse.position.copy(gateCenter); gatehouse.rotation.y = -.265; scene.add(gatehouse);
facade(8, 9.3, 4.2, [{ x: 0, y: -.1, w: 3.8, h: 5.4, open: true }], gatehouse);
const gateDoor = mesh(new THREE.ShapeGeometry(archPath(new THREE.Shape(), 0, 0, 3.8, 5.3)), materials.dark, gatehouse);
gateDoor.position.z = -3.85;
for (const xx of [-1.55, -1.1, -.65, -.2, .2, .65, 1.1, 1.55]) box(.28, 3.25, .12, xx, 1.6, -3.7, materials.timber, gatehouse);
for (const yy of [.75, 2.3]) box(3.8, .16, .16, 0, yy, -3.6, materials.iron, gatehouse);
pitchedRoof(8.8, 5.6, 3.6, 0, 9.3, -1.6, gatehouse);
for (let xx = -1.5; xx <= 1.5; xx += .45) box(.095, 2.5, .12, xx, 4.55, -1.9, materials.iron, gatehouse);
for (const yy of [3.6, 4.4, 5.2]) box(3.2, .095, .12, 0, yy, -1.88, materials.iron, gatehouse);

function flag(x, y, z, scale = 1) {
  cylinder(.055, .075, 5 * scale, x, y + 2.5 * scale, z, materials.iron, 8);
  const g = new THREE.PlaneGeometry(2.8 * scale, 1.2 * scale, 16, 5); g.translate(1.4 * scale, - .6 * scale, 0);
  const m = new THREE.MeshStandardMaterial({ color: '#722f23', roughness: 1, side: THREE.DoubleSide });
  const f = mesh(g, m); f.position.set(x, y + 4.7 * scale, z); f.rotation.y = -.6;
  flags.push({ mesh: f, original: Float32Array.from(g.attributes.position.array), scale });
}
const flags = [];
flag(-3.1, BASE + 32.1, 1.4, .88); flag(23, BASE + 18.7, -23, .8);

// Curved approach, with a bridge crossing the water and a second path to the gate.
function pathRibbon(points, width, mat) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p[0], 0, p[1])));
  const p = [], uv = [], indices = [];
  for (let i = 0; i <= 180; i++) {
    const t = i / 180, v = curve.getPoint(t), tangent = curve.getTangent(t), normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
    for (const side of [-1, 1]) {
      const q = v.clone().addScaledVector(normal, side * width / 2);
      p.push(q.x, height(q.x, q.z) + .1, q.z); uv.push(i / 8, side === -1 ? 0 : 1);
    }
    if (i < 180) { const a = i * 2; indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(indices); g.computeVertexNormals(); const m = mesh(g, mat); m.castShadow = false;
}
const pathMat = new THREE.MeshStandardMaterial({ color: '#ac9c79', roughness: 1, bumpMap: stoneMaps.bumpMap, bumpScale: .055, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
pathRibbon([[-9, 28], [-10, 41], [1, 54], [26, 56], [48, 53], [64, 52]], 4.5, pathMat);
pathRibbon([[99, 51], [116, 56], [137, 76], [163, 123], [160, 200]], 5, pathMat);

function bridge() {
  const z = 52, x0 = 57, x1 = 104, h = 9.8, group = new THREE.Group(); group.position.z = z; scene.add(group);
  for (let j = 0; j < 4; j++) {
    const center = x0 + (j + .5) * (x1 - x0) / 4, half = (x1 - x0) / 8, r = 4.35, cy = 3.05;
    const shape = new THREE.Shape();
    shape.moveTo(-half, -2); shape.lineTo(-half, h); shape.lineTo(half, h); shape.lineTo(half, -2);
    shape.lineTo(r, -2); shape.lineTo(r, cy); shape.absarc(0, cy, r, 0, Math.PI, false); shape.lineTo(-r, -2); shape.closePath();
    const span = mesh(worldUV(new THREE.ExtrudeGeometry(shape, { depth: 7.2, bevelEnabled: false, curveSegments: 20 })), materials.stone, group);
    span.position.set(center, 0, -3.2);
  }
  for (const side of [-1, 1]) {
    const wall = new THREE.Group(); wall.position.z = .4 + side * 3.6; group.add(wall);
    for (let x = x0 + 5.9; x < x1 - 3; x += 11.7) for (let k = 0; k < 17; k++) {
      const a = (k + .5) * Math.PI / 17, r = 4.7;
      const v = box(.65, .82, .36, x + Math.cos(a) * r, 3.05 + Math.sin(a) * r, 0, materials.trim, wall); v.rotation.z = a;
    }
    box(x1 - x0, .35, 1.0, (x0 + x1) / 2, h + 1.15, 0, materials.trim, wall);
    box(x1 - x0, 1.2, .7, (x0 + x1) / 2, h + .4, 0, materials.stone, wall);
  }
  box(x1 - x0, .75, 6.4, (x0 + x1) / 2, h - .25, .4, materials.stone, group);
  for (let x = x0; x < x1 + .1; x += 11.7) cylinder(1.5, 2.3, 4, x, 1, 0, materials.base, 4, group);
}
bridge();

const riverG = new THREE.PlaneGeometry(900, 900, 1, 1);
const waterNormals = canvasTexture(256, (c, s) => {
  const p = c.createImageData(s, s);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const i = (y * s + x) * 4, n = Math.sin(x * .22 + Math.sin(y * .19) * 2) * .5 + Math.sin(y * .24 + x * .13) * .5;
    p.data[i] = 128 + n * 40; p.data[i + 1] = 128 + Math.sin(y * .26 + n) * 36; p.data[i + 2] = 245; p.data[i + 3] = 255;
  }
  c.putImageData(p, 0, 0);
}, false);
waterNormals.repeat.set(160, 160);
const water = new Water(riverG, { textureWidth: 768, textureHeight: 768, waterNormals, sunDirection: sun.position.clone().normalize(), sunColor: '#ffdaa1', waterColor: '#447a6b', distortionScale: 1.8, fog: true });
water.material.fragmentShader = water.material.fragmentShader.replace('float rf0 = 0.3;', 'float rf0 = 0.06;');
water.rotation.x = -Math.PI / 2; water.position.y = .8; water.castShadow = false; water.material.uniforms.size.value = 2.8; scene.add(water);

const wellX = 5, wellZ = 11;
cylinder(1.25, 1.25, 1, wellX, BASE + .45, wellZ, materials.trim, 24);
cylinder(.94, .94, .02, wellX, BASE + .97, wellZ, materials.dark, 24);
for (const sx of [-1.3, 1.3]) box(.21, 2.7, .21, wellX + sx, BASE + 2, wellZ, materials.timber);
const wellRoof = new THREE.Group(); wellRoof.position.set(wellX, BASE + 3.5, wellZ); wellRoof.rotation.y = Math.PI / 2; scene.add(wellRoof); pitchedRoof(3.6, 3.3, 1.3, 0, 0, 0, wellRoof);
beam([wellX - 1.3, BASE + 2.8, wellZ], [wellX + 1.3, BASE + 2.8, wellZ], .17);

const gardenSoil = new THREE.MeshStandardMaterial({ color: '#605d3f', roughness: 1 });
const gardenGreen = new THREE.MeshStandardMaterial({ color: '#526337', roughness: 1 });
for (let i = 0; i < 3; i++) {
  box(3, .12, 5.5, 15 + i * 3.7, BASE + .13, 9, gardenSoil);
  for (const xx of [-1.55, 1.55]) box(.15, .3, 5.8, 15 + i * 3.7 + xx, BASE + .2, 9, materials.trim);
  for (const zz of [6.15, 11.85]) box(3.25, .3, .15, 15 + i * 3.7, BASE + .2, zz, materials.trim);
  for (let j = 0; j < 6; j++) for (let k = 0; k < 3; k++) instance(new THREE.IcosahedronGeometry(.23, 1), gardenGreen, 14 + i * 3.7 + k, BASE + .35, 6.8 + j * .87, 1, .7, 1);
}

function cottage(x, z, w, d, h, rotation) {
  const group = new THREE.Group(); group.position.set(x, height(x, z) - .25, z); group.rotation.y = rotation; scene.add(group);
  box(w + .3, .9, d + .3, 0, .2, 0, materials.base, group);
  box(w, h, d, 0, h / 2, 0, materials.plaster, group);
  for (const side of [-1, 1]) {
    box(w + .1, .19, .16, 0, h * .55, side * (d / 2 + .01), materials.timber, group);
    for (const xx of [-w / 2, 0, w / 2]) box(.17, h, .17, xx, h / 2, side * d / 2, materials.timber, group);
    beam([-w / 2, .6, side * d / 2], [0, h * .55, side * d / 2], .12, materials.timber, group);
    beam([w / 2, .6, side * d / 2], [0, h * .55, side * d / 2], .12, materials.timber, group);
    for (const xx of [-w * .26, w * .26]) { box(.65, .86, .03, xx, h * .74, side * (d / 2 + .1), materials.dark, group); box(.06, .88, .06, xx, h * .74, side * (d / 2 + .14), materials.timber, group); }
  }
  box(1, 1.8, .06, w * .25, .88, d / 2 + .035, materials.timber, group);
  pitchedRoof(w + 1, d + 1, h * .74, 0, h, 0, group);
  box(.85, 3.5, .9, -w * .23, h + 1.65, -d * .2, materials.stone, group);
  box(1.06, .2, 1.11, -w * .23, h + 3.3, -d * .2, materials.trim, group);
}
for (const c of [[-19, 65, 7, 10, 4.4, .3], [-31, 78, 6, 8, 3.6, -.5], [26, 79, 7.5, 11, 4.2, -.2], [32, 98, 6, 8, 3.5, .4], [-8, 98, 5.5, 8, 3.6, .12], [125, 48, 6, 9, 3.8, 1.4]]) cottage(...c);

const hayMaterial = new THREE.MeshStandardMaterial({ color: '#ad9460', roughness: 1 });
for (let i = 0; i < 6; i++) cylinder(.35, between(1.1, 1.5), between(1.8, 2.5), -41 + i * 2.7, height(-41 + i * 2.7, 95) + .9, 95, hayMaterial, 12);

const rockGeometry = new THREE.IcosahedronGeometry(1, 1);
const rockP = rockGeometry.attributes.position; for (let i = 0; i < rockP.count; i++) { const f = .82 + hash(rockP.getX(i) * 4, rockP.getZ(i) * 5 + rockP.getY(i)) * .26; rockP.setXYZ(i, rockP.getX(i) * f, rockP.getY(i) * f, rockP.getZ(i) * f); } rockGeometry.computeVertexNormals();
const rockMaterial = new THREE.MeshStandardMaterial({ color: '#737668', roughness: 1, flatShading: false });
for (let i = 0; i < 520; i++) {
  const z = between(-250, 230), side = rand() > .5 ? 1 : -1, x = riverX(z) + side * (riverWidth(z) + between(-1, 8)), y = height(x, z);
  const s = between(.2, 1.7);
  instance(rockGeometry, rockMaterial, x, y - s * .25, z, s * between(.8, 1.7), s * .65, s, rand() * 7, new THREE.Color().setHSL(.13, .07, between(.6, 1)));
}
for (let i = 0; i < 55; i++) {
  const a = rand() * Math.PI * 2, r = between(36, 47), x = Math.cos(a) * r, z = Math.sin(a) * r;
  if (z > 4 || x > 22) continue;
  const s = between(1.2, 3.3); instance(rockGeometry, rockMaterial, x, height(x, z) - .9, z, s * 1.8, s, s, a);
}

const leafMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95, side: THREE.DoubleSide });
const barkMaterial = new THREE.MeshStandardMaterial({ color: '#564c38', roughness: 1 });
leafMaterial.onBeforeCompile = shader => {
  shader.vertexShader = 'varying vec3 leafPosition;\n' + shader.vertexShader;
  shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nleafPosition=position;');
  shader.fragmentShader = 'varying vec3 leafPosition; float leafNoise(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,39.425)))*43758.5453);}\n' + shader.fragmentShader;
  shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\nfloat fleck=leafNoise(floor(leafPosition*15.)); diffuseColor.rgb*=.78+.36*fleck;');
  shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', 'outgoingLight += diffuseColor.rgb * vec3(1.0,0.76,0.4) * 0.06;\n#include <opaque_fragment>');
};
function treeTemplate(kind, detailed = true) {
  const branchParts = [], leafPositions = [], leafColors = [], crownParts = [];
  const color = new THREE.Color(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
  function branch(a, b, r1, r2) {
    const direction = new THREE.Vector3(...b).sub(new THREE.Vector3(...a));
    const g = new THREE.CylinderGeometry(r2, r1, direction.length(), 6);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize()));
    g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); branchParts.push(g);
  }
  const H = kind === 2 ? 11 : kind === 1 ? 8 : 9;
  branch([0, 0, 0], [.25, H * .73, -.12], .42, .1);
  for (let i = 0; i < 11; i++) {
    const a = i * 2.39996, y = H * between(.35, .78), r = kind === 2 ? between(1.4, 2.3) : between(2.1, 3.5);
    const end = [Math.cos(a) * r, y + between(.6, 2.0), Math.sin(a) * r];
    branch([.12, y - 1.4, 0], end, .14, .035);
    const crown = new THREE.IcosahedronGeometry(kind === 2 ? 1.42 : 1.85, detailed ? 3 : 1);
    const cp = crown.attributes.position, cc = [];
    for (let k = 0; k < cp.count; k++) {
      const px = cp.getX(k), py = cp.getY(k), pz = cp.getZ(k);
      const n = .85 + .28 * noise(px * 4 + i * 3, pz * 4 + py * 2);
      cp.setXYZ(k, end[0] + px * n, end[1] + py * n * .78, end[2] + pz * n);
      const normal = new THREE.Vector3(px, py / .78, pz).normalize(); crown.attributes.normal.setXYZ(k, normal.x, normal.y, normal.z);
      color.setHSL(kind === 1 ? .185 : .235, .37, .16 + .055 * n + py * .016);
      cc.push(color.r, color.g, color.b);
    }
    crown.deleteAttribute('uv'); crown.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3)); crownParts.push(crown);
    for (let k = 0; k < (detailed ? 90 : 0); k++) {
      const theta = rand() * 6.283, phi = Math.acos(between(-1, 1)), rr = Math.cbrt(rand());
      const spread = kind === 2 ? 1.55 : 2.05;
      const x = end[0] + Math.sin(phi) * Math.cos(theta) * rr * spread;
      const yy = end[1] + Math.cos(phi) * rr * spread * .7;
      const z = end[2] + Math.sin(phi) * Math.sin(theta) * rr * spread;
      const size = between(.27, .47), angle = rand() * 6.28;
      v1.set(Math.cos(angle) * size, between(-.16, .16), Math.sin(angle) * size);
      v2.set(-Math.sin(angle) * size * .5, size * between(.25, .9), Math.cos(angle) * size * .5);
      const A = [x - v1.x, yy - v1.y, z - v1.z], B = [x + v2.x, yy + v2.y, z + v2.z], C = [x + v1.x, yy + v1.y, z + v1.z], D = [x - v2.x, yy - v2.y, z - v2.z];
      leafPositions.push(...A, ...B, ...C, ...A, ...C, ...D);
      const light = between(.18, .29) * (.67 + rr * .33);
      color.setHSL(kind === 1 ? between(.16, .2) : between(.20, .25), between(.28, .46), light);
      for (let j = 0; j < 6; j++) leafColors.push(color.r, color.g, color.b);
    }
  }
  if (detailed) {
    const foliage = new THREE.BufferGeometry(); foliage.setAttribute('position', new THREE.Float32BufferAttribute(leafPositions, 3)); foliage.setAttribute('color', new THREE.Float32BufferAttribute(leafColors, 3)); foliage.computeVertexNormals(); crownParts.push(foliage);
  }
  return { bark: mergeGeometries(branchParts), foliage: mergeGeometries(crownParts) };
}
const trees = [treeTemplate(0), treeTemplate(1), treeTemplate(2), treeTemplate(0)];
const farTrees = [treeTemplate(0, false), treeTemplate(1, false), treeTemplate(2, false)];
const treeLocations = [];
for (let i = 0; i < 5200; i++) {
  const x = between(-300, 300), z = between(-320, 230), y = height(x, z), r = Math.hypot(x, z);
  if (r < 47 || y < 3 || Math.abs(x - roadX(z)) < 8 && z > 35 || z > 43 && z < 62 && x > -18 && x < 145) continue;
  if (z > 52 && z < 120 && x > -46 && x < 42) continue;
  if (r < 120 && (noise(x * .035, z * .035) < .59 || rand() < .5)) continue;
  if (r > 120 && noise(x * .025 + 3, z * .025) < .3) continue;
  const s = between(.75, 1.2) * (r > 170 ? 1.15 : 1), rot = rand() * 6.283, template = r < 115 ? trees[i % trees.length] : farTrees[i % farTrees.length];
  treeLocations.push([x, z, s, instance(template.bark, barkMaterial, x, y - .2, z, s, s, s, rot), instance(template.foliage, leafMaterial, x, y - .2, z, s, s, s, rot)]);
}
for (const [x, z, s, kind] of [[-40, 34, 1.05, 0], [36, 24, .75, 1], [-27, 53, .85, 2], [27, 48, .95, 0], [-46, -17, 1.1, 0], [39, -24, 1.1, 1], [4, -40, .9, 2], [-55, 90, 1.15, 0], [31, 115, .7, 1]]) {
  const t = trees[kind]; treeLocations.push([x, z, s, instance(t.bark, barkMaterial, x, height(x, z) - .2, z, s, s, s, x), instance(t.foliage, leafMaterial, x, height(x, z) - .2, z, s, s, s, x)]);
}

const grassPositions = [], grassColors = [], grassColor = new THREE.Color();
for (let i = 0; i < 95000; i++) {
  const x = between(-160, 170), z = between(-170, 170), y = height(x, z), r = Math.hypot(x, z);
  if (r < 35 || y < 1.7 || Math.abs(x - roadX(z)) < 4.7 && z > 36 || z > 42 && z < 61 && x > -20 && x < 112) continue;
  if (z > 59 && z < 109 && x > -37 && x < 38 && noise(x, z) > .5) continue;
  const size = between(.18, .68), a = rand() * 6.28, dx = Math.cos(a) * .09, dz = Math.sin(a) * .09;
  grassPositions.push(x - dx, y, z - dz, x + dx, y, z + dz, x + .12, y + size, z + .06);
  grassColor.setHSL(between(.19, .25), between(.28, .42), between(.16, .27));
  for (let j = 0; j < 3; j++) grassColors.push(grassColor.r, grassColor.g, grassColor.b);
}
const grassGeometry = new THREE.BufferGeometry(); grassGeometry.setAttribute('position', new THREE.Float32BufferAttribute(grassPositions, 3)); grassGeometry.setAttribute('color', new THREE.Float32BufferAttribute(grassColors, 3)); grassGeometry.computeVertexNormals();
const grass = mesh(grassGeometry, leafMaterial); grass.castShadow = false;

const fencePosts = [];
for (let i = 0; i < 24; i++) fencePosts.push([-43 + i * 3.2, 112 + Math.sin(i * .17) * 4]);
for (let i = 0; i < fencePosts.length; i++) {
  const [x, z] = fencePosts[i], y = height(x, z);
  box(.15, 1.4, .17, x, y + .55, z, materials.timber);
  if (i > 0) { const [px, pz] = fencePosts[i - 1], py = height(px, pz); for (const h of [.45, .98]) beam([px, py + h, pz], [x, y + h, z], .11); }
}

const sheepBody = new THREE.IcosahedronGeometry(1, 2), wool = new THREE.MeshStandardMaterial({ color: '#d8d0b9', roughness: 1 }), sheepDark = new THREE.MeshStandardMaterial({ color: '#6f6855', roughness: 1 });
for (let i = 0; i < 12; i++) {
  const x = between(-36, -4), z = between(118, 148), y = height(x, z), a = rand() * 6.28;
  instance(sheepBody, wool, x, y + .66, z, .75, .48, .4, a);
  instance(sheepBody, sheepDark, x + Math.cos(a) * .72, y + .79, z - Math.sin(a) * .72, .25, .25, .21, a);
  for (const dx of [-.4, .4]) for (const dz of [-.22, .22]) instance(unitBox, sheepDark, x + dx, y + .22, z + dz, .1, .54, .1);
}

// Small airborne details establish scale without a camera animation.
const birds = [];
const birdMaterial = new THREE.MeshBasicMaterial({ color: '#4c534b', side: THREE.DoubleSide });
for (let i = 0; i < 9; i++) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -1, .1, .22, -.3, 0, -.25, 0, 0, 0, .3, 0, -.25, 1, .1, .22], 3)); g.computeVertexNormals();
  const b = mesh(g, birdMaterial); b.castShadow = false; birds.push({ mesh: b, angle: rand() * 6.28, radius: between(30, 60), high: between(43, 57) });
}

const movingMeshes = new Set([water, sky, ...flags.map(f => f.mesh), ...birds.map(b => b.mesh)]);
scene.updateMatrixWorld(true);
const staticParts = new Map(), sourceMeshes = [];
scene.traverse(o => {
  if (!o.isMesh || o.isInstancedMesh || movingMeshes.has(o)) return;
  const key = o.material.uuid + Object.keys(o.geometry.attributes).sort().join(',') + o.castShadow;
  if (!staticParts.has(key)) staticParts.set(key, { material: o.material, geometries: [], castShadow: o.castShadow });
  const geometry = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
  geometry.applyMatrix4(o.matrixWorld); staticParts.get(key).geometries.push(geometry); sourceMeshes.push(o);
});
for (const o of sourceMeshes) o.removeFromParent();
for (const b of staticParts.values()) { const o = mesh(mergeGeometries(b.geometries), b.material); o.castShadow = b.castShadow; }
finishInstances();

const composer = new EffectComposer(renderer);
composer.renderTarget1.samples = 4; composer.renderTarget2.samples = 4;
composer.addPass(new RenderPass(scene, camera));
const ao = new GTAOPass(scene, camera, innerWidth, innerHeight);
ao.blendIntensity = .55;
ao.updateGtaoMaterial({ radius: 2.0, thickness: 1.2, distanceExponent: 1.2, distanceFallOff: 1, scale: 1, samples: 8 });
ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, rings: 2, samples: 8 });
composer.addPass(ao);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .15, .5, 1.45); composer.addPass(bloom);
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, tDepth: { value: ao.depthTexture }, inverseProjection: { value: camera.projectionMatrixInverse }, cameraWorld: { value: camera.matrixWorld }, mistColor: { value: new THREE.Color('#b4c2bc') } },
  vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: `uniform sampler2D tDiffuse; uniform sampler2D tDepth; uniform mat4 inverseProjection; uniform mat4 cameraWorld; uniform vec3 mistColor; varying vec2 vUv;
    void main(){vec3 c=texture2D(tDiffuse,vUv).rgb; float depth=texture2D(tDepth,vUv).x; vec4 view=inverseProjection*vec4(vUv*2.-1.,depth*2.-1.,1.); view/=view.w; vec3 world=(cameraWorld*view).xyz; float river=65.+15.*sin(world.z*.018)+9.*sin(world.z*.035+1.); float valley=1.-smoothstep(18.,75.,abs(world.x-river)); float mist=.35*exp(-max(world.y-2.,0.)*.12)*smoothstep(65.,260.,-view.z)*valley; c=mix(c,mistColor,mist); float l=dot(c,vec3(.2126,.7152,.0722)); c=mix(vec3(l),c,.97); float vign=smoothstep(.85,.25,length((vUv-.5)*vec2(1.,.85))); c*=.90+.10*vign; gl_FragColor=vec4(c,1.);}`
});
grade.uniforms.tDepth.value = ao.depthTexture;
grade.uniforms.inverseProjection.value = camera.projectionMatrixInverse;
grade.uniforms.cameraWorld.value = camera.matrixWorld;
composer.addPass(grade); composer.addPass(new OutputPass());
const fxaa = new ShaderPass(FXAAShader); composer.addPass(fxaa);

const start = performance.now();
let lastFrame = start, frameCount = 0;
// Game systems register here; called every frame with (dt seconds, elapsed seconds).
export const frameHooks = [];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
function render(now) {
  requestAnimationFrame(render);
  if (document.hidden) { lastFrame = now; return; }
  const dt = Math.min(.1, Math.max(0, now - lastFrame) * .001);
  lastFrame = now;
  const time = (now - start) * .001;
  for (const hook of frameHooks) hook(dt, time);
  controls.update();
  if (!reducedMotion) {
    water.material.uniforms.time.value = time * .28;
    for (const flag of flags) {
      const p = flag.mesh.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = flag.original[i * 3], y = flag.original[i * 3 + 1];
        p.setZ(i, Math.sin(x * 2.2 - time * 2.4 + y * .4) * x * .105); p.setY(i, y + Math.sin(x * 2 - time * 2) * x * .035);
      }
      p.needsUpdate = true; flag.mesh.geometry.computeVertexNormals();
    }
    for (let i = 0; i < birds.length; i++) {
      const b = birds[i], a = b.angle + time * .035;
      b.mesh.position.set(Math.cos(a) * b.radius - 12, b.high + Math.sin(time * .5 + i) * .5, Math.sin(a) * b.radius - 10); b.mesh.rotation.y = -a; b.mesh.rotation.z = Math.sin(time + i) * .09;
      const p = b.mesh.geometry.attributes.position; p.setY(1, Math.sin(time * 3 + i) * .32); p.setY(5, Math.sin(time * 3 + i) * .32); p.needsUpdate = true;
    }
  }
  composer.render(); frameCount++;
  if (frameCount === 1) { document.body.classList.add('ready'); window.__sceneReady = true; renderer.shadowMap.autoUpdate = false; }
}
requestAnimationFrame(render);

function fit() {
  camera.aspect = innerWidth / innerHeight;
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(19.5)) * Math.max(1, 1.1 / camera.aspect)));
  camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  fxaa.material.uniforms.resolution.value.set(1 / (innerWidth * renderer.getPixelRatio()), 1 / (innerHeight * renderer.getPixelRatio()));
}
fit();
addEventListener('resize', fit);
renderer.domElement.addEventListener('dblclick', () => { camera.position.copy(initialPosition); controls.target.set(7, 17, 7); controls.update(); });
renderer.domElement.addEventListener('keydown', e => {
  const offset = camera.position.clone().sub(controls.target), spherical = new THREE.Spherical().setFromVector3(offset);
  if (e.key === 'ArrowLeft') spherical.theta -= .08;
  else if (e.key === 'ArrowRight') spherical.theta += .08;
  else if (e.key === 'ArrowUp') spherical.phi = Math.max(controls.minPolarAngle, spherical.phi - .055);
  else if (e.key === 'ArrowDown') spherical.phi = Math.min(controls.maxPolarAngle, spherical.phi + .055);
  else if (e.key === '+' || e.key === '=') spherical.radius = Math.max(controls.minDistance, spherical.radius * .91);
  else if (e.key === '-') spherical.radius = Math.min(controls.maxDistance, spherical.radius * 1.09);
  else return;
  e.preventDefault(); camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical)); controls.update();
});
window.__castle = { renderer, camera, controls, scene, stats: () => ({ frames: frameCount, triangles: renderer.info.render.triangles, calls: renderer.info.render.calls, camera: camera.position.toArray(), distance: camera.position.distanceTo(controls.target), trees: treeLocations.length, ready: window.__sceneReady === true }) };

// Hides every tree within radius of (x, z), e.g. to clear a build site. Shadows refresh on the next frame.
const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
export function clearTrees(x, z, radius) {
  for (const t of treeLocations) {
    if (t.hidden || Math.hypot(t[0] - x, t[1] - z) > radius) continue;
    t.hidden = true;
    for (const ref of [t[3], t[4]]) { ref.batch.mesh.setMatrixAt(ref.index, hidden); ref.batch.mesh.instanceMatrix.needsUpdate = true; }
  }
  renderer.shadowMap.needsUpdate = true;
}
export const pathPoints = {
  gateRoad: [[-9, 28], [-10, 41], [1, 54], [26, 56], [48, 53], [64, 52]],
  eastRoad: [[99, 51], [116, 56], [137, 76], [163, 123], [160, 200]],
  southRoad: [[2, 52], [6, 75], [13, 100], [14, 152], [-6, 218], [-20, 320]],
};
export const bridgeDeck = { x0: 57, x1: 104, z: 52, halfWidth: 3.1, y: 9.925 };
export { THREE, roadX, scene, camera, controls, renderer, composer, sun, terrain, water, materials, stoneMaps, height, riverX, riverWidth, noise, fbm, BASE, gateCenter, treeLocations, box, cylinder, beam, tiledCone, pitchedRoof, facade, mesh, worldUV, unitBox, initialPosition };
