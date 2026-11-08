var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// audio/engine.js
function validateParams(params = {}) {
  const result = {};
  for (const [key, value] of Object.entries(params)) {
    if (!PARAMS[key]) throw new TypeError(`Unknown parameter: ${key}`);
    const [lo, hi] = PARAMS[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < lo || value > hi) throw new RangeError(`${key} must be between ${lo} and ${hi}`);
    result[key] = value;
  }
  return result;
}
function createEngine(wasmBytes2, sampleRate = 48e3, seed = 1) {
  if (!Number.isFinite(sampleRate) || sampleRate < 8e3 || sampleRate > 192e3) throw new RangeError("Sample rate must be 8000\u2013192000 Hz");
  const module = wasmBytes2 instanceof WebAssembly.Module ? wasmBytes2 : new WebAssembly.Module(wasmBytes2);
  const { exports: e } = new WebAssembly.Instance(module, {});
  e.init(sampleRate, seed);
  return {
    sampleRate,
    setParams(params) {
      for (const [key, value] of Object.entries(validateParams(params))) e.set_param(names.indexOf(key), value);
    },
    render(frames) {
      if (!Number.isInteger(frames) || frames < 0 || frames > 4096) throw new RangeError("Render block must be 0\u20134096 frames");
      return new Float32Array(e.memory.buffer, e.render(frames), frames);
    },
    getParams() {
      return Object.fromEntries(names.map((name, id) => [name, e.current_param(id)]));
    },
    getGeometry() {
      return new Float32Array(e.memory.buffer, e.geometry(), 44).slice();
    },
    reset(seed2 = 1) {
      e.init(sampleRate, seed2);
    }
  };
}
function normalizeEvents(events = []) {
  if (!Array.isArray(events) || events.length > 1e4) throw new TypeError("Expected at most 10000 events");
  return events.map((event) => {
    const { time, duration } = event;
    if (!Number.isFinite(time) || time < 0 || !Number.isFinite(duration) || duration <= 0 || time + duration > 300) throw new RangeError("Events must fit within 300 seconds");
    return { time, duration, params: validateParams(event.params) };
  }).sort((a, b) => a.time - b.time);
}
var PARAMS, DEFAULT_PARAMS, VOWELS, names, Timeline;
var init_engine = __esm({
  "audio/engine.js"() {
    "use strict";
    PARAMS = Object.freeze({ tongueX: [0, 1], tongueY: [0, 1], jaw: [0, 1], lip: [0, 1], pitch: [80, 400], breath: [0, 1], vibrato: [0, 1], gain: [0, 1], gate: [0, 1], voicing: [0, 1], frication: [0, 1], nasal: [0, 1] });
    DEFAULT_PARAMS = Object.freeze({ tongueX: 0.58, tongueY: 0.42, jaw: 0.44, lip: 0.64, pitch: 205, breath: 0.16, vibrato: 0.12, gain: 0.65, gate: 0, voicing: 1, frication: 0, nasal: 0 });
    VOWELS = Object.freeze({
      ah: { label: "Ah", params: { tongueX: 0.28, tongueY: 0.5, jaw: 0.95, lip: 0.85 } },
      ee: { label: "Ee", params: { tongueX: 0.85, tongueY: 0.96, jaw: 0.13, lip: 0.65 } },
      oo: { label: "Oo", params: { tongueX: 0.43, tongueY: 0.83, jaw: 0.18, lip: 0.06 } },
      eh: { label: "Eh", params: { tongueX: 0.73, tongueY: 0.65, jaw: 0.57, lip: 0.7 } },
      oh: { label: "Oh", params: { tongueX: 0.31, tongueY: 0.61, jaw: 0.6, lip: 0.2 } }
    });
    names = Object.keys(PARAMS);
    Timeline = class {
      constructor(engine, events, { loop = false } = {}) {
        this.engine = engine;
        this.events = normalizeEvents(events);
        this.frame = 0;
        this.index = 0;
        this.off = Infinity;
        this.loop = loop;
        this.end = Math.max(0, ...this.events.map((e) => Math.round((e.time + e.duration) * engine.sampleRate)));
        this.engine.setParams({ gate: 0 });
      }
      render(frames, out = new Float32Array(frames)) {
        let offset = 0;
        while (offset < frames) {
          if (this.loop && this.end > 0 && this.frame >= this.end) {
            this.frame = 0;
            this.index = 0;
            this.off = Infinity;
          }
          if (this.frame >= this.off) {
            this.engine.setParams({ gate: 0 });
            this.off = Infinity;
          }
          while (this.index < this.events.length && Math.round(this.events[this.index].time * this.engine.sampleRate) <= this.frame) {
            const e = this.events[this.index++];
            this.engine.setParams({ gate: 1, ...e.params });
            this.off = Math.round((e.time + e.duration) * this.engine.sampleRate);
          }
          const next = this.index < this.events.length ? Math.round(this.events[this.index].time * this.engine.sampleRate) : Infinity;
          let count = Math.min(frames - offset, 4096, next - this.frame, this.off - this.frame, this.loop && this.end > 0 ? this.end - this.frame : Infinity);
          count = Math.max(1, count);
          out.set(this.engine.render(count), offset);
          offset += count;
          this.frame += count;
        }
        return out;
      }
    };
  }
});

// audio/offline.js
var offline_exports = {};
__export(offline_exports, {
  encodeWav: () => encodeWav,
  renderFloat: () => renderFloat,
  renderWav: () => renderWav
});
function renderFloat(wasmBytes2, project = {}, options2 = {}) {
  const sampleRate = options2.sampleRate || project.sampleRate || 48e3;
  const events = normalizeEvents(project.events || []);
  const duration = options2.duration ?? project.duration ?? (events.length ? Math.max(...events.map((e) => e.time + e.duration)) + 0.25 : 3);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 300) throw new RangeError("Duration must be greater than 0 and at most 300 seconds");
  const engine = createEngine(wasmBytes2, sampleRate, options2.seed ?? 1);
  engine.setParams({ ...DEFAULT_PARAMS, ...validateParams(project.patch || {}), gate: events.length ? 0 : 1 });
  const timeline = events.length ? new Timeline(engine, events) : null;
  const samples = new Float32Array(Math.ceil(duration * sampleRate));
  for (let i = 0; i < samples.length; i += 4096) {
    const n = Math.min(4096, samples.length - i);
    samples.set(timeline ? timeline.render(n) : engine.render(n), i);
  }
  let peak = 0, sum = 0;
  for (const x of samples) {
    peak = Math.max(peak, Math.abs(x));
    sum += x * x;
  }
  return { samples, sampleRate, frames: samples.length, duration: samples.length / sampleRate, peak, rms: Math.sqrt(sum / samples.length) };
}
function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2), view = new DataView(buffer);
  function str(at, s) {
    for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i));
  }
  str(0, "RIFF");
  view.setUint32(4, buffer.byteLength - 8, true);
  str(8, "WAVE");
  str(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  str(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const x = Number.isFinite(samples[i]) ? Math.max(-1, Math.min(1, samples[i])) : 0;
    view.setInt16(44 + i * 2, Math.round(x * (x < 0 ? 32768 : 32767)), true);
  }
  return buffer;
}
function renderWav(wasmBytes2, project, options2) {
  const rendered = renderFloat(wasmBytes2, project, options2);
  return { ...rendered, wav: encodeWav(rendered.samples, rendered.sampleRate) };
}
var init_offline = __esm({
  "audio/offline.js"() {
    "use strict";
    init_engine();
  }
});

// src/desktop.tsx
import React3, { useMemo } from "react";
import { host, useValue, captureGatewayFileDownload, ROUTES_AREA, SIDEBAR_NAV_AREA, PALETTE_AREA } from "@hermes/plugin-sdk";

// src/VoiceLab.tsx
import { useEffect, useRef as useRef2, useState } from "react";

