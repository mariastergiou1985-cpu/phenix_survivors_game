# ΦΑΣΗ 4E — XP BASELINE ACCOUNTING (exact ledger)

**Build:** origin/main `d0608ec` · **Ημ/νία:** 2026-07-22 · **Καθεστώς:** deterministic (seeded mulberry32 + virtual clock + cleared store + child-process isolation)

> Εντολή: «Μην οριστικοποιήσεις τα card weights πριν ολοκληρώσεις το baseline XP accounting.
> Η λογιστική πρέπει να είναι exact. Ανεξήγητη απόκλιση = FAIL.»

## 0. Ετυμηγορία με μία πρόταση

Το XP economy **ΔΕΝ χάνει XP** — η ταυτότητα `generated = shardCollected + ground` κλείνει με **unexplained = 0 σε ΚΑΘΕ run** (6/6 ledger + 6/6 regression). Το «χαμηλό level-up rate (7-10 σε 8′)» της Φάσης 4A ήταν **artifact του movement policy** του diag (κινούνταν μόνο `d` → 2-3% collection). Με πραγματικό collection το ίδιο economy δίνει **27-46 level-ups σε 8′**. Το reachability=0 **ΔΕΝ** προκαλείται από XP — παραμένει **και** με σωστό collection (skeleton greedy: L33, target weapon offers **0**, maxWeaponLevel **1**, passives **0**). Άρα η διόρθωση ανήκει στο **card economy (4B)**, όχι στο XP pipeline.

## 1. Το XP pipeline (πηγαίος κώδικας)

- **Drop:** `Enemy._die` (Enemy.js:834) → `xp = isMegaBoss ? 42 : isBoss ? 12 : 1 + floor(timeAlive/150)`. Κανονικός εχθρός: **1 XP** (0-2.5′), **2** (2.5-5′), **3** (5-7.5′), **4** (7.5-10′). Το `xp` περνά ατόφιο στο `xpShards.spawnBurst`.
- **Shards:** `XpShards.spawnBurst` σπάει το σύνολο σε denominations **χωρίς απώλεια** (guard-loop + τελικό remainder). Landing spot περνά από `_clampPickupPos` → πάντα σε walkable floor.
- **Collection (ΤΟ ΜΟΝΑΔΙΚΟ σημείο grant):** `XpShards.update` → `p.gainXp(s.value)` όταν το shard φτάσει τον παίκτη μέσα στο `pickupRadius` (default 90 × mutation mult).
- **Cap:** `CAP = 520` (desktop) / 220 (mobile). Πάνω από αυτό, τα πιο **μακρινά** shards κάνουν merge ανά ζεύγη **διατηρώντας ακριβώς** την αξία (`a.value += b.value`). Κανένα shard δεν λήγει/δεν σβήνει με τον χρόνο.
- **Level curve:** `_xpForLevel(L) = round(8 + 5L + 1.05·L²)`. Αθροιστικά για να **φτάσεις** level: **L5=113, L8=342, L10=595, L12=948, L15=1701**.
- **xpMult:** σε καθαρό natural Endless = **1** (κανένα collectible/meta/chaos ενεργό με cleared store). Επιβεβαιώθηκε σε 12/12 runs.
- **Δεύτερο κανάλι (ξεχωριστό, explicitly-explained):** direct grants εκτός shards — vault/data-core/event rewards (Game.js 9062, 9159, 27206…29498). Παρακολουθούνται χωριστά· ΔΕΝ μπαίνουν στην ταυτότητα των shards.

## 2. Exact ledger — 8-min deterministic runs (`/tmp/xp_ledger.mjs`)

| char | seed | mode | kills | generated | shardCollected | ground | **unexplained** | direct | plvl | level-ups | sec/lvl | ceiling* |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| skeleton | 12345 | still | 9708 | 20379 | 606 | 19773 | **0** | 501 | 12 | 11 | 43.6 | 37 |
| skeleton | 12345 | run | 8095 | 18639 | 423 | 18216 | **0** | 205 | 10 | 9 | 53.3 | 35 |
| skeleton | 12345 | **greedy** | 10481 | 22262 | 19455 | 2807 | **0** | 205 | **36** | **35** | 13.7 | 38 |
| oni | 777 | greedy | 19546 | 42053 | 37797 | 4256 | **0** | 205 | 45 | 44 | 10.9 | 47 |
| taekwondo (fast) | 2024 | greedy | 19020 | 43101 | 41906 | 1195 | **0** | 214 | 47 | 46 | 10.4 | 47 |
| dimis (slow) | 555 | greedy | 12376 | 26158 | 9862 | 16296 | **0** | 316 | 28 | 27 | 17.8 | 40 |

*ceiling = το level που θα έφτανε ο παίκτης αν συλλεγόταν το 100% του generated.

**Ταυτότητα:** σε ΟΛΕΣ τις γραμμές `generated − shardCollected − ground = 0`. Καμία ανεξήγητη απόκλιση → **δεν υπάρχει FAIL**.

**XP conservation regression** (`tools/qa/xp_conservation_regression.mjs`, 3 seeds × 2 chars @ 6′): **6 PASS · 0 FAIL**, byte-identical determinism, xpMult=1, Σgenerated 146983 / Σcollected 109631 (**74.6% banked** με greedy), Σground 37352, unexplained=0 παντού.

