# Phase 17 — Chaos Master QA Checklist

Legend: ✅ verified · 🧩 code-verified (logic/guards in place) · ▶ playtest-pending (needs a full in-game run)

## Boot / shell
- ✅ Game boots, no black screen (live GitHub Pages, cache-bust reload)
- ✅ Main menu loads
- ✅ No console errors on load (only Chrome-extension noise, not game errors)
- ✅ Character select overlay loads

## Chaos systems
- 🧩 Chaos enemies appear ONLY in Chaos (CHAOS_POOL gated by ctx.chaos in EnemySpawner)
- 🧩 Chaos Mega Titans spawn in Chaos, one-at-a-time, radius 90 (much larger than player)
- 🧩 Titan reward relics unlock on kill (recordBossKill flags) + earnable/buyable
- 🧩 Boss Rush triggers 2× per Chaos run (schedule 120s/480s), 180s timeline, arena ring + timer
- 🧩 Laser Lockdown / Double Ring / Enrage Grid hazards telegraphed + bounded, cleaned on completion
- 🧩 Nexus buff stars TACTICAL in Chaos (no flat-HP heal) — HASTE/XP/mana/credits
- ▶ Full 180s Boss Rush flow end-to-end (survive → cleared)

## Progression / caches
- 🧩 Null Caches now guaranteed to schedule when a secret log/uniform is locked (was 45% + undiscoverable)
- 🧩 Null Cache on-spawn cue + wider sense radius + brighter marker
- 🧩 Secret-log/uniform unlock persists (unlockRandomSecretSkin → unlock() → _save)

## Cards / weapons / VFX
- 🧩 Pattern VFX (26 manifest patterns) cut transparent + placed per-character + rendered in-game (bounded, cap 6)
- 🧩 Weapon Fusion guide present (docs/WEAPON_FUSION_TACTICAL_CARDS_GUIDE.md)
- ▶ Each weapon/evolution not microscopic (visual pass in a run)

## Balance / feel
- 🧩 Eddie nerf applied (speed 290→264, armor 0.20→0.16; HP/mana retained)
- 🧩 Movement signatures ×8 (per-character velocity trail)
- 🧩 Audio pitch-jitter + enemy-shot cooldown (anti-monotony / anti-spam)

## Banners / UI
- 🧩 Locked Vault banner: opacity 0.4, top-screen, max 1/10min (~6/hr), no stacking
- 🧩 System-event banners: 3/hour, top-screen, reduced opacity (prior pass)

## Stability / performance
- 🧩 Stage-complete anti-freeze watchdog (auto-recovers after 7s if pause sticks)
- 🧩 Defensive global caps: enemies ≤340 (bosses preserved), enemyBullets ≤600
- 🧩 floatingTexts ≤90, pattern VFX ≤6, one Titan at a time
- ▶ Stage 4 / 6 / Final full clears without freeze (playtest)
- ▶ Mobile performance in heavy Chaos bullet-hell (device test)

## Known playtest-pending (▶) items
Τα ▶ χρειάζονται πλήρες in-game run που δεν μπορεί να αυτοματοποιηθεί εδώ. Ο κώδικας/guards είναι στη θέση τους· συστήνεται ένα πέρασμα Campaign (Stage 4/6/Final) + ένα Chaos run ως το πρώτο Boss Rush.
