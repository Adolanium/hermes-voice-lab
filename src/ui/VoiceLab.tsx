/** Voice Lab instrument: portrait, mode console, analysis and keyboard. */
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {TractResponse} from '../core/engine';
import {STATE} from '../core/engine';
import {midiToHz, noteName, hzToMidi, PARAM_NAMES, type ParamName, type Patch, VOICE_PARAMS} from '../core/params';
import {lyricSyllables, planLiveOff, planLiveOn, planSong, planSpeech, type Plan, type SongPlan} from '../core/planner';
import {isVowel, type Phone} from '../core/phonemes';
import {VOICE_PRESETS} from '../core/presets';
import {newProject, projectScore, validateProject, type Mode, type Project} from '../core/project';
import type {Lexicon} from '../core/text';
import type {VoiceLabBridge} from '../bridge';
import {loadLexicon} from './assets';
import {analysis, renderWav, VoiceAudio} from './audio';
import {Icon, Mark, useAudioStatus, useOpaqueInk, useTelemetry} from './controls';
import {Keyboard} from './Keyboard';
import {useMidi} from './midi';
import {PlaySpeakSingTabs} from './tabs';
import {Portrait, type Pose} from './Portrait';
import {Airway, Glottal, Spectrum, Waveform} from './scopes';
import {CSS} from './styles';
import {nameSound} from './soundName';
import {lyricLine, type StageState} from './stage';

const USER_PRESETS = 'voicePresets';

interface Props {
  bridge: VoiceLabBridge;
}

