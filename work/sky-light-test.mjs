import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const file = new URL(`../outputs/${process.argv[2] || 'castle-defense'}.html`, import.meta.url);
const browser = await chromium.launch({ headless: true, args: process.platform === 'darwin' ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : [] });
try {
  for (const level of ['castle', 'frostmere', 'saltreach']) {
    const page = await browser.newPage();
    const errors = [], filterWarnings = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text());
      if (message.text().includes('sigmaRadians')) filterWarnings.push(message.text());
    });
    await page.goto(`${file.href}?level=${level}`);
    await page.waitForFunction(() => window.__sceneReady === true, null, { timeout: 120000 });
    assert(await page.evaluate(() => window.__scene.scene.environment?.isTexture === true), `${level}: sky environment exists`);
    assert.deepEqual(errors, [], `${level}: browser errors`);
    assert.deepEqual(filterWarnings, [], `${level}: sky filter warnings`);
    console.log(`Passed: ${level} sky environment without filter warnings.`);
    await page.close();
  }
} finally {
  await browser.close();
}
