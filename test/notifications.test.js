'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { TEST_WARNING, writeQuLogWarning, sendTestWarning } = require('../src/notifications');
const { loadHistory } = require('../src/history');

test('test warning uses the watchdog warning severity and waits for QuLog completion', async () => {
  let complete;
  let resolved = false;
  const pending = writeQuLogWarning(TEST_WARNING, (tool, args, options, callback) => {
    assert.equal(tool, '/sbin/log_tool');
    assert.equal(args[0], '-t1');
    assert.equal(args.at(-1), `[Google Calendar Backup] ${TEST_WARNING}`);
    assert.equal(options.timeout, 5000);
    complete = callback;
  }).then(() => { resolved = true; });
  await Promise.resolve();
  assert.equal(resolved, false);
  complete(null);
  await pending;
  assert.equal(resolved, true);
});

test('missing tool, nonzero exit and timeout do not report successful submission', async () => {
  for (const code of ['ENOENT', 1, 'ETIMEDOUT']) {
    await assert.rejects(writeQuLogWarning(TEST_WARNING, (tool, args, options, callback) => callback(Object.assign(new Error('failure'), { code }))), /nicht an QuLog/);
  }
});

test('manual warning is retained privately without altering backup or watchdog state', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcb-notifications-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'config.json'), 'config unchanged');
  fs.writeFileSync(path.join(dir, 'watchdog-state.json'), 'watchdog unchanged');
  const messages = [];
  const result = await sendTestWarning(dir, { writeWarning: async message => messages.push(message) });
  assert.deepEqual(messages, [TEST_WARNING]);
  assert.equal(result.qulogAccepted, true);
  assert.equal(result.historySaved, true);
  assert.match(result.message, /Zustellung.*prüfen/);
  assert.equal(loadHistory(dir)[0].source, 'Testwarnung');
  assert.match(loadHistory(dir)[0].error, /TESTWARNUNG/);
  assert.equal(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'), 'config unchanged');
  assert.equal(fs.readFileSync(path.join(dir, 'watchdog-state.json'), 'utf8'), 'watchdog unchanged');
});

test('QuLog failure writes no success entry; history failure reports accepted warning honestly', async () => {
  await assert.rejects(sendTestWarning('/unused', { writeWarning: async () => { throw new Error('QuLog failed'); }, record: () => assert.fail('must not record a sent test') }), /QuLog failed/);
  const result = await sendTestWarning('/unused', { writeWarning: async () => {}, record: () => { throw new Error('disk full'); } });
  assert.equal(result.qulogAccepted, true);
  assert.equal(result.historySaved, false);
  assert.match(result.message, /nicht.*Fehlerhistorie/);
});

test('button sends one proxy POST, stays disabled while pending and displays success or failure', async () => {
  for (const ok of [true, false]) {
    const elements = new Map();
    const element = selector => {
      if (!elements.has(selector)) {
        const classes = new Set();
        elements.set(selector, { disabled: false, textContent: '', handlers: {}, classes,
          addEventListener(type, handler) { this.handlers[type] = handler; },
          classList: { toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); }, remove(name) { classes.delete(name); }, add(name) { classes.add(name); } } });
      }
      return elements.get(selector);
    };
    let finish;
    const calls = [];
    const context = vm.createContext({
      document: { querySelector: element, addEventListener() {} },
      setTimeout: () => 1, clearTimeout() {},
      fetch: (url, options) => { calls.push({ url, options }); return new Promise(resolve => { finish = resolve; }); }
    });
    const source = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8').replace(/\nloadApp\(\);\s*$/, '');
    vm.runInContext(source, context);
    vm.runInContext('updateStatus = async () => {};', context);
    const button = element('#testWarning');
    const pending = button.handlers.click();
    assert.equal(button.disabled, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/GoogleCalendarBackup/api/test-warning');
    assert.equal(calls[0].options.method, 'POST');
    finish({ ok, status: ok ? 200 : 503, json: async () => ok ? { message: 'Testwarnung an QuLog übergeben.', historySaved: true } : { error: 'QuLog nicht verfügbar.' } });
    await pending;
    assert.equal(button.disabled, false);
    assert.equal(element('#notice').textContent, ok ? 'Testwarnung an QuLog übergeben.' : 'QuLog nicht verfügbar.');
    assert.equal(element('#notice').classes.has('error'), !ok);
  }
});