// src/avatar.tsx
import { useRef } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
function Avatar({
  params,
  onChange,
  active,
  cutaway = true
}) {
  const ref = useRef(null);
  const j = params.jaw;
  const tx = 288 + params.tongueX * 51, ty = 254 - params.tongueY * 39;
  function drag(e, name) {
    e.currentTarget.setPointerCapture(e.pointerId);
    move(e, name);
  }
  function move(e, name) {
    if (e.buttons !== 1) return;
    const svg = ref.current;
    const p = svg.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    const q = p.matrixTransform(svg.getScreenCTM().inverse());
    const clamp = (v) => Math.max(0, Math.min(1, v));
    onChange(
      name === "tongue" ? { tongueX: clamp((q.x - 288) / 51), tongueY: clamp((254 - q.y) / 39) } : name === "jaw" ? { jaw: clamp((q.y - 257) / 39) } : { lip: clamp((q.x - 333) / 28) }
    );
  }
  const handle = (name, x, y, color) => /* @__PURE__ */ jsxs(
    "g",
    {
      className: "vl-handle",
      role: "slider",
      tabIndex: 0,
      "aria-label": `Drag ${name}`,
      "aria-valuemin": 0,
      "aria-valuemax": 100,
      "aria-valuenow": Math.round(
        (name === "tongue" ? params.tongueX : name === "jaw" ? j : params.lip) * 100
      ),
      onPointerDown: (e) => drag(e, name),
      onPointerMove: (e) => move(e, name),
      onKeyDown: (e) => {
        const d = e.key === "ArrowRight" || e.key === "ArrowUp" ? 0.04 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -0.04 : 0;
        if (!d) return;
        e.preventDefault();
        const key = name === "tongue" ? e.key === "ArrowUp" || e.key === "ArrowDown" ? "tongueY" : "tongueX" : name === "jaw" ? "jaw" : "lip";
        onChange({ [key]: Math.max(0, Math.min(1, params[key] + d)) });
      },
      children: [
        /* @__PURE__ */ jsx(
          "circle",
          {
            cx: x,
            cy: y,
            r: "12",
            fill: "var(--vl-paper)",
            stroke: color,
            strokeWidth: "2"
          }
        ),
        /* @__PURE__ */ jsx("circle", { cx: x, cy: y, r: "4", fill: color })
      ]
    }
  );
  return /* @__PURE__ */ jsxs(
    "svg",
    {
      ref,
      className: "vl-avatar",
      viewBox: "0 0 440 430",
      "aria-label": "Original right-facing Hermes character with interactive modeled vocal tract",
      children: [
        /* @__PURE__ */ jsx("defs", { children: /* @__PURE__ */ jsx(
          "pattern",
          {
            id: "vl-grid",
            width: "22",
            height: "22",
            patternUnits: "userSpaceOnUse",
            children: /* @__PURE__ */ jsx("circle", { cx: "1", cy: "1", r: ".65", fill: "var(--vl-line)" })
          }
        ) }),
        /* @__PURE__ */ jsx("rect", { width: "440", height: "430", fill: "url(#vl-grid)" }),
        /* @__PURE__ */ jsx("circle", { cx: "228", cy: "208", r: "163", fill: "none", stroke: "var(--vl-line)" }),
        /* @__PURE__ */ jsx(
          "path",
          {
            d: "M70 419 Q87 352 172 344 L188 302 260 304 274 351 Q332 360 350 419Z",
            fill: "#211e25"
          }
        ),
        /* @__PURE__ */ jsx(
          "path",
          {
            d: "M185 294 185 344 Q219 371 265 344 L255 283Z",
            fill: "#e9d3bd",
            stroke: "#211e25",
            strokeWidth: "2"
          }
        ),
        /* @__PURE__ */ jsx(
          "path",
          {
            d: "M129 170 Q123 94 210 81 Q291 80 312 144 L316 186 Q317 202 343 213 Q348 218 334 225 L338 237 Q350 244 339 250 L339 262 Q332 292 285 302 Q236 319 197 277 L161 251Z",
            fill: "#f1dfc9",
            stroke: "#211e25",
            strokeWidth: "2.5"
          }
        ),
        /* @__PURE__ */ jsx(
          "path",
          {
            d: "M188 276 Q228 319 285 302 Q332 292 339 262 L339 250 Q323 247 310 250 L319 264 Q310 286 279 285 Q226 287 200 263Z",
            fill: "#e4c8ad",
            transform: `translate(0 ${j * 15 - 5})`
          }
        ),
        /* @__PURE__ */ jsx(
          "path",
          {
            d: "M139 289 Q76 260 88 178 Q97 72 184 52 Q271 27 309 116 L312 166 276 157 272 128 264 159 234 155 230 126 222 158 196 164 188 132 Q171 181 159 212 L156 304 Q148 349 115 352 Q77 353 73 319 Q91 344 110 321 Q125 300 119 258Z",
            fill: "#211e25"
          }
        ),
        /* @__PURE__ */ jsx(
          "path",
          {
            d: "M164 60 Q229 39 277 111 L285 143 Q272 149 279 157 L271 171 Q292 159 291 148 L299 143 Q283 69 225 48Z",
            fill: "#fcf8ee"
          }
        ),
        /* @__PURE__ */ jsx(
          "path",
          {
            d: "M171 172 Q160 224 173 302 Q179 345 154 364 Q128 385 102 361 Q129 376 141 343 Q149 314 143 282 L142 179Z",
            fill: "#211e25"
          }
        ),
        /* @__PURE__ */ jsx(
          "path",
          {
            d: "M283 183 Q299 176 313 185 M288 188 Q300 194 310 186 L316 180",
            fill: "none",
            stroke: "#211e25",
            strokeWidth: "4",
            strokeLinecap: "round"
          }
        ),
        /* @__PURE__ */ jsx(
          "path",
          {
            d: "M298 187 300 198 M305 189 309 197",
            stroke: "#211e25",
            strokeWidth: "2"
          }
        ),
        /* @__PURE__ */ jsx(
          "path",
          {
            d: "M316 220 Q323 223 328 219",
            fill: "none",
            stroke: "#a27965",
            strokeWidth: "2"
          }
        ),
        /* @__PURE__ */ jsxs("g", { opacity: cutaway ? 1 : 0, "aria-hidden": !cutaway, children: [
          /* @__PURE__ */ jsx("path", { d: "M247 260 Q243 217 280 208 Q306 201 331 215", fill: "none", stroke: "#a45e3b", strokeWidth: 3 + (params.nasal || 0) * 5, opacity: ".65" }),
          /* @__PURE__ */ jsx("title", { children: "Stylized oral and nasal paths; airflow animation is slowed for illustration." }),
          /* @__PURE__ */ jsx(
            "path",
            {
              d: `M235 328 L235 268 Q237 230 273 228 L332 237 L${340 + params.lip * 8} ${242 + j * 7} L329 ${251 + j * 16} L282 ${264 + j * 8} Q259 267 258 291 L258 328Z`,
              fill: "#6a485f",
              fillOpacity: ".87",
              stroke: "#7b526a",
              strokeWidth: "1.5"
            }
          ),
          /* @__PURE__ */ jsx(
            "path",
            {
              d: `M259 286 Q261 256 ${tx} ${ty} Q321 ${ty - 7} 329 ${251 + j * 12} Q295 ${269 + j * 6} 259 286Z`,
              fill: "#c78e7f",
              stroke: "#e4b5a3",
              strokeWidth: "2"
            }
          )
        ] }),
        /* @__PURE__ */ jsx(
          "path",
          {
            d: `M331 237 Q${350 + params.lip * 9} 237 ${340 + params.lip * 8} ${242 + j * 7} M329 ${251 + j * 16} Q350 ${251 + j * 18} ${340 + params.lip * 8} ${246 + j * 9}`,
            fill: "none",
            stroke: "#8d4c57",
            strokeWidth: "3"
          }
        ),
        cutaway && /* @__PURE__ */ jsx(
          "path",
          {
            d: "M246 326 246 287",
            stroke: "#f2ddbc",
            strokeWidth: active ? 5 : 2,
            strokeDasharray: "3 6",
            className: active ? "vl-air active" : "vl-air"
          }
        ),
        /* @__PURE__ */ jsxs("g", { fontFamily: "inherit", fontSize: "10", fill: "var(--vl-muted)", children: [
          /* @__PURE__ */ jsx(
            "path",
            {
              d: "M235 319 205 319 205 385",
              fill: "none",
              stroke: "var(--vl-line)"
            }
          ),
          /* @__PURE__ */ jsx("text", { x: "180", y: "400", children: "VOICE SOURCE" }),
          /* @__PURE__ */ jsx(
            "path",
            {
              d: "M358 227 392 227 392 187",
              fill: "none",
              stroke: "var(--vl-line)"
            }
          ),
          /* @__PURE__ */ jsx("text", { x: "370", y: "177", children: "LIPS" }),
          /* @__PURE__ */ jsx("path", { d: "M296 290 372 313", fill: "none", stroke: "var(--vl-line)" }),
          /* @__PURE__ */ jsx("text", { x: "375", y: "319", children: "JAW" })
        ] }),
        handle("tongue", tx, ty, "#f0c18a"),
        handle("jaw", 293, 257 + j * 39, "#986c90"),
        handle("lip", 333 + params.lip * 28, 244 + j * 10, "#b36e48"),
        /* @__PURE__ */ jsx(
          "text",
          {
            x: "20",
            y: "30",
            fill: "var(--vl-muted)",
            fontSize: "10",
            letterSpacing: "1.8",
            children: "DRAG THE THREE HANDLES"
          }
        )
      ]
    }
  );
}

