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
         fusionModeOk, fusionRecipeReady, CHAR_DISPLAY_NAMES }
  from './FusionCatalog.js?v=20260902020000';
import { FUSION_TAGS, WEAPON_DEFS } from './BuildEngine.js?v=20260902000000';

// Tag registration: το _dealDamage βλέπει fusion tags για DamageLog/RUNTIME_HOOKS.
for (const [fid, d] of Object.entries(FUSION_DEFS)) FUSION_TAGS[fid] = d.tags;

export const FUSION_EXECUTORS = {};

const SINGLETON_BOSS_KEYS = ['titanBoss', 'annihilatorBoss', 'bloodfangBoss',
                             'cyberSerpentBoss', 'cyberDragonBoss', 'doubleDemonsBoss'];
const FX_CAP = 60;

// ── μικρο-helpers ────────────────────────────────────────────────────────────────
const A = (v, i) => (Array.isArray(v) ? v[Math.max(0, Math.min(i, v.length - 1))] : v);
const dist2 = (x1, y1, x2, y2) => { const dx = x2 - x1, dy = y2 - y1; return dx * dx + dy * dy; };

export class FusionEngine {
  constructor(game) {
    this.game = game;
    this.active = new Map();      // fusionId -> state object (ένα ανά fusion, once per run)
    this.fx = [];                 // transient world-space fx (bounded FX_CAP)
    this._imgs = new Map();       // fusionId -> Image (lazy, _failed flag σε πραγματικό fail)
    this._t = 0;
    this._acquiredOrder = [];     // για το report/QA
  }

