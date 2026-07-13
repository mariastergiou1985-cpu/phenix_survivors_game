// ─── Elemental system (Phase 1) ───────────────────────────────────────────────────────────────
// Modular, visible, bounded. Each element has a recognizable arcade-style burst (ring + flash +
// element-specific flourish), tinted by its identity colors. VFX live in a hard-capped, self-
// expiring array (one lightweight object per burst — flourishes are computed procedurally in draw,
// so there are NO per-particle arrays). Purely visual + a tiny optional proc; gameplay/balance and
// boss caps are handled by the caller in Game.js.

export const ELEMENTS = {
  fire:      { name: 'FIRE',      c1: '#ff6a1a', c2: '#ffd27f', spokes: 7, style: 'ember', life: 0.50 },
  electric:  { name: 'ELECTRIC',  c1: '#9fd8ff', c2: '#ffffff', spokes: 6, style: 'arc',   life: 0.45 },
  radiation: { name: 'RADIATION', c1: '#c6ff3a', c2: '#eaffa0', spokes: 3, style: 'pulse', life: 0.55 },
  ice:       { name: 'ICE',       c1: '#7fe0ff', c2: '#e6fbff', spokes: 6, style: 'shard', life: 0.52 },
  magnetic:  { name: 'MAGNETIC',  c1: '#9b6bff', c2: '#cdb6ff', spokes: 5, style: 'pull',  life: 0.45 },
  toxin:     { name: 'TOXIN',     c1: '#7CFF4D', c2: '#caffae', spokes: 5, style: 'splat', life: 0.55 },
  gas:       { name: 'GAS',       c1: '#8fdf7f', c2: '#d8ffcf', spokes: 0, style: 'cloud', life: 0.90 },
  // Eddie signature elements — purely additive data entries that reuse existing burst styles
  // ('ember' / 'arc'), so the draw engine needs zero changes.
  crimson_gate:   { name: 'CRIMSON GATE',   c1: '#ff2d2d', c2: '#ffd23c', spokes: 7, style: 'ember', life: 0.52 },
  thunder_maiden: { name: 'THUNDER MAIDEN', c1: '#ffd23c', c2: '#fff6d0', spokes: 6, style: 'arc',   life: 0.45 },
  // Dimi signature cyber elements (Φ1 completion) — additive data entries on existing
  // burst styles, exactly the Eddie pattern. Neon Blaze is his PRIMARY; Data Torrent is
  // the Fusion-Catalyst secondary; Plasma Shockwave / Tectonic Nano-Shield registered
  // for cards/lore surfaces.
  neon_blaze:      { name: 'NEON BLAZE',       c1: '#ff2d6a', c2: '#7df9ff', spokes: 7, style: 'ember', life: 0.50 },
  data_torrent:    { name: 'DATA TORRENT',     c1: '#7df9ff', c2: '#ffffff', spokes: 6, style: 'arc',   life: 0.45 },
  plasma_shockwave:{ name: 'PLASMA SHOCKWAVE', c1: '#c77dff', c2: '#ffd0f0', spokes: 5, style: 'pulse', life: 0.50 },
  tectonic_shield: { name: 'TECTONIC NANO-SHIELD', c1: '#d8a24a', c2: '#fff0d0', spokes: 4, style: 'shard', life: 0.55 },
  // Phasewalker signature cyber elements (Maria 2026-07-12: he had NO elements at all) —
  // additive data entries on existing burst styles, exactly the Eddie/Dimi pattern.
  phase_shift:     { name: 'PHASE SHIFT',     c1: '#00b8d9', c2: '#e8fdff', spokes: 6, style: 'arc',   life: 0.45 },
  void_static:     { name: 'VOID STATIC',     c1: '#5b4bff', c2: '#c8bfff', spokes: 5, style: 'pulse', life: 0.50 },
  ghost_frequency: { name: 'GHOST FREQUENCY', c1: '#9fdcff', c2: '#ffffff', spokes: 6, style: 'shard', life: 0.48 },
};

// Symbol/icon per element — used for compact icon-based badges (HUD, cards) instead of long words.
export const ELEMENT_ICON = {
  fire: '🔥', electric: '⚡', radiation: '☢', ice: '❄', magnetic: '🧲', toxin: '☣', gas: '☁',
  neon_blaze: '✦', data_torrent: '≋', plasma_shockwave: '◎', tectonic_shield: '⬟',
  crimson_gate: '⛩', thunder_maiden: '🌩',
  phase_shift: '◇', void_static: '✧', ghost_frequency: '≈',
};

