# PHENIX: NULL EDEN — Cover Art Generation Set
## Created: 2026-06-30
## Status: READY TO GENERATE — Maria's decisions locked in

---

## LOCKED DECISIONS

- **Hero (primary):** ONI — Cataclysm Protocol. Armored demon-warrior, shockwave ability, maximum visual impact
- **Hero (alternate):** SKELETON WARRIOR — Bone Guard Blast. Dark skeletal aesthetic, tanky silhouette
- **First strategy:** Variation A — Balanced hero-vs-boss (Oni)
- **Also prepared:** Variation B — Boss-dominant (Oni) · Variation A with Skeleton Warrior
- **Boss:** MATRIX ANNIHILATOR — massive black geometric machine, crimson eyes, null-red electric arcs
- **Master canvas:** 1920×1080 px, 16:9

---

## GENERATE IN THIS ORDER

1. **VERSION 1 first** — Oni + Balanced (highest commercial potential, most informative)
2. **VERSION 2 second** — only if Version 1 boss element feels too small or weak
3. **VERSION 3 third** — only if Oni character design reads as unclear or busy

If Version 1 is strong, you may not need the others.

---

## VERSION 1 — ONI + VARIATION A (BALANCED HERO-VS-BOSS)

**Strategy:** Equal visual weight between hero and boss. The viewer sees both the threat and the fighter who stands against it. Most roguelite covers that convert well use this formula.

**Generate first. This is the primary commercial candidate.**

### Prompt

```
Premium dark cyberpunk indie game cover illustration. Game title: "PHENIX: NULL EDEN". Genre: cyber-survival roguelite.

HERO CHARACTER: In the lower center of the frame, an Oni warrior in heavy dark cyberpunk armor stands in a powerful combat stance — mid-Cataclysm Shockwave attack, both fists or weapon charged with exploding cyan and gold energy. Full body visible, facing slightly left toward the viewer. Dramatic underlighting in neon cyan and metallic gold. Armor is dark metal with glowing cyan rune markings. Face is partially obscured by an Oni mask or visor — dangerous and iconic, not human and friendly.

BOSS — MATRIX ANNIHILATOR: Dominates the upper half of the frame. Massive black angular geometric mechanical entity — towering, crystalline, threatening. Glowing crimson red eyes pierce forward toward the viewer. Null-red electric arcs and digital discharge radiate from its body outward into the upper frame. Its scale dwarfs the hero below — this is something that should be impossible to fight.

COMPOSITION: Lower center = hero (occupies bottom 35% of frame height). Upper center = boss (occupies upper 45% of frame). Boss and hero face each other across the center of the frame. The visual tension is the space between them. Background: deep void black (#04060C) with very faint neon cyan hexagonal grid lines receding toward center — atmospheric depth only, not a busy pattern. Lower frame corners: two or three dark enemy silhouettes in motion, partially in shadow.

PARTICLE EFFECTS: Cascading cyan data shards and floating gold energy orbs emanate from the hero's attack. Red null-static discharge at the boss perimeter. Ground-level energy ripple from the shockwave. These add depth without dominating.

TITLE TYPOGRAPHY — EMBEDDED IN IMAGE: At the top third of the image, between the boss and the top edge: "PHENIX: NULL EDEN" in large premium angular cyberpunk display font — metallic gold letters with a strong neon cyan outer glow halo. Below the title in small caps, approximately one third the title size: "A CYBER-SURVIVAL ROGUELITE" in dim muted cyan. Both lines must be cleanly legible. No other text in the image.

COLOR PALETTE: Background: #04060C near-black. Cyan energy: #00f5ff / #2EE6F6. Null red (boss): #ff003c. Metallic gold (hero, title): #FFD700. Minimal white — specular highlights only. No pastels, no neon pink, no lime green, no off-palette colors.

LIGHTING: High contrast dramatic cinema lighting. Boss lit from within by deep crimson. Hero lit from below by cyan and gold explosion energy. Background in deep shadow with atmospheric grid glow.

STYLE: High-fidelity premium indie game key art. Digital painting — NOT pixel art, NOT anime, NOT chibi, NOT mobile-game cartoon, NOT realistic photo. Visual register: Hades, Dead Cells, Returnal, Risk of Rain 2. Dark, confident, premium. The kind of game that costs money and is worth it.

MOOD: One warrior. One impossible machine. The grid is collapsing. The fight is happening anyway.

DO NOT INCLUDE: UI overlays, health bars, HUD elements, female ninja character (Phasewalker), Chaos Law panels, award badges, review text, screenshot-collage layout, overcrowded frame, bright backgrounds, anime faces, soft or pastel color palette.

ASPECT RATIO: 16:9. RESOLUTION: 1920×1080. Ultra-detailed. Store-ready game key art.
```

