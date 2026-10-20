import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';

const name = process.argv[2] || 'dev-polish';
const dir = `work/shots/ux/${name}`;
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({ headless: true, args: process.platform === 'darwin' ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : [] });
const hash = createHash('sha256').update(await readFile(`outputs/${name}.html`)).digest('hex');
const failures = [], errors = [], checks = [];
const check = (value, label) => { checks.push({ label, passed: !!value }); if (!value) failures.push(label); };
const url = level => pathToFileURL(`${process.cwd()}/outputs/${name}.html`).href + `?level=${level}`;
async function open(level, viewport = { width: 1440, height: 900 }, touch = false) {
  const page = await browser.newPage({ viewport, hasTouch: touch, isMobile: touch, reducedMotion: 'reduce' });
  page.on('pageerror', e => errors.push(`${level}: ${e.message}`));
  await page.goto(url(level));
  await page.waitForFunction(() => window.__sceneReady, null, { timeout: 120000 });
  return page;
}
async function selectSite(page, id = 0) {
  const [x, y] = await page.evaluate(id => {
    const v = __game.towers.pads[id].pos.clone(); v.y += .5; v.project(__scene.camera);
    return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight];
  }, id);
  await page.mouse.click(x, y);
}
async function start(page, touch = false) {
  await page.locator('[data-a=diff][data-k=squire]')[touch ? 'tap' : 'click']();
  await page.locator('[data-a=begin]')[touch ? 'tap' : 'click']();
  await page.waitForFunction(() => __game.state.phase === 'build');
  await page.locator('.title').waitFor({ state: 'hidden' });
}
try {
  const page = await open('castle');
  await page.screenshot({ path: `${dir}/title.png` });
  await start(page);
  await page.locator('canvas').focus();
  await page.keyboard.press('Tab');
  check(await page.evaluate(() => document.activeElement.dataset.a === 'horn'), 'Tab leaves battlefield for HUD');
  await page.keyboard.press('Escape');
  if (await page.evaluate(() => __game.state.paused)) await page.keyboard.press('p');
  await page.locator('canvas').focus();
  await page.keyboard.press('ArrowRight');
  check(await page.evaluate(() => __game.state.selected?.kind === 'pad'), 'Arrow keys select build sites');
  await page.evaluate(() => __game.ui.debug.deselect());
  await selectSite(page);
  await page.locator('[data-r=mute]').focus();
  await page.keyboard.press('Tab');
  await page.waitForTimeout(150);
  check(await page.locator('.card .nm').textContent().catch(() => '') === 'Archer Tower', 'Keyboard focus previews tower');
  for (const [id, name] of [['archer', 'Archer Tower'], ['cannon', 'Bombard Tower'], ['mage', 'Arcane Spire'], ['ballista', 'Ballista'], ['cauldron', 'Pitch Cauldron'], ['trebuchet', 'Trebuchet']]) {
    await page.locator(`.bm-opt[data-t=${id}]`).focus();
    check(await page.locator('.card .nm').textContent() === name, `${name}: keyboard preview describes selected tower`);
  }
  await page.locator('[data-t=archer].bm-opt').click();
  await selectSite(page);
  await page.locator('[data-a=sell]').focus();
  const sellButton = await page.locator('[data-a=sell]').elementHandle();
  await page.evaluate(() => __game.ui.debug.give(1));
  await page.waitForTimeout(150);
  check(await page.evaluate(() => document.activeElement.dataset.a === 'sell'), 'Income preserves focused tower control');
  check(await sellButton.evaluate(el => el.isConnected), 'Income updates values without replacing tower buttons');
  await page.locator('canvas').focus();
  await page.keyboard.press('u');
  await page.waitForTimeout(100);
  check(await page.evaluate(() => {
    const ring = __scene.scene.children.find(o => o.material?.uniforms?.inner);
    return Number(ring.userData.key.split(',').at(-1)) === __game.state.towers[0].range;
  }), 'Keyboard upgrade refreshes the visible range ring');
  await page.evaluate(() => __game.ui.debug.give(1000));
  await page.keyboard.press('u');
  check(await page.locator('.max-level').textContent() === 'Fully upgraded', 'Maximum tower level has a clear label');
  await page.locator('[data-a=sell]').click();
  check(await page.evaluate(() => document.activeElement.dataset.a === 'sell'), 'Sell confirmation preserves focus');
  await page.keyboard.press('Escape');
  check(await page.evaluate(() => __game.state.towers.length === 1), 'Escape cancels sale');
  await page.keyboard.press('p');
  await selectSite(page, 1);
  check(await page.locator('.paused').isVisible(), 'Paused battlefield click keeps pause menu visible');
  check(await page.evaluate(() => __game.state.selected === null), 'Paused battlefield click cannot select a site');
  await page.evaluate(() => __game.ui.debug.deselect());
  const horn = await page.locator('[data-a=horn]').boundingBox();
  await page.mouse.click(horn.x + horn.width / 2, horn.y + horn.height / 2);
  check(await page.evaluate(() => __game.state.phase === 'build'), 'Paused horn cannot start a wave');
  await page.screenshot({ path: `${dir}/pause.png` });
  await page.keyboard.press('p');
  check(await page.evaluate(() => document.activeElement === document.querySelector('canvas')), 'Resume restores battlefield focus');
  await page.keyboard.press('Space');
  await page.keyboard.press('f');
  await page.keyboard.press('f');
  await page.waitForTimeout(8000);
  await page.screenshot({ path: `${dir}/combat.png` });
  check(await page.evaluate(() => __game.state.wave >= 1), 'Siege advances through actual combat');
  await page.keyboard.press('p');
  await page.locator('.pbtn[data-a=menu]').click();
  check(await page.evaluate(() => __game.state.phase !== 'title'), 'Changing battlefield requires abandonment confirmation');
  await page.close();

  for (const level of ['castle', 'frostmere', 'saltreach']) {
    for (const [width, height] of (level === 'castle' ? [[320, 568], [390, 844], [844, 390], [1024, 768]] : [[390, 844], [844, 390]])) {
      const page = await open(level, { width, height }, true);
      console.log('layout', level, width);
      await page.screenshot({ path: `${dir}/${level}-${width}-title.png` });
      const top = await page.locator('.gtitle').boundingBox();
      check(top.y >= 0, `${level} ${width}: title begins inside viewport`);
      await start(page, true);
      check(await page.locator('.stat, .ctrl').evaluateAll(els => els.every(el => { const b = el.getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth; })), `${level} ${width}: HUD stays on screen`);
      await page.evaluate(() => __game.ui.debug.select({ kind: 'pad', pad: __game.towers.pads[0] }));
      await page.locator('.bm-opt[data-t=trebuchet]').tap();
      await page.screenshot({ path: `${dir}/${level}-${width}-build.png` });
      check(await page.locator('.card .nm').textContent() === 'Trebuchet', `${level} ${width}: touch previews before buying`);
      const boxes = await page.locator('.bm-opt, .card').evaluateAll(els => els.map(el => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, right: b.right, bottom: b.bottom }; }));
      check(boxes.every(b => b.x >= 0 && b.y >= 0 && b.right <= width && b.bottom <= height), `${level} ${width}: build menu stays on screen`);
      if (width <= 760 || height <= 500) {
        const build = await page.locator('.card [data-a=build]').boundingBox();
        check(build.y >= 0 && build.y + build.height <= height, `${level} ${width}: Build action is visible without scrolling`);
        const grid = await page.locator('.bm').boundingBox(), hud = await page.locator('.top').boundingBox();
        check(grid.y >= hud.y + hud.height, `${level} ${width}: build choices do not cover HUD`);
      }
      await page.locator('.card [data-a=build]').tap();
      check(await page.evaluate(() => __game.state.towers.length === 1), `${level} ${width}: touch builds tower`);
      await page.keyboard.press('Space');
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${dir}/${level}-${width}-combat.png` });
      await page.evaluate(() => __game.ui.debug.win());
      await page.locator('.end.on').waitFor();
      await page.screenshot({ path: `${dir}/${level}-${width}-victory.png` });
      const end = await page.locator('.end-card').boundingBox();
      check(end.y >= 0, `${level} ${width}: result starts inside viewport`);
      await page.locator('.end [data-a=again]').click();
      await page.waitForFunction(() => window.__sceneReady && __game.state.phase === 'build', null, { timeout: 120000 });
      check(await page.evaluate(() => __game.state.maxLives === 30), `${level} ${width}: retry retains difficulty`);
      await page.evaluate(() => __game.ui.debug.lose());
      await page.locator('.end.on').waitFor();
      await page.screenshot({ path: `${dir}/${level}-${width}-defeat.png` });
      await page.close();
    }
  }

  for (const scenario of ['invalid-level', 'invalid-preferences', 'blocked-storage']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
    page.on('pageerror', e => errors.push(`${scenario}: ${e.message}`));
    await page.addInitScript(scenario => {
      if (scenario === 'invalid-preferences') {
        sessionStorage.setItem('cd-diff', 'constructor');
        localStorage.setItem('cd-stars:castle:knight', '-1');
      }
      if (scenario === 'blocked-storage') for (const key of ['localStorage', 'sessionStorage']) {
        Object.defineProperty(window, key, { get() { throw new DOMException('Storage blocked', 'SecurityError'); } });
      }
    }, scenario);
    await page.goto(url(scenario === 'invalid-level' ? 'constructor' : 'castle'));
    await page.waitForFunction(() => window.__sceneReady, null, { timeout: 120000 });
    check(await page.locator('.dcard[aria-checked=true]').count() === 1, `${scenario}: valid difficulty selected`);
    const before = page.url();
    await page.locator('.mapbtn[data-k=frostmere]').click();
    check(page.url() === before, `${scenario}: battlefield choice does not reload`);
    await page.locator('.dcard[data-k=squire]').click();
    await page.locator('[data-a=begin]').click();
    await page.waitForFunction(() => window.__sceneReady && __game.state.phase === 'build', null, { timeout: 120000 });
    check(await page.evaluate(() => __game.state.maxLives === 30 && document.querySelector('canvas').getAttribute('aria-label').startsWith('Frostmere')), `${scenario}: selected level and difficulty load`);
    await page.keyboard.press('p');
    await page.locator('.pbtn[data-a=again]').click();
    await page.locator('.pbtn[data-a=again]').click();
    await page.waitForFunction(() => window.__sceneReady && __game.state.phase === 'build', null, { timeout: 120000 });
    check(await page.evaluate(() => __game.state.maxLives === 30), `${scenario}: restart retains difficulty`);
    await page.evaluate(() => __game.ui.debug.win());
    await page.locator('.end.on').waitFor();
    check(await page.locator('.end h2').textContent() === 'Victory', `${scenario}: result works without saved preferences`);
    await page.close();
  }

} finally {
  await browser.close();
  await writeFile(`${dir}/results.json`, JSON.stringify({ hash, checks, failures, errors }, null, 2));
  console.log(JSON.stringify({ checks: checks.length, failures, errors }, null, 2));
}
assert.equal(errors.length, 0, 'No browser runtime errors');
assert.equal(failures.length, 0, 'All user interaction checks pass');
