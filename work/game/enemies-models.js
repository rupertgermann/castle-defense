// Procedural enemy models of the invading host: iron, crimson and black.
import { THREE } from '../scene.js';
import { Model, humanBones, C, box, cyl, sph, cone, tor, limb, ext, extShape, arcPts, xf, lathe } from './enemies-kit.js';

const PI = Math.PI;

// ---- shared humanoid pieces (built on the right side, mirrored to the left) ----
function legs(m, o) {
  const x = -.1;
  m.add('thighR', [limb([x, .97, 0], [x, .54, .01], .09, .07, 10), sph(.07, [x, .52, .01])], o.trouser, o.trouserMat || 'cloth', { mirror: true });
  m.add('shinR', limb([x, .5, .01], [x, .17, -.015], .067, .052, 10), o.trouser, o.trouserMat || 'cloth', { mirror: true });
  m.add('shinR', [box(.13, .2, .17, .045, [x, .115, 0]), box(.12, .1, .15, .045, [x, .055, .09])], o.boot, 'leather', { mirror: true });
  m.add('shinR', box(.14, .035, .29, .012, [x, .017, .045]), C.leatherDk, 'leather', { mirror: true });
  if (!o.armored) m.add('shinR', cyl(.079, .073, .065, 10, [x, .245, -.005]), o.cuff || C.leatherDk, 'leather', { mirror: true });
  if (o.wraps) for (let i = 0; i < 3; i++) m.add('shinR', cyl(.066 - i * .004, .064 - i * .004, .03, 10, [x, .3 + i * .055, 0], [.25, 0, 0]), o.wraps, 'rope', { mirror: true });
  if (o.armored) {
    const st = o.plate || C.steel, mat = o.plateMat || 'steel';
    m.add('thighR', [cyl(.1, .085, .3, 10, [x, .72, .01], [0, 0, 0], [1, 1, .95], false)], st, mat, { mirror: true });
    m.add('shinR', [sph(.078, [x, .5, .05], [1, 1.05, .8]), cyl(.075, .062, .26, 10, [x, .34, 0])], st, mat, { mirror: true });
    m.add('shinR', [box(.14, .08, .2, .035, [x, .085, .06])], st, mat, { mirror: true });
    m.add('shinR', sph(.02, [x, .51, .115]), o.trim || C.gold, 'gold', { mirror: true });
  }
}
// Arm with a bent elbow; shoulder (-.24,1.44), elbow, wrist forward. Hand at H.
const S = [-.24, 1.45, 0], E = [-.275, 1.17, -.035], W = [-.27, .97, .07], H = [-.27, .935, .1];
function arm(m, o, mirror = true) {
  const side = o.side || 'R', sx = side === 'R' ? 1 : -1, f = p => [p[0] * sx, p[1], p[2]], bone = 'arm' + side;
  m.add(bone, [limb(f(S), f(E), o.upper || .06, .05, 9), sph(.052, f(E))], o.sleeve, o.sleeveMat || 'cloth', { mirror });
  m.add(bone, limb(f(E), f(W), .05, .04, 9), o.fore || o.sleeve, o.foreMat || o.sleeveMat || 'cloth', { mirror });
  m.add(bone, box(.085, .1, .09, .035, f(H)), o.hand || C.skin, o.handMat || 'skin', { mirror });
  if (o.bracer) m.add(bone, limb(f([-.273, 1.1, 0]), f([-.27, .99, .06]), .056, .05, 9), o.bracer, o.bracerMat || 'leather', { mirror });
}
// Shield emblem of the host: a bone-white horned crescent over a downward fang.
function sigilShapes(sc = 1) {
  const cres = [...arcPts(0, 0, .16, .16, PI * 1.08, PI * 1.92, 10), ...arcPts(0, .055, .12, .11, PI * 1.9, PI * 1.1, 10)].map(([x, y]) => [x * sc, y * sc]);
  const fang = [[-.05, -.07], [.05, -.07], [0, -.24]].map(([x, y]) => [x * sc, y * sc]);
  return [cres, fang];
}
function kiteOutline(w = .27, h = .44) {
  return [[-w, h * .55], ...arcPts(0, h * .45, w, h * .14, PI, 0, 8).slice(1, -1), [w, h * .55], [w * .96, 0], [w * .7, -h * .5], [0, -h], [-w * .7, -h * .5], [-w * .96, 0]];
}

