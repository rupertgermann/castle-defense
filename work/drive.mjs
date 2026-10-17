// Scripted session for UX review: runs a steps file against the built game and saves numbered screenshots.
// Usage (project root): node work/drive.mjs <steps.mjs> [--size 1440x900] [--level frostmere] [--touch] [--out dir]
// The steps file default-exports async ({ page, shot, padXY, wait }) => {}.
import { chromium } from '/Users/rupertgermann/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
const [stepsFile, ...rest] = process.argv.slice(2);
const opt = k => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : undefined; };
const [w, h] = (opt('--size') || '1440x900').split('x').map(Number), touch = rest.includes('--touch');
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
const t0 = Date.now();
await page.goto(pathToFileURL(`${process.cwd()}/outputs/castle-defense.html`).href + (opt('--level') ? `?level=${opt('--level')}` : ''));
await page.waitForFunction(() => window.__sceneReady === true, null, { timeout: 120000 });
console.log('ready in', Date.now() - t0, 'ms');
const dir = `work/shots/ux/${opt('--out') || 'run'}`;
await mkdir(dir, { recursive: true });
let n = 0;
const shot = async label => { const p = `${dir}/${String(++n).padStart(2, '0')}-${label}.png`; await page.screenshot({ path: p }); console.log('shot', p); };
const wait = ms => page.waitForTimeout(ms);
const padXY = id => page.evaluate(id => { const v = __game.towers.pads[id].pos.clone(); v.y += .5; v.project(__scene.camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; }, id);
await (await import(pathToFileURL(stepsFile).href)).default({ page, shot, padXY, wait });
console.log('errors', errors);
await browser.close();
