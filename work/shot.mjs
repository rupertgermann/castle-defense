// Screenshot harness for builders and critics. Run from the project root.
// Usage: node work/shot.mjs <html-name> <out.png> [--size 1600x900] [--eval "<async js run in page>"] [--wait ms]
// Example: node work/shot.mjs castle-defense work/shots/a.png --eval "__game.ui.debugStart?.()" --wait 4000
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
const [name, out, ...rest] = process.argv.slice(2);
const opt = k => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : undefined; };
const [w, h] = (opt('--size') || '1600x900').split('x').map(Number);
const browser = await chromium.launch({ headless: true, args: process.platform === 'darwin' ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : [] });
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
await page.goto(pathToFileURL(`${process.cwd()}/outputs/${name}.html`).href);
await page.waitForFunction(() => window.__sceneReady === true, null, { timeout: 120000 });
await page.waitForTimeout(1500);
if (opt('--eval')) await page.evaluate(`(async () => { ${opt('--eval')} })()`);
await page.waitForTimeout(Number(opt('--wait') || 1000));
await mkdir(dirname(out), { recursive: true });
await page.screenshot({ path: out });
const fps = await page.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else r(n); }; requestAnimationFrame(f); }));
console.log(JSON.stringify({ out, fps, errors }, null, 1));
await browser.close();