// ---- raider: light infantry, spangenhelm, axe and torch, round shield slung on the back ----
function raider() {
  const m = new Model('raider', humanBones([['flame', 'armL', [.27, 1.31, .33]]]), { cap: 140 });
  legs(m, { trouser: C.charcoal, boot: C.leather, wraps: C.rope });
  m.add('hips', [box(.33, .2, .22, .06, [0, .98, 0])], C.leatherDk, 'leather');
  m.add('hips', cyl(.19, .26, .34, 12, [0, .86, 0]), C.crimsonDk, 'cloth');
  m.add('hips', cyl(.2, .2, .065, 12, [0, 1.03, 0], 0, [1, 1, .78]), C.leather, 'leather');
  m.add('hips', box(.065, .055, .025, .01, [0, 1.03, .16]), C.gold, 'gold');
  m.add('hips', box(.1, .12, .06, .02, [.17, .95, .06], [0, .4, 0]), C.leather, 'leather');
  // torso: crimson gambeson under a studded leather vest, scarf, shield on the back
  m.add('torso', [box(.37, .42, .24, .09, [0, 1.3, 0]), cyl(.052, .06, .1, 8, [0, 1.53, 0])], C.crimson, 'cloth');
  m.add('torso', [box(.4, .29, .265, .07, [0, 1.22, 0])], C.leatherDk, 'leather');
  for (const x of [-.13, -.045, .045, .13]) m.add('torso', sph(.013, [x, 1.3, .135], 1, 0, 6, 4), C.steel, 'iron');
  m.add('torso', tor(.08, .035, [0, 1.52, .01], [PI / 2, 0, 0]), C.crimson, 'cloth');
  m.add('torso', cyl(.3, .3, .035, 18, [0, 1.28, -.17], [PI / 2, 0, 0], 1, false, 0, PI), C.crimson, 'wood');
  m.add('torso', cyl(.3, .3, .035, 18, [0, 1.28, -.17], [PI / 2, 0, 0], 1, false, PI, PI), C.black, 'wood');
  m.add('torso', [tor(.3, .02, [0, 1.28, -.19], [0, 0, 0], 1, 5, 24), sph(.07, [0, 1.28, -.2], [1, 1, .6])], C.darkIron, 'iron');
  m.add('torso', limb([-.2, 1.5, .1], [.18, 1.05, -.16], .014, .014, 5), C.leatherDk, 'leather');
  // head: face, beard, conical spangenhelm with nasal
  m.add('head', [sph(.1, [0, 1.655, .01], [.92, 1.1, 1])], C.skin, 'skin');
  m.add('head', [sph(.085, [0, 1.6, .05], [1, .85, .8]), box(.05, .08, .03, .012, [0, 1.535, .1])], '#2b1c12', 'fur');
  for (const s of [-1, 1]) m.add('head', [sph(.014, [s * .036, 1.672, .098], 1, 0, 6, 4)], '#15100c', 'skin');
  m.add('head', [cone(.122, .2, 10, [0, 1.8, 0]), cyl(.118, .118, .04, 12, [0, 1.71, 0])], C.iron, 'iron');
  m.add('head', [box(.022, .1, .015, .006, [0, 1.66, .115]), cyl(.123, .123, .018, 12, [0, 1.69, 0])], C.darkIron, 'iron');
  for (const a of [0, PI / 2, PI, PI * 1.5]) m.add('head', limb([Math.sin(a) * .118, 1.71, Math.cos(a) * .118], [0, 1.89, 0], .011, .006, 4), C.gold, 'gold');
  // arms
  m.add('armR', sph(.1, [-.25, 1.46, 0], [1, .75, 1]), C.leather, 'leather', { mirror: true });
  arm(m, { sleeve: C.crimson, fore: C.skin, foreMat: 'skin', bracer: C.leatherDk });
  // bearded axe in the right hand
  const axe = [
    [limb([0, -.18, 0], [0, .62, 0], .02, .017, 6), C.wood, 'wood'],
    [cyl(.024, .024, .07, 6, [0, .52, 0]), C.darkIron, 'iron'],
    [ext([[.03, .6], [.03, .48], [-.07, .5], [-.19, .36], [-.235, .46], [-.24, .6], [-.2, .7], [-.12, .66], [-.03, .62]].map(([x, y]) => [x * 1.45, .55 + (y - .55) * 1.6]), .02, .006), C.steel, 'steel'],
    [ext([[.03, .6], [.1, .57], [.1, .53], [.03, .5]], .03, .004), C.darkIron, 'iron'],
  ];
  for (const [g, c, mt] of axe) m.add('armR', xf(g, [-.27, .935, .1], [.3, 0, .18]), c, mt);
  // torch in the left hand; the flame is its own bone so it can stay upright and flicker
  const tp = [.27, .935, .1];
  m.add('armL', xf(limb([0, -.14, 0], [0, .44, 0], .02, .027, 6), tp, [.55, 0, 0]), C.woodDk, 'wood');
  m.add('armL', xf(cyl(.036, .03, .12, 7, [0, .4, 0]), tp, [.55, 0, 0]), C.rope, 'rope');
  m.add('flame', [cone(.055, .3, 7, [.27, 1.31 + .15, .33]), sph(.058, [.27, 1.31 + .03, .33])], C.fire, 'fire');
  m.add('flame', cone(.035, .2, 6, [.27, 1.31 + .13, .33]), '#ffd27a', 'fire');
  return m.finish();
}

// ---- ram crew: leather-capped pushers ----
function crew() {
  const m = new Model('crew', humanBones(), { cap: 64 });
  legs(m, { trouser: C.leatherDk, boot: C.leather, wraps: C.rope });
  m.add('hips', [box(.33, .2, .22, .06, [0, .98, 0]), cyl(.2, .2, .06, 12, [0, 1.03, 0], 0, [1, 1, .78])], C.leather, 'leather');
  m.add('hips', cyl(.19, .25, .3, 12, [0, .87, 0]), C.charcoal, 'cloth');
  m.add('torso', [box(.38, .43, .25, .09, [0, 1.3, 0]), cyl(.052, .06, .1, 8, [0, 1.53, 0])], C.crimsonDk, 'cloth');
  m.add('torso', [box(.41, .12, .27, .05, [0, 1.45, 0])], C.charcoal, 'cloth');
  m.add('head', sph(.1, [0, 1.655, .01], [.92, 1.1, 1]), C.skin, 'skin');
  m.add('head', sph(.08, [0, 1.6, .05], [1, .8, .8]), '#3a2618', 'fur');
  for (const s of [-1, 1]) m.add('head', [sph(.014, [s * .036, 1.672, .098], 1, 0, 6, 4)], '#15100c', 'skin');
  m.add('head', [sph(.118, [0, 1.69, 0], [1, 1, 1.05], 0, 12, 7, 0, PI * .55), cyl(.121, .121, .03, 12, [0, 1.7, 0])], C.leather, 'leather');
  m.add('armR', sph(.09, [-.25, 1.46, 0], [1, .75, 1]), C.charcoal, 'cloth', { mirror: true });
  arm(m, { sleeve: C.crimsonDk, fore: C.skin, foreMat: 'skin', bracer: C.leather });
  return m.finish();
}

