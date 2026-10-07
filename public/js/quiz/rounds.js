// Plays one round from start to finish. Each round is a plain async function that shows a
// screen, waits for the operator to move on (await), then shows the next one.

import { api } from '../api.js';
import { CATEGORIES, TRACKS } from '../meta.js';
import { confirmDialog, h, isInteractive, onKey, plural } from '../ui.js';
import { createQuestionPanel } from './panel.js';

export async function startRound(app, { track, category, settings, onExit }) {
  const isSet = CATEGORIES[category].isSet;
  const data = isSet ? (await api.sets(track, category)).filter((s) => s.questions.length) : await api.questions(track, category);
  if (data.length === 0) throw new Error('This round has no questions yet. Add some in the admin panel.');

  const stage = createStage(app, { track, category, onExit });

  if (category === 'mcq') await runMcq(stage, data, settings);
  else if (category === 'rapid') await runRapid(stage, data, settings);
  else await runSets(stage, data, category, settings);

  showComplete(stage, onExit);
}

/* ------------------------------------------------------------------- stage */
// The frame around every round: a slim top bar and the content area.

function createStage(app, { track, category, onExit }) {
  const cleanups = [];
  const progress = h('span', { class: 'stage-progress' });
  const content = h('main', { class: 'stage-content' });

  const destroy = () => cleanups.splice(0).forEach((fn) => fn());

  const leave = async () => {
    const ok = await confirmDialog({
      title: 'Leave this round?',
      body: 'You will go back to the home screen. This round starts from the beginning next time.',
      confirmLabel: 'Leave round',
      cancelLabel: 'Stay',
    });
    if (ok) {
      destroy();
      onExit();
    }
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  };

  const bar = h(
    'header',
    { class: 'stage-bar' },
    h('button', { class: 'btn btn-ghost', type: 'button', onClick: leave }, 'Home'),
    h('span', { class: 'chip' }, TRACKS[track].label),
    h('h1', { class: 'stage-title' }, CATEGORIES[category].label),
    progress,
    h('button', { class: 'btn btn-ghost', type: 'button', onClick: toggleFullscreen }, 'Fullscreen (F)'),
  );

  cleanups.push(
    onKey((event) => {
      if (event.key.toLowerCase() === 'f' && !isInteractive(event)) toggleFullscreen();
    }),
  );

  const el = h('div', { class: 'stage' }, bar, content);
  app.replaceChildren(el);

  return {
    content,
    setProgress: (text) => (progress.textContent = text),
    onDestroy: (fn) => cleanups.push(fn),
    destroy,
  };
}

// Shows a question and resolves when the operator presses Next.
function ask(stage, mount, options) {
  return new Promise((resolve) => {
    const panel = createQuestionPanel({
      ...options,
      onNext: () => {
        panel.destroy();
        resolve();
      },
    });
    stage.onDestroy(panel.destroy);
    mount.replaceChildren(panel.el);
  });
}

function showComplete(stage, onExit) {
  stage.setProgress('');
  stage.content.replaceChildren(
    h(
      'section',
      { class: 'panel complete' },
      h('h2', { class: 'complete-title' }, 'Round complete'),
      h('p', { class: 'complete-note' }, 'Go back to the home screen to choose the next round.'),
      h(
        'div',
        { class: 'actions' },
        h(
          'button',
          {
            class: 'btn is-primary btn-lg',
            type: 'button',
            onClick: () => {
              stage.destroy();
              onExit();
            },
          },
          'Back to home',
        ),
      ),
    ),
  );
}

/* --------------------------------------------------------------------- MCQ */

async function runMcq(stage, questions, settings) {
  for (const [i, question] of questions.entries()) {
    stage.setProgress(`Question ${i + 1} of ${questions.length}`);
    await ask(stage, stage.content, {
      question,
      nextLabel: i === questions.length - 1 ? 'Finish round' : 'Next question',
    });
  }
}

/* ------------------------------------------------------------- Rapid Fire */
// Questions are dealt out in turns: student 1 gets the first N, student 2 the next N, and so on.

async function runRapid(stage, questions, settings) {
  const perStudent = settings.rapid_per_student;
  const students = Math.floor(questions.length / perStudent);

  for (let s = 0; s < students; s++) {
    stage.setProgress(`Student ${s + 1} of ${students}`);
    const name = await studentIntro(stage, { number: s + 1, perStudent });
    const who = name || `Student ${s + 1}`;

    for (let k = 0; k < perStudent; k++) {
      const isLastQuestion = k === perStudent - 1;
      await ask(stage, stage.content, {
        question: questions[s * perStudent + k],
          head: h('div', { class: 'panel-head' }, h('span', {}, who), h('span', {}, `Question ${k + 1} of ${perStudent}`)),
        nextLabel: !isLastQuestion ? 'Next question' : s === students - 1 ? 'Finish round' : 'Next student',
      });
    }
  }
}

