# CHARACTER FUSION ARMORY — Canonical Design Matrix

Παρήχθη: 2026-08-01 · Batch A · 20 Fusions · 10/10 roster · ENDLESS/CHAOS ONLY

## Κανόνες συστήματος

- Recipe: **Signature Weapon (Lv5/evolved) + Weapon B (Lv3+) + Weapon C (Lv3+)** — μέσα στο run, στα πραγματικά Build Engine slots.
- Κάρτα: μόνιμη αγορά στο UPGRADES → FUSIONS tab με **Protocol Fragments + Grid Cores** (και τα δύο, atomic, MetaProgress.tryBuyFusionCard, save field fusionCards).
- Κόστη: Tier 1 = 40 PF + 2000 Grids · Tier 2 = 15 PF + 1500 Grids · Tier 3 = 25 PF + 3000 Grids.
- Acquisition: guaranteed level-up κάρτα (fusion opportunity) όταν ισχύουν ΟΛΑ: Endless/Chaos, σωστός χαρακτήρας, αγορασμένη κάρτα, 3/3 weapons στα levels, όχι ήδη αποκτημένο στο run.
- Audio hooks ανά fusion: _manifest / _charge / _travel / _impact / _aftermath (authored σε επόμενο Wave — μέχρι τότε distinct procedural voice ανά fusion).

---

## OSSUARY IMPALER  `fus_ossuary_impaler`

**Χαρακτήρας:** Skeleton Warrior `skeleton_warrior`  
**Recipe:** Marrow Spitter (signature, Lv5) + Null Lance (Lv3+) + Gravity Core (Lv3+)  
**Αντικαθιστά:** Marrow Spitter  
**Gameplay role:** lane execution + crowd pull  
**Core mechanic:** Assembles a colossal bone-null lance, impales the densest lane (pierce ALL), tears a gravity rift at its terminus that drags victims in, then detonates a radial bone nova.  
**Activation cycle:** manifestation → charge → deployment/travel → impact → secondary → aftermath → cooldown (11/9.5/8s ανά tier)  
**Damage profile:** boss multiplier 0.6 (πάντα μέσω _dealDamage → _capBossDamage) · hard caps: {"activeLances":1,"riftFields":1,"novaShards":18}  
**Visual identity:** palette core #efe9d3 / glow #8f7bff / accent #41306e  
**Asset:** `assets/weapons/fusions/skeleton_warrior/fus_ossuary_impaler.png` (1024×1024 RGBA)  
**Tiers:**

- Tier 1 — full cycle: lance → gravity rift → bone nova.
- Tier 2 — +25% lane/rift/nova damage, faster cycle, wider rift.
- Tier 3 — MARROW ECHO: the nova leaves 3 impaled bone pylons that fire one splinter volley each before crumbling.

**Chaos enhancement (hard-capped):** {"riftDurMult":1.35,"novaDmgMult":1.2,"extraPylon":1}

**Audio hooks:** `fus_ossuary_impaler_manifest` · `fus_ossuary_impaler_charge` · `fus_ossuary_impaler_travel` · `fus_ossuary_impaler_impact` · `fus_ossuary_impaler_aftermath`

---

## BLACK PSALM CHOIR  `fus_black_psalm_choir`

**Χαρακτήρας:** Skeleton Warrior `skeleton_warrior`  
**Recipe:** Grave Cantor (signature, Lv5) + Ion Halo (Lv3+) + Blacknet Swarm Drone (Lv3+)  
**Αντικαθιστά:** Grave Cantor  
**Gameplay role:** orbiting fortress + dive-bomb chains  
**Core mechanic:** An orbiting fortress of 4 electro-reliquary skulls. Choir pulses charge them with ions; a fully charged skull detaches, dive-bombs the densest cluster and detonates in chain lightning, then re-forms.  
**Activation cycle:** manifestation → charge → deployment/travel → impact → secondary → aftermath → cooldown (undefineds ανά tier)  
**Damage profile:** boss multiplier 0.65 (πάντα μέσω _dealDamage → _capBossDamage) · hard caps: {"skulls":5,"simultaneousDives":2,"chainsPerDive":6}  
**Visual identity:** palette core #e6f6ff / glow #39d7ff / accent #0f4a5e  
**Asset:** `assets/weapons/fusions/skeleton_warrior/fus_black_psalm_choir.png` (1024×1024 RGBA)  
**Tiers:**

- Tier 1 — full cycle: choir pulses → charged skull dive → chain lightning.
- Tier 2 — +1 chain, stronger pulses, faster re-forming.
- Τier 3 — REQUIEM VERSE: a 5th skull joins, and every dive leaves a psalm field (2s) that slows and shocks inside it.

**Chaos enhancement (hard-capped):** {"extraChain":2,"reformMult":0.8,"fieldDurMult":1.3}

**Audio hooks:** `fus_black_psalm_choir_manifest` · `fus_black_psalm_choir_charge` · `fus_black_psalm_choir_travel` · `fus_black_psalm_choir_impact` · `fus_black_psalm_choir_aftermath`

---

## CYCLONE METRONOME  `fus_cyclone_metronome`

