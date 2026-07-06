# PHENIX: NULL EDEN — Future Features Backlog
> Σημειώσεις για μελλοντικά sessions. Ενημερώνεται όταν η Maria προσθέτει έτοιμα assets που ΔΕΝ έχουν κώδικα ακόμα.

## 1. SECOND SUPPLY DROP — "Cyber Vault Cache" (locked tier-2 crate)
- **Asset (έτοιμο):** `assets/events/supply_drop/second_grid_cache_cyber.png` (1254×1254)
  - Κλειδωμένη premium κάσα με λουκέτο + ολογραφικό cube. ΔΕΝ αναφέρεται πουθενά στον κώδικα ακόμα (verified 2026-07-05).
  - ΠΡΟΣΟΧΗ: πριν τη χρήση έλεγξε αν το φόντο είναι διάφανο· αν είναι μαύρο, κάνε το ίδιο edge flood-fill transparency που έγινε στο tac_gravity_well (commit 0dadbe6).
- **Το τωρινό σύστημα:** GRID CACHE crate στο `Game.js` (`_updateGridCache`, `_grantGridCacheBonus`, sprite `assets/supply drop/grid_cache_crate.png`, spawn κάθε ~60s, 20s expire, 24px pickup).
- **Πρόταση design (προς έγκριση από Maria):** σπάνιο "VAULT DROP" (π.χ. 1 στα 5 caches ή μόνο μετά από boss kill), ΚΛΕΙΔΩΜΕΝΟ: ανοίγει μόνο αν σκοτώσεις Χ εχθρούς μέσα σε 10s δίπλα του (ή με 25 mana). Δίνει αναβαθμισμένο loot: διπλό cache bonus + εγγυημένη tactical κάρτα στο επόμενο level-up ή +1 PF (σπάνια).
- **Υλοποίηση όταν έρθει η ώρα:** νέο state στο `_updateGridCache` (ή αδελφό `_updateVaultDrop`), sprite preload δίπλα στο `_gridCacheSprite`, announcement 'VAULT DROP DETECTED', ξεχωριστό SFX.

## ΠΛΑΝΟ ΓΙΑ ΑΥΡΙΟ (γράφτηκε 5/7/2026 βράδυ — μετά το τετραπλό enemy phase)
1. PLAYTEST BALANCE PASS — η Maria παίζει τα σημερινά (7 νέοι shooters, boomerang/orb elites, blackout +12%, Whiteout, Frozen Sleet στο Endless, Vault Drop) και μαζεύουμε νούμερα που θέλουν κούρδισμα. Όλα είναι μονογραμμικές αλλαγές.
2. ΥΠΟΛΟΙΠΑ WEAPON BEHAVIORS — BEAM με telegraph (Rift Eye / Pulse Burrower elites, πρότυπο: STUN LANCE Game.js ~16226), SLASH_WAVE/ARC κ.λπ. (9/15 behaviors ακόμα generic bullets).
3. VOID_ZONE chunk hazard — area denial στα void chunks (ARENA/CORRIDOR ήδη ζωντανά).
4. ΒΙΟΤΟΠΟΙ: hazards για τα υπόλοιπα biomes (cryoquakes/ice_growth στο Glacial ως δεύτερο layer, industrial steam vents, abyssal darkness κ.λπ.) — το Whiteout είναι το πρότυπο υλοποίησης.
5. PERFORMANCE: object pooling (enemies/projectiles/particles — ΠΡΟΣΟΧΗ: μεγάλο refactor, σταδιακά με πολύ testing) + pre-rendered UI panel textures (offscreen canvas cache).
6. ΑΠΟΦΑΣΕΙΣ ΤΗΣ MARIA (design): PF economy (19 κερδιζόμενα vs 22 κόστη — φτηνότερος Oni ή περισσότερες πηγές PF ή μένει ως έχει με arena farming), επέκταση αρένας 3×3 → 5×5 chunks για περισσότερη γη στα νέα biomes, Chaos Rank score multiplier (τώρα recognition-only).
7. ΟΡΙΖΟΝΤΑΣ RELEASE: Electron wrapper (Windows exe), QA pass, final balance — Phases E-F του roadmap.
