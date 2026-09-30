import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
await build({ entryPoints: ['work/scene.js'], outfile: 'work/scene.bundle.js', bundle: true, minify: true, format: 'iife', target: 'es2020', legalComments: 'inline' });
const script = (await readFile('work/scene.bundle.js', 'utf8')).replaceAll('</script', '<\\/script');
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="dark"><title></title>
<!-- Created 2026-09-30. Started 15:44:54 Europe/Berlin. Finished 16:13:02 Europe/Berlin, 14:13:02 UTC. All geometry, materials, controls, and rendering libraries are embedded. -->
<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#b2b5a4}canvas{display:block;width:100%;height:100%;outline:none;touch-action:none;cursor:grab;opacity:0;transition:opacity 1.1s ease}body.ready canvas{opacity:1}canvas:active{cursor:grabbing}@media(prefers-reduced-motion:reduce){canvas{transition:none}}</style></head><body><script>${script}</script></body></html>`;
await writeFile('outputs/castle-at-dawn.html', html);
console.log(`Built single offline HTML, ${(Buffer.byteLength(html) / 1024).toFixed(0)} KiB`);
