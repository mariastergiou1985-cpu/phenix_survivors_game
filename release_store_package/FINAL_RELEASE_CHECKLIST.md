# PHENIX: NULL EDEN — Final Release Checklist
## Status: LIVING DOCUMENT — update as items complete

---

## BEFORE PUBLIC LAUNCH

### Code / Build

- [ ] Live URL loads without black screen — `https://mariastergiou1985-cpu.github.io/phenix_survivors_game/?v=20260630600000`
- [ ] No game console errors (Chrome DevTools → Console → zero game errors)
- [ ] All JS files return HTTP 200 (no 404s on required assets)
- [ ] Chaos music (Golden Override Protocol) loads correctly on Chaos activation
- [ ] No request to Winter_of_the_Blade (old broken audio path — confirmed fixed)
- [ ] Phasewalker shows COMING SOON and cannot be selected via any input
- [ ] Chaos Laws (Serpent / Dragon / Broken Signal) show COMING SOON and cannot be selected
- [ ] Controller full-flow pass — menu, char select, gameplay, Chaos Law overlay, results, retry ✅ DONE
- [ ] Mobile touch full-flow pass — landscape, joystick, buttons, canvas fit ✅ DONE
- [ ] Old save compatibility — no crash on load without chaosRanks field ✅ VERIFIED
- [ ] Chaos Survival Rank badge renders on Chaos death (BRONZE / SILVER / GOLD / PLATINUM)
- [ ] Act 1-only death does NOT show Chaos rank
- [ ] Assassin Clone HP is 96 ✅ VERIFIED
- [ ] Cache-bust is current and consistent across main.js + index.html

### Store Page — itch.io

- [ ] itch.io account logged in and accessible
- [ ] Page title: PHENIX: NULL EDEN
- [ ] Tagline set (choose from ITCH_PAGE_COPY.md)
- [ ] Short description entered
- [ ] Full description entered (sections from ITCH_PAGE_COPY.md)
- [ ] Feature bullets added
- [ ] Controls section added
- [ ] Cover image uploaded (630×500px min)
- [ ] Embed image uploaded (640×360px)
- [ ] Page banner uploaded (optional but recommended)
- [ ] At least 5 screenshots uploaded (see SCREENSHOT_SHOTLIST.md)
- [ ] Gameplay trailer embedded or uploaded
- [ ] Tags set (see TAGS_AND_METADATA.md)
- [ ] Price set — Maria approval required
- [ ] Visibility set to DRAFT / Private
- [ ] "Run in browser" embed tested — game launches inside itch page
- [ ] Dev note added (personalised by Maria)
- [ ] Content warning added (flashing neon visuals)
- [ ] Maria final visual review of draft page
- [ ] **Maria gives explicit written PUBLISH approval**
- [ ] Visibility changed to Public / Paid
- [ ] itch.io launch link confirmed and working

### Store Page — Steam

- [ ] Steam partner account active (Steamworks access confirmed)
- [ ] $100 direct publishing fee paid (if not done — Maria must authorise)
- [ ] App created in Steamworks
- [ ] Short description entered
- [ ] Long description / About This Game entered (see STEAM_PAGE_COPY.md)
- [ ] Key features entered
- [ ] Genre tags set
- [ ] Controller support marked: Full
- [ ] Languages: English
- [ ] Header Capsule uploaded (920×430px) — VERIFY DIMENSIONS IN STEAMWORKS
- [ ] Small Capsule uploaded (462×174px) — VERIFY DIMENSIONS IN STEAMWORKS
- [ ] Library Capsule uploaded (600×900px) — VERIFY DIMENSIONS IN STEAMWORKS
- [ ] Library Hero uploaded (3840×1240px) — VERIFY DIMENSIONS IN STEAMWORKS
- [ ] At least 5 gameplay-only screenshots uploaded (1920×1080 min)
- [ ] Trailer uploaded
- [ ] Content survey completed in Steamworks
- [ ] Pricing set in all regions — Maria approval required
- [ ] Steam Deck compatibility: leave as "Unknown" unless physically tested
- [ ] Build uploaded to Steam via SteamPipe (if distributing via Steam, not just browser link)
- [ ] Coming Soon page reviewed and approved by Maria
- [ ] **Maria gives explicit written PUBLISH/RELEASE approval**
- [ ] Store page goes live

---

## AFTER LAUNCH

### Day 1–3

- [ ] Monitor itch.io comments (check for crash reports)
- [ ] Monitor Steam discussion board if live
- [ ] Check browser console on live build (no new errors)
- [ ] Confirm payment processing works on itch.io (test purchase if possible)
- [ ] Respond to any launch comments within 24 hours

### First Week

- [ ] Collect player feedback — note bugs separately from feature requests
- [ ] Do NOT panic-patch balance based on one or two complaints
- [ ] Hotfix ONLY if: game crashes, black screen, cannot progress, controller broken
- [ ] Non-blocking bugs: log for first update patch, do not hotfix unless severe
- [ ] Share launch on any relevant social channels Maria has

### First Update (post-launch)

- [ ] Reproduce any reported bugs before fixing
- [ ] Bundle fixes into a single update rather than daily deploys
- [ ] Update cache-bust when JS files change
- [ ] Test locally before pushing to GitHub Pages
- [ ] Update itch.io devlog with patch notes
- [ ] Update Steam patch notes in Steamworks
- [ ] Plan for first content update (Chaos Laws, Phasewalker prep)

---

## WHAT MARIA MUST PERSONALLY APPROVE BEFORE PUBLISHING

1. Final price on itch.io
2. Final price on Steam (all regional prices)
3. itch.io page draft — final visual review
4. Steam Coming Soon page — final review
5. Launch timing / date
6. Any public social announcement
7. Any pricing promotion / launch discount duration
8. Steam direct publishing fee payment ($100 USD — one-time, non-refundable)

---

## CONTACT / SUPPORT EMAIL FOR STORE PAGES

Use: **mariastergiou1985@gmail.com** (or a dedicated support address if preferred)

---

## LIVE BUILD REFERENCE

| Item               | Value |
|--------------------|-------|
| Commit             | 56bb75a |
| Cache-bust         | v=20260630600000 |
| Live URL           | https://mariastergiou1985-cpu.github.io/phenix_survivors_game/?v=20260630600000 |
| Release decision   | SHIP ✅ |
| Controller pass    | ✅ |
| Mobile pass        | ✅ |
| Blockers           | None |