**Χαρακτήρας:** Taekwondo Girl `taekwondo_girl`  
**Recipe:** Vector Heel (signature, Lv5) + Storm Sash (Lv3+) + Ion Halo (Lv3+)  
**Αντικαθιστά:** Vector Heel  
**Gameplay role:** growing directional sweep + drag  
**Core mechanic:** Launches a travelling cyclone that GROWS as it sweeps, dragging light enemies along its wall; at apex it discharges chain lightning through everything it carries, then collapses into a static aura.  
**Activation cycle:** manifestation → charge → deployment/travel → impact → secondary → aftermath → cooldown (9/8/7s ανά tier)  
**Damage profile:** boss multiplier 0.6 (πάντα μέσω _dealDamage → _capBossDamage) · hard caps: {"activeCyclones":1,"draggedEnemies":24,"chains":8}  
**Visual identity:** palette core #fff2e0 / glow #ff9d2e / accent #7a3b0e  
**Asset:** `assets/weapons/fusions/taekwondo_girl/fus_cyclone_metronome.png` (1024×1024 RGBA)  
**Tiers:**

- Tier 1 — full cycle: growing cyclone → drag → apex chain discharge → aura.
- Tier 2 — bigger apex radius, +1 chain, +27% wall damage.
- Tier 3 — DOUBLE TIME: the metronome ticks twice — a second, mirrored cyclone launches in the opposite direction.

**Chaos enhancement (hard-capped):** {"radiusMult":1.15,"dragMult":1.3,"extraChain":1}

**Audio hooks:** `fus_cyclone_metronome_manifest` · `fus_cyclone_metronome_charge` · `fus_cyclone_metronome_travel` · `fus_cyclone_metronome_impact` · `fus_cyclone_metronome_aftermath`

---

## EYE OF THE NULL STORM  `fus_null_storm_eye`

**Χαρακτήρας:** Taekwondo Girl `taekwondo_girl`  
**Recipe:** Storm Sash (signature, Lv5) + Gravity Core (Lv3+) + Null Lance (Lv3+)  
**Αντικαθιστά:** Storm Sash  
**Gameplay role:** persistent compression field + radial lances  
**Core mechanic:** Deploys a stationary hurricane: the gravity eye compresses enemies onto the eyewall where ribbon blades tick; the eye periodically fires null lances radially at the survivors; collapse squeezes everything inward once.  
**Activation cycle:** manifestation → charge → deployment/travel → impact → secondary → aftermath → cooldown (13/11.5/10s ανά tier)  
**Damage profile:** boss multiplier 0.55 (πάντα μέσω _dealDamage → _capBossDamage) · hard caps: {"activeStorms":1,"lancesPerBurst":6}  
**Visual identity:** palette core #eafff4 / glow #2ef2a0 / accent #0e5e3f  
**Asset:** `assets/weapons/fusions/taekwondo_girl/fus_null_storm_eye.png` (1024×1024 RGBA)  
**Tiers:**

- Tier 1 — full cycle: eye deploy → compression + wall ticks → radial null lances → collapse.
- Tier 2 — longer, wider storm, +1 lance, +25% wall damage.
- Tier 3 — STILLPOINT: enemies that die on the eyewall detonate as micro null-rifts (chain reaction).

**Chaos enhancement (hard-capped):** {"durMult":1.3,"compressMult":1.25,"lanceEveryMult":0.8}

**Audio hooks:** `fus_null_storm_eye_manifest` · `fus_null_storm_eye_charge` · `fus_null_storm_eye_travel` · `fus_null_storm_eye_impact` · `fus_null_storm_eye_aftermath`

---

## TECTONIC MAW  `fus_tectonic_maw`

**Χαρακτήρας:** Brawler `brawler_warrior`  
**Recipe:** Faultline Fist (signature, Lv5) + Gravity Core (Lv3+) + Magma Uppercut (Lv3+)  
**Αντικαθιστά:** Faultline Fist  
**Gameplay role:** sinkhole compression + eruption  
**Core mechanic:** Splits the ground into a star of faultlines that SINK into a gravity sinkhole, dragging ranks in; a magma geyser erupts from the bottom, and the burnt crust keeps cooking whatever crawls out.  
**Activation cycle:** manifestation → charge → deployment/travel → impact → secondary → aftermath → cooldown (12/10.5/9s ανά tier)  
**Damage profile:** boss multiplier 0.6 (πάντα μέσω _dealDamage → _capBossDamage) · hard caps: {"activeMaws":1,"crackArms":6}  
**Visual identity:** palette core #ffe9c9 / glow #ff6a2e / accent #7a2e0e  
**Asset:** `assets/weapons/fusions/brawler_warrior/fus_tectonic_maw.png` (1024×1024 RGBA)  
**Tiers:**

- Tier 1 — full cycle: faultline star → sinkhole pull → magma geyser → burning crust.
- Tier 2 — bigger maw, +25% geyser damage, longer sink.
- Tier 3 — AFTERSHOCK JAW: the maw bites TWICE — a second, offset sinkhole opens where most enemies fled.

**Chaos enhancement (hard-capped):** {"radiusMult":1.2,"pullMult":1.25,"crustDurMult":1.4}

**Audio hooks:** `fus_tectonic_maw_manifest` · `fus_tectonic_maw_charge` · `fus_tectonic_maw_travel` · `fus_tectonic_maw_impact` · `fus_tectonic_maw_aftermath`

---

## PYROCLAST PAYLOAD  `fus_pyroclast_payload`

