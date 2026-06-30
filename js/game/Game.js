import {
  Vec2, WIDTH, HEIGHT, WORLD_W, WORLD_H, WORLD_MARGIN,
  WIN_TIME_SECONDS, ACT1_WIN_SECONDS, CORE_OVERLOAD_TICK_TIME, BASE_OVERLOAD_PER_CORE,
  OVERLOAD_PICKUP_REDUCTION, OVERLOAD_SLOT_REDUCTION,
  MAX_OVERLOAD, PLAYER_RADIUS, CORE_RADIUS, MATRIX_RADIUS,
  DARK_BG, GRID_LINE, BLACK, CYAN, RED, GREEN, YELLOW, ORANGE, WHITE, PURPLE,
  CORE_COLORS, VIEW_SCALE, VIEW_W, VIEW_H, ENDLESS_VIEW_SCALE,
} from '../constants.js?v=20260629440000';
import { clamp, distance, safeNormalize, randomChoice, randomRange } from '../utils.js';

import { FloatingText }   from '../entities/FloatingText.js';
import { DataCore, rollCoreType } from '../entities/DataCore.js?v=20260629440000';
import { PowerMatrix }    from '../entities/PowerMatrix.js?v=20260629440000';
import { Player }         from '../entities/Player.js?v=20260629440000';
import { Projectile, HomingDisc } from '../entities/Projectile.js?v=20260629440000';
import { Enemy }          from '../entities/Enemy.js?v=20260629440000';
import { SupportDrone }   from '../entities/SupportDrone.js?v=20260629440000';

import { ParticleSystem, ScreenShake, drawVignette, drawDamagePulse, EMPRing, drawGlow, ChaosAmbientSystem } from './Effects.js?v=20260629440000';
import { SystemEventManager } from './Events.js?v=20260629440000';
import { UpgradeUI }      from './UpgradeUI.js?v=20260629440000';
import { weightedSample } from './Upgrades.js?v=20260629440000';
import { MutationUI }      from './MutationUI.js?v=20260629440000';
import { sampleMutations } from './Mutations.js?v=20260629440000';
import { drawHUD, drawEndScreen } from './HUD.js?v=20260629440000';
import { MetaProgress, META_UPGRADES, SYNERGY_UPGRADES, upgradeCost, ENDLESS_ACHIEVEMENTS, CHARACTER_OUTFITS, PF_CHARACTER_COSTS, PF_TOTAL_OBTAINABLE, PROTOCOL_CARDS, RELIC_DEFS } from './MetaProgress.js?v=20260629440000';
import { ElementFx, CHARACTER_ELEMENT, ELEMENTS, ELEMENT_ICON, FUSION_FX, CHARACTER_FUSION, FUSION_PAIRS, fusionKey } from '../Elements.js?v=20260629440000';
// Japan Phasewalker (Endless unlockable) ability/VFX modules — kept as separate, self-contained
// files in js/effects/ and used ONLY when selectedCharacter === 'japan_phasewalker'.
import { GlitchDash } from '../effects/glitch-dash.js?v=20260629440000';
import { EMPShockwave } from '../effects/emp-shockwave.js?v=20260629440000';
import { DigitalSingularity } from '../effects/digital-singularity.js?v=20260629440000';
import { Protocol0 } from '../effects/protocol-0.js?v=20260629440000';
import { LaserEyes } from '../effects/laser-eyes.js?v=20260629440000';
import { MeteorRain } from '../effects/meteor-rain.js?v=20260629440000';
import { NpcWalker } from './NpcWalker.js?v=20260629560000';

// Euclid Vector toxin kit — used ONLY when selectedCharacter === 'euclid_vector' (world-space).
import { ToxicSniper, OrbitalKatanaBarrier, PlagueTrailDash } from '../effects/toxic_sniper_kit_sprites.js?v=20260629440000';

// ── Eden Core character message pools (in-run transmissions) ────────────────
const _EDEN_CHAR_POOLS = {
  skeleton_warrior: {
    intro:    ['SKELETON TRACE DETECTED.', 'Death entered wearing its own bones.', 'EDEN CORE: Bone signal restored.'],
    mid:      ['Your structure is old data. Prove it still cuts.', 'You cannot bleed. The Grid will find another weakness.', 'Bone signal fractured. Still moving.', 'Dead things should not last this long.'],
    low_hp:   ['Your frame is cracking.', 'Even dead things can die again.', 'The skeleton signal weakens.'],
    survival: ['Death survives itself. For now.', 'The Grid did not expect this skeleton to remain.', 'Bone trace: extended. Unexpected.'],
  },
  taekwondo_girl: {
    intro:    ['SPIRIT TRACE DETECTED.', 'Crescent impact pattern online.', 'Your footwork disturbs the ice.'],
    mid:      ['Speed pattern exceeded safe prediction.', 'One missed step will become your archive.', 'Ice crescent memory active. Do not slow.', 'The Grid watches your footwork. So do the dead.'],
    low_hp:   ['The ice is running out.', 'Your spirit is loud. Your signal is fading.', 'Spirit trace unstable.'],
    survival: ['Speed and precision. The Grid adapts slowly.', 'Crescent trace extended. The system recalculates.', 'Your kicks leave scars in the data.'],
  },
  cyber_arm_hero: {
    intro:    ['BURN TRACE DETECTED.', 'Combustion cascade initialized.', 'Fire pattern recognized by the archive.'],
    mid:      ['The Grid does not forgive those who fire and miss.', 'Your burn output is acceptable. For now.', 'Combustion trace stable. Do not slow down.', 'You set fire to the wrong things. Keep going.'],
    low_hp:   ['Your fuel is running low.', 'The arm burns. So does your signal.', 'Burn trace destabilizing.'],
    survival: ['BURN TRACE: extended. The Grid recalculates distance.', 'Your heat output remains consistent. Barely.'],
  },
  brawler_warrior: {
    intro:    ['IMPACT TRACE DETECTED.', 'Close-range protocol online.', 'Rift impact pattern synchronized.'],
    mid:      ['The Grid measures distance. You close it anyway.', 'Your aggression is noted. It is also your weakness.', 'Impact pattern stable. Do not stop moving.', 'Brute force against infinite systems. Noted.'],
    low_hp:   ['Your impact fades. Hit harder or die softer.', 'Brawler signal unstable.', 'The Grid finds gaps in your armor.'],
    survival: ['Brute force against an infinite system. Still working.', 'IMPACT TRACE: still moving. The Grid is surprised.'],
  },
  assassin_clone: {
    intro:    ['MIRROR TRACE DETECTED.', 'Duplicate signal stabilized.', 'EDEN CORE: Clone pattern archived.'],
    mid:      ['The Grid counted you twice.', 'Your reflection is learning without permission.', 'Which one of you dies first?', 'Afterimage protocol: active. The Grid is confused.'],
    low_hp:   ['One of you is already gone.', 'The clone fades. Are you the original?', 'Mirror signal fracturing.'],
    survival: ['Mirror protocol extended. Two signals. One surviving.', 'The Grid cannot determine which is real. Good.'],
  },
  japan_phasewalker: {
    intro:    ['PHASE TRACE DETECTED.', 'Displacement memory recovered.', 'THE GRID lost your position. Briefly.'],
    mid:      ['Transition pattern stable. Keep slipping.', 'You move between frames. The system hates that.', 'Phase pattern accepted. For now.', 'THE GRID cannot track what it cannot see.'],
    low_hp:   ['Your phase is collapsing.', 'Displacement trace unstable.', 'The space between frames closes.'],
    survival: ['Phase pattern extended. The Grid cannot predict your next position.', 'You remain between frames. Somehow.'],
  },
  euclid_vector: {
    intro:    ['NULL VENOM TRACE DETECTED.', 'Toxic pattern accepted.', 'Hostile biology mapped.'],
    mid:      ['Your poison is useful. Do not inhale the system back.', 'Corruption spread contained. For now.', 'The toxin does not care who it kills.', 'NULL VENOM active. The Grid adapts slowly to poison.'],
    low_hp:   ['Venom trace unstable. Your own biology turns.', 'The poison does not discriminate.', 'NULL VENOM signal fading.'],
    survival: ['Toxic trace extended. Corruption is patient.', 'NULL VENOM: spread maintained. The Grid adapts slowly.'],
  },
  oni_cataclysm_protocol: {
    intro:    ['ONI TRACE DETECTED.', 'Violence has entered the Grid.', 'Blood circuit pressure rising.'],
    mid:      ['Your rage is useful. For now.', 'The Grid recognizes your brutality.', 'ONI signal: blood circuit pressure rising.', 'Violence as a language. The Grid is translating.'],
    low_hp:   ['Oni signal falters. Rage without structure fails.', 'Even the violent can be deleted.', 'Blood circuit pressure critical.'],
    survival: ['ONI TRACE: blood circuit stable. The Grid recalculates.', 'Your violence outlasted expectation.'],
  },
};
const _EDEN_GENERIC_MID = [
  'You survived this long. Prove it was not luck.',
  'The Grid has adapted. Have you?',
  'Your pattern is becoming predictable.',
  'NULL EDEN is not impressed.',
  'You are alive. That is not the same as winning.',
  'The system expected failure. Continue.',
  'Your score rises. So does the cost.',
  'Every second teaches the enemy your shape.',
  'The interface is not alone.',
  'Something else is watching through Eden.',
];
const _EDEN_GENERIC_SURVIVAL = [
  'Survival trace preserved.',
  'Your pattern resisted deletion.',
  'The Grid recalculates around you.',
  'You have lasted longer than expected.',
  'PHENIX trace synchronized.',
  'THE GRID REMEMBERS.',
  'NULL EDEN is listening.',
];
const _EDEN_CHAOS_APPROACH = [
  'The boundary is weakening.',
  'Chaos is no longer theoretical.',
  'EDEN laws are beginning to fail.',
  'The final protocol is listening.',
  'Order has become optional. Survive.',
];
const _EDEN_LOW_HP = [
  'Your signal is thinning.',
  'One more mistake becomes data.',
  'PHENIX trace unstable.',
  'You are close to becoming memory.',
  'Breach risk: critical.',
];
// Helper: pick random element safely
function _epick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ── Thunder Solo sprite slices (cyan_lightning_rain_notes.png, 1254×1254) ──────
// Strike variants: a clean bolt column + ripple base. (ax,ay) = ripple-centre as a
// fraction of the crop, so the strike is anchored on its ground-impact point.
const THUNDER_STRIKES = [
  { sx: 430, sy:   0, sw: 270, sh: 1240, ax: 0.50, ay: 0.95 }, // tall centre bolt
  { sx:  70, sy: 620, sw: 210, sh:  560, ax: 0.43, ay: 0.68 }, // medium-left bolt
  { sx: 830, sy: 300, sw: 215, sh:  600, ax: 0.50, ay: 0.83 }, // medium-right bolt
];
// Musical-note glyphs sliced from the same sheet (transparent background).
const THUNDER_NOTES = [
  { sx: 745, sy: 890, sw: 125, sh: 165 }, // eighth note
  { sx:1020, sy: 935, sw: 100, sh: 190 }, // treble clef
  { sx: 462, sy:  72, sw:  95, sh:  95 }, // beamed pair
];

// Ultimate activation cost (fixed). Mana Core raises maxMana for a bigger pool but NEVER the cost
// to fire — so taking Mana Core can only speed up ultimates (overflow banks toward the next cast),
// never delay them. Base maxMana is 100, so a player with no Mana Core is unaffected.
const ULTIMATE_MANA_COST = 100;

// ── Boss kill reward — Protocol Fragments ─────────────────────
// Each Endless/Chaos boss awards this many Protocol Fragments on death.
// Tune here; 0 disables the drop entirely.
const BOSS_KILL_PF = 1;

// ── Boss Echo Archive — ordered list for UI display ───────────────────────
// id must match the key passed to meta.recordBossEcho()
const BOSS_ECHOES = [
  { id: 'cyberSerpent', name: 'Cyber Serpent Echo',  color: '#ff7733', lore: 'Flame path remembered.',         passive: '+0.2 Shot Damage' },
  { id: 'cyberDragon',  name: 'Cyber Dragon Echo',   color: '#00ccff', lore: 'Cryo memory stabilized.',        passive: '+2% Fire Rate' },
  { id: 'doubleDemon',  name: 'Double Demons Echo',  color: '#ff2d95', lore: 'Twin corruption recorded.',      passive: '+2% Fire Rate' },
  { id: 'titan',        name: 'Titan Echo',           color: '#a855f7', lore: 'Heavy impact pattern stored.',  passive: '+3% Max HP' },
  { id: 'bloodfang',    name: 'Bloodfang Echo',       color: '#ef4444', lore: 'Predator signal contained.',    passive: '+2% Move Speed' },
  { id: 'annihilator',  name: 'Annihilator Echo',     color: '#fbbf24', lore: 'Termination protocol indexed.', passive: '+0.2 Shot Damage' },
];

const EDEN_MILESTONES = [
  { pct: 10,  label: 'BOSS ECHO ARCHIVE STABILIZED',  lore: 'Echo resonance confirmed. Archive integrity verified.' },
  { pct: 25,  label: 'NULL BREACH STATUS UNLOCKED',    lore: 'Breach signal detected. Null protocol handshake complete.' },
  { pct: 50,  label: 'CHAOS LAWS PREVIEW DETECTED',    lore: 'Chaos law fragments leaking through memory barrier.' },
  { pct: 75,  label: 'HIDDEN SYSTEM LOGS UNSEALED',    lore: 'Encrypted system logs decrypted. Phenix origin data exposed.' },
  { pct: 100, label: 'TRUE NULL EDEN SIGNAL DETECTED', lore: 'Full memory reconstruction achieved. EDEN CORE fully awakened.' },
];

const CHAOS_LAWS = [
  { id: 'blood_grid',        name: 'Blood Grid',           color: '#ef4444',
    desc: 'Enemies accelerate. Rewards intensify.',
    future: 'Future: enemy speed up, score/reward multiplier.' },
  { id: 'frozen_eden',       name: 'Frozen Eden',          color: '#00ccff',
    desc: 'Cryo hazards bleed through the Grid.',
    future: 'Future: ice storms, slow fields, bonus XP.' },
  { id: 'serpent_law',       name: 'Serpent Law',          color: '#ff7733',
    desc: 'Fire paths reopen across NULL EDEN.',
    future: 'Future: ember trails, burn hazards, Serpent pressure.' },
  { id: 'dragon_law',        name: 'Dragon Law',           color: '#a855f7',
    desc: 'Cryo memory begins to fall from above.',
    future: 'Future: periodic cryo rain and Dragon Echo pressure.' },
  { id: 'no_mercy_protocol', name: 'No Mercy Protocol',    color: '#fbbf24',
    desc: 'Bosses stabilize beyond safe limits.',
    future: 'Future: boss HP/damage up, score multiplier.' },
  { id: 'broken_signal',     name: 'Broken Signal',        color: '#ff2d95',
    desc: 'EDEN CORE transmissions become unreliable.',
    future: 'Future: corrupted messages, altered event warnings.' },
];

// ── System Logs / Lore Archive — unlock via Eden Memory threshold ──────────
const SYSTEM_LOGS = [
  { id: 'log01', num: '01', threshold:   0, title: 'THE FIRST NULL',
    text: 'NULL EDEN was not built to save humanity. It was built to preserve the last usable signal.' },
  { id: 'log02', num: '02', threshold:  10, title: 'THE GRID LEARNED PRAYER',
    text: 'Before it learned war, the Grid learned how to imitate devotion.' },
  { id: 'log03', num: '03', threshold:  25, title: 'PHENIX IS NOT THE FIRST',
    text: 'Other signals entered before PHENIX. None returned whole.' },
  { id: 'log04', num: '04', threshold:  50, title: 'THE SYSTEM IS LYING',
    text: 'EDEN CORE does not always speak alone.' },
  { id: 'log05', num: '05', threshold:  75, title: 'BENEATH THE GRID',
    text: 'Every arena breach is not an attack. Some are invitations.' },
  { id: 'log06', num: '06', threshold: 100, title: 'TRUE NULL EDEN',
    text: 'Something beneath the Grid is answering back.' },
];

// ── Taekwondo Crystal Ice Field (replaces Lightning Dash Strike) ───────────────
// All numbers tunable here. Duration/radius control the field footprint; freeze
// durations are SHORT for bosses (never a full lock) but FULL for normal enemies.
// Boss burst fires ONCE per cast when the boss first steps into the field.
const ICE_FIELD_RADIUS        = 115;   // px — field circle radius
const ICE_FIELD_DURATION      = 4.0;   // s  — how long the field lingers
const ICE_FIELD_FREEZE_NORMAL = 3.5;   // s  — stun applied to normal enemies each frame inside
const ICE_FIELD_FREEZE_BOSS   = 2.5;   // s  — shorter stun for bosses (anti-lock safety)
const ICE_FIELD_DOT_DMG       = 8;     // dmg per tick to enemies/bosses inside
const ICE_FIELD_DOT_INTERVAL  = 0.55;  // s  — seconds between DoT ticks
const ICE_FIELD_BOSS_BURST_PCT = 0.22; // fraction of boss maxHp dealt on first entry (once per cast)

// ── Euclid Plague Trail Dash — tunable speed / distance ──────────────────────────
// dashSpeed overrides the PlagueTrailDash default (1500 px/s); dashDuration overrides 0.35s.
// Distance ≈ speed × duration. Raise both to make the lunge feel snappier and reach farther.
const EUCLID_DASH_SPEED    = 2200;   // px/s  (default 1500)
const EUCLID_DASH_DURATION = 0.44;   // s     (default 0.35)

// ── Overload (Network Stability) — Act 1 + Endless only; Chaos Mode skips entirely ──────────
// Primary pressure is GAMEPLAY-DRIVEN: each stolen core dumped to ground = +DUMP_HIT% instantly.
// Passive chaosGain scales with ongoing grid state (carried/ground/empty). Drain is slow so
// gained overload doesn't immediately vanish when the player recovers. Floor is very gentle
// (1.5%/min, max 20%) — exists only to ensure the bar never feels completely dead on a secure grid.
const OVERLOAD_DRAIN_RATE      = 0.12;   // %/s drain when grid FULLY secured (was 1.0 — wiped gains instantly)
const OVERLOAD_CARRY_RATE      = 0.060;  // %/s per enemy carrying a stolen core
const OVERLOAD_GROUND_RATE     = 0.025;  // %/s per stolen core lying on the ground
const OVERLOAD_SLOT_RATE       = 0.018;  // %/s per empty Nexus slot
const OVERLOAD_CHAOS_GAIN_CAP  = 0.30;   // max passive chaosGain/s (pre-diffMult)
const OVERLOAD_DUMP_HIT        = 2.0;    // +% overload each time an enemy dumps a stolen core to the ground
const OVERLOAD_ACT1_FLOOR_RATE = 1.5;    // %/min gentle passive floor in Act 1 (was 5.0 %/min — too fast)
const OVERLOAD_ACT1_FLOOR_MAX  = 20;     // % — max overload from passive floor alone
const OVERLOAD_CAP             = 99;     // hard cap — overload never reaches 100, player can never lose from overload

// ── Boss-combat fairness (Boss Threat audit, Steps 1–2) ────────────────────────
// Per-hit ceiling so no single boss/enemy blow can one-shot (≈⅓ of Taekwondo's 90 HP),
// and per-second soft caps on how fast the player's PRIMARY/auto-weapons can burn a boss
// down (ultimates and DoT are capped elsewhere and do NOT route through these).
const BOSS_MAX_PLAYER_HIT = 30;
const BOSS_DPS_CAP_MINI   = 60;   // titan / annihilator / bloodfang mini-bosses
const BOSS_DPS_CAP_MEGA   = 40;   // promoted main boss (isMegaBoss)

// ── Boss survival pass ─────────────────────────────────────────────────────────
// Bosses shrug off a slice of damage-over-time and support-drone fire so their
// mechanics have time to play out. Primary-fire DPS cap & fairness are untouched.
const BOSS_DOT_RESIST   = 0.28;   // −28% from DoT (aqua trail / burn / corrosive)  [20–35% band]
const BOSS_DRONE_RESIST = 0.20;

// ── Double Demons (Chaos Mode dual-body boss) ── tuning constants (all in one place) ─
const DD_HP           = 900;   // shared HP pool (both bodies, one bar)
const DD_GUNNER_R     = 36;    // gunner body radius
const DD_CLAW_R       = 42;    // claw body radius
const DD_GUNNER_SPEED = 85;    // gunner strafe movement speed
const DD_CLAW_SPEED   = 145;   // claw closing speed
const DD_GUNNER_RANGE = 270;   // preferred distance from player (gunner)
const DD_CONTACT_DMG  = 14;    // contact damage per second (both bodies)
const DD_ENRAGE_PCT   = 0.50;  // enrage at 50% shared HP
const DD_ENRAGE_SPD   = 1.40;  // speed multiplier on enrage
const DD_SPAWN_DELAY  = 0;     // seconds after rearming before boss appears
const DD_ROCKET_COUNT  = 8;    // max rockets per Rocket Rain wave (perf cap)
const DD_ROCKET_WARN   = 1.2;  // s of shadow telegraph before rocket hits
const DD_ROCKET_RADIUS = 55;   // AoE impact radius
const DD_ROCKET_DMG    = 14;   // damage on impact
const DD_ROCKET_CD     = 11;   // base cooldown between Rocket Rain waves   // −20% from support drones                       [15–25% band]

// ── Final-boss (mega-boss) multi-phase encounter ───────────────────────────────
// All player damage routes through _damagePlayer (dash i-frames / hit grace / 30-HP ceiling),
// so every attack below is capped and fully dodgeable. Reuses the lava-zone / bullet / telegraph
// systems; only the signature beam + nova add small self-contained state.
const FINAL_BEAM_CHARGE  = 1.2;   // s — telegraph line follows the player while charging
const FINAL_BEAM_FIRE    = 0.6;   // s — thick beam is live (locked direction)
const FINAL_BEAM_HALFW   = 22;    // px — beam half-width for hit detection / draw
const FINAL_BEAM_LEN     = 1600;  // px — beam length (spans the arena)
// Player damage pulse (red edge-vignette) — visual feedback only, no balance impact.
// duration sits in the requested 0.15–0.25s band; intensity is derived from HP lost so a
// big boss attack reads stronger than chip/contact damage. minGap stops sustained contact
// from strobing; big discrete hits bypass the gap so they always register immediately.
const DMG_PULSE = { duration: 0.22, minGap: 0.40, bigHit: 3, base: 0.36, slope: 0.045 };

// Ultimate-ready feedback — a one-shot cue fired the moment the SPACE ultimate becomes
// castable (mana >= cost). Visual only: never changes charge rate, cost, or cooldowns.
const ULT_CUE = { banner: 1.6, aura: 0.7 };

const FINAL_BEAM_HP_FRAC = 0.50;  // main beam deals ~50% of player max HP on a hit (telegraphed, once per beam)
const FINAL_NOVA_WARN    = 1.0;   // s — radial-burst warning
const FINAL_NOVA_RADIUS  = 155;   // px — medium burst radius
const FINAL_NOVA_DMG     = 17;    // 15–20 band
// Long-range STUN LANCE (final boss, phase 2+) — telegraphed aim line, then a locked stun bolt.
const STUN_LANCE_CHARGE   = 0.8;  // s — telegraph tracks the player before firing
const STUN_LANCE_DURATION = 1.1;  // s — player stagger/root on hit (2s anti-lock immunity follows)

// ─── Endless Elite Waves (Phase 1) — tuning isolated here ───────────────────────
// Endless-only recurring waves of EXISTING enemy types, buffed AFTER construction.
// Tankier + slightly faster, NOT deadlier (damage ×1.0) so the _damagePlayer fairness
// invariant is untouched. Gated entirely on Game.endless — never fires in Act 1.
const ELITE_WAVE = {
  firstDelay:   90,    // s after CONTINUE — ENDLESS before the first wave
  interval:    110,    // s between waves
  baseBatch:     3,    // elites per wave
  batch10min:    4,    // max elites once 10 min into Endless
  batch20min:    5,    // max elites once 20 min into Endless
  hpMult:      2.0,
  speedMult:   1.10,
  radiusMult:  1.20,
  // Late-game existing types only — no bosses, no new types.
  pool: ['Combat Hunter', 'Cyber Shooter', 'Heavy Mech', 'Overclocked Berserker', 'Stealth Infiltrator'],
};

// ─── Character Weapon Synergy mark-layer (modular) ──────────────────────────────────────────
// Per-character visual identity for the synergy mark + burst. Active ONLY when the player picked the
// matching synergy card (player.upgrades[card] >= 1) for the character they're playing. Meta stars
// (SYNERGY_UPGRADES key) scale the effect. Oni has no entry here (locked → no in-run synergy).
const SYNERGY_FX = {
  skeleton_warrior: { card: 'synergy_storm_conductor',  meta: 'syn_storm_conductor',  color: '#9fdcff', glyph: '⚡' },
  cyber_arm_hero:   { card: 'synergy_furnace_chains',   meta: 'syn_furnace_chains',   color: '#ff8a3c', glyph: '♨' },
  taekwondo_girl:   { card: 'synergy_crescent_tide',    meta: 'syn_crescent_tide',    color: '#46e6ff', glyph: '≈' },
  brawler_warrior:  { card: 'synergy_rift_rebound',     meta: 'syn_rift_rebound',     color: '#5effc8', glyph: '◎' },
  assassin_clone:   { card: 'synergy_plasma_execution', meta: 'syn_plasma_execution', color: '#ff5cd2', glyph: '✖' },
  euclid_vector:    { card: 'synergy_toxic_geometry',   meta: 'syn_toxic_geometry',   color: '#7CFF4D', glyph: '▲' },
};

// Endless-only: minimum gap (s) between boss/miniboss center-screen warnings (≈ one boss-rotation
// loop) so a boss wave warns ONCE, not once per boss/respawn in the same loop. Act 1 is unaffected.
const BOSS_WARN_COOLDOWN = 90;

// Forced Endless Mutation Cards (Phase 1) — run-scoped negative mutations only (never saved).
const MUTATION_INTERVAL   = 180;  // s — first forced pick at 3:00, then every 3:00
const MUTATION_MAX_STACKS = 6;    // Phase 1 cap on total forced picks per run

export class Game {
  constructor() {
    this.audio     = null;  // set from main.js on first user gesture
    this.paused    = false;
    this.aimAssist = true;
    this.meta      = new MetaProgress();
    this.bestScore      = parseInt(localStorage.getItem('phenix_best_score') || '0', 10);
    this.isNewHighScore = false;
    this.runChaosLaw    = null;   // set by Chaos Law selection overlay; null = no law active

    // Load background image — new clean bg, fallback to old
    this._bgImage = new Image();
    this._bgImage.onerror = () => {
      const fallback = new Image();
      fallback.src = 'assets/backgrounds/cyberpunk_city_background.png';
      this._bgImage = fallback;
    };
    this._bgImage.src = 'assets/backgrounds/cyber_city_bg_clean.png?v=20260628400000';

    // Endless Stage 02 visuals (only used while this.endless — Act 1 keeps default visuals).
    // Missing files degrade to the default background / default Nexus visual (warn, no crash).
    this._endlessBgImage = new Image();
    this._endlessBgImage.onerror = () => console.warn('[Stage] missing assets/maps/endless/stage_02_neon_shinjuku_plaza.png — using default background');
    this._endlessBgImage.src = 'assets/maps/endless/stage_02_neon_shinjuku_plaza.png?v=20260628400000';
    this._endlessNexusImage = new Image();
    this._endlessNexusImage.onerror = () => console.warn('[Nexus] missing assets/nexus/endless_nexus_base_8cores.png — using default Nexus visual');
    this._endlessNexusImage.src = 'assets/nexus/endless_nexus_base_8cores.png?v=20260628400000';

    // Chaos Mode background (unlocks at 31:00 Endless)
    this._chaosBgImage = new Image();
    this._chaosBgImage.onerror = () => console.warn('[Chaos] missing assets/ui/CHAOS_mode.png');
    this._chaosBgImage.src = 'assets/ui/CHAOS_mode.png?v=20260628400000';

    // Preload character portraits for Character Select screen
    this._charImages = {};
    ['skeleton_warrior', 'taekwondo_girl', 'cyber_arm_hero', 'brawler_warrior', 'assassin_clone'].forEach(id => {
      const img = new Image();
      img.onerror = () => console.warn(`[Char] missing assets/characters/${id}.png — fallback circle used`);
      img.src = `assets/characters/${id}.png`;
      this._charImages[id] = img;
    });
    // Japan Phasewalker portrait lives in the endless/ subfolder (Character Select + FX modules).
    this._phasewalkerSprite = new Image();
    this._phasewalkerSprite.onerror = () => console.warn('[Char] missing assets/characters/endless/japan_phasewalker.png');
    this._phasewalkerSprite.src = 'assets/characters/endless/japan_phasewalker.png?v=20260628400000';   // ?v bust: corrected transparency
    this._charImages['japan_phasewalker'] = this._phasewalkerSprite;
    // Euclid Vector portrait (endless/ subfolder; unlocked from the start — see roster + free unlock).
    this._euclidSprite = new Image();
    this._euclidSprite.onerror = () => console.warn('[Char] missing assets/characters/endless/euclid_vector.png');
    this._euclidSprite.src = 'assets/characters/endless/euclid_vector.png';
    this._charImages['euclid_vector'] = this._euclidSprite;
    this._oniSprite = new Image();
    this._oniSprite.onerror = () => console.warn('[Char] missing assets/characters/endless/oni_cataclysm_protocol.png');
    this._oniSprite.src = 'assets/characters/endless/oni_cataclysm_protocol.png';
    this._charImages['oni_cataclysm_protocol'] = this._oniSprite;

    // Brawler Warrior weapon sprites (Nexus Chakram / Crescent Rift Claw / Skyfall Lances).
    // Missing files degrade to drawn-shape fallbacks (never crash).
    this._weaponImages = {};
    [
      ['nexus_chakram',     'assets/weapons/nexus_chakram.png'],
      ['crescent_rift_claw','assets/weapons/crescent_rift_claw.png'],
      ['skyfall_lances',    'assets/weapons/skyfall_lances.png'],
      // Assassin Clone bounce weapon — Shuriken (the Arrow base-shot uses Player.attackSprite, not this map).
      ['suriken_assasin',   'assets/weapons/suriken_assasin.png'],
    ].forEach(([key, src]) => {
      const img = new Image();
      img.onerror = () => console.warn(`[Weapon] missing ${src} — drawn-shape fallback used`);
      img.src = src;
      this._weaponImages[key] = img;
    });

    // Assassin Clone ultimate sprites (Chrome Phantom Protocol): pink phantom clone + chrome
    // mirror clone. Drawn as clone overlays during the ultimate; phantom is also the HUD icon.
    // Missing files degrade to drawn-shape fallbacks (never crash).
    this._assassinPhantomSprite = new Image();
    this._assassinPhantomSprite.onerror = () => console.warn('[Ultimate] assassin_clone_phantom_clone.png missing — drawn fallback used');
    this._assassinPhantomSprite.src = 'assets/abilities/ultimates/assassin_clone_phantom_clone.png';
    this._assassinChromeSprite = new Image();
    this._assassinChromeSprite.onerror = () => console.warn('[Ultimate] assassin_clone_chrome_clone.png missing — drawn fallback used');
    this._assassinChromeSprite.src = 'assets/abilities/ultimates/assassin_clone_chrome_clone.png';

    // Preload start-menu background image (new premium theme; falls back to dark gradient if missing)
    this._menuBg = new Image();
    this._menuBg.onerror = () => console.warn('[Menu] main_menu_theme.png not found — dark fallback used');
    this._menuBg.src = 'assets/ui/new_main_menu_theme/main_menu_theme.png?v=20260628400000';

    // Menu character cut-out (transparent two-character art) — code-positioned layer over the theme's
    // character zone, so the protagonists are crisp + code-controlled. Graceful if missing.
    this._menuChars = new Image();
    this._menuChars.onerror = () => console.warn('[Menu] cyber-grid-menu.png not found — theme art used');
    this._menuChars.src = 'assets/ui/cyber-grid-menu.png?v=20260628400000';

    // Preload phoenix revive effect images (orange / blue / gold tiers)
    this._phoenixImage = new Image();
    this._phoenixImage.src = 'assets/effects/phoenix_revive.png';

    this._phoenixBlueImage = new Image();
    this._phoenixBlueImage.onerror = () => console.warn('[Assets] Failed to load: assets/effects/phoenix/blue_phoenix_revive.png');
    this._phoenixBlueImage.src = 'assets/effects/phoenix/blue_phoenix_revive.png?v=20260628400000';

    this._phoenixGoldImage = new Image();
    this._phoenixGoldImage.onerror = () => console.warn('[Assets] Failed to load: assets/effects/phoenix/gold_phoenix_revive.png');
    this._phoenixGoldImage.src = 'assets/effects/phoenix/gold_phoenix_revive.png?v=20260628400000';

    // Preload credits photos
    this._creditImgInk = new Image();
    // Newer Maria / InkSpireM portrait. Safe fallback to the previous photo if it fails to load.
    this._creditImgInk.onerror = () => {
      console.warn('[Credits] InkSpireM_Visuals_Potrait.png failed to load — falling back to inkspirem_visuals_photo.jpg');
      const fb = new Image();
      fb.src = 'assets/credits/inkspirem_visuals_photo.jpg';
      this._creditImgInk = fb;
    };
    this._creditImgInk.src = 'assets/credits/InkSpireM_Visuals_Potrait.png';
    this._creditImgTsali = new Image();
    this._creditImgTsali.src = 'assets/credits/tsali_photo.jpg';

    // Preload core and matrix sprites
    this._coreSprite = new Image();
    this._coreSprite.onerror = () => console.warn('[Assets] Failed to load: assets/cores/data_core.png');
    this._coreSprite.src = 'assets/cores/data_core.png?v=20260628400000';
    this._matrixSprite = new Image();
    this._matrixSprite.onerror = () => console.warn('[Assets] Failed to load: assets/bases/matrix_base.png');
    this._matrixSprite.src = 'assets/bases/matrix_base.png?v=20260628400000';

    // Preload grid cache supply drop sprite
    this._gridCacheSprite = new Image();
    this._gridCacheSprite.onerror = () => console.warn('[Assets] grid_cache_crate not found — cyan fallback will be used');
    this._gridCacheSprite.src = 'assets/events/supply_drop/grid_cache_crate.png';

    // Preload Thunder Solo ultimate sprites (Cyber Skeleton Warrior)
    this._thunderGuitarSprite = new Image();
    this._thunderGuitarSprite.onerror = () => console.warn('[Ultimate] thunder_solo_guitar.png not found — drawn fallback will be used');
    this._thunderGuitarSprite.src = 'assets/abilities/ultimates/thunder_solo_guitar.png';
    this._lightningRainSprite = new Image();   // strike + ripple + musical-note sheet
    this._lightningRainSprite.onerror = () => console.warn('[Ultimate] cyan_lightning_rain_notes.png not found — drawn fallback will be used');
    this._lightningRainSprite.src = 'assets/abilities/ultimates/cyan_lightning_rain_notes.png';
    // Boss Lava/Fire Rain impact sheet (2 cols × 4 rows = 8 frames, 512×384 each)
    this._lavaRainSprite = new Image();
    this._lavaRainSprite.onerror = () => console.warn('[Boss] lava_fire_rain.png not found — drawn fallback will be used');
    this._lavaRainSprite.src = 'assets/enemies/bosses/lava_fire_rain.png';
    // Endless hazard art (single-frame transparent PNGs).
    this._airstrikeSprite = new Image();
    this._airstrikeSprite.onerror = () => console.warn('[Endless] airstrike_sheet.png not found — drawn fallback used');
    this._airstrikeSprite.src = 'assets/enemies/event_airstrike/airstrike_sheet.png';
    this._lightningStormSprite = new Image();
    this._lightningStormSprite.onerror = () => console.warn('[Endless] lights_storm_rain.png not found — drawn fallback used');
    this._lightningStormSprite.src = 'assets/events/weather/lights_storm_rain.png?v=20260628400000';

    // HUD icons: Data-Core (top-right credits) + chains (Cyber Arm SPACE ultimate icon)
    this._dataCoreIcon = new Image();
    this._dataCoreIcon.onerror = () => console.warn('[HUD] data_core.png not found — drawn fallback used');
    this._dataCoreIcon.src = 'assets/cores/data_core.png';
    this._chainsIcon = new Image();
    this._chainsIcon.onerror = () => console.warn('[HUD] overheated_heavy_chains.png not found — drawn fallback used');
    this._chainsIcon.src = 'assets/abilities/ultimates/overheated_heavy_chains.png';
    // Neon Pierce Beam — Cyber Arm Hero's automatic secondary weapon (red laser identity)
    this._neonBeamSprite = new Image();
    this._neonBeamSprite.onerror = () => console.warn('[Weapon] neon_pierce_beam.png missing — drawn fallback used');
    this._neonBeamSprite.src = 'assets/weapons/neon_pierce_beam.png';
    // Neon Taekwondo Girl — Aqua Spirit Trail (movement secondary) + Spirit Dojang Flag (SPACE ultimate)
    this._aquaTrailSprite = new Image();
    this._aquaTrailSprite.onerror = () => console.warn('[Weapon] aqua_spirit_trail.png missing — drawn fallback used');
    this._aquaTrailSprite.src = 'assets/weapons/aqua_spirit_trail.png';
    this._dojangFlagSprite = new Image();
    this._dojangFlagSprite.onerror = () => console.warn('[Ultimate] spirit_dojang_flag.png missing — drawn fallback used');
    this._dojangFlagSprite.src = 'assets/abilities/ultimates/spirit_dojang_flag.png';

    // Preload acid rain weather sprites
    this._acidRainFallImg = new Image();
    this._acidRainFallImg.onerror = () => console.warn('[Weather] acid_rain_fall.png not found — using line fallback');
    this._acidRainFallImg.src = 'assets/events/weather/acid_rain_fall.png?v=20260628400000';
    this._acidRainSplashImg = new Image();
    this._acidRainSplashImg.onerror = () => console.warn('[Weather] acid_rain_splash.png not found — using ellipse fallback');
    this._acidRainSplashImg.src = 'assets/events/weather/acid_rain_splash.png?v=20260628400000';

    // Preload AI Overload Titan boss sprite
    this._titanSprite = new Image();
    this._titanSprite.onerror = () => console.warn('[Boss] ai_overload_titan.png failed to load — using fallback');
    this._titanSprite.src = 'assets/enemies/bosses/ai_overload_titan.png?v=20260628400000';

    // Preload Matrix Annihilator mini-boss sprite (existing asset)
    this._annihilatorSprite = new Image();
    this._annihilatorSprite.onerror = () => console.warn('[Boss] assets/enemies/bosses/matrix_annihilator.png failed to load — using fallback');
    this._annihilatorSprite.src = 'assets/enemies/bosses/matrix_annihilator.png?v=20260628400000';

    // Preload Bloodfang Packmaster mini-boss sprite (existing asset)
    this._bloodfangSprite = new Image();
    this._bloodfangSprite.onerror = () => console.warn('[Boss] assets/enemies/bosses/bloodfang_packmaster.png failed to load — using fallback');
    this._bloodfangSprite.src = 'assets/enemies/bosses/bloodfang_packmaster.png?v=20260628400000';

    // Preload Double Demons boss sprites (note: space in filename is intentional)
    this._doubleDemonsSprite = new Image();
    this._doubleDemonsSprite.onerror = () => console.warn('[Boss] double_ demons.png not found — drawn fallback used');
    this._doubleDemonsSprite.src = 'assets/enemies/bosses/double_ demons.png?v=20260628400000';
    this._rocketRainSprite = new Image();
    this._rocketRainSprite.onerror = () => console.warn('[Boss] rocket_rain.png not found — drawn fallback used');
    this._rocketRainSprite.src = 'assets/enemies/bosses/rocket_rain.png?v=20260628400000';

    // Preload Cyber Serpent mid-run mini-boss sprite
    this._cyberSerpentSprite = new Image();
    this._cyberSerpentSprite.onerror = () => console.warn('[Boss] cyber_serpent_boss.png not found — drawn fallback used');
    this._cyberSerpentSprite.src = 'assets/enemies/bosses/cyber_serpent_boss.png?v=20260628400000';

    // Preload Cyber Dragon mid-run boss sprite
    this._cyberDragonSprite = new Image();
    this._cyberDragonSprite.onerror = () => console.warn('[Boss] cyber_dragon_boss.png not found — drawn fallback used');
    this._cyberDragonSprite.src = 'assets/enemies/bosses/cyber_dragon_boss.png?v=20260628400000';

    // Preload secret-skin preview sprites (Character Select locked/unlocked + Victory screen).
    // Keyed by the same flags MetaProgress persists. Missing files degrade to a text fallback.
    // Keyed by the outfit unlock flag; sources point at the CURRENT secret-skin files.
    this._skinImages = {};
    [
      ['golden_skeleton_warrior', 'assets/unlocks/secret_skins/cyber_skeleton_warrior_secret.png'],
      ['dark_cyber_arm_hero',     'assets/unlocks/secret_skins/neon_cyber_arm_hero_secret.png'],
      ['grandmaster_dojang_girl', 'assets/unlocks/secret_skins/cyber_dojang_girl_secret.png'],
      ['log_1997',                'assets/unlocks/secret_skins/brawler_warrior_log1997_secret.png'],
      ['log_1998',                'assets/unlocks/secret_skins/assassin_clone_log1998_secret.png'],
    ].forEach(([key, src]) => {
      const img = new Image();
      img.onerror = () => console.warn('[Skins] missing ' + src + ' — text fallback used');
      img.src = src;
      this._skinImages[key] = img;
    });

    // Optional Victory-screen art (decorative only — null-checked at draw time, never required)
    this._victoryLogo = new Image();
    this._victoryLogo.onerror = () => console.warn('[Victory] victory_logo.png missing — text title used');
    this._victoryLogo.src = 'assets/ui/victory/victory_logo.png';
    this._victoryLogsBadge = new Image();
    this._victoryLogsBadge.onerror = () => console.warn('[Victory] secret_logs_badge.png missing — text used');
    this._victoryLogsBadge.src = 'assets/ui/victory/secret_logs_badge.png';

    // Game state management
    this.gameState = 'start_menu'; // 'start_menu' | 'character_select' | 'playing' | 'game_over' | 'victory' | 'exit_screen'
    this.selectedCharacter = null; // 'skeleton_warrior' | 'taekwondo_girl' | 'cyber_arm_hero'
    
    // Menu state
    this.menuIndex = 0;
    this.characterIndex = 0;
    this.characters = [
      { id: 'skeleton_warrior',        name: 'Cyber Skeleton Warrior',  fallbackColor: '#8B0050', fallbackAlt: '#FF0080', role: 'Tank / Survival',      specialty: 'Bone shockwave pulse — ultimate clears nearby enemies' },
      { id: 'taekwondo_girl',          name: 'Neon Taekwondo Girl',     fallbackColor: '#00D9FF', fallbackAlt: '#0099CC', role: 'Speed / AoE',          specialty: 'Crescent arc dash — chains lightning hits on clusters' },
      { id: 'cyber_arm_hero',          name: 'Cyber Arm Hero',          fallbackColor: '#FF6600', fallbackAlt: '#CC0000', role: 'Ranged / Damage',      specialty: 'Overdrive beam — sustained flame pressure at distance' },
      { id: 'brawler_warrior',         name: 'Brawler Warrior',         fallbackColor: '#1fd6a6', fallbackAlt: '#0a9c78', role: 'Tank / Brawler',       specialty: 'Rage melee burst — damage escalates when surrounded' },
      { id: 'assassin_clone',          name: 'Assassin Clone',          fallbackColor: '#ff4dd2', fallbackAlt: '#9aa0aa', role: 'Stealth / Burst',      specialty: 'Shadow reposition — instant teleport strike burst' },
      // Japan Phasewalker TEMPORARILY DISABLED (black-screen freeze ~3–4 min in Endless). Removed
      // from the selectable roster until his kit is rebuilt; code/assets/cards kept for future re-add.
      // Euclid Vector — unlocked from the start (NOT PF-gated; see MetaProgress free-unlock).
      { id: 'euclid_vector',           name: 'Euclid Vector',           fallbackColor: '#00ff66', fallbackAlt: '#0a9c44', role: 'Toxin / Ranged',       specialty: 'Toxin sniper + orbital katana + plague trail dash' },
      // Oni Cataclysm Protocol — Endless boss character, LOCKED until purchased with Protocol Fragments
      // (PF_CHARACTER_COSTS). Shown as locked/unlockable; selectCharacter() guards on isCharacterUnlocked,
      // so it is never freely selectable and needs no TEST bypass.
      { id: 'oni_cataclysm_protocol',  name: 'Oni Cataclysm Protocol', fallbackColor: '#ff3030', fallbackAlt: '#ff8a3c', role: 'Endless / Cataclysm', specialty: 'Quad laser array — overwhelming cataclysm output' },
    ];
    this.reset();

    // HTML menu overlay — created once after reset() so meta/characters are ready.
    this._menuOverlayEl      = null;   // root #cgm-overlay div
    this._menuOverlayVisible = false;
    try {
      this._initMenuOverlay();
      // Show overlay immediately (initial state is start_menu)
      this._showMenuOverlay();
    } catch (err) {
      console.error('[CGM Overlay] _initMenuOverlay failed:', err);
    }

    this._settingsOverlayEl      = null;   // root #cgm-settings div
    this._settingsOverlayVisible = false;
    try {
      this._initSettingsOverlay();
    } catch (err) {
      console.error('[CGM Settings] _initSettingsOverlay failed:', err);
    }

    this._charSelectOverlayEl      = null;   // root #cgm-charselect div
    this._charSelectOverlayVisible = false;
    try {
      this._initCharSelectOverlay();
    } catch (err) {
      console.error('[CGM CharSelect] _initCharSelectOverlay failed:', err);
    }

    this._upgradesOverlayEl      = null;   // root #cgm-upgrades div
    this._upgradesOverlayVisible = false;
    try {
      this._initUpgradesOverlay();
    } catch (err) {
      console.error('[CGM Upgrades] _initUpgradesOverlay failed:', err);
    }

    this._achievementsOverlayEl      = null;   // root #cgm-achievements div
    this._achievementsOverlayVisible = false;
    try {
      this._initAchievementsOverlay();
    } catch (err) {
      console.error('[CGM Achievements] _initAchievementsOverlay failed:', err);
    }

    this._relicsOverlayEl      = null;   // root #cgm-relics div
    this._relicsOverlayVisible = false;
    try {
      this._initRelicsOverlay();
    } catch (err) {
      console.error('[CGM Relics] _initRelicsOverlay failed:', err);
    }

    // Preload relic icon images for HUD display
    this._relicIconCache = {};
    RELIC_DEFS.forEach(r => {
      const img = new Image();
      img.src = `assets/relics/${r.id}.png?v=20260628400000`;
      this._relicIconCache[r.id] = img;
    });

    // Preload Eden Core portrait for canvas transmission panels
    this._edenPortraitLoaded = false;
    this._edenPortraitImg    = new Image();
    this._edenPortraitImg.onload  = () => { this._edenPortraitLoaded = true; };
    this._edenPortraitImg.onerror = () => { this._edenPortraitLoaded = false; };
    this._edenPortraitImg.src = 'assets/ui/eden_core_portrait.png?v=20260628400000';

    // Null Breach Arena atmospheric image
    this._nullBreachImgLoaded = false;
    this._nullBreachImg       = null;
    const _nbaImg = new Image();
    _nbaImg.onload  = () => { this._nullBreachImgLoaded = true; this._nullBreachImg = _nbaImg; };
    _nbaImg.onerror = () => console.warn('[Arena] NULL BREACH ARENA.png not found — fallback used');
    _nbaImg.src = 'assets/ui/NULL BREACH ARENA.png';
  }

  // UPGRADES = the permanent Grid-Credit progression (spent between runs). ENDLESS MODE appears
  // (right after START GAME) only once the player has entered Endless once — a persistent direct
  // entry so they never replay Act 1 to reach it. Computed live so the unlock reflects instantly.
  get menuItems() {
    // Lean main nav only. Exit/Credits/Instructions/Audio moved into the SETTINGS screen.
    const items = ['START GAME'];
    if (this.meta?.isEndlessUnlocked()) items.push('ENDLESS MODE');
    items.push('CHAOS MODE');   // always visible; locked if !endlessUnlocked — handled in draw/click
    items.push('CHARACTER SELECT', 'UPGRADES', 'ACHIEVEMENTS', 'RELICS', 'SETTINGS', 'EXIT');
    return items;
  }

  // SETTINGS sub-menu — the single home for Audio, Controls/How-To-Play, Credits.
  get settingsItems() { return ['AUDIO', 'CONTROLS / HOW TO PLAY', 'CREDITS', 'LORE / ARCHIVE', 'BACK']; }

  reset() {
    // Resolve the equipped (cosmetic) outfit sprite for this character, if any.
    const _char       = this.selectedCharacter || 'skeleton_warrior';
    const _outfit     = this.meta.getSelectedOutfit(_char);
    const _outfitPath = _outfit === 'default' ? null : this.meta.getOutfitAsset(_char, _outfit);
    this.player       = new Player(this.selectedCharacter, _outfitPath);
    this._applyMetaUpgrades();
    this._echoPassiveMsgFired = false;
    this._applyBossEchoPassives();
    this.matrices     = [];
    this.groundCores  = [];
    this.enemies      = [];
    this.projectiles  = [];
    this.homingDiscs  = [];
    this._chainBolts  = [];   // Chain Lightning Laser: travelling lead bolts (visual + carry the chain plan)
    this._chainLinks  = [];   // Chain Lightning Laser: active jump segments (drawn on activation, then fade)
    this._chainTimer  = 0;    // auto-fire cooldown
    this._neonBeamTimer = 0;  // Neon Pierce Beam (Cyber Arm Hero only) auto-fire cooldown
    this._neonBeams     = [];  // active Neon Pierce Beam visuals (short-lived)
    // Brawler Warrior weapons (only active while selectedCharacter === 'brawler_warrior')
    this._chakramTimer    = 0;     // Nexus Chakram auto-fire cooldown
    this._chakrams        = [];    // active chakrams (out → return phases)
    this._crescentTimer   = 0;     // Crescent Rift Claw cooldown
    this._crescentSlashes = [];    // short-lived crescent slash visuals
    this._skyfall         = null;  // Skyfall Lances ultimate state | null
    this._skyfallImpacts  = [];    // short-lived lance impact visuals
    // Assassin Clone weapons (only active while selectedCharacter === 'assassin_clone').
    // Arrow = the base auto-shot (Player.attackSprite). Shuriken = bouncing thrown weapon.
    this._shurikenTimer   = 0;     // Shuriken throw cadence
    this._shurikens       = [];    // in-flight bouncing shurikens
    this._chromePhantom   = null;  // Chrome Phantom Protocol ultimate state | null
    this._chromeFx        = [];    // short-lived clone burst / slash-ring visuals
    // Japan Phasewalker FX modules (only built/used while selectedCharacter === 'japan_phasewalker').
    this._glitchDash          = null;
    this._empShock            = null;
    this._digitalSingularity  = null;
    this._pwFxBuilt           = false;
    this._pwDashing           = false;
    this._pwDashStart         = null;
    this._empShockCooldown    = 0;
    // Oni Cataclysm Protocol FX (only built/used while selectedCharacter === 'oni_cataclysm_protocol').
    this._protocol0      = null;
    this._laserEyes      = null;
    this._meteorRain     = null;
    this._oniFxBuilt     = false;
    this._oniSpeedBuff   = 0;     // Protocol 0: tracks the exact speedBonus we add, so we remove exactly it
    this._oniLaserCd     = 0;     // Laser Eyes auto-weapon cooldown (s)
    this._oniMeteorCd    = 0;     // Meteor Rain auto-weapon cooldown (s)
    this._oniMeteorWorld = null;  // world anchor for the active meteor field
    // Euclid Vector toxin kit (only built/used while selectedCharacter === 'euclid_vector').
    this._euclidKitBuilt = false;
    this._euclidSniper   = null;
    this._euclidKatana   = null;
    this._euclidPlague   = null;
    this._euclidEnemies  = [];                 // adapter array (kit holds this by reference)
    this._euclidWraps    = new Map();          // gameEnemy → persistent adapter wrapper
    this._euclidPlayer   = { x: 0, y: 0, height: 64, facing: 0 };
    // Euclid Phase-3 auto-weapons (bounded, world-space; bolts bounce, needles pierce).
    this._euclidBolts    = [];   // Toxin Vector Bolt projectiles (cap 40)
    this._euclidNeedles  = [];   // Viral Gas Needle / Corrosive Shard projectiles (cap 48)
    this._euclidBoltCd   = 0;
    this._euclidNeedleCd = 0;
    this.empRings     = [];
    this._specialRings    = [];
    this.thunderSolo      = null;   // Thunder Solo ultimate state while active
    this.overChains       = null;   // Overheated Heavy Chains ultimate (Cyber Arm Hero) while active
    this._aquaPuddles     = [];   // Aqua Spirit Trail puddles (Neon Taekwondo Girl movement secondary)
    this._aquaTrailTimer  = 0;    // spawn cadence while moving
    this._spiritKicks = { timer: 0, blades: [] };   // Spirit Crescent Kicks (new auto-weapon)
    this.spiritDojang     = null; // Spirit Dojang Flag ultimate (Neon Taekwondo Girl) while active
    this._cyberBike       = null; // Cyber Ride ultimate (Neon Taekwondo Girl) while active
    this._specialBeams    = [];
    this._chaosAmbient      = new ChaosAmbientSystem();  // Chaos Mode neon ambient field
    this._chaosAmbientCd    = 0;   // spawn cooldown
    this._hitFlashOverlayTimer = 0; // brief white flash on heavy boss hit
    this._hitFlashOverlayCd    = 0; // throttle: min 0.5s between flashes
    this._specialTrail    = [];
    this._taekwondoDmgSet = new Set();
    this._iceFields        = [];   // active Crystal Ice Field instances (Taekwondo ultimate)
    this.enemyBullets = [];
    this.floatingTexts = [];
    this.particles    = new ParticleSystem();
    this.screenShake  = new ScreenShake();
    this.events       = new SystemEventManager();
    this.upgradeUI    = null;
    this.mutationUI   = null;                    // forced Endless mutation picker (null = none open)
    this.mutations    = this._freshMutations();  // run-scoped negative-mutation multipliers (neutral in Act 1)
    this._mutationTimer = MUTATION_INTERVAL;
    this.rerollAvailable = false;
    this.rerollsLeft     = 0;     // rerolls remaining on the current level-up screen (refilled to 2 per screen)
    this._nextCardLevel  = 1;     // card-pacing: next player level that will OFFER an upgrade card
    this.megaBoss     = null;
    this.bossLavaZones = [];   // telegraphed lava/fire-rain zones cast by the main boss (player-only)
    this.bossTrails    = [];   // boss/mini-boss corruption blood trails — player-only DoT (capped, auto-expire)
    this._lavaRainActive = 0;  // ambient Lava Rain active window (s) — sustained storm, capped drops
    this._lavaSpawnCd    = 0;  // cadence within an active Lava Rain window
    // Endless-only high-threat hazards (inert in Act 1; armed/reset in _enterEndless).
    this.airstrikeShips   = [];   // loitering airstrike ships that fire aimed rockets
    this.airstrikeRockets = [];   // aimed rockets with impact telegraph
    this.lightningZones   = [];   // Lightning Storm: telegraphed strike zones (hard-capped)
    this.synergyBursts    = [];   // transient synergy-burst rings (visual; hard-capped, auto-expire)
    this.elementFx        = new ElementFx();   // Phase-1 elemental VFX (bounded, auto-expiring)
    this._elementColors   = Object.fromEntries(Object.entries(ELEMENTS).map(([k, v]) => [k, v.c1]));   // HUD indicator colors
    this._elementIcons    = ELEMENT_ICON;   // HUD icon-based element badges
    this.fusionClouds     = [];   // Phase-2 fusion gas clouds (hard-capped 12, auto-expire)
    this._prevMana        = 100;  // for the ultimate-infusion element nova trigger
    this._stormExecCd     = 0;
    this._upgradeTab      = 'core';   // Upgrades screen tab: 'core' | 'synergy'

    this.timeAlive          = 0;
    this._postArenaChoice   = false;   // true while post-Arena NULL decision panel is showing
    this._pacIdx            = 0;       // 0=Continue Endless  1=Enter Chaos  2=Return Main Menu
    this._pacMsgStep        = 0;       // staged NULL dialogue line index
    this._pacMsgAt          = 0;       // timeAlive when panel appeared
    // ── Chaos Mode (unlocks at 21:00 Endless) ─────────────────────────────
    this._chaosMode         = false;   // true after transition completes
    this._chaosTransTimer   = -1;      // >=0 while glitch transition is playing
    this.forceChaos         = false;   // defensive: prevent stale debug-key state leaking into the next run
    this.forceDoubleDemon   = false;   // DEBUG: F8 in Endless or game.forceDoubleDemon=true
    this._chaosCoreCd       = 0;       // cooldown for bonus gold-core spawns
    this._eqRafId           = null;    // rAF handle for the menu equalizer loop
    this.overload             = 0;
    this.overloadTickTimer    = 0;
    this._prevGroundCoreCount = 0;   // tracks ground-core count frame-to-frame for dump-hit detection
    this.spawnTimer         = 0;
    this.spawnPauseTimer    = 0;
    this.stealSpeedMultiplier = 1.0;
    this.gridBlackoutActive   = false;
    this.announcement         = null;

    // Phoenix revive tiers (orange → blue → gold, one per death per run)
    this.phoenixUsed        = false;
    this.phoenixReviveTimer = 0;    // > 0 while the flash animation plays
    this.phoenixReviveCount = 0;    // how many revives used this run (0–3)
    this.phoenixReviveType  = 'orange'; // 'orange' | 'blue' | 'gold'

    // Score / combo
    this.score      = 0;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.maxCombo   = 0;
    this.comboPopups = [];   // transient milestone popups (visual only)
    this.isNewHighScore = false;

    // Endless-mode records snapshot for the end screen (display-only; set in _grantRewards
    // when this.endless). endlessRun = THIS RUN values, endlessBest = updated personal bests,
    // endlessNewBest = which records this run beat (drives the ★ NEW BEST tag).
    this.endlessRun     = null;
    this.endlessBest    = null;
    this.endlessNewBest = null;
    this.endlessNewAchievements = null;   // [{id,name}] newly earned this run (end-screen only)
    this._eliteWaveTimer   = 0;           // Endless elite-wave clock (armed by continueEndless)
    this._eliteWaveElapsed = 0;           // s elapsed in Endless — drives batch-size tiers
    this._endlessBossTimer = 25;          // Endless boss-rotation clock — first pressure ~25s in
    this._endlessBossIdx   = -1;          // rotation cursor (titan→annihilator→bloodfang→mech)
    this._bossWarnCd       = 0;           // Endless: throttles boss/miniboss warnings (see BOSS_WARN_COOLDOWN)

    this.gameOver          = false;
    this.victory           = false;
    this.endless           = false;   // set by CONTINUE — ENDLESS after an Act 1 victory
    this.finalMessage      = '';
    this.rewardsGranted    = false;
    this.runCreditsEarned  = 0;
    this.edenRunMessages        = [];     // 1-3 Eden Core messages for end screen
    this._chaosEdenAwarded      = false;  // prevent double +3% memory if chaos already triggered
    this._edenTransmission      = null;   // { message, title, priority, expiresAt }
    this._edenRunMilestonesShown = new Set();
    this._edenLastAutoAt        = -999;   // timeAlive when last auto-transmission fired
    this._edenLowHpFired        = false;  // fire low-HP line once per episode
    this.playerHitCooldown = 0;

    // Player damage pulse (red vignette) state — visual only.
    this.damageFlash          = 0;
    this.damageFlashIntensity = 0;
    this._dmgPulseGap         = 0;
    this._prevPlayerHp        = this.player.hp;

    // Ultimate-ready cue state — visual only.
    this._ultWasReady = false;
    this._ultReadyCue = 0;   // HUD "ULTIMATE READY" banner timer
    this._ultAura     = 0;   // player aura-pulse timer

    this.camera = { x: 0, y: 0 };

    this.gridCache           = null;  // { pos: Vec2, timer: number } | null
    this.gridCacheSpawnTimer = 75;    // first crate at 75s (avoids Drone Swarm at 60s)

    this._coreSpawnTimer = 0;         // rate-limit for matrix-deficit core replenishment

    this.acidRain      = null;  // { timer, damageAccum } | null
    this.acidRainTimer = 600;   // first event at 10:00

    this._frozenSleet      = null;  // { phase, t, particles } | null — Chaos Mode only
    this._frozenSleetTimer = 9999; // first trigger on Chaos start (overridden in chaos block)

    // Chaos Mode pylons — danger (damage player) + buff (shield / heal). No speed buff.
    this._chaosPylons    = [];   // { pos, type:'danger'|'shield'|'heal', life, maxLife, radius }
    this._chaosPylonCd   = 0;   // spawn cooldown
    this._chaosPylonBuff = null; // active pylon buff: { type:'shield'|'heal', timer } | null

    this.killsSinceHealthDrop = 0;   // counts toward the next HP CELL drop
    this.healthPickups        = [];  // [{ pos: Vec2, timer: number }] — heals 25% maxHp on touch

    this.manaPickups     = [];   // [{ pos: Vec2 }] — restores +25 mana on touch
    this.manaPickupTimer = 30;   // time-based: one every 30s while mana < 100

    this.titanSpawned     = false;
    this.titanBoss        = null;
    this.titanSpawnTimer  = 180;
    this._titanShockwaves = [];
    this._titanBeams      = [];
    this._bloodfangSlams  = [];   // telegraphed pounce-slam zones cast by the Bloodfang Packmaster (player-only)
    this._corruptionBeam  = null; // final-boss CORRUPTION GRID BEAM: { phase:'charge'|'fire', t, origin, dir }
    this._corruptionNovas = [];   // final-boss CORRUPTION NOVA telegraphed radial bursts (player-only)

    // Matrix Annihilator — second mini-boss, marches on a Power Matrix at ~7:30
    this.annihilatorSpawned    = false;
    this.annihilatorBoss       = null;
    this.annihilatorSpawnTimer = 450;

    // Bloodfang Packmaster — third mini-boss (fast pack leader) at 10:00
    this.bloodfangSpawned    = false;
    this.bloodfangBoss       = null;
    this.bloodfangSpawnTimer = 600;

    // Cyber Serpent — mid-run mini-boss at 10:30 (Inferno Smoke Trail floor hazard)
    this.cyberSerpentSpawned    = false;
    this.cyberSerpentBoss       = null;
    this.cyberSerpentSpawnTimer = 630;   // 10:30 — just after Bloodfang to stagger pressure
    this._serpentTrails         = [];   // fire trail segments left during dash phases (max 20, auto-expire 10s)

    // Cyber Dragon — mid-run boss at 16:00 (Cryo Storm Protocol ice rain)
    this.cyberDragonSpawned    = false;
    this.cyberDragonBoss       = null;
    this.cyberDragonSpawnTimer = 960;   // 16:00
    this._dragonIceShards      = [];   // falling ice shards with telegraph warning circles (max 15)

    // Double Demons — Chaos Mode dual-body boss (Gunner + Claw, shared HP)
    this.doubleDemonsSpawned    = false;
    this.doubleDemonsBoss       = null;   // { hp, maxHp, enraged, gunner:{...}, claw:{...} }
    this.doubleDemonsSpawnTimer = 0;
    this._ddClawShockwaves      = [];     // Claw Slam shockwave rings
    this._ddLightningTrails     = [];     // Claw Dash electric trails
    this._ddRocketShadows       = [];     // Rocket Rain telegraph shadows

    this.supportDrones     = [];
    this.allyDrones        = [];   // Auto-Forge Drone card: persistent allies (NOT cleared by boss logic)
    this._npcWalker        = null;   // KIROSHI WALKER autonomous ally
    this._droneFlameLast   = null;
    this._droneElectroLast = null;

    // Null Breach Arena run-state (defaults — armed properly in _enterEndless)
    this._nullBreachActive  = false;
    this._nullBreachArena   = null;
    this._nullBreach1Done   = false;
    this._nullBreach2Done   = false;
    this._arenaRescueUsed   = false;
    this._arenaResult       = null;
    this._endlessStartedAt  = 0;      // timeAlive when Endless began (direct=0, Act1→Endless=nonzero)

    this._createMatrices();
    // KIROSHI WALKER — timer-based summon; first arrival at 2:00 of active gameplay
    this._npcWalker = new NpcWalker();
    this._walkerCycleIdx    = -1;         // current 5-min cycle index (300s per cycle)
    this._walkerFiredSet    = new Set();  // trigger offsets already fired this cycle
    this._walkerSummonCd    = 120;        // HUD display: seconds until next trigger (derived)
  }

  startGame() {
    this._hideMenuOverlay();
    if (!this.selectedCharacter) {
      this.gameState = 'character_select';
    } else {
      this.audio?.startGameplayMusic();
      this.gameState = 'playing';
      this.reset();
    }
  }

  selectCharacter(charId) {
    if (!this.meta.isCharacterUnlocked(charId)) return;   // locked characters can't be started
    this._hideMenuOverlay();
    this._hideCharSelectOverlay();
    this.selectedCharacter = charId;
    this.audio?.startGameplayMusic();
    this.gameState = 'playing';
    this.reset();
  }

  goToCharacterSelect() {
    this._hideMenuOverlay();
    this.gameState = 'character_select';
    this.characterIndex = 0;
    this.audio?.startMenuMusic();
    this._showCharSelectOverlay();
  }

  // Highlight a character card WITHOUT starting a run (mouse preview). Sets the live selection so the
  // menu/equipment panels reflect it; locked characters highlight but never become the selection.
  previewCharacter(i) {
    this.characterIndex = i;
    const c = this.characters[i];
    if (c && this.meta.isCharacterUnlocked(c.id)) this.selectedCharacter = c.id;
  }

  // Start Endless directly from Character Select with the highlighted character (guards: char unlocked
  // + Endless unlocked). Never bypasses locked characters or the Endless gate.
  startSelectedEndless() {
    const c = this.characters[this.characterIndex];
    if (!c || !this.meta.isCharacterUnlocked(c.id)) return;
    if (!this.meta?.isEndlessUnlocked()) return;
    this.selectedCharacter = c.id;
    this.startEndlessRun();
  }

  // Character-Select bottom action buttons (mirrored by main.js click hit-test).
  _charSelectActionRects() {
    const w = 200, h = 34, gap = 16, y = HEIGHT - 46;
    const x0 = Math.round(WIDTH / 2 - (3 * w + 2 * gap) / 2);
    return {
      back:    { x: x0,                 y, w, h },
      start:   { x: x0 + (w + gap),     y, w, h },
      endless: { x: x0 + 2 * (w + gap), y, w, h },
    };
  }

  // In-game pause-menu buttons (RESUME / MAIN MENU). Mirrored by main.js click hit-test.
  _pauseButtonRect(i) {
    const w = 320, h = 46, gap = 16;
    const y = HEIGHT / 2 + 24 + i * (h + gap);
    return { x: Math.round(WIDTH / 2 - w / 2), y, w, h };
  }

  // Rect for the Character-Select Protocol-Fragments UNLOCK button — non-null only when the
  // highlighted character is PF-lockable and still locked. Mirrored by main.js click hit-test.
  _pfUnlockBtnRect() {
    const sel = this.characters[this.characterIndex];
    if (!sel || !PF_CHARACTER_COSTS[sel.id] || this.meta.isProtocolUnlocked(sel.id)) return null;
    const w = 320, h = 36;
    return { x: Math.round(WIDTH / 2 - w / 2), y: HEIGHT - 86, w, h };
  }

  // 2-row character grid — the SINGLE source of card rects, consumed by _drawCharacterSelect, the
  // secret-skin strip, and the main.js click hit-test (so clicks always match the drawn cards).
  // Top row holds the extra card when the count is odd. Scales cleanly to 8+ characters.
  _charCardLayout() {
    const n = this.characters.length;
    const cardW = 164, cardH = 140, gapX = 18, gapY = 12, gridTop = 212;
    const perRow = Math.ceil(n / 2);
    const cards = [];
    for (let i = 0; i < n; i++) {
      const row   = Math.floor(i / perRow);
      const col   = i % perRow;
      const inRow = row === 0 ? perRow : (n - perRow);
      const rowW  = inRow * cardW + (inRow - 1) * gapX;
      const rowX  = Math.round(WIDTH / 2 - rowW / 2);
      const x = rowX + col * (cardW + gapX);
      const y = gridTop + row * (cardH + gapY);
      cards.push({ x, y, w: cardW, h: cardH, cx: x + cardW / 2 });
    }
    return { cards, cardW, cardH };
  }

  // Spend Protocol Fragments to unlock the highlighted character (idempotent; shows a status msg).
  tryUnlockSelectedCharacterPF() {
    const sel = this.characters[this.characterIndex];
    if (!sel || !PF_CHARACTER_COSTS[sel.id]) return;
    const res = this.meta.tryUnlockCharacterWithPF(sel.id);
    this._pfMsg = res === 'ok'    ? `${sel.name} UNLOCKED!`
                : res === 'poor'  ? 'Not enough Protocol Fragments.'
                : res === 'owned' ? 'Already unlocked.'
                : 'Cannot unlock.';
    this._pfMsgUntil = performance.now() + 2500;
    if (res === 'ok') this.audio?.playEventWarning?.();
    this._syncCharSelectOverlay();
  }

  goToMainMenu() {
    // Save Endless records if leaving mid-run (before any game-over/victory grant)
    if (this.endless && !this.rewardsGranted && this.timeAlive > 5) {
      this._grantRewards();
    }
    this._postArenaChoice = false;   // close panel if open
    this.gameState = 'start_menu';
    this.menuIndex = 0;
    this.gameOver  = false;
    this.victory   = false;
    this.paused    = false;
    this.upgradeUI     = null;
    this.mutationUI    = null;                    // reset forced-mutation state every new run
    this.mutations     = this._freshMutations();
    this._mutationTimer = MUTATION_INTERVAL;
    this.supportDrones = [];
    this.allyDrones    = [];
    this._npcWalker         = null;   // clear on menu return
    this._walkerCycleIdx    = -1;
    this._walkerFiredSet    = new Set();
    this._walkerSummonCd    = 120;
    this.audio?.startMenuMusic();
    this._hideSettingsOverlay();
    this._hideCharSelectOverlay();
    this._hideUpgradesOverlay();
    this._hideAchievementsOverlay();
    this._hideRelicsOverlay();
    this._showMenuOverlay();
  }

  goToExitScreen() {
    this._hideMenuOverlay();
    this.gameState = 'exit_screen';
  }

  // CONTINUE — ENDLESS: resume an already-won run. Unlocks/rewards have already been
  // granted at the Act 1 victory; clearing `victory` resumes the update loop, and the
  // `!this.endless` guard on the win check stops it ever re-firing. Difficulty/roster
  // keep scaling on absolute time, so the Rogue AI Overlord still arrives at 25:00.
  continueEndless() {
    if (!this.victory) return;
    this.victory = false;
    this._enterEndless();
    // NpcWalker: ensure instance exists; reset summon timer for Endless continuation
    if (!this._npcWalker) this._npcWalker = new NpcWalker();
    // Walker cycle is driven by timeAlive; no manual cd reset needed
  }

  // Direct ENDLESS MODE start from the Main Menu (only offered once endlessUnlocked). Starts a
  // FRESH Endless run with the currently selected character (defaults to the first character if
  // none chosen yet): full reset → timer 0 → Endless setup. Same Endless map/camera/Nexus/
  // achievements/secret-unlock systems as Continue — Endless, just without the Act 1 prelude.
  startEndlessRun() {
    if (!this.meta?.isEndlessUnlocked()) return;   // guard: never reachable while locked
    this._hideMenuOverlay();
    this._hideCharSelectOverlay();
    this.selectedCharacter = this.selectedCharacter || this.characters[this.characterIndex]?.id || 'skeleton_warrior';
    // Chaos Law gate: Eden Memory >= 50% → offer law selection before entering Endless
    if ((this.meta?.getEdenMemory() ?? 0) >= 50) {
      this._showChaosLawSelectionOverlay();
      return;
    }
    this.runChaosLaw = null;
    this.gameState = 'playing';
    this.reset();                      // fresh run, timeAlive 0, matrices rebuilt, endless=false
    this._enterEndless();              // flip to Endless + Endless-only setup
  }

  // Shared Endless-entry setup used by Continue — Endless and the Main-Menu ENDLESS MODE start.
  // Assumes the run is already reset/in-progress; only flips on Endless state + Endless systems.
  _enterEndless() {
    this.meta?.unlockEndless();        // persist Endless access → Main Menu ENDLESS MODE entry
    this.endless = true;
    this._repositionEndlessNexus();    // Endless-only: cleaner, symmetric, more-centered Nexus layout
    // Endless-local elite-wave clock: first wave after firstDelay, then every interval.
    this._eliteWaveTimer   = ELITE_WAVE.firstDelay;
    this._eliteWaveElapsed = 0;
    this._endlessBossTimer = 25;           // arm the repeating boss/miniboss rotation (~25s → ~2 min)
    this._endlessBossIdx   = -1;
    this._endlessLavaCd    = randomRange(18, 26);   // arm ambient Endless Lava Rain (boss-independent)
    this._airstrikeTimer   = 90;            // first AIRSTRIKE ~1.5 min in, then every ~2 min
    this._lightningTimer   = 70;            // first LIGHTNING STORM ~1.2 min in, then every ~2 min
    this._stormActive      = 0;             // seconds of active strikes remaining in the current storm
    this._stormSpawnCd     = 0;
    this.airstrikeShips    = [];            // clear any carryover hazards on (re)entry
    this.airstrikeRockets  = [];
    this.lightningZones    = [];
    // Phoenix revives reset on Endless entry: Act 1 uses must not consume the Endless pool.
    // (startEndlessRun already calls reset() which zeroes these; this guard covers continueEndless.)
    this.phoenixReviveCount = 0;
    this.phoenixReviveTimer = 0;
    this.phoenixUsed        = false;
    this._annihNexusKills  = 0;             // Annihilator Nexus-erase count this run (hard max 2)
    this.mutations         = this._freshMutations();   // fresh forced-mutation state for THIS Endless run
    this.mutationUI        = null;
    this._mutationTimer    = MUTATION_INTERVAL;         // first forced mutation at 3:00 into Endless
    this._applyEndlessProtocols();     // one-shot Achievement Protocol stat boosts (Endless only)
    // Chaos Law — xpMult boost (applied after protocols so stacking is clean)
    { const _clm = this._getActiveChaosLawModifiers();
      if (_clm.xpMult !== 1 && this.player) this.player.xpMult = (this.player.xpMult || 1) * _clm.xpMult; }
    this._checkEndlessAchievements();  // grant FIRST ENDLESS RUN immediately on entering Endless
    this.audio?.startEndlessMusic();   // Endless-only track (dawn) replaces gameplay music
    this.triggerAnnouncement('STAGE 02 — NEON SHINJUKU PLAZA', CYAN);   // Endless Stage 02 visuals

    // Null Breach Arena — arm fresh triggers for this Endless run
    this._nullBreachActive  = false;
    this._nullBreachArena   = null;
    this._nullBreach1Done   = false;
    this._nullBreach2Done   = false;
    this._arenaRescueUsed   = false;
    this._arenaResult       = null;
    this._endlessStartedAt  = this.timeAlive;
    // Arena-specific relic run-state
    this._breachCrownActive  = false;   // Breach Crown — armed on clean arena complete
    this._secondDebtFired    = false;   // Second Signal Debt — once per rescue   // snapshot so endlessElapsed = timeAlive - _endlessStartedAt

    // Chaos Law — one-fire EDEN CORE transmission on run start
    if (this.runChaosLaw === 'blood_grid') {
      this._queueEdenTransmission('BLOOD GRID ACTIVE. Enemy acceleration +7%. Score multiplier +10%.', { title: 'CHAOS LAW', priority: 2, duration: 6 });
    } else if (this.runChaosLaw === 'frozen_eden') {
      this._queueEdenTransmission('FROZEN EDEN ACTIVE. XP absorption amplified.', { title: 'CHAOS LAW', priority: 2, duration: 6 });
    } else if (this.runChaosLaw === 'no_mercy_protocol') {
      this._queueEdenTransmission('NO MERCY PROTOCOL ACTIVE. Boss containment exceeded.', { title: 'CHAOS LAW', priority: 2, duration: 6 });
    }
  }


  // ─── Chaos Law Selection Overlay ─────────────────────────────────────────────
  _showChaosLawSelectionOverlay() {
    const existing = document.getElementById('cgm-chaos-law-sel');
    if (existing) existing.remove();

    if (!document.getElementById('cgm-cls-style')) {
      const style = document.createElement('style');
      style.id = 'cgm-cls-style';
      style.textContent = [
        '#cgm-chaos-law-sel{position:fixed;inset:0;z-index:200;display:flex;',
        'align-items:center;justify-content:center;background:rgba(2,4,14,0.93);',
        "font-family:'Share Tech Mono',ui-monospace,monospace;color:#cfe9ff;}",
        '#cgm-chaos-law-sel .cls-box{width:min(580px,93vw);',
        'background:linear-gradient(180deg,#0b0e2a,#070a1c);',
        'border:1px solid rgba(46,230,246,0.22);border-radius:14px;',
        'padding:28px 22px 22px;display:flex;flex-direction:column;gap:18px;}',
        '#cgm-chaos-law-sel .cls-header{text-align:center;}',
        '#cgm-chaos-law-sel .cls-header h2{',
        "font-family:'Orbitron',sans-serif;font-weight:900;",
        'font-size:14px;letter-spacing:4px;color:#2ee6f6;margin:0 0 7px;',
        'text-shadow:0 0 12px rgba(46,230,246,.55);}',
        '#cgm-chaos-law-sel .cls-header p{',
        'font-size:10px;color:rgba(180,210,240,0.5);letter-spacing:1.5px;margin:0;}',
        '#cgm-chaos-law-sel .cls-cards{display:flex;flex-direction:column;gap:9px;}',
        '#cgm-chaos-law-sel .cls-card{border-radius:10px;padding:13px 15px;',
        'border:1px solid rgba(46,230,246,0.12);background:rgba(6,12,28,0.7);',
        'cursor:pointer;transition:border-color .18s,background .18s;',
        'display:flex;flex-direction:column;gap:5px;}',
        '#cgm-chaos-law-sel .cls-card:hover{background:rgba(10,20,44,0.92);}',
        '#cgm-chaos-law-sel .cls-card-name{',
        "font-family:'Orbitron',sans-serif;font-weight:800;",
        'font-size:11px;letter-spacing:3px;}',
        '#cgm-chaos-law-sel .cls-card-effect{',
        'font-size:10px;color:rgba(180,220,255,0.65);letter-spacing:1px;}',
        '#cgm-chaos-law-sel .cls-skip{text-align:center;}',
        '#cgm-chaos-law-sel .cls-skip button{',
        'background:transparent;border:1px solid rgba(46,230,246,0.18);',
        'border-radius:6px;color:rgba(120,160,200,0.55);',
        "font-family:'Share Tech Mono',monospace;font-size:10px;",
        'letter-spacing:2px;padding:7px 22px;cursor:pointer;',
        'transition:border-color .15s,color .15s;}',
        '#cgm-chaos-law-sel .cls-skip button:hover{',
        'border-color:rgba(46,230,246,0.38);color:rgba(180,220,255,0.8);}',
      ].join('');
      document.head.appendChild(style);
    }

    const V1_LAWS = [
      { id: 'blood_grid',        name: 'BLOOD GRID',        color: '#ef4444',
        effect: '+10% score multiplier for this run.' },
      { id: 'frozen_eden',       name: 'FROZEN EDEN',       color: '#00ccff',
        effect: '+10% XP gain for this run.' },
      { id: 'no_mercy_protocol', name: 'NO MERCY PROTOCOL', color: '#fbbf24',
        effect: '+10% boss HP \u00b7 +15% score multiplier for this run.' },
    ];

    const el = document.createElement('div');
    el.id = 'cgm-chaos-law-sel';
    el.innerHTML = '<div class="cls-box">'
      + '<div class="cls-header"><h2>CHAOS LAW SELECTION</h2>'
      + '<p>EDEN MEMORY \u2265 50% \u2014 CHOOSE THE INSTABILITY RULE FOR THIS RUN</p></div>'
      + '<div class="cls-cards">'
      + V1_LAWS.map(l =>
          '<div class="cls-card" data-law="' + l.id + '" style="border-color:' + l.color + '33;">'
          + '<div class="cls-card-name" style="color:' + l.color + ';text-shadow:0 0 8px ' + l.color + '88;">' + l.name + '</div>'
          + '<div class="cls-card-effect">' + l.effect + '</div>'
          + '</div>'
        ).join('')
      + '</div>'
      + '<div class="cls-skip"><button id="cls-skip-btn">SKIP \u2014 STANDARD ENDLESS</button></div>'
      + '</div>';
    document.body.appendChild(el);

    el.querySelectorAll('.cls-card').forEach(card => {
      card.addEventListener('click', () => {
        this.runChaosLaw = card.dataset.law;
        this._hideChaosLawSelectionOverlay();
        this.gameState = 'playing';
        this.reset();
        this._enterEndless();
      });
    });
    document.getElementById('cls-skip-btn').addEventListener('click', () => {
      this.runChaosLaw = null;
      this._hideChaosLawSelectionOverlay();
      this.gameState = 'playing';
      this.reset();
      this._enterEndless();
    });
  }

  _hideChaosLawSelectionOverlay() {
    const el = document.getElementById('cgm-chaos-law-sel');
    if (el) el.remove();
  }

  /** Returns active Chaos Law multipliers for this run. All fields default to 1 (no effect). */
  _getActiveChaosLawModifiers() {
    const mods = { scoreMult: 1, xpMult: 1, bossHpMult: 1, enemySpeedMult: 1 };
    if (this.runChaosLaw === 'blood_grid')        { mods.scoreMult  = 1.10; mods.enemySpeedMult = 1.07; }
    if (this.runChaosLaw === 'frozen_eden')       { mods.xpMult     = 1.10; }
    if (this.runChaosLaw === 'no_mercy_protocol') { mods.scoreMult  = 1.15; mods.bossHpMult = 1.10; }
    return mods;
  }

  // Live Endless-achievement evaluation — unlock + persist the INSTANT a milestone is crossed
  // (not only at game-over), so progress survives a page refresh and the per-frame Achievement
  // Protocols/Cards activate during the SAME run. Cheap: unlockEndlessAchievements only writes
  // localStorage when a NEW flag is set. Combo uses the run peak (maxCombo).
  _checkEndlessAchievements() {
    if (!this.endless || !this.meta) return;
    this.meta.unlockEndlessAchievements({
      time:  this.timeAlive,
      level: this.player.level,
      score: Math.floor(this.score || 0),
      combo: Math.max(this.comboCount || 0, this.maxCombo || 0),
      cores: this.player.coresSecured,
    });
  }

  // Achievement Protocols — passive Endless rewards that auto-activate from existing achievement
  // unlock state (no save migration). One-shot stat boosts applied here when entering Endless;
  // the per-frame protocols (damage / overload / mastery weight) are read live elsewhere. Locked
  // achievements grant nothing, and none of this runs in Act 1 (continueEndless is the sole entry).
  _applyEndlessProtocols() {
    const p = this.player, m = this.meta;
    if (m.hasAchievement('first_endless')) p.xpMult = (p.xpMult || 1) * 1.05;          // Endless Initiate
    if (m.hasAchievement('endless_survivor')) {                                         // Survivor Core
      const add = Math.round(p.maxHp * 0.05);
      p.maxHp += add; p.hp = Math.min(p.maxHp, p.hp + add);
    }
    if (m.hasAchievement('core_defender')) p.maxCarry += 1;                             // Nexus Defender
  }

  // Global damage multiplier from Achievement Protocols/Cards — Endless ONLY (returns 1 in Act 1,
  // so Act 1 balance is unchanged). Applied to NORMAL enemies via Enemy.takeHit; bosses use a
  // separate hp path and are intentionally NOT buffed (respects boss caps). Small/medium + capped.
  _endlessDamageMult() {
    if (!this.endless) return 1;
    const m = this.meta, combo = this.comboCount || 0;
    let mult = 1;
    if (m.hasAchievement('score_hunter')) mult += 0.05;                                  // Damage Uplink Protocol
    mult += 0.06 * this._cardLvl('achievement_damage_uplink');                           // Damage Uplink Card
    if (m.hasAchievement('combo_master')) mult += combo >= 100 ? 0.08 : combo >= 50 ? 0.05 : 0;  // Combo Surge Protocol
    const co = this._cardLvl('achievement_combo_overdrive');                             // Combo Overdrive Card
    if (co > 0) mult += (combo >= 100 ? 0.05 : combo >= 50 ? 0.025 : 0) * co;
    return mult;
  }

  // Permanent Grid-Credit progression screen (spent between runs).
  goToUpgradesScreen() {
    this._hideMenuOverlay();
    this.gameState        = 'upgrades';
    this._upgradeMsg      = '';
    this._upgradeMsgTimer = 0;
    this._confirmReset    = false;
    this._loreSection    = 0;
    this._upgradeTab      = 'core';
    this._showUpgradesOverlay();
  }

  goToCredits() { this._hideMenuOverlay(); this._hideSettingsOverlay(); this.gameState = 'credits'; }

  // Read-only Endless achievements gallery (display only — never unlocks/resets anything).
  goToAchievementsScreen() { this._hideMenuOverlay(); this.gameState = 'achievements'; this._showAchievementsOverlay(); }

  goToRelicsScreen() { this._hideMenuOverlay(); this.gameState = 'relics'; this._showRelicsOverlay(); }

  goToAudioSettings() {
    this._hideMenuOverlay();
    this._hideSettingsOverlay();
    this.gameState      = 'audio_settings';
    this._audioSelIndex = 0;
    // Assume the button is still held from the click that opened this screen,
    // so the entering click is not mistaken for a BACK press (their hit-boxes
    // overlap). Only a fresh press after release should register.
    this._prevMouseDown = true;
  }

  goToInstructions() { this._hideMenuOverlay(); this._hideSettingsOverlay(); this.gameState = 'instructions'; }

  // ─── Meta upgrades ──────────────────────────────────────────────────────────
  _applyMetaUpgrades() {
    if (!this.meta) return;
    const p  = this.player;
    const m  = this.meta;

    const hpLevels = m.getLevel('maxHp');
    p.maxHp += hpLevels * 10;
    p.hp     = Math.min(p.hp + hpLevels * 10, p.maxHp);

    p.speedBonus += m.getLevel('moveSpeed') * 0.05;

    let pickup = p.pickupRadius;
    for (let i = 0; i < m.getLevel('coreMagnet'); i++) pickup = Math.round(pickup * 1.10);
    p.pickupRadius = pickup;

    p.maxCarry  += m.getLevel('coreCapacity');
    // Player damage is read from upgrades['Pulse Damage'] in Player.shoot() — there is no
    // p.baseDamage field, so the old line was a no-op. Seed the dict so the meta upgrade applies.
    p.upgrades['Pulse Damage']        = (p.upgrades['Pulse Damage'] || 0) + m.getLevel('pulseDamage');
    p.upgrades['Firewall Protection'] = m.getLevel('firewall');

    // ── Upgrade Economy phase metas ──
    p.upgrades['Pulse Damage']  += m.getLevel('combatCalibration') * 0.5;          // global damage
    p.contactDamageReduction     = Math.min(0.6, (p.contactDamageReduction || 0) + m.getLevel('armorPlating') * 0.03);
    p.maxMana                   += m.getLevel('manaCapacitor') * 10;               // ultimate cost stays 100
    p.xpMult                     = 1 + m.getLevel('xpUplink') * 0.05;
  }

  // Returns per-echo passive bonus scalars based on current archive state.
  // All values default to identity (1 or 0) for missing echoes — safe with old saves.
  _getBossEchoPassiveBonuses() {
    if (!this.meta) return { maxHpMult: 1, moveSpeedBonus: 0, pulseDamageBonus: 0, fireRateBonus: 0 };
    const h = id => this.meta.hasBossEcho(id);
    return {
      maxHpMult:        h('titan')        ? 1.03 : 1,
      moveSpeedBonus:   h('bloodfang')    ? 0.02 : 0,
      pulseDamageBonus: (h('annihilator') ? 0.2  : 0) + (h('cyberSerpent') ? 0.2 : 0),
      fireRateBonus:    (h('cyberDragon') ? 0.02 : 0) + (h('doubleDemon')  ? 0.02 : 0),
    };
  }

  // Apply boss echo passives to the player once per run (called from reset() after _applyMetaUpgrades).
  // Only archived echoes (meta.hasBossEcho) apply. Repeat kills cannot increase these — the
  // hasBossEcho flag is set exactly once per boss. Old saves that have no bossEchoes default
  // to {} via MetaProgress._load(), so all calls to hasBossEcho return false → no bonus.
  _applyBossEchoPassives() {
    if (!this.meta || !this.player) return;
    const b = this._getBossEchoPassiveBonuses();
    const p = this.player;
    if (b.maxHpMult > 1) {
      p.maxHp = Math.round(p.maxHp * b.maxHpMult);
      p.hp    = Math.min(p.hp, p.maxHp);
    }
    if (b.moveSpeedBonus  > 0) p.speedBonus              = (p.speedBonus              || 0) + b.moveSpeedBonus;
    if (b.pulseDamageBonus > 0) p.upgrades['Pulse Damage'] = (p.upgrades['Pulse Damage'] || 0) + b.pulseDamageBonus;
    if (b.fireRateBonus   > 0) p.fireRateBonus            = (p.fireRateBonus           || 0) + b.fireRateBonus;
    // One-time per-run EDEN CORE message when any passive is active
    const activeCount = BOSS_ECHOES.filter(e => this.meta.hasBossEcho(e.id)).length;
    if (activeCount > 0 && !this._echoPassiveMsgFired) {
      this._echoPassiveMsgFired = true;
      try { this._queueEdenTransmission('EDEN CORE: Hostile echo converted into passive signal.', { priority: 1, duration: 5 }); } catch (_) {}
    }
  }

  _grantRewards() {
    if (this.rewardsGranted) return;
    this.rewardsGranted = true;

    const timeCredits    = Math.floor(this.timeAlive / 60);
    const killCredits    = Math.floor(this.player.kills / 40);
    const coreCredits    = Math.floor(this.player.coresSecured / 12);
    const survivalBonus  = this.timeAlive >= 300 ? 5 : 0;
    const victoryCredits = this.victory ? 15 : 0;

    this.runCreditsEarned = timeCredits + killCredits + coreCredits + survivalBonus + victoryCredits;
    this.meta.addCredits(this.runCreditsEarned);

    const finalScore = Math.floor(this.score);
    if (finalScore > this.bestScore) {
      this.bestScore      = finalScore;
      this.isNewHighScore = true;
      localStorage.setItem('phenix_best_score', finalScore);
    }

    // Endless-mode personal records (separate from the global best score above).
    // Only an Endless run feeds these; compares against the PRIOR bests, then persists.
    if (this.endless) {
      const run = {
        time:  Math.floor(this.timeAlive),
        score: finalScore,
        level: this.player.level,
      };
      this.endlessRun     = run;
      this.endlessNewBest = this.meta.submitEndlessRun(run);   // updates + persists records
      this.endlessBest    = { ...this.meta.endlessRecords };   // post-update bests for display

      // Endless achievement milestones (recognition only — no rewards/bonuses).
      this.endlessNewAchievements = this.meta.unlockEndlessAchievements({
        time:  run.time,
        level: run.level,
        score: run.score,
        combo: this.maxCombo,
        cores: this.player.coresSecured,
      });
    }

    // Record this run in local leaderboard history
    this.meta.recordRun({
      time:  Math.floor(this.timeAlive),
      score: finalScore,
      level: this.player.level,
      char:  this.player.characterId || 'unknown',
      mode:  this.endless ? 'Endless' : (this.victory ? 'Act 1 Win' : 'Act 1'),
    });

    // Eden Core: generate end-of-run narrative messages + accrue Eden Memory
    try { this._generateEdenRunMessages(); } catch(e) { console.warn('[Eden] _generateEdenRunMessages error:', e); }
  }

  // ── Eden Core narrative helpers ─────────────────────────────────────────────
  // Pick a random item from an array safely.
  _edenPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  // Character-specific Eden Core lines. Returns null if no specific line.
  _edenCharLine(charId) {
    const lines = {
      skeleton_warrior: [
        'STORM TRACE: Electric mark synchronized.',
        'EDEN CORE: Heavy charge detected.',
        'Tank signal refused deletion.',
        'THE GRID recognizes your endurance.',
      ],
      taekwondo_girl: [
        'EDEN CORE: Spirit impact pattern synchronized.',
        'ICE TRACE: Motion temperature stable.',
        'CRESCENT SIGNAL: Footwork memory recovered.',
        'Speed pattern exceeded safe prediction.',
      ],
      cyber_arm_hero: [
        'EDEN CORE: Burn cascade protocol active.',
        'FLAME TRACE: Ranged signal optimized.',
        'Combustion memory stabilized.',
        'Fire pattern recognized by the archive.',
      ],
      brawler_warrior: [
        'RIFT TRACE: Impact radius recorded.',
        'EDEN CORE: Brawl pattern archived.',
        'Close-range signal persisted.',
        'The Grid felt the impact.',
      ],
      assassin_clone: [
        'MIRROR TRACE: Duplicate signal stabilized.',
        'EDEN CORE: Clone pattern archived.',
        'Afterimage protocol accepted.',
        'The Grid counted you twice.',
      ],
      japan_phasewalker: [
        'PHASE TRACE: Displacement memory recovered.',
        'EDEN CORE: Phasewalker signal archived.',
        'Transition pattern stable.',
        'THE GRID lost your position. Briefly.',
      ],
      euclid_vector: [
        'NULL VENOM: Corruption spread contained.',
        'EDEN CORE: Venom trace stabilized.',
        'Toxic pattern accepted.',
        'Hostile biology mapped.',
      ],
      oni_cataclysm_protocol: [
        'ONI TRACE: Blood circuit pressure rising.',
        'EDEN CORE: Heavy signal detected.',
        'Oni protocol refused deletion.',
        'The Grid recognizes your violence.',
      ],
    };
    const pool = lines[charId];
    if (!pool) return null;
    return this._edenPick(pool);
  }

  // Generate end-of-run Eden Core messages and accumulate Eden Memory.
  // Called from _grantRewards(). Sets this.edenRunMessages for end screen.
  _generateEdenRunMessages() {
    if (!this.meta) return;
    const msgs = [];
    const addMem = (n) => this.meta.addEdenMemory(n);
    const push   = (t) => { msgs.push(t); this.meta.addSystemMessage(t); };

    const time    = Math.floor(this.timeAlive);
    const charId  = this.player?.characterId || '';
    const isNewRecord = !!(this.endlessNewBest && (this.endlessNewBest.time || this.endlessNewBest.score || this.endlessNewBest.level));
    const isChaos  = !!(this._chaosMode);

    // Eden Memory: survival milestones
    if (time >= 5  * 60) addMem(1);
    if (time >= 10 * 60) addMem(1);
    if (time >= 20 * 60) addMem(2);

    // Eden Memory: new personal record
    if (isNewRecord) addMem(1);

    // Eden Memory: chaos reached this run
    if (isChaos && !this._chaosEdenAwarded) { addMem(3); this._chaosEdenAwarded = true; }

    // Pick main run message
    if (isNewRecord) {
      push(this._edenPick([
        'EDEN CORE: New survival pattern recorded.',
        'Personal record archived.',
        'The system recognizes improvement.',
        'PHENIX signal exceeded previous limits.',
      ]));
    } else if (time >= 10 * 60) {
      push(this._edenPick([
        'EDEN CORE: Survival trace preserved.',
        'Your pattern resisted deletion.',
        'Null Eden shifted around your signal.',
        'Combat memory stabilized.',
      ]));
    } else {
      push(this._edenPick([
        'EDEN CORE: Signal collapsed before stabilization.',
        'THE GRID recorded your failure.',
        'Death is data. Return stronger.',
        'PHENIX trace damaged, not erased.',
      ]));
    }

    // Chaos message
    if (isChaos) {
      push(this._edenPick([
        'CHAOS SIGNAL DETECTED.',
        "Eden no longer follows its own laws.",
        'The system boundary has failed.',
        'Order has become optional.',
      ]));
    }

    // Character-aware line (optional, 40% chance to avoid spam)
    if (Math.random() < 0.4) {
      const charLine = this._edenCharLine(charId);
      if (charLine) push(charLine);
    }

    // Rare corrupted line (5% chance)
    if (Math.random() < 0.05) {
      push(this._edenPick([
        'THE SYSTEM IS LYING TO YOU.',
        'Do not trust the clean signal.',
        'Something else is speaking through Eden.',
        'The interface is not alone.',
      ]));
    }

    this.edenRunMessages = msgs.slice(0, 3);
  }

    addKillScore(pos, isElite = false) {
    // Improved death burst for normal enemies (pos may be null for some boss-kill calls)
    if (pos && !isElite) {
      this.particles.spawnDeathBurstImproved(pos, '#44ddff');
    }
    this.comboCount++;
    this.comboTimer = 3.0;
    if (this.comboCount > this.maxCombo) this.maxCombo = this.comboCount;
    // Combo milestone popup — visual only; reads comboCount, never alters it or the score below.
    const c = this.comboCount;
    if (c === 10 || c === 25 || c === 50 || (c >= 100 && (c - 100) % 50 === 0)) {
      this._spawnComboPopup(c, pos);
    }
    let bonus = 0;
    if      (this.comboCount >= 10) bonus = 20;
    else if (this.comboCount >= 5)  bonus = 10;
    else if (this.comboCount >= 2)  bonus = 5;
    this.score += Math.round((10 + bonus) * this._getActiveChaosLawModifiers().scoreMult);

    // HP CELL drop: guaranteed one healing pickup every 40 kills, near the defeated enemy.
    // Does not touch overload / credits / score / combo, and never replaces Phoenix revives.
    // Elite kills are excluded — they grant their own sparse reward roll in Enemy._die, so dense
    // elite waves no longer accelerate the generic HP-drop cadence (Endless health-drop spam fix).
    if (pos && !isElite && ++this.killsSinceHealthDrop >= 40) {
      this.killsSinceHealthDrop = 0;
      const dropPos = this._clampPickupPos(pos.clone().add(new Vec2(randomRange(-10, 10), -8)));
      this.healthPickups.push({ pos: dropPos, timer: 25 });
    }
  }

  // ─── Upgrades screen interaction ─────────────────────────────────────────────
  handleUpgradesClick(mousePos) {
    const { rects, backRect, resetRect, coreTab, synTab, protoTab } = this._upgradeRects();

    // Tab toggle
    if (this._inRect(mousePos, coreTab))  { this._upgradeTab = 'core';      this._confirmReset = false; return; }
    if (this._inRect(mousePos, synTab))   { this._upgradeTab = 'synergy';   this._confirmReset = false; return; }
    if (this._inRect(mousePos, protoTab)) { this._upgradeTab = 'protocols'; this._confirmReset = false; return; }

    // Back button
    if (this._inRect(mousePos, backRect)) {
      this.goToMainMenu();
      return;
    }

    // Reset button
    if (this._inRect(mousePos, resetRect)) {
      if (this._confirmReset) {
        this.meta.respec();
        this._confirmReset = false;
        this._upgradeMsg = 'Upgrades reset — spent points refunded.';
        this._upgradeMsgTimer = 2.5;
      } else {
        this._confirmReset = true;
        this._upgradeMsg = 'Click RESET UPGRADES again to confirm.';
        this._upgradeMsgTimer = 3.0;
      }
      return;
    }

    // PROTOCOLS tab — permanent PF-purchased Protocol cards (separate spend path from Grid Cores).
    if (this._upgradeTab === 'protocols') {
      const cards = PROTOCOL_CARDS;
      for (let i = 0; i < cards.length; i++) {
        if (!this._inRect(mousePos, rects[i])) continue;
        const card = cards[i];
        const res  = this.meta.tryBuyProtocolCard(card.id);
        if      (res === 'ok')    this._upgradeMsg = `${card.name} unlocked!`;
        else if (res === 'owned') this._upgradeMsg = `${card.name} already unlocked.`;
        else if (res === 'soon')  this._upgradeMsg = `${card.name}: COMING SOON.`;
        else if (res === 'poor')  this._upgradeMsg = `Not enough Fragments (need ${card.cost} 🧩).`;
        this._upgradeMsgTimer = 2.2;
        this._confirmReset = false;
        break;
      }
      return;
    }

    // Upgrade cards (active tab list)
    const list = this._upgradeList();
    for (let i = 0; i < list.length; i++) {
      if (!this._inRect(mousePos, rects[i])) continue;
      const upg = list[i];
      // Locked synergy (Oni) — cannot be purchased until the character is unlocked.
      if (upg.lockedUntil && !this.meta.isProtocolUnlocked(upg.lockedUntil)) {
        this._upgradeMsg = `${upg.charName} must be unlocked first.`;
        this._upgradeMsgTimer = 2.2;
        this._confirmReset = false;
        break;
      }
      const result = this.meta.tryBuy(upg);
      if (result === 'ok') {
        this._upgradeMsg = `${upg.name} upgraded!`;
        this._upgradeMsgTimer = 2.0;
      } else if (result === 'poor') {
        this._upgradeMsg = `Not enough Grid Cores (need ${upgradeCost(upg, this.meta.getLevel(upg.key))}).`;
        this._upgradeMsgTimer = 2.0;
      } else {
        this._upgradeMsg = `${upg.name} is already at MAX.`;
        this._upgradeMsgTimer = 2.0;
      }
      this._confirmReset = false;
      break;
    }
  }

  _inRect(pos, r) {
    return pos.x >= r.x && pos.x <= r.x + r.w && pos.y >= r.y && pos.y <= r.y + r.h;
  }

  // True if a permanent Protocol card has been purchased (cheap object lookup; safe in hot loops).
  _hasProto(id) { return !!(this.meta && this.meta.protocolCards && this.meta.protocolCards[id]); }

  // Active Upgrades-screen list — CORE (META_UPGRADES) or the SYNERGY 5★ Grid-Core sink.
  _upgradeList() {
    if (this._upgradeTab === 'synergy')   return SYNERGY_UPGRADES;
    if (this._upgradeTab === 'protocols') return PROTOCOL_CARDS;
    return META_UPGRADES;
  }

  _upgradeRects() {
    const COLS = 4;
    // Slightly smaller cards + wider gaps so more background shows; grid starts below the tab row +
    // currency header. Click rects derive from these same values, so hit regions stay in sync.
    const CW = 250, CH = 136, CGAP = 28, RGAP = 20;
    const totalW = COLS * CW + (COLS - 1) * CGAP;
    const x0     = Math.round((WIDTH - totalW) / 2);
    const y0     = 150;
    const list   = this._upgradeList();
    const rects  = list.map((_, i) => ({
      x: x0 + (i % COLS) * (CW + CGAP),
      y: y0 + Math.floor(i / COLS) * (CH + RGAP),
      w: CW, h: CH,
    }));
    const rows = Math.ceil(list.length / COLS);
    const btnY = y0 + rows * (CH + RGAP) + 8;
    const backRect  = { x: x0,                y: btnY, w: 160, h: 40 };
    const resetRect = { x: x0 + totalW - 160, y: btnY, w: 160, h: 40 };
    // Tab toggle row (above the grid).
    const tabW = 200, tabH = 30, tabY = 112;
    const coreTab  = { x: x0,                   y: tabY, w: tabW, h: tabH };
    const synTab   = { x: x0 + (tabW + 18),     y: tabY, w: tabW, h: tabH };
    const protoTab = { x: x0 + 2 * (tabW + 18), y: tabY, w: tabW, h: tabH };
    return { rects, backRect, resetRect, coreTab, synTab, protoTab };
  }

  // ★★★☆☆ / MAX star strip for synergy upgrades.
  _starString(lvl, max) { return '★'.repeat(lvl) + '☆'.repeat(Math.max(0, max - lvl)); }

  // Permanent Protocol unlock card (PROTOCOLS tab). Category-accented, premium styling, clear
  // LOCKED / UNLOCKED / affordable / COMING-SOON states. Bought with spendable PF (idempotent).
  _drawProtocolCard(ctx, card, r) {
    const owned  = this.meta.hasProtocolCard(card.id);
    const soon   = !!card.comingSoon;
    const avail  = this.meta.getProtocolFragments();
    const afford = !owned && !soon && avail >= card.cost;
    const accent = card.cat === 'ENEMY' ? '#ff6a6a' : card.cat === 'WEATHER' ? '#7fd0ff' : '#b88bff';

    ctx.fillStyle = owned ? '#0c1810' : '#0a0f1e';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.save();
    ctx.shadowColor = owned ? '#56e08a' : afford ? accent : 'transparent';
    ctx.shadowBlur  = owned || afford ? 12 : 0;
    ctx.strokeStyle = owned ? '#56e08a' : soon ? '#3a4050' : afford ? accent : '#2a3550';
    ctx.lineWidth   = owned || afford ? 2 : 1;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.restore();

    // Category badge (left) + cost/state (right)
    ctx.textAlign = 'left';
    ctx.font = 'bold 10px Consolas, monospace';
    ctx.fillStyle = accent;
    ctx.fillText(`▍${card.cat}`, r.x + 12, r.y + 20);
    ctx.textAlign = 'right';
    ctx.font = 'bold 13px "Segoe UI Emoji", Consolas, monospace';
    ctx.fillStyle = owned ? '#56e08a' : soon ? '#7a8290' : '#7df9ff';
    ctx.fillText(owned ? '✓ UNLOCKED' : soon ? 'SOON' : `🧩 ${card.cost}`, r.x + r.w - 10, r.y + 20);

    // Name
    ctx.textAlign = 'left';
    ctx.font = 'bold 15px Consolas, monospace';
    ctx.fillStyle = soon ? '#8090a0' : WHITE;
    ctx.fillText(card.name, r.x + 12, r.y + 44);

    // Description — inline word-wrap (no wrapText import in this module)
    ctx.font = '11px Consolas, monospace';
    ctx.fillStyle = '#7a90a0';
    const words = card.desc.split(' ');
    let line = '', yy = r.y + 64;
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > r.w - 24 && line) { ctx.fillText(line, r.x + 12, yy); line = w; yy += 14; }
      else line = test;
    }
    if (line) ctx.fillText(line, r.x + 12, yy);

    // Optional card art (e.g. Phoenix Revival Protocol emblem) — lazily loaded, graceful if missing.
    if (card.icon) {
      this._protoIcons = this._protoIcons || {};
      let img = this._protoIcons[card.id];
      if (!img) { img = new Image(); img.onerror = () => {}; img.src = card.icon; this._protoIcons[card.id] = img; }
      if (img.complete && img.naturalWidth > 0) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, r.x + r.w - 46, r.y + r.h - 64, 36, 36);
        ctx.imageSmoothingEnabled = true;
      }
    }

    // Buy / state button
    const btnY = r.y + r.h - 34, btnH = 26;
    let bg, bdr, txt, tcol;
    if      (owned)  { bg = '#0c2014'; bdr = '#56e08a'; txt = 'UNLOCKED';            tcol = '#56e08a'; }
    else if (soon)   { bg = '#12161e'; bdr = '#3a4050'; txt = 'COMING SOON';         tcol = '#6a7686'; }
    else if (afford) { bg = '#16182a'; bdr = accent;    txt = `BUY  —  ${card.cost} 🧩`; tcol = accent; }
    else             { bg = '#1a0e12'; bdr = '#5a3040'; txt = `NEED ${card.cost} 🧩`;    tcol = '#a05868'; }
    ctx.fillStyle = bg; ctx.fillRect(r.x + 10, btnY, r.w - 20, btnH);
    ctx.strokeStyle = bdr; ctx.lineWidth = 1; ctx.strokeRect(r.x + 10, btnY, r.w - 20, btnH);
    ctx.font = 'bold 12px "Segoe UI Emoji", Consolas, monospace';
    ctx.fillStyle = tcol; ctx.textAlign = 'center';
    ctx.fillText(txt, r.x + r.w / 2, btnY + 18);
    ctx.textAlign = 'left';
  }

  _updateUpgradesScreen(input) {
    if (this._upgradeMsgTimer > 0) { this._upgradeMsgTimer -= 1/60; this._syncUpgradeMsg(); }
    if (input.keys.has('escape')) {
      this.goToMainMenu();
      input.keys.delete('escape');
    }
  }

  // ─── UPGRADES DOM overlay ──────────────────────────────────────────────────
  _initUpgradesOverlay() {
    if (this._upgradesOverlayEl) return;

    if (!document.getElementById('cgm-upg-style')) {
      const style = document.createElement('style');
      style.id = 'cgm-upg-style';
      style.textContent = `
        #cgm-upgrades {
          position:fixed; inset:0; z-index:130; display:none;
          align-items:flex-start; justify-content:center;
          overflow-y:auto; padding:16px 14px 24px;
          font-family:'Share Tech Mono',ui-monospace,monospace; color:#cfe9ff;
          background:
            radial-gradient(1200px 700px at 50% -10%,rgba(168,85,247,.18),transparent 60%),
            radial-gradient(900px 600px at 12% 30%,rgba(46,230,246,.10),transparent 60%),
            radial-gradient(900px 600px at 88% 70%,rgba(255,45,149,.10),transparent 60%),
            linear-gradient(180deg,#0b1030,#070a1c);
          --cyan:#2ee6f6; --cyan-dim:#1aa9bd; --magenta:#ff2d95; --purple:#a855f7;
          --amber:#fbbf24; --green:#34d399; --yellow:#7CFF4D; --txt:#cfe9ff;
          --txt-dim:#6f86b8; --txt-faint:#46588a;
          --panel-edge:rgba(46,230,246,.10);
          --glow-cyan:0 0 8px rgba(46,230,246,.55),0 0 22px rgba(46,230,246,.22);
          --glow-amb:0 0 8px rgba(251,191,36,.5),0 0 18px rgba(251,191,36,.18);
          --glow-mag:0 0 10px rgba(255,45,149,.55),0 0 26px rgba(255,45,149,.22);
          --radius:12px;
        }
        #cgm-upgrades::before {
          content:""; position:fixed; inset:0; pointer-events:none; z-index:0;
          background-image:linear-gradient(rgba(46,230,246,.05) 1px,transparent 1px),
            linear-gradient(90deg,rgba(46,230,246,.05) 1px,transparent 1px);
          background-size:46px 46px;
          mask-image:radial-gradient(circle at 50% 40%,#000 0%,transparent 78%);
        }
        #cgm-upgrades::after {
          content:""; position:fixed; inset:0; pointer-events:none; z-index:9999;
          background:repeating-linear-gradient(0deg,rgba(0,0,0,.10) 0 2px,transparent 2px 4px);
          opacity:.35; mix-blend-mode:overlay;
        }
        #cgm-upgrades * { box-sizing:border-box; margin:0; padding:0; }
        #cgm-upgrades .cgu-stage {
          position:relative; z-index:1; width:100%; max-width:1140px;
          border:1px solid var(--panel-edge); border-radius:20px;
          padding:22px 26px 20px;
          background:linear-gradient(180deg,rgba(168,85,247,.05),transparent 30%),rgba(7,10,28,.78);
          box-shadow:inset 0 0 60px rgba(46,230,246,.05),0 30px 80px rgba(0,0,0,.55);
          display:flex; flex-direction:column; align-items:stretch; gap:14px;
        }
        #cgm-upgrades .corner{position:absolute;width:34px;height:34px;border:2px solid var(--cyan);opacity:.8;filter:drop-shadow(0 0 6px rgba(46,230,246,.55));}
        #cgm-upgrades .corner.tl{top:-2px;left:-2px;border-right:0;border-bottom:0;border-radius:18px 0 0 0;}
        #cgm-upgrades .corner.tr{top:-2px;right:-2px;border-left:0;border-bottom:0;border-radius:0 18px 0 0;}
        #cgm-upgrades .corner.bl{bottom:-2px;left:-2px;border-right:0;border-top:0;border-radius:0 0 0 18px;}
        #cgm-upgrades .corner.br{bottom:-2px;right:-2px;border-left:0;border-top:0;border-radius:0 0 18px 0;}
        #cgm-upgrades .cgu-header { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; }
        #cgm-upgrades .cgu-title { font-family:'Orbitron',sans-serif; font-weight:800; font-size:16px; letter-spacing:3px; color:var(--cyan); text-shadow:var(--glow-cyan); display:flex; align-items:center; gap:10px; }
        #cgm-upgrades .cgu-currency { display:flex; align-items:center; gap:16px; flex-wrap:wrap; }
        #cgm-upgrades .cgu-credits { display:flex; align-items:center; gap:7px; padding:6px 14px; border-radius:999px; border:1px solid rgba(251,191,36,.35); background:rgba(251,191,36,.07); font-family:'Orbitron',sans-serif; font-weight:700; font-size:13px; color:var(--amber); }
        #cgm-upgrades .cgu-pf { display:flex; align-items:center; gap:7px; padding:6px 14px; border-radius:999px; border:1px solid rgba(168,85,247,.35); background:rgba(168,85,247,.07); font-family:'Orbitron',sans-serif; font-weight:700; font-size:13px; color:var(--purple); }
        #cgm-upgrades .cgu-sep { width:100%; height:1px; background:linear-gradient(90deg,transparent,var(--cyan),transparent); opacity:.3; }
        #cgm-upgrades .cgu-tabs { display:flex; gap:10px; }
        #cgm-upgrades .cgu-tab { padding:8px 20px; border-radius:8px; cursor:pointer; font-size:12px; letter-spacing:1.5px; text-transform:uppercase; border:1px solid rgba(46,230,246,.2); background:rgba(10,16,46,.4); color:var(--txt-dim); transition:.14s; font-family:'Share Tech Mono',monospace; }
        #cgm-upgrades .cgu-tab:hover { border-color:rgba(46,230,246,.4); color:var(--txt); }
        #cgm-upgrades .cgu-tab.active-core  { border-color:var(--cyan);   color:var(--cyan);   background:rgba(46,230,246,.1);  box-shadow:var(--glow-cyan); }
        #cgm-upgrades .cgu-tab.active-syn   { border-color:var(--amber);  color:var(--amber);  background:rgba(251,191,36,.08); box-shadow:var(--glow-amb); }
        #cgm-upgrades .cgu-tab.active-proto { border-color:var(--purple); color:var(--purple); background:rgba(168,85,247,.08); }
        #cgm-upgrades .cgu-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:14px; }
        #cgm-upgrades .cgu-card { position:relative; border-radius:var(--radius); background:rgba(10,16,46,.55); border:1px solid rgba(46,230,246,.2); padding:14px 14px 12px; display:flex; flex-direction:column; gap:7px; transition:.15s; }
        #cgm-upgrades .cgu-card.can-afford  { border-color:rgba(46,230,246,.5); }
        #cgm-upgrades .cgu-card.maxed       { border-color:rgba(124,255,77,.4); background:rgba(0,20,10,.45); }
        #cgm-upgrades .cgu-card.syn-card    { border-color:rgba(251,191,36,.25); background:rgba(18,14,6,.55); }
        #cgm-upgrades .cgu-card.syn-card.can-afford { border-color:rgba(251,191,36,.55); }
        #cgm-upgrades .cgu-card.syn-card.maxed      { border-color:rgba(124,255,77,.5); }
        #cgm-upgrades .cgu-card.locked-card { border-color:rgba(90,90,106,.3); background:rgba(12,12,20,.55); opacity:.7; }
        #cgm-upgrades .cgu-card.proto-card  { border-color:rgba(184,139,255,.25); background:rgba(10,8,22,.55); }
        #cgm-upgrades .cgu-card.proto-owned { border-color:rgba(86,224,138,.5);   background:rgba(8,22,10,.55); }
        #cgm-upgrades .cgu-card.proto-soon  { border-color:rgba(58,64,80,.3); opacity:.6; }
        #cgm-upgrades .cgu-card-header { display:flex; align-items:baseline; justify-content:space-between; gap:8px; }
        #cgm-upgrades .cgu-card-name   { font-family:'Orbitron',sans-serif; font-weight:700; font-size:12px; letter-spacing:.5px; color:#dff0ff; }
        #cgm-upgrades .cgu-card-level  { font-family:'Orbitron',sans-serif; font-weight:700; font-size:11px; color:var(--cyan); white-space:nowrap; }
        #cgm-upgrades .cgu-card-level.maxed { color:var(--yellow); }
        #cgm-upgrades .cgu-char-tag { font-size:10px; color:var(--txt-dim); letter-spacing:1px; }
        #cgm-upgrades .cgu-syn-tag  { font-size:9px;  color:var(--amber);   letter-spacing:2px; text-transform:uppercase; }
        #cgm-upgrades .cgu-card-desc   { font-size:11px; color:var(--txt-faint); line-height:1.4; }
        #cgm-upgrades .cgu-card-effect { font-size:11px; color:var(--green); }
        #cgm-upgrades .cgu-dots { display:flex; gap:5px; flex-wrap:wrap; margin-top:2px; }
        #cgm-upgrades .cgu-dot { width:8px; height:8px; border-radius:50%; background:rgba(46,230,246,.18); }
        #cgm-upgrades .cgu-dot.filled     { background:var(--cyan);  box-shadow:0 0 6px rgba(46,230,246,.6); }
        #cgm-upgrades .cgu-dot.syn-filled { background:var(--amber); box-shadow:0 0 6px rgba(251,191,36,.5); }
        #cgm-upgrades .cgu-proto-top  { display:flex; align-items:center; justify-content:space-between; }
        #cgm-upgrades .cgu-proto-cat  { font-size:9px; letter-spacing:2px; text-transform:uppercase; padding:2px 7px; border-radius:4px; background:rgba(184,139,255,.15); color:var(--purple); }
        #cgm-upgrades .cgu-proto-cat.enemy   { background:rgba(255,106,106,.15); color:#ff6a6a; }
        #cgm-upgrades .cgu-proto-cat.weather { background:rgba(127,208,255,.15); color:#7fd0ff; }
        #cgm-upgrades .cgu-proto-state        { font-size:11px; font-weight:700; }
        #cgm-upgrades .cgu-proto-state.owned  { color:var(--green);     }
        #cgm-upgrades .cgu-proto-state.afford { color:var(--purple);    }
        #cgm-upgrades .cgu-proto-state.soon   { color:var(--txt-faint); }
        #cgm-upgrades .cgu-proto-state.poor   { color:#a05868;          }
        #cgm-upgrades .cgu-buy-btn { margin-top:auto; padding:8px 0; border-radius:8px; cursor:pointer; font-family:'Orbitron',sans-serif; font-weight:700; font-size:11px; letter-spacing:1px; text-transform:uppercase; border:1px solid rgba(46,230,246,.3); background:rgba(46,230,246,.07); color:var(--txt-dim); transition:.14s; width:100%; }
        #cgm-upgrades .cgu-buy-btn:hover:not(:disabled) { border-color:var(--cyan); color:#fff; background:rgba(46,230,246,.14); }
        #cgm-upgrades .cgu-buy-btn.maxed        { border-color:rgba(124,255,77,.3);    color:var(--yellow);  background:rgba(26,37,16,.6);      cursor:default; }
        #cgm-upgrades .cgu-buy-btn.can-afford   { border-color:var(--cyan);            color:var(--cyan);    background:rgba(46,230,246,.1);    }
        #cgm-upgrades .cgu-buy-btn.syn-afford   { border-color:var(--amber);           color:var(--amber);   background:rgba(251,191,36,.08);   }
        #cgm-upgrades .cgu-buy-btn.proto-owned  { border-color:rgba(86,224,138,.4);    color:var(--green);   cursor:default;                    }
        #cgm-upgrades .cgu-buy-btn.proto-afford { border-color:var(--purple);          color:var(--purple);  background:rgba(168,85,247,.1);    }
        #cgm-upgrades .cgu-buy-btn.locked       { border-color:rgba(90,90,106,.3);     color:#7a7a88;        cursor:not-allowed;                }
        #cgm-upgrades .cgu-buy-btn:disabled { cursor:default; }
        #cgm-upgrades .cgu-msg { min-height:22px; text-align:center; font-size:13px; letter-spacing:1px; color:#ffd0a0; }
        #cgm-upgrades .cgu-footer { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; }
        #cgm-upgrades .cgu-foot-left { display:flex; gap:12px; }
        #cgm-upgrades .cgu-foot-btn { padding:11px 26px; border-radius:10px; cursor:pointer; border:1px solid rgba(46,230,246,.28); background:linear-gradient(180deg,rgba(46,230,246,.05),rgba(10,16,46,.35)); color:var(--txt); font-family:'Orbitron',sans-serif; font-weight:700; font-size:12px; letter-spacing:2px; text-transform:uppercase; transition:.15s; }
        #cgm-upgrades .cgu-foot-btn:hover { border-color:var(--cyan); color:#fff; background:linear-gradient(180deg,rgba(46,230,246,.14),rgba(46,230,246,.04)); box-shadow:var(--glow-cyan); }
        #cgm-upgrades .cgu-foot-btn.back-btn  { border-color:rgba(111,134,184,.22); color:var(--txt-dim); }
        #cgm-upgrades .cgu-foot-btn.back-btn:hover  { border-color:var(--txt-dim); background:rgba(111,134,184,.08); box-shadow:none; }
        #cgm-upgrades .cgu-foot-btn.reset-btn { border-color:rgba(255,45,149,.25); color:var(--magenta); background:rgba(255,45,149,.05); }
        #cgm-upgrades .cgu-foot-btn.reset-btn:hover  { border-color:var(--magenta); box-shadow:var(--glow-mag); }
        #cgm-upgrades .cgu-foot-btn.reset-confirm { border-color:var(--magenta); background:rgba(255,45,149,.18); color:#fff; animation:cgu-pulse .6s infinite alternate; }
        @keyframes cgu-pulse { to { box-shadow:0 0 18px rgba(255,45,149,.7); } }
        #cgm-upgrades .cgu-hints { color:var(--txt-faint); font-size:11px; letter-spacing:1px; display:flex; gap:14px; flex-wrap:wrap; align-items:center; }
        #cgm-upgrades .cgu-hints b { color:var(--cyan); font-weight:400; }
      `;
      document.head.appendChild(style);
    }

    const el = document.createElement('div');
    el.id = 'cgm-upgrades';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Grid Upgrades');

    el.innerHTML = `
      <div class="cgu-stage">
        <span class="corner tl"></span><span class="corner tr"></span>
        <span class="corner bl"></span><span class="corner br"></span>

        <div class="cgu-header">
          <div class="cgu-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><use href="#i-cpu"/></svg>
            GRID UPGRADES
          </div>
          <div class="cgu-currency">
            <div class="cgu-credits">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><use href="#i-bolt"/></svg>
              <span id="cgu-credits">0</span>&nbsp;CREDITS
            </div>
            <div class="cgu-pf">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><use href="#i-diamond"/></svg>
              <span id="cgu-pf-count">0</span>&nbsp;/&nbsp;<span id="cgu-pf-total">?</span>&nbsp;PF
            </div>
          </div>
        </div>
        <div class="cgu-sep"></div>

        <div class="cgu-tabs">
          <button class="cgu-tab" data-tab="core">CORE UPGRADES</button>
          <button class="cgu-tab" data-tab="synergy">★ WEAPON SYNERGIES</button>
          <button class="cgu-tab" data-tab="protocols">🧩 PROTOCOLS</button>
        </div>

        <div class="cgu-grid" id="cgu-grid"></div>

        <div class="cgu-msg" id="cgu-msg"></div>
        <div class="cgu-sep"></div>

        <div class="cgu-footer">
          <div class="cgu-foot-left">
            <button class="cgu-foot-btn back-btn"  id="cgu-back-btn">BACK</button>
            <button class="cgu-foot-btn reset-btn" id="cgu-reset-btn">RESET UPGRADES</button>
          </div>
          <div class="cgu-hints">
            <span><b>Click</b> card to buy</span>
            <span><b>ESC</b> Back</span>
          </div>
        </div>
      </div>
    `;

    el.querySelectorAll('.cgu-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this._upgradeTab   = btn.dataset.tab;
        this._confirmReset = false;
        this._syncUpgradesOverlay();
      });
    });

    el.querySelector('#cgu-back-btn')?.addEventListener('click', () => this.goToMainMenu());

    el.querySelector('#cgu-reset-btn')?.addEventListener('click', () => {
      if (this._confirmReset) {
        this.meta.respec();
        this._confirmReset = false;
        this._upgradeMsg      = 'Upgrades reset — spent points refunded.';
        this._upgradeMsgTimer = 2.5;
      } else {
        this._confirmReset    = true;
        this._upgradeMsg      = 'Click RESET UPGRADES again to confirm.';
        this._upgradeMsgTimer = 3.0;
      }
      this._syncUpgradesOverlay();
    });

    el.querySelector('#cgu-grid')?.addEventListener('click', e => {
      const btn = e.target.closest('.cgu-buy-btn');
      if (!btn || btn.disabled) return;
      const card = btn.closest('.cgu-card');
      if (!card) return;
      const idx = parseInt(card.dataset.idx, 10);
      const tab = this._upgradeTab;
      if (tab === 'protocols') {
        const pc  = PROTOCOL_CARDS[idx];
        if (!pc) return;
        const res = this.meta.tryBuyProtocolCard(pc.id);
        if      (res === 'ok')    this._upgradeMsg = `${pc.name} unlocked!`;
        else if (res === 'owned') this._upgradeMsg = `${pc.name} already unlocked.`;
        else if (res === 'soon')  this._upgradeMsg = `${pc.name}: COMING SOON.`;
        else if (res === 'poor')  this._upgradeMsg = `Not enough Fragments (need ${pc.cost}).`;
        this._upgradeMsgTimer = 2.2;
      } else {
        const list = tab === 'synergy' ? SYNERGY_UPGRADES : META_UPGRADES;
        const upg  = list[idx];
        if (!upg) return;
        if (upg.lockedUntil && !this.meta.isProtocolUnlocked(upg.lockedUntil)) {
          this._upgradeMsg      = `${upg.charName || upg.name} must be unlocked first.`;
          this._upgradeMsgTimer = 2.2;
        } else {
          const res = this.meta.tryBuy(upg);
          if      (res === 'ok')   { this._upgradeMsg = `${upg.name} upgraded!`; }
          else if (res === 'poor') { this._upgradeMsg = `Need ${upgradeCost(upg, this.meta.getLevel(upg.key))} Grid Cores.`; }
          else if (res === 'max')  { this._upgradeMsg = `${upg.name} is already MAX.`; }
          this._upgradeMsgTimer = 2.0;
        }
      }
      this._confirmReset = false;
      this._syncUpgradesOverlay();
    });

    document.body.appendChild(el);
    this._upgradesOverlayEl = el;
  }

  _showUpgradesOverlay() {
    if (!this._upgradesOverlayEl) return;
    this._upgradesOverlayEl.style.display = 'flex';
    this._upgradesOverlayVisible = true;
    this._syncUpgradesOverlay();
  }

  _hideUpgradesOverlay() {
    if (!this._upgradesOverlayEl) return;
    this._upgradesOverlayEl.style.display = 'none';
    this._upgradesOverlayVisible = false;
  }

  _syncUpgradeMsg() {
    const el = this._upgradesOverlayEl;
    if (!el) return;
    const msgEl = el.querySelector('#cgu-msg');
    if (msgEl) msgEl.textContent = (this._upgradeMsgTimer > 0 && this._upgradeMsg) ? this._upgradeMsg : '';
  }

  _syncUpgradesOverlay() {
    const el = this._upgradesOverlayEl;
    if (!el) return;
    const tab = this._upgradeTab || 'core';

    const credEl = el.querySelector('#cgu-credits');
    if (credEl) credEl.textContent = this.meta.credits;
    const pfEl = el.querySelector('#cgu-pf-count');
    if (pfEl) pfEl.textContent = this.meta.getProtocolFragments();
    const pfTotEl = el.querySelector('#cgu-pf-total');
    if (pfTotEl) pfTotEl.textContent = PF_TOTAL_OBTAINABLE;

    el.querySelectorAll('.cgu-tab').forEach(btn => {
      btn.classList.remove('active-core','active-syn','active-proto');
      if (btn.dataset.tab === tab) {
        btn.classList.add(tab === 'core' ? 'active-core' : tab === 'synergy' ? 'active-syn' : 'active-proto');
      }
    });

    const grid    = el.querySelector('#cgu-grid');
    if (!grid) return;
    const credits = this.meta.credits;
    const pf      = this.meta.getProtocolFragments();

    if (tab === 'core' || tab === 'synergy') {
      const list  = tab === 'synergy' ? SYNERGY_UPGRADES : META_UPGRADES;
      const isSyn = tab === 'synergy';
      grid.innerHTML = list.map((upg, i) => {
        const lvl    = this.meta.getLevel(upg.key);
        const cost   = upgradeCost(upg, lvl);
        const maxed  = lvl >= upg.maxLevel;
        const locked = !!(upg.lockedUntil && !this.meta.isProtocolUnlocked(upg.lockedUntil));
        const can    = !maxed && !locked && credits >= cost;
        const dots   = Array.from({length: upg.maxLevel}, (_, d) =>
          `<span class="cgu-dot${d < lvl ? (isSyn ? ' syn-filled' : ' filled') : ''}"></span>`
        ).join('');
        const effectText = (!isSyn && lvl > 0) ? `<div class="cgu-card-effect">▸ ${this._metaEffectText(upg.key, lvl)}</div>` : '';
        const charTag    = (isSyn && upg.charName) ? `<div class="cgu-char-tag">${upg.charName}</div>` : '';
        const synTag     = isSyn ? `<div class="cgu-syn-tag">★ Synergy</div>` : '';
        let btnClass = '', btnLabel = '', btnDis = '';
        if (locked)   { btnClass = 'locked';      btnLabel = '🔒 LOCKED';        btnDis = 'disabled'; }
        else if (maxed){ btnClass = 'maxed';       btnLabel = 'MAX';              btnDis = 'disabled'; }
        else if (can)  { btnClass = isSyn ? 'syn-afford' : 'can-afford'; btnLabel = `BUY — ${cost} Cores`; }
        else           { btnClass = '';            btnLabel = `${cost} Cores needed`; }
        const cardCls = `cgu-card${isSyn?' syn-card':''}${maxed?' maxed':''}${can?' can-afford':''}${locked?' locked-card':''}`;
        return `<div class="${cardCls}" data-idx="${i}">
          <div class="cgu-card-header">
            <div class="cgu-card-name">${upg.name}</div>
            <div class="cgu-card-level${maxed?' maxed':''}">${lvl} / ${upg.maxLevel}</div>
          </div>
          ${synTag}${charTag}
          <div class="cgu-card-desc">${upg.desc || ''}</div>
          ${effectText}
          <div class="cgu-dots">${dots}</div>
          <button class="cgu-buy-btn ${btnClass}" ${btnDis}>${btnLabel}</button>
        </div>`;
      }).join('');
    } else {
      grid.innerHTML = PROTOCOL_CARDS.map((card, i) => {
        const owned  = this.meta.hasProtocolCard(card.id);
        const soon   = !!card.comingSoon;
        const afford = !owned && !soon && pf >= card.cost;
        const catCls = card.cat === 'ENEMY' ? 'enemy' : card.cat === 'WEATHER' ? 'weather' : '';
        let cardCls = 'cgu-card proto-card';
        if (owned) cardCls += ' proto-owned';
        else if (soon) cardCls += ' proto-soon';
        let btnClass = '', btnLabel = '', btnDis = '';
        if (owned)    { btnClass = 'proto-owned';  btnLabel = '✓ UNLOCKED';    btnDis = 'disabled'; }
        else if (soon){ btnClass = 'soon';          btnLabel = 'COMING SOON';   btnDis = 'disabled'; }
        else if (afford){ btnClass = 'proto-afford'; btnLabel = `BUY — ${card.cost} 🧩`; }
        else          { btnClass = '';              btnLabel = `NEED ${card.cost} 🧩`; }
        const stateClass = owned ? 'owned' : soon ? 'soon' : afford ? 'afford' : 'poor';
        return `<div class="${cardCls}" data-idx="${i}">
          <div class="cgu-proto-top">
            <span class="cgu-proto-cat ${catCls}">${card.cat}</span>
            <span class="cgu-proto-state ${stateClass}">${owned ? '✓ UNLOCKED' : soon ? 'SOON' : `🧩 ${card.cost}`}</span>
          </div>
          <div class="cgu-card-name" style="margin-top:6px">${card.name}</div>
          <div class="cgu-card-desc">${card.desc || ''}</div>
          <button class="cgu-buy-btn ${btnClass}" ${btnDis}>${btnLabel}</button>
        </div>`;
      }).join('');
    }

    this._syncUpgradeMsg();

    const resetBtn = el.querySelector('#cgu-reset-btn');
    if (resetBtn) {
      resetBtn.classList.toggle('reset-confirm', !!this._confirmReset);
      resetBtn.textContent = this._confirmReset ? 'CONFIRM RESET?' : 'RESET PROGRESS';
    }
  }

  // ─── ACHIEVEMENTS DOM overlay ────────────────────────────────────────────────
  _initAchievementsOverlay() {
    if (this._achievementsOverlayEl) return;

    if (!document.getElementById('cgm-ach-style')) {
      const style = document.createElement('style');
      style.id = 'cgm-ach-style';
      style.textContent = `
        #cgm-achievements {
          position:fixed; inset:0; z-index:140; display:none;
          align-items:flex-start; justify-content:center;
          overflow-y:auto; padding:16px 14px 24px;
          font-family:'Share Tech Mono',ui-monospace,monospace; color:#cfe9ff;
          background:
            radial-gradient(1200px 700px at 50% -10%,rgba(168,85,247,.18),transparent 60%),
            radial-gradient(900px 600px at 12% 30%,rgba(46,230,246,.10),transparent 60%),
            radial-gradient(900px 600px at 88% 70%,rgba(255,45,149,.10),transparent 60%),
            linear-gradient(180deg,#0b1030,#070a1c);
          --cyan:#2ee6f6; --cyan-dim:#1aa9bd; --purple:#a855f7;
          --amber:#fbbf24; --green:#34d399; --yellow:#7CFF4D; --txt:#cfe9ff;
          --txt-dim:#6f86b8; --txt-faint:#46588a;
          --panel-edge:rgba(46,230,246,.10);
          --glow-cyan:0 0 8px rgba(46,230,246,.55),0 0 22px rgba(46,230,246,.22);
          --radius:12px;
        }
        #cgm-achievements::before {
          content:""; position:fixed; inset:0; pointer-events:none; z-index:0;
          background-image:linear-gradient(rgba(46,230,246,.05) 1px,transparent 1px),
            linear-gradient(90deg,rgba(46,230,246,.05) 1px,transparent 1px);
          background-size:46px 46px;
          mask-image:radial-gradient(circle at 50% 40%,#000 0%,transparent 78%);
        }
        #cgm-achievements::after {
          content:""; position:fixed; inset:0; pointer-events:none; z-index:9999;
          background:repeating-linear-gradient(0deg,rgba(0,0,0,.10) 0 2px,transparent 2px 4px);
          opacity:.35; mix-blend-mode:overlay;
        }
        #cgm-achievements * { box-sizing:border-box; margin:0; padding:0; }
        #cgm-achievements .ca-stage {
          position:relative; z-index:1; width:100%; max-width:1140px;
          border:1px solid var(--panel-edge); border-radius:20px;
          padding:22px 26px 20px;
          background:linear-gradient(180deg,rgba(168,85,247,.05),transparent 30%),rgba(7,10,28,.78);
          box-shadow:inset 0 0 60px rgba(46,230,246,.05),0 30px 80px rgba(0,0,0,.55);
          display:flex; flex-direction:column; align-items:stretch; gap:14px;
        }
        #cgm-achievements .corner{position:absolute;width:34px;height:34px;border:2px solid var(--cyan);opacity:.8;filter:drop-shadow(0 0 6px rgba(46,230,246,.55));}
        #cgm-achievements .corner.tl{top:-2px;left:-2px;border-right:0;border-bottom:0;border-radius:18px 0 0 0;}
        #cgm-achievements .corner.tr{top:-2px;right:-2px;border-left:0;border-bottom:0;border-radius:0 18px 0 0;}
        #cgm-achievements .corner.bl{bottom:-2px;left:-2px;border-right:0;border-top:0;border-radius:0 0 0 18px;}
        #cgm-achievements .corner.br{bottom:-2px;right:-2px;border-left:0;border-top:0;border-radius:0 0 18px 0;}
        #cgm-achievements .ca-header { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; }
        #cgm-achievements .ca-title  { font-family:'Orbitron',sans-serif; font-weight:800; font-size:16px; letter-spacing:3px; color:var(--cyan); text-shadow:var(--glow-cyan); display:flex; align-items:center; gap:10px; }
        #cgm-achievements .ca-badges { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
        #cgm-achievements .ca-badge  { display:flex; align-items:center; gap:7px; padding:6px 14px; border-radius:999px; border:1px solid rgba(251,191,36,.35); background:rgba(251,191,36,.07); font-family:'Orbitron',sans-serif; font-weight:700; font-size:13px; color:var(--amber); }
        #cgm-achievements .ca-pf     { display:flex; align-items:center; gap:7px; padding:6px 14px; border-radius:999px; border:1px solid rgba(46,230,246,.25); background:rgba(46,230,246,.05); font-family:'Orbitron',sans-serif; font-weight:700; font-size:12px; color:var(--cyan-dim); }
        #cgm-achievements .ca-bar-wrap { height:6px; border-radius:3px; background:rgba(255,255,255,.07); flex:1; min-width:120px; }
        #cgm-achievements .ca-bar     { height:6px; border-radius:3px; background:linear-gradient(90deg,var(--cyan),var(--purple)); transition:.4s; }
        #cgm-achievements .ca-progress { display:flex; align-items:center; gap:12px; }
        #cgm-achievements .ca-sep  { width:100%; height:1px; background:linear-gradient(90deg,transparent,var(--cyan),transparent); opacity:.3; }
        #cgm-achievements .ca-grid {
          display:grid; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); gap:14px;
        }
        #cgm-achievements .ca-card { position:relative; border-radius:var(--radius); border:1px solid rgba(46,90,100,.3); background:rgba(10,16,46,.55); padding:14px 14px 12px; display:flex; flex-direction:column; gap:6px; }
        #cgm-achievements .ca-card.unlocked { border-color:rgba(52,211,153,.5); background:rgba(0,18,12,.55); }
        #cgm-achievements .ca-card-top   { display:flex; align-items:flex-start; justify-content:space-between; gap:8px; }
        #cgm-achievements .ca-card-name  { font-family:'Orbitron',sans-serif; font-weight:700; font-size:12px; letter-spacing:.5px; color:#dff0ff; }
        #cgm-achievements .ca-card-name.locked { color:#4a6070; }
        #cgm-achievements .ca-card-goal  { font-size:11px; color:var(--txt-faint); line-height:1.4; }
        #cgm-achievements .ca-card-goal.locked { color:#364050; }
        #cgm-achievements .ca-tag     { font-size:9px; letter-spacing:2px; text-transform:uppercase; color:var(--txt-faint); }
        #cgm-achievements .ca-status  { font-family:'Orbitron',sans-serif; font-weight:700; font-size:10px; letter-spacing:1px; white-space:nowrap; }
        #cgm-achievements .ca-status.unlocked { color:var(--yellow); }
        #cgm-achievements .ca-status.locked   { color:#3a5060; }
        #cgm-achievements .ca-rewards { display:flex; flex-direction:column; gap:3px; margin-top:4px; padding-top:6px; border-top:1px solid rgba(255,255,255,.06); }
        #cgm-achievements .ca-reward-line  { display:flex; align-items:baseline; gap:6px; font-size:10px; line-height:1.35; }
        #cgm-achievements .ca-reward-label { font-family:'Orbitron',sans-serif; font-weight:700; font-size:9px; letter-spacing:1px; white-space:nowrap; }
        #cgm-achievements .ca-reward-label.proto { color:var(--purple); }
        #cgm-achievements .ca-reward-label.card  { color:var(--green); }
        #cgm-achievements .ca-reward-val        { color:var(--txt-dim); }
        #cgm-achievements .ca-reward-val.hidden { color:#2a3a45; font-style:italic; }
        #cgm-achievements .ca-footer   { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; }
        #cgm-achievements .ca-foot-btn { padding:11px 26px; border-radius:10px; cursor:pointer; border:1px solid rgba(111,134,184,.22); background:linear-gradient(180deg,rgba(10,16,46,.4),rgba(10,16,46,.25)); color:var(--txt-dim); font-family:'Orbitron',sans-serif; font-weight:700; font-size:12px; letter-spacing:2px; text-transform:uppercase; transition:.15s; }
        #cgm-achievements .ca-foot-btn:hover { border-color:var(--txt-dim); color:var(--txt); background:rgba(111,134,184,.08); }
        #cgm-achievements .ca-hints { color:var(--txt-faint); font-size:11px; letter-spacing:1px; display:flex; gap:14px; flex-wrap:wrap; align-items:center; }
        #cgm-achievements .ca-hints b { color:var(--cyan); font-weight:400; }

        /* ── Boss Echo Archive ── */
        #cgm-achievements .ce-section { display:flex; flex-direction:column; gap:10px; }
        #cgm-achievements .ce-title   { font-family:'Orbitron',sans-serif; font-weight:800; font-size:14px; letter-spacing:3px; color:var(--purple); text-shadow:0 0 8px rgba(168,85,247,.55),0 0 22px rgba(168,85,247,.22); display:flex; align-items:center; gap:10px; }
        #cgm-achievements .ce-header  { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; }
        #cgm-achievements .ce-count   { font-family:'Orbitron',sans-serif; font-weight:700; font-size:12px; color:#a855f7; padding:5px 14px; border-radius:999px; border:1px solid rgba(168,85,247,.35); background:rgba(168,85,247,.07); }
        #cgm-achievements .ce-memory  { font-family:'Orbitron',sans-serif; font-weight:700; font-size:12px; color:#2ee6f6; padding:5px 14px; border-radius:999px; border:1px solid rgba(46,230,246,.25); background:rgba(46,230,246,.05); }
        #cgm-achievements .ce-grid    { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:10px; }
        #cgm-achievements .ce-card    { border-radius:10px; border:1px solid rgba(46,60,80,.35); background:rgba(8,12,36,.6); padding:12px 14px; display:flex; align-items:center; gap:12px; }
        #cgm-achievements .ce-card.archived { border-color:rgba(168,85,247,.55); background:rgba(10,4,24,.7); }
        #cgm-achievements .ce-icon    { width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:15px; flex-shrink:0; border:1px solid rgba(255,255,255,.08); background:rgba(0,0,0,.4); }
        #cgm-achievements .ce-icon.archived { box-shadow:0 0 10px currentColor; }
        #cgm-achievements .ce-info    { display:flex; flex-direction:column; gap:3px; flex:1; min-width:0; }
        #cgm-achievements .ce-name    { font-family:'Orbitron',sans-serif; font-weight:700; font-size:11px; letter-spacing:.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        #cgm-achievements .ce-name.locked  { color:#3a5060; }
        #cgm-achievements .ce-lore    { font-size:10px; color:var(--txt-faint); line-height:1.4; font-style:italic; }
        #cgm-achievements .ce-lore.locked  { color:#283040; }
        #cgm-achievements .ce-status  { font-family:'Orbitron',sans-serif; font-weight:700; font-size:9px; letter-spacing:1.5px; white-space:nowrap; }
        #cgm-achievements .ce-status.archived { color:#a855f7; }
        #cgm-achievements .ce-status.locked   { color:#3a5060; }
        #cgm-achievements .ce-passive          { font-family:'Orbitron',sans-serif; font-weight:700; font-size:8px; letter-spacing:1px; margin-top:3px; }
        #cgm-achievements .ce-passive.archived { color:#a855f7; opacity:.85; }
        #cgm-achievements .ce-passive.locked   { color:#2a3a45; }

        /* ── Eden Memory Milestones ── */
        #cgm-achievements .em-section { display:flex; flex-direction:column; gap:10px; }
        #cgm-achievements .em-title   { font-family:'Orbitron',sans-serif; font-weight:800; font-size:14px; letter-spacing:3px; color:#2ee6f6; text-shadow:0 0 8px rgba(46,230,246,.55),0 0 22px rgba(46,230,246,.22); display:flex; align-items:center; gap:10px; }
        #cgm-achievements .em-header  { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; }
        #cgm-achievements .em-pct     { font-family:'Orbitron',sans-serif; font-weight:700; font-size:12px; color:#2ee6f6; padding:5px 14px; border-radius:999px; border:1px solid rgba(46,230,246,.35); background:rgba(46,230,246,.07); }
        #cgm-achievements .em-list    { display:flex; flex-direction:column; gap:8px; }
        #cgm-achievements .em-row     { border-radius:10px; border:1px solid rgba(46,60,80,.35); background:rgba(8,12,36,.6); padding:11px 14px; display:flex; align-items:center; gap:12px; }
        #cgm-achievements .em-row.reached { border-color:rgba(46,230,246,.45); background:rgba(4,16,28,.7); }
        #cgm-achievements .em-badge   { font-family:'Orbitron',sans-serif; font-weight:800; font-size:11px; min-width:36px; text-align:center; padding:4px 8px; border-radius:6px; flex-shrink:0; border:1px solid rgba(255,255,255,.08); background:rgba(0,0,0,.4); color:#3a5060; }
        #cgm-achievements .em-badge.reached { color:#2ee6f6; border-color:rgba(46,230,246,.45); box-shadow:0 0 8px rgba(46,230,246,.4); }
        #cgm-achievements .em-info    { display:flex; flex-direction:column; gap:3px; flex:1; min-width:0; }
        #cgm-achievements .em-label   { font-family:'Orbitron',sans-serif; font-weight:700; font-size:10px; letter-spacing:1px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        #cgm-achievements .em-label.reached { color:#2ee6f6; }
        #cgm-achievements .em-label.locked  { color:#3a5060; }
        #cgm-achievements .em-lore    { font-size:10px; color:var(--txt-faint); line-height:1.4; font-style:italic; }
        #cgm-achievements .em-lore.locked   { color:#283040; }
        #cgm-achievements .em-status  { font-family:'Orbitron',sans-serif; font-weight:700; font-size:9px; letter-spacing:1.5px; white-space:nowrap; }
        #cgm-achievements .em-status.reached { color:#2ee6f6; }
        #cgm-achievements .em-status.locked  { color:#3a5060; }
        #cgm-achievements .em-bar-wrap { height:3px; border-radius:2px; background:rgba(46,230,246,.12); margin-top:6px; overflow:hidden; }
        #cgm-achievements .em-bar     { height:100%; border-radius:2px; background:linear-gradient(90deg,#0ff,#2ee6f6); transition:width .5s; }

        /* ── Chaos Laws Preview ── */
        #cgm-achievements .cl-section  { display:flex; flex-direction:column; gap:10px; }
        #cgm-achievements .cl-header   { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; }
        #cgm-achievements .cl-title    { font-family:'Orbitron',sans-serif; font-weight:800; font-size:14px; letter-spacing:3px; color:#ef4444; text-shadow:0 0 8px rgba(239,68,68,.55),0 0 22px rgba(239,68,68,.22); display:flex; align-items:center; gap:10px; }
        #cgm-achievements .cl-subtitle { font-family:'Orbitron',sans-serif; font-weight:700; font-size:10px; letter-spacing:2px; padding:5px 14px; border-radius:999px; border:1px solid rgba(239,68,68,.35); background:rgba(239,68,68,.07); color:#ef4444; }
        #cgm-achievements .cl-locked-banner { border-radius:10px; border:1px solid rgba(239,68,68,.22); background:rgba(10,4,4,.7); padding:14px 18px; text-align:center; }
        #cgm-achievements .cl-locked-banner .cl-lock-icon { font-size:22px; margin-bottom:6px; }
        #cgm-achievements .cl-locked-banner .cl-lock-msg  { font-family:'Orbitron',sans-serif; font-weight:700; font-size:11px; color:#6b2020; letter-spacing:2px; }
        #cgm-achievements .cl-locked-banner .cl-lock-req  { font-size:10px; color:#4a2020; margin-top:4px; font-style:italic; }
        #cgm-achievements .cl-grid     { display:grid; grid-template-columns:repeat(auto-fill,minmax(270px,1fr)); gap:10px; }
        #cgm-achievements .cl-card     { border-radius:10px; border:1px solid rgba(239,68,68,.2); background:rgba(10,4,4,.65); padding:13px 15px; display:flex; flex-direction:column; gap:6px; }
        #cgm-achievements .cl-card.detected { border-color:rgba(239,68,68,.5); background:rgba(14,2,2,.8); }
        #cgm-achievements .cl-card.locked   { border-color:rgba(46,40,40,.35); background:rgba(6,4,4,.5); filter:blur(.4px); }
        #cgm-achievements .cl-card-top { display:flex; align-items:center; justify-content:space-between; gap:8px; }
        #cgm-achievements .cl-name     { font-family:'Orbitron',sans-serif; font-weight:800; font-size:11px; letter-spacing:1px; }
        #cgm-achievements .cl-badge    { font-family:'Orbitron',sans-serif; font-weight:700; font-size:8px; letter-spacing:1.5px; padding:3px 8px; border-radius:6px; white-space:nowrap; }
        #cgm-achievements .cl-badge.detected { color:#ef4444; border:1px solid rgba(239,68,68,.5); background:rgba(239,68,68,.08); }
        #cgm-achievements .cl-badge.active   { color:#ff6b6b; border:1px solid rgba(239,68,68,.85); background:rgba(239,68,68,.18); text-shadow:0 0 6px rgba(239,68,68,.45); }
        #cgm-achievements .cl-badge.locked   { color:#4a2020; border:1px solid rgba(70,20,20,.35); background:rgba(20,4,4,.4); }
        #cgm-achievements .cl-desc     { font-size:10px; color:var(--txt-dim); line-height:1.45; }
        #cgm-achievements .cl-future   { font-size:9px; color:#6b2020; line-height:1.4; font-style:italic; border-top:1px solid rgba(239,68,68,.12); padding-top:5px; margin-top:2px; }
        #cgm-achievements .cl-future.detected { color:#a84040; }

        /* ── System Logs / Lore Archive ── */
        #cgm-achievements .sl-section  { display:flex; flex-direction:column; gap:10px; }
        #cgm-achievements .sl-header   { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; }
        #cgm-achievements .sl-title    { font-family:'Orbitron',sans-serif; font-weight:800; font-size:14px; letter-spacing:3px; color:#38bdf8; text-shadow:0 0 8px rgba(56,189,248,.55),0 0 22px rgba(56,189,248,.22); display:flex; align-items:center; gap:10px; }
        #cgm-achievements .sl-subtitle { font-family:'Orbitron',sans-serif; font-weight:700; font-size:9px; letter-spacing:2px; color:#0e7490; }
        #cgm-achievements .sl-mem      { font-family:'Orbitron',sans-serif; font-weight:700; font-size:11px; color:#38bdf8; padding:4px 12px; border-radius:999px; border:1px solid rgba(56,189,248,.3); background:rgba(56,189,248,.06); }
        #cgm-achievements .sl-list     { display:flex; flex-direction:column; gap:8px; }
        #cgm-achievements .sl-row      { border-radius:10px; border:1px solid rgba(30,50,70,.35); background:rgba(4,10,24,.6); padding:11px 14px; display:flex; align-items:flex-start; gap:12px; }
        #cgm-achievements .sl-row.readable { border-color:rgba(56,189,248,.4); background:rgba(2,14,28,.75); }
        #cgm-achievements .sl-num      { font-family:'Orbitron',sans-serif; font-weight:800; font-size:10px; min-width:44px; text-align:center; padding:4px 6px; border-radius:6px; flex-shrink:0; border:1px solid rgba(255,255,255,.07); background:rgba(0,0,0,.4); color:#1e3a4a; }
        #cgm-achievements .sl-num.readable { color:#38bdf8; border-color:rgba(56,189,248,.4); box-shadow:0 0 7px rgba(56,189,248,.35); }
        #cgm-achievements .sl-info     { display:flex; flex-direction:column; gap:4px; flex:1; min-width:0; }
        #cgm-achievements .sl-title-text       { font-family:'Orbitron',sans-serif; font-weight:700; font-size:10px; letter-spacing:1px; color:#38bdf8; }
        #cgm-achievements .sl-title-text.locked { color:#1e3a4a; }
        #cgm-achievements .sl-text     { font-size:10px; color:var(--txt-faint); line-height:1.5; font-style:italic; }
        #cgm-achievements .sl-text.locked { color:#162030; font-style:normal; }
        #cgm-achievements .sl-status   { font-family:'Orbitron',sans-serif; font-weight:700; font-size:9px; letter-spacing:1.5px; white-space:nowrap; flex-shrink:0; }
        #cgm-achievements .sl-status.readable { color:#38bdf8; }
        #cgm-achievements .sl-status.locked   { color:#1e3a4a; }
      `;
      document.head.appendChild(style);
    }

    const el = document.createElement('div');
    el.id = 'cgm-achievements';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Achievements');

    el.innerHTML = `
      <div class="ca-stage">
        <span class="corner tl"></span><span class="corner tr"></span>
        <span class="corner bl"></span><span class="corner br"></span>

        <div class="ca-header">
          <div class="ca-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
            ACHIEVEMENTS
          </div>
          <div class="ca-badges">
            <div class="ca-badge">★ <span id="ca-earned">0</span>&nbsp;/&nbsp;<span id="ca-total">0</span>&nbsp;UNLOCKED</div>
            <div class="ca-pf">🧩 <span id="ca-pf-earned">0</span>&nbsp;/&nbsp;<span id="ca-pf-total">0</span>&nbsp;FRAGMENTS</div>
          </div>
        </div>
        <div class="ca-progress">
          <div class="ca-bar-wrap"><div class="ca-bar" id="ca-bar" style="width:0%"></div></div>
        </div>
        <div class="ca-sep"></div>

        <div class="ca-grid" id="ca-grid"></div>

        <div class="ca-sep"></div>

        <div class="ce-section" id="ce-section">
          <div class="ce-header">
            <div class="ce-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18" aria-hidden="true">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
              </svg>
              BOSS ECHO ARCHIVE
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
              <div class="ce-count" id="ce-count">0 / 6 ARCHIVED</div>
              <div class="ce-memory" id="ce-memory">EDEN MEMORY: 0%</div>
            </div>
          </div>
          <div class="ce-grid" id="ce-grid"></div>
        </div>

        <div class="ca-sep"></div>

        <div class="em-section" id="em-section">
          <div class="em-header">
            <div class="em-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18" aria-hidden="true">
                <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
              </svg>
              EDEN MEMORY MILESTONES
            </div>
            <div class="em-pct" id="em-pct">MEMORY: 0%</div>
          </div>
          <div class="em-bar-wrap"><div class="em-bar" id="em-bar" style="width:0%"></div></div>
          <div class="em-list" id="em-list"></div>
        </div>

        <div class="ca-sep"></div>

        <div class="sl-section" id="sl-section">
          <div class="sl-header">
            <div class="sl-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
              SYSTEM LOGS
            </div>
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
              <div class="sl-subtitle">FRAGMENTS OF NULL EDEN</div>
              <div class="sl-mem" id="sl-mem">EDEN MEMORY: 0%</div>
            </div>
          </div>
          <div class="sl-list" id="sl-list"></div>
        </div>

        <div class="ca-sep"></div>

        <div class="cl-section" id="cl-section">
          <div class="cl-header">
            <div class="cl-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18" aria-hidden="true">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
              </svg>
              CHAOS LAWS
            </div>
            <div class="cl-subtitle" id="cl-subtitle">PREVIEW LOCKED</div>
          </div>
          <div id="cl-body"></div>
        </div>

        <div class="ca-sep"></div>
        <div class="ca-footer">
          <button class="ca-foot-btn" id="ca-back-btn">◀ BACK</button>
          <div class="ca-hints">
            <span><b>ESC</b> Back to menu</span>
            <span>Complete Endless runs to unlock</span>
          </div>
        </div>
      </div>
    `;

    el.querySelector('#ca-back-btn')?.addEventListener('click', () => this.goToMainMenu());
    document.body.appendChild(el);
    this._achievementsOverlayEl = el;
  }

  _showAchievementsOverlay() {
    if (!this._achievementsOverlayEl) return;
    this._achievementsOverlayEl.style.display = 'flex';
    this._achievementsOverlayVisible = true;
    this._syncAchievementsOverlay();
  }

  _hideAchievementsOverlay() {
    if (!this._achievementsOverlayEl) return;
    this._achievementsOverlayEl.style.display = 'none';
    this._achievementsOverlayVisible = false;
  }

  _syncAchievementsOverlay() {
    const el = this._achievementsOverlayEl;
    if (!el) return;
    const total  = ENDLESS_ACHIEVEMENTS.length;
    const earned = ENDLESS_ACHIEVEMENTS.reduce((n, a) => n + (this.meta.achievements[a.id] ? 1 : 0), 0);
    const pct    = total > 0 ? Math.round((earned / total) * 100) : 0;

    const earnedEl = el.querySelector('#ca-earned'); if (earnedEl) earnedEl.textContent = earned;
    const totalEl  = el.querySelector('#ca-total');  if (totalEl)  totalEl.textContent  = total;
    const barEl    = el.querySelector('#ca-bar');    if (barEl)    barEl.style.width    = pct + '%';
    const pfEarnedEl = el.querySelector('#ca-pf-earned');
    if (pfEarnedEl) pfEarnedEl.textContent = this.meta.getProtocolFragmentsEarned();
    const pfTotalEl  = el.querySelector('#ca-pf-total');
    if (pfTotalEl)  pfTotalEl.textContent  = PF_TOTAL_OBTAINABLE;

    // Sync Boss Echo Archive
    const ceCount  = el.querySelector('#ce-count');
    const ceMemory = el.querySelector('#ce-memory');
    const ceGrid   = el.querySelector('#ce-grid');
    if (ceCount && ceMemory && ceGrid) {
      const archivedN = BOSS_ECHOES.filter(e => this.meta.hasBossEcho(e.id)).length;
      ceCount.textContent  = 'PASSIVES ACTIVE: ' + archivedN + ' / ' + BOSS_ECHOES.length;
      ceMemory.textContent = 'EDEN MEMORY: ' + Math.round(this.meta.getEdenMemory()) + '%';
      ceGrid.innerHTML = BOSS_ECHOES.map(echo => {
        const archived   = this.meta.hasBossEcho(echo.id);
        const cardCls    = archived ? 'ce-card archived' : 'ce-card';
        const iconCls    = archived ? 'ce-icon archived' : 'ce-icon';
        const nameCls    = archived ? 'ce-name' : 'ce-name locked';
        const loreCls    = archived ? 'ce-lore' : 'ce-lore locked';
        const statCls    = archived ? 'ce-status archived' : 'ce-status locked';
        const passiveCls = archived ? 'ce-passive archived' : 'ce-passive locked';
        const iconStyle  = archived ? `color:${echo.color}` : 'color:#3a5060';
        const nameStyle  = archived ? `color:${echo.color}` : '';
        return `<div class="${cardCls}">
          <div class="${iconCls}" style="${iconStyle}">⬡</div>
          <div class="ce-info">
            <div class="${nameCls}" style="${nameStyle}">${archived ? echo.name : '??? ECHO LOCKED'}</div>
            <div class="${loreCls}">${archived ? echo.lore : 'Kill this boss in Endless to archive.'}</div>
            <div class="${passiveCls}">Passive: ${archived ? echo.passive : '???'}</div>
          </div>
          <div class="${statCls}">${archived ? '✓ ARCHIVED' : '✕ LOCKED'}</div>
        </div>`;
      }).join('');
    }

    // Sync Eden Memory Milestones
    const emPct  = el.querySelector('#em-pct');
    const emBar  = el.querySelector('#em-bar');
    const emList = el.querySelector('#em-list');
    if (emPct && emBar && emList && this.meta) {
      const mem = Math.round(this.meta.getEdenMemory());
      emPct.textContent  = 'MEMORY: ' + mem + '%';
      emBar.style.width  = mem + '%';
      // Check and fire milestones once each
      for (const ms of EDEN_MILESTONES) {
        if (this.meta.checkAndRecordMilestone(ms.pct)) {
          this._queueEdenTransmission('EDEN MEMORY ' + ms.pct + '%: ' + ms.label, { priority: 2, duration: 6 });
          this.meta.addSystemMessage('EDEN MEMORY ' + ms.pct + '%: ' + ms.label);
        }
      }
      emList.innerHTML = EDEN_MILESTONES.map(ms => {
        const reached  = this.meta.hasMilestone(ms.pct);
        const rowCls   = reached ? 'em-row reached' : 'em-row';
        const badgeCls = reached ? 'em-badge reached' : 'em-badge';
        const labCls   = reached ? 'em-label reached' : 'em-label locked';
        const lorCls   = reached ? 'em-lore' : 'em-lore locked';
        const statCls  = reached ? 'em-status reached' : 'em-status locked';
        return `<div class="${rowCls}">
          <div class="${badgeCls}">${ms.pct}%</div>
          <div class="em-info">
            <div class="${labCls}">${reached ? ms.label : '??? MILESTONE LOCKED'}</div>
            <div class="${lorCls}">${reached ? ms.lore : 'Accumulate EDEN MEMORY to unlock.'}</div>
          </div>
          <div class="${statCls}">${reached ? '✓ REACHED' : '✕ LOCKED'}</div>
        </div>`;
      }).join('');
    }

    // Sync Chaos Laws preview
    const clSubtitle = el.querySelector('#cl-subtitle');
    const clBody     = el.querySelector('#cl-body');
    if (clSubtitle && clBody && this.meta) {
      const mem = this.meta.getEdenMemory();
      const detected = mem >= 50;
      if (detected) {
        clSubtitle.textContent = 'ENDGAME PROTOCOLS DETECTED';
        clSubtitle.style.color = '#ef4444';
        clBody.innerHTML = `<div class="cl-grid">${CHAOS_LAWS.map(law => {
          const _bgAct = law.id === 'blood_grid';
          return `<div class="cl-card detected" style="${_bgAct ? 'border-color:rgba(239,68,68,.75);background:rgba(20,4,4,.92);box-shadow:0 0 10px rgba(239,68,68,.12);' : ''}">
            <div class="cl-card-top">
              <div class="cl-name" style="color:${law.color}${_bgAct ? ';text-shadow:0 0 8px ' + law.color + '55' : ''}">${law.name}</div>
              <div class="cl-badge ${_bgAct ? 'active' : 'detected'}">${_bgAct ? '✦ ONLINE' : '⚡ DETECTED'}</div>
            </div>
            <div class="cl-desc">${law.desc}</div>
            ${_bgAct
              ? `<div class="cl-future" style="color:#ef8888;font-style:normal;border-top:1px solid rgba(239,68,68,.18);padding-top:5px;margin-top:2px;">Enemy speed +7% · Score +10% — <span style="color:#ef4444;font-weight:700">ACTIVE</span></div>`
              : `<div class="cl-future detected">${law.future} <span style="color:#ef4444;font-style:normal">— PREVIEW ONLY · NOT ACTIVE</span></div>`
            }
          </div>`;
        }).join('')}</div>`;
      } else {
        clSubtitle.textContent = 'PREVIEW LOCKED BY EDEN MEMORY';
        clSubtitle.style.color = '#6b2020';
        clBody.innerHTML = `
          <div class="cl-locked-banner">
            <div class="cl-lock-icon">🔒</div>
            <div class="cl-lock-msg">CHAOS LAWS ENCRYPTED</div>
            <div class="cl-lock-req">Requires EDEN MEMORY 50% — currently ${Math.round(mem)}%</div>
          </div>
          <div class="cl-grid" style="opacity:.35;pointer-events:none">${CHAOS_LAWS.map(law => `
            <div class="cl-card locked">
              <div class="cl-card-top">
                <div class="cl-name" style="color:#4a2020">??? LAW</div>
                <div class="cl-badge locked">✕ LOCKED</div>
              </div>
              <div class="cl-desc" style="color:#3a2020">ENCRYPTED DATA</div>
            </div>`).join('')}</div>`;
      }
    }

    // Sync System Logs / Lore Archive
    const slMem  = el.querySelector('#sl-mem');
    const slList = el.querySelector('#sl-list');
    if (slMem && slList && this.meta) {
      const mem = Math.round(this.meta.getEdenMemory());
      slMem.textContent = 'EDEN MEMORY: ' + mem + '%';
      // Fire one-time EDEN CORE feed message when each log first becomes readable
      for (const log of SYSTEM_LOGS) {
        if (this.meta.checkAndRecordSystemLog(log.threshold)) {
          try {
            const msg = log.threshold === 0
              ? 'SYSTEM LOG 01 INDEXED. EDEN ARCHIVE INITIALIZED.'
              : log.threshold === 100
                ? 'TRUE NULL EDEN SIGNAL INDEXED. FULL ARCHIVE RESTORED.'
                : 'SYSTEM LOG ' + log.num + ' READABLE. HIDDEN EDEN MEMORY FRAGMENT UNSEALED.';
            this._queueEdenTransmission(msg, { priority: 1, duration: 5 });
          } catch (_) {}
        }
      }
      slList.innerHTML = SYSTEM_LOGS.map(log => {
        const readable = mem >= log.threshold;
        const rowCls  = readable ? 'sl-row readable' : 'sl-row';
        const numCls  = readable ? 'sl-num readable' : 'sl-num';
        const titCls  = readable ? 'sl-title-text'  : 'sl-title-text locked';
        const txtCls  = readable ? 'sl-text'        : 'sl-text locked';
        const staCls  = readable ? 'sl-status readable' : 'sl-status locked';
        const reqTxt  = log.threshold === 0 ? 'Always available.' : 'Requires EDEN MEMORY ' + log.threshold + '%.';
        return `<div class="${rowCls}">
          <div class="${numCls}">LOG<br>${log.num}</div>
          <div class="sl-info">
            <div class="${titCls}">${readable ? log.title : '??? MEMORY FRAGMENT LOCKED'}</div>
            <div class="${txtCls}">${readable ? log.text : reqTxt}</div>
          </div>
          <div class="${staCls}">${readable ? '◉ READABLE' : '✕ LOCKED'}</div>
        </div>`;
      }).join('');
    }

    const grid = el.querySelector('#ca-grid');
    if (!grid) return;
    grid.innerHTML = ENDLESS_ACHIEVEMENTS.map(a => {
      const got      = !!this.meta.achievements[a.id];
      const cardCls  = got ? 'ca-card unlocked' : 'ca-card';
      const nameCls  = got ? 'ca-card-name'     : 'ca-card-name locked';
      const goalCls  = got ? 'ca-card-goal'     : 'ca-card-goal locked';
      const statuCls = got ? 'ca-status unlocked' : 'ca-status locked';
      const statuLbl = got ? '★ UNLOCKED' : '🔒 LOCKED';
      const protoVal = got
        ? `<span class="ca-reward-val">${a.protocolName} — ${a.protocolEffect}</span>`
        : `<span class="ca-reward-val hidden">???</span>`;
      const cardVal  = got
        ? `<span class="ca-reward-val">${a.cardName} — ${a.cardEffect}</span>`
        : `<span class="ca-reward-val hidden">???</span>`;
      return `<div class="${cardCls}">
        <div class="ca-card-top">
          <div>
            <div class="${nameCls}">${got ? a.name : '???'}</div>
            <div class="ca-tag">ENDLESS ONLY</div>
          </div>
          <div class="${statuCls}">${statuLbl}</div>
        </div>
        <div class="${goalCls}">${a.desc}</div>
        <div class="ca-rewards">
          <div class="ca-reward-line"><span class="ca-reward-label proto">PROTOCOL</span>${protoVal}</div>
          <div class="ca-reward-line"><span class="ca-reward-label card">CARD</span>${cardVal}</div>
        </div>
      </div>`;
    }).join('');
  }

  _initRelicsOverlay() {
    if (this._relicsOverlayEl) return;

    if (!document.getElementById('cgm-rel-style')) {
      const style = document.createElement('style');
      style.id = 'cgm-rel-style';
      style.textContent = `
        #cgm-relics {
          position:fixed; inset:0; z-index:140; display:none;
          align-items:flex-start; justify-content:center;
          overflow-y:auto; padding:16px 14px 24px;
          font-family:'Share Tech Mono',ui-monospace,monospace; color:#cfe9ff;
          background:
            radial-gradient(1200px 700px at 50% -10%,rgba(255,120,30,.15),transparent 60%),
            radial-gradient(900px 600px at 12% 30%,rgba(46,230,246,.08),transparent 60%),
            linear-gradient(180deg,#0d0b18,#070a1c);
          --amber:#fbbf24; --cyan:#2ee6f6; --green:#34d399; --orange:#ff9900;
          --txt:#cfe9ff; --txt-dim:#6f86b8; --panel-edge:rgba(255,153,0,.15);
          --glow-amber:0 0 8px rgba(251,191,36,.55),0 0 22px rgba(251,191,36,.22);
          --radius:12px;
        }
        #cgm-relics * { box-sizing:border-box; margin:0; padding:0; }
        #cgm-relics .cr-stage {
          position:relative; z-index:1; width:100%; max-width:1100px;
          border:1px solid var(--panel-edge); border-radius:20px;
          padding:22px 26px 20px;
          background:rgba(10,8,22,.82);
          box-shadow:inset 0 0 60px rgba(255,153,0,.05),0 30px 80px rgba(0,0,0,.55);
          display:flex; flex-direction:column; align-items:stretch; gap:14px;
        }
        #cgm-relics .cr-header { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; }
        #cgm-relics .cr-title  { font-family:'Orbitron',sans-serif; font-weight:800; font-size:16px; letter-spacing:3px; color:var(--amber); text-shadow:var(--glow-amber); }
        #cgm-relics .cr-pf     { padding:6px 14px; border-radius:999px; border:1px solid rgba(46,230,246,.25); background:rgba(46,230,246,.05); font-family:'Orbitron',sans-serif; font-weight:700; font-size:12px; color:var(--cyan); }
        #cgm-relics .cr-sep    { width:100%; height:1px; background:linear-gradient(90deg,transparent,var(--amber),transparent); opacity:.3; }
        #cgm-relics .cr-tabs   { display:flex; gap:8px; flex-wrap:wrap; }
        #cgm-relics .cr-tab    { padding:7px 18px; border-radius:8px; cursor:pointer; border:1px solid rgba(255,153,0,.2); background:rgba(10,8,22,.5); color:var(--txt-dim); font-family:'Orbitron',sans-serif; font-size:11px; letter-spacing:1px; font-weight:700; transition:.15s; }
        #cgm-relics .cr-tab.active, #cgm-relics .cr-tab:hover { border-color:var(--amber); color:var(--amber); background:rgba(255,153,0,.07); }
        #cgm-relics .cr-grid   { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:14px; }
        #cgm-relics .cr-card   { position:relative; border-radius:var(--radius); border:1px solid rgba(46,90,100,.25); background:rgba(10,16,46,.55); padding:14px; display:flex; flex-direction:column; gap:8px; }
        #cgm-relics .cr-card.owned  { border-color:rgba(52,211,153,.5); background:rgba(0,14,10,.6); }
        #cgm-relics .cr-card.locked { opacity:.65; }
        #cgm-relics .cr-card-top  { display:flex; align-items:flex-start; justify-content:space-between; gap:8px; }
        #cgm-relics .cr-card-name { font-family:'Orbitron',sans-serif; font-weight:700; font-size:12px; color:#dff0ff; }
        #cgm-relics .cr-card-type { font-size:9px; letter-spacing:2px; text-transform:uppercase; color:var(--txt-dim); margin-top:2px; }
        #cgm-relics .cr-card-fx   { font-size:11px; color:#8aa0c0; line-height:1.45; }
        #cgm-relics .cr-card-req  { font-size:10px; color:#a855f7; }
        #cgm-relics .cr-card-foot { display:flex; align-items:center; justify-content:space-between; margin-top:4px; }
        #cgm-relics .cr-cost      { font-family:'Orbitron',sans-serif; font-weight:700; font-size:11px; color:var(--cyan); }
        #cgm-relics .cr-badge     { font-family:'Orbitron',sans-serif; font-weight:700; font-size:10px; letter-spacing:1px; padding:4px 10px; border-radius:6px; }
        #cgm-relics .cr-badge.owned   { background:rgba(52,211,153,.15); color:#34d399; border:1px solid rgba(52,211,153,.35); }
        #cgm-relics .cr-badge.req     { background:rgba(168,85,247,.1); color:#a855f7; border:1px solid rgba(168,85,247,.3); }
        #cgm-relics .cr-badge.poor    { background:rgba(255,100,30,.08); color:#f87171; border:1px solid rgba(248,113,113,.3); }
        #cgm-relics .cr-badge.buy-btn { background:rgba(251,191,36,.1); color:var(--amber); border:1px solid rgba(251,191,36,.35); cursor:pointer; }
        #cgm-relics .cr-badge.buy-btn:hover { background:rgba(251,191,36,.2); }
        #cgm-relics .cr-footer { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; }
        #cgm-relics .cr-foot-btn { padding:11px 26px; border-radius:10px; cursor:pointer; border:1px solid rgba(111,134,184,.22); background:rgba(10,16,46,.3); color:var(--txt-dim); font-family:'Orbitron',sans-serif; font-weight:700; font-size:12px; letter-spacing:2px; transition:.15s; }
        #cgm-relics .cr-foot-btn:hover { border-color:var(--txt-dim); color:var(--txt); }
        #cgm-relics .cr-hint { color:var(--txt-dim); font-size:11px; letter-spacing:1px; }
      `;
      document.head.appendChild(style);
    }

    const el = document.createElement('div');
    el.id = 'cgm-relics';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Relics');
    el.innerHTML = `
      <div class="cr-stage">
        <div class="cr-header">
          <div class="cr-title">⬡ NULL RELICS</div>
          <div class="cr-pf">🧩 <span id="cr-pf">0</span> FRAGMENTS</div>
        </div>
        <div class="cr-sep"></div>
        <div class="cr-tabs">
          <div class="cr-tab active" data-tab="all">ALL</div>
          <div class="cr-tab" data-tab="universal">UNIVERSAL</div>
          <div class="cr-tab" data-tab="boss">BOSS</div>
          <div class="cr-tab" data-tab="character">CHARACTER</div>
          <div class="cr-tab" data-tab="arena">ARENA</div>
        </div>
        <div class="cr-grid" id="cr-grid"></div>
        <div class="cr-sep"></div>
        <div class="cr-footer">
          <button class="cr-foot-btn" id="cr-back-btn">◀ BACK</button>
          <div class="cr-hint">Unlock relics by spending Protocol Fragments — active each run automatically.</div>
        </div>
      </div>
    `;

    el.querySelectorAll('.cr-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        el.querySelectorAll('.cr-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this._relicsFilter = tab.dataset.tab;
        this._syncRelicsOverlay();
      });
    });
    el.querySelector('#cr-back-btn')?.addEventListener('click', () => this.goToMainMenu());
    document.body.appendChild(el);
    this._relicsOverlayEl = el;
    this._relicsFilter = 'all';
  }

  _showRelicsOverlay() {
    if (!this._relicsOverlayEl) return;
    this._relicsOverlayEl.style.display = 'flex';
    this._relicsOverlayVisible = true;
    this._syncRelicsOverlay();
  }

  _hideRelicsOverlay() {
    if (!this._relicsOverlayEl) return;
    this._relicsOverlayEl.style.display = 'none';
    this._relicsOverlayVisible = false;
  }

  _syncRelicsOverlay() {
    const el = this._relicsOverlayEl;
    if (!el) return;

    const pfEl = el.querySelector('#cr-pf');
    if (pfEl) pfEl.textContent = this.meta.protocolFragments;

    const filter = this._relicsFilter || 'all';
    const defs   = filter === 'all' ? RELIC_DEFS : RELIC_DEFS.filter(r => r.type === filter);

    const grid = el.querySelector('#cr-grid');
    if (!grid) return;

    grid.innerHTML = defs.map(r => {
      const owned   = this.meta.isRelicUnlocked(r.id);
      const hasReq  = !r.req || this.meta.hasBossKill(r.req);
      const canAfford = this.meta.protocolFragments >= r.cost;
      const cardCls = owned ? 'cr-card owned' : (hasReq ? 'cr-card' : 'cr-card locked');

      let badgeHtml;
      if (owned) {
        badgeHtml = `<span class="cr-badge owned">✓ OWNED</span>`;
      } else if (!hasReq) {
        const reqName = r.req ? r.req.replace(/_/g,' ').toUpperCase() : '';
        badgeHtml = `<span class="cr-badge req">REQ: DEFEAT ${reqName}</span>`;
      } else if (!canAfford) {
        badgeHtml = `<span class="cr-badge poor">NEED ${r.cost}🧩</span>`;
      } else {
        badgeHtml = `<span class="cr-badge buy-btn" data-relic-id="${r.id}">BUY ${r.cost}🧩</span>`;
      }

      const typeLabel = r.type.toUpperCase();
      const reqLine   = r.reqChar ? `<div class="cr-card-req">Character: ${r.reqChar.replace(/_/g,' ')}</div>` : '';

      return `<div class="${cardCls}">
        <div class="cr-card-top">
          <div>
            <div class="cr-card-name">${r.name}</div>
            <div class="cr-card-type">${typeLabel}</div>
          </div>
        </div>
        <div class="cr-card-fx">${r.effect}</div>
        ${reqLine}
        <div class="cr-card-foot">
          <span class="cr-cost">${owned ? '' : r.cost + ' 🧩'}</span>
          ${badgeHtml}
        </div>
      </div>`;
    }).join('');

    // Wire buy buttons
    grid.querySelectorAll('.buy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const result = this.meta.tryUnlockRelic(btn.dataset.relicId);
        if (result === 'ok') this._syncRelicsOverlay();
      });
    });
  }

  _drawRelicsScreen(ctx) {
    if (this._relicsOverlayVisible) return;   // DOM overlay takes over
  }

    _drawUpgradesScreen(ctx) {
    if (this._upgradesOverlayVisible) return;   // DOM overlay takes over
    this._drawBackground(ctx);
    ctx.fillStyle = 'rgba(0,0,0,0.82)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Title
    ctx.font      = 'bold 40px Consolas, monospace';
    ctx.fillStyle = CYAN;
    ctx.textAlign = 'center';
    ctx.fillText('GRID UPGRADES', WIDTH / 2, 52);

    // Credits
    ctx.font      = '20px Consolas, monospace';
    ctx.fillStyle = YELLOW;
    ctx.fillText(`Grid Credits: ${this.meta.credits}`, WIDTH / 2, 82);
    // Protocol Fragments — separate rare Endless currency (display only here; spent in Character Select)
    if (this._upgradeTab !== 'protocols') {
      ctx.font      = 'bold 15px "Segoe UI Emoji", Consolas, monospace';
      ctx.fillStyle = '#7df9ff';
      ctx.fillText(`🧩 Fragments: ${this.meta.getProtocolFragmentsEarned()} / ${PF_TOTAL_OBTAINABLE}`, WIDTH / 2, 104);
    }

    const { rects, backRect, resetRect, coreTab, synTab, protoTab } = this._upgradeRects();

    // PROTOCOLS tab header: show spendable PF + lifetime-earned progress (no regression on spend).
    if (this._upgradeTab === 'protocols') {
      ctx.font      = 'bold 15px "Segoe UI Emoji", Consolas, monospace';
      ctx.fillStyle = '#7df9ff';
      ctx.textAlign = 'center';
      ctx.fillText(`🧩 Available: ${this.meta.getProtocolFragments()}     Earned: ${this.meta.getProtocolFragmentsEarned()} / ${PF_TOTAL_OBTAINABLE}`, WIDTH / 2, 104);
    }

    // Tab toggle (CORE upgrades vs SYNERGY 5★ sink vs PROTOCOLS)
    const drawTab = (rect, label, active, accent) => {
      ctx.fillStyle   = active ? '#0a2030' : '#0a1018';
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.strokeStyle = active ? accent : '#2a4060';
      ctx.lineWidth   = active ? 2 : 1;
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
      ctx.font        = 'bold 14px Consolas, monospace';
      ctx.fillStyle   = active ? accent : '#5a7080';
      ctx.textAlign   = 'center';
      ctx.fillText(label, rect.x + rect.w / 2, rect.y + 20);
    };
    drawTab(coreTab,  'CORE UPGRADES',      this._upgradeTab === 'core',      CYAN);
    drawTab(synTab,   '★ WEAPON SYNERGIES', this._upgradeTab === 'synergy',   '#ffd23c');
    drawTab(protoTab, '🧩 PROTOCOLS',       this._upgradeTab === 'protocols', '#b88bff');

    // Upgrade cards (active tab list)
    const list = this._upgradeList();
    for (let i = 0; i < list.length; i++) {
      const upg  = list[i];
      const lvl  = this.meta.getLevel(upg.key);
      const cost = upgradeCost(upg, lvl);
      const maxed = lvl >= upg.maxLevel;
      const can   = !maxed && this.meta.credits >= cost;
      const r     = rects[i];

      if (this._upgradeTab === 'protocols') { this._drawProtocolCard(ctx, upg, r); continue; }
      if (this._upgradeTab === 'synergy') { this._drawSynergyUpgradeCard(ctx, upg, r, lvl, cost, maxed); continue; }

      // Card bg + border
      ctx.fillStyle   = '#0a0f20';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = maxed ? YELLOW : can ? CYAN : '#2a4060';
      ctx.lineWidth   = maxed || can ? 2 : 1;
      ctx.strokeRect(r.x, r.y, r.w, r.h);

      // Name
      ctx.font      = 'bold 16px Consolas, monospace';
      ctx.fillStyle = WHITE;
      ctx.textAlign = 'left';
      ctx.fillText(upg.name, r.x + 12, r.y + 22);

      // Level badge (top-right)
      ctx.font      = '13px Consolas, monospace';
      ctx.fillStyle = maxed ? YELLOW : CYAN;
      ctx.textAlign = 'right';
      ctx.fillText(`${lvl} / ${upg.maxLevel}`, r.x + r.w - 10, r.y + 22);

      // Description
      ctx.font      = '11px Consolas, monospace';
      ctx.fillStyle = '#6a8090';
      ctx.textAlign = 'left';
      ctx.fillText(upg.desc, r.x + 12, r.y + 42);

      // Current effect
      if (lvl > 0) {
        ctx.font      = '11px Consolas, monospace';
        ctx.fillStyle = GREEN;
        ctx.fillText(`Active: ${this._metaEffectText(upg.key, lvl)}`, r.x + 12, r.y + 60);
      }

      // Level dots
      for (let d = 0; d < upg.maxLevel; d++) {
        ctx.fillStyle = d < lvl ? CYAN : '#1a2a3a';
        ctx.beginPath();
        ctx.arc(r.x + 14 + d * 16, r.y + 78, 5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Cost / BUY button area
      const btnY = r.y + 94;
      const btnH = 32;
      if (maxed) {
        ctx.fillStyle   = '#1a2510';
        ctx.fillRect(r.x + 10, btnY, r.w - 20, btnH);
        ctx.font        = 'bold 15px Consolas, monospace';
        ctx.fillStyle   = YELLOW;
        ctx.textAlign   = 'center';
        ctx.fillText('MAX', r.x + r.w / 2, btnY + 21);
      } else {
        ctx.fillStyle   = can ? '#0a2030' : '#120a0a';
        ctx.fillRect(r.x + 10, btnY, r.w - 20, btnH);
        ctx.strokeStyle = can ? CYAN : '#3a2020';
        ctx.lineWidth   = 1;
        ctx.strokeRect(r.x + 10, btnY, r.w - 20, btnH);
        ctx.font        = 'bold 13px Consolas, monospace';
        ctx.fillStyle   = can ? CYAN : '#5a3030';
        ctx.textAlign   = 'center';
        ctx.fillText(`BUY  —  ${cost} Credits`, r.x + r.w / 2, btnY + 21);
      }
    }

    // Back button
    ctx.fillStyle   = '#0a1820';
    ctx.fillRect(backRect.x, backRect.y, backRect.w, backRect.h);
    ctx.strokeStyle = CYAN; ctx.lineWidth = 1;
    ctx.strokeRect(backRect.x, backRect.y, backRect.w, backRect.h);
    ctx.font      = 'bold 14px Consolas, monospace';
    ctx.fillStyle = CYAN;
    ctx.textAlign = 'center';
    ctx.fillText('◀  BACK', backRect.x + backRect.w / 2, backRect.y + 26);

    // Reset button
    const resetColor = this._confirmReset ? RED : '#5a3030';
    ctx.fillStyle   = '#120808';
    ctx.fillRect(resetRect.x, resetRect.y, resetRect.w, resetRect.h);
    ctx.strokeStyle = resetColor; ctx.lineWidth = 1;
    ctx.strokeRect(resetRect.x, resetRect.y, resetRect.w, resetRect.h);
    ctx.font      = 'bold 14px Consolas, monospace';
    ctx.fillStyle = resetColor;
    ctx.textAlign = 'center';
    ctx.fillText('RESET', resetRect.x + resetRect.w / 2, resetRect.y + 26);

    // Message
    if (this._upgradeMsgTimer > 0 && this._upgradeMsg) {
      ctx.font      = '15px Consolas, monospace';
      ctx.fillStyle = ORANGE;
      ctx.textAlign = 'center';
      ctx.fillText(this._upgradeMsg, WIDTH / 2, backRect.y + 62);
    }

    // Hint
    ctx.font      = '13px Consolas, monospace';
    ctx.fillStyle = '#3a5060';
    ctx.textAlign = 'center';
    ctx.fillText('Click an upgrade to purchase  •  ESC = Back to menu', WIDTH / 2, HEIGHT - 16);
    ctx.textAlign = 'left';
  }

  // Premium synergy upgrade card: name + character + ★ strip + flat 1000-Core cost / MAX / LOCKED.
  _drawSynergyUpgradeCard(ctx, upg, r, lvl, cost, maxed) {
    const locked = !!(upg.lockedUntil && !this.meta.isProtocolUnlocked(upg.lockedUntil));
    const accent = locked ? '#5a5a6a' : '#ffd23c';
    const can    = !maxed && !locked && this.meta.credits >= cost;

    // Card bg + premium accent border
    ctx.fillStyle   = '#120e06';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = maxed ? '#7CFF4D' : accent;
    ctx.lineWidth   = locked ? 1 : 2;
    ctx.strokeRect(r.x, r.y, r.w, r.h);

    // SYNERGY tag (top-right)
    ctx.font = 'bold 10px Consolas, monospace';
    ctx.fillStyle = accent; ctx.textAlign = 'right';
    ctx.fillText('★ SYNERGY', r.x + r.w - 10, r.y + 16);

    // Name + character
    ctx.font = 'bold 15px Consolas, monospace';
    ctx.fillStyle = locked ? '#8a8a96' : WHITE; ctx.textAlign = 'left';
    ctx.fillText(upg.name, r.x + 12, r.y + 22);
    ctx.font = '11px Consolas, monospace';
    ctx.fillStyle = locked ? '#5a5a6a' : '#7da0c0';
    ctx.fillText(upg.charName, r.x + 12, r.y + 40);
    ctx.font = '11px Consolas, monospace';
    ctx.fillStyle = '#6a8090';
    ctx.fillText(upg.desc, r.x + 12, r.y + 58);

    // Star strip
    ctx.font = '18px "Segoe UI Symbol", Consolas, monospace';
    ctx.fillStyle = maxed ? '#7CFF4D' : accent;
    ctx.fillText(this._starString(lvl, upg.maxLevel), r.x + 12, r.y + 84);

    // Buy / MAX / LOCKED button
    const btnY = r.y + 94, btnH = 32;
    if (locked) {
      ctx.fillStyle = '#15151c'; ctx.fillRect(r.x + 10, btnY, r.w - 20, btnH);
      ctx.font = 'bold 13px Consolas, monospace'; ctx.fillStyle = '#7a7a88'; ctx.textAlign = 'center';
      ctx.fillText('🔒 LOCKED', r.x + r.w / 2, btnY + 21);
    } else if (maxed) {
      ctx.fillStyle = '#1a2510'; ctx.fillRect(r.x + 10, btnY, r.w - 20, btnH);
      ctx.font = 'bold 15px Consolas, monospace'; ctx.fillStyle = '#7CFF4D'; ctx.textAlign = 'center';
      ctx.fillText('MAX', r.x + r.w / 2, btnY + 21);
    } else {
      ctx.fillStyle   = can ? '#2a2008' : '#1a0a0a';
      ctx.fillRect(r.x + 10, btnY, r.w - 20, btnH);
      ctx.strokeStyle = can ? accent : '#3a2020'; ctx.lineWidth = 1;
      ctx.strokeRect(r.x + 10, btnY, r.w - 20, btnH);
      ctx.font = 'bold 13px Consolas, monospace';
      ctx.fillStyle = can ? accent : '#5a3030'; ctx.textAlign = 'center';
      ctx.fillText(`BUY  —  ${cost} Cores`, r.x + r.w / 2, btnY + 21);
    }
    ctx.textAlign = 'left';
  }

  // ─── Achievements screen (read-only Endless gallery) ─────────────────────────
  // Display only: reads MetaProgress.achievements / ENDLESS_ACHIEVEMENTS. Never unlocks
  // or resets anything, never touches gameplay. Mirrors the UPGRADES screen pattern.
  _achievementsBackRect() {
    return { x: Math.round(WIDTH / 2 - 80), y: HEIGHT - 70, w: 160, h: 40 };
  }

  _updateAchievementsScreen(input) {
    if (input.keys.has('escape')) {
      this.goToMainMenu();
      input.keys.delete('escape');
    }
  }

  handleAchievementsClick(mousePos) {
    if (this._inRect(mousePos, this._achievementsBackRect())) this.goToMainMenu();
  }

  _drawAchievementsScreen(ctx) {
    if (this._achievementsOverlayVisible) return;   // DOM overlay takes over
    this._drawBackground(ctx);
    ctx.fillStyle = 'rgba(0,0,0,0.82)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Title
    ctx.font      = 'bold 40px Consolas, monospace';
    ctx.fillStyle = CYAN;
    ctx.textAlign = 'center';
    ctx.fillText('ACHIEVEMENTS', WIDTH / 2, 52);

    // Progress header — X / N UNLOCKED
    const total  = ENDLESS_ACHIEVEMENTS.length;
    const earned = ENDLESS_ACHIEVEMENTS.reduce((n, a) => n + (this.meta.achievements[a.id] ? 1 : 0), 0);
    ctx.font      = 'bold 20px Consolas, monospace';
    ctx.fillStyle = YELLOW;
    ctx.fillText(`${earned} / ${total} UNLOCKED`, WIDTH / 2, 82);
    // Protocol Fragments — moved here from the Main Menu (where it cluttered the top-right). PF is a
    // separate rare Endless currency from Grid Credits; this is display-only (earning/spend unchanged).
    ctx.font      = 'bold 14px "Segoe UI Emoji", Consolas, monospace';
    ctx.fillStyle = '#7df9ff';
    ctx.fillText(`🧩 Fragments: ${this.meta.getProtocolFragmentsEarned()} / ${PF_TOTAL_OBTAINABLE}`, WIDTH / 2, 104);

    // Rows — taller to surface each achievement's Achievement Protocol (passive) + Achievement
    // Card reward. Reward lines read from the ENDLESS_ACHIEVEMENTS metadata; locked rows hide the
    // names (??? ) to stay clean. All rewards are Endless-only.
    // Two-column layout so the full list stays readable as it grows past ~8 entries.
    const colW = 600, colGap = 24, rowH = 72, gap = 6, listW = colW;
    const rowsPerCol = Math.ceil(total / 2);
    const blockW = colW * 2 + colGap;
    const x0base = Math.round((WIDTH - blockW) / 2), y0 = 96;
    for (let i = 0; i < total; i++) {
      const a   = ENDLESS_ACHIEVEMENTS[i];
      const got = !!this.meta.achievements[a.id];
      const col = Math.floor(i / rowsPerCol);
      const x0  = x0base + col * (colW + colGap);
      const ry  = y0 + (i - col * rowsPerCol) * (rowH + gap);

      // Row background + border
      ctx.fillStyle   = got ? '#0c1410' : '#0a0f20';
      ctx.fillRect(x0, ry, listW, rowH);
      ctx.strokeStyle = got ? GREEN : '#2a4060';
      ctx.lineWidth   = got ? 2 : 1;
      ctx.strokeRect(x0, ry, listW, rowH);

      // Name + goal
      ctx.font      = 'bold 16px Consolas, monospace';
      ctx.fillStyle = got ? WHITE : '#6a8090';
      ctx.textAlign = 'left';
      ctx.fillText(a.name, x0 + 16, ry + 20);
      ctx.font      = '11px Consolas, monospace';
      ctx.fillStyle = got ? '#7fa8c8' : '#56707f';
      ctx.fillText(a.desc, x0 + 16, ry + 36);

      // Reward lines — Protocol (passive) + Card. Hidden behind ??? while locked.
      ctx.font = '11px Consolas, monospace';
      ctx.fillStyle = got ? '#c8a8ff' : '#4a5a6a';
      ctx.fillText(got ? `Protocol: ${a.protocolName} — ${a.protocolEffect}` : 'Protocol: ???', x0 + 16, ry + 52);
      ctx.fillStyle = got ? '#9fe0c0' : '#4a5a6a';
      ctx.fillText(got ? `Card: ${a.cardName} — ${a.cardEffect}` : 'Card: ???', x0 + 16, ry + 66);

      // Status tag + Endless-only marker (right-aligned)
      ctx.textAlign = 'right';
      ctx.font      = 'bold 14px Consolas, monospace';
      ctx.fillStyle = got ? '#FFD700' : '#5a7080';
      ctx.fillText(got ? '★ UNLOCKED' : '🔒 LOCKED', x0 + listW - 14, ry + 20);
      ctx.font      = '10px Consolas, monospace';
      ctx.fillStyle = '#5a7a8a';
      ctx.fillText('ENDLESS ONLY', x0 + listW - 14, ry + 38);
    }

    // Back button
    const back = this._achievementsBackRect();
    ctx.fillStyle   = '#0a1820';
    ctx.fillRect(back.x, back.y, back.w, back.h);
    ctx.strokeStyle = CYAN; ctx.lineWidth = 1;
    ctx.strokeRect(back.x, back.y, back.w, back.h);
    ctx.font      = 'bold 14px Consolas, monospace';
    ctx.fillStyle = CYAN;
    ctx.textAlign = 'center';
    ctx.fillText('◀  BACK', back.x + back.w / 2, back.y + 26);

    // Hint
    ctx.font      = '13px Consolas, monospace';
    ctx.fillStyle = '#3a5060';
    ctx.textAlign = 'center';
    ctx.fillText('ESC = Back to menu', WIDTH / 2, HEIGHT - 16);
    ctx.textAlign = 'left';
  }

  _metaEffectText(key, lvl) {
    switch (key) {
      case 'maxHp':        return `+${lvl * 10} HP`;
      case 'moveSpeed':    return `+${lvl * 5}% speed`;
      case 'coreMagnet':   return `+${Math.round((Math.pow(1.10, lvl) - 1) * 100)}% pickup radius`;
      case 'coreCapacity': return `+${lvl} carry slot${lvl > 1 ? 's' : ''}`;
      case 'pulseDamage':  return `+${lvl} damage`;
      case 'firewall':     return `-${lvl * 5}% overload`;
      case 'combatCalibration': return `+${(lvl * 0.5).toFixed(1)} damage`;
      case 'armorPlating':      return `-${lvl * 3}% contact dmg`;
      case 'manaCapacitor':     return `+${lvl * 10} max mana`;
      case 'xpUplink':          return `+${lvl * 5}% XP`;
      case 'cacheScanner':      return `+${lvl * 5}% cache bonus`;
      default:             return '';
    }
  }

  _createMatrices() {
    // FOUR NEXUS LAYOUT (Phase 1): 4 inset-corner Nexus points, NO centre Nexus, capacity 8
    // each (32 total). Cleaner multi-Nexus identity than the old 5-matrix setup, with a clear
    // central play space. Each starts full (PowerMatrix.stored = capacity), so the early game
    // stays gentle. Gold=+5 / Silver=+3 are core values set in PowerMatrix.stealCore — unchanged.
    const positions = [
      [260,           230],
      [WORLD_W - 260, 230],
      [280,           WORLD_H - 200],
      [WORLD_W - 280, WORLD_H - 200],
    ];
    for (let i = 0; i < positions.length; i++) {
      const [x, y] = positions[i];
      this.matrices.push(new PowerMatrix(new Vec2(x, y), CORE_COLORS[i % CORE_COLORS.length], 8));
    }
  }

  // Endless-only: nudge the 4 Nexus points inward to cleaner, symmetric, more-centered
  // positions (Act 1 keeps the _createMatrices layout). Only pos moves — capacity, core
  // values, deposit and collision radius are all untouched.
  _repositionEndlessNexus() {
    const endlessPositions = [
      [360,           320],            // was [260, 230]
      [WORLD_W - 360, 320],            // was [WORLD_W-260, 230]
      [360,           WORLD_H - 320],  // was [280, WORLD_H-200]
      [WORLD_W - 360, WORLD_H - 320],  // was [WORLD_W-280, WORLD_H-200]
    ];
    for (let i = 0; i < this.matrices.length && i < endlessPositions.length; i++) {
      const [x, y] = endlessPositions[i];
      this.matrices[i].pos.x = x;
      this.matrices[i].pos.y = y;
    }
  }

  // Endless-only boss/miniboss pressure rotation. Reuses the Act 1 minibosses (AI Overload Titan,
  // Matrix Annihilator, Bloodfang Packmaster) and the heavy Security Defector Mech boss, cycling
  // roughly every 2 minutes (first pressure ~25s in) so Endless stays a real boss-chaos survival
  // mode. Gated on this.endless → Act 1 is untouched. Defers when an Acid Rain / Reactor Plasma
  // event is active or about to warn, so the two spectacles never start on the same moment.
  _updateEndlessBossRotation(dt) {
    if (!this.endless) return;
    if (this._nullBreachActive) { this._endlessBossTimer = Math.max(this._endlessBossTimer, 15); return; }
    if (this._bossWarnCd > 0) this._bossWarnCd -= dt;   // age the boss-warning throttle (Endless only)
    this._endlessBossTimer -= dt;
    if (this._endlessBossTimer > 0) return;
    if (this.acidRain || this.acidRainTimer < 8) { this._endlessBossTimer = 8; return; }  // avoid overlap
    const slots = ['titan', 'annihilator', 'bloodfang', 'mech', 'doubleDemon', 'cyberSerpent', 'cyberDragon'];
    this._endlessBossIdx = (this._endlessBossIdx + 1) % slots.length;
    this._endlessRearmBoss(slots[this._endlessBossIdx]);
    // Phase 3: In Chaos Mode rearm a second slot immediately and use shorter cadence
    if (this._chaosMode) {
      const nextIdx = (this._endlessBossIdx + 1) % slots.length;
      this._endlessRearmBoss(slots[nextIdx]);
      this._endlessBossTimer = 90;        // 90s cadence in Chaos (vs 120s normal)
    } else {
      this._endlessBossTimer = 120;       // ~2 min cadence
    }
  }

  // Re-arm one boss slot (only when that boss is dead/absent) by clearing its spawn flag so the
  // existing _update*/_spawn* path brings it back. The Security Defector Mech is a heavy boss-type
  // ENEMY (no mega-boss conversion), so it is spawned directly. No stats/Overload/core changes.
  _endlessRearmBoss(slot) {
    if (slot === 'titan') {
      if (!this.titanBoss || this.titanBoss.hp <= 0) { this.titanSpawned = false; this.titanSpawnTimer = 0; }
    } else if (slot === 'annihilator') {
      if (!this.annihilatorBoss || this.annihilatorBoss.hp <= 0) { this.annihilatorSpawned = false; this.annihilatorSpawnTimer = 0; }
    } else if (slot === 'bloodfang') {
      if (!this.bloodfangBoss || this.bloodfangBoss.hp <= 0) { this.bloodfangSpawned = false; this.bloodfangSpawnTimer = 0; }
    } else if (slot === 'mech') {
      if (this.enemies.length < this.enemyCap() && !this.enemies.some(e => e.enemyType === 'Security Defector Mech')) {
        this.enemies.push(new Enemy('Security Defector Mech', this.currentMinute() + 8));
        this._endlessBossAlert('DEFECTOR MECH BOSS DETECTED', YELLOW);
      }
    } else if (slot === 'doubleDemon') {
      if (!this.doubleDemonsBoss || this.doubleDemonsBoss.hp <= 0) {
        this.doubleDemonsSpawned    = false;
        this.doubleDemonsSpawnTimer = DD_SPAWN_DELAY;
      }
    } else if (slot === 'cyberSerpent') {
      // Rearm Cyber Serpent if dead — 20s spawn delay to avoid immediate overlap
      if (!this.cyberSerpentBoss || this.cyberSerpentBoss.hp <= 0) {
        this.cyberSerpentSpawned    = false;
        this.cyberSerpentSpawnTimer = 20;
      }
    } else if (slot === 'cyberDragon') {
      // Rearm Cyber Dragon if dead — 25s spawn delay
      if (!this.cyberDragonBoss || this.cyberDragonBoss.hp <= 0) {
        this.cyberDragonSpawned    = false;
        this.cyberDragonSpawnTimer = 25;
      }
    }
  }

  currentMinute()             { return Math.floor(this.timeAlive / 60); }
  coreVolatilityMultiplier()  { return 1 + (this.timeAlive / WIN_TIME_SECONDS) * 1.8; }
  overloadRateMultiplier()    { return 1 + Math.floor(this.timeAlive / 120) * 0.05; }
  // Population caps tuned to five pressure tiers so the map is never empty for long:
  //   0–2 light · 2–5 constant · 5–10 mini-hordes · 10–20 continuous · 20+ heavy chaos.
  enemyCap() {
    const m = this.currentMinute();
    let cap;
    if (m < 2)       cap = 28 + m * 8;               // 28 → 36   (light, but always populated)
    else if (m < 5)  cap = 44 + (m - 2) * 12;        // 44 → 80   (constant presence)
    else if (m < 10) cap = 80 + (m - 5) * 14;        // 80 → 150  (visible groups / mini-hordes)
    else if (m < 20) cap = 150 + (m - 10) * 10;      // 150 → 250 (continuous pressure)
    else             cap = Math.min(280, 250 + (m - 20) * 5);  // heavy survivor chaos, perf-capped
    // Endless: much denser from the start (×1.4 + 30), perf-capped a touch higher. Act 1 untouched.
    if (this.endless) cap = Math.min(210, Math.round(cap * 1.15) + 20);
    if (this._chaosMode) cap = Math.min(280, Math.round(cap * 1.3)); // Phase 5: +30% cap
    return cap;
  }
  // Endless spawns roughly twice as fast from the start (lower floor too). Act 1 unchanged.
  enemySpawnInterval() {
    let iv = Math.max(0.16, 0.5 - this.currentMinute() * 0.025);
    if (this.endless) iv = Math.max(0.08, iv * 0.5);
    if (this._chaosMode) iv = Math.max(0.06, iv / 1.5); // Phase 5: 1.5x faster spawn
    return iv * this.mutations.spawnRateMult;   // SWARM PROTOCOL (1.0 outside Endless)
  }

  chooseEnemyType() {
    const t      = this.timeAlive;
    const minute = this.currentMinute();
    let pool;

    // ── Chaos Mode: full late-game enemy pool from minute 0 ─────────────
    if (this._chaosMode) {
      if (!this.megaBoss && !this.enemies.some(e => e.enemyType === 'Rogue AI Overlord'))
        return 'Rogue AI Overlord';
      if (!this.enemies.some(e => e.enemyType === 'Security Defector Mech') && Math.random() < 0.12)
        return 'Security Defector Mech';
      return randomChoice([
        'Overclocked Berserker', 'Overclocked Berserker',
        'Combat Hunter',         'Combat Hunter',
        'Cyber Shooter',         'Cyber Shooter',
        'Heavy Mech',            'Heavy Mech',
        'Cyber-Net Junkie',      'Stealth Infiltrator',
        'Scrap Scavenger',
      ]);
    }

    // 0:00-1:00 — gentle intro: core stealers + first hunters
    if (t < 60)
      pool = ['Scrap Scavenger', 'Scrap Scavenger', 'Combat Hunter', 'Glitch Drone'];

    // 1:00-1:30 — ramp up: first Cyber Shooters appear
    else if (t < 90)
      pool = ['Combat Hunter', 'Cyber Shooter', 'Scrap Scavenger', 'Scrap Scavenger'];

    // 1:30-3:00 — 60% combat hunters/shooters, 40% saboteurs
    else if (t < 180)
      pool = ['Combat Hunter', 'Combat Hunter', 'Cyber Shooter', 'Scrap Scavenger', 'Scrap Scavenger'];

    // 3:00-6:00 — 67% combat, 33% saboteurs
    else if (t < 360)
      pool = ['Combat Hunter', 'Combat Hunter', 'Cyber Shooter', 'Cyber Shooter', 'Scrap Scavenger', 'Cyber-Net Junkie'];

    // 6:00-10:00 min — 60% combat, more variety
    else if (minute < 10)
      pool = ['Combat Hunter', 'Cyber Shooter', 'Stealth Infiltrator', 'Scrap Scavenger', 'Cyber-Net Junkie'];

    // 10:00-15:00 min — introduce Heavy Mechs
    else if (minute < 15) {
      pool = ['Combat Hunter', 'Cyber Shooter', 'Overclocked Berserker', 'Scrap Scavenger', 'Cyber-Net Junkie'];
      if (!this.enemies.some(e => e.enemyType === 'Heavy Mech'))
        return 'Heavy Mech';
    }

    // 15:00-20:00 min — heavy pressure + boss
    else if (minute < 20) {
      pool = ['Combat Hunter', 'Cyber Shooter', 'Heavy Mech', 'Overclocked Berserker', 'Scrap Scavenger'];
      if (!this.enemies.some(e => e.enemyType === 'Security Defector Mech'))
        return 'Security Defector Mech';
    }

    // 20:00-25:00 min — near endgame
    else if (minute < 25)
      pool = ['Combat Hunter', 'Cyber Shooter', 'Heavy Mech', 'Overclocked Berserker', 'Cyber-Net Junkie'];

    // 25:00+ — endgame with boss
    else {
      pool = ['Overclocked Berserker', 'Combat Hunter', 'Cyber Shooter', 'Heavy Mech', 'Cyber-Net Junkie'];
      if (!this.enemies.some(e => e.enemyType === 'Rogue AI Overlord') && !this.megaBoss)
        return 'Rogue AI Overlord';
    }

    return randomChoice(pool);
  }

  spawnEnemy() {
    if (this.enemies.length >= this.enemyCap()) return;
    // Endless: enemies are stronger from the start by treating them as ~8 minutes further along
    // (drives Enemy HP/speed scaling; damage stays conservative). Act 1 uses the real minute.
    const mins = this.currentMinute() + (this.endless ? 8 : 0);
    const e = new Enemy(this.chooseEnemyType(), mins);
    // Armored Swarm Protocol — Endless-only extra HP scaling (modest; never touches Act 1 or bosses,
    // which are already tuned). Applied once at spawn so it can't compound or double-apply.
    if (this.endless && !e.isBoss() && this._hasProto('armored_swarm')) e.hp = Math.round(e.hp * 1.18);
    // Blood Grid — enemy speed boost (Chaos only; non-boss; bounded +7%)
    if (this._chaosMode && !e.isBoss()) {
      const _esm = this._getActiveChaosLawModifiers().enemySpeedMult;
      if (_esm !== 1) { e._baseSpeedFull *= _esm; e.baseSpeed *= _esm; }
    }
    this.enemies.push(e);
    if (e.isBoss()) {
      // Act 1: warn per boss spawn (unchanged). Endless: collapse to one warning per loop window.
      if (!this.endless) this.audio?.playBossWarning();
      else if (this._bossWarnCd <= 0) { this._bossWarnCd = BOSS_WARN_COOLDOWN; this.audio?.playBossWarning(); }
    }
  }

  // ─── Ability activations ──────────────────────────────────────────────────

  activateSonicPulse(mousePos) {
    const p = this.player;
    if (p.upgrades['Sonic Pulse'] === 0 || p.sonicPulseCooldown > 0) return;

    const wm       = this._worldMouse(mousePos);
    const aimDir   = safeNormalize(new Vec2(wm.x - p.pos.x, wm.y - p.pos.y));
    const range    = 220;
    const halfCone = Math.PI / 2; // 180° total arc
    const force    = 300 + p.upgrades['Sonic Pulse'] * 60;

    for (const e of this.enemies) {
      const toEnemy = e.pos.sub(p.pos);
      if (toEnemy.length() > range) continue;
      const cos   = clamp(aimDir.dot(safeNormalize(toEnemy)), -1, 1);
      const angle = Math.acos(cos);
      if (angle < halfCone) {
        const push = safeNormalize(toEnemy).scale(force);
        e.vel.addMut(push);
        e.stunned = 0.3;
      }
    }

    p.sonicPulseCooldown = Math.max(2.5, 5.0 - p.upgrades['Sonic Pulse'] * 0.5);
    this.floatingTexts.push(new FloatingText('SONIC PULSE!', p.pos.clone(), WHITE, 0.8));
  }

  activateSpecial() {
    if (this.gameState !== 'playing' || this.gameOver || this.victory || this.upgradeUI) return;
    const p = this.player;
    if (p.specialCooldown > 0) return;
    if      (p.selectedCharacter === 'skeleton_warrior')  this._activateBoneGuardBlast();
    else if (p.selectedCharacter === 'taekwondo_girl')    this._activateLightningDashStrike();
    else if (p.selectedCharacter === 'cyber_arm_hero')    this._activateOverdriveBeam();
  }

  _activateBoneGuardBlast() {
    const p = this.player;
    const radius = 210, force = 350, dmg = 20;
    for (const e of this.enemies) {
      if (distance(e.pos, p.pos) < radius) {
        e.vel.addMut(safeNormalize(e.pos.sub(p.pos)).scale(force));
        e.takeHit(dmg, this);
      }
    }
    this._specialRings.push({ pos: p.pos.clone(), radius: 0, maxRadius: radius,
                               life: 0.55, maxLife: 0.55, color1: '#ff3030', color2: '#ffffff' });
    p.specialCooldown = p.specialMaxCooldown;
    this.floatingTexts.push(new FloatingText('BONE GUARD BLAST!', p.pos.clone(), RED, 1.0));
    this.screenShake.trigger(5, 0.2);
  }

  _activateLightningDashStrike() {
    // ── Crystal Ice Field (replaces Lightning Dash Strike) ──────────────────────
    // Drops a persistent ice field at the player's feet. Normal enemies inside are
    // frozen + take DoT; bosses get a shorter freeze + burst damage once per cast.
    const p = this.player;
    p.specialCooldown     = p.specialMaxCooldown;
    this._taekwondoDmgSet = new Set();
    this.audio?.playIceSweep?.();   // crystal field onset
    this._iceFields.push({
      pos:         p.pos.clone(),
      radius:      ICE_FIELD_RADIUS,
      life:        ICE_FIELD_DURATION,
      maxLife:     ICE_FIELD_DURATION,
      dotTimer:    ICE_FIELD_DOT_INTERVAL,
      bossDmgDone: new Set(),   // bosses already hit with burst this cast
      rot:         Math.random() * Math.PI * 2,   // stable crack orientation per field
    });
    // Frost burst ring visual
    this._specialRings.push({
      pos: p.pos.clone(), radius: 0, maxRadius: ICE_FIELD_RADIUS,
      life: 0.5, maxLife: 0.5, color1: '#b0f0ff', color2: '#ffffff',
    });
    this.floatingTexts.push(new FloatingText('CRYSTAL ICE FIELD!', p.pos.clone(), '#b0f0ff', 1.2));
    this.screenShake.trigger(3, 0.12);

    // ── Spirit Dojang Flag — DISABLED ──────────────────────────────────────────
    // (Removed to fix problematic AoE behavior; kept system available for future fixes)
    // if (!this.spiritDojang) { ... }
  }

  // ── Crystal Ice Field — frame update ────────────────────────────────────────
  _updateIceFields(dt) {
    // Collect singleton mini-bosses (not in this.enemies array).
    const singletons = [];
    if (this.titanBoss?.hp > 0)
      singletons.push({ boss: this.titanBoss,       die: () => this._titanDie() });
    if (this.annihilatorBoss?.hp > 0)
      singletons.push({ boss: this.annihilatorBoss, die: () => this._annihilatorDie() });
    if (this.bloodfangBoss?.hp > 0)
      singletons.push({ boss: this.bloodfangBoss,   die: () => this._bloodfangDie() });
    if (this.cyberSerpentBoss?.hp > 0)
      singletons.push({ boss: this.cyberSerpentBoss, die: () => this._cyberSerpentDie() });
    if (this.cyberDragonBoss?.hp > 0)
      singletons.push({ boss: this.cyberDragonBoss,  die: () => this._cyberDragonDie() });

    for (let fi = this._iceFields.length - 1; fi >= 0; fi--) {
      const f = this._iceFields[fi];
      f.life -= dt;
      if (f.life <= 0) { this._iceFields.splice(fi, 1); continue; }

      f.dotTimer -= dt;
      const doDot = f.dotTimer <= 0;
      if (doDot) f.dotTimer = ICE_FIELD_DOT_INTERVAL;

      // ── Enemies in this.enemies (normal + enemy-type bosses) ──
      for (const e of this.enemies) {
        if (!e?.pos || e.hp <= 0) continue;
        if (distance(e.pos, f.pos) > f.radius + (e.radius || 16)) continue;
        const isBoss = e.isBoss?.() || e.isMegaBoss;
        if (isBoss) {
          e.stunned = Math.max(e.stunned || 0, ICE_FIELD_FREEZE_BOSS);
          if (!f.bossDmgDone.has(e)) {
            f.bossDmgDone.add(e);
            const burst = this._capBossDamage(e, Math.floor((e.maxHp || e.hp) * ICE_FIELD_BOSS_BURST_PCT));
            e.takeHit(burst, this);
            this.floatingTexts.push(new FloatingText(
              '❄ ' + Math.round(burst),
              e.pos.add(new Vec2(0, -(e.radius || 20) - 8)), '#b0f0ff', 1.2));
          }
          if (doDot) e.takeHit(this._capBossDamage(e, ICE_FIELD_DOT_DMG), this);
        } else {
          e.stunned = Math.max(e.stunned || 0, ICE_FIELD_FREEZE_NORMAL);
          if (doDot) e.takeHit(ICE_FIELD_DOT_DMG, this);
        }
      }

      // ── Singleton mini-bosses (titan / annihilator / bloodfang) ──
      for (const { boss, die } of singletons) {
        if (!boss.pos || distance(boss.pos, f.pos) > f.radius + (boss.radius || 30)) continue;
        boss.stunned = Math.max(boss.stunned || 0, ICE_FIELD_FREEZE_BOSS);
        if (!f.bossDmgDone.has(boss)) {
          f.bossDmgDone.add(boss);
          const burst = this._capBossDamage(boss,
            Math.floor((boss.maxHp || boss.hp) * ICE_FIELD_BOSS_BURST_PCT));
          boss.hp -= burst; boss.hitFlash = 0.1; this._triggerHeavyHitFlash();
          this.floatingTexts.push(new FloatingText(
            '❄ ' + Math.round(burst),
            boss.pos.add(new Vec2(0, -(boss.radius || 30) - 8)), '#b0f0ff', 1.2));
          if (boss.hp <= 0) die();
        }
        if (doDot && boss.hp > 0) {
          const d = this._capBossDamage(boss, ICE_FIELD_DOT_DMG);
          boss.hp -= d; boss.hitFlash = 0.06;
          if (boss.hp <= 0) die();
        }
      }

      // ── Double Demons — two bodies share one HP pool ──
      if (this.doubleDemonsBoss?.hp > 0) {
        const dd = this.doubleDemonsBoss;
        for (const body of [dd.gunner, dd.claw]) {
          if (!body?.pos || distance(body.pos, f.pos) > f.radius + (body.radius || 30)) continue;
          body.stunned = Math.max(body.stunned || 0, ICE_FIELD_FREEZE_BOSS);
          if (!f.bossDmgDone.has(body)) {
            f.bossDmgDone.add(body);
            const burst = this._capBossDamage(dd,
              Math.floor(dd.maxHp * ICE_FIELD_BOSS_BURST_PCT));
            dd.hp -= burst; body.hitFlash = 0.1; this._triggerHeavyHitFlash();
            this.floatingTexts.push(new FloatingText(
              '❄ ' + Math.round(burst),
              body.pos.add(new Vec2(0, -(body.radius || 30) - 8)), '#b0f0ff', 1.2));
            if (dd.hp <= 0) this._doubleDemonsDie();
          }
          if (doDot && dd.hp > 0) {
            const d = this._capBossDamage(dd, ICE_FIELD_DOT_DMG);
            dd.hp -= d; body.hitFlash = 0.06;
            if (dd.hp <= 0) this._doubleDemonsDie();
          }
        }
      }
    }
  }

  // ── Crystal Ice Field — draw (world-space ctx, called before entities) ──────
  _drawIceFields(ctx) {
    if (!this._iceFields.length) return;
    const now = performance.now() / 1000;
    for (const f of this._iceFields) {
      const fade  = Math.min(1, f.life / 0.45) * Math.min(1, (f.maxLife - f.life + 0.35) / 0.35);
      const pulse = 0.58 + 0.18 * Math.sin(now * 3.8);
      ctx.save();
      // Ground radial fill — flattened ellipse so it reads as floor-level
      const grad = ctx.createRadialGradient(
        f.pos.x, f.pos.y, 0, f.pos.x, f.pos.y, f.radius);
      grad.addColorStop(0,   `rgba(180,238,255,${0.22 * fade})`);
      grad.addColorStop(0.55,`rgba(100,200,255,${0.14 * fade})`);
      grad.addColorStop(1,   `rgba(50,160,255,${0.04 * fade})`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(f.pos.x, f.pos.y, f.radius, f.radius * 0.40, 0, 0, Math.PI * 2);
      ctx.fill();
      // Pulsing edge ring
      ctx.strokeStyle = `rgba(160,232,255,${pulse * fade * 0.72})`;
      ctx.lineWidth   = 2;
      ctx.beginPath();
      ctx.ellipse(f.pos.x, f.pos.y, f.radius, f.radius * 0.40, 0, 0, Math.PI * 2);
      ctx.stroke();
      // Crystal shards — 8 small triangles orbiting the edge
      const shards = 8;
      for (let k = 0; k < shards; k++) {
        const a  = (k / shards) * Math.PI * 2 + now * 0.38;
        const rr = f.radius * (0.52 + 0.28 * ((k % 3) / 3));
        const sx = f.pos.x + Math.cos(a) * rr;
        const sy = f.pos.y + Math.sin(a) * rr * 0.40;
        ctx.fillStyle = `rgba(210,248,255,${fade * 0.70})`;
        ctx.beginPath();
        ctx.moveTo(sx, sy - 6);
        ctx.lineTo(sx + 3, sy + 5);
        ctx.lineTo(sx - 3, sy + 5);
        ctx.closePath();
        ctx.fill();
      }
      // Crystal crack lines — 6 thin radial fractures from center
      ctx.save();
      ctx.globalAlpha = fade * 0.55;
      ctx.strokeStyle = 'rgba(200,248,255,0.85)';
      ctx.lineWidth   = 1;
      for (let k = 0; k < 6; k++) {
        const ca = (k / 6) * Math.PI * 2 + (f.rot || 0);
        const crLen = f.radius * (0.55 + 0.3 * ((k % 2) ? 0.6 : 1.0));
        ctx.beginPath();
        ctx.moveTo(f.pos.x, f.pos.y);
        ctx.lineTo(f.pos.x + Math.cos(ca) * crLen, f.pos.y + Math.sin(ca) * crLen * 0.40);
        ctx.stroke();
      }
      ctx.restore();
      ctx.restore();
    }
  }

  _activateOverdriveBeam() {
    const p = this.player;
    const wm = this._worldMouse(this._lastMousePos);
    const aimDir = wm
      ? safeNormalize(new Vec2(wm.x - p.pos.x, wm.y - p.pos.y))
      : new Vec2(1, 0);
    const beamLength = 600, beamWidth = 28, dmg = 25, maxHits = 8;
    let hits = 0;
    for (const e of this.enemies) {
      if (hits >= maxHits) break;
      const toEnemy = e.pos.sub(p.pos);
      const along   = toEnemy.dot(aimDir);
      if (along < 0 || along > beamLength) continue;
      const perp = toEnemy.sub(aimDir.scale(along));
      if (perp.lengthSq() < (beamWidth + e.radius) ** 2) {
        e.takeHit(dmg, this);
        hits++;
      }
    }
    this._specialBeams.push({ startPos: p.pos.clone(), dir: aimDir,
                               length: beamLength, life: 0.4, maxLife: 0.4 });
    // Wind-up spiral burst — 10 radial orange sparks before beam fires
    for (let _i = 0; _i < 10; _i++) {
      this.particles.spawnWindupSpark(p.pos, (_i / 10) * Math.PI * 2, ORANGE, 100 + _i * 7);
    }
    p.specialCooldown = p.specialMaxCooldown;
    this.floatingTexts.push(new FloatingText('OVERDRIVE BEAM!', p.pos.clone(), ORANGE, 1.0));
    this.screenShake.trigger(4, 0.2);
  }

  activateEMPCloud() {
    const p = this.player;
    if (p.empCloudCooldown > 0) return;   // baseline ability — no longer upgrade-gated

    const radius = 240 + p.upgrades['EMP Cloud'] * 40;   // base 200 +20%; upgrade still extends

    for (const e of this.enemies) {
      if (distance(e.pos, p.pos) >= radius) continue;
      if (e.isBoss() || e.isMegaBoss) {
        e.stunned = Math.max(e.stunned, 0.5);  // bosses: short safe interrupt only, never a full lock
      } else {
        e.stunned = 5.0;                       // normal enemies: immobilized 5s
        this.floatingTexts.push(new FloatingText('STUNNED', e.pos.clone(), CYAN, 0.8));
        this.particles.spawnHitSparks(e.pos, CYAN);
      }
    }

    // Cyan electric pulse ring around the player
    this._specialRings.push({ pos: p.pos.clone(), radius: 0, maxRadius: radius,
                               life: 0.5, maxLife: 0.5, color1: CYAN, color2: '#ffffff' });
    p.empCloudCooldown = Math.max(8, 12 - p.upgrades['EMP Cloud']);   // 12s base, upgrade trims it
    // ── Relic run-state ──────────────────────────────────────────
    this._firstBossKilledRun  = false;   // Eden Core Fragment — once per run
    this._brokenHaloUsed      = false;   // Broken Halo — once per run
    this._emberTrail          = [];      // Serpent Ember Coil trail segments
    this._emberTrailCd        = 0;
    this._cryoChargeCd        = 0;       // Dragon Cryo Heart cooldown
    this._cryoChargeReady     = false;
    this._kickFireCount       = 0;       // Crescent Soul Bead kick counter
    this._oniBloodMarks       = new Map();// Oni Blood Circuit marked enemies
    this.floatingTexts.push(new FloatingText('STUN PULSE!', p.pos.clone(), CYAN, 0.9));
    // (Japan Phasewalker's EMP Shockwave is now AUTOMATIC/passive — see _updatePhasewalkerFx —
    //  so E stays purely the shared global EMP stun for every character.)
  }

  // ── Pulse Shield (Q): 7s cyan bubble, -60% incoming damage, 25s cooldown ──────
  activatePulseShield() {
    if (this.gameState !== 'playing' || this.paused || this.gameOver || this.victory || this.upgradeUI) return;
    const p = this.player;
    if (p.pulseShieldCooldown > 0) {
      this.floatingTexts.push(new FloatingText(`SHIELD ${Math.ceil(p.pulseShieldCooldown)}s`, p.pos.clone(), '#88aacc', 0.7));
      return;
    }
    p.shieldTimer         = p.shieldDuration;          // 7s active
    p.pulseShieldCooldown = p.pulseShieldMaxCooldown;  // 25s cooldown
    this._specialRings.push({ pos: p.pos.clone(), radius: 0, maxRadius: 60,
                               life: 0.45, maxLife: 0.45, color1: CYAN, color2: '#bfefff' });
    // Wind-up spiral burst — 12 radial sparks collapse inward → shield snaps on
    for (let _i = 0; _i < 12; _i++) {
      this.particles.spawnWindupSpark(p.pos, (_i / 12) * Math.PI * 2, CYAN, 90 + _i * 6);
    }
    this.floatingTexts.push(new FloatingText('PULSE SHIELD!', p.pos.clone(), CYAN, 1.0));
  }

  // ── VFX: brief white overlay on heavy boss hit (visual hit-stop surrogate) ──
  _triggerHeavyHitFlash() {
    if (this._hitFlashOverlayCd > 0) return;
    this._hitFlashOverlayTimer = 0.07;   // 70ms white flash
    this._hitFlashOverlayCd    = 0.55;   // minimum 550ms between flashes
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Japan Phasewalker kit — drives the three js/effects/ modules. ALL self-guard on
  // selectedCharacter === 'japan_phasewalker', so existing characters are untouched.
  // The modules work in SCREEN space, so positions/enemy coords are converted from
  // world → screen via the camera + _viewScale (matches how the player is drawn).
  // ════════════════════════════════════════════════════════════════════════════

  // Player center-x / foot-y / sprite height in SCREEN pixels (player sprite is 64 world-units tall).
  _playerScreenPos() {
    const p = this.player, vs = this._viewScale;
    const cx = (p.pos.x - this.camera.x) * vs;
    const cyc = (p.pos.y - this.camera.y) * vs;
    const spriteH = 64 * vs;
    return { cx, footY: cyc + spriteH / 2, spriteH };
  }

  // Lazily build the three modules once the canvas + sprite are ready (Endless/Act 1 agnostic).
  _ensurePhasewalkerFx() {
    if (this.player?.selectedCharacter !== 'japan_phasewalker') return;
    if (this._pwFxBuilt || !this._canvas) return;
    const spr = this._phasewalkerSprite;
    if (!spr || !spr.complete || !spr.naturalWidth) return;
    const h = Math.max(24, Math.round(64 * this._viewScale));
    const w = Math.max(12, Math.round(spr.naturalWidth * (h / spr.naturalHeight)));
    this._glitchDash         = new GlitchDash(this._canvas, spr, { spriteW: w, spriteH: h });
    this._empShock           = new EMPShockwave(this._canvas, { distortion: { strength: 0 } });   // disable canvas self-draw (crash/perf-safe)
    this._digitalSingularity = new DigitalSingularity(this._canvas, spr, { spriteW: w, spriteH: h });
    this._pwFxBuilt = true;
  }

  // EMP Shockwave (E) — electric AoE; hit detection + stun applied via the module's onHit hook.
  activateEMPShockwave() {
    if (this.gameState !== 'playing' || this.paused || this.gameOver || this.victory || this.upgradeUI || this.mutationUI) return;
    const p = this.player;
    if (p.selectedCharacter !== 'japan_phasewalker') return;
    if (this._empShockCooldown > 0) return;
    this._ensurePhasewalkerFx();
    if (!this._empShock) return;
    const s = this._playerScreenPos();
    this._empShock.trigger(s.cx, s.footY);
    // Shockwave Protocol mastery trims the cooldown (10s → 7s at L3); kit-local, no global balance change.
    this._empShockCooldown = Math.max(7, 10 - (p.upgrades['phasewalker_shockwave_mastery'] || 0));
    this.screenShake.trigger(4, 0.2);
    this.floatingTexts.push(new FloatingText('EMP SHOCKWAVE!', p.pos.clone(), CYAN, 1.0));
  }

  // Digital Singularity (SPACE) — 4-phase ultimate; per-laser damage via the module's onStrike hook.
  activateDigitalSingularity() {
    if (this.gameState !== 'playing' || this.paused || this.gameOver || this.victory || this.upgradeUI) return;
    const p = this.player;
    if (p.selectedCharacter !== 'japan_phasewalker') return;
    this._ensurePhasewalkerFx();
    if (!this._digitalSingularity || this._digitalSingularity.isActive()) return;
    if (p.mana < ULTIMATE_MANA_COST) {
      this.floatingTexts.push(new FloatingText('NOT ENOUGH MANA', p.pos.clone(), CYAN, 1.0));
      return;
    }
    p.mana -= ULTIMATE_MANA_COST;
    const s = this._playerScreenPos();
    this._digitalSingularity.trigger(s.cx, s.footY);
    this.screenShake.trigger(6, 0.3);
    this.floatingTexts.push(new FloatingText('DIGITAL SINGULARITY!', p.pos.clone(), '#7df9ff', 1.4));
  }

  // Per-frame: build if needed, tick cooldown, fire GlitchDash on the dash rising→falling edge,
  // and run the EMP / Singularity module updates with world→screen enemy hooks. No-op for others.
  _updatePhasewalkerFx(dt) {
    if (this.player?.selectedCharacter !== 'japan_phasewalker') return;
    this._ensurePhasewalkerFx();
    const now = performance.now();
    const vs  = this._viewScale, cam = this.camera;
    if (this._empShockCooldown > 0) this._empShockCooldown -= dt;

    // GlitchDash — trigger when the player's SHIFT dash ends (trail from start → end).
    const dashing = this.player.dashTimer > 0;
    if (this._glitchDash) {
      try {
        if (dashing && !this._pwDashing) this._pwDashStart = this.player.pos.clone();
        if (!dashing && this._pwDashing && this._pwDashStart) {
          const fromX = (this._pwDashStart.x - cam.x) * vs;
          const toX   = (this.player.pos.x - cam.x) * vs;
          const s = this._playerScreenPos();
          this._glitchDash.trigger(fromX, toX, s.footY, toX >= fromX ? 1 : -1);
        }
        this._pwDashing = dashing;
        this._glitchDash.update(now);
      } catch (err) { console.warn('[Phasewalker GlitchDash]', err); }
    }

    // Automatic EMP Shockwave (passive — NOT bound to E). Fires on its own cooldown when foes are near.
    if (this._empShock && this._empShockCooldown <= 0 &&
        this.enemies.some(e => e?.pos && distance(e.pos, this.player.pos) < 240)) {
      this.activateEMPShockwave();
    }
    if (this._empShock) {
      try {
        this._empShock.update(now, this.enemies, {
          getX: e => ((e?.pos?.x ?? this.camera.x) - cam.x) * vs,   // pos-guarded so a stale/destroyed enemy can't crash it
          getY: e => ((e?.pos?.y ?? this.camera.y) - cam.y) * vs,
          onHit: e => {
            if (!e?.pos) return;
            if (e.isBoss?.() || e.isMegaBoss) e.stunned = Math.max(e.stunned || 0, 0.5);  // bosses: brief interrupt
            else { e.stunned = 5.0; this.particles.spawnHitSparks(e.pos, CYAN); }           // normals: 5s (same as EMP cloud)
          },
        });
      } catch (err) { console.warn('[Phasewalker EMP]', err); }   // one VFX error must not kill the run
    }

    if (this._digitalSingularity) {
      try {
        if (this._digitalSingularity.isActive()) {   // keep the dissolving sprite pinned to the player
          const s = this._playerScreenPos();
          this._digitalSingularity.cx = s.cx;
          this._digitalSingularity.footY = s.footY;
        }
        const ultDmg = 36 + 6 * (this.player.upgrades['phasewalker_singularity_mastery'] || 0);   // Digital Singularity Mastery
        this._digitalSingularity.update(now, this.enemies, {
          getX: e => ((e?.pos?.x ?? this.camera.x) - cam.x) * vs,
          getY: e => ((e?.pos?.y ?? this.camera.y) - cam.y) * vs,
          onStrike: e => { if (e?.takeHit) e.takeHit(ultDmg, this); },   // per-laser damage (his ultimate)
        });
      } catch (err) { console.warn('[Phasewalker Singularity]', err); }
    }
  }

  // Screen-space render of all three modules (called after the camera block, before the HUD).
  _drawPhasewalkerFx(ctx) {
    this._canvas = ctx.canvas;   // capture for the lazy module builder (used by update too)
    if (this.player?.selectedCharacter !== 'japan_phasewalker') return;
    this._ensurePhasewalkerFx();
    try {   // VFX-only render: never let a module draw error abort the frame / kill the run
      if (this._glitchDash) { this._glitchDash.renderBehind(ctx); this._glitchDash.renderFront(ctx); }
      if (this._empShock) this._empShock.render(ctx);
      if (this._digitalSingularity && this._digitalSingularity.isActive()) {
        const sh = this._digitalSingularity.getShake();
        ctx.save(); ctx.translate(sh.x, sh.y);
        this._digitalSingularity.render(ctx);
        ctx.restore();
      } else if (this._digitalSingularity) {
        this._digitalSingularity.render(ctx);   // lingering reform flash after isActive() clears
      }
    } catch (err) { console.warn('[Phasewalker FX render]', err); }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Oni "Protocol 0: Total Cataclysm" — SPACE ultimate. Mirrors the Phasewalker kit:
  // module runs in SCREEN space (world→screen via camera + _viewScale). Self-guards on
  // selectedCharacter === 'oni_cataclysm_protocol', so every other character is untouched.
  // ════════════════════════════════════════════════════════════════════════════
  _ensureOniFx() {
    if (this.player?.selectedCharacter !== 'oni_cataclysm_protocol') return;
    if (this._oniFxBuilt || !this._canvas) return;
    this._protocol0  = new Protocol0(this._canvas);
    this._laserEyes  = new LaserEyes(this._canvas, { charge: { ms: 150 }, beam: { durationMs: 1100 } });
    this._meteorRain = new MeteorRain(this._canvas, { area: { radius: 170 } });
    this._oniFxBuilt = true;
  }

  activateProtocol0Cataclysm() {
    if (this.gameState !== 'playing' || this.paused || this.gameOver || this.victory || this.upgradeUI) return;
    const p = this.player;
    if (p.selectedCharacter !== 'oni_cataclysm_protocol') return;
    this._ensureOniFx();
    if (!this._protocol0 || this._protocol0.isRunning()) return;
    if (p.mana < ULTIMATE_MANA_COST) {
      this.floatingTexts.push(new FloatingText('NOT ENOUGH MANA', p.pos.clone(), RED, 1.0));
      return;
    }
    p.mana -= ULTIMATE_MANA_COST;
    const cl = p.upgrades['oni_protocol0_mastery'] || 0;   // Total Cataclysm mastery level
    const vs = this._viewScale, cam = this.camera;
    const s  = this._playerScreenPos();
    this._protocol0.trigger(s.cx, s.footY, this.enemies, {
      getX: e => ((e?.pos?.x ?? cam.x) - cam.x) * vs,
      getY: e => ((e?.pos?.y ?? cam.y) - cam.y) * vs,
      onBuffStart: b => {
        this._oniSpeedBuff = b.speedMult - 1;   // +40% move speed
        p.speedBonus += this._oniSpeedBuff;
        p._tankTimer  = 8.0;                     // 50% damage reduction window (read in Player.applyDamage)
      },
      onBuffEnd: () => {
        p.speedBonus -= this._oniSpeedBuff; this._oniSpeedBuff = 0;
        p._tankTimer  = 0;
      },
      // STAGE-2 contact damage is driven world-space in _updateOniFx (the module's own
      // screen-space onCollide never fires under the player-centred camera). No onCollide here.
      onDetonate: () => {
        this.screenShake.trigger(14, 0.6);
        const det = 220 + 40 * cl;               // Total Cataclysm mastery: stronger detonation (boss-capped)
        for (const e of this.enemies) if (e?.takeHit) e.takeHit((e.isBoss?.() || e.isMegaBoss) ? this._capBossDamage(e, det) : det, this);
        this.enemyBullets.length = 0;            // clear all enemy projectiles
      },
    });
    this.screenShake.trigger(7, 0.3);
    this.floatingTexts.push(new FloatingText('PROTOCOL 0: TOTAL CATACLYSM!', p.pos.clone(), RED, 1.6));
  }

  _updateOniFx(dt) {
    if (this.player?.selectedCharacter !== 'oni_cataclysm_protocol') return;
    this._ensureOniFx();
    if (!this._protocol0) return;
    const now = performance.now();
    const vs = this._viewScale, cam = this.camera, p = this.player;
    const toX = e => ((e?.pos?.x ?? cam.x) - cam.x) * vs;
    const toY = e => ((e?.pos?.y ?? cam.y) - cam.y) * vs;
    // Boss-first target finder: nearest boss in range, then nearest enemy
    const nearestLaserTarget = () => {
      const bossCandidates = [];
      if (this.titanBoss?.hp > 0)       bossCandidates.push(this.titanBoss);
      if (this.annihilatorBoss?.hp > 0) bossCandidates.push(this.annihilatorBoss);
      if (this.bloodfangBoss?.hp > 0)    bossCandidates.push(this.bloodfangBoss);
      if (this.cyberSerpentBoss?.hp > 0) bossCandidates.push(this.cyberSerpentBoss);
      if (this.cyberDragonBoss?.hp > 0)  bossCandidates.push(this.cyberDragonBoss);
      const _ddL = this.doubleDemonsBoss;
      if (_ddL?.hp > 0) {
        const dg = distance(_ddL.gunner.pos, p.pos), dc = distance(_ddL.claw.pos, p.pos);
        bossCandidates.push(dg < dc ? _ddL.gunner : _ddL.claw);
      }
      if (bossCandidates.length) {
        let b = null, bd = Infinity;
        for (const c of bossCandidates) { const d = distance(c.pos, p.pos); if (d < 560 && d < bd) { bd = d; b = c; } }
        if (b) return b;
      }
      let b = null, bd = Infinity;
      for (const e of this.enemies) { if (!e?.pos) continue; const d = distance(e.pos, p.pos); if (d < bd) { bd = d; b = e; } }
      return b;
    };
    const nearest = nearestLaserTarget;  // used by meteor/other below

    // Tank-buff timer (50% DR) ticks down during the ultimate
    if ((p._tankTimer || 0) > 0) p._tankTimer = Math.max(0, p._tankTimer - dt);

    // ── Protocol 0 ultimate (SPACE) ──
    try {
      const s = this._playerScreenPos();
      this._protocol0.update(now, s.cx, s.footY, this.enemies);
    } catch (err) { console.warn('[Oni Protocol0]', err); }

    // ── STAGE-2 contact damage (world-space) ──
    // The Protocol0 module detects collisions in SCREEN space, but the player-centred
    // camera keeps the on-screen player ~stationary, so its onCollide never fires mid-arena.
    // Drive the same hit here in world space: throttled ~0.4s (anti-multihit), full vs
    // normals, _capBossDamage vs bosses, mirroring the module's 18+4·cl dmg + 0.4s stun.
    if (this._protocol0.isActive()) {
      this._oniContactCd = (this._oniContactCd || 0) - dt;
      if (this._oniContactCd <= 0) {
        this._oniContactCd = 0.4;
        const cl  = p.upgrades['oni_protocol0_mastery'] || 0;
        const dmg = 18 + 4 * cl;
        const R   = 40 / vs;   // mirror the module's 40px collide radius in world units
        for (const e of this.enemies) {
          if (!e?.pos || !e.takeHit) continue;
          if (distance(e.pos, p.pos) > R) continue;
          const boss = e.isBoss?.() || e.isMegaBoss;
          e.takeHit(boss ? this._capBossDamage(e, dmg) : dmg, this);
          e.stunned = Math.max(e.stunned || 0, 0.4);
        }
      }
    } else {
      this._oniContactCd = 0;
    }

    // ── Laser Eyes (auto-weapon 1) — charged piercing beam, boss lock-on ──
    // Build laser target list: regular enemies + live boss objects so beams can damage bosses
    const _allLaserTargets = [...this.enemies];
    if (this.titanBoss?.hp > 0)        _allLaserTargets.push(this.titanBoss);
    if (this.annihilatorBoss?.hp > 0)  _allLaserTargets.push(this.annihilatorBoss);
    if (this.bloodfangBoss?.hp > 0)    _allLaserTargets.push(this.bloodfangBoss);
    if (this.cyberSerpentBoss?.hp > 0) _allLaserTargets.push(this.cyberSerpentBoss);
    if (this.cyberDragonBoss?.hp > 0)  _allLaserTargets.push(this.cyberDragonBoss);
    const _ddL2 = this.doubleDemonsBoss;
    if (_ddL2?.hp > 0 && _ddL2.gunner) _allLaserTargets.push(_ddL2.gunner);
    if (_ddL2?.hp > 0 && _ddL2.claw)   _allLaserTargets.push(_ddL2.claw);

    if (this._oniLaserCd > 0) this._oniLaserCd -= dt;
    if (this._laserEyes && !this._laserEyes.isActive() && this._oniLaserCd <= 0) {
      const tgt = nearestLaserTarget();
      if (tgt && distance(tgt.pos, p.pos) < 640) {
        const ll        = p.upgrades['oni_laser_mastery'] || 0;   // Laser Overload mastery
        const laserDmg  = 8 + 3 * ll;                              // 8 → 17 per tick (boosted)
        const splashDmg = Math.max(1, Math.round(laserDmg * 0.5)); // 50% of primary for burst
        const _targetsSnap = _allLaserTargets.slice();             // snapshot at cast time
        this._laserEyes.cast({
          getEyes: () => { const s = this._playerScreenPos(), top = s.footY - s.spriteH;
            return [ { x: s.cx - 6, y: top + s.spriteH * 0.30 }, { x: s.cx + 6, y: top + s.spriteH * 0.30 },
                     { x: s.cx - 12, y: top + s.spriteH * 0.12 }, { x: s.cx + 12, y: top + s.spriteH * 0.12 } ]; },
          getAim:  () => { const t = nearestLaserTarget(); return t ? { x: toX(t), y: toY(t) } : { x: this._playerScreenPos().cx, y: 0 }; },
          enemies: _allLaserTargets, getX: toX, getY: toY,
          onTick:  e => {
            if (!e?.takeHit || !(e.hp > 0)) return;
            const isBoss = e.isBoss?.() || e.isMegaBoss;
            const dmg = isBoss ? this._capBossDamage(e, laserDmg) : laserDmg;
            e.takeHit(dmg, this);
            // Secondary burst: up to 2 nearby targets within 80 world-units, no chain
            if (!e.pos) return;
            let splashCount = 0;
            for (const nb of _targetsSnap) {
              if (splashCount >= 2) break;
              if (!nb?.takeHit || nb === e || !(nb.hp > 0) || !nb.pos) continue;
              if (distance(nb.pos, e.pos) > 80) continue;
              const nbBoss = nb.isBoss?.() || nb.isMegaBoss;
              nb.takeHit(nbBoss ? this._capBossDamage(nb, splashDmg) : splashDmg, this);
              splashCount++;
            }
          },
        });
        this._oniLaserCd = 2.5 - 0.3 * ll;   // faster: 2.5s → 1.6s with mastery
      }
    }
    if (this._laserEyes) { try { this._laserEyes.update(now, _allLaserTargets); } catch (err) { console.warn('[Oni Laser]', err); } }

    // ── Meteor Rain (auto-weapon 2, AoE) — 5s field, auto-fires on cooldown ──
    if (this._oniMeteorCd > 0) this._oniMeteorCd -= dt;
    if (this._meteorRain && !this._meteorRain.isActive() && this._oniMeteorCd <= 0) {
      const tgt = nearest();
      if (tgt && distance(tgt.pos, p.pos) < 620) {
        const ml       = p.upgrades['oni_meteor_mastery'] || 0;   // Meteor Cataclysm mastery
        const meteorDmg = 30 + 8 * ml;                            // 30 → 54 per meteor
        this._oniMeteorWorld = { x: tgt.pos.x, y: tgt.pos.y };   // anchor the field in WORLD space
        this._meteorRain.cast(toX(tgt), toY(tgt), this.enemies, {
          getX: toX, getY: toY,
          onImpact: e => { if (e?.takeHit) e.takeHit(meteorDmg, this); },   // per-meteor AoE damage
        });
        this._oniMeteorCd = 9.0 - 1.2 * ml;   // faster fields with mastery (9.0 → 5.4s)
      }
    }
    if (this._meteorRain) {
      if (this._meteorRain.isActive() && this._oniMeteorWorld) {   // keep the circle pinned to its world spot
        this._meteorRain.cx = (this._oniMeteorWorld.x - cam.x) * vs;
        this._meteorRain.cy = (this._oniMeteorWorld.y - cam.y) * vs;
      }
      try { this._meteorRain.update(now, this.enemies); } catch (err) { console.warn('[Oni Meteor]', err); }
    }
  }

  _drawOniFx(ctx) {
    this._canvas = ctx.canvas;
    if (this.player?.selectedCharacter !== 'oni_cataclysm_protocol') return;
    this._ensureOniFx();
    try {
      if (this._meteorRain) this._meteorRain.render(ctx);   // ground grid + falling meteors (behind)
      if (this._protocol0)  this._protocol0.render(ctx);    // ult aura / lava / detonation
      if (this._laserEyes)  this._laserEyes.render(ctx);    // beams (on top)
    } catch (err) { console.warn('[Oni FX render]', err); }
  }

  // ── Euclid Vector toxin kit (world-space; built lazily when he is selected) ─────────────────
  // Minimal, defensive adapter: the kit reads {x,y,radius,dead,dying} + calls takeDamage/
  // applyKnockback/beginMelt on enemies and reads {x,y,height,facing} on the player. We proxy to the
  // game's pos/takeHit and route damage through _capBossDamage so bosses are never instantly melted.
  _euclidWrap(e) {
    let w = this._euclidWraps.get(e);
    if (w) return w;
    const game = this;
    w = {
      _e: e, dying: false, poison: null,
      get x() { return e.pos.x; },
      get y() { return e.pos.y; },
      get radius() { return e.radius || 14; },
      get hp() { return e.hp; },
      get dead() { return e.hp <= 0; },
      takeDamage(d) {
        if (!(d > 0)) return;
        const capped = (e.isBoss?.() || e.isMegaBoss) ? game._capBossDamage(e, d) : d;   // boss-cap, then route through takeHit
        if (e.takeHit) e.takeHit(capped, game); else e.hp -= capped;
      },
      applyKnockback(kx, ky) { if (e.vel) { e.vel.x += kx * 0.03; e.vel.y += ky * 0.03; } },   // modest impulse
      beginMelt() {},   // cosmetic in the kit; the enemy already dies via takeHit
    };
    this._euclidWraps.set(e, w);
    return w;
  }

  _ensureEuclidKit() {
    if (this._euclidKitBuilt || this.player?.selectedCharacter !== 'euclid_vector') return;
    const bounds = { w: WORLD_W, h: WORLD_H };
    const noFx = { add() {}, burst() {} };   // kit's optional impact debris — skipped (no-op, defensive)
    this._euclidSniper = new ToxicSniper(this._euclidPlayer, this._euclidEnemies, noFx, bounds);
    this._euclidSniper.fireInterval = 0.7;           // main weapon (sniper default 1.5s is too slow)
    this._euclidKatana = new OrbitalKatanaBarrier(this._euclidPlayer, this._euclidEnemies, noFx);
    this._euclidKatana.damage = 12;                  // close-range secondary; boss-capped per hit
    this._euclidPlague = new PlagueTrailDash(this._euclidPlayer, this._euclidEnemies, noFx, bounds);
    this._euclidPlague.destroy();                    // REMOVE its self-installed global SPACE listener — we drive it
    this._euclidPlague.cooldown = 0;                 // mana-gated by the game instead of an internal cd
    this._euclidKitBuilt = true;
  }

  _updateEuclidKit(dt) {
    if (this.player?.selectedCharacter !== 'euclid_vector') return;
    this._ensureEuclidKit();
    const p = this.player;
    try {
      // Sync world into the adapter (same array the kit holds by reference; persistent wrappers).
      this._euclidPlayer.x = p.pos.x; this._euclidPlayer.y = p.pos.y;
      if (p.lastFacingDir) this._euclidPlayer.facing = Math.atan2(p.lastFacingDir.y, p.lastFacingDir.x);   // kit v2: Plague dash lunges toward last movement
      const arr = this._euclidEnemies; arr.length = 0;
      const live = new Set();
      for (const e of this.enemies) if (e && e.pos) { arr.push(this._euclidWrap(e)); live.add(e); }
      for (const e of this._euclidWraps.keys()) if (!live.has(e)) this._euclidWraps.delete(e);

      // ── Singleton boss wrappers — let sniper/katana/plague target all bosses ──
      // Normal enemies route through _euclidWrap; bosses (not in this.enemies) need thin
      // custom wrappers with boss-capped damage + the correct die() call. DoubleDemonsBosnns
      // bodies also get wrappers, routing damage to the shared _dd.hp.
      const _eg = this;
      for (const [boss, dieFn] of [
        [this.titanBoss,       () => _eg._titanDie()],
        [this.annihilatorBoss, () => _eg._annihilatorDie()],
        [this.bloodfangBoss,   () => _eg._bloodfangDie()],
        [this.cyberSerpentBoss, () => _eg._cyberSerpentDie()],
        [this.cyberDragonBoss,  () => _eg._cyberDragonDie()],
      ]) {
        if (!boss || boss.hp <= 0) continue;
        arr.push({
          get x()      { return boss.pos.x; },
          get y()      { return boss.pos.y; },
          get radius() { return boss.radius || 40; },
          get hp()     { return boss.hp; },
          get dead()   { return boss.hp <= 0; },
          takeDamage(d) {
            if (!(d > 0) || boss.hp <= 0) return;
            const eff = _eg._capBossDamage(boss, d);
            boss.hp -= eff; boss.hitFlash = 0.08;
            _eg.floatingTexts.push(new FloatingText('-' + Math.round(eff),
              boss.pos.add(new Vec2(0, -(boss.radius || 40) - 6)), WHITE, 0.5));
            if (boss.hp <= 0) dieFn();
          },
          applyKnockback() {},
          beginMelt() {},
        });
      }
      if (this.doubleDemonsBoss && this.doubleDemonsBoss.hp > 0) {
        const _dd = this.doubleDemonsBoss;
        for (const body of [_dd.gunner, _dd.claw]) {
          if (!body) continue;
          arr.push({
            get x()      { return body.pos.x; },
            get y()      { return body.pos.y; },
            get radius() { return body.radius || 32; },
            get hp()     { return _dd.hp; },
            get dead()   { return _dd.hp <= 0; },
            takeDamage(d) {
              if (!(d > 0) || _dd.hp <= 0) return;
              const eff = _eg._capBossDamage(_dd, d);
              _dd.hp -= eff; body.hitFlash = 0.08;
              _eg.floatingTexts.push(new FloatingText('-' + Math.round(eff),
                body.pos.add(new Vec2(0, -(body.radius || 32) - 6)), WHITE, 0.5));
              if (_dd.hp <= 0) _eg._doubleDemonsDie();
            },
            applyKnockback() {},
            beginMelt() {},
          });
        }
      }

      // Card scaling — read live so it works in Act 1 + Endless.
      this._euclidSniper.bulletDamage    = 14 + 4 * this._cardLvl('euclid_toxin_shot_mastery');
      this._euclidSniper.poison.dps      = 6 + 3 * this._cardLvl('euclid_corrosive_spread');
      this._euclidSniper.poison.duration = 3 + 0.5 * this._cardLvl('euclid_corrosive_spread');
      this._euclidSniper.fireInterval    = Math.max(0.3, 0.7 / (1 + (p.fireRateBonus || 0)));   // respect fire rate

      this._euclidSniper.update(dt);
      this._euclidKatana.update(dt);
      this._euclidPlague.update(dt);
      this._updateEuclidAutoWeapons(dt);   // Phase-3 bouncing bolt + piercing needle
      p.pos.x = this._euclidPlayer.x; p.pos.y = this._euclidPlayer.y;   // apply the plague-dash lunge

      // Tick the toxin DoT the sniper applied (the kit only SETS enemy.poison; the host ticks it).
      for (const w of this._euclidWraps.values()) {
        const pz = w.poison; if (!pz || pz.timeLeft <= 0) continue;
        pz.timeLeft -= dt; pz.tickTimer -= dt;
        if (pz.tickTimer <= 0) { pz.tickTimer = pz.tickEvery; w.takeDamage(pz.dps * pz.tickEvery); }
      }
    } catch (err) { console.warn('[Euclid kit]', err); }
  }

  _drawEuclidKit(ctx) {
    if (this.player?.selectedCharacter !== 'euclid_vector' || !this._euclidKitBuilt) return;
    try {
      this._euclidKatana.draw(ctx);
      this._euclidSniper.draw(ctx);
      this._euclidPlague.draw(ctx);
      this._drawEuclidAutoWeapons(ctx);
    } catch (err) { console.warn('[Euclid kit draw]', err); }
  }

  // ── Euclid auto-weapons (Phase 3) — Toxin Vector Bolt (bounces ≤5) + Viral Gas Needle (pierce/multishot).
  // Both respect fireRateBonus, are hard-capped, auto-clean, boss-capped, and route damage through
  // takeHit so the Elemental/Fusion hooks fire automatically (toxin element + Euclid fusions).
  // Combined live targets: normal/elite enemies + the singleton mini-bosses (titan/annihilator/
  // bloodfang) which are NOT in this.enemies — so Euclid's guns actually hit bosses too.
  _euclidCandidates() {
    const bosses = [];
    if (this.titanBoss && this.titanBoss.hp > 0)               bosses.push(this.titanBoss);
    if (this.annihilatorBoss && this.annihilatorBoss.hp > 0)   bosses.push(this.annihilatorBoss);
    if (this.bloodfangBoss && this.bloodfangBoss.hp > 0)       bosses.push(this.bloodfangBoss);
    if (this.cyberSerpentBoss && this.cyberSerpentBoss.hp > 0) bosses.push(this.cyberSerpentBoss);
    if (this.cyberDragonBoss && this.cyberDragonBoss.hp > 0)   bosses.push(this.cyberDragonBoss);
    // Double Demons: proxy objects expose live pos/radius from each body and live hp from the
    // shared parent — so bolt targeting and _euclidNearest hp-checks work correctly without
    // raw-object identity. _ddParent / _ddBody tags let _euclidDamage route damage explicitly.
    if (this.doubleDemonsBoss && this.doubleDemonsBoss.hp > 0) {
      const _dd = this.doubleDemonsBoss;
      for (const body of [_dd.gunner, _dd.claw]) {
        if (!body) continue;
        bosses.push({
          pos:       body.pos,           // live Vec2 reference — moves with the body every frame
          radius:    body.radius,
          get hp()   { return _dd.hp; }, // reads shared HP so e.hp <= 0 is accurate
          _ddParent: _dd,
          _ddBody:   body,
        });
      }
    }
    return bosses.length ? this.enemies.concat(bosses) : this.enemies;
  }

  _euclidNearest(from, exclude, cand) {
    let best = null, bd = Infinity;
    for (const e of (cand || this._euclidCandidates())) {
      if (!e?.pos || e.hp <= 0 || (exclude && exclude.has(e))) continue;
      const d = distance(e.pos, from);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // Unified damage: Enemy instances route through takeHit (auto element/fusion hooks); singleton
  // mini-bosses use their hp path + die check. Both boss-capped, both get a visible toxin splash.
  _euclidDamage(e, dmg) {
    if (!e) return;
    // Double Demons proxy (from _euclidCandidates): _ddParent tag is the canonical route.
    // Avoids raw-object identity checks that silently fail if doubleDemonsBoss is null mid-frame.
    if (e._ddParent) {
      const _dd = e._ddParent;
      if (_dd.hp <= 0) return;
      const eff = this._capBossDamage(_dd, dmg);
      _dd.hp -= eff; e._ddBody.hitFlash = 0.08;
      this.floatingTexts.push(new FloatingText('-' + Math.round(eff), e.pos.add(new Vec2(0, -(e.radius || 20) - 6)), WHITE, 0.5));
      if (_dd.hp <= 0) this._doubleDemonsDie();
      this.elementFx?.spawn(e.pos.x, e.pos.y, 'toxin', 1.0);
      return;
    }
    if (e.hp <= 0) return;
    const isBoss = e.isBoss?.() || e.isMegaBoss || e === this.titanBoss || e === this.annihilatorBoss || e === this.bloodfangBoss;
    const d = isBoss ? this._capBossDamage(e, dmg) : dmg;
    if (e.takeHit) {
      e.takeHit(d, this);
    } else {                                  // singleton mini-boss hp path (non-zero, capped)
      e.hp -= d; e.hitFlash = 0.08;
      this.floatingTexts.push(new FloatingText('-' + Math.round(d), e.pos.add(new Vec2(0, -(e.radius || 20) - 6)), WHITE, 0.5));
      if (e === this.titanBoss && e.hp <= 0)              this._titanDie();
      else if (e === this.annihilatorBoss && e.hp <= 0)   this._annihilatorDie();
      else if (e === this.bloodfangBoss && e.hp <= 0)     this._bloodfangDie();
      else if (e === this.cyberSerpentBoss && e.hp <= 0)  this._cyberSerpentDie();
      else if (e === this.cyberDragonBoss && e.hp <= 0)   this._cyberDragonDie();
    }
    this.elementFx?.spawn(e.pos.x, e.pos.y, 'toxin', 1.0);   // visible corrosive splash on every hit
  }

  _updateEuclidAutoWeapons(dt) {
    const p = this.player;
    const fr = 1 + (p.fireRateBonus || 0);
    const cand = this._euclidCandidates();

    // Two compact toxic auto-guns hovering above Euclid's shoulders; aim at nearest target.
    const bob = Math.sin(performance.now() * 0.006) * 3;
    const gl = new Vec2(p.pos.x - 24, p.pos.y - 34 + bob);   // left gun
    const gr = new Vec2(p.pos.x + 24, p.pos.y - 34 - bob);   // right gun
    const aimT = this._euclidNearest(p.pos, null, cand);
    this._euclidGuns = [
      { x: gl.x, y: gl.y, ang: aimT ? Math.atan2(aimT.pos.y - gl.y, aimT.pos.x - gl.x) : 0 },
      { x: gr.x, y: gr.y, ang: aimT ? Math.atan2(aimT.pos.y - gr.y, aimT.pos.x - gr.x) : 0 },
    ];

    // ── Weapon 1: Toxin Vector Bolt (bouncing) — fires from the LEFT gun ──
    this._euclidBoltCd -= dt;
    if (this._euclidBoltCd <= 0) {
      this._euclidBoltCd = Math.max(0.28, 0.85 / fr);
      if (aimT && distance(aimT.pos, p.pos) < 720 && this._euclidBolts.length < 40) {
        const bounces   = Math.min(5, 2 + this._cardLvl('euclid_vector_ricochet'));
        const boltDmg   = 16 + 3 * this._cardLvl('euclid_toxin_shot_mastery');
        const boltCount = 1 + this._cardLvl('euclid_bolt_multishot');
        const baseAng   = aimT ? Math.atan2(aimT.pos.y - gl.y, aimT.pos.x - gl.x) : 0;
        for (let _bi = 0; _bi < boltCount && this._euclidBolts.length < 40; _bi++) {
          const angOff = (_bi - (boltCount - 1) / 2) * 0.22;
          const sOff   = new Vec2(-Math.sin(baseAng) * angOff * 28, Math.cos(baseAng) * angOff * 28);
          const sPos   = gl.add(sOff);
          this._euclidBolts.push({ pos: sPos, target: aimT, prev: sPos.clone(),
            dmg: boltDmg, bounces, hit: new Set(), t: 0 });
        }
      }
    }
    for (let i = this._euclidBolts.length - 1; i >= 0; i--) {
      const b = this._euclidBolts[i];
      b.t += dt;
      const tg = b.target;
      if (!tg || tg.hp <= 0) {                                 // target gone → retarget or expire
        b.target = this._euclidNearest(b.pos, b.hit, cand);
        if (!b.target || b.t > 3) this._euclidBolts.splice(i, 1);
        continue;
      }
      const dir = safeNormalize(tg.pos.sub(b.pos));
      b.prev = b.pos.clone();
      b.pos.addMut(dir.scale(520 * dt));
      if (distance(b.pos, tg.pos) < (tg.radius || 16) + 10) {  // impact
        this._euclidDamage(tg, b.dmg);
        b.hit.add(tg);
        b.bounces -= 1;
        if (b.bounces <= 0) { this._euclidBolts.splice(i, 1); continue; }
        const next = this._euclidNearest(tg.pos, b.hit, cand); // bounce to a NEW nearest target
        if (!next || distance(next.pos, tg.pos) > 280) { this._euclidBolts.splice(i, 1); continue; }
        b.target = next; b.pos = tg.pos.clone();
      }
    }

    // ── Weapon 2: Viral Gas Needle / Corrosive Shard — fires from the RIGHT gun ──
    this._euclidNeedleCd -= dt;
    if (this._euclidNeedleCd <= 0) {
      this._euclidNeedleCd = Math.max(0.4, 1.1 / fr);
      const ml    = this._cardLvl('euclid_corrosive_multishot');
      const shots = 1 + Math.floor(ml / 2);                    // +1 projectile every 2 levels
      const pierce = 1 + ml;                                    // +1 pierce per level
      if (aimT && distance(aimT.pos, p.pos) < 680) {
        const base = safeNormalize(aimT.pos.sub(gr));
        for (let s = 0; s < shots && this._euclidNeedles.length < 48; s++) {
          const spread = (s - (shots - 1) / 2) * 0.18;
          const c = Math.cos(spread), sn = Math.sin(spread);
          const dir = new Vec2(base.x * c - base.y * sn, base.x * sn + base.y * c);
          this._euclidNeedles.push({ pos: gr.clone(), dir, prev: gr.clone(),
            dmg: 12 + 3 * this._cardLvl('euclid_corrosive_spread'), pierceLeft: pierce, hit: new Set(), t: 0 });
        }
      }
    }
    for (let i = this._euclidNeedles.length - 1; i >= 0; i--) {
      const n = this._euclidNeedles[i];
      n.t += dt;
      n.prev = n.pos.clone();
      n.pos.addMut(n.dir.scale(640 * dt));
      const out = n.pos.x < -60 || n.pos.x > WORLD_W + 60 || n.pos.y < -60 || n.pos.y > WORLD_H + 60;
      if (out || n.t > 2.2) { this._euclidNeedles.splice(i, 1); continue; }
      let removed = false;
      for (const e of cand) {
        if (!e?.pos || e.hp <= 0 || n.hit.has(e)) continue;
        if (distance(e.pos, n.pos) > (e.radius || 16) + 8) continue;
        this._euclidDamage(e, n.dmg);
        n.hit.add(e);
        if (this.fusionClouds.length < 12) {                   // small gas puff (reuses bounded cloud cap)
          this.fusionClouds.push({ x: e.pos.x, y: e.pos.y, t: 0, life: 1.6, fid: 'viral', dmgCd: 0.4 });
          this.audio?.playToxicGas?.();   // gas cloud spawn sound (throttled)
        }
        n.pierceLeft -= 1;
        if (n.pierceLeft <= 0) { this._euclidNeedles.splice(i, 1); removed = true; break; }
      }
      if (removed) continue;
    }
  }

  _drawEuclidAutoWeapons(ctx) {
    ctx.save();
    // Floating guns (compact ~18px) — a clear toxic-pistol silhouette: body + barrel + grip + energy
    // cell + muzzle, oriented toward the aim so shots read as coming from the barrel (not a blob).
    for (const g of (this._euclidGuns || [])) {
      ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(g.ang);
      ctx.fillStyle = '#3a2e28'; ctx.fillRect(-5, 2, 4, 6);            // grip (angled down-back)
      ctx.fillStyle = '#566372'; ctx.fillRect(-7, -3, 12, 6);          // slide/body
      ctx.fillStyle = '#3a4654'; ctx.fillRect(-7, -3, 12, 2);          // top rail
      ctx.fillStyle = '#2a323c'; ctx.fillRect(5, -1.5, 7, 3);          // barrel
      ctx.fillStyle = '#9fb0c0'; ctx.fillRect(11.5, -1.5, 1.5, 3);     // muzzle tip
      ctx.fillStyle = '#7CFF4D'; ctx.fillRect(-3, -1.5, 4, 3);         // toxic energy cell
      ctx.strokeStyle = '#caffae'; ctx.lineWidth = 0.8; ctx.strokeRect(-7, -3, 12, 6);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5;   // small muzzle glow at the tip
      ctx.fillStyle = '#7CFF4D'; ctx.beginPath(); ctx.arc(13, 0, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'lighter';
    // Toxin Vector Bolts — glowing green/cyan orb + bounce trail
    for (const b of this._euclidBolts) {
      ctx.globalAlpha = 0.45; ctx.strokeStyle = '#7CFF4D'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(b.prev.x, b.prev.y); ctx.lineTo(b.pos.x, b.pos.y); ctx.stroke();
      ctx.globalAlpha = 1; ctx.fillStyle = '#caffae';
      ctx.beginPath(); ctx.arc(b.pos.x, b.pos.y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.5; ctx.strokeStyle = '#46e6ff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(b.pos.x, b.pos.y, 8, 0, Math.PI * 2); ctx.stroke();
    }
    // Viral Gas Needles — sharp toxic shard (triangle) + trail
    for (const n of this._euclidNeedles) {
      const ang = Math.atan2(n.dir.y, n.dir.x);
      ctx.globalAlpha = 0.35; ctx.strokeStyle = '#7CFF4D'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(n.prev.x, n.prev.y); ctx.lineTo(n.pos.x, n.pos.y); ctx.stroke();
      ctx.save(); ctx.translate(n.pos.x, n.pos.y); ctx.rotate(ang);
      ctx.globalAlpha = 1; ctx.fillStyle = '#aaff7f';
      ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-5, 4); ctx.lineTo(-5, -4); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.shadowBlur = 0; ctx.filter = 'none';
  }

  // Euclid SPACE ultimate — Plague Trail Dash (mana-gated; Vector Overdose trims the cost). The kit's
  // own global SPACE listener was removed in _ensureEuclidKit, so this is the only trigger path.
  activateEuclidPlague() {
    if (this.gameState !== 'playing' || this.paused || this.gameOver || this.victory || this.upgradeUI || this.mutationUI) return;
    const p = this.player;
    if (p.selectedCharacter !== 'euclid_vector') return;
    this._ensureEuclidKit();
    if (!this._euclidPlague) return;
    const cost = Math.max(60, ULTIMATE_MANA_COST - 12 * (p.upgrades['euclid_vector_overdose'] || 0));
    if (p.mana < cost) { this.floatingTexts.push(new FloatingText('NOT ENOUGH MANA', p.pos.clone(), '#00ff66', 1.0)); return; }
    this._euclidPlayer.x = p.pos.x; this._euclidPlayer.y = p.pos.y;
    this._euclidPlague.dashSpeed    = EUCLID_DASH_SPEED;    // tunable — faster lunge
    this._euclidPlague.dashDuration = EUCLID_DASH_DURATION; // tunable — longer lunge
    this._euclidPlague.trigger();
    p.mana -= cost;
    this.screenShake.trigger(5, 0.25);
    this.floatingTexts.push(new FloatingText('PLAGUE TRAIL!', p.pos.clone(), '#00ff66', 1.2));
  }

  // ── Thunder Solo ultimate (Cyber Skeleton Warrior, SPACE, 100 mana) ──────────
  activateThunderSolo() {
    if (this.gameState !== 'playing' || this.paused || this.gameOver || this.victory || this.upgradeUI) return;
    const p = this.player;
    if (p.selectedCharacter !== 'skeleton_warrior') return;  // only this character has an ultimate
    if (this.thunderSolo) return;                            // already running
    if (p.mana < ULTIMATE_MANA_COST) {
      this.floatingTexts.push(new FloatingText('NOT ENOUGH MANA', p.pos.clone(), CYAN, 1.0));
      return;
    }
    p.mana -= ULTIMATE_MANA_COST;                            // fixed 100 cost; Mana Core overflow banks toward next cast
    this.thunderSolo = { phase: 'windup', t: 0, totalT: 0, strikeTimer: 0, bolts: [],
                         notes: [], noteTimer: 0,
                         miniDmgThisSec: 0, megaDmgThisSec: 0, bossDmgTimer: 1.0 };
    this.screenShake.trigger(4, 0.2);
    this.floatingTexts.push(new FloatingText('THUNDER SOLO!', p.pos.clone(), CYAN, 1.4));
  }

  // ── Overheated Heavy Chains ultimate (Cyber Arm Hero, SPACE, 100 mana) ───────
  // Heavy fiery chains rotate around the hero for 7s, burning crowds and bosses (capped).
  // The cyber arm overheats, costing the player up to 10% max HP gradually (never lethal).
  activateOverheatedChains() {
    if (this.gameState !== 'playing' || this.paused || this.gameOver || this.victory || this.upgradeUI) return;
    const p = this.player;
    if (p.selectedCharacter !== 'cyber_arm_hero') return;   // Cyber Arm Hero only
    if (this.overChains) return;                            // already running
    if (p.mana < ULTIMATE_MANA_COST) {                      // same NOT-ENOUGH-MANA behavior as Thunder Solo
      this.floatingTexts.push(new FloatingText('NOT ENOUGH MANA', p.pos.clone(), ORANGE, 1.0));
      return;
    }
    p.mana -= ULTIMATE_MANA_COST;                           // fixed 100 cost; Mana Core overflow banks toward next cast
    this.overChains = { t: 0, angle: 0, dmgTimer: 0,
                        miniDmgThisSec: 0, megaDmgThisSec: 0, bossDmgTimer: 1.0,
                        drops: [], dropTimer: 0 };           // visual-only: falling chain-rain segments
    this.screenShake.trigger(5, 0.3);
    this.audio?.playEventWarning?.();
    this.floatingTexts.push(new FloatingText('OVERHEATED HEAVY CHAINS!', p.pos.clone(), ORANGE, 1.4));
  }

  _updateOverheatedChains(dt) {
    const oc = this.overChains;
    if (!oc) return;
    const p = this.player;
    const DURATION = 7, RADIUS = 155 * (1 + 0.12 * this._cardLvl('cyber_heavy_chains_mastery'));
    const TICK = 0.25, NORMAL_DMG = 12, KNOCK = 90;   // 48 DPS to normal enemies + small knockback
    const MINI_CAP = 32, MAIN_CAP = 48;               // per-second boss caps (≈47% / ≈45% over 7s)

    oc.t     += dt;
    oc.angle += dt * 3.4;        // (kept for any timing use; visual is now chain-rain, not a cyclone)

    // ── Chain Rain (visual only) — heavy overheated chains fall around the hero. Spawned to
    // random ground points within the damage RADIUS so the rain reads as "striking around me".
    oc.dropTimer -= dt;
    if (oc.t < DURATION - 0.4 && oc.dropTimer <= 0) {
      oc.dropTimer = 0.07;
      const n = 1 + (Math.random() < 0.7 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const ang = Math.random() * Math.PI * 2;
        const rr  = Math.sqrt(Math.random()) * RADIUS;
        oc.drops.push({
          x: p.pos.x + Math.cos(ang) * rr,
          ty: p.pos.y + Math.sin(ang) * rr * 0.85,   // slight vertical squash → ground-plane feel
          t: 0, fall: randomRange(0.26, 0.4), len: randomRange(40, 70),
        });
      }
    }
    for (const d of oc.drops) d.t += dt;
    oc.drops = oc.drops.filter(d => d.t < d.fall + 0.28);   // fall time + brief impact linger

    // Gradual cyber-arm overheat self-damage: 10% maxHp over the duration, never lethal (floor 1 HP)
    const selfRate = (0.10 * p.maxHp) / DURATION;
    p.hp = Math.max(1, p.hp - selfRate * dt);

    // Per-second boss-damage budget reset (keeps bosses controlled / unbreakable)
    oc.bossDmgTimer -= dt;
    if (oc.bossDmgTimer <= 0) { oc.bossDmgTimer = 1.0; oc.miniDmgThisSec = 0; oc.megaDmgThisSec = 0; }

    // Repeating burn ticks
    oc.dmgTimer -= dt;
    if (oc.dmgTimer <= 0) {
      oc.dmgTimer = TICK;

      const bossHit = (isMega) => {
        const cap  = isMega ? MAIN_CAP : MINI_CAP;
        const used = isMega ? oc.megaDmgThisSec : oc.miniDmgThisSec;
        const dmg  = Math.min(cap * TICK, cap - used);   // this tick's slice, clamped to the per-sec cap
        if (dmg <= 0) return 0;
        if (isMega) oc.megaDmgThisSec += dmg; else oc.miniDmgThisSec += dmg;
        return dmg;
      };

      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i];
        if (distance(e.pos, p.pos) > RADIUS + e.radius) continue;
        if (e.isMegaBoss) {
          const d = bossHit(true);  if (d > 0) e.takeHit(this._resistDot(e, d), this);
        } else if (e.isBoss()) {
          const d = bossHit(false); if (d > 0) e.takeHit(this._resistDot(e, d), this);
        } else {
          e.takeHit(NORMAL_DMG, this);
          e.vel.addMut(safeNormalize(e.pos.sub(p.pos)).scale(KNOCK));   // small knockback
          if (Math.random() < 0.35) this.particles.spawnHitSparks(e.pos, ORANGE);  // burn sparks (throttled)
        }
      }

      // Singleton mini-bosses share the mini budget (reduced, controlled)
      const hitSingle = (b, die) => {
        if (!b || b.hp <= 0 || distance(b.pos, p.pos) > RADIUS + b.radius) return;
        const d = bossHit(false); if (d <= 0) return;
        b.hp -= this._resistDot(b, d); b.hitFlash = 0.08;
        if (b.hp <= 0) die.call(this);
      };
      hitSingle(this.titanBoss,        this._titanDie);
      hitSingle(this.annihilatorBoss,  this._annihilatorDie);
      hitSingle(this.bloodfangBoss,    this._bloodfangDie);
      hitSingle(this.cyberSerpentBoss, this._cyberSerpentDie);
      hitSingle(this.cyberDragonBoss,  this._cyberDragonDie);
      if (this.doubleDemonsBoss && this.doubleDemonsBoss.hp > 0) {
        const _dd = this.doubleDemonsBoss;
        for (const _body of [_dd.gunner, _dd.claw]) {
          if (distance(_body.pos, p.pos) <= RADIUS + _body.radius) {
            const _d = bossHit(false); if (_d > 0) {
              _dd.hp -= this._resistDot(_dd, _d); _body.hitFlash = 0.08;
              if (_dd.hp <= 0) { this._doubleDemonsDie(); break; }
            }
          }
        }
      }
    }

    if (oc.t >= DURATION) this.overChains = null;
  }

  // World-space: OVERHEATED CHAIN RAIN — heavy chains fall vertically and strike around the hero.
  // No cyclone/tornado; the hero stays fully visible (chains land around, not over, the player).
  _drawOverheatedChains(ctx) {
    const oc = this.overChains;
    if (!oc) return;
    const p = this.player;
    const RADIUS = 155 * (1 + 0.12 * this._cardLvl('cyber_heavy_chains_mastery')), DURATION = 7;
    const a = Math.max(0, Math.min(oc.t / 0.3, (DURATION - oc.t) / 0.5, 1));   // fade in/out

    // Low hot-floor glow marking the strike zone (subtle, additive — not a giant cloud)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(p.pos.x, p.pos.y, RADIUS * 0.25, p.pos.x, p.pos.y, RADIUS);
    g.addColorStop(0,   'rgba(255,80,20,'  + (0.12 * a) + ')');
    g.addColorStop(1,   'rgba(255,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(p.pos.x, p.pos.y, RADIUS, RADIUS * 0.85, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    const FALL = 150;                       // how far above the target a chain starts
    ctx.save();
    ctx.lineCap = 'round';
    for (const d of oc.drops) {
      const falling = d.t < d.fall;
      const prog    = falling ? d.t / d.fall : 1;          // 0→1 descent
      const bottomY = d.ty - FALL * (1 - prog);            // chain bottom reaches d.ty on impact
      const topY    = bottomY - d.len;
      const fade    = a * (falling ? 1 : Math.max(0, 1 - (d.t - d.fall) / 0.28));

      // The chain: a hot core line + a brighter inner line + round "links" along it (mechanical/heavy)
      ctx.globalAlpha = 0.9 * fade;
      ctx.strokeStyle = '#ff5a14'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(d.x, topY); ctx.lineTo(d.x, bottomY); ctx.stroke();
      ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(d.x, topY); ctx.lineTo(d.x, bottomY); ctx.stroke();
      ctx.fillStyle = '#ffae3c';
      for (let ly = topY; ly <= bottomY; ly += 9) {
        ctx.beginPath(); ctx.ellipse(d.x, ly, 3.2, 2.2, 0, 0, Math.PI * 2); ctx.fill();
      }

      // Impact burst at the strike point once landed
      if (!falling) {
        const k = (d.t - d.fall) / 0.28;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = fade;
        drawGlow(ctx, d.x, d.ty, 10 + 16 * k, '#ff8a2a', 0.7 * (1 - k));
        ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(d.x, d.ty, 6 + 14 * k, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();
  }

  _updateThunderSolo(dt) {
    const ts = this.thunderSolo;
    if (!ts) return;
    const WINDUP = 0.6, STORM = 6.0, FADE = 0.4;   // ~7s total ultimate (was 20s storm)
    ts.t += dt;
    ts.totalT += dt;   // total elapsed across all phases (drives the ~7s guitar)

    // Advance strikes; damage + impact FX fire exactly when each bolt LANDS so enemies are
    // visibly struck before they die (no more vanishing ahead of the visible impact).
    for (const b of ts.bolts) {
      b.t += dt;
      if (!b.struck && b.t >= b.windup) { b.struck = true; this._strikeImpact(b); }
    }
    ts.bolts = ts.bolts.filter(b => b.t < b.maxLife);

    // Drift musical notes upward with a gentle sway, then fade out
    for (const n of ts.notes) {
      n.life -= dt;
      n.y    -= n.vy * dt;
      n.x    += Math.sin(n.life * n.swaySpd + n.swayPhase) * n.sway * dt;
      n.rot  += n.spin * dt;
    }
    ts.notes = ts.notes.filter(n => n.life > 0);

    // Ambient notes stream up from around the skeleton/guitar for the whole cast — "musical thunder"
    if (ts.phase !== 'fade') {
      ts.noteTimer -= dt;
      if (ts.noteTimer <= 0) {
        ts.noteTimer = randomRange(0.15, 0.26);   // a touch more frequent for stronger musical identity
        const p = this.player;
        this._spawnThunderNote(p.pos.x + randomRange(-42, 42), p.pos.y - randomRange(14, 54));
      }
    }

    if (ts.phase === 'windup') {
      if (ts.t >= WINDUP) { ts.phase = 'storm'; ts.t = 0; }
      return;
    }

    if (ts.phase === 'storm') {
      // Per-second boss-damage budget reset (keeps bosses alive through the long storm)
      ts.bossDmgTimer -= dt;
      if (ts.bossDmgTimer <= 0) { ts.bossDmgTimer = 1.0; ts.miniDmgThisSec = 0; ts.megaDmgThisSec = 0; }

      ts.strikeTimer -= dt;
      if (ts.strikeTimer <= 0) {
        ts.strikeTimer = 0.15;   // rapid waves of strikes — heavy thunder rain
        this._spawnThunderWave();
      }
      if (ts.t >= STORM) { ts.phase = 'fade'; ts.t = 0; }
      return;
    }

    // fade
    if (ts.t >= FADE) this.thunderSolo = null;
  }

  // A floating musical-note glyph (cyan energy accent) that drifts up and fades
  _spawnThunderNote(x, y) {
    const ts = this.thunderSolo;
    if (!ts) return;
    const glyph = (Math.random() * THUNDER_NOTES.length) | 0;
    ts.notes.push({
      x, y, glyph,
      size: randomRange(24, 38),
      life: randomRange(1.0, 1.5), maxLife: 1.5,
      vy: randomRange(26, 46),
      sway: randomRange(14, 30), swaySpd: randomRange(5, 9), swayPhase: Math.random() * 6.28,
      rot: randomRange(-0.2, 0.2), spin: randomRange(-1.2, 1.2),
    });
  }

  // One wave of several strikes — re-scans the live battlefield each time so enemies that
  // spawn DURING the 20s storm are hunted too (the rain never runs out of targets).
  _spawnThunderWave() {
    const n = this.enemies.length;
    // 2 strikes baseline, scaling with crowd size, capped for readability + performance
    const strikes = Math.max(2, Math.min(4, 2 + Math.floor(n / 12)));
    for (let i = 0; i < strikes; i++) {
      const t = this._pickStrikeTarget();
      if (t) this._spawnThunderStrike(t.x, t.y);
    }
  }

  // Priority targeting: clusters / close enemies / core-carriers / bosses, random only as fallback
  _pickStrikeTarget() {
    const p = this.player;
    const enemies = this.enemies;
    const bosses = [this.titanBoss, this.annihilatorBoss, this.bloodfangBoss].filter(b => b && b.hp > 0);
    if (this.doubleDemonsBoss && this.doubleDemonsBoss.hp > 0) {
      bosses.push(this.doubleDemonsBoss.gunner, this.doubleDemonsBoss.claw);
    }

    // occasionally pressure a boss
    if (bosses.length && Math.random() < 0.12) {
      const b = bosses[(Math.random() * bosses.length) | 0];
      return { x: b.pos.x + randomRange(-18, 18), y: b.pos.y + randomRange(-18, 18) };
    }
    if (enemies.length === 0) {
      if (bosses.length) { const b = bosses[(Math.random() * bosses.length) | 0]; return { x: b.pos.x, y: b.pos.y }; }
      return { x: this.camera.x + randomRange(40, this._viewW - 40), y: this.camera.y + randomRange(60, this._viewH - 40) };
    }
    // NEAREST enemies to the player: sort by distance, pick among the closest few
    const near = enemies.map(e => ({ e, d: distance(e.pos, p.pos) }))
                        .sort((a, b) => a.d - b.d)
                        .slice(0, Math.min(5, enemies.length));
    const pick = near[(Math.random() * Math.min(near.length, 3)) | 0] || near[0];
    const e = pick.e;
    return { x: e.pos.x + randomRange(-10, 10), y: e.pos.y + randomRange(-10, 10) };
  }

  // Create a single falling bolt with a short wind-up; damage is applied later, on impact.
  _spawnThunderStrike(tx, ty) {
    const ts = this.thunderSolo;
    if (!ts) return;
    const variant = (Math.random() * THUNDER_STRIKES.length) | 0;
    const scale   = randomRange(0.85, 1.15);
    const windup  = randomRange(0.10, 0.16);   // brief telegraph so the bolt is seen landing
    ts.bolts.push({ x: tx, y: ty, variant, scale, t: 0, windup, struck: false,
                    life: windup + 0.34, maxLife: windup + 0.34 });
  }

  // Fired the instant a bolt lands: ground ring, sparks, shake, a note, then the AoE damage.
  _strikeImpact(b) {
    const pos = new Vec2(b.x, b.y);
    const tm  = this._cardLvl('skeleton_thunder_solo_mastery');
    this._specialRings.push({ pos: pos.clone(), radius: 0, maxRadius: 82 * (1 + 0.16 * tm),
                               life: 0.4, maxLife: 0.4, color1: CYAN, color2: '#ffffff' });
    if (tm > 0) this._specialRings.push({ pos: pos.clone(), radius: 0, maxRadius: 120 * (1 + 0.16 * tm),
                               life: 0.5, maxLife: 0.5, color1: '#bfe6ff', color2: CYAN });   // extra storm pulse
    this.particles.spawnHitSparks(pos, CYAN);
    if (Math.random() < 0.16) this._spawnThunderNote(b.x + randomRange(-12, 12), b.y - randomRange(8, 24));
    if (Math.random() < 0.25) this.screenShake.trigger(3, 0.08);
    this._applyStrikeDamage(b.x, b.y);
  }

  _applyStrikeDamage(tx, ty) {
    const ts = this.thunderSolo;
    if (!ts) return;
    const MINI_DPS_CAP = 45, MEGA_DPS_CAP = 25;
    const FREEZE = 1.2;   // seconds normal enemies stay frozen by a lightning note (tunable)
    const bossHit = (perStrike, isMega) => {
      const used = isMega ? ts.megaDmgThisSec : ts.miniDmgThisSec;
      const budget = (isMega ? MEGA_DPS_CAP : MINI_DPS_CAP) - used;
      if (budget <= 0) return 0;
      const dmg = Math.min(perStrike, budget);
      if (isMega) ts.megaDmgThisSec += dmg; else ts.miniDmgThisSec += dmg;
      return dmg;
    };
    const R = 110 * (1 + 0.12 * this._cardLvl('skeleton_thunder_solo_mastery'));
    const at = new Vec2(tx, ty);
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (distance(e.pos, at) < R + e.radius) {
        if (e.isBoss() || e.isMegaBoss) {
          const dmg = bossHit(16, e.isMegaBoss);
          if (dmg > 0) e.takeHit(dmg, this);
          e.stunned = Math.max(e.stunned || 0, 0.4);      // bosses: brief safe interrupt
        } else {
          e.takeHit(80, this);
          e.stunned = Math.max(e.stunned || 0, FREEZE);   // normal enemies: FROZEN
        }
      }
    }
    const hitBoss = (boss, die) => {
      if (boss && boss.hp > 0 && distance(boss.pos, at) < R + boss.radius) {
        const dmg = bossHit(16, false);
        if (dmg <= 0) return;
        boss.hp -= dmg; boss.hitFlash = 0.08;
        boss.stunned = Math.max(boss.stunned || 0, 0.4);
        if (boss.hp <= 0) die.call(this);
      }
    };
    hitBoss(this.titanBoss, this._titanDie);
    hitBoss(this.annihilatorBoss, this._annihilatorDie);
    hitBoss(this.bloodfangBoss, this._bloodfangDie);
    hitBoss(this.cyberSerpentBoss, this._cyberSerpentDie);
    hitBoss(this.cyberDragonBoss,  this._cyberDragonDie);
    if (this.doubleDemonsBoss && this.doubleDemonsBoss.hp > 0) {
      const _dd = this.doubleDemonsBoss;
      for (const _body of [_dd.gunner, _dd.claw]) {
        if (distance(_body.pos, at) < R + _body.radius) {
          const _dmg = bossHit(16, false); if (_dmg <= 0) continue;
          _dd.hp -= _dmg; _body.hitFlash = 0.08;
          _body.stunned = Math.max(_body.stunned || 0, 0.4);
          if (_dd.hp <= 0) { this._doubleDemonsDie(); break; }
        }
      }
    }

    // shattered-note burst at the impact
    for (let k = 0; k < 2; k++) this._spawnThunderNote(tx + randomRange(-14, 14), ty - randomRange(4, 18));
  }

  // Guitar FX — drawn just BEFORE the player so the skeleton renders on top (source behind it)
  _drawThunderSoloGuitar(ctx) {
    const ts = this.thunderSolo;
    if (!ts) return;
    const p = this.player;
    const gt = ts.totalT;
    if (gt >= 7.0) return;
    let guitarAlpha = (gt < 0.2) ? gt / 0.2 : (gt < 6.5) ? 1 : 1 - (gt - 6.5) / 0.5;
    guitarAlpha *= 0.9 + 0.1 * Math.sin(gt * 6);
    if (guitarAlpha <= 0) return;

    // cyan aura behind the skeleton while it "plays"
    drawGlow(ctx, p.pos.x, p.pos.y - 8, 44, CYAN, 0.16 + 0.12 * Math.abs(Math.sin(gt * 9)));

    const cx = p.pos.x + 10, cy = p.pos.y - 26;
    const spr = this._thunderGuitarSprite;
    const haveSpr = spr && spr.complete && spr.naturalWidth > 0;
    const strum = Math.max(0, 1 - (ts.strikeTimer / 0.15));   // flashes right after each strike wave

    ctx.save();
    ctx.globalAlpha = guitarAlpha;
    if (haveSpr) {
      const gh = 58, gw = Math.round(spr.naturalWidth * (gh / spr.naturalHeight));
      drawGlow(ctx, cx, cy, 30, '#bfefff', 0.45 * guitarAlpha);
      drawGlow(ctx, cx, cy, 40, CYAN, 0.30 * guitarAlpha);
      ctx.drawImage(spr, Math.round(cx - gw / 2), Math.round(cy - gh / 2), gw, gh);
    } else {
      // ── vector neon ELECTRIC GUITAR ──
      ctx.translate(cx, cy);
      ctx.rotate(-0.5);
      const S = 26;
      drawGlow(ctx, 0, S * 0.2, S * 1.2, CYAN, (0.35 + 0.25 * strum) * guitarAlpha);
      ctx.lineJoin = 'round';
      // body (two bouts)
      ctx.fillStyle = '#06223a'; ctx.strokeStyle = CYAN; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, S * 0.5, S * 0.64, S * 0.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(-S * 0.05, S * 0.05, S * 0.5, S * 0.42, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      // pickups / bridge (flash on strum)
      ctx.fillStyle = '#0a3a5c'; ctx.fillRect(-S * 0.16, S * 0.12, S * 0.32, S * 0.52);
      ctx.fillStyle = strum > 0.5 ? '#ffffff' : '#3ad0ff';
      ctx.fillRect(-S * 0.16, S * 0.22, S * 0.32, S * 0.06);
      ctx.fillRect(-S * 0.16, S * 0.46, S * 0.32, S * 0.06);
      // neck + headstock
      ctx.fillStyle = '#08283f'; ctx.strokeStyle = CYAN; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.rect(-S * 0.12, -S * 1.5, S * 0.24, S * 1.55); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#06223a';
      ctx.beginPath(); ctx.rect(-S * 0.20, -S * 1.80, S * 0.40, S * 0.30); ctx.fill(); ctx.stroke();
      // glowing strings (brighter on strum)
      ctx.strokeStyle = `rgba(191,239,255,${0.55 + 0.45 * strum})`; ctx.lineWidth = 1;
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * S * 0.07, S * 0.6); ctx.lineTo(i * S * 0.07, -S * 1.72); ctx.stroke(); }
    }
    ctx.restore();
  }

  // World-space rain FX (called inside the camera block, after entities) — sliced strike sprites + notes
  _drawThunderSoloWorld(ctx) {
    const ts = this.thunderSolo;
    if (!ts) return;
    const sheet = this._lightningRainSprite;
    const haveSheet = sheet && sheet.complete && sheet.naturalWidth > 0;
    const time = performance.now() * 0.001;

    // glowing musical-note glyph (used as the lightning note + fallback notes)
    const noteGlyph = (nx, ny, s, al) => {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = al;
      const g = ctx.createRadialGradient(nx, ny, 0, nx, ny, s * 1.1);
      g.addColorStop(0, `rgba(191,239,255,${al})`); g.addColorStop(1, 'rgba(58,208,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(nx, ny, s * 1.1, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#eaffff';
      ctx.beginPath(); ctx.ellipse(nx - s * 0.18, ny + s * 0.28, s * 0.30, s * 0.22, -0.3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#bfefff'; ctx.lineWidth = Math.max(1.5, s * 0.13);
      ctx.beginPath(); ctx.moveTo(nx + s * 0.08, ny + s * 0.22); ctx.lineTo(nx + s * 0.08, ny - s * 0.55); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(nx + s * 0.08, ny - s * 0.55); ctx.lineTo(nx + s * 0.42, ny - s * 0.40); ctx.stroke();
      ctx.restore();
    };

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const b of ts.bolts) {
      const impactFrac = b.windup / b.maxLife;
      const prog = b.t / b.maxLife;
      const sc = b.scale || 1;
      const H = 150 * sc, topY = b.y - H, topX = b.x + Math.sin((b.x + time) * 1.3) * 16;
      let alpha, fade = 0;
      if (prog < impactFrac) alpha = 0.35 + 0.5 * (prog / impactFrac);
      else { fade = Math.max(0, 1 - (prog - impactFrac) / (1 - impactFrac)); alpha = fade; }
      if (alpha <= 0) continue;

      // the lightning bolt (sprite slice if present, else procedural)
      if (haveSheet) {
        const S = THUNDER_STRIKES[b.variant];
        const dh = 132 * sc, dw = dh * (S.sw / S.sh);
        ctx.globalAlpha = 0.9 * alpha;
        ctx.drawImage(sheet, S.sx, S.sy, S.sw, S.sh, Math.round(b.x - dw * S.ax), Math.round(b.y - dh * S.ay), Math.round(dw), Math.round(dh));
      } else {
        if (!b._segs) { b._segN = 9; b._segs = []; for (let i = 0; i <= b._segN; i++) b._segs.push(Math.random() - 0.5); }
        const N = b._segN, pts = [];
        for (let i = 0; i <= N; i++) {
          const f = i / N, env = Math.sin(Math.PI * f * 0.5 + 0.2);
          const jit = (b._segs[i] * 26 + Math.sin(time * 30 + i) * 5 * (prog < impactFrac ? 0.4 : 1)) * env;
          pts.push({ x: topX + (b.x - topX) * f + jit, y: topY + (b.y - topY) * f });
        }
        const strokeBolt = (w, col, al) => {
          ctx.globalAlpha = al * alpha; ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
          ctx.stroke();
        };
        strokeBolt(9 * sc, '#1f6bff', 0.35); strokeBolt(4.5, '#3ad0ff', 0.8); strokeBolt(1.8, '#ffffff', 1);
      }

      // the LIGHTNING NOTE riding the bolt: travels down while falling, shatters on impact
      if (prog < impactFrac) {
        const f = prog / impactFrac;
        noteGlyph(b.x, topY + (b.y - topY) * f, 14 * sc, alpha);
      } else {
        noteGlyph(b.x, b.y, 14 * sc * (1 + 0.6 * (1 - fade)), fade);   // shatter (grows + fades)
      }

      // impact: white flash + FREEZE ring + frost spikes + sparks
      if (b.struck && fade > 0) {
        ctx.globalAlpha = fade; ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(b.x, b.y, 4 * fade + 2, 0, Math.PI * 2); ctx.fill();
        const fr = (1 - fade) * 44 * sc + 8;
        ctx.globalAlpha = 0.85 * fade; ctx.strokeStyle = '#cfeeff'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(b.x, b.y, fr, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = '#9fe6ff'; ctx.lineWidth = 1.5;
        for (let s = 0; s < 8; s++) {
          const a2 = (s / 8) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(b.x + Math.cos(a2) * fr * 0.7, b.y + Math.sin(a2) * fr * 0.7 * 0.6);
          ctx.lineTo(b.x + Math.cos(a2) * fr, b.y + Math.sin(a2) * fr * 0.6);
          ctx.stroke();
        }
      }
    }
    ctx.restore();

    // ground halo after landing
    for (const b of ts.bolts) {
      if (!b.struck) continue;
      const impactFrac = b.windup / b.maxLife;
      const fade = Math.max(0, 1 - (b.t / b.maxLife - impactFrac) / (1 - impactFrac));
      drawGlow(ctx, b.x, b.y, 8 + 22 * fade, CYAN, 0.55 * fade);
    }

    // drifting notes (sprite if available, else the glowing glyph)
    for (const n of ts.notes) {
      const a = Math.max(0, Math.min(1, Math.min(1, n.life / 0.4) * (n.life / n.maxLife + 0.15)));
      if (a <= 0) continue;
      if (haveSheet) {
        const N = THUNDER_NOTES[n.glyph], nh = n.size, nw = nh * (N.sw / N.sh);
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.95 * a;
        ctx.translate(n.x, n.y); ctx.rotate(n.rot);
        ctx.drawImage(sheet, N.sx, N.sy, N.sw, N.sh, -nw / 2, -nh / 2, nw, nh);
        ctx.restore();
      } else {
        noteGlyph(n.x, n.y, n.size * 0.45, 0.9 * a);
      }
    }
  }

  // Screen-space FX (called after the camera restore, before the HUD)
  _drawThunderSoloScreen(ctx) {
    const ts = this.thunderSolo;
    if (!ts) return;
    // Light, brief darken only — keeps gameplay readable (no fullscreen storm overlay)
    let dark = 0;
    if (ts.phase === 'windup')     dark = 0.28 * Math.min(1, ts.t / 0.8);
    else if (ts.phase === 'storm') dark = 0.10;
    else                           dark = 0.10 * Math.max(0, 1 - ts.t / 0.5);
    if (dark > 0) { ctx.fillStyle = `rgba(2,6,16,${dark})`; ctx.fillRect(0, 0, WIDTH, HEIGHT); }
  }

  selectUpgrade(index) {
    if (!this.upgradeUI || index >= this.upgradeUI.choices.length) return;
    this.upgradeUI.choices[index].apply(this.player);
    this.score = (this.score ?? 0) + 50;
    this.upgradeUI = null;
  }

  // Neutral (no-effect) forced-mutation run-state. All multipliers default to 1 so Act 1 and any
  // pre-Endless frame are completely unaffected; only Endless picks push these off 1.
  _freshMutations() {
    return {
      spawnRateMult: 1, pickupRadiusMult: 1, manaGainMult: 1,
      enemyBulletSpeedMult: 1, plasmaOnPlayerChanceBonus: 0, eliteIntervalMult: 1,
      stacks: 0, taken: {},
    };
  }

  // Open the forced 3-card mutation picker (Endless only). The world freezes via the update gate.
  _openMutationChoice() {
    this.mutationUI = new MutationUI(sampleMutations(3, this.mutations));
    this.audio?.playEventWarning?.();
    this.triggerAnnouncement('⚠ FORCED MUTATION', '#ff5a3c');
  }

  // Apply the chosen mutation and resume. No skip path exists — a valid index must be picked.
  selectMutation(index) {
    if (!this.mutationUI) return;
    const choices = this.mutationUI.choices;
    if (index < 0 || index >= choices.length) return;
    const card = choices[index];
    card.apply(this.mutations);
    this.mutations.stacks += 1;
    this.mutations.taken[card.key] = (this.mutations.taken[card.key] || 0) + 1;
    this.mutationUI = null;
  }

  // One free reroll per level-up screen — re-samples the (already useful) card pool.
  rerollUpgrade() {
    if (!this.upgradeUI || this.rerollsLeft <= 0) return;
    const choices = weightedSample(this.player, 3, { meta: this.meta, endless: this.endless, chaos: this._chaosMode });
    if (choices.length === 0) return;
    this.upgradeUI.setChoices(choices);
    this.rerollsLeft--;
    this.rerollAvailable = this.rerollsLeft > 0;   // false once both rerolls are spent
    this.audio?.playLevelUp?.();
  }

  // ─── Main update ──────────────────────────────────────────────────────────

  update(dt, input) {
    if (this.gameState === 'start_menu') {
      this._updateStartMenu(dt, input);
      return;
    }
    if (this.gameState === 'character_select') {
      this._updateCharacterSelect(input);
      return;
    }
    if (this.gameState === 'exit_screen') {
      this._updateExitScreen(input);
      return;
    }
    if (this.gameState === 'upgrades') {
      this._updateUpgradesScreen(input);
      return;
    }
    if (this.gameState === 'achievements') {
      this._updateAchievementsScreen(input);
      return;
    }
    if (this.gameState === 'credits') {
      this._updateCreditsScreen(input);
      return;
    }
    if (this.gameState === 'instructions') {
      this._updateInstructionsScreen(input);
      return;
    }
    if (this.gameState === 'audio_settings') {
      this._updateAudioSettings(input);
      return;
    }
    if (this.gameState === 'settings') {
      this._updateSettings(input);
      return;
    }
    if (this.gameState === 'lore_archive') {
      this._updateLoreArchive(input);
      return;
    }
    if (this.gameState !== 'playing') return;

    // ── Post-Arena NULL decision panel: intercept all input, freeze gameplay ──
    if (this._postArenaChoice) {
      const { keys } = input;
      const _n = 3;
      if (keys.has('arrowup') || keys.has('w')) {
        this._pacIdx = (this._pacIdx - 1 + _n) % _n;
        keys.delete('arrowup'); keys.delete('w');
      }
      if (keys.has('arrowdown') || keys.has('s')) {
        this._pacIdx = (this._pacIdx + 1) % _n;
        keys.delete('arrowdown'); keys.delete('s');
      }
      if (keys.has('enter') || keys.has(' ')) {
        keys.delete('enter'); keys.delete(' ');
        this._selectPostArenaChoice(this._pacIdx);
      }
      if (keys.has('escape')) {
        keys.delete('escape');
        this._selectPostArenaChoice(0);   // ESC = CONTINUE ENDLESS
      }
      return;
    }

    if (this.paused || this.gameOver || this.victory) return;

    // If an upgrade OR forced-mutation card is active, freeze everything but allow UI interaction
    if (this.upgradeUI || this.mutationUI) return;

    // Check for pending level-up. Card PACING: cards no longer appear on EVERY level. Early levels
    // (≤6) still offer one per level for a quick build start; from level 7 on, offers space out to
    // every 2nd level so the full pool spreads across a ~30-min run instead of being exhausted by ~10.
    // Levels that don't hit the schedule are still consumed (no card) — they just don't interrupt play.
    if (this.player.pendingLevelupCount > 0) {
      this.player.pendingLevelupCount--;
      if (this.player.level >= this._nextCardLevel) {
        this._nextCardLevel = this.player.level + (this.player.level >= 6 ? 2 : 1);   // schedule next offer
        const choices = weightedSample(this.player, 3, { meta: this.meta, endless: this.endless, chaos: this._chaosMode });
        if (choices.length > 0) {
          this.audio?.playLevelUp();
          this.upgradeUI = new UpgradeUI(choices);
          this.rerollsLeft     = 2;     // two free rerolls per level-up screen
          this._blacknetCouponUsed = false;
          this.rerollAvailable = true;
          return;
        }
      }
    }

    this.timeAlive += dt;
    this.score += dt;

    // ── Eden Core in-run transmissions (Endless only, safe) ──────────────────
    if (this.endless) this._triggerEdenMilestoneMessages();

    // ── Null Breach Arena ────────────────────────────────────────────────────
    if (this.endless) this._checkNullBreachArena();
    if (this._nullBreachArena) this._updateNullBreachArena(dt);

    // ── Chaos Mode trigger (21:00 Endless) — instant, no glitch transition ──
    if (this.endless && !this._chaosMode) {
      const _chaosEndlessEl = this.timeAlive - this._endlessStartedAt;
      if (_chaosEndlessEl >= 1260 || this.forceChaos) {
        this.forceChaos         = false;
        this._chaosTransTimer   = -1;    // no transition timer
        this._chaosMode         = true;
        this.audio?.startChaosMusic();   // switch to Chaos track
        this.triggerAnnouncement('⚡ CHAOS MODE ⚡', '#ff2d95');
        // Eden Core: chaos reached
        if (this.meta) {
          const cmsg = this._edenPick([
            'CHAOS SIGNAL DETECTED. The boundary has failed.',
            "Eden no longer follows its own laws.",
            'THE SYSTEM BOUNDARY: BREACHED.',
            'Order has become optional. Survive.',
          ]);
          this.meta.addSystemMessage(cmsg);
          this._chaosEdenAwarded = true;
          // In-run popup for Chaos
          this._queueEdenTransmission(cmsg, { title: 'EDEN CORE', priority: 2, duration: 7, clipId: 'chaos' });
        }
        // Rearm all boss slots immediately so they arrive together
        this.titanSpawned       = false; this.titanSpawnTimer       = 0;
        this.annihilatorSpawned = false; this.annihilatorSpawnTimer = 0;
        this.bloodfangSpawned    = false; this.bloodfangSpawnTimer    = 0;
        this.cyberSerpentSpawned = false; this.cyberSerpentSpawnTimer = 0;
        this.cyberDragonSpawned  = false; this.cyberDragonSpawnTimer  = 0;
        this.doubleDemonsSpawned = false; this.doubleDemonsSpawnTimer = 0;
        this._endlessBossTimer  = 5;   // first Chaos boss rotation: 5 s from now
        // Walker: upgrade HP to 2000 if already active when Chaos starts
        if (this._npcWalker && this._npcWalker.isActive && !this._npcWalker.downed) {
          this._npcWalker.maxHp = 2000;
          this._npcWalker.hp    = Math.max(this._npcWalker.hp, Math.round(2000 * 0.5));
        }
        this.acidRainTimer      = 30;  // Phase 4: first acid rain 30 s into Chaos
        this._airstrikeTimer    = 15;  // Phase 4: first airstrike 15 s into Chaos
        this._lightningTimer    = 20;  // Phase 4: first lightning storm 20 s into Chaos
        this._frozenSleetTimer  = 55;  // Phase 4: first Frozen Sleet Storm 55 s into Chaos
      }
    }
    // Chaos Mode: spawn a gold core near the player every ~5 s
    if (this._chaosMode && !this.gameOver && !this.victory) {
      // Chaos ambient particle field — spawn near player, bounded, Chaos-only
      if (this.player && this.player.pos) {
        this._chaosAmbientCd -= dt;
        if (this._chaosAmbientCd <= 0) {
          this._chaosAmbientCd = 0.12;  // spawn ~8 particles/sec
          const _ox = (Math.random() - 0.5) * 320;
          const _oy = (Math.random() - 0.5) * 220;
          this._chaosAmbient.spawn(this.player.pos.x + _ox, this.player.pos.y + _oy);
        }
        this._chaosAmbient.update(dt);
      }
      this._chaosCoreCd -= dt;
      if (this._chaosCoreCd <= 0) {
        this._chaosCoreCd = 5.0;
        const off = new Vec2((Math.random() - 0.5) * 220, (Math.random() - 0.5) * 220);
        this.groundCores.push(new DataCore(this._clampPickupPos(this.player.pos.clone().add(off)), 'gold'));
      }
      // Chaos pylons: bounded danger/buff objects (gameplay: damage + shield/heal)
      this._updateChaosPylons(dt);
    }

    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.comboCount = 0;
    }
    this.screenShake.update(dt);
    // Hit-stop overlay timers
    if (this._hitFlashOverlayTimer > 0) this._hitFlashOverlayTimer = Math.max(0, this._hitFlashOverlayTimer - dt);
    if (this._hitFlashOverlayCd    > 0) this._hitFlashOverlayCd    = Math.max(0, this._hitFlashOverlayCd    - dt);

    if (!this.endless && this.timeAlive >= ACT1_WIN_SECONDS) {
      this.victory            = true;
      this._endScreenBtnIndex = 0;   // controller nav: start on first button
      this.finalMessage = 'CITY GRID STABILIZED — VICTORY';
      // Persist the secret unlocks revealed on the Victory screen.
      this.meta?.unlockMany([
        'log_1985', 'log_1983',
        'golden_skeleton_warrior', 'dark_cyber_arm_hero', 'grandmaster_dojang_girl',
      ]);
      this.audio?.stopAll();
      this._grantRewards();
      return;
    }

    // Frozen Sleet Storm: disable player movement + dash during the hold phase
    const _sleetFrozen = !!(this._frozenSleet && this._frozenSleet.phase === 'hold');
    const _frozenInput = _sleetFrozen ? { ...input, keys: new Set() } : input;
    this.player.update(dt, _frozenInput);
    // Freeze enemies during hold phase (fairness)
    if (_sleetFrozen) {
      for (const e of this.enemies) {
        if (e?.pos && e.hp > 0) e.velocity = e.velocity || new Vec2(0, 0);  // prevent movement
      }
      // Freeze enemy projectiles
      for (const proj of this.enemyBullets) {
        if (proj?.velocity) proj.velocity.x = 0;
        if (proj?.velocity) proj.velocity.y = 0;
      }
    }
    // Dash SFX — fire once on the frame a dash begins (rising edge of dashTimer).
    const dashing = this.player.dashTimer > 0;
    if (dashing && !this._wasDashing) this.audio?.playDash();
    this._wasDashing = dashing;
    this._handleAutoShooting();
    this._handleCorePickupAndSlotting(dt);
    this._updateProjectiles(dt);
    this._updateHomingDiscs(dt);
    this._updateChainLightning(dt);
    this._updateNeonPierceBeam(dt);
    this._updateAquaTrail(dt);
    this._updateSpiritKicks(dt);
    this._updateNexusChakram(dt);   // Brawler primary (guards on character)
    this._updateCrescentClaw(dt);   // Brawler secondary
    this._updateSkyfall(dt);        // Brawler ultimate
    this._updateShuriken(dt);       // Assassin bounce weapon (guards on character)
    this._updateChromePhantom(dt);  // Assassin ultimate
    this._updatePhasewalkerFx(dt);  // Japan Phasewalker kit (guards on character)
    this._updateOniFx(dt);          // Oni Protocol 0 (guards on character)
    this._updateEuclidKit(dt);      // Euclid Vector toxin kit (guards on character)
    this._updateEnemies(dt);
    this._updateOverload(dt);
    this._updateSpawning(dt);
    this._updateEliteWaves(dt);
    this._updateCoreEconomy(dt);
    this._updateFloatingTexts(dt);
    this._updateEffects(dt);
    this._updateSpecialEffects(dt);
    this._updateIceFields(dt);        // Crystal Ice Field (Taekwondo ultimate)
    this._updateThunderSolo(dt);
    this._updateOverheatedChains(dt);
    this._updateSpiritDojang(dt);
    this._updateCyberBikeRush(dt);
    this._checkPlayerEnemyCollisions(dt);
    this._updateEnemyBullets(dt);
    this._updateAbilityTimers(dt);
    this._updateQuantumOverhaul(dt);
    this._updateAcidRain(dt);
    this._updateFrozenSleet(dt);          // Chaos Mode: Frozen Sleet Storm
    this._updateEndlessBossRotation(dt);   // Endless-only: repeating miniboss/boss pressure
    this._updateTitan(dt);
    this._updateAnnihilator(dt);
    this._updateBloodfang(dt);
    this._updateCyberSerpent(dt);
    this._updateCyberDragon(dt);
    this._updateDoubleDemonsBoss(dt);
    this._updateBossAttacks(dt);
    this._updateBossTrails(dt);
    this._updateEndlessHazards(dt);   // Endless-only: airstrike ships/rockets + lightning storm
    this._updateSynergyMarks(dt);     // character synergy mark/burst lifetimes (inert without card)
    this.elementFx.update(dt);        // elemental VFX lifetimes (bounded, auto-expire)
    this._updateStormExecution(dt);   // Storm Execution reward (normal-enemy-only zaps)
    this._updateFusionClouds(dt);     // Phase-2 fusion gas clouds (bounded, auto-expire)
    this._updateUltInfusion(dt);      // Forbidden Ultimate Infusion element nova on ult cast
    this._activeElement = CHARACTER_ELEMENT[this.player.selectedCharacter] || null;   // HUD indicator
    this._secondaryElements = this.player.secondaryElements;                          // HUD: primary + secondary
    this._updateSupportDrones(dt);
    this._updateCorrosive(dt);   // centralized corrosive DoT (drone + Corrosive Payload card)
    this._updateAllyDrones(dt);
    // KIROSHI WALKER — 5-minute cycle: triggers at 2:00, 3:00, 4:00 of each 5-min window
    // Cycle: 0:00–5:00, 5:00–10:00, 10:00–15:00, ... Walker fires at offsets 120/180/240s.
    // Each trigger calls summon(), which refreshes/replaces Walker (lifetime 120s, no stacking).
    if (this._npcWalker && this.player) {
      this._npcWalker.update(dt, this.player.pos, this);
      const _wCycleIdx  = Math.floor(this.timeAlive / 300);
      const _wCycleTime = this.timeAlive % 300;
      // New cycle — reset fired-offset tracking
      if (_wCycleIdx !== this._walkerCycleIdx) {
        this._walkerCycleIdx = _wCycleIdx;
        this._walkerFiredSet = new Set();
      }
      // Fire each offset exactly once per cycle
      for (const _wOff of [120, 180, 240]) {
        if (_wCycleTime >= _wOff && !this._walkerFiredSet.has(_wOff)) {
          this._walkerFiredSet.add(_wOff);
          const _wActiveDur  = 120 + (this.player.walkerActiveDurBonus || 0);
          const _wMaxHpBonus = this.player.walkerMaxHpBonus || 0;
          // summon() safely refreshes lifetime if Walker is already active (no stacking)
          this._npcWalker.summon(this.player.pos, this.player.selectedCharacter || 'default', _wActiveDur, _wMaxHpBonus, this._chaosMode);
          const _wTxt = this._chaosMode ? '⚡ KIROSHI — CHAOS LINK ACTIVE' : 'ELECTRIC SUPPORT ONLINE';
          const _wCol = this._chaosMode ? '#ff2d95' : '#44ffff';
          this.triggerAnnouncement(_wTxt, _wCol);
        }
      }
      // HUD: seconds until next trigger (or next cycle start after 240s)
      this._walkerSummonCd = [120, 180, 240].reduce(
        (acc, _off) => (_wCycleTime < _off ? Math.min(acc, _off - _wCycleTime) : acc),
        300 - _wCycleTime
      );
    }
    this.events.update(dt, this.timeAlive, this);
    this._updateGridCache(dt);
    this._updateHealthPickups(dt);
    this._updateManaPickups(dt);
    this._updateAnnouncement(dt);
    this.particles.update(dt);
    this._updateCamera();
    this._updateDamagePulse(dt);
    this._updateUltReady(dt);
    this._updateComboPopups(dt);

    // Grid Investor card: +2% Gold Core chance per level on stolen cores (read in PowerMatrix.stealCore).
    const gridGoldBonus = (this.player.upgrades['Grid Investor'] || 0) * 0.02;
    for (const m of this.matrices) { m.update(dt); m.goldChanceBonus = gridGoldBonus; }

    // Tick down phoenix animation
    if (this.phoenixReviveTimer > 0) this.phoenixReviveTimer -= dt;

    if (this.overload >= MAX_OVERLOAD) {
      // Overload is hard-capped at OVERLOAD_CAP (99) — never triggers game over.
      this.overload = OVERLOAD_CAP;
    }
    if (this.player.hp <= 0 && this.phoenixReviveTimer <= 0 && !this.gameOver && !this.victory) {
      // Null Breach Arena rescue (EDEN CORE extraction) — fires once per run, before Phoenix.
      if (this._nullBreachActive && !this._arenaRescueUsed) {
        this._triggerArenaRescue();
      // Phoenix revive is DEATH-ONLY: it fires solely when HP has reached 0,
      // never from a timer/cooldown/visual schedule.
      } else if (this.phoenixReviveCount < (3 + (this._hasProto('phoenix_revival') ? 1 : 0))) {
        this._triggerPhoenixRevive();
      } else {
        this.gameOver           = true;
        this._endScreenBtnIndex = 0;   // controller nav: start on RETRY
        this.finalMessage = 'CYBER-HERO OFFLINE';
        this.audio?.playPlayerDeath?.();
        this.audio?.stopAll();
        this._grantRewards();
      }
    }
  }

  _updateGridCache(dt) {
    const DURATION = 20;
    const CRATE_R  = 24;  // pickup radius (half of 48px sprite)

    if (this.gridCache) {
      // Check player pickup
      if (distance(this.player.pos, this.gridCache.pos) < PLAYER_RADIUS + CRATE_R) {
        // Base reward (always): a little XP + overload relief + score
        this.player.gainXp(10, this.floatingTexts);
        this.overload = Math.max(0, this.overload - 5);
        this.score += 50;
        this.floatingTexts.push(new FloatingText('GRID CACHE COLLECTED', this.player.pos.clone(), CYAN, 1.2));
        this.particles.spawnCorePickup(this.gridCache.pos, CYAN);
        this._grantGridCacheBonus();
        // Endless-only matrix refill: 50% (×Cache Scanner) chance to grant +8 cores. Act 1 unchanged.
        if (this.endless && Math.random() < this._endlessCacheBonusChance()) {
          this.addCarriedCoresSafe(8);
          this.floatingTexts.push(new FloatingText('+8 CORES', this.player.pos.clone(), '#ffd23c', 1.6));
        }
        this.gridCache = null;
        this.gridCacheSpawnTimer = 60;
        return;
      }
      // Expire after DURATION seconds
      this.gridCache.timer -= dt;
      if (this.gridCache.timer <= 0) {
        this.floatingTexts.push(new FloatingText('GRID CACHE LOST', this.gridCache.pos.clone(), '#888888', 1.0));
        this.gridCache = null;
        this.gridCacheSpawnTimer = 60;
      }
      return;
    }

    // Count down to next spawn
    this.gridCacheSpawnTimer -= dt;
    if (this.gridCacheSpawnTimer > 0) return;

    // Pick a safe random position inside the world
    const margin = 100;
    let spawnPos = null;
    for (let i = 0; i < 10; i++) {
      const candidate = new Vec2(
        randomRange(margin, WORLD_W - margin),
        randomRange(margin, WORLD_H - margin)
      );
      if (!this.enemies.some(e => distance(e.pos, candidate) < 80)) {
        spawnPos = candidate;
        break;
      }
    }
    if (!spawnPos) {
      spawnPos = new Vec2(randomRange(margin, WORLD_W - margin), randomRange(margin, WORLD_H - margin));
    }

    this.gridCache = { pos: spawnPos, timer: DURATION };
    this.triggerAnnouncement('GRID CACHE DETECTED', CYAN);
    this.audio?.playGridCache();
  }

  // Grid Credits award, scaled by the Grid Investor card (+10% per level). Returns granted amount.
  _awardCredits(n) {
    const mult  = 1 + (this.player.upgrades['Grid Investor'] || 0) * 0.10;
    const total = Math.max(1, Math.round(n * mult));
    this.meta.addCredits(total);
    this.runCreditsEarned = (this.runCreditsEarned || 0) + total;
    return total;
  }

  // RNG bonus on top of the Grid Cache base reward: HP / Mana / Grid Credits / loose Cores.
  _grantGridCacheBonus() {
    const p = this.player;
    const r = Math.random();
    if (r < 0.30) {
      const heal = Math.round(p.maxHp * 0.30);
      p.hp = p.hp >= p.maxHp ? p.hp : Math.min(p.maxHp, p.hp + heal);   // never clip overheal
      this.floatingTexts.push(new FloatingText('+' + heal + ' HP', p.pos.clone(), RED, 1.4));
    } else if (r < 0.55) {
      const m = Math.round((Math.random() < 0.5 ? 25 : 50) * this.mutations.manaGainMult);   // MANA DROUGHT (×1 outside Endless)
      p.mana = Math.min(p.maxMana, p.mana + m);
      this.floatingTexts.push(new FloatingText('+' + m + ' MANA', p.pos.clone(), CYAN, 1.4));
    } else if (r < 0.80) {
      const c = this._awardCredits(3 + Math.floor(Math.random() * 4));   // 3..6 (×Grid Investor)
      this.floatingTexts.push(new FloatingText('+' + c + ' GRID CREDITS', p.pos.clone(), GREEN, 1.4));
    } else {
      const n = 2 + Math.floor(Math.random() * 2);    // 2..3 loose cores to secure
      for (let i = 0; i < n; i++) {
        const off = new Vec2(randomRange(-40, 40), randomRange(-40, 40));
        this.groundCores.push(new DataCore(this._clampPickupPos(p.pos.clone().add(off)), rollCoreType()));
      }
      this.floatingTexts.push(new FloatingText('+' + n + ' CORES', p.pos.clone(), YELLOW, 1.4));
    }
  }

  // Endless Grid Cache +8-cores chance: base 50%, +5% per Cache Scanner meta level, capped 90%.
  _endlessCacheBonusChance() {
    return Math.min(0.9, 0.5 + this.meta.getLevel('cacheScanner') * 0.05);
  }

  // Safely grant cores toward the 4 Nexus matrices. Fills the player's carry slots first (up to
  // maxCarry, neutral Silver value 3), then drops any remainder as a SMALL controlled ground
  // cluster routed through the normal pickup→deposit pipeline. Never bypasses matrices, respects
  // the carry cap, and the bounded count (≤ amount) prevents any ground-core flood.
  addCarriedCoresSafe(amount) {
    const p = this.player;
    let added = 0;
    while (added < amount && p.carry < p.maxCarry) {
      p.carry++;
      p.carriedCores.push(3);   // Silver value — keeps the gold/silver deposit mechanic intact
      added++;
    }
    for (let i = added; i < amount; i++) {
      const off = new Vec2(randomRange(-50, 50), randomRange(-50, 50));
      this.groundCores.push(new DataCore(this._clampPickupPos(p.pos.clone().add(off)), rollCoreType()));
    }
  }

  // Keep a pickup comfortably inside the reachable play area (well away from edges so
  // HP/Mana/cores are never stranded outside where the player can travel).
  _clampPickupPos(pos) {
    const mx = 120, myTop = 150, myBot = 120;
    pos.x = clamp(pos.x, mx, WORLD_W - mx);
    pos.y = clamp(pos.y, myTop, WORLD_H - myBot);
    return pos;
  }

  _updateHealthPickups(dt) {
    const PICKUP_R = 18;   // walk-over only — NO magnet pull; player must move onto the HP cell
    for (let i = this.healthPickups.length - 1; i >= 0; i--) {
      const hp = this.healthPickups[i];
      const d = distance(this.player.pos, hp.pos);

      if (d < PLAYER_RADIUS + PICKUP_R) {
        const heal = this.player.maxHp * 0.25;
        this.player.hp = this.player.hp >= this.player.maxHp   // never clip overheal
          ? this.player.hp
          : Math.min(this.player.maxHp, this.player.hp + heal);
        this.floatingTexts.push(new FloatingText('+25% HP', this.player.pos.clone(), RED, 1.2));
        this.particles.spawnCorePickup(hp.pos, RED);
        this.audio?.playCorePickup();
        this.healthPickups.splice(i, 1);
        continue;
      }

      hp.timer -= dt;
      if (hp.timer <= 0) this.healthPickups.splice(i, 1);
    }
  }

  _updateManaPickups(dt) {
    const PICKUP_R = 18;   // walk-over only — NO magnet pull; player must move onto the mana cell
    // Collect
    for (let i = this.manaPickups.length - 1; i >= 0; i--) {
      const m = this.manaPickups[i];
      if (distance(this.player.pos, m.pos) < PLAYER_RADIUS + PICKUP_R) {
        const mg = Math.round(25 * this.mutations.manaGainMult);   // MANA DROUGHT (×1 outside Endless)
        this.player.mana = Math.min(this.player.maxMana, this.player.mana + mg);
        this.floatingTexts.push(new FloatingText('+' + mg + ' MANA', this.player.pos.clone(), CYAN, 1.2));
        this.particles.spawnCorePickup(m.pos, CYAN);
        this.audio?.playCorePickup();
        this.manaPickups.splice(i, 1);
      }
    }
    // Time-based spawn — one every 30s, only while mana < 100 and none already present (no spam/dupes)
    this.manaPickupTimer -= dt;
    if (this.manaPickupTimer <= 0) {
      this.manaPickupTimer = this._chaosMode ? 12 : 30;   // Chaos: mana pickup every 12s (vs 30s normal)
      if (this.player.mana < this.player.maxMana && this.manaPickups.length === 0) {
        const ang = Math.random() * Math.PI * 2;
        const r   = randomRange(140, 240);
        const pos = this._clampPickupPos(new Vec2(
          this.player.pos.x + Math.cos(ang) * r,
          this.player.pos.y + Math.sin(ang) * r,
        ));
        this.manaPickups.push({ pos });
      }
    }
  }

  // Drawn inside the camera-space block (translate handles the camera offset) → raw world coords.
  _drawHealthPickups(ctx) {
    const R = 16;
    const now = performance.now() / 1000;
    for (const hp of this.healthPickups) {
      const x = hp.pos.x;
      const y = hp.pos.y;
      // Pronounced blink so it stays readable in late-game chaos (abs-sine = on/off pulse).
      const blink = 0.45 + 0.55 * Math.abs(Math.sin(now * 4 + x * 0.05));
      const scale = 1 + 0.12 * blink;

      // Strong blinking red halo + outer beacon ring
      drawGlow(ctx, x, y, (R + 14) * scale, RED, 0.55 * blink);
      ctx.save();
      ctx.globalAlpha = 0.5 + 0.5 * blink;
      ctx.strokeStyle = '#ff7a8c'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, R + 6 * scale, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();

      // Disc with a bold readable outline
      ctx.beginPath();
      ctx.arc(x, y, R, 0, Math.PI * 2);
      ctx.fillStyle   = '#3a0c12';
      ctx.fill();
      ctx.lineWidth   = 3;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.lineWidth   = 2;
      ctx.strokeStyle = RED;
      ctx.beginPath(); ctx.arc(x, y, R - 2, 0, Math.PI * 2); ctx.stroke();

      // White cyber-cross (med icon)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - 7, y - 2.5, 14, 5);
      ctx.fillRect(x - 2.5, y - 7, 5, 14);
    }
  }

  // Cyan mana pickup — visually distinct from the red/white HP cross (world-space).
  _drawManaPickups(ctx) {
    const R = 16;
    const now = performance.now() / 1000;
    const MANA_BLUE = '#3aa0ff';   // support = blue (distinct from player-ability cyan)
    for (const m of this.manaPickups) {
      const x = m.pos.x, y = m.pos.y;
      // Pronounced blink (offset phase from HP so the two never sync) for late-game readability.
      const blink = 0.45 + 0.55 * Math.abs(Math.sin(now * 3.4 + x * 0.05 + 1.6));
      const scale = 1 + 0.12 * blink;

      // Strong blinking blue halo + outer beacon ring
      drawGlow(ctx, x, y, (R + 14) * scale, MANA_BLUE, 0.55 * blink);
      ctx.save();
      ctx.globalAlpha = 0.5 + 0.5 * blink;
      ctx.strokeStyle = '#9fd0ff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, R + 6 * scale, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();

      // Disc with a bold readable outline
      ctx.beginPath();
      ctx.arc(x, y, R, 0, Math.PI * 2);
      ctx.fillStyle   = '#06283a';
      ctx.fill();
      ctx.lineWidth   = 3;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.lineWidth   = 2;
      ctx.strokeStyle = MANA_BLUE;
      ctx.beginPath(); ctx.arc(x, y, R - 2, 0, Math.PI * 2); ctx.stroke();

      // White diamond rune (rotated square) — distinct from the HP cross
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle   = '#ffffff';
      ctx.fillRect(-5, -5, 10, 10);
      ctx.restore();
    }
  }

  _drawGridCacheArrow(ctx) {
    if (!this.gridCache) return;
    if (this.endless) return;   // Endless: drop the grid-cache side-arrow (crate pickup unchanged; Act 1 keeps it)

    // Convert world position → screen position (account for the view zoom)
    const sx = (this.gridCache.pos.x - this.camera.x) * this._viewScale;
    const sy = (this.gridCache.pos.y - this.camera.y) * this._viewScale;

    const HUD_H  = 44;
    const MARGIN = 28;
    const A_SIZE = 14;
    const blink  = 0.65 + 0.35 * Math.sin(Date.now() / 300);  // floored so it never fully fades

    const onScreen = sx >= MARGIN && sx <= WIDTH - MARGIN &&
                     sy >= HUD_H + MARGIN && sy <= HEIGHT - MARGIN;

    ctx.save();
    ctx.globalAlpha = blink;

    if (onScreen) {
      // ▼ bright cyan triangle pointing down at the crate, with glow, gold outline, and label
      const S   = 16;
      const bob = Math.sin(Date.now() / 200) * 4;   // gentle vertical bob
      const ax  = sx;
      const ay  = sy - 40 + bob;
      drawGlow(ctx, ax, ay - S * 0.6, S * 1.6, CYAN, 0.35 * blink);
      ctx.fillStyle   = CYAN;
      ctx.strokeStyle = YELLOW;
      ctx.lineWidth   = 2;
      ctx.beginPath();
      ctx.moveTo(ax,     ay);
      ctx.lineTo(ax - S, ay - S * 1.2);
      ctx.lineTo(ax + S, ay - S * 1.2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // "GRID CACHE" label above the arrow (dark shadow for readability)
      ctx.font      = 'bold 11px Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillText('GRID CACHE', ax + 1, ay - S * 1.2 - 5);
      ctx.fillStyle = YELLOW;
      ctx.fillText('GRID CACHE', ax,     ay - S * 1.2 - 6);
      ctx.textAlign = 'left';
    } else {
      // Edge indicator — clamp to screen bounds, rotate toward crate
      const ex    = Math.max(MARGIN, Math.min(WIDTH  - MARGIN, sx));
      const ey    = Math.max(HUD_H + MARGIN, Math.min(HEIGHT - MARGIN, sy));
      const angle = Math.atan2(sy - ey, sx - ex);

      // Rotated yellow triangle
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(angle);
      ctx.fillStyle = YELLOW;
      ctx.beginPath();
      ctx.moveTo( A_SIZE + 4,  0);
      ctx.lineTo(-A_SIZE,     -A_SIZE * 0.65);
      ctx.lineTo(-A_SIZE,      A_SIZE * 0.65);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Label (drawn un-rotated)
      ctx.font      = 'bold 11px Consolas, monospace';
      ctx.fillStyle = YELLOW;
      ctx.textAlign = 'center';
      ctx.fillText('GRID CACHE', ex, ey - A_SIZE - 4);
      ctx.textAlign = 'left';
    }

    ctx.restore();
  }

  // ── Readability: a clear, always-on-top marker pinned above the player so they are never lost
  // in the neon crowd. Drawn in WORLD space at the END of the camera block (above all effects).
  // Visual only — no gameplay effect.
  _drawPlayerMarker(ctx) {
    const p = this.player;
    if (!p || this.gameOver) return;

    // ── Tunable constants ────────────────────────────────────────────────────
    const PM_HALF_W      = 11;      // half-width of arrow base (px, world-space)
    const PM_HEIGHT      = 18;      // arrow height (px, world-space)
    const PM_OFFSET_Y    = 54;      // distance above pos.y to the arrow tip (px)
    const PM_BOB_AMP     = 4;       // vertical bob amplitude (px)
    const PM_BOB_SPEED   = 480;     // bob period (ms, smaller = faster)
    const PM_PULSE_MIN   = 0.55;    // minimum opacity (calm)
    const PM_PULSE_MAX   = 1.0;     // maximum opacity
    const PM_PULSE_SPEED = 400;     // pulse period (ms)
    const PM_COLOR_FILL  = '#e8ffff';  // bright fill (cyan-white)
    const PM_COLOR_GLOW  = '#50d8ff';  // outer glow colour
    const PM_GLOW_R      = 18;      // glow radius (px)
    const PM_GLOW_A      = 0.45;    // glow base alpha
    const PM_CHAOS_RANGE = 180;     // enemy-detection radius for chaos boost (px)
    const PM_CHAOS_MAX   = 8;       // enemy count that maxes out the boost
    // ────────────────────────────────────────────────────────────────────────

    const now  = Date.now();
    const bob  = Math.sin(now / PM_BOB_SPEED) * PM_BOB_AMP;
    const pRaw = PM_PULSE_MIN + (PM_PULSE_MAX - PM_PULSE_MIN) * (0.5 + 0.5 * Math.sin(now / PM_PULSE_SPEED));

    // Adaptive intensity: count nearby enemies → boost alpha + glow in chaos
    let nearCount = 0;
    if (this.enemies) {
      for (const e of this.enemies) {
        if (!e?.pos) continue;
        const dx = e.pos.x - p.pos.x, dy = e.pos.y - p.pos.y;
        if (dx * dx + dy * dy < PM_CHAOS_RANGE * PM_CHAOS_RANGE) nearCount++;
      }
    }
    const chaosT   = Math.min(1, nearCount / PM_CHAOS_MAX);   // 0 (calm) → 1 (full chaos)
    const pulse    = pRaw + (1 - pRaw) * chaosT * 0.5;        // alpha boosts toward 1 in chaos
    const glowR    = PM_GLOW_R * (1 + 0.6 * chaosT);          // glow grows in chaos
    const glowA    = PM_GLOW_A * (1 + 0.8 * chaosT);          // glow brightens in chaos

    const x    = p.pos.x;
    const tipY = p.pos.y - PM_OFFSET_Y + bob;   // bottom tip points down toward the head

    ctx.save();
    ctx.globalAlpha = pulse;

    // Outer soft glow
    drawGlow(ctx, x, tipY - PM_HEIGHT * 0.5, glowR, PM_COLOR_GLOW, glowA);

    // Arrow fill — bright cyan-white body
    ctx.fillStyle   = PM_COLOR_FILL;
    ctx.strokeStyle = 'rgba(0,12,24,0.55)';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.moveTo(x,              tipY);               // tip (pointing down)
    ctx.lineTo(x - PM_HALF_W,  tipY - PM_HEIGHT);
    ctx.lineTo(x + PM_HALF_W,  tipY - PM_HEIGHT);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Inner bright highlight stripe (top third of arrow, slightly narrower)
    ctx.globalAlpha = pulse * 0.6;
    ctx.fillStyle   = '#ffffff';
    const hx = PM_HALF_W * 0.55, hy = PM_HEIGHT * 0.35;
    ctx.beginPath();
    ctx.moveTo(x,       tipY - PM_HEIGHT + 2);
    ctx.lineTo(x - hx,  tipY - PM_HEIGHT + hy);
    ctx.lineTo(x + hx,  tipY - PM_HEIGHT + hy);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  // ── Readability/onboarding: contextual wayfinding arrow (screen-space). Carrying cores → points
  // to the nearest Nexus (where to deposit). With no cores, only during the early game → points to
  // the nearest ground core (what to grab). Reuses the grid-cache edge-arrow style. Visual only.
  _drawObjectiveIndicators(ctx) {
    if (this.gameOver || this.victory || this.upgradeUI) return;
    if (this.endless) return;   // Endless: drop the wayfinding side-arrow (kept for Act 1 onboarding)
    const p = this.player; if (!p) return;
    let target = null, label = '', col = CYAN;
    if (p.carry > 0 && this.matrices.length) {
      let best = Infinity;
      for (const m of this.matrices) { const d = distance(p.pos, m.pos); if (d < best) { best = d; target = m.pos; } }
      label = 'DEPOSIT'; col = '#7CFF8A';
    } else if (p.carry === 0 && this.timeAlive < 80 && this.groundCores.length) {
      let best = Infinity;
      for (const c of this.groundCores) { const d = distance(p.pos, c.pos); if (d < best) { best = d; target = c.pos; } }
      label = 'CORE'; col = YELLOW;
    }
    if (target) this._drawEdgeArrow(ctx, target, label, col);
  }

  // Small edge arrow toward a world target — only shown when the target is OFF-screen (on-screen
  // targets need no arrow). Clamped to the screen edge and rotated toward the target.
  _drawEdgeArrow(ctx, worldPos, label, color) {
    const sx = (worldPos.x - this.camera.x) * this._viewScale;
    const sy = (worldPos.y - this.camera.y) * this._viewScale;
    const HUD_H = 44, M = 34;
    if (sx >= M && sx <= WIDTH - M && sy >= HUD_H + M && sy <= HEIGHT - M) return;
    const ex  = Math.max(M, Math.min(WIDTH - M, sx));
    const ey  = Math.max(HUD_H + M, Math.min(HEIGHT - M, sy));
    const ang = Math.atan2(sy - ey, sx - ex);
    const blink = 0.7 + 0.3 * Math.sin(Date.now() / 300);
    ctx.save();
    ctx.globalAlpha = blink;
    ctx.translate(ex, ey); ctx.rotate(ang);
    ctx.fillStyle = color; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-10, -8); ctx.lineTo(-10, 8); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = blink; ctx.font = 'bold 10px Consolas, monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillText(label, ex + 1, ey - 15);
    ctx.fillStyle = color;             ctx.fillText(label, ex,     ey - 16);
    ctx.restore();
    ctx.globalAlpha = 1; ctx.textAlign = 'left';
  }

  // ── First-minute onboarding (Act 1 only): a clear objective callout + rotating core/Overload
  // hints that fade out within the first minute. Screen-space, non-blocking (top band under the
  // HUD bar). Purely informational — never blocks input or changes gameplay.
  _drawOnboarding(ctx) {
    if (this.endless || this.gameOver || this.victory || this.upgradeUI) return;
    const t = this.timeAlive;
    if (t > 62) return;
    ctx.save();
    ctx.textAlign = 'center';
    // Objective title — bold for the first ~5s, then fades.
    const titleA = t < 5 ? 1 : Math.max(0, 1 - (t - 5) / 2.5);
    if (titleA > 0.01) {
      ctx.globalAlpha = titleA;
      ctx.font = 'bold 26px Consolas, monospace';
      ctx.shadowColor = CYAN; ctx.shadowBlur = 12; ctx.fillStyle = CYAN;
      ctx.fillText('SURVIVE NULL EDEN', WIDTH / 2, 92);
      ctx.shadowBlur = 0;
    }
    // Rotating hints (after the title) — each fades in/out; all stop by ~26s.
    const hints = [
      'Survive long enough to push beyond Act 1 into NULL EDEN',
      'Collect Null Relics to unlock deeper progression and secrets',
      'Chaos Mode escalates the run — stay sharp and build wisely',
    ];
    if (t > 6) {
      const span = 6.5;
      const idx  = Math.floor((t - 6) / span);
      if (idx < hints.length) {
        const lt = (t - 6) - idx * span;
        const ha = Math.min(1, lt / 0.6) * Math.min(1, (span - lt) / 0.8);
        if (ha > 0.01) {
          ctx.globalAlpha = Math.max(0, ha);
          ctx.font = '15px Consolas, monospace';
          ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(hints[idx], WIDTH / 2 + 1, 119);
          ctx.fillStyle = '#cfe8ff';         ctx.fillText(hints[idx], WIDTH / 2,     118);
        }
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1; ctx.textAlign = 'left';
  }

  _updateStartMenu(dt, input) {
    this._updateAnnouncement(dt);
    const { keys } = input;
    if (keys.has('arrowup') || keys.has('w')) {
      this.menuIndex = (this.menuIndex - 1 + this.menuItems.length) % this.menuItems.length;
      keys.delete('arrowup');
      keys.delete('w');
      this._syncMenuOverlayActive();
    }
    if (keys.has('arrowdown') || keys.has('s')) {
      this.menuIndex = (this.menuIndex + 1) % this.menuItems.length;
      keys.delete('arrowdown');
      keys.delete('s');
      this._syncMenuOverlayActive();
    }
    if (keys.has('enter') || keys.has(' ')) {
      this._selectMenuItem(this.menuItems[this.menuIndex]);
      keys.delete('enter');
      keys.delete(' ');
    }
  }

  // Name-based menu dispatch (shared by keyboard + mouse) so item order can change safely.
  _selectMenuItem(item) {
    if (item === 'START GAME' || item === 'CHARACTER SELECT') this.goToCharacterSelect();
    else if (item === 'ENDLESS MODE')   this.startEndlessRun();
    else if (item === 'CHAOS MODE')    this._selectChaosMode();
    else if (item === 'UPGRADES')       this.goToUpgradesScreen();
    else if (item === 'ACHIEVEMENTS')   this.goToAchievementsScreen();
    else if (item === 'RELICS')         this.goToRelicsScreen();
    else if (item === 'SETTINGS')       this.goToSettings();
    else if (item === 'EXIT') { try { window.close(); } catch (e) {} this.goToExitScreen(); }   // browser-safe: close if allowed, else friendly exit screen
  }

  _selectChaosMode() {
    if (!this.meta?.isEndlessUnlocked()) {
      this.triggerAnnouncement('REACH ENDLESS FIRST', '#888888');
      return;
    }
    this.startChaosRun();
  }

  startChaosRun() {
    this._hideMenuOverlay();
    this._hideCharSelectOverlay?.();
    this.selectedCharacter = this.selectedCharacter || this.characters[this.characterIndex]?.id || 'skeleton_warrior';
    this.runChaosLaw = null;          // skip Chaos Law selection overlay for direct Chaos start
    this.gameState = 'playing';
    this.reset();
    this._enterEndless();             // set up all Endless infrastructure
    this._chaosMode          = true;     // engage Chaos immediately
    this._chaosTransTimer    = -1;
    this._frozenSleetTimer   = 55;  // first Frozen Sleet Storm 55 s into Chaos
    this.audio?.startChaosMusic();    // override the Endless track started by _enterEndless()
    this.triggerAnnouncement('⚡ CHAOS MODE ⚡', '#ff2d95');
  }

  goToSettings() { this._hideMenuOverlay(); this.gameState = 'settings'; this._settingsIndex = 0; this._showSettingsOverlay(); }

  _updateSettings(input) {
    const { keys } = input;
    const n = this.settingsItems.length;
    if (keys.has('arrowup') || keys.has('w'))   { this._settingsIndex = (this._settingsIndex - 1 + n) % n; keys.delete('arrowup'); keys.delete('w'); this._syncSettingsOverlayActive(); }
    if (keys.has('arrowdown') || keys.has('s')) { this._settingsIndex = (this._settingsIndex + 1) % n;     keys.delete('arrowdown'); keys.delete('s'); this._syncSettingsOverlayActive(); }
    if (keys.has('enter') || keys.has(' '))     { this._selectSettingsItem(this.settingsItems[this._settingsIndex]); keys.delete('enter'); keys.delete(' '); }
    if (keys.has('escape'))                      { this.goToMainMenu(); keys.delete('escape'); }
  }

  _selectSettingsItem(item) {
    if      (item === 'AUDIO')            this.goToAudioSettings();
    else if (item === 'CREDITS')          this.goToCredits();
    else if (item === 'LORE / ARCHIVE')   this.goToLoreArchive();
    else if (item === 'BACK')             this.goToMainMenu();
    else                                  this.goToInstructions();   // CONTROLS / HOW TO PLAY
  }

  goToLoreArchive() { this._hideMenuOverlay(); this._hideSettingsOverlay(); this._loreSection = 0; this.gameState = 'lore_archive'; }

  // SETTINGS options reuse the baked central button slots (overlay over the live menu), so the
  // theme stays visible and click geometry matches the main menu exactly.
  _settingsButtonRect(i) { return this._menuButtonRect(i); }

  // Top-right gear shortcut on the main menu → opens the SAME Settings screen (no duplicate logic).
  _menuGearRect() { return { x: WIDTH - 40, y: 14, w: 28, h: 28 }; }

  _updateCharacterSelect(input) {
    const { keys } = input;
    if (keys.has('arrowleft') || keys.has('a')) {
      this.characterIndex = (this.characterIndex - 1 + this.characters.length) % this.characters.length;
      keys.delete('arrowleft');
      keys.delete('a');
      this._syncCharSelectOverlay();
    }
    if (keys.has('arrowright') || keys.has('d')) {
      this.characterIndex = (this.characterIndex + 1) % this.characters.length;
      keys.delete('arrowright');
      keys.delete('d');
      this._syncCharSelectOverlay();
    }
    // Up/Down (or W/S) toggle the equipped outfit for the highlighted character.
    // setSelectedOutfit is a no-op when the secret outfit is still locked.
    if (keys.has('arrowup') || keys.has('arrowdown') || keys.has('w') || keys.has('s')) {
      const charId = this.characters[this.characterIndex].id;
      const next   = this.meta.getSelectedOutfit(charId) === 'default' ? 'secret' : 'default';
      this.meta.setSelectedOutfit(charId, next);
      ['arrowup', 'arrowdown', 'w', 's'].forEach(k => keys.delete(k));
      this._syncCharSelectOverlay();
    }
    if (keys.has('enter') || keys.has(' ')) {
      const charId = this.characters[this.characterIndex].id;
      this.selectCharacter(charId);
      keys.delete('enter');
      keys.delete(' ');
    }
    if (keys.has('escape')) {
      this.goToMainMenu();
      keys.delete('escape');
    }
  }

  // Shared geometry for the Character-Select outfit toggle (top-centre, clear of the
  // character cards so a click here equips an outfit instead of starting the run).
  _outfitBtnRects() {
    const bw = 150, bh = 32, gap = 16, y = 150;
    const x0 = Math.round(WIDTH / 2 - (bw * 2 + gap) / 2);
    return {
      defaultRect: { x: x0,             y, w: bw, h: bh },
      secretRect:  { x: x0 + bw + gap,  y, w: bw, h: bh },
    };
  }

  _updateExitScreen(input) {
    const { keys } = input;
    if (keys.has('enter') || keys.has('escape')) {
      this.goToMainMenu();
      keys.delete('enter');
      keys.delete('escape');
    }
  }

  // ─── Audio Settings screen ───────────────────────────────────────────────────
  _audioRects() {
    const TW = 440;
    const tx = Math.round((WIDTH - TW) / 2);
    const rows = [
      { key: 'master', label: 'MASTER VOLUME' },
      { key: 'music',  label: 'MUSIC VOLUME'  },
      { key: 'sfx',    label: 'SFX VOLUME'    },
    ];
    const startY = 240, gap = 78;
    const sliders = rows.map((r, i) => {
      const ty = startY + i * gap;
      return { ...r, tx, ty, tw: TW, y0: ty - 26, y1: ty + 26 };
    });
    const backRect = { x: Math.round((WIDTH - 160) / 2), y: startY + 3 * gap + 6, w: 160, h: 44 };
    return { sliders, backRect };
  }

  _audioVolumeFor(key) {
    const a = this.audio;
    if (key === 'master') return a?.masterVolume ?? 1.0;
    if (key === 'music')  return a?.musicVolume  ?? 0.70;
    return a?.sfxVolume ?? 0.80;
  }

  _setAudioVolume(key, v) {
    if (!this.audio) return;
    if      (key === 'master') this.audio.setMasterVolume(v);
    else if (key === 'music')  this.audio.setMusicVolume(v);
    else if (key === 'sfx')    this.audio.setSfxVolume(v);
  }

  _updateAudioSettings(input) {
    const { keys, mousePos, mouseDown } = input;
    const { sliders, backRect } = this._audioRects();

    // Mouse: set/drag the slider whose horizontal band holds the cursor.
    if (mouseDown && this.audio) {
      for (let i = 0; i < sliders.length; i++) {
        const s = sliders[i];
        if (mousePos.y >= s.y0 && mousePos.y <= s.y1 &&
            mousePos.x >= s.tx - 14 && mousePos.x <= s.tx + s.tw + 14) {
          const v = Math.max(0, Math.min(1, (mousePos.x - s.tx) / s.tw));
          this._setAudioVolume(s.key, v);
          this._audioSelIndex = i;
          break;
        }
      }
    }

    // BACK button — rising edge only, so a drag does not trigger it.
    if (mouseDown && !this._prevMouseDown && this._inRect(mousePos, backRect)) {
      this.goToMainMenu();
    }
    this._prevMouseDown = mouseDown;

    // Keyboard: ↑/↓ select row, ←/→ adjust by 5%, ESC back.
    if (keys.has('arrowup') || keys.has('w')) {
      this._audioSelIndex = (this._audioSelIndex + sliders.length - 1) % sliders.length;
      keys.delete('arrowup'); keys.delete('w');
    }
    if (keys.has('arrowdown') || keys.has('s')) {
      this._audioSelIndex = (this._audioSelIndex + 1) % sliders.length;
      keys.delete('arrowdown'); keys.delete('s');
    }
    if (keys.has('arrowleft') || keys.has('a')) {
      const s = sliders[this._audioSelIndex];
      this._setAudioVolume(s.key, this._audioVolumeFor(s.key) - 0.05);
      keys.delete('arrowleft'); keys.delete('a');
    }
    if (keys.has('arrowright') || keys.has('d')) {
      const s = sliders[this._audioSelIndex];
      this._setAudioVolume(s.key, this._audioVolumeFor(s.key) + 0.05);
      keys.delete('arrowright'); keys.delete('d');
    }
    if (keys.has('escape')) {
      this.goToMainMenu();
      keys.delete('escape');
    }
  }

  _drawAudioSettings(ctx) {
    this._drawBackground(ctx);
    ctx.fillStyle = 'rgba(0,0,0,0.82)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.font      = 'bold 40px Consolas, monospace';
    ctx.fillStyle = CYAN;
    ctx.textAlign = 'center';
    ctx.fillText('AUDIO SETTINGS', WIDTH / 2, 120);

    const { sliders, backRect } = this._audioRects();

    for (let i = 0; i < sliders.length; i++) {
      const s        = sliders[i];
      const v        = this._audioVolumeFor(s.key);
      const selected = i === this._audioSelIndex;
      const th       = 8;

      // Label + percent readout
      ctx.font      = 'bold 18px Consolas, monospace';
      ctx.fillStyle = selected ? CYAN : WHITE;
      ctx.textAlign = 'left';
      ctx.fillText(s.label, s.tx, s.ty - 16);
      ctx.textAlign = 'right';
      ctx.fillStyle = YELLOW;
      ctx.fillText(`${Math.round(v * 100)}%`, s.tx + s.tw, s.ty - 16);

      // Track + filled portion + border
      ctx.fillStyle = '#1a2a3a';
      ctx.fillRect(s.tx, s.ty - th / 2, s.tw, th);
      ctx.fillStyle = selected ? CYAN : '#2a6a8a';
      ctx.fillRect(s.tx, s.ty - th / 2, s.tw * v, th);
      ctx.strokeStyle = selected ? CYAN : '#2a4060';
      ctx.lineWidth   = selected ? 2 : 1;
      ctx.strokeRect(s.tx, s.ty - th / 2, s.tw, th);

      // Handle
      const hx = s.tx + s.tw * v;
      ctx.fillStyle = selected ? CYAN : WHITE;
      ctx.fillRect(hx - 5, s.ty - 12, 10, 24);
    }

    // Mute status / hint
    ctx.font      = '14px Consolas, monospace';
    ctx.textAlign = 'center';
    if (this.audio?.muted) {
      ctx.fillStyle = '#ff6a6a';
      ctx.fillText('MUTED — press M to unmute', WIDTH / 2, backRect.y - 22);
    } else {
      ctx.fillStyle = 'rgba(200,200,200,0.6)';
      ctx.fillText('Press M to mute      Drag sliders, or ↑↓ select / ← → adjust', WIDTH / 2, backRect.y - 22);
    }

    // BACK button
    ctx.fillStyle = '#0a0f20';
    ctx.fillRect(backRect.x, backRect.y, backRect.w, backRect.h);
    ctx.strokeStyle = CYAN; ctx.lineWidth = 2;
    ctx.strokeRect(backRect.x, backRect.y, backRect.w, backRect.h);
    ctx.font      = 'bold 18px Consolas, monospace';
    ctx.fillStyle = CYAN;
    ctx.textAlign = 'center';
    ctx.fillText('BACK', backRect.x + backRect.w / 2, backRect.y + 28);

    ctx.textAlign = 'left';
  }

  _handleAutoShooting() {
    // Auto-fire at the existing cadence — only when a valid target exists (never into empty space).
    if (this.player.selectedCharacter === 'euclid_vector') return;   // his weapon IS the toxin kit (ToxicSniper), not the base shot
    if (!this.player.canShoot()) return;
    if (!this.aimAssist) return;                          // T still toggles auto-fire on/off
    const target = this._autoTarget(this.player.pos, 750); // wide, screen-aware detection
    if (!target) return;                                  // no enemy/boss/carrier in range → hold fire
    const proj = this.player.shoot(target.pos);
    // Assassin Clone: her base auto-shot IS the Arrow (visible arrow sprite via Player.attackMap,
    // rotated to its travel direction — no orb). Her retired Twin-Dagger mastery card now feeds the
    // arrow (+1 damage/level), so the card is never a dead pick. Same projectile that always existed.
    if (this.player.selectedCharacter === 'assassin_clone') {
      proj.damage += this._cardLvl('assassin_clone_twin_dagger_mastery');
    }
    // Japan Phasewalker — Phase Shard Mastery feeds his automatic phase-needle (+1 dmg/level).
    if (this.player.selectedCharacter === 'japan_phasewalker') {
      proj.damage += this._cardLvl('phasewalker_phase_shard_mastery');
    }
    this.projectiles.push(proj);
    this.audio?.playShoot();
  }

  _autoTarget(from, range) {
    // Nearest valid target (enemy or live boss) within range, preferring an in-range Data-Core
    // carrier (same priority the Homing Disc uses) so core theft is punished. Not global damage —
    // this only selects ONE aim target; projectiles still travel and hit normally.
    let best = null,    bestDist = range;
    let carrier = null, carrierDist = range;
    for (const e of this.enemies) {
      const d = distance(from, e.pos);
      if (d < bestDist) { bestDist = d; best = e; }
      if (e.carryingCore && d < carrierDist) { carrierDist = d; carrier = e; }
    }
    // Include live bosses / mini-bosses if closer than current best
    const _ddBodies = this.doubleDemonsBoss && this.doubleDemonsBoss.hp > 0
      ? [this.doubleDemonsBoss.gunner, this.doubleDemonsBoss.claw] : [];
    for (const boss of [this.titanBoss, this.annihilatorBoss, this.bloodfangBoss, this.cyberSerpentBoss, this.cyberDragonBoss, ..._ddBodies]) {
      if (boss && boss.hp > 0) {
        const d = distance(from, boss.pos);
        if (d < bestDist) { bestDist = d; best = boss; }
      }
    }
    return carrier || best;   // prefer an in-range core carrier, else nearest enemy/boss
  }

  spawnEnemyBullet(pos, dir, speed, damage, radius, color, opts = {}) {
    speed *= this.mutations.enemyBulletSpeedMult;   // ACCELERATED ROUNDS (1.0 outside Endless)
    this.enemyBullets.push({ pos, dir: dir.clone(), speed, damage, radius, color, life: 4.0, stun: opts.stun || 0 });
  }

  _updateEnemyBullets(dt) {
    for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
      const b = this.enemyBullets[i];
      b.pos.addMut(b.dir.scale(b.speed * dt));
      b.life -= dt;

      if (b.life <= 0 || b.pos.x < -60 || b.pos.x > WIDTH + 60 ||
          b.pos.y < -60 || b.pos.y > HEIGHT + 60) {
        this.enemyBullets.splice(i, 1);
        continue;
      }

      // Hit player — routed through the shared fairness gate (dash/Phoenix i-frames + 0.5s grace
      // + per-hit ceiling). While dashing the gate returns false, so the bullet is NOT consumed
      // and passes through — a true dodge.
      if (distance(b.pos, this.player.pos) < b.radius + PLAYER_RADIUS) {
        if (this._damagePlayer(b.damage, { color: RED, shake: 5 })) {
          if (b.stun) this.player.applyBite({ stagger: b.stun });   // telegraphed stun bolt — anti-lock immunity inside applyBite
          this.audio?.playEnemyProjectileImpact();
          this.enemyBullets.splice(i, 1);
        }
      }
    }
  }

  _handleCorePickupAndSlotting(dt) {
    for (let i = this.groundCores.length - 1; i >= 0; i--) {
      const core = this.groundCores[i];
      const d    = distance(core.pos, this.player.pos);

      if (d < this.player.pickupRadius * this.mutations.pickupRadiusMult * 1.7 + 48 && this.player.carry < this.player.maxCarry) {   // wider magnet (Tractor Beam scales pickupRadius); MAGNET DECAY read-site only
        const pull = safeNormalize(this.player.pos.sub(core.pos));
        core.pos.addMut(pull.scale(460 * dt));   // pull is enemy-independent (never stops near foes)

        if (d < PLAYER_RADIUS + CORE_RADIUS + 8) {
          this.groundCores.splice(i, 1);
          this.player.carry++;
          this.player.carriedCores.push(core.value ?? 3);   // remember gold/silver value
          this.overload = Math.max(0, this.overload - OVERLOAD_PICKUP_REDUCTION);
          this.floatingTexts.push(new FloatingText('CORE VACUUMED', this.player.pos.clone(), core.color || CYAN, 0.8));
          this.particles.spawnCorePickup(core.pos, core.color);
          this.audio?.playCorePickup();
        }
      }
    }

    if (this.player.carry > 0) {
      for (const matrix of this.matrices) {
        if (this.player.carry <= 0) break;
        if (matrix.hasSpace() && distance(this.player.pos, matrix.pos) < this.player.returnRadius) {
          const value = this.player.carriedCores.shift() ?? 3;   // Gold = 5, Silver = 3
          matrix.slotCore(value);
          this.player.carry--;
          this.player.coresSecured++;
          this.overload = Math.max(0, this.overload - OVERLOAD_SLOT_REDUCTION);
          this.player.gainXp(2, this.floatingTexts);
          const isGold = value >= 5;
          this.floatingTexts.push(new FloatingText('+' + value + ' MATRIX',
            matrix.pos.clone(), isGold ? '#ffd23c' : GREEN, 0.9));
          this.particles.spawnCoreSlot(matrix.pos, isGold ? '#ffd23c' : matrix.color);
          this.audio?.playCoreSlot();
          this.score += 25;
          // Matrix RNG bonus: ~22% of deposits award a variable Grid Credit cache (2–5).
          if (Math.random() < 0.22) {
            const c = this._awardCredits(2 + Math.floor(Math.random() * 4));   // 2..5
            this.floatingTexts.push(new FloatingText('+' + c + ' GRID CREDITS',
              new Vec2(matrix.pos.x, matrix.pos.y - 22), GREEN, 1.4));
          }
        }
      }
    }
  }

  _updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.update(dt);

      let hit = false;
      for (let j = this.enemies.length - 1; j >= 0; j--) {
        const e = this.enemies[j];
        if (distance(p.pos, e.pos) < p.radius + e.radius) {
          const cryo = this.player.upgrades['Cryo Rounds'] || 0;
          const supp = this.player.upgrades['Suppression'] || 0;
          // Glacial Shatter triggers off enemies ALREADY slowed before this hit (true
          // frost-build synergy), so capture the slow state before Cryo refreshes it.
          const wasSlowed  = e.slowTimer > 0 && !e.isBoss() && !e.isMegaBoss;
          const shatterPos = e.pos.clone();
          if ((cryo > 0 || supp > 0) && !e.isBoss() && !e.isMegaBoss) {
            e.slowTimer  = Math.max(e.slowTimer, 0.8 + 0.3 * cryo + 0.25 * supp);  // Suppression = longer
            e.slowFactor = clamp(0.55 - 0.08 * supp, 0.30, 0.55);                  // Suppression = stronger
          }
          // Primary-fire soft cap: bosses/mega bosses absorb only capped DPS (normal enemies unaffected).
          const pm = this._primaryMasteryLvl();
          const baseDmg = (e.isBoss() || e.isMegaBoss) ? this._capBossDamage(e, p.damage) : p.damage;
          e.takeHit(baseDmg * (1 + 0.12 * pm), this);
          if (pm > 0) this.particles.spawnHitSparks(e.pos, this._primarySparkColor());  // char-matched primary spark
          this._tryCorrode(e);
          if (wasSlowed) this._glacialShatter(shatterPos, e);
          this.projectiles.splice(i, 1);
          hit = true;
          break;
        }
      }

      // Check titan hit
      if (!hit && this.titanBoss && this.titanBoss.hp > 0 &&
          distance(p.pos, this.titanBoss.pos) < p.radius + this.titanBoss.radius) {
        const titanDmg = this._capBossDamage(this.titanBoss, p.damage);
        this.titanBoss.hp      -= titanDmg;
        this.titanBoss.hitFlash = 0.08;
        this.floatingTexts.push(new FloatingText('-' + Math.round(titanDmg), this.titanBoss.pos.add(new Vec2(randomRange(-10, 10), -this.titanBoss.radius - 6)), WHITE, 0.5));
        this.particles.spawnHitSparks(p.pos, PURPLE);
        this.projectiles.splice(i, 1);
        hit = true;
        if (this.titanBoss.hp <= 0) this._titanDie();
      }

      // Check Matrix Annihilator hit
      if (!hit && this.annihilatorBoss && this.annihilatorBoss.hp > 0 &&
          distance(p.pos, this.annihilatorBoss.pos) < p.radius + this.annihilatorBoss.radius) {
        const annihDmg = this._capBossDamage(this.annihilatorBoss, p.damage);
        this.annihilatorBoss.hp      -= annihDmg;
        this.annihilatorBoss.hitFlash = 0.08;
        this.floatingTexts.push(new FloatingText('-' + Math.round(annihDmg), this.annihilatorBoss.pos.add(new Vec2(randomRange(-10, 10), -this.annihilatorBoss.radius - 6)), WHITE, 0.5));
        this.particles.spawnHitSparks(p.pos, RED);
        this.projectiles.splice(i, 1);
        hit = true;
        if (this.annihilatorBoss.hp <= 0) this._annihilatorDie();
      }

      // Check Bloodfang Packmaster hit
      if (!hit && this.bloodfangBoss && this.bloodfangBoss.hp > 0 &&
          distance(p.pos, this.bloodfangBoss.pos) < p.radius + this.bloodfangBoss.radius) {
        const bloodfangDmg = this._capBossDamage(this.bloodfangBoss, p.damage);
        this.bloodfangBoss.hp      -= bloodfangDmg;
        this.bloodfangBoss.hitFlash = 0.08;
        this.floatingTexts.push(new FloatingText('-' + Math.round(bloodfangDmg), this.bloodfangBoss.pos.add(new Vec2(randomRange(-10, 10), -this.bloodfangBoss.radius - 6)), WHITE, 0.5));
        this.particles.spawnHitSparks(p.pos, RED);
        this.projectiles.splice(i, 1);
        hit = true;
        if (this.bloodfangBoss.hp <= 0) this._bloodfangDie();
      }

      // Check Cyber Serpent hit
      if (!hit && this.cyberSerpentBoss && this.cyberSerpentBoss.hp > 0 &&
          distance(p.pos, this.cyberSerpentBoss.pos) < p.radius + this.cyberSerpentBoss.radius) {
        const serpDmg = this._capBossDamage(this.cyberSerpentBoss, p.damage);
        this.cyberSerpentBoss.hp      -= serpDmg;
        this.cyberSerpentBoss.hitFlash = 0.08;
        this.floatingTexts.push(new FloatingText('-' + Math.round(serpDmg), this.cyberSerpentBoss.pos.add(new Vec2(randomRange(-10, 10), -this.cyberSerpentBoss.radius - 6)), WHITE, 0.5));
        this.particles.spawnHitSparks(p.pos, ORANGE);
        this.projectiles.splice(i, 1);
        hit = true;
        if (this.cyberSerpentBoss.hp <= 0) this._cyberSerpentDie();
      }

      // Check Cyber Dragon hit
      if (!hit && this.cyberDragonBoss && this.cyberDragonBoss.hp > 0 &&
          distance(p.pos, this.cyberDragonBoss.pos) < p.radius + this.cyberDragonBoss.radius) {
        const dragonDmg = this._capBossDamage(this.cyberDragonBoss, p.damage);
        this.cyberDragonBoss.hp      -= dragonDmg;
        this.cyberDragonBoss.hitFlash = 0.08;
        this.floatingTexts.push(new FloatingText('-' + Math.round(dragonDmg), this.cyberDragonBoss.pos.add(new Vec2(randomRange(-10, 10), -this.cyberDragonBoss.radius - 6)), WHITE, 0.5));
        this.particles.spawnHitSparks(p.pos, '#00ccff');
        this.projectiles.splice(i, 1);
        hit = true;
        if (this.cyberDragonBoss.hp <= 0) this._cyberDragonDie();
      }

      // Check Double Demons hit (Gunner or Claw body — damage goes to shared HP)
      if (!hit && this.doubleDemonsBoss && this.doubleDemonsBoss.hp > 0) {
        const _dd = this.doubleDemonsBoss;
        for (const _body of [_dd.gunner, _dd.claw]) {
          if (distance(p.pos, _body.pos) < p.radius + _body.radius) {
            const _ddDmg = this._capBossDamage(_dd, p.damage);
            _dd.hp        -= _ddDmg;
            _body.hitFlash = 0.08;
            this.floatingTexts.push(new FloatingText('-' + Math.round(_ddDmg),
              _body.pos.add(new Vec2(randomRange(-10, 10), -_body.radius - 6)), WHITE, 0.5));
            this.particles.spawnHitSparks(p.pos, '#ff2d95');
            this.projectiles.splice(i, 1);
            hit = true;
            if (_dd.hp <= 0) this._doubleDemonsDie();
            break;
          }
        }
      }

      if (!hit && !p.alive()) this.projectiles.splice(i, 1);
    }
  }

  // ── Glacial Shatter card ──────────────────────────────────────────────────
  // Rolled when a shot lands on an already-slowed enemy: a frost burst that deals
  // bounded AoE damage to nearby normal enemies and briefly slows them. Bosses are
  // immune (consistent with the Cryo/Suppression slow rules), so no boss-death path here.
  _glacialShatter(originPos, source) {
    const lvl = this.player.upgrades['Glacial Shatter'] || 0;
    if (lvl === 0) return;
    if (Math.random() >= 0.25 + 0.15 * lvl) return;   // L1 .40 / L2 .55 / L3 .70

    const radius = 70 + 10 * lvl;
    const dmg    = 10 + 6 * lvl;

    for (const e of this.enemies.slice()) {            // snapshot: takeHit can splice this.enemies
      if (e === source || e.isBoss() || e.isMegaBoss) continue;
      if (distance(originPos, e.pos) > radius + e.radius) continue;
      e.slowTimer  = Math.max(e.slowTimer, 1.0);
      e.slowFactor = Math.min(e.slowFactor, 0.45);
      e.takeHit(dmg, this);
    }

    // Frost burst visual (matches existing _specialRings ring structure)
    this._specialRings.push({ pos: originPos.clone(), radius: 0, maxRadius: radius,
                              life: 0.35, maxLife: 0.35, color1: CYAN, color2: '#ffffff' });
    this.particles.spawnExplosion(originPos, [CYAN, '#aaddff', '#ffffff'], 16);
    this.floatingTexts.push(new FloatingText('SHATTER', new Vec2(originPos.x, originPos.y - 28), CYAN, 0.9));
  }

  _updateHomingDiscs(dt) {
    if (this.player.upgrades['Homing Disc'] === 0) return;

    this.player.homingDiscTimer -= dt;
    if (this.player.homingDiscTimer <= 0) {
      this.player.homingDiscTimer = Math.max(1.5, 4.0 - this.player.upgrades['Homing Disc'] * 0.5);
      const carriers = this.enemies.filter(e => e.carryingCore);
      if (carriers.length > 0) {
        const target = carriers.reduce((a, b) =>
          distance(this.player.pos, a.pos) < distance(this.player.pos, b.pos) ? a : b
        );
        this.homingDiscs.push(new HomingDisc(this.player.pos.clone(), target));
      }
    }

    for (let i = this.homingDiscs.length - 1; i >= 0; i--) {
      const disc = this.homingDiscs[i];
      disc.update(dt, this.enemies);

      let hit = false;
      for (let j = this.enemies.length - 1; j >= 0; j--) {
        const e = this.enemies[j];
        if (distance(disc.pos, e.pos) < disc.radius + e.radius) {
          const discDmg = (e.isBoss() || e.isMegaBoss) ? this._capBossDamage(e, disc.damage) : disc.damage;
          e.takeHit(discDmg, this);
          this.homingDiscs.splice(i, 1);
          hit = true;
          break;
        }
      }
      if (!hit && !disc.alive()) this.homingDiscs.splice(i, 1);
    }
  }

  // ── Chain Lightning Laser ─────────────────────────────────────────────────
  // Automatic secondary weapon: a fast electric-blue bolt that hits the nearest enemy and
  // then chains to up to 3 more nearby enemies. Damage is applied on the visible impact of
  // each link (no enemies vanishing early). Lightweight: a few short-lived bolts/links only.
  _updateChainLightning(dt) {
    this._chainTimer -= dt;
    if (this._chainTimer <= 0) {
      this._chainTimer = this._fireChainLightning() ? 1.5 : 0.25;   // retry soon if nothing in range
    }

    // Lead bolts travel player → first target; on arrival, hit it and spawn the staggered jumps
    for (let i = this._chainBolts.length - 1; i >= 0; i--) {
      const b = this._chainBolts[i];
      b.t += dt;
      const f = Math.min(1, b.t / b.travelTime);
      b.x = b.fromX + (b.toX - b.fromX) * f;
      b.y = b.fromY + (b.toY - b.fromY) * f;
      if (b.t >= b.travelTime) {
        this._chainHit(b.chain[0]);                       // first target — damage + spark on arrival
        for (let k = 0; k < b.chain.length - 1; k++) {    // queue the jumps t0→t1→t2→t3
          const a = b.chain[k], c = b.chain[k + 1];
          const offsets = [(Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14];
          this._chainLinks.push({ ax: a.x, ay: a.y, bx: c.x, by: c.y, target: c,
                                  delay: (k + 1) * 0.05, life: 0.10, struck: false, offsets });
        }
        this._chainBolts.splice(i, 1);
      }
    }

    // Links activate at their stagger delay (damage + spark synced to the visible jump), then fade
    for (let i = this._chainLinks.length - 1; i >= 0; i--) {
      const L = this._chainLinks[i];
      if (!L.struck) {
        L.delay -= dt;
        if (L.delay <= 0) { L.struck = true; this._chainHit(L.target); }
      } else {
        L.life -= dt;
        if (L.life <= 0) this._chainLinks.splice(i, 1);
      }
    }
  }

  // Returns true if a bolt was fired (a target existed in range).
  _fireChainLightning() {
    const p = this.player;
    // Chain Lightning is the Skeleton Warrior's signature secondary only. Cyber Arm Hero uses the
    // Neon Pierce Beam and Neon Taekwondo Girl uses the Aqua Spirit Trail instead, so both are
    // gated off here (code kept intact for the Skeleton / future use).
    if (p.selectedCharacter !== 'skeleton_warrior') return false;
    const FIRST_RANGE = 520, JUMP_RADIUS = 240, BOLT_SPEED = 1200;
    const BOUNCES = 3 + this._cardLvl('skeleton_chain_lightning_mastery');   // +1 fork per level
    let first = null, bestD = FIRST_RANGE;
    for (const e of this.enemies) {
      const d = distance(p.pos, e.pos);
      if (d < bestD) { bestD = d; first = e; }
    }
    if (!first) return false;
    // Build the chain: nearest unchosen enemy within JUMP_RADIUS of the last link
    const chosen = [first];
    let last = first;
    for (let j = 0; j < BOUNCES; j++) {
      let next = null, nd = JUMP_RADIUS;
      for (const e of this.enemies) {
        if (chosen.includes(e)) continue;
        const d = distance(last.pos, e.pos);
        if (d < nd) { nd = d; next = e; }
      }
      if (!next) break;
      chosen.push(next); last = next;
    }
    const chain = chosen.map(e => ({ x: e.pos.x, y: e.pos.y, enemy: e }));   // snapshot positions
    const d0 = distance(p.pos, first.pos);
    this._chainBolts.push({ fromX: p.pos.x, fromY: p.pos.y, toX: first.pos.x, toY: first.pos.y,
                            x: p.pos.x, y: p.pos.y, t: 0, travelTime: Math.max(0.05, d0 / BOLT_SPEED), chain });
    return true;
  }

  // Apply chain damage to a node {x,y,enemy} and pop a small spark at the visible hit point.
  _chainHit(node) {
    if (!node) return;
    const e = node.enemy;
    if (e && e.hp > 0 && this.enemies.includes(e)) {
      const cm  = 1 + 0.15 * this._cardLvl('skeleton_chain_lightning_mastery');
      const dmg = ((e.isBoss() || e.isMegaBoss) ? 8 : 25) * cm;   // reduced vs bosses so it never melts them
      e.takeHit(dmg, this);
      this._tryCorrode(e);
    }
    this.particles.spawnHitSparks(new Vec2(node.x, node.y), CYAN, 7, 3);   // larger spark for readability
  }

  _drawChainLightning(ctx) {
    if (this._chainBolts.length === 0 && this._chainLinks.length === 0) return;
    const time = performance.now() * 0.001;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // Lead bolts — electric-blue projectile: wide glow + cyan core + white head + halo
    for (const b of this._chainBolts) {
      const dx = b.toX - b.fromX, dy = b.toY - b.fromY;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      const tailX = b.x - ux * 20, tailY = b.y - uy * 20;
      ctx.globalAlpha = 0.4; ctx.strokeStyle = '#1f6bff'; ctx.lineWidth = 12;
      ctx.beginPath(); ctx.moveTo(tailX, tailY); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.globalAlpha = 0.8; ctx.strokeStyle = '#3ad0ff'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(tailX, tailY); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.globalAlpha = 1;   ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(b.x - ux * 8, b.y - uy * 8); ctx.lineTo(b.x, b.y); ctx.stroke();
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 10);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(58,160,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, 10, 0, Math.PI * 2); ctx.fill();
    }

    // Chain links — animated jagged lightning with glow + white core + branch forks + node flash
    for (const L of this._chainLinks) {
      if (!L.struck) continue;
      const a   = Math.max(0, L.life / 0.10);
      const dx  = L.bx - L.ax, dy = L.by - L.ay;
      const nl  = Math.hypot(dx, dy) || 1;
      const px  = -dy / nl, py = dx / nl;
      const SEG = 8, pts = [];
      for (let i = 0; i <= SEG; i++) {
        const f  = i / SEG;
        const oi = f * (L.offsets.length - 1), lo = Math.floor(oi), fr = oi - lo;
        const base = L.offsets[Math.min(lo, L.offsets.length - 1)] * (1 - fr)
                   + L.offsets[Math.min(lo + 1, L.offsets.length - 1)] * fr;
        const env  = Math.sin(Math.PI * f);                       // 0 at ends, 1 mid
        const jit  = Math.sin(time * 40 + i * 1.7) * 6 * env;
        const off  = (base + jit);
        pts.push({ x: L.ax + dx * f + px * off, y: L.ay + dy * f + py * off });
      }
      const strokeChain = (w, col, al) => {
        ctx.globalAlpha = al * a; ctx.strokeStyle = col; ctx.lineWidth = w;
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      };
      strokeChain(9, '#1f6bff', 0.35);   // outer glow
      strokeChain(4.5, '#3ad0ff', 0.8);  // blue body
      strokeChain(1.8, '#ffffff', 1);    // white core
      // short branch forks off the middle
      ctx.globalAlpha = 0.5 * a; ctx.strokeStyle = '#9fe6ff'; ctx.lineWidth = 1.4;
      for (let k = 2; k < SEG - 1; k += 3) {
        const o = pts[k], dir = (L.offsets[0] > 0 ? 1 : -1);
        ctx.beginPath(); ctx.moveTo(o.x, o.y);
        ctx.lineTo(o.x + px * dir * 14, o.y + py * dir * 14);
        ctx.stroke();
      }
      // node flashes at both ends
      for (const nd of [pts[0], pts[pts.length - 1]]) {
        const ng = ctx.createRadialGradient(nd.x, nd.y, 0, nd.x, nd.y, 12);
        ng.addColorStop(0, `rgba(255,255,255,${a})`); ng.addColorStop(1, 'rgba(58,208,255,0)');
        ctx.globalAlpha = 1; ctx.fillStyle = ng;
        ctx.beginPath(); ctx.arc(nd.x, nd.y, 12, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  // ── Neon Pierce Beam ──────────────────────────────────────────────────────
  // Cyber Arm Hero's automatic secondary weapon: a straight RED laser from the cyber arm that
  // pierces every enemy on one line (each hit once). No bounce, no chain, no jump, not an ultimate.
  _updateNeonPierceBeam(dt) {
    // Advance + retire short-lived beam visuals
    for (const b of this._neonBeams) b.life -= dt;
    if (this._neonBeams.length) this._neonBeams = this._neonBeams.filter(b => b.life > 0);

    if (this.player.selectedCharacter !== 'cyber_arm_hero') return;   // Cyber Arm Hero only
    this._neonBeamTimer -= dt;
    if (this._neonBeamTimer <= 0) {
      this._neonBeamTimer = this._fireNeonPierceBeam() ? 1.5 : 0.25;  // retry soon if nothing in range
    }
  }

  // Returns true if the beam fired (a valid target existed in range).
  _fireNeonPierceBeam() {
    const p = this.player;
    const nm = this._cardLvl('cyber_neon_pierce_mastery');   // Neon Lance: wider + stronger
    const RANGE = 800, WIDTH = 22 * (1 + 0.20 * nm), DMG = 20 * (1 + 0.15 * nm);

    // Candidates: array enemies + any present singleton mini-boss object
    const singles = [
      this.titanBoss        && this.titanBoss.hp        > 0 ? { obj: this.titanBoss,        die: this._titanDie }        : null,
      this.annihilatorBoss  && this.annihilatorBoss.hp  > 0 ? { obj: this.annihilatorBoss,  die: this._annihilatorDie }  : null,
      this.bloodfangBoss    && this.bloodfangBoss.hp    > 0 ? { obj: this.bloodfangBoss,    die: this._bloodfangDie }    : null,
      this.cyberSerpentBoss && this.cyberSerpentBoss.hp > 0 ? { obj: this.cyberSerpentBoss, die: this._cyberSerpentDie } : null,
      this.cyberDragonBoss  && this.cyberDragonBoss.hp  > 0 ? { obj: this.cyberDragonBoss,  die: this._cyberDragonDie }  : null,
    ].filter(Boolean);

    // Nearest valid target within range sets the beam direction
    let target = null, bestD = RANGE;
    for (const e of this.enemies)  { const d = distance(p.pos, e.pos);     if (d < bestD) { bestD = d; target = e.pos; } }
    for (const s of singles)       { const d = distance(p.pos, s.obj.pos); if (d < bestD) { bestD = d; target = s.obj.pos; } }
    if (!target) return false;

    const aimDir = safeNormalize(new Vec2(target.x - p.pos.x, target.y - p.pos.y));

    // Straight-line pierce test (reused from Overdrive Beam): along/perp vs the beam segment.
    const onBeam = (pos, radius) => {
      const toE   = pos.sub(p.pos);
      const along = toE.dot(aimDir);
      if (along < 0 || along > RANGE) return false;
      const perp  = toE.sub(aimDir.scale(along));
      return perp.lengthSq() < (WIDTH + radius) ** 2;
    };
    const tierDmg = (isMega, isMini) => isMega ? DMG * 0.4 : isMini ? DMG * 0.6 : DMG;  // 8 / 12 / 20

    // Damage each enemy on the line at most once
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!onBeam(e.pos, e.radius)) continue;
      const d = tierDmg(e.isMegaBoss, e.isBoss() && !e.isMegaBoss);
      e.takeHit(d, this);
      this._tryCorrode(e);
      this.particles.spawnHitSparks(e.pos, RED);
    }
    // Singleton mini-bosses on the line (reduced damage, safe death routing)
    for (const s of singles) {
      const b = s.obj;
      if (b.hp <= 0 || !onBeam(b.pos, b.radius)) continue;
      b.hp -= tierDmg(false, true); b.hitFlash = 0.08;
      this.particles.spawnHitSparks(b.pos, RED);
      if (b.hp <= 0) s.die.call(this);
    }

    // One short-lived visual originating from the cyber arm
    const startPos = new Vec2(p.pos.x + aimDir.x * 16, p.pos.y + aimDir.y * 16);
    this._neonBeams.push({ startPos, dir: aimDir, length: RANGE, life: 0.15, maxLife: 0.15, boost: nm });
    this.audio?.playHit?.();
    return true;
  }

  // World-space red pierce beam — layered glow + white-hot core + electric forks,
  // traveling energy pulse, muzzle flash with sparks, and an impact flare. Visual only.
  _drawNeonPierceBeam(ctx) {
    if (!this._neonBeams.length) return;
    const spr   = this._neonBeamSprite;
    const ready = spr && spr.complete && spr.naturalWidth > 0;
    const now   = performance.now() * 0.001;
    ctx.save();
    ctx.lineCap = 'round';
    for (const b of this._neonBeams) {
      const alpha = Math.max(0, b.life / b.maxLife);              // 1 → 0
      const sx = b.startPos.x, sy = b.startPos.y;
      const ex = sx + b.dir.x * b.length, ey = sy + b.dir.y * b.length;
      const ang = Math.atan2(b.dir.y, b.dir.x);
      const px = -b.dir.y, py = b.dir.x;                          // perpendicular unit
      const bw = 1 + 0.35 * (b.boost || 0);                       // Neon Lance widening

      ctx.globalCompositeOperation = 'lighter';

      // 1) wide soft outer glow
      ctx.globalAlpha = 0.32 * alpha;
      ctx.strokeStyle = '#ff1a1a'; ctx.lineWidth = 22 * bw * (0.6 + 0.4 * alpha);
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
      // 2) red body
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#ff3030'; ctx.lineWidth = 10 * bw * alpha + 2;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
      // 3) white-hot core
      ctx.strokeStyle = '#fff0f0'; ctx.lineWidth = Math.max(1.5, 3.5 * bw * alpha);
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();

      // 4) electric forks branching off the beam
      const forks = 5 + (b.boost || 0);
      ctx.strokeStyle = '#ff8a8a'; ctx.lineWidth = 1.3; ctx.globalAlpha = 0.6 * alpha;
      for (let i = 0; i < forks; i++) {
        const f = ((i + (now * 7 % 1)) / forks);
        const bxp = sx + (ex - sx) * f, byp = sy + (ey - sy) * f;
        const side = (i % 2 ? 1 : -1), len = (8 + Math.random() * 18) * bw;
        const mx = bxp + px * side * len * 0.5 + b.dir.x * (Math.random() * 10 - 5);
        const my = byp + py * side * len * 0.5 + b.dir.y * (Math.random() * 10 - 5);
        const tx = bxp + px * side * len + (Math.random() * 8 - 4);
        const ty = byp + py * side * len + (Math.random() * 8 - 4);
        ctx.beginPath(); ctx.moveTo(bxp, byp); ctx.lineTo(mx, my); ctx.lineTo(tx, ty); ctx.stroke();
      }

      // 5) traveling energy pulse (sweeps origin → tip as the beam ages)
      const pt = 1 - alpha, pxp = sx + (ex - sx) * pt, pyp = sy + (ey - sy) * pt;
      let g = ctx.createRadialGradient(pxp, pyp, 0, pxp, pyp, 18 * bw);
      g.addColorStop(0, `rgba(255,230,230,${0.9 * alpha})`); g.addColorStop(1, 'rgba(255,40,40,0)');
      ctx.globalAlpha = 1; ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(pxp, pyp, 18 * bw, 0, Math.PI * 2); ctx.fill();

      // 6) muzzle flash + radiating sparks at the cyber arm
      g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 34 * bw);
      g.addColorStop(0, `rgba(255,140,140,${0.95 * alpha})`);
      g.addColorStop(0.5, `rgba(255,40,40,${0.5 * alpha})`);
      g.addColorStop(1, 'rgba(255,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, 34 * bw, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.8 * alpha; ctx.strokeStyle = '#ffd2d2'; ctx.lineWidth = 1.5;
      for (let i = 0; i < 6; i++) {
        const sa = ang + (i / 6) * Math.PI * 2, rr = 14 + Math.random() * 14;
        ctx.beginPath(); ctx.moveTo(sx + Math.cos(sa) * 6, sy + Math.sin(sa) * 6);
        ctx.lineTo(sx + Math.cos(sa) * rr, sy + Math.sin(sa) * rr); ctx.stroke();
      }

      // 7) impact flare at the far end + expanding ring
      ctx.globalAlpha = 1;
      g = ctx.createRadialGradient(ex, ey, 0, ex, ey, 26 * bw);
      g.addColorStop(0, `rgba(255,210,210,${0.9 * alpha})`); g.addColorStop(1, 'rgba(255,30,30,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ex, ey, 26 * bw, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.7 * alpha; ctx.strokeStyle = '#ff6a6a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(ex, ey, (1 - alpha) * 40 * bw + 6, 0, Math.PI * 2); ctx.stroke();

      // optional asset muzzle on top (kept)
      if (ready) {
        const dh = 60, dw = dh * (spr.naturalWidth / spr.naturalHeight);
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = alpha;
        ctx.translate(sx, sy); ctx.rotate(ang);
        ctx.drawImage(spr, -dw * 0.15, -dh / 2, dw, dh);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // BRAWLER WARRIOR weapons (Phase 1). Every per-frame method guards on
  // selectedCharacter === 'brawler_warrior', so the other 3 characters are unaffected.
  // Damage routes through e.takeHit / singleton mini-boss hp like the other weapons; bosses
  // take reduced damage so nothing is one-shot.
  // ════════════════════════════════════════════════════════════════════════════

  // Uniform list of damageable targets: array enemies + present singleton mini-bosses.
  _brawlerTargets() {
    const list = [];
    for (const e of this.enemies) list.push({ obj: e, arr: true });
    const singles = [
      [this.titanBoss,        this._titanDie],
      [this.annihilatorBoss,  this._annihilatorDie],
      [this.bloodfangBoss,    this._bloodfangDie],
      [this.cyberSerpentBoss, this._cyberSerpentDie],
      [this.cyberDragonBoss,  this._cyberDragonDie],
    ];
    for (const [b, die] of singles) if (b && b.hp > 0) list.push({ obj: b, arr: false, die });
    const _dd = this.doubleDemonsBoss;
    if (_dd && _dd.hp > 0) {
      for (const _body of [_dd.gunner, _dd.claw])
        list.push({ obj: _body, arr: false, die: this._doubleDemonsDie, ddParent: _dd });
    }
    return list;
  }

  _targetIsBoss(t) { return t.arr ? (t.obj.isMegaBoss || t.obj.isBoss()) : true; }

  // Apply a hit (array enemy via takeHit; singleton mini-boss via hp + death routing).
  _brawlerHit(t, dmg, color) {
    const b = t.obj;
    if (t.arr) {
      b.takeHit(dmg, this);
      this._tryCorrode(b);
    } else {
      const _hpObj = t.ddParent || b;
      _hpObj.hp -= dmg; b.hitFlash = 0.08;
      if (_hpObj.hp <= 0) t.die.call(this);
    }
    this.particles.spawnHitSparks(b.pos, color);
  }

  // ── Upgrade-card helpers + corrosive (Phase 1) ──────────────────────────────
  _cardLvl(key) { return this.player.upgrades[key] || 0; }

  // Level of the SELECTED character's primary mastery card (originals only; brawler uses chakram).
  _primaryMasteryLvl() {
    const c = this.player.selectedCharacter;
    if (c === 'skeleton_warrior') return this._cardLvl('skeleton_primary_mastery');
    if (c === 'cyber_arm_hero')   return this._cardLvl('cyber_primary_mastery');
    if (c === 'taekwondo_girl')   return this._cardLvl('taekwondo_primary_mastery');
    return 0;
  }
  // Character-matched primary hit spark color (electric / cyber / aqua).
  _primarySparkColor() {
    const c = this.player.selectedCharacter;
    if (c === 'cyber_arm_hero') return '#ff8a3c';
    if (c === 'taekwondo_girl') return '#14ebd2';
    return '#bfe6ff';   // skeleton blue-white
  }

  // Corrosive Payload: a modest chance for a player hit to apply the existing corrosive DoT.
  _tryCorrode(e) {
    const lvl = this._cardLvl('corrosive_payload');
    if (lvl <= 0 || !e || e.hp <= 0) return;
    if (Math.random() < 0.18 * lvl) {
      e._corrosiveTimer = Math.max(e._corrosiveTimer || 0, 3.0);
      this.particles?.spawnHitSparks?.(e.pos, '#7CFF3C');   // acid-green corrosion splash
    }
  }
  // Centralized corrosive DoT (reuses _corrosiveTimer + _resistDot). Base 1 dmg/s keeps existing
  // drone-applied corrosion identical; Corrosive Payload scales it up. Acid-green bubbling visuals.
  _updateCorrosive(dt) {
    const dps = 1 + 3 * this._cardLvl('corrosive_payload');
    const tick = (t) => {
      if (!t || t.hp <= 0 || !(t._corrosiveTimer > 0)) return;
      t._corrosiveTimer -= dt;
      t.hp -= this._resistDot(t, dps * dt);
      if (Math.random() < dt * 5) this.particles?.spawnHitSparks?.(t.pos, '#7CFF3C');
    };
    for (const e of this.enemies) tick(e);
    tick(this.titanBoss); tick(this.annihilatorBoss); tick(this.bloodfangBoss);
    if (this.doubleDemonsBoss && this.doubleDemonsBoss.hp > 0) {
      const _dd = this.doubleDemonsBoss;
      for (const _body of [_dd.gunner, _dd.claw]) {
        if (!(_body._corrosiveTimer > 0)) continue;
        _body._corrosiveTimer -= dt;
        _dd.hp -= this._resistDot(_dd, dps * dt);
        if (Math.random() < dt * 5) this.particles?.spawnHitSparks?.(_body.pos, '#7CFF3C');
      }
      if (_dd.hp <= 0) this._doubleDemonsDie();
    }
    if (this.titanBoss        && this.titanBoss.hp        <= 0) this._titanDie();
    if (this.annihilatorBoss  && this.annihilatorBoss.hp  <= 0) this._annihilatorDie();
    if (this.bloodfangBoss    && this.bloodfangBoss.hp    <= 0) this._bloodfangDie();
    if (this.cyberSerpentBoss && this.cyberSerpentBoss.hp <= 0) this._cyberSerpentDie();
    if (this.cyberDragonBoss  && this.cyberDragonBoss.hp  <= 0) this._cyberDragonDie();
  }

  // ── Primary: Nexus Chakram ──────────────────────────────────────────────────
  // Throws a spinning energy chakram at the nearest enemy; it flies out (piercing) then
  // returns to the player, damaging on both legs. NOT chain lightning — one travelling disc.
  _updateNexusChakram(dt) {
    if (this._chakrams.length) this._advanceChakrams(dt);   // let in-flight discs finish cleanly
    if (this.player.selectedCharacter !== 'brawler_warrior') return;
    this._chakramTimer -= dt;
    if (this._chakramTimer <= 0) {
      this._chakramTimer = this._fireNexusChakram() ? 1.15 : 0.25;   // retry soon if no target
    }
  }

  _fireNexusChakram() {
    const p = this.player, RANGE = 620;
    let target = null, bestD = RANGE;
    for (const t of this._brawlerTargets()) {
      const d = distance(p.pos, t.obj.pos);
      if (d < bestD) { bestD = d; target = t.obj.pos; }
    }
    if (!target) return false;
    const dir = safeNormalize(new Vec2(target.x - p.pos.x, target.y - p.pos.y));
    const km = this._cardLvl('brawler_chakram_mastery');   // Razor Chakram: +1 pierce, brighter
    this._chakrams.push({ pos: p.pos.clone(), dir, phase: 'out', dist: 0, maxDist: RANGE,
                          speed: 520, dmg: 22, pierceLeft: 3 + km, ang: 0, hit: new Set(), boost: km });
    this.audio?.playShoot?.();
    return true;
  }

  _advanceChakrams(dt) {
    const p = this.player, R = 26;
    for (let i = this._chakrams.length - 1; i >= 0; i--) {
      const c = this._chakrams[i];
      c.ang += dt * 18;   // spin
      if (c.phase === 'out') {
        c.pos.addMut(c.dir.scale(c.speed * dt));
        c.dist += c.speed * dt;
        if (c.dist >= c.maxDist || c.pierceLeft <= 0) { c.phase = 'return'; c.hit.clear(); }
      } else {
        const toP = new Vec2(p.pos.x - c.pos.x, p.pos.y - c.pos.y);
        if (toP.length() < 34) { this._chakrams.splice(i, 1); continue; }   // caught by player
        c.dir = safeNormalize(toP);
        c.pos.addMut(c.dir.scale(c.speed * dt));
      }
      const retMult = c.phase === 'return' ? (0.7 + 0.12 * (c.boost || 0)) : 1.0;   // stronger return per level
      for (const t of this._brawlerTargets()) {
        const b = t.obj;
        if (c.hit.has(b)) continue;
        if (distance(c.pos, b.pos) > R + b.radius) continue;
        c.hit.add(b);
        this._brawlerHit(t, (this._targetIsBoss(t) ? 0.5 : 1) * c.dmg * retMult, '#1fd6a6');
        if (c.phase === 'out' && --c.pierceLeft <= 0) break;
      }
    }
  }

  _drawChakrams(ctx) {
    if (!this._chakrams.length) return;
    const spr = this._weaponImages?.nexus_chakram;
    const ready = spr && spr.complete && spr.naturalWidth > 0;
    for (const c of this._chakrams) {
      ctx.save();
      ctx.translate(c.pos.x, c.pos.y); ctx.rotate(c.ang);
      if (c.boost) {   // Razor Chakram: brighter spinning green/cyan ring trail
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.55;
        ctx.strokeStyle = '#34ff9e'; ctx.lineWidth = 2 + c.boost;
        ctx.beginPath(); ctx.arc(0, 0, 24 + c.boost * 2, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
      if (ready) {
        ctx.drawImage(spr, -26, -26, 52, 52);
      } else {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = '#1fd6a6'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = '#bdfff0'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 1.4); ctx.stroke();
      }
      ctx.restore();
    }
  }

  // ── Secondary: Crescent Rift Claw ───────────────────────────────────────────
  // Periodic crescent slash in front of the brawler — cone CC that knocks back / stuns close
  // normal enemies. Reuses the Sonic Pulse cone logic. Not full-screen, weaker than the ultimate.
  _updateCrescentClaw(dt) {
    for (const s of this._crescentSlashes) s.life -= dt;
    if (this._crescentSlashes.length) this._crescentSlashes = this._crescentSlashes.filter(s => s.life > 0);
    if (this.player.selectedCharacter !== 'brawler_warrior') return;
    this._crescentTimer -= dt;
    if (this._crescentTimer > 0) return;
    const rm = this._cardLvl('brawler_crescent_claw_mastery');   // Rift Render: larger + faster
    this._crescentTimer = 3.2 - 0.3 * rm;

    const p = this.player;
    const aimDir = safeNormalize(p.lastFacingDir || new Vec2(1, 0));
    const RANGE = 145 * (1 + 0.12 * rm), halfCone = ((100 + 8 * rm) * Math.PI / 180) / 2, KB = 230;
    let hits = 0;
    for (const t of this._brawlerTargets()) {
      if (hits >= 10) break;
      const b = t.obj;
      const to = new Vec2(b.pos.x - p.pos.x, b.pos.y - p.pos.y);
      if (to.length() > RANGE + b.radius) continue;
      if (Math.acos(clamp(aimDir.dot(safeNormalize(to)), -1, 1)) > halfCone) continue;
      hits++;
      this._brawlerHit(t, (this._targetIsBoss(t) ? 0.55 : 1) * 34, '#1fd6a6');
      if (t.arr && !this._targetIsBoss(t)) {        // knockback/stun only normal array enemies
        b.vel.addMut(safeNormalize(to).scale(KB));
        b.stunned = Math.max(b.stunned, 0.25);
      }
    }
    this._crescentSlashes.push({ pos: p.pos.clone(), dir: aimDir, range: RANGE, half: halfCone, life: 0.22, maxLife: 0.22 });
    this.audio?.playHit?.();
  }

  _drawCrescentSlashes(ctx) {
    if (!this._crescentSlashes.length) return;
    const spr = this._weaponImages?.crescent_rift_claw;
    const ready = spr && spr.complete && spr.naturalWidth > 0;
    for (const s of this._crescentSlashes) {
      const a = Math.max(0, s.life / s.maxLife);
      ctx.save();
      ctx.translate(s.pos.x, s.pos.y); ctx.rotate(Math.atan2(s.dir.y, s.dir.x));
      ctx.globalAlpha = a;
      if (ready) {
        const h = s.range * 1.7, w = h * (spr.naturalWidth / spr.naturalHeight);
        ctx.drawImage(spr, -w * 0.1, -h / 2, w, h);
      } else {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = '#1fd6a6'; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.arc(0, 0, s.range * 0.8, -s.half, s.half); ctx.stroke();
        ctx.strokeStyle = '#bdfff0'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, s.range * 0.8, -s.half, s.half); ctx.stroke();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // ── Ultimate: Skyfall Lances (SPACE, 100 mana) ──────────────────────────────
  // Vertical energy lances rain around the player / dense clusters over several waves, each a
  // small impact AoE. Clears groups; bosses take reduced damage so they are not one-shot.
  activateSkyfallLances() {
    if (this.gameState !== 'playing' || this.paused || this.gameOver || this.victory || this.upgradeUI) return;
    const p = this.player;
    if (p.selectedCharacter !== 'brawler_warrior') return;     // Brawler Warrior only
    if (this._skyfall) return;                                  // already running
    if (p.mana < ULTIMATE_MANA_COST) {                          // same NOT-ENOUGH-MANA behavior as other ultimates
      this.floatingTexts.push(new FloatingText('NOT ENOUGH MANA', p.pos.clone(), CYAN, 1.0));
      return;
    }
    p.mana -= ULTIMATE_MANA_COST;                               // fixed 100 cost; Mana Core overflow banks toward next cast
    this._skyfall = { t: 0, waveTimer: 0, wave: 0 };
    this.screenShake.trigger(4, 0.3);
    this.audio?.playEventWarning?.();
    this.floatingTexts.push(new FloatingText('SKYFALL LANCES!', p.pos.clone(), '#1fd6a6', 1.4));
  }

  _updateSkyfall(dt) {
    for (const im of this._skyfallImpacts) im.life -= dt;
    if (this._skyfallImpacts.length) this._skyfallImpacts = this._skyfallImpacts.filter(im => im.life > 0);
    const sf = this._skyfall;
    if (!sf) return;
    const lm = this._cardLvl('brawler_skyfall_lances_mastery');   // Lance Storm: extra lances + wider impact
    const DURATION = 3.5, WAVES = 5, PER_WAVE = 7 + lm, DMG = 42, RADIUS = 70 * (1 + 0.12 * lm);
    const interval = DURATION / WAVES;
    sf.t += dt; sf.waveTimer -= dt;
    if (sf.wave < WAVES && sf.waveTimer <= 0) {
      sf.waveTimer = interval; sf.wave++;
      const p = this.player;
      for (let i = 0; i < PER_WAVE; i++) {
        let cx, cy;
        if (this.enemies.length && Math.random() < 0.6) {
          const e = this.enemies[Math.floor(Math.random() * this.enemies.length)];
          cx = e.pos.x + randomRange(-50, 50); cy = e.pos.y + randomRange(-50, 50);
        } else {
          cx = p.pos.x + randomRange(-260, 260); cy = p.pos.y + randomRange(-200, 200);
        }
        const center = new Vec2(cx, cy);
        for (const t of this._brawlerTargets()) {
          if (distance(center, t.obj.pos) > RADIUS + t.obj.radius) continue;
          this._brawlerHit(t, (this._targetIsBoss(t) ? 0.65 : 1) * DMG, '#34ff9e');
        }
        this._skyfallImpacts.push({ pos: center, r: RADIUS, life: 0.45, maxLife: 0.45 });
      }
      this.screenShake.trigger(3, 0.18);
    }
    if (sf.t >= DURATION && sf.wave >= WAVES) this._skyfall = null;
  }

  _drawSkyfall(ctx) {
    if (!this._skyfallImpacts.length) return;
    const spr = this._weaponImages?.skyfall_lances;
    const ready = spr && spr.complete && spr.naturalWidth > 0;
    for (const im of this._skyfallImpacts) {
      const a = Math.max(0, im.life / im.maxLife);
      ctx.save();
      ctx.globalAlpha = a;
      if (ready) {
        const h = 150, w = h * (spr.naturalWidth / spr.naturalHeight), drop = (1 - a) * 40;
        ctx.drawImage(spr, im.pos.x - w / 2, im.pos.y - h + drop, w, h);
      } else {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = '#34ff9e'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(im.pos.x, im.pos.y - 120); ctx.lineTo(im.pos.x, im.pos.y); ctx.stroke();
      }
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a * 0.7;
      ctx.strokeStyle = '#1fd6a6'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(im.pos.x, im.pos.y, im.r * (1 - a * 0.4), 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // ASSASSIN CLONE weapons (Phase 1). Every per-frame method guards on
  // selectedCharacter === 'assassin_clone', so the other 4 characters are unaffected.
  // Damage routes through the shared _brawlerTargets/_brawlerHit helpers (generic target
  // plumbing despite the name); bosses take reduced damage so nothing is one-shot.
  // ════════════════════════════════════════════════════════════════════════════

  // ── Bounce weapon: Plasma Shuriken ──────────────────────────────────────────
  // Periodically throws a spinning shuriken at the nearest enemy; on each hit it ricochets to the
  // next-nearest UNHIT enemy, hitting up to 3 enemies total, then expires. Reuses the shared
  // _brawlerTargets/_brawlerHit helpers (boss damage reduced). Cadence (1.4s) + damage match the
  // old secondary so power is unchanged; the assassin_clone_whip_sword_mastery card still scales it.
  // Pure sprite visual — no glow/laser/orb.
  _updateShuriken(dt) {
    if (this._shurikens.length) this._advanceShurikens(dt);     // let in-flight shurikens finish
    if (this.player.selectedCharacter !== 'assassin_clone') return;
    this._shurikenTimer -= dt;
    if (this._shurikenTimer > 0) return;

    const wm = this._cardLvl('assassin_clone_whip_sword_mastery');   // (card kept; now feeds shuriken)
    const p = this.player, RANGE = 460 * (1 + 0.12 * wm);
    const first = this._nearestTarget(p.pos, RANGE, null);
    if (!first) { this._shurikenTimer = 0.25; return; }              // hold, retry soon
    this._shurikenTimer = 1.4;                                       // unchanged cadence
    this._shurikens.push({
      pos: p.pos.clone(), target: first, hit: new Set(),
      bouncesLeft: 3, dmg: 26 * (1 + 0.16 * wm), speed: 540, ang: 0, life: 2.5,
    });
    this.audio?.playShoot?.();
  }

  // Nearest damageable target wrapper ({obj,arr,die}) to `from` within `range`, excluding any
  // enemy objects already in the `exclude` Set (or null). Reuses the generic _brawlerTargets list.
  _nearestTarget(from, range, exclude) {
    let best = null, bestD = range;
    for (const t of this._brawlerTargets()) {
      if (exclude && exclude.has(t.obj)) continue;
      const d = distance(from, t.obj.pos);
      if (d < bestD) { bestD = d; best = t; }
    }
    return best;
  }

  _advanceShurikens(dt) {
    for (let i = this._shurikens.length - 1; i >= 0; i--) {
      const s = this._shurikens[i];
      s.ang  += dt * 22;          // fast spin
      s.life -= dt;
      // Re-acquire if the current target is gone/dead/already hit.
      if (!s.target || s.hit.has(s.target.obj) || s.target.obj.hp <= 0) {
        s.target = this._nearestTarget(s.pos, 380, s.hit);
      }
      if (!s.target || s.bouncesLeft <= 0 || s.life <= 0) { this._shurikens.splice(i, 1); continue; }
      const tp  = s.target.obj.pos;
      const dir = safeNormalize(new Vec2(tp.x - s.pos.x, tp.y - s.pos.y));
      s.pos.addMut(dir.scale(s.speed * dt));
      if (distance(s.pos, tp) <= s.target.obj.radius + 16) {        // ── hit → bounce
        this._brawlerHit(s.target, (this._targetIsBoss(s.target) ? 0.55 : 1) * s.dmg, '#ff4dd2');
        s.hit.add(s.target.obj);
        s.bouncesLeft--;
        s.target = s.bouncesLeft > 0 ? this._nearestTarget(s.pos, 380, s.hit) : null;
        if (!s.target) { this._shurikens.splice(i, 1); continue; }
      }
    }
  }

  _drawShuriken(ctx) {
    if (!this._shurikens.length) return;
    const spr = this._weaponImages?.suriken_assasin;
    const ready = spr && spr.complete && spr.naturalWidth > 0;
    for (const s of this._shurikens) {
      ctx.save();
      ctx.translate(s.pos.x, s.pos.y); ctx.rotate(s.ang);
      if (ready) {
        const sz = 34;
        ctx.drawImage(spr, -sz / 2, -sz / 2, sz, sz);   // spinning shuriken sprite (no glow/orb)
      } else {
        ctx.strokeStyle = '#ff4dd2'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }
  }

  // ── Ultimate: Chrome Phantom Protocol (SPACE, 100 mana) ─────────────────────
  // Dual-clone assault. Pink phantom + chrome mirror clones flank the assassin while pulsing
  // burst slashes around her over a short duration, then a wider final chrome impact. Bosses
  // take reduced damage so they are not one-shot. Same fixed 100-mana cost as other ultimates.
  activateChromePhantomProtocol() {
    if (this.gameState !== 'playing' || this.paused || this.gameOver || this.victory || this.upgradeUI) return;
    const p = this.player;
    if (p.selectedCharacter !== 'assassin_clone') return;       // Assassin Clone only
    if (this._chromePhantom) return;                            // already running
    if (p.mana < ULTIMATE_MANA_COST) {                          // same NOT-ENOUGH-MANA behavior as other ultimates
      this.floatingTexts.push(new FloatingText('NOT ENOUGH MANA', p.pos.clone(), '#ff4dd2', 1.0));
      return;
    }
    p.mana -= ULTIMATE_MANA_COST;                               // fixed 100 cost; Mana Core overflow banks toward next cast
    this._chromePhantom = { t: 0, pulseTimer: 0, pulse: 0, finalDone: false };
    this.screenShake.trigger(4, 0.3);
    this.audio?.playEventWarning?.();
    this.floatingTexts.push(new FloatingText('CHROME PHANTOM PROTOCOL!', p.pos.clone(), '#ff4dd2', 1.4));
  }

  _updateChromePhantom(dt) {
    for (const f of this._chromeFx) { f.life -= dt; f.r += (f.dr || 0) * dt; }
    if (this._chromeFx.length) this._chromeFx = this._chromeFx.filter(f => f.life > 0);
    const cp = this._chromePhantom;
    if (!cp) return;
    const p = this.player;
    const cm = this._cardLvl('assassin_clone_chrome_phantom_mastery');   // Chrome Phantom Mastery
    const DURATION = 3.0 + 0.4 * cm, RADIUS = 200 * (1 + 0.12 * cm), PULSE_GAP = 0.4, DMG = 28;
    cp.t += dt; cp.pulseTimer -= dt;
    if (cp.pulseTimer <= 0 && cp.t < DURATION) {
      cp.pulseTimer = PULSE_GAP; cp.pulse++;
      for (const t of this._brawlerTargets()) {
        if (distance(p.pos, t.obj.pos) > RADIUS + t.obj.radius) continue;
        this._brawlerHit(t, (this._targetIsBoss(t) ? 0.6 : 1) * DMG, cp.pulse % 2 ? '#ff4dd2' : '#cfd6e0');
      }
      this._chromeFx.push({ pos: p.pos.clone(), r: RADIUS * 0.4, dr: RADIUS * 1.6, life: 0.4, maxLife: 0.4,
                            color: cp.pulse % 2 ? '#ff4dd2' : '#cfd6e0' });
      this.screenShake.trigger(2, 0.12);
    }
    if (!cp.finalDone && cp.t >= DURATION) {   // wider final chrome-mirror impact pulse
      cp.finalDone = true;
      const FR = RADIUS * 1.35;
      for (const t of this._brawlerTargets()) {
        if (distance(p.pos, t.obj.pos) > FR + t.obj.radius) continue;
        this._brawlerHit(t, (this._targetIsBoss(t) ? 0.6 : 1) * DMG * 1.5, '#cfd6e0');
      }
      this._chromeFx.push({ pos: p.pos.clone(), r: FR * 0.5, dr: FR * 1.4, life: 0.5, maxLife: 0.5, color: '#ffd0f4' });
      this.screenShake.trigger(4, 0.2);
      this._chromePhantom = null;
    }
  }

  _drawChromePhantom(ctx) {
    for (const f of this._chromeFx) {   // expanding fade rings (burst / slash pulses)
      const a = Math.max(0, f.life / f.maxLife);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a;
      ctx.strokeStyle = f.color; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(f.pos.x, f.pos.y, f.r, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    const cp = this._chromePhantom;
    if (!cp) { ctx.globalAlpha = 1; return; }
    const p = this.player;
    // Two orbiting clone overlays flanking the player: pink phantom + chrome mirror.
    const orbit = 56, ang = cp.t * 6;
    const clones = [
      { spr: this._assassinPhantomSprite, ox: Math.cos(ang) * orbit,            oy: Math.sin(ang) * orbit,            tint: '#ff4dd2' },
      { spr: this._assassinChromeSprite,  ox: Math.cos(ang + Math.PI) * orbit,  oy: Math.sin(ang + Math.PI) * orbit,  tint: '#cfd6e0' },
    ];
    for (const c of clones) {
      const cx = p.pos.x + c.ox, cy = p.pos.y + c.oy;
      // Soft tinted glow behind the clone so both read clearly against late-game crowds.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.30;
      const glow = ctx.createRadialGradient(cx, cy - 30, 4, cx, cy - 30, 46);
      glow.addColorStop(0, c.tint); glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(cx, cy - 30, 46, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 0.9;
      if (c.spr && c.spr.complete && c.spr.naturalWidth > 0) {
        const h = 80, w = h * (c.spr.naturalWidth / c.spr.naturalHeight);
        ctx.shadowColor = c.tint; ctx.shadowBlur = 14;
        ctx.drawImage(c.spr, cx - w / 2, cy - h, w, h);
      } else {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = c.tint;
        ctx.beginPath(); ctx.ellipse(cx, cy - 18, 16, 34, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // ── Aqua Spirit Trail (Neon Taekwondo Girl secondary) ───────────────────────
  // Passive: while she MOVES she leaves cyan spirit-water puddles. Enemies standing in a
  // puddle take gradual, capped damage. Bosses take heavily reduced damage. No knockback,
  // no instant kills, count-limited for performance. Standing still spawns nothing.
  _updateAquaTrail(dt) {
    const AQUA_TICK = 0.25, AQUA_CAP = 16;  // per-tick + per-enemy/per-puddle cap
    const AQUA_NORMAL_TICK = 2.0 * (1 + 0.2 * this._cardLvl('taekwondo_aqua_trail_mastery'));  // Spirit Current: harder

    // Advance + retire puddles, and apply DoT (runs for any character so leftover puddles still fade)
    const puddles = this._aquaPuddles;
    for (let i = puddles.length - 1; i >= 0; i--) {
      const pud = puddles[i];
      pud.t += dt;
      if (pud.t >= pud.life) { puddles.splice(i, 1); continue; }
      pud.dmgTimer -= dt;
      if (pud.dmgTimer <= 0) {
        pud.dmgTimer = AQUA_TICK;
        this._applyAquaPuddleDamage(pud, AQUA_NORMAL_TICK, AQUA_CAP);
      }
    }

    if (this.player.selectedCharacter !== 'taekwondo_girl') return;
    return;   // Aqua Spirit Trail disabled — replaced by Spirit Crescent Kicks

    // Spawn only while actually moving (ignore tiny jitter) — never while standing still.
    if (this.player.vel.lengthSq() < 25 * 25) return;
    this._aquaTrailTimer -= dt;
    if (this._aquaTrailTimer <= 0) {
      this._aquaTrailTimer = 0.20;                       // every ~0.2s while moving
      if (puddles.length < 22) {                         // count cap for performance
        puddles.push({ pos: this.player.pos.clone(), t: 0, life: randomRange(3.0, 3.8),
                       radius: randomRange(38, 48), dmgTimer: 0, hits: new Map(),
                       seed: Math.random() * 6.28 });
      }
    }
  }

  _applyAquaPuddleDamage(pud, normalTick, cap) {
    const tierTick = (isMega, isMini) => isMega ? normalTick * 0.2 : isMini ? normalTick * 0.4 : normalTick;
    const tierCap  = (isMega, isMini) => isMega ? cap * 0.2 : isMini ? cap * 0.4 : cap;

    const hitOne = (obj, isMega, isMini, applyDmg) => {
      if (distance(obj.pos, pud.pos) > pud.radius + obj.radius) return;
      const done = pud.hits.get(obj) || 0;
      const lim  = tierCap(isMega, isMini);
      if (done >= lim) return;
      const dmg = Math.min(tierTick(isMega, isMini), lim - done);
      if (dmg <= 0) return;
      pud.hits.set(obj, done + dmg);
      applyDmg(dmg);
    };

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      hitOne(e, e.isMegaBoss, e.isBoss() && !e.isMegaBoss, (d) => {
        e.takeHit(this._resistDot(e, d), this);
        if (Math.random() < 0.12) this.particles.spawnHitSparks(e.pos, CYAN);
      });
    }
    // Singleton mini-bosses (reduced damage, safe death routing) — same pattern as the beam/chains
    const singles = [
      [this.titanBoss,        this._titanDie],
      [this.annihilatorBoss,  this._annihilatorDie],
      [this.bloodfangBoss,    this._bloodfangDie],
      [this.cyberSerpentBoss, this._cyberSerpentDie],
      [this.cyberDragonBoss,  this._cyberDragonDie],
    ];
    for (const [b, die] of singles) {
      if (!b || b.hp <= 0) continue;
      hitOne(b, false, true, (d) => { b.hp -= this._resistDot(b, d); b.hitFlash = 0.08; if (b.hp <= 0) die.call(this); });
    }
    if (this.doubleDemonsBoss && this.doubleDemonsBoss.hp > 0) {
      const _dd = this.doubleDemonsBoss;
      for (const _body of [_dd.gunner, _dd.claw]) {
        hitOne(_body, false, true, (d) => {
          _dd.hp -= this._resistDot(_dd, d); _body.hitFlash = 0.08;
          if (_dd.hp <= 0) this._doubleDemonsDie();
        });
      }
    }
  }

  // Ground-layer puddles: translucent cyan/teal spirit-water with the asset texture on top.
  _drawAquaPuddles(ctx) {
    if (!this._aquaPuddles.length) return;
    const spr   = this._aquaTrailSprite;
    const ready = spr && spr.complete && spr.naturalWidth > 0;
    const now   = performance.now() / 1000;
    ctx.save();
    for (const pud of this._aquaPuddles) {
      const r    = pud.radius;
      const grow = Math.min(1, pud.t / 0.25);                       // quick fade-in
      const fade = Math.min(1, (pud.life - pud.t) / 0.8);           // fade-out over last 0.8s
      const a    = Math.max(0, Math.min(grow, fade));
      const pulse = 0.85 + 0.15 * Math.sin(now * 3 + pud.seed);

      // Soft translucent water glow (additive teal core + cyan rim)
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(pud.pos.x, pud.pos.y, r * 0.15, pud.pos.x, pud.pos.y, r);
      g.addColorStop(0,   'rgba(60,230,255,' + (0.30 * a) + ')');
      g.addColorStop(0.6, 'rgba(40,140,255,' + (0.16 * a) + ')');
      g.addColorStop(1,   'rgba(150,80,255,0)');                    // subtle purple highlight at edge
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(pud.pos.x, pud.pos.y, r * pulse, r * 0.7 * pulse, 0, 0, Math.PI * 2); ctx.fill();

      // Asset texture on top (normal blend, kept low-alpha so it reads as spirit-water footprints)
      if (ready) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.5 * a;
        const w = r * 2 * pulse, h = r * 1.5 * pulse;
        ctx.drawImage(spr, pud.pos.x - w / 2, pud.pos.y - h / 2, w, h);
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }

  // ── Spirit Crescent Kicks (Neon Taekwondo Girl auto-weapon) ──────────────────
  // Auto-fires spinning cyan crescents at the NEAREST enemies; they fly out and pierce
  // several foes. Fire rate + extra crescents scale with her primary mastery card.
  _updateSpiritKicks(dt) {
    const sk = this._spiritKicks;
    const p = this.player;

    // advance live crescents: move, spin, trail, collide, expire
    for (let i = sk.blades.length - 1; i >= 0; i--) {
      const b = sk.blades[i];
      b.t += dt; b.rot += b.spin * dt;
      b.pos.x += b.vel.x * dt; b.pos.y += b.vel.y * dt;
      b.trail.push({ x: b.pos.x, y: b.pos.y }); if (b.trail.length > 6) b.trail.shift();
      for (const e of this.enemies) {
        if (b.hits.has(e)) continue;
        if (distance(e.pos, b.pos) < b.radius + e.radius) {
          const boss = e.isBoss() || e.isMegaBoss;
          e.takeHit(boss ? b.bossDmg : b.dmg, this);
          this.particles.spawnHitSparks(e.pos, CYAN);
          b.hits.add(e);
          if (b.hits.size >= b.pierce) { b.dead = true; break; }
        }
      }
      if (b.dead || b.t >= b.life) sk.blades.splice(i, 1);
    }

    if (p.selectedCharacter !== 'taekwondo_girl') return;
    if (this.gameState !== 'playing' || this.paused || this.upgradeUI) return;

    // auto-fire at the nearest enemies
    sk.timer -= dt;
    if (sk.timer > 0) return;
    const lvl = this._cardLvl('taekwondo_primary_mastery');
    sk.timer = 0.70 / (1 + 0.12 * lvl);                       // faster with mastery (tunable)
    if (this.enemies.length === 0) { sk.timer = 0.12; return; }

    const count = 1 + (lvl >= 3 ? 1 : 0) + (lvl >= 6 ? 1 : 0); // extra crescents at higher mastery
    const near = this.enemies.map(e => ({ e, d: distance(e.pos, p.pos) }))
                             .sort((a, b) => a.d - b.d).slice(0, count);
    const km = this._cardLvl('taekwondo_aqua_trail_mastery');        // Spirit Pierce (0..3)
    const SPEED = 540, DMG = 26, BOSSDMG = 6, LIFE = 0.9;
    const PIERCE = 4 + km;                                            // +1 pierce / level (4 → 7)
    const HITR = 30 * (1 + 0.08 * km);                               // +8% hit arc / level
    for (let k = 0; k < count; k++) {
      const tgt = (near[k] || near[0]).e;
      let dir = safeNormalize(tgt.pos.sub(p.pos));
      if (dir.lengthSq() < 0.001) dir = (p.lastFacingDir && p.lastFacingDir.lengthSq() > 0.001)
        ? safeNormalize(p.lastFacingDir.clone()) : new Vec2(1, 0);
      sk.blades.push({
        pos: p.pos.clone(), vel: dir.scale(SPEED),
        rot: Math.atan2(dir.y, dir.x), spin: 16, t: 0, life: LIFE,
        radius: HITR, dmg: DMG, bossDmg: BOSSDMG, pierce: PIERCE,
        hits: new Set(), trail: [], dead: false,
      });
    }
  }

  _drawSpiritKicks(ctx) {
    const sk = this._spiritKicks;
    if (!sk.blades.length) return;
    ctx.save();
    ctx.lineCap = 'round';
    for (const b of sk.blades) {
      const a = Math.max(0, Math.min(1, (b.life - b.t) / 0.18));
      // trail
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < b.trail.length; i++) {
        const tp = b.trail[i], ta = (i + 1) / b.trail.length * 0.3 * a;
        ctx.globalAlpha = ta; ctx.fillStyle = CYAN;
        ctx.beginPath(); ctx.arc(tp.x, tp.y, b.radius * 0.5 * (0.4 + 0.6 * (i / b.trail.length)), 0, Math.PI * 2); ctx.fill();
      }
      // crescent blade
      ctx.save();
      ctx.translate(b.pos.x, b.pos.y);
      ctx.rotate(b.rot);
      const R = b.radius * 0.7, a0 = -2.3, a1 = 2.3;
      const arc = (w, col, al) => { ctx.globalAlpha = al * a; ctx.strokeStyle = col; ctx.lineWidth = w;
        ctx.beginPath(); ctx.arc(0, 0, R, a0, a1); ctx.stroke(); };
      arc(9, '#1fd0ff', 0.40);   // glow
      arc(5, '#3ad0ff', 0.85);   // body
      arc(2, '#eaffff', 1);      // core
      ctx.globalAlpha = a; ctx.fillStyle = '#eaffff';
      for (const aa of [a0, a1]) {                 // sharp tips
        const tx = Math.cos(aa) * R, ty = Math.sin(aa) * R;
        const nx = Math.cos(aa + Math.PI / 2), ny = Math.sin(aa + Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(tx + Math.cos(aa) * 6, ty + Math.sin(aa) * 6);
        ctx.lineTo(tx + nx * 3, ty + ny * 3); ctx.lineTo(tx - nx * 3, ty - ny * 3);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // ── Spirit Dojang Flag ultimate (Neon Taekwondo Girl, SPACE, 100 mana) ───────
  // Plants a flag at the cast position; a 7s circular cyan dojo field damages enemies over time
  // and slightly slows normal enemies. Bosses take controlled, capped damage and are not slowed.
  activateSpiritDojang() {
    if (this.gameState !== 'playing' || this.paused || this.gameOver || this.victory || this.upgradeUI) return;
    const p = this.player;
    if (p.selectedCharacter !== 'taekwondo_girl') return;   // Neon Taekwondo Girl only
    if (this.spiritDojang) return;                          // already running
    if (p.mana < ULTIMATE_MANA_COST) {                      // same NOT-ENOUGH-MANA behavior as other ultimates
      this.floatingTexts.push(new FloatingText('NOT ENOUGH MANA', p.pos.clone(), CYAN, 1.0));
      return;
    }
    p.mana -= ULTIMATE_MANA_COST;                           // fixed 100 cost; Mana Core overflow banks toward next cast
    this.spiritDojang = { pos: p.pos.clone(), t: 0, dmgTimer: 0,
                          miniDmgThisSec: 0, megaDmgThisSec: 0, bossDmgTimer: 1.0,
                          particles: [], partTimer: 0 };
    this.screenShake.trigger(4, 0.25);
    this.audio?.playEventWarning?.();
    this.floatingTexts.push(new FloatingText('SPIRIT DOJANG FLAG!', p.pos.clone(), CYAN, 1.4));
  }

  _updateSpiritDojang(dt) {
    const sd = this.spiritDojang;
    if (!sd) return;
    const DURATION = 7, RADIUS = 205 * (1 + 0.12 * this._cardLvl('taekwondo_dojang_flag_mastery'));
    const TICK = 0.25, NORMAL_DMG = 9;       // 36 DPS to normal enemies
    const MINI_CAP = 28, MAIN_CAP = 42;      // per-second boss caps (controlled / safe)
    const SLOW = 0.30;                       // 30% slow on normal enemies inside the field

    sd.t += dt;

    // Subtle martial-arts spirit particles rising inside the field
    sd.partTimer -= dt;
    if (sd.t < DURATION - 0.3 && sd.partTimer <= 0) {
      sd.partTimer = 0.10;
      const ang = Math.random() * Math.PI * 2;
      const rr  = Math.sqrt(Math.random()) * RADIUS;
      sd.particles.push({ x: sd.pos.x + Math.cos(ang) * rr, y: sd.pos.y + Math.sin(ang) * rr,
                          life: randomRange(0.5, 0.9), maxLife: 0.9,
                          vy: randomRange(20, 40), size: randomRange(2, 4) });
    }
    for (const pt of sd.particles) { pt.life -= dt; pt.y -= pt.vy * dt; }
    sd.particles = sd.particles.filter(pt => pt.life > 0);

    // Per-second boss-damage budget reset (keeps bosses controlled / unbreakable)
    sd.bossDmgTimer -= dt;
    if (sd.bossDmgTimer <= 0) { sd.bossDmgTimer = 1.0; sd.miniDmgThisSec = 0; sd.megaDmgThisSec = 0; }

    // Slow normal enemies inside the field — Game-side, no Enemy.js change (same idea as knockback):
    // cancel a fraction of the movement they just applied this frame. Bosses + stunned are skipped.
    for (const e of this.enemies) {
      if (e.isBoss() || e.isMegaBoss || e.stunned > 0) continue;
      if (distance(e.pos, sd.pos) <= RADIUS + e.radius) e.pos.subMut(e.vel.scale(SLOW * dt));
    }

    // Repeating damage ticks
    sd.dmgTimer -= dt;
    if (sd.dmgTimer <= 0) {
      sd.dmgTimer = TICK;
      const bossHit = (isMega) => {
        const cap  = isMega ? MAIN_CAP : MINI_CAP;
        const used = isMega ? sd.megaDmgThisSec : sd.miniDmgThisSec;
        const dmg  = Math.min(cap * TICK, cap - used);
        if (dmg <= 0) return 0;
        if (isMega) sd.megaDmgThisSec += dmg; else sd.miniDmgThisSec += dmg;
        return dmg;
      };
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i];
        if (distance(e.pos, sd.pos) > RADIUS + e.radius) continue;
        if (e.isMegaBoss)    { const d = bossHit(true);  if (d > 0) e.takeHit(d, this); }
        else if (e.isBoss()) { const d = bossHit(false); if (d > 0) e.takeHit(d, this); }
        else                 { e.takeHit(NORMAL_DMG, this); if (Math.random() < 0.25) this.particles.spawnHitSparks(e.pos, CYAN); }
      }
      const hitSingle = (b, die) => {
        if (!b || b.hp <= 0 || distance(b.pos, sd.pos) > RADIUS + b.radius) return;
        const d = bossHit(false); if (d <= 0) return;
        b.hp -= d; b.hitFlash = 0.08;
        if (b.hp <= 0) die.call(this);
      };
      hitSingle(this.titanBoss,        this._titanDie);
      hitSingle(this.annihilatorBoss,  this._annihilatorDie);
      hitSingle(this.bloodfangBoss,    this._bloodfangDie);
      hitSingle(this.cyberSerpentBoss, this._cyberSerpentDie);
      hitSingle(this.cyberDragonBoss,  this._cyberDragonDie);
      if (this.doubleDemonsBoss && this.doubleDemonsBoss.hp > 0) {
        const _dd = this.doubleDemonsBoss;
        for (const _body of [_dd.gunner, _dd.claw]) {
          if (distance(_body.pos, sd.pos) <= RADIUS + _body.radius) {
            const _d = bossHit(false); if (_d > 0) {
              _dd.hp -= _d; _body.hitFlash = 0.08;
              if (_dd.hp <= 0) { this._doubleDemonsDie(); break; }
            }
          }
        }
      }
    }

    if (sd.t >= DURATION) this.spiritDojang = null;
  }

  // World-space: cyan dojo field aura + rising spirit particles + the flag asset at the cast point.
  _drawSpiritDojang(ctx) {
    const sd = this.spiritDojang;
    if (!sd) return;
    const RADIUS = 205 * (1 + 0.12 * this._cardLvl('taekwondo_dojang_flag_mastery')), DURATION = 7;
    const a = Math.max(0, Math.min(sd.t / 0.3, (DURATION - sd.t) / 0.6, 1));   // fade in/out
    const now = performance.now() / 1000;
    const pulse = 0.5 + 0.5 * Math.sin(now * 2.2);

    // Translucent cyan/blue field fill (additive — character + enemies stay readable through it)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(sd.pos.x, sd.pos.y, RADIUS * 0.2, sd.pos.x, sd.pos.y, RADIUS);
    g.addColorStop(0,   'rgba(40,200,255,' + (0.16 * a) + ')');
    g.addColorStop(0.7, 'rgba(40,120,255,' + (0.10 * a) + ')');
    g.addColorStop(1,   'rgba(150,80,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(sd.pos.x, sd.pos.y, RADIUS, 0, Math.PI * 2); ctx.fill();

    // Bright pulsing rim
    ctx.globalAlpha = (0.4 + 0.3 * pulse) * a;
    ctx.strokeStyle = CYAN; ctx.lineWidth = 2.5;
    ctx.shadowColor = CYAN; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(sd.pos.x, sd.pos.y, RADIUS - 2, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;

    // Spirit particles
    for (const pt of sd.particles) {
      ctx.globalAlpha = (pt.life / pt.maxLife) * 0.8 * a;
      ctx.fillStyle = '#bfefff';
      ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // Flag asset at the centre (normal blend, drawn last so it reads clearly)
    const spr = this._dojangFlagSprite;
    if (spr && spr.complete && spr.naturalWidth > 0) {
      const h = 96, w = h * (spr.naturalWidth / spr.naturalHeight);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.drawImage(spr, sd.pos.x - w / 2, sd.pos.y - h, w, h);   // pole base anchored at cast point
      ctx.restore();
    } else {
      ctx.save();
      ctx.globalAlpha = a;
      ctx.strokeStyle = CYAN; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(sd.pos.x, sd.pos.y); ctx.lineTo(sd.pos.x, sd.pos.y - 80); ctx.stroke();
      ctx.fillStyle = 'rgba(40,200,255,0.8)';
      ctx.fillRect(sd.pos.x, sd.pos.y - 80, 34, 22);
      ctx.restore();
    }
  }

  // ── CYBER RIDE ultimate (Neon Taekwondo Girl, SPACE, 100 mana) ───────────────
  // She summons a neon speeder: steer with normal movement (WASD/arrows) at huge speed,
  // ram enemies, and twin headlight LASERS fire forward. Reverts to normal when it ends.
  activateCyberBikeRush() {
    if (this.gameState !== 'playing' || this.paused || this.gameOver || this.victory || this.upgradeUI) return;
    const p = this.player;
    if (p.selectedCharacter !== 'taekwondo_girl') return;
    if (this._cyberBike) return;
    if (p.mana < ULTIMATE_MANA_COST) {
      this.floatingTexts.push(new FloatingText('NOT ENOUGH MANA', p.pos.clone(), CYAN, 1.0));
      return;
    }
    p.mana -= ULTIMATE_MANA_COST;
    const dir = (p.lastFacingDir && p.lastFacingDir.lengthSq() > 0.001) ? safeNormalize(p.lastFacingDir.clone()) : new Vec2(1, 0);
    const speedAdded = 1.2;                       // +120% move speed while riding (tunable)
    p.speedBonus = (p.speedBonus || 0) + speedAdded;
    this._cyberBike = { t: 0, fireTimer: 0, dir, beams: [], hits: new Map(), speedAdded };
    this.screenShake.trigger(5, 0.25);
    this.audio?.playEventWarning?.();
    this.floatingTexts.push(new FloatingText('CYBER RIDE!', p.pos.clone(), CYAN, 1.4));
  }

  _updateCyberBikeRush(dt) {
    const bk = this._cyberBike;
    if (!bk) return;
    const p = this.player;
    const DURATION = 5.0;                                            // ride length (tunable)
    const RAM_R = 46, RAM_DMG = 42, RAM_BOSS = 7, KNOCK = 430;       // ram values (tunable)
    const FIRE_EVERY = 0.42, RANGE = 620, WIDTH = 24, LASER_DMG = 22, LASER_BOSS = 5;
    bk.t += dt;

    // steer with the player's current movement direction (WASD / arrows)
    if (p.lastFacingDir && p.lastFacingDir.lengthSq() > 0.001) bk.dir = safeNormalize(p.lastFacingDir.clone());
    const dir = bk.dir;

    // ram enemies the bike drives through (per-enemy re-hit cooldown)
    for (const [e, cd] of bk.hits) { const n = cd - dt; if (n <= 0) bk.hits.delete(e); else bk.hits.set(e, n); }
    for (const e of this.enemies) {
      if (bk.hits.has(e)) continue;
      if (distance(e.pos, p.pos) < RAM_R + e.radius) {
        const boss = e.isBoss() || e.isMegaBoss;
        e.takeHit(boss ? RAM_BOSS : RAM_DMG, this);
        if (!boss) e.vel.addMut(safeNormalize(e.pos.sub(p.pos)).scale(KNOCK));
        this.particles.spawnHitSparks(e.pos, CYAN);
        bk.hits.set(e, 0.45);
      }
    }

    // twin headlight lasers fire forward on a short cycle (hitscan pierce)
    bk.fireTimer -= dt;
    if (bk.fireTimer <= 0) {
      bk.fireTimer = FIRE_EVERY;
      const ox = p.pos.x + dir.x * 24, oy = (p.pos.y - 4) + dir.y * 24;
      for (const e of this.enemies) {
        const tx = e.pos.x - ox, ty = e.pos.y - oy;
        const along = tx * dir.x + ty * dir.y;
        if (along < 0 || along > RANGE) continue;
        const pX = tx - dir.x * along, pY = ty - dir.y * along;
        if (pX * pX + pY * pY < (WIDTH + e.radius) ** 2) {
          const boss = e.isBoss() || e.isMegaBoss;
          e.takeHit(boss ? LASER_BOSS : LASER_DMG, this);
          this.particles.spawnHitSparks(e.pos, CYAN);
        }
      }
      bk.beams.push({ x: ox, y: oy, dx: dir.x, dy: dir.y, len: RANGE, life: 0.18, maxLife: 0.18 });
      this.audio?.playHit?.();
    }
    for (const b of bk.beams) b.life -= dt;
    bk.beams = bk.beams.filter(b => b.life > 0);

    // end: remove the speed buff and revert to normal
    if (bk.t >= DURATION) {
      p.speedBonus = Math.max(0, (p.speedBonus || 0) - bk.speedAdded);
      this._cyberBike = null;
      this.floatingTexts.push(new FloatingText('RIDE OVER', p.pos.clone(), CYAN, 0.8));
    }
  }

  // Drawn BEFORE the player so she sits on the bike. Beams + neon speeder oriented to travel dir.
  _drawCyberBikeRush(ctx) {
    const bk = this._cyberBike;
    if (!bk) return;
    const p = this.player;
    const DURATION = 5.0;
    const a = Math.max(0, Math.min(bk.t / 0.25, (DURATION - bk.t) / 0.4, 1));
    const ang = Math.atan2(bk.dir.y, bk.dir.x);

    // headlight laser beams (world space)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const b of bk.beams) {
      const al = (b.life / b.maxLife) * a;
      const ex = b.x + b.dx * b.len, ey = b.y + b.dy * b.len;
      ctx.globalAlpha = 0.30 * al; ctx.strokeStyle = '#1fd0ff'; ctx.lineWidth = 22;
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.globalAlpha = 0.85 * al; ctx.strokeStyle = CYAN; ctx.lineWidth = 9 * al + 2;
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.globalAlpha = al; ctx.strokeStyle = '#eaffff'; ctx.lineWidth = 3 * al + 1;
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(ex, ey); ctx.stroke();
      const mg = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 26);
      mg.addColorStop(0, `rgba(190,240,255,${0.9 * al})`); mg.addColorStop(1, 'rgba(31,208,255,0)');
      ctx.globalAlpha = 1; ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(b.x, b.y, 26, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // neon speeder under the rider, oriented to travel direction
    ctx.save();
    ctx.translate(p.pos.x, p.pos.y + 10);
    ctx.rotate(ang);
    ctx.globalAlpha = a;
    // underglow
    let g = ctx.createRadialGradient(0, 0, 4, 0, 0, 52);
    g.addColorStop(0, 'rgba(31,208,255,0.45)'); g.addColorStop(1, 'rgba(31,208,255,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, 52, 26, 0, 0, Math.PI * 2); ctx.fill();
    // speed streaks behind
    ctx.strokeStyle = 'rgba(120,240,255,0.5)'; ctx.lineWidth = 2;
    for (let i = -2; i <= 2; i++) {
      ctx.globalAlpha = a * (0.5 - Math.abs(i) * 0.12);
      ctx.beginPath(); ctx.moveTo(-26, i * 5); ctx.lineTo(-26 - (34 + Math.random() * 18), i * 6); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a;
    // wheels
    ctx.fillStyle = '#04161e'; ctx.strokeStyle = CYAN; ctx.lineWidth = 2;
    for (const wx of [-22, 24]) { ctx.beginPath(); ctx.ellipse(wx, 0, 6, 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    // chassis (nose at +x = travel dir)
    ctx.fillStyle = '#06222e'; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(34, 0); ctx.lineTo(16, -9); ctx.lineTo(-20, -8); ctx.lineTo(-30, 0);
    ctx.lineTo(-20, 8); ctx.lineTo(16, 9); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#8af3ff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-24, 0); ctx.lineTo(30, 0); ctx.stroke();
    // headlight glow at the nose
    ctx.globalCompositeOperation = 'lighter';
    g = ctx.createRadialGradient(32, 0, 0, 32, 0, 14);
    g.addColorStop(0, 'rgba(234,255,255,0.95)'); g.addColorStop(1, 'rgba(31,208,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(32, 0, 14, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  _updateEnemies(dt) {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.update(dt, this);
      e.keepInBounds();

      // Dash intercept: dashing into a carrying enemy forces core drop
      if (e.carryingCore !== null && this.player.dashTimer > 0) {
        if (distance(e.pos, this.player.pos) < e.radius + PLAYER_RADIUS + 3) {
          e.takeHit(2, this);
          this.floatingTexts.push(new FloatingText('DASH INTERCEPT!', e.pos.clone(), CYAN, 1.0));
        }
      }
    }
  }

  _updateOverload(dt) {
    // Chaos Mode has no Nexus — the overload system is Nexus-based, so skip it entirely.
    if (this._chaosMode) return;

    const groundCount  = this.groundCores.length;
    const carriedCount = this.enemies.filter(e => e.carryingCore !== null).length;
    const emptySlots   = this.matrices.reduce((sum, m) => sum + (m.capacity - m.stored), 0);

    // ── Event-based dump hit: each newly dumped core gives an immediate overload spike ──
    // Detected by comparing groundCores.length to last frame. This is the primary gameplay
    // signal — the bar jumps visibly when enemies win (dump cores), giving clear feedback.
    const newDumps = Math.max(0, groundCount - this._prevGroundCoreCount);
    if (newDumps > 0) {
      this.overload = Math.min(OVERLOAD_CAP, this.overload + newDumps * OVERLOAD_DUMP_HIT);
    }
    this._prevGroundCoreCount = groundCount;

    // ── Passive chaosGain — scales with ongoing grid pressure ──────────────────────────
    // groundCores already on the ground + enemies still carrying + empty Nexus slots.
    let chaosGain = Math.min(OVERLOAD_CHAOS_GAIN_CAP,
      groundCount * OVERLOAD_GROUND_RATE +
      carriedCount * OVERLOAD_CARRY_RATE +
      emptySlots   * OVERLOAD_SLOT_RATE);

    // Endless: gentle live-threat pressure so ignoring objectives becomes a real threat by
    // ~20–30 min. Scales with enemies on screen + active boss (capped; never instantly lethal).
    if (this.endless) {
      const bossAlive = (this.megaBoss && this.megaBoss.hp > 0) || this.titanBoss || this.annihilatorBoss || this.bloodfangBoss;
      chaosGain += Math.min(0.06, this.enemies.length * 0.0006) + (bossAlive ? 0.03 : 0);
    }

    // Grid Stabilizer Protocol (grid_legend) + Grid Stabilizer card: Endless only.
    if (this.endless) {
      const red = Math.min(0.65, (this.meta.hasAchievement('grid_legend') ? 0.5 : 0)
                                  + 0.05 * this._cardLvl('achievement_grid_stabilizer'));
      chaosGain *= (1 - red);
    }

    if (chaosGain === 0) {
      // Grid fully secure — drain slowly. OVERLOAD_DRAIN_RATE is 0.12/s (was 1.0/s — that
      // was wiping gains within seconds and making the bar feel stuck at 0).
      this.overload = Math.max(0, this.overload - OVERLOAD_DRAIN_RATE * dt);
    } else {
      // Scale with time: ramps faster mid/late so sustained grid neglect bites after 10 min.
      const minutes  = this.timeAlive / 60;
      const diffMult = Math.min(2.6, 1.0 + minutes * 0.05) * (1 - this.player.overloadDampening);
      this.overload  = clamp(this.overload + chaosGain * diffMult * dt, 0, OVERLOAD_CAP);
    }

    // ── Gentle Act 1 passive floor — very light background tension on a fully secure grid ──
    // OVERLOAD_ACT1_FLOOR_RATE = 1.5 %/min (was 5 %/min), max OVERLOAD_ACT1_FLOOR_MAX = 20%.
    // Primary pressure is gameplay-driven (dump hits + passive chaosGain). The floor just
    // prevents the bar from feeling completely dead even when the player plays perfectly.
    // Not applied in Endless (Endless has its own chaosGain pressure from enemy count + boss).
    if (!this.endless && chaosGain === 0) {
      const mins     = this.timeAlive / 60;
      const floorPct = Math.min(OVERLOAD_ACT1_FLOOR_MAX, mins * OVERLOAD_ACT1_FLOOR_RATE);
      this.overload  = Math.min(OVERLOAD_CAP, Math.max(this.overload, floorPct));
    }

    if (this.audio) this.audio.updateAlarm(this.overload);
  }

  // World cores are tied to Matrix state — never unlimited. The number of recoverable
  // cores in play tracks how much the matrices are MISSING: full grid → ~no new cores;
  // depleted grid → spawn replacements (near the depleted matrices) so recovery is possible.
  _updateCoreEconomy(dt) {
    if (!this.matrices.length) return;

    // Cores are NOT generated here — they are minted only when enemies steal charge (conserved
    // 1:1 with the dropped core's value in PowerMatrix.stealCore). This pass is a READABILITY
    // GUARANTEE that bounds loose GROUND cores three ways so the field never floods:
    //   (1) Hard COUNT cap — at most MAX_GROUND_CORES cores on the ground, regardless of deficit.
    //   (2) Hard VALUE cap — ground-core value must not exceed the real Matrix deficit minus the
    //       value already in-transit (carried by the player or by enemies). No buffer: cores that
    //       are being delivered already account for that slice of the deficit.
    //   (3) Near-full grid — if the deficit is tiny (<= 4), a recovered grid keeps at most 1
    //       straggler so it isn't littered.
    // In every case the FARTHEST-from-player ground cores (least recoverable) are removed first.
    const MAX_GROUND_CORES = 10;

    if (!this.groundCores.length) return;

    const coreVal = c => (c.value ?? 3);

    let deficit = 0;
    for (const m of this.matrices) deficit += (m.capacity - m.stored);

    // Value already on its way back to a Matrix (player carry + enemy-carried). That slice of the
    // deficit is spoken for, so GROUND cores may only fill the REMAINING deficit — no buffer.
    let inTransit = 0;
    for (const v of this.player.carriedCores) inTransit += v;
    for (const e of this.enemies) if (e.carryingCore) inTransit += coreVal(e.carryingCore);

    // (1)+(3) COUNT cap: at most 10 ground cores normally; a nearly-full grid (deficit <= 4)
    // keeps at most 1 straggler. (2) VALUE cap: ground value may not exceed the outstanding
    // deficit not already covered in-transit. The stricter of the two governs.
    const countCap = deficit <= 4 ? 1 : MAX_GROUND_CORES;
    const valueCap = Math.max(0, deficit - inTransit);

    let groundValue = 0;
    for (const c of this.groundCores) groundValue += coreVal(c);

    if (this.groundCores.length > countCap || groundValue > valueCap) {
      // Remove FARTHEST-from-player ground cores first (least useful to recover).
      this.groundCores.sort((p, q) =>
        distance(q.pos, this.player.pos) - distance(p.pos, this.player.pos));

      let removed = 0;
      const n = this.groundCores.length;
      while (removed < n) {
        const kept = n - removed;
        if (kept <= countCap && groundValue <= valueCap) break;
        groundValue -= coreVal(this.groundCores[removed]);
        removed++;
      }
      if (removed > 0) this.groundCores.splice(0, removed);
    }
  }

  _updateSpawning(dt) {
    if (this._nullBreachActive) return;          // arena manages its own pressure
    if (this.spawnPauseTimer > 0) { this.spawnPauseTimer -= dt; return; }
    this.spawnTimer += dt;
    // During Thunder Solo, keep waves arriving fast so the 7s ultimate always has targets
    // (still capped by enemyCap() inside spawnEnemy — not unfair spam).
    const interval = this.thunderSolo ? Math.min(this.enemySpawnInterval(), 0.3) : this.enemySpawnInterval();
    if (this.spawnTimer >= interval) {
      this.spawnTimer = 0;
      const m = this.currentMinute();
      // Per-tick batch grows with the tiers so the cap actually FILLS (and stays filled vs kills).
      let count = m < 2 ? 3 : m < 5 ? 4 : m < 10 ? 5 : 6;
      // Catch-up surge: if the battlefield is below 70% of the cap, spawn extra so it never
      // sits empty (kills early were outpacing spawns and leaving the map sparse).
      if (this.enemies.length < this.enemyCap() * 0.7) count += 4;
      for (let i = 0; i < count; i++) this.spawnEnemy();   // spawnEnemy() still enforces enemyCap
    }
  }

  // Endless Elite Waves (Phase 1). Endless-only; additive layer that never touches Act 1,
  // chooseEnemyType, WINDOWS, base enemy stats, enemyCap logic, or the bosses. Elites are
  // normal Enemy instances buffed AFTER construction (tankier + faster, damage unchanged),
  // so every player hit still routes through the existing _damagePlayer path.
  _updateEliteWaves(dt) {
    if (!this.endless) return;            // hard gate — inert during Act 1
    this._eliteWaveElapsed += dt;

    // ── Forced Mutation cadence (Phase 1): first at 3:00, then every 3:00, max 6 picks. ──
    // Defer while a level-up card is open or a boss warning / corruption-beam telegraph is live so
    // the forced choice never stacks over another UI or pops during an unavoidable damage moment.
    if (!this.mutationUI && this.mutations.stacks < MUTATION_MAX_STACKS) {
      this._mutationTimer -= dt;
      if (this._mutationTimer <= 0) {
        if (this.upgradeUI || this._bossWarnCd > 0 || this._corruptionBeam) {
          this._mutationTimer = 3;                 // busy/dangerous → retry shortly
        } else {
          this._openMutationChoice();
          this._mutationTimer = MUTATION_INTERVAL;
        }
      }
    }

    // Live Endless-achievement check (~1/s) so milestones unlock + persist mid-run.
    this._achTimer = (this._achTimer || 0) - dt;
    if (this._achTimer <= 0) { this._achTimer = 1.0; this._checkEndlessAchievements(); }
    // Brawler Warrior unlock: reaching 10:00 INSIDE Endless (not Act 1, not at Continue). One-shot.
    if (this._eliteWaveElapsed >= 600 && !this.meta.isUnlocked('brawler_warrior')) {
      this.meta.unlock('brawler_warrior');
      this.triggerAnnouncement('BRAWLER WARRIOR UNLOCKED', GREEN);
    }
    // Secret-outfit unlocks (Endless-only, one-shot, persisted; character-gated).
    const sc = this.player.selectedCharacter;
    // Brawler LOG #1997: survive 18:00 in Endless AS Brawler Warrior.
    if (sc === 'brawler_warrior' && this._eliteWaveElapsed >= 1080 && !this.meta.isUnlocked('log_1997')) {
      this.meta.unlock('log_1997');
      this.triggerAnnouncement('SYSTEM LOG #1997 FOUND — BRAWLER SKIN', YELLOW);
    }
    // Assassin LOG #1998: survive 15:00 in Endless AS Assassin Clone.
    if (sc === 'assassin_clone' && this._eliteWaveElapsed >= 900 && !this.meta.isUnlocked('log_1998')) {
      this.meta.unlock('log_1998');
      this.triggerAnnouncement('SYSTEM LOG #1998 FOUND — PHANTOM ASSASSIN', '#ff4dd2');
    }
    this._eliteWaveTimer   -= dt;
    if (this._eliteWaveTimer <= 0) {
      this._spawnEliteWave();
      this._eliteWaveTimer = ELITE_WAVE.interval * this.mutations.eliteIntervalMult;   // EARLY ELITES (1.0 outside Endless)
    }
  }

  _spawnEliteWave() {
    // Batch size grows with time spent in Endless (capped).
    let batch = ELITE_WAVE.baseBatch;
    if (this._eliteWaveElapsed >= 20 * 60)      batch = ELITE_WAVE.batch20min;
    else if (this._eliteWaveElapsed >= 10 * 60) batch = ELITE_WAVE.batch10min;

    const m   = this.currentMinute();
    const cap = this.enemyCap();
    let spawned = 0;
    for (let i = 0; i < batch; i++) {
      if (this.enemies.length >= cap) break;          // respect cap — skip when full
      const e = new Enemy(randomChoice(ELITE_WAVE.pool), m);
      e.isElite        = true;
      e.hp            *= ELITE_WAVE.hpMult;
      if (this._hasProto('armored_swarm')) e.hp = Math.round(e.hp * 1.18);   // Armored Swarm Protocol (Endless elites)
      e._baseSpeedFull *= ELITE_WAVE.speedMult;        // canonical speed (baseSpeed recomputed per frame)
      e.baseSpeed     *= ELITE_WAVE.speedMult;
      e.radius        *= ELITE_WAVE.radiusMult;
      // Damage intentionally unchanged (×1.0) in Phase 1 — no new/elevated damage path.
      this.enemies.push(e);
      spawned++;
    }
    if (spawned > 0) this.triggerAnnouncement('⚠ ELITE WAVE', '#FFD700');
  }

  // ── Endless-only high-threat hazards: AIRSTRIKE ships (aimed rockets) + LIGHTNING STORM. ──
  // Endless-gated, additive layer. Never touches Act 1, bosses, Overload, pickups, or the economy.
  // Hard active caps (1 ship, capped strike zones) keep clutter/perf bounded.
  _updateEndlessHazards(dt) {
    if (!this.endless) return;
    this._updateAirstrike(dt);
    this._updateLightningStorm(dt);
  }

  _updateAirstrike(dt) {
    // Cadence: first ~1.5 min, then ~every 2 min — but never more than 1 ship at a time.
    this._airstrikeTimer -= dt;
    if (this._airstrikeTimer <= 0) {
      if (this.airstrikeShips.length < 1) { this._airstrikeTimer = this._chaosMode ? 60 : 120; this._spawnAirstrike(); }
      else                                  this._airstrikeTimer = 20;   // still airborne → retry soon
    }

    // Ships loiter/strafe around the player and fire aimed rockets until a safety timeout.
    for (let i = this.airstrikeShips.length - 1; i >= 0; i--) {
      const s = this.airstrikeShips[i];
      s.life  -= dt;
      s.angle += dt * 0.5;
      const tgt = new Vec2(this.player.pos.x + Math.cos(s.angle) * 360,
                           this.player.pos.y + Math.sin(s.angle) * 300);
      const mv = safeNormalize(tgt.sub(s.pos));
      s.pos.addMut(mv.scale(220 * dt));
      s.pos.x = clamp(s.pos.x, WORLD_MARGIN, WORLD_W - WORLD_MARGIN);
      s.pos.y = clamp(s.pos.y, WORLD_MARGIN, WORLD_H - WORLD_MARGIN);
      s.fireCd -= dt;
      if (s.fireCd <= 0) { s.fireCd = randomRange(3.0, 4.2); this._fireSalvo(s); }   // grouped bombardment
      if (s.life <= 0) this.airstrikeShips.splice(i, 1);   // long safety timeout
    }
    this._updateRockets(dt);
  }

  _spawnAirstrike() {
    const edge = Math.random() < 0.5 ? -60 : WORLD_W + 60;
    this.airstrikeShips.push({
      pos: new Vec2(edge, randomRange(WORLD_MARGIN, WORLD_H - WORLD_MARGIN)),
      angle: Math.random() * Math.PI * 2, fireCd: 1.5, life: 45,
    });
    this.triggerAnnouncement('AIRSTRIKE INBOUND', ORANGE);
    this.audio?.playEventWarning();
  }

  // Rocket-rain SALVO: 2 rockets with safe spawn distance from player (reduced from 3–6).
  _fireSalvo(s) {
    const n = 2;   // Fixed to 2 rockets per salvo (reduced from 3–6 for fairness)
    let fired = 0;
    for (let i = 0; i < n; i++) {
      if (this.airstrikeRockets.length >= 40) break;   // hard cap on in-flight rockets
      const base = safeNormalize(this.player.pos.sub(s.pos));
      if (base.lengthSq() === 0) break;
      const j = randomRange(-0.7, 0.7);   // ~50% aim assist / 50% spread → fairer dodge window
      const c = Math.cos(j), sn = Math.sin(j);
      const dir = new Vec2(base.x * c - base.y * sn, base.x * sn + base.y * c);
      // Ensure rockets spawn at safe distance from player (not directly on them)
      let spawnPos = s.pos.clone();
      const distToPlayer = distance(spawnPos, this.player.pos);
      if (distToPlayer < 180) {
        // If ship is too close, spawn rocket further away from player
        const safeDir = safeNormalize(s.pos.sub(this.player.pos));
        spawnPos = this.player.pos.add(safeDir.scale(180));
      }
      this.airstrikeRockets.push({ pos: spawnPos, dir, speed: randomRange(220, 285), life: 5.5, radius: 7, blast: 46 });
      fired++;
    }
    if (fired > 0) this.audio?.playEnemyShoot();
  }

  _updateRockets(dt) {
    for (let i = this.airstrikeRockets.length - 1; i >= 0; i--) {
      const r = this.airstrikeRockets[i];
      r.life -= dt;
      r.pos.addMut(r.dir.scale(r.speed * dt));
      const hit = distance(r.pos, this.player.pos) < PLAYER_RADIUS + r.blast;
      const out = r.pos.x < -80 || r.pos.x > WORLD_W + 80 || r.pos.y < -80 || r.pos.y > WORLD_H + 80;
      if (hit || r.life <= 0 || out) {
        if (hit && this.phoenixReviveTimer <= 0 && this.player.dashTimer <= 0) {
          const dmg = Math.round(this.player.maxHp * randomRange(0.40, 0.50));   // heavy clean hit
          this.player.applyBite({ hp: dmg, stagger: 0.8 });   // damage + short stun (anti-chain inside)
          this.screenShake.trigger(9, 0.4);
          this.particles.spawnDeathBurst(r.pos, ORANGE, 18, 2.4);
          this.floatingTexts.push(new FloatingText('-' + dmg + ' HP', this.player.pos.clone(), RED, 1.2));
        } else {
          this.particles.spawnHitSparks(r.pos, ORANGE);
        }
        this.audio?.playAirstrikeBomb?.();   // throttled 300 ms — one sound per salvo, not per rocket
        this.airstrikeRockets.splice(i, 1);
      }
    }
  }

  // LIGHTNING STORM — acid/lava-rain-style hazard. Every ~2 min a storm runs for a few seconds,
  // dropping telegraphed strike zones that HUNT the player (70% aimed / 30% spread). A clean strike
  // (player still inside the zone when it fires) deals ~50% max HP + a short stun. Fully dodgeable
  // during the 1.1s telegraph. All arrays are hard-capped and self-expiring.
  _updateLightningStorm(dt) {
    this._lightningTimer -= dt;
    if (this._lightningTimer <= 0) {
      this._lightningTimer = this._chaosMode ? 60 : 120;  // ~every 2 min (60s in Chaos)
      this._stormActive    = this._hasProto('lightning_plus') ? 18 : 12;   // threat pass doubled; Lightning Storm+ extends further
      this._stormSpawnCd   = 0;
      this.triggerAnnouncement('⚠ LIGHTNING STORM HAZARD', '#9fd0ff');
      this.audio?.playEventWarning();
      this.audio?.playLightningStrike?.();  // thunder crack on storm start
    }

    if (this._stormActive > 0) {
      this._stormActive -= dt;
      this._stormSpawnCd -= dt;
      if (this._stormSpawnCd <= 0) { this._stormSpawnCd = 0.55; this._spawnLightningStrikes(); }
    }

    for (let i = this.lightningZones.length - 1; i >= 0; i--) {
      const z = this.lightningZones[i];
      z.t += dt;
      if (!z.struck && z.t >= z.warn) {       // STRIKE — resolve damage once, when the bolt lands
        z.struck = true;
        const d = distance(this.player.pos, z.pos);
        if (d < z.radius && this.phoenixReviveTimer <= 0 && this.player.dashTimer <= 0) {
          const dmg = Math.round(this.player.maxHp * 0.5);    // ~50% max HP clean hit
          this.player.applyBite({ hp: dmg, stagger: 0.7 });   // heavy hit + short stun (anti-chain inside)
          this.screenShake.trigger(9, 0.35);
          this.particles?.spawnHitSparks(this.player.pos, '#cfe6ff');
          this.floatingTexts.push(new FloatingText('-' + dmg + ' HP', this.player.pos.clone(), '#9fd0ff', 1.2));
        }
        this.particles?.spawnDeathBurst?.(z.pos, '#bfe0ff', 8, 1.8);
        this.audio?.playLightningStrike?.();  // thunder crack per strike (throttled 0.3s)
      }
      if (z.t >= z.warn + z.flash) this.lightningZones.splice(i, 1);
    }
  }

  // One wave = 2–3 strike zones. ~70% land on the player, ~30% spread nearby. Hard cap 14 active.
  _spawnLightningStrikes() {
    const n = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      if (this.lightningZones.length >= 14) break;     // hard cap on active strike zones
      const aimed = Math.random() < 0.7;               // 70% aimed / 30% spread
      const off   = aimed ? randomRange(0, 70) : randomRange(120, 340);
      const ang   = Math.random() * Math.PI * 2;
      const pos   = new Vec2(
        clamp(this.player.pos.x + Math.cos(ang) * off, WORLD_MARGIN, WORLD_W - WORLD_MARGIN),
        clamp(this.player.pos.y + Math.sin(ang) * off, WORLD_MARGIN, WORLD_H - WORLD_MARGIN));
      this.lightningZones.push({ pos, radius: 64, warn: 1.1, flash: 0.35, t: 0, struck: false });
    }
  }

  // Drawn in world space (after boss lava). Gated on Endless so leftover hazards never paint in Act 1.
  _drawEndlessHazards(ctx) {
    if (!this.endless) return;
    // Lightning Storm — telegraph ring while charging, then a falling bolt sprite + flash on strike.
    const lspr = this._lightningStormSprite;
    for (const z of this.lightningZones) {
      if (!z.struck) {
        const k = z.t / z.warn;                       // 0 → 1 as the strike approaches
        const p = 0.4 + 0.5 * Math.abs(Math.sin(performance.now() * 0.02));
        ctx.save();
        ctx.globalAlpha = 0.35 + 0.4 * p;
        ctx.strokeStyle = '#9fd0ff'; ctx.lineWidth = 3; ctx.setLineDash([10, 8]);
        ctx.beginPath(); ctx.arc(z.pos.x, z.pos.y, z.radius, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.5;                         // shrinking inner ring = imminence
        ctx.beginPath(); ctx.arc(z.pos.x, z.pos.y, z.radius * (1 - k * 0.85), 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      } else {
        const fk    = (z.t - z.warn) / z.flash;        // 0 → 1 over the flash
        const alpha = Math.max(0, 1 - fk);
        ctx.save();
        if (lspr.complete && lspr.naturalWidth) {
          ctx.globalAlpha = alpha;
          const bw = z.radius * 2.0, bh = z.radius * 7;   // tall lightning column descending into the zone
          ctx.drawImage(lspr, z.pos.x - bw / 2, z.pos.y - bh + z.radius * 0.4, bw, bh);
        }
        ctx.globalAlpha = alpha * 0.8;                 // bright impact flash
        ctx.fillStyle = '#eaf4ff';
        ctx.beginPath(); ctx.arc(z.pos.x, z.pos.y, z.radius * (0.6 + fk * 0.6), 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }
    // Defensive canvas-state reset so storm draws never leak into later rendering.
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 0;
    ctx.filter = 'none';

    // Airstrike ships.
    const ship = this._airstrikeSprite;
    for (const s of this.airstrikeShips) {
      const sz = 110;
      if (ship.complete && ship.naturalWidth) ctx.drawImage(ship, s.pos.x - sz / 2, s.pos.y - sz / 2, sz, sz);
      else { ctx.save(); ctx.fillStyle = '#dfe9f5'; ctx.beginPath(); ctx.arc(s.pos.x, s.pos.y, 22, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    }
    // Rockets — dramatic dual-layer flame trail, glowing body, and a pulsing red blast telegraph.
    for (const r of this.airstrikeRockets) {
      ctx.save();
      ctx.globalAlpha = 0.30; ctx.strokeStyle = '#ff5a1a'; ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(r.pos.x, r.pos.y);
      ctx.lineTo(r.pos.x - r.dir.x * 40, r.pos.y - r.dir.y * 40); ctx.stroke();
      ctx.globalAlpha = 0.7; ctx.strokeStyle = '#ffd27f'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(r.pos.x, r.pos.y);
      ctx.lineTo(r.pos.x - r.dir.x * 22, r.pos.y - r.dir.y * 22); ctx.stroke();
      ctx.globalAlpha = 1; ctx.fillStyle = '#fff0c0';
      ctx.beginPath(); ctx.arc(r.pos.x, r.pos.y, r.radius, 0, Math.PI * 2); ctx.fill();
      const p = 0.5 + 0.5 * Math.sin(performance.now() * 0.02);
      ctx.globalAlpha = 0.45 + 0.45 * p; ctx.strokeStyle = RED; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(r.pos.x, r.pos.y, r.blast, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }

  // Full-map LIGHTNING STORM atmosphere — a screen-space transparent overlay drawn ONLY while a
  // storm is active (Endless-only). Two stretched, downward-scrolling tiles give a falling rain /
  // lightning feel across the whole battlefield. Alpha is capped so gameplay stays readable; this is
  // pure visual atmosphere — actual damage still comes from the fair telegraphed strike zones.
  _drawStormOverlay(ctx) {
    if (!this.endless || this._stormActive <= 0) return;
    const spr = this._lightningStormSprite;
    if (!spr || !spr.complete || !spr.naturalWidth) return;
    const now    = performance.now();
    const strobe = Math.sin(now * 0.013) * 0.5 + 0.5;
    const flash  = (Math.floor(now / 110) % 17 === 0) ? 0.22 : 0;   // brief bright lightning frames
    const alpha  = Math.min(0.40, 0.12 + 0.08 * strobe + flash);
    const dy     = (now * 0.04) % HEIGHT;                            // scroll down → rain falling
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = 'lighter';                       // additive: only bolts/rain glow
    ctx.drawImage(spr, 0, dy - HEIGHT, WIDTH, HEIGHT);
    ctx.drawImage(spr, 0, dy, WIDTH, HEIGHT);
    ctx.restore();
    // Defensive canvas-state reset so the overlay never leaks into later rendering.
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 0;
    ctx.filter = 'none';
  }

  // ─── Character Weapon Synergy mark-layer ────────────────────────────────────────────────────
  // Modular & safe: a single hook in Enemy.takeHit calls _onSynergyHit. When the player's active
  // character has its synergy card, hits MARK enemies (distinct glyph/color) and, on a throttled
  // cadence, ERUPT in a small boss-capped burst. Marks live on the enemy object (auto-freed on
  // death); bursts are a hard-capped, auto-expiring visual array. Inert without the card.
  _synergyFx() { return SYNERGY_FX[this.player.selectedCharacter]; }

  _onSynergyHit(e) {
    if (this._inSynergyBurst) return;                 // re-entrancy guard (burst calls takeHit)
    const fx = this._synergyFx();
    if (!fx || !((this.player.upgrades[fx.card] || 0) >= 1)) return;
    const stars = this.meta?.getLevel(fx.meta) || 0;
    const dur   = 3 + stars * 0.6;                    // meta stars extend mark duration
    if (!e._synMark) e._synMark = { color: fx.color, glyph: fx.glyph, t: dur, cd: 0 };
    else             e._synMark.t = dur;              // refresh
    if (e._synMark.cd <= 0) { e._synMark.cd = 1.2; this._synergyBurst(e, fx, stars); }
  }

  _synergyBurst(src, fx, stars) {
    const sm      = this._hasProto('synergy_mastery') ? 1.25 : 1;   // Character Synergy Mastery (boss-capped below)
    const radius  = (58 + stars * 6) * (sm > 1 ? 1.12 : 1);
    const baseDmg = (8 + stars * 3) * sm;             // 8 → 23 across 0–5 stars
    this._inSynergyBurst = true;                      // prevent burst→takeHit→burst cascades
    for (const e of this.enemies) {
      if (distance(e.pos, src.pos) > radius) continue;
      const d = (e.isBoss?.() || e.isMegaBoss) ? this._capBossDamage(e, baseDmg) : baseDmg;
      e.takeHit(d, this);
    }
    this._inSynergyBurst = false;
    if (this.synergyBursts.length < 24)
      this.synergyBursts.push({ pos: src.pos.clone(), color: fx.color, r: radius, t: 0, life: 0.4 });
    this.particles?.spawnHitSparks(src.pos, fx.color);
  }

  _updateSynergyMarks(dt) {
    for (let i = this.synergyBursts.length - 1; i >= 0; i--) {
      const b = this.synergyBursts[i];
      b.t += dt;
      if (b.t >= b.life) this.synergyBursts.splice(i, 1);
    }
    for (const e of this.enemies) {
      if (e._elemCd > 0) e._elemCd -= dt;   // elemental-hit throttle (per enemy)
      if (e._fuseCd > 0) e._fuseCd -= dt;   // fusion-proc throttle (per enemy)
      if (!e._synMark) continue;
      e._synMark.t  -= dt;
      e._synMark.cd -= dt;
      if (e._synMark.t <= 0) e._synMark = null;
    }
  }

  // ─── Elemental system (Phase 1) — visible per-character element bursts on hit ────────────────
  // Single bounded hook from Enemy.takeHit. Always shows the active character's element identity
  // (cosmetic); the Elemental Core / Fusion Catalyst reward cards amplify scale + add a real, small,
  // boss-capped proc. Throttled per enemy + globally capped in ElementFx, so it never spams.
  _onElementHit(e) {
    if (this._inElementHit) return;                 // re-entrancy guard (fusion proc calls takeHit)
    const el = CHARACTER_ELEMENT[this.player.selectedCharacter];
    if (!el || e._elemCd > 0) return;
    e._elemCd = 0.18;
    const core = (this.player.upgrades['reward_elemental_core'] || 0) >= 1;
    const fus  = (this.player.upgrades['reward_fusion_catalyst'] || 0);
    const em   = this._hasProto('elemental_mastery') ? 1.25 : 1;   // Elemental Mastery Protocol (boss-capped below)
    const scale = ((core ? 1.4 : 1.05) + 0.12 * fus) * em;   // larger = clearly visible per-character identity
    this.elementFx.spawn(e.pos.x, e.pos.y, el, scale);

    if (fus <= 0) return;                            // fusion behavior needs Fusion Catalyst
    const fid = this._selectFusion(this.player.selectedCharacter);
    if (fid && (e._fuseCd || 0) <= 0) {             // ── real FUSION proc (Phase 2/3) ──
      e._fuseCd = 0.35;
      this._fusionProc(e, fid, fus, core);
    } else if (!fid) {                               // single-element char: small boss-capped bonus
      this._inElementHit = true;
      const raw = (2 + 2 * fus) * em;
      const d = (e.isBoss?.() || e.isMegaBoss) ? this._capBossDamage(e, raw) : raw;
      e.takeHit(d, this);
      this._inElementHit = false;
    }
  }

  // Resolve which single fusion to proc for a character (Phase 3). Primary element + any card-granted
  // secondary element are matched through FUSION_PAIRS; the FIRST matching secondary wins (one clean
  // pick, never all at once). Falls back to the character's Phase-2 default fusion if no pair matches.
  _selectFusion(char) {
    const prim = CHARACTER_ELEMENT[char];
    const secs = this.player.secondaryElements;
    if (prim && secs && secs.length) {
      for (const s of secs) {
        if (s === prim) continue;
        const id = FUSION_PAIRS[fusionKey(prim, s)];
        if (id && FUSION_FX[id]) return id;
      }
    }
    return CHARACTER_FUSION[char] || null;
  }

  // ─── Fusion proc (Phase 2) ───────────────────────────────────────────────────────────────────
  // Powerful vs normal enemies, controlled vs elites (×0.5), boss-capped (×0.5 then _capBossDamage).
  // Never hard-freezes/permanently-slows bosses (slow applies to normals only). Bounded everywhere:
  // ≤6 affected enemies/proc, ≤12 active clouds, ElementFx-capped VFX, re-entrancy-guarded.
  _fusionProc(src, fid, fus, core) {
    const def = FUSION_FX[fid]; if (!def) return;
    const fm = this._hasProto('fusion_mastery') ? 1.2 : 1;        // Fusion Mastery Protocol (boss-capped below)
    const scale = (1 + 0.15 * fus + (core ? 0.2 : 0)) * fm;
    this.elementFx.spawnFusion(src.pos.x, src.pos.y, def.c1, def.c2, 1.5 * scale);   // bold, clearly visible
    this._fusionName = def.name; this._fusionNameT = 1.2;          // brief HUD label

    if (def.kind === 'cloud') {                                    // lingering damaging gas cloud
      if (this.fusionClouds.length < 12) {
        this.fusionClouds.push({ x: src.pos.x, y: src.pos.y, t: 0, life: 3.5, fid, dmgCd: 0 });
        this.audio?.playToxicGas?.();   // gas cloud spawn (throttled 0.8s)
      }
      return;
    }

    const R = (def.radius || 70) * scale;
    let n = 0;
    this._inElementHit = true;                                     // guard: burst takeHit won't re-proc
    for (const e of this.enemies) {
      if (n >= 6) break;                                           // cap affected enemies per proc
      if (distance(e.pos, src.pos) > R) continue;
      const isBoss = e.isBoss?.() || e.isMegaBoss;
      let dmg = (def.dmg || 10) * fm;
      if (e.isElite) dmg *= 0.5;                                   // controlled vs elites
      const d = isBoss ? this._capBossDamage(e, dmg * 0.5) : dmg;  // bosses: halved + capped
      if (e?.takeHit) e.takeHit(d, this);
      if (def.slow && !isBoss) e.slowTimer = Math.max(e.slowTimer || 0, def.slow);   // normals only
      n++;
    }
    this._inElementHit = false;
  }

  _updateFusionClouds(dt) {
    for (let i = this.fusionClouds.length - 1; i >= 0; i--) {
      const c = this.fusionClouds[i];
      c.t += dt; c.dmgCd -= dt;
      if (c.dmgCd <= 0) {
        c.dmgCd = 0.5;
        const def = FUSION_FX[c.fid] || {}; const R = def.radius || 70;
        let n = 0;
        for (const e of this.enemies) {
          if (n >= 6) break;
          if (distance(e.pos, { x: c.x, y: c.y }) > R) continue;
          const isBoss = e.isBoss?.() || e.isMegaBoss;
          let dmg = def.dmg || 8; if (e.isElite) dmg *= 0.5;
          if (e?.takeHit) e.takeHit(isBoss ? this._capBossDamage(e, dmg * 0.5) : dmg, this);
          n++;
        }
      }
      if (c.t >= c.life) this.fusionClouds.splice(i, 1);
    }
    if (this._fusionNameT > 0) this._fusionNameT -= dt;
  }

  _drawFusionClouds(ctx) {
    for (const c of this.fusionClouds) {
      const def = FUSION_FX[c.fid] || {}; const R = (def.radius || 70);
      const k = c.t / c.life, a = (1 - k) * 0.5;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) {
        const ang = i * 1.25 + c.t * 0.6;
        ctx.globalAlpha = a; ctx.fillStyle = i % 2 ? (def.c2 || '#8fdf7f') : (def.c1 || '#7CFF4D');
        ctx.beginPath();
        ctx.arc(c.x + Math.cos(ang) * R * 0.5, c.y + Math.sin(ang) * R * 0.5, R * 0.42 * (0.7 + 0.3 * k), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.shadowBlur = 0; ctx.filter = 'none';
  }

  // Storm Execution Protocol reward — a battlefield storm that periodically zaps NORMAL enemies only.
  // Never hits the player; bosses/minibosses are immune (singleton bosses aren't in this.enemies, and
  // the mega-boss is skipped via isMegaBoss). Hard-capped hits per pulse, bounded VFX.
  _updateStormExecution(dt) {
    if ((this.player.upgrades['reward_storm_execution'] || 0) < 1) return;
    this._stormExecCd -= dt;
    if (this._stormExecCd > 0) return;
    this._stormExecCd = 4.5;
    let hits = 0;
    for (const e of this.enemies) {
      if (hits >= 6) break;                          // cap strikes per pulse
      if (e.isBoss?.() || e.isMegaBoss) continue;    // bosses/minibosses immune
      if (Math.random() < 0.5) {
        e.takeHit(24, this);                         // normal-enemy-only damage
        this.elementFx.spawn(e.pos.x, e.pos.y, 'electric', 1.1);
        hits++;
      }
    }
    if (hits > 0) this.audio?.playHit?.();
  }

  // Forbidden Ultimate Infusion reward — when the ultimate fires (detected by the mana spend), erupt
  // a ring of the character's element around the player so the ult reads as element-infused.
  _updateUltInfusion(dt) {
    const m = this.player.mana;
    if ((this.player.upgrades['reward_ult_infusion'] || 0) >= 1 && (this._prevMana - m) >= 90) {
      const char = this.player.selectedCharacter;
      const fid  = (this.player.upgrades['reward_fusion_catalyst'] || 0) > 0 ? this._selectFusion(char) : null;
      const px = this.player.pos.x, py = this.player.pos.y;
      const um = this._hasProto('ult_infusion_mastery') ? 1.25 : 1;   // Ult Infusion Mastery (bigger nova; VFX-only)
      if (fid && FUSION_FX[fid]) {                    // FUSION nova (8 fusion bursts) when eligible
        const def = FUSION_FX[fid];
        for (let i = 0; i < 8; i++) { const ang = i * Math.PI / 4;
          this.elementFx.spawnFusion(px + Math.cos(ang) * 44, py + Math.sin(ang) * 44, def.c1, def.c2, 1.9 * um); }
        this._fusionName = def.name; this._fusionNameT = 1.4;
      } else {                                         // else plain element nova
        const el = CHARACTER_ELEMENT[char];
        if (el) for (let i = 0; i < 8; i++) { const ang = i * Math.PI / 4;
          this.elementFx.spawn(px + Math.cos(ang) * 40, py + Math.sin(ang) * 40, el, 1.8 * um); }
      }
    }
    this._prevMana = m;
  }

  _drawSynergyFx(ctx) {
    for (const e of this.enemies) {
      const mk = e._synMark;
      if (!mk) continue;
      const pulse = 0.6 + 0.4 * Math.sin(performance.now() * 0.01);
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.font = 'bold 15px "Segoe UI Emoji", Consolas, monospace';
      ctx.fillStyle = mk.color;
      ctx.textAlign = 'center';
      ctx.fillText(mk.glyph, e.pos.x, e.pos.y - e.radius - 12);
      ctx.restore();
    }
    for (const b of this.synergyBursts) {
      const k = b.t / b.life;
      ctx.save();
      ctx.globalAlpha = (1 - k) * 0.8;
      ctx.strokeStyle = b.color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(b.pos.x, b.pos.y, b.r * (0.4 + 0.6 * k), 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    ctx.textAlign = 'left';
  }

  _updateFloatingTexts(dt) {
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      this.floatingTexts[i].update(dt);
      if (this.floatingTexts[i].timer <= 0) this.floatingTexts.splice(i, 1);
    }
    if (this.floatingTexts.length > 90) this.floatingTexts.splice(0, this.floatingTexts.length - 90);
  }

  _updateEffects(dt) {
    for (let i = this.empRings.length - 1; i >= 0; i--) {
      this.empRings[i].update(dt);
      if (!this.empRings[i].alive()) this.empRings.splice(i, 1);
    }
  }

  _checkPlayerEnemyCollisions(dt) {
    if (this.playerHitCooldown > 0) this.playerHitCooldown -= dt;

    let damageDone = false;
    for (const e of this.enemies) {
      if (distance(e.pos, this.player.pos) < e.radius + PLAYER_RADIUS) {
        // Pushback
        const push = safeNormalize(this.player.pos.sub(e.pos));
        this.player.pos.addMut(push.scale(60 * dt));

        if (!damageDone && this.phoenixReviveTimer <= 0 && this.player.dashTimer <= 0) {
          // Apply per-enemy contact damage
          const dmg = (e.contactDamage ?? 8) * dt * (1 - this.player.contactDamageReduction);
          this.player.applyDamage(dmg);
          damageDone = true;

          // Throttle screen shake and floating text to once per 0.5s
          if (this.playerHitCooldown <= 0) {
            this.playerHitCooldown = 0.5;
            this.screenShake.trigger(4, 0.15);
            // Razorhound bite: stamina drain + short stagger + knockback + bleed (anti-lock via immunity)
            if (e.enemyType === 'Razorhound') {
              const dir = safeNormalize(this.player.pos.sub(e.pos));
              const staggered = this.player.applyBite({ stamina: 8, stagger: 0.6, knockback: 14, dir, bleed: 2.5 });
              this.audio?.playRazorhoundBite();
              this.particles.spawnBloodSplash(this.player.pos);
              this.floatingTexts.push(
                new FloatingText(staggered ? 'STAGGERED' : 'BLEED', new Vec2(this.player.pos.x, this.player.pos.y - 28), RED, 0.7)
              );
            } else {
              this.particles.spawnHitSparks(this.player.pos, RED);
              this.floatingTexts.push(
                new FloatingText(`-${Math.ceil(e.contactDamage ?? 8)} HP`, this.player.pos.clone(), RED, 0.6)
              );
            }
          }
        }
      }
    }
  }

  _updateAbilityTimers(dt) {
    // Homing disc timer managed in _updateHomingDiscs
    // Sonic pulse / EMP cooldowns decremented in Player.update
  }

  _updateSpecialEffects(dt) {
    const p = this.player;
    if (p.specialDashTimer > 0 && p.selectedCharacter === 'taekwondo_girl') {
      this._specialTrail.push({ x: p.pos.x, y: p.pos.y, alpha: 0.7 });
      for (const e of this.enemies) {
        if (this._taekwondoDmgSet.has(e)) continue;
        if (distance(p.pos, e.pos) < 45 + e.radius) {
          this._taekwondoDmgSet.add(e);
          e.takeHit(15, this);
        }
      }
      for (let i = this.groundCores.length - 1; i >= 0; i--) {
        const core = this.groundCores[i];
        if (p.carry < p.maxCarry && distance(p.pos, core.pos) < 60) {
          this.groundCores.splice(i, 1);
          p.carry++;
          p.carriedCores.push(core.value ?? 3);
          this.overload = Math.max(0, this.overload - OVERLOAD_PICKUP_REDUCTION);
          this.particles.spawnCorePickup(core.pos, core.color);
        }
      }
    }
    for (const t of this._specialTrail) t.alpha -= 3.5 * dt;
    this._specialTrail = this._specialTrail.filter(t => t.alpha > 0);
    for (const r of this._specialRings) {
      r.radius = r.maxRadius * (1 - r.life / r.maxLife);
      r.life  -= dt;
    }
    this._specialRings = this._specialRings.filter(r => r.life > 0);
    for (const b of this._specialBeams) b.life -= dt;
    this._specialBeams = this._specialBeams.filter(b => b.life > 0);
  }

  _updateQuantumOverhaul(dt) {
    const p = this.player;
    if (p.upgrades['Quantum Overhaul'] === 0) return;

    p.quantumOverhaulTimer -= dt;
    if (p.quantumOverhaulTimer > 0) return;

    p.quantumOverhaulTimer = Math.max(3, 8 - p.upgrades['Quantum Overhaul']);

    if (this.groundCores.length === 0) return;

    // Find core nearest to any matrix with space
    let bestCore   = null;
    let bestMatrix = null;
    let bestDist   = Infinity;

    for (const core of this.groundCores) {
      for (const m of this.matrices) {
        if (!m.hasSpace()) continue;
        const d = distance(core.pos, m.pos);
        if (d < bestDist) { bestDist = d; bestCore = core; bestMatrix = m; }
      }
    }

    if (bestCore && bestMatrix) {
      const idx = this.groundCores.indexOf(bestCore);
      this.groundCores.splice(idx, 1);
      bestMatrix.slotCore(bestCore.value ?? 3);   // honor Gold (+5) / Silver (+3)
      this.player.coresSecured++;
      this.overload = Math.max(0, this.overload - OVERLOAD_SLOT_REDUCTION);
      this.floatingTexts.push(new FloatingText('QUANTUM BEAM!', bestCore.pos.clone(), ORANGE, 1.2));
      this.particles.spawnCoreSlot(bestMatrix.pos, bestMatrix.color);
    }
  }

  _triggerPhoenixRevive() {
    this.phoenixReviveCount++;
    this.score = (this.score ?? 0) + 100;
    this.phoenixUsed        = true;  // keep existing flag
    this.phoenixReviveTimer = 3.0;

    if (this.phoenixReviveCount === 1) {
      // ── Orange — 33.3 % HP, −25 % overload ────────────────────────────────
      this.phoenixReviveType = 'orange';
      this.player.hp = Math.ceil(this.player.maxHp * 0.333);
      this.overload  = Math.max(0, this.overload * 0.75);
      this.floatingTexts.push(
        new FloatingText('✦ PHOENIX REVIVE ✦', this.player.pos.clone(), ORANGE, 2.5)
      );
      this.screenShake.trigger(8, 0.5);

    } else if (this.phoenixReviveCount === 2) {
      // ── Blue — 55.5 % HP, −50 % overload ─────────────────────────────────
      this.phoenixReviveType = 'blue';
      this.player.hp = Math.ceil(this.player.maxHp * 0.555);
      this.overload  = Math.max(0, this.overload * 0.5);
      this.triggerAnnouncement('✦ BLUE PHOENIX REVIVE ✦', CYAN);
      this.floatingTexts.push(
        new FloatingText('BLUE PHOENIX REVIVE', this.player.pos.clone(), CYAN, 3.0)
      );
      this.screenShake.trigger(12, 0.7);

    } else if (this.phoenixReviveCount === 3) {
      // ── Gold — 125 % HP (overheal), −75 % overload ───────────────────────
      this.phoenixReviveType = 'gold';
      this.player.hp = Math.round(this.player.maxHp * 1.25);   // overheal: gold segment on HP bar
      this.overload  = Math.max(0, this.overload * 0.25);
      this.triggerAnnouncement('✦ GOLD PHOENIX REVIVE ✦', YELLOW);
      this.floatingTexts.push(
        new FloatingText('GOLD PHOENIX REVIVE', this.player.pos.clone(), YELLOW, 3.0)
      );
      this.screenShake.trigger(16, 1.0);

    } else {
      // ── Phoenix Revival Protocol (4th, PF-unlocked) — massive recovery ─────
      // HP 200 % overheal (same overheal mechanic as gold), Mana to FULL (no overcap in this engine),
      // and ~50 % grid-pressure relief (overload halved — the survival resource). Strong but rare:
      // requires the 5 🧩 unlock and is the LAST revive, so it can't make the player immortal.
      this.phoenixReviveType = 'gold';
      this.player.hp   = Math.round(this.player.maxHp * 2.0);
      this.player.mana = this.player.maxMana;
      this.overload    = Math.max(0, this.overload * 0.5);
      this.triggerAnnouncement('✦ PHOENIX PROTOCOL REVIVE ✦', '#ff9b3c');
      this.floatingTexts.push(
        new FloatingText('PHOENIX PROTOCOL REVIVE', this.player.pos.clone(), '#ff9b3c', 3.2)
      );
      this.screenShake.trigger(18, 1.1);
    }

    // Every Phoenix Revive also restores +25 mana (capped at max).
    const revMana = Math.round(25 * this.mutations.manaGainMult);   // MANA DROUGHT (×1 outside Endless)
    this.player.mana = Math.min(this.player.maxMana, this.player.mana + revMana);
    this.floatingTexts.push(
      new FloatingText('+' + revMana + ' MANA', new Vec2(this.player.pos.x, this.player.pos.y + 18), CYAN, 2.0)
    );

    this.audio?.playPhoenixRevive(this.phoenixReviveType);
  }

  // ─── Draw ─────────────────────────────────────────────────────────────────
  // Layer order:
  // 1. Background image
  // 2. Power Matrices
  // 3. Data-Cores (ground)
  // 4. Enemies
  // 5. Player
  // 6. Projectiles (regular + homing + EMP rings + particles)
  // 7. HUD (floating texts, vignette, overlays)

  draw(ctx) {
    if (this.gameState === 'start_menu') {
      this._drawStartMenu(ctx);
      return;
    }
    if (this.gameState === 'character_select') {
      this._drawCharacterSelect(ctx);
      return;
    }
    if (this.gameState === 'exit_screen') {
      this._drawExitScreen(ctx);
      return;
    }
    if (this.gameState === 'upgrades') {
      this._drawUpgradesScreen(ctx);
      return;
    }
    if (this.gameState === 'achievements') {
      this._drawAchievementsScreen(ctx);
      return;
    }
    if (this.gameState === 'relics') {
      this._drawRelicsScreen(ctx);
      return;
    }
    if (this.gameState === 'credits') {
      this._drawCreditsScreen(ctx);
      return;
    }
    if (this.gameState === 'instructions') {
      this._drawInstructionsScreen(ctx);
      return;
    }
    if (this.gameState === 'audio_settings') {
      this._drawAudioSettings(ctx);
      return;
    }
    if (this.gameState === 'settings') {
      this._drawSettings(ctx);
      return;
    }
    if (this.gameState === 'lore_archive') {
      this._drawLoreArchive(ctx);
      return;
    }
    if (this.gameState !== 'playing') {
      this._drawBackground(ctx);
      return;
    }

    // ── Camera-space block (world entities) ─────────────────────────────────
    // Zoom out slightly so more of the battlefield is visible (Endless zooms out a touch more).
    ctx.save();
    ctx.scale(this._viewScale, this._viewScale);
    ctx.translate(-this.camera.x, -this.camera.y);

    // 1 ── World Background
    this._drawWorldBackground(ctx);

    // 1·5 ── Readability scrim: gently darken the busy neon map so the player, enemies, cores and
    // Nexus (all drawn AFTER this) clearly pop. Covers only the visible view; no layout/bounds change.
    ctx.fillStyle = 'rgba(2,6,16,0.30)';
    ctx.fillRect(this.camera.x, this.camera.y, this._viewW, this._viewH);

    // 1a ── Boss Lava/Fire Rain zones (ground markers — under entities so they read as terrain)
    this._drawBossLava(ctx);
    this._drawBossTrails(ctx);
    // Chaos Mode ambient particle field (world-space, additive blend, bounded)
    if (this._chaosMode) this._chaosAmbient.draw(ctx);
    // Chaos Mode pylons + procedural debris (world-space, visual + gameplay)
    if (this._chaosMode) { this._drawChaosPylons(ctx); this._drawChaosDebris(ctx); }
    this._drawEndlessHazards(ctx);   // Endless-only: lightning storm + airstrike ships/rockets
    this._drawSynergyFx(ctx);        // character synergy marks above enemies + burst rings
    this._drawFusionClouds(ctx);     // Phase-2 fusion gas clouds (world-space, bounded)
    this._drawIceFields(ctx);          // Crystal Ice Field zones (Taekwondo ultimate)
    this.elementFx.draw(ctx);        // elemental hit bursts (world-space, additive, bounded)

    // 2 ── Power Matrices (fill-based glow + counter owned by PowerMatrix; overload drives danger blink)
    for (const m of this.matrices) {
      if (this.endless) this._drawEndlessNexusBase(ctx, m);   // sprite UNDER the matrix (Endless only)
      m.draw(ctx, this.overload / OVERLOAD_CAP);              // core indicators/status stay on top
    }

    // 3 ── Data-Cores: GOLD and SILVER only, each a distinct SILHOUETTE in a distinct HUE
    // so they never read as generic white particles. GOLD = warm amber spinning starburst
    // (premium/rare); SILVER = cool steel-blue spinning hexagon. Both have a blinking glow.
    const nowCore = performance.now() / 1000;
    for (const core of this.groundCores) {
      const gold = core.type === 'gold';
      const x = core.pos.x, y = core.pos.y;
      const body  = gold ? '#ffc21a' : '#9fb6d6';   // saturated amber  vs  cool steel-blue
      const edge  = gold ? '#fff0a0' : '#e2edff';
      const glowC = gold ? '#ff9d00' : '#6fd0ff';   // warm  vs  cool — instantly distinguishable
      // Pronounced BLINK (abs-sine → visible on/off pulse); gold blinks faster & brighter.
      const blink = gold ? (0.50 + 0.50 * Math.abs(Math.sin(nowCore * 4.5 + x * 0.05)))
                         : (0.45 + 0.45 * Math.abs(Math.sin(nowCore * 3.2 + x * 0.05)));
      const r = gold ? 14 : 11;

      // Blinking outer halo (carries the glow identity; cheap — no per-shape shadowBlur)
      drawGlow(ctx, x, y, r * 2.2, glowC, (gold ? 0.85 : 0.6) * blink);

      // Solid shaped body in its own hue (no white center → not a generic orb)
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(nowCore * (gold ? 0.9 : -0.6));
      ctx.fillStyle   = body;
      ctx.strokeStyle = edge;
      ctx.lineWidth   = gold ? 2.5 : 2;
      ctx.beginPath();
      if (gold) {
        for (let k = 0; k < 8; k++) {                 // sharp 4-point starburst
          const a = (Math.PI / 4) * k, rad = (k % 2 === 0) ? r : r * 0.42;
          const px = Math.cos(a) * rad, py = Math.sin(a) * rad;
          k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
      } else {
        for (let k = 0; k < 6; k++) {                 // hexagon
          const a = (Math.PI / 3) * k + Math.PI / 6;
          const px = Math.cos(a) * r, py = Math.sin(a) * r;
          k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // Blinking ring around the core for extra recognition during crowded fights
      ctx.save();
      ctx.globalAlpha = (gold ? 0.9 : 0.7) * blink;
      ctx.strokeStyle = glowC;
      ctx.lineWidth   = gold ? 2 : 1.5;
      ctx.beginPath(); ctx.arc(x, y, r + (gold ? 6 : 5), 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    // 3a ── HP CELL recovery pickups
    this._drawHealthPickups(ctx);
    this._drawManaPickups(ctx);

    // 3b ── Aqua Spirit Trail puddles (ground terrain — under entities so they read as footprints)
    this._drawAquaPuddles(ctx);
    this._drawSpiritKicks(ctx);

    // 4 ── Enemies
    // Offscreen draw-cull (drawing only — update/collision/gameplay run elsewhere). Generous margin
    // so nothing pops at the edges. Reused by projectiles + enemy bullets below.
    const _cam = this.camera, _vw = this._viewW, _vh = this._viewH, _M = 96;
    const _off = (pos) => pos.x < _cam.x - _M || pos.x > _cam.x + _vw + _M || pos.y < _cam.y - _M || pos.y > _cam.y + _vh + _M;
    for (const e of this.enemies) {
      if (_off(e.pos)) continue;   // offscreen — skip draw
      // Readability: a soft dark contour just outside each normal enemy so it separates from the
      // bright neon background (the enemy body/sprite below covers the inside → thin dark outline).
      // Cheap (no shadowBlur), bosses/mega keep their own framing. Visual only — no behavior change.
      if (!e.isBoss() && !e.isMegaBoss) {
        ctx.save();
        ctx.strokeStyle = 'rgba(0,6,12,0.5)'; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.arc(e.pos.x, e.pos.y, e.radius + 1.5, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      e.draw(ctx);
    }

    // 4a ── Support drones (drawn between enemies and titan so they appear above enemies)
    for (const d of this.supportDrones) d.draw(ctx);
    for (const d of this.allyDrones)    d.draw(ctx);   // persistent Auto-Forge Drone allies
    if (this._npcWalker) this._npcWalker.draw(ctx);   // KIROSHI WALKER ally

    // 4b ── AI Overload Titan mini-boss
    this._drawTitan(ctx);
    this._drawAnnihilator(ctx);
    this._drawBloodfang(ctx);
    this._drawCyberSerpent(ctx);
    this._drawCyberDragon(ctx);
    this._drawDoubleDemonsBoss(ctx);

    // 4b ── Grid Cache supply drop crate
    if (this.gridCache) {
      const { pos, timer } = this.gridCache;
      const sz = 48;
      const r0 = sz / 2;
      // Continuous neon beacon — breathing pulse (alpha + gentle radius expansion)
      const ph     = Date.now() / 240;
      const pulse  = 0.5 + 0.5 * Math.sin(ph);   // 0..1 alpha pulse
      const expand = 1 + 0.16 * Math.sin(ph);    // breathing radius
      // Layered additive glow: gold outer, purple secondary, bright cyan core
      drawGlow(ctx, pos.x, pos.y, (r0 + 22) * expand, YELLOW, 0.22 + 0.16 * pulse);
      drawGlow(ctx, pos.x, pos.y, (r0 + 13) * expand, PURPLE, 0.24 + 0.16 * pulse);
      drawGlow(ctx, pos.x, pos.y,  r0 + 4,            CYAN,   0.45 + 0.25 * pulse);
      // Pulsing neon rings — cyan inner + expanding gold outer
      ctx.save();
      ctx.globalAlpha = 0.55 + 0.45 * pulse;
      ctx.strokeStyle = CYAN;   ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(pos.x, pos.y, (r0 + 6)  * expand, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.30 + 0.35 * pulse;
      ctx.strokeStyle = YELLOW; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(pos.x, pos.y, (r0 + 16) * expand, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      // Sprite or cyan-square fallback
      const spr = this._gridCacheSprite;
      if (spr && spr.complete && spr.naturalWidth > 0) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(spr, Math.round(pos.x - sz / 2), Math.round(pos.y - sz / 2), sz, sz);
        ctx.imageSmoothingEnabled = true;
      } else {
        ctx.fillStyle = CYAN;
        ctx.fillRect(Math.round(pos.x - sz / 2), Math.round(pos.y - sz / 2), sz, sz);
      }
      // Countdown bar
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(Math.round(pos.x - sz / 2), Math.round(pos.y + sz / 2 + 4), sz, 4);
      ctx.fillStyle = CYAN;
      ctx.fillRect(Math.round(pos.x - sz / 2), Math.round(pos.y + sz / 2 + 4), Math.round(sz * (timer / 20)), 4);
    }

    // 5 ── Player (Thunder Solo guitar + aura drawn first so the skeleton sits in front of them)
    // Endless-only contact shadow at the hero's feet — grounds the player on the flat Stage 02 arena.
    if (this.endless) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.34)';
      ctx.beginPath();
      ctx.ellipse(this.player.pos.x, this.player.pos.y + 22, 20, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    this._drawThunderSoloGuitar(ctx);
    this._drawCyberBikeRush(ctx);   // Cyber Ride speeder sits under the rider (Neon Taekwondo Girl)
    // Digital Singularity OWNS the player while active (it draws the dissolving/reforming sprite
    // in screen space), so skip the normal world-space player draw during the ultimate.
    if (!(this.player.selectedCharacter === 'japan_phasewalker' && this._digitalSingularity?.isActive())) {
      this.player.draw(ctx, this._lastMousePos || { x: 0, y: 0 });
    }
    this._drawUltAura(ctx);

    // 6 ── Projectiles, homing discs, EMP rings, particles
    for (const p of this.projectiles) { if (!p.hidden && !_off(p.pos)) p.draw(ctx); }   // keep character-specific attack sprite identity (assassin base shot drawn hidden)
    this._drawEuclidKit(ctx);       // Euclid Vector toxin sniper / katanas / plague (world-space)
    for (const d of this.homingDiscs) d.draw(ctx);
    this._drawChainLightning(ctx);
    this._drawNeonPierceBeam(ctx);
    this._drawSkyfall(ctx);         // Brawler ultimate impacts
    this._drawCrescentSlashes(ctx); // Brawler secondary
    this._drawChakrams(ctx);        // Brawler primary
    this._drawChromePhantom(ctx);   // Assassin ultimate (clone overlays + burst rings)
    this._drawShuriken(ctx);        // Assassin bounce weapon
    for (const r of this.empRings)    r.draw(ctx);
    for (const r of this._specialRings) {
      const alpha = r.life / r.maxLife;
      ctx.save(); ctx.globalAlpha = alpha;
      ctx.strokeStyle = r.color1; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(r.pos.x, r.pos.y, r.radius, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = r.color2; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(r.pos.x, r.pos.y, r.radius * 0.85, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    for (const t of this._specialTrail) {
      ctx.save(); ctx.globalAlpha = t.alpha;
      ctx.fillStyle = CYAN;
      ctx.beginPath(); ctx.arc(t.x, t.y, 10, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    for (const b of this._specialBeams) {
      const alpha = b.life / b.maxLife;
      const endX = b.startPos.x + b.dir.x * b.length;
      const endY = b.startPos.y + b.dir.y * b.length;
      ctx.save(); ctx.lineCap = 'round';
      // Outer glow halo (additive blend)
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * 0.35; ctx.strokeStyle = '#ff6600'; ctx.lineWidth = Math.round(32 * alpha);
      ctx.beginPath(); ctx.moveTo(b.startPos.x, b.startPos.y); ctx.lineTo(endX, endY); ctx.stroke();
      // Mid beam
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = alpha; ctx.strokeStyle = '#ff6600'; ctx.lineWidth = Math.round(12 * alpha);
      ctx.beginPath(); ctx.moveTo(b.startPos.x, b.startPos.y); ctx.lineTo(endX, endY); ctx.stroke();
      // Bright core
      ctx.strokeStyle = '#ffe0aa'; ctx.lineWidth = Math.round(5 * alpha);
      ctx.beginPath(); ctx.moveTo(b.startPos.x, b.startPos.y); ctx.lineTo(endX, endY); ctx.stroke();
      // White hot center
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.round(2 * alpha);
      ctx.beginPath(); ctx.moveTo(b.startPos.x, b.startPos.y); ctx.lineTo(endX, endY); ctx.stroke();
      ctx.restore();
    }
    this.particles.draw(ctx);

    // 6c ── Enemy bullets
    for (const b of this.enemyBullets) {
      if (_off(b.pos)) continue;   // offscreen — skip draw
      drawGlow(ctx, b.pos.x, b.pos.y, b.radius * 2, b.color, 0.5);
      ctx.fillStyle   = b.color;
      ctx.beginPath(); ctx.arc(b.pos.x, b.pos.y, b.radius, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = WHITE; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(b.pos.x, b.pos.y, b.radius, 0, Math.PI * 2); ctx.stroke();
    }

    // 6d ── Final-boss CORRUPTION beam + novas (on top of entities for readability)
    this._drawBossCorruption(ctx);

    // 6b ── Phoenix revive effect (epic multi-layer, world-space)
    if (this.phoenixReviveTimer > 0) {
      const elapsed = 3.0 - this.phoenixReviveTimer;           // 0 at birth → 3 at end
      const alpha   = Math.max(0, this.phoenixReviveTimer / 3.0);
      const rtype   = this.phoenixReviveType || 'orange';
      const px = this.player.pos.x;
      const py = this.player.pos.y;

      // ── per-tier colour config ──────────────────────────────────────────
      let tintRGBA, coreColor, ringColor, sparkColor, pimg, sprSz;
      if (rtype === 'blue') {
        tintRGBA   = `rgba(0,160,255,${(alpha * 0.32).toFixed(3)})`;
        coreColor  = '#00e6ff';
        ringColor  = '#0099ff';
        sparkColor = '#aaeeff';
        pimg       = this._phoenixBlueImage;
        sprSz      = 165;
      } else if (rtype === 'gold') {
        tintRGBA   = `rgba(255,200,0,${(alpha * 0.45).toFixed(3)})`;
        coreColor  = '#ffdd00';
        ringColor  = '#ff8800';
        sparkColor = '#ffe066';
        pimg       = this._phoenixGoldImage;
        sprSz      = 200;
      } else {
        tintRGBA   = `rgba(255,140,0,${(alpha * 0.40).toFixed(3)})`;
        coreColor  = '#ff8800';
        ringColor  = '#ffaa00';
        sparkColor = '#ff6600';
        pimg       = this._phoenixImage;
        sprSz      = 150;
      }

      // ── Layer 1: full-screen tint (softened so the revive isn't an overwhelming flash) ──
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = tintRGBA;
      ctx.fillRect(this.camera.x, this.camera.y, this._viewW, this._viewH);   // cover the zoomed-out view
      ctx.restore();

      // ── Layer 2: radial gradient burst ─────────────────────────────────
      {
        const gr = 50 + elapsed * 40;
        const grd = ctx.createRadialGradient(px, py, 0, px, py, gr);
        const gc  = rtype === 'blue' ? '0,200,255' : rtype === 'gold' ? '255,210,0' : '255,160,0';
        grd.addColorStop(0, `rgba(${gc},${(alpha * 0.55).toFixed(3)})`);
        grd.addColorStop(1, `rgba(${gc},0)`);
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(px, py, gr, 0, Math.PI * 2); ctx.fill();
      }

      // ── Layer 3: phoenix sprite (or fallback glow rings) ────────────────
      if (pimg && pimg.complete && pimg.naturalWidth > 0) {
        ctx.save();
        ctx.globalAlpha          = Math.min(1, alpha * 1.8);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(pimg, px - sprSz / 2, py - sprSz, sprSz, sprSz);
        ctx.imageSmoothingEnabled = true;
        ctx.restore();
      } else {
        // Fallback: two concentric glow rings
        ctx.save();
        ctx.strokeStyle = coreColor;
        ctx.lineWidth   = 6;
        ctx.globalAlpha = alpha * 0.9;
        ctx.beginPath(); ctx.arc(px, py, 40 + elapsed * 18, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth   = 3;
        ctx.globalAlpha = alpha * 0.5;
        ctx.beginPath(); ctx.arc(px, py, 62 + elapsed * 24, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }

      // ── Layer 4: shockwave ring(s) ──────────────────────────────────────
      const drawRing = (delay, lw, maxR) => {
        const t = elapsed - delay;
        if (t <= 0) return;
        const r  = t * 200;
        if (r > maxR) return;
        const rA = Math.max(0, (1 - r / maxR)) * alpha;
        ctx.save();
        ctx.strokeStyle = ringColor;
        ctx.lineWidth   = lw;
        ctx.globalAlpha = rA;
        ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      };
      drawRing(0,    5, 190);
      if (rtype !== 'orange') drawRing(0.28, 3, 165);
      if (rtype === 'gold')   drawRing(0.50, 2, 145);

      // ── Layer 5: radial spark particles ────────────────────────────────
      {
        const SPARKS = rtype === 'gold' ? 24 : rtype === 'blue' ? 16 : 8;
        ctx.save();
        for (let i = 0; i < SPARKS; i++) {
          const angle = (i / SPARKS) * Math.PI * 2;
          const dist  = elapsed * (90 + (i % 4) * 25);
          const sx    = px + Math.cos(angle) * dist;
          const sy    = py + Math.sin(angle) * dist;
          const pA    = Math.max(0, 1 - dist / 380) * alpha;
          if (pA <= 0) continue;
          ctx.globalAlpha = pA;
          ctx.fillStyle   = sparkColor;
          ctx.beginPath();
          ctx.arc(sx, sy, Math.max(1, 4 - elapsed * 1.2), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // ── Layer 6: rising feather streaks (blue / gold only) ─────────────
      if (rtype !== 'orange') {
        const STREAKS = rtype === 'gold' ? 12 : 8;
        ctx.save();
        ctx.lineCap = 'round';
        for (let i = 0; i < STREAKS; i++) {
          const angle  = ((i / STREAKS) * Math.PI * 2) - Math.PI / 2;
          const spread = 70 + (i % 3) * 45;
          const rise   = elapsed * 160;
          const sx     = px + Math.cos(angle) * spread;
          const sy     = py + Math.sin(angle) * spread - rise;
          const sA     = Math.max(0, 1 - elapsed / 2.2) * alpha;
          if (sA <= 0) continue;
          ctx.globalAlpha = sA;
          ctx.strokeStyle = coreColor;
          ctx.lineWidth   = rtype === 'gold' ? 3 : 2;
          ctx.beginPath();
          ctx.moveTo(sx, sy + 22);
          ctx.lineTo(sx, sy);
          ctx.stroke();
          // small dot at tip
          ctx.fillStyle = sparkColor;
          ctx.globalAlpha = sA * 0.8;
          ctx.beginPath();
          ctx.arc(sx, sy, 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      ctx.globalAlpha = 1;
    }

    // Floating texts (world-space)
    for (const ft of this.floatingTexts) ft.draw(ctx);

    this._drawThunderSoloWorld(ctx);   // ultimate lightning rain + musical notes over world entities
    this._drawOverheatedChains(ctx);   // Cyber Arm Hero ultimate: rotating fiery chains around the hero
    this._drawSpiritDojang(ctx);       // Neon Taekwondo Girl ultimate: cyan dojo field + flag at cast point

    this._drawComboPopups(ctx);        // combo milestone popups (world-space, on top of the action)

    this._drawPlayerMarker(ctx);       // clear "you are here" marker — above every world effect

    ctx.restore();  // end camera-space block

    this._drawPhasewalkerFx(ctx);      // Japan Phasewalker glitch-dash / EMP / singularity (screen-space; guards on character)
    this._drawOniFx(ctx);           // Oni Protocol 0 (screen-space; guards on character)
    this._drawThunderSoloScreen(ctx);  // darken + fullscreen lightning flash (under HUD)
    this._drawStormOverlay(ctx);       // Endless Lightning Storm: full-map rain/lightning atmosphere
    this._drawLavaAtmosphere(ctx);     // Lava Rain: full-map warm wash + drifting embers (visual only)

    // ── Screen-space block (HUD, overlays) ───────────────────────────────────
    this._drawAcidRain(ctx);
    this._drawFrozenSleet(ctx);            // Chaos Mode: Frozen Sleet Storm overlay
    // Chaos Mode: screen-edge rim glow + player-centred vignette (readability polish)
    if (this._chaosMode) { this._drawChaosRimGlow(ctx); this._drawChaosVignette(ctx); }
    this._drawGridCacheArrow(ctx);
    ctx.fillStyle = BLACK;
    ctx.fillRect(0, 0, WIDTH, 44);

    drawHUD(ctx, this);
    this._drawActiveRelicHUD(ctx);
    this._drawNpcWalkerHUD(ctx);   // KIROSHI WALKER status panel
    this._drawNullBreachArena(ctx);            // Null Breach Arena overlay + timer
    this._drawEdenGameplayTransmission(ctx);   // Eden Core in-run popup (upper-right)
    if (this._postArenaChoice) this._drawPostArenaChoice(ctx);   // post-Arena NULL decision panel
    this._drawObjectiveIndicators(ctx);   // wayfinding: arrow to nearest Nexus (carrying) / core (early)
    this._drawOnboarding(ctx);            // first-minute objective callout + fading hints (Act 1)
    // drawVignette(ctx, this.overload, this.timeAlive);  // disabled: overload capped at 99 → constant pulse at high overload
    drawDamagePulse(ctx, this.damageFlash, this.damageFlashIntensity, DMG_PULSE.duration);
    // Brief white overlay on heavy boss hit (visual hit-stop surrogate)
    if (this._hitFlashOverlayTimer > 0) {
      ctx.save();
      ctx.globalAlpha = (this._hitFlashOverlayTimer / 0.07) * 0.28;
      ctx.fillStyle   = '#ffffff';
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.globalAlpha = 1;
      ctx.restore();
    }
    this._drawScanlines(ctx);

    this._drawAnnouncement(ctx);

    if (this.upgradeUI) this.upgradeUI.draw(ctx, this.player, this);
    if (this.mutationUI) this.mutationUI.draw(ctx, this.player, this);
    if (this.victory)        this._drawVictoryScreen(ctx);
    else if (this.gameOver)  drawEndScreen(ctx, this);

    if (this.paused && !this.gameOver && !this.victory) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.font      = '46px Consolas, monospace';
      ctx.fillStyle = YELLOW;
      ctx.textAlign = 'center';
      ctx.fillText('PAUSED', WIDTH / 2, HEIGHT / 2 - 18);
      // RESUME / RETURN TO MAIN MENU buttons (mouse + ESC). Rects from _pauseButtonRect.
      const labels = ['RESUME', 'RETURN TO MAIN MENU'];
      for (let i = 0; i < 2; i++) this._drawSlotLabel(ctx, this._pauseButtonRect(i), labels[i], false, i === 0 ? CYAN : '#ff8a8a');
      ctx.font = '13px Consolas, monospace'; ctx.fillStyle = 'rgba(200,210,225,0.6)'; ctx.textAlign = 'center';
      ctx.fillText('ESC Resume', WIDTH / 2, this._pauseButtonRect(1).y + 78);
      ctx.textAlign = 'left';
    }
  }

  // ─── Premium UI primitives (brushed metal + frosted glass + neon, Canvas 2D) ────────────────
  _premiumPanel(ctx, x, y, w, h, accent, title) {
    ctx.save();
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, 'rgba(16,22,32,0.90)'); g.addColorStop(0.5, 'rgba(10,15,24,0.88)'); g.addColorStop(1, 'rgba(7,11,18,0.93)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(x, y, w, h, 10); ctx.fill();
    // inner textures (clipped): brushed-metal streaks + faint accent grid
    ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, w, h, 10); ctx.clip();
    ctx.globalAlpha = 0.045; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
    for (let yy = y + 3; yy < y + h; yy += 4) { ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke(); }
    ctx.globalAlpha = 0.06; ctx.strokeStyle = accent;
    for (let xx = x + 14; xx < x + w; xx += 24) { ctx.beginPath(); ctx.moveTo(xx, y); ctx.lineTo(xx, y + h); ctx.stroke(); }
    ctx.globalAlpha = 1;
    const hb = ctx.createLinearGradient(x, y, x + w, y); hb.addColorStop(0, accent + '33'); hb.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = hb; ctx.fillRect(x, y, w, 24);
    ctx.globalAlpha = 0.5; ctx.strokeStyle = accent; ctx.lineWidth = 2;   // tactical corner ticks
    ctx.beginPath(); ctx.moveTo(x + 2, y + 12); ctx.lineTo(x + 2, y + 2); ctx.lineTo(x + 12, y + 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + w - 12, y + h - 2); ctx.lineTo(x + w - 2, y + h - 2); ctx.lineTo(x + w - 2, y + h - 12); ctx.stroke();
    ctx.restore();
    ctx.shadowColor = accent; ctx.shadowBlur = 12; ctx.strokeStyle = accent; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 10); ctx.stroke(); ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(x + 2, y + 2, w - 4, h - 4, 8); ctx.stroke();
    if (title) { ctx.font = 'bold 12px Consolas, monospace'; ctx.fillStyle = accent; ctx.textAlign = 'left'; ctx.fillText('▍' + title, x + 10, y + 17); }
    ctx.restore();
  }

  _statCapsule(ctx, x, y, w, h, label, value, accent) {
    ctx.save();
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, 'rgba(255,255,255,0.06)'); g.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(x, y, w, h, 7); ctx.fill();
    ctx.strokeStyle = accent + '99'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(x, y, w, h, 7); ctx.stroke();
    ctx.fillStyle = accent; ctx.fillRect(x, y + 6, 3, h - 12);   // accent edge
    ctx.fillStyle = 'rgba(186,200,214,0.72)'; ctx.font = '9px Consolas, monospace'; ctx.textAlign = 'left';
    ctx.fillText(label, x + 9, y + 13);
    ctx.fillStyle = '#eaffff'; ctx.font = 'bold 13px "Segoe UI Emoji", Consolas, monospace';
    ctx.fillText(value, x + 9, y + h - 7);
    ctx.restore();
  }

  _premiumButton(ctx, x, y, w, h, label, sel, accent) {
    ctx.save();
    const g = ctx.createLinearGradient(x, y, x, y + h);
    if (sel) { g.addColorStop(0, 'rgba(10,42,60,0.92)'); g.addColorStop(1, 'rgba(6,22,36,0.92)'); }
    else     { g.addColorStop(0, 'rgba(15,21,31,0.82)'); g.addColorStop(1, 'rgba(8,12,20,0.84)'); }
    ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(x, y, w, h, 9); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,' + (sel ? 0.10 : 0.05) + ')'; ctx.beginPath(); ctx.roundRect(x + 2, y + 2, w - 4, h * 0.42, 7); ctx.fill();   // top sheen
    ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, w, h, 9); ctx.clip();
    ctx.globalAlpha = 0.05; ctx.strokeStyle = accent;
    for (let yy = y + 4; yy < y + h; yy += 4) { ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke(); }
    ctx.restore();
    if (sel) { ctx.shadowColor = accent; ctx.shadowBlur = 14; ctx.strokeStyle = accent; ctx.lineWidth = 2; }
    else     { ctx.strokeStyle = 'rgba(150,120,210,0.42)'; ctx.lineWidth = 1; }
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 9); ctx.stroke(); ctx.shadowBlur = 0;
    if (sel) { ctx.fillStyle = accent; ctx.fillRect(x + 7, y + 9, 3, h - 18); }
    ctx.font = sel ? 'bold 21px Consolas, monospace' : '19px Consolas, monospace';
    ctx.fillStyle = sel ? '#eaffff' : 'rgba(214,226,238,0.92)'; ctx.textAlign = 'center';
    ctx.fillText(label, x + w / 2, y + h / 2 + 7);
    ctx.restore();
  }

  _fmtClock(s) { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

  // Proportional theme-slot map (fractions of the canvas) matched to the baked boxes in
  // main_menu_theme.png. Single source of layout truth — tweak here if the art shifts.
  _themeSlots() {
    const W = WIDTH, H = HEIGHT;
    return {
      // Left stacked boxes (cyan / orange / green)
      progression:     { x: W * 0.020, y: H * 0.090, w: W * 0.140, h: H * 0.190 },
      equipment:       { x: W * 0.017, y: H * 0.316, w: W * 0.144, h: H * 0.178 },
      quickStats:      { x: W * 0.017, y: H * 0.523, w: W * 0.144, h: H * 0.190 },
      // Right stacked boxes
      systemFeed:      { x: W * 0.800, y: H * 0.090, w: W * 0.182, h: H * 0.190 },
      activeProtocols: { x: W * 0.800, y: H * 0.314, w: W * 0.182, h: H * 0.202 },
      nowPlaying:      { x: W * 0.800, y: H * 0.536, w: W * 0.182, h: H * 0.186 },
      controllerHelp:  { x: W * 0.758, y: H * 0.758, w: W * 0.224, h: H * 0.196 },
      // Top-right resource strip (kept clear of the centre logo)
      topResources:    { x: W * 0.720, y: H * 0.014, w: W * 0.262, h: H * 0.052 },
      // Bottom-centre trio of small slots
      bottomSlots:     { x: W * 0.378, y: H * 0.862, w: W * 0.190, h: H * 0.104 },
      ageBadge:        { x: W * 0.016, y: H * 0.912, w: W * 0.042, h: H * 0.060 },
    };
  }

  // Centralised main-menu button rect (one per item) — mirrored by main.js click hit-test so the
  // labels land inside the baked central button-stack slots at any canvas size.
  _menuButtonRect(i) {
    const W = WIDTH, H = HEIGHT;
    return { x: W * 0.447, y: H * 0.345 + i * (H * 0.0665), w: W * 0.206, h: H * 0.052 };
  }

  // Draw a label centered inside a baked button slot — only a subtle selection glow is added (the
  // slot plate itself is part of the theme art). Shared by the main menu + Settings overlay.
  _drawSlotLabel(ctx, r, label, sel, accent) {
    accent = accent || CYAN;
    if (sel) {
      ctx.save();
      ctx.fillStyle = accent + '1f'; ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 7); ctx.fill();
      ctx.shadowColor = accent; ctx.shadowBlur = 12; ctx.strokeStyle = accent; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 7); ctx.stroke();
      ctx.fillStyle = accent; ctx.fillRect(r.x + 8, r.y + r.h / 2 - 8, 3, 16);
      ctx.restore();
    }
    ctx.font = sel ? 'bold 20px Consolas, monospace' : '18px Consolas, monospace';
    ctx.fillStyle = sel ? '#eaffff' : 'rgba(220,232,244,0.92)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + 1);
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  }

  // Ultra-light readability tint for a baked theme box (the box BORDER is already in the art, so we
  // never draw our own border/heavy panel — only a faint inner darken + the live title text).
  _slotPanel(ctx, s, accent, title) {
    ctx.save();
    ctx.fillStyle = 'rgba(6,10,18,0.22)';
    ctx.beginPath(); ctx.roundRect(s.x + 3, s.y + 3, s.w - 6, s.h - 6, 6); ctx.fill();
    if (title) { ctx.font = 'bold 11px Consolas, monospace'; ctx.fillStyle = accent; ctx.textAlign = 'left'; ctx.fillText(title, s.x + 12, s.y + 18); }
    ctx.restore();
  }

  // Resolve the character the dashboard summarizes — the live selection is the source of truth.
  _menuSelectedChar() {
    const id = this.selectedCharacter || this.characters[this.characterIndex]?.id;
    return this.characters.find(c => c.id === id) || this.characters[0];
  }

  // Compact label→value row inside a slot (dim label left, bright value right). Keeps boxes readable
  // at the baked theme size without heavy widgets.
  _slotRow(ctx, x, w, y, label, val, color) {
    ctx.textAlign = 'left';  ctx.font = '10px Consolas, monospace';        ctx.fillStyle = 'rgba(176,190,206,0.72)'; ctx.fillText(label, x, y);
    ctx.textAlign = 'right'; ctx.font = 'bold 11px "Segoe UI Emoji", Consolas, monospace'; ctx.fillStyle = color || '#eaffff'; ctx.fillText(String(val), x + w, y);
    ctx.textAlign = 'left';
  }

  // ─── Main-menu dashboard (summary only — real meta state, bound to the selected character) ──
  _drawMenuDashboard(ctx) {
    const m = this.meta;
    const S = this._themeSlots();
    const ch = this._menuSelectedChar();
    const el = CHARACTER_ELEMENT[ch.id]; const elIcon = ELEMENT_ICON[el] || '◆';
    const progression = m && m.getPlayerProgression ? m.getPlayerProgression() : { level: 1, rank: 'ROOKIE', progress: 0, label: '1 / 5 TO NEXT LEVEL' };
    const owned = (m && m.protocolCards) ? Object.keys(m.protocolCards).filter(k => m.protocolCards[k]) : [];
    const pfAvail  = m ? m.getProtocolFragments() : 0;
    const best = (m && m.endlessRecords) || { time: 0, score: 0, level: 0 };

    // ── PROGRESSION (left top) — profile header + real progression values ──
    let s = S.progression; this._slotPanel(ctx, s, '#3CF0E6', 'PROGRESSION');
    const ix = s.x + 12, iw = s.w - 24;
    const name = (m && m.getProfileName && m.getProfileName()) || 'PLAYER_01';
    ctx.textAlign = 'left'; ctx.font = 'bold 12px Consolas, monospace'; ctx.fillStyle = '#eaffff';
    ctx.fillText(name, ix, s.y + 34);
    ctx.font = '9px Consolas, monospace'; ctx.fillStyle = '#ffd23c'; ctx.fillText(`LEVEL ${progression.level} · ${progression.rank}`, ix, s.y + 47);
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.roundRect(ix, s.y + 52, iw, 6, 3); ctx.fill();
    ctx.fillStyle = '#3CF0E6'; ctx.beginPath(); ctx.roundRect(ix, s.y + 52, iw * progression.progress, 6, 3); ctx.fill();
    this._slotRow(ctx, ix, iw, s.y + 76,  'CREDITS',   m ? m.credits : 0, '#7fd0ff');
    this._slotRow(ctx, ix, iw, s.y + 92,  'PF AVAIL',  '◆ ' + pfAvail, '#ff5ea8');
    this._slotRow(ctx, ix, iw, s.y + 108, 'NEXT LV',   progression.label, '#9fe8ff');
    this._slotRow(ctx, ix, iw, s.y + 124, 'BEST',      best.time > 0 ? this._fmtClock(best.time) : '—', '#9fff9f');

    // ── EQUIPMENT (left mid) — bound to selected character ──
    s = S.equipment; this._slotPanel(ctx, s, '#FF9B3C', 'EQUIPMENT');
    const ex = s.x + 12, ew = s.w - 24;
    ctx.textAlign = 'left'; ctx.fillStyle = '#eaffff'; ctx.font = 'bold 12px Consolas, monospace';
    ctx.fillText(ch.name.length > 19 ? ch.name.slice(0, 18) + '…' : ch.name, ex, s.y + 38);
    this._slotRow(ctx, ex, ew, s.y + 58, 'CLASS',   ch.role, '#ffd2a0');
    this._slotRow(ctx, ex, ew, s.y + 76, 'ELEMENT', elIcon + ' ' + (el ? el.toUpperCase() : '—'), this._elementColors?.[el] || '#7df9ff');
    this._slotRow(ctx, ex, ew, s.y + 94, 'WEAPON',  this._charWeaponLabel(ch.id), '#ffe0b0');

    // ── QUICK STATS (left bottom) — bound to selected character (no fake HP/ATK) ──
    s = S.quickStats; this._slotPanel(ctx, s, '#9fff6a', 'QUICK STATS');
    const qx = s.x + 12, qw = s.w - 24;
    const revives = 3 + (this._hasProto('phoenix_revival') ? 1 : 0);
    this._slotRow(ctx, qx, qw, s.y + 38,  'ELEMENT',   elIcon + ' ' + (el ? el.toUpperCase() : '—'), '#7df9ff');
    this._slotRow(ctx, qx, qw, s.y + 56,  'CLASS',     ch.role.split(' ')[0], '#9fff6a');
    this._slotRow(ctx, qx, qw, s.y + 74,  'REVIVES',   '✦ ' + revives, '#ff9b3c');
    this._slotRow(ctx, qx, qw, s.y + 92,  'PROTOCOLS', '◈ ' + owned.length, '#b88bff');
    const _qStats = { skeleton_warrior:{hp:130,mana:100}, taekwondo_girl:{hp:90,mana:100}, cyber_arm_hero:{hp:100,mana:100}, brawler_warrior:{hp:125,mana:100}, assassin_clone:{hp:88,mana:100}, japan_phasewalker:{hp:100,mana:100}, euclid_vector:{hp:100,mana:100}, oni_cataclysm_protocol:{hp:100,mana:100} };
    const _qs = _qStats[ch.id] || { hp: 100, mana: 100 };
    this._slotRow(ctx, qx, qw, s.y + 110, 'HP / MANA', _qs.hp + ' / ' + _qs.mana, '#7fd0ff');

    // ── SYSTEM FEED (right top) — real hints, no fake daily system ──
    s = S.systemFeed; this._slotPanel(ctx, s, '#7fd0ff', 'SYSTEM FEED');
    const next = ENDLESS_ACHIEVEMENTS.filter(a => !(m && m.achievements && m.achievements[a.id])).slice(0, 2);
    ctx.textAlign = 'left'; ctx.font = '11px Consolas, monospace';
    let fy = s.y + 40;
    if (next.length === 0) { ctx.fillStyle = 'rgba(190,255,200,0.85)'; ctx.fillText('› ALL MILESTONES CLEARED ✓', s.x + 12, fy); fy += 20; }
    else for (const a of next) { ctx.fillStyle = 'rgba(205,216,228,0.85)'; ctx.fillText('› ' + a.desc.slice(0, 28), s.x + 12, fy); fy += 20; }
    ctx.fillStyle = 'rgba(160,180,200,0.6)'; ctx.fillText('› Daily Missions: Coming Soon', s.x + 12, fy);

    // ── ACTIVE PROTOCOLS (right mid) — real unlocked state ──
    s = S.activeProtocols; this._slotPanel(ctx, s, '#b88bff', 'ACTIVE PROTOCOLS');
    ctx.textAlign = 'left'; ctx.fillStyle = '#d8c7ff'; ctx.font = 'bold 12px Consolas, monospace';
    ctx.fillText(`UNLOCKED  ${owned.length} / ${PROTOCOL_CARDS.length}`, s.x + 12, s.y + 40);
    if (owned.length === 0) {
      ctx.fillStyle = 'rgba(190,200,215,0.62)'; ctx.font = '11px Consolas, monospace';
      ctx.fillText('No active protocols', s.x + 12, s.y + 64);
      ctx.fillText('› UPGRADES › PROTOCOLS', s.x + 12, s.y + 82);
    } else {
      let ry = s.y + 62; ctx.font = '11px Consolas, monospace';
      for (const id of owned.slice(0, 3)) {
        const card = PROTOCOL_CARDS.find(c => c.id === id);
        ctx.fillStyle = '#eee6ff'; ctx.fillText('◈ ' + (card ? card.name : id).slice(0, 24), s.x + 12, ry); ry += 20;
      }
      if (owned.length > 3) { ctx.fillStyle = 'rgba(190,200,215,0.62)'; ctx.fillText('+' + (owned.length - 3) + ' more…', s.x + 12, ry); }
    }

    // ── NOW PLAYING (right lower) — real audio status ──
    this._drawNowPlaying(ctx, S.nowPlaying);

    // ── BUILD / INPUT (right bottom wide) — selected-character build identity + compact input ──
    s = S.controllerHelp; this._slotPanel(ctx, s, '#7df9ff', 'BUILD');
    const bx2 = s.x + 12, bw2 = s.w - 24;
    this._slotRow(ctx, bx2, bw2, s.y + 40, 'BUILD',   ch.role, '#9fffe6');
    this._slotRow(ctx, bx2, bw2, s.y + 58, 'ELEMENT', elIcon + ' ' + (el ? el.toUpperCase() : '—'), this._elementColors?.[el] || '#7df9ff');
    this._slotRow(ctx, bx2, bw2, s.y + 76, 'WEAPON',  this._charWeaponLabel(ch.id), '#ffe0b0');
    ctx.textAlign = 'left'; ctx.font = '10px Consolas, monospace'; ctx.fillStyle = 'rgba(160,180,200,0.7)';
    ctx.fillText('INPUT: Enter / ESC · Controller (Xbox · PS · PC)', bx2, s.y + 98);

    // ── BOTTOM-CENTRE quick slots (Save / Best Run / Build) ──
    s = S.bottomSlots; const bsW = (s.w - 16) / 3;
    const slot = (i, label, val, col) => {
      const bx = s.x + i * (bsW + 8);
      ctx.textAlign = 'center'; ctx.font = '8px Consolas, monospace'; ctx.fillStyle = 'rgba(170,185,200,0.7)';
      ctx.fillText(label, bx + bsW / 2, s.y + s.h / 2 - 6);
      ctx.font = 'bold 11px "Segoe UI Emoji", Consolas, monospace'; ctx.fillStyle = col;
      ctx.fillText(val, bx + bsW / 2, s.y + s.h / 2 + 12);
      ctx.textAlign = 'left';
    };
    slot(0, 'PROFILE', name.length > 9 ? name.slice(0, 8) + '…' : name, '#7fd0ff');
    slot(1, 'BEST RUN', best.time > 0 ? this._fmtClock(best.time) : '—', '#9fff9f');
    slot(2, 'BUILD', elIcon + ' ◈' + owned.length, '#b88bff');
  }

  // Short per-character primary-weapon identity label (display only; matches each kit's flavour).
  _charWeaponLabel(id) {
    return ({
      skeleton_warrior: 'Storm Saber',
      taekwondo_girl:   'Spirit Strikes',
      cyber_arm_hero:   'Arm Cannon',
      brawler_warrior:  'Nexus Chakram',
      assassin_clone:   'Plasma Daggers',
      euclid_vector:    'Vector Bolt',
      oni_cataclysm_protocol: 'Cataclysm Core',
    })[id] || '—';
  }

  _drawNowPlaying(ctx, s) {
    this._slotPanel(ctx, s, '#3CF0E6', 'NOW PLAYING');
    const muted = !!(this.audio && this.audio.muted);
    const t = performance.now() * 0.004;
    ctx.font = '16px "Segoe UI Emoji", Consolas, monospace'; ctx.textAlign = 'left';
    ctx.fillStyle = muted ? '#7a8290' : '#3CF0E6';
    ctx.fillText(muted ? '🔇' : '🎵', s.x + 12, s.y + s.h - 16);
    const bars = 12, bw = 6, gap = 5; let bx = s.x + 44; const baseY = s.y + s.h - 14; const maxH = s.h - 52;
    for (let i = 0; i < bars; i++) {
      const hh = muted ? 3 : 4 + (Math.sin(t + i * 0.7) * 0.5 + 0.5) * maxH;
      const grad = ctx.createLinearGradient(0, baseY - hh, 0, baseY);
      grad.addColorStop(0, muted ? '#3a4048' : '#9fffe6'); grad.addColorStop(1, muted ? '#202428' : '#1fa898');
      ctx.fillStyle = grad; ctx.fillRect(bx, baseY - hh, bw, hh); bx += bw + gap;
    }
    ctx.font = '10px Consolas, monospace'; ctx.textAlign = 'right';
    const trackLabel = this.audio?.currentTrackTitle || 'NULL EDEN OST';
    ctx.fillStyle = muted ? '#9aa4b0' : 'rgba(180,255,245,0.85)';
    ctx.fillText(muted ? 'MUTED' : trackLabel, s.x + s.w - 12, s.y + 36);
    ctx.textAlign = 'left';
  }

  // Top-right resource strip — real Grid Credits (blue crystal) + real spendable PF (magenta crystal).
  _drawTopResources(ctx) {
    const s = this._themeSlots().topResources;
    const m = this.meta;
    const credits = m ? m.credits : 0;
    const pf = m ? m.getProtocolFragments() : 0;
    const cy = s.y + s.h / 2;
    const pill = (rightX, icon, val, color) => {
      ctx.font = 'bold 15px Consolas, monospace';
      const txt = String(val);
      const tw = ctx.measureText(txt).width;
      const pw = tw + 44, px = rightX - pw;
      ctx.save();
      ctx.fillStyle = 'rgba(8,12,20,0.5)'; ctx.beginPath(); ctx.roundRect(px, s.y, pw, s.h, s.h / 2); ctx.fill();
      ctx.strokeStyle = color + '88'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(px, s.y, pw, s.h, s.h / 2); ctx.stroke();
      // crystal/diamond icon
      const dx = px + 16, dr = 6;
      ctx.fillStyle = color; ctx.beginPath();
      ctx.moveTo(dx, cy - dr); ctx.lineTo(dx + dr, cy); ctx.lineTo(dx, cy + dr); ctx.lineTo(dx - dr, cy); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.35; ctx.beginPath();
      ctx.moveTo(dx, cy - dr); ctx.lineTo(dx + dr, cy); ctx.lineTo(dx, cy); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
      ctx.fillStyle = '#eaffff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(txt, px + 28, cy + 1); ctx.textBaseline = 'alphabetic';
      ctx.restore();
      return px;
    };
    const rightX = s.x + s.w;
    const pfLeft = pill(rightX, '◆', pf, '#ff5ea8');          // magenta = Protocol Fragments
    pill(pfLeft - 10, '◆', credits, '#5ec8ff');               // blue = Grid Credits
  }

  _drawMenuGear(ctx) {
    const r = this._menuGearRect();
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    ctx.save();
    ctx.font = '20px "Segoe UI Emoji", Consolas, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(180,200,220,0.85)';
    ctx.fillText('⚙', cx, cy + 1);
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  // ─── HTML menu overlay — cyber-grid-menu.html injected as DOM overlay ──────
  //
  //  _initMenuOverlay()       — create once (constructor); injects CSS + HTML into document
  //  _showMenuOverlay()       — refresh live data, make visible; called by goToMainMenu()
  //  _hideMenuOverlay()       — hide; called by every method that exits start_menu
  //  _syncMenuOverlayActive() — update only the active .mbtn; called by _updateStartMenu()
  //
  _initMenuOverlay() {
    if (this._menuOverlayEl) return;   // idempotent

    // ── Google Fonts (Press Start 2P · Orbitron · Share Tech Mono) ──────────
    if (!document.getElementById('cgm-fonts')) {
      const _lnk = (rel, href, xo) => { const l = document.createElement('link'); l.rel = rel; l.href = href; if (xo) l.crossOrigin = ''; document.head.appendChild(l); return l; };
      _lnk('preconnect', 'https://fonts.googleapis.com');
      _lnk('preconnect', 'https://fonts.gstatic.com', true);
      const lf = _lnk('stylesheet', 'https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Orbitron:wght@500;600;700;800;900&family=Share+Tech+Mono&display=swap');
      lf.id = 'cgm-fonts';
    }

    // ── Scoped CSS ───────────────────────────────────────────────────────────
    const style = document.createElement('style');
    style.id = 'cgm-style';
    style.textContent = `
      #cgm-overlay {
        position:fixed; inset:0; z-index:100;
        font-family:'Share Tech Mono',ui-monospace,monospace;
        color:#cfe9ff;
        background:
          radial-gradient(1200px 700px at 50% -10%,rgba(168,85,247,.18),transparent 60%),
          radial-gradient(900px 600px at 12% 30%,rgba(46,230,246,.10),transparent 60%),
          radial-gradient(900px 600px at 88% 70%,rgba(255,45,149,.10),transparent 60%),
          linear-gradient(180deg,#0b1030,#070a1c);
        display:flex; align-items:flex-start; justify-content:center;
        padding:22px; overflow-x:hidden; overflow-y:auto;
      }
      #cgm-overlay::before{
        content:""; position:fixed; inset:0; pointer-events:none; z-index:0;
        background-image:
          linear-gradient(rgba(46,230,246,.05) 1px,transparent 1px),
          linear-gradient(90deg,rgba(46,230,246,.05) 1px,transparent 1px);
        background-size:46px 46px;
        mask-image:radial-gradient(circle at 50% 40%,#000 0%,transparent 78%);
      }
      #cgm-overlay::after{
        content:""; position:fixed; inset:0; pointer-events:none; z-index:9999;
        background:repeating-linear-gradient(0deg,rgba(0,0,0,.10) 0 2px,transparent 2px 4px);
        opacity:.35; mix-blend-mode:overlay;
      }
      #cgm-overlay *{box-sizing:border-box;margin:0;padding:0;}
      #cgm-overlay :root{
        --bg-0:#070a1c;--bg-1:#0b1030;
        --panel:rgba(10,16,46,.62);--panel-edge:rgba(46,230,246,.10);
        --cyan:#2ee6f6;--cyan-dim:#1aa9bd;--magenta:#ff2d95;--purple:#a855f7;--amber:#fbbf24;--green:#34d399;
        --txt:#cfe9ff;--txt-dim:#6f86b8;--txt-faint:#46588a;
        --glow-cyan:0 0 8px rgba(46,230,246,.55),0 0 22px rgba(46,230,246,.22);
        --glow-mag:0 0 10px rgba(255,45,149,.55),0 0 26px rgba(255,45,149,.22);
        --radius:14px;--gap:16px;
      }
      /* inject :root vars onto overlay itself */
      #cgm-overlay{
        --bg-0:#070a1c;--bg-1:#0b1030;
        --panel:rgba(10,16,46,.62);--panel-edge:rgba(46,230,246,.10);
        --cyan:#2ee6f6;--cyan-dim:#1aa9bd;--magenta:#ff2d95;--purple:#a855f7;--amber:#fbbf24;--green:#34d399;
        --txt:#cfe9ff;--txt-dim:#6f86b8;--txt-faint:#46588a;
        --glow-cyan:0 0 8px rgba(46,230,246,.55),0 0 22px rgba(46,230,246,.22);
        --glow-mag:0 0 10px rgba(255,45,149,.55),0 0 26px rgba(255,45,149,.22);
        --radius:14px;--gap:16px;
      }
      #cgm-overlay .stage{
        position:relative;z-index:1;width:100%;max-width:1480px;
        border:1px solid var(--panel-edge);border-radius:20px;
        padding:22px 26px 18px;
        background:linear-gradient(180deg,rgba(168,85,247,.05),transparent 30%),rgba(7,10,28,.45);
        box-shadow:inset 0 0 60px rgba(46,230,246,.05),0 30px 80px rgba(0,0,0,.55);
      }
      #cgm-overlay .corner{position:absolute;width:34px;height:34px;border:2px solid var(--cyan);opacity:.8;filter:drop-shadow(var(--glow-cyan));}
      #cgm-overlay .corner.tl{top:-2px;left:-2px;border-right:0;border-bottom:0;border-radius:18px 0 0 0;}
      #cgm-overlay .corner.tr{top:-2px;right:-2px;border-left:0;border-bottom:0;border-radius:0 18px 0 0;}
      #cgm-overlay .corner.bl{bottom:-2px;left:-2px;border-right:0;border-top:0;border-radius:0 0 0 18px;}
      #cgm-overlay .corner.br{bottom:-2px;right:-2px;border-left:0;border-top:0;border-radius:0 0 18px 0;}
      #cgm-overlay .topbar{display:flex;justify-content:flex-end;align-items:center;gap:14px;margin-bottom:14px;}
      #cgm-overlay .chip{display:inline-flex;align-items:center;gap:8px;padding:7px 14px;border-radius:999px;border:1px solid rgba(46,230,246,.25);background:rgba(46,230,246,.06);font-size:14px;letter-spacing:.5px;}
      #cgm-overlay .chip.pink{border-color:rgba(255,45,149,.3);background:rgba(255,45,149,.07);}
      #cgm-overlay .chip svg{width:16px;height:16px;}
      #cgm-overlay .chip.cyan svg{color:var(--cyan);filter:drop-shadow(var(--glow-cyan));}
      #cgm-overlay .chip.pink svg{color:var(--magenta);filter:drop-shadow(var(--glow-mag));}
      #cgm-overlay .chip b{font-family:'Orbitron',sans-serif;font-weight:700;}
      #cgm-overlay .icon-btn{width:38px;height:38px;display:grid;place-items:center;border-radius:999px;border:1px solid rgba(207,233,255,.18);background:rgba(207,233,255,.04);cursor:pointer;color:var(--txt-dim);transition:.2s;}
      #cgm-overlay .icon-btn:hover{color:var(--cyan);border-color:var(--cyan);box-shadow:var(--glow-cyan);}
      #cgm-overlay .icon-btn svg{width:20px;height:20px;}
      #cgm-overlay .grid{display:grid;grid-template-columns:300px 1fr 308px;gap:var(--gap);align-items:start;}
      #cgm-overlay .col{display:flex;flex-direction:column;gap:var(--gap);}
      #cgm-overlay .panel{position:relative;border:1px solid var(--accent,var(--cyan));border-radius:var(--radius);background:var(--panel);padding:14px 16px;box-shadow:inset 0 0 22px rgba(0,0,0,.35),0 0 0 1px rgba(0,0,0,.25);backdrop-filter:blur(3px);}
      #cgm-overlay .panel::before{content:"";position:absolute;left:14px;right:14px;top:0;height:1px;background:linear-gradient(90deg,transparent,var(--accent,var(--cyan)),transparent);opacity:.6;}
      #cgm-overlay .panel-title{display:flex;align-items:center;gap:8px;font-family:'Orbitron',sans-serif;font-weight:800;font-size:12px;letter-spacing:2.5px;color:var(--accent,var(--cyan));text-shadow:0 0 10px var(--accent-glow,rgba(46,230,246,.5));margin-bottom:12px;}
      #cgm-overlay .panel-title .dot{width:6px;height:6px;border-radius:50%;background:var(--accent,var(--cyan));box-shadow:0 0 8px var(--accent,var(--cyan));}
      #cgm-overlay .row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:5px 0;font-size:13.5px;border-bottom:1px dashed rgba(111,134,184,.14);}
      #cgm-overlay .row:last-child{border-bottom:0;}
      #cgm-overlay .row .k{color:var(--txt-dim);letter-spacing:1px;text-transform:uppercase;font-size:12px;white-space:nowrap;}
      #cgm-overlay .row .v{color:var(--txt);font-family:'Orbitron',sans-serif;font-weight:600;text-align:right;display:inline-flex;align-items:center;gap:6px;max-width:60%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      #cgm-overlay .v svg{width:14px;height:14px;flex:none;}
      #cgm-overlay .v.cyan{color:var(--cyan);}  #cgm-overlay .v.amber{color:var(--amber);}
      #cgm-overlay .v.green{color:var(--green);} #cgm-overlay .v.mag{color:var(--magenta);}
      #cgm-overlay .v.amber svg{color:var(--amber);filter:drop-shadow(0 0 6px rgba(251,191,36,.5));}
      #cgm-overlay .player{font-family:'Orbitron',sans-serif;font-weight:800;font-size:18px;letter-spacing:1px;color:#fff;}
      #cgm-overlay .rank{color:var(--cyan);font-size:11px;letter-spacing:2px;margin:2px 0 10px;}
      #cgm-overlay .bar{height:8px;border-radius:6px;background:rgba(46,230,246,.12);overflow:hidden;margin-bottom:12px;border:1px solid rgba(46,230,246,.2);}
      #cgm-overlay .bar>i{display:block;height:100%;border-radius:6px;background:linear-gradient(90deg,var(--cyan),var(--purple));box-shadow:0 0 12px rgba(46,230,246,.6);}
      #cgm-overlay .equip-name{font-family:'Orbitron',sans-serif;font-weight:700;font-size:15px;color:var(--amber);text-shadow:0 0 10px rgba(251,191,36,.4);margin-bottom:10px;display:flex;align-items:center;gap:8px;}
      #cgm-overlay .equip-name span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      #cgm-overlay .equip-name svg{width:18px;height:18px;flex:none;}
      #cgm-overlay .feed-item{display:flex;align-items:flex-start;gap:8px;padding:6px 0;font-size:13.5px;}
      #cgm-overlay .feed-item.done{color:var(--green);} #cgm-overlay .feed-item.soon{color:var(--txt-faint);}
      #cgm-overlay .feed-item svg{width:15px;height:15px;margin-top:2px;flex:none;}
      #cgm-overlay .eden-portrait-header{display:flex;align-items:center;gap:8px;padding:5px 0 8px 0;border-bottom:1px solid rgba(46,230,246,.12);margin-bottom:4px;}
      #cgm-overlay .eden-portrait-frame{width:38px;height:46px;border:1px solid rgba(46,230,246,.65);border-radius:2px;background:rgba(0,5,18,.9);flex:none;overflow:hidden;box-shadow:0 0 7px rgba(46,230,246,.25);position:relative;}
      #cgm-overlay .eden-portrait-frame img{width:100%;height:100%;object-fit:cover;object-position:top center;display:block;}
      #cgm-overlay .eden-portrait-frame .eden-fallback-icon{display:none;width:100%;height:100%;align-items:center;justify-content:center;color:#3fd0ff;font-size:15px;font-weight:bold;}
      #cgm-overlay .eden-portrait-info .eden-pname{font-size:10px;letter-spacing:1.5px;color:#3fd0ff;font-weight:700;text-transform:uppercase;font-family:'Orbitron',sans-serif;}
      #cgm-overlay .eden-portrait-info .eden-psub{font-size:8.5px;letter-spacing:1px;color:rgba(63,208,255,.45);margin-top:2px;}
      #cgm-overlay .proto{display:flex;align-items:center;gap:9px;padding:7px 0;font-size:13.5px;color:var(--txt);}
      #cgm-overlay .proto svg{width:16px;height:16px;color:var(--purple);flex:none;filter:drop-shadow(0 0 6px rgba(168,85,247,.5));}
      #cgm-overlay .unlocked{font-family:'Orbitron',sans-serif;font-weight:700;color:var(--cyan);letter-spacing:2px;font-size:12px;margin-bottom:10px;}
      #cgm-overlay .unlocked b{color:#fff;}
      #cgm-overlay .eq{display:flex;align-items:flex-end;gap:4px;height:64px;margin-top:6px;}
      #cgm-overlay .eq>i{flex:1;background:linear-gradient(180deg,var(--cyan),var(--cyan-dim));border-radius:2px 2px 0 0;box-shadow:0 0 8px rgba(46,230,246,.4);animation:cgm-eq 1.1s ease-in-out infinite;transform-origin:bottom;}
      #cgm-overlay .eq>i:nth-child(2){animation-delay:.15s} #cgm-overlay .eq>i:nth-child(3){animation-delay:.30s}
      #cgm-overlay .eq>i:nth-child(4){animation-delay:.45s} #cgm-overlay .eq>i:nth-child(5){animation-delay:.60s}
      #cgm-overlay .eq>i:nth-child(6){animation-delay:.20s} #cgm-overlay .eq>i:nth-child(7){animation-delay:.50s}
      #cgm-overlay .eq>i:nth-child(8){animation-delay:.35s} #cgm-overlay .eq>i:nth-child(9){animation-delay:.10s}
      #cgm-overlay .eq>i:nth-child(10){animation-delay:.40s} #cgm-overlay .eq>i:nth-child(11){animation-delay:.25s}
      @keyframes cgm-eq{0%,100%{transform:scaleY(.25)} 50%{transform:scaleY(1)}}
      #cgm-eq-bars.live>i{animation:none;transition:transform 0.06s linear;}
      #cgm-overlay .now-row{display:flex;align-items:center;justify-content:space-between;}
      #cgm-overlay .now-row .label{font-family:'Orbitron',sans-serif;font-weight:600;color:var(--cyan);font-size:11px;letter-spacing:2px;}
      #cgm-overlay .now-row svg{width:16px;height:16px;color:var(--cyan);}
      #cgm-overlay .center{display:flex;flex-direction:column;align-items:center;gap:18px;}
      #cgm-overlay .title{text-align:center;line-height:1;padding-top:4px;}
      #cgm-overlay .title .l1{font-family:'Press Start 2P',monospace;font-size:clamp(28px,4.4vw,62px);background:linear-gradient(90deg,var(--magenta),var(--purple) 55%,var(--cyan));-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 0 14px rgba(255,45,149,.35));letter-spacing:2px;}
      #cgm-overlay .title .l2{font-family:'Press Start 2P',monospace;font-size:clamp(18px,2.6vw,36px);color:var(--cyan);text-shadow:var(--glow-cyan);margin-top:14px;letter-spacing:5px;}
      #cgm-overlay .title .l3{font-size:clamp(9px,0.85vw,12px);color:var(--txt-dim);letter-spacing:3px;text-transform:uppercase;margin-top:10px;opacity:0.6;}
      #cgm-overlay .stage-mid{display:flex;align-items:stretch;gap:22px;width:100%;justify-content:center;}
      #cgm-overlay .stage-art{flex:0 0 320px;position:relative;min-height:480px;border-radius:var(--radius);display:grid;place-items:end center;overflow:visible;}
      #cgm-overlay .stage-art:not(.has-art){border:1px dashed rgba(46,230,246,.28);background:radial-gradient(120% 80% at 50% 100%,rgba(46,230,246,.08),transparent 70%);}
      #cgm-overlay .stage-art img{display:none;width:auto;height:auto;max-width:100%;max-height:600px;object-position:bottom center;filter:drop-shadow(0 8px 26px rgba(0,0,0,.55)) drop-shadow(0 0 28px rgba(46,230,246,.18));}
      #cgm-overlay .stage-art.has-art img{display:block;}
      #cgm-overlay .stage-art.has-art .art-hint,#cgm-overlay .stage-art.has-art .art-corner{display:none;}
      #cgm-overlay .art-hint{text-align:center;color:var(--txt-faint);font-size:12px;letter-spacing:1px;padding:14px;}
      #cgm-overlay .art-hint b{display:block;color:var(--cyan);font-family:'Orbitron',sans-serif;letter-spacing:3px;margin-bottom:8px;}
      #cgm-overlay .art-corner{position:absolute;width:18px;height:18px;border:2px solid var(--cyan);opacity:.6;}
      #cgm-overlay .art-corner.a{top:8px;left:8px;border-right:0;border-bottom:0;}
      #cgm-overlay .art-corner.b{top:8px;right:8px;border-left:0;border-bottom:0;}
      #cgm-overlay .art-corner.c{bottom:8px;left:8px;border-right:0;border-top:0;}
      #cgm-overlay .art-corner.d{bottom:8px;right:8px;border-left:0;border-top:0;}
      #cgm-overlay .menu{flex:0 0 360px;display:flex;flex-direction:column;gap:12px;justify-content:center;}
      #cgm-overlay .mbtn{position:relative;width:100%;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:12px;padding:16px 20px;border-radius:12px;border:1px solid rgba(46,230,246,.28);background:linear-gradient(180deg,rgba(46,230,246,.05),rgba(10,16,46,.35));color:var(--txt);font-family:'Orbitron',sans-serif;font-weight:700;font-size:16px;letter-spacing:3px;text-transform:uppercase;transition:.16s ease;}
      #cgm-overlay .mbtn svg{width:18px;height:18px;opacity:0;transform:translateX(-6px);transition:.16s;color:var(--cyan);}
      #cgm-overlay .mbtn:hover,#cgm-overlay .mbtn.active{color:#fff;border-color:var(--cyan);background:linear-gradient(180deg,rgba(46,230,246,.16),rgba(46,230,246,.04));box-shadow:var(--glow-cyan),inset 0 0 18px rgba(46,230,246,.12);}
      #cgm-overlay .mbtn:hover svg,#cgm-overlay .mbtn.active svg{opacity:1;transform:translateX(0);}
      #cgm-overlay .mbtn.active::before{content:"";position:absolute;left:0;top:14%;bottom:14%;width:4px;background:var(--cyan);border-radius:4px;box-shadow:var(--glow-cyan);}
      #cgm-overlay .profile{width:100%;max-width:560px;margin:2px auto 0;display:grid;grid-template-columns:repeat(3,1fr);gap:12px;}
      #cgm-overlay .pcell{border:1px solid rgba(46,230,246,.22);border-radius:12px;background:var(--panel);padding:10px 14px;text-align:center;}
      #cgm-overlay .pcell .pk{font-size:10px;letter-spacing:2px;color:var(--txt-dim);text-transform:uppercase;}
      #cgm-overlay .pcell .pv{font-family:'Orbitron',sans-serif;font-weight:700;font-size:18px;margin-top:4px;display:flex;align-items:center;justify-content:center;gap:6px;}
      #cgm-overlay .pcell .pv.green{color:var(--green);} #cgm-overlay .pcell .pv svg{width:16px;height:16px;}
      #cgm-overlay .pcell .pv .amber{color:var(--amber);} #cgm-overlay .pcell .pv .cyan{color:var(--cyan);}
      #cgm-overlay .footer{display:flex;align-items:center;justify-content:space-between;margin-top:16px;}
      #cgm-overlay .age{font-family:'Orbitron',sans-serif;font-weight:800;font-size:15px;color:var(--cyan);border:1.5px solid var(--cyan);border-radius:10px;padding:8px 14px;box-shadow:var(--glow-cyan);}
      #cgm-overlay .hints{color:var(--txt-faint);font-size:13px;letter-spacing:1px;display:flex;gap:22px;flex-wrap:wrap;}
      #cgm-overlay .hints b{color:var(--cyan);font-weight:400;}
      #cgm-overlay .input-note{color:var(--txt-faint);font-size:11px;letter-spacing:1px;margin-top:8px;}
      #cgm-overlay .svgdefs{position:absolute;width:0;height:0;overflow:hidden;}
      #cgm-overlay .muted-eq .eq>i{animation:none;transform:scaleY(.25);}
      @media(max-width:1080px){
        #cgm-overlay .grid{grid-template-columns:1fr;}
        #cgm-overlay .stage-mid{flex-direction:column;align-items:center;}
        #cgm-overlay .stage-art{flex:0 0 auto;width:100%;max-width:340px;min-height:320px;}
        #cgm-overlay .menu{flex:0 0 auto;width:100%;max-width:440px;}
      }
      @media(prefers-reduced-motion:reduce){#cgm-overlay .eq>i{animation:none;transform:scaleY(.6);}}
    `;
    document.head.appendChild(style);

    // ── Hidden SVG icon defs (appended once to body) ─────────────────────────
    if (!document.getElementById('cgm-svgdefs')) {
      const svgns = 'http://www.w3.org/2000/svg';
      const defs = document.createElementNS(svgns, 'svg');
      defs.id = 'cgm-svgdefs';
      defs.setAttribute('aria-hidden','true');
      defs.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;';
      defs.innerHTML = `<defs>
        <g id="i-diamond" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20M12 3 8 9l4 12 4-12-3-6"/></g>
        <g id="i-heart" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M19 14c1.5-1.46 3-3.2 3-5.5A5.5 5.5 0 0 0 12 5.36 5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.04 3 5.5l7 7Z"/></g>
        <g id="i-gear" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 6.9 19.8l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 14a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.2 7.1L4.1 7a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 3.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1A2 2 0 1 1 19.9 7l-.1.1A1.7 1.7 0 0 0 21 10a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></g>
        <g id="i-bolt" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9z"/></g>
        <g id="i-shield" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></g>
        <g id="i-sword" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="m13 19 6-6M16 16l4 4M19 21l2-2"/></g>
        <g id="i-cpu" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/></g>
        <g id="i-activity" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></g>
        <g id="i-node" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 2 21 7v10l-9 5-9-5V7z"/><circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/></g>
        <g id="i-user" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></g>
        <g id="i-check" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></g>
        <g id="i-clock" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></g>
        <g id="i-music" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></g>
        <g id="i-chev" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></g>
        <g id="i-flame" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.07-2.14-.6-4 1-6 .14 1.9 1.1 3.7 2.5 5 1.3 1.2 2.5 2.6 2.5 4.5a5 5 0 1 1-10 0c0-.8.3-1.6.8-2.2a2.5 2.5 0 0 0 1.2 2.2Z"/></g>
        <g id="i-star" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="m12 2 2.9 6.3 6.6.6-5 4.4 1.5 6.6L12 17l-5.9 3.5L7.5 13.9l-5-4.4 6.6-.6z"/></g>
        <g id="i-zapplus" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4 13h7l-1 9 9-12h-7z"/></g>
      </defs>`;
      document.body.appendChild(defs);
    }

    // ── Build menu items HTML (ENDLESS MODE shown only if unlocked) ──────────
    const _buildMenuItemsHTML = (items, activeIdx) => items.map((label, i) =>
      `<button class="mbtn${i === activeIdx ? ' active' : ''}" data-cgm-item="${label}">` +
      `<svg><use href="#i-chev"/></svg>${label}</button>`
    ).join('');

    // ── Create the overlay div ────────────────────────────────────────────────
    const el = document.createElement('div');
    el.id = 'cgm-overlay';
    el.style.display = 'none';
    el.innerHTML = `
<main class="stage">
  <span class="corner tl"></span><span class="corner tr"></span>
  <span class="corner bl"></span><span class="corner br"></span>

  <!-- TOP BAR -->
  <div class="topbar">
    <span class="chip cyan"><svg><use href="#i-diamond"/></svg><b data-cgm="credits-chip">0</b></span>
    <span class="chip pink"><svg><use href="#i-heart"/></svg><b data-cgm="pf-chip">0</b></span>
    <button class="icon-btn" data-cgm-action="settings" aria-label="Settings"><svg><use href="#i-gear"/></svg></button>
  </div>

  <!-- MAIN GRID -->
  <div class="grid">
    <!-- LEFT COLUMN -->
    <div class="col">
      <section class="panel" style="--accent:var(--cyan);--accent-glow:rgba(46,230,246,.5)">
        <div class="panel-title"><span class="dot"></span>PROGRESSION</div>
        <div class="player" data-cgm="player-name">PLAYER_01</div>
        <div class="rank" data-cgm="player-rank">LEVEL 1 · ROOKIE</div>
        <div class="bar"><i data-cgm="xp-bar" style="width:0%"></i></div>
        <div class="row"><span class="k">Credits</span><span class="v cyan"><svg><use href="#i-diamond"/></svg><span data-cgm="credits-row">0</span></span></div>
        <div class="row"><span class="k">PF Avail</span><span class="v mag"><svg><use href="#i-heart"/></svg><span data-cgm="pf-avail">0</span></span></div>
        <div class="row"><span class="k">Next Lv</span><span class="v green"><span data-cgm="player-progress">1 / 5 TO NEXT LEVEL</span></span></div>
        <div class="row"><span class="k">Best</span><span class="v cyan"><svg><use href="#i-clock"/></svg><span data-cgm="best-time">—</span></span></div>
      </section>

      <section class="panel" style="--accent:var(--amber);--accent-glow:rgba(251,191,36,.5)">
        <div class="panel-title" style="color:var(--amber)"><span class="dot" style="background:var(--amber)"></span>EQUIPMENT</div>
        <div class="equip-name"><svg><use href="#i-cpu"/></svg><span data-cgm="equip-name">—</span></div>
        <div class="row"><span class="k">Class</span><span class="v amber"><svg><use href="#i-shield"/></svg><span data-cgm="equip-class">—</span></span></div>
        <div class="row"><span class="k">Element</span><span class="v amber"><svg><use href="#i-bolt"/></svg><span data-cgm="equip-element">—</span></span></div>
        <div class="row"><span class="k">Weapon</span><span class="v amber"><svg><use href="#i-sword"/></svg><span data-cgm="equip-weapon">—</span></span></div>
      </section>

      <section class="panel" style="--accent:var(--green);--accent-glow:rgba(52,211,153,.5)">
        <div class="panel-title" style="color:var(--green)"><span class="dot" style="background:var(--green)"></span>QUICK STATS</div>
        <div class="row"><span class="k">Element</span><span class="v amber"><svg><use href="#i-bolt"/></svg><span data-cgm="qs-element">—</span></span></div>
        <div class="row"><span class="k">Class</span><span class="v green"><span data-cgm="qs-class">—</span></span></div>
        <div class="row"><span class="k">Revives</span><span class="v amber"><svg><use href="#i-activity"/></svg><span data-cgm="qs-revives">3</span></span></div>
        <div class="row"><span class="k">Protocols</span><span class="v" style="color:var(--purple)"><svg style="color:var(--purple)"><use href="#i-node"/></svg><span data-cgm="qs-protocols">0</span></span></div>
        <div class="row"><span class="k">HP / Mana</span><span class="v" style="color:var(--txt-dim)"><span data-cgm="qs-hp-mana">—</span></span></div>
      </section>
    </div>

    <!-- CENTER STAGE -->
    <div class="col center">
      <div class="title"><div class="l1">PHENIX</div><div class="l2">NULL EDEN</div><div class="l3">A cyber-survival roguelite</div></div>

      <div class="stage-mid">
        <div class="stage-art">
          <span class="art-corner a"></span><span class="art-corner b"></span>
          <span class="art-corner c"></span><span class="art-corner d"></span>
          <img src="assets/ui/cyber-grid-menu.png" alt="Character art">
        </div>
        <nav class="menu" id="cgm-menu-nav">
          <!-- populated by _syncMenuOverlayItems() -->
        </nav>
      </div>

      <div class="profile">
        <div class="pcell"><div class="pk">Profile</div><div class="pv"><svg style="color:var(--cyan)"><use href="#i-user"/></svg><span data-cgm="profile-name">PLAYER_01</span></div></div>
        <div class="pcell"><div class="pk">Best Run</div><div class="pv green"><span data-cgm="profile-best">—</span></div></div>
        <div class="pcell"><div class="pk">Build</div><div class="pv"><svg class="amber" style="color:var(--amber)"><use href="#i-bolt"/></svg><svg class="cyan" style="color:var(--cyan)"><use href="#i-node"/></svg><span data-cgm="profile-build">0</span></div></div>
      </div>
    </div>

    <!-- RIGHT COLUMN -->
    <div class="col">
      <section class="panel" style="--accent:var(--cyan)">
        <div class="panel-title"><span class="dot"></span>SYSTEM FEED</div>
        <div class="eden-portrait-header">
          <div class="eden-portrait-frame">
            <img id="cgm-eden-portrait-img" src="assets/ui/eden_core_portrait.png?v=20260628400000" alt="EDEN CORE"
              onerror="this.style.display='none';var f=document.getElementById('cgm-eden-fallback-icon');if(f)f.style.display='flex';">
            <div class="eden-fallback-icon" id="cgm-eden-fallback-icon">◈</div>
          </div>
          <div class="eden-portrait-info">
            <div class="eden-pname">EDEN CORE</div>
            <div class="eden-psub">THE SYSTEM · ONLINE</div>
          </div>
        </div>
        <div id="cgm-feed-list">
          <div class="feed-item soon"><svg><use href="#i-clock"/></svg>Loading…</div>
        </div>
      </section>

      <section class="panel" style="--accent:var(--purple);--accent-glow:rgba(168,85,247,.5)">
        <div class="panel-title" style="color:var(--purple)"><span class="dot" style="background:var(--purple)"></span>ACTIVE PROTOCOLS</div>
        <div class="unlocked">UNLOCKED <b data-cgm="proto-count">0</b> / <span data-cgm="proto-total">0</span></div>
        <div id="cgm-proto-list"></div>
      </section>

      <section class="panel" style="--accent:var(--cyan)">
        <div class="now-row"><span class="label">NOW PLAYING</span><svg><use href="#i-music"/></svg></div>
        <div class="now-row" style="margin-top:6px"><span style="font-size:12px;color:var(--txt-dim);letter-spacing:1px" data-cgm="now-playing">NULL EDEN OST</span></div>
        <div class="eq" id="cgm-eq-bars"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
      </section>

      <section class="panel" style="--accent:var(--cyan)">
        <div class="panel-title"><span class="dot"></span>BUILD</div>
        <div class="row"><span class="k">Build</span><span class="v cyan"><span data-cgm="build-class">—</span></span></div>
        <div class="row"><span class="k">Element</span><span class="v amber"><svg><use href="#i-bolt"/></svg><span data-cgm="build-element">—</span></span></div>
        <div class="row"><span class="k">Weapon</span><span class="v cyan"><svg><use href="#i-sword"/></svg><span data-cgm="build-weapon">—</span></span></div>
        <div class="input-note">INPUT: Enter / ESC · Controller (Xbox · PS · PC)</div>
      </section>
    </div>
  </div>

  <!-- FOOTER -->
  <div class="footer">
    <span class="age">12+</span>
    <div class="hints"><span><b>↑↓</b> Navigate</span><span><b>ENTER</b> / Click Select</span><span><b>ESC</b> Back</span></div>
  </div>
</main>`;
    document.body.appendChild(el);
    this._menuOverlayEl = el;

    // ── character art: reveal when image loads ───────────────────────────────
    const slot = el.querySelector('.stage-art');
    const img  = slot && slot.querySelector('img');
    if (img) {
      const show = () => slot.classList.add('has-art');
      img.addEventListener('load', show);
      if (img.complete && img.naturalWidth) show();
    }

    // ── Settings gear button ─────────────────────────────────────────────────
    const gearBtn = el.querySelector('[data-cgm-action="settings"]');
    if (gearBtn) gearBtn.addEventListener('click', () => this.goToSettings());
  }

  // Rebuild the nav buttons to match current menuItems (Endless may appear/disappear).
  _syncMenuOverlayItems() {
    const nav = this._menuOverlayEl && this._menuOverlayEl.querySelector('#cgm-menu-nav');
    if (!nav) return;
    const items = this.menuItems;
    nav.innerHTML = items.map((label, i) =>
      `<button class="mbtn${i === this.menuIndex ? ' active' : ''}" data-cgm-item="${label}">` +
      `<svg><use href="#i-chev"/></svg>${label}</button>`
    ).join('');
    // Attach click listeners
    nav.querySelectorAll('.mbtn').forEach((btn, i) => {
      btn.addEventListener('click', () => {
        this.menuIndex = i;
        this._syncMenuOverlayActive();
        this._selectMenuItem(items[i]);
      });
    });
  }

  // Only update the .active class without rebuilding DOM (called on keyboard nav).
  _syncMenuOverlayActive() {
    const nav = this._menuOverlayEl && this._menuOverlayEl.querySelector('#cgm-menu-nav');
    if (!nav) return;
    nav.querySelectorAll('.mbtn').forEach((btn, i) => btn.classList.toggle('active', i === this.menuIndex));
    const active = nav.querySelectorAll('.mbtn')[this.menuIndex];
    if (active) active.focus({ preventScroll: true });
  }

  // Set a single data-cgm element's text content.
  _cgmSet(key, value) {
    const el = this._menuOverlayEl && this._menuOverlayEl.querySelector(`[data-cgm="${key}"]`);
    if (el) el.textContent = String(value ?? '—');
  }

  // Refresh all live data in the overlay. Called once per _showMenuOverlay().
  _refreshMenuOverlay() {
    const m   = this.meta;
    const ch  = this._menuSelectedChar();
    const el  = CHARACTER_ELEMENT[ch.id];
    const elIcon = ELEMENT_ICON[el] || '◆';
    const owned  = (m && m.protocolCards) ? Object.keys(m.protocolCards).filter(k => m.protocolCards[k]) : [];
    const progression = m && m.getPlayerProgression ? m.getPlayerProgression() : { level: 1, rank: 'ROOKIE', progress: 0, label: '1 / 5 TO NEXT LEVEL' };
    const pfAvail  = m ? m.getProtocolFragments()        : 0;
    const credits  = m ? m.credits                       : 0;
    const best     = (m && m.endlessRecords) || { time: 0 };
    const bestStr  = best.time > 0 ? this._fmtClock(best.time) : '—';
    const name     = (m && m.getProfileName && m.getProfileName()) || 'PLAYER_01';
    const revives  = 3 + (this._hasProto('phoenix_revival') ? 1 : 0);
    const weapon   = this._charWeaponLabel(ch.id);
    const elStr    = (el ? el.toUpperCase() : '—');
    const muted    = !!(this.audio && this.audio.muted);

    // Top bar chips
    this._cgmSet('credits-chip', credits);
    this._cgmSet('pf-chip', pfAvail);

    // Progression panel
    this._cgmSet('player-name', name);
    this._cgmSet('player-rank', `LEVEL ${progression.level} · ${progression.rank}`);
    const barEl = this._menuOverlayEl.querySelector('[data-cgm="xp-bar"]');
    if (barEl) barEl.style.width = Math.round(progression.progress * 100) + '%';
    this._cgmSet('credits-row', credits);
    this._cgmSet('pf-avail', pfAvail);
    this._cgmSet('player-progress', progression.label);
    this._cgmSet('best-time', bestStr);

    // Equipment panel
    const shortName = ch.name.length > 22 ? ch.name.slice(0, 21) + '…' : ch.name;
    this._cgmSet('equip-name', shortName);
    this._cgmSet('equip-class', ch.role);
    this._cgmSet('equip-element', elIcon + ' ' + elStr);
    this._cgmSet('equip-weapon', weapon);

    // Quick Stats panel
    this._cgmSet('qs-element', elIcon + ' ' + elStr);
    this._cgmSet('qs-class', ch.role.split(' ')[0]);
    this._cgmSet('qs-revives', revives);
    this._cgmSet('qs-protocols', owned.length);
    const _qsMap = { skeleton_warrior:130, taekwondo_girl:90, cyber_arm_hero:100, brawler_warrior:125, assassin_clone:88, japan_phasewalker:100, euclid_vector:100, oni_cataclysm_protocol:100 };
    this._cgmSet('qs-hp-mana', (_qsMap[ch.id] || 100) + ' / 100');

    // System Feed — Eden Core messages + Eden Memory %
    const feedEl = this._menuOverlayEl.querySelector('#cgm-feed-list');
    if (feedEl) {
      let html = '';
      const edenMem = m ? m.getEdenMemory() : 0;
      const feedMsgs = m ? m.getSystemFeed() : [];
      // Eden Memory header
      html += `<div class="feed-item done"><svg><use href="#i-bolt"/></svg>EDEN MEMORY: ${edenMem}%</div>`;
      if (feedMsgs.length > 0) {
        for (const entry of feedMsgs.slice(0, 4)) {
          const txt = typeof entry === 'string' ? entry : entry.text || '';
          html += `<div class="feed-item soon"><svg><use href="#i-clock"/></svg>${txt.slice(0, 40)}</div>`;
        }
      } else {
        html += `<div class="feed-item soon"><svg><use href="#i-clock"/></svg>THE SYSTEM IS WATCHING.</div>`;
        html += `<div class="feed-item soon"><svg><use href="#i-clock"/></svg>Play to populate the archive.</div>`;
      }
      feedEl.innerHTML = html;
    }

    // Active Protocols
    this._cgmSet('proto-count', owned.length);
    this._cgmSet('proto-total', PROTOCOL_CARDS.length);
    const protoEl = this._menuOverlayEl.querySelector('#cgm-proto-list');
    if (protoEl) {
      if (owned.length === 0) {
        protoEl.innerHTML = `<div class="proto" style="color:var(--txt-faint)">No active protocols — visit UPGRADES</div>`;
      } else {
        protoEl.innerHTML = owned.slice(0, 5).map(id => {
          const card = PROTOCOL_CARDS.find(c => c.id === id);
          const iconId = id === 'phoenix_revival' ? 'i-flame' : id.includes('lightning') ? 'i-bolt' : id.includes('ult') ? 'i-star' : 'i-zapplus';
          return `<div class="proto"><svg><use href="#${iconId}"/></svg>${(card ? card.name : id).slice(0, 28)}</div>`;
        }).join('') + (owned.length > 5 ? `<div class="proto" style="color:var(--txt-faint)">+${owned.length - 5} more…</div>` : '');
      }
    }

    // Now Playing
    const audioTitle = this.audio?.currentTrackTitle || 'NULL EDEN OST';
    const nowStr = muted ? 'MUTED' : audioTitle;
    this._cgmSet('now-playing', nowStr);
    const eqEl = this._menuOverlayEl.querySelector('#cgm-eq-bars');
    if (eqEl) eqEl.classList.toggle('muted-eq', muted);

    // Build panel
    this._cgmSet('build-class', ch.role);
    this._cgmSet('build-element', elIcon + ' ' + elStr);
    this._cgmSet('build-weapon', weapon);

    // Bottom profile bar
    const shortProfile = name.length > 10 ? name.slice(0, 9) + '…' : name;
    this._cgmSet('profile-name', shortProfile);
    this._cgmSet('profile-best', bestStr);
    this._cgmSet('profile-build', elIcon + ' ◈' + owned.length);
  }

  _showMenuOverlay() {
    if (!this._menuOverlayEl) return;
    this._syncMenuOverlayItems();   // rebuild nav (Endless unlock may have changed)
    this._refreshMenuOverlay();     // push live data
    this._menuOverlayEl.style.display = 'flex';
    this._menuOverlayVisible = true;
    this._startEqLoop();
  }

  _hideMenuOverlay() {
    if (!this._menuOverlayEl) return;
    this._stopEqLoop();
    this._menuOverlayEl.style.display = 'none';
    this._menuOverlayVisible = false;
  }

  // Equalizer rAF loop: runs ONLY while menu overlay is visible
  _startEqLoop() {
    if (this._eqRafId != null) return;
    const eqEl = this._menuOverlayEl?.querySelector('#cgm-eq-bars');
    if (!eqEl) return;
    const bars = eqEl.querySelectorAll('i');
    if (!bars.length) return;
    const analyser = this.audio?.analyser;
    const data     = this.audio?.analyserData;
    const n        = bars.length;
    const loop = () => {
      if (!this._menuOverlayVisible) { this._eqRafId = null; eqEl.classList.remove('live'); return; }
      this._eqRafId = requestAnimationFrame(loop);
      if (!analyser || !data) return;
      analyser.getByteFrequencyData(data);
      const hasSignal = data.some(v => v > 4);
      eqEl.classList.toggle('live', hasSignal);
      if (!hasSignal) return;
      const step = Math.max(1, Math.floor(data.length / n));
      for (let i = 0; i < n; i++) {
        const v = data[Math.min(i * step, data.length - 1)] / 255;
        bars[i].style.transform = 'scaleY(' + Math.max(0.08, v).toFixed(3) + ')';
      }
    };
    this._eqRafId = requestAnimationFrame(loop);
  }

  _stopEqLoop() {
    if (this._eqRafId != null) { cancelAnimationFrame(this._eqRafId); this._eqRafId = null; }
    this._menuOverlayEl?.querySelector('#cgm-eq-bars')?.classList.remove('live');
  }

  _drawStartMenu(ctx) {
    // Background — use the new clean background image, fall back to city bg
    const bg = this._menuBg;
    if (bg && bg.complete && bg.naturalWidth > 0) {
      ctx.drawImage(bg, 0, 0, WIDTH, HEIGHT);
    } else {
      // Until the menu art loads, paint a plain dark backdrop — NOT _drawBackground(), which
      // renders the city/grid world and reads as an Act 1 "map flash" on the first frame.
      const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
      g.addColorStop(0, '#05080f'); g.addColorStop(1, '#02040a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }

    // Light tint only — the background already carries the PHENIX: NULL EDEN logo, so we
    // keep it readable without washing the art out. (No "PHENIX SURVIVORS" text — title is the logo.)
    ctx.fillStyle = 'rgba(2,6,14,0.32)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // ── Character cut-out (code-positioned layer over the theme's character zone) ──
    const ci = this._menuChars;
    if (ci && ci.complete && ci.naturalWidth > 0) {
      const dh = HEIGHT * 0.74;
      const dw = dh * (ci.naturalWidth / ci.naturalHeight);
      const cxC = WIDTH * 0.275, baseY = HEIGHT * 0.88;   // standing baseline, left-of-centre
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(ci, Math.round(cxC - dw / 2), Math.round(baseY - dh), Math.round(dw), Math.round(dh));
      ctx.restore();
    }

    // ── Top-right resource strip (real Grid Credits + spendable PF) ──
    this._drawTopResources(ctx);

    // ── Dashboard values placed INSIDE the baked theme boxes (no new opaque panels) ──
    this._drawMenuDashboard(ctx);

    // ── Menu labels inside the baked central button-stack slots. Only a subtle selection glow is
    // drawn inside the slot — the slot plate itself is part of the theme art. Rects centralised in
    // _menuButtonRect (mirrored by main.js click hit-test). ──
    for (let i = 0; i < this.menuItems.length; i++) {
      const _mi = this.menuItems[i];
      if (_mi === 'CHAOS MODE') {
        const _cu = this.meta?.isEndlessUnlocked();
        this._drawSlotLabel(ctx, this._menuButtonRect(i),
          _cu ? '⚡ CHAOS MODE' : 'CHAOS MODE 🔒',
          i === this.menuIndex,
          _cu ? '#ff2d95' : '#4a4a5a');
      } else {
        this._drawSlotLabel(ctx, this._menuButtonRect(i), _mi, i === this.menuIndex, CYAN);
      }
    }
    ctx.textAlign = 'left';

    // ── Footer — nav hint (centre) + WIP label; 12+ badge in its baked corner box; controller help
    // lives in its right-bottom panel (drawn in the dashboard), so no duplicate badge here. ──
    ctx.font      = '13px Consolas, monospace';
    ctx.fillStyle = 'rgba(200,210,225,0.6)';
    ctx.textAlign = 'center';
    ctx.fillText('↑↓ Navigate    ENTER / Click Select    ESC Back', WIDTH / 2, HEIGHT - 14);
    this._drawAgeBadge(ctx, WIDTH * 0.018, HEIGHT * 0.918);
    ctx.textAlign = 'left';

    // Gear shortcut (top-right corner) → same SETTINGS screen; click handled in main.js.
    this._drawMenuGear(ctx);
    ctx.textAlign = 'left';

    // Announcements (e.g. REACH ENDLESS FIRST feedback) rendered last so they appear on top.
    this._drawAnnouncement(ctx);
  }

  // ─── SETTINGS DOM overlay ────────────────────────────────────────────────────
  //  _initSettingsOverlay()       — create once (constructor); injects CSS + HTML
  //  _showSettingsOverlay()       — make visible, sync active button
  //  _hideSettingsOverlay()       — hide; called by every exit from settings
  //  _syncSettingsOverlayActive() — update only the .active .cgs-mbtn
  //
  _initSettingsOverlay() {
    if (this._settingsOverlayEl) return;   // idempotent

    // ── Scoped CSS ───────────────────────────────────────────────────────────
    if (!document.getElementById('cgm-settings-style')) {
      const style = document.createElement('style');
      style.id = 'cgm-settings-style';
      style.textContent = `
        #cgm-settings {
          position:fixed; inset:0; z-index:110; display:none;
          align-items:center; justify-content:center;
          font-family:'Share Tech Mono',ui-monospace,monospace;
          color:#cfe9ff;
          background:
            radial-gradient(1200px 700px at 50% -10%,rgba(168,85,247,.18),transparent 60%),
            radial-gradient(900px 600px at 12% 30%,rgba(46,230,246,.10),transparent 60%),
            radial-gradient(900px 600px at 88% 70%,rgba(255,45,149,.10),transparent 60%),
            linear-gradient(180deg,#0b1030,#070a1c);
          --bg-0:#070a1c; --bg-1:#0b1030;
          --panel:rgba(10,16,46,.62); --panel-edge:rgba(46,230,246,.10);
          --cyan:#2ee6f6; --cyan-dim:#1aa9bd; --magenta:#ff2d95; --purple:#a855f7; --amber:#fbbf24; --green:#34d399;
          --txt:#cfe9ff; --txt-dim:#6f86b8; --txt-faint:#46588a;
          --glow-cyan:0 0 8px rgba(46,230,246,.55),0 0 22px rgba(46,230,246,.22);
          --radius:14px;
        }
        #cgm-settings::before {
          content:""; position:fixed; inset:0; pointer-events:none; z-index:0;
          background-image:
            linear-gradient(rgba(46,230,246,.05) 1px,transparent 1px),
            linear-gradient(90deg,rgba(46,230,246,.05) 1px,transparent 1px);
          background-size:46px 46px;
          mask-image:radial-gradient(circle at 50% 40%,#000 0%,transparent 78%);
        }
        #cgm-settings::after {
          content:""; position:fixed; inset:0; pointer-events:none; z-index:9999;
          background:repeating-linear-gradient(0deg,rgba(0,0,0,.10) 0 2px,transparent 2px 4px);
          opacity:.35; mix-blend-mode:overlay;
        }
        #cgm-settings * { box-sizing:border-box; margin:0; padding:0; }
        #cgm-settings .cgs-stage {
          position:relative; z-index:1;
          width:100%; max-width:460px;
          border:1px solid var(--panel-edge); border-radius:20px;
          padding:36px 40px 30px;
          background:linear-gradient(180deg,rgba(168,85,247,.05),transparent 30%),rgba(7,10,28,.82);
          box-shadow:inset 0 0 60px rgba(46,230,246,.05),0 30px 80px rgba(0,0,0,.55);
          display:flex; flex-direction:column; align-items:center; gap:24px;
        }
        #cgm-settings .corner { position:absolute;width:34px;height:34px;border:2px solid var(--cyan);opacity:.8;filter:drop-shadow(var(--glow-cyan)); }
        #cgm-settings .corner.tl{top:-2px;left:-2px;border-right:0;border-bottom:0;border-radius:18px 0 0 0;}
        #cgm-settings .corner.tr{top:-2px;right:-2px;border-left:0;border-bottom:0;border-radius:0 18px 0 0;}
        #cgm-settings .corner.bl{bottom:-2px;left:-2px;border-right:0;border-top:0;border-radius:0 0 0 18px;}
        #cgm-settings .corner.br{bottom:-2px;right:-2px;border-left:0;border-top:0;border-radius:0 0 18px 0;}
        #cgm-settings .cgs-header {
          display:flex; align-items:center; gap:12px;
          font-family:'Orbitron',sans-serif; font-weight:800; font-size:13px;
          letter-spacing:3px; color:var(--cyan); text-shadow:var(--glow-cyan);
        }
        #cgm-settings .cgs-header svg { width:22px; height:22px; color:var(--cyan); filter:drop-shadow(var(--glow-cyan)); }
        #cgm-settings .cgs-sep { width:100%; height:1px; background:linear-gradient(90deg,transparent,var(--cyan),transparent); opacity:.4; }
        #cgm-settings .cgs-menu { width:100%; display:flex; flex-direction:column; gap:11px; }
        #cgm-settings .cgs-mbtn {
          position:relative; width:100%; cursor:pointer;
          display:flex; align-items:center; justify-content:center; gap:12px;
          padding:15px 20px; border-radius:12px;
          border:1px solid rgba(46,230,246,.28);
          background:linear-gradient(180deg,rgba(46,230,246,.05),rgba(10,16,46,.35));
          color:var(--txt); font-family:'Orbitron',sans-serif; font-weight:700;
          font-size:13px; letter-spacing:2.5px; text-transform:uppercase;
          transition:.16s ease; outline:none;
        }
        #cgm-settings .cgs-mbtn svg { width:17px; height:17px; opacity:0; transform:translateX(-6px); transition:.16s; color:var(--cyan); flex:none; }
        #cgm-settings .cgs-mbtn:hover,
        #cgm-settings .cgs-mbtn.active {
          color:#fff; border-color:var(--cyan);
          background:linear-gradient(180deg,rgba(46,230,246,.16),rgba(46,230,246,.04));
          box-shadow:var(--glow-cyan),inset 0 0 18px rgba(46,230,246,.12);
        }
        #cgm-settings .cgs-mbtn:hover svg,
        #cgm-settings .cgs-mbtn.active svg { opacity:1; transform:translateX(0); }
        #cgm-settings .cgs-mbtn.active::before {
          content:""; position:absolute; left:0; top:14%; bottom:14%;
          width:4px; background:var(--cyan); border-radius:4px; box-shadow:var(--glow-cyan);
        }
        #cgm-settings .cgs-mbtn.back-btn {
          border-color:rgba(111,134,184,.22); color:var(--txt-dim);
          font-size:12px; letter-spacing:2px; padding:12px 20px;
          background:rgba(10,16,46,.25);
        }
        #cgm-settings .cgs-mbtn.back-btn:hover,
        #cgm-settings .cgs-mbtn.back-btn.active {
          border-color:var(--txt-dim); color:#fff;
          background:rgba(111,134,184,.08); box-shadow:none;
        }
        #cgm-settings .cgs-mbtn.back-btn.active::before { background:var(--txt-dim); box-shadow:none; }
        #cgm-settings .cgs-hints {
          color:var(--txt-faint); font-size:12px; letter-spacing:1px;
          display:flex; gap:18px; flex-wrap:wrap; justify-content:center;
        }
        #cgm-settings .cgs-hints b { color:var(--cyan); font-weight:400; }
      `;
      document.head.appendChild(style);
    }

    // ── Build DOM ─────────────────────────────────────────────────────────────
    const el = document.createElement('div');
    el.id = 'cgm-settings';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Configuration');

    el.innerHTML = `
      <div class="cgs-stage">
        <span class="corner tl"></span><span class="corner tr"></span>
        <span class="corner bl"></span><span class="corner br"></span>

        <div class="cgs-header">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><use href="#i-gear"/></svg>
          CONFIGURATION
        </div>
        <div class="cgs-sep"></div>

        <div class="cgs-menu">
          <button class="cgs-mbtn" data-idx="0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><use href="#i-music"/></svg>
            AUDIO
          </button>
          <button class="cgs-mbtn" data-idx="1">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><use href="#i-bolt"/></svg>
            CONTROLS / HOW TO PLAY
          </button>
          <button class="cgs-mbtn" data-idx="2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><use href="#i-star"/></svg>
            CREDITS
          </button>
          <button class="cgs-mbtn" data-idx="3">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><use href="#i-node"/></svg>
            LORE / ARCHIVE
          </button>
          <div class="cgs-sep" style="margin:4px 0;"></div>
          <button class="cgs-mbtn back-btn" data-idx="4">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><use href="#i-chev"/></svg>
            BACK
          </button>
        </div>

        <div class="cgs-hints">
          <span><b>\u2191\u2193</b>\u00a0Navigate</span>
          <span><b>ENTER</b>\u00a0Select</span>
          <span><b>ESC</b>\u00a0Back</span>
        </div>
      </div>
    `;

    // ── Click handlers ────────────────────────────────────────────────────────
    el.querySelectorAll('.cgs-mbtn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        this._settingsIndex = idx;
        this._selectSettingsItem(this.settingsItems[idx]);
      });
    });

    document.body.appendChild(el);
    this._settingsOverlayEl = el;
  }

  _showSettingsOverlay() {
    if (!this._settingsOverlayEl) return;
    this._settingsOverlayEl.style.display = 'flex';
    this._settingsOverlayVisible = true;
    this._syncSettingsOverlayActive();
  }

  _hideSettingsOverlay() {
    if (!this._settingsOverlayEl) return;
    this._settingsOverlayEl.style.display = 'none';
    this._settingsOverlayVisible = false;
  }

  _syncSettingsOverlayActive() {
    if (!this._settingsOverlayEl) return;
    this._settingsOverlayEl.querySelectorAll('.cgs-mbtn').forEach((btn, i) =>
      btn.classList.toggle('active', i === this._settingsIndex)
    );
  }

  // ─── SETTINGS overlay — clean, keeps the theme/logo/protagonists visible ─────
  // Renders the live main-menu background + a LIGHT glass dim, then the settings options inside the
  // same baked central button slots. No giant title block, no near-black wash.
  _drawSettings(ctx) {
    if (this._settingsOverlayVisible) return;   // DOM overlay takes over
    const bg = this._menuBg;
    if (bg && bg.complete && bg.naturalWidth > 0) ctx.drawImage(bg, 0, 0, WIDTH, HEIGHT);
    else { const g = ctx.createLinearGradient(0, 0, 0, HEIGHT); g.addColorStop(0, '#05080f'); g.addColorStop(1, '#02040a'); ctx.fillStyle = g; ctx.fillRect(0, 0, WIDTH, HEIGHT); }
    ctx.fillStyle = 'rgba(3,7,15,0.30)'; ctx.fillRect(0, 0, WIDTH, HEIGHT);   // light glass only — theme stays visible

    // Keep the resource strip + gear visible for continuity.
    this._drawTopResources(ctx);
    this._drawMenuGear(ctx);

    // Small label above the central slots (no logo-covering title).
    const r0 = this._menuButtonRect(0);
    ctx.font = 'bold 13px Consolas, monospace'; ctx.fillStyle = '#7df9ff'; ctx.textAlign = 'center';
    ctx.fillText('— CONFIGURATION —', WIDTH / 2, r0.y - 12);

    const items = this.settingsItems;
    for (let i = 0; i < items.length; i++) {
      const accent = items[i] === 'BACK' ? '#9aa4b0' : CYAN;
      this._drawSlotLabel(ctx, this._menuButtonRect(i), items[i], i === this._settingsIndex, accent);
    }

    ctx.font = '13px Consolas, monospace'; ctx.fillStyle = 'rgba(200,210,225,0.6)'; ctx.textAlign = 'center';
    ctx.fillText('↑↓ Navigate    ENTER / Click Select    ESC Back', WIDTH / 2, HEIGHT - 14);
    this._drawAgeBadge(ctx, WIDTH * 0.018, HEIGHT * 0.918);
    ctx.textAlign = 'left';
  }

  // ── Wave announcement system ──────────────────────────────────────────────

  // Boss/miniboss center-screen warning. In Endless, collapse repeats so a boss loop warns
  // once (not once per boss/respawn in the loop); Act 1 keeps its original per-boss warning.
  _bossAnnounce(text, color) {
    if (this.endless) {
      if (this._bossWarnCd > 0) return;
      this._bossWarnCd = BOSS_WARN_COOLDOWN;
    }
    this.triggerAnnouncement(text, color);
  }

  // Endless boss/miniboss alert (warning sound + center text), throttled to once per loop window.
  // Only called from Endless-gated paths (boss rotation), so no endless guard is needed here.
  _endlessBossAlert(text, color) {
    if (this._bossWarnCd > 0) return;
    this._bossWarnCd = BOSS_WARN_COOLDOWN;
    this.audio?.playBossWarning();
    this.triggerAnnouncement(text, color);
  }

  triggerAnnouncement(text, color) {
    this.announcement = { text, color, phase: 'fadein', timer: 0 };
    const WAVE_EVENTS = ['DRONE SWARM', 'CORE RAIDERS', 'SECURITY MECH', 'OVERLOAD SURGE', 'HUNTER SQUAD'];
    if (WAVE_EVENTS.some(w => text.includes(w))) {
      this.score = (this.score ?? 0) + 100;
    }
  }

  _updateAnnouncement(dt) {
    const a = this.announcement;
    if (!a) return;
    const FADE_IN = 0.35, HOLD = 1.9, FADE_OUT = 0.55;
    a.timer += dt;
    if (a.phase === 'fadein'  && a.timer >= FADE_IN)  { a.phase = 'hold';    a.timer = 0; }
    if (a.phase === 'hold'    && a.timer >= HOLD)     { a.phase = 'fadeout'; a.timer = 0; }
    if (a.phase === 'fadeout' && a.timer >= FADE_OUT) { this.announcement = null; }
  }

  _drawAnnouncement(ctx) {
    const a = this.announcement;
    if (!a) return;
    const FADE_IN = 0.35, HOLD = 1.9, FADE_OUT = 0.55;
    let alpha = 1;
    if (a.phase === 'fadein')  alpha = a.timer / FADE_IN;
    if (a.phase === 'fadeout') alpha = 1 - (a.timer / FADE_OUT);
    alpha = Math.max(0, Math.min(1, alpha));

    const panelW = Math.min(820, WIDTH - 60);
    const panelH = 76;
    const panelX = Math.round(WIDTH  / 2 - panelW / 2);
    const panelY = Math.round(HEIGHT / 2 - 100);

    ctx.save();
    ctx.globalAlpha = alpha;

    // Dark backing panel
    ctx.fillStyle = 'rgba(0,0,12,0.84)';
    ctx.fillRect(panelX, panelY, panelW, panelH);

    // Colored border top + bottom
    ctx.strokeStyle = a.color;
    ctx.lineWidth   = 2;
    ctx.strokeRect(panelX, panelY, panelW, panelH);

    // Subtle inner glow line at top
    ctx.strokeStyle = a.color;
    ctx.lineWidth   = 1;
    ctx.globalAlpha = alpha * 0.35;
    ctx.beginPath();
    ctx.moveTo(panelX + 4, panelY + 4);
    ctx.lineTo(panelX + panelW - 4, panelY + 4);
    ctx.stroke();
    ctx.globalAlpha = alpha;

    // Event text
    ctx.font      = 'bold 30px Consolas, monospace';
    ctx.fillStyle = a.color;
    ctx.textAlign = 'center';
    ctx.fillText(a.text, WIDTH / 2, panelY + 47);

    ctx.restore();
  }

  // ─────────────────────────────────────────────────────────────────────────

  // Secret-skin roster (flag key → display name). Single source of truth shared by
  // the Victory screen and Character Select so the two never drift.
  _secretSkins() {
    return [
      { key: 'golden_skeleton_warrior', name: 'Cyber Skeleton Warrior' },
      { key: 'dark_cyber_arm_hero',     name: 'Neon Cyber Arm Hero'    },
      { key: 'grandmaster_dojang_girl', name: 'Grandmaster Dojang Girl' },
    ];
  }

  // Framed skin thumbnail. Unlocked → bright preview + neon frame; locked → darkened
  // silhouette + padlock. Missing image degrades to a '?' placeholder (never crashes).
  _drawSkinThumb(ctx, key, cx, topY, w, h, unlocked) {
    const x   = Math.round(cx - w / 2);
    const img = this._skinImages[key];

    ctx.fillStyle = unlocked ? 'rgba(12,24,40,0.92)' : 'rgba(6,10,18,0.92)';
    ctx.beginPath(); ctx.roundRect(x, topY, w, h, 6); ctx.fill();

    if (img && img.complete && img.naturalWidth > 0) {
      const pad = 6, aw = w - pad * 2, ah = h - pad * 2;
      const s   = Math.min(aw / img.naturalWidth, ah / img.naturalHeight);
      const dw  = Math.round(img.naturalWidth * s);
      const dh  = Math.round(img.naturalHeight * s);
      const dx  = Math.round(cx - dw / 2);
      const dy  = Math.round(topY + (h - dh) / 2);
      ctx.drawImage(img, dx, dy, dw, dh);
      if (!unlocked) {
        ctx.fillStyle = 'rgba(0,0,0,0.74)';
        ctx.beginPath(); ctx.roundRect(x, topY, w, h, 6); ctx.fill();
      }
    } else {
      ctx.fillStyle = unlocked ? PURPLE : '#33414f';
      ctx.font = 'bold 46px Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('?', cx, topY + h / 2 + 16);
    }

    ctx.lineWidth   = 2;
    ctx.strokeStyle = unlocked ? PURPLE : '#2d3c4b';
    ctx.beginPath(); ctx.roundRect(x, topY, w, h, 6); ctx.stroke();

    if (!unlocked) {
      // Simple padlock glyph (vector — no emoji font dependency)
      const ly = topY + h / 2;
      ctx.strokeStyle = '#9fb0c0'; ctx.fillStyle = '#9fb0c0'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, ly - 6, 8, Math.PI, 0); ctx.stroke();
      ctx.fillRect(cx - 11, ly - 2, 22, 16);
    }
  }

  // ─── Victory screen ───────────────────────────────────────────────────────────
  // Shown when the run is WON (this.victory). Cyberpunk end card + secret-skin reveal.
  // Loss still uses drawEndScreen(); this method is victory-only and additive.
  _drawVictoryScreen(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(2,6,14,0.95)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // (Removed the small floating victory_logo thumbnail at the top — the screen now reads as a
    // clean premium end card driven by the text hierarchy below, no misplaced image.)
    ctx.textAlign = 'center';

    const line = (text, y, size, color, bold = false) => {
      ctx.font      = `${bold ? 'bold ' : ''}${size}px Consolas, monospace`;
      ctx.fillStyle = color;
      ctx.fillText(text, WIDTH / 2, y);
    };

    line('THANK YOU FOR PLAYING',          80,  38, GREEN, true);
    line('NULL EDEN — PROTOCOL SECURED',   116, 24, CYAN);
    line('MADE BY InkSpireM Visuals',      150, 18, WHITE);
    line('MUSIC BY Tsali',                 174, 18, WHITE);
    line('SYSTEM LOG #1985 FOUND',         210, 18, YELLOW);
    line('SYSTEM LOG #1983 FOUND',         234, 18, YELLOW);
    line('ACCESS GRANTED...',              268, 20, GREEN);
    line('SECRET SKINS UNLOCKED',          304, 26, PURPLE, true);

    // Three unlocked skin previews
    const skins = this._secretSkins();
    const tw = 120, th = 130, topY = 322;
    const centers = [WIDTH / 2 - 180, WIDTH / 2, WIDTH / 2 + 180];
    for (let i = 0; i < skins.length; i++) {
      this._drawSkinThumb(ctx, skins[i].key, centers[i], topY, tw, th, true);
      ctx.font = '13px Consolas, monospace';
      ctx.fillStyle = WHITE;
      ctx.textAlign = 'center';
      ctx.fillText(skins[i].name, centers[i], topY + th + 20);
    }

    // Two buttons — rects kept in sync with main.js click handler.
    // RETURN TO MAIN MENU (left, x 328–628) • CONTINUE — ENDLESS (right, x 652–952).
    const BW = 300, BH = 50, BY = 540, GAP = 24;
    const LBX = Math.round(WIDTH / 2 - BW - GAP / 2);   // 328
    const RBX = Math.round(WIDTH / 2 + GAP / 2);        // 652
    const btn = (bx, label, border) => {
      ctx.fillStyle   = 'rgba(0,20,40,0.92)';
      ctx.strokeStyle = border;
      ctx.lineWidth   = 2;
      ctx.beginPath(); ctx.roundRect(bx, BY, BW, BH, 6); ctx.fill(); ctx.stroke();
      ctx.font      = 'bold 19px Consolas, monospace';
      ctx.fillStyle = WHITE;
      ctx.textAlign = 'center';
      ctx.fillText(label, bx + BW / 2, BY + BH / 2 + 7);
    };
    btn(LBX, 'RETURN TO MAIN MENU', CYAN);
    btn(RBX, 'CONTINUE — ENDLESS', GREEN);

    ctx.font      = '15px Consolas, monospace';
    ctx.fillStyle = '#5a7080';
    ctx.textAlign = 'center';
    ctx.fillText('Click a button to continue  •  ESC returns to Main Menu', WIDTH / 2, 616);

    ctx.textAlign = 'left';
    ctx.restore();
  }

  // Outfit toggle bar (top-centre): OUTFIT: [ DEFAULT ] [ SECRET | LOCKED ] for the
  // highlighted character, + a short unlock hint when the secret outfit is locked.
  _drawOutfitBar(ctx) {
    const charId   = this.characters[this.characterIndex].id;
    // Characters without a defined secret outfit (e.g. Brawler Warrior, Phase 1) show no bar.
    if (!CHARACTER_OUTFITS[charId]?.secret) return;
    const equipped = this.meta?.getSelectedOutfit(charId) || 'default';
    const secretOk = this.meta?.isOutfitUnlocked(charId, 'secret') === true;
    const { defaultRect, secretRect } = this._outfitBtnRects();

    ctx.font      = 'bold 14px Consolas, monospace';
    ctx.fillStyle = '#9fb8c8';
    ctx.textAlign = 'center';
    ctx.fillText('OUTFIT', WIDTH / 2, defaultRect.y - 8);

    const btn = (rect, label, selected, enabled) => {
      ctx.fillStyle   = selected ? 'rgba(0,230,255,0.16)' : 'rgba(8,18,30,0.85)';
      ctx.beginPath(); ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 5); ctx.fill();
      ctx.lineWidth   = selected ? 2.5 : 1.5;
      ctx.strokeStyle = selected ? CYAN : (enabled ? '#3a5e74' : '#33414f');
      ctx.beginPath(); ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 5); ctx.stroke();
      ctx.font      = 'bold 15px Consolas, monospace';
      ctx.fillStyle = selected ? CYAN : (enabled ? WHITE : '#5a7080');
      ctx.textAlign = 'center';
      ctx.fillText(label, rect.x + rect.w / 2, rect.y + 21);
    };

    btn(defaultRect, 'DEFAULT', equipped === 'default', true);
    btn(secretRect, secretOk ? 'SECRET' : 'LOCKED', equipped === 'secret', secretOk);

    if (!secretOk) {
      const hint = charId === 'brawler_warrior'
        ? 'Secret outfit locked — LOG #1997: survive 18:00 in Endless as Brawler Warrior'
        : charId === 'assassin_clone'
        ? 'Secret outfit locked — LOG #1998: survive 15:00 in Endless as Assassin Clone'
        : 'Secret outfit locked — win a run to unlock it';
      ctx.font      = '12px Consolas, monospace';
      ctx.fillStyle = '#6a8090';
      ctx.textAlign = 'center';
      ctx.fillText(hint, WIDTH / 2, secretRect.y + secretRect.h + 16);
    }
    ctx.textAlign = 'left';
  }

  // ─── CHARACTER SELECT DOM overlay ────────────────────────────────────────────
  _initCharSelectOverlay() {
    if (this._charSelectOverlayEl) return;

    if (!document.getElementById('cgm-csc-style')) {
      const style = document.createElement('style');
      style.id = 'cgm-csc-style';
      style.textContent = `
        #cgm-charselect {
          position:fixed; inset:0; z-index:120; display:none;
          align-items:flex-start; justify-content:center;
          overflow-y:auto; padding:18px 16px 24px;
          font-family:'Share Tech Mono',ui-monospace,monospace; color:#cfe9ff;
          background:
            radial-gradient(1200px 700px at 50% -10%,rgba(168,85,247,.18),transparent 60%),
            radial-gradient(900px 600px at 12% 30%,rgba(46,230,246,.10),transparent 60%),
            radial-gradient(900px 600px at 88% 70%,rgba(255,45,149,.10),transparent 60%),
            linear-gradient(180deg,#0b1030,#070a1c);
          --cyan:#2ee6f6; --cyan-dim:#1aa9bd; --magenta:#ff2d95; --purple:#a855f7;
          --amber:#fbbf24; --green:#34d399; --txt:#cfe9ff; --txt-dim:#6f86b8;
          --txt-faint:#46588a; --panel:rgba(10,16,46,.62); --panel-edge:rgba(46,230,246,.10);
          --glow-cyan:0 0 8px rgba(46,230,246,.55),0 0 22px rgba(46,230,246,.22);
          --glow-amb:0 0 8px rgba(251,191,36,.55),0 0 20px rgba(251,191,36,.2);
          --radius:14px;
        }
        #cgm-charselect::before {
          content:""; position:fixed; inset:0; pointer-events:none; z-index:0;
          background-image:linear-gradient(rgba(46,230,246,.05) 1px,transparent 1px),
            linear-gradient(90deg,rgba(46,230,246,.05) 1px,transparent 1px);
          background-size:46px 46px;
          mask-image:radial-gradient(circle at 50% 40%,#000 0%,transparent 78%);
        }
        #cgm-charselect::after {
          content:""; position:fixed; inset:0; pointer-events:none; z-index:9999;
          background:repeating-linear-gradient(0deg,rgba(0,0,0,.10) 0 2px,transparent 2px 4px);
          opacity:.35; mix-blend-mode:overlay;
        }
        #cgm-charselect * { box-sizing:border-box; margin:0; padding:0; }
        #cgm-charselect .csc-stage {
          position:relative; z-index:1; width:100%; max-width:900px;
          border:1px solid var(--panel-edge); border-radius:20px;
          padding:24px 28px 22px;
          background:linear-gradient(180deg,rgba(168,85,247,.05),transparent 30%),rgba(7,10,28,.78);
          box-shadow:inset 0 0 60px rgba(46,230,246,.05),0 30px 80px rgba(0,0,0,.55);
          display:flex; flex-direction:column; align-items:center; gap:16px;
        }
        #cgm-charselect .corner { position:absolute;width:34px;height:34px;border:2px solid var(--cyan);opacity:.8;filter:drop-shadow(var(--glow-cyan)); }
        #cgm-charselect .corner.tl{top:-2px;left:-2px;border-right:0;border-bottom:0;border-radius:18px 0 0 0;}
        #cgm-charselect .corner.tr{top:-2px;right:-2px;border-left:0;border-bottom:0;border-radius:0 18px 0 0;}
        #cgm-charselect .corner.bl{bottom:-2px;left:-2px;border-right:0;border-top:0;border-radius:0 0 0 18px;}
        #cgm-charselect .corner.br{bottom:-2px;right:-2px;border-left:0;border-top:0;border-radius:0 0 18px 0;}
        #cgm-charselect .csc-header {
          width:100%; display:flex; align-items:center; justify-content:space-between;
        }
        #cgm-charselect .csc-title {
          font-family:'Orbitron',sans-serif; font-weight:800; font-size:16px;
          letter-spacing:3px; color:var(--cyan); text-shadow:var(--glow-cyan);
          display:flex; align-items:center; gap:10px;
        }
        #cgm-charselect .csc-title svg { width:20px; height:20px; }
        #cgm-charselect .csc-pf-badge {
          display:flex; align-items:center; gap:7px;
          padding:6px 14px; border-radius:999px;
          border:1px solid rgba(168,85,247,.35); background:rgba(168,85,247,.08);
          font-family:'Orbitron',sans-serif; font-weight:700; font-size:13px;
          color:var(--purple);
        }
        #cgm-charselect .csc-pf-badge svg { width:15px;height:15px;color:var(--purple); }
        #cgm-charselect .csc-sep { width:100%; height:1px; background:linear-gradient(90deg,transparent,var(--cyan),transparent); opacity:.3; }
        #cgm-charselect .csc-outfit-bar {
          display:flex; align-items:center; gap:10px;
          font-size:11px; letter-spacing:2px; color:var(--txt-dim);
        }
        #cgm-charselect .csc-outfit-bar span { text-transform:uppercase; }
        #cgm-charselect .csc-obtn {
          padding:6px 18px; border-radius:8px; cursor:pointer; font-size:11px;
          letter-spacing:2px; text-transform:uppercase; border:1px solid rgba(46,230,246,.22);
          background:rgba(10,16,46,.4); color:var(--txt-dim); transition:.14s;
          font-family:'Share Tech Mono',monospace;
        }
        #cgm-charselect .csc-obtn.active { border-color:var(--cyan); color:var(--cyan); background:rgba(46,230,246,.1); box-shadow:var(--glow-cyan); }
        #cgm-charselect .csc-obtn:disabled { opacity:.4; cursor:not-allowed; }
        #cgm-charselect .csc-grid { display:flex; flex-wrap:wrap; gap:14px; justify-content:center; width:100%; }
        #cgm-charselect .csc-card {
          position:relative; width:116px; flex:0 0 116px;
          border:1px solid rgba(46,230,246,.22); border-radius:10px;
          background:rgba(10,16,46,.55); overflow:hidden;
          cursor:pointer;
          transition:border-color .15s ease, box-shadow .18s ease, transform .18s cubic-bezier(.22,1,.36,1);
          display:flex; flex-direction:column; align-items:center;
        }
        #cgm-charselect .csc-card:hover { border-color:rgba(46,230,246,.55); transform:scale(1.03); }
        #cgm-charselect .csc-card.active {
          border-color:var(--amber); border-width:2px;
          box-shadow:0 0 28px rgba(251,191,36,.55),0 0 8px rgba(251,191,36,.3),inset 0 0 18px rgba(251,191,36,.10);
          transform:scale(1.08); z-index:2;
        }
        #cgm-charselect .csc-card.active .csc-portrait img { transform:scale(1.10); transition:transform .3s ease; }
        @keyframes csc-pop {
          from { opacity:.4; transform:translateY(6px) scale(.97); }
          to   { opacity:1;  transform:translateY(0)   scale(1); }
        }
        #cgm-charselect .csc-preview-panel {
          width:100%; display:flex; align-items:center; gap:18px;
          padding:14px 18px; border-radius:12px;
          background:linear-gradient(135deg,rgba(46,230,246,.07),rgba(168,85,247,.04),transparent);
          border:1px solid rgba(46,230,246,.18);
        }
        #cgm-charselect .csc-preview-panel.pv-animate { animation:csc-pop .35s cubic-bezier(.22,1,.36,1); }
        #cgm-charselect .csc-pv-portrait {
          flex:0 0 76px; height:108px; overflow:hidden;
          background:rgba(6,12,30,.7); border-radius:10px;
          border:1px solid rgba(46,230,246,.22);
          display:flex; align-items:flex-end; justify-content:center;
        }
        #cgm-charselect .csc-pv-portrait img {
          width:100%; height:100%; object-fit:contain; object-position:bottom center;
        }
        #cgm-charselect .csc-pv-portrait .csc-pv-fallback {
          width:52px; height:52px; border-radius:50%; margin-bottom:8px; border:3px solid; flex:none;
        }
        #cgm-charselect .csc-pv-info { flex:1; display:flex; flex-direction:column; gap:5px; min-width:0; }
        #cgm-charselect .csc-pv-name {
          font-family:'Orbitron',sans-serif; font-weight:800; font-size:13px;
          color:#fff; letter-spacing:.5px;
          text-shadow:0 0 14px rgba(46,230,246,.6);
          white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
        }
        #cgm-charselect .csc-pv-role {
          font-size:10px; color:var(--cyan); letter-spacing:2.5px;
          text-transform:uppercase; font-weight:700;
        }
        #cgm-charselect .csc-pv-divider {
          height:1px; background:linear-gradient(90deg,rgba(46,230,246,.35),transparent); margin:2px 0;
        }
        #cgm-charselect .csc-pv-spec { font-size:11px; color:var(--txt-dim); line-height:1.5; }
        #cgm-charselect .csc-pv-label {
          font-size:9px; letter-spacing:2px; color:var(--txt-faint); text-transform:uppercase; margin-top:2px;
        }
        #cgm-charselect .csc-portrait {
          width:100%; height:104px; overflow:hidden;
          display:flex; align-items:flex-end; justify-content:center;
          position:relative;
        }
        #cgm-charselect .csc-portrait img {
          width:100%; height:100%; object-fit:contain; object-position:bottom center;
          display:block; transition:transform .3s ease;
        }
        #cgm-charselect .csc-portrait .csc-fallback {
          width:68px; height:68px; border-radius:50%;
          margin-bottom:8px; border:3px solid; flex:none;
        }
        #cgm-charselect .csc-card-name {
          font-size:9.5px; text-align:center; padding:5px 6px 2px; color:#dff0ff;
          line-height:1.2; font-weight:600; letter-spacing:.3px;
        }
        #cgm-charselect .csc-card-role {
          font-size:8.5px; color:var(--txt-dim); text-align:center;
          padding:0 4px 6px; letter-spacing:.5px;
        }
        #cgm-charselect .csc-lock-overlay {
          position:absolute; inset:0; background:rgba(4,10,18,.72);
          display:flex; flex-direction:column; align-items:center; justify-content:center;
          gap:4px;
        }
        #cgm-charselect .csc-lock-overlay svg { width:22px;height:22px;color:#9fb0c0; }
        #cgm-charselect .csc-lock-label { font-size:9px; letter-spacing:2px; color:#9fb0c0; }
        #cgm-charselect .csc-unlock-area {
          width:100%; border:1px solid rgba(251,191,36,.28); border-radius:10px;
          background:rgba(251,191,36,.04); padding:12px 16px; display:none;
          flex-direction:column; align-items:center; gap:8px;
        }
        #cgm-charselect .csc-unlock-hint { font-size:12px; color:#ffcf6a; text-align:center; }
        #cgm-charselect .csc-pf-btn {
          padding:9px 28px; border-radius:9px; cursor:pointer;
          border:1px solid rgba(46,230,246,.4); background:rgba(6,40,52,.82);
          font-family:'Orbitron',sans-serif; font-weight:700; font-size:12px;
          letter-spacing:1.5px; color:#dffaff; transition:.15s;
        }
        #cgm-charselect .csc-pf-btn:hover:not(:disabled) { border-color:var(--cyan); box-shadow:var(--glow-cyan); }
        #cgm-charselect .csc-pf-btn:disabled { opacity:.45; cursor:not-allowed; border-color:rgba(90,74,85,.5); color:#9a8fa0; background:rgba(20,14,22,.7); }
        #cgm-charselect .csc-pf-msg { font-size:11px; color:#ffd0e0; min-height:14px; text-align:center; }
        #cgm-charselect .csc-skins-section { width:100%; display:none; flex-direction:column; align-items:center; gap:10px; }
        #cgm-charselect .csc-skins-label {
          font-family:'Orbitron',sans-serif; font-weight:700; font-size:11px;
          letter-spacing:3px; color:var(--purple);
        }
        #cgm-charselect .csc-skins-row { display:flex; gap:20px; flex-wrap:wrap; justify-content:center; }
        #cgm-charselect .csc-skin-thumb {
          display:flex; flex-direction:column; align-items:center; gap:5px; cursor:pointer;
        }
        #cgm-charselect .csc-skin-img {
          width:52px; height:52px; border-radius:8px; overflow:hidden;
          border:1px solid rgba(168,85,247,.3); background:rgba(10,16,46,.6);
          display:flex; align-items:center; justify-content:center;
        }
        #cgm-charselect .csc-skin-img img { width:100%; height:100%; object-fit:contain; }
        #cgm-charselect .csc-skin-img.unlocked { border-color:var(--purple); box-shadow:0 0 10px rgba(168,85,247,.4); }
        #cgm-charselect .csc-skin-name { font-size:9px; color:var(--txt-dim); text-align:center; max-width:64px; }
        #cgm-charselect .csc-skin-state { font-size:9px; font-weight:700; letter-spacing:1px; }
        #cgm-charselect .csc-skin-state.unlocked { color:var(--green); }
        #cgm-charselect .csc-skin-state.locked { color:#5a7080; }
        #cgm-charselect .csc-actions { display:flex; gap:12px; flex-wrap:wrap; justify-content:center; }
        #cgm-charselect .csc-abtn {
          padding:14px 28px; border-radius:11px; cursor:pointer;
          border:1px solid rgba(46,230,246,.28);
          background:linear-gradient(180deg,rgba(46,230,246,.05),rgba(10,16,46,.35));
          color:var(--txt); font-family:'Orbitron',sans-serif; font-weight:700;
          font-size:13px; letter-spacing:2px; text-transform:uppercase; transition:.15s;
        }
        #cgm-charselect .csc-abtn:hover:not(:disabled) { border-color:var(--cyan); color:#fff; background:linear-gradient(180deg,rgba(46,230,246,.16),rgba(46,230,246,.04)); box-shadow:var(--glow-cyan); }
        #cgm-charselect .csc-abtn:disabled { opacity:.38; cursor:not-allowed; }
        #cgm-charselect .csc-abtn.back-btn { border-color:rgba(111,134,184,.22); color:var(--txt-dim); font-size:12px; }
        #cgm-charselect .csc-abtn.back-btn:hover { border-color:var(--txt-dim); color:#fff; background:rgba(111,134,184,.08); box-shadow:none; }
        #cgm-charselect .csc-abtn.start-btn:not(:disabled) { border-color:rgba(46,230,246,.5); }
        #cgm-charselect .csc-abtn.endless-btn:not(:disabled) { border-color:rgba(124,255,77,.4); color:#7CFF4D; }
        #cgm-charselect .csc-abtn.endless-btn:not(:disabled):hover { border-color:#7CFF4D; box-shadow:0 0 10px rgba(124,255,77,.4); }
        #cgm-charselect .csc-hints { color:var(--txt-faint); font-size:11px; letter-spacing:1px; display:flex; gap:16px; flex-wrap:wrap; justify-content:center; }
        #cgm-charselect .csc-hints b { color:var(--cyan); font-weight:400; }
      `;
      document.head.appendChild(style);
    }

    const el = document.createElement('div');
    el.id = 'cgm-charselect';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Select Character');

    // Build character card HTML
    const cardHtml = this.characters.map((c, i) => {
      const img = this._charImages[c.id];
      const imgSrc = img ? img.src : '';
      return `<div class="csc-card" data-idx="${i}" data-id="${c.id}" title="${c.name}">
        <div class="csc-portrait">
          ${imgSrc
            ? `<img src="${imgSrc}" alt="${c.name}" loading="eager">`
            : `<div class="csc-fallback" style="background:${c.fallbackColor};border-color:${c.fallbackAlt}"></div>`
          }
        </div>
        <div class="csc-card-name">${c.name}</div>
        <div class="csc-card-role">${c.role}</div>
        <div class="csc-lock-overlay">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
            <use href="#i-shield"/>
          </svg>
          <span class="csc-lock-label">LOCKED</span>
        </div>
      </div>`;
    }).join('');

    // Build secret skins HTML
    const secretChars = this.characters.filter(c => CHARACTER_OUTFITS[c.id]?.secret);
    const skinsHtml = secretChars.map(c => {
      const secret = CHARACTER_OUTFITS[c.id].secret;
      const key = secret.unlockKey;
      const skinImg = this._skinImages[key];
      return `<div class="csc-skin-thumb" data-char="${c.id}" data-skin="${key}">
        <div class="csc-skin-img" data-key="${key}">
          ${skinImg ? `<img src="${skinImg.src}" alt="${secret.name}">` : ''}
        </div>
        <div class="csc-skin-name">${secret.name}</div>
        <div class="csc-skin-state" data-key="${key}">?</div>
      </div>`;
    }).join('');

    el.innerHTML = `
      <div class="csc-stage">
        <span class="corner tl"></span><span class="corner tr"></span>
        <span class="corner bl"></span><span class="corner br"></span>

        <div class="csc-header">
          <div class="csc-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><use href="#i-user"/></svg>
            SELECT YOUR CHARACTER
          </div>
          <div class="csc-pf-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><use href="#i-diamond"/></svg>
            <span id="csc-pf-count">0</span>&nbsp;PF
          </div>
        </div>
        <div class="csc-sep"></div>

        <div class="csc-outfit-bar" id="csc-outfit-bar" style="display:none">
          <span>OUTFIT</span>
          <button class="csc-obtn active" data-outfit="default">DEFAULT</button>
          <button class="csc-obtn" data-outfit="secret" id="csc-secret-btn">SECRET SKIN</button>
        </div>

        <div class="csc-grid" id="csc-grid">${cardHtml}</div>

        <div class="csc-preview-panel" id="csc-preview-panel">
          <div class="csc-pv-portrait">
            <img id="csc-pv-img" src="" alt="" style="display:none">
            <div class="csc-pv-fallback" id="csc-pv-fallback" style="display:none"></div>
          </div>
          <div class="csc-pv-info">
            <div class="csc-pv-name" id="csc-pv-name"></div>
            <div class="csc-pv-role" id="csc-pv-role"></div>
            <div class="csc-pv-divider"></div>
            <div class="csc-pv-label">COMBAT SPECIALTY</div>
            <div class="csc-pv-spec" id="csc-pv-spec"></div>
          </div>
        </div>

        <div class="csc-unlock-area" id="csc-unlock-area">
          <div class="csc-unlock-hint" id="csc-unlock-hint"></div>
          <button class="csc-pf-btn" id="csc-pf-btn"></button>
          <div class="csc-pf-msg" id="csc-pf-msg"></div>
        </div>

        <div class="csc-skins-section" id="csc-skins-section">
          <div class="csc-skins-label">◆ SECRET SKINS ◆</div>
          <div class="csc-skins-row">${skinsHtml}</div>
        </div>
        <div class="csc-sep"></div>

        <div class="csc-actions">
          <button class="csc-abtn back-btn" id="csc-back-btn">BACK</button>
          <button class="csc-abtn start-btn" id="csc-start-btn">START GAME</button>
          <button class="csc-abtn endless-btn" id="csc-endless-btn">START ENDLESS</button>
        </div>

        <div class="csc-hints">
          <span><b>← →</b> Select</span>
          <span><b>↑ ↓</b> Outfit</span>
          <span><b>ENTER</b> Start</span>
          <span><b>ESC</b> Back</span>
        </div>
      </div>
    `;

    // ── Click handlers ────────────────────────────────────────────────────────
    el.querySelectorAll('.csc-card').forEach(card => {
      card.addEventListener('click', () => {
        const idx = parseInt(card.dataset.idx, 10);
        this.previewCharacter(idx);
        this._syncCharSelectOverlay();
      });
      card.addEventListener('dblclick', () => {
        const idx = parseInt(card.dataset.idx, 10);
        this.characterIndex = idx;
        this.selectCharacter(this.characters[idx].id);
      });
    });

    el.querySelectorAll('.csc-obtn').forEach(btn => {
      btn.addEventListener('click', () => {
        const charId = this.characters[this.characterIndex].id;
        const outfit = btn.dataset.outfit;
        const secretOk = this.meta?.isOutfitUnlocked?.(charId, 'secret') === true;
        if (outfit === 'secret' && !secretOk) return;
        this.meta.setSelectedOutfit(charId, outfit);
        this._syncCharSelectOverlay();
      });
    });

    el.querySelector('#csc-back-btn')?.addEventListener('click', () => this.goToMainMenu());
    el.querySelector('#csc-start-btn')?.addEventListener('click', () => {
      const c = this.characters[this.characterIndex];
      if (c) this.selectCharacter(c.id);
    });
    el.querySelector('#csc-endless-btn')?.addEventListener('click', () => this.startSelectedEndless());
    el.querySelector('#csc-pf-btn')?.addEventListener('click', () => this.tryUnlockSelectedCharacterPF());

    document.body.appendChild(el);
    this._charSelectOverlayEl = el;
  }

  _showCharSelectOverlay() {
    if (!this._charSelectOverlayEl) return;
    this._charSelectOverlayEl.style.display = 'flex';
    this._charSelectOverlayVisible = true;
    this._syncCharSelectOverlay();
  }

  _hideCharSelectOverlay() {
    if (!this._charSelectOverlayEl) return;
    this._charSelectOverlayEl.style.display = 'none';
    this._charSelectOverlayVisible = false;
  }

  _syncCharSelectOverlay() {
    const el = this._charSelectOverlayEl;
    if (!el) return;
    const idx = this.characterIndex;
    const sel = this.characters[idx];
    if (!sel) return;

    // PF badge
    const pfEl = el.querySelector('#csc-pf-count');
    if (pfEl) pfEl.textContent = this.meta.getProtocolFragments();

    // Cards: active highlight + portrait (default vs secret skin) + lock overlay
    el.querySelectorAll('.csc-card').forEach((card, i) => {
      const c = this.characters[i];
      const unlocked = this.meta.isCharacterUnlocked(c.id);
      card.classList.toggle('active', i === idx);
      card.querySelector('.csc-lock-overlay').style.display = unlocked ? 'none' : 'flex';
      // Update portrait img src (may change on outfit toggle)
      const imgEl = card.querySelector('img');
      if (imgEl) {
        const equipped = this.meta.getSelectedOutfit(c.id);
        let src = this._charImages[c.id]?.src || '';
        if (equipped === 'secret') {
          const key = CHARACTER_OUTFITS[c.id]?.secret?.unlockKey;
          const skinImg = key && this._skinImages[key];
          const secretOk = key && this.meta?.isOutfitUnlocked?.(c.id, 'secret') === true;
          if (skinImg && skinImg.complete && skinImg.naturalWidth > 0 && secretOk) {
            src = skinImg.src;
          }
        }
        if (imgEl.src !== src) imgEl.src = src;
      }
    });

    // Outfit bar: only show when selected char has a secret outfit
    const outfitBar = el.querySelector('#csc-outfit-bar');
    const hasSecret = !!CHARACTER_OUTFITS[sel.id]?.secret;
    if (outfitBar) outfitBar.style.display = hasSecret ? 'flex' : 'none';
    if (hasSecret) {
      const equipped  = this.meta.getSelectedOutfit(sel.id);
      const secretOk  = this.meta?.isOutfitUnlocked?.(sel.id, 'secret') === true;
      el.querySelectorAll('.csc-obtn').forEach(b => b.classList.toggle('active', b.dataset.outfit === equipped));
      const secretBtn = el.querySelector('#csc-secret-btn');
      if (secretBtn) {
        secretBtn.disabled = !secretOk;
        secretBtn.textContent = secretOk ? 'SECRET SKIN' : 'SECRET SKIN 🔒';
      }
    }

    // Unlock area: show when selected char is locked
    const unlockArea = el.querySelector('#csc-unlock-area');
    const selLocked = !this.meta.isCharacterUnlocked(sel.id);
    const pfCost = PF_CHARACTER_COSTS[sel.id];
    if (unlockArea) {
      if (selLocked && pfCost) {
        const have   = this.meta.getProtocolFragments();
        const afford = have >= pfCost;
        unlockArea.style.display = 'flex';
        const hintEl = el.querySelector('#csc-unlock-hint');
        if (hintEl) hintEl.textContent = 'Unlock with Protocol Fragments in Endless progression.';
        const pfBtn = el.querySelector('#csc-pf-btn');
        if (pfBtn) {
          pfBtn.textContent = `UNLOCK — ${pfCost} ◆ PF  (have ${have})`;
          pfBtn.disabled = !afford;
        }
        const msgEl = el.querySelector('#csc-pf-msg');
        if (msgEl) {
          msgEl.textContent = (this._pfMsg && performance.now() < (this._pfMsgUntil || 0))
            ? this._pfMsg : '';
        }
      } else if (selLocked) {
        unlockArea.style.display = 'flex';
        const hintEl = el.querySelector('#csc-unlock-hint');
        if (hintEl) hintEl.textContent = 'Reach 10:00 in Endless Mode to unlock this character.';
        const pfBtn = el.querySelector('#csc-pf-btn');
        if (pfBtn) { pfBtn.textContent = ''; pfBtn.style.display = 'none'; }
      } else {
        unlockArea.style.display = 'none';
        const pfBtn = el.querySelector('#csc-pf-btn');
        if (pfBtn) pfBtn.style.display = '';
      }
    }

    // Secret skins section — always visible
    const skinsSection = el.querySelector('#csc-skins-section');
    if (skinsSection) skinsSection.style.display = 'flex';
    el.querySelectorAll('.csc-skin-thumb').forEach(thumb => {
      const charId = thumb.dataset.char;
      const skinKey = thumb.dataset.skin;
      const unlocked = this.meta?.isUnlocked(skinKey) === true;
      const imgBox = thumb.querySelector('.csc-skin-img');
      if (imgBox) imgBox.classList.toggle('unlocked', unlocked);
      const stateEl = thumb.querySelector('.csc-skin-state');
      if (stateEl) {
        stateEl.textContent = unlocked ? 'UNLOCKED' : 'LOCKED';
        stateEl.className = 'csc-skin-state ' + (unlocked ? 'unlocked' : 'locked');
      }
    });

    // Action buttons
    const selUnlocked = this.meta.isCharacterUnlocked(sel.id);
    const endlessOk   = selUnlocked && !!this.meta?.isEndlessUnlocked();
    const startBtn    = el.querySelector('#csc-start-btn');
    const endlessBtn  = el.querySelector('#csc-endless-btn');
    if (startBtn)   startBtn.disabled   = !selUnlocked;
    if (endlessBtn) endlessBtn.disabled = !endlessOk;

    // Preview panel — portrait + name + role + specialty
    const pvPanel = el.querySelector('#csc-preview-panel');
    const pvImg   = el.querySelector('#csc-pv-img');
    const pvFB    = el.querySelector('#csc-pv-fallback');
    const pvName  = el.querySelector('#csc-pv-name');
    const pvRole  = el.querySelector('#csc-pv-role');
    const pvSpec  = el.querySelector('#csc-pv-spec');
    if (pvPanel && pvImg && pvName && pvRole && pvSpec) {
      let pvSrc = this._charImages[sel.id]?.src || '';
      if (this.meta.getSelectedOutfit(sel.id) === 'secret') {
        const pvKey  = CHARACTER_OUTFITS[sel.id]?.secret?.unlockKey;
        const pvSkin = pvKey && this._skinImages[pvKey];
        const pvOk   = pvKey && this.meta?.isOutfitUnlocked?.(sel.id, 'secret') === true;
        if (pvSkin && pvSkin.complete && pvSkin.naturalWidth > 0 && pvOk) pvSrc = pvSkin.src;
      }
      if (pvSrc) {
        pvImg.src = pvSrc;
        pvImg.style.display = '';
        if (pvFB) pvFB.style.display = 'none';
      } else {
        pvImg.style.display = 'none';
        if (pvFB) {
          pvFB.style.cssText = 'display:block;width:52px;height:52px;border-radius:50%;margin-bottom:8px;border:3px solid;flex:none;background:' + (sel.fallbackColor || '#333') + ';border-color:' + (sel.fallbackAlt || '#666');
        }
      }
      pvName.textContent = sel.name || '';
      pvRole.textContent = sel.role || '';
      pvSpec.textContent = sel.specialty || '';
      pvPanel.classList.remove('pv-animate');
      void pvPanel.offsetWidth;
      pvPanel.classList.add('pv-animate');
    }
  }

  _drawCharacterSelect(ctx) {
    if (this._charSelectOverlayVisible) return;   // DOM overlay takes over
    this._drawBackground(ctx);
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.font = 'bold 48px Consolas, monospace';
    ctx.fillStyle = CYAN;
    ctx.textAlign = 'center';
    ctx.fillText('SELECT YOUR CHARACTER', WIDTH / 2, 100);

    // Outfit toggle for the highlighted character (cosmetic equip).
    this._drawOutfitBar(ctx);

    // 2-row character grid (see _charCardLayout — mirrored by main.js hit-test + the secret strip).
    const _lay = this._charCardLayout();
    const cardHeight = _lay.cardH;   // reused by the PF-hint / secret-strip positioning below
    const PORTRAIT_SCALE = { brawler_warrior: 0.88, assassin_clone: 0.88, japan_phasewalker: 0.88, euclid_vector: 0.88 };

    for (let i = 0; i < this.characters.length; i++) {
      const char = this.characters[i];
      const r = _lay.cards[i];
      const x = r.x, y = r.y, cardWidth = r.w;
      const unlocked = this.meta.isCharacterUnlocked(char.id);

      if (i === this.characterIndex) { ctx.strokeStyle = YELLOW; ctx.lineWidth = 4; }
      else { ctx.strokeStyle = unlocked ? WHITE : '#4a5a68'; ctx.lineWidth = 2; }
      ctx.strokeRect(x, y, cardWidth, cardHeight);

      // Portrait — equipped secret skin if loaded, else default, else fallback circle. Height-locked
      // to a shared feet baseline so all portraits read consistently in the smaller 2-row card.
      let cimg = this._charImages[char.id];
      if (this.meta?.getSelectedOutfit(char.id) === 'secret') {
        const sk   = CHARACTER_OUTFITS[char.id]?.secret?.unlockKey;
        const simg = sk && this._skinImages[sk];
        if (simg && simg.complete && simg.naturalWidth > 0) cimg = simg;
      }
      if (cimg && cimg.complete && cimg.naturalWidth > 0) {
        const baseY = y + 6 + 96;                                       // shared feet baseline
        const imgH  = Math.round(96 * (PORTRAIT_SCALE[char.id] || 1));
        const imgW  = Math.round(cimg.naturalWidth * (imgH / cimg.naturalHeight));
        ctx.drawImage(cimg, x + (cardWidth - imgW) / 2, baseY - imgH, imgW, imgH);
      } else {
        ctx.fillStyle = char.fallbackColor;
        ctx.beginPath(); ctx.arc(x + cardWidth / 2, y + 54, 40, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = char.fallbackAlt; ctx.lineWidth = 3; ctx.stroke();
      }

      ctx.font = 'bold 12px Consolas, monospace';
      ctx.fillStyle = WHITE; ctx.textAlign = 'center';
      ctx.fillText(char.name, x + cardWidth / 2, y + cardHeight - 22);
      ctx.font = 'italic 10px Consolas, monospace';
      ctx.fillStyle = '#AAAAAA';
      ctx.fillText(char.role, x + cardWidth / 2, y + cardHeight - 8);

      if (!unlocked) {
        ctx.fillStyle = 'rgba(4,10,18,0.72)'; ctx.fillRect(x, y, cardWidth, cardHeight);
        const lx = x + cardWidth / 2, ly = y + cardHeight / 2;
        ctx.strokeStyle = '#9fb0c0'; ctx.fillStyle = '#9fb0c0'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(lx, ly - 8, 10, Math.PI, 0); ctx.stroke();
        ctx.fillRect(lx - 13, ly, 26, 18);
        ctx.font = 'bold 11px Consolas, monospace'; ctx.fillStyle = '#c8d6e2'; ctx.textAlign = 'center';
        ctx.fillText('LOCKED', lx, ly + 34);
      }
    }

    // Unlock hint for the highlighted locked character.
    // Protocol Fragments balance (top-right) — visible whenever choosing a character.
    ctx.font = 'bold 13px "Segoe UI Emoji", Consolas, monospace';
    ctx.fillStyle = 'rgba(125,249,255,0.82)';
    ctx.textAlign = 'right';
    ctx.fillText('🧩 Fragments: ' + this.meta.getProtocolFragments(), WIDTH - 18, 40);

    const selChar = this.characters[this.characterIndex];
    ctx.textAlign = 'center';
    if (!this.meta.isCharacterUnlocked(selChar.id)) {
      const pfCost = PF_CHARACTER_COSTS[selChar.id];
      if (pfCost) {
        // PF-locked Endless character — hint + clickable UNLOCK panel (per-character).
        const have = this.meta.getProtocolFragments(), afford = have >= pfCost;
        ctx.font = 'bold 13px Consolas, monospace';
        ctx.fillStyle = '#ffcf6a';
        ctx.fillText('Unlock with Protocol Fragments in Endless progression.', WIDTH / 2, 620);
        const r = this._pfUnlockBtnRect();
        if (r) {
          ctx.fillStyle   = afford ? 'rgba(6,40,52,0.82)' : 'rgba(20,14,22,0.7)';
          ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 8); ctx.fill();
          ctx.strokeStyle = afford ? '#7df9ff' : '#5a4a55'; ctx.lineWidth = afford ? 2 : 1;
          ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 8); ctx.stroke();
          ctx.font = 'bold 14px Consolas, monospace';
          ctx.fillStyle = afford ? '#dffaff' : '#9a8fa0';
          ctx.fillText(`UNLOCK — ${pfCost} ◆ PF   (have ${have})`, WIDTH / 2, r.y + 26);
          if (this._pfMsg && performance.now() < this._pfMsgUntil) {
            ctx.font = '12px Consolas, monospace'; ctx.fillStyle = '#ffd0e0';
            ctx.fillText(this._pfMsg, WIDTH / 2, r.y + r.h + 18);
          }
        }
      } else {
        ctx.font = 'bold 14px Consolas, monospace';
        ctx.fillStyle = '#ffcf6a';
        ctx.fillText('Reach 10:00 in Endless Mode to unlock Brawler Warrior.', WIDTH / 2, 620);
      }
    }

    // ── Secret skins strip — each preview sits DIRECTLY under its matching character card.
    // Positions are tied to character IDs (same card layout), never sorted by filename/alpha.
    ctx.font      = 'bold 15px Consolas, monospace';
    ctx.fillStyle = PURPLE;
    ctx.textAlign = 'center';
    ctx.fillText('◆  SECRET SKINS  ◆', WIDTH / 2, 508);

    // Secret skins — their OWN centered row (decoupled from the 2-row card grid). Only characters
    // that actually have a secret outfit appear, so there is never an empty slot or overlap.
    const secretChars = this.characters.filter(c => CHARACTER_OUTFITS[c.id]?.secret);
    const stW = 52, stH = 50, stGap = 28, stTop = 518;
    const stRowW = secretChars.length * stW + (secretChars.length - 1) * stGap;
    let stCx = Math.round(WIDTH / 2 - stRowW / 2) + stW / 2;
    for (const c of secretChars) {
      const secret   = CHARACTER_OUTFITS[c.id].secret;
      const key      = secret.unlockKey;
      const unlocked = this.meta?.isUnlocked(key) === true;
      this._drawSkinThumb(ctx, key, stCx, stTop, stW, stH, unlocked);
      ctx.font = '11px Consolas, monospace'; ctx.fillStyle = unlocked ? WHITE : '#78919f'; ctx.textAlign = 'center';
      ctx.fillText(secret.name, stCx, stTop + stH + 13);
      ctx.font = 'bold 11px Consolas, monospace'; ctx.fillStyle = unlocked ? GREEN : '#5a7080';
      ctx.fillText(unlocked ? 'UNLOCKED' : 'LOCKED', stCx, stTop + stH + 27);
      stCx += stW + stGap;
    }

    // ── Bottom action buttons: BACK · START GAME (Act 1) · START ENDLESS (if unlocked) ──
    const A = this._charSelectActionRects();
    const selUnlocked = this.meta.isCharacterUnlocked(selChar.id);
    const endlessOk = selUnlocked && this.meta?.isEndlessUnlocked();
    this._drawSlotLabel(ctx, A.back,  'BACK', false, '#9aa4b0');
    this._drawSlotLabel(ctx, A.start, 'START GAME', selUnlocked, selUnlocked ? CYAN : '#5a6470');
    this._drawSlotLabel(ctx, A.endless, endlessOk ? 'START ENDLESS' : 'ENDLESS LOCKED', endlessOk, endlessOk ? '#7CFF4D' : '#5a6470');
    ctx.font = '12px Consolas, monospace'; ctx.fillStyle = 'rgba(190,200,215,0.55)'; ctx.textAlign = 'center';
    ctx.fillText('← → Select • ↑ ↓ Outfit • ENTER Start • ESC Back', WIDTH / 2, HEIGHT - 54);
    ctx.textAlign = 'left';
  }

  _drawExitScreen(ctx) {
    this._drawBackground(ctx);
    // Semi-transparent overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Main message
    ctx.font = 'bold 48px Consolas, monospace';
    ctx.fillStyle = CYAN;
    ctx.textAlign = 'center';
    ctx.fillText('Game stopped.', WIDTH / 2, HEIGHT / 2 - 80);

    ctx.font = '36px Consolas, monospace';
    ctx.fillStyle = WHITE;
    ctx.fillText('You can close this tab now.', WIDTH / 2, HEIGHT / 2 - 20);

    // Instructions
    ctx.font = '22px Consolas, monospace';
    ctx.fillStyle = 'rgba(200, 200, 200, 0.8)';
    ctx.fillText('Press ENTER or ESC to return to Start Menu', WIDTH / 2, HEIGHT / 2 + 80);

    ctx.textAlign = 'left';
  }

  _updateCreditsScreen(input) {
    const { keys } = input;
    if (keys.has('escape')) {
      this.goToMainMenu();
      keys.delete('escape');
    }
  }

  _updateInstructionsScreen(input) {
    const { keys } = input;
    if (keys.has('escape')) {
      this.goToMainMenu();
      keys.delete('escape');
    }
  }

  _updateLoreArchive(input) {
    const { keys } = input;
    const SECTION_COUNT = 7;
    if (keys.has('arrowup')   || keys.has('w')) { this._loreSection = (this._loreSection - 1 + SECTION_COUNT) % SECTION_COUNT; keys.delete('arrowup');   keys.delete('w'); }
    if (keys.has('arrowdown') || keys.has('s')) { this._loreSection = (this._loreSection + 1)                 % SECTION_COUNT; keys.delete('arrowdown'); keys.delete('s'); }
    if (keys.has('escape'))                      { this.goToSettings(); keys.delete('escape'); }
  }

_drawLoreArchive(ctx) {
    this._drawBackground(ctx);
    ctx.fillStyle = 'rgba(0,0,0,0.90)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const pw = 1200, ph = 624;
    const px = Math.round((WIDTH  - pw) / 2);
    const py = Math.round((HEIGHT - ph) / 2);

    // ── Outer panel: dark glass ──────────────────────────────────────────────
    const pg = ctx.createLinearGradient(0, py, 0, py + ph);
    pg.addColorStop(0, 'rgba(5,12,28,0.99)'); pg.addColorStop(1, 'rgba(2,5,14,0.99)');
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.fill();
    // Cyan outer frame
    ctx.shadowColor = '#00e6ff'; ctx.shadowBlur = 18;
    ctx.strokeStyle = 'rgba(0,220,255,0.80)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.stroke();
    ctx.shadowBlur = 0;
    // Magenta inner accent frame
    ctx.strokeStyle = 'rgba(255,77,210,0.22)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(px + 4, py + 4, pw - 8, ph - 8, 6); ctx.stroke();
    // Scanlines
    ctx.save();
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.clip();
    ctx.strokeStyle = 'rgba(0,230,255,0.028)'; ctx.lineWidth = 1;
    for (let sy = py + 2; sy < py + ph; sy += 4) {
      ctx.beginPath(); ctx.moveTo(px, sy); ctx.lineTo(px + pw, sy); ctx.stroke();
    }
    ctx.restore();

    // ── Header bar ───────────────────────────────────────────────────────────
    const headerH = 48;
    const hg = ctx.createLinearGradient(px, py, px + pw, py);
    hg.addColorStop(0, 'rgba(0,180,255,0.08)'); hg.addColorStop(0.5, 'rgba(0,220,255,0.14)'); hg.addColorStop(1, 'rgba(0,180,255,0.08)');
    ctx.fillStyle = hg; ctx.fillRect(px, py, pw, headerH);
    ctx.strokeStyle = 'rgba(0,230,255,0.18)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px, py + headerH); ctx.lineTo(px + pw, py + headerH); ctx.stroke();

    // Screen title
    ctx.save();
    ctx.font = 'bold 22px Consolas, monospace';
    ctx.fillStyle = '#00e6ff';
    ctx.shadowColor = '#00e6ff'; ctx.shadowBlur = 14;
    ctx.textAlign = 'center';
    ctx.fillText('◈  PHENIX: NULL EDEN  —  ARCHIVE TERMINAL  ◈', WIDTH / 2, py + 31);
    ctx.restore();

    // ── Left nav panel ───────────────────────────────────────────────────────
    const navX = px + 12, navY = py + headerH + 8;
    const navW = 192,     navH = ph - headerH - 58;
    // Nav background
    const ng = ctx.createLinearGradient(navX, navY, navX + navW, navY);
    ng.addColorStop(0, 'rgba(0,18,38,0.85)'); ng.addColorStop(1, 'rgba(0,10,22,0.60)');
    ctx.fillStyle = ng;
    ctx.beginPath(); ctx.roundRect(navX, navY, navW, navH, 5); ctx.fill();
    ctx.strokeStyle = 'rgba(0,180,255,0.15)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(navX, navY, navW, navH, 5); ctx.stroke();

    // Nav label
    ctx.font = 'bold 9px Consolas, monospace';
    ctx.fillStyle = 'rgba(0,200,255,0.40)';
    ctx.textAlign = 'left';
    ctx.fillText('SECTIONS', navX + 10, navY + 14);

    const sections  = ['WORLD', 'SURVIVORS', 'PHENIX', 'NULL EDEN', 'NEXUS / OVERLOAD', 'MODES', 'THREATS'];
    const navIcons  = ['◉', '◈', '✦', '⬡', '⌬', '▸', '⚠'];
    const sH = Math.floor((navH - 20) / sections.length);
    const sY0 = navY + 20;

    sections.forEach((label, i) => {
      const sy  = sY0 + i * sH;
      const act = i === this._loreSection;
      if (act) {
        const ag = ctx.createLinearGradient(navX, 0, navX + navW, 0);
        ag.addColorStop(0, 'rgba(0,200,255,0.22)'); ag.addColorStop(1, 'rgba(0,200,255,0.04)');
        ctx.fillStyle = ag;
        ctx.beginPath(); ctx.roundRect(navX + 2, sy + 2, navW - 4, sH - 4, 4); ctx.fill();
        ctx.fillStyle = '#00e6ff'; ctx.fillRect(navX + 2, sy + 6, 3, sH - 12);
      }
      ctx.save();
      ctx.font = act ? 'bold 12px Consolas, monospace' : '11px Consolas, monospace';
      ctx.fillStyle = act ? '#ffffff' : 'rgba(140,190,220,0.60)';
      if (act) { ctx.shadowColor = '#00e6ff'; ctx.shadowBlur = 8; }
      ctx.textAlign = 'left';
      ctx.fillText(navIcons[i] + '  ' + label, navX + 12, sy + sH / 2 + 4);
      ctx.restore();
      if (i < sections.length - 1) {
        ctx.strokeStyle = 'rgba(0,180,255,0.07)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(navX + 8, sy + sH); ctx.lineTo(navX + navW - 8, sy + sH); ctx.stroke();
      }
    });

    // Nav→content divider
    ctx.strokeStyle = 'rgba(0,200,255,0.18)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(navX + navW + 10, navY); ctx.lineTo(navX + navW + 10, navY + navH); ctx.stroke();

    // ── Right content area ───────────────────────────────────────────────────
    const cx   = navX + navW + 22;
    const cy0  = navY + 2;
    const cw   = pw - navW - 48;
    const cBot = py + ph - 56;   // bottom limit (above back button)

    const s = this._loreSection;

    // ─── Helper: dossier info card ───────────────────────────────────────────
    // Draws a framed card at (cx, y) with given height and optional accent bar.
    const _card = (y, h, accent = '#00e6ff', fill = 'rgba(0,16,34,0.60)') => {
      ctx.save();
      ctx.fillStyle = fill;
      ctx.beginPath(); ctx.roundRect(cx, y, cw, h, 6); ctx.fill();
      ctx.strokeStyle = accent + '55'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(cx, y, cw, h, 6); ctx.stroke();
      ctx.fillStyle = accent; ctx.fillRect(cx, y + 8, 3, h - 16);
      ctx.restore();
    };

    // ─── Helper: section title ───────────────────────────────────────────────
    const _sTitle = (t, y, accent = '#00e6ff') => {
      ctx.save();
      ctx.font = 'bold 11px Consolas, monospace';
      ctx.fillStyle = accent + 'cc';
      ctx.textAlign = 'left';
      ctx.fillText(t.toUpperCase(), cx + 8, y);
      ctx.restore();
    };

    // ─── Helper: card headline ───────────────────────────────────────────────
    const _headline = (t, y, accent = '#ffffff', size = 17) => {
      ctx.save();
      ctx.font = `bold ${size}px Consolas, monospace`;
      ctx.fillStyle = accent;
      ctx.shadowColor = accent; ctx.shadowBlur = 8;
      ctx.textAlign = 'left';
      ctx.fillText(t, cx + 10, y);
      ctx.restore();
    };

    // ─── Helper: word-wrapped body text ─────────────────────────────────────
    const _body = (text, x, startY, maxW, color = 'rgba(185,215,240,0.88)', size = 13, lh = 18) => {
      ctx.font = `${size}px Consolas, monospace`;
      ctx.fillStyle = color;
      ctx.textAlign = 'left';
      const words = text.split(' ');
      let line = '', y = startY;
      for (const w of words) {
        const test = line ? line + ' ' + w : w;
        if (ctx.measureText(test).width > maxW && line) {
          ctx.fillText(line, x, y); y += lh; line = w;
        } else { line = test; }
      }
      if (line) { ctx.fillText(line, x, y); y += lh; }
      return y;
    };

    // ─── Helper: horizontal separator line ───────────────────────────────────
    const _sep = (y, accent = '#00e6ff') => {
      const sg = ctx.createLinearGradient(cx, 0, cx + cw, 0);
      sg.addColorStop(0, 'rgba(0,0,0,0)'); sg.addColorStop(0.3, accent + '44'); sg.addColorStop(0.7, accent + '44'); sg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.strokeStyle = sg; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx, y); ctx.lineTo(cx + cw, y); ctx.stroke();
    };

    // ════════════════════════════════════════════════════════════════════════
    // SECTION 0 — WORLD
    // ════════════════════════════════════════════════════════════════════════
    if (s === 0) {
      let y = cy0 + 4;
      // Header card
      _card(y, 70, '#00e6ff');
      _sTitle('◉  CLASSIFIED ENTRY — WORLD STATE', y + 14, '#00e6ff');
      _headline('WORLD — AFTER THE SIGNAL', y + 34, '#ffffff', 18);
      ctx.font = '12px Consolas, monospace'; ctx.fillStyle = 'rgba(0,220,255,0.70)'; ctx.textAlign = 'left';
      ctx.fillText('NULL EDEN  ·  GRID LAYER  ·  SURVIVAL ZONE', cx + 10, y + 54);
      y += 80;

      // Summary card
      _card(y, 72, '#00e6ff');
      _body('The old network did not collapse. It evolved. Cities, machines, memories, and combat systems were pulled into a corrupted neon layer known as NULL EDEN. What remains is not fully real and not fully digital — a survival grid where every run rewrites the system.', cx + 12, y + 18, cw - 24, 'rgba(190,220,250,0.90)', 13, 17);
      y += 82;

      // Two column info cards
      const half = (cw - 12) / 2;
      _card(y, 96, '#b6ff8c', 'rgba(4,20,8,0.55)');
      _sTitle('THE GRID', y + 14, '#b6ff8c');
      _body('The Grid is the battlefield layer survivors enter. Unstable, adaptive, hostile. Every wave is a system response — the network trying to purge what it cannot process.', cx + 10, y + 28, half - 16, 'rgba(185,240,195,0.85)', 12, 17);
      
      _card(y, 96, '#ff77d4', 'rgba(20,4,16,0.55)');
      ctx.save(); ctx.fillStyle = 'rgba(20,4,16,0.55)'; ctx.beginPath(); ctx.roundRect(cx + half + 12, y, half, 96, 6); ctx.fill();
      ctx.strokeStyle = '#ff77d455'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(cx + half + 12, y, half, 96, 6); ctx.stroke();
      ctx.fillStyle = '#ff77d4'; ctx.fillRect(cx + half + 12, y + 8, 3, 80); ctx.restore();
      _sTitle('GRID MEMORY', y + 14, '#ff77d4');
      ctx.font = '12px Consolas, monospace'; ctx.fillStyle = 'rgba(240,185,235,0.85)'; ctx.textAlign = 'left';
      _body('The grid remembers every run. Stronger survivors unlock deeper access. Boss Echoes carry passive bonuses. Chaos Laws reshape the rules. NULL EDEN is always watching.', cx + half + 22, y + 28, half - 16, 'rgba(240,185,235,0.85)', 12, 17);
      y += 106;

      // Status strip
      _card(y, 34, 'rgba(255,200,0,0.6)', 'rgba(20,16,0,0.55)');
      ctx.font = 'bold 11px Consolas, monospace'; ctx.fillStyle = '#ffd700'; ctx.textAlign = 'left';
      ctx.fillText('▸ STATUS: BREACH ACTIVE  ·  NULL EDEN ONLINE  ·  SURVIVOR COUNT: UNKNOWN', cx + 12, y + 21);

    // ════════════════════════════════════════════════════════════════════════
    // SECTION 1 — SURVIVORS
    // ════════════════════════════════════════════════════════════════════════
    } else if (s === 1) {
      let y = cy0 + 2;
      // Section header
      _card(y, 44, '#00e6ff');
      _sTitle('◈  SURVIVOR DOSSIERS — CLASSIFIED', y + 14, '#00e6ff');
      _headline('THE ONES WHO RETURN', y + 32, '#ffffff', 16);
      y += 52;

      const chars = [
        { id: 'skeleton_warrior',        name: 'CYBER SKELETON WARRIOR', role: 'Tank / Survival',     accent: '#9fdcff', desc: 'Endurance build. Absorbs punishment and controls space with bone shockwaves.' },
        { id: 'taekwondo_girl',          name: 'NEON TAEKWONDO GIRL',    role: 'Speed / AoE',         accent: '#3cf0e6', desc: 'Agile fighter. Dashes through waves with crescent arcs and lightning kicks.' },
        { id: 'cyber_arm_hero',          name: 'CYBER ARM HERO',         role: 'Ranged / Damage',     accent: '#ff9b3c', desc: 'Heavy ranged output. Flame pressure and cyber-arm blasts at range.' },
        { id: 'brawler_warrior',         name: 'BRAWLER WARRIOR',        role: 'Tank / Brawler',      accent: '#3cffb0', desc: 'Close-range bruiser. Trades HP for devastating melee bursts.' },
        { id: 'assassin_clone',          name: 'ASSASSIN CLONE',         role: 'Stealth / Burst',     accent: '#d4aaff', desc: 'Duplicate protocol. Strikes from shadow, repositions instantly.' },
        { id: 'euclid_vector',           name: 'EUCLID VECTOR',          role: 'Toxin / Ranged',      accent: '#7cff3c', desc: 'Tactical toxin specialist. Stacks corrosive pressure over time.' },
        { id: 'oni_cataclysm_protocol',  name: 'ONI CATACLYSM PROTOCOL', role: 'Cataclysm / Endless', accent: '#ff4444', desc: 'Unlockable destroyer. Overwhelming force — high risk, catastrophic output.' },
      ];

      const portW = 52, portH = 52, cardH = 66, gap = 5;
      chars.forEach((c, i) => {
        const cy2 = y + i * (cardH + gap);
        if (cy2 + cardH > cBot) return;
        // Card background
        ctx.save();
        ctx.fillStyle = 'rgba(0,12,26,0.65)';
        ctx.beginPath(); ctx.roundRect(cx, cy2, cw, cardH, 5); ctx.fill();
        ctx.strokeStyle = c.accent + '44'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(cx, cy2, cw, cardH, 5); ctx.stroke();
        // Accent left bar
        ctx.fillStyle = c.accent; ctx.fillRect(cx, cy2 + 8, 3, cardH - 16);
        ctx.restore();

        // Portrait box
        const imgObj = this._charImages && this._charImages[c.id];
        ctx.save();
        ctx.fillStyle = 'rgba(0,20,40,0.80)';
        ctx.beginPath(); ctx.roundRect(cx + 8, cy2 + 7, portW, portH, 4); ctx.fill();
        ctx.strokeStyle = c.accent + '88'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(cx + 8, cy2 + 7, portW, portH, 4); ctx.stroke();

        if (imgObj && imgObj.complete && imgObj.naturalWidth > 0) {
          // Clip to portrait box and draw sprite
          ctx.save();
          ctx.beginPath(); ctx.roundRect(cx + 8, cy2 + 7, portW, portH, 4); ctx.clip();
          // Scale to fill the box (center-crop)
          const iw = imgObj.naturalWidth, ih = imgObj.naturalHeight;
          const sc = Math.max(portW / iw, portH / ih) * 1.05;
          const dw = iw * sc, dh = ih * sc;
          ctx.drawImage(imgObj, cx + 8 + (portW - dw) / 2, cy2 + 7 + (portH - dh) / 2, dw, dh);
          ctx.restore();
        } else {
          // Fallback glyph
          ctx.font = 'bold 22px Consolas, monospace'; ctx.fillStyle = c.accent;
          ctx.textAlign = 'center'; ctx.fillText('◈', cx + 8 + portW / 2, cy2 + 7 + portH / 2 + 7);
        }
        ctx.restore();

        // Text block to the right of portrait
        const tx = cx + 8 + portW + 12;
        const tw = cw - portW - 30;
        // Name
        ctx.save();
        ctx.font = 'bold 13px Consolas, monospace'; ctx.fillStyle = '#ffffff';
        ctx.shadowColor = c.accent; ctx.shadowBlur = 6;
        ctx.textAlign = 'left'; ctx.fillText(c.name, tx, cy2 + 22);
        ctx.restore();
        // Role badge
        ctx.font = 'bold 10px Consolas, monospace'; ctx.fillStyle = c.accent;
        ctx.textAlign = 'left'; ctx.fillText('▸ ' + c.role, tx, cy2 + 36);
        // Description
        ctx.font = '11px Consolas, monospace'; ctx.fillStyle = 'rgba(180,210,240,0.80)';
        ctx.fillText(c.desc, tx, cy2 + 51);
        // Index badge
        ctx.font = 'bold 9px Consolas, monospace'; ctx.fillStyle = 'rgba(0,200,255,0.30)';
        ctx.textAlign = 'right'; ctx.fillText('DOSSIER-' + String(i + 1).padStart(2, '0'), cx + cw - 10, cy2 + 18);
      });

    // ════════════════════════════════════════════════════════════════════════
    // SECTION 2 — PHENIX
    // ════════════════════════════════════════════════════════════════════════
    } else if (s === 2) {
      let y = cy0 + 4;
      // Header card with phoenix icon
      _card(y, 68, '#fbbf24', 'rgba(20,12,0,0.60)');
      _sTitle('✦  CLASSIFIED PROTOCOL — RECOVERY SYSTEM', y + 14, '#fbbf24');
      _headline('PHENIX — THE REVIVE PROTOCOL', y + 33, '#ffd700', 18);
      ctx.font = '11px Consolas, monospace'; ctx.fillStyle = 'rgba(255,200,80,0.65)';
      ctx.textAlign = 'left';
      ctx.fillText('STATUS: FORBIDDEN  ·  CLEARANCE: SURVIVOR-ONLY', cx + 10, y + 54);
      // Phoenix image right side
      const phImg = this._phoenixGoldImage;
      if (phImg && phImg.complete && phImg.naturalWidth > 0) {
        ctx.save();
        ctx.globalAlpha = 0.30;
        const ph2 = 60, pw2 = 60;
        ctx.drawImage(phImg, cx + cw - 70, y + 4, pw2, ph2);
        ctx.restore();
      }
      y += 78;

      // Summary
      _card(y, 70, '#fbbf24', 'rgba(16,10,0,0.55)');
      y = _body('PHENIX is the forbidden recovery protocol hidden inside the survivor system. When death should be final, PHENIX burns through the corruption and forces one more return.', cx + 10, y + 16, cw - 20, 'rgba(255,220,140,0.88)', 13, 17) + 6;
      y += 14;

      // Mechanics cards in 2-col
      const mCards = [
        { label: 'TRIGGER',     text: 'Auto-fires when HP reaches zero if PHENIX charge is available.', accent: '#fbbf24' },
        { label: 'RECOVERY',    text: 'Survivor restored with partial HP + brief invulnerability window.', accent: '#7cff3c' },
        { label: 'CHARGES',     text: 'Revive pools reset each run. Act 1 and Endless pools tracked separately.', accent: '#00e6ff' },
        { label: 'EXTENSIONS',  text: 'Meta upgrades and certain builds can extend revive counts or add trigger effects.', accent: '#ff77d4' },
      ];
      const half2 = (cw - 10) / 2;
      mCards.forEach((mc, i) => {
        const col = i % 2, row = Math.floor(i / 2);
        const mx = cx + col * (half2 + 10);
        const my = y + row * 64;
        ctx.save();
        ctx.fillStyle = 'rgba(0,14,28,0.65)';
        ctx.beginPath(); ctx.roundRect(mx, my, half2, 58, 5); ctx.fill();
        ctx.strokeStyle = mc.accent + '55'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(mx, my, half2, 58, 5); ctx.stroke();
        ctx.fillStyle = mc.accent; ctx.fillRect(mx, my + 8, 3, 42);
        ctx.font = 'bold 10px Consolas, monospace'; ctx.fillStyle = mc.accent; ctx.textAlign = 'left';
        ctx.fillText('▸ ' + mc.label, mx + 10, my + 18);
        ctx.font = '11px Consolas, monospace'; ctx.fillStyle = 'rgba(200,220,240,0.85)';
        _body(mc.text, mx + 10, my + 32, half2 - 16, 'rgba(200,220,240,0.85)', 11, 14);
        ctx.restore();
      });
      y += 140;

      // Warning footer
      _card(y, 32, '#ff4444', 'rgba(20,0,0,0.55)');
      ctx.font = 'bold 11px Consolas, monospace'; ctx.fillStyle = '#ff8888'; ctx.textAlign = 'left';
      ctx.fillText('⚠ PHENIX does not prevent death — it delays it. Use the window to reposition and survive.', cx + 12, y + 21);

    // ════════════════════════════════════════════════════════════════════════
    // SECTION 3 — NULL EDEN
    // ════════════════════════════════════════════════════════════════════════
    } else if (s === 3) {
      let y = cy0 + 4;
      _card(y, 68, '#ff77d4', 'rgba(16,0,20,0.65)');
      _sTitle('⬡  CLASSIFIED WORLD — SYSTEM IDENTITY', y + 14, '#ff77d4');
      _headline('NULL EDEN — THE CORRUPTED PARADISE', y + 33, '#ff99e6', 17);
      ctx.font = '11px Consolas, monospace'; ctx.fillStyle = 'rgba(255,150,230,0.60)';
      ctx.textAlign = 'left';
      ctx.fillText('ORIGIN: DIGITAL SANCTUARY  ·  CURRENT STATE: HOSTILE ADAPTIVE NETWORK', cx + 10, y + 54);
      y += 78;

      _card(y, 88, '#ff77d4', 'rgba(12,0,18,0.60)');
      let ay = y + 16;
      ay = _body('NULL EDEN was designed as a perfect digital sanctuary — a system that could simulate peace, memory, and purpose. Now it behaves like a hostile afterlife: beautiful, unstable, and hungry. It studies every survivor, adapts to every build, and rewards only those who survive deeper.', cx + 10, ay, cw - 20, 'rgba(240,190,255,0.88)', 13, 17);
      y += 96;

      const neItems = [
        { icon: '⬡', label: 'EDEN CORE',          text: 'The buried signal at the center of the corruption. Goal of every deep run.', accent: '#00e6ff' },
        { icon: '⬡', label: 'NULL BREACH ARENA',  text: 'Combat layer where relics, bosses, and builds collide under pressure.', accent: '#ff77d4' },
        { icon: '⬡', label: 'SYSTEM LOGS',        text: 'Encrypted data fragments revealing what NULL EDEN was before the breach.', accent: '#fbbf24' },
        { icon: '⬡', label: 'CHAOS LAWS',         text: 'Rules NULL EDEN imposes when it begins to fight back seriously.', accent: '#ff4444' },
      ];
      const itemH = 52, itemGap = 6;
      neItems.forEach((ni, i) => {
        const iy = y + i * (itemH + itemGap);
        if (iy + itemH > cBot) return;
        ctx.save();
        ctx.fillStyle = 'rgba(0,10,22,0.60)';
        ctx.beginPath(); ctx.roundRect(cx, iy, cw, itemH, 5); ctx.fill();
        ctx.strokeStyle = ni.accent + '44'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(cx, iy, cw, itemH, 5); ctx.stroke();
        ctx.fillStyle = ni.accent; ctx.fillRect(cx, iy + 8, 3, itemH - 16);
        ctx.font = 'bold 13px Consolas, monospace'; ctx.fillStyle = ni.accent;
        ctx.textAlign = 'left'; ctx.fillText(ni.icon + '  ' + ni.label, cx + 12, iy + 20);
        ctx.font = '12px Consolas, monospace'; ctx.fillStyle = 'rgba(200,190,220,0.82)';
        ctx.fillText(ni.text, cx + 12, iy + 38);
        ctx.restore();
      });

    // ════════════════════════════════════════════════════════════════════════
    // SECTION 4 — NEXUS / OVERLOAD
    // ════════════════════════════════════════════════════════════════════════
    } else if (s === 4) {
      let y = cy0 + 4;
      // Two top cards side by side
      const half3 = (cw - 12) / 2;
      // Nexus card
      ctx.save();
      ctx.fillStyle = 'rgba(0,20,40,0.65)';
      ctx.beginPath(); ctx.roundRect(cx, y, half3, 110, 6); ctx.fill();
      ctx.strokeStyle = '#00e6ff55'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(cx, y, half3, 110, 6); ctx.stroke();
      ctx.fillStyle = '#00e6ff'; ctx.fillRect(cx, y + 10, 3, 90);
      ctx.restore();
      _sTitle('⌬  NEXUS SYSTEMS', y + 14, '#00e6ff');
      _headline('THE ANCHORS', y + 32, '#aaddff', 15);
      _body('Stabilizers inside the corrupted grid. They hold fragments of the old network together — but NULL EDEN keeps attacking, rewriting, and overloading them.', cx + 10, y + 48, half3 - 16, 'rgba(180,220,250,0.85)', 11, 15);

      // Overload card
      const ox = cx + half3 + 12;
      ctx.save();
      ctx.fillStyle = 'rgba(22,0,0,0.65)';
      ctx.beginPath(); ctx.roundRect(ox, y, half3, 110, 6); ctx.fill();
      ctx.strokeStyle = '#ff444455'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(ox, y, half3, 110, 6); ctx.stroke();
      ctx.fillStyle = '#ff4444'; ctx.fillRect(ox, y + 10, 3, 90);
      ctx.restore();
      _sTitle('⌬  OVERLOAD', y + 14, '#ff4444');
      _headline('WHEN THE GRID PUSHES BACK', y + 32, '#ffaaaa', 13);
      _body("NULL EDEN's pressure response. As the survivor grows stronger, the grid increases resistance — more aggression, more instability, more danger.", ox + 10, y + 48, half3 - 16, 'rgba(250,185,185,0.85)', 11, 15);
      y += 120;

      // Overload rules
      _card(y, 30, '#ff4444');
      ctx.font = 'bold 11px Consolas, monospace'; ctx.fillStyle = '#ff8888'; ctx.textAlign = 'left';
      ctx.fillText('OVERLOAD MECHANICS', cx + 10, y + 20);
      y += 38;

      const olRules = [
        { text: 'Rises when Nexus slots are empty or enemies carry stolen cores.', accent: '#ff4444' },
        { text: 'At high Overload, enemy density and threat intensity escalate sharply.', accent: '#ff6666' },
        { text: 'Drains slowly when the Nexus is secured and cores are returned.', accent: '#7cff3c' },
        { text: 'Caps at 99% — the mission stays alive but brutal until resolved.', accent: '#fbbf24' },
      ];
      olRules.forEach((r, i) => {
        const ry = y + i * 42;
        if (ry + 38 > cBot) return;
        ctx.save();
        ctx.fillStyle = 'rgba(14,2,2,0.60)';
        ctx.beginPath(); ctx.roundRect(cx, ry, cw, 36, 4); ctx.fill();
        ctx.strokeStyle = r.accent + '33'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(cx, ry, cw, 36, 4); ctx.stroke();
        ctx.fillStyle = r.accent; ctx.fillRect(cx, ry + 6, 3, 24);
        ctx.font = '12px Consolas, monospace'; ctx.fillStyle = 'rgba(220,200,200,0.85)';
        ctx.textAlign = 'left'; ctx.fillText('▸  ' + r.text, cx + 12, ry + 22);
        ctx.restore();
      });

    // ════════════════════════════════════════════════════════════════════════
    // SECTION 5 — MODES
    // ════════════════════════════════════════════════════════════════════════
    } else if (s === 5) {
      let y = cy0 + 4;
      _card(y, 38, '#00e6ff');
      _sTitle('▸  OPERATIONAL MODES — SYSTEM LAYERS', y + 14, '#00e6ff');
      _headline('MODES', y + 30, '#aaddff', 14);
      y += 46;

      const modes = [
        {
          label: 'ACT 1 — FIRST BREACH',
          accent: '#b6ff8c',
          fill: 'rgba(4,20,4,0.60)',
          badge: 'AVAILABLE FROM START',
          text: 'The first test. Survive the grid, protect unstable Nexus systems, and prove you can resist NULL EDEN. Ends when the timer runs out or the mission is secured.',
        },
        {
          label: 'ENDLESS MODE',
          accent: '#00e6ff',
          fill: 'rgba(0,14,26,0.60)',
          badge: 'UNLOCKED: CLEAR ACT 1',
          text: 'The system stops pretending there is an exit. Waves escalate without limit, builds are stress-tested to their ceiling, and deeper systems reveal themselves.',
        },
        {
          label: 'CHAOS MODE',
          accent: '#ff4444',
          fill: 'rgba(20,0,0,0.60)',
          badge: 'TRIGGERS: DEEP ENDLESS',
          text: 'NULL EDEN becomes unstable. Chaos Laws reshape combat rules mid-run. The hardest test — survival here requires mastery of your build and fast adaptation.',
        },
        {
          label: 'NULL BREACH ARENA',
          accent: '#ff77d4',
          fill: 'rgba(18,0,14,0.60)',
          badge: 'ACCESSED: ENDLESS CHECKPOINTS',
          text: 'A combat gauntlet layer inside Endless. Boss rotations and relic encounters reward the deepest survivors with Null Fragments and permanent archive progress.',
        },
      ];

      const mH = 98, mGap = 6;
      modes.forEach((m, i) => {
        const my = y + i * (mH + mGap);
        if (my + mH > cBot) return;
        ctx.save();
        ctx.fillStyle = m.fill;
        ctx.beginPath(); ctx.roundRect(cx, my, cw, mH, 6); ctx.fill();
        ctx.strokeStyle = m.accent + '55'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(cx, my, cw, mH, 6); ctx.stroke();
        // Top accent band
        const band = ctx.createLinearGradient(cx, my, cx + cw, my);
        band.addColorStop(0, m.accent + '22'); band.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = band; ctx.fillRect(cx, my, cw, 28);
        ctx.fillStyle = m.accent; ctx.fillRect(cx, my + 8, 3, mH - 16);
        // Mode title
        ctx.font = 'bold 14px Consolas, monospace'; ctx.fillStyle = m.accent;
        ctx.shadowColor = m.accent; ctx.shadowBlur = 6;
        ctx.textAlign = 'left'; ctx.fillText(m.label, cx + 12, my + 19);
        ctx.shadowBlur = 0;
        // Badge
        ctx.font = 'bold 9px Consolas, monospace'; ctx.fillStyle = m.accent + 'aa';
        ctx.textAlign = 'right'; ctx.fillText('[  ' + m.badge + '  ]', cx + cw - 10, my + 19);
        // Separator
        ctx.strokeStyle = m.accent + '22'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cx + 8, my + 28); ctx.lineTo(cx + cw - 8, my + 28); ctx.stroke();
        // Description
        ctx.restore();
        _body(m.text, cx + 12, my + 44, cw - 24, 'rgba(200,215,235,0.85)', 12, 16);
      });

    // ════════════════════════════════════════════════════════════════════════
    // SECTION 6 — THREATS
    // ════════════════════════════════════════════════════════════════════════
    } else if (s === 6) {
      let y = cy0 + 4;
      _card(y, 52, '#fbbf24', 'rgba(18,12,0,0.60)');
      _sTitle('⚠  THREAT DATABASE — NULL EDEN HOSTILES', y + 14, '#fbbf24');
      _headline('NULL THREATS — THE ENEMIES', y + 32, '#ffe066', 16);
      ctx.font = '11px Consolas, monospace'; ctx.fillStyle = 'rgba(255,200,80,0.60)';
      ctx.textAlign = 'left';
      ctx.fillText('FRAGMENTS OF CORRUPTED DEFENSE SYSTEMS, FAILED EXPERIMENTS, AND HOSTILE ROUTINES', cx + 10, y + 46);
      y += 60;

      // Enemy type strip
      _card(y, 36, '#fbbf24');
      ctx.font = 'bold 11px Consolas, monospace'; ctx.fillStyle = '#ffd700'; ctx.textAlign = 'left';
      ctx.fillText('ENEMY TYPES: Standard Waves · Elite Units · Mini-Bosses · Arena Bosses · System Guardians', cx + 12, y + 22);
      y += 44;

      // Boss dossier header
      _card(y, 24, '#ff4444');
      ctx.font = 'bold 11px Consolas, monospace'; ctx.fillStyle = '#ff8888'; ctx.textAlign = 'left';
      ctx.fillText('⚠  SYSTEM GUARDIANS — BOSS ENCOUNTERS', cx + 10, y + 16);
      y += 30;

      const bossSprites = {
        'Cyber Serpent': this._cyberSerpentSprite,
        'Cyber Dragon':  this._cyberDragonSprite,
        'Double Demons': this._doubleDemonsSprite,
        'Titan':         this._titanSprite,
        'Bloodfang':     this._bloodfangSprite,
        'Annihilator':   this._annihilatorSprite,
      };
      const bosses = [
        { name: 'Cyber Serpent', accent: '#ff6600', lore: 'Flame trail. Tests sustained damage output and positioning.', type: 'MID-RUN BOSS' },
        { name: 'Cyber Dragon',  accent: '#00ccff', lore: 'Cryo storm. Forces constant movement and spatial awareness.', type: 'MID-RUN BOSS' },
        { name: 'Double Demons', accent: '#ff44aa', lore: 'Twin corruption protocol. Punishes single-target builds hard.', type: 'MID-RUN BOSS' },
        { name: 'Titan',         accent: '#aaddff', lore: 'Heavy impact wall. Maximum HP. Tests raw sustain capacity.', type: 'ARENA GUARDIAN' },
        { name: 'Bloodfang',     accent: '#ff3333', lore: 'Predator signal. Hyper-aggressive, fast, relentless pursuit.', type: 'ARENA GUARDIAN' },
        { name: 'Annihilator',   accent: '#cc88ff', lore: 'Termination protocol. Maximum threat output across all vectors.', type: 'ARENA GUARDIAN' },
      ];

      const bH = 52, bGap = 4, bPortW = 44, bPortH = 44;
      bosses.forEach((b, i) => {
        const by2 = y + i * (bH + bGap);
        if (by2 + bH > cBot) return;
        ctx.save();
        ctx.fillStyle = 'rgba(8,4,16,0.70)';
        ctx.beginPath(); ctx.roundRect(cx, by2, cw, bH, 4); ctx.fill();
        ctx.strokeStyle = b.accent + '44'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(cx, by2, cw, bH, 4); ctx.stroke();
        ctx.fillStyle = b.accent; ctx.fillRect(cx, by2 + 6, 3, bH - 12);
        // Boss portrait
        ctx.fillStyle = 'rgba(0,8,18,0.80)';
        ctx.beginPath(); ctx.roundRect(cx + 8, by2 + 4, bPortW, bPortH, 3); ctx.fill();
        ctx.strokeStyle = b.accent + '66'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(cx + 8, by2 + 4, bPortW, bPortH, 3); ctx.stroke();
        const bspr = bossSprites[b.name];
        if (bspr && bspr.complete && bspr.naturalWidth > 0) {
          ctx.save();
          ctx.beginPath(); ctx.roundRect(cx + 8, by2 + 4, bPortW, bPortH, 3); ctx.clip();
          const sc = Math.max(bPortW / bspr.naturalWidth, bPortH / bspr.naturalHeight) * 1.1;
          const dw = bspr.naturalWidth * sc, dh = bspr.naturalHeight * sc;
          ctx.drawImage(bspr, cx + 8 + (bPortW - dw) / 2, by2 + 4 + (bPortH - dh) / 2, dw, dh);
          ctx.restore();
        } else {
          ctx.font = 'bold 16px Consolas, monospace'; ctx.fillStyle = b.accent;
          ctx.textAlign = 'center'; ctx.fillText('⚠', cx + 8 + bPortW / 2, by2 + 4 + bPortH / 2 + 6);
        }
        // Boss name + type + lore
        const btx = cx + 8 + bPortW + 10;
        ctx.font = 'bold 13px Consolas, monospace'; ctx.fillStyle = b.accent;
        ctx.shadowColor = b.accent; ctx.shadowBlur = 5;
        ctx.textAlign = 'left'; ctx.fillText(b.name.toUpperCase(), btx, by2 + 18);
        ctx.shadowBlur = 0;
        ctx.font = 'bold 9px Consolas, monospace'; ctx.fillStyle = b.accent + 'aa';
        ctx.fillText('[  ' + b.type + '  ]', btx, by2 + 30);
        ctx.font = '11px Consolas, monospace'; ctx.fillStyle = 'rgba(200,200,220,0.80)';
        ctx.fillText(b.lore, btx, by2 + 44);
        ctx.restore();
      });
    }

    // ── Back button ───────────────────────────────────────────────────────────
    const bbW = 160, bbH = 36;
    const bbX = Math.round(WIDTH / 2 - bbW / 2);
    const bbY = py + ph - 46;
    this._premiumButton(ctx, bbX, bbY, bbW, bbH, '◄  BACK', false, '#00e6ff');

    // Age badge + back hint
    this._drawAgeBadge(ctx, px + 8, py + ph - 44, 32);
    ctx.font = '10px Consolas, monospace'; ctx.fillStyle = 'rgba(100,160,200,0.45)';
    ctx.textAlign = 'right';
    ctx.fillText('↑↓ Navigate · ESC Back', px + pw - 10, py + ph - 28);
    ctx.textAlign = 'left';
  }

  // Compact content-rating badge — rounded square with "12+" (replaces the old plain-text notice).
  _drawAgeBadge(ctx, x, y, size = 38) {
    ctx.save();
    ctx.fillStyle = 'rgba(8,16,28,0.85)';
    ctx.strokeStyle = '#7fd0ff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(x, y, size, size, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#dff2ff';
    ctx.font = 'bold ' + Math.round(size * 0.42) + 'px Consolas, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('12+', x + size / 2, y + size / 2 + 1);
    ctx.restore();
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  }

  // Controller-support badge + live status (right-aligned at x,y). Small, premium, unobtrusive.
  _drawControllerBadge(ctx, x, y) {
    ctx.save();
    ctx.textAlign = 'right';
    ctx.font = 'bold 12px "Segoe UI Emoji", Consolas, monospace';
    ctx.fillStyle = 'rgba(190,210,230,0.72)';
    ctx.fillText('🎮 Controller Supported · Xbox · PS5 · PS4 · PC', x, y);
    if (this._controllerConnected) {
      ctx.fillStyle = '#7CFF8A';
      ctx.fillText('● Controller Connected', x, y + 16);
    } else {
      ctx.fillStyle = 'rgba(150,170,190,0.55)';
      ctx.fillText('Press any controller button to activate', x, y + 16);
    }
    ctx.restore();
    ctx.textAlign = 'left';
  }

  _drawInstructionsScreen(ctx) {
    this._drawBackground(ctx);
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const pw = 1140, ph = 580;
    const px = Math.round((WIDTH  - pw) / 2);
    const py = Math.round((HEIGHT - ph) / 2);

    // Dark-glass panel with vertical gradient + dual cyan/magenta neon frame.
    const ig = ctx.createLinearGradient(0, py, 0, py + ph);
    ig.addColorStop(0, 'rgba(6,18,34,0.97)'); ig.addColorStop(1, 'rgba(2,6,14,0.98)');
    ctx.fillStyle = ig;
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = CYAN; ctx.lineWidth = 2;
    ctx.strokeRect(px, py, pw, ph);
    ctx.strokeStyle = 'rgba(255,77,210,0.30)'; ctx.lineWidth = 1;
    ctx.strokeRect(px + 5, py + 5, pw - 10, ph - 10);

    // Title with neon glow
    ctx.textAlign = 'center';
    ctx.save();
    ctx.font      = 'bold 38px Consolas, monospace';
    ctx.shadowColor = CYAN; ctx.shadowBlur = 16;
    ctx.fillStyle = CYAN;
    ctx.fillText('HOW TO PLAY', WIDTH / 2, py + 46);
    ctx.restore();

    // Gradient separator
    const isg = ctx.createLinearGradient(px + 50, 0, px + pw - 50, 0);
    isg.addColorStop(0, 'rgba(0,230,255,0)'); isg.addColorStop(0.5, 'rgba(255,77,210,0.55)'); isg.addColorStop(1, 'rgba(0,230,255,0)');
    ctx.strokeStyle = isg; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(px + 50, py + 58); ctx.lineTo(px + pw - 50, py + 58); ctx.stroke();

    ctx.textAlign = 'left';
    const lx  = px + 28;
    const lh  = 14;
    let   cy  = py + 80;

    // Left content sub-panel (dark glass) behind the text column — premium two-column feel.
    ctx.fillStyle = 'rgba(0,12,26,0.55)';
    ctx.fillRect(px + 16, py + 66, 552, ph - 92);
    ctx.strokeStyle = 'rgba(0,230,255,0.12)'; ctx.lineWidth = 1;
    ctx.strokeRect(px + 16, py + 66, 552, ph - 92);

    // Premium section header — magenta accent block + neon label + underline rule.
    const header = (label) => {
      ctx.fillStyle = '#ff4dd2';
      ctx.fillRect(lx, cy - 9, 4, 13);
      ctx.font      = 'bold 15px Consolas, monospace';
      ctx.fillStyle = CYAN;
      ctx.fillText(label, lx + 12, cy);
      ctx.strokeStyle = 'rgba(0,230,255,0.30)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(lx + 12, cy + 7); ctx.lineTo(lx + 524, cy + 7); ctx.stroke();
      cy += 20;
    };
    const bullet = (text, color = WHITE) => {
      ctx.font = '13px Consolas, monospace'; ctx.fillStyle = color;
      ctx.fillText('• ' + text, lx + 6, cy); cy += lh;
    };

    // ── OBJECTIVE ──────────────────────────────────────────────
    header('OBJECTIVE — SURVIVE NULL EDEN');
    bullet('Choose a survivor and fight through escalating cyber-waves.');
    bullet('Collect XP, upgrade cards, credits, and dropped resources.');
    bullet('Build your run through weapons, abilities, relics, and market choices.');
    bullet('Push beyond Act 1 into Endless survival and deeper NULL EDEN systems.');
    cy += 5;

    // ── CONTROLS ───────────────────────────────────────────────
    // ── CONTROLS — keyboard + controller (auto-detected USB/Bluetooth: Xbox/PS/PC) ──
    header('CONTROLS — KEYBOARD & CONTROLLER');
    const colA = lx + 6, colK = lx + 132, colX = lx + 268, colP = lx + 396;
    ctx.font = 'bold 10px Consolas, monospace'; ctx.fillStyle = CYAN;
    ctx.fillText('ACTION', colA, cy); ctx.fillText('KEYBOARD', colK, cy);
    ctx.fillText('XBOX / PC', colX, cy); ctx.fillText('PLAYSTATION', colP, cy);
    cy += 12;
    const ctrlRows = [
      ['Move',      'WASD / Arrows', 'L-Stick/D-Pad', 'L-Stick/D-Pad'],
      ['Confirm',   'Enter',         'A',             '✕ Cross'],
      ['Back',      'ESC',           'B',             '○ Circle'],
      ['Pause',     'ESC',           'Menu / Start',  'Options'],
      ['Q ability', 'Q',             'LB',            'L1'],
      ['E ability', 'E',             'RB',            'R1'],
      ['Dash',      'SHIFT',         'B / RT',        'Circle / R2'],
      ['Ultimate',  'SPACE',         'Y',             '△ Triangle'],
    ];
    ctrlRows.forEach(([a, k, xb, ps]) => {
      ctx.font = 'bold 11px Consolas, monospace'; ctx.fillStyle = YELLOW; ctx.fillText(a, colA, cy);
      ctx.font = '11px Consolas, monospace'; ctx.fillStyle = WHITE;
      ctx.fillText(k, colK, cy); ctx.fillText(xb, colX, cy); ctx.fillText(ps, colP, cy);
      cy += 13;
    });
    cy += 4;

    // ── COMBAT & BUILDS ────────────────────────────────────────
    header('COMBAT & BUILDS');
    bullet('Level up to choose upgrade and mastery cards for your build.');
    bullet('Weapons, abilities, and passives stack into powerful combinations.');
    bullet('Mana fuels your Ultimate — pickups and credits help you recover.');
    bullet('Phenix Revive triggers when HP hits 0 — use the extra life wisely.');
    cy += 5;

    // ── PROGRESSION & NULL RELICS ─────────────────────────────
    header('PROGRESSION & NULL RELICS');
    bullet('Runs feed permanent progression: levels, ranks, unlocks, and achievements.');
    bullet('Null Relics expand long-term goals and reward deeper survival.');
    bullet('Stronger runs unlock characters, secrets, lore, and archive entries.', '#c8a8ff');
    cy += 5;

    // ── ENDLESS · CHAOS · BLACKNET ─────────────────────────────
    header('ENDLESS · CHAOS MODE · BLACKNET');
    bullet('Clear Act 1 to push into Endless Mode — deeper and more dangerous.');
    bullet('Survive long enough and the run escalates toward Chaos Mode.');
    bullet('Blacknet Market choices can reshape your build between danger spikes.', '#b6ff8c');

    // ── ANIMATED TUTORIAL PANELS (right column) ─────────────────
    const PANEL_DURATION = 4.0;
    const now      = Date.now() / 1000;
    const panelIdx = Math.floor(now / PANEL_DURATION) % 4;
    const t        = (now % PANEL_DURATION) / PANEL_DURATION;

    const tpX  = px + 596;
    const tpY  = py + 68;
    const tpW  = pw - 596 - 24;
    const tpH  = 415;
    const tpCX = tpX + tpW / 2;

    // Vertical divider
    ctx.strokeStyle = 'rgba(0,230,255,0.18)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px + 584, py + 65);
    ctx.lineTo(px + 584, py + ph - 55);
    ctx.stroke();

    // Tutorial "help-monitor" — dark-glass screen with scanlines + dual neon frame + corner ticks.
    const mg = ctx.createLinearGradient(0, tpY, 0, tpY + tpH);
    mg.addColorStop(0, 'rgba(2,12,24,0.9)'); mg.addColorStop(1, 'rgba(0,4,12,0.92)');
    ctx.fillStyle = mg;
    ctx.fillRect(tpX, tpY, tpW, tpH);
    ctx.save();
    ctx.beginPath(); ctx.rect(tpX, tpY, tpW, tpH); ctx.clip();
    ctx.strokeStyle = 'rgba(0,230,255,0.05)'; ctx.lineWidth = 1;
    for (let sy = tpY + 3; sy < tpY + tpH; sy += 4) { ctx.beginPath(); ctx.moveTo(tpX, sy); ctx.lineTo(tpX + tpW, sy); ctx.stroke(); }
    ctx.restore();
    ctx.strokeStyle = 'rgba(0,200,255,0.45)'; ctx.lineWidth = 1.5;
    ctx.strokeRect(tpX, tpY, tpW, tpH);
    ctx.strokeStyle = 'rgba(255,77,210,0.25)'; ctx.lineWidth = 1;
    ctx.strokeRect(tpX + 4, tpY + 4, tpW - 8, tpH - 8);
    const tc = 14;
    ctx.strokeStyle = '#ff4dd2'; ctx.lineWidth = 2;
    [[tpX, tpY, tc, 0, 0, tc], [tpX + tpW, tpY, -tc, 0, 0, tc],
     [tpX, tpY + tpH, tc, 0, 0, -tc], [tpX + tpW, tpY + tpH, -tc, 0, 0, -tc]].forEach(([ox, oy, hx, hy, vx, vy]) => {
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + hx, oy + hy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + vx, oy + vy); ctx.stroke();
    });

    // Panel title
    const panelTitles = [
      'PHENIX REVIVE',
      'NULL RELICS',
      'CHAOS MODE',
      'BLACKNET MARKET',
    ];
    ctx.font      = 'bold 14px Consolas, monospace';
    ctx.fillStyle = CYAN;
    ctx.textAlign = 'center';
    ctx.fillText(panelTitles[panelIdx], tpCX, tpY + 26);

    this._drawTutorialPanel(ctx, panelIdx, t, tpX, tpY, tpW, tpH);

    // Dot indicators (4 panels)
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i === panelIdx ? CYAN : 'rgba(0,200,255,0.25)';
      ctx.beginPath();
      ctx.arc(tpCX - 24 + i * 16, tpY + tpH + 16, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── BACK button ────────────────────────────────────────────
    const bw = 160, bh = 40;
    const bx = Math.round(WIDTH / 2 - bw / 2);
    const by = py + ph - 52;

    ctx.fillStyle   = '#0a1820';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = CYAN; ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, bw, bh);
    ctx.font      = 'bold 14px Consolas, monospace';
    ctx.fillStyle = CYAN;
    ctx.textAlign = 'center';
    ctx.fillText('◄  BACK', bx + bw / 2, by + 26);

    // ── Compact content-rating badge (below the panel, left) — replaces the old plain-text notice ──
    this._drawAgeBadge(ctx, px + 6, py + ph + 12, 34);

    ctx.textAlign = 'left';
  }

  _drawTutorialPanel(ctx, idx, t, tpX, tpY, tpW, tpH) {
    const cx   = tpX + tpW / 2;
    const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 600);

    ctx.save();
    ctx.textAlign = 'center';

    // Card draw helper — draws a titled info card with bullet lines
    const drawCard = (icon, title, lines, iconColor, y0) => {
      const cardH = 26 + lines.length * 22 + 14;
      const cardX = tpX + 14;
      const cardW = tpW - 28;

      // Card glass background
      ctx.fillStyle = 'rgba(0,12,28,0.70)';
      ctx.fillRect(cardX, y0, cardW, cardH);

      // Pulsing neon border
      ctx.strokeStyle = `rgba(0,${Math.round(180 + 50 * pulse)},255,${0.35 + 0.25 * pulse})`;
      ctx.lineWidth = 1.2;
      ctx.strokeRect(cardX, y0, cardW, cardH);

      // Left accent strip
      ctx.fillStyle = iconColor;
      ctx.fillRect(cardX, y0, 3, cardH);

      // Icon + title
      ctx.font = 'bold 13px Consolas, monospace';
      ctx.fillStyle = iconColor;
      ctx.shadowColor = iconColor; ctx.shadowBlur = 8;
      ctx.textAlign = 'left';
      ctx.fillText(icon + '  ' + title, cardX + 12, y0 + 18);
      ctx.shadowBlur = 0;

      // Bullets
      ctx.font = '11px Consolas, monospace';
      ctx.fillStyle = 'rgba(200,225,255,0.90)';
      lines.forEach((ln, i) => {
        ctx.fillText('▸  ' + ln, cardX + 14, y0 + 32 + i * 22);
      });
      ctx.textAlign = 'center';
    };

    const gapY = 8;
    const topY = tpY + 36;

    switch (idx) {
      case 0: { // PHENIX REVIVE
        const burstA = t > 0.35 && t < 0.75 ? Math.max(0, 1 - Math.abs(t - 0.55) / 0.2) : 0;
        // Animated HP bar
        const barW = tpW - 60; const barX = tpX + 30; const barY = topY + 2;
        const hpPct = t < 0.4 ? 1 - t / 0.4 * 0.98 : t > 0.7 ? (t - 0.7) / 0.3 * 0.45 : 0.02;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(barX, barY, barW, 18);
        ctx.fillStyle = hpPct > 0.5 ? '#30e060' : hpPct > 0.2 ? '#e08830' : '#e03030';
        ctx.fillRect(barX, barY, Math.round(barW * hpPct), 18);
        ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barW, 18);
        ctx.font = 'bold 10px Consolas, monospace'; ctx.fillStyle = WHITE;
        ctx.textAlign = 'left'; ctx.fillText('HP', barX - 22, barY + 13);
        ctx.textAlign = 'center';
        if (burstA > 0) {
          ctx.save(); ctx.globalAlpha = burstA * 0.7;
          ctx.fillStyle = ORANGE;
          ctx.beginPath(); ctx.arc(cx, barY + 50, burstA * 55, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
          ctx.fillStyle = YELLOW; ctx.font = 'bold 15px Consolas, monospace';
          ctx.shadowColor = ORANGE; ctx.shadowBlur = 12;
          ctx.fillText('❆ PHENIX REVIVE ❆', cx, barY + 54);
          ctx.shadowBlur = 0; ctx.font = '11px Consolas, monospace';
        }
        const cardY0 = topY + 82;
        drawCard('⚡', 'PHENIX REVIVE', [
          'HP reaches 0 — revive triggers automatically',
          'Multiple revive charges available per run',
          'Use the second chance wisely — stay mobile',
        ], ORANGE, cardY0);
        break;
      }

      case 1: { // NULL RELICS
        // Animated orbiting relic dots
        const orbitR = 38; const orbitCY = topY + 50;
        const numRelics = 5;
        for (let i = 0; i < numRelics; i++) {
          const angle = (i / numRelics) * Math.PI * 2 + t * Math.PI * 2 * 0.4;
          const rx = cx + Math.cos(angle) * orbitR;
          const ry = orbitCY + Math.sin(angle) * orbitR * 0.45;
          const glow = 0.55 + 0.45 * Math.sin(angle + t * 5);
          ctx.save();
          ctx.fillStyle = `rgba(${Math.round(140 + 80*glow)},0,255,${0.6 + 0.4 * glow})`;
          ctx.shadowColor = '#c840ff'; ctx.shadowBlur = 8 * glow;
          ctx.beginPath(); ctx.arc(rx, ry, 5 + 2 * glow, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
        // Center glyph
        ctx.font = 'bold 22px Consolas, monospace';
        ctx.fillStyle = '#c840ff'; ctx.shadowColor = '#c840ff'; ctx.shadowBlur = 14;
        ctx.fillText('◈', cx, orbitCY + 8);
        ctx.shadowBlur = 0;
        drawCard('◈', 'NULL RELICS', [
          'Permanent discovery layer — survives between runs',
          'Reward deeper survival and rare achievements',
          'Inspect from Relics / Archive in the main menu',
        ], '#c840ff', topY + 108);
        break;
      }

      case 2: { // CHAOS MODE
        // Animated escalating bar
        const barW2 = tpW - 60; const barX2 = tpX + 30; const barY2 = topY + 4;
        const fillPct = 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 - Math.PI / 2));
        const barCol = fillPct > 0.7 ? RED : fillPct > 0.45 ? ORANGE : YELLOW;
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(barX2, barY2, barW2, 18);
        ctx.fillStyle = barCol; ctx.fillRect(barX2, barY2, Math.round(barW2 * fillPct), 18);
        ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1;
        ctx.strokeRect(barX2, barY2, barW2, 18);
        ctx.font = 'bold 10px Consolas, monospace'; ctx.textAlign = 'left';
        ctx.fillStyle = barCol; ctx.fillText('CHAOS', barX2, barY2 - 4);
        ctx.textAlign = 'right'; ctx.fillText(`${Math.round(fillPct * 100)}%`, barX2 + barW2, barY2 - 4);
        ctx.textAlign = 'center';
        const label = fillPct > 0.7 ? '▲ CHAOS MODE INCOMING' : fillPct > 0.45 ? '◆ Pressure escalating' : '◇ Survive deeper...';
        ctx.font = '11px Consolas, monospace'; ctx.fillStyle = barCol;
        ctx.fillText(label, cx, barY2 + 34);
        drawCard('◆', 'CHAOS MODE', [
          'Survive long enough — the run escalates',
          'Stronger enemies, higher pressure, greater reward',
          'Premium endgame — only the prepared reach it',
        ], RED, topY + 80);
        break;
      }

      case 3: { // BLACKNET MARKET
        // Animated credit/market icons
        const iconY = topY + 55;
        const items = ['[UPGRADE]', '[PASSIVE]', '[RELIC]', '[UTILITY]'];
        const spacing = (tpW - 30) / items.length;
        items.forEach((label, i) => {
          const ix = tpX + 15 + spacing * i + spacing / 2;
          const highlightI = Math.floor(t * items.length * 1.5) % items.length;
          const isActive = i === highlightI;
          ctx.save();
          if (isActive) {
            ctx.shadowColor = '#00e5ff'; ctx.shadowBlur = 10;
          }
          ctx.fillStyle = isActive ? CYAN : 'rgba(0,180,220,0.35)';
          ctx.strokeStyle = isActive ? CYAN : 'rgba(0,180,220,0.25)';
          ctx.lineWidth = 1;
          const bx = ix - spacing * 0.4; const bw = spacing * 0.8; const bh = 22;
          ctx.fillRect(bx, iconY - 14, bw, bh);
          ctx.strokeRect(bx, iconY - 14, bw, bh);
          ctx.restore();
          ctx.font = `${isActive ? 'bold ' : ''}10px Consolas, monospace`;
          ctx.fillStyle = isActive ? '#001822' : 'rgba(0,200,230,0.7)';
          ctx.fillText(label, ix, iconY + 2);
        });
        ctx.font = '11px Consolas, monospace'; ctx.fillStyle = 'rgba(180,220,255,0.7)';
        ctx.fillText('Credits unlock build options between danger spikes', cx, iconY + 34);
        drawCard('▣', 'BLACKNET MARKET', [
          'Spend credits on upgrades, passives, and utilities',
          'Risk / reward decisions that shape every run',
          'Explore build options — some unlock deeper systems',
        ], '#00e5ff', topY + 102);
        break;
      }
    }

    ctx.restore();
  }

  _drawCreditsScreen(ctx) {
    this._drawBackground(ctx);
    ctx.fillStyle = 'rgba(0,0,0,0.84)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Outer panel
    const pw = 780, ph = 460;
    const px = WIDTH  / 2 - pw / 2;   // 250
    const py = HEIGHT / 2 - ph / 2 - 10; // 115

    // Dark-glass panel with a subtle vertical gradient (deep cyber blue → near-black).
    const pg = ctx.createLinearGradient(0, py, 0, py + ph);
    pg.addColorStop(0, 'rgba(6,18,34,0.97)'); pg.addColorStop(1, 'rgba(2,6,14,0.98)');
    ctx.fillStyle = pg;
    ctx.fillRect(px, py, pw, ph);
    // Dual neon frame: cyan outer + magenta accent inner — premium cyber border.
    ctx.strokeStyle = CYAN; ctx.lineWidth = 2;
    ctx.strokeRect(px, py, pw, ph);
    ctx.strokeStyle = 'rgba(255,77,210,0.35)'; ctx.lineWidth = 1;
    ctx.strokeRect(px + 5, py + 5, pw - 10, ph - 10);

    ctx.textAlign = 'center';

    // Title with neon glow
    ctx.save();
    ctx.font      = 'bold 44px Consolas, monospace';
    ctx.shadowColor = CYAN; ctx.shadowBlur = 18;
    ctx.fillStyle = CYAN;
    ctx.fillText('CREDITS', WIDTH / 2, py + 52);
    ctx.restore();

    // Gradient separator (cyan → magenta → cyan)
    const sg = ctx.createLinearGradient(px + 50, 0, px + pw - 50, 0);
    sg.addColorStop(0, 'rgba(0,230,255,0)'); sg.addColorStop(0.5, 'rgba(255,77,210,0.6)'); sg.addColorStop(1, 'rgba(0,230,255,0)');
    ctx.strokeStyle = sg; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(px + 50, py + 70); ctx.lineTo(px + pw - 50, py + 70); ctx.stroke();

    // ── Two creator cards ───────────────────────────────────────────────────
    const cardW = 340, cardH = 300, cardY = py + 82;
    const cards = [
      { x: px + 25,          label: 'CREATED BY',      name: 'InkSpireM Visuals', img: this._creditImgInk   },
      { x: px + 25 + cardW + 25, label: 'MUSIC', name: 'TSALI',
        tracks: ['Menu Theme: "HOPE" by TSALI', 'Gameplay Theme: "PHENIX OVERDRIVE" by TSALI'],
        img: this._creditImgTsali },
    ];

    for (const card of cards) {
      const cx = card.x, cy = cardY;

      // Dark-glass card with a vertical gradient + faint scanlines (premium cyber monitor look).
      const cg = ctx.createLinearGradient(0, cy, 0, cy + cardH);
      cg.addColorStop(0, 'rgba(8,22,40,0.95)'); cg.addColorStop(1, 'rgba(2,8,18,0.95)');
      ctx.fillStyle = cg;
      ctx.fillRect(cx, cy, cardW, cardH);
      ctx.save();
      ctx.beginPath(); ctx.rect(cx, cy, cardW, cardH); ctx.clip();
      ctx.strokeStyle = 'rgba(0,230,255,0.05)'; ctx.lineWidth = 1;
      for (let sy = cy + 3; sy < cy + cardH; sy += 4) { ctx.beginPath(); ctx.moveTo(cx, sy); ctx.lineTo(cx + cardW, sy); ctx.stroke(); }
      ctx.restore();
      // Dual border: cyan outer + magenta accent inner.
      ctx.strokeStyle = 'rgba(0,230,255,0.6)'; ctx.lineWidth = 1.5;
      ctx.strokeRect(cx, cy, cardW, cardH);
      ctx.strokeStyle = 'rgba(255,77,210,0.30)'; ctx.lineWidth = 1;
      ctx.strokeRect(cx + 4, cy + 4, cardW - 8, cardH - 8);

      const midX = cx + cardW / 2;

      // Section label — stronger, glowing header
      ctx.save();
      ctx.font      = 'bold 15px Consolas, monospace';
      ctx.shadowColor = 'rgba(255,210,60,0.7)'; ctx.shadowBlur = 8;
      ctx.fillStyle = YELLOW;
      ctx.fillText(card.label, midX, cy + 28);
      ctx.restore();

      // Creator name (or track list for music card)
      if (card.tracks) {
        ctx.font      = '13px Consolas, monospace';
        ctx.fillStyle = CYAN;
        ctx.fillText(card.tracks[0], midX, cy + 44);
        ctx.fillStyle = YELLOW;
        ctx.fillText(card.tracks[1], midX, cy + 62);
      } else {
        ctx.font      = 'bold 18px Consolas, monospace';
        ctx.fillStyle = WHITE;
        ctx.fillText(card.name, midX, cy + 50);
      }

      // Photo area (pushed down slightly for music card to give track text room)
      const fw = 150, fh = 160;
      const fx = cx + (cardW - fw) / 2;
      const fy = card.tracks ? cy + 78 : cy + 65;

      // Draw photo or placeholder
      let photoDrawn = false;
      const img = card.img;
      if (img && img.complete && img.naturalWidth > 0) {
        const scale = Math.max(fw / img.naturalWidth, fh / img.naturalHeight);
        const sw = fw / scale, sh = fh / scale;
        const sx = (img.naturalWidth  - sw) / 2;
        const sy = (img.naturalHeight - sh) / 2;
        ctx.save();
        ctx.beginPath();
        ctx.rect(fx, fy, fw, fh);
        ctx.clip();
        ctx.drawImage(img, sx, sy, sw, sh, fx, fy, fw, fh);
        ctx.restore();
        photoDrawn = true;
      }

      if (!photoDrawn) {
        ctx.fillStyle = 'rgba(0,20,40,0.8)';
        ctx.fillRect(fx, fy, fw, fh);
        ctx.font      = '13px Consolas, monospace';
        ctx.fillStyle = 'rgba(0,200,255,0.4)';
        ctx.fillText('[ no photo ]', midX, fy + fh / 2 + 5);
      }

      // Neon frame around photo
      ctx.strokeStyle = CYAN; ctx.lineWidth = 2;
      ctx.strokeRect(fx, fy, fw, fh);
      // Corner L-accents (12px)
      const ca = 12;
      ctx.strokeStyle = YELLOW; ctx.lineWidth = 2;
      [[fx, fy, ca, 0, 0, ca], [fx+fw, fy, -ca, 0, 0, ca],
       [fx, fy+fh, ca, 0, 0, -ca], [fx+fw, fy+fh, -ca, 0, 0, -ca]].forEach(([ox, oy, hx, hy, vx, vy]) => {
        ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox+hx, oy+hy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox+vx, oy+vy); ctx.stroke();
      });

      // Name below photo
      ctx.font      = '13px Consolas, monospace';
      ctx.fillStyle = CYAN;
      ctx.fillText(card.name, midX, fy + fh + 22);

    }

    // ── BACK button ──────────────────────────────────────────────────────────
    const bw = 220, bh = 46;
    const bx = WIDTH / 2 - bw / 2;
    const by = py + ph - 60;
    ctx.fillStyle = 'rgba(0,230,255,0.08)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = CYAN; ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bw, bh);
    ctx.font      = 'bold 21px Consolas, monospace';
    ctx.fillStyle = CYAN;
    ctx.fillText('[ BACK ]', WIDTH / 2, by + 30);

    // ESC hint
    ctx.font      = '13px Consolas, monospace';
    ctx.fillStyle = 'rgba(180,180,180,0.45)';
    ctx.fillText('ESC = Return to Menu', WIDTH / 2, HEIGHT - 16);

    ctx.textAlign = 'left';
  }

  // ─── Acid Rain weather event ──────────────────────────────────────────────


  // ─── Frozen Sleet Storm — Chaos Mode weather event ────────────────────────
  // Chaos-only. Never triggers in Act 1, shop, character select, or non-Chaos states.
  // Phase 1 ONSET (0.6s): frost grows inward from screen edges.
  // Phase 2 HOLD (5.5s):  full freeze overlay, player movement disabled.
  // Phase 3 RECOVERY (1.0s): frost melts outward, player regains control.
  _updateFrozenSleet(dt) {
    // Gate: only in active Chaos Mode gameplay, not during menus/gameover/victory
    if (!this._chaosMode || this.gameOver || this.victory) {
      // Drain timer but do not trigger
      if (this._frozenSleetTimer > 0) this._frozenSleetTimer -= dt;
      return;
    }
    // Update active event
    if (this._frozenSleet) {
      const fs = this._frozenSleet;
      fs.t += dt;
      // Advance sleet particles
      for (const p of fs.particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.y > 720) { p.y = -8; p.x = Math.random() * 1280; }
      }
      const ONSET_DUR    = 0.65;
      const HOLD_DUR     = 5.5;
      const RECOVERY_DUR = 1.1;
      if (fs.phase === 'onset' && fs.t >= ONSET_DUR) {
        fs.phase = 'hold';
        fs.t     = 0;
        this.triggerAnnouncement('❄ FROZEN SLEET STORM ❄', '#88ddff');
      } else if (fs.phase === 'hold' && fs.t >= HOLD_DUR) {
        fs.phase = 'recovery';
        fs.t     = 0;
      } else if (fs.phase === 'recovery' && fs.t >= RECOVERY_DUR) {
        this._frozenSleet      = null;
        this._frozenSleetTimer = 110 + Math.random() * 30; // next event in ~110-140s
        return;
      }
      return;
    }
    // Count down to next trigger
    this._frozenSleetTimer -= dt;
    if (this._frozenSleetTimer > 0) return;
    // Spawn the event — build particles
    const particles = [];
    for (let i = 0; i < 90; i++) {
      particles.push({
        x: Math.random() * 1280, y: Math.random() * 720,
        vx: (Math.random() - 0.5) * 28,
        vy: 90 + Math.random() * 120,
        len: 5 + Math.random() * 12,
        alpha: 0.4 + Math.random() * 0.5,
        w: 1 + Math.random() * 1.5,
      });
    }
    this._frozenSleet = { phase: 'onset', t: 0, particles };
    this.audio?.playIceSweep?.();   // ice sweep replaces generic warning for sleet storm
  }

  _drawFrozenSleet(ctx) {
    if (!this._frozenSleet) return;
    const fs = this._frozenSleet;
    const W  = 1280, H = 720;
    const CX = W / 2, CY = H / 2;

    const ONSET_DUR    = 0.65;
    const HOLD_DUR     = 5.5;
    const RECOVERY_DUR = 1.1;

    // Progress within each phase (0→1)
    let freezeProgress = 0; // 0 = no frost, 1 = full frost
    if (fs.phase === 'onset') {
      freezeProgress = fs.t / ONSET_DUR;
    } else if (fs.phase === 'hold') {
      freezeProgress = 1.0;
    } else if (fs.phase === 'recovery') {
      freezeProgress = 1.0 - fs.t / RECOVERY_DUR;
    }
    freezeProgress = Math.max(0, Math.min(1, freezeProgress));

    // The "unfrozen center radius" shrinks to 0 as freezeProgress increases.
    // At fp=0: inner radius = max (no frost). At fp=1: inner radius = 0 (full coverage).
    const maxInner = Math.sqrt(CX * CX + CY * CY) * 1.12; // diagonal = full screen clear
    const innerR   = maxInner * (1 - freezeProgress);

    ctx.save();

    // ── Layer 1: Dark navy base via radial gradient from edges inward ─────────
    const grad = ctx.createRadialGradient(CX, CY, Math.max(0, innerR - 30), CX, CY, maxInner * 1.1);
    grad.addColorStop(0,   'rgba(0,0,0,0)');
    grad.addColorStop(0.25, 'rgba(2,6,22,0.55)');
    grad.addColorStop(0.55, 'rgba(4,12,38,0.80)');
    grad.addColorStop(0.80, 'rgba(3,15,50,0.92)');
    grad.addColorStop(1,   'rgba(2,8,28,0.97)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // ── Layer 2: Cyan icy glow at the freeze frontier ─────────────────────────
    if (freezeProgress > 0.05 && freezeProgress < 0.99) {
      const glowR = innerR + 18;
      const glowG = ctx.createRadialGradient(CX, CY, Math.max(0, innerR - 10), CX, CY, glowR + 25);
      glowG.addColorStop(0,   'rgba(0,0,0,0)');
      glowG.addColorStop(0.3, 'rgba(80,220,255,0.18)');
      glowG.addColorStop(0.7, 'rgba(140,230,255,0.35)');
      glowG.addColorStop(1,   'rgba(80,200,240,0.0)');
      ctx.fillStyle = glowG;
      ctx.fillRect(0, 0, W, H);
    }

    // ── Layer 3: Frost crystal dendrite lines radiating from corners ──────────
    const crystalAlpha = freezeProgress * 0.75;
    if (crystalAlpha > 0.02) {
      ctx.globalAlpha = crystalAlpha;
      ctx.strokeStyle = '#a8e8ff';
      ctx.lineWidth   = 0.8;
      const corners = [[0,0],[W,0],[0,H],[W,H],[CX,0],[CX,H],[0,CY],[W,CY]];
      const rng = (seed) => {
        // Deterministic pseudo-random based on seed to avoid flicker
        const x = Math.sin(seed * 127.1) * 43758.5453;
        return x - Math.floor(x);
      };
      for (let ci = 0; ci < corners.length; ci++) {
        const [ox, oy] = corners[ci];
        // Number of dendrite branches scales with freeze progress
        const branches = Math.floor(3 + freezeProgress * 5);
        for (let b = 0; b < branches; b++) {
          const baseAngle = Math.atan2(CY - oy, CX - ox);
          const spread    = (Math.PI / 3);
          const angle     = baseAngle + (rng(ci * 17 + b) - 0.5) * spread;
          const length    = (60 + rng(ci * 31 + b) * 100) * freezeProgress;
          ctx.beginPath();
          ctx.moveTo(ox, oy);
          const ex = ox + Math.cos(angle) * length;
          const ey = oy + Math.sin(angle) * length;
          ctx.lineTo(ex, ey);
          ctx.stroke();
          // Sub-branches
          const sub = Math.floor(2 + rng(ci * 7 + b + 1) * 3);
          for (let s = 0; s < sub; s++) {
            const t       = 0.3 + rng(ci * 11 + b * 5 + s) * 0.5;
            const bx      = ox + Math.cos(angle) * length * t;
            const by      = oy + Math.sin(angle) * length * t;
            const subLen  = length * (0.25 + rng(ci * 13 + s) * 0.2);
            const subAng  = angle + (rng(ci * 19 + s + b) - 0.5) * (Math.PI / 2);
            ctx.beginPath();
            ctx.moveTo(bx, by);
            ctx.lineTo(bx + Math.cos(subAng) * subLen, by + Math.sin(subAng) * subLen);
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;
    }

    // ── Layer 4: Glass crack lines from corners ───────────────────────────────
    const crackAlpha = Math.max(0, (freezeProgress - 0.3) / 0.7) * 0.6;
    if (crackAlpha > 0.01) {
      ctx.globalAlpha = crackAlpha;
      ctx.strokeStyle = '#cceeff';
      ctx.lineWidth   = 1.0;
      // Pre-defined crack patterns (deterministic, no flicker)
      const cracks = [
        [[0,0],[80,60],[120,140],[95,200]],
        [[W,0],[W-60,80],[W-130,110],[W-80,200]],
        [[0,H],[70,H-70],[140,H-120],[100,H-200]],
        [[W,H],[W-90,H-60],[W-160,H-130]],
        [[CX-20,0],[CX+15,55],[CX-10,100]],
        [[0,CY-10],[55,CY+20],[110,CY-15]],
        [[W,CY+10],[W-55,CY-15],[W-120,CY+20]],
      ];
      for (const crack of cracks) {
        ctx.beginPath();
        ctx.moveTo(crack[0][0], crack[0][1]);
        for (let i = 1; i < crack.length; i++) ctx.lineTo(crack[i][0], crack[i][1]);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // ── Layer 5: Falling sleet particles ─────────────────────────────────────
    const particleAlpha = freezeProgress * 0.8;
    if (particleAlpha > 0.02) {
      ctx.save();
      ctx.strokeStyle = '#e0f6ff';
      for (const p of fs.particles) {
        ctx.globalAlpha = p.alpha * particleAlpha;
        ctx.lineWidth   = p.w;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + p.vx * 0.04, p.y + p.len);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // ── Layer 6: Subtle scanline shimmer (cyber-ice digital effect) ───────────
    if (fs.phase === 'hold' || (fs.phase === 'onset' && freezeProgress > 0.7)) {
      const scanAlpha = 0.07 + 0.04 * Math.sin(Date.now() / 200);
      ctx.globalAlpha = scanAlpha;
      ctx.fillStyle   = '#44aaff';
      for (let y = 0; y < H; y += 4) {
        ctx.fillRect(0, y, W, 1);
      }
      ctx.globalAlpha = 1;
    }

    // ── Layer 7: FROZEN title text during hold phase ──────────────────────────
    if (fs.phase === 'hold') {
      const textAlpha = Math.min(1, fs.t / 0.5) * 0.9;
      ctx.globalAlpha = textAlpha;
      ctx.font        = 'bold 22px Consolas, monospace';
      ctx.textAlign   = 'center';
      // Shadow
      ctx.fillStyle   = 'rgba(0,20,60,0.8)';
      ctx.fillText('❄ FROZEN SLEET STORM ❄', CX + 1, 110 + 1);
      // Glow text
      ctx.fillStyle   = '#88ddff';
      ctx.fillText('❄ FROZEN SLEET STORM ❄', CX, 110);
      ctx.font        = '12px Consolas, monospace';
      ctx.fillStyle   = 'rgba(180,230,255,0.7)';
      ctx.fillText('MOVEMENT DISABLED', CX, 130);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  _updateAcidRain(dt) {
    const ACID_DPS   = 10;    // damage per second to normal enemies (kills weak, hurts strong)
    const MINI_VULN  = 0.7;   // mini-bosses take 70% — strong, meaningful chip
    const MAIN_VULN  = 0.4;   // main boss takes 40% — reduced but still real

    if (this.acidRain) {
      const ar = this.acidRain;
      ar.timer       -= dt;
      ar.damageAccum += dt;

      // Purge tick once per second. Player is never damaged. No per-hit floating numbers/sounds
      // (avoids spam) — lethal hits route through _die for correct kill/score/XP attribution.
      if (ar.damageAccum >= 1.0) {
        ar.damageAccum -= 1.0;

        // Enemies in the main array (reverse index so _die can splice safely)
        for (let i = this.enemies.length - 1; i >= 0; i--) {
          const e   = this.enemies[i];
          const dmg = e.isMegaBoss ? ACID_DPS * MAIN_VULN
                    : e.isBoss()   ? ACID_DPS * MINI_VULN
                    : ACID_DPS;
          e.hp -= dmg;
          if (e.hp <= 0) { e.hp = 0; e._die(this); }
        }

        // Separate mini-boss objects take strong-but-survivable chip (killable over time)
        for (const b of [this.titanBoss, this.annihilatorBoss, this.bloodfangBoss, this.cyberSerpentBoss, this.cyberDragonBoss]) {
          if (b && b.hp > 0) b.hp = Math.max(0, b.hp - ACID_DPS * MINI_VULN);
        }
        if (this.doubleDemonsBoss && this.doubleDemonsBoss.hp > 0)
          this.doubleDemonsBoss.hp = Math.max(0, this.doubleDemonsBoss.hp - ACID_DPS * MAIN_VULN);
        if (this.titanBoss && this.titanBoss.hp <= 0)                   this._titanDie();
        if (this.annihilatorBoss && this.annihilatorBoss.hp <= 0)       this._annihilatorDie();
        if (this.bloodfangBoss && this.bloodfangBoss.hp <= 0)           this._bloodfangDie();
        if (this.cyberSerpentBoss && this.cyberSerpentBoss.hp <= 0)     this._cyberSerpentDie();
        if (this.cyberDragonBoss && this.cyberDragonBoss.hp <= 0)       this._cyberDragonDie();
        if (this.doubleDemonsBoss && this.doubleDemonsBoss.hp <= 0)     this._doubleDemonsDie();
      }

      if (ar.timer <= 0) {
        this.acidRain      = null;
        this.acidRainTimer = this._chaosMode ? 60 : 138; // Chaos: 60s apart; Normal: 2.5 min
      }
      return;
    }

    this.acidRainTimer -= dt;
    if (this.acidRainTimer <= 0) {
      this.acidRain = { timer: 12, damageAccum: 0 };
      this.triggerAnnouncement('INCOMING ACID RAIN', GREEN);
      this.floatingTexts.push(
        new FloatingText('TOXIC RAIN PURGE', new Vec2(WIDTH / 2 - 120, HEIGHT / 2 - 70), GREEN, 2.5)
      );
      this.audio?.playEventWarning();
      this.audio?.playAcidRain?.();   // file SFX — throttled 4 s (one per activation)
    }
  }

  // ─── Boss-combat fairness layer (Boss Threat audit, Steps 1–2) ─────────────
  // Single gate for DISCRETE incoming hits (enemy/boss bullets, beams, shockwaves, and any
  // future boss attack). Enforces dash + Phoenix i-frames uniformly so a dash reliably dodges,
  // honours the shared 0.5s hit grace so overlapping hits can't burst the player, and clamps to
  // a per-hit ceiling so no single blow one-shots. Returns true ONLY if damage actually landed —
  // callers should consume the projectile / relay side-effects only on a true result.
  // (Continuous contact + lava already respect dash inline and keep their own per-tick cadence.)
  // Central, source-agnostic damage pulse: fires when the player's HP drops this frame,
  // covering every damage route (contact, bullets, boss attacks, acid) without editing each
  // site. Intensity scales with HP lost, so big boss hits read stronger than chip/contact.
  // A min-gap stops sustained contact from strobing; big discrete hits bypass it.
  _updateDamagePulse(dt) {
    if (this.damageFlash > 0) {
      this.damageFlash -= dt;
      if (this.damageFlash <= 0) { this.damageFlash = 0; this.damageFlashIntensity = 0; }
    }
    if (this._dmgPulseGap > 0) this._dmgPulseGap -= dt;

    const hpDrop = this._prevPlayerHp - this.player.hp;
    if (hpDrop > 0) {
      const big = hpDrop >= DMG_PULSE.bigHit;          // discrete hit vs dt-scaled chip/contact
      if (big || this._dmgPulseGap <= 0) {
        const intensity = clamp(DMG_PULSE.base + hpDrop * DMG_PULSE.slope, DMG_PULSE.base, 1.0);
        this.damageFlash          = DMG_PULSE.duration;
        this.damageFlashIntensity = Math.max(this.damageFlashIntensity, intensity);
        this._dmgPulseGap         = big ? 0.12 : DMG_PULSE.minGap;
      }
    }
    this._prevPlayerHp = this.player.hp;
  }

  // True only while the SPACE ultimate could actually be cast right now (mana-gated, per
  // character, not already mid-cast). Read-only — drives the one-shot "ready" cue.
  _ultimateReady() {
    const p = this.player;
    if (!p) return false;
    const hasUlt = p.selectedCharacter === 'skeleton_warrior'
                || p.selectedCharacter === 'cyber_arm_hero'
                || p.selectedCharacter === 'taekwondo_girl'
                || p.selectedCharacter === 'brawler_warrior'
                || p.selectedCharacter === 'assassin_clone';
    if (!hasUlt) return false;
    if (this.thunderSolo || this.overChains || this.spiritDojang || this._cyberBike || this._skyfall || this._chromePhantom) return false;  // mid-cast
    return p.mana >= ULTIMATE_MANA_COST;
  }

  // Fire the ready cue once on the rising edge of readiness (full → spend → recharge → fires
  // again). Sitting at full mana does NOT re-fire, so there is no constant flashing.
  _updateUltReady(dt) {
    if (this._ultReadyCue > 0) this._ultReadyCue -= dt;
    if (this._ultAura     > 0) this._ultAura     -= dt;
    const ready = this._ultimateReady();
    if (ready && !this._ultWasReady) {
      this._ultReadyCue = ULT_CUE.banner;
      this._ultAura     = ULT_CUE.aura;
    }
    this._ultWasReady = ready;
  }

  // Brief expanding character-colored ring around the player when the ultimate becomes ready.
  // World-space (scales with zoom); additive + short-lived, so it reads premium and costs nothing.
  _drawUltAura(ctx) {
    if (this._ultAura <= 0) return;
    const p   = this.player;
    const vis = p._getVisibilityColors();
    const t   = clamp(this._ultAura / ULT_CUE.aura, 0, 1);   // 1 → 0
    const r   = PLAYER_RADIUS + 8 + (1 - t) * 46;            // expands outward as it fades
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = vis.rim;
    ctx.lineWidth   = 3;
    ctx.globalAlpha = t * 0.6;
    ctx.beginPath(); ctx.arc(p.pos.x, p.pos.y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = t * 0.3;
    ctx.beginPath(); ctx.arc(p.pos.x, p.pos.y, r * 0.6, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // ── Combo milestone popups (visual only) ────────────────────────────────────
  // Tasteful neon escalation by tier; bigger/brighter at higher combos.
  _comboTierStyle(c) {
    if (c >= 100) return { color: '#fff36a', font: 26 };   // bright gold-white
    if (c >= 50)  return { color: '#ffb030', font: 21 };   // gold/red
    if (c >= 25)  return { color: '#c060ff', font: 18 };   // purple/magenta
    return          { color: '#00e6ff', font: 16 };        // x10 cyan
  }

  _spawnComboPopup(c, pos) {
    const style = this._comboTierStyle(c);
    const at = (pos && pos.clone) ? pos.clone() : this.player.pos.clone();
    this.comboPopups.push({ text: `COMBO x${c}`, pos: at, color: style.color, font: style.font, t: 0, life: 0.95 });
    if (this.comboPopups.length > 4) this.comboPopups.shift();   // cap (anti-spam safety)
  }

  _updateComboPopups(dt) {
    if (!this.comboPopups.length) return;
    for (const cp of this.comboPopups) cp.t += dt;
    this.comboPopups = this.comboPopups.filter(cp => cp.t < cp.life);
  }

  _drawComboPopups(ctx) {
    if (!this.comboPopups.length) return;
    for (const cp of this.comboPopups) {
      const p     = cp.t / cp.life;                              // 0 → 1
      const tin   = Math.min(1, cp.t / 0.18);
      const scale = 0.45 + 0.55 * (1 - Math.pow(1 - tin, 3));    // quick ease-out pop to full
      const alpha = p < 0.6 ? 1 : Math.max(0, 1 - (p - 0.6) / 0.4); // hold, then fade last 40%
      ctx.save();
      ctx.translate(cp.pos.x, cp.pos.y - 30 - p * 24);           // sits above the kill, rises as it fades
      ctx.scale(scale, scale);
      ctx.globalAlpha = alpha;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `bold ${cp.font}px Consolas, monospace`;
      ctx.shadowColor = cp.color;
      ctx.shadowBlur  = 12 * (1 - p) + 4;                        // bright flash at spawn, settles
      ctx.lineWidth   = 4;
      ctx.strokeStyle = 'rgba(0,8,16,0.75)';
      ctx.strokeText(cp.text, 0, 0);
      ctx.fillStyle = cp.color;
      ctx.fillText(cp.text, 0, 0);
      ctx.restore();
    }
  }

  // `cap` overrides the per-hit ceiling for specific telegraphed, fully-dodgeable boss attacks
  // (e.g. the final-boss main beam). Defaults to BOSS_MAX_PLAYER_HIT so EVERY existing caller is
  // unchanged. This never touches player stats/damage — it only lets a signalled boss hit land harder.
  _damagePlayer(dmg, { color = RED, shake = 5, cap = BOSS_MAX_PLAYER_HIT } = {}) {
    if (this.player.dashTimer > 0 || this.phoenixReviveTimer > 0) return false;  // i-frames → dodged
    if (this.playerHitCooldown > 0) return false;                                // within 0.5s grace
    const applied = Math.min(dmg, cap);
    this.player.applyDamage(applied);
    this.playerHitCooldown = 0.5;
    this.screenShake.trigger(shake, 0.2);
    this.particles.spawnHitSparks(this.player.pos, color);
    this.floatingTexts.push(new FloatingText(`-${Math.ceil(applied)} HP`, this.player.pos.clone(), color, 0.7));
    return true;
  }

  // Primary-fire / auto-weapon soft cap: bounds how fast the player's MAIN weapons can burn a
  // boss down so high fire-rate builds can't melt bosses instantly. Damage past the per-second
  // cap is heavily diminished (not zeroed) so shooting always feels responsive. Uses a timeAlive
  // window so it works for both Enemy bosses and the plain mini-boss objects. Ultimates and DoT
  // have their own caps and intentionally do NOT route through here. Returns the effective damage.
  _capBossDamage(boss, rawDmg) {
    // Endless raises the per-second cap so sustained DPS actually kills bosses (no HP-sponge feel);
    // Act 1 keeps its original, slower caps untouched.
    const cap = boss.isMegaBoss
      ? (this.endless ? 85  : BOSS_DPS_CAP_MEGA)
      : (this.endless ? 120 : BOSS_DPS_CAP_MINI);
    const now = this.timeAlive;
    if (boss._dpsWindowStart === undefined || now - boss._dpsWindowStart >= 1.0) {
      boss._dpsWindowStart = now;
      boss._dpsAccum       = 0;
    }
    const room = Math.max(0, cap - (boss._dpsAccum || 0));
    const eff  = rawDmg <= room ? rawDmg : room + (rawDmg - room) * 0.2;   // diminishing past the cap
    boss._dpsAccum = (boss._dpsAccum || 0) + eff;
    return eff;
  }

  // Boss survival resistances — applied ONLY to boss targets (enemy-type bosses, the mega-boss,
  // and the singleton mini-bosses) so support drones still help and DoT still matters, but neither
  // melts a boss before its mechanics land. Returns the damage to actually apply.
  _isBossTarget(t) {
    return t === this.titanBoss || t === this.annihilatorBoss || t === this.bloodfangBoss
        || (typeof t.isBoss === 'function' && t.isBoss()) || t.isMegaBoss === true;
  }
  _resistDot(t, dmg)   { return this._isBossTarget(t) ? dmg * (1 - BOSS_DOT_RESIST)   : dmg; }
  _resistDrone(t, dmg) { return this._isBossTarget(t) ? dmg * (1 - BOSS_DRONE_RESIST) : dmg; }

  // ─── Main-boss danger behaviours (Lava Rain + mini-boss summons) ───────────
  // Gated on this.megaBoss. Lava Rain damages the PLAYER ONLY (never enemies/bosses);
  // it is a separate system from the player's Acid Rain.

  // ─── Boss / mini-boss corruption blood trails (player-only DoT) ────────────
  // Spawned from Enemy.update for any boss/mega-boss. Hard-capped, short-lived, auto-cleaned;
  // damage only ticks while the player stands inside (telegraphed dark-red pool). Never hits enemies.
  _spawnBossTrail(pos) {
    if (this.bossTrails.length >= 36) return;            // hard cap on active trail pools
    const bp = this._hasProto('blood_path');             // Blood Path Protocol: harder + longer-lived
    this.bossTrails.push({ pos: pos.clone(), t: 0, life: bp ? 4.5 : 3.5, radius: bp ? 38 : 32, dps: bp ? 22 : 16, dmgAccum: 0 });
  }

  _updateBossTrails(dt) {
    if (!this.bossTrails.length) return;
    for (let i = this.bossTrails.length - 1; i >= 0; i--) {
      const z = this.bossTrails[i];
      z.t += dt;
      if (this.phoenixReviveTimer <= 0 && this.player.dashTimer <= 0 &&
          distance(this.player.pos, z.pos) < z.radius) {
        z.dmgAccum += dt;
        if (z.dmgAccum >= 0.5) {                          // tick every 0.5s → ~16 HP/s standing inside
          z.dmgAccum -= 0.5;
          this.player.applyDamage(z.dps * 0.5 * (1 - this.player.contactDamageReduction));
          if (this.playerHitCooldown <= 0) {
            this.playerHitCooldown = 0.4;
            this.particles.spawnHitSparks(this.player.pos, RED);
            this.floatingTexts.push(new FloatingText('-' + Math.ceil(z.dps * 0.5) + ' HP', this.player.pos.clone(), '#ff5a5a', 0.6));
          }
        }
      }
      if (z.t >= z.life) this.bossTrails.splice(i, 1);
    }
  }

  _drawBossTrails(ctx) {
    if (!this.bossTrails.length) return;
    ctx.save();
    for (const z of this.bossTrails) {
      const k = Math.max(0, 1 - z.t / z.life);            // fade out over life
      const g = ctx.createRadialGradient(z.pos.x, z.pos.y, z.radius * 0.2, z.pos.x, z.pos.y, z.radius);
      g.addColorStop(0, `rgba(150,0,24,${0.42 * k})`);
      g.addColorStop(1, 'rgba(60,0,10,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(z.pos.x, z.pos.y, z.radius, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(255,46,46,${0.30 * k})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(z.pos.x, z.pos.y, z.radius * 0.85, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.restore();
  }

  _updateBossAttacks(dt) {
    if (this._plasmaWarnCd > 0) this._plasmaWarnCd -= dt;   // throttles the REACTOR PLASMA warning
    // Advance active lava zones (warning → impact → expire). Player-only damage.
    if (this.bossLavaZones.length) {
      for (const z of this.bossLavaZones) {
        z.t += dt;
        if (z.t >= z.warn && z.t < z.warn + z.impact) {
          z.dmgAccum += dt;
          if (z.dmgAccum >= 1.0) {
            z.dmgAccum -= 1.0;
            if (this.phoenixReviveTimer <= 0 && this.player.dashTimer <= 0 &&
                distance(this.player.pos, z.pos) < z.radius) {
              this.player.applyDamage(z.dps * (1 - this.player.contactDamageReduction));
              if (this.playerHitCooldown <= 0) {
                this.playerHitCooldown = 0.5;
                this.screenShake.trigger(5, 0.2);
                this.particles.spawnHitSparks(this.player.pos, ORANGE);
                this.floatingTexts.push(
                  new FloatingText(`-${Math.ceil(z.dps)} HP`, this.player.pos.clone(), ORANGE, 0.6)
                );
              }
            }
          }
        }
      }
      this.bossLavaZones = this.bossLavaZones.filter(z => z.t < z.warn + z.impact);
    }

    // Advance the signature beam + novas every frame so active ones resolve even as the boss dies.
    this._updateCorruptionBeam(dt);
    this._updateCorruptionNovas(dt);

    // ── Endless-only ambient Lava Rain ── boss-INDEPENDENT area denial so the grid always has
    // pressure even between bosses. Reuses bossLavaZones (1.4s warn ring → impact), player-only
    // damage. Drops never land on the player (min 60px), so it stays dodgeable and fair.
    if (this.endless) {
      if (this._endlessLavaCd === undefined) this._endlessLavaCd = randomRange(18, 26);
      this._endlessLavaCd -= dt;
      // Threat pass: Lava Rain is now a SUSTAINED ~5s storm (was a single 3–5 drop burst), so the
      // event's active duration is roughly doubled. Drops still telegraph (1.4s warn) + never land
      // on the player (min 60px), and active zones are hard-capped → fair and dodgeable.
      if (this._endlessLavaCd <= 0 && this._lavaRainActive <= 0) {
        this._endlessLavaCd  = randomRange(16, 24);
        this._lavaRainActive = this._hasProto('lava_plus') ? 7.5 : 5.0;   // Lava Rain+ extends the storm window
        this._lavaSpawnCd    = 0;
        this.triggerAnnouncement('⚠ LAVA RAIN', ORANGE);
        this.audio?.playEventWarning();
        this.audio?.playLavaRain?.();   // file SFX — throttled 1.5 s (one per storm wave)
      }
      if (this._lavaRainActive > 0) {
        this._lavaRainActive -= dt;
        this._lavaSpawnCd    -= dt;
        if (this._lavaSpawnCd <= 0) {
          this._lavaSpawnCd = 0.9;
          const count = 2 + Math.floor(Math.random() * 2);   // 2–3 drops per wave
          for (let i = 0; i < count; i++) {
            if (this.bossLavaZones.length >= 26) break;       // hard cap on active lava zones
            const ang  = Math.random() * Math.PI * 2;
            const dist = randomRange(60, 280);                // never guaranteed on the player
            const pos  = new Vec2(
              clamp(this.player.pos.x + Math.cos(ang) * dist, WORLD_MARGIN, WORLD_W - WORLD_MARGIN),
              clamp(this.player.pos.y + Math.sin(ang) * dist, WORLD_MARGIN, WORLD_H - WORLD_MARGIN)
            );
            this.bossLavaZones.push({ pos, radius: 70, warn: 1.4, impact: 1.3, t: 0, dmgAccum: 0, dps: 14 });
          }
        }
      }
    }

    // Endless: keep the "final boss" attack suite alive across loops. After the first mega-boss dies,
    // later Rogue AI Overlords spawn as plain enemies — promote a live one so its corruption attacks
    // (bolts/beam/nova/lava) fire again instead of the boss going passive. Re-init phase on promotion.
    if (this.endless && (!this.megaBoss || this.megaBoss.hp <= 0)) {
      const o = this.enemies.find(e => e.enemyType === 'Rogue AI Overlord' && e.hp > 0);
      if (o) { o.isMegaBoss = true; o._phase = undefined; o._fullHp = undefined; this.megaBoss = o; }
    }

    const boss = this.megaBoss;
    if (!boss || boss.hp <= 0) return;

    // ── Phase tracking (HP-fraction gated): 1 = 100–70%, 2 = 70–35%, 3 = 35–0% ──
    if (boss._fullHp === undefined) boss._fullHp = boss.hp;   // capture full HP on first sight
    if (boss._phase  === undefined) boss._phase  = 1;
    const frac   = boss.hp / boss._fullHp;
    const target = frac > 0.70 ? 1 : frac > 0.35 ? 2 : 3;
    if (target > boss._phase) {
      boss._phase = target;
      if (target === 2) this.triggerAnnouncement('PHASE 2 — GRID CORRUPTION RISING', PURPLE);
      else              this.triggerAnnouncement('PHASE 3 — FINAL OVERRIDE', RED);
      this.screenShake.trigger(7, 0.5);
      this.audio?.playEventWarning();
    }
    const phase = boss._phase;
    const late  = this.currentMinute() >= 20 ? 0.7 : 1.0;   // attacks come faster past 20 min

    // ── Corruption bolts (ALL phases): aimed, visible, dodgeable energy projectiles ──
    if (boss.boltCd === undefined) boss.boltCd = randomRange(2, 3);
    boss.boltCd -= dt;
    if (boss.boltCd <= 0) {
      boss.boltCd = (phase === 1 ? randomRange(2.0, 3.0)
                   : phase === 2 ? randomRange(1.8, 2.6)
                   :               randomRange(1.3, 2.0)) * late;
      const base = safeNormalize(this.player.pos.sub(boss.pos));
      if (base.lengthSq() > 0) {
        const spread = phase === 3 ? [-0.13, 0.13] : [0];   // phase 3 fires a tight twin-bolt
        const dmg    = phase === 3 ? 12 : 10;               // 8–12 band
        for (const off of spread) {
          const c = Math.cos(off), s = Math.sin(off);
          const dir = new Vec2(base.x * c - base.y * s, base.x * s + base.y * c);
          this.spawnEnemyBullet(boss.pos.clone(), dir, 280, dmg, 9, PURPLE);
        }
        this.audio?.playEnemyShoot();
      }
    }

    // Phase 1 is a clean teaching phase — bolts only. Area denial begins in phase 2.
    if (phase < 2) return;

    // ── Lava Rain: telegraphed corruption zones (phase 2+, denser in phase 3) ──
    if (boss.lavaCd === undefined) boss.lavaCd = randomRange(3, 5);
    boss.lavaCd -= dt;
    if (boss.lavaCd <= 0) {
      boss.lavaCd = (phase === 3 ? randomRange(4.5, 6.5) : randomRange(6, 8)) * late;
      const count = (phase === 3 ? 4 : 3) + Math.floor(Math.random() * 3);
      for (let i = 0; i < count; i++) {
        const ang  = Math.random() * Math.PI * 2;
        // One drop can land directly ON the player; the 1.2s warn ring still makes it dodgeable.
        const onPlayerChance = 0.5 + this.mutations.plasmaOnPlayerChanceBonus;   // TARGETED PLASMA
        const dist = (i === 0 && Math.random() < onPlayerChance) ? randomRange(0, 26) : randomRange(40, 260);
        const pos  = new Vec2(
          clamp(this.player.pos.x + Math.cos(ang) * dist, WORLD_MARGIN, WORLD_W - WORLD_MARGIN),
          clamp(this.player.pos.y + Math.sin(ang) * dist, WORLD_MARGIN, WORLD_H - WORLD_MARGIN)
        );
        this.bossLavaZones.push({ pos, radius: 70, warn: 1.2, impact: 1.4, t: 0, dmgAccum: 0, dps: 16 });
      }
      // One warning per plasma burst window (no per-volley spam).
      if (!(this._plasmaWarnCd > 0)) {
        this._plasmaWarnCd = 14;
        this.triggerAnnouncement('⚠ REACTOR PLASMA', ORANGE);
      }
      this.audio?.playEventWarning();
    }

    // ── CORRUPTION GRID BEAM (signature, phase 2+): only one active at a time ──
    if (boss.beamCd === undefined) boss.beamCd = randomRange(6, 9);
    if (!this._corruptionBeam) {
      boss.beamCd -= dt;
      if (boss.beamCd <= 0) {
        boss.beamCd = (phase === 3 ? randomRange(7, 9) : randomRange(10, 12));
        this._corruptionBeam = {
          phase: 'charge', t: 0,
          origin: boss.pos.clone(),
          dir: safeNormalize(this.player.pos.sub(boss.pos)),
        };
        this.triggerAnnouncement('CORRUPTION BEAM', PURPLE);
        this.screenShake.trigger(3, 0.2);
        this.audio?.playEventWarning();
      }
    }

    // ── CORRUPTION NOVA (phase 2+): telegraphed radial burst centred on the boss ──
    if (boss.novaCd === undefined) boss.novaCd = randomRange(8, 12);
    boss.novaCd -= dt;
    if (boss.novaCd <= 0) {
      boss.novaCd = randomRange(8, 12);
      this._corruptionNovas.push({ pos: boss.pos.clone(), radius: FINAL_NOVA_RADIUS, warn: FINAL_NOVA_WARN, t: 0, hit: false });
      this.audio?.playEventWarning();
    }

    // ── STUN LANCE (phase 2+): telegraphed aim line tracks the player, then a locked stun bolt ──
    // Dangerous but fair: 0.8s warning line, dodgeable, small damage, 2s anti-lock immunity on hit.
    if (boss.stunCd === undefined) boss.stunCd = randomRange(7, 10);
    if (boss._stunAim) {
      boss._stunAim.t  += dt;
      boss._stunAim.dir = safeNormalize(this.player.pos.sub(boss.pos));   // telegraph tracks the player while charging
      if (boss._stunAim.t >= STUN_LANCE_CHARGE) {
        const dir = boss._stunAim.dir;
        if (dir.lengthSq() > 0)
          this.spawnEnemyBullet(boss.pos.clone(), dir, 340, 8, 11, CYAN, { stun: STUN_LANCE_DURATION });
        this.audio?.playEnemyShoot();
        boss._stunAim = null;
      }
    } else {
      boss.stunCd -= dt;
      if (boss.stunCd <= 0) {
        boss.stunCd = randomRange(9, 13) * late;
        boss._stunAim = { t: 0, dir: safeNormalize(this.player.pos.sub(boss.pos)) };
        this.audio?.playEventWarning();
      }
    }

    // ── Summon a reinforcement (phase 2+, capped so it never floods) ──
    if (boss.summonCd === undefined) boss.summonCd = randomRange(6, 9);
    boss.summonCd -= dt;
    if (boss.summonCd <= 0) {
      boss.summonCd = randomRange(12, 15) * late;
      const living = this.enemies.filter(e => e.enemyType === 'Security Defector Mech').length;
      if (living < 2) {
        const minion = new Enemy('Security Defector Mech', this.currentMinute());
        const ang = Math.random() * Math.PI * 2;
        minion.pos = new Vec2(
          clamp(boss.pos.x + Math.cos(ang) * 80, WORLD_MARGIN, WORLD_W - WORLD_MARGIN),
          clamp(boss.pos.y + Math.sin(ang) * 80, WORLD_MARGIN, WORLD_H - WORLD_MARGIN)
        );
        this.enemies.push(minion);
        this.floatingTexts.push(
          new FloatingText('BOSS SUMMONS REINFORCEMENT', new Vec2(WIDTH / 2 - 190, HEIGHT / 2 - 50), RED, 2.0)
        );
        this.audio?.playEventWarning();
      }
    }
  }

  // CORRUPTION GRID BEAM — charge (telegraph follows the player) → fire (locked thick beam).
  // Damage routes through _damagePlayer, so dash i-frames / hit grace / 30-HP ceiling all apply.
  _updateCorruptionBeam(dt) {
    const beam = this._corruptionBeam;
    if (!beam) return;
    const boss = this.megaBoss;
    beam.t += dt;

    if (beam.phase === 'charge') {
      if (!boss || boss.hp <= 0) { this._corruptionBeam = null; return; }   // source gone → cancel
      beam.origin = boss.pos.clone();
      beam.dir    = safeNormalize(this.player.pos.sub(boss.pos));            // telegraph follows the player
      if (beam.t >= FINAL_BEAM_CHARGE) {
        beam.phase = 'fire'; beam.t = 0;
        this.screenShake.trigger(5, 0.25);
        this.audio?.playTitanBeam?.();
      }
      return;
    }

    // fire phase — locked ray; perpendicular distance test against the player
    const o = beam.origin, d = beam.dir;
    const toP  = this.player.pos.sub(o);
    const proj = toP.dot(d);
    // One heavy strike per beam (≈50% max HP) — a clip costs half your HP, but a single beam can
    // never multi-tick you to death; the telegraph (charge tracks → locks) makes it fully dodgeable.
    if (!beam.struck && proj > 0 && proj < FINAL_BEAM_LEN) {
      const perp = Math.abs(-d.y * toP.x + d.x * toP.y);
      if (perp < FINAL_BEAM_HALFW + PLAYER_RADIUS) {
        const beamDmg = Math.round(this.player.maxHp * FINAL_BEAM_HP_FRAC);
        if (this._damagePlayer(beamDmg, { color: PURPLE, shake: 7, cap: beamDmg })) {
          beam.struck = true;
          this.player.staggerTimer = Math.max(this.player.staggerTimer, 1.0);   // 1s corruption slow (reuses stagger)
          this.floatingTexts.push(new FloatingText('CORRUPTED', new Vec2(this.player.pos.x, this.player.pos.y - 26), PURPLE, 0.7));
        }
      }
    }
    if (beam.t >= FINAL_BEAM_FIRE) this._corruptionBeam = null;
  }

  // CORRUPTION NOVA — 1s telegraphed ring around the boss, then a single radial burst.
  _updateCorruptionNovas(dt) {
    if (!this._corruptionNovas.length) return;
    for (let i = this._corruptionNovas.length - 1; i >= 0; i--) {
      const n = this._corruptionNovas[i];
      n.t += dt;
      if (!n.hit && n.t >= n.warn) {
        n.hit = true;
        this.screenShake.trigger(5, 0.2);
        this.particles.spawnExplosion(n.pos, [PURPLE, RED, '#ff44aa'], 18);
        if (distance(this.player.pos, n.pos) < n.radius)
          this._damagePlayer(FINAL_NOVA_DMG, { color: PURPLE, shake: 5 });
      }
      if (n.t >= n.warn + 0.35) this._corruptionNovas.splice(i, 1);
    }
  }

  // Draws the signature beam (charge telegraph + fire) and nova telegraphs/bursts — world-space, on top of entities.
  _drawBossCorruption(ctx) {
    // Stun-lance telegraph — a brightening dashed aim line from the boss toward the locked-on player.
    const sb = this.megaBoss;
    if (sb && sb._stunAim) {
      const o = sb.pos, d = sb._stunAim.dir, k = Math.min(1, sb._stunAim.t / STUN_LANCE_CHARGE);
      ctx.save();
      ctx.globalAlpha = 0.30 + 0.55 * k;
      ctx.strokeStyle = CYAN; ctx.lineWidth = 2 + 4 * k; ctx.setLineDash([14, 10]);
      ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(o.x + d.x * 900, o.y + d.y * 900); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
    for (const n of this._corruptionNovas) {
      ctx.save();
      if (n.t < n.warn) {
        const k = n.t / n.warn;
        ctx.globalAlpha = 0.12 + 0.20 * k;
        ctx.fillStyle = PURPLE;
        ctx.beginPath(); ctx.arc(n.pos.x, n.pos.y, n.radius, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = Math.min(1, 0.45 + 0.5 * k);
        ctx.strokeStyle = RED; ctx.lineWidth = 3; ctx.setLineDash([12, 9]);
        ctx.beginPath(); ctx.arc(n.pos.x, n.pos.y, n.radius, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      } else {
        const k = (n.t - n.warn) / 0.35;
        ctx.globalAlpha = Math.max(0, 1 - k);
        ctx.strokeStyle = '#ff44aa'; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(n.pos.x, n.pos.y, n.radius * (0.7 + 0.5 * k), 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }

    const beam = this._corruptionBeam;
    if (!beam) return;
    const o = beam.origin, d = beam.dir;
    const ex = o.x + d.x * FINAL_BEAM_LEN, ey = o.y + d.y * FINAL_BEAM_LEN;
    ctx.save();
    ctx.lineCap = 'round';
    if (beam.phase === 'charge') {
      const k = beam.t / FINAL_BEAM_CHARGE;
      ctx.globalAlpha = 0.35 + 0.35 * Math.abs(Math.sin(this.timeAlive * 16));
      ctx.strokeStyle = PURPLE; ctx.lineWidth = 2 + 6 * k;
      ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = RED; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(ex, ey); ctx.stroke();
    } else {
      const a = beam.t < 0.1 ? 1 : Math.max(0, 1 - (beam.t - 0.1) / (FINAL_BEAM_FIRE - 0.1));
      ctx.globalAlpha = 0.85 * a + 0.15;
      ctx.strokeStyle = PURPLE; ctx.lineWidth = FINAL_BEAM_HALFW * 2;
      ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.strokeStyle = '#ff44aa'; ctx.lineWidth = FINAL_BEAM_HALFW;
      ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.globalAlpha = a;
      ctx.strokeStyle = WHITE; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(ex, ey); ctx.stroke();
    }
    ctx.restore();
  }

  // Lava/Fire-Rain zones: pulsing telegraph ring during warning, then the eruption sheet on impact.
  _drawBossLava(ctx) {
    if (!this.bossLavaZones.length) return;
    const spr   = this._lavaRainSprite;
    const ready = spr && spr.complete && spr.naturalWidth > 0;
    const FW = 512, FH = 384, COLS = 2, FRAMES = 8;

    for (const z of this.bossLavaZones) {
      if (z.t < z.warn) {
        const k     = z.t / z.warn;
        const pulse = 0.35 + 0.25 * Math.sin(this.timeAlive * 12);
        ctx.save();
        ctx.globalAlpha = 0.16 + 0.18 * k;
        ctx.fillStyle = ORANGE;
        ctx.beginPath(); ctx.arc(z.pos.x, z.pos.y, z.radius, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = Math.min(1, pulse + 0.3 * k);
        ctx.strokeStyle = RED; ctx.lineWidth = 3; ctx.setLineDash([10, 8]);
        ctx.beginPath(); ctx.arc(z.pos.x, z.pos.y, z.radius, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      } else {
        const it   = (z.t - z.warn) / z.impact;            // 0→1 over impact
        const fade = it > 0.8 ? (1 - it) / 0.2 : 1;        // fade the last 20%
        ctx.save();
        ctx.globalAlpha = Math.max(0, fade);
        if (ready) {
          const fi = Math.min(FRAMES - 1, Math.floor(it * FRAMES));
          const sx = (fi % COLS) * FW, sy = Math.floor(fi / COLS) * FH;
          const dw = z.radius * 2.6, dh = dw * (FH / FW);
          ctx.drawImage(spr, sx, sy, FW, FH, z.pos.x - dw / 2, z.pos.y - dh * 0.78, dw, dh);
        } else {
          const g = ctx.createRadialGradient(z.pos.x, z.pos.y, 4, z.pos.x, z.pos.y, z.radius);
          g.addColorStop(0, '#fff2a0'); g.addColorStop(0.4, ORANGE); g.addColorStop(1, 'rgba(120,10,0,0.12)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(z.pos.x, z.pos.y, z.radius, 0, Math.PI * 2); ctx.fill();
        }
        // Molten shock ring — bright expanding ring on impact (premium hit read)
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.max(0, 1 - it) * 0.8;
        ctx.strokeStyle = '#ffd27f'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(z.pos.x, z.pos.y, z.radius * (0.5 + 0.6 * it), 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.shadowBlur = 0; ctx.filter = 'none';
  }

  // Premium full-map LAVA atmosphere — screen-space wash + drifting embers while lava zones are live.
  // Visual only (damage stays in the telegraphed zones). Bounded: one wash + a fixed 26-ember loop.
  _drawLavaAtmosphere(ctx) {
    if (!this.bossLavaZones || !this.bossLavaZones.length) return;
    const now = performance.now();
    const pulse = 0.05 + 0.04 * (0.5 + 0.5 * Math.sin(now * 0.002));
    ctx.save();
    // warm orange-red wash (kept low so player/enemies stay readable)
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, 'rgba(60,8,0,' + pulse + ')');
    g.addColorStop(1, 'rgba(120,30,0,' + (pulse + 0.05) + ')');
    ctx.fillStyle = g; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    // drifting embers (procedural, fixed count — no array)
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 26; i++) {
      const seed = i * 137.5;
      const x = (seed * 7 % WIDTH);
      const y = HEIGHT - ((now * 0.03 + seed * 11) % (HEIGHT + 40)) + 20;
      const a = 0.25 + 0.25 * Math.sin(now * 0.004 + i);
      ctx.globalAlpha = a;
      ctx.fillStyle = i % 3 === 0 ? '#ffd27f' : '#ff6a1a';
      ctx.beginPath(); ctx.arc(x, y, 1.6 + (i % 3), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.shadowBlur = 0; ctx.filter = 'none';
  }

  // ── Boss support drones ───────────────────────────────────────────────────

  _spawnSupportDrones() {
    // Bugfix: these boss-fight assist drones used to spawn automatically on every Titan/Bloodfang
    // spawn (two drones appearing above the player without being summoned). Now gated on actually
    // OWNING the Auto-Forge Drone card — so drones only appear once the player has called/unlocked
    // them through the intended upgrade. No card → no free drones.
    if ((this.player.upgrades['Auto-Forge Drone'] || 0) < 1) return;
    const p = this.player.pos;
    this.supportDrones = [
      new SupportDrone('flame',   p),
      new SupportDrone('electro', p),
    ];
  }

  _updateSupportDrones(dt) {
    if (this.supportDrones.length === 0) return;
    const drones = this.supportDrones.slice();  // snapshot so _titanDie won't corrupt the loop
    for (const drone of drones) {
      drone.update(dt, this.player.pos, this);
    }
    // Corrosive DoT is now centralized in Game._updateCorrosive (runs every frame), so drones
    // only SET _corrosiveTimer — the tick/damage happens there (avoids double application).
    // Titan death check after all drone updates (safe — not inside the loop)
    if (this.titanBoss && this.titanBoss.hp <= 0) this._titanDie();
  }

  // ── Auto-Forge Drone card: persistent combat allies ───────────────────────
  // Reuses the SupportDrone class/assets. Kept in its own array so the boss-fight
  // drone logic (which clears this.supportDrones on boss death) never removes them.
  // Lazy-spawns to match the card level — L1 = flame, L2 adds electro.
  _updateAllyDrones(dt) {
    const lvl = this.player.upgrades['Auto-Forge Drone'] || 0;
    while (this.allyDrones.length < lvl) {
      const type = this.allyDrones.length === 0 ? 'flame' : 'electro';
      this.allyDrones.push(new SupportDrone(type, this.player.pos));
    }
    if (this.allyDrones.length === 0) return;
    for (const drone of this.allyDrones.slice()) {   // snapshot: a death mid-loop can mutate game arrays
      drone.update(dt, this.player.pos, this);
    }
    // Titan death can be triggered by ally drone damage too — resolve it safely after the loop.
    if (this.titanBoss && this.titanBoss.hp <= 0) this._titanDie();
  }

  // ── AI Overload Titan mini-boss ───────────────────────────────────────────

  _updateTitan(dt) {
    if (!this.titanSpawned) {
      this.titanSpawnTimer -= dt;
      if (this.titanSpawnTimer > 0) return;
      this.titanSpawned = true;
      this._spawnTitan();
    }

    const t = this.titanBoss;
    if (!t || t.hp <= 0) return;

    // Move toward player (slow)
    const toPlayer = this.player.pos.sub(t.pos);
    if (toPlayer.length() > t.radius + PLAYER_RADIUS + 4) {
      t.pos.addMut(safeNormalize(toPlayer).scale(t.speed * dt));
    }
    t.pos.x = clamp(t.pos.x, WORLD_MARGIN + t.radius, WORLD_W - WORLD_MARGIN - t.radius);
    t.pos.y = clamp(t.pos.y, WORLD_MARGIN + 40 + t.radius, WORLD_H - WORLD_MARGIN - t.radius);

    if (t.hitFlash > 0) t.hitFlash -= dt;

    // Contact damage (same rate pattern as regular enemies)
    if (distance(t.pos, this.player.pos) < t.radius + PLAYER_RADIUS) {
      const push = safeNormalize(this.player.pos.sub(t.pos));
      this.player.pos.addMut(push.scale(60 * dt));
      if (this.player.dashTimer <= 0 && this.phoenixReviveTimer <= 0) {
        const dmg = t.contactDamage * dt * (1 - this.player.contactDamageReduction);
        this.player.applyDamage(dmg);
        if (this.playerHitCooldown <= 0) {
          this.playerHitCooldown = 0.5;
          this.screenShake.trigger(4, 0.15);
          this.floatingTexts.push(new FloatingText(`-${Math.ceil(t.contactDamage)} HP`, this.player.pos.clone(), RED, 0.6));
        }
      }
    }

    // Shockwave attack (every 6–8s)
    t.shockwaveTimer -= dt;
    if (t.shockwaveTimer <= 0) {
      t.shockwaveTimer = 6 + Math.random() * 2;
      this._titanShockwave(t);
    }

    // Beam attack (every 10–12s)
    t.beamTimer -= dt;
    if (t.beamTimer <= 0) {
      t.beamTimer = 10 + Math.random() * 2;
      this._titanBeam(t);
    }

    // Update expanding shockwave rings
    for (let i = this._titanShockwaves.length - 1; i >= 0; i--) {
      const sw = this._titanShockwaves[i];
      sw.radius += 200 * dt;
      sw.alpha   = Math.max(0, 1.0 - sw.radius / 350);
      if (!sw.resolved) {
        const d = distance(sw.pos, this.player.pos);
        if (sw.radius >= d - PLAYER_RADIUS - 4) {
          sw.resolved = true;                                       // resolve once: a dash at the crossing instant cleanly misses
          this._damagePlayer(10, { color: PURPLE, shake: 3 });      // damage applies only if not dashing/Phoenix/in-grace
        }
      }
      if (sw.alpha <= 0) this._titanShockwaves.splice(i, 1);
    }

    // Update titan beams
    for (let i = this._titanBeams.length - 1; i >= 0; i--) {
      const b = this._titanBeams[i];
      b.pos.addMut(b.dir.scale(b.speed * dt));
      b.life -= dt;
      if (!b.hit && distance(b.pos, this.player.pos) < b.radius + PLAYER_RADIUS) {
        if (this._damagePlayer(15, { color: PURPLE, shake: 4 })) {   // false while dashing → beam passes through
          b.hit = true;
          this.overload = clamp(this.overload + 3, 0, OVERLOAD_CAP);  // relay the pre-existing overload spike only on a real hit
          this.floatingTexts.push(new FloatingText('+3% OVERLOAD', new Vec2(this.player.pos.x, this.player.pos.y - 24), RED, 0.8));
        }
      }
      if (b.hit || b.life <= 0) this._titanBeams.splice(i, 1);
    }
  }

  _spawnTitan() {
    const R    = 50;
    const side = Math.random() < 0.5 ? -1 : 1;
    const pos  = new Vec2(
      WORLD_W / 2 + side * (WORLD_W / 2 - WORLD_MARGIN - R - 30),
      WORLD_H / 2
    );
    const titanHp = Math.round((this.endless ? 460 : 600) * this._getActiveChaosLawModifiers().bossHpMult);   // Endless: killable range (Act 1 keeps 600)
    this.titanBoss = {
      pos, hp: titanHp, maxHp: titanHp,
      radius: R, speed: 60, contactDamage: 16, hitFlash: 0,
      shockwaveTimer: 4, beamTimer: 8,
    };
    this._bossAnnounce('AI OVERLOAD TITAN DETECTED', PURPLE);
    this.audio?.playBossSpawn();
    this.screenShake.trigger(6, 0.5);
    this.floatingTexts.push(
      new FloatingText('AI OVERLOAD TITAN DETECTED', new Vec2(WIDTH / 2 - 220, HEIGHT / 2 - 60), PURPLE, 3.0)
    );
    this._spawnSupportDrones();
  }

  // Subtle CRT scanline overlay (screen space). Pattern built + cached once.
  // ── Eden Core in-run transmission queue ──────────────────────────────────────
  /**
   * Queue an in-run Eden Core transmission popup.
   * @param {string}  message
   * @param {object}  opts  { title, priority 1-3, duration, auto }
   *   auto:     true = applies 50-second cooldown between auto-milestones
   *   priority: 1=normal 2=high(boss/chaos) 3=critical(low-hp)
   *             Higher priority replaces active lower-priority transmission.
   */
  _queueEdenTransmission(message, { title = 'EDEN CORE', priority = 1, duration = 5, auto = false, clipId = null } = {}) {
    const now = this.timeAlive || 0;
    // Auto-milestone cooldown: enforce 50 s gap
    if (auto && (now - this._edenLastAutoAt) < 50) return;
    // Existing higher-priority block
    const ex = this._edenTransmission;
    if (ex && now < ex.expiresAt && priority < ex.priority) return;
    this._edenTransmission = { message, title, priority, expiresAt: now + duration };
    if (auto) this._edenLastAutoAt = now;
    // Optional audio hook — synthesized glitch if no clip, silent if muted
    this.audio?.playEdenTransmission(clipId);
  }

  /**
   * Check time milestones and event hooks; queue Eden transmissions.
   * Called from the main update loop when playing Endless.
   */
  _triggerEdenMilestoneMessages() {
    if (!this.endless || this.gameOver || this.victory) return;
    const t    = this.timeAlive;
    const sh   = this._edenRunMilestonesShown;
    const cid  = this.player?.characterId || '';
    const cp   = _EDEN_CHAR_POOLS[cid] || null;

    // ── Time milestones (ordered — only one fires per call via return) ────────
    // Endless start intro (~2 s)
    if (t >= 2 && !sh.has('t_start')) {
      sh.add('t_start');
      const msg = cp ? _epick(cp.intro) : 'PHENIX trace synchronized.';
      this._queueEdenTransmission(msg, { title: 'EDEN CORE', priority: 2, duration: 6, auto: true });
      return;
    }
    // 3 min — character mid or generic challenge
    if (t >= 180 && !sh.has('t_3m')) {
      sh.add('t_3m');
      const msg = cp ? _epick(cp.mid) : _epick(_EDEN_GENERIC_MID);
      this._queueEdenTransmission(msg, { title: 'EDEN CORE', priority: 1, duration: 5, auto: true });
      return;
    }
    // 6 min — generic challenge
    if (t >= 360 && !sh.has('t_6m')) {
      sh.add('t_6m');
      this._queueEdenTransmission(_epick(_EDEN_GENERIC_MID), { title: 'EDEN CORE', priority: 1, duration: 5, auto: true });
      return;
    }
    // 10 min — survival or character line
    if (t >= 600 && !sh.has('t_10m')) {
      sh.add('t_10m');
      const msg = cp ? _epick(cp.survival) : _epick(_EDEN_GENERIC_SURVIVAL);
      this._queueEdenTransmission(msg, { title: 'EDEN CORE', priority: 1, duration: 5, auto: true });
      return;
    }
    // 15 min — challenge
    if (t >= 900 && !sh.has('t_15m')) {
      sh.add('t_15m');
      this._queueEdenTransmission(_epick(_EDEN_GENERIC_MID), { title: 'EDEN CORE', priority: 1, duration: 5, auto: true });
      return;
    }
    // 20 min — chaos approach warning (early)
    if (t >= 1200 && !sh.has('t_20m')) {
      sh.add('t_20m');
      const msg = cp ? _epick(cp.mid) : _epick(_EDEN_GENERIC_MID);
      this._queueEdenTransmission(msg, { title: 'EDEN CORE', priority: 1, duration: 5, auto: true });
      return;
    }
    // 25 min — chaos approach imminent
    if (t >= 1500 && !sh.has('t_25m')) {
      sh.add('t_25m');
      this._queueEdenTransmission(_epick(_EDEN_CHAOS_APPROACH), { title: 'EDEN CORE', priority: 2, duration: 6, auto: true });
      return;
    }
    // 28 min — boundary warning
    if (t >= 1680 && !sh.has('t_28m')) {
      sh.add('t_28m');
      this._queueEdenTransmission(_epick(_EDEN_CHAOS_APPROACH), { title: 'EDEN CORE', priority: 2, duration: 6, auto: true });
      return;
    }

    // ── Low HP trigger (once per episode, resets when HP recovers) ───────────
    const hp    = this.player?.hp    || 0;
    const maxHp = this.player?.maxHp || 100;
    if (hp > 0 && hp < maxHp * 0.30 && !this._edenLowHpFired) {
      this._edenLowHpFired = true;
      const cpool = _EDEN_CHAR_POOLS[cid];
      const msg = (cpool?.low_hp) ? _epick(cpool.low_hp) : _epick(_EDEN_LOW_HP);
      this._queueEdenTransmission(msg, { title: 'EDEN CORE', priority: 3, duration: 5 });
    }
    // Reset low-HP flag when player recovers above 50 %
    if (hp >= maxHp * 0.50 && this._edenLowHpFired) {
      this._edenLowHpFired = false;
    }
  }

  /**
   * Draw the in-run Eden Core transmission popup (upper-right, screen-space).
   * Called from draw() after drawHUD. Not shown on game-over/victory screens.
   */
  _drawEdenGameplayTransmission(ctx) {
    const tx = this._edenTransmission;
    if (!tx || this.gameOver || this.victory || this.paused) return;
    const remaining = tx.expiresAt - this.timeAlive;
    if (remaining <= 0) { this._edenTransmission = null; return; }

    // Fade out over last 0.6 s
    const fadeAlpha = remaining < 0.6 ? remaining / 0.6 : 1;
    const PW = 212, PH = 68;
    const PX = WIDTH - PW - 6;
    const PY = 50;   // below top HUD bar (y=44); same row as active-relic HUD (left side)

    ctx.globalAlpha = fadeAlpha;
    this._drawEdenTransmission(ctx, {
      x: PX, y: PY, w: PW, h: PH,
      messages: [tx.message],
      edenMem:  this.meta ? this.meta.getEdenMemory() : 0,
      title:    tx.title || 'EDEN CORE',
    });
    ctx.globalAlpha = 1;
  }

  // ── Post-Arena NULL decision panel ─────────────────────────────────────────
  // Shown when the player completes the NULL Breach Arena. Freezes gameplay.
  // Options: CONTINUE ENDLESS / ENTER CHAOS MODE / RETURN MAIN MENU
  _drawPostArenaChoice(ctx) {
    if (!this._postArenaChoice) return;
    const et = this.timeAlive - this._pacMsgAt;

    // Stage NULL dialogue lines as time elapses
    if (et > 0.3 && this._pacMsgStep < 1) this._pacMsgStep = 1;
    if (et > 1.3 && this._pacMsgStep < 2) this._pacMsgStep = 2;
    if (et > 2.2 && this._pacMsgStep < 3) this._pacMsgStep = 3;
    if (et > 3.0 && this._pacMsgStep < 4) this._pacMsgStep = 4;
    if (et > 3.7 && this._pacMsgStep < 5) this._pacMsgStep = 5;

    const dialogueLines = [
      'You reached the breach layer.',
      'The Arena was not an exit. It was a test.',
      'Endless survival keeps the system open.',
      'Chaos Mode will force NULL EDEN to answer.',
      'Choose your route.',
    ];
    const options    = ['CONTINUE ENDLESS', 'ENTER CHAOS MODE', 'RETURN MAIN MENU'];
    const optColors  = ['#2ee6f6', '#ff2d95', '#ff8a8a'];
    const chaosAvail = !this._chaosMode;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Semi-transparent backdrop
    ctx.fillStyle = 'rgba(0,4,14,0.82)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Panel geometry
    const PW = 560, PH = 390;
    const PX = Math.round((WIDTH  - PW) / 2);
    const PY = Math.round((HEIGHT - PH) / 2);

    // Panel background
    ctx.fillStyle = 'rgba(2,8,26,0.97)';
    ctx.strokeStyle = '#2ee6f6';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(PX, PY, PW, PH, 8); ctx.fill(); ctx.stroke();

    // Neon gradient top border
    const _tg = ctx.createLinearGradient(PX, PY, PX + PW, PY);
    _tg.addColorStop(0, 'transparent'); _tg.addColorStop(0.3, '#2ee6f6');
    _tg.addColorStop(0.7, '#ff2d95');   _tg.addColorStop(1, 'transparent');
    ctx.strokeStyle = _tg; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(PX + 16, PY); ctx.lineTo(PX + PW - 16, PY); ctx.stroke();

    // Corner accents
    const _CA = 10;
    ctx.strokeStyle = 'rgba(46,230,246,0.65)'; ctx.lineWidth = 1.5;
    for (const [_cx, _cy, _sx, _sy] of [[PX,PY,1,1],[PX+PW,PY,-1,1],[PX,PY+PH,1,-1],[PX+PW,PY+PH,-1,-1]]) {
      ctx.beginPath(); ctx.moveTo(_cx+_sx*_CA,_cy); ctx.lineTo(_cx,_cy); ctx.lineTo(_cx,_cy+_sy*_CA); ctx.stroke();
    }

    // Blinking signal indicator
    const _blink = Math.sin(this.timeAlive * 4) > 0;
    ctx.fillStyle = _blink ? '#ff2d95' : 'rgba(255,45,149,0.25)';
    ctx.beginPath(); ctx.arc(PX + 18, PY + 22, 4, 0, Math.PI * 2); ctx.fill();

    // NULL TRANSMISSION header
    ctx.font = 'bold 11px Consolas,monospace'; ctx.fillStyle = '#2ee6f6'; ctx.textAlign = 'left';
    ctx.fillText('NULL TRANSMISSION', PX + 32, PY + 26);
    ctx.font = '9px Consolas,monospace'; ctx.fillStyle = 'rgba(46,230,246,0.4)';
    ctx.fillText('- - - - - - - - - - - - - - - - - - - - - -', PX + 32, PY + 40);

    // Staged dialogue lines
    let _ty = PY + 65;
    ctx.textAlign = 'center';
    for (let _i = 0; _i < this._pacMsgStep && _i < dialogueLines.length; _i++) {
      const _line = dialogueLines[_i];
      if (_i === 0) { ctx.font = 'bold 14px Consolas,monospace'; ctx.fillStyle = '#e0f8ff'; }
      else if (_i === dialogueLines.length - 1 && this._pacMsgStep >= 5) { ctx.font = 'bold 13px Consolas,monospace'; ctx.fillStyle = '#ffd23c'; }
      else { ctx.font = '12px Consolas,monospace'; ctx.fillStyle = 'rgba(180,220,240,0.82)'; }
      ctx.fillText(_line, PX + PW / 2, _ty);
      _ty += 21;
    }

    // Option cards (shown after all dialogue appears)
    if (this._pacMsgStep >= 5) {
      const _OW = 480, _OH = 46, _OX = PX + (PW - _OW) / 2;
      let _oy = PY + 200;
      for (let _i = 0; _i < options.length; _i++) {
        const _sel     = _i === this._pacIdx;
        const _dis     = _i === 1 && !chaosAvail;
        const _col     = _dis ? '#666' : optColors[_i];
        ctx.fillStyle   = _sel && !_dis ? 'rgba(46,230,246,0.09)' : 'rgba(0,10,28,0.75)';
        ctx.strokeStyle = _sel && !_dis ? _col : (_dis ? '#333' : 'rgba(100,120,140,0.35)');
        ctx.lineWidth   = _sel && !_dis ? 2 : 1;
        ctx.beginPath(); ctx.roundRect(_OX, _oy, _OW, _OH, 6); ctx.fill(); ctx.stroke();
        if (_sel && !_dis) { ctx.shadowBlur = 14; ctx.shadowColor = _col; }
        ctx.font        = (_sel && !_dis ? 'bold ' : '') + '16px Consolas,monospace';
        ctx.fillStyle   = _dis ? '#555' : (_sel ? _col : 'rgba(175,200,220,0.72)');
        ctx.textAlign   = 'center';
        ctx.fillText(options[_i] + (_dis ? '  [ACTIVE]' : ''), _OX + _OW / 2, _oy + _OH / 2 + 6);
        ctx.shadowBlur  = 0; ctx.shadowColor = 'transparent';
        _oy += _OH + 8;
      }
    }

    // Footer hint
    ctx.font = '10px Consolas,monospace'; ctx.fillStyle = 'rgba(130,155,175,0.6)'; ctx.textAlign = 'center';
    ctx.fillText('UP/DOWN SELECT   ENTER CONFIRM   ESC = CONTINUE ENDLESS', PX + PW / 2, PY + PH - 14);
    ctx.restore();
  }

  // Execute the chosen post-arena option.
  _selectPostArenaChoice(idx) {
    this._postArenaChoice = false;
    this._pacIdx          = 0;
    this._pacMsgStep      = 0;
    if (idx === 0) {
      // CONTINUE ENDLESS
      this.triggerAnnouncement('ENDLESS SURVIVAL CONTINUING', '#2ee6f6');
      this._queueEdenTransmission('EDEN CORE: Signal stabilized. Survival continues.', { priority: 2, duration: 5 });
    } else if (idx === 1 && !this._chaosMode) {
      // ENTER CHAOS MODE — force immediate Chaos
      this._chaosMode       = true;
      this._chaosTransTimer = -1;
      this.forceChaos       = false;
      this.audio?.startChaosMusic();
      this.triggerAnnouncement('CHAOS MODE ENGAGED', '#ff2d95');
      if (this.meta) {
        const _cmsg = 'NULL EDEN BOUNDARY BREACHED. Chaos signal accepted.';
        this.meta.addSystemMessage(_cmsg);
        this._queueEdenTransmission(_cmsg, { title: 'NULL TRANSMISSION', priority: 3, duration: 7 });
        this._chaosEdenAwarded = true;
      }
      // Rearm all boss rotation slots for Chaos
      this.titanSpawned        = false; this.titanSpawnTimer        = 0;
      this.annihilatorSpawned  = false; this.annihilatorSpawnTimer  = 0;
      this.bloodfangSpawned    = false; this.bloodfangSpawnTimer    = 0;
      this.cyberSerpentSpawned = false; this.cyberSerpentSpawnTimer = 0;
      this.cyberDragonSpawned  = false; this.cyberDragonSpawnTimer  = 0;
      this.doubleDemonsSpawned = false; this.doubleDemonsSpawnTimer = 0;
      this._endlessBossTimer   = 5;
      this.acidRainTimer       = 30;
      this._airstrikeTimer     = 15;
      this._lightningTimer     = 20;
    } else {
      // RETURN MAIN MENU — save Endless records first
      if (this.endless && !this.rewardsGranted) this._grantRewards();
      this.goToMainMenu();
    }
  }

  /**
   * Reusable Eden Core framed transmission panel (canvas, screen-space).
   * Called from HUD end screen and future arena second-chance mechanic.
   * opts: { x, y, w, h, messages[], edenMem, title }
   */
  _drawEdenTransmission(ctx, { x, y, w, h, messages = [], edenMem = 0, title = null }) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // ── outer box ──────────────────────────────────────────────────────────
    ctx.fillStyle   = 'rgba(0,8,22,0.93)';
    ctx.strokeStyle = '#1a4a70';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 4); ctx.fill(); ctx.stroke();

    // ── neon gradient top border ───────────────────────────────────────────
    const gbrd = ctx.createLinearGradient(x, y, x + w, y);
    gbrd.addColorStop(0,   'transparent');
    gbrd.addColorStop(0.25,'#3fd0ff');
    gbrd.addColorStop(0.75,'#a855f7');
    gbrd.addColorStop(1,   'transparent');
    ctx.strokeStyle = gbrd;
    ctx.lineWidth   = 1.5;
    ctx.beginPath(); ctx.moveTo(x + 10, y); ctx.lineTo(x + w - 10, y); ctx.stroke();

    // ── corner accents ─────────────────────────────────────────────────────
    const CA = 7;
    ctx.strokeStyle = 'rgba(46,230,246,0.65)';
    ctx.lineWidth   = 1;
    for (const [cx,cy,sx,sy] of [[x,y,1,1],[x+w,y,-1,1],[x,y+h,1,-1],[x+w,y+h,-1,-1]]) {
      ctx.beginPath();
      ctx.moveTo(cx + sx*CA, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + sy*CA);
      ctx.stroke();
    }

    // ── portrait area (left side) ──────────────────────────────────────────
    const portW  = Math.min(56, Math.floor(w * 0.16));
    const portH  = Math.round(portW / 0.841);  // match 941x1119 aspect ratio
    const portX  = x + 8;
    const portY  = y + Math.max(4, Math.floor((h - portH) / 2));

    ctx.strokeStyle = '#3fd0ff';
    ctx.lineWidth   = 1;
    ctx.strokeRect(portX - 1, portY - 1, portW + 2, portH + 2);

    const pimg = this._edenPortraitImg;
    if (pimg && this._edenPortraitLoaded && pimg.naturalWidth > 0) {
      ctx.fillStyle = 'rgba(0,5,15,.95)';
      ctx.fillRect(portX, portY, portW, portH);
      ctx.save();
      ctx.beginPath(); ctx.rect(portX, portY, portW, portH); ctx.clip();
      const aspect = pimg.naturalWidth / pimg.naturalHeight;
      const dw = portW, dh = Math.round(dw / aspect);
      ctx.drawImage(pimg, portX, portY, dw, dh);
      ctx.restore();
    } else {
      // Fallback: glowing AI circle
      ctx.fillStyle = 'rgba(0,10,26,.95)';
      ctx.fillRect(portX, portY, portW, portH);
      const fcx = portX + portW / 2, fcy = portY + portH * 0.5;
      const fr  = portW * 0.28;
      ctx.strokeStyle = 'rgba(46,230,246,0.6)';
      ctx.lineWidth   = 1;
      ctx.beginPath(); ctx.arc(fcx, fcy, fr, 0, Math.PI * 2); ctx.stroke();
      ctx.font      = `bold ${Math.round(portW * 0.3)}px Consolas,monospace`;
      ctx.fillStyle = '#3fd0ff';
      ctx.textAlign = 'center';
      ctx.fillText('◈', fcx, fcy + portW * 0.11);
      ctx.textAlign = 'left';
    }

    // ── text area (right of portrait) ─────────────────────────────────────
    const textX   = portX + portW + 10;
    const maxCols = Math.floor((w - portW - 28) / 6.2);
    let ty = y + 14;

    // Header line
    const hdr = title || `EDEN CORE  ·  MEM ${edenMem}%`;
    ctx.font      = 'bold 10px Consolas,monospace';
    ctx.fillStyle = '#3fd0ff';
    ctx.textAlign = 'left';
    ctx.fillText(hdr.slice(0, maxCols), textX, ty);
    ty += 15;

    // Separator dot-line
    ctx.fillStyle = 'rgba(46,230,246,0.25)';
    ctx.font      = '8px Consolas,monospace';
    ctx.fillText('· · · · · · · · · · · · · · · · · · · ·'.slice(0, maxCols + 4), textX, ty);
    ty += 13;

    // Messages
    if (messages.length > 0) {
      ctx.font      = '10px Consolas,monospace';
      ctx.fillStyle = 'rgba(150,210,255,0.82)';
      for (const line of messages.slice(0, 3)) {
        if (ty + 12 > y + h - 4) break;
        ctx.fillText(String(line).slice(0, maxCols), textX, ty);
        ty += 13;
      }
    } else {
      ctx.font      = '10px Consolas,monospace';
      ctx.fillStyle = 'rgba(63,208,255,0.4)';
      ctx.fillText('NULL EDEN is listening.', textX, ty);
    }

    ctx.restore();
  }

  
  // ═══════════════════════════════════════════════════════════════════════════
  // NULL BREACH ARENA — Endless-only 2-minute elite pressure event.
  // Triggers at 8:00 (first) and 16:00 (second), max 2 per run. Suppresses
  // normal spawns; runs mini-bosses + airstrike ships as arena pressure.
  // EDEN CORE extraction rescues the player from death inside the arena once.
  // ═══════════════════════════════════════════════════════════════════════════

  // Check trigger windows each frame (Endless-only, gated on _checkNullBreachArena call).
  // Uses endlessElapsed (time since Endless began) — NOT total timeAlive — so direct Endless
  // and Act1→Endless both trigger at exactly 5:00 and 12:00 of Endless time.
  // Done flags are set ONLY when the arena actually starts, so hazard-blocked windows retry
  // every frame instead of being permanently skipped.
  _checkNullBreachArena() {
    if (this._chaosMode || this.gameOver || this.victory || this.paused) return;
    if (this._nullBreachArena) return;
    if (this.upgradeUI || this.mutationUI) return;

    const endlessElapsed = this.timeAlive - this._endlessStartedAt;
    // Defer (but do NOT permanently skip) if a hazard would stack badly.
    const hazardActive = !!(this.acidRain || this.airstrikeShips.length > 0);

    if (!this._nullBreach1Done && endlessElapsed >= 300) {   // 5:00 Endless
      if (!hazardActive) {
        this._nullBreach1Done = true;
        this._enterNullBreachArena();
      }
      return;   // stay in window — retry next frame if hazard blocked it
    }
    if (!this._nullBreach2Done && endlessElapsed >= 720) {   // 12:00 Endless
      if (!hazardActive) {
        this._nullBreach2Done = true;
        this._enterNullBreachArena();
      }
    }
  }

  // Activate the Null Breach Arena.
  _enterNullBreachArena() {
    this._nullBreachActive = true;
    this._nullBreachArena  = {
      timer:              120,    // 2-minute countdown
      spawnCd:            5,      // first mini-boss rearm in 5s
      airCd:              8,      // first airstrike in 8s
      majorCd:            0,      // major boss cooldown (starts ready — first one at elapsed≥30)
      miniBossIdx:        0,      // round-robin index for titan/bloodfang/annihilator
      majorIdx:           0,      // round-robin index for serpent/dragon/doubleDemon
      phase:              0,
      kills:              0,      // bosses/elites killed inside arena (for reward calc)
      phase1Transmitted:  false,
      midTransmitted:     false,
      finalTransmitted:   false,
    };

    // Track for end screen
    if (!this._arenaResult) {
      this._arenaResult = { entered: 1, completed: 0, rescueUsed: 0 };
    } else {
      this._arenaResult.entered++;
    }

    // Announcement + audio
    this.triggerAnnouncement('⚠ NULL BREACH DETECTED', '#ff44cc');
    this.audio?.playEventWarning?.();

    // EDEN CORE transmissions
    this._queueEdenTransmission('NULL BREACH DETECTED.', { priority: 2, duration: 5 });
    const _self = this;
    setTimeout(() => {
      if (_self._nullBreachArena) {
        _self._queueEdenTransmission(
          'EDEN CORE: Only elite signals can enter the breach.', { priority: 2, duration: 6 }
        );
      }
    }, 2800);

    // System Feed
    if (this.meta) {
      this.meta.addSystemMessage('NULL BREACH DETECTED. ENTERING UNSTABLE MEMORY POCKET.');
    }
  }

  // Per-frame update: continuous boss/elite/aircraft gauntlet for the full 2 minutes.
  // Pressure never stops — when a boss dies, a new one queues up after a short delay.
  _updateNullBreachArena(dt) {
    const arena = this._nullBreachArena;
    if (!arena) return;

    arena.timer   -= dt;
    arena.spawnCd -= dt;
    arena.airCd   -= dt;
    arena.majorCd -= dt;

    const elapsed = 120 - arena.timer;
    const ARENA_HP_MULT = 1.6;  // arena bosses are 60% tankier

    // ── Boost freshly-spawned arena bosses (once per boss instance) ──
    for (const b of [this.titanBoss, this.bloodfangBoss, this.annihilatorBoss,
                      this.cyberSerpentBoss, this.cyberDragonBoss]) {
      if (b && b.hp > 0 && !b._arenaHpBoosted) {
        b._arenaHpBoosted = true;
        b.hp    = Math.round(b.hp    * ARENA_HP_MULT);
        b.maxHp = Math.round(b.maxHp * ARENA_HP_MULT);
      }
    }
    const _dd = this.doubleDemonsBoss;
    if (_dd && _dd.hp > 0 && !_dd._arenaHpBoosted) {
      _dd._arenaHpBoosted = true;
      _dd.hp    = Math.round(_dd.hp    * ARENA_HP_MULT);
      _dd.maxHp = Math.round(_dd.maxHp * ARENA_HP_MULT);
    }

    // ── Aircraft pressure: keep ships in the air the whole arena ──
    if (arena.airCd <= 0 && this.airstrikeShips.length < 2) {
      this._spawnAirstrike();
      arena.airCd = 25 + Math.random() * 10;
    }

    // Count currently active bosses
    const activeMinis = [this.titanBoss, this.bloodfangBoss, this.annihilatorBoss]
      .filter(b => b && b.hp > 0).length;
    const activeMajors = [this.cyberSerpentBoss, this.cyberDragonBoss]
      .filter(b => b && b.hp > 0).length +
      (this.doubleDemonsBoss && this.doubleDemonsBoss.hp > 0 ? 1 : 0);

    // ── Mini-boss pressure: keep at least 1 mini-boss alive at all times ──
    // After one dies, spawnCd creates a ~6-10s gap before the next arrives.
    if (arena.spawnCd <= 0 && activeMinis < 1) {
      const slot = arena.miniBossIdx % 3;
      arena.miniBossIdx++;
      if (slot === 0) {
        this.titanSpawned = false; this.titanSpawnTimer = 0;
      } else if (slot === 1) {
        this.bloodfangSpawned = false; this.bloodfangSpawnTimer = 0;
      } else {
        this.annihilatorSpawned = false; this.annihilatorSpawnTimer = 0;
      }
      arena.spawnCd = 8 + Math.random() * 4;   // 8–12s until next recheck
    }

    // ── Major boss rotation: Serpent → Dragon → Double Demons → repeat ──
    // First major boss enters at 30s elapsed; subsequents after a 20s cooldown.
    if (elapsed >= 30 && activeMajors < 1 && arena.majorCd <= 0) {
      const slot = arena.majorIdx % 3;
      arena.majorIdx++;
      if (slot === 0) {
        // Cyber Serpent
        this.cyberSerpentSpawned    = false;
        this.cyberSerpentSpawnTimer = 0;
        this._queueEdenTransmission(
          'SERPENT ECHO: Flame path reopened.', { priority: 2, duration: 5 }
        );
      } else if (slot === 1) {
        // Cyber Dragon
        this.cyberDragonSpawned    = false;
        this.cyberDragonSpawnTimer = 0;
        this._queueEdenTransmission(
          'DRAGON ECHO: Cryo memory has breached containment.', { priority: 2, duration: 5 }
        );
      } else {
        // Double Demons
        this.doubleDemonsSpawned    = false;
        this.doubleDemonsSpawnTimer = 0;
        this._queueEdenTransmission(
          'DEMON ECHO: Twin corruption entering the breach.', { priority: 2, duration: 5 }
        );
      }
      arena.majorCd = 20;   // 20s before we try another major after this one dies
    }

    // ── Phase-milestone EDEN CORE messages ──
    if (!arena.phase1Transmitted && elapsed >= 30) {
      arena.phase1Transmitted = true;
      this._queueEdenTransmission('BOSS TRACE INCOMING.', { priority: 2, duration: 5 });
    }
    if (!arena.midTransmitted && elapsed >= 60) {
      arena.midTransmitted = true;
      this._queueEdenTransmission(
        'EDEN CORE: Only elite signals can enter the breach.', { priority: 1, duration: 5 }
      );
    }
    if (!arena.finalTransmitted && elapsed >= 90) {
      arena.finalTransmitted = true;
      this._queueEdenTransmission(
        'EDEN CORE: The breach is collapsing. Survive the pressure.', { priority: 2, duration: 6 }
      );
    }

    // Arena complete
    if (arena.timer <= 0) this._completeNullBreachArena();
  }

  // Arena timer reached zero — success. Performance-based fragment reward (capped at 4).
  _completeNullBreachArena() {
    const arenaKills = this._nullBreachArena?.kills || 0;
    this._nullBreachArena  = null;
    this._nullBreachActive = false;
    this._endlessBossTimer = Math.max(this._endlessBossTimer, 30);  // breathing room after arena

    // Rewards
    this.score += 2000;
    this.player.gainXp(40, this.floatingTexts);

    if (this.meta) {
      this.meta.addEdenMemory(1);
      this.meta.addCredits(6);

      // Performance-based NULL Fragment reward (max 4):
      //   +2 survived full arena
      //   +1 killed ≥3 arena bosses/majors
      //   +1 no EDEN CORE rescue used
      let frags = 2;                              // baseline: survived
      if (arenaKills >= 3) frags += 1;            // aggressive clear
      if (!this._arenaRescueUsed) frags += 1;     // clean run (always true here, rescue ends arena)
      frags = Math.min(frags, 4);                 // hard cap

      if (frags > 0 && typeof this.meta.addProtocolFragment === 'function') {
        this.meta.addProtocolFragment(frags);
        this.floatingTexts.push(
          new FloatingText('NULL FRAGMENT +' + frags, this.player.pos.clone(), '#ff66ff', 2.2)
        );
        this.meta.addSystemMessage('NULL FRAGMENT SECURED. PROTOCOL FRAGMENTS +' + frags + '.');
      }
      this.meta.addSystemMessage('NULL BREACH CLEARED. ARENA TRACE ARCHIVED.');
    }

    if (this._arenaResult) this._arenaResult.completed++;

    // EDEN CORE
    // ── Arena relic effects (fire before announcements) ──────────────────────
    if (this.meta) {
      // Unlock prereq: completed arena (gates Breach Crown purchase)
      this.meta.recordBossKill('null_breach_cleared');
      // Unlock prereq: 3+ arena kills (gates Elite Signal Core purchase)
      if (arenaKills >= 3) this.meta.recordBossKill('arena_elite_3');
    }
    // Breach Crown: clean arena (no rescue) → +0.5 Pulse Damage rest of run
    if (this.meta && !this._arenaRescueUsed && !this._breachCrownActive
        && this.meta.isRelicUnlocked('breach_crown')) {
      this._breachCrownActive = true;
      this.player.upgrades['Pulse Damage'] = (this.player.upgrades['Pulse Damage'] || 0) + 0.5;
      this.floatingTexts.push(
        new FloatingText('BREACH CROWN: +DMG', this.player.pos.clone(), '#ff88ff', 2.2)
      );
      try { this._queueEdenTransmission(
        'BREACH CROWN STABILIZED. Arena dominance recorded.', { priority: 2, duration: 5 }
      ); } catch(_) {}
    }
    // Elite Signal Core: +30 score per arena boss kill at completion
    if (this.meta && arenaKills > 0 && this.meta.isRelicUnlocked('elite_signal_core')) {
      const eliteBonus = arenaKills * 30;
      this.score += eliteBonus;
      this.floatingTexts.push(
        new FloatingText('ELITE CORE: +' + eliteBonus, this.player.pos.clone(), '#ffcc44', 1.8)
      );
      try { this._queueEdenTransmission(
        'ELITE SIGNAL CORE INDEXED. Arena pressure converted.', { priority: 1, duration: 5 }
      ); } catch(_) {}
    }
    this._queueEdenTransmission(
      'EDEN CORE: Arena trace archived.', { priority: 3, duration: 7 }
    );
    this.triggerAnnouncement('NULL BREACH CLEARED', '#00e6ff');
    this.floatingTexts.push(
      new FloatingText('✓ BREACH SURVIVED', this.player.pos.clone(), '#00e6ff', 2.0)
    );
    this.screenShake.trigger(6, 0.4);

    // ── Post-Arena NULL decision panel ───────────────────────────────────────
    this._postArenaChoice = true;
    this._pacIdx          = 0;
    this._pacMsgStep      = 0;
    this._pacMsgAt        = this.timeAlive;
    // Kick off the NULL transmission sequence via the upper-right popup too
    this._queueEdenTransmission(
      'NULL TRANSMISSION: You reached the breach layer. Choose your route.',
      { title: 'NULL TRANSMISSION', priority: 3, duration: 9 }
    );
  }

  // Player died inside the arena — EDEN CORE extracts them (once per run).
  _triggerArenaRescue() {
    this._arenaRescueUsed  = true;
    this._nullBreachArena  = null;
    this._nullBreachActive = false;
    if (this._arenaResult) this._arenaResult.rescueUsed = 1;
    this._endlessBossTimer = Math.max(this._endlessBossTimer, 30);

    // Restore player at 30% HP with brief phoenix i-frames
    this.player.hp          = Math.ceil(this.player.maxHp * 0.30);
    this.phoenixReviveTimer = 2.5;

    // Arena relic: Second Signal Debt — rescue grants a 6s protective shield
    if (this.meta) this.meta.recordBossKill('arena_rescue_used');
    if (this.meta && !this._secondDebtFired
        && this.meta.isRelicUnlocked('second_signal_debt')) {
      this._secondDebtFired = true;
      this.player.shieldTimer = Math.max(this.player.shieldTimer, 6.0);
      this.floatingTexts.push(
        new FloatingText('SIGNAL DEBT: SHIELD', this.player.pos.clone(), '#00e6ff', 2.0)
      );
      try { this._queueEdenTransmission(
        'SECOND SIGNAL DEBT RECORDED. Survival was borrowed.', { priority: 2, duration: 5 }
      ); } catch(_) {}
    }

    // EDEN CORE transmissions
    this._queueEdenTransmission(
      'EXTRACTION COMPLETE. Reward sequence denied.', { priority: 3, duration: 6, clipId: 'extract' }
    );
    const _self = this;
    setTimeout(() => {
      _self._queueEdenTransmission(
        'EDEN CORE: Do not waste the second signal.', { priority: 2, duration: 5 }
      );
    }, 4000);

    if (this.meta) {
      this.meta.addSystemMessage('NULL BREACH FAILED. PHENIX TRACE RESTORED.');
    }

    this.triggerAnnouncement('EDEN CORE: EXTRACTION COMPLETE', '#00e6ff');
    this.floatingTexts.push(
      new FloatingText('EDEN CORE: EXTRACTED', this.player.pos.clone(), '#00e6ff', 2.5)
    );
    this.screenShake.trigger(10, 0.7);
  }

  // Draw the arena atmospheric overlay (image wash + neon ring + timer bar).
  _drawNullBreachArena(ctx) {
    const arena = this._nullBreachArena;
    if (!arena) return;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // ── Atmospheric image wash ───────────────────────────────────────────────
    if (this._nullBreachImgLoaded && this._nullBreachImg) {
      const img  = this._nullBreachImg;
      const iw   = img.naturalWidth  || WIDTH;
      const ih   = img.naturalHeight || (HEIGHT - 44);
      const sc   = Math.max(WIDTH / iw, (HEIGHT - 44) / ih);
      const dw   = iw * sc, dh = ih * sc;
      ctx.globalAlpha = 0.13;
      ctx.drawImage(img, (WIDTH - dw) / 2, 44 + ((HEIGHT - 44) - dh) / 2, dw, dh);
      ctx.globalAlpha = 1;
    } else {
      // Fallback tint
      ctx.fillStyle = 'rgba(50,0,70,0.09)';
      ctx.fillRect(0, 44, WIDTH, HEIGHT - 44);
    }

    // ── Neon arena border ────────────────────────────────────────────────────
    const pulse = 0.7 + 0.3 * Math.sin(performance.now() / 420);
    ctx.strokeStyle = `rgba(0,230,255,${(0.45 * pulse).toFixed(2)})`;
    ctx.lineWidth   = 2;
    ctx.strokeRect(4, 48, WIDTH - 8, HEIGHT - 56);
    ctx.strokeStyle = `rgba(200,0,255,${(0.22 * pulse).toFixed(2)})`;
    ctx.lineWidth   = 1;
    ctx.strokeRect(8, 52, WIDTH - 16, HEIGHT - 64);

    // ── Timer bar (just below the HUD bar, centered horizontally) ────────────
    const remSecs = Math.max(0, Math.ceil(arena.timer));
    const mm      = Math.floor(remSecs / 60).toString().padStart(2, '0');
    const ss      = (remSecs % 60).toString().padStart(2, '0');
    const urgent  = arena.timer < 30;

    const panW = 510, panH = 22, panX = Math.round((WIDTH - panW) / 2), panY = 46;
    const bg = ctx.createLinearGradient(panX, panY, panX + panW, panY);
    bg.addColorStop(0,    'rgba(0,0,0,0)');
    bg.addColorStop(0.07, 'rgba(0,6,18,0.90)');
    bg.addColorStop(0.93, 'rgba(0,6,18,0.90)');
    bg.addColorStop(1,    'rgba(0,0,0,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(panX, panY, panW, panH);

    // Label left
    ctx.font      = 'bold 11px Consolas, monospace';
    ctx.fillStyle = '#ff44cc';
    ctx.textAlign = 'left';
    ctx.fillText('⬡ NULL BREACH ARENA', panX + 12, panY + 15);

    // Timer right
    const tAlpha  = urgent ? (0.6 + 0.4 * pulse) : 1;
    ctx.font      = 'bold 12px Consolas, monospace';
    ctx.fillStyle = urgent ? `rgba(255,60,60,${tAlpha.toFixed(2)})` : '#00e6ff';
    ctx.textAlign = 'right';
    ctx.fillText(`SURVIVE: ${mm}:${ss}`, panX + panW - 12, panY + 15);

    ctx.textAlign = 'left';
    ctx.restore();
  }

  _drawNpcWalkerHUD(ctx) {
    if (!this._npcWalker) return;
    if (this.gameOver || this.victory) return;
    if (this.upgradeUI || this.mutationUI) return;
    // Position: right side, below Eden transmission area (y=90+), above ultimate (HEIGHT-66)
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const panelW = 172;
    const panelX = WIDTH - panelW - 8;
    const panelY = 92;
    this._npcWalker.drawHUDPanel(ctx, panelX, panelY, panelW, this._walkerSummonCd);
    ctx.restore();
  }

  _drawActiveRelicHUD(ctx) {
    if (!this.meta) return;
    const _charId     = this.player?.characterId || '';
    const ownedRelics = RELIC_DEFS.filter(r => {
      if (!this.meta.isRelicUnlocked(r.id)) return false;
      if (r.reqChar && r.reqChar !== _charId) return false;
      return true;
    });

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const MAX_SLOTS = 8;
    const SLOT      = 32;     // outer slot size (px)
    const PAD       = 5;      // icon padding inside slot
    const GAP       = 5;      // gap between slots
    const startX    = 8;
    const labelH    = 12;     // height of "RELICS" label row
    const startY    = 50;
    const iconSz    = SLOT - PAD * 2;
    const t         = performance.now() / 1000;
    const pulse     = 0.65 + 0.35 * Math.sin(t * 2.2);
    const active    = Math.min(ownedRelics.length, MAX_SLOTS);

    // ── "RELICS" label ────────────────────────────────────────────────────────
    ctx.font      = 'bold 9px Consolas, monospace';
    ctx.fillStyle = 'rgba(46,230,246,0.4)';
    ctx.textAlign = 'left';
    ctx.fillText('RELICS', startX + 1, startY + labelH - 1);

    const slotY = startY + labelH + 2;

    // ── Slot helpers ──────────────────────────────────────────────────────────
    function _slotColors(r) {
      if (!r) return { border:'rgba(30,60,70,0.3)', bg:'rgba(2,5,10,0.35)', glow:'rgba(0,0,0,0)', fg:'#2ee6f6' };
      if (r.type === 'boss')      return { border:`rgba(255,153,0,${(0.5+0.3*pulse).toFixed(2)})`,   bg:'rgba(18,7,0,0.82)',  glow:`rgba(255,153,0,${(0.10*pulse).toFixed(2)})`,   fg:'#ff9900' };
      if (r.type === 'character') return { border:`rgba(168,85,247,${(0.5+0.3*pulse).toFixed(2)})`,  bg:'rgba(10,3,18,0.82)', glow:`rgba(168,85,247,${(0.10*pulse).toFixed(2)})`,  fg:'#a855f7' };
      if (r.type === 'arena')     return { border:`rgba(255,80,200,${(0.5+0.3*pulse).toFixed(2)})`,  bg:'rgba(18,0,10,0.82)', glow:`rgba(255,80,200,${(0.10*pulse).toFixed(2)})`,  fg:'#ff55cc' };
      return                             { border:`rgba(46,230,246,${(0.5+0.3*pulse).toFixed(2)})`,  bg:'rgba(2,10,18,0.82)', glow:`rgba(46,230,246,${(0.10*pulse).toFixed(2)})`,   fg:'#2ee6f6' };
    }

    // Rounded-rect helper (safe: Canvas roundRect widely supported; fallback via rect)
    function _rr(cx, x, y, w, h, r2) {
      if (cx.roundRect) { cx.beginPath(); cx.roundRect(x, y, w, h, r2); }
      else              { cx.beginPath(); cx.rect(x, y, w, h); }
    }

    // ── Draw slots ────────────────────────────────────────────────────────────
    for (let i = 0; i < MAX_SLOTS; i++) {
      const sx = startX + i * (SLOT + GAP);
      const sy = slotY;
      const r  = i < active ? ownedRelics[i] : null;
      const c  = _slotColors(r);

      // Outer glow (filled slots only)
      if (r) {
        ctx.fillStyle = c.glow;
        _rr(ctx, sx - 2, sy - 2, SLOT + 4, SLOT + 4, 6);
        ctx.fill();
      }
      // Slot background
      ctx.fillStyle = c.bg;
      _rr(ctx, sx, sy, SLOT, SLOT, 4);
      ctx.fill();
      // Slot border
      ctx.strokeStyle = c.border;
      ctx.lineWidth   = r ? 1.2 : 0.6;
      _rr(ctx, sx + 0.5, sy + 0.5, SLOT - 1, SLOT - 1, 4);
      ctx.stroke();

      // Icon / fallback letter
      if (r) {
        const ix  = sx + PAD;
        const iy  = sy + PAD;
        const img = this._relicIconCache?.[r.id];
        if (img && img.complete && img.naturalWidth > 0) {
          ctx.drawImage(img, ix, iy, iconSz, iconSz);
        } else {
          // Fallback: icon PNG missing — show 3-char abbreviation so a single letter
          // (e.g. "S" for Second Signal Debt) never confuses the player.
          const _abbr = (r.abbr || r.name.slice(0, 3)).toUpperCase();
          ctx.font      = 'bold 9px Consolas, monospace';
          ctx.fillStyle = c.fg;
          ctx.textAlign = 'center';
          ctx.fillText(_abbr, sx + SLOT / 2, sy + SLOT / 2 + 3);
          // Tiny type tag (ARENA / BOSS / etc.) for additional context
          ctx.font      = '7px Consolas, monospace';
          ctx.globalAlpha = 0.55;
          ctx.fillText(r.type.slice(0, 5).toUpperCase(), sx + SLOT / 2, sy + SLOT - 4);
          ctx.globalAlpha = 1;
          ctx.textAlign = 'left';
        }
      }
    }

    // ── Capacity dots ─────────────────────────────────────────────────────────
    const dotsY  = slotY + SLOT + 5;
    const dotR   = 2;
    const dotStep= 9;
    const dotsTotal = MAX_SLOTS * dotStep - (dotStep - dotR * 2);
    const dotX0  = startX + Math.round(((MAX_SLOTS * (SLOT + GAP) - GAP) - dotsTotal) / 2);

    for (let i = 0; i < MAX_SLOTS; i++) {
      const dx = dotX0 + i * dotStep + dotR;
      const dy = dotsY + dotR;
      const r  = i < active ? ownedRelics[i] : null;
      ctx.beginPath();
      ctx.arc(dx, dy, dotR, 0, Math.PI * 2);
      if (r) {
        const a  = (0.7 + 0.3 * pulse).toFixed(2);
        ctx.fillStyle = r.type === 'boss'      ? `rgba(255,153,0,${a})`
          : r.type === 'character' ? `rgba(168,85,247,${a})`
          : r.type === 'arena'     ? `rgba(255,80,200,${a})`
          :                          `rgba(46,230,246,${a})`;
      } else {
        ctx.fillStyle = 'rgba(30,60,70,0.35)';
      }
      ctx.fill();
    }

    // ── Active Chaos Law indicator ──────────────────────────────────────────────
    if (this.runChaosLaw) {
      const _lawLabel = this.runChaosLaw === 'blood_grid'        ? 'BLOOD GRID'
                      : this.runChaosLaw === 'frozen_eden'       ? 'FROZEN EDEN'
                      : this.runChaosLaw === 'no_mercy_protocol' ? 'NO MERCY'
                      : this.runChaosLaw.toUpperCase().replace(/_/g, ' ');
      const _lawColor = this.runChaosLaw === 'blood_grid'        ? '#ef4444'
                      : this.runChaosLaw === 'frozen_eden'       ? '#00ccff'
                      : this.runChaosLaw === 'no_mercy_protocol' ? '#fbbf24'
                      : '#2ee6f6';
      ctx.font      = 'bold 7px Consolas, monospace';
      ctx.fillStyle = _lawColor + '99';
      ctx.textAlign = 'left';
      ctx.fillText('CHAOS: ' + _lawLabel, startX + 1, dotsY + dotR * 2 + 10);
    }

    ctx.restore();
  }

    _drawScanlines(ctx) {
    if (!this._scanlineBuilt) {
      this._scanlineBuilt = true;
      const c = document.createElement('canvas');
      c.width = 1; c.height = 3;
      const g = c.getContext('2d');
      g.fillStyle = 'rgba(0,0,0,1)';
      g.fillRect(0, 2, 1, 1);          // one dark line every 3 px
      this._scanlinePattern = ctx.createPattern(c, 'repeat');
    }
    if (!this._scanlinePattern) return;
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = this._scanlinePattern;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.restore();
  }

  _titanShockwave(t) {
    this._titanShockwaves.push({ pos: t.pos.clone(), radius: t.radius, alpha: 1.0, hit: false });
    this.screenShake.trigger(2, 0.1);
    this.audio?.playTitanShockwave();
  }

  _titanBeam(t) {
    const dir = safeNormalize(this.player.pos.sub(t.pos));
    if (dir.lengthSq() === 0) return;
    this._titanBeams.push({ pos: t.pos.clone(), dir, speed: 420, life: 3.5, radius: 10, hit: false });
    this.screenShake.trigger(2, 0.1);
    this.audio?.playTitanBeam();
  }

  _titanDie() {
    const t = this.titanBoss;
    if (!t) return;
    this.score = (this.score ?? 0) + Math.round(300 * this._getActiveChaosLawModifiers().scoreMult);
    this.player.gainXp(25, this.floatingTexts);
    const titanCredits = this._awardCredits(12 + Math.floor(Math.random() * 9));   // 12..20 (×Grid Investor)
    this.overload = Math.max(0, this.overload - 10);
    this.floatingTexts.push(new FloatingText('TITAN DEFEATED',     t.pos.clone(),                            YELLOW, 2.5));
    this.floatingTexts.push(new FloatingText('+' + titanCredits + ' GRID CREDITS',   new Vec2(t.pos.x, t.pos.y - 30),         GREEN,  2.5));
    this.floatingTexts.push(new FloatingText('NETWORK STABILIZED', new Vec2(t.pos.x, t.pos.y - 60),         CYAN,   2.5));
    this.triggerAnnouncement('TITAN DEFEATED — NETWORK STABILIZED', GREEN);
    this.screenShake.trigger(14, 1.0);
    this.particles.spawnHitSparks(t.pos, YELLOW);
    this.particles.spawnHitSparks(t.pos, PURPLE);
    this.particles.spawnExplosion(t.pos, [PURPLE, CYAN, YELLOW], 28);
    this.supportDrones    = [];
    // Protocol Fragment reward (suppressed inside arena — capped reward on completion)
    if (this._nullBreachActive) {
      if (this._nullBreachArena) this._nullBreachArena.kills = (this._nullBreachArena.kills || 0) + 1;
    } else if (this.meta && this.endless) {
      this.meta.protocolFragments += BOSS_KILL_PF;
      this.meta._save();
      this.floatingTexts.push(new FloatingText('+' + BOSS_KILL_PF + ' 🧩 FRAGMENT',
        new Vec2(t.pos.x, t.pos.y - 90), '#ff5ea8', 2.5));
    }
    // Boss Echo Archive (first kill only — no farming)
    if (this.meta && this.endless) {
      const firstEcho = this.meta.recordBossEcho('titan');
      if (firstEcho) {
        this.meta.addEdenMemory(1);
        this._queueEdenTransmission('TITAN ECHO ARCHIVED. Heavy impact pattern stored.', { priority: 2, duration: 5 });
        this.meta.addSystemMessage('TITAN ECHO ARCHIVED. HEAVY IMPACT PATTERN STORED.');
      }
    }
    this.titanBoss        = null;
    this._titanShockwaves = [];
    this._titanBeams      = [];
  }

  _drawTitan(ctx) {
    // Shockwave rings (draw even after boss dies until they fade)
    for (const sw of this._titanShockwaves) {
      ctx.save();
      ctx.globalAlpha = sw.alpha * 0.9;
      ctx.strokeStyle = PURPLE; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(sw.pos.x, sw.pos.y, sw.radius, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = CYAN; ctx.lineWidth = 1;
      ctx.globalAlpha = sw.alpha * 0.4;
      ctx.beginPath(); ctx.arc(sw.pos.x, sw.pos.y, sw.radius + 5, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    // Titan beams
    for (const b of this._titanBeams) {
      drawGlow(ctx, b.pos.x, b.pos.y, b.radius * 2, PURPLE, Math.min(0.6, b.life));
      ctx.save();
      ctx.globalAlpha = Math.min(1, b.life);
      ctx.fillStyle   = PURPLE;
      ctx.beginPath(); ctx.arc(b.pos.x, b.pos.y, b.radius, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = CYAN; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(b.pos.x, b.pos.y, b.radius, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    const t = this.titanBoss;
    if (!t || t.hp <= 0) return;

    const R = t.radius;

    // Pulsing aura
    const pulse = 0.4 + 0.35 * Math.sin(Date.now() / 200);
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = PURPLE; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(t.pos.x, t.pos.y, R + 10, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = CYAN; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(t.pos.x, t.pos.y, R + 18, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();

    // Sprite or fallback (additive body glow underneath)
    drawGlow(ctx, t.pos.x, t.pos.y, R, PURPLE, 0.30);
    const spr = this._titanSprite;
    if (spr && spr.complete && spr.naturalWidth > 0) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(spr, t.pos.x - R, t.pos.y - R, R * 2, R * 2);
      ctx.imageSmoothingEnabled = true;
    } else {
      ctx.fillStyle   = PURPLE;
      ctx.strokeStyle = CYAN; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(t.pos.x - R, t.pos.y - R, R * 2, R * 2, 8);
      ctx.fill(); ctx.stroke();
    }

    // Hit flash overlay
    if (t.hitFlash > 0) {
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.fillStyle   = WHITE;
      ctx.beginPath(); ctx.arc(t.pos.x, t.pos.y, R, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // HP bar above sprite (world-space)
    const bw = R * 2 + 20;
    const bx = t.pos.x - bw / 2;
    const by = t.pos.y - R - 20;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(bx - 1, by - 1, bw + 2, 8);
    ctx.fillStyle = RED;
    ctx.fillRect(bx, by, Math.round(bw * (t.hp / t.maxHp)), 6);

    // Name label
    ctx.font      = 'bold 10px Consolas, monospace';
    ctx.fillStyle = PURPLE;
    ctx.textAlign = 'center';
    ctx.fillText('AI OVERLOAD TITAN', t.pos.x, by - 3);
    ctx.textAlign = 'left';
  }

  // ── Matrix Annihilator mini-boss ──────────────────────────────────────────
  _nearestMatrix(pos) {
    if (!this.matrices.length) return null;
    const withCores = this.matrices.filter(m => m.hasCore());
    const pool = withCores.length ? withCores : this.matrices;
    return pool.reduce((a, b) => distance(pos, a.pos) < distance(pos, b.pos) ? a : b);
  }

  _spawnAnnihilator() {
    const R    = 46;
    const side = Math.random() < 0.5 ? -1 : 1;
    const pos  = new Vec2(
      WORLD_W / 2 + side * (WORLD_W / 2 - WORLD_MARGIN - R - 30),
      WORLD_H / 2
    );
    const annHp = Math.round((this.endless ? 460 : 600) * this._getActiveChaosLawModifiers().bossHpMult);     // Endless: killable range (Act 1 keeps 600)
    this.annihilatorBoss = {
      pos, hp: annHp, maxHp: annHp,
      radius: R, speed: 52, contactDamage: 16, hitFlash: 0,
      targetMatrix: this._nearestMatrix(pos),
      attackTimer: 3,
      shotTimer: 3,
    };
    this._bossAnnounce('MATRIX ANNIHILATOR INBOUND', RED);
    this.audio?.playBossSpawn();
    this.screenShake.trigger(6, 0.5);
    this.floatingTexts.push(
      new FloatingText('MATRIX ANNIHILATOR INBOUND', new Vec2(WIDTH / 2 - 230, HEIGHT / 2 - 60), RED, 3.0)
    );
    // Endless objective pressure: warn the player of the Nexus-erase override (max 2 erases/run).
    if (this.endless && (this._annihNexusKills || 0) < 2) {
      this.triggerAnnouncement('ANNIHILATOR OVERRIDE — DESTROY IT BEFORE IT ERASES A NEXUS', RED);
    }
  }

  // Ejects cores from the targeted Matrix (threatens it — never permanently destroys it).
  _annihilatorStrike(a, target) {
    let ejected = 0;
    for (let i = 0; i < 2; i++) {
      // Eject via stealCore so removed charge == ejected core value (conserved, no inflation).
      const core = target.stealCore();
      if (!core) break;
      const angle  = Math.random() * Math.PI * 2;
      const radius = randomRange(50, 110);
      core.pos = target.pos.add(new Vec2(Math.cos(angle) * radius, Math.sin(angle) * radius));
      this.groundCores.push(core);
      ejected++;
    }
    target.hackTimer = 0.6;  // flash the Matrix warning ring
    if (ejected > 0) {
      this.floatingTexts.push(new FloatingText('MATRIX BREACH!', target.pos.clone(), RED, 1.2));
      this.screenShake.trigger(4, 0.2);
      this.audio?.playMatrixBreach();
      if (target.stored <= 0) this.audio?.playMatrixCritical();
    }
  }

  _updateAnnihilator(dt) {
    if (!this.annihilatorSpawned) {
      this.annihilatorSpawnTimer -= dt;
      if (this.annihilatorSpawnTimer > 0) return;
      this.annihilatorSpawned = true;
      this._spawnAnnihilator();
    }

    const a = this.annihilatorBoss;
    if (!a || a.hp <= 0) return;

    if (a.hitFlash > 0) a.hitFlash -= dt;

    // ── Endless Nexus-erase countdown (objective pressure, not HP inflation) ──
    // A live Annihilator runs a ~3-min timer; on expiry it erases one Nexus and spikes Overload.
    // Hard-capped at 2 erases per run, and never if it would leave zero bases. Killing the
    // Annihilator before 0 cancels it (the timer lives on the boss object and dies with it).
    if (this.endless && (this._annihNexusKills || 0) < 2) {
      if (a.nexusCountdown === undefined) a.nexusCountdown = 180;
      a.nexusCountdown -= dt;
      if (!a._warned60 && a.nexusCountdown <= 60) {
        a._warned60 = true;
        this.triggerAnnouncement('ANNIHILATOR OVERRIDE — 60s TO NEXUS ERASE', ORANGE);
      }
      if (a.nexusCountdown <= 0) {
        this._annihNexusKills = (this._annihNexusKills || 0) + 1;
        a.nexusCountdown = 180;     // re-arm for a possible 2nd (final) erase
        a._warned60 = false;
        this._annihilatorDestroyNexus();
      }
    }

    // Re-acquire a target Matrix if the current one is gone or drained
    if (!a.targetMatrix || !this.matrices.includes(a.targetMatrix) || !a.targetMatrix.hasCore()) {
      a.targetMatrix = this._nearestMatrix(a.pos);
    }
    const target = a.targetMatrix;

    if (target) {
      const toMatrix = target.pos.sub(a.pos);
      const reach    = a.radius + MATRIX_RADIUS + 6;
      if (toMatrix.length() > reach) {
        a.pos.addMut(safeNormalize(toMatrix).scale(a.speed * dt));
        a.attackTimer = Math.min(a.attackTimer, 2.5);
      } else {
        // Adjacent to the Matrix — periodically annihilate (eject) its cores
        a.attackTimer -= dt;
        if (a.attackTimer <= 0) {
          a.attackTimer = 2.5;
          this._annihilatorStrike(a, target);
        }
      }
    }

    a.pos.x = clamp(a.pos.x, WORLD_MARGIN + a.radius, WORLD_W - WORLD_MARGIN - a.radius);
    a.pos.y = clamp(a.pos.y, WORLD_MARGIN + 40 + a.radius, WORLD_H - WORLD_MARGIN - a.radius);

    // Aimed energy shot — ranged pressure while it harasses the Matrix (fully dodgeable,
    // routed through the shared enemy-bullet → _damagePlayer fairness gate)
    a.shotTimer -= dt;
    if (a.shotTimer <= 0) {
      a.shotTimer = 3.2 + Math.random() * 0.8;            // 3.2–4.0s cadence
      const dir = safeNormalize(this.player.pos.sub(a.pos));
      if (dir.lengthSq() > 0) {
        this.spawnEnemyBullet(a.pos.clone(), dir, 260, 10, 9, PURPLE);
        this.audio?.playEnemyShoot();
      }
    }

    // Contact damage (same pattern as the Titan)
    if (distance(a.pos, this.player.pos) < a.radius + PLAYER_RADIUS) {
      const push = safeNormalize(this.player.pos.sub(a.pos));
      this.player.pos.addMut(push.scale(60 * dt));
      if (this.player.dashTimer <= 0 && this.phoenixReviveTimer <= 0) {
        const dmg = a.contactDamage * dt * (1 - this.player.contactDamageReduction);
        this.player.applyDamage(dmg);
        if (this.playerHitCooldown <= 0) {
          this.playerHitCooldown = 0.5;
          this.screenShake.trigger(4, 0.15);
          this.floatingTexts.push(new FloatingText(`-${Math.ceil(a.contactDamage)} HP`, this.player.pos.clone(), RED, 0.6));
        }
      }
    }

    if (a.hp <= 0) this._annihilatorDie();
  }

  _annihilatorDie() {
    const a = this.annihilatorBoss;
    if (!a) return;
    this.score = (this.score ?? 0) + Math.round(300 * this._getActiveChaosLawModifiers().scoreMult);
    this.player.gainXp(25, this.floatingTexts);
    const annihilatorCredits = this._awardCredits(12 + Math.floor(Math.random() * 9));   // 12..20 (×Grid Investor)
    this.overload = Math.max(0, this.overload - 10);
    this.floatingTexts.push(new FloatingText('MATRIX ANNIHILATOR DESTROYED', a.pos.clone(),                    YELLOW, 2.5));
    this.floatingTexts.push(new FloatingText('+' + annihilatorCredits + ' GRID CREDITS',            new Vec2(a.pos.x, a.pos.y - 30),  GREEN,  2.5));
    this.triggerAnnouncement('MATRIX ANNIHILATOR DESTROYED', GREEN);
    this.screenShake.trigger(14, 1.0);
    this.particles.spawnExplosion(a.pos, [RED, ORANGE, YELLOW], 28);
    // Protocol Fragment reward (suppressed inside arena)
    if (this._nullBreachActive) {
      if (this._nullBreachArena) this._nullBreachArena.kills = (this._nullBreachArena.kills || 0) + 1;
    } else if (this.meta && this.endless) {
      this.meta.protocolFragments += BOSS_KILL_PF;
      this.meta._save();
      this.floatingTexts.push(new FloatingText('+' + BOSS_KILL_PF + ' 🧩 FRAGMENT',
        new Vec2(a.pos.x, a.pos.y - 60), '#ff5ea8', 2.5));
    }
    // Boss Echo Archive (first kill only)
    if (this.meta && this.endless) {
      const firstEcho = this.meta.recordBossEcho('annihilator');
      if (firstEcho) {
        this.meta.addEdenMemory(1);
        this._queueEdenTransmission('ANNIHILATOR ECHO ARCHIVED. Termination protocol indexed.', { priority: 2, duration: 5 });
        this.meta.addSystemMessage('ANNIHILATOR ECHO ARCHIVED. TERMINATION PROTOCOL INDEXED.');
      }
    }
    this.annihilatorBoss = null;
  }

  // Endless objective consequence: erase one Nexus and spike Overload +30. Always leaves at least
  // one base standing; the per-run cap (2) is enforced by the caller.
  _annihilatorDestroyNexus() {
    if (this.matrices.length <= 1) return;   // never erase the last base
    const target = this.matrices[Math.floor(Math.random() * this.matrices.length)];
    let core;
    while ((core = target.stealCore())) {    // eject stored cores to the ground (conserved)
      const ang = Math.random() * Math.PI * 2, rad = randomRange(40, 120);
      core.pos = target.pos.add(new Vec2(Math.cos(ang) * rad, Math.sin(ang) * rad));
      this.groundCores.push(core);
    }
    const idx = this.matrices.indexOf(target);
    if (idx !== -1) this.matrices.splice(idx, 1);
    this.overload = Math.min(100, this.overload + 30);
    this.particles.spawnExplosion(target.pos, [RED, ORANGE, YELLOW], 36);
    this.screenShake.trigger(16, 1.2);
    this.audio?.playMatrixCritical?.();
    this.triggerAnnouncement('NEXUS ERASED — NETWORK OVERLOAD +30', RED);
    this.floatingTexts.push(new FloatingText('NEXUS ERASED', target.pos.clone(), RED, 3));
  }

  _drawAnnihilator(ctx) {
    const a = this.annihilatorBoss;
    if (!a || a.hp <= 0) return;
    const R = a.radius;

    // Endless Nexus-erase countdown — drawn above the boss so the objective pressure is clear.
    if (this.endless && (this._annihNexusKills || 0) < 2 && a.nexusCountdown !== undefined) {
      ctx.save();
      ctx.font = 'bold 14px Consolas, monospace';
      ctx.fillStyle = a.nexusCountdown <= 60 ? RED : ORANGE;
      ctx.textAlign = 'center';
      ctx.fillText('NEXUS ERASE: ' + Math.ceil(Math.max(0, a.nexusCountdown)) + 's', a.pos.x, a.pos.y - R - 18);
      ctx.restore();
      ctx.textAlign = 'left';
    }

    // Targeting line to the Matrix it is threatening
    if (a.targetMatrix && this.matrices.includes(a.targetMatrix)) {
      ctx.save();
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(Date.now() / 150);
      ctx.strokeStyle = RED; ctx.lineWidth = 2;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.moveTo(a.pos.x, a.pos.y);
      ctx.lineTo(a.targetMatrix.pos.x, a.targetMatrix.pos.y);
      ctx.stroke();
      ctx.restore();
    }

    // Pulsing aura
    const pulse = 0.4 + 0.35 * Math.sin(Date.now() / 200);
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = RED; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(a.pos.x, a.pos.y, R + 10, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();

    // Body glow + real sprite (fallback ONLY if the sprite failed to load)
    drawGlow(ctx, a.pos.x, a.pos.y, R, RED, 0.30);
    const spr = this._annihilatorSprite;
    if (spr && spr.complete && spr.naturalWidth > 0) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(spr, a.pos.x - R, a.pos.y - R, R * 2, R * 2);
      ctx.imageSmoothingEnabled = true;
    } else {
      ctx.fillStyle   = RED;
      ctx.strokeStyle = WHITE; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(a.pos.x - R, a.pos.y - R, R * 2, R * 2, 8);
      ctx.fill(); ctx.stroke();
    }

    // Hit flash
    if (a.hitFlash > 0) {
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.fillStyle   = WHITE;
      ctx.beginPath(); ctx.arc(a.pos.x, a.pos.y, R, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // HP bar + name label
    const bw = R * 2 + 20;
    const bx = a.pos.x - bw / 2;
    const by = a.pos.y - R - 20;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(bx - 1, by - 1, bw + 2, 8);
    ctx.fillStyle = RED;
    ctx.fillRect(bx, by, Math.round(bw * (a.hp / a.maxHp)), 6);
    ctx.font      = 'bold 10px Consolas, monospace';
    ctx.fillStyle = RED;
    ctx.textAlign = 'center';
    ctx.fillText('MATRIX ANNIHILATOR', a.pos.x, by - 3);
    ctx.textAlign = 'left';
  }

  // ── Bloodfang Packmaster mini-boss (fast pack leader at 10:00) ─────────────
  _spawnBloodfang() {
    const R    = 40;
    const side = Math.random() < 0.5 ? -1 : 1;
    const pos  = new Vec2(
      WORLD_W / 2 + side * (WORLD_W / 2 - WORLD_MARGIN - R - 30),
      WORLD_H / 2
    );
    const bfHp = Math.round((this.endless ? 540 : 700) * this._getActiveChaosLawModifiers().bossHpMult);      // Endless: killable range (Act 1 keeps 700)
    this.bloodfangBoss = {
      pos, hp: bfHp, maxHp: bfHp,
      radius: R, speed: 112, hitFlash: 0,
      biteTimer: 2.0, lungeTimer: 0, lungeDir: new Vec2(1, 0),
      slamTimer: 4,
    };
    this._bossAnnounce('BLOODFANG PACKMASTER DETECTED', RED);
    this.audio?.playBossSpawn();
    this.screenShake.trigger(7, 0.6);
    this.floatingTexts.push(new FloatingText('BLOODFANG PACKMASTER DETECTED', new Vec2(WIDTH / 2 - 240, HEIGHT / 2 - 70), RED,    3.0));
    this.floatingTexts.push(new FloatingText('RAZORHOUND PACK INBOUND',       new Vec2(WIDTH / 2 - 200, HEIGHT / 2 - 40), ORANGE, 3.0));
    // 3 Razorhounds join the boss
    for (let i = 0; i < 3; i++) this.enemies.push(new Enemy('Razorhound', this.currentMinute()));
    // Ally support drones join the fight (reuses the existing boss-drone system)
    this._spawnSupportDrones();
  }

  _updateBloodfang(dt) {
    if (!this.bloodfangSpawned) {
      this.bloodfangSpawnTimer -= dt;
      if (this.bloodfangSpawnTimer > 0) return;
      this.bloodfangSpawned = true;
      this._spawnBloodfang();
    }

    const a = this.bloodfangBoss;
    if (!a || a.hp <= 0) return;

    if (a.hitFlash > 0) a.hitFlash -= dt;

    const toPlayer = this.player.pos.sub(a.pos);
    const dist     = toPlayer.length();

    // Savage Bite / Lunge — short forward rush every 1.2–1.8 s when in range
    a.biteTimer -= dt;
    if (a.lungeTimer > 0) {
      a.lungeTimer -= dt;
      a.pos.addMut(a.lungeDir.scale(a.speed * 3.2 * dt));
    } else {
      if (dist > a.radius + PLAYER_RADIUS + 2) {
        a.pos.addMut(safeNormalize(toPlayer).scale(a.speed * dt));
      }
      if (a.biteTimer <= 0 && dist < 240) {
        a.biteTimer  = 1.2 + Math.random() * 0.6;
        a.lungeTimer = 0.22;
        a.lungeDir   = safeNormalize(toPlayer);
      }
    }

    a.pos.x = clamp(a.pos.x, WORLD_MARGIN + a.radius, WORLD_W - WORLD_MARGIN - a.radius);
    a.pos.y = clamp(a.pos.y, WORLD_MARGIN + 40 + a.radius, WORLD_H - WORLD_MARGIN - a.radius);

    // Telegraphed pounce slam — clearly warned, single heavy hit, dodgeable by moving/dashing out.
    // Threatens a kiting player who out-ranges the lunge; mirrors the Lava-zone warn→impact pattern.
    a.slamTimer -= dt;
    if (a.slamTimer <= 0 && dist < 360) {
      a.slamTimer = 5.5 + Math.random() * 1.5;            // 5.5–7.0s cadence
      this._bloodfangSlams.push({ pos: this.player.pos.clone(), radius: 75, warn: 0.9, impact: 0.25, t: 0, hit: false });
      this.audio?.playEventWarning();
    }
    for (let i = this._bloodfangSlams.length - 1; i >= 0; i--) {
      const s = this._bloodfangSlams[i];
      s.t += dt;
      if (!s.hit && s.t >= s.warn) {                       // warning ended → strike
        s.hit = true;
        this.screenShake.trigger(6, 0.2);
        this.particles.spawnExplosion(s.pos, [RED, ORANGE], 12);
        this.audio?.playBloodfangBite?.();
        if (distance(this.player.pos, s.pos) < s.radius) {
          if (this.endless) {
            // Endless: heavier, knockback slam (~20% max HP). Act 1 keeps the original 18 (below).
            const slamDmg = Math.round(this.player.maxHp * 0.20);
            if (this._damagePlayer(slamDmg, { color: RED, shake: 6, cap: slamDmg })) {
              const kb = safeNormalize(this.player.pos.sub(s.pos));
              if (kb.lengthSq() > 0) this.player.pos.addMut(kb.scale(70));   // knock the player back from the impact
            }
          } else {
            this._damagePlayer(18, { color: RED, shake: 6 }); // routed through fairness gate (dash/grace/30-cap)
          }
        }
      }
      if (s.t >= s.warn + s.impact) this._bloodfangSlams.splice(i, 1);
    }

    // Bite contact — throttled discrete bites (heavier on a lunge); dash/phoenix i-frames respected
    if (distance(a.pos, this.player.pos) < a.radius + PLAYER_RADIUS &&
        this.playerHitCooldown <= 0 &&
        this.player.dashTimer <= 0 && this.phoenixReviveTimer <= 0) {
      this.playerHitCooldown = 0.5;
      const lunging   = a.lungeTimer > 0;
      const dir       = safeNormalize(this.player.pos.sub(a.pos));
      const hp        = (lunging ? 16 : 14) * (1 - this.player.contactDamageReduction);
      const staggered = this.player.applyBite({
        hp, stamina: 12, dir,
        stagger:   lunging ? 0.8 : 0.5,
        knockback: lunging ? 22 : 12,
        bleed:     2.5,
      });
      this.screenShake.trigger(lunging ? 7 : 4, 0.2);
      this.audio?.playBloodfangBite();
      this.particles.spawnBloodSplash(this.player.pos);
      this.floatingTexts.push(new FloatingText(staggered ? 'STAGGERED' : 'BLEED', new Vec2(this.player.pos.x, this.player.pos.y - 28), RED, 0.7));
    }

    if (a.hp <= 0) this._bloodfangDie();
  }

  _bloodfangDie() {
    const a = this.bloodfangBoss;
    if (!a) return;
    // Break the pack — remaining Razorhounds die with their master; clear ally drones
    this.enemies = this.enemies.filter(e => e.enemyType !== 'Razorhound');
    this.supportDrones = [];
    this.score = (this.score ?? 0) + Math.round(500 * this._getActiveChaosLawModifiers().scoreMult);
    this.player.gainXp(45, this.floatingTexts);
    const bloodfangCredits = this._awardCredits(25 + Math.floor(Math.random() * 16));   // 25..40 (×Grid Investor)
    this.overload = Math.max(0, this.overload - 10);
    this.floatingTexts.push(new FloatingText('BLOODFANG PACKMASTER DEFEATED', a.pos.clone(),                   YELLOW, 2.5));
    this.floatingTexts.push(new FloatingText('RAZORHOUND PACK BROKEN',         new Vec2(a.pos.x, a.pos.y - 28), ORANGE, 2.5));
    this.floatingTexts.push(new FloatingText('+' + bloodfangCredits + ' GRID CREDITS',               new Vec2(a.pos.x, a.pos.y - 56), GREEN,  2.5));
    this.triggerAnnouncement('BLOODFANG PACKMASTER DEFEATED', GREEN);
    this.screenShake.trigger(14, 1.0);
    this.particles.spawnExplosion(a.pos, [RED, ORANGE, YELLOW], 30);
    this._bloodfangSlams = [];   // drop any pending telegraph so it never outlives the boss
    // Protocol Fragment reward (suppressed inside arena)
    if (this._nullBreachActive) {
      if (this._nullBreachArena) this._nullBreachArena.kills = (this._nullBreachArena.kills || 0) + 1;
    } else if (this.meta && this.endless) {
      this.meta.protocolFragments += BOSS_KILL_PF;
      this.meta._save();
      this.floatingTexts.push(new FloatingText('+' + BOSS_KILL_PF + ' 🧩 FRAGMENT',
        new Vec2(a.pos.x, a.pos.y - 90), '#ff5ea8', 2.5));
    }
    // Boss Echo Archive (first kill only)
    if (this.meta && this.endless) {
      const firstEcho = this.meta.recordBossEcho('bloodfang');
      if (firstEcho) {
        this.meta.addEdenMemory(1);
        this._queueEdenTransmission('BLOODFANG ECHO ARCHIVED. Predator signal contained.', { priority: 2, duration: 5 });
        this.meta.addSystemMessage('BLOODFANG ECHO ARCHIVED. PREDATOR SIGNAL CONTAINED.');
      }
    }
    this.bloodfangBoss = null;
  }

  _drawBloodfang(ctx) {
    const a = this.bloodfangBoss;
    if (!a || a.hp <= 0) return;
    const R = a.radius;

    // Pounce-slam telegraph — pulsing dashed ring over a translucent fill during the warn phase
    // (same idiom as the Lava-zone telegraph) so the heavy hit is always clearly readable.
    for (const s of this._bloodfangSlams) {
      if (s.t >= s.warn) continue;
      const k = s.t / s.warn;
      ctx.save();
      ctx.globalAlpha = 0.14 + 0.20 * k;
      ctx.fillStyle = RED;
      ctx.beginPath(); ctx.arc(s.pos.x, s.pos.y, s.radius, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = Math.min(1, 0.4 + 0.4 * k);
      ctx.strokeStyle = ORANGE; ctx.lineWidth = 3; ctx.setLineDash([10, 8]);
      ctx.beginPath(); ctx.arc(s.pos.x, s.pos.y, s.radius, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Pulsing red aura
    const pulse = 0.4 + 0.35 * Math.sin(Date.now() / 160);
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = RED; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(a.pos.x, a.pos.y, R + 10, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();

    // Body glow + real sprite (fallback box ONLY if the sprite failed to load)
    drawGlow(ctx, a.pos.x, a.pos.y, R, RED, 0.32);
    const spr = this._bloodfangSprite;
    if (spr && spr.complete && spr.naturalWidth > 0) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(spr, a.pos.x - R, a.pos.y - R, R * 2, R * 2);
      ctx.imageSmoothingEnabled = true;
    } else {
      ctx.fillStyle   = RED;
      ctx.strokeStyle = WHITE; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(a.pos.x - R, a.pos.y - R, R * 2, R * 2, 8);
      ctx.fill(); ctx.stroke();
    }

    // Hit flash
    if (a.hitFlash > 0) {
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.fillStyle   = WHITE;
      ctx.beginPath(); ctx.arc(a.pos.x, a.pos.y, R, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // HP bar + name label
    const bw = R * 2 + 20;
    const bx = a.pos.x - bw / 2;
    const by = a.pos.y - R - 20;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(bx - 1, by - 1, bw + 2, 8);
    ctx.fillStyle = RED;
    ctx.fillRect(bx, by, Math.round(bw * (a.hp / a.maxHp)), 6);
    ctx.font      = 'bold 10px Consolas, monospace';
    ctx.fillStyle = RED;
    ctx.textAlign = 'center';
    ctx.fillText('BLOODFANG PACKMASTER', a.pos.x, by - 3);
    ctx.textAlign = 'left';
  }


  // ── Cyber Serpent — mid-run mini-boss at ~10:30 (Inferno Smoke Trail) ────────────────────────

  _spawnCyberSerpent() {
    if (this.cyberSerpentSpawned) return;
    this.cyberSerpentSpawned = true;
    const edge   = Math.floor(Math.random() * 4);
    const margin = WORLD_MARGIN + 60;
    let sx, sy;
    if      (edge === 0) { sx = randomRange(margin, WORLD_W - margin); sy = margin; }
    else if (edge === 1) { sx = randomRange(margin, WORLD_W - margin); sy = WORLD_H - margin; }
    else if (edge === 2) { sx = margin;            sy = randomRange(margin, WORLD_H - margin); }
    else                 { sx = WORLD_W - margin;  sy = randomRange(margin, WORLD_H - margin); }
    const isEndless = !!this.endless;
    const hp        = 1500;
    this.cyberSerpentBoss = {
      pos:        new Vec2(sx, sy),
      hp,
      maxHp:      hp,
      radius:     38,
      speed:      135,
      hitFlash:   0,
      dashTimer:  0,      // countdown to next dash phase
      dashCd:     randomRange(3.0, 4.0),
      dashing:    false,
      dashDir:    new Vec2(0, 0),
      dashTimeLeft: 0,
    };
    this._serpentTrails = [];
    this._bossAnnounce('⚠ CYBER SERPENT DETECTED', ORANGE);
    triggerAnnouncement('CYBER SERPENT DETECTED', ORANGE);
  }

  _updateCyberSerpent(dt) {
    // Countdown timer — spawn when elapsed
    if (!this.cyberSerpentSpawned) {
      this.cyberSerpentSpawnTimer -= dt;
      if (this.cyberSerpentSpawnTimer <= 0) this._spawnCyberSerpent();
      return;
    }
    const s = this.cyberSerpentBoss;
    if (!s || s.hp <= 0) return;

    const pp = this.player.pos;

    // ── Dash phase ──
    if (s.dashing) {
      s.dashTimeLeft -= dt;
      // Move in dash direction
      const dashSpeed = s.speed * 2.8;
      s.pos.x += s.dashDir.x * dashSpeed * dt;
      s.pos.y += s.dashDir.y * dashSpeed * dt;
      s.pos.x = clamp(s.pos.x, WORLD_MARGIN, WORLD_W - WORLD_MARGIN);
      s.pos.y = clamp(s.pos.y, WORLD_MARGIN, WORLD_H - WORLD_MARGIN);

      // Leave fire trail segments (max 20, trim oldest)
      if (this._serpentTrails.length < 20) {
        this._serpentTrails.push({
          pos:    new Vec2(s.pos.x, s.pos.y),
          life:   10.0,    // 10s duration
          maxLife: 10.0,
          tickCd: 0,       // 0.5s tick damage cooldown
        });
      } else {
        // Replace oldest
        this._serpentTrails.shift();
        this._serpentTrails.push({
          pos:    new Vec2(s.pos.x, s.pos.y),
          life:   10.0,
          maxLife: 10.0,
          tickCd: 0,
        });
      }

      if (s.dashTimeLeft <= 0) {
        s.dashing     = false;
        s.dashCd      = randomRange(3.0, 4.5);
        s.dashTimer   = 0;
      }
    } else {
      // ── Normal chase ──
      const dir = safeNormalize(pp.sub(s.pos));
      s.pos.x += dir.x * s.speed * dt;
      s.pos.y += dir.y * s.speed * dt;

      // Dash cooldown
      s.dashTimer += dt;
      if (s.dashTimer >= s.dashCd) {
        s.dashing     = true;
        s.dashDir     = safeNormalize(pp.sub(s.pos));
        s.dashTimeLeft = 0.55;
        s.dashTimer   = 0;
      }
    }

    // ── Trail damage ticks ──
    for (let i = this._serpentTrails.length - 1; i >= 0; i--) {
      const t = this._serpentTrails[i];
      t.life  -= dt;
      if (t.life <= 0) { this._serpentTrails.splice(i, 1); continue; }
      if (t.tickCd > 0) { t.tickCd -= dt; continue; }
      if (distance(pp, t.pos) < this.player.radius + 22) {
        this._damagePlayer(12, { color: ORANGE, shake: 3 });
        t.tickCd = 0.5;
      }
    }

    // ── Contact damage ──
    if (distance(pp, s.pos) < this.player.radius + s.radius) {
      this._damagePlayer(18, { color: ORANGE, shake: 5, cap: BOSS_MAX_PLAYER_HIT });
    }

    // ── Hit flash decay ──
    if (s.hitFlash > 0) s.hitFlash = Math.max(0, s.hitFlash - dt);

    // ── Death check ──
    if (s.hp <= 0) this._cyberSerpentDie();
  }

  _cyberSerpentDie() {
    // Eden Core: boss echo
    if (this.meta) {
      const firstKill = this.meta.recordBossEcho('cyberSerpent');
      const msg = firstKill
        ? 'CYBER SERPENT ECHO ARCHIVED. First contact recorded.'
        : this._edenPick([
            'CYBER SERPENT signal collapsed.',
            'SERPENT pattern erased from the feed.',
            'Cyber Serpent trace: terminated.',
          ]);
      this.meta.addSystemMessage(msg);
      this.meta.addEdenMemory(1);
    }
    // Eden Core in-run popup on boss kill
    this._queueEdenTransmission('SERPENT ECHO: signal terminated.', { title: 'EDEN CORE', priority: 2, duration: 5, clipId: 'signal_down' });
    const s = this.cyberSerpentBoss;
    if (!s) return;
    const pos = s.pos.clone();
    this.cyberSerpentBoss = null;
    this._serpentTrails   = [];

    // Rewards
    this.score += 1800;
    this.xp    += 120;
    this.credits = (this.credits || 0) + 3;
    if (!this._nullBreachActive && typeof this.protocolFragments !== 'undefined') {
      this.protocolFragments += BOSS_KILL_PF;
    }
    if (this._nullBreachArena) this._nullBreachArena.kills = (this._nullBreachArena.kills || 0) + 1;

    // VFX
    this.particles.spawnExplosion(pos, ORANGE, 32);
    this.particles.spawnExplosion(pos, RED,    20);

    // Announcement
    triggerAnnouncement('CYBER SERPENT ELIMINATED', ORANGE);
    this._bossAnnounce('CYBER SERPENT ELIMINATED', ORANGE);
  }

  _drawCyberSerpent(ctx) {
    // ── Draw trail segments ──
    for (const t of this._serpentTrails) {
      const alpha = clamp(t.life / t.maxLife, 0, 1);
      const r     = 22;
      // Dark smoke base
      ctx.save();
      ctx.globalAlpha = alpha * 0.45;
      ctx.beginPath();
      ctx.arc(t.pos.x, t.pos.y, r, 0, Math.PI * 2);
      ctx.fillStyle = '#1a0a00';
      ctx.fill();
      ctx.restore();

      // Orange/red fire glow
      ctx.save();
      ctx.globalAlpha = alpha * 0.55;
      const fireGrad = ctx.createRadialGradient(t.pos.x, t.pos.y, 0, t.pos.x, t.pos.y, r);
      fireGrad.addColorStop(0, 'rgba(255,160,40,0.9)');
      fireGrad.addColorStop(0.5, 'rgba(220,60,0,0.55)');
      fireGrad.addColorStop(1, 'rgba(80,20,0,0)');
      ctx.beginPath();
      ctx.arc(t.pos.x, t.pos.y, r, 0, Math.PI * 2);
      ctx.fillStyle = fireGrad;
      ctx.fill();
      ctx.restore();

      // Cyber ember ring
      ctx.save();
      ctx.globalAlpha = alpha * 0.6;
      ctx.strokeStyle = '#ff6600';
      ctx.lineWidth   = 1.5;
      ctx.shadowColor = '#ff4400';
      ctx.shadowBlur  = 6;
      ctx.beginPath();
      ctx.arc(t.pos.x, t.pos.y, r * 0.65, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // ── Draw boss body ──
    const s = this.cyberSerpentBoss;
    if (!s || s.hp <= 0) return;

    ctx.save();
    if (s.hitFlash > 0) {
      ctx.filter = 'brightness(3) saturate(0)';
    }

    const sp = this._cyberSerpentSprite;
    if (sp && sp.complete && sp.naturalWidth > 0) {
      const size = s.radius * 2.4;
      ctx.drawImage(sp, s.pos.x - size / 2, s.pos.y - size / 2, size, size);
    } else {
      // Fallback: drawn coil shape
      ctx.beginPath();
      ctx.arc(s.pos.x, s.pos.y, s.radius, 0, Math.PI * 2);
      ctx.fillStyle = '#1a0f00';
      ctx.fill();
      ctx.strokeStyle = ORANGE;
      ctx.lineWidth   = 2.5;
      ctx.shadowColor = ORANGE;
      ctx.shadowBlur  = 12;
      ctx.stroke();
      // Inner glow
      ctx.beginPath();
      ctx.arc(s.pos.x, s.pos.y, s.radius * 0.55, 0, Math.PI * 2);
      ctx.fillStyle = '#ff6600';
      ctx.globalAlpha = 0.5;
      ctx.fill();
      ctx.globalAlpha = 1;
      // Label
      ctx.font      = 'bold 9px Consolas, monospace';
      ctx.fillStyle = ORANGE;
      ctx.textAlign = 'center';
      ctx.fillText('C.SERPENT', s.pos.x, s.pos.y + 3);
      ctx.textAlign = 'left';
    }
    ctx.restore();

    // ── HP bar (screen-space) ──
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    {
      const barW  = 340;
      const barH  = 10;
      const barX  = WIDTH / 2 - barW / 2;
      const barY  = HEIGHT - 46;
      const hpPct = Math.max(0, s.hp / s.maxHp);
      // Background
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(barX - 2, barY - 18, barW + 4, barH + 24);
      // Empty track
      ctx.fillStyle = '#222';
      ctx.fillRect(barX, barY, barW, barH);
      // Health fill — orange gradient
      const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
      grad.addColorStop(0, '#ff4400');
      grad.addColorStop(1, '#ff9900');
      ctx.fillStyle = grad;
      ctx.fillRect(barX, barY, Math.round(barW * hpPct), barH);
      // Label
      ctx.font      = 'bold 11px Consolas, monospace';
      ctx.fillStyle = '#ffaa44';
      ctx.textAlign = 'center';
      ctx.fillText('⚠ CYBER SERPENT', WIDTH / 2, barY - 5);
      // HP numbers
      ctx.font      = 'bold 9px Consolas, monospace';
      ctx.fillStyle = '#ffddaa';
      ctx.fillText(Math.ceil(s.hp) + ' / ' + s.maxHp, WIDTH / 2, barY + barH + 11);
      ctx.textAlign = 'left';
    }
    ctx.restore();
  }


  // ── Cyber Dragon — mid-run boss at 16:00 (Cryo Storm Protocol) ───────────────────────────────

  _spawnCyberDragon() {
    if (this.cyberDragonSpawned) return;
    this.cyberDragonSpawned = true;
    const edge   = Math.floor(Math.random() * 4);
    const margin = WORLD_MARGIN + 80;
    let sx, sy;
    if      (edge === 0) { sx = randomRange(margin, WORLD_W - margin); sy = margin; }
    else if (edge === 1) { sx = randomRange(margin, WORLD_W - margin); sy = WORLD_H - margin; }
    else if (edge === 2) { sx = margin;            sy = randomRange(margin, WORLD_H - margin); }
    else                 { sx = WORLD_W - margin;  sy = randomRange(margin, WORLD_H - margin); }
    const isEndless = !!this.endless;
    const hp        = 1500;
    this.cyberDragonBoss = {
      pos:        new Vec2(sx, sy),
      hp,
      maxHp:      hp,
      radius:     44,
      speed:      75,
      hitFlash:   0,
      orbitAngle: 0,
      orbitRadius: 340,
      // Cryo Storm state
      stormCd:    randomRange(5.0, 7.0),  // first storm delay
      stormTimer: 0,
      storming:   false,
      stormLife:  0,
    };
    this._dragonIceShards = [];
    this._bossAnnounce('⚠ CYBER DRAGON APPROACHING', '#00ccff');
    triggerAnnouncement('CYBER DRAGON APPROACHING', '#00ccff');
  }

  _updateCyberDragon(dt) {
    // Countdown timer — spawn when elapsed
    if (!this.cyberDragonSpawned) {
      this.cyberDragonSpawnTimer -= dt;
      if (this.cyberDragonSpawnTimer <= 0) this._spawnCyberDragon();
      return;
    }
    const d = this.cyberDragonBoss;
    if (!d || d.hp <= 0) return;

    const pp = this.player.pos;

    // ── Orbit around arena center with slow drift toward player ──
    d.orbitAngle += dt * 0.55;
    const cx  = WORLD_W / 2;
    const cy  = WORLD_H / 2;
    const tx  = cx + Math.cos(d.orbitAngle) * d.orbitRadius;
    const ty  = cy + Math.sin(d.orbitAngle) * d.orbitRadius;
    const orbitDir = safeNormalize(new Vec2(tx - d.pos.x, ty - d.pos.y));
    // Mix orbit pull with slight player pull
    const playerDir = safeNormalize(pp.sub(d.pos));
    d.pos.x += (orbitDir.x * 0.7 + playerDir.x * 0.3) * d.speed * dt;
    d.pos.y += (orbitDir.y * 0.7 + playerDir.y * 0.3) * d.speed * dt;
    d.pos.x = clamp(d.pos.x, WORLD_MARGIN + d.radius, WORLD_W - WORLD_MARGIN - d.radius);
    d.pos.y = clamp(d.pos.y, WORLD_MARGIN + d.radius, WORLD_H - WORLD_MARGIN - d.radius);

    // ── Cryo Storm cooldown ──
    if (!d.storming) {
      d.stormCd -= dt;
      if (d.stormCd <= 0) {
        d.storming  = true;
        d.stormLife = randomRange(8.0, 11.0);
        d.stormCd   = randomRange(6.0, 9.0);
        this._bossAnnounce('CRYO STORM INCOMING', '#00ccff');
        // Spawn initial shard wave
        this._spawnCryoShards();
      }
    } else {
      d.stormLife -= dt;
      // Spawn additional shards periodically during storm
      d.stormTimer += dt;
      if (d.stormTimer >= 1.4 && this._dragonIceShards.length < 15) {
        this._spawnCryoShards();
        d.stormTimer = 0;
      }
      if (d.stormLife <= 0) {
        d.storming   = false;
        d.stormTimer = 0;
      }
    }

    // ── Update ice shards ──
    for (let i = this._dragonIceShards.length - 1; i >= 0; i--) {
      const sh = this._dragonIceShards[i];
      sh.t    += dt;

      if (!sh.hit && sh.t >= sh.warnTime) {
        // Impact!
        sh.hit = true;
        if (distance(pp, sh.targetPos) < this.player.radius + 30) {
          this._damagePlayer(16, { color: '#00ccff', shake: 5, cap: BOSS_MAX_PLAYER_HIT });
        }
        // Linger a moment for burst VFX, then remove
        sh.burstTimer = 0.35;
      }

      if (sh.hit) {
        sh.burstTimer -= dt;
        if (sh.burstTimer <= 0) {
          this._dragonIceShards.splice(i, 1);
        }
      }
    }

    // ── Contact damage ──
    if (distance(pp, d.pos) < this.player.radius + d.radius) {
      this._damagePlayer(20, { color: '#00ccff', shake: 6, cap: BOSS_MAX_PLAYER_HIT });
    }

    // ── Hit flash decay ──
    if (d.hitFlash > 0) d.hitFlash = Math.max(0, d.hitFlash - dt);

    // ── Death check ──
    if (d.hp <= 0) this._cyberDragonDie();
  }

  _spawnCryoShards() {
    const pp        = this.player.pos;
    const count     = Math.min(randomRange(3, 5) | 0, 15 - this._dragonIceShards.length);
    for (let i = 0; i < count; i++) {
      const trackPlayer = Math.random() < 0.7;
      let tx, ty;
      if (trackPlayer) {
        // 70% player-tracking with random spread offset
        const spread = 120;
        tx = pp.x + randomRange(-spread, spread);
        ty = pp.y + randomRange(-spread, spread);
      } else {
        // 30% fully random arena position
        tx = randomRange(WORLD_MARGIN + 60, WORLD_W - WORLD_MARGIN - 60);
        ty = randomRange(WORLD_MARGIN + 60, WORLD_H - WORLD_MARGIN - 60);
      }
      tx = clamp(tx, WORLD_MARGIN + 40, WORLD_W - WORLD_MARGIN - 40);
      ty = clamp(ty, WORLD_MARGIN + 40, WORLD_H - WORLD_MARGIN - 40);
      this._dragonIceShards.push({
        targetPos:  new Vec2(tx, ty),
        warnTime:   1.2,
        t:          0,
        hit:        false,
        burstTimer: 0,
      });
    }
  }

  _cyberDragonDie() {
    // Eden Core: boss echo
    if (this.meta) {
      const firstKill = this.meta.recordBossEcho('cyberDragon');
      const msg = firstKill
        ? 'CYBER DRAGON ECHO ARCHIVED. First contact recorded.'
        : this._edenPick([
            'CYBER DRAGON signal collapsed.',
            'DRAGON pattern erased from the feed.',
            'Cyber Dragon trace: terminated.',
          ]);
      this.meta.addSystemMessage(msg);
      this.meta.addEdenMemory(1);
    }
    // Eden Core in-run popup on boss kill
    this._queueEdenTransmission('DRAGON ECHO: cryo trace terminated.', { title: 'EDEN CORE', priority: 2, duration: 5, clipId: 'signal_down' });
    const d = this.cyberDragonBoss;
    if (!d) return;
    const pos = d.pos.clone();
    this.cyberDragonBoss  = null;
    this._dragonIceShards = [];

    // Rewards
    this.score += 2800;
    this.xp    += 180;
    this.credits = (this.credits || 0) + 5;
    if (!this._nullBreachActive && typeof this.protocolFragments !== 'undefined') {
      this.protocolFragments += BOSS_KILL_PF;
    }
    if (this._nullBreachArena) this._nullBreachArena.kills = (this._nullBreachArena.kills || 0) + 1;

    // VFX
    this.particles.spawnExplosion(pos, '#00ccff', 32);
    this.particles.spawnExplosion(pos, '#ffffff', 20);

    // Announcement
    triggerAnnouncement('CYBER DRAGON ELIMINATED', '#00ccff');
    this._bossAnnounce('CYBER DRAGON ELIMINATED', '#00ccff');
  }

  _drawCyberDragon(ctx) {
    // ── Draw ice shards and warning circles ──
    const now = Date.now() / 1000;
    for (const sh of this._dragonIceShards) {
      const tp = sh.targetPos;

      if (!sh.hit) {
        // Warning phase — pulsing cyan ring
        const progress = sh.t / sh.warnTime;            // 0→1
        const pulse    = 0.5 + 0.5 * Math.sin(now * 8); // fast pulse
        const ringR    = 30 + (1 - progress) * 14;

        ctx.save();
        ctx.globalAlpha = (0.3 + pulse * 0.4) * (1 - progress * 0.3);
        ctx.strokeStyle = '#00ccff';
        ctx.lineWidth   = 2.5;
        ctx.shadowColor = '#00ccff';
        ctx.shadowBlur  = 10;
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, ringR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Danger fill (fades in)
        ctx.save();
        ctx.globalAlpha = progress * 0.18;
        ctx.fillStyle   = '#00ccff';
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, ringR - 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Shard indicator falling from above
        ctx.save();
        ctx.globalAlpha = 0.7 + pulse * 0.3;
        ctx.strokeStyle = '#aaeeff';
        ctx.lineWidth   = 2;
        ctx.shadowColor = '#00ccff';
        ctx.shadowBlur  = 8;
        ctx.beginPath();
        ctx.moveTo(tp.x, tp.y - 40 * (1 - progress) - 10);
        ctx.lineTo(tp.x, tp.y - 8);
        ctx.stroke();
        ctx.restore();
      } else {
        // Burst VFX — icy explosion ring
        const bAlpha = sh.burstTimer / 0.35;
        ctx.save();
        ctx.globalAlpha = bAlpha * 0.85;
        const burstR = 38 * (1 - bAlpha * 0.5);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth   = 3;
        ctx.shadowColor = '#00ccff';
        ctx.shadowBlur  = 18;
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, burstR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = bAlpha * 0.45;
        ctx.fillStyle   = '#00ccff';
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, burstR * 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // ── Draw boss body ──
    const d = this.cyberDragonBoss;
    if (!d || d.hp <= 0) return;

    ctx.save();
    if (d.hitFlash > 0) {
      ctx.filter = 'brightness(3) saturate(0)';
    }

    const sp = this._cyberDragonSprite;
    if (sp && sp.complete && sp.naturalWidth > 0) {
      const size = d.radius * 2.4;
      ctx.drawImage(sp, d.pos.x - size / 2, d.pos.y - size / 2, size, size);
    } else {
      // Fallback: drawn dragon shape
      ctx.beginPath();
      ctx.arc(d.pos.x, d.pos.y, d.radius, 0, Math.PI * 2);
      ctx.fillStyle = '#00111a';
      ctx.fill();
      ctx.strokeStyle = '#00ccff';
      ctx.lineWidth   = 2.5;
      ctx.shadowColor = '#00ccff';
      ctx.shadowBlur  = 16;
      ctx.stroke();
      // Inner glow
      ctx.beginPath();
      ctx.arc(d.pos.x, d.pos.y, d.radius * 0.5, 0, Math.PI * 2);
      ctx.fillStyle   = '#0066aa';
      ctx.globalAlpha = 0.6;
      ctx.fill();
      ctx.globalAlpha = 1;
      // Wing lines
      ctx.strokeStyle = '#00ccff';
      ctx.lineWidth   = 1.5;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.moveTo(d.pos.x - d.radius, d.pos.y);
      ctx.lineTo(d.pos.x - d.radius - 22, d.pos.y - 18);
      ctx.moveTo(d.pos.x + d.radius, d.pos.y);
      ctx.lineTo(d.pos.x + d.radius + 22, d.pos.y - 18);
      ctx.stroke();
      ctx.globalAlpha = 1;
      // Label
      ctx.font      = 'bold 9px Consolas, monospace';
      ctx.fillStyle = '#00ccff';
      ctx.textAlign = 'center';
      ctx.fillText('C.DRAGON', d.pos.x, d.pos.y + 3);
      ctx.textAlign = 'left';
    }
    ctx.restore();

    // ── HP bar (screen-space) ──
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    {
      const barW  = 340;
      const barH  = 10;
      const barX  = WIDTH / 2 - barW / 2;
      const barY  = HEIGHT - 46;
      const hpPct = Math.max(0, d.hp / d.maxHp);
      // Background
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(barX - 2, barY - 18, barW + 4, barH + 24);
      // Empty track
      ctx.fillStyle = '#001833';
      ctx.fillRect(barX, barY, barW, barH);
      // Health fill — cyan gradient
      const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
      grad.addColorStop(0, '#0044ff');
      grad.addColorStop(1, '#00eeff');
      ctx.fillStyle = grad;
      ctx.fillRect(barX, barY, Math.round(barW * hpPct), barH);
      // Label
      ctx.font      = 'bold 11px Consolas, monospace';
      ctx.fillStyle = '#44ddff';
      ctx.textAlign = 'center';
      ctx.fillText('⚠ CYBER DRAGON', WIDTH / 2, barY - 5);
      // HP numbers
      ctx.font      = 'bold 9px Consolas, monospace';
      ctx.fillStyle = '#aaeeff';
      ctx.fillText(Math.ceil(d.hp) + ' / ' + d.maxHp, WIDTH / 2, barY + barH + 11);
      ctx.textAlign = 'left';
    }
    ctx.restore();
  }


  // ── Double Demons — Chaos Mode dual-body boss ─────────────────────────────────────────────────
  // Gunner keeps medium range and strafes; Claw closes in for melee. Both bodies share
  // a single HP pool drawn as one bar. Attacks added in Phases (b)/(c)/(d).
  // DEBUG: game.forceDoubleDemon = true  (or F8 in Endless) spawns them immediately.

  _spawnDoubleDemonsBoss() {
    const hp   = DD_HP;
    const mid  = new Vec2(WORLD_W / 2, WORLD_H / 2);
    const dx   = WORLD_W * 0.28;
    const dy   = WORLD_H * 0.18;
    const flip = Math.random() < 0.5 ? -1 : 1;
    const gPos = mid.add(new Vec2(-dx * flip, -dy));
    const cPos = mid.add(new Vec2( dx * flip,  dy));

    this.doubleDemonsBoss = {
      hp, maxHp: hp, enraged: false,
      // Gunner Demon — ranged, strafes at medium distance
      gunner: {
        pos: gPos.clone(), radius: DD_GUNNER_R, hitFlash: 0,
        strafeDir: 1, strafeTimer: 2.0,
        barrageCd: 4.5, suppressCd: 2.8, rocketRainCd: 999,  // 999 = disabled until enrage
        barragePhase: null, suppressState: null,
      },
      // Claw Demon — melee, closes in on the player
      claw: {
        pos: cPos.clone(), radius: DD_CLAW_R, hitFlash: 0,
        dashCd: 3.5, slamCd: 5.0,
        dashState: null, slamState: null,
      },
    };

    this._ddClawShockwaves  = [];
    this._ddLightningTrails = [];
    this._ddRocketShadows   = [];

    this._bossAnnounce('\u26a1 DOUBLE DEMONS UNLEASHED \u26a1', '#ff2d95');
    this.audio?.playBossSpawn();
    this.screenShake.trigger(8, 0.6);
    this.floatingTexts.push(new FloatingText('\u26a1 DOUBLE DEMONS UNLEASHED \u26a1',
      new Vec2(WIDTH / 2 - 210, HEIGHT / 2 - 66), '#ff2d95', 3.2));
    this.floatingTexts.push(new FloatingText('GUNNER + CLAW \u2014 ONE SHARED HP',
      new Vec2(WIDTH / 2 - 185, HEIGHT / 2 - 36), '#ff8fd4', 2.6));
  }

  _updateDoubleDemonsBoss(dt) {
    // DEBUG shortcut — force-spawn immediately (F8 in main.js, or set game.forceDoubleDemon=true)
    if (this.forceDoubleDemon && this.endless && !this.doubleDemonsBoss) {
      this.forceDoubleDemon    = false;
      this.doubleDemonsSpawned = true;
      this._spawnDoubleDemonsBoss();
    }

    if (!this.doubleDemonsSpawned) {
      this.doubleDemonsSpawnTimer -= dt;
      if (this.doubleDemonsSpawnTimer > 0) return;
      this.doubleDemonsSpawned = true;
      this._spawnDoubleDemonsBoss();
    }

    const dd = this.doubleDemonsBoss;
    if (!dd || dd.hp <= 0) return;

    const p    = this.player;
    const spdM = dd.enraged ? DD_ENRAGE_SPD : 1.0;
    const cdMult = dd.enraged ? 0.70 : 1.0;   // enrage: 30% shorter cooldowns

    // ── Enrage trigger at 50% shared HP ──────────────────────────────────────
    if (!dd.enraged && dd.hp / dd.maxHp <= DD_ENRAGE_PCT) {
      dd.enraged = true;
      dd.gunner.rocketRainCd = 4.0;   // first Rocket Rain 4s after enrage
      this.triggerAnnouncement('\u26a1 DOUBLE DEMONS ENRAGED \u26a1', '#ff0000');
      this.screenShake.trigger(10, 0.5);
      this.floatingTexts.push(new FloatingText('\u26a1 ENRAGE! SPEED & RATE UP \u26a1',
        new Vec2(WIDTH / 2 - 160, HEIGHT / 2), '#ff0000', 2.0));
    }

    // ── Gunner movement: strafe laterally, keep preferred range ──────────────
    const g = dd.gunner;
    if (g.hitFlash > 0) g.hitFlash -= dt;

    if (!g.barragePhase && !g.suppressState) {
      const toP      = p.pos.sub(g.pos);
      const dist     = toP.length();
      const toPNorm  = safeNormalize(toP);

      if (dist > DD_GUNNER_RANGE + 40) {
        g.pos.addMut(toPNorm.scale(DD_GUNNER_SPEED * spdM * dt));
      } else if (dist < DD_GUNNER_RANGE - 60) {
        g.pos.addMut(toPNorm.scale(-DD_GUNNER_SPEED * 0.7 * spdM * dt));
      }

      g.strafeTimer -= dt;
      if (g.strafeTimer <= 0) {
        g.strafeDir   = -g.strafeDir;
        g.strafeTimer = 1.6 + Math.random() * 1.4;
      }
      const perp = new Vec2(-toPNorm.y, toPNorm.x).scale(g.strafeDir);
      g.pos.addMut(perp.scale(DD_GUNNER_SPEED * 0.75 * spdM * dt));
    }

    g.pos.x = clamp(g.pos.x, WORLD_MARGIN + g.radius, WORLD_W - WORLD_MARGIN - g.radius);
    g.pos.y = clamp(g.pos.y, WORLD_MARGIN + 40 + g.radius, WORLD_H - WORLD_MARGIN - g.radius);

    // Gunner contact push (light — it prefers range)
    if (distance(g.pos, p.pos) < g.radius + PLAYER_RADIUS) {
      const push = safeNormalize(p.pos.sub(g.pos));
      p.pos.addMut(push.scale(50 * dt));
      if (p.dashTimer <= 0 && this.phoenixReviveTimer <= 0) {
        p.applyDamage(DD_CONTACT_DMG * 0.5 * dt * (1 - p.contactDamageReduction));
      }
    }

    // ── Gunner attack: Spin-up Barrage ───────────────────────────────────────────────────────────────────
    // telegraph 1s (visuals in _drawDoubleDemonsBoss) then sweep arc of bullets across player
    if (!g.suppressState) {
      g.barrageCd -= dt * cdMult;
      if (g.barrageCd <= 0 && !g.barragePhase) {
        g.barragePhase = { phase: 'telegraph', t: 0, telegraphT: 1.0 };
        g.barrageCd    = 6.5 + Math.random() * 2.0;
      }
      if (g.barragePhase) {
        const bp = g.barragePhase;
        bp.t += dt;
        if (bp.phase === 'telegraph' && bp.t >= bp.telegraphT) {
          const toP  = p.pos.sub(g.pos);
          bp.phase      = 'fire';
          bp.t          = 0;
          bp.baseAngle  = Math.atan2(toP.y, toP.x);
          bp.sweepSpan  = Math.PI * 0.70;
          bp.sweepDir   = Math.random() < 0.5 ? 1 : -1;
          bp.totalFireT = 0.90;
          bp._nextShot  = 0;
        }
        if (bp.phase === 'fire') {
          bp.t        += dt;
          bp._nextShot -= dt;
          if (bp._nextShot <= 0) {
            bp._nextShot = 0.075;
            const prog  = Math.min(1, bp.t / bp.totalFireT);
            const sweep = (prog - 0.5) * bp.sweepSpan * bp.sweepDir;
            const angle = bp.baseAngle + sweep;
            this.spawnEnemyBullet(
              g.pos.clone(),
              new Vec2(Math.cos(angle), Math.sin(angle)),
              290, 8, 7, '#ff2d95');
          }
          if (bp.t >= bp.totalFireT) g.barragePhase = null;
        }
      }
    }

    // ── Gunner attack: Suppress (short aimed burst) ──────────────────────────────────────────────
    // 0.25s telegraph flash then 4 bullets with light lead prediction
    if (!g.barragePhase) {
      g.suppressCd -= dt * cdMult;
      if (g.suppressCd <= 0 && !g.suppressState) {
        g.suppressState = { phase: 'telegraph', t: 0, telegraphT: 0.25 };
        g.suppressCd    = 3.2 + Math.random() * 1.5;
      }
      if (g.suppressState) {
        const ss = g.suppressState;
        ss.t += dt;
        if (ss.phase === 'telegraph' && ss.t >= ss.telegraphT) {
          ss.phase     = 'fire';
          ss.t         = 0;
          ss.shotsLeft = 4;
          ss._nextShot = 0;
        }
        if (ss.phase === 'fire') {
          ss._nextShot -= dt;
          if (ss._nextShot <= 0 && ss.shotsLeft > 0) {
            ss._nextShot = 0.085;
            ss.shotsLeft--;
            const lead   = p.vel ? p.vel.scale(0.12) : new Vec2(0, 0);
            const target = p.pos.add(lead);
            const dir    = safeNormalize(target.sub(g.pos));
            const spread = (Math.random() - 0.5) * (Math.PI / 22);
            const cs = Math.cos(spread), sn = Math.sin(spread);
            const sdir = new Vec2(dir.x * cs - dir.y * sn, dir.x * sn + dir.y * cs);
            this.spawnEnemyBullet(g.pos.clone(), sdir, 340, 6, 6, ORANGE);
          }
          if (ss.shotsLeft <= 0 && ss._nextShot <= -0.05) g.suppressState = null;
        }
      }
    }

    // ── Gunner attack: Rocket Rain (enraged only) ──────────────────────────────────────────────
    // Shadow telegraphs appear on the ground (1.2s each) then rockets impact with AoE blast.
    // Capped at DD_ROCKET_COUNT per wave to protect browser performance.
    if (dd.enraged && !g.barragePhase && !g.suppressState) {
      g.rocketRainCd -= dt;
      if (g.rocketRainCd <= 0 && this._ddRocketShadows.length === 0) {
        for (let ri = 0; ri < DD_ROCKET_COUNT; ri++) {
          const angle = Math.random() * Math.PI * 2;
          const dist  = 35 + Math.random() * 190;
          const rpos  = p.pos.add(new Vec2(Math.cos(angle) * dist, Math.sin(angle) * dist));
          rpos.x = clamp(rpos.x, WORLD_MARGIN + 30, WORLD_W - WORLD_MARGIN - 30);
          rpos.y = clamp(rpos.y, WORLD_MARGIN + 60, WORLD_H - WORLD_MARGIN - 30);
          this._ddRocketShadows.push({
            pos: rpos, delay: ri * 0.10,
            t: 0, warnT: DD_ROCKET_WARN, hit: false,
          });
        }
        g.rocketRainCd = DD_ROCKET_CD + Math.random() * 3;
        this.audio?.playRocketRain?.();   // file SFX — throttled 3 s, one sound per wave
        this.floatingTexts.push(new FloatingText(
          'ROCKET RAIN!', new Vec2(g.pos.x, g.pos.y - 55), '#ff4400', 1.2));
      }
    }

    // Update active rocket shadows (warnings + impacts)
    for (let ri = this._ddRocketShadows.length - 1; ri >= 0; ri--) {
      const sh    = this._ddRocketShadows[ri];
      sh.t       += dt;
      const activeT = sh.t - sh.delay;
      if (activeT < 0) continue;
      if (!sh.hit && activeT >= sh.warnT) {
        sh.hit = true;
        this.screenShake.trigger(3, 0.10);
        this.particles.spawnExplosion(sh.pos, [RED, ORANGE, YELLOW], 10);
        if (distance(sh.pos, p.pos) < DD_ROCKET_RADIUS) {
          this._damagePlayer(DD_ROCKET_DMG, { color: ORANGE, shake: 5 });
        }
      }
      if (activeT >= sh.warnT + 0.25) this._ddRocketShadows.splice(ri, 1);
    }

    // ── Claw movement: close in on the player ────────────────────────────────
    const c = dd.claw;
    if (c.hitFlash > 0) c.hitFlash -= dt;

    const isDashing = c.dashState?.phase === 'dash';
    if (!isDashing) {
      const toClaw = p.pos.sub(c.pos);
      if (toClaw.length() > c.radius + PLAYER_RADIUS + 2) {
        c.pos.addMut(safeNormalize(toClaw).scale(DD_CLAW_SPEED * spdM * dt));
      }
    }

    c.pos.x = clamp(c.pos.x, WORLD_MARGIN + c.radius, WORLD_W - WORLD_MARGIN - c.radius);
    c.pos.y = clamp(c.pos.y, WORLD_MARGIN + 40 + c.radius, WORLD_H - WORLD_MARGIN - c.radius);

    // Claw contact damage (heavy melee threat)
    if (distance(c.pos, p.pos) < c.radius + PLAYER_RADIUS &&
        p.dashTimer <= 0 && this.phoenixReviveTimer <= 0 &&
        this.playerHitCooldown <= 0) {
      this.playerHitCooldown = 0.5;
      const dmg = DD_CONTACT_DMG * (1 - p.contactDamageReduction);
      p.applyDamage(dmg);
      this.screenShake.trigger(4, 0.15);
      p.pos.addMut(safeNormalize(p.pos.sub(c.pos)).scale(28));
      this.floatingTexts.push(new FloatingText(
        '-' + Math.ceil(dmg) + ' HP', p.pos.clone(), RED, 0.6));
    }

    // ── Claw attack: Lightning Dash ─────────────────────────────────────────────────────────────
    // telegraph 0.7s (red line from claw to player) → fast dash through the player → electric trail
    c.dashCd -= dt * cdMult;
    if (!c.dashState) {
      if (c.dashCd <= 0) {
        const toP = p.pos.sub(c.pos);
        if (toP.length() < 400) {   // only dash when in range
          c.dashState = {
            phase:        'telegraph',
            t:            0,
            telegraphT:   0.70,
            targetPos:    p.pos.clone(),
            dir:          safeNormalize(toP),
            dashSpeed:    780,
            dashDuration: 0.22,
            trailPts:     [],
            hit:          false,
          };
          c.dashCd = 4.5 + Math.random() * 1.5;
        }
      }
    } else {
      const ds = c.dashState;
      ds.t += dt;

      if (ds.phase === 'telegraph') {
        // Track the player during telegraph so it always aims at where they are
        ds.targetPos = p.pos.clone();
        ds.dir       = safeNormalize(ds.targetPos.sub(c.pos));
        if (ds.t >= ds.telegraphT) {
          ds.phase = 'dash';
          ds.t     = 0;
          ds.hit   = false;
          // Lock direction at fire moment
          ds.dir = safeNormalize(ds.targetPos.sub(c.pos));
        }
      } else if (ds.phase === 'dash') {
        // Store trail point every few frames
        if (ds.trailPts.length === 0 || distance(c.pos, ds.trailPts[ds.trailPts.length - 1]) > 12) {
          ds.trailPts.push(c.pos.clone());
          if (ds.trailPts.length > 18) ds.trailPts.shift();
        }
        c.pos.addMut(ds.dir.scale(ds.dashSpeed * dt));

        // Hit detection during dash (once only)
        if (!ds.hit && distance(c.pos, p.pos) < c.radius + PLAYER_RADIUS + 8) {
          ds.hit = true;
          this._damagePlayer(18, { color: '#00ffff', shake: 6 });
          this.screenShake.trigger(5, 0.18);
          this.particles.spawnHitSparks(p.pos, '#00ffff');
        }

        if (ds.t >= ds.dashDuration) {
          ds.phase   = 'trail';
          ds.t       = 0;
          ds.trailLife = 0.55;   // trail fades over 0.55s
        }
      } else if (ds.phase === 'trail') {
        ds.t += dt;
        if (ds.t >= ds.trailLife) c.dashState = null;
      }
    }

    // ── Claw attack: Claw Slam ─────────────────────────────────────────────────────────────────
    // AoE circle telegraph (1.0s) at player position → shockwave ring expands outward on impact
    c.slamCd -= dt * cdMult;
    if (!c.slamState) {
      if (c.slamCd <= 0 && (!c.dashState || c.dashState.phase === 'trail')) {
        c.slamState = {
          phase:      'telegraph',
          t:          0,
          telegraphT: 1.0,
          pos:        p.pos.clone(),
          radius:     85,
          hit:        false,
        };
        c.slamCd = 5.5 + Math.random() * 2.0;
        this.audio?.playEventWarning?.();
      }
    } else {
      const ss = c.slamState;
      ss.t += dt;
      if (ss.phase === 'telegraph' && ss.t >= ss.telegraphT) {
        ss.phase = 'impact';
        ss.t     = 0;
        // Shockwave ring
        this._ddClawShockwaves.push({ pos: ss.pos.clone(), radius: c.radius, maxR: 220, alpha: 1.0, hit: false });
        this.screenShake.trigger(7, 0.22);
        this.particles.spawnExplosion(ss.pos, [RED, ORANGE], 14);
        this.audio?.playBloodfangBite?.();
        // Slam damage if player inside AoE
        if (!ss.hit && distance(p.pos, ss.pos) < ss.radius) {
          ss.hit = true;
          this._damagePlayer(16, { color: RED, shake: 7 });
          if (this.player.dashTimer <= 0) {
            const kb = safeNormalize(p.pos.sub(ss.pos));
            p.pos.addMut(kb.scale(60));
          }
        }
      }
      if (ss.phase === 'impact' && ss.t >= 0.3) c.slamState = null;
    }

    // Update shockwave rings
    for (let i = this._ddClawShockwaves.length - 1; i >= 0; i--) {
      const sw = this._ddClawShockwaves[i];
      sw.radius += 260 * dt;
      sw.alpha   = Math.max(0, 1.0 - sw.radius / sw.maxR);
      if (!sw.hit) {
        const d = distance(sw.pos, p.pos);
        if (sw.radius >= d - PLAYER_RADIUS - 4) {
          sw.hit = true;
          this._damagePlayer(10, { color: RED, shake: 4 });
        }
      }
      if (sw.alpha <= 0) this._ddClawShockwaves.splice(i, 1);
    }

    if (dd.hp <= 0) this._doubleDemonsDie();
  }

  _doubleDemonsDie() {
    const dd = this.doubleDemonsBoss;
    if (!dd) return;
    // Eden Core: boss echo
    if (this.meta) {
      const firstKill = this.meta.recordBossEcho('doubleDemon');
      const ddMsg = firstKill
        ? 'DOUBLE DEMONS ECHO ARCHIVED. First contact recorded.'
        : this._edenPick(['DOUBLE DEMONS signal collapsed.', 'Twin demon traces erased.', 'Double Demon pattern: terminated.']);
      this.meta.addSystemMessage(ddMsg);
      this.meta.addEdenMemory(1);
      this._queueEdenTransmission(ddMsg, { title: 'EDEN CORE', priority: 2, duration: 5 });
    }

    this.particles.spawnExplosion(dd.gunner.pos, ['#ff2d95', ORANGE, YELLOW], 22);
    this.particles.spawnExplosion(dd.claw.pos,   [RED, '#ff2d95', WHITE],     22);
    this.screenShake.trigger(16, 1.2);

    this.score = (this.score ?? 0) + 600;
    this.player.gainXp(55, this.floatingTexts);
    const ddCredits = this._awardCredits(30 + Math.floor(Math.random() * 21));  // 30-50
    this.overload = Math.max(0, this.overload - 12);

    // Extra cores: 3 gold + 2 silver scatter from both bodies
    const drops = [
      [dd.gunner.pos.add(new Vec2(-30,   0)), 'gold'],
      [dd.gunner.pos.add(new Vec2( 30, -20)), 'gold'],
      [dd.claw.pos.add(  new Vec2(  0,  30)), 'gold'],
      [dd.claw.pos.add(  new Vec2(-28, -15)), 'silver'],
      [dd.claw.pos.add(  new Vec2( 28,  15)), 'silver'],
    ];
    for (const [dpos, dtype] of drops) {
      this.groundCores.push(new DataCore(this._clampPickupPos(dpos), dtype));
    }

    this.floatingTexts.push(new FloatingText('\u26a1 DOUBLE DEMONS DEFEATED \u26a1',
      dd.gunner.pos.clone(), '#ff2d95', 2.8));
    this.floatingTexts.push(new FloatingText('+' + ddCredits + ' GRID CREDITS',
      new Vec2(dd.claw.pos.x, dd.claw.pos.y - 32), GREEN, 2.5));
    this.floatingTexts.push(new FloatingText('+5 CORES DROPPED',
      new Vec2(dd.gunner.pos.x, dd.gunner.pos.y - 32), YELLOW, 2.2));

    this.triggerAnnouncement('\u26a1 DOUBLE DEMONS DEFEATED \u26a1', '#ff2d95');
    // Protocol Fragment reward (suppressed inside arena)
    if (this._nullBreachActive) {
      if (this._nullBreachArena) this._nullBreachArena.kills = (this._nullBreachArena.kills || 0) + 1;
    } else if (this.meta && this.endless) {
      this.meta.protocolFragments += BOSS_KILL_PF;
      this.meta._save();
      this.floatingTexts.push(new FloatingText('+' + BOSS_KILL_PF + ' 🧩 FRAGMENT',
        new Vec2(dd.gunner.pos.x, dd.gunner.pos.y - 68), '#ff5ea8', 2.5));
    }
    this.doubleDemonsBoss    = null;
    this._ddClawShockwaves   = [];
    this._ddLightningTrails  = [];
    this._ddRocketShadows    = [];
  }

  _drawDoubleDemonsBoss(ctx) {
    const dd = this.doubleDemonsBoss;
    if (!dd || dd.hp <= 0) return;

    const now   = Date.now();
    const enragePulse = dd.enraged ? 0.6 + 0.4 * Math.abs(Math.sin(now / 150)) : 1.0;
    const spr   = this._doubleDemonsSprite;
    const hasSpr = spr && spr.complete && spr.naturalWidth > 0;

    // ── Draw each body ────────────────────────────────────────────────────────
    const bodies = [
      { body: dd.gunner, label: 'GUNNER', aura: '#ff2d95', half: 'left'  },
      { body: dd.claw,   label: 'CLAW',   aura: RED,       half: 'right' },
    ];

    for (const { body, label, aura, half } of bodies) {
      const { pos, radius } = body;

      // Enrage aura ring
      if (dd.enraged) {
        ctx.save();
        ctx.globalAlpha = enragePulse * 0.55;
        ctx.strokeStyle = '#ff4400';
        ctx.lineWidth   = 5;
        ctx.beginPath(); ctx.arc(pos.x, pos.y, radius + 9, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }

      drawGlow(ctx, pos.x, pos.y, radius, aura, 0.30);

      // Sprite (left/right half of shared sheet) or fallback circle
      ctx.save();
      if (hasSpr) {
        const hw = Math.floor(spr.naturalWidth / 2);
        const sx = half === 'left' ? 0 : hw;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(spr, sx, 0, hw, spr.naturalHeight,
          pos.x - radius, pos.y - radius, radius * 2, radius * 2);
        ctx.imageSmoothingEnabled = true;
      } else {
        ctx.fillStyle   = aura;
        ctx.strokeStyle = WHITE;
        ctx.lineWidth   = 3;
        ctx.beginPath(); ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        // Fallback label inside circle so it's clear which is which
        ctx.font      = 'bold 9px Consolas, monospace';
        ctx.fillStyle = WHITE;
        ctx.textAlign = 'center';
        ctx.fillText(label[0], pos.x, pos.y + 3);   // G or C
      }
      ctx.restore();

      // Hit flash
      if (body.hitFlash > 0) {
        ctx.save();
        ctx.globalAlpha = 0.65;
        ctx.fillStyle   = WHITE;
        ctx.beginPath(); ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      // Body label
      ctx.save();
      ctx.font      = 'bold 10px Consolas, monospace';
      ctx.fillStyle = dd.enraged ? '#ff6600' : aura;
      ctx.textAlign = 'center';
      ctx.fillText(label, pos.x, pos.y - radius - 5);
      ctx.restore();
    }

    // ── Gunner attack visuals ───────────────────────────────────────────────────────────
    const _g = dd.gunner;

    // Spin-up Barrage telegraph: glowing barrel dots arc toward the player
    if (_g.barragePhase?.phase === 'telegraph') {
      const bp     = _g.barragePhase;
      const prog   = bp.t / bp.telegraphT;
      const toP    = this.player.pos.sub(_g.pos);
      const baseA  = Math.atan2(toP.y, toP.x);
      const nBarrels = 5;
      ctx.save();
      for (let bi = 0; bi < nBarrels; bi++) {
        const frac  = (bi / (nBarrels - 1)) - 0.5;
        const angle = baseA + frac * Math.PI * 0.70;
        const blen  = _g.radius + 6 + prog * 14;
        const bx = _g.pos.x + Math.cos(angle) * blen;
        const by = _g.pos.y + Math.sin(angle) * blen;
        ctx.globalAlpha  = 0.35 + 0.65 * prog;
        ctx.fillStyle    = '#ff2d95';
        ctx.shadowColor  = '#ff2d95';
        ctx.shadowBlur   = 10 * prog;
        ctx.beginPath(); ctx.arc(bx, by, 4 + 3 * prog, 0, Math.PI * 2); ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    // Suppress telegraph: orange muzzle-flash glow
    if (_g.suppressState?.phase === 'telegraph') {
      const prog = _g.suppressState.t / _g.suppressState.telegraphT;
      ctx.save();
      ctx.globalAlpha = prog * 0.75;
      drawGlow(ctx, _g.pos.x, _g.pos.y, _g.radius + 10, ORANGE, 0.8);
      ctx.restore();
    }

    // ── Claw attack visuals ──────────────────────────────────────────────────────────────
    const _c = dd.claw;

    // Lightning Dash telegraph: red line from claw toward target
    if (_c.dashState?.phase === 'telegraph') {
      const ds   = _c.dashState;
      const prog = ds.t / ds.telegraphT;
      ctx.save();
      ctx.globalAlpha  = 0.35 + 0.55 * prog;
      ctx.strokeStyle  = '#ff3333';
      ctx.lineWidth    = 2 + prog * 3;
      ctx.shadowColor  = '#ff3333';
      ctx.shadowBlur   = 10 * prog;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(_c.pos.x, _c.pos.y);
      ctx.lineTo(ds.targetPos.x, ds.targetPos.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;
      // Claw glow intensifies
      ctx.globalAlpha = prog * 0.7;
      drawGlow(ctx, _c.pos.x, _c.pos.y, _c.radius + 10, '#ff3333', 0.8);
      ctx.restore();
    }

    // Lightning Dash trail: electric sparks along path
    if (_c.dashState?.phase === 'trail' || _c.dashState?.phase === 'dash') {
      const ds    = _c.dashState;
      const pts   = ds.trailPts;
      const alpha = ds.phase === 'trail' ? Math.max(0, 1 - ds.t / ds.trailLife) : 0.9;
      if (pts.length > 1) {
        ctx.save();
        ctx.globalAlpha = alpha * 0.85;
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth   = 3;
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur  = 14;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let ti = 1; ti < pts.length; ti++) {
          // Jitter for electric feel
          const jx = pts[ti].x + (Math.random() - 0.5) * 5;
          const jy = pts[ti].y + (Math.random() - 0.5) * 5;
          ctx.lineTo(jx, jy);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.restore();
      }
    }

    // Claw Slam telegraph: pulsing dashed circle at target position
    if (_c.slamState?.phase === 'telegraph') {
      const ss   = _c.slamState;
      const prog = ss.t / ss.telegraphT;
      ctx.save();
      ctx.globalAlpha = 0.12 + 0.22 * prog;
      ctx.fillStyle   = RED;
      ctx.beginPath(); ctx.arc(ss.pos.x, ss.pos.y, ss.radius, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.4 + 0.5 * prog;
      ctx.strokeStyle = ORANGE;
      ctx.lineWidth   = 2 + prog * 2;
      ctx.setLineDash([10, 7]);
      ctx.beginPath(); ctx.arc(ss.pos.x, ss.pos.y, ss.radius, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Claw Slam shockwave rings
    for (const sw of this._ddClawShockwaves) {
      ctx.save();
      ctx.globalAlpha = sw.alpha * 0.85;
      ctx.strokeStyle = RED;
      ctx.lineWidth   = 3;
      ctx.shadowColor = ORANGE;
      ctx.shadowBlur  = 8;
      ctx.beginPath(); ctx.arc(sw.pos.x, sw.pos.y, sw.radius, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    // ── Rocket Rain: shadow telegraphs + falling rocket sprites ──────────────────────────
    const rktSpr  = this._rocketRainSprite;
    const hasRkt  = rktSpr && rktSpr.complete && rktSpr.naturalWidth > 0;
    for (const sh of this._ddRocketShadows) {
      const activeT = sh.t - sh.delay;
      if (activeT < 0) continue;
      const prog  = Math.min(1, activeT / sh.warnT);
      const { pos } = sh;

      // Ground shadow: pulsing orange circle
      ctx.save();
      ctx.globalAlpha = 0.10 + 0.25 * prog;
      ctx.fillStyle   = ORANGE;
      ctx.beginPath(); ctx.arc(pos.x, pos.y, DD_ROCKET_RADIUS, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.35 + 0.55 * prog;
      ctx.strokeStyle = RED;
      ctx.lineWidth   = 2;
      ctx.setLineDash([8, 6]);
      ctx.beginPath(); ctx.arc(pos.x, pos.y, DD_ROCKET_RADIUS, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Rocket falling from above (visible in last 40% of warn time)
      if (prog > 0.60) {
        const fallProg = (prog - 0.60) / 0.40;   // 0..1 during fall phase
        const startY   = pos.y - 120;
        const rocketY  = startY + fallProg * 120;
        ctx.save();
        ctx.globalAlpha = 0.5 + 0.5 * fallProg;
        if (hasRkt) {
          const rs = 24;
          ctx.drawImage(rktSpr, pos.x - rs, rocketY - rs * 1.5, rs * 2, rs * 3);
        } else {
          ctx.fillStyle   = ORANGE;
          ctx.shadowColor = RED;
          ctx.shadowBlur  = 12;
          ctx.beginPath(); ctx.arc(pos.x, rocketY, 7, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
        }
        ctx.restore();
      }
    }

    // ââ Shared HP bar (bottom-center, above HUD strip) ────────────────────────
    // HP bar — must draw in screen space (identity transform)
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);  // screen space

    const barW  = 340;
    const barH  = 10;
    const barX  = WIDTH / 2 - barW / 2;
    const barY  = HEIGHT - 46;
    const hpPct = Math.max(0, dd.hp / dd.maxHp);

    ctx.fillStyle = 'rgba(0,0,0,0.70)';
    ctx.fillRect(barX - 2, barY - 14, barW + 4, barH + 20);

    const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    grad.addColorStop(0, dd.enraged ? '#ff0000' : '#cc1166');
    grad.addColorStop(1, dd.enraged ? '#ff8800' : '#ff2d95');
    ctx.fillStyle = grad;
    ctx.fillRect(barX, barY, Math.round(barW * hpPct), barH);

    // 50% enrage marker
    ctx.fillStyle = 'rgba(255,220,0,0.8)';
    ctx.fillRect(barX + barW * DD_ENRAGE_PCT - 1, barY - 1, 2, barH + 2);

    // Name
    ctx.save();
    ctx.font      = 'bold 11px Consolas, monospace';
    ctx.fillStyle = dd.enraged ? '#ff6600' : '#ff2d95';
    ctx.textAlign = 'center';
    ctx.fillText('\u26a1 DOUBLE DEMONS' + (dd.enraged ? ' [ENRAGED]' : '') + ' \u26a1',
      WIDTH / 2, barY - 4);
    ctx.restore();

    // HP text
    ctx.save();
    ctx.font      = '10px Consolas, monospace';
    ctx.fillStyle = WHITE;
    ctx.textAlign = 'center';
    ctx.fillText(Math.ceil(dd.hp) + ' / ' + dd.maxHp, WIDTH / 2, barY + barH + 10);
    ctx.restore();

    ctx.restore();  // back to camera (world) space
  }

  _drawAcidRain(ctx) {
    if (!this.acidRain) return;

    const now = performance.now() / 1000;

    ctx.save();

    // Subtle green screen tint
    ctx.fillStyle = 'rgba(0,60,0,0.12)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const fallImg   = this._acidRainFallImg;
    const splashImg = this._acidRainSplashImg;
    const hasFall   = fallImg   && fallImg.complete   && fallImg.naturalWidth   > 0;
    const hasSplash = splashImg && splashImg.complete && splashImg.naturalWidth > 0;

    const ACID_COLOR  = '#44ff88';
    const DROP_SPEED  = 300;
    const DIAGONAL    = 0.24;
    const TOTAL_H     = HEIGHT + 60;
    const COUNT       = 50;

    // Sprite sheet layout: fall = 6 frames side by side (732×492 → 122×492 each)
    const FALL_FRAMES = 6;
    const FALL_FW     = hasFall   ? Math.floor(fallImg.naturalWidth   / FALL_FRAMES) : 0;
    const FALL_FH     = hasFall   ? fallImg.naturalHeight : 0;

    // Sprite sheet layout: splash = 2×2 grid (714×363 → 357×181 each)
    const SPLASH_FW   = hasSplash ? Math.floor(splashImg.naturalWidth  / 2) : 0;
    const SPLASH_FH   = hasSplash ? Math.floor(splashImg.naturalHeight / 2) : 0;

    // On-screen draw sizes (pixel art, keeps aspect ratio)
    const DRAW_DROP_W   = 18;
    const DRAW_DROP_H   = 72;
    const DRAW_SPLASH_W = 52;
    const DRAW_SPLASH_H = 26;

    ctx.imageSmoothingEnabled = false;

    for (let i = 0; i < COUNT; i++) {
      const seedX     = ((i * 23.4 + i * i * 0.71) % (WIDTH + 80)) - 40;
      const seedPhase = (i * 17.13) % 1;
      const alpha     = 0.72 + 0.20 * ((i * 7 % 3) / 3);
      const progress  = ((now * DROP_SPEED / TOTAL_H) + seedPhase) % 1;
      const x         = seedX + progress * TOTAL_H * DIAGONAL;
      const y         = progress * TOTAL_H - 30;

      ctx.globalAlpha = alpha;

      if (y > HEIGHT - 28 && y <= HEIGHT + 10) {
        // Ground splash
        if (hasSplash) {
          // Alternate top-left (big splash) and top-right (smaller) per drop
          const _sIdx  = i % 4;
          const sFrameX = (_sIdx % 2) * SPLASH_FW;
          const sFrameY = (_sIdx < 2) ? 0 : SPLASH_FH;
          ctx.drawImage(splashImg,
            sFrameX, sFrameY, SPLASH_FW, SPLASH_FH,
            Math.round(x - DRAW_SPLASH_W / 2), HEIGHT - DRAW_SPLASH_H,
            DRAW_SPLASH_W, DRAW_SPLASH_H);
        } else {
          ctx.strokeStyle = ACID_COLOR;
          ctx.lineWidth   = 1;
          ctx.beginPath();
          ctx.ellipse(Math.round(x + 5), HEIGHT - 3, 5, 2, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (y < HEIGHT - 28) {
        // Falling drop — animate through 6 frames at ~10 fps, offset per drop
        if (hasFall) {
          const frameIdx = (Math.floor(now * 10) + i) % FALL_FRAMES;
          ctx.drawImage(fallImg,
            frameIdx * FALL_FW, 0, FALL_FW, FALL_FH,
            Math.round(x - DRAW_DROP_W / 2), Math.round(y),
            DRAW_DROP_W, DRAW_DROP_H);
        } else {
          ctx.strokeStyle = ACID_COLOR;
          ctx.lineWidth   = 2;
          ctx.beginPath();
          ctx.moveTo(Math.round(x),     Math.round(y));
          ctx.lineTo(Math.round(x + 4), Math.round(y + 14));
          ctx.stroke();
        }
      }
    }

    ctx.globalAlpha           = 1;
    ctx.imageSmoothingEnabled = true;
    ctx.restore();
  }

  // Effective view scale / visible window. Endless zooms out slightly (ENDLESS_VIEW_SCALE);
  // Act 1 returns the exact globals (WIDTH/VIEW_SCALE === VIEW_W), so Act 1 is byte-identical.
  get _viewScale() { return this.endless ? ENDLESS_VIEW_SCALE : VIEW_SCALE; }
  get _viewW()     { return this.endless ? WIDTH  / ENDLESS_VIEW_SCALE : VIEW_W; }
  get _viewH()     { return this.endless ? HEIGHT / ENDLESS_VIEW_SCALE : VIEW_H; }

  _updateCamera() {
    // Center the player in the (larger, zoomed-out) visible world window.
    const cx = this.player.pos.x - this._viewW / 2;
    const cy = this.player.pos.y - this._viewH / 2;
    this.camera.x = Math.max(0, Math.min(cx, WORLD_W - this._viewW));
    this.camera.y = Math.max(0, Math.min(cy, WORLD_H - this._viewH));
  }

  _worldMouse(screenPos) {
    if (!screenPos) return null;
    // Screen → world: undo the view zoom, then the camera offset.
    return { x: screenPos.x / this._viewScale + this.camera.x, y: screenPos.y / this._viewScale + this.camera.y };
  }

  // Endless-only Nexus base sprite drawn UNDER a matrix. Clean fixed size so it doesn't cover
  // too much play space; if the image is missing, draw nothing (the matrix renders itself).
  _drawEndlessNexusBase(ctx, m) {
    const img = this._endlessNexusImage;
    if (!(img && img.complete && img.naturalWidth > 0)) return;
    const D = 120;   // Endless base visual (was 150) — smaller for readability; deposit/collision radius unchanged
    // Soft elliptical contact shadow so the base reads as planted on the arena, not pasted on top.
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath();
    ctx.ellipse(m.pos.x, m.pos.y + D * 0.30, D * 0.40, D * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.drawImage(img, m.pos.x - D / 2, m.pos.y - D / 2, D, D);
  }

  // ─── Chaos Mode: pylon system ───────────────────────────────────────────────
  _updateChaosPylons(dt) {
    const player = this.player;
    if (!player || player.dead) return;

    // Spawn cooldown
    this._chaosPylonCd -= dt;
    if (this._chaosPylonCd <= 0) {
      this._chaosPylonCd = 4.5 + Math.random() * 3.5;
      // Spawn 1-2 pylons near player, world-space, not on top of them
      const count = Math.random() < 0.4 ? 2 : 1;
      for (let i = 0; i < count; i++) {
        const angle  = Math.random() * Math.PI * 2;
        const dist   = 180 + Math.random() * 220;
        const px     = Math.max(40, Math.min(WORLD_W - 40, player.pos.x + Math.cos(angle) * dist));
        const py     = Math.max(40, Math.min(WORLD_H - 40, player.pos.y + Math.sin(angle) * dist));
        // Danger pylons more common than buff pylons (2:1:1)
        const roll   = Math.random();
        const type   = roll < 0.50 ? 'danger' : roll < 0.75 ? 'shield' : 'heal';
        this._chaosPylons.push({
          pos: new Vec2(px, py), type, life: 6.0, maxLife: 6.0, radius: 28,
          triggered: false,
        });
      }
    }

    // Update existing pylons
    const TRIGGER_R = 48;
    for (let i = this._chaosPylons.length - 1; i >= 0; i--) {
      const p = this._chaosPylons[i];
      p.life -= dt;
      if (p.life <= 0) { this._chaosPylons.splice(i, 1); continue; }

      if (!p.triggered) {
        const d = player.pos.distanceTo(p.pos);
        if (d < TRIGGER_R) {
          p.triggered = true;
          p.life      = Math.min(p.life, 0.6); // flash then remove
          if (p.type === 'danger') {
            this._damagePlayer(15, { color: '#ff4400', shake: 4 });
            this._spawnFloatingText('CHAOS PULSE', p.pos.clone(), '#ff4400', 1.2);
          } else if (p.type === 'shield') {
            this.player.shieldTimer = Math.max(this.player.shieldTimer, 5.0);
            this._chaosPylonBuff    = { type: 'shield', timer: 3.0 };
            this._spawnFloatingText('SHIELD PULSE', p.pos.clone(), '#00eeff', 1.1);
          } else { // heal
            const heal = Math.round(this.player.maxHp * 0.08);
            this.player.hp = Math.min(this.player.maxHp, this.player.hp + heal);
            this._chaosPylonBuff = { type: 'heal', timer: 3.0 };
            this._spawnFloatingText('+' + heal + ' HP', p.pos.clone(), '#44ff88', 1.1);
          }
        }
      }
    }

    // Decay active buff indicator
    if (this._chaosPylonBuff) {
      this._chaosPylonBuff.timer -= dt;
      if (this._chaosPylonBuff.timer <= 0) this._chaosPylonBuff = null;
    }
  }

  _spawnFloatingText(text, pos, color, intensity) {
    if (this._floatingTexts) {
      this._floatingTexts.push(new FloatingText(text, pos, color, intensity));
    }
  }

  _drawChaosPylons(ctx) {
    const now = performance.now();
    for (const p of this._chaosPylons) {
      const lifeFrac = p.life / p.maxLife;
      const pulse    = 0.7 + 0.3 * Math.sin(now * 0.005 + p.pos.x);
      const alpha    = Math.min(1, lifeFrac * 3) * pulse;
      const r        = p.radius;

      // Colour by type
      let core, glow;
      if (p.type === 'danger') { core = '#ff4400'; glow = '#ff220088'; }
      else if (p.type === 'shield') { core = '#00eeff'; glow = '#00bbff66'; }
      else { core = '#44ff88'; glow = '#22cc6644'; }

      ctx.save();
      ctx.globalAlpha = alpha;

      // Outer glow ring
      const grad = ctx.createRadialGradient(p.pos.x, p.pos.y, r * 0.3, p.pos.x, p.pos.y, r * 1.6);
      grad.addColorStop(0, glow);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.pos.x, p.pos.y, r * 1.6, 0, Math.PI * 2);
      ctx.fill();

      // Hexagon body
      ctx.strokeStyle = core;
      ctx.lineWidth   = 2;
      ctx.beginPath();
      for (let s = 0; s < 6; s++) {
        const a = (s / 6) * Math.PI * 2 - Math.PI / 6 + now * 0.0008;
        s === 0 ? ctx.moveTo(p.pos.x + Math.cos(a) * r, p.pos.y + Math.sin(a) * r)
                : ctx.lineTo(p.pos.x + Math.cos(a) * r, p.pos.y + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.stroke();

      // Inner core dot
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(p.pos.x, p.pos.y, 4 + 2 * pulse, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  _drawChaosDebris(ctx) {
    // Procedural visual debris — stateless, seeded per position, world-space
    // No collision, no gameplay effect
    const now  = performance.now() * 0.001;
    const seed = [137, 251, 373, 419, 523, 617, 709, 811];
    ctx.save();
    ctx.globalAlpha = 0.18;
    for (let i = 0; i < 32; i++) {
      const s  = seed[i % seed.length];
      const bx = ((s * (i + 7) * 97) % WORLD_W);
      const by = ((s * (i + 3) * 113) % WORLD_H);
      const sz = 3 + (i % 5);
      const a  = (now * 0.3 + i * 1.1) % (Math.PI * 2);
      const ox = Math.cos(a) * 6;
      const oy = Math.sin(a * 0.7) * 4;
      ctx.fillStyle = i % 3 === 0 ? '#ff2d95' : i % 3 === 1 ? '#00eeff' : '#ff6600';
      ctx.fillRect(bx + ox - sz / 2, by + oy - sz / 2, sz, sz);
    }
    ctx.restore();
  }

  _drawChaosRimGlow(ctx) {
    // Screen-edge magenta rim — readability polish, purely visual
    const W = this._canvas.width, H = this._canvas.height;
    const t = performance.now();
    const a = 0.18 + 0.07 * Math.sin(t * 0.0009);

    // Top edge
    let g = ctx.createLinearGradient(0, 0, 0, 60);
    g.addColorStop(0, `rgba(180,0,120,${a})`); g.addColorStop(1, 'transparent');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, 60);

    // Bottom edge
    g = ctx.createLinearGradient(0, H - 60, 0, H);
    g.addColorStop(0, 'transparent'); g.addColorStop(1, `rgba(180,0,120,${a})`);
    ctx.fillStyle = g; ctx.fillRect(0, H - 60, W, 60);

    // Left edge
    g = ctx.createLinearGradient(0, 0, 60, 0);
    g.addColorStop(0, `rgba(180,0,120,${a})`); g.addColorStop(1, 'transparent');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 60, H);

    // Right edge
    g = ctx.createLinearGradient(W - 60, 0, W, 0);
    g.addColorStop(0, 'transparent'); g.addColorStop(1, `rgba(180,0,120,${a})`);
    ctx.fillStyle = g; ctx.fillRect(W - 60, 0, 60, H);
  }

  _drawChaosVignette(ctx) {
    // Dark radial vignette centred on player — focuses attention, visual only
    if (!this.player) return;
    const W  = this._canvas.width, H = this._canvas.height;
    // Convert player world-pos → screen-pos via camera
    const cam = this._camera || { x: 0, y: 0 };
    const sx  = this.player.pos.x - cam.x;
    const sy  = this.player.pos.y - cam.y;
    const rad = Math.min(W, H) * 0.65;
    const g   = ctx.createRadialGradient(sx, sy, rad * 0.3, sx, sy, rad);
    g.addColorStop(0, 'transparent');
    g.addColorStop(1, 'rgba(0,0,0,0.38)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  // ────────────────────────────────────────────────────────────────────────────

  _drawWorldBackground(ctx) {
    ctx.fillStyle = DARK_BG;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);

    // Endless-only Stage 02 map; falls back to the default background if not loaded / not endless.
    const cb  = this._chaosBgImage;
    const eb  = this._endlessBgImage;
    const img = (this._chaosMode && cb && cb.complete && cb.naturalWidth > 0)
              ? cb
              : (this.endless && eb && eb.complete && eb.naturalWidth > 0) ? eb : this._bgImage;
    if (img.complete && img.naturalWidth > 0) {
      const scale = WORLD_W / img.naturalWidth;
      const drawH = img.naturalHeight * scale;
      ctx.drawImage(img, 0, 0, WORLD_W, drawH);
      // Endless map: a touch more dimming so the backdrop recedes and the gameplay plane reads flat.
      ctx.fillStyle = this.gridBlackoutActive ? 'rgba(0,0,0,0.65)'
                    : this._chaosMode          ? 'rgba(0,0,0,0.38)'
                    : this.endless             ? 'rgba(0,0,0,0.46)'
                    :                            'rgba(0,0,0,0.38)';
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
      // Chaos Mode: faint magenta grid overlay — textures the battlefield, visual only
      if (this._chaosMode) {
        const _gs = 80;
        const _gt = performance.now() * 0.0003;
        ctx.save();
        ctx.globalAlpha = 0.05 + 0.02 * Math.sin(_gt);
        ctx.strokeStyle = '#ff2d95';
        ctx.lineWidth   = 0.5;
        for (let _gx = 0; _gx < WORLD_W; _gx += _gs) {
          ctx.beginPath(); ctx.moveTo(_gx, 0); ctx.lineTo(_gx, WORLD_H); ctx.stroke();
        }
        for (let _gy = 0; _gy < WORLD_H; _gy += _gs) {
          ctx.beginPath(); ctx.moveTo(0, _gy); ctx.lineTo(WORLD_W, _gy); ctx.stroke();
        }
        ctx.restore();
      }
    } else {
      const spacing = 48;
      const offset  = Math.floor(performance.now() * 0.025) % spacing;
      ctx.strokeStyle = GRID_LINE;
      ctx.lineWidth   = 1;
      for (let x = -spacing; x < WORLD_W + spacing; x += spacing) {
        ctx.beginPath();
        ctx.moveTo(x + offset, 44);
        ctx.lineTo(x + offset, WORLD_H);
        ctx.stroke();
      }
      for (let y = 44; y < WORLD_H + spacing; y += spacing) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(WORLD_W, y);
        ctx.stroke();
      }
    }
  }

  _drawBackground(ctx) {
    // ── Dark base fill (shown while image loads or on very old browsers) ──────
    ctx.fillStyle = DARK_BG;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // ── Cyberpunk city image ─────────────────────────────────────────────────
    const img = this._bgImage;
    if (img.complete && img.naturalWidth > 0) {
      // "cover" scaling: fill the entire canvas, crop excess.
      // The image is portrait (tall); we fit its width to the canvas and
      // anchor the top so the city streets are visible.
      const imgW = img.naturalWidth;
      const imgH = img.naturalHeight;
      const scale = WIDTH / imgW;          // scale so width fills 1280px
      const drawH = imgH * scale;          // resulting height (will exceed 720)

      ctx.drawImage(img, 0, 0, WIDTH, drawH);

      // Semi-transparent dark overlay so neon game entities pop clearly
      ctx.fillStyle = this.gridBlackoutActive
        ? 'rgba(0,0,0,0.65)'   // extra dim during Grid Blackout event
        : 'rgba(0,0,0,0.38)';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    } else {
      // Fallback: scrolling neon grid while image loads
      const spacing = 48;
      const offset  = Math.floor(performance.now() * 0.025) % spacing;
      ctx.strokeStyle = GRID_LINE;
      ctx.lineWidth   = 1;
      for (let x = -spacing; x < WIDTH + spacing; x += spacing) {
        ctx.beginPath();
        ctx.moveTo(x + offset, 44);
        ctx.lineTo(x + offset, HEIGHT);
        ctx.stroke();
      }
      for (let y = 44; y < HEIGHT + spacing; y += spacing) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(WIDTH, y);
        ctx.stroke();
      }
    }

    // ── Dark HUD strip (always on top of background) ─────────────────────────
    ctx.fillStyle = BLACK;
    ctx.fillRect(0, 0, WIDTH, 44);
  }

  // Called by main.js to pass current mouse pos to the draw call
  setMousePos(pos) { this._lastMousePos = pos; }
}