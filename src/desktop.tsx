/**
 * Hermes Desktop entry. Registers the Voice Lab page, sidebar link, palette
 * command, settings page and a renderer for audio produced by this package's
 * own tools. Uses only the public @hermes/plugin-sdk surface.
 */
import React, {useEffect, useMemo, useRef, useState} from 'react';
import * as sdk from '@hermes/plugin-sdk';
import {host, useValue, captureGatewayFileDownload, ROUTES_AREA, SIDEBAR_NAV_AREA, PALETTE_AREA} from '@hermes/plugin-sdk';
import VoiceLab from './ui/VoiceLab';
import type {UpdateOrigin, VoiceLabBridge} from './bridge';
import {validateProject, type Project} from './core/project';
import {Mark} from './ui/controls';

const PLUGIN = 'hermes-voice-lab';
const PROJECT = 'main';
const EVENT = `plugin.${PLUGIN}.project.updated`;
const CLIENT = Math.random().toString(36).slice(2);

function SessionLab({ctx}: {ctx: any}) {
  const stored = useValue(host.state.focusedStoredSessionId);
  const runtime = useValue(host.state.focusedSessionId);
  const profile = useValue(host.state.focusedSessionProfile);
  const sessionId = stored || runtime || 'scratch';
  const bridge = useMemo<VoiceLabBridge>(() => makeBridge(ctx, sessionId, profile), [ctx, sessionId, profile]);
  return <VoiceLab key={`${profile}:${sessionId}`} bridge={bridge} />;
}

function makeBridge(ctx: any, sessionId: string, profile: string): VoiceLabBridge {
  const focused = () => host.state.focusedStoredSessionId.get() || host.state.focusedSessionId.get() || 'scratch';
  const assertScope = () => {
    if (focused() !== sessionId || host.state.focusedSessionProfile.get() !== profile) throw new Error('The focused conversation changed; reopen Voice Lab.');
  };
  const safeName = (s: string) => s.replace(/[^\w.-]+/g, '-').slice(0, 80) || 'voice';
  const folder = async () => {
    const files = ctx.files;
    if (!files) return null;
    const granted = (await files.folders())[0];
    if (granted) return granted;
    const picked = await files.requestFolder();
    return picked.ok ? picked.folder : null;
  };
  return {
    kind: 'hermes',
    scopeLabel: sessionId === 'scratch' ? 'Scratch project (no conversation focused)' : 'Saved with this conversation',
    async load() {
      assertScope();
      const res = await ctx.rest(`/projects/${PROJECT}?session_id=${encodeURIComponent(sessionId)}`);
      return res.project ? validateProject(res.project) : null;
    },
    async save(project) {
      assertScope();
      await ctx.rest(`/projects/${PROJECT}`, {method: 'PUT', body: {session_id: sessionId, project, client: CLIENT}});
    },
    subscribe(listener) {
      return ctx.onEvent(EVENT, (event: any) => {
        const p = event?.payload;
        if (!p || p.project_id !== PROJECT || p.session_id !== sessionId || host.state.focusedSessionProfile.get() !== profile) return;
        if (p.client === CLIENT) return;
        try {
          listener(validateProject(p.project), (p.origin === 'agent' ? 'agent' : 'remote') as UpdateOrigin, Array.isArray(p.changed) ? p.changed : undefined);
        } catch {
          /* ignore malformed payloads */
        }
      });
    },
    async exportWav(project: Project, mode) {
      assertScope();
      const download = captureGatewayFileDownload();
      const result = await ctx.rest('/render', {method: 'POST', body: {session_id: sessionId, project, mode}, timeoutMs: 130000});
      await download(result.path, `${safeName(project.name)}-${mode}.wav`);
      return {path: result.path, seconds: result.seconds};
    },
    storage: {
      get: (key, fallback) => ctx.storage.get(key, fallback),
      set: (key, value) => ctx.storage.set(key, value),
    },
    files: ctx.files
      ? {
          async save(name, text) {
            const f = await folder();
            if (!f) return null;
            const r = await ctx.files.writeText(f.id, safeName(name), text);
            if (!r.ok) throw new Error(r.message || r.error);
            return `${f.name}/${safeName(name)}`;
          },
          async open() {
            const f = await folder();
            if (!f) return null;
            const list = await ctx.files.list(f.id, '');
            if (!list.ok) throw new Error(list.message || list.error);
            const candidates = list.entries.filter((e: any) => !e.isDirectory && /\.json$/i.test(e.name));
            if (!candidates.length) throw new Error(`No .json project files in ${f.name}`);
            // Newest Voice Lab project in the granted folder.
            const stats = await Promise.all(candidates.map(async (e: any) => ({e, s: await ctx.files.stat(f.id, e.path)})));
            stats.sort((a, b) => (b.s.mtimeMs ?? 0) - (a.s.mtimeMs ?? 0));
            const pick = stats.find(x => /voicelab/i.test(x.e.name)) ?? stats[0];
            const r = await ctx.files.readText(f.id, pick.e.path);
            if (!r.ok) throw new Error(r.message || r.error);
            return r.text;
          },
        }
      : undefined,
    notify(message, kind = 'info') {
      host.notify?.({kind: kind === 'error' ? 'error' : 'info', message});
    },
  };
}

