// スマホで試す用の小さなサーバー（同じWi-Fiの中だけで使う）
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 8080;
const ROOT = __dirname;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };
const ALLOWED = new Set(Object.keys(TYPES));

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(ROOT, p));
  const ext = path.extname(file).toLowerCase();
  if (!file.startsWith(ROOT + path.sep) || !ALLOWED.has(ext) || path.basename(file) === 'server.js') {
    res.writeHead(404); res.end('not found'); return;
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[ext], 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}).listen(PORT, '0.0.0.0', () => {
  console.log('カレンダーのサーバーを起動しました。スマホのブラウザで次のアドレスを開いてください：');
  for (const list of Object.values(os.networkInterfaces()))
    for (const a of list) if (a.family === 'IPv4' && !a.internal) console.log(`  http://${a.address}:${PORT}`);
  console.log('（終わるときはこの黒い画面を閉じてください）');
  if (process.argv.includes('--open')) require('child_process').exec('start "" http://localhost:' + PORT);
});
