import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, symlink, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const root = await mkdtemp(join(tmpdir(), 'castle-build-'));
let child;
try {
  await mkdir(join(root, 'work/game'), { recursive: true });
  await mkdir(join(root, 'outputs'));
  await copyFile(new URL('./build.mjs', import.meta.url), join(root, 'work/build.mjs'));
  await symlink(new URL('./node_modules', import.meta.url).pathname, join(root, 'work/node_modules'));
  await writeFile(join(root, 'work/game/main.js'), "import { value } from './value.js'; console.log(value);");
  const source = join(root, 'work/game/value.js');
  await writeFile(source, "export const value = 'before-change';");
  const { buildGame } = await import(new URL(`file://${root}/work/build.mjs`));
  await buildGame('custom');
  assert.match(await readFile(join(root, 'outputs/custom.html'), 'utf8'), /before-change/);

  // Use an ephemeral port in the isolated copy so no existing preview is touched.
  const preview = (await readFile(new URL('./preview.mjs', import.meta.url), 'utf8'))
    .replace('createServer(async', 'const server = createServer(async')
    .replace('.listen(32947,', '.listen(0,')
    .replace("console.log('Castle Defense preview at http://127.0.0.1:32947/ (watching game sources)')", 'console.log(`TEST_PORT=${server.address().port}`)');
  await writeFile(join(root, 'work/preview.mjs'), preview);
  child = spawn(process.execPath, [join(root, 'work/preview.mjs')], { cwd: tmpdir(), stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', chunk => { log += chunk; });
  child.stderr.on('data', chunk => { log += chunk; });
  async function until(check) {
    for (let i = 0; i < 100; i++) {
      if (await check()) return;
      assert.equal(child.exitCode, null, log);
      await delay(100);
    }
    assert.fail(`Timed out: ${log}`);
  }
  await until(() => /TEST_PORT=(\d+)/.test(log));
  const base = `http://127.0.0.1:${log.match(/TEST_PORT=(\d+)/)[1]}`;
  const html = () => fetch(base).then(response => response.text());
  assert.match(await html(), /before-change/);
  assert.equal((await fetch(`${base}/castle-defense.html?level=frostmere`)).status, 200);
  assert.equal((await fetch(`${base}/missing`)).status, 404);
  await writeFile(source, "export const value = 'after-change';");
  await until(async () => (await html()).includes('after-change'));
  const valid = await html();
  await writeFile(source, 'export const value = ;');
  await until(() => log.includes('ERROR'));
  assert.equal(await html(), valid, 'A failed build must preserve the last working HTML');
  await writeFile(source, "export const value = 'recovered';");
  await until(async () => (await html()).includes('recovered'));
  console.log('Passed: single build, preview routes, rebuild, failed-build preservation, recovery.');
} finally {
  if (child && child.exitCode === null) {
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill();
    await exited;
  }
  await rm(root, { recursive: true, force: true });
}
