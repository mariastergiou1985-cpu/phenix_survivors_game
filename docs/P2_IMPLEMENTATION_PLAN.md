# P2 BUILD ENGINE — Implementation Plan (fable)
Spec: docs/P2_BUILD_ENGINE_SPEC_GR.md (Maria, 2026-07-16). ΜΗΝ αποκλίνεις χωρίς έγκρισή της.

## Build order (κάθε βήμα = δικό του commit, testable)
P2.1  DATA LAYER: js/game/BuildEngine.js — WEAPON_DEFS/PASSIVE_DEFS/EVOLUTION_RECIPES
      schema ακριβώς όπως το spec §13 (arrays ανά level, tags, bossMultiplier, owner).
      Runtime: generic weapon executor (projectile/orbit/melee-arc/zone/summon primitives)
      + damage logger per weapon (totalDamage/kills/crits) για Damage Report.
P2.2  ΠΡΩΤΟ ΖΕΥΓΟΣ END-TO-END (template): Skeleton — Marrow Spitter + Grave Cantor,
      Ossified Dynamo + Funeral Resonator, evolutions Marrow Reactor + Revenant Choir.
      Procedural VFX κατά τη συνταγή των ultimates. Weighting κανόνες (x3 native κτλ).
      ΟΤΑΝ εγκριθεί το feel από Maria → clone pattern στους υπόλοιπους.
P2.3  Χαρακτήρες 2-5 (Taekwondo/CyberArm/Brawler/Assassin) — 8 όπλα + 8 passives + 8 evos.
P2.4  Χαρακτήρες 6-10 (Eddie/Dimi/Phasewalker/Euclid/Oni) — Solo Red Thunder = υπάρχον,
      μόνο data-wrap + evolution.
P2.5  5 Universal weapons (Null Lance/Ion Halo/Gravity Core/Nano Mine/Blacknet Drone).
P2.6  25 build passives (§26-50) — generic hooks: onCrit/onKill/onPierce/onKnockback/
      onDamaged/onElementCast, όλα με caps/ICD όπως ορίζει το spec.
P2.7  Loadout caps (6W/6P/2T/1R/1A), weapon-family limit, Banish/Seal κατηγοριών.
P2.8  UI: (a) Level-up cards με stat deltas + badges (NEW/NATIVE/EVOLUTION READY/REQUIRES)
      (b) NULL ARSENAL menu + Character Dossier (c) Pause CURRENT BUILD tab
      (d) Results Damage Report. Χρωματικός κώδικας §8, ύφος §9 (70/20/10).
P2.9  Telemetry: Actual Run DPS logs → balancing. WASTED PICK internal-only.

## Κανόνες
- Τίποτα δεν γράφεται δύο φορές: UI διαβάζει ΜΟΝΟ από τα DEFS (§13).
- SINGLE-TARGET DPS label, ποτέ σκέτο DPS.
- Boss modifiers παντού. Ενεργά objects με caps. Μηδέν shadowBlur σε per-entity loops.
- Παλιό upgrade system: μένει λειτουργικό μέχρι το P2.7, μετά migration.

## ΑΠΟΛΥΤΟΣ ΚΑΝΟΝΑΣ ΤΕΧΝΗΣ (Maria, ρητά):
ΟΛΑ — όπλα, evolutions, passives VFX — φτιάχνονται ΟΠΩΣ ΟΙ ULTIMATES:
unique & premium, καθαρός procedural Canvas 2D, lighter layering
(halo ταυτότητας -> σώμα -> λευκός πυρήνας), φάσεις στον χρόνο,
try/finally armor, caps, ΚΑΝΕΝΑ έτοιμο sprite/PNG, μηδέν shadowBlur
σε loops. Να μην υπάρχει τίποτα ίδιο σε άλλο παιχνίδι.


## STATUS UPDATE (fable, 2026-07-16, απόφαση Maria)
P2.1-P2.9 ΠΑΡΑΔΟΘΗΚΑΝ. P2.7 = SOFT MIGRATION: Build Engine DEFAULT ON για όλους
(opt-out: ?p2=0 ή F9 -> phenix_p2='0'). Το παλιό σύστημα ΠΑΡΑΜΕΝΕΙ στον κώδικα ως
δίχτυ ασφαλείας. Εκκρεμεί για το ΠΛΗΡΕΣ migration (μετά το feel sign-off + telemetry):
απόσυρση old-gen WeaponCatalog evolutions, ενοποίηση be_ ονομάτων, 2T/1R/1A caps,
TACTICALS/ELEMENTS/FUSIONS tabs στο NULL ARSENAL (ενιαίο data source), αφαίρεση F9/flag,
αφαίρεση/συγχώνευση του EVOLUTION MATRIX menu στο NULL ARSENAL (ερώτηση Maria 2026-07-16 —
μένει όσο ζει το παλιό σύστημα, γιατί τεκμηριώνει τα old-gen evolutions που ακόμα παίζουν).

## STATUS UPDATE 2 (fable, 2026-07-18, εντολή Maria «συνέχισε»)
FULL MIGRATION — ΕΓΙΝΑΝ: (1) old-gen WeaponCatalog evolutions ΑΠΟΣΥΡΘΗΚΑΝ από το
rotation όταν το BE είναι ενεργό (πάντα, πλην fallback)· (2) tactical cap 3 -> 2 (spec 2T)·
(3) ?p2/F9 opt-out ΑΦΑΙΡΕΘΗΚΕ — BE unconditionally ON, το stale phenix_p2 καθαρίζεται από
το main.js· NULL ARSENAL μόνιμο στο μενού. Το παλιό σύστημα μένει ως αυτόματο δίχτυ ΜΟΝΟ
αν ο runtime αποτύχει να κατασκευαστεί.
ΔΗΛΩΜΕΝΕΣ ΑΠΟΦΑΣΕΙΣ (όχι σιωπηλές αποκλίσεις):
- be_ internal ids ΔΕΝ μετονομάστηκαν (τα display names ήδη ταιριάζουν με το spec· η
  μετονομασία θα έσπαγε telemetry ring + ενδεχόμενα saved κλειδιά χωρίς όφελος παίκτη).
- 1A cap: ήδη δομικό (ένα amulet ανά χαρακτήρα, επιδρά μόνο στο δικό του ultimate).
- 1R cap: ΔΕΝ εφαρμόστηκε — σήμερα ΟΛΑ τα relics ισχύουν μαζί (HUD 8 slots)· επιβολή 1R
  απαιτεί run-loadout picker UI (ποιο relic ενεργό ανά run) = απόφαση design της Maria.
- TACTICALS/ELEMENTS/FUSIONS ενιαίο data source: τα tabs διαβάζουν read-only τους παλιούς
  καταλόγους (7011aa9)· η μεταφορά των ίδιων των συστημάτων σε DEFS είναι ξεχωριστό βήμα.
- Balance pass: εκκρεμεί σε πραγματικά runs της Maria (localStorage.phenix_be_telemetry).
