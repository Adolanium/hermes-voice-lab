/** Mode panels: Play (hold a shape), Speak (phrase), Sing (piano roll). */
import React, {useEffect, useMemo, useRef, useState} from 'react';
import type {Note, Plan, SongPlan} from '../core/planner';
import {simulateTracks} from '../core/planner';
import {midiToHz, noteName, type ParamName, type Patch} from '../core/params';
import {PHONEMES, isVowel} from '../core/phonemes';
import {bodyAt, bodyPosition, VOWEL_PRESETS} from '../core/presets';
import {morphVowel, VOWEL_ANCHORS} from '../performance/vowels';
import {LIMITS, SILLY_SONG, songFromScore, type Project} from '../core/project';
import {importScoreFile} from '../core/score-import';
import {DUET_PARTS, type DuetPart} from '../core/duet';
import {VOICE_PRESETS as ALL_VOICES} from '../core/presets';
import {HoldButton} from './HoldButton';
import {cssVar, Icon, Range, Seg, Slider, useCanvas} from './controls';

const SOURCE: ParamName[] = ['pitch', 'loudness', 'tenseness', 'breath', 'vibratoDepth', 'vibratoRate', 'humanize'];
const SHAPE: ParamName[] = ['jaw', 'lipOpen', 'lipRound', 'tipPlace', 'tipClose', 'dorsumClose', 'velum', 'rhotic', 'throat', 'tractLength', 'pharynx'];
const OUTPUT: ParamName[] = ['space', 'gain'];
const QUALITY: ParamName[] = ['register', 'fry', 'growl', 'twang'];
const RECORDING: ParamName[] = ['mic', 'eqLow', 'eqMid', 'eqHigh', 'comp', 'drive'];
const VOICE_KEYS = new Set<ParamName>(['pitch', 'loudness', 'tenseness', 'breath', 'vibratoDepth', 'vibratoRate', 'humanize', 'throat', 'tractLength', 'pharynx', 'space', 'gain', ...QUALITY, ...RECORDING]);

export const MANNER_COLORS: Record<string, string> = {
  vowel: 'var(--hvl-accent)', diphthong: 'var(--hvl-accent)', stop: 'var(--hvl-bad)', nasal: 'var(--ui-purple, #9b59d0)',
  fricative: 'var(--hvl-warm)', affricate: 'var(--hvl-warm)', approximant: 'var(--hvl-good)', aspirate: 'var(--hvl-fg4)', trill: 'var(--hvl-good)', click: 'var(--hvl-bad)',
};

interface PlayProps {
  project: Project;
  live: Record<string, number> | null;
  agentKeys: Set<string>;
  onVoice: (p: Patch) => void;
  onShape: (p: Patch) => void;
  onTouch: (source: string, on: boolean) => void;
  onArticulation: (source: string, patch: Patch | null) => void;
  holding: boolean;
  onHold: (on: boolean) => void;
  latch: boolean;
  onLatch: (on: boolean) => void;
  running: boolean;
}

