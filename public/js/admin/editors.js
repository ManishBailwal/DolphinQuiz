// The forms used by the admin panel.

import { api, uploadFile } from '../api.js';
import { CATEGORIES } from '../meta.js';
import { h, toast } from '../ui.js';

const LETTERS = 'ABCDEFGH';
const MAX_OPTIONS = 8;
const MIN_OPTIONS = 2;
let counter = 0;

function field(label, control, hint) {
  return h(
    'label',
    { class: 'field' },
    h('span', { class: 'field-label' }, label),
    control,
    hint ? h('span', { class: 'hint' }, hint) : null,
  );
}

function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/* ------------------------------------------------------------------ dialog */

function openDialog({ title, content, submitLabel, onSubmit, wide = false }) {
  const errorEl = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const submit = h('button', { class: 'btn is-primary', type: 'submit' }, submitLabel);
  const dialog = h('dialog', { class: `dialog editor${wide ? ' is-wide' : ''}` });

  const form = h(
    'form',
    {
      class: 'editor-form',
      onSubmit: async (event) => {
        event.preventDefault();
        errorEl.hidden = true;
        submit.disabled = true;
        try {
          await onSubmit();
          dialog.close();
        } catch (error) {
          errorEl.textContent = error.message;
          errorEl.hidden = false;
          errorEl.scrollIntoView({ block: 'nearest' });
        } finally {
          submit.disabled = false;
        }
      },
    },
    h('h2', { class: 'editor-title' }, title),
    h('div', { class: 'editor-body' }, content),
    errorEl,
    h('div', { class: 'dialog-actions' }, h('button', { class: 'btn', type: 'button', onClick: () => dialog.close() }, 'Cancel'), submit),
  );

  dialog.append(form);
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}

/* --------------------------------------------------------- question fields */
// One question: text, "does it have options?", the options or the typed answer, timer, marks.

