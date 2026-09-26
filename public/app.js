'use strict';

const $ = selector => document.querySelector(selector);
const state = { calendars: [], timer: null, folderPath: '/share', folderParent: null };

function showNotice(message, error = false) {
  const el = $('#notice');
  el.textContent = message;
  el.classList.toggle('error', error);
  el.classList.remove('hidden');
  clearTimeout(showNotice.timer);
  showNotice.timer = setTimeout(() => el.classList.add('hidden'), 6000);
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

function makeId() {
  return self.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
}

function renderCalendars() {
  const root = $('#calendars');
  root.innerHTML = '';
  if (!state.calendars.length) {
    root.innerHTML = '<div class="empty">Noch kein Kalender angelegt.</div>';
    return;
  }
  for (const calendar of state.calendars) {
    const row = document.createElement('div');
    row.className = 'calendar';
    row.dataset.id = calendar.id;
    row.innerHTML = `
      <label>Name <input class="calendar-name" maxlength="80"></label>
      <label>Private iCal-Adresse <input class="calendar-url" type="password" placeholder="${calendar.hasUrl ? 'Gespeichert – leer lassen zum Beibehalten' : 'https://calendar.google.com/calendar/ical/…'}"></label>
      <button class="danger remove-calendar" type="button">Entfernen</button>`;
    row.querySelector('.calendar-name').value = calendar.name;
    row.querySelector('.remove-calendar').addEventListener('click', () => {
      state.calendars = state.calendars.filter(item => item.id !== calendar.id);
      renderCalendars();
    });
    root.appendChild(row);
  }
}

function collectCalendars() {
  return [...document.querySelectorAll('.calendar')].map(row => ({
    id: row.dataset.id,
    name: row.querySelector('.calendar-name').value.trim(),
    url: row.querySelector('.calendar-url').value.trim()
  }));
}

async function loadFolders(folder = '/share') {
  const data = await request(`/api/folders?path=${encodeURIComponent(folder)}`);
  state.folderPath = data.current;
  state.folderParent = data.parent;
  $('#folderCurrent').textContent = data.current;
  $('#folderUp').disabled = !data.parent;
  const list = $('#folderList');
  list.innerHTML = '';
  if (!data.folders.length) {
    list.innerHTML = '<div class="empty">Keine Unterordner vorhanden.</div>';
    return;
  }
  for (const folderItem of data.folders) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'folder-row';
    button.innerHTML = '<span class="folder-icon">▰</span><span></span><span class="folder-arrow">›</span>';
    button.children[1].textContent = folderItem.name;
    button.addEventListener('click', () => loadFolders(folderItem.path).catch(error => showNotice(error.message, true)));
    list.appendChild(button);
  }
}

async function openFolderDialog() {
  const current = $('#targetDir').value.trim();
  const initial = current.startsWith('/share') ? current : '/share';
  $('#folderDialog').classList.remove('hidden');
  try {
    await loadFolders(initial);
  } catch {
    await loadFolders('/share').catch(error => showNotice(error.message, true));
  }
}

function closeFolderDialog() {
  $('#folderDialog').classList.add('hidden');
}

async function loadApp() {
  try {
    const cfg = await request('/api/config');
    state.calendars = cfg.calendars;
    $('#targetDir').value = cfg.targetDir;
    $('#schedule').value = cfg.schedule;
    $('#retentionDays').value = cfg.retentionDays;
    renderCalendars();
    $('#setup').classList.add('hidden');
    $('#login').classList.add('hidden');
    $('#app').classList.remove('hidden');
    await updateStatus();
    clearInterval(state.timer);
    state.timer = setInterval(updateStatus, 5000);
  } catch (error) {
    if (error.status === 401) showLogin(); else showNotice(error.message, true);
  }
}

function showLogin() {
  $('#setup').classList.add('hidden');
  $('#app').classList.add('hidden');
  $('#login').classList.remove('hidden');
}

async function updateStatus() {
  try {
    const current = await request('/api/status');
    $('#runState').textContent = current.running ? 'Sicherung läuft …' : 'Bereit';
    $('#runNow').disabled = current.running;
    if (current.lastRun?.finishedAt) {
      const ok = current.lastRun.results.filter(result => result.ok).length;
      $('#lastRun').textContent = `${new Date(current.lastRun.finishedAt).toLocaleString()} · ${ok}/${current.lastRun.results.length} erfolgreich`;
    }
  } catch (error) {
    if (error.status === 401) showLogin();
  }
}

$('#setupForm').addEventListener('submit', async event => {
  event.preventDefault();
  const password = $('#setupPassword').value;
  if (password !== $('#setupPassword2').value) return showNotice('Die Passwörter stimmen nicht überein.', true);
  try {
    await request('/api/setup', { method: 'POST', body: JSON.stringify({ password }) });
    await loadApp();
  } catch (error) { showNotice(error.message, true); }
});

$('#loginForm').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    await request('/api/login', { method: 'POST', body: JSON.stringify({ password: $('#loginPassword').value }) });
    $('#loginPassword').value = '';
    await loadApp();
  } catch (error) { showNotice(error.message, true); }
});

$('#addCalendar').addEventListener('click', () => {
  state.calendars.push({ id: makeId(), name: '', hasUrl: false });
  renderCalendars();
});

$('#browseTarget').addEventListener('click', openFolderDialog);
$('#closeFolders').addEventListener('click', closeFolderDialog);
$('#cancelFolder').addEventListener('click', closeFolderDialog);
$('#folderUp').addEventListener('click', () => {
  if (state.folderParent) loadFolders(state.folderParent).catch(error => showNotice(error.message, true));
});
$('#chooseFolder').addEventListener('click', () => {
  $('#targetDir').value = state.folderPath;
  closeFolderDialog();
});
$('#folderDialog').addEventListener('click', event => {
  if (event.target === $('#folderDialog')) closeFolderDialog();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !$('#folderDialog').classList.contains('hidden')) closeFolderDialog();
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
  } catch (error) { showNotice(error.message, true); }
  finally { button.disabled = false; }
});

$('#runNow').addEventListener('click', async () => {
  try {
    await request('/api/run', { method: 'POST', body: '{}' });
    showNotice('Sicherung wurde gestartet.');
    await updateStatus();
  } catch (error) { showNotice(error.message, true); }
});

$('#logout').addEventListener('click', async () => {
  await request('/api/logout', { method: 'POST', body: '{}' }).catch(() => {});
  showLogin();
});

(async () => {
  try {
    const setup = await request('/api/setup-status');
    if (!setup.setupComplete) $('#setup').classList.remove('hidden'); else await loadApp();
  } catch (error) { showNotice(error.message, true); }
})();