// ---- man-at-arms: mail, crimson/black tabard, kettle hat, kite shield, spear ----
function manatarms() {
  const m = new Model('manatarms', humanBones(), { cap: 110 });
  legs(m, { trouser: C.mail, trouserMat: 'mail', boot: C.leatherDk, armored: true });
  m.add('hips', [box(.34, .2, .23, .06, [0, .98, 0]), cyl(.21, .27, .36, 12, [0, .85, 0])], C.mail, 'mail');
  m.add('hips', [box(.25, .46, .03, .012, [0, .83, .165], [-.08, 0, 0])], C.crimson, 'cloth');
  m.add('hips', [box(.25, .46, .03, .012, [0, .83, -.165], [.08, 0, 0])], C.black, 'cloth');
  m.add('hips', [cyl(.215, .215, .07, 12, [0, 1.03, 0], 0, [1, 1, .8])], C.leatherDk, 'leather');
  m.add('hips', box(.07, .06, .025, .01, [0, 1.03, .175]), C.gold, 'gold');
  m.add('hips', [limb([.2, .98, .02], [.22, .45, -.2], .035, .03, 6)], C.leatherDk, 'leather');
  m.add('hips', [box(.2, .025, .04, .01, [.2, 1.0, .03], [0, 0, 0]), sph(.03, [.2, 1.08, .04])], C.gold, 'gold');
  m.add('torso', [box(.39, .44, .26, .09, [0, 1.3, 0])], C.mail, 'mail');
  m.add('torso', [box(.2, .42, .285, .06, [-.095, 1.27, 0]), box(.05, .18, .3, .02, [0, 1.36, 0])], C.crimson, 'cloth');
  m.add('torso', [box(.2, .42, .285, .06, [.095, 1.27, 0])], C.black, 'cloth');
  m.add('torso', [cyl(.1, .14, .1, 12, [0, 1.52, 0])], C.steel, 'steel');
  m.add('torso', [box(.34, .05, .29, .02, [0, 1.06, 0])], C.leatherDk, 'leather');
  // layered pauldrons
  m.add('armR', [sph(.125, [-.27, 1.47, 0], [1.1, .72, 1.1], 0, 12, 7, 0, PI * .55), sph(.115, [-.28, 1.41, 0], [1.05, .7, 1.05], 0, 12, 6, PI * .25, PI * .35)], C.steel, 'steel', { mirror: true });
  m.add('armR', sph(.018, [-.27, 1.555, .06]), C.gold, 'gold', { mirror: true });
  arm(m, { sleeve: C.mail, sleeveMat: 'mail', hand: C.darkIron, handMat: 'iron', bracer: C.steel, bracerMat: 'steel' });
  m.add('head', [sph(.118, [0, 1.655, -.005], [1, 1.12, 1.05])], C.mail, 'mail');
  m.add('head', [sph(.085, [0, 1.64, .05], [.9, 1, .9])], C.skin, 'skin');
  for (const s of [-1, 1]) m.add('head', [sph(.013, [s * .033, 1.665, .128], 1, 0, 6, 4)], '#15100c', 'skin');
  m.add('head', [box(.09, .02, .03, .008, [0, 1.6, .12])], '#3a2618', 'fur');
  m.add('head', [cyl(.22, .235, .02, 16, [0, 1.735, 0]), sph(.14, [0, 1.73, 0], [1, 1.05, 1], 0, 14, 7, 0, PI / 2), box(.02, .03, .27, .01, [0, 1.87, 0])], C.steel, 'steel');
  m.add('head', [cyl(.143, .143, .025, 14, [0, 1.75, 0])], C.darkIron, 'iron');
  // spear with pennon
  const hand = [-.27, .935, .1];
  m.add('armR', xf(limb([0, -.95, 0], [0, 1.35, 0], .02, .018, 6), hand, [.08, 0, 0]), C.wood, 'wood');
  m.add('armR', xf(ext([[0, 1.35], [.035, 1.44], [.022, 1.6], [0, 1.68], [-.022, 1.6], [-.035, 1.44]], .012, .006), hand, [.08, PI / 2, 0]), C.steel, 'steel');
  m.add('armR', xf(cyl(.024, .02, .08, 6, [0, 1.33, 0]), hand, [.08, 0, 0]), C.darkIron, 'iron');
  m.add('armR', xf(ext([[0, 1.28], [0, 1.08], [-.34, 1.2]], .008, .003), hand, [.08, PI / 2 * 0 + .15, 0]), C.crimson, 'cloth');
  // kite shield on the left arm
  const sp = [.36, 1.0, .2], sr = [0, .35, 0];
  m.add('armL', xf(ext(kiteOutline(.285, .47), .02, .008, [0, 0, -.03]), sp, sr), C.darkIron, 'iron');
  const front = [
    [ext(kiteOutline(.26, .44), .03, .006), C.crimson, 'wood'],
    [ext(kiteOutline(.265, .45).map(([x, y]) => [x * .12, y]), .036, .004), C.black, 'wood'],
    ...sigilShapes(1).map(pts => [ext(pts, .012, .004, [0, .08, .026]), C.bone, 'bone']),
    [sph(.04, [0, .08, .04], [1, 1, .5]), C.gold, 'gold'],
  ];
  for (const [g, c, mt] of front) m.add('armL', xf(g, sp, sr), c, mt);
  arm(m, { side: 'L', sleeve: C.mail, sleeveMat: 'mail', hand: C.darkIron, handMat: 'iron', bracer: C.steel, bracerMat: 'steel' }, false);
  return m.finish();
}

// ---- war hound: huge black hound in crimson barding, spiked collar ----
function hound() {
  const m = new Model('hound', [
    ['body', null, [0, .74, 0]],
    ['head', 'body', [0, .9, .6]],
    ['tail', 'body', [0, .92, -.66]],
    ['legFR', 'body', [-.16, .78, .4]], ['legFL', 'body', [.16, .78, .4]],
    ['legBR', 'body', [-.15, .8, -.44]], ['legBL', 'body', [.15, .8, -.44]],
  ], { cap: 110 });
  // deep chest, tucked waist, heavy haunches
  m.add('body', [sph(.28, [0, .74, .3], [1, 1.12, 1.25]), sph(.23, [0, .76, -.34], [1, 1.02, 1.35]), limb([0, .76, .12], [0, .78, -.2], .26, .21, 10)], C.fur, 'fur');
  m.add('body', [sph(.2, [0, .58, .3], [1, .75, 1.25])], C.furLt, 'fur');
  for (let i = 0; i < 5; i++) m.add('body', cone(.07, .2, 5, [0, 1.0 - i * .015, .42 - i * .09], [-1.9, 0, 0]), i % 2 ? C.furLt : C.fur, 'fur'); // hackles
  // barding: crimson saddle cloth with black hem, iron back plate with spikes, sigil on the flanks
  m.add('body', [sph(.3, [0, .8, -.12], [1.02, 1.02, 1.5], 0, 14, 8, 0, PI * .42)], C.crimson, 'cloth');
  m.add('body', [sph(.305, [0, .8, -.12], [1.02, 1.02, 1.5], 0, 14, 2, PI * .4, PI * .07)], C.black, 'cloth');
  m.add('body', [sph(.26, [0, .86, -.12], [1, 1, 1.45], 0, 12, 5, 0, PI * .2)], C.darkIron, 'iron');
  for (const z of [-.34, -.16, .02]) m.add('body', cone(.026, .1, 5, [0, 1.13, z]), C.steel, 'steel');
  // head: thick neck with ruff, wedge skull, long muzzle, snarling jaw, ember eyes, spiked collar
  m.add('head', [limb([0, .74, .5], [0, .92, .74], .17, .12, 10), sph(.13, [0, .95, .78], [1, .92, 1.15]), limb([0, .93, .86], [0, .885, 1.1], .085, .055, 9)], C.fur, 'fur');
  for (let i = 0; i < 6; i++) { const a = (i / 5 - .5) * 2.4; m.add('head', cone(.06, .18, 4, [Math.sin(a) * .13, .8 + Math.cos(a) * .08, .6], [-1.2, 0, -a * .6]), C.furLt, 'fur'); }
  m.add('head', [limb([0, .83, .84], [0, .8, 1.04], .055, .035, 8)], C.furLt, 'fur');
  m.add('head', [box(.08, .03, .18, .01, [0, .845, .95], [.12, 0, 0])], '#5a1c1c', 'skin');
  m.add('head', [sph(.032, [0, .9, 1.11])], '#0e0c0c', 'skin');
  for (const s of [-1, 1]) {
    m.add('head', cone(.05, .15, 4, [s * .075, 1.07, .72], [-.5, 0, -s * .3]), C.fur, 'fur');
    m.add('head', [cone(.012, .055, 4, [s * .04, .86, 1.04], [PI, 0, 0]), cone(.011, .05, 4, [s * .033, .835, 1.0])], C.bone, 'bone');
    m.add('head', sph(.02, [s * .06, .98, .88]), C.ember, 'glow');
    m.add('head', box(.07, .02, .03, .008, [s * .05, 1.01, .87], [0, 0, s * .35]), C.fur, 'fur');
  }
  m.add('head', tor(.14, .03, [0, .82, .6], [PI / 2 - .55, 0, 0], 1, 6, 14), C.darkIron, 'iron');
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * PI * 2, d = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).applyEuler(new THREE.Euler(-.55, 0, 0));
    const q = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d));
    m.add('head', cone(.018, .07, 4, [d.x * .17, .82 + d.y * .17, .6 + d.z * .17], [q.x, q.y, q.z]), C.steel, 'steel');
  }
  // bushy tail
  m.add('tail', [limb([0, .92, -.66], [0, .8, -.95], .07, .06, 7), limb([0, .8, -.95], [0, .66, -1.18], .06, .02, 7)], C.fur, 'fur');
  // legs: muscular shoulder/haunch, digitigrade bends, paws
  m.add('legFR', [sph(.1, [-.15, .66, .42], [.75, 1.3, 1]), limb([-.16, .72, .42], [-.17, .4, .36], .085, .06, 8), sph(.055, [-.17, .4, .36]), limb([-.17, .4, .36], [-.17, .06, .42], .055, .045, 7), box(.1, .07, .15, .03, [-.17, .04, .46])], C.fur, 'fur', { mirror: true });
  m.add('legBR', [sph(.13, [-.13, .7, -.44], [.7, 1.2, 1.1]), limb([-.15, .74, -.42], [-.16, .44, -.3], .11, .07, 8), sph(.06, [-.16, .44, -.3]), limb([-.16, .44, -.3], [-.16, .22, -.52], .06, .045, 7), sph(.045, [-.16, .22, -.52]), limb([-.16, .22, -.52], [-.16, .05, -.46], .045, .04, 6), box(.1, .07, .15, .03, [-.16, .04, -.43])], C.fur, 'fur', { mirror: true });
  return m.finish();
}

