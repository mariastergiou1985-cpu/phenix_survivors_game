# DEMO FEATURES — PHENIX: NULL EDEN

Current state of all systems in the active demo build.

---

## Core Gameplay

- **Objective-based survival**: Protect Power Matrices, recover and return Data-Cores, prevent Network Overload from reaching 100%
- **Auto-fire**: All characters fire automatically — movement and ability use are the primary skill expression
- **Dash** (SHIFT): Short burst dash with brief cooldown — essential for repositioning
- **Ultimate** (SPACE): Character-specific special move — Thunder Solo, Overheated Chains, Spirit Dojang
- **Pulse Shield** (Q): Temporary barrier
- **EMP Cloud** (E): Short-range stun burst
- **Aim Assist** (T): Toggleable projectile tracking toward nearest enemy
- **Combo system**: Multi-hit kills build a combo multiplier for score
- **Grid Cache supply drops**: Mid-run supply events with a blinking arrow indicator
- **Acid Rain** weather event: Environmental hazard that appears during runs
- **Score / High Score tracking**: Per-session and persistent personal records

---

## Characters (3 Playable)

| Character | Class | Element | Weapon |
|---|---|---|---|
| Cyber Skeleton Warrior | Tank / Survival | ⚡ Electric | Storm Saber |
| Neon Taekwondo Girl | Agility / Strike | Element-variable | Kick combo |
| Cyber Arm Hero | Power / Range | Element-variable | Arm Cannon |

Each character has distinct base stats, auto-fire patterns, cooldowns, and a unique Ultimate.

---

## Progression

### Grid Credits
- Earned at the end of every run based on performance
- Spent in the permanent **Upgrades** menu between runs
- Unlock stat upgrades, ability improvements, and new starting options

### EDEN MEMORY
- A persistent percentage that accumulates across all runs
- Grows based on run performance, bosses defeated, and milestones cleared
- Unlocks content, archive entries, passive bonuses, and lore at specific thresholds (0%, 10%, 25%, 50%, 75%, 100%)

### Boss Echo Archive
- Each unique boss defeated for the first time is permanently recorded
- The Archive displays boss encounter data and visual echo entries
- **Boss Echo Passive Bonuses**: accumulated echoes apply small permanent stat bonuses across all future runs (HP, damage, speed, cooldown reductions — by boss type)

### Eden Memory Milestones
- Named progression thresholds tracked in the Achievements screen
- Each milestone unlocks a named archive entry and one-time EDEN CORE feed message

---

## EDEN CORE Systems

### Portrait Transmission
- An AI portrait (EDEN CORE) appears on-screen and reacts to in-run events
- Dynamic expression states: neutral, warning, distress, scan
- Activates on boss spawns, arena events, network overload escalation, and special triggers

### In-Run Transmissions
- EDEN CORE delivers in-run messages via a scrolling feed (SYSTEM FEED panel in main menu / HUD)
- Messages are contextual: first contact, boss warnings, arena detection, milestone unlocks, lore fragments
- One-time messages fire only once per save (stored persistently via `systemLogsSeen` / `edenMilestonesSeen`)

---

## NULL BREACH ARENA

- Triggered in **Endless Mode** at the 5:00 and 12:00 marks
- A sealed arena gauntlet: waves of bosses and elites in sequence
- The arena escalates with each activation — more bosses, compressed timing
- EDEN CORE transmissions fire on arena entry and exit
- Boss Echoes are recorded from arena kills

---

## Boss Encounters

| Boss | Trigger | Notes |
|---|---|---|
| AI Overload Titan | ~8:00 main run | Primary boss, phased escalation |
| Matrix Annihilator | ~4:00 main run | Targets and drains Power Matrices directly |
| Bloodfang Packmaster | ~10:00 main run | Cyber-beast leader + 3 Razorhound pack, bite/lunge stagger |
| NULL BREACH ARENA | Endless 5:00 / 12:00 | Boss gauntlet; multiple consecutive bosses |

All bosses drop Grid Credits on defeat and record to the Boss Echo Archive.

---

## Relics

- 13 relic artifacts available in the current build (10 standard + 3 arena-specific)
- Relics are acquired mid-run and persist for the duration of that run
- Each relic has a unique passive or triggered effect (e.g., dash empowerment, shield interaction, HP recovery, damage amplification)
- **Arena-specific relics** unlock exclusively through NULL BREACH ARENA performance:
  - **Breach Crown** — clean arena clear (no rescue): +0.5 Pulse Damage for the run
  - **Second Signal Debt** — if rescued by EDEN CORE: gain a 6-second protective shield on extraction
  - **Elite Signal Core** — 3+ boss kills in arena: bonus score at arena completion
- Relics are displayed in a polished cyber HUD strip (top-left, 8 glowing slots with type-colored borders) during gameplay
- The **RELICS** screen in the main menu shows all discovered relics across CHARACTER, BOSS, and ARENA tabs

---

## Chaos Laws Preview

- Visible in the **Achievements** overlay under the Chaos Laws section
- Represents the deep instability rules of the Grid
- Current build shows a preview of the Chaos Law framework — full selection and activation system planned for a future update

---

## System Logs / Lore Archive

- Located in the **Achievements** overlay (System Logs section)
- 6 lore fragments unlock progressively with EDEN MEMORY growth:
  - LOG 01 — unlocks immediately (0% memory)
  - LOG 02 — 10% · LOG 03 — 25% · LOG 04 — 50% · LOG 05 — 75% · LOG 06 — 100%
- Locked entries display required threshold; unlocked entries show full lore text
- One-time EDEN CORE feed messages fire on each log unlock

---

## Controls / Platform

- **Browser-based**: No download, no install — Chrome / Firefox / Edge
- **Keyboard**: Full support (WASD / Arrow Keys + ability keys)
- **Controller**: Xbox · PlayStation · PC — gameplay and core navigation
- **Mobile**: Touch controls in landscape orientati