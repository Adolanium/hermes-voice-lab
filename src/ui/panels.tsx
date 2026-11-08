/** Mode panels: Play (hold a shape), Speak (phrase), Sing (piano roll). */
import React, {useMemo, useRef, useState} from 'react';
import type {Note, Plan, SongPlan} from '../core/planner';
import {simulateTracks} from '../core/planner';
import {midiToHz, noteName, type ParamName, type Patch} from '../core/params';
import {PHONEMES, isVowel} from '../core/phonemes';
import {VOWEL_PRESETS} from '../core/presets';
import type {Project} from '../core/project';
import {cssVar, Icon, Range, Seg, Slider, useCanvas} from './controls';

const SOURCE: ParamName[] = ['pitch', 'loudness', 'tenseness', 'breath', 'vibratoDepth', 'vibratoRate', 'humanize'];
const SHAPE: ParamName[] = ['jaw', 'lipOpen', 'lipRound', 'tipPlace', 'tipClose', 'dorsumClose', 'velum', 'rhotic', 'throat', 'tractLength'];
const OUTPUT: ParamName[] = ['space', 'gain'];
const VOICE_KEYS = new Set<ParamName>(['pitch', 'loudness', 'tenseness', 'breath', 'vibratoDepth', 'vibratoRate', 'humanize', 'throat', 'tractLength', 'space', 'gain']);

export const MANNER_COLORS: Record<string, string> = {
  vowel: 'var(--hvl-accent)', diphthong: 'var(--hvl-accent)', stop: 'var(--hvl-bad)', nasal: 'var(--ui-purple, #9b59d0)',
  fricative: 'var(--hvl-warm)', affricate: 'var(--hvl-warm)', approximant: 'var(--hvl-good)', aspirate: 'var(--hvl-fg4)',
};

interface PlayProps {
  project: Project;
  live: Record<string, number> | null;
  agentKeys: Set<string>;
  onVoice: (p: Patch) => void;
  onShape: (p: Patch) => void;
  holding: boolean;
  onHold: (on: boolean) => void;
  latch: boolean;
  onLatch: (on: boolean) => void;
  running: boolean;
}

export function PlayPanel({project, live, agentKeys, onVoice, onShape, holding, onHold, latch, onLatch, running}: PlayProps) {
  const value = (n: ParamName) => (VOICE_KEYS.has(n) ? project.voice[n] : project.shape[n]) ?? 0;
  const set = (n: ParamName) => (v: number) => (VOICE_KEYS.has(n) ? onVoice({[n]: v}) : onShape({[n]: v}));
  const active = VOWEL_PRESETS.find(v => Object.entries(v.shape).every(([k, x]) => Math.abs((project.shape[k as ParamName] ?? -1) - (x as number)) < 0.02));
  const liveOf = (n: ParamName) => (running && live && !VOICE_KEYS.has(n) ? live[n] : undefined);
  return (
    <div className="hvl-panel">
      <div className="hvl-section-title">
        <h3>Shape a vowel</h3>
        <span>Pick a target, then drag the portrait or the pad</span>
      </div>
      <div className="hvl-vowels">
        {VOWEL_PRESETS.map(v => (
          <button key={v.id} className={`hvl-vowel ${active?.id === v.id ? 'is-active' : ''}`} onClick={() => onShape(v.shape)} title={`/${v.ipa}/ as in “${v.example}”`}>
            <b>{v.ipa}</b>
            <small>{v.example}</small>
          </button>
        ))}
      </div>
      <div className="hvl-play-grid">
        <VowelPad x={project.shape.tongueX ?? 0.5} y={project.shape.tongueY ?? 0.5} liveX={live?.tongueX} liveY={live?.tongueY} running={running}
          onChange={(x, y) => onShape({tongueX: x, tongueY: y})} />
        <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
          <div className="hvl-row">
            <button className={`hvl-btn is-primary`} style={{flex: 1, height: 38}}
              onPointerDown={e => { e.preventDefault(); if (!latch) onHold(true); }}
              onPointerUp={() => !latch && onHold(false)} onPointerLeave={() => !latch && holding && onHold(false)}
              onClick={() => latch && onHold(!holding)}
              aria-pressed={holding}>
              {Icon.play} {latch ? (holding ? 'Release' : 'Sustain') : holding ? 'Sounding…' : 'Hold to sound'}
            </button>
            <label className="hvl-check"><input type="checkbox" checked={latch} onChange={e => onLatch(e.target.checked)} /> Latch</label>
          </div>
          <div className="hvl-sliders" style={{gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))'}}>
            {SHAPE.slice(0, 6).map(n => <Slider key={n} name={n} value={value(n)} live={liveOf(n)} onChange={set(n)} agent={agentKeys.has(n)} />)}
          </div>
        </div>
      </div>
      <div className="hvl-group">
        <div className="hvl-section-title"><h3>Voice source</h3><span>Pitch and timbre are independent</span></div>
        <div className="hvl-sliders">
          {SOURCE.map(n => <Slider key={n} name={n} value={value(n)} onChange={set(n)} agent={agentKeys.has(n)} />)}
        </div>
      </div>
      <div className="hvl-group">
        <div className="hvl-section-title"><h3>Tract</h3><span>Size, throat and the remaining articulators</span></div>
        <div className="hvl-sliders">
          {[...SHAPE.slice(6), ...OUTPUT].map(n => <Slider key={n} name={n} value={value(n)} live={liveOf(n)} onChange={set(n)} agent={agentKeys.has(n)} />)}
        </div>
      </div>
    </div>
  );
}

