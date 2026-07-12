/**
 * PlatformAchievements — the STEAM (and future Google Play) achievements bridge.
 * ──────────────────────────────────────────────────────────────────────────────
 * The game code calls exactly ONE function — PlatformAchievements.unlock(id) —
 * with the game's own achievement id. What happens next depends on where we run:
 *
 *   • BROWSER (GitHub Pages, today):   no-op + a persistent localStorage journal
 *     of everything earned, so nothing is ever lost.
 *   • STEAM (Electron + steamworks.js): the same call activates the real Steam
 *     achievement via the injected `window.phenixSteam` API, and on first launch
 *     syncPending() replays the whole journal — players KEEP everything they
 *     earned on the web version.
 *
 * The Electron preload just needs to expose:
 *   window.phenixSteam = { activate(apiName) {...}, isReady() {...} }
 * (see docs/STEAM_SETUP.md for the exact snippet). Zero game-code changes then.
 */

// Game id → Steam API name. These EXACT names go into the Steamworks dashboard
// (Stats & Achievements → New Achievement). Keep them stable forever.
export const STEAM_ACHIEVEMENT_MAP = Object.freeze({
  first_endless:    'ACH_FIRST_ENDLESS',
  endless_survivor: 'ACH_ENDLESS_SURVIVOR',
  grid_legend:      'ACH_GRID_LEGEND',
  level_breaker:    'ACH_LEVEL_BREAKER',
  score_hunter:     'ACH_SCORE_HUNTER',
  combo_master:     'ACH_COMBO_MASTER',
  core_defender:    'ACH_CORE_DEFENDER',
  endless_titan:    'ACH_ENDLESS_TITAN',
  score_legend:     'ACH_SCORE_LEGEND',
  level_ascendant:  'ACH_LEVEL_ASCENDANT',
  combo_god:        'ACH_COMBO_GOD',
  core_warden:      'ACH_CORE_WARDEN',
});

const JOURNAL_KEY = 'phenix_platform_achievements_v1';

function _journal() {
  try { return JSON.parse(localStorage.getItem(JOURNAL_KEY) || '{}'); }
  catch (_) { return {}; }
}
function _saveJournal(j) {
  try { localStorage.setItem(JOURNAL_KEY, JSON.stringify(j)); } catch (_) {}
}
function _steam() {
  // Injected by the Electron preload in the Steam build; absent in browsers.
  return (typeof window !== 'undefined' && window.phenixSteam && window.phenixSteam.isReady?.())
    ? window.phenixSteam : null;
}

export const PlatformAchievements = {
  /** Record + (on Steam) activate. Safe to call repeatedly — idempotent. */
  unlock(gameId) {
    try {
      const j = _journal();
      if (!j[gameId]) { j[gameId] = Date.now(); _saveJournal(j); }
      const api = STEAM_ACHIEVEMENT_MAP[gameId];
      const st = _steam();
      if (api && st && !j['steam_' + gameId]) {
        st.activate(api);
        j['steam_' + gameId] = Date.now(); _saveJournal(j);
      }
    } catch (_) { /* platform layer must never break the game */ }
  },

  /** Steam build, first launch: replay every web-earned achievement to Steam. */
  syncPending() {
    try {
      const st = _steam(); if (!st) return 0;
      const j = _journal(); let n = 0;
      for (const gameId of Object.keys(STEAM_ACHIEVEMENT_MAP)) {
        if (j[gameId] && !j['steam_' + gameId]) {
          st.activate(STEAM_ACHIEVEMENT_MAP[gameId]);
          j['steam_' + gameId] = Date.now(); n++;
        }
      }
      if (n) _saveJournal(j);
      return n;
    } catch (_) { return 0; }
  },
};
