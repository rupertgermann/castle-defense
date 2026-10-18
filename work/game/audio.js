// Audio: fully procedural WebAudio. SFX are pre-rendered from recipes (audio-synth.js) and replayed with voice limiting,
// density ducking, pitch/gain jitter and camera-relative panning. Music and ambience are generated live by a look-ahead scheduler.
import { state, bus } from './core.js';
import { THREE, camera, controls, world } from '../scene.js';
import * as enemyModule from './enemies.js';
import { SR, SOUNDS, renderSound, pluck, noiseBuffer, impulse } from './audio-synth.js';

// Mix table: gain on top of the recipe level, max simultaneous voices, min seconds between triggers,
// pitch/gain jitter, reverb send, bus.
const MIX = {
  arrow: { max: 6, gap: .035, pj: .08 },
  bolt: { max: 3, gap: .08, send: .08 },
  cannon: { max: 3, gap: .1, send: .18 },
  explosion: { max: 3, gap: .09, send: .22 },
  arcane: { max: 4, gap: .05, send: .25 },
  arcaneHit: { max: 4, gap: .05, send: .2 },
  hitFlesh: { max: 5, gap: .03, pj: .1 },
  hitArmor: { max: 4, gap: .05, pj: .06, send: .1 },
  death: { max: 4, gap: .06, pj: .08 },
  coin: { max: 3, gap: .08, pj: .05 },
  gate: { max: 1, gap: .45, send: .3 },
  alarm: { max: 1, gap: 2.5, pj: 0, send: .35 },
  build: { max: 2, gap: .2, send: .12 },
  upgrade: { max: 2, gap: .2, pj: 0, send: .3 },
  sell: { max: 2, gap: .2, send: .12 },
  click: { max: 3, gap: .04, bus: 'ui' },
  hover: { max: 2, gap: .04, bus: 'ui', gj: .1 },
  error: { max: 1, gap: .15, pj: 0, bus: 'ui' },
  horn: { max: 1, gap: 2, pj: 0, send: .45 },
  drums: { max: 1, gap: 2, pj: 0, send: .3 },
  clear: { max: 1, gap: 1, pj: 0, send: .4, bus: 'ui' },
  won: { max: 1, gap: 2, pj: 0, send: .45, bus: 'ui' },
  lost: { max: 1, gap: 2, pj: 0, send: .45, bus: 'ui' },
  bird: { max: 3, gap: .3, pj: .1, bus: 'amb', send: .3 },
  dum: { max: 4, gap: .02, pj: .02, bus: 'music' },
  tek: { max: 4, gap: .02, pj: .04, bus: 'music' },
};
const FIRE = { arrow: 'arrow', bolt: 'bolt', cannonball: 'cannon', arcane: 'arcane', firepot: 'bolt', boulder: 'bolt' };

const bank = {};              // name → AudioBuffer[]
let bankReady = null, ctx = null, eng = null, muted = false, mode = null, paused = false;
const vol = { master: .9, music: .45, sfx: 1 };

