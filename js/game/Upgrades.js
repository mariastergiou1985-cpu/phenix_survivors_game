import { CYAN, YELLOW, ORANGE, BLUE, PURPLE, MAGENTA, GREEN, GREY, RED } from '../constants.js';

// Rarity → neon accent color (border/glow). Common reads cyan/white, then blue, purple, gold.
export const RARITY_COLORS = {
  common:    '#8be9ff',
  rare:      '#4aa3ff',
  epic:      '#b66bff',
  legendary: '#ffd23c',
};

export class UpgradeDefinition {
  constructor(key, name, description, iconColor, maxLevel, applyFn, icon = null, rarity = 'common', char = null,
              requiredAchievement = null, endlessOnly = false) {
    this.key         = key;
    this.name        = name;
    this.description = description;
    this.iconColor   = iconColor;
    this.maxLevel    = maxLevel;
    this._applyFn    = applyFn;
    this.icon        = icon || name[0];   // short symbol/emoji drawn on the card
    this.rarity      = rarity;
    this.char        = char;   // null = global; otherwise only offered for that character id
    // Achievement Cards: only offered once the achievement is unlocked, and (endlessOnly) only
    // while in Endless. null/false leave a card unrestricted, so every existing card is unchanged.
    this.requiredAchievement = requiredAchievement;
    this.endlessOnly         = endlessOnly;
  }

  apply(player) {
    // `|| 0` keeps newly-introduced keys numeric even if never seeded in Player.upgrades.
    player.upgrades[this.key] = (player.upgrades[this.key] || 0) + 1;
    this._applyFn(player);
  }

  canApply(player) {
    return (player.upgrades[this.key] || 0) < this.maxLevel;
  }
}