// ---- brute: hulking ogre with a spiked, iron-banded club ----
function brute() {
  const m = new Model('brute', [
    ['hips', null, [0, 1.35, 0]], ['torso', 'hips', [0, 1.45, 0]], ['head', 'torso', [0, 2.42, .38]],
    ['armR', 'torso', [-.62, 2.28, .08]], ['armL', 'torso', [.62, 2.28, .08]],
    ['thighR', 'hips', [-.25, 1.3, 0]], ['thighL', 'hips', [.25, 1.3, 0]],
    ['shinR', 'thighR', [-.27, .72, .03]], ['shinL', 'thighL', [.27, .72, .03]],
  ], { cap: 50 });
  m.add('thighR', [limb([-.25, 1.4, 0], [-.27, .74, .03], .21, .16, 10), sph(.15, [-.27, .72, .04])], C.ogre, 'skin', { mirror: true });
  m.add('shinR', [limb([-.27, .72, .03], [-.27, .16, 0], .16, .12, 10)], C.ogre, 'skin', { mirror: true });
  m.add('shinR', [box(.3, .2, .42, .08, [-.27, .1, .08])], C.ogreDk, 'skin', { mirror: true });
  for (let i = 0; i < 3; i++) m.add('shinR', cone(.035, .07, 5, [-.27 + (i - 1) * .08, .06, .32], [PI / 2, 0, 0]), C.bone, 'bone', { mirror: true });
  for (let i = 0; i < 3; i++) m.add('shinR', cyl(.165 - i * .01, .16 - i * .01, .05, 10, [-.27, .3 + i * .1, .01], [.2, 0, 0]), i % 2 ? C.leatherDk : C.rope, 'rope', { mirror: true });
  m.add('hips', [box(.66, .38, .46, .12, [0, 1.36, 0])], C.leatherDk, 'leather');
  m.add('hips', [tor(.35, .06, [0, 1.52, .02], [PI / 2, 0, 0], [1, 1.25, 1], 6, 18)], C.leather, 'leather');
  m.add('hips', [box(.16, .14, .05, .02, [0, 1.52, .3])], C.darkIron, 'iron');
  m.add('hips', [box(.36, .62, .05, .02, [0, 1.06, .24], [-.1, 0, 0]), box(.42, .6, .05, .02, [0, 1.08, -.24], [.1, 0, 0])], C.crimsonDk, 'cloth');
  m.add('torso', [sph(.5, [0, 1.78, .14], [1, .95, .92]), sph(.52, [0, 2.15, .02], [1.28, .82, .86])], C.ogre, 'skin');
  m.add('torso', [sph(.46, [0, 2.26, -.2], [1.15, .8, .9])], C.ogreDk, 'skin');
  // harness: crossing straps, iron ring, chains
  m.add('torso', xf(xf(tor(.6, .045, [0, 0, 0], [0, 0, 0], 1, 5, 28), [0, 0, 0], [PI / 2, 0, 0], [1.08, .8, 1]), [0, 2.02, .06], [0, 0, .7]), C.leatherDk, 'leather');
  m.add('torso', [tor(.09, .025, [0, 2.02, .5], [0, 0, 0], 1, 5, 12), sph(.06, [0, 2.02, .5], [1, 1, .5])], C.darkIron, 'iron');
  // head: heavy brow, tusked underbite, ember eyes, dented iron cap
  m.add('head', [sph(.21, [0, 2.5, .45], [1, .95, 1.05]), box(.34, .2, .26, .08, [0, 2.36, .52])], C.ogre, 'skin');
  m.add('head', [box(.34, .07, .12, .03, [0, 2.56, .62])], C.ogreDk, 'skin');
  for (const s of [-1, 1]) {
    m.add('head', cone(.03, .13, 5, [s * .1, 2.46, .64], [-.2, 0, -s * .2]), C.bone, 'bone');
    m.add('head', sph(.022, [s * .07, 2.52, .66]), C.ember, 'glow');
    m.add('head', cone(.05, .16, 5, [s * .22, 2.52, .42], [0, 0, -s * 1.5]), C.ogre, 'skin');
  }
  m.add('head', [sph(.225, [0, 2.55, .42], [1, .9, 1.05], 0, 12, 6, 0, PI * .5), cyl(.228, .228, .04, 12, [0, 2.56, .42], 0, [1, 1, 1.05])], C.iron, 'iron');
  // arms
  m.add('armR', [limb([-.6, 2.33, .08], [-.8, 1.72, .12], .2, .16, 10), sph(.16, [-.8, 1.72, .14]), limb([-.8, 1.72, .14], [-.82, 1.15, .36], .17, .14, 10)], C.ogre, 'skin', { mirror: true });
  m.add('armR', [box(.3, .26, .3, .1, [-.83, 1.07, .42])], C.ogreDk, 'skin', { mirror: true });
  m.add('armR', [limb([-.81, 1.55, .2], [-.82, 1.3, .3], .18, .16, 10)], C.leatherDk, 'leather', { mirror: true });
  m.add('armR', [sph(.23, [-.63, 2.36, .08], [1, .8, 1], 0, 10, 6, 0, PI * .6)], C.leather, 'leather');
  // left pauldron: iron with spikes and a chain
  m.add('armL', [sph(.3, [.64, 2.34, .08], [1, .72, 1.05], 0, 12, 7, 0, PI * .55), sph(.28, [.68, 2.24, .08], [1, .7, 1], 0, 12, 6, PI * .3, PI * .3)], C.iron, 'iron');
  for (const [x, z] of [[.6, .08], [.75, -.05], [.75, .2]]) m.add('armL', cone(.05, .2, 5, [x, 2.52, z], [0, 0, -(x - .55) * 3]), C.steel, 'steel');
  // club
  const g = [-.83, 1.07, .42], r = [1.72, 0, .1];
  const club = [
    [limb([0, -.2, 0], [0, 1.35, 0], .07, .17, 10), C.wood, 'wood'],
    [cyl(.09, .09, .18, 8, [0, -.02, 0]), C.leatherDk, 'leather'],
    [cyl(.16, .15, .08, 10, [0, 1.1, 0]), C.darkIron, 'iron'],
    [cyl(.13, .12, .07, 10, [0, .8, 0]), C.darkIron, 'iron'],
  ];
  for (let i = 0; i < 9; i++) { const a = i * 2.3, y = .85 + (i % 3) * .17, rr = .12 + (i % 3) * .025; club.push([cone(.03, .12, 4, [Math.cos(a) * rr, y, Math.sin(a) * rr], [Math.sin(a) * PI / 2, 0, -Math.cos(a) * PI / 2]), C.steel, 'steel']); }
  for (const [geo, c, mt] of club) m.add('armR', xf(geo, g, r), c, mt);
  return m.finish();
}

