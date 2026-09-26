'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_CONFIG = {
  version: 1,
  setupComplete: false,
  password: null,
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

function loadConfig(dataDir) {
  ensureDir(dataDir);
  const file = path.join(dataDir, 'config.json');
  if (!fs.existsSync(file)) return clone(DEFAULT_CONFIG);
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
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

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, record) {
  if (!record?.salt || !record?.hash) return false;
  const actual = Buffer.from(crypto.scryptSync(password, record.salt, 64));
  const expected = Buffer.from(record.hash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

module.exports = {
  DEFAULT_CONFIG,
  hashPassword,
  loadConfig,
  saveConfig,
  verifyPassword
};
