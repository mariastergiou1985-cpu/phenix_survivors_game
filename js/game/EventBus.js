// ─── EventBus.js ──────────────────────────────────────────────────────────
// Lightweight publish/subscribe event bus for decoupling game systems.
// Systems emit events (e.g., 'enemy:killed', 'biome:changed') and other
// systems subscribe without needing direct references to each other.
// ──────────────────────────────────────────────────────────────────────────

export class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map();
    /** @type {Map<string, Set<Function>>} */
    this._onceListeners = new Map();
  }

  /**
   * Subscribe to an event.
   * @param {string} event - event name (use 'system:action' convention)
   * @param {Function} fn - callback receiving (data, event)
   * @returns {Function} unsubscribe function
   */
  on(event, fn) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(fn);
    return () => this.off(event, fn);
  }

  /**
   * Subscribe to an event, auto-unsubscribes after first fire.
   */
  once(event, fn) {
    if (!this._onceListeners.has(event)) this._onceListeners.set(event, new Set());
    this._onceListeners.get(event).add(fn);
    return () => {
      const s = this._onceListeners.get(event);
      if (s) s.delete(fn);
    };
  }

  /**
   * Unsubscribe from an event.
   */
  off(event, fn) {
    const set = this._listeners.get(event);
    if (set) set.delete(fn);
  }

  /**
   * Emit an event to all subscribers.
   * @param {string} event
   * @param {*} data - arbitrary payload
   */
  emit(event, data) {
    const set = this._listeners.get(event);
    if (set) {
      for (const fn of set) {
        try { fn(data, event); }
        catch (err) { console.warn(`[EventBus] Error in listener for '${event}':`, err); }
      }
    }
    const once = this._onceListeners.get(event);
    if (once && once.size > 0) {
      for (const fn of once) {
        try { fn(data, event); }
        catch (err) { console.warn(`[EventBus] Error in once-listener for '${event}':`, err); }
      }
      once.clear();
    }
  }

  /**
   * Remove all listeners (useful for cleanup/reset).
   */
  clear() {
    this._listeners.clear();
    this._onceListeners.clear();
  }

  /**
   * Remove all listeners for a specific event.
   */
  clearEvent(event) {
    this._listeners.delete(event);
    this._onceListeners.delete(event);
  }
}

// ─── Event Name Constants ─────────────────────────────────────────────────────
// Centralized event names prevent typos and make grep-ability easy.
export const EVENTS = {
  // Game state
  STATE_CHANGED:      'game:stateChanged',       // { from, to }
  GAME_STARTED:       'game:started',             // { character, mode }
  GAME_OVER:          'game:over',                // { score, timeAlive }
  GAME_VICTORY:       'game:victory',             // { score, timeAlive }
  GAME_PAUSED:        'game:paused',              // {}
  GAME_RESUMED:       'game:resumed',             // {}

  // Map / Biome
  BIOME_CHANGED:      'map:biomeChanged',         // { from, to, biome }
  CHUNK_LOADED:       'map:chunkLoaded',           // { cx, cy, biomeId }
  CHUNK_UNLOADED:     'map:chunkUnloaded',         // { cx, cy }

  // Player
  PLAYER_LEVEL_UP:    'player:levelUp',            // { level }
  PLAYER_DAMAGED:     'player:damaged',            // { amount, source }
  PLAYER_DIED:        'player:died',               // {}
  PLAYER_HEALED:      'player:healed',             // { amount }

  // Enemies
  ENEMY_SPAWNED:      'enemy:spawned',             // { enemy, type }
  ENEMY_KILLED:       'enemy:killed',              // { enemy, killer, pos }
  WAVE_STARTED:       'wave:started',              // { waveNum }
  WAVE_CLEARED:       'wave:cleared',              // { waveNum }
  ENEMIES_THAW:       'enemy:thaw',                 // { enemies, chunkKey }
  ELITE_SPAWNED:      'enemy:eliteSpawned',        // { enemy, type }
  BOSS_SPAWNED:       'boss:spawned',              // { boss, name }
  BOSS_KILLED:        'boss:killed',               // { boss, name }
  ULTIMATE_USED:      'player:ultimateUsed',       // { character }

  // Arena
  ARENA_STARTED:      'arena:started',             // { center, radius }
  ARENA_COMPLETED:    'arena:completed',            // { kills, rescued }

  // Weapons
  WEAPON_FIRED:       'weapon:fired',              // { weapon, pos }
  WEAPON_EVOLVED:     'weapon:evolved',            // { weapon, fromLvl, toLvl }

  // Pickups
  CORE_PICKED_UP:     'core:pickedUp',             // { type, pos }
  RELIC_PICKED_UP:    'relic:pickedUp',             // { relicId }

  // Chaos
  CHAOS_STARTED:      'chaos:started',             // {}
  CHAOS_EVENT:        'chaos:event',               // { eventType, data }

  // Audio
  MUSIC_CHANGED:      'audio:musicChanged',        // { track }

  // UI
  ANNOUNCEMENT:       'ui:announcement',           // { text, color }
  SCREEN_SHAKE:       'ui:screenShake',            // { intensity, duration }
};
