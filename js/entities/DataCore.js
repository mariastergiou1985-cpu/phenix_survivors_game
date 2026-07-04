// Two core types only: GOLD (rare, +5 to a Matrix) and SILVER (common, +3 to a Matrix).
// Both pulse/glow; gold reads as visually superior. `value` is what the core adds to a
// Matrix when delivered; `color` drives the glow.
export const CORE_DEFS = {
  gold:   { value: 5, color: '#ffd23c', glow: '#ffe680' },
  silver: { value: 3, color: '#dfe9f5', glow: '#ffffff' },
};

// ~22% of spawned cores are gold (rare/valuable), the rest silver (common).
// goldBonus: additive chance (e.g. Grid Investor card +0.02/level) — finally wired.
export function rollCoreType(goldBonus = 0) {
  return Math.random() < 0.22 + goldBonus ? 'gold' : 'silver';
}

export class DataCore {
  constructor(pos, type = 'silver') {
    this.pos = pos;
    // Accept only the two valid types; anything else (legacy color string) → silver.
    this.type  = (type === 'gold' || type === 'silver') ? type : 'silver';
    const def  = CORE_DEFS[this.type];
    this.value = def.value;
    this.color = def.color;
    this.glow  = def.glow;
  }
}