// src/styles.ts
var styles = `
.voice-lab{--vl-paper:var(--ui-bg-primary,#f5f1e8);--vl-panel:var(--ui-bg-secondary,#ece7dc);--vl-ink:var(--ui-text-primary,#28232b);--vl-muted:var(--ui-text-secondary,#746b70);--vl-line:var(--ui-stroke-secondary,#d7d0c8);--vl-plum:#69465f;--vl-copper:#a45e3b;color:var(--vl-ink);background:var(--vl-paper);font-family:ui-sans-serif,system-ui,sans-serif;min-height:100vh;padding:28px 34px;box-sizing:border-box;color-scheme:normal;line-height:1.5}.voice-lab *{box-sizing:border-box}.voice-lab ::selection{background:#d7c0d0;color:#28232b}.voice-lab button,.voice-lab input,.voice-lab select,.voice-lab textarea{font:inherit}.voice-lab button{cursor:pointer;border:1px solid var(--vl-line);background:transparent;color:inherit;border-radius:5px;padding:8px 13px;font-size:12px;transition:background .15s}.voice-lab button:hover{background:var(--vl-panel)}.voice-lab button:disabled{opacity:.45;cursor:default}.voice-lab :focus-visible{outline:2px solid var(--vl-copper);outline-offset:4px}.voice-lab button.primary{background:var(--vl-plum);color:#fff7ed;border-color:var(--vl-plum)}.voice-lab button.primary:hover{background:#7b556e}.voice-lab button.selected{background:var(--vl-plum);border-color:var(--vl-plum);color:#fff7ed}.vl-head{display:flex;align-items:center;justify-content:space-between;gap:20px;padding-bottom:24px;border-bottom:1px solid var(--vl-line)}.vl-brand{display:flex;align-items:center;gap:14px}.vl-mark{width:38px;height:38px;color:var(--vl-plum)}.vl-head h1{font-family:Georgia,'Times New Roman',serif;font-size:29px;font-weight:400;letter-spacing:-.8px;margin:0;line-height:1.1}.vl-head p{margin:5px 0 0;font-size:11px;color:var(--vl-muted)}.vl-actions{display:flex;gap:7px;align-items:center}.vl-status{display:flex;align-items:center;gap:7px;font-size:11px;color:var(--vl-muted);margin-right:10px}.vl-dot{height:6px;width:6px;border-radius:50%;background:#a59e96}.vl-dot.on{background:#668468}.vl-studio{display:grid;grid-template-columns:minmax(320px,1fr) minmax(330px,1fr);border-bottom:1px solid var(--vl-line)}.vl-character{position:relative;border-right:1px solid var(--vl-line);padding:22px 26px 14px 0;display:flex;flex-direction:column;justify-content:center}.vl-avatar{width:100%;max-height:460px;overflow:visible;touch-action:none}.vl-handle{cursor:grab;outline:none}.vl-handle:focus circle:first-child,.vl-handle:hover circle:first-child{stroke-width:4}.vl-handle:active{cursor:grabbing}.vl-character-caption{display:flex;justify-content:space-between;gap:8px;font-size:10px;color:var(--vl-muted)}.vl-character-caption span:first-child{color:var(--vl-plum)}.vl-control{padding:26px 0 26px 30px}.vl-section-heading{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:18px}.vl-section-heading h2{font-size:17px;font-weight:500;letter-spacing:-.35px;margin:0}.vl-section-heading small{font-size:10px;color:var(--vl-muted)}.vl-vowels{display:flex;gap:7px;margin-bottom:26px}.vl-vowels button{flex:1;padding:9px 5px;font-size:20px;font-family:Georgia,serif}.vl-vowels small{display:block;font-family:inherit;font-size:10px}.vl-sliders{display:grid;grid-template-columns:1fr 1fr;gap:16px 25px}.vl-range{display:block;min-width:0}.vl-range-header{display:flex;align-items:center;justify-content:space-between;font-size:11px;margin-bottom:7px}.vl-range output{color:var(--vl-muted);font-variant-numeric:tabular-nums;font-size:10px}.voice-lab input[type=range]{appearance:none;height:3px;width:100%;background:var(--vl-line);accent-color:var(--vl-plum);display:block;margin:12px 0;cursor:pointer}.voice-lab input[type=range]::-webkit-slider-thumb{appearance:none;width:12px;height:12px;border-radius:50%;background:var(--vl-plum);border:2px solid var(--vl-paper);box-shadow:0 0 0 1px var(--vl-plum)}.vl-hold-row{display:flex;gap:10px;margin-top:22px}.vl-hold-row button:first-child{flex:1;font-size:13px;padding:12px;touch-action:none}.vl-hold-row button.held{background:var(--vl-copper);border-color:var(--vl-copper)}.vl-scope{margin-top:20px;height:66px;width:100%;display:block;background:var(--vl-panel);border-radius:4px}.vl-scope-caption{display:flex;justify-content:space-between;color:var(--vl-muted);font-size:9px;margin-top:5px}.vl-lower{display:grid;grid-template-columns:1.15fr 1fr;gap:30px;padding-top:26px}.vl-piano{display:flex;height:94px;position:relative;gap:3px}.voice-lab .vl-key{flex:1;position:relative;border-radius:0 0 4px 4px;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;padding:8px 0;background:var(--vl-panel);font-size:11px;touch-action:none}.voice-lab .vl-key.down{background:var(--vl-plum);color:#fff}.vl-key small{font-size:9px;opacity:.65}.vl-sequence{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:5px}.vl-step{background:var(--vl-panel);padding:7px 4px;border-radius:4px;min-width:0;border:1px solid transparent}.vl-step.playing{border-color:var(--vl-copper)}.vl-step.off{opacity:.45}.voice-lab .vl-step button{border:0;padding:0;width:100%;font-size:10px;text-align:center;margin-bottom:4px}.voice-lab .vl-step select{font-size:10px;border:0;background:transparent;color:inherit;width:100%;padding:2px 0;cursor:pointer}.vl-seq-actions{display:flex;gap:8px;align-items:center;margin-top:13px}.vl-tempo{display:flex;align-items:center;gap:5px;font-size:10px;color:var(--vl-muted);margin-left:auto}.vl-tempo input{width:48px;border:1px solid var(--vl-line);border-radius:4px;background:transparent;padding:4px;color:var(--vl-ink);font-size:11px}.vl-speech{margin-top:24px;padding-top:20px;border-top:1px solid var(--vl-line)}.vl-speech-row{display:flex;gap:8px}.vl-speech select{background:var(--vl-panel);color:inherit;border:1px solid var(--vl-line);border-radius:4px;padding:7px;font-size:11px;max-width:125px}.vl-speech input{flex:1;min-width:0;background:transparent;color:inherit;padding:9px 11px;border:1px solid var(--vl-line);border-radius:4px;font-size:12px}.vl-footnote{font-size:10px;color:var(--vl-muted);margin:8px 0 0;max-width:70ch}.vl-footer{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-top:24px;padding-top:14px;border-top:1px solid var(--vl-line);font-size:10px;color:var(--vl-muted)}.vl-message{min-height:16px}.vl-air.active{animation:vl-flow 1s linear infinite}@keyframes vl-flow{to{stroke-dashoffset:-18}}.voice-lab input::placeholder{color:var(--vl-muted)}@media(prefers-reduced-motion:reduce){.vl-air.active{animation:none}}@media(max-width:760px){.voice-lab{padding:20px}.vl-head{align-items:flex-start;flex-wrap:wrap;padding-bottom:18px}.vl-head h1{font-size:25px}.vl-actions{flex-wrap:wrap}.vl-studio{grid-template-columns:1fr}.vl-character{border-right:0;border-bottom:1px solid var(--vl-line);padding:12px 0}.vl-avatar{max-height:390px}.vl-control{padding:24px 0}.vl-lower{grid-template-columns:1fr;gap:25px}.vl-footer{align-items:flex-start}.vl-status{margin-right:0}}@media(min-width:1200px){.voice-lab{padding:32px 5vw}.vl-avatar{max-height:500px}.vl-control{padding:34px 0 30px 45px}.vl-sliders{gap:20px 32px}}
`;

// audio/client.js
init_engine();
var VoiceAudio = class {
  /** @param {{wasmBytes?: Uint8Array | ArrayBuffer, workletSource?: string, onGeometry?: (data: {params:Record<string,number>,areas:number[],rms:number,peak:number,time:number}) => void, onState?: (state:string,error?:string) => void}} options */
  constructor({ wasmBytes: wasmBytes2, workletSource: workletSource2, onGeometry = () => {
  }, onState = () => {
  } } = {}) {
    Object.assign(this, { wasmBytes: wasmBytes2, workletSource: workletSource2, onGeometry, onState });
    this.params = { ...DEFAULT_PARAMS };
    this.context = null;
    this.node = null;
    this.analyser = null;
    this.generation = 0;
    this.pending = null;
  }
  async start(params = {}) {
    this.setParams(params);
    if (this.pending) return this.pending;
    if (this.context && this.node) {
      await this.context.resume();
      return;
    }
    const generation = ++this.generation;
    this.onState("starting");
    const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Context) throw new Error("This browser does not support Web Audio");
    const context = new Context({ latencyHint: "interactive" });
    this.context = context;
    const resume = context.resume();
    this.pending = (async () => {
      let url;
      try {
        const bytes = this.wasmBytes || await fetch(new URL("./hermes_tract.wasm", import.meta.url)).then((r) => {
          if (!r.ok) throw new Error("Cannot load voice engine");
          return r.arrayBuffer();
        });
        url = this.workletSource ? URL.createObjectURL(new Blob([this.workletSource], { type: "text/javascript" })) : new URL("./voice-worklet.js", import.meta.url).href;
        await context.audioWorklet.addModule(url);
        await resume;
        if (generation !== this.generation) {
          await context.close().catch(() => {
          });
          return;
        }
        this.node = new AudioWorkletNode(context, "hermes-voice", { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1], processorOptions: { wasmBytes: bytes, params: this.params } });
        this.analyser = context.createAnalyser();
        this.analyser.fftSize = 2048;
        this.node.connect(this.analyser);
        this.analyser.connect(context.destination);
        this.node.port.onmessage = ({ data }) => {
          if (data.type === "geometry") this.onGeometry(data);
          if (data.type === "error") this.onState("error", data.message);
        };
        this.node.onprocessorerror = () => this.onState("error", "The audio processor stopped");
        this.onState("running");
      } catch (error) {
        await context.close().catch(() => {
        });
        if (generation === this.generation) {
          this.context = null;
          this.onState("error", error.message);
        }
        throw error;
      } finally {
        if (this.workletSource && url) URL.revokeObjectURL(url);
        if (generation === this.generation) this.pending = null;
      }
    })();
    return this.pending;
  }
  setParams(params) {
    Object.assign(this.params, validateParams(params));
    this.node?.port.postMessage({ type: "params", params });
  }
  noteOn(midi) {
    this.cancelSequence();
    this.setParams({ pitch: Math.max(80, Math.min(400, 440 * 2 ** ((midi - 69) / 12))), gate: 1 });
  }
  noteOff() {
    this.cancelSequence();
    this.setParams({ gate: 0 });
  }
  playSequence(events, { loop = false } = {}) {
    if (!this.node) throw new Error("Start audio before playing a sequence");
    this.node.port.postMessage({ type: "sequence", events: normalizeEvents(events), loop });
  }
  cancelSequence() {
    this.node?.port.postMessage({ type: "cancel" });
  }
  async stop() {
    ++this.generation;
    const context = this.context;
    this.node?.port.close();
    this.node?.disconnect();
    this.analyser?.disconnect();
    this.context = null;
    this.node = null;
    this.analyser = null;
    this.pending = null;
    this.params.gate = 0;
    if (context && context.state !== "closed") await context.close().catch(() => {
    });
    this.onState("idle");
  }
};

