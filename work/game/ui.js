// HUD, title/end screens, input + selection, build/upgrade menus, wave flow, camera framing.
import { THREE, scene, camera, controls, renderer, titleView, fortPoints, laneNames } from '../scene.js';
import { LEVEL, LEVELS, levelInfo, switchLevel } from '../level.js';
import { state, bus, lanes, siege } from './core.js';
import * as towers from './towers.js';
import * as enemies from './enemies.js';
import * as audio from './audio.js';
import { WAVES_BY_LEVEL, LEVEL_HP, schedule as scheduleFor, composition as compositionFor, EARLY_GOLD_PER_SEC } from './waves.js';
import { DIFFICULTIES as DIFFS, STARTING_GOLD as BASE_GOLD } from './siege.js';
import { CSS } from './ui-style.js';
import { SPRITE, icon } from './ui-icons.js';

// ── Data ──
const TOWERS = towers.TOWER_TYPES, TOWER_IDS = Object.keys(TOWERS), KEYS = `<kbd>1</kbd>–<kbd>${TOWER_IDS.length}</kbd>`;
const enemyName = id => enemies.ENEMY_TYPES[id].name;
const isBoss = id => !!enemies.ENEMY_TYPES[id].boss;
const DTYPE = { pierce: 'Piercing', blast: 'Blast', magic: 'Arcane', fire: 'Fire' };

const WAVES = WAVES_BY_LEVEL[LEVEL], SIEGE_LEVEL = { waves: WAVES, laneCount: lanes.length, hp: LEVEL_HP[LEVEL] };
const schedule = n => scheduleFor(SIEGE_LEVEL, n), composition = n => compositionFor(SIEGE_LEVEL, n);
const touch = matchMedia('(hover: none)').matches;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── DOM ──
const root = document.createElement('div');
root.id = 'cd'; root.className = 'intro';
const fl = `<svg class="fl" aria-hidden="true"><use href="#i-flourish" width="100%" height="100%"/></svg>`;
root.innerHTML = `<style>${CSS}</style>${SPRITE}
<div class="veil"></div>
<div class="top" data-r="top">
  <div class="res leather">
    <div class="stat gold" data-r="goldStat" data-tip="Gold · earned from slain foes and repelled waves">${icon('coin')}<b data-r="gold">0</b></div>
    <div class="sep"></div>
    <div class="stat lives" data-r="livesStat" data-tip="Keep strength · each foe that breaches the gate wounds it">${icon('heart')}<b data-r="lives">0</b><small data-r="maxLives"></small></div>
    <div class="sep"></div>
    <div class="stat wave" data-tip="Waves repelled of ${WAVES.length}">${icon('swords')}<span class="lbl">Wave</span><b data-r="wave">0</b><small>/${WAVES.length}</small></div>
  </div>
  <div class="herald">
    <div class="preview parch"><div class="pv-head"><span class="pv-k" data-r="pvk"></span><span class="pv-name" data-r="pvname"></span></div><div class="pv-list" data-r="pvlist"></div><div class="pv-bar" data-r="pvbar" hidden><i data-r="pvfill"></i></div></div>
    <button class="horn" data-a="horn" data-r="horn"><span class="row">${icon('horn')}<span data-r="hornlabel">Sound the Horn</span></span><span class="sub" data-r="hornsub"></span></button>
  </div>
  <div class="ctrl leather">
    <button class="ib speed" data-a="speed" data-r="speed" data-tip="Game speed" aria-label="Game speed"></button>
    <button class="ib" data-a="pause" data-r="pause" data-tip="Pause" aria-label="Pause">${icon('pause')}<span class="kbd">P</span></button>
    <button class="ib" data-a="mute" data-r="mute" data-tip="Sound" aria-label="Mute">${icon('sound')}<span class="kbd">M</span></button>
  </div>
</div>
<div class="hint parch" data-r="hint" aria-live="polite"></div>
<div class="banner" data-r="banner" aria-live="polite"></div>
<div class="breach" data-r="breach"></div>
<div class="pins" data-r="pins">${lanes.map((_, i) => `<div class="pin" hidden><b></b><span>${laneNames[i]}</span></div>`).join('')}</div>
<div class="bm" data-r="bm"></div>
<div data-r="cards"></div>
<div class="paused leather" role="dialog" aria-label="Paused">Paused
  <button class="pbtn" data-a="pause">${icon('play')} Resume <span class="kbd">P</span></button>
  <button class="pbtn" data-a="again">${icon('restart')} Restart the siege</button>
  <button class="pbtn" data-a="menu">Change battlefield</button></div>
<div class="screen title on" data-r="title">
  <div class="crest">${levelInfo.crest}</div>
  <h1 class="gtitle">${levelInfo.name}</h1>
  <div class="gsub">${levelInfo.tagline}</div>
  ${fl}
  <div class="maps" role="radiogroup" aria-label="Battlefield">${Object.entries(LEVELS).map(([k, l]) => `
    <button class="mapbtn leather ${k === LEVEL ? 'sel' : ''}" data-a="level" data-k="${k}" role="radio" aria-checked="${k === LEVEL}" tabindex="${k === LEVEL ? 0 : -1}">${icon({ castle: 'tower', frostmere: 'peak', saltreach: 'lighthouse' }[k])}<span><b>${l.name}</b><small>${l.place}</small></span><span class="best"></span></button>`).join('')}</div>
  <div class="diff" role="radiogroup" aria-label="Difficulty">${Object.entries(DIFFS).map(([k, d]) => `
    <button class="dcard leather" data-a="diff" data-k="${k}" role="radio" aria-label="${d.name}: ${d.desc} ${d.lives} keep strength, ${Math.round(BASE_GOLD * d.gold)} starting gold, foes at ${Math.round(d.hp * 100)}% toughness">${icon(d.icon)}<h3>${d.name}</h3><p>${d.desc}</p>
    <div class="m"><span title="Keep strength">${icon('heart')}${d.lives}</span><span title="Starting gold">${icon('coin')}${Math.round(BASE_GOLD * d.gold)}</span><span title="Foe toughness">${icon('skull')}${Math.round(d.hp * 100)}%</span></div></button>`).join('')}</div>
  <button class="cta" data-a="begin">Defend the Keep</button>
  <div class="how">Raise towers on the stone build sites beside the roads. Sound the horn early for bonus gold.<span class="desk"><br><kbd>Tab</kbd> sites · <kbd>O</kbd> overview · <kbd>Space</kbd> horn · ${KEYS} build · <kbd>U</kbd> upgrade · <kbd>S</kbd> sell · <kbd>F</kbd> speed · <kbd>P</kbd> pause</span></div>
</div>
<div class="screen end" data-r="end"></div>`;
document.body.appendChild(root);
const $ = {};
for (const el of root.querySelectorAll('[data-r]')) $[el.dataset.r] = el;