// Primary elemental identity per active character. Oni is included but stays locked/PF-gated
// elsewhere — having a hook here never unlocks or exposes him. No Phasewalker entry (disabled).
export const CHARACTER_ELEMENT = {
  skeleton_warrior:       'electric',
  taekwondo_girl:         'ice',
  cyber_arm_hero:         'fire',
  brawler_warrior:        'magnetic',
  assassin_clone:         'electric',
  euclid_vector:          'toxin',
  oni_cataclysm_protocol: 'radiation',
  eddie:                  'crimson_gate',   // Crimson Gate — red+gold burn/shock resonance identity
  dimis_kickboxer:        'neon_blaze',     // Φ1: Dimi signature primary (was plain electric)
  japan_phasewalker:      'phase_shift',    // Maria 2026-07-12: Phasewalker finally gets his element identity
};

// Future fusion hooks (Phase 1 PREP ONLY) — data only, so fusion cards can be added later without
// touching the burst engine. Maps an unordered element pair → a fusion id + display name + color.
export const FUSIONS = {
  'electric+fire':      { id: 'plasma',     name: 'PLASMA',      c1: '#ff7adf' },
  'electric+radiation': { id: 'ionstorm',   name: 'ION STORM',   c1: '#d6ff5a' },
  'ice+magnetic':       { id: 'cryofield',  name: 'CRYO FIELD',  c1: '#9fd0ff' },
  'electric+toxin':     { id: 'electrorot', name: 'ELECTRO-ROT', c1: '#9bff7a' },
  'fire+ice':           { id: 'thermal',    name: 'THERMAL SHOCK', c1: '#ffd0e0' },
  'ice+toxin':          { id: 'blight',     name: 'FROST BLIGHT', c1: '#8fe6c0' },
};
export function fusionKey(a, b) { return [a, b].sort().join('+'); }

// ─── Fusion behavior table (Phase 2) ───────────────────────────────────────────────────────────
// Each fusion has a two-color identity + an effect `kind` consumed by Game._fusionProc:
//   'aoe'   → bounded burst damage to nearby NORMAL enemies (bosses capped + halved)
//   'field' → light damage + short SLOW on normals only (never slows bosses)
//   'cloud' → spawns a short-lived damaging gas cloud (hard-capped count)
export const FUSION_FX = {
  plasma:           { name: 'PLASMA BURN',      c1: '#ff6a1a', c2: '#9fd8ff', kind: 'aoe',   radius: 78, dmg: 14 },
  ionstorm:         { name: 'ION STORM',        c1: '#c6ff3a', c2: '#9fd8ff', kind: 'aoe',   radius: 82, dmg: 12 },
  cryofield:        { name: 'CRYO FIELD',       c1: '#7fe0ff', c2: '#9b6bff', kind: 'field', radius: 92, dmg: 6,  slow: 1.2 },
  electrorot:       { name: 'ELECTRO-ROT',      c1: '#7CFF4D', c2: '#9fd8ff', kind: 'aoe',   radius: 84, dmg: 11 },
  thermal:          { name: 'THERMAL SHOCK',    c1: '#ff6a1a', c2: '#7fe0ff', kind: 'aoe',   radius: 88, dmg: 16 },
  blight:           { name: 'FROST BLIGHT',     c1: '#7CFF4D', c2: '#7fe0ff', kind: 'field', radius: 80, dmg: 8,  slow: 1.0 },
  viral:            { name: 'VIRAL CLOUD',      c1: '#7CFF4D', c2: '#8fdf7f', kind: 'cloud', radius: 72, dmg: 8 },
  frost_arc:        { name: 'FROST ARC',        c1: '#7fe0ff', c2: '#9fd8ff', kind: 'aoe',   radius: 76, dmg: 12 },
  magnetic_furnace: { name: 'MAGNETIC FURNACE', c1: '#ff6a1a', c2: '#9b6bff', kind: 'field', radius: 84, dmg: 12, slow: 0.8 },
  cataclysm:        { name: 'CATACLYSM BURN',   c1: '#c6ff3a', c2: '#ff6a1a', kind: 'aoe',   radius: 96, dmg: 18 },
  // Eddie fusion — Crimson Gate + Thunder Maiden resonance field (burn+shock ticks + short slow;
  // 'field' kind never slows bosses, radius kept inside the existing field range for balance).
  crimson_thunder_gate: { name: 'CRIMSON THUNDER GATE', c1: '#ff2d2d', c2: '#ffd23c', kind: 'field', radius: 96, dmg: 12, slow: 0.8 },
  // Dimi fusion (Φ1) — Binary Overdrive Aura: neon/data resonance field, same balance class.
  binary_overdrive:     { name: 'BINARY OVERDRIVE AURA', c1: '#ff2d6a', c2: '#7df9ff', kind: 'field', radius: 94, dmg: 12, slow: 0.8 },
  // Phasewalker fusions — same 'field' balance class as Eddie/Dimi (never slows bosses).
  null_cascade:         { name: 'NULL CASCADE',          c1: '#00b8d9', c2: '#5b4bff', kind: 'field', radius: 92, dmg: 12, slow: 0.8 },
  spectral_overload:    { name: 'SPECTRAL OVERLOAD',     c1: '#9fdcff', c2: '#ffffff', kind: 'aoe',   radius: 84, dmg: 14 },
};

