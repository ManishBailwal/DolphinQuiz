// Tiny helpers shared by the quiz screen and the admin panel. No framework needed.

// h('button', { class: 'btn', onClick: fn }, 'Label')  ->  <button class="btn">Label</button>
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key in el) el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  el.append(...children.flat().filter((child) => child != null && child !== false));
  return el;
}

// Keyboard shortcuts that stay quiet while someone is typing in a field.
// Returns a function that removes the listener.
export function onKey(handler) {
  const listener = (event) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    const t = event.target;
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
    handler(event);
  };
  document.addEventListener('keydown', listener);
  return () => document.removeEventListener('keydown', listener);
}

// True when the key event came from something that already reacts to Space itself.
export function isInteractive(event) {
  return Boolean(event.target?.closest?.('button, a, video, summary'));
}

// After a mouse click, take focus off the button so Space goes to the quiz shortcuts
// instead of pressing the same button again. Keyboard activation (detail === 0) is left alone.
document.addEventListener(
  'click',
  (event) => {
    if (event.detail === 0) return;
    event.target.closest?.('button')?.blur();
  },
  true,
);

export function confirmDialog({ title, body, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    const dialog = h(
      'dialog',
      { class: 'dialog' },
      h(
        'form',
        { method: 'dialog', class: 'dialog-body' },
        h('h2', {}, title),
        body ? h('p', {}, body) : null,
        h(
          'div',
          { class: 'dialog-actions' },
          h('button', { class: 'btn', value: 'cancel' }, cancelLabel),
          h('button', { class: `btn is-primary${danger ? ' is-danger' : ''}`, value: 'ok' }, confirmLabel),
        ),
      ),
    );
    dialog.addEventListener('close', () => {
      resolve(dialog.returnValue === 'ok');
      dialog.remove();
    });
    document.body.append(dialog);
    dialog.showModal();
  });
}

export function toast(message) {
  const el = h('div', { class: 'toast', role: 'status' }, message);
  document.body.append(el);
  setTimeout(() => el.remove(), 2400);
}

// 90000 ms -> "1:30", 24000 ms -> "24"
export function fmtClock(ms) {
  const s = Math.ceil(ms / 1000);
  if (s >= 60) return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  return String(s);
}

export function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}
