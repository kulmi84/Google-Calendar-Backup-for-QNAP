'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { qulog } = require('./backup');
const { latestBackup, MAX_AGE, monitor } = require('./monitor');
const { recordError } = require('./history');
const REPEAT_AFTER = 24 * 3600000;

// No HTTP, downloads or dependency on the running application service.
function checkWatchdog(dataDir, { now = Date.now(), report = qulog } = {}) {
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const stateFile = path.join(dataDir, 'watchdog-state.json');
  let previous = {};
  try { previous = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const state = {};
  const results = [];
  function warning(key, message, firstSeen = now, calendar) {
    const old = previous[key] || {};
    state[key] = { firstSeen, warnedAt: old.warnedAt };
    if (!old.warnedAt || now - old.warnedAt >= REPEAT_AFTER) {
      report(1, `Watchdog: ${message}`);
      recordError(dataDir, { source: 'Watchdog', calendarId: calendar?.id, name: calendar?.name, error: message });
      fs.appendFileSync(path.join(dataDir, 'watchdog.log'), `${new Date(now).toISOString()} ${message}\n`, { mode: 0o600 });
      state[key].warnedAt = now;
    }
    results.push({ key, ok: false });
  }
  let config;
  try {
    config = JSON.parse(fs.readFileSync(path.join(dataDir, 'config.json'), 'utf8'));
    if (!Array.isArray(config.calendars) || typeof config.targetDir !== 'string') throw new Error('Invalid config');
  } catch (error) {
    // An unconfigured fresh installation has nothing to monitor yet.
    if (error.code !== 'ENOENT' || Object.keys(previous).length) warning('config', 'Konfiguration kann nicht gelesen werden; Sicherungen können nicht geprüft werden.');
  }
  if (config) {
    const health = monitor(config, now, { writeProbe: true, qnapMode: process.env.GCB_QNAP_MODE === '1' });
    if (!health.storage.ok) warning('storage', `Zielordner/Speicherplatz: ${health.storage.error}`);
    else if (previous.storage?.warnedAt) report(0, 'Watchdog: Zielordner und Speicherplatz wieder verfügbar.');
    for (const [index, calendar] of config.calendars.entries()) {
      // Keep URLs out of logs/state, and grant newly configured calendars one interval.
      const key = crypto.createHash('sha256').update(JSON.stringify([calendar.id, calendar.name, calendar.url, config.targetDir])).digest('hex');
      const old = previous[key] || {};
      const firstSeen = old.firstSeen ?? now;
      state[key] = { firstSeen };
      const item = health.calendars[index];
      const latest = item.lastBackupAt === null ? null : Date.parse(item.lastBackupAt);
      const problem = item.error;
      if (problem || (latest !== null ? now - latest > MAX_AGE : now - firstSeen >= MAX_AGE)) {
        warning(key, `Kalender ${calendar.name}: ${problem || 'Keine erfolgreiche ICS-Sicherung innerhalb der letzten 26 Stunden gefunden.'}`, firstSeen, calendar);
      } else {
        if (old.warnedAt && latest !== null) report(0, `Watchdog: Kalender ${calendar.name} wieder aktuell gesichert.`);
        results.push({ key, ok: true, latest });
      }
    }
  }
  const temp = `${stateFile}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(state)}\n`, { mode: 0o600 });
  fs.renameSync(temp, stateFile);
  return results;
}

if (require.main === module) {
  try { checkWatchdog(process.env.GCB_DATA_DIR || '/etc/config/GoogleCalendarBackup'); }
  catch {
    qulog(2, 'Watchdog konnte nicht ausgeführt werden; Konfiguration und Schreibrechte prüfen.');
    process.exitCode = 1;
  }
}

module.exports = { checkWatchdog, latestBackup, MAX_AGE };
