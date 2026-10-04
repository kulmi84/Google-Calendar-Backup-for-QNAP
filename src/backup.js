'use strict';

const fs = require('node:fs');
const https = require('node:https');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pipeline } = require('node:stream/promises');
const crypto = require('node:crypto');
const { validateIcsFile, checkTarget, MAX_BYTES } = require('./snapshot');
const { recordError, safeError } = require('./history');
const { assertSharePath } = require('./folders');

function timestamp(date = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

function safeName(name) {
  const normalized = String(name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const cleaned = normalized.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return cleaned || 'Kalender';
}

function validateCalendarUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Ungültige Kalenderadresse');
  }
  if (url.protocol !== 'https:' || url.hostname !== 'calendar.google.com' || !url.pathname.startsWith('/calendar/ical/')) {
    throw new Error('Nur private Google-Kalenderadressen über HTTPS sind erlaubt');
  }
  return url;
}

function download(url, destination, redirects = 3) {
  return new Promise((resolve, reject) => {
    let responseStream;
    const request = https.get(url, { timeout: 30000, headers: { 'User-Agent': 'Google-Calendar-Backup-for-QNAP/0.1' } }, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location && redirects > 0) {
        response.resume();
        try {
          const next = validateCalendarUrl(new URL(response.headers.location, url).toString());
          resolve(download(next, destination, redirects - 1));
        } catch (error) {
          reject(error);
        }
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Google antwortete mit HTTP ${response.statusCode}`));
        return;
      }

      const output = fs.createWriteStream(destination, { mode: 0o600, flags: 'wx' });
      responseStream = response;
      let bytes = 0;
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > MAX_BYTES) response.destroy(new Error('Kalenderdatei ist größer als 50 MB'));
      });
      pipeline(response, output).then(() => resolve(bytes), reject);
    });
    request.on('timeout', () => request.destroy(new Error('Zeitüberschreitung beim Kalenderabruf')));
    request.on('error', error => responseStream ? responseStream.destroy(error) : reject(error));
  });
}

function appendLog(targetDir, message) {
  const line = `${new Date().toISOString()} ${message}\n`;
  const file = path.join(targetDir, 'backup.log');
  fs.appendFileSync(file, line, { mode: 0o644 });
  fs.chmodSync(file, 0o644);
}

function qulog(type, message) {
  const tool = '/sbin/log_tool';
  if (!fs.existsSync(tool)) return;
  const child = spawn(tool, [`-t${type}`, '-uSystem', '-p127.0.0.1', '-mlocalhost', '-a', `[Google Calendar Backup] ${message}`], {
    detached: true,
    stdio: 'ignore'
  });
  child.unref();
  child.on('error', () => {});
}

function removeExpired(targetDir, prefix, retentionDays, now = Date.now()) {
  const cutoff = now - retentionDays * 86400000;
  for (const entry of fs.readdirSync(targetDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.startsWith(`${prefix}_`) || !/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.ics$/.test(entry.name.slice(prefix.length + 1))) continue;
    const file = path.join(targetDir, entry.name);
    if (fs.statSync(file).mtimeMs < cutoff) fs.unlinkSync(file);
  }
}

async function backupCalendar(calendar, config, runStamp = timestamp(), options = {}) {
  const targetDir = path.resolve(config.targetDir);
  const prefix = safeName(calendar.name);
  const finalFile = path.join(targetDir, `${prefix}_${runStamp}.ics`);
  const tempFile = `${finalFile}.${crypto.randomUUID()}.tmp`;

  try {
    if (options.qnapMode) assertSharePath(targetDir, '/share', '/etc/config/smb.conf', true);
    fs.mkdirSync(targetDir, { recursive: true, mode: 0o755 });
    (options.checkTarget || checkTarget)(targetDir, { writeProbe: true });
    const url = validateCalendarUrl(calendar.url);
    await (options.download || download)(url, tempFile);
    validateIcsFile(tempFile);
    const fd = fs.openSync(tempFile, 'r');
    try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.chmodSync(tempFile, 0o644);
    fs.renameSync(tempFile, finalFile);
    // Maintenance/logging errors must not hide an already committed snapshot.
    const warnings = [];
    try { removeExpired(targetDir, prefix, config.retentionDays); } catch (error) { warnings.push(`Aufbewahrung: ${safeError(error)}`); }
    const message = `Kalender ${calendar.name} erfolgreich gesichert: ${path.basename(finalFile)}`;
    try { appendLog(targetDir, message); } catch (error) { warnings.push(`Protokoll: ${safeError(error)}`); }
    qulog(0, message);
    for (const warning of warnings) {
      qulog(1, `Kalender ${calendar.name}: ${warning}`);
      try { recordError(options.dataDir, { source: 'Wartung', calendarId: calendar.id, name: calendar.name, error: warning }); } catch { qulog(2, 'Fehlerhistorie konnte nicht gespeichert werden.'); }
    }
    return { id: calendar.id, name: calendar.name, ok: true, file: finalFile, warnings };
  } catch (error) {
    try { fs.unlinkSync(tempFile); } catch {}
    const detail = safeError(error);
    const message = `Fehler beim Sichern von ${calendar.name}: ${detail}`;
    try { appendLog(targetDir, message); } catch {}
    qulog(2, message);
    try { recordError(options.dataDir, { source: 'Sicherung', calendarId: calendar.id, name: calendar.name, error: detail }); } catch { qulog(2, 'Fehlerhistorie konnte nicht gespeichert werden.'); }
    return { id: calendar.id, name: calendar.name, ok: false, error: detail };
  }
}

async function runBackup(config, options = {}) {
  const startedAt = new Date().toISOString();
  const runStamp = timestamp();
  const results = [];
  for (const calendar of config.calendars) results.push(await backupCalendar(calendar, config, runStamp, options));
  return { startedAt, results, complete: results.every(result => result.ok) };
}

module.exports = { backupCalendar, removeExpired, runBackup, safeName, timestamp, validateCalendarUrl, qulog, download };