// Curated pool — every card creates a noticeable improvement to a system the player uses.
// No stamina cards, no unbound abilities. (Burn Amplifier intentionally omitted: there is
// no general burn/DoT system to amplify, and adding one is out of scope for this pass.)
export const ALL_UPGRADES = [
  // ── Offense ──────────────────────────────────────────────────────────────
  new UpgradeDefinition(
    'Fire Rate', 'Rapid Fire', '+10% fire rate',
    ORANGE, 5, p => { p.fireRateBonus += 0.10; }, '⚡', 'common'
  ),
  new UpgradeDefinition(
    'Pulse Damage', 'Precision', '+1 shot damage',
    MAGENTA, 6, () => {}, '🎯', 'rare'   // damage read from upgrades dict in Player.shoot()
  ),
  new UpgradeDefinition(
    'Projectile Speed', 'Velocity', '+7% projectile speed',
    CYAN, 5, p => { p.projSpeedBonus += 0.07; }, '🚀', 'common'
  ),
  new UpgradeDefinition(
    'Cryo Rounds', 'Cryo Rounds', 'Shots slow enemies',
    BLUE, 4, () => {}, '❄️', 'rare'   // slow applied on projectile hit in Game._updateProjectiles
  ),
  new UpgradeDefinition(
    'Suppression', 'Suppression', 'Slows hit harder & longer',
    PURPLE, 3, () => {}, '🌀', 'epic'  // amplifies the slow applied on hit
  ),
  new UpgradeDefinition(
    'Glacial Shatter', 'Glacial Shatter', 'Slowed enemies shatter in a frost burst',
    BLUE, 3, () => {}, '🧊', 'epic'  // shatter rolled on hitting an already-slowed enemy in Game._updateProjectiles
  ),
  new UpgradeDefinition(
    'Homing Disc', 'Homing Disc', 'Auto-homing shots',
    GREEN, 4, () => {}, '◉', 'rare'
  ),
  // ── Survivability ────────────────────────────────────────────────────────
  new UpgradeDefinition(
    'Max HP', 'Fortress', '+20 max HP',
    RED, 5, p => { p.maxHp += 20; p.hp += 20; }, '❤️', 'epic'
  ),
  new UpgradeDefinition(
    'Max Mana', 'Mana Core', '+15 max mana',
    CYAN, 5, p => { p.maxMana += 15; p.mana += 15; }, '💙', 'rare'
  ),
  new UpgradeDefinition(
    'Firewall Protection', 'Firewall', '-2% overload rate',
    PURPLE, 5, () => {}, 'F', 'common'   // overload dampening computed from upgrades dict
  ),
  new UpgradeDefinition(
    'EMP Cloud', 'EMP Cloud', 'E: bigger stun burst',
    GREY, 4, () => {}, 'E', 'common'
  ),
  // ── Grid economy / Mobility ─────────────────────────────────────────────────
  new UpgradeDefinition(
    'Grid Investor', 'Grid Investor', '+10% Grid Credits, +2% Gold Core',
    YELLOW, 5, () => {}, '💰', 'legendary'  // credits ×Game._awardCredits; Gold chance ×PowerMatrix.stealCore
  ),
  new UpgradeDefinition(
    'Cyber-Legs', 'Move Speed', '+4% move speed',
    CYAN, 8, p => { p.speedBonus += 0.04; }, '»', 'common'
  ),
  new UpgradeDefinition(
    'Tractor Beam', 'Magnet', '+24 pickup range',
    BLUE, 6, p => { p.pickupRadius += 24; }, '◎', 'common'
  ),
  new UpgradeDefinition(
    'Memory Bank', 'Core Slots', '+1 core carry slot',
    YELLOW, 8, p => { p.maxCarry++; }, '▣', 'common'
  ),
  new UpgradeDefinition(
    'Quantum Overhaul', 'Auto-Recover', 'Auto-recovers cores',
    ORANGE, 4, () => {}, '↻', 'rare'
  ),
  new UpgradeDefinition(
    'Auto-Forge Drone', 'Auto-Forge Drone', 'Deploys a persistent combat drone',
    ORANGE, 2, () => {}, '🛸', 'legendary'  // persistent ally drones spawned/updated in Game._updateAllyDrones
  ),

  // ── Corrosive (global) — reuses the existing _corrosiveTimer DoT (Game._updateCorrosive) ──
  new UpgradeDefinition(
    'corrosive_payload', 'Corrosive Payload', 'Attacks may apply corrosive damage over time',
    GREEN, 3, () => {}, '☣', 'epic'
  ),

  // ── Character weapon mastery cards (level read by each weapon in Game.js; char-gated) ──
  // Skeleton Warrior — electric guitar / thunder / chain lightning identity
  new UpgradeDefinition('skeleton_primary_mastery', 'Storm Shots', '+12% primary damage & electric sparks',
    BLUE, 3, () => {}, '⚡', 'rare', 'skeleton_warrior'),
  new UpgradeDefinition('skeleton_chain_lightning_mastery', 'Chain Overload', 'Chain Lightning: +1 fork & +15% damage',
    BLUE, 3, () => {}, '🔗', 'epic', 'skeleton_warrior'),
  new UpgradeDefinition('skeleton_thunder_solo_mastery', 'Encore Solo', 'Thunder Solo: larger shockwave',
    PURPLE, 3, () => {}, '🎸', 'legendary', 'skeleton_warrior'),
  // Cyber Arm Hero — neon pierce beam / overheated heavy chains identity
  new UpgradeDefinition('cyber_primary_mastery', 'Arm Overdrive', '+12% primary damage & cyber sparks',
    ORANGE, 3, () => {}, '🦾', 'rare', 'cyber_arm_hero'),
  new UpgradeDefinition('cyber_neon_pierce_mastery', 'Neon Lance', 'Neon Pierce Beam: wider & stronger',
    CYAN, 3, () => {}, '➤', 'epic', 'cyber_arm_hero'),
  new UpgradeDefinition('cyber_heavy_chains_mastery', 'Molten Chains', 'Overheated Chains: larger heat radius',
    ORANGE, 3, () => {}, '⛓', 'legendary', 'cyber_arm_hero'),
  // Neon Taekwondo Girl — aqua spirit trail / dojang flag identity
  new UpgradeDefinition('taekwondo_primary_mastery', 'Tidal Kicks', '+12% primary damage & cyan kick arc',
    CYAN, 3, () => {}, '🌊', 'rare', 'taekwondo_girl'),
  new UpgradeDefinition('taekwondo_aqua_trail_mastery', 'Spirit Current', 'Aqua Spirit Trail: hits harder',
    CYAN, 3, () => {}, '💧', 'epic', 'taekwondo_girl'),
  new UpgradeDefinition('taekwondo_dojang_flag_mastery', 'Greater Dojang', 'Spirit Dojang Flag: larger aura',
    BLUE, 3, () => {}, '⚑', 'legendary', 'taekwondo_girl'),
  // Brawler Warrior — chakram / crescent claw / skyfall lances identity
  new UpgradeDefinition('brawler_chakram_mastery', 'Razor Chakram', 'Nexus Chakram: +1 pierce & stronger return',
    GREEN, 3, () => {}, '◎', 'rare', 'brawler_warrior'),
  new UpgradeDefinition('brawler_crescent_claw_mastery', 'Rift Render', 'Crescent Rift Claw: larger, faster arc',
    GREEN, 3, () => {}, '⟢', 'epic', 'brawler_warrior'),
  new UpgradeDefinition('brawler_skyfall_lances_mastery', 'Lance Storm', 'Skyfall Lances: extra lances & wider impact',
    CYAN, 3, () => {}, '⇣', 'legendary', 'brawler_warrior'),
  // Assassin Clone — plasma daggers / whip-sword / chrome phantom identity (neon pink)
  new UpgradeDefinition('assassin_clone_twin_dagger_mastery', 'Twin Dagger Mastery', 'Plasma Twin Daggers: +damage & wider slash arc',
    MAGENTA, 3, () => {}, '🗡', 'rare', 'assassin_clone'),
  new UpgradeDefinition('assassin_clone_whip_sword_mastery', 'Whip-Sword Mastery', 'Plasma Whip-Sword: +range, +damage & light pierce',
    MAGENTA, 3, () => {}, '🌀', 'epic', 'assassin_clone'),
  new UpgradeDefinition('assassin_clone_chrome_phantom_mastery', 'Chrome Phantom Mastery', 'Chrome Phantom Protocol: longer & larger clone assault',
    PURPLE, 3, () => {}, '👥', 'legendary', 'assassin_clone'),

  // ── Achievement Cards (Endless-only; only offered once their achievement is unlocked) ──
  // Global (char=null) so they can roll for any character. Instant-stat cards apply in applyFn
  // (safe — only ever offered in Endless); multiplier cards apply per-frame via _cardLvl in
  // Game.js Endless-gated helpers. requiredAchievement = the unlock id from ENDLESS_ACHIEVEMENTS.
  new UpgradeDefinition('achievement_endless_spark', 'Endless Spark', 'Endless: +8% XP gain per level',
    MAGENTA, 3, p => { p.xpMult = (p.xpMult || 1) * 1.08; }, '✦', 'epic', null, 'first_endless', true),
  new UpgradeDefinition('achievement_survivor_plating', 'Survivor Plating', 'Endless: +8% max HP per level',
    GREEN, 3, p => { const add = Math.round(p.maxHp * 0.08); p.maxHp += add; p.hp = Math.min(p.maxHp, p.hp + add); }, '🛡', 'epic', null, 'endless_survivor', true),
  new UpgradeDefinition('achievement_grid_stabilizer', 'Grid Stabilizer', 'Endless: further reduces Overload pressure (capped)',
    CYAN, 2, () => {}, '◈', 'legendary', null, 'grid_legend', true),
  new UpgradeDefinition('achievement_evolution_algorithm', 'Evolution Algorithm', 'Endless: your mastery cards appear more often',
    BLUE, 2, () => {}, '⟳', 'epic', null, 'level_breaker', true),
  new UpgradeDefinition('achievement_damage_uplink', 'Damage Uplink', 'Endless: +6% damage per level',
    ORANGE, 3, () => {}, '⇑', 'epic', null, 'score_hunter', true),
  new UpgradeDefinition('achievement_combo_overdrive', 'Combo Overdrive', 'Endless: stronger damage while combo is high',
    YELLOW, 2, () => {}, '⚜', 'legendary', null, 'combo_master', true),
  new UpgradeDefinition('achievement_core_magnetizer', 'Core Magnetizer', 'Endless: +1 carried-core capacity per level',
    PURPLE, 2, p => { p.maxCarry += 1; }, '◉', 'epic', null, 'core_defender', true),
];

