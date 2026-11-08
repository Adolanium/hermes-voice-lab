/** Mode console: Play / Speak / Sing. */
import React from 'react';
import type {Patch} from '../core/params';
import type {Plan, SongPlan} from '../core/planner';
import type {Mode, Project} from '../core/project';
import {PlayPanel, SingPanel, SpeakPanel} from './panels';

interface Props {
  project: Project;
  mode: Mode;
  onMode: (m: Mode) => void;
  live: Record<string, number> | null;
  agentKeys: Set<string>;
  onVoice: (p: Patch) => void;
  onShape: (p: Patch) => void;
  holding: boolean;
  onHold: (on: boolean) => void;
  latch: boolean;
  onLatch: (on: boolean) => void;
  running: boolean;
  speechPlan: Plan | null;
  songPlan: SongPlan | null;
  onSpeech: (s: Partial<Project['speech']>) => void;
  onSong: (s: Partial<Project['song']>) => void;
  onPlay: (m: Mode) => void;
  onStop: () => void;
  scorePlaying: boolean;
  position: number;
  ready: boolean;
  onPreviewNote: (midi: number) => void;
  liveSing: boolean;
  onLiveSing: (on: boolean) => void;
  nextSyllable: string;
  onLiveRestart: () => void;
  onTry: (symbol: string) => void;
}

const TABS: Array<[Mode, string, string]> = [['play', 'Play', 'Hold a shape and play notes'], ['speak', 'Speak', 'Phrases and phonemes'], ['sing', 'Sing', 'Lyrics on a melody']];

export function PlaySpeakSingTabs(p: Props) {
  return (
    <section className="hvl-card hvl-console" aria-label="Instrument">
      <div className="hvl-tabs" role="tablist">
        {TABS.map(([m, label, hint]) => (
          <button key={m} role="tab" aria-selected={p.mode === m} className={`hvl-tab ${p.mode === m ? 'is-active' : ''}`} onClick={() => p.onMode(m)} title={hint}>
            {label}
          </button>
        ))}
      </div>
      {p.mode === 'play' && (
        <PlayPanel project={p.project} live={p.live} agentKeys={p.agentKeys} onVoice={p.onVoice} onShape={p.onShape} holding={p.holding} onHold={p.onHold}
          latch={p.latch} onLatch={p.onLatch} running={p.running} />
      )}
      {p.mode === 'speak' && (
        <SpeakPanel project={p.project} plan={p.speechPlan} onChange={p.onSpeech} onSpeak={() => p.onPlay('speak')} onStop={p.onStop}
          playing={p.scorePlaying} position={p.position} ready={p.ready} onTry={p.onTry} />
      )}
      {p.mode === 'sing' && (
        <SingPanel project={p.project} plan={p.songPlan} onChange={p.onSong} onSing={() => p.onPlay('sing')} onStop={p.onStop}
          playing={p.scorePlaying} position={p.position} ready={p.ready} onPreviewNote={p.onPreviewNote}
          liveSing={p.liveSing} onLiveSing={p.onLiveSing} nextSyllable={p.nextSyllable} onLiveRestart={p.onLiveRestart} />
      )}
    </section>
  );
}
