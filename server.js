const http = require('http');
const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, 'public');
const port = process.env.PORT || 3000;

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function sendError(res, status = 404) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(status === 404 ? 'Not found' : 'Internal server error');
}

function getSafePath(requestPath) {
  const safePath = path.normalize(requestPath).replace(/^\\+/g, '');
  const resolvedPath = path.join(publicDir, safePath);
  if (!resolvedPath.startsWith(publicDir)) {
    return null;
  }
  return resolvedPath;
}

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;
  const filePath = getSafePath(pathname);

  if (!filePath) {
    return sendError(res, 403);
  }

  fs.stat(filePath, (statErr, stats) => {
    if (statErr) {
      return sendError(res, 404);
    }

    let targetPath = filePath;
    if (stats.isDirectory()) {
      targetPath = path.join(filePath, 'index.html');
    }

    fs.readFile(targetPath, (readErr, data) => {
      if (readErr) {
        return sendError(res, 500);
      }
      const ext = path.extname(targetPath).toLowerCase();
      const mimeType = mimeTypes[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mimeType });
      res.end(data);
    });
  });
});

server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
