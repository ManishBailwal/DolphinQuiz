import { h } from '../ui.js';
import { renderHome } from './home.js';
import { startRound } from './rounds.js';

const app = document.getElementById('app');

async function showHome() {
  document.body.dataset.view = 'home';
  try {
    await renderHome(app, { onStart: showRound });
  } catch (error) {
    showError(error, showHome);
  }
}

async function showRound({ track, category, settings }) {
  document.body.dataset.view = 'play';
  document.body.dataset.track = track;
  try {
    await startRound(app, { track, category, settings, onExit: showHome });
  } catch (error) {
    showError(error, showHome);
  }
}

function showError(error, retry) {
  document.body.dataset.view = 'home';
  app.replaceChildren(
    h(
      'div',
      { class: 'home' },
      h(
        'section',
        { class: 'panel problem' },
        h('h2', {}, 'Something went wrong'),
        h('p', {}, error.message),
        h('div', { class: 'actions' }, h('button', { class: 'btn is-primary', type: 'button', onClick: retry }, 'Back to home')),
      ),
    ),
  );
}

showHome();
