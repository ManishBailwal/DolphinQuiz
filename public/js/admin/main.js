
 // Admin panel: choose a group (Junior/Senior) and a round, then add, edit, reorder or delete its questions.

import { api } from '../api.js';
import { CATEGORIES, TRACKS } from '../meta.js';
import { confirmDialog, h, plural, toast } from '../ui.js';
import { openQuestionEditor, openSetEditor, renderSettings } from './editors.js';

const app = document.getElementById('app');

const state = { track: 'junior', tab: 'mcq', settings: null, summary: null };

// Keep the current view in the address (#senior/video) so a refresh stays where you were.
function readHash() {
  const [track, tab] = location.hash.slice(1).split('/');
  if (track in TRACKS) state.track = track;
  if (tab in CATEGORIES || tab === 'settings') state.tab = tab;
}

function go(next) {
  Object.assign(state, next);
  history.replaceState(null, '', `#${state.track}/${state.tab}`);
  render();
}

async function load() {
  [state.settings, state.summary] = await Promise.all([
    api.settings(),
    api.summary(),
  ]);
}

async function reload(message) {
  if (message) toast(message);
  await load();
  render();
}

/* ------------------------------------------------------------------ logout */

async function logoutAdmin() {
  const button = document.getElementById('logout-button');

  if (button) {
    button.disabled = true;
    button.textContent = 'Logging out…';
  }

  try {
    const response = await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error('Logout failed. Please try again.');
    }

    // Return to the login page after the server clears the session cookie.
    window.location.replace('/admin');
  } catch (error) {
    toast(error.message || 'Unable to log out. Please try again.');

    if (button) {
      button.disabled = false;
      button.textContent = 'Logout';
    }
  }
}

/* ------------------------------------------------------------------ layout */

function render() {
  app.replaceChildren(
    h(
      'div',
      { class: 'admin' },
      h(
        'header',
        { class: 'admin-head' },
        h('h1', {}, 'Question manager'),
        h('a', { class: 'btn', href: '/' }, 'Open quiz screen'),
        h(
          'button',
          {
            class: 'btn',
            id: 'logout-button',
            type: 'button',
            onClick: logoutAdmin,
            'aria-label': 'Log out of admin panel',
          },
          'Logout',
        ),
      ),
      h(
        'div',
        {
          class: 'group-switch',
          role: 'group',
          'aria-label': 'Group',
        },
        ...Object.entries(TRACKS).map(([id, info]) =>
          h(
            'button',
            {
              class: `group-btn group-${id}`,
              type: 'button',
              'aria-pressed': String(state.track === id),
              onClick: () => go({ track: id }),
            },
            info.label,
          ),
        ),
      ),
      h(
        'nav',
        { class: 'tabs', 'aria-label': 'Rounds' },
        ...Object.entries(CATEGORIES).map(([id, info]) =>
          tabButton(
            id,
            info.label,
            state.summary[state.track][id].count,
          ),
        ),
        tabButton('settings', 'Settings', null),
      ),
      h('main', { class: 'admin-main', id: 'main' }),
    ),
  );

  document.body.dataset.track = state.track;
  renderMain();
}

function tabButton(id, label, count) {
  return h(
    'button',
    {
      class: 'tab',
      type: 'button',
      'aria-current': state.tab === id ? 'page' : null,
      onClick: () => go({ tab: id }),
    },
    label,
    count === null
      ? null
      : h('span', { class: 'tab-count' }, String(count)),
  );
}

async function renderMain() {
  const main = document.getElementById('main');

  if (state.tab === 'settings') {
    main.replaceChildren(
      h('h2', { class: 'section-title' }, 'Settings'),
    );

    const holder = h('div', { class: 'settings-holder' });
    main.append(holder);

    renderSettings(holder, state.settings, (saved) => {
      state.settings = saved;
    });

    return;
  }

  const category = state.tab;
  const info = CATEGORIES[category];
  const trackLabel = TRACKS[state.track].label;

  const addButton = h(
    'button',
    {
      class: 'btn is-primary',
      type: 'button',
      onClick: () => (info.isSet ? addSet() : addQuestion()),
    },
    info.isSet ? `Add ${info.unit}` : 'Add question',
  );

  main.replaceChildren(
    h(
      'div',
      { class: 'toolbar' },
      h(
        'h2',
        { class: 'section-title' },
        `${trackLabel}: ${info.label}`,
      ),
      addButton,
    ),
    h('p', { class: 'round-note' }, roundNote(category)),
  );

  try {
    const items = info.isSet
      ? await api.sets(state.track, category)
      : await api.questions(state.track, category);

    // The view may have changed while the request was loading.
    if (document.getElementById('main') !== main) return;

    main.append(
      items.length === 0
        ? emptyState(info)
        : h(
            'ol',
            { class: 'items' },
            ...items.map((item, i) =>
              info.isSet
                ? setItem(item, i, items.length)
                : questionItem(item, i, items.length),
            ),
          ),
    );
  } catch (error) {
    main.append(
      h('p', { class: 'form-error' }, error.message),
    );
  }
}

function roundNote(category) {
  const s = state.settings;

  switch (category) {
    case 'mcq':
      return 'Each question has options and a timer. Add or remove options on any question.';

    case 'visual':
      return `An image with as many questions as you like (new ones start with ${plural(s.visual_question_count, 'question')}). The image stays on screen until the last question is done. Each question can have options or a typed answer.`;

    case 'video':
      return `A video with as many questions as you like (new ones start with ${plural(s.video_question_count, 'question')}). The video stays on screen and can be played or paused during the questions. Each question can have options or a typed answer.`;

    case 'rapid':
      return `Short questions without options. Every student gets ${plural(s.rapid_per_student, 'question')}, dealt out in order.`;

    case 'buzzer':
      return `An image with as many questions as you like (new ones start with ${plural(s.buzzer_question_count, 'question')}). Each question has its own marks, for example 50, 40, 30 and so on.`;

    default:
      return '';
  }
}