// ---------- engine (one per AudioContext; the offline test builds its own) ----------
function createEngine(c) {
  const gain = (v = 1, to) => { const n = c.createGain(); n.gain.value = v; if (to) n.connect(to); return n; };
  const out = gain(muted ? 0 : vol.master, c.destination);
  // Safety clipper: linear to 0.8, soft knee to 0.98. Input pre-scaled by 0.5 so the curve covers ±2.
  const shaper = c.createWaveShaper(), curve = new Float32Array(2048);
  for (let i = 0; i < curve.length; i++) { const x = (i / (curve.length - 1) * 2 - 1) * 2, a = Math.abs(x); curve[i] = Math.sign(x) * (a < .8 ? a : .8 + .18 * Math.tanh((a - .8) / .18)); }
  shaper.curve = curve; shaper.oversample = '2x'; shaper.connect(out);
  const lim = c.createDynamicsCompressor();
  lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = .001; lim.release.value = .1;
  lim.connect(gain(.5, shaper));
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 3; comp.attack.value = .004; comp.release.value = .22;
  comp.connect(gain(.85, lim));
  const mix = gain(1, comp);
  const conv = c.createConvolver(); conv.buffer = impulse(); conv.connect(gain(.32, mix));
  const musicLP = c.createBiquadFilter(); musicLP.frequency.value = 18000; musicLP.connect(mix);
  const buses = {
    music: gain(vol.music, musicLP), sfxPause: gain(1, mix), ui: gain(vol.sfx, mix), amb: gain(vol.sfx * .9, mix),
  };
  buses.sfx = gain(vol.sfx, buses.sfxPause);
  const sfxRev = gain(1, conv), musicRev = gain(.28, conv); buses.music.connect(musicRev);
  const stats = {}; let ends = [];

  // Play a pre-rendered sound. opts: pos (Vector3, world), pan, gain, rate, when (ctx time), dest (override node).
  function play(name, { pos = null, pan = 0, gain: g = 1, rate = 1, when = 0, dest = null } = {}) {
    const vars = bank[name], m = MIX[name] || {}; if (!vars || !vars.length) return;
    const t = Math.max(c.currentTime, when), s = stats[name] ||= { last: -9, ends: [], recent: [] };
    if (t - s.last < (m.gap ?? .03) * (.7 + Math.random() * .6)) return;
    s.ends = s.ends.filter(e => e > t); ends = ends.filter(e => e > t);
    if (s.ends.length >= (m.max ?? 4) || ends.length >= 40) return;
    s.recent = s.recent.filter(x => t - x < .3); s.recent.push(t); s.last = t;
    if (pos) { const sp = spatial(pos); pan = sp.pan; g *= sp.gain; }
    g *= (1 - (m.gj ?? .15) * Math.random()) / (m.bus === 'music' ? 1 : Math.sqrt(s.recent.length)); // many at once → each quieter, sum stays sane
    const buf = vars[Math.floor(Math.random() * vars.length)], src = c.createBufferSource();
    src.buffer = buf; src.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * (m.pj ?? .05));
    const vg = gain(g), p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan));
    src.connect(vg).connect(p).connect(dest || buses[m.bus || 'sfx']);
    if (m.send) p.connect(gain(m.send, m.bus ? conv : sfxRev));
    src.start(t);
    const end = t + buf.duration / src.playbackRate.value; s.ends.push(end); ends.push(end);
  }

  const music = createMusic(c, buses.music, play);
  const amb = createAmbience(c, buses.amb, play, world.fx.ambient === 'snow', world.fx.sound === 'surf');
  function setPaused(p) {
    const t = c.currentTime;
    for (const [param, v] of [[buses.sfxPause.gain, p ? 0 : 1], [sfxRev.gain, p ? 0 : 1], [musicLP.frequency, p ? 700 : 18000], [buses.music.gain, vol.music * (p ? .6 : 1)]]) param.setTargetAtTime(v, t, .08);
  }
  function setVolumes() {
    const t = c.currentTime;
    out.gain.setTargetAtTime(muted ? 0 : vol.master, t, .05);
    buses.music.gain.setTargetAtTime(vol.music * (paused ? .6 : 1), t, .05);
    for (const b of [buses.sfx, buses.ui]) b.gain.setTargetAtTime(vol.sfx, t, .05);
    buses.amb.gain.setTargetAtTime(vol.sfx * .9, t, .05);
  }
  return { play, music, amb, setPaused, setVolumes };
}

// Pan from the camera-space x of the source; attenuate with distance relative to the orbit focus and when off-screen.
const _v = new THREE.Vector3();
function spatial(pos) {
  _v.copy(pos).project(camera);
  const d = camera.position.distanceTo(pos), ref = Math.max(20, camera.position.distanceTo(controls.target));
  const off = _v.z > 1 ? 2 : Math.max(Math.abs(_v.x), Math.abs(_v.y));
  let g = Math.max(.15, Math.min(1, ref / Math.max(1, d)) ** 1.2);
  if (off > 1) g *= Math.max(.3, 1 - (off - 1) * .7);
  return { pan: (_v.z > 1 ? -_v.x : _v.x) * .7, gain: g };
}