export function PlayPanel({project, live, agentKeys, onVoice, onShape, onTouch, onArticulation, holding, onHold, latch, onLatch, running}: PlayProps) {
  const sustainPointer = useRef<number | null>(null);
  const sustainControl = useRef({onHold, latch});
  sustainControl.current = {onHold, latch};
  useEffect(() => {
    const cancel = () => {
      if (sustainPointer.current === null) return;
      sustainPointer.current = null;
      if (!sustainControl.current.latch) sustainControl.current.onHold(false);
    };
    window.addEventListener('blur', cancel);
    return () => { window.removeEventListener('blur', cancel); cancel(); };
  }, []);
  const releaseSustain = (e: React.PointerEvent) => {
    if (sustainPointer.current !== e.pointerId) return;
    sustainPointer.current = null;
    if (!latch) onHold(false);
  };
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
          onChange={onShape} onTouch={onTouch} />
        <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
          <div className="hvl-row">
            <button className={`hvl-btn is-primary`} style={{flex: 1, height: 38}}
              onPointerDown={e => { e.preventDefault(); if (sustainPointer.current !== null) return; sustainPointer.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId); if (!latch) onHold(true); }}
              onPointerUp={releaseSustain} onPointerCancel={releaseSustain} onLostPointerCapture={releaseSustain}
              onClick={() => latch && onHold(!holding)}
              aria-pressed={holding}>
              {Icon.play} {latch ? (holding ? 'Release' : 'Sustain') : holding ? 'Sounding…' : 'Hold to sound'}
            </button>
            <label className="hvl-check"><input type="checkbox" checked={latch} onChange={e => onLatch(e.target.checked)} /> Latch</label>
          </div>
          <div className="hvl-articulations" aria-label="Hold to articulate">
            {([
              ['hum', 'Hum', {lipOpen: 0, velum: 1, voicing: 1}],
              ['seal', 'Seal lips', {lipOpen: 0, velum: 0}],
              ['roll', 'Roll', PHONEMES.RR.target],
              ['growl', 'Growl', {growl: 0.8}],
            ] as Array<[string, string, Patch]>).map(([id, label, patch]) => <HoldButton key={id} label={label}
              onHold={(source, on) => onArticulation(`${id}:${source}`, on ? patch : null)} />)}
          </div>
          <span className="hvl-note">Hold a key, then hold an articulation.</span>
          <BodyMorph value={bodyPosition(project.voice)} onChange={x => onVoice(bodyAt(x))} />
        </div>
      </div>
      <details className="hvl-disclosure">
        <summary>Voice source and quality</summary>
        <div className="hvl-group">
        <div className="hvl-sliders">
          {SOURCE.map(n => <Slider key={n} name={n} value={value(n)} onChange={set(n)} agent={agentKeys.has(n)} />)}
        </div>
      </div>
      <div className="hvl-group">
        <div className="hvl-sliders">
          {QUALITY.map(n => <Slider key={n} name={n} value={value(n)} onChange={set(n)} agent={agentKeys.has(n)} />)}
        </div>
      </div>
      </details>
      <details className="hvl-disclosure">
        <summary>Recording and output</summary>
        <div className="hvl-group">
        <div className="hvl-sliders">
          {[...RECORDING, ...OUTPUT].map(n => <Slider key={n} name={n} value={value(n)} onChange={set(n)} agent={agentKeys.has(n)} />)}
        </div>
      </div>
      </details>
      <details className="hvl-disclosure">
        <summary>Detailed mouth and body controls</summary>
        <div className="hvl-group">
        <div className="hvl-sliders">
          {SHAPE.map(n => <Slider key={n} name={n} value={value(n)} live={liveOf(n)} onChange={set(n)} agent={agentKeys.has(n)} />)}
        </div>
      </div>
      </details>
    </div>
  );
}

/** One slider through the calibrated bodies (child, hers, adult male); the pitch stays put. */
function BodyMorph({value, onChange}: {value: number; onChange: (x: number) => void}) {
  const fraction = (value + 1) / 2;
  return (
    <div className="hvl-slider" title="Morph the body: tract length, pharynx and throat. The note stays at its pitch.">
      <div className="hvl-slider-head">
        <label htmlFor="hvl-body-morph">Body</label>
        <output htmlFor="hvl-body-morph">{value < -0.05 ? 'child' : value > 0.05 ? 'adult male' : 'hers'} · {bodyAt(value).tractLength!.toFixed(1)} cm</output>
      </div>
      <input id="hvl-body-morph" className="hvl-range" type="range" min={-1000} max={1000} step={1} value={Math.round(value * 1000)}
        style={{'--p': `${fraction * 100}%`} as React.CSSProperties}
        onChange={e => onChange(Math.abs(e.currentTarget.valueAsNumber) < 30 ? 0 : e.currentTarget.valueAsNumber / 1000)} />
    </div>
  );
}

