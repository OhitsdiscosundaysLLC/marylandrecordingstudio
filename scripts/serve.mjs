// Local preview server: serves dist/ with clean URLs and runs the /api functions.
// Usage: npm run dev   (then open http://localhost:3000)
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const PORT = Number(process.env.PORT || 3000);
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json', '.mp4': 'video/mp4' };

async function tryFile(p) { try { const s = await stat(p); return s.isFile() ? p : null; } catch { return null; } }

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (/^\/hq-[a-z0-9]+$/.test(url.pathname)) { req.url = `/api/hq?slug=${url.pathname.slice(1)}`; const mod = await import(pathToFileURL(path.join(root, 'api', 'hq.js')).href); return await mod.default(req, res); }
    if (url.pathname.startsWith('/api/')) {
      const name = url.pathname.slice(5).replace(/[^a-z0-9/-]/gi, '').replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
      const file = await tryFile(path.join(root, 'api', `${name}.js`));
      if (!file) { res.statusCode = 404; return res.end('{"error":"not_found"}'); }
      const mod = await import(pathToFileURL(file).href);
      req.query = Object.fromEntries(url.searchParams);
      return await mod.default(req, res);
    }
    const clean = decodeURIComponent(url.pathname).replace(/\.\.+/g, '');
    const candidates = [path.join(dist, clean), path.join(dist, clean, 'index.html'), path.join(dist, `${clean}.html`)];
    let file = null;
    for (const c of candidates) if ((file = await tryFile(c))) break;
    const status = file ? 200 : 404;
    file ||= path.join(dist, '404.html');
    res.writeHead(status, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    res.end('Server error');
  }
}).listen(PORT, () => console.log(`Preview: http://localhost:${PORT}`));
