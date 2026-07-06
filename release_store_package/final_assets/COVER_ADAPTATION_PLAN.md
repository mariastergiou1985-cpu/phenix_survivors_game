# PHENIX: NULL EDEN — Cover Adaptation Plan
## Status: PLANNING — awaiting Maria's crop go-ahead
## Master: phenix_null_eden_master_cover.png (1920×1080, 16:9)
## Created: 2026-06-30

---

## 1. MASTER COVER STATUS

**Accepted candidate: YES**

Maria reviewed the generated Oni cover and confirmed: "THIS VERSION IS BETTER."
Active direction: Oni warrior (shirtless, cyberpunk arm augmentations) vs. demonic boss (skull creature with crimson arcs, massive clawed arms).

**Why it works as a cover:**
- Title "PHENIX: NULL EDEN" is large, gold-metallic, clearly legible in the center-upper zone
- Tagline "SURVIVE THE GRID. ENDURE THE CHAOS." is a stronger line than "A CYBER-SURVIVAL ROGUELITE"
- Boss fills the upper frame with massive threat presence — clawed arms arc left and right, framing the title
- Hero stands powerfully centered in the lower half with strong silhouette and cyberpunk detail
- Color palette is dark and premium: black void + crimson boss energy + cyan grid accents + gold title
- No UI, no HUD, no mobile-game aesthetics — reads as paid premium game
- Composition holds at thumbnail size — boss eyes and hero silhouette both survive heavy downscaling