function VowelPad({x, y, liveX, liveY, running, onChange, onTouch}: {
  x: number; y: number; liveX?: number; liveY?: number; running: boolean;
  onChange: (p: Patch) => void; onTouch: (source: string, on: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pointer = useRef<number | null>(null);
  const heldKeys = useRef(new Set<string>());
  const [raw, setRaw] = useState(false);
  const [point, setPoint] = useState({x, y});
  const sent = useRef({x, y});
  const callbacks = useRef(onTouch);
  callbacks.current = onTouch;
  const releaseKeys = () => {
    heldKeys.current.forEach(key => callbacks.current(`vowel-pad:key:${key}`, false));
    heldKeys.current.clear();
  };
  useEffect(() => {
    const cancel = () => {
      if (pointer.current !== null) callbacks.current(`vowel-pad:pointer:${pointer.current}`, false);
      pointer.current = null;
      releaseKeys();
    };
    const visibility = () => { if (document.hidden) cancel(); };
    window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('blur', cancel);
      document.removeEventListener('visibilitychange', visibility);
      cancel();
    };
  }, []);
  useEffect(() => {
    if (x !== sent.current.x || y !== sent.current.y) setPoint({x, y});
  }, [x, y]);
  const apply = (nx: number, ny: number) => {
    const shape = raw ? {tongueX: nx, tongueY: ny} : morphVowel(nx, ny);
    sent.current = {x: shape.tongueX!, y: shape.tongueY!};
    setPoint({x: nx, y: ny});
    onChange(shape);
  };
  const update = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    let nx = Math.min(1, Math.max(0, ((e.clientX - r.left) / r.width - 0.08) / 0.84));
    let ny = Math.min(1, Math.max(0, 1 - ((e.clientY - r.top) / r.height - 0.08) / 0.84));
    if (!raw) {
      const nearest = VOWEL_ANCHORS.reduce((a, b) => Math.hypot(nx - a.x, ny - a.y) < Math.hypot(nx - b.x, ny - b.y) ? a : b);
      if (Math.hypot(nx - nearest.x, ny - nearest.y) < 0.025) { nx = nearest.x; ny = nearest.y; }
    }
    apply(nx, ny);
  };
  const release = (e: React.PointerEvent) => {
    if (pointer.current !== e.pointerId) return;
    pointer.current = null;
    onTouch(`vowel-pad:pointer:${e.pointerId}`, false);
  };
  return (
    <div className="hvl-vowel-control">
      <div ref={ref} className="hvl-pad" role="group" aria-label={raw ? 'Raw tongue position' : 'Vowel morph pad'} tabIndex={0}
        onPointerDown={e => {
          if (pointer.current !== null) return;
          e.preventDefault();
          e.currentTarget.focus();
          pointer.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          update(e);
          onTouch(`vowel-pad:pointer:${e.pointerId}`, true);
        }}
        onPointerMove={e => { if (pointer.current === e.pointerId) update(e); }}
        onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}
        onBlur={releaseKeys}
        onKeyDown={e => {
          if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!e.repeat) { heldKeys.current.add(e.key); onTouch(`vowel-pad:key:${e.key}`, true); } return; }
          const d = e.shiftKey ? 0.1 : 0.02;
          if (e.key === 'ArrowLeft') apply(Math.max(0, point.x - d), point.y);
          else if (e.key === 'ArrowRight') apply(Math.min(1, point.x + d), point.y);
          else if (e.key === 'ArrowUp') apply(point.x, Math.min(1, point.y + d));
          else if (e.key === 'ArrowDown') apply(point.x, Math.max(0, point.y - d));
          else return;
          e.preventDefault();
        }}
        onKeyUp={e => { if (heldKeys.current.delete(e.key)) { e.preventDefault(); onTouch(`vowel-pad:key:${e.key}`, false); } }}>
        {!raw && VOWEL_ANCHORS.map(v => (
          <span key={v.id} className="mark" style={{left: `${8 + v.x * 84}%`, top: `${8 + (1 - v.y) * 84}%`}}>{v.ipa}</span>
        ))}
        <span className="axis" style={{left: 6, bottom: 4}}>back</span>
        <span className="axis" style={{right: 6, bottom: 4}}>front</span>
        <span className="axis" style={{left: 6, top: 4}}>high</span>
        <div className="puck" style={{left: `${8 + point.x * 84}%`, top: `${8 + (1 - point.y) * 84}%`}} />
        {running && liveX !== undefined && liveY !== undefined && <div className="live" style={{left: `${8 + liveX * 84}%`, top: `${8 + (1 - liveY) * 84}%`}} />}
      </div>
      <label className="hvl-check" style={{marginTop: 6}}><input type="checkbox" checked={raw} onChange={e => { setRaw(e.target.checked); setPoint({x, y}); }} /> Raw tongue only</label>
    </div>
  );
}

// ---- Speak ------------------------------------------------------------------

const EXAMPLES = [
  'Hello there! I shape every sound with my tongue, my lips and a little breath.',
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
  onTry: (symbol: string) => void;
  /** The consonant being tried from the chart (its score is playing, not the phrase). */
  trying: string | null;
}