### Negative / Avoid List

- anime style, chibi style, cartoon, mobile game aesthetic
- Phasewalker (white/silver female ninja with katana)
- visible UI: health bar, XP bar, kill counter, minimap
- award ribbons, review stars, platform logos
- bright or white backgrounds
- flat drop-shadow title treatment
- screenshot-montage look
- too many characters (hero + boss + 2–3 silhouettes max)
- neon pink / magenta dominant palette
- cute or friendly Oni expression (should be masked/menacing)
- boss smaller than the hero
- empty boring backgrounds with no atmosphere

### Tool-specific settings

| Tool | Setting |
|------|---------|
| Midjourney v6 | `--ar 16:9 --style raw --q 2` — add `cinematic lighting, game cover art, dark cyberpunk` |
| DALL-E 3 | Add: `detailed digital painting, cinematic, dramatic lighting` at end of prompt |
| Adobe Firefly | Use "Match image style" with `screenshot_01_main_menu.png` as reference |
| Stable Diffusion XL | Use `game cover art, concept art` LoRA if available; negative prompt = see avoid list |

---

## VERSION 2 — ONI + VARIATION B (BOSS-DOMINANT)

**Strategy:** MATRIX ANNIHILATOR fills ~60% of the frame. Oni hero is present but visually smaller — defiant below the overwhelming machine. This version wins if the boss visual alone is jaw-dropping. More cinematic, less "two equal forces."

**Generate second, only if needed.**

### Prompt

```
Premium dark cyberpunk indie game cover illustration. Game title: "PHENIX: NULL EDEN". Genre: cyber-survival roguelite.

COMPOSITION FOCUS: The MATRIX ANNIHILATOR boss dominates the entire image. It fills from the upper frame down to the center — a massive black geometric crystalline machine that seems to tear open the space behind it. Its scale should feel like looking up at a building. Crimson red eyes blaze forward. Null-red electric arcs sweep outward from its body in sweeping arcs across the frame. Digital fracture lines radiate from its form.

ONI HERO: Smaller but defiant in the lower third of the frame. Full body visible, mid-attack stance with Cataclysm energy charging in both hands (cyan and gold). Facing upward toward the boss, slightly turned toward the viewer. Character is clearly powerful but clearly outscaled — this is the tension. Lit strongly in cyan and gold from the energy of their own attack.

BACKGROUND: Pure void black (#04060C) behind the boss. Below the hero: faint neon cyan grid ground lines extending to the lower frame edges. Boss glow and red arcs create all the atmosphere in the upper half.

PARTICLE EFFECTS: Fewer ground-level particles than Version A — the boss aura is the dominant energy. Hero shockwave charge glows bright at their hands. A handful of enemy silhouettes are barely visible in the lower corners, overwhelmed by the boss's presence.

TITLE TYPOGRAPHY — EMBEDDED: Top of frame, above the boss or overlaying its upper body: "PHENIX: NULL EDEN" in large angular cyberpunk font, metallic gold with cyan glow. Below in small caps: "A CYBER-SURVIVAL ROGUELITE" in dim cyan. Title must be legible against the dark upper area — choose a position where the boss does not compete with the text.

COLOR PALETTE: Same as Version 1: #04060C background, #00f5ff cyan, #ff003c null red (dominant in boss zone), #FFD700 gold. Boss zone = red dominant. Hero zone = cyan and gold dominant. Sharp contrast between the two halves.

STYLE: Same premium indie game key art register as Version 1. Ultra-detailed, cinematic, digital painting. NOT anime, NOT pixel, NOT mobile cartoon.

MOOD: The machine is everything. The warrior is one. The grid swallows both.

DO NOT INCLUDE: Same avoid list as Version 1. Additionally: do not let the boss become a decorative background — it must feel physically present and in the same space as the hero, not pasted behind them.

ASPECT RATIO: 16:9. RESOLUTION: 1920×1080. Ultra-detailed. Store-ready game key art.
```