// ── Flow state ──
let diffKey = 'knight', muted = localStorage.getItem('cd-muted') === '1';
let final = null;
const seen = new Set();
let hover = null, hoverXY = null, preview = null, lastPointer = 'mouse';

function selectDiff(k) {
  diffKey = k; sessionStorage.setItem('cd-diff', k);
  for (const b of root.querySelectorAll('.mapbtn')) { const n = +localStorage.getItem(`cd-stars:${b.dataset.k}:${k}`) || 0; b.querySelector('.best').innerHTML = n ? icon('crown').repeat(n) : ''; b.querySelector('.best').title = n ? `Best on ${DIFFS[k].name}: ${n} of 3 crowns` : ''; }
  for (const b of root.querySelectorAll('.dcard')) { b.classList.toggle('sel', b.dataset.k === k); b.setAttribute('aria-checked', b.dataset.k === k); b.tabIndex = b.dataset.k === k ? 0 : -1; }
}
selectDiff(DIFFS[sessionStorage.getItem('cd-diff')] ? sessionStorage.getItem('cd-diff') : 'knight');

let pendingLevel = LEVEL;
function chooseLevel(k) {
  pendingLevel = k;
  for (const b of root.querySelectorAll('.mapbtn')) { const on = b.dataset.k === k; b.tabIndex = on ? 0 : -1; b.classList.toggle('sel', on); b.setAttribute('aria-checked', on); }
  const l = LEVELS[k], t = $.title;
  t.querySelector('.crest').textContent = l.crest; t.querySelector('.gtitle').textContent = l.name; t.querySelector('.gsub').textContent = l.tagline;
}
function startGame(k = diffKey, instant = false) {
  if (state.phase !== 'title') return;
  if (pendingLevel !== LEVEL) return switchLevel(pendingLevel, k);   // a level chosen with the arrows loads straight into its siege
  selectDiff(k);
  siege.start(k, SIEGE_LEVEL);
  dispGold = state.gold; lastGold = state.gold; lastLives = state.lives;
  $.title.classList.add('out'); document.activeElement?.blur(); renderer.domElement.tabIndex = 0;
  setTimeout(() => $.title.classList.remove('on', 'out'), instant ? 0 : 800);
  root.classList.remove('intro');
  controls.autoRotate = false;
  offFade = instant || reduced ? 1e-9 : 1;
  flyTo('overview', instant);
  banner(levelInfo.name, 'Prepare the Defences', 'Raise towers beside the roads, then sound the horn');
}

function onWaveStart({ wave, earlyBonus: bonus }) {
  const w = WAVES[wave - 1];
  backToFight();
  // A foe type that hasn't marched before (and has a trait worth knowing) gets named in the banner.
  const fresh = composition(wave).map(c => c.type).find(t => !seen.has(t) && enemies.ENEMY_TYPES[t].tip);
  for (const c of composition(wave)) seen.add(c.type);
  const gold = bonus ? `${icon('coin')} +${bonus} for sounding the horn early` : '';
  const sub = fresh ? `${icon(fresh)} New foe: ${enemyName(fresh)}. ${enemies.ENEMY_TYPES[fresh].tip}${gold ? `<i class="br"></i>${gold}` : ''}` : gold || (w.boss ? 'A champion leads this host' : '');
  banner(`Wave ${wave} of ${WAVES.length}`, w.name, sub, w.boss);
}

function onWaveClear({ wave: n, bonus }) {
  if (n >= WAVES.length) return;   // the last wave ends the siege; the victory screen speaks for it
  banner(`Wave ${n} repelled`, n === WAVES.length - 1 ? 'The Warlord Approaches' : 'The Line Holds', `${icon('coin')} +${bonus} bounty from the treasury`);
}

// After keyboard browsing panned the camera away, Esc or the next wave brings back the whole field.
function backToFight() { if (navMoved) { navMoved = false; flyTo('overview'); } }
function onEnd(won, { stats, crowns = 0 }) {
  final = { ...stats, crowns };
  deselect(); flyTo('title');   // the fireworks (or the flames) play out over the keep
  setTimeout(() => showEnd(won), won ? 1400 : 900);
}

// ponytail: restart reloads the page (enemies/towers expose no reset API); add module resets if reload time hurts.
function restart() { sessionStorage.setItem('cd-restart', diffKey); location.reload(); }

// ── Camera ──
// Pan limits: the lanes plus the fortress, with some margin.
const BOUNDS = (() => { const b = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity }, v = new THREE.Vector3();
  const add = (x, z) => { b.x0 = Math.min(b.x0, x - 15); b.x1 = Math.max(b.x1, x + 15); b.z0 = Math.min(b.z0, z - 15); b.z1 = Math.max(b.z1, z + 15); };
  for (const lane of lanes) for (let d = 0; d <= lane.length; d += 5) { lane.pointAt(d, v); add(v.x, v.z); }
  for (const [x, , z] of fortPoints) add(x, z);
  return b; })();
