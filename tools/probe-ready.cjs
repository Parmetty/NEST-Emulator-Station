// Does Electron's browser process reach "ready" at all? No window, no GPU calls.
const { app } = require('electron');

console.log('[probe] module loaded, electron=' + process.versions.electron);

process.on('uncaughtException', (err) => {
  console.log('[probe] uncaught: ' + (err && err.stack ? err.stack : String(err)));
  app.exit(3);
});

app.whenReady().then(() => {
  console.log('[probe] READY');
  app.exit(0);
});

setTimeout(() => console.log('[probe] alive at 500ms'), 500);
