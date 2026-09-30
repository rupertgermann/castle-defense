// Procedural sound recipes. Each SFX is a small WebAudio node graph rendered once into an AudioBuffer via
// OfflineAudioContext (cheap to replay 30x/s), plus JS-side Karplus-Strong plucks and a generated reverb impulse.
export const SR = 48000;

// ---------- shared buffers ----------
const noiseCache = {};
export function noiseBuffer(kind = 'white') {
  if (noiseCache[kind]) return noiseCache[kind];
  const len = SR * 3, b = new AudioBuffer({ length: len, sampleRate: SR, numberOfChannels: 1 }), d = b.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'pink') { // Paul Kellet's economy pink filter
      b0 = .99765 * b0 + w * .099046; b1 = .963 * b1 + w * .2965164; b2 = .57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * .1848) * .2;
    } else if (kind === 'brown') { last = (last + .02 * w) / 1.02; d[i] = last * 3.5; }
    else d[i] = w;
  }
  // Crossfade the loop seam so looped noise never clicks.
  const f = 2048; for (let i = 0; i < f; i++) { const a = i / f; d[i] = d[i] * a + d[len - f + i] * (1 - a); }
  return (noiseCache[kind] = b);
}

// Stereo hall impulse: darkening exponential noise tail with a short pre-delay (stone courtyard).
export function impulse(secs = 2.4) {
  const len = Math.floor(SR * secs), b = new AudioBuffer({ length: len, sampleRate: SR, numberOfChannels: 2 });
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch); let lp = 0;
    for (let i = Math.floor(SR * .012); i < len; i++) {
      const x = i / len; lp += (Math.random() * 2 - 1 - lp) * (.55 - .45 * x);
      d[i] = lp * Math.exp(-x * 6) * (1 - x);
    }
  }
  return b;
}

// Karplus-Strong pluck, cached per note. 'harp' = soft, long; 'lute' = brighter, shorter.
const pluckCache = new Map();
export function pluck(midi, kind = 'harp') {
  const key = midi + kind; if (pluckCache.has(key)) return pluckCache.get(key);
  const f = 440 * 2 ** ((midi - 69) / 12), N = Math.max(3, Math.round(SR / f + .5)), actual = SR / (N - .5);
  const harp = kind === 'harp', t60 = harp ? 3.4 : 1.5, dur = harp ? 3 : 1.4, bright = harp ? .22 : .5;
  const decay = Math.pow(.001, 1 / (actual * t60)), len = Math.floor(dur * SR), out = new Float32Array(len), buf = new Float32Array(N);
  let lp = 0, mean = 0;
  for (let i = 0; i < N; i++) { lp += (Math.random() * 2 - 1 - lp) * bright; buf[i] = lp; mean += lp / N; }
  for (let i = 0; i < N; i++) buf[i] -= mean;
  if (!harp) { const p = Math.max(1, Math.floor(N * .13)); for (let i = N - 1; i >= p; i--) buf[i] -= .6 * buf[i - p]; } // pluck near the bridge: nasal lute
  let peak = 1e-9;
  for (let i = 0, idx = 0; i < len; i++) {
    const n = idx + 1 === N ? 0 : idx + 1, a = buf[idx];
    out[i] = a; buf[idx] = decay * .5 * (a + buf[n]); idx = n; peak = Math.max(peak, Math.abs(a));
  }
  const fade = SR * .08, att = SR * .002;
  for (let i = 0; i < len; i++) out[i] *= Math.min(1, i / att, (len - i) / fade) / peak;
  const b = new AudioBuffer({ length: len, sampleRate: SR, numberOfChannels: 1 }); b.copyToChannel(out, 0);
  const res = { buffer: b, rate: f / actual }; pluckCache.set(key, res); return res;
}

