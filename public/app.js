'use strict';

const $ = selector => document.querySelector(selector);
const state = { calendars: [], timer: null };
const folderState = { path: '/share', parent: null };
// QTS kann das Desktop-Fenster unter einem anderen Dokumentpfad öffnen.
// API-Aufrufe gehen immer über den registrierten QPKG-Proxy-Pfad.
const API_ROOT = '/GoogleCalendarBackup/';

function showNotice(message, error = false) {
  const el = $('#notice');
  el.textContent = message;
  el.classList.toggle('error', error);
  el.classList.remove('hidden');
  clearTimeout(showNotice.timer);
  showNotice.timer = setTimeout(() => el.classList.add('hidden'), 6000);
}

async function request(url, options = {}) {
  const response = await fetch(`${API_ROOT}${String(url).replace(/^\//, '')}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

function makeId() {
  return self.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
}

function renderCalendars() {
  const root = $('#calendars');
  root.innerHTML = '';
  if (!state.calendars.length) {
    root.innerHTML = '<div class="empty">Noch kein Kalender angelegt. Klicke oben auf „Kalender hinzufügen“.</div>';
    return;
  }

  state.calendars.forEach((calendar, index) => {
    const row = document.createElement('div');
    row.className = 'calendar';
    row.dataset.id = calendar.id;
    row.innerHTML = `
      <span class="calendar-number">${String(index + 1).padStart(2, '0')}</span>
      <label class="calendar-name-field">Name <input class="calendar-name" maxlength="80" placeholder="z. B. Familie"></label>
      <label class="calendar-url-field">Private iCal-Adresse <input class="calendar-url" type="password" placeholder="${calendar.hasUrl ? 'Gespeichert – leer lassen zum Beibehalten' : 'https://calendar.google.com/calendar/ical/…'}"></label>
      <button class="secondary save-calendar" type="button" title="Diesen Kalender speichern">Speichern</button>
      <button class="danger remove-calendar" type="button" title="Kalender entfernen" aria-label="Kalender entfernen">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5"/></svg>
      </button>`;
    row.querySelector('.calendar-name').value = calendar.name;
    row.querySelector('.calendar-url').value = calendar.url || '';
    row.querySelector('.save-calendar').addEventListener('click', () => saveCalendar(row));
    row.querySelector('.remove-calendar').addEventListener('click', () => {
      state.calendars = readCalendarDrafts().filter(item => item.id !== calendar.id);
      renderCalendars();
    });
    root.appendChild(row);
  });
}

function collectCalendars() {
  return [...document.querySelectorAll('.calendar')].map(row => ({
    id: row.dataset.id,
    name: row.querySelector('.calendar-name').value.trim(),
    url: row.querySelector('.calendar-url').value.trim()
  }));
}

function readCalendarDrafts() {
  const existing = new Map(state.calendars.map(item => [item.id, item]));
  return collectCalendars().map(item => ({ ...existing.get(item.id), ...item }));
}

async function saveCalendar(row) {
  const button = row.querySelector('.save-calendar');
  const nameInput = row.querySelector('.calendar-name');
  const urlInput = row.querySelector('.calendar-url');
  button.disabled = nameInput.disabled = urlInput.disabled = true;
  try {
    const id = row.dataset.id;
    const cfg = await request('/api/calendar', {
      method: 'POST',
      body: JSON.stringify({ id, name: nameInput.value.trim(), url: urlInput.value.trim() })
    });
    const saved = cfg.calendars.find(item => item.id === id);
    state.calendars = readCalendarDrafts().map(item => item.id === id ? { ...saved, url: '' } : item);
    nameInput.value = saved.name;
    urlInput.value = '';
    urlInput.placeholder = 'Gespeichert – leer lassen zum Beibehalten';
    showNotice(`Kalender „${saved.name}“ gespeichert.`);
  } catch (error) {
    showNotice(error.message, true);
  } finally {
    button.disabled = nameInput.disabled = urlInput.disabled = false;
  }
}

function folderIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h7l2 2h9v10H3V6Z"/></svg>';
}

async function loadFolders(folder = '/share') {
  const root = $('#folderList');
  root.innerHTML = '<div class="folder-empty">Ordner werden geladen …</div>';
  try {
    // POST vermeidet QTS-Proxy-Probleme mit kodierten /share-Pfaden in der Query.
    const result = await request('/api/folders', {
      method: 'POST',
      body: JSON.stringify({ path: folder })
    });
    folderState.path = result.path;
    folderState.parent = result.parent;
    $('#folderCurrent').textContent = result.path;
    $('#folderUp').disabled = !result.parent;
    $('#chooseFolder').disabled = result.path === '/share';
    root.innerHTML = '';

    if (!result.folders.length) {
      root.innerHTML = '<div class="folder-empty">Keine Unterordner vorhanden.</div>';
      return;
    }

    for (const folderItem of result.folders) {
      const button = document.createElement('button');
      button.className = 'folder-row';
      button.type = 'button';
      button.innerHTML = `${folderIcon()}<span></span>`;
      button.querySelector('span').textContent = folderItem.name;
      button.addEventListener('click', () => loadFolders(folderItem.path));
      root.appendChild(button);
    }
  } catch (error) {
    if (folder !== '/share') return loadFolders('/share');
    root.innerHTML = '';
    const message = document.createElement('div');
    message.className = 'folder-empty';
    message.textContent = error.message;
    root.appendChild(message);
  }
}

async function updateStatus() {
  try {
    const current = await request('/api/status');
    $('#runState').textContent = current.running ? 'Sicherung läuft …' : 'Bereit';
    $('#runNow').disabled = current.running;
    document.querySelector('.stat-icon.ready')?.classList.toggle('running', current.running);
    if (current.lastRun?.finishedAt) {
      const ok = current.lastRun.results.filter(result => result.ok).length;
      $('#lastRun').textContent = `${new Date(current.lastRun.finishedAt).toLocaleString('de-DE')} · ${ok}/${current.lastRun.results.length} erfolgreich`;
    }
  } catch (error) {
    showNotice(error.message, true);
  }
}

async function loadApp() {
  try {
    const cfg = await request('/api/config');
    state.calendars = cfg.calendars;
    $('#targetDir').value = cfg.targetDir;
    $('#schedule').value = cfg.schedule;
    $('#retentionDays').value = cfg.retentionDays;
    renderCalendars();
    await updateStatus();
    clearInterval(state.timer);
    state.timer = setInterval(updateStatus, 5000);
  } catch (error) {
    showNotice(error.message, true);
  }
}

$('#addCalendar').addEventListener('click', () => {
  state.calendars = readCalendarDrafts();
  state.calendars.push({ id: makeId(), name: '', hasUrl: false });
  renderCalendars();
  document.querySelector('.calendar:last-child .calendar-name')?.focus();
});

$('#save').addEventListener('click', async () => {
  const button = $('#save');
  button.disabled = true;
  try {
    const cfg = await request('/api/config', {
      method: 'PUT',
      body: JSON.stringify({
        targetDir: $('#targetDir').value,
        schedule: $('#schedule').value,
        retentionDays: Number($('#retentionDays').value),
        calendars: collectCalendars()
      })
    });
    state.calendars = cfg.calendars;
    renderCalendars();
    showNotice('Einstellungen gespeichert.');
  } catch (error) {
    showNotice(error.message, true);
  } finally {
    button.disabled = false;
  }
});

$('#runNow').addEventListener('click', async () => {
  try {
    await request('/api/run', { method: 'POST', body: '{}' });
    showNotice('Sicherung wurde gestartet.');
    await updateStatus();
  } catch (error) {
    showNotice(error.message, true);
  }
});

$('#browseTarget').addEventListener('click', () => {
  const current = $('#targetDir').value.trim();
  $('#folderDialog').classList.remove('hidden');
  loadFolders(current === '/share' || current.startsWith('/share/') ? current : '/share');
});

$('#folderUp').addEventListener('click', () => {
  if (folderState.parent) loadFolders(folderState.parent);
});

$('#chooseFolder').addEventListener('click', () => {
  $('#targetDir').value = folderState.path;
  $('#folderDialog').classList.add('hidden');
});

for (const selector of ['#closeFolders', '#cancelFolder']) {
  $(selector).addEventListener('click', () => $('#folderDialog').classList.add('hidden'));
}

$('#folderDialog').addEventListener('click', event => {
  if (event.target === $('#folderDialog')) $('#folderDialog').classList.add('hidden');
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') $('#folderDialog').classList.add('hidden');
});

loadApp();
