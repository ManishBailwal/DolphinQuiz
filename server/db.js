// All database access lives here. Uses the SQLite that ships inside Node (node:sqlite),
// so there is nothing to compile or install.

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { HttpError } from './http.js';
import { CATEGORIES, SET_CATEGORIES, SET_MEDIA_KIND, SETTINGS_SPEC, TRACKS } from './config.js';
import { fail, normalizeQuestion, normalizeSettings } from './validate.js';
import { checkMediaFile } from './media.js';

export const DB_PATH = path.resolve(process.env.DB_FILE ?? 'data/quiz.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL              -- JSON
  );

  -- A "set" is one image or video that several questions share (Visual, Video, Buzzer rounds).
  CREATE TABLE IF NOT EXISTS sets (
    id         INTEGER PRIMARY KEY,
    track      TEXT NOT NULL CHECK (track IN ('junior', 'senior')),
    category   TEXT NOT NULL CHECK (category IN ('visual', 'video', 'buzzer')),
    title      TEXT NOT NULL,
    media_file TEXT NOT NULL,        -- relative to the media folder, e.g. images/map.png
    position   INTEGER NOT NULL DEFAULT 0
  );

  -- Every question in every round. set_id is NULL for MCQ and Rapid Fire.
  CREATE TABLE IF NOT EXISTS questions (
    id            INTEGER PRIMARY KEY,
    track         TEXT NOT NULL CHECK (track IN ('junior', 'senior')),
    category      TEXT NOT NULL CHECK (category IN ('mcq', 'visual', 'video', 'rapid', 'buzzer')),
    set_id        INTEGER REFERENCES sets(id) ON DELETE CASCADE,
    position      INTEGER NOT NULL DEFAULT 0,
    text          TEXT NOT NULL,
    has_options   INTEGER NOT NULL DEFAULT 0,
    answer        TEXT NOT NULL DEFAULT '',   -- shown for questions without options
    marks         INTEGER NOT NULL DEFAULT 0, -- Buzzer Round only
    timer_seconds INTEGER NOT NULL DEFAULT 0  -- 0 means no timer
  );

  CREATE TABLE IF NOT EXISTS options (
    id          INTEGER PRIMARY KEY,
    question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    position    INTEGER NOT NULL,
    text        TEXT NOT NULL,
    is_correct  INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_questions_scope ON questions (track, category, set_id, position);
  CREATE INDEX IF NOT EXISTS idx_options_question ON options (question_id, position);
  CREATE INDEX IF NOT EXISTS idx_sets_scope ON sets (track, category, position);
`);

function tx(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function checkTrack(track) {
  if (!TRACKS.includes(track)) fail('track must be "junior" or "senior".');
  return track;
}

function checkCategory(category) {
  if (!CATEGORIES.includes(category)) fail(`category must be one of: ${CATEGORIES.join(', ')}.`);
  return category;
}

/* ---------------------------------------------------------------- settings */

export function getSettings() {
  const stored = {};
  for (const row of db.prepare('SELECT key, value FROM settings').all()) stored[row.key] = JSON.parse(row.value);
  const out = {};
  for (const [key, spec] of Object.entries(SETTINGS_SPEC)) out[key] = key in stored ? stored[key] : spec.default;
  return out;
}

export function saveSettings(patch) {
  const clean = normalizeSettings(patch);
  const upsert = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  );
  tx(() => {
    for (const [key, value] of Object.entries(clean)) upsert.run(key, JSON.stringify(value));
  });
  return getSettings();
}

/* --------------------------------------------------------------- questions */

// Turns raw question rows into API objects, loading their options in one extra query.
function withOptions(rows) {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const optionRows = db
    .prepare(
      `SELECT id, question_id, text, is_correct FROM options
       WHERE question_id IN (${ids.map(() => '?').join(',')}) ORDER BY position, id`,
    )
    .all(...ids);

  const byQuestion = new Map();
  for (const o of optionRows) {
    if (!byQuestion.has(o.question_id)) byQuestion.set(o.question_id, []);
    byQuestion.get(o.question_id).push({ id: o.id, text: o.text, is_correct: Boolean(o.is_correct) });
  }

  return rows.map((r) => {
    const options = byQuestion.get(r.id) ?? [];
    return {
      id: r.id,
      track: r.track,
      category: r.category,
      set_id: r.set_id,
      position: r.position,
      text: r.text,
      has_options: Boolean(r.has_options),
      answer: r.answer,
      marks: r.marks,
      timer_seconds: r.timer_seconds,
      options,
      correct_index: options.findIndex((o) => o.is_correct),
    };
  });
}

function insertQuestion({ track, category, setId, position, q }) {
  const result = db
    .prepare(
      `INSERT INTO questions (track, category, set_id, position, text, has_options, answer, marks, timer_seconds)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(track, category, setId, position, q.text, q.has_options ? 1 : 0, q.answer, q.marks, q.timer_seconds);
  const id = Number(result.lastInsertRowid);
  writeOptions(id, q);
  return id;
}

