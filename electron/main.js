// PHENIX: NULL EDEN — Electron shell (Steam build)
// The game itself lives in ./game (a copy of the repo web files) — ZERO code changes.
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

// SELF-TEST MODE (--phenix-selftest). Boots the REAL packaged shell hidden, waits for the game to
// come up, reads the canvas back, prints one machine-readable line and exits 0/1. This is what lets
// CI verify the .exe it just produced instead of only proving that electron-builder did not crash,
// and it is the same command Maria can run locally:  npm run selftest
// It changes nothing about a normal launch — the flag has to be passed explicitly.
const SELFTEST = process.argv.includes('--phenix-selftest');

function createWindow() {
  const win = new BrowserWindow({
    width: 1600, height: 900,
    fullscreen: !SELFTEST,
    show: !SELFTEST,
    autoHideMenuBar: true,
    backgroundColor: '#060a18',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: false,   // simple bridge: preload writes window.phenixSteam directly
      nodeIntegration: false,
      // sandbox:false is REQUIRED, and its absence is why the Steam bridge never worked.
      // Since Electron 20 preload scripts are sandboxed by default, and a sandboxed preload gets a
      // polyfilled require() that resolves only a small whitelist — no 'fs', no native addons. So
      // require('steamworks.js') could not have succeeded in any build, with or without the
      // dependency installed: it threw "module not found" every time and the catch made that look
      // like "Steam is just not running". Measured here before the change:
      //   steamBridge:false  ·  "Unable to load preload script"  ·  "module not found: fs"
      // The renderer keeps nodeIntegration:false — only the preload gains Node, which is the point.
      sandbox: false,
    },
  });
  win.loadFile(path.join(__dirname, 'game', 'index.html'));
  win.setMenuBarVisibility(false);
  if (SELFTEST) runSelfTest(win);
}

function runSelfTest(win) {
  const errors = [];
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) errors.push(String(message).slice(0, 240));
  });
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    errors.push(`did-fail-load ${code} ${desc} ${url}`);
  });
  setTimeout(async () => {
    let probe = { err: 'probe did not run' };
    try {
      probe = JSON.parse(await win.webContents.executeJavaScript(`(() => {
        const c = document.getElementById('game');
        let lum = -1;
        try {
          const g = c.getContext('2d');
          const d = g.getImageData(0, 0, c.width, c.height).data;
          let s = 0, n = 0;
          for (let i = 0; i < d.length; i += 4000) { s += (d[i] + d[i+1] + d[i+2]) / 3; n++; }
          lum = Math.round(s / n);
        } catch (e) {}
        return JSON.stringify({
          protocol: location.protocol,
          canvas: c ? c.width + 'x' + c.height : null,
          // the game is alive only if the ES module graph ran and built its DOM
          booted: !!(window.__phenixTutorial || document.getElementById('cgm-overlay')),
          luminance: lum,
          steamBridge: typeof window.phenixSteam === 'object',
          steamReady: !!window.phenixSteam && window.phenixSteam.isReady(),
          steamStatus: (window.phenixSteam && window.phenixSteam.status) ? window.phenixSteam.status() : null,
          steamAppId: (window.phenixSteam && window.phenixSteam.appId) ? window.phenixSteam.appId() : null,
          achievementsBridged: !!(window.phenixSteam && typeof window.phenixSteam.activate === 'function'),
        });
      })()`));
    } catch (e) { probe = { err: String(e).slice(0, 240) }; }
    // Steam's own warnings are not build failures — a machine with no Steam client is the normal
    // case for CI and for anyone testing the exe outside the Steam library.
    const real = errors.filter(e => !/\[Steam\]|Security Warning|steamworks|SteamAPI/i.test(e));
    probe.errors = real.slice(0, 3);
    const ok = probe.booted === true && probe.luminance > 3 &&
               probe.achievementsBridged === true && real.length === 0;
    const result = ok ? 'PASS' : 'FAIL';
    const payload = { result, probe };
    console.log('PHENIX_SELFTEST::' + JSON.stringify(probe));
    console.log('PHENIX_SELFTEST_RESULT::' + result);

    // A packaged Windows Electron executable is a GUI-subsystem process, so PowerShell cannot
    // reliably capture console.log/stdout from it. CI therefore supplies a result-file path and
    // polls that file. Keep stdout too because `npm run selftest` in development can still show it.
    const resultFile = process.env.PHENIX_SELFTEST_RESULT_FILE;
    if (resultFile) {
      try {
        fs.writeFileSync(resultFile, JSON.stringify(payload), 'utf8');
      } catch (e) {
        console.error('[selftest] could not write result file:', e);
      }
    }
    app.exit(ok ? 0 : 1);
  }, 12000);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