## 3. Το collection είναι ο ΜΟΝΟΣ μοχλός στο level-up rate

Ίδιος char, ίδιο seed (12345), ίδιο economy — αλλάζει ΜΟΝΟ η κίνηση:

- **still** (ακίνητος): collected 606 / 20379 = **3%** → **11** level-ups. Τα όπλα σκοτώνουν από απόσταση, τα shards πέφτουν έξω από το magnet radius, ο ακίνητος παίκτης δεν τα φτάνει ποτέ.
- **run** (`d` μόνο — το policy του Φάση-4A diag): collected 423 / 18639 = **2.3%** → **9** level-ups. **Αυτό εξηγεί το «7-10 σε 8′».**
- **greedy** (collector): collected 19455 / 22262 = **87%** → **35** level-ups.

**Slow-char deficit (πραγματικό εύρημα):** dimis (baseSpeed 189, ο πιο αργός) ακόμη και με collector μαζεύει μόνο **38%** — 16296 XP μένουν στο έδαφος. Οι αργοί χαρακτήρες έχουν υπαρκτό XP-collection deficit (σχετίζεται με το magnet radius vs move speed). ΔΕΝ είναι όμως η αιτία του reachability=0.

## 4. Εξάλειψη υποψηφίων αιτιών (η λίστα της εντολής)

| # | Υποψήφια αιτία | Ετυμηγορία | Απόδειξη |
|---|---|---|---|
| 1 | Λίγο XP/εχθρό | Συμβάλλει, **όχι** bottleneck | 1 XP early, αλλά generated χρηματοδοτεί L37-47 |
| 2 | Χαμηλό kill rate | **ΟΧΙ** | 8k-19k kills/8′ (god-mode ceiling) |
| 3 | Pickup cap απώλεια | **ΟΧΙ** | peak 543-756 vs CAP 520· merges διατηρούν αξία· unexplained=0 |
| 4 | XP loss | **ΟΧΙ (0)** | ταυτότητα exact σε 12/12 runs |
| 5 | XP loss στο level-up | **ΟΧΙ** | `gainXp` κρατά remainder (`xp -= xpToNext`) |
| 6 | Off-walkable drops | **ΟΧΙ** | `_clampPickupPos` + walkable clamp· unexplained=0 |
| 7 | Magnet/collection failure | **ΝΑΙ — κυρίαρχο στο RATE** | still 3% / run 2% / greedy 74-97%· slow char 38% |
| 8 | Πολύ απότομη curve | **ΟΧΙ** | χρηματοδοτεί L36 στα 19455 XP |
| 9 | Mode scaling | **ΟΧΙ** | xpMult=1 σε 12/12 runs |

## 5. Το reachability=0 είναι card-economy defect (ανεξάρτητο του collection)

Με το collection artifact **διορθωμένο** (greedy, `/tmp/diag_economy.mjs`):

- **skeleton greedy → L33, 18 level-ups:** target weapon offers **0**, target passive offers **0**, `maxAnyBeWeaponLevel` **1** (κανένα BE όπλο δεν πέρασε το L1), `bePassives` **0** σε όλα τα samples, `beNone` **10/18** (το BE slot δεν άναψε στα μισά level-ups), 0 evolutions.
- **oni greedy → L41, 22 level-ups:** target weapon offers 1 (stuck L1), `maxAnyBeWeaponLevel` **3**, `bePassives` **0**, `beNone` 9/22, 0 evolutions.

Τεκμηριωμένα υπο-αίτια (για το 4B patch):
1. **BE slot dilution:** `if (this._offers > 2 && Math.random() > 0.45) return false;` → BE card ~44% μετά το 2ο offer (beNone ~50%).
2. **Acquisition-over-mastery weighting:** `wt = (w ? 2 : 3) * (owner===char ? 3 : 1)` — unowned (3) > owned non-maxed (2) → pool πλημμυρίζει με νέα L1 όπλα, τίποτα δεν φτάνει L5.
3. **Passives ~ποτέ:** gating πίσω από owned+leveled weapon· αφού τα όπλα δεν ανεβαίνουν, `bePassives=0` → catalyst L3 αδύνατο.
4. Ένα BE slot / level-up μοιρασμένο σε 6+ owned/unowned + passives → το συγκεκριμένο recipe pair (weapon L5 + passive L3) πρακτικά απίθανο.

## 6. Συμπέρασμα → gate για 4B

- XP accounting: **PASS** (exact, no leak, xpMult=1). Commit (b) «XP loss/consolidation fix» = **ΚΕΝΟ** (δεν υπάρχει loss να διορθωθεί).
- Το low level-up rate = collection/movement (harness artifact + πραγματικό slow-char deficit), **όχι** economy.
- Το reachability=0 = **card economy** — επιβεβαιωμένο ανεξάρτητα, με καθαρά before-metrics (greedy collector).
- **Προχωρώ στο 4B** (μικρό evidence-based economy patch) με αυτά τα before-metrics ως baseline.

**Before-metrics (greedy, 8′) που θα συγκριθούν μετά το 4B:** target-weapon offers, target-passive offers, first weapon L5, first passive L3, first eligibility, first evolution, maxAnyBeWeaponLevel, beNone ratio, νέα όπλα αποκτηθέντα, player level @2/4/6/8′.
