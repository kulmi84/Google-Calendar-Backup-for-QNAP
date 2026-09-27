'use strict';

const fs = require('node:fs');
const path = require('node:path');

function withinRoot(candidate, root) {
  return candidate === root || candidate.startsWith(root + path.sep);
}

function configuredShares(root, configFile) {
  const content = fs.readFileSync(configFile, 'utf8');
  const sections = [];
  let section;
  for (const line of content.split(/\r?\n/)) {
    const heading = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (heading) {
      section = { name: heading[1].trim() };
      sections.push(section);
      continue;
    }
    const setting = line.match(/^\s*([^=;#]+?)\s*=\s*(.*?)\s*$/);
    if (section && setting) section[setting[1].trim().toLowerCase()] = setting[2].trim();
  }

  const realRoot = fs.realpathSync(root);
  return sections.flatMap(({ name, path: configuredPath, ...settings }) => {
    if (!name || name.startsWith('.') || name.includes('/') || name === 'global' ||
        settings.browseable === 'no' || settings.browsable === 'no' || !configuredPath) return [];
    const alias = path.join(root, name);
    try {
      const realAlias = fs.realpathSync(alias);
      if (!fs.statSync(alias).isDirectory() || !withinRoot(realAlias, realRoot) ||
          realAlias !== fs.realpathSync(configuredPath)) return [];
      return [{ name, path: alias, realPath: realAlias }];
    } catch {
      return []; // Offline, verschlüsselte oder nicht eingehängte Freigabe.
    }
  }).sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

function shareFor(requested, root, shares) {
  const current = path.resolve(requested);
  if (!withinRoot(current, root)) throw new Error('Ordner liegt außerhalb von /share');
  const share = shares.find(item => withinRoot(current, item.path));
  if (!share) throw new Error('Ordner ist keine konfigurierte QNAP-Freigabe');
  return { current, share };
}

function assertSharePath(requested, root = '/share', configFile = '/etc/config/smb.conf', allowMissing = false) {
  const base = path.resolve(root);
  const current = path.resolve(requested);
  if (!withinRoot(current, base)) throw new Error('Ordner liegt außerhalb von /share');
  const { share } = shareFor(current, base, configuredShares(base, configFile));
  let existing = current;
  if (allowMissing) {
    while (!fs.existsSync(existing) && withinRoot(existing, share.path)) existing = path.dirname(existing);
  }
  if (!withinRoot(existing, share.path) || !withinRoot(fs.realpathSync(existing), share.realPath)) {
    throw new Error('Ordner verlässt die konfigurierte Freigabe');
  }
  if (!fs.statSync(existing).isDirectory()) throw new Error('Kein Verzeichnis');
  return current;
}

function listFolders(requested = '/share', root = '/share', configFile = '/etc/config/smb.conf') {
  const base = path.resolve(root);
  const current = path.resolve(requested || base);
  if (!withinRoot(current, base)) throw new Error('Ordner liegt außerhalb von /share');
  if (current === base) {
    const folders = configuredShares(base, configFile).map(({ name, path: folderPath }) => ({ name, path: folderPath }));
    return { path: base, parent: null, folders };
  }
  const { share } = shareFor(current, base, configuredShares(base, configFile));
  assertSharePath(current, base, configFile);

  const folders = [];
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const child = path.join(current, entry.name);
    try {
      if (!withinRoot(fs.realpathSync(child), share.realPath)) continue;
      if (fs.statSync(child).isDirectory()) folders.push({ name: entry.name, path: child });
    } catch {
      // Nicht lesbare oder inzwischen entfernte Einträge ausblenden.
    }
  }
  folders.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return { path: current, parent: current === share.path ? base : path.dirname(current), folders };
}

module.exports = { assertSharePath, listFolders };
