import React, {useEffect, useRef, useState} from 'react';

/** Momentary control with independent touch/key ownership and cancellation. */
export function HoldButton({label, onHold}: {label: string; onHold: (source: string, on: boolean) => void}) {
  const held = useRef(new Set<string>());
  const callback = useRef(onHold);
  callback.current = onHold;
  const [active, setActive] = useState(false);
  const change = (source: string, on: boolean) => {
    if (on === held.current.has(source)) return;
    if (on) held.current.add(source); else held.current.delete(source);
    callback.current(source, on);
    setActive(held.current.size > 0);
  };
  const releaseAll = () => {
    held.current.forEach(source => callback.current(source, false));
    held.current.clear();
    setActive(false);
  };
  useEffect(() => {
    window.addEventListener('blur', releaseAll);
    return () => {
      window.removeEventListener('blur', releaseAll);
      held.current.forEach(source => callback.current(source, false));
      held.current.clear();
    };
  }, []);
  return <button className={`hvl-btn ${active ? 'is-on' : ''}`} aria-pressed={active}
    onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); change(`pointer:${e.pointerId}`, true); }}
    onPointerUp={e => change(`pointer:${e.pointerId}`, false)}
    onPointerCancel={e => change(`pointer:${e.pointerId}`, false)}
    onLostPointerCapture={e => change(`pointer:${e.pointerId}`, false)}
    onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); change(`key:${e.key}`, true); } }}
    onKeyUp={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); change(`key:${e.key}`, false); } }}
    onBlur={releaseAll}>{label}</button>;
}
