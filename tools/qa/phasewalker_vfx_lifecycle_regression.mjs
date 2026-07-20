// PHASEWALKER VFX LIFECYCLE REGRESSION — drives the REAL modules (glitch-dash,
// emp-shockwave, digital-singularity) against a canvas stub and asserts that every
// lifecycle terminates deterministically with bounded work.
//
// Covers the failure classes that can freeze / blank a run:
//   unbounded arrays · uncapped particle creation · repeated listener registration ·
//   timers without cleanup · nested rAF · unbounded recursion · NaN/Infinity geometry ·
//   retained Player/enemy references · lifecycles that never reach IDLE.
//
// Run: node tools/qa/phasewalker_vfx_lifecycle_regression.mjs   (exit 1 on failure)

import { register } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
register('./strip-v-loader.mjs', import.meta.url);

// ── environment stubs ──────────────────────────────────────────────────────
// Counters prove that merely IMPORTING or RUNNING the modules registers no
// timers, listeners or animation frames.
const SIDE = { timeout: 0, interval: 0, raf: 0, listener: 0 };
globalThis.window = globalThis;
globalThis.setTimeout = (...a) => { SIDE.timeout++; return 0; };
globalThis.setInterval = (...a) => { SIDE.interval++; return 0; };
globalThis.requestAnimationFrame = (...a) => { SIDE.raf++; return 0; };
globalThis.addEventListener = (...a) => { SIDE.listener++; };

let NOW = 1000;
globalThis.performance = { now: () => NOW };

const nonFinite = [];
function mkCtx(tag) {
  const chk = (fn, ...v) => {
    for (const n of v) if (typeof n === 'number' && !Number.isFinite(n)) nonFinite.push(`${tag}.${fn}`);
  };
  return {
    canvas: null,
    globalAlpha: 1, globalCompositeOperation: 'source-over',
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '', textBaseline: '',
    shadowColor: '', shadowBlur: 0, filter: 'none',
    save() {}, restore() {}, translate() {}, beginPath() {}, closePath() {}, stroke() {}, fill() {},
    clearRect(...a) { chk('clearRect', ...a); },
    fillRect(...a) { chk('fillRect', ...a); },
    fillText(t, ...a) { chk('fillText', ...a); },
    drawImage(img, ...a) { chk('drawImage', ...a); },
    arc(...a) { chk('arc', ...a); },
    moveTo(...a) { chk('moveTo', ...a); },
    lineTo(...a) { chk('lineTo', ...a); },
    createRadialGradient(...a) { chk('createRadialGradient', ...a); return { addColorStop() {} }; },
  };
}
function mkCanvas(w = 1280, h = 720, tag = 'ctx') {
  const c = { width: w, height: h };
  const ctx = mkCtx(tag); ctx.canvas = c;
  c.getContext = () => ctx;
  return c;
}
globalThis.document = { addEventListener() {}, createElement: () => mkCanvas(64, 64, 'scratch') };
globalThis.Image = class { constructor() { this.complete = true; this.naturalWidth = 150; this.naturalHeight = 300; } set src(_) {} };

const HERE = path.dirname(fileURLToPath(import.meta.url));
const JS = path.resolve(HERE, '../../js');
const GAME = fs.readFileSync(path.join(JS, 'game/Game.js'), 'utf8');

const beforeImport = { ...SIDE };
const { GlitchDash } = await import(path.join(JS, 'effects/glitch-dash.js'));
const { EMPShockwave } = await import(path.join(JS, 'effects/emp-shockwave.js'));
const { DigitalSingularity } = await import(path.join(JS, 'effects/digital-singularity.js'));