function VowelPad({x, y, liveX, liveY, running, onChange}: {x: number; y: number; liveX?: number; liveY?: number; running: boolean; onChange: (x: number, y: number) => void}) {
  const ref = useRef<HTMLDivElement>(null);
  const update = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const nx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const ny = Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height));
    onChange(Number(nx.toFixed(3)), Number(ny.toFixed(3)));
  };
  return (
    <div ref={ref} className="hvl-pad" role="slider" aria-label="Tongue body position: back to front, low to high" aria-valuetext={`front ${Math.round(x * 100)}%, height ${Math.round(y * 100)}%`} tabIndex={0}
      onPointerDown={e => { (e.currentTarget as Element).setPointerCapture(e.pointerId); update(e); }}
      onPointerMove={e => e.buttons && update(e)}
      onKeyDown={e => {
        const d = e.shiftKey ? 0.1 : 0.02;
        if (e.key === 'ArrowLeft') onChange(Math.max(0, x - d), y);
        else if (e.key === 'ArrowRight') onChange(Math.min(1, x + d), y);
        else if (e.key === 'ArrowUp') onChange(x, Math.min(1, y + d));
        else if (e.key === 'ArrowDown') onChange(x, Math.max(0, y - d));
        else return;
        e.preventDefault();
      }}>
      {VOWEL_PRESETS.filter(v => v.shape.tongueX !== undefined && !['hum'].includes(v.id)).map(v => (
        <span key={v.id} className="mark" style={{left: `${v.shape.tongueX! * 100}%`, top: `${(1 - v.shape.tongueY!) * 100}%`}}>{v.ipa}</span>
      ))}
      <span className="axis" style={{left: 6, bottom: 4}}>back</span>
      <span className="axis" style={{right: 6, bottom: 4}}>front</span>
      <span className="axis" style={{left: 6, top: 4}}>high</span>
      <div className="puck" style={{left: `${x * 100}%`, top: `${(1 - y) * 100}%`}} />
      {running && liveX !== undefined && liveY !== undefined && <div className="live" style={{left: `${liveX * 100}%`, top: `${(1 - liveY) * 100}%`}} />}
    </div>
  );
}

// ---- Speak ------------------------------------------------------------------

const EXAMPLES = [
  'Hello! I am a voice made of air, a few tubes, and a little bit of math.',
  'Good morning. Would you like a cup of tea?',
  'Every quiet signal finds a way to sing.',
  'Is this the voice you were hoping for?',
];
const PHONEME_EXAMPLE = 'HH AH0 L OW1 / M AY1 / F R EH1 N D .';

