// ═══════════════════════════════════════════════════════════════════════════════
// HORDE REBUILD Φάση 3 — HostileProjectileDirector (spec §10-§11)
// ΕΝΑ κεντρικό budget για ΟΛΑ τα εχθρικά projectiles. Καμία enemy class δεν
// αποφασίζει πλέον μόνη της πόσα projectiles υπάρχουν.
// Token system: κάθε ranged/elite/boss επίθεση ζητά tokens ΠΡΙΝ ρίξει.
// Χωρίς token: η επίθεση ΑΚΥΡΩΝΕΤΑΙ (όχι queue, όχι αποθηκευμένο burst) και ο
// enemy γυρνά στο chase. Tokens επιστρέφουν όταν το projectile καταστραφεί /
// βγει εκτός bounds / λήξει / μπλοκαριστεί.
// ═══════════════════════════════════════════════════════════════════════════════

const IS_MOBILE = (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0)
  || (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

// §10 — τα caps του spec, κατά λέξη. Τα επιμέρους δεν αθροίζονται πάνω από το total.
const CAPS = IS_MOBILE
  ? { ranged: 6,  elite: 5, boss: 10, total: 14, bossRushTotal: 18 }
  : { ranged: 12, elite: 8, boss: 18, total: 24, bossRushTotal: 30 };

export class HostileProjectileDirector {
  constructor() {
    this.counts = { ranged: 0, elite: 0, boss: 0 };
  }

  _total() { return this.counts.ranged + this.counts.elite + this.counts.boss; }

  _totalCap(game) {
    // §29 Boss Rush: αυξημένο κοινό budget ΜΕΤΑΞΥ ΟΛΩΝ των bosses (30/18).
    // §29 Chaos: το cap αυξάνεται ΕΛΑΧΙΣΤΑ (+4), ΟΧΙ ανάλογα με τους enemies.
    if (game?._bossRush) return CAPS.bossRushTotal;
    if (game?._chaosMode) return CAPS.total + 4;
    return CAPS.total;
  }

  /** Ζήτα n tokens κατηγορίας cls ('ranged'|'elite'|'boss'). true = ρίξε, false = ΑΚΥΡΩΣΕ. */
  requestTokens(cls, n, game) {
    if (!(cls in this.counts)) cls = 'ranged';
    if (this.counts[cls] + n > CAPS[cls]) return false;
    if (this._total() + n > this._totalCap(game)) return false;
    this.counts[cls] += n;
    return true;
  }

  /** Επιστροφή token (καταστροφή/OOB/λήξη/block). */
  release(cls, n = 1) {
    if (!(cls in this.counts)) cls = 'ranged';
    this.counts[cls] = Math.max(0, this.counts[cls] - n);
  }

  reset() { this.counts.ranged = 0; this.counts.elite = 0; this.counts.boss = 0; }

  /** Για HUD/QA/reports. */
  snapshot(game) {
    return { ...this.counts, total: this._total(), cap: this._totalCap(game || null) };
  }
}
