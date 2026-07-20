// SPRITE FILTERING POLICY — two explicit tables, two draw paths, default 'pixel'.
// Run: node tools/qa/sprite_filtering_regression.mjs   (exit 1 on failure)
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const EN   = fs.readFileSync(path.resolve(HERE,'../../js/entities/Enemy.js'),'utf8');
const GM   = fs.readFileSync(path.resolve(HERE,'../../js/game/Game.js'),'utf8');
const PL   = fs.readFileSync(path.resolve(HERE,'../../js/entities/Player.js'),'utf8');

let pass=0, fail=0;
const T=(n,f)=>{let ok=false,note='';try{const r=f();ok=r===true;if(typeof r==='string')note=r;}
  catch(e){note='THREW: '+e.message;}ok?pass++:fail++;console.log(`  ${ok?'PASS':'FAIL'}  ${n}${note?' — '+note:''}`);};
const block = (src, start) => { const i=src.indexOf(start); const j=src.indexOf('});', i); return src.slice(i,j); };

console.log('═══ SPRITE FILTERING POLICY ═══\n── canonical keys ──');
const smap = (()=>{ const i=EN.indexOf('const spriteMap = {'); return EN.slice(i, EN.indexOf('};', i)); })();
T("'Void Widow' είναι πραγματικό spriteMap key", ()=>smap.includes("'Void Widow'"));
T("'Cyber Dragon' είναι πραγματικό bossSprites key", ()=>/'Cyber Dragon':\s+this\._cyberDragonSprite/.test(GM));
T('το enemy lookup χρησιμοποιεί enemyType (όχι display label)',
  ()=>/spriteMap\[this\.enemyType\]/.test(EN) && /ENEMY_SPRITE_FILTERING\[enemyType\]/.test(EN));

console.log('\n── πίνακες ──');
const et = block(EN,'const ENEMY_SPRITE_FILTERING = Object.freeze({');
const bt = block(GM,'const BOSS_SPRITE_FILTERING = Object.freeze({');
T('ENEMY table υπάρχει και είναι frozen', ()=>/ENEMY_SPRITE_FILTERING = Object\.freeze\(/.test(EN));
T('BOSS table υπάρχει και είναι frozen',  ()=>/BOSS_SPRITE_FILTERING = Object\.freeze\(/.test(GM));
T('ENEMY table: ΜΟΝΟ Void Widow σημειωμένο smooth',
  ()=>(et.match(/'smooth'/g)||[]).length===1 && et.includes("'Void Widow': 'smooth'"));
T('BOSS table: ΜΟΝΟ Cyber Dragon σημειωμένο smooth',
  ()=>(bt.match(/'smooth'/g)||[]).length===1 && bt.includes("'Cyber Dragon': 'smooth'"));

console.log('\n── ασφαλές default ──');
T("enemy default = 'pixel'", ()=>/ENEMY_SPRITE_FILTERING\[enemyType\] \?\? 'pixel'/.test(EN));
T("boss default = 'pixel'",  ()=>/BOSS_SPRITE_FILTERING\['Cyber Dragon'\] \?\? 'pixel'/.test(GM));
T('άγνωστο enemy παίρνει pixel (μοντέλο)',
  ()=>{const tbl={'Void Widow':'smooth'}; return (tbl['Glitch Drone'] ?? 'pixel')==='pixel';});

console.log('\n── καμία αυτόματη ταξινόμηση ──');
T('κανένα classification από dimensions/ratio/filename',
  ()=>!/naturalWidth\s*[><]/.test(et+bt) && !/includes\(['"](boss|dragon|glitch)/i.test(et+bt));

console.log('\n── draw paths ──');
T('Enemy.draw τιμά το spriteFiltering', ()=>/const smoothSprite = this\.spriteFiltering === 'smooth'/.test(EN));
T('Enemy.draw θέτει imageSmoothingEnabled από τη σημαία', ()=>/ctx\.imageSmoothingEnabled = smoothSprite;/.test(EN));
T('Enemy.draw επαναφέρει σε true μετά', ()=>/drawImage\(this\.sprite[\s\S]{0,140}imageSmoothingEnabled = true;/.test(EN));
T('boss draw path τιμά τον δικό του πίνακα', ()=>/smoothSprite[\s\S]{0,200}drawImage\(sp,/.test(GM));
T('high quality μόνο όταν smooth', ()=>{
  const a=/smoothSprite && 'imageSmoothingQuality' in ctx/.test(EN);
  const b=/smoothSprite && 'imageSmoothingQuality' in ctx/.test(GM);
  return a && b; });
T('boss draw είναι μέσα σε ctx.save()', ()=>{
  const i=GM.indexOf("const sp = this._cyberDragonSprite;");
  return GM.lastIndexOf('ctx.save()', i) > GM.lastIndexOf('ctx.restore()', i); });

console.log('\n── καμία παράπλευρη αλλαγή ──');
T('CSS image-rendering αμετάβλητο',
  ()=>/image-rendering: pixelated/.test(fs.readFileSync(path.resolve(HERE,'../../index.html'),'utf8')));
T('draw scale αμετάβλητο (radius*2 / radius*2.4)',
  ()=>/this\.radius \* 2, this\.radius \* 2\)/.test(EN) && /d\.radius \* 2\.4/.test(GM));
T('ENEMY_RADIUS αμετάβλητο', ()=>/this\.radius\s+= ENEMY_RADIUS;/.test(EN));


console.log('\n── player canvas-state determinism ──');
// Player.draw() must not inherit filtering from whatever drew before it.
const pdraw = (()=>{ const i=PL.indexOf('OPAQUE-SPRITE GUARANTEE');
  const d=PL.indexOf('ctx.drawImage(spr', i);
  return PL.slice(i, PL.indexOf('ctx.restore()', d)); })();
T('Player.draw καρφώνει globalAlpha', ()=>/ctx\.globalAlpha = 1;/.test(pdraw));
T('Player.draw καρφώνει globalCompositeOperation', ()=>/globalCompositeOperation = 'source-over';/.test(pdraw));
T('Player.draw καρφώνει imageSmoothingEnabled', ()=>/ctx\.imageSmoothingEnabled = true;/.test(pdraw));
T('το pin γίνεται ΠΡΙΝ την πραγματική κλήση drawImage',
  // 'drawImage' also appears in the comment above, so match the actual call site.
  ()=>pdraw.indexOf('ctx.imageSmoothingEnabled') < pdraw.indexOf('ctx.drawImage(spr'));
T('όλα μέσα σε ctx.save()', ()=>{
  const i=PL.indexOf('OPAQUE-SPRITE GUARANTEE');
  return PL.lastIndexOf('ctx.save()', i) > PL.lastIndexOf('ctx.restore()', i); });
T('ο χαρακτήρας ΔΕΝ κληρονομεί το enemy filtering (enemy = flag-driven, player = pinned)',
  ()=>/ctx\.imageSmoothingEnabled = smoothSprite;/.test(EN) && /ctx\.imageSmoothingEnabled = true;/.test(pdraw));
T('character filtering ανεξάρτητο από enemy tables',
  ()=>!pdraw.includes('ENEMY_SPRITE_FILTERING') && !pdraw.includes('BOSS_SPRITE_FILTERING'));
T('κανένα blur/τεχνητό antialias στον Eddie ή σε άλλον',
  ()=>!/filter\s*=\s*['"`]blur/.test(pdraw));

console.log(`\n═══ ${pass} PASS · ${fail} FAIL ═══`);
process.exit(fail?1:0);