/** Consonants by place (columns) and manner (rows); each cell lists its phoneme symbols. */
const PLACES = ['Bilabial', 'Labio-dental', 'Dental', 'Alveolar', 'Post-alveolar', 'Palatal', 'Velar', 'Uvular', 'Glottal'];
const CHART: Array<[string, Array<string[]>]> = [
  ['Stop', [['P', 'B'], [], [], ['T', 'D'], [], [], ['K', 'G'], [], ['Q']]],
  ['Nasal', [['M'], [], [], ['N'], [], [], ['NG'], [], []]],
  ['Trill', [['BR'], [], [], ['RR'], [], [], [], ['RU'], []]],
  ['Tap', [[], [], [], ['DX'], [], [], [], [], []]],
  ['Fricative', [[], ['F', 'V'], ['TH', 'DH'], ['S', 'Z'], ['SH', 'ZH'], [], [], [], ['HH']]],
  ['Affricate', [[], [], [], [], ['CH', 'JH'], [], [], [], []]],
  ['Approximant', [['W'], [], [], ['L'], ['R'], ['Y'], [], [], []]],
  // Palatalized ("soft") consonants, at the place of their primary constriction.
  ['Soft stop', [['PJ', 'BJ'], [], [], ['TJ', 'DJ'], [], [], ['KJ', 'GJ'], [], []]],
  ['Soft fricative', [[], ['FJ', 'VJ'], [], ['SJ', 'ZJ'], [], [], [], [], []]],
  ['Soft sonorant', [['MJ'], [], [], ['NJ', 'LJ', 'RRJ'], [], [], [], [], []]],
  ['Ejective', [['PE'], [], [], ['TE'], [], [], ['KE'], [], []]],
  ['Click', [['CB'], [], ['CD'], ['CA'], [], [], [], [], []]],
];

