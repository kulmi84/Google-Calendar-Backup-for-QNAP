'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { runBackup, validateCalendarUrl } = require('./backup');
const { hashPassword, loadConfig, saveConfig, verifyPassword } = require('./config');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.resolve(process.env.GCB_DATA_DIR || path.join(ROOT, 'data'));
const PUBLIC_DIR = path.join(ROOT, 'public');
const PORT = Number(process.env.GCB_PORT || 19884);
const HOST = process.env.GCB_HOST || '0.0.0.0';
const QNAP_MODE = process.env.GCB_QNAP_MODE === '1';

let config = loadConfig(DATA_DIR);
let status = { running: false, lastRun: null };
let sessions = new Map();
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

function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map(part => part.trim().split('=').map(decodeURIComponent)).filter(pair => pair.length === 2));
}

function authenticated(req) {
  const token = cookies(req).gcb_session;
  const expiry = sessions.get(token);
  if (!token || !expiry || expiry < Date.now()) return false;
  sessions.set(token, Date.now() + 8 * 3600000);
  return true;
}

function newSession(res) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + 8 * 3600000);
  res.setHeader('Set-Cookie', `gcb_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);
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
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
  return true;
}

async function api(req, res, pathname) {
  try {
    if (pathname === '/api/setup-status' && req.method === 'GET') return json(res, 200, { setupComplete: config.setupComplete });

    if (pathname === '/api/setup' && req.method === 'POST') {
      if (config.setupComplete) return json(res, 409, { error: 'Einrichtung bereits abgeschlossen' });
      const body = await readBody(req);
      if (typeof body.password !== 'string' || body.password.length < 10) return json(res, 400, { error: 'Passwort muss mindestens 10 Zeichen lang sein' });
      config.password = hashPassword(body.password);
      config.setupComplete = true;
      saveConfig(DATA_DIR, config);
      newSession(res);
      return json(res, 200, { ok: true });
    }

    if (pathname === '/api/login' && req.method === 'POST') {
      const body = await readBody(req);
      if (!verifyPassword(String(body.password || ''), config.password)) return json(res, 401, { error: 'Falsches Passwort' });
      newSession(res);
      return json(res, 200, { ok: true });
    }

    if (!authenticated(req)) return json(res, 401, { error: 'Anmeldung erforderlich' });

    if (pathname === '/api/config' && req.method === 'GET') return json(res, 200, publicConfig());
    if (pathname === '/api/status' && req.method === 'GET') return json(res, 200, status);

    if (pathname === '/api/config' && req.method === 'PUT') {
      const settings = validateSettings(await readBody(req));
      config = { ...config, ...settings };
      saveConfig(DATA_DIR, config);
      return json(res, 200, publicConfig());
    }

    if (pathname === '/api/password' && req.method === 'PUT') {
      const body = await readBody(req);
      if (!verifyPassword(String(body.currentPassword || ''), config.password)) return json(res, 403, { error: 'Aktuelles Passwort ist falsch' });
      if (typeof body.newPassword !== 'string' || body.newPassword.length < 10) return json(res, 400, { error: 'Neues Passwort muss mindestens 10 Zeichen lang sein' });
      config.password = hashPassword(body.newPassword);
      saveConfig(DATA_DIR, config);
      sessions = new Map();
      return json(res, 200, { ok: true }, { 'Set-Cookie': 'gcb_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
    }

    if (pathname === '/api/run' && req.method === 'POST') {
      json(res, 202, { accepted: true });
      executeBackup().catch(error => console.error(error));
      return;
    }

    if (pathname === '/api/logout' && req.method === 'POST') {
      const token = cookies(req).gcb_session;
      sessions.delete(token);
      return json(res, 200, { ok: true }, { 'Set-Cookie': 'gcb_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
    }
    return json(res, 404, { error: 'Nicht gefunden' });
  } catch (error) {
    return json(res, 400, { error: error.message });
  }
}

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname;
  if (pathname.startsWith('/api/')) return void api(req, res, pathname);
  if (!serveStatic(req, res, pathname)) json(res, 404, { error: 'Nicht gefunden' });
});

function scheduleTick() {
  if (!config.setupComplete || !config.calendars.length || status.running) return;
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
