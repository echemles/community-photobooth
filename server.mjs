import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const port = Number(process.env.PHOTOBOOTH_PORT || 4178);
const files = { ...Object.fromEntries(['illustrated','clay','retro'].map(name => ['/assets/' + name + '.png', ['assets/' + name + '.png', 'image/png']])), '/ipad.css': ['ipad.css', 'text/css'], '/brand.css': ['brand.css', 'text/css'], '/tablet.css': ['tablet.css', 'text/css'], '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'], '/style.css': ['style.css', 'text/css'], '/app.js': ['app.js', 'text/javascript'] };
createServer(async (req, res) => {
  const entry = files[new URL(req.url, 'http://localhost').pathname];
  if (!entry || !['GET', 'HEAD'].includes(req.method)) { res.writeHead(404); return res.end('Not found'); }
  try {
    let body = await readFile(new URL(entry[0], import.meta.url));
    if (entry[0] === 'app.js') body = Buffer.concat([await readFile(new URL('./vendor/libphonenumber-min.js', import.meta.url)), Buffer.from('\n;\n'), body]);
    res.writeHead(200, { 'Content-Type': `${entry[1]}; charset=utf-8`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Permissions-Policy': 'camera=(self), microphone=(self)', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'" });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch { res.writeHead(500); res.end('Unable to load the booth.'); }
}).listen(port, '127.0.0.1', () => console.log(`Community Photobooth is ready: http://localhost:${port}`));
