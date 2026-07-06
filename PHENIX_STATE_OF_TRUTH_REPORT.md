# PHENIX: NULL EDEN — State of Truth Report
### Multi-Agent Analytical Status Report | July 4, 2026
### Commit: `457782d` | Branch: `main` | Synced: origin/main

---

## 1. Characters, Skins & Loadouts

| # | Character | Element | Role | Base Weapon | Behavior | Dmg | CD | Ultimate | Sprite |
|---|-----------|---------|------|-------------|----------|-----|-----|----------|--------|
| 1 | Cyber Skeleton Warrior | Electric | Tank/Survival | Storm Saber Cursed Slash | FORWARD_ARC | 28 | 1.2s | Thunder Solo (lightning bolts rain, screen shake) | `characters/skeleton_warrior.png` |
| 2 | Neon Taekwondo Girl | Ice | Speed/AoE | Spirit Crescent Kick Aura | WIDE_ARC (pierce 2) | 25 | 0.9s | Spirit Dojang Flag (7s cyan dojo field, dmg+slow) | `characters/taekwondo_girl.png` |
| 3 | Cyber Arm Hero | Electric | Ranged/Damage | Overloaded Magnetic Arc Burst | FORWARD_CONE | 22 | 1.0s | Overheated Heavy Chains (7s rotating chains, 10% HP cost) | `characters/cyber_arm_hero.png` |
| 4 | Brawler Warrior | Fire | Tank/Brawler | Nexus Chakram | ORBIT_THROW (pierce 3) | 18 | 0.8s | Skyfall Lances (vertical energy lances rain in waves) | `characters/brawler_warrior.png` |
| 5 | Assassin Clone | Toxin | Stealth/Burst | Shadow-Toxic Diagonal Cuts | CROSS_SLASH (pierce 2) | 32 | 1.4s | Chrome Phantom Protocol (dual-clone burst slashes) | `characters/assassin_clone.png` |
| 6 | Euclid Vector | Toxin | Toxin/Ranged | Digital Gas Needle Vector | LINE_CLOUD | 30 | 1.5s | Plague Trail Dash (toxic dash trail, min 60 mana) | `characters/endless/euclid_vector.png` |
| 7 | Oni Cataclysm Protocol | Fire | Endless/Cataclysm | Demonic Cataclysm Pulse | GROUND_SHOCKWAVE (pierce 99) | 45 | 2.5s | Protocol 0: Total Cataclysm (laser+meteor+protocol-0) | `characters/endless/oni_cataclysm_protocol.png` |
| 8 | Japan Phasewalker | Void | Phase/Displace | Glitch Singularity Tear | VORTEX (pierce 5) | 35 | 2.0s | Digital Singularity (4-phase laser strikes) | `characters/endless/japan_phasewalker.png` |

**Lock Status:** Characters 1-5 unlocked by default. Euclid Vector & Japan Phasewalker marked `comingSoon: true`. Oni Cataclysm Protocol requires PF purchase.

### Secret Skins

| # | Character | Skin Name | Unlock Key | Status |
|---|-----------|-----------|------------|--------|
| 1 | Skeleton Warrior | Cyber Skeleton Warrior | `golden_skeleton_warrior` | Unlockable |
| 2 | Taekwondo Girl | Grandmaster Dojang Girl | `grandmaster_dojang_girl` | Unlockable |
| 3 | Cyber Arm Hero | Neon Cyber Arm Hero | `dark_cyber_arm_hero` | Unlockable |
| 4 | Brawler Warrior | LOG #1997 Brawler | `log_1997` | Endless-only unlock |
| 5 | Assassin Clone | LOG #1998 Phantom Assassin | `log_1998` | LOCKED (no in-game grant exists) |

---

## 2. Null Relics Registry (13 Total)

### Universal Relics (4)

| ID | Name | Cost | Effect |
|----|------|------|--------|
| `eden_core_fragment` | Eden Core Fragment | 5 PF | First boss drops +1 extra Fragment per run |
| `null_battery` | Null Battery | 4 PF | Q/E cooldowns recharge 8% faster (`abilityCdMult = 1.08`) |
| `broken_halo` | Broken Halo | 5 PF | Once/run: HP < 25% triggers 2s shield + enemy push |
| `blacknet_coupon` | Blacknet Coupon | 4 PF | +1 extra reroll on first level-up screen |