### Negative / Avoid List

Same as Version 1, plus:
- boss looking like a flat background texture (must be three-dimensional and physically present)
- hero too small to identify (full body must still be clearly readable)
- composition feeling "empty" in the lower half

---

## VERSION 3 — SKELETON WARRIOR + VARIATION A (ALTERNATE HERO)

**Strategy:** Same balanced composition as Version 1, but with Skeleton Warrior instead of Oni. Use this if Oni reads as unclear or if Maria prefers the skeletal aesthetic. Skeleton Warrior has a distinctly dark silhouette — ribs, bones, armor plates — that can read well against a bright boss glow.

**Generate third, as comparison only.**

### Prompt

```
Premium dark cyberpunk indie game cover illustration. Game title: "PHENIX: NULL EDEN". Genre: cyber-survival roguelite.

HERO CHARACTER: In the lower center, a Skeleton Warrior in dark cyberpunk bone-plate armor stands in a powerful attack stance — Bone Guard Blast charging at both hands, explosive cyan and gold energy bursting outward. Full body visible. Skeletal aesthetic — ribs, bone structures, and dark armor plates with glowing cyan joints and eye sockets. Warrior posture, not defeated. Lit with strong cyan and gold underlighting that makes the bone structure dramatic and iconic.

BOSS — MATRIX ANNIHILATOR: Same as Version 1 — dominates the upper half of the frame, massive angular black geometric machine, crimson eyes, null-red arcs. Balanced weight with the hero.

COMPOSITION: Same balanced A composition as Version 1. Hero lower center, boss upper center, tension in the space between. Same background, same particle treatment, same title placement.

NOTE ON CONTRAST: The Skeleton Warrior's bone white and dark armor should contrast sharply against both the dark background and the boss glow. The cyan joint lighting should make it feel neon-edged against the void.

TITLE TYPOGRAPHY: Same as Version 1 — "PHENIX: NULL EDEN" top third, gold with cyan glow. "A CYBER-SURVIVAL ROGUELITE" below in dim cyan.

COLOR PALETTE: Same as Version 1. Exception: Skeleton Warrior's bone surfaces may have small areas of near-white — these should be deliberately lit, not flat white.

STYLE: Same premium indie key art register. NOT anime, NOT pixel, NOT cartoon.

MOOD: The dead that will not stay down. The grid cannot kill what is already bone.

DO NOT INCLUDE: Same avoid list as Version 1. Additionally: do not make the skeleton look "undead zombie horror" — should feel cyberpunk armored, not rotting or Halloween.

ASPECT RATIO: 16:9. RESOLUTION: 1920×1080. Ultra-detailed. Store-ready game key art.
```

### Negative / Avoid List

Same as Version 1, plus:
- zombie / horror / rotting skeleton aesthetic (should be clean cyberpunk armor)
- skeleton looking fragile or weak (should look powerful and battle-ready)
- bone surfaces as plain dull white (should be lit, cyberpunk, with glowing joints)

---

## RECOMMENDED MASTER SIZE AND CROP GUIDANCE

### Master canvas

Generate all versions at: **1920×1080 px** (or closest equivalent in your AI tool)