// ---------- music: D Dorian, generative ----------
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const CHORDS = { Dm: [0, 3, 7], G: [5, 9, 12], C: [-2, 2, 5], Am: [7, 10, 14], F: [3, 7, 10], Em: [2, 5, 9] };
const NEXT = { Dm: ['G', 'C', 'Am', 'F', 'G'], G: ['Dm', 'C', 'Am', 'Dm'], C: ['Dm', 'F', 'G', 'Am'], Am: ['Dm', 'G', 'C', 'Em'], F: ['C', 'G', 'Dm'], Em: ['Am', 'Dm', 'G'] };
const ARPS = [[0, 1, 2, 3, 4, 3, 2, 1], [0, 2, 4, null, 3, null, 2, null], [0, null, 2, 1, 3, null, 4, null], [0, 1, 2, null, null, null, null, null], [0, 2, 1, 3, 2, 4, 3, 5]];
// Motif rhythms in sixteenths: [start, length].
const CALM_RHY = [[[0, 4], [4, 2], [6, 2], [8, 8]], [[0, 6], [6, 2], [8, 4], [12, 4]], [[4, 4], [8, 2], [10, 2], [12, 4]], [[0, 2], [2, 2], [4, 4], [8, 4], [12, 4]]];
const WAR_RHY = [[[0, 2], [2, 1], [3, 1], [4, 2], [6, 2], [8, 3], [11, 1], [12, 4]], [[0, 3], [3, 3], [6, 2], [8, 2], [10, 2], [12, 2], [14, 2]], [[0, 1], [1, 1], [2, 2], [4, 4], [8, 1], [9, 1], [10, 2], [12, 4]]];
const pick = a => a[Math.floor(Math.random() * a.length)];
const degMidi = (deg, base) => base + DORIAN[((deg % 7) + 7) % 7] + 12 * Math.floor(deg / 7);