// Portrait screens try a few azimuths and keep the tightest fit; landscape keeps the classic south view.
function fitOverview() {
  const fits = (innerWidth < innerHeight ? [0, .2, .4, .6, .8] : [.16]).map(fitAt).sort((a, b) => a.dist - b.dist);
  controls.maxDistance = Math.max(260, fits[0].dist * 1.25);
  return fits[0];
}
function fitAt(az) {
  const pts = [];
  // Frame the fight, not the far ends of the roads: the first stretch of each road may sit off-screen (its pin stays at the edge).
  for (const lane of lanes) for (let d = lane.length * .28; d <= lane.length; d += 6) pts.push(lane.pointAt(d));
  for (const p of fortPoints) pts.push(new THREE.Vector3(...p));
  for (const p of towers.pads) pts.push(p.pos);
  const box = new THREE.Box3().setFromPoints(pts), target = box.getCenter(new THREE.Vector3()).setY(6);
  const cam = camera.clone(); cam.clearViewOffset();
  const dir = new THREE.Vector3(Math.sin(az), 0, Math.cos(az)).multiplyScalar(Math.cos(.86)).setY(Math.sin(.86));
  // Keep the whole map clear of the HUD: top bar and bottom hint in NDC.
  const topPx = $.top.offsetTop + $.top.offsetHeight + 12, botPx = 84;
  const yTop = 1 - 2 * topPx / innerHeight, yBot = -1 + 2 * botPx / innerHeight, xLim = innerWidth < innerHeight ? .9 : .95;
  const v = new THREE.Vector3();
  const bounds = dist => {
    cam.position.copy(target).addScaledVector(dir, dist); cam.lookAt(target); cam.updateMatrixWorld();
    let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
    for (const p of pts) { v.copy(p).project(cam); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
    return { x0, x1, y0, y1 };
  };
  let dist = 200;
  for (let iter = 0; iter < 3; iter++) {
    let lo = 40, hi = 700;
    for (let i = 0; i < 30; i++) { dist = (lo + hi) / 2; const b = bounds(dist); (b.x0 < -xLim || b.x1 > xLim || b.y0 < yBot || b.y1 > yTop) ? lo = dist : hi = dist; }
    dist = hi;
    const b = bounds(dist), right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), fwd = new THREE.Vector3(-dir.x, 0, -dir.z).normalize();
    const halfH = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * dist, halfW = halfH * cam.aspect;
    target.addScaledVector(right, ((b.x0 + b.x1) / 2) * halfW).addScaledVector(fwd, (((b.y0 + b.y1) - (yTop + yBot)) / 2) * halfH / Math.sin(.86));
  }
  return { target, pos: target.clone().addScaledVector(dir, dist), dist };
}
function getView(name) {
  if (name === 'overview') return fitOverview();
  const [tx, ty, tz, ox, oy, oz] = titleView;
  return { target: new THREE.Vector3(tx, ty, tz), pos: new THREE.Vector3(tx + ox, ty + oy, tz + oz) };
}
let tween = null;
function flyTo(name, instant = false) {
  const v = getView(name); if (!v) return;
  if (instant || reduced) { tween = null; controls.target.copy(v.target); camera.position.copy(v.pos); controls.update(); return; }
  const s0 = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target)), s1 = new THREE.Spherical().setFromVector3(v.pos.clone().sub(v.target));
  let dth = s1.theta - s0.theta; dth -= Math.round(dth / (Math.PI * 2)) * Math.PI * 2;
  tween = { t: 0, dur: 1.6, t0: controls.target.clone(), t1: v.target, s0, s1, dth };
}
controls.addEventListener('start', () => { tween = null; });
const ease = t => t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
const tmpS = new THREE.Spherical(), tmpV = new THREE.Vector3();
function updateCamera(realDt) {
  if (offFade != null) { offFade = Math.max(0, offFade - realDt / 1.6); titleOffset(ease(offFade)); if (!offFade) offFade = null; }
  if (tween) {
    tween.t = Math.min(1, tween.t + realDt / tween.dur);
    const k = ease(tween.t), { s0, s1 } = tween;
    controls.target.lerpVectors(tween.t0, tween.t1, k);
    tmpS.set(s0.radius + (s1.radius - s0.radius) * k, s0.phi + (s1.phi - s0.phi) * k, s0.theta + tween.dth * k);
    camera.position.copy(controls.target).add(tmpV.setFromSpherical(tmpS));
    if (tween.t >= 1) tween = null;
  }
  const t = controls.target, cx = THREE.MathUtils.clamp(t.x, BOUNDS.x0, BOUNDS.x1) - t.x, cz = THREE.MathUtils.clamp(t.z, BOUNDS.z0, BOUNDS.z1) - t.z;
  if (cx || cz) { t.x += cx; t.z += cz; camera.position.x += cx; camera.position.z += cz; }
}
function setupCamera() {
  controls.enablePan = true; controls.screenSpacePanning = false; controls.panSpeed = .9;
  controls.minDistance = 28; controls.maxPolarAngle = Math.PI * .44;
  controls.autoRotate = !reduced; controls.autoRotateSpeed = -.35;
  const v = getView('title'); controls.target.copy(v.target); camera.position.copy(v.pos); controls.update();
  titleOffset(); addEventListener('resize', () => { if (state.phase === 'title') titleOffset(); });
  const el = renderer.domElement;
  el.tabIndex = -1;   // nothing to do on the map until the siege begins; startGame puts it back in the tab order
  el.setAttribute('role', 'application');
  el.setAttribute('aria-label', `${levelInfo.name}, a castle tower-defense game. Click stone build sites to raise towers and click towers to upgrade or sell them. Drag to rotate, right-drag or two fingers to pan, scroll or pinch to zoom, double-click to reframe. Tab steps through build sites and arrow keys move between them; number keys build, U upgrades, S sells. Space sounds the next wave, P pauses, F changes speed.`);
  // Replace the scene's double-click reset with the game overview (capture phase runs before the canvas listener).
  addEventListener('dblclick', e => { if (e.target !== el) return; e.stopPropagation(); if (state.phase !== 'title') flyTo('overview'); }, true);
}

// Title only: shift the projection so the orbiting castle sits clear of the menu (right on desktop, low on portrait).
let offFade = null;
function titleOffset(k = 1) {
  const W = innerWidth, H = innerHeight;
  if (k <= 0) camera.clearViewOffset();
  else camera.setViewOffset(W, H, (W > 760 ? -W * .2 : 0) * k, (W > 760 ? 0 : H * .27) * k, W, H);
  camera.updateProjectionMatrix();
}

// ── Selection & highlight ──
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function pickAt(x, y) {
  ndc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  const hit = towers.pick(ray);
  return hit?.kind === 'pad' ? siteSel(hit.pad) : hit;
}
const siteSel = p => p.tower ? { kind: 'tower', tower: p.tower } : { kind: 'pad', pad: p };
const selObj = s => s && (s.tower || s.pad);
let hlKey = [null, null];
function syncHighlight() {
  // preview: the hovered build option on a pad, or 'up' while hovering a tower's Upgrade button.
  const s = state.selected || hover, p = state.selected?.kind === 'pad' ? preview : state.selected && preview === 'up' ? state.selected.tower.typeId : null;
  if (selObj(s) === hlKey[0] && p === hlKey[1]) return;
  hlKey = [selObj(s), p];
  towers.setHighlight(s, p || undefined);
}
function select(sel) {
  if (!sel) return deselect();
  state.selected = sel; preview = null; sellArmed = null;
  if (sel.kind === 'pad') openBuild(sel.pad); else openTower(sel.tower);
  bus.emit('ui:click');
}
function deselect() {
  state.selected = null; preview = null; sellArmed = null;
  $.bm.innerHTML = ''; $.bm.classList.remove('open'); $.cards.innerHTML = ''; cardEl = null; anchor = null;
}