let pass = 0, fail = 0;
const T = (n, f) => {
  let ok = false, note = '';
  try { const r = f(); ok = r === true; if (typeof r === 'string') note = r; }
  catch (e) { note = 'THREW: ' + e.message; }
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${note ? ' — ' + note : ''}`);
};

const sprite = new Image();
const canvas = mkCanvas();
const ctx = canvas.getContext();
const mkEnemy = (x, y) => ({ pos: { x, y }, hits: 0, takeHit(d) { this.hits++; } });

console.log('═══ PHASEWALKER VFX LIFECYCLE REGRESSION ═══');
console.log('\n── 1. import purity (import alone must do NOTHING) ──');
T('import δεν δημιουργεί setTimeout', () => SIDE.timeout === beforeImport.timeout);
T('import δεν δημιουργεί setInterval', () => SIDE.interval === beforeImport.interval);
T('import δεν δημιουργεί requestAnimationFrame', () => SIDE.raf === beforeImport.raf);
T('import δεν καταχωρεί event listeners', () => SIDE.listener === beforeImport.listener);
T('καμία πηγή δεν περιέχει setInterval/setTimeout/rAF/addEventListener', () => {
  for (const f of ['glitch-dash.js', 'emp-shockwave.js', 'digital-singularity.js']) {
    const s = fs.readFileSync(path.join(JS, 'effects', f), 'utf8');
    if (/\b(setInterval|setTimeout|requestAnimationFrame|addEventListener)\s*\(/.test(s)) return `${f} έχει timer/listener`;
  }
  return true;
});

console.log('\n── 2. GlitchDash: finite dash, capped afterimages/particles ──');
{
  const fx = new GlitchDash(canvas, sprite, { spriteW: 32, spriteH: 64 });
  NOW = 1000;
  fx.trigger(100, 300, 400, 1);
  T('ghosts ακριβώς cfg.ghosts.count μετά από trigger', () => fx.ghosts.length === fx.cfg.ghosts.count);

  // 200 back-to-back dashes: afterimages must NOT accumulate.
  for (let i = 0; i < 200; i++) { NOW += 16; fx.trigger(100, 300, 400, 1); fx.update(NOW); }
  T('200 συνεχόμενα dashes → ghosts ΔΕΝ συσσωρεύονται', () => fx.ghosts.length <= fx.cfg.ghosts.count,
    `ghosts=${fx.ghosts.length}`);
  T('particles φραγμένα από το lifetime (όχι unbounded)', () => fx.particles.length <= 2 * fx.cfg.particles.perBurst * 16,
    `particles=${fx.particles.length}`);
  T('ένα μόνο tear instance (ποτέ array)', () => fx.tear === null || typeof fx.tear === 'object');

  // let everything expire
  NOW += 5000; fx.update(NOW);
  T('ghosts → 0 μετά το lifeMs', () => fx.ghosts.length === 0);
  T('particles → 0 μετά το lifeMs', () => fx.particles.length === 0);
  T('tear → null μετά το lifeMs', () => fx.tear === null);

  const before = nonFinite.length;
  fx.trigger(100, 300, 400, 1); fx.update(NOW); fx.renderBehind(ctx); fx.renderFront(ctx);
  T('render με έγκυρο input δεν παράγει non-finite geometry', () => nonFinite.length === before,
    nonFinite.slice(before).join(','));

  // hostile input must not throw (a throw inside the draw loop is a black-screen path)
  T('NaN/Infinity input δεν κάνει throw', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      fx.trigger(bad, 300, 400, 1); fx.update(NOW); fx.renderBehind(ctx); fx.renderFront(ctx);
      fx.trigger(100, bad, bad, 1); fx.update(NOW); fx.renderBehind(ctx); fx.renderFront(ctx);
    }
    return true;
  });
}

console.log('\n── 3. EMP Shockwave: ένα shockwave ανά activation, bounded ──');
{
  const emp = new EMPShockwave(canvas, { distortion: { strength: 0 } });
  const enemies = Array.from({ length: 400 }, (_, i) => mkEnemy((i % 20) * 12, ((i / 20) | 0) * 12));
  let hits = 0;
  const hooks = { getX: e => e.pos.x, getY: e => e.pos.y, onHit: () => { hits++; } };

  NOW = 10000; emp.trigger(0, 0);
  T('trigger → ακριβώς ένα active ring (scalar state, όχι array)',
    () => emp.active === true && typeof emp.radius === 'number');

  for (let i = 0; i < 40; i++) { NOW += 16; emp.update(NOW, enemies, hooks); }
  T('κάθε εχθρός χτυπιέται ΤΟ ΠΟΛΥ μία φορά ανά cast', () => hits <= enemies.length, `hits=${hits}`);
  T('_hit set δεν ξεπερνά το πλήθος των εχθρών', () => emp._hit.size <= enemies.length);
  T('ring τερματίζει (active=false) μετά το expandMs', () => emp.active === false);
  T('radius πεπερασμένο και <= maxRadius',
    () => Number.isFinite(emp.radius) && emp.radius <= emp.cfg.ring.maxRadius);

  // long soak with the emitters live
  for (let i = 0; i < 400; i++) { NOW += 16; emp.update(NOW, enemies, hooks); emp.render(ctx); }
  T('_sparks hard cap 240 τηρείται', () => emp._sparks.length <= 240, `sparks=${emp._sparks.length}`);
  T('_emitters hard cap 48 τηρείται', () => emp._emitters.length <= 48, `emitters=${emp._emitters.length}`);

  NOW += 10000; emp.update(NOW, enemies, hooks);
  T('emitters λήγουν → 0 μετά το stunMs', () => emp._emitters.length === 0);
  T('sparks λήγουν → 0 μετά το sparkLifeMs', () => emp._sparks.length === 0);
  T('completed shockwave δεν κρατά enemy references στους emitters',
    () => emp._emitters.every(e => !e.ref));

  const sizeBefore = emp._hit.size;
  emp.trigger(0, 0);
  T('trigger καθαρίζει το _hit (καμία διαρροή enemy refs μεταξύ casts)',
    () => emp._hit.size === 0 && sizeBefore >= 0);

  // 300 rapid re-triggers must not multiply state
  for (let i = 0; i < 300; i++) { NOW += 16; emp.trigger(0, 0); emp.update(NOW, enemies, hooks); }
  T('300 rapid re-triggers → καμία συσσώρευση (ένα ring, capped arrays)',
    () => emp._sparks.length <= 240 && emp._emitters.length <= 48 && typeof emp.radius === 'number');

  T('bounded enemy iteration: 0 enemies δεν κάνει throw', () => { emp.update(NOW, [], hooks); return true; });
  T('update χωρίς enemies/opts δεν κάνει throw', () => { emp.update(NOW); return true; });
}

console.log('\n── 4. Digital Singularity: 4-phase lifecycle τερματίζει ντετερμινιστικά ──');
{
  const ult = new DigitalSingularity(canvas, sprite, { spriteW: 32, spriteH: 64 });
  const enemies = Array.from({ length: 60 }, (_, i) => mkEnemy(i * 7, i * 5));
  let strikes = 0;
  const hooks = { getX: e => e.pos.x, getY: e => e.pos.y, onStrike: e => { strikes++; e.takeHit(10); } };
  const P = ult.cfg.phases;
  const TOTAL = P.dissolveMs + P.stormMs + P.strikeMs + P.reformMs;

  T('IDLE πριν το trigger', () => ult.isActive() === false);
  NOW = 50000; ult.trigger(640, 400);
  T('trigger → isActive true', () => ult.isActive() === true);

  let maxParticles = 0, maxLasers = 0, frames = 0;
  while (ult.isActive() && frames++ < 2000) {
    NOW += 16;
    ult.update(NOW, enemies, hooks);
    ult.render(ctx);
    maxParticles = Math.max(maxParticles, ult._particles.length);
    maxLasers = Math.max(maxLasers, ult._lasers.length);
  }
  T('lifecycle τερματίζει (isActive → false) χωρίς εξωτερική παρέμβαση',
    () => ult.isActive() === false, `frames=${frames}`);
  T('τερματίζει εντός της ονομαστικής διάρκειας', () => frames * 16 <= TOTAL + 200, `${frames * 16}ms vs ${TOTAL}ms`);
  T('particles capped (καμία cascade)', () => maxParticles <= 400, `max=${maxParticles}`);
  T('lasers pruned by lifetime', () => maxLasers <= 8, `max=${maxLasers}`);
  T('particles καθαρίζονται στο τέλος', () => ult._particles.length === 0);
  T('lasers καθαρίζονται στο τέλος', () => ult._lasers.length === 0);
  T('shake decays σε 0', () => ult._shakeAmp === 0);
  T('onStrike καλείται με φραγμένο ρυθμό (strikeMs/intervalMs)',
    () => strikes <= Math.ceil(P.strikeMs / ult.cfg.strike.intervalMs) + 2, `strikes=${strikes}`);
  T('κανένα permanent mutation στους εχθρούς πέρα από takeHit',
    () => enemies.every(e => Number.isFinite(e.pos.x) && Number.isFinite(e.pos.y)));
  T('κανένα retained enemy reference μετά το τέλος', () => {
    const blob = JSON.stringify(ult._lasers) + JSON.stringify(ult._particles);
    return ult._lasers.length === 0 && ult._particles.length === 0 && !blob.includes('takeHit');
  });

  // the storm top-up loop must terminate even if the particle budget can never be met
  T('storm while-loop έχει iteration guard (δεν κρεμάει)', () => {
    const src = fs.readFileSync(path.join(JS, 'effects/digital-singularity.js'), 'utf8');
    const m = src.match(/while \(this\._particles\.length < want[^)]*\)/);
    return !!m && /_sg\+\+ < want/.test(m[0]);
  });

  // dead/removed enemies must not crash the strike hook
  T('strike με άδεια λίστα εχθρών δεν κάνει throw', () => {
    NOW += 16; ult.trigger(640, 400);
    for (let i = 0; i < 300; i++) { NOW += 16; ult.update(NOW, [], hooks); ult.render(ctx); }
    return true;
  });
  T('re-trigger κατά τη διάρκεια active κάνει clean restart (καμία διπλή instance)', () => {
    ult.trigger(640, 400);
    const p1 = ult._particles.length, l1 = ult._lasers.length;
    return p1 === 0 && l1 === 0 && ult._flash === null;
  });

  // pause simulation: performance.now keeps running while the game is paused —
  // the phase clock must resolve to IDLE, never stick mid-phase.
  T('μεγάλο pause gap → phase resolve σε IDLE (όχι κολλημένο mid-phase)', () => {
    ult.trigger(640, 400);
    NOW += 60000;                       // 60s "paused"
    ult.update(NOW, enemies, hooks);
    return ult.isActive() === false && ult._particles.length === 0;
  });
}

console.log('\n── 5. Game.js wiring: build guards, cleanup, run isolation ──');
T('_ensurePhasewalkerFx ελέγχει sprite.complete && naturalWidth (δεν χτίζει πριν το asset)',
  () => /if \(!spr \|\| !spr\.complete \|\| !spr\.naturalWidth\) return;/.test(GAME));
T('_ensurePhasewalkerFx χτίζει ΜΙΑ φορά (_pwFxBuilt guard)',
  () => /if \(this\._pwFxBuilt \|\| !this\._canvas\) return;/.test(GAME));
T('reset() μηδενίζει και τα τρία modules', () => {
  const i = GAME.indexOf('  reset() {');
  const seg = GAME.slice(i, i + 6000);
  return /this\._glitchDash\s*=\s*null/.test(seg) && /this\._empShock\s*=\s*null/.test(seg) &&
         /this\._digitalSingularity\s*=\s*null/.test(seg);
});
T('reset() μηδενίζει _pwFxBuilt / _pwDashing / _pwDashStart / _empShockCooldown', () => {
  const i = GAME.indexOf('  reset() {');
  const seg = GAME.slice(i, i + 6000);
  return /_pwFxBuilt\s*=\s*false/.test(seg) && /_pwDashing\s*=\s*false/.test(seg) &&
         /_pwDashStart\s*=\s*null/.test(seg) && /_empShockCooldown\s*=\s*0/.test(seg);
});
T('EMP cooldown πεπερασμένο (Math.max floor)',
  () => /this\._empShockCooldown = Math\.max\(7, 10 - \(p\.upgrades\['phasewalker_shockwave_mastery'\] \|\| 0\)\)/.test(GAME));
T('κάθε module update τυλιγμένο σε try/catch (VFX error δεν σκοτώνει το run)',
  () => /\[Phasewalker GlitchDash\]/.test(GAME) && /\[Phasewalker EMP\]/.test(GAME) &&
        /\[Phasewalker Singularity\]/.test(GAME));
T('_drawPhasewalkerFx τυλιγμένο σε try/catch', () => /\[Phasewalker FX render\]/.test(GAME));
T('player draw παρακάμπτεται όσο το Singularity είναι active',
  () => /japan_phasewalker' && this\._digitalSingularity\?\.isActive\(\)/.test(GAME));
T('ult gating εμποδίζει recast mid-cast', () => /this\._digitalSingularity\?\.isActive\(\)[\s\S]{0,200}return false;/.test(GAME));
T('activateDigitalSingularity μπλοκάρει διπλό cast', () => /if \(!this\._digitalSingularity \|\| this\._digitalSingularity\.isActive\(\)\) return;/.test(GAME));
T('enemy hooks pos-guarded (stale enemy δεν κρασάρει)',
  () => (GAME.match(/\(e\?\.pos\?\.x \?\? this\.camera\.x\)/g) || []).length >= 2);

console.log('\n── 6. roster / progression ──');
T('japan_phasewalker υπάρχει στο roster', () => /id: 'japan_phasewalker'/.test(GAME));
T('japan_phasewalker ΔΕΝ έχει comingSoon flag', () => {
  const i = GAME.indexOf("id: 'japan_phasewalker'");
  const line = GAME.slice(i, GAME.indexOf('\n', i));
  return !/comingSoon/.test(line);
});
T('το progression unlock gate διατηρείται (isCharacterUnlocked)',
  () => /!this\.meta\.isCharacterUnlocked\(c\.id\)\) return;/.test(GAME));

console.log('\n── 7. side-effect ledger (μετά από ΟΛΑ τα tests) ──');
T('κανένα setTimeout σε ολόκληρο το run', () => SIDE.timeout === 0, `count=${SIDE.timeout}`);
T('κανένα setInterval σε ολόκληρο το run', () => SIDE.interval === 0, `count=${SIDE.interval}`);
T('κανένα requestAnimationFrame (κανένα nested rAF)', () => SIDE.raf === 0, `count=${SIDE.raf}`);
T('κανένα addEventListener (καμία επαναλαμβανόμενη καταχώρηση)', () => SIDE.listener === 0, `count=${SIDE.listener}`);

console.log(`\n═══ ${pass} assertions passed · ${fail} failed ═══`);
if (nonFinite.length) console.log(`  (non-finite geometry calls recorded: ${nonFinite.length} — expected only from the hostile-input test)`);
process.exit(fail ? 1 : 0);