function createMusic(c, dest, play) {
  const BPM = 84, BEAT = 60 / BPM, BAR = BEAT * 4, S16 = BEAT / 4;
  const g = v => { const n = c.createGain(); n.gain.value = v; n.connect(dest); return n; };
  const layers = { calm: g(0), battle: g(0), drone: g(0) }, target = { calm: 0, battle: 0, drone: 0 };
  // Drone: D2 + A2 saws, D3 sine, through a slowly breathing lowpass.
  const lp = c.createBiquadFilter(); lp.frequency.value = 330; lp.Q.value = .8; lp.connect(layers.drone);
  const lfo = c.createOscillator(), lfoG = c.createGain(); lfo.frequency.value = .06; lfoG.gain.value = 120; lfo.connect(lfoG).connect(lp.frequency); lfo.start();
  for (const [f, type, v, det] of [[73.42, 'sawtooth', .05, -4], [73.42, 'sawtooth', .05, 5], [110, 'sawtooth', .035, 2], [146.83, 'sine', .06, 0]]) {
    const o = c.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = det; const og = c.createGain(); og.gain.value = v; o.connect(og).connect(lp); o.start();
  }
  let nextBar = c.currentTime + .1, bar = 0, chord = 'Dm', calmMotif = null, warMotif = null;
  const pans = { calm: 0, battle: 0 };

  function note(midi, t, vel, kind, layer, pan = 0) {
    const p = pluck(midi, kind), s = c.createBufferSource(), v = c.createGain(), sp = c.createStereoPanner();
    s.buffer = p.buffer; s.playbackRate.value = p.rate; v.gain.value = vel; sp.pan.value = pan;
    s.connect(v).connect(sp).connect(layers[layer]); s.start(t + (Math.random() - .5) * .012);
  }
  const chordTone = (k, base) => { const ch = CHORDS[chord]; return base + ch[((k % 3) + 3) % 3] + 12 * Math.floor(k / 3); };
  const snapToChord = midi => { let best = midi, bd = 99; for (let o = -24; o <= 24; o += 12) for (const x of CHORDS[chord]) { const m = 62 + x + o, d = Math.abs(m - midi); if (d < bd) { bd = d; best = m; } } return best; };
  function makeMotif(rhythms, startDeg) {
    let deg = startDeg; return pick(rhythms).map(([s, l]) => { deg += pick([-2, -1, -1, 0, 1, 1, 2, 3, -3]); deg = Math.max(startDeg - 4, Math.min(startDeg + 6, deg)); return [s, l, deg]; });
  }
  function playMotif(motif, t, shift, base, kind, layer, vel, cadence) {
    for (let i = 0; i < motif.length; i++) {
      const [s, l, d] = motif[i]; let m = degMidi(d + shift, base);
      if (s % 8 === 0) m = snapToChord(m);                  // strong beats land on chord tones
      if (cadence && i === motif.length - 1) m = snapToChord(62 + CHORDS[chord][0] + (base - 62));
      note(m, t + s * S16, vel * (s % 4 === 0 ? 1 : .8) * (.9 + Math.random() * .2), kind, layer, .15);
      if (cadence && i === motif.length - 1) break;
    }
  }
  function scheduleBar(t) {
    const phraseBar = bar % 4, battleOn = target.battle > 0 || layers.battle.gain.value > .01, calmOn = target.calm > 0 || layers.calm.gain.value > .01;
    if (bar > 0 && (battleOn || bar % 2 === 0)) chord = pick(NEXT[chord]);
    if (phraseBar === 3 && Math.random() < .5) chord = pick(['Dm', 'Am', 'G']);  // lean home at phrase ends
    if (phraseBar === 0) {
      calmMotif = Math.random() < .7 ? makeMotif(CALM_RHY, Math.floor(Math.random() * 5)) : null;
      warMotif = Math.random() < .8 ? makeMotif(WAR_RHY, 2 + Math.floor(Math.random() * 5)) : null;
      pans.calm = (Math.random() - .5) * .5;
    }
    const r = ((CHORDS[chord][0] % 12) + 12) % 12, bassMidi = 38 + r - (r > 7 ? 12 : 0);
    if (calmOn) {
      note(bassMidi + 12, t, .45, 'harp', 'calm', -.2);
      if (Math.random() > .12) {
        const arp = pick(ARPS);
        arp.forEach((k, i) => { if (k !== null && Math.random() > .1) note(chordTone(k, 50), t + i * BEAT / 2, .22 + Math.random() * .1, 'harp', 'calm', pans.calm - .2 + k * .08); });
      }
      if (calmMotif && !battleOn) playMotif(calmMotif, t, phraseBar === 1 ? pick([-1, 1, 2]) : 0, 62, 'harp', 'calm', .42, phraseBar === 3);
    }
    if (battleOn) {
      // Ostinato in 3+3+2 accents, root-fifth-octave.
      const fig = [0, 7, 12, 7, 0, 7, 12, 7], acc = [1, 0, 0, 1, 0, 0, 1, 0];
      fig.forEach((iv, i) => note(bassMidi + 12 + iv, t + i * BEAT / 2, acc[i] ? .42 : .24, 'lute', 'battle', -.25));
      // Frame drum: dum on 1, and-of-2, 3; tek backbeat plus ghost notes; fill at phrase end.
      const fill = phraseBar === 3;
      for (let i = 0; i < 16; i++) {
        const at = t + i * S16 + (i % 2 ? S16 * .08 : 0), when = at;  // slight swing
        if (i === 0 || i === 6 || i === 8 || (i === 11 && Math.random() < .5) || (fill && i === 14)) play('dum', { when, gain: i === 0 ? 1 : .75, pan: .1, dest: layers.battle });
        else if (i === 4 || i === 12 || (fill && i > 12)) play('tek', { when, gain: .9, pan: .25, dest: layers.battle });
        else if (i % 2 === 0 && Math.random() < .45) play('tek', { when, gain: .35, pan: .25, dest: layers.battle });
      }
      if (warMotif) playMotif(warMotif, t, phraseBar === 2 ? pick([-2, 2, 3]) : 0, 74, 'lute', 'battle', .38, phraseBar === 3);
    }
    bar++;
  }
  return {
    // mode: 'calm' | 'battle' | 'off'
    setMode(m, t = c.currentTime, fade = 3) {
      Object.assign(target, { calm: m === 'calm' ? 1 : m === 'battle' ? .55 : 0, battle: m === 'battle' ? 1 : 0, drone: m === 'off' ? 0 : m === 'battle' ? .8 : .65 });
      for (const k in layers) { const p = layers[k].gain; p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); p.linearRampToValueAtTime(target[k], t + fade + (k === 'battle' && m !== 'battle' ? 2 : 0)); }
    },
    schedule(until) {
      if (nextBar < c.currentTime) nextBar = c.currentTime + .05;   // tab was hidden: skip ahead, never burst
      while (nextBar < until) { if (target.calm || target.battle || layers.calm.gain.value > .01 || layers.battle.gain.value > .01) scheduleBar(nextBar); nextBar += BAR; }
    },
  };
}

