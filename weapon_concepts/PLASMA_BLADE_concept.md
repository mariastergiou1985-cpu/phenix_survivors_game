# PHENIX 2.0 — Weapon Concept: Plasma Blade
**Category:** MELEE
**Status:** 🟢 PRODUCTION READY — Automated QA passed + Art Director approved 2026-07-01.
**Pipeline stage:** Production Ready
**Last updated:** 2026-07-01

---

## Weapon Identity

**Name:** Plasma Blade
**Type:** MELEE — close-range swing weapon
**Faction aesthetic:** EDEN Corporation experimental melee tech
**Weapon family rule:** Strong directional silhouette — blade must read as a blade at 48px

---

## Visual Language

The Plasma Blade is not a lightsaber clone and not a fantasy sword.
It is an industrial cutting tool designed for military void-zone operations.

Core design pillars:
- The blade has **internal structure** — not a flat bar of light. Visible layers: a white-hot plasma core, surrounded by cyan energy containment field, with turbulent edges where plasma bleeds out.
- The **hilt is asymmetric and mechanical** — exposed cooling vents, grip wrap, a power coupling that glows amber when charged.
- The blade is **slightly curved** — aggressive forward lean, like a combat utility knife scaled up. Not a straight bar.
- **No crossguard** — instead, a plasma deflector shroud extends forward from the hilt at an angle.
- The blade **tapers to a sharp tip** that burns brighter than the rest (hottest point).
- Overall silhouette reads as: angular, purposeful, dangerous, technological.

