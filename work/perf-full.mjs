// Compare complete animation frames, including game updates, DOM work, and render submission.
// Usage: node work/perf-full.mjs before.html after.html [rounds=5] [report=/tmp/castle-perf.json]
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const [before, after = before, rounds = '5', report = '/tmp/castle-perf.json'] = process.argv.slice(2);
assert(before, 'Supply a built HTML file');
const browser = await chromium.launch({ headless: true, args: process.platform === 'darwin' ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : [] });
const results = [];
try {
  for (let round = 0; round < Number(rounds); round++) {
    for (const level of ['castle', 'frostmere', 'saltreach']) {
      const pair = [['before', before], ['after', after]];
      if (round % 2) pair.reverse();
      for (const [side, file] of pair) {
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        await page.addInitScript(() => {
          let seed = 123456;
          Math.random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
        });
        await page.goto(pathToFileURL(resolve(file)).href + '?level=' + level);
        await page.waitForFunction(() => window.__sceneReady === true, null, { timeout: 120000 });
        await page.evaluate(() => {
          const g = __game, s = __scene;
          g.ui.debug.start(); g.towers.debug.buildAll(); g.enemies.debug.hold = true;
          const kinds = Object.keys(g.enemies.ENEMY_TYPES);
          for (let i = 0; i < 80; i++) {
            const lane = i % g.lanes.length;
            const e = g.enemies.spawnEnemy(kinds[i % kinds.length], lane, { hpScale: 10000 });
            e.dist = g.lanes[lane].length * (.15 + .7 * (i / 80)); e.age = 1;
          }
          g.fx.debug.demo();
          const p = window.__perf = { frames: [], cpu: [], bytes: 0, fires: 0, hits: 0, enabled: false, start: 0, last: 0 };
          g.bus.on('tower:fire', () => { if (p.enabled) p.fires++; });
          g.bus.on('enemy:hit', () => { if (p.enabled) p.hits++; });
          s.frameHooks.unshift(() => {
            p.start = performance.now();
            if (p.enabled && p.last) p.frames.push(p.start - p.last);
            p.last = p.start;
          });
          const render = s.composer.render.bind(s.composer);
          s.composer.render = (...args) => {
            render(...args);
            if (p.enabled) p.cpu.push(performance.now() - p.start);
          };
          const gl = s.renderer.getContext(), sub = gl.bufferSubData.bind(gl);
          gl.bufferSubData = (...args) => {
            if (p.enabled) p.bytes += (args[4] ?? (args[2].length - (args[3] || 0))) * args[2].BYTES_PER_ELEMENT;
            return sub(...args);
          };
        });
        await page.waitForTimeout(2000);
        for (const paused of [false, true]) {
          if (paused) { await page.keyboard.press('p'); await page.waitForTimeout(300); }
          const time = await page.evaluate(() => {
            Object.assign(__perf, { frames: [], cpu: [], bytes: 0, fires: 0, hits: 0, last: 0, enabled: true });
            return __game.state.time;
          });
          await page.waitForTimeout(3000);
          const data = await page.evaluate(() => {
            const p = __perf; p.enabled = false;
            const gl = __scene.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
            return { frames: p.frames, cpu: p.cpu, bytes: p.bytes, fires: p.fires, hits: p.hits,
              enemies: __game.state.enemies.length, towers: __game.state.towers.length,
              paused: __game.state.paused, time: __game.state.time,
              gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
              buffer: [gl.drawingBufferWidth, gl.drawingBufferHeight] };
          });
          assert.equal(data.paused, paused); assert.equal(data.enemies, 80); assert(data.towers > 0);
          assert(data.frames.length > 10, 'Real frames must render');
          if (paused) assert.equal(data.time, time); else { assert(data.time > time); assert(data.fires > 0); assert(data.hits > 0); }
          assert.deepEqual(errors, []);
          const percentile = (a, q) => [...a].sort((a, b) => a - b)[Math.floor((a.length - 1) * q)];
          const result = { round, level, side, paused, ...data, errors,
            frameP50: percentile(data.frames, .5), frameP95: percentile(data.frames, .95),
            cpuP50: percentile(data.cpu, .5), cpuP95: percentile(data.cpu, .95),
            uploadBytesPerFrame: data.bytes / data.cpu.length };
          results.push(result);
          console.log(JSON.stringify({ ...result, frames: data.frames.length, cpu: undefined }));
          await writeFile(report, JSON.stringify(results, null, 2));
        }
        await page.close();
      }
    }
  }
} finally { await browser.close(); }