// ── Build menu (radial) ──
let bmR = 80, anchor = null, cardEl = null, cardKind = null, cardKey = '';
function openBuild(pad) {
  anchor = pad.pos; cardEl = null; $.cards.innerHTML = ''; cardKind = 'build';
  const ids = TOWER_IDS, n = ids.length, R = bmR = (innerWidth <= 760 ? 74 : 72) + Math.max(0, n - 5) * 9;
  $.bm.innerHTML = `<div class="bm-ring"></div>` + ids.map((id, i) => {
    const a = (-135 + i * 360 / Math.max(n, 1)) * Math.PI / 180, x = Math.round(Math.cos(a) * R), y = Math.round(Math.sin(a) * R), c = TOWERS[id].levels[0].cost;
    return `<button class="bm-opt" data-a="build" data-t="${id}" style="left:${x}px;top:${y}px;--fx:${-x}px;--fy:${-y}px;animation-delay:${i * 40}ms" aria-label="Build ${TOWERS[id].name}, ${c} gold">
      <span class="med">${icon(id)}</span><span class="cost">${icon('coin')}<b>${c}</b></span><span class="kbd">${i + 1}</span></button>`;
  }).join('');
  $.bm.classList.add('open');
  refreshAfford();
}
function refreshAfford() {
  for (const b of $.bm.querySelectorAll('.bm-opt')) b.classList.toggle('poor', state.gold < TOWERS[b.dataset.t].levels[0].cost);
}
const statRows = (L, N) => [['dmg', 'Damage', L.damage, N?.damage, 0], ['range', 'Range', L.range, N?.range, 0, ' m'], ['rate', 'Rate', L.rate, N?.rate, 2, '/s']]
  .map(([ic, k, v, nv, dp, u = '']) => `${icon(ic)}<span>${k}</span><b>${+(+v).toFixed(dp)}${u}${nv != null && nv !== v ? `<em>▲ ${+(nv - v).toFixed(dp)}</em>` : ''}</b>`).join('')
  + (L.splash ? `${icon('blast')}<span>Splash</span><b>${L.splash} m</b>` : '') + (L.minRange ? `${icon('range')}<span>Dead zone</span><b>under ${L.minRange} m</b>` : '') + (L.slow ? `${icon('magic')}<span>Slows</span><b>${Math.round((1 - L.slow.factor) * 100)}%</b>` : '')
  + (L.burn ? `${icon('fire')}<span>Burns</span><b>${L.burn.dps}/s · ${L.burn.duration} s${N?.burn && N.burn.dps !== L.burn.dps ? `<em>▲ ${N.burn.dps - L.burn.dps}</em>` : ''}</b>` : '');
const cardHead = (id, def, extra = '', closable = true) => `<div class="card-h"><span class="med">${icon(id)}</span><div><div class="nm">${def.name}</div>
  <div class="dt ${def.damageType}">${icon(def.damageType in DTYPE ? def.damageType : 'pierce')}${DTYPE[def.damageType] || def.damageType || ''} damage</div>${extra}</div>
  ${closable ? `<button class="x" data-a="close" aria-label="Close">${icon('close')}</button>` : ''}</div>`;
function showBuildCard(id) {
  const def = TOWERS[id], L = def.levels[0], poor = state.gold < L.cost;
  $.cards.innerHTML = `<div class="card parch" ${still(id)}>${cardHead(id, def, '', touch)}<div class="card-b"><p class="desc">${def.description || ''}</p>
    <div class="stats">${statRows(L)}</div>
    <div class="costline"><span>Cost</span><b class="${poor ? 'poor' : ''}">${icon('coin')}${L.cost}</b></div>
    ${poor ? `<div class="need">You need ${L.cost - state.gold} more gold</div>` : touch ? `<div class="acts"><button class="btn" data-a="build" data-t="${id}">${icon('up')} Build</button></div>` : ''}</div></div>`;
  cardEl = $.cards.firstChild; cardKind = 'build'; cardKey = id + poor;
}
// Re-rendering the card already on screen (gold or kills changed) must not replay its entrance.
const still = key => `data-k="${key}"${cardEl?.isConnected && cardEl.dataset.k === String(key) ? ' style="animation:none"' : ''}`;
function setPreview(id) {
  preview = id;
  for (const b of $.bm.querySelectorAll('.bm-opt')) b.classList.toggle('hot', b.dataset.t === id);
  if (id) showBuildCard(id); else { $.cards.innerHTML = ''; cardEl = null; }
}
function build(id) {
  const sel = state.selected;
  if (sel?.kind !== 'pad' || !id || !TOWERS[id]) return;
  if (state.gold < TOWERS[id].levels[0].cost) return error(TOWERS[id].levels[0].cost, $.bm.querySelector(`[data-t=${id}]`));
  const t = towers.buildTower(sel.pad, id);
  if (!t) return error();
  deselect();
}
// Refusals say why: the gold counter shakes, the option that was asked for shakes, and the hint names the shortfall.
let denied = null;
function error(cost, el) {
  bus.emit('ui:error'); flash($.goldStat, 'poor');
  if (el) flash(el, 'deny');
  if (cost > state.gold) denied = { text: `You need ${cost - state.gold} more gold for that.`, until: performance.now() + 2200 };
}

// ── Tower panel ──
function openTower(t) { anchor = t.pos; $.bm.innerHTML = ''; $.bm.classList.remove('open'); cardKind = 'tower'; renderTower(); }
function renderTower() {
  const t = state.selected.tower, def = TOWERS[t.typeId]; if (!def) return;
  const L = def.levels[t.level], N = def.levels[t.level + 1], cost = towers.upgradeCost(t), sell = towers.sellValue(t);
  const pips = `<div class="pips">${def.levels.map((_, i) => `<i class="${i <= t.level ? 'on' : ''}"></i>`).join('')}</div>`;
  $.cards.innerHTML = `<div class="card parch tower" ${still(t.id)}>${cardHead(t.typeId, def, pips)}<div class="card-b">
    <div class="stats">${statRows(L, N)}</div><div class="rule"></div>
    <div class="kills">${icon('skull')}<span>Foes slain</span><b>${t.kills || 0}</b></div>
    <div class="acts ${cost == null ? 'solo' : ''}">${cost == null ? '' :
      `<button class="btn" data-a="upgrade" ${state.gold < cost ? 'disabled' : ''}>${icon('up')} Upgrade <span class="c">${icon('coin')}${cost}</span></button>`}
      <button class="btn sell ${sellArmed === t ? 'armed' : ''}" data-a="sell">${sellArmed === t ? 'Confirm' : 'Sell'} <span class="c">${icon('coin')}+${sell}</span></button></div>
    ${cost != null && state.gold < cost ? `<div class="need">${cost - state.gold} more gold to upgrade</div>` : ''}</div></div>`;
  cardEl = $.cards.firstChild; cardKey = towerKey(t);
}
const towerKey = t => `${t.level}|${t.kills}|${sellArmed === t}|${state.gold >= (towers.upgradeCost(t) ?? 1e9)}|${state.gold}`;
function upgrade() {
  const t = state.selected?.tower; if (!t) return;
  const cost = towers.upgradeCost(t);
  if (cost == null || state.gold < cost || !towers.upgradeTower(t)) return error(cost, cardEl?.querySelector('[data-a=upgrade]'));
  preview = null; renderTower();
}
// Selling refunds only part of the cost, so it takes a second press (click or S) to confirm.
let sellArmed = null;
function sell() {
  const t = state.selected?.tower; if (!t) return;
  if (sellArmed !== t) { sellArmed = t; bus.emit('ui:click'); return renderTower(); }
  towers.sellTower(t); deselect();
}