// ---- Audio card for this package's tool output --------------------------------

const CARD_CSS = `
.hvl-card-media{--a:var(--ui-accent,#5b5bd6);display:flex;gap:12px;align-items:center;padding:10px 12px;border:1px solid var(--ui-stroke-secondary,#ddd);border-radius:12px;max-width:520px;background:color-mix(in oklab,var(--ui-bg-elevated,#fff) 70%,transparent);font-family:var(--font-sans,system-ui)}
.hvl-card-media .hvl-mark{width:30px;height:30px;color:var(--a);flex:none}
.hvl-card-media .meta{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}
.hvl-card-media .t{font-size:12.5px;font-weight:600;color:var(--ui-text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hvl-card-media .s{font:500 10.5px var(--font-mono,monospace);color:var(--ui-text-tertiary)}
.hvl-card-media canvas{width:100%;height:30px;display:block;cursor:pointer}
.hvl-card-media button{width:32px;height:32px;border-radius:50%;border:0;background:var(--a);color:var(--ui-bg-elevated,#fff);cursor:pointer;flex:none;display:flex;align-items:center;justify-content:center}
.hvl-card-media .open{width:auto;height:26px;border-radius:7px;padding:0 9px;background:transparent;color:var(--ui-text-secondary);border:1px solid var(--ui-stroke-secondary,#ddd);font-size:11.5px}
`;

function AudioCard({ctx, file, args, result, fallback}: any) {
  const [src, setSrc] = useState<string | null>(null);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audio = useRef<HTMLAudioElement | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let live = true;
    file.resolveUrl().then((url: string) => live && setSrc(url), (e: unknown) => {
      console.warn('[voice-lab] could not resolve audio', e);
      if (live) setSrc('');
    });
    return () => {
      live = false;
    };
  }, [file]);
  useEffect(() => {
    let live = true;
    // Peaks come from this plugin's backend (it reads the rendered WAV), so the
    // card shows the real output even when the media URL is stream-only.
    ctx.rest(`/peaks?path=${encodeURIComponent(file.path)}&bins=120`).then(
      (r: any) => live && Array.isArray(r?.peaks) && setPeaks(Float32Array.from(r.peaks)),
      () => live && setPeaks(null),
    );
    return () => {
      live = false;
    };
  }, [file]);
  useEffect(() => {
    const c = canvas.current;
    if (!c || !peaks) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.clientWidth * dpr;
    c.height = c.clientHeight * dpr;
    const g = c.getContext('2d')!;
    g.scale(dpr, dpr);
    const w = c.clientWidth;
    const h = c.clientHeight;
    const accent = getComputedStyle(c).getPropertyValue('--a').trim() || '#5b5bd6';
    const max = Math.max(0.01, ...peaks);
    const bw = w / peaks.length;
    peaks.forEach((p, i) => {
      g.fillStyle = accent;
      g.globalAlpha = i / peaks.length <= progress ? 1 : 0.35;
      const bh = Math.max(1.5, (p / max) * (h - 2));
      g.fillRect(i * bw + 0.5, (h - bh) / 2, Math.max(1, bw - 1.5), bh);
    });
  }, [peaks, progress]);
  useEffect(() => () => audio.current?.pause(), []);
  if (file.kind !== 'audio' || src === '') return fallback ?? null;
  const parsed = typeof result === 'string' ? safeJson(result.split('\n')[0]) : result;
  const mode = parsed?.render?.mode ?? args?.mode ?? 'voice';
  const seconds = parsed?.render?.seconds;
  const title = args?.text ?? args?.lyrics ?? (args?.preset ? `${args.preset} voice` : args?.vowel ? `Vowel ${args.vowel}` : file.name);
  const toggle = () => {
    if (!src) return;
    if (!audio.current) {
      const a = new Audio(src);
      a.ontimeupdate = () => setProgress(a.duration ? a.currentTime / a.duration : 0);
      a.onended = () => {
        setPlaying(false);
        setProgress(0);
      };
      audio.current = a;
    }
    if (audio.current.paused) {
      audio.current.play().catch(e => {
        console.warn('[voice-lab] playback failed', e);
        setPlaying(false);
      });
      setPlaying(true);
    } else {
      audio.current.pause();
      setPlaying(false);
    }
  };
  const seek = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const a = audio.current;
    if (!a || !a.duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = ((e.clientX - r.left) / r.width) * a.duration;
  };
  return (
    <figure className="hvl-card-media" style={{margin: 0}} data-src={src ? src.slice(0, 40) : String(src)}>
      <style>{CARD_CSS}</style>
      <button onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? <svg width="12" height="12" viewBox="0 0 12 12"><rect x="2" y="1.5" width="3" height="9" fill="currentColor" /><rect x="7" y="1.5" width="3" height="9" fill="currentColor" /></svg>
          : <svg width="12" height="12" viewBox="0 0 12 12"><path d="M3 1.5v9l7.5-4.5z" fill="currentColor" /></svg>}
      </button>
      <div className="meta">
        <figcaption className="t">{String(title).slice(0, 90)}</figcaption>
        {peaks ? <canvas ref={canvas} onClick={seek} aria-label="Waveform of the rendered audio" />
          : <div style={{height: 4, borderRadius: 2, background: 'var(--ui-stroke-secondary)', overflow: 'hidden'}}><div style={{height: '100%', width: `${progress * 100}%`, background: 'var(--a)'}} /></div>}
        <span className="s">Voice Lab · {mode}{seconds ? ` · ${Number(seconds).toFixed(1)} s` : ''} · local articulatory engine</span>
      </div>
      <Mark />
      <button className="open" onClick={() => host.navigate('/voice-lab')}>Open</button>
    </figure>
  );
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ---- Settings ------------------------------------------------------------------

