/**
 * Performance video page (development tool, not shipped in the plugin).
 *
 * The engine renders the song offline; after each video frame's worth of
 * samples the page records the engine's own telemetry, so every frame shows
 * exactly the articulation that produced that slice of audio. A driver
 * (scripts/render-video.mjs) steps through frames, screenshots each, and
 * muxes them with the same audio.
 */
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Engine, STATE} from '../core/engine';
import {PARAM_NAMES, hzToMidi, noteName} from '../core/params';
import {planSong, type SongPlan} from '../core/planner';
import {SIGNATURE} from '../core/presets';
import {SILLY_SONG, type Project} from '../core/project';
import {encodeWav} from '../core/wav';
import {engineModule, loadLexicon} from '../ui/assets';
import {analysis} from '../ui/audio';
import {Portrait, type Pose} from '../ui/Portrait';
import {lyricLine, type StageState} from '../ui/stage';
import {nameSound} from '../ui/soundName';
import {CSS} from '../ui/styles';

interface Frame {
  time: number;
  params: Float32Array;
  areas: Float32Array;
  energy: Float32Array;
  state: Float32Array;
}

const RATE = 48000;
const W = 1920;
const H = 1080;

interface Setup {
  title: string;
  song: Project['song'];
  voice: Project['voice'];
  fps: number;
  preroll: number;
  tail: number;
  /** Song time (s) at which the cutaway fades in; undefined = always on. */
  revealAt?: number;
  /** Song time (s) at which it fades out again for the finale. */
  hideAt?: number;
}

const DEFAULT: Setup = {
  title: 'The Boop Bop Song',
  song: SILLY_SONG,
  voice: {...SIGNATURE, tenseness: 0.42, breath: 0.17, humanize: 0.4, space: 0.26, loudness: 0.78},
  fps: 30,
  preroll: 0.5,
  tail: 1.2,
  revealAt: 0.25 + 7.6 * (60 / 132),
  hideAt: 0.25 + 19.6 * (60 / 132),
};

let frames: Frame[] = [];
let plan: SongPlan | null = null;
let setup = DEFAULT;
let setFrame: (i: number) => void = () => {};

async function prepare(options: Partial<Setup> = {}) {
  setup = {...DEFAULT, ...options};
  const lexicon = await loadLexicon();
  const {song, voice, fps} = setup;
  plan = planSong(song.notes, song.lyrics, lexicon, {bpm: song.bpm, voice, style: song.style});
  const engine = new Engine(engineModule(), RATE, 7);
  engine.jumpAll(voice);
  const pre = Math.round(setup.preroll * RATE);
  const total = pre + Math.ceil((plan.score.length + setup.tail) * RATE);
  const left = new Float32Array(total);
  const right = new Float32Array(total);
  let at = 0;
  const run = (n: number) => {
    while (n > 0) {
      const [l, r] = engine.render(Math.min(4096, n));
      left.set(l, at);
      right.set(r, at);
      at += l.length;
      n -= l.length;
    }
  };
  // Pre-roll: idle breathing before the song starts.
  const perFrame = RATE / fps;
  const capture = () => frames.push({
    time: at / RATE - setup.preroll, params: engine.params(), areas: engine.areas(), energy: engine.energy(), state: engine.state(),
  });
  frames = [];
  let started = false;
  for (let i = 0; at < total; i++) {
    const end = Math.min(total, Math.round((i + 1) * perFrame));
    const mid = Math.round((i + 0.5) * perFrame);
    if (!started && mid >= pre) {
      run(pre - at);
      engine.loadScore(plan.score);
      engine.play(false);
      started = true;
    }
    run(Math.max(0, mid - at));
    capture();
    run(Math.max(0, end - at));
  }
  const wav = encodeWav([left, right], RATE);
  let binary = '';
  for (let i = 0; i < wav.length; i += 0x8000) binary += String.fromCharCode(...wav.subarray(i, i + 0x8000));
  setFrame(0);
  return {frames: frames.length, fps, seconds: total / RATE, wav: btoa(binary), cues: plan.cues.length};
}

async function show(i: number) {
  setFrame(i);
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
}

(window as any).__video = {prepare, show};

