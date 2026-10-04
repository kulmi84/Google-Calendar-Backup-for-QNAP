'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { safeName, qulog } = require('./backup');
const MAX_AGE = 26 * 3600000;
const REPEAT_AFTER = 24 * 3600000;

// No HTTP, downloads or dependency on the running application service.
function latestBackup(targetDir, name, now) {
  const prefix = `${safeName(name)}_`;
  let latest = null;
  for (const filename of fs.readdirSync(targetDir)) {
    if (!filename.startsWith(prefix) || !/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.ics$/.test(filename.slice(prefix.length))) continue;
    const file = path.join(targetDir, filename);
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.size === 0 || stat.mtimeMs > now) continue;
    const fd = fs.openSync(file, 'r');
    let valid;
    try {
      const buffer = Buffer.alloc(4096);
      const length = fs.readSync(fd, buffer, 0, buffer.length, 0);
      valid = buffer.subarray(0, length).toString('utf8').includes('BEGIN:VCALENDAR');
    } finally { fs.closeSync(fd); }
    if (valid && (latest === null || stat.mtimeMs > latest)) latest = stat.mtimeMs;
  }
  return latest;
}

function checkWatchdog(dataDir, { now = Date.now(), report = qulog } = {}) {
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const stateFile = path.join(dataDir, 'watchdog-state.json');
  let previous = {};
  try { previous = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const state = {};
  const results = [];
  function warning(key, message, firstSeen = now) {
    const old = previous[key] || {};
    state[key] = { firstSeen, warnedAt: old.warnedAt };
    if (!old.warnedAt || now - old.warnedAt >= REPEAT_AFTER) {
      report(1, `Watchdog: ${message}`);
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
    const names = config.calendars.map(calendar => safeName(calendar.name));
    for (const calendar of config.calendars) {
      // Keep URLs out of logs/state, and grant newly configured calendars one interval.
      const key = crypto.createHash('sha256').update(JSON.stringify([calendar.id, calendar.name, calendar.url, config.targetDir])).digest('hex');
      const old = previous[key] || {};
      const firstSeen = old.firstSeen ?? now;
      state[key] = { firstSeen };
      let latest = null;
      let problem = '';
      try {
        if (names.filter(name => name === safeName(calendar.name)).length > 1) {
          problem = 'Dateinamen sind nicht eindeutig; bitte unterschiedliche Kalendernamen verwenden.';
        } else latest = latestBackup(config.targetDir, calendar.name, now);
      } catch {
        problem = 'Zielordner oder Sicherungsdateien sind nicht lesbar.';
      }
      if (problem || (latest !== null ? now - latest > MAX_AGE : now - firstSeen >= MAX_AGE)) {
        warning(key, `Kalender ${calendar.name}: ${problem || 'Keine erfolgreiche ICS-Sicherung innerhalb der letzten 26 Stunden gefunden.'}`, firstSeen);
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
