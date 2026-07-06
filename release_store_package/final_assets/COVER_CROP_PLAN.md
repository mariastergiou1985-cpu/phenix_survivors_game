# PHENIX: NULL EDEN — Cover Crop & Adaptation Plan
## Status: READY — waiting for Maria's crop go-ahead
## Master source: phenix_null_eden_master_cover.png (1920×1080)
## Updated: 2026-06-30

---

## ⚠️ DO NOT CROP YET

This plan is prepared and waiting. Cropping begins only when Maria says:
"Go ahead with crop step."

Do NOT publish or upload any cropped asset without Maria's explicit final approval per platform.

---

## MASTER FILE

| Item | Value |
|------|-------|
| Filename | `phenix_null_eden_master_cover.png` |
| Location | `release_store_package/final_assets/` |
| Size | 1920×1080 px |
| Format | PNG (lossless — do not save as JPEG until final export) |
| Status | Pending placement by Maria |

---

## CROP OUTPUT TABLE

All crops derived from the 1920×1080 master. Center zone (title + hero + boss) must be preserved in every crop.

| Asset | Output filename | Target size | Crop method | Platform |
|-------|----------------|-------------|-------------|----------|
| itch.io cover | `itchio_cover_630x500.png` | 630×500 px | Center crop: take ~1008×800 region from master center → scale to 630×500. Title in top 25%, hero in bottom 40%, boss above. | itch.io primary cover |
| itch.io embed | `itchio_embed_640x360.png` | 640×360 px | Scale full 1920×1080 → 640×360. All elements visible. | itch.io page embed / widget |
| Steam header capsule | `steam_header_920x430.png` | 920×430 px | Full width × center vertical band (430px tall from 1080). Title + hero + boss all survive. | Steam library header |
| Steam small capsule | `steam_small_462x174.png` | 462×174 px | Scale full image → 462×174 OR full-width center band. Test title legibility before finalizing. | Steam store grid |
| Steam vertical capsule | `steam_vertical_600x900.png` | 600×900 px | Vertical rework — NOT a simple crop. See vertical generation note below. | Steam library portrait |
| Steam library hero | `steam_hero_3840x1240.png` | 3840×1240 px | AI upscale + horizontal extension OR separate wide-format generation. See note below. | Steam library hero banner |
| Trailer title card | `trailer_titlecard_1920x1080.png` | 1920×1080 px | The master itself — no crop needed. Add motion/text in video editor if needed. | Trailer opening card |
| Social preview | `social_preview_1200x630.png` | 1200×630 px | Center crop 1200×630 from master top-center region. Standard 1.91:1. | Twitter/X, Discord, Facebook |

---

## CRITICAL: LEGIBILITY TEST BEFORE ANY UPLOAD

Scale the master to **300×237 px** and verify:
- [ ] "PHENIX: NULL EDEN" title is readable
- [ ] Boss is clearly a massive threat (not lost to compression)
- [ ] Hero silhouette reads clearly against background
- [ ] At least 2 of 3 elements (title / boss / hero) have strong contrast at tiny size

If any item fails: do NOT upload that crop. Adjust the crop region and re-test.

---

## VERTICAL CAPSULE NOTE (600×900)

The 1920×1080 master does NOT simply crop to 600×900 portrait — the composition is landscape. Options:

**Option A (fastest):** Extend the master vertically — add more environment/background above and below the composition using AI inpainting (Firefly "Generative Fill" or similar). Keep title in upper third, hero in lower center, boss spanning the full width.

**Option B (cleanest):** Use the vertical prompt from `COVER_IMAGE_BRIEF.md` Section 9 to generate a dedicated 600×900 portrait composition in the same style.

**Option C (fallback):** Crop a tight 540×960 region from master center → scale to 600×900. Title and hero must both survive this tighter crop — boss fills the top third.

---

## STEAM LIBRARY HERO NOTE (3840×1240)

The 3:1 aspect ratio (3840×1240) is very wide. Options:

**Option A:** AI upscaler (Topaz Gigapixel, Real-ESRGAN) → upscale master → crop to 3:1. Works if the master is high enough quality.

**Option B:** Use outpainting (Firefly "Generative Fill") to extend left and right sides of master. Maintain character positions, extend background only.

**Option C:** Request a new 3840×1240 generation with the same prompt, adjusted for 3:1 ratio (hero center, boss above center, environment fills left/right sides).

---

## UPLOAD ORDER (when Maria approves)

Do NOT upload to any platform without Maria's explicit approval per step.

1. `itchio_cover_630x500.png` → itch.io draft page (cover image slot) — **itch.io approval required**
2. `itchio_embed_640x360.png` → itch.io page embed — same approval
3. `steam_header_920x430.png` → Steamworks capsule upload — **Steam approval required**
4. `steam_small_462x174.png` → Steamworks small capsule — same approval
5. `steam_vertical_600x900.png` → Steamworks library capsule — same approval
6. `steam_hero_3840x1240.png` → Steamworks library hero — same approval

---

*COVER_CROP_PLAN.md — crop plan ready. Waiting for Maria's go-ahead.*
*Do NOT crop, export, or upload until Maria explicitly approves each step.*
