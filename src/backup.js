'use strict';

const fs = require('node:fs');
const https = require('node:https');
const path = require('node:path');
const { spawn } = require('node:child_process');

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

      const output = fs.createWriteStream(destination, { mode: 0o600 });
      let bytes = 0;
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 50 * 1024 * 1024) request.destroy(new Error('Kalenderdatei ist größer als 50 MB'));
      });
      response.pipe(output);
      output.on('finish', () => output.close(() => resolve(bytes)));
      output.on('error', reject);
    });
    request.on('timeout', () => request.destroy(new Error('Zeitüberschreitung beim Kalenderabruf')));
    request.on('error', reject);
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
}

function removeExpired(targetDir, prefix, retentionDays, now = Date.now()) {
  const cutoff = now - retentionDays * 86400000;
  for (const entry of fs.readdirSync(targetDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.startsWith(`${prefix}_`) || !entry.name.endsWith('.ics')) continue;
    const file = path.join(targetDir, entry.name);
    if (fs.statSync(file).mtimeMs < cutoff) fs.unlinkSync(file);
  }
}

async function backupCalendar(calendar, config, runStamp = timestamp()) {
  const targetDir = path.resolve(config.targetDir);
  fs.mkdirSync(targetDir, { recursive: true, mode: 0o755 });
  const prefix = safeName(calendar.name);
  const finalFile = path.join(targetDir, `${prefix}_${runStamp}.ics`);
  const tempFile = `${finalFile}.tmp`;

  try {
    const url = validateCalendarUrl(calendar.url);
    await download(url, tempFile);
    const header = fs.readFileSync(tempFile, { encoding: 'utf8', flag: 'r' }).slice(0, 4096);
    if (!header.includes('BEGIN:VCALENDAR')) throw new Error('Antwort ist keine gültige iCalendar-Datei');
    fs.renameSync(tempFile, finalFile);
    fs.chmodSync(finalFile, 0o644);
    removeExpired(targetDir, prefix, config.retentionDays);
    const message = `Kalender ${calendar.name} erfolgreich gesichert: ${path.basename(finalFile)}`;
    appendLog(targetDir, message);
    qulog(0, message);
    return { id: calendar.id, name: calendar.name, ok: true, file: finalFile };
  } catch (error) {
    try { fs.unlinkSync(tempFile); } catch {}
    const message = `Fehler beim Sichern von ${calendar.name}: ${error.message}`;
    appendLog(targetDir, message);
    qulog(2, message);
    return { id: calendar.id, name: calendar.name, ok: false, error: error.message };
  }
}

async function runBackup(config) {
  const runStamp = timestamp();
  const results = [];
  for (const calendar of config.calendars) results.push(await backupCalendar(calendar, config, runStamp));
  return { startedAt: new Date().toISOString(), results };
}

module.exports = { backupCalendar, removeExpired, runBackup, safeName, timestamp, validateCalendarUrl };