export function questionFields({ category, settings, initial = {}, heading = null, withMarks = false, onRemove = null }) {
  // MCQs always have options and Rapid Fire never does. The other rounds ask for each question.
  const locked = category === 'mcq' ? true : category === 'rapid' ? false : null;
  const group = `q${++counter}`;

  const state = {
    hasOptions: locked ?? Boolean(initial.has_options),
    options: initial.has_options
      ? initial.options.map((o) => o.text)
      : Array.from({ length: settings.default_option_count }, () => ''),
    correct: initial.has_options && initial.correct_index >= 0 ? initial.correct_index : 0,
  };

  const text = h('textarea', { class: 'input', rows: 2, placeholder: 'Type the question', 'aria-label': 'Question text', value: initial.text ?? '' });
  const answer = h('input', { class: 'input', type: 'text', placeholder: 'The answer shown after the question', value: initial.answer ?? '' });
  const timer = h('input', { class: 'input input-narrow', type: 'number', min: 0, max: 600, value: initial.timer_seconds ?? 0 });
  const marks = withMarks ? h('input', { class: 'input input-narrow', type: 'number', min: 0, max: 1000, value: initial.marks ?? 0 }) : null;

  const optionsBox = h('div', { class: 'options-editor' });
  const answerBox = field('Answer', answer);

  function drawOptions() {
    optionsBox.replaceChildren(
      ...state.options.map((value, i) =>
        h(
          'div',
          { class: 'option-row' },
          h('input', {
            type: 'radio',
            name: `${group}-correct`,
            checked: state.correct === i,
            'aria-label': `Option ${LETTERS[i]} is the correct answer`,
            onChange: () => (state.correct = i),
          }),
          h('span', { class: 'option-letter' }, LETTERS[i]),
          h('input', {
            class: 'input',
            type: 'text',
            value,
            placeholder: `Option ${LETTERS[i]}`,
            'aria-label': `Option ${LETTERS[i]}`,
            onInput: (event) => (state.options[i] = event.target.value),
            onKeydown: (event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault(); // Enter moves to the next option instead of saving the whole form
              const inputs = optionsBox.querySelectorAll('input[type="text"]');
              if (inputs[i + 1]) inputs[i + 1].focus();
              else if (state.options.length < MAX_OPTIONS) addOption();
            },
          }),
          h(
            'button',
            {
              class: 'btn btn-small',
              type: 'button',
              disabled: state.options.length <= MIN_OPTIONS,
              'aria-label': `Remove option ${LETTERS[i]}`,
              onClick: () => removeOption(i),
            },
            'Remove',
          ),
        ),
      ),
      h(
        'div',
        { class: 'option-tools' },
        h('button', { class: 'btn btn-small', type: 'button', disabled: state.options.length >= MAX_OPTIONS, onClick: addOption }, 'Add option'),
        h('span', { class: 'hint' }, 'Select the round button next to the correct option.'),
      ),
    );
  }

  function addOption() {
    state.options.push('');
    drawOptions();
    optionsBox.querySelectorAll('input[type="text"]')[state.options.length - 1]?.focus();
  }

  function removeOption(index) {
    state.options.splice(index, 1);
    if (state.correct === index) state.correct = 0;
    else if (state.correct > index) state.correct -= 1;
    drawOptions();
  }

  function syncMode() {
    optionsBox.hidden = !state.hasOptions;
    answerBox.hidden = state.hasOptions;
  }

  const radio = (value, label) =>
    h(
      'label',
      { class: 'radio' },
      h('input', {
        type: 'radio',
        name: `${group}-type`,
        checked: state.hasOptions === value,
        onChange: () => {
          state.hasOptions = value;
          syncMode();
        },
      }),
      h('span', {}, label),
    );

  const typeToggle =
    locked === null
      ? h('fieldset', { class: 'type-toggle' }, h('legend', { class: 'field-label' }, 'Does this question have options?'), radio(true, 'Yes, with options'), radio(false, 'No, the answer is typed'))
      : null;

  drawOptions();
  syncMode();

  const headingEl = heading ? h('h3', { class: 'q-fields-heading' }, heading) : null;
  const headingRow =
    headingEl && onRemove
      ? h('div', { class: 'q-fields-head' }, headingEl, h('button', { class: 'btn btn-small', type: 'button', onClick: () => onRemove() }, 'Remove question'))
      : headingEl;

  const el = h(
    'div',
    { class: 'q-fields' },
    headingRow,
    field('Question', text),
    typeToggle,
    optionsBox,
    answerBox,
    h(
      'div',
      { class: 'field-row' },
      field('Timer (seconds)', timer, '0 means no timer'),
      marks ? field('Marks', marks, 'Points for this question') : null,
    ),
  );

  return {
    el,
    setHeading(text) {
      if (headingEl) headingEl.textContent = text;
    },
    read() {
      const out = { text: text.value.trim(), has_options: state.hasOptions, timer_seconds: Number(timer.value || 0) };
      if (marks) out.marks = Number(marks.value || 0);
      if (state.hasOptions) {
        out.options = state.options.map((o) => o.trim());
        out.correct_index = state.correct;
      } else {
        out.answer = answer.value.trim();
      }
      return out;
    },
  };
}

/* ------------------------------------------------------------ media picker */
// Upload a new file (saved into the media folder) or pick one that is already there.

export function mediaPicker({ kind, initial = '' }) {
  let file = initial;
  const preview = h('div', { class: 'media-preview' });
  const message = h('p', { class: 'hint' }, `Files are stored in the media/${kind}s folder. You can also copy files there yourself.`);
  const progress = h('progress', { max: 100, value: 0, hidden: true });

  const select = h('select', {
    class: 'input',
    'aria-label': `Choose an ${kind} that is already in the media folder`,
    onChange: () => {
      file = select.value;
      drawPreview();
    },
  });

  const picker = h('input', { type: 'file', accept: kind === 'image' ? 'image/*' : 'video/*', hidden: true });
  const uploadButton = h('button', { class: 'btn', type: 'button', onClick: () => picker.click() }, `Upload ${kind}`);

  picker.addEventListener('change', async () => {
    const chosen = picker.files?.[0];
    if (!chosen) return;
    progress.hidden = false;
    progress.value = 0;
    uploadButton.disabled = true;
    message.classList.remove('is-error');
    message.textContent = `Uploading ${chosen.name}...`;
    try {
      const result = await uploadFile(kind, chosen, (percent) => (progress.value = percent));
      file = result.file;
      message.textContent = `Saved as ${result.file}`;
      await loadFiles();
    } catch (error) {
      message.textContent = error.message;
      message.classList.add('is-error');
    } finally {
      progress.hidden = true;
      uploadButton.disabled = false;
      picker.value = '';
    }
  });

  function drawPreview() {
    preview.replaceChildren(
      file
        ? kind === 'image'
          ? h('img', { src: `/media/${file}`, alt: 'Preview' })
          : h('video', { src: `/media/${file}`, controls: true, preload: 'metadata' })
        : h('p', { class: 'hint' }, `No ${kind} chosen yet.`),
    );
  }

  async function loadFiles() {
    const files = await api.media(kind);
    select.replaceChildren(
      h('option', { value: '' }, files.length ? `Choose a ${kind} already in the folder` : `No ${kind}s in the folder yet`),
      ...files.map((f) => h('option', { value: f.file }, `${f.name} (${formatSize(f.size)})`)),
    );
    select.value = files.some((f) => f.file === file) ? file : '';
    drawPreview();
  }

  loadFiles().catch((error) => {
    message.textContent = error.message;
    message.classList.add('is-error');
  });
  drawPreview();

  return {
    el: h(
      'div',
      { class: 'media-picker' },
      h('div', { class: 'media-actions' }, uploadButton, h('span', { class: 'hint' }, 'or'), select),
      progress,
      message,
      preview,
      picker,
    ),
    read: () => file,
  };
}

