# PHENIX: NULL EDEN — Κοινός Οδικός Χάρτης & Πρόοδος (30h depth)

*Αυτό είναι το κοινό μας tracker. Ο Claude το ξαναδιαβάζει και θυμίζει στη Maria πού πάμε.
Στόχος: από «6ωρο indie» → «30ωρο survivor-like με δική του ταυτότητα».*

Τελευταία ενημέρωση: 2026-07-07

## Πού πάμε (τα 4 μεγάλα levers)
1. Evolutions 4 → 12–14  ← **ξεκινάμε ΕΔΩ**
2. Biomes → 3–5 selectable stages
3. Enemy signatures ξεκλείδωτα στο Act 1
4. Unlock ladder + Steam achievements + wishlist page

---

## MILESTONE 1 — Πρώτα Evolutions (art-first)
**Ρόλος Maria: φτιάχνει το art. Ρόλος Claude: το wire-άρει στο παιχνίδι (safe workflow: syntax check → boot → commit → push → live verify).**

Convention: κάθε evolution = ΕΝΑ διάφανο PNG στο `assets/weapons/vfx/{name}.png`
Specs: ~512×512 (ή μεγαλύτερο), διάφανο background, neon cyberpunk glow, χρώμα του element.

### Art batch #1 (ΕΤΟΙΜΟ ✅ — art παραδόθηκε + alpha-fixed από Claude)
- [x] `assets/weapons/vfx/grid_reaper.png` — **Grid Reaper** (πράσινο lattice crescent) ✅ RGBA
- [x] `assets/weapons/vfx/cryo_sovereign.png` — **Cryo Sovereign** (γαλάζιο ice field) ✅ RGBA
- [x] `assets/weapons/vfx/chaos_chord.png` — **Chaos Chord (Eddie)** (χρυσές νότες+αστραπές) ✅ RGBA
Σημ.: τα originals ήταν RGB χωρίς διαφάνεια (λευκό/σκούρο φόντο)· ο Claude πρόσθεσε alpha (keying) χωρίς να αλλάξει το art.

### Wiring plan (Claude — επόμενο focused task, με live test)
Το σύστημα evolutions είναι «όπλο+όπλο σε L5 → evolved», hard char-lock. Χρειάζεται μικρό owner-override για exclusivity.
- **Chaos Chord** → Eddie evolution (γεμίζει κενό: ο Eddie ΔΕΝ έχει evolution τώρα). Recipe: solo_red_thunder + owner-override='eddie'. Behavior: BOLT_PROJECTILE→homing notes. Element: thunder_maiden.
- **Grid Reaper** → toxin evolution. Recipe: shadow_toxic + gas_needle (owners: assassin+euclid). Behavior: WIDE_ARC (line reap). Element: toxin.
- **Cryo Sovereign** → ice evolution. Recipe: spirit_crescent + (ice base). Behavior: PULL_EXPLODE/VORTEX (freeze-shatter). Element: ice.
Κάθε ένα: 1-frame sprite (το art είναι ενιαίο image, όχι spritesheet) → static render, δείχνει όλο το art.

### Art batch #2 (ΕΤΟΙΜΟ ✅ — art παραδόθηκε + alpha-fixed από Claude)
- [x] `assets/weapons/vfx/ion_halo.png` — **Ion Halo** (μπλε ηλεκτρικό δαχτυλίδι) ✅ RGBA
- [x] `assets/weapons/vfx/null_lance.png` — **Null Lance** (μωβ/λευκό void δόρυ + black hole) ✅ RGBA
- [x] `assets/weapons/vfx/ember_storm.png` — **Ember Storm** (πορτοκαλί δίνη στάχτης) ✅ RGBA
Και τα 6 art evolutions είναι πλέον στον φάκελο, alpha-fixed. Επόμενο: wiring στο gameplay.

### Wiring (Claude) — ΕΤΟΙΜΟ ✅
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
- [ ] `this.runBiome` (default neon_district) — τίθεται στην αρχή του Act 1 run
- [ ] Νέο Stage-Select overlay από το μενού (λίστα 6 biomes με name/description από BIOME_DEFS)
- [ ] Legacy background draw: χρήση `mapManager.getBiomeImage(runBiome)` + palette αντί σταθερού bg
- [ ] Εφαρμογή `enemyModifiers` (speedMult/hpMult) του biome = το «rule» του stage
- [ ] Unlock ladder: 3 stages στην αρχή, τα υπόλοιπα με νίκες/milestones
Αρχεία: Game.js (menu flow + run start + bg draw), MapManager (ήδη έτοιμο). Cache-bust bump.

### Slice B — Βάθος ανά stage (αργότερα)
- [ ] 1 stage-boss + 1 unique reward ανά stage
- [ ] Stage-specific enemy sub-pool

### Art dependency (για αύριο)
- [ ] 6 stage-select thumbnails (~400×300) — 1 ανά biome. ASCII names, transparent όχι απαραίτητο.
  Προτεινόμενα ονόματα: `assets/maps/thumbs/{neon_district,industrial_core,orbital_nexus,abyssal_trench,glacial_expanse,data_wastes}.png`
  (Μπορούμε προσωρινά να κόψουμε thumbnails από τις υπάρχουσες map εικόνες — δεν μπλοκάρει το Slice A.)

## MILESTONE 3 — Enemy signatures στο Act 1 (κυρίως code/VFX)
- [ ] Ξεκλείδωμα signature attacks σε base (Enemy.js:340) με telegraph
Art: ελάχιστο (procedural VFX).

## MILESTONE 4 — Steam funnel
- [ ] 30 Steam achievements
- [ ] Wishlist «Coming Soon» page
- [ ] Trailer + 5 screenshots + capsule
Art που θα χρειαστεί: capsule (616×353), header, library art, achievement icons.

---

## Επόμενη ενέργεια ΤΩΡΑ
➡ **Maria:** φτιάξε το Art batch #1 (τα 3 PNG παραπάνω).
➡ **Claude:** μόλις είναι έτοιμα, τα wire-άρω ως 3 πλήρη evolutions και κάνω commit/push/verify.
