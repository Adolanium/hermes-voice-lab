import React, { useEffect, useRef, useState } from "react";
import { Avatar } from "./avatar";
import { styles } from "./styles";
import { VoiceAudio } from "../audio/client.js";
import {
  DEFAULT_PARAMS,
  VOWELS,
  validateParams,
  normalizeEvents,
} from "../audio/engine.js";
import {
  planText,
  planPhonemes,
  planLyrics,
  LEXICON,
  SUPPORTED_PHONEMES,
} from "../audio/planner.js";
import { wasmBytes, workletSource } from "./embedded";
import type { VoiceLabBridge, VoiceProject } from "./bridge";
const NOTES = [48, 50, 52, 53, 55, 57, 59, 60];
const NOTE_NAMES = ["C3", "D3", "E3", "F3", "G3", "A3", "B3", "C4"];
const LETTERS = ["A", "S", "D", "F", "G", "H", "J", "K"];
const INITIAL = NOTES.map((note, i) => ({
  note,
  vowel: ["ah", "eh", "ee", "oh", "oo", "oh", "eh", "ah"][i],
  enabled: true,
}));
function Scope({ audio }: { audio: React.MutableRefObject<any> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let id = 0;
    const draw = () => {
      const el = canvas.current;
      if (!el) return;
      const c = el.getContext("2d")!;
      const w = (el.width = el.clientWidth * 2),
        h = (el.height = el.clientHeight * 2);
      c.clearRect(0, 0, w, h);
      const a = audio.current?.analyser;
      c.lineWidth = 2;
      c.strokeStyle = "#8b667e";
      c.beginPath();
      if (a) {
        const b = new Uint8Array(a.fftSize);
        a.getByteTimeDomainData(b);
        for (let i = 0; i < b.length; i++) {
          const x = (i / b.length) * w,
            y = (b[i] / 255) * h;
          i ? c.lineTo(x, y) : c.moveTo(x, y);
        }
      } else {
        c.moveTo(0, h / 2);
        c.lineTo(w, h / 2);
      }
      c.stroke();
      if (a) {
        const b = new Uint8Array(a.frequencyBinCount);
        a.getByteFrequencyData(b);
        c.fillStyle = "#ae765547";
        for (let i = 0; i < 80; i++) {
          const v = b[i] / 255;
          c.fillRect((i * w) / 80, h - v * h, w / 80 - 2, v * h);
        }
      }
      id = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <canvas
      className="vl-scope"
      ref={canvas}
      aria-label="Live waveform and frequency spectrum"
    />
  );
}
export default function VoiceLab({ bridge }: { bridge?: VoiceLabBridge }) {
  const [params, setParams] = useState<any>({ ...DEFAULT_PARAMS });
  const [state, setState] = useState("idle");
  const [held, setHeld] = useState<number | null>(null);
  const [message, setMessage] = useState(
    "Ready when you are. Audio starts with your first note.",
  );
  const [sequence, setSequence] = useState(INITIAL);
  const [bpm, setBpm] = useState(96);
  const [text, setText] = useState("hello hermes");
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [activeStep, setActiveStep] = useState(-1);
  const [vowel, setVowel] = useState("ah");
  const [cutaway, setCutaway] = useState(true);
  const [savedEvents, setSavedEvents] = useState<any[] | null>(null);
  const [speechMode, setSpeechMode] = useState("text");
  const [visual, setVisual] = useState<any>(null);
  const audio = useRef<any>(null);
  const paramsRef = useRef(params);
  const sequenceTimer = useRef<any>(null);
  const finishTimer = useRef<any>(null);
  const heldRef = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const update = (patch: any) => {
    setSavedEvents(current => current?.map(event => ({...event, params: {...event.params, ...patch}})) ?? null);
    setParams((p: any) => {
      const n = { ...p, ...patch };
      paramsRef.current = n;
      return n;
    });
    audio.current?.setParams(patch);
  };
  const stop = () => {
    setVisual(null);
    audio.current?.cancelSequence();
    audio.current?.noteOff();
    heldRef.current = null;
    setHeld(null);
    setPlaying(false);
    setActiveStep(-1);
    clearInterval(sequenceTimer.current);
    clearTimeout(finishTimer.current);
  };
  const ensure = async () => {
    if (!audio.current)
      audio.current = new VoiceAudio({
        wasmBytes,
        workletSource,
        onState: setState,
        onGeometry: (data: any) => { if (data.params) setVisual(data.params); },
      });
    await audio.current.start(paramsRef.current);
    return audio.current;
  };
  const press = async (note: number) => {
    heldRef.current = note;
    setHeld(note);
    try {
      const a = await ensure();
      if (heldRef.current === note) a.noteOn(note);
    } catch (e: any) {
      setMessage(e.message);
      heldRef.current = null;
      setHeld(null);
    }
  };
  const release = () => {
    heldRef.current = null;
    setHeld(null);
    audio.current?.noteOff();
  };
  const events = () =>
    savedEvents ??
    sequence.flatMap((s, i) =>
      s.enabled
        ? [
            {
              time: (i * 60) / bpm,
              duration: (60 / bpm) * 0.88,
              params: {
                ...(VOWELS as any)[s.vowel].params,
                pitch: 440 * 2 ** ((s.note - 69) / 12),
                gate: 1,
              },
            },
          ]
        : [],
    );
  const project = (): VoiceProject => ({
    version: 1,
    name: "Hermes voice study",
    patch: { ...params, gate: 0 },
    sequence,
    bpm,
    text,
    events: events(),
  });
  const apply = (p: VoiceProject) => {
    validateParams(p.patch);
    normalizeEvents(p.events || []);
    if (
      p.sequence &&
      (!Array.isArray(p.sequence) ||
        p.sequence.length !== 8 ||
        p.sequence.some(
          (s) =>
            !NOTES.includes(s.note) ||
            !(s.vowel in VOWELS) ||
            typeof s.enabled !== "boolean",
        ))
    )
      throw new Error("Patch must contain eight valid note and vowel steps.");
    if (
      p.bpm !== undefined &&
      (!Number.isFinite(p.bpm) || p.bpm < 40 || p.bpm > 240)
    )
      throw new Error("Patch tempo must be 40 to 240 BPM.");
    stop();
    update({ ...DEFAULT_PARAMS, ...p.patch, gate: 0 });
    setSavedEvents(p.events?.length ? p.events : null);
    if (p.sequence?.length) setSequence(p.sequence.slice(0, 8));
    if (p.bpm) setBpm(p.bpm);
    if (p.text !== undefined) setText(p.text);
    setMessage(`Loaded ${p.name}.`);
  };
  useEffect(() => {
    if (!bridge) return;
    let alive = true;
    bridge
      .load()
      .then((p) => {
        if (alive && p) apply(p);
      })
      .catch((e) => setMessage(`Load failed: ${e.message}`));
    const off = bridge.subscribe((p) => apply(p));
    return () => {
      alive = false;
      off();
    };
  }, [bridge]);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (
        e.repeat ||
        e.altKey ||
        e.metaKey ||
        e.ctrlKey ||
        /INPUT|TEXTAREA|SELECT|BUTTON/.test((e.target as HTMLElement)?.tagName)
      )
        return;
      const n = LETTERS.indexOf(e.key.toUpperCase());
      if (n >= 0) {
        e.preventDefault();
        press(NOTES[n]);
      }
      if (e.code === "Space") {
        e.preventDefault();
        stop();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (LETTERS.includes(e.key.toUpperCase())) release();
    };
    const blur = () => stop();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      stop();
      audio.current?.stop();
    };
  }, []);
  const choose = (v: string) => {
    setVowel(v);
    update((VOWELS as any)[v].params);
  };
  const play = async () => {
    if (playing) {
      stop();
      return;
    }
    try {
      const a = await ensure();
      stop();
      const ev = events();
      a.playSequence(ev);
      setPlaying(true);
      let step = 0;
      setActiveStep(0);
      if (!savedEvents)
        sequenceTimer.current = setInterval(() => {
          step++;
          setActiveStep(step < sequence.length ? step : -1);
        }, 60000 / bpm);
      finishTimer.current = setTimeout(
        stop,
        (Math.max(0, ...ev.map((e) => e.time + e.duration)) + 0.08) * 1000,
      );
    } catch (e: any) {
      setMessage(e.message);
    }
  };
  const speak = async () => {
    try {
      const opts = { pitch: params.pitch };
      const words = text.trim().split(/\s+/);
      const plan =
        speechMode === "phonemes"
          ? planPhonemes(text, opts)
          : speechMode === "lyrics"
            ? planLyrics(
                text,
                words.map((_, i) => ({
                  pitch:
                    440 * 2 ** ((sequence[i % sequence.length].note - 69) / 12),
                  duration: 60 / bpm,
                })),
                opts,
              )
            : planText(text, opts);
      if (!plan.events.length) {
        setMessage(
          plan.unsupported?.length
            ? `Unsupported ${speechMode === "phonemes" ? "phonemes" : "words"}: ${plan.unsupported.join(", ")}. See supported input below.`
            : "Enter a supported word or vowel sound.",
        );
        return;
      }
      const a = await ensure();
      stop();
      setSavedEvents(plan.events);
      a.playSequence(plan.events);
      setPlaying(true);
      finishTimer.current = setTimeout(stop, plan.duration * 1000 + 100);
      setMessage(
        plan.unsupported?.length
          ? `Skipped unsupported words: ${plan.unsupported.join(", ")}.`
          : "Playing an experimental phoneme approximation.",
      );
    } catch (e: any) {
      setMessage(e.message);
    }
  };
  const download = (blob: Blob, name: string) => {
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 2000);
  };
  const save = async () => {
    setBusy(true);
    try {
      if (bridge) {
        await bridge.save(project());
        setMessage("Patch saved to this project and session.");
      } else {
        download(
          new Blob([JSON.stringify(project(), null, 2)], {
            type: "application/json",
          }),
          "hermes-voice-patch.json",
        );
        setMessage("Patch downloaded.");
      }
    } catch (e: any) {
      setMessage(`Save failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };
  const load = async () => {
    if (!bridge) {
      fileRef.current?.click();
      return;
    }
    try {
      const p = await bridge.load();
      p ? apply(p) : setMessage("No saved patch in this session yet.");
    } catch (e: any) {
      setMessage(`Load failed: ${e.message}`);
    }
  };
  const exportWav = async () => {
    setBusy(true);
    setMessage("Rendering the sequence to WAV…");
    try {
      if (bridge) {
        const r = await bridge.render(project());
        setMessage(`WAV exported: ${r.path}`);
      } else {
        const { renderWav } = await import("../audio/offline.js");
        const r = await renderWav(wasmBytes, project());
        download(new Blob([r.wav], { type: "audio/wav" }), "hermes-voice.wav");
        setMessage("WAV downloaded.");
      }
    } catch (e: any) {
      setMessage(`Export failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };
  const slider = (key: string, label: string, min = 0, max = 1, unit = "") => (
    <label className="vl-range" key={key}>
      <span className="vl-range-header">
        {label}
        <output>
          {key === "pitch"
            ? Math.round(params[key])
            : Math.round(params[key] * 100)}
          {unit || "%"}
        </output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={key === "pitch" ? 1 : 0.01}
        value={params[key]}
        onChange={(e) => update({ [key]: +e.target.value })}
      />
    </label>
  );
  return (
    <div className="voice-lab">
      <style>{styles}</style>
      <header className="vl-head">
        <div className="vl-brand">
          <svg
            className="vl-mark"
            viewBox="0 0 40 40"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M5 20h4m3-9v18m5-24v30m6-27v24m6-19v14m6-7h2"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
          <div>
            <h1>Hermes Voice Lab</h1>
            <p>A voice you can shape.</p>
          </div>
        </div>
        <div className="vl-actions">
          <span className="vl-status">
            <i className={`vl-dot ${state === "running" ? "on" : ""}`} />
            {state === "running"
              ? "Audio ready"
              : state === "starting"
                ? "Starting audio"
                : "Audio idle"}
          </span>
          <button onClick={load} disabled={busy}>
            Load patch
          </button>
          <button onClick={save} disabled={busy}>
            Save patch
          </button>
          <button className="primary" onClick={exportWav} disabled={busy}>
            {busy ? "Working…" : "Export WAV"}
          </button>
        </div>
      </header>
      <main>
        <div className="vl-studio">
          <section
            className="vl-character"
            aria-label="Interactive vocal tract"
          >
            <Avatar
              cutaway={cutaway}
              params={state === "running" && visual ? visual : params}
              onChange={update}
              active={held !== null || playing}
            />
            <div className="vl-character-caption">
              <span>Hermes · illustrative anatomy</span>
              <label>
                <input
                  type="checkbox"
                  checked={cutaway}
                  onChange={(e) => setCutaway(e.target.checked)}
                />{" "}
                Modeled cutaway
              </label>
            </div>
          </section>
          <section className="vl-control">
            <div className="vl-section-heading">
              <h2>Shape the sound</h2>
              <small>Choose a vowel, then make it yours.</small>
            </div>
            <div className="vl-vowels">
              {Object.entries(VOWELS).map(([key, v]: any) => (
                <button
                  key={key}
                  className={vowel === key ? "selected" : ""}
                  onClick={() => choose(key)}
                  aria-pressed={vowel === key}
                >
                  {key.toUpperCase()}
                  <small>{v.label}</small>
                </button>
              ))}
            </div>
            <div className="vl-sliders">
              {slider("tongueX", "Tongue · forward")}
              {slider("tongueY", "Tongue · height")}
              {slider("jaw", "Jaw opening")}
              {slider("lip", "Lip opening")}
              {slider("pitch", "Pitch", 80, 400, " Hz")}
              {slider("breath", "Breath")}
              {slider("vibrato", "Vibrato")}
              {slider("gain", "Output level")}
            </div>
            <div className="vl-hold-row">
              <button
                className={`primary ${held === -1 ? "held" : ""}`}
                onPointerDown={async (e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  heldRef.current = -1;
                  setHeld(-1);
                  try {
                    const a = await ensure();
                    if (heldRef.current === -1)
                      a.setParams({ ...paramsRef.current, gate: 1 });
                  } catch (err: any) {
                    setMessage(err.message);
                    release();
                  }
                }}
                onPointerUp={release}
                onPointerCancel={release}
                onKeyDown={(e) => {
                  if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    if (!e.repeat) {
                      heldRef.current = -1;
                      setHeld(-1);
                      ensure()
                        .then((a) => {
                          if (heldRef.current === -1)
                            a.setParams({ ...paramsRef.current, gate: 1 });
                        })
                        .catch((err) => setMessage(err.message));
                    }
                  }
                }}
                onKeyUp={release}
              >
                Hold to sing
              </button>
              <button onClick={stop}>Stop</button>
              <button
                onClick={() => {
                  stop();
                  audio.current?.stop();
                  setMessage("Audio disabled. Play a note to restart.");
                }}
              >
                Disable audio
              </button>
            </div>
            <Scope audio={audio} />
            <div className="vl-scope-caption">
              <span>LIVE WAVEFORM + SPECTRUM</span>
              <span>Web Audio / WASM</span>
            </div>
          </section>
        </div>
        <div className="vl-lower">
          <section>
            <div className="vl-section-heading">
              <h2>Play the voice</h2>
              <small>Use your keyboard · A through K</small>
            </div>
            <div className="vl-piano">
              {NOTES.map((note, i) => (
                <button
                  className={`vl-key ${held === note ? "down" : ""}`}
                  key={note}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    press(note);
                  }}
                  onPointerUp={release}
                  onPointerCancel={release}
                  onKeyDown={(e) => {
                    if ((e.key === " " || e.key === "Enter") && !e.repeat) {
                      e.preventDefault();
                      press(note);
                    }
                  }}
                  onKeyUp={release}
                  aria-label={`Play ${NOTE_NAMES[i]}`}
                >
                  <span>{NOTE_NAMES[i]}</span>
                  <small>{LETTERS[i]}</small>
                </button>
              ))}
            </div>
          </section>
          <section>
            <div className="vl-section-heading">
              <h2>Vowel sequence</h2>
              <small>
                {savedEvents
                  ? "Saved timeline · edit a step to replace"
                  : "Eight steps · click a number to mute"}
              </small>
            </div>
            <div className="vl-sequence">
              {sequence.map((s, i) => (
                <div
                  key={i}
                  className={`vl-step ${s.enabled ? "" : "off"} ${activeStep === i ? "playing" : ""}`}
                >
                  <button
                    aria-label={`Step ${i + 1} ${s.enabled ? "enabled" : "muted"}`}
                    aria-pressed={s.enabled}
                    onClick={() => {
                      setSavedEvents(null);
                      setSequence((x) =>
                        x.map((v, j) =>
                          j === i ? { ...v, enabled: !v.enabled } : v,
                        ),
                      );
                    }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </button>
                  <select
                    aria-label={`Step ${i + 1} vowel`}
                    value={s.vowel}
                    onChange={(e) => {
                      setSavedEvents(null);
                      setSequence((x) =>
                        x.map((v, j) =>
                          j === i ? { ...v, vowel: e.target.value } : v,
                        ),
                      );
                    }}
                  >
                    {Object.keys(VOWELS).map((v) => (
                      <option key={v} value={v}>
                        {v.toUpperCase()}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={`Step ${i + 1} note`}
                    value={s.note}
                    onChange={(e) => {
                      setSavedEvents(null);
                      setSequence((x) =>
                        x.map((v, j) =>
                          j === i ? { ...v, note: +e.target.value } : v,
                        ),
                      );
                    }}
                  >
                    {NOTES.map((n, j) => (
                      <option key={n} value={n}>
                        {NOTE_NAMES[j]}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="vl-seq-actions">
              <button className="primary" onClick={play}>
                {playing ? "Stop sequence" : "Play sequence"}
              </button>
              <label className="vl-tempo">
                <input
                  type="number"
                  min={40}
                  max={240}
                  value={bpm}
                  onChange={(e) => {
                    setSavedEvents(null);
                    setBpm(Math.min(240, Math.max(40, +e.target.value || 96)));
                  }}
                />{" "}
                BPM
              </label>
            </div>
          </section>
        </div>
        <section className="vl-speech">
          <div className="vl-section-heading">
            <h2>Give it a word</h2>
            <small>Experimental phoneme playback</small>
          </div>
          <div className="vl-speech-row">
            <select
              aria-label="Playback mode"
              value={speechMode}
              onChange={(e) => setSpeechMode(e.target.value)}
            >
              <option value="text">Spoken phrase</option>
              <option value="phonemes">Phonemes</option>
              <option value="lyrics">Sing lyrics</option>
            </select>
            <input
              aria-label="Words to synthesize"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Try hello hermes"
              onKeyDown={(e) => {
                if (e.key === "Enter") speak();
              }}
            />
            <button onClick={speak}>
              {speechMode === "lyrics"
                ? "Sing lyrics"
                : speechMode === "phonemes"
                  ? "Play phonemes"
                  : "Speak text"}
            </button>
          </div>
          <p className="vl-footnote">
            A small pronunciation lexicon drives the same vocal model. Unknown
            words stop playback. Lyrics follow the sequence notes, one word per
            note. This is a sound experiment, not a natural speech engine.
          </p>
          <details className="vl-footnote">
            <summary>Supported words and phonemes</summary>
            <p>
              {speechMode === "phonemes"
                ? SUPPORTED_PHONEMES.join(" · ")
                : Object.keys(LEXICON).join(", ")}
            </p>
          </details>
        </section>
      </main>
      <footer className="vl-footer">
        <span className="vl-message" role="status">
          {message}
        </span>
        <span>Made for Hermes</span>
      </footer>
      <input
        type="file"
        accept="application/json,.json"
        ref={fileRef}
        hidden
        onChange={async (e) => {
          try {
            const f = e.target.files?.[0];
            if (!f) return;
            const p = JSON.parse(await f.text());
            if (p.version !== 1 || !p.patch || typeof p.patch !== "object")
              throw new Error("Choose a version 1 Hermes voice patch.");
            apply(p);
          } catch (err: any) {
            setMessage(`Load failed: ${err.message}`);
          } finally {
            e.target.value = "";
          }
        }}
      />
    </div>
  );
}
