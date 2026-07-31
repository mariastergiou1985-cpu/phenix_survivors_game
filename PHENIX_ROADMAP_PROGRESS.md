# PHENIX: NULL EDEN — Κοινός Οδικός Χάρτης & Πρόοδος (30h depth)

## ⚠️ ΜΟΝΙΜΟΣ ΚΑΝΟΝΑΣ ART (Maria, 8/7) — ΙΣΧΥΕΙ ΠΑΝΤΑ
- Σε ΟΤΙΔΗΠΟΤΕ (όπλα, effects, fusions, elements, ultimates, evolutions) μπαίνει **ΜΟΝΟ η art της Maria**.
- **ΜΟΝΟ διορθώσεις επιτρέπονται** (alpha fix, σύνδεση/wiring, μέγεθος) — **ΟΧΙ αντικατάσταση** με generated/procedural art.
- Αν κάπου παίζει procedural effect ενώ υπάρχει art της Maria → σύνδεσε την art της. Αν ΔΕΝ υπάρχει art → ΡΩΤΑ την, μη βάζεις generated.
- Το dev pipeline πρέπει να ελέγχει κάθε φορά ότι χρησιμοποιείται η δική της art, όχι placeholder/procedural.


*Αυτό είναι το κοινό μας tracker. Ξαναδιαβάζεται σε κάθε session και θυμίζει πού πάμε.
Στόχος: από «6ωρο indie» → «30ωρο survivor-like με δική του ταυτότητα».*

Τελευταία ενημέρωση: 2026-07-16 (fable — P2 BUILD ENGINE ΠΑΡΑΔΟΘΗΚΕ)

## ✅ P2 BUILD ENGINE — ΟΛΟΚΛΗΡΩΘΗΚΕ & LIVE (2026-07-16, 17 commits)
Spec: docs/P2_BUILD_ENGINE_SPEC_GR.md · Πλάνο: docs/P2_IMPLEMENTATION_PLAN.md
- **25 όπλα** (2 native x10 χαρακτήρες + 5 universal) — όλα procedural όπως τα ultimates,
  VFX PASS σε πλήρη χορογραφία, executor registry, single data source (§13)
- **50 passives** (25 evolution catalysts + 25 build-changers §26-50 με hooks/ICD/caps)
- **25 evolutions** (be_*) — owner-gated, guaranteed κάρτα όταν έτοιμο, discovery tracking
- **Loadout caps** 6W/6P, family limit 2, **Banish/Seal** (πλήκτρο B + κουμπί ⛔)
- **NULL ARSENAL** menu: 7 tabs (Characters dossier/Weapons/Passives/Evolutions/
  Tacticals/Elements/Fusions), Evolution Path + locked silhouettes, SINGLE-TARGET DPS labels
- **Pause CURRENT BUILD** panel + **Results DAMAGE REPORT** + **telemetry** (localStorage
  phenix_be_telemetry, 20 τελευταία runs) για το balancing
- **P2.7 SOFT MIGRATION**: default ΟΝ για όλους (opt-out: F9 ή ?p2=0) — το παλιό σύστημα
  παραμένει ως δίχτυ ασφαλείας
- Guardrail: Quantum Roulette stacking cap 4 (ήταν 3-10x πάνω από όλα)
- **Εκκρεμεί (πλήρες migration, μετά feel sign-off + telemetry):** απόσυρση old-gen
  evolutions, ενοποίηση be_ ονομάτων, 2T/1R/1A caps, ενιαίο data source στα 3 τελευταία tabs
- Σημ.: το procedural art του P2 είναι ΡΗΤΗ εντολή του spec της Maria (2026-07-16,
  «όπως οι ultimates, κανένα PNG») — δεν αντικαταστάθηκε πουθενά δική της art.

## Πού πάμε (τα 4 μεγάλα levers)
1. Evolutions 4 → 12–14  ← **ξεκινάμε ΕΔΩ**
2. Biomes → 3–5 selectable stages
3. Enemy signatures ξεκλείδωτα στο Act 1
4. Unlock ladder + Steam achievements + wishlist page

---

## MILESTONE 1 — Πρώτα Evolutions (art-first)
**Ρόλος Maria: σχεδιάζει και φτιάχνει το art. Ρόλος dev pipeline: το wire-άρει στο παιχνίδι (safe workflow: syntax check → boot → commit → push → live verify).**

Convention: κάθε evolution = ΕΝΑ διάφανο PNG στο `assets/weapons/vfx/{name}.png`
Specs: ~512×512 (ή μεγαλύτερο), διάφανο background, neon cyberpunk glow, χρώμα του element.

### Art batch #1 (ΕΤΟΙΜΟ ✅ — art παραδόθηκε + alpha-fixed στο pipeline)
- [x] `assets/weapons/vfx/grid_reaper.png` — **Grid Reaper** (πράσινο lattice crescent) ✅ RGBA
- [x] `assets/weapons/vfx/cryo_sovereign.png` — **Cryo Sovereign** (γαλάζιο ice field) ✅ RGBA
- [x] `assets/weapons/vfx/chaos_chord.png` — **Chaos Chord (Eddie)** (χρυσές νότες+αστραπές) ✅ RGBA
Σημ.: τα originals ήταν RGB χωρίς διαφάνεια (λευκό/σκούρο φόντο)· το pipeline πρόσθεσε alpha (keying) χωρίς να αλλάξει το art.

