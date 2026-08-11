// ════════════════════════════════════════════════════════════════════════════════
// CHARACTER FUSION ARMORY — runtime engine (Batch D/E, 2026-08-01).
// Per-run instance (κατασκευάζεται στο Game.reset() δίπλα στο buildEngine — νέο
// run = πλήρες wipe, τίποτα δεν επιβιώνει death/restart/menu).
// ΚΑΝΟΝΕΣ:
//  • ENDLESS/CHAOS ONLY — κάθε είσοδος περνά από fusionModeOk (5ο layer προστασίας).
//  • Damage ΜΟΝΟ μέσω BuildEngineRuntime._dealDamage (boss caps, DamageLog, hooks)
//    + ρητό branch για τα singleton mini-bosses (plain objects χωρίς takeHit).
//  • Κάθε executor = phase machine: manifest → charge → deploy/travel → impact →
//    secondary → aftermath → cooldown. Audio hook σε κάθε φάση (playFusionCue).
//  • Persistent damage = tick-based (ΠΟΤΕ per render frame). Projectiles/fields/
//    summons: finite συντεταγμένες, bounded lifetime, hard caps από def.mech.caps.
//  • Το fusion ΑΝΤΙΚΑΘΙΣΤΑ τα def.replaces components (w._fusionSuppressed) — κανένα
//    duplicate attack· τα υπόλοιπα components συνεχίζουν κανονικά.
//  • Tiers (meta.getFusionTier) ζωντανά στα stats· Chaos enhancement bounded από
//    def.chaos. Draw: world-space (καλείται μέσα στο camera block του Game.draw).
// ════════════════════════════════════════════════════════════════════════════════
import { FUSION_DEFS, FUSION_CARD_ORDER, FUSION_ART_READY, FUSION_MAX_TIER,
         fusionModeOk, fusionRunOk, fusionRecipeReady, CHAR_DISPLAY_NAMES }
  from './FusionCatalog.js?v=20260902070000';
import { FUSION_TAGS, WEAPON_DEFS } from './BuildEngine.js?v=20260908350000';

// Tag registration: το _dealDamage βλέπει fusion tags για DamageLog/RUNTIME_HOOKS.
for (const [fid, d] of Object.entries(FUSION_DEFS)) FUSION_TAGS[fid] = d.tags;

export const FUSION_EXECUTORS = {};

const SINGLETON_BOSS_KEYS = ['titanBoss', 'annihilatorBoss', 'bloodfangBoss',
                             'cyberSerpentBoss', 'cyberDragonBoss', 'doubleDemonsBoss'];
const FX_CAP = 60;

// ── μικρο-helpers ────────────────────────────────────────────────────────────────
const A = (v, i) => (Array.isArray(v) ? v[Math.max(0, Math.min(i, v.length - 1))] : v);
// ── TARGETING PASS 2026-08-09: όρια στροφής για τα fusions που ΚΡΑΤΑΝΕ homing.
// Ήταν όλα «τέλειο κλείδωμα»: ξαναϋπολόγιζαν κατεύθυνση κατευθείαν στον στόχο κάθε frame,
// χωρίς αδράνεια — αδύνατο να αποφευχθούν. Τώρα στρίβουν με πεπερασμένο ρυθμό (rad/s).
const DRONE_TURN  = 3.2;    // scrapstorm scrap-drone
const NEEDLE_TURN = 5.0;    // phantom needle (γρήγορη, αλλά όχι απόλυτη)
const CHIP_TURN   = 4.2;    // event horizon chip-disc
const dist2 = (x1, y1, x2, y2) => { const dx = x2 - x1, dy = y2 - y1; return dx * dx + dy * dy; };

export class FusionEngine {
  constructor(game) {
    this.game = game;
    this.active = new Map();      // fusionId -> state object (ένα ανά fusion, once per run)
    this.fx = [];                 // transient world-space fx (bounded FX_CAP)
    this._imgs = new Map();       // fusionId -> Image (lazy, _failed flag σε πραγματικό fail)
    this._t = 0;
    this._acquiredOrder = [];     // για το report/QA
    this._pending = [];           // TARGETING PASS: telegraphed strikes σε ΑΝΑΜΟΝΗ (bounded)
    this._lastAim = 0;            // τελευταία έγκυρη γωνία σκόπευσης του παίκτη
  }

  // ── mode / eligibility (in-run layers) ─────────────────────────────────────────
  modeOk() { const g = this.game; return fusionModeOk(g) && !g.gameOver && !g.victory; }
  // Tick/draw gate: ό,τι έχει ΗΔΗ αποκτηθεί συνεχίζει να τρέχει μέσα σε Boss Rush.
  runOk()  { const g = this.game; return fusionRunOk(g)  && !g.gameOver && !g.victory; }
  tierOf(fid) { return this.game.meta?.getFusionTier?.(fid) || 0; }
  ti(fid) { return Math.max(0, Math.min(FUSION_MAX_TIER, this.tierOf(fid)) - 1); }
  chaos() { return !!this.game._chaosMode; }

  eligibleFusions() {
    const g = this.game, rt = g.buildEngine;
    if (!this.modeOk() || !rt) return [];
    const out = [];
    for (const fid of FUSION_CARD_ORDER) {
      const d = FUSION_DEFS[fid];
      if (!FUSION_ART_READY.has(fid)) continue;                    // ποτέ χωρίς πραγματικό asset
      if (d.char !== g.selectedCharacter) continue;                // σωστός χαρακτήρας
      if (this.tierOf(fid) < 1) continue;                          // αγορασμένη κάρτα
      if (this.active.has(fid)) continue;                          // once per run
      if (!fusionRecipeReady(d, rt, WEAPON_DEFS)) continue;        // 3/3 weapons στα levels
      out.push(fid);
    }
    return out;
  }

  // Κάρτα level-up: guaranteed ΟΤΑΝ υπάρχει έτοιμο fusion — αλλά τα έτοιμα BE
  // evolutions προηγούνται (δικό τους guaranteed slot, καθιερωμένη ροή).
  injectCard(choices) {
    const g = this.game, rt = g.buildEngine;
    if (!choices || !choices.length || !rt) return false;
    if (rt._evolutionReady && rt._evolutionReady()) return false;  // evolution priority
    const ready = this.eligibleFusions();
    if (!ready.length) return false;
    const fid = ready[0];
    const d = FUSION_DEFS[fid];
    const self = this;
    const card = {
      key: 'fusion_' + fid,
      name: d.name,
      description: d.mechanicText + '  [CHARACTER FUSION — ' + (this.chaos() ? 'CHAOS' : 'ENDLESS') + ']',
      iconColor: d.palette.glow, icon: '⚛', rarity: 'rare', maxLevel: 9, synergy: true, char: null,
      iconImg: this.img(fid),
      apply() { self.acquire(fid); }, canApply() { return true; },
    };
    choices[choices.length - 1] = card;
    return true;
  }

  // ── acquisition (μία φορά ανά run, με όλα τα gates ξανά) ────────────────────────
  acquire(fid) {
    const g = this.game, rt = g.buildEngine;
    const d = FUSION_DEFS[fid];
    if (!d || !rt) return false;
    if (!this.modeOk()) return false;                              // runtime validation
    if (d.char !== g.selectedCharacter) return false;
    if (this.tierOf(fid) < 1) return false;
    if (this.active.has(fid)) return false;                        // ποτέ δεύτερη φορά
    if (!fusionRecipeReady(d, rt, WEAPON_DEFS)) return false;
    // αντικατάσταση component attacks — κανένα duplicate
    for (const wid of (d.replaces || [])) {
      const w = rt.weapons.get(wid);
      if (w) w._fusionSuppressed = true;
    }
    const st = { id: fid, phase: 'manifest', t: 0, cd: 0, cycle: 0, objects: {}, showcaseT: 2.2 };
    this.active.set(fid, st);
    this._acquiredOrder.push({ fid, timeAlive: Number(g.timeAlive || 0) });
    try { FUSION_EXECUTORS[fid]?.start?.(this, st); } catch (_) {}
    // premium ανακοίνωση + juice + manifest cue
    g.triggerAnnouncement?.('⚛ CHARACTER FUSION — ' + d.name + ' ⚛', d.palette.glow, { priority: 1 });
    g._triggerHitStop?.(0.4);
    g.screenShake?.trigger?.(12, 0.5);
    this.cue(fid, 'manifest');
    return true;
  }

  // ── damage chokepoint ───────────────────────────────────────────────────────────
  dealDamage(fid, e, raw, { crit = false } = {}) {
    const rt = this.game.buildEngine, d = FUSION_DEFS[fid];
    if (!e || !d || !Number.isFinite(raw) || raw <= 0) return false;
    if (typeof e.takeHit === 'function') {
      return rt ? rt._dealDamage(fid, e, raw, d.mech.bossMultiplier, crit) : false;
    }
    if (typeof e.hp === 'number') {                                // singleton mini-bosses
      const dmg = this.game._capBossDamage
        ? this.game._capBossDamage(e, raw * d.mech.bossMultiplier)
        : raw * d.mech.bossMultiplier;
      e.hp -= dmg;
      if (e.hitFlash !== undefined) e.hitFlash = 0.08;
      try { rt?.log?.hit?.(fid, dmg, { crit, kill: e.hp <= 0 }); } catch (_) {}
      return true;
    }
    return false;
  }

  // ── targets / geometry ─────────────────────────────────────────────────────────
  targets() {
    const g = this.game;
    const out = [];
    if (Array.isArray(g.enemies)) for (const e of g.enemies) if (e && e.hp > 0 && e.pos) out.push(e);
    for (const k of SINGLETON_BOSS_KEYS) {
      const b = g[k];
      if (b && typeof b.hp === 'number' && b.hp > 0 && b.pos) out.push(b);
    }
    return out;
  }
  near(x, y, r) {
    const rr = r * r, out = [];
    for (const e of this.targets()) if (dist2(x, y, e.pos.x, e.pos.y) <= rr) out.push(e);
    return out;
  }
  isBoss(e) { return !!(e.isMegaBoss || (e.isBoss && e.isBoss()) || typeof e.takeHit !== 'function'); }
  // κέντρο πυκνότερου cluster (δείγμα έως 40 στόχων, γείτονες σε R)
  densest(R = 180, fallbackAngle = 0) {
    const g = this.game, p = g.player;
    const ts = this.targets();
    if (!ts.length) {
      return { x: p.pos.x + Math.cos(fallbackAngle) * 300, y: p.pos.y + Math.sin(fallbackAngle) * 300, n: 0 };
    }
    const RR = R * R;
    let best = ts[0], bestN = -1;
    const step = Math.max(1, Math.floor(ts.length / 40));
    for (let i = 0; i < ts.length; i += step) {
      const a = ts[i];
      let n = 0;
      for (let j = 0; j < ts.length; j += step) {
        if (dist2(a.pos.x, a.pos.y, ts[j].pos.x, ts[j].pos.y) <= RR) n++;
      }
      if (n > bestN) { bestN = n; best = a; }
    }
    return { x: best.pos.x, y: best.pos.y, n: bestN, e: best };
  }
  nearestTo(x, y, exclude) {
    let best = null, bd = Infinity;
    for (const e of this.targets()) {
      if (exclude && exclude.has(e)) continue;
      const dd = dist2(x, y, e.pos.x, e.pos.y);
      if (dd < bd) { bd = dd; best = e; }
    }
    return best;
  }
  // ══ TARGETING PASS (2026-08-09) ═══════════════════════════════════════════════
  // Πριν: 19/20 fusions διάβαζαν θέσεις εχθρών για να αποφασίσουν ΠΟΥ χτυπάνε, και
  // σχεδόν όλα έριχναν τη ζημιά στο ΙΔΙΟ frame με τη σκόπευση — τέλειο auto-lock που
  // δεν γινόταν να αποφευχθεί. Τα τρία εργαλεία παρακάτω αντικαθιστούν αυτό το μοτίβο.

  // ΣΚΟΠΕΥΕΙ Ο ΠΑΙΚΤΗΣ, όχι το όπλο. Δεξί stick -> κατεύθυνση κίνησης -> τελευταία
  // γνωστή -> facing. ΚΑΜΙΑ ανάγνωση θέσης εχθρού. Bosses και απλοί εχθροί: ίδιο
  // logic, γιατί κανένας από τους δύο δεν συμμετέχει στην απόφαση.
  aimAngle() {
    const g = this.game, p = g.player;
    if (!p || !p.pos) return this._lastAim || 0;
    const s = g.gamepadAimDir;
    if (s && Number.isFinite(s.x) && Number.isFinite(s.y) && (s.x * s.x + s.y * s.y) > 0.09) {
      this._lastAim = Math.atan2(s.y, s.x);
      return this._lastAim;
    }
    const v = p.vel;
    if (v && (v.x * v.x + v.y * v.y) > 400) {                      // ~20 px/s νεκρή ζώνη
      this._lastAim = Math.atan2(v.y, v.x);
      return this._lastAim;
    }
    if (Number.isFinite(this._lastAim) && this._lastAim !== 0) return this._lastAim;
    return (p._facing || 1) > 0 ? 0 : Math.PI;
  }
  // Σημείο εδάφους μπροστά στον παίκτη: ΤΟΠΟΣ, όχι σώμα. Κλειδώνει μόλις επιστραφεί.
  aimPoint(range = 300) {
    const p = this.game.player, a = this.aimAngle();
    return { x: p.pos.x + Math.cos(a) * range, y: p.pos.y + Math.sin(a) * range, a, aimed: true };
  }
  // Ορατή προειδοποίηση σε ΚΛΕΙΔΩΜΕΝΟ σημείο για `delay` δευτερόλεπτα πριν σκάσει.
  telegraph(x, y, r, delay, color) {
    this.addFx({ kind: 'tele', x, y, r: Math.max(8, r), t: 0, dur: Math.max(0.08, delay),
                 color: color || '#ffcc44' });
  }
  // Telegraphed χτύπημα. Η θέση κλειδώνει ΤΩΡΑ, η ζημιά τρέχει ΜΕΤΑ το delay — και
  // ξαναρωτά τους στόχους εκείνη τη στιγμή, από το κλειδωμένο σημείο. Ο εχθρός που
  // κουνήθηκε στο ενδιάμεσο ΞΕΦΕΥΓΕΙ. Αυτό είναι όλο το νόημα αυτού του pass.
  strike(x, y, r, delay, color, fn) {
    if (typeof fn !== 'function') return;
    const d = Math.max(0.08, Number(delay) || 0);
    if (this._pending.length >= 48) { try { fn(); } catch (_) {} return; }   // hard cap, ποτέ σιωπηλή απώλεια
    this._pending.push({ t: 0, delay: d, fn });
    this.telegraph(x, y, r, d, color);
  }

  // ήπιο pull (ποτέ σε bosses/singletons) — bounded ταχύτητα
  pull(e, tx, ty, perS, dt) {
    if (this.isBoss(e) || !e.pos) return;
    const dx = tx - e.pos.x, dy = ty - e.pos.y;
    const dd = Math.hypot(dx, dy) || 1;
    const k = Math.min(perS * dt, dd);
    e.pos.x += (dx / dd) * k;
    e.pos.y += (dy / dd) * k;
  }

  // ── audio / art / fx ────────────────────────────────────────────────────────────
  cue(fid, phase) { try { this.game.audio?.playFusionCue?.(fid, phase); } catch (_) {} }
  img(fid) {
    let im = this._imgs.get(fid);
    if (!im) {
      im = new Image();
      im.onerror = () => { im._failed = true; console.warn('[Fusion] missing art ' + FUSION_DEFS[fid]?.art); };
      im.src = FUSION_DEFS[fid]?.art || '';
      this._imgs.set(fid, im);
    }
    return im;
  }
  artOk(fid) {
    const im = this.img(fid);
    return !!(im && im.complete && im.naturalWidth > 0 && !im._failed);
  }
  drawArt(ctx, fid, x, y, size, rot = 0, alpha = 1) {
    if (!this.artOk(fid)) return false;                            // fallback ΜΟΝΟ σε πραγματικό fail
    // Perf: το 1024px asset προ-κλιμακώνεται ΜΙΑ φορά σε 288px offscreen canvas —
    // το per-frame draw δουλεύει πάνω στο μικρό bitmap (κρίσιμο σε software raster).
    let sc = this._scaled?.get(fid);
    if (!sc) {
      if (!this._scaled) this._scaled = new Map();
      const im = this._imgs.get(fid);
      try {
        sc = document.createElement('canvas');
        const S2 = 288;
        const k0 = S2 / Math.max(im.naturalWidth, im.naturalHeight);
        sc.width = Math.max(1, Math.round(im.naturalWidth * k0));
        sc.height = Math.max(1, Math.round(im.naturalHeight * k0));
        sc.getContext('2d').drawImage(im, 0, 0, sc.width, sc.height);
      } catch (_) { sc = this._imgs.get(fid); }
      this._scaled.set(fid, sc);
    }
    const w = sc.width || sc.naturalWidth, h = sc.height || sc.naturalHeight;
    const k = size / Math.max(w, h);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.globalCompositeOperation = 'screen';
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    ctx.drawImage(sc, -w * k / 2, -h * k / 2, w * k, h * k);
    ctx.restore();
    return true;
  }
  // Cached radial «πέπλο» (σκοτεινό ή φωτεινό): ΠΟΤΕ createRadialGradient ανά frame —
  // pre-render σε offscreen canvas ανά (ακτίνα-κάδο, χρώματα), draw ως bitmap.
  veil(ctx, x, y, r, inner, outer, alpha = 1, lighter = false) {
    if (!this._veils) this._veils = new Map();
    const rb = Math.max(16, Math.round(r / 24) * 24);              // κάδοι 24px → bounded cache
    const key = rb + '|' + inner + '|' + outer + '|' + (lighter ? 1 : 0);
    let cv = this._veils.get(key);
    if (!cv) {
      if (this._veils.size > 48) this._veils.clear();              // hard cap
      try {
        cv = document.createElement('canvas');
        cv.width = cv.height = rb * 2;
        const c2 = cv.getContext('2d');
        const g = c2.createRadialGradient(rb, rb, 0, rb, rb, rb);
        g.addColorStop(0, inner);
        g.addColorStop(1, outer);
        c2.fillStyle = g;
        c2.beginPath(); c2.arc(rb, rb, rb, 0, Math.PI * 2); c2.fill();
      } catch (_) { return; }
      this._veils.set(key, cv);
    }
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    if (lighter) ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(cv, x - r, y - r, r * 2, r * 2);
    ctx.restore();
  }
  addFx(o) { if (this.fx.length < FX_CAP) this.fx.push(o); }
  ring(x, y, r0, r1, dur, color, width = 5) { this.addFx({ kind: 'ring', x, y, r0, r1, t: 0, dur, color, width }); }
  flash(x, y, r, dur, color) { this.addFx({ kind: 'flash', x, y, r, t: 0, dur, color }); }
  beam(x1, y1, x2, y2, dur, color, width = 8) { this.addFx({ kind: 'beam', x1, y1, x2, y2, t: 0, dur, color, width }); }

