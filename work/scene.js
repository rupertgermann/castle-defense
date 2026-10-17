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
import { CopyShader } from 'three/addons/shaders/CopyShader.js';
import { LEVEL } from './level.js';
import { buildCastle } from './worlds/castle.js';
import { buildFrostmere } from './worlds/frostmere.js';

const scene = new THREE.Scene();
// No canvas MSAA: the composer's targets antialias the scene; the canvas only gets a fullscreen quad.
// Default power preference so dual-GPU Macs can stay on the integrated GPU.
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
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
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = .075;
controls.minDistance = 44;
controls.maxDistance = 285;
controls.maxPolarAngle = Math.PI * .455;
controls.minPolarAngle = .12;
controls.enablePan = false;
controls.zoomSpeed = .65;
controls.rotateSpeed = .52;

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


// ---- the world for this level: terrain, lighting, landmarks and everything the game reads from it ----
const kit = { THREE, scene, renderer, rand, between, clamp, smooth, hash, noise, fbm, canvasTexture, stoneMaps, materials, instance, unitBox, worldUV, mesh, box, cylinder, beam, archPath, facade, tiledCone, pitchedRoof, mergeGeometries, Water };
const world = (LEVEL === 'frostmere' ? buildFrostmere : buildCastle)(kit);
const { height, BASE, gateCenter, sun, terrain, water, treeLocations, bridgeDeck, lanePaths, laneNames, padSpots, titleView, fortPoints } = world;
const initialPosition = world.view.position.clone();
camera.position.copy(initialPosition); controls.target.copy(world.view.target); controls.update();

const movingMeshes = new Set(world.moving);
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
// MSAA only on the scene render, then one copy into the composer chain. MSAA on both ping-pong targets made
// every post pass write and resolve 4x samples (~10ms/frame at Retina).
class MsaaRenderPass extends RenderPass {
  msaa = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  copy = new ShaderPass(CopyShader);
  setSize(w, h) { this.msaa.setSize(w, h); }
  render(r, write, read, dt, mask) { super.render(r, write, this.msaa, dt, mask); this.copy.render(r, read, this.msaa); }
}
composer.addPass(new MsaaRenderPass(scene, camera));
// AO and bloom are soft; half resolution is visually the same at a fraction of the fill cost.
const halfRes = pass => { const set = pass.setSize; pass.setSize = (w, h) => set.call(pass, w / 2, h / 2); return pass; };
const ao = halfRes(new GTAOPass(scene, camera, innerWidth, innerHeight));
ao.blendIntensity = .55;
ao.updateGtaoMaterial({ radius: 2.0, thickness: 1.2, distanceExponent: 1.2, distanceFallOff: 1, scale: 1, samples: 8 });
ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, rings: 2, samples: 8 });
composer.addPass(ao);
// Water re-renders the scene for its reflection in onBeforeRender, which also fired during AO's normal pass: skip it there.
if (water?.isWater) {
  const reflect = water.onBeforeRender;
  water.onBeforeRender = function (r, ...rest) { if (r.getRenderTarget() !== ao.normalRenderTarget) reflect.call(this, r, ...rest); };
}
const bloom = halfRes(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .15, .5, 1.45)); composer.addPass(bloom);
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, tDepth: { value: ao.depthTexture }, inverseProjection: { value: camera.projectionMatrixInverse }, cameraWorld: { value: camera.matrixWorld }, depthShift: { value: 0 }, mistAmount: { value: 1 }, mistColor: { value: new THREE.Color(world.mist.color) } },
  vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: `uniform sampler2D tDiffuse; uniform sampler2D tDepth; uniform mat4 inverseProjection; uniform mat4 cameraWorld; uniform float depthShift; uniform float mistAmount; uniform vec3 mistColor; varying vec2 vUv;
    void main(){vec3 c=texture2D(tDiffuse,vUv).rgb; float depth=texture2D(tDepth,vUv).x; vec4 view=inverseProjection*vec4(vUv*2.-1.,depth*2.-1.,1.); view/=view.w; vec3 world=(cameraWorld*view).xyz; view.z+=depthShift; ${world.mist.glsl} c=mix(c,mistColor,mist*mistAmount); float l=dot(c,vec3(.2126,.7152,.0722)); c=mix(vec3(l),c,.97); float vign=smoothstep(.85,.25,length((vUv-.5)*vec2(1.,.85))); c*=.90+.10*vign; gl_FragColor=vec4(c,1.);}`
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
  if (now - lastFrame < 15) return; // cap at ~60fps; 120Hz displays would otherwise run every post pass twice as often
  const dt = Math.min(.1, Math.max(0, now - lastFrame) * .001);
  lastFrame = now;
  const time = (now - start) * .001;
  for (const hook of frameHooks) hook(dt, time);
  controls.update();
  keepViewClear();
  focusHaze();
  if (!reducedMotion) world.animate(time);
  composer.render(); frameCount++;
  if (frameCount === 1) { document.body.classList.add('ready'); window.__sceneReady = true; renderer.shadowMap.autoUpdate = false; }
}
requestAnimationFrame(render);

// Aerial haze is tuned for the title framing. Pulled back further (the battle overview), measure it from the focus
// distance instead, so zooming out keeps the field crisp rather than washing the whole map in fog.
const hazeRef = initialPosition.distanceTo(world.view.target), fogDensity = scene.fog?.density;
function focusHaze() {
  const d = camera.position.distanceTo(controls.target);
  if (scene.fog) scene.fog.density = fogDensity * hazeRef / Math.max(hazeRef, d);
  grade.uniforms.depthShift.value = Math.max(0, d - hazeRef);
  // Valley mist reads as a soft bank from a low angle but as a flat white stripe from above: fade it as the view tips down.
  grade.uniforms.mistAmount.value = 1 - THREE.MathUtils.smoothstep((camera.position.y - controls.target.y) / d, .45, .75);
}
// Keep the camera above the ground with a clear line of sight: when the camera half of the camera→target
// segment dips into a hill, raise the camera just enough (Frostmere's peaks ring the pass). The target half is
// left alone: overview targets may sit below a plateau on purpose.
const _seg = new THREE.Vector3();
function keepViewClear() {
  const c = camera.position, t = controls.target;
  let lift = 0;
  for (let i = 12; i <= 24; i++) {
    const k = i / 24; _seg.lerpVectors(t, c, k);
    const need = height(_seg.x, _seg.z) + (i === 24 ? 6 : 3) - _seg.y;
    if (need > 0) lift = Math.max(lift, need / k);
  }
  if (lift > 0) c.y += lift;
}
function fit() {
  camera.aspect = innerWidth / innerHeight;
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(19.5)) * Math.max(1, 1.1 / camera.aspect)));
  camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  fxaa.material.uniforms.resolution.value.set(1 / (innerWidth * renderer.getPixelRatio()), 1 / (innerHeight * renderer.getPixelRatio()));
}
fit();
addEventListener('resize', fit);
renderer.domElement.addEventListener('dblclick', () => { camera.position.copy(initialPosition); controls.target.copy(world.view.target); controls.update(); });
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
export { THREE, scene, camera, controls, renderer, composer, sun, terrain, water, materials, stoneMaps, height, noise, fbm, BASE, gateCenter, treeLocations, box, cylinder, beam, tiledCone, pitchedRoof, facade, mesh, worldUV, unitBox, initialPosition, bridgeDeck, lanePaths, laneNames, padSpots, titleView, fortPoints, world };