// Element-pair → fusion id (keyed by fusionKey(a,b), i.e. the two element names sorted + joined).
// Phase 3 resolves a character's PRIMARY element + a card-granted SECONDARY element through this map.
export const FUSION_PAIRS = {
  'electric+fire':      'plasma',
  'electric+radiation': 'ionstorm',
  'ice+magnetic':       'cryofield',
  'electric+toxin':     'electrorot',
  'fire+ice':           'thermal',
  'ice+toxin':          'blight',
  'gas+toxin':          'viral',
  'electric+ice':       'frost_arc',
  'fire+magnetic':      'magnetic_furnace',
  'fire+radiation':     'cataclysm',
  'crimson_gate+thunder_maiden': 'crimson_thunder_gate',   // Eddie: primary + card-granted secondary
  'data_torrent+neon_blaze':     'binary_overdrive',       // Dimi: primary + card-granted secondary (Φ1)
  'phase_shift+void_static':     'null_cascade',           // Phasewalker: primary + Void Static card
  'ghost_frequency+phase_shift': 'spectral_overload',      // Phasewalker: primary + Ghost Frequency card
};

// Which fusion each playable character triggers once Fusion Catalyst is active. Single-element
// characters (Skeleton=Electric, Brawler=Magnetic) have NO entry → they keep pure elemental VFX.
// Oni is included but only ever active while actually played (he stays locked/PF-gated elsewhere).
export const CHARACTER_FUSION = {
  taekwondo_girl:         'frost_arc',        // Ice + Electric
  cyber_arm_hero:         'magnetic_furnace', // Fire + Magnetic
  assassin_clone:         'plasma',           // Electric / Plasma
  euclid_vector:          'viral',            // Toxin + Gas
  oni_cataclysm_protocol: 'cataclysm',        // Radiation + Fire
  eddie:                  'crimson_thunder_gate',
  dimis_kickboxer:        'binary_overdrive',       // Φ1: Neon Blaze + Data Torrent   // Crimson Gate + Thunder Maiden
  japan_phasewalker:      'null_cascade',           // default fusion once Fusion Catalyst is live
};

const MAX_BURSTS = 56;   // hard cap on concurrent element bursts

export class ElementFx {
  constructor() { this.bursts = []; }

  spawn(x, y, element, scale = 1) {
    if (!ELEMENTS[element]) return;
    if (this.bursts.length >= MAX_BURSTS) this.bursts.shift();   // drop oldest — never unbounded
    // seed: stable per-burst randomness so jitter shapes don't strobe frame-to-frame
    this.bursts.push({ x, y, t: 0, life: ELEMENTS[element].life, element, scale,
                       rot: Math.random() * Math.PI, seed: (Math.random() * 1000) | 0 });
  }

  // Premium two-color fusion burst — counter-rotating rings + interleaved petals + core flash.
  spawnFusion(x, y, c1, c2, scale = 1) {
    if (this.bursts.length >= MAX_BURSTS) this.bursts.shift();
    this.bursts.push({ x, y, t: 0, life: 0.65, fusion: true, c1, c2, scale,
                       rot: Math.random() * Math.PI, seed: (Math.random() * 1000) | 0 });
  }