// ── Anchored positioning ──
const proj = new THREE.Vector3();
function placeAnchored() {
  if (!anchor) return;
  proj.copy(anchor).project(camera);
  const visible = proj.z < 1, W = innerWidth, H = innerHeight, compact = W <= 760;
  let sx = (proj.x + 1) / 2 * W, sy = (1 - proj.y) / 2 * H;
  const bmOn = $.bm.classList.contains('open');
  if (bmOn) {
    const docked = compact && W > H && cardEl;   // landscape phone: card docked right, see ui-style
    const reach = bmR + 50;   // ring radius + option medallion + price tag
    const topLimit = $.top.offsetTop + $.top.offsetHeight + reach, botLimit = H - (compact && cardEl && !docked ? cardEl.offsetHeight + 130 : reach + ($.hint.offsetHeight ? $.hint.offsetHeight + 16 : 0));
    const edge = (compact ? 74 : 72) + 52, bx = THREE.MathUtils.clamp(sx, edge, W - (docked ? cardEl.offsetWidth + 110 : edge)), by = THREE.MathUtils.clamp(sy, topLimit, Math.max(topLimit, botLimit));
    $.bm.style.transform = `translate(${bx}px,${by}px)`; $.bm.style.visibility = visible ? '' : 'hidden';
    sx = bx; sy = by;
  }
  if (cardEl && !compact) {
    const w = cardEl.offsetWidth, h = cardEl.offsetHeight, off = bmOn ? 118 : 56;
    let x = sx + off; if (x + w > W - 12) x = sx - off - w;
    const y = THREE.MathUtils.clamp(sy - h * .45, $.top.offsetTop + $.top.offsetHeight + 12, H - h - 12);
    cardEl.style.left = `${Math.max(12, x)}px`; cardEl.style.top = `${y}px`;
  }
}

// Pins count who is still to come on each road: the whole host in the build phase, then the ones not yet slain.
function setPins(counts) {
  [...$.pins.children].forEach((el, i) => { el.hidden = !counts[i]; set(el.firstChild, counts[i]); });
}
function placePins() {
  if (state.phase === 'wave') { const c = lanes.map(() => 0); for (const s of siege.pending) c[s.lane]++; for (const e of state.enemies) c[e.lane]++; setPins(c); }
  else if (state.phase !== 'build') { setPins([]); return; }
  lanes.forEach((lane, i) => {
    const el = $.pins.children[i]; if (el.hidden) return;
    proj.copy(lane.pointAt(4)).setY(proj.y + 3).project(camera);
    const x = THREE.MathUtils.clamp((proj.x + 1) / 2 * innerWidth, 60, innerWidth - 60), y = THREE.MathUtils.clamp((1 - proj.y) / 2 * innerHeight, 110, innerHeight - 70);
    el.style.transform = `translate(${x}px,${y}px)`;
  });
}

// Route trails: in the build phase, dots drift toward the gate along each road the next wave will take
// (the Frostmere lake crossing has no visible road at all).
const TRAIL_GAP = 4.5;
const trails = lanes.map(lane => {
  const dot = document.createElement('canvas'); dot.width = dot.height = 32;
  const g = dot.getContext('2d'); g.fillStyle = '#fff'; g.beginPath(); g.arc(16, 16, 12, 0, 7); g.fill();
  const n = Math.floor(lane.length / TRAIL_GAP), geo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: new THREE.CanvasTexture(dot), color: '#ffd38a', size: 6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false }));
  pts.frustumCulled = false; pts.visible = false; pts.renderOrder = 5; scene.add(pts);
  return { lane, pts, n, v: new THREE.Vector3() };
});
function updateTrails(realDt) {
  const t = performance.now() / 1000;
  trails.forEach((tr, i) => {
    const on = state.phase === 'build' && !$.pins.children[i].hidden, m = tr.pts.material;
    m.opacity = THREE.MathUtils.clamp(m.opacity + (on ? realDt : -realDt) * 2, 0, .75);
    tr.pts.visible = m.opacity > 0;
    if (!tr.pts.visible) return;
    const a = tr.pts.geometry.attributes.position, off = reduced ? 0 : (t * 3) % TRAIL_GAP;
    for (let k = 0; k < tr.n; k++) { tr.lane.pointAt(k * TRAIL_GAP + off, tr.v); a.setXYZ(k, tr.v.x, tr.v.y + .6, tr.v.z); }
    a.needsUpdate = true;
  });
}