// ---- battering ram: hide-roofed tortoise on four wheels, iron ram's head ----
function ram() {
  const m = new Model('ram', [
    ['frame', null, [0, 0, 0]], ['log', 'frame', [0, 1.25, 0]],
    ['wFR', 'frame', [-1.08, .56, 1.45]], ['wFL', 'frame', [1.08, .56, 1.45], 'wFR'],
    ['wBR', 'frame', [-1.08, .56, -1.45], 'wFR'], ['wBL', 'frame', [1.08, .56, -1.45], 'wFR'],
  ], { cap: 16 });
  const f = 'frame';
  for (const s of [-1, 1]) {
    m.add(f, box(.2, .22, 4.7, .03, [s * .92, .72, 0]), C.wood, 'wood');
    for (const z of [-2.15, 0, 2.15]) m.add(f, box(.16, 1.0, .16, .03, [s * .92, 1.2, z]), C.woodDk, 'wood');
    m.add(f, box(.14, .14, 4.7, .03, [s * .92, 1.5, 0]), C.wood, 'wood');
    m.add(f, limb([s * .92, .8, -2.1], [s * .92, 1.5, -.1], .05, .05, 6), C.woodDk, 'wood');
    // roof panel with overlapping hides
    const rz = s * -.68, cx = s * .55, cy = 2.12;
    m.add(f, box(1.45, .08, 4.9, .03, [cx, cy, 0], [0, 0, rz]), C.woodDk, 'wood');
    const hides = [C.hide, C.leatherDk, C.crimsonDk, C.hide, C.leather, C.crimsonDk, C.hide];
    for (let i = 0; i < 7; i++) {
      const z = -2.1 + i * .7, sh = .12 * Math.sin(i * 7.1);
      m.add(f, box(1.5 + sh * .3, .045, .84, .02, [cx + s * .03, cy + .06, z], [.04 * Math.sin(i * 3.3), 0, rz + sh * .1]), hides[i], 'hide');
    }
    for (let i = 0; i < 12; i++) m.add(f, sph(.03, [cx + s * .02 - s * .45 * Math.cos(.68), cy + .09 - .45 * Math.sin(.68) * 1, -2.3 + i * .42], 1, 0, 5, 4), C.darkIron, 'iron');
    m.add(f, box(.1, .5, 4.6, .02, [s * 1.12, 1.35, 0], [0, 0, s * .1]), C.crimsonDk, 'cloth');
  }
  m.add(f, box(1.9, .14, .14, .03, [0, .72, -2.25]), C.wood, 'wood');
  m.add(f, box(1.9, .14, .14, .03, [0, 1.1, -2.45]), C.wood, 'wood');
  m.add(f, box(1.9, .14, .14, .03, [0, .72, 2.25]), C.wood, 'wood');
  m.add(f, box(.2, .2, 5.05, .04, [0, 2.63, 0]), C.woodDk, 'wood');
  // iron-plated front gable with the host's sigil
  m.add(f, ext([[-1.12, 1.52], [1.12, 1.52], [0, 2.72]], .06, .01, [0, 0, 2.42]), C.darkIron, 'iron');
  m.add(f, ext([[-.98, 1.6], [.98, 1.6], [0, 2.6]], .04, .008, [0, 0, 2.46]), C.crimson, 'cloth');
  for (const pts of sigilShapes(1.25)) m.add(f, ext(pts, .02, .006, [0, 2.0, 2.49]), C.bone, 'bone');
  for (let i = 0; i < 9; i++) m.add(f, sph(.035, [-1 + i * .25, 1.56, 2.46], 1, 0, 5, 4), C.steel, 'iron');
  // hanging ram log
  m.add('log', [limb([0, 1.25, -2.3], [0, 1.25, 2.95], .2, .19, 12)], C.wood, 'wood');
  for (const z of [-1.6, -.2, 1.2, 2.3]) m.add('log', cyl(.215, .215, .1, 12, [0, 1.25, z], [PI / 2, 0, 0]), C.darkIron, 'iron');
  for (const z of [-1.1, 1.0]) m.add('log', [limb([0, 1.4, z], [0, 2.55, z], .025, .025, 4)], C.iron, 'iron');
  m.add('log', [sph(.27, [0, 1.25, 3.0], [.95, .92, 1.25]), cone(.12, .2, 8, [0, 1.25, 3.33], [PI / 2, 0, 0])], C.darkIron, 'iron');
  for (const s of [-1, 1]) m.add('log', tor(.14, .055, [s * .24, 1.3, 2.92], [0, PI / 2, 0], 1, 6, 12, PI * 1.6), C.iron, 'iron');
  for (const s of [-1, 1]) m.add('log', sph(.03, [s * .12, 1.36, 3.22]), C.ember, 'glow');
  // wheel (shared by all four)
  const wp = [-1.08, .56, 1.45];
  m.add('wFR', cyl(.55, .55, .16, 18, wp, [0, 0, PI / 2]), C.wood, 'wood');
  m.add('wFR', [tor(.55, .04, wp, [0, PI / 2, 0], 1, 5, 24), cyl(.12, .12, .24, 10, wp, [0, 0, PI / 2])], C.darkIron, 'iron');
  for (const a of [0, PI / 2]) m.add('wFR', box(.18, 1.02, .08, .02, wp, [a, 0, 0]), C.woodDk, 'wood');
  for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2; m.add('wFR', sph(.025, [wp[0], wp[1] + Math.cos(a) * .46, wp[2] + Math.sin(a) * .46], 1, 0, 5, 4), C.steel, 'iron'); }
  return m.finish();
}

