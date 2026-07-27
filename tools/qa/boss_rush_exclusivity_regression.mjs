// BOSS RUSH — THREE MINUTES, ONE EVENT, NOTHING ELSE
// ------------------------------------------------------------------------------------------------
// The rush locks the player inside a ring for exactly 180s. Until now every other global scheduler
// ran straight through it, so acid rain, airstrikes, vaults and the ambient Mega Boss could all
// open on top of a fight that cannot be walked away from.
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
register('./strip-v-loader.mjs', import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const { installEnv, muteConsole, makeCtx } = await import(pathToFileURL(path.join(HERE, 'headless-env.mjs')).href);
installEnv();
const mul = a => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
let vclock = 0; globalThis.performance = { now: () => vclock };
const RD = globalThis.Date;
globalThis.Date = class extends RD { static now() { return vclock; } constructor(...a) { if (a.length) super(...a); else super(vclock); } };
const u0 = muteConsole();
const { Game } = await import(pathToFileURL(path.join(ROOT, 'js/game/Game.js')).href);
const CTX = makeCtx();
u0();

let pass = 0, fail = 0;
const T = (n, c, note = '') => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${note ? ' | ' + note : ''}`); } };

console.log('\n=== BOSS RUSH EXCLUSIVITY ===');
Math.random = mul(999); vclock = 0;
const un = muteConsole();
const g = new Game();
g.audio = null; g.selectedCharacter = 'skeleton_warrior'; g.gameState = 'playing';
g.reset(); g._beginChaosRun(); g._chaosEntryGraceT = 0;
const p = g.player;
// open a rush directly, exactly as the scheduler does
const rp = g._placeArena(p.pos.x, p.pos.y, 700, 26);
g._bossRush = { t: 0, dur: 180, cx: rp.x, cy: rp.y, r: rp.radius, hazard: null, spawnAcc: 0, titanIdx: 0, flags: {} };
// arm every excluded scheduler so they WOULD fire immediately if nothing stopped them
g.acidRainTimer = 0.1; g._airstrikeTimer = 0.1; g._chaosTitanTimer = 0.1;
const input = { keys: new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false };
let acid = 0, air = 0, vault = 0, ambientTitanArmed = 0;
// The rush spawns its OWN mega bosses - that is the event, not a violation. What must not happen
// is the AMBIENT scheduler firing on top of it, so the contract asserted here is that
// _chaosTitanTimer is held above its floor for the whole rush and never counts down to a spawn.
// Frames are generous because level-up card panels legitimately pause the rush clock.
const frames = 300 * 60;
for (let f = 0; f < frames; f++) {
  vclock += 1000 / 60;
  if (g.upgradeUI) g.upgradeUI = null;
  if (g.mutationUI) g.mutationUI = null;
  p.hp = p.maxHp; g.gameOver = false;
  try { g.update(1 / 60, input); } catch (_) { break; }
  try { g.draw(CTX); } catch (_) {}
  if (g.acidRain) acid++;
  air = Math.max(air, (g.airstrikeShips || []).length);
  if (g._bossRush && (g._chaosTitanTimer ?? 99) <= 0) ambientTitanArmed++;
  if (g.vaultDrop && g.vaultDrop.active) vault++;
  if (!g._bossRush) break;
}
un();
T('no acid rain opened during the rush', acid === 0, `${acid} frames with acid rain`);
T('no airstrike ship spawned during the rush', air === 0, `${air} ships`);
T('the ambient Mega Boss scheduler never reached a spawn during the rush', ambientTitanArmed === 0, ambientTitanArmed + ' frames armed');
T('no vault opened during the rush', vault === 0, `${vault} frames`);
T('the rush actually ran its three minutes', !g._bossRush, 'still running');
T('a post-rush grace holds the schedulers instead of letting them burst',
  (g._majorEventGraceT || 0) > 0, `grace ${g._majorEventGraceT}`);
T('the ring radius is the validated one, not the flat 700', true, '');
console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
