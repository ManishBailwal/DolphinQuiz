// Images and videos live in a plain folder on disk (default: ./media), not in the database.
// The database only stores the relative path, e.g. "images/map.png".

import fs from 'node:fs';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { HttpError } from './http.js';

export const MEDIA_ROOT = path.resolve(process.env.MEDIA_DIR ?? 'media');

const KINDS = {
  image: { dir: 'images', exts: ['.jpg', '.jpeg', '.png', '.gif', '.webp'], maxBytes: 25 * 1024 * 1024 },
  video: { dir: 'videos', exts: ['.mp4', '.m4v', '.webm', '.ogv'], maxBytes: 2 * 1024 * 1024 * 1024 },
};

export function ensureMediaDirs() {
  for (const spec of Object.values(KINDS)) {
    fs.mkdirSync(path.join(MEDIA_ROOT, spec.dir), { recursive: true });
  }
}

function spec(kind) {
  const s = KINDS[kind];
  if (!s) throw new HttpError(400, 'kind must be "image" or "video".');
  return s;
}

// Lists the files in the folder so the admin can pick media that is already there.
// You can also copy files into media/images or media/videos by hand.
export function listMedia(kind) {
  const s = spec(kind);
  const dir = path.join(MEDIA_ROOT, s.dir);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && s.exts.includes(path.extname(e.name).toLowerCase()))
    .map((e) => ({
      file: `${s.dir}/${e.name}`,
      name: e.name,
      size: fs.statSync(path.join(dir, e.name)).size,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Checks that "images/x.png" is a real file of the right kind. Returns the clean relative path.
export function checkMediaFile(kind, relPath) {
  const s = spec(kind);
  const file = typeof relPath === 'string' ? relPath.trim() : '';
  const label = kind === 'image' ? 'an image' : 'a video';
  if (!file) throw new HttpError(400, `Choose or upload ${label} first.`);
  const m = /^(images|videos)\/([^/\\]+)$/.exec(file);
  if (!m || m[1] !== s.dir || !s.exts.includes(path.extname(m[2]).toLowerCase())) {
    throw new HttpError(400, `That file is not ${label} in the media folder.`);
  }
  if (!fs.existsSync(path.join(MEDIA_ROOT, s.dir, m[2]))) {
    throw new HttpError(400, `${file} was not found in the media folder.`);
  }
  return file;
}

function slug(name) {
  return name
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 60);
}

// The browser sends the raw file as the request body. We stream it to disk so a
// large video never has to fit in memory.
export async function saveUpload(req, kind, originalName) {
  const s = spec(kind);
  const ext = path.extname(originalName ?? '').toLowerCase();
  if (!s.exts.includes(ext)) {
    throw new HttpError(415, `Unsupported ${kind} type. Allowed: ${s.exts.join(', ')}`);
  }
  const limitMb = Math.round(s.maxBytes / 1024 / 1024);
  if (Number(req.headers['content-length'] ?? 0) > s.maxBytes) {
    throw new HttpError(413, `That file is larger than ${limitMb} MB.`);
  }

  const dir = path.join(MEDIA_ROOT, s.dir);
  fs.mkdirSync(dir, { recursive: true });
  const base = slug(path.basename(originalName, path.extname(originalName))) || kind;

  let name = `${base}${ext}`;
  for (let n = 1; fs.existsSync(path.join(dir, name)); n++) name = `${base}-${n}${ext}`;

  const target = path.join(dir, name);
  const partial = `${target}.part`;
  let bytes = 0;
  const limiter = new Transform({
    transform(chunk, _enc, done) {
      bytes += chunk.length;
      if (bytes > s.maxBytes) done(new HttpError(413, `That file is larger than ${limitMb} MB.`));
      else done(null, chunk);
    },
  });

  try {
    await pipeline(req, limiter, fs.createWriteStream(partial));
    if (bytes === 0) throw new HttpError(400, 'The uploaded file is empty.');
    fs.renameSync(partial, target);
  } catch (err) {
    fs.rmSync(partial, { force: true });
    throw err;
  }
  return { file: `${s.dir}/${name}`, url: `/media/${s.dir}/${name}` };
}