// ── HUD refresh ──
let dispGold = state.gold, lastGold = state.gold, lastLives = state.lives, hudKey = '', hintKey = '';
function flash(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
const set = (el, v) => { v = String(v); if (el.textContent !== v) el.textContent = v; };
function refreshHud(realDt) {
  if (state.gold > lastGold) flash($.goldStat, 'gain');
  if (state.lives < lastLives) flash($.livesStat, 'hurt');
  if (state.gold !== lastGold) { refreshAfford(); lastGold = state.gold; }
  lastLives = state.lives;
  dispGold += (state.gold - dispGold) * Math.min(1, realDt * 9);
  if (Math.abs(state.gold - dispGold) < .5 || reduced) dispGold = state.gold;
  set($.gold, Math.round(dispGold)); set($.lives, Math.max(0, state.lives)); set($.maxLives, `/${state.maxLives}`); set($.wave, state.wave);
  // Herald: next-wave composition in build phase, progress while fighting.
  const fighting = state.phase === 'wave', n = fighting ? state.wave : state.wave + 1, w = WAVES[n - 1];
  const key = `${state.phase}|${n}`;
  if (key !== hudKey) {
    hudKey = key;
    set($.pvk, w ? (fighting ? 'Battle' : 'Next') : 'All waves repelled');
    set($.pvname, w ? w.name : 'The keep stands'); $.pvname.classList.toggle('boss', !!w?.boss);
    $.pvlist.innerHTML = w ? composition(n).map(c => `<span class="en ${isBoss(c.type) ? 'boss' : ''}" title="${c.count} ${enemyName(c.type)} — ${[...c.lanes].map(l => laneNames[l]).join(' & ')}">${icon(c.type)}<b>${c.count}</b></span>`).join('') : '';
    if (!fighting) setPins(lanes.map((_, i) => w ? schedule(n).filter(e => e.lane === i).length : 0));
    $.pvbar.hidden = !fighting;
  }
  const left = siege.pending.length + state.enemies.length, countdown = siege.countdown;
  if (fighting) $.pvfill.style.width = `${100 * (1 - left / Math.max(1, siege.waveSize))}%`;
  const canCall = state.phase === 'build' && state.wave < WAVES.length;
  $.horn.disabled = !canCall; $.horn.classList.toggle('ready', canCall);
  set($.hornlabel, fighting ? 'Battle Joined' : 'Sound the Horn');
  const sub = fighting ? `${left} ${left === 1 ? 'foe remains' : 'foes remain'}`
    : countdown != null ? `${icon('hourglass')}${Math.ceil(countdown)}s<span class="bonus">${icon('coin')}+${Math.round(countdown * EARLY_GOLD_PER_SEC)}</span>`
    : canCall ? (touch ? `Call wave ${n}` : `Call wave ${n} · Space`) : '';
  if ($.hornsub.dataset.v !== sub) { $.hornsub.dataset.v = sub; $.hornsub.innerHTML = sub; }
  const sp = `${icon('speed' + state.speed)}<b>${state.speed}×</b><span class="kbd">F</span>`;
  if ($.speed.dataset.v !== sp) { $.speed.dataset.v = sp; $.speed.innerHTML = sp; $.speed.setAttribute('aria-label', `Game speed ${state.speed}×`); }
  $.speed.classList.toggle('on', state.speed > 1);
  root.classList.toggle('is-paused', state.paused); root.classList.toggle('has-sel', !!state.selected); root.classList.toggle('fighting', fighting);
  const pi = state.paused ? 'play' : 'pause';
  if ($.pause.dataset.v !== pi) { $.pause.dataset.v = pi; $.pause.innerHTML = `${icon(pi)}<span class="kbd">P</span>`; $.pause.classList.toggle('on', state.paused); $.pause.dataset.tip = state.paused ? 'Resume' : 'Pause'; $.pause.setAttribute('aria-label', $.pause.dataset.tip); }
  // Contextual hint.
  const k = (d, t = d) => touch ? t : d;
  const sel = state.selected;
  const hint = sel?.kind === 'pad' ? k(`Hover a tower to preview its reach. Click or press ${KEYS} to build.`, 'Tap a tower to preview it, tap Build to raise it.')
    : sel?.kind === 'tower' && sellArmed ? k('Press <kbd>S</kbd> again to sell, <kbd>Esc</kbd> to keep the tower.', 'Tap Confirm to sell this tower.')
    : sel?.kind === 'tower' ? k(`${towers.upgradeCost(sel.tower) == null ? '' : '<kbd>U</kbd> upgrade · '}<kbd>S</kbd> sell · <kbd>Esc</kbd> close`, 'Upgrade or sell this tower. Tap the ground to close.')
    : !touch && hover?.kind === 'pad' ? `Click to choose a tower, or press ${KEYS} to build one here.`
    : fighting && !state.towers.length ? k('Foes are on the road! Click a stone build site to raise a tower.', 'Foes are on the road! Tap a stone build site to raise a tower.')
    : fighting ? k('Click a tower to upgrade it mid-battle. <kbd>F</kbd> hastens the fight, <kbd>P</kbd> pauses.', 'Tap a tower to upgrade it mid-battle.')
    : countdown != null ? 'Sound the horn early — every second saved is gold for the treasury.'
    : state.towers.length === 0 ? k('Click a stone build site beside the road to raise your first tower.', 'Tap a stone build site beside the road to raise your first tower.')
    : k('When your defences are ready, sound the horn or press <kbd>Space</kbd>.', 'When your defences are ready, sound the horn.');
  // By wave 4 the commander knows the drill: keep only the hints tied to a selection.
  const shown = denied && performance.now() < denied.until ? denied.text : sel || hover?.kind === 'pad' || state.wave < 4 ? hint : '';
  if (shown !== hintKey) { hintKey = shown; $.hint.innerHTML = shown && `${icon('crown')}<span>${shown}</span>`; if (shown) flash($.hint, 'swap'); }
}

function banner(k, t, s = '', bad = false) {
  $.banner.innerHTML = `<div class="k">${k}</div><div class="t">${t}</div><svg class="fl" aria-hidden="true"><use href="#i-flourish" width="100%" height="100%"/></svg>${s ? `<div class="s">${s}</div>` : ''}`;
  $.banner.classList.toggle('bad', bad); flash($.banner, 'show'); root.classList.add('bannered'); banner.left = 3.3;
}
// The announcement's clock only runs while it can be read: a pause or an open ring/card holds it.
function tickBanner(realDt) {
  if (!(banner.left > 0) || state.paused || state.selected) return;
  if ((banner.left -= realDt) <= 0) { $.banner.classList.remove('show'); root.classList.remove('bannered'); }
}

// ── End screens ──
function showEnd(won) {
  const f = final, stars = f.crowns, key = `cd-stars:${LEVEL}:${diffKey}`;
  const best = Math.max(stars, +localStorage.getItem(key) || 0); if (stars) localStorage.setItem(key, best);
  const ids = Object.keys(LEVELS), next = ids[ids.indexOf(LEVEL) + 1];
  const cells = [['swords', won ? WAVES.length : Math.max(0, state.wave - 1), 'Waves survived'], ['skull', f.slain, 'Foes slain'], ['coin', f.earned, 'Gold earned'], ['tower', f.built, 'Towers raised']];
  $.end.className = `screen end on ${won ? 'won' : 'lost'}`;
  root.classList.add('ended'); controls.autoRotate = !reduced;
  $.end.innerHTML = `<div class="end-card parch"><div class="end-top"><div class="medal">${icon(won ? 'crown' : 'skull')}</div></div>
    <h2>${won ? 'Victory' : 'The Keep Has Fallen'}</h2>${won ? `<div class="stars" aria-label="${stars} of 3 stars">${[1, 2, 3].map(i => `<i class="${i <= stars ? 'on' : ''}" style="animation-delay:${.9 + i * .25}s">${icon('crown')}</i>`).join('')}</div>` : ''}${fl}
    <p class="lead">${won ? levelInfo.won : `The gate gave way during wave ${state.wave}.${Math.max(...f.leaks) ? ` Most of the breach came by the ${laneNames[f.leaks.indexOf(Math.max(...f.leaks))]}: strengthen the towers there.` : ''}`}</p>
    <div class="ledger">${cells.map(([ic, v, l]) => `<div>${icon(ic)}<b data-to="${v}">0</b><span>${l}</span></div>`).join('')}</div>
    ${won && stars < 3 ? `<p class="lead" style="margin-top:-6px;font-size:14px">${stars === 2 ? 'Lose fewer than a fifth of the keep for the third crown.' : 'Keep more of the walls standing for more crowns.'}</p>` : ''}
    ${won && next ? `<button class="cta" data-a="next">Onward to ${LEVELS[next].name}</button><button class="link" data-a="again" style="margin-top:10px">Defend ${levelInfo.name} again</button>` : `<button class="cta" data-a="again">${won ? 'Play Again' : 'Rise Again'}</button>`}
    <button class="link" data-a="menu">${levelInfo.name} · ${DIFFS[diffKey].name} — change battlefield or difficulty</button></div>`;
  $.end.querySelector('.cta').focus({ preventScroll: true });
  const nums = [...$.end.querySelectorAll('[data-to]')], t0 = performance.now();
  (function tick(now) {
    const k = reduced ? 1 : Math.min(1, (now - t0 - 500) / 1400), e = 1 - (1 - Math.max(0, k)) ** 3;
    for (const b of nums) b.textContent = Math.round(b.dataset.to * e);
    if (k < 1) requestAnimationFrame(tick);
  })(t0);
}

// ── Input ──
function toggle(action) {
  if (action === 'speed') state.speed = state.speed % 3 + 1;
  else if (action === 'pause') {
    if (state.phase !== 'build' && state.phase !== 'wave') return;
    state.paused = !state.paused;
    root.classList.toggle('is-paused', state.paused);   // show the menu now, so its first button can take focus
    if (state.paused) { deselect(); root.querySelector('.pbtn').focus({ preventScroll: true }); }
    else document.activeElement?.blur();
  }
  else if (action === 'mute') { muted = !muted; localStorage.setItem('cd-muted', muted ? '1' : '0'); showMute(); }
}
function showMute() {
  audio.setMuted(muted); $.mute.innerHTML = `${icon(muted ? 'mute' : 'sound')}<span class="kbd">M</span>`; $.mute.classList.toggle('on', muted);
  $.mute.dataset.tip = muted ? 'Sound off' : 'Sound on'; $.mute.setAttribute('aria-pressed', muted);
}
function act(a, el, e) {
  if (a === 'diff') return selectDiff(el.dataset.k), bus.emit('ui:click');
  if (a === 'level') return bus.emit('ui:click'), chooseLevel(el.dataset.k), switchLevel(el.dataset.k);
  if (a === 'begin') return bus.emit('ui:click'), startGame();
  if (a === 'again' && el.classList.contains('pbtn') && !el.classList.contains('armed')) {   // abandoning a run in progress takes a second press
    el.classList.add('armed'); el.lastChild.textContent = ' Abandon this siege? Press again';
    clearTimeout(act.t); act.t = setTimeout(() => { el.classList.remove('armed'); el.lastChild.textContent = ' Restart the siege'; }, 3000);
    return bus.emit('ui:click');
  }
  if (a === 'again') return bus.emit('ui:click'), restart();
  if (a === 'menu') return bus.emit('ui:click'), location.reload();
  if (a === 'next') { bus.emit('ui:click'); const ids = Object.keys(LEVELS); return switchLevel(ids[ids.indexOf(LEVEL) + 1], diffKey); }
  if (a === 'horn') return bus.emit('ui:click'), siege.callWave();
  if (a === 'close') return deselect();
  if (a === 'upgrade') return upgrade();
  if (a === 'sell') return sell();
  if (a === 'build') {
    const id = el.dataset.t;
    if (touch && lastPointer !== 'mouse' && el.classList.contains('bm-opt') && preview !== id) return setPreview(id);
    return build(id);
  }
  bus.emit('ui:click'); toggle(a);
}
root.addEventListener('click', e => { const el = e.target.closest('[data-a]'); if (el && !el.disabled) act(el.dataset.a, el, e); });
root.addEventListener('pointerover', e => {
  if (e.pointerType !== 'mouse') return;
  const el = e.target.closest('.bm-opt'); if (el) setPreview(el.dataset.t);
  if (e.target.closest('[data-a=upgrade]')) preview = 'up';
});
root.addEventListener('pointerout', e => {
  if (e.pointerType !== 'mouse') return;
  const el = e.target.closest('.bm-opt, [data-a=upgrade]'); if (!el || el.contains(e.relatedTarget)) return;
  if (el.dataset.a === 'upgrade') preview = null; else setPreview(null);
});

addEventListener('pointerdown', e => { lastPointer = e.pointerType; audio.unlock(); }, true);

function setupPointer() {
  const el = renderer.domElement;
  let down = null;
  el.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  el.addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 7 || performance.now() - down.t > 600 || e.button !== 0) return (down = null);
    down = null;
    if (state.phase !== 'build' && state.phase !== 'wave') return;
    let hit = pickAt(e.clientX, e.clientY);
    if (!hit && e.pointerType !== 'mouse') {
      let best = 24;
      for (const p of towers.pads) { proj.copy(p.pos).project(camera); const d = Math.hypot((proj.x + 1) / 2 * innerWidth - e.clientX, (1 - proj.y) / 2 * innerHeight - e.clientY); if (proj.z < 1 && d < best) { best = d; hit = siteSel(p); } }
    }
    if (hit && selObj(hit) !== selObj(state.selected)) select(hit); else if (state.selected) deselect();
  });
  el.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') hoverXY = [e.clientX, e.clientY]; });
  el.addEventListener('pointerleave', () => { hoverXY = null; hover = null; });
}