### Boss Relics (2)

| ID | Name | Cost | Req | Effect |
|----|------|------|-----|--------|
| `serpent_ember_coil` | Serpent Ember Coil | 6 PF | Kill Cyber Serpent | Dash leaves 1.5s ember trail, burn on contact |
| `dragon_cryo_heart` | Dragon Cryo Heart | 8 PF | Kill Cyber Dragon | Every 30s, next hit summons cryo shard |

### Character-Locked Relics (4)

| ID | Name | Cost | Character | Effect |
|----|------|------|-----------|--------|
| `oni_blood_circuit` | Oni Blood Circuit | 6 PF | Oni Cataclysm | Ult marks enemies 5s, +15% dmg taken |
| `crescent_soul_bead` | Crescent Soul Bead | 6 PF | Taekwondo Girl | Every 7th Kick: +2 pierce + shockwave |
| `null_venom_chamber` | Null Venom Chamber | 7 PF | Euclid Vector | Dead poisoned enemies: 25% poison spread |
| `mirror_kill_protocol` | Mirror Kill Protocol | 8 PF | Assassin Clone | Clone expiry: shadow slash; 3+ hits refunds 20 mana |

### Arena / NULL BREACH Relics (3)

| ID | Name | Cost | Req | Effect |
|----|------|------|-----|--------|
| `breach_crown` | Breach Crown | 7 PF | Arena cleared | +0.5 Pulse Damage rest of run (no Eden Core rescue) |
| `second_signal_debt` | Second Signal Debt | 5 PF | Arena rescue used | Eden Core rescue grants 6s protective shield |
| `elite_signal_core` | Elite Signal Core | 6 PF | 3+ boss kills | Bonus score at arena completion |

---

## 3. Grid Upgrades

### Core Upgrades (11 slots, 5/5 MAX each)

| Name | Key | Max | Effect/Level | Cost Curve |
|------|-----|-----|-------------|------------|
| Max HP | `maxHp` | 5 | +10 HP | 25/50/90/140/220 |
| Move Speed | `moveSpeed` | 5 | +5% speed | 25/50/90/140/220 |
| Core Magnet | `coreMagnet` | 5 | +10% pickup radius | 25/50/90/140/220 |
| Nexus Capacity | `coreCapacity` | 3 | +1 charge | 35/90/180 |
| Pulse Damage | `pulseDamage` | 5 | +1 proj damage | 25/50/90/140/220 |
| Firewall | `firewall` | 5 | -5% decay | 25/50/90/140/220 |
| Combat Calibration | `combatCalibration` | 5 | +0.5 shot damage | 25/50/90/140/220 |
| Armor Plating | `armorPlating` | 5 | -3% contact damage | 25/50/90/140/220 |
| Mana Capacitor | `manaCapacitor` | 5 | +10 max mana | 25/50/90/140/220 |
| XP Uplink | `xpUplink` | 5 | +5% XP gain | 25/50/90/140/220 |
| Cache Scanner | `cacheScanner` | 5 | +5% Endless bonus | 25/50/90/140/220 |

### Weapon Synergies (7 slots, 5/5 MAX each, 1000 Grid Cores/star)

| Name | Character | Max | Effect |
|------|-----------|-----|--------|
| Storm Conductor | Skeleton Warrior | 5 | +mark duration & burst damage |
| Furnace Chains | Cyber Arm Hero | 5 | +burn duration & bonus damage |
| Crescent Tide Combo | Taekwondo Girl | 5 | +splash radius & mana gain |
| Rift Rebound | Brawler Warrior | 5 | +rift burst radius & damage |
| Plasma Execution Loop | Assassin Clone | 5 | +execution damage & uptime |
| Toxic Geometry | Euclid Vector | 5 | +poison tick & mark duration |
| Cataclysm Chain Reaction | Oni Cataclysm | 5 | Locked until Oni unlocked |

### Protocol Cards (13 total, purchased with Protocol Fragments)

