# DEMO RELEASE CHECKLIST — PHENIX: NULL EDEN

Use this checklist before any public demo push, itch.io update, or press build.

---

## Pre-Release Verification

### Live URL

- [ ] Open `https://mariastergiou1985-cpu.github.io/phenix_survivors_game/` in a fresh incognito / private window
- [ ] Confirm no black screen on load
- [ ] Confirm main menu renders fully (title, nav items, SYSTEM FEED, player profile)
- [ ] Open browser DevTools → Console → confirm **zero errors** (`SyntaxError`, `TypeError`, `404`, etc.)
- [ ] Confirm cache-bust version in Network tab matches latest (`v=20260627310000` or current)

---

## Core Loop Tests

### Main Menu

- [ ] All nav items visible: START GAME · ENDLESS MODE · CHARACTER SELECT · UPGRADES · ACHIEVEMENTS · RELICS · SETTINGS
- [ ] SYSTEM FEED panel active and showing EDEN CORE messages
- [ ] Music playing (or mutable with M key)
- [ ] Player profile panel shows correct level / credits / best run time

### Start Game

- [ ] Start Game launches correctly from selected character
- [ ] Wave 1 enemies spawn
- [ ] Auto-fire active (no click required)
- [ ] SHIFT dash works
- [ ] SPACE ultimate fires
- [ ] Q shield and E EMP respond
- [ ] Power Matrices visible on map
- [ ] Data-Core drop and return mechanic functional
- [ ] Network Overload bar visible and incrementing on damage
- [ ] Score / combo counter visible

### Endless Mode

- [ ] Endless Mode launches without error
- [ ] Timer counting correctly
- [ ] NULL BREACH ARENA triggers at ~5:00
- [ ] Arena boss gauntlet completes and exits correctly
- [ ] Second arena trigger at ~12:00 (if running long enough)

### Achievements Screen

- [ ] Achievements overlay opens (ESC or menu button)
- [ ] BOSS ECHOES section visible with recorded echoes (or empty state if none yet)
- [ ] EDEN MEMORY MILESTONES section visible with correct % and unlocked entries
- [ ] CHAOS LAWS section visible
- [ ] SYSTEM LOGS section visible — locked/unlocked states correct for current EDEN MEMORY %
- [ ] One-time feed messages do not re-fire on repeated opens

### Relics Screen

- [ ] Relics screen opens from main menu
- [ ] All discovered relics display correctly
- [ ] Relic HUD strip appears during a run after relic pickup

### Character Select

- [ ] Character select screen opens
- [ ] All 3 characters selectable
- [ ] Stats, class, and element display correctly per character

### Upgrades

- [ ] Upgrades screen opens
- [ ] Grid Credits balance displayed
- [ ] Upgrades purchasable (if credits available)

---

## Mobile Landscape

- [ ] Open on mobile browser in **landscape** orientation
- [ ] Main menu renders without overflow
- [ ] Touch joystick (left) and action buttons (right) appear during gameplay
- [ ] Gameplay is playable via touch
- [ ] No console errors on mobile DevTools

---

## Assets Capture (Pre-Press)

### Screenshot Recommendations

Use these existing assets as the primary screenshots for itch.io and press:

| Slot | File | Path |
|---|---|---|
| Main screenshot | `press_main_menu.jpg` | `assets/press/press_main_menu.jpg` |
| Gameplay screenshot | `press_gameplay_endless.jpg` | `assets/press/press_gameplay_endless.jpg` |
| Character select | `press_character_select.jpg` | `assets/press/press_character_select.jpg` |

Additional in-repo assets worth capturing for future screenshots:

| Asset | Path | Suggested use |
|---|---|---|
| NULL BREACH ARENA banner | `assets/ui/NULL BREACH ARENA.png` | Arena / boss section |
| EDEN CORE portrait | `assets/ui/eden_core_portrait.png` | Narrative / EDEN CORE section |
| CHAOS mode banner | `assets/ui/CHAOS_mode.png` | Chaos mode / endgame teaser |
| New main menu theme | `assets/ui/new_main_menu_theme/phenix_null_eden_main_menu.png` | Alternate main menu shot |
| New element VFX (blender) | `assets/elements/blender/*.png` | VFX / ability showcase |

- [ ] Primary press screenshots reviewed and up to date
- [ ] At minimum 3 screenshots captured for itch.io page

### Gameplay Video

- [ ] Capture a short gameplay clip (60–90 seconds minimum)
- [ ] Recommended: show main menu → character select → 2–3 minutes of gameplay → boss encounter → achievements screen
- [ ] No black screen, no console errors visible in recording
- [ ] Upload as itch.io cover video or YouTube embed

---

## Credits Verification

- [ ] **Game / Direction / Visuals / Implementation**: Maria Papananou — InkSpireM Visuals
- [ ] **Music / Orchestration**: Georgios Litsas
- [ ] Credits visible in press.html and itch.io page
- [ ] `press.html` link active: `https://mariastergiou1985-cpu.github.io/phenix_survivors_game/press.html`

---

## Final Safety Checks

- [ ] `google6cc437e1b1fb96f7.html` present and unmodified (Google Search Console verification)
- [ ] No black screen on any browser (Chrome, Firefox, Edge)
- [ ] Console errors = 0
- [ ] Cache-bust version in `index.html` matches `js/main.js` import
- [ ] Commit pushed to `origin/main` and GitHub Pages deployment complete (allow ~2 minutes post-push)

---

## Sign-off

| Check | Status |
|---|---|
| Live URL loads clean | ☐ |
| Console errors = 0 | ☐ |
| Mobile landscape OK | ☐ |
| Screenshots captured | ☐ |
| Credits verified | ☐ |
| Press page live | ☐ |

**Signed off by:** _______________  
**Date:** _______________