function ConsonantChart({current, onTry}: {current: string | null; onTry: (symbol: string) => void}) {
  return (
    <div className="hvl-group">
      <div className="hvl-section-title"><h3>Consonants</h3><span>Click a sound to hear it between vowels</span></div>
      <div className="hvl-chart" role="table" aria-label="Consonant chart: place by manner">
        <div className="hvl-chart-row" role="row">
          <span role="columnheader" />
          {PLACES.map(p => <span key={p} role="columnheader" className="hvl-chart-head">{p}</span>)}
        </div>
        {CHART.map(([manner, cells]) => (
          <div key={manner} className="hvl-chart-row" role="row">
            <span role="rowheader" className="hvl-chart-head">{manner}</span>
            {cells.map((symbols, k) => (
              <span key={k} role="cell" className="hvl-chart-cell">
                {symbols.map(s => (
                  <button key={s} className={`hvl-ph ${current === s ? 'is-now' : ''}`} onClick={() => onTry(s)}
                    style={{'--c': MANNER_COLORS[PHONEMES[s]?.manner ?? 'stop']} as React.CSSProperties}
                    title={`${s} · ${PHONEMES[s]?.example ?? ''}`} aria-label={`${PHONEMES[s]?.ipa} as in ${PHONEMES[s]?.example}`}>
                    {PHONEMES[s]?.ipa}
                  </button>
                ))}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SpeakPanel({project, plan, onChange, onSpeak, onStop, playing, position, ready, onTry, trying}: SpeakProps) {
  const sp = project.speech;
  const current = playing && !trying ? plan?.segments.findIndex(s => position >= s.start && position < s.end) ?? -1 : -1;
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
        aria-label={sp.phonemes ? 'ARPABET or IPA phonemes' : 'Text to speak'}
        placeholder={sp.phonemes ? 'ARPABET (HH AH0 L OW1 / W ER1 L D) or IPA (həˈloʊ wɝld, nʲɛt)' : 'Type a short English phrase'}
        onChange={e => onChange({text: e.target.value})}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onSpeak(); } }} />
      {!sp.phonemes && (
        <div className="hvl-chips">
          {EXAMPLES.map(t => <button key={t} className="hvl-chip" onClick={() => onChange({text: t})}>{t.length > 34 ? `${t.slice(0, 32)}…` : t}</button>)}
        </div>
      )}
      <div className="hvl-sliders">
        <Range label="Speaking rate" value={sp.rate} min={0.6} max={1.6} step={0.05} format={v => `${Math.round(v * 100)}%`} onChange={v => onChange({rate: v})} />
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
      <ConsonantChart current={trying && playing ? trying : current >= 0 && plan ? plan.segments[current].symbol : null} onTry={onTry} />
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
  liveSing: boolean;
  onLiveSing: (on: boolean) => void;
  nextSyllable: string;
  onLiveRestart: () => void;
}

const LOW = 48;
const HIGH = 84;
const ROW = 13;
const BEAT = 46;

export function SingPanel({project, plan, onChange, onSing, onStop, playing, position, ready, onPreviewNote, liveSing, onLiveSing, nextSyllable, onLiveRestart}: SingProps) {
  const song = project.song;
  const [selected, setSelected] = useState<number | null>(null);
  // Score import (MusicXML, .mxl or MIDI): the file is read here, in the page; nothing is uploaded.
  const scoreInput = useRef<HTMLInputElement>(null);
  const [importNote, setImportNote] = useState('');
  const importScore = async (file: File | undefined) => {
    if (!file) return;
    try {
      const score = await importScoreFile(file.name, new Uint8Array(await file.arrayBuffer()));
      const {song: imported, messages} = songFromScore(score);
      if (!imported.notes.length) throw new Error('no notes found in it');
      onChange(imported);
      setSelected(null);
      const part = score.parts.find(p => p.id === score.part)?.name;
      setImportNote([`Imported ${imported.notes.length} notes${part ? ` from “${part}”` : ''}${imported.lyrics ? '' : ', no lyrics (she hums)'}.`, ...messages].join(' '));
    } catch (e) {
      setImportNote(`Could not import ${file.name}: ${(e as Error).message}`);
    }
  };
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
          <button className={`hvl-btn ${song.style === 'cartoon' ? 'is-on' : ''}`} onClick={() => onChange({style: song.style === 'cartoon' ? 'natural' : 'cartoon'})} aria-pressed={song.style === 'cartoon'}
            title="Cartoon singing: scoops, slides, wobbly vibrato and an oversized mouth">Cartoon</button>
          <button className={`hvl-btn ${song.style === 'yodel' ? 'is-on' : ''}`} onClick={() => onChange({style: song.style === 'yodel' ? 'natural' : 'yodel'})} aria-pressed={song.style === 'yodel'}
            title="Yodel: high notes flip to falsetto, low notes stay in chest voice, and the leaps between them snap">Yodel</button>
          <button className={`hvl-btn ${liveSing ? 'is-on' : ''}`} onClick={() => onLiveSing(!liveSing)} aria-pressed={liveSing}
            title="Live: each key you press (keyboard, computer keys or MIDI) sings the next syllable of the lyrics, held until you let go">Live</button>
          <label className="hvl-note" title="A second singer with their own body and voice">Duet{' '}
            <select className="hvl-input" style={{height: 28}} value={song.duet.part} onChange={e => onChange({duet: {...song.duet, part: e.target.value as DuetPart}})}>
              {DUET_PARTS.filter(([id]) => id !== 'custom' || song.duet.part === 'custom').map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>
          {song.duet.part !== 'off' && (
            <select className="hvl-input" style={{height: 28}} aria-label="Second singer's voice" value={song.duet.voice} onChange={e => onChange({duet: {...song.duet, voice: e.target.value}})}>
              {ALL_VOICES.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          )}
          {liveSing && <span className="hvl-note" aria-live="polite">Next: <b>{nextSyllable}</b> <button className="hvl-btn is-ghost" onClick={onLiveRestart} title="Back to the first syllable">↺</button></span>}
          <button className="hvl-btn is-ghost" onClick={() => { onChange({...SILLY_SONG, notes: SILLY_SONG.notes.map(n => ({...n}))}); setSelected(null); }}
            title="Load the novelty demo song">Silly song</button>
          <button className="hvl-btn is-ghost" onClick={() => scoreInput.current?.click()} title="Import a melody and its lyrics from a MusicXML (.musicxml, .mxl) or MIDI file">Import score</button>
          <input ref={scoreInput} type="file" accept=".musicxml,.xml,.mxl,.mid,.midi,.kar" style={{display: 'none'}} aria-label="Score file"
            onChange={e => { void importScore(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        <div className="hvl-row">
          <label className="hvl-note" htmlFor="hvl-bpm">Tempo</label>
          <input id="hvl-bpm" className="hvl-input" style={{width: 64}} type="number" min={30} max={240} value={song.bpm}
            onChange={e => { const v = Number(e.target.value); if (v >= 30 && v <= 240) onChange({bpm: v}); }} />
          <button className="hvl-btn is-ghost" onClick={() => { setNotes([]); setSelected(null); }} title="Clear all notes">{Icon.trash}</button>
        </div>
      </div>
      <input className="hvl-input" value={song.lyrics} maxLength={LIMITS.lyrics} aria-label="Lyrics" placeholder="Lyrics — use hy-phens to split syllables, a lone - to hold a vowel; English or 한국어"
        onChange={e => onChange({lyrics: e.target.value})} />
      {importNote && <div className="hvl-note" role="status">{importNote}</div>}
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
