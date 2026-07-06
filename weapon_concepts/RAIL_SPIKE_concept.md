# PHENIX 2.0 — Weapon Concept: Rail Spike
**Category:** PROJECTILE
**Status:** 🟢 PRODUCTION READY — Automated QA passed + Art Director approved 2026-07-01.
**Pipeline stage:** Production Ready
**Last updated:** 2026-07-01

---

## Weapon Identity

**Name:** Rail Spike
**Type:** PROJECTILE — hypersonic ranged weapon
**Faction aesthetic:** Blacknet / Advanced Industrial rail-tech
**Weapon family rule:** Fast, aerodynamic, forward-oriented silhouette — reads as a projectile at 48px

---

## Visual Language

The Rail Spike is not a standard bullet or missile.
It is a heavy hypersonic spike fired by electromagnetic rail acceleration — dense, brutal, and technological.

Core design pillars:
- **Heavy mass silhouette** — long, sharp, dense body. Thick enough to read as substantial — this is not a needle, it is armour-piercing mass.
- **Dark titanium construction** — deep black/charcoal body with visible industrial plating and beveled edges.
- **Cyan-white energy core** — the electromagnetic rail charge visible along the spine of the spike, glowing from within through seams in the armour.
- **Rail-tech glow lines** — acceleration grooves along the body emit directional cyan light, indicating the rail-charge direction.
- **Aerodynamic tip** — extremely sharp forward point, burning brighter (hottest from friction/charge).
- **Blunt power coupling at rear** — exposed contacts where the rail grip held the spike.

Color palette:
- Body: deep titanium black (#1A1A22) with dark charcoal plating (#2E2E3A)
- Energy core: cyan-white (#B0FFFF) to pure cyan (#00FFFF)
- Glow lines: cyan (#00FFFF) fading to electric blue (#0088FF)
- Tip burn: near-white (#EEFFFF) at point, fading to cyan
- Rear contacts: amber-orange (#FF8800) — residual rail discharge

Forbidden:
- No generic bullet silhouette
- No rocket/missile fins
- No fantasy elements
- No uniform solid glow — energy must read as internal/structural

---

## Silhouette Test (must pass before QA)

Print as solid black. The result must be:
- Immediately readable as a projectile / spike
- Direction of travel obvious (forward point)
- Distinct from Void Needle (heavier mass, shorter relative to width)
- Recognizable at 48px as a forward-facing weapon

---

## VFX Package

| Effect | Description |
|--------|-------------|
| **Idle glow** | Slow pulse on rail grooves — cyan charge cycles along body ~1.5s. Energy seams breathe. |
| **Launch trail** | Cyan-white streak, elongated motion blur. Duration 0.1s after firing. Near-white core, cyan edge. |
| **Projectile trail** | Persistent cyan energy trail while in flight. Decays at 0.05s after passage. |
| **Impact effect** | Heavy kinetic impact — white flash, shockwave ring, cyan spark burst, debris spray. Duration 0.2s. |
| **Muzzle flash** | Rail discharge flash at firing point — electric blue arc, 2 frames. |
| **Destruction effect** | Target hit: kinetic detonation, armour fragment scatter, cyan energy bleed |
| **Screen flash** | Optional on kill: single frame 15% white overlay, 0.06s fade |
| **Camera shake** | Medium — 0.15 magnitude, 0.12s duration on impact (heavier than Void Needle) |

---

## Animation Requirements

| Animation | Notes |
|-----------|-------|
| **Idle** | Spike floats slightly, slow drift. Rail grooves pulse with charge. |
| **Charge** | Energy builds along grooves — cyan brightens toward tip before firing. |
| **Launch** | Spike vanishes forward with motion blur trail. Firing point shows rail discharge arc. |
| **Flight** | Spike in flight — sustained trail, subtle rotation along axis. |
| **Impact** | Heavy contact — spike embeds or detonates depending on evolution. |

Design must not become visually awkward during any of these states.
Forward-oriented silhouette aids animation — direction of travel always clear.

---

## Visual Intensity Level

**MEDIUM**

The Rail Spike is a standard combat projectile weapon. Its glow is structural and contained.
It must not visually dominate alongside LOW intensity weapons.
An evolved legendary version (Void Spike / Blacknet Railgun) may be reclassified HIGH.

---

## Expected In-Game Size

| Context | Size |
|---------|------|
| Rendered in-game (active projectile) | ~40–80px depending on zoom |
| Pickup icon | 64×64px |
| Upgrade card | 96×96px |
| Full-art display | 256×256px |

The weapon concept art at 1504×1504 will be scaled down to all the above.
Silhouette must remain readable at 48px.

---

## QA Checklist

- [x] Resolution ≥ 1024×1024 — ✅ 1504×1504 (after 10% canvas padding)
- [x] Mode = RGBA (true transparency) — ✅ RGBA
- [x] transparent_pct > 60% — ✅ 94.7%
- [x] halo_ratio < 5% — ✅ 0.0%
- [x] cutoff_px == 0 — ✅ 0px
- [x] watermark_issues = none — ✅ none detected
- [x] artifact_ring_px < 500 — ✅ 0px (after padding; pre-padding was 1,947px)
- [x] Silhouette readable at 128px — ✅ cov=6.7%, lum-std=60
- [x] Silhouette readable at 96px — ✅ cov=7.1%, lum-std=59
- [x] Silhouette readable at 64px — ✅ cov=7.6%, lum-std=53
- [x] Silhouette survives at 48px (not a blob) — ✅ cov=7.9%, lum-std=47
- [ ] Gameplay visibility test (pending integration phase)
- [ ] No silhouette overlap with Void Needle (both PROJECTILE — review at integration)
- [x] Intensity level confirmed as MEDIUM

**Note on canvas padding:** 10% black canvas padding applied before extraction. Source glow reached canvas edges (pre-padding artifact_ring: 1,947px). Same fix applied as Sentry Drone. This is a canvas composition adjustment, not a quality rescue.

**Art Director Approval (required before Production Ready):**
- [x] Fits PHENIX: NULL EDEN visual identity
- [x] Premium commercial quality — no AI artefacts
- [x] Strong silhouette
- [x] High gameplay readability
- [x] Weapon family consistent (PROJECTILE)
- [x] Animation-ready
- [x] VFX-ready

**Current QA result:** ✅ ALL AUTOMATED CHECKS PASSED — 2026-07-01
**Art Director approval:** ✅ APPROVED — 2026-07-01
**Final file:** phenix2_PROJECTILE_rail-spike_final.png
**Next step:** Gameplay integration (when weapon integration sprint begins)

---

## Production Tracking Entry

| Field | Value |
|-------|-------|
| Weapon | Rail Spike |
| Category | PROJECTILE |
| Pipeline stage | 🟢 Production Ready |
| Intensity | MEDIUM |
| Blocker | None |
| Final file | phenix2_PROJECTILE_rail-spike_final.png |
| Next action | Gameplay integration (when weapon integration sprint begins) |
