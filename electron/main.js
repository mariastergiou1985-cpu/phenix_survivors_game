// PHENIX: NULL EDEN — Electron shell (Steam build)
// The game itself lives in ./game (a copy of the repo web files) — ZERO code changes.
const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1600, height: 900,
    fullscreen: true,
    autoHideMenuBar: true,
    backgroundColor: '#060a18',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: false,   // simple bridge: preload writes window.phenixSteam directly
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'game', 'index.html'));
  win.setMenuBarVisibility(false);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
