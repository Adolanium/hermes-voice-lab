/** Bestiary: animal calls from the same engine (a syrinx, a trunk, and longer airways). */
import React from 'react';
import {CREATURES} from '../core/bestiary';
import type {Score} from '../core/engine';
import {Icon} from './controls';

export function BestiaryPanel({onCall, onStop, playing, ready}: {onCall: (score: Score) => void; onStop: () => void; playing: boolean; ready: boolean}) {
  return (
    <div className="hvl-panel">
      <div className="hvl-row" style={{justifyContent: 'space-between'}}>
        <span className="hvl-note">Each call is physical: a songbird's syrinx, an elephant's trunk, and the seal's and alligator's airways.</span>
        {playing && <button className="hvl-btn" onClick={onStop}>{Icon.stop} Stop</button>}
      </div>
      <div className="hvl-beasts">
        {CREATURES.map(c => (
          <div key={c.id} className="hvl-beast">
            <b>{c.name}</b>
            <span>{c.description}</span>
            <div className="hvl-row">
              {c.calls.map(call => (
                <button key={call.id} className="hvl-btn" onClick={() => onCall(call.score())} disabled={!ready}>{Icon.play} {call.label}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