function studentIntro(stage, { number, perStudent }) {
  return new Promise((resolve) => {
    let stopKeys = () => {};
    const go = () => {
      stopKeys();
      resolve(input.value.trim());
    };

    const input = h('input', {
      class: 'name-input',
      type: 'text',
      placeholder: 'Student name (optional)',
      maxlength: 60,
      'aria-label': 'Student name',
      onKeydown: (event) => {
        if (event.key === 'Enter') go();
      },
    });

    stopKeys = onKey((event) => {
      if (event.code === 'Space' && !isInteractive(event)) {
        event.preventDefault();
        go();
      }
    });
    stage.onDestroy(() => stopKeys());

    stage.content.replaceChildren(
      h(
        'section',
        { class: 'panel intro-card' },
        h('h2', { class: 'intro-title' }, `Student ${number}`),
        h('p', { class: 'intro-sub' }, plural(perStudent, 'question')),
        input,
        h('div', { class: 'actions' }, h('button', { class: 'btn is-primary btn-lg', type: 'button', onClick: go }, 'Start turn')),
      ),
    );
    input.focus();
  });
}

/* ----------------------------------------------- Visual, Video and Buzzer */
// A set is one image or video with several questions. The media stays on screen for all of them.

async function runSets(stage, sets, category, settings) {
  const unit = CATEGORIES[category].unit;
  for (const [i, set] of sets.entries()) {
    stage.setProgress(`${unit === 'video' ? 'Video' : 'Image'} ${i + 1} of ${sets.length}`);
    await runSet(stage, set, { category, settings, isLastSet: i === sets.length - 1 });
  }
}

async function runSet(stage, set, { category, settings, isLastSet }) {
  const isVideo = category === 'video';

  // Built once per set and never rebuilt, so a playing video is not interrupted when the questions change.
  const media = isVideo
    ? h('video', { src: set.media_url, controls: true, playsInline: true, preload: 'auto' })
    : h('img', { src: set.media_url, alt: set.title });
  const toolbar = h('div', { class: 'media-toolbar' });
  const qa = h('div', { class: 'qa-pane' });
  const split = h(
    'div',
    { class: 'split is-intro' },
    h('section', { class: 'media-pane' }, h('div', { class: 'media-frame' }, media), toolbar),
    qa,
  );
  stage.content.replaceChildren(split);

  let playButton = null;
  if (isVideo) {
    playButton = h(
      'button',
      { class: 'btn', type: 'button', onClick: () => (media.paused || media.ended ? media.play() : media.pause()) },
      'Play',
    );
    const sync = () => {
      playButton.textContent = media.ended ? 'Replay' : media.paused ? 'Play' : 'Pause';
    };
    for (const name of ['play', 'pause', 'ended', 'loadedmetadata']) media.addEventListener(name, sync);
    stage.onDestroy(() => media.pause());
    stage.onDestroy(
      onKey((event) => {
        if (event.key.toLowerCase() === 'p' && !isInteractive(event)) playButton.click();
      }),
    );
    media.play().catch(() => {}); // starts by itself; the button covers browsers that refuse
  }

  // 1. Let everyone look at the image or watch the video before any question appears.
  await new Promise((resolve) => {
    let stopKeys = () => {};
    const go = () => {
      stopKeys();
      resolve();
    };
    stopKeys = onKey((event) => {
      if (event.code === 'Space' && !isInteractive(event)) {
        event.preventDefault();
        go();
      }
    });
    stage.onDestroy(() => stopKeys());
    toolbar.replaceChildren(
      ...(playButton ? [playButton] : []),
      h('button', { class: 'btn is-primary btn-lg', type: 'button', onClick: go }, 'Show questions'),
    );
  });

  // 2. Move the media to the left and ask the questions on the right.
  split.classList.replace('is-intro', 'is-asking');
  toolbar.replaceChildren(...(playButton ? [playButton] : []));

  const count = set.questions.length;
  for (const [i, question] of set.questions.entries()) {
    const isLast = i === count - 1;
    await ask(stage, qa, {
      question,
      head:
        category === 'buzzer'
          ? buzzerHead(set.questions, i)
          : h('div', { class: 'panel-head' }, h('span', {}, `Question ${i + 1} of ${count}`)),
      nextLabel: !isLast ? 'Next question' : isLastSet ? 'Finish round' : isVideo ? 'Next video' : 'Next image',
    });
  }

  if (isVideo) media.pause();
}

// The Buzzer Round shows the question number and its marks very large so the operator can call it out.
function buzzerHead(questions, index) {
  const current = questions[index];
  return h(
    'div',
    { class: 'buzz-head' },
    h(
      'ol',
      { class: 'tracker', 'aria-label': 'Questions in this round' },
      questions.map((q, k) =>
        h('li', { class: k < index ? 'is-done' : '', 'aria-current': k === index ? 'step' : null }, String(k + 1), h('small', {}, String(q.marks))),
      ),
    ),
    h(
      'div',
      { class: 'buzz-now' },
      h('div', { class: 'q-badge', 'aria-label': `Question ${index + 1}` }, `Q${index + 1}`),
      h('div', { class: 'marks' }, h('b', {}, String(current.marks)), h('span', {}, current.marks === 1 ? 'mark' : 'marks')),
    ),
  );
}
