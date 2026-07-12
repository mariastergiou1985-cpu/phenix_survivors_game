// Steam bridge injection — this is the ONLY glue between the game and Steamworks.
// Put your real App ID below once Steamworks gives you one (480 = Valve's test app,
// works for local testing with Steam running).
const APP_ID = 480;

let client = null;
try {
  const steamworks = require('steamworks.js');
  client = steamworks.init(APP_ID);
  console.log('[Steam] connected as', client.localplayer.getName());
} catch (e) {
  console.warn('[Steam] not available (running without Steam?):', e.message);
}

window.phenixSteam = {
  isReady: () => !!client,
  activate: (apiName) => {
    try { if (client) client.achievement.activate(apiName); } catch (e) { console.warn('[Steam] ach', apiName, e.message); }
  },
};
