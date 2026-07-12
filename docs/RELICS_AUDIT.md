# PHENIX: NULL EDEN — Relics Audit & Reference (#79)

_Audit date: 11/07/2026 — all 19 relics verified WIRED (each has an `isRelicUnlocked(...)` gameplay hook) and each shows its effect as an in-game tooltip (`cr-card-fx` on the relic card in the Relics overlay)._

Economy: **25 Protocol Fragments + 250 Grids (credits)** per relic (`RELIC_FRAGMENT_COST` / `RELIC_GRID_COST`). Source: `js/game/MetaProgress.js` → `RELIC_DEFS`.

## Universal
| Relic | Effect | Wired |
|---|---|---|
| Eden Core Fragment | Every boss kill this run grants +15 bonus XP. | ✅ (×2 hooks) |
| Null Battery | Q and E ability cooldowns recharge 8% faster. | ✅ |
| Broken Halo | Once per run, death is refused: revive at 25% HP + brief invuln. | ✅ |
| Blacknet Coupon | First level-up screen each run grants 1 extra reroll. | ✅ |

## Character
| Relic | Character | Effect | Wired |
|---|---|---|---|
| Null Riff Capacitor | Eddie | Dash note clouds last 3.2s tick 12; Solo Red Thunder +10% dmg. | ✅ |
| Oni Blood Circuit | Oni | Ultimate marks nearby enemies 5s: +15% damage taken. | ✅ |
| Dimi's Cyber-Relic | Dimi | +2 gauntlet projectile damage & +5% armor plating. | ✅ |
| Crescent Soul Bead | Taekwondo | Every 7th Spirit Kick: +2 pierce + shockwave. | ✅ |
| Null Venom Chamber | Euclid | On hit taken, release a poison cloud (DoT). | ✅ |
| Mirror Kill Protocol | Assassin | Expiring clone releases a shadow slash; 3+ hits refund 20 mana. | ✅ |

## Boss (require the boss kill)
| Relic | Req | Effect | Wired |
|---|---|---|---|
| Serpent Ember Coil | cyberSerpent | Dash leaves 1.5s ember trail (burn). | ✅ |
| Dragon Cryo Heart | cyberDragon | Every 30s next hit calls a cryo shard. | ✅ |
| Overlord's Prism Array | titan_overlord | Orbiting drones fire piercing plasma beams. | ✅ |
| Leviathan's Nanite Core | titan_leviathan | Kills release toxic nanites (spreading DoT). | ✅ |
| Emperor's Singularity Edge | titan_emperor | Periodic mini black hole pulls enemies in. | ✅ |
| Tyrant's Anti-Matter Battery | titan_tyrant | Below 30% HP: anti-matter carpet-bomb barrage. | ✅ |

## Arena (NULL BREACH ARENA)
| Relic | Req | Effect | Wired |
|---|---|---|---|
| Breach Crown | null_breach_cleared | Clear arena without rescue: +0.5 Pulse Damage rest of run. | ✅ |
| Second Signal Debt | arena_rescue_used | On EDEN CORE rescue: 6s protective shield on extraction. | ✅ |
| Elite Signal Core | arena_elite_3 | Arena elite kills pay +30 bonus score. | ✅ |

## Verdict
19/19 relics implemented, gated, and tooltip-documented in-game. No dead relics. Newly-relevant this session: **Dimi's Cyber-Relic** now stacks on top of Dimi's fresh loadout (gauntlet shockwave + Ironframe armor card). No code changes required for this audit — reference doc only.