// ---------- ambience: wind, river, birds (winter: no river, harder wind, few birds) ----------
function createAmbience(c, bus, play, winter = false, sea = false) {
  const dest = c.createGain(); dest.gain.value = .13; dest.connect(bus);   // ambience sits well under everything
  const src = kind => { const s = c.createBufferSource(); s.buffer = noiseBuffer(kind); s.loop = true; s.start(0, Math.random() * 2); return s; };
  const node = (type, f, Q) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = Q; return b; };
  const windBP = node('bandpass', 500, .6), windG = c.createGain(); windG.gain.value = .25;
  src('pink').connect(windBP).connect(node('lowpass', 1800, .5)).connect(windG).connect(dest);
  const whistleBP = node('bandpass', 900, 14), whistleG = c.createGain(); whistleG.gain.value = 0;
  src('white').connect(whistleBP).connect(whistleG).connect(dest);
  // River: brown-noise body plus babble whose amplitude follows a very slowly played noise buffer.
  const riverG = c.createGain(); riverG.gain.value = winter || sea ? 0 : .5; riverG.connect(dest);
  src('brown').connect(node('lowpass', 500, .5)).connect(riverG);
  const babble = c.createGain(); babble.gain.value = .06;
  const mod = src('brown'); mod.playbackRate.value = .004; const modG = c.createGain(); modG.gain.value = .12; mod.connect(modG).connect(babble.gain);
  src('white').connect(node('bandpass', 1600, 1.5)).connect(babble).connect(riverG);
  // Surf: a low roar that swells as each wave rolls in, with a hiss of foam as it breaks and draws back.
  const surfG = c.createGain(); surfG.gain.value = 0; surfG.connect(dest);
  const hissG = c.createGain(); hissG.gain.value = 0; hissG.connect(dest);
  if (sea) { src('brown').connect(node('lowpass', 420, .4)).connect(surfG); src('white').connect(node('bandpass', 2600, .7)).connect(hissG); }
  let nextWind = c.currentTime, nextBird = c.currentTime + 3, nextSwell = c.currentTime;
  return {
    schedule(until) {
      const now = c.currentTime;
      if (nextWind < now) nextWind = now; if (nextBird < now) nextBird = now + 2;
      while (nextWind < until) { // gusts: slow random ramps of level, colour and whistle
        const seg = 2.5 + Math.random() * 3, t = nextWind + seg;
        windG.gain.linearRampToValueAtTime((.15 + Math.random() * .4) * (winter ? 1.7 : 1), t);
        windBP.frequency.linearRampToValueAtTime(300 + Math.random() * 600, t);
        whistleG.gain.linearRampToValueAtTime(Math.random() < (winter ? .6 : .3) ? Math.random() * (winter ? .05 : .03) : 0, t);
        whistleBP.frequency.linearRampToValueAtTime(700 + Math.random() * 700, t);
        nextWind = t;
      }
      while (sea && nextSwell < until) {
        const t0 = Math.max(nextSwell, now), rise = 2.2 + Math.random() * 1.5, fall = 3.5 + Math.random() * 2.5, peak = .55 + Math.random() * .35;
        surfG.gain.setTargetAtTime(peak, t0, rise / 3); surfG.gain.setTargetAtTime(.12, t0 + rise, fall / 3);
        hissG.gain.setTargetAtTime(peak * .09, t0 + rise * .8, .25); hissG.gain.setTargetAtTime(0, t0 + rise + .6, fall / 3);
        nextSwell = t0 + rise + fall * .8;
      }
      while (nextBird < until) {
        const pan = (Math.random() * 2 - 1) * .8;
        play('bird', { when: nextBird, pan, gain: .5 + Math.random() * .5 });
        if (Math.random() < .35) play('bird', { when: nextBird + .6 + Math.random(), pan: -pan, gain: .4 + Math.random() * .4 }); // a reply
        nextBird += winter ? 12 + Math.random() * 20 : 3 + Math.random() * 10;
      }
    },
  };
}