| Name | Category | Cost | Effect |
|------|----------|------|--------|
| Elite Arsenal | ENEMY | 2 PF | Elites gain stronger projectile pressure |
| Blood Path | ENEMY | 3 PF | Boss corruption trails hit harder |
| Predator Aim | ENEMY | 2 PF | Enemy aim improves (still dodgeable) |
| Armored Swarm | ENEMY | 2 PF | Endless HP scaling tougher |
| Lightning Storm+ | WEATHER | 2 PF | Longer lightning storms |
| Lava Rain+ | WEATHER | 2 PF | Longer lava rain |
| Airstrike+ | WEATHER | 2 PF | Larger airstrike salvo |
| Frozen Sleet Storm | WEATHER | 2 PF | COMING SOON |
| Elemental Mastery | PLAYER | 3 PF | Stronger elemental bursts (boss-capped) |
| Fusion Mastery | PLAYER | 4 PF | Stronger fusion damage & radius |
| Ult Infusion Mastery | PLAYER | 4 PF | Bigger Forbidden Ultimate nova |
| Character Synergy Mastery | PLAYER | 3 PF | Stronger synergy bursts |
| Phoenix Revival Protocol | PLAYER | 5 PF | +1 Phoenix revive per run |

---

## 4. Evolution Recipes (4 Fusions)

| # | Evolved Weapon | Ingredient A | Ingredient B | Element | Behavior | Dmg | CD | AoE Radius |
|---|----------------|-------------|-------------|---------|----------|-----|-----|-----------|
| 1 | **Storm Conductor** | Storm Saber | Magnetic Arc | Electric | CIRCLE_360 | 65 | 3.0s | 200 |
| 2 | **Plasma Execution Loop** | Shadow Toxic | Nexus Chakram | Fire | EXPANDING_SPIRAL | 55 | 2.5s | 170 |
| 3 | **Cataclysm Chain Reaction** | Cataclysm Pulse | Gas Needle | Fire | SEQUENTIAL_GROUND | 80 | 4.0s | 220 |
| 4 | **Frozen Eden / Glitch Vortex** | Spirit Crescent | Glitch Tear | Void | PULL_EXPLODE | 50 | 3.5s | 140 |

All fusions require both ingredients at Level 5. All have piercing: 99.

---

## 5. Achievements & Card Rewards (12/12)

| Achievement | Condition | PF | Protocol Reward | Card Drop | Card Max |
|-------------|-----------|-----|----------------|-----------|---------|
| First Endless Run | Finish 1 run | 1 | Endless Initiate (+5% XP) | Endless Spark (+8% XP/lvl) | 3 |
| Endless Survivor | Survive 15:00 | 2 | Survivor Core (+5% HP) | Survivor Plating (+8% HP/lvl) | 3 |
| Grid Legend | Survive 20:00 | 2 | Grid Stabilizer (-50% decay) | Grid Stabilizer (-5% decay/lvl) | 2 |
| Level Breaker | Reach Lv30 | 3 | Weapon Evolution (mastery) | Evolution Algorithm (odds/lvl) | 2 |
| Score Hunter | 50,000 score | 2 | Damage Uplink (+5% dmg) | Damage Uplink (+6% dmg/lvl) | 3 |
| Combo Master | Combo x100 | 3 | Combo Surge (+5%/+8%) | Combo Overdrive (high combo/lvl) | 2 |
| Core Defender | 25 cores | 1 | Nexus Defender (+1 cap) | Core Magnetizer (+1 cap/lvl) | 2 |
| Endless Titan | Survive 25:00 | 1 | Titan Reactor (+10% fire rate) | Overclocked Core (+20% FR/lvl) | 2 |
| Score Legend | 150,000 score | 1 | Titan Plating (+10% HP) | Titan Plating (+60 HP/lvl) | 2 |
| Level Ascendant | Reach Lv45 | 1 | Nexus Capacitor (+15% mana) | Nexus Capacitor (+40 mana/lvl) | 2 |
| Combo God | Combo x250 | 1 | Hyper Mobility (+8% speed) | Hyper Mobility (+12% speed/lvl) | 2 |
| Core Warden | 60 cores | 1 | Core Hoarder (+1 cap) | Core Hoarder (+2 cap, 1 pick) | 1 |

**Total obtainable PF: 19**

---

## 6. Boss Echo Archive (6 Echoes)

