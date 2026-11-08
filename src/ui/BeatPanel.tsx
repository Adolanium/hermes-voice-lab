/** Beat mode: pads and a step sequencer for one mouth (one sound per step). */
import React from 'react';
import {BEAT_PRESETS, BEAT_SOUNDS, type Beat} from '../core/beat';
import {Icon, Range} from './controls';

interface Props {
  beat: Beat;
  onChange: (b: Partial<Beat>) => void;
  onPlay: () => void;
  onStop: () => void;
  onPad: (id: string) => void;
  playing: boolean;
  /** Step being played, or -1. */
  step: number;
  ready: boolean;
}

export function BeatPanel({beat, onChange, onPlay, onStop, onPad, playing, step, ready}: Props) {
  const toggle = (i: number, id: string) => {
    const steps = [...beat.steps];
    steps[i] = steps[i] === id ? '' : id;
    onChange({steps});
  };
  return (
    <div className="hvl-panel">
      <div className="hvl-row" style={{justifyContent: 'space-between'}}>
        <div className="hvl-row">
          {playing ? <button className="hvl-btn" onClick={onStop}>{Icon.stop} Stop</button>
            : <button className="hvl-btn is-primary" onClick={onPlay} disabled={!ready || !beat.steps.some(Boolean)}>{Icon.play} Play</button>}
          <button className={`hvl-btn ${beat.loop ? 'is-on' : ''}`} onClick={() => onChange({loop: !beat.loop})} aria-pressed={beat.loop}>{Icon.loop} Loop</button>
          {BEAT_PRESETS.map(p => <button key={p.id} className="hvl-chip" onClick={() => onChange({steps: [...p.steps]})}>{p.name}</button>)}
          <button className="hvl-btn is-ghost" onClick={() => onChange({steps: beat.steps.map(() => '')})}>Clear</button>
        </div>
        <div style={{minWidth: 180}}>
          <Range label="Tempo" value={beat.bpm} min={60} max={180} step={1} format={v => `${Math.round(v)} bpm`} onChange={v => onChange({bpm: Math.round(v)})} />
        </div>
      </div>
      <div className="hvl-group">
        <div className="hvl-section-title"><h3>Pads</h3><span>Every drum is a mouth gesture; one mouth plays one sound at a time</span></div>
        <div className="hvl-pads">
          {BEAT_SOUNDS.map(s => (
            <button key={s.id} className="hvl-pad-btn" onClick={() => onPad(s.id)} title={s.help} disabled={!ready}>
              <b>{s.label}</b><span>{s.help}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="hvl-group">
        <div className="hvl-section-title"><h3>Steps</h3><span>Sixteenth notes; a step holds one sound</span></div>
        <div className="hvl-seq" role="grid" aria-label="Step sequencer" style={{'--steps': beat.steps.length} as React.CSSProperties}>
          {BEAT_SOUNDS.map(s => (
            <div key={s.id} className="hvl-seq-row" role="row">
              <span className="hvl-seq-label">{s.label}</span>
              {beat.steps.map((id, i) => (
                <button key={i} role="gridcell" aria-pressed={id === s.id} aria-label={`${s.label}, step ${i + 1}`}
                  className={`hvl-seq-cell ${id === s.id ? 'is-on' : ''} ${i % 4 === 0 ? 'is-beat' : ''} ${i === step ? 'is-now' : ''}`}
                  onClick={() => toggle(i, s.id)} />
              ))}
            </div>
          ))}
        </div>
      </div>
      <p className="hvl-note" style={{margin: 0}}>
        Kick is an ejective p′ (the larynx compresses the air), the click is the tongue's vacuum, the bass a lip trill. The beat plays through the same vocal tract as speech and song.
      </p>
    </div>
  );
}
