// ─── StateManager.js ──────────────────────────────────────────────────────
// Centralized game-state management with EventBus integration.
// Owns:
//   • valid state enum (GAME_STATES)
//   • setState() with event emission
//   • convenience guards: isPlaying(), isMenu(), canPlayerAct(), isBlocked()
//   • state history for debugging
//   • pause/unpause helpers
// Game.js delegates state transitions here; direct gameState writes are
// gradually replaced by stateManager.setState() calls.
// ──────────────────────────────────────────────────────────────────────────

import { EVENTS } from './EventBus.js?v=20260702700000';

// ─── Valid Game States ──────────────────────────────────────────────────────
export const GAME_STATES = Object.freeze({
  START_MENU:       'start_menu',
  CHARACTER_SELECT: 'character_select',
  PLAYING:          'playing',
  GAME_OVER:        'game_over',
  VICTORY:          'victory',
  EXIT_SCREEN:      'exit_screen',
  UPGRADES:         'upgrades',
  ACHIEVEMENTS:     'achievements',
  RELICS:           'relics',
  CREDITS:          'credits',
  INSTRUCTIONS:     'instructions',
  AUDIO_SETTINGS:   'audio_settings',
  SETTINGS:         'settings',
  LORE_ARCHIVE:     'lore_archive',
});

// Menu states — player is NOT in gameplay
const MENU_STATES = new Set([
  GAME_STATES.START_MENU,
  GAME_STATES.CHARACTER_SELECT,
  GAME_STATES.EXIT_SCREEN,
  GAME_STATES.UPGRADES,
  GAME_STATES.ACHIEVEMENTS,
  GAME_STATES.RELICS,
  GAME_STATES.CREDITS,
  GAME_STATES.INSTRUCTIONS,
  GAME_STATES.AUDIO_SETTINGS,
  GAME_STATES.SETTINGS,
  GAME_STATES.LORE_ARCHIVE,
]);

// ─── StateManager Class ────────────────────────────────────────────────────
export class StateManager {
  /**
   * @param {object} opts
   * @param {object} opts.game    - Game instance reference
   * @param {import('./EventBus.js').EventBus} opts.events - EventBus for state-change notifications
   */
  constructor({ game, events }) {
    this.game   = game;
    this.events = events;

    /** @type {string} Current game state */
    this._state = GAME_STATES.START_MENU;

    /** @type {string|null} Previous game state (for back-navigation) */
    this._prevState = null;

    /** @type {Array<{from: string, to: string, at: number}>} Last N transitions (debug ring buffer) */
    this._history = [];
    this._historyMax = 20;
  }

  // ─── Getters ──────────────────────────────────────────────────────────
  /** Current state string (matches gameState for backward compat) */
  get state() { return this._state; }

  /** Previous state string */
  get prevState() { return this._prevState; }

  // ─── State Transitions ────────────────────────────────────────────────
  /**
   * Transition to a new state.
   * Emits EVENTS.STATE_CHANGED with { from, to }.
   * @param {string} newState - must be a value from GAME_STATES
   * @returns {boolean} true if state actually changed
   */
  setState(newState) {
    if (newState === this._state) return false;

    const from = this._state;
    this._prevState = from;
    this._state = newState;

    // Record in history ring buffer
    this._history.push({ from, to: newState, at: performance.now() });
    if (this._history.length > this._historyMax) this._history.shift();

    // Sync legacy Game.gameState
    this.game.gameState = newState;

    // Emit event
    if (this.events) {
      this.events.emit(EVENTS.STATE_CHANGED, { from, to: newState });
    }

    return true;
  }

  /**
   * Go back to the previous state (one level).
   * @returns {boolean}
   */
  goBack() {
    if (!this._prevState) return false;
    return this.setState(this._prevState);
  }

  // ─── Convenience Guards ───────────────────────────────────────────────

  /** True when the game is in active gameplay */
  isPlaying() {
    return this._state === GAME_STATES.PLAYING;
  }

  /** True when in any menu/UI screen (not gameplay) */
  isMenu() {
    return MENU_STATES.has(this._state);
  }

  /** True when the run ended (game over or victory) */
  isRunEnded() {
    return this._state === GAME_STATES.GAME_OVER || this._state === GAME_STATES.VICTORY;
  }

  /**
   * True when player cannot act (shoot/move abilities).
   * Replaces the repeated guard:
   *   gameState !== 'playing' || paused || gameOver || victory || upgradeUI
   */
  canPlayerAct() {
    const g = this.game;
    return this._state === GAME_STATES.PLAYING
      && !g.paused
      && !g.gameOver
      && !g.victory
      && !g.upgradeUI;
  }

  /**
   * Extended version that also blocks during mutation picks.
   * Replaces: gameState !== 'playing' || paused || gameOver || victory || upgradeUI || mutationUI
   */
  canPlayerActStrict() {
    return this.canPlayerAct() && !this.game.mutationUI;
  }

  /**
   * True when the game loop should still tick (enemies move, time counts).
   * False during menus, pause.
   */
  isGameTicking() {
    const g = this.game;
    return this._state === GAME_STATES.PLAYING
      && !g.paused
      && !g.gameOver
      && !g.victory;
  }

  // ─── Pause Helpers ────────────────────────────────────────────────────
  pause() {
    if (!this.isPlaying()) return false;
    this.game.paused = true;
    if (this.events) this.events.emit(EVENTS.GAME_PAUSED, {});
    return true;
  }

  unpause() {
    if (!this.game.paused) return false;
    this.game.paused = false;
    if (this.events) this.events.emit(EVENTS.GAME_RESUMED, {});
    return true;
  }

  togglePause() {
    return this.game.paused ? this.unpause() : this.pause();
  }

  // ─── Debug ────────────────────────────────────────────────────────────
  /** Get recent state transitions (newest last) */
  getHistory() {
    return [...this._history];
  }

  /** Log current state + history to console */
  debugDump() {
    console.group('[StateManager] Debug');
    console.log('Current:', this._state);
    console.log('Previous:', this._prevState);
    console.table(this._history);
    console.groupEnd();
  }
}