**Χαρακτήρας:** Brawler `brawler_warrior`  
**Recipe:** Magma Uppercut (signature, Lv5) + Nano Mine (Lv3+) + Null Lance (Lv3+)  
**Αντικαθιστά:** Magma Uppercut  
**Gameplay role:** cinematic mine corridor + chain detonation  
**Core mechanic:** An uppercut launches a molten payload that separates mid-air and rains a corridor of magma mines; ignited threads lace the mines, burning whoever crosses, then the corridor detonates in sequence.  
**Activation cycle:** manifestation → charge → deployment/travel → impact → secondary → aftermath → cooldown (11/10/9s ανά tier)  
**Damage profile:** boss multiplier 0.6 (πάντα μέσω _dealDamage → _capBossDamage) · hard caps: {"corridors":1,"mines":8,"burningEnemies":30}  
**Visual identity:** palette core #fff3d6 / glow #ffb02e / accent #8a4a0e  
**Asset:** `assets/weapons/fusions/brawler_warrior/fus_pyroclast_payload.png` (1024×1024 RGBA)  
**Tiers:**

- Tier 1 — full cycle: launch → separation → mine corridor → threads → sequential detonation.
- Tier 2 — longer corridor, +1 mine, +24% detonation damage.
- Tier 3 — NULL PRIMER: the final mine collapses into a null implosion that pulls and pierces (mini rift).

**Chaos enhancement (hard-capped):** {"extraMine":1,"threadDmgMult":1.3,"waveDmgMult":1.15}

**Audio hooks:** `fus_pyroclast_payload_manifest` · `fus_pyroclast_payload_charge` · `fus_pyroclast_payload_travel` · `fus_pyroclast_payload_impact` · `fus_pyroclast_payload_aftermath`

---

## COMPASS OF RUIN  `fus_compass_of_ruin`

**Χαρακτήρας:** Euclid `euclid_vector`  
**Recipe:** Axiom Ray (signature, Lv5) + Phi Cutter (Lv3+) + Ion Halo (Lv3+)  
**Αντικαθιστά:** Axiom Ray  
**Gameplay role:** rotating beam sweep + boundary field  
**Core mechanic:** Inscribes a lethal circle; two beam hands sweep it like a clock while the circumference burns as a boundary field; where beam meets boundary, ion arcs split off and chain inward. Closing the circle stamps a Q.E.D. burst.  
**Activation cycle:** manifestation → charge → deployment/travel → impact → secondary → aftermath → cooldown (12/11/10s ανά tier)  
**Damage profile:** boss multiplier 0.55 (πάντα μέσω _dealDamage → _capBossDamage) · hard caps: {"activeCompasses":1,"arcsAlive":8}  
**Visual identity:** palette core #eaf6ff / glow #5aa2ff / accent #1e3f8a  
**Asset:** `assets/weapons/fusions/euclid_vector/fus_compass_of_ruin.png` (1024×1024 RGBA)  
**Tiers:**

- Tier 1 — full cycle: inscribe → boundary + sweeping beam hands → ion splits → Q.E.D.
- Tier 2 — wider circle, +26% boundary/hand damage, third split arc.
- Tier 3 — COROLLARY: after Q.E.D., the two beam hands detach and scissor once across the whole arena diameter.

**Chaos enhancement (hard-capped):** {"durMult":1.25,"sweepMult":1.25,"qedDmgMult":1.2}

**Audio hooks:** `fus_compass_of_ruin_manifest` · `fus_compass_of_ruin_charge` · `fus_compass_of_ruin_travel` · `fus_compass_of_ruin_impact` · `fus_compass_of_ruin_aftermath`

---

## GOLDEN COLLAPSE  `fus_golden_collapse`

**Χαρακτήρας:** Euclid `euclid_vector`  
**Recipe:** Phi Cutter (signature, Lv5) + Gravity Core (Lv3+) + Nano Mine (Lv3+)  
**Αντικαθιστά:** Phi Cutter  
**Gameplay role:** spiral compression + sequential detonation  
**Core mechanic:** Lays nano-mine nodes along a golden spiral; gravity rolls enemies along the spiral path toward the centre while nodes detonate in Fibonacci sequence from the outside in, ending in a central implosion.  
**Activation cycle:** manifestation → charge → deployment/travel → impact → secondary → aftermath → cooldown (12/11/10s ανά tier)  
**Damage profile:** boss multiplier 0.55 (πάντα μέσω _dealDamage → _capBossDamage) · hard caps: {"activeSpirals":1,"nodes":9}  
**Visual identity:** palette core #fff8dc / glow #ffd447 / accent #8a6a1e  
**Asset:** `assets/weapons/fusions/euclid_vector/fus_golden_collapse.png` (1024×1024 RGBA)  
**Tiers:**

- Tier 1 — full cycle: spiral nodes → gravity roll inward → sequential detonation → implosion.
- Tier 2 — wider spiral, +1 node, +24% implosion damage.
- Tier 3 — PERFECT PROOF: enemies killed by node blasts leave golden shards that arc to the centre and amplify the implosion (up to +60%).

**Chaos enhancement (hard-capped):** {"pullMult":1.3,"nodeGapMult":0.8,"residueDurMult":1.5}

**Audio hooks:** `fus_golden_collapse_manifest` · `fus_golden_collapse_charge` · `fus_golden_collapse_travel` · `fus_golden_collapse_impact` · `fus_golden_collapse_aftermath`

