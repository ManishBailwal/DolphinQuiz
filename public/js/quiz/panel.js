// One question on screen. Every round uses this same panel.
//
//   Options question:  click the option the student chose -> Submit answer -> Correct / Not quite.
//   Typed question:    Show answer.
//   Timer:             Starts the moment the question appears. The operator can pause or resume it.
//                       If it runs out the correct answer is shown automatically.

import { h, fmtClock, isInteractive, onKey } from '../ui.js';

const LETTERS = 'ABCDEFGH';

export function createQuestionPanel({ question, head = null, nextLabel = 'Next question', onNext, autoStart = true }) {
  const hasTimer = question.timer_seconds > 0;
  const total = question.timer_seconds * 1000;

  let phase = 'ready'; // ready -> running <-> paused -> revealed
  let selected = null;
  let remaining = total;
  let deadline = 0;
  let ticker = null;
  let primary = null;

  /* ------------------------------------------------------------ elements */

  const timerNum = h('span', { class: 'timer-num' }, fmtClock(total));
  const timerFill = h('span');
  const timerEl = hasTimer ? h('div', { class: 'timer' }, timerNum, h('div', { class: 'timer-bar' }, timerFill)) : null;

  const optionEls = question.has_options
    ? question.options.map((option, i) =>
        h(
          'button',
          { class: 'opt', type: 'button', 'aria-pressed': 'false', onClick: () => choose(i) },
          h('span', { class: 'opt-letter' }, LETTERS[i]),
          h('span', { class: 'opt-text' }, option.text),
          h('span', { class: 'opt-mark', 'aria-hidden': 'true' }),
        ),
      )
    : [];
  const optionsEl = question.has_options
    ? h('div', { class: 'options', role: 'group', 'aria-label': 'Answer options' }, ...optionEls)
    : null;

  const verdictEl = h('div', { class: 'verdict', role: 'status', hidden: true });
  const answerEl = question.has_options
    ? null
    : h('div', { class: 'answer', hidden: true }, h('span', { class: 'answer-label' }, 'Answer'), h('span', { class: 'answer-text' }, question.answer));

  const btnStart = h('button', { class: 'btn', type: 'button', onClick: () => start() }, 'Start timer');
  const btnPause = h('button', { class: 'btn', type: 'button', onClick: () => togglePause() }, 'Pause');
  const btnSubmit = h('button', { class: 'btn', type: 'button', onClick: () => reveal() }, 'Submit answer');
  const btnShow = h('button', { class: 'btn', type: 'button', onClick: () => reveal() }, 'Show answer');
  const btnNext = h('button', { class: 'btn', type: 'button', onClick: () => onNext?.() }, nextLabel);

  const el = h(
    'section',
    { class: 'panel', 'data-phase': 'ready' },
    head,
    h('h2', { class: 'q-text' }, question.text),
    timerEl,
    optionsEl,
    answerEl,
    verdictEl,
    h('div', { class: 'actions' }, btnStart, btnPause, btnSubmit, btnShow, btnNext),
  );

  /* -------------------------------------------------------------- actions */

  function choose(index) {
    if (phase === 'revealed') return;
    selected = index;
    optionEls.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
    refresh();
  }

  function start() {
    if (hasTimer && phase === 'ready') run();
  }

  function run() {
    deadline = performance.now() + remaining;
    phase = 'running';
    clearInterval(ticker);
    ticker = setInterval(tick, 100);
    tick();
    refresh();
  }

  function togglePause() {
    if (phase === 'running') {
      remaining = Math.max(0, deadline - performance.now());
      clearInterval(ticker);
      phase = 'paused';
      refresh();
    } else if (phase === 'paused') {
      run();
    }
  }

  function tick() {
    const left = Math.max(0, deadline - performance.now());
    timerNum.textContent = fmtClock(left);
    timerFill.style.transform = `scaleX(${left / total})`;
    timerEl.classList.toggle('urgent', left > 0 && left <= 5000);
    if (left <= 0) reveal({ timedOut: true });
  }

  function reveal({ timedOut = false } = {}) {
    if (phase === 'revealed') return;
    clearInterval(ticker);
    phase = 'revealed';

    if (hasTimer && timedOut) {
      timerNum.textContent = '0';
      timerFill.style.transform = 'scaleX(0)';
      timerEl.classList.remove('urgent');
    }

    if (question.has_options) {
      const correct = question.correct_index;
      optionEls.forEach((button, i) => {
        const wrong = !timedOut && i === selected && i !== correct;
        button.setAttribute('aria-pressed', 'false');
        button.classList.toggle('is-correct', i === correct);
        button.classList.toggle('is-wrong', wrong);
        button.querySelector('.opt-mark').textContent = i === correct ? '✓' : wrong ? '✗' : '';
      });
      if (timedOut) showVerdict('is-timeout', "Time's up");
      else if (selected === correct) showVerdict('is-correct', 'Correct');
      else showVerdict('is-wrong', 'Not quite');
    } else {
      answerEl.hidden = false;
      if (timedOut) showVerdict('is-timeout', "Time's up");
    }
    refresh();
  }

  function showVerdict(kind, message) {
    verdictEl.className = `verdict ${kind}`;
    verdictEl.textContent = message;
    verdictEl.hidden = false;
  }

  // Shows only the buttons that make sense right now, and marks the one Space will press.
  function refresh() {
    el.dataset.phase = phase;
    const revealed = phase === 'revealed';

    btnStart.hidden = !(hasTimer && phase === 'ready');
    btnPause.hidden = !(hasTimer && (phase === 'running' || phase === 'paused'));
    btnPause.textContent = phase === 'paused' ? 'Resume' : 'Pause';
    btnSubmit.hidden = !question.has_options || revealed;
    btnSubmit.disabled = selected === null;
    btnShow.hidden = question.has_options || revealed;
    btnNext.hidden = !revealed;

    if (revealed) primary = btnNext;
    else if (question.has_options && selected !== null) primary = btnSubmit;
    else if (hasTimer && phase === 'ready') primary = btnStart;
    else if (!question.has_options) primary = btnShow;
    else primary = null;

    for (const button of [btnStart, btnSubmit, btnShow, btnNext]) button.classList.toggle('is-primary', button === primary);
  }

  /* ------------------------------------------------------------ keyboard */

  const stopKeys = onKey((event) => {
    if (event.code === 'Space' && !isInteractive(event)) {
      event.preventDefault();
      primary?.click();
    } else if (/^[1-8]$/.test(event.key) && question.has_options) {
      const index = Number(event.key) - 1;
      if (index < optionEls.length) choose(index);
    }
  });

  refresh();
  if (autoStart && hasTimer) run();

  return {
    el,
    destroy() {
      clearInterval(ticker);
      stopKeys();
    },
  };
}
