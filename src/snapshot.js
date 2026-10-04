'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const MAX_BYTES = 50 * 1024 * 1024;
const MIN_FREE_BYTES = MAX_BYTES + 10 * 1024 * 1024;

function validateIcs(content) {
  if (!content.length || content.length > MAX_BYTES) throw new Error('ICS-Datei ist leer oder größer als 50 MB');
  const text = content.toString('utf8').replace(/^\uFEFF/, '').replace(/\r\n[ \t]|\n[ \t]/g, '');
  const lines = text.trim().split(/\r?\n/);
  if (lines[0] !== 'BEGIN:VCALENDAR' || lines.at(-1) !== 'END:VCALENDAR') throw new Error('ICS-Datei ist unvollständig oder keine iCalendar-Datei');
  const stack = [];
  let version = false;
  let roots = 0;
  for (const line of lines) {
    if (line.startsWith('BEGIN:')) {
      if (!/^[A-Z0-9-]+$/.test(line.slice(6)) || (line === 'BEGIN:VCALENDAR' && stack.length)) throw new Error('Ungültige ICS-Komponenten');
      stack.push(line.slice(6));
      if (stack.length === 1 && ++roots > 1) throw new Error('ICS-Datei enthält mehrere Kalender');
    } else if (line.startsWith('END:')) {
      if (stack.pop() !== line.slice(4)) throw new Error('ICS-Komponenten sind nicht vollständig geschlossen');
    } else if (line && (!stack.length || !/^[A-Za-z0-9-]+(?:;[^:]*)?:/.test(line))) {
      throw new Error('Ungültige ICS-Inhaltszeile');
    }
    if (stack.length === 1 && line === 'VERSION:2.0') version = true;
  }
  if (stack.length || !version) throw new Error('ICS-Datei benötigt VERSION:2.0 und vollständige Komponenten');
  return true;
}

function validateIcsFile(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.size === 0 || stat.size > MAX_BYTES) throw new Error('Keine gültige ICS-Datei');
  return validateIcs(fs.readFileSync(file));
}

function checkTarget(targetDir, { writeProbe = false, statfs = fs.statfsSync } = {}) {
  if (!fs.statSync(targetDir).isDirectory()) throw new Error('Ziel ist kein Ordner');
  fs.accessSync(targetDir, fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK);
  const disk = statfs(targetDir);
  const freeBytes = Number(disk.bavail) * Number(disk.bsize);
  if (!Number.isFinite(freeBytes)) throw new Error('Freier Speicherplatz kann nicht ermittelt werden');
  if (freeBytes < MIN_FREE_BYTES) throw new Error('Zu wenig freier Speicherplatz: mindestens 60 MiB erforderlich');
  if (writeProbe) {
    const probe = path.join(targetDir, `.gcb-write-${crypto.randomUUID()}.tmp`);
    try { fs.writeFileSync(probe, '', { mode: 0o600, flag: 'wx' }); }
    finally { try { fs.unlinkSync(probe); } catch {} }
  }
  return { ok: true, freeBytes };
}

module.exports = { validateIcs, validateIcsFile, checkTarget, MAX_BYTES, MIN_FREE_BYTES };
