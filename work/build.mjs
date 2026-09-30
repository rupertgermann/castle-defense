// Usage: node work/build.mjs [name]  → outputs/<name>.html (default: castle-defense). Run from the project root.
import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
const name = process.argv[2] || 'castle-defense';
const tmp = `work/.bundle-${name}.js`;
await build({ entryPoints: ['work/game/main.js'], outfile: tmp, bundle: true, minify: true, format: 'iife', target: 'es2020', legalComments: 'inline' });
const script = (await readFile(tmp, 'utf8')).replaceAll('</script', '<\\/script');
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="dark"><title>Castle Defense</title>
<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#b2b5a4}canvas{display:block;width:100%;height:100%;outline:none;touch-action:none;opacity:0;transition:opacity 1.1s ease}body.ready canvas{opacity:1}@media(prefers-reduced-motion:reduce){canvas{transition:none}}</style></head><body><script>${script}</script></body></html>`;
await writeFile(`outputs/${name}.html`, html);
console.log(`Built outputs/${name}.html, ${(Buffer.byteLength(html) / 1024).toFixed(0)} KiB`);