This is the safe master. Every downstream asset is cropped or adapted from this.

### Crop guidance

| Asset | Size | Crop method | Critical elements to preserve |
|-------|------|-------------|-------------------------------|
| itch.io cover | 630×500 px | Center crop — use 1080×857 region from master, scale down | Title + hero + boss eyes all visible |
| itch.io embed | 640×360 px | Full-width center crop — take the full 1920×1080, scale to 640×360 | Title visible in top third |
| Steam header capsule | 920×430 px | Full-width, center vertical crop — take middle 920px-wide × 430px-tall strip | Title + hero + boss |
| Steam small capsule | 462×174 px | Full-width, tight center crop — scale entire image down; title must survive at this size | Title and boss glow only at this scale |
| Social preview | 1200×630 px | Full-width crop from the master top | Title + hero + boss |
| Steam library capsule | 600×900 px | Vertical rework required — see COVER_IMAGE_BRIEF.md Section 9 | Separate vertical prompt needed |
| Steam library hero | 3840×1240 px | Upscale + extend master horizontally — or request from AI at 3:1 ratio | Safe center zone = title + hero + boss |

### Small-size legibility test

Before finalizing any version: scale the image down to **300×237 px** (itch grid thumbnail size).

Ask yourself:
- Is "PHENIX: NULL EDEN" still readable?
- Does the boss still look massive?
- Does the hero still have a visible silhouette?

If any answer is no: the title needs to be larger, or the composition needs less visual noise.

---

## WHICH VERSION IS STRONGEST COMMERCIAL FIRST IMPRESSION

**Version 1 (Oni + Balanced A)** is the primary commercial candidate.

Reasoning:
- Roguelite covers that show both hero agency and boss threat consistently outperform hero-only or environment-only covers in store grids
- Oni has the most visually powerful silhouette of the two hero options — the Oni mask / demon warrior archetype is immediately readable as "action, power, dark fantasy"
- The balanced composition gives the viewer two anchors (hero + boss) rather than one, which increases the time they spend on the image
- At itch.io thumbnail size (300px wide), the hero-vs-boss tension is still readable even when the detail is lost

**Version 2** is the backup — generates best when the boss visual alone is extraordinary. Choose Version 2 over Version 1 only if the Annihilator looks more impressive filling the whole frame.

**Version 3** (Skeleton Warrior) is a creative variant — generates best as a comparison for Maria's character preference. If the Skeleton Warrior's silhouette reads more cleanly than the Oni at small sizes, it may win for practical reasons.

---

## MARIA'S APPROVAL CHECKLIST

Use this after receiving generated results. Check each box before selecting a winner:

**Readability at scale**
- [ ] Title "PHENIX: NULL EDEN" is fully readable when image is shrunk to 300 px wide
- [ ] Hero character has a clear, readable silhouette (not buried in particles or background)
- [ ] Boss is clearly massive — not a background decoration

**Content accuracy**
- [ ] No HUD, health bars, XP bars, or any UI overlay
- [ ] No Phasewalker (white/silver female ninja)
- [ ] No COMING SOON overlays or Chaos Law panels
- [ ] No award badges, review scores, or platform logos

**Visual quality**
- [ ] Image feels like a premium paid game — not mobile, not free-to-play
- [ ] Color palette is dark: black/cyan/gold/red — no bright white backgrounds, no neon pink
- [ ] Typography is angular cyberpunk — not handwritten, thin, or serif
- [ ] Boss and hero feel like they exist in the same physical space

**Gut check**
- [ ] Would you click this in an itch.io grid?
- [ ] Does it feel like PHENIX: NULL EDEN — not a generic cyberpunk game?
- [ ] Does the cover suggest survival, chaos, bosses, and upgrades without showing any of them literally?

**If passing all checks:** export PNG, crop to 630×500, upload to itch.io draft page.
**If one item fails:** one targeted iteration on that element only. Do not regenerate from scratch.

---

*Generation set complete. Generate Version 1 first. Everything needed is in this file.*