// ── Keyboard site navigation ──
// With the map focused, Tab / Shift+Tab sweep the build sites around the keep; while one is selected the arrow keys
// jump to the nearest site in that direction on screen. The camera eases over to keep the choice in view.
const toScreen = v => { proj.copy(v).project(camera); return [proj.x * innerWidth / 2, -proj.y * innerHeight / 2]; };
let lastSite = null, navMoved = false;   // so Tab after building carries on from the site just used
// Tab walks each road from the gate outward, one road after another (sites shared by roads go with the nearest).
let siteOrder;
function orderSites() {
  const v = new THREE.Vector3();
  const key = p => { let best = [0, 1e9, 0]; lanes.forEach((l, i) => { for (let d = 0; d <= l.length; d += 2) { l.pointAt(d, v); const k = Math.hypot(v.x - p.pos.x, v.z - p.pos.z); if (k < best[1]) best = [i, k, l.length - d]; } }); return best[0] * 1e4 + best[2]; };
  const keys = new Map(towers.pads.map(p => [p, key(p)]));
  siteOrder = [...towers.pads].sort((a, b) => keys.get(a) - keys.get(b));
}
function keyNav(step, dir) {
  const pads = towers.pads, cur = selObj(state.selected)?.pad || selObj(state.selected) || lastSite;
  let next;
  if (!cur) next = pads.reduce((b, p) => Math.hypot(...toScreen(p.pos)) < Math.hypot(...toScreen(b.pos)) ? p : b);
  else if (step) {
    next = siteOrder[(siteOrder.indexOf(cur) + step + siteOrder.length) % siteOrder.length];
  } else {
    const [cx, cy] = toScreen(cur.pos);
    let best = Infinity;
    for (const p of pads) {
      if (p === cur) continue;
      const [x, y] = toScreen(p.pos), along = (x - cx) * dir[0] + (y - cy) * dir[1], side = Math.abs((x - cx) * dir[1] - (y - cy) * dir[0]);
      if (along > 1 && along + side * 2 < best) { best = along + side * 2; next = p; }
    }
  }
  if (!next) return;
  select(siteSel(next)); lastSite = next;
  const [x, y] = toScreen(next.pos);
  if (Math.abs(x) > innerWidth * .38 || Math.abs(y) > innerHeight * .33) {
    const s0 = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    tween = { t: 0, dur: .6, t0: controls.target.clone(), t1: next.pos.clone(), s0, s1: s0, dth: 0 }; navMoved = true;
  }
}
const ARROWS = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] };
// Open dialogs (pause, end screen) keep Tab cycling through their own buttons.
addEventListener('keydown', e => {
  if (e.key !== 'Tab') return;
  const dlg = $.end.classList.contains('on') ? $.end : state.paused ? root.querySelector('.paused') : null; if (!dlg) return;
  const b = [...dlg.querySelectorAll('button')]; if (!b.length) return;
  const i = b.indexOf(document.activeElement), n = i < 0 ? 0 : (i + (e.shiftKey ? -1 : 1) + b.length) % b.length;
  e.preventDefault(); e.stopImmediatePropagation(); b[n].focus();
}, true);
// Capture phase: with a site selected, arrows navigate instead of orbiting the camera (scene.js listens on the canvas).
addEventListener('keydown', e => {
  if ((state.phase !== 'build' && state.phase !== 'wave') || e.metaKey || e.ctrlKey || e.altKey) return;
  const key = e.key.toLowerCase(), onMap = e.target === document.body || e.target === renderer.domElement;
  if (key === 'tab' && onMap && !state.paused) { e.preventDefault(); keyNav(e.shiftKey ? -1 : 1); }
  else if (ARROWS[key] && state.selected) { e.preventDefault(); e.stopPropagation(); keyNav(0, ARROWS[key]); }
}, true);

