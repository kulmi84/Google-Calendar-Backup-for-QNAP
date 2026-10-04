'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

async function freePort() {
  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  return port;
}

test('QTS proxy API paths reach configuration and folder handlers', async () => {
  const port = await freePort();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcb-proxy-'));
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, GCB_PORT: String(port), GCB_HOST: '127.0.0.1', GCB_DATA_DIR: dataDir, GCB_QNAP_MODE: '1' },
    stdio: 'ignore'
  });
  const base = `http://127.0.0.1:${port}`;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        ready = (await fetch(`${base}/health`)).ok;
        if (ready) break;
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.equal(ready, true, 'backend did not start');

    for (const url of ['/config', '/api/config', '/GoogleCalendarBackup/api/config']) {
      const response = await fetch(base + url);
      assert.equal(response.status, 200, url);
      assert.equal((await response.json()).schedule, '03:15');
    }
    const folders = await fetch(`${base}/folders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: '/not-under-share' })
    });
    assert.equal(folders.status, 400);
    assert.match((await folders.json()).error, /außerhalb/);

    const calendarUrl = 'https://calendar.google.com/calendar/ical/example/private-token/basic.ics';
    const saveCalendar = (url, id, name, calendarUrlValue) => fetch(base + url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name, url: calendarUrlValue })
    });
    const first = await saveCalendar('/calendar', 'one', 'Familie', calendarUrl);
    assert.equal(first.status, 200);
    assert.deepEqual((await first.json()).calendars, [{ id: 'one', name: 'Familie', hasUrl: true }]);

    const duplicate = await saveCalendar('/GoogleCalendarBackup/api/calendar', 'two', 'Familie', calendarUrl);
    assert.equal(duplicate.status, 400);
    assert.match((await duplicate.json()).error, /doppelt/);

    const renamed = await saveCalendar('/calendar', 'one', 'Privat', '');
    assert.equal(renamed.status, 200);
    assert.deepEqual((await renamed.json()).calendars, [{ id: 'one', name: 'Privat', hasUrl: true }]);
    const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'config.json'), 'utf8'));
    assert.equal(saved.calendars[0].url, calendarUrl);
    assert.equal(saved.targetDir, '/share/Sicherung/Google_Kalender');

    const invalid = await saveCalendar('/calendar', 'two', 'Arbeit', 'https://example.org/calendar.ics');
    assert.equal(invalid.status, 400);
    assert.equal((await (await fetch(base + '/config')).json()).calendars.length, 1);
    const statusResponse = await fetch(base + '/GoogleCalendarBackup/status');
    assert.equal(statusResponse.status, 200);
    const status = await statusResponse.json();
    assert.equal(status.health.calendars.length, 1);
    assert.equal(status.health.calendars[0].id, 'one');
    assert.equal(status.health.complete, false);
    assert.deepEqual(status.errors, []);
    assert.equal(JSON.stringify(status).includes('private-token'), false);
    const collision = await saveCalendar('/calendar', 'three', 'Privat!', calendarUrl);
    assert.equal(collision.status, 400);
    assert.equal((await (await fetch(base + '/config')).json()).calendars.length, 1);
  } finally {
    child.kill();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