// ---- warlord: armoured giant, horned crowned helm, crimson cape, banner, greatsword ----
function warlord() {
  const k = 1.72;
  const m = new Model('warlord', humanBones([
    ['cape', 'torso', [0, 1.5, -.17]], ['banner', 'torso', [0, 1.35, -.24]],
  ]), { cap: 6, k });
  const dk = C.darkIron, st = '#5f636b';
  legs(m, { trouser: C.black, boot: dk, armored: true, plate: st, plateMat: 'steel', trim: C.gold });
  m.add('hips', [box(.36, .22, .25, .07, [0, .98, 0])], dk, 'iron');
  for (let i = 0; i < 3; i++) m.add('hips', cyl(.22 + i * .02, .24 + i * .02, .08, 14, [0, 1.02 - i * .07, 0], 0, [1, 1, .85]), i === 0 ? C.gold : st, i === 0 ? 'gold' : 'steel');
  m.add('hips', [cyl(.22, .32, .5, 14, [0, .74, 0])], C.crimsonDk, 'cloth');
  for (const s of [-1, 1]) m.add('hips', box(.16, .26, .04, .015, [s * .13, .82, .19], [-.12, 0, s * .12]), st, 'steel');
  // cuirass
  m.add('torso', [box(.44, .46, .28, .1, [0, 1.3, -.01]), sph(.22, [0, 1.3, .04], [1, 1.15, .75])], st, 'steel');
  m.add('torso', [box(.05, .38, .06, .02, [0, 1.32, .2])], C.gold, 'gold');
  m.add('torso', [tor(.2, .012, [0, 1.12, .0], [PI / 2, 0, 0], [1.15, .72, 1], 4, 20), cyl(.13, .17, .12, 14, [0, 1.53, 0]), tor(.14, .014, [0, 1.58, 0], [PI / 2, 0, 0], 1, 4, 16)], C.gold, 'gold');
  m.add('torso', [cyl(.12, .16, .12, 14, [0, 1.52, 0])], dk, 'iron');
  m.add('torso', [box(.08, .1, .03, .01, [-.18, 1.49, -.14]), box(.08, .1, .03, .01, [.18, 1.49, -.14])], C.gold, 'gold');
  // pauldrons: three lames, gold edge, spikes
  m.add('armR', [sph(.16, [-.29, 1.48, 0], [1.15, .75, 1.1], 0, 14, 7, 0, PI * .55), sph(.15, [-.31, 1.41, 0], [1.1, .7, 1.05], 0, 14, 6, PI * .25, PI * .3), sph(.14, [-.32, 1.35, 0], [1.05, .7, 1], 0, 14, 6, PI * .25, PI * .3)], st, 'steel', { mirror: true });
  m.add('armR', [tor(.165, .01, [-.29, 1.44, 0], [PI / 2, 0, .35], [1.1, 1.05, 1], 4, 18)], C.gold, 'gold', { mirror: true });
  for (const [z, h] of [[-.07, .2], [.04, .16]]) m.add('armR', cone(.03, h, 5, [-.33, 1.6, z], [0, 0, .5]), C.steel, 'steel', { mirror: true });
  arm(m, { sleeve: C.black, fore: st, foreMat: 'steel', hand: dk, handMat: 'iron', bracer: st, bracerMat: 'steel', upper: .065 });
  m.add('armR', box(.1, .05, .1, .02, [-.27, .99, .09]), C.gold, 'gold', { mirror: true });
  // horned, crowned great helm with ember visor
  m.add('head', [cyl(.125, .13, .24, 14, [0, 1.66, 0]), sph(.128, [0, 1.78, 0], [1, .8, 1], 0, 14, 6, 0, PI / 2)], st, 'steel');
  m.add('head', [box(.2, .025, .02, .006, [0, 1.68, .127])], C.ember, 'glow');
  m.add('head', [box(.02, .14, .02, .006, [0, 1.62, .13])], C.ember, 'glow');
  m.add('head', [box(.24, .045, .03, .01, [0, 1.71, .125]), box(.04, .2, .03, .01, [0, 1.63, .128])], dk, 'iron');
  m.add('head', [cyl(.14, .14, .045, 14, [0, 1.8, 0]), tor(.14, .01, [0, 1.78, 0], [PI / 2, 0, 0], 1, 4, 16)], C.gold, 'gold');
  for (let i = 0; i < 7; i++) { const a = i / 7 * PI * 2; m.add('head', cone(.025, i % 2 ? .07 : .11, 4, [Math.sin(a) * .14, 1.85 + (i % 2 ? 0 : .02), Math.cos(a) * .14]), C.gold, 'gold'); }
  for (const s of [-1, 1]) {
    const pts = []; for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push([s * (.12 + .2 * Math.sin(t * 1.9)), 1.74 + .26 * t - .05 * Math.sin(t * 3), -.02 - .12 * t]); }
    for (let i = 0; i < 6; i++) m.add('head', limb(pts[i], pts[i + 1], .045 * (1 - i / 6.5) + .004, .045 * (1 - (i + 1) / 6.5) + .004, 7), i < 1 ? dk : C.bone, i < 1 ? 'iron' : 'bone');
  }
  // cape
  m.add('cape', cyl(.25, .5, 1.25, 16, [0, .92, -.06], [.12, 0, 0], 1, true, PI - 1.3, 2.6), C.crimson, 'cloth');
  m.add('cape', cyl(.505, .515, .08, 16, [0, .3, -.13], [.12, 0, 0], 1, true, PI - 1.3, 2.6), C.black, 'cloth');
  m.add('cape', [box(.5, .08, .12, .03, [0, 1.52, -.14])], C.crimson, 'cloth');
  // banner pole on the back
  const b = 'banner';
  m.add(b, [limb([0, .9, -.27], [0, 3.05, -.27], .018, .016, 6), box(.72, .03, .03, .01, [0, 2.92, -.27])], C.woodDk, 'wood');
  m.add(b, [sph(.04, [0, 3.07, -.27]), cone(.03, .12, 5, [0, 3.14, -.27])], C.gold, 'gold');
  m.add(b, [cone(.025, .08, 4, [-.37, 2.92, -.27], [0, 0, PI / 2]), cone(.025, .08, 4, [.37, 2.92, -.27], [0, 0, -PI / 2])], C.gold, 'gold');
  m.add(b, ext([[-.34, 2.9], [.34, 2.9], [.34, 2.0], [0, 2.16], [-.34, 2.0]], .012, .004, [0, 0, -.29]), C.crimson, 'cloth');
  m.add(b, ext([[-.34, 2.9], [.34, 2.9], [.34, 2.82], [-.34, 2.82]], .018, .004, [0, 0, -.29]), C.black, 'cloth');
  for (const pts of sigilShapes(1.2)) m.add(b, ext(pts, .02, .004, [0, 2.53, -.29]), C.bone, 'bone');
  for (const pts of sigilShapes(1.2)) m.add(b, ext(pts, .02, .004, [0, 2.53, -.29], [0, PI, 0]), C.bone, 'bone');
  // greatsword resting on the right shoulder
  const hand = [-.27, .935, .1], sr = [-.35, 0, .12];
  const sword = [
    [ext([[-.035, .12], [.035, .12], [.03, 1.2], [0, 1.3], [-.03, 1.2]], .016, .006), C.steel, 'steel'],
    [box(.34, .04, .05, .015, [0, .11, 0]), C.gold, 'gold'],
    [limb([0, -.2, 0], [0, .09, 0], .02, .02, 6), C.leatherDk, 'leather'],
    [sph(.035, [0, -.22, 0]), C.gold, 'gold'],
    [box(.012, .9, .02, .004, [0, .62, 0]), '#5a5d62', 'steel'],
  ];
  for (const [g, c, mt] of sword) m.add('armR', xf(g, hand, sr), c, mt);
  return m.finish();
}

