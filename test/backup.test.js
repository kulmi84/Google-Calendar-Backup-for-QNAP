'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { removeExpired, safeName, timestamp, validateCalendarUrl } = require('../src/backup');
const { hashPassword, verifyPassword } = require('../src/config');

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

test('password hashes verify without storing plaintext', () => {
  const record = hashPassword('ein-langes-test-passwort');
  assert.equal(verifyPassword('ein-langes-test-passwort', record), true);
  assert.equal(verifyPassword('falsch', record), false);
  assert.equal(JSON.stringify(record).includes('ein-langes-test-passwort'), false);
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
