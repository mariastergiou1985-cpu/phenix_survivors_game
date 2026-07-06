# PHENIX: NULL EDEN — Next Asset Step
## Created: 2026-06-30
## Status: Screenshots packaged — cover image is next

---

## CURRENT STATE

### Accepted screenshots (27 files in screenshots_raw/)

**Core store shots — confirmed:**
- `screenshot_01_main_menu.png` — main menu ✅
- `screenshot_02_character_select.png` — character select ✅
- `screenshot_04_upgrade_selection.png` — upgrade cards ✅
- `screenshot_05_progression_screen.png` — meta-progression ✅
- `screenshot_05b_protocols.png` — protocols tab ✅
- `screenshot_05c_relics.png` — relics tab ✅
- `screenshot_06_boss_MATRIX_ANNIHILATOR_INBOUND.png` — hero boss shot ✅ ← best boss shot
- `screenshot_06_boss_fight.png` — boss fight alt ✅
- `screenshot_08_chaos_combat.png` — Chaos Mode combat ✅
- `screenshot_08_chaos_combat_alt1.png` — Chaos alt ✅
- `screenshot_09_chaos_law_overlay.png` — Chaos Law overlay ✅ ← verify COMING SOON labels
- `screenshot_10_chaos_rank_result.png` — Chaos Rank BRONZE result ✅
- Plus 15 additional alt/bonus shots

### Missing high-priority screenshots

| Shot | Status | Notes |
|------|--------|-------|
| SHOT 03 — Act 1 combat | Missing | Medium priority — SHOT 08 covers combat well |
| SHOT 07 — Walker ally | Missing | Low priority |
| SHOT 11 — Mobile touch | Missing | Low priority |
| SHOT 12 — Controller | Missing | Low priority |

**To capture SHOT 03 quickly** — open the game, start a normal run, wait 3–5 min, then run this in the browser console:
```javascript
(function(n){const c=document.getElementById('game'),a=document.createElement('a');a.download=n+'.png';a.href=c.toDataURL('image/png');document.body.appendChild(a);a.click();document.body.removeChild(a);})('screenshot_03_act1_combat');
```

---

## RECOMMENDED NEXT ASSET: itch.io COVER IMAGE

### Why cover image comes first

1. **itch.io is live now** — the page is public (or will be soon); the cover is the first thing anyone sees when browsing
2. **Single asset, maximum impact** — one image unblocks the entire visual pipeline:
   - Same art → Steam capsule (crop/resize)
   - Same art → trailer title card
   - Same art → social media preview
   - Same art → Discord banner
3. **Easiest to iterate** — an AI-generated concept takes minutes; refining code takes hours
4. **Blocking** — no professional store page looks right without a cover; screenshots alone don't convey premium quality

---

## PREMIUM COVER IMAGE CONCEPT

### Visual composition

```
┌─────────────────────────────────────────────┐
│   PHENIX: NULL EDEN          [Gold/Cyan]    │  ← Top third: Title
│   A CYBER-SURVIVAL ROGUELITE [Dim cyan]     │
│                                             │
│        [MATRIX ANNIHILATOR]                 │  ← Upper center: Boss
│       looming, crimson glow,                │   massive, angular, dark
│       null-red electric arcs                │
│                                             │
│          [HERO CHARACTER]                   │  ← Lower center: Player
│         mid-attack, rimlit                  │   cyan + gold rim light
│         cyan and gold                       │
│                                             │
│  [enemies]               [enemies]          │  ← Corners: silhouettes
└─────────────────────────────────────────────┘
     Dark void black + cyan grid (subtle)
```

### Creative direction