/* ---------------------------------------------------------------- editors */

export function openQuestionEditor({ category, track, settings, question = null, onSaved }) {
  const initial =
    question ?? { timer_seconds: category === 'mcq' ? settings.mcq_timer : category === 'rapid' ? settings.rapid_timer : 0 };
  const fields = questionFields({ category, settings, initial });

  openDialog({
    title: question ? 'Edit question' : 'Add question',
    content: fields.el,
    submitLabel: 'Save question',
    onSubmit: async () => {
      const body = { track, category, ...fields.read() };
      if (question) await api.updateQuestion(question.id, body);
      else await api.createQuestion(body);
      onSaved(question ? 'Question updated' : 'Question added');
    },
  });
}

const MIN_SET_QUESTIONS = 1;
const MAX_SET_QUESTIONS = 12;

export function openSetEditor({ category, track, settings, set = null, onSaved }) {
  const info = CATEGORIES[category];
  const title = h('input', { class: 'input', type: 'text', maxlength: 120, placeholder: `A name for this ${info.unit} (optional)`, value: set?.title ?? '' });
  const picker = mediaPicker({ kind: info.media, initial: set?.media_file ?? '' });

  // The number of questions is not fixed — start with the configured default (or however many the
  // set already has), then let the operator add or remove questions freely, from 1 up to 12.
  const startCount = set ? set.questions.length : settings[`${category}_question_count`];
  const formsBox = h('div', { class: 'set-editor-forms' });
  const forms = [];

  const addBtn = h('button', { class: 'btn btn-small', type: 'button', onClick: () => addForm() }, 'Add question');
  const countHint = h('span', { class: 'hint' });

  function nextMarks(i) {
    if (category !== 'buzzer') return 0;
    if (settings.buzzer_marks[i] != null) return settings.buzzer_marks[i];
    const prev = forms[i - 1]?.read().marks;
    return typeof prev === 'number' ? Math.max(0, prev - 10) : 0;
  }

  function addForm(initial = null) {
    const i = forms.length;
    const fields = questionFields({
      category,
      settings,
      heading: `Question ${i + 1}`,
      withMarks: category === 'buzzer',
      initial: initial ?? { timer_seconds: 0, marks: nextMarks(i) },
      onRemove: () => removeForm(fields),
    });
    forms.push(fields);
    formsBox.append(fields.el);
    renumber();
  }

  function removeForm(fields) {
    const i = forms.indexOf(fields);
    if (i === -1 || forms.length <= MIN_SET_QUESTIONS) return;
    forms.splice(i, 1);
    fields.el.remove();
    renumber();
  }

  function renumber() {
    forms.forEach((f, i) => f.setHeading(`Question ${i + 1}`));
    addBtn.disabled = forms.length >= MAX_SET_QUESTIONS;
    countHint.textContent = `${forms.length} of up to ${MAX_SET_QUESTIONS} questions`;
  }

  for (let i = 0; i < startCount; i++) addForm(set ? set.questions[i] : null);

  openDialog({
    wide: true,
    title: set ? `Edit ${info.unit}` : `Add ${info.unit}`,
    submitLabel: `Save ${info.unit}`,
    content: h(
      'div',
      { class: 'set-editor' },
      field('Title', title),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, info.media === 'image' ? 'Image' : 'Video'), picker.el),
      formsBox,
      h('div', { class: 'set-editor-tools' }, addBtn, countHint),
    ),
    onSubmit: async () => {
      const body = { track, category, title: title.value.trim(), media_file: picker.read(), questions: forms.map((f) => f.read()) };
      if (set) await api.updateSet(set.id, body);
      else await api.createSet(body);
      onSaved(set ? `${capitalize(info.unit)} updated` : `${capitalize(info.unit)} added`);
    },
  });
}

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/* --------------------------------------------------------------- settings */

