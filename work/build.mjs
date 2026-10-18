// Usage: node work/build.mjs [name] [--watch]  → outputs/<name>.html (default: castle-defense). Run from the project root.
import { build, context } from 'esbuild';
import { writeFile, rename } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export async function buildGame(name = 'castle-defense', watch = false) {
  const output = new URL(`../outputs/${name}.html`, import.meta.url);
  const options = {
    absWorkingDir: fileURLToPath(new URL('../', import.meta.url)),
    entryPoints: ['work/game/main.js'], bundle: true, minify: true,
    write: false, format: 'iife', target: 'es2020', legalComments: 'inline',
    plugins: [{ name: 'html', setup(builder) {
      builder.onEnd(async result => {
        if (result.errors.length) return;
        const script = result.outputFiles[0].text.replaceAll('</script', '<\\/script');
        const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="dark"><title>Castle Defense</title>
<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:radial-gradient(ellipse at 50% 40%,#2a1d10,#0d0905)}canvas{display:block;width:100%;height:100%;outline:none;touch-action:none;opacity:0;transition:opacity 1.1s ease}body.ready canvas{opacity:1}
#splash{position:fixed;inset:0;display:grid;place-items:center;font:italic 17px/1 "Palatino Linotype",Palatino,Georgia,serif;letter-spacing:.12em;color:#cdb88f;transition:opacity .6s;animation:sp 1.6s ease-in-out infinite alternate}body.ready #splash{opacity:0;animation:none;pointer-events:none}@keyframes sp{from{opacity:.45}to{opacity:1}}
body:not(.ready) #cd{visibility:hidden}body:not(.ready) #cd *{animation-play-state:paused!important}
@media(prefers-reduced-motion:reduce){canvas,#splash{transition:none;animation:none}}</style></head><body><div id="splash" role="status">Raising the walls…</div>
<script>/* Let the splash paint before the world is built (that blocks the main thread for a while). */requestAnimationFrame(()=>setTimeout(()=>{${script}}));</script></body></html>`;
        const temporary = new URL(`${output.href}.tmp`);
        await writeFile(temporary, html);
        await rename(temporary, output);
        console.log(`Built outputs/${name}.html, ${(Buffer.byteLength(html) / 1024).toFixed(0)} KiB`);
      });
    } }],
  };
  if (!watch) return build(options);
  const watcher = await context(options);
  try {
    await watcher.rebuild();
    await watcher.watch();
    return watcher;
  } catch (error) {
    await watcher.dispose();
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await buildGame(process.argv.slice(2).find(arg => arg !== '--watch'), process.argv.includes('--watch'));
}
