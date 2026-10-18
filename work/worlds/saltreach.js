import { fortKit } from './fort-kit.js';
// Level 3: Saltreach, a sea fortress on a headland at sunset. Three approaches meet below the gate: raiders land on the
// beach from longships (west), a column marches the cliff road (east), and a host crosses the causeway from the tidal
// islet (south). Built with the engine kit; returns the same world facts as castle.js.
export function buildSaltreach(K) {
  const { THREE, scene, renderer, rand, between, smooth, noise, fbm, canvasTexture, stoneMaps, materials, instance, mesh, box, cylinder, beam, facade, tiledCone, pitchedRoof, mergeGeometries, Water } = K;
  const BASE = 20, SEA = .6;

  // ---- lanes first: the land is shaped around them (causeway raised, roads graded) ----
  const curvePoints = (pts, n) => new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z))).getSpacedPoints(n);
  const gateRoad = [[6, 64], [3, 50], [0, 38], [0, 27]];
  const beachPts = [[-58, 150], [-46, 140], [-34, 124], [-23, 104], [-12, 84], [6, 64]];
  const cliffPts = [[188, -34], [156, -18], [128, 2], [100, 26], [70, 48], [38, 62], [6, 64]];
  const causewayPts = [[80, 268], [70, 240], [58, 212], [48, 184], [38, 150], [26, 114], [14, 86], [6, 64]];
  const lanePaths = [beachPts, cliffPts, causewayPts].map(p => curvePoints([...p, ...gateRoad.slice(1)], Math.round(p.length * 90)));
  // Distance-to-polyline lookups on a 1 m grid, capped at 24 m (every caller only asks "is it within a few metres").
  function distGrid(lists) {
    const N = 900, half = 450, cap = 24, g = new Float32Array(N * N).fill(cap);
    for (const L of lists) for (const p of L) {
      const ci = Math.round(p.x + half), cj = Math.round(p.z + half);
      for (let j = Math.max(0, cj - cap); j <= Math.min(N - 1, cj + cap); j++) for (let i = Math.max(0, ci - cap); i <= Math.min(N - 1, ci + cap); i++) {
        const d = Math.hypot(i - half - p.x, j - half - p.z); if (d < g[j * N + i]) g[j * N + i] = d;
      }
    }
    return (x, z) => { const i = Math.round(x + half), j = Math.round(z + half); return i < 0 || j < 0 || i >= N || j >= N ? cap : g[j * N + i]; };
  }
  const thin = L => L.filter((_, i) => i % 2 === 0);
  const roadD = distGrid(lanePaths.map(thin)), causewayD = distGrid([thin(lanePaths[2].slice(0, lanePaths[2].length >> 1))]);

  // ---- landform: a headland with sea cliffs to the west, a beach bay south-west, tidal shallows to the south ----
  const westCoast = z => -52 + 9 * Math.sin(z * .027) + 5 * Math.sin(z * .071 + 2);
  const southCoast = x => 168 + 14 * Math.sin(x * .021 + 1) + 6 * Math.sin(x * .06);
  // Signed distance (m, roughly) into the land: positive on land, negative at sea.
  function landD(x, z) {
    const west = x - westCoast(z), south = southCoast(x) - z;
    const bay = Math.hypot((x + 82) / 1.1, (z - 150) / .8) - 27;
    const islet = 38 + 16 * (noise(x * .035 + 4, z * .035 + 9) - .5) + 5 * (noise(x * .11, z * .11) - .5) - Math.hypot((x - 80) / 1.15, z - 266);
    return Math.max(Math.min(west, south, bay), islet);
  }
  const beachness = (x, z) => smooth(58, 92, z) * (1 - smooth(110, 150, x));   // gentle sand shores in the bay and south; cliffs elsewhere
  function height(x, z) {
    const d = landD(x, z);
    let land = 7 + 5 * fbm(x * .018 + 4, z * .018 + 2) + 1.5 * noise(x * .08, z * .08);
    land += smooth(70, 260, x - z * .2) * (14 + 40 * fbm(x * .008 + 7, z * .008 + 1));       // rolling downs inland
    const r = Math.hypot(x, z * 1.05);
    land = THREE.MathUtils.lerp(land, BASE, 1 - smooth(36, 70, r));                          // the headland rises to the fort
    const b = beachness(x, z), ramp = THREE.MathUtils.lerp(4.5, 46, b);
    const shore = SEA - .25 + b * .2;
    let h = d > 0 ? THREE.MathUtils.lerp(shore, land, smooth(0, ramp, d) ** (b > .5 ? 1.3 : .55)) : shore - Math.min(14, -d * THREE.MathUtils.lerp(.35, .14, b)) - .3;
    if (d <= 0 || h < SEA + 1.4) {                                                             // the causeway: a raised stone way through the shallows
      const c = causewayD(x, z);
      if (c < 5.5) h = Math.max(h, THREE.MathUtils.lerp(SEA + 1.1, h, smooth(3.4, 5.5, c)));
    }
    return h;
  }

  // ---- terrain: sea-washed sand, golden turf, chalky cliff faces ----
  const turf = new THREE.Color('#4d6631'), turfHi = new THREE.Color('#8c9450'), sand = new THREE.Color('#c9b48a'), wetSand = new THREE.Color('#7d6d55'), chalk = new THREE.Color('#b9ab92'), seabed = new THREE.Color('#3c5a52'), path = new THREE.Color('#9d8a68');
  const terrainMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .96 });
  const groundBump = canvasTexture(256, (c, s) => {
    const a = c.createImageData(s, s);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) { const i = (y * s + x) * 4, v = 100 + rand() * 70 + noise(x * .16, y * .16) * 70; a.data[i] = a.data[i + 1] = a.data[i + 2] = v; a.data[i + 3] = 255; }
    c.putImageData(a, 0, 0);
  }, false);
  groundBump.repeat.set(220, 220); terrainMaterial.bumpMap = groundBump; terrainMaterial.bumpScale = .22;
  function makeTerrain(size, segs, sink) {
    const g = new THREE.PlaneGeometry(size, size, segs, segs).rotateX(-Math.PI / 2), p = g.attributes.position, colors = [];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), inner = sink ? 1 - smooth(400, 445, Math.max(Math.abs(x), Math.abs(z))) : 0, y = height(x, z);
      p.setY(i, y - inner * sink);
      const c = turf.clone().lerp(turfHi, fbm(x * .04, z * .04) * .9);
      // steep ground shows chalk: estimate slope from neighbours
      const slope = Math.hypot(height(x + 1.5, z) - y, height(x, z + 1.5) - y) / 1.5;
      c.lerp(chalk, smooth(.55, 1.1, slope) * .9);
      c.lerp(sand, (1 - smooth(SEA + 1.2, SEA + 4.5, y)) * (.4 + .6 * beachness(x, z)));
      c.lerp(wetSand, 1 - smooth(SEA - .1, SEA + .7, y));
      c.lerp(seabed, 1 - smooth(SEA - 2.5, SEA - .6, y));
      if (sink === 0 && roadD(x, z) < 3.4 && y > SEA + .9) c.lerp(path, .75);
      if (Math.hypot(x, z) < 34) c.lerp(path, .35);
      c.multiplyScalar(.9 + .16 * noise(x * .9, z * .9));
      colors.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); g.computeVertexNormals();
    const m = mesh(g, terrainMaterial); m.castShadow = false; return m;
  }
  const terrain = makeTerrain(900, 420, 0);
  makeTerrain(2600, 180, 14).receiveShadow = false;

  const cottages = [[-36, 96, 6.5, 9, 3.9, .7], [-48, 112, 6, 8, 3.6, .4], [-14, 120, 7, 10, 4.1, -.4], [30, 96, 6, 8.5, 3.6, -.2], [44, 120, 6.5, 9, 3.8, .3]];
  // ---- build pads: alternate sides along all three lanes, on firm, dry, level ground off the road ----
  const padSpots = [];
  for (const [L, every, skip] of [[lanePaths[0], 26, 12], [lanePaths[1], 40, 22], [lanePaths[2], 28, 30]]) {
    for (let i = skip; i < L.length - 8; i += every) {
      const p = L[i], q = L[Math.min(L.length - 1, i + 3)], tx = q.x - p.x, tz = q.z - p.z, tl = Math.hypot(tx, tz) || 1;
      for (const side of (i / every) % 2 < 1 ? [1, -1] : [-1, 1]) {
        let ok = null;
        for (const off of [9, 10.5, 12, 14]) {
          const x = p.x - tz / tl * off * side, z = p.z + tx / tl * off * side;
          let lo = Infinity, hi = -Infinity;
          for (let k = 0; k < 9; k++) { const a = k * Math.PI / 4, rr = k ? 4.2 : 0, h = height(x + Math.cos(a) * rr, z + Math.sin(a) * rr); lo = Math.min(lo, h); hi = Math.max(hi, h); }
          if (hi - lo > 3.2 || lo < SEA + 1.2 || roadD(x, z) < 7.5 || Math.hypot(x, z) < 36 || cottages.some(([cx, cz]) => Math.hypot(cx - x, cz - z) < 11) || padSpots.some(([px, pz]) => Math.hypot(px - x, pz - z) < 13)) continue;
          ok = [Math.round(x), Math.round(z)]; break;
        }
        if (ok) { padSpots.push(ok); break; }
      }
    }
  }
  // Siege sites by the junction: far enough off the shared gate road that a trebuchet's dead zone doesn't swallow it.
  const levelAt = (x, z) => { let lo = Infinity, hi = -Infinity; for (let k = 0; k < 9; k++) { const a = k * Math.PI / 4, rr = k ? 4.2 : 0, h = height(x + Math.cos(a) * rr, z + Math.sin(a) * rr); lo = Math.min(lo, h); hi = Math.max(hi, h); } return hi - lo < 3.2 && lo > SEA + 1.2; };
  const laneD = (x, z) => lanePaths.map(L => { let b = Infinity; for (let i = 0; i < L.length; i += 4) b = Math.min(b, Math.hypot(L[i].x - x, L[i].z - z)); return b; });
  const cands = [];
  for (let x = -34; x <= 44; x += 3) for (let z = 34; z <= 110; z += 3) {
    const d = laneD(x, z), near = Math.min(...d);
    if (near < 12.5 || near > 20 || Math.hypot(x, z) < 40 || !levelAt(x, z) || cottages.some(([cx, cz]) => Math.hypot(cx - x, cz - z) < 11)) continue;
    cands.push([x, z, d.reduce((a, b) => a + Math.min(b, 40), 0)]);   // lower = closer to all three roads
  }
  cands.sort((a, b) => a[2] - b[2]);
  let added = 0;
  for (const [x, z] of cands) { if (added >= 4) break; if (padSpots.some(([px, pz]) => Math.hypot(px - x, pz - z) < 13)) continue; padSpots.push([x, z]); added++; }
  const nearPad = (x, z, r) => padSpots.some(([px, pz]) => Math.hypot(px - x, pz - z) < r);


  // ---- sunset: low copper sun over the sea in the north-west, violet sky, warm haze ----
  scene.fog = new THREE.FogExp2('#d9a98c', .00118);
  const sunDir = new THREE.Vector3(-.78, .14, -.62).normalize();
  const sky = mesh(new THREE.SphereGeometry(950, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { sunDirection: { value: sunDir } },
    vertexShader: 'varying vec3 vDirection; void main(){vDirection=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec3 vDirection; uniform vec3 sunDirection;
      void main(){vec3 d=normalize(vDirection); float h=max(d.y,0.); float a=max(dot(d,sunDirection),0.);
        vec3 col=mix(vec3(1.,.68,.48),vec3(.3,.44,.64),pow(h,.42)); col=mix(col,vec3(.98,.5,.42),(1.-h)*.35*(1.-a));
        col+=vec3(.95,.42,.12)*pow(a,5.)*(1.-h*.6)+vec3(1.,.55,.2)*pow(a,60.)*.6+vec3(3.,1.9,.9)*smoothstep(.9994,.9997,a);
        float band=1.-smoothstep(0.,.14,d.y); col=mix(col,vec3(1.,.56,.3),band*.55*(.35+.65*a)); col=mix(col,vec3(.42,.36,.62),smoothstep(.25,.7,d.y)*.5);
        gl_FragColor=vec4(col,1.);}`,
  }));
  sky.castShadow = sky.receiveShadow = false;
  sky.onBeforeRender = (r, sc, cam) => { sky.position.copy(cam.position); sky.updateMatrixWorld(); };
  scene.add(new THREE.HemisphereLight('#9aa6d6', '#4a3a34', 1.15));
  const sun = new THREE.DirectionalLight('#ffa560', 4.6);
  sun.position.copy(sunDir).multiplyScalar(160); sun.target.position.set(10, 8, 40);
  sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -170, right: 170, top: 170, bottom: -150, near: 1, far: 520 });
  sun.shadow.bias = -.00018; sun.shadow.normalBias = .065; sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const bounce = new THREE.DirectionalLight('#8a8fd8', .55); bounce.position.set(70, 40, 90); scene.add(bounce);
  const envScene = new THREE.Scene(); envScene.add(new THREE.Mesh(sky.geometry, sky.material));
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, .08, .1, 1200).texture; scene.environmentIntensity = .32; pmrem.dispose();

  // ---- the sea: reflective water, plus a shallows layer that tints the shelf and draws surf lines along every shore ----
  // Tileable fractal value noise (lattice wraps at the tile edge), turned into normals by finite differences:
  // organic ripples with no grid or moiré.
  const lattice = Array.from({ length: 4 }, (_, o) => { const n = 8 << o; return { n, v: Float32Array.from({ length: n * n }, rand) }; });
  const vnoise = (L, u, v) => {
    const x = u * L.n, y = v * L.n, xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const at = (i, j) => L.v[((j % L.n + L.n) % L.n) * L.n + ((i % L.n + L.n) % L.n)];
    return (at(xi, yi) * (1 - sx) + at(xi + 1, yi) * sx) * (1 - sy) + (at(xi, yi + 1) * (1 - sx) + at(xi + 1, yi + 1) * sx) * sy;
  };
  const wh = (u, v) => vnoise(lattice[0], u, v) * .4 + vnoise(lattice[1], u + .37, v + .11) * .3 + vnoise(lattice[2], u + .71, v + .53) * .2 + vnoise(lattice[3], u + .19, v + .83) * .1;
  const waterNormals = canvasTexture(256, (c, s) => {
    const p = c.createImageData(s, s), e = 1 / s;
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const u = x / s, v = y / s, dx = (wh(u + e, v) - wh(u - e, v)) * 9, dy = (wh(u, v + e) - wh(u, v - e)) * 9;
      const i = (y * s + x) * 4; p.data[i] = 128 + THREE.MathUtils.clamp(dx * 127, -120, 120); p.data[i + 1] = 128 + THREE.MathUtils.clamp(dy * 127, -120, 120); p.data[i + 2] = 255; p.data[i + 3] = 255;
    }
    c.putImageData(p, 0, 0);
  }, false);
  waterNormals.repeat.set(140, 140);
  const water = new Water(new THREE.PlaneGeometry(2600, 2600, 1, 1), { textureWidth: 768, textureHeight: 768, waterNormals, sunDirection: sunDir.clone(), sunColor: '#a8703f', waterColor: '#1c4a58', distortionScale: .9, fog: true });
  water.material.fragmentShader = water.material.fragmentShader.replace('float rf0 = 0.3;', 'float rf0 = 0.045;');
  water.rotation.x = -Math.PI / 2; water.position.y = SEA; water.castShadow = false; water.material.uniforms.size.value = 3.2; scene.add(water);
  // Height field of the shelf (≈1.75 m per texel) for the shallows shader.
  const HF = 512, HSPAN = 900, hData = new Uint8Array(HF * HF * 4);
  for (let j = 0; j < HF; j++) for (let i = 0; i < HF; i++) {
    const x = -HSPAN / 2 + (i + .5) / HF * HSPAN, z = -HSPAN / 2 + (j + .5) / HF * HSPAN, depth = THREE.MathUtils.clamp(SEA - height(x, z), -2, 14);
    const k = (j * HF + i) * 4; hData[k] = Math.round((depth + 2) / 16 * 255); hData[k + 1] = Math.round(noise(x * .05, z * .05) * 255); hData[k + 3] = 255;
  }
  const hTex = new THREE.DataTexture(hData, HF, HF); hTex.magFilter = hTex.minFilter = THREE.LinearFilter; hTex.needsUpdate = true;
  const shallows = new THREE.Mesh(new THREE.PlaneGeometry(HSPAN, HSPAN, 1, 1).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: { hTex: { value: hTex }, time: { value: 0 }, span: { value: HSPAN }, ...THREE.UniformsLib.fog },
    vertexShader: `varying vec2 vUv; varying vec3 vW; #include <fog_pars_vertex>
      void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; vec4 mvPosition=viewMatrix*w; gl_Position=projectionMatrix*mvPosition; #include <fog_vertex> }`.replace(/#include <(\w+)>/g, '\n#include <$1>\n'),
    fragmentShader: `uniform sampler2D hTex; uniform float time; varying vec2 vUv; varying vec3 vW; #include <fog_pars_fragment>
      void main(){
        vec4 t=texture2D(hTex, vec2(vUv.x, 1.-vUv.y)); float depth=t.r*16.-2.; float n=t.g;
        if (depth < -.05) discard;
        vec2 e=abs(vUv-.5); float edge=1.-smoothstep(.40,.49,max(e.x,e.y));
        float shelf=(1.-smoothstep(.2,4.5,depth))*edge;
        vec3 col=mix(vec3(.12,.4,.44),vec3(.3,.62,.6),1.-smoothstep(0.,2.5,depth));
        float a=shelf*.34;
        // surf: bands rolling shoreward, broken up by noise; a bright wash right at the waterline
        float brk=smoothstep(.35,.7,n+.3*sin(vW.x*.21+vW.z*.17+time*.4)+.2*sin(vW.x*.53-vW.z*.47));   // breaks the foam into patches
        float wave=sin(depth*3.1+time*1.6+n*6.)*.5+.5; wave=smoothstep(.9,.99,wave)*(1.-smoothstep(.2,1.8,depth))*brk*.7;
        float wash=(1.-smoothstep(0.,.18,abs(depth-.05-.06*sin(time*1.1+vW.x*.15+vW.z*.11))))*(.4+.6*brk)*.8;
        float foam=clamp(wave+wash,0.,1.);
        foam*=edge; col=mix(col,vec3(1.,.97,.92),foam); a=max(a,foam*.75);
        gl_FragColor=vec4(col,a);
        #include <fog_fragment>
      }`.replace(/#include <(\w+)>/g, '\n#include <$1>\n'),
  }));
  shallows.position.y = SEA + .04; shallows.renderOrder = 2; shallows.castShadow = shallows.receiveShadow = false; scene.add(shallows);

  // ---- the fortress: curtain on the headland, round towers to the sea, a gate facing the landward roads ----
  const { curtain, tower, keep, hall, flag, flags, pathRibbon, cottage } = fortKit(K, BASE, height);
  const court = new THREE.Shape(), enclosure = [[-30, -18], [-10, -32], [16, -29], [31, -8], [24, 22], [-24, 22], [-34, 4]];
  enclosure.forEach(([x, z], i) => i ? court.lineTo(x, -z) : court.moveTo(x, -z)); court.closePath();
  const courtMesh = mesh(new THREE.ShapeGeometry(court), new THREE.MeshStandardMaterial({ ...stoneMaps, color: '#a69a83', roughness: 1, bumpScale: .08 }));
  courtMesh.rotation.x = -Math.PI / 2; courtMesh.position.y = BASE + .025; courtMesh.castShadow = false;
  for (let i = 0; i < enclosure.length; i++) curtain(enclosure[i], enclosure[(i + 1) % enclosure.length], i === 4);
  enclosure.forEach(([x, z], i) => tower(x, z, i === 1 ? 4.6 : 3.5, [14, 17, 13, 12.5, 12, 12, 14][i], [0, 1, 3].includes(i)));
  keep(-2, -11);
  const hallA = hall(18, -6, 8, 15, 8.5); hallA.rotation.y = -.25;
  hall(-19, 2, 8, 13, 8);
  const gateCenter = new THREE.Vector3(0, BASE, 23.5);
  tower(-6.5, 25.6, 2.2, 11.5, true); tower(6.5, 25.6, 2.2, 11.5, true);
  const gatehouse = new THREE.Group(); gatehouse.position.copy(gateCenter); scene.add(gatehouse);
  facade(9, 9.6, 4.2, [{ x: 0, y: -.1, w: 3.8, h: 5.4, open: true }], gatehouse);
  for (const xx of [-1.55, -1.1, -.65, -.2, .2, .65, 1.1, 1.55]) box(.28, 3.25, .12, xx, 1.6, -3.7, materials.timber, gatehouse);
  for (const yy of [.75, 2.3]) box(3.8, .16, .16, 0, yy, -3.6, materials.iron, gatehouse);
  pitchedRoof(9.8, 5.6, 3.6, 0, 9.6, -1.6, gatehouse);
  for (let xx = -1.5; xx <= 1.5; xx += .45) box(.095, 2.5, .12, xx, 4.55, -1.9, materials.iron, gatehouse);
  flag(-3, BASE + 33, -14, .95); flag(-10, BASE + 17.5, -32, .8); flag(31, BASE + 13, -8, .75); flag(-34, BASE + 14.5, 4, .75);

  // ---- the beacon: a tall light-tower on the cliff point, its fire visible far out to sea ----
  const BX = -44, BZ = -44, bY = height(BX, BZ);
  cylinder(5.2, 6.2, 4, BX, bY + 1.6, BZ, materials.base, 24);
  cylinder(3.6, 4.6, 24, BX, bY + 14, BZ, materials.stone, 24);
  for (const yy of [8, 16]) cylinder(4.25, 4.25, .45, BX, bY + yy, BZ, materials.trim, 24);
  cylinder(4.8, 3.8, 1.2, BX, bY + 26.3, BZ, materials.trim, 24);
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; box(.7, 3.4, .7, BX + Math.cos(a) * 3.5, bY + 28.6, BZ + Math.sin(a) * 3.5, materials.stone); }
  cylinder(4.3, 4.3, .5, BX, bY + 30.5, BZ, materials.trim, 24);
  tiledCone(BX, bY + 30.8, BZ, 4.7, 5.5);
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + .3; const w = box(.5, 1.6, .05, BX + Math.cos(a) * 4.05, bY + 12 + (i % 2) * 6, BZ + Math.sin(a) * 4.05, materials.dark); w.rotation.y = -a + Math.PI / 2; }
  cylinder(1.9, 1.3, 1.1, BX, bY + 27.4, BZ, materials.iron, 16);
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; beam([BX + Math.cos(a) * 1.3, bY + 26.8, BZ + Math.sin(a) * 1.3], [BX + Math.cos(a) * 2.1, bY + 28.1, BZ + Math.sin(a) * 2.1], .12, materials.iron); }
  const flameMat = new THREE.MeshBasicMaterial({ color: '#ff9a3c', transparent: true, opacity: .85, blending: THREE.AdditiveBlending, depthWrite: false });
  const beaconCore = new THREE.Group(); beaconCore.position.set(BX, bY + 27.9, BZ); scene.add(beaconCore);
  const coreMat = new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false });
  for (let i = 0; i < 12; i++) { const f = new THREE.Mesh(new THREE.ConeGeometry(between(.25, .6), between(1.2, 3.2), 7, 1, true).translate(0, 1, 0), i < 4 ? coreMat : flameMat); const a = i / 7 * 6.28; f.position.set(Math.cos(a) * between(.2, .9), 0, Math.sin(a) * between(.2, .9)); f.userData.k = rand() * 6; beaconCore.add(f); }
  const glowTex = canvasTexture(64, (c, s) => { const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); g.addColorStop(0, 'rgba(255,220,160,1)'); g.addColorStop(.25, 'rgba(255,150,60,.55)'); g.addColorStop(1, 'rgba(255,120,40,0)'); c.fillStyle = g; c.fillRect(0, 0, s, s); });
  const beaconGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  beaconGlow.scale.setScalar(16); beaconGlow.position.copy(beaconCore.position); scene.add(beaconGlow);
  const beaconLight = new THREE.PointLight('#ff9a4a', 160, 70, 1.6); beaconLight.position.copy(beaconCore.position); scene.add(beaconLight);

  // ---- roads: packed sand and turf tracks; the causeway is laid stone between rows of piles ----
  const roadTex = canvasTexture(256, (c, s) => {
    const img = c.createImageData(s, s);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const v = y / s, edge = Math.min(1, Math.min(v, 1 - v) * 6), rut = Math.exp(-(((v - .3) * 22) ** 2)) + Math.exp(-(((v - .7) * 22) ** 2));
      const n = noise(x * .08, y * .08) * .6 + noise(x * .4, y * .4) * .4, i = (y * s + x) * 4, l = 176 - rut * 40 - n * 30;
      img.data[i] = l; img.data[i + 1] = l * .9; img.data[i + 2] = l * .74; img.data[i + 3] = 255 * Math.min(1, edge ** 1.4 * (.75 + .5 * n));
    }
    c.putImageData(img, 0, 0);
  });
  const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: .96, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  pathRibbon(beachPts.slice(2), 6, roadMat); pathRibbon(cliffPts, 6.5, roadMat); pathRibbon(causewayPts.slice(3), 6, roadMat); pathRibbon(gateRoad, 7, roadMat);
  // causeway paving and piles through the shallows
  const cwL = lanePaths[2], slabG = new THREE.BoxGeometry(1, 1, 1), slabMat = new THREE.MeshStandardMaterial({ color: '#b2a68f', roughness: .95 });
  const pileG = new THREE.CylinderGeometry(.2, .26, 1, 7).translate(0, .5, 0), pileMat = new THREE.MeshStandardMaterial({ color: '#3d3226', roughness: 1 });
  for (let i = 0; i < cwL.length - 2; i += 3) {
    const p = cwL[i], q = cwL[i + 2], y = height(p.x, p.z);
    if (y > SEA + 2.4) continue;
    const yaw = Math.atan2(q.x - p.x, q.z - p.z);
    instance(slabG, slabMat, p.x, y - .12, p.z, 6.4, .3, 1.45, yaw + between(-.03, .03), new THREE.Color().setHSL(.1, .1, between(.72, 1)));
    for (const sd of [-1, 1]) instance(slabG, slabMat, p.x + Math.cos(yaw) * 3.35 * sd, y + .02, p.z - Math.sin(yaw) * 3.35 * sd, .45, .42, 1.4, yaw + between(-.05, .05), new THREE.Color().setHSL(.09, .08, between(.55, .75)));   // kerbs
    if (i % 9 === 0) for (const s of [-1, 1]) instance(pileG, pileMat, p.x + Math.cos(yaw) * 3.9 * s, SEA - 1.2, p.z - Math.sin(yaw) * 3.9 * s, 1, between(2.2, 3.2), 1, rand() * 6, null, between(-.08, .08), between(-.08, .08));
  }

  // ---- longships beached in the bay: clinker hulls, dragon prows, striped sails ----
  const hullMat = new THREE.MeshStandardMaterial({ color: '#4a3424', roughness: .85 }), deckMat = new THREE.MeshStandardMaterial({ color: '#6b5036', roughness: .95 });
  const sailTex = canvasTexture(128, (c, s) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#e9dcc0' : '#8e2a20'; c.fillRect(i * s / 8, 0, s / 8 + 1, s); } c.fillStyle = 'rgba(60,30,10,.18)'; for (let k = 0; k < 400; k++) c.fillRect(rand() * s, rand() * s, 2, 2); });
  const sailMat = new THREE.MeshStandardMaterial({ map: sailTex, roughness: 1, side: THREE.DoubleSide });
  const shieldCols = ['#8e2a20', '#d9c9a2', '#2a3a52', '#c5962e'].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: .8 }));
  function hullGeometry(len, beam_, depth) {
    // a lathe-like boat: cross-sections shrink and rise toward both ends
    const pos = [], idx = [], N = 24, M = 9;
    for (let i = 0; i <= N; i++) {
      const t = i / N, z = (t - .5) * len, taper = Math.sin(Math.PI * t) ** .7, rise = (Math.abs(t - .5) * 2) ** 3 * depth * 1.2;
      for (let j = 0; j <= M; j++) {
        const a = Math.PI * (j / M), x = -Math.cos(a) * beam_ / 2 * taper, y = -Math.sin(a) * depth * (.35 + .65 * taper) + rise + depth;
        pos.push(x, y, z);
      }
    }
    for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) { const a = i * (M + 1) + j, b = a + M + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  function longship(x, z, yaw, heel) {
    const g = new THREE.Group(); g.position.set(x, Math.max(SEA - .55, height(x, z) - .35), z); g.rotation.set(-.04, yaw, heel); scene.add(g);
    const hull = new THREE.Mesh(hullGeometry(17, 4.4, 1.5), hullMat); hull.castShadow = hull.receiveShadow = true; hull.material.side = THREE.DoubleSide; g.add(hull);
    box(3.4, .12, 7, 0, 1.25, 0, deckMat, g); for (const e of [-1, 1]) box(2.2, .12, 2.6, 0, 1.25, e * 4.9, deckMat, g);
    for (let k = -2; k <= 2; k++) box(3.5, .14, .3, 0, 1.45, k * 1.5, deckMat, g);
    for (const s of [-1, 1]) for (let k = -5; k <= 5; k++) { const sh = cylinder(.48, .48, .1, s * 1.98, 1.85, k * 1.15, shieldCols[(k + 5 + (s > 0 ? 1 : 0)) % 4], 12, g); sh.rotation.z = Math.PI / 2; }
    // prow and stern posts curling up into a dragon head
    for (const e of [-1, 1]) {
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 1.4, e * 8.2), new THREE.Vector3(0, 2.6, e * 8.9), new THREE.Vector3(0, 4.2, e * 9.0), new THREE.Vector3(0, 4.9, e * (e > 0 ? 8.4 : 8.6))]);
      const post = mesh(new THREE.TubeGeometry(curve, 12, .26, 6), hullMat, g);
      if (e > 0) { const head = box(.5, .55, 1.1, 0, 5.05, 8.15, hullMat, g); head.rotation.x = .3; box(.12, .12, .14, -.2, 5.2, 7.75, materials.dark, g); box(.12, .12, .14, .2, 5.2, 7.75, materials.dark, g); }
    }
    cylinder(.14, .18, 9, 0, 5.6, -.5, materials.timber, 8, g);
    const yard = box(6.5, .2, .2, 0, 9.6, -.5, materials.timber, g); yard.rotation.y = .12;
    const sailG = new THREE.PlaneGeometry(6.2, 4.6, 10, 6), sp = sailG.attributes.position;
    for (let i = 0; i < sp.count; i++) sp.setZ(i, Math.sin((sp.getX(i) / 6.2 + .5) * Math.PI) * .9 * (1 - (sp.getY(i) / 4.6 + .5) * .4));
    sailG.computeVertexNormals();
    const sail = mesh(sailG, sailMat, g); sail.position.set(0, 7.3, -.75); sail.rotation.y = .12;
  }
  longship(-66, 148, 1.35, .05); longship(-63, 163, 1.7, -.07); longship(-70, 133, 1.15, .08); longship(-79, 172, 2.0, .03);

  // ---- sea stacks and cliff-foot rocks, each with its own collar of surf (drawn by the shallows) ----
  const rockGeometry = new THREE.IcosahedronGeometry(1, 2), rp = rockGeometry.attributes.position;
  for (let i = 0; i < rp.count; i++) { const f = .78 + noise(rp.getX(i) * 2.6 + 5, rp.getZ(i) * 2.6 + rp.getY(i) * 1.7) * .44; rp.setXYZ(i, rp.getX(i) * f, rp.getY(i) * f, rp.getZ(i) * f); }
  rockGeometry.computeVertexNormals();
  const rockMat = new THREE.MeshStandardMaterial({ color: '#8b8070', roughness: 1 });
  // Sea stacks: tapering columns with stepped strata, cracks and a dark wet foot (vertex colours).
  function stackGeometry(seed) {
    const g = new THREE.CylinderGeometry(4.2, 6, 30, 14, 24).translate(0, 15, 0), p = g.attributes.position, col = [], c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), band = Math.floor(y / 2.4);
      const f = .78 + .3 * noise(Math.cos(a) * 2 + seed, Math.sin(a) * 2 + band * .7) + .08 * (band % 2) - .25 * Math.max(0, (y - 24) / 6) ** 2;
      p.setXYZ(i, x * f, y, z * f);
      c.setHSL(.07 + .02 * noise(band * .9, seed), .1, (.24 + .12 * noise(a * 3 + seed, y * .3)) * (y < 3.4 ? .5 : 1));
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals(); return g;
  }
  const stackGeo = [stackGeometry(1), stackGeometry(5)], stackMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  let stackN = 0;
  for (const [x, z, s, h] of [[-96, 6, 7, 26], [-118, -70, 9, 34], [-86, -112, 6, 20], [-104, 60, 5, 16], [-130, 120, 8, 22], [-30, 214, 5, 12]]) {
    instance(stackGeo[stackN++ % 2], stackMat, x, -3, z, s / 6, h / 26, s / 6, rand() * 6);
    instance(rockGeometry, rockMat, x, SEA - .2, z, s * 1.12, 1.6, s * .98, rand() * 6, new THREE.Color('#3a332c'));
  }
  for (let i = 0; i < 260; i++) {
    const z = between(-220, 120), x = westCoast(z) + between(-7, 1), s = between(.6, 2.6);
    if (beachness(x, z) > .4) continue;
    instance(rockGeometry, rockMat, x, height(x, z) - s * .45, z, s * between(1, 1.7), s * .7, s, rand() * 6, new THREE.Color().setHSL(.08, .08, between(.6, 1)));
  }
  for (let i = 0; i < 140; i++) {
    const x = between(-140, 160), z = between(130, 330);
    const y = height(x, z); if (y > SEA + .8 || y < SEA - 1.2 || causewayD(x, z) < 7) continue;
    const s = between(.4, 1.5); instance(rockGeometry, rockMat, x, y - s * .2, z, s * 1.4, s * .5, s, rand() * 6, new THREE.Color().setHSL(.1, .15, between(.4, .6)));
  }

  // ---- a fishing hamlet on the slope above the beach, nets drying on racks ----
  for (const c of cottages) cottage(...c);
  const chimneys = cottages.map(([x, z, w, d, h, r]) => { const lx = -w * .23, lz = -d * .2, c = Math.cos(r), s = Math.sin(r); return [x + lx * c + lz * s, height(x, z) - .25 + h + 3.55, z - lx * s + lz * c, 1.6 + rand()]; });
  chimneys.push([BX, bY + 30, BZ, 3], [18, BASE + 8.5 + 6.6, -8, 1.1], [-19, BASE + 8 + 6.4, 0, .9], [-.4, BASE + 29, -14.5, .9]);
  const netMat = new THREE.MeshStandardMaterial({ color: '#5b4a35', roughness: 1, transparent: true, opacity: .75, side: THREE.DoubleSide });
  for (const [x, z, r] of [[-28, 108, .5], [-56, 100, .9], [-6, 134, -.2]]) {
    const y = height(x, z);
    for (const s of [-1, 1]) beam([x + Math.cos(r) * 2.6 * s, y, z - Math.sin(r) * 2.6 * s], [x + Math.cos(r) * 2.6 * s, y + 2.3, z - Math.sin(r) * 2.6 * s], .14);
    beam([x - Math.cos(r) * 2.6, y + 2.2, z + Math.sin(r) * 2.6], [x + Math.cos(r) * 2.6, y + 2.2, z - Math.sin(r) * 2.6], .12);
    const net = mesh(new THREE.PlaneGeometry(5, 1.9, 6, 3), netMat); net.position.set(x, y + 1.25, z); net.rotation.y = r; net.castShadow = false;
  }
  // rowing boats pulled up on the sand
  const rowMat = new THREE.MeshStandardMaterial({ color: '#8a6c4c', roughness: .9, side: THREE.DoubleSide });
  for (const [x, z, yaw] of [[-44, 132, .3], [-38, 140, .8], [-20, 148, 1.6]]) {
    if (nearPad(x, z, 7)) continue;
    const g = new THREE.Group(); g.position.set(x, height(x, z) + .32, z); g.rotation.set(0, yaw, .15); scene.add(g);
    const h = new THREE.Mesh(hullGeometry(5, 1.8, .7), rowMat); h.castShadow = true; g.add(h); box(1.5, .08, .3, 0, .62, .3, deckMat, g); box(1.5, .08, .3, 0, .62, -.9, deckMat, g);
  }

  // ---- wind-bent coastal pines inland, gorse on the slopes, marram grass on the dunes ----
  const leafMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95, side: THREE.DoubleSide });
  const barkMaterial = new THREE.MeshStandardMaterial({ color: '#4f4333', roughness: 1 });
  leafMaterial.onBeforeCompile = shader => {   // per-leaf flecks and a little warm light through the canopy, as at Dawnhold
    shader.vertexShader = 'varying vec3 leafPosition;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nleafPosition=position;');
    shader.fragmentShader = 'varying vec3 leafPosition; float leafNoise(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,39.425)))*43758.5453);}\n' + shader.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\nfloat fleck=leafNoise(floor(leafPosition*15.)); diffuseColor.rgb*=.76+.4*fleck;')
      .replace('#include <opaque_fragment>', 'outgoingLight += diffuseColor.rgb * vec3(1.0,0.62,0.32) * 0.09;\n#include <opaque_fragment>');
  };
  // Wind-shorn coastal pine: a leaning trunk, a few upswept limbs, and flat-topped clouds of needles combed east by the sea wind.
  function seaPine(seed, detailed) {
    const bark = [], crowns = [], leafPos = [], leafCol = [], col = new THREE.Color(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
    const H = 8.5 + seed * 2.5, lean = .1 + seed * .06;
    const limb = (a, b, r1, r2) => { const d = new THREE.Vector3(...b).sub(new THREE.Vector3(...a)); const g = new THREE.CylinderGeometry(r2, r1, d.length(), 6); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize())); g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); bark.push(g); };
    const top = [lean * H, H * .82, 0];
    limb([0, 0, 0], [lean * H * .5, H * .45, .1], .42, .26); limb([lean * H * .5, H * .45, .1], top, .26, .12);
    const n = detailed ? 6 : 4;
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2 + seed * 3, y = H * between(.58, .86), r = between(1.6, 2.9);
      const end = [top[0] * y / H + Math.cos(a) * r + .9, y + between(.6, 1.6), Math.sin(a) * r];   // the wind pushes the canopy east
      if (detailed) limb([top[0] * y / H, y - 1, 0], end, .13, .04);
      const c = new THREE.IcosahedronGeometry(detailed ? 1.7 : 1.9, detailed ? 3 : 0), p = c.attributes.position, cc = [];
      for (let i = 0; i < p.count; i++) {
        const px = p.getX(i), py = p.getY(i), pz = p.getZ(i), nn = .85 + .3 * noise(px * 3 + k * 7, pz * 3 + seed * 5);
        p.setXYZ(i, end[0] + px * nn * 1.25, end[1] + py * nn * .5, end[2] + pz * nn * 1.05);
        col.setHSL(between(.27, .31), .34, .12 + .05 * nn + py * .02); cc.push(col.r, col.g, col.b);
      }
      c.deleteAttribute('uv'); c.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3)); c.computeVertexNormals(); crowns.push(c);
      for (let q = 0; q < (detailed ? 80 : 0); q++) {
        const th = rand() * 6.283, rr = Math.cbrt(rand()), x = end[0] + Math.cos(th) * rr * 2.3, yy = end[1] + between(-.35, .75), z = end[2] + Math.sin(th) * rr * 1.9;
        const size = between(.26, .44), ang = rand() * 6.28;
        v1.set(Math.cos(ang) * size, between(-.1, .1), Math.sin(ang) * size); v2.set(-Math.sin(ang) * size * .5, size * between(.2, .7), Math.cos(ang) * size * .5);
        leafPos.push(x - v1.x, yy - v1.y, z - v1.z, x + v2.x, yy + v2.y, z + v2.z, x + v1.x, yy + v1.y, z + v1.z, x - v1.x, yy - v1.y, z - v1.z, x + v1.x, yy + v1.y, z + v1.z, x - v2.x, yy - v2.y, z - v2.z);
        col.setHSL(between(.25, .3), between(.3, .45), between(.13, .22) * (.7 + rr * .3)); for (let j = 0; j < 6; j++) leafCol.push(col.r, col.g, col.b);
      }
    }
    if (leafPos.length) { const f = new THREE.BufferGeometry(); f.setAttribute('position', new THREE.Float32BufferAttribute(leafPos, 3)); f.setAttribute('color', new THREE.Float32BufferAttribute(leafCol, 3)); f.computeVertexNormals(); crowns.push(f); }
    return { bark: mergeGeometries(bark), foliage: mergeGeometries(crowns) };
  }
  const pines = [seaPine(0, true), seaPine(.5, true), seaPine(1, true)], farPines = [seaPine(.3, false), seaPine(.8, false)];
  const treeLocations = [];
  for (let i = 0; i < 8000 && treeLocations.length < 2200; i++) {
    const x = between(-60, 380), z = between(-300, 300), y = height(x, z), r = Math.hypot(x, z);
    if (r < 52 || y < SEA + 3.5 || landD(x, z) < 14 || roadD(x, z) < 9 || nearPad(x, z, 13)) continue;
    const near = r < 170 || Math.hypot(x - 80, z - 266) < 70;
    if (near && noise(x * .03 + 3, z * .03) < .58) continue;
    if (!near && (noise(x * .02, z * .02 + 6) < .46 || noise(x * .055 + 3, z * .055) < .38)) continue;   // stands with clearings, not a carpet
    const s = between(.65, 1.4), t = near ? pines[i % 3] : farPines[i % 2];
    const rot = between(-.25, .25), tint = new THREE.Color().setHSL(between(.16, .3), between(.12, .32), between(.72, 1.12));
    treeLocations.push([x, z, s, instance(t.bark, barkMaterial, x, y - .3, z, s, s, s, rot), instance(t.foliage, leafMaterial, x, y - .3, z, s, s * between(.85, 1.15), s, rot, tint)]);
  }
  const gorse = new THREE.IcosahedronGeometry(1, 1), gp = gorse.attributes.position;
  for (let i = 0; i < gp.count; i++) { const f = .75 + noise(gp.getX(i) * 4 + 2, gp.getZ(i) * 4 + gp.getY(i) * 2) * .5; gp.setXYZ(i, gp.getX(i) * f, Math.max(-.2, gp.getY(i)) * f, gp.getZ(i) * f); }
  gorse.computeVertexNormals();
  const gorseMat = new THREE.MeshStandardMaterial({ color: '#5a6e34', roughness: 1 }), bloomMat = new THREE.MeshStandardMaterial({ color: '#f2c63a', roughness: .9, emissive: '#7a5200', emissiveIntensity: .35 });
  const bloomG = new THREE.IcosahedronGeometry(.085, 0);
  for (let i = 0; i < 1100; i++) {
    const x = between(-60, 240), z = between(-120, 360), y = height(x, z);
    if (y < SEA + 2.5 || roadD(x, z) < 5 || Math.hypot(x, z) < 40 || nearPad(x, z, 6.5) || noise(x * .05 + 9, z * .05) < .48) continue;
    const s = between(.6, 1.5); instance(gorse, gorseMat, x, y + s * .1, z, s * between(1.1, 1.7), s * .75, s * between(1, 1.4), rand() * 6);
    for (let k = 0; k < 22; k++) { const a = rand() * 6.28, rr = between(.3, 1) * s; instance(bloomG, bloomMat, x + Math.cos(a) * rr * 1.2, y + s * .55 + between(-.1, .25), z + Math.sin(a) * rr, 1, 1, 1, rand() * 6); }
  }
  const grassPos = [], grassCol = [], gc = new THREE.Color();
  for (let i = 0; i < 120000; i++) {
    const x = between(-120, 240), z = between(-140, 360), y = height(x, z);
    if (y < SEA + 2.2 || roadD(x, z) < 3.6 || Math.hypot(x, z) < 36) continue;
    const dune = 1 - smooth(SEA + 3, SEA + 8, y);
    if (noise(x * .45 + 7, z * .45) < .45 + dune * .2) continue;   // grows in tufts, sparse on the dunes
    const size = between(.25, .7) * (1 + dune * .6), a = rand() * 6.28, dx = Math.cos(a) * .09, dz = Math.sin(a) * .09, lean = between(.05, .3);   // leaning east, off the sea
    grassPos.push(x - dx, y, z - dz, x + dx, y, z + dz, x + lean, y + size, z + lean * .3);
    gc.setHSL(dune > .5 ? between(.12, .15) : between(.15, .22), dune > .5 ? between(.18, .28) : between(.28, .42), dune > .5 ? between(.36, .46) : between(.17, .28));
    for (let j = 0; j < 3; j++) grassCol.push(gc.r, gc.g, gc.b);
  }
  const grassG = new THREE.BufferGeometry(); grassG.setAttribute('position', new THREE.Float32BufferAttribute(grassPos, 3)); grassG.setAttribute('color', new THREE.Float32BufferAttribute(grassCol, 3)); grassG.computeVertexNormals();
  mesh(grassG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide })).castShadow = false;
  // stone field walls on the downs and driftwood on the sand
  const wallG = new THREE.BoxGeometry(1, 1, 1), wallMat = new THREE.MeshStandardMaterial({ ...stoneMaps, color: '#9a917f', roughness: 1, bumpScale: .12 });
  for (const [ax, az, bx, bz] of [[60, -30, 120, -70], [90, 80, 150, 40], [120, 110, 180, 150], [-10, -60, 40, -110]]) {
    const n = Math.round(Math.hypot(bx - ax, bz - az) / 1.6), yaw = Math.atan2(bx - ax, bz - az);
    for (let k = 0; k < n; k++) { const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n; if (roadD(x, z) < 5) continue; instance(wallG, wallMat, x, height(x, z) + .45, z, .9, between(.8, 1.1), 1.7, yaw + between(-.08, .08)); }
  }
  const logG = new THREE.CylinderGeometry(.2, .26, 1, 6).rotateZ(Math.PI / 2), driftMat = new THREE.MeshStandardMaterial({ color: '#9d9282', roughness: 1 });
  for (let i = 0; i < 60; i++) {
    const x = between(-110, 40), z = between(100, 200), y = height(x, z);
    if (y < SEA + .5 || y > SEA + 2.6 || roadD(x, z) < 5) continue;
    instance(logG, driftMat, x, y + .12, z, between(2, 5), 1, 1, rand() * 6);
  }

  // ---- the enemy musters: war camps on the islet and at the head of the cliff road ----
  const tentTex = canvasTexture(128, (c, s) => { c.fillStyle = '#b9a789'; c.fillRect(0, 0, s, s); for (let i = 0; i < 6; i++) { c.fillStyle = i % 2 ? '#7c1719' : '#b9a789'; c.fillRect(i * s / 6, 0, s / 6 + 1, s); } c.fillStyle = 'rgba(40,20,5,.25)'; for (let k = 0; k < 500; k++) c.fillRect(rand() * s, rand() * s, 2, 3); });
  const tentMat = new THREE.MeshStandardMaterial({ map: tentTex, roughness: 1 }), tentG = new THREE.ConeGeometry(1, 1, 10, 1, true).translate(0, .5, 0);
  const emberMat = new THREE.MeshStandardMaterial({ color: '#ff8a3a', emissive: '#ff5a10', emissiveIntensity: 2.4 }), emberG = new THREE.IcosahedronGeometry(.55, 1);
  const campFires = [];
  const stakeG = new THREE.CylinderGeometry(.09, .14, 2.6, 5).translate(0, 1.2, 0), stakeMat = new THREE.MeshStandardMaterial({ color: '#4a3b2b', roughness: 1 });
  function camp(cx, cz, n, spread) {
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2 + rand(), rr = between(spread * .45, spread), x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
      if (roadD(x, z) < 6 || nearPad(x, z, 7.5)) continue;
      const s = between(2.4, 3.4); instance(tentG, tentMat, x, height(x, z) - .1, z, s, s * between(1.1, 1.4), s, rand() * 6);
      cylinder(.06, .08, .9, x, height(x, z) + s * 1.3, z, materials.timber, 5);
    }
    for (let k = 0; k < 2; k++) {
      const x = cx + between(-spread * .4, spread * .4), z = cz + between(-spread * .4, spread * .4); if (roadD(x, z) < 5) continue;
      const y = height(x, z); instance(emberG, emberMat, x, y + .25, z, 1, .5, 1); campFires.push([x, y + 1.2, z]);
      for (let q = 0; q < 7; q++) { const a = q / 7 * 6.28; instance(rockGeometry, rockMat, x + Math.cos(a) * 1.1, y + .1, z + Math.sin(a) * 1.1, .3, .25, .3, a); }
    }
    flag(cx + 2, height(cx + 2, cz) - .2, cz - 3, 1.1);
    for (let a = 0; a < Math.PI * 2; a += .06) {
      const pr = spread + 4 + 3 * (noise(Math.cos(a) * 1.5 + cx, Math.sin(a) * 1.5) - .5), x = cx + Math.cos(a) * pr, z = cz + Math.sin(a) * pr;
      if (roadD(x, z) < 6 || height(x, z) < SEA + .6) continue;
      instance(stakeG, stakeMat, x, height(x, z) - .2, z, 1, between(.8, 1.2), 1, a, null, Math.cos(a) * .25, -Math.sin(a) * .25);
    }
    for (let k = 0; k < 3; k++) {
      const a = rand() * 6.28, x = cx + Math.cos(a) * spread * .5, z = cz + Math.sin(a) * spread * .5; if (roadD(x, z) < 6) continue;
      const y = height(x, z), yaw = rand() * 3;
      beam([x - Math.cos(yaw) * 1.2, y + 1.1, z + Math.sin(yaw) * 1.2], [x + Math.cos(yaw) * 1.2, y + 1.1, z - Math.sin(yaw) * 1.2], .08, materials.timber);
      for (let q = -2; q <= 2; q++) beam([x + Math.cos(yaw) * q * .5, y, z - Math.sin(yaw) * q * .5 - .35], [x + Math.cos(yaw) * q * .5, y + 2.2, z - Math.sin(yaw) * q * .5 + .1], .045, materials.timber);
    }
    const bx = cx - spread * .25, bz = cz + spread * .2, by = height(bx, bz);
    instance(tentG, tentMat, bx, by - .1, bz, 5.2, 4.6, 5.2, .4);
    flag(bx, by + 4.4, bz, 1.3);
  }
  camp(82, 270, 9, 21); camp(184, -44, 8, 18);

  // ---- gulls wheeling over the cliffs ----
  const birds = [], birdMaterial = new THREE.MeshBasicMaterial({ color: '#f1ece2', side: THREE.DoubleSide });
  for (let i = 0; i < 11; i++) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -1, .1, .22, -.3, 0, -.25, 0, 0, 0, .3, 0, -.25, 1, .1, .22], 3)); g.computeVertexNormals();
    const b = mesh(g, birdMaterial); b.castShadow = false; b.scale.setScalar(1.1); birds.push({ mesh: b, angle: rand() * 6.28, radius: between(25, 70), high: between(34, 58), cx: between(-70, -30), cz: between(-40, 60) });
  }

  const fires = [[-6.5, BASE + 12, 25.6, 1], [0, BASE + 10.2, 23, 1], [6.5, BASE + 12, 25.6, 2], [-14, BASE + 9.5, 22, 2], [14, BASE + 9.5, 22, 2], [18, BASE + 12, -6, 2],
    [-34, BASE + 13, 4, 3], [31, BASE + 12.5, -8, 3], [-2, BASE + 24, -11, 3], [-19, BASE + 11, 2, 3], [-10, BASE + 17, -32, 3]];
  return {
    height, BASE, gateCenter, sun, terrain, water, treeLocations, exposure: 1.0, unitScale: 1.25,
    bridgeDeck: { x0: Infinity, x1: -Infinity, z: 0, halfWidth: 0, y: 0 },   // no bridge; the causeway is terrain
    lanePaths, laneNames: ['beach landing', 'cliff road', 'causeway'],
    padSpots,
    view: { position: new THREE.Vector3(118, 92, 150), target: new THREE.Vector3(4, 18, 20) },
    titleView: [-10, 30, -8, 112, 34, 126],
    fortPoints: [[-38, BASE, -36], [36, BASE, -36], [-38, BASE, 30], [36, BASE, 30], [-32, BASE + 34, -30], [30, BASE + 34, -30], [-32, BASE + 30, 28], [30, BASE + 30, 28]],
    mist: { color: '#e9b99a', glsl: 'float mist=.28*exp(-max(world.y-1.,0.)*.09)*smoothstep(90.,360.,-view.z);' },
    fx: { chimneys: [...chimneys, ...campFires.map(([x, y, z]) => [x, y, z, 2.2])], sound: 'surf', fires, smoke: [[-2, BASE + 24, -11], [0, BASE + 11, 24], [18, BASE + 13, -6], [-19, BASE + 12, 2], [-34, BASE + 13, 4]], ambient: 'pollen' },
    moving: [water, shallows, sky, beaconGlow, beaconCore, ...flags.map(f => f.mesh), ...birds.map(b => b.mesh)],
    animate(time) {
      water.material.uniforms.time.value = time * .3;
      shallows.material.uniforms.time.value = time;
      const flick = .85 + .1 * Math.sin(time * 7.3) + .06 * Math.sin(time * 17.1 + 1) + .05 * Math.sin(time * 2.1);
      beaconGlow.scale.setScalar(15 * flick); beaconLight.intensity = 150 * flick;
      for (const f of beaconCore.children) f.scale.set(1, .75 + .35 * Math.abs(Math.sin(time * 6 + f.userData.k)) + .1 * Math.sin(time * 17 + f.userData.k), 1);
      for (const f of flags) {
        const p = f.mesh.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) { const x = f.original[i * 3], y = f.original[i * 3 + 1]; p.setZ(i, Math.sin(x * 2.4 - time * 3.8 + y * .4) * x * .12); p.setY(i, y + Math.sin(x * 2 - time * 3.2) * x * .04); }
        p.needsUpdate = true; f.mesh.geometry.computeVertexNormals();
      }
      for (let i = 0; i < birds.length; i++) {
        const b = birds[i], a = b.angle + time * .045 * (i % 2 ? 1 : -1);
        b.mesh.position.set(Math.cos(a) * b.radius + b.cx, b.high + Math.sin(time * .5 + i) * 1.2, Math.sin(a) * b.radius + b.cz); b.mesh.rotation.y = -a + (i % 2 ? 0 : Math.PI); b.mesh.rotation.z = Math.sin(time * .8 + i) * .2;
        const p = b.mesh.geometry.attributes.position; p.setY(1, Math.sin(time * 2.2 + i) * .35); p.setY(5, Math.sin(time * 2.2 + i) * .35); p.needsUpdate = true;
      }
    },
  };
}