---

## HUNGRY HELL FEAST  `fus_hungry_hell_feast`

**Χαρακτήρας:** Oni `oni_cataclysm_protocol`  
**Recipe:** Hannya Cleaver (signature, Lv5) + Hungry Spirit Lantern (Lv3+) + Gravity Core (Lv3+)  
**Αντικαθιστά:** Hannya Cleaver  
**Gameplay role:** dimensional execution maw + soul-fed finisher  
**Core mechanic:** Tears open a demon maw; lantern spirits herd feared enemies in while gravity pulls. The maw EXECUTES non-bosses below an HP threshold; every soul eaten feeds a final colossal cleaver bite.  
**Activation cycle:** manifestation → charge → deployment/travel → impact → secondary → aftermath → cooldown (14/12.5/11s ανά tier)  
**Damage profile:** boss multiplier 0.55 (πάντα μέσω _dealDamage → _capBossDamage) · hard caps: {"activeMaws":1,"spirits":3,"soulsCounted":12}  
**Visual identity:** palette core #ffe3e3 / glow #ff3b4d / accent #7a0e1e  
**Asset:** `assets/weapons/fusions/oni_cataclysm_protocol/fus_hungry_hell_feast.png` (1024×1024 RGBA)  
**Tiers:**

- Tier 1 — full cycle: tear → herd + pull → execution feast → soul-fed cleaver bite.
- Tier 2 — higher execution threshold, bigger maw, +22% bite damage.
- Tier 3 — SECOND COURSE: if the feast reaches its soul cap, the maw ROARS — a fear nova that resets the spirits for one bonus herd-and-bite.

**Chaos enhancement (hard-capped):** {"execPctBonus":0.04,"soulCapBonus":4,"durMult":1.25}

**Audio hooks:** `fus_hungry_hell_feast_manifest` · `fus_hungry_hell_feast_charge` · `fus_hungry_hell_feast_travel` · `fus_hungry_hell_feast_impact` · `fus_hungry_hell_feast_aftermath`

---

## NIGHT PARADE  `fus_night_parade`

**Χαρακτήρας:** Oni `oni_cataclysm_protocol`  
**Recipe:** Hungry Spirit Lantern (signature, Lv5) + Blacknet Swarm Drone (Lv3+) + Ion Halo (Lv3+)  
**Αντικαθιστά:** Hungry Spirit Lantern  
**Gameplay role:** marching summon wall + moving ion fence  
**Core mechanic:** Summons a procession of six lantern spirits that march in line across the arena — a moving fence of ion arcs strung between them, burning and fearing everything the parade walks through.  
**Activation cycle:** manifestation → charge → deployment/travel → impact → secondary → aftermath → cooldown (13/11.5/10s ανά tier)  
**Damage profile:** boss multiplier 0.6 (πάντα μέσω _dealDamage → _capBossDamage) · hard caps: {"parades":1,"lanterns":7}  
**Visual identity:** palette core #fdeaff / glow #c26bff / accent #5a1e8a  
**Asset:** `assets/weapons/fusions/oni_cataclysm_protocol/fus_night_parade.png` (1024×1024 RGBA)  
**Tiers:**

- Tier 1 — full cycle: summon procession → march → ion fence → lantern end-bursts.
- Tier 2 — longer march, +25% fence damage, stronger bursts.
- Tier 3 — RETURN PROCESSION: the parade turns at the end of its path and marches BACK through the survivors once.

**Chaos enhancement (hard-capped):** {"extraLantern":1,"marchDurMult":1.2,"fenceDmgMult":1.25}

**Audio hooks:** `fus_night_parade_manifest` · `fus_night_parade_charge` · `fus_night_parade_travel` · `fus_night_parade_impact` · `fus_night_parade_aftermath`

---

## FERROMAG PILEDRIVER  `fus_ferromag_piledriver`

**Χαρακτήρας:** Cyber-Arm `cyber_arm_hero`  
**Recipe:** Hydraulic Knuckle (signature, Lv5) + Magnetic Shrapnel (Lv3+) + Ion Halo (Lv3+)  
**Αντικαθιστά:** Hydraulic Knuckle  
**Gameplay role:** assembly punch + shrapnel yank-back  
**Core mechanic:** Shrapnel and ions assemble a rail-gauntlet on the arm; the piston fires a magnetized shockwave line that embeds fragments in victims — one second later every fragment is YANKED back through them to the fist, arcing ions between the wounded.  
**Activation cycle:** manifestation → charge → deployment/travel → impact → secondary → aftermath → cooldown (10/9/8s ανά tier)  
**Damage profile:** boss multiplier 0.65 (πάντα μέσω _dealDamage → _capBossDamage) · hard caps: {"activePunches":1,"embeddedFrags":12,"arcs":6}  
**Visual identity:** palette core #eef4ff / glow #7ba6ff / accent #2e4a8a  
**Asset:** `assets/weapons/fusions/cyber_arm_hero/fus_ferromag_piledriver.png` (1024×1024 RGBA)  
**Tiers:**

- Tier 1 — full cycle: assembly → piston line punch → embed → yank-back → ion arcs.
- Tier 2 — +25% punch/yank damage, +2 fragments, longer line.
- Tier 3 — OVERPRESSURE: the yank-back compresses victims toward the fist line and slams them with a second, shorter piston.