// ---- war shaman: black-robed bone-priest with an antler crown and a skull staff that pours green light into the host ----
function shaman() {
  const m = new Model('shaman', humanBones([['totem', 'armR', [-.27, 2.2, .3]]]), { cap: 40 });
  const robe = '#2b3a2f', robeLt = '#3d4a3c', heal = '#7dffa8';
  legs(m, { trouser: robe, boot: C.leatherDk, wraps: C.rope });
  // long robe from the waist to the ankles, split at the front, crimson sash and bone charms
  m.add('hips', [cyl(.2, .36, .86, 14, [0, .58, 0], 0, 1, true, PI * .58, PI * 1.84), cyl(.2, .2, .1, 14, [0, 1.02, 0])], robe, 'cloth');
  m.add('hips', [cyl(.365, .37, .07, 14, [0, .17, 0], 0, 1, true, PI * .58, PI * 1.84)], C.crimsonDk, 'cloth');
  m.add('hips', [cyl(.215, .215, .09, 14, [0, 1.0, 0], 0, [1, 1, .85]), box(.09, .42, .03, .01, [.06, .78, .2], [-.08, 0, .06])], C.crimson, 'cloth');
  for (let i = 0; i < 5; i++) { const a = -1 + i * .5; m.add('hips', [limb([Math.sin(a) * .21, 1.0, Math.cos(a) * .17], [Math.sin(a) * .23, .86, Math.cos(a) * .19], .006, .006, 3), sph(.025, [Math.sin(a) * .23, .84, Math.cos(a) * .19])], C.bone, 'bone'); }
  // torso: robe, fur mantle, a necklace of finger bones
  m.add('torso', [box(.36, .44, .25, .09, [0, 1.3, 0]), cyl(.052, .06, .1, 8, [0, 1.53, 0])], robe, 'cloth');
  m.add('torso', [cyl(.2, .34, .24, 14, [0, 1.45, -.01], 0, [1, 1, .85])], C.fur, 'fur');
  for (let i = 0; i < 9; i++) { const a = -1.2 + i * .3; m.add('torso', cone(.012, .07, 4, [Math.sin(a) * .16, 1.38, .1 + Math.cos(a) * .06], [PI, 0, 0]), C.bone, 'bone'); }
  // head: deep hood, bone mask with green eye-light, antler crown
  m.add('head', [sph(.15, [0, 1.68, -.02], [1, 1.12, 1.1], 0, 12, 8, 0, PI * .7)], robeLt, 'cloth');
  m.add('head', [sph(.1, [0, 1.65, .04], [.95, 1.1, 1])], C.skinDk, 'skin');
  m.add('head', [ext([[-.085, .06], [.085, .06], [.07, -.06], [.03, -.12], [-.03, -.12], [-.07, -.06]], .03, .006, [0, 1.66, .125])], C.bone, 'bone');
  for (const s of [-1, 1]) m.add('head', sph(.016, [s * .035, 1.68, .145], 1, 0, 6, 4), heal, 'glow');
  for (const s of [-1, 1]) {
    const base = [s * .09, 1.78, -.02], tip = [s * .3, 2.08, -.1];
    m.add('head', [limb(base, tip, .022, .012, 5), limb([s * .2, 1.94, -.06], [s * .2, 2.12, .02], .012, .006, 4), limb([s * .26, 2.02, -.08], [s * .38, 2.14, -.02], .01, .005, 4)], C.bone, 'bone');
  }
  // arms in loose sleeves
  arm(m, { sleeve: robe, fore: robe, hand: C.skinDk, upper: .07 });
  m.add('armR', sph(.09, [-.25, 1.46, 0], [1, .75, 1]), C.fur, 'fur', { mirror: true });
  // the staff: gnarled wood, bound with cord; the totem (its own bone, so it can pulse) is a skull caged in antler
  const hand = [-.27, .935, .1];
  m.add('armR', [xf(limb([0, -.85, 0], [.02, 1.2, 0], .024, .03, 6), hand, [.05, 0, 0])], C.woodDk, 'wood');
  m.add('armR', xf(cyl(.034, .034, .14, 6, [0, .55, 0]), hand, [.05, 0, 0]), C.rope, 'rope');
  m.add('totem', [sph(.075, [-.27, 2.2, .3], [1, 1.05, 1.1]), box(.07, .04, .06, .01, [-.27, 2.14, .35])], C.bone, 'bone');
  m.add('totem', [sph(.06, [-.27, 2.2, .3], 1, 0, 8, 6)], heal, 'glow');
  for (let i = 0; i < 4; i++) { const a = i / 4 * PI * 2; m.add('totem', limb([-.27 + Math.cos(a) * .05, 2.13, .3 + Math.sin(a) * .05], [-.27 + Math.cos(a) * .13, 2.36, .3 + Math.sin(a) * .13], .012, .006, 4), C.bone, 'bone'); }
  return m.finish();
}