// src/VoiceLab.tsx
init_engine();

// audio/planner.js
var vowels = {
  AA: { tongueX: 0.4, tongueY: 0.2, jaw: 0.8, lip: 0.8 },
  AE: { tongueX: 0.7, tongueY: 0.3, jaw: 0.65, lip: 0.85 },
  AH: { tongueX: 0.5, tongueY: 0.35, jaw: 0.5, lip: 0.65 },
  EH: { tongueX: 0.7, tongueY: 0.55, jaw: 0.45, lip: 0.8 },
  IH: { tongueX: 0.8, tongueY: 0.65, jaw: 0.3, lip: 0.7 },
  IY: { tongueX: 0.9, tongueY: 0.85, jaw: 0.2, lip: 0.8 },
  OW: { tongueX: 0.3, tongueY: 0.5, jaw: 0.4, lip: 0.25 },
  UH: { tongueX: 0.3, tongueY: 0.65, jaw: 0.25, lip: 0.3 },
  UW: { tongueX: 0.2, tongueY: 0.8, jaw: 0.2, lip: 0.15 },
  ER: { tongueX: 0.45, tongueY: 0.75, jaw: 0.3, lip: 0.4 }
};
var consonants = {
  M: { lip: 0.02, jaw: 0.08, nasal: 0.95 },
  N: { tongueX: 0.96, tongueY: 1, jaw: 0.2, nasal: 0.9 },
  NG: { tongueX: 0.25, tongueY: 1, jaw: 0.2, nasal: 0.9 },
  S: { tongueX: 0.97, tongueY: 0.96, jaw: 0.18, lip: 0.6, voicing: 0, frication: 0.75 },
  Z: { tongueX: 0.97, tongueY: 0.96, jaw: 0.18, lip: 0.6, voicing: 0.5, frication: 0.5 },
  SH: { tongueX: 0.75, tongueY: 0.95, jaw: 0.25, lip: 0.35, voicing: 0, frication: 0.6 },
  F: { lip: 0.08, jaw: 0.18, voicing: 0, frication: 0.45 },
  V: { lip: 0.08, jaw: 0.18, voicing: 0.5, frication: 0.3 },
  HH: { voicing: 0, breath: 0.8, frication: 0.12 },
  L: { tongueX: 0.9, tongueY: 0.8, jaw: 0.4 },
  R: { tongueX: 0.45, tongueY: 0.85, lip: 0.4, jaw: 0.3 },
  W: { tongueX: 0.25, tongueY: 0.8, lip: 0.1, jaw: 0.15 },
  Y: { tongueX: 0.9, tongueY: 0.8, jaw: 0.2, lip: 0.65 },
  B: { lip: 0.02, jaw: 0.1, voicing: 0.5 },
  P: { lip: 0.02, jaw: 0.1, voicing: 0 },
  D: { tongueX: 0.97, tongueY: 1, jaw: 0.1, voicing: 0.5 },
  T: { tongueX: 0.97, tongueY: 1, jaw: 0.1, voicing: 0 },
  G: { tongueX: 0.25, tongueY: 1, jaw: 0.15, voicing: 0.5 },
  K: { tongueX: 0.25, tongueY: 1, jaw: 0.15, voicing: 0 }
};
var diphthongs = { AY: ["AA", "IY"], EY: ["EH", "IY"], AW: ["AA", "UW"], OY: ["OW", "IY"] };
var LEXICON = Object.freeze({
  hello: "HH EH L OW",
  hermes: "HH ER M IY Z",
  voice: "V OY S",
  lab: "L AE B",
  we: "W IY",
  sing: "S IH NG",
  a: "AH",
  an: "AE N",
  new: "N UW",
  tune: "T UW N",
  warm: "W OW R M",
  light: "L AY T",
  moon: "M UW N",
  blue: "B L UW",
  soft: "S AA F T",
  sound: "S AW N D",
  my: "M AY",
  your: "Y OW R",
  is: "IH Z",
  in: "IH N",
  me: "M IY",
  you: "Y UW",
  love: "L AH V",
  one: "W AH N",
  two: "T UW",
  three: "T R IY",
  four: "F OW R",
  good: "G UH D",
  morning: "M OW R N IH NG",
  night: "N AY T",
  low: "L OW",
  high: "HH AY",
  now: "N AW",
  yes: "Y EH S",
  no: "N OW"
});
var SUPPORTED_PHONEMES = Object.freeze([...Object.keys(vowels), ...Object.keys(consonants), ...Object.keys(diphthongs), "SIL"]);
var base = { voicing: 1, frication: 0, nasal: 0, breath: 0.16, gate: 1 };
function options(opts = {}) {
  const pitch = opts.pitch ?? 205, rate = opts.rate ?? 1;
  if (!Number.isFinite(pitch) || pitch < 80 || pitch > 400) throw new Error("Pitch must be 80\u2013400 Hz.");
  if (!Number.isFinite(rate) || rate < 0.5 || rate > 2) throw new Error("Speech rate must be 0.5\u20132.");
  return { pitch, rate };
}
function tokens(input) {
  if (typeof input !== "string" || input.length > 2e3) throw new Error("Use at most 2,000 characters.");
  return input.toUpperCase().trim().split(/\s+/).filter(Boolean);
}
function planPhonemes(input, opts = {}) {
  const { pitch, rate } = options(opts), units = tokens(input), events = [];
  const unsupported = units.filter((p) => !SUPPORTED_PHONEMES.includes(p));
  if (unsupported.length) return { events: [], duration: 0, unsupported: [...new Set(unsupported)] };
  let time = 0;
  const push = (phone, duration, extra = {}) => {
    events.push({ time, duration, params: { ...base, ...vowels.AH, ...vowels[phone] || consonants[phone] || {}, pitch, ...extra } });
    time += duration;
  };
  for (const phone of units) {
    if (phone === "SIL") {
      push(phone, 0.1 / rate, { gate: 0 });
      continue;
    }
    if (diphthongs[phone]) {
      for (const p of diphthongs[phone]) push(p, 0.09 / rate);
      continue;
    }
    const stop = /^[BPDTGK]$/.test(phone);
    push(phone, (vowels[phone] ? 0.18 : stop ? 0.055 : 0.085) / rate);
    if (stop) push(phone, 0.025 / rate, { voicing: 0, frication: 0.45, lip: 0.6, tongueY: 0.5 });
  }
  return { events, duration: time, unsupported: [] };
}
function planText(text, opts = {}) {
  if (typeof text !== "string" || text.length > 2e3) throw new Error("Use at most 2,000 characters.");
  const words = text.toLowerCase().match(/[a-z]+|[.,!?;]/g) || [];
  const unsupported = words.filter((w) => /^[a-z]/.test(w) && !LEXICON[w]);
  if (unsupported.length) return { events: [], duration: 0, unsupported: [...new Set(unsupported)] };
  return planPhonemes(words.map((w) => LEXICON[w] || "SIL").join(" "), opts);
}
function planLyrics(text, notes, opts = {}) {
  const words = text.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!Array.isArray(notes) || notes.length !== words.length) throw new Error("Provide one note per lyric word.");
  const events = [], unsupported = [];
  let time = 0;
  words.forEach((word, i) => {
    const note = notes[i];
    if (!Number.isFinite(note.duration) || note.duration < 0.12 || note.duration > 8) throw new Error("Note duration must be 0.12\u20138 seconds.");
    const plan = planText(word, { ...opts, pitch: note.pitch });
    unsupported.push(...plan.unsupported);
    if (plan.events.length) {
      const voiced = plan.events.filter((e) => e.duration >= 0.089);
      const stretch = Math.max(0.25, (note.duration - plan.events.filter((e) => !voiced.includes(e)).reduce((s, e) => s + e.duration, 0)) / Math.max(1e-3, voiced.reduce((s, e) => s + e.duration, 0)));
      const durations = plan.events.map((e) => e.duration * (voiced.includes(e) ? stretch : 1));
      const scale = note.duration / durations.reduce((s, d) => s + d, 0);
      plan.events.forEach((e, j) => {
        const duration = durations[j] * scale;
        events.push({ ...e, time, duration });
        time += duration;
      });
    } else time += note.duration;
  });
  return { events: unsupported.length ? [] : events, duration: time, unsupported: [...new Set(unsupported)] };
}