- **Background:** Deep void black (#0a0a12) — a faint cyan neon grid fades toward center (atmospheric, not dominant)
- **Boss (upper half):** MATRIX ANNIHILATOR — massive, black angular geometry, crimson eye glow, null-red electric arcs radiating outward
- **Hero (lower center):** Oni or Cyber Skeleton Warrior — dynamic mid-attack pose, full body, strong cyan and gold rim lighting from below
- **Foreground:** Walker / enemy silhouettes at lower corners, in motion
- **Particles:** Cyan data shards, red null static, floating gold XP orbs
- **Palette:** `#0a0a12` black · `#00f5ff` cyan · `#ff003c` null red · `#ffd700` gold

### Title treatment

- **"PHENIX: NULL EDEN"** — top third, gold metallic letters with strong cyan outer glow
- **"A CYBER-SURVIVAL ROGUELITE"** — small caps below title, dim cyan
- No other text on the image

### Reference screenshots to use

- `screenshot_06_boss_MATRIX_ANNIHILATOR_INBOUND.png` — boss scale, lighting, atmosphere
- `screenshot_01_main_menu.png` — color palette and neon grid style

---

## IMAGE GENERATION PROMPT — COVER (1920×1080)

Copy this entire block into your AI image tool:

```
A premium dark cyberpunk game cover illustration for "PHENIX: NULL EDEN".

Composition: A lone cyberpunk warrior in powered armor stands in a combat stance in the lower center of the frame, mid-attack, surrounded by cascading cyan data particles and neon gold energy trails. Behind them, a massive geometric mechanical boss entity — the MATRIX ANNIHILATOR — dominates the upper half of the image, its angular black-and-red form looming with crimson eyes glowing and arcs of null-red electricity radiating outward. Scattered enemy silhouettes flank the edges at the bottom corners, in motion.

Style: High-fidelity digital concept art. Dramatic cinematic lighting. Strong rim lighting in cyan and gold on the hero character. Boss lit internally with deep crimson red. Dark void-black background with a subtle fading neon cyan grid pattern (atmospheric only — not dominant). Particle systems: cyan data shards, red static discharge, floating gold orbs.

Color palette: Deep black (#0a0a12), neon cyan (#00f5ff), null red (#ff003c), metallic gold (#ffd700). No pastels. No bright white backgrounds.

Typography (embedded in the image, top third): "PHENIX: NULL EDEN" in a premium angular cyber font, metallic gold with a strong cyan neon glow. Below it in small caps: "A CYBER-SURVIVAL ROGUELITE" in dim muted cyan.

Mood: Overwhelming threat. Lone warrior against a collapsing digital grid. Desperate intensity with a premium finish. The kind of game worth paying for.

Do NOT include: fake UI elements, fake gameplay HUD overlay, Phasewalker character (white/silver female ninja), inactive Chaos Law icons shown as selectable, unreadable fine text, bright colors outside the stated palette, photorealistic human faces, anime/chibi style, clutter.

Aspect ratio: 16:9. Resolution: 1920×1080. Ultra-detailed. Game cover quality.
```

**Recommended tools:** Midjourney (v6+), DALL-E 3, Adobe Firefly, Stable Diffusion XL, Leonardo.ai

---

## STEAM CAPSULE ADAPTATION CONCEPT

Steam requires separate capsule images at specific sizes. Derive all from the cover art.

### Steam capsule (460×215 px — landscape)

Crop strategy:
- Center crop from the 1920×1080 cover
- Focus on: title text (top) + hero character (center) + boss glow (visible)
- Ensure "PHENIX: NULL EDEN" title is fully readable at 460px wide
- Remove the subtitle line — too small to read at this size
- Boss glow/atmosphere should frame the title from above

### Steam header capsule (460×215 px)

Same as above — Steam uses this in the store header strip.

### Steam library hero (1920×620 px)

Wide landscape crop from the same art:
- Title centered top-left area
- Hero and boss centered
- Crop top and bottom to the wide 1920×620 ratio
- Slightly more horizontal composition — push hero slightly left, boss fills right

### Steam library capsule (600×900 px — vertical)

Different composition — vertical stack:

```
┌──────────────────────┐
│  PHENIX: NULL EDEN   │  ← Title top
│  [Boss upper area]   │  ← Boss fills upper 40%
│  [Hero full body]    │  ← Hero center 35%
│  [Enemy silhouettes] │  ← Bottom 25%
└──────────────────────┘
```

AI prompt for vertical capsule:
```
Same PHENIX: NULL EDEN art style but vertical composition (2:3 portrait ratio, 600×900 px). Title "PHENIX: NULL EDEN" at the top. MATRIX ANNIHILATOR boss fills the upper portion looming downward. Hero warrior full body in the center. Enemy silhouettes at the bottom. Dark black background with subtle cyan grid. Gold title, cyan hero rim light, crimson boss glow. Premium cyberpunk game vertical box art.
```

---

## WHAT MARIA MUST APPROVE NEXT

Before running image generation:

1. **Cover composition** — approve the concept in this file (Section: Premium Cover Image Concept)
2. **Hero character choice** — Oni (more armor/bulk) or Skeleton Warrior (more edgy/skeletal)? This affects the cover character
3. **Title font style** — angular/sharp cyber (e.g. Orbitron, Rajdhani) or more minimal/clean? Affects how "PHENIX: NULL EDEN" looks
4. **Boss focal point** — Matrix Annihilator only, or a collage of multiple bosses? Single boss is cleaner; collage shows variety
5. **Image generation tool** — which tool does Maria prefer or have access to? (Midjourney / DALL-E / Firefly / etc.)
6. **Tagline on cover** — "A CYBER-SURVIVAL ROGUELITE" or a different tagline from `ITCH_PAGE_COPY.md`?

Once approved → generate → review → adapt to Steam sizes → done.

---

*Next step after cover: Steam capsule adaptation and itch.io page header upload.*
*After that: trailer title card + end card (same art, motion version).*
