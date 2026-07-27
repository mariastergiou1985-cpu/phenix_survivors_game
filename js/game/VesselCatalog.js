/**
 * VesselCatalog.js — PHENIX: NULL EDEN
 * ─────────────────────────────────────
 * Data-only vessel definitions. Each vessel has a sprite, cost,
 * passive ability, and stat modifiers applied at run start.
 * No gameplay logic — that lives in Game.js / Player.js.
 */

export const VESSELS = Object.freeze([
  {
    id: 'alpha_phoenix',
    name: 'Alpha Phoenix',
    role: 'Balanced Starter',
    spritePath: 'assets/enemies/vessels/alpha_phoenix.png',
    desc: 'Balanced vessel. No extreme bonuses or weaknesses — the iconic default ship.',
    costGrids: 0,
    costFragments: 0,
    unlockByDefault: true,
    passive: null,
    // Every equipped vessel flies a companion that fires auto-aiming rockets (Game._tickVesselRockets:
    // 70 damage, 95px AoE, 1.5s cooldown, 720px reach, live from t=0). It is gated only on a vessel
    // being equipped, so it belongs to no vessel's kit in particular - and measured across five
    // vessels it carries 32.6%-55.4% of a run's total damage. The old line here read
    // 'No passive — balanced baseline', which the character-select card renders verbatim, so the
    // player was told the starter ship does nothing while it ran the largest character-agnostic
    // damage source in the game. alpha_phoenix genuinely has no EXTRA passive and no stat modifier;
    // that is what this now says, without implying it has no attack.
    passiveDesc: 'Baseline companion rockets. No extra passive, no stat modifiers.',
    statMods: {},
  },
  {
    id: 'grid_eraser',
    name: 'Grid Eraser',
    role: 'Crowd Clear',
    spritePath: 'assets/enemies/vessels/grid_eraser.png',
    desc: 'Every 10 seconds, emits a pulse that kills small enemies in radius. Strong crowd clearer.',
    costGrids: 5000,
    costFragments: 2,
    unlockByDefault: false,
    passive: 'grid_erase_pulse',
    passiveDesc: 'Every 10s, pulse kills small enemies nearby.',
    statMods: {},
  },
  {
    id: 'null_singularity',
    name: 'Null Singularity',
    role: 'Black-Hole Control',
    spritePath: 'assets/enemies/vessels/null_singularity.png',
    desc: 'Permanent singularity aura pulls enemies inward and deals continuous damage. High risk, high control.',
    costGrids: 0,
    costFragments: 12,
    unlockByDefault: false,
    passive: 'singularity_aura',
    passiveDesc: 'Permanent pull aura + continuous damage.',
    statMods: {},
  },
  {
    id: 'glitch_phantom',
    name: 'Glitch Phantom',
    role: 'Fragile Evasion',
    spritePath: 'assets/enemies/vessels/glitch_phantom.png',
    desc: '30% less max HP, but 50% chance to ignore incoming damage with Glitch Dodge.',
    costGrids: 0,
    costFragments: 0,
    unlockByDefault: false,
    unlockCondition: 'Survive 20:00 in Endless',
    passive: 'glitch_dodge',
    passiveDesc: '-30% HP, 50% chance to dodge hits.',
    statMods: { maxHpMult: 0.7 },
  },
  {
    id: 'overclocked_vanguard',
    name: 'Overclocked Vanguard',
    role: 'Assault Fire-Rate',
    spritePath: 'assets/enemies/vessels/overclocked_vanguard.png',
    desc: '+25% fire rate on all weapons, but enemies move 10% faster toward you.',
    costGrids: 10000,
    costFragments: 5,
    unlockByDefault: false,
    passive: 'overclocked_assault',
    passiveDesc: '+25% fire rate, enemies 10% faster.',
    statMods: { fireRateMult: 1.25, enemySpeedMult: 1.10 },
  },
]);

// Quick lookup
const _vesselIndex = new Map(VESSELS.map(v => [v.id, v]));
export function getVesselById(id) { return _vesselIndex.get(id) || _vesselIndex.get('alpha_phoenix'); }
export function getDefaultVesselId() { return 'alpha_phoenix'; }
