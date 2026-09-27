'use strict';

const fs = require('node:fs');
const path = require('node:path');

function withinRoot(candidate, root) {
  return candidate === root || candidate.startsWith(root + path.sep);
}

function listFolders(requested = '/share', root = '/share') {
  const base = path.resolve(root);
  const current = path.resolve(requested || base);
  if (!withinRoot(current, base)) throw new Error('Ordner liegt außerhalb von /share');

  // QNAP-Freigaben können Symlinks auf Volumes unter /share sein. Das reale
  // Ziel muss trotzdem innerhalb des erlaubten Verzeichnisbaums bleiben.
  const realBase = fs.realpathSync(base);
  const realCurrent = fs.realpathSync(current);
  if (!withinRoot(realCurrent, realBase)) throw new Error('Ordner liegt außerhalb von /share');
  if (!fs.statSync(current).isDirectory()) throw new Error('Kein Verzeichnis');

  const folders = [];
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || /^CACHEDEV\d+_DATA$/.test(entry.name)) continue;
    const child = path.join(current, entry.name);
    try {
      if (!withinRoot(fs.realpathSync(child), realBase)) continue;
      if (fs.statSync(child).isDirectory()) folders.push({ name: entry.name, path: child });
    } catch {
      // Nicht lesbare oder inzwischen entfernte Einträge ausblenden.
    }
  }
  folders.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return { path: current, parent: current === base ? null : path.dirname(current), folders };
}

module.exports = { listFolders };