// ─── Weighted sample: every card is useful; bias toward the player's current build ──
// New cards stay common (weight 3); cards already invested in are weighted higher so
// the offered set leans into the build the player is forming (and reroll does the same).
export function weightedSample(player, n = 3, ctx = {}) {
  const { meta = null, endless = false } = ctx;
  // Character mastery cards only offer for the matching character; global cards always eligible.
  // Achievement Cards additionally require their achievement unlocked + (endlessOnly) Endless.
  const eligible = ALL_UPGRADES.filter(u =>
    u.canApply(player) &&
    (!u.char || u.char === player.selectedCharacter) &&
    (!u.requiredAchievement || (meta && meta.hasAchievement(u.requiredAchievement))) &&
    (!u.endlessOnly || endless));
  if (!eligible.length) return [];

  // Weapon Evolution Protocol / Evolution Algorithm card: in Endless, nudge the current
  // character's mastery cards to appear a little more often. Small — does not flood the pool.
  const masteryBoost = (endless && meta && meta.hasAchievement('level_breaker'))
    ? 1 + 0.25 + 0.15 * (player.upgrades['achievement_evolution_algorithm'] || 0)
    : 1 + 0.15 * (endless ? (player.upgrades['achievement_evolution_algorithm'] || 0) : 0);
  const weightOf = u => {
    const lvl  = player.upgrades[u.key] || 0;
    let   w    = lvl === 0 ? 3 : 2 + lvl;
    if (u.char && u.char === player.selectedCharacter) w *= masteryBoost;
    return w;
  };

  const chosen = [];
  const pool   = [...eligible];
  const poolW  = eligible.map(weightOf);

  for (let i = 0; i < Math.min(n, pool.length); i++) {
    let r   = Math.random() * poolW.reduce((a, b) => a + b, 0);
    let idx = 0;
    while (r > poolW[idx]) { r -= poolW[idx]; idx++; }
    chosen.push(pool[idx]);
    pool.splice(idx, 1);
    poolW.splice(idx, 1);
  }

  return chosen;
}