// ---------- node helpers ----------
const rand = (a, b) => a + Math.random() * (b - a);
const osc = (c, type, f, t, dur) => { const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.start(t); o.stop(t + dur); return o; };
const filt = (c, type, f, Q = .7) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = Q; return b; };
const amp = (c, g = 0) => { const n = c.createGain(); n.gain.value = g; return n; };
const chain = (...n) => { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); return n[0]; };
function noise(c, t, dur, kind = 'white', rate = 1) {
  const s = c.createBufferSource(); s.buffer = noiseBuffer(kind); s.loop = true; s.playbackRate.value = rate;
  s.start(t, Math.random() * 2.5); s.stop(t + dur); return s;
}
// Linear attack to peak, then exponential fall reaching about -40 dB after `decay` seconds.
function perc(p, t, peak, attack, decay) { p.setValueAtTime(0, t); p.linearRampToValueAtTime(peak, t + attack); p.setTargetAtTime(0, t + attack, decay / 4.6); }
const sweep = (p, t, a, b, dur) => { p.setValueAtTime(a, t); p.exponentialRampToValueAtTime(b, t + dur); };

// Pitched percussive blip (sine with pitch drop) — thumps, kicks, drum bodies.
function thump(c, o, t, f0, f1, g, decay, pitchTime = .08) {
  const s = osc(c, 'sine', f0, t, decay + .1); s.frequency.exponentialRampToValueAtTime(f1, t + pitchTime);
  const a = amp(c); perc(a.gain, t, g, .002, decay); chain(s, a, o);
}
// Filtered noise burst.
function burst(c, o, t, type, f, Q, g, decay, attack = .001, kind = 'white') {
  const a = amp(c); perc(a.gain, t, g, attack, decay); chain(noise(c, t, attack + decay + .05, kind), filt(c, type, f, Q), a, o);
}
// Additive inharmonic partials: bells, clangs, coins, chimes.
function partials(c, o, t, f, ratios, amps, decays, g) {
  ratios.forEach((r, i) => { const s = osc(c, 'sine', f * r * rand(.997, 1.003), t, decays[i] + .05), a = amp(c); perc(a.gain, t, g * amps[i], .001, decays[i]); chain(s, a, o); });
}
const coinPing = (c, o, t, g) => partials(c, o, t, rand(2300, 3600), [1, 2.41, 3.93, 5.6], [1, .5, .25, .12], [.28, .14, .08, .05], g);
const chime = (c, o, t, f, g) => partials(c, o, t, f, [1, 2, 3.01, 4.17], [1, .3, .14, .08], [1.3, .7, .35, .2], g);
function bell(c, o, t, f, g) { // church-bell partials: hum, prime, tierce, quint, nominal...
  partials(c, o, t, f, [.5, 1, 1.183, 1.506, 2, 2.514, 2.662, 3.011, 4.166], [.45, .55, .45, .25, .6, .2, .15, .15, .08], [3.2, 2.4, 2, 1.5, 1.5, 1, .9, .7, .5], g);
  burst(c, o, t, 'bandpass', 1800, 1.2, g * .25, .03);
}
function drum(c, o, t, f0, g, decay, skin = .35) {
  thump(c, o, t, f0 * 2.2, f0, g, decay, .05);
  burst(c, o, t, 'lowpass', f0 * 14, .8, g * skin, .09);
}
// Brass voice: detuned saw stack through a lowpass that opens with the swell (the "blat"), pitch scoop, delayed vibrato.
function brass(c, o, t, f, dur, g, { attack = .05, bright = 2400, vib = 5.5, detune = 8, sub = 0, fall = 0, rel = .22 } = {}) {
  const end = t + dur + rel + .05, env = amp(c);
  env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(g, t + attack);
  env.gain.linearRampToValueAtTime(g * .85, t + attack + dur * .4); env.gain.linearRampToValueAtTime(g, t + dur); env.gain.linearRampToValueAtTime(0, t + dur + rel);
  const lp = filt(c, 'lowpass', f * 1.3, 1.6);
  lp.frequency.setValueAtTime(f * 1.3, t); lp.frequency.exponentialRampToValueAtTime(bright, t + attack + .04);
  lp.frequency.exponentialRampToValueAtTime(bright * .6, t + dur); lp.frequency.exponentialRampToValueAtTime(f * 1.1, t + dur + rel);
  const vg = amp(c); vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(0, t + Math.min(.25, dur * .4)); vg.gain.linearRampToValueAtTime(f * .007, t + Math.min(.8, dur * .8));
  chain(osc(c, 'sine', vib, t, end - t), vg);
  const voice = (type, ff, det, gg) => {
    const s = osc(c, type, ff * .94, t, end - t); s.detune.value = det;
    s.frequency.exponentialRampToValueAtTime(ff, t + .07);
    if (fall) { s.frequency.setValueAtTime(ff, t + dur); s.frequency.exponentialRampToValueAtTime(ff * fall, t + dur + rel); }
    vg.connect(s.frequency); chain(s, amp(c, gg), lp);
  };
  for (const d of [-detune, 0, detune]) voice('sawtooth', f, d + rand(-2, 2), .33);
  if (sub) voice('triangle', f / 2, 0, sub);
  chain(lp, env, o);
}

