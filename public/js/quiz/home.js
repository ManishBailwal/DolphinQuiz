// Home screen. The operator picks Junior or Senior, then a round, then presses Start.
// Start stays disabled until both are chosen. When a round ends the app returns here.

import { api } from '../api.js';
import { CATEGORIES, TRACKS } from '../meta.js';
import { h, plural } from '../ui.js';

export async function renderHome(app, { onStart }) {
  const [settings, summary] = await Promise.all([api.settings(), api.summary()]);
  let track = null;
  let category = null;

  const draw = () => {
    document.body.dataset.track = track ?? '';
    app.replaceChildren(
      h(
        'div',
        { class: 'home' },
        h(
          'header',
          { class: 'home-head' },
          h('h1', { class: 'home-title' }, settings.event_title),
          h('a', { class: 'btn', href: '/admin' }, 'Admin panel'),
        ),
        h(
          'section',
          { class: 'tracks', 'aria-label': 'Group', 'data-chosen': track ?? '' },
          ...Object.entries(TRACKS).map(([id, info]) => trackButton(id, info)),
        ),
        h(
          'section',
          { class: 'cats', 'aria-label': 'Round' },
          ...Object.entries(CATEGORIES).map(([id, info]) => categoryButton(id, info)),
        ),
        h(
          'footer',
          { class: 'home-foot' },
          h('p', { class: 'home-hint' }, hint()),
          h(
            'button',
            {
              class: 'btn-start',
              type: 'button',
              disabled: !(track && category),
              onClick: () => onStart({ track, category, settings }),
            },
            'Start',
          ),
        ),
      ),
    );
  };

  const hint = () => {
    if (!track) return 'Choose Junior or Senior.';
    if (!category) return `Now choose a round for ${TRACKS[track].label}.`;
    return `Ready: ${TRACKS[track].label}, ${CATEGORIES[category].label}.`;
  };

  const trackButton = (id, info) => {
    const readyRounds = Object.values(summary[id]).filter((s) => s.ready).length;
    return h(
      'button',
      {
        class: `track track-${id}`,
        type: 'button',
        'aria-pressed': String(track === id),
        onClick: () => {
          if (track !== id) category = null;
          track = id;
          draw();
        },
      },
      h('span', { class: 'track-name' }, info.label),
      h('span', { class: 'track-note' }, `${readyRounds} of ${Object.keys(CATEGORIES).length} rounds have questions`),
    );
  };

  const categoryButton = (id, info) => {
    const state = track ? summary[track][id] : null;
    const usable = Boolean(state?.ready);
    return h(
      'button',
      {
        class: 'cat',
        type: 'button',
        disabled: !usable,
        'aria-pressed': String(category === id),
        onClick: () => {
          category = id;
          draw();
        },
      },
      h('span', { class: 'cat-name' }, info.label),
      h('span', { class: 'cat-blurb' }, info.blurb),
      h('span', { class: 'cat-count' }, track ? countText(id, state, settings) : 'Choose a group first'),
    );
  };

  draw();
}

function countText(id, state, settings) {
  if (!state || state.count === 0) return 'Nothing added yet';
  if (id === 'mcq') return plural(state.count, 'question');
  if (id === 'visual' || id === 'buzzer') return plural(state.count, 'image');
  if (id === 'video') return plural(state.count, 'video');
  if (id === 'rapid') {
    return state.students > 0
      ? `${plural(state.students, 'student')} (${plural(state.count, 'question')})`
      : `Needs ${settings.rapid_per_student} questions per student`;
  }
  return '';
}