### Wiring plan (dev pipeline — επόμενο focused task, με live test)
Το σύστημα evolutions είναι «όπλο+όπλο σε L5 → evolved», hard char-lock. Χρειάζεται μικρό owner-override για exclusivity.
- **Chaos Chord** → Eddie evolution (γεμίζει κενό: ο Eddie ΔΕΝ έχει evolution τώρα). Recipe: solo_red_thunder + owner-override='eddie'. Behavior: BOLT_PROJECTILE→homing notes. Element: thunder_maiden.
- **Grid Reaper** → toxin evolution. Recipe: shadow_toxic + gas_needle (owners: assassin+euclid). Behavior: WIDE_ARC (line reap). Element: toxin.
- **Cryo Sovereign** → ice evolution. Recipe: spirit_crescent + (ice base). Behavior: PULL_EXPLODE/VORTEX (freeze-shatter). Element: ice.
Κάθε ένα: 1-frame sprite (το art είναι ενιαίο image, όχι spritesheet) → static render, δείχνει όλο το art.

### Art batch #2 (ΕΤΟΙΜΟ ✅ — art παραδόθηκε + alpha-fixed στο pipeline)
- [x] `assets/weapons/vfx/ion_halo.png` — **Ion Halo** (μπλε ηλεκτρικό δαχτυλίδι) ✅ RGBA
- [x] `assets/weapons/vfx/null_lance.png` — **Null Lance** (μωβ/λευκό void δόρυ + black hole) ✅ RGBA
- [x] `assets/weapons/vfx/ember_storm.png` — **Ember Storm** (πορτοκαλί δίνη στάχτης) ✅ RGBA
Και τα 6 art evolutions είναι πλέον στον φάκελο, alpha-fixed. Επόμενο: wiring στο gameplay.

### Wiring (dev pipeline) — ΕΤΟΙΜΟ ✅
- [x] Και τα 6 evolutions wired (WEAPON_ID + WEAPON_DEFS + recipes + owner-override + name lookups) → commit `9e2d509` → live verified
  - Chaos Chord → Eddie (γέμισε το κενό του!), Grid Reaper → Euclid, Cryo Sovereign → Taekwondo, Ion Halo → Cyber, Null Lance → Phasewalker, Ember Storm → Oni
  - Deployed: 6 νέα weapons + 10 recipes + owner field· boot καθαρό, καμία μαύρη οθόνη. Cache-bust 20260707110000.
- [ ] ΕΚΚΡΕΜΕΙ playtest από Maria: κάθε evolution εμφανίζεται όταν ο σωστός χαρακτήρας φτάσει L5 στα 2 ingredient όπλα (ζωντανό in-run trigger — δεν επιβεβαιώνεται με static test).

**Στόχος Milestone 1:** evolutions 4 → 10 ✅ ΕΠΙΤΕΥΧΘΗΚΕ (στον κώδικα).

---

