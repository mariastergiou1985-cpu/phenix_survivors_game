// PHENIX: NULL EDEN — Electron shell (Steam build)
// The game itself lives in ./game (a copy of the repo web files) — ZERO code changes.
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const SELFTEST = process.argv.includes('--phenix-selftest');
const SELFTEST_RESULT_FILE = process.env.PHENIX_SELFTEST_RESULT_FILE || '';
const SELFTEST_TRACE_FILE = process.env.PHENIX_SELFTEST_TRACE_FILE || '';

function writeSelfTestTrace(stage, extra = {}) {
  if (!SELFTEST || !SELFTEST_TRACE_FILE) return;
  try {
    fs.appendFileSync(
      SELFTEST_TRACE_FILE,
      JSON.stringify({ t: new Date().toISOString(), stage, ...extra }) + '\n',
      'utf8',
    );
  } catch (_) {}
}

function writeSelfTestResult(result, probe = {}) {
  if (!SELFTEST || !SELFTEST_RESULT_FILE) return;
  try {
    fs.writeFileSync(SELFTEST_RESULT_FILE, JSON.stringify({ result, probe }), 'utf8');
  } catch (e) {
    writeSelfTestTrace('result-write-failed', { error: String(e).slice(0, 300) });
  }
}

if (SELFTEST) {
  // GitHub's Windows runner has no need for GPU acceleration during the hidden release smoke test.
  // Disabling it here avoids driver/session-specific startup failures without affecting normal play.
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
  writeSelfTestTrace('main-loaded', {
    argv: process.argv,
    resultFile: SELFTEST_RESULT_FILE,
    platform: process.platform,
  });

  process.on('uncaughtException', (e) => {
    const probe = { err: `uncaughtException: ${String(e && (e.stack || e)).slice(0, 500)}` };
    writeSelfTestTrace('uncaught-exception', probe);
    writeSelfTestResult('FAIL', probe);
    app.exit(1);
  });
  process.on('unhandledRejection', (e) => {
    const probe = { err: `unhandledRejection: ${String(e && (e.stack || e)).slice(0, 500)}` };
    writeSelfTestTrace('unhandled-rejection', probe);
    writeSelfTestResult('FAIL', probe);
    app.exit(1);
  });
}

function createWindow() {
  writeSelfTestTrace('create-window');
  const win = new BrowserWindow({
    width: 1600, height: 900,
    fullscreen: !SELFTEST,
    show: !SELFTEST,
    autoHideMenuBar: true,
    backgroundColor: '#060a18',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: false,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.webContents.on('did-finish-load', () => writeSelfTestTrace('did-finish-load'));
  win.webContents.on('render-process-gone', (_e, details) => {
    writeSelfTestTrace('render-process-gone', { reason: details.reason, exitCode: details.exitCode });
  });

  const target = path.join(__dirname, 'game', 'index.html');
  writeSelfTestTrace('load-file', { target });
  win.loadFile(target).catch((e) => {
    writeSelfTestTrace('load-file-rejected', { error: String(e).slice(0, 500) });
  });
  win.setMenuBarVisibility(false);
  if (SELFTEST) runSelfTest(win);
}

function runSelfTest(win) {
  const errors = [];
  writeSelfTestTrace('selftest-armed');

  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) errors.push(String(message).slice(0, 240));
  });
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    const msg = `did-fail-load ${code} ${desc} ${url}`;
    errors.push(msg);
    writeSelfTestTrace('did-fail-load', { code, desc, url });
  });

  setTimeout(async () => {
    writeSelfTestTrace('probe-start');
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
          booted: !!(window.__phenixTutorial || document.getElementById('cgm-overlay')),
          luminance: lum,
          steamBridge: typeof window.phenixSteam === 'object',
          steamReady: !!window.phenixSteam && window.phenixSteam.isReady(),
          steamStatus: (window.phenixSteam && window.phenixSteam.status) ? window.phenixSteam.status() : null,
          steamAppId: (window.phenixSteam && window.phenixSteam.appId) ? window.phenixSteam.appId() : null,
          achievementsBridged: !!(window.phenixSteam && typeof window.phenixSteam.activate === 'function'),
        });
      })()`));
    } catch (e) {
      probe = { err: String(e).slice(0, 500) };
    }

    const real = errors.filter(e => !/\[Steam\]|Security Warning|steamworks|SteamAPI/i.test(e));
    probe.errors = real.slice(0, 3);
    const ok = probe.booted === true && probe.luminance > 3 &&
               probe.achievementsBridged === true && real.length === 0;
    const result = ok ? 'PASS' : 'FAIL';

    writeSelfTestTrace('probe-finished', { result, probe });
    writeSelfTestResult(result, probe);
    console.log('PHENIX_SELFTEST::' + JSON.stringify(probe));
    console.log('PHENIX_SELFTEST_RESULT::' + result);
    app.exit(ok ? 0 : 1);
  }, 12000);
}

app.whenReady().then(() => {
  writeSelfTestTrace('app-ready');
  createWindow();
});
app.on('window-all-closed', () => app.quit());