**Chaos enhancement (hard-capped):** {"extraFrags":2,"arcDmgMult":1.3,"cdMult":0.9}

**Audio hooks:** `fus_ferromag_piledriver_manifest` · `fus_ferromag_piledriver_charge` · `fus_ferromag_piledriver_travel` · `fus_ferromag_piledriver_impact` · `fus_ferromag_piledriver_aftermath`

---

## SCRAPSTORM FOUNDRY  `fus_scrapstorm_foundry`

**Χαρακτήρας:** Cyber-Arm `cyber_arm_hero`  
**Recipe:** Magnetic Shrapnel (signature, Lv5) + Nano Mine (Lv3+) + Blacknet Swarm Drone (Lv3+)  
**Αντικαθιστά:** Magnetic Shrapnel  
**Gameplay role:** orbiting scrap shield + forged homing drones  
**Core mechanic:** A rotating debris ring grinds enemies on contact; every few hits the foundry FORGES a homing scrap-drone that seeks dense clusters and bursts into a nanite cone. On expiry the ring collapses outward as one final shard nova.  
**Activation cycle:** manifestation → charge → deployment/travel → impact → secondary → aftermath → cooldown (12/11/10s ανά tier)  
**Damage profile:** boss multiplier 0.6 (πάντα μέσω _dealDamage → _capBossDamage) · hard caps: {"rings":1,"dronesAlive":5,"shards":14}  
**Visual identity:** palette core #fff0e6 / glow #ff8a4d / accent #8a3e1e  
**Asset:** `assets/weapons/fusions/cyber_arm_hero/fus_scrapstorm_foundry.png` (1024×1024 RGBA)  
**Tiers:**

- Tier 1 — full cycle: scrap ring → grind → forge homing drones → end nova.
- Tier 2 — +24% grind/drone damage, +1 drone cap, longer ring.
- Tier 3 — SMELTDOWN: drones leave molten nano-slag pools where they burst (2s tick fields).

**Chaos enhancement (hard-capped):** {"ringDmgMult":1.25,"hitsPerDroneMult":0.75,"slagDurMult":1.4}

**Audio hooks:** `fus_scrapstorm_foundry_manifest` · `fus_scrapstorm_foundry_charge` · `fus_scrapstorm_foundry_travel` · `fus_scrapstorm_foundry_impact` · `fus_scrapstorm_foundry_aftermath`

---

## WIDOW'S LOOM  `fus_widows_loom`

**Χαρακτήρας:** Assassin `assassin_clone`  
**Recipe:** Monowire Lash (signature, Lv5) + Toxin Kunai (Lv3+) + Nano Mine (Lv3+)  
**Αντικαθιστά:** Monowire Lash  
**Gameplay role:** web lattice field + venom cinch execution  
**Core mechanic:** Pins kunai nodes in a ring and weaves a monowire web between them; crossing a wire cuts and stacks venom. At five stacks the loom CINCHES — executing marked non-bosses below threshold and bursting everything else.  
**Activation cycle:** manifestation → charge → deployment/travel → impact → secondary → aftermath → cooldown (13/11.5/10s ανά tier)  
**Damage profile:** boss multiplier 0.55 (πάντα μέσω _dealDamage → _capBossDamage) · hard caps: {"looms":1,"nodes":8,"executionsPerCinch":10}  
**Visual identity:** palette core #f2ffe6 / glow #8aff3b / accent #3e7a0e  
**Asset:** `assets/weapons/fusions/assassin_clone/fus_widows_loom.png` (1024×1024 RGBA)  
**Tiers:**

- Tier 1 — full cycle: pin nodes → weave → venom cuts → cinch execution → toxic dissolve.
- Tier 2 — +1 node, wider loom, higher execution threshold.
- Tier 3 — BLACK WIDOW: the cinch re-weaves once — a second, tighter loom forms instantly at half radius.

**Chaos enhancement (hard-capped):** {"venomPerCutBonus":1,"execPctBonus":0.04,"durMult":1.25}

**Audio hooks:** `fus_widows_loom_manifest` · `fus_widows_loom_charge` · `fus_widows_loom_travel` · `fus_widows_loom_impact` · `fus_widows_loom_aftermath`

---

## PHANTOM NEEDLE PROTOCOL  `fus_phantom_needle_protocol`

**Χαρακτήρας:** Assassin `assassin_clone`  
**Recipe:** Toxin Kunai (signature, Lv5) + Null Lance (Lv3+) + Blacknet Swarm Drone (Lv3+)  
**Αντικαθιστά:** Toxin Kunai  
**Gameplay role:** homing triple assassination + poison chains  
**Core mechanic:** Tracking sigils mark the three toughest enemies on screen; phantom drones deliver homing null-needles that strike ALL marks simultaneously, each detonating a poison burst that chains to nearby enemies. Bosses take a shredded-armor window instead of the execution bonus.  
**Activation cycle:** manifestation → charge → deployment/travel → impact → secondary → aftermath → cooldown (10/9/8s ανά tier)  
**Damage profile:** boss multiplier 0.65 (πάντα μέσω _dealDamage → _capBossDamage) · hard caps: {"volleys":1,"needles":3,"chainsPerBurst":4}  
**Visual identity:** palette core #eee6ff / glow #a63bff / accent #4a0e7a  
**Asset:** `assets/weapons/fusions/assassin_clone/fus_phantom_needle_protocol.png` (1024×1024 RGBA)  
**Tiers:**