function View() {
  const [index, setIndex] = useState(-1);
  setFrame = setIndex;
  const fr = frames[index];
  if (!fr || !plan) return <div className="hvl-root hvl-video" />;
  const p = Object.fromEntries(PARAM_NAMES.map((n, i) => [n, fr.params[i]])) as Record<string, number>;
  const st = fr.state;
  const level = Math.min(1, st[STATE.rms] * 8);
  const pose: Pose = {
    tongueX: p.tongueX, tongueY: p.tongueY, tipPlace: p.tipPlace, tipClose: p.tipClose, dorsumClose: p.dorsumClose,
    jaw: p.jaw, lipOpen: p.lipOpen, lipRound: p.lipRound, velum: p.velum, voicing: p.voicing, flow: st[STATE.flow], level, rhotic: p.rhotic,
  };
  const airway = {
    running: true, areas: fr.areas, energy: fr.energy, airflow: st[STATE.airflow], nasalShare: st[STATE.nasalShare],
    closed: st[STATE.closed] > 0.5, minIndex: st[STATE.minIndex], minArea: st[STATE.minArea], gate: p.gate, clock: fr.time,
  };
  const singing = fr.time >= 0 && fr.time <= plan.score.length;
  const f0 = st[STATE.f0];
  const stage: StageState = {
    time: fr.time, cues: plan.cues, beat: 60 / setup.song.bpm, level, f0: p.gate > 0.05 ? f0 : 0, singing,
  };
  const model = analysis().analyze(fr.areas, st[STATE.nasalArea], st[STATE.length]);
  const now = nameSound({
    params: p, formants: model.formants, frication: st[STATE.frication], closed: airway.closed, nasalShare: airway.nasalShare,
    minIndex: airway.minIndex, minArea: airway.minArea, sounding: p.gate > 0.05,
  });
  const line = lyricLine(stage);
  // Plain face for the scat intro, then look inside for tongue, lips and nose...
  // ...and back to her face for the big finish.
  const fade = (at: number | undefined) => (at === undefined ? 0 : Math.min(1, Math.max(0, (fr.time - at) / 0.35)));
  const reveal = setup.revealAt === undefined ? 1 : fade(setup.revealAt) * (1 - fade(setup.hideAt));
  return (
    <div className="hvl-root hvl-video">
      <style>{CSS + VIDEO_CSS}</style>
      <div className="v-portrait">
        <Portrait pose={pose} airway={airway} cutaway={reveal > 0} cutawayOpacity={reveal} labels={false} speaking={singing} stage={stage} viewBox="-760 -110 2560 1440" />
      </div>
      <header className="v-title">
        <div className="v-kicker">Hermes Voice Lab · live physical voice</div>
        <h1>{setup.title}</h1>
        <div className="v-sub">Every sound comes from a simulated throat, tongue, lips and nose. No samples.</div>
      </header>
      <aside className={`v-now is-${now.kind}`}>
        <div className="v-now-symbol">{now.symbol}</div>
        <div className="v-now-label">{now.label || ' '}</div>
        <div className="v-now-pitch">{p.gate > 0.05 ? `${Math.round(f0)} Hz · ${noteName(hzToMidi(Math.max(30, f0)))}` : ' '}</div>
      </aside>
      <footer className="v-karaoke">
        {line.words.map((w, i) => <span key={i} className={`is-${w.state}`}>{w.text}</span>)}
      </footer>
    </div>
  );
}

const VIDEO_CSS = `
.hvl-video { position: relative; width: ${W}px; height: ${H}px; overflow: hidden; background:
  radial-gradient(1200px 900px at 34% 52%, color-mix(in oklab, var(--hvl-accent) 10%, #fbfaf6), #f1efe9 70%); }
.hvl-video *, .hvl-video *::before { transition: none !important; animation: none !important; }
.v-portrait { position: absolute; inset: 0; }
.v-portrait .hvl-portrait { width: ${W}px; height: ${H}px; max-height: none; aspect-ratio: auto; }
.v-title { position: absolute; left: 72px; top: 56px; color: #18171c; }
.v-kicker { font: 650 18px var(--hvl-mono); letter-spacing: .16em; text-transform: uppercase; color: var(--hvl-accent); }
.v-title h1 { margin: 10px 0 8px; font: 850 64px/1 var(--hvl-sans); letter-spacing: -.02em; }
.v-sub { font: 500 21px var(--hvl-sans); color: #5a5763; max-width: 560px; line-height: 1.35; }
.v-now { position: absolute; left: 72px; top: 330px; width: 300px; padding: 20px 24px; border-radius: 18px; background: rgba(255,255,255,.72);
  border: 1px solid rgba(24,23,28,.08); box-shadow: 0 10px 40px rgba(24,23,28,.06); }
.v-now-symbol { font: 600 76px/1 var(--hvl-sans); color: var(--hvl-accent); min-height: 76px; }
.v-now.is-stop .v-now-symbol, .v-now.is-fricative .v-now-symbol { color: var(--hvl-warm); }
.v-now.is-nasal .v-now-symbol { color: #9b59d0; }
.v-now.is-silent .v-now-symbol { color: #b9b6c0; }
.v-now-label { font: 500 17px var(--hvl-sans); color: #5a5763; margin-top: 8px; min-height: 22px; }
.v-now-pitch { font: 600 18px var(--hvl-mono); color: #18171c; margin-top: 10px; font-variant-numeric: tabular-nums; }
.v-karaoke { position: absolute; left: 0; right: 0; bottom: 46px; display: flex; justify-content: center; gap: 20px; font: 850 50px var(--hvl-sans);
  padding: 14px 0; background: linear-gradient(transparent, rgba(241,239,233,.85) 30%); letter-spacing: -.01em; }
.v-karaoke span { color: rgba(24,23,28,.22); }
.v-karaoke span.is-past { color: rgba(24,23,28,.62); }
.v-karaoke span.is-now { color: var(--hvl-accent); transform: scale(1.14) translateY(-4px); display: inline-block; }
`;

createRoot(document.getElementById('root')!).render(<View />);
