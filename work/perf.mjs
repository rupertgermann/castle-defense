// GPU cost of one frame mid-battle at Retina scale. Usage (project root): node work/perf.mjs [html-name]
// Renders the composer back-to-back with a readPixels fence; prints median ms, draw calls and triangles per frame.
import { chromium } from '/Users/rupertgermann/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'node:url';
const name = process.argv[2] || 'castle-defense';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1728, height: 1000 }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(`${process.cwd()}/outputs/${name}.html`).href);
await page.waitForFunction(() => window.__sceneReady === true, null, { timeout: 120000 });
await page.keyboard.press('Enter'); await page.waitForTimeout(1500);
await page.keyboard.press('Space'); await page.waitForTimeout(8000); // horn: enemies on the field
console.log(await page.evaluate(() => {
  const { renderer } = __castle, gl = renderer.getContext(), c = __scene.composer, px = new Uint8Array(4);
  const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px), runs = [];
  for (let k = 0; k < 5; k++) { sync(); const s = performance.now(); for (let i = 0; i < 30; i++) { c.render(); sync(); } runs.push((performance.now() - s) / 30); }
  renderer.info.autoReset = false; renderer.info.reset(); c.render(); const { calls, triangles } = renderer.info.render; renderer.info.autoReset = true;
  return { medianMs: +runs.sort((a, b) => a - b)[2].toFixed(1), calls, triangles, buffer: [gl.drawingBufferWidth, gl.drawingBufferHeight] };
}));
await browser.close();
