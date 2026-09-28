// Servidor local: las claves se leen exclusivamente del entorno del servidor.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const mime = { '.html':'text/html; charset=utf-8', '.js':'application/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.pdf':'application/pdf' };
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    const name = url.pathname.slice(5);
    if (!/^[a-z-]+$/.test(name) || !fs.existsSync(path.join(root, 'api', name + '.js'))) { res.writeHead(404).end(); return; }
    try {
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 4500000) { res.writeHead(413).end(); return; } }
      req.body = body ? JSON.parse(body) : {};
      req.query = Object.fromEntries(url.searchParams);
      res.status = code => { res.statusCode = code; return res; };
      res.json = data => { res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(data)); };
      res.send = data => res.end(data);
      await require('./api/' + name + '.js')(req, res);
    } catch (err) { if (!res.headersSent) res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:err.message})); }
    return;
  }
  const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).slice(1);
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep) || relative.split(/[\\/]/).some(x => x.startsWith('.')) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
  res.writeHead(200, {'Content-Type':mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store'});
  fs.createReadStream(file).pipe(res);
}).listen(4174, '127.0.0.1', () => console.log('Ficha 2.0: http://127.0.0.1:4174'));
