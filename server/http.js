// Small helpers so server.js can stay readable without pulling in a framework.

import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.ogv': 'video/ogg',
};

export function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

export async function readJson(req, limit = 1_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, 'Request body is too large.');
    chunks.push(chunk);
  }
  if (size === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'The request body is not valid JSON.');
  }
}

// A tiny router: router.get('/api/things/:id', handler)
export function createRouter() {
  const routes = [];

  const add = (method, pattern, handler) => {
    const keys = [];
    const source = pattern.replace(/:([A-Za-z_]+)/g, (_, key) => {
      keys.push(key);
      return '([^/]+)';
    });
    routes.push({ method, regex: new RegExp(`^${source}$`), keys, handler });
  };

  return {
    get: (pattern, handler) => add('GET', pattern, handler),
    post: (pattern, handler) => add('POST', pattern, handler),
    put: (pattern, handler) => add('PUT', pattern, handler),
    delete: (pattern, handler) => add('DELETE', pattern, handler),

    // Returns { handler, params } or null
    match(method, pathname) {
      for (const route of routes) {
        if (route.method !== method) continue;
        const m = route.regex.exec(pathname);
        if (!m) continue;
        const params = {};
        route.keys.forEach((key, i) => {
          params[key] = decodeURIComponent(m[i + 1]);
        });
        return { handler: route.handler, params };
      }
      return null;
    },
  };
}

// Resolve a URL path inside a root folder. Returns null if it tries to escape the folder.
export function safeJoin(root, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  const full = path.resolve(root, '.' + path.posix.normalize('/' + decoded));
  return full === root || full.startsWith(root + path.sep) ? full : null;
}

// Serves a file. Supports HTTP Range requests, which browsers need for seeking inside videos.
export function serveFile(req, res, filePath) {
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    throw new HttpError(404, 'Not found');
  }
  if (!stat.isFile()) throw new HttpError(404, 'Not found');

  const type = MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
  const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' };
  const range = req.headers.range;

  let start = 0;
  let end = stat.size - 1;
  let status = 200;

  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (m && (m[1] !== '' || m[2] !== '')) {
      if (m[1] === '') {
        start = Math.max(stat.size - Number(m[2]), 0); // "last N bytes"
      } else {
        start = Number(m[1]);
        if (m[2] !== '') end = Math.min(Number(m[2]), stat.size - 1);
      }
      if (start > end || start >= stat.size) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
        res.end();
        return;
      }
      status = 206;
      headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
    }
  }

  headers['Content-Length'] = stat.size === 0 ? 0 : end - start + 1;
  res.writeHead(status, headers);
  if (req.method === 'HEAD' || stat.size === 0) {
    res.end();
    return;
  }
  pipeline(fs.createReadStream(filePath, { start, end }), res, () => {
    /* the browser closing the connection early (seeking) is normal */
  });
}
