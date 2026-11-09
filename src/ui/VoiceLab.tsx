/** Voice Lab instrument: portrait, mode console, analysis and keyboard. */
import React, {useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore} from 'react';
import type {Score, TractResponse} from '../core/engine';
import {STATE} from '../core/engine';
import {midiToHz, noteName, hzToMidi, PARAM_NAMES, type ParamName, type Patch, VOICE_PARAMS} from '../core/params';
import {lyricSyllables, planSong, planSpeech, type Plan, type SongPlan} from '../core/planner';
import {PerformanceController} from '../performance/controller';
import {jamMessage, PHRASE_GAP, PhraseRecorder, type JamAnswer} from '../performance/jam';
import {VOICE_PRESETS} from '../core/presets';
import {duetScore, newProject, projectScore, validateProject, type Mode, type Project} from '../core/project';
import {planHit} from '../core/hits';
import type {Lexicon} from '../core/text';
import type {VoiceLabBridge} from '../bridge';
import {engineModule, loadLexicon} from './assets';
import {ModelAnalysis} from './modelAnalysis';
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
  const [base, setBase] = useState(() => bridge.storage.get('keyboardBase', 60));
  const [volume, setVolume] = useState(() => bridge.storage.get('volume', 0.9));
  const [agentKeys, setAgentKeys] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<null | {text: string; action?: {label: string; run: () => void}}>(null);
  const [busy, setBusy] = useState('');
  const [userPresets, setUserPresets] = useState<Array<{name: string; voice: Patch}>>(() => bridge.storage.get(USER_PRESETS, []));
  const [typing, setTyping] = useState(false);
  const [scopesOpen, setScopesOpen] = useState(false);
  // Live singing: each key press sings the next lyric syllable.
  const [liveSing, setLiveSing] = useState(false);
  const liveCursor = useRef(0);
  const [liveIndex, setLiveIndex] = useState(0);
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
        setToast({text: `Hermes updated ${what}.`, action: p.mode !== 'play' ? {label: p.mode === 'sing' ? 'Sing it' : p.mode === 'beat' ? 'Play it' : 'Speak it', run: () => playMode(p.mode, p)} : undefined});
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

  // ---- Jam with Hermes: a phrase on the keys goes to the chat; the agent sings an answer --------
  type JamState = 'off' | 'idle' | 'playing' | 'waiting' | 'answering';
  const [jam, setJam] = useState<{state: JamState; text?: string}>({state: 'off'});
  const jamRef = useRef({on: false, recorder: new PhraseRecorder(), timer: null as ReturnType<typeof setTimeout> | null, wait: null as ReturnType<typeof setTimeout> | null, last: null as JamAnswer | null});
  const jamClock = () => performance.now() / 1000;
  const syllables = useMemo(() => (lexicon ? lyricSyllables(project.song.lyrics, lexicon) : []), [lexicon, project.song.lyrics]);
  const performanceOptions = useRef({ensureAudio, syllables, liveActive: false});
  performanceOptions.current = {ensureAudio, syllables, liveActive: liveSing && project.mode === 'sing' && syllables.length > 0};
  const performanceController = useMemo(() => new PerformanceController(audio, {
    ensureAudio: () => performanceOptions.current.ensureAudio(),
    patch: () => ({...projectRef.current.voice, ...projectRef.current.shape}),
    nextSyllable: () => {
      const {liveActive, syllables} = performanceOptions.current;
      if (!liveActive) return;
      const syllable = syllables[liveCursor.current++ % syllables.length];
      setLiveIndex(liveCursor.current);
      if (jamRef.current.on) jamRef.current.recorder.sang(syllable.text);
      return syllable;
    },
  }), [audio]);
  const performanceState = useSyncExternalStore(performanceController.subscribe, performanceController.getSnapshot);
  const {holding, latch} = performanceState;
  useEffect(() => {
    const cancel = () => performanceController.stop();
    const visibility = () => { if (document.hidden) cancel(); };
    window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('blur', cancel);
      document.removeEventListener('visibilitychange', visibility);
      cancel();
    };
  }, [performanceController]);
  const onVoice = (p: Patch) => {
    projectRef.current = {...projectRef.current, voice: {...projectRef.current.voice, ...p}};
    update(prev => ({...prev, voice: {...prev.voice, ...p}}));
    performanceController.patch(p, 30);
  };
  const onShape = (p: Patch) => {
    projectRef.current = {...projectRef.current, shape: {...projectRef.current.shape, ...p}};
    update(prev => ({...prev, shape: {...prev.shape, ...p}, mode: 'play'}));
    performanceController.patch(p, 25);
  };
  const onHold = (on: boolean) => performanceController.sustain(on);
  const restartLive = () => { liveCursor.current = 0; setLiveIndex(0); };
  const clearJamTimer = () => {
    const j = jamRef.current;
    if (j.timer) clearTimeout(j.timer);
    j.timer = null;
  };
  const sendPhrase = () => {
    const j = jamRef.current;
    clearJamTimer();
    if (!j.on || !bridge.jam) return;
    const phrase = j.recorder.take(projectRef.current.song.bpm, jamClock());
    if (!phrase) return;
    setJam({state: 'waiting'});
    if (j.wait) clearTimeout(j.wait);
    j.wait = setTimeout(() => {
      j.wait = null;
      setJam(s => (s.state === 'waiting' ? {state: 'idle', text: 'No answer yet. Play another phrase or check the chat.'} : s));
    }, 90000);
    bridge.jam.send(jamMessage(phrase)).catch(e => {
      if (j.wait) clearTimeout(j.wait);
      j.wait = null;
      setJam({state: 'idle', text: (e as Error).message});
    });
  };
  const onNoteOn = (midi: number, source = `key:${midi}`) => {
    const j = jamRef.current;
    if (j.on) {
      clearJamTimer();
      j.recorder.noteOn(source, midi, jamClock());
      setJam(s => (s.state === 'playing' ? s : {state: 'playing'}));
    }
    performanceController.noteOn(source, midi);
  };
  const onNoteOff = (midi: number, source = `key:${midi}`) => {
    performanceController.noteOff(source);
    const j = jamRef.current;
    if (!j.on) return;
    j.recorder.noteOff(source, jamClock());
    if (!j.recorder.holding && !j.recorder.empty) {
      clearJamTimer();
      j.timer = setTimeout(sendPhrase, PHRASE_GAP * 1000);
    }
  };
  const toggleJam = () => {
    const j = jamRef.current;
    j.on = !j.on;
    clearJamTimer();
    if (j.wait) clearTimeout(j.wait);
    j.wait = null;
    j.recorder.clear();
    setJam({state: j.on ? 'idle' : 'off'});
  };
  const midi = useMidi((m, _v, source) => onNoteOn(m, source), (m, source) => onNoteOff(m, source));
  const previewNote = (midi: number) => performanceController.preview(midi);

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

  const playMode = (mode: Mode, source = projectRef.current) => {
    if (!lexicon) return;
    setTrying(null);
    const {score} = projectScore(source, lexicon, mode);
    const cues = mode === 'sing' ? planSong(source.song.notes, source.song.lyrics, lexicon, {bpm: source.song.bpm, voice: source.voice, style: source.song.style}).cues : [];
    performanceController.play({
      score: mode === 'beat' && source.beat.loop ? {...score, length: source.beat.steps.length * 15 / source.beat.bpm} : score,
      cues, loop: mode === 'beat' ? source.beat.loop : mode === 'sing' && source.song.loop,
      second: mode === 'sing' ? duetScore(source, lexicon) ?? undefined : undefined,
    });
  };
  const singAnswer = (answer: JamAnswer) => {
    if (!lexicon) return;
    const plan = planSong(answer.notes, answer.lyrics, lexicon, {bpm: answer.bpm, voice: projectRef.current.voice, style: projectRef.current.song.style});
    performanceController.play({score: plan.score, cues: plan.cues});
  };
  const singAnswerRef = useRef(singAnswer);
  singAnswerRef.current = singAnswer;
  useEffect(() => {
    if (!bridge.jam) return;
    const j = jamRef.current;
    const off = bridge.jam.subscribe(answer => {
      if (j.wait) clearTimeout(j.wait);
      j.wait = null;
      j.last = answer;
      // A key already down for the next phrase keeps the floor.
      if (j.recorder.holding) return;
      setJam({state: j.on ? 'answering' : 'off', text: answer.lyrics});
      singAnswerRef.current(answer);
    });
    return () => {
      off();
      clearJamTimer();
      if (j.wait) clearTimeout(j.wait);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge]);
  const playPad = (id: string) => {
    if (!lexicon) return;
    performanceController.play({score: planHit(id, projectRef.current.voice, lexicon, projectRef.current.beat.bpm)});
  };
  const [trying, setTrying] = useState<string | null>(null);
  const [bestiary, setBestiary] = useState(false);
  const callCreature = (score: Score) => performanceController.play({score});
  const trySound = (symbol: string) => {
    if (!lexicon) return;
    setTrying(symbol);
    performanceController.play({score: planSpeech(`AA1 ${symbol} AA1`, lexicon, {voice: projectRef.current.voice, phonemes: true}).score});
  };
  const stop = performanceController.stop;

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
  const modelWorker = useRef<ModelAnalysis | null>(null);
  useEffect(() => {
    const worker = new ModelAnalysis(engineModule(), setModel);
    modelWorker.current = worker;
    return () => { modelWorker.current = null; worker.dispose(); };
  }, []);
  const lastAnalysis = useRef(0);
  useEffect(() => {
    const now = performance.now();
    if (now - lastAnalysis.current < 90 && running) return;
    lastAnalysis.current = now;
    modelWorker.current?.request(areas, nasal, length);
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
    oralPressure: running && telemetry ? telemetry.state[STATE.oralPressure] : 0,
    frication: running && telemetry ? telemetry.state[STATE.frication] : 0,
    noiseIndex: running && telemetry ? telemetry.state[STATE.noiseIndex] : 0,
    voicing: running && telemetry ? telemetry.state[STATE.voicing] : 0,
    level: running && telemetry ? telemetry.state[STATE.rms] : 0,
    f0: running && telemetry ? telemetry.state[STATE.f0] : 0,
  };
  const minIndex = useMemo(() => {
    let k = 7;
    for (let i = 7; i < areas.length; i++) if (areas[i] < areas[k]) k = i;
    return k;
  }, [areas]);

  const scorePlaying = running && !!telemetry && telemetry.state[STATE.playing] > 0.5;
  const wasPlaying = useRef(false);
  useEffect(() => {
    if (wasPlaying.current && !scorePlaying) {
      performanceController.completePlayback();
      setJam(s => (s.state === 'answering' ? {state: 'idle', text: s.text} : s));
    }
    wasPlaying.current = scorePlaying;
  }, [scorePlaying, performanceController]);
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
  const singing = scorePlaying && performanceState.cues.length > 0;
  const stage: StageState | undefined = stageOn ? {
    time: singing ? position : performance.now() / 1000,
    cues: singing ? performanceState.cues : [],
    beat: 60 / project.song.bpm,
    level,
    f0: singing && (params?.gate ?? 0) > 0.05 ? f0 : 0,
    singing,
  } : undefined;
  const karaoke = stage && singing ? lyricLine(stage) : null;

  const onPortraitDrag = onShape;
  const onPortraitGrab = () => performanceController.touch('portrait', true);
  const onPortraitRelease = () => performanceController.touch('portrait', false);

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
    const wav = await renderWav(score, project.voice, 48000, undefined, mode === 'sing' ? duetScore(project, lexicon) ?? undefined : undefined);
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
      stop();
      await audio.stop();
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
              <Portrait pose={pose} airway={airway} cutaway={cutaway} labels={labels && !singing} speaking={scorePlaying} onDrag={onPortraitDrag} onDragStart={onPortraitGrab} onDragEnd={onPortraitRelease} stage={stage} />
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
              <span>Drag the mouth to sound. Amber: pressure / hiss. Green: voicing.</span>
              <span style={{marginLeft: 'auto'}}>Stylised view of the modeled articulators — not medical anatomy.</span>
            </div>
          </section>

          <PlaySpeakSingTabs
            project={project}
            mode={bestiary ? 'bestiary' : project.mode}
            onMode={m => { if (m === 'bestiary') setBestiary(true); else { setBestiary(false); update(p => ({...p, mode: m})); } }}
            onCall={s => void callCreature(s)}
            live={params}
            agentKeys={agentKeys}
            onVoice={onVoice}
            onShape={onShape}
            onTouch={(source, on) => performanceController.touch(source, on)}
            onArticulation={(source, patch) => performanceController.articulation(source, patch)}
            holding={holding}
            onHold={onHold}
            latch={latch}
            onLatch={on => performanceController.setLatch(on)}
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
            onTry={symbol => void trySound(symbol)}
            trying={trying}
            onBeat={b => update(p => ({...p, beat: {...p.beat, ...b}, mode: 'beat'}))}
            onPad={id => void playPad(id)}
            beatStep={project.mode === 'beat' ? Math.floor((position - 0.25) / (15 / project.beat.bpm)) % project.beat.steps.length : -1}
          />
        </main>

        <Keyboard base={base} onBaseChange={b => { setBase(b); bridge.storage.set('keyboardBase', b); }} onNoteOn={onNoteOn} onNoteOff={onNoteOff} activeNotes={performanceState.notes} enabled={!typing}
          midi={midi}
          jam={bridge.jam ? {state: jam.state, text: jam.text, onToggle: toggleJam, onAgain: jamRef.current.last ? () => singAnswer(jamRef.current.last!) : undefined} : undefined} />
        <details className="hvl-disclosure hvl-analysis" onToggle={e => setScopesOpen(e.currentTarget.open)}>
          <summary>Analysis scopes</summary>
          {scopesOpen && <section className="hvl-scopes" aria-label="Analysis">
          <Airway areas={areas} length={length} nasal={nasal} minIndex={minIndex} activity={airway} />
          <Spectrum audio={audio} running={running} model={model} f0={running ? f0 : 0} />
          <Waveform audio={audio} running={running} />
          <Glottal shape={audio.glottal ?? null} rd={rd} f0={running ? f0 : 0} voicing={params?.voicing ?? 1} activity={airway.voicing} sounding={running && airway.gate > 0.05} />
          </section>}
        </details>
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
