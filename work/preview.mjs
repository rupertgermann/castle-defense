import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const file = new URL('../outputs/castle-at-dawn.html', import.meta.url);
createServer(async (request, response) => {
  if (request.url !== '/' && request.url !== '/castle-at-dawn.html') { response.writeHead(404); response.end(); return; }
  try {
    const html = await readFile(file);
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(html);
  } catch { response.writeHead(500); response.end(); }
}).listen(32947, '127.0.0.1', () => console.log('Castle-only preview at http://127.0.0.1:32947/'));
