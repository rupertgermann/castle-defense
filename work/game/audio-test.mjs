// Offline audio verification: renders every sound and several full mixes in headless Chromium, checks peak/silence/duration.
// Usage (project or worktree root): node work/build.mjs dev-audio && node work/game/audio-test.mjs [dev-audio]
import { chromium } from '/Users/rupertgermann/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'node:url';
const name = process.argv[2] || 'dev-audio';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
await page.goto(pathToFileURL(`${process.cwd()}/outputs/${name}.html`).href, { timeout: 120000 });
await page.waitForFunction(() => window.__sceneReady === true, null, { timeout: 120000 });
const rows = await page.evaluate(() => __game.audio.debug.report());
console.log('name'.padEnd(52) + 'var  dur(s)   peak   rms(dBFS)  ok');
for (const r of rows) console.log(r.name.padEnd(52) + String(r.variants).padEnd(5) + String(r.dur).padEnd(9) + String(r.peak).padEnd(7) + String(r.rmsDb).padEnd(11) + (r.ok ? 'ok' : 'FAIL'));
console.log('console errors/warnings:', errors);
await browser.close();
process.exit(rows.every(r => r.ok) ? 0 : 1);