addEventListener('keydown', e => {
  audio.unlock();
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const key = e.key.toLowerCase();
  // Title: Space activates the focused button (choose a card); Enter begins the siege, with the focused difficulty.
  if (state.phase === 'title') {
    const btn = e.target.closest?.('#cd button');
    if (btn?.dataset.a === 'diff' && (key === 'arrowleft' || key === 'arrowright')) {   // radio group: arrows move the choice
      const ks = Object.keys(DIFFS), k = ks[(ks.indexOf(btn.dataset.k) + (key === 'arrowright' ? 1 : ks.length - 1)) % ks.length];
      e.preventDefault(); selectDiff(k); root.querySelector(`.dcard[data-k=${k}]`).focus(); return;
    }
    if (btn?.dataset.a === 'level' && (key === 'arrowleft' || key === 'arrowright')) {   // focus moves; Space switches level
      const bs = [...root.querySelectorAll('.mapbtn')], k = (bs.indexOf(btn) + (key === 'arrowright' ? 1 : bs.length - 1)) % bs.length;
      e.preventDefault(); chooseLevel(bs[k].dataset.k); bs[k].focus(); return;   // like the difficulty cards: arrows choose; the world loads when the siege begins
    }
    if (key === ' ' && btn) return;
    if (key === 'enter' || key === ' ') { e.preventDefault(); if (btn?.dataset.a === 'diff') selectDiff(btn.dataset.k); startGame(); }
    return;
  }
  if (state.phase === 'won' || state.phase === 'lost') { if (key === 'enter' && $.end.classList.contains('on') && !e.target.closest?.('#cd button')) restart(); return; }
  if ((key === ' ' || key === 'enter') && e.target.closest?.('#cd button')) return;   // a focused button keeps its own Space/Enter
  if (key === ' ') { e.preventDefault(); if (!state.paused) siege.callWave(); }
  else if (key === 'p') toggle('pause');
  else if (key === 'f') toggle('speed');
  else if (key === 'm') toggle('mute');
  else if (key === 'escape') { if (state.selected) { deselect(); backToFight(); } else toggle('pause'); }
  else if (key === 'u') upgrade();
  else if (key === 's') sell();
  else if (key >= '1' && key <= '9' && TOWER_IDS[key - 1]) {
    // Build on the selected site, or straight onto the hovered one without opening its menu.
    const id = TOWER_IDS[key - 1];
    if (state.selected?.kind === 'pad') build(id);
    else if (!state.selected && hover?.kind === 'pad') { state.selected = hover; build(id); if (state.selected) deselect(); }
  }
  else if (key === 'home' || key === 'o') flyTo('overview');
});

// ── Module API ──
export function init() {
  setupCamera(); setupPointer(); showMute(); orderSites();
  // Leaving the tab mid-siege: come back to the pause menu rather than straight into the fight.
  document.addEventListener('visibilitychange', () => { if (document.hidden && !state.paused) toggle('pause'); });
  bus.on('wave:start', onWaveStart);
  bus.on('wave:clear', onWaveClear);
  bus.on('game:won', r => onEnd(true, r));
  bus.on('game:lost', r => onEnd(false, r));
  bus.on('enemy:leak', () => flash($.breach, 'on'));
  bus.on('tower:sell', ({ tower }) => { if (state.selected?.tower === tower) deselect(); });
  const again = sessionStorage.getItem('cd-restart');
  if (again && DIFFS[again]) { sessionStorage.removeItem('cd-restart'); requestAnimationFrame(() => startGame(again, true)); }
}

export function update(dt, realDt = dt) {
  updateCamera(realDt);
  // Hover highlight: one raycast per frame at most, only when the mouse moved.
  if (hoverXY && (state.phase === 'build' || state.phase === 'wave')) {
    hover = pickAt(...hoverXY); hoverXY = null;
    renderer.domElement.style.cursor = hover ? 'pointer' : '';
  }
  syncHighlight();
  if (state.phase !== 'title') refreshHud(realDt);
  if (state.selected?.kind === 'tower' && cardKey !== towerKey(state.selected.tower)) renderTower();
  if (state.selected?.kind === 'pad' && preview && cardKey !== preview + (state.gold < TOWERS[preview].levels[0].cost)) showBuildCard(preview);
  placeAnchored(); placePins(); updateTrails(realDt); tickBanner(realDt);
}

export const debug = {
  start: (k = 'knight') => startGame(k, true),
  skipToWave(n) {
    if (state.phase === 'title') startGame(diffKey, true);
    siege.skipTo(n);
  },
  give: g => siege.earn(g),
  select, deselect,
  preview: id => setPreview(id),
  win: () => siege.end(true),
  lose: () => siege.end(false),
  get stats() { return siege.stats; },
};
