'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PassThrough } = require('node:stream');
const { EventEmitter } = require('node:events');
const https = require('node:https');
const { execFileSync } = require('node:child_process');
const { validateIcs, checkTarget, MIN_FREE_BYTES } = require('../src/snapshot');
const { backupCalendar, runBackup, download, removeExpired } = require('../src/backup');
const { monitor } = require('../src/monitor');
const { loadHistory, recordError } = require('../src/history');
const { checkWatchdog } = require('../src/watchdog');

const ICS = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//EN\r\nBEGIN:VEVENT\r\nUID:a\r\nDTSTAMP:20261004T120000Z\r\nSUMMARY:Ein langer\r\n Text\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';
const calendar = { id: 'one', name: 'Privat', url: 'https://calendar.google.com/calendar/ical/one/private-secret/basic.ics' };
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcb-reliability-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const targetDir = path.join(dir, 'backups');
  fs.mkdirSync(targetDir);
  return { dir, targetDir, config: { targetDir, retentionDays: 365, calendars: [calendar] } };
}

test('ICS validation accepts folded properties and empty calendars, rejects truncation and HTML', () => {
  assert.equal(validateIcs(Buffer.from(ICS)), true);
  assert.equal(validateIcs(Buffer.from('BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR')), true);
  for (const value of ['', '<html>BEGIN:VCALENDAR</html>', ICS.replace('END:VEVENT\r\n', ''), ICS.replace('VERSION:2.0', 'VERSION:1.0'), ICS.replace('END:VCALENDAR', ''), ICS + ICS]) {
    assert.throws(() => validateIcs(Buffer.from(value)));
  }
});

test('invalid download preserves previous snapshot and removes every temporary file', async t => {
  const f = fixture(t);
  const stamp = '2026-10-04_12-00-00';
  const final = path.join(f.targetDir, `Privat_${stamp}.ics`);
  fs.writeFileSync(final, ICS);
  const result = await backupCalendar(calendar, f.config, stamp, { dataDir: f.dir, download: async (url, file) => fs.writeFileSync(file, ICS.replace('END:VCALENDAR', '')) });
  assert.equal(result.ok, false);
  assert.equal(fs.readFileSync(final, 'utf8'), ICS);
  assert.equal(fs.readdirSync(f.targetDir).some(name => name.endsWith('.tmp')), false);
  assert.equal(loadHistory(f.dir).length, 1);
});

test('successful snapshot is complete before becoming visible and gets final mode', async t => {
  const f = fixture(t);
  const stamp = '2026-10-04_12-00-00';
  const result = await backupCalendar(calendar, f.config, stamp, { download: async (url, file) => {
    fs.writeFileSync(file, ICS);
    assert.equal(fs.existsSync(path.join(f.targetDir, `Privat_${stamp}.ics`)), false);
  } });
  assert.equal(result.ok, true);
  assert.equal(fs.readFileSync(result.file, 'utf8'), ICS);
  assert.equal(fs.statSync(result.file).mode & 0o777, 0o644);
  assert.equal(fs.readdirSync(f.targetDir).some(name => name.endsWith('.tmp')), false);
});

test('unavailable target produces one result per calendar and durable errors despite failed backup.log', async t => {
  const f = fixture(t);
  fs.rmdirSync(f.targetDir);
  fs.writeFileSync(f.targetDir, 'not a directory');
  f.config.calendars.push({ ...calendar, id: 'two', name: 'Familie' });
  const run = await runBackup(f.config, { dataDir: f.dir, download: async () => assert.fail('download must not start') });
  assert.equal(run.complete, false);
  assert.deepEqual(run.results.map(result => result.ok), [false, false]);
  assert.equal(loadHistory(f.dir).length, 2);
});

test('one failed download does not prevent a later calendar succeeding', async t => {
  const f = fixture(t);
  f.config.calendars.push({ ...calendar, id: 'two', name: 'Familie', url: calendar.url.replace('/one/', '/two/') });
  const run = await runBackup(f.config, { dataDir: f.dir, download: async (url, file) => {
    if (url.pathname.includes('/one/')) throw new Error(`failed ${url}`);
    fs.writeFileSync(file, ICS);
  } });
  assert.deepEqual(run.results.map(result => result.ok), [false, true]);
  assert.equal(run.complete, false);
  assert.equal(JSON.stringify(loadHistory(f.dir)).includes('private-secret'), false);
  assert.equal(JSON.stringify(run).includes('private-secret'), false);
});

