'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { MAX_RUNS, loadRuns, recentRuns, recordRun } = require('../src/runs');

test('visible history contains only the last 14 days, newest first', () => {
  const now = Date.UTC(2026, 10, 22, 12);
  const runs = [20, 15, 14, 3, 0].map(days => ({ startedAt: new Date(now - days * 86400000).toISOString() }));
  assert.deepEqual(recentRuns(runs, now).map(run => run.startedAt), [0, 3, 14].map(days => new Date(now - days * 86400000).toISOString()));
});

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcb-runs-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const run = {
  startedAt: '2026-11-22T02:15:00.000Z',
  finishedAt: '2026-11-22T02:15:13.000Z',
  results: [
    { id: 'a', name: 'Privat', ok: true, file: '/share/Sicherung/Google_Kalender/Privat_2026-11-22_03-15-00.ics', warnings: [] },
    { id: 'b', name: 'Familie', ok: false, error: 'Fehler bei https://calendar.google.com/calendar/ical/x/private-secret/basic.ics' }
  ]
};

test('run history stores a private summary that survives a restart', t => {
  const dir = tempDir(t);
  assert.deepEqual(loadRuns(dir), []);
  const entry = recordRun(dir, run, 'schedule');
  assert.equal(entry.trigger, 'schedule');
  assert.equal(entry.complete, false);
  assert.equal(entry.results[0].file, 'Privat_2026-11-22_03-15-00.ics');
  const stored = fs.readFileSync(path.join(dir, 'run-history.json'), 'utf8');
  assert.doesNotMatch(stored, /private-secret|\/share\//);
  if (process.platform !== 'win32') assert.equal(fs.statSync(path.join(dir, 'run-history.json')).mode & 0o777, 0o600);
  assert.deepEqual(loadRuns(dir), [JSON.parse(JSON.stringify(entry))]);
  assert.equal(recordRun(dir, run, 'anything').trigger, 'manual');
});

test('run history keeps only the latest runs and recovers from a damaged file', t => {
  const dir = tempDir(t);
  fs.writeFileSync(path.join(dir, 'run-history.json'), '{kaputt');
  assert.throws(() => loadRuns(dir));
  for (let index = 0; index < MAX_RUNS + 5; index++) {
    recordRun(dir, { ...run, startedAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString() }, 'manual');
  }
  const runs = loadRuns(dir);
  assert.equal(runs.length, MAX_RUNS);
  assert.equal(runs[0].startedAt, new Date(Date.UTC(2026, 0, 1, 0, 5)).toISOString());
  assert.equal(fs.readdirSync(dir).some(name => name.endsWith('.tmp')), false);
});
