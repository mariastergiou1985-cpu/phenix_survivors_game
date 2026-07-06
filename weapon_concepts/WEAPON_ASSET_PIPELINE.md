# PHENIX 2.0 — Weapon Asset Pipeline
**Status: ACTIVE** | Established: 2026-07-01 | Last updated: 2026-07-01 (tool references updated)

---

## Rules

### Approved Concept Art Tools
The pipeline defines the **output quality standard** — not the software used. Any tool capable of meeting the requirements below is permitted.

**Currently available:**
- **ChatGPT Image Generation** — primary concept art generation tool
- **Adobe tools** — background removal (`image_remove_background`), image editing
- **Professional digital painting software** — accepted if output meets quality requirements
- **Python Pillow** — QA validation, checkerboard preview generation, and resize ONLY. Never for art generation.

**Not available:**
- Canva Pro (removed from pipeline)
- Adobe Firefly image generation (not available in this environment)

**Future tools:** Any professional concept-art generator capable of producing ≥1024×1024 high-resolution artwork may be added. The pipeline defines the required **output quality** — not the mandatory application. The final artwork must satisfy all PHENIX 2.0 Weapon Asset Pipeline requirements regardless of the tool used.

### Rules — No Exceptions
- DO NOT generate programmer placeholder weapons (circles, rectangles, colored blobs)
- DO NOT use low-quality transparent extractions as final assets
- DO NOT use Python/PIL to generate weapon art
- DO NOT rescue a failed asset with filters — if it fails QA, redesign it
- DO NOT integrate any asset into gameplay until it passes visual QA
- DO NOT commit until the approved weapon set is ready

---

## Step-by-Step Pipeline

### 1. Design
- Resolution: minimum **1024×1024**, preferred **2048×2048**
- Style: premium cyberpunk — rich lighting, high detail, original identity
- Silhouette: clean and unique — recognizable as a black shadow with no labels
- No generic circles, squares, triangles, or programmer shapes

### 2. Background Removal
Use Adobe `image_remove_background` OR generate with a pure black/transparent background and apply Python Pillow luminance extraction. The method does not matter — the output quality does.

Final asset must have:
- ✅ True RGBA transparency (mode = RGBA, not RGB)
- ✅ Zero watermark
- ✅ Zero background haze (no residual semi-transparent background)
- ✅ Zero black/white halo at weapon edges
- ✅ No clipped edges (weapon fully contained inside canvas)
- ✅ Preserved glow and lighting

### 3. Export
- Format: PNG with alpha channel
- Naming: `phenix2_[CATEGORY]_[weapon-name]_final.png`
- Save to: `weapon_concepts/`

### 4. Visual QA — Mandatory
Run validation at all four sizes on a checkerboard background:

| Size | Must pass |
|------|-----------|
| 128px | Silhouette clear, glow readable |
| 96px  | Silhouette clear |
| 64px  | Core shape recognizable |
| 48px  | Must not become an unreadable blob |

If readability drops significantly below 64px → **redesign**, do not filter.

### 5. QA Pass Criteria (all required)
- transparent_pct > 60%
- halo_ratio (dark-semi) < 5%
- cutoff_px == 0 (no opaque pixels on border)
- watermark_issues == [] (none detected)
- artifact_ring_px < 500
- silhouette coverage at 64px: 4–50%
- silhouette lum-std at 64px > 20

### 6. Gameplay Visibility Test (Mandatory)
Every weapon must be tested inside a real combat scenario before approval.

Test conditions (all must be active simultaneously):
- 150+ enemies on screen
- Active VFX
- XP gems
- Damage numbers
- Explosions
- Multiple simultaneous weapons

The weapon must remain immediately recognizable during actual gameplay. If the weapon visually disappears inside combat or blends into the effects, it **fails QA and must be redesigned**.

### 7. Silhouette Diversity
No two weapons may share nearly identical silhouettes. Each weapon must be identifiable in under one second when displayed only as a black silhouette. Every weapon must have its own unique visual identity.

