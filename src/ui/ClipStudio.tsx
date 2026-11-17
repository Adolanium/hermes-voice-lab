import React, {useEffect, useMemo, useRef, useState} from 'react';
import {defaultExpression, EXPRESSIONS, type Expression} from '../core/face-expression';
import {MOVEMENTS, defaultMovement, type Movement, AVATAR_COLORS, defaultAvatarColor, type AvatarColor, clipSamples, planEnsemble, readMelody, writeMelody, type Ensemble, type EnsembleMix, type Singer} from '../core/ensemble';
import {importScoreFile, type ImportedScore} from '../core/score-import';
import {importArrangement} from '../core/ensemble-import';
import {songFromScore} from '../core/project';
import {VOICE_PRESETS} from '../core/presets';
import type {Lexicon} from '../core/text';
import {encodeWav} from '../core/wav';
import {loadStage} from './night-train-stage';
import {drawEnsemble, STAGE_WIDTH, STAGE_HEIGHT} from './ensemble-stage';
import {prepareMix, saveBlob} from './ensemble-audio';

interface Props {
  arrangement: Ensemble;
  lexicon: Lexicon | null;
  onChange: (next: Ensemble) => void;
}
const videoTypes = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/mp4',
  'video/webm',
];
function recordingType() {
  return typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream
    ? undefined
    : videoTypes.find((t) => MediaRecorder.isTypeSupported(t));
}

function SingerEditor({
  singer,
  index,
  onChange,
  onDirty,
}: {
  singer: Singer;
  index: number;
  onChange: (patch: Partial<Singer>) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const melody = useMemo(() => writeMelody(singer.notes), [singer.notes]);
  const [draft, setDraft] = useState(melody),
    [error, setError] = useState('');
  const [score, setScore] = useState<{name: string; bytes: Uint8Array; data: ImportedScore} | null>(null);
  const [importing, setImporting] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    setDraft(melody);
    onDirty(false);
  }, [melody, onDirty]);
  function apply() {
    try {
      onChange({notes: readMelody(draft)});
      onDirty(false);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function load(name: string, bytes: Uint8Array, id?: string) {
    setImporting(true);
    try {
      const data = await importScoreFile(name, bytes, {part: id, preserveStart: true});
      if (!alive.current) return;
      const {song, messages} = songFromScore(data, 1440);
      onChange({notes: song.notes, lyrics: song.lyrics});
      setScore({name, bytes, data});
      setError(['Imported ' + song.notes.length + ' notes at the arrangement tempo.', ...messages].join(' '));
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setImporting(false);
    }
  }
  return (
    <div className="hvl-singer-editor">
      <div className="hvl-clip-fields">
        <label>
          Part name{' '}
          <input
            className="hvl-input"
            maxLength={40}
            defaultValue={singer.name}
            key={singer.name}
            onBlur={(e) => {
              const name = e.target.value.trim();
              if (name && name !== singer.name) onChange({name});
              else e.target.value = singer.name;
            }}
          />
        </label>
        <label>
          Voice{' '}
          <select className="hvl-select" value={singer.voice} onChange={(e) => onChange({voice: e.target.value})}>
            {VOICE_PRESETS.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Avatar color{' '}
          <select className="hvl-select" value={singer.avatarColor ?? defaultAvatarColor(index)}
            onChange={ev => onChange({avatarColor: ev.target.value as AvatarColor})}>
            {AVATAR_COLORS.map(color => <option key={color} value={color}>{color[0].toUpperCase() + color.slice(1)}</option>)}
          </select>
        </label>
        <label>
          Expression{' '}
          <select className="hvl-select" value={singer.expression ?? defaultExpression(index)}
            onChange={ev => onChange({expression: ev.target.value as Expression})}>
            {EXPRESSIONS.map(style => <option key={style} value={style}>{style[0].toUpperCase() + style.slice(1)}</option>)}
          </select>
        </label>
        <label>
          Beat movement{' '}
          <select className="hvl-select" value={singer.movement ?? defaultMovement(index)}
            onChange={ev => onChange({movement: ev.target.value as Movement})}>
            {MOVEMENTS.map(style => <option key={style} value={style}>{style[0].toUpperCase() + style.slice(1)}</option>)}
          </select>
        </label>
        <label>
          Level{' '}
          <input
            type="range"
            min="0"
            max="1"
            step=".01"
            value={singer.level}
            onChange={(e) => onChange({level: +e.target.value})}
          />
        </label>
        <label>
          Pan{' '}
          <input type="range" min="-1" max="1" step=".01" value={singer.pan} onChange={(e) => onChange({pan: +e.target.value})} />
        </label>
        <label className="hvl-check">
          <input type="checkbox" checked={singer.muted} onChange={(e) => onChange({muted: e.target.checked})} /> Mute
        </label>
      </div>
      <label>
        Lyrics{' '}
        <textarea
          aria-label="Lyrics"
          className="hvl-textarea"
          value={singer.lyrics}
          maxLength={8000}
          onChange={(e) => onChange({lyrics: e.target.value})}
        />
      </label>
      <small>
        English, русский or 한국어. Each note takes a syllable. A single syllable repeats across the part. Leave lyrics empty for
        “oo”. Use a lone hyphen to hold a vowel.
      </small>
      <label>
        Melody{' '}
        <textarea
          aria-label="Melody"
          className="hvl-textarea"
          spellCheck={false}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            onDirty(e.target.value !== melody);
            setError('');
          }}
        />
      </label>
      <small>Write pitch and beats, such as E4:1 G4:0.5 r:0.5. Import a MIDI or MusicXML file to use a written part.</small>
      <div className="hvl-clip-fields">
        {draft !== melody && (
          <>
            <button className="hvl-btn" onClick={apply}>
              Apply melody
            </button>
            <button
              className="hvl-btn"
              onClick={() => {
                setDraft(melody);
                onDirty(false);
                setError('');
              }}>
              Discard melody edit
            </button>
          </>
        )}
        <label>
          Import score{' '}
          <input
            type="file"
            accept=".mid,.midi,.xml,.mxl,.musicxml"
            disabled={importing}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f)
                try {
                  await load(f.name, new Uint8Array(await f.arrayBuffer()));
                } catch (err) {
                  setError((err as Error).message);
                }
            }}
          />
        </label>
        {score && score.data.parts.length > 1 && (
          <label>
            Score part{' '}
            <select
              className="hvl-select"
              disabled={importing}
              value={score.data.part}
              onChange={(e) => void load(score.name, score.bytes, e.target.value)}>
              {score.data.parts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.notes})
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {error && <span role="status">{error}</span>}
    </div>
  );
}

