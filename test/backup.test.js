'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { removeExpired, safeName, timestamp, validateCalendarUrl } = require('../src/backup');
const { importLegacyCalendars } = require('../src/config');
const { listFolders } = require('../src/folders');

test('safeName creates portable filenames', () => {
  assert.equal(safeName('Familie & Freunde'), 'Familie_Freunde');
  assert.equal(safeName('Dörte / Privat'), 'Dorte_Privat');
});

test('timestamp uses sortable local format', () => {
  assert.equal(timestamp(new Date(2026, 8, 26, 3, 15, 9)), '2026-09-26_03-15-09');
});

test('only private Google Calendar URLs are accepted', () => {
  assert.equal(validateCalendarUrl('https://calendar.google.com/calendar/ical/example/private-token/basic.ics').hostname, 'calendar.google.com');
  assert.throws(() => validateCalendarUrl('http://calendar.google.com/calendar/ical/test/basic.ics'));
  assert.throws(() => validateCalendarUrl('https://example.org/calendar.ics'));
});

test('retention removes only matching expired calendar files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcb-retention-'));
  const old = path.join(dir, 'Marcin_2024-01-01_03-15-00.ics');
  const recent = path.join(dir, 'Marcin_2026-09-26_03-15-00.ics');
  const other = path.join(dir, 'Familie_2024-01-01_03-15-00.ics');
  for (const file of [old, recent, other]) fs.writeFileSync(file, 'BEGIN:VCALENDAR');
  fs.utimesSync(old, new Date('2024-01-01'), new Date('2024-01-01'));
  fs.utimesSync(other, new Date('2024-01-01'), new Date('2024-01-01'));
  removeExpired(dir, 'Marcin', 365, new Date('2026-09-26').getTime());
  assert.equal(fs.existsSync(old), false);
  assert.equal(fs.existsSync(recent), true);
  assert.equal(fs.existsSync(other), true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('legacy QNAP calendar URLs are imported without accepting unrelated URLs', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcb-legacy-'));
  fs.writeFileSync(path.join(dir, 'google_calendar_url'), 'https://calendar.google.com/calendar/ical/marcin/private-a/basic.ics\n');
  fs.writeFileSync(path.join(dir, 'google_calendar_url_familie'), 'https://example.org/not-google.ics\n');
  fs.writeFileSync(path.join(dir, 'google_calendar_url_doris'), 'https://calendar.google.com/calendar/ical/doris/private-b/basic.ics\n');
  const imported = importLegacyCalendars(dir);
  assert.deepEqual(imported.map(item => item.name), ['Marcin', 'Doris']);
  assert.equal(imported.every(item => item.url.includes('calendar.google.com')), true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('QNAP service is bound to localhost and not exposed on the LAN', () => {
  const service = fs.readFileSync(path.join(__dirname, '../qpkg/shared/GoogleCalendarBackup.sh'), 'utf8');
  assert.match(service, /GCB_HOST=127\.0\.0\.1/);
  assert.doesNotMatch(service, /GCB_HOST=0\.0\.0\.0/);
});

test('web assets use the QTS proxy path', () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  assert.match(html, /href="\/GoogleCalendarBackup\/styles\.css"/);
  assert.match(html, /src="\/GoogleCalendarBackup\/app\.js"/);
  const server = fs.readFileSync(path.join(__dirname, '../src/server.js'), 'utf8');
  assert.match(server, /<style>\$\{css\}<\/style>/);
  assert.match(server, /<script>\$\{script\}<\/script>/);
});

test('legacy app credentials are discarded when loading configuration', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcb-config-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({
    setupComplete: true,
    password: { salt: 'old', hash: 'old' },
    schedule: '04:30'
  }));
  const { loadConfig } = require('../src/config');
  const config = loadConfig(dir);
  assert.equal(config.schedule, '04:30');
  assert.equal('password' in config, false);
  assert.equal('setupComplete' in config, false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('folder browser lists only safe visible directories', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gcb-folders-'));
  fs.mkdirSync(path.join(root, 'Sicherung'));
  fs.mkdirSync(path.join(root, 'Familie'));
  fs.mkdirSync(path.join(root, '.hidden'));
  fs.mkdirSync(path.join(root, 'CACHEDEV1_DATA'));
  fs.writeFileSync(path.join(root, 'not-a-folder.txt'), 'x');

  const result = listFolders(root, root);
  assert.equal(result.parent, null);
  assert.deepEqual(result.folders.map(item => item.name), ['Familie', 'Sicherung']);
  fs.rmSync(root, { recursive: true, force: true });
});

test('folder browser blocks traversal and symlinks outside /share root', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gcb-folders-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'gcb-outside-'));
  fs.symlinkSync(outside, path.join(root, 'escape'));

  assert.throws(() => listFolders(outside, root), /außerhalb/);
  assert.deepEqual(listFolders(root, root).folders, []);
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
});

test('QNAP service locates both merged and architecture-specific Node paths', () => {
  const service = fs.readFileSync(path.join(__dirname, '../qpkg/shared/GoogleCalendarBackup.sh'), 'utf8');
  assert.match(service, /\$QPKG_ROOT\/bin\/node/);
  assert.match(service, /\$QPKG_ROOT\/x86_64\/bin\/node/);
  assert.match(service, /health_check/);
  assert.match(service, /j\.version===e/);
  assert.match(service, /stop_stale_processes/);
});

test('folder browser uses a QTS-proxy-safe POST request', () => {
  const client = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
  const server = fs.readFileSync(path.join(__dirname, '../src/server.js'), 'utf8');
  assert.match(client, /request\('\/api\/folders',\s*\{\s*method: 'POST'/s);
  assert.match(server, /pathname === '\/api\/folders' && req\.method === 'POST'/);
  assert.match(server, /version: APP_VERSION/);
});
