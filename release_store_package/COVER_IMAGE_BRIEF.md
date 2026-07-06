# PHENIX: NULL EDEN — Cover Image Production Brief
## Created: 2026-06-30
## Status: READY FOR GENERATION — awaiting Maria's composition approval

---

## 1. FINAL ASSET TARGET

**Primary deliverable:** itch.io Cover Image
- Required minimum: 630×500 px
- Recommended: Generate at **1920×1080 master** and crop/resize — the master is reusable for every downstream asset

**Downstream reuse from same master art:**
- Steam Header Capsule: 920×430 px — center landscape crop
- Steam Library Capsule: 600×900 px — vertical composition variant (separate prompt below)
- Steam Library Hero: 3840×1240 px — ultra-wide crop of the same art (stretch-aware safe zone)
- Trailer Title Card: 1920×1080 — same master, add motion
- Social preview: 1200×630 px — center crop
- itch.io Page Banner: 960×200 px — top strip crop

**Rule: generate one strong 1920×1080 master → derive everything else. Do not generate each size separately.**

---

## 2. RECOMMENDED MASTER CANVAS

Start at **1920×1080 px, 300 DPI** (or equivalent high-res for AI generation).

Composition is intentionally centered: the key elements (title, hero, boss) occupy the center 60% of the frame. This means:
- Cropping to 920×430 (Steam Header): center crop, full width, cuts top/bottom — title and hero remain visible
- Cropping to 630×500 (itch.io Cover): center square-ish crop — title and hero dominate
- Cropping to 600×900 (Steam Library Capsule): requires a **vertical rework** — separate prompt provided in Section 9

Avoid placing critical elements (title text, hero face/weapon, boss eyes) within 100 px of any edge on the master.

---

## 3. CORE COMPOSITION

```
┌────────────────────────────────────────────────────────┐
│                                                        │
│   ⚡ PHENIX: NULL EDEN          [gold + cyan glow]    │  row 1 — TITLE
│      A CYBER-SURVIVAL ROGUELITE  [dim cyan caps]      │  row 2 — SUBTITLE
│                                                        │
│           ╔══════════════════════╗                    │
│           ║  MATRIX ANNIHILATOR  ║                    │  ← BOSS
│           ║  angular / massive   ║                    │    upper center
│           ║  crimson eyes glow   ║                    │    fills ~45% height
│           ║  null-red arcs       ║                    │
│           ╚══════════════════════╝                    │
│                                                        │
│                    ╔═══════╗                          │
│   [silhouettes]    ║ HERO  ║    [silhouettes]         │  ← HERO lower center
│   enemies at       ║ mid-  ║    Walker/enemies        │    25–30% height
│   lower left       ║attack ║    lower right           │
│                    ╚═══════╝                          │
│   ~~~~~ particles, cyan data shards, gold orbs ~~~~~  │
│                                                        │
└────────────────────────────────────────────────────────┘
         subtle neon cyan GRID fades in from edges
         background: deep void #04060C or #0a0a12
```

### Element breakdown

**Title — top third**
- "PHENIX: NULL EDEN" — prominent, angular cyber font, metallic gold with strong cyan outer glow
- Below: "A CYBER-SURVIVAL ROGUELITE" — small caps, dim cyan, approximately 1/3 the size of the title
- Both lines sit above the boss — the boss looms under the title, framing it with threat

**Boss — upper center**
- MATRIX ANNIHILATOR: massive, angular, dark-on-dark geometry, defined by its glow not its surface
- Crimson-red eyes pierce forward (toward viewer)
- Null-red electric arcs extend outward from its form into the frame edges
- Boss occupies roughly the upper 45% of the frame height, centered
- Deliberately large: it should feel like it cannot be escaped

**Hero — lower center**
- One character in dynamic combat pose — mid-attack, facing left or slightly angled toward viewer
- Character options: **Oni Cataclysm Protocol** (recommended — most visually dramatic) or **Skeleton Warrior** (strong dark aesthetic)
- Strong cyan and gold rim lighting from below — character pops against the dark background
- Character is clearly confident and in motion — not fleeing, fighting
- Occupies roughly lower 30% of frame height, centered below the boss

