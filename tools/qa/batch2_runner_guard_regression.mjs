// BATCH 2 RUNNER GUARD — static + structural guards that the automated proof runner is
// isolated, bounded, and never leaks into a normal boot. Run: node tools/qa/batch2_runner_guard_regression.mjs
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const MAIN = fs.readFileSync(path.join(ROOT, 'js/main.js'), 'utf8');
const RUNNER = fs.readFileSync(path.join(ROOT, 'tools/qa/browser/batch2-proof-runner.js'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const RUNNER_NC = RUNNER.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');   // strip comments
const mod = await import(path.join(ROOT, 'tools/qa/browser/batch2-proof-runner.js'));
let pass = 0, fail = 0;
const T = (n, f) => { let ok = false, note = ''; try { const r = f(); ok = r === true; if (typeof r === 'string') note = r; } catch (e) { note = 'THREW: ' + e.message; } ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${note ? ' — ' + note : ''}`); };

console.log('═══ BATCH 2 RUNNER GUARD ═══\n── not in the normal module graph ──');
T('runner is DYNAMIC-imported, never statically imported', () =>
  /import\(\s*['"]\.\.\/tools\/qa\/browser\/batch2-proof-runner\.js/.test(MAIN) &&
  !/^\s*import[^\n]*from[^\n]*batch2-proof-runner/m.test(MAIN));
T('index.html does not load the runner (not in page graph)', () => !/batch2-proof-runner/.test(HTML));
T('dynamic import sits AFTER both QA gates', () => {
  const g = MAIN.indexOf("params.get('qa') !== '1' || !optIn) return;");
  const imp = MAIN.indexOf("import('../tools/qa/browser/batch2-proof-runner.js");
  return g > 0 && imp > g; });
T('normal boot exposes no runBatch2Proof (only via gated install)', () =>
  !/window\.__phenixQA\.runBatch2Proof\s*=/.test(MAIN) && /installBatch2Proof/.test(MAIN));

console.log('\n── no raw Game / no mutable references ──');
T('runner never constructs or imports Game', () => !/new Game\b/.test(RUNNER) && !/from ['"][^'"]*Game\.js/.test(RUNNER));
T('runner never reaches a raw engine handle', () => !/__phenixQA\._game/.test(RUNNER) && !/\bwindow\.game\b/.test(RUNNER));
T('runner drives ONLY through the qa bridge', () => /qa\.step\(/.test(RUNNER_NC) && /qa\.snapshot\(/.test(RUNNER_NC));
T('bridge never exposes the whole Game object', () => !/window\.__phenix\s*=\s*game/.test(MAIN));

console.log('\n── 24 states, all bounded and timed ──');
T('exactly 24 states, ids 1..24', () => mod.STATES.length === 24 && mod.STATES.every((s, i) => s.id === i + 1));
T('every state has a positive integer maxSteps (bounded)', () => mod.STATES.every(s => Number.isInteger(s.maxSteps) && s.maxSteps > 0));
T('every state has a predicate function', () => mod.STATES.every(s => typeof s.predicate === 'function'));
T('every state has a prepare function', () => mod.STATES.every(s => typeof s.prepare === 'function'));
T('driveState enforces a per-state wall-clock timeout', () => /timeoutMs/.test(RUNNER) && /env\.now\(\) - t0 > timeoutMs/.test(RUNNER));
T('a global iteration cap backstops every loop', () => /budget\.spent >= budget\.cap/.test(RUNNER));

console.log('\n── capture is a real-canvas photograph ──');
T('capture reads real canvas pixels (getImageData) + toDataURL', () => /getImageData/.test(RUNNER) && /toDataURL/.test(RUNNER));
T('capture requires a real canvas and rejects blank frames', () => /requireRealCanvas/.test(RUNNER) && /capture did not come from a real canvas/.test(RUNNER) && /captured frame is blank/.test(RUNNER));

console.log('\n── fail-fast + storage gate ──');
T('predicate failure returns FAIL with the state id', () => /function throwFail/.test(RUNNER) && /predicate never became true/.test(RUNNER) && /\[BATCH2 FAIL\] state/.test(RUNNER));
T('storageSnapshot uses length + key(i) (no Object.entries)', () => /for \(let i = 0; i < localStorage\.length; i\+\+\)/.test(MAIN) && /localStorage\.key\(i\)/.test(MAIN));
T('storage gate requires byte-identical or FAILS', () => /storage not byte-identical/.test(RUNNER) && /storageIdentical/.test(RUNNER));

console.log('\n── save isolation intact (meta + achievements) ──');
T('QA isolates meta save', () => /m\._save = \(\) => \{\};/.test(MAIN) && /restoreSave/.test(MAIN));
T('QA isolates the platform achievement journal too', () => /PlatformAchievements\.unlock = \(\) => \{\};/.test(MAIN));

console.log(`\n═══ ${pass} PASS · ${fail} FAIL ═══`);
process.exit(fail ? 1 : 0);