test('disk-space guard rejects low space and cleans write probes', t => {
  const f = fixture(t);
  assert.throws(() => checkTarget(f.targetDir, { statfs: () => ({ bavail: MIN_FREE_BYTES - 1, bsize: 1 }) }), /Speicherplatz/);
  assert.equal(checkTarget(f.targetDir, { writeProbe: true, statfs: () => ({ bavail: MIN_FREE_BYTES, bsize: 1 }) }).ok, true);
  assert.deepEqual(fs.readdirSync(f.targetDir), []);
});

test('insufficient storage stops the download before any snapshot is written', async t => {
  const f = fixture(t);
  const result = await backupCalendar(calendar, f.config, '2026-10-04_12-00-00', {
    dataDir: f.dir,
    checkTarget: () => { throw new Error('Zu wenig freier Speicherplatz'); },
    download: async () => assert.fail('download must not start')
  });
  assert.equal(result.ok, false);
  assert.equal(fs.readdirSync(f.targetDir).some(name => name.endsWith('.ics')), false);
  assert.match(loadHistory(f.dir)[0].error, /Speicherplatz/);
});

test('log failure after atomic commit reports maintenance warning without losing successful result', async t => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.targetDir, 'backup.log'));
  const result = await backupCalendar(calendar, f.config, '2026-10-04_12-00-00', {
    dataDir: f.dir, download: async (url, file) => fs.writeFileSync(file, ICS)
  });
  assert.equal(result.ok, true);
  assert.equal(result.warnings.length, 1);
  assert.equal(fs.readFileSync(result.file, 'utf8'), ICS);
  assert.equal(loadHistory(f.dir)[0].source, 'Wartung');
});

test('watchdog CLI records stale backup without a running application server', t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.dir, 'config.json'), JSON.stringify(f.config));
  const file = path.join(f.targetDir, 'Privat_2026-10-04_12-00-00.ics');
  fs.writeFileSync(file, ICS);
  const old = new Date(Date.now() - 27 * 3600000);
  fs.utimesSync(file, old, old);
  execFileSync(process.execPath, [path.join(__dirname, '../src/watchdog.js')], {
    env: { ...process.env, GCB_DATA_DIR: f.dir, GCB_QNAP_MODE: '0' }
  });
  assert.equal(loadHistory(f.dir)[0].source, 'Watchdog');
  assert.match(fs.readFileSync(path.join(f.dir, 'watchdog.log'), 'utf8'), /26 Stunden/);
});

test('monitor and watchdog reject a freshly truncated snapshot and history survives reload', t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.targetDir, 'Privat_2026-10-04_12-00-00.ics'), ICS.replace('END:VCALENDAR', ''));
  fs.writeFileSync(path.join(f.dir, 'config.json'), JSON.stringify(f.config));
  const now = Date.now();
  const health = monitor(f.config, now);
  assert.equal(health.complete, false);
  assert.equal(health.calendars[0].state, 'missing');
  checkWatchdog(f.dir, { now, report: () => {} });
  checkWatchdog(f.dir, { now: now + 26 * 3600000, report: () => {} });
  assert.equal(loadHistory(f.dir)[0].source, 'Watchdog');
  assert.equal(loadHistory(f.dir)[0].calendarId, 'one');
});

test('history retains at most 100 entries and uses private file permissions', t => {
  const f = fixture(t);
  for (let index = 0; index < 105; index++) recordError(f.dir, { source: 'Test', error: `Fehler ${index}` });
  assert.equal(loadHistory(f.dir).length, 100);
  for (const file of fs.readdirSync(path.join(f.dir, 'error-history'))) assert.equal(fs.statSync(path.join(f.dir, 'error-history', file)).mode & 0o777, 0o600);
});

test('retention never deletes another calendar with a longer filename prefix', t => {
  const f = fixture(t);
  const other = path.join(f.targetDir, 'Privat_Arbeit_2020-01-01_12-00-00.ics');
  fs.writeFileSync(other, ICS);
  fs.utimesSync(other, new Date('2020-01-01'), new Date('2020-01-01'));
  removeExpired(f.targetDir, 'Privat', 1);
  assert.equal(fs.existsSync(other), true);
});

test('aborted response rejects download instead of promoting a partial file', async t => {
  const f = fixture(t);
  t.mock.method(https, 'get', (url, options, callback) => {
    const request = new EventEmitter();
    request.destroy = error => request.emit('error', error);
    setImmediate(() => {
      const response = new PassThrough();
      response.statusCode = 200;
      response.headers = {};
      callback(response);
      response.write('BEGIN:VCALENDAR');
      setImmediate(() => response.destroy(new Error('connection interrupted')));
    });
    return request;
  });
  await assert.rejects(download(new URL(calendar.url), path.join(f.targetDir, 'test.tmp')), /interrupted/);
});
