'use strict';

const { execFile } = require('node:child_process');
const { recordError } = require('./history');

const TEST_WARNING = 'Watchdog: TESTWARNUNG – manuell ausgelöster Benachrichtigungstest. Kein tatsächlicher Sicherungsfehler.';

function writeQuLogWarning(message, execute = execFile) {
  return new Promise((resolve, reject) => {
    execute('/sbin/log_tool', ['-t1', '-uSystem', '-p127.0.0.1', '-mlocalhost', '-a', `[Google Calendar Backup] ${message}`],
      { timeout: 5000, windowsHide: true }, error => {
        if (error) reject(new Error('Testwarnung konnte nicht an QuLog übergeben werden. QNAP-Protokolldienst und App-Berechtigungen prüfen.'));
        else resolve();
      });
  });
}

async function sendTestWarning(dataDir, { writeWarning = writeQuLogWarning, record = recordError } = {}) {
  await writeWarning(TEST_WARNING);
  let historySaved = true;
  try { record(dataDir, { source: 'Testwarnung', error: TEST_WARNING }); }
  catch { historySaved = false; }
  return {
    qulogAccepted: true,
    historySaved,
    message: 'Testwarnung an QuLog übergeben. Bitte QuLog und die Zustellung über deine QNAP-Benachrichtigungsregel prüfen.'
      + (historySaved ? '' : ' Der Eintrag konnte nicht in der lokalen Fehlerhistorie gespeichert werden.')
  };
}

module.exports = { TEST_WARNING, writeQuLogWarning, sendTestWarning };