function Settings({ctx}: {ctx: any}) {
  const [cutaway, setCutaway] = useState(() => ctx.storage.get('cutaway', true));
  const [labels, setLabels] = useState(() => ctx.storage.get('labels', true));
  const row = (label: string, help: string, value: boolean, set: (v: boolean) => void, key: string) => (
    <label style={{display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid var(--ui-stroke-tertiary)'}}>
      <input type="checkbox" checked={value} onChange={e => { set(e.target.checked); ctx.storage.set(key, e.target.checked); }} style={{marginTop: 3, accentColor: 'var(--ui-accent)'}} />
      <span><div style={{fontWeight: 600, fontSize: 13}}>{label}</div><div style={{fontSize: 12, color: 'var(--ui-text-tertiary)'}}>{help}</div></span>
    </label>
  );
  return (
    <div style={{maxWidth: 640, fontFamily: 'var(--font-sans)', color: 'var(--ui-text-primary)'}}>
      <p style={{fontSize: 12.5, color: 'var(--ui-text-secondary)', lineHeight: 1.5}}>
        Voice Lab synthesizes an original character voice with a local physical model. Projects are saved per conversation; voice presets are saved for this plugin.
        For read-aloud in the character voice, set <code>tts.provider: voice-lab</code> in the profile config (English only; less natural than neural voices).
      </p>
      {row('Show the cutaway', 'Reveal the modeled mouth, tongue, throat and nasal path in the portrait.', cutaway, setCutaway, 'cutaway')}
      {row('Show labels', 'Label the articulators in the portrait.', labels, setLabels, 'labels')}
    </div>
  );
}

export default {
  id: PLUGIN,
  name: 'Voice Lab',
  defaultEnabled: false,
  register(ctx: any) {
    ctx.register({id: 'voice-lab-route', area: ROUTES_AREA, data: {path: '/voice-lab'}, render: () => <SessionLab ctx={ctx} />});
    ctx.register({id: 'voice-lab-nav', area: SIDEBAR_NAV_AREA, data: {path: '/voice-lab', label: 'Voice Lab', codicon: 'unmute'}});
    ctx.register({id: 'voice-lab-open', area: PALETTE_AREA, data: {id: 'voice-lab-open', label: 'Open Voice Lab', run: () => host.navigate('/voice-lab')}});
    const mediaArea = (sdk as any).TOOL_MEDIA_RENDERER_AREA;
    if (typeof mediaArea === 'string') {
      ctx.register({
        id: 'voice-lab-audio-card',
        area: mediaArea,
        data: {tools: ['voice_lab_perform', 'voice_lab_render', 'voice_lab_set_voice'], render: (props: any) => <AudioCard ctx={ctx} {...props} />},
      });
    }
    ctx.registerSettingsPage?.({id: 'settings', title: 'Voice Lab', icon: 'unmute', render: () => <Settings ctx={ctx} />});
  },
};
