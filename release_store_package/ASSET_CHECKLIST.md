# PHENIX: NULL EDEN — Asset Checklist
## Status: DRAFT — verify current platform specs before final production

---

## itch.io ASSETS

### Required

| Asset              | Dimensions         | Format     | Status   | Notes |
|--------------------|--------------------|------------|----------|-------|
| Cover Image        | 630×500px (min)    | PNG/JPG    | ⬜ TODO  | 315:250 ratio. Appears as thumbnail/listing image. Dark cyber aesthetic. Title prominent. |
| Embed Image        | 640×360px          | PNG/JPG    | ⬜ TODO  | Background image behind the "Run game" button on your page. |
| Screenshots        | Any (1920×1080 rec)| PNG/JPG    | ⬜ TODO  | 8–12 screenshots. See SCREENSHOT_SHOTLIST.md. Note: if you upload screenshots, the cover image shifts to a secondary position. |
| Gameplay Trailer   | MP4 / YouTube link | Video      | ⬜ TODO  | Embed YouTube or upload directly. See TRAILER_SCRIPT.md. |

### Optional but Recommended

| Asset              | Dimensions         | Format     | Status   | Notes |
|--------------------|--------------------|------------|----------|-------|
| Page Banner        | 960×200px (approx) | PNG        | ⬜ TODO  | Full-width header image at top of page. Dark cyber neon aesthetic. |
| Page Background    | Tileable or large  | PNG/JPG    | ⬜ TODO  | Background behind the entire page. Dark grid pattern works well. Can be set to fixed/scroll. |
| Animated GIF       | Under 5MB          | GIF        | ⬜ TODO  | Optional short loop of gameplay for inline embed. Chaos Mode moment ideal. |

---

## itch.io PAGE SETTINGS (non-image)

| Setting            | Value              | Status   |
|--------------------|--------------------|----------|
| Page title         | PHENIX: NULL EDEN  | ⬜ SET   |
| Kind               | HTML5 / Browser    | ⬜ SET   |
| Pricing            | Paid (5.99€ or 9.99€) | ⬜ MARIA APPROVAL REQUIRED |
| Visibility         | Draft until approved | ⬜ SET  |
| Tagline            | From ITCH_PAGE_COPY.md | ⬜ SET |
| Description        | From ITCH_PAGE_COPY.md | ⬜ SET |
| Genre              | Action / Roguelike | ⬜ SET   |
| Tags               | See TAGS_AND_METADATA.md | ⬜ SET |
| Community          | Comments enabled   | ⬜ DECIDE |
| Custom CSS         | Dark cyber theme   | ⬜ OPTIONAL |

---

## Steam ASSETS
### ⚠️ VERIFY ALL DIMENSIONS AGAIN IN STEAMWORKS BEFORE UPLOAD — specs may update

### Capsule / Store Page Images

| Asset                  | Dimensions         | Format     | Status   | Notes |
|------------------------|--------------------|------------|----------|-------|
| Header Capsule         | **920×430px**      | PNG/JPG    | ⬜ TODO  | VERIFY AGAIN IN STEAMWORKS BEFORE UPLOAD. Appears at top of store page, recommended sections. Dark background, title readable. |
| Small Capsule          | **462×174px**      | PNG/JPG    | ⬜ TODO  | VERIFY AGAIN IN STEAMWORKS BEFORE UPLOAD. Auto-generates 120×45 and 184×69. Logo must be readable at smallest size. |
| Main Capsule           | **920×430px**      | PNG/JPG    | ⬜ TODO  | VERIFY AGAIN IN STEAMWORKS BEFORE UPLOAD. Same size as Header Capsule. Used in Steam store carousel. |
| Screenshots (min 5)    | **1920×1080 min**  | PNG/JPG    | ⬜ TODO  | Gameplay only. No marketing text or logos overlaid. See SCREENSHOT_SHOTLIST.md. |
| Trailer / Video        | MP4, H.264         | Video      | ⬜ TODO  | Required for strong visibility. See TRAILER_SCRIPT.md. |

### Library Assets (Steam client — shown in user's library)

| Asset                  | Dimensions         | Format     | Status   | Notes |
|------------------------|--------------------|------------|----------|-------|
| Library Capsule        | **600×900px**      | PNG/JPG    | ⬜ TODO  | VERIFY AGAIN IN STEAMWORKS BEFORE UPLOAD. Portrait format. Game cover art. Very visible in library. |
| Library Hero           | **3840×1240px**    | PNG        | ⬜ TODO  | VERIFY AGAIN IN STEAMWORKS BEFORE UPLOAD. Wide banner. Safe area = 860×380px centre. Artwork should fill full canvas. |
| Library Logo           | Variable (PNG, transparent) | PNG | ⬜ TODO | VERIFY AGAIN IN STEAMWORKS BEFORE UPLOAD. Game name/logo as transparent PNG for overlay on library art. |

### Store Page Additional Assets

| Asset                  | Dimensions         | Format     | Status   | Notes |
|------------------------|--------------------|------------|----------|-------|
| Page Background        | Optional           | JPG        | ⬜ TODO  | Ambient background behind the store page. |
| Icon                   | **32×32px**        | ICO/PNG    | ⬜ TODO  | Appears in taskbar / download references. |
| Community Icon         | **184×184px**      | PNG        | ⬜ TODO  | VERIFY AGAIN IN STEAMWORKS BEFORE UPLOAD. |
| Broadcast Thumbnail    | **1280×720px**     | PNG/JPG    | ⬜ TODO  | VERIFY AGAIN IN STEAMWORKS BEFORE UPLOAD. Optional but recommended. |

---

## DESIGN DIRECTION FOR ALL ASSETS

**Consistent visual identity across all assets:**

- Dark background (#04060C or similar near-black)
- Neon magenta accent (#FF2D95) — primary
- Cyber cyan accent (#2EE6F6) — secondary
- Gold (#FFD700) — used for rank/achievement moments
- White/light grey text — always high-contrast readable
- Game title "PHENIX: NULL EDEN" should be prominently legible in all capsule sizes
- No busy backgrounds that compete with the title text
- No review stars / award badges on any capsule art (Steam rules)
- No marketing text overlaid on screenshots (Steam rules)

**Recommended primary art direction for capsules:**
- Dark grid / corrupted network background
- One or two character silhouettes in neon glow
- PHENIX: NULL EDEN title in clean, bold typography
- Subtle particle/glitch effects

---

## PRODUCTION PRIORITY ORDER

1. itch.io Cover Image (630×500) — needed before any page goes live
2. 5–8 Screenshots (1920×1080) — needed for both platforms
3. Gameplay Trailer (45–60s) — highest impact on conversion
4. Steam Header Capsule (920×430) — needed for Steam store page
5. Steam Library Capsule (600×900) — very visible in user libraries
6. Steam Library Hero (3840×1240) — cinematic, high-effort
7. Steam Small Capsule (462×174) — derived from Header
8. itch.io Page Banner + Background — polish layer
9. Steam Library Logo — polish layer
10. Animated GIF (itch) — optional

---

## WHAT MARIA NEEDS TO SUPPLY OR APPROVE

- Final choice of primary character art for capsules
- Font preference for the PHENIX: NULL EDEN logo treatment in assets
- Whether to use in-game screenshot crops or hand-painted key art
- Approval of pricing tier before any paid listing goes live
- Final visual sign-off before any asset is uploaded to a live page
