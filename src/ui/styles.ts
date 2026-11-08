/** Scoped styles. Every colour derives from Hermes theme tokens. */
export const CSS = `
.hvl-root {
  --hvl-fg: var(--ui-text-primary, #16151a);
  --hvl-fg2: var(--ui-text-secondary, #45434d);
  --hvl-fg3: var(--ui-text-tertiary, #75727e);
  --hvl-fg4: var(--ui-text-quaternary, #a19ea8);
  --hvl-line: var(--ui-stroke-secondary, #dedad1);
  --hvl-line2: var(--ui-stroke-tertiary, #ebe8e0);
  --hvl-accent: var(--ui-accent, #5b5bd6);
  --hvl-bg: var(--ui-bg-editor, transparent);
  --hvl-card: color-mix(in oklab, var(--ui-bg-elevated, #fff) 45%, transparent);
  --hvl-ink: var(--ui-text-primary, #16151a);
  --hvl-skin: var(--ui-bg-elevated, #fff);
  --hvl-paper: color-mix(in oklab, var(--hvl-accent) 5%, var(--ui-bg-elevated, #fff));
  --hvl-flesh: color-mix(in oklab, var(--hvl-accent) 40%, var(--ui-bg-elevated, #fff));
  --hvl-cavity: color-mix(in oklab, var(--hvl-accent) 15%, var(--ui-bg-elevated, #fff));
  --hvl-bone: color-mix(in oklab, var(--ui-text-primary, #16151a) 38%, var(--ui-bg-elevated, #fff));
  --hvl-air: var(--hvl-accent);
  --hvl-warm: var(--ui-orange, #d9772b);
  --hvl-good: var(--ui-green, #2f9e6e);
  --hvl-bad: var(--ui-red, #d64545);
  --hvl-mono: var(--font-mono, ui-monospace, "SF Mono", Menlo, monospace);
  --hvl-sans: var(--font-sans, ui-sans-serif, system-ui, sans-serif);
  --hvl-radius: 10px;
  font-family: var(--hvl-sans);
  color: var(--hvl-fg);
  height: 100%;
  overflow: auto;
  container-type: inline-size;
  -webkit-font-smoothing: antialiased;
}
.hvl-root *, .hvl-root *::before, .hvl-root *::after { box-sizing: border-box; }
.hvl-root button { font: inherit; color: inherit; }
.hvl-shell { max-width: 1480px; margin: 0 auto; padding: 18px 22px 28px; display: flex; flex-direction: column; gap: 14px; min-height: 100%; }

/* Header */
.hvl-top { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.hvl-brand { display: flex; align-items: center; gap: 11px; min-width: 0; flex: 1 1 260px; }
.hvl-mark { width: 34px; height: 34px; flex: none; color: var(--hvl-accent); }
.hvl-title { display: flex; flex-direction: column; min-width: 0; }
.hvl-title h1 { margin: 0; font-size: 17px; font-weight: 650; letter-spacing: -0.01em; line-height: 1.15; }
.hvl-title input { all: unset; font-size: 12px; color: var(--hvl-fg3); min-width: 60px; max-width: 320px; border-bottom: 1px dashed transparent; }
.hvl-title input:hover, .hvl-title input:focus { border-bottom-color: var(--hvl-line); color: var(--hvl-fg2); }
.hvl-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.hvl-status { display: inline-flex; align-items: center; gap: 7px; font: 500 11px var(--hvl-mono); color: var(--hvl-fg3); letter-spacing: 0.02em; padding: 0 4px; }
.hvl-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--hvl-fg4); }
.hvl-dot.is-running { background: var(--hvl-good); box-shadow: 0 0 0 3px color-mix(in oklab, var(--hvl-good) 22%, transparent); }
.hvl-dot.is-starting { background: var(--hvl-warm); }
.hvl-dot.is-error { background: var(--hvl-bad); }

.hvl-btn { -webkit-appearance: none; appearance: none; display: inline-flex; align-items: center; justify-content: center; gap: 7px; height: 30px; padding: 0 12px; border-radius: 8px;
  border: 1px solid var(--hvl-line); background: var(--hvl-card); font-size: 12.5px; font-weight: 550; cursor: pointer; white-space: nowrap;
  transition: background .12s, border-color .12s, transform .06s; }
.hvl-btn:hover { border-color: color-mix(in oklab, var(--hvl-fg) 25%, var(--hvl-line)); }
.hvl-btn:active { transform: translateY(1px); }
.hvl-btn:disabled { opacity: .45; cursor: default; }
.hvl-btn.is-primary { background: var(--hvl-accent); border-color: var(--hvl-accent); color: var(--ui-bg-elevated, #fff); }
.hvl-btn.is-primary:hover { background: color-mix(in oklab, var(--hvl-accent) 88%, var(--hvl-fg)); }
.hvl-btn.is-on { border-color: var(--hvl-accent); color: var(--hvl-accent); background: color-mix(in oklab, var(--hvl-accent) 9%, transparent); }
.hvl-btn.is-ghost { background: transparent; border-color: transparent; }
.hvl-btn.is-ghost:hover { background: color-mix(in oklab, var(--hvl-fg) 6%, transparent); }
.hvl-btn svg { width: 14px; height: 14px; }
.hvl-select { height: 30px; border-radius: 8px; border: 1px solid var(--hvl-line); background: var(--hvl-card); color: inherit; font: 550 12.5px var(--hvl-sans); padding: 0 8px; max-width: 200px; }

/* Main stage */
.hvl-main { display: grid; grid-template-columns: minmax(340px, 1.05fr) minmax(360px, 1fr); gap: 14px; align-items: stretch; }
.hvl-card { border: 1px solid var(--hvl-line); border-radius: var(--hvl-radius); background: var(--hvl-card); position: relative; }
.hvl-stage { display: flex; flex-direction: column; overflow: hidden; min-height: 420px; align-self: start; position: sticky; top: 12px; }
.hvl-stage-head { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px 0 14px; gap: 8px; }
.hvl-kicker { font: 600 10px var(--hvl-mono); letter-spacing: .14em; text-transform: uppercase; color: var(--hvl-fg3); }
.hvl-portrait-wrap { display: flex; align-items: center; justify-content: center; padding: 0 8px; position: relative; }
.hvl-portrait { width: 100%; height: auto; aspect-ratio: 1; max-height: min(70vh, 640px); touch-action: none; user-select: none; display: block; }
.hvl-now { position: absolute; left: 12px; top: 2px; width: 196px; padding: 10px 12px 9px; border-radius: 10px; border: 1px solid var(--hvl-line2);
  background: color-mix(in oklab, var(--hvl-skin) 86%, transparent); backdrop-filter: blur(6px); }
.hvl-now-symbol { font: 500 40px/1 var(--hvl-sans); color: var(--hvl-accent); letter-spacing: -.01em; min-height: 40px; }
.hvl-now.is-stop .hvl-now-symbol, .hvl-now.is-fricative .hvl-now-symbol { color: var(--hvl-warm); }
.hvl-now.is-nasal .hvl-now-symbol { color: var(--ui-purple, #9b59d0); }
.hvl-now.is-silent .hvl-now-symbol { color: var(--hvl-fg4); }
.hvl-now-label { font-size: 10.5px; color: var(--hvl-fg3); margin: 3px 0 8px; min-height: 13px; line-height: 1.3; }
.hvl-now dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; margin: 0; font: 500 10.5px var(--hvl-mono); font-variant-numeric: tabular-nums; }
.hvl-now dt { color: var(--hvl-fg4); }
.hvl-now dd { margin: 0; text-align: right; color: var(--hvl-fg2); }
.hvl-readouts { position: absolute; right: 12px; top: 2px; margin: 0; display: grid; grid-template-columns: auto auto; gap: 2px 12px; font: 500 11px var(--hvl-mono);
  color: var(--hvl-fg2); background: color-mix(in oklab, var(--hvl-skin) 82%, transparent); border: 1px solid var(--hvl-line2); border-radius: 8px; padding: 8px 10px;
  backdrop-filter: blur(6px); font-variant-numeric: tabular-nums; }
.hvl-readouts dt { color: var(--hvl-fg4); }
.hvl-readouts dd { margin: 0; text-align: right; }
.hvl-stage-foot { display: flex; align-items: center; gap: 6px; padding: 0 12px 10px; font-size: 11px; color: var(--hvl-fg3); flex-wrap: wrap; }
.hvl-note { font-size: 11px; color: var(--hvl-fg3); line-height: 1.4; }

.hvl-portrait {
  /* The portrait is a printed illustration: her true colours in every theme. */
  --hvl-ink: #18171c; --hvl-skin: #fbfaf6;
  --hvl-paper: color-mix(in oklab, var(--hvl-accent) 6%, #fbfaf6);
  --hvl-flesh: color-mix(in oklab, var(--hvl-accent) 40%, #fbfaf6);
  --hvl-cavity: color-mix(in oklab, var(--hvl-accent) 15%, #fbfaf6);
  --hvl-bone: #8b8895; --hvl-fg2: #45434d; --hvl-fg3: #75727e;
}
.hvl-portrait-disc { fill: transparent; }
.hvl-portrait.is-stage { overflow: visible; }
.hvl-word { font: 900 1em var(--hvl-sans); letter-spacing: -.01em; paint-order: stroke; stroke: #fbfaf6; stroke-width: 10px; stroke-linejoin: round; dominant-baseline: middle; }
.hvl-karaoke { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 10px; padding: 2px 12px 10px; min-height: 30px; font: 750 17px var(--hvl-sans); }
.hvl-karaoke span { color: var(--hvl-fg4); transition: color .08s, transform .08s; }
.hvl-karaoke span.is-past { color: var(--hvl-fg2); }
.hvl-karaoke span.is-now { color: var(--hvl-accent); transform: scale(1.12) translateY(-1px); }
.hvl-root[data-dark] .hvl-portrait-disc { fill: #eceaf1; }
.hvl-mouth-cavity { fill: #2a1b22; }
.hvl-mouth-tongue { fill: #a8566c; }
.hvl-mouth-teeth { fill: #fbfaf6; }
.hvl-art-tone { fill: color-mix(in oklab, var(--hvl-ink) 38%, var(--hvl-skin)); }
.hvl-xray { opacity: .5; pointer-events: none; }
.hvl-cutaway { opacity: 0; transition: opacity .3s ease; pointer-events: none; }
.hvl-cutaway.is-on { opacity: 1; }
.hvl-handle { cursor: grab; }
.hvl-handle:active { cursor: grabbing; }
.hvl-handle-ring { fill: color-mix(in oklab, var(--hvl-accent) 16%, transparent); stroke: var(--hvl-accent); stroke-width: 1.5; transition: r .15s; }
.hvl-handle:hover .hvl-handle-ring { fill: color-mix(in oklab, var(--hvl-accent) 30%, transparent); }
.hvl-handle-dot { fill: var(--hvl-accent); }
.hvl-label path { stroke-width: .9; }
.hvl-labels { pointer-events: none; }
.hvl-label text { font: 600 8.5px var(--hvl-mono); fill: var(--hvl-fg2); letter-spacing: .08em; text-transform: uppercase; }
.hvl-label rect { fill: var(--hvl-skin); stroke: color-mix(in oklab, var(--hvl-accent) 45%, transparent); stroke-width: .8; }
.hvl-label path { stroke: var(--hvl-accent); stroke-opacity: .65; }
.hvl-label-dot { fill: var(--hvl-accent); }
.hvl-blink { transform-box: fill-box; transform-origin: 50% 40%; animation: hvl-blink 5.2s infinite; }
@keyframes hvl-blink { 0%, 93%, 100% { transform: scaleY(1); } 95.5% { transform: scaleY(0.08); } }
.hvl-bead { fill: var(--hvl-accent); transition: opacity .08s linear; }
.hvl-bead.is-shut { fill: var(--hvl-warm); }
.hvl-particles circle { fill: var(--hvl-skin); stroke: var(--hvl-accent); stroke-width: .9; }
.hvl-seal circle { fill: color-mix(in oklab, var(--hvl-warm) 22%, transparent); stroke: var(--hvl-warm); stroke-width: 1.4; }
.hvl-seal path { stroke: var(--hvl-warm); stroke-width: 1.8; stroke-linecap: round; }
.hvl-air path { animation: hvl-flow 1.1s linear infinite; }
.hvl-air.is-fast path { animation-duration: .6s; }
@keyframes hvl-flow { to { stroke-dashoffset: -22; } }
@media (prefers-reduced-motion: reduce) { .hvl-air path, .hvl-blink { animation: none; } .hvl-particles { display: none; } .hvl-cutaway { transition: none; } }

/* Console */
.hvl-console { display: flex; flex-direction: column; min-width: 0; }
.hvl-tabs { display: flex; gap: 2px; padding: 6px; border-bottom: 1px solid var(--hvl-line2); }
.hvl-tab { -webkit-appearance: none; appearance: none; flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px; height: 34px; border-radius: 7px; border: 0; background: transparent;
  font-size: 13px; font-weight: 600; color: var(--hvl-fg3); cursor: pointer; }
.hvl-tab:hover { color: var(--hvl-fg); background: color-mix(in oklab, var(--hvl-fg) 5%, transparent); }
.hvl-tab.is-active { color: var(--hvl-fg); background: color-mix(in oklab, var(--hvl-accent) 11%, transparent); box-shadow: inset 0 -2px 0 var(--hvl-accent); }
.hvl-tab kbd { font: 500 10px var(--hvl-mono); color: var(--hvl-fg4); }
.hvl-panel { padding: 14px; display: flex; flex-direction: column; gap: 14px; overflow: auto; flex: 1; }
.hvl-section-title { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin: 0; }
.hvl-section-title h3 { margin: 0; font-size: 12.5px; font-weight: 650; }
.hvl-section-title span { font-size: 11px; color: var(--hvl-fg3); }

.hvl-vowels { display: grid; grid-template-columns: repeat(auto-fill, minmax(52px, 1fr)); gap: 6px; }
.hvl-vowel { display: flex; flex-direction: column; align-items: center; gap: 1px; padding: 6px 2px 5px; border-radius: 8px; border: 1px solid var(--hvl-line2);
  background: transparent; cursor: pointer; transition: border-color .12s, background .12s; }
.hvl-vowel b { font: 500 18px/1.1 var(--hvl-sans); }
.hvl-vowel small { font-size: 9.5px; color: var(--hvl-fg3); }
.hvl-vowel:hover { border-color: var(--hvl-line); background: color-mix(in oklab, var(--hvl-fg) 3%, transparent); }
.hvl-vowel.is-active { border-color: var(--hvl-accent); background: color-mix(in oklab, var(--hvl-accent) 10%, transparent); }

.hvl-play-grid { display: grid; grid-template-columns: minmax(150px, 210px) 1fr; gap: 14px; }
.hvl-pad { position: relative; aspect-ratio: 1.1; border-radius: 8px; border: 1px solid var(--hvl-line); touch-action: none; cursor: crosshair;
  background: linear-gradient(color-mix(in oklab, var(--hvl-fg) 4%, transparent) 1px, transparent 1px) 0 0 / 25% 25%,
              linear-gradient(90deg, color-mix(in oklab, var(--hvl-fg) 4%, transparent) 1px, transparent 1px) 0 0 / 25% 25%; }
.hvl-pad .mark { position: absolute; transform: translate(-50%, -50%); font: 500 12px var(--hvl-sans); color: var(--hvl-fg3); pointer-events: none; }
.hvl-pad .puck { position: absolute; width: 18px; height: 18px; border-radius: 50%; transform: translate(-50%, -50%); border: 2px solid var(--hvl-accent);
  background: color-mix(in oklab, var(--hvl-accent) 25%, transparent); box-shadow: 0 0 0 5px color-mix(in oklab, var(--hvl-accent) 10%, transparent); pointer-events: none; }
.hvl-pad .live { position: absolute; width: 7px; height: 7px; border-radius: 50%; transform: translate(-50%, -50%); background: var(--hvl-fg2); pointer-events: none; opacity: .7; }
.hvl-pad .axis { position: absolute; font: 600 8.5px var(--hvl-mono); letter-spacing: .1em; text-transform: uppercase; color: var(--hvl-fg4); pointer-events: none; }

.hvl-sliders { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px 14px; }
.hvl-slider { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.hvl-slider-head { display: flex; justify-content: space-between; gap: 6px; font-size: 11.5px; }
.hvl-slider-head label { color: var(--hvl-fg2); font-weight: 550; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hvl-slider-head output { font: 500 11px var(--hvl-mono); color: var(--hvl-fg3); font-variant-numeric: tabular-nums; }
.hvl-slider.is-agent .hvl-slider-head output { color: var(--hvl-accent); }
.hvl-range { -webkit-appearance: none; appearance: none; width: 100%; height: 18px; background: transparent; margin: 0; cursor: pointer; --p: 50%; }
.hvl-range::-webkit-slider-runnable-track { height: 4px; border-radius: 3px; background: linear-gradient(90deg, var(--hvl-accent) var(--p), color-mix(in oklab, var(--hvl-fg) 12%, transparent) var(--p)); }
.hvl-range::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%; margin-top: -5px; background: var(--hvl-skin);
  border: 2px solid var(--hvl-accent); box-shadow: 0 1px 2px rgba(0,0,0,.15); }
.hvl-range:focus-visible { outline: none; }
.hvl-range:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 4px color-mix(in oklab, var(--hvl-accent) 30%, transparent); }
.hvl-group { border-top: 1px solid var(--hvl-line2); padding-top: 12px; display: flex; flex-direction: column; gap: 10px; }
.hvl-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.hvl-seg { display: inline-flex; border: 1px solid var(--hvl-line); border-radius: 8px; padding: 2px; gap: 2px; }
.hvl-seg button { border: 0; background: transparent; height: 24px; padding: 0 10px; border-radius: 6px; font-size: 12px; font-weight: 550; color: var(--hvl-fg3); cursor: pointer; }
.hvl-seg button.is-active { background: color-mix(in oklab, var(--hvl-accent) 13%, transparent); color: var(--hvl-fg); }
.hvl-check { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--hvl-fg2); cursor: pointer; user-select: none; }
.hvl-check input { accent-color: var(--hvl-accent); }

/* Speak */
.hvl-textarea { width: 100%; min-height: 84px; resize: vertical; border-radius: 8px; border: 1px solid var(--hvl-line); background: transparent; color: inherit;
  font: 14px/1.5 var(--hvl-sans); padding: 10px 12px; }
.hvl-textarea:focus, .hvl-input:focus { outline: none; border-color: var(--hvl-accent); box-shadow: 0 0 0 3px color-mix(in oklab, var(--hvl-accent) 15%, transparent); }
.hvl-input { height: 30px; border-radius: 8px; border: 1px solid var(--hvl-line); background: transparent; color: inherit; font: 13px var(--hvl-sans); padding: 0 10px; }
.hvl-phones { display: flex; flex-wrap: wrap; gap: 8px 10px; }
.hvl-chart { display: grid; gap: 2px; overflow-x: auto; }
.hvl-chart-row { display: grid; grid-template-columns: 74px repeat(9, minmax(40px, 1fr)); gap: 2px; }
.hvl-chart-head { font-size: 10.5px; color: var(--hvl-fg3); padding: 4px 4px; align-self: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hvl-chart-cell { display: flex; flex-wrap: wrap; gap: 2px; padding: 2px; min-height: 30px; border-radius: 6px; background: var(--hvl-bg2, rgba(127,127,127,.06)); }
.hvl-chart-cell .hvl-ph { cursor: pointer; border-top: 0; border-left: 0; border-right: 0; }
.hvl-word { display: flex; flex-direction: column; gap: 3px; }
.hvl-word > span { font-size: 10.5px; color: var(--hvl-fg3); }
.hvl-word.is-guess > span { color: var(--hvl-warm); }
.hvl-word > div { display: flex; gap: 2px; }
.hvl-ph { font: 500 12.5px var(--hvl-mono); padding: 2px 5px; border-radius: 5px; background: color-mix(in oklab, var(--hvl-fg) 5%, transparent); color: var(--hvl-fg2);
  border-bottom: 2px solid var(--c, transparent); transition: background .08s; }
.hvl-ph.is-now { background: var(--hvl-accent); color: var(--ui-bg-elevated, #fff); }
.hvl-ph.is-stress { font-weight: 700; color: var(--hvl-fg); }
.hvl-legend { display: flex; gap: 10px; flex-wrap: wrap; font-size: 10.5px; color: var(--hvl-fg3); }
.hvl-legend i { display: inline-block; width: 10px; height: 3px; border-radius: 2px; background: var(--c); margin-right: 4px; vertical-align: middle; }
.hvl-warning { font-size: 11.5px; color: var(--hvl-warm); }
.hvl-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.hvl-chip { border: 1px solid var(--hvl-line2); background: transparent; border-radius: 99px; height: 26px; padding: 0 11px; font-size: 11.5px; color: var(--hvl-fg2); cursor: pointer; }
.hvl-chip:hover { border-color: var(--hvl-accent); color: var(--hvl-fg); }
.hvl-timeline { width: 100%; height: 150px; display: block; border-radius: 8px; border: 1px solid var(--hvl-line2); }

/* Sing */
.hvl-roll { position: relative; border: 1px solid var(--hvl-line); border-radius: 8px; overflow: auto; height: 260px; touch-action: none; }
.hvl-roll canvas { display: block; }

/* Scopes */
.hvl-scopes { display: grid; grid-template-columns: 1.3fr 1.3fr 0.95fr 1.05fr; gap: 14px; }
.hvl-scope { padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.hvl-scope header { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; }
.hvl-scope header small { font: 500 10px var(--hvl-mono); color: var(--hvl-fg4); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hvl-scope canvas { width: 100%; height: 112px; display: block; }
.hvl-glottal { display: flex; gap: 10px; align-items: center; min-width: 0; }
.hvl-glottal canvas { flex: 1; min-width: 0; }
.hvl-folds { margin: 0; display: flex; flex-direction: column; align-items: center; gap: 2px; flex: none; }
.hvl-folds svg { width: 72px; height: 72px; }
.hvl-folds figcaption { font: 500 8.5px var(--hvl-mono); color: var(--hvl-fg4); letter-spacing: .04em; white-space: nowrap; }
.hvl-folds-ring { fill: color-mix(in oklab, var(--hvl-accent) 6%, transparent); stroke: var(--hvl-line); }
.hvl-glottis { fill: var(--hvl-ink); opacity: .85; }
.hvl-fold-l, .hvl-fold-r { fill: var(--hvl-flesh); stroke: var(--hvl-accent); stroke-width: 1; }
.hvl-badge { font: 600 8.5px var(--hvl-mono); letter-spacing: .1em; text-transform: uppercase; padding: 2px 5px; border-radius: 4px; border: 1px solid var(--hvl-line);
  color: var(--hvl-fg3); white-space: nowrap; }
.hvl-badge.is-measured { border-color: color-mix(in oklab, var(--hvl-good) 50%, transparent); color: var(--hvl-good); }
.hvl-badge.is-model { border-color: color-mix(in oklab, var(--hvl-accent) 50%, transparent); color: var(--hvl-accent); }

/* Keyboard */
.hvl-keys-card { padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 8px; }
.hvl-keys { position: relative; height: 92px; display: flex; user-select: none; touch-action: none; }
.hvl-key { flex: 1; border: 1px solid var(--hvl-line); border-left-width: 0; background: var(--hvl-skin); border-radius: 0 0 6px 6px; position: relative; cursor: pointer;
  display: flex; align-items: flex-end; justify-content: center; padding-bottom: 6px; font: 500 9.5px var(--hvl-mono); color: var(--hvl-fg4); }
.hvl-key:first-child { border-left-width: 1px; }
.hvl-key.is-down { background: color-mix(in oklab, var(--hvl-accent) 22%, var(--hvl-skin)); }
.hvl-key.is-black { position: absolute; top: 0; height: 58%; width: calc(100% / var(--whites) * .62); background: var(--hvl-ink); border: 0; z-index: 2;
  color: color-mix(in oklab, var(--hvl-skin) 60%, transparent); border-radius: 0 0 5px 5px; }
.hvl-key.is-black.is-down { background: var(--hvl-accent); }
.hvl-key .hint { position: absolute; top: 6px; left: 0; right: 0; text-align: center; font-size: 9px; color: var(--hvl-fg4); }
.hvl-key.is-black .hint { color: color-mix(in oklab, var(--hvl-skin) 55%, transparent); }

.hvl-toast { position: fixed; right: 22px; bottom: 22px; z-index: 50; display: flex; gap: 10px; align-items: center; padding: 10px 12px 10px 14px; border-radius: 10px;
  border: 1px solid var(--hvl-line); background: var(--ui-bg-elevated, #fff); box-shadow: 0 8px 30px rgba(0,0,0,.14); font-size: 12.5px; max-width: 420px; animation: hvl-rise .2s ease-out; }
@keyframes hvl-rise { from { transform: translateY(8px); opacity: 0; } }
.hvl-empty { color: var(--hvl-fg3); font-size: 12px; }

@container (max-width: 1060px) {
  .hvl-scopes { grid-template-columns: 1fr 1fr; }
}
@container (max-width: 860px) {
  .hvl-main { grid-template-columns: 1fr; }
  .hvl-stage { min-height: 380px; }
  .hvl-play-grid { grid-template-columns: 1fr; }
  .hvl-pad { max-width: 260px; }
}
@container (max-width: 520px) {
  .hvl-shell { padding: 12px; }
  .hvl-scopes { grid-template-columns: 1fr; }
  .hvl-actions { width: 100%; }
  .hvl-keys { height: 76px; }
  .hvl-now { position: static; width: auto; margin: 0 12px 8px; }
  .hvl-portrait-wrap { flex-direction: column; }
}
`;
