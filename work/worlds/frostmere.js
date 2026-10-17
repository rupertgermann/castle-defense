import { fortKit } from './fort-kit.js';
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

  // ---- terrain: snow on the flats, wind-scoured rock on steep faces, slush on the road, ice on the lake ----
  const terrainGeometry = new THREE.PlaneGeometry(900, 900, 420, 420).rotateX(-Math.PI / 2);
  const tp = terrainGeometry.attributes.position;
  for (let i = 0; i < tp.count; i++) tp.setY(i, height(tp.getX(i), tp.getZ(i)));
  terrainGeometry.computeVertexNormals();
  const tn = terrainGeometry.attributes.normal, colors = [];
  const snow = new THREE.Color('#e4eaf0'), snowShade = new THREE.Color('#c9d3de'), rock = new THREE.Color('#5c5f66'), rockWarm = new THREE.Color('#6e655c');
  const scrub = new THREE.Color('#7b7a62'), slush = new THREE.Color('#9a958a'), iceC = new THREE.Color('#a9c2d0');
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i), z = tp.getZ(i), y = tp.getY(i), ny = tn.getY(i);
    const c = snow.clone().lerp(snowShade, fbm(x * .05, z * .05));
    c.lerp(scrub, smooth(.55, .9, noise(x * .06 + 4, z * .06)) * (1 - smooth(9, 22, y)) * .55);         // bare patches low down
    c.lerp(rock.clone().lerp(rockWarm, noise(x * .03, z * .03)), smooth(.86, .7, ny));                 // steep faces shed snow
    if (Math.hypot(x, z) < 34) c.lerp(slush, .35);
    c.lerp(iceC, 1 - smooth(.95, 1.05, lakeD(x, z)));
    c.multiplyScalar(.93 + .12 * noise(x * .8, z * .8));
    colors.push(c.r, c.g, c.b);
  }
  terrainGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const groundBump = canvasTexture(256, (c, s) => {
    const a = c.createImageData(s, s);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) { const i = (y * s + x) * 4, v = 120 + rand() * 40 + noise(x * .12, y * .12) * 80; a.data[i] = a.data[i + 1] = a.data[i + 2] = v; a.data[i + 3] = 255; }
    c.putImageData(a, 0, 0);
  }, false);
  groundBump.repeat.set(200, 200);
  const terrain = mesh(terrainGeometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .93, bumpMap: groundBump, bumpScale: .18 }));
  terrain.castShadow = false;

  // ---- cold dawn: low warm sun on the peaks, blue shadow, pale mist in the valley ----
  scene.fog = new THREE.FogExp2('#cfd8e2', .0009);
  const sunDir = new THREE.Vector3(.72, .22, -.66).normalize();
  const sky = mesh(new THREE.SphereGeometry(950, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { sunDirection: { value: sunDir } },
    vertexShader: 'varying vec3 vDirection; void main(){vDirection=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec3 vDirection; uniform vec3 sunDirection;
      void main(){vec3 d=normalize(vDirection); float h=max(d.y,0.); vec3 col=mix(vec3(.9,.8,.76),vec3(.36,.5,.68),pow(h,.5)); float a=max(dot(d,sunDirection),0.); col+=vec3(.55,.28,.12)*pow(a,6.)*(1.-h)+vec3(1.8,1.3,.8)*pow(a,1600.); gl_FragColor=vec4(col,1.);}`,
  }));
  sky.castShadow = sky.receiveShadow = false;
  scene.add(new THREE.HemisphereLight('#c6d8ec', '#7c8696', 1.3));
  const sun = new THREE.DirectionalLight('#ffc89e', 3.3);
  sun.position.copy(sunDir).multiplyScalar(150); sun.target.position.set(0, 8, 20);
  sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -110, right: 110, top: 120, bottom: -100, near: 1, far: 400 });
  sun.shadow.bias = -.00018; sun.shadow.normalBias = .065; sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const bounce = new THREE.DirectionalLight('#a9c4e2', .5); bounce.position.set(-60, 40, 90); scene.add(bounce);
  const envScene = new THREE.Scene(); envScene.add(new THREE.Mesh(sky.geometry, sky.material));
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, .08, .1, 1200).texture; scene.environmentIntensity = .35; pmrem.dispose();

  // ---- the fortress: a ring of walls on the plateau, a great keep against the mountain, the gate facing down the valley ----
  const { curtain, tower, keep, hall, flag, flags, pathRibbon, cottage } = fortKit(K, BASE, height);
  const snowMat = new THREE.MeshStandardMaterial({ color: '#eef3f8', roughness: .82 });
  const court = new THREE.Shape(), enclosure = [[-27, -22], [-2, -31], [25, -24], [32, 2], [14, 25], [-14, 25], [-32, 2]];
  enclosure.forEach(([x, z], i) => i ? court.lineTo(x, -z) : court.moveTo(x, -z)); court.closePath();
  const courtMesh = mesh(new THREE.ShapeGeometry(court), new THREE.MeshStandardMaterial({ ...stoneMaps, color: '#b9b8ae', roughness: 1, bumpScale: .08 }));
  courtMesh.rotation.x = -Math.PI / 2; courtMesh.position.y = BASE + .025; courtMesh.castShadow = false;
  for (let i = 0; i < enclosure.length; i++) {
    const a = enclosure[i], b = enclosure[(i + 1) % enclosure.length], gate = i === 4;
    curtain(a, b, gate);
    // drifted snow on the wall-walk
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), g = new THREE.Group(); g.position.set((a[0] + b[0]) / 2, BASE, (a[1] + b[1]) / 2); g.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]); scene.add(g);
    box(len - 1, .22, 1.9, 0, 8.82, -.6, snowMat, g);
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
  const roadMat = new THREE.MeshStandardMaterial({ color: '#a29c90', roughness: 1, bumpMap: stoneMaps.bumpMap, bumpScale: .05, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  pathRibbon(roadPts, 5, roadMat);
  pathRibbon(icePts.slice(4), 4.5, roadMat);   // shore to the junction; the valley road carries on to the gate

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
  // snow on the cottage roofs
  for (const [x, z, w, d, h, r] of cottages) { const g = new THREE.Group(); g.position.set(x, height(x, z) - .25, z); g.rotation.y = r; scene.add(g); for (const side of [-1, 1]) { const s = box(w * .56, .16, d + .9, side * w * .26, h + h * .4, 0, snowMat, g); s.rotation.z = -side * Math.atan2(h * .74, (w + 1) / 2); } }

  // ---- pines: stacked cones, snow on the upper faces ----
  const leafMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9, flatShading: true });
  const barkMaterial = new THREE.MeshStandardMaterial({ color: '#4a3d30', roughness: 1 });
  function pine(tiers, seg) {
    const parts = [], col = new THREE.Color();
    for (let k = 0; k < tiers; k++) {
      const t = k / tiers, r = 2.6 * (1 - t * .72), h = 3.6 - t * 1.2, y = 2.2 + k * 2.3;
      const g = new THREE.ConeGeometry(r, h, seg, 1, true).toNonIndexed(); g.translate(0, y + h / 2, 0); g.rotateY(k * 1.3);
      const p = g.attributes.position, c = [];
      for (let i = 0; i < p.count; i++) { const up = (p.getY(i) - y) / h; col.set('#2c4434').lerp(new THREE.Color('#203427'), rand()); if (up > .55 || (up > .1 && rand() < .35)) col.set('#e8eef4'); c.push(col.r, col.g, col.b); }
      g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); g.deleteAttribute('uv'); parts.push(g);
    }
    const tip = new THREE.ConeGeometry(.7, 2.2, seg).toNonIndexed(); tip.translate(0, 2.2 + tiers * 2.3 + .9, 0);
    tip.setAttribute('color', new THREE.Float32BufferAttribute(new Array(tip.attributes.position.count * 3).fill(.9), 3)); tip.deleteAttribute('uv'); parts.push(tip);
    const g = mergeGeometries(parts); g.computeVertexNormals();
    return { foliage: g, bark: new THREE.CylinderGeometry(.22, .38, 3.2, 6).translate(0, 1.6, 0) };
  }
  const pines = [pine(4, 8), pine(5, 8), pine(3, 7)], farPines = [pine(3, 5), pine(2, 5)];
  const treeLocations = [];
  const plant = (x, z, s, t) => { const y = height(x, z) - .3, rot = rand() * 6.28; treeLocations.push([x, z, s, instance(t.bark, barkMaterial, x, y, z, s, s, s, rot), instance(t.foliage, leafMaterial, x, y, z, s, s * between(.9, 1.15), s, rot)]); };
  for (let i = 0; i < 9000 && treeLocations.length < 2600; i++) {
    const x = between(-280, 300), z = between(-260, 300), d = openD(x, z), r = Math.hypot(x, z);
    if (r < 50 || lakeD(x, z) < 1.15 || height(x, z) > 95) continue;
    if (d < -4 && (noise(x * .04 + 8, z * .04) < .62 || roadD(x, z) < 12)) continue;    // open valley: scattered copses off the roads
    if (d > -4 && noise(x * .02, z * .02 + 3) < .32) continue;                        // slopes: forest with clearings
    const near = Math.hypot(x - 20, z - 90) < 140;
    plant(x, z, between(.8, 1.3), near ? pines[i % 3] : farPines[i % 2]);
  }

  // ---- boulders with snow caps ----
  const rockGeometry = new THREE.IcosahedronGeometry(1, 1), rp = rockGeometry.attributes.position;
  for (let i = 0; i < rp.count; i++) { const f = .8 + noise(rp.getX(i) * 3 + 5, rp.getZ(i) * 3 + rp.getY(i)) * .4; rp.setXYZ(i, rp.getX(i) * f, rp.getY(i) * f, rp.getZ(i) * f); }
  rockGeometry.computeVertexNormals();
  const rockMaterial = new THREE.MeshStandardMaterial({ color: '#6d6f74', roughness: 1 });
  const capGeometry = new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI * .32);
  for (let i = 0; i < 420; i++) {
    const x = between(-160, 220), z = between(-40, 260);
    if (Math.hypot(x, z) < 48 || roadD(x, z) < 6 || lakeD(x, z) < 1.1) continue;
    const s = between(.5, 2.6), y = height(x, z), rot = rand() * 6;
    instance(rockGeometry, rockMaterial, x, y - s * .2, z, s * 1.3, s * .7, s, rot);
    instance(capGeometry, snowMat, x, y - s * .2 + s * .1, z, s * 1.2, s * .55, s * .95, rot);
  }

  // ---- ravens over the pass ----
  const birds = [], birdMaterial = new THREE.MeshBasicMaterial({ color: '#2a2c30', side: THREE.DoubleSide });
  for (let i = 0; i < 7; i++) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -1, .1, .22, -.3, 0, -.25, 0, 0, 0, .3, 0, -.25, 1, .1, .22], 3)); g.computeVertexNormals();
    const b = mesh(g, birdMaterial); b.castShadow = false; b.scale.setScalar(1.2); birds.push({ mesh: b, angle: rand() * 6.28, radius: between(30, 60), high: between(48, 64) });
  }

  // ---- build pads: alternate sides along both lanes, on firm level ground off the road ----
  const padSpots = [];
  for (const [L, every, skip] of [[road, 34, 30], [ice, 30, 25]]) {
    for (let i = skip; i < L.length - 8; i += every) {
      const p = L[i], q = L[Math.min(L.length - 1, i + 3)], tx = q.x - p.x, tz = q.z - p.z, tl = Math.hypot(tx, tz) || 1;
      for (const side of (i / every) % 2 < 1 ? [1, -1] : [-1, 1]) {
        let ok = null;
        for (const off of [9, 10.5, 12]) {
          const x = p.x - tz / tl * off * side, z = p.z + tx / tl * off * side;
          let lo = Infinity, hi = -Infinity;
          for (let k = 0; k < 9; k++) { const a = k * Math.PI / 4, rr = k ? 4.2 : 0, h = height(x + Math.cos(a) * rr, z + Math.sin(a) * rr); lo = Math.min(lo, h); hi = Math.max(hi, h); }
          if (hi - lo > 3.4 || roadD(x, z) < 7.5 || lakeD(x, z) < 1.12 || Math.hypot(x, z) < 37 || padSpots.some(([px, pz]) => Math.hypot(px - x, pz - z) < 13)) continue;
          ok = [Math.round(x), Math.round(z)]; break;
        }
        if (ok) { padSpots.push(ok); break; }
      }
    }
  }

  const fires = [[-6.5, BASE + 12, 28.6, 1], [0, BASE + 10.2, 26, 1], [6.5, BASE + 12, 28.6, 2], [-14, BASE + 9.5, 25, 2], [14, BASE + 9.5, 25, 2], [19, BASE + 12, -4, 2],
    [-32, BASE + 13, 2, 3], [32, BASE + 12.5, 2, 3], [0, BASE + 24, -12, 3], [-18, BASE + 11, -3, 3], [-2, BASE + 16, -31, 3]];
  return {
    height, BASE, gateCenter, sun, terrain, water: null, treeLocations,
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
      for (const f of flags) {
        const p = f.mesh.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) { const x = f.original[i * 3], y = f.original[i * 3 + 1]; p.setZ(i, Math.sin(x * 2.6 - time * 3.4 + y * .4) * x * .12); p.setY(i, y + Math.sin(x * 2 - time * 3) * x * .04); }
        p.needsUpdate = true; f.mesh.geometry.computeVertexNormals();
      }
      for (let i = 0; i < birds.length; i++) {
        const b = birds[i], a = b.angle + time * .03;
        b.mesh.position.set(Math.cos(a) * b.radius + 10, b.high + Math.sin(time * .4 + i) * .6, Math.sin(a) * b.radius + 30); b.mesh.rotation.y = -a; b.mesh.rotation.z = Math.sin(time + i) * .1;
        const p = b.mesh.geometry.attributes.position; p.setY(1, Math.sin(time * 2.6 + i) * .3); p.setY(5, Math.sin(time * 2.6 + i) * .3); p.needsUpdate = true;
      }
    },
  };
}
