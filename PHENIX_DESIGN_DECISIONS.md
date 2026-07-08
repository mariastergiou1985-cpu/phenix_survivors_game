# PHENIX: NULL EDEN — Design Decisions (Progression + Enemy Combat)

Working spec recorded from Maria's decisions. Nothing here is coded yet — this is the
approved plan to build against. "TBD" = to be finalized later.

Global rules already locked:
- **Japan Phasewalker** stays locked (COMING SOON).
- **Endless + Chaos Mode** locked until ALL campaign stages are cleared.
- Campaign = **7 stages**: Stage 1–6 + FINAL. Clearing a stage unlocks the next.

---

## PART A — PROGRESSION / LOCK–UNLOCK

### A1. Characters
- **Starter (open):** Cyber Skeleton Warrior (Tank/Survival).
- **Unlock 1 per stage clear** (order CONFIRMED):
  Stage 1 → Neon Taekwondo Girl · Stage 2 → Cyber Arm Hero · Stage 3 → Brawler Warrior ·
  Stage 4 → Assassin Clone · Stage 5 → Euclid Vector · Stage 6 → Oni Cataclysm Protocol.
- **FINAL clear →** Eddie (Thunder/Berserk) — strongest, grand-finale reward (unlocks together
  with Endless + Chaos).
- **Locked:** Japan Phasewalker (COMING SOON).

### A2. Grid Upgrades
- **Core Upgrades (11, Credits)** → OPEN from start. Base grind loop.
  (Option on the table: gate Combat Calibration + Cache Scanner to a mid stage.)
- **Weapon Synergies (8, Cores)** → unlock together with their character (stage-gated).
  Storm Conductor (Skeleton) open; Furnace Chains (Cyber Arm), Crescent Tide (Taekwondo),
  Rift Rebound (Brawler), Plasma Execution (Assassin), Toxic Geometry (Euclid),
  Cataclysm Chain (Oni), Red Thunder (Eddie) follow their character.
- **Protocols (13)** — currently all unlocked; change to gated:
  - PLAYER masteries (5: Elemental, Fusion, Ult Infusion, Character Synergy, Phoenix Revival)
    → unlock progressively per stage (player-power reward).
  - WEATHER+ (4) + ENEMY (4) = 8 → unlock via **Fragments**.

### A3. Fragments (economy)
- Drop **1 per boss** → accumulate a lot.
- Currency for unlocking advanced content. Exact counts/costs **TBD**.

### A4. Collectibles (12)
- **Unchanged** — Endless-only achievements, earned by playing Endless. No fragments, no
  stage-gating. Deep end-game (since Endless is post-campaign).

### A5. Eden Memory Milestones (5) + System Logs (6)
- **Lore.** Locked at start; unlock automatically as Eden Memory rises through campaign
  (bosses/stages). NOT purchasable. Milestones spread across the 7 stages; logs ~1 per boss.

### A6. Boss Echo Archive (6 passives)
- Unlock by **defeating the matching boss** (Serpent, Dragon, Double Demon, Titan, Bloodfang,
  Annihilator). Earned by combat, not bought.

### A7. Secret Skins — "Null Cache" discovery
- Hidden **secret log inside stages**, **randomized** (which skin drops where is random),
  **not every run/stage**.
- Discovery = **exploration + decrypt** (NOT kill, NOT finish):
  a hidden Null Cache spawns at a random map spot, no marker — faint glitch + screen-edge static
  that intensifies as you approach. Reach it, stand ~3s to decrypt → reveals secret log +
  unlocks a random still-locked secret skin.

### A8. OST Jukebox (tracks 05–08 = Eddie themes)
- Unlock only **after Eddie is unlocked** (FINAL) AND by **playing AS Eddie** (survive
  15/20/25/30 min). Reachable from **Act 1 / normal play — NOT Endless/Chaos-gated**.
- Impl note: make "survive X as Eddie" **cumulative** across Eddie runs (or allow long Act 1),
  so 30:00 is reachable without Endless.

### A9. Null Relics (cost = **Fragments + Grids**, both)
- **UNIVERSAL** → unlock across **campaign stages**.
- **BOSS** → unlock by beating the matching boss (Serpent Ember Coil → Serpent; Dragon Cryo
  Heart → Dragon).
