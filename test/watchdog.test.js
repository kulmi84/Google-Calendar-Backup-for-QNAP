'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { checkWatchdog, MAX_AGE } = require('../src/watchdog');

const NOW = Date.parse('2026-10-04T12:00:00Z');
function fixture(t, calendars = [{ id: 'a', name: 'Privat', url: 'secret-url' }]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcb-watchdog-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const targetDir = path.join(dir, 'backups');
  fs.mkdirSync(targetDir);
  const config = { targetDir, calendars };
  const save = () => fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(config));
  save();
  const messages = [];
  const check = (now = NOW) => checkWatchdog(dir, { now, report: (type, message) => messages.push({ type, message }) });
  const backup = (name = 'Privat', age = 0, content = 'BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR', suffix = '.ics') => {
    const file = path.join(targetDir, `${name}_2026-10-04_03-15-00${suffix}`);
    fs.writeFileSync(file, content);
    fs.utimesSync(file, new Date(NOW - age), new Date(NOW - age));
    return file;
  };
  return { dir, targetDir, config, save, messages, check, backup };
}

test('fresh and exactly 26-hour-old backups are healthy', t => {
  const f = fixture(t);
  f.backup('Privat', MAX_AGE);
  assert.equal(f.check()[0].ok, true);
  assert.equal(f.check()[0].latest, NOW - MAX_AGE);
  assert.deepEqual(f.messages, []);
});

test('stale backups warn once daily and report recovery', t => {
  const f = fixture(t);
  f.backup('Privat', MAX_AGE + 1);
  assert.equal(f.check()[0].ok, false);
  f.check(NOW + 3600000);
  assert.equal(f.messages.length, 1);
  f.check(NOW + 24 * 3600000);
  assert.equal(f.messages.length, 2);
  f.backup();
  assert.equal(f.check()[0].ok, true);
  assert.equal(f.messages.at(-1).type, 0);
  f.check();
  assert.equal(f.messages.length, 3);
  const state = fs.readFileSync(path.join(f.dir, 'watchdog-state.json'), 'utf8');
  assert.equal(state.includes('secret-url'), false);
  assert.equal(fs.readFileSync(path.join(f.dir, 'watchdog.log'), 'utf8').includes('secret-url'), false);
});

test('missing backups receive one initial 26-hour grace period across processes', t => {
  const f = fixture(t);
  assert.equal(f.check()[0].ok, true);
  assert.equal(f.check(NOW + MAX_AGE - 1)[0].ok, true);
  assert.equal(f.check(NOW + MAX_AGE)[0].ok, false);
  assert.equal(f.messages.length, 1);
});

test('another calendar, invalid ICS, temp file, symlink and future mtime cannot mask missing backup', t => {
  const f = fixture(t);
  f.backup('Andere');
  f.backup('Privat', 0, 'error page');
  f.backup('Privat', 0, 'BEGIN:VCALENDAR', '.ics.tmp');
  fs.symlinkSync(path.join(f.targetDir, 'Andere_2026-10-04_03-15-00.ics'), path.join(f.targetDir, 'Privat_2026-10-03_03-15-00.ics'));
  f.check();
  assert.equal(f.check(NOW + MAX_AGE)[0].ok, false);
  f.backup('Privat', -2 * MAX_AGE);
  assert.equal(f.check(NOW + MAX_AGE)[0].ok, false);
});

test('checks every calendar separately', t => {
  const f = fixture(t, [{ id: 'a', name: 'Privat' }, { id: 'b', name: 'Familie' }]);
  f.backup();
  f.backup('Familie', MAX_AGE + 1);
  assert.deepEqual(f.check().map(result => result.ok), [true, false]);
  assert.equal(f.messages.length, 1);
  assert.match(f.messages[0].message, /Familie/);
});

test('missing target is warned without recreating target folder', t => {
  const f = fixture(t);
  fs.rmdirSync(f.targetDir);
  assert.equal(f.check()[0].ok, false);
  assert.equal(fs.existsSync(f.targetDir), false);
});

test('colliding filename prefixes are not silently treated as healthy', t => {
  const f = fixture(t, [{ id: 'a', name: 'Privat!' }, { id: 'b', name: 'Privat?' }]);
  assert.deepEqual(f.check().map(result => result.ok), [false, false]);
  assert.equal(f.messages.length, 2);
});

test('new calendars get grace; removed calendars leave no stale monitoring state', t => {
  const f = fixture(t);
  f.check();
  f.config.calendars = [{ id: 'new', name: 'Neu' }];
  f.save();
  assert.equal(f.check(NOW + 2 * MAX_AGE)[0].ok, true);
  f.config.calendars = [];
  f.save();
  assert.deepEqual(f.check(), []);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.dir, 'watchdog-state.json'))), {});
});

test('unconfigured install is quiet, broken or lost configuration is warned', t => {
  const f = fixture(t);
  const file = path.join(f.dir, 'config.json');
  fs.unlinkSync(file);
  assert.deepEqual(f.check(), []);
  assert.deepEqual(f.messages, []);
  f.save();
  f.check();
  fs.unlinkSync(file);
  assert.equal(f.check()[0].ok, false);
  fs.writeFileSync(file, '{invalid');
  f.check();
  assert.equal(f.messages.length, 1);
});

test('cron registration is idempotent and uninstall preserves unrelated tasks', t => {
  const f = fixture(t);
  const cron = path.join(f.dir, 'crontab');
  const original = '0 3 * * * /some/other/task\n# other comment\n';
  fs.writeFileSync(cron, original);
  const service = fs.readFileSync(path.join(__dirname, '../qpkg/shared/GoogleCalendarBackup.sh'), 'utf8');
  const routine = service.slice(service.indexOf('watchdog_cron()'), service.indexOf('run_watchdog()'))
    .replace('CRON_FILE=/etc/config/crontab', `CRON_FILE='${cron}'`)
    .replace('/etc/config/gcb-watchdog-cron.XXXXXX', `${f.dir}/cron.XXXXXX`);
  const run = action => execFileSync('/bin/sh', ['-c', `set -e\ncrontab() { test -r "$1"; }\n${routine}\nwatchdog_cron ${action}`]);
  run('register');
  run('register');
  const installed = fs.readFileSync(cron, 'utf8');
  assert.equal(installed.startsWith(original), true);
  assert.equal(installed.split(' # GoogleCalendarBackup-Watchdog').length - 1, 1);
  run('remove');
  assert.equal(fs.readFileSync(cron, 'utf8'), original);
  run('remove');
  assert.equal(fs.readFileSync(cron, 'utf8'), original);
  assert.match(service, /watchdog\) run_watchdog/);
  assert.match(service, /remove\) watchdog_cron remove/);
});