**Background atmosphere**
- Deep near-black void (#04060C or #0a0a12)
- Faint neon cyan grid lines receding toward center — atmospheric, not a busy pattern
- Grid should be barely visible: the art, not the grid, carries the image

**Foreground / environment**
- Lower corners: Walker silhouette (left) + 2–3 enemy silhouettes (right) — dark, in motion
- Ground level: scattered cyan data particles, gold XP orb shapes, small red static discharge
- Particle layer creates depth and energy without cluttering the hero

**VFX / energy treatment**
- Boss aura: null-red energy radiates outward from its body in arcs and trails
- Hero aura: cyan and gold energy flows from their weapon/hands during attack
- Title glow: softly pulses outward — the title should feel lit, not pasted
- Avoid: flat logos, hard-edged text shadows, over-saturated neon bloom that washes out the composition

---

## 4. STYLE DIRECTION

**Genre reference feel:** Premium indie action roguelite — in the visual register of Hades, Dead Cells, Cult of the Lamb covers. Not mobile, not chibi, not pixel art, not retro. Dark, confident, high-contrast.

**Aesthetic:** Premium cyberpunk. Digital corruption. Neon death machine. The NULL EDEN grid is alive and hostile.

**Color system (from in-game palette — match the actual game):**
- Primary background: `#04060C` (near-black with blue-black tint)
- Neon cyan: `#00f5ff` or `#2EE6F6` — hero lighting, grid lines, title glow
- Null red: `#ff003c` — boss energy, threat indicators
- Gold: `#FFD700` — title metal, hero energy, achievement feel
- White: used sparingly for highlight specks and eye glow only

**Typography style:**
- Angular / geometric cyber font (not handwritten, not serif, not thin)
- Examples: Orbitron, Rajdhani Bold, Exo 2, Bebas Neue (condensed variant)
- Title must be fully readable when the image is shrunk to 300×250 px (itch thumbnail size)
- No decorative text effects that disappear at small size

**What the image must convey without words:**
- This is a game about survival under overwhelming threat
- There is a powerful player character who fights back
- The world is dark, digital, and hostile
- This game has production value — it is worth paying for

---

## 5. CONTENT REQUIREMENTS

**Must include:**
- Title "PHENIX: NULL EDEN" — fully legible at every size the image will be used
- One clearly readable hero character with attitude
- One clear boss/threat presence
- Environmental atmosphere consistent with the game (dark, cyber, neon)
- Particle/energy effects suggesting action

**Must feel like:**
- A paid indie action roguelite
- A game with multiple modes, depth, and replayability
- A cyberpunk world with its own visual identity

**Must NOT include:**
- HUD, UI overlays, health bars, XP bars, kill counters, or any in-game interface
- Phasewalker character (white/silver female ninja — COMING SOON, not in shipped game)
- Chaos Law selection overlay or any "COMING SOON" panel
- Screenshot collage or montage layout
- Too many characters crowding the frame (max: 1 hero, 1 boss, 2–3 silhouettes)
- Mobile controls / virtual joystick indicators
- Debug text, console text, any text not intended for the cover
- Bright white or neon yellow backgrounds — must be dark
- Childish, cartoon, anime, chibi, or lo-fi pixel art style
- Review stars, award badges, or any text claiming awards

---

## 6. WHAT SHOULD BE SHOWN

| Element | How prominent | Notes |
|---------|---------------|-------|
| PHENIX: NULL EDEN title | DOMINANT | Top third, large, gold with cyan glow |
| Hero character | STRONG | Lower center, mid-attack, full body visible |
| MATRIX ANNIHILATOR boss | STRONG | Upper center, massive, looming, crimson glow |
| Null grid background | SUBTLE | Near-black, faint cyan grid lines |
| Energy / VFX particles | MEDIUM | Cyan, gold, red — depth and motion |
| Walker / enemy silhouettes | SUBTLE | Corners only, in shadow |

---

## 7. WHAT SHOULD NOT BE SHOWN

- Any gameplay UI or HUD
- Phasewalker (not in shipped game)
- Any character at full light on a bright background
- Screenshot collage / photo-real crop from screenshots
- Too much empty space (weak empty backgrounds fail at thumbnail size)
- Clutter — if it doesn't add to the threat/hero tension, remove it
- Coming Soon labels, inactive Chaos Laws displayed
- More than one boss (boss collage reads as clutter at small sizes)

---

## 8. EXACT IMAGE-GENERATION PROMPT — ITCH.IO COVER (1920×1080 MASTER)

Copy and paste this entire block:

```
Premium dark cyberpunk game cover illustration for an indie roguelite called "PHENIX: NULL EDEN".

COMPOSITION: The upper half of the image is dominated by a massive geometric mechanical boss — the MATRIX ANNIHILATOR — a towering black angular machine with glowing crimson red eyes and arcs of electric null-red energy radiating from its body. It looms toward the viewer, filling the sky. In the lower center, a lone cyberpunk warrior stands in a powerful mid-attack combat stance — one strong character (armored cyber warrior with dark aesthetic), lit dramatically from below with neon cyan and metallic gold rim light, weapon active, facing the threat. The lower corners contain shadowed silhouettes of Walker and minor enemies. The background is deep void black (#04060C) with a faint neon cyan hexagonal grid pattern fading toward center — barely visible, atmospheric only. Particles: scattered cyan data shards, floating gold orbs, and red static discharge at ground level.

TYPOGRAPHY EMBEDDED IN IMAGE: At the top third, above the boss, place the title "PHENIX: NULL EDEN" in large, premium angular cyberpunk typography — metallic gold letters with a strong neon cyan outer glow. Below the title in smaller small-caps: "A CYBER-SURVIVAL ROGUELITE" in dim muted cyan. Both lines must be fully legible. No other text in the image.

LIGHTING AND COLOR: Boss: internally lit by crimson red with null-red electric arcs. Hero: strong cyan and gold rim lighting. Background: void dark. Accent particles: cyan, gold, red. Color palette strictly: near-black #04060C background, neon cyan #00f5ff or #2EE6F6, null red #ff003c, metallic gold #FFD700. No pastels, no bright whites dominating, no neon pink, no off-palette colors.

STYLE: High-fidelity premium indie game key art. Digital painting style — NOT pixel art, NOT anime, NOT chibi, NOT cartoon. Cinematic dramatic lighting. Genre reference: Hades, Dead Cells, Returnal. The image should feel like it belongs on a premium paid game storefront.

MOOD: One warrior. One massive unstoppable threat. The world is breaking. The fight is happening anyway.

WHAT TO EXCLUDE: No HUD, no health bars, no UI overlays, no fake gameplay interface, no white female ninja character (Phasewalker), no Chaos Law selection panels, no award badges, no review scores, no screenshot collage look, no overcrowded frame, no anime faces, no overly bright backgrounds.

ASPECT RATIO: 16:9. TARGET RESOLUTION: 1920×1080. Ultra-detailed. Premium game store art quality.
```

---

## 9. EXACT ADAPTATION PROMPTS — STEAM SIZES

### Steam Header Capsule (920×430 px) — derive from master

```
Adapt the PHENIX: NULL EDEN cover art to a wide landscape Steam capsule format (920×430 px, approximately 2:1 ratio).

Center crop the master 1920×1080 image, keeping the hero character and MATRIX ANNIHILATOR boss both visible. The title "PHENIX: NULL EDEN" must remain fully legible — prioritize it in the upper portion of the crop. Remove the subtitle line "A CYBER-SURVIVAL ROGUELITE" if it becomes too small to read at this size — the title alone is sufficient. Boss glow and hero lighting should frame the title naturally. Maintain the same color palette and atmosphere. No added UI, no additional text.
```

### Steam Library Capsule (600×900 px) — vertical rework

```
Create a vertical portrait format (600×900 px, 2:3 ratio) version of the PHENIX: NULL EDEN cover art for Steam library display.

VERTICAL COMPOSITION — stack from top to bottom:
Row 1 (top 20%): Title "PHENIX: NULL EDEN" in large bold cyber font — gold with cyan glow. Must be the first thing seen.
Row 2 (next 35%): MATRIX ANNIHILATOR boss — upper body visible, looming downward toward the center, crimson eyes, null-red arcs.
Row 3 (center 30%): Hero character — full body, combat stance, looking up toward the boss, cyan and gold rim light.
Row 4 (bottom 15%): Enemy silhouettes and particle ground effects.

Background: same void black with faint cyan grid. Same color palette. No subtitle text — title only at this size. The image should work at 300×450 px thumbnail size: title and boss eyes must read clearly even that small.

Style: same premium dark cyberpunk — not anime, not chibi, not pixel art.
```

### Steam Library Hero (3840×1240 px)

```
Ultra-wide adaptation of the PHENIX: NULL EDEN cover art for Steam Library Hero banner (3840×1240 px, approximately 3:1 ratio).

The composition should be expanded horizontally from the 1920×1080 master. The safe center zone (approximately 860×380 px centered) must contain the most important elements — hero, boss presence, title. The outer edges can bleed into atmospheric darkness and particle effects. Do not duplicate the hero or boss — use the extended canvas for environmental atmosphere: neon grid lines extending outward, particles trailing, the ambient darkness of NULL EDEN. The title should sit in the upper-center within the safe zone. The hero and boss remain in the center. Edges fade to deep black.
```

---

## 10. MARIA'S PRE-APPROVAL REVIEW CHECKLIST

Before approving any generated cover image, check each item:

**Composition**
- [ ] Title "PHENIX: NULL EDEN" is fully readable at 300 px wide (shrink and check)
- [ ] Hero character is clearly identifiable (not buried by particles or boss)
- [ ] Boss feels massive and threatening (not small or cute)
- [ ] Background is dark — does not compete with the title or hero

**Content**
- [ ] No UI, HUD, or health bars visible
- [ ] No Phasewalker character (white/silver female ninja with katana)
- [ ] No COMING SOON overlays or panels
- [ ] No inactive Chaos Laws shown as active
- [ ] No screenshot-collage look

**Style**
- [ ] Feels like a premium paid indie game — not a free mobile title
- [ ] Color palette matches the game: dark, cyan, gold, null red
- [ ] Typography is angular and cyberpunk — not handwritten, not serif, not thin
- [ ] Particle effects add depth without becoming visual noise

**Technical**
- [ ] Image is 1920×1080 or larger (or AI-native equivalent)
- [ ] No visible watermarks (if using Midjourney etc., upscale before using)
- [ ] No faces that look AI-uncanny at close zoom on the hero
- [ ] Saved as PNG (not JPEG artifacts visible at close zoom)

**Gut check**
- [ ] Does this look like a game worth 5–10€?
- [ ] Would you click on this in a store grid?
- [ ] Does it feel like PHENIX: NULL EDEN — not a generic cyberpunk game?

---

## REFERENCE SCREENSHOTS — BEST 5 FOR COVER PRODUCTION

These are the strongest references to keep open while generating or directing the cover:

| Rank | File | Why |
|------|------|-----|
| 1 | `screenshot_06_boss_MATRIX_ANNIHILATOR_INBOUND.png` | **Best single reference.** Shows the boss at true scale, the projectile storm, the dramatic lighting, and exactly how big the threat feels. Use this to guide the boss element scale and lighting direction. |
| 2 | `screenshot_01_main_menu.png` | **Color palette and atmosphere reference.** The neon cyan grid, the void-black background, the gold PHENIX title — this is the exact visual identity that must carry into the cover. |
| 3 | `screenshot_08_chaos_combat.png` | **Atmosphere and intensity reference.** Shows what Chaos Mode looks like — the dark field, dense threats, the character surrounded. Informs the energy/threat density of the cover. |
| 4 | `screenshot_09_chaos_law_overlay.png` | **UI aesthetic reference (color only).** Shows the cyber overlay style, the cyan panels, the premium UI feel. Use for typography and color reference only — not for content. |
| 5 | `screenshot_02_character_select.png` | **Character proportions reference.** Useful if generating specific characters — shows actual in-game character proportions and silhouettes for prompt grounding. |

---

## FINAL RECOMMENDATION: COVER STRATEGY

### Generate 3 variations, not 1

Do not generate one cover and commit to it. Generate 3 in a single batch:

| Variation | Focus | When it wins |
|-----------|-------|-------------|
| A — **Balanced hero-vs-boss** | Hero and boss both prominent, threat/power tension | Best for general stores and itch — most information, most drama |
| B — **Boss-dominant** | Boss fills 60%+ of frame, hero small below | Wins when the boss visual alone is jaw-dropping — most cinematic |
| C — **Hero-dominant** | Hero fills center, boss as looming background presence | Wins when the character design is strong enough to carry the cover alone |

**Recommended starting strategy: Variation A (balanced).** Most roguelite covers that convert well show both the player's agency (hero) and the threat (boss) in the same frame. Hades, Dead Cells, Risk of Rain 2 all use this formula. If Variation A is strong, adapt it. If it feels too busy, shift to B.

### Quick shortlist for generation

- **Midjourney (v6+):** Highest quality for this style. Use `/imagine` with the prompt from Section 8. Add `--ar 16:9 --style raw --q 2` for best results.
- **DALL-E 3:** Strong composition, weaker fine detail. Add "digital painting, detailed, cinematic" to the prompt.
- **Adobe Firefly:** Best for typography-integrated compositions. Good for the title treatment specifically.
- **Stable Diffusion XL + ControlNet:** Best if you want precise character/boss positioning from reference images.

### After generation

1. Pick the best variation
2. Run through the 15-point checklist in Section 10
3. If passing: export 1920×1080 PNG → crop to 630×500 for itch → done
4. If borderline: one targeted iteration on the weak element only (usually: readable title, or boss too small)
5. If failing: switch to Variation B or C before iterating

---

*This brief is complete. Maria's only required action: review, pick hero character (Oni vs Skeleton Warrior), pick cover strategy (A/B/C), and generate.*
