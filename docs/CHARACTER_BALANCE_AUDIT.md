# PHENIX: NULL EDEN — Character Balance Audit (Phase 12)

Βάση: `js/entities/Player.js` per-character block. Άξονες: HP, mana, base speed, armor (contact-damage reduction), identity.

| Χαρακτήρας | HP | Mana | Speed | Armor | Ρόλος |
|---|---:|---:|---:|---:|---|
| Skeleton Warrior | 130 | 100 | 207 | 0.15 | Tank / Survival |
| Taekwondo Girl | 90 | 100 | 276 | 0 | Speed / Evasion |
| Brawler Warrior | 125 | 100 | 219 | 0.08 | Tanky hybrid |
| Assassin Clone | 96 | 100 | 258 | 0 | Fast / lethal / fragile |
| Cyber Arm Hero | 100* | 100 | 230* | 0 | Ranged bruiser |
| Euclid Vector | 100* | 100 | 230* | 0 | Toxic zoner |
| Oni Cataclysm | 100* | 100 | 230* | 0 | Caster + tank window |
| Eddie (μετά nerf) | 260 | 120 | 264 | 0.16 | Thunder berserker |

\* default βάση (δεν υπάρχει ειδικό override στο constructor → κρατούν τις βασικές τιμές).

---

## Character: Eddie

Current Strengths: Μεγαλύτερο HP pool (260), καλύτερη mana οικονομία (120), flashy ult (Red Thunder Curtain, guitar solo).

Problem Numbers: Πριν το nerf ήταν ταυτόχρονα ο **πιο tanky (260 HP), ο πιο γρήγορος (290), ο πιο armored (0.20)** ΚΑΙ με το καλύτερο mana. Επικάλυψη πλεονεκτημάτων σε κάθε άξονα → σαφώς overpowered.

Risk Level: Υψηλό (dominant σε κάθε στατιστικό).

Recommended Fix: Κράτα την ταυτότητα «tanky berserker» αλλά κόψε το compounding — να μην είναι ταυτόχρονα και ο πιο γρήγορος και ο πιο armored.

Implemented Fix: Speed **290 → 264** (κάτω από Taekwondo 276), armor **0.20 → 0.16**. HP 260 & mana 120 παραμένουν (όπως ζήτησες).

Expected Result: Παραμένει ο πιο ανθεκτικός bruiser και εντυπωσιακός, αλλά πρέπει να κινείται πιο προσεκτικά — δεν κερδίζει πια «τζάμπα» και στην κινητικότητα.

Follow-up (προτεινόμενο, όχι ακόμα υλοποιημένο): αν παραμένει OP στο playtest, μείωση ult uptime / tick-rate και συχνότητας dash-warp — deep ability tuning, ξεχωριστό pass.

---

## Character: Skeleton Warrior
Current Strengths: Υψηλό HP (130) + armor 0.15 → κορυφαία επιβίωση.
Problem Numbers: Χαμηλή ταχύτητα (207) — σωστό trade-off, κανένα πρόβλημα.
Risk Level: Χαμηλό. Recommended/Implemented Fix: καμία αλλαγή. Expected: ισορροπημένος tank.

## Character: Taekwondo Girl
Current Strengths: Πιο γρήγορη (276) + pickup radius 100.
Problem Numbers: Χαμηλό HP (90), 0 armor → glass. Ισορροπημένο. Risk: Χαμηλό. Fix: καμία.

## Character: Brawler Warrior
Current Strengths: 125 HP, armor 0.08, μέτρια ταχύτητα (219). Ισορροπημένος hybrid. Risk: Χαμηλό. Fix: καμία.

## Character: Assassin Clone
Current Strengths: 258 ταχύτητα, lethal burst. Problem: 96 HP, 0 armor. Fragile-by-design. Risk: Χαμηλό. Fix: καμία.

## Character: Cyber Arm Hero
Current Strengths: Ranged pressure. Numbers: βάση 100 HP / 230 speed. Risk: Χαμηλό. Fix: καμία (βάση OK).

## Character: Euclid Vector Venom
Current Strengths: Toxic area denial. Numbers: βάση. Risk: Χαμηλό. Fix: καμία.

## Character: Oni Cataclysm
Current Strengths: Caster + Protocol-0 tank window (`_tankTimer`, 50% DR). Numbers: βάση. Risk: Μεσαίο (tank window δυνατό αλλά χρονικά περιορισμένο). Fix: καμία τώρα — παρακολούθηση.

---

### Σύνοψη
Μόνο ο Eddie χρειαζόταν αριθμητική διόρθωση. Οι υπόλοιποι είναι εντός εύρους με ξεκάθαρα trade-offs (speed↔HP↔armor). Το nerf του Eddie είναι μετρημένο ώστε να μη χαλάσει η εμπειρία «δυνατού» χαρακτήρα.
