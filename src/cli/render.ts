/**
 * Offline renderer used by the agent tools (and for tests):
 *   node plugin/runtime/render.mjs --project in.json --output out.wav [--mode speak] [--rate 48000]
 *   node plugin/runtime/render.mjs --text "Hello there" --output out.wav
 * Prints JSON metadata on stdout. Uses the same WASM engine and planner as
 * Desktop playback.
 */
import {readFileSync, writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Engine, renderScore} from '../core/engine';
import {duetScore, newProject, projectScore, validateProject, type Mode} from '../core/project';
import {decodeLexicon} from '../core/text';
import {validatePatch} from '../core/params';
import {VOICE_PRESETS} from '../core/presets';
import {encodeWav, measure} from '../core/wav';

const here = dirname(fileURLToPath(import.meta.url));
const args = new Map<string, string>();
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 2) args.set(argv[i].replace(/^--/, ''), argv[i + 1] ?? '');

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

const output = args.get('output') || fail('--output is required');
let project = newProject();
if (args.has('project')) project = validateProject(JSON.parse(readFileSync(args.get('project')!, 'utf8')));
if (args.has('text')) project = {...project, mode: 'speak', speech: {...project.speech, text: args.get('text')!, phonemes: args.get('phonemes') === '1'}};
if (args.has('voice')) {
  const preset = VOICE_PRESETS.find(p => p.id === args.get('voice'));
  if (!preset) fail(`unknown voice preset ${args.get('voice')}`);
  project = {...project, voice: {...project.voice, ...preset.voice}};
}
if (args.has('patch')) project = {...project, voice: {...project.voice, ...validatePatch(JSON.parse(args.get('patch')!), 'patch')}};
if (args.has('expression')) {
  const expression = Number(args.get('expression'));
  if (!(expression >= 0 && expression <= 1)) fail('expression must be 0–1');
  project = {...project, speech: {...project.speech, expression}};
}
if (args.has('speed')) {
  const speed = Number(args.get('speed'));
  if (!(speed >= 0.4 && speed <= 2.5)) fail('speed must be 0.4–2.5');
  project = {...project, speech: {...project.speech, rate: speed}};
}
const mode = (args.get('mode') as Mode) || project.mode;
if (!['play', 'speak', 'sing', 'beat'].includes(mode)) fail('mode must be play, speak, sing or beat');
const rate = Number(args.get('rate') || 48000);
if (![8000, 16000, 22050, 24000, 32000, 44100, 48000, 96000].includes(rate)) fail('unsupported sample rate');

const lexicon = decodeLexicon(gunzipSync(readFileSync(join(here, 'lexicon.txt.gz'))).toString('utf8'));
const module = new WebAssembly.Module(readFileSync(join(here, 'voice_lab_engine.wasm')));
const engine = new Engine(module, rate, Number(args.get('seed') || 1));
const {score, warnings} = projectScore(project, lexicon, mode);
const started = performance.now();
let [left, right] = renderScore(engine, score);
// A duet: the second singer from a second engine, mixed in (both slightly lower).
const second = mode === 'sing' ? duetScore(project, lexicon) : null;
if (second) {
  const [l2, r2] = renderScore(new Engine(module, rate, Number(args.get('seed') || 1) + 1), second.score, second.voice);
  const n = Math.max(left.length, l2.length);
  const mix = (a: Float32Array, b: Float32Array) => { const out = new Float32Array(n); for (let i = 0; i < n; i++) out[i] = 0.72 * ((a[i] ?? 0) + (b[i] ?? 0)); return out; };
  [left, right] = [mix(left, l2), mix(right, r2)];
}
const elapsed = (performance.now() - started) / 1000;
const mono = args.get('channels') === '1';
writeFileSync(output, encodeWav(mono ? [left] : [left, right], rate));
const stats = measure(left);
const state = engine.state();
process.stdout.write(JSON.stringify({
  ok: true, output, mode, sampleRate: rate, channels: mono ? 1 : 2, seconds: left.length / rate,
  peak: Number(stats.peak.toFixed(4)), rms: Number(stats.rms.toFixed(4)), renderSeconds: Number(elapsed.toFixed(3)),
  resets: state[15], warnings, name: project.name,
}) + '\n');