// ---- outrider: a mailed lancer on a barded warhorse ----
function outrider() {
  const m = new Model('outrider', [
    ['body', null, [0, 1.4, 0]],
    ['neck', 'body', [0, 1.62, .72]],
    ['tail', 'body', [0, 1.6, -.92]],
    ['legFR', 'body', [-.2, 1.25, .6]], ['legFL', 'body', [.2, 1.25, .6]],
    ['legBR', 'body', [-.2, 1.3, -.6]], ['legBL', 'body', [.2, 1.3, -.6]],
    ['rider', 'body', [0, 1.85, -.05]],
  ], { cap: 60 });
  const coat = '#3a2a20', coatDk = '#241912', mane = '#141010';
  // horse: deep chest, barrel, round haunches
  m.add('body', [sph(.4, [0, 1.38, .45], [.9, 1.05, 1.0]), limb([0, 1.38, .4], [0, 1.4, -.45], .4, .4, 12), sph(.42, [0, 1.42, -.55], [.95, 1.02, 1.0])], coat, 'hide');
  m.add('body', [sph(.3, [0, 1.12, 0], [1, .6, 1.6])], coatDk, 'hide');
  // caparison: crimson drape with a black hem and the host's sigil, saddle, iron chanfron on the head below
  m.add('body', [sph(.47, [0, 1.42, -.05], [1.02, 1.0, 1.75], 0, 16, 8, 0, PI * .44)], C.crimson, 'cloth');
  m.add('body', [sph(.475, [0, 1.42, -.05], [1.02, 1.0, 1.75], 0, 16, 2, PI * .42, PI * .06)], C.black, 'cloth');
  for (const s of [-1, 1]) for (const pts of sigilShapes(1.2)) m.add('body', ext(pts, .012, .004, [s * .47, 1.42, -.1], [0, s * PI / 2, 0]), C.bone, 'bone');
  m.add('body', [box(.42, .12, .55, .05, [0, 1.86, -.05]), box(.4, .14, .08, .03, [0, 1.96, .2]), box(.4, .16, .08, .03, [0, 1.98, -.3])], C.leatherDk, 'leather');
  for (const s of [-1, 1]) m.add('body', [limb([s * .22, 1.84, 0], [s * .27, 1.25, .05], .008, .008, 3), tor(.05, .012, [s * .27, 1.2, .05], [0, PI / 2, 0], 1, 4, 8)], C.darkIron, 'iron');
  // neck and head with mane
  m.add('neck', [limb([0, 1.55, .7], [0, 2.18, 1.08], .24, .15, 10), limb([0, 2.2, 1.08], [0, 1.96, 1.52], .14, .085, 9), sph(.14, [0, 2.18, 1.08], [1, 1.1, 1.1])], coat, 'hide');
  for (let i = 0; i < 8; i++) m.add('neck', box(.05, .16, .1, .02, [0, 1.85 + i * .05, .74 + i * .05], [-.6, 0, 0]), mane, 'fur');
  m.add('neck', [box(.17, .04, .5, .02, [0, 2.12, 1.32], [.5, 0, 0]), sph(.03, [0, 2.2, 1.18])], C.darkIron, 'iron');   // chanfron
  for (const s of [-1, 1]) { m.add('neck', cone(.035, .12, 4, [s * .06, 2.33, 1.04], [-.3, 0, s * .2]), coat, 'hide'); m.add('neck', sph(.022, [s * .085, 2.1, 1.25]), C.ember, 'glow'); }
  m.add('neck', [limb([0, 2.08, 1.35], [0, 1.85, .82], .006, .006, 3)], C.leatherDk, 'leather');   // rein
  // legs: forearm/gaskin, knee/hock, cannon, hoof with feathering
  m.add('legFR', [limb([-.2, 1.3, .62], [-.21, .68, .66], .11, .075, 8), sph(.075, [-.21, .66, .66]), limb([-.21, .66, .66], [-.21, .14, .64], .055, .05, 7), cyl(.085, .075, .12, 8, [-.21, .07, .66])], coat, 'hide', { mirror: true });
  m.add('legFR', cyl(.075, .09, .12, 8, [-.21, .2, .65]), mane, 'fur', { mirror: true });
  m.add('legBR', [limb([-.2, 1.35, -.58], [-.21, .78, -.78], .14, .08, 8), sph(.075, [-.21, .76, -.78]), limb([-.21, .76, -.78], [-.21, .14, -.66], .055, .05, 7), cyl(.085, .075, .12, 8, [-.21, .07, -.66])], coat, 'hide', { mirror: true });
  m.add('legBR', cyl(.075, .09, .12, 8, [-.21, .2, -.66]), mane, 'fur', { mirror: true });
  m.add('tail', [limb([0, 1.62, -.92], [0, 1.25, -1.15], .08, .07, 7), limb([0, 1.25, -1.15], [0, .78, -1.2], .07, .035, 7)], mane, 'fur');
  // rider: mail, tabard, kettle helm; lance couched under the right arm, kite shield on the left
  const r = 'rider';
  for (const s of [-1, 1]) {
    m.add(r, [limb([s * .13, 1.98, .02], [s * .32, 1.62, .22], .085, .07, 8), limb([s * .32, 1.62, .22], [s * .3, 1.22, .08], .065, .052, 8)], C.mail, 'mail');
    m.add(r, [box(.13, .2, .26, .04, [s * .3, 1.15, .14])], C.leatherDk, 'leather');
  }
  m.add(r, [box(.36, .46, .25, .09, [0, 2.3, 0]), cyl(.05, .058, .1, 8, [0, 2.55, 0])], C.mail, 'mail');
  m.add(r, [box(.19, .5, .27, .05, [-.09, 2.24, 0])], C.crimson, 'cloth'); m.add(r, [box(.19, .5, .27, .05, [.09, 2.24, 0])], C.black, 'cloth');
  m.add(r, [sph(.1, [0, 2.68, .01], [.92, 1.1, 1])], C.skin, 'skin');
  m.add(r, [cyl(.2, .21, .02, 14, [0, 2.79, 0]), sph(.125, [0, 2.78, 0], 1, 0, 12, 6, 0, PI / 2)], C.steel, 'steel');
  for (const s of [-1, 1]) m.add(r, sph(.12, [s * .25, 2.48, 0], [1, .75, 1]), C.steel, 'steel');
  m.add(r, [limb([-.25, 2.45, 0], [-.3, 2.2, .1], .055, .045, 7), limb([-.3, 2.2, .1], [-.26, 2.15, .32], .045, .04, 7), limb([.25, 2.45, 0], [.32, 2.2, .1], .055, .045, 7), limb([.32, 2.2, .1], [.34, 2.2, .3], .045, .04, 7)], C.mail, 'mail');
  m.add(r, [limb([-.24, 2.2, -1.0], [-.24, 2.32, 2.7], .03, .022, 6)], C.wood, 'wood');
  m.add(r, [cone(.045, .22, 6, [-.24, 2.32, 2.8], [PI / 2, 0, 0]), cyl(.06, .03, .1, 8, [-.24, 2.21, .45], [PI / 2, 0, 0])], C.steel, 'steel');
  m.add(r, ext([[0, 0], [-.42, -.08], [0, -.2]], .008, .003, [-.24, 2.3, 2.45], [0, PI / 2, 0]), C.crimson, 'cloth');
  m.add(r, xf(ext(kiteOutline(.21, .36), .02, .006), [.4, 2.15, .18], [0, PI / 2 - .25, 0]), C.crimson, 'wood');
  for (const pts of sigilShapes(.8)) m.add(r, xf(ext(pts, .012, .004, [0, .05, .016]), [.4, 2.15, .18], [0, PI / 2 - .25, 0]), C.bone, 'bone');
  return m.finish();
}

export function buildModels() {
  return { raider: raider(), crew: crew(), manatarms: manatarms(), hound: hound(), brute: brute(), ram: ram(), warlord: warlord(), shaman: shaman(), outrider: outrider() };
}
