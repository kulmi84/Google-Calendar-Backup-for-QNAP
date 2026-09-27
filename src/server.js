'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');
const { runBackup, validateCalendarUrl } = require('./backup');
const { loadConfig, saveConfig } = require('./config');
const { listFolders } = require('./folders');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.resolve(process.env.GCB_DATA_DIR || path.join(ROOT, 'data'));
const PUBLIC_DIR = path.join(ROOT, 'public');
const PORT = Number(process.env.GCB_PORT || 19884);
const HOST = process.env.GCB_HOST || '127.0.0.1';
const QNAP_MODE = process.env.GCB_QNAP_MODE === '1';
const PROXY_PATH = String(process.env.GCB_PROXY_PATH || '/GoogleCalendarBackup').replace(/\/$/, '');
const APP_VERSION = require('../package.json').version;

let config = loadConfig(DATA_DIR);
let status = { running: false, lastRun: null };
let lastScheduledDate = '';

function json(res, code, value, headers = {}) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(value));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) req.destroy(new Error('Anfrage zu groß'));
    });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error('Ungültiges JSON')); }
    });
    req.on('error', reject);
  });
}

function publicConfig() {
  return {
    targetDir: config.targetDir,
    schedule: config.schedule,
    retentionDays: config.retentionDays,
    calendars: config.calendars.map(({ id, name, url }) => ({ id, name, hasUrl: Boolean(url) }))
  };
}

function validateSettings(input) {
  const targetDir = path.resolve(String(input.targetDir || ''));
  if (!path.isAbsolute(targetDir) || targetDir.includes('\0')) throw new Error('Ungültiger Zielordner');
  if (QNAP_MODE && !targetDir.startsWith('/share/')) throw new Error('Der Zielordner muss unter /share liegen');
  const schedule = String(input.schedule || '');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule)) throw new Error('Ungültige Uhrzeit');
  const retentionDays = Number(input.retentionDays);
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) throw new Error('Aufbewahrung muss zwischen 1 und 3650 Tagen liegen');
  if (!Array.isArray(input.calendars) || input.calendars.length < 1 || input.calendars.length > 50) throw new Error('Mindestens ein Kalender ist erforderlich');

  const old = new Map(config.calendars.map(calendar => [calendar.id, calendar]));
  const names = new Set();
  const calendars = input.calendars.map(item => {
    const id = String(item.id || crypto.randomUUID());
    const name = String(item.name || '').trim();
    if (!name || name.length > 80) throw new Error('Jeder Kalender benötigt einen gültigen Namen');
    if (names.has(name.toLowerCase())) throw new Error(`Kalendername doppelt: ${name}`);
    names.add(name.toLowerCase());
    const url = String(item.url || old.get(id)?.url || '').trim();
    validateCalendarUrl(url);
    return { id, name, url };
  });
  return { targetDir, schedule, retentionDays, calendars };
}

async function executeBackup() {
  if (status.running) throw new Error('Eine Sicherung läuft bereits');
  status.running = true;
  try {
    status.lastRun = await runBackup(config);
    status.lastRun.finishedAt = new Date().toISOString();
    return status.lastRun;
  } finally {
    status.running = false;
  }
}

function serveStatic(req, res, pathname) {
  const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
  const file = path.resolve(PUBLIC_DIR, requested);
  if (!file.startsWith(`${PUBLIC_DIR}${path.sep}`) || !fs.existsSync(file)) return false;
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

  // QTS kann den Proxy-Pfad je nach Aufrufart verändern. Die Oberfläche wird
  // deshalb als ein einziges HTML-Dokument ausgeliefert und benötigt keine
  // separaten CSS-/JS-Anfragen durch den QTS-Proxy.
  if (requested === 'index.html') {
    const css = fs.readFileSync(path.join(PUBLIC_DIR, 'styles.css'), 'utf8');
    const script = fs.readFileSync(path.join(PUBLIC_DIR, 'app.js'), 'utf8');
    const html = fs.readFileSync(file, 'utf8')
      .replace('<link rel="stylesheet" href="/GoogleCalendarBackup/styles.css">', `<style>${css}</style>`)
      .replace('<script src="/GoogleCalendarBackup/app.js"></script>', `<script>${script}</script>`);
    res.writeHead(200, { 'Content-Type': types['.html'], 'Cache-Control': 'no-cache' });
    res.end(html);
    return true;
  }

  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
  return true;
}

async function api(req, res, pathname, searchParams) {
  try {
    if (pathname === '/api/config' && req.method === 'GET') return json(res, 200, publicConfig());
    if (pathname === '/api/status' && req.method === 'GET') return json(res, 200, status);
    if (pathname === '/api/folders' && req.method === 'GET') {
      return json(res, 200, listFolders(searchParams.get('path')));
    }
    if (pathname === '/api/folders' && req.method === 'POST') {
      const input = await readBody(req);
      return json(res, 200, listFolders(input.path));
    }

    if (pathname === '/api/config' && req.method === 'PUT') {
      const settings = validateSettings(await readBody(req));
      config = { ...config, ...settings };
      saveConfig(DATA_DIR, config);
      return json(res, 200, publicConfig());
    }

    if (pathname === '/api/run' && req.method === 'POST') {
      json(res, 202, { accepted: true });
      executeBackup().catch(error => console.error(error));
      return;
    }

    console.warn(`Unbekannte API-Route: ${req.method} ${pathname}`);
    return json(res, 404, { error: 'Nicht gefunden' });
  } catch (error) {
    return json(res, 400, { error: error.message });
  }
}

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = requestUrl.pathname;
  if (pathname === PROXY_PATH) {
    res.writeHead(302, { Location: `${PROXY_PATH}/`, 'Cache-Control': 'no-store' });
    return res.end();
  }
  // QTS-Proxy-Versionen reichen den Präfix teils erneut an den Dienst weiter.
  while (pathname.startsWith(`${PROXY_PATH}/`)) pathname = pathname.slice(PROXY_PATH.length) || '/';
  // Einige QTS-Proxy-Versionen haengen bei API-Aufrufen einen Slash an.
  if (pathname.length > 1) pathname = pathname.replace(/\/+$/, '');
  if (pathname === '/health' && req.method === 'GET') return json(res, 200, { ok: true, version: APP_VERSION });
  if (pathname.startsWith('/api/')) return void api(req, res, pathname, requestUrl.searchParams);
  if (!serveStatic(req, res, pathname)) {
    console.warn(`Unbekannte Route: ${req.method} ${pathname}`);
    json(res, 404, { error: 'Nicht gefunden' });
  }
});

function scheduleTick() {
  if (!config.calendars.length || status.running) return;
  const now = new Date();
  const day = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  if (time === config.schedule && day !== lastScheduledDate) {
    lastScheduledDate = day;
    executeBackup().catch(error => console.error(error));
  }
}

server.listen(PORT, HOST, () => console.log(`Google Calendar Backup for QNAP läuft auf http://${HOST}:${PORT}`));
setInterval(scheduleTick, 30000).unref();
scheduleTick();