  update(dt) {
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      this.bursts[i].t += dt;
      if (this.bursts[i].t >= this.bursts[i].life) this.bursts.splice(i, 1);
    }
  }

  clear() { this.bursts.length = 0; }

  // deterministic pseudo-random per (seed, i) — stable shapes, no per-particle arrays
  _pr(seed, i) { const v = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453; return v - Math.floor(v); }

  // ── World-space draw (caller is inside the camera transform). Additive glow. Each element
  // has a cinematic identity in the ultimate-module style — procedural, bounded, seed-stable.
  draw(ctx) {
    for (const b of this.bursts) {
      const k = b.t / b.life, a = 1 - k;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.globalCompositeOperation = 'lighter';

      if (b.fusion) {                          // ── FUSION: two forces colliding ──
        const r = (12 + 36 * k) * b.scale;
        if (k < 0.35) { ctx.globalAlpha = (0.35 - k) * 2.6; ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(0, 0, 11 * b.scale * (1 - k), 0, Math.PI * 2); ctx.fill(); }
        // counter-rotating broken rings (one per color)
        for (const [col, dir, rr] of [[b.c1, 1, r], [b.c2, -1, r * 0.72]]) {
          ctx.strokeStyle = col; ctx.lineWidth = 2.6 * b.scale; ctx.globalAlpha = a * 0.9;
          for (let i = 0; i < 3; i++) {
            const s0 = b.rot * dir + k * dir * 3 + i * (Math.PI * 2 / 3);
            ctx.beginPath(); ctx.arc(0, 0, rr, s0, s0 + Math.PI * 0.5); ctx.stroke();
          }
        }
        // interleaved petals
        for (let i = 0; i < 8; i++) {
          const ang = b.rot + i * (Math.PI / 4) + k * 1.5, dx = Math.cos(ang), dy = Math.sin(ang);
          ctx.globalAlpha = a; ctx.strokeStyle = (i % 2) ? b.c1 : b.c2; ctx.lineWidth = 2 * b.scale;
          ctx.beginPath(); ctx.moveTo(dx * 8, dy * 8);
          ctx.quadraticCurveTo(dx * r * 0.6 - dy * 8, dy * r * 0.6 + dx * 8, dx * r, dy * r);
          ctx.stroke();
        }
        ctx.restore();
        continue;
      }

      const def = ELEMENTS[b.element]; if (!def) { ctx.restore(); continue; }
      const r = (14 + 40 * k) * b.scale;
      const st = def.style;

      // shared impact flash
      if (k < 0.4) {
        ctx.globalAlpha = (0.4 - k) * 2.2;
        ctx.fillStyle = def.c2;
        ctx.beginPath(); ctx.arc(0, 0, 9 * b.scale * (1 - k), 0, Math.PI * 2); ctx.fill();
      }

      if (st === 'ember') {                    // ── FIRE / CRIMSON GATE: living flame ──
        // flame tongues licking upward (bezier, wobbling), embers rising
        for (let i = 0; i < 6; i++) {
          const pr = this._pr(b.seed, i);
          const ang = b.rot + (i / 6) * Math.PI * 2;
          const bx = Math.cos(ang) * r * 0.5, by = Math.sin(ang) * r * 0.5;
          const wob = Math.sin(k * 9 + i * 2.2) * 6 * b.scale;
          ctx.globalAlpha = a * 0.9; ctx.strokeStyle = i % 2 ? def.c1 : def.c2; ctx.lineWidth = (2.6 - k) * b.scale;
          ctx.beginPath(); ctx.moveTo(bx, by);
          ctx.quadraticCurveTo(bx + wob, by - (12 + pr * 14) * b.scale, bx + wob * 0.4, by - (22 + pr * 20) * b.scale * (0.5 + k));
          ctx.stroke();
          // ember dot at the tip
          ctx.globalAlpha = a; ctx.fillStyle = def.c2;
          ctx.beginPath(); ctx.arc(bx + wob * 0.4, by - (22 + pr * 20) * b.scale * (0.5 + k), 1.8 * b.scale, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = a * 0.8; ctx.strokeStyle = def.c1; ctx.lineWidth = 3 * b.scale;
        ctx.beginPath(); ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2); ctx.stroke();

      } else if (st === 'arc') {               // ── ELECTRIC / THUNDER MAIDEN: real jagged bolts ──
        for (let i = 0; i < def.spokes; i++) {
          const ang = b.rot + (i / def.spokes) * Math.PI * 2;
          ctx.globalAlpha = a * (0.65 + 0.35 * this._pr(b.seed, i + k * 7 | 0));
          ctx.strokeStyle = i % 2 ? def.c1 : def.c2; ctx.lineWidth = 2 * b.scale;
          ctx.beginPath();
          let px = Math.cos(ang) * 6, py = Math.sin(ang) * 6;
          ctx.moveTo(px, py);
          for (let sgm = 1; sgm <= 4; sgm++) {                  // 4-segment jitter bolt
            const rr = (r * sgm) / 4;
            const j = (this._pr(b.seed, i * 10 + sgm) - 0.5) * 14 * b.scale;
            px = Math.cos(ang) * rr - Math.sin(ang) * j;
            py = Math.sin(ang) * rr + Math.cos(ang) * j;
            ctx.lineTo(px, py);
          }
          ctx.stroke();
          // crackle tip
          ctx.globalAlpha = a; ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(px, py, 1.6 * b.scale, 0, Math.PI * 2); ctx.fill();
        }

      } else if (st === 'shard') {             // ── ICE: crystal bloom ──
        for (let i = 0; i < def.spokes; i++) {
          const ang = b.rot + (i / def.spokes) * Math.PI * 2 + k * 0.6;
          const px = Math.cos(ang) * r, py = Math.sin(ang) * r;
          const dx = Math.cos(ang), dy = Math.sin(ang);
          // hex-cut crystal (two-tone facets)
          ctx.globalAlpha = a;
          ctx.fillStyle = def.c1;
          ctx.beginPath();
          ctx.moveTo(px - dy * 4 * b.scale, py + dx * 4 * b.scale);
          ctx.lineTo(px + dx * 9 * b.scale, py + dy * 9 * b.scale);
          ctx.lineTo(px + dy * 4 * b.scale, py - dx * 4 * b.scale);
          ctx.lineTo(px - dx * 5 * b.scale, py - dy * 5 * b.scale);
          ctx.closePath(); ctx.fill();
          ctx.globalAlpha = a * 0.8; ctx.fillStyle = def.c2;
          ctx.beginPath();
          ctx.moveTo(px, py); ctx.lineTo(px + dx * 9 * b.scale, py + dy * 9 * b.scale);
          ctx.lineTo(px + dy * 3 * b.scale, py - dx * 3 * b.scale); ctx.closePath(); ctx.fill();
        }
        // frost ring + sparkle crosses
        ctx.globalAlpha = a * 0.6; ctx.strokeStyle = def.c2; ctx.lineWidth = 1.6 * b.scale;
        ctx.beginPath(); ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2); ctx.stroke();
        for (let i = 0; i < 3; i++) {
          const pr = this._pr(b.seed, i + 40), ang = pr * Math.PI * 2;
          const sx = Math.cos(ang) * r * 0.7, sy = Math.sin(ang) * r * 0.7, sl = 3.5 * b.scale;
          ctx.globalAlpha = a * (0.5 + 0.5 * Math.sin(k * 12 + i * 2));
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(sx - sl, sy); ctx.lineTo(sx + sl, sy);
          ctx.moveTo(sx, sy - sl); ctx.lineTo(sx, sy + sl); ctx.stroke();
        }

      } else if (st === 'pull') {              // ── MAGNETIC: field-line lens ──
        // curved field lines arcing pole-to-pole (like iron filings), collapsing inward
        for (let i = 0; i < 5; i++) {
          const off = (i - 2) * 7 * b.scale;
          ctx.globalAlpha = a * 0.85; ctx.strokeStyle = i % 2 ? def.c1 : def.c2; ctx.lineWidth = 1.8 * b.scale;
          ctx.save(); ctx.rotate(b.rot + k * 1.4);
          ctx.beginPath();
          ctx.moveTo(-r * 0.8, off * (1 - k));
          ctx.quadraticCurveTo(0, off * 3.2 * (1 - k), r * 0.8, off * (1 - k));
          ctx.stroke();
          ctx.restore();
        }
        // imploding ring (reads as attraction)
        ctx.globalAlpha = a * 0.8; ctx.strokeStyle = def.c2; ctx.lineWidth = 2.2 * b.scale;
        ctx.beginPath(); ctx.arc(0, 0, Math.max(3, r * (1 - k) * 0.9), 0, Math.PI * 2); ctx.stroke();
        // N/S pole flashes
        ctx.save(); ctx.rotate(b.rot + k * 1.4);
        ctx.globalAlpha = a; ctx.fillStyle = def.c1;
        ctx.beginPath(); ctx.arc(-r * 0.8, 0, 2.6 * b.scale, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = def.c2;
        ctx.beginPath(); ctx.arc(r * 0.8, 0, 2.6 * b.scale, 0, Math.PI * 2); ctx.fill();
        ctx.restore();

      } else if (st === 'pulse') {             // ── RADIATION: rotating trefoil ──
        ctx.save(); ctx.rotate(b.rot + k * 2.2);
        ctx.globalAlpha = a * 0.9; ctx.fillStyle = def.c1;
        for (let i = 0; i < 3; i++) {          // the classic 3-wedge hazard sign, spinning
          const s0 = i * (Math.PI * 2 / 3);
          ctx.beginPath(); ctx.moveTo(0, 0);
          ctx.arc(0, 0, r * 0.75, s0, s0 + Math.PI / 3); ctx.closePath(); ctx.fill();
        }
        ctx.globalAlpha = a; ctx.fillStyle = def.c2;
        ctx.beginPath(); ctx.arc(0, 0, 3.4 * b.scale, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        for (let i = 0; i < 2; i++) {          // contamination rings ripple out
          ctx.globalAlpha = a * (0.55 - i * 0.2); ctx.strokeStyle = def.c2; ctx.lineWidth = 1.8 * b.scale;
          ctx.beginPath(); ctx.arc(0, 0, r * (0.65 + i * 0.35), 0, Math.PI * 2); ctx.stroke();
        }

      } else if (st === 'splat') {             // ── TOXIN: corrosive boil ──
        for (let i = 0; i < 6; i++) {
          const pr = this._pr(b.seed, i);
          const ang = b.rot + (i / 6) * Math.PI * 2;
          const rr = r * (0.65 + pr * 0.5);
          const px = Math.cos(ang) * rr, py = Math.sin(ang) * rr;
          // blob + elongating drip
          ctx.globalAlpha = a * 0.9; ctx.fillStyle = i % 2 ? def.c1 : def.c2;
          ctx.beginPath(); ctx.arc(px, py, (2.5 + pr * 2.5) * b.scale, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = a * 0.7; ctx.strokeStyle = def.c1; ctx.lineWidth = 1.6 * b.scale;
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py + (5 + 12 * k) * b.scale); ctx.stroke();
          ctx.beginPath(); ctx.arc(px, py + (5 + 12 * k) * b.scale, 1.4 * b.scale, 0, Math.PI * 2); ctx.fill();
        }
        // bubbling inner ring
        ctx.globalAlpha = a * 0.6; ctx.strokeStyle = def.c2; ctx.lineWidth = 2 * b.scale;
        ctx.beginPath(); ctx.arc(0, 0, r * 0.5 + Math.sin(k * 14) * 2, 0, Math.PI * 2); ctx.stroke();

      } else if (st === 'cloud') {             // ── GAS: drifting miasma ──
        for (let i = 0; i < 6; i++) {
          const pr = this._pr(b.seed, i);
          const ang = b.rot + i * 1.05 + k * 0.7;
          const rr = r * (0.4 + pr * 0.5 + k * 0.3);
          ctx.globalAlpha = a * 0.4;
          ctx.fillStyle = i % 2 ? def.c1 : def.c2;
          ctx.beginPath(); ctx.arc(Math.cos(ang) * rr, Math.sin(ang) * rr - k * 8 * b.scale,
                                   (6 + pr * 5) * b.scale * (0.6 + k), 0, Math.PI * 2); ctx.fill();
        }

      } else {                                 // fallback: simple spokes (unknown style safety)
        ctx.strokeStyle = def.c2; ctx.lineWidth = 2 * b.scale;
        for (let i = 0; i < (def.spokes || 5); i++) {
          const ang = b.rot + i * (Math.PI * 2 / (def.spokes || 5));
          ctx.globalAlpha = a;
          ctx.beginPath(); ctx.moveTo(Math.cos(ang) * 8, Math.sin(ang) * 8);
          ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r); ctx.stroke();
        }
        ctx.globalAlpha = a * 0.9; ctx.strokeStyle = def.c1; ctx.lineWidth = 3 * b.scale;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
      }

      ctx.restore();
    }
    // Defensive canvas-state reset so element VFX never leak into later rendering.
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.shadowBlur = 0; ctx.filter = 'none';
  }
}
