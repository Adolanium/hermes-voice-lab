import type {Score} from '../core/engine';
import {midiToHz, type Patch} from '../core/params';
import {isVowel, type Phone} from '../core/phonemes';
import {planLiveOff, planLiveOn, type LyricCue} from '../core/planner';

export interface PerformanceAudio {
  readonly running: boolean;
  claim(): void;
  patch(patch: Patch, tau?: number): void;
  set(name: 'pitch' | 'gate', value: number, tau?: number): void;
  stopScore(): void;
  silence(): void;
  play(score: Score, loop?: boolean): void;
  playDuet(score: Score, second: {score: Score; voice: Patch}, loop?: boolean): void;
}
export interface Syllable {phones: Phone[]; text: string}
interface Note {midi: number; syllable?: Syllable}
export interface Playback {score: Score; cues?: LyricCue[]; loop?: boolean; second?: {score: Score; voice: Patch}}
export interface PerformanceState {holding: boolean; latch: boolean; notes: number[]; cues: LyricCue[]; playback: boolean}

/** One monophonic instrument. Sources release only what they own. Explicit playback
 * replaces live input; the next live input interrupts playback. Startup is cancellable. */
export class PerformanceController {
  private notes = new Map<string, Note>();
  private touches = new Set<string>();
  private holding = false;
  private latch = false;
  private revision = 0;
  private applied: Note | null = null;
  private sounding = false;
  private livePhones: Phone[] | null = null;
  private playback: Playback | null = null;
  private cues: LyricCue[] = [];
  private appliedPlayback: Playback | null = null;
  private previewTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<() => void>();
  private state: PerformanceState = {holding: false, latch: false, notes: [], cues: [], playback: false};
  constructor(private audio: PerformanceAudio, private options: {
    ensureAudio: () => Promise<boolean>;
    patch: () => Patch;
    nextSyllable?: () => Syllable | undefined;
  }) {}
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getSnapshot = () => this.state;
  private emit() {
    this.state = {holding: this.holding, latch: this.latch, notes: [...this.notes.values()].map(n => n.midi), cues: this.cues, playback: !!this.playback};
    this.listeners.forEach(fn => fn());
  }
  private cancelPreview() {
    if (this.previewTimer) clearTimeout(this.previewTimer);
    this.previewTimer = null;
    this.notes.delete('preview');
  }
  noteOn(source: string, midi: number) {
    this.cancelPreview();
    this.playback = null;
    this.notes.delete(source);
    this.notes.set(source, {midi, syllable: this.options.nextSyllable?.()});
    this.reconcile();
  }
  noteOff(source: string) {
    if (this.notes.delete(source)) this.reconcile();
  }
  touch(source: string, on: boolean) {
    if (on) {
      this.cancelPreview();
      this.playback = null;
      this.touches.add(source);
    } else if (!this.touches.delete(source)) return;
    this.reconcile();
  }
  setLatch(on: boolean) {
    this.latch = on;
    if (!on) this.holding = false;
    this.reconcile();
  }
  sustain(on: boolean) {
    this.holding = on;
    if (on) { this.cancelPreview(); this.playback = null; }
    this.reconcile();
  }
  preview(midi: number, duration = 220) {
    if (this.notes.size || this.touches.size || this.holding) return;
    this.cancelPreview();
    this.playback = null;
    const note = {midi};
    this.notes.set('preview', note);
    this.reconcile(() => {
      if (this.notes.get('preview') !== note) return;
      this.previewTimer = setTimeout(() => { this.previewTimer = null; this.noteOff('preview'); }, duration);
    });
  }
  play(playback: Playback) {
    this.clearInputs();
    this.playback = playback;
    this.reconcile();
  }
  /** Saved shape/voice changes are read again on release, never restored from a stale snapshot. */
  patch(patch: Patch, tau = 25) {
    if (!this.audio.running || this.playback) return;
    if (this.livePhones) {
      this.audio.stopScore();
      this.livePhones = null;
      this.cues = [];
      this.audio.patch({...this.options.patch(), ...(this.applied ? {pitch: midiToHz(this.applied.midi)} : {})}, tau);
      this.audio.set('gate', this.sounding ? 1 : 0, 12);
      this.emit();
    }
    this.audio.patch(patch, tau);
  }
  completePlayback() {
    if (!this.playback || this.playback !== this.appliedPlayback) return;
    this.playback = null;
    this.appliedPlayback = null;
    this.cues = [];
    this.emit();
  }
  private clearInputs() {
    this.cancelPreview();
    this.notes.clear();
    this.touches.clear();
    this.holding = false;
  }
  stop = () => {
    ++this.revision;
    this.clearInputs();
    this.playback = null;
    this.applied = null;
    this.appliedPlayback = null;
    this.sounding = false;
    this.livePhones = null;
    this.cues = [];
    this.audio.silence();
    this.emit();
  };
  private reconcile(after?: () => void) {
    const revision = ++this.revision;
    const apply = () => {
      if (revision !== this.revision) return;
      if (this.playback) {
        if (this.playback === this.appliedPlayback) return;
        this.appliedPlayback = this.playback;
        const {score, loop, second, cues = []} = this.playback;
        this.livePhones = null;
        this.applied = null;
        this.sounding = false;
        this.cues = cues;
        if (second) this.audio.playDuet(score, second, loop);
        else this.audio.play(score, loop);
      } else {
        this.appliedPlayback = null;
        const note = [...this.notes.values()].at(-1) ?? null;
        const on = !!note || this.touches.size > 0 || this.holding;
        if (!on) {
          if (this.sounding && this.livePhones) this.audio.play(planLiveOff(this.livePhones, this.options.patch()));
          else if (this.sounding) this.audio.set('gate', 0, 40);
          this.livePhones = null;
          this.cues = [];
        } else if (!this.sounding || note !== this.applied) {
          this.audio.claim();
          if (note?.syllable?.phones.length) {
            const v = this.livePhones?.findIndex(p => isVowel(p.symbol)) ?? -1;
            const fromCoda = v >= 0 ? this.livePhones!.slice(v + 1) : [];
            const score = planLiveOn(note.syllable.phones, note.midi, this.options.patch(), {fromCoda, legato: this.sounding});
            this.audio.play(score);
            this.livePhones = note.syllable.phones;
            this.cues = [{text: note.syllable.text, midi: note.midi, start: 0, vowel: 0, end: score.length}];
          } else if (this.sounding && (note?.syllable || !note)) {
            if (note) this.audio.set('pitch', midiToHz(note.midi), 35);
          } else if (this.sounding && note && !this.livePhones) {
            this.audio.set('pitch', midiToHz(note.midi), 35);
          } else {
            this.audio.stopScore();
            this.audio.patch({...this.options.patch(), ...(note ? {pitch: midiToHz(note.midi)} : {})}, 20);
            this.audio.set('gate', 1, 12);
            this.livePhones = null;
            this.cues = [];
          }
        }
        this.applied = note;
        this.sounding = on;
      }
      this.emit();
      after?.();
    };
    this.emit();
    if (this.audio.running) apply();
    else if (this.playback || this.notes.size || this.touches.size || this.holding) {
      void this.options.ensureAudio().then(ok => { if (ok) apply(); });
    }
  }
}