function writeOptions(questionId, q) {
  const insert = db.prepare('INSERT INTO options (question_id, position, text, is_correct) VALUES (?, ?, ?, ?)');
  q.options.forEach((optionText, i) => insert.run(questionId, i, optionText, i === q.correct_index ? 1 : 0));
}

function nextPosition(table, track, category) {
  const extra = table === 'questions' ? ' AND set_id IS NULL' : '';
  return db
    .prepare(`SELECT COALESCE(MAX(position), -1) + 1 AS n FROM ${table} WHERE track = ? AND category = ?${extra}`)
    .get(track, category).n;
}

export function listQuestions({ track, category }) {
  checkTrack(track);
  checkCategory(category);
  const rows = db
    .prepare('SELECT * FROM questions WHERE track = ? AND category = ? AND set_id IS NULL ORDER BY position, id')
    .all(track, category);
  return withOptions(rows);
}

function getQuestion(id) {
  const row = db.prepare('SELECT * FROM questions WHERE id = ?').get(id);
  if (!row) throw new HttpError(404, 'Question not found.');
  return withOptions([row])[0];
}

export function createQuestion(input) {
  const track = checkTrack(input?.track);
  const category = checkCategory(input?.category);
  if (SET_CATEGORIES.includes(category)) fail('Questions for this round are created together with their image or video.');
  const q = normalizeQuestion(input, { category });
  return tx(() => {
    const id = insertQuestion({ track, category, setId: null, position: nextPosition('questions', track, category), q });
    return getQuestion(id);
  });
}

export function updateQuestion(id, input) {
  const row = db.prepare('SELECT * FROM questions WHERE id = ?').get(id);
  if (!row || row.set_id !== null) throw new HttpError(404, 'Question not found.');
  const q = normalizeQuestion(input, { category: row.category });
  return tx(() => {
    db.prepare(
      'UPDATE questions SET text = ?, has_options = ?, answer = ?, marks = ?, timer_seconds = ? WHERE id = ?',
    ).run(q.text, q.has_options ? 1 : 0, q.answer, q.marks, q.timer_seconds, id);
    db.prepare('DELETE FROM options WHERE question_id = ?').run(id);
    writeOptions(id, q);
    return getQuestion(id);
  });
}

export function deleteQuestion(id) {
  const result = db.prepare('DELETE FROM questions WHERE id = ? AND set_id IS NULL').run(id);
  if (result.changes === 0) throw new HttpError(404, 'Question not found.');
}

/* -------------------------------------------------------------------- sets */

function hydrateSet(row) {
  const questions = withOptions(
    db.prepare('SELECT * FROM questions WHERE set_id = ? ORDER BY position, id').all(row.id),
  );
  return {
    id: row.id,
    track: row.track,
    category: row.category,
    title: row.title,
    media_file: row.media_file,
    media_url: `/media/${row.media_file}`,
    position: row.position,
    questions,
  };
}

export function listSets({ track, category }) {
  checkTrack(track);
  checkCategory(category);
  if (!SET_CATEGORIES.includes(category)) fail('This round does not use image or video sets.');
  return db
    .prepare('SELECT * FROM sets WHERE track = ? AND category = ? ORDER BY position, id')
    .all(track, category)
    .map(hydrateSet);
}

function getSet(id) {
  const row = db.prepare('SELECT * FROM sets WHERE id = ?').get(id);
  if (!row) throw new HttpError(404, 'Set not found.');
  return hydrateSet(row);
}

function cleanSet(input, category) {
  const media = checkMediaFile(SET_MEDIA_KIND[category], input?.media_file);
  const questions = Array.isArray(input?.questions) ? input.questions : [];
  if (questions.length < 1 || questions.length > 12) fail('A set needs between 1 and 12 questions.');
  const title = typeof input?.title === 'string' ? input.title.trim().slice(0, 120) : '';
  const cleanQuestions = questions.map((raw, i) => normalizeQuestion(raw, { category, prefix: `Question ${i + 1}: ` }));
  return { media, title, cleanQuestions };
}

