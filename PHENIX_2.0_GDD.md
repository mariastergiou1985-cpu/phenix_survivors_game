# PHENIX: NULL EDEN 2.0
## Game Design Document — Full Architecture Blueprint
### Version 1.0 | July 2026 | CONFIDENTIAL

---

> *"The city doesn't sleep. It glitches."*

---

## TABLE OF CONTENTS

1. [Current Game Analysis](#1-current-game-analysis)
2. [Character Design](#2-character-design)
3. [Weapon System V2](#3-weapon-system-v2)
4. [Element System](#4-element-system)
5. [Synergy System](#5-synergy-system)
6. [Relic System](#6-relic-system)
7. [Map System](#7-map-system)
8. [Enemy Design](#8-enemy-design)
9. [Progression](#9-progression)
10. [Visual Direction](#10-visual-direction)
11. [Implementation Roadmap](#11-implementation-roadmap)

---

## 1. CURRENT GAME ANALYSIS

### 1.1 Overview

PHENIX: NULL EDEN 1.x is an HTML5 Canvas cyberpunk survivor roguelite. The player selects a character, survives waves of escalating enemies, collects upgrades, and unlocks meta-progression rewards. The game runs fully client-side on GitHub Pages with controller and mobile support.

---

### 1.2 Strengths

**Identity**
- Strong, original cyberpunk aesthetic that does not copy generic pixel-art or neon clones
- Distinct color language per element (ice = cyan, fire = orange-red, electric = yellow-white, void = purple-black)
- Premium VFX work — the EMP shockwave, Digital Singularity, and dragon boss effects are standout moments
- The name "PHENIX: NULL EDEN" carries thematic weight and mystery

**Architecture**
- Fully self-contained HTML5 — no server required, playable anywhere
- ES module system is clean and extensible
- MetaProgress persistence layer is solid (local save, backfill support)
- Cache-bust chain allows hot-deployment without player confusion
- Controller and mobile support already baked in

**Gameplay Feel**
- Auto-attack survivor loop is satisfying at its core
- Chaos Mode adds genuine replayability pressure and visual drama
- Boss encounters (Cyber Dragon, Cyber Serpent) have distinct identity
- Upgrade choice moments feel meaningful when synergies click
- Endless Mode provides a skill ceiling for dedicated players

**Progression**
- Meta unlock system (characters, outfits, relics) gives meaningful long-term goals
- Chaos Survival Rank gives prestige to high-skill play
- PF (Phoenix Fragments) economy creates a steady drip of reward

---

### 1.3 Weaknesses

**Repetition**
- Wave structure feels sameness after 5–7 minutes; enemies mostly differ by stat scaling
- The upgrade pool can become predictable; experienced players always converge on the same builds
- Map is a single infinite flat plane — no terrain variation, no environmental storytelling
- Most weapons are geometric shapes (circles, squares, lines); few have real silhouette identity
- Enemy movement patterns are almost universally "walk toward player"

**Depth Gaps**
- Element system exists but doesn't deeply change how individual runs feel
- Relics currently skew toward flat stat bonuses rather than mechanical pivots
- Character uniqueness is too thin — most feel like stat variants of each other
- No tension or dynamic between weapon choices (you always want all weapons)
- No map objectives, treasure rooms, or world events to break the monotony loop

**Technical Debt**
- Game.js is a monolith (~850KB) making targeted changes risky (truncation bugs have proven this)
- Cache-bust chain is manual and fragile — multiple fixes were needed due to stale browser caches
- No test coverage for game logic
- Many utility scripts and fix files have accumulated in the repo root

**Onboarding**
- No in-game tutorial; new players face confusing character selection
- Phasewalker is locked but visible, which creates confusion
- Upgrade descriptions are functional but not exciting — they read like patch notes

---

### 1.4 Repetitive Systems Worth Replacing

| System | Problem | Replacement Direction |
|---|---|---|
| Flat endless map | Zero environmental variety | Chunk-based streaming biomes |
| Stat-only relics | No mechanical impact | Gameplay-pivot relics |
| Uniform enemy movement | Predictable patterns | Archetype-based AI behaviors |
| Single upgrade tier | No build evolution | Tiered weapon evolution paths |
| Manual cache-bust | Error-prone | Automated build hash injection |
| Flat wave spawning | No pacing drama | Weighted event scripting |

---

### 1.5 Systems Worth Keeping

- **Auto-attack core loop** — accessible, satisfying, proven
- **MetaProgress persistence** — solid, already handles old-save backfill
- **Element color language** — the foundation is right, needs expansion
- **Character roster** — all 8 characters have a conceptual niche worth building on
- **Chaos Mode** — the overlay darkness + chaos laws system is genuinely unique
- **Boss arena fights** — Cyber Dragon and Cyber Serpent are worth evolving, not replacing
- **PF economy** — the unlock currency loop works; just needs more things to buy
- **Protocol Cards** — underused but the framework is correct
- **Controller + mobile support** — a major competitive advantage; must be preserved

---

## 2. CHARACTER DESIGN

### Design Philosophy

Every character in PHENIX 2.0 must answer three questions:
1. **What is their combat fantasy?** (the feeling they sell)
2. **What do they change about how you play?** (mechanical uniqueness)
3. **What is their narrative role in NULL EDEN?** (world identity)

Characters are not stat presets. They are **gameplay lenses** — each one makes the same weapon feel different and makes the player approach threats differently.

---

### 2.1 ASSASSIN

**Role:** High-risk single-target executioner  
**Combat Fantasy:** Threading through crowds to detonate one perfect kill  
**Narrative:** A ghost-protocol runner who sells corporate kills to the highest bidder. Her body is 40% synthetic, 60% scar tissue.

**Passive — Ghost Protocol**
After standing still for 0.8 seconds, the Assassin enters a partial cloak state. Her outlines shimmer. The next attack she lands during cloaked state deals 180% damage and applies *Mark*. Marked enemies take +30% damage from all sources for 4 seconds. Moving breaks the cloak instantly.

**Ultimate — Zero Trace**
The Assassin dashes to the single highest-HP visible enemy, phases through all other enemies during the dash (no collision), and delivers a precision strike dealing 600% weapon damage. If the target dies from this strike, all nearby enemies are briefly stunned by the sonic impact and drop bonus PF fragments.

**Preferred Weapons:** Projectile (piercing), Beam, Melee — anything that rewards precision over AoE spam  
**Preferred Elements:** Void (invisibility extension), Electric (chain to marked target)

**Strengths:**
- Enormous single-target damage ceiling
- Best-in-class elite and boss clearing speed
- Cloak creates unique moment-to-moment tension

**Weaknesses:**
- Struggles against dense swarms — the crowd control gap is real
- Requires active positioning; passive play is penalized
- Cloak has a long stand-still requirement that punishes mobile builds

**Unique Mechanic — Mark System**
*Mark* is a debuff status exclusive to Assassin. Multiple sources can refresh its duration. The visual is a glowing sigil above the enemy's head. Synergies that interact with *Mark* are flagged in the upgrade pool to make them more discoverable.

---

### 2.2 TECHNO

**Role:** Gadget-based area controller  
**Combat Fantasy:** Turning the battlefield into a machine — drones orbiting, systems triggering each other  
**Narrative:** A former EDEN Corp engineer who wired herself into her own weapons. She thinks in systems, not emotions.

**Passive — Feedback Loop**
Every 10 seconds, Techno automatically uploads an upgrade to all active drones and gadgets currently deployed. The upload gives them +15% damage and +10% fire rate for 8 seconds, stacking if she has multiple drone-type weapons. Visual: a brief data-stream pulse from Techno's body outward to each drone.

**Ultimate — Digital Dominion**
Deploys a network node at Techno's position for 6 seconds. All projectiles and drones within the node's radius (400px) are redirected toward the nearest enemy regardless of their original trajectory. The node itself deals electric damage to enemies that pass through it. A second cast while the node is active overloads it, triggering a burst nova.

**Preferred Weapons:** Drone, Orbit, Special — anything that rewards uptime over burst  
**Preferred Elements:** Electric (chains between gadgets), Void (stealth gadgets enemies ignore until triggered)

**Strengths:**
- Exceptional map coverage and passive kill count
- Very forgiving — doesn't require active positioning for damage
- Scales extremely well into late Endless mode

**Weaknesses:**
- Slow to ramp; first 2 minutes feel weak
- Drones must be managed carefully in Chaos Mode (darker visibility)
- Bosses resist drone-sourced damage more than direct-hit weapons

**Unique Mechanic — Gadget Uptime Meter**
Techno has a secondary bar showing total active gadget coverage. Above 80%, she gains a passive 10% fire rate bonus. This encourages players to invest in drone count and duration, not just raw damage.

---

### 2.3 BRAWLER (Brawler Warrior)

**Role:** Frontline tank-dps hybrid  
**Combat Fantasy:** Wading into the center of a crowd and punching your way out  
**Narrative:** A street enforcer from the Null District who replaced both arms with industrial hydraulic crushers after losing them in a factory collapse. Doesn't talk much.

**Passive — Iron Momentum**
For every 3 seconds Brawler spends within 200px of at least 5 enemies, he gains a *Momentum Stack* (max 10). Each stack adds +5% damage and +2% damage reduction. Stacks reset to 0 if he exits enemy proximity for more than 2 seconds. At max stacks, his attacks emit a visible shockwave ring.

**Ultimate — Ground Zero**
Brawler slams both fists into the ground, creating a radial fissure burst (radius 600px). All enemies in the burst are knocked back and stunned for 1.5 seconds. The impact leaves a cracked-ground hazard zone for 5 seconds that slows enemies crossing it. Brawler gains 25% damage reduction for the duration of the stun window.

**Preferred Weapons:** Melee, Area, Mine — anything that benefits from being surrounded  
**Preferred Elements:** Magnetic (pulls enemies into point-blank range), Fire (AoE burn on dense clusters)

**Strengths:**
- Highest survivability in dense mob situations
- Benefits from being surrounded — the opposite of most characters
- Ground Zero is one of the most dramatic-feeling ultimates in the roster

**Weaknesses:**
- Very low ranged capability — relies on enemies coming to him
- Momentum stacks collapse instantly if a knockback pushes him away from mobs
- Boss fights are harder since bosses are typically singular targets

**Unique Mechanic — Fissure Terrain**
Ground Zero's cracked terrain is a persistent area object. Enemies that step on it take minor damage per tick AND have reduced movement speed. It interacts with elements: Electric fissures stun enemies crossing them; Fire fissures ignite; Ice fissures freeze movement entirely.

---

### 2.4 EYKLD

**Role:** Void mage — reality distortion specialist  
**Combat Fantasy:** Bending space so enemies destroy each other  
**Narrative:** An anomaly. EDEN Corp classified him as a "null event" — something that shouldn't exist. He doesn't age. He doesn't leave footprints. His origin file was deleted.

**Passive — Void Rift**
Eykld passively generates a slow-rotating void rift 180px from his position. The rift has a gravitational pull — enemies within 300px are gradually dragged toward it. Enemies that enter the rift core take void damage and are briefly disoriented (reversed movement controls). The rift repositions toward Eykld when he moves more than 400px from it.

**Ultimate — Null Collapse**
Eykld supercharges the void rift for 4 seconds. Its pull radius triples, its damage quintuples, and enemies caught inside are suspended mid-air (unable to attack). Upon expiry, the rift implodes, dealing massive void damage to all caught enemies. The implosion visual is a screen-wide lens distortion effect lasting 0.5 seconds.

**Preferred Weapons:** Orbit (gravity-enhanced), Area (void amplified), Homing (void-seeking)  
**Preferred Elements:** Void (all void effects doubled), Ice (frozen enemies have 3x pull sensitivity)

**Strengths:**
- Exceptional crowd manipulation — controls enemy positioning
- Void damage bypasses standard enemy resistance
- High ceiling in late Endless mode against wave density

**Weaknesses:**
- Very low direct damage output — relies on rift + weapons doing work together
- Against fast, highly mobile enemies, the rift can be ineffective
- Ultimate has a 4-second wind-up feel that creates vulnerability windows

**Unique Mechanic — Gravity Stack**
Enemies that spend 3+ seconds in the rift's pull radius gain a *Gravity Mark*. When a Gravity Marked enemy dies, it releases a micro-implosion that pulls nearby enemies toward the death point. This creates chain-reaction potential in dense waves.

---

### 2.5 ONI

**Role:** Rage melee berserker  
**Combat Fantasy:** The more enemies hit you, the more dangerous you become  
**Narrative:** The last enforcer of an extinct yakuza syndicate that crossed EDEN Corp. He survived the purge. He shouldn't have. He carries their debt in the form of a cursed oni-mask neural implant that amplifies aggression to superhuman levels.

**Passive — Blood Price**
Every time Oni takes damage, he gains *Rage* (1 stack per hit, max 30). Each Rage stack adds +3% attack speed and +2% life steal. At 30 stacks, he enters *Oni Frenzy* — his weapons glow red, he moves 25% faster, and all melee attacks release a blood-wave shockwave. Frenzy lasts 8 seconds. After Frenzy, stacks drop to 0.

**Ultimate — Oni Rend**
Oni performs a 5-hit combo sequence over 1.5 seconds, each hit covering a 280px arc in front of him. Each hit deals escalating damage (80%, 100%, 120%, 150%, 300% on the final). The final hit leaves a burning laceration field. If Oni is in Frenzy when he casts Rend, all hits deal double damage and the final hit guarantees a critical strike.

**Preferred Weapons:** Melee, Area — anything that triggers on hit for life steal  
**Preferred Elements:** Fire (burns synergize with blood wave), Magnetic (pulls enemies into melee range)

**Strengths:**
- Theoretically immortal under sustained fire — the more he gets hit, the stronger he gets
- Frenzy creates some of the most visually spectacular moments in the game
- Excellent solo boss performance when Frenzy is timed correctly

**Weaknesses:**
- Needs to take damage to function — but too much damage kills him before Frenzy triggers
- Against one-shot or high-damage enemies, the Rage mechanic is bypassed entirely
- Zero ranged capability without weapon investment

**Unique Mechanic — Rage Debt**
When Oni uses a healing item or passive life steal, his Rage stacks decrease proportionally. This creates a deliberate tension: healing keeps you alive but reduces offensive power. Players must decide when healing is worth the power loss.

---

### 2.6 CYBER ARM

**Role:** Mobile artillery — relocate, aim, devastate  
**Combat Fantasy:** Turning your prosthetic arm into a custom weapons platform  
**Narrative:** A former EDEN Corp soldier who lost her arm in a classified operation she was never supposed to survive. She salvaged the arm of an experimental military drone and attached it herself. EDEN Corp has a standing order to retrieve the arm. She's still attached to it.

**Passive — Calibration**
Cyber Arm's dominant weapon (the highest-damage weapon currently in the build) gains +40% damage but has a 0.5-second wind-up before firing. During the wind-up, a visible targeting reticle appears on the nearest enemy. If the enemy moves out of the reticle before firing, the shot is cancelled (no cooldown waste). Successful hits build a *Calibration Meter*.

**Ultimate — Overcharge Cannon**
Draws power from all other weapons for 3 seconds (they go offline). The arm cannon charges to maximum, then fires a singular beam that pierces every enemy on screen in a straight line, dealing 1000% weapon damage. The beam leaves a scorched channel on the terrain for 4 seconds. Second activation cancels the charge and fires at current charge level.

**Preferred Weapons:** Beam, Projectile (sniper-type), Special  
**Preferred Elements:** Electric (chain discharge off primary targets), Ice (freezes target at reticle for guaranteed hit)

**Strengths:**
- Highest single-hit damage ceiling in the entire roster
- Mobile and repositioning-friendly; doesn't need to stay in one place
- Calibration Meter rewards accuracy with escalating bonuses

**Weaknesses:**
- Wind-up on passive weapon means swarming enemies can interrupt constantly
- Overcharge Cannon offline period leaves her vulnerable
- Requires more active aim management than other characters on mobile

**Unique Mechanic — Calibration Meter**
When Calibration Meter fills (10 successful wind-up hits), Cyber Arm unlocks a *Perfect Lock* for 5 seconds. During Perfect Lock, the wind-up is instant and all shots auto-crit. This rewards sustained, accurate play.

---

### 2.7 SKELETON

**Role:** Summoner — death as a renewable resource  
**Combat Fantasy:** Building an undead army that does the killing for you  
**Narrative:** Not literally a skeleton. "Skeleton" is the street name for a EDEN Corp data-archaeologist who can reconstruct dead systems — and apparently, dead soldiers. She wears a white skull mask. Nobody's ever seen her face.

**Passive — Remnant**
Every enemy that dies within 400px of Skeleton has a 25% chance of leaving a *Soul Fragment* on the ground. Skeleton can collect Soul Fragments by walking over them (they do not auto-collect). Each Fragment charges her Summon Meter. At full charge, she automatically raises a *Wraith* — a skeletal warrior that fights for 12 seconds before dissipating.

**Ultimate — Army of Null**
Skeleton consumes all active Soul Fragments (regardless of distance, they fly to her). For each Fragment consumed, she raises one Wraith instantly. The Wraiths summoned by Null Army have 250% the stats of standard Wraiths and deal void damage. If 8+ Wraiths are active simultaneously, they merge into a single *Null Colossus* for 6 seconds.

**Preferred Weapons:** Summon, Orbit (orbiting bone shards), Area (death zones that generate Fragments)  
**Preferred Elements:** Void (Fragment chance doubled), Ice (Fragments freeze enemies who touch them before collection)

**Strengths:**
- Passive army generation makes her incredibly powerful in sustained waves
- Null Colossus is among the most visually spectacular events in the game
- Soul Fragment collection creates interesting spatial decision-making

**Weaknesses:**
- Fragment collection requires moving into dangerous areas — reckless collection can get her killed
- Very slow start — needs time to build army and Fragment economy
- Against fast-clearing scenarios (speed runs), Fragment generation can't keep up

**Unique Mechanic — Wraith Command**
Wraiths have a simple aggro priority system. By default they target the nearest enemy. When Skeleton fires a weapon at a specific target, nearby Wraiths redirect to that target for 3 seconds (*Focus Command*). This allows for intentional boss-targeting during Null Army moments.

---

### 2.8 PHASEWALKER (LOCKED)

**Role:** Dimensional infiltrator — time and space manipulation  
**Combat Fantasy:** Existing slightly outside of reality, striking from positions that shouldn't be possible  
**Narrative:** A classified EDEN Corp prototype. The project was cancelled after test subjects began phasing out of existence permanently. One subject came back. She shouldn't have been able to.

**Unlock Condition:** [To be determined — tied to Endless Mode secret achievement]

**Passive — Phase Slip**
Phasewalker exists in a fractional phase state. She takes 15% less damage from all non-boss sources (attacks partially pass through her). Every 8 seconds, she automatically performs a micro-phase — a 0.3-second teleport to a random safe position within 300px, leaving an afterimage that absorbs one incoming projectile.

**Ultimate — Dimensional Rift**
Phasewalker tears open a portal at her current position and simultaneously at a position 500px away. For 5 seconds, all her weapons fire FROM BOTH positions simultaneously. Enemies between the two portals take double damage from any weapon that crosses the rift line. At the end of 5 seconds, the portals implode toward each other, dealing massive area damage to anything caught between them.

**Preferred Weapons:** Projectile (fires from both portals), Beam (rift-line amplified), Homing (seeks across rift)  
**Preferred Elements:** Void (phase effects enhanced), Electric (portal discharge between endpoints)

**Strengths:**
- Highest damage ceiling in the game when Dimensional Rift is properly positioned
- Phase Slip provides excellent survivability against bullet-hell wave patterns
- Most visually dramatic character in the roster

**Weaknesses:**
- The least forgiving character — optimal play requires knowing enemy patterns well
- Dimensional Rift requires good spatial awareness to position portals
- Micro-phase randomness can occasionally teleport her INTO a dangerous position

**Unique Mechanic — Phase Resonance**
When Phasewalker's weapons fire from the portal endpoints, shots that successfully hit the same enemy from BOTH portals within 0.1 seconds trigger *Phase Resonance* — a small void implosion on that enemy. Skilled players who position portals to catch enemies in crossfire get significant damage bonuses.

---

## 3. WEAPON SYSTEM V2

### 3.1 Design Philosophy

Every weapon in PHENIX 2.0 must have:
1. **A distinct silhouette** — visible at a glance, not a colored circle
2. **An elemental affinity** — weapons respond differently to elements
3. **An evolution path** — each weapon can evolve into a premium form at upgrade tier 4
4. **A character affinity** — at least one character amplifies it uniquely
5. **A behavior, not just stats** — the weapon changes HOW combat feels

Weapons are separated into 10 categories. Each category has a mechanical identity, not just a damage delivery method.

---

### 3.2 PROJECTILE WEAPONS

**Definition:** Weapons that fire discrete projectiles from the player's position toward enemies.

**Mechanical Identity:** Highest potential single-target damage. Rewards position and timing. Defined by pierce, ricochet, and penetration behavior.

---

**VOID NEEDLE**
Fires a thin, hyper-velocity needle that pierces through all enemies in a straight line. The needle leaves a void trail for 0.5 seconds that deals additional tick damage to enemies who cross it.
*Silhouette:* A glowing acupuncture needle, impossibly thin and bright at the tip
*Element Affinity:* Void — trail becomes a 1-second gravity well
*Evolution — SINGULARITY LANCE:* Fires 3 needles in a tight spread; the center needle detonates at range, pulling nearby enemies into a burst

---

**CRYO BOLT**
Fires a slow-moving crystalline projectile that shatters on contact, sending 4 ice shards in an X pattern outward.
*Silhouette:* An angular ice crystal, visible facets catching light
*Element Affinity:* Ice — initial hit freezes target for 1 second before the shard detonation
*Evolution — FROST NOVA BOLT:* Shatters into 8 shards that freeze on contact and each leave frost trails

---

**SCATTERSHOT**
Fires a spread of 5 energy pellets that deal less individual damage but excel at hitting multiple clustered enemies.
*Silhouette:* A blunderbuss muzzle flash, the pellets visible as distinct dots
*Element Affinity:* Electric — each pellet that hits an enemy chains to the nearest adjacent enemy
*Evolution — STATIC STORM:* 8 pellets, each with chain-lightning on hit; chains can loop between close enemies

---

**RAIL SPIKE**
A railgun-style weapon with a 0.6-second charge before firing an ultra-high-damage spike that penetrates and stuns everything in its path.
*Silhouette:* A glowing magnetic rail between two prongs; the spike is a white-hot dart
*Element Affinity:* Magnetic — spike pulls hit enemies 100px toward player before stun
*Evolution — GRAVITY RAIL:* Fired spike becomes a gravitational line — all enemies within 150px of the path are pulled into it during the 0.3 second it persists

---

**PHANTOM BOLT**
A slow projectile that does moderate damage on hit — but also leaves a phantom echo 0.3 seconds behind it, meaning each bolt effectively hits twice (the echo deals 50% damage).
*Silhouette:* A semi-transparent double-exposure projectile with a slight blur ghost
*Element Affinity:* Void — phantom echo becomes a damaging clone that persists for 1.5 seconds
*Evolution — ECHO STORM:* Fires 2 bolts; each leaves 2 echoes; echoes from the same enemy converge into an implosion

---

### 3.3 HOMING WEAPONS

**Definition:** Weapons whose projectiles autonomously seek the nearest or designated target.

**Mechanical Identity:** Reliable damage with zero aim required. The cost is reduced damage vs. projectiles and longer travel time. Rewards investment in lock-on speed and target-switching behaviors.

---

**NEURAL SEEKER**
Fires a microscopic drone that homes to the nearest enemy, embeds itself, and deals sustained electric damage for 3 seconds before detonating.
*Silhouette:* A tiny insectoid drone with wings; visible wings beat as it flies
*Element Affinity:* Electric — embedded drone chains damage to nearby enemies
*Evolution — SWARM PROTOCOL:* Fires 3 seekers; embedded seekers share damage aggro, drawing enemy attention away from player

---

**HEAT SIREN**
A fire-elemental missile that homes toward the enemy with the most current HP. Deals extra damage to high-HP targets.
*Silhouette:* A sleek missile with a flame exhaust trail; it spirals slightly as it homes
*Element Affinity:* Fire — leaves a burning path in its flight trajectory
*Evolution — INFERNO SIREN:* Splits into 3 mini-sirens at 50% distance; each homes to a different target; area ignition on impact

---

**GHOST ROUND**
A homing bullet that phases through walls and terrain objects but deals reduced damage. Seeks the enemy with the lowest HP.
*Silhouette:* A semi-transparent bullet with a shifting outline; phasing effect as it moves
*Element Affinity:* Void — phasing effect applies to the player briefly after Ghost Round fires (0.2 second invulnerability)
*Evolution — SOUL HUNTER:* Ghost Round now phases through up to 3 enemies, damaging each, before detonating on the 4th

---

### 3.4 ORBIT WEAPONS

**Definition:** Weapons that rotate around the player, hitting enemies on contact or at defined intervals.

**Mechanical Identity:** Passive protection layer. They don't require aiming but their effectiveness depends on enemy proximity. Designed to reward positioning close to enemies while providing a shield-like function.

---

**VOID SHARD RING**
4 rotating shards of crystallized void energy orbit the player. On contact with an enemy, a shard bursts and is recreated after a 2-second cooldown.
*Silhouette:* Dark purple jagged crystal shards with inner void glow; clearly non-circular
*Element Affinity:* Void — burst creates a 0.5-second pull toward the player's position
*Evolution — VOID CONSTELLATION:* 6 shards; bursting a shard launches a seeking projectile at the nearest remaining enemy

---

**PLASMA CROWN**
3 plasma balls orbit at a larger radius. They explode on contact dealing AoE damage to nearby enemies, not just the one touched.
*Silhouette:* Irregular plasma blobs, pulsing and shifting shape; visually unstable
*Element Affinity:* Electric — explosions chain between nearby enemies
*Evolution — CORONA STORM:* 5 plasma balls; explosions create a 1-second electric field at detonation point

---

**BONE CAROUSEL**
6 bone fragments orbit rapidly, dealing moderate damage per hit. Skeleton character treats these as Summon-type (generates Soul Fragments on kills).
*Silhouette:* Stylized bone shards with void energy on the marrow; visibly rotating fast
*Element Affinity:* Void/Fire (dual affinity) — fire turns them into burning brands; void adds Soul Fragment chance
*Evolution — REQUIEM WHEEL:* 8 bones; bones that kill enemies temporarily orbit faster for 3 seconds (kill-speed feedback loop)

---

**GRAVITY LENS**
A single large orbit weapon — a distortion lens that slows time in a small area around it. Enemies passing through the lens zone move at 40% speed.
*Silhouette:* A circular lens with visible refraction lines; environment behind it appears warped
*Element Affinity:* Ice — slowed enemies become frozen on contact
*Evolution — CHRONOSPHERE:* Lens radius increases 2x; slowed enemies inside lens also have reduced attack speed

---

### 3.5 DRONE WEAPONS

**Definition:** Autonomous units deployed on the battlefield that operate independently of the player's position.

**Mechanical Identity:** Map coverage. Drones stay where deployed (or follow enemies). They extend the player's effective range beyond their direct vicinity. Strongest in corridor-type play. Techno character synergizes with all Drone weapons.

---

**SENTRY TURRET**
A stationary turret that fires at the nearest enemy within 350px. Lasts 12 seconds. Maximum 3 active.
*Silhouette:* A squat chrome tripod with a glowing barrel; distinctly mechanical, not organic
*Element Affinity:* Any — turret inherits the player's last applied element
*Evolution — SIEGE CANNON:* Sentry fires explosive rounds that deal AoE damage; slower fire rate but devastating to clusters

---

**STALKER DRONE**
A mobile drone that follows the nearest enemy and fires electric bursts at point-blank range. Aggressively chases.
*Silhouette:* A shark-finned micro-drone with visible propellers; it tilts aggressively toward targets
*Element Affinity:* Electric — bursts chain to adjacent enemies
*Evolution — APEX PREDATOR:* Stalker drone targets the highest-HP enemy; upon target death, drone self-destructs for bonus AoE

---

**REPAIR DRONE**
Not a damage dealer. A support drone that provides a continuous small healing tick to the player if they are within 200px of it. It also reduces slow and freeze effects on the player by 40%.
*Silhouette:* A white and teal medical cross drone with soft pulse light
*Element Affinity:* Ice — aura radius increases; also removes burn from the player
*Evolution — AEGIS DRONE:* Repair drone additionally absorbs 1 hit per 8 seconds (visible shield bubble)

---

**MINE LAYER**
Drone that drops proximity mines as it drifts slowly across the battlefield. Mines detonate when an enemy steps within 80px.
*Silhouette:* A flat disc drone trailing hexagonal mine tokens
*Element Affinity:* Fire — mines leave burning pools; Magnetic — mines pull enemies before detonating
*Evolution — CLUSTER BOMBER:* Each mine detonates and splits into 3 sub-mines; chain detonation possible

---

### 3.6 BEAM WEAPONS

**Definition:** Continuous energy beams that require maintaining angle/aim toward targets.

**Mechanical Identity:** Highest sustained DPS in the game but requires deliberate positioning. Beams are the "precision" weapon class. They punish movement but reward staying still and controlling enemy approach angles.

---

**NEURAL LANCE**
A continuous narrow beam of electric energy. Extremely high DPS but very thin — must be aimed directly at target.
*Silhouette:* A wire-thin electric line with crackling nodes; it visually arcs slightly
*Element Affinity:* Electric — beam forks to hit a second nearby enemy at 50% damage
*Evolution — BINARY LANCE:* Fires 2 parallel beams; enemies between the beams take bonus damage from field interference

---

**CRYO RAY**
A wide blue beam that does moderate damage but applies a stacking slow. At 5 stacks, the target is frozen.
*Silhouette:* A wide, slightly translucent beam with visible frost particles inside it
*Element Affinity:* Ice — frozen enemies take 2x damage from next hit
*Evolution — ABSOLUTE ZERO RAY:* Beam leaves a lingering ice crystal field at the beam's endpoint that persists for 2 seconds

---

**VOID TENDRIL**
A dark purple beam that deals moderate damage and drains enemy movement speed permanently for 3 seconds.
*Silhouette:* A writhing, organic-looking tentacle beam with void energy; it moves like a living thing
*Element Affinity:* Void — drained movement doesn't recover; it can stack to 0 (complete immobilization after 3 hits)
*Evolution — VOID LEASH:* Beam physically pulls the targeted enemy toward the player while draining

---

### 3.7 MELEE WEAPONS

**Definition:** Short-range weapons activated by the player's movement and proximity to enemies.

**Mechanical Identity:** Highest damage-per-swing in the game but requires being next to enemies. Rewards the player for getting into danger. Oni and Brawler synergize most heavily. Melee weapons have built-in life steal at base level.

---

**PLASMA BLADE**
A katana-length plasma edge that auto-swings every 0.8 seconds in the direction of movement. Deals high damage and ignites on crit.
*Silhouette:* A neon-edged katana with a slightly curved blade; the edge burns with plasma
*Element Affinity:* Fire — ignites on every hit (not just crit); burning enemies take extra damage from next swing
*Evolution — NOVA EDGE:* Swing releases a short-range plasma wave (150px) allowing damage without direct contact

---

**VOID FISTS**
Transforms the player's attacks into rapid null-matter punches in all four cardinal directions (a 4-directional melee). Very fast, very short range.
*Silhouette:* Knuckle-shaped void constructs that materialize at the instant of contact
*Element Affinity:* Void — hits create micro-implosions; third consecutive hit on same enemy detonates for bonus damage
*Evolution — NULL BARRAGE:* 8-directional; punches leave brief void echoes that persist for 0.3 seconds and damage enemies who walk into them

---

**SHOCK WHIP**
A long-range melee weapon (300px reach). Cracks in a random arc every 1.2 seconds, hitting all enemies in the arc.
*Silhouette:* A bright electric whip with visible energy coils mid-air
*Element Affinity:* Electric — whip crack chains electricity to all enemies within 100px of any hit enemy
*Evolution — STORM WHIP:* Three simultaneous cracks in a 180° spread; stuns hit enemies for 0.5 seconds

---

**MAGNETIC CLAYMORE**
A slow, wide-swinging heavy weapon. One swing per 2 seconds — but pulls all enemies within 200px toward the player before the swing connects.
*Silhouette:* A massive, visibly magnetic greatsword with ore fragments orbiting the blade
*Element Affinity:* Magnetic — pull radius increases to 350px; pulled enemies are briefly airborne (no dodge)
*Evolution — GRAVITY CLEAVE:* Swing creates a gravity line — enemies fly upward along the swing path

---

### 3.8 AREA WEAPONS

**Definition:** Weapons that create damage zones on the field rather than targeting specific enemies.

**Mechanical Identity:** Map control and zoning. Area weapons define where enemies cannot safely exist. Pairs beautifully with the coming Map System's terrain features.

---

**CYBER NOVA**
Periodically detonates a circular burst around the player (radius 280px). High damage, short range.
*Silhouette:* A hexagonal blast pattern (NOT a circle) with visible circuit-line crack patterns
*Element Affinity:* Electric — circuit cracks persist for 1 second and deal tick damage to enemies in them
*Evolution — OVERLOAD NOVA:* Hexagonal nova, detonates twice in 0.3-second succession; second nova has 40% larger radius

---

**TOXIC ZONE**
Places a persistent 200px-radius acid pool at the player's position that moves with them slowly. Enemies in the zone take continuous damage and have their healing/regen blocked.
*Silhouette:* A bubbling green-black acid pool with visible chemical fumes rising; floor texture dissolves
*Element Affinity:* Fire — acid ignites, dealing fire+acid hybrid damage; visually spectacular
*Evolution — NECROTIC FIELD:* Acid pool is stationary once placed; player can place up to 3; enemies killed in the pool drop no fragments but spawn a toxic wraith

---

**EMP SURGE**
Emits an EMP pulse every 4 seconds in a large radius (350px). Deals heavy electric damage and disables enemy projectiles for 1 second.
*Silhouette:* Visible electromagnetic rings radiating outward; enemies hit show circuitry disruption overlay
*Element Affinity:* Electric — disabled enemies take +50% electric damage during the 1 second
*Evolution — BLACKOUT SURGE:* Pulse radius 500px; disabled enemies also cannot move; affected enemies glow with static interference

---

### 3.9 MINE WEAPONS

**Definition:** Placed explosives that detonate on proximity or timer. Player places them; player does not aim them.

**Mechanical Identity:** Trap-setting and area denial. The most strategic weapon class. Rewards players who understand enemy pathing and can set up kill zones.

---

**VOID TRAP**
Places an invisible mine that detonates with a void implosion when an enemy steps within 60px. Deals massive damage to the target and pulls nearby enemies in before exploding.
*Silhouette:* Invisible when placed — only a faint void shimmer on the ground hints at location. Detonation is a void implosion sphere.
*Element Affinity:* Void — mine is completely invisible even to the player (maximum strategy requirement)
*Evolution — VOID CLUSTER:* Places 3 linked mines; first detonation chain-detonates all three in sequence

---

**CRYO TRAP**
A visible mine that freezes all enemies within 150px for 2 seconds on detonation.
*Silhouette:* A small crystal spike embedded in the ground; it grows as enemies approach
*Element Affinity:* Ice — freeze lasts 4 seconds; frozen enemies shatter for bonus damage if hit with melee during freeze
*Evolution — PERMAFROST TRAP:* Leaves a permanent ice patch after detonation (60 seconds); enemies slow by 70% on the patch

---

**PLASMA MINE**
A classic explosive mine. High direct damage, AoE splash. Can chain-detonate if placed close to other Plasma Mines.
*Silhouette:* An angular red hexagonal plate with a visible pressure sensor in the center
*Element Affinity:* Fire — splash ignites all hit enemies; chain detonations add additional fire burst
*Evolution — MINEFIELD PROTOCOL:* Automatically deploys a ring of 5 Plasma Mines around the player every 8 seconds; press Ultimate to detonate all simultaneously

---

### 3.10 SUMMON WEAPONS

**Definition:** Weapons that create allied entities that fight alongside the player.

**Mechanical Identity:** Army-building. Summoned entities draw aggro and provide persistent damage sources. Skeleton character receives massive bonuses to all Summon weapons. Summons count toward active unit caps.

---

**WRAITH LANCE**
Summons a spectral warrior that charges into groups of enemies, dealing moderate damage per pass, then dissipates after 8 seconds.
*Silhouette:* A ghostly armored figure made of void energy; it runs on all fours like a predator
*Element Affinity:* Void — wraith passes through enemies (no knockback from obstacles); leaves void trail
*Evolution — WRAITH TIDE:* Summons 3 wraiths simultaneously; they coordinate attacks, converging on the same target

---

**NANO SWARM**
Summons a cloud of 20 nanobots that autonomously seek and attack enemies, dealing small but rapid damage and applying poison.
*Silhouette:* A visible swirling cloud of microscopic hexagonal machines; the cloud shifts shape
*Element Affinity:* Toxic — nanobots inject a lethal toxin; poisoned enemies die at 30% HP threshold
*Evolution — PLAGUE SWARM:* 40 nanobots; dead nanobots explode for AoE damage; self-replicates on enemy kills

---

**CYBER WOLF**
Summons a mechanical wolf that charges at the nearest enemy and latches on, dealing sustained damage for 5 seconds. One wolf active at a time.
*Silhouette:* A skeletal chrome wolf with neon wire muscles; distinctly mechanical anatomy
*Element Affinity:* Electric — wolf's latch deals electric bursts every 0.5 seconds; electric arcs visible between wolf and target
*Evolution — APEX PACK:* 3 wolves simultaneously, each targets a different enemy; kills grant a temporary 4th wolf

---

### 3.11 SPECIAL WEAPONS

**Definition:** Weapons that don't fit other categories — unique mechanics that break conventional combat patterns.

---

**PHASE MIRROR**
Creates a spectral copy of the player that mimics their movement inversely (moves the opposite direction) for 5 seconds. The copy deals 60% of the player's weapon damage.
*Silhouette:* A glowing transparent player silhouette moving in geometric opposition
*Element Affinity:* Void — copy is invisible to enemies; they don't aggro on it
*Evolution — DUAL PHASE:* Two copies, one mirroring horizontally, one vertically; all three fire simultaneously

---

**GRAVITY ANCHOR**
Places a stationary gravity point that pulls all enemies within 400px toward it for 5 seconds. Doesn't deal damage — exists purely for setup.
*Silhouette:* A black sphere with visible distortion rings; ground cracks toward it
*Element Affinity:* Magnetic — pull is 2x stronger; enemies hit by magnetic pull also drop armor
*Evolution — EVENT HORIZON:* Anchor lasts 8 seconds; enemies at the center take crushing damage; cannot escape once within 80px

---

**DATA SPIKE**
Injects a virus into one enemy. The infected enemy's attack is turned against its allies — it begins damaging nearby enemies while debuffed.
*Silhouette:* An injection beam with a visible data-packet at its tip; hit enemy shows corrupted code overlay
*Element Affinity:* Electric — infected enemy also has a 50% chance to pass virus on death to the enemy it last attacked
*Evolution — VIRAL PAYLOAD:* Spike infects up to 3 enemies simultaneously; infected enemies deal 150% of their damage to allies

---

## 4. ELEMENT SYSTEM

### 4.1 Design Philosophy

Elements in PHENIX 2.0 are not just visual skins on damage numbers. Each element fundamentally changes the *verbs* of combat — how you interact with enemies, the field, and your weapons.

Elements are applied to weapons through pickups, relics, or character passives. An elemental weapon fires/deals its element on every hit. Multiple elements on the same weapon create **Hybrid Effects** (see section 5).

---

### 4.2 FIRE 🔥

**Core Verb:** Ignite. Burn. Chain.

**Gameplay Effect:**
- Enemies hit by fire weapons are **Ignited** for 3 seconds, taking 15% of the initial hit per second
- Ignited enemies glow with orange-red aura
- If 3 or more Ignited enemies are within 120px of each other, they **Chain Ignite** — fire spreads to all nearby enemies not yet burning
- Fire deals 50% bonus damage to enemies with ice-type armor or frost debuffs
- Fire evaporates Cryo Trap ice patches on contact (tactical destruction)

**Environmental Interaction:**
Fire weapons can ignite certain terrain elements in 2.0 — oil puddles (from specific enemies), data cables on the ground, and explosive barrels become hazards. A burning field is dangerous for the player as well if they move through it.

**Weakness:** Electric-type enemies are 50% resistant to fire. Fire debuffs can be cleansed by ice hits.

**Visual Language:** Orange-red flames with visible ember particles. Burning enemies have a heat distortion effect around them.

---

### 4.3 ICE ❄️

**Core Verb:** Slow. Freeze. Shatter.

**Gameplay Effect:**
- Enemies hit by ice take a **Chill** stack (max 5). Each stack slows movement by 8%
- At 5 Chill stacks: **Freeze** — enemy is immobilized for 2 seconds, takes 0 damage during this time but is vulnerable to **Shatter**
- Shattering a frozen enemy (with melee, explosive, or high-damage hit) deals 300% bonus damage and creates ice shards that deal area damage
- Ice weapons can freeze projectiles mid-air, creating temporary barriers

**Environmental Interaction:**
Ice creates persistent frost patches on terrain. Enemies entering frost patches gain Chill stacks. Frost patches from Cryo Traps are permanent until Fire destroys them.

**Weakness:** Fire ignores Chill stacks and deals bonus damage to frozen enemies. Ice has no effect on magma-type enemies.

**Visual Language:** Cyan and white crystalline overlays. Frozen enemies are encased in visible ice crystal geometry.

---

### 4.4 ELECTRIC ⚡

**Core Verb:** Chain. Disable. Amplify.

**Gameplay Effect:**
- Enemies hit by electric weapons receive a **Static** debuff for 2 seconds
- If a Static enemy is hit again within 2 seconds by ANY weapon, the hit releases a **Chain Bolt** that arcs to the 2 nearest enemies within 200px
- Chaining prioritizes enemies who are also Ignited or Chilled (cross-element combo potential)
- Electric has the ability to **Disable** enemy active abilities (boss attacks, elite special moves) for 1 second

**Environmental Interaction:**
Water puddles (from enemies, environment) become electrified by electric attacks, shocking all enemies in the puddle simultaneously.

**Weakness:** Electric does 0 damage to properly grounded or insulated enemies. Is 150% effective against drone-type enemies and mechanical bosses.

**Visual Language:** Yellow-white arcs with blue core. Chaining bolts are visually distinct from fire — they're angular and geometric (not organic).

---

### 4.5 VOID 🌑

**Core Verb:** Pull. Phase. Erase.

**Gameplay Effect:**
- Void attacks apply **Entropy** stacks. At 3 stacks, the enemy is **Phase-Locked** — they become partially transparent and take 50% extra damage from all sources for 3 seconds
- Void attacks can **Phase-Pierce**: bullets pass through Phase-Locked enemies and hit enemies behind them
- The **Erase** mechanic: if an enemy is killed while Phase-Locked, they leave no corpse and no sound — they simply cease to exist. This is mechanically significant because corpse explosion enemies (future archetype) can't trigger their ability
- Void energy creates brief local gravity — the small pull near each void impact affects enemy pathing

**Environmental Interaction:**
Void attacks can destroy specific terrain objects (corrupted data nodes, void cysts) that other elements cannot. Areas hit repeatedly by void energy become **Null Zones** — temporary patches of terrain where enemy movement is severely impaired.

**Weakness:** Void deals 50% damage to enemies with phase-resistant armor. Has no effect on already-phased entities.

**Visual Language:** Deep purple-black with inner white glow. Phase-Locked enemies shimmer between visibility states. Void impacts leave momentary after-images of the hit geometry.

---

### 4.6 MAGNETIC 🧲

**Core Verb:** Pull. Group. Amplify contact damage.

**Gameplay Effect:**
- Magnetic weapons don't deal direct damage — instead they apply a **Pull Field** around the hit enemy
- All enemies within 250px of a Pull-Field enemy are drawn toward that enemy, clustering them
- The clustered group then takes amplified damage from the player's other weapons (+40% damage to clustered enemies)
- Magnetic also allows weapons to **Arc**: projectiles that narrowly miss enemies are pulled into them if within 50px

**Environmental Interaction:**
Metallic terrain objects (pipes, server racks) can be magnetized, creating walls that deflect enemies or pull them off course.

**Weakness:** Organic enemies (flesh-type) have reduced pull sensitivity. Boss-type enemies are immune to Pull Field.

**Visual Language:** Visible magnetic field lines between pulled enemies. A distinctive iron-filing aesthetic with visible force arrows.

---

### 4.7 TOXIC ☠️

**Core Verb:** Infect. Multiply. Sustain.

**Gameplay Effect:**
- Toxic weapons apply **Infection** that deals damage over 8 seconds (longer than Fire's burn)
- Infected enemies have a 30% chance to **Spread** infection to any enemy they contact
- Infection bypasses armor — it's one of the few damage types that works on fully armored enemies
- Killing an Infected enemy creates a **Toxic Cloud** that infects any enemy passing through it for 3 seconds

**Environmental Interaction:**
Toxic clouds persist on terrain and stack with each kill. In dense wave scenarios, a battlefield becomes progressively more poisoned. Player has mild toxic resistance; they take minor damage from standing in large toxic clouds.

**Weakness:** Toxic damage cannot crit. The 30% spread chance is RNG-dependent, making it unreliable against fast-moving, spread-out enemies.

**Visual Language:** Sickly green-black with bubble particles. Infected enemies have a crawling-vein animation on their body. Toxic clouds are dense and visually opaque.

---

## 5. SYNERGY SYSTEM

### 5.1 Design Philosophy

Synergies in PHENIX 2.0 are divided into tiers based on difficulty to achieve and payoff:

- **Tier 1 (Passive Synergies):** Two items naturally working well together — no activation required
- **Tier 2 (Active Synergies):** A combination that creates a new behavior when both conditions are met
- **Tier 3 (Evolved Synergies):** A combination that transforms one or both weapons into a new form

Synergies are surfaced to the player via a dedicated **Synergy Log** in the upgrade screen — newly discovered combinations are highlighted.

---

### 5.2 WEAPON + ELEMENT SYNERGIES

| Weapon | Element | Synergy Name | Effect |
|---|---|---|---|
| Void Needle | Void | Null Lance | Needles become invisible in flight; targets don't react until hit |
| Cryo Bolt | Ice | Absolute Shard | Each shard applies 2 Chill stacks instead of 1; shatter radius tripled |
| Shock Whip | Electric | Static Coil | Each whip crack creates a 0.5s electric field at the endpoint |
| Plasma Blade | Fire | Inferno Edge | Every kill with Plasma Blade ignites all enemies within 150px |
| Nano Swarm | Toxic | Plague Protocol | Dead nanobots infect enemies near the corpse |
| Rail Spike | Magnetic | Gauss Driver | Rail Spike gains a 200px magnetic pre-pull before each shot |
| Void Trap | Void | Shadow Minefield | Void Traps become completely invisible even on detonation |
| Ghost Round | Void | Phantom Pierce | Ghost Round can hit the same enemy multiple times by re-entering from behind |

---

### 5.3 WEAPON + WEAPON SYNERGIES

| Weapon A | Weapon B | Synergy Name | Effect |
|---|---|---|---|
| Gravity Anchor | Any Projectile | Gravity Well | Projectiles gain 50% extra range when fired toward the Anchor point |
| Cryo Bolt | Plasma Blade | Ice Forge | Enemies frozen by Cryo Bolt are shattered in one Plasma Blade hit |
| Data Spike | Neural Seeker | Viral Drone | Infected enemies are also targeted by all active Seekers simultaneously |
| Mine Layer | EMP Surge | Proximity Overload | EMP Surge detonates all nearby mines simultaneously; mines deal electric AoE |
| Void Tendril | Gravity Anchor | Null Horizon | Void Tendril's pull and Anchor pull combine into a single point; damage doubles |
| Phase Mirror | Void Needle | Echo Chamber | Mirror copies fire Void Needles at targets the original player isn't aiming at |
| Cyber Wolf | Stalker Drone | Pack Hunter | Wolves and Stalker Drones coordinate attacks on the same target; +80% coordinated DPS |

---

### 5.4 CHARACTER + WEAPON SYNERGIES

| Character | Weapon | Synergy Name | Effect |
|---|---|---|---|
| Assassin | Void Needle | Ghost Kill | Void Needles fired from cloak state are guaranteed crits; all crits apply Mark |
| Assassin | Plasma Blade | Blade Ghost | Cloaked Plasma Blade has 2x reach; exit cloak on kill for instant recloak |
| Techno | Sentry Turret | Network Node | All Sentries share targeting data; they all fire simultaneously at same target |
| Techno | Stalker Drone | Apex Fleet | Techno's Feedback Loop bonus applies to Stalkers; 3 Stalker cap becomes 5 |
| Brawler | Magnetic Claymore | Titan Pull | Ground Zero fissure also acts as a 3-second magnetic anchor |
| Brawler | Plasma Mine | Minefield Momentum | Walking over own mines doesn't detonate them; they absorb hits for Brawler |
| Eykld | Gravity Anchor | Void Anchor | Eykld's Void Rift and Gravity Anchor pull forces stack; combined pull tripled |
| Oni | Shock Whip | Rage Conductor | Each Shock Whip crack adds 2 Rage stacks; Frenzy causes whip to crack 3x per swing |
| Skeleton | Nano Swarm | Death Economy | Nano kills generate Soul Fragments; Swarm gets faster as Fragment count increases |
| Skeleton | Wraith Lance | Legion | Wraith Lance summons count toward Army of Null; 12+ active: Colossus auto-triggers |
| Cyber Arm | Rail Spike | Apex Calibration | Rail Spike charges instantly during Perfect Lock; crits add 5 seconds to Perfect Lock |
| Phasewalker | Phase Mirror | Dimensional Echo | Mirror copies appear at BOTH portal positions during Dimensional Rift |

---

### 5.5 CHARACTER + ELEMENT SYNERGIES

| Character | Element | Synergy Name | Effect |
|---|---|---|---|
| Assassin | Void | Null Ghost | Cloak duration +3 seconds; void weapons are silenced (no sound indicator for enemies) |
| Techno | Electric | Overclock | Feedback Loop cooldown reduced to 6s; all gadgets deal 30% electric bonus damage |
| Brawler | Magnetic | Iron Will | Momentum Stacks also increase magnetic pull radius; at max stacks: enemies auto-cluster |
| Eykld | Void | Entropy Master | Entropy stacks from all sources apply to Void Rift; Rift deals Void damage |
| Oni | Fire | Blood Ignition | Rage stacks count as burn charges; Frenzy leaves a burning path |
| Skeleton | Void | Necromantic Protocol | All Wraiths deal void damage; Fragment chance increases to 50%; Colossus is void-immune |
| Cyber Arm | Ice | Cold Calibration | Frozen enemies held at reticle for the entire freeze duration; guaranteed hit + crit |
| Phasewalker | Void | Phase Void | Afterimage absorbs ALL projectiles (not just one); portals create void fields |

---

### 5.6 RELIC + WEAPON SYNERGIES

| Relic | Weapon | Synergy Name | Effect |
|---|---|---|---|
| Soul Condenser | Any Summon | Infinite Army | Summon duration +6 seconds; kills by summons restore 20% of summon cooldown |
| Overclock Chip | Sentry Turret | Artillery Mode | Sentry becomes stationary artillery; fires explosive rounds at maximum range |
| Phase Crystal | Ghost Round | Wraith Bullet | Ghost Round phases through all enemies; hits deal additional phase echo damage |
| Gravity Core | Magnetic Claymore | Singularity Cleave | Every Claymore swing creates a 2-second gravity point at the swing endpoint |

---

### 5.7 ULTIMATE COMBINATIONS

When a character's Ultimate is triggered while specific weapons are active, additional effects trigger:

| Character | Active Weapon | Ultimate Combo Name | Bonus Effect |
|---|---|---|---|
| Assassin | Void Needle | Null Execution | Zero Trace dash target explodes on death, killing all Marked enemies simultaneously |
| Techno | Stalker Drone | Digital Dominion Fleet | All Stalkers are empowered by the network node; they teleport to node position and attack from there |
| Brawler | Plasma Mine | Earthquake Protocol | Ground Zero detonates ALL active mines simultaneously; fissure becomes electrified |
| Eykld | Gravity Anchor | Null Singularity | Null Collapse implosion merges with Anchor pull; enemies have no escape angle |
| Oni | Shock Whip | Berserk Storm | All Frenzy attacks release shock whip cracks in every direction |
| Skeleton | Nano Swarm | Plague Army | Army of Null wraiths carry the Nano Swarm infection; contact spreads plague |
| Cyber Arm | Rail Spike | Total Overcharge | Overcharge Cannon is replaced with 3 simultaneous Rail Spikes on perfect Calibration |

---

## 6. RELIC SYSTEM

### 6.1 Design Philosophy

Relics in PHENIX 2.0 are **build-defining items, not stat boosters.** The test for any new relic: "Does this change what the player does, or does it just make them slightly more powerful?" If the answer is the latter, the relic should be redesigned.

Relics are found through: treasure rooms, boss kills, elite enemy drops, and meta-progression purchases.

**Relic Slots:** Player can hold 5 relics simultaneously. Some relics interact with each other.

---

### 6.2 MECHANICAL RELICS

**OVERCLOCK CHIP**
Every 30 seconds, all weapons fire at 200% speed for 4 seconds. The player is notified by a visual pulse. Cooldown resets on boss kill.
*Design Intent:* Creates rhythmic windows of explosive power; changes how players plan their positioning

---

**PHASE CRYSTAL**
All projectile weapons fire 0.1 seconds after the player moves in a new direction. This creates a "motion-triggered" firing system — the player's movement defines attack timing.
*Design Intent:* Fundamentally changes how mobile-style players interact with projectile weapons

---

**SOUL CONDENSER**
Every enemy killed within 2 seconds of your last kill extends your kill streak. At 10-kill streaks, you summon a free Wraith regardless of character. At 20-kill streaks, a permanent speed boost for 5 seconds.
*Design Intent:* Rewards aggressive kill-chaining; creates high-risk high-reward momentum windows

---

**GRAVITY CORE**
All weapon projectiles have mild homing for their final 30% of travel distance. This doesn't affect beams or melee.
*Design Intent:* Changes the feel of every projectile weapon without buffing damage; reduces skill floor for projectile aim

---

**DEAD MAN'S SWITCH**
When the player drops below 20% HP, ALL weapons immediately overclock for 8 seconds and generate a brief shield. This can only trigger once per life.
*Design Intent:* Creates a dramatic last-stand moment; rewards fighting at low HP rather than always healing

---

**ECHO PROTOCOL**
Any weapon that crits leaves an echo of the hit at the target location for 0.5 seconds. The echo deals 30% of the original damage. Echoes stack.
*Design Intent:* Synergizes with crit-heavy builds; creates visual density that signals build power

---

**VOID PARASITE**
On kill, a void parasite latches to the nearest living enemy, slowing it and dealing 5% of the parasite host's max HP per second. The parasite jumps to a new host on kill.
*Design Intent:* A perpetual damage-over-time effect that changes how the player thinks about kill priority

---

**OVERCLOCKER'S DEBT**
All weapons deal +50% damage but the player takes +15% damage from all sources. The bonus increases to +100% if player HP falls below 50%.
*Design Intent:* A glass-cannon pivot relic; completely changes character survivability calculus

---

**TACTICAL LENS**
When the player stands still for 2 seconds, a targeting reticle appears on the highest-HP visible enemy. All weapons gain +100% damage against the reticle target.
*Design Intent:* Creates a stationary sniping playstyle; counter-intuitive but extremely powerful for skilled players

---

**MEMORY FRAGMENT**
Each upgrade pickup stores a ghost copy. After death in Endless Mode, the player begins the next run with the first 3 upgrades from their previous run.
*Design Intent:* Rogue-lite persistence element; lets experienced players snowball into late game more efficiently

---

**NULL CLOCK**
Time slows to 60% speed for all enemies (and their projectiles) but the player moves at normal speed. Doesn't affect damage or player attack speed. Permanent.
*Design Intent:* Dramatically changes difficulty feel; makes bullet-dense situations manageable; fundamentally shifts the game's pacing

---

**RESONANCE CORE**
The first weapon fired each second deals +80% damage. Subsequent weapon activations within the same second deal normal damage.
*Design Intent:* Rewards players who deliberately pace their firing rather than holding all buttons; creates a more deliberate combat rhythm

---

**PREDATOR PROTOCOL**
After killing 3 enemies in 2 seconds, the player's movement speed increases by 40% for 4 seconds. During this speed boost, the player trails a damage aura that deals melee damage to nearby enemies.
*Design Intent:* Creates a kill-to-move-fast loop; rewards aggressive play; good pairing for Brawler and Oni

---

**SINGULARITY DRIVE**
All the player's weapons gradually drift toward a single "convergence point" 300px ahead of the player. All weapons fire from this convergence point instead of from the player's position.
*Design Intent:* Completely changes spatial weapon feel; all weapons become quasi-targeted at the convergence; unique tactical use

---

## 7. MAP SYSTEM

### 7.1 Design Philosophy

The PHENIX 2.0 map is not a flat, endless plane. It is a **living procedural city** — the shattered ruins of NULL EDEN, an EDEN Corp-controlled megacity that has partially collapsed into digital chaos. The world streams in as the player explores, revealing a landscape of distinct biomes, encounters, and secrets.

The player never loads a "new area" — the world is seamless. But as they travel, the visual environment, enemy composition, ambient events, and terrain features shift according to a biome system.

---

### 7.2 CHUNK STREAMING

**Chunk Size:** 2560×2560px logical tiles
**View Distance:** 3×3 chunk grid always loaded (25,600×25,600px active area)
**Chunks Behind Player:** Unloaded after player moves 2 full chunks away
**Enemy Persistence:** Enemies in unloaded chunks are frozen; re-entering a chunk thaws them

**Chunk Content Types:**
- **Open Field** (40%) — standard combat space; minimal obstacles
- **Corridor** (20%) — narrow paths between structures; forces close combat
- **Arena** (10%) — open circular clearing; used for Elite and Boss encounters
- **Structure Interior** (15%) — indoor maze-like grid; drones and summons excel
- **Void Zone** (10%) — partially nullified terrain; void element enhanced; eerie visual layer
- **Transition** (5%) — biome boundary chunks; blend visual language of adjacent biomes

**Chunk Generation Rules:**
1. Player's starting chunk is always Open Field
2. No two Boss Arena chunks can be adjacent
3. Void Zones always border Open Fields (buffer zone)
4. Corridor chunks cluster in groups of 2–4

---

### 7.3 BIOMES

**NEON DISTRICT**  
*Visual:* Intact cyberpunk city streets. Holographic ads flicker. Rain falls constantly. Reflective puddles mirror neon signs.  
*Enemy Composition:* Standard cyber-grunts, drone clusters, corporate security units  
*Hazards:* Electrified puddles, falling ad-boards (periodic AoE), data streams on the ground (speed boost corridors)  
*Music Layer:* Base track — driving electronic pulse

---

**DATA WASTES**  
*Visual:* Collapsed server farms. Exposed wiring. Chunks of corrupted reality visible in the air. Occasional data-storm visual effect (screen desaturation pulse).  
*Enemy Composition:* Data-corrupted enemies (glitching movement), data-ghost archetypes, elite data constructs  
*Hazards:* Data corruption zones (random weapon silencing for 2 seconds), overloading server boxes (delayed AoE explosions), floating debris fields (orbit-weapon interference)  
*Music Layer:* Glitched electronic; occasional silence glitches

---

**VOID RIFT ZONE**  
*Visual:* Reality is partially eroded. Background shows a dark purple cosmic expanse through the cracks. Buildings are translucent and fading. Void energy pools on the ground.  
*Enemy Composition:* Phase-shifted enemies (partially invisible), void-spawn archetypes, Null entities (boss-tier difficulty elites)  
*Hazards:* Gravity anomalies (random directional pull), void pools (void damage to player), phase-shift zones (player's position becomes slightly random when moving through)  
*Music Layer:* Ambient drone; deep bass hum; reversed electronic sounds

---

**INDUSTRIAL CORE**  
*Visual:* Massive factory interior ruins. Steam vents, conveyor belt remnants, molten runoff channels. Industrial scale — ceilings visible at height.  
*Enemy Composition:* Mechanical enemies (extra health, fire vulnerability), worker-drones (suicide rush), factory guardians (armored elites)  
*Hazards:* Molten runoff streams (fire damage channels), steam vents (knockback + sight obstruction), conveyor belts (forced movement zones), explosive barrels  
*Music Layer:* Industrial percussion, heavy machinery sounds

---

**BIOLAB SECTOR**  
*Visual:* Collapsed EDEN Corp research facility. Containment pods cracked. Experimental organisms roaming. Bioluminescent spore clouds.  
*Enemy Composition:* Bio-engineered enemies (organic types, toxic vulnerability), failed experiments (unpredictable movement), viral carriers (infection spread)  
*Hazards:* Spore clouds (visibility reduction + toxic damage), escaped specimens (neutral entities that fight both sides), containment fluid rivers (slow + toxic debuff)  
*Music Layer:* Unsettling ambient; biological pulse sounds

---

**THE NULL**  
*Visual:* Complete visual silence. The map is a featureless white expanse. Enemies have no texture — only black outlines. The player character loses color. Occasional reality "glitches" briefly reveal the city below.  
*Enemy Composition:* Null entities exclusively — abstract geometric enemy forms  
*Hazards:* The entire biome IS the hazard. All player HUD is removed except HP bar. Sound design shifts to pure white noise.  
*Music Layer:* Silence with periodic tones; almost no music

*Unlock:* Only accessible after surviving 20:00 in Endless Mode

---

### 7.4 ELITE ENCOUNTERS

Elite enemies spawn in dedicated Arena chunks. The chunk entrance is marked by a visual pulse (color-coded by Elite type). Approaching the entrance triggers a brief Elite introduction animation.

**Elite Types:**
- **Standard Elite** — 5× normal HP, 2× damage, unique ability. Drops guaranteed upgrade on kill.
- **Champion Elite** — Rare spawn. Has a health bar on screen. Specific weakness displayed. Drops a Relic on kill.
- **Phantom Elite** — Invisible until attacked. Deals massive burst damage. Void element.
- **Siege Elite** — Stationary but has massive area attacks. Must be flanked. Cannot be pulled with Magnetic.
- **Swarm Lord** — Doesn't fight itself but summons waves of enemies. Kill the lord to stop the waves. Immune to crowd control.

---

### 7.5 RANDOM EVENTS

Random events spawn on the map as glowing encounter markers. Players can choose to engage (detour from current path) or ignore. Events last 15–30 seconds once triggered.

| Event Name | Description | Reward |
|---|---|---|
| Data Cache | A sealed EDEN Corp terminal with encryption. Break it open by dealing damage to specific glowing nodes. | PF Fragments + 1 upgrade choice |
| Null Storm | A temporary void storm sweeps through. Survive 20 seconds against enhanced void enemies. | Void Element unlocked for current run |
| Corporate Siege | 3 waves of armored corporate security. Timed — kill all before evacuation. | Relic drop |
| Ghost Signal | A transparent enemy broadcast: find and silence 3 signal nodes before it completes. | Character outfit reveal (lore) |
| Blood Arena | An optional arena opens. Player is locked in with a Swarm Lord. | Massive PF bonus |
| Extraction Point | A supply drop falls. The player must reach it and defend it for 10 seconds against an approaching wave. | Weapon upgrade (instant) |
| Chaos Surge | Chaos Mode activates for 45 seconds at maximum intensity. Enemies are more aggressive. | Chaos Survival Rank points |

---

### 7.6 TREASURE ROOMS

Treasure Rooms are Interior-type chunks with no enemies. They spawn every 8–12 minutes in Endless Mode. The player can enter and freely choose from 3 reward options:

**Reward Pool:**
- 3 upgrade cards (rare tier)
- 2 relics (standard tier)
- 1 legendary weapon evolution
- Healing station (full HP restore)
- PF Cache (large PF bonus)
- Character temporary skill boost (60 seconds)

Leaving the Treasure Room triggers a brief encounter — 1 Elite immediately spawns outside. The Treasure Room cannot be re-entered.

---

### 7.7 SECRET AREAS

Secret Areas are hidden within specific biome chunk combinations. They require finding and activating 2 trigger objects within the same chunk or adjacent chunks.

| Secret Area | Trigger | Content |
|---|---|---|
| Null Archive | Interact with 2 corrupted data terminals in the same chunk | Lore transmission (story), hidden PF cache |
| Phantom Lab | Kill 3 Phantom Elites within 5 minutes | Secret weapon evolution not available in normal upgrade pool |
| The Vault | Survive 3 minutes in a single Void Zone without leaving | Legendary Relic that cannot be found any other way |
| Ghost Protocol Room | Complete 2 Ghost Signal events in same run | Assassin outfit unlock + gameplay modifier |
| Oni Shrine | Reach 50 Rage stacks while playing as Oni in Industrial Core | Oni-exclusive relic |

---

### 7.8 BOSS ARENAS

Boss arenas spawn at the following intervals in Endless Mode:
- Minute 5: First boss
- Minute 12: Second boss (harder variant)
- Minute 20: Third boss (Chaos-augmented)
- Minute 30+: Rotating bosses with escalating modifier stacks

Boss Arena chunks have:
- Clearly defined circular or octagonal boundaries
- Terrain features unique to each boss (pillars for Serpent, ice platform for Dragon)
- No enemy spawning outside the boss during the fight
- A brief cinematic introduction (3 seconds) before the fight

Bosses have:
- Phase-based health thresholds (100%, 60%, 30%) triggering behavior changes
- Environment interactions unique to their type
- A unique weakness that synergizes with specific elements

---

## 8. ENEMY DESIGN

### 8.1 Design Philosophy

Every enemy class serves a specific gameplay purpose. Enemies are not just obstacles — they are puzzles. Their presence should force the player to think, not just shoot faster. Mixing enemy archetypes is the primary difficulty driver — not raw health/damage scaling.

---

### 8.2 ENEMY CLASSES

**GRUNT**
The baseline enemy. Walks toward player. Moderate HP, low damage. Exists to: fill space, die to AoE, and test player coverage.
*Design Rule:* Grunts should never be individually dangerous. They're dangerous in mass.

**CHARGER**
Moves slowly until within 300px, then sprints directly at player for 1 second. High damage on contact but easy to dodge.
*Design Rule:* Forces player movement. Countered by knockback weapons and well-timed repositioning.

**SHOOTER**
Stationary or slow-moving. Fires projectiles at the player from range. Prioritizes maintaining distance.
*Design Rule:* Punishes players who forget about ranged threats. Forces priority target-switching.

**HEALER**
Does not attack the player directly. Moves toward other enemies and applies regeneration aura to nearby allies.
*Design Rule:* Always a priority kill. Teaches "kill order" decision-making.

**SHIELD BEARER**
Has a directional shield covering 120°. Immune to damage from the shielded direction.
*Design Rule:* Forces flanking. Tests whether orbit weapons or area weapons can bypass the shield.

**BOMBER**
Slow, does not attack until it reaches the player. On contact OR on death, detonates for high AoE.
*Design Rule:* Forces awareness of "do not let this reach me." Tests AoE vs. single-target weapon investment.

**BURROWER**
Moves underground (invisible). Surfaces under the player's position. Telegraphed by ground disturbance animation 0.5 seconds before surfacing.
*Design Rule:* Tests player reaction time. Cannot be hit while underground.

**PHASE RUNNER**
Rapidly teleports short distances (120px) every 2 seconds. Takes damage normally when stationary.
*Design Rule:* Countered by AoE and homing weapons. Punishes players with only directional projectiles.

**ANCHOR**
Stationary. Emits a slow field that reduces all enemy movement speed within 400px. Draws aggro from the player but shouldn't be dismissed.
*Wait, this is wrong:* Emits a field that reduces PLAYER movement speed and weapon fire rate within 400px.
*Design Rule:* Extreme priority target. Tests whether players can break out of area denial.

---

### 8.3 ENEMY ARCHETYPES (By Biome)

**NEON DISTRICT**
- Neon Grunt (standard)
- Corporate Shooter (ranged)
- Security Shield Bearer (frontal shield)
- Ad-Board Bomber (aerial bomb drop, not ground-based)
- EDEN Tactical Unit (mini-elite; has a commander ability that buffs nearby grunts)

**DATA WASTES**
- Corrupted Data Ghost (Phase Runner variant; phases out on low HP)
- Data Leech (attaches to player and saps energy — applies debuff over time)
- Error Entity (Bomber variant; detonation is a data surge that silences player weapons for 1 second)
- Null Fragment (Swarm type; 20 appear at once; very low HP individually)

**VOID RIFT ZONE**
- Void Stalker (invisible; only visible when attacking)
- Gravity Wraith (pulls player toward it using Eykld-style gravity; can be lethal near terrain hazards)
- Phase Echo (after dying, respawns once as a transparent version with 30% HP)
- Null Devourer (Mini-boss tier; absorbs void weapons; only vulnerable to fire)

**INDUSTRIAL CORE**
- Factory Guardian (heavy armor; fire deals 2x damage; needs multiple hits to break armor)
- Worker Drone (suicide bomber; swarms in groups of 15+)
- Molten Crawler (Burrower variant; surfaces in fire pools; carries fire aura)
- Heavy Gunner (turret-like enemy that requires being flanked)

**BIOLAB SECTOR**
- Spore Carrier (releases toxic cloud on death)
- Viral Spreader (infects nearby enemies on contact — not the player — creating "friendly fire" among enemy types)
- Containment Horror (large, slow; creates expanding acid zones as it moves)
- Failed Experiment (random behavior each time; can be Charger, Phase Runner, or Healer each spawn)

---

### 8.4 ELITE ENEMIES

Elites are named, specific enemy types that scale with current run time. Each has a unique ability.

**CHROME WIDOW**
A mechanical spider-type enemy. Places web mines across the terrain (slow zones). Attacks from webs' edges, rarely entering the combat zone directly.
*Weakness:* Fire (burns the webs instantly); Phase weapons (pass through web mines)
*Elite Ability:* Web Collapse — pulls all web strands toward center, dragging any player in a web toward her

**NULL SHEPHERD**
A tall, thin Void entity that passively increases all nearby enemy HP by 100% and attack speed by 40% as long as it lives.
*Weakness:* Must be killed first in every encounter — it transforms grunts into mini-elites by proximity
*Elite Ability:* Phase Shield — briefly becomes Phase-Locked (immune to non-void damage) for 3 seconds on HP threshold

**DATA ORACLE**
An Oracle entity that predicts player movement. Its attacks always aim at the player's position 0.8 seconds in the future — not current position.
*Weakness:* Moving in unpredictable patterns or stopping suddenly
*Elite Ability:* Future Strike — fires a delayed projectile at player's predicted position; it cannot be dodged unless player reverses direction

**MAGNET GOLEM**
An enormous magnetic construct. Pulls ALL metal-type weapons (projectiles, melee damage instances) toward itself, healing for 30% of damage it absorbs.
*Weakness:* Void weapons (not affected by magnetism), Toxic (bypasses absorption)
*Elite Ability:* Iron Shell — covers itself with a magnetic bubble; projectile-immune for 5 seconds

**SIEGE REAPER**
A massive mechanical scythe-wielder. Stationary after placed on the field. Swings its scythe in a 200px arc covering 270° every 2 seconds; the remaining 90° is its only safe approach angle.
*Weakness:* Must be flanked to the safe angle and attacked from there
*Elite Ability:* Reaper Rotation — periodically rotates 90°, changing the safe angle; players who didn't notice the rotation get hit

---

### 8.5 MINI BOSSES

Mini bosses appear as champions in arena encounters. Unlike full bosses, they have 2 phases and no cinematic introduction.

**NEXUS COMMANDER**
A EDEN Corp field commander. Commands up to 8 standard grunts who obey tactical formations. The Commander itself has moderate HP and fires a precision sniper shot every 5 seconds.
*Phase 2 (50% HP):* Retreats behind formation; calls in Shield Bearers; sniper frequency doubles

**STATIC REVENANT**
An electric ghost entity. Exists in two states: solid (visible, attackable, slow-moving) and static (fast-moving, invisible, untouchable). Alternates between states every 4 seconds.
*Phase 2 (60% HP):* Static phase becomes 50% faster; solid phase has a chain-lightning aura

**THE CRUSHER**
A mechanical gorilla construct. Alternates between area-pound attacks (high AoE) and targeted throws (picks up terrain objects and throws them at the player).
*Phase 2 (40% HP):* Begins picking up and throwing ENEMY units as projectiles; allies are afraid of it

**VOID ARCHITECT**
An entity that can rebuild terrain — it places walls, creates corridors, and reshapes the arena during combat, forcing the player to adapt to a constantly changing environment.
*Phase 2 (50% HP):* Builds a maze around itself; the maze has one entrance; the walls deal void contact damage

---

### 8.6 BOSSES

**CYBER DRAGON (Enhanced — 2.0)**

The Cyber Dragon returns but with a fully restructured 3-phase fight:

*Phase 1 (100%–65% HP):* Original behavior — ice storm, orbital patterns, occasional cryo bolts between storms. New: introduces **Arctic Spire** terrain (ice pillars that block movement; must be destroyed or navigated around).

*Phase 2 (65%–30% HP):* Dragon partially malfunctions — becomes faster, fires cryo bolts continuously. Storm frequency triples. **Glitch Phase** triggered at 45% HP: Dragon briefly becomes partially Phase-Locked (void-vulnerable) for 5 seconds — high skill window.

*Phase 3 (30%–0%):* Dragon enters **Desperation Protocol**. Flies off-screen and begins carpet-bombing the arena with ice clusters. Player must avoid falling ice while maintaining damage. Dragon lands for a final ground phase — 3× speed, continuous storm, cryo bolts at fire rate.

*New Mechanic — Ice Shatter:* Phase 2 introduces breakable ice barriers. Players who break them receive buff pickups. Breaking all 4 barriers before Phase 3 activates a "Broken Protocol" bonus — Dragon takes 40% extra damage during Phase 3.

---

**CYBER SERPENT (Enhanced — 2.0)**

*Phase 1 (100%–60% HP):* Enhanced from 1.x — distance-based trail spawning remains. New: serpent can submerge underground (Burrower mechanic applied to boss scale) and surface in a new location. Fire trails are now persistent for 6 seconds.

*Phase 2 (60%–25% HP):* Serpent splits into two half-segments that move independently. Each segment has its own HP pool. If one half is killed before the other, the surviving half absorbs the corpse and heals 20% HP.

*Phase 3 (25%–0%):* Segments recombine into a **Serpent Colossus** — double the visual size, 3× speed, fire trails expand to 80px width. A massive fire nova every 12 seconds that covers the entire arena except corners.

---

**APEX CONSTRUCT** (New Boss — Industrial Core)

An EDEN Corp experimental weapon platform. A humanoid mech the size of a building.

*Phase 1:* Long-range — fires precision missiles and sweeping laser beams. Arena has cover objects (server pillars) the player can use.

*Phase 2:* Deploys drone swarms; player must balance fighting the drones while continuing boss damage.

*Phase 3:* Enters close-range mode. Slams the ground in patterns, picks up terrain objects to throw. The fight becomes a melee encounter.

*Mechanic:* The Construct has 4 weak points visible on its body. Players who destroy all 4 weak points trigger a 5-second vulnerability window where damage dealt is multiplied 5×.

---

**THE NULL** (Secret Final Boss — The Null biome)

An abstract entity. Does not have a visible health bar. Players must discover how to damage it through experimentation during the fight.

*Mechanics:* The Null exists outside normal damage systems. Only VOID element damage and VOID-type weapons deal standard damage. All other damage types deal 1% of normal. The player has no explicit indication of this — discovering it IS the boss mechanic.

*Attack Patterns:* Perfect geometric shapes as projectiles. A 2×2 grid of death zones that shift like a sliding puzzle. Summons are exact mirror copies of the player's weapons — the boss adapts to what the player is using.

*Unique:* Killing The Null triggers a custom ending sequence. The player receives a permanent cosmetic marker visible on their character select screen.

---

### 8.7 SPECIAL BEHAVIORS

**Sacrifice:**
Enemies with this behavior will run toward any enemy that the player has marked as a priority target (Data Spike, reticle, etc.) and absorb damage for it. Forces players to adapt targeting.

**Mimic:**
Elite enemies with Mimic behavior copy the movement pattern of the player's character from 3 seconds ago. They predict-dodge constantly.

**Regenerator:**
Enemies with Regenerator regain 5% HP per second when not taking damage. Even 0.1 seconds without a hit begins regeneration.

**Anchor Aura:**
Applied to select large enemies. Nearby enemies (within 200px) cannot be knocked back, pulled, or crowd-controlled.

**Deathburst:**
On death, the enemy detonates a specific element burst. The element type is telegraphed by the enemy's color overlay throughout the fight.

---

## 9. PROGRESSION

### 9.1 WITHIN A RUN

**Upgrade System:**
Every 30 seconds (scaling down to 20 at run minute 10+), the player is offered 3 upgrade choices. Each upgrade is:
- A new weapon (if weapon slots not full)
- A weapon upgrade (if weapon already held)
- A weapon evolution (if weapon held at max level AND evolution conditions met)
- A passive stat upgrade (damage, HP, speed)
- A relic pickup

**Upgrade Rarity:**
- Common (white) — available at any time
- Rare (blue) — available after minute 3
- Epic (purple) — available after minute 7
- Legendary (gold) — available after minute 12; maximum 1 per run from upgrade offerings
- Unique (red) — character-specific; can only appear if conditions are met; 1 per run maximum

---

### 9.2 META PROGRESSION

**PHOENIX FRAGMENTS (PF)**
Earned through:
- Enemy kills (base: 1 PF per 20 kills)
- Survival milestones (every 2 minutes)
- Boss kills (flat PF bonus)
- Random event completion
- Chaos Survival Rank (bonus multiplier)
- Daily challenge completion

**PF Spending:**
| Item | Cost |
|---|---|
| Character unlock | 800–2000 PF (scales by roster position) |
| Character outfit | 500–1200 PF |
| Starting relic slot (enables bringing 1 relic into runs) | 1500 PF |
| Passive stat upgrades (permanent) | 100–500 PF |
| Protocol Cards | 200–600 PF |
| Endless Mode entry ticket (if gated) | Free (no cost) |

---

### 9.3 CHARACTER UNLOCKS

| Character | Unlock Condition | PF Cost |
|---|---|---|
| Assassin | Default | — |
| Techno | Default | — |
| Brawler | Survive 10:00 in Endless Mode | 800 PF |
| Eykld | Kill 1000 total enemies across all runs | 1000 PF |
| Oni | Take 5000 total damage across all runs | 900 PF |
| Cyber Arm | Land 100 perfect calibration shots (crit hits on reticle targets) | 1200 PF |
| Skeleton | Collect 500 Soul Fragments across all runs | 1000 PF |
| Phasewalker | Survive 20:00 in The Null biome | 2000 PF |

---

### 9.4 OUTFITS

Each character has 3 outfits:
- **Default** — starting appearance
- **Elite** — unlocked through PF purchase OR specific achievement
- **Secret** — unlocked through hidden in-game condition

Outfits are purely cosmetic. They do not affect gameplay.

---

### 9.5 ACHIEVEMENTS

Achievements are divided into:

**General Achievements** (track across all characters)
- First Blood — Kill your first enemy
- Chain Kill — Kill 10 enemies in 2 seconds
- Survivor — Reach minute 10 in any mode
- Collector — Own 6 relics in a single run
- Synergy Seeker — Trigger 5 different synergies in a single run
- Null Touched — Enter the Void Rift Zone biome

**Character Achievements** (per character; unlock outfits or relics)
- Assassin: "No Witnesses" — Kill 20 enemies while cloaked in a single run
- Techno: "Full Network" — Have 10 gadgets/drones active simultaneously
- Brawler: "Unmoveable" — Survive 30 seconds with 5+ enemies in melee range
- Eykld: "Gravity God" — Pull 100 enemies into the Void Rift in a single run
- Oni: "Blood Frenzy" — Trigger Oni Frenzy 3 times in a single run
- Cyber Arm: "Precision" — Land 5 perfect calibration shots in a row without missing
- Skeleton: "Undead Legion" — Have 12+ summons active simultaneously
- Phasewalker: "Between Worlds" — Damage 20 enemies through portals in a single run

**Secret Achievements** (undisclosed; discovered through play)
- Related to The Null biome
- Related to The Null boss
- Related to specific synergy combinations
- Related to zero-damage boss kills

---

### 9.6 MASTERY SYSTEM

Each character has a Mastery Track (100 points). Mastery is earned through:
- Playing that character (1 point per run completed)
- Completing character achievements (+5 points each)
- Reaching specific survival milestones with that character

**Mastery Rewards:**
| Level | Reward |
|---|---|
| 5 | Character dialogue reveal (lore text) |
| 10 | Outfit unlock (Elite tier) |
| 20 | Character-specific starting bonus (passive stat) |
| 30 | Secret outfit fragment |
| 50 | Unique character protocol card |
| 75 | Character ultimate enhancement (passive upgrade to Ultimate) |
| 100 | Mastery Badge (visual marker on character portrait; seen by all players on leaderboard) |

---

### 9.7 CHAOS SURVIVAL RANK

The Chaos Mode rank system tracks performance specifically in Chaos Mode. Rank is calculated by:
- Total survival time in Chaos Mode
- Kill count during Chaos
- Damage taken (lower = higher rank)
- Chaos Laws activated (more = higher rank)

**Rank Tiers:**
- STATIC (0–299 points)
- SURGE (300–599 points)
- STORM (600–999 points)
- APEX (1000–1499 points)
- NULL (1500+ points)

NULL rank is displayed with a special visual effect on the character portrait in the UI.

---

## 10. VISUAL DIRECTION

### 10.1 Core Visual Identity

PHENIX: NULL EDEN 2.0's visual identity is built on one central tension: **the beauty of a dying city.** NULL EDEN was the most advanced metropolis ever built — and it is collapsing. The visual language must communicate this duality: premium, intricate, cyberpunk infrastructure in the process of being consumed by void energy, digital corruption, and entropy.

**Reference Aesthetic:**
- Not Survivor.io (circular AoE spam, flat enemy art, casual color schemes)
- Not generic purple-and-cyan neon aesthetic (overused)
- Target: a premium anime game aesthetic crossed with hard science fiction — *Blame!*, *Ghost in the Shell*, *NieR: Automata*, *Cyberpunk: Edgerunners* — but original

---

### 10.2 WEAPON SILHOUETTE STANDARDS

Every weapon must pass the **silhouette test**: viewed as a solid black shape against white, it must be immediately recognizable and distinct from all others.

**Banned Shapes:**
- Solid circles as the primary form
- Solid squares as the primary form
- Undifferentiated blobs
- Generic explosion rings as the primary visual

**Required Standards:**
- All projectile weapons must have visible internal structure (facets, segments, trails, rotation)
- All melee weapons must have a visible edge/blade/impact arc geometry
- All orbit weapons must have recognizable geometric shapes beyond spheres
- All AoE weapons must use angular blast patterns, not simple circles
- All drone weapons must have clearly readable mechanical anatomy

---

### 10.3 COLOR LANGUAGE

Each element has a primary and secondary color that is NEVER reused by another element:

| Element | Primary Color | Secondary/Glow | Banned Overlap |
|---|---|---|---|
| Fire | #FF4400 (orange-red) | #FFB300 (amber) | Never use red for non-fire elements |
| Ice | #00E5FF (cyan) | #E0F7FA (ice white) | Never use cyan for non-ice elements |
| Electric | #FFE600 (electric yellow) | #FFFFFF (white arc) | Never use yellow for non-electric elements |
| Void | #6600CC (deep purple) | #EE00FF (void violet) | Never use purple for non-void elements |
| Magnetic | #00BFFF (steel blue) | #C0C0C0 (metallic grey) | Never use grey for non-magnetic elements |
| Toxic | #39FF14 (neon green) | #1A1A00 (dark yellow-black) | Never use green for non-toxic elements |

**Player character** is always white/silver primary, with the character's element color as accent.
**UI** uses dark backgrounds (#050810) with element-colored highlights.
**Enemy HP bars** use a specific red (#FF1744) that is deliberately different from fire's #FF4400.

---

### 10.4 VFX STANDARDS

**Premium VFX Requirements:**
- Every weapon impact must have a visible frame-1 flash
- Weapon trails must persist for minimum 3 frames after the projectile is gone
- All explosions must use layered geometry (core bright → mid shockwave ring → outer debris scatter), never a single expanding circle
- Hit reactions on enemies must include a 1-frame color flash + brief size pulse
- Critical hits must be visually distinct from normal hits (larger flash, distinct sound)
- Elemental kills must have element-specific death animations (ice = shattering, fire = burn-out, void = erasure)

**Readable Combat Standard:**
Even at maximum chaos (20 enemies, 5 weapons, Chaos Mode active), the player character must be always visible. This is achieved through:
- Player character has a permanent white outline (2px) that draws above all VFX layers
- AoE effects cannot exceed 40% opacity on the layer directly containing the player
- Enemy projectiles must always use the enemy's biome color (never the player's weapon color)
- The player's HP bar and XP bar are rendered above all game-world elements

---

### 10.5 CHARACTER VISUAL DESIGN PRINCIPLES

Each character must communicate their identity through silhouette alone:
- **Assassin:** Lean, angular, hood/cloak element; crouched posture suggests readiness
- **Techno:** Angular mechanical augmentations visible; floating drones orbiting even in idle
- **Brawler:** Massive, broad-shouldered; mechanical arms are oversized; grounded stance
- **Eykld:** Ethereal; partially transparent; strange proportions; void energy leaking from form
- **Oni:** Layered armor with oni-mask; visible energy lines on the body suggesting contained rage
- **Cyber Arm:** Dominant mechanical arm is unmissable; tactical posture; scope-eye augment
- **Skeleton:** Slight figure with ornate armor; floating bone elements always in orbit
- **Phasewalker:** Exists in two overlapping visual states simultaneously (phase effect at all times)

---

### 10.6 UI DESIGN PRINCIPLES

**Premium UI Language:**
- Dark, translucent panels with sharp geometric borders
- No rounded corners on primary UI elements (cyberpunk = hard angles)
- Text uses monospace terminal font for numbers, sans-serif for labels
- Upgrade cards use full-bleed weapon art with colored element borders
- Health bar is a segmented structure (not a solid bar) — each segment represents 10% HP
- Critical UI elements pulse at 0.5Hz when player attention is needed

**Banned UI Elements:**
- Cartoon-style icons
- Saturated light backgrounds
- Comic Sans or similar informal fonts
- Icon-only communication (all icons must have text label on first display)

---

## 11. IMPLEMENTATION ROADMAP

### 11.1 Guiding Principles

This roadmap assumes PHENIX 2.0 is built as a significant update to the existing 1.x codebase rather than a complete rewrite. Every phase should produce a playable build. Regression against 1.x features is never acceptable.

Priority is determined by player impact per development hour.

---

### 11.2 PHASE 0 — ARCHITECTURE (Foundation)

*Nothing visible to players. All infrastructure.*

**Priority Order:**
1. **Split Game.js monolith** — Game.js exceeds 850KB. Split into: `GameLoop.js`, `CombatSystem.js`, `EnemySystem.js`, `WeaponSystem.js`, `EffectsSystem.js`, `MapSystem.js`. Each file max 10,000 lines.
2. **Automated cache-bust injection** — Replace manual cache-bust strings with a build script that injects the git commit hash at deploy time. Never manually update cache-bust strings again.
3. **Event bus system** — Implement a lightweight pub/sub event bus. All cross-system communication goes through events, not direct function calls. Decouples systems.
4. **Asset manifest** — All assets declared in a central `assets.json`. No hardcoded paths anywhere else.
5. **State machine for game flow** — Replace gameState strings with a proper state machine class. Illegal transitions throw errors.
6. **Chunk/map data structure** — Define the chunk object schema, biome types, and streaming interface before any biome content is built.

---

### 11.3 PHASE 1 — CORE SYSTEMS

*Playable but content-sparse. Internal testing only.*

**Priority Order:**
1. **Modular weapon system** — All weapons defined as data objects, not hardcoded functions. WeaponSystem.js reads weapon definitions and instantiates behavior.
2. **Element system refactor** — Elements as modifiers applied to weapon objects. Hybrid element logic defined centrally.
3. **Chunk streaming** — Implement the 3×3 active chunk grid. Open Field chunks only at this stage.
4. **Character passive system** — Clean interface for character-specific passive behaviors. No more character-specific branches scattered through the main loop.
5. **Relic interface** — Define Relic as a data structure with hooks for `onEquip`, `onKill`, `onDamageDealt`, `onDamageTaken`, `onUltimate`, `onTimer`.
6. **Synergy detection engine** — System that checks active weapons + character + relics against a synergy database and applies effects.

---

### 11.4 PHASE 2 — GAMEPLAY

*Playable. Beta testing begins.*

**Priority Order:**
1. **All 8 characters fully implemented** — Passives, ultimates, synergy hooks all active.
2. **Weapon category implementation** — One weapon per category at minimum. Minimum 6 weapons total at launch of this phase.
3. **Element system — all 6 elements** — Full implementation with environmental interactions.
4. **Elite enemy system** — 3 Elite types implemented with arena encounters.
5. **Biome 1 — Neon District** — Full visual treatment, enemy composition, hazards.
6. **Random event system** — 3 events implemented.
7. **Treasure Room system** — Basic implementation.
8. **Chaos Mode integration** — Chaos Mode preserved and enhanced with new biome-aware overlays.

---

### 11.5 PHASE 3 — CONTENT

*All content layers. Public beta eligible.*

**Priority Order:**
1. **Remaining biomes** — Data Wastes, Industrial Core, Biolab Sector, Void Rift Zone.
2. **Full weapon roster** — All 10 categories, minimum 3 weapons per category.
3. **All relic implementations** — All 14 designed relics functional.
4. **Boss Phase 2 — Cyber Dragon enhanced** — 3-phase fight implemented.
5. **Boss Phase 2 — Cyber Serpent enhanced** — Split mechanic implemented.
6. **New boss — Apex Construct** — Full fight implemented.
7. **Full synergy database** — All designed synergies implemented and discoverable.
8. **Mastery system** — All character mastery tracks functional.
9. **Achievement system** — All general achievements tracked.

---

### 11.6 PHASE 4 — POLISH

*Final quality pass. Release candidate preparation.*

**Priority Order:**
1. **VFX pass on all weapons** — Every weapon meets the VFX standards in section 10.4.
2. **Audio — elemental SFX** — Unique sound for each element's impact, kill, and chain.
3. **Character animations** — Idle, run, attack, death animations for all 8 characters.
4. **UI polish** — Upgrade cards, synergy log, mastery display, Chaos Rank badge.
5. **Biome transition visuals** — Seamless biome blending at chunk boundaries.
6. **Boss introduction cinematics** — 3-second boss reveal animations.
7. **Secret areas** — All 5 secret areas implemented with lore content.
8. **The Null biome** — Full implementation.
9. **The Null boss** — Full fight implemented.
10. **Phasewalker unlock** — Full character unlock flow.

---

### 11.7 PHASE 5 — OPTIMIZATION

*Performance and platform targets.*

**Priority Order:**
1. **Mobile performance audit** — Target 60fps on mid-range mobile. Object pooling for all projectiles, particles, enemies.
2. **Chunk unload memory management** — Verify no memory leaks on chunk transitions.
3. **WebGL renderer (optional)** — If Canvas 2D can't hit 60fps targets in late Endless, consider selective WebGL for VFX layers.
4. **Controller deadzone and mapping** — Full controller support audit across all new systems.
5. **Load time optimization** — All assets lazy-loaded by biome. Initial load only covers starting biome.
6. **GitHub Pages CDN audit** — Verify cache headers are set correctly for all asset types.
7. **Offline mode** — Service worker implementation for full offline play.

---

### 11.8 PHASE 6 — POST-LAUNCH

*Ongoing content updates.*

**Roadmap Items (Post-Launch Priority):**
1. Daily challenge system — new modifier set each day
2. Leaderboard system — Endless Mode top survival times
3. Character 9+ — design TBD based on community feedback
4. Biome 6 — The Null (if not in launch build)
5. Cross-run lore system — lore entries that unlock progressively
6. Weapon evolution additions — new evolution paths for underused weapons
7. Community synergy submissions — curated player-discovered synergies added to official synergy log

---

## APPENDIX A — DESIGN CONSTRAINTS

The following constraints are non-negotiable throughout PHENIX 2.0 development:

1. **No server dependency** — Game must remain fully client-side. Any backend (leaderboard, daily challenges) is optional and must gracefully degrade if unavailable.
2. **GitHub Pages compatible** — Static HTML5 deployment. No build server requirements for basic gameplay.
3. **Old save compatibility** — All MetaProgress data from 1.x must be importable into 2.0 without loss. Backfill logic must be planned for every new unlock flag.
4. **Controller support is mandatory** — Every new system must be designed with controller input in mind from day one, not added later.
5. **Mobile support is mandatory** — UI scale, touch targets (minimum 44×44px), and performance targets (60fps) apply on mobile from day one.
6. **No gameplay-breaking microtransactions** — If monetization is ever considered, it must be cosmetics-only.
7. **Chaos Mode is sacred** — Chaos Mode is PHENIX's most original system. No 2.0 change may degrade it.

---

## APPENDIX B — OPEN DESIGN QUESTIONS

The following questions require Maria's decision before implementation begins:

1. Should Phasewalker be a permanent locked character (prestige unlock) or eventually available to all players?
2. Is The Null biome a late-run discovery or a separate game mode?
3. Should PF Fragments be shared across multiple save slots, or per-character?
4. Is there a narrative mode planned, or is PHENIX 2.0 pure gameplay?
5. What is the monetization model, if any? (Affects what goes into PF store vs. free unlock)
6. Is there a planned multiplayer mode for future consideration? (Affects architecture decisions)
7. Should the itch.io build and the GitHub Pages build be identical, or will itch.io have additional features?

---

---

## APPENDIX C — WEAPON VISUAL DESIGN DIRECTIVE

### CRITICAL — NON-NEGOTIABLE

*Added July 2026. This directive supersedes any generic visual guidance elsewhere in this document.*

---

### C.1 The Core Rule

**No weapon in PHENIX: NULL EDEN 2.0 may be a simple geometric shape.**

This is not a preference. It is a hard design constraint. No weapon enters implementation until it passes the Silhouette Test (see C.3).

The following are BANNED as primary weapon visuals:
- Solid or glowing circles
- Squares or rectangles
- Triangles
- Undifferentiated colored blobs
- Generic white/colored lines as "lasers"
- Canvas primitives with only color variation as differentiation

These may be used as secondary or impact VFX elements only — never as the primary weapon identity.

---

### C.2 The Standard

Every weapon must feel like it belongs in a premium commercial game. The benchmark question is:

> *"Does a player, seeing this weapon for the first time, think: that weapon looks amazing — or do they not notice it at all?"*

If the answer is the latter, the weapon is not ready.

**Quality over quantity is absolute law.** Five weapons that pass this standard are worth more than twenty that don't. Releasing a weapon that looks like a programmer placeholder damages the entire game's perceived quality permanently.

---

### C.3 The Silhouette Test

Before any weapon is approved for implementation, it must pass:

**Step 1:** Draw or render the weapon as a pure black silhouette on a white background.  
**Step 2:** Show it to someone who hasn't seen it before.  
**Step 3:** Ask: "What is this?"

If they cannot identify it as a weapon with a specific character — if it looks like a circle, square, or blob — it fails. Redesign before proceeding.

---

### C.4 Per-Weapon Requirements

Every weapon must have all six of the following before it is considered complete:

| Requirement | Description |
|---|---|
| **Unique Concept** | A clear real-world or science-fiction reference that grounds the design. "A railgun with magnetic accelerator rings" not "a fast bullet." |
| **Premium Artwork** | Drawn or generated at reference quality. Internal geometry, material definition, light source. Not a shape with a color gradient. |
| **Distinct Silhouette** | Passes the Silhouette Test (C.3). Immediately identifiable as a black shadow. |
| **Matching VFX** | The in-flight and impact VFX must visually match the weapon's concept. A cryo bolt must shatter like ice, not burst like a circle. |
| **Matching Impact Effects** | Hit reactions on enemies must visually reference the weapon's element and material. A plasma blade leaves a burning cut mark. A void needle leaves a void scar. |
| **Matching Sound Design** | Each weapon needs its own audio identity. A shock whip sounds nothing like a cryo bolt. Both must be immediately identifiable by sound alone. |

---

### C.5 Weapon-Specific Visual Briefs

The following are non-negotiable visual targets for the primary weapons. These are concept directions, not restrictions — the artist may exceed them.

**VOID NEEDLE (Projectile)**
*Concept:* A hyper-velocity acupuncture needle made of crystallized void energy. It is impossibly thin. The tip burns with white-purple light. A void trail lingers behind it in a thin line that warps slightly. It should look like something that would leave a surgical scar on reality.
*What it must NOT look like:* A purple line. A small glowing dot.

**RAIL SPIKE (Projectile)**
*Concept:* A magnetic accelerator round. The projectile itself is a tungsten dart with visible magnetic field distortion rings around it (like ripples in water, but made of electromagnetic force). The muzzle flash is a brilliant white-blue electromagnetic burst — not a circle, but a star-shaped magnetic discharge.
*What it must NOT look like:* A white line. A fast rectangle.

**PLASMA BLADE (Melee)**
*Concept:* A katana-length energy sword. The blade is not a solid bar of light — it has internal structure: a core of white plasma surrounded by layered cyan energy with visible turbulence at the edges. The hilt is a sleek matte-black grip with magnetic emitters. It should read as a weapon, not a glow effect.
*What it must NOT look like:* A glowing rectangle. A colored stick.

**SHOCK WHIP (Melee)**
*Concept:* A segmented electric whip made of chained energy nodes. Each node is a small spherical capacitor; the electric energy arcs between them visibly. When it cracks, a branching lightning arc extends from the tip with a visible shockwave ring at the crack point.
*What it must NOT look like:* A yellow line. A wavy stroke.

**VOID SHARD RING (Orbit)**
*Concept:* Jagged crystal shards of solidified void energy. Each shard has faceted geometry — visible planes, a dark interior with an inner void-glow core. They rotate at different speeds and angles. Up close they should look like broken pieces of a dark gemstone made of anti-matter.
*What it must NOT look like:* Small circles. Colored dots orbiting the player.

**CYBER WOLF (Summon)**
*Concept:* A skeletal chrome wolf with exposed mechanical anatomy. Its bones are titanium alloy. Its musculature is visible fiber-optic cabling in neon cyan. Its eyes are targeting optics — glowing red. It should look like a DARPA weapons program gone wrong. It has personality: it tilts its head before it charges.
*What it must NOT look like:* A simple animal shape. A colored quadruped sprite.

**SENTRY TURRET (Drone)**
*Concept:* A self-deploying military tripod turret. Three splayed legs with magnetic anchoring tips. A rotating barrel with a visible heat sink along the top. Energy cells visible through a translucent housing panel. When deployed, it makes a mechanical click-lock sound and the barrel illuminates.
*What it must NOT look like:* A static circle with a line for a barrel. A triangle.

**GRAVITY ANCHOR (Special)**
*Concept:* A contained micro-singularity in a spherical magnetic cage. The sphere itself is dark — darker than the background — with visible distortion rings warping the environment around it. Cracks of void energy spiral inward. The ground beneath it has fracture lines radiating outward.
*What it must NOT look like:* A black circle. A dark ball.

**NEURAL SEEKER (Homing)**
*Concept:* A microscopic combat drone with four folded wings that extend in flight. Its body is an elongated teardrop with a glowing nose sensor. It spirals slightly as it homes — a visible flight helix trail. When it embeds in an enemy, its wings fold flat and it vibrates with electric charge.
*What it must NOT look like:* A small circle with a trail. A moving dot.

**PLASMA CROWN (Orbit)**
*Concept:* Unstable plasma balls that visually breathe — they expand and contract slightly as they orbit. Their shape is not a perfect circle: they are teardrop-shaped and slightly irregular, with visible surface turbulence. The plasma inside them churns. When they detonate, the explosion has a distinct hexagonal shockwave ring.
*What it must NOT look like:* Static glowing circles. Generic sparkle effects.

---

### C.6 Implementation Priority

Weapons should be implemented in order of player-facing visibility:

1. The first weapon the player receives per character (highest visual impact on first impression)
2. The weapons that appear most frequently in the upgrade pool
3. Melee weapons (the closest to the player; the most scrutinized)
4. Orbit weapons (always visible around the player; constant passive judgment)
5. Drone weapons (visible but further from the player)
6. Mine weapons (placed and forgotten; lower constant visibility)

Do not implement visual placeholders with a plan to "polish later." Placeholders become permanent.

---

### C.7 Reference Aesthetic Targets (Original Work Only)

The following describes the quality level and aesthetic direction without referencing specific games or art to copy:

- **Material quality:** Every weapon should look like it has a definable material — metal, crystal, plasma, void energy. Not "a glowing shape."
- **Weight:** Even energy weapons should have implied weight. The Plasma Blade has inertia when it swings. The Magnetic Claymore moves like it costs something to swing.
- **Light source consistency:** All weapons should have an implied light source. The brightest part of any energy weapon is the core; it falls off toward the edges.
- **Animation personality:** Even in a 2D canvas game, weapons can have personality — a slight rotation, a breathing pulse, a vibration. A static sprite is not a finished weapon.

---

*This directive was added to the GDD on July 1, 2026.*  
*It applies to all weapons past, present, and future in PHENIX: NULL EDEN 2.0.*  
*No weapon enters the codebase without passing Section C.3.*

---

*End of PHENIX: NULL EDEN 2.0 Game Design Document*  
*Version 1.0 — July 2026*  
*Prepared for: InkSpireM Visuals*  
*Status: DRAFT — Pending design approval*