- Tier 1 — full cycle: mark 3 → phantom delivery → simultaneous strike → poison chains.
- Tier 2 — +24% needle damage, +1 chain, faster protocol.
- Tier 3 — CONTINGENCY CLAUSE: if any marked target survives the needle, a second needle re-strikes it after 0.6s (once).

**Chaos enhancement (hard-capped):** {"extraMark":1,"chainDmgMult":1.25,"cdMult":0.85}

**Audio hooks:** `fus_phantom_needle_protocol_manifest` · `fus_phantom_needle_protocol_charge` · `fus_phantom_needle_protocol_travel` · `fus_phantom_needle_protocol_impact` · `fus_phantom_needle_protocol_aftermath`

---

## DIE OF FATES  `fus_die_of_fates`

**Χαρακτήρας:** Phasewalker `japan_phasewalker`  
**Recipe:** Probability Disc (signature, Lv5) + Phase Needle (Lv3+) + Null Lance (Lv3+)  
**Αντικαθιστά:** Probability Disc  
**Gameplay role:** rolling crusher + rotating face effects  
**Core mechanic:** A colossal quantum die rolls across the arena, crushing what it lands on; every bounce resolves a different face — needle nova, phase rift, lance volley or a time-slow field — cycling deterministically through all four.  
**Activation cycle:** manifestation → charge → deployment/travel → impact → secondary → aftermath → cooldown (11/10/9s ανά tier)  
**Damage profile:** boss multiplier 0.6 (πάντα μέσω _dealDamage → _capBossDamage) · hard caps: {"dice":1,"fieldsAlive":2,"novaNeedles":10}  
**Visual identity:** palette core #e6fbff / glow #3bffd0 / accent #0e7a6a  
**Asset:** `assets/weapons/fusions/japan_phasewalker/fus_die_of_fates.png` (1024×1024 RGBA)  
**Tiers:**

- Tier 1 — full cycle: manifest die → roll → per-bounce face effects → shatter.
- Tier 2 — +1 bounce, +25% crush/face damage.
- Tier 3 — LOADED DICE: the final bounce resolves ALL FOUR faces at once.

**Chaos enhancement (hard-capped):** {"extraBounce":1,"faceDmgMult":1.2,"slowBonus":0.1}

**Audio hooks:** `fus_die_of_fates_manifest` · `fus_die_of_fates_charge` · `fus_die_of_fates_travel` · `fus_die_of_fates_impact` · `fus_die_of_fates_aftermath`

---

## EVENT HORIZON ROULETTE  `fus_event_horizon_roulette`

**Χαρακτήρας:** Phasewalker `japan_phasewalker`  
**Recipe:** Probability Disc (signature, Lv5) + Ion Halo (Lv3+) + Gravity Core (Lv3+)  
**Αντικαθιστά:** — (additive layer)  
**Gameplay role:** wheel fortress + pull + ricochet payouts  
**Core mechanic:** A wide roulette wheel of phase orbs spins around the player while gravity drags enemies onto the rim; every three seconds the ball lands and the chosen orb fires as a rerolling ricochet disc, ion arcs bridging wheel and disc in flight. On expiry the wheel collapses inward in one pulse.  
**Activation cycle:** manifestation → charge → deployment/travel → impact → secondary → aftermath → cooldown (13/12/11s ανά tier)  
**Damage profile:** boss multiplier 0.55 (πάντα μέσω _dealDamage → _capBossDamage) · hard caps: {"wheels":1,"discsAlive":2,"orbs":10}  
**Visual identity:** palette core #fff0fa / glow #ff5ad0 / accent #8a0e5e  
**Asset:** `assets/weapons/fusions/japan_phasewalker/fus_event_horizon_roulette.png` (1024×1024 RGBA)  
**Tiers:**

- Tier 1 — full cycle: wheel manifest → spin + pull → payouts → collapse pulse.
- Tier 2 — +1 orb, +24% rim/payout damage, longer wheel.
- Tier 3 — DOUBLE ZERO: payouts fire TWO discs in opposite directions.

**Chaos enhancement (hard-capped):** {"payoutEveryMult":0.75,"pullMult":1.3,"extraOrb":1}

**Audio hooks:** `fus_event_horizon_roulette_manifest` · `fus_event_horizon_roulette_charge` · `fus_event_horizon_roulette_travel` · `fus_event_horizon_roulette_impact` · `fus_event_horizon_roulette_aftermath`

---

## WALL OF SOUND  `fus_wall_of_sound`

**Χαρακτήρας:** Eddie `eddie`  
**Recipe:** Solo Red Thunder (signature, Lv5) + Feedback Cabinet (Lv3+) + Ion Halo (Lv3+)  
**Αντικαθιστά:** Feedback Cabinet  
**Gameplay role:** deployed stage front + beat-synced solo sweep  
**Core mechanic:** Raises two amp towers bridged by an ion arc; pressure waves roll forward on the beat, shoving the crowd back — and every fourth beat a red lightning solo sweeps the whole front.  
**Activation cycle:** manifestation → charge → deployment/travel → impact → secondary → aftermath → cooldown (13/12/11s ανά tier)  
**Damage profile:** boss multiplier 0.6 (πάντα μέσω _dealDamage → _capBossDamage) · hard caps: {"stages":1,"wavesAlive":4}  
**Visual identity:** palette core #ffe6e6 / glow #ff2e3e / accent #8a0e1e  
**Asset:** `assets/weapons/fusions/eddie/fus_wall_of_sound.png` (1024×1024 RGBA)  
**Tiers:**