- **CHARACTER** → unlock with their character (Oni Blood Circuit → Oni; Crescent Soul Bead →
  Taekwondo; Null Venom Chamber → Euclid; Mirror Kill Protocol → Assassin).
- **ARENA** → unlock from **Endless / Null Breach Arena** (post-campaign).
- Note: re-tag "Null Riff Capacitor" (Character: eddie) into the CHARACTER tab.

### A10. Hangar — Vessels
- **Alpha Phoenix** = Balanced Starter, open from start.
- **Grid Eraser** = the ONE vessel that unlocks in campaign.
- Rest (Null Singularity, Glitch Phantom, Overclocked Vanguard) → **Endless and onward**.
- Cost fragments + grids where applicable.

### A11. Cyber-Pets
- **Byte-Mite** = the ONE pet that unlocks in campaign.
- Rest (Data Miner Drone, Firewall Sentinel, Error-Code Bomber) → **Endless and onward**.

---

## PART B — ENEMY COMBAT PLAN

Global enemy attack rules (all of them):
- **Automatic** on cooldown, with **auto-aim / auto-focus on the player** (slight lead),
  **moderate accuracy** (decent chance to hit, not perfect).
- **Varied behaviors — not just straight bursts.** Behavior types used below:
  - `BOLT` aimed projectile · `VOLLEY` fan of projectiles · `BEAM/LASER` telegraphed sweep ·
    `SWIRL` spiral/orbit shed · `RAIN` falls over area near player · `LOB` arcs to AoE puddle ·
    `DASH` lunge/charge · `RING` expanding shockwave.

Assets:
- Ambient (aura per enemy): `biome_eden_bloom_pulse` (green), `biome_null_void_orb` (void/dark),
  `biome_solar_flare` (gold), `biome_storm_spark` (electric).
- Attacks (19): see inventory in text.

### B1. Minions (all 5 spawn in EVERY stage)
| Enemy | Ambient | Attack (asset) | Behavior |
|---|---|---|---|
| glitch_drone | storm_spark | arc_circuit_beam | short auto-aim **LASER** zap that tracks briefly |
| razorhound | null_void_orb | bone_shockwave (+ lightning_kick_arc) | **DASH** to player → **RING** shockwave on arrival |
| rogue_punk | storm_spark | violet_spectral_needle | aimed **VOLLEY** of 2–3 needles (the "standard" grunt) |
| security_defector_mech | solar_flare | cyber_arm_pulse_beam (+ magma_reaver_lance) | heavy **BEAM** sweep; occasional lance **RAIN** |
| stealth_infiltrator | null_void_orb | blacknet_scythe_arc (+ abyss_rift_blade) | blink **DASH** → scythe swipe; thrown **BOLT** blade |