### 8. Animation-Ready Design
Weapon concepts must support animation. Every design should naturally allow:
- Recoil
- Rotation
- Idle movement
- Muzzle flashes
- Projectile spawning
- Trails
- Impact animations

Avoid designs that become visually awkward once animated.

### 9. VFX Compatibility
Every weapon concept must include a recommended VFX package. Specify at design time:

| Effect | Required |
|--------|----------|
| Muzzle flash | ✅ |
| Projectile trail | ✅ |
| Impact effect | ✅ |
| Destruction effect | ✅ |
| Idle glow | ✅ |
| Screen flash | Optional |
| Camera shake strength | Optional |

The artwork and VFX package are designed **together**, not independently.

### 10. World Consistency
Every weapon must visually belong inside PHENIX: NULL EDEN. Permitted artistic directions:
- Cyberpunk
- Military
- Experimental Technology
- EDEN Corporation aesthetic
- Blacknet aesthetic
- Void Technology
- Advanced Industrial Design

Generic fantasy weapons are not permitted unless explicitly fused with futuristic technology.

### 11. Weapon Family Identity
Every weapon category must have its own visual language. A player must be able to identify the weapon **category** instantly — before even recognizing the individual weapon.

| Category | Visual Language |
|----------|----------------|
| **Projectile** | Fast, aerodynamic, forward-oriented silhouettes |
| **Homing** | Compact intelligent devices — drones or guided missiles |
| **Orbit** | Floating objects — satellites, relics or energy constructs |
| **Beam** | Energy emitters — generators, lenses or cannons |
| **Drone** | Mechanical autonomous units with visible propulsion |
| **Melee** | Physical weapons with strong directional silhouettes |
| **Area** | Generators, emitters or deployable devices |
| **Mine** | Ground devices clearly recognizable before activation |
| **Summon** | Living or robotic allies with distinct personalities |
| **Special** | Unique designs that do not visually overlap any other category |

Designs that blur category identity fail this rule and must be revised until the category reads instantly.

### 12. Visual Noise Budget
Weapons must not overwhelm the screen. Every weapon is assigned one of three visual intensity levels at design time.

| Intensity | Role | When to use |
|-----------|------|-------------|
| **LOW** | Background weapon | Supports readability. Does not compete with primary action. |
| **MEDIUM** | Standard combat weapon | Default. Works alongside all other weapons without conflict. |
| **HIGH** | Foreground feature weapon | Reserved exclusively for Ultimates, Legendary evolutions, and Boss abilities. |

**Hard cap: no build may contain more than two HIGH intensity weapons simultaneously.**

Visual clarity always has priority over spectacle. A weapon that makes the screen unreadable is a design failure regardless of how impressive it looks in isolation.

Every weapon concept document must declare its intensity level before QA begins.

---

## Art Director Approval Gate

**A weapon is not Production Ready after passing automated QA alone.**

Automated QA (Steps 4–6) validates technical correctness only — resolution, transparency, halo, cutoff, silhouette metrics, and gameplay visibility. It cannot assess visual quality, artistic direction, or commercial polish.

After automated QA passes, every weapon requires a final human visual review before it may be moved to **Production Ready** status.

### Approval Checklist

| Criterion | Description |
|-----------|-------------|
| ✓ PHENIX: NULL EDEN identity | Fits the game's cyberpunk/military/void-tech world. Belongs in this specific universe. |
| ✓ Premium commercial quality | Looks like it belongs in a commercial-quality game. No visible AI artefacts, no rough edges, no generic stock-art feel. |
| ✓ Strong silhouette | Immediately readable as a black shadow. Category and individual identity both clear. |
| ✓ High gameplay readability | Visually survives 150+ enemy combat with active VFX, XP gems, and damage numbers. |
| ✓ No AI artefacts | No distorted geometry, duplicate elements, text noise, smeared details, or generation errors visible at any size. |
| ✓ Weapon family consistency | Fits the visual language of its category (Rule 11). Does not blur category identity. |
| ✓ Animation-ready | Design supports all required animation states without becoming visually awkward (Rule 8). |
| ✓ VFX-ready | Artwork and its VFX package are coherent together (Rule 9). |

