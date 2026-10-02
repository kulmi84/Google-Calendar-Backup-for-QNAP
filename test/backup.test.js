'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
const { removeExpired, safeName, timestamp, validateCalendarUrl } = require('../src/backup');
const { importLegacyCalendars } = require('../src/config');
const { assertSharePath, listFolders } = require('../src/folders');

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

test('folder browser lists only configured QNAP shares and their safe subfolders', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gcb-folders-'));
  const volume = path.join(root, 'CACHEDEV1_DATA');
  fs.mkdirSync(volume);
  fs.mkdirSync(path.join(volume, 'Sicherung'));
  fs.mkdirSync(path.join(volume, 'Familie'));
  fs.mkdirSync(path.join(volume, 'Sicherung', 'Kalender'));
  fs.symlinkSync(path.join(volume, 'Sicherung'), path.join(root, 'Sicherung'));
  fs.symlinkSync(path.join(volume, 'Familie'), path.join(root, 'Familie'));
  fs.mkdirSync(path.join(root, '.hidden'));
  fs.mkdirSync(path.join(root, 'HDA_DATA'));
  fs.writeFileSync(path.join(root, 'not-a-folder.txt'), 'x');
  const config = path.join(root, 'smb.conf');
  fs.writeFileSync(config, `[global]\npath = ${root}\n[Sicherung]\npath = ${path.join(volume, 'Sicherung')}\n[Familie]\npath = ${path.join(volume, 'Familie')}\n[Offline]\npath = ${path.join(root, 'missing')}\n[HDA_DATA]\npath = ${root}\n`);

  const result = listFolders(root, root, config);
  assert.equal(result.parent, null);
  assert.deepEqual(result.folders.map(item => item.name), ['Familie', 'Sicherung']);
  assert.deepEqual(listFolders(path.join(root, 'Sicherung'), root, config).folders.map(item => item.name), ['Kalender']);
  assert.equal(listFolders(path.join(root, 'Sicherung'), root, config).parent, root);
  assert.equal(assertSharePath(path.join(root, 'Sicherung', 'Kalender', 'Neu'), root, config, true), path.join(root, 'Sicherung', 'Kalender', 'Neu'));
  assert.throws(() => listFolders(path.join(root, 'HDA_DATA'), root, config), /keine konfigurierte/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('folder browser blocks traversal and symlinks outside /share root', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gcb-folders-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'gcb-outside-'));
  const share = path.join(root, 'Freigabe');
  fs.mkdirSync(share);
  fs.symlinkSync(outside, path.join(share, 'escape'));
  const config = path.join(root, 'smb.conf');
  fs.writeFileSync(config, `[Freigabe]\npath = ${share}\n`);

  assert.throws(() => listFolders(outside, root, config), /außerhalb/);
  assert.deepEqual(listFolders(share, root, config).folders, []);
  assert.throws(() => assertSharePath(path.join(share, 'escape'), root, config), /verlässt/);
  assert.throws(() => assertSharePath(path.join(share, 'escape', 'new'), root, config, true), /verlässt/);
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

test('last backup date always uses two-digit day and month', () => {
  const client = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
  const formatter = client.match(/function formatDateTime\(value\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(formatter, 'formatDateTime function is missing');
  const formatted = vm.runInNewContext(`${formatter}; formatDateTime(new Date(2026, 9, 2, 3, 15, 8))`);
  assert.equal(formatted, '02.10.2026, 03:15:08');
  assert.doesNotMatch(client, /toLocaleString\('de-DE'\)/);
});