// ---------- recipes ----------
// level = normalized peak; the mix table in audio.js adds per-instance gain on top.
export const SOUNDS = {
  arrow: { dur: .5, level: .32, variants: 4, fn(c, o) { // bow twang + limb thump + release click + whoosh
    const f = rand(140, 190), s = osc(c, 'sawtooth', f, 0, .32); s.frequency.exponentialRampToValueAtTime(f * .86, .25);
    const lp = filt(c, 'lowpass', 3500, 5); sweep(lp.frequency, 0, 3800, 260, .13);
    const g = amp(c); perc(g.gain, 0, .45, .002, .24); chain(s, lp, g, o);
    thump(c, o, 0, f * .55, f * .33, .45, .1);
    burst(c, o, 0, 'highpass', 2600, .7, .35, .015);
    const w = noise(c, .012, .45, 'pink'), bp = filt(c, 'bandpass', 700, 1.8), wg = amp(c);
    bp.frequency.setValueAtTime(650, .012); bp.frequency.exponentialRampToValueAtTime(rand(2400, 3200), .13); bp.frequency.exponentialRampToValueAtTime(1100, .44);
    wg.gain.setValueAtTime(0, .012); wg.gain.linearRampToValueAtTime(.9, .08); wg.gain.exponentialRampToValueAtTime(.001, .44);
    chain(w, bp, wg, o);
  } },
  bolt: { dur: 1, level: .5, variants: 3, fn(c, o) { // heavy thunk + string snap + deep whoosh + wooden creak of the arms settling
    thump(c, o, 0, 115, 42, 1, .32, .12);
    burst(c, o, 0, 'bandpass', 340, 2, .8, .13);
    const s = osc(c, 'triangle', 88, 0, .3); s.frequency.exponentialRampToValueAtTime(66, .25); const sg = amp(c); perc(sg.gain, 0, .55, .002, .26); chain(s, filt(c, 'lowpass', 900), sg, o);
    const w = noise(c, .02, .6, 'pink'), bp = filt(c, 'bandpass', 450, 1.2), wg = amp(c);
    bp.frequency.setValueAtTime(420, .02); bp.frequency.exponentialRampToValueAtTime(1300, .12); bp.frequency.exponentialRampToValueAtTime(520, .55);
    wg.gain.setValueAtTime(0, .02); wg.gain.linearRampToValueAtTime(.55, .1); wg.gain.exponentialRampToValueAtTime(.001, .58); chain(w, bp, wg, o);
    const cr = osc(c, 'sawtooth', rand(34, 42), .16, .5); cr.frequency.linearRampToValueAtTime(rand(50, 60), .35); cr.frequency.linearRampToValueAtTime(28, .62);
    const cbp = filt(c, 'bandpass', 1100, 9); cbp.frequency.setValueAtTime(rand(950, 1200), .16); cbp.frequency.linearRampToValueAtTime(1450, .4); cbp.frequency.linearRampToValueAtTime(900, .64);
    const cg = amp(c); cg.gain.setValueAtTime(0, .16); cg.gain.linearRampToValueAtTime(.7, .24); cg.gain.linearRampToValueAtTime(.35, .45); cg.gain.linearRampToValueAtTime(0, .64);
    chain(cr, cbp, cg, o);
  } },
  cannon: { dur: 2.6, level: .8, variants: 3, fn(c, o) { // crack + body + sub thump + rumble tail
    burst(c, o, 0, 'highpass', 1200, .7, 1, .09);
    const n = noise(c, 0, .9), lp = filt(c, 'lowpass', 4000, .8), g = amp(c); sweep(lp.frequency, 0, 4200, 170, .5); perc(g.gain, 0, .95, .002, .75); chain(n, lp, g, o);
    thump(c, o, 0, rand(62, 72), 30, 1.1, .65, .35);
    thump(c, o, 0, 150, 60, .55, .16, .08);
    burst(c, o, .02, 'lowpass', 240, .7, .6, 2.3, .06, 'brown');
  } },
  explosion: { dur: 3.2, level: .9, variants: 3, fn(c, o) { // bigger: longer sub, debris crackle, dirt fall
    burst(c, o, 0, 'highpass', 900, .7, 1, .12);
    const n = noise(c, 0, 1.2), lp = filt(c, 'lowpass', 3500, .8), g = amp(c); sweep(lp.frequency, 0, 3600, 130, .8); perc(g.gain, 0, 1, .003, 1); chain(n, lp, g, o);
    thump(c, o, 0, rand(55, 62), 24, 1.3, 1.1, .5);
    burst(c, o, .03, 'lowpass', 200, .7, .8, 2.9, .08, 'brown');
    const dg = amp(c); chain(noise(c, .05, 1.4), filt(c, 'highpass', 2200, .8), dg, o);
    for (let i = 0; i < 26; i++) { const t = .05 + Math.random() ** 1.6 * 1.2; dg.gain.setValueAtTime(rand(.05, .3) * (1.3 - t), t); dg.gain.setTargetAtTime(0, t, .005); }
    burst(c, o, .12, 'bandpass', 900, .6, .3, 1.2, .1, 'pink');
  } },
  arcane: { dur: 1.1, level: .42, variants: 4, fn(c, o) { // zap + resonant sweep + tremolo shimmer + sparkle grains
    const z = osc(c, 'sawtooth', 1800, 0, .25); z.frequency.exponentialRampToValueAtTime(220, .18); const zg = amp(c); perc(zg.gain, 0, .4, .002, .22); chain(z, filt(c, 'lowpass', 5000), zg, o);
    const n = noise(c, 0, .6), bp = filt(c, 'bandpass', 300, 8), ng = amp(c); sweep(bp.frequency, 0, 300, 6000, .35); perc(ng.gain, 0, 1.4, .02, .5); chain(n, bp, ng, o);
    const base = [587, 659, 698, 784, 880][Math.floor(rand(0, 5))], trem = amp(c, .5), sg = amp(c);
    chain(osc(c, 'sine', rand(12, 17), 0, 1.1), amp(c, .5), trem.gain); perc(sg.gain, .02, .3, .03, .95);
    [1, 1.5, 2.01, 3.02].forEach((r, i) => chain(osc(c, 'sine', base * r, 0, 1.1), amp(c, [1, .5, .4, .2][i]), trem));
    chain(trem, sg, o);
    for (let i = 0; i < 12; i++) { const t = rand(.03, .7), s = osc(c, 'sine', rand(3000, 8000), t, .06), a = amp(c); perc(a.gain, t, .12 * (1 - t), .002, .04); chain(s, a, o); }
  } },
  arcaneHit: { dur: .9, level: .35, variants: 3, fn(c, o) { // soft burst + FM bell + sparkles
    burst(c, o, 0, 'bandpass', 2500, 1.5, .6, .12);
    const f = rand(700, 1000), car = osc(c, 'sine', f, 0, .8), mod = osc(c, 'sine', f * 1.41, 0, .8), mg = amp(c), cg = amp(c);
    sweep(mg.gain, 0, f * 2, 1, .5); chain(mod, mg, car.frequency); perc(cg.gain, 0, .5, .002, .6); chain(car, cg, o);
    for (let i = 0; i < 8; i++) { const t = rand(.01, .45), s = osc(c, 'sine', rand(3500, 9000), t, .05), a = amp(c); perc(a.gain, t, .1, .002, .035); chain(s, a, o); }
  } },
  hitFlesh: { dur: .3, level: .22, variants: 4, fn(c, o) { // dull thud + muffled body + faint slap
    thump(c, o, 0, rand(130, 160), 65, .8, .11, .06);
    burst(c, o, 0, 'lowpass', rand(600, 900), .9, .9, .07);
    burst(c, o, 0, 'bandpass', 1800, 1, .22, .03);
  } },
  hitArmor: { dur: .7, level: .28, variants: 4, fn(c, o) { // inharmonic clang + transient + thud
    partials(c, o, 0, rand(470, 640), [1, 1.47, 2.09, 2.56, 3.39, 4.2], [1, .7, .6, .5, .35, .25], [.5, .35, .3, .25, .18, .12], .5);
    burst(c, o, 0, 'highpass', 3000, .7, .6, .02);
    burst(c, o, 0, 'lowpass', 500, .7, .5, .06);
  } },
  death: { dur: .6, level: .28, variants: 6, fn(c, o) { // grunt: pitched glottal saw + breath through a 3-formant bank
    const f = rand(88, 145), F1 = rand(450, 700), F2 = rand(950, 1350), s = osc(c, 'sawtooth', f, 0, .5);
    s.frequency.linearRampToValueAtTime(f * 1.12, .05); s.frequency.exponentialRampToValueAtTime(f * .68, .4);
    chain(osc(c, 'sine', rand(24, 34), 0, .5), amp(c, f * .03), s.frequency);
    const src = amp(c, 1), env = amp(c); s.connect(src); chain(noise(c, 0, .5), amp(c, .35), src);
    env.gain.setValueAtTime(0, 0); env.gain.linearRampToValueAtTime(1, .025); env.gain.linearRampToValueAtTime(.7, .15); env.gain.linearRampToValueAtTime(0, .42);
    for (const [ff, q, g] of [[F1, 6, 1], [F2, 9, .5], [2500, 12, .18]]) chain(src, filt(c, 'bandpass', ff, q), amp(c, g), env);
    env.connect(o);
  } },
  coin: { dur: .5, level: .2, variants: 4, fn(c, o) { let t = 0; for (let i = 0, n = 2 + (Math.random() < .5); i < n; i++) { coinPing(c, o, t, 1 - i * .25); t += rand(.045, .075); } } },
  gate: { dur: 3, level: .95, variants: 2, fn(c, o) { // ram against the gate: sub boom, splintering wood, iron rattle, rumble
    thump(c, o, 0, 58, 26, 1.2, 1.4, .5);
    const n = noise(c, 0, 1.2), lp = filt(c, 'lowpass', 900), g = amp(c); sweep(lp.frequency, 0, 900, 120, .8); perc(g.gain, 0, 1, .003, .9); chain(n, lp, g, o);
    burst(c, o, 0, 'bandpass', 450, 1.5, .7, .25); burst(c, o, .08, 'bandpass', 700, 2, .45, .2);
    partials(c, o, .01, 180, [1, 2.3, 3.7, 5.1], [1, .6, .4, .3], [.7, .5, .4, .3], .18);
    burst(c, o, .02, 'lowpass', 200, .7, .6, 2.6, .05, 'brown');
  } },
  alarm: { dur: 3.4, level: .45, variants: 1, fn(c, o) { bell(c, o, 0, 220, 1); bell(c, o, .85, 220, .8); } },
  build: { dur: 1.4, level: .6, variants: 2, fn(c, o) { // stone block set down, grit, then three hammer taps
    thump(c, o, 0, 92, 48, .8, .28, .1);
    burst(c, o, 0, 'lowpass', 500, .8, 1, .16); burst(c, o, 0, 'bandpass', 1400, .8, .3, .1);
    burst(c, o, .01, 'bandpass', 600, .9, .2, .35, .1, 'pink');
    [.38, .62, .86].forEach((t0, i) => {
      const t = t0 + rand(-.02, .02), g = .5 + i * .15;
      partials(c, o, t, rand(1450, 1650), [1, 2.7, 4.1], [.5, .3, .15], [.12, .08, .05], g);
      burst(c, o, t, 'bandpass', 800, 3, g, .04);
    });
  } },
  upgrade: { dur: 1.8, level: .5, variants: 1, fn(c, o) { // rising D-major chime arpeggio + airy shimmer + warm swell
    [587.3, 740, 880, 1174.7].forEach((f, i) => chime(c, o, i * .085, f, .35 + i * .08));
    const n = noise(c, .05, .8), bp = filt(c, 'bandpass', 3000, 4), g = amp(c); sweep(bp.frequency, .05, 3000, 9000, .6); perc(g.gain, .05, .3, .1, .6); chain(n, bp, g, o);
    const s = osc(c, 'sine', 293.7, .15, 1.2), sg = amp(c); perc(sg.gain, .15, .25, .2, .9); chain(s, sg, o);
  } },
  sell: { dur: 1.2, level: .4, variants: 2, fn(c, o) { // pouch rustle + cascade of coins
    burst(c, o, 0, 'lowpass', 1200, .7, .3, .08, .002, 'pink');
    let t = .02; for (let i = 0; i < 14; i++) { coinPing(c, o, t, 1 - i * .045); t += rand(.02, .07); }
  } },
  click: { dur: .1, level: .3, variants: 2, fn(c, o) {
    burst(c, o, 0, 'bandpass', 3000, 2, 1, .012);
    thump(c, o, 0, 1400, 900, .4, .02, .015); thump(c, o, 0, 420, 400, .3, .03);
  } },
  hover: { dur: .05, level: .1, variants: 1, fn(c, o) { thump(c, o, 0, 2600, 2500, .5, .012); burst(c, o, 0, 'highpass', 5000, .7, .2, .006); } },
  error: { dur: .35, level: .16, variants: 1, fn(c, o) { // two soft, dissonant low buzzes
    const lp = filt(c, 'lowpass', 1000, 1), g = amp(c);
    for (const f of [146.8, 155.6]) chain(osc(c, 'square', f, 0, .3), amp(c, .5), lp);
    for (const t of [0, .14]) { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + .012); g.gain.setValueAtTime(1, t + .08); g.gain.linearRampToValueAtTime(0, t + .11); }
    chain(lp, g, o);
  } },
  horn: { dur: 3.8, level: .7, variants: 1, fn(c, o) { // war horn: long swelling low note with a fall-off
    brass(c, o, .02, 110, 2.5, 1, { attack: .45, bright: 1300, vib: 4.6, detune: 10, sub: .45, fall: .9, rel: .7 });
  } },
  drums: { dur: 2.8, level: .75, variants: 1, fn(c, o) { // war drums under the horn
    [[0, 1], [.42, .7], [.84, .9], [1.05, .6], [1.26, .8], [1.68, 1]].forEach(([t, g]) => drum(c, o, t, 58, g, .6));
    [.21, .63, 1.47].forEach(t => drum(c, o, t, 110, .3, .25, .5));
  } },
  clear: { dur: 2.4, level: .6, variants: 1, fn(c, o) { // short triumphant motif A3 D4 F#4 → A4 over a D chord
    [[0, 220], [.18, 293.7], [.36, 370]].forEach(([t, f]) => brass(c, o, t, f, .15, .8, { vib: 0 }));
    brass(c, o, .54, 440, 1.1, .9); brass(c, o, .54, 293.7, 1.1, .5); brass(c, o, .54, 370, 1.1, .45);
  } },
  won: { dur: 5, level: .75, variants: 1, fn(c, o) { // fanfare with timpani roll and cymbal wash
    const n = (t, f, d, g = .8) => brass(c, o, t, f, d, g, { vib: d > .4 ? 5.5 : 0 });
    n(0, 293.7, .11); n(.14, 293.7, .11); n(.28, 293.7, .11); n(.42, 440, .45);
    n(.95, 370, .11); n(1.09, 392, .11); n(1.23, 440, .3);
    for (const [f, g] of [[587.3, .9], [440, .5], [370, .45], [293.7, .5], [146.8, .5]]) n(1.6, f, 2.2, g);
    for (let i = 0; i < 8; i++) drum(c, o, 1.12 + i * .06, 73, .25 + i * .06, .3);
    drum(c, o, 1.6, 73, 1, 1.2);
    burst(c, o, 1.6, 'highpass', 5000, .7, .25, 2.2, .01);
  } },
  lost: { dur: 6, level: .6, variants: 1, fn(c, o) { // low doom chord with a b2 for dread, a distant boom
    drum(c, o, 0, 42, 1, 2);
    for (const [f, g] of [[73.4, .9], [87.3, .6], [110, .6], [155.6, .25]]) brass(c, o, .1, f, 3.6, g, { attack: 1.1, bright: 520, vib: 3.5, detune: 12, rel: 1.6 });
  } },
  bird: { dur: 1.6, level: .12, variants: 6, fn(c, o) { // FM chirps: warbling sine with glides
    const base = rand(2800, 4600), trill = Math.random() < .35, n = trill ? 7 + Math.floor(rand(0, 5)) : 2 + Math.floor(rand(0, 4));
    let t = .01;
    for (let i = 0; i < n; i++) {
      const d = trill ? .04 : rand(.05, .12), f = base * rand(.9, 1.1), s = osc(c, 'sine', f, t, d + .02);
      s.frequency.exponentialRampToValueAtTime(f * (Math.random() < .5 ? rand(1.2, 1.5) : rand(.65, .85)), t + d);
      chain(osc(c, 'sine', rand(30, 90), t, d + .02), amp(c, f * .08), s.frequency);
      const a = amp(c); a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(1, t + .01); a.gain.linearRampToValueAtTime(0, t + d); chain(s, a, o);
      t += d + (trill ? .025 : rand(.04, .12));
    }
  } },
  // music percussion (frame drum): low "dum" with snare buzz, and a rim "tek"
  dum: { dur: .8, level: .5, variants: 3, fn(c, o) { drum(c, o, 0, rand(68, 76), 1, .45, .25); burst(c, o, .005, 'bandpass', 3000, .8, .12, .15); } },
  tek: { dur: .25, level: .3, variants: 3, fn(c, o) { burst(c, o, 0, 'bandpass', rand(2300, 2900), 1.5, 1, .04); thump(c, o, 0, 640, 560, .3, .03); } },
};

// Render one variant of a recipe and normalize it to its target peak level.
export async function renderSound(name) {
  const R = SOUNDS[name], c = new OfflineAudioContext(1, Math.ceil(R.dur * SR), SR), o = c.createGain();
  o.connect(c.destination); R.fn(c, o);
  const b = await c.startRendering(), d = b.getChannelData(0);
  let peak = 1e-9; for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  const k = R.level / peak, fade = Math.min(d.length, SR * .03);
  for (let i = 0; i < d.length; i++) d[i] *= k * Math.min(1, (d.length - i) / fade);
  return b;
}
