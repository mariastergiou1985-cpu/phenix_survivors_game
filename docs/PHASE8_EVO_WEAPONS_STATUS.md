# Phase 8 — Evolution Weapons + Pattern VFX: Status & Missing Assets

Επιθεώρηση repo (δεν εφευρίσκω filenames, δεν παράγω art — κανόνας manifest + coworker rule 15).

## 1. Τι ΥΠΑΡΧΕΙ

Οι evolution illustration PNGs της Maria υπάρχουν στο:
`assets/weapons/new_evo_weapons/Quick Identity Summary ανά Evolution/`

36 αρχεία, οργανωμένα σε:
- Root: 8 "(Pattern <type>)" illustrations (Vaporize Blade, Cryo Venom Fang, Absolute Zero Tempest, Bloodfrost Guillotine, Shatter Rift Blade, Eclipse Frostfang, Caustic Inferno, Astral Glacier).
- Υποφάκελοι ανά ρόλο: `Burst Execute/`, `Contagion Spread/`, `DoT Area Denial/`, `Orbit Defensive Pressure/`, `Pull Crowd Control/`, `Teleport Unpredictable Coverage/`.

Μέσα στο `pattern_vfx_manifest_pack.zip`:
- `PATTERN_MANIFEST_FOR_CLAUDE.md` (master placement table, 28 entries)
- `PATTERN_VFX_EVOLUTIONS_MANIFEST_FOR_CLAUDE.pdf`
- `pattern_manifest.json`
- `pattern art.png` (ΕΝΑ contact/overview image — όχι isolated ανά VFX)

## 2. Τι ΛΕΙΠΕΙ (Missing Assets — απαιτούν παραγωγή από τη Maria)

Τα **isolated per-character Pattern VFX PNGs** που ορίζει το manifest **ΔΕΝ υπάρχουν** στο repo:

```
pattern/skeleton_cyber/pattern_04_bloodfrost_guillotine.png   — MISSING
pattern/skeleton_cyber/pattern_10_hellblood_cleaver.png       — MISSING
pattern/skeleton_cyber/pattern_18_grave_rot_abyss.png         — MISSING
pattern/taekwondo_girl/pattern_03_absolute_zero_tempest.png   — MISSING
pattern/taekwondo_girl/pattern_11_solar_flare_edge.png        — MISSING
pattern/taekwondo_girl/pattern_20_nova_circuit.png            — MISSING
pattern/cyber_arm/pattern_09_plasma_overload.png              — MISSING
pattern/cyber_arm/pattern_21_stormrift_edge.png               — MISSING
pattern/cyber_arm/pattern_26_event_horizon_blade.png          — MISSING
pattern/brawler/pattern_01_vaporize_blade.png                 — MISSING
pattern/brawler/pattern_08_caustic_inferno.png                — MISSING
pattern/brawler/pattern_23_crimson_singularity.png            — MISSING
pattern/brawler/pattern_24_ruin_halo.png                      — MISSING
pattern/assassin_clone_girl/pattern_07_eclipse_frostfang.png  — MISSING
pattern/assassin_clone_girl/pattern_22_blackout_tempest.png   — MISSING
pattern/assassin_clone_girl/pattern_25_dread_reaver.png       — MISSING
pattern/euclid_vector_venom/pattern_02_cryo_venom_fang.png    — MISSING
pattern/euclid_vector_venom/pattern_14_bio_shock_reaper.png   — MISSING
pattern/euclid_vector_venom/pattern_15_hemotoxin_fang.png     — MISSING
pattern/euclid_vector_venom/pattern_16_nebula_blight.png      — MISSING
pattern/oni/pattern_12_riftforge_blade.png                    — MISSING
pattern/oni/pattern_13_cinder_oblivion.png                    — MISSING
pattern/oni/pattern_28_null_eclipse.png                       — MISSING
pattern/eddie/pattern_06_shatter_rift_blade.png               — MISSING
pattern/eddie/pattern_17_plaguebringer.png                    — MISSING
pattern/eddie/pattern_27_darkmatter_lance.png                 — MISSING
```

Το `PATTERN_VFX_EVOLUTIONS_MANIFEST` είναι στην ουσία **οδηγία παραγωγής εικόνων** (μία isolated PNG ανά VFX, transparent/λευκό bg). Δεν επιτρέπεται να τις παράγω/εφεύρω εγώ — πρέπει να τις φτιάξεις εσύ από το manifest και να τις βάλεις στους φακέλους `pattern/<character>/`. Μόλις υπάρχουν, γίνεται το wiring.

## 3. Ασφαλές επόμενο βήμα (μόλις υπάρχουν τα PNGs)

1. Preload όλων των `pattern/<char>/pattern_NN_*.png` μέσα στο υπάρχον asset-preload σύστημα (με onerror fallback, χωρίς pink/missing).
2. Mapping evolution-ID → pattern file (ακριβώς όπως το master placement table).
3. Render ως in-world VFX overlay πάνω από το υπάρχον evolution VFX, σε premium μέγεθος (όχι microscopic), preserve glow/edges.

## 4. Γιατί δεν έγινε gameplay wiring τώρα

- Τα core Phase-8 assets (isolated pattern PNGs) λείπουν → κανόνας: report, όχι invent.
- Ο φάκελος `new_evo_weapons` δεν αναφέρεται σε κανένα js αρχείο σήμερα· το wiring 36 evolutions χρειάζεται επιβεβαιωμένο evolution→file mapping για να μην σπάσει (black-screen safety).

**Blocked-by:** παραγωγή των 26 isolated pattern VFX PNGs από τη Maria.
