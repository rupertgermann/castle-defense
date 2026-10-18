// Full playthrough through real input: click pads, hotkeys, horn; a simple bot spends gold between waves.
// Usage (project root): node work/playtest.mjs [html-name] [speed] [level]
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
const name = process.argv[2] || 'castle-defense', speed = Number(process.argv[3] || 3), level = process.argv[4];
const browser = await chromium.launch({ headless: true, args: process.platform === 'darwin' ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : [] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(pathToFileURL(`${process.cwd()}/outputs/${name}.html`).href + (level ? `?level=${level}` : ''));
await page.waitForFunction(() => window.__sceneReady === true, null, { timeout: 120000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: 'work/shots/play/0-title.png' });
await page.keyboard.press('Enter');
await page.waitForTimeout(2500);
const st = () => page.evaluate(() => { const s = __game.state; return { phase: s.phase, wave: s.wave, gold: s.gold, lives: s.lives, towers: s.towers.length, enemies: s.enemies.length }; });
console.log('after start', await st());
// Build one tower by real clicking: project a pad to screen, click it, press a hotkey.
async function clickBuild(padId, key) {
  const p = await page.evaluate(id => { const v = __game.towers.pads[id].pos.clone(); v.y += .5; v.project(__scene.camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; }, padId);
  await page.mouse.click(p[0], p[1]); await page.waitForTimeout(400);
  const sel = await page.evaluate(() => __game.state.selected && __game.state.selected.kind);
  await page.keyboard.press(key); await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  return sel;
}
// Pads nearest the gate first (both lanes converge there).
const order = await page.evaluate(() => __game.towers.pads.map(p => [p.id, p.pos.distanceTo(__game.lanes[0].pointAt(__game.lanes[0].length))]).sort((a, b) => a[1] - b[1]).map(a => a[0]));
console.log('click-select pad0:', await clickBuild(order[0], '1'), 'click-select pad1:', await clickBuild(order[1], '1'), await st());
await page.screenshot({ path: 'work/shots/play/1-built.png' });
// Bot: between waves, spend gold (build on nearest free pad cycling types, else upgrade cheapest).
const spend = () => page.evaluate(() => {
  const T = __game.towers, s = __game.state, types = ['archer', 'cannon', 'mage', 'ballista'];
  for (let guard = 0; guard < 20; guard++) {
    const free = T.pads.filter(p => !p.tower).sort((a, b) => a.pos.distanceTo(__game.lanes[1].pointAt(__game.lanes[1].length)) - b.pos.distanceTo(__game.lanes[1].pointAt(__game.lanes[1].length)));
    const type = types[s.towers.length % 4];
    if (free.length && s.towers.length < 10 && s.gold >= T.TOWER_TYPES[type].levels[0].cost) { T.buildTower(free[0], type); continue; }
    const up = s.towers.filter(t => T.upgradeCost(t) != null).sort((a, b) => T.upgradeCost(a) - T.upgradeCost(b))[0];
    if (up && s.gold >= T.upgradeCost(up)) { T.upgradeTower(up); continue; }
    if (free.length && s.gold >= T.TOWER_TYPES[type].levels[0].cost) { T.buildTower(free[0], type); continue; }
    break;
  }
});
await page.evaluate(s => { __game.state.speed = s; }, speed);
const t0 = Date.now();
let lastWave = -1;
while (Date.now() - t0 < 25 * 60e3) {
  const s = await st();
  if (s.phase === 'won' || s.phase === 'lost') { console.log('END', s); break; }
  if (s.phase === 'build') { await spend(); await page.keyboard.press('Space'); }
  if (s.wave !== lastWave) { console.log(new Date().toISOString().slice(11, 19), s); lastWave = s.wave; if (s.wave === 5 || s.wave === 10) await page.screenshot({ path: `work/shots/play/wave${s.wave}.png` }); }
  await page.waitForTimeout(1000);
}
await page.waitForTimeout(3000);
await page.screenshot({ path: 'work/shots/play/9-end.png' });
console.log('final', await st(), 'errors', errors);
await browser.close();