## OPEN ITEMS (από Maria, 7/7 βράδυ) — για αύριο
- [ ] **Art batch #3** — 3 evolutions για τους χαρακτήρες που έχουν μόνο 1 (Skeleton/Assassin/Brawler):
  - `assets/weapons/vfx/bonecircuit_storm.png` — Skeleton (electric bone spiral· #7fd0ff/#e8e4d0/#b06bff). Recipe: Storm Saber + Nexus Chakram. Behavior: EXPANDING_SPIRAL.
  - `assets/weapons/vfx/venom_shroud.png` — Assassin (toxic phantom blades· #7CFF4D/#2a1040/#b6ff3a). Recipe: Shadow Toxic + Glitch Tear. Behavior: LINE_CLOUD.
  - `assets/weapons/vfx/seismic_rift.png` — Brawler (kinetic shockwave· #ffb347/#ff2d95/λευκό). Recipe: Nexus Chakram + Cataclysm Pulse. Behavior: GROUND_SHOCKWAVE.
- [ ] **ELEMENT cards UI polish** — η Maria λέει «δεν είναι ωραία» (screenshot: element selection cards με shield/target icons, 100%). Βρες πού σχεδιάζονται (element/fusion selection) και κάν' τα πιο premium/cyber.
- [x] **Purple-square lightning VFX — ΔΙΟΡΘΩΘΗΚΕ** (commit 48b2a0a). Ρίζα: τα `crimson_gate_element.png` + `thunder_maiden_element.png` είχαν ΑΔΙΑΦΑΝΕΣ ΜΑΥΡΟ φόντο → έβγαιναν ως σκούρο/μωβ τετράγωνο (in-world icon + element panel). Keyed το μαύρο σε διάφανο, effect άθικτο. ΣΗΜ: τα assets φορτώνουν χωρίς ?v → θέλει hard refresh (Ctrl+Shift+R) για να φανεί άμεσα. (Πιθανόν διορθώνει και το «element cards δεν είναι ωραία».)
- [ ] **Evolution discoverability** — η κάρτα evolution βγαίνει μόνο όταν 2 όπλα είναι L5 (RNG για το 2ο όπλο). Σκέψου: hint στο HUD «X + Y → EVOLVE», ή/και πιο εύκολο 2ο ingredient. (Λογική/reachability επιβεβαιωμένη — ΟΧΙ bug.)

## MILESTONE 2 — Selectable Stages (ΕΝΕΡΓΟ)
Εύρημα: οι 6 biomes ΥΠΑΡΧΟΥΝ ήδη πλήρεις στο MapManager (BIOME_DEFS: map εικόνα, palette,
hazards, enemyModifiers, music). Στο Act 1 δεν χρησιμοποιούνται — παίζει σταθερό bg. Άρα το
feature = «ξεκλείδωμα» υπάρχοντος περιεχομένου, ΟΧΙ δημιουργία από το μηδέν.

### Slice A — Stage Select MVP (ΧΩΡΙΣ νέο art, ασφαλές πρώτο βήμα)
- [x] **ΟΛΟΚΛΗΡΩΘΗΚΕ 2026-07-30** — `this.runBiome` (default neon_district), τίθεται στην αρχή του Act 1 run.
  `Game.STAGE_RING` = οι 6 επιλέξιμοι biomes· το `the_null` είναι ρητά ΕΞΩ (endgame biome, όχι stage του ring).
  `setRunBiome(id)` δέχεται μόνο πραγματικό ring biome (απορρίπτει `the_null`, άγνωστα ids, null/undefined).
  `_stageOrder()` περιστρέφει το ring ώστε το επιλεγμένο biome να είναι το Stage 1 — με το default επιστρέφει
  **ακριβώς την παλιά σειρά**, οπότε ένα run χωρίς επιλογή είναι αμετάβλητο. `_applyRunBiome()` καλείται στο
  `selectCharacter` μετά το `reset()` και ΠΡΙΝ το `_applyCampaignStage()`, ώστε το campaign να εξακολουθεί να
  υπερισχύει· οπλίζει τον stage rule από το πρώτο frame και αλλάζει το fixed background στον χάρτη του biome.
  Το `runBiome` επιβιώνει του `reset()` — είναι run setting όπως το `selectedCharacter`, όχι run state.
  Μετρημένο: επιλογή `orbital_nexus` → `orbital_nexus → abyssal_trench → glacial_expanse → data_wastes →
  neon_district → industrial_core`, και τα 6 stages ακριβώς μία φορά, καθένα με τον δικό του κανόνα.
  QA: `tools/qa/batch4_stage_rules_regression.mjs` 83 PASS / 0 FAIL.
- [x] **ΟΛΟΚΛΗΡΩΘΗΚΕ 2026-07-30** — Stage-Select overlay από το μενού (6 biomes με name/description από `BIOME_DEFS`).
  Νέα είσοδος `SELECT STAGE` στο κεντρικό menu· το panel LOADOUT δείχνει `Starting Stage: <name>` και ενημερώνεται
  αμέσως μετά το CONFIRM (μετρημένο live: `Neon District` → `Glacial Expanse`). Ίδιο DOM-overlay pattern με το
  `_showCampaignOverlay()`, νέο state `stage_select` με canvas fallback `_drawStageSelect`.
  Κάθε κάρτα δείχνει όνομα, περιγραφή, badge STAGE 1 στην επιλεγμένη, και τα modifiers ENEMY SPEED / ENEMY HP /
  REGEN — **όλα διαβασμένα από τα `BIOME_DEFS` στο render**, τίποτα δεν είναι γραμμένο στο UI.
  Input: mouse click, ◀ ▶ ▲ ▼ (3-στηλο grid, wrap σε κάθε άκρη), ENTER = confirm, ESC/BACKSPACE = cancel.
  CONFIRM καλεί το πραγματικό `setRunBiome(id)`· CANCEL/ESC δεν αλλάζει τίποτα· άκυρος cursor πέφτει σε
  `neon_district`. Το `the_null` δεν έχει index στο ring και ένα forced `the_null` επιδιορθώνεται στο run start.
  Ένας μόνο delegated listener, δεμένος μία φορά στο build — 8 open/close στον browser κρατούν το ΙΔΙΟ element
  και ένα μόνο `#cgm-stagesel` node. Hostile card με `data-idx="99"` αγνοείται.
  QA: `tools/qa/batch4_stage_rules_regression.mjs` 111 PASS / 0 FAIL + πραγματικό Chromium flow.
- [x] **ΟΛΟΚΛΗΡΩΘΗΚΕ 2026-07-31** — Legacy background draw: `mapManager.getBiomeImage(runBiome)` + palette/fog αντί σταθερού bg.
  Το εύρημα: το `_drawBackground()` ήταν σκληρά κωδικοποιημένο — `DARK_BG` base fill, ίδιο `rgba(0,0,0,0.38)` wash
  και ίδιο `GRID_LINE` σε **κάθε** stage, οπότε η μόνη διαφορά ανάμεσα στα 6 stages ήταν η εικόνα από κάτω.
  Οι `palette` και `fogColor` των `BIOME_DEFS` δεν διαβάζονταν πουθενά στο fixed-map path.
  Η υλοποίηση: `Game._activeVisualBiome()` (πηγή αλήθειας = `_stageBiome`, `null` όταν τρέχει streaming ώστε οι
  Endless/Chaos χάρτες να κρατούν το legacy look) και `Game._biomeVisual()` που παράγει `{id, base, grid, ambient, fog}`
  από τα `BIOME_DEFS` και το **cache-άρει** σε `_bvCacheId` — ένα object ανά stage, ξαναχτίζεται ακριβώς μία φορά
  σε αλλαγή stage, μηδέν κόστος ανά frame. Το `_drawBackground` παίρνει base fill από το `palette.bg`, ambient wash
  με **cap 0.22** + το authored `fogColor` (max 0.20), και ο grid fallback χρωματίζεται με το `palette.grid`.
  ΑΝΑΓΝΩΣΙΜΟΤΗΤΑ: χειρότερη περίπτωση ≈0.38 = **ακριβώς** η παλιά επίπεδη τιμή· κανένα stage δεν είναι πιο σκοτεινό
  από πριν, πέντε είναι πιο φωτεινά. Το `gridBlackoutActive` κρατά το 0.65 του event αναλλοίωτο.
  Μετρημένο σε πραγματικό Chromium (1280×720, δείγματα @200,400 και @950,620), και τα 6 με τη δική τους εικόνα
  φορτωμένη: neon `21,16,63` · industrial `42,12,6` · orbital `0,17,47` · abyssal `28,97,128` · glacial `33,56,79` ·
  data_wastes `37,43,45` — **6 διακριτά pixel signatures, 6 διακριτές εικόνες**, palette+fog ταυτίζονται 1:1 με τα
  `BIOME_DEFS`. Καμία νέα εικόνα, κανένα PNG δεν άλλαξε.
- [x] **ΟΛΟΚΛΗΡΩΘΗΚΕ 2026-07-30** — Εφαρμογή `enemyModifiers` (speedMult/hpMult) του biome = το «rule» του stage.
  Το εύρημα: τα `BIOME_DEFS.enemyModifiers` διαβάζονταν σε ΕΝΑ σημείο, μέσα στο `spawnEnemy`, και μόνο όταν
  `chunkManager.enabled` — δηλαδή μόνο στους streaming χάρτες (Endless/Chaos). Το Act 1 και το Campaign παίζουν
  σε ΣΤΑΘΕΡΟ χάρτη με streaming OFF, οπότε το `_stageSpeedMult` γραφόταν σε δύο σημεία και **δεν το διάβαζε κανείς**,
  το `hpMult` δεν εφαρμοζόταν ποτέ, και το `regenRate: 0.5` του abyssal_trench δεν έκανε τίποτα. Και τα 6 stages
  του Act 1 και τα 7 του Campaign έπαιζαν με **πανομοιότυπους** εχθρούς πίσω από διαφορετική εικόνα.
  Η υλοποίηση: `Game._setStageRule(biomeId)` παράγει τον κανόνα σε ένα σημείο, `Game._applyStageRule(e)` τον
  εφαρμόζει σε ένα σημείο (μία φορά ανά spawn, όχι σε bosses/mega bosses, no-op όσο τρέχει streaming ώστε να μην
  υπάρξει διπλή εφαρμογή). Καμία τιμή balance δεν άλλαξε — είναι τα νούμερα της Maria στο `BIOME_DEFS`.
  Μετρημένο (Glitch Drone, ίδιο production spawn path): neon 2.99hp/95sp · industrial 4hp/80.8sp ·
  orbital 3hp/104.5sp · abyssal 4hp/85.5sp (+0.5 regen) · glacial 4hp/76sp · data_wastes 4hp/85.5sp.
  QA: `tools/qa/batch4_stage_rules_regression.mjs` 63 PASS / 0 FAIL.
- [x] **ΟΛΟΚΛΗΡΩΘΗΚΕ 2026-07-31** — Unlock ladder: το Neon District πάντα ανοιχτό, τα υπόλοιπα 5 με campaign νίκες.
  **ΚΑΝΕΝΑ ΝΕΟ SAVE FIELD.** Η κανονική σκάλα υπάρχει ήδη: `MetaProgress.stagesCleared` με
  `isStageUnlocked(n) => n <= stagesCleared + 1`, και τα `CAMPAIGN_STAGES` αντιστοιχούν ήδη το stage N σε biome
  **ακριβώς με τη σειρά του ring**. Άρα η θέση i στο ring ξεκλειδώνει με το campaign stage i+1:
  neon πάντα · industrial = clear stage 1 · orbital = 2 · abyssal = 3 · glacial = 4 · data_wastes = 5.
  Επαναχρησιμοποίηση σημαίνει: τα υπάρχοντα saves κρατούν ό,τι έχουν ήδη κερδίσει, ένα save χωρίς το πεδίο
  διαβάζει 0 και προσφέρει μόνο neon_district, και **δεν υπάρχει δεύτερη σκάλα** να ξεσυγχρονιστεί.
  Το `the_null` δεν ανήκει στο `STAGE_RING`, οπότε είναι αδύνατο να ξεκλειδώσει εξ ορισμού (ελεγμένο σε 0/1/3/5/99).
  API: `isStageBiomeUnlocked(id)`, `stageBiomeRequirement(id)` → `CLEAR CAMPAIGN STAGE N`, `unlockedStageBiomes()`.
  Τριπλή πύλη: το UI δείχνει locked κάρτα με badge 🔒 + requirement, ο cursor **προσπερνά** τα locked, το CONFIRM
  σε locked δεν δεσμεύει τίποτα, το `setRunBiome()` απορρίπτει locked (άμυνα σε forged save/console), και το
  `_applyRunBiome()` επιδιορθώνει στο run start μια επιλογή που δεν είναι πια ξεκλείδωτη. Κακοσχηματισμένα
  `stagesCleared` (`undefined`/`null`/`NaN`/`-3`/`'abc'`/`{}`) εκπίπτουν με ασφάλεια στο 0.
  Η ανακοίνωση `NEW STARTING STAGE UNLOCKED — <NAME>` γίνεται μέσα στο `_completeCampaignStage()` πίσω από το
  `firstClear`, άρα **ακριβώς μία φορά ανά ξεκλείδωμα** και ποτέ σε load ή σε re-clear.
  Μετρημένο σε πραγματικό Chromium με το πραγματικό save path (`meta.clearStage(1)` → `_save()` → localStorage):
  fresh save = 1 ξεκλείδωτο / 5 locked με σωστό requirement· μετά το clear stage 1 → `stagesCleared` 1 και στο
  localStorage, **1** ανακοίνωση «NEW STARTING STAGE UNLOCKED — INDUSTRIAL CORE», 0 σε re-clear, Orbital ακόμη locked,
  και το Industrial επιλέγεται με πραγματικό click και ξεκινά πραγματικό run.
Αρχεία: Game.js (menu flow + run start + bg draw), MapManager (ήδη έτοιμο). Cache-bust bump.

**MILESTONE 2 / Slice A — ΟΛΟΚΛΗΡΩΜΕΝΟ (2026-07-31).** Και τα 5 items κλειστά: `runBiome` + ring rotation,
Stage-Select overlay + menu integration, εφαρμογή `enemyModifiers` σε Act 1 + Campaign, biome visual identity στο
legacy background draw, και unlock ladder πάνω στο υπάρχον `stagesCleared`. Χωρίς νέο art, χωρίς νέο save field,
χωρίς αλλαγή balance. QA: `tools/qa/batch4_stage_rules_regression.mjs` **175 PASS / 0 FAIL** (10 sections) + πλήρη
regression battery 20 suites (0 FAIL) + πραγματικό Chromium proof.
Επόμενο: **Slice B — Βάθος ανά stage**, πρώτο item «1 stage-boss + 1 unique reward ανά stage».

### Slice B — Βάθος ανά stage
- [x] **ΟΛΟΚΛΗΡΩΘΗΚΕ 2026-07-31** — 1 stage-boss + 1 unique reward ανά stage.
  **ΤΟ ΕΥΡΗΜΑ:** το `_updateStageProgression()` ήταν **νεκρός κώδικας** — οριζόταν σε μία γραμμή, το
  ανέφερε ένα σχόλιο σε άλλη, και **δεν το καλούσε κανείς** σε ~34k γραμμές. Το Act 1 δεν άλλαζε ποτέ
  stage. Και ακόμη κι αν το καλούσε κάποιος, το τοπικό `STAGE_DUR = 12*60` (720s) ήταν **μεγαλύτερο
  από ολόκληρο το act** (`ACT1_WIN_SECONDS` = 480s), οπότε το `floor(timeAlive/STAGE_DUR)` έμενε
  καρφωμένο στο 0. Επιπλέον δεν υπήρχε **καμία** αντιστοίχιση boss→biome πουθενά στον κώδικα.
  **CANONICAL ΠΙΝΑΚΑΣ** (μόνο υπάρχοντα bosses, κανένα νέο art, κανένα PNG δεν άλλαξε):
  | biome | stage boss | reward relic |
  |---|---|---|
  | `neon_district`   | Security Defector Mech | `neon_defector_core` — Defector Core (νέο) |
  | `industrial_core` | Matrix Annihilator     | `annihilator_forge_plate` — Forge Plate (νέο) |
  | `orbital_nexus`   | AI Overload Titan      | `titan_orbital_gyro` — Orbital Gyro (νέο) |
  | `abyssal_trench`  | Cyber Serpent          | `serpent_ember_coil` — υπήρχε ήδη, `req:'cyberSerpent'` |
  | `glacial_expanse` | Cyber Dragon           | `dragon_cryo_heart` — υπήρχε ήδη, `req:'cyberDragon'` |
  | `data_wastes`     | Bloodfang Packmaster   | `bloodfang_wastes_fang` — Wastes Fang (νέο) |
  Οι 4 Chaos Mega Titans **δεν** χρησιμοποιούνται ως απλοί stage bosses, ο `Rogue AI Overlord` μένει
  στο Campaign final stage, ο Chaos-flagged `doubleDemon` μένει έξω, και το `the_null` δεν έχει entry
  εξ ορισμού (δεν ανήκει στο `STAGE_RING`). **Κανένας boss δεν αφαιρέθηκε από Endless/Chaos** — το
  `_endlessRearmBoss` χρησιμοποιεί τους ίδιους ακριβώς spawners και τα ίδια `<name>Spawned` flags.
  **FLOW:** `_updateStageProgression()` καλείται πλέον από το `update()` (μετά τα paused/upgradeUI
  gates) και είναι πραγματική state machine, όχι timeout: επιβίωση `ACT1_STAGE_SECONDS` (80s ×
  6 stages = 480s = ακριβώς το act) → `_updateStageBossPhase()` κάνει **ένα** spawn του boss του
  biome → **το stage δεν προχωρά όσο ζει** (`_stageBossCleared[biome]` είναι η μοναδική πύλη) →
  ο θάνατος πληρώνει το reward → advance. Guards: `endless || _campaignStage || gameState !== 'playing'
  || gameOver || victory`, οπότε Endless, Chaos και Campaign είναι εντελώς ανέπαφα.
  **REWARD:** χρησιμοποιεί το **υπάρχον** relic system — `type:'boss'` + `req:<bossKillKey>`, ίδιο
  μοντέλο με τα Chaos Titan relics. Νέο `MetaProgress.grantStageRelic(id)` γράφει στο **ίδιο**
  `this.relics` store (καμία δεύτερη προοδευτική δομή) και επιστρέφει `true` **μόνο** την πρώτη φορά.
  Τριπλή προστασία από διπλοπληρωμή: `_stageBossRewarded[biome]` (ανά run) + `recordBossKill`
  (idempotent) + `grantStageRelic` (refuses owned/unknown/null). 12 διαδοχικές κλήσεις award δεν
  αλλάζουν τίποτα. Το boss-reward unlock και το Slice A stage-start unlock είναι **ξεχωριστά**:
  κατοχή reward δεν ξεκλειδώνει starting stage, και το ladder παραμένει monotonic.
  **ΜΕΤΡΗΜΕΝΟ σε πραγματικό Chromium** (1280×720, fresh storage): Run A Neon District → mech @80.0s,
  111.2 HP, r=28, pos finite, sprite `security_defector_mech.png`, **9.5 πραγματικό damage στον
  player**, boss δέχεται damage, πεθαίνει, teardown καθαρό, `neon_defector_core` στο localStorage,
  advance → Industrial Core / Annihilator. Run B Glacial Expanse (rotated ring
  `glacial→data_wastes→neon→industrial→orbital→abyssal`) → cyberDragon @80.0s, 1500 HP, r=44, sprite
  `cyber_dragon_boss.png [loaded]`, **20 damage στον player**, `dragon_cryo_heart` persisted, advance →
  Data Wastes / Bloodfang. Relic effect ζωντανό: Pulse Damage 0 → **0.5**, fire rate 0 → **0.03**.
  Canvas 100% / 96% non-black, **0 game-code console errors**.
  QA: `tools/qa/batch4_stage_boss_rewards_regression.mjs` **281 PASS / 0 FAIL** (11 sections).
- [x] **ΟΛΟΚΛΗΡΩΘΗΚΕ 2026-07-31** — Stage-specific enemy sub-pool.
  **ΤΟ ΕΥΡΗΜΑ:** το `export { ACT1_POOLS, CHAOS_POOL }` στο τέλος του `EnemySpawner.js` έγραφε
  *"for future biome-specific overrides"* αλλά **δεν το εισήγαγε κανείς** — μηδέν importers σε όλο το
  repo. Κάθε Act 1 stage και κάθε campaign stage έκανε spawn το **πανομοιότυπο ρόστερ**· η μόνη
  διαφορά ανά biome ήταν hpMult/speedMult/regenRate πάνω στον ίδιο εχθρό. Άλλη εικόνα, ίδιοι εχθροί.
  Δεύτερο εύρημα από το audit: ο **WaveDirector** είναι ο κύριος picker (μόνο το 1ο spawn κάθε tick
  περνά από το `chooseEnemyType`), οπότε ένα hook μόνο στον EnemySpawner θα άλλαζε ~1 στα 3-17 spawns.
  **Η ΥΛΟΠΟΙΗΣΗ — post-selection remap, ΟΧΙ δεύτερο spawn system.** Νέο `CAMPAIGN_BIOME_ENEMY_POOLS`
  (data-driven, `E(id, weight, family, minStageTime, maxStageTime)`) + `pickBiomeEnemy()` στο
  `EnemySpawner.js`, και **ένα** σημείο κλήσης: `Game._biomeSpawnType()` μέσα στο `spawnEnemy`, εκεί
  όπου συγκλίνουν **και οι δύο** pickers. Όλη η υπάρχουσα μηχανή μένει ανέπαφη — WaveDirector blocks,
  formations, weights, tier ladder, `enemyCap()`, `targetAlive`, interval, batch size, elite flag,
  event overrides, `spawnPauseTimer`, boss flow. Αλλάζει μόνο **ποιος** εχθρός γεμίζει τον ρόλο.
  **FAMILY PRESERVATION:** ένα `HEAVY_COLUMN` που ζήτησε heavy παίρνει heavy — το Industrial Core
  απαντά με Heavy Mech, το Glacial Expanse με Abyss Maw. Τα formations κρατούν το νόημά τους.
  **CANONICAL ΠΙΝΑΚΑΣ** (μόνο υπάρχοντες εχθροί, υπάρχον art, κανένα νέο PNG, κανένα invented id):
  | biome | pool (weight · family · [από s]) |
  |---|---|
  | `neon_district`   | Glitch Drone 4·fodder · Rogue Punk 4·swarm · Volt Rat 3·fodder · Stealth Infiltrator 3·fast · Scrap Scavenger 2·swarm · Combat Hunter 2·fast [30] · Cyber Shooter 2·ranged [15] · Heavy Mech 1·heavy [55] |
  | `industrial_core` | Scrap Scavenger 4·swarm · Heavy Mech 3·heavy · Pulse Burrower 3·swarm · Overclocked Berserker 3·fast · Combat Hunter 2·fast · Cyber Shooter 2·ranged · Glitch Drone 2·fodder · Solar Tyrant 1·heavy [50] |
  | `orbital_nexus`   | Glitch Drone 4·fodder · Cyber Shooter 3·ranged · Solar Stinger 3·fast · Volt Rat 2·fodder · Cyber-Net Junkie 2·swarm · Amethyst Fang 2·fast [20] · Rift Eye 2·ranged [25] · Void Widow 2·heavy · Combat Hunter 1·fast |
  | `abyssal_trench`  | Cyber-Net Junkie 4·swarm · Toxin Leech 4·fast · Abyss Maw 4·heavy · Cryo Claw 3·swarm · Void Widow 2·heavy · Rift Eye 2·ranged · Glitch Drone 2·fodder · Razorhound 1·fast [45] |
  | `glacial_expanse` | Cryo Claw 4·swarm · Scrap Scavenger 3·swarm · Abyss Maw 3·heavy · Heavy Mech 2·heavy · Combat Hunter 2·fast · Cyber Shooter 2·ranged · Glitch Drone 2·fodder · Stealth Infiltrator 1·fast · Solar Tyrant 1·heavy [50] |
  | `data_wastes`     | Volt Rat 3·fodder · Ember Scarab 3·swarm · Overclocked Berserker 3·fast · Rogue Punk 2·swarm · Combat Hunter 2·fast · Razorhound 2·fast [25] · Cyber Shooter 2·ranged · Rift Eye 2·ranged [20] · Void Widow 2·heavy · Heavy Mech 2·heavy · Amethyst Fang 1·fast |
  **EXCLUSIONS** (`BIOME_POOL_EXCLUDED`, περνούν αμετάβλητοι): Rogue AI Overlord, Security Defector
  Mech, οι 4 Chaos Mega Titans, ο event-only Cybermote και τα 10 Chaos-only types. Έτσι τα boss
  insertions του tier ladder και το `_spawnStageBoss` δουλεύουν **ακριβώς** όπως πριν.
  **FALLBACK — ποτέ empty pool, ποτέ undefined:** unknown/null biome, malformed entry, μηδενικό
  weight, excluded type, Endless, Chaos, streaming map, ή απουσία `_stageBiome` → επιστρέφει τον
  εισερχόμενο τύπο αμετάβλητο· επιπλέον `try/catch` γύρω από τη μοναδική κλήση.
  **DETERMINISM:** το `pickBiomeEnemy(type, biome, stageT, rnd = Math.random)` δέχεται injectable
  RNG. Το production δεν περνά τίποτα (ίδιο `Math.random` με τον υπόλοιπο spawn path — **καμία νέα
  πηγή τυχαιότητας**), τα tests περνούν seeded mulberry32 και αποδεικνύουν πανομοιότυπες ακολουθίες.
  **ΜΕΤΡΗΜΕΝΟ SPAWN BUDGET (A/B, 100 runs 480s):** total spawns **+0.05%** (variance-reduced leg),
  `spawnEnemy` calls +0.07%, **peak alive 173 σε ΚΑΘΕ έναν από τους 100 runs (Δ=0.00%)**, mean alive
  −0.26%. Per-enemy mean HP **−2.5%** (count-controlled, 219.898 spawns), median HP αμετάβλητο
  7.0 → 7.0, speed −0.4%. **Κανένα global buff/nerf.** Ramp στον pool άξονα: baseline «σπασμένο»
  5.3 → 4.8 → 9.6 → 6.1 → 7.2 → 9.4, τώρα σχεδόν μονότονο **4.6 → 6.0 → 6.7 → 6.6 → 7.8 → 9.6**.
  QA: `tools/qa/batch4_5_biome_enemy_pools_regression.mjs` **993 PASS / 0 FAIL** (12 sections,
  150.000 seeded draws), + πραγματικό Chromium proof σε 4 runs.
  **ΕΠΑΛΗΘΕΥΣΗ 4.5.1 — `Solar Tyrant`: CONFIRMED_NORMAL_VARIANT (καμία αλλαγή pool).**
  Ελέγχθηκε επειδή τα ART SPEC αρχεία τον γράφουν ως boss:
  `assets/enemies/weapons/EnemyWeaponCatalogV1.json` → `"boss_assignments": { "solar_tyrant": {
  "asset": "assets/enemies/bosses/solar-tyrant.png", "biome": "Solar / Gold elite / premium boss" } }`
  και το ίδιο στο `ENEMY_WEAPON_MAPPING_V1.md:103-106`. **Αυτά τα αρχεία ονοματίζουν ΕΙΚΟΝΕΣ, όχι
  οντότητες**: το ίδιο `boss_assignments` block γράφει ως «bosses» άλλα έξι κλειδιά
  (`forge_mauler`, `cryo_warden`, `null_hierophant`, `pale_bloodknight`, `rail_reaper`,
  `reactor_colossus`) που είναι απλώς τα sprites των Combat Hunter / Scrap Scavenger /
  Cyber-Net Junkie / Overclocked Berserker / Cyber Shooter / Heavy Mech — όπως το τεκμηριώνει ρητά
  ο ίδιος ο κώδικας στο `js/game/EnemyWeaponCatalog.js:99-107`. Η διαδρομή
  `assets/enemies/bosses/solar-tyrant.png` **δεν υπάρχει στον δίσκο**· το πραγματικό αρχείο είναι
  `assets/enemies/minis/solar-tyrant.png`. Στον κώδικα παιχνιδιού: `isBoss()` απαριθμεί ρητά μόνο
  `Security Defector Mech`, `Rogue AI Overlord` και τα 4 `CHAOS_TITANS` → **false**· archetype
  `'heavy'` (ίδιο bucket με Heavy Mech), role `'hunter'` (όχι `'boss'`), HP `44*g` με τον **κανονικό**
  ramp `g` και όχι τον boss ramp `gB` (ο Overlord είναι `400*gB`, 8× παραπάνω), radius 26 έναντι 44,
  κανένα `this.solarTyrantBoss` field όπως έχουν όλα τα πραγματικά bosses, και απουσία από
  `BOSS_ECHOES` / `STAGE_BOSSES` / `RELIC_DEFS[].req` / `recordBossKill` / tier-ladder insertions /
  `_endlessRearmBoss` / Boss Rush / Chaos scheduler / `Events.js`. Ήταν **ήδη** κανονικό Act 1 spawn
  πριν το Slice B, μέσω `HINT_POOLS.act1.heavy` και `STAGE_WAVES`. Και τα 21 pool IDs είναι `normal`.
  Νέο section 13 «BOSS-LEAK LOCK»: η λίστα των bosses παράγεται **brute-force από το live registry**
  (κατασκευή κάθε id και έλεγχος `isBoss()`/`isMegaBoss`), όχι από χειρόγραφη λίστα, ώστε ένα
  μελλοντικό boss να μην μπορεί να διαρρεύσει σιωπηλά. Σύνολο **1061 PASS / 0 FAIL**.

### Art dependency (για αύριο)
- [ ] 6 stage-select thumbnails (~400×300) — 1 ανά biome. ASCII names, transparent όχι απαραίτητο.
  Προτεινόμενα ονόματα: `assets/maps/thumbs/{neon_district,industrial_core,orbital_nexus,abyssal_trench,glacial_expanse,data_wastes}.png`
  (Μπορούμε προσωρινά να κόψουμε thumbnails από τις υπάρχουσες map εικόνες — δεν μπλοκάρει το Slice A.)

## MILESTONE 3 — Enemy signatures στο Act 1 (κυρίως code/VFX)
- [x] **BATCH 5.1 — FOUNDATION ΟΛΟΚΛΗΡΩΘΗΚΕ 2026-07-31** — signature υποδομή + 6 αντιπροσωπευτικές signatures.
  **ΤΟ ΕΥΡΗΜΑ:** και οι 21 normal enemies τρέχουν το **ΙΔΙΟ** `Enemy.update()` body. Σε ολόκληρη τη
  μηχανή υπάρχουν μόνο **τρία** per-type branches που αγγίζουν τους 21, και τα τρία είναι μονόγραμμα
  contact riders (Cryo Claw chill, Razorhound bite, Toxin Leech bleed). **Δέκα** από τους 21 είναι
  καθαρό chase χωρίς καμία διαφοροποίηση· άλλοι **τρεις** διαφέρουν μόνο κοσμητικά (Stealth
  Infiltrator = χρώμα hit-flash, Void Widow = sprite filtering, Solar Tyrant = radius). Δηλαδή το
  ρόστερ διαβάζεται ως **ένας** εχθρός με 21 sprites. Επιπλέον το `Enemy.js:196-198` πετάει το
  `shootInterval` για κάθε non-ranged archetype, σκοτώνοντας **8** authored `_initRole` stat blocks.
  **ΑΡΧΙΤΕΚΤΟΝΙΚΗ:** νέο `js/game/EnemySignatures.js` — data-driven registry + **μία** update
  συνάρτηση, καλούμενη από **ένα** σημείο μέσα στο `Enemy.update()`. Κανένα δεύτερο update system,
  κανένας global manager, καμία νέα global array, μηδέν per-frame allocations. Ρητό 4-φασικό state
  machine ανά εχθρό: `READY → TELEGRAPH → EXECUTE → RECOVER → READY`, όλο σε ένα `_sig` object πάνω
  στο instance — οπότε το cleanup είναι **αυτόματο και ολικό** σε death / reset / deck transition.
  **DETERMINISM:** μηδέν `Math.random()` στο module· ο κάθε εχθρός παίρνει seed από τον **ίδιο**
  static LCG που ήδη παράγει το `speedVariation`.
  **ΟΙ 6 SIGNATURES** (cooldown / telegraph / execute / recover, δευτερόλεπτα):
  | family | enemy | signature | cd | tele | exec | rec | telegraph geometry |
  |---|---|---|---|---|---|---|---|
  | fodder | Volt Rat | Zigzag Surge | 4.2 | 0.35 | 0.30 | 0.25 | ζεύγος εμπρόσθιων τόξων |
  | swarm | Pulse Burrower | Burrow Reposition | 8.5 | 0.70 | 0.55 | 0.45 | ground ring + σταυρός |
  | fast | Razorhound | Committed Lunge | 6.5 | 0.45 | 0.35 | 0.90 | κατευθυντική σφήνα |
  | ranged | Rift Eye | Aimed Rift Shot | 5.5 | 0.60 | 0.12 | 0.40 | aim line + reticle |
  | heavy | Heavy Mech | Ground Brace | 9.0 | 0.80 | 0.25 | 0.60 | ακτινικός δακτύλιος |
  | shield | Abyss Maw | Frontal Guard | 7.0 | 0.30 | 2.20 | 0.50 | εμπρόσθιος κώνος 71° |
  **ΑΣΦΑΛΕΙΑ:** ποτέ ενεργοποίηση στο spawn frame (πρώτο cd ≥ 55% ενός πλήρους cooldown)·
  deterministic jitter αποσυγχρονίζει τα πακέτα· per-type concurrency ceiling
  (`maxConcurrentFrac`) που **δεσμεύεται τη στιγμή του arm**, όχι από στιγμιότυπο· ένα damage event
  ανά activation, και hit που απορρίφθηκε από i-frames **δεν** καταναλώνει το budget· offscreen
  εχθροί δεν παράγουν telegraph· το burrow δεν κάνει contact damage και δεν βγαίνει ποτέ πάνω στον
  παίκτη (μέσω του canonical `resolveEnemySpawn`)· κανένα νέο PNG.
  **4 BUGS που έπιασε το suite και διορθώθηκαν:** (1) το `fireAimedShot` έδινε plain `{x,y}` ενώ το
  `spawnEnemyBullet` καλεί `dir.clone()` — ο Rift Eye **δεν πυροβολούσε ποτέ** και διέρρεε token·
  (2) ο frontal guard ξαναστόχευε τον παίκτη **κάθε frame**, άρα ήταν flat omnidirectional ×0.55
  χωρίς counterplay — τώρα το facing **κλειδώνει** στο commit· (3) το concurrency ceiling
  ξεπερνιόταν (21/20) επειδή όλοι διάβαζαν το ίδιο stale census· (4) το registry lookup δεν ήταν
  prototype-safe (`signatureFor('constructor')`).
  **ΜΕΤΡΗΜΕΝΟ Chromium (5 runs, fresh storage):** και οι 6 έκαναν 3 πλήρεις κύκλους·
  Razorhound `dirDrift = 0` (κλειδωμένη κατεύθυνση)· Rift Eye `firedProjectile = true`, ≤3 bullets·
  Pulse Burrower landing finite, μακριά από τον παίκτη, **μηδέν overlap**· Abyss Maw **front 3.3 vs
  rear 6.0 damage**· canvas 99.7-100% non-black· **0 game-code console errors**.
  **BALANCE A/B (80s stage ×3):** player damage **−8.6%** (μειώθηκε), kills +2.7%, peak alive +4.0%,
  bullets 0.0%. Καμία global αύξηση δυσκολίας — μόνο διαφοροποίηση.
  QA: `tools/qa/batch5_1_enemy_signatures_regression.mjs` **602 PASS / 0 FAIL** (40 σημεία + stress
  306 εχθροί × 10 λεπτά + deterministic replay).
- [ ] Signatures για τους υπόλοιπους 15 normal enemies (επόμενο Batch 5 item)
Art: ελάχιστο (procedural VFX).

## MILESTONE 4 — Steam funnel
- [ ] 30 Steam achievements
- [ ] Wishlist «Coming Soon» page
- [ ] Trailer + 5 screenshots + capsule
Art που θα χρειαστεί: capsule (616×353), header, library art, achievement icons.

---

## Επόμενη ενέργεια ΤΩΡΑ
➡ **Maria:** φτιάξε το Art batch #1 (τα 3 PNG παραπάνω).
➡ **Dev pipeline:** μόλις είναι έτοιμα, τα wire-άρω ως 3 πλήρη evolutions και κάνω commit/push/verify.