// src/embedded.ts
var wasmBytes = Uint8Array.from(atob("AGFzbQEAAAABaRFgAn9/AGADf39/AX9gAn9/AX9gAX8AYAN/f38AYAF/AXxgAAF/YAJ8fwBgAX8Bf2ACf3wAYAR/f39/AX9gAABgBX9/f39/AGAGf39/f39/AGAGf39/f39/AX9gBX9/f39/AX9gAXwBfANSUQMEBQYHCAkCBAoLAgwAAwMDAwMDDQwAAAICCAsEAwoAAAMAAAAIAAACAAAAAgIBAAAAAQQAAAsEAgoEBA4CDwEBAgMCAwIEEBAOCRAQEBAQEAQFAXABFRUFAwEAEQYJAX8BQYCAwAALB0EGBm1lbW9yeQIADWN1cnJlbnRfcGFyYW0AAghnZW9tZXRyeQADBGluaXQABAZyZW5kZXIABQlzZXRfcGFyYW0ABgkaAQBBAQsUFg4uLTIsKykqDygwLzEnJkFDRTgK7OEBUdwEBwN8AX8EfAF/AXwBfQF/IAArA/CAASIBRDMzMzMzM+M/oiAAKwP4gAEiAiACokTNzMzMzMwIQKJEexSuR+F6xD+goCEDIABBwIoBaiEEIAFEAAAAAAAA+D+iIQUgACsD6IABRKRwPQrXo+g/okSamZmZmZnJP6AhBiAAKwPggAEiAUQAAAAAAADgP6JE7FG4HoXr0T+gIQdEAAAAAAAA8D8gAaFECtejcD0Kpz+iRLgehetRuL4/oCEIQQAhCUQAAAAAAAAAACECA0AgBCAJakQAAAAAAAAgQER7FK5H4Xq0PyADRAAAAAAAAPA/RAAAAAAAAAAAIAJEAAAAAACARUCjIgFE4XoUrkfh6r+gRHsUrkfhesQ/oyIKIApEAAAAAAAAAABjGyIKIApEAAAAAAAA8D9kGyIKokQAAAAAAADwPyAKoSAFIAGiIAFEGC1EVPshCUCiEMyAgIAAIgogCqJEZmZmZmZm/j+iRM3MzMzMzPA/oKBEAAAAAAAA8D8gBiABIAehIAijIgEgAaJEAAAAAAAA4L+iEMiAgIAAoqGioqAiASABRHsUrkfherQ/YxsiASABRAAAAAAAACBAZBu2OAIAIAJEAAAAAAAA8D+gIQIgCUEEaiIJQbABRw0ACyAAQcSKAWohBCAAQcCKAWoqAgAhC0EAIQkCQANAIAAgCWoiDEH4iwFqIAu7IgIgBCoCALsiAaEgAiABoKM5AwAgCUHQAkYNASAMQYCMAWogASAEQQRqKgIAIgu7IgKhIAEgAqCjOQMAIARBCGohBCAJQRBqIQkMAAsLC/gYBgd/AXwCfyJ8AX0CfyOAgICAAEGACWsiAySAgICAACACQYAgIAJBgCBJGyEEAkAgAkUNACABQcSKAWohBSABQeiIAWohBiABQYCHAWohByABQcCKAWohCCADQQhqIQkgASsDiI8BIQogA0HABWpBCGohC0EAIQwDQCABKwOYjwEhDQJAIApEAAAAAAAA8D9mRQ0AIAErA7iBASEOIAErA7CBASEPIAErA6iBASEQIAErA6CBASERIAErA5iBASESIAErA5CBASETIAErA4iBASEUIAErA4CBASEVIAErA/iAASEWIAErA/CAASEXIAErA+iAASEYIAErA+CAASEZIAErA9iAASEaIAErA9CAASEbIAErA8iAASEcIAErA8CAASEdIAErA7iAASEeIAErA7CAASEfIAErA6iAASEgIAErA6CAASEhIAErA5iAASEiIAErA5CAASEjIAErA4iAASEkIAErA4CAASElAkADQCABIA05A5CPASAcIBChREPFOH8TCkE/oiEmIB0gEaFEQ8U4fxMKQT+iIScgEyAfIBOhREPFOH8TCkE/oqAhEyAgIBShREPFOH8TCkE/oiEoIBUgISAVoURDxTh/EwpBP6KgIRUgFiAiIBahREPFOH8TCkE/oqAhFiAXICMgF6FEQ8U4fxMKQT+ioCEXIBggJCAYoURDxTh/EwpBP6KgIRggGSAlIBmhREPFOH8TCkE/oqAhGQJAIAEoAqSPASICQR9xDQAgF0QzMzMzMzPjP6IgFiAWokTNzMzMzMwIQKJEexSuR+F6xD+goCEpIBdEAAAAAAAA+D+iISogGESkcD0K16PoP6JEmpmZmZmZyT+gISsgGUQAAAAAAADgP6JE7FG4HoXr0T+gISxEAAAAAAAA8D8gGaFECtejcD0Kpz+iRLgehetRuL4/oCEtRAAAAAAAAAAAIQpBACECA0AgCCACakQAAAAAAAAgQER7FK5H4Xq0PyApRAAAAAAAAPA/RAAAAAAAAAAAIApEAAAAAACARUCjIg1E4XoUrkfh6r+gRHsUrkfhesQ/oyIuIC5EAAAAAAAAAABjGyIuIC5EAAAAAAAA8D9kGyIuokQAAAAAAADwPyAuoSAqIA2iIA1EGC1EVPshCUCiEMyAgIAAIi4gLqJEZmZm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+UCjEMiAgIAAIQ0gASABKwOAjwEiLiAKIC6hRAAAAAAAAPA/IA2hoqAiCjkDgI8BRAAAAAAAAAAAIQ0CQCASIAqiRJqZmZmZmQFAoiIKvUL///////////8Ag0L/////////9/8AVQ0AIAogCplEAAAAAAAA8D+goyENCyABIA05A5iPASABIAErA4iPAUQAAAAAAADwv6AiCjkDiI8BIApEAAAAAAAA8D9mRQ0CDAELCyABIA45A7iBASABIA85A7CBASABIBA5A6iBASABIBE5A6CBASABIBI5A5iBASABIBM5A5CBASABIBQ5A4iBASABIBU5A4CBASABIBY5A/iAASABIBc5A/CAASABIBg5A+iAASABIBk5A+CAASACQSxB0IPAgAAQu4CAgAAACyABIA45A7iBASABIA85A7CBASABIBA5A6iBASABIBE5A6CBASABIBI5A5iBASABIBM5A5CBASABIBQ5A4iBASABIBU5A4CBASABIBY5A/iAASABIBc5A/CAASABIBg5A+iAASABIBk5A+CAAQsgASAMQQJ0aiABKwOQjwEiLiAKIA0gLqGioLY4AgAgASABKwOIjwFEAAAAAABk+UAgASsD8IsBo6AiCjkDiI8BIAxBAWoiAiEMIAIgBEcNAAsLIAAgBDYCBCAAIAE2AgAgA0GACWokgICAgAALWAEBfAJAQQAoAuCrwIAAQf////8HTw0ARAAAAAAAAAAAIQECQCAAQQtLDQBBACgC6KvAgABFDQAgAEEDdCsD0KzBgAAhAQsgAQ8LQZyCwIAAEMSAgIAAAAs2AAJAQQAoAuCrwIAAQf////8HSQ0AQcyCwIAAEMSAgIAAAAtBsLbBgABBAEEAKALoq8CAABsLvwMCAX8BfCOAgICAAEGwjwFrIgIkgICAgAAgAkGAjAFqQQBB2AL8CwAgAkGohAFqQQBB4AL8CwAgAkEIakEAQYCAAfwLACACQeiIAWpBAEGQA/wLACACRAAAAAAAcAdBRAAAAAAAQL9AIAAgAEQAAAAAAEC/QGMbIgMgA0QAAAAAAHAHQWQbRAAAAAAAcOdAIAC9Qv///////////wCDQoCAgICAgID4/wBTGzkD+IsBIAJBCGpBgIABakHwgsCAAEHgAPwKAAAgAkHogAFqQfCCwIAAQeAA/AoAACACQciBAWpBAEHgAvwL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wYAAIgJFDQBBtLzBgAAhAANAIAYgACgCACIIIAAoAgQiB2pGDQIgACgCCCIADQAMAwsLAkACQEEAKALwvsGAACIARQ0AIAYgAE8NAQtBACAGNgLwvsGAAAtBAEH/HzYC9L7BgABBACAFNgLAvMGAAEEAIAk2Ari8wYAAQQAgBjYCtLzBgABBAEHEvMGAADYC0LzBgABBAEHMvMGAADYC2LzBgABBAEHEvMGAADYCzLzBgABBAEHUvMGAADYC4LzBgABBAEHMvMGAADYC1LzBgABBAEHcvMGAADYC6LzBgABBAEHUvMGAADYC3LzBgABBAEHkvMGAADYC8LzBgABBAEHcvMGAADYC5LzBgABBAEHsvMGAADYC+LzBgABBAEHkvMGAADYC7LzBgABBAEH0vMGAADYCgL3BgABBAEHsvMGAADYC9LzBgABBAEH8vMGAADYCiL3BgABBAEH0vMGAADYC/LzBgABBAEGEvcGAADYCkL3BgABBAEH8vMGAADYChL3BgABBAEGEvcGAADYCjL3BgABBAEGMvcGAADYCmL3BgABBAEGMvcGAADYClL3BgABBAEGUvcGAADYCoL3BgABBAEGUvcGAADYCnL3BgABBAEGcvcGAADYCqL3BgABBAEGcvcGAADYCpL3BgABBAEGkvcGAADYCsL3BgABBAEGkvcGAADYCrL3BgABBAEGsvcGAADYCuL3BgABBAEGsvcGAADYCtL3BgABBAEG0vcGAADYCwL3BgABBAEG0vcGAADYCvL3BgABBAEG8vcGAADYCyL3BgABBAEG8vcGAADYCxL3BgABBAEHEvcGAADYC0L3BgABBAEHMvcGAADYC2L3BgABBAEHEvcGAADYCzL3BgABBAEHUvcGAADYC4L3BgABBAEHMvcGAADYC1L3BgABBAEHcvcGAADYC6L3BgABBAEHUvcGAADYC3L3BgABBAEHkvcGAADYC8L3BgABBAEHcvcGAADYC5L3BgABBAEHsvcGAADYC+L3BgABBAEHkvcGAADYC7L3BgABBAEH0vcGAADYCgL7BgABBAEHsvcGAADYC9L3BgABBAEH8vcGAADYCiL7BgABBAEH0vcGAADYC/L3BgABBAEGEvsGAADYCkL7BgABBAEH8vcGAADYChL7BgABBAEGMvsGAADYCmL7BgABBAEGEvsGAADYCjL7BgABB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"), (c) => c.charCodeAt(0));
var workletSource = '"use strict";(()=>{var h=Object.freeze({tongueX:[0,1],tongueY:[0,1],jaw:[0,1],lip:[0,1],pitch:[80,400],breath:[0,1],vibrato:[0,1],gain:[0,1],gate:[0,1],voicing:[0,1],frication:[0,1],nasal:[0,1]}),c=Object.freeze({tongueX:.58,tongueY:.42,jaw:.44,lip:.64,pitch:205,breath:.16,vibrato:.12,gain:.65,gate:0,voicing:1,frication:0,nasal:0}),b=Object.freeze({ah:{label:"Ah",params:{tongueX:.28,tongueY:.5,jaw:.95,lip:.85}},ee:{label:"Ee",params:{tongueX:.85,tongueY:.96,jaw:.13,lip:.65}},oo:{label:"Oo",params:{tongueX:.43,tongueY:.83,jaw:.18,lip:.06}},eh:{label:"Eh",params:{tongueX:.73,tongueY:.65,jaw:.57,lip:.7}},oh:{label:"Oh",params:{tongueX:.31,tongueY:.61,jaw:.6,lip:.2}}}),l=Object.keys(h);function g(r={}){let n={};for(let[t,e]of Object.entries(r)){if(!h[t])throw new TypeError(`Unknown parameter: ${t}`);let[s,i]=h[t];if(typeof e!="number"||!Number.isFinite(e)||e<s||e>i)throw new RangeError(`${t} must be between ${s} and ${i}`);n[t]=e}return n}function u(r,n=48e3,t=1){if(!Number.isFinite(n)||n<8e3||n>192e3)throw new RangeError("Sample rate must be 8000\\u2013192000 Hz");let e=r instanceof WebAssembly.Module?r:new WebAssembly.Module(r),{exports:s}=new WebAssembly.Instance(e,{});return s.init(n,t),{sampleRate:n,setParams(i){for(let[o,f]of Object.entries(g(i)))s.set_param(l.indexOf(o),f)},render(i){if(!Number.isInteger(i)||i<0||i>4096)throw new RangeError("Render block must be 0\\u20134096 frames");return new Float32Array(s.memory.buffer,s.render(i),i)},getParams(){return Object.fromEntries(l.map((i,o)=>[i,s.current_param(o)]))},getGeometry(){return new Float32Array(s.memory.buffer,s.geometry(),44).slice()},reset(i=1){s.init(n,i)}}}function p(r=[]){if(!Array.isArray(r)||r.length>1e4)throw new TypeError("Expected at most 10000 events");return r.map(n=>{let{time:t,duration:e}=n;if(!Number.isFinite(t)||t<0||!Number.isFinite(e)||e<=0||t+e>300)throw new RangeError("Events must fit within 300 seconds");return{time:t,duration:e,params:g(n.params)}}).sort((n,t)=>n.time-t.time)}var a=class{constructor(n,t,{loop:e=!1}={}){this.engine=n,this.events=p(t),this.frame=0,this.index=0,this.off=1/0,this.loop=e,this.end=Math.max(0,...this.events.map(s=>Math.round((s.time+s.duration)*n.sampleRate))),this.engine.setParams({gate:0})}render(n,t=new Float32Array(n)){let e=0;for(;e<n;){for(this.loop&&this.end>0&&this.frame>=this.end&&(this.frame=0,this.index=0,this.off=1/0),this.frame>=this.off&&(this.engine.setParams({gate:0}),this.off=1/0);this.index<this.events.length&&Math.round(this.events[this.index].time*this.engine.sampleRate)<=this.frame;){let o=this.events[this.index++];this.engine.setParams({gate:1,...o.params}),this.off=Math.round((o.time+o.duration)*this.engine.sampleRate)}let s=this.index<this.events.length?Math.round(this.events[this.index].time*this.engine.sampleRate):1/0,i=Math.min(n-e,4096,s-this.frame,this.off-this.frame,this.loop&&this.end>0?this.end-this.frame:1/0);i=Math.max(1,i),t.set(this.engine.render(i),e),e+=i,this.frame+=i}return t}};var m=class extends AudioWorkletProcessor{constructor(n){super();let t=n.processorOptions;this.engine=u(t.wasmBytes,sampleRate,t.seed||1),this.engine.setParams(t.params||{}),this.blocks=0,this.timeline=null,this.port.onmessage=({data:e})=>{try{e.type==="params"&&this.engine.setParams(e.params),e.type==="gate"&&this.engine.setParams({gate:e.value}),e.type==="sequence"&&(this.timeline=new a(this.engine,e.events,{loop:!!e.loop})),e.type==="cancel"&&(this.timeline=null,this.engine.setParams({gate:0}))}catch(s){this.port.postMessage({type:"error",message:s.message})}}}process(n,t){let e=t[0][0];if(!e)return!0;if(this.timeline?this.timeline.render(e.length,e):e.set(this.engine.render(e.length)),++this.blocks%12===0){let s=0,i=0;for(let o of e)s+=o*o,i=Math.max(i,Math.abs(o));this.port.postMessage({type:"geometry",params:this.engine.getParams(),areas:Array.from(this.engine.getGeometry()),rms:Math.sqrt(s/e.length),peak:i,time:currentTime})}return!0}};registerProcessor("hermes-voice",m);})();\n';

