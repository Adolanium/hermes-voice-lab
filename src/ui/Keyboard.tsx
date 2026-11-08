/** On-screen and computer keyboard. Releases every held note on blur. */
import React, {useEffect, useRef, useState} from 'react';
import {noteName} from '../core/params';
import type {MidiStatus} from './midi';

const KEYMAP = ['a', 'w', 's', 'e', 'd', 'f', 't', 'g', 'y', 'h', 'u', 'j', 'k', 'o', 'l', 'p', ';', "'"];
const BLACK = new Set([1, 3, 6, 8, 10]);

interface Props {
  base: number;
  octaves?: number;
  onNoteOn: (midi: number) => void;
  onNoteOff: (midi: number) => void;
  /** Disable the computer keyboard (e.g. while typing in a text field). */
  enabled: boolean;
  onBaseChange: (base: number) => void;
  midi?: {status: MidiStatus; inputs: string[]; enable: () => void};
}

export function Keyboard({base, octaves = 2, onNoteOn, onNoteOff, enabled, onBaseChange, midi}: Props) {
  const [down, setDown] = useState<Set<number>>(new Set());
  const held = useRef(new Map<string, number>());
  const pointer = useRef<number | null>(null);
  const cb = useRef({onNoteOn, onNoteOff});
  cb.current = {onNoteOn, onNoteOff};

  const press = (m: number) => {
    setDown(s => new Set(s).add(m));
    cb.current.onNoteOn(m);
  };
  const release = (m: number) => {
    setDown(s => {
      const n = new Set(s);
      n.delete(m);
      return n;
    });
    cb.current.onNoteOff(m);
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
      press(base + i);
    };
    const ku = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const m = held.current.get(k);
      if (m === undefined) return;
      held.current.delete(k);
      release(m);
    };
    const all = () => {
      held.current.forEach(m => release(m));
      held.current.clear();
      if (pointer.current !== null) release(pointer.current);
      pointer.current = null;
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
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    pointer.current = m;
    press(m);
  };
  const enter = (m: number) => (e: React.PointerEvent) => {
    if (pointer.current === null || e.buttons === 0 || pointer.current === m) return;
    release(pointer.current);
    pointer.current = m;
    press(m);
  };
  const up = () => {
    if (pointer.current !== null) release(pointer.current);
    pointer.current = null;
  };
  const hint = (m: number) => KEYMAP[m - base] ?? '';

  return (
    <section className="hvl-card hvl-keys-card">
      <div className="hvl-section-title">
        <span className="hvl-kicker">Keyboard</span>
        <span className="hvl-row" style={{gap: 6}}>
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
      <div className="hvl-keys" style={{'--whites': whites.length} as React.CSSProperties} onPointerUp={up} onPointerLeave={up} onPointerCancel={up}>
        {whites.map(m => (
          <div key={m} className={`hvl-key ${down.has(m) ? 'is-down' : ''}`} onPointerDown={pd(m)} onPointerEnter={enter(m)} role="button" aria-label={noteName(m)}>
            <span className="hint">{hint(m).toUpperCase()}</span>
            {m % 12 === 0 ? noteName(m) : ''}
          </div>
        ))}
        {notes.filter(m => BLACK.has(m % 12)).map(m => (
          <div key={m} className={`hvl-key is-black ${down.has(m) ? 'is-down' : ''}`} onPointerDown={pd(m)} onPointerEnter={enter(m)} role="button" aria-label={noteName(m)}
            style={{left: `calc(${(whiteIndex(m) / whites.length) * 100}% - (100% / ${whites.length} * .31))`}}>
            <span className="hint">{hint(m).toUpperCase()}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
