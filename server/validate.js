// Input checking. Every function either returns clean data or throws an HttpError(400)
// with a message the admin panel can show as-is.

import { HttpError } from './http.js';
import { MAX_OPTIONS, MIN_OPTIONS, SETTINGS_SPEC } from './config.js';

export function fail(message) {
  throw new HttpError(400, message);
}

const text = (v) => (typeof v === 'string' ? v.trim() : '');

function wholeNumber(value, min, max, label) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (!Number.isInteger(n) || n < min || n > max) {
    fail(`${label} must be a whole number from ${min} to ${max}.`);
  }
  return n;
}

// `prefix` is something like "Question 2: " so set editors can tell which question is wrong.
export function normalizeQuestion(raw, { category, prefix = '' }) {
  const input = raw ?? {};
  const question = text(input.text);
  if (!question) fail(`${prefix}Enter the question text.`);
  if (question.length > 1000) fail(`${prefix}The question text is too long (1000 characters max).`);

  // MCQs always have options, Rapid Fire never does. Other rounds ask per question.
  const hasOptions = category === 'mcq' ? true : category === 'rapid' ? false : Boolean(input.has_options);

  const timer = wholeNumber(input.timer_seconds ?? 0, 0, 600, `${prefix}Timer`);
  const marks = category === 'buzzer' ? wholeNumber(input.marks ?? 0, 0, 1000, `${prefix}Marks`) : 0;

  if (hasOptions) {
    const options = Array.isArray(input.options) ? input.options.map((o) => text(typeof o === 'string' ? o : o?.text)) : [];
    if (options.length < MIN_OPTIONS || options.length > MAX_OPTIONS) {
      fail(`${prefix}Use between ${MIN_OPTIONS} and ${MAX_OPTIONS} options.`);
    }
    if (options.some((o) => !o)) fail(`${prefix}Fill in every option, or remove the empty ones.`);
    const correct = Number(input.correct_index);
    if (!Number.isInteger(correct) || correct < 0 || correct >= options.length) {
      fail(`${prefix}Mark which option is correct.`);
    }
    return { text: question, has_options: true, answer: '', options, correct_index: correct, timer_seconds: timer, marks };
  }

  const answer = text(input.answer);
  if (!answer) fail(`${prefix}Enter the answer that will be shown after the question.`);
  if (answer.length > 500) fail(`${prefix}The answer is too long (500 characters max).`);
  return { text: question, has_options: false, answer, options: [], correct_index: -1, timer_seconds: timer, marks };
}

export function normalizeSettings(input) {
  const out = {};
  for (const [key, spec] of Object.entries(SETTINGS_SPEC)) {
    if (!(key in (input ?? {}))) continue;
    const value = input[key];
    switch (spec.type) {
      case 'text': {
        const t = text(value);
        if (!t) fail(`${spec.label} cannot be empty.`);
        out[key] = t.slice(0, spec.max ?? 200);
        break;
      }
      case 'int':
        out[key] = wholeNumber(value, spec.min, spec.max, spec.label);
        break;
      case 'bool':
        out[key] = value === true || value === 'true' || value === 1 || value === '1';
        break;
      case 'intlist': {
        const parts = Array.isArray(value) ? value : String(value ?? '').split(',');
        const list = parts.map((p) => String(p).trim()).filter((p) => p !== '').map(Number);
        if (list.length < 1 || list.length > 12 || list.some((n) => !Number.isInteger(n) || n < 0 || n > 1000)) {
          fail(`${spec.label} must be 1 to 12 whole numbers separated by commas, for example 50, 40, 30.`);
        }
        out[key] = list;
        break;
      }
    }
  }
  return out;
}
