import { fortKit } from './fort-kit.js';
// Level 1: the river valley and the castle of Dawnhold. Built with the engine kit from scene.js;
// returns the facts the game needs (terrain height, lanes, pads, camera views, effect anchors).
export function buildCastle(K) {
  const { THREE, scene, renderer, rand, between, smooth, hash, noise, fbm, canvasTexture, stoneMaps, materials, instance, unitBox, worldUV, mesh, box, cylinder, beam, archPath, facade, tiledCone, pitchedRoof, mergeGeometries, Water } = K;
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

  const BASE = 14;
  const { curtain, tower, keep, hall, flag, flags, pathRibbon, cottage, skyDome, skyLight, waveFlags, relief, padsAlong } = fortKit(K, BASE, height);
  scene.fog = new THREE.FogExp2('#c8c8b9', .00135);
  const sky = skyDome(`varying vec3 vDirection; uniform vec3 sunDirection;
      void main(){vec3 d=normalize(vDirection); float h=max(d.y,0.); vec3 col=mix(vec3(.78,.76,.64),vec3(.32,.48,.57),pow(h,.42)); float a=max(dot(d,sunDirection),0.); col+=vec3(.42,.24,.07)*pow(a,9.)+vec3(1.8,1.35,.7)*pow(a,1800.); gl_FragColor=vec4(col,1.);}`, new THREE.Vector3(-.65, .26, -.48).normalize());
  const hemi = new THREE.HemisphereLight('#c5d7e1', '#53553c', 1.25); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffdaa1', 3.6);
  sun.position.set(-105, 55, -78); sun.target.position.set(0, 8, 0);
  sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -95, right: 95, top: 110, bottom: -85, near: 1, far: 320 });
  sun.shadow.bias = -.00018; sun.shadow.normalBias = .065; sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const bounce = new THREE.DirectionalLight('#9cbacb', .35); bounce.position.set(65, 40, 80); scene.add(bounce);

  skyLight(sky, .28);

  const enclosure = [[-26, -21], [-3, -29], [23, -23], [31, -1], [22, 25], [4, 31], [-22, 24], [-32, 3]];
  const courtyard = new THREE.Shape(); enclosure.forEach(([x, z], i) => i ? courtyard.lineTo(x, -z) : courtyard.moveTo(x, -z)); courtyard.closePath();
  const court = mesh(new THREE.ShapeGeometry(courtyard), new THREE.MeshStandardMaterial({ ...stoneMaps, color: '#aaa38c', roughness: 1, bumpScale: .08 }));
  court.rotation.x = -Math.PI / 2; court.position.y = BASE + .025; court.castShadow = false;
  const uv = court.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 8, uv.getY(i) / 8);

  for (let i = 0; i < enclosure.length; i++) curtain(enclosure[i], enclosure[(i + 1) % enclosure.length], i === 5);

  enclosure.forEach(([x, z], i) => tower(x, z, i === 0 ? 4.5 : 3.35, [14, 12, 13, 11.5, 13, 12.5, 12, 12][i], [0, 1, 2, 4].includes(i)));

  keep(-10, -6);

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

  flag(-3.1, BASE + 32.1, 1.4, .88); flag(23, BASE + 18.7, -23, .8);

  // Curved approach, with a bridge crossing the water and a second path to the gate.
  const pathMat = new THREE.MeshStandardMaterial({ color: '#ac9c79', roughness: 1, bumpMap: stoneMaps.bumpMap, bumpScale: .055, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  pathRibbon([[-9, 28], [-10, 41], [1, 54], [26, 56], [48, 53], [64, 52]], 4.5, pathMat);
  pathRibbon([[99, 51], [116, 56], [137, 76], [163, 123], [160, 200]], 5, pathMat);

  // Sunk so the deck sits flush with the banks (~6.3 west, ~6.9 east) instead of towering over the road.
  const BRIDGE_DROP = -4.2;
  function bridge() {
    const z = 52, x0 = 57, x1 = 104, h = 9.8, group = new THREE.Group(); group.position.set(0, BRIDGE_DROP, z); scene.add(group);
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

  const cottages = [[-19, 65, 7, 10, 4.4, .3], [-31, 78, 6, 8, 3.6, -.5], [26, 79, 7.5, 11, 4.2, -.2], [32, 98, 6, 8, 3.5, .4], [-8, 98, 5.5, 8, 3.6, .12], [125, 48, 6, 9, 3.8, 1.4]];
  for (const c of cottages) cottage(...c);

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
      // Far trees (~3300 instances, drawn ~4x a frame: main, reflection, AO normals) skip hidden side branches and use low-poly crowns.
      if (detailed) branch([.12, y - 1.4, 0], end, .14, .035);
      const crown = new THREE.IcosahedronGeometry((kind === 2 ? 1.42 : 1.85) * (detailed ? 1 : 1.12), detailed ? 3 : 0); // 1.12: flat faces sit inside the sphere
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


  // ---- what the game needs from this world ----
  // Lanes: dense polylines along the dirt roads, spawn → gate. South: village road to the fork, then the gate road.
  // East: from the east hills, across the stone bridge, up to the gate.
  function sampleCurve(points, t0, t1, out) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p[0], 0, p[1])));
    const n = Math.ceil(Math.abs(t1 - t0) * 400);
    for (let i = 0; i <= n; i++) out.push(curve.getPoint(t0 + (t1 - t0) * i / n));
  }
  const pathPoints = {
    gateRoad: [[-9, 28], [-10, 41], [1, 54], [26, 56], [48, 53], [64, 52]],
    eastRoad: [[99, 51], [116, 56], [137, 76], [163, 123], [160, 200]],
  };
  const south = [], east = [];
  for (let z = 150; z >= 56; z -= .5) south.push(new THREE.Vector3(roadX(z), 0, z));
  sampleCurve(pathPoints.gateRoad, .4, 0, south);
  sampleCurve(pathPoints.eastRoad, .55, 0, east);
  sampleCurve(pathPoints.gateRoad, 1, 0, east);
  const chimneys = [];
  for (const [x, z, w, d, h, r] of cottages) {
    const lx = -w * .23, lz = -d * .2, c = Math.cos(r), s = Math.sin(r);
    chimneys.push([x + lx * c + lz * s, height(x, z) - .25 + h + 3.55, z - lx * s + lz * c, 1.6 + rand()]);
  }
  chimneys.push([13.9, BASE + 10.8 + 7.9, -15.25, 1.2], [13.9, BASE + 10.8 + 7.9, -4.75, .8], [-10.5, BASE + 7.5 + 7.9, 15.1, 1], [-7.6, BASE + 29.4, -9.5, .9]);
  return {
    height, BASE, gateCenter, sun, terrain, water, treeLocations,
    bridgeDeck: { x0: 57, x1: 104, z: 52, halfWidth: 3.1, y: 9.925 + BRIDGE_DROP },
    lanePaths: [south, east], laneNames: ['south road', 'east bridge'],
    // Tactical spots along both lanes (validated: off the road, out of the river, clear of cottages).
    padSpots: [
      [22, 132], [3, 118], [24, 106], [3, 88], [21, 64], [-3, 71],
      [12, 44], [-15, 52], [-21, 38],
      [28, 36], [-25, 48],
      [36, 44], [37, 65],
      [50, 42], [50, 63], [111, 41], [109, 65],
      [139, 62],
    ],
    view: { position: new THREE.Vector3(-94, 88, 137), target: new THREE.Vector3(7, 17, 7) },
    titleView: [4, 14, 4, -120, 62, 138],
    fortPoints: [[-36, 14, -36], [36, 14, -36], [-36, 14, 34], [36, 14, 34], [-30, 46, -30], [30, 46, -30], [-30, 46, 30], [30, 46, 30]],
    mist: { color: '#b4c2bc', glsl: 'float river=65.+15.*sin(world.z*.018)+9.*sin(world.z*.035+1.); float valley=1.-smoothstep(18.,75.,abs(world.x-river)); float mist=.35*exp(-max(world.y-2.,0.)*.12)*smoothstep(65.,260.,-view.z)*valley;' },
    fx: {
      chimneys,
      // Fires near the gate. stage = minimum damage stage at which each one burns (1: <60% lives, 2: <30%, 3: lost).
      fires: [
        [-14.5, 27.6, 29.8, 1], [-9, 24.6, 28.2, 1], [-3.5, 27.6, 32.6, 2], [-18.5, 24.4, 25.6, 2], [.8, 24.4, 30.4, 2], [-13, 27.8, 17, 2],
        [-22, 27.2, 24.2, 3], [22, 27, 25, 3], [-10, 38.5, -6, 3], [12, 30.5, -10, 3], [4, 27, 31.2, 3],
      ],
      smoke: [[-10, 38, -6], [-9, 25, 28], [12, 28, -10], [-20, 27, 5], [18, 24, 12]],
      ambient: 'pollen',
    },
    moving: [water, sky, ...flags.map(f => f.mesh), ...birds.map(b => b.mesh)],
    animate(time) {
      water.material.uniforms.time.value = time * .28;
      waveFlags(time, [2.2, 2.4, .105, 2, .035]);
      for (let i = 0; i < birds.length; i++) {
        const b = birds[i], a = b.angle + time * .035;
        b.mesh.position.set(Math.cos(a) * b.radius - 12, b.high + Math.sin(time * .5 + i) * .5, Math.sin(a) * b.radius - 10); b.mesh.rotation.y = -a; b.mesh.rotation.z = Math.sin(time + i) * .09;
        const p = b.mesh.geometry.attributes.position; p.setY(1, Math.sin(time * 3 + i) * .32); p.setY(5, Math.sin(time * 3 + i) * .32); p.needsUpdate = true;
      }
    },
  };
}
