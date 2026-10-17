// Shared medieval architecture for the worlds: curtain walls, towers, keep, halls, flags, road ribbons, cottages.
// `BASE` is the fortress plateau height; `height(x, z)` is the world's terrain.
export function fortKit(K, BASE, height) {
  const { THREE, scene, materials, mesh, box, cylinder, beam, worldUV, facade, tiledCone, pitchedRoof } = K;
  const flags = [];
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
  function flag(x, y, z, scale = 1) {
    cylinder(.055, .075, 5 * scale, x, y + 2.5 * scale, z, materials.iron, 8);
    const g = new THREE.PlaneGeometry(2.8 * scale, 1.2 * scale, 16, 5); g.translate(1.4 * scale, - .6 * scale, 0);
    const m = new THREE.MeshStandardMaterial({ color: '#722f23', roughness: 1, side: THREE.DoubleSide });
    const f = mesh(g, m); f.position.set(x, y + 4.7 * scale, z); f.rotation.y = -.6;
    flags.push({ mesh: f, original: Float32Array.from(g.attributes.position.array), scale });
  }
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
    for (const side of [-1, 1]) {   // gable-end walls: corner posts, a rail, a shuttered window
      for (const zz of [-d / 2 + .3, d / 2 - .3]) box(.17, h, .17, side * (w / 2 + .01), h / 2, zz, materials.timber, group);
      box(.16, .19, d, side * (w / 2 + .01), h * .55, 0, materials.timber, group);
      box(.03, .8, .62, side * (w / 2 + .1), h * .76, d * .18, materials.dark, group); box(.06, .82, .06, side * (w / 2 + .14), h * .76, d * .18, materials.timber, group);
    }
    pitchedRoof(w + 1, d + 1, h * .74, 0, h, 0, group);
    box(.85, 3.5, .9, -w * .23, h + 1.65, -d * .2, materials.stone, group);
    box(1.06, .2, 1.11, -w * .23, h + 3.3, -d * .2, materials.trim, group);
  }
  return { curtain, tower, keep, hall, flag, flags, pathRibbon, cottage };
}