export function createSet(input) {
  const track = checkTrack(input?.track);
  const category = checkCategory(input?.category);
  if (!SET_CATEGORIES.includes(category)) fail('This round does not use image or video sets.');
  const { media, title, cleanQuestions } = cleanSet(input, category);
  return tx(() => {
    const position = nextPosition('sets', track, category);
    const result = db
      .prepare('INSERT INTO sets (track, category, title, media_file, position) VALUES (?, ?, ?, ?, ?)')
      .run(track, category, title || media.split('/')[1], media, position);
    const setId = Number(result.lastInsertRowid);
    cleanQuestions.forEach((q, i) => insertQuestion({ track, category, setId, position: i, q }));
    return getSet(setId);
  });
}

export function updateSet(id, input) {
  const row = db.prepare('SELECT * FROM sets WHERE id = ?').get(id);
  if (!row) throw new HttpError(404, 'Set not found.');
  const { media, title, cleanQuestions } = cleanSet(input, row.category);
  return tx(() => {
    db.prepare('UPDATE sets SET title = ?, media_file = ? WHERE id = ?').run(title || media.split('/')[1], media, id);
    db.prepare('DELETE FROM questions WHERE set_id = ?').run(id); // options go with them (ON DELETE CASCADE)
    cleanQuestions.forEach((q, i) =>
      insertQuestion({ track: row.track, category: row.category, setId: id, position: i, q }),
    );
    return getSet(id);
  });
}

export function deleteSet(id) {
  const result = db.prepare('DELETE FROM sets WHERE id = ?').run(id);
  if (result.changes === 0) throw new HttpError(404, 'Set not found.');
}

/* ------------------------------------------------------------ order + counts */

// Swap an item with its neighbour. dir is -1 (up) or 1 (down).
export function moveItem(kind, id, dir) {
  if (dir !== -1 && dir !== 1) fail('dir must be -1 or 1.');
  if (kind !== 'set' && kind !== 'question') fail('kind must be "set" or "question".');
  const table = kind === 'set' ? 'sets' : 'questions';
  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
  if (!row || (kind === 'question' && row.set_id !== null)) throw new HttpError(404, 'Item not found.');

  const scope = kind === 'set' ? '' : ' AND set_id IS NULL';
  const ids = db
    .prepare(`SELECT id FROM ${table} WHERE track = ? AND category = ?${scope} ORDER BY position, id`)
    .all(row.track, row.category)
    .map((r) => r.id);

  const from = ids.indexOf(id);
  const to = from + dir;
  if (to < 0 || to >= ids.length) return;
  [ids[from], ids[to]] = [ids[to], ids[from]];

  const update = db.prepare(`UPDATE ${table} SET position = ? WHERE id = ?`);
  tx(() => ids.forEach((itemId, position) => update.run(position, itemId)));
}

// What the home screen needs: how much is ready in each round.
export function getSummary() {
  const settings = getSettings();
  const setCount = db.prepare(
    `SELECT COUNT(*) AS n FROM sets s
     WHERE s.track = ? AND s.category = ? AND EXISTS (SELECT 1 FROM questions q WHERE q.set_id = s.id)`,
  );
  const questionCount = db.prepare(
    'SELECT COUNT(*) AS n FROM questions WHERE track = ? AND category = ? AND set_id IS NULL',
  );

  const out = {};
  for (const track of TRACKS) {
    out[track] = {};
    for (const category of CATEGORIES) {
      if (SET_CATEGORIES.includes(category)) {
        const count = setCount.get(track, category).n;
        out[track][category] = { count, ready: count > 0 };
      } else {
        const count = questionCount.get(track, category).n;
        if (category === 'rapid') {
          const students = Math.floor(count / settings.rapid_per_student);
          out[track][category] = { count, students, ready: students > 0 };
        } else {
          out[track][category] = { count, ready: count > 0 };
        }
      }
    }
  }
  return out;
}

export function isEmpty() {
  const q = db.prepare('SELECT COUNT(*) AS n FROM questions').get().n;
  const s = db.prepare('SELECT COUNT(*) AS n FROM sets').get().n;
  return q === 0 && s === 0;
}