| # | Boss | Color | Passive Bonus | Lore |
|---|------|-------|---------------|------|
| 1 | Cyber Serpent | #ff7733 | +0.2 Shot Damage | Flame path remembered. |
| 2 | Cyber Dragon | #00ccff | +2% Fire Rate | Cryo memory stabilized. |
| 3 | Double Demons | #ff2d95 | +2% Fire Rate | Twin corruption recorded. |
| 4 | Titan | #a855f7 | +3% Max HP | Heavy impact pattern stored. |
| 5 | Bloodfang | #ef4444 | +2% Move Speed | Predator signal contained. |
| 6 | Annihilator | #fbbf24 | +0.2 Shot Damage | Termination protocol indexed. |

Echoes are one-time permanent unlocks via `MetaProgress.recordBossEcho(id)`. Repeat kills do not stack.

---

## 7. Chaos Laws (6 Laws)

| # | Law | Color | Modifier | Status |
|---|-----|-------|----------|--------|
| 1 | Blood Grid | #ef4444 | Score x1.10, Enemy Speed x1.07 | **ACTIVE/ONLINE** (Eden Memory ≥ 50%) |
| 2 | Frozen Eden | #00ccff | XP x1.10 | DETECTED / Preview Only |
| 3 | Serpent Law | #ff7733 | (planned, not wired) | DETECTED / Preview Only |
| 4 | Dragon Law | #a855f7 | (planned, not wired) | DETECTED / Preview Only |
| 5 | No Mercy Protocol | #fbbf24 | Score x1.15, Boss HP x1.10 | DETECTED / Preview Only |
| 6 | Broken Signal | #ff2d95 | (planned, not wired) | DETECTED / Preview Only |

Only Blood Grid, Frozen Eden, and No Mercy Protocol have implemented gameplay modifiers. Section is LOCKED when Eden Memory < 50%.

---

## SECTIONS 2-4: IMPLEMENTATION VERIFICATION

### Section 2: Card Pool Gating — VERIFIED COMPLETE

| Rule | Function | Status |
|------|----------|--------|
| Basic upgrades (Lv2-5): only for equipped weapons | `_buildWeaponCard()` line 8463 | **ACTIVE** |
| New weapon cards: 25% chance, only if slot free (max 3) | `_injectWeaponCard()` line 8452 + `MAX_SLOTS=3` line 8469 | **ACTIVE** |
| Evolution cards: only when both ingredients at Lv5 | `_buildEvolutionCard()` line 8537 + `checkAllEvolutionsReady()` | **ACTIVE** |

### Section 3: Blender Transparency & Arcade Scaling — VERIFIED COMPLETE

| Feature | Implementation | Status |
|---------|---------------|--------|
| Weapon sprite transparency | All 15 weapon PNGs have clean alpha (verified via Pillow) | **DONE** |
| Arcade scaling 1.5x-2.5x | `_spawnWeaponVFX()` uses scale 2.5 (evolution) / 1.5 (auto-fire) | **ACTIVE** |
| Enemy weapon sprite rendering | Glow halo (0.35α, 1.4x) + sharp sprite (0.94α, 1.0x), additive blend | **ACTIVE** |
| Enemy weapon mapping | PRIMARY_WEAPON_MAP (11 enemies) + BOSS_WEAPON_MAP (7 bosses) + MINI_WEAPON_MAP (10 minis) | **ACTIVE** |
| Tier-based sizing | Boss ≥40px, Mech ≥30px, Drone ≥22px | **ACTIVE** |

### Section 4: Gamepad API for Evolution Matrix — VERIFIED COMPLETE

| Feature | Implementation | Status |
|---------|---------------|--------|
| D-pad/Analog navigation | `main.js` lines 456-471 bridge pad→keyboard events | **ACTIVE** |
| Button 0 (Cross/A) tooltip toggle | Dispatches `Enter` → Matrix handles at line 4196 | **ACTIVE** |
| Button 1 (Circle/B) back to hub | Dispatches `Escape` → Matrix handles at line 4215 | **ACTIVE** |
| Focus indicator | `_evoMatrixFocusIdx` with neon pulsing border | **ACTIVE** |

**Note:** Gamepad support works via keyboard event bridge (indirect) — no dedicated Gamepad API polling inside the matrix overlay. Functionally equivalent.

---

*Report generated by Multi-Agent Development Cluster — 4 parallel agents*
*Source files: Game.js, WeaponCatalog.js, EnemyWeaponCatalog.js, MetaProgress.js, Player.js, Enemy.js*