export function ClipStudio({arrangement: e, lexicon, onChange}: Props) {
  const [stageReady, setStageReady] = useState(false);
  const importJob = useRef(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [part, setPart] = useState(0),
    [dirty, setDirty] = useState(false),
    [status, setStatus] = useState(''),
    [message, setMessage] = useState('');
  const task = useRef<AbortController | null>(null),
    cache = useRef<EnsembleMix | null>(null);
  const parts = useMemo(() => (lexicon ? planEnsemble(e, lexicon) : []), [e.singers, e.bpm, lexicon]);
  const seconds = Math.max(0, ...parts.map((p) => p.score.length + 0.6));
  const selected = Math.min(part, e.singers.length - 1);
  const mime = recordingType();
  useEffect(() => {
    let live = true;
    loadStage().then(() => live && setStageReady(true), err => live && setMessage(err.message));
    return () => {live = false;};
  }, []);
  const previousAudio = useRef({singers: e.singers, bpm: e.bpm, lexicon});
  useEffect(() => {
    const previous = previousAudio.current;
    const audioKeys = ['notes', 'lyrics', 'voice', 'pan', 'level', 'muted'] as const;
    const sameParts = previous.singers.length === e.singers.length && e.singers.every((s, i) =>
      audioKeys.every(key => s[key] === previous.singers[i][key]));
    if (!sameParts || e.bpm !== previous.bpm || lexicon !== previous.lexicon) cache.current = null;
    previousAudio.current = {singers: e.singers, bpm: e.bpm, lexicon};
  }, [e.singers, e.bpm, lexicon]);
  useEffect(() => {
    if (canvas.current) drawEnsemble(canvas.current, e, parts, cache.current, e.excerpt?.start ?? 0);
    return () => {
      importJob.current++;
      task.current?.abort();
      task.current = null;
    };
  }, [e, parts, stageReady]);
  useEffect(() => {
    setStatus('');
  }, [e, parts]);

  async function perform(action: 'play' | 'video' | 'wav') {
    if (task.current || !canvas.current || !lexicon) return;
    const control = new AbortController();
    task.current = control;
    const stage = canvas.current;
    let context: AudioContext | undefined,
      source: AudioBufferSourceNode | undefined,
      stream: MediaStream | undefined,
      recorder: MediaRecorder | undefined,
      raf = 0;
    const visible = () => {
      if (action === 'video' && document.hidden) {
        setMessage('Video export stopped when the window was hidden. Keep Clip studio visible while exporting.');
        control.abort();
      }
    };
    document.addEventListener('visibilitychange', visible);
    const cancel = () => {
      cancelAnimationFrame(raf);
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      try {
        source?.stop();
      } catch {}
    };
    control.signal.addEventListener('abort', cancel);
    try {
      setStatus('Preparing voices…');
      setMessage('');
      if (action !== 'wav') {
        context = new AudioContext();
        await context.resume();
      }
      control.signal.throwIfAborted();
      const mix = cache.current ?? (await prepareMix(parts, 48000, control.signal));
      control.signal.throwIfAborted();
      cache.current = mix;
      const range = clipSamples(mix, e.excerpt);
      const offset = range.start / mix.rate,
        duration = (range.end - range.start) / mix.rate;
      const filename = e.title.trim().replace(/[^\p{L}\p{N}_.-]+/gu, '-') || 'clip';
      if (action === 'wav') {
        saveBlob(
          new Blob(
            [
              encodeWav(
                [mix.left.subarray(range.start, range.end), mix.right.subarray(range.start, range.end)],
                mix.rate
              ) as BlobPart,
            ],
            {type: 'audio/wav'}
          ),
          filename + '.wav'
        );
        setMessage('Stereo WAV exported.');
        return;
      }
      const ctx = context!,
        buffer = ctx.createBuffer(2, mix.left.length, mix.rate);
      buffer.getChannelData(0).set(mix.left);
      buffer.getChannelData(1).set(mix.right);
      source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      let recording: Promise<Blob> | undefined;
      if (action === 'video') {
        if (!mime) throw new Error('Video export needs a browser with canvas recording, such as Chrome.');
        stream = stage.captureStream(25);
        const dest = ctx.createMediaStreamDestination();
        source.connect(dest);
        dest.stream.getAudioTracks().forEach((track) => stream!.addTrack(track));
        recorder = new MediaRecorder(stream, {mimeType: mime, videoBitsPerSecond: 5000000});
        const active = recorder;
        recording = new Promise<Blob>((resolve, reject) => {
          const chunks: Blob[] = [];
          active.ondataavailable = (event) => {
            if (event.data.size) chunks.push(event.data);
          };
          active.onstop = () => resolve(new Blob(chunks, {type: active.mimeType}));
          active.onerror = () => reject(new Error('Video encoding failed.'));
        });
        recorder.start(500);
      }
      setStatus(action === 'video' ? 'Recording video…' : 'Playing…');
      const start = ctx.currentTime + 0.06;
      const paint = () => {
        drawEnsemble(stage, e, parts, mix, Math.min(offset + duration, offset + Math.max(0, ctx.currentTime - start)));
        raf = requestAnimationFrame(paint);
      };
      paint();
      const ended = new Promise<void>((resolve) => {
        source!.onended = () => resolve();
      });
      source.start(start, offset, duration);
      if (recording) {
        await Promise.race([ended, recording]);
        control.signal.throwIfAborted();
        if (recorder!.state !== 'inactive') recorder!.stop();
        const blob = await recording;
        control.signal.throwIfAborted();
        saveBlob(blob, filename + (blob.type.includes('mp4') ? '.mp4' : '.webm'));
        setMessage('Video exported with stereo audio.');
      } else await ended;
    } catch (error) {
      if (!control.signal.aborted) setMessage((error as Error).message);
    } finally {
      document.removeEventListener('visibilitychange', visible);
      control.signal.removeEventListener('abort', cancel);
      cancel();
      stream?.getTracks().forEach((t) => t.stop());
      source?.disconnect();
      if (context && context.state !== 'closed') void context.close().catch(() => {});
      if (task.current === control) {
        task.current = null;
        setStatus('');
        drawEnsemble(stage, e, parts, cache.current, e.excerpt?.start ?? 0);
      }
    }
  }
  const locked = !!status;
  const change = (next: Ensemble) => {
    try {
      onChange(next);
      setMessage('');
    } catch (err) {
      setMessage((err as Error).message);
      throw err;
    }
  };
  return (
    <main className="hvl-card hvl-clip" aria-label="Clip studio">
      <canvas ref={canvas} width={STAGE_WIDTH} height={STAGE_HEIGHT} aria-label={'Animated performance of ' + e.title} />
      <div className="hvl-clip-tools">
        <button className="hvl-btn is-primary" disabled={locked || dirty || !lexicon || !stageReady} onClick={() => void perform('play')}>
          Play arrangement
        </button>
        <button className="hvl-btn" disabled={locked || dirty || !mime || !lexicon || !stageReady} onClick={() => void perform('video')}>
          Export video
        </button>
        <button className="hvl-btn" disabled={locked || dirty || !lexicon} onClick={() => void perform('wav')}>
          Export WAV
        </button>
        {task.current && locked && (
          <button className="hvl-btn" onClick={() => task.current?.abort()}>
            Stop
          </button>
        )}
        <span role="status">{status || message || (!mime ? 'This browser does not support video recording.' : '')}</span>
      </div>
      <fieldset disabled={locked} className="hvl-clip-edit">
        <legend>Arrangement</legend>
        <div className="hvl-clip-fields">
          <label>
            Song title{' '}
            <input
              className="hvl-input"
              defaultValue={e.title}
              key={e.title}
              maxLength={120}
              onBlur={(ev) => {
                const title = ev.target.value.trim();
                if (title && title !== e.title) onChange({...e, title});
                else ev.target.value = e.title;
              }}
            />
          </label>
          <label>
            Tempo{' '}
            <input
              className="hvl-input"
              type="number"
              defaultValue={e.bpm}
              key={e.bpm}
              min={30}
              max={240}
              onBlur={(ev) => {
                try {
                  change({...e, bpm: +ev.target.value});
                } catch {
                  ev.target.value = String(e.bpm);
                }
              }}
            />{' '}
            BPM
          </label>
        </div>
        <div className="hvl-clip-fields">
          <label>
            <input
              type="checkbox"
              checked={!!e.excerpt}
              disabled={!seconds}
              onChange={(ev) =>
                change({
                  ...e,
                  excerpt: ev.target.checked ? {start: 0, end: Math.min(362, Math.ceil(seconds * 100) / 100)} : undefined,
                })
              }
            />{' '}
            Export an excerpt
          </label>
          {e.excerpt &&
            (['start', 'end'] as const).map((k) => (
              <label key={k}>
                {k === 'start' ? 'From' : 'To'} (seconds)
                <input
                  className="hvl-input"
                  aria-label={k === 'start' ? 'Excerpt start' : 'Excerpt end'}
                  type="number"
                  min="0"
                  max={Math.ceil(seconds * 100) / 100}
                  step=".01"
                  defaultValue={e.excerpt![k]}
                  key={e.excerpt![k]}
                  onBlur={(ev) => {
                    try {
                      change({...e, excerpt: {...e.excerpt!, [k]: +ev.target.value}});
                    } catch {
                      ev.target.value = String(e.excerpt![k]);
                    }
                  }}
                />
              </label>
            ))}
        </div>
        <label>
          Import full score{' '}
          <input
            type="file"
            aria-label="Import full score"
            accept=".mid,.midi,.xml,.mxl,.musicxml"
            disabled={dirty}
            onChange={async (ev) => {
              const file = ev.target.files?.[0];
              ev.target.value = '';
              if (!file) return;
              const job = ++importJob.current;
              try {
                setStatus('Reading score…');
                const result = await importArrangement(file.name, new Uint8Array(await file.arrayBuffer()));
                if (importJob.current !== job) return;
                onChange(result.arrangement);
                setDirty(false);
                setPart(0);
                setMessage(result.messages.join(' ') || 'Imported ' + result.arrangement.singers.length + ' parts.');
              } catch (err) {
                if (importJob.current === job) setMessage((err as Error).message);
              } finally {
                if (importJob.current === job) setStatus('');
              }
            }}
          />
        </label>
        <div className="hvl-clip-fields" role="group" aria-label="Singers">
          {e.singers.map((s, i) => (
            <button
              className={'hvl-btn ' + (i === selected ? 'is-on' : '')}
              key={i}
              aria-pressed={i === selected}
              disabled={dirty && selected !== i}
              onClick={() => setPart(i)}>
              {s.name}
            </button>
          ))}
          {e.singers.length < 3 && (
            <button
              className="hvl-btn"
              disabled={dirty}
              onClick={() => {
                onChange({
                  ...e,
                  singers: [
                    ...e.singers,
                    {
                      avatarColor: defaultAvatarColor(e.singers.length), movement: defaultMovement(e.singers.length), expression: defaultExpression(e.singers.length),
                      name: 'Singer ' + (e.singers.length + 1),
                      voice: 'alto',
                      lyrics: 'la',
                      notes: [],
                      level: 0.7,
                      pan: 0,
                      muted: false,
                    },
                  ],
                });
                setPart(e.singers.length);
              }}>
              Add singer
            </button>
          )}
        </div>
        <SingerEditor
          key={selected}
          index={selected}
          singer={e.singers[selected]}
          onDirty={setDirty}
          onChange={(patch) => change({...e, singers: e.singers.map((s, i) => (i === selected ? {...s, ...patch} : s))})}
        />
      </fieldset>
    </main>
  );
}