const SETTING_FIELDS = [
  { key: 'event_title', label: 'Event title', type: 'text', hint: 'Shown at the top of the home screen.' },
  { key: 'mcq_timer', label: 'MCQ timer (seconds)', type: 'number', min: 0, max: 600, hint: 'Starting value for new MCQs. Every question can still have its own timer. 0 means no timer.' },
  { key: 'rapid_timer', label: 'Rapid Fire timer (seconds)', type: 'number', min: 0, max: 600, hint: 'Starting value for new Rapid Fire questions.' },
  { key: 'default_option_count', label: 'Options per new question', type: 'number', min: 2, max: 8, hint: 'How many option boxes a new question starts with. Options can be added or removed on each question.' },
  { key: 'rapid_per_student', label: 'Rapid Fire questions per student', type: 'number', min: 1, max: 10, hint: 'Questions are dealt out in turns of this size.' },
  { key: 'visual_question_count', label: 'Starting questions per image (Visual Round)', type: 'number', min: 1, max: 12, hint: 'How many question boxes a new image starts with. You can add or remove questions on each image, up to 12.' },
  { key: 'video_question_count', label: 'Starting questions per video (Video Round)', type: 'number', min: 1, max: 12, hint: 'How many question boxes a new video starts with. You can add or remove questions on each video, up to 12.' },
  { key: 'buzzer_question_count', label: 'Starting questions per image (Buzzer Round)', type: 'number', min: 1, max: 12, hint: 'How many question boxes a new image starts with. You can add or remove questions on each image, up to 12.' },
  { key: 'buzzer_marks', label: 'Buzzer marks, first question to last', type: 'text', hint: 'Separate with commas, for example 50, 40, 30, 20, 10, 5. They fill in the marks of a new image; each question can still be changed.' },
];

export function renderSettings(container, settings, onSaved) {
  const inputs = {};
  const errorEl = h('p', { class: 'form-error', role: 'alert', hidden: true });

  const rows = SETTING_FIELDS.map((f) => {
    const value = settings[f.key];
    let input;
    if (f.type === 'checkbox') {
      input = h('input', { type: 'checkbox', checked: Boolean(value) });
      inputs[f.key] = input;
      return h('label', { class: 'field field-check' }, input, h('span', {}, h('span', { class: 'field-label' }, f.label), h('span', { class: 'hint' }, f.hint)));
    }
    input = h('input', {
      class: `input${f.type === 'number' ? ' input-narrow' : ''}`,
      type: f.type,
      min: f.min,
      max: f.max,
      value: Array.isArray(value) ? value.join(', ') : value,
    });
    inputs[f.key] = input;
    return field(f.label, input, f.hint);
  });

  const form = h(
    'form',
    {
      class: 'settings-form',
      onSubmit: async (event) => {
        event.preventDefault();
        errorEl.hidden = true;
        const body = {};
        for (const f of SETTING_FIELDS) {
          const input = inputs[f.key];
          body[f.key] = f.type === 'checkbox' ? input.checked : f.type === 'number' ? Number(input.value) : input.value;
        }
        try {
          const saved = await api.saveSettings(body);
          toast('Settings saved');
          onSaved(saved);
        } catch (error) {
          errorEl.textContent = error.message;
          errorEl.hidden = false;
        }
      },
    },
    ...rows,
    errorEl,
    h('div', { class: 'settings-actions' }, h('button', { class: 'btn is-primary', type: 'submit' }, 'Save settings')),
  );

  container.replaceChildren(form);
}
