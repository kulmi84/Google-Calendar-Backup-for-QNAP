'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { safeError } = require('./history');

// Reicht für 14 Tage auch mit zusätzlichen manuellen Läufen.
const MAX_RUNS = 200;
const FILE = 'run-history.json';

// Nur das Nötigste speichern: keine Kalenderadressen, nur Dateinamen statt Pfade.
function summarizeRun(run, trigger) {
  const results = (run.results || []).map(result => ({
    id: result.id,
    name: String(result.name || ''),
    ok: Boolean(result.ok),
    file: result.ok && result.file ? path.basename(result.file) : undefined,
    error: result.ok ? undefined : safeError(result.error || 'Unbekannter Fehler'),
    warnings: (result.warnings || []).map(safeError)
  }));
  return {
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    trigger: trigger === 'schedule' ? 'schedule' : 'manual',
    complete: results.length > 0 && results.every(result => result.ok),
    results
  };
}

function loadRuns(dataDir) {
  try {
    const runs = JSON.parse(fs.readFileSync(path.join(dataDir, FILE), 'utf8'));
    return Array.isArray(runs) ? runs.slice(-MAX_RUNS) : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

function recordRun(dataDir, run, trigger) {
  const entry = summarizeRun(run, trigger);
  let runs;
  try { runs = loadRuns(dataDir); } catch { runs = []; } // Beschädigten Verlauf neu beginnen.
  runs = [...runs, entry].slice(-MAX_RUNS);
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const file = path.join(dataDir, FILE);
  const temp = `${file}.tmp`;
  try {
    fs.writeFileSync(temp, `${JSON.stringify(runs)}\n`, { mode: 0o600 });
    fs.renameSync(temp, file);
  } finally { try { fs.unlinkSync(temp); } catch {} }
  return entry;
}

const VISIBLE_DAYS = 14;

// Läufe der letzten 14 Tage, neueste zuerst.
function recentRuns(runs, now = Date.now(), days = VISIBLE_DAYS) {
  const cutoff = now - days * 86400000;
  return runs.filter(run => Date.parse(run.startedAt) >= cutoff).reverse();
}

module.exports = { MAX_RUNS, VISIBLE_DAYS, loadRuns, recentRuns, recordRun, summarizeRun };