// ---------- public API ----------
const armored = enemy => (enemy.armor ?? enemyModule.ENEMY_TYPES[enemy.typeId]?.armor) >= .3;   // fx's demo sends stand-in foes with their own armor
const projId = p => typeof p === 'string' ? p : p?.type || p?.kind || p?.id;
const now = () => ctx ? ctx.currentTime : 0;
const sfx = (name, opts) => { if (eng && !(paused && (MIX[name]?.bus ?? 'sfx') === 'sfx')) eng.play(name, opts); };

export function init() {
  bankReady = Promise.all(Object.keys(SOUNDS).map(async name => {
    const out = []; for (let i = 0; i < SOUNDS[name].variants; i++) out.push(await renderSound(name)); bank[name] = out;
  }));
  const once = () => { unlock(); removeEventListener('pointerdown', once, true); removeEventListener('keydown', once, true); };
  addEventListener('pointerdown', once, true); addEventListener('keydown', once, true);

  bus.on('tower:fire', ({ tower, from, projectile }) => { const pid = projId(projectile), id = FIRE[pid]; if (id) sfx(id, { pos: from, rate: (pid === 'boulder' ? .55 : 1) - (tower?.level || 0) * .04 }); });
  bus.on('projectile:impact', ({ pos, projectile }) => {
    const id = projId(projectile);
    if (id === 'cannonball') sfx('explosion', { pos }); else if (id === 'arcane') sfx('arcaneHit', { pos });
    else if (id === 'firepot') sfx('explosion', { pos, rate: 1.55, gain: .5 });   // pitched-up: a whoomph, not a blast
    else if (id === 'boulder') sfx('explosion', { pos, rate: .62, gain: 1.15 });   // pitched-down: a ground-shaking thud
  });
  bus.on('enemy:heal', ({ pos }) => sfx('arcaneHit', { pos, rate: 1.7, gain: .4 }));   // a bright shimmer: something is mending
  bus.on('enemy:hit', ({ enemy, damageType, pos }) => {
    if (damageType === 'blast' || damageType === 'magic' || damageType === 'fire') return;   // explosion / arcane / fire impact already cover these
    sfx(armored(enemy) ? 'hitArmor' : 'hitFlesh', { pos: pos || enemy?.pos });
  });
  bus.on('enemy:death', ({ enemy, pos }) => {
    const p = pos || enemy?.pos, boss = enemyModule.ENEMY_TYPES?.[enemy?.typeId]?.boss, h = enemy?.height || 1.8;
    sfx('death', { pos: p, rate: boss ? .6 : Math.max(.75, Math.min(1.3, 1.8 / h)), gain: boss ? 1.5 : 1 });
    sfx(boss ? 'sell' : 'coin', { pos: p, when: now() + .12 });
  });
  bus.on('enemy:leak', () => { sfx('gate'); sfx('alarm', { when: now() + .15 }); });
  bus.on('tower:build', ({ tower }) => sfx('build', { pos: tower?.pos }));
  bus.on('tower:upgrade', ({ tower }) => sfx('upgrade', { pos: tower?.pos }));
  bus.on('tower:sell', ({ tower, pos }) => sfx('sell', { pos: pos || tower?.pos }));
  bus.on('ui:click', () => sfx('click'));
  bus.on('ui:hover', () => sfx('hover'));
  bus.on('ui:error', () => sfx('error'));
  bus.on('wave:start', () => { sfx('horn'); sfx('drums', { when: now() + .35 }); });
  bus.on('wave:clear', () => sfx('clear'));
  bus.on('game:won', () => sfx('won'));
  bus.on('game:lost', () => sfx('lost'));
}

