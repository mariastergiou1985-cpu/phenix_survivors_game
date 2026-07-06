# PHENIX: NULL EDEN — Cover Candidate 02
## Version: ONI BOSS-DOMINANT
## Strategy: Variation B — MATRIX ANNIHILATOR fills the frame, Oni defiant below
## Commercial strength: 8/10 — cinematic alternative, strong Steam capsule candidate

---

## WHY THIS CANDIDATE

Some of the most effective roguelite covers work by making the player feel the scale of the threat before they feel the power of the hero. This version leans into that: the MATRIX ANNIHILATOR is not just a character on the cover — it IS the cover. The Oni is present but visually subordinate, which makes the survival premise immediately visceral. "You are small. This is what you fight. You fight it anyway."

This version generates the strongest Steam header capsule because the boss silhouette reads at tiny sizes where a balanced composition might collapse into visual noise.

**Screenshots that inspired this candidate:**
- `screenshot_06_boss_MATRIX_ANNIHILATOR_INBOUND.png` — the moment the boss fills the screen, projectile storm, overwhelming presence
- `screenshot_06_boss_ANNIHILATOR_visible.png` — the boss fully visible, structure legible
- `screenshot_08_chaos_combat.png` — scale of threat vs. player in Chaos Mode

---

## MAIN PROMPT

```
Premium dark cyberpunk indie game cover key art. Game: "PHENIX: NULL EDEN", a cyber-survival roguelite.

BOSS — MATRIX ANNIHILATOR (dominant, fills 60% of frame): The MATRIX ANNIHILATOR is the visual center of this image. It descends from the upper portion of the frame, filling the upper 60% with its mass. Angular, crystalline, architectural in scale — black lattice construction, hard geometric edges, no organic curves. It is not floating in the background. It is physically present, descending or looming forward, as if it is entering the image from above. Its scale: the viewer is looking UP at it. Two large crimson-red eye points blaze forward toward the viewer — these are the dominant focal point of the image and should be immediately visible even at thumbnail size. Null-red electric arcs and digital tendrils radiate from its form like lightning held in structure — they sweep into the lower half of the frame, creating visual energy that bridges the boss and the hero. The underside of the machine should be partially visible, suggesting its vast scale extends beyond the frame.

HERO — ONI WARRIOR (lower center, 25% of frame height): The Oni warrior is smaller in this composition but not weak. They stand in the lower center of the frame, one knee possibly forward in combat stance, Cataclysm energy charged at their fists — cyan and gold erupting upward toward the boss. The hero faces upward, toward the threat. The Oni mask/visor glows cyan. The hero is clearly the player — defiant, small relative to the machine, but radiating power. The energy from the hero's attack reaches upward in the empty space between them, a visual bridge that connects the two halves of the image. The viewer's eye travels: boss eyes → empty gap → hero energy → up again.

BACKGROUND: The sky/upper zone around the boss: deep null-red ambient glow from its aura, bleeding into near-black. The ground zone around the hero: cyan and gold energy light reflecting off a dark floor. The entire background is near-black (#04060C) — the boss and hero ARE the light sources. A barely-visible corrupted neon grid in the far background, almost invisible — structural suggestion only.

ENEMY PRESENCE: Two or three enemy silhouettes are pressed against the lower-left corner only — as if retreating from the boss as much as from the hero. They are shadow shapes, barely rendered, serving as scale reference and depth layer.

PARTICLES: Sparse in the hero zone — mostly the hero's own cyan/gold energy burst directed upward. Medium density in the space between boss and hero — red null-static falling from the boss perimeter, cyan fragments rising from the hero. The particle field creates the "contested space" between the two.

TITLE TYPOGRAPHY — EMBEDDED IN IMAGE: Upper section — title placement is critical in this composition because the boss occupies so much vertical space. Place "PHENIX: NULL EDEN" above the boss's main body, in the very top 15% of the frame, or overlaying the top of the boss's form where the geometry creates a dark region for text. Font: same as Candidate 01 — angular geometric cyberpunk, metallic gold with cyan outer glow. "A CYBER-SURVIVAL ROGUELITE" in dim cyan small-caps, below the title. The title must not be lost against the boss body — ensure sufficient contrast. If the boss top is too bright, the title needs a subtle dark shadow underlay (not a box — a very soft dark gradient behind the text only).

COLOR RULES: Same palette as Candidate 01. Exception: in this version, null-red (#ff003c) and near-black dominate the upper 60% of the frame. Cyan and gold dominate the lower 25%. The center zone is contested between the two color families. This color split is the narrative of the image in color form.

ATMOSPHERE: More threatening than Candidate 01. The mood is darker, more claustrophobic. The viewer should feel that the hero has no room to retreat — the boss is above, enemies are to the side, and the only direction is forward. This is what Chaos Mode feels like.

STYLE: Same premium dark cyberpunk digital illustration as Candidate 01. NOT anime, NOT pixel, NOT mobile. Same visual register: Hades, Returnal, Dead Cells — but heavier on the threat.

MOOD: The machine descends. The grid is breaking. The Oni does not move.

DO NOT INCLUDE: Same exclusions as Candidate 01. Additionally: do not let the boss recede into the background — it must feel three-dimensional and physically present in the foreground/mid-ground. Do not reduce the hero to a tiny unreadable speck — the Oni must still be identifiable as a character even at 30% of frame height.
```

