'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function safeError(error) {
  return String(error?.message || error).replace(/https?:\/\/[^\s]+/gi, '[Adresse ausgeblendet]').slice(0, 500);
}

function loadHistory(dataDir) {
  try {
    const dir = path.join(dataDir, 'error-history');
    return fs.readdirSync(dir).filter(name => name.endsWith('.json')).sort().slice(-100).flatMap(name => {
      try { return [JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'))]; }
      catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

function recordError(dataDir, entry) {
  if (!dataDir) return;
  const dir = path.join(dataDir, 'error-history');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, `${Date.now()}-${crypto.randomUUID()}.json`);
  const temp = `${file}.tmp`;
  const item = { at: new Date().toISOString(), source: entry.source, calendarId: entry.calendarId,
    name: entry.name, error: safeError(entry.error) };
  try {
    fs.writeFileSync(temp, `${JSON.stringify(item)}\n`, { mode: 0o600 });
    fs.renameSync(temp, file);
  } finally { try { fs.unlinkSync(temp); } catch {} }
  for (const name of fs.readdirSync(dir).filter(name => name.endsWith('.json')).sort().slice(0, -100)) {
    try { fs.unlinkSync(path.join(dir, name)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

module.exports = { safeError, loadHistory, recordError };