interface SpeakProps {
  project: Project;
  plan: Plan | null;
  onChange: (s: Partial<Project['speech']>) => void;
  onSpeak: () => void;
  onStop: () => void;
  playing: boolean;
  position: number;
  ready: boolean;
}

export function SpeakPanel({project, plan, onChange, onSpeak, onStop, playing, position, ready}: SpeakProps) {
  const sp = project.speech;
  const current = playing ? plan?.segments.findIndex(s => position >= s.start && position < s.end) ?? -1 : -1;
  const byWord = useMemo(() => {
    if (!plan) return [];
    const groups: Array<{word: string; guess: boolean; items: Array<{seg: Plan['segments'][number]; index: number}>}> = [];
    plan.segments.forEach((seg, index) => {
      if (seg.word < 0) return;
      const w = plan.words[seg.word];
      let g = groups[groups.length - 1];
      if (!g || g.word !== `${seg.word}`) {
        g = {word: `${seg.word}`, guess: w?.source === 'rules', items: []};
        groups.push(g);
      }
      g.items.push({seg, index});
    });
    return groups.map(g => ({...g, text: plan.words[Number(g.word)]?.text ?? ''}));
  }, [plan]);
  return (
    <div className="hvl-panel">
      <div className="hvl-row" style={{justifyContent: 'space-between'}}>
        <Seg label="Input type" value={sp.phonemes ? 'ph' : 'text'} options={[['text', 'Text'], ['ph', 'Phonemes']]}
          onChange={v => onChange({phonemes: v === 'ph', text: v === 'ph' && !sp.phonemes ? PHONEME_EXAMPLE : sp.text})} />
        <div className="hvl-row">
          {playing ? <button className="hvl-btn" onClick={onStop}>{Icon.stop} Stop</button>
            : <button className="hvl-btn is-primary" onClick={onSpeak} disabled={!ready || !sp.text.trim()}>{Icon.play} Speak</button>}
        </div>
      </div>
      <textarea className="hvl-textarea" value={sp.text} maxLength={1000} spellCheck={!sp.phonemes}
        aria-label={sp.phonemes ? 'ARPABET phonemes' : 'Text to speak'}
        placeholder={sp.phonemes ? 'ARPABET, e.g. HH AH0 L OW1 / W ER1 L D' : 'Type a short English phrase'}
        onChange={e => onChange({text: e.target.value})}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onSpeak(); } }} />
      {!sp.phonemes && (
        <div className="hvl-chips">
          {EXAMPLES.map(t => <button key={t} className="hvl-chip" onClick={() => onChange({text: t})}>{t.length > 34 ? `${t.slice(0, 32)}…` : t}</button>)}
        </div>
      )}
      <div className="hvl-sliders">
        <Range label="Speaking rate" value={sp.rate} min={0.5} max={1.8} step={0.05} format={v => `${v.toFixed(2)}×`} onChange={v => onChange({rate: v})} />
        <Range label="Intonation" value={sp.expression} min={0} max={1} format={v => `${Math.round(v * 100)}%`} onChange={v => onChange({expression: v})} help="Pitch range of accents and phrase contours" />
      </div>
      <div className="hvl-group">
        <div className="hvl-section-title"><h3>Pronunciation</h3><span>{plan ? `${plan.segments.filter(s => s.symbol !== 'SIL').length} phones · ${plan.score.length.toFixed(1)} s` : ready ? '' : 'Loading dictionary…'}</span></div>
        <div className="hvl-phones">
          {byWord.map((g, gi) => (
            <div key={gi} className={`hvl-word ${g.guess ? 'is-guess' : ''}`} title={g.guess ? 'Not in the dictionary — pronunciation guessed by rules' : undefined}>
              <span>{g.text}</span>
              <div>
                {g.items.map(({seg, index}) => {
                  const ph = PHONEMES[seg.symbol];
                  return (
                    <span key={index} className={`hvl-ph ${index === current ? 'is-now' : ''} ${seg.stress === 1 ? 'is-stress' : ''}`}
                      style={{'--c': MANNER_COLORS[ph?.manner ?? 'vowel']} as React.CSSProperties} title={`${seg.symbol}${isVowel(seg.symbol) ? seg.stress : ''} · ${ph?.manner}`}>
                      {ph?.ipa ?? seg.symbol}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="hvl-legend">
          {['vowel', 'stop', 'nasal', 'fricative', 'approximant'].map(m => <span key={m}><i style={{'--c': MANNER_COLORS[m]} as React.CSSProperties} />{m}</span>)}
        </div>
        {plan?.warnings.map(w => <div key={w} className="hvl-warning">{w}</div>)}
      </div>
      {plan && <GestureTimeline plan={plan} position={playing ? position : -1} />}
      <p className="hvl-note" style={{margin: 0}}>
        English only: CMU dictionary words plus rule-based guesses for unknown words; ARPABET input for exact control. Speech is synthesized by the articulatory model and can sound robotic — intelligibility is still being improved.
      </p>
    </div>
  );
}

const LANES: Array<[ParamName, string, boolean]> = [
  ['lipOpen', 'lips open', false], ['tipClose', 'tip closure', false], ['dorsumClose', 'back closure', false],
  ['tongueY', 'tongue height', false], ['tongueX', 'tongue front', false], ['velum', 'nasal', false], ['voicing', 'voicing', false],
];

function GestureTimeline({plan, position}: {plan: Plan; position: number}) {
  const tracks = useMemo(() => simulateTracks(plan.score, LANES.map(l => l[0]), 0.004), [plan]);
  const ref = useCanvas((ctx, w, h) => {
    const el = ref.current;
    const accent = cssVar(el, '--hvl-accent', '#5b5bd6');
    const fg3 = cssVar(el, '--hvl-fg3', '#777');
    const line = cssVar(el, '--hvl-line', '#ddd');
    const mono = cssVar(el, '--hvl-mono', 'monospace');
    const labelW = 78;
    const laneH = (h - 16) / LANES.length;
    const T = plan.score.length;
    const x = (t: number) => labelW + ((w - labelW - 6) * t) / T;
    ctx.font = `500 9px ${mono}`;
    LANES.forEach(([name, label], i) => {
      const y0 = 4 + i * laneH;
      ctx.fillStyle = fg3;
      ctx.fillText(label, 4, y0 + laneH / 2 + 3);
      ctx.fillStyle = line;
      ctx.fillRect(labelW, y0 + laneH - 1, w - labelW, 1);
      const tr = tracks.tracks[name];
      ctx.beginPath();
      for (let k = 0; k < tr.length; k++) {
        const px = x(tracks.times[k]);
        const py = y0 + laneH - 2 - tr[k] * (laneH - 5);
        if (k) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      }
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.3;
      ctx.stroke();
    });
    ctx.fillStyle = fg3;
    plan.segments.forEach(s => {
      if (s.symbol === 'SIL') return;
      ctx.globalAlpha = 0.18;
      ctx.fillRect(x(s.start), 0, 1, h - 12);
      ctx.globalAlpha = 1;
      ctx.fillText(PHONEMES[s.symbol]?.ipa ?? s.symbol, x(s.start) + 1, h - 2);
    });
    if (position >= 0) {
      ctx.fillStyle = accent;
      ctx.fillRect(x(position), 0, 2, h);
    }
  }, [plan, tracks, position]);
  return (
    <div className="hvl-group">
      <div className="hvl-section-title"><h3>Gesture score</h3><span>Planned articulator targets through the model's dynamics</span></div>
      <canvas ref={ref} className="hvl-timeline" aria-label="Articulator trajectories over time" />
    </div>
  );
}

// ---- Sing -------------------------------------------------------------------

interface SingProps {
  project: Project;
  plan: SongPlan | null;
  onChange: (s: Partial<Project['song']>) => void;
  onSing: () => void;
  onStop: () => void;
  playing: boolean;
  position: number;
  ready: boolean;
  onPreviewNote: (midi: number) => void;
}

const LOW = 48;
const HIGH = 84;
const ROW = 13;
const BEAT = 46;

export function SingPanel({project, plan, onChange, onSing, onStop, playing, position, ready, onPreviewNote}: SingProps) {
  const song = project.song;
  const [selected, setSelected] = useState<number | null>(null);
  const notes = song.notes;
  const setNotes = (n: Note[]) => onChange({notes: n});
  const beats = Math.max(16, Math.ceil(Math.max(0, ...notes.map(n => n.start + n.length)) + 4));
  const beatSec = 60 / song.bpm;
  const labels = useMemo(() => {
    const m = new Map<number, string>();
    plan?.assignments.forEach(a => m.set(a.note, a.text));
    return m;
  }, [plan]);
  const drag = useRef<null | {index: number; mode: 'move' | 'resize'; start: number; midi: number; x0: number; y0: number}>(null);
  const width = beats * BEAT;
  const height = (HIGH - LOW + 1) * ROW;

  const ref = useCanvas((ctx, w, h) => {
    const el = ref.current;
    const accent = cssVar(el, '--hvl-accent', '#5b5bd6');
    const ink = cssVar(el, '--hvl-ink', '#111');
    const line = cssVar(el, '--hvl-line', '#ddd');
    const fg3 = cssVar(el, '--hvl-fg3', '#777');
    const skin = cssVar(el, '--hvl-skin', '#fff');
    const mono = cssVar(el, '--hvl-mono', 'monospace');
    for (let m = LOW; m <= HIGH; m++) {
      const y = (HIGH - m) * ROW;
      if ([1, 3, 6, 8, 10].includes(m % 12)) {
        ctx.globalAlpha = 0.05;
        ctx.fillStyle = ink;
        ctx.fillRect(0, y, w, ROW);
        ctx.globalAlpha = 1;
      }
      if (m % 12 === 0) {
        ctx.fillStyle = fg3;
        ctx.font = `500 9px ${mono}`;
        ctx.fillText(noteName(m), 3, y + ROW - 3);
        ctx.fillStyle = line;
        ctx.fillRect(0, y + ROW - 1, w, 1);
      }
    }
    for (let b = 0; b <= beats; b++) {
      ctx.fillStyle = line;
      ctx.globalAlpha = b % 4 === 0 ? 1 : 0.45;
      ctx.fillRect(b * BEAT, 0, 1, h);
    }
    ctx.globalAlpha = 1;
    notes.forEach((n, i) => {
      const x = n.start * BEAT;
      const y = (HIGH - n.midi) * ROW;
      const nw = Math.max(6, n.length * BEAT - 2);
      ctx.fillStyle = accent;
      ctx.globalAlpha = i === selected ? 1 : 0.8;
      ctx.beginPath();
      ctx.roundRect(x + 1, y + 1, nw, ROW - 2, 3);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (i === selected) {
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      const text = labels.get(i);
      if (text) {
        ctx.fillStyle = skin;
        ctx.font = `600 9.5px ${mono}`;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x + 1, y, nw, ROW);
        ctx.clip();
        ctx.fillText(text, x + 5, y + ROW - 3.5);
        ctx.restore();
      }
    });
    if (playing && position > 0) {
      const beat = (position - 0.25) / beatSec;
      ctx.fillStyle = ink;
      ctx.fillRect(beat * BEAT, 0, 2, h);
    }
  }, [notes, selected, labels, playing, position, beats]);

  const hit = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const beat = x / BEAT;
    const midi = HIGH - Math.floor(y / ROW);
    const index = notes.findIndex(n => midi === n.midi && beat >= n.start && beat <= n.start + n.length);
    return {beat, midi, index, x, y};
  };
  const down = (e: React.PointerEvent) => {
    const h = hit(e);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    if (h.index >= 0) {
      if (e.altKey || e.button === 2) {
        setNotes(notes.filter((_, i) => i !== h.index));
        setSelected(null);
        return;
      }
      const n = notes[h.index];
      const nearEnd = h.beat > n.start + n.length - 0.25 && n.length >= 0.5;
      drag.current = {index: h.index, mode: nearEnd ? 'resize' : 'move', start: n.start, midi: n.midi, x0: h.x, y0: h.y};
      setSelected(h.index);
      onPreviewNote(n.midi);
    } else {
      const start = Math.max(0, Math.floor(h.beat * 2) / 2);
      const next = [...notes, {start, length: 1, midi: Math.min(HIGH, Math.max(LOW, h.midi))}];
      setNotes(next);
      setSelected(next.length - 1);
      drag.current = {index: next.length - 1, mode: 'resize', start, midi: h.midi, x0: h.x, y0: h.y};
      onPreviewNote(h.midi);
    }
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const h = hit(e);
    const n = {...notes[d.index]};
    if (!n) return;
    if (d.mode === 'move') {
      n.start = Math.max(0, Math.round((d.start + (h.x - d.x0) / BEAT) * 4) / 4);
      const midi = Math.min(HIGH, Math.max(LOW, Math.round(d.midi - (h.y - d.y0) / ROW)));
      if (midi !== n.midi) onPreviewNote(midi);
      n.midi = midi;
    } else {
      n.length = Math.max(0.25, Math.round((h.beat - n.start) * 4) / 4);
    }
    setNotes(notes.map((x, i) => (i === d.index ? n : x)));
  };
  return (
    <div className="hvl-panel">
      <div className="hvl-row" style={{justifyContent: 'space-between'}}>
        <div className="hvl-row">
          {playing ? <button className="hvl-btn" onClick={onStop}>{Icon.stop} Stop</button>
            : <button className="hvl-btn is-primary" onClick={onSing} disabled={!ready || !notes.length}>{Icon.play} Sing</button>}
          <button className={`hvl-btn ${song.loop ? 'is-on' : ''}`} onClick={() => onChange({loop: !song.loop})} aria-pressed={song.loop}>{Icon.loop} Loop</button>
        </div>
        <div className="hvl-row">
          <label className="hvl-note" htmlFor="hvl-bpm">Tempo</label>
          <input id="hvl-bpm" className="hvl-input" style={{width: 64}} type="number" min={30} max={240} value={song.bpm}
            onChange={e => { const v = Number(e.target.value); if (v >= 30 && v <= 240) onChange({bpm: v}); }} />
          <button className="hvl-btn is-ghost" onClick={() => { setNotes([]); setSelected(null); }} title="Clear all notes">{Icon.trash}</button>
        </div>
      </div>
      <input className="hvl-input" value={song.lyrics} maxLength={2000} aria-label="Lyrics" placeholder="Lyrics — use hy-phens to split syllables, a lone - to hold a vowel"
        onChange={e => onChange({lyrics: e.target.value})} />
      <div className="hvl-roll" onContextMenu={e => e.preventDefault()}
        onKeyDown={e => { if ((e.key === 'Delete' || e.key === 'Backspace') && selected !== null) { setNotes(notes.filter((_, i) => i !== selected)); setSelected(null); } }} tabIndex={0}
        ref={el => { if (el && !el.dataset.scrolled) { el.scrollTop = (HIGH - 74) * ROW; el.dataset.scrolled = '1'; } }}>
        <canvas ref={ref} style={{width, height}} onPointerDown={down} onPointerMove={move} onPointerUp={() => (drag.current = null)}
          aria-label="Piano roll: click to add a note, drag to move, drag the end to resize, Alt-click or right-click to delete" />
      </div>
      <div className="hvl-note">
        Click to add · drag to move · drag the right edge to resize · Alt-click to delete. Each note takes the next syllable; consonants are placed before the beat so vowels land on it.
        {plan && ` ${notes.length} notes · ${(plan.score.length).toFixed(1)} s · ${midiToHz(Math.min(...notes.map(n => n.midi), 60)).toFixed(0)}–${midiToHz(Math.max(...notes.map(n => n.midi), 60)).toFixed(0)} Hz`}
      </div>
    </div>
  );
}
