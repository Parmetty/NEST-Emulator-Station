// Diagnostic probe: logs each bootstrap step so a crash can be located.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'diag');
const logFile = path.join(dir, 'mini.log');
try {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(logFile, '');
} catch {
  /* ignore */
}

function log(msg) {
  const line = `[mini] ${new Date().toISOString()} ${msg}`;
  try {
    fs.appendFileSync(logFile, line + '\n');
  } catch {
    /* ignore */
  }
  console.log(line);
}

log('start: ' + process.argv.slice(2).join(' '));

app.disableHardwareAcceleration();
log('hardware acceleration disabled');

process.on('uncaughtException', (err) => {
  log('uncaught: ' + (err && err.stack ? err.stack : String(err)));
  app.exit(3);
});

app
  .whenReady()
  .then(() => {
    log('app ready');
    const win = new BrowserWindow({ show: false, width: 640, height: 480 });
    log('window created');

    win.webContents.once('did-finish-load', () => {
      log('did-finish-load: OK');
      app.exit(0);
    });
    win.webContents.once('render-process-gone', (_e, details) => {
      log('render-process-gone: ' + JSON.stringify(details));
      app.exit(2);
    });
    win.webContents.once('did-fail-load', (_e, code, desc) => {
      log(`did-fail-load: ${code} ${desc}`);
      app.exit(5);
    });

    win.loadURL('data:text/html,<h1>hi</h1>');
  })
  .catch((err) => {
    log('whenReady failed: ' + (err && err.stack ? err.stack : String(err)));
    app.exit(4);
  });