export function update() {
  if (!eng || ctx.state !== 'running') return;
  const m = state.phase === 'wave' ? 'battle' : state.phase === 'won' || state.phase === 'lost' ? 'off' : 'calm';
  if (m !== mode) { eng.music.setMode(m, ctx.currentTime, mode === null ? 4 : 3); mode = m; }
  if (state.paused !== paused) { paused = state.paused; eng.setPaused(paused); }
  eng.music.schedule(ctx.currentTime + .5);
  eng.amb.schedule(ctx.currentTime + .5);
}

// Resume/create the AudioContext; must run inside a user gesture (ui calls it; a one-time listener is the fallback).
export function unlock() {
  if (!ctx) { ctx = new AudioContext({ latencyHint: 'interactive', sampleRate: SR }); eng = createEngine(ctx); }
  if (ctx.state !== 'running') ctx.resume();
}
export function setMuted(m) { muted = !!m; eng?.setVolumes(); }
// ---------- debug + offline verification ----------
function measure(b) {
  let peak = 0, sum = 0, last = 0;
  for (let ch = 0; ch < b.numberOfChannels; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; sum += a * a; if (a > .001 && i > last) last = i; } }
  let act = 0; for (let ch = 0; ch < b.numberOfChannels; ch++) { const d = b.getChannelData(ch); for (let i = 0; i <= last; i++) act += d[i] * d[i]; }
  const db = x => +(20 * Math.log10(Math.max(1e-9, x))).toFixed(1);
  return { dur: +(last / b.sampleRate).toFixed(2), peak: +peak.toFixed(3), rmsDb: db(Math.sqrt(act / Math.max(1, (last + 1) * b.numberOfChannels))) };
}
async function renderEngine(secs, setup) {
  const c = new OfflineAudioContext(2, Math.ceil(secs * SR), SR), e = createEngine(c); setup(e); return measure(await c.startRendering());
}
export const debug = {
  // Offline render of every sound and of the full mix; checks clipping, silence and duration.
  async report() {
    await bankReady;
    const rows = [];
    for (const name of Object.keys(SOUNDS)) {
      const ms = bank[name].map(measure), r = { name, variants: ms.length, dur: Math.max(...ms.map(m => m.dur)), peak: Math.max(...ms.map(m => m.peak)), rmsDb: Math.max(...ms.map(m => m.rmsDb)) };
      r.ok = r.peak < 1 && r.peak > .01 && r.dur > .005 && r.dur <= SOUNDS[name].dur; rows.push(r);
    }
    const mixRow = async (name, secs, setup, minDur) => { const r = { name, variants: 1, ...(await renderEngine(secs, setup)) }; r.ok = r.peak < 1 && r.rmsDb > -60 && r.dur >= minDur; rows.push(r); };
    await mixRow('mix: music calm + ambience 10s', 10, e => { e.music.setMode('calm', 0, 0); e.music.schedule(10); e.amb.schedule(10); }, 9);
    await mixRow('mix: music battle + ambience 10s', 10, e => { e.music.setMode('battle', 0, 0); e.music.schedule(10); e.amb.schedule(10); }, 9);
    await mixRow('mix: music calm only 10s', 10, e => { e.music.setMode('calm', 0, 0); e.music.schedule(10); }, 9);
    await mixRow('mix: music battle only 10s', 10, e => { e.music.setMode('battle', 0, 0); e.music.schedule(10); }, 9);
    await mixRow('mix: ambience only 10s', 10, e => e.amb.schedule(10), 9);
    await mixRow('mix: stress 30 arrows/s + 4 cannon/s + hits, 4s', 5, e => {
      for (let t = 0; t < 4; t += 1 / 30) { e.play('arrow', { when: t, pan: Math.random() * 2 - 1 }); e.play('hitFlesh', { when: t + .3, pan: Math.random() - .5 }); }
      for (let t = 0; t < 4; t += .25) { e.play('cannon', { when: t, pan: Math.random() - .5 }); e.play('explosion', { when: t + .6, pan: Math.random() - .5 }); }
    }, 3.5);
    await mixRow('mix: wave start + leak + won over battle music', 8, e => {
      e.music.setMode('battle', 0, 0); e.music.schedule(8); e.play('horn'); e.play('drums', { when: .35 }); e.play('gate', { when: 2 }); e.play('alarm', { when: 2.15 }); e.play('won', { when: 3 });
    }, 6);
    return rows;
  },
};
