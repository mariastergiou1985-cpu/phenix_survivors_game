# PHENIX: NULL EDEN — MASTER PHASE PLAN

_All of Maria's strict commands, organized into ordered, independently-verifiable phases._
_Workflow per phase: implement → careful code review → syntax + brace-balance + no-truncation → push → in-game screenshot verify (no black screen, art big/animated, no console errors) → next phase. No questions between phases. Full detailed report ONLY at the very end._

## PHASE 0 — Base push (READY NOW)
Push already-verified work: Phasewalker restore + EMP Jammer (big) 2nd tactical + Phase Overload Matrix synergy; Dimi added to Weapon Synergies (Resonance Plasma Gauntlets). → Weapon Synergies roster now 10/10.

## PHASE 1 — DIMI FULL INTEGRATION (Strict §2–7)
Base weapons ×2 (Cyber-Gauntlets Injection, Holographic Energy Knuckles), 4 cyber elements (Neon Blaze, Data Torrent, Plasma Shockwave, Tectonic Nano-Shield), fusion (Binary Overdrive Aura), 4 extra weapons (Tactical Drone Swarm, Monomolecular Cyber-Wire, Orbital Laser Beacon Gun, Nanite Nano-Swarm Cloud), 2 evolutions (Prototype Cyber-Berserker Exoskeleton, Zenith Singularity AI Matrix), 4 tactical cards (System Reboot, EMP Jammer, Overclock, Firewall Matrix), 2 synergy weapons (Resonance Plasma Blades, Linked AI Companion Rifle), relic (Dimi Cyber-Relic), Ultimate (Cyber-Angel Summoning) — real gameplay + BIG art. May split 1a/1b/1c.

## PHASE 2 — MEGA BOSS REAL WEAPONS
Wire the 4 existing unique weapon assets into the 4 Mega Boss attacks (Overlord→Prism Array laser, Leviathan→Nanite Core toxic, Emperor→Singularity Edge void sword, Tyrant→Anti-Matter Battery missiles). Remove generic circles; big, animated, real payoff.

## PHASE 3 — CORES RENAME (Strict §10)
Player-facing CREDITS → CORES everywhere. Do NOT rename internal vars / PF without evidence.

## PHASE 4 — LIGHTNING BOX-ARTIFACT FIX
Remove square/rectangle sprite-box behind lightning; render only the bolt (trimmed bounds / additive fix), preserve brightness + branching.

## PHASE 5 — ALL-CHARACTER MOVEMENT ANIMATION (Strict §11–13)
Per-character movement identity (lean/bob/squash/trail/afterimage) for all 10. No static sliding. 2D-safe.

## PHASE 6 — BOSS RUSH (Strict §14)
Premium announcement + sound cue, player containment (no escape via walk/dash/knockback/warp), 3D-feel layered arena.

## PHASE 7 — CHAOS ENEMY STATS + AGGRESSION (Strict §15–16)
Validate HP/armor/damage/hitbox per category (standard/fast/ranged/elite/mini/boss/mega). Mega bosses big + real HP/armor. Encirclement pressure (core already live) — finish per-role.

## PHASE 8 — WEAPON/ELEMENT/EVOLUTION ANIMATED MOTION + EXPLOSION VFX
Every combat asset animated by identity (not all spinning). Distinct explosion identities (plasma/magma/missile/electric/ice/toxic/void/kinetic/boss). Object pooling + caps.

## PHASE 9 — COMPLETE AUDIO DESIGN + MIXING
Distinct sound identities per weapon/element family (charge/launch/travel/hit/explosion). Categories, cooldowns, concurrency caps, pitch/volume variation, priority, no spam.

## PHASE 10 — HEALTH PICKUP AUDIT (Strict §18)
Measure ~50min distribution across Act1/Endless/Chaos; cap, spread, no center-flood, no out-of-bounds. (Low-HP mercy already added.)

## PHASE 11 — SKILL TREE REWORK (Strict §19)
Remove generic stat duplication; add tactical permissions / rerolls / info / capstones. Refund removed nodes; save-migration safe.

## PHASE 12 — PLAYER PROGRESSION LEVEL REWARDS
Level-based permanent reward track (cadence 1/5/10/25), non-duplicating, retroactive idempotent migration, menu UI + history. Doc: PLAYER_PROGRESSION_REWARD_TRACK.md.

## PHASE 13 — FINAL FULL AUDIT + STRICT REPORT (Strict §20–21)
Runtime tests for every system; consolidated final report (all audit sections) + errors found.

---
### Absolute rules (every phase)
Only Maria's existing art (alpha/wiring/sizing/animation only — never generate/replace/damage/crop). Art must be BIG + animated + readable in real gameplay, never "flies". No false "complete": a feature is done only when it works in a real run, verified by screenshot. Game.js/main.js edits via Python + brace-balance + `git show HEAD:<file>|wc -l` + `node --check`. Targeted GHD staging only. Correct cache-bust chain each push. No black screen, ever.
