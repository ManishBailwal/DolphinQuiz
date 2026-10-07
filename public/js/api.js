// Talks to the server. Every function returns a Promise.

async function request(method, url, body) {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status}).`);
  return data;
}

const scope = (track, category) => `track=${encodeURIComponent(track)}&category=${encodeURIComponent(category)}`;

export const api = {
  settings: () => request('GET', '/api/settings'),
  saveSettings: (body) => request('PUT', '/api/settings', body),
  summary: () => request('GET', '/api/summary'),

  questions: (track, category) => request('GET', `/api/questions?${scope(track, category)}`),
  createQuestion: (body) => request('POST', '/api/questions', body),
  updateQuestion: (id, body) => request('PUT', `/api/questions/${id}`, body),
  deleteQuestion: (id) => request('DELETE', `/api/questions/${id}`),

  sets: (track, category) => request('GET', `/api/sets?${scope(track, category)}`),
  createSet: (body) => request('POST', '/api/sets', body),
  updateSet: (id, body) => request('PUT', `/api/sets/${id}`, body),
  deleteSet: (id) => request('DELETE', `/api/sets/${id}`),

  move: (kind, id, dir) => request('POST', '/api/move', { kind, id, dir }),
  media: (kind) => request('GET', `/api/media?kind=${kind}`),
};

// Sends the file as the raw request body. XMLHttpRequest is used because fetch cannot report upload progress.
export function uploadFile(kind, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/upload?kind=${kind}&filename=${encodeURIComponent(file.name)}`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      let data = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* keep empty */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data.error ?? `Upload failed (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error('Upload failed. Check that the server is still running.'));
    xhr.send(file);
  });
}
