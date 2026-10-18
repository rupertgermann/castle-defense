import { fortKit } from './fort-kit.js';
import { snowify, snowTerrain } from './snow-shaders.js';
// Level 2: Frostmere, a fortress barring a snowbound mountain pass at dawn. Foes climb the switchback valley road
// from the south and cross the frozen lake from the east. Built with the engine kit; returns the same world facts as castle.js.
export function buildFrostmere(K) {
  const { THREE, scene, renderer, rand, between, smooth, noise, fbm, canvasTexture, stoneMaps, materials, instance, mesh, box, cylinder, beam, facade, tiledCone, pitchedRoof, mergeGeometries } = K;
  const BASE = 16;

  // ---- landform: a valley floor that climbs north to the fort plateau, a side basin holding the lake, and peaks all round ----
  const valleyX = z => 6 * Math.sin(z * .021) + 10 * Math.sin(z * .0085 + 1.3);
  const LAKE = { x: 112, z: 80, rx: 44, rz: 27 }, ICE_Y = 7.6;
  const lakeD = (x, z) => Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz);   // < 1 on the ice
  // Signed distance (m) to the open, walkable ground: negative inside the valley, basin or fort plateau.
  function openD(x, z) {
    const valley = Math.max(Math.abs(x - valleyX(z)) - 40, -10 - z);
    const basin = Math.min((Math.hypot((x - 92) / 80, (z - 78) / 40) - 1) * 40, Math.max(Math.abs(z - 92 - (x - 150) * .1) - 24, 120 - x));  // + the east approach
    const fort = Math.hypot(x, z) - 46;
    return Math.min(valley, basin, fort);
  }
  function height(x, z) {
    const d = openD(x, z);
    let h = 4 + 3 * fbm(x * .02 + 3, z * .02 + 7) + 1.2 * noise(x * .09, z * .09) + 7 * smooth(170, 40, z);
    h += smooth(-6, 30, d) * (10 + 8 * fbm(x * .04, z * .04));                                   // foothills
    const low = 1 - .72 * smooth(95, 150, z) * smooth(35, 80, x);                                   // the ridge between the approaches stays low, so the overview camera sees over it
    h += low * (smooth(10, 120, d) * (70 + 110 * fbm(x * .007 + 5, z * .007 + 9)) + smooth(30, 90, d) * 14 * noise(x * .06, z * .06));  // peaks
    const r = Math.hypot(x, z);
    if (z > -70) h = THREE.MathUtils.lerp(h, BASE, 1 - smooth(30, 56, r));                      // fort plateau
    return THREE.MathUtils.lerp(ICE_Y - .1, Math.max(h, ICE_Y + .4), smooth(.88, 1.55, lakeD(x, z)));   // flat lake bed just under the ice, gentle shores
  }

  // ---- lanes (spawn → gate) ----
  const curvePoints = (pts, n) => new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z))).getSpacedPoints(n);
  const roadPts = [[valleyX(250), 250], [valleyX(205) - 4, 205], [-20, 168], [20, 146], [-20, 120], [18, 96], [-10, 72], [2, 50], [0, 27]];
  // The lake route joins the valley road below the fort, so the last stretch to the gate is a shared choke point.
  const road = curvePoints(roadPts, 600), join = road.reduce((b, p, i) => Math.hypot(p.x + 8, p.z - 76) < Math.hypot(road[b].x + 8, road[b].z - 76) ? i : b, 0);
  const icePts = [[215, 98], [175, 92], [140, 86], [112, 80], [84, 75], [58, 74], [32, 76], [road[join].x, road[join].z]];
  const ice = [...curvePoints(icePts, 420), ...road.slice(join + 1)];
  const roadD = (x, z) => { let b = Infinity; for (const L of [road, ice]) for (let i = 0; i < L.length; i += 3) b = Math.min(b, Math.hypot(L[i].x - x, L[i].z - z)); return b; };

  // ---- terrain: snow everywhere; the shader cuts rock into steep faces. Vertex colours carry the low-frequency
  // tones (drift shade, dead grass showing through, slush by the fort, ice). A coarse skirt runs out to the horizon,
  // sunk under the detailed patch so the map never ends in a cliff edge.
  const snowC = new THREE.Color('#e6ecf2'), snowShade = new THREE.Color('#ccd6e1'), scrub = new THREE.Color('#8a8468'), slush = new THREE.Color('#a49d90'), iceC = new THREE.Color('#a9c2d0');
  const terrainMaterial = snowTerrain(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9, metalness: 0 }));
  function makeTerrain(size, segs, sink) {
    const g = new THREE.PlaneGeometry(size, size, segs, segs).rotateX(-Math.PI / 2), p = g.attributes.position, colors = [];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), inner = sink ? 1 - smooth(400, 445, Math.max(Math.abs(x), Math.abs(z))) : 0;
      p.setY(i, height(x, z) - inner * sink);
      const c = snowC.clone().lerp(snowShade, fbm(x * .05, z * .05) * .8);
      c.lerp(scrub, smooth(.6, .92, noise(x * .06 + 4, z * .06)) * (1 - smooth(10, 24, p.getY(i))) * .45);
      if (Math.hypot(x, z) < 34) c.lerp(slush, .3);
      c.lerp(iceC, 1 - smooth(.95, 1.05, lakeD(x, z)));
      colors.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); g.computeVertexNormals();
    const m = mesh(g, terrainMaterial); m.castShadow = false; return m;
  }
  const terrain = makeTerrain(900, 420, 0);
  makeTerrain(2600, 200, 14).receiveShadow = false;

  // ---- cold dawn: low warm sun on the peaks, blue shadow, pale mist in the valley ----
  const { curtain, tower, keep, hall, flag, flags, pathRibbon, cottage, skyDome, skyLight, waveFlags, relief, padsAlong } = fortKit(K, BASE, height);
  scene.fog = new THREE.FogExp2('#cbd4df', .0011);
  const sunDir = new THREE.Vector3(.72, .22, -.66).normalize();
  const sky = skyDome(`varying vec3 vDirection; uniform vec3 sunDirection;
      void main(){vec3 d=normalize(vDirection); float h=max(d.y,0.); vec3 col=mix(vec3(.9,.8,.76),vec3(.36,.5,.68),pow(h,.5)); float a=max(dot(d,sunDirection),0.); col+=vec3(.55,.28,.12)*pow(a,6.)*(1.-h)+vec3(1.8,1.3,.8)*pow(a,1600.); gl_FragColor=vec4(col,1.);}`, sunDir);
  // The dome travels with the camera, so a far zoom-out at the map's edge never sees past it.
  sky.onBeforeRender = (r, sc, cam) => { sky.position.copy(cam.position); sky.updateMatrixWorld(); };
  scene.add(new THREE.HemisphereLight('#bcd2ec', '#6a7486', 1.05));
  const sun = new THREE.DirectionalLight('#ffbf8f', 3.9);
  sun.position.copy(sunDir).multiplyScalar(150); sun.target.position.set(0, 8, 20);
  sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -110, right: 110, top: 120, bottom: -100, near: 1, far: 400 });
  sun.shadow.bias = -.00018; sun.shadow.normalBias = .065; sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const bounce = new THREE.DirectionalLight('#a9c4e2', .5); bounce.position.set(-60, 40, 90); scene.add(bounce);
  skyLight(sky, .35);

  // ---- the fortress: a ring of walls on the plateau, a great keep against the mountain, the gate facing down the valley ----
  for (const k of ['stone', 'base', 'trim', 'roof', 'timber', 'plaster']) snowify(materials[k]);
  const court = new THREE.Shape(), enclosure = [[-27, -22], [-2, -31], [25, -24], [32, 2], [14, 25], [-14, 25], [-32, 2]];
  enclosure.forEach(([x, z], i) => i ? court.lineTo(x, -z) : court.moveTo(x, -z)); court.closePath();
  const courtMesh = mesh(new THREE.ShapeGeometry(court), snowify(new THREE.MeshStandardMaterial({ ...stoneMaps, color: '#b9b8ae', roughness: 1, bumpScale: .08 }), .8));
  courtMesh.rotation.x = -Math.PI / 2; courtMesh.position.y = BASE + .025; courtMesh.castShadow = false;
  for (let i = 0; i < enclosure.length; i++) {
    const a = enclosure[i], b = enclosure[(i + 1) % enclosure.length], gate = i === 4;
    curtain(a, b, gate);
  }
  enclosure.forEach(([x, z], i) => tower(x, z, i === 1 ? 4.8 : 3.4, [14, 16, 13, 12, 12.5, 12.5, 13][i], [1, 2, 6].includes(i)));
  keep(0, -12);
  const barracks = hall(19, -4, 9, 17, 9); barracks.rotation.y = .08;
  hall(-18, -3, 8, 14, 8.5);
  const gateCenter = new THREE.Vector3(0, BASE, 26.5);
  tower(-6.5, 28.6, 2.2, 11.5, true); tower(6.5, 28.6, 2.2, 11.5, true);
  const gatehouse = new THREE.Group(); gatehouse.position.copy(gateCenter); scene.add(gatehouse);
  facade(9, 9.6, 4.2, [{ x: 0, y: -.1, w: 3.8, h: 5.4, open: true }], gatehouse);
  for (const xx of [-1.55, -1.1, -.65, -.2, .2, .65, 1.1, 1.55]) box(.28, 3.25, .12, xx, 1.6, -3.7, materials.timber, gatehouse);
  for (const yy of [.75, 2.3]) box(3.8, .16, .16, 0, yy, -3.6, materials.iron, gatehouse);
  pitchedRoof(9.8, 5.6, 3.6, 0, 9.6, -1.6, gatehouse);
  for (let xx = -1.5; xx <= 1.5; xx += .45) box(.095, 2.5, .12, xx, 4.55, -1.9, materials.iron, gatehouse);
  flag(-1, BASE + 33, -13, .95); flag(-2, BASE + 16.5, -31, .8); flag(25, BASE + 13.5, -24, .75);
  // beacon braziers either side of the gate road
  for (const sx of [-1, 1]) { cylinder(.9, 1.2, 1.4, sx * 9, BASE + .7, 34, materials.base, 12); cylinder(.75, .55, .5, sx * 9, BASE + 1.6, 34, materials.iron, 12); }

  // roads: packed slush up the valley and from the lake shore to the gate
  // packed slush with cart ruts and hoof-churned middle; the edges fade into the snow
  const roadTex = canvasTexture(256, (c, s) => {
    const img = c.createImageData(s, s);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const v = y / s, edge = Math.min(1, Math.min(v, 1 - v) * 6), rut = Math.exp(-(((v - .3) * 22) ** 2)) + Math.exp(-(((v - .7) * 22) ** 2));
      const n = noise(x * .08, y * .08) * .6 + noise(x * .4, y * .4) * .4, i = (y * s + x) * 4;
      const l = 168 - rut * 48 - n * 26 + (Math.abs(v - .5) < .12 ? -10 * noise(x * .3, y * 1.3) : 0);
      img.data[i] = l; img.data[i + 1] = l * .97; img.data[i + 2] = l * .93;
      img.data[i + 3] = 255 * Math.min(1, edge ** 1.4 * (.75 + .5 * n));
    }
    c.putImageData(img, 0, 0);
  });
  const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: .95, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  pathRibbon(roadPts, 6.5, roadMat);
  pathRibbon(icePts.slice(4), 6, roadMat);   // shore to the junction; the valley road carries on to the gate

  // ---- the frozen lake: glossy ice with frost and cracks, drifts at the edge ----
  const iceTex = canvasTexture(512, (c, s) => {
    c.fillStyle = '#9fbccb'; c.fillRect(0, 0, s, s);
    for (let k = 0; k < 140; k++) { c.fillStyle = `rgba(235,244,250,${between(.05, .22)})`; c.beginPath(); c.ellipse(rand() * s, rand() * s, between(10, 70), between(4, 22), rand() * 3, 0, 6.3); c.fill(); }
    c.strokeStyle = 'rgba(240,248,255,.55)'; c.lineWidth = 1.2;
    for (let k = 0; k < 26; k++) { let x = rand() * s, y = rand() * s; c.beginPath(); c.moveTo(x, y); for (let j = 0; j < 7; j++) { x += between(-40, 40); y += between(-40, 40); c.lineTo(x, y); } c.stroke(); }
  });
  iceTex.repeat.set(3, 2);
  const iceShape = new THREE.Shape(); iceShape.absellipse(0, 0, LAKE.rx * 1.02, LAKE.rz * 1.02, 0, Math.PI * 2, false, 0);
  const iceMesh = mesh(new THREE.ShapeGeometry(iceShape, 64), new THREE.MeshStandardMaterial({ map: iceTex, roughness: .14, metalness: .05, envMapIntensity: 1.6 }));
  iceMesh.rotation.x = -Math.PI / 2; iceMesh.position.set(LAKE.x, ICE_Y, LAKE.z); iceMesh.castShadow = false;
  const iuv = iceMesh.geometry.attributes.uv, ipos = iceMesh.geometry.attributes.position;
  for (let i = 0; i < iuv.count; i++) iuv.setXY(i, ipos.getX(i) / 30, ipos.getY(i) / 30);

  // ---- a hamlet down the valley ----
  const cottages = [[-30, 150, 7, 10, 4.2, .4], [-36, 132, 6, 8, 3.6, -.3], [32, 120, 7, 10, 4, -.5], [36, 160, 6, 8, 3.5, .2]];
  for (const c of cottages) cottage(...c);
  const chimneys = cottages.map(([x, z, w, d, h, r]) => { const lx = -w * .23, lz = -d * .2, c = Math.cos(r), s = Math.sin(r); return [x + lx * c + lz * s, height(x, z) - .25 + h + 3.55, z - lx * s + lz * c, 1.6 + rand()]; });
  chimneys.push([19, BASE + 9 + 6.8, -9, 1.1], [-18, BASE + 8.5 + 6.6, -7, .9], [2.4, BASE + 29, -15.5, .9]);

  // ---- pines: tiers of drooping, star-shaped branch whorls; each whorl carries a snow layer with a hard lower edge ----
  const leafMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .92 });
  const barkMaterial = new THREE.MeshStandardMaterial({ color: '#4a3d30', roughness: 1 });
  function pine(tiers, seg, height0 = 11) {
    const pos = [], nor = [], col = [], green = new THREE.Color(), white = new THREE.Color('#eef2f6');
    const push = (p, n, c) => { pos.push(...p); nor.push(...n); col.push(c.r, c.g, c.b); };
    const step = height0 / (tiers + 1.2);
    for (let k = 0; k < tiers; k++) {
      const t = k / tiers, r = 3.0 * (1 - t * .78), h = step * 1.75, y0 = 1.4 + k * step, N = seg * 2, rot = k * 1.7 + rand();
      const ring = [];
      for (let j = 0; j < N; j++) {
        const a = rot + j / N * Math.PI * 2, tip = j % 2 === 0, rr = r * (tip ? between(.95, 1.08) : between(.55, .68));
        ring.push({ a, rr, y: y0 - (tip ? r * .16 : 0) });
      }
      const apex = [0, y0 + h, 0], under = [0, y0 + r * .1, 0], snowLine = between(.6, .74);
      for (let j = 0; j < N; j++) {
        const A = ring[j], B = ring[(j + 1) % N];
        const pt = (q, f, lift = 0) => [Math.cos(q.a) * q.rr * f, apex[1] + (q.y - apex[1]) * f + lift, Math.sin(q.a) * q.rr * f];
        const nrm = q => { const v = new THREE.Vector3(Math.cos(q.a), .62, Math.sin(q.a)).normalize(); return [v.x, v.y, v.z]; };
        green.setHSL(between(.36, .41), between(.2, .3), between(.15, .21) * (1 - t * .1));
        const dark = green.clone().multiplyScalar(.55);
        // snow band: apex → snow line, lifted slightly so its lower edge overhangs the needles
        push(apex, [0, 1, 0], white); push(pt(B, snowLine, .06), nrm(B), white); push(pt(A, snowLine, .06), nrm(A), white);
        // needles: snow line → branch tips (darker at the tips' undersides)
        push(pt(A, snowLine), nrm(A), green); push(pt(B, snowLine), nrm(B), green); push(pt(A, 1), nrm(A), dark);
        push(pt(B, snowLine), nrm(B), green); push(pt(B, 1), nrm(B), dark); push(pt(A, 1), nrm(A), dark);
        // underside, so low cameras never see through a whorl
        push(under, [0, -1, 0], dark.clone().multiplyScalar(.6)); push(pt(A, 1), [0, -1, 0], dark); push(pt(B, 1), [0, -1, 0], dark);
      }
    }
    // the leader shoot
    const tipY = 1.4 + tiers * step, tipH = step * 1.4;
    for (let j = 0; j < seg; j++) {
      const a = j / seg * Math.PI * 2, b = (j + 1) / seg * Math.PI * 2, r = .55;
      push([0, tipY + tipH, 0], [0, 1, 0], white); push([Math.cos(b) * r, tipY, Math.sin(b) * r], [Math.cos(b), .5, Math.sin(b)], white); push([Math.cos(a) * r, tipY, Math.sin(a) * r], [Math.cos(a), .5, Math.sin(a)], white);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return { foliage: g, bark: new THREE.CylinderGeometry(.18, .34, 3.4, 6).translate(0, 1.7, 0) };
  }
  const pines = [pine(6, 9, 12), pine(7, 9, 14), pine(5, 8, 10), pine(6, 8, 11)], farPines = [pine(4, 6, 12), pine(3, 6, 10)];
  const treeLocations = [];
  const tint = new THREE.Color();
  const plant = (x, z, s, t) => { const y = height(x, z) - .3, rot = rand() * 6.28; tint.setHSL(between(.3, .45), between(.05, .2), between(.82, 1)); treeLocations.push([x, z, s, instance(t.bark, barkMaterial, x, y, z, s, s, s, rot), instance(t.foliage, leafMaterial, x, y, z, s, s * between(.85, 1.2), s, rot, tint.clone())]); };
  for (let i = 0; i < 9000 && treeLocations.length < 2600; i++) {
    const x = between(-280, 300), z = between(-260, 300), d = openD(x, z), r = Math.hypot(x, z);
    if (r < 50 || lakeD(x, z) < 1.15 || height(x, z) > 95) continue;
    if (d < -4 && (noise(x * .04 + 8, z * .04) < .62 || roadD(x, z) < 12)) continue;    // open valley: scattered copses off the roads
    if (d > -4 && noise(x * .02, z * .02 + 3) < .32) continue;                        // slopes: forest with clearings
    const near = Math.hypot(x - 20, z - 90) < 140;
    plant(x, z, between(.75, 1.3), near ? pines[i % 4] : farPines[i % 2]);
  }

  // ---- boulders with snow caps ----
  const rockGeometry = new THREE.IcosahedronGeometry(1, 1), rp = rockGeometry.attributes.position;
  for (let i = 0; i < rp.count; i++) { const f = .8 + noise(rp.getX(i) * 3 + 5, rp.getZ(i) * 3 + rp.getY(i)) * .4; rp.setXYZ(i, rp.getX(i) * f, rp.getY(i) * f, rp.getZ(i) * f); }
  rockGeometry.computeVertexNormals();
  const rockMaterial = snowify(new THREE.MeshStandardMaterial({ color: '#6d6f74', roughness: 1 }));
  for (let i = 0; i < 420; i++) {
    const x = between(-160, 220), z = between(-40, 260);
    if (Math.hypot(x, z) < 48 || roadD(x, z) < 6 || lakeD(x, z) < 1.1) continue;
    const s = between(.5, 2.6), y = height(x, z), rot = rand() * 6;
    instance(rockGeometry, rockMaterial, x, y - s * .2, z, s * 1.3, s * .7, s, rot);
  }

  // ---- ground detail: dead grass through the snow, junipers, fallen logs, road stakes, reeds on the lake shore ----
  const offRoad = (x, z, m) => roadD(x, z) > m && lakeD(x, z) > 1.05 && Math.hypot(x, z) > 40;
  const grassPos = [], grassCol = [], gc = new THREE.Color();
  for (let i = 0; i < 70000; i++) {
    const x = between(-90, 120), z = between(-20, 260), y = height(x, z);
    if (y > 26 || !offRoad(x, z, 3.6) || noise(x * .06 + 4, z * .06) < .5 + rand() * .2) continue;
    const size = between(.25, .75), a = rand() * 6.28, dx = Math.cos(a) * .08, dz = Math.sin(a) * .08, lean = between(-.15, .15);
    grassPos.push(x - dx, y, z - dz, x + dx, y, z + dz, x + lean, y + size, z + lean * .5);
    gc.setHSL(between(.09, .13), between(.25, .4), between(.32, .48));
    for (let j = 0; j < 3; j++) grassCol.push(gc.r, gc.g, gc.b);
  }
  const grassG = new THREE.BufferGeometry(); grassG.setAttribute('position', new THREE.Float32BufferAttribute(grassPos, 3)); grassG.setAttribute('color', new THREE.Float32BufferAttribute(grassCol, 3)); grassG.computeVertexNormals();
  mesh(grassG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide })).castShadow = false;

  const juniper = new THREE.IcosahedronGeometry(1, 1), jp = juniper.attributes.position;
  for (let i = 0; i < jp.count; i++) { const f = .75 + noise(jp.getX(i) * 4 + 2, jp.getZ(i) * 4 + jp.getY(i) * 2) * .5; jp.setXYZ(i, jp.getX(i) * f, Math.max(-.2, jp.getY(i)) * f, jp.getZ(i) * f); }
  juniper.computeVertexNormals();
  const juniperMat = snowify(new THREE.MeshStandardMaterial({ color: '#33473a', roughness: 1 }));
  for (let i = 0; i < 900; i++) {
    const x = between(-120, 200), z = between(-30, 270), y = height(x, z);
    if (y > 40 || !offRoad(x, z, 5) || noise(x * .05 + 9, z * .05) < .45) continue;
    const s = between(.5, 1.3); instance(juniper, juniperMat, x, y + s * .15, z, s * between(1, 1.6), s * .7, s * between(1, 1.4), rand() * 6);
  }
  const logG = new THREE.CylinderGeometry(.35, .42, 1, 8).rotateZ(Math.PI / 2), logMat = snowify(new THREE.MeshStandardMaterial({ color: '#4d4033', roughness: 1 }));
  for (let i = 0; i < 70; i++) {
    const x = between(-100, 180), z = between(0, 250);
    if (!offRoad(x, z, 6) || height(x, z) > 30) continue;
    const l = between(3, 7); instance(logG, logMat, x, height(x, z) + .25, z, l, 1, 1, rand() * 6, null, 0, between(-.08, .08));
  }
  // marker stakes every few metres along both roads, red-banded tops for travellers in a whiteout
  const stake = new THREE.CylinderGeometry(.07, .09, 2.2, 5).translate(0, 1.1, 0), stakeTop = new THREE.CylinderGeometry(.1, .1, .35, 5).translate(0, 2.05, 0);
  const stakeMat = new THREE.MeshStandardMaterial({ color: '#5a4836', roughness: 1 }), redMat = new THREE.MeshStandardMaterial({ color: '#8c2a1e', roughness: .9 });
  for (const L of [road, ice]) for (let i = 10; i < L.length - 20; i += 12) {
    const p = L[i], q = L[i + 1], tx = q.x - p.x, tz = q.z - p.z, tl = Math.hypot(tx, tz) || 1;
    if (lakeD(p.x, p.z) < 1.1 || Math.hypot(p.x, p.z) < 55) continue;
    for (const side of [-1, 1]) {
      const x = p.x - tz / tl * 4.2 * side, z = p.z + tx / tl * 4.2 * side, y = height(x, z) - .2, lean = between(-.08, .08);
      instance(stake, stakeMat, x, y, z, 1, between(.85, 1.1), 1, 0, null, lean, lean); instance(stakeTop, redMat, x, y, z, 1, 1, 1, 0, null, lean, lean);
    }
  }
  const reed = new THREE.ConeGeometry(.05, 1, 3).translate(0, .5, 0), reedMat = new THREE.MeshStandardMaterial({ color: '#7a6a4a', roughness: 1 });
  for (let i = 0; i < 900; i++) {
    const a = rand() * 6.28, d = between(.97, 1.12), x = LAKE.x + Math.cos(a) * LAKE.rx * d, z = LAKE.z + Math.sin(a) * LAKE.rz * d;
    if (roadD(x, z) < 4 || noise(Math.cos(a) * 3 + 5, Math.sin(a) * 3) < .4) continue;
    instance(reed, reedMat, x, Math.max(height(x, z), ICE_Y) - .05, z, 1, between(.6, 1.6), 1, 0, null, between(-.25, .25), between(-.25, .25));
  }

  // ---- ravens over the pass ----
  const birds = [], birdMaterial = new THREE.MeshBasicMaterial({ color: '#2a2c30', side: THREE.DoubleSide });
  for (let i = 0; i < 7; i++) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -1, .1, .22, -.3, 0, -.25, 0, 0, 0, .3, 0, -.25, 1, .1, .22], 3)); g.computeVertexNormals();
    const b = mesh(g, birdMaterial); b.castShadow = false; b.scale.setScalar(1.2); birds.push({ mesh: b, angle: rand() * 6.28, radius: between(30, 60), high: between(48, 64) });
  }

  // ---- build pads: alternate sides along both lanes, on firm level ground off the road ----
  const padSpots = padsAlong([[road, 34, 30], [ice, 30, 25]], [9, 10.5, 12],
    (x, z, lo, hi) => hi - lo <= 3.4 && roadD(x, z) >= 7.5 && lakeD(x, z) >= 1.12 && Math.hypot(x, z) >= 37);

  const fires = [[-6.5, BASE + 12, 28.6, 1], [0, BASE + 10.2, 26, 1], [6.5, BASE + 12, 28.6, 2], [-14, BASE + 9.5, 25, 2], [14, BASE + 9.5, 25, 2], [19, BASE + 12, -4, 2],
    [-32, BASE + 13, 2, 3], [32, BASE + 12.5, 2, 3], [0, BASE + 24, -12, 3], [-18, BASE + 11, -3, 3], [-2, BASE + 16, -31, 3]];
  return {
    height, BASE, gateCenter, sun, terrain, water: null, treeLocations, snowify,
    bridgeDeck: { x0: Infinity, x1: -Infinity, z: 0, halfWidth: 0, y: 0 },   // no bridge here
    lanePaths: [road, ice], laneNames: ['valley road', 'frozen lake'],
    padSpots,
    view: { position: new THREE.Vector3(40, 92, 170), target: new THREE.Vector3(6, 18, 14) },
    titleView: [4, 20, 6, 30, 58, 128],
    fortPoints: [[-36, BASE, -34], [36, BASE, -34], [-36, BASE, 34], [36, BASE, 34], [-30, BASE + 34, -30], [30, BASE + 34, -30], [-30, BASE + 30, 30], [30, BASE + 30, 30]],
    mist: { color: '#d3dce6', glsl: 'float mist=.2*exp(-max(world.y-5.,0.)*.08)*smoothstep(80.,320.,-view.z);' },
    fx: { chimneys, fires, smoke: [[0, BASE + 24, -12], [0, BASE + 11, 27], [19, BASE + 13, -4], [-18, BASE + 12, -3], [-32, BASE + 13, 2]], ambient: 'snow' },
    moving: [sky, ...flags.map(f => f.mesh), ...birds.map(b => b.mesh)],
    animate(time) {
      waveFlags(time, [2.6, 3.4, .12, 3, .04]);
      for (let i = 0; i < birds.length; i++) {
        const b = birds[i], a = b.angle + time * .03;
        b.mesh.position.set(Math.cos(a) * b.radius + 10, b.high + Math.sin(time * .4 + i) * .6, Math.sin(a) * b.radius + 30); b.mesh.rotation.y = -a; b.mesh.rotation.z = Math.sin(time + i) * .1;
        const p = b.mesh.geometry.attributes.position; p.setY(1, Math.sin(time * 2.6 + i) * .3); p.setY(5, Math.sin(time * 2.6 + i) * .3); p.needsUpdate = true;
      }
    },
  };
}
