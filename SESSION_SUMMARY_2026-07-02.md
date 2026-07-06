# PHENIX: NULL EDEN — Session Summary (2 July 2026)

## Project Overview
- **Game**: PHENIX: NULL EDEN — HTML5 Canvas cyberpunk bullet-hell survivors roguelite
- **Live**: https://mariastergiou1985-cpu.github.io/phenix_survivors_game/
- **Repo**: C:\Dev\phenix_survivors_game (GitHub Pages from main branch)
- **Main file**: js/game/Game.js (~18,250+ lines monolith)
- **Module system**: ES modules with cache-bust query strings
- **Current cache-bust**: `?v=20260703600000`
- **Cache-bust chain**: index.html → main.js?v=… → Game.js?v=… → NexusManager.js?v=…

## Git Notes
- `.git/index.lock` EXISTS permanently — ALL git operations MUST go through GitHub Desktop (not CLI)
- CRLF/LF line-ending mismatch between sandbox and Windows causes phantom diffs in ~235 asset files
- Always use targeted staging (check only the files you changed)

## What We Did Today

### 1. NexusManager Module — Committed & Live
- Created `js/game/NexusManager.js` (~517 lines) — manages Nexus stations across biomes
- Each biome gets its own Nexus station with health, reward pulses, buff/debuff system
- Fixed reward orb collection bug: `_updateRewardOrbs` was splicing collected orbs before Game.js could process them. Fixed by only marking `_collected = true`, letting Game.js handle splice + reward.
- Upgraded `js/entities/PowerMatrix.js` — capacity reduced 8→6, added `biomeId` property

### 2. Enemy AI Rework — Committed & Live
Three root-cause fixes applied to Game.js and Enemy.js:

**Fix 1 — Enemy spawn position (Game.js `spawnEnemy()`, line ~3503):**
- Problem: `_spawnEdge()` used WORLD_BOUNDS which is 7680×7680 in Endless mode. Enemies spawned ~3840px away, taking ~38 seconds to reach the player.
- Fix: Override spawn position with `chunkManager.getSpawnEdge(camera, viewW, viewH, 60)` which spawns enemies ~60px offscreen from the camera viewport.

**Fix 2 — Enemy bullet OOB (Game.js `_updateEnemyBullets()`, line ~6401):**
- Problem: Bullets destroyed when `pos.x > WIDTH + 60` (1340px) — but in Endless mode, positions are world-space (up to 7680px). Enemy bullets never reached the player.
- Fix: Changed to camera-relative coordinates with 120px margin.

**Fix 3 — Enemy AI chase behavior (Enemy.js `update()`, lines ~507-543):**
- Problem: Bosses fell through to matrix-seeking behavior. All default/stealer enemies sought matrices instead of the player.
- Fix: Bosses get dedicated chase-player + shoot AI (never seek matrices). Stealers/hybrid/default roles chase the player. Stealers only steal from matrices they happen to pass near (within MATRIX_RADIUS + enemy radius + 4px).

### 3. Cache-Bust Updates
- `20260703500000` → `20260703600000` (index.html, main.js, Game.js import chain)

## PENDING ISSUES — NOT YET FIXED

### Issue A: REMOVE ALL STEALING FROM NEXUS STATIONS
**Priority: HIGH**
- Currently enemies (stealers, hybrids) can still steal cores from PowerMatrix stations when they pass nearby
- The user wants NO enemy to steal from Nexus/PowerMatrix — not bosses, not mini bosses, not stealers, nobody
- The steal mechanic from matrices needs to be completely removed or disabled
- **Where the code is**: `Enemy.js` in the `update()` method, lines ~530-560 (the `else` block after the chase-player logic). Look for `_chooseTargetMatrix()`, `stealTimer`, `MATRIX_RADIUS`, and the stealing behavior
- Also check `Enemy._chooseTargetMatrix()` method and `Enemy._stealFrom()` method
- The `nearMatrix` / `matrixInRange` check and all steal-from-matrix logic should be removed or gated off

