// Capture title screens and live battles with normal starting gold and tower costs.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const file = new URL('../outputs/castle-defense.html', import.meta.url);
const output = new URL('../docs/screenshots/', import.meta.url);
await mkdir(output, { recursive: true });
const report = { htmlSha256: createHash('sha256').update(await readFile(file)).digest('hex'), viewport: { width: 1600, height: 1000 }, captures: [] };
const browser = await chromium.launch({ headless: true, args: process.platform === 'darwin' ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : [] });
try {
  for (const level of ['castle', 'frostmere', 'saltreach']) {
    const page = await browser.newPage({ viewport: report.viewport, deviceScaleFactor: 1 });
    const errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
    await page.goto(`${file.href}?level=${level}`);
    await page.waitForFunction(() => window.__sceneReady === true, null, { timeout: 120000 });
    await page.waitForTimeout(2000);
    assert.equal(await page.evaluate(() => __game.state.phase), 'title');
    const intro = `${level}-intro.jpg`;
    await page.screenshot({ path: new URL(intro, output).pathname, type: 'jpeg', quality: 90 });
    report.captures.push({ file: intro, level, scene: 'intro', phase: 'title', consoleErrors: [...errors], externalRequests: [...requests] });
    console.log(`${intro}: title screen`);
    await page.locator('[data-a="diff"][data-k="squire"]').click();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => __game.state.phase === 'build');
    await page.waitForTimeout(2200);
    const towerIds = await page.evaluate(() => {
      const { towers, lanes } = __game;
      const positions = lanes.map(lane => lane.pointAt(lane.length * .72));
      const pads = [...towers.pads].sort((a, b) => Math.min(...positions.map(p => p.distanceTo(a.pos))) - Math.min(...positions.map(p => p.distanceTo(b.pos))));
      const built = [];
      for (const [index, pad] of pads.entries()) {
        const tower = towers.buildTower(pad, index === 1 ? 'cannon' : 'archer');
        if (tower) built.push(pad.id);
      }
      return built;
    });
    assert(towerIds.length >= 2, `${level}: towers built with starting gold`);
    await page.keyboard.press('f');
    await page.keyboard.press('f');
    await page.keyboard.press('Space');
    await page.waitForFunction(() => __game.state.phase === 'wave' && __game.state.enemies.length >= 3, null, { timeout: 60000 });
    await page.waitForFunction(() => __game.state.towers.some(tower => tower.target?.alive), null, { timeout: 120000 });
    await page.keyboard.press('f');
    async function capture(scene) {
      const before = await page.evaluate(() => ({ time: __game.state.time, phase: __game.state.phase, wave: __game.state.wave, lives: __game.state.lives, gold: __game.state.gold, enemies: __game.state.enemies.length, towers: __game.state.towers.length, paused: __game.state.paused }));
      assert.equal(before.phase, 'wave');
      assert(before.enemies > 0 && !before.paused);
      const name = `${level}-${scene}.jpg`;
      await page.screenshot({ path: new URL(name, output).pathname, type: 'jpeg', quality: 90 });
      assert(await page.evaluate(time => __game.state.time > time, before.time), 'Simulation is running during capture');
      report.captures.push({ file: name, level, scene, ...before, consoleErrors: [...errors], externalRequests: [...requests] });
      console.log(`${name}: wave ${before.wave}, ${before.enemies} enemies, ${before.towers} towers`);
    }
    await page.evaluate(() => {
      const tower = __game.state.towers.find(t => t.target?.alive);
      const focus = tower.pos.clone().lerp(tower.target.pos, .5);
      __scene.controls.target.copy(focus);
      __scene.camera.position.copy(focus).add(new __scene.THREE.Vector3(35, 48, 58));
      __scene.controls.update();
    });
    await page.waitForTimeout(400);
    await capture('battle');
    await page.keyboard.press('o');
    await page.waitForTimeout(1200);
    const position = await page.evaluate(id => {
      const p = __game.towers.pads.find(pad => pad.id === id).pos.clone();
      p.y += .5;
      p.project(__scene.camera);
      return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight };
    }, towerIds[0]);
    await page.mouse.click(position.x, position.y);
    await page.waitForTimeout(1200);
    await page.waitForFunction(() => __game.state.selected?.kind === 'tower');
    await capture('tower');
    assert.deepEqual(errors, [], `${level}: browser errors`);
    assert.deepEqual(requests, [], `${level}: external network requests`);
    await page.close();
  }
  await writeFile(new URL('manifest.json', output), JSON.stringify(report, null, 2) + '\n');
} finally {
  await browser.close();
}