  // ── main loop ───────────────────────────────────────────────────────────────────
  update(dt) {
    const g = this.game;
    if (!this.runOk() || !g.player || !Number.isFinite(dt) || dt <= 0) return;
    this._t += dt;
    for (const st of this.active.values()) {
      try { FUSION_EXECUTORS[st.id]?.update?.(this, st, dt); }
      catch (e) {
        st._errs = (st._errs || 0) + 1;
        if (st._errs <= 2) console.error('[Fusion] "' + st.id + '" update error', e);
      }
    }
    // TARGETING PASS: telegraphed χτυπήματα ωριμάζουν ΕΔΩ, αφού έχουν τρέξει όλοι οι
    // executors — ώστε ένα strike που μπήκε φέτος το frame να μη σκάσει στο ίδιο frame.
    for (let i = this._pending.length - 1; i >= 0; i--) {
      const s = this._pending[i];
      s.t += dt;
      if (s.t >= s.delay) {
        this._pending.splice(i, 1);
        try { s.fn(); } catch (err) {
          this._strikeErrs = (this._strikeErrs || 0) + 1;
          if (this._strikeErrs <= 2) console.error('[Fusion] telegraphed strike error', err);
        }
      }
    }
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.t += dt;
      if (f.t >= f.dur) this.fx.splice(i, 1);
    }
  }

  draw(ctx) {
    if (!this.runOk()) return;
    for (const st of this.active.values()) {
      try { FUSION_EXECUTORS[st.id]?.draw?.(this, ctx, st); }
      catch (e) {
        st._drawErrs = (st._drawErrs || 0) + 1;
        if (st._drawErrs <= 2) console.error('[Fusion] "' + st.id + '" draw error', e);
      }
    }
    // shared fx layer
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const f of this.fx) {
      const k = f.t / f.dur;
      if (f.kind === 'ring') {
        ctx.globalAlpha = 0.8 * (1 - k);
        ctx.strokeStyle = f.color; ctx.lineWidth = f.width * (1 - k * 0.5);
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r0 + (f.r1 - f.r0) * k, 0, Math.PI * 2); ctx.stroke();
      } else if (f.kind === 'flash') {
        ctx.globalAlpha = 0.7 * (1 - k);
        const gg = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
        gg.addColorStop(0, '#ffffff'); gg.addColorStop(0.4, f.color); gg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gg;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
      } else if (f.kind === 'beam') {
        ctx.globalAlpha = 0.85 * (1 - k);
        ctx.strokeStyle = f.color; ctx.lineWidth = f.width * (1 - k * 0.6);
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke();
      } else if (f.kind === 'tele') {
        // ΠΡΟΕΙΔΟΠΟΙΗΣΗ: σταθερό περίγραμμα + δαχτυλίδι που ΚΛΕΙΝΕΙ προς τα μέσα.
        // Όταν το δαχτυλίδι φτάσει στο κέντρο, σκάει. Διαβάζεται σαν χρόνος, όχι σαν ζημιά.
        ctx.globalAlpha = 0.34 + 0.30 * k;
        ctx.strokeStyle = f.color; ctx.lineWidth = 2;
        ctx.setLineDash([9, 7]);
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.55 + 0.35 * k;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(f.x, f.y, Math.max(3, f.r * (1 - k)), 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 0.85 * k;
        ctx.beginPath(); ctx.arc(f.x, f.y, 3, 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.restore();
    // acquisition showcase: η πραγματική εικόνα του όπλου πάνω από τον παίκτη
    const p = this.game.player;
    for (const st of this.active.values()) {
      if (st.showcaseT > 0) {
        const k = st.showcaseT > 1.7 ? (2.2 - st.showcaseT) / 0.5 : Math.min(1, st.showcaseT / 1.7);
        this.drawArt(ctx, st.id, p.pos.x, p.pos.y - 120 - (2.2 - st.showcaseT) * 30,
                     240 + (2.2 - st.showcaseT) * 40, 0, k);
      }
    }
  }

  // κοινό: ο showcase timer τρέχει σε όλα τα states (καλείται από update των executors)
  tickShowcase(st, dt) { if (st.showcaseT > 0) st.showcaseT -= dt; }
}

// ════════════════════════════════════════════════════════════════════════════════
// EXECUTORS — Batch D (chars 1-5, fusions 01-10)
// ════════════════════════════════════════════════════════════════════════════════

// ── 01 OSSUARY IMPALER: lance lane → gravity rift → bone nova (+T3 pylons) ────────
FUSION_EXECUTORS.fus_ossuary_impaler = {
  start(fe, st) { st.phase = 'cooldown'; st.t = 0; st.cd = 1.2; },  // πρώτη ρίψη σύντομα μετά το manifest
  update(fe, st, dt) {
    fe.tickShowcase(st, dt);
    const d = FUSION_DEFS[st.id], m = d.mech, i = fe.ti(st.id);
    const p = fe.game.player;
    st.t += dt;
    if (st.phase === 'cooldown') {
      st.cd -= dt;
      if (st.cd <= 0) { st.phase = 'charge'; st.t = 0; fe.cue(st.id, 'charge'); }
    } else if (st.phase === 'charge') {
      if (st.t >= m.chargeS) {
        // TARGETING PASS: σκοπεύει ο ΠΑΙΚΤΗΣ. Η γωνία κλειδώνει εδώ και δεν ξανακοιτάζει
        // ποτέ θέσεις εχθρών — ήταν densest(200), τέλειο auto-lock στο πυκνότερο σώμα.
        const ang = fe.aimAngle();
        st.objects.lance = { x: p.pos.x, y: p.pos.y, ang, trav: 0, hit: new Set() };
        st.phase = 'travel'; st.t = 0;
        fe.cue(st.id, 'travel');
      }
    } else if (st.phase === 'travel') {
      const L = st.objects.lance;
      const prev = L.trav;
      L.trav += m.travelSpeed * dt;
      // TARGETING PASS: η ζημιά του διαδρόμου δίνεται ΚΑΘΩΣ περνά η αιχμή, όχι μονομιάς
      // τη στιγμή της σκόπευσης. Ό,τι βγει από τον διάδρομο πριν φτάσει η λόγχη, γλιτώνει.
      const cosA = Math.cos(L.ang), sinA = Math.sin(L.ang);
      for (const e of fe.targets()) {
        if (L.hit.has(e)) continue;
        const dx = e.pos.x - L.x, dy = e.pos.y - L.y;
        const along = dx * cosA + dy * sinA, side = Math.abs(-dx * sinA + dy * cosA);
        if (along > prev && along <= L.trav && side < m.laneWidth + (e.radius || 20)) {
          L.hit.add(e);
          fe.dealDamage(st.id, e, A(m.laneDamage, i));
        }
      }
      if (L.trav >= m.range) {
        st.objects.rift = { x: L.x + Math.cos(L.ang) * m.range, y: L.y + Math.sin(L.ang) * m.range, t: 0, tick: 0 };
        st.phase = 'rift'; st.t = 0;
        fe.cue(st.id, 'impact');
        fe.flash(st.objects.rift.x, st.objects.rift.y, 120, 0.4, d.palette.glow);
      }
    } else if (st.phase === 'rift') {
      const R = st.objects.rift, durS = A(m.rift.durS, i), radius = A(m.rift.radius, i);
      R.t += dt; R.tick += dt;
      for (const e of fe.near(R.x, R.y, radius + 80)) fe.pull(e, R.x, R.y, m.rift.pullPerS, dt);
      if (R.tick >= m.rift.tickS) {
        R.tick = 0;
        for (const e of fe.near(R.x, R.y, radius)) fe.dealDamage(st.id, e, A(m.rift.tickDmg, i));
      }
      if (R.t >= durS) {
        // nova — TELEGRAPHED: το novaR (230/250/270) ξεπερνούσε το σχεδιασμένο rift, οπότε
        // η εξωτερική ζώνη έσκαγε χωρίς καμία ένδειξη. Τώρα προειδοποιεί 0.45s στο κλειδωμένο κέντρο.
        const novaR = A(m.nova.radius, i);
        const nx = R.x, ny = R.y, nDmg = A(m.nova.dmg, i);
        fe.strike(nx, ny, novaR, 0.45, d.palette.core, () => {
          for (const e of fe.near(nx, ny, novaR)) fe.dealDamage(st.id, e, nDmg);
          fe.ring(nx, ny, 30, novaR, 0.5, d.palette.core, 8);
          fe.flash(nx, ny, novaR * 0.7, 0.45, d.palette.glow);
        });
        fe.cue(st.id, 'aftermath');
        // T3: pylons
        if (fe.tierOf(st.id) >= 3) {
          const n = Math.min(m.caps.novaShards, d.t3.pylons + (fe.chaos() ? (d.chaos.extraPylon || 0) : 0));
          st.objects.pylons = [];
          for (let k2 = 0; k2 < n; k2++) {
            const a = (k2 / n) * Math.PI * 2;
            st.objects.pylons.push({ x: R.x + Math.cos(a) * 90, y: R.y + Math.sin(a) * 90, t: 0, fired: false });
          }
        }
        st.phase = 'aftermath'; st.t = 0;
      }
    } else if (st.phase === 'aftermath') {
      const py = st.objects.pylons || [];
      for (const pl of py) {
        pl.t += dt;
        if (!pl.fired && pl.t >= 0.6) {
          pl.fired = true;
          // TARGETING PASS: ο πυλώνας ήταν auto-turret (nearestTo τη στιγμή της βολής). Τώρα
          // ρίχνει ΠΡΟΣ ΤΑ ΕΞΩ από το ρήγμα, σε σταθερή ακτίνα, με 0.28s προειδοποίηση.
          const t3 = FUSION_DEFS[st.id].t3;
          const pa = Math.atan2(pl.y - (st.objects.rift?.y ?? pl.y), pl.x - (st.objects.rift?.x ?? pl.x));
          const reach = Math.min(t3.pylonRange, 260), R2 = 60;
          const gx = pl.x + Math.cos(pa) * reach, gy = pl.y + Math.sin(pa) * reach;
          fe.beam(pl.x, pl.y, gx, gy, 0.28, d.palette.glow, 6);
          fe.strike(gx, gy, R2, 0.28, d.palette.glow, () => {
            for (const e of fe.near(gx, gy, R2)) { fe.dealDamage(st.id, e, t3.pylonVolleyDmg); break; }
          });
        }
      }
      if (st.t >= (py.length ? FUSION_DEFS[st.id].t3.pylonLifeS : 0.5)) {
        st.objects = {};
        st.phase = 'cooldown'; st.t = 0;
        let cdv = A(m.cooldown, i);
        if (fe.chaos()) cdv *= 0.95;
        st.cd = cdv;
        st.cycle++;
      }
    }
  },
  draw(fe, ctx, st) {
    const d = FUSION_DEFS[st.id], m = d.mech, i = fe.ti(st.id);
    const p = fe.game.player;
    if (st.phase === 'charge') {
      const k = Math.min(1, st.t / m.chargeS);
      fe.drawArt(ctx, st.id, p.pos.x, p.pos.y - 110, 150 + k * 70, -Math.PI / 4, 0.5 + k * 0.5);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.6 * k;
      ctx.strokeStyle = d.palette.glow; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.pos.x, p.pos.y - 110, 90 * (1 - k * 0.4), 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    } else if (st.phase === 'travel' && st.objects.lance) {
      const L = st.objects.lance;
      const x = L.x + Math.cos(L.ang) * L.trav, y = L.y + Math.sin(L.ang) * L.trav;
      fe.drawArt(ctx, st.id, x, y, 210, L.ang + Math.PI / 4, 1);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5;
      ctx.strokeStyle = d.palette.glow; ctx.lineWidth = m.laneWidth * 0.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(L.x, L.y); ctx.lineTo(x, y); ctx.stroke();
      ctx.restore();
    } else if (st.phase === 'rift' && st.objects.rift) {
      const R = st.objects.rift, radius = A(m.rift.radius, i);
      const wob = 1 + Math.sin(fe._t * 6) * 0.06;
      fe.veil(ctx, R.x, R.y, radius * 0.5, 'rgba(5,1,16,0.95)', 'rgba(5,1,16,0)');
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = d.palette.glow; ctx.lineWidth = 5; ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.arc(R.x, R.y, radius * 0.62 * wob, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([14, 10]); ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.arc(R.x, R.y, radius * wob, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      fe.drawArt(ctx, st.id, R.x, R.y, 130, fe._t * 1.2, 0.8);
    } else if (st.phase === 'aftermath') {
      for (const pl of (st.objects.pylons || [])) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = d.palette.core; ctx.lineWidth = 6; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(pl.x, pl.y + 18); ctx.lineTo(pl.x, pl.y - 34); ctx.stroke();
        ctx.strokeStyle = d.palette.glow; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(pl.x, pl.y - 40, 8, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
    }
  },
};

// ── 02 BLACK PSALM CHOIR: orbit fortress → charged dive-bombs → chains (+T3 field) ─
FUSION_EXECUTORS.fus_black_psalm_choir = {
  start(fe, st) {
    const d = FUSION_DEFS[st.id], m = d.mech, i = fe.ti(st.id);
    const n = Math.min(m.caps.skulls, A(m.skulls, i));
    st.objects.skulls = [];
    for (let k = 0; k < n; k++) {
      st.objects.skulls.push({ a: (k / n) * Math.PI * 2, charge: 0, mode: 'orbit', tick: 0, x: 0, y: 0, reform: 0, dive: null });
    }
    st.objects.fields = [];
  },
  update(fe, st, dt) {
    fe.tickShowcase(st, dt);
    const d = FUSION_DEFS[st.id], m = d.mech, i = fe.ti(st.id);
    const p = fe.game.player;
    let diving = 0;
    for (const s of st.objects.skulls) if (s.mode === 'dive') diving++;
    for (const s of st.objects.skulls) {
      if (s.mode === 'orbit') {
        s.a += m.orbitSpeed * dt;
        s.x = p.pos.x + Math.cos(s.a) * m.orbitRadius;
        s.y = p.pos.y + Math.sin(s.a) * m.orbitRadius;
        s.tick += dt;
        if (s.tick >= m.pulse.tickS) {
          s.tick = 0;
          const hit = fe.near(s.x, s.y, m.pulse.radius);
          for (const e of hit) fe.dealDamage(st.id, e, A(m.pulse.dmg, i));
          if (hit.length) {
            s.charge = Math.min(m.chargeFull, s.charge + m.chargePerPulse);
            fe.ring(s.x, s.y, 12, m.pulse.radius, 0.35, d.palette.glow, 3);
          }
        }
        if (s.charge >= m.chargeFull && diving < m.caps.simultaneousDives) {
          // TARGETING PASS: το κρανίο βουτάει εκεί που ΔΕΙΧΝΕΙ Ο ΠΑΙΚΤΗΣ — ήταν densest(160),
          // δηλαδή κλείδωνε πάνω στο πυκνότερο σώμα και έσκαγε ακριβώς εκεί.
          const den = fe.aimPoint(260);
          s.mode = 'dive'; s.dive = { tx: den.x, ty: den.y };
          diving++;
          fe.cue(st.id, 'travel');
        }
      } else if (s.mode === 'dive') {
        const dx = s.dive.tx - s.x, dy = s.dive.ty - s.y;
        const dd = Math.hypot(dx, dy) || 1;
        const step = A(m.dive.speed, 0) * dt;
        if (dd <= step + 4) {
          // έκρηξη + chains — TELEGRAPHED: η βουτιά προσγειώνεται και ΜΕΤΑ σκάει (0.22s).
          // Όποιος προλάβει να βγει από την ακτίνα σε αυτό το παράθυρο, γλιτώνει.
          const bx = s.dive.tx, by = s.dive.ty, bR = m.dive.radius, bDmg = A(m.dive.dmg, i);
          const chainsN = Math.min(m.caps.chainsPerDive, A(m.chains.count, i) + (fe.chaos() ? (d.chaos.extraChain || 0) : 0));
          const chDmg = A(m.chains.dmg, i), chRange = m.chains.range;
          fe.cue(st.id, 'impact');
          fe.strike(bx, by, bR, 0.22, d.palette.glow, () => {
            for (const e of fe.near(bx, by, bR)) fe.dealDamage(st.id, e, bDmg);
            fe.flash(bx, by, bR, 0.4, d.palette.glow);
            let chains = chainsN;
            const hitSet = new Set();
            let cx = bx, cy = by;
            while (chains-- > 0) {
              const nxt = fe.nearestTo(cx, cy, hitSet);
              if (!nxt || dist2(cx, cy, nxt.pos.x, nxt.pos.y) > chRange ** 2) break;
              fe.dealDamage(st.id, nxt, chDmg);
              fe.beam(cx, cy, nxt.pos.x, nxt.pos.y, 0.22, d.palette.glow, 4);
              hitSet.add(nxt);
              cx = nxt.pos.x; cy = nxt.pos.y;
            }
          });
          // T3 psalm field
          if (fe.tierOf(st.id) >= 3 && st.objects.fields.length < 3) {
            const f = d.t3.field;
            st.objects.fields.push({ x: s.dive.tx, y: s.dive.ty, t: 0, tick: 0,
              dur: f.durS * (fe.chaos() ? (d.chaos.fieldDurMult || 1) : 1) });
          }
          s.mode = 'reform'; s.charge = 0;
          s.reform = A(m.dive.reformS, i) * (fe.chaos() ? (d.chaos.reformMult || 1) : 1);
        } else {
          s.x += (dx / dd) * step; s.y += (dy / dd) * step;
        }
      } else if (s.mode === 'reform') {
        s.reform -= dt;
        if (s.reform <= 0) {
          s.mode = 'orbit';
          st.cycle++;                                  // πλήρης κύκλος: pulse→charge→dive→reform
          fe.cue(st.id, 'aftermath');
        }
      }
    }
    // παρατηρησιμότητα φάσης (persistent όπλο): orbit ↔ dive
    st.phase = st.objects.skulls.some(s2 => s2.mode === 'dive') ? 'dive'
             : st.objects.skulls.some(s2 => s2.mode === 'reform') ? 'reform' : 'orbit';
    for (let k = st.objects.fields.length - 1; k >= 0; k--) {
      const f = st.objects.fields[k];
      f.t += dt; f.tick += dt;
      const cfg = FUSION_DEFS[st.id].t3.field;
      if (f.tick >= cfg.tickS) {
        f.tick = 0;
        for (const e of fe.near(f.x, f.y, cfg.radius)) {
          fe.dealDamage(st.id, e, cfg.tickDmg);
          if (!fe.isBoss(e) && e.vel) { e.vel.x *= (1 - cfg.slow * 0.5); e.vel.y *= (1 - cfg.slow * 0.5); }
        }
      }
      if (f.t >= f.dur) st.objects.fields.splice(k, 1);
    }
  },
  draw(fe, ctx, st) {
    const d = FUSION_DEFS[st.id], m = d.mech;
    for (const f of st.objects.fields || []) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.4 * (1 - f.t / f.dur);
      ctx.strokeStyle = d.palette.glow; ctx.lineWidth = 3;
      ctx.setLineDash([10, 8]);
      ctx.beginPath(); ctx.arc(f.x, f.y, FUSION_DEFS[st.id].t3.field.radius, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    for (const s of st.objects.skulls || []) {
      if (s.mode === 'reform') continue;
      const k = s.charge / m.chargeFull;
      fe.drawArt(ctx, st.id, s.x, s.y, 62 + k * 22, Math.sin(fe._t * 2 + s.a) * 0.15, s.mode === 'dive' ? 1 : 0.9);
      if (k > 0.05) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5 + 0.4 * k;
        ctx.strokeStyle = d.palette.glow; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(s.x, s.y, 34 + k * 8, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
    }
  },
};

// ── 03 CYCLONE METRONOME: growing travelling cyclone → drag → apex chains (+T3 mirror)
FUSION_EXECUTORS.fus_cyclone_metronome = {
  start(fe, st) { st.phase = 'cooldown'; st.cd = 1.0; st.objects.cyclones = []; st.objects.auras = []; },
  _spawnCyclone(fe, st, ang, dmgMult) {
    const p = fe.game.player;
    st.objects.cyclones.push({ x: p.pos.x, y: p.pos.y, ang, t: 0, tick: 0, dmgMult });
  },
  update(fe, st, dt) {
    fe.tickShowcase(st, dt);
    const d = FUSION_DEFS[st.id], m = d.mech, i = fe.ti(st.id);
    st.t += dt;
    if (st.phase === 'cooldown') {
      st.cd -= dt;
      if (st.cd <= 0 && st.objects.cyclones.length === 0) {
        st.phase = 'charge'; st.t = 0; fe.cue(st.id, 'charge');
      }
    } else if (st.phase === 'charge') {
      if (st.t >= 0.5) {
        // TARGETING PASS: ο κυκλώνας φεύγει προς την κατεύθυνση του ΠΑΙΚΤΗ (ήταν densest(200)).
        // Το σώμα του ήδη ταξιδεύει και χτυπά όσο περνά — δεν χρειάζεται lock.
        const ang = fe.aimAngle();
        this._spawnCyclone(fe, st, ang, 1);
        if (fe.tierOf(st.id) >= 3 && st.objects.cyclones.length < 2) {
          this._spawnCyclone(fe, st, ang + Math.PI, d.t3.mirrorDmgMult);
        }
        st.phase = 'active'; st.t = 0;
        fe.cue(st.id, 'travel');
      }
    } else if (st.phase === 'active') {
      const travelS = A(m.travelS, i);
      const radiusMax = A(m.radiusMax, i) * (fe.chaos() ? (d.chaos.radiusMult || 1) : 1);
      for (let c = st.objects.cyclones.length - 1; c >= 0; c--) {
        const cy = st.objects.cyclones[c];
        cy.t += dt; cy.tick += dt;
        cy.x += Math.cos(cy.ang) * m.travelSpeed * dt;
        cy.y += Math.sin(cy.ang) * m.travelSpeed * dt;
        const r = m.radius0 + (radiusMax - m.radius0) * Math.min(1, cy.t / travelS);
        const dragMult = fe.chaos() ? (d.chaos.dragMult || 1) : 1;
        let dragged = 0;
        for (const e of fe.near(cy.x, cy.y, r)) {
          if (dragged < m.caps.draggedEnemies) { fe.pull(e, cy.x, cy.y, m.dragPerS * dragMult, dt); dragged++; }
        }
        if (cy.tick >= m.wallTickS) {
          cy.tick = 0;
          for (const e of fe.near(cy.x, cy.y, r)) {
            const dd = Math.hypot(e.pos.x - cy.x, e.pos.y - cy.y);
            if (dd > r * 0.45) fe.dealDamage(st.id, e, A(m.wallDmg, i) * cy.dmgMult);
          }
        }
        if (cy.t >= travelS) {
          // apex chains
          let chains = Math.min(m.caps.chains, A(m.apexChains.count, i) + (fe.chaos() ? (d.chaos.extraChain || 0) : 0));
          const hitSet = new Set();
          let cx = cy.x, cyy = cy.y;
          fe.cue(st.id, 'impact');
          fe.flash(cy.x, cy.y, r, 0.4, d.palette.glow);
          while (chains-- > 0) {
            const nxt = fe.nearestTo(cx, cyy, hitSet);
            if (!nxt || dist2(cx, cyy, nxt.pos.x, nxt.pos.y) > m.apexChains.range ** 2) break;
            fe.dealDamage(st.id, nxt, A(m.apexChains.dmg, i) * cy.dmgMult);
            fe.beam(cx, cyy, nxt.pos.x, nxt.pos.y, 0.22, '#ffd47a', 4);
            hitSet.add(nxt); cx = nxt.pos.x; cyy = nxt.pos.y;
          }
          st.objects.auras.push({ x: cy.x, y: cy.y, t: 0, tick: 0, dmgMult: cy.dmgMult });
          st.objects.cyclones.splice(c, 1);
        }
      }
      if (!st.objects.cyclones.length) {
        st.phase = 'aftermath'; st.t = 0;
        fe.cue(st.id, 'aftermath');
      }
    } else if (st.phase === 'aftermath') {
      if (!st.objects.auras.length) {
        st.phase = 'cooldown';
        st.cd = A(m.cooldown, i);
        st.cycle++;
      }
    }
    for (let k = st.objects.auras.length - 1; k >= 0; k--) {
      const au = st.objects.auras[k];
      au.t += dt; au.tick += dt;
      if (au.tick >= m.aura.tickS) {
        au.tick = 0;
        for (const e of fe.near(au.x, au.y, m.aura.radius)) fe.dealDamage(st.id, e, m.aura.tickDmg * au.dmgMult);
      }
      if (au.t >= m.aura.durS) st.objects.auras.splice(k, 1);
    }
  },
  draw(fe, ctx, st) {
    const d = FUSION_DEFS[st.id], m = d.mech, i = fe.ti(st.id);
    const travelS = A(m.travelS, i);
    const radiusMax = A(m.radiusMax, i);
    for (const cy of st.objects.cyclones || []) {
      const r = m.radius0 + (radiusMax - m.radius0) * Math.min(1, cy.t / travelS);
      // στροβιλιζόμενες κορδέλες (3 τόξα σε περιστροφή) + art στην κορυφή
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 3; k++) {
        const a0 = fe._t * 5 + (k / 3) * Math.PI * 2;
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = k % 2 ? d.palette.glow : '#ffd9a1';
        ctx.lineWidth = 8 - k * 2;
        ctx.beginPath(); ctx.arc(cy.x, cy.y, r * (0.55 + k * 0.2), a0, a0 + Math.PI * 1.2); ctx.stroke();
      }
      ctx.restore();
      fe.drawArt(ctx, st.id, cy.x, cy.y - r * 0.4, r * 1.25, 0, 0.85);
    }
    for (const au of st.objects.auras || []) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.4 * (1 - au.t / m.aura.durS);
      ctx.strokeStyle = d.palette.glow; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(au.x, au.y, m.aura.radius, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  },
};

// ── 04 EYE OF THE NULL STORM: stationary compression storm + radial lances (+T3 rifts)
FUSION_EXECUTORS.fus_null_storm_eye = {
  start(fe, st) { st.phase = 'cooldown'; st.cd = 1.4; st.objects.rifts = []; },
  update(fe, st, dt) {
    fe.tickShowcase(st, dt);
    const d = FUSION_DEFS[st.id], m = d.mech, i = fe.ti(st.id);
    st.t += dt;
    if (st.phase === 'cooldown') {
      st.cd -= dt;
      if (st.cd <= 0) { st.phase = 'charge'; st.t = 0; fe.cue(st.id, 'charge'); }
    } else if (st.phase === 'charge') {
      if (st.t >= 0.6) {
        // TARGETING PASS: η καταιγίδα φυτεύεται ΜΠΡΟΣΤΑ ΣΤΟΝ ΠΑΙΚΤΗ, όχι πάνω στο πυκνότερο
        // σώμα (ήταν densest(220) — φύτρωνε ακριβώς πάνω στον εχθρό).
        const den = fe.aimPoint(320);
        st.objects.storm = { x: den.x, y: den.y, t: 0, tick: 0, lanceT: 0, kills: 0 };
        st.phase = 'storm'; st.t = 0;
        fe.cue(st.id, 'travel');
        fe.ring(den.x, den.y, 20, A(m.radius, i), 0.5, d.palette.glow, 6);
      }
    } else if (st.phase === 'storm') {
      const S = st.objects.storm;
      const durS = A(m.durS, i) * (fe.chaos() ? (d.chaos.durMult || 1) : 1);
      const radius = A(m.radius, i);
      const wallR = radius * 0.8;
      S.t += dt; S.tick += dt; S.lanceT += dt;
      const compress = m.compressPerS * (fe.chaos() ? (d.chaos.compressMult || 1) : 1);
      for (const e of fe.near(S.x, S.y, radius + 60)) {
        const dd = Math.hypot(e.pos.x - S.x, e.pos.y - S.y) || 1;
        if (!fe.isBoss(e)) {
          // συμπίεση ΠΑΝΩ στο eyewall: έξω → μέσα, μέσα στο μάτι → έξω
          const toWall = wallR - dd;
          const dirx = (e.pos.x - S.x) / dd, diry = (e.pos.y - S.y) / dd;
          const k = Math.min(Math.abs(toWall), compress * dt) * Math.sign(toWall);
          e.pos.x += dirx * k; e.pos.y += diry * k;
        }
      }
      if (S.tick >= m.wallTickS) {
        S.tick = 0;
        for (const e of fe.near(S.x, S.y, radius)) {
          const dd = Math.hypot(e.pos.x - S.x, e.pos.y - S.y);
          if (Math.abs(dd - wallR) < m.wallWidth) {
            const hpBefore = e.hp;
            fe.dealDamage(st.id, e, A(m.wallDmg, i));
            if (fe.tierOf(st.id) >= 3 && hpBefore > 0 && e.hp <= 0 && st.objects.rifts.length < d.t3.corpseRift.cap) {
              st.objects.rifts.push({ x: e.pos.x, y: e.pos.y, t: 0 });
            }
          }
        }
      }
      const lanceEvery = m.lances.everyS * (fe.chaos() ? (d.chaos.lanceEveryMult || 1) : 1);
      if (S.lanceT >= lanceEvery) {
        S.lanceT = 0;
        const n = Math.min(m.caps.lancesPerBurst, A(m.lances.count, i));
        // TARGETING PASS: οι λόγχες ήταν hitscan σε nearestTo — διάλεγαν σώμα και το χτυπούσαν
        // στο ΙΔΙΟ frame, αδύνατο να αποφευχθούν. Τώρα είναι ΣΤΑΘΕΡΕΣ ΑΚΤΙΝΕΣ σε ίσες γωνίες
        // γύρω από το μάτι, με 0.30s προειδοποίηση: η καταιγίδα χτυπά ΓΥΡΩ ΤΗΣ, δεν σημαδεύει.
        S.spoke = (S.spoke || 0) + 0.37;                            // αργή περιστροφή της ρόδας
        for (let k = 0; k < n; k++) {
          const ang = S.spoke + (k / n) * Math.PI * 2;
          const cosA = Math.cos(ang), sinA = Math.sin(ang);
          const ex = S.x + cosA * m.lances.range, ey = S.y + sinA * m.lances.range;
          fe.beam(S.x, S.y, ex, ey, 0.30, d.palette.glow, 3);        // ΠΡΟΕΙΔΟΠΟΙΗΣΗ πρώτα
          fe.strike(S.x + cosA * m.lances.range * 0.5, S.y + sinA * m.lances.range * 0.5,
                    m.lances.range * 0.5, 0.30, d.palette.core, () => {
            let hits = 0;
            for (const e of fe.targets()) {
              const dx = e.pos.x - S.x, dy = e.pos.y - S.y;
              const along = dx * cosA + dy * sinA, side = Math.abs(-dx * sinA + dy * cosA);
              if (along > 0 && along < m.lances.range && side < 22 + (e.radius || 18)) {
                fe.dealDamage(st.id, e, A(m.lances.dmg, i));
                if (++hits >= m.lances.pierce) break;
              }
            }
            fe.beam(S.x, S.y, ex, ey, 0.28, d.palette.core, 6);
          });
        }
        fe.cue(st.id, 'impact');
      }
      if (S.t >= durS) {
        // TELEGRAPHED: το collapse (240) ξεπερνούσε τον σχεδιασμένο κύκλο σε T1/T2 και έσκαγε
        // στο frame που έληγε ο χρόνος. Τώρα προειδοποιεί 0.40s στο κλειδωμένο κέντρο.
        const sx = S.x, sy = S.y, cR = m.collapse.radius, cDmg = A(m.collapse.dmg, i);
        fe.strike(sx, sy, cR, 0.40, d.palette.glow, () => {
          for (const e of fe.near(sx, sy, cR)) fe.dealDamage(st.id, e, cDmg);
          fe.flash(sx, sy, cR * 0.8, 0.5, d.palette.glow);
        });
        fe.cue(st.id, 'aftermath');
        st.objects.storm = null;
        st.phase = 'cooldown'; st.cd = A(m.cooldown, i); st.cycle++;
      }
    }
    for (let k = st.objects.rifts.length - 1; k >= 0; k--) {
      const r = st.objects.rifts[k];
      r.t += dt;
      if (r.t >= 0.3 && !r.done) {
        r.done = true;
        for (const e of fe.near(r.x, r.y, d.t3.corpseRift.radius)) fe.dealDamage(st.id, e, d.t3.corpseRift.dmg);
        fe.ring(r.x, r.y, 8, d.t3.corpseRift.radius, 0.3, d.palette.glow, 3);
      }
      if (r.t >= 0.6) st.objects.rifts.splice(k, 1);
    }
  },
  draw(fe, ctx, st) {
    const d = FUSION_DEFS[st.id], m = d.mech, i = fe.ti(st.id);
    const S = st.objects.storm;
    if (!S) return;
    const radius = A(m.radius, i), wallR = radius * 0.8;
    fe.veil(ctx, S.x, S.y, wallR * 0.5, 'rgba(1,10,6,0.85)', 'rgba(1,10,6,0)');
    ctx.save();
    // eyewall: 3 περιστρεφόμενα τόξα
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 3; k++) {
      const a0 = fe._t * (3 + k) + k * 2.1;
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = k === 1 ? d.palette.core : d.palette.glow;
      ctx.lineWidth = 10 - k * 2;
      ctx.beginPath(); ctx.arc(S.x, S.y, wallR + k * 10 - 10, a0, a0 + Math.PI * 1.3); ctx.stroke();
    }
    ctx.globalAlpha = 0.4;
    ctx.setLineDash([16, 12]);
    ctx.strokeStyle = d.palette.glow; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(S.x, S.y, radius, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    fe.drawArt(ctx, st.id, S.x, S.y, 170, fe._t * 0.8, 0.75);
  },
};

// ── 05 TECTONIC MAW: faultline star → sinkhole pull → geyser → crust (+T3 second maw)
FUSION_EXECUTORS.fus_tectonic_maw = {
  start(fe, st) { st.phase = 'cooldown'; st.cd = 1.6; st.objects.maws = []; st.objects.crusts = []; },
  _openMaw(fe, st, x, y, dmgMult) {
    const d = FUSION_DEFS[st.id], m = d.mech, i = fe.ti(st.id);
    // crack star: 6 arms — TELEGRAPHED. Ήταν "instant damage" στο ίδιο frame με τη σκόπευση,
    // και το fe.beam ζωγραφιζόταν ΜΕΤΑ τη ζημιά (απόδειξη, όχι προειδοποίηση). Τώρα οι δοκοί
    // ανάβουν πρώτες και το ρήγμα σκίζει 0.38s αργότερα, από ΚΛΕΙΔΩΜΕΝΟ κέντρο.
    for (let k = 0; k < m.caps.crackArms; k++) {
      const a = (k / m.caps.crackArms) * Math.PI * 2;
      const cosA = Math.cos(a), sinA = Math.sin(a);
      fe.beam(x, y, x + cosA * m.crackRange, y + sinA * m.crackRange, 0.45, d.palette.glow, 6);
      fe.strike(x + cosA * m.crackRange * 0.5, y + sinA * m.crackRange * 0.5,
                m.crackRange * 0.5, 0.38, d.palette.glow, () => {
        for (const e of fe.near(x, y, m.crackRange)) {
          const dx = e.pos.x - x, dy = e.pos.y - y;
          const along = dx * cosA + dy * sinA, side = Math.abs(-dx * sinA + dy * cosA);
          if (along > 0 && side < 34 + (e.radius || 18)) fe.dealDamage(st.id, e, A(m.crackDmg, i) * dmgMult);
        }
      });
    }
    st.objects.maws.push({ x, y, t: 0, tick: 0, dmgMult });
    fe.cue(st.id, 'impact');
    fe.game.screenShake?.trigger?.(8, 0.35);
  },
  update(fe, st, dt) {
    fe.tickShowcase(st, dt);
    const d = FUSION_DEFS[st.id], m = d.mech, i = fe.ti(st.id);
    st.t += dt;
    if (st.phase === 'cooldown') {
      st.cd -= dt;
      if (st.cd <= 0) { st.phase = 'charge'; st.t = 0; fe.cue(st.id, 'charge'); }
    } else if (st.phase === 'charge') {
      if (st.t >= 0.5) {
        // TARGETING PASS: το ρήγμα ανοίγει ΜΠΡΟΣΤΑ ΣΤΟΝ ΠΑΙΚΤΗ (ήταν densest(200)).
        const den = fe.aimPoint(300);
        this._openMaw(fe, st, den.x, den.y, 1);
        st.objects.secondQueued = fe.tierOf(st.id) >= 3;
        st.phase = 'active'; st.t = 0;
      }
    } else if (st.phase === 'active') {
      if (st.objects.secondQueued && st.t >= d.t3.secondMaw.delayS) {
        st.objects.secondQueued = false;
        // TARGETING PASS: και το δεύτερο στόμα του T3 — ήταν ΝΕΟ densest ακριβώς εκεί που
        // είχε τρέξει ο κόσμος, δηλαδή τιμωρούσε την αποφυγή. Τώρα ακολουθεί τη σκόπευση.
        const den = fe.aimPoint(300);
        this._openMaw(fe, st, den.x, den.y, d.t3.secondMaw.dmgMult);
      }
      if (!st.objects.maws.length && !st.objects.secondQueued) {
        st.phase = 'cooldown'; st.cd = A(m.cooldown, i); st.cycle++;
        fe.cue(st.id, 'aftermath');
      }
    }
    // maws lifecycle
    const radiusMult = fe.chaos() ? (d.chaos.radiusMult || 1) : 1;
    const pullMult = fe.chaos() ? (d.chaos.pullMult || 1) : 1;
    for (let k = st.objects.maws.length - 1; k >= 0; k--) {
      const M = st.objects.maws[k];
      const sinkDur = A(m.sink.durS, i), sinkR = A(m.sink.radius, i) * radiusMult;
      M.t += dt; M.tick += dt;
      if (M.t < sinkDur) {
        for (const e of fe.near(M.x, M.y, sinkR + 60)) fe.pull(e, M.x, M.y, m.sink.pullPerS * pullMult, dt);
        if (M.tick >= m.sink.tickS) {
          M.tick = 0;
          for (const e of fe.near(M.x, M.y, sinkR)) fe.dealDamage(st.id, e, A(m.sink.tickDmg, i) * M.dmgMult);
        }
      } else {
        // geyser + crust — TELEGRAPHED: ο πίδακας προειδοποιεί 0.35s πριν ξεσπάσει.
        const gR = A(m.geyser.radius, i) * radiusMult;
        const gx = M.x, gy = M.y, gDmg = A(m.geyser.dmg, i) * M.dmgMult;
        fe.strike(gx, gy, gR, 0.35, '#ffd9a1', () => {
          for (const e of fe.near(gx, gy, gR)) fe.dealDamage(st.id, e, gDmg);
          fe.flash(gx, gy, gR, 0.5, d.palette.glow);
          fe.ring(gx, gy, 30, gR + 40, 0.55, '#ffd9a1', 8);
          fe.game.screenShake?.trigger?.(10, 0.4);
        });
        st.objects.crusts.push({ x: M.x, y: M.y, t: 0, tick: 0, dmgMult: M.dmgMult,
          dur: m.crust.durS * (fe.chaos() ? (d.chaos.crustDurMult || 1) : 1) });
        st.objects.maws.splice(k, 1);
      }
    }
    for (let k = st.objects.crusts.length - 1; k >= 0; k--) {
      const C = st.objects.crusts[k];
      C.t += dt; C.tick += dt;
      if (C.tick >= m.crust.tickS) {
        C.tick = 0;
        for (const e of fe.near(C.x, C.y, m.crust.radius)) fe.dealDamage(st.id, e, A(m.crust.tickDmg, i) * C.dmgMult);
      }
      if (C.t >= C.dur) st.objects.crusts.splice(k, 1);
    }
  },
  draw(fe, ctx, st) {
    const d = FUSION_DEFS[st.id], m = d.mech, i = fe.ti(st.id);
    for (const M of st.objects.maws || []) {
      const sinkR = A(m.sink.radius, i);
      const k = Math.min(1, M.t / A(m.sink.durS, i));
      fe.veil(ctx, M.x, M.y, sinkR, 'rgba(20,6,2,0.92)', 'rgba(20,6,2,0)');
      fe.veil(ctx, M.x, M.y, sinkR * 0.6, `rgba(255,106,46,0.4)`, 'rgba(255,106,46,0)', 0.5 + k * 0.4, true);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = d.palette.glow; ctx.lineWidth = 4; ctx.globalAlpha = 0.7;
      ctx.setLineDash([12, 9]);
      ctx.beginPath(); ctx.arc(M.x, M.y, sinkR * (1 - k * 0.35), 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      fe.drawArt(ctx, st.id, M.x, M.y - 40, 190, 0, 0.85);
    }
    for (const C of st.objects.crusts || []) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35 * (1 - C.t / C.dur);
      ctx.strokeStyle = '#ff9d5e'; ctx.lineWidth = 3;
      for (let k = 0; k < 3; k++) {
        ctx.beginPath(); ctx.arc(C.x, C.y, m.crust.radius * (0.5 + k * 0.25), 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }
  },
};

// ── 06 PYROCLAST PAYLOAD: launch → mine corridor → burning threads → chain detonation
FUSION_EXECUTORS.fus_pyroclast_payload = {
  start(fe, st) { st.phase = 'cooldown'; st.cd = 1.8; st.objects.mines = []; st.objects.burns = new Map(); },
  update(fe, st, dt) {
    fe.tickShowcase(st, dt);
    const d = FUSION_DEFS[st.id], m = d.mech, i = fe.ti(st.id);
    const p = fe.game.player;
    st.t += dt;
    if (st.phase === 'cooldown') {
      st.cd -= dt;
      if (st.cd <= 0) { st.phase = 'launch'; st.t = 0; fe.cue(st.id, 'charge'); }
    } else if (st.phase === 'launch') {
      if (st.t >= 0.55) {
        // TARGETING PASS: ο διάδρομος ναρκών στρώνεται προς την κατεύθυνση του ΠΑΙΚΤΗ.
        const ang = fe.aimAngle();
        const n = Math.min(m.caps.mines, A(m.mines.count, i) + (fe.chaos() ? (d.chaos.extraMine || 0) : 0));
        const len = A(m.corridorLen, i);
        st.objects.mines = [];
        for (let k = 0; k < n; k++) {
          const along = 120 + (len - 120) * (k / Math.max(1, n - 1));
          const off = (k % 2 ? 1 : -1) * m.corridorWidth * 0.3;
          st.objects.mines.push({
            x: p.pos.x + Math.cos(ang) * along - Math.sin(ang) * off,
            y: p.pos.y + Math.sin(ang) * along + Math.cos(ang) * off,
            landT: 0.15 + k * 0.09, armed: false, dead: false, idx: k,
          });
        }
        st.objects.threadTick = 0;
        st.phase = 'field'; st.t = 0;
        fe.cue(st.id, 'travel');
      }
    } else if (st.phase === 'field') {
      const mines = st.objects.mines;
      st.objects.threadTick += dt;
      let alive = 0;
      for (const mn of mines) {
        if (mn.dead) continue;
        alive++;
        if (!mn.armed) {
          mn.landT -= dt;
          if (mn.landT <= -m.mines.armS) { mn.armed = true; fe.ring(mn.x, mn.y, 8, 40, 0.3, d.palette.glow, 3); }
          continue;
        }
        // contact detonation
        const near = fe.near(mn.x, mn.y, m.mines.radius * 0.5);
        if (near.length) {
          mn.dead = true;
          for (const e of fe.near(mn.x, mn.y, m.mines.radius)) fe.dealDamage(st.id, e, A(m.mines.contactDmg, i));
          fe.flash(mn.x, mn.y, m.mines.radius, 0.4, d.palette.glow);
          fe.cue(st.id, 'impact');
        }
      }
      // burning threads ανάμεσα σε διαδοχικές ζωντανές νάρκες
      if (st.objects.threadTick >= m.threads.tickS) {
        st.objects.threadTick = 0;
        const live = mines.filter(mn => mn.armed && !mn.dead);
        const thDmg = A(m.threads.tickDmg, i) * (fe.chaos() ? (d.chaos.threadDmgMult || 1) : 1);
        for (let k = 0; k + 1 < live.length && k < 8; k++) {
          const a = live[k], b = live[k + 1];
          for (const e of fe.targets()) {
            // απόσταση σημείου από ευθύγραμμο τμήμα
            const vx = b.x - a.x, vy = b.y - a.y;
            const L2 = vx * vx + vy * vy || 1;
            let tt = ((e.pos.x - a.x) * vx + (e.pos.y - a.y) * vy) / L2;
            tt = Math.max(0, Math.min(1, tt));
            const px2 = a.x + vx * tt, py2 = a.y + vy * tt;
            if (dist2(e.pos.x, e.pos.y, px2, py2) < (26 + (e.radius || 18)) ** 2) {
              fe.dealDamage(st.id, e, thDmg);
              if (st.objects.burns.size < m.caps.burningEnemies) {
                st.objects.burns.set(e, { t: m.threads.burnS, tick: 0 });
              }
            }
          }
        }
      }
      // τέλος πεδίου: sequential detonation
      if (st.t >= 3.2) {
        st.phase = 'detonate'; st.t = 0; st.objects.detIdx = 0; st.objects.detT = 0;
      }
    } else if (st.phase === 'detonate') {
      st.objects.detT += dt;
      const mines = st.objects.mines;
      if (st.objects.detT >= m.wave.detonateGapS) {
        st.objects.detT = 0;
        let mn = null;
        while (st.objects.detIdx < mines.length) {
          const c = mines[st.objects.detIdx++];
          if (!c.dead) { mn = c; break; }
        }
        if (mn) {
          mn.dead = true;
          // TELEGRAPHED: η ακτίνα ζημιάς (120) ήταν πολύ μεγαλύτερη από το σχεδιασμένο sprite
          // και έσκαγε στο tick χωρίς ένδειξη. Τώρα 0.25s προειδοποίηση ανά νάρκη.
          const wDmg = A(m.wave.dmg, i) * (fe.chaos() ? (d.chaos.waveDmgMult || 1) : 1);
          const wx = mn.x, wy = mn.y, wR = m.wave.radius;
          fe.strike(wx, wy, wR, 0.25, d.palette.glow, () => {
            for (const e of fe.near(wx, wy, wR)) fe.dealDamage(st.id, e, wDmg);
            fe.flash(wx, wy, wR, 0.35, d.palette.glow);
          });
          // T3: τελευταία νάρκη → null implosion
          const remaining = mines.some(x => !x.dead);
          if (!remaining && fe.tierOf(st.id) >= 3) {
            const t3 = d.t3.nullImplosion;
            st.objects.implosion = { x: mn.x, y: mn.y, t: 0 };
            for (const e of fe.near(mn.x, mn.y, t3.radius)) fe.dealDamage(st.id, e, t3.dmg);
          }
          fe.cue(st.id, 'impact');
        } else {
          st.phase = 'aftermath'; st.t = 0;
          fe.cue(st.id, 'aftermath');
        }
      }
    } else if (st.phase === 'aftermath') {
      const imp = st.objects.implosion;
      if (imp) {
        imp.t += dt;
        for (const e of fe.near(imp.x, imp.y, d.t3.nullImplosion.radius + 60)) {
          fe.pull(e, imp.x, imp.y, d.t3.nullImplosion.pullPerS, dt);
        }
        if (imp.t >= d.t3.nullImplosion.durS) st.objects.implosion = null;
      }
      if (!imp && st.t >= 0.4) {
        st.objects.mines = [];
        st.phase = 'cooldown'; st.cd = A(m.cooldown, i); st.cycle++;
      }
    }
    // burn dots (bounded map)
    for (const [e, b] of st.objects.burns) {
      if (!e || e.hp <= 0) { st.objects.burns.delete(e); continue; }
      b.t -= dt; b.tick += dt;
      if (b.tick >= 0.5) {
        b.tick = 0;
        fe.dealDamage(st.id, e, A(m.threads.burnDps, i) * 0.5);
      }
      if (b.t <= 0) st.objects.burns.delete(e);
    }
  },
  draw(fe, ctx, st) {
    const d = FUSION_DEFS[st.id], m = d.mech;
    if (st.phase === 'launch') {
      const p = fe.game.player;
      fe.drawArt(ctx, st.id, p.pos.x, p.pos.y - 90 - st.t * 160, 170, -0.5, 1);
    }
    const live = (st.objects.mines || []).filter(mn => mn.armed && !mn.dead);
    // threads
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,207,125,0.75)'; ctx.lineWidth = 3;
    ctx.setLineDash([9, 7]);
    for (let k = 0; k + 1 < live.length; k++) {
      ctx.beginPath(); ctx.moveTo(live[k].x, live[k].y); ctx.lineTo(live[k + 1].x, live[k + 1].y); ctx.stroke();
    }
    ctx.restore();
    for (const mn of st.objects.mines || []) {
      if (mn.dead) continue;
      const pulse = mn.armed ? 1 + Math.sin(fe._t * 8 + mn.idx) * 0.12 : 0.7;
      fe.drawArt(ctx, st.id, mn.x, mn.y, 52 * pulse, mn.idx, mn.armed ? 0.95 : 0.6);
    }
    const imp = st.objects.implosion;
    if (imp) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = '#b48cff'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(imp.x, imp.y, d.t3.nullImplosion.radius * (1 - imp.t / d.t3.nullImplosion.durS), 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  },
};

// ── 07 COMPASS OF RUIN: inscribed circle + sweeping beam hands + ion splits + QED
FUSION_EXECUTORS.fus_compass_of_ruin = {
  start(fe, st) { st.phase = 'cooldown'; st.cd = 1.2; },
  update(fe, st, dt) {
    fe.tickShowcase(st, dt);
    const d = FUSION_DEFS[st.id], m = d.mech, i = fe.ti(st.id);
    const p = fe.game.player;
    st.t += dt;
    if (st.phase === 'cooldown') {
      st.cd -= dt;
      if (st.cd <= 0) { st.phase = 'charge'; st.t = 0; fe.cue(st.id, 'charge'); }
    } else if (st.phase === 'charge') {
      if (st.t >= 0.6) {
        st.objects.c = { x: p.pos.x, y: p.pos.y, t: 0, bTick: 0, hTick: 0, arcT: 0, hand: fe._t };
        st.phase = 'active'; st.t = 0;
        fe.cue(st.id, 'travel');
        fe.ring(p.pos.x, p.pos.y, 20, A(m.radius, i), 0.6, d.palette.glow, 6);
      }
    } else if (st.phase === 'active') {
      const C = st.objects.c;
      const durS = A(m.durS, i) * (fe.chaos() ? (d.chaos.durMult || 1) : 1);
      const radius = A(m.radius, i);
      const sweep = m.hands.sweepRadPerS * (fe.chaos() ? (d.chaos.sweepMult || 1) : 1);
      C.t += dt; C.bTick += dt; C.hTick += dt; C.arcT += dt;
      C.hand += sweep * dt;
      if (C.bTick >= m.boundary.tickS) {
        C.bTick = 0;
        for (const e of fe.near(C.x, C.y, radius + m.boundary.width)) {
          const dd = Math.hypot(e.pos.x - C.x, e.pos.y - C.y);
          if (Math.abs(dd - radius) < m.boundary.width) fe.dealDamage(st.id, e, A(m.boundary.tickDmg, i));
        }
      }
      if (C.hTick >= m.hands.tickS) {
        C.hTick = 0;
        for (let h = 0; h < m.hands.count; h++) {
          const ang = C.hand + h * Math.PI;
          const cosA = Math.cos(ang), sinA = Math.sin(ang);
          for (const e of fe.near(C.x, C.y, radius)) {
            const dx = e.pos.x - C.x, dy = e.pos.y - C.y;
            const along = dx * cosA + dy * sinA, side = Math.abs(-dx * sinA + dy * cosA);
            if (along > 0 && side < m.hands.width + (e.radius || 16)) fe.dealDamage(st.id, e, A(m.hands.dmg, i));
          }
        }
      }
      if (C.arcT >= m.splitArcs.everyS) {
        C.arcT = 0;
        const n = Math.min(m.caps.arcsAlive, A(m.splitArcs.count, i));
        const bx = C.x + Math.cos(C.hand) * radius, by = C.y + Math.sin(C.hand) * radius;
        const hitSet = new Set();
        let cx = bx, cy = by;
        for (let k = 0; k < n; k++) {
          const nxt = fe.nearestTo(cx, cy, hitSet);
          if (!nxt || dist2(cx, cy, nxt.pos.x, nxt.pos.y) > m.splitArcs.range ** 2) break;
          fe.dealDamage(st.id, nxt, A(m.splitArcs.dmg, i));
          fe.beam(cx, cy, nxt.pos.x, nxt.pos.y, 0.22, d.palette.glow, 4);
          hitSet.add(nxt); cx = nxt.pos.x; cy = nxt.pos.y;
        }
      }
      if (C.t >= durS) {
        // Q.E.D.
        // TELEGRAPHED: το qR (240-280) ξεπερνούσε τον σχεδιασμένο κύκλο (230-270) και έσκαγε
        // στο frame που έληγε ο χρόνος. Τώρα 0.40s προειδοποίηση στο κλειδωμένο κέντρο.
        const qR = A(m.qed.radius, i);
        const qDmg = A(m.qed.dmg, i) * (fe.chaos() ? (d.chaos.qedDmgMult || 1) : 1);
        const qx = C.x, qy = C.y;
        fe.strike(qx, qy, qR, 0.40, d.palette.core, () => {
          for (const e of fe.near(qx, qy, qR)) fe.dealDamage(st.id, e, qDmg);
          fe.flash(qx, qy, qR * 0.8, 0.5, d.palette.core);
          fe.ring(qx, qy, 40, qR, 0.55, d.palette.glow, 9);
        });
        fe.cue(st.id, 'impact');
        // T3 scissor: δύο διαμετρικές δέσμες
        if (fe.tierOf(st.id) >= 3) {
          const t3 = d.t3.scissor;
          for (const baseAng of [C.hand, C.hand + Math.PI / 2]) {
            const cosA = Math.cos(baseAng), sinA = Math.sin(baseAng);
            const L = radius * t3.lenMult;
            for (const e of fe.near(C.x, C.y, L)) {
              const dx = e.pos.x - C.x, dy = e.pos.y - C.y;
              const side = Math.abs(-dx * sinA + dy * cosA);
              if (side < t3.width + (e.radius || 16)) fe.dealDamage(st.id, e, t3.dmg);
            }
            fe.beam(C.x - cosA * L, C.y - sinA * L, C.x + cosA * L, C.y + sinA * L, 0.4, d.palette.core, 10);
          }
        }
        fe.cue(st.id, 'aftermath');
        st.objects.c = null;
        st.phase = 'cooldown'; st.cd = A(m.cooldown, i); st.cycle++;
      }
    }
  },
  draw(fe, ctx, st) {
    const d = FUSION_DEFS[st.id], m = d.mech, i = fe.ti(st.id);
    const C = st.objects.c;
    if (!C) return;
    const radius = A(m.radius, i);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = d.palette.glow; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(C.x, C.y, radius, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 0.4; ctx.setLineDash([18, 14]); ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(C.x, C.y, radius * 0.82, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    for (let h = 0; h < m.hands.count; h++) {
      const ang = C.hand + h * Math.PI;
      const bx = C.x + Math.cos(ang) * radius, by = C.y + Math.sin(ang) * radius;
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = h ? d.palette.core : '#ffffff';
      ctx.lineWidth = m.hands.width * 0.4;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(C.x, C.y); ctx.lineTo(bx, by); ctx.stroke();
    }
    ctx.restore();
    fe.drawArt(ctx, st.id, C.x, C.y, 180, 0, 0.7);
  },
};

// ── 08 GOLDEN COLLAPSE: spiral nodes → gravity roll → sequential detonation → implosion
FUSION_EXECUTORS.fus_golden_collapse = {
  start(fe, st) { st.phase = 'cooldown'; st.cd = 1.5; },
  update(fe, st, dt) {
    fe.tickShowcase(st, dt);
    const d = FUSION_DEFS[st.id], m = d.mech, i = fe.ti(st.id);
    st.t += dt;
    if (st.phase === 'cooldown') {
      st.cd -= dt;
      if (st.cd <= 0) { st.phase = 'charge'; st.t = 0; fe.cue(st.id, 'charge'); }
    } else if (st.phase === 'charge') {
      if (st.t >= 0.6) {
        // TARGETING PASS: η σπείρα στήνεται ΜΠΡΟΣΤΑ ΣΤΟΝ ΠΑΙΚΤΗ (ήταν densest(220)).
        const den = fe.aimPoint(300);
        const n = Math.min(m.caps.nodes, A(m.nodes.count, i));
        const R0 = A(m.spiralRadius, i);
        const nodes = [];
        for (let k = 0; k < n; k++) {
          const tt = k / Math.max(1, n - 1);
          const ang = 0.8 + tt * Math.PI * 3.2;
          const rr = R0 * Math.pow(0.618, tt * 1.6);
          nodes.push({ x: den.x + Math.cos(ang) * rr, y: den.y + Math.sin(ang) * rr, dead: false });
        }
        st.objects.s = { x: den.x, y: den.y, t: 0, tick: 0, nodes, detIdx: 0, detT: 0, amp: 0, detonating: false };
        st.phase = 'active'; st.t = 0;
        fe.cue(st.id, 'travel');
      }
    } else if (st.phase === 'active') {
      const S = st.objects.s;
      const pullMult = fe.chaos() ? (d.chaos.pullMult || 1) : 1;
      S.t += dt; S.tick += dt; S.detT += dt;
      const R0 = A(m.spiralRadius, i);
      for (const e of fe.near(S.x, S.y, R0)) fe.pull(e, S.x, S.y, m.spiralPullPerS * pullMult, dt);
      if (S.tick >= m.spiralTickS) {
        S.tick = 0;
        for (const e of fe.near(S.x, S.y, R0)) fe.dealDamage(st.id, e, A(m.spiralTickDmg, i));
      }
      if (!S.detonating && S.t >= 1.1) { S.detonating = true; S.detT = 0; }
      const gap = A(m.nodes.gapS, 0) * (fe.chaos() ? (d.chaos.nodeGapMult || 1) : 1);
      if (S.detonating && S.detT >= gap) {
        S.detT = 0;
        if (S.detIdx < S.nodes.length) {
          const nd = S.nodes[S.detIdx++];                            // έξω → μέσα (η λίστα είναι outer-first)
          nd.dead = true;
          const before = fe.tierOf(st.id) >= 3 ? fe.near(nd.x, nd.y, m.nodes.radius).filter(e => e.hp > 0).length : 0;
          for (const e of fe.near(nd.x, nd.y, m.nodes.radius)) fe.dealDamage(st.id, e, A(m.nodes.dmg, i));
          if (fe.tierOf(st.id) >= 3) {
            const after = fe.near(nd.x, nd.y, m.nodes.radius).filter(e => e.hp > 0).length;
            const kills = Math.max(0, before - after);
            S.amp = Math.min(d.t3.shardAmpCap, S.amp + kills * d.t3.shardAmpPerKill);
          }
          fe.flash(nd.x, nd.y, m.nodes.radius, 0.35, d.palette.glow);
          fe.cue(st.id, 'impact');
        } else {
          // implosion — TELEGRAPHED 0.45s στο κλειδωμένο κέντρο της σπείρας
          const iR = A(m.implosion.radius, i);
          const dmg = A(m.implosion.dmg, i) * (1 + S.amp);
          const ix = S.x, iy = S.y;
          fe.strike(ix, iy, iR, 0.45, '#fff6cf', () => {
            for (const e of fe.near(ix, iy, iR)) fe.dealDamage(st.id, e, dmg);
            fe.flash(ix, iy, iR, 0.55, '#fff6cf');
          });
          fe.ring(S.x, S.y, iR, 20, 0.5, d.palette.glow, 10);
          st.objects.residue = { x: S.x, y: S.y, t: 0, tick: 0,
            dur: m.residue.durS * (fe.chaos() ? (d.chaos.residueDurMult || 1) : 1) };
          fe.cue(st.id, 'aftermath');
          st.objects.s = null;
          st.phase = 'aftermath'; st.t = 0;
        }
      }
    } else if (st.phase === 'aftermath') {
      const R = st.objects.residue;
      if (R) {
        R.t += dt; R.tick += dt;
        if (R.tick >= m.residue.tickS) {
          R.tick = 0;
          for (const e of fe.near(R.x, R.y, 150)) fe.dealDamage(st.id, e, m.residue.tickDmg);
        }
        if (R.t >= R.dur) st.objects.residue = null;
      } else {
        st.phase = 'cooldown'; st.cd = A(m.cooldown, i); st.cycle++;
      }
    }
  },
  draw(fe, ctx, st) {
    const d = FUSION_DEFS[st.id], m = d.mech, i = fe.ti(st.id);
    const S = st.objects.s;
    if (S) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      // χρυσή σπείρα-οδηγός
      ctx.strokeStyle = d.palette.glow; ctx.globalAlpha = 0.55; ctx.lineWidth = 3;
      ctx.beginPath();
      const R0 = A(m.spiralRadius, i);
      for (let tt = 0; tt <= 1; tt += 0.02) {
        const ang = 0.8 + tt * Math.PI * 3.2 + fe._t * 0.4;
        const rr = R0 * Math.pow(0.618, tt * 1.6);
        const x = S.x + Math.cos(ang) * rr, y = S.y + Math.sin(ang) * rr;
        tt === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
      for (const nd of S.nodes) {
        if (nd.dead) continue;
        const pulse = 1 + Math.sin(fe._t * 7 + nd.x) * 0.15;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = '#fff6cf';
        ctx.beginPath(); ctx.arc(nd.x, nd.y, 9 * pulse, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = d.palette.glow; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(nd.x, nd.y, 16 * pulse, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      fe.drawArt(ctx, st.id, S.x, S.y, 150, fe._t * 0.5, 0.8);
    }
    const R = st.objects.residue;
    if (R) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.4 * (1 - R.t / R.dur);
      ctx.strokeStyle = d.palette.glow; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(R.x, R.y, 150, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  },
};

// ── 09 HUNGRY HELL FEAST: demon maw → herd+pull → executions → soul-fed bite (+T3)
FUSION_EXECUTORS.fus_hungry_hell_feast = {
  start(fe, st) { st.phase = 'cooldown'; st.cd = 1.8; },
  update(fe, st, dt) {
    fe.tickShowcase(st, dt);
    const d = FUSION_DEFS[st.id], m = d.mech, i = fe.ti(st.id);
    st.t += dt;
    if (st.phase === 'cooldown') {
      st.cd -= dt;
      if (st.cd <= 0) { st.phase = 'charge'; st.t = 0; fe.cue(st.id, 'charge'); }
    } else if (st.phase === 'charge') {
      if (st.t >= 0.6) {
        // TARGETING PASS: το στόμα σκίζεται ΜΠΡΟΣΤΑ ΣΤΟΝ ΠΑΙΚΤΗ (ήταν densest(220)).
        const den = fe.aimPoint(280);
        st.objects.maw = { x: den.x, y: den.y, t: 0, tick: 0, execT: 0, souls: 0, execCount: 0, secondCourse: false };
        st.phase = 'feast'; st.t = 0;
        fe.cue(st.id, 'travel');
        fe.ring(den.x, den.y, 30, A(m.maw.radius, i), 0.5, d.palette.glow, 7);
      }
    } else if (st.phase === 'feast') {
      const M = st.objects.maw;
      const durS = A(m.durS, i) * (fe.chaos() ? (d.chaos.durMult || 1) : 1);
      const radius = A(m.maw.radius, i);
      const soulCap = m.bite.soulCap + (fe.chaos() ? (d.chaos.soulCapBonus || 0) : 0);
      M.t += dt; M.tick += dt; M.execT += dt;
      for (const e of fe.near(M.x, M.y, m.spirits.herdRadius)) fe.pull(e, M.x, M.y, m.maw.pullPerS, dt);
      if (M.tick >= m.maw.tickS) {
        M.tick = 0;
        for (const e of fe.near(M.x, M.y, radius)) fe.dealDamage(st.id, e, A(m.maw.tickDmg, i));
      }
      if (M.execT >= m.execute.everyS && M.execCount < m.execute.maxPerCycle) {
        M.execT = 0;
        // CHAOS DOCTRINE (assassin_clone): an ARMED shroud widens the execution window once.
        const pct = A(m.execute.pctMaxHp, i) + (fe.chaos() ? (d.chaos.execPctBonus || 0) : 0)
                  + (fe.chaos() ? (fe.game.doctrineExecBonus?.() || 0) : 0);
        for (const e of fe.near(M.x, M.y, radius)) {
          if (fe.isBoss(e)) continue;
          const maxHp = e.maxHp || e.hp;
          if (e.hp <= maxHp * pct) {
            const executeDmg = Math.min(m.execute.cap, e.hp + 1);
            fe.dealDamage(st.id, e, executeDmg);
            if (e.hp <= 0) {
              M.souls = Math.min(soulCap, M.souls + 1);
              M.execCount++;
              fe.flash(e.pos.x, e.pos.y, 50, 0.3, d.palette.glow);
            }
            if (M.execCount >= m.execute.maxPerCycle) break;
          }
        }
      }
      // T3 second course
      if (fe.tierOf(st.id) >= 3 && !M.secondCourse && M.souls >= soulCap) {
        M.secondCourse = true;
        M.t = Math.min(M.t, durS - 1.2);                            // κράτα 1.2s bonus herd
        for (const e of fe.near(M.x, M.y, d.t3.secondCourse.fearNovaRadius)) {
          if (!fe.isBoss(e)) fe.pull(e, M.x, M.y, 300, 0.5);        // roar-herd burst
        }
        fe.ring(M.x, M.y, 40, d.t3.secondCourse.fearNovaRadius, 0.5, d.palette.core, 6);
        fe.cue(st.id, 'charge');
      }
      if (M.t >= durS) {
        // final bite — TELEGRAPHED. Ήταν το χειρότερο instant του αρχείου: ακτίνα 240 ενώ το
        // σχεδιασμένο στόμα είναι 150-180, δηλαδή σκότωνε καθαρά έξω από ό,τι έβλεπε ο παίκτης,
        // στο ακριβές frame που έληγε ο χρόνος. Τώρα 0.50s προειδοποίηση στο πλήρες 240.
        const biteDmg = (A(m.bite.baseDmg, i) + A(m.bite.perSoul, i) * M.souls);
        const bx = M.x, by = M.y, bR = m.bite.radius, second = M.secondCourse;
        fe.strike(bx, by, bR, 0.50, d.palette.glow, () => {
          for (const e of fe.near(bx, by, bR)) fe.dealDamage(st.id, e, biteDmg);
          if (second) {
            for (const e of fe.near(bx, by, bR)) {
              fe.dealDamage(st.id, e, biteDmg * d.t3.secondCourse.biteDmgMult);
            }
          }
          fe.flash(bx, by, bR, 0.55, d.palette.glow);
          fe.game.screenShake?.trigger?.(11, 0.45);
        });
        fe.cue(st.id, 'impact');
        fe.cue(st.id, 'aftermath');
        st.objects.maw = null;
        st.phase = 'cooldown'; st.cd = A(m.cooldown, i); st.cycle++;
      }
    }
  },
  draw(fe, ctx, st) {
    const d = FUSION_DEFS[st.id], m = d.mech, i = fe.ti(st.id);
    const M = st.objects.maw;
    if (!M) return;
    const radius = A(m.maw.radius, i);
    // σκοτεινό στόμα + περιστρεφόμενα «δόντια» τόξα
    fe.veil(ctx, M.x, M.y, radius, 'rgba(16,1,4,0.92)', 'rgba(16,1,4,0)');
    fe.veil(ctx, M.x, M.y, radius * 0.75, 'rgba(120,10,25,0.4)', 'rgba(120,10,25,0)', 1, true);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 8; k++) {
      const a = fe._t * 2.4 + (k / 8) * Math.PI * 2;
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = '#ffe3e3';
      ctx.save();
      ctx.translate(M.x + Math.cos(a) * radius * 0.82, M.y + Math.sin(a) * radius * 0.82);
      ctx.rotate(a + Math.PI / 2);
      ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(0, 26); ctx.lineTo(9, 0); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    // πνεύματα-φανάρια σε τροχιά (spirits herd)
    for (let k = 0; k < m.spirits.count; k++) {
      const a = fe._t * 1.6 + (k / m.spirits.count) * Math.PI * 2;
      const sx = M.x + Math.cos(a) * (radius + 70), sy = M.y + Math.sin(a) * (radius + 70);
      fe.veil(ctx, sx, sy, 26, '#fff1d6', 'rgba(255,120,60,0)', 0.85, true);
    }
    fe.drawArt(ctx, st.id, M.x, M.y - 30, 200, Math.sin(fe._t * 2) * 0.08, 0.9);
    // souls counter: μικρές ψυχές-σφαίρες γύρω από το art
    for (let k = 0; k < M.souls; k++) {
      const a = fe._t + (k / Math.max(1, M.souls)) * Math.PI * 2;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.75;
      ctx.fillStyle = d.palette.core;
      ctx.beginPath(); ctx.arc(M.x + Math.cos(a) * 60, M.y - 30 + Math.sin(a) * 24 - 90, 5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  },
};

// ── 10 NIGHT PARADE: marching lantern procession + moving ion fence (+T3 return) ──
FUSION_EXECUTORS.fus_night_parade = {
  start(fe, st) { st.phase = 'cooldown'; st.cd = 1.6; },
  update(fe, st, dt) {
    fe.tickShowcase(st, dt);
    const d = FUSION_DEFS[st.id], m = d.mech, i = fe.ti(st.id);
    const p = fe.game.player;
    st.t += dt;
    if (st.phase === 'cooldown') {
      st.cd -= dt;
      if (st.cd <= 0) { st.phase = 'charge'; st.t = 0; fe.cue(st.id, 'charge'); }
    } else if (st.phase === 'charge') {
      if (st.t >= 0.7) {
        // TARGETING PASS: η πομπή ξεκινά την πορεία της προς την κατεύθυνση του ΠΑΙΚΤΗ.
        const ang = fe.aimAngle();
        const n = Math.min(m.caps.lanterns, A(m.lanterns, i) + (fe.chaos() ? (d.chaos.extraLantern || 0) : 0));
        const lans = [];
        for (let k = 0; k < n; k++) {
          const off = (k - (n - 1) / 2) * m.spacing;
          lans.push({
            x: p.pos.x + Math.cos(ang) * 60 - Math.sin(ang) * off,
            y: p.pos.y + Math.sin(ang) * 60 + Math.cos(ang) * off,
            hit: new Set(),
          });
        }
        st.objects.par = { ang, lans, t: 0, tick: 0, returned: false };
        st.phase = 'march'; st.t = 0;
        fe.cue(st.id, 'travel');
      }
    } else if (st.phase === 'march') {
      const P = st.objects.par;
      const marchS = A(m.marchS, i) * (fe.chaos() ? (d.chaos.marchDurMult || 1) : 1);
      P.t += dt; P.tick += dt;
      const vx = Math.cos(P.ang) * m.marchSpeed * dt, vy = Math.sin(P.ang) * m.marchSpeed * dt;
      for (const L of P.lans) { L.x += vx; L.y += vy; }
      // touch damage: μία φορά ανά φανάρι ανά στόχο ανά πέρασμα
      for (const L of P.lans) {
        for (const e of fe.near(L.x, L.y, m.touch.radius)) {
          if (L.hit.has(e)) continue;
          L.hit.add(e);
          fe.dealDamage(st.id, e, A(m.touch.dmg, i));
        }
        if (L.hit.size > 60) L.hit.clear();                         // bounded set
      }
      // fence tick ανάμεσα σε διαδοχικά φανάρια
      if (P.tick >= m.fence.tickS) {
        P.tick = 0;
        const fenceDmg = A(m.fence.tickDmg, i) * (fe.chaos() ? (d.chaos.fenceDmgMult || 1) : 1);
        for (let k = 0; k + 1 < P.lans.length; k++) {
          const a = P.lans[k], b = P.lans[k + 1];
          for (const e of fe.targets()) {
            const vx2 = b.x - a.x, vy2 = b.y - a.y;
            const L2 = vx2 * vx2 + vy2 * vy2 || 1;
            let tt = ((e.pos.x - a.x) * vx2 + (e.pos.y - a.y) * vy2) / L2;
            tt = Math.max(0, Math.min(1, tt));
            const px2 = a.x + vx2 * tt, py2 = a.y + vy2 * tt;
            if (dist2(e.pos.x, e.pos.y, px2, py2) < (24 + (e.radius || 18)) ** 2) {
              fe.dealDamage(st.id, e, fenceDmg);
            }
          }
        }
      }
      if (P.t >= marchS) {
        if (fe.tierOf(st.id) >= 3 && !P.returned) {
          // RETURN PROCESSION: αναστροφή μία φορά
          P.returned = true;
          P.ang += Math.PI;
          P.t = marchS * 0.25;                                      // συντομότερη επιστροφή
          for (const L of P.lans) L.hit.clear();
          fe.cue(st.id, 'charge');
        } else {
          st.phase = 'bursts'; st.t = 0; st.objects.bIdx = 0; st.objects.bT = 0;
        }
      }
    } else if (st.phase === 'bursts') {
      const P = st.objects.par;
      st.objects.bT += dt;
      if (st.objects.bT >= m.endBursts.gapS) {
        st.objects.bT = 0;
        if (st.objects.bIdx < P.lans.length) {
          const L = P.lans[st.objects.bIdx++];
          const dmgMult = P.returned ? d.t3.returnMarch.dmgMult : 1;
          // TELEGRAPHED: κάθε φανάρι προειδοποιεί 0.22s πριν σκάσει (ακτίνα 110 vs sprite 92).
          const lx = L.x, ly = L.y, bR2 = m.endBursts.radius, bDmg2 = A(m.endBursts.dmg, i) * dmgMult;
          fe.strike(lx, ly, bR2, 0.22, d.palette.glow, () => {
            for (const e of fe.near(lx, ly, bR2)) fe.dealDamage(st.id, e, bDmg2);
            fe.flash(lx, ly, bR2, 0.35, d.palette.glow);
          });
          fe.cue(st.id, 'impact');
        } else {
          st.objects.par = null;
          st.phase = 'cooldown'; st.cd = A(m.cooldown, i); st.cycle++;
          fe.cue(st.id, 'aftermath');
        }
      }
    }
  },
  draw(fe, ctx, st) {
    const d = FUSION_DEFS[st.id], m = d.mech;
    const P = st.objects.par;
    if (!P) return;
    // ion fence
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = d.palette.glow; ctx.lineWidth = 3.5;
    ctx.globalAlpha = 0.7;
    for (let k = 0; k + 1 < P.lans.length; k++) {
      const a = P.lans[k], b = P.lans[k + 1];
      const midx = (a.x + b.x) / 2 + Math.sin(fe._t * 9 + k) * 8;
      const midy = (a.y + b.y) / 2 + Math.cos(fe._t * 8 + k) * 8;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(midx, midy, b.x, b.y); ctx.stroke();
    }
    ctx.restore();
    for (let k = 0; k < P.lans.length; k++) {
      const L = P.lans[k];
      const bob = Math.sin(fe._t * 4 + k * 1.3) * 6;
      fe.drawArt(ctx, st.id, L.x, L.y + bob, 92, Math.sin(fe._t * 2 + k) * 0.1, 0.95);
    }
  },
};

// ════════════════════════════════════════════════════════════════════════════════
// EXECUTORS — Batch E (chars 6-10, fusions 11-20)
// ════════════════════════════════════════════════════════════════════════════════

// ── 11 FERROMAG PILEDRIVER: assembly → line punch → embed → yank-back → ion arcs
FUSION_EXECUTORS.fus_ferromag_piledriver = {
  start(fe, st) { st.phase = 'cooldown'; st.cd = 1.3; },
  update(fe, st, dt) {
    fe.tickShowcase(st, dt);
    const d = FUSION_DEFS[st.id], m = d.mech, i = fe.ti(st.id);
    const p = fe.game.player;
    st.t += dt;
    const cdMult = fe.chaos() ? (d.chaos.cdMult || 1) : 1;
    if (st.phase === 'cooldown') {
      st.cd -= dt;
      if (st.cd <= 0) { st.phase = 'assemble'; st.t = 0; fe.cue(st.id, 'charge'); }
    } else if (st.phase === 'assemble') {
      if (st.t >= m.assembleS) {
        const range = A(m.punch.range, i);
        // Το πιστόνι είναι ΣΤΕΝΗ γραμμή: πυροβολά ΜΟΝΟ όταν υπάρχει πραγματικός
        // στόχος σε εμβέλεια, και σκοπεύει τον κοντινότερο — ποτέ στο κενό.
        const tgt = fe.nearestTo(p.pos.x, p.pos.y);
        if (!tgt || dist2(p.pos.x, p.pos.y, tgt.pos.x, tgt.pos.y) > (range * 1.15) ** 2) {
          st.t = m.assembleS * 0.75;                   // κράτα τη συναρμολόγηση ζεστή
          return;
        }
        const ang = Math.atan2(tgt.pos.y - p.pos.y, tgt.pos.x - p.pos.x);
        const cosA = Math.cos(ang), sinA = Math.sin(ang);
        const maxFrags = Math.min(m.caps.embeddedFrags,
          A(m.embed.frags, i) + (fe.chaos() ? (d.chaos.extraFrags || 0) : 0));
        const embedded = [];
        // TARGETING PASS: το lock στον κοντινότερο ΜΕΝΕΙ — μαγνητισμός σημαίνει έλξη, είναι
        // το concept του όπλου. Αυτό που αλλάζει είναι η ΠΑΡΑΔΟΣΗ: η γραμμή κλειδώνει τώρα,
        // ανάβει, και το πιστόνι χτυπά 0.26s μετά. Ο εχθρός που βγει από τη γραμμή γλιτώνει.
        const px0 = p.pos.x, py0 = p.pos.y;
        fe.beam(px0, py0, px0 + cosA * range, py0 + sinA * range, 0.26, d.palette.glow, 4);
        fe.strike(px0 + cosA * range * 0.5, py0 + sinA * range * 0.5, range * 0.5, 0.26,
                  d.palette.core, () => {
          for (const e of fe.targets()) {
            const dx = e.pos.x - px0, dy = e.pos.y - py0;
            const along = dx * cosA + dy * sinA, side = Math.abs(-dx * sinA + dy * cosA);
            if (along > 0 && along < range && side < m.punch.width * 0.5 + (e.radius || 18)) {
              fe.dealDamage(st.id, e, A(m.punch.dmg, i));
              if (embedded.length < maxFrags) embedded.push(e);
            }
          }
        });
        st.objects.punch = { x: p.pos.x, y: p.pos.y, ang, range, t: 0 };
        st.objects.embedded = embedded;
        fe.flash(p.pos.x + cosA * range * 0.5, p.pos.y + sinA * range * 0.5, 90, 0.35, d.palette.glow);
        fe.game.screenShake?.trigger?.(8, 0.3);
        st.phase = 'embedded'; st.t = 0;
        fe.cue(st.id, 'travel');
      }
    } else if (st.phase === 'embedded') {
      if (st.t >= m.yank.delayS) {
        // YANK: όλα τα καρφωμένα θραύσματα επιστρέφουν σχίζοντας
        for (const e of st.objects.embedded) {
          if (!e || e.hp <= 0) continue;
          fe.dealDamage(st.id, e, A(m.yank.dmgPerFrag, i));
          fe.beam(e.pos.x, e.pos.y, p.pos.x, p.pos.y, 0.3, d.palette.core, 5);
          // T3 OVERPRESSURE: συμπίεση προς τη γραμμή της γροθιάς
          if (fe.tierOf(st.id) >= 3) fe.pull(e, p.pos.x, p.pos.y, d.t3.slam.pullPerS, dt * 8);
        }
        fe.cue(st.id, 'impact');
        // ion arcs ανάμεσα στους μαρκαρισμένους
        const marked = st.objects.embedded.filter(e => e && e.hp > 0);
        const arcs = Math.min(m.caps.arcs, A(m.arcs.count, i));
        const arcDmg = A(m.arcs.dmg, i) * (fe.chaos() ? (d.chaos.arcDmgMult || 1) : 1);
        for (let k = 0; k + 1 < marked.length && k < arcs; k++) {
          const a = marked[k], b = marked[k + 1];
          if (dist2(a.pos.x, a.pos.y, b.pos.x, b.pos.y) < m.arcs.range ** 2) {
            fe.dealDamage(st.id, a, arcDmg);
            fe.dealDamage(st.id, b, arcDmg);
            fe.beam(a.pos.x, a.pos.y, b.pos.x, b.pos.y, 0.25, d.palette.glow, 4);
          }
        }
        // T3: δεύτερο κοντό πιστόνι
        if (fe.tierOf(st.id) >= 3 && st.objects.punch) {
          const P = st.objects.punch;
          const cosA = Math.cos(P.ang), sinA = Math.sin(P.ang);
          for (const e of fe.targets()) {
            const dx = e.pos.x - p.pos.x, dy = e.pos.y - p.pos.y;
            const along = dx * cosA + dy * sinA, side = Math.abs(-dx * sinA + dy * cosA);
            if (along > 0 && along < d.t3.slam.range && side < d.t3.slam.width * 0.5 + (e.radius || 18)) {
              fe.dealDamage(st.id, e, d.t3.slam.dmg);
            }
          }
          fe.flash(p.pos.x + cosA * d.t3.slam.range * 0.5, p.pos.y + sinA * d.t3.slam.range * 0.5, 70, 0.3, d.palette.core);
        }
        st.objects.embedded = [];
        st.phase = 'aftermath'; st.t = 0;
        fe.cue(st.id, 'aftermath');
      }
    } else if (st.phase === 'aftermath') {
      if (st.t >= 0.4) {
        st.objects.punch = null;
        st.phase = 'cooldown'; st.cd = A(m.cooldown, i) * cdMult; st.cycle++;
      }
    }
  },
  draw(fe, ctx, st) {
    const d = FUSION_DEFS[st.id], m = d.mech;
    const p = fe.game.player;
    if (st.phase === 'assemble') {
      const k = Math.min(1, st.t / m.assembleS);
      fe.drawArt(ctx, st.id, p.pos.x, p.pos.y - 80, 120 + k * 90, 0, 0.4 + k * 0.6);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.6 * k;
      ctx.strokeStyle = d.palette.glow; ctx.lineWidth = 3; ctx.setLineDash([10, 8]);
      ctx.beginPath(); ctx.arc(p.pos.x, p.pos.y - 80, 100 * (1 - k * 0.5), 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    } else if ((st.phase === 'embedded' || st.phase === 'aftermath') && st.objects.punch) {
      const P = st.objects.punch;
      const ex = p.pos.x + Math.cos(P.ang) * P.range, ey = p.pos.y + Math.sin(P.ang) * P.range;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5;
      ctx.strokeStyle = d.palette.glow; ctx.lineWidth = m.punch.width * 0.35; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(p.pos.x, p.pos.y); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.restore();
      fe.drawArt(ctx, st.id, p.pos.x + Math.cos(P.ang) * 120, p.pos.y + Math.sin(P.ang) * 120, 170, P.ang + 0.32, 0.95);
      // markers στα καρφωμένα θραύσματα
      for (const e of st.objects.embedded || []) {
        if (!e || e.hp <= 0) continue;
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.85;
        ctx.strokeStyle = d.palette.core; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(e.pos.x, e.pos.y, (e.radius || 18) + 6, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
    }
  },
};

// ── 12 SCRAPSTORM FOUNDRY: orbiting grind ring → forged homing drones → end nova
FUSION_EXECUTORS.fus_scrapstorm_foundry = {
  start(fe, st) { st.phase = 'cooldown'; st.cd = 1.4; st.objects.drones = []; st.objects.slags = []; },
  update(fe, st, dt) {
    fe.tickShowcase(st, dt);
    const d = FUSION_DEFS[st.id], m = d.mech, i = fe.ti(st.id);
    const p = fe.game.player;
    st.t += dt;
    if (st.phase === 'cooldown') {
      st.cd -= dt;
      if (st.cd <= 0) {
        st.phase = 'ring'; st.t = 0;
        st.objects.ring = { t: 0, tick: 0, hits: 0 };
        fe.cue(st.id, 'manifest');
      }
    } else if (st.phase === 'ring') {
      const R = st.objects.ring;
      const durS = A(m.durS, i);
      R.t += dt; R.tick += dt;
      if (R.tick >= m.ring.tickS) {
        R.tick = 0;
        const grindDmg = A(m.ring.tickDmg, i) * (fe.chaos() ? (d.chaos.ringDmgMult || 1) : 1);
        for (const e of fe.near(p.pos.x, p.pos.y, m.ring.radius + 40)) {
          const dd = Math.hypot(e.pos.x - p.pos.x, e.pos.y - p.pos.y);
          if (Math.abs(dd - m.ring.radius) < 44 + (e.radius || 18)) {
            fe.dealDamage(st.id, e, grindDmg);
            R.hits++;
          }
        }
        // forge drone
        const hitsPer = Math.max(2, Math.round(m.forge.hitsPerDrone * (fe.chaos() ? (d.chaos.hitsPerDroneMult || 1) : 1)));
        // CHAOS DOCTRINE (cyber_arm_hero, Chaos only): FOUNDRY PYLON stacks add drone slots.
        // Added INSIDE the existing Math.min so caps.dronesAlive stays the hard ceiling and the
        // fusion remains the single authority on its own drone count. Zero for everyone else.
        const _fd = fe.chaos() ? (fe.game._doctrineFoundryStacks || 0) : 0;
        const cap = Math.min(m.caps.dronesAlive, A(m.forge.droneCap, i) + _fd);
        if (R.hits >= hitsPer && st.objects.drones.length < cap) {
          R.hits = 0;
          // TARGETING PASS: το drone ΚΡΑΤΑΕΙ auto-targeting — το ίδιο το κείμενο του fusion
          // λέει "homing scrap-drone". Αλλά ΔΕΝ ήταν homing: κλείδωνε παγωμένες συντεταγμένες
          // (densest) και πετούσε ευθεία εκεί. Τώρα κρατά ΖΩΝΤΑΝΗ αναφορά στόχου και στρίβει
          // με περιορισμένο ρυθμό — πραγματικό steering, όχι τηλεμεταφορά σε παλιό σημείο.
          const tgt = fe.nearestTo(p.pos.x, p.pos.y);
          const a0 = tgt ? Math.atan2(tgt.pos.y - p.pos.y, tgt.pos.x - p.pos.x) : fe.aimAngle();
          st.objects.drones.push({ x: p.pos.x, y: p.pos.y - m.ring.radius,
                                   target: tgt || null, ang: a0, t: 0 });
          fe.cue(st.id, 'travel');
        }
      }
      if (R.t >= durS) {
        // end nova
        const novaDmg = A(m.novaEnd.dmg, i);
        for (const e of fe.near(p.pos.x, p.pos.y, m.novaEnd.radius)) fe.dealDamage(st.id, e, novaDmg);
        fe.ring(p.pos.x, p.pos.y, m.ring.radius, m.novaEnd.radius, 0.5, d.palette.glow, 8);
        fe.cue(st.id, 'aftermath');
        st.objects.ring = null;
        st.phase = 'cooldown'; st.cd = A(m.cooldown, i); st.cycle++;
      }
    }
    // drones (ζουν και εκτός ring phase)
    for (let k = st.objects.drones.length - 1; k >= 0; k--) {
      const dr = st.objects.drones[k];
      dr.t += dt;
      // ΠΡΑΓΜΑΤΙΚΟ HOMING με όριο στροφής (DRONE_TURN rad/s): το drone ξαναδιαβάζει τη ΖΩΝΤΑΝΗ
      // θέση του στόχου του, αλλά μπορεί να στρίψει μόνο τόσο ανά δευτερόλεπτο — ένας εχθρός
      // που στρίβει απότομα το κάνει να προσπεράσει. Χάνει τον στόχο -> ξαναδιαλέγει κοντινότερο.
      if (!dr.target || dr.target.hp <= 0) dr.target = fe.nearestTo(dr.x, dr.y);
      if (dr.target && dr.target.pos) {
        let da = Math.atan2(dr.target.pos.y - dr.y, dr.target.pos.x - dr.x) - dr.ang;
        while (da >  Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        const maxTurn = DRONE_TURN * dt;
        dr.ang += Math.max(-maxTurn, Math.min(maxTurn, da));
      }
      const step = m.forge.speed * dt;
      const tdd = dr.target && dr.target.pos
        ? Math.hypot(dr.target.pos.x - dr.x, dr.target.pos.y - dr.y) : Infinity;
      if (tdd <= step + 6 + (dr.target?.radius || 0) || dr.t > 3) {
        for (const e of fe.near(dr.x, dr.y, 100)) fe.dealDamage(st.id, e, A(m.forge.droneDmg, i));
        for (const e of fe.near(dr.x, dr.y, 160)) fe.dealDamage(st.id, e, A(m.forge.coneDmg, i));
        fe.flash(dr.x, dr.y, 120, 0.4, d.palette.glow);
        fe.cue(st.id, 'impact');
        if (fe.tierOf(st.id) >= 3 && st.objects.slags.length < d.t3.slag.cap) {
          st.objects.slags.push({ x: dr.x, y: dr.y, t: 0, tick: 0,
            dur: d.t3.slag.durS * (fe.chaos() ? (d.chaos.slagDurMult || 1) : 1) });
        }
        st.objects.drones.splice(k, 1);
      } else {
        dr.x += Math.cos(dr.ang) * step; dr.y += Math.sin(dr.ang) * step;
      }
    }
    for (let k = st.objects.slags.length - 1; k >= 0; k--) {
      const s = st.objects.slags[k];
      s.t += dt; s.tick += dt;
      if (s.tick >= d.t3.slag.tickS) {
        s.tick = 0;
        for (const e of fe.near(s.x, s.y, d.t3.slag.radius)) fe.dealDamage(st.id, e, d.t3.slag.tickDmg);
      }
      if (s.t >= s.dur) st.objects.slags.splice(k, 1);
    }
  },
  draw(fe, ctx, st) {
    const d = FUSION_DEFS[st.id], m = d.mech;
    const p = fe.game.player;
    if (st.objects.ring) {
      // περιστρεφόμενες πλάκες σκραπ (10 θέσεις)
      for (let k = 0; k < m.ring.pieces; k++) {
        const a = fe._t * 2.6 + (k / m.ring.pieces) * Math.PI * 2;
        const x = p.pos.x + Math.cos(a) * m.ring.radius, y = p.pos.y + Math.sin(a) * m.ring.radius;
        ctx.save(); ctx.translate(x, y); ctx.rotate(a + fe._t * 3);
        ctx.fillStyle = k % 2 ? '#a3805e' : '#5c4634';
        ctx.beginPath(); ctx.moveTo(-14, 4); ctx.lineTo(-4, -12); ctx.lineTo(14, -2); ctx.lineTo(4, 12); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.45;
      ctx.strokeStyle = d.palette.glow; ctx.lineWidth = 4; ctx.setLineDash([8, 16]);
      ctx.beginPath(); ctx.arc(p.pos.x, p.pos.y, m.ring.radius, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      fe.drawArt(ctx, st.id, p.pos.x, p.pos.y - 130, 110, 0, 0.55);
    }
    for (const dr of st.objects.drones || []) {
      fe.drawArt(ctx, st.id, dr.x, dr.y, 66, dr.ang || 0, 0.95);
    }
    for (const s of st.objects.slags || []) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35 * (1 - s.t / s.dur);
      ctx.fillStyle = d.palette.glow;
      ctx.beginPath(); ctx.arc(s.x, s.y, FUSION_DEFS[st.id].t3.slag.radius, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  },
};

// ── 13 WIDOW'S LOOM: web lattice → venom cuts → cinch execution → dissolve (+T3 reweave)
FUSION_EXECUTORS.fus_widows_loom = {
  start(fe, st) { st.phase = 'cooldown'; st.cd = 1.5; st.objects.venom = new Map(); },
  _weave(fe, st, cx, cy, radiusMult, dmgMult) {
    const d = FUSION_DEFS[st.id], m = d.mech, i = fe.ti(st.id);
    const n = Math.min(m.caps.nodes, A(m.web.nodes, i));
    const R = A(m.web.radius, i) * radiusMult;
    const nodes = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      nodes.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]);
    }
    st.objects.loom = { cx, cy, R, nodes, t: 0, tick: 0, dmgMult };
  },
  update(fe, st, dt) {
    fe.tickShowcase(st, dt);
    const d = FUSION_DEFS[st.id], m = d.mech, i = fe.ti(st.id);
    st.t += dt;
    if (st.phase === 'cooldown') {
      st.cd -= dt;
      if (st.cd <= 0) { st.phase = 'charge'; st.t = 0; fe.cue(st.id, 'charge'); }
    } else if (st.phase === 'charge') {
      if (st.t >= 0.6) {
        // TARGETING PASS: ο ιστός υφαίνεται ΜΠΡΟΣΤΑ ΣΤΟΝ ΠΑΙΚΤΗ (ήταν densest(220)).
        const den = fe.aimPoint(300);
        this._weave(fe, st, den.x, den.y, 1, 1);
        st.objects.venom.clear();
        st.objects.rewoven = false;
        st.phase = 'web'; st.t = 0;
        fe.cue(st.id, 'travel');
      }
    } else if (st.phase === 'web') {
      const L = st.objects.loom;
      const durS = A(m.durS, i) * (fe.chaos() ? (d.chaos.durMult || 1) : 1);
      L.t += dt; L.tick += dt;
      if (L.tick >= m.web.wireTickS) {
        L.tick = 0;
        const venomAdd = m.web.venomPerCut + (fe.chaos() ? (d.chaos.venomPerCutBonus || 0) : 0);
        // wires: spokes + perimeter
        const segs = [];
        for (let k = 0; k < L.nodes.length; k++) {
          segs.push([[L.cx, L.cy], L.nodes[k]]);
          segs.push([L.nodes[k], L.nodes[(k + 1) % L.nodes.length]]);
        }
        for (const e of fe.near(L.cx, L.cy, L.R + 60)) {
          for (const [[x1, y1], [x2, y2]] of segs) {
            const vx = x2 - x1, vy = y2 - y1;
            const L2 = vx * vx + vy * vy || 1;
            let tt = ((e.pos.x - x1) * vx + (e.pos.y - y1) * vy) / L2;
            tt = Math.max(0, Math.min(1, tt));
            const px2 = x1 + vx * tt, py2 = y1 + vy * tt;
            if (dist2(e.pos.x, e.pos.y, px2, py2) < (18 + (e.radius || 18)) ** 2) {
              fe.dealDamage(st.id, e, A(m.web.wireDmg, i) * L.dmgMult);
              const cur = st.objects.venom.get(e) || 0;
              if (st.objects.venom.size < 40 || st.objects.venom.has(e)) {
                st.objects.venom.set(e, Math.min(m.cinch.stacksNeeded, cur + venomAdd));
              }
              break;                                  // ένα νήμα ανά tick ανά στόχο
            }
          }
        }
      }
      if (L.t >= durS) {
        // CINCH
        // CHAOS DOCTRINE (assassin_clone): an ARMED shroud widens the execution window once.
        const execPct = A(m.cinch.execPct, i) + (fe.chaos() ? (d.chaos.execPctBonus || 0) : 0)
                      + (fe.chaos() ? (fe.game.doctrineExecBonus?.() || 0) : 0);
        // TELEGRAPHED: το κλείσιμο του ιστού (execute + burst) έσκαγε στο frame που έληγε ο
        // χρόνος. Τώρα ο ιστός «σφίγγει» ορατά 0.40s — όποιος βγει από τον κύκλο ΔΕΝ πληρώνει,
        // ούτε καν το execute, γιατί το fe.near() ξανατρέχει τη στιγμή που σφίγγει.
        const lx2 = L.cx, ly2 = L.cy, lR2 = L.R, lMul = L.dmgMult;
        fe.ring(lx2, ly2, lR2, 20, 0.5, d.palette.glow, 7);
        fe.strike(lx2, ly2, lR2 + 40, 0.40, d.palette.glow, () => {
          let executions = 0;
          for (const e of fe.near(lx2, ly2, lR2 + 40)) {
            const stacks = st.objects.venom.get(e) || 0;
            const marked = stacks >= m.cinch.stacksNeeded;
            if (marked && !fe.isBoss(e) && executions < m.caps.executionsPerCinch) {
              const maxHp = e.maxHp || e.hp;
              if (e.hp <= maxHp * execPct) {
                fe.dealDamage(st.id, e, Math.min(m.cinch.execCap, e.hp + 1));
                executions++;
                fe.flash(e.pos.x, e.pos.y, 44, 0.3, d.palette.glow);
                continue;
              }
            }
            fe.dealDamage(st.id, e, A(m.cinch.burstDmg, i) * lMul);
          }
        });
        fe.cue(st.id, 'impact');
        // T3 BLACK WIDOW: άμεσο reweave μικρότερου ιστού μία φορά
        if (fe.tierOf(st.id) >= 3 && !st.objects.rewoven) {
          st.objects.rewoven = true;
          this._weave(fe, st, L.cx, L.cy, d.t3.reweave.radiusMult, d.t3.reweave.dmgMult);
          st.objects.loom.t = durS * 0.55;             // σύντομος δεύτερος κύκλος
          fe.cue(st.id, 'charge');
          return;
        }
        st.objects.dissolve = { x: L.cx, y: L.cy, t: 0, tick: 0 };
        st.objects.loom = null;
        st.phase = 'dissolve'; st.t = 0;
        fe.cue(st.id, 'aftermath');
      }
    } else if (st.phase === 'dissolve') {
      const D2 = st.objects.dissolve;
      D2.t += dt; D2.tick += dt;
      if (D2.tick >= m.dissolve.tickS) {
        D2.tick = 0;
        for (const e of fe.near(D2.x, D2.y, m.dissolve.radius)) fe.dealDamage(st.id, e, m.dissolve.tickDmg);
      }
      if (D2.t >= m.dissolve.durS) {
        st.objects.dissolve = null;
        st.objects.venom.clear();
        st.phase = 'cooldown'; st.cd = A(m.cooldown, i); st.cycle++;
      }
    }
  },
  draw(fe, ctx, st) {
    const d = FUSION_DEFS[st.id];
    const L = st.objects.loom;
    if (L) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = d.palette.glow; ctx.lineWidth = 2; ctx.globalAlpha = 0.75;
      for (let k = 0; k < L.nodes.length; k++) {
        const [x1, y1] = L.nodes[k], [x2, y2] = L.nodes[(k + 1) % L.nodes.length];
        ctx.beginPath(); ctx.moveTo(L.cx, L.cy); ctx.lineTo(x1, y1); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
      ctx.restore();
      fe.drawArt(ctx, st.id, L.cx, L.cy, Math.min(200, L.R * 0.9), 0, 0.8);
    }
    const D2 = st.objects.dissolve;
    if (D2) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.3 * (1 - D2.t / FUSION_DEFS[st.id].mech.dissolve.durS);
      ctx.fillStyle = d.palette.glow;
      ctx.beginPath(); ctx.arc(D2.x, D2.y, FUSION_DEFS[st.id].mech.dissolve.radius, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  },
};

// ── 14 PHANTOM NEEDLE PROTOCOL: mark toughest → homing needles → simultaneous strike
FUSION_EXECUTORS.fus_phantom_needle_protocol = {
  start(fe, st) { st.phase = 'cooldown'; st.cd = 1.2; },
  update(fe, st, dt) {
    fe.tickShowcase(st, dt);
    const d = FUSION_DEFS[st.id], m = d.mech, i = fe.ti(st.id);
    const p = fe.game.player;
    st.t += dt;
    const cdMult = fe.chaos() ? (d.chaos.cdMult || 1) : 1;
    if (st.phase === 'cooldown') {
      st.cd -= dt;
      if (st.cd <= 0) {
        // επιλογή στόχων: οι πιο εύρωστοι στην οθόνη
        const marks = m.marks + (fe.chaos() ? (d.chaos.extraMark || 0) : 0);
        const ts = fe.targets().slice().sort((a, b) => (b.hp || 0) - (a.hp || 0)).slice(0, marks);
        if (!ts.length) { st.cd = 0.5; return; }
        st.objects.marks = ts;
        st.phase = 'sigil'; st.t = 0;
        fe.cue(st.id, 'charge');
      }
    } else if (st.phase === 'sigil') {
      if (st.t >= m.sigilS) {
        st.objects.needles = st.objects.marks.filter(e => e && e.hp > 0).map((e, k) => ({
          x: p.pos.x + (k - 1) * 40, y: p.pos.y - 60, target: e, hit: false,
          ang: Math.atan2(e.pos.y - (p.pos.y - 60), e.pos.x - (p.pos.x + (k - 1) * 40)),
        }));
        st.phase = 'flight'; st.t = 0;
        fe.cue(st.id, 'travel');
      }
    } else if (st.phase === 'flight') {
      let allArrived = true;
      for (const nd of st.objects.needles) {
        if (nd.hit) continue;
        const e = nd.target;
        if (!e || e.hp <= 0) { nd.hit = true; continue; }
        const dx = e.pos.x - nd.x, dy = e.pos.y - nd.y;
        const dd = Math.hypot(dx, dy) || 1;
        const step = m.needles.speed * dt;
        if (dd <= step + (e.radius || 18)) { nd.hit = true; nd.hx = e.pos.x; nd.hy = e.pos.y; }
        else {
          // TARGETING PASS: η βελόνα ΚΡΑΤΑΕΙ homing — «phantom needle που κυνηγά τον πιο
          // δυνατό» ΕΙΝΑΙ το concept. Αυτό που έφυγε είναι το ΤΕΛΕΙΟ κλείδωμα: ήταν
          // dir = normalize(target - pos) κάθε frame, χωρίς αδράνεια. Τώρα στρίβει το πολύ
          // NEEDLE_TURN rad/s, οπότε ένας εχθρός που κόβει απότομα την κάνει να προσπεράσει.
          let da = Math.atan2(dy, dx) - nd.ang;
          while (da >  Math.PI) da -= Math.PI * 2;
          while (da < -Math.PI) da += Math.PI * 2;
          const maxTurn = NEEDLE_TURN * dt;
          nd.ang += Math.max(-maxTurn, Math.min(maxTurn, da));
          nd.x += Math.cos(nd.ang) * step; nd.y += Math.sin(nd.ang) * step;
          allArrived = false;
        }
      }
      // ΗΤΑΝ `allArrived || st.t > 1.4`: το 1.4 ήταν timer-commit — αν η βελόνα δεν προλάβαινε,
      // η ζημιά έμπαινε ΕΤΣΙ ΚΙ ΑΛΛΙΩΣ, από απόσταση, χωρίς άφιξη. Τηλεμεταφορά ζημιάς.
      // Τώρα το 2.2 είναι ΜΟΝΟ lifetime: ό,τι δεν έφτασε, ΧΑΝΕΤΑΙ (φιλτράρεται στο χτύπημα).
      if (allArrived || st.t > 2.2) {
        // ΤΑΥΤΟΧΡΟΝΟ χτύπημα
        const rt = fe.game.buildEngine;
        for (const nd of st.objects.needles) {
          const e = nd.target;
          if (!e || e.hp <= 0) continue;
          if (!nd.hit) continue;                       // δεν έφτασε -> δεν χτυπά. Καμία ζημιά εξ αποστάσεως.
          fe.dealDamage(st.id, e, A(m.needles.dmg, i));
          if (!fe.isBoss(e)) {
            const maxHp = e.maxHp || e.hp;
            // CHAOS DOCTRINE (assassin_clone): an ARMED shroud widens the execution window.
            const _needPct = m.needles.executeBelowPct
                           + (fe.chaos() ? (fe.game.doctrineExecBonus?.() || 0) : 0);
            if (e.hp > 0 && e.hp <= maxHp * _needPct) {
              fe.dealDamage(st.id, e, Math.min(m.needles.execCap, e.hp + 1));
            }
          } else if (rt && rt._status && typeof e.takeHit === 'function') {
            // boss shred window (canonical BE status channel)
            const cur = rt._status.get(e) || {};
            cur.shred = m.bossShred.durS;
            rt._status.set(e, cur);
          }
          // poison burst + chains
          for (const e2 of fe.near(e.pos.x, e.pos.y, m.burst.radius)) {
            if (e2 !== e) fe.dealDamage(st.id, e2, A(m.burst.dmg, i));
          }
          let chains = Math.min(m.caps.chainsPerBurst, A(m.chains.count, i));
          const hitSet = new Set([e]);
          let cx = e.pos.x, cy = e.pos.y;
          const chDmg = A(m.chains.dmg, i) * (fe.chaos() ? (d.chaos.chainDmgMult || 1) : 1);
          while (chains-- > 0) {
            const nxt = fe.nearestTo(cx, cy, hitSet);
            if (!nxt || dist2(cx, cy, nxt.pos.x, nxt.pos.y) > m.chains.range ** 2) break;
            fe.dealDamage(st.id, nxt, chDmg);
            fe.beam(cx, cy, nxt.pos.x, nxt.pos.y, 0.2, '#b9ff6b', 3.5);
            hitSet.add(nxt); cx = nxt.pos.x; cy = nxt.pos.y;
          }
          fe.flash(e.pos.x, e.pos.y, m.burst.radius, 0.35, d.palette.glow);
        }
        fe.cue(st.id, 'impact');
        // T3 CONTINGENCY: restrike όσων επέζησαν
        if (fe.tierOf(st.id) >= 3) {
          st.objects.restrike = { t: 0, targets: st.objects.needles.map(n => n.target).filter(e => e && e.hp > 0) };
        }
        st.objects.needles = [];
        st.phase = 'aftermath'; st.t = 0;
      }
    } else if (st.phase === 'aftermath') {
      const rs = st.objects.restrike;
      if (rs) {
        rs.t += dt;
        if (rs.t >= FUSION_DEFS[st.id].t3.restrike.delayS) {
          for (const e of rs.targets) {
            if (e && e.hp > 0) {
              fe.dealDamage(st.id, e, A(m.needles.dmg, i) * FUSION_DEFS[st.id].t3.restrike.dmgMult);
              fe.beam(fe.game.player.pos.x, fe.game.player.pos.y, e.pos.x, e.pos.y, 0.25, d.palette.core, 4);
            }
          }
          st.objects.restrike = null;
          fe.cue(st.id, 'aftermath');
        }
      } else if (st.t >= 0.5) {
        st.objects.marks = [];
        st.phase = 'cooldown'; st.cd = A(m.cooldown, i) * cdMult; st.cycle++;
      }
    }
  },
  draw(fe, ctx, st) {
    const d = FUSION_DEFS[st.id];
    // sigils πάνω από τους μαρκαρισμένους
    if (st.phase === 'sigil' || st.phase === 'flight') {
      for (const e of st.objects.marks || []) {
        if (!e || e.hp <= 0) continue;
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.85;
        ctx.strokeStyle = d.palette.glow; ctx.lineWidth = 2.5;
        const r = (e.radius || 18) + 14;
        ctx.beginPath(); ctx.arc(e.pos.x, e.pos.y, r, fe._t * 4, fe._t * 4 + Math.PI * 1.5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(e.pos.x - r * 0.5, e.pos.y); ctx.lineTo(e.pos.x + r * 0.5, e.pos.y); ctx.stroke();
        ctx.restore();
      }
    }
    for (const nd of st.objects.needles || []) {
      if (nd.hit || !nd.target) continue;
      fe.drawArt(ctx, st.id, nd.x, nd.y, 74, nd.ang || 0, 0.9);   // δείχνει την ΠΡΑΓΜΑΤΙΚΗ πορεία
    }
  },
};

// ── 15 DIE OF FATES: rolling quantum die → per-bounce fate faces (+T3 jackpot)
FUSION_EXECUTORS.fus_die_of_fates = {
  start(fe, st) { st.phase = 'cooldown'; st.cd = 1.4; st.objects.fields = []; },
  _face(fe, st, k, x, y, dmgMult) {
    const d = FUSION_DEFS[st.id], m = d.mech, i = fe.ti(st.id);
    const faceDmgMult = dmgMult * (fe.chaos() ? (d.chaos.faceDmgMult || 1) : 1);
    if (k === 0) {          // needle nova
      // TARGETING PASS: ήταν hitscan — nearestTo και ζημιά στην ΙΔΙΑ γραμμή, το beam μετά.
      // Τώρα το ζάρι σημαδεύει ΣΗΜΕΙΑ ΕΔΑΦΟΥΣ (εκεί που στέκονται τώρα) και οι βελόνες
      // προσγειώνονται 0.26s αργότερα. Η επιλογή στόχου μένει — είναι fusion τύχης.
      const f = m.faces.needleNova;
      const hitSet = new Set();
      for (let n = 0; n < Math.min(m.caps.novaNeedles, f.count); n++) {
        const tgt = fe.nearestTo(x, y, hitSet);
        if (!tgt || dist2(x, y, tgt.pos.x, tgt.pos.y) > f.range ** 2) break;
        hitSet.add(tgt);
        const gx = tgt.pos.x, gy = tgt.pos.y, nR = 46, nDmg = A(f.dmg, i) * faceDmgMult;
        fe.beam(x, y, gx, gy, 0.26, d.palette.glow, 3.5);
        fe.strike(gx, gy, nR, 0.26, d.palette.glow, () => {
          for (const e2 of fe.near(gx, gy, nR)) { fe.dealDamage(st.id, e2, nDmg); break; }
        });
      }
    } else if (k === 1) {   // phase rift (field)
      if (st.objects.fields.length < m.caps.fieldsAlive) {
        st.objects.fields.push({ kind: 'rift', x, y, t: 0, tick: 0, dmgMult: faceDmgMult });
      }
    } else if (k === 2) {   // lance volley
      // TARGETING PASS: ήταν nearestTo ανά λόγχη ΧΩΡΙΣ κανένα όριο απόστασης, hitscan στο ίδιο
      // frame. Τώρα είναι ΣΤΑΘΕΡΗ ΒΕΝΤΑΛΙΑ γύρω από το ζάρι, με 0.28s προειδοποίηση.
      const f = m.faces.lanceVolley;
      const base = (k * 1.7) + (st.objects.die ? st.objects.die.bounce * 0.9 : 0);
      for (let n = 0; n < f.count; n++) {
        const ang = base + (n / Math.max(1, f.count)) * Math.PI * 2;
        const cosA = Math.cos(ang), sinA = Math.sin(ang);
        fe.beam(x, y, x + cosA * f.range, y + sinA * f.range, 0.28, d.palette.core, 5);
        fe.strike(x + cosA * f.range * 0.5, y + sinA * f.range * 0.5, f.range * 0.5, 0.28,
                  d.palette.core, () => {
          let hits = 0;
          for (const e of fe.targets()) {
            const dx = e.pos.x - x, dy = e.pos.y - y;
            const along = dx * cosA + dy * sinA, side = Math.abs(-dx * sinA + dy * cosA);
            if (along > 0 && along < f.range && side < 20 + (e.radius || 18)) {
              fe.dealDamage(st.id, e, A(f.dmg, i) * faceDmgMult);
              if (++hits >= f.pierce) break;
            }
          }
        });
      }
    } else {                // slow field
      if (st.objects.fields.length < m.caps.fieldsAlive) {
        st.objects.fields.push({ kind: 'slow', x, y, t: 0, tick: 0, dmgMult: faceDmgMult });
      }
    }
  },
  update(fe, st, dt) {
    fe.tickShowcase(st, dt);
    const d = FUSION_DEFS[st.id], m = d.mech, i = fe.ti(st.id);
    const p = fe.game.player;
    st.t += dt;
    if (st.phase === 'cooldown') {
      st.cd -= dt;
      if (st.cd <= 0) { st.phase = 'charge'; st.t = 0; fe.cue(st.id, 'charge'); }
    } else if (st.phase === 'charge') {
      if (st.t >= 0.5) {
        const den = fe.densest(200, fe._t);
        const ang = Math.atan2(den.y - p.pos.y, den.x - p.pos.x);
        const bounces = A(m.bounces, i) + (fe.chaos() ? (d.chaos.extraBounce || 0) : 0);
        st.objects.die = { x: p.pos.x, y: p.pos.y, ang, t: 0, bounce: 0, bounces, faceIdx: 0 };
        st.phase = 'roll'; st.t = 0;
        fe.cue(st.id, 'travel');
      }
    } else if (st.phase === 'roll') {
      const D2 = st.objects.die;
      D2.t += dt;
      D2.x += Math.cos(D2.ang) * m.rollSpeed * dt;
      D2.y += Math.sin(D2.ang) * m.rollSpeed * dt;
      if (D2.t >= m.bounceGapS) {
        D2.t = 0;
        D2.bounce++;
        // crush
        for (const e of fe.near(D2.x, D2.y, m.crush.radius)) fe.dealDamage(st.id, e, A(m.crush.dmg, i));
        fe.flash(D2.x, D2.y, m.crush.radius, 0.35, d.palette.glow);
        fe.game.screenShake?.trigger?.(6, 0.25);
        fe.cue(st.id, 'impact');
        const isFinal = D2.bounce >= D2.bounces;
        if (isFinal && fe.tierOf(st.id) >= 3 && d.t3.jackpotFinalBounce) {
          for (let k = 0; k < 4; k++) this._face(fe, st, k, D2.x, D2.y, d.t3.jackpotDmgMult);
        } else {
          this._face(fe, st, D2.faceIdx % 4, D2.x, D2.y, 1);
          D2.faceIdx++;
        }
        if (isFinal) {
          fe.ring(D2.x, D2.y, 30, 200, 0.5, d.palette.core, 6);
          st.objects.die = null;
          st.phase = 'aftermath'; st.t = 0;
          fe.cue(st.id, 'aftermath');
        } else {
          // νέα κατεύθυνση προς τον επόμενο πυκνό στόχο
          const den = fe.densest(180, fe._t + D2.bounce);
          D2.ang = Math.atan2(den.y - D2.y, den.x - D2.x);
        }
      }
    } else if (st.phase === 'aftermath') {
      if (!st.objects.fields.length && st.t >= 0.4) {
        st.phase = 'cooldown'; st.cd = A(m.cooldown, i); st.cycle++;
      }
    }
    // fields lifecycle
    for (let k = st.objects.fields.length - 1; k >= 0; k--) {
      const f = st.objects.fields[k];
      const cfg = f.kind === 'rift' ? m.faces.phaseRift : m.faces.slowField;
      f.t += dt; f.tick += dt;
      if (f.tick >= cfg.tickS) {
        f.tick = 0;
        for (const e of fe.near(f.x, f.y, cfg.radius)) {
          fe.dealDamage(st.id, e, A(cfg.tickDmg, i) * f.dmgMult);
          if (f.kind === 'slow' && !fe.isBoss(e) && e.vel) {
            const slow = cfg.slow + (fe.chaos() ? (d.chaos.slowBonus || 0) : 0);
            e.vel.x *= (1 - slow * 0.5); e.vel.y *= (1 - slow * 0.5);
          }
        }
      }
      if (f.t >= cfg.durS) st.objects.fields.splice(k, 1);
    }
  },
  draw(fe, ctx, st) {
    const d = FUSION_DEFS[st.id], m = d.mech;
    const D2 = st.objects.die;
    if (D2) {
      fe.drawArt(ctx, st.id, D2.x, D2.y, 150, fe._t * 3.2, 1);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.4;
      ctx.strokeStyle = d.palette.glow; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(D2.x, D2.y, m.crush.radius, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    for (const f of st.objects.fields || []) {
      const cfg = f.kind === 'rift' ? m.faces.phaseRift : m.faces.slowField;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.4 * (1 - f.t / cfg.durS);
      ctx.strokeStyle = f.kind === 'rift' ? d.palette.glow : '#9be8ff';
      ctx.lineWidth = 3.5;
      ctx.setLineDash(f.kind === 'slow' ? [12, 10] : []);
      ctx.beginPath(); ctx.arc(f.x, f.y, cfg.radius, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  },
};

// ── 16 EVENT HORIZON ROULETTE: wheel fortress + pull + ricochet payouts (+T3 double)
FUSION_EXECUTORS.fus_event_horizon_roulette = {
  start(fe, st) { st.phase = 'cooldown'; st.cd = 1.5; st.objects.discs = []; },
  _payoutDisc(fe, st, ang, dmgMult) {
    const d = FUSION_DEFS[st.id], m = d.mech, i = fe.ti(st.id);
    const p = fe.game.player;
    st.objects.discs.push({
      x: p.pos.x + Math.cos(ang) * m.wheel.radius,
      y: p.pos.y + Math.sin(ang) * m.wheel.radius,
      bouncesLeft: m.payout.bounces, target: null, dmgMult, t: 0, hitSet: new Set(), ang,
    });
  },
  update(fe, st, dt) {
    fe.tickShowcase(st, dt);
    const d = FUSION_DEFS[st.id], m = d.mech, i = fe.ti(st.id);
    const p = fe.game.player;
    st.t += dt;
    if (st.phase === 'cooldown') {
      st.cd -= dt;
      if (st.cd <= 0) {
        st.objects.wheel = { t: 0, tick: 0, payT: 0, spin: 0 };
        st.phase = 'wheel'; st.t = 0;
        fe.cue(st.id, 'manifest');
      }
    } else if (st.phase === 'wheel') {
      const W = st.objects.wheel;
      const durS = A(m.durS, i);
      W.t += dt; W.tick += dt; W.payT += dt;
      W.spin += m.wheel.spinRadPerS * dt;
      const pullMult = fe.chaos() ? (d.chaos.pullMult || 1) : 1;
      for (const e of fe.near(p.pos.x, p.pos.y, m.wheel.radius + 150)) {
        const dd = Math.hypot(e.pos.x - p.pos.x, e.pos.y - p.pos.y) || 1;
        if (!fe.isBoss(e) && dd > m.wheel.radius * 0.6) {
          // έλξη ΠΑΝΩ στη στεφάνη
          const dirx = (e.pos.x - p.pos.x) / dd, diry = (e.pos.y - p.pos.y) / dd;
          const toRim = m.wheel.radius - dd;
          const k = Math.min(Math.abs(toRim), m.wheel.pullPerS * pullMult * dt) * Math.sign(toRim);
          e.pos.x += dirx * k; e.pos.y += diry * k;
        }
      }
      if (W.tick >= m.wheel.rimTickS) {
        W.tick = 0;
        for (const e of fe.near(p.pos.x, p.pos.y, m.wheel.radius + 50)) {
          const dd = Math.hypot(e.pos.x - p.pos.x, e.pos.y - p.pos.y);
          if (Math.abs(dd - m.wheel.radius) < 40 + (e.radius || 18)) {
            fe.dealDamage(st.id, e, A(m.wheel.rimDmg, i));
          }
        }
      }
      const payEvery = m.payout.everyS * (fe.chaos() ? (d.chaos.payoutEveryMult || 1) : 1);
      if (W.payT >= payEvery && st.objects.discs.length < m.caps.discsAlive) {
        W.payT = 0;
        const ang = W.spin;
        this._payoutDisc(fe, st, ang, 1);
        if (fe.tierOf(st.id) >= 3 && d.t3.doublePayout && st.objects.discs.length < m.caps.discsAlive) {
          this._payoutDisc(fe, st, ang + Math.PI, d.t3.secondDiscDmgMult);
        }
        fe.cue(st.id, 'travel');
      }
      if (W.t >= durS) {
        // TELEGRAPHED: το collapse έσκαγε στο frame που έληγε ο τροχός. Τώρα το κέντρο
        // ΚΛΕΙΔΩΝΕΙ εκεί που ήταν ο παίκτης και προειδοποιεί 0.38s.
        const wx = p.pos.x, wy = p.pos.y, wR = m.collapse.radius, wDmg = A(m.collapse.dmg, i);
        fe.ring(wx, wy, m.wheel.radius, 20, 0.5, d.palette.glow, 8);
        fe.strike(wx, wy, wR, 0.38, d.palette.glow, () => {
          for (const e of fe.near(wx, wy, wR)) fe.dealDamage(st.id, e, wDmg);
        });
        fe.cue(st.id, 'aftermath');
        st.objects.wheel = null;
        st.phase = 'cooldown'; st.cd = A(m.cooldown, i); st.cycle++;
      }
    }
    // discs: ricochet ανάμεσα σε στόχους
    for (let k = st.objects.discs.length - 1; k >= 0; k--) {
      const ds = st.objects.discs[k];
      ds.t += dt;
      if (!ds.target || ds.target.hp <= 0) {
        ds.target = fe.nearestTo(ds.x, ds.y, ds.hitSet);
        if (!ds.target || ds.t > 4) { st.objects.discs.splice(k, 1); continue; }
      }
      const e = ds.target;
      const dx = e.pos.x - ds.x, dy = e.pos.y - ds.y;
      const dd = Math.hypot(dx, dy) || 1;
      const step = m.payout.speed * dt;
      // TARGETING PASS: ο δίσκος ΚΡΑΤΑΕΙ homing — «ricochet chip» ΕΙΝΑΙ το concept. Έφυγε το
      // τέλειο κλείδωμα (dir = normalize(target-pos) κάθε frame, μηδέν αδράνεια, αδύνατο να
      // αστοχήσει). Τώρα στρίβει το πολύ CHIP_TURN rad/s και μπορεί να προσπεράσει.
      {
        let da = Math.atan2(dy, dx) - ds.ang;
        while (da >  Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        const maxTurn = CHIP_TURN * dt;
        ds.ang += Math.max(-maxTurn, Math.min(maxTurn, da));
      }
      if (dd <= step + (e.radius || 18)) {
        fe.dealDamage(st.id, e, A(m.payout.discDmg, i) * ds.dmgMult);
        // bridge arc: τροχός ↔ δίσκος
        for (const e2 of fe.near((ds.x + p.pos.x) / 2, (ds.y + p.pos.y) / 2, 80)) {
          fe.dealDamage(st.id, e2, A(m.bridge.dmg, i) * ds.dmgMult);
        }
        fe.beam(p.pos.x, p.pos.y, ds.x, ds.y, 0.2, d.palette.glow, 3);
        fe.flash(e.pos.x, e.pos.y, 60, 0.25, d.palette.glow);
        fe.cue(st.id, 'impact');
        ds.hitSet.add(e);
        ds.target = null;
        if (--ds.bouncesLeft <= 0) st.objects.discs.splice(k, 1);
      } else {
        ds.x += Math.cos(ds.ang) * step; ds.y += Math.sin(ds.ang) * step;
      }
    }
  },
  draw(fe, ctx, st) {
    const d = FUSION_DEFS[st.id], m = d.mech, i = fe.ti(st.id);
    const p = fe.game.player;
    const W = st.objects.wheel;
    if (W) {
      const orbs = Math.min(m.caps.orbs, A(m.wheel.orbs, i) + (fe.chaos() ? (d.chaos.extraOrb || 0) : 0));
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = d.palette.glow; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(p.pos.x, p.pos.y, m.wheel.radius, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      for (let k = 0; k < orbs; k++) {
        const a = W.spin + (k / orbs) * Math.PI * 2;
        const x = p.pos.x + Math.cos(a) * m.wheel.radius, y = p.pos.y + Math.sin(a) * m.wheel.radius;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = k % 2 ? d.palette.glow : '#ffd447';
        ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      fe.drawArt(ctx, st.id, p.pos.x, p.pos.y - 140, 120, 0, 0.55);
    }
    for (const ds of st.objects.discs || []) {
      fe.drawArt(ctx, st.id, ds.x, ds.y, 56, fe._t * 6, 0.95);
    }
  },
};

// ── 17 WALL OF SOUND: deployed amp towers → beat waves → 4th-beat red solo (+T3 encore)
FUSION_EXECUTORS.fus_wall_of_sound = {
  start(fe, st) { st.phase = 'cooldown'; st.cd = 1.5; },
  _soloSweep(fe, st, S, dmgMult) {
    const d = FUSION_DEFS[st.id], m = d.mech, i = fe.ti(st.id);
    const dmg = A(m.solo.dmg, i) * dmgMult;
    const range = A(m.waves.range, i);
    // TELEGRAPHED: το solo έσκαγε στο ίδιο frame με το beat και το beam ζωγραφιζόταν ΜΕΤΑ.
    // Τώρα ο διάδρομος ανάβει πρώτος και το solo κόβει 0.32s αργότερα, σε ΚΛΕΙΔΩΜΕΝΗ γραμμή.
    const sx = S.x, sy = S.y, scos = S.cos, ssin = S.sin;
    fe.strike(sx + scos * range * 0.5, sy + ssin * range * 0.5, range * 0.5, 0.32,
              d.palette.glow, () => {
    for (const e of fe.targets()) {
      const dx = e.pos.x - sx, dy = e.pos.y - sy;
      const along = dx * scos + dy * ssin;
      const side = -dx * ssin + dy * scos;
      if (along > -40 && along < range && Math.abs(side) < m.solo.width * 0.5 + (e.radius || 18)) {
        fe.dealDamage(st.id, e, dmg);
      }
    }
      fe.flash(sx + scos * range * 0.4, sy + ssin * range * 0.4, 140, 0.4, d.palette.glow);
    });
    // ΠΡΟΕΙΔΟΠΟΙΗΣΗ πρώτα (ήταν μετά τη ζημιά): η κόκκινη γραμμή ανάβει τώρα, το solo κόβει μετά.
    fe.beam(sx - ssin * m.solo.width * 0.5, sy + scos * m.solo.width * 0.5,
            sx + scos * range - ssin * -m.solo.width * 0.5, sy + ssin * range + scos * -m.solo.width * 0.5,
            0.4, d.palette.glow, 12);
  },
  update(fe, st, dt) {
    fe.tickShowcase(st, dt);
    const d = FUSION_DEFS[st.id], m = d.mech, i = fe.ti(st.id);
    const p = fe.game.player;
    st.t += dt;
    if (st.phase === 'cooldown') {
      st.cd -= dt;
      if (st.cd <= 0) { st.phase = 'charge'; st.t = 0; fe.cue(st.id, 'charge'); }
    } else if (st.phase === 'charge') {
      if (st.t >= 0.6) {
        // TARGETING PASS: η σκηνή κοιτάζει προς την κατεύθυνση του ΠΑΙΚΤΗ (ήταν densest(220)).
        const ang = fe.aimAngle();
        st.objects.stage = {
          x: p.pos.x, y: p.pos.y, cos: Math.cos(ang), sin: Math.sin(ang),
          t: 0, beatT: 0, beats: 0, bridgeT: 0,
        };
        st.phase = 'set'; st.t = 0;
        fe.cue(st.id, 'travel');
      }
    } else if (st.phase === 'set') {
      const S = st.objects.stage;
      const durS = A(m.durS, i) * (fe.chaos() ? (d.chaos.durMult || 1) : 1);
      const beatS = m.waves.beatS * (fe.chaos() ? (d.chaos.beatMult || 1) : 1);
      const soloEvery = fe.chaos() ? (d.chaos.soloEveryBeats || m.solo.everyBeats) : m.solo.everyBeats;
      S.t += dt; S.beatT += dt; S.bridgeT += dt;
      // HIT DELIVERY: το beat χτυπούσε ΟΛΟ τον διάδρομο (μέχρι 620px) σε ένα frame, ενώ το
      // draw ζωγράφιζε ένα κύμα να προχωράει — δηλαδή το ορατό κύμα ήταν καθαρά διακοσμητικό
      // και η ζημιά στα 600px έμπαινε ταυτόχρονα με τη ζημιά στο μέτωπο. Τώρα η ζημιά ΑΚΟΛΟΥΘΕΙ
      // το ορατό μέτωπο: ίδιος τύπος (range * beatT/beatS), οπότε ό,τι βλέπεις είναι ό,τι χτυπά.
      {
        const range = A(m.waves.range, i);
        const dmg = A(m.waves.dmg, i);
        const front = range * Math.min(1, S.beatT / beatS);
        const prevFront = range * Math.max(0, (S.beatT - dt) / beatS);
        if (!S.waveHit) S.waveHit = new Set();
        if (front > prevFront) {
          for (const e of fe.targets()) {
            if (S.waveHit.has(e)) continue;
            const dx = e.pos.x - S.x, dy = e.pos.y - S.y;
            const along = dx * S.cos + dy * S.sin;
            const side = -dx * S.sin + dy * S.cos;
            if (along > prevFront && along <= front && Math.abs(side) < m.waves.width * 0.5 + (e.radius || 18)) {
              S.waveHit.add(e);
              fe.dealDamage(st.id, e, dmg);
              if (!fe.isBoss(e)) {                     // push προς τα εμπρός
                e.pos.x += S.cos * m.waves.push * dt * 6;
                e.pos.y += S.sin * m.waves.push * dt * 6;
              }
            }
          }
        }
      }
      if (S.beatT >= beatS) {
        S.beatT = 0; S.beats++;
        S.waveHit = new Set();                         // νέο κύμα -> καθαρό set
        if (S.beats % soloEvery === 0) {
          this._soloSweep(fe, st, S, 1);
          fe.cue(st.id, 'impact');
        }
      }
      if (S.bridgeT >= m.bridge.tickS) {
        S.bridgeT = 0;
        // ion bridge ανάμεσα στους πύργους (κάθετο segment στο μέτωπο)
        const t1x = S.x - S.sin * m.towerGap * 0.5, t1y = S.y + S.cos * m.towerGap * 0.5;
        const t2x = S.x + S.sin * m.towerGap * 0.5, t2y = S.y - S.cos * m.towerGap * 0.5;
        for (const e of fe.targets()) {
          const vx = t2x - t1x, vy = t2y - t1y;
          const L2 = vx * vx + vy * vy || 1;
          let tt = ((e.pos.x - t1x) * vx + (e.pos.y - t1y) * vy) / L2;
          tt = Math.max(0, Math.min(1, tt));
          const px2 = t1x + vx * tt, py2 = t1y + vy * tt;
          if (dist2(e.pos.x, e.pos.y, px2, py2) < (26 + (e.radius || 18)) ** 2) {
            fe.dealDamage(st.id, e, A(m.bridge.dmg, i));
          }
        }
      }
      if (S.t >= durS) {
        // screech γύρω από κάθε πύργο
        const t1x = S.x - S.sin * m.towerGap * 0.5, t1y = S.y + S.cos * m.towerGap * 0.5;
        const t2x = S.x + S.sin * m.towerGap * 0.5, t2y = S.y - S.cos * m.towerGap * 0.5;
        // TELEGRAPHED: το screech προειδοποιεί 0.35s σε κάθε πύργο πριν σκάσει.
        for (const [tx2, ty2] of [[t1x, t1y], [t2x, t2y]]) {
          const sR = m.screech.radius, sDmg = A(m.screech.dmg, i);
          fe.ring(tx2, ty2, 30, sR, 0.45, d.palette.glow, 6);
          fe.strike(tx2, ty2, sR, 0.35, d.palette.glow, () => {
            for (const e of fe.near(tx2, ty2, sR)) fe.dealDamage(st.id, e, sDmg);
          });
        }
        // T3 ENCORE: full-length solo και προς τις δύο κατευθύνσεις
        if (fe.tierOf(st.id) >= 3 && d.t3.encore.bothDirections) {
          this._soloSweep(fe, st, S, d.t3.encore.dmgMult);
          const back = { x: S.x, y: S.y, cos: -S.cos, sin: -S.sin };
          this._soloSweep(fe, st, back, d.t3.encore.dmgMult);
        }
        fe.cue(st.id, 'aftermath');
        st.objects.stage = null;
        st.phase = 'cooldown'; st.cd = A(m.cooldown, i); st.cycle++;
      }
    }
  },
  draw(fe, ctx, st) {
    const d = FUSION_DEFS[st.id], m = d.mech, i = fe.ti(st.id);
    const S = st.objects.stage;
    if (!S) return;
    const t1x = S.x - S.sin * m.towerGap * 0.5, t1y = S.y + S.cos * m.towerGap * 0.5;
    const t2x = S.x + S.sin * m.towerGap * 0.5, t2y = S.y - S.cos * m.towerGap * 0.5;
    fe.drawArt(ctx, st.id, t1x, t1y - 30, 130, 0, 0.95);
    fe.drawArt(ctx, st.id, t2x, t2y - 30, 130, 0, 0.95);
    // ion bridge + beat κύματα
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = d.palette.glow; ctx.lineWidth = 4;
    ctx.globalAlpha = 0.6 + Math.sin(fe._t * 8) * 0.2;
    ctx.beginPath(); ctx.moveTo(t1x, t1y - 60); ctx.lineTo(t2x, t2y - 60); ctx.stroke();
    const k = (S.beatT / m.waves.beatS);
    const range = A(m.waves.range, i);
    ctx.globalAlpha = 0.5 * (1 - k);
    ctx.lineWidth = 8;
    const wx = S.x + S.cos * range * k, wy = S.y + S.sin * range * k;
    ctx.beginPath();
    ctx.moveTo(wx - S.sin * m.waves.width * 0.5, wy + S.cos * m.waves.width * 0.5);
    ctx.lineTo(wx + S.sin * m.waves.width * 0.5, wy - S.cos * m.waves.width * 0.5);
    ctx.stroke();
    ctx.restore();
  },
};

// ── 18 BASS SINGULARITY: inhale/drop rhythm core + roadie echoes (+T3 shock ring)
FUSION_EXECUTORS.fus_bass_singularity = {
  start(fe, st) { st.phase = 'cooldown'; st.cd = 1.6; st.objects.rings = []; },
  update(fe, st, dt) {
    fe.tickShowcase(st, dt);
    const d = FUSION_DEFS[st.id], m = d.mech, i = fe.ti(st.id);
    st.t += dt;
    if (st.phase === 'cooldown') {
      st.cd -= dt;
      if (st.cd <= 0) { st.phase = 'charge'; st.t = 0; fe.cue(st.id, 'charge'); }
    } else if (st.phase === 'charge') {
      if (st.t >= 0.6) {
        // TARGETING PASS: ο πυρήνας πέφτει ΜΠΡΟΣΤΑ ΣΤΟΝ ΠΑΙΚΤΗ (ήταν densest(220)).
        const den = fe.aimPoint(280);
        st.objects.core = { x: den.x, y: den.y, t: 0, rhythmT: 0, mode: 'inhale', drops: 0, tick: 0, roadieT: 0 };
        st.phase = 'core'; st.t = 0;
        fe.cue(st.id, 'travel');
      }
    } else if (st.phase === 'core') {
      const C = st.objects.core;
      const durS = A(m.durS, i);
      const rhythmS = m.rhythmS * (fe.chaos() ? (d.chaos.rhythmMult || 1) : 1);
      C.t += dt; C.rhythmT += dt; C.tick += dt; C.roadieT += dt;
      if (C.mode === 'inhale') {
        const R = A(m.inhale.radius, i);
        const pull = m.inhale.pullPerS * (fe.chaos() ? (d.chaos.pullMult || 1) : 1);
        for (const e of fe.near(C.x, C.y, R)) fe.pull(e, C.x, C.y, pull, dt);
        if (C.tick >= m.inhale.tickS) {
          C.tick = 0;
          for (const e of fe.near(C.x, C.y, R)) fe.dealDamage(st.id, e, A(m.inhale.tickDmg, i));
        }
        if (C.rhythmT >= rhythmS) { C.rhythmT = 0; C.mode = 'drop'; }
      } else {
        // DROP — TELEGRAPHED. Ένα bass drop ΠΡΕΠΕΙ να ακούγεται πριν σκάσει: 0.30s build-up
        // στο κλειδωμένο κέντρο. Ήταν ένα frame, χωρίς καμία προειδοποίηση.
        const R = A(m.drop.radius, i);
        const cx2 = C.x, cy2 = C.y, dDmg = A(m.drop.dmg, i);
        fe.ring(cx2, cy2, 20, R, 0.4, d.palette.glow, 7);
        fe.strike(cx2, cy2, R, 0.30, d.palette.core, () => {
          for (const e of fe.near(cx2, cy2, R)) {
            fe.dealDamage(st.id, e, dDmg);
            if (!fe.isBoss(e)) {
              const dd = Math.hypot(e.pos.x - cx2, e.pos.y - cy2) || 1;
              e.pos.x += ((e.pos.x - cx2) / dd) * m.drop.push * 0.3;
              e.pos.y += ((e.pos.y - cy2) / dd) * m.drop.push * 0.3;
            }
          }
          fe.game.screenShake?.trigger?.(7, 0.3);
        });
        fe.cue(st.id, 'impact');
        C.drops++;
        // T3: κάθε δεύτερο drop → ταξιδεύον δαχτυλίδι
        if (fe.tierOf(st.id) >= 3 && C.drops % 2 === 0) {
          st.objects.rings.push({ x: C.x, y: C.y, r: 40, hitSet: new Set() });
        }
        C.mode = 'inhale'; C.rhythmT = 0;
      }
      if (C.roadieT >= m.roadies.pulseS) {
        C.roadieT = 0;
        for (let k = 0; k < m.caps.roadies; k++) {
          const a = fe._t * 1.2 + k * Math.PI;
          const rx = C.x + Math.cos(a) * 190, ry = C.y + Math.sin(a) * 190;
          for (const e of fe.near(rx, ry, m.roadies.pulseRadius)) {
            fe.dealDamage(st.id, e, A(m.roadies.pulseDmg, i));
          }
          fe.ring(rx, ry, 14, m.roadies.pulseRadius, 0.3, '#9db4ff', 3);
        }
      }
      if (C.t >= durS) {
        // TELEGRAPHED 0.45s: το τελικό boom προειδοποιεί στο κλειδωμένο κέντρο.
        const boomDmg = A(m.boom.dmg, i) * (fe.chaos() ? (d.chaos.boomDmgMult || 1) : 1);
        const bx3 = C.x, by3 = C.y, bR3 = m.boom.radius;
        fe.strike(bx3, by3, bR3, 0.45, d.palette.core, () => {
          for (const e of fe.near(bx3, by3, bR3)) fe.dealDamage(st.id, e, boomDmg);
          fe.flash(bx3, by3, bR3 * 0.8, 0.55, d.palette.glow);
          fe.game.screenShake?.trigger?.(12, 0.5);
        });
        fe.cue(st.id, 'aftermath');
        st.objects.core = null;
        st.phase = 'cooldown'; st.cd = A(m.cooldown, i); st.cycle++;
      }
    }
    // T3 rings
    for (let k = st.objects.rings.length - 1; k >= 0; k--) {
      const r = st.objects.rings[k];
      r.r += d.t3.ring.speed * dt;
      for (const e of fe.near(r.x, r.y, r.r + 40)) {
        if (r.hitSet.has(e)) continue;
        const dd = Math.hypot(e.pos.x - r.x, e.pos.y - r.y);
        if (Math.abs(dd - r.r) < d.t3.ring.width + (e.radius || 18)) {
          fe.dealDamage(st.id, e, d.t3.ring.dmg);
          r.hitSet.add(e);
        }
      }
      if (r.r >= d.t3.ring.maxR) st.objects.rings.splice(k, 1);
    }
  },
  draw(fe, ctx, st) {
    const d = FUSION_DEFS[st.id], m = d.mech, i = fe.ti(st.id);
    const C = st.objects.core;
    if (C) {
      const R = A(m.inhale.radius, i);
      const k = C.rhythmT / m.rhythmS;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = d.palette.glow; ctx.lineWidth = 4;
      const rr = C.mode === 'inhale' ? R * (1 - k * 0.5) : R * 0.5 * (1 + k);
      ctx.beginPath(); ctx.arc(C.x, C.y, rr, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      fe.drawArt(ctx, st.id, C.x, C.y, 190 * (C.mode === 'drop' ? 1.1 : 1), 0, 0.95);
      for (let k2 = 0; k2 < m.caps.roadies; k2++) {
        const a = fe._t * 1.2 + k2 * Math.PI;
        fe.drawArt(ctx, st.id, C.x + Math.cos(a) * 190, C.y + Math.sin(a) * 190, 58, 0, 0.7);
      }
    }
    for (const r of st.objects.rings || []) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.6 * (1 - r.r / FUSION_DEFS[st.id].t3.ring.maxR);
      ctx.strokeStyle = d.palette.glow; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  },
};

// ── 19 THOUSAND FIST VERDICT: sequential fist corridor → null uppercut verdict (+T3)
FUSION_EXECUTORS.fus_thousand_fist_verdict = {
  start(fe, st) { st.phase = 'cooldown'; st.cd = 1.3; },
  update(fe, st, dt) {
    fe.tickShowcase(st, dt);
    const d = FUSION_DEFS[st.id], m = d.mech, i = fe.ti(st.id);
    const p = fe.game.player;
    const rt = fe.game.buildEngine;
    st.t += dt;
    const cdMult = fe.chaos() ? (d.chaos.cdMult || 1) : 1;
    if (st.phase === 'cooldown') {
      st.cd -= dt;
      if (st.cd <= 0) { st.phase = 'charge'; st.t = 0; fe.cue(st.id, 'charge'); }
    } else if (st.phase === 'charge') {
      if (st.t >= 0.5) {
        // TARGETING PASS: ο διάδρομος των γροθιών δείχνει προς τον ΠΑΙΚΤΗ (ήταν densest(200)).
        const ang = fe.aimAngle();
        const n = Math.min(m.caps.fists, A(m.fists.count, i) + (fe.chaos() ? (d.chaos.extraFist || 0) : 0));
        const len = A(m.corridorLen, i);
        const fists = [];
        for (let k = 0; k < n; k++) {
          const along = 90 + (len - 140) * (k / Math.max(1, n - 1));
          fists.push({ x: p.pos.x + Math.cos(ang) * along, y: p.pos.y + Math.sin(ang) * along, fired: false });
        }
        st.objects.run = { ang, fists, idx: 0, fT: 0, endX: p.pos.x + Math.cos(ang) * len, endY: p.pos.y + Math.sin(ang) * len, marked: new Set() };
        st.phase = 'corridor'; st.t = 0;
        fe.cue(st.id, 'travel');
      }
    } else if (st.phase === 'corridor') {
      const R = st.objects.run;
      R.fT += dt;
      if (R.fT >= m.fists.gapS) {
        R.fT = 0;
        if (R.idx < R.fists.length) {
          const F = R.fists[R.idx++];
          F.fired = true;
          // TELEGRAPHED 0.20s ανά γροθιά: η θέση είναι ήδη κλειδωμένη από τη σκόπευση, τώρα
          // ανάβει κιόλας πριν πέσει — ο εχθρός που προχωρά μέσα στον διάδρομο μπορεί να βγει.
          const fx = F.x, fy = F.y, fR = m.fists.radius, fDmg = A(m.fists.dmg, i);
          fe.strike(fx, fy, fR, 0.20, d.palette.glow, () => {
            for (const e of fe.near(fx, fy, fR)) {
              fe.dealDamage(st.id, e, fDmg);
              R.marked.add(e);
              // sanction mark στο canonical BE status channel (συνεργεί με _dealDamage)
              if (rt && rt._status && typeof e.takeHit === 'function') {
                const cur = rt._status.get(e) || {};
                cur.sanction = Math.max(cur.sanction || 0, 2.0);
                rt._status.set(e, cur);
              }
            }
            fe.flash(fx, fy, fR, 0.3, d.palette.glow);
            fe.game.screenShake?.trigger?.(5, 0.2);
          });
          fe.cue(st.id, 'impact');
        } else {
          // VERDICT: null uppercut στο τέλος του διαδρόμου
          const bonus = A(m.verdict.markedBonusPct, i) + (fe.chaos() ? (d.chaos.verdictBonusPct || 0) : 0);
          // TELEGRAPHED 0.55s — το πιο βαρύ χτύπημα του fusion, σε σημείο που είχε κλειδώσει
          // δευτερόλεπτα πριν. Το uppercut ήταν instant και το ring/flash έμπαιναν ΜΕΤΑ.
          const ex2 = R.endX, ey2 = R.endY, uR = m.uppercut.radius, uDmg = A(m.uppercut.dmg, i);
          fe.ring(ex2, ey2, 30, uR + 40, 0.55, d.palette.glow, 8);
          fe.strike(ex2, ey2, uR, 0.55, '#f0e6ff', () => {
          let kills = [];
          for (const e of fe.near(ex2, ey2, uR)) {
            const hpBefore = e.hp;
            fe.dealDamage(st.id, e, uDmg);
            if (R.marked.has(e) && e.hp > 0) {
              const maxHp = e.maxHp || hpBefore;
              fe.dealDamage(st.id, e, Math.min(m.verdict.cap, maxHp * bonus));
            }
            if (hpBefore > 0 && e.hp <= 0 && R.marked.has(e)) kills.push(e);
          }
          fe.flash(ex2, ey2, uR, 0.5, '#f0e6ff');
          fe.game.screenShake?.trigger?.(10, 0.4);
          // T3 UNANIMOUS RULING: τα marks μεταφέρονται
          if (fe.tierOf(st.id) >= 3) {
            let brands = 0;
            for (const dead of kills) {
              if (brands >= d.t3.sigilTransfer.cap) break;
              const nxt = fe.nearestTo(dead.pos.x, dead.pos.y, R.marked);
              if (nxt) {
                fe.dealDamage(st.id, nxt, d.t3.sigilTransfer.brandDmg);
                if (rt && rt._status && typeof nxt.takeHit === 'function') {
                  const cur = rt._status.get(nxt) || {};
                  cur.sanction = Math.max(cur.sanction || 0, 3.0);
                  rt._status.set(nxt, cur);
                }
                fe.beam(dead.pos.x, dead.pos.y, nxt.pos.x, nxt.pos.y, 0.3, '#ffd447', 3.5);
                brands++;
              }
            }
          }
          });
          fe.cue(st.id, 'aftermath');
          st.objects.run = null;
          st.phase = 'cooldown'; st.cd = A(m.cooldown, i) * cdMult; st.cycle++;
        }
      }
    }
  },
  draw(fe, ctx, st) {
    const d = FUSION_DEFS[st.id], m = d.mech;
    const R = st.objects.run;
    if (!R) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.3;
    ctx.strokeStyle = d.palette.glow; ctx.lineWidth = m.corridorWidth * 0.5; ctx.lineCap = 'round';
    const p = fe.game.player;
    ctx.beginPath(); ctx.moveTo(p.pos.x, p.pos.y); ctx.lineTo(R.endX, R.endY); ctx.stroke();
    ctx.restore();
    for (let k = 0; k < R.fists.length; k++) {
      const F = R.fists[k];
      const active = k === R.idx - 1;
      const upcoming = k >= R.idx;
      fe.drawArt(ctx, st.id, F.x, F.y, active ? 150 : 96, R.ang, active ? 1 : (upcoming ? 0.35 : 0.15));
    }
  },
};

// ── 20 AEGIS OF JUDGEMENT: guard ring → absorb+hold → counter barrage (+T3 slam)
FUSION_EXECUTORS.fus_aegis_of_judgement = {
  start(fe, st) { st.phase = 'cooldown'; st.cd = 1.4; },
  _barrage(fe, st, withSlam) {
    const d = FUSION_DEFS[st.id], m = d.mech, i = fe.ti(st.id);
    const p = fe.game.player;
    if (withSlam) {
      for (const e of fe.near(p.pos.x, p.pos.y, m.barrage.range + 80)) {
        fe.pull(e, p.pos.x, p.pos.y, d.t3.slamFirst.pullPerS, d.t3.slamFirst.durS);
      }
    }
    // TARGETING PASS: το barrage ήταν ΟΛΟ instant — nearestTo και dealDamage δύο γραμμές
    // απόσταση, N γροθιές σε ΕΝΑ frame, το beam ζωγραφιζόταν μετά. Τώρα είναι ΒΕΝΤΑΛΙΑ σε
    // σταθερές γωνίες γύρω από τον παίκτη (η ασπίδα χτυπά ΓΥΡΩ ΤΗΣ — δεν σημαδεύει κανέναν),
    // κάθε γροθιά προσγειώνεται σε κλειδωμένο σημείο 0.30s αργότερα.
    const fists = Math.min(m.caps.barrageFists, A(m.barrage.fists, i));
    const arcDmg = A(m.arcs.dmg, i) * (fe.chaos() ? (d.chaos.arcDmgMult || 1) : 1);
    const arcsN = A(m.arcs.count, i);
    const bDmg = A(m.barrage.dmg, i);
    const reach = m.barrage.range * 0.72, fistR = 74;
    const base = fe.aimAngle();
    const px1 = p.pos.x, py1 = p.pos.y;
    const spots = [];
    for (let k = 0; k < fists; k++) {
      const a = base + (k / fists) * Math.PI * 2;
      spots.push({ x: px1 + Math.cos(a) * reach, y: py1 + Math.sin(a) * reach });
      fe.beam(px1, py1, spots[k].x, spots[k].y, 0.30, d.palette.glow, 6);
    }
    for (let k = 0; k < spots.length; k++) {
      const s2 = spots[k];
      fe.strike(s2.x, s2.y, fistR, 0.30, d.palette.glow, () => {
        const victims = [];
        for (const e of fe.near(s2.x, s2.y, fistR)) {
          fe.dealDamage(st.id, e, bDmg);
          if (victims.length < arcsN + 1) victims.push(e);
        }
        // ion arcs ανάμεσα στα θύματα ΤΗΣ ΙΔΙΑΣ γροθιάς
        for (let q = 0; q + 1 < victims.length && q < arcsN; q++) {
          const a2 = victims[q], b2 = victims[q + 1];
          if (dist2(a2.pos.x, a2.pos.y, b2.pos.x, b2.pos.y) < m.arcs.range ** 2) {
            fe.dealDamage(st.id, a2, arcDmg);
            fe.dealDamage(st.id, b2, arcDmg);
            fe.beam(a2.pos.x, a2.pos.y, b2.pos.x, b2.pos.y, 0.22, d.palette.core, 3.5);
          }
        }
      });
    }
    fe.flash(px1, py1, m.barrage.range * 0.5, 0.45, d.palette.glow);
    fe.cue(st.id, 'impact');
  },
  update(fe, st, dt) {
    fe.tickShowcase(st, dt);
    const d = FUSION_DEFS[st.id], m = d.mech, i = fe.ti(st.id);
    const p = fe.game.player;
    st.t += dt;
    if (st.phase === 'cooldown') {
      st.cd -= dt;
      if (st.cd <= 0) {
        st.objects.ring = { t: 0, meter: 0, fills: 0, absorbT: 0, glowT: 0 };
        st.phase = 'guard'; st.t = 0;
        fe.cue(st.id, 'manifest');
      }
    } else if (st.phase === 'guard') {
      const R = st.objects.ring;
      const durS = A(m.durS, i);
      const meterFull = Math.max(3, A(m.meterFull, i) - (fe.chaos() ? (d.chaos.meterFullReduce || 0) : 0));
      R.t += dt; R.absorbT += dt;
      // HOLD: οι επιτιθέμενοι κρατιούνται στην ακτίνα του κλοιού (η άμυνα του fusion:
      // αναχαίτιση σωμάτων — ΔΕΝ αγγίζουμε το προστατευμένο player-damage gate)
      const absorbCap = A(m.ring.absorbCap, i);
      let held = 0;
      for (const e of fe.near(p.pos.x, p.pos.y, m.ring.radius)) {
        if (fe.isBoss(e) || held >= absorbCap) continue;
        held++;
        const dd = Math.hypot(e.pos.x - p.pos.x, e.pos.y - p.pos.y) || 1;
        const push = (m.ring.radius - dd) + 4;
        e.pos.x += ((e.pos.x - p.pos.x) / dd) * Math.min(push, m.ring.holdPerS * dt + 4);
        e.pos.y += ((e.pos.y - p.pos.y) / dd) * Math.min(push, m.ring.holdPerS * dt + 4);
      }
      // ABSORB: κάθε 0.5s, κάθε συγκρατημένος επιτιθέμενος φορτίζει τον μετρητή
      if (R.absorbT >= 0.5) {
        R.absorbT = 0;
        const touching = fe.near(p.pos.x, p.pos.y, m.ring.radius + 30).filter(e => !fe.isBoss(e)).length;
        if (touching > 0) {
          R.meter = Math.min(meterFull, R.meter + Math.min(touching, 4) * m.meterPerHit);
          fe.cue(st.id, 'charge');
        }
      }
      if (R.meter >= meterFull) {
        R.meter = 0;
        R.fills++;
        const withSlam = fe.tierOf(st.id) >= 3 && R.fills >= 2;
        this._barrage(fe, st, withSlam);
      }
      if (R.t >= durS) {
        st.objects.afterglow = { t: 0,
          dur: m.afterglow.durS * (fe.chaos() ? (d.chaos.afterglowDurMult || 1) : 1) };
        st.objects.ring = null;
        st.phase = 'afterglow'; st.t = 0;
        fe.cue(st.id, 'aftermath');
      }
    } else if (st.phase === 'afterglow') {
      const G = st.objects.afterglow;
      G.t += dt;
      // ο κλοιός συνεχίζει να κρατά αποστάσεις όσο σβήνει
      for (const e of fe.near(p.pos.x, p.pos.y, m.ring.radius * 0.9)) {
        if (!fe.isBoss(e)) fe.pull(e, p.pos.x + (e.pos.x - p.pos.x) * 3, p.pos.y + (e.pos.y - p.pos.y) * 3, m.ring.holdPerS * 0.6, dt);
      }
      if (G.t >= G.dur) {
        st.objects.afterglow = null;
        st.phase = 'cooldown'; st.cd = A(m.cooldown, i); st.cycle++;
      }
    }
  },
  draw(fe, ctx, st) {
    const d = FUSION_DEFS[st.id], m = d.mech, i = fe.ti(st.id);
    const p = fe.game.player;
    const R = st.objects.ring;
    if (R) {
      const meterFull = A(m.meterFull, i);
      const k = R.meter / meterFull;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = d.palette.glow; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(p.pos.x, p.pos.y, m.ring.radius, 0, Math.PI * 2); ctx.stroke();
      // hex segments
      for (let s = 0; s < 8; s++) {
        const a = fe._t * 0.8 + (s / 8) * Math.PI * 2;
        ctx.globalAlpha = 0.75;
        ctx.strokeStyle = d.palette.core; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(p.pos.x, p.pos.y, m.ring.radius, a, a + 0.34); ctx.stroke();
      }
      // meter arc
      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(p.pos.x, p.pos.y, m.ring.radius - 14, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); ctx.stroke();
      ctx.restore();
      fe.drawArt(ctx, st.id, p.pos.x, p.pos.y - m.ring.radius - 60, 110, 0, 0.7);
    }
    const G = st.objects.afterglow;
    if (G) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.4 * (1 - G.t / G.dur);
      ctx.strokeStyle = d.palette.glow; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(p.pos.x, p.pos.y, m.ring.radius * 0.9, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  },
};
