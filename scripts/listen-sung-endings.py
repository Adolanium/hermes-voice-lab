"""Build a local blind transcription and A/B test from two Voice Lab renderer bundles.

python3 scripts/listen-sung-endings.py OLD/runtime/render.mjs plugin/runtime/render.mjs OUT/listen.html
Each renderer needs its own adjacent WASM and lexicon. Only Python and Node are required.
"""
import array
import base64
import io
import json
import math
from pathlib import Path
import subprocess
import sys
import tempfile
import wave

# Held out during tuning. Include high notes, voiced and voiceless endings, and controls.
LINES = [
    "switch off the light", "give the dog a treat", "let them inside", "cover the pot",
    "she likes the sea breeze", "please shut the gate", "here comes the tide", "take another bite",
    "lift up the hood", "he sleeps on the mat", "paint the wall red", "it came by boat",
    "pick up your feet", "wait on the side", "I lost the key", "they walked in the rain",
    "sleep in my bed", "tie up the thread", "I need a coat", "she showed us the way",
]


def project(index, line):
    count = sum({"inside": 2, "cover": 2, "another": 3}.get(word, 1) for word in line.split())
    root = [60, 67, 72, 76][index % 4]
    notes = [dict(start=i, length=1, midi=root + [-3, -1, 0, -2][i % 4]) for i in range(count)]
    notes[-1].update(length=1.5, midi=root)
    return dict(mode="sing", song=dict(notes=notes, bpm=116, lyrics=line))


def clip(renderer, source, output):
    subprocess.run(["node", renderer, "--project", source, "--output", output, "--channels", "1"],
                   stdout=subprocess.DEVNULL, check=True)
    with wave.open(str(output)) as wav:
        rate = wav.getframerate()
        samples = array.array("h", wav.readframes(wav.getnframes()))
    if sys.byteorder != "little":
        samples.byteswap()
    rms = math.sqrt(sum(x*x for x in samples) / len(samples))
    target = min(2100 / max(rms, 1), 30000 / max(max(map(abs, samples)), 1))
    matched = array.array("h", (round(x * target) for x in samples))
    if sys.byteorder != "little":
        matched.byteswap()
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wav:
        wav.setparams((1, 2, rate, 0, "NONE", ""))
        wav.writeframes(matched.tobytes())
    return base64.b64encode(buf.getvalue()).decode()


PAGE = """<!doctype html><html lang="en"><meta charset="utf-8"><title>Sung endings listening test</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font:18px/1.5 system-ui;max-width:36em;margin:8vh auto;padding:1rem}audio,input{display:block;margin:1em 0;width:100%}input,button{font:inherit;padding:.4em}button{margin-right:.6em}h1{font-size:1.55em}</style>
<h1>Sung endings</h1><p id="status"></p><main></main><script>
const clips=CLIPS, main=document.querySelector('main'), statusEl=document.querySelector('#status');
const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const order=shuffle(clips.map((_,i)=>i)), builds=shuffle(clips.map((_,i)=>i%2));
const answers=[], comparisons=[];
const audio=(i,b)=>{const a=document.createElement('audio');a.controls=true;a.src='data:audio/wav;base64,'+clips[i][b];main.append(a)};
const button=(label,fn)=>{const b=document.createElement('button');b.textContent=label;b.onclick=fn;main.append(b)};
function show(){
 main.replaceChildren(); const n=answers.length;
 if(n<order.length){
  statusEl.textContent='Line '+(n+1)+' of '+order.length+'. Listen and type the words you hear.';
  const i=order[n],b=builds[n]; audio(i,b); const box=document.createElement('input');
  box.setAttribute('aria-label','Words heard');box.autocomplete='off';main.append(box);
  button('Next line',()=>{if(!box.value.trim())return;answers.push({phrase:i,build:b,heard:box.value.trim()});show()});return;
 }
 const changed=order.filter(i=>clips[i][0]!==clips[i][1]).slice(0,6), j=comparisons.length;
 if(j<changed.length){
  const i=changed[j], first=Math.random()<0.5?0:1;
  statusEl.textContent='Pair '+(j+1)+' of '+changed.length+'. Which ending is clearer?';
  audio(i,first);audio(i,1-first);
  for(const [label,b] of [['First',first],['Second',1-first],['No preference',null]])button(label,()=>{comparisons.push({phrase:i,preferred:b});show()});
  return;
 }
 statusEl.textContent='Finished. Save your answers for the person running the test.';
 button('Save answers',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({answers,comparisons},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='sung-endings-listener.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});
}show();</script></html>"""


def main():
    if len(sys.argv) != 4:
        raise SystemExit(__doc__)
    old, new, dest = map(Path, sys.argv[1:])
    with tempfile.TemporaryDirectory() as tmp:
        source, out = Path(tmp) / "project.json", Path(tmp) / "clip.wav"
        clips = []
        for i, line in enumerate(LINES):
            source.write_text(json.dumps(project(i, line)))
            clips.append([clip(renderer.resolve(), source, out) for renderer in (old, new)])
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(PAGE.replace("CLIPS", json.dumps(clips)))
    print(dest.resolve())


if __name__ == "__main__":
    main()
