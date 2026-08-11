// Steam bridge injection — the ONLY glue between the game and Steamworks.
// The game calls exactly one thing (js/platform/PlatformAchievements.js):
//     window.phenixSteam = { isReady(), activate(apiName) }
// and js/main.js replays the whole web-earned journal through it 3s after boot (syncPending).
//
// APP ID — deliberately NOT a constant in this file.
//
// It used to be `const APP_ID = 480`, Valve's Spacewar test app. A production build carrying 480
// is worse than one with no Steam at all: init SUCCEEDS, isReady() returns true, and every
// achievement the player earns is written against somebody else's app — so it looks like it works
// while nothing reaches PHENIX, and PlatformAchievements marks each one 'steam_<id>' in the journal
// so the real build would never replay them. There is no PHENIX App ID in this repo yet, and one
// is not invented here. Until Steamworks issues it, the resolution order is:
//
//   1. STEAM_APP_ID environment variable            (CI / scripted launches)
//   2. steam_appid.txt next to the executable       (Valve's own convention — Steam itself reads
//                                                    this file when the game is not launched
//                                                    through the client, so it is the file Maria
//                                                    is already told to drop next to the exe)
//   3. steam_appid.txt inside the packaged resources
//
// Nothing found → DO NOT INIT. isReady() stays false, activate() is a no-op, and every achievement
// keeps accumulating in the localStorage journal, which syncPending() replays in full the first
// time a build launches with a real App ID. Nothing is lost by shipping without one.
//
// 480 is still reachable for local testing, but only when asked for out loud:
//     set PHENIX_STEAM_ALLOW_TEST_APPID=1
// It can never be the default, and it can never be silently inherited by a production build.

const fs = require('fs');
const path = require('path');

const TEST_APPID = 480;
const readIdFrom = (file) => {
  try {
    if (!fs.existsSync(file)) return null;
    const n = parseInt(String(fs.readFileSync(file, 'utf8')).trim(), 10);
    return Number.isInteger(n) && n > 0 ? { id: n, source: file } : null;
  } catch (_) { return null; }
};

function resolveAppId() {
  const env = parseInt(process.env.STEAM_APP_ID || '', 10);
  if (Number.isInteger(env) && env > 0) return { id: env, source: 'STEAM_APP_ID' };
  // Next to the executable: packaged this is <install>/PHENIX NULL EDEN.exe, dev this is the
  // electron binary — both are the folder a player would drop steam_appid.txt into.
  const beside = path.dirname(process.execPath);
  return readIdFrom(path.join(beside, 'steam_appid.txt'))
      || readIdFrom(path.join(__dirname, 'steam_appid.txt'))
      || null;
}

let client = null;
let status = 'no-app-id';
let appId = null;

try {
  const resolved = resolveAppId();
  if (!resolved) {
    status = 'no-app-id';
    console.warn('[Steam] no App ID — Steamworks not initialised. Achievements are journalled ' +
                 'locally and will be replayed in full by syncPending() once a real App ID ships. ' +
                 'Set STEAM_APP_ID or put steam_appid.txt next to the executable.');
  } else if (resolved.id === TEST_APPID && process.env.PHENIX_STEAM_ALLOW_TEST_APPID !== '1') {
    status = 'test-appid-refused';
    console.warn('[Steam] REFUSED App ID 480 (Valve Spacewar test app). A production build must ' +
                 'never write achievements against it. Set PHENIX_STEAM_ALLOW_TEST_APPID=1 if you ' +
                 'really are testing locally.');
  } else {
    appId = resolved.id;
    const steamworks = require('steamworks.js');
    client = steamworks.init(appId);
    status = 'ready';
    console.log('[Steam] connected as', client.localplayer.getName(), '· app', appId, '· via', resolved.source);
  }
} catch (e) {
  // Steam not running, no steamclient, wrong platform — all normal outside the Steam client.
  status = 'init-failed';
  console.warn('[Steam] not available:', e && e.message ? e.message : String(e));
}

window.phenixSteam = {
  isReady: () => !!client,
  activate: (apiName) => {
    try { if (client) client.achievement.activate(apiName); }
    catch (e) { console.warn('[Steam] ach', apiName, e && e.message ? e.message : String(e)); }
  },
  // Diagnostics only — the game never reads these. They are what a support ticket needs.
  appId: () => appId,
  status: () => status,
};
