# PHENIX: NULL EDEN — Visual Asset Production Plan
## Status: IN PROGRESS — static shots captured, gameplay shots pending Maria

---

## STEP 1 — MOVE CAPTURED SCREENSHOTS INTO PROJECT

Run this bat file to move the downloaded PNGs into the right folder:

```
C:\Dev\phenix_survivors_game\_move_screenshots.bat
```

Screenshots were downloaded to your browser's default Downloads folder.
The bat script moves them to:
`C:\Dev\phenix_survivors_game\release_store_package\screenshots_raw\`

---

## CAPTURED SCREENSHOTS (Claude — done)

| Shot | Filename | Status | Notes |
|------|----------|--------|-------|
| SHOT 01 | `screenshot_01_main_menu.png` | ✅ CAPTURED | Premium main menu — title, character art, all panels, neon aesthetic |
| SHOT 02 | `screenshot_02_character_select.png` | ✅ CAPTURED | Full roster, Phasewalker COMING SOON clearly visible, CSW selected |
| SHOT 05 | `screenshot_05_progression_screen.png` | ✅ CAPTURED | GRID UPGRADES — all 11 upgrades MAX'd, 726 Credits visible |
| BONUS | `screenshot_05b_protocols.png` | ✅ CAPTURED | PROTOCOLS tab — 12 unlocked protocols + Frozen Sleet Storm COMING SOON |
| BONUS | `screenshot_05c_relics.png` | ✅ CAPTURED | NULL RELICS — 9+ relics OWNED, 51 Fragments, 4 category tabs |

---

## GAMEPLAY SHOTS — REQUIRES MARIA MANUAL CAPTURE

These require active gameplay. Use Chrome DevTools → Ctrl+Shift+I, then run in Console:

```javascript
// Capture current canvas to Downloads as PNG:
(function(name) {
  const c = document.getElementById('game');
  const a = document.createElement('a');
  a.download = name + '.png';
  a.href = c.toDataURL('image/png');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
})('screenshot_NAME_here');
```

Replace `screenshot_NAME_here` with the correct filename below.

---

### SHOT 03 — Act 1 Combat
**Filename:** `screenshot_03_act1_combat`
**When to capture:** 3–5 minutes into a normal START GAME run. Medium enemy density, player mid-attack, HUD visible (health bar + XP bar + timer).
**Must show:** Dense enemies, active projectiles/effects, player character in frame.
**Must NOT show:** Nearly-dead player, empty screen, upgrade overlay.

---

### SHOT 04 — Upgrade Card Selection
**Filename:** `screenshot_04_upgrade_selection`
**When to capture:** When the level-up card selection overlay appears during any run.
**Must show:** 3 upgrade cards with icons and names, gameplay visible behind.
**Must NOT show:** Empty/broken card text, debug upgrades.

---

### SHOT 06 — Boss Fight
**Filename:** `screenshot_06_boss_fight`
**When to capture:** Any boss encounter at 50–70% boss HP. Boss health bar visible, player actively fighting.
**Must show:** Boss on screen, boss HP bar or name, projectiles/effects.
**Must NOT show:** Boss already dead, player critically low HP, empty arena.

---

### SHOT 07 — Walker Ally Moment
**Filename:** `screenshot_07_walker_ally`
**When to capture:** Any Walker NPC appearance during Endless or normal run.
**Must show:** Walker visible on screen. Ideally a dialogue/interaction moment.
**Must NOT show:** Walker in broken/invisible state.

---

### SHOT 08 — Chaos Mode Combat
**Filename:** `screenshot_08_chaos_combat`
**When to capture:** 2–5 minutes into Chaos Mode (activates at 21:00 in Act 1 run or via CHAOS MODE menu). Wait for dense enemy waves.
**Must show:** Chaos UI indicator visible, intensified enemy density, player in combat.
**Must NOT show:** Pre-Chaos gameplay, sparse enemies.
**IMPORTANT:** Confirm "CHAOS MODE" or ⚡ indicator is visible in HUD.

---

### SHOT 09 — Chaos Law Selection Overlay
**Filename:** `screenshot_09_chaos_law_overlay`
**When to capture:** The overlay that appears before entering Chaos Mode showing law selection.
**Must show:** At least one active/selectable law, COMING SOON laws visible but greyed/locked.
**Must NOT show:** COMING SOON law highlighted as selectable (verify this is fixed).

---

### SHOT 10 — Chaos Survival Rank Results
**Filename:** `screenshot_10_chaos_rank_result`
**When to capture:** Die in Chaos Mode after 20+ minutes. Target GOLD (20:00+) or PLATINUM (30:00+).
**Must show:** Chaos Survival Rank badge clearly readable (GOLD or PLATINUM preferred), time in Chaos visible, run stats.
**Must NOT show:** BRONZE rank if possible.
**Tip:** Start a CHAOS MODE run and survive as long as possible. Use best character.

---

### SHOT 11 — Mobile / Touch Gameplay
**Filename:** `screenshot_11_mobile_touch`
**When to capture:** Open the live URL on a real mobile phone or use Chrome DevTools device emulation (F12 → Toggle device toolbar → choose a phone size → landscape). Play for 2–3 minutes.
**Must show:** Virtual joystick (bottom left), action buttons (bottom right), canvas properly fitted, gameplay in progress.
**Must NOT show:** Portrait mode, cut-off canvas.
**Capture method on mobile:** Use the phone's screenshot button while game is running.
**Capture method in DevTools emulation:** Run the canvas capture JS in console.

---

### SHOT 12 — Controller Gameplay Moment
**Filename:** `screenshot_12_controller_gameplay`
**When to capture:** Connect controller and play normally. Best moments: pause screen with controller hints, or the results/death screen while using controller (shows controller-friendly navigation).
**Must show:** Strong gameplay or results moment. Optional controller input hints visible.
**Must NOT show:** Keyboard-only UI that contradicts controller support.

---

## OPTIONAL BONUS SHOTS

| Filename | Description |
|----------|-------------|
| `screenshot_bonus_wave_density.png` | Most extreme enemy density — player surrounded, projectiles everywhere |
| `screenshot_bonus_endless_record.png` | Endless results screen showing personal record stats |
| `screenshot_bonus_ultimate.png` | Oni or CSW ultimate at full visual effect |

---

## PRODUCTION PRIORITY ORDER

For itch.io launch you need minimum 5. Recommended order to capture:

1. ✅ SHOT 01 — Main menu (done)
2. ✅ SHOT 02 — Character select (done)
3. 🎮 SHOT 08 — Chaos Mode combat (highest visual impact)
4. 🎮 SHOT 06 — Boss fight
5. 🎮 SHOT 10 — Chaos Survival Rank result (GOLD/PLATINUM)
6. 🎮 SHOT 03 — Act 1 combat
7. 🎮 SHOT 04 — Upgrade selection
8. ✅ SHOT 05 — Progression/relics (done)
9. 🎮 SHOT 09 — Chaos Law overlay
10. 🎮 SHOT 11 — Mobile touch
11. 🎮 SHOT 07 — Walker moment
12. 🎮 SHOT 12 — Controller

**Minimum viable for itch.io launch:** SHOT 01 + SHOT 02 + SHOT 08 + SHOT 06 + any 1 more = 5 screenshots.

---

## AFTER CAPTURING — RECOMMENDED FILENAMES

Place all files in: `C:\Dev\phenix_survivors_game\release_store_package\screenshots_raw\`

Final filenames:
```
screenshot_01_main_menu.png
screenshot_02_character_select.png
screenshot_03_act1_combat.png
screenshot_04_upgrade_selection.png
screenshot_05_progression_screen.png
screenshot_06_boss_fight.png
screenshot_07_walker_ally.png
screenshot_08_chaos_combat.png
screenshot_09_chaos_law_overlay.png
screenshot_10_chaos_rank_result.png
screenshot_11_mobile_touch.png
screenshot_12_controller_gameplay.png
```

---

## UPCOMING ASSET PRODUCTION (Maria to produce)

### itch.io Cover Image (630×500px)
Use one of:
- Crop from main menu screenshot (1280×720 → crop centre 630×500)
- Photoshop composite: dark grid BG + character art + PHENIX: NULL EDEN title

**Brand colours:** Background #04060C · Magenta #FF2D95 · Cyan #2EE6F6 · Gold #FFD700

### Steam Header Capsule (920×430px)
Dark background, PHENIX: NULL EDEN title prominent, character silhouette, neon glow. No text overlays on Steam screenshots.

### Steam Library Capsule (600×900px)
Portrait format. Title at top, character art centred, dark grid background.

### Steam Library Hero (3840×1240px)
Wide banner. Safe area = 860×380px centre. Full cyber-neon atmosphere.

### Trailer (45–60s)
See `TRAILER_SCRIPT.md` for full shot-by-shot script.

---

## LIVE BUILD REFERENCE

| Item | Value |
|------|-------|
| Live URL | https://mariastergiou1985-cpu.github.io/phenix_survivors_game/?v=20260630600000 |
| Canvas natural size | 1280×720px |
| Console capture snippet | See GAMEPLAY SHOTS section above |
| Screenshots folder | `release_store_package/screenshots_raw/` |
