// Start with:  npm start   (then open http://localhost:3000)

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpError, createRouter, readJson, safeJoin, sendJson, serveFile } from './http.js';
import { ensureMediaDirs, listMedia, MEDIA_ROOT, saveUpload } from './media.js';
import {
  DB_PATH,
  createQuestion,
  createSet,
  deleteQuestion,
  deleteSet,
  getSettings,
  getSummary,
  listQuestions,
  listSets,
  moveItem,
  saveSettings,
  updateQuestion,
  updateSet,
} from './db.js';

const PORT = Number(process.env.PORT ?? 3000);
// Only this computer can reach the app unless you set HOST=0.0.0.0.
const HOST = process.env.HOST ?? '0.0.0.0';
const PUBLIC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

ensureMediaDirs();

/* --------------------------------------------------------------- API routes */

const api = createRouter();
const idOf = (params) => {
  const id = Number(params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, 'Invalid id.');
  return id;
};

api.get('/api/settings', () => getSettings());
api.put('/api/settings', async ({ req }) => saveSettings(await readJson(req)));
api.get('/api/summary', () => getSummary());

api.get('/api/questions', ({ query }) => listQuestions({ track: query.get('track'), category: query.get('category') }));
api.post('/api/questions', async ({ req }) => createQuestion(await readJson(req)));
api.put('/api/questions/:id', async ({ req, params }) => updateQuestion(idOf(params), await readJson(req)));
api.delete('/api/questions/:id', ({ params }) => {
  deleteQuestion(idOf(params));
  return { ok: true };
});

api.get('/api/sets', ({ query }) => listSets({ track: query.get('track'), category: query.get('category') }));
api.post('/api/sets', async ({ req }) => createSet(await readJson(req)));
api.put('/api/sets/:id', async ({ req, params }) => updateSet(idOf(params), await readJson(req)));
api.delete('/api/sets/:id', ({ params }) => {
  deleteSet(idOf(params));
  return { ok: true };
});

api.post('/api/move', async ({ req }) => {
  const { kind, id, dir } = await readJson(req);
  moveItem(kind, Number(id), Number(dir));
  return { ok: true };
});

api.get('/api/media', ({ query }) => listMedia(query.get('kind')));
api.post('/api/upload', ({ req, query }) => saveUpload(req, query.get('kind'), query.get('filename')));

/* ------------------------------------------------------------------- server */

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const { pathname } = url;

    if (pathname.startsWith('/api/')) {
      const found = api.match(req.method, pathname);
      if (!found) throw new HttpError(404, 'Unknown API route.');
      const result = await found.handler({ req, res, params: found.params, query: url.searchParams });
      sendJson(res, 200, result);
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed.');

    if (pathname.startsWith('/media/')) {
      const file = safeJoin(MEDIA_ROOT, pathname.slice('/media'.length));
      if (!file) throw new HttpError(404, 'Not found');
      serveFile(req, res, file);
      return;
    }

    const pagePath = pathname === '/' ? '/index.html' : pathname === '/admin' ? '/admin.html' : pathname;
    const file = safeJoin(PUBLIC_ROOT, pagePath);
    if (!file) throw new HttpError(404, 'Not found');
    serveFile(req, res, file);
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (status === 500) console.error(err);
    if (res.headersSent) {
      res.destroy();
      return;
    }
    const message = status === 500 ? 'Something went wrong on the server.' : err.message;
    const wantsJson = req.url.startsWith('/api/');
    if (wantsJson) sendJson(res, status, { error: message });
    else {
      res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(message);
    }
  }
});

// Node closes requests after 5 minutes by default, which would cut off large video uploads.
server.requestTimeout = 0;

server.listen(PORT, HOST, () => {
  const shown = HOST === '0.0.0.0' ? 'localhost' : HOST;
  console.log(`Quiz app running`);
  console.log(`  Quiz screen  http://${shown}:${PORT}/`);
  console.log(`  Admin panel  http://${shown}:${PORT}/admin`);
  console.log(`  Database     ${DB_PATH}`);
  console.log(`  Media folder ${MEDIA_ROOT}`);
});