### Issue B: MATRICES KEEP DRAINING / CORES NEED MANUAL RETURN
**Priority: HIGH**
- PowerMatrix stations are still losing cores somehow (draining)
- The user has to manually return cores to the matrices
- This may be related to Issue A (enemies stealing) or could be a separate drain mechanic
- **Where to look**: 
  - `NexusManager.js` — `_updateRewardOrbs()`, biome health system, any drain/damage logic
  - `Game.js` — search for `matrix.removeCoreByColor`, `matrix.cores`, any code that removes cores from matrices
  - `PowerMatrix.js` — `removeCoreByColor()`, `removeCoreByIndex()`, any auto-drain

### Issue C: PLAYER STILL SHOWS CARRYING CORES
**Priority: MEDIUM**
- The HUD or visual indicator still shows the player carrying/holding cores
- The user's vision: cores should NOT be carried by the player. Instead:
  - Cores are scattered across ALL maps (not just one), in all biomes
  - When the player walks over a core, it gives a buff/reward (not pickup-and-carry)
  - Rewards should include premium things like a boomerang projectile with multishot
  - Cores should be dispersed/scattered, not clustered in the center
- **Where to look**:
  - `Game.js` — search for `carriedCores`, `playerCores`, core rendering on/near the player
  - HUD drawing code — search for core display near the player character
  - The entire core pickup/carry/return mechanic needs to be redesigned

## FUTURE FEATURE: New Core Economy (User's Vision)
- Cores scattered across ALL biomes/maps, not just one area
- NOT carried by the player — instant buff on pickup
- Premium rewards including new projectile types (boomerang with multishot)
- Cores should be visually dispersed, not all in one spot
- This is a major feature redesign, not a quick fix

## Architecture Reference

### Key Constants
- `WORLD_W=2240, WORLD_H=1260` (Act 1 / base world)
- `CHUNK_SIZE=2560, ACTIVE_GRID=3` → 7680×7680 active area in Endless
- `ENDLESS_VIEW_SCALE = 0.55` → viewW=~2327px, viewH=~1309px
- `WORLD_BOUNDS` is MUTABLE — updated each frame from `ChunkManager.getActiveBounds()`

### Key Files
| File | Role |
|------|------|
| `js/game/Game.js` | Main game loop monolith (~18,250 lines) |
| `js/entities/Enemy.js` | Enemy class with AI, roles, stealing |
| `js/game/NexusManager.js` | Nexus station management per biome |
| `js/entities/PowerMatrix.js` | PowerMatrix (core storage stations) |
| `js/game/ChunkManager.js` | Chunk streaming for Endless mode |
| `js/game/MapManager.js` | Biome backgrounds and rendering |
| `js/constants.js` | Shared constants, Vec2, WORLD_BOUNDS |
| `index.html` | Entry point, cache-bust for main.js |
| `js/main.js` | Bootstrap, cache-bust for Game.js |

### Enemy Roles
- `boss` — chases player aggressively, shoots (NEVER seeks matrices — fixed today)
- `hunter` — chases player
- `assassin` — fast chase
- `shooter` — ranged attacks
- `mixed` — combination
- `hybrid` — shoots + chases (fixed today: no longer seeks matrices first)
- `stealer` — default role, was seeking matrices, now chases player (STILL has nearby-matrix steal code that needs removal per Issue A)

### 6 Biomes
1. Neon District (center)
2. Data Wastes
3. Glacial Expanse
4. Industrial Core
5. Orbital Nexus
6. Abyssal Trench

### 3 Game Modes
- Act 1 (story) — fixed world 2240×1260
- Endless (infinite) — chunk streaming, 7680×7680 active area
- Chaos (arena)

## Communication
- All communication with user in **Greek (Greeklish)**
- User name: Maria / InkSpireM Visuals
- Target: Full 2.0 premium release for Steam and itch.io by end of August 2026
