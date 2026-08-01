import { AudioManager } from '../../js/audio/AudioManager.js';
import { Game } from '../../js/game/Game.js';
import fs from 'fs';
let P=0,F=0; const T=(n,c)=>{ c?(P++,console.log('  PASS  '+n)):(F++,console.log('  FAIL  '+n)); };

console.log('═══ CRYO ROUTING PROOF ═══');
T('[C1] event_cryo is registered in WAVE1_SFX',
  Array.isArray(AudioManager.WAVE1_SFX.event_cryo) && AudioManager.WAVE1_SFX.event_cryo[0]==='event_warning_cryo_01');
T('[C2] FROZEN SLEET maps to cryo', Game.EVENT_AUDIO_CLASS._updateFrozenSleet==='cryo');
T('[C3] WHITEOUT maps to cryo',     Game.EVENT_AUDIO_CLASS._whiteoutProtocol==='cryo');
T('[C4] cryo no longer collapses to major',
  AudioManager.WAVE1_SFX.event_cryo[0] !== AudioManager.WAVE1_SFX.event_major[0]);

// every registry basename must exist on disk as BOTH .ogg and .mp3
const D='assets/audio/sfx/wave1/'; let miss=[];
for (const [id,arr] of Object.entries(AudioManager.WAVE1_SFX))
  for (const b of arr)
    for (const ext of ['.ogg','.mp3'])
      if (!fs.existsSync(D+b+ext)) miss.push(id+' → '+b+ext);
T('[C5] every registry entry has both .ogg and .mp3 on disk ('+miss.length+' missing)', miss.length===0);
if (miss.length) console.log('     '+miss.join('\n     '));

// no orphan files (shipped but unregistered)
const reg=new Set(Object.values(AudioManager.WAVE1_SFX).flat());
const onDisk=new Set(fs.readdirSync(D).map(f=>f.replace(/\.(ogg|mp3)$/,'')));
const orphans=[...onDisk].filter(b=>!reg.has(b));
T('[C6] no orphan clips shipped ('+orphans.length+')', orphans.length===0);
if (orphans.length) console.log('     '+orphans.join(', '));
T('[C7] no .wav master leaked into wave1/', !fs.readdirSync(D).some(f=>f.endsWith('.wav')));

// return-value contract
const src=fs.readFileSync('js/audio/AudioManager.js','utf8');
// Window widened 400 -> 900 on 2026-08-01: the mix rebalance added the category boost and
// the ducking call inside this method, pushing `return r;` past the old fixed window. The
// contract being checked is unchanged - playEventClass must still return _wave1Play's result.
T('[C8] playEventClass returns its result', /playEventClass\(cls, proceduralFallback = true\)[\s\S]{0,900}return r;/.test(src));
const gsrc=fs.readFileSync('js/game/Game.js','utf8');
T('[C9] frozen sleet falls back to the ice sweep, not the generic alarm',
  /_eventCue\('_updateFrozenSleet', false\) !== 'played'\) this\.audio\?\.playIceSweep/.test(gsrc));
T('[C10] whiteout falls back to the ice sweep',
  /_eventCue\('_whiteoutProtocol', false\) !== 'played'\) this\.audio\?\.playIceSweep/.test(gsrc));
T('[C11] default callers keep the procedural fallback (arity unchanged at call sites)',
  (gsrc.match(/_eventCue\('[A-Za-z_]+'\)/g)||[]).length >= 25);

console.log(`\n═══ ${P} PASS · ${F} FAIL ═══`);
process.exit(F?1:0);
