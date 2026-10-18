import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { buildGame } from './build.mjs';
const watcher = await buildGame('castle-defense', true);
const file = new URL('../outputs/castle-defense.html', import.meta.url);
createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (pathname !== '/' && pathname !== '/castle-defense.html') { response.writeHead(404); response.end(); return; }
  try {
    const html = await readFile(file);
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(html);
  } catch { response.writeHead(500); response.end(); }
}).listen(32947, '127.0.0.1', () => console.log('Castle Defense preview at http://127.0.0.1:32947/ (watching game sources)'))
  .on('error', async error => { console.error(error); await watcher.dispose(); process.exitCode = 1; });