export default function VoiceLab({bridge}: Props) {
  const audio = useMemo(() => new VoiceAudio(), []);
  useEffect(() => () => void audio.dispose(), [audio]);
  const status = useAudioStatus(audio);
  const telemetry = useTelemetry(audio);
  const running = status === 'running';

  const [project, setProject] = useState<Project>(() => newProject());
  const [loaded, setLoaded] = useState(false);
  const [lexicon, setLexicon] = useState<Lexicon | null>(null);
  const [cutaway, setCutaway] = useState(() => bridge.storage.get('cutaway', true));
  const [labels, setLabels] = useState(() => bridge.storage.get('labels', true));
  const [stageOn, setStageOn] = useState(() => bridge.storage.get('stage', true));
  const [holding, setHolding] = useState(false);
  const [latch, setLatch] = useState(false);
  const [base, setBase] = useState(() => bridge.storage.get('keyboardBase', 60));
  const [volume, setVolume] = useState(() => bridge.storage.get('volume', 0.9));
  const [agentKeys, setAgentKeys] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<null | {text: string; action?: {label: string; run: () => void}}>(null);
  const [busy, setBusy] = useState('');
  const [userPresets, setUserPresets] = useState<Array<{name: string; voice: Patch}>>(() => bridge.storage.get(USER_PRESETS, []));
  const [typing, setTyping] = useState(false);
  const notesDown = useRef<number[]>([]);
  // Live singing: each key press sings the next lyric syllable.
  const [liveSing, setLiveSing] = useState(false);
  const liveCursor = useRef(0);
  const [liveIndex, setLiveIndex] = useState(0);
  const liveHeld = useRef<{midi: number; phones: Phone[]} | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const projectRef = useRef(project);
  projectRef.current = project;
  const rootRef = useRef<HTMLDivElement>(null);
  useOpaqueInk(rootRef);

  // ---- Load, persist, and follow agent edits ----------------------------
  useEffect(() => {
    let live = true;
    loadLexicon().then(l => live && setLexicon(l));
    bridge.load().then(p => {
      if (!live) return;
      if (p) setProject(p);
      setLoaded(true);
    }, () => live && setLoaded(true));
    const off = bridge.subscribe((p, origin, changed) => {
      setProject(p);
      if (origin === 'agent') {
        const keys = new Set(changed ?? []);
        setAgentKeys(keys);
        setTimeout(() => live && setAgentKeys(new Set()), 5000);
        const what = changed?.length ? changed.slice(0, 5).join(', ') : 'the project';
        setToast({text: `Hermes updated ${what}.`, action: p.mode !== 'play' ? {label: p.mode === 'sing' ? 'Sing it' : 'Speak it', run: () => playMode(p.mode, p)} : undefined});
      }
    });
    return () => {
      live = false;
      off();
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge]);

  const update = useCallback((fn: (p: Project) => Project) => {
    setProject(prev => {
      const next = fn(prev);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        bridge.save(next).catch(e => setToast({text: `Could not save: ${(e as Error).message}`}));
      }, 700);
      return next;
    });
  }, [bridge]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  // ---- Audio control -------------------------------------------------------
  const ensureAudio = useCallback(async () => {
    if (audio.running) return true;
    try {
      await audio.start({...projectRef.current.voice, ...projectRef.current.shape, gate: 0});
      audio.setVolume(volume);
      return true;
    } catch (e) {
      setToast({text: `Audio could not start: ${(e as Error).message}`});
      return false;
    }
  }, [audio, volume]);

  useEffect(() => {
    if (running) audio.setVolume(volume);
    bridge.storage.set('volume', volume);
  }, [volume, running, audio, bridge]);

  const onVoice = (p: Patch) => {
    update(prev => ({...prev, voice: {...prev.voice, ...p}}));
    if (running) audio.patch(p, 30);
  };
  const onShape = (p: Patch) => {
    update(prev => ({...prev, shape: {...prev.shape, ...p}, mode: 'play'}));
    if (running && !isScorePlaying()) audio.patch(p, 35);
  };
  const isScorePlaying = () => !!audio.telemetry && audio.telemetry.state[STATE.playing] > 0.5;

  const sound = useCallback(async (on: boolean, pitch?: number) => {
    if (on) {
      if (!(await ensureAudio())) return;
      audio.claim();
      audio.stopScore();
      const p = projectRef.current;
      audio.patch({...p.voice, ...p.shape, ...(pitch ? {pitch} : {})}, 20);
      audio.set('gate', 1, 12);
    } else {
      audio.set('gate', 0, 40);
    }
  }, [audio, ensureAudio]);

  const onHold = (on: boolean) => {
    setHolding(on);
    void sound(on);
  };

  const syllables = useMemo(() => (lexicon ? lyricSyllables(project.song.lyrics, lexicon) : []), [lexicon, project.song.lyrics]);
  const liveActive = liveSing && project.mode === 'sing' && syllables.length > 0;
  const liveOn = async (midi: number) => {
    if (!(await ensureAudio())) return;
    audio.claim();
    const syl = syllables[liveCursor.current % syllables.length];
    liveCursor.current += 1;
    setLiveIndex(liveCursor.current);
    const held = liveHeld.current;
    if (!syl.phones.length) {
      // A "-" in the lyrics carries the held vowel to the new pitch.
      audio.set('pitch', midiToHz(midi), 40);
      if (held) held.midi = midi;
      return;
    }
    const v = held ? held.phones.findIndex(p => isVowel(p.symbol)) : -1;
    const fromCoda = held && v >= 0 ? held.phones.slice(v + 1) : [];
    audio.play(planLiveOn(syl.phones, midi, projectRef.current.voice, {fromCoda, legato: !!held}));
    liveHeld.current = {midi, phones: syl.phones};
  };
  const liveOff = (midi: number) => {
    const held = liveHeld.current;
    if (!held || held.midi !== midi) return;
    audio.play(planLiveOff(held.phones, projectRef.current.voice));
    liveHeld.current = null;
  };
  const restartLive = () => {
    liveCursor.current = 0;
    setLiveIndex(0);
  };

  const onNoteOn = async (midi: number) => {
    notesDown.current = [...notesDown.current.filter(m => m !== midi), midi];
    if (liveActive) return liveOn(midi);
    if (!(await ensureAudio())) return;
    const legato = notesDown.current.length > 1;
    if (!legato) await sound(true, midiToHz(midi));
    else audio.set('pitch', midiToHz(midi), 35);
  };
  const onNoteOff = (midi: number) => {
    notesDown.current = notesDown.current.filter(m => m !== midi);
    if (liveActive) return liveOff(midi);
    const last = notesDown.current[notesDown.current.length - 1];
    if (last !== undefined) audio.set('pitch', midiToHz(last), 35);
    else if (!holding) audio.set('gate', 0, 45);
  };
  const midi = useMidi(m => void onNoteOn(m), m => onNoteOff(m));
  const previewNote = async (midi: number) => {
    if (!(await ensureAudio())) return;
    audio.stopScore();
    audio.patch({...projectRef.current.voice, ...projectRef.current.shape, pitch: midiToHz(midi)}, 15);
    audio.set('gate', 1, 10);
    setTimeout(() => audio.set('gate', 0, 50), 220);
  };

  // ---- Plans ---------------------------------------------------------------
  const speechPlan: Plan | null = useMemo(() => {
    if (!lexicon) return null;
    try {
      return planSpeech(project.speech.text, lexicon, {voice: project.voice, rate: project.speech.rate, expression: project.speech.expression, phonemes: project.speech.phonemes});
    } catch {
      return null;
    }
  }, [lexicon, project.speech, project.voice]);
  const songPlan: SongPlan | null = useMemo(() => {
    if (!lexicon) return null;
    try {
      return planSong(project.song.notes, project.song.lyrics, lexicon, {bpm: project.song.bpm, voice: project.voice, style: project.song.style});
    } catch {
      return null;
    }
  }, [lexicon, project.song, project.voice]);

  const playMode = async (mode: Mode, source = projectRef.current) => {
    if (!lexicon) return;
    if (!(await ensureAudio())) return;
    setHolding(false);
    const {score} = projectScore(source, lexicon, mode);
    audio.play(score, mode === 'sing' && source.song.loop);
  };
  const stop = () => {
    audio.silence();
    setHolding(false);
  };

  // ---- Model analysis --------------------------------------------------------
  const params = useMemo(() => {
    if (running && telemetry) return Object.fromEntries(PARAM_NAMES.map((n, i) => [n, telemetry.params[i]])) as Record<ParamName, number>;
    return null;
  }, [running, telemetry]);
  const preview = useMemo(() => {
    const values = PARAM_NAMES.map(n => (project.shape[n] ?? project.voice[n] ?? undefined) as number | undefined);
    const engine = analysis();
    const all = engine.specs().map((s, i) => values[i] ?? s[2]);
    return engine.shapeFor(all);
  }, [project.shape, project.voice]);
  const areas = running && telemetry ? telemetry.areas : preview.areas;
  const length = running && telemetry ? telemetry.state[STATE.length] : preview.length;
  const nasal = running && telemetry ? telemetry.state[STATE.nasalArea] : preview.nasal;
  const [model, setModel] = useState<TractResponse | null>(null);
  const lastAnalysis = useRef(0);
  useEffect(() => {
    const now = performance.now();
    if (now - lastAnalysis.current < 90 && running) return;
    lastAnalysis.current = now;
    try {
      setModel(analysis().analyze(areas, nasal, length));
    } catch {
      setModel(null);
    }
  }, [areas, nasal, length, running]);
  const airway = {
    running,
    areas,
    energy: running && telemetry ? telemetry.energy : null,
    airflow: running && telemetry ? telemetry.state[STATE.airflow] : 0,
    nasalShare: running && telemetry ? telemetry.state[STATE.nasalShare] : 0,
    closed: running && !!telemetry && telemetry.state[STATE.closed] > 0.5,
    minIndex: running && telemetry ? telemetry.state[STATE.minIndex] : 0,
    minArea: running && telemetry ? telemetry.state[STATE.minArea] : 1,
    gate: params?.gate ?? 0,
  };
  const minIndex = useMemo(() => {
    let k = 7;
    for (let i = 7; i < areas.length; i++) if (areas[i] < areas[k]) k = i;
    return k;
  }, [areas]);

  const scorePlaying = running && !!telemetry && telemetry.state[STATE.playing] > 0.5;
  const position = telemetry?.state[STATE.position] ?? 0;
  const level = running && telemetry ? Math.min(1, telemetry.state[STATE.rms] * 8) : 0;
  const pose: Pose = {
    tongueX: params?.tongueX ?? project.shape.tongueX ?? 0.4,
    tongueY: params?.tongueY ?? project.shape.tongueY ?? 0.3,
    tipPlace: params?.tipPlace ?? project.shape.tipPlace ?? 0.38,
    tipClose: params?.tipClose ?? project.shape.tipClose ?? 0,
    dorsumClose: params?.dorsumClose ?? project.shape.dorsumClose ?? 0,
    jaw: params?.jaw ?? project.shape.jaw ?? 0.5,
    lipOpen: params?.lipOpen ?? project.shape.lipOpen ?? 0.6,
    lipRound: params?.lipRound ?? project.shape.lipRound ?? 0.1,
    velum: params?.velum ?? project.shape.velum ?? 0,
    voicing: params?.voicing ?? 1,
    flow: running && telemetry ? telemetry.state[STATE.flow] : 0.4,
    level,
    rhotic: params?.rhotic ?? project.shape.rhotic ?? 0,
  };
  const f0 = running && telemetry ? telemetry.state[STATE.f0] : (project.voice.pitch ?? 210);
  const rd = telemetry?.state[STATE.rd] ?? 1.1;
  // Stage dressing follows the song clock while a song plays.
  const singing = scorePlaying && project.mode === 'sing' && !!songPlan;
  const stage: StageState | undefined = stageOn ? {
    time: singing ? position : performance.now() / 1000,
    cues: singing ? songPlan!.cues : [],
    beat: 60 / project.song.bpm,
    level,
    f0: singing && (params?.gate ?? 0) > 0.05 ? f0 : 0,
    singing,
  } : undefined;
  const karaoke = stage && singing ? lyricLine(stage) : null;

  const onPortraitDrag = (c: Patch) => {
    update(prev => ({...prev, shape: {...prev.shape, ...c}, mode: 'play'}));
    if (running && !scorePlaying) audio.patch(c, 18);
  };

  // ---- Presets and files -----------------------------------------------------
  const applyPreset = (id: string) => {
    const builtin = VOICE_PRESETS.find(p => p.id === id);
    const user = userPresets.find(p => `user:${p.name}` === id);
    const voice = builtin?.voice ?? user?.voice;
    if (!voice) return;
    onVoice(voice);
    setToast({text: `Voice preset “${builtin?.name ?? user?.name}” applied.`});
  };
  const [naming, setNaming] = useState<string | null>(null);
  const savePreset = (raw: string) => {
    const name = raw.trim().slice(0, 60);
    setNaming(null);
    if (!name) return;
    const voice = Object.fromEntries(VOICE_PARAMS.map(k => [k, project.voice[k]])) as Patch;
    const next = [...userPresets.filter(p => p.name !== name), {name, voice}].slice(-40);
    setUserPresets(next);
    bridge.storage.set(USER_PRESETS, next);
    setToast({text: `Saved preset “${name}”.`});
  };

  const exportLocal = async (mode: Mode) => {
    if (!lexicon) throw new Error('Dictionary still loading');
    const {score} = projectScore(project, lexicon, mode);
    const wav = await renderWav(score, project.voice, 48000);
    const url = URL.createObjectURL(new Blob([wav.bytes as BlobPart], {type: 'audio/wav'}));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/[^\w-]+/g, '-') || 'voice'}-${mode}.wav`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return wav.seconds;
  };
  const exportWav = async () => {
    const mode = project.mode;
    setBusy('Rendering…');
    try {
      if (bridge.exportWav) {
        try {
          await bridge.exportWav(project, mode);
          setToast({text: 'WAV rendered by the local engine.'});
          return;
        } catch (e) {
          // Backend unavailable (e.g. no Node on a remote gateway): render here instead.
          const seconds = await exportLocal(mode);
          setToast({text: `Backend render failed (${(e as Error).message}); exported ${seconds.toFixed(1)} s from this window instead.`});
          return;
        }
      }
      const seconds = await exportLocal(mode);
      setToast({text: `Exported ${seconds.toFixed(1)} s WAV (48 kHz stereo).`});
    } catch (e) {
      setToast({text: `Export failed: ${(e as Error).message}`});
    } finally {
      setBusy('');
    }
  };
  const saveProjectFile = async () => {
    const text = JSON.stringify(project, null, 2);
    if (bridge.files) {
      const where = await bridge.files.save(`${project.name.replace(/[^\w-]+/g, '-') || 'voice'}.voicelab.json`, text);
      if (where) setToast({text: `Saved ${where}`});
      return;
    }
    const url = URL.createObjectURL(new Blob([text], {type: 'application/json'}));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/[^\w-]+/g, '-') || 'voice'}.voicelab.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };
  const openProjectFile = async () => {
    try {
      let text: string | null = null;
      if (bridge.files) text = await bridge.files.open();
      else {
        text = await new Promise<string | null>(resolve => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.json,application/json';
          input.onchange = () => input.files?.[0]?.text().then(resolve, () => resolve(null));
          input.click();
        });
      }
      if (!text) return;
      const p = validateProject(JSON.parse(text));
      update(() => p);
      setToast({text: `Opened “${p.name}”.`});
    } catch (e) {
      setToast({text: `Could not open project: ${(e as Error).message}`});
    }
  };

  const toggleAudio = async () => {
    if (running || status === 'starting') {
      await audio.stop();
      setHolding(false);
    } else {
      await ensureAudio();
    }
  };

  const nowSound = nameSound({
    params: (params ?? {...project.voice, ...project.shape}) as Record<string, number>,
    formants: model?.formants ?? [],
    frication: running && telemetry ? telemetry.state[STATE.frication] : 0,
    closed: airway.closed || (!running && areas[minIndex] < 0.004 && nasal < 0.01),
    nasalShare: running ? airway.nasalShare : nasal > 0.01 ? (areas[minIndex] < 0.004 ? 1 : 0.3) : 0,
    minIndex,
    minArea: areas[minIndex],
    sounding: running ? airway.gate > 0.05 : true,
  });
  const statusText = status === 'running' ? `${(audio.sampleRate / 1000).toFixed(1)} kHz · live` : status === 'starting' ? 'starting…' : status === 'error' ? 'audio error' : 'audio off';
  const formants = model?.formants.slice(0, 3) ?? [];

  return (
    <div className="hvl-root" ref={rootRef} onFocusCapture={e => setTyping(['TEXTAREA', 'INPUT'].includes((e.target as HTMLElement).tagName) && (e.target as HTMLInputElement).type !== 'range')} onBlurCapture={() => setTyping(false)}>
      <style>{CSS}</style>
      <div className="hvl-shell">
        <header className="hvl-top">
          <div className="hvl-brand">
            <Mark />
            <div className="hvl-title">
              <h1>Voice Lab</h1>
              <input aria-label="Project name" value={project.name} maxLength={120} onChange={e => update(p => ({...p, name: e.target.value}))} title={bridge.scopeLabel} />
            </div>
          </div>
          <div className="hvl-actions">
            <span className="hvl-status" title={audio.error || undefined}><span className={`hvl-dot is-${status}`} />{statusText}</span>
            <button className={`hvl-btn ${running ? 'is-on' : ''}`} onClick={toggleAudio} aria-pressed={running}>{Icon.power} {running ? 'Audio on' : 'Start audio'}</button>
            <label className="hvl-row" style={{gap: 4}} title="Monitor volume">
              <span style={{color: 'var(--hvl-fg3)', display: 'inline-flex'}}>{Icon.volume}</span>
              <input className="hvl-range" type="range" min={0} max={1.2} step={0.01} value={volume} style={{width: 70, '--p': `${(volume / 1.2) * 100}%`} as React.CSSProperties} onChange={e => setVolume(Number(e.target.value))} aria-label="Monitor volume" />
            </label>
            <select className="hvl-select" value="" onChange={e => { applyPreset(e.target.value); e.target.value = ''; }} aria-label="Voice presets">
              <option value="" disabled>Voice presets…</option>
              <optgroup label="Built-in">{VOICE_PRESETS.map(p => <option key={p.id} value={p.id}>{p.name} — {p.description}</option>)}</optgroup>
              {userPresets.length > 0 && <optgroup label="Saved">{userPresets.map(p => <option key={p.name} value={`user:${p.name}`}>{p.name}</option>)}</optgroup>}
            </select>
            {naming === null ? (
              <button className="hvl-btn" onClick={() => setNaming(project.name)} title="Save the current voice as a preset">{Icon.save} Preset</button>
            ) : (
              <form className="hvl-row" style={{gap: 4}} onSubmit={e => { e.preventDefault(); savePreset(naming); }}>
                <input className="hvl-input" autoFocus value={naming} maxLength={60} aria-label="Preset name" style={{width: 150}}
                  onChange={e => setNaming(e.target.value)} onKeyDown={e => e.key === 'Escape' && setNaming(null)} />
                <button className="hvl-btn is-primary" type="submit">Save</button>
              </form>
            )}
            <button className="hvl-btn is-ghost" onClick={openProjectFile} title="Open a project file">{Icon.upload}</button>
            <button className="hvl-btn is-ghost" onClick={saveProjectFile} title="Save the project as a file">{Icon.save}</button>
            <button className="hvl-btn is-primary" onClick={exportWav} disabled={!!busy || !loaded}>{Icon.download} {busy || 'Export WAV'}</button>
          </div>
        </header>

        <main className="hvl-main">
          <section className="hvl-card hvl-stage" aria-label="Portrait">
            <div className="hvl-stage-head">
              <span className="hvl-kicker">Articulation</span>
              <span className="hvl-row" style={{gap: 10}}>
                <label className="hvl-check"><input type="checkbox" checked={cutaway} onChange={e => { setCutaway(e.target.checked); bridge.storage.set('cutaway', e.target.checked); }} /> Cutaway</label>
                <label className="hvl-check" title="Floating sung words and head motion while singing"><input type="checkbox" checked={stageOn} onChange={e => { setStageOn(e.target.checked); bridge.storage.set('stage', e.target.checked); }} /> Stage</label>
                <label className="hvl-check"><input type="checkbox" checked={labels} onChange={e => { setLabels(e.target.checked); bridge.storage.set('labels', e.target.checked); }} /> Labels</label>
              </span>
            </div>
            <div className="hvl-portrait-wrap">
              <Portrait pose={pose} airway={airway} cutaway={cutaway} labels={labels && !singing} speaking={scorePlaying} onDrag={onPortraitDrag} stage={stage} />
              <div className={`hvl-now is-${nowSound.kind}`} aria-live="polite">
                <div className="hvl-now-symbol" title="Sound the model is making now">{nowSound.symbol}</div>
                <div className="hvl-now-label">{running ? nowSound.label : `shape · ${nowSound.label}`}</div>
                <dl aria-label="Current values">
                  <dt>Pitch</dt><dd>{Math.round(f0)} Hz · {noteName(hzToMidi(Math.max(30, f0)))}</dd>
                  <dt>F1 · F2</dt><dd>{formants[0] ? Math.round(formants[0].frequency) : '–'} · {formants[1] ? Math.round(formants[1].frequency) : '–'} Hz</dd>
                  <dt>Lips</dt><dd>{areas[areas.length - 1] < 0.004 ? 'sealed' : `${areas[areas.length - 1].toFixed(2)} cm²`}</dd>
                  <dt>Narrowest</dt><dd>{areas[minIndex] < 0.004 ? 'sealed' : `${areas[minIndex].toFixed(2)} cm²`}</dd>
                  <dt>Nasal port</dt><dd>{nasal < 0.01 ? 'shut' : `${nasal.toFixed(2)} cm²`}</dd>
                  <dt>Tract</dt><dd>{length.toFixed(1)} cm</dd>
                </dl>
              </div>
            </div>
            {karaoke && (
              <div className="hvl-karaoke" aria-live="off">
                {karaoke.words.map((w, i) => <span key={i} className={`is-${w.state}`}>{w.text}</span>)}
              </div>
            )}
            <div className="hvl-stage-foot">
              <span>Drag the handles: lips, jaw, tongue, tip, velum.</span>
              <span style={{marginLeft: 'auto'}}>Stylised view of the modeled articulators — not medical anatomy.</span>
            </div>
          </section>

          <PlaySpeakSingTabs
            project={project}
            mode={project.mode}
            onMode={m => update(p => ({...p, mode: m}))}
            live={params}
            agentKeys={agentKeys}
            onVoice={onVoice}
            onShape={onShape}
            holding={holding}
            onHold={onHold}
            latch={latch}
            onLatch={setLatch}
            running={running}
            speechPlan={speechPlan}
            songPlan={songPlan}
            onSpeech={s => update(p => ({...p, speech: {...p.speech, ...s}, mode: 'speak'}))}
            onSong={s => update(p => ({...p, song: {...p.song, ...s}, mode: 'sing'}))}
            onPlay={m => void playMode(m)}
            onStop={stop}
            scorePlaying={scorePlaying}
            position={position}
            ready={!!lexicon}
            onPreviewNote={previewNote}
            liveSing={liveSing}
            onLiveSing={on => { setLiveSing(on); restartLive(); if (!on) stop(); }}
            nextSyllable={syllables.length ? syllables[liveIndex % syllables.length].text : ''}
            onLiveRestart={restartLive}
          />
        </main>

        <section className="hvl-scopes" aria-label="Analysis">
          <Airway areas={areas} length={length} nasal={nasal} minIndex={minIndex} />
          <Spectrum audio={audio} running={running} model={model} f0={running ? f0 : 0} />
          <Waveform audio={audio} running={running} />
          <Glottal shape={audio.glottal ?? null} rd={rd} f0={running ? f0 : 0} voicing={params?.voicing ?? 1} sounding={running && airway.gate > 0.05 && !airway.closed} />
        </section>

        <Keyboard base={base} onBaseChange={b => { setBase(b); bridge.storage.set('keyboardBase', b); }} onNoteOn={m => void onNoteOn(m)} onNoteOff={onNoteOff} enabled={!typing}
          midi={midi} />
        <footer className="hvl-note" style={{display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap'}}>
          <span>Physical articulatory synthesis in WebAssembly — no samples, no network. {bridge.scopeLabel}</span>
          <span>Unofficial character voice inspired by Nous Girl.</span>
        </footer>
      </div>
      {toast && (
        <div className="hvl-toast" role="status">
          <span style={{color: 'var(--hvl-accent)', display: 'inline-flex'}}>{Icon.spark}</span>
          <span>{toast.text}</span>
          {toast.action && <button className="hvl-btn" onClick={() => { toast.action!.run(); setToast(null); }}>{toast.action.label}</button>}
          <button className="hvl-btn is-ghost" onClick={() => setToast(null)} aria-label="Dismiss">×</button>
        </div>
      )}
    </div>
  );
}