Color palette:
- Blade core: pure white (#FFFFFF) fading to ice blue (#7FFFFF)
- Containment field: cyan (#00FFFF) to teal (#00CCBB)
- Edge turbulence: faint violet (#CC88FF) where plasma escapes
- Hilt body: dark titanium (#2A2A35) with amber power nodes (#FF9900)
- Glow bloom: wide soft cyan halo that does not dominate — LOW spread

Forbidden:
- No solid uniform glow bar (lightsaber)
- No fantasy crossguard
- No flame effects
- No generic blue sword shape

---

## Silhouette Test (must pass before QA)

Print as solid black. The result must be:
- Immediately readable as a blade
- Direction of swing obvious
- Distinct from all other MELEE weapons
- Recognizable at 48px as a thumbnail

---

## VFX Package

| Effect | Description |
|--------|-------------|
| **Idle glow** | Slow pulse on the blade — white core fades in/out over ~2s. Containment field ripples. |
| **Swing trail** | Cyan arc trail, 120–140° arc. Fades in 0.3s. Core white, edge cyan-to-transparent. |
| **Impact effect** | Plasma burst at contact point — white flash, cyan sparks, small shockwave ring. Duration 0.15s. |
| **Muzzle flash** | N/A (melee — no muzzle). On activation: brief full-blade white flash for 1 frame. |
| **Destruction effect** | Enemy hit: plasma ignition flash, radial spark burst, faint screen edge desaturate |
| **Projectile trail** | N/A base weapon. Evolved version may emit plasma projectiles. |
| **Screen flash** | Optional on kill: single frame 10% white overlay, 0.05s fade |
| **Camera shake** | Light — 0.08 magnitude, 0.1s duration on heavy hit |

---

## Animation Requirements

| Animation | Notes |
|-----------|-------|
| **Idle** | Blade floats slightly off-centre, slow drift. Glow pulses. |
| **Swing** | Forward arc, 140° rotation. Fast in, medium ease out. |
| **Recoil** | Slight hilt pull-back after swing completes. |
| **Charge** | If applicable — blade brightens, containment field expands. |
| **Impact contact** | Blade briefly distorts at tip on hit (UV ripple effect). |

Design must not become visually awkward during any of these states.
The blade curvature aids animation — the arc swing reads naturally.

---

## Visual Intensity Level

**MEDIUM**

The Plasma Blade is a standard combat weapon. Its glow is present but contained.
It must not visually dominate when paired with LOW intensity weapons.
An evolved legendary version may be reclassified HIGH.

---

## Expected In-Game Size

| Context | Size |
|---------|------|
| Rendered in-game (active) | ~80–120px tall depending on player scale |
| Pickup icon | 64×64px |
| Upgrade card | 96×96px |
| Full-art display | 256×256px |

The weapon concept art at 1024×1024 will be scaled down to all the above.
Silhouette must remain readable at 48px.

---

## Generation Prompt (ChatGPT Image Generation / Approved Tools)

Use this prompt verbatim in ChatGPT Image Generation or any approved concept art tool.
Target size: **1024×1024** (square). Background: **pure black #000000** (for clean extraction) or transparent if the tool supports it natively.

```
Cyberpunk military plasma blade, single melee weapon, isolated on pure black
background, transparent-ready composition. Industrial asymmetric blade design:
white-hot plasma core surrounded by layered cyan energy containment field with
turbulent glowing edges where plasma bleeds out into violet. Blade is slightly
curved forward, tapers to a sharp bright tip. Mechanical angular hilt with
exposed cooling vents, amber power coupling nodes, plasma deflector shroud
angled forward. No crossguard. No fantasy elements. No uniform glow bar.
Weapon occupies 70% of frame height, centered, no clipping at edges.
Strong directional silhouette. Premium concept art style. 4K detail.
High-tech experimental weapon from a dark cyberpunk military faction.
```

**Required output quality:**
- Resolution: 1024×1024 minimum
- File type: PNG (RGBA transparent preferred; pure black background acceptable for Adobe extraction)
- No watermark
- No logo or attribution text
- Weapon fully within canvas — no edge clipping

Save exported file as: `phenix2_MELEE_plasma-blade_candidate.png`
Drop into: `C:\Dev\phenix_survivors_game\weapon_concepts\`
I will run background removal + full QA immediately on receipt.

---

## QA Checklist (run after art is provided)

- [x] Resolution ≥ 1024×1024 — ✅ 1024×1024
- [x] Mode = RGBA (true transparency) — ✅ RGBA
- [x] transparent_pct > 60% — ✅ 81.1%
- [x] halo_ratio < 5% — ✅ 3.8%
- [x] cutoff_px == 0 — ✅ 0px
- [x] watermark_issues = none — ✅ none detected
- [x] artifact_ring_px < 500 — ✅ 303px
- [x] Silhouette readable at 128px — ✅ cov=19.1%, lum-std=84
- [x] Silhouette readable at 96px — ✅ cov=19.4%, lum-std=83
- [x] Silhouette readable at 64px — ✅ cov=19.8%, lum-std=82
- [x] Silhouette survives at 48px (not a blob) — ✅ cov=20.2%, lum-std=81
- [ ] Gameplay visibility test (pending integration phase)
- [ ] No silhouette overlap with other approved MELEE weapons
- [x] Intensity level confirmed as MEDIUM

**Art Director Approval (required before Production Ready):**
- [x] Fits PHENIX: NULL EDEN visual identity
- [x] Premium commercial quality — no AI artefacts
- [x] Strong silhouette
- [x] High gameplay readability
- [x] Weapon family consistent (MELEE)
- [x] Animation-ready
- [x] VFX-ready

**Current QA result:** ✅ ALL AUTOMATED CHECKS PASSED — 2026-07-01
**Art Director approval:** ✅ APPROVED — 2026-07-01
**Final file:** phenix2_MELEE_plasma-blade_final.png
**Next step:** Gameplay integration (when weapon integration sprint begins)

---

## Production Tracking Entry

| Field | Value |
|-------|-------|
| Weapon | Plasma Blade |
| Category | MELEE |
| Pipeline stage | 🟢 Production Ready |
| Intensity | MEDIUM |
| Blocker | None |
| Final file | phenix2_MELEE_plasma-blade_final.png |
| Next action | Gameplay integration (when weapon integration sprint begins) |
