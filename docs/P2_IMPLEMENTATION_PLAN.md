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