function emptyState(info) {
  return h(
    'div',
    { class: 'empty' },
    h(
      'p',
      {},
      info.isSet
        ? `No ${info.unit}s here yet.`
        : 'No questions here yet.',
    ),
    h(
      'p',
      { class: 'hint' },
      info.isSet
        ? `Use "Add ${info.unit}" to upload one and write its questions.`
        : 'Use "Add question" to write the first one.',
    ),
  );
}

/* ------------------------------------------------------------------- items */

function chip(text, tone) {
  return h(
    'span',
    { class: `chip-s${tone ? ` chip-${tone}` : ''}` },
    text,
  );
}

function actions(kind, item, index, total, {
  onEdit,
  deleteTitle,
  deleteBody,
}) {
  const move = async (dir) => {
    await api.move(kind, item.id, dir);
    await reload();
  };

  return h(
    'div',
    { class: 'item-actions' },

    h(
      'button',
      {
        class: 'btn btn-small',
        type: 'button',
        disabled: index === 0,
        'aria-label': 'Move up',
        onClick: () => move(-1),
      },
      'Up',
    ),

    h(
      'button',
      {
        class: 'btn btn-small',
        type: 'button',
        disabled: index === total - 1,
        'aria-label': 'Move down',
        onClick: () => move(1),
      },
      'Down',
    ),

    h(
      'button',
      {
        class: 'btn btn-small',
        type: 'button',
        onClick: onEdit,
      },
      'Edit',
    ),

    h(
      'button',
      {
        class: 'btn btn-small btn-delete',
        type: 'button',
        onClick: async () => {
          const ok = await confirmDialog({
            title: deleteTitle,
            body: deleteBody,
            confirmLabel: 'Delete',
            danger: true,
          });

          if (!ok) return;

          if (kind === 'set') {
            await api.deleteSet(item.id);
          } else {
            await api.deleteQuestion(item.id);
          }

          await reload('Deleted');
        },
      },
      'Delete',
    ),
  );
}

function questionSummary(q) {
  const correct = q.has_options
    ? q.options[q.correct_index]?.text
    : q.answer;

  return [
    q.has_options
      ? chip(plural(q.options.length, 'option'), 'options')
      : chip('Typed answer', 'typed'),

    chip(
      q.timer_seconds
        ? `${q.timer_seconds} s timer`
        : 'No timer',
    ),

    correct
      ? h('span', { class: 'item-answer' }, `Answer: ${correct}`)
      : null,
  ];
}

function questionItem(q, index, total) {
  return h(
    'li',
    { class: 'item' },

    h('span', { class: 'item-index' }, String(index + 1)),

    h(
      'div',
      { class: 'item-main' },
      h('p', { class: 'item-title' }, q.text),
      h(
        'div',
        { class: 'item-meta' },
        ...questionSummary(q),
      ),
    ),

    actions('question', q, index, total, {
      onEdit: () => addQuestion(q),
      deleteTitle: 'Delete this question?',
      deleteBody: q.text,
    }),
  );
}

function setItem(set, index, total) {
  const isVideo = set.category === 'video';

  const thumb = isVideo
    ? h('video', {
        class: 'thumb',
        src: set.media_url,
        preload: 'metadata',
        muted: true,
      })
    : h('img', {
        class: 'thumb',
        src: set.media_url,
        alt: '',
        loading: 'lazy',
      });

  const marks = set.category === 'buzzer'
    ? `Marks: ${set.questions.map((q) => q.marks).join(', ')}`
    : null;

  return h(
    'li',
    { class: 'item item-set' },

    h('span', { class: 'item-index' }, String(index + 1)),

    thumb,

    h(
      'div',
      { class: 'item-main' },

      h('p', { class: 'item-title' }, set.title),

      h(
        'div',
        { class: 'item-meta' },

        chip(plural(set.questions.length, 'question')),

        chip(
          `${set.questions.filter((q) => q.has_options).length} with options`,
          'options',
        ),

        marks
          ? h('span', { class: 'item-answer' }, marks)
          : null,

        h('span', { class: 'item-file' }, set.media_file),
      ),
    ),

    actions('set', set, index, total, {
      onEdit: () => addSet(set),
      deleteTitle: `Delete this ${CATEGORIES[set.category].unit} and its questions?`,
      deleteBody: `${set.title} (${plural(set.questions.length, 'question')}). The file stays in the media folder.`,
    }),
  );
}

function addQuestion(question = null) {
  openQuestionEditor({
    category: state.tab,
    track: state.track,
    settings: state.settings,
    question,
    onSaved: reload,
  });
}

function addSet(set = null) {
  openSetEditor({
    category: state.tab,
    track: state.track,
    settings: state.settings,
    set,
    onSaved: reload,
  });
}

/* -------------------------------------------------------------------- start */

// Editing the address by hand (or following a #senior/video link) switches the view too.
window.addEventListener('hashchange', () => {
  readHash();
  if (state.settings) render();
});

readHash();

load()
  .then(render)
  .catch((error) => {
    app.replaceChildren(
      h(
        'p',
        { class: 'form-error' },
        `Could not load the admin panel: ${error.message}`,
      ),
    );
  });