---

## NEGATIVE PROMPT

```
anime, chibi, cartoon, mobile game, pixel art, low poly, watercolor, manga, photorealistic face, white ninja, female ninja, katana, phasewalker, health bar, HUD, UI overlay, XP bar, score counter, mobile controls, joystick, award ribbon, review stars, platform logo, bright background, white background, pastel colors, neon pink, magenta, lime green, boss in background only, boss flat texture, hero tiny and unreadable, hero smaller than a speck, distorted anatomy, extra fingers, broken hands, blurry, low quality, watermark, jpeg artifacts, text errors, wrong title spelling, illegible title, generic cyberpunk wallpaper, stock art feeling, overcrowded particles, particle fog that obscures everything, empty dark background with no detail
```

---

## RECOMMENDED GENERATION SETTINGS

| Tool | Settings |
|------|----------|
| **Midjourney v6** | `/imagine [prompt] --ar 16:9 --style raw --q 2` — add `cinematic scale, dramatic perspective, looking up at boss` |
| **DALL-E 3** | Emphasize: `extreme scale difference, boss filling upper frame, hero small but defiant below` |
| **Adobe Firefly** | Use `screenshot_06_boss_MATRIX_ANNIHILATOR_INBOUND.png` as primary image reference for boss scale |
| **Stable Diffusion XL** | Use ControlNet depth map if available to enforce scale hierarchy; negative prompt above |

---

## CROP GUIDANCE

This version is asymmetrically weighted (boss top, hero bottom) — most crops favor the boss-dominant upper zone.

| Asset | Target size | Crop notes |
|-------|------------|------------|
| **itch.io cover** | 630×500 px | Center crop. Boss eyes and title in upper portion, hero at lower center. The 630×500 ratio works well here — slightly less landscape than the master, shows more of the vertical boss/hero separation. |
| **Steam header capsule** | 920×430 px | Full-width center band. Boss eyes dominate upper area. **This is where this candidate outperforms V1** — at 920×430, the boss eyes + null-red arcs read as a strong visual anchor at glance speed. |
| **Steam small capsule** | 462×174 px | The boss eye glow should still be visible. Hero may be extremely small — test before uploading. If hero is illegible at this size, use V1 or V3 for small capsule. |
| **Social preview** | 1200×630 px | Full master scaled — works well. Boss fills upper 60%, hero anchors lower center. |
| **Steam library hero** | 3840×1240 px | Wide adaptation needed. Boss occupies left-center zone, hero right-center. Very wide format changes the composition — may need separate wide-format prompt. |
| **Steam library capsule** | 600×900 px | Portrait format — EXCELLENT fit for this candidate. The vertical stack (boss top, hero bottom) maps naturally to 2:3 portrait format with less rework than V1. Adapt the vertical prompt from COVER_IMAGE_BRIEF.md. |

**Minimum legibility test:** Scale to 300×237 px. Boss eyes must still glow. Title must be readable. Hero silhouette visible.

---

## COMMERCIAL STRENGTH: 8/10

**Strengths:** Most cinematic of the three. Maximizes boss drama. Steam library capsule (600×900) is a natural fit for this composition. The boss-eye focal point is immediately readable at any size. Very differentiated from generic roguelite covers that all show a hero mid-attack with nothing behind them.

**Risks:**
- Title placement is harder in this composition — the boss occupies where the title wants to go. Iterate if the title is not clearly legible.
- Hero must not become visually irrelevant. If Oni reads as a tiny unidentified speck, use this as Steam capsule only and use V1 as itch cover.
- This version is darker and more intimidating — may communicate difficulty over fun. This is fine for the audience but watch for it.
- At Steam small capsule (462×174 px), the hero may disappear entirely. Test before committing.

**Best used as:** Steam header capsule, Steam library capsule, trailer title card

---

*Candidate 02 of 3 — generate second if V1 boss feels small.*
