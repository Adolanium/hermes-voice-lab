/** Original small gesture lexicon. This is experimental articulation, not general English TTS. */
const vowels = {
  AA: {tongueX:.4,tongueY:.2,jaw:.8,lip:.8},
  AE: {tongueX:.7,tongueY:.3,jaw:.65,lip:.85},
  AH: {tongueX:.5,tongueY:.35,jaw:.5,lip:.65},
  EH: {tongueX:.7,tongueY:.55,jaw:.45,lip:.8},
  IH: {tongueX:.8,tongueY:.65,jaw:.3,lip:.7},
  IY: {tongueX:.9,tongueY:.85,jaw:.2,lip:.8},
  OW: {tongueX:.3,tongueY:.5,jaw:.4,lip:.25},
  UH: {tongueX:.3,tongueY:.65,jaw:.25,lip:.3},
  UW: {tongueX:.2,tongueY:.8,jaw:.2,lip:.15},
  ER: {tongueX:.45,tongueY:.75,jaw:.3,lip:.4},
};
const consonants = {
  M:{lip:0.02,jaw:.08,nasal:.95}, N:{tongueX:.96,tongueY:1,jaw:.2,nasal:.9},
  NG:{tongueX:.25,tongueY:1,jaw:.2,nasal:.9},
  S:{tongueX:.97,tongueY:.96,jaw:.18,lip:.6,voicing:0,frication:.75},
  Z:{tongueX:.97,tongueY:.96,jaw:.18,lip:.6,voicing:.5,frication:.5},
  SH:{tongueX:.75,tongueY:.95,jaw:.25,lip:.35,voicing:0,frication:.6},
  F:{lip:.08,jaw:.18,voicing:0,frication:.45}, V:{lip:.08,jaw:.18,voicing:.5,frication:.3},
  HH:{voicing:0,breath:.8,frication:.12},
  L:{tongueX:.9,tongueY:.8,jaw:.4}, R:{tongueX:.45,tongueY:.85,lip:.4,jaw:.3},
  W:{tongueX:.25,tongueY:.8,lip:.1,jaw:.15}, Y:{tongueX:.9,tongueY:.8,jaw:.2,lip:.65},
  B:{lip:.02,jaw:.1,voicing:.5}, P:{lip:.02,jaw:.1,voicing:0},
  D:{tongueX:.97,tongueY:1,jaw:.1,voicing:.5}, T:{tongueX:.97,tongueY:1,jaw:.1,voicing:0},
  G:{tongueX:.25,tongueY:1,jaw:.15,voicing:.5}, K:{tongueX:.25,tongueY:1,jaw:.15,voicing:0},
};
const diphthongs={AY:['AA','IY'],EY:['EH','IY'],AW:['AA','UW'],OY:['OW','IY']};
export const LEXICON = Object.freeze({
  hello:'HH EH L OW', hermes:'HH ER M IY Z', voice:'V OY S', lab:'L AE B',
  we:'W IY', sing:'S IH NG', a:'AH', an:'AE N', new:'N UW', tune:'T UW N',
  warm:'W OW R M', light:'L AY T', moon:'M UW N', blue:'B L UW',
  soft:'S AA F T', sound:'S AW N D', my:'M AY', your:'Y OW R',
  is:'IH Z', in:'IH N', me:'M IY', you:'Y UW', love:'L AH V',
  one:'W AH N', two:'T UW', three:'T R IY', four:'F OW R',
  good:'G UH D', morning:'M OW R N IH NG', night:'N AY T',
  low:'L OW', high:'HH AY', now:'N AW', yes:'Y EH S', no:'N OW',
});
export const SUPPORTED_PHONEMES = Object.freeze([...Object.keys(vowels),...Object.keys(consonants),...Object.keys(diphthongs),'SIL']);
const base = {voicing:1,frication:0,nasal:0,breath:.16,gate:1};
function options(opts={}) {
  const pitch=opts.pitch??205, rate=opts.rate??1;
  if(!Number.isFinite(pitch)||pitch<80||pitch>400) throw new Error('Pitch must be 80–400 Hz.');
  if(!Number.isFinite(rate)||rate<.5||rate>2) throw new Error('Speech rate must be 0.5–2.');
  return {pitch,rate};
}
function tokens(input) {
  if(typeof input!=='string'||input.length>2000) throw new Error('Use at most 2,000 characters.');
  return input.toUpperCase().trim().split(/\s+/).filter(Boolean);
}
/** Explicit tokens use the listed ARPABET subset without stress digits. Unknown input fails. */
export function planPhonemes(input,opts={}) {
  const {pitch,rate}=options(opts), units=tokens(input), events=[];
  const unsupported=units.filter(p=>!SUPPORTED_PHONEMES.includes(p));
  if(unsupported.length) return {events:[],duration:0,unsupported:[...new Set(unsupported)]};
  let time=0;
  const push=(phone,duration,extra={})=>{
    events.push({time,duration,params:{...base,...vowels.AH,...(vowels[phone]||consonants[phone]||{}),pitch,...extra}});
    time+=duration;
  };
  for(const phone of units){
    if(phone==='SIL'){push(phone,.1/rate,{gate:0});continue;}
    if(diphthongs[phone]) {for(const p of diphthongs[phone]) push(p,.09/rate);continue;}
    const stop=/^[BPDTGK]$/.test(phone);
    push(phone,(vowels[phone]?.18:stop?.055:.085)/rate);
    if(stop)push(phone,.025/rate,{voicing:0,frication:.45,lip:.6,tongueY:.5});
  }
  return {events,duration:time,unsupported:[]};
}
export function planText(text,opts={}) {
  if(typeof text!=='string'||text.length>2000) throw new Error('Use at most 2,000 characters.');
  const words=text.toLowerCase().match(/[a-z]+|[.,!?;]/g)||[];
  const unsupported=words.filter(w=>/^[a-z]/.test(w)&&!LEXICON[w]);
  if(unsupported.length) return {events:[],duration:0,unsupported:[...new Set(unsupported)]};
  return planPhonemes(words.map(w=>LEXICON[w]||'SIL').join(' '),opts);
}
/** One supported word per note. Vowels take remaining note time; consonants stay short. */
export function planLyrics(text,notes,opts={}) {
  const words=text.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if(!Array.isArray(notes)||notes.length!==words.length) throw new Error('Provide one note per lyric word.');
  const events=[],unsupported=[];
  let time=0;
  words.forEach((word,i)=>{
    const note=notes[i];
    if(!Number.isFinite(note.duration)||note.duration<.12||note.duration>8) throw new Error('Note duration must be 0.12–8 seconds.');
    const plan=planText(word,{...opts,pitch:note.pitch});
    unsupported.push(...plan.unsupported);
    if(plan.events.length){
      const voiced=plan.events.filter(e=>e.duration>=.089);
      const stretch=Math.max(.25,(note.duration-plan.events.filter(e=>!voiced.includes(e)).reduce((s,e)=>s+e.duration,0))/Math.max(.001,voiced.reduce((s,e)=>s+e.duration,0)));
      const durations=plan.events.map(e=>e.duration*(voiced.includes(e)?stretch:1));
      const scale=note.duration/durations.reduce((s,d)=>s+d,0);
      plan.events.forEach((e,j)=>{const duration=durations[j]*scale;events.push({...e,time,duration});time+=duration;});
    }else time+=note.duration;
  });
  return {events:unsupported.length?[]:events,duration:time,unsupported:[...new Set(unsupported)]};
}
