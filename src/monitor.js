'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { safeName } = require('./backup');
const { validateIcsFile, checkTarget } = require('./snapshot');
const { assertSharePath } = require('./folders');
const MAX_AGE = 26 * 3600000;

function latestBackup(targetDir, name, now = Date.now()) {
  const prefix = `${safeName(name)}_`;
  const candidates = [];
  for (const filename of fs.readdirSync(targetDir)) {
    if (!filename.startsWith(prefix) || !/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.ics$/.test(filename.slice(prefix.length))) continue;
    const file = path.join(targetDir, filename);
    let stat;
    try { stat = fs.lstatSync(file); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (stat.isFile() && stat.mtimeMs <= now) candidates.push({ file, at: stat.mtimeMs });
  }
  candidates.sort((a, b) => b.at - a.at);
  for (const candidate of candidates) {
    try { validateIcsFile(candidate.file); return candidate.at; }
    catch (error) { if (['EACCES', 'EPERM', 'EIO'].includes(error.code)) throw error; }
  }
  return null;
}

function monitor(config, now = Date.now(), { writeProbe = false, qnapMode = false } = {}) {
  let storage;
  try {
    if (qnapMode) assertSharePath(config.targetDir);
    storage = checkTarget(config.targetDir, { writeProbe });
  }
  catch (error) { storage = { ok: false, error: error.code === 'ENOENT' ? 'Zielordner ist nicht vorhanden.' : error.message }; }
  const names = config.calendars.map(calendar => safeName(calendar.name).toLowerCase());
  const calendars = config.calendars.map(calendar => {
    let latest = null;
    let error = '';
    try {
      if (names.filter(name => name === safeName(calendar.name).toLowerCase()).length > 1) error = 'Dateinamen sind nicht eindeutig.';
      else latest = latestBackup(config.targetDir, calendar.name, now);
    } catch { error = 'Zielordner oder Sicherungsdateien sind nicht lesbar.'; }
    const ageHours = latest === null ? null : (now - latest) / 3600000;
    return { id: calendar.id, name: calendar.name, lastBackupAt: latest === null ? null : new Date(latest).toISOString(),
      ageHours, state: error ? 'error' : latest === null ? 'missing' : now - latest > MAX_AGE ? 'stale' : 'fresh', error };
  });
  return { checkedAt: new Date(now).toISOString(), storage, calendars,
    complete: storage.ok && calendars.length > 0 && calendars.every(calendar => calendar.state === 'fresh') };
}

module.exports = { monitor, latestBackup, MAX_AGE };
