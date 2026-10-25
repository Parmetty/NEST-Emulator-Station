// Probe: can the main process grab a window thumbnail of a running emulator?
const fs = require('node:fs');
const { app, desktopCapturer } = require('electron');

app.whenReady().then(async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: 640, height: 480 },
      fetchWindowIcons: false,
    });
    console.log('sources:', JSON.stringify(sources.map((s) => s.name)));
    const target = sources.find((s) => /mGBA/i.test(s.name));
    if (!target) {
      console.log('no mGBA window found');
      app.exit(2);
      return;
    }
    const img = target.thumbnail;
    const size = img.getSize();
    console.log('thumbnail', JSON.stringify(size), 'empty=' + img.isEmpty());
    fs.writeFileSync('E:\\workstop\\nest\\diag\\cap.png', img.toPNG());
    app.exit(0);
  } catch (err) {
    console.log('capture failed:', err.message);
    app.exit(1);
  }
});