- Tier 1 — full cycle: raise towers → beat waves → 4th-beat red solo → feedback screech.
- Tier 2 — +25% wave/solo damage, longer set, deeper front.
- Tier 3 — ENCORE: when the set ends, the towers overload and fire one full-length solo in BOTH directions.

**Chaos enhancement (hard-capped):** {"beatMult":0.85,"soloEveryBeats":3,"durMult":1.2}

**Audio hooks:** `fus_wall_of_sound_manifest` · `fus_wall_of_sound_charge` · `fus_wall_of_sound_travel` · `fus_wall_of_sound_impact` · `fus_wall_of_sound_aftermath`

---

## BASS SINGULARITY  `fus_bass_singularity`

**Χαρακτήρας:** Eddie `eddie`  
**Recipe:** Feedback Cabinet (signature, Lv5) + Gravity Core (Lv3+) + Blacknet Swarm Drone (Lv3+)  
**Αντικαθιστά:** — (additive layer)  
**Gameplay role:** rhythmic pull/blast core + echo drones  
**Core mechanic:** Drops a subwoofer core that alternates on rhythm between INHALE (dragging the crowd in) and DROP (a crushing pressure blast), while two roadie-drones echo smaller pulses at the flanks; ends on one final sub-harmonic boom.  
**Activation cycle:** manifestation → charge → deployment/travel → impact → secondary → aftermath → cooldown (13/12/11s ανά tier)  
**Damage profile:** boss multiplier 0.55 (πάντα μέσω _dealDamage → _capBossDamage) · hard caps: {"cores":1,"roadies":2}  
**Visual identity:** palette core #e6ecff / glow #4d6bff / accent #1e2e8a  
**Asset:** `assets/weapons/fusions/eddie/fus_bass_singularity.png` (1024×1024 RGBA)  
**Tiers:**

- Tier 1 — full cycle: core drop → inhale/drop rhythm → roadie echoes → final boom.
- Tier 2 — wider inhale, +25% drop damage, longer set.
- Tier 3 — DROP THE BASS: every second DROP also fires a shockwave ring that travels outward (bounded).

**Chaos enhancement (hard-capped):** {"rhythmMult":0.85,"pullMult":1.3,"boomDmgMult":1.2}

**Audio hooks:** `fus_bass_singularity_manifest` · `fus_bass_singularity_charge` · `fus_bass_singularity_travel` · `fus_bass_singularity_impact` · `fus_bass_singularity_aftermath`

---

## THOUSAND FIST VERDICT  `fus_thousand_fist_verdict`

**Χαρακτήρας:** Dimi's Kickboxer `dimis_kickboxer`  
**Recipe:** Cyber-Gauntlets Injection (signature, Lv5) + Holographic Energy Knuckles (Lv3+) + Null Lance (Lv3+)  
**Αντικαθιστά:** Holographic Energy Knuckles  
**Gameplay role:** sequential fist corridor + marked execution finale  
**Core mechanic:** Materializes a corridor of giant holographic fists that punch in sequence down the lane, each piercing through; the verdict lands as a null-lance uppercut at the corridor end — an execution burst on everything carrying a Sanction Mark.  
**Activation cycle:** manifestation → charge → deployment/travel → impact → secondary → aftermath → cooldown (11/10/9s ανά tier)  
**Damage profile:** boss multiplier 0.65 (πάντα μέσω _dealDamage → _capBossDamage) · hard caps: {"corridors":1,"fists":7}  
**Visual identity:** palette core #fffbe6 / glow #ffd447 / accent #8a6e0e  
**Asset:** `assets/weapons/fusions/dimis_kickboxer/fus_thousand_fist_verdict.png` (1024×1024 RGBA)  
**Tiers:**

- Tier 1 — full cycle: marks → fist corridor → sequential punches → null uppercut verdict.
- Tier 2 — +1 fist, longer corridor, +24% damage.
- Tier 3 — UNANIMOUS RULING: enemies killed by the verdict release their Mark as a homing sanction sigil that brands the nearest unmarked enemy.

**Chaos enhancement (hard-capped):** {"extraFist":1,"verdictBonusPct":0.05,"cdMult":0.9}

**Audio hooks:** `fus_thousand_fist_verdict_manifest` · `fus_thousand_fist_verdict_charge` · `fus_thousand_fist_verdict_travel` · `fus_thousand_fist_verdict_impact` · `fus_thousand_fist_verdict_aftermath`

---

## AEGIS OF JUDGEMENT  `fus_aegis_of_judgement`

**Χαρακτήρας:** Dimi's Kickboxer `dimis_kickboxer`  
**Recipe:** Holographic Energy Knuckles (signature, Lv5) + Ion Halo (Lv3+) + Gravity Core (Lv3+)  
**Αντικαθιστά:** — (additive layer)  
**Gameplay role:** parry/retaliation ring + counter barrage  
**Core mechanic:** A holographic guard ring absorbs enemy contact around Dimi and charges a counter meter while gravity holds attackers at arm’s length; at full charge it unleashes a radial holo-fist barrage laced with ion arcs, then leaves a brief protective afterglow.  
**Activation cycle:** manifestation → charge → deployment/travel → impact → secondary → aftermath → cooldown (12/11/10s ανά tier)  
**Damage profile:** boss multiplier 0.6 (πάντα μέσω _dealDamage → _capBossDamage) · hard caps: {"rings":1,"barrageFists":12}  
**Visual identity:** palette core #e6fff7 / glow #2ee6b8 / accent #0e8a6a  
**Asset:** `assets/weapons/fusions/dimis_kickboxer/fus_aegis_of_judgement.png` (1024×1024 RGBA)  
**Tiers:**

- Tier 1 — full cycle: guard ring → absorb + hold → counter barrage → afterglow.
- Tier 2 — +2 barrage fists, higher absorb cap, +25% counter damage.
- Tier 3 — CLOSING STATEMENT: if the meter fills twice in one deployment, the second barrage adds a gravity slam that yanks all enemies in range to the ring edge first.

**Chaos enhancement (hard-capped):** {"meterFullReduce":2,"arcDmgMult":1.25,"afterglowDurMult":1.4}

**Audio hooks:** `fus_aegis_of_judgement_manifest` · `fus_aegis_of_judgement_charge` · `fus_aegis_of_judgement_travel` · `fus_aegis_of_judgement_impact` · `fus_aegis_of_judgement_aftermath`

---

## Συνοπτικός πίνακας

| # | Fusion ID | Name | Char | Signature | B | C | Replaces |
|---|---|---|---|---|---|---|---|
| 1 | `fus_ossuary_impaler` | OSSUARY IMPALER | skeleton_warrior | marrow_spitter | build_null_lance | gravity_core | marrow_spitter |
| 2 | `fus_black_psalm_choir` | BLACK PSALM CHOIR | skeleton_warrior | grave_cantor | build_ion_halo | blacknet_swarm_drone | grave_cantor |
| 3 | `fus_cyclone_metronome` | CYCLONE METRONOME | taekwondo_girl | vector_heel | storm_sash | build_ion_halo | vector_heel |
| 4 | `fus_null_storm_eye` | EYE OF THE NULL STORM | taekwondo_girl | storm_sash | gravity_core | build_null_lance | storm_sash |
| 5 | `fus_tectonic_maw` | TECTONIC MAW | brawler_warrior | faultline_fist | gravity_core | magma_uppercut | faultline_fist |
| 6 | `fus_pyroclast_payload` | PYROCLAST PAYLOAD | brawler_warrior | magma_uppercut | nano_mine | build_null_lance | magma_uppercut |
| 7 | `fus_compass_of_ruin` | COMPASS OF RUIN | euclid_vector | axiom_ray | phi_cutter | build_ion_halo | axiom_ray |
| 8 | `fus_golden_collapse` | GOLDEN COLLAPSE | euclid_vector | phi_cutter | gravity_core | nano_mine | phi_cutter |
| 9 | `fus_hungry_hell_feast` | HUNGRY HELL FEAST | oni_cataclysm_protocol | hannya_cleaver | hungry_spirit_lantern | gravity_core | hannya_cleaver |
| 10 | `fus_night_parade` | NIGHT PARADE | oni_cataclysm_protocol | hungry_spirit_lantern | blacknet_swarm_drone | build_ion_halo | hungry_spirit_lantern |
| 11 | `fus_ferromag_piledriver` | FERROMAG PILEDRIVER | cyber_arm_hero | hydraulic_knuckle | magnetic_shrapnel | build_ion_halo | hydraulic_knuckle |
| 12 | `fus_scrapstorm_foundry` | SCRAPSTORM FOUNDRY | cyber_arm_hero | magnetic_shrapnel | nano_mine | blacknet_swarm_drone | magnetic_shrapnel |
| 13 | `fus_widows_loom` | WIDOW'S LOOM | assassin_clone | monowire_lash | toxin_kunai | nano_mine | monowire_lash |
| 14 | `fus_phantom_needle_protocol` | PHANTOM NEEDLE PROTOCOL | assassin_clone | toxin_kunai | build_null_lance | blacknet_swarm_drone | toxin_kunai |
| 15 | `fus_die_of_fates` | DIE OF FATES | japan_phasewalker | probability_disc | phase_needle | build_null_lance | probability_disc |
| 16 | `fus_event_horizon_roulette` | EVENT HORIZON ROULETTE | japan_phasewalker | probability_disc | build_ion_halo | gravity_core | — |
| 17 | `fus_wall_of_sound` | WALL OF SOUND | eddie | solo_red_thunder | feedback_cabinet | build_ion_halo | feedback_cabinet |
| 18 | `fus_bass_singularity` | BASS SINGULARITY | eddie | feedback_cabinet | gravity_core | blacknet_swarm_drone | — |
| 19 | `fus_thousand_fist_verdict` | THOUSAND FIST VERDICT | dimis_kickboxer | cyber_gauntlets_injection | holo_energy_knuckles | build_null_lance | holo_energy_knuckles |
| 20 | `fus_aegis_of_judgement` | AEGIS OF JUDGEMENT | dimis_kickboxer | holo_energy_knuckles | build_ion_halo | gravity_core | — |
