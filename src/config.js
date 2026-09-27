'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { validateCalendarUrl } = require('./backup');

const DEFAULT_CONFIG = {
  version: 1,
  targetDir: '/share/Sicherung/Google_Kalender',
  schedule: '03:15',
  retentionDays: 365,
  calendars: []
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}

function importLegacyCalendars(dir) {
  const sources = [
    ['google_calendar_url', 'Marcin'],
    ['google_calendar_url_familie', 'Familie'],
    ['google_calendar_url_doris', 'Doris']
  ];
  return sources.flatMap(([filename, name]) => {
    try {
      const url = fs.readFileSync(path.join(dir, filename), 'utf8').trim();
      validateCalendarUrl(url);
      return [{ id: crypto.randomUUID(), name, url }];
    } catch {
      return [];
    }
  });
}

function loadConfig(dataDir) {
  ensureDir(dataDir);
  const file = path.join(dataDir, 'config.json');
  if (!fs.existsSync(file)) return { ...clone(DEFAULT_CONFIG), calendars: importLegacyCalendars(dataDir) };
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  delete saved.setupComplete;
  delete saved.password;
  return { ...clone(DEFAULT_CONFIG), ...saved };
}

function saveConfig(dataDir, config) {
  ensureDir(dataDir);
  const file = path.join(dataDir, 'config.json');
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(temp, 0o600);
  fs.renameSync(temp, file);
  fs.chmodSync(file, 0o600);
}

module.exports = {
  DEFAULT_CONFIG,
  importLegacyCalendars,
  loadConfig,
  saveConfig
};