### B2. Minis / Elites (also spawn in every stage, with minions)
(Names matched to the art Maria sent + minis-folder candidates.)
| Elite (art) | Ambient | Attack (asset) | Behavior |
|---|---|---|---|
| Teal centipede (cryo-claw / burrower) | null_void_orb | cryo_shard_lance (+ ice_strike_warning telegraph) | burrow, resurface under player → ice-shard **RAIN** |
| Golden winged seraph (solar-tyrant) | solar_flare | seraph_vector_javelin (+ eden_star_lance) | rotating javelin **SWIRL** + big aimed star-lance **BOLT** |
| Purple electric spider (void-widow) | storm_spark | prism_wing_bolt (+ arc_circuit_beam) | **SWIRL** bolts spiral outward + slow; electric tether |
| Blue volt-rat | storm_spark | lightning_kick_arc (+ arc_circuit_beam) | zig-zag electric **DASH**; short zap |
| Pink demon-eye orb (rift-eye) | null_void_orb | null_sigil_beam (+ null_rupture_orb) | big telegraphed **LASER** sweep + lobbed orb **LOB** |
| Gold cyber-wasp (solar-stinger) | solar_flare | solar_halo_bolt (+ void_ember_comet) | hover then **DASH** dive-sting + halo **BOLT** burst |
| Green toxic scarab (ember-scarab/toxin-leech) | eden_bloom_pulse | toxic_data_spear (+ aether_crescent_chakram) | toxic-spear **RAIN**/**LOB** leaving puddles + spinning chakram |

### B3. Reserved / scale-up for ELITE WAVES + BOSSES
Big, dramatic attacks kept (or scaled up) for elite waves and bosses:
- `magma_reaver_lance`, `void_ember_comet`, `eden_star_lance`, `null_rupture_orb`,
  `aether_crescent_chakram`, `abyss_rift_blade`.
- Bosses combine 2–3 behaviors (e.g., BEAM sweep + RAIN + RING) at larger scale/HP.
- As Maria adds more enemy art (the big folder), each new elite gets: 1 ambient + 1 primary
  attack (+ optional secondary) + a behavior — recorded here to avoid overlap.

### B4. Bosses (campaign)
**Rule:** 3 bosses appear as encounters in EVERY stage; the final boss appears ONLY in the
FINAL stage. All bosses are **AGGRESSIVE** (actively pursue + attack, never passive). HP and
damage are inherited from the existing balance in the other modes (unchanged). Each boss below
gets a movement pattern + an attack kit built from the attack assets (2–3 behaviors combined).

Recurring (ALL stages):
| Boss (file) | Movement | Attack kit (assets) → behaviors |
|---|---|---|
| **cyber_serpent_boss** (silver/blue mech, beam-blade + claw) | closes distance aggressively, dashes in | cyber_arm_pulse_beam → sweeping blue **LASER**; abyss_rift_blade → **DASH** claw slash + **RING** on impact; null_sigil_beam → cross-beam |
| **matrix_annihilator** (multi-cannon crab-mech) | strafes/holds mid-range, repositions | null_rupture_orb / magma_reaver_lance → cannon **RAIN/barrage**; solar_halo_bolt → aimed **VOLLEY**; aether_crescent_chakram → **SWIRL** saw |
| **ai_overload_titan** (purple crystal demon-mech, lightning) | slow heavy advance, stomps, area control | lightning_kick_arc / arc_circuit_beam → **chain lightning** field; eden_star_lance → core **LASER** cross-beam; bone_shockwave → **RING** stomp |

Final (FINAL stage ONLY):
| Boss (file) | Notes |
|---|---|
| **ai_overlord** (throne emperor + purple wraith) | Ultimate multi-phase boss. Combines everything: null_sigil_beam massive **LASER**, void_ember_comet **RAIN** of comets, aether_crescent_chakram **SWIRL**, null_rupture_orb barrage, summons adds. Most aggressive, highest HP/damage. |

Not used in campaign stages (reserved for Endless / other modes): `cyber_dragon_boss`,
`double_demons`, `bloodfang_packmaster`.

---

## PART C — EVENTS / WEATHER / FX (campaign stages)
- **No combat wave-events in stages.** The System Events (drone_swarm, core_raiders,
  security_mech, overload_surge, hunter_squad, grid_blackout, firewall_purge, mega_boss,
  core_meltdown) do **NOT** run in campaign stages. Stages are curated: minions + minis +
  the 3 recurring bosses (final boss on FINAL).
- **Curated additions that DO go in stages:**
  - **Secret-skin Null Cache** → uses `assets/events/supply_drop/null_supply_secret_log_catche.png`
    (this is the "Null Cache" discovery art from A7 — explore + decrypt to unlock a secret skin).
  - **Weather: `assets/events/weather/rocket_rain.png`** → wire this in (currently unused anywhere).
  - **`assets/events/weather/weather_effects_sheet.png`** → wire in.
- **Use Maria's own art everywhere** (permanent ART RULE — only corrections allowed: alpha/
  wiring/sizing; never replace with generated/procedural).
- **NpcWalker (ally) stays** as a helper NPC in the stages (fine as-is).

## PART D — AUDIO
- Wire/verify correctly the SFX for: **weapon sounds**, **death sounds**, and **impact/hit
  sounds** across the game. (Implementation pass during build.)

---

### Open items to finalize with Maria
1. Exact **character → stage** unlock order.
2. **Fragment economy** numbers (drop rate confirmed 1/boss; costs TBD).
3. Confirm the **minis ↔ candidate filenames** once the full art folder is shared.
4. Whether any Core Upgrades get stage-gated (currently: all open).
