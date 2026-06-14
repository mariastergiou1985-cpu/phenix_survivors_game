// ─── Elemental system (Phase 1) ───────────────────────────────────────────────────────────────
// Modular, visible, bounded. Each element has a recognizable arcade-style burst (ring + flash +
// element-specific flourish), tinted by its identity colors. VFX live in a hard-capped, self-
// expiring array (one lightweight object per burst — flourishes are computed procedurally in draw,
// so there are NO per-particle arrays). Purely visual + a tiny optional proc; gameplay/balance and
// boss caps are handled by the caller in Game.js.

export const ELEMENTS = {
  fire:      { name: 'FIRE',      c1: '#ff6a1a', c2: '#ffd27f', spokes: 7, style: 'ember', life: 0.45 },
  electric:  { name: 'ELECTRIC',  c1: '#9fd8ff', c2: '#ffffff', spokes: 6, style: 'arc',   life: 0.40 },
  radiation: { name: 'RADIATION', c1: '#c6ff3a', c2: '#eaffa0', spokes: 3, style: 'pulse', life: 0.55 },
  ice:       { name: 'ICE',       c1: '#7fe0ff', c2: '#e6fbff', spokes: 6, style: 'shard', life: 0.45 },
  magnetic:  { name: 'MAGNETIC',  c1: '#9b6bff', c2: '#cdb6ff', spokes: 5, style: 'pull',  life: 0.45 },
  toxin:     { name: 'TOXIN',     c1: '#7CFF4D', c2: '#caffae', spokes: 5, style: 'splat', life: 0.55 },
  gas:       { name: 'GAS',       c1: '#8fdf7f', c2: '#d8ffcf', spokes: 0, style: 'cloud', life: 0.90 },
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

const MAX_BURSTS = 56;   // hard cap on concurrent element bursts

export class ElementFx {
  constructor() { this.bursts = []; }

  spawn(x, y, element, scale = 1) {
    if (!ELEMENTS[element]) return;
    if (this.bursts.length >= MAX_BURSTS) this.bursts.shift();   // drop oldest — never unbounded
    this.bursts.push({ x, y, t: 0, life: ELEMENTS[element].life, element, scale, rot: Math.random() * Math.PI });
  }

  update(dt) {
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      this.bursts[i].t += dt;
      if (this.bursts[i].t >= this.bursts[i].life) this.bursts.splice(i, 1);
    }
  }

  clear() { this.bursts.length = 0; }

  // World-space draw (caller is inside the camera transform). Additive blend so bursts glow.
  draw(ctx) {
    for (const b of this.bursts) {
      const def = ELEMENTS[b.element]; if (!def) continue;
      const k = b.t / b.life;                 // 0..1 progress
      const a = 1 - k;                         // fade out
      const r = (10 + 26 * k) * b.scale;       // expanding ring
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.globalCompositeOperation = 'lighter';

      // Impact flash (first 40%)
      if (k < 0.4) {
        ctx.globalAlpha = (0.4 - k) * 1.8;
        ctx.fillStyle = def.c2;
        ctx.beginPath(); ctx.arc(0, 0, 6 * b.scale * (1 - k), 0, Math.PI * 2); ctx.fill();
      }
      // Burst ring
      ctx.globalAlpha = a * 0.85; ctx.strokeStyle = def.c1; ctx.lineWidth = 2.5 * b.scale;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();

      // Element-specific flourish (procedural — fixed small loops, no arrays)
      ctx.strokeStyle = def.c2; ctx.fillStyle = def.c1; ctx.lineWidth = 2 * b.scale;
      const n = def.spokes;
      for (let i = 0; i < n; i++) {
        const ang = b.rot + i * (Math.PI * 2 / n), dx = Math.cos(ang), dy = Math.sin(ang);
        ctx.globalAlpha = a;
        if (def.style === 'shard') {
          const px = dx * r, py = dy * r;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px - dy * 4 * b.scale, py + dx * 4 * b.scale);
          ctx.lineTo(px + dx * 7 * b.scale, py + dy * 7 * b.scale);
          ctx.lineTo(px + dy * 4 * b.scale, py - dx * 4 * b.scale);
          ctx.closePath(); ctx.fill();
        } else if (def.style === 'arc') {
          ctx.beginPath(); ctx.moveTo(dx * 6, dy * 6);
          ctx.lineTo(dx * r * 0.6 - dy * 5, dy * r * 0.6 + dx * 5);
          ctx.lineTo(dx * r, dy * r); ctx.stroke();
        } else if (def.style === 'ember') {
          ctx.beginPath(); ctx.moveTo(dx * 8, dy * 8 - k * 4);
          ctx.lineTo(dx * r, dy * r - k * 12); ctx.stroke();
        } else {
          ctx.beginPath(); ctx.moveTo(dx * 8, dy * 8); ctx.lineTo(dx * r, dy * r); ctx.stroke();
        }
      }
      // Style extras
      if (def.style === 'pulse') {              // radiation: concentric contamination ring
        ctx.globalAlpha = a * 0.6; ctx.strokeStyle = def.c2;
        ctx.beginPath(); ctx.arc(0, 0, r * 0.6, 0, Math.PI * 2); ctx.stroke();
      } else if (def.style === 'pull') {        // magnetic: imploding inner ring
        ctx.globalAlpha = a * 0.7; ctx.strokeStyle = def.c2;
        ctx.beginPath(); ctx.arc(0, 0, r * (1 - k) * 0.8 + 4, 0, Math.PI * 2); ctx.stroke();
      } else if (def.style === 'cloud') {       // gas: soft spreading puffs
        ctx.globalAlpha = a * 0.5; ctx.fillStyle = def.c1;
        for (let i = 0; i < 5; i++) { const ang = b.rot + i * 1.25;
          ctx.beginPath(); ctx.arc(Math.cos(ang) * r * 0.6, Math.sin(ang) * r * 0.6, 7 * b.scale * (0.6 + k), 0, Math.PI * 2); ctx.fill(); }
      } else if (def.style === 'splat') {       // toxin: corrosive drips
        ctx.globalAlpha = a * 0.7; ctx.fillStyle = def.c1;
        for (let i = 0; i < 5; i++) { const ang = b.rot + i * 1.25;
          ctx.beginPath(); ctx.arc(Math.cos(ang) * r, Math.sin(ang) * r, 3 * b.scale, 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.restore();
    }
    // Defensive canvas-state reset so element VFX never leak into later rendering.
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.shadowBlur = 0; ctx.filter = 'none';
  }
}
