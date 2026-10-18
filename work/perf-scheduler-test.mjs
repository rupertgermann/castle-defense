import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./scene.js', import.meta.url), 'utf8');
const start = source.indexOf('const start = performance.now();');
const end = source.indexOf('// Aerial haze', start);
assert(start >= 0 && end > start, 'scene scheduler source is available');
const scheduler = source.slice(start, end).replace('export const frameHooks', 'const frameHooks');

for (const hz of [30, 59.94, 60, 75, 90, 120, 144, 165, 240]) {
  let now = 0, visibility;
  const samples = [];
  const document = {
    hidden: false,
    addEventListener(name, callback) { assert.equal(name, 'visibilitychange'); visibility = callback; },
    body: { classList: { add() {} } },
  };
  const context = vm.createContext({
    performance: { now: () => now }, document, window: {}, samples,
    requestAnimationFrame() {}, matchMedia: () => ({ matches: false }),
    controls: { update() {} }, keepViewClear() {}, focusHaze() {},
    world: { animate() {} }, composer: { render() {} }, renderer: { shadowMap: {} },
  });
  vm.runInContext(`${scheduler}\nglobalThis.step = render; frameHooks.push(dt => samples.push([performance.now(), dt]));`, context);
  for (let i = 1; i <= hz * 10; i++) { now = i * 1000 / hz; context.step(now); }
  const steadyCount = samples.length;
  assert(Math.abs(steadyCount - Math.min(hz, 60) * 10) <= 1, `${hz} Hz rendered ${steadyCount} frames`);
  for (let i = 1; i < samples.length; i++) {
    assert(Math.abs(samples[i][1] - (samples[i][0] - samples[i - 1][0]) / 1000) < 1e-10, 'dt follows rendered spacing');
  }

  now += 350; context.step(now);
  assert.equal(samples.length, steadyCount + 1, 'a long frame renders once');
  assert.equal(samples.at(-1)[1], .1, 'long simulation steps stay capped');
  context.step(now);
  assert.equal(samples.length, steadyCount + 1, 'no catch-up render at the same timestamp');

  document.hidden = true; visibility();
  now += 500; context.step(now);
  assert.equal(samples.length, steadyCount + 1, 'hidden frames do not render');
  now += 5000;
  document.hidden = false; visibility();
  const resumed = now;
  context.step(now);
  assert.equal(samples.length, steadyCount + 1, 'resume starts a fresh interval');
  for (let i = 1; i <= 4 && samples.length === steadyCount + 1; i++) {
    now = resumed + i * 1000 / hz; context.step(now);
  }
  assert.equal(samples.length, steadyCount + 2, 'rendering resumes');
  assert(Math.abs(samples.at(-1)[1] - (now - resumed) / 1000) < 1e-10, 'resume excludes hidden time');
  console.log(`${hz} Hz: ${steadyCount} frames / 10 s; dt, long-frame, and visibility checks passed`);
}
