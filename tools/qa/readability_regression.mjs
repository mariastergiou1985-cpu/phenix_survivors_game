// COMBAT READABILITY REGRESSION — real modules, no browser, no network.
// Run: node tools/qa/readability_regression.mjs   (exit 1 on any failure)
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
register('./strip-v-loader.mjs', import.meta.url);
globalThis.window = globalThis;
globalThis.document = { addEventListener(){}, createElement: () => ({ style:{}, getContext:()=>null, addEventListener(){} }) };
globalThis.Image = class { constructor(){ this.complete=false; this.naturalWidth=0; } set src(_){} };
if (!globalThis.performance) globalThis.performance = { now: () => Date.now() };

const HERE = path.dirname(fileURLToPath(import.meta.url));
const JS   = path.resolve(HERE, '../../js');
const { selectHpBarEnemies, hasHpBarSlot, MAX_COMMON_BARS } = await import(path.join(JS, 'entities/Enemy.js'));

let pass=0, fail=0;
const T=(n,f)=>{let ok=false,note='';try{const r=f();ok=r===true;if(typeof r==='string')note=r;}
  catch(e){note='THREW: '+e.message;}ok?pass++:fail++;console.log(`  ${ok?'PASS':'FAIL'}  ${n}${note?' — '+note:''}`);};

const mk = (x,y,hp,max,t,opts={}) => ({ pos:{x,y}, hp, maxHp:max, _hpBarT:t, dead:false,
  isElite:!!opts.elite, isMegaBoss:!!opts.mega, isBoss:()=>!!opts.boss });
const player = { x:0, y:0 };

console.log('═══ COMBAT READABILITY REGRESSION ═══\n── common-enemy HP bar budget ──');

// 60 damaged commons, all recently hit — the developed-build worst case
const many = [];
for (let i=0;i<60;i++) many.push(mk(Math.cos(i)*(80+i*15), Math.sin(i)*(80+i*15), 40, 100, 0.5));
selectHpBarEnemies(many, player);
const shown = many.filter(hasHpBarSlot).length;
T(`60 damaged commons → visible bars <= ${MAX_COMMON_BARS}`, ()=>shown<=MAX_COMMON_BARS||'got '+shown);
T('budget γεμίζει (δεν είναι 0)', ()=>shown===MAX_COMMON_BARS||'got '+shown);

// proximity priority
const near = many.filter(hasHpBarSlot).map(e=>Math.hypot(e.pos.x-player.x,e.pos.y-player.y));
const far  = many.filter(e=>!hasHpBarSlot(e)).map(e=>Math.hypot(e.pos.x-player.x,e.pos.y-player.y));
T('οι επιλεγμένοι είναι κοντινότεροι από τους απορριφθέντες',
  ()=>Math.max(...near) <= Math.min(...far)*1.35 || `near max ${Math.max(...near).toFixed(0)} vs far min ${Math.min(...far).toFixed(0)}`);

// full-HP distant enemies must never qualify
const fulls = [mk(4000,0,100,100,0.5), mk(-4000,0,100,100,0.5)];
selectHpBarEnemies(fulls, player);
T('distant full-HP enemy → καμία bar', ()=>fulls.filter(hasHpBarSlot).length===0);

// bosses/elites are exempt from the budget (they bypass hasHpBarSlot in draw)
const vips = [mk(3000,0,50,100,0,{boss:true}), mk(3100,0,50,100,0,{mega:true}), mk(3200,0,50,100,0,{elite:true})];
selectHpBarEnemies([...many, ...vips], player);
T('bosses/mega/elites ΔΕΝ καταναλώνουν budget slots', ()=>vips.every(v=>!hasHpBarSlot(v)));
T('commons ακόμα <= cap με VIPs παρόντες',
  ()=>[...many,...vips].filter(hasHpBarSlot).length<=MAX_COMMON_BARS);

// wounded bias: an equidistant badly-hurt enemy should outrank a lightly-hurt one
const pair = [mk(500,0,95,100,0.5), mk(500,1,10,100,0.5)];
selectHpBarEnemies(pair, player);
T('βαριά τραυματισμένος προηγείται σε ίση απόσταση', ()=>hasHpBarSlot(pair[1]));

// expired fade window drops out
const stale = [mk(100,0,40,100,0), mk(120,0,40,100,-1)];
selectHpBarEnemies(stale, player);
T('ληγμένο fade window → καμία bar', ()=>stale.filter(hasHpBarSlot).length===0);

T('dead enemies αγνοούνται', ()=>{const d=[mk(50,0,40,100,0.5)];d[0].dead=true;selectHpBarEnemies(d,player);return !hasHpBarSlot(d[0]);});

console.log(`\n═══ ${pass} PASS · ${fail} FAIL ═══`);
process.exit(fail?1:0);
