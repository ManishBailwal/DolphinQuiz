import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';

import {
  HttpError,
  createRouter,
  readJson,
  safeJoin,
  sendJson,
  serveFile,
} from './http.js';

import {
  ensureMediaDirs,
  listMedia,
  MEDIA_ROOT,
  saveUpload,
} from './media.js';

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
const HOST = process.env.HOST ?? '0.0.0.0';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12) {
  throw new Error('Set ADMIN_PASSWORD to a password of at least 12 characters.');
}

if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
  throw new Error('Set SESSION_SECRET to a random secret of at least 32 characters.');
}

const PUBLIC_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
);

const SESSION_SECONDS = 8 * 60 * 60;
const COOKIE_NAME = 'quiz_admin_session';

ensureMediaDirs();

function isSecureRequest(req) {
  return process.env.NODE_ENV === 'production'
    || req.headers['x-forwarded-proto'] === 'https';
}

function cookieOptions(req, maxAge = SESSION_SECONDS) {
  const secure = isSecureRequest(req) ? '; Secure' : '';

  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

function signSession(payload) {
  return createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('hex');
}

function createSession() {
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const payload = `${expires}.${randomBytes(32).toString('hex')}`;

  return `${payload}.${signSession(payload)}`;
}

function hasAdminSession(req) {
  const cookieHeader = req.headers.cookie ?? '';

  const cookie = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`));

  if (!cookie) return false;

  const token = cookie.slice(COOKIE_NAME.length + 1);
  const parts = token.split('.');

  if (parts.length !== 3) return false;

  const [expiresText, nonce, signature] = parts;
  const expires = Number(expiresText);

  if (
    !Number.isSafeInteger(expires) ||
    expires <= Math.floor(Date.now() / 1000) ||
    !/^[a-f0-9]{64}$/.test(nonce) ||
    !/^[a-f0-9]{64}$/.test(signature)
  ) {
    return false;
  }

  const expected = signSession(`${expiresText}.${nonce}`);
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function passwordMatches(candidate) {
  if (typeof candidate !== 'string') return false;

  const a = Buffer.from(candidate);
  const b = Buffer.from(ADMIN_PASSWORD);

  return a.length === b.length && timingSafeEqual(a, b);
}

function loginPage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Admin login</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh; display: grid; place-items: center;
      padding: 24px; background: #f4f6fb; color: #172033;
      font: 16px system-ui, sans-serif;
    }
    form {
      width: 100%; max-width: 400px; padding: 28px;
      background: white; border: 1px solid #e2e7f0;
      border-radius: 16px; box-shadow: 0 12px 40px #17203312;
    }
    h1 { margin: 0 0 8px; font-size: 25px; }
    p { color: #647087; margin: 0 0 22px; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    input, button {
      width: 100%; padding: 12px 14px; border-radius: 9px;
      font: inherit;
    }
    input { border: 1px solid #cbd3e1; margin-bottom: 16px; }
    button {
      border: 0; background: #193b77; color: white;
      font-weight: 700; cursor: pointer;
    }
    #error { color: #b42318; margin-top: 14px; }
  </style>
</head>
<body>
  <form id="login">
    <h1>Admin login</h1>
    <p>Sign in to manage quiz questions and settings.</p>
    <label for="password">Admin password</label>
    <input id="password" type="password" autocomplete="current-password"
      required autofocus>
    <button type="submit">Sign in</button>
    <div id="error" role="alert"></div>
  </form>
  <script>
    const form = document.getElementById('login');
    const error = document.getElementById('error');

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      error.textContent = '';

      const button = form.querySelector('button');
      button.disabled = true;

      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            password: document.getElementById('password').value
          })
        });

        const result = await response.json();

        if (!response.ok) throw new Error(result.error || 'Login failed.');

        location.reload();
      } catch (err) {
        error.textContent = err.message || 'Unable to sign in.';
      } finally {
        button.disabled = false;
      }
    });
  </script>
</body>
</html>`;
}

const api = createRouter();

const idOf = (params) => {
  const id = Number(params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, 'Invalid id.');
  return id;
};

/* Public read APIs used by the quiz screens. */
api.get('/api/settings', () => getSettings());
api.get('/api/summary', () => getSummary());
api.get('/api/questions', ({ query }) =>
  listQuestions({ track: query.get('track'), category: query.get('category') }),
);
api.get('/api/sets', ({ query }) =>
  listSets({ track: query.get('track'), category: query.get('category') }),
);

/* Admin write APIs. */
api.put('/api/settings', async ({ req }) => saveSettings(await readJson(req)));

api.post('/api/questions', async ({ req }) =>
  createQuestion(await readJson(req)),
);
api.put('/api/questions/:id', async ({ req, params }) =>
  updateQuestion(idOf(params), await readJson(req)),
);
api.delete('/api/questions/:id', ({ params }) => {
  deleteQuestion(idOf(params));
  return { ok: true };
});

api.post('/api/sets', async ({ req }) => createSet(await readJson(req)));
api.put('/api/sets/:id', async ({ req, params }) =>
  updateSet(idOf(params), await readJson(req)),
);
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
api.post('/api/upload', ({ req, query }) =>
  saveUpload(req, query.get('kind'), query.get('filename')),
);

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const { pathname } = url;

    /* Authentication endpoints. */
    if (pathname === '/api/auth/login' && req.method === 'POST') {
      const body = await readJson(req);

      if (!passwordMatches(body?.password)) {
        res.writeHead(401, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(JSON.stringify({ error: 'Incorrect password.' }));
        return;
      }

      const token = createSession();
      const secure = isSecureRequest(req) ? '; Secure' : '';

      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Set-Cookie': `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}${secure}`,
      });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (pathname === '/api/auth/logout' && req.method === 'POST') {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Set-Cookie': cookieOptions(req, 0),
        'Cache-Control': 'no-store',
      });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    /* Admin API protection. Public quiz GET APIs remain available. */
    if (pathname.startsWith('/api/')) {
      const isMediaList = pathname === '/api/media';
      const needsAuth = req.method !== 'GET' || isMediaList;

      if (needsAuth && !hasAdminSession(req)) {
        sendJson(res, 401, { error: 'Please log in to access admin features.' });
        return;
      }

      const found = api.match(req.method, pathname);
      if (!found) throw new HttpError(404, 'Unknown API route.');

      const result = await found.handler({
        req,
        res,
        params: found.params,
        query: url.searchParams,
      });

      sendJson(res, 200, result);
      return;
    }

    /* Only authenticated users can open the admin page. */
    if (pathname === '/admin' || pathname === '/admin/') {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        throw new HttpError(405, 'Method not allowed.');
      }

      if (!hasAdminSession(req)) {
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        });
        res.end(loginPage());
        return;
      }

      const adminFile = safeJoin(PUBLIC_ROOT, '/admin.html');
      if (!adminFile) throw new HttpError(404, 'Not found.');
      serveFile(req, res, adminFile);
      return;
    }

    /* Prevent bypassing /admin by visiting /admin.html directly. */
    if (pathname === '/admin.html') {
      res.writeHead(302, { Location: '/admin', 'Cache-Control': 'no-store' });
      res.end();
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      throw new HttpError(405, 'Method not allowed.');
    }

    if (pathname.startsWith('/media/')) {
      const file = safeJoin(MEDIA_ROOT, pathname.slice('/media'.length));
      if (!file) throw new HttpError(404, 'Not found.');
      serveFile(req, res, file);
      return;
    }

    const pagePath = pathname === '/' ? '/index.html' : pathname;
    const file = safeJoin(PUBLIC_ROOT, pagePath);

    if (!file) throw new HttpError(404, 'Not found.');
    serveFile(req, res, file);
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (status === 500) console.error(err);

    if (res.headersSent) {
      res.destroy();
      return;
    }

    const message =
      status === 500 ? 'Something went wrong on the server.' : err.message;

    if (req.url.startsWith('/api/')) {
      sendJson(res, status, { error: message });
    } else {
      res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(message);
    }
  }
});

server.requestTimeout = 0;

server.listen(PORT, HOST, () => {
  console.log('Quiz app running');
  console.log(`  Quiz screen  http://localhost:${PORT}/`);
  console.log(`  Admin panel  http://localhost:${PORT}/admin`);
  console.log(`  Database     ${DB_PATH}`);
  console.log(`  Media folder ${MEDIA_ROOT}`);
});