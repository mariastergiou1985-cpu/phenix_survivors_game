# PHENIX: NULL EDEN — Enemy Weapon Sprites + Boss/Mini Mapping V1

## Correct folder

All enemy weapon/VFX sprites in this pack go here:

```txt
assets/enemies/weapons/sprites/
```

Enemy character sprites stay separate:

```txt
assets/enemies/bosses/
assets/enemies/minis/
```

## Important import note

These PNGs were processed as transparent/cropped sprite cutouts from black-background VFX concepts. If any black edge remains in-game, render them additively or refine the alpha/cutout. Do not move them to `refs/`. For this task they are weapon/attack sprites.

---

# Weapon files

| # | Weapon ID | Display name | Sprite file |
|---:|---|---|---|
| 1 | `void_ember_comet` | **Void Ember Comet** | `assets/enemies/weapons/sprites/void_ember_comet.png` |
| 2 | `null_sigil_beam` | **Null Sigil Beam** | `assets/enemies/weapons/sprites/null_sigil_beam.png` |
| 3 | `violet_spectral_needle` | **Violet Spectral Needle** | `assets/enemies/weapons/sprites/violet_spectral_needle.png` |
| 4 | `eden_star_lance` | **Eden Star Lance** | `assets/enemies/weapons/sprites/eden_star_lance.png` |
| 5 | `abyss_rift_blade` | **Abyss Rift Blade** | `assets/enemies/weapons/sprites/abyss_rift_blade.png` |
| 6 | `cryo_shard_lance` | **Cryo Shard Lance** | `assets/enemies/weapons/sprites/cryo_shard_lance.png` |
| 7 | `solar_halo_bolt` | **Solar Halo Bolt** | `assets/enemies/weapons/sprites/solar_halo_bolt.png` |
| 8 | `toxic_data_spear` | **Toxic Data Spear** | `assets/enemies/weapons/sprites/toxic_data_spear.png` |
| 9 | `magma_reaver_lance` | **Magma Reaver Lance** | `assets/enemies/weapons/sprites/magma_reaver_lance.png` |
| 10 | `arc_circuit_beam` | **Arc Circuit Beam** | `assets/enemies/weapons/sprites/arc_circuit_beam.png` |
| 11 | `aether_crescent_chakram` | **Aether Crescent Chakram** | `assets/enemies/weapons/sprites/aether_crescent_chakram.png` |
| 12 | `prism_wing_bolt` | **Prism Wing Bolt** | `assets/enemies/weapons/sprites/prism_wing_bolt.png` |
| 13 | `blacknet_scythe_arc` | **Blacknet Scythe Arc** | `assets/enemies/weapons/sprites/blacknet_scythe_arc.png` |
| 14 | `seraph_vector_javelin` | **Seraph Vector Javelin** | `assets/enemies/weapons/sprites/seraph_vector_javelin.png` |
| 15 | `null_rupture_orb` | **Null Rupture Orb** | `assets/enemies/weapons/sprites/null_rupture_orb.png` |


---

# Bosses / Big Enemies

## Cryo Warden

- **Enemy sprite:** `assets/enemies/bosses/cryo-warden.png`
- **Biome/role:** Glacial Expanse
- **Identity:** ice tank / defensive frost boss
- **Weapons:** `cryo_shard_lance`, `arc_circuit_beam`, `aether_crescent_chakram`
- **Behavior:** Rixnei Cryo Shard Lance eu8eia pros ton player. Fortizei ice beam me telegraph grammh. Se low HP mporei na petaksei 1-2 frost chakrams.
- **Impact στον player:** Medium frost damage, icy burst, optional slow mono an yparxei hdh slow system. Beam kanei continuous damage mono meta apo warning.

## Forge Mauler

- **Enemy sprite:** `assets/enemies/bosses/forge-mauler.png`
- **Biome/role:** Industrial Core
- **Identity:** heavy forge/mech brute
- **Weapons:** `magma_reaver_lance`, `void_ember_comet`, `solar_halo_bolt`
- **Behavior:** Plhsiazei arga kai varia. Rixnei Magma Reaver Lance san molten shot kai Void Ember Comet se arc/meteor path.
- **Impact στον player:** Heavy fire damage, ember burst, small screen shake sta heavy hits. Warning circle prin apo comet AoE.

## Null Hierophant

- **Enemy sprite:** `assets/enemies/bosses/null-hierophant.png`
- **Biome/role:** Orbital Nexus / Null-type
- **Identity:** caster / ritual boss
- **Weapons:** `null_sigil_beam`, `arc_circuit_beam`, `null_rupture_orb`
- **Behavior:** Anoigei sigil kyklous, kanei beam meta apo telegraph kai stelnei slow rupture orb pros ton player.
- **Impact στον player:** Continuous beam damage meta apo warning, rupture orb me warning ring kai heavy AoE explosion. No invisible radius.

## Pale Bloodknight

- **Enemy sprite:** `assets/enemies/bosses/pale-bloodknight.png`
- **Biome/role:** Abyssal / Blood elite
- **Identity:** melee slasher boss
- **Weapons:** `abyss_rift_blade`, `blacknet_scythe_arc`, `null_rupture_orb`
- **Behavior:** Kynhgaei epithetika, kanei telegraphed scythe arc konta kai stelnei dark blade waves.
- **Impact στον player:** Heavy slash damage, red/purple blade impact, optional knockback mono an yparxei. Small rupture AoE as phase attack.

## Rail Reaper

- **Enemy sprite:** `assets/enemies/bosses/rail-reaper.png`
- **Biome/role:** Data Wastes / AI Rogue elite
- **Identity:** sniper / railgun assassin
- **Weapons:** `violet_spectral_needle`, `toxic_data_spear`, `seraph_vector_javelin`
- **Behavior:** Paizei san sniper. Deixnei lepth warning line prin apo fast needle/rail shot. Den spamarei.
- **Impact στον player:** High damage fast projectile me mikro hitbox kai warning line. Toxic spear kanei green glitch burst; no poison unless existing system.

## Reactor Colossus

- **Enemy sprite:** `assets/enemies/bosses/reactor-colossus.png`
- **Biome/role:** Industrial Core / Reactor zone
- **Identity:** massive energy reactor boss
- **Weapons:** `arc_circuit_beam`, `magma_reaver_lance`, `solar_halo_bolt`
- **Behavior:** Fortizei chest core, rixnei Arc Circuit Beam kai overheat Magma Reaver Lance.
- **Impact στον player:** Beam tick damage after telegraph, heavy projectile impact, reactor pulse with clear warning.

## Solar Tyrant

- **Enemy sprite:** `assets/enemies/bosses/solar-tyrant.png`
- **Biome/role:** Solar / Gold elite / premium boss
- **Identity:** golden flying elite boss
- **Weapons:** `solar_halo_bolt`, `seraph_vector_javelin`, `eden_star_lance`
- **Behavior:** Petai golden bolts, chargearei piercing javelin kai se elite phase xrhsimopoiei Eden Star Lance.
- **Impact στον player:** Medium readable golden shots, high damage piercing javelin with telegraph, rare heavy star impact.


---

# Mini Enemies

## Abyss Maw

- **Enemy sprite:** `assets/enemies/minis/abyss-maw.png`
- **Identity:** close-range abyss creature
- **Weapons:** `null_rupture_orb`, `abyss_rift_blade`
- **Impact στον player:** Small rupture orb AoE kai bite-wave cone damage.

## Amethyst Fang

- **Enemy sprite:** `assets/enemies/minis/amethyst-fang.png`
- **Identity:** fast purple predator
- **Weapons:** `violet_spectral_needle`, `prism_wing_bolt`
- **Impact στον player:** Fast small/medium projectile hits. Small hitbox, readable trail.

## Cryo Claw

- **Enemy sprite:** `assets/enemies/minis/cryo-claw.png`
- **Identity:** small frost melee/ranged hybrid
- **Weapons:** `cryo_shard_lance`
- **Impact στον player:** Light/medium frost shard damage; slow only if existing system.

## Ember Scarab

- **Enemy sprite:** `assets/enemies/minis/ember-scarab.png`
- **Identity:** small fire insect/mech
- **Weapons:** `void_ember_comet`, `magma_reaver_lance`
- **Impact στον player:** Light fire shots, small ember impact, no screen clutter.

## Pulse Burrower

- **Enemy sprite:** `assets/enemies/minis/pulse-burrower.png`
- **Identity:** underground/electric pulse enemy
- **Weapons:** `arc_circuit_beam`, `aether_crescent_chakram`
- **Impact στον player:** Short electric pulse with small circle telegraph; light/medium shock damage.

## Rift Eye

- **Enemy sprite:** `assets/enemies/minis/rift-eye.png`
- **Identity:** floating caster eye
- **Weapons:** `null_sigil_beam`, `null_rupture_orb`
- **Impact στον player:** Mini beam tick damage or small rupture AoE.

## Solar Stinger

- **Enemy sprite:** `assets/enemies/minis/solar-stinger.png`
- **Identity:** fast flying solar insect
- **Weapons:** `solar_halo_bolt`, `seraph_vector_javelin`
- **Impact στον player:** Fast golden shots, small javelin, light/medium damage.

## Toxin Leech

- **Enemy sprite:** `assets/enemies/minis/toxin-leech.png`
- **Identity:** toxic crawling/mech leech
- **Weapons:** `toxic_data_spear`
- **Impact στον player:** Medium green glitch splash. No core/resource drain.

## Void Widow

- **Enemy sprite:** `assets/enemies/minis/void-widow.png`
- **Identity:** stealth spider/assassin
- **Weapons:** `blacknet_scythe_arc`, `violet_spectral_needle`
- **Impact στον player:** Telegraphed scythe slash medium damage and fast needle if ranged.

## Volt Rat

- **Enemy sprite:** `assets/enemies/minis/volt-rat.png`
- **Identity:** fast electric rat/mech
- **Weapons:** `arc_circuit_beam`, `toxic_data_spear`
- **Impact στον player:** Tiny zap/electric bolt, light shock damage; stun only if existing system.


---

# Global impact rules

```txt
Projectile:
- damage on hit
- clear trail
- visible impact burst
- hitbox must match visual

Beam:
- warning line/circle first
- then active beam
- continuous/tick damage only during active beam

Slash / Arc:
- warning arc first
- then active slash frames
- no invisible huge hitboxes

Orb / Explosion:
- slow travel or charge phase
- warning ring before explosion
- circular AoE damage only where visual exists

Heavy attacks:
- long telegraph
- small screen shake allowed
- never instant unavoidable damage
```

## Do not reintroduce old removed systems

```txt
- no enemy core stealing
- no player core carry/return
- no matrix-seeking AI regression
- no resource drain from Toxin Leech
- no invisible damage
- no black screen risk
```

## Suggested implementation path for Cowork

```txt
1. Copy this zip into the repo root.
2. Keep weapon sprites under assets/enemies/weapons/sprites/.
3. Create/extend Enemy Weapon Catalog using EnemyWeaponCatalogV1.json as design source.
4. Do not wire every attack at once if unsafe.
5. Start with 3-4 bosses and 4-5 minis.
6. Every strong attack must have telegraph + matching hitbox + impact VFX.
7. Validate locally: no black screen, no console fatal errors, no invisible damage.
```