**What to be aware of during crops:**
- Boss arms extend far left and right — they will be partially cut in any tighter-than-16:9 crop. This is acceptable; the skull head and eyes at top-center are the essential boss read, not the arms.
- Hero face is exposed (no Oni mask) — this is the accepted version. Do not flag this during crops.
- Title sits at approximately y=23%–38% of frame height, centered horizontally. This is the crop safety anchor — all crops must preserve this zone.
- The lower 10% of the frame (hero's feet, ground debris) is expendable in wide horizontal crops.
- The far left/right ~15% of frame width contains only cityscape ruins and arm tips — expendable in square-ish crops.

---

## 2. COMPOSITION MAP

Understanding where elements live in the 1920×1080 master:

```
y=0%  ┌────────────────────────────────────────────────────────┐
      │  [BOSS SKULL TOP — crimson energy]  ← boss head        │
y=10% │  [Boss left arm]        [Boss right arm]                │
      │                                                         │
y=20% │          ┌──────────────────────────────┐              │
      │          │   PHENIX: NULL EDEN  [TITLE]  │              │
y=30% │          │ SURVIVE THE GRID...  [TAGLINE]│              │
      │          └──────────────────────────────┘              │
y=35% │  ←── SAFE CENTER ZONE (x=15%–85%) ──────────────────→  │
      │                                                         │
y=50% │               [HERO — upper body]                       │
      │          [cyan grid rings behind hero]                  │
y=70% │               [HERO — lower body]                       │
      │  [ruins left]                        [ruins right]      │
y=90% │               [HERO — feet/ground]                      │
y=100%└────────────────────────────────────────────────────────┘
       x=0%   x=15%           x=50%           x=85%      x=100%

SAFE TITLE ZONE:  x=15%–85%, y=20%–38%  ← MUST survive in every crop
SAFE HERO ZONE:   x=35%–65%, y=35%–85%  ← must survive in most crops
EXPENDABLE ZONES: far left/right edges, very bottom (hero feet)
```

---

## 3. ASSET-BY-ASSET CROP PLAN

### ASSET 1 — itch.io Cover

| Field | Value |
|-------|-------|
| Target size | 630×500 px |
| Aspect ratio | 1.26:1 (near-square) |
| Risk level | LOW–MEDIUM |
| Crop priority | FIRST — primary storefront face |

**Crop method:**
The master is 16:9 (1.78:1). itch.io cover at 1.26:1 is squarer — requires cropping the left and right sides.

From 1920×1080 master: take a center crop of **1361×1080** (removing ~279px from each side) → scale down to 630×500.

What stays visible:
- Full title and tagline ✓
- Boss skull center and inner arms ✓
- Full hero body ✓
- Center background grid ✓

What gets cropped:
- Outer boss arm tips (far left/right) — acceptable, the skull reads without them
- Outer cityscape ruins (far left/right) — acceptable depth layers only

**Title position:** Already safe in the upper-center of the crop region. No adjustment needed.

**Will the same art work directly?** YES — center crop works cleanly.

**One watch point:** At 630×500 final display, test that the tagline text remains legible. It is smaller than the title — if it blurs, it's not a blocker (tagline is secondary info).

---

### ASSET 2 — itch.io Banner / Header

| Field | Value |
|-------|-------|
| Target size | 1920×400 px (approximate — itch.io page background/header) |
| Aspect ratio | 4.8:1 (very wide) |
| Risk level | MEDIUM |
| Crop priority | OPTIONAL — itch.io does not have a mandatory separate banner slot |

**Note:** itch.io's primary visual slot is the cover image. The "banner" here likely refers to the wide header that can appear on the page background. This is not a required itch.io asset.

**Crop method:**
From master: take **full 1920 width × center 400px band** (starting at approximately y=270px from top, ending at y=670px). This captures: title, tagline, top of hero, inner boss energy. Boss skull top and hero feet both fall outside this band — that's acceptable for a wide decorative banner.

If the band feels too empty: shift crop upward to y=150px–550px to include more of the boss presence above the title.

**Alternative:** Scale full 1920×1080 → 1920×400 with slight vertical squeeze (23% compression). The squish is noticeable but may be acceptable for a background element. Test both approaches.

---

### ASSET 3 — Steam Header Capsule

| Field | Value |
|-------|-------|
| Target size | 920×430 px |
| Aspect ratio | 2.14:1 (wider than 16:9) |
| Risk level | MEDIUM |
| Crop priority | SECOND — major Steam storefront element |

**Crop method:**
Steam header is wider proportionally than the master (2.14:1 vs 1.78:1). Must crop vertically.

From 1920×1080: take **full 1920px width × 897px height** centered (crops ~91px off top and ~92px off bottom) → scale to 920×430.

What stays visible:
- Title and tagline ✓ (in upper-center zone)
- Boss skull (top of frame, partially cropped but eyes remain) ✓
- Hero upper body and torso ✓
- Boss arms arc across the frame ✓

What gets cropped:
- Very top of boss skull (loses top 91px — boss eyes remain)
- Hero feet and lower legs (loses bottom 92px)

**Title position:** Safe. Title is at y=23%–38% of master = y=249–411px. After cropping 91px from top, title shifts to y=158–320px of the 897px crop. Still solidly in the upper zone. ✓

**Will the same art work directly?** YES — with the vertical center crop. Minimal adjustment.

**One watch point:** Verify boss eyes are still visible after the top crop. The skull center is at approximately y=5%–15% of master (54–162px). After cropping 91px from top, the remaining boss content starts at the eye level, which is acceptable.

---

### ASSET 4 — Steam Small Capsule

| Field | Value |
|-------|-------|
| Target size | 462×174 px |
| Aspect ratio | 2.655:1 (extremely wide, extremely short) |
| Risk level | HIGH |
| Crop priority | THIRD — but requires special attention |

**This is the hardest crop. Honest assessment below.**

**Crop method:**
From 1920×1080: take **full 1920px width × 723px height** centered (crops ~178px from top and ~179px from bottom) → scale to 462×174.

What stays visible at 723px crop height:
- Title ✓ (at y=249–411px, safely within 178–901px window)
- Boss middle energy and arm arcs ✓
- Hero upper body and torso ✓

What gets cropped:
- Boss skull top (top 178px removed — boss energy/eyes remain but skull top is cut)
- Hero lower body and feet (bottom 179px removed)

**At final 462×174 scale — the real risk:**
At 462×174 px, the title "PHENIX: NULL EDEN" occupies approximately 30–40px of vertical space. The letters are small. Whether they remain legible depends on the original title rendering quality and anti-aliasing.

**Test required:** Scale the cropped region to exactly 462×174 and zoom out to actual pixel size. Check:
1. Is "PHENIX: NULL EDEN" readable as individual letters at 100% zoom?
2. Does the boss energy read as a distinct visual element (not just red noise)?
3. Does the hero silhouette read at this size?

**If title is NOT legible at 462×174:**
This is the one asset that may need a special alternate treatment — a tighter center crop that makes the title relatively larger, potentially cropping out the hero and showing only boss energy + title. See Section 5 below.

**Will the same art work directly?** UNCERTAIN — needs legibility test. Do not assume it works without testing.

---

### ASSET 5 — Steam Vertical / Library Capsule

| Field | Value |
|-------|-------|
| Target size | 600×900 px |
| Aspect ratio | 0.667:1 (portrait, 2:3) |
| Risk level | HIGH — cannot be cropped from landscape master |
| Crop priority | LAST — requires separate treatment |

**This cannot be derived from a simple crop of the 1920×1080 landscape master.**

A center-strip crop of the master at portrait ratio would yield approximately x=592px–1328px width (736px wide) × full 1080px height → scaled to 600×900. This preserves the hero and some boss, but loses both boss arms entirely and much of the background context. The result would likely feel too tight and compositionally incomplete.

**Recommended approach — choose one:**

**Option A — AI Outpainting (fastest):**
Take the master. Use Firefly "Generative Fill" or similar to extend the canvas vertically: add ~600px above (more boss and sky) and ~200px below (more ground). Keep the center composition identical. This gives a 1920×1880 tall image that can then be cropped to portrait ratio cleanly.

**Option B — Dedicated Portrait Generation:**
Use the vertical prompt from `COVER_IMAGE_BRIEF.md` Section 9 to generate a new image at 600×900 (or 1200×1800 for quality). Same characters, same palette, vertical layout: hero lower half, boss upper half, title in the upper third. This gives the cleanest result but requires another generation session.

**Option C — Tight Center Strip (fallback):**
Crop master at x=672–1248 (576px wide) × full height 1080px → scale to 600×1080 → crop to 600×900 from center. Loses boss arms, keeps skull + hero + grid. Acceptable only as a fallback if no other option is available.

**Recommendation: Option A first** (fastest). If Firefly outpainting produces clean results, it's the lowest-effort path. Option B if Option A looks bad.

---

### ASSET 6 — Steam Library Hero

| Field | Value |
|-------|-------|
| Target size | 3840×1240 px |
| Aspect ratio | 3.097:1 (ultra-wide) |
| Risk level | HIGH — requires upscale and/or extension |
| Crop priority | LAST — lowest urgency |

**This cannot be cropped from the 1920×1080 master without upscaling and/or horizontal extension.**

The master is 1920px wide. The target is 3840px wide — exactly 2× the master width. The height 1240px is 15% taller than the master's 1080px.

**Recommended approach — choose one:**

**Option A — AI Upscale + Extend:**
Upscale master to 3840×2160 using Topaz Gigapixel or Real-ESRGAN (2× upscale). Then crop to 3840×1240 from the center-top band. The upscaled 3840×2160 master can source all other assets too.

**Option B — Outpainting:**
From master, extend canvas left and right (~960px each side) using AI outpainting to generate environment extension. The hero and boss remain centered; the extended left/right zones show more ruined cityscape and void atmosphere. Then upscale for final size.

**Option C — Wide-format generation:**
Request a new 3:1 ratio image from the AI tool using a modified prompt. This takes another generation session but gives the cleanest 3840×1240 result.

**Priority note:** Steam library hero is displayed on the store page but not the primary discovery surface. itch.io cover, Steam header, and Steam small capsule have higher urgency for launch. This asset can be prepared post-launch.

---

### ASSET 7 — Trailer Title Card

| Field | Value |
|-------|-------|
| Target size | 1920×1080 px |
| Aspect ratio | 16:9 |
| Risk level | NONE |
| Crop priority | N/A — IS the master |

**No crop needed. The master IS the trailer title card.**

Use `phenix_null_eden_master_cover.png` directly as the opening title card in the trailer. For motion, the video editor can apply a slow zoom-in, a subtle vignette pulse on the boss energy, or a fade-in of the title text.

---

### ASSET 8 — Social Preview

| Field | Value |
|-------|-------|
| Target size | 1200×630 px |
| Aspect ratio | 1.905:1 |
| Risk level | LOW |
| Crop priority | SECOND TIER — can follow itch.io and Steam header |

**Crop method:**
1.905:1 is very close to 16:9 (1.778:1) — slightly wider. From 1920×1080: take **1920px wide × 1008px height** (crop ~36px from top and bottom) → scale to 1200×630.

This is an almost-zero crop. Nearly every pixel of the master survives. Title, hero, boss, and background all present. Result should be excellent.

**Will the same art work directly?** YES — near-zero adjustment.

---

## 4. HIGH-RISK CROPS — SUMMARY

| Asset | Why it's hard | What to watch |
|-------|--------------|---------------|
| Steam small capsule (462×174) | Extreme compression, very short height | Title legibility at 174px tall — may need alternate treatment |
| Steam vertical capsule (600×900) | Portrait format cannot be cropped from landscape | Needs outpainting or separate portrait generation |
| Steam library hero (3840×1240) | Ultra-wide, wider than the master | Needs 2× upscale + horizontal extension |
| itch.io banner (1920×400) | Very wide, very short | Boss and hero both partially lost in band crop |

---

## 5. STEAM SMALL CAPSULE — SPECIAL TREATMENT (if needed)

If the standard small capsule crop fails legibility testing, use this alternate approach:

**Alternate small capsule treatment:**
Crop a tighter region from master: approximately x=384–1536 (1152px wide) × y=180–615 (435px tall). This centers directly on the title + upper hero zone. The title will be relatively larger at 462×174 than in the full-width crop. Boss energy background fills the upper area. Hero torso anchors the lower area.

Scale this 1152×435 crop → 462×174.

Test this alternate against the standard crop and use whichever passes legibility.

---

## 6. RECOMMENDED WORKFLOW ORDER

Execute in this sequence for maximum efficiency:

```
Step 1:  Trailer title card      → USE MASTER DIRECTLY (0 work)
Step 2:  Social preview          → NEAR-ZERO crop (36px trim top/bottom)
Step 3:  itch.io cover           → CENTER CROP sides (~279px each)
Step 4:  Steam header capsule    → CENTER CROP top/bottom (~91px each)
Step 5:  Steam small capsule     → CROP + LEGIBILITY TEST → iterate if needed
Step 6:  itch.io banner          → WIDE BAND CROP (optional asset)
Step 7:  Steam vertical capsule  → OUTPAINTING or new generation (separate session)
Step 8:  Steam library hero      → UPSCALE + EXTEND (separate session or post-launch)
```

Steps 1–5 can be done in a single editing session with one tool (GIMP, Photoshop, Canva, or online crop tool).
Steps 7–8 require an AI tool session (Firefly, Topaz, etc.) and are lower urgency.

---

## 7. IS ONE MASTER IMAGE ENOUGH?

**For itch.io launch:** YES — the 1920×1080 master covers itch.io cover, itch.io embed, social preview, and trailer card. These are the minimum viable set.

**For Steam launch:** MAYBE — Steam header and small capsule can be derived from the master. Steam vertical (600×900) and library hero (3840×1240) require additional work that can happen in parallel or post-launch.

**Bottom line:** One master gets Maria to itch.io launch-ready in a single crop session. Steam requires 2 additional asset treatments (vertical + hero) but those are not blocking itch.io.

---

## 8. MARIA'S CROP GO-AHEAD CHECKLIST

Before starting any crop/export, Maria should confirm:

- [ ] The accepted Oni cover PNG is saved as `phenix_null_eden_master_cover.png` in `release_store_package/final_assets/`
- [ ] Maria is happy with the cover as the itch.io primary face (not requesting another generation pass)
- [ ] Maria approves "Go ahead with crop step"

**When Maria says go:** Cowork will execute steps 1–5 of the workflow above and deliver all 5 assets as files in `final_assets/`.

**Crops NOT done yet.** Do NOT crop or export until Maria explicitly approves this step.

---

## 9. TOOL RECOMMENDATION FOR CROP SESSION

| Tool | Recommendation |
|------|---------------|
| **Photoshop** | Best — precise crop to exact px, smart export |
| **GIMP** (free) | Excellent — same precision, free |
| **Canva** | Easy UI but pixel precision limited — use only for approximate crops |
| **Online crop tool** (iloveimg, ezgif) | Acceptable for steps 1–4, not recommended for small capsule precision |
| **Cowork (this session)** | Can run Python/ImageMagick in the bash sandbox to do all crops programmatically — ask Maria if she wants this |

**Programmatic crop option:** Cowork can run all crops in one bash session using ImageMagick or Python Pillow — no manual tool needed. Maria drops the master PNG into `final_assets/` and says "run the crops." Cowork generates all 5 basic assets automatically with exact pixel dimensions.

---

*COVER_ADAPTATION_PLAN.md — crop planning document for PHENIX: NULL EDEN cover assets.*
*Do NOT export or upload without Maria's explicit go-ahead per step.*
*Do NOT edit gameplay code. Do NOT commit. Do NOT push. Do NOT publish.*
