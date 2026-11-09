/** On-screen and computer keyboard. Releases every held note on blur. */
import React, {useEffect, useRef, useState} from 'react';
import {noteName} from '../core/params';
import type {MidiStatus} from './midi';

const KEYMAP = ['a', 'w', 's', 'e', 'd', 'f', 't', 'g', 'y', 'h', 'u', 'j', 'k', 'o', 'l', 'p', ';', "'"];
const BLACK = new Set([1, 3, 6, 8, 10]);

interface Props {
  base: number;
  octaves?: number;
  onNoteOn: (midi: number, source: string) => void;
  onNoteOff: (midi: number, source: string) => void;
  activeNotes?: number[];
  /** Disable the computer keyboard (e.g. while typing in a text field). */
  enabled: boolean;
  onBaseChange: (base: number) => void;
  midi?: {status: MidiStatus; inputs: string[]; enable: () => void};
  /** Jam with Hermes: absent when the host cannot reach the chat. */
  jam?: {state: 'off' | 'idle' | 'playing' | 'waiting' | 'answering'; text?: string; onToggle: () => void; onAgain?: () => void};
}

const JAM_HINT = {
  off: '',
  idle: 'Play a phrase, then pause: Hermes answers.',
  playing: 'Listening…',
  waiting: 'Hermes is writing an answer…',
  answering: 'Hermes answers',
} as const;