  // ── mode / eligibility (in-run layers) ─────────────────────────────────────────
  modeOk() { const g = this.game; return fusionModeOk(g) && !g.gameOver && !g.victory; }
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
    const im = this._imgs.get(fid);
    const k = size / Math.max(im.naturalWidth, im.naturalHeight);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.globalCompositeOperation = 'screen';
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    ctx.drawImage(im, -im.naturalWidth * k / 2, -im.naturalHeight * k / 2,
                  im.naturalWidth * k, im.naturalHeight * k);
    ctx.restore();
    return true;
  }
  addFx(o) { if (this.fx.length < FX_CAP) this.fx.push(o); }
  ring(x, y, r0, r1, dur, color, width = 5) { this.addFx({ kind: 'ring', x, y, r0, r1, t: 0, dur, color, width }); }
  flash(x, y, r, dur, color) { this.addFx({ kind: 'flash', x, y, r, t: 0, dur, color }); }
  beam(x1, y1, x2, y2, dur, color, width = 8) { this.addFx({ kind: 'beam', x1, y1, x2, y2, t: 0, dur, color, width }); }

  // ── main loop ───────────────────────────────────────────────────────────────────
  update(dt) {
    const g = this.game;
    if (!this.modeOk() || !g.player || !Number.isFinite(dt) || dt <= 0) return;
    this._t += dt;
    for (const st of this.active.values()) {
      try { FUSION_EXECUTORS[st.id]?.update?.(this, st, dt); }
      catch (e) {
        st._errs = (st._errs || 0) + 1;
        if (st._errs <= 2) console.error('[Fusion] "' + st.id + '" update error', e);
      }
    }
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.t += dt;
      if (f.t >= f.dur) this.fx.splice(i, 1);
    }
  }

  draw(ctx) {
    if (!this.modeOk()) return;
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
        const den = fe.densest(200, fe._t);
        const ang = Math.atan2(den.y - p.pos.y, den.x - p.pos.x);
        st.objects.lance = { x: p.pos.x, y: p.pos.y, ang, trav: 0 };
        st.phase = 'travel'; st.t = 0;
        fe.cue(st.id, 'travel');
        // lane damage: όλα τα targets στον διάδρομο πληρώνουν ΜΙΑ φορά
        const cosA = Math.cos(ang), sinA = Math.sin(ang);
        for (const e of fe.targets()) {
          const dx = e.pos.x - p.pos.x, dy = e.pos.y - p.pos.y;
          const along = dx * cosA + dy * sinA, side = Math.abs(-dx * sinA + dy * cosA);
          if (along > 0 && along < m.range && side < m.laneWidth + (e.radius || 20)) {
            fe.dealDamage(st.id, e, A(m.laneDamage, i));
          }
        }
      }
    } else if (st.phase === 'travel') {
      const L = st.objects.lance;
      L.trav += m.travelSpeed * dt;
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
        // nova
        const novaR = A(m.nova.radius, i);
        for (const e of fe.near(R.x, R.y, novaR)) fe.dealDamage(st.id, e, A(m.nova.dmg, i));
        fe.ring(R.x, R.y, 30, novaR, 0.5, d.palette.core, 8);
        fe.flash(R.x, R.y, novaR * 0.7, 0.45, d.palette.glow);
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
          const tgt = fe.nearestTo(pl.x, pl.y);
          if (tgt && dist2(pl.x, pl.y, tgt.pos.x, tgt.pos.y) < FUSION_DEFS[st.id].t3.pylonRange ** 2) {
            fe.dealDamage(st.id, tgt, FUSION_DEFS[st.id].t3.pylonVolleyDmg);
            fe.beam(pl.x, pl.y, tgt.pos.x, tgt.pos.y, 0.25, d.palette.glow, 6);
          }
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
      ctx.save();
      const vg = ctx.createRadialGradient(R.x, R.y, 0, R.x, R.y, radius * 0.5);
      vg.addColorStop(0, 'rgba(5,1,16,0.95)'); vg.addColorStop(1, 'rgba(5,1,16,0)');
      ctx.fillStyle = vg;
      ctx.beginPath(); ctx.arc(R.x, R.y, radius * 0.5, 0, Math.PI * 2); ctx.fill();
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
          const den = fe.densest(160, s.a);
          if (den.n > 0) {
            s.mode = 'dive'; s.dive = { tx: den.x, ty: den.y };
            diving++;
            fe.cue(st.id, 'travel');
          }
        }
      } else if (s.mode === 'dive') {
        const dx = s.dive.tx - s.x, dy = s.dive.ty - s.y;
        const dd = Math.hypot(dx, dy) || 1;
        const step = A(m.dive.speed, 0) * dt;
        if (dd <= step + 4) {
          // έκρηξη + chains
          for (const e of fe.near(s.dive.tx, s.dive.ty, m.dive.radius)) fe.dealDamage(st.id, e, A(m.dive.dmg, i));
          fe.flash(s.dive.tx, s.dive.ty, m.dive.radius, 0.4, d.palette.glow);
          fe.cue(st.id, 'impact');
          let chains = Math.min(m.caps.chainsPerDive, A(m.chains.count, i) + (fe.chaos() ? (d.chaos.extraChain || 0) : 0));
          const hitSet = new Set();
          let cx = s.dive.tx, cy = s.dive.ty;
          while (chains-- > 0) {
            const nxt = fe.nearestTo(cx, cy, hitSet);
            if (!nxt || dist2(cx, cy, nxt.pos.x, nxt.pos.y) > m.chains.range ** 2) break;
            fe.dealDamage(st.id, nxt, A(m.chains.dmg, i));
            fe.beam(cx, cy, nxt.pos.x, nxt.pos.y, 0.22, d.palette.glow, 4);
            hitSet.add(nxt);
            cx = nxt.pos.x; cy = nxt.pos.y;
          }
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
        if (s.reform <= 0) { s.mode = 'orbit'; fe.cue(st.id, 'aftermath'); }
      }
    }
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
        const den = fe.densest(200, fe._t * 1.7);
        const p = fe.game.player;
        const ang = Math.atan2(den.y - p.pos.y, den.x - p.pos.x);
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
        const den = fe.densest(220, fe._t);
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
        const hitSet = new Set();
        for (let k = 0; k < n; k++) {
          const tgt = fe.nearestTo(S.x, S.y, hitSet);
          if (!tgt) break;
          hitSet.add(tgt);
          const ang = Math.atan2(tgt.pos.y - S.y, tgt.pos.x - S.x);
          // lance line: pierce στους πρώτους pierce στόχους στη γραμμή
          const cosA = Math.cos(ang), sinA = Math.sin(ang);
          let hits = 0;
          for (const e of fe.targets()) {
            const dx = e.pos.x - S.x, dy = e.pos.y - S.y;
            const along = dx * cosA + dy * sinA, side = Math.abs(-dx * sinA + dy * cosA);
            if (along > 0 && along < m.lances.range && side < 22 + (e.radius || 18)) {
              fe.dealDamage(st.id, e, A(m.lances.dmg, i));
              if (++hits >= m.lances.pierce) break;
            }
          }
          fe.beam(S.x, S.y, S.x + cosA * m.lances.range, S.y + sinA * m.lances.range, 0.28, d.palette.core, 6);
        }
        fe.cue(st.id, 'impact');
      }
      if (S.t >= durS) {
        for (const e of fe.near(S.x, S.y, m.collapse.radius)) fe.dealDamage(st.id, e, A(m.collapse.dmg, i));
        fe.flash(S.x, S.y, m.collapse.radius * 0.8, 0.5, d.palette.glow);
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
    ctx.save();
    // σκοτεινό μάτι
    const eg = ctx.createRadialGradient(S.x, S.y, 0, S.x, S.y, wallR * 0.5);
    eg.addColorStop(0, 'rgba(1,10,6,0.85)'); eg.addColorStop(1, 'rgba(1,10,6,0)');
    ctx.fillStyle = eg;
    ctx.beginPath(); ctx.arc(S.x, S.y, wallR * 0.5, 0, Math.PI * 2); ctx.fill();
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
    // crack star: 6 arms instant damage
    for (let k = 0; k < m.caps.crackArms; k++) {
      const a = (k / m.caps.crackArms) * Math.PI * 2;
      const cosA = Math.cos(a), sinA = Math.sin(a);
      for (const e of fe.near(x, y, m.crackRange)) {
        const dx = e.pos.x - x, dy = e.pos.y - y;
        const along = dx * cosA + dy * sinA, side = Math.abs(-dx * sinA + dy * cosA);
        if (along > 0 && side < 34 + (e.radius || 18)) fe.dealDamage(st.id, e, A(m.crackDmg, i) * dmgMult);
      }
      fe.beam(x, y, x + cosA * m.crackRange, y + sinA * m.crackRange, 0.45, d.palette.glow, 6);
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
        const den = fe.densest(200, fe._t);
        this._openMaw(fe, st, den.x, den.y, 1);
        st.objects.secondQueued = fe.tierOf(st.id) >= 3;
        st.phase = 'active'; st.t = 0;
      }
    } else if (st.phase === 'active') {
      if (st.objects.secondQueued && st.t >= d.t3.secondMaw.delayS) {
        st.objects.secondQueued = false;
        const den = fe.densest(200, fe._t + 2);
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
        // geyser + crust
        const gR = A(m.geyser.radius, i) * radiusMult;
        for (const e of fe.near(M.x, M.y, gR)) fe.dealDamage(st.id, e, A(m.geyser.dmg, i) * M.dmgMult);
        fe.flash(M.x, M.y, gR, 0.5, d.palette.glow);
        fe.ring(M.x, M.y, 30, gR + 40, 0.55, '#ffd9a1', 8);
        fe.game.screenShake?.trigger?.(10, 0.4);
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
      ctx.save();
      const vg = ctx.createRadialGradient(M.x, M.y, 0, M.x, M.y, sinkR);
      vg.addColorStop(0, 'rgba(20,6,2,0.9)');
      vg.addColorStop(0.55, `rgba(255,106,46,${0.25 + k * 0.3})`);
      vg.addColorStop(1, 'rgba(20,6,2,0)');
      ctx.fillStyle = vg;
      ctx.beginPath(); ctx.arc(M.x, M.y, sinkR, 0, Math.PI * 2); ctx.fill();
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
        const den = fe.densest(200, fe._t);
        const ang = Math.atan2(den.y - p.pos.y, den.x - p.pos.x);
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
          const wDmg = A(m.wave.dmg, i) * (fe.chaos() ? (d.chaos.waveDmgMult || 1) : 1);
          for (const e of fe.near(mn.x, mn.y, m.wave.radius)) fe.dealDamage(st.id, e, wDmg);
          fe.flash(mn.x, mn.y, m.wave.radius, 0.35, d.palette.glow);
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
        const qR = A(m.qed.radius, i);
        const qDmg = A(m.qed.dmg, i) * (fe.chaos() ? (d.chaos.qedDmgMult || 1) : 1);
        for (const e of fe.near(C.x, C.y, qR)) fe.dealDamage(st.id, e, qDmg);
        fe.flash(C.x, C.y, qR * 0.8, 0.5, d.palette.core);
        fe.ring(C.x, C.y, 40, qR, 0.55, d.palette.glow, 9);
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
        const den = fe.densest(220, fe._t);
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
          // implosion
          const iR = A(m.implosion.radius, i);
          const dmg = A(m.implosion.dmg, i) * (1 + S.amp);
          for (const e of fe.near(S.x, S.y, iR)) fe.dealDamage(st.id, e, dmg);
          fe.flash(S.x, S.y, iR, 0.55, '#fff6cf');
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
        const den = fe.densest(220, fe._t);
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
        const pct = A(m.execute.pctMaxHp, i) + (fe.chaos() ? (d.chaos.execPctBonus || 0) : 0);
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
        // final bite: κώνος/δίσκος γύρω από το maw
        const biteDmg = (A(m.bite.baseDmg, i) + A(m.bite.perSoul, i) * M.souls);
        for (const e of fe.near(M.x, M.y, m.bite.radius)) fe.dealDamage(st.id, e, biteDmg);
        if (M.secondCourse) {
          for (const e of fe.near(M.x, M.y, m.bite.radius)) {
            fe.dealDamage(st.id, e, biteDmg * d.t3.secondCourse.biteDmgMult);
          }
        }
        fe.flash(M.x, M.y, m.bite.radius, 0.55, d.palette.glow);
        fe.game.screenShake?.trigger?.(11, 0.45);
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
    ctx.save();
    const vg = ctx.createRadialGradient(M.x, M.y, 0, M.x, M.y, radius);
    vg.addColorStop(0, 'rgba(16,1,4,0.92)');
    vg.addColorStop(0.7, 'rgba(120,10,25,0.35)');
    vg.addColorStop(1, 'rgba(16,1,4,0)');
    ctx.fillStyle = vg;
    ctx.beginPath(); ctx.arc(M.x, M.y, radius, 0, Math.PI * 2); ctx.fill();
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
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.85;
      const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, 26);
      sg.addColorStop(0, '#fff1d6'); sg.addColorStop(0.6, d.palette.glow); sg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.arc(sx, sy, 26, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
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
        const den = fe.densest(220, fe._t);
        const ang = Math.atan2(den.y - p.pos.y, den.x - p.pos.x);
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
          for (const e of fe.near(L.x, L.y, m.endBursts.radius)) {
            fe.dealDamage(st.id, e, A(m.endBursts.dmg, i) * dmgMult);
          }
          fe.flash(L.x, L.y, m.endBursts.radius, 0.35, d.palette.glow);
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
