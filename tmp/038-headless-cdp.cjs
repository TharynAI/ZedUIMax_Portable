const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');
const directory = process.argv[2];
if (!directory || !path.isAbsolute(directory)) throw new Error('Private fixture directory required');
app.setPath('userData', path.join(directory, 'userData'));
const stop = setTimeout(() => app.quit(), 20000);
let window;
app.whenReady().then(async () => {
  window = new BrowserWindow({ show: false, skipTaskbar: true, webPreferences: { nodeIntegration: false, contextIsolation: true } });
  const pageDirectory = path.join(directory, 'dist', 'renderer');
  fs.mkdirSync(pageDirectory, { recursive: true });
  fs.writeFileSync(path.join(pageDirectory, 'index.html'), '<!doctype html><title>Hidden CDP fixture</title><script>window.__ZEDUI_STORE__={getState:()=>({})};</script>');
  await window.loadFile(path.join(pageDirectory, 'index.html'));
  fs.writeFileSync(path.join(directory, 'fixture.json'), JSON.stringify({ pid: process.pid, visible: window.isVisible(), hwnd: window.getNativeWindowHandle().readBigUInt64LE().toString(), port: 9248 }));
  const poll = setInterval(() => { if (fs.existsSync(path.join(directory, 'quit'))) { clearInterval(poll); app.quit(); } }, 100);
}).catch(error => { fs.writeFileSync(path.join(directory, 'failure.txt'), error.message); app.quit(); });
app.on('will-quit', () => clearTimeout(stop));
