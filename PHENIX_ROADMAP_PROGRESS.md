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

### Art batch #2 (μετά)
- [ ] `assets/weapons/vfx/ion_halo.png` — **Ion Halo** (μπλε ηλεκτρικό δαχτυλίδι)
- [ ] `assets/weapons/vfx/null_lance.png` — **Null Lance** (λευκό void δόρυ)
- [ ] `assets/weapons/vfx/ember_storm.png` — **Ember Storm** (πορτοκαλί δίνη στάχτης)

### Wiring (Claude, αφού έρθει το art)
- [ ] Batch #1 wired (recipes + card + damage path) → commit → live verify
- [ ] Batch #2 wired → commit → live verify

**Στόχος Milestone 1:** evolutions 4 → 10.

---

## MILESTONE 2 — Selectable Stages (χρησιμοποιεί υπάρχοντα biomes)
- [ ] Neon District + 2 biomes ως selectable stages (art υπάρχει)
- [ ] 1 rule + 1 stage-boss + 1 reward ανά stage
Art που ίσως χρειαστεί: 1 stage-select εικονίδιο ανά stage (μικρό).

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