// src/VoiceLab.tsx
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var NOTES = [48, 50, 52, 53, 55, 57, 59, 60];
var NOTE_NAMES = ["C3", "D3", "E3", "F3", "G3", "A3", "B3", "C4"];
var LETTERS = ["A", "S", "D", "F", "G", "H", "J", "K"];
var INITIAL = NOTES.map((note, i) => ({
  note,
  vowel: ["ah", "eh", "ee", "oh", "oo", "oh", "eh", "ah"][i],
  enabled: true
}));
function Scope({ audio }) {
  const canvas = useRef2(null);
  useEffect(() => {
    let id = 0;
    const draw = () => {
      const el = canvas.current;
      if (!el) return;
      const c = el.getContext("2d");
      const w = el.width = el.clientWidth * 2, h = el.height = el.clientHeight * 2;
      c.clearRect(0, 0, w, h);
      const a = audio.current?.analyser;
      c.lineWidth = 2;
      c.strokeStyle = "#8b667e";
      c.beginPath();
      if (a) {
        const b = new Uint8Array(a.fftSize);
        a.getByteTimeDomainData(b);
        for (let i = 0; i < b.length; i++) {
          const x = i / b.length * w, y = b[i] / 255 * h;
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
          c.fillRect(i * w / 80, h - v * h, w / 80 - 2, v * h);
        }
      }
      id = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(id);
  }, []);
  return /* @__PURE__ */ jsx2(
    "canvas",
    {
      className: "vl-scope",
      ref: canvas,
      "aria-label": "Live waveform and frequency spectrum"
    }
  );
}
function VoiceLab({ bridge }) {
  const [params, setParams] = useState({ ...DEFAULT_PARAMS });
  const [state, setState] = useState("idle");
  const [held, setHeld] = useState(null);
  const [message, setMessage] = useState(
    "Ready when you are. Audio starts with your first note."
  );
  const [sequence, setSequence] = useState(INITIAL);
  const [bpm, setBpm] = useState(96);
  const [text, setText] = useState("hello hermes");
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [activeStep, setActiveStep] = useState(-1);
  const [vowel, setVowel] = useState("ah");
  const [cutaway, setCutaway] = useState(true);
  const [savedEvents, setSavedEvents] = useState(null);
  const [speechMode, setSpeechMode] = useState("text");
  const [visual, setVisual] = useState(null);
  const audio = useRef2(null);
  const paramsRef = useRef2(params);
  const sequenceTimer = useRef2(null);
  const finishTimer = useRef2(null);
  const heldRef = useRef2(null);
  const fileRef = useRef2(null);
  const update = (patch) => {
    setSavedEvents((current) => current?.map((event) => ({ ...event, params: { ...event.params, ...patch } })) ?? null);
    setParams((p) => {
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
        onGeometry: (data) => {
          if (data.params) setVisual(data.params);
        }
      });
    await audio.current.start(paramsRef.current);
    return audio.current;
  };
  const press = async (note) => {
    heldRef.current = note;
    setHeld(note);
    try {
      const a = await ensure();
      if (heldRef.current === note) a.noteOn(note);
    } catch (e) {
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
  const events = () => savedEvents ?? sequence.flatMap(
    (s, i) => s.enabled ? [
      {
        time: i * 60 / bpm,
        duration: 60 / bpm * 0.88,
        params: {
          ...VOWELS[s.vowel].params,
          pitch: 440 * 2 ** ((s.note - 69) / 12),
          gate: 1
        }
      }
    ] : []
  );
  const project = () => ({
    version: 1,
    name: "Hermes voice study",
    patch: { ...params, gate: 0 },
    sequence,
    bpm,
    text,
    events: events()
  });
  const apply = (p) => {
    validateParams(p.patch);
    normalizeEvents(p.events || []);
    if (p.sequence && (!Array.isArray(p.sequence) || p.sequence.length !== 8 || p.sequence.some(
      (s) => !NOTES.includes(s.note) || !(s.vowel in VOWELS) || typeof s.enabled !== "boolean"
    )))
      throw new Error("Patch must contain eight valid note and vowel steps.");
    if (p.bpm !== void 0 && (!Number.isFinite(p.bpm) || p.bpm < 40 || p.bpm > 240))
      throw new Error("Patch tempo must be 40 to 240 BPM.");
    stop();
    update({ ...DEFAULT_PARAMS, ...p.patch, gate: 0 });
    setSavedEvents(p.events?.length ? p.events : null);
    if (p.sequence?.length) setSequence(p.sequence.slice(0, 8));
    if (p.bpm) setBpm(p.bpm);
    if (p.text !== void 0) setText(p.text);
    setMessage(`Loaded ${p.name}.`);
  };
  useEffect(() => {
    if (!bridge) return;
    let alive = true;
    bridge.load().then((p) => {
      if (alive && p) apply(p);
    }).catch((e) => setMessage(`Load failed: ${e.message}`));
    const off = bridge.subscribe((p) => apply(p));
    return () => {
      alive = false;
      off();
    };
  }, [bridge]);
  useEffect(() => {
    const down = (e) => {
      if (e.repeat || e.altKey || e.metaKey || e.ctrlKey || /INPUT|TEXTAREA|SELECT|BUTTON/.test(e.target?.tagName))
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
    const up = (e) => {
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
  const choose = (v) => {
    setVowel(v);
    update(VOWELS[v].params);
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
        }, 6e4 / bpm);
      finishTimer.current = setTimeout(
        stop,
        (Math.max(0, ...ev.map((e) => e.time + e.duration)) + 0.08) * 1e3
      );
    } catch (e) {
      setMessage(e.message);
    }
  };
  const speak = async () => {
    try {
      const opts = { pitch: params.pitch };
      const words = text.trim().split(/\s+/);
      const plan = speechMode === "phonemes" ? planPhonemes(text, opts) : speechMode === "lyrics" ? planLyrics(
        text,
        words.map((_, i) => ({
          pitch: 440 * 2 ** ((sequence[i % sequence.length].note - 69) / 12),
          duration: 60 / bpm
        })),
        opts
      ) : planText(text, opts);
      if (!plan.events.length) {
        setMessage(
          plan.unsupported?.length ? `Unsupported ${speechMode === "phonemes" ? "phonemes" : "words"}: ${plan.unsupported.join(", ")}. See supported input below.` : "Enter a supported word or vowel sound."
        );
        return;
      }
      const a = await ensure();
      stop();
      setSavedEvents(plan.events);
      a.playSequence(plan.events);
      setPlaying(true);
      finishTimer.current = setTimeout(stop, plan.duration * 1e3 + 100);
      setMessage(
        plan.unsupported?.length ? `Skipped unsupported words: ${plan.unsupported.join(", ")}.` : "Playing an experimental phoneme approximation."
      );
    } catch (e) {
      setMessage(e.message);
    }
  };
  const download = (blob, name) => {
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 2e3);
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
            type: "application/json"
          }),
          "hermes-voice-patch.json"
        );
        setMessage("Patch downloaded.");
      }
    } catch (e) {
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
    } catch (e) {
      setMessage(`Load failed: ${e.message}`);
    }
  };
  const exportWav = async () => {
    setBusy(true);
    setMessage("Rendering the sequence to WAV\u2026");
    try {
      if (bridge) {
        const r = await bridge.render(project());
        setMessage(`WAV exported: ${r.path}`);
      } else {
        const { renderWav: renderWav2 } = await Promise.resolve().then(() => (init_offline(), offline_exports));
        const r = await renderWav2(wasmBytes, project());
        download(new Blob([r.wav], { type: "audio/wav" }), "hermes-voice.wav");
        setMessage("WAV downloaded.");
      }
    } catch (e) {
      setMessage(`Export failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };
  const slider = (key, label, min = 0, max = 1, unit = "") => /* @__PURE__ */ jsxs2("label", { className: "vl-range", children: [
    /* @__PURE__ */ jsxs2("span", { className: "vl-range-header", children: [
      label,
      /* @__PURE__ */ jsxs2("output", { children: [
        key === "pitch" ? Math.round(params[key]) : Math.round(params[key] * 100),
        unit || "%"
      ] })
    ] }),
    /* @__PURE__ */ jsx2(
      "input",
      {
        type: "range",
        min,
        max,
        step: key === "pitch" ? 1 : 0.01,
        value: params[key],
        onChange: (e) => update({ [key]: +e.target.value })
      }
    )
  ] }, key);
  return /* @__PURE__ */ jsxs2("div", { className: "voice-lab", children: [
    /* @__PURE__ */ jsx2("style", { children: styles }),
    /* @__PURE__ */ jsxs2("header", { className: "vl-head", children: [
      /* @__PURE__ */ jsxs2("div", { className: "vl-brand", children: [
        /* @__PURE__ */ jsx2(
          "svg",
          {
            className: "vl-mark",
            viewBox: "0 0 40 40",
            fill: "none",
            "aria-hidden": "true",
            children: /* @__PURE__ */ jsx2(
              "path",
              {
                d: "M5 20h4m3-9v18m5-24v30m6-27v24m6-19v14m6-7h2",
                stroke: "currentColor",
                strokeWidth: "2.5",
                strokeLinecap: "round"
              }
            )
          }
        ),
        /* @__PURE__ */ jsxs2("div", { children: [
          /* @__PURE__ */ jsx2("h1", { children: "Hermes Voice Lab" }),
          /* @__PURE__ */ jsx2("p", { children: "A voice you can shape." })
        ] })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "vl-actions", children: [
        /* @__PURE__ */ jsxs2("span", { className: "vl-status", children: [
          /* @__PURE__ */ jsx2("i", { className: `vl-dot ${state === "running" ? "on" : ""}` }),
          state === "running" ? "Audio ready" : state === "starting" ? "Starting audio" : "Audio idle"
        ] }),
        /* @__PURE__ */ jsx2("button", { onClick: load, disabled: busy, children: "Load patch" }),
        /* @__PURE__ */ jsx2("button", { onClick: save, disabled: busy, children: "Save patch" }),
        /* @__PURE__ */ jsx2("button", { className: "primary", onClick: exportWav, disabled: busy, children: busy ? "Working\u2026" : "Export WAV" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs2("main", { children: [
      /* @__PURE__ */ jsxs2("div", { className: "vl-studio", children: [
        /* @__PURE__ */ jsxs2(
          "section",
          {
            className: "vl-character",
            "aria-label": "Interactive vocal tract",
            children: [
              /* @__PURE__ */ jsx2(
                Avatar,
                {
                  cutaway,
                  params: state === "running" && visual ? visual : params,
                  onChange: update,
                  active: held !== null || playing
                }
              ),
              /* @__PURE__ */ jsxs2("div", { className: "vl-character-caption", children: [
                /* @__PURE__ */ jsx2("span", { children: "Hermes \xB7 illustrative anatomy" }),
                /* @__PURE__ */ jsxs2("label", { children: [
                  /* @__PURE__ */ jsx2(
                    "input",
                    {
                      type: "checkbox",
                      checked: cutaway,
                      onChange: (e) => setCutaway(e.target.checked)
                    }
                  ),
                  " ",
                  "Modeled cutaway"
                ] })
              ] })
            ]
          }
        ),
        /* @__PURE__ */ jsxs2("section", { className: "vl-control", children: [
          /* @__PURE__ */ jsxs2("div", { className: "vl-section-heading", children: [
            /* @__PURE__ */ jsx2("h2", { children: "Shape the sound" }),
            /* @__PURE__ */ jsx2("small", { children: "Choose a vowel, then make it yours." })
          ] }),
          /* @__PURE__ */ jsx2("div", { className: "vl-vowels", children: Object.entries(VOWELS).map(([key, v]) => /* @__PURE__ */ jsxs2(
            "button",
            {
              className: vowel === key ? "selected" : "",
              onClick: () => choose(key),
              "aria-pressed": vowel === key,
              children: [
                key.toUpperCase(),
                /* @__PURE__ */ jsx2("small", { children: v.label })
              ]
            },
            key
          )) }),
          /* @__PURE__ */ jsxs2("div", { className: "vl-sliders", children: [
            slider("tongueX", "Tongue \xB7 forward"),
            slider("tongueY", "Tongue \xB7 height"),
            slider("jaw", "Jaw opening"),
            slider("lip", "Lip opening"),
            slider("pitch", "Pitch", 80, 400, " Hz"),
            slider("breath", "Breath"),
            slider("vibrato", "Vibrato"),
            slider("gain", "Output level")
          ] }),
          /* @__PURE__ */ jsxs2("div", { className: "vl-hold-row", children: [
            /* @__PURE__ */ jsx2(
              "button",
              {
                className: `primary ${held === -1 ? "held" : ""}`,
                onPointerDown: async (e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  heldRef.current = -1;
                  setHeld(-1);
                  try {
                    const a = await ensure();
                    if (heldRef.current === -1)
                      a.setParams({ ...paramsRef.current, gate: 1 });
                  } catch (err) {
                    setMessage(err.message);
                    release();
                  }
                },
                onPointerUp: release,
                onPointerCancel: release,
                onKeyDown: (e) => {
                  if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    if (!e.repeat) {
                      heldRef.current = -1;
                      setHeld(-1);
                      ensure().then((a) => {
                        if (heldRef.current === -1)
                          a.setParams({ ...paramsRef.current, gate: 1 });
                      }).catch((err) => setMessage(err.message));
                    }
                  }
                },
                onKeyUp: release,
                children: "Hold to sing"
              }
            ),
            /* @__PURE__ */ jsx2("button", { onClick: stop, children: "Stop" }),
            /* @__PURE__ */ jsx2(
              "button",
              {
                onClick: () => {
                  stop();
                  audio.current?.stop();
                  setMessage("Audio disabled. Play a note to restart.");
                },
                children: "Disable audio"
              }
            )
          ] }),
          /* @__PURE__ */ jsx2(Scope, { audio }),
          /* @__PURE__ */ jsxs2("div", { className: "vl-scope-caption", children: [
            /* @__PURE__ */ jsx2("span", { children: "LIVE WAVEFORM + SPECTRUM" }),
            /* @__PURE__ */ jsx2("span", { children: "Web Audio / WASM" })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "vl-lower", children: [
        /* @__PURE__ */ jsxs2("section", { children: [
          /* @__PURE__ */ jsxs2("div", { className: "vl-section-heading", children: [
            /* @__PURE__ */ jsx2("h2", { children: "Play the voice" }),
            /* @__PURE__ */ jsx2("small", { children: "Use your keyboard \xB7 A through K" })
          ] }),
          /* @__PURE__ */ jsx2("div", { className: "vl-piano", children: NOTES.map((note, i) => /* @__PURE__ */ jsxs2(
            "button",
            {
              className: `vl-key ${held === note ? "down" : ""}`,
              onPointerDown: (e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                press(note);
              },
              onPointerUp: release,
              onPointerCancel: release,
              onKeyDown: (e) => {
                if ((e.key === " " || e.key === "Enter") && !e.repeat) {
                  e.preventDefault();
                  press(note);
                }
              },
              onKeyUp: release,
              "aria-label": `Play ${NOTE_NAMES[i]}`,
              children: [
                /* @__PURE__ */ jsx2("span", { children: NOTE_NAMES[i] }),
                /* @__PURE__ */ jsx2("small", { children: LETTERS[i] })
              ]
            },
            note
          )) })
        ] }),
        /* @__PURE__ */ jsxs2("section", { children: [
          /* @__PURE__ */ jsxs2("div", { className: "vl-section-heading", children: [
            /* @__PURE__ */ jsx2("h2", { children: "Vowel sequence" }),
            /* @__PURE__ */ jsx2("small", { children: savedEvents ? "Saved timeline \xB7 edit a step to replace" : "Eight steps \xB7 click a number to mute" })
          ] }),
          /* @__PURE__ */ jsx2("div", { className: "vl-sequence", children: sequence.map((s, i) => /* @__PURE__ */ jsxs2(
            "div",
            {
              className: `vl-step ${s.enabled ? "" : "off"} ${activeStep === i ? "playing" : ""}`,
              children: [
                /* @__PURE__ */ jsx2(
                  "button",
                  {
                    "aria-label": `Step ${i + 1} ${s.enabled ? "enabled" : "muted"}`,
                    "aria-pressed": s.enabled,
                    onClick: () => {
                      setSavedEvents(null);
                      setSequence(
                        (x) => x.map(
                          (v, j) => j === i ? { ...v, enabled: !v.enabled } : v
                        )
                      );
                    },
                    children: String(i + 1).padStart(2, "0")
                  }
                ),
                /* @__PURE__ */ jsx2(
                  "select",
                  {
                    "aria-label": `Step ${i + 1} vowel`,
                    value: s.vowel,
                    onChange: (e) => {
                      setSavedEvents(null);
                      setSequence(
                        (x) => x.map(
                          (v, j) => j === i ? { ...v, vowel: e.target.value } : v
                        )
                      );
                    },
                    children: Object.keys(VOWELS).map((v) => /* @__PURE__ */ jsx2("option", { value: v, children: v.toUpperCase() }, v))
                  }
                ),
                /* @__PURE__ */ jsx2(
                  "select",
                  {
                    "aria-label": `Step ${i + 1} note`,
                    value: s.note,
                    onChange: (e) => {
                      setSavedEvents(null);
                      setSequence(
                        (x) => x.map(
                          (v, j) => j === i ? { ...v, note: +e.target.value } : v
                        )
                      );
                    },
                    children: NOTES.map((n, j) => /* @__PURE__ */ jsx2("option", { value: n, children: NOTE_NAMES[j] }, n))
                  }
                )
              ]
            },
            i
          )) }),
          /* @__PURE__ */ jsxs2("div", { className: "vl-seq-actions", children: [
            /* @__PURE__ */ jsx2("button", { className: "primary", onClick: play, children: playing ? "Stop sequence" : "Play sequence" }),
            /* @__PURE__ */ jsxs2("label", { className: "vl-tempo", children: [
              /* @__PURE__ */ jsx2(
                "input",
                {
                  type: "number",
                  min: 40,
                  max: 240,
                  value: bpm,
                  onChange: (e) => {
                    setSavedEvents(null);
                    setBpm(Math.min(240, Math.max(40, +e.target.value || 96)));
                  }
                }
              ),
              " ",
              "BPM"
            ] })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs2("section", { className: "vl-speech", children: [
        /* @__PURE__ */ jsxs2("div", { className: "vl-section-heading", children: [
          /* @__PURE__ */ jsx2("h2", { children: "Give it a word" }),
          /* @__PURE__ */ jsx2("small", { children: "Experimental phoneme playback" })
        ] }),
        /* @__PURE__ */ jsxs2("div", { className: "vl-speech-row", children: [
          /* @__PURE__ */ jsxs2(
            "select",
            {
              "aria-label": "Playback mode",
              value: speechMode,
              onChange: (e) => setSpeechMode(e.target.value),
              children: [
                /* @__PURE__ */ jsx2("option", { value: "text", children: "Spoken phrase" }),
                /* @__PURE__ */ jsx2("option", { value: "phonemes", children: "Phonemes" }),
                /* @__PURE__ */ jsx2("option", { value: "lyrics", children: "Sing lyrics" })
              ]
            }
          ),
          /* @__PURE__ */ jsx2(
            "input",
            {
              "aria-label": "Words to synthesize",
              value: text,
              onChange: (e) => setText(e.target.value),
              placeholder: "Try hello hermes",
              onKeyDown: (e) => {
                if (e.key === "Enter") speak();
              }
            }
          ),
          /* @__PURE__ */ jsx2("button", { onClick: speak, children: speechMode === "lyrics" ? "Sing lyrics" : speechMode === "phonemes" ? "Play phonemes" : "Speak text" })
        ] }),
        /* @__PURE__ */ jsx2("p", { className: "vl-footnote", children: "A small pronunciation lexicon drives the same vocal model. Unknown words stop playback. Lyrics follow the sequence notes, one word per note. This is a sound experiment, not a natural speech engine." }),
        /* @__PURE__ */ jsxs2("details", { className: "vl-footnote", children: [
          /* @__PURE__ */ jsx2("summary", { children: "Supported words and phonemes" }),
          /* @__PURE__ */ jsx2("p", { children: speechMode === "phonemes" ? SUPPORTED_PHONEMES.join(" \xB7 ") : Object.keys(LEXICON).join(", ") })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs2("footer", { className: "vl-footer", children: [
      /* @__PURE__ */ jsx2("span", { className: "vl-message", role: "status", children: message }),
      /* @__PURE__ */ jsx2("span", { children: "Made for Hermes" })
    ] }),
    /* @__PURE__ */ jsx2(
      "input",
      {
        type: "file",
        accept: "application/json,.json",
        ref: fileRef,
        hidden: true,
        onChange: async (e) => {
          try {
            const f = e.target.files?.[0];
            if (!f) return;
            const p = JSON.parse(await f.text());
            if (p.version !== 1 || !p.patch || typeof p.patch !== "object")
              throw new Error("Choose a version 1 Hermes voice patch.");
            apply(p);
          } catch (err) {
            setMessage(`Load failed: ${err.message}`);
          } finally {
            e.target.value = "";
          }
        }
      }
    )
  ] });
}

// src/desktop.tsx
function SessionLab({ ctx }) {
  const stored = useValue(host.state.focusedStoredSessionId);
  const runtime = useValue(host.state.focusedSessionId);
  const profile = useValue(host.state.focusedSessionProfile);
  const sessionId = stored || runtime || "scratch";
  const bridge = useMemo(() => {
    const projectId = "main";
    const scope = () => ({ projectId, sessionId });
    const assertScope = () => {
      const focused = host.state.focusedStoredSessionId.get() || host.state.focusedSessionId.get() || "scratch";
      if (focused !== sessionId || host.state.focusedSessionProfile.get() !== profile) throw new Error("Conversation changed; reopen this project.");
    };
    return {
      scope,
      async load() {
        assertScope();
        return (await ctx.rest(`/projects/${projectId}?session_id=${encodeURIComponent(sessionId)}`)).project;
      },
      async save(project) {
        assertScope();
        return (await ctx.rest(`/projects/${projectId}`, { method: "PUT", body: { session_id: sessionId, project } })).project;
      },
      async render(project) {
        assertScope();
        const download = captureGatewayFileDownload();
        await ctx.rest(`/projects/${projectId}`, { method: "PUT", body: { session_id: sessionId, project } });
        assertScope();
        const result = await ctx.rest("/render", { method: "POST", body: { project_id: projectId, session_id: sessionId }, timeoutMs: 9e4 });
        await download(result.path, `${project.name || "voice-study"}.wav`);
        return result;
      },
      subscribe(listener) {
        return host.onEvent("plugin.hermes-voice-lab.project.updated", ({ payload }) => {
          if (payload.project_id === projectId && payload.session_id === sessionId && host.state.focusedSessionProfile.get() === profile) listener(payload.project);
        });
      }
    };
  }, [ctx, sessionId, profile]);
  return React3.createElement(VoiceLab, { key: `${profile}:${sessionId}`, bridge });
}
var desktop_default = {
  id: "hermes-voice-lab",
  name: "Voice Lab",
  defaultEnabled: false,
  register(ctx) {
    ctx.register({ id: "voice-lab-route", area: ROUTES_AREA, data: { path: "/voice-lab" }, render: () => React3.createElement(SessionLab, { ctx }) });
    ctx.register({ id: "voice-lab-nav", area: SIDEBAR_NAV_AREA, data: { path: "/voice-lab", label: "Voice Lab", codicon: "unmute" } });
    ctx.register({ id: "voice-lab-open", area: PALETTE_AREA, data: { id: "voice-lab-open", label: "Open Voice Lab", run: () => host.navigate("/voice-lab") } });
  }
};
export {
  desktop_default as default
};