**Only after all checklist items are confirmed may the asset move to 🟢 Production Ready.**

Weapons that pass automated QA but fail Art Director review are moved to 🟡 Needs Redesign with the specific visual issues documented.

---

## Quality Standard
> Do not design weapons simply to look attractive.
> Design weapons that remain visually readable, mechanically distinctive, animation-friendly,
> VFX-ready, and instantly recognizable during high-intensity combat.
>
> The objective is to build a commercial-quality weapon library that becomes
> one of PHENIX: NULL EDEN's strongest visual identities.
>
> One excellent weapon is better than ten average ones.
> Every weapon must look like it belongs in a commercial-quality game.

---

## Production Tracking

### 🟢 Production Ready
*Weapons that have passed all QA checks including gameplay visibility test. Cleared for gameplay integration.*

| Weapon | File | Category | Notes |
|--------|------|----------|-------|
| Plasma Blade | phenix2_MELEE_plasma-blade_final.png | MELEE | Automated QA ✅ + Art Director approved 2026-07-01. Intensity: MEDIUM. Ready for gameplay integration. |
| Void Needle | phenix2_PROJECTILE_void-needle_final.png | PROJECTILE | Automated QA ✅ + Art Director approved 2026-07-01. Intensity: MEDIUM. Ready for gameplay integration. |
| Sentry Drone | phenix2_DRONE_sentry-drone_final.png | DRONE | Automated QA ✅ + Art Director approved 2026-07-01. Intensity: MEDIUM. Note: 10% canvas padding applied (source glow reached frame edges). Ready for gameplay integration. |
| Shard Ring | phenix2_ORBIT_shard-ring_final.png | ORBIT | Automated QA ✅ + Art Director approved 2026-07-01. Intensity: MEDIUM. Ready for gameplay integration. |
| Rail Spike | phenix2_PROJECTILE_rail-spike_final.png | PROJECTILE | Automated QA ✅ + Art Director approved 2026-07-01. Intensity: MEDIUM. Note: 10% canvas padding applied (source glow reached frame edges). Ready for gameplay integration. |

### 🔵 Prototype Approved
*Weapons that have passed static QA but have not yet completed gameplay visibility test.*

| Weapon | File | Category | Notes |
|--------|------|----------|-------|
| — | — | — | None yet |

### 🟡 Needs Redesign
*Weapons that failed one or more QA checks. Root cause documented. Do not use.*

| Weapon | File | Category | Failure Reason |
|--------|------|----------|----------------|
| — | — | — | None yet |

### 🔴 Blocked
*Weapons with a technical blocker preventing QA (watermark, bad export, background remnant, etc.)*

| File | Blocker |
|------|---------|
| phenix2_MELEE_plasma-blade-AI_transparent.png | Edge clip — blade taller than canvas, top/bottom clipped |
| phenix2_PROJECTILE_void-needle-AI_transparent.png | Background haze (16.8% semi-transparent residue) + watermark detected in bottom corners |
| phenix2_ORBIT_shard-ring-AI_transparent.png | Watermark confirmed (TR+BR corners, 5K+ px) + unremoved background (195K artifact pixels) |

### ⚫ Retired
*Weapons permanently removed from consideration. Do not reference or reuse.*

| File | Reason |
|------|--------|
| phenix2_MELEE_plasma-blade.png | Programmer art — Python-generated, does not meet pipeline |
| phenix2_MELEE_shock-whip.png | Programmer art — Python-generated, does not meet pipeline |
| phenix2_PROJECTILE_void-needle.png | Programmer art — Python-generated, does not meet pipeline |
| phenix2_PROJECTILE_rail-spike.png | Programmer art — Python-generated, does not meet pipeline |
| phenix2_ORBIT_void-shard-ring.png | Programmer art — Python-generated, does not meet pipeline |
| phenix2_DRONE_sentry-turret.png | Programmer art — Python-generated, does not meet pipeline |

---

**Production Ready: 5 | Prototype Approved: 0 | Needs Redesign: 0 | Blocked: 3 | Retired: 6**