export function Keyboard({base, octaves = 2, onNoteOn, onNoteOff, enabled, onBaseChange, midi, activeNotes, jam}: Props) {
  const [down, setDown] = useState<Set<number>>(new Set());
  const held = useRef(new Map<string, number>());
  const pointers = useRef(new Map<number, number>());
  const cb = useRef({onNoteOn, onNoteOff});
  cb.current = {onNoteOn, onNoteOff};

  const press = (m: number, source: string) => {
    setDown(s => new Set(s).add(m));
    cb.current.onNoteOn(m, source);
  };
  const release = (m: number, source: string) => {
    setDown(s => {
      const n = new Set(s);
      n.delete(m);
      return n;
    });
    cb.current.onNoteOff(m, source);
  };

  useEffect(() => {
    if (!enabled) return;
    const typing = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return !!t && (t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'range' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    };
    const kd = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || typing(e)) return;
      const k = e.key.toLowerCase();
      if (k === 'z') return onBaseChange(Math.max(36, base - 12));
      if (k === 'x') return onBaseChange(Math.min(84, base + 12));
      const i = KEYMAP.indexOf(k);
      if (i < 0 || held.current.has(k)) return;
      e.preventDefault();
      held.current.set(k, base + i);
      press(base + i, `computer:${k}`);
    };
    const ku = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const m = held.current.get(k);
      if (m === undefined) return;
      held.current.delete(k);
      release(m, `computer:${k}`);
    };
    const all = () => {
      held.current.forEach((m, k) => release(m, `computer:${k}`));
      held.current.clear();
      pointers.current.forEach((m, id) => release(m, `pointer:${id}`));
      pointers.current.clear();
    };
    const vis = () => document.hidden && all();
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('blur', all);
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('blur', all);
      document.removeEventListener('visibilitychange', vis);
      all();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, base]);

  const notes = Array.from({length: 12 * octaves + 1}, (_, i) => base + i);
  const whites = notes.filter(m => !BLACK.has(m % 12));
  const whiteIndex = (m: number) => whites.filter(w => w < m).length;
  const pd = (m: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    const keys = e.currentTarget.parentElement!;
    keys.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, m);
    press(m, `pointer:${e.pointerId}`);
  };
  const move = (e: React.PointerEvent) => {
    const previous = pointers.current.get(e.pointerId);
    if (previous === undefined) return;
    const key = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-midi]');
    if (!key || !e.currentTarget.contains(key)) return;
    const m = Number(key.dataset.midi);
    if (previous === m) return;
    pointers.current.set(e.pointerId, m);
    // Replacing this source's note is atomic: the gate stays open during a slide.
    setDown(s => { const next = new Set(s); next.delete(previous); next.add(m); return next; });
    cb.current.onNoteOn(m, `pointer:${e.pointerId}`);
  };
  const up = (e: React.PointerEvent) => {
    const m = pointers.current.get(e.pointerId);
    if (m === undefined) return;
    pointers.current.delete(e.pointerId);
    release(m, `pointer:${e.pointerId}`);
  };
  const active = activeNotes ? new Set(activeNotes) : down;
  const hint = (m: number) => KEYMAP[m - base] ?? '';

  return (
    <section className="hvl-card hvl-keys-card">
      <div className="hvl-section-title">
        <span className="hvl-row" style={{gap: 10, minWidth: 0}}>
          <span className="hvl-kicker">Keyboard</span>
          {jam && jam.state !== 'off' && (
            <span className={`hvl-jam is-${jam.state}`} aria-live="polite">
              <span className="hvl-jam-dot" />
              <span className="hvl-jam-text">{jam.state === 'answering' && jam.text ? `Hermes: “${jam.text}”` : jam.state === 'idle' && jam.text ? jam.text : JAM_HINT[jam.state]}</span>
              {jam.onAgain && jam.state === 'idle' && <button className="hvl-btn is-ghost" onClick={jam.onAgain} title="Hear Hermes's last answer again">Again</button>}
            </span>
          )}
        </span>
        <span className="hvl-row" style={{gap: 6}}>
          {jam && (
            <button className={`hvl-btn ${jam.state !== 'off' ? 'is-on' : ''}`} onClick={jam.onToggle} aria-pressed={jam.state !== 'off'}
              title="Trade phrases with Hermes: play, pause, and the agent sings an answer">
              Jam with Hermes
            </button>
          )}
          <span className="hvl-note">Keys A–; play · Z/X octave</span>
          {midi && (
            <button className={`hvl-btn is-ghost ${midi.status === 'on' ? 'is-on' : ''}`} onClick={midi.enable} disabled={midi.status === 'on'}
              title={midi.status === 'on' ? (midi.inputs.length ? `MIDI: ${midi.inputs.join(', ')}` : 'MIDI on: no device connected') : midi.status === 'unavailable' ? 'Web MIDI is not available here' : midi.status === 'denied' ? 'MIDI access was refused' : 'Play from a MIDI keyboard'}>
              MIDI{midi.status === 'on' ? ` · ${midi.inputs.length}` : midi.status === 'unavailable' || midi.status === 'denied' ? ' ✕' : ''}
            </button>
          )}
          <button className="hvl-btn is-ghost" onClick={() => onBaseChange(Math.max(36, base - 12))} aria-label="Octave down">−</button>
          <span className="hvl-note" style={{minWidth: 54, textAlign: 'center'}}>{noteName(base)}–{noteName(base + 12 * octaves)}</span>
          <button className="hvl-btn is-ghost" onClick={() => onBaseChange(Math.min(84, base + 12))} aria-label="Octave up">+</button>
        </span>
      </div>
      <div className="hvl-keys" style={{'--whites': whites.length} as React.CSSProperties} onPointerUp={up} onPointerMove={move} onLostPointerCapture={up} onPointerCancel={up}>
        {whites.map(m => (
          <div key={m} className={`hvl-key ${active.has(m) ? 'is-down' : ''}`} onPointerDown={pd(m)} data-midi={m} role="button" aria-label={noteName(m)}>
            <span className="hint">{hint(m).toUpperCase()}</span>
            {m % 12 === 0 ? noteName(m) : ''}
          </div>
        ))}
        {notes.filter(m => BLACK.has(m % 12)).map(m => (
          <div key={m} className={`hvl-key is-black ${active.has(m) ? 'is-down' : ''}`} onPointerDown={pd(m)} data-midi={m} role="button" aria-label={noteName(m)}
            style={{left: `calc(${(whiteIndex(m) / whites.length) * 100}% - (100% / ${whites.length} * .31))`}}>
            <span className="hint">{hint(m).toUpperCase()}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
