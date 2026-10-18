// Deterministic before/after gameplay and rendered-pixel comparison.
// Usage: node work/perf-verify.mjs before.html after.html [output=/tmp/castle-perf-verify]
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const [before, after, out = '/tmp/castle-perf-verify'] = process.argv.slice(2);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: process.platform === 'darwin' ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : [] });
const results = [];
try {
  for (const level of ['castle', 'frostmere', 'saltreach']) {
    const runs = [];
    for (const [side, file] of [['before', before], ['after', after]]) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const errors = [], snapshots = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      await page.addInitScript(() => {
        let now = 0, queue = [], id = 0;
        // Offline audio generation also consumes randomness asynchronously.
        Math.random = () => .42;
        performance.now = () => now;
        Object.defineProperty(BaseAudioContext.prototype, 'currentTime', { get: () => now / 1000 });
        window.requestAnimationFrame = fn => { queue.push([++id, fn]); return id; };
        window.cancelAnimationFrame = n => { queue = queue.filter(([id]) => id !== n); };
        window.step = (n = 1) => { for (let i = 0; i < n; i++) { now += 20; const pending = queue; queue = []; for (const [, fn] of pending) fn(now); } };
      });
      await page.goto(pathToFileURL(resolve(file)).href + '?level=' + level);
      await page.evaluate(() => step());
      await page.waitForFunction(() => window.__game, null, { timeout: 120000 });
      const step = n => page.evaluate(n => window.step(n), n);
      await step(2);
      await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}body.ready canvas{opacity:1!important}' });
      const capture = async label => {
        const state = await page.evaluate(() => {
          const g = __game, s = __scene, gl = s.renderer.getContext();
          s.composer.render();
          const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
          gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
          let hash = 2166136261; for (const value of pixels) hash = Math.imul(hash ^ value, 16777619) >>> 0;
          return { hash, phase: g.state.phase, paused: g.state.paused, gold: g.state.gold, lives: g.state.lives, time: g.state.time,
            enemies: g.state.enemies.map(e => [e.id, e.hp, e.dist, ...e.pos.toArray()]),
            towers: g.state.towers.map(t => [t.typeId, t.level, t.kills]), camera: s.camera.position.toArray() };
        });
        snapshots.push({ label, ...state });
        await page.screenshot({ path: `${out}/${level}-${side}-${label}.png` });
        return state;
      };
      await page.keyboard.press('Enter'); await step(60);
      assert.equal(await page.evaluate(() => __game.state.phase), 'build');
      await page.keyboard.press('Tab'); await step(40);
      assert.equal(await page.evaluate(() => __game.state.selected?.kind), 'pad');
      await page.keyboard.press('1'); await step(40);
      assert.equal(await page.evaluate(() => __game.state.towers.length), 1);
      await page.evaluate(() => { __game.towers.debug.buildAll(); });
      await page.keyboard.press('Escape');
      if (await page.evaluate(() => __game.state.paused)) await page.keyboard.press('p');
      await page.keyboard.press('Space'); await step(100);
      assert.equal(await page.evaluate(() => __game.state.phase), 'wave');
      await page.evaluate(() => {
        const g = __game, kinds = Object.keys(g.enemies.ENEMY_TYPES);
        for (let i = 0; i < 40; i++) {
          const lane = i % g.lanes.length;
          const e = g.enemies.spawnEnemy(kinds[i % kinds.length], lane, { hpScale: 20 });
          e.dist = g.lanes[lane].length * (.2 + .55 * i / 40); e.age = 1;
        }
      });
      await step(150); await capture('battle');
      await page.keyboard.press('p'); await step(2);
      const paused = await capture('paused');
      await step(25);
      assert.deepEqual(await page.evaluate(() => __game.state.enemies.map(e => [e.id, e.hp, e.dist, ...e.pos.toArray()])), paused.enemies);
      assert.equal(await page.evaluate(() => __game.state.time), paused.time);
      await page.evaluate(() => __scene.renderer.domElement.focus());
      await page.keyboard.press('ArrowLeft'); await step(20);
      const moved = await capture('paused-camera'); assert.notDeepEqual(moved.camera, paused.camera);
      await page.setViewportSize({ width: 390, height: 844 }); await step(3); await capture('paused-mobile');
      await page.evaluate(() => {
        const g = __game;
        g.enemies.damageEnemy(g.state.enemies[0], 1);
        g.enemies.damageEnemy(g.state.enemies[1], 1e9);
        g.enemies.spawnEnemy('raider', 0);
      });
      await step(2); await capture('paused-mutations');
      await page.keyboard.press('p'); await page.keyboard.press('f'); await step(100); await capture('resumed');
      assert.equal(await page.evaluate(() => __game.state.speed), 2);
      await page.evaluate(() => { for (const e of [...__game.state.enemies]) __game.enemies.damageEnemy(e, 1e9); });
      await step(230); await capture('cleared');
      await page.evaluate(() => __game.ui.debug.win()); await step(100); await capture('won');
      assert.equal(await page.evaluate(() => __game.state.phase), 'won');
      assert.deepEqual(errors, []); runs.push(snapshots);
      await page.close();
    }
    for (let i = 0; i < runs[0].length; i++) assert.deepEqual(runs[1][i], runs[0][i], `${level} ${runs[0][i].label} pixels and gameplay`);
    results.push({ level, identical: true, snapshots: runs[1] });
    await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2));
    console.log(level, 'identical pixels and game state at', runs[1].length, 'checkpoints');
  }
} finally { await browser.close(); }
