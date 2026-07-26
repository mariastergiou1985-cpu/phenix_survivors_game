// PHASE 6B-2 — STARTER WEAPON GEOMETRY PROBE (deterministic, read-only)
// ------------------------------------------------------------------------------------------------
// The statistical hit-rate approach kept producing numbers I could not defend (attribution lands in
// 'unattributed' because Game._lastWeaponId is never assigned anywhere in the codebase, and a
// frame-coverage metric mostly measures fire rate). This asks the geometry question directly and
// deterministically instead: put ONE enemy at a known distance and angle from the player, let the
// starter fire for a fixed window, and record whether that enemy took damage.
//
// That answers the mandated questions without statistics:
//   - is there a close-range dead zone (the Cyber-Arm question)
//   - what is the real effective reach versus the declared range
//   - does the weapon cover behind/around the player or only forward
//   - does it fire at all with a legal target present
//
//   node tools/qa/phase6b_starter_geometry_probe.mjs [seconds] <id> [<id> ...]
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
register('./strip-v-loader.mjs', import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const { installEnv, muteConsole } = await import(pathToFileURL(path.join(HERE, 'headless-env.mjs')).href);
installEnv();
const mul = a => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
let vclock = 0; globalThis.performance = { now: () => vclock };
const RD = globalThis.Date;
globalThis.Date = class extends RD { static now() { return vclock; } constructor(...a) { if (a.length) super(...a); else super(vclock); } };
const u0 = muteConsole();
const { Game }  = await import(pathToFileURL(path.join(ROOT, 'js/game/Game.js')).href);
const { Enemy } = await import(pathToFileURL(path.join(ROOT, 'js/entities/Enemy.js')).href);
const { WEAPON_DEFS } = await import(pathToFileURL(path.join(ROOT, 'js/game/WeaponCatalog.js')).href);
u0();

const args = process.argv.slice(2);
const WINDOW = Number(args[0]) > 0 ? Number(args.shift()) : 4;      // seconds per probe cell
const IDS = args.length ? args : ['cyber_arm_hero'];
const DISTS  = (process.env.PROBE_DISTS || '10,25,40,80,150,260,340').split(',').map(Number);
const ANGLES = (process.env.PROBE_ANGLES || '0,90,180').split(',').map(Number);                               // 0 = straight ahead (aim +x)

function probe(id) {
  const rows = [];
  // prefer the BASE weapon: a plain character lookup can land on that character's EVOLUTION
  // entry (this mislabelled Dimi's probe as sanction_halo instead of cyber_gauntlets_injection).
  const cands = Object.values(WEAPON_DEFS).filter(d => d && d.character === id);
  const def = cands.find(d => d.isEvolution === false) || cands[0] || null;
  for (const ang of ANGLES) {
    for (const dist of DISTS) {
      Math.random = mul(999); vclock = 0;
      try { globalThis.localStorage.clear(); } catch (_) {}
      const un = muteConsole();
      const g = new Game();
      g.audio = null; g.selectedCharacter = id; g.gameState = 'playing';
      g.reset(); g._enterEndless();
      const p = g.player;
      // clear the natural horde so exactly one target exists
      g.enemies.length = 0;
      let e;
      try { e = new Enemy('grunt', 1); } catch (_) { e = null; }
      if (!e) { un(); rows.push({ ang, dist, error: 'enemy ctor failed' }); continue; }
      const rad = ang * Math.PI / 180;
      e.pos.x = p.pos.x + Math.cos(rad) * dist;
      e.pos.y = p.pos.y + Math.sin(rad) * dist;
      e.hp = e.maxHp = 100000;          // never dies, never despawns, so the cell measures reach only
      e.baseSpeed = 0; e.speed = 0;     // frozen: the geometry must not drift during the window
      g.enemies.push(e);

      // aim straight along +x so "ang" is measured against a known facing
      const input = { keys: new Set(), mousePos: { x: p.pos.x + 4000, y: p.pos.y }, mouseDown: false };
      const before = e.hp;
      let ticks = 0;
      for (let f = 0; f < WINDOW * 60; f++) {
        vclock += 1000 / 60;
        if (g.upgradeUI) { try { g.selectUpgrade(0); } catch (_) { g.upgradeUI = null; } }
        if (g.mutationUI) { try { g.selectMutation(0); } catch (_) { g.mutationUI = null; } }
        e.pos.x = p.pos.x + Math.cos(rad) * dist;   // pin it every frame
        e.pos.y = p.pos.y + Math.sin(rad) * dist;
        e.baseSpeed = 0; e.speed = 0;
        const h0 = e.hp;
        try { g.update(1 / 60, input); } catch (_) { break; }
        if (e.hp < h0) ticks++;
        p.hp = p.maxHp; g.gameOver = false;
        if (g.enemies.indexOf(e) < 0) g.enemies.push(e);
      }
      un();
      rows.push({ ang, dist, damage: Math.round(before - e.hp), ticks });
    }
  }
  return { id, weapon: def ? def.id : null,
           declared: def ? { behavior: def.behavior, aoeRadius: def.baseStats?.aoeRadius,
                             damage: def.baseStats?.damage, cooldown: def.baseStats?.cooldown,
                             piercing: def.baseStats?.piercing, speed: def.baseStats?.speed } : null,
           rows };
}

const out = [];
for (const id of IDS) {
  const r = probe(id); out.push(r);
  console.error(`\n── ${r.id}  (${r.weapon}${r.declared ? ', ' + r.declared.behavior + ', aoe ' + r.declared.aoeRadius : ''}) ──`);
  console.error('  angle |' + DISTS.map(d => String(d).padStart(7)).join(''));
  for (const ang of ANGLES) {
    const cells = DISTS.map(d => {
      const c = r.rows.find(x => x.ang === ang && x.dist === d);
      return String(c ? (c.damage > 0 ? c.damage : '.') : '?').padStart(7);
    }).join('');
    console.error(`  ${String(ang).padStart(4)}° |${cells}`);
  }
  const reached = r.rows.filter(x => x.damage > 0);
  const dead = r.rows.filter(x => x.ang === 0 && x.damage === 0).map(x => x.dist);
  console.error(`  forward reach: ${reached.filter(x=>x.ang===0).length}/${DISTS.length} distances` +
    (dead.length ? `   NO DAMAGE straight ahead at: ${dead.join(', ')}px` : '   (all forward distances connect)'));
}
console.log(JSON.stringify(out, null, 1));
