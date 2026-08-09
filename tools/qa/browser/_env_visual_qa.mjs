// Visual QA harness for the environmental effect layers. Plays Act 1, Endless and Chaos, samples
// the screen-space overlay layers in isolation (draw the layer onto a clean canvas and measure what
// it deposits), and writes screenshots. READ-ONLY probe — it changes nothing.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT  = '/tmp/env_visual_qa';
fs.mkdirSync(OUT, { recursive: true });
const PORT = Number(process.argv[2]) || 9301;
const EXE  = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium';
const MIME = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.png':'image/png',
               '.jpg':'image/jpeg','.json':'application/json','.ogg':'audio/ogg','.mp3':'audio/mpeg',
               '.wav':'audio/wav','.mp4':'video/mp4' };
const srv = http.createServer((req,res)=>{
  let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/index.html';
  const f=path.join(ROOT,p);
  if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});
  fs.createReadStream(f).pipe(res);
});
const GAME_V = fs.readFileSync(path.join(ROOT,'js/main.js'),'utf8').match(/Game\.js\?v=(\d+)/)[1];
await new Promise(r=>srv.listen(PORT,'127.0.0.1',r));

const browser = await chromium.launch({ executablePath: EXE,
  args:['--no-sandbox','--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport:{width:1440,height:900} });
const cdp  = await page.context().newCDPSession(page);
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
page.on('console',m=>{ if(m.type()==='error'&&!/Failed to load resource/.test(m.text())) errs.push(m.text()); });
await page.route(/https?:\/\/(?!127\.0\.0\.1)/, r=>{
  const u=r.request().url();
  if(/fonts\.googleapis/.test(u)) return r.fulfill({status:200,contentType:'text/css',body:'/*x*/'});
  return r.abort();
});
await page.goto(`http://127.0.0.1:${PORT}/index.html?nosw=1`,{waitUntil:'domcontentloaded'});
await page.waitForSelector('#cgm-overlay',{timeout:20000});
await page.waitForTimeout(1300);
await page.evaluate(async (v)=>{
  const mod=await import(`./js/game/Game.js?v=${v}`);
  await new Promise(res=>{const o=mod.Game.prototype.update;
    mod.Game.prototype.update=function(...a){window.__g=this;mod.Game.prototype.update=o;res();return o.apply(this,a);};});
},GAME_V);

await page.evaluate(()=>{
  const g=window.__g;
  g.meta._save=()=>{}; g.audio=new Proxy({},{get:()=>()=>{}});
  window.__IN={keys:new Set(),mousePos:{x:0,y:0},mouseDown:false};
  window.__step=(n)=>{for(let i=0;i<n;i++){ if(g.upgradeUI)g.upgradeUI=null; if(g.mutationUI)g.mutationUI=null;
    if(g.player)g.player.hp=g.player.maxHp; try{g.update(1/60,window.__IN);}catch(e){window.__err=String(e);} }};
  window.__ctx=()=>(document.querySelector('canvas#game')||[...document.querySelectorAll('canvas')].find(x=>x.width>400)).getContext('2d');
  try{g._hideCharSelectOverlay?.();}catch(_){} try{g._hideMenuOverlay?.();}catch(_){}
  for(const s of ['#cgm-charselect','#cgm-collection','#cgm-chaos-law-sel']){const n=document.querySelector(s); if(n)n.remove();}

  window.__mode=(m)=>{
    g.selectedCharacter='skeleton_warrior';
    g.gameState='playing'; g.gameOver=false; g.victory=false; g.paused=false;
    g.upgradeUI=null; g.mutationUI=null; g._postArenaChoice=null; g._clsVisible=false;
    if(m==='act1'){ g.endless=false; g._chaosMode=false; }
    else if(m==='endless'){ g.endless=true; g._chaosMode=false; try{g._enterEndless?.();}catch(_){} }
    else { g.endless=true; g.runChaosLaw=null; try{g._beginChaosRun();}catch(_){} }
    window.__step(30);
  };

  // Draw ONE overlay layer onto a clean transparent canvas and measure exactly what it deposits.
  // This is the only way to judge "too strong / too faint" per layer: on the live frame every
  // layer is stacked on the map art and nothing is attributable.
  window.__layer=(fn)=>{
    const src=window.__ctx().canvas;
    const c=document.createElement('canvas'); c.width=src.width; c.height=src.height;
    const cx=c.getContext('2d');
    let err=null;
    try{ g[fn](cx); }catch(e){ err=String(e); }
    const d=cx.getImageData(0,0,c.width,c.height).data;
    let cov=0,sumA=0,maxA=0,n=0,rs=0,gs=0,bs=0;
    for(let i=0;i<d.length;i+=4*13){
      const a=d[i+3]/255; n++;
      if(a>0.01){cov++; sumA+=a; rs+=d[i];gs+=d[i+1];bs+=d[i+2];}
      if(a>maxA)maxA=a;
    }
    const lit=cov||1;
    return { fn, err, coverage: cov/n, meanAlpha: sumA/lit, maxAlpha: maxA,
             rgb:[Math.round(rs/lit),Math.round(gs/lit),Math.round(bs/lit)] };
  };
  window.__frameStats=()=>{
    const ctx=window.__ctx(); const d=ctx.getImageData(0,0,ctx.canvas.width,ctx.canvas.height).data;
    let sum=0,max=0,n=0; const col=new Set();
    for(let i=0;i<d.length;i+=4*97){const v=(d[i]+d[i+1]+d[i+2])/3; sum+=v; if(v>max)max=v; n++;
      col.add((d[i]>>4)+','+(d[i+1]>>4)+','+(d[i+2]>>4));}
    return { mean:sum/n, max, colors:col.size };
  };
});

const LAYERS = ['_drawChaosVignette','_drawChaosRimGlow','_drawChaosDebris','_drawFrozenSleet',
                '_drawStormOverlay','_drawWeatherTheater','_drawChaosPylons'];
const report={};
for (const mode of ['act1','endless','chaos']) {
  await page.evaluate(m=>window.__mode(m), mode);
  const shots=[];
  for (let s=0;s<3;s++){
    await page.evaluate(()=>window.__step(240));           // ~4 s of play per sample
    const st = await page.evaluate(()=>{ const g=window.__g;
      g.gameState='playing'; g.gameOver=false;
      try{ g.draw(window.__ctx()); }catch(e){ window.__err=String(e); }
      return window.__frameStats(); });
    const {data}=await cdp.send('Page.captureScreenshot',{format:'png'});
    const f=`${mode}_${s}.png`; fs.writeFileSync(path.join(OUT,f),Buffer.from(data,'base64'));
    shots.push({f,...st});
  }
  const layers = await page.evaluate(L=>L.map(fn=>window.__layer(fn)), LAYERS);
  // Timed events do not fire inside a short sample, so force each to its PEAK and measure there.
  const sleet = await page.evaluate(()=>{
    const g=window.__g;
    g._frozenSleetTimer=0.01; window.__step(4);          // let the shipped trigger build it
    const built=!!g._frozenSleet;
    if(!built) g._frozenSleet={ phase:'hold', t:1.0, particles:[] };
    const out=[];
    for(const ph of ['onset','hold','recovery']){
      g._frozenSleet.phase=ph; g._frozenSleet.t=ph==='hold'?1.0:0.3;
      out.push(Object.assign({phase:ph,built},window.__layer('_drawFrozenSleet')));
    }
    g._frozenSleet=null;
    return out;
  });
  const storm = await page.evaluate(()=>{
    const g=window.__g;
    g._stormActive=8; window.__step(4);
    const m=window.__layer('_drawStormOverlay');
    g._stormActive=0;
    return m;
  });
  report[mode]={shots,layers,sleet,storm};
}
report.errors=errs;
fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,1));
for(const m of ['act1','endless','chaos']){
  console.log('==== '+m.toUpperCase()+' ====');
  for(const s of report[m].shots) console.log(`  frame ${s.f}  mean=${s.mean.toFixed(1)} max=${s.max} colors=${s.colors}`);
  for(const l of report[m].layers)
    console.log(`  ${l.fn.padEnd(20)} cov=${(l.coverage*100).toFixed(1)}%  meanA=${l.meanAlpha.toFixed(3)}  maxA=${l.maxAlpha.toFixed(2)}  rgb=${l.rgb}${l.err?'  ERR='+l.err:''}`);
  for(const s of report[m].sleet)
    console.log(`  sleet:${s.phase.padEnd(9)} built=${s.built} cov=${(s.coverage*100).toFixed(1)}%  meanA=${s.meanAlpha.toFixed(3)}  maxA=${s.maxAlpha.toFixed(2)}  rgb=${s.rgb}${s.err?'  ERR='+s.err:''}`);
  const st=report[m].storm;
  console.log(`  storm(forced)        cov=${(st.coverage*100).toFixed(1)}%  meanA=${st.meanAlpha.toFixed(3)}  maxA=${st.maxAlpha.toFixed(2)}  rgb=${st.rgb}${st.err?'  ERR='+st.err:''}`);
}
console.log('errors:', errs.length, errs.slice(0,3).join(' | '));
await browser.close(); srv.close();
